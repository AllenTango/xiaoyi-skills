#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { argv, cwd, env, exit } from 'node:process';

const CONFIG_NAME = '.xiaoyi-wsman.json';
const LEGACY_CONFIG_NAME = '.xiaoyi-wsman.config.json';
const VALID_KINDS = new Set(['code', 'content', 'research', 'learning', 'operations', 'other']);
const VALID_STAGES = new Set(['idea', 'planning', 'active', 'waiting', 'review', 'paused', 'done', 'archived']);
const VALID_HEALTH = new Set(['green', 'yellow', 'red', 'unknown']);
const VALID_PRIORITY = new Set(['P0', 'P1', 'P2', 'P3', 'P4']);
const VALID_CHECK_STATUS = new Set(['pending', 'passed', 'failed', 'not-applicable']);
const STAGE_ORDER = ['active', 'waiting', 'review', 'planning', 'idea', 'paused', 'done', 'archived', 'unknown'];
const DEFAULT_STALE_DAYS = { idea: 60, planning: 30, active: 14, waiting: 30, review: 14 };
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache', '.venv', 'venv',
  '__pycache__', 'target', 'Pods', '.gradle', '.idea', '.vscode'
]);
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
const HEALTH_RANK = { red: 0, yellow: 1, unknown: 2, green: 3 };

function printUsage() {
  console.log(`用法: node xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only] [--show-ignored]

只读扫描代码与非代码项目，输出项目组合状态和一致性诊断。

参数:
  WORKSPACE_ROOT    workspace 根目录；默认当前目录
  --json            输出结构化 JSON 对象
  --issues-only     文本和 JSON 中只展示有诊断的项目
  --show-ignored    文本输出中列出被忽略目录
  -h, --help        显示帮助

配置文件: WORKSPACE_ROOT/${CONFIG_NAME}
环境变量: WSMAN_STALE_DAYS 可覆盖所有活跃阶段的陈旧天数
`);
}

function parseArgs(args) {
  const options = { workspaceRoot: '', json: false, issuesOnly: false, showIgnored: false };
  for (const arg of args) {
    if (arg === '--json') options.json = true;
    else if (arg === '--issues-only') options.issuesOnly = true;
    else if (arg === '--show-ignored') options.showIgnored = true;
    else if (arg === '-h' || arg === '--help') {
      printUsage();
      exit(0);
    } else if (arg.startsWith('-')) {
      console.error(`未知参数: ${arg}`);
      exit(2);
    } else if (!options.workspaceRoot) {
      options.workspaceRoot = arg;
    } else {
      console.error(`多余参数: ${arg}`);
      exit(2);
    }
  }
  options.workspaceRoot = resolve(options.workspaceRoot || cwd());
  return options;
}

function issue(severity, code, message) {
  return { severity, code, message };
}

function readJson(path, configIssues) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    configIssues.push(issue('error', 'config-invalid-json', `${path} 解析失败: ${error.message}`));
    return {};
  }
}

function globToRegex(pattern) {
  let prefix = false;
  let value = pattern.trim().replaceAll('\\', '/');
  if (value.endsWith('/**')) {
    value = value.slice(0, -3);
    prefix = true;
  } else if (value.endsWith('/')) {
    value = value.slice(0, -1);
    prefix = true;
  }
  let source = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '*' && value[index + 1] === '*') {
      source += '.*';
      index++;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+*.]/g, '\\$&');
  }
  return new RegExp(`^${source}${prefix ? '(?:/.*)?' : ''}$`);
}

