#!/usr/bin/env node
/**
 * xiaoyi-wsman-scan.js — 扫描 workspace，输出准确的项目状态全局视图。
 *
 * 替代旧的 bash + PowerShell 双脚本。
 * 行为对齐：相同的输入/输出/校验规则。
 * 只读：本脚本不修改任何文件。
 *
 * 用法:
 *   node xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only]
 *
 *   WORKSPACE_ROOT   被管理的 workspace 根目录。省略时默认当前目录。
 *   --json           以 JSON 数组输出（供程序/AI 结构化消费）。
 *   --issues-only    只输出存在异常的项目。
 *
 * 项目识别规则:
 *   WORKSPACE_ROOT 下的每个一级子目录视为一个项目。
 *   隐藏目录（以 . 开头）被忽略。
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

// ---------- 参数解析 ----------

function printUsage() {
  console.log(`用法: node xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only]

扫描 workspace，输出准确的项目状态全局视图。

参数:
  WORKSPACE_ROOT   被管理的 workspace 根目录。省略时默认当前目录。
  --json           以 JSON 数组输出。
  --issues-only    只输出存在异常的项目。
  -h, --help       显示帮助。

环境变量:
  WSMAN_STALE_DAYS   多少天未更新视为陈旧（默认 30）。
`);
}

const args = argv.slice(2);
let outputJson = false;
let issuesOnly = false;
let workspaceRoot = '';

for (const arg of args) {
  if (arg === '--json') outputJson = true;
  else if (arg === '--issues-only') issuesOnly = true;
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

const subdirs = readdirSync(workspaceRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'))
  .map(d => d.name)
  .sort();

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

for (const name of subdirs) {
  total++;
  const dirPath = join(workspaceRoot, name);
  const statusFile = join(dirPath, 'STATUS.md');
  const issues = [];

  // 缺失文件检查
  if (!existsSync(join(dirPath, 'STATUS.md'))) issues.push('缺少 STATUS.md');
  if (!existsSync(join(dirPath, 'AGENTS.md'))) issues.push('缺少 AGENTS.md');
  if (!existsSync(join(dirPath, 'README.md'))) issues.push('缺少 README.md');

  // 解析 frontmatter
  const stage = readFrontmatterValue(statusFile, 'stage');
  const progress = readFrontmatterValue(statusFile, 'progress');
  const lastUpdated = readFrontmatterValue(statusFile, 'last_updated');
  const reviewed = readFrontmatterValue(statusFile, 'reviewed');
  const tested = readFrontmatterValue(statusFile, 'tested');

  // 阶段校验
  let stageKey;
  if (!stage) {
    if (existsSync(statusFile)) issues.push('stage 缺失');
    stageKey = 'unknown';
  } else if (VALID_STAGES.has(stage)) {
    stageKey = stage;
  } else {
    issues.push(`stage 非法: ${stage}`);
    stageKey = 'unknown';
  }

  // 阶段计数
  switch (stageKey) {
    case 'idea':         countIdea++; break;
    case 'in-progress':  countInProgress++; break;
    case 'review':       countReview++; break;
    case 'done':         countDone++; break;
    case 'paused':       countPaused++; break;
    default:             countUnknown++; break;
  }

  const dirty = getGitDirty(dirPath);
  const age = daysSince(lastUpdated);

  // done 阶段的硬约束
  if (stage === 'done') {
    if (dirty === 'dirty') issues.push('stage=done 但 git 有未提交改动');
    if (reviewed !== 'true') issues.push('stage=done 但 reviewed 非 true');
    if (tested !== 'true') issues.push('stage=done 但 tested 非 true');
  }

  // 陈旧判定（仅对非 done/paused）
  if (age !== '' && parseInt(age, 10) > staleDays && stage !== 'done' && stage !== 'paused') {
    issues.push(`STATUS 已 ${age} 天未更新(>${staleDays})`);
  }

  // git dirty 且 STATUS 超过 7 天未更新
  if (dirty === 'dirty' && age !== '' && parseInt(age, 10) > 7) {
    issues.push(`git 有改动但 STATUS ${age} 天未更新`);
  }

  const hasIssue = issues.length > 0;
  if (hasIssue) issueCount++;

  if (outputJson) {
    // JSON 模式：构造字段顺序对齐旧版（name, stage, progress, last_updated, reviewed, tested, git, issues）
    const issuesJson = issues.length === 0
      ? '[]'
      : '[' + issues.map(it => `"${jsonEscape(it)}"`).join(',') + ']';
    const item = '{' +
      `"name":"${jsonEscape(name)}",` +
      `"stage":"${jsonEscape(stage)}",` +
      `"progress":"${jsonEscape(progress)}",` +
      `"last_updated":"${jsonEscape(lastUpdated)}",` +
      `"reviewed":"${jsonEscape(reviewed)}",` +
      `"tested":"${jsonEscape(tested)}",` +
      `"git":"${jsonEscape(dirty)}",` +
      `"issues":${issuesJson}` +
      '}';
    jsonItems.push(item);
  } else {
    if (issuesOnly && !hasIssue) continue;
    const mark = hasIssue ? '!!' : '  ';
    const stageDisp = stage || '?';
    const progressDisp = progress || '?';
    const reviewedDisp = reviewed || '?';
    const testedDisp = tested || '?';
    const updatedDisp = lastUpdated || '?';
    let row = `${mark} ${name.padEnd(24)} stage=${stageDisp.padEnd(12)} progress=${progressDisp.padEnd(5)} reviewed=${reviewedDisp.padEnd(5)} tested=${testedDisp.padEnd(5)} git=${dirty.padEnd(6)} updated=${updatedDisp}`;
    textRows.push(row);
    for (const it of issues) {
      textRows.push(`     - ${it}`);
    }
  }
}

// ---------- 输出 ----------

if (outputJson) {
  console.log('[' + jsonItems.join(',') + ']');
} else {
  for (const row of textRows) console.log(row);
  console.log('');
  console.log(`================ 汇总 (${workspaceRoot}) ================`);
  console.log(`项目总数: ${total}    异常项目: ${issueCount}`);
  console.log(`按阶段: 想法(idea)=${countIdea}  进行中(in-progress)=${countInProgress}  待审核(review)=${countReview}  已完成(done)=${countDone}  搁置(paused)=${countPaused}  未知(unknown)=${countUnknown}`);
  console.log(`(行首 '!!' 表示该项目存在需关注的异常)`);
}

exit(0);