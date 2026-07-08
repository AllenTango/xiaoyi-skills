#!/usr/bin/env node
/**
 * xiaoyi-wsman-scan.js — 扫描 workspace，输出准确的项目状态全局视图。
 *
 * 替代旧的 bash + PowerShell 双脚本。
 * 行为对齐：相同的输入/输出/校验规则。
 * 只读：本脚本不修改任何文件。
 *
 * 用法:
 *   node xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only] [--show-ignored]
 *
 *   WORKSPACE_ROOT   被管理的 workspace 根目录。省略时默认当前目录。
 *   --json           以 JSON 数组输出（供程序/AI 结构化消费）。
 *   --issues-only    只输出存在异常的项目。
 *   --show-ignored   在文本输出底部列出被忽略的子目录及其匹配规则。
 *
 * 项目识别规则:
 *   WORKSPACE_ROOT 下的每个一级子目录视为一个项目。
 *   隐藏目录（以 . 开头）默认被忽略。
 *   用户可通过 WORKSPACE_ROOT/.xiaoyi-wsman.config.json 中的 `ignore` 字段添加额外忽略规则（glob）。
 *
 * 每个项目读取其 STATUS.md 的 YAML frontmatter:
 *   project / stage / progress / last_updated / reviewed / tested
 * 合法 stage: idea | in-progress | review | done | paused
 *
 * 一致性校验（标记为 ISSUE）:
 *   - 缺少 STATUS.md / AGENTS.md / README.md
 *   - stage 缺失或非法
 *   - stage=done 但 git 工作区有未提交改动
 *   - stage=done 但 reviewed/tested 不为 true
 *   - last_updated 超过 STALE_DAYS（默认 30）天
 *   - git 有未提交改动但 STATUS.md 长期未更新
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { execSync } from 'child_process';
import { argv, cwd, env, exit } from 'process';

const STALE_DAYS_DEFAULT = 30;
const VALID_STAGES = new Set(['idea', 'in-progress', 'review', 'done', 'paused']);

// ---------- 内置默认忽略（无需用户配置） ----------
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.DS_Store',
  'target',     // Java/Rust
  'Pods',       // iOS
  '.gradle',
  '.idea',
  '.vscode',
]);

// ---------- 参数解析 ----------

function printUsage() {
  console.log(`用法: node xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only] [--show-ignored]

扫描 workspace，输出准确的项目状态全局视图。

参数:
  WORKSPACE_ROOT    被管理的 workspace 根目录。省略时默认当前目录。
  --json            以 JSON 数组输出。
  --issues-only     只输出存在异常的项目。
  --show-ignored    在文本输出底部列出被忽略的子目录及其匹配规则。
  -h, --help        显示帮助。

环境变量:
  WSMAN_STALE_DAYS  多少天未更新视为陈旧（默认 30）。

忽略规则（按优先级合并）:
  1. 内置默认：node_modules / .git / dist / build / .next / venv / __pycache__ 等
  2. .xiaoyi-wsman.config.json 中的 ignore 字段（glob 数组）
  3. 隐藏目录（. 开头）

  配置示例 .xiaoyi-wsman.config.json:
  {
    "ignore": ["ssg-demo-*", "scripts/dev", "archive"]
  }
`);
}

const args = argv.slice(2);
let outputJson = false;
let issuesOnly = false;
let showIgnored = false;
let workspaceRoot = '';

for (const arg of args) {
  if (arg === '--json') outputJson = true;
  else if (arg === '--issues-only') issuesOnly = true;
  else if (arg === '--show-ignored') showIgnored = true;
  else if (arg === '-h' || arg === '--help') { printUsage(); exit(0); }
  else if (arg.startsWith('-')) {
    console.error(`未知参数: ${arg}`);
    exit(2);
  } else if (!workspaceRoot) {
    workspaceRoot = arg;
  } else {
    console.error(`未知参数: ${arg}`);
    exit(2);
  }
}

if (!workspaceRoot) workspaceRoot = cwd();
workspaceRoot = resolve(workspaceRoot);

if (!existsSync(workspaceRoot) || !statSync(workspaceRoot).isDirectory()) {
  console.error(`错误: workspace 根目录不存在: ${workspaceRoot}`);
  exit(1);
}

const staleDays = parseInt(env.WSMAN_STALE_DAYS, 10) || STALE_DAYS_DEFAULT;
const nowEpoch = Math.floor(Date.now() / 1000);

// ---------- 忽略配置 ----------

/**
 * Read .xiaoyi-wsman.config.json from workspace root and extract `ignore` array.
 * Returns empty array if file missing or malformed (logs warning).
 */
