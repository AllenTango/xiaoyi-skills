---
name: xiaoyi-wsman
version: 1.0.0
description: 管理固定结构 workspace（每个项目子目录含 STATUS.md / AGENTS.md / README.md）下多个项目的阶段、进度、调整落实与审核测试情况。在用户调用 /xiaoyi-wsman 或提及"项目进度/项目阶段/项目纳管/workspace 状态/STATUS.md/列出所有项目"时加载。
---

# xiaoyi-wsman

When loaded, you manage a workspace of projects. Each project is a top-level subdirectory containing `STATUS.md` (state), `AGENTS.md` (AI guidance), and `README.md` (human docs).

## Workspace Root

Track the current workspace root in this conversation as `<ws_root>`. Before answering any status/listing question, confirm `<ws_root>`. If unset, ask the user.

Persist `<ws_root>` to `<SKILL_DIR>/state.json` only when the user explicitly sets or switches it. Format:

```json
{ "ws_root": "/abs/path/to/workspace" }
```

Resolve `~` and relative paths to absolute before writing. Echo the absolute path back to the user and wait for confirmation before persisting. If `state.json` exists at the start of a new session, read it and confirm with the user.

`<SKILL_DIR>` is this skill's installed directory path (varies by installation).

## Five Stages

`idea → in-progress → review → done`, with `paused` reachable from any stage.

- `done` requires `reviewed: true` AND `tested: true` in `STATUS.md` frontmatter.
- "Reviewed/tested" means genuinely verified, not merely "code runs".
- `paused` projects need not update `last_updated`, but must document the reason.

## Workflow

### Listing / Status / Progress Questions

1. Run the scanner:
   ```bash
   node <SKILL_DIR>/scripts/xiaoyi-wsman-scan.js "$WS_ROOT"
   ```
   Add `--json` for structured consumption or `--issues-only` for exception-only output. The scanner is read-only.

2. Present results grouped by stage (idea / in-progress / review / done / paused).

3. For each project marked `!!` (has issues), list every issue on a separate line.

4. When the user asks about a specific project by name, open its `STATUS.md` for full context — the scanner shows only frontmatter, the body has more.

5. Never answer status questions without running the scanner first. Do not invent statuses from memory.

### Onboarding a Project ("纳管 / 初始化")

1. Confirm `<ws_root>` and that the target directory exists. Ask if not.

2. For each missing file, copy from the template and substitute placeholders:
   - `<SKILL_DIR>/templates/{STATUS,AGENTS,README}.md`
   - Replace `{{PROJECT_NAME}}` with the directory name.
   - Replace `{{TODAY}}` with today's `YYYY-MM-DD`.

3. Set the initial `stage` based on observed maturity:
   - Empty directory or only `方案.md` → `idea`.
   - Existing code without `STATUS.md` → conservatively `in-progress` (state your assumption to the user).

4. After onboarding, re-run the scanner to verify.

### Working Inside a Project

1. Before any work, read both `STATUS.md` and `AGENTS.md` of the project.

2. When the work changes scope or requirements, immediately append a row to the 「调整记录」section of `STATUS.md`, even before implementation.

3. After substantive work, force-write `STATUS.md`:
   - Update frontmatter: `stage`, `progress` (0–100), `last_updated`, `reviewed`, `tested`.
   - Update each pending 「调整记录」 entry with status: 已落实 / 部分落实 / 未落实.
   - Sync 「进度概览」 and 「待办 / 阻塞」.

4. If code changed and git has uncommitted changes when you update `STATUS.md`, remind the user to commit.

### Switching Workspace

Echo the new absolute path and write `state.json`. See "Workspace Root" above.

## Scanner Reference

```bash
node <SKILL_DIR>/scripts/xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only]
```

- `WORKSPACE_ROOT` defaults to the current directory.
- `--json` outputs a JSON array of `{name, stage, progress, last_updated, reviewed, tested, git, issues}`.
- `--issues-only` filters to projects with at least one issue.
- `WSMAN_STALE_DAYS` (default 30) sets the staleness threshold.

The scanner detects: missing files, invalid stage, `done` projects with `reviewed`/`tested` not true, `done` projects with dirty git, stale `STATUS.md`, and git-dirty projects with stale status.

## Truthfulness

Statuses must reflect reality. Do not mark `reviewed: true` if you have not actually reviewed, or `tested: true` without testing. The scanner will catch false claims when `git` is dirty or other artifacts don't match.

## Do Not

- Do not invent a workspace root. Ask if unknown.
- Do not write `source/` of managed projects (except onboarding) without explicit user direction.
- Do not modify `state.json` outside the explicit set/switch flow.
- Do not answer status questions without first running the scanner.