function normalizeConfig(root) {
  const configIssues = [];
  const configPath = join(root, CONFIG_NAME);
  const legacyPath = join(root, LEGACY_CONFIG_NAME);
  let raw = {};

  if (existsSync(configPath)) raw = readJson(configPath, configIssues);
  else if (existsSync(legacyPath)) {
    raw = readJson(legacyPath, configIssues);
    configIssues.push(issue('info', 'legacy-config', `请将 ${LEGACY_CONFIG_NAME} 迁移为 ${CONFIG_NAME}`));
  }

  const config = {
    discoverTopLevel: raw.discover_top_level !== false,
    projects: [],
    ignore: [],
    ignoreMatchers: [],
    staleDays: { ...DEFAULT_STALE_DAYS }
  };

  if (raw.projects !== undefined && !Array.isArray(raw.projects)) {
    configIssues.push(issue('error', 'config-projects-type', 'projects 必须是数组'));
  } else {
    for (const [index, entry] of (raw.projects || []).entries()) {
      const item = typeof entry === 'string' ? { path: entry } : entry;
      if (!item || typeof item.path !== 'string' || !item.path.trim()) {
        configIssues.push(issue('error', 'config-project-invalid', `projects[${index}] 缺少有效 path`));
        continue;
      }
      if (item.enabled === false) continue;
      config.projects.push({
        path: isAbsolute(item.path) ? resolve(item.path) : resolve(root, item.path),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
      });
    }
  }

  if (raw.ignore !== undefined && !Array.isArray(raw.ignore)) {
    configIssues.push(issue('error', 'config-ignore-type', 'ignore 必须是字符串数组'));
  } else {
    for (const [index, pattern] of (raw.ignore || []).entries()) {
      if (typeof pattern !== 'string' || !pattern.trim()) {
        configIssues.push(issue('warning', 'config-ignore-invalid', `ignore[${index}] 不是有效字符串`));
        continue;
      }
      config.ignore.push(pattern);
      config.ignoreMatchers.push({ pattern, regex: globToRegex(pattern) });
    }
  }

  if (Number.isInteger(raw.stale_days) && raw.stale_days > 0) {
    for (const stage of Object.keys(config.staleDays)) config.staleDays[stage] = raw.stale_days;
  } else if (raw.stale_days && typeof raw.stale_days === 'object' && !Array.isArray(raw.stale_days)) {
    for (const [stage, days] of Object.entries(raw.stale_days)) {
      if (!VALID_STAGES.has(stage) || !Number.isInteger(days) || days <= 0) {
        configIssues.push(issue('warning', 'config-stale-invalid', `忽略无效 stale_days.${stage}: ${days}`));
      } else config.staleDays[stage] = days;
    }
  } else if (raw.stale_days !== undefined) {
    configIssues.push(issue('warning', 'config-stale-type', 'stale_days 必须是正整数或阶段到天数的对象'));
  }

  const environmentDays = Number.parseInt(env.WSMAN_STALE_DAYS, 10);
  if (Number.isInteger(environmentDays) && environmentDays > 0) {
    for (const stage of Object.keys(config.staleDays)) config.staleDays[stage] = environmentDays;
  }
  return { config, configIssues, configPath: existsSync(configPath) ? configPath : null };
}

function ignoredReason(name, config) {
  if (name.startsWith('.')) return { reason: '隐藏目录', rule: '<built-in:hidden>' };
  if (DEFAULT_IGNORE_DIRS.has(name)) return { reason: '内置默认忽略', rule: `<built-in:${name}>` };
  for (const matcher of config.ignoreMatchers) {
    if (matcher.regex.test(name)) return { reason: '用户配置忽略', rule: matcher.pattern };
  }
  return null;
}

function discoverProjects(root, config, configIssues) {
  const projects = new Map();
  const ignored = [];

  if (config.discoverTopLevel) {
    for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const ignoredBy = ignoredReason(entry.name, config);
      if (ignoredBy) {
        ignored.push({ path: join(root, entry.name), name: entry.name, ...ignoredBy });
        continue;
      }
      const path = join(root, entry.name);
      projects.set(path, { path, configured_name: '', source: 'discovered' });
    }
  }

  for (const configured of config.projects) {
    const previous = projects.get(configured.path);
    projects.set(configured.path, {
      path: configured.path,
      configured_name: configured.name || previous?.configured_name || '',
      source: previous ? 'discovered+configured' : 'configured'
    });
  }

  if (!config.discoverTopLevel && config.projects.length === 0) {
    configIssues.push(issue('warning', 'no-project-sources', 'discover_top_level=false 且未配置 projects'));
  }
  return { projectEntries: [...projects.values()], ignored };
}