function loadIgnoreConfig(root) {
  const cfgPath = join(root, '.xiaoyi-wsman.config.json');
  if (!existsSync(cfgPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    if (!raw || !Array.isArray(raw.ignore)) return [];
    return raw.ignore.filter(p => typeof p === 'string' && p.trim().length > 0);
  } catch (e) {
    console.warn(`[warn] ${cfgPath} 解析失败: ${e.message}（已忽略配置）`);
    return [];
  }
}

/**
 * Convert a glob-like pattern to a RegExp.
 * Supports:
 *   *       → [^/]*
 *   **      → .*
 *   ?       → .
 *   [abc]   → character class (passthrough)
 *   patterns ending with / or /** → prefix match (any descendant)
 */
function globToRegex(pattern) {
  // strip trailing /** or / → prefix match
  let prefixMode = false;
  let p = pattern;
  if (p.endsWith('/**') || p.endsWith('/')) {
    p = p.replace(/\/?(\*\*)?$/, '');
    prefixMode = true;
  }
  // escape regex specials except * ? [ ]
  p = p.replace(/[.+^${}()|\\]/g, '\\$&');
  // ** must be replaced before single *
  p = p.replace(/\*\*/g, '\x00DOUBLESTAR\x00');
  p = p.replace(/\*/g, '[^/]*');
  p = p.replace(/\x00DOUBLESTAR\x00/g, '.*');
  p = p.replace(/\?/g, '.');
  if (prefixMode) return new RegExp('^' + p + '(/.*)?$');
  return new RegExp('^' + p + '$');
}

/**
 * Returns the rule that caused a directory to be skipped, or null.
 * Checked order:
 *   1. Hidden (starts with .)
 *   2. DEFAULT_IGNORE_DIRS
 *   3. User-configured ignore patterns
 */
function ignoredReason(name, userIgnoreGlobs) {
  if (name.startsWith('.')) return { reason: 'hidden (starts with .)', rule: '<built-in: hidden>' };
  if (DEFAULT_IGNORE_DIRS.has(name)) {
    return { reason: '内置默认忽略', rule: `<built-in: ${name}>` };
  }
  for (const pattern of userIgnoreGlobs) {
    const re = globToRegex(pattern);
    if (re.test(name)) {
      return { reason: '用户配置忽略', rule: `config.ignore: "${pattern}"` };
    }
  }
  return null;
}

// ---------- 工具函数 ----------

/**
 * 从 STATUS.md 的 YAML frontmatter 中提取某个 key 的值（首行 --- 与 次行 --- 之间）。
 * 仅支持简单 scalar 字符串/数字，不解析嵌套结构。
 */
function readFrontmatterValue(filePath, key) {
  if (!existsSync(filePath)) return '';
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  let inFm = false;
  for (const line of lines) {
    if (!inFm) {
      if (/^---\s*$/.test(line)) inFm = true;
      continue;
    }
    if (/^---\s*$/.test(line)) return '';
    if (/^\s*$/.test(line)) continue;
    const idx = line.indexOf(':');
    if (idx > 0) {
      const name = line.substring(0, idx).trim();
      let val = line.substring(idx + 1).trim();
      // 去除首尾引号
      val = val.replace(/^["']|["']$/g, '');
      if (name === key) return val;
    }
  }
  return '';
}

/**
 * 计算 YYYY-MM-DD 距今天数；非法返回空字符串。
 */
function daysSince(dateStr) {
  if (!dateStr) return '';
  const epoch = Math.floor(new Date(dateStr).getTime() / 1000);
  if (isNaN(epoch)) return '';
  return Math.floor((nowEpoch - epoch) / 86400);
}

/**
 * 检测目录是否为 git 仓库（或位于某个 git 仓库内）且有未提交改动。
 * 返回 'clean' | 'dirty' | 'no-git'
 */
function getGitDirty(dir) {
  try {
    execSync(`git -C "${dir}" rev-parse --is-inside-work-tree`, { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return 'no-git';
  }
  try {
    const status = execSync(`git -C "${dir}" status --porcelain`, { encoding: 'utf-8' });
    return status.trim() ? 'dirty' : 'clean';
  } catch {
    return 'no-git';
  }
}

/**
 * JSON 字符串转义。
 */
function jsonEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------- 扫描 ----------

const userIgnoreGlobs = loadIgnoreConfig(workspaceRoot);

const subdirs = readdirSync(workspaceRoot, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

const keptDirs = [];
const ignoredDirs = [];

for (const name of subdirs) {
  const reason = ignoredReason(name, userIgnoreGlobs);
  if (reason) {
    ignoredDirs.push({ name, ...reason });
  } else {
    keptDirs.push(name);
  }
}

let total = 0;
let issueCount = 0;
let countIdea = 0;
let countInProgress = 0;
let countReview = 0;
let countDone = 0;
let countPaused = 0;
let countUnknown = 0;

const jsonItems = [];
const textRows = [];

for (const name of keptDirs) {
  total++;
  const dirPath = join(workspaceRoot, name);
  const statusFile = join(dirPath, 'STATUS.md');
  const issues = [];

  // 缺失文件检查
  if (!existsSync(join(dirPath, 'STATUS.md'))) issues.push('缺少 STATUS.md');
  if (!existsSync(join(dirPath, 'AGENTS.md'))) issues.push('缺少 AGENTS.md');
  if (!existsSync(join(dirPath, 'README.md'))) issues.push('缺少 README.md');

  // 读取 frontmatter
  const project = readFrontmatterValue(statusFile, 'project') || name;
  let stage = readFrontmatterValue(statusFile, 'stage');
  const progress = readFrontmatterValue(statusFile, 'progress');
  const lastUpdated = readFrontmatterValue(statusFile, 'last_updated');
  const reviewedRaw = readFrontmatterValue(statusFile, 'reviewed');
  const testedRaw = readFrontmatterValue(statusFile, 'tested');
  const reviewed = reviewedRaw === 'true';
  const tested = testedRaw === 'true';

  // stage 校验
  if (!stage) {
    issues.push('stage 缺失');
  } else if (!VALID_STAGES.has(stage)) {
    issues.push(`stage 非法: ${stage}`);
    stage = 'unknown';
  }

  // git 状态
  const git = getGitDirty(dirPath);

  // 陈旧检查
  const stale = daysSince(lastUpdated);
  if (lastUpdated && stale !== '' && stale > staleDays) {
    issues.push(`last_updated 距今 ${stale} 天（> ${staleDays}）`);
  }

  // git 脏 + 长期未更新联动
  if (git === 'dirty' && lastUpdated && stale !== '' && stale > staleDays) {
    issues.push(`git 有未提交改动且 STATUS.md 长期未更新（${stale} 天）`);
  }

  // done 阶段强校验
  if (stage === 'done') {
    if (!reviewed) issues.push('stage=done 但 reviewed=false');
    if (!tested) issues.push('stage=done 但 tested=false');
    if (git === 'dirty') issues.push('stage=done 但 git 工作区 dirty');
  }

  // paused 检查
  if (stage === 'paused') {
    // paused 不强制 last_updated 新鲜，但应记录原因（如果有 reason 字段更好）
    if (!lastUpdated) {
      issues.push('paused 项目缺少 last_updated（建议补 paused 日期）');
    }
  }

  // 统计
  if (issues.length) issueCount++;
  if (stage === 'idea') countIdea++;
  else if (stage === 'in-progress') countInProgress++;
  else if (stage === 'review') countReview++;
  else if (stage === 'done') countDone++;
  else if (stage === 'paused') countPaused++;
  else countUnknown++;

  const jsonItem = {
    name,
    stage,
    progress,
    last_updated: lastUpdated,
    reviewed: reviewedRaw,
    tested: testedRaw,
    git,
    issues
  };
  jsonItems.push(jsonItem);

  // 文本行（限定宽度，避免错位）
  const issueMark = issues.length ? '!!' : '  ';
  const stageCell = (stage || '?').padEnd(12);
  const progressCell = (progress || '?').padStart(3);
  const reviewedCell = (reviewed ? 'true' : '?').padStart(7);
  const testedCell = (tested ? 'true' : '?').padEnd(6);
  const gitCell = git.padEnd(8);
  const updatedCell = lastUpdated || '?';
  textRows.push({ mark: issueMark, name: name.padEnd(24), stage: stageCell, progress: progressCell, reviewed: reviewedCell, tested: testedCell, git: gitCell, updated: updatedCell, issues });
}

// ---------- 输出 ----------

if (outputJson) {
  console.log(JSON.stringify(jsonItems));
} else {
  if (!issuesOnly) {
    for (const r of textRows) {
      console.log(`${r.mark} ${r.name} ${r.stage} progress=${r.progress} reviewed=${r.reviewed} tested=${r.tested} git=${r.git} updated=${r.updated}`);
      for (const iss of r.issues) {
        console.log(`     - ${iss}`);
      }
    }
  } else {
    for (const r of textRows) {
      if (!r.issues.length) continue;
      console.log(`${r.mark} ${r.name} ${r.stage} progress=${r.progress} reviewed=${r.reviewed} tested=${r.tested} git=${r.git} updated=${r.updated}`);
      for (const iss of r.issues) {
        console.log(`     - ${iss}`);
      }
    }
  }

  console.log('');
  console.log(`================ 汇总 (${workspaceRoot}) ================`);
  console.log(`项目总数: ${total}    异常项目: ${issueCount}`);
  console.log(`按阶段: 想法(idea)=${countIdea}  进行中(in-progress)=${countInProgress}  待审核(review)=${countReview}  已完成(done)=${countDone}  搁置(paused)=${countPaused}  未知(unknown)=${countUnknown}`);
  console.log(`忽略: ${ignoredDirs.length} 个目录（hidden/默认/配置）` + (userIgnoreGlobs.length ? ` · 配置规则: ${userIgnoreGlobs.length} 条` : ' · 未读取到 .xiaoyi-wsman.config.json'));
  console.log('(行首 \'!!\' 表示该项目存在需关注的异常)');

  if (showIgnored && ignoredDirs.length) {
    console.log('');
    console.log(`---------------- 忽略的目录 (${ignoredDirs.length}) ----------------`);
    for (const ig of ignoredDirs) {
      console.log(`  ${ig.name.padEnd(30)}  → ${ig.reason}  [${ig.rule}]`);
    }
  }
}