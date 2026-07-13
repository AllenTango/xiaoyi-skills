import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const scanner = new URL('../scripts/xiaoyi-wsman-scan.js', import.meta.url).pathname;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function futureDate(days = 7) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), 'xiaoyi-wsman-'));
}

function writeProject(root, name, overrides = {}) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  const fields = {
    project: name,
    kind: 'code',
    stage: 'active',
    health: 'green',
    priority: 'P2',
    progress: '40',
    last_updated: today(),
    next_review: futureDate(),
    next_action: '完成下一项可验证工作',
    blocked_by: '',
    paused_reason: '',
    review_status: 'pending',
    verification_status: 'pending',
    ...overrides
  };
  const frontmatter = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n');
  writeFileSync(join(path, 'STATUS.md'), `---\n${frontmatter}\n---\n# ${name}\n`);
  writeFileSync(join(path, 'AGENTS.md'), `# AGENTS - ${name}\n`);
  writeFileSync(join(path, 'README.md'), `# ${name}\n`);
  return path;
}

function scan(root, ...args) {
  const output = execFileSync(process.execPath, [scanner, root, '--json', ...args], { encoding: 'utf8' });
  return JSON.parse(output);
}

function codes(project) {
  return project.issues.map(item => item.code);
}

test('scans a healthy project and reports configured ignores', () => {
  const root = makeWorkspace();
  writeProject(root, 'healthy');
  mkdirSync(join(root, 'temp-cache'));
  writeFileSync(join(root, '.xiaoyi-wsman.json'), JSON.stringify({ ignore: ['temp-*'] }));

  const result = scan(root);
  assert.equal(result.summary.total, 1);
  assert.equal(result.projects[0].name, 'healthy');
  assert.deepEqual(result.projects[0].issues, []);
  assert.equal(result.ignored.find(item => item.name === 'temp-cache').rule, 'temp-*');
});

test('diagnoses missing actions, blockers, pause reasons, and invalid progress', () => {
  const root = makeWorkspace();
  writeProject(root, 'waiting', { stage: 'waiting', next_action: '', blocked_by: '', progress: '101' });
  writeProject(root, 'paused', { stage: 'paused', paused_reason: '' });

  const result = scan(root);
  const waiting = result.projects.find(project => project.name === 'waiting');
  const paused = result.projects.find(project => project.name === 'paused');
  assert.ok(codes(waiting).includes('blocked-by-missing'));
  assert.ok(codes(waiting).includes('next-action-missing'));
  assert.ok(codes(waiting).includes('progress-invalid'));
  assert.ok(codes(paused).includes('paused-reason-missing'));
});

test('supports configured nested and external projects without top-level discovery', () => {
  const root = makeWorkspace();
  const nestedRoot = join(root, 'group');
  const externalRoot = makeWorkspace();
  writeProject(nestedRoot, 'nested-project', { kind: 'research' });
  const external = writeProject(externalRoot, 'external-project', { kind: 'content' });
  writeFileSync(join(root, '.xiaoyi-wsman.json'), JSON.stringify({
    discover_top_level: false,
    projects: [
      { path: './group/nested-project' },
      { path: external, name: 'external-alias' }
    ]
  }));

  const result = scan(root);
  assert.equal(result.summary.total, 2);
  assert.deepEqual(result.projects.map(project => project.name).sort(), ['external-project', 'nested-project']);
  assert.ok(result.projects.every(project => project.source === 'configured'));
});

test('scopes git dirty state to each project in a shared parent repository', () => {
  const root = makeWorkspace();
  const alpha = writeProject(root, 'alpha');
  const beta = writeProject(root, 'beta');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture']);
  writeFileSync(join(beta, 'README.md'), '# beta changed\n');

  const result = scan(root);
  assert.equal(result.projects.find(project => project.path === alpha).git, 'clean');
  assert.equal(result.projects.find(project => project.path === beta).git, 'dirty');
});

test('reads legacy stage and completion fields while requesting migration', () => {
  const root = makeWorkspace();
  const path = writeProject(root, 'legacy');
  writeFileSync(join(path, 'STATUS.md'), `---
project: legacy
stage: in-progress
progress: 20
last_updated: ${today()}
reviewed: false
tested: false
---
# legacy
`);

  const result = scan(root);
  const project = result.projects[0];
  assert.equal(project.stage, 'active');
  assert.ok(codes(project).includes('legacy-stage'));
  assert.ok(codes(project).includes('legacy-reviewed'));
  assert.ok(codes(project).includes('legacy-tested'));
});

test('issues-only filters projects but keeps the full summary', () => {
  const root = makeWorkspace();
  writeProject(root, 'healthy');
  writeProject(root, 'broken', { stage: 'waiting', blocked_by: '' });

  const result = scan(root, '--issues-only');
  assert.equal(result.summary.total, 2);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].name, 'broken');
});