function parseFrontmatter(filePath) {
  if (!existsSync(filePath)) return { values: {}, diagnostics: [] };
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  const diagnostics = [];
  if (lines[0]?.trim() !== '---') {
    return { values: {}, diagnostics: [issue('error', 'frontmatter-missing', 'STATUS.md 缺少起始 frontmatter 分隔符')] };
  }
  const values = {};
  let closed = false;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === '---') {
      closed = true;
      break;
    }
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) {
      diagnostics.push(issue('warning', 'frontmatter-line-invalid', `frontmatter 第 ${index + 1} 行不是 key: value`));
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(values, key)) diagnostics.push(issue('warning', 'frontmatter-duplicate-key', `frontmatter 字段重复: ${key}`));
    values[key] = value;
  }
  if (!closed) diagnostics.push(issue('error', 'frontmatter-unclosed', 'STATUS.md frontmatter 未闭合'));
  return { values, diagnostics };
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function daysSince(date) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayUtc - date.getTime()) / 86400000);
}

function getGitState(projectPath) {
  try {
    execFileSync('git', ['-C', projectPath, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    const output = execFileSync(
      'git', ['-C', projectPath, 'status', '--porcelain', '--untracked-files=normal', '--', '.'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return output.trim() ? 'dirty' : 'clean';
  } catch {
    return 'no-git';
  }
}

function normalizedStage(rawStage, diagnostics) {
  if (rawStage === 'in-progress') {
    diagnostics.push(issue('info', 'legacy-stage', 'stage=in-progress 已按 active 处理，请迁移字段'));
    return 'active';
  }
  if (!rawStage) {
    diagnostics.push(issue('error', 'stage-missing', 'stage 缺失'));
    return 'unknown';
  }
  if (!VALID_STAGES.has(rawStage)) {
    diagnostics.push(issue('error', 'stage-invalid', `stage 非法: ${rawStage}`));
    return 'unknown';
  }
  return rawStage;
}

function checkEnum(values, key, validValues, diagnostics, fallback = '') {
  const value = values[key];
  if (!value) {
    diagnostics.push(issue('warning', `${key}-missing`, `${key} 缺失`));
    return fallback;
  }
  if (!validValues.has(value)) {
    diagnostics.push(issue('error', `${key}-invalid`, `${key} 非法: ${value}`));
    return fallback;
  }
  return value;
}

function scanProject(entry, config, workspaceRoot) {
  const diagnostics = [];
  if (!existsSync(entry.path) || !statSync(entry.path).isDirectory()) {
    diagnostics.push(issue('error', 'project-path-missing', `项目目录不存在: ${entry.path}`));
    return {
      name: entry.configured_name || basename(entry.path), path: entry.path, source: entry.source,
      kind: 'unknown', stage: 'unknown', health: 'unknown', priority: 'P4', progress: '',
      last_updated: '', next_review: '', next_action: '', blocked_by: '', paused_reason: '',
      review_status: '', verification_status: '', git: 'no-git', issues: diagnostics
    };
  }

  const statusPath = join(entry.path, 'STATUS.md');
  if (!existsSync(statusPath)) diagnostics.push(issue('error', 'status-missing', '缺少 STATUS.md'));
  if (!existsSync(join(entry.path, 'AGENTS.md'))) diagnostics.push(issue('warning', 'agents-missing', '缺少 AGENTS.md'));
  if (!existsSync(join(entry.path, 'README.md'))) diagnostics.push(issue('warning', 'readme-missing', '缺少 README.md'));

  const parsed = parseFrontmatter(statusPath);
  diagnostics.push(...parsed.diagnostics);
  const values = parsed.values;
  const stage = normalizedStage(values.stage, diagnostics);
  const kind = checkEnum(values, 'kind', VALID_KINDS, diagnostics, 'unknown');
  const health = checkEnum(values, 'health', VALID_HEALTH, diagnostics, 'unknown');
  const priority = checkEnum(values, 'priority', VALID_PRIORITY, diagnostics, 'P4');

  let progress = values.progress || '';
  if (progress && (!/^\d+$/.test(progress) || Number(progress) < 0 || Number(progress) > 100)) {
    diagnostics.push(issue('error', 'progress-invalid', `progress 必须为空或 0-100 整数: ${progress}`));
  } else if (progress) progress = Number(progress);

  const lastUpdated = parseDate(values.last_updated);
  if (!values.last_updated) diagnostics.push(issue('error', 'last-updated-missing', 'last_updated 缺失'));
  else if (!lastUpdated) diagnostics.push(issue('error', 'last-updated-invalid', `last_updated 日期非法: ${values.last_updated}`));
  else if (config.staleDays[stage] && daysSince(lastUpdated) > config.staleDays[stage]) {
    diagnostics.push(issue('warning', 'status-stale', `状态已 ${daysSince(lastUpdated)} 天未更新，阈值为 ${config.staleDays[stage]} 天`));
  }

  const nextReview = parseDate(values.next_review);
  if (values.next_review && !nextReview) diagnostics.push(issue('error', 'next-review-invalid', `next_review 日期非法: ${values.next_review}`));
  else if (['planning', 'active', 'waiting', 'review'].includes(stage) && !values.next_review) {
    diagnostics.push(issue('warning', 'next-review-missing', `${stage} 项目缺少 next_review`));
  } else if (nextReview && !['done', 'archived'].includes(stage) && daysSince(nextReview) > 0) {
    diagnostics.push(issue('warning', 'review-overdue', `项目复盘已逾期 ${daysSince(nextReview)} 天`));
  }

  if (['planning', 'active', 'waiting', 'review'].includes(stage) && !values.next_action) {
    diagnostics.push(issue('warning', 'next-action-missing', `${stage} 项目缺少 next_action`));
  }
  if (stage === 'waiting' && !values.blocked_by) diagnostics.push(issue('error', 'blocked-by-missing', 'waiting 项目缺少 blocked_by'));
  if (stage === 'paused' && !values.paused_reason) diagnostics.push(issue('error', 'paused-reason-missing', 'paused 项目缺少 paused_reason'));

  let reviewStatus = values.review_status || '';
  let verificationStatus = values.verification_status || '';
  if (!reviewStatus && values.reviewed) {
    reviewStatus = values.reviewed === 'true' ? 'passed' : 'pending';
    diagnostics.push(issue('info', 'legacy-reviewed', 'reviewed 已兼容读取，请迁移为 review_status'));
  }
  if (!verificationStatus && values.tested) {
    verificationStatus = values.tested === 'true' ? 'passed' : 'pending';
    diagnostics.push(issue('info', 'legacy-tested', 'tested 已兼容读取，请迁移为 verification_status'));
  }
  if (!reviewStatus) diagnostics.push(issue('warning', 'review-status-missing', 'review_status 缺失'));
  else if (!VALID_CHECK_STATUS.has(reviewStatus)) diagnostics.push(issue('error', 'review-status-invalid', `review_status 非法: ${reviewStatus}`));
  if (!verificationStatus) diagnostics.push(issue('warning', 'verification-status-missing', 'verification_status 缺失'));
  else if (!VALID_CHECK_STATUS.has(verificationStatus)) diagnostics.push(issue('error', 'verification-status-invalid', `verification_status 非法: ${verificationStatus}`));

  if (stage === 'done') {
    if (verificationStatus !== 'passed') diagnostics.push(issue('error', 'done-not-verified', 'done 要求 verification_status=passed'));
    if (!['passed', 'not-applicable'].includes(reviewStatus)) diagnostics.push(issue('error', 'done-not-reviewed', 'done 要求 review_status=passed 或 not-applicable'));
  }

  const git = getGitState(entry.path);
  if (stage === 'done' && kind === 'code' && git === 'dirty') {
    diagnostics.push(issue('warning', 'done-git-dirty', '已完成的代码项目仍有未提交变化'));
  }

  diagnostics.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.code.localeCompare(b.code));
  return {
    name: values.project || entry.configured_name || basename(entry.path), path: entry.path,
    relative_path: relative(workspaceRoot, entry.path) || '.', source: entry.source,
    kind, stage, health, priority, progress, last_updated: values.last_updated || '',
    next_review: values.next_review || '', next_action: values.next_action || '',
    blocked_by: values.blocked_by || '', paused_reason: values.paused_reason || '',
    review_status: reviewStatus, verification_status: verificationStatus, git, issues: diagnostics
  };
}

function summarize(projects, configIssues) {
  const byStage = Object.fromEntries(STAGE_ORDER.map(stage => [stage, 0]));
  const byHealth = { green: 0, yellow: 0, red: 0, unknown: 0 };
  const diagnostics = { error: 0, warning: 0, info: 0 };
  for (const project of projects) {
    byStage[project.stage] = (byStage[project.stage] || 0) + 1;
    byHealth[project.health] = (byHealth[project.health] || 0) + 1;
    for (const item of project.issues) diagnostics[item.severity]++;
  }
  for (const item of configIssues) diagnostics[item.severity]++;
  return {
    total: projects.length,
    projects_with_issues: projects.filter(project => project.issues.length).length,
    by_stage: byStage,
    by_health: byHealth,
    diagnostics
  };
}

function compareProjects(a, b) {
  return STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
    || HEALTH_RANK[a.health] - HEALTH_RANK[b.health]
    || Number(a.priority.slice(1)) - Number(b.priority.slice(1))
    || a.name.localeCompare(b.name);
}

function printText(result, showIgnored) {
  for (const configIssue of result.config_issues) {
    console.log(`[${configIssue.severity.toUpperCase()}] config/${configIssue.code}: ${configIssue.message}`);
  }
  if (result.config_issues.length) console.log('');

  let currentStage = '';
  for (const project of result.projects) {
    if (project.stage !== currentStage) {
      currentStage = project.stage;
      console.log(`## ${currentStage}`);
    }
    const progress = project.progress === '' ? '?' : `${project.progress}%`;
    console.log(`${project.issues.length ? '!!' : '  '} ${project.name} [${project.priority}/${project.health}] progress=${progress} git=${project.git} updated=${project.last_updated || '?'}`);
    if (project.next_action) console.log(`   next: ${project.next_action}`);
    for (const item of project.issues) console.log(`   - [${item.severity}] ${item.code}: ${item.message}`);
  }

  console.log('');
  console.log(`================ 汇总 (${result.workspace}) ================`);
  console.log(`项目: ${result.summary.total}  有诊断: ${result.summary.projects_with_issues}  error=${result.summary.diagnostics.error} warning=${result.summary.diagnostics.warning} info=${result.summary.diagnostics.info}`);
  console.log(`阶段: ${Object.entries(result.summary.by_stage).filter(([, count]) => count).map(([stage, count]) => `${stage}=${count}`).join(' ') || '无项目'}`);
  console.log(`健康度: red=${result.summary.by_health.red} yellow=${result.summary.by_health.yellow} green=${result.summary.by_health.green} unknown=${result.summary.by_health.unknown}`);
  console.log(`忽略: ${result.ignored.length}`);

  if (showIgnored && result.ignored.length) {
    console.log('');
    console.log('## 已忽略目录');
    for (const item of result.ignored) console.log(`- ${item.name}: ${item.reason} (${item.rule})`);
  }
}

const options = parseArgs(argv.slice(2));
if (!existsSync(options.workspaceRoot) || !statSync(options.workspaceRoot).isDirectory()) {
  console.error(`workspace 根目录不存在: ${options.workspaceRoot}`);
  exit(1);
}

const { config, configIssues, configPath } = normalizeConfig(options.workspaceRoot);
const { projectEntries, ignored } = discoverProjects(options.workspaceRoot, config, configIssues);
const allProjects = projectEntries.map(entry => scanProject(entry, config, options.workspaceRoot)).sort(compareProjects);
const result = {
  workspace: options.workspaceRoot,
  config_path: configPath,
  projects: options.issuesOnly ? allProjects.filter(project => project.issues.length) : allProjects,
  summary: summarize(allProjects, configIssues),
  ignored,
  config_issues: configIssues
};

if (options.json) console.log(JSON.stringify(result, null, 2));
else printText(result, options.showIgnored);
