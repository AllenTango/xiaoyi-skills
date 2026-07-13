---
name: xiaoyi-wsman
description: 管理代码与非代码项目组成的 workspace，以每个项目的 STATUS.md 为事实源，执行项目纳管、状态更新、组合视图、陈旧与阻塞检查、周度复盘及完成验证。在用户显式调用 /xiaoyi-wsman、提及 xiaoyi-wsman，或要求查看/更新项目进度、项目阶段、项目健康度、项目纳管、workspace 状态、STATUS.md、所有项目、周度项目复盘时使用。
---

# xiaoyi-wsman

把项目文件作为长期记忆，不依赖对话记忆。以每个项目的 `STATUS.md` 为事实源；扫描结果是事实源的汇总，不替代事实源。

## 确定工作区

按以下顺序确定 `<ws_root>`：

1. 使用用户明确指定的目录。
2. 若当前目录或其父目录存在 `.xiaoyi-wsman.json`，使用该文件所在目录。
3. 若当前目录包含多个项目目录，使用当前目录并说明判断依据。
4. 仍无法确定时询问用户，不猜测路径。

把持久配置写入 `<ws_root>/.xiaoyi-wsman.json`，不要向技能安装目录写入 `state.json` 或其他运行状态。

## 项目事实模型

使用以下项目类型：`code | content | research | learning | operations | other`。

使用以下阶段：

`idea -> planning -> active -> review -> done -> archived`

`waiting` 和 `paused` 可从未完成阶段进入。旧值 `in-progress` 视为 `active`，并提示迁移。

核心字段：

- `health`: `green | yellow | red | unknown`
- `priority`: `P0 | P1 | P2 | P3 | P4`
- `progress`: 可选的 `0-100` 整数；没有客观依据时留空，不编造百分比
- `next_action`: 一个明确、可执行的下一步
- `blocked_by`: `waiting` 项目的等待对象或条件
- `paused_reason`: `paused` 项目的暂停原因
- `review_status`: `pending | passed | failed | not-applicable`
- `verification_status`: `pending | passed | failed | not-applicable`

只有完成标准已被验证，才能进入 `done`。`done` 要求 `verification_status: passed`，并要求 `review_status` 为 `passed` 或 `not-applicable`。测试是代码项目的验证方式之一，不是所有项目的统一要求。

## 操作流程

### 查看项目组合

1. 每次状态、进度或项目列表请求都先运行扫描器：

   ```bash
   node <SKILL_DIR>/scripts/xiaoyi-wsman-scan.js "<ws_root>"
   ```

2. 需要结构化数据时添加 `--json`；只看异常时添加 `--issues-only`；审计忽略规则时添加 `--show-ignored`。
3. 按阶段汇总，并优先展示 `error`、`warning`、红黄健康度、P0/P1 和已逾期项目。
4. 用户询问单个项目时，继续读取其完整 `STATUS.md` 与 `AGENTS.md`。
5. 不从记忆回答项目状态，不把计划或推断表述为已完成事实。

### 纳管项目

1. 确认项目目录与 `<ws_root>`。
2. 只为缺失文件复制 `templates/STATUS.md`、`templates/AGENTS.md`、`templates/README.md`，替换 `{{PROJECT_NAME}}` 和 `{{TODAY}}`。
3. 根据实际成熟度设置 `kind` 与 `stage`；无法判断的字段使用 `unknown` 或留空，并明确待确认项。
4. 非一级子目录或工作区外项目写入 `.xiaoyi-wsman.json` 的 `projects`。
5. 重新运行扫描器验证纳管结果。

### 更新项目

1. 开工前读取项目的 `STATUS.md` 与 `AGENTS.md`。
2. 范围、目标或完成标准变化时，先在「调整记录」追加记录。
3. 完成实质性工作后更新 frontmatter、进度概览、下一步、阻塞、调整记录和验证证据。
4. 区分四类信息：已验证事实、用户陈述、AI 推断、下一步计划。推断不得直接升级为完成事实。
5. 代码变化后记录实际执行的审核/测试命令与结果；未执行则保持 `pending`。
6. 更新后重新扫描。Git 有未提交变化时说明影响，但不要擅自提交。

### 周度复盘

1. 用 `--json` 扫描完整组合。
2. 检查陈旧项目、逾期复盘、阻塞、缺少下一步、阶段与验证不一致的项目。
3. 对每个活跃项目确认：目标是否仍有效、最近事实、唯一下一步、阻塞、健康度和下次复盘日期。
4. 只在用户确认或已有事实证据时修改状态；不确定项列为待确认。

## 工作区配置

在 `<ws_root>/.xiaoyi-wsman.json` 中配置：

```json
{
  "discover_top_level": true,
  "projects": [
    { "path": "./nested/project" },
    { "path": "/absolute/path/to/external-project", "name": "external-project" }
  ],
  "ignore": ["temp-*", "archive/"],
  "stale_days": {
    "idea": 60,
    "planning": 30,
    "active": 14,
    "waiting": 30,
    "review": 14
  }
}
```

- `discover_top_level` 默认为 `true`。
- `projects` 接受路径字符串或 `{ "path", "name", "enabled" }`；相对路径基于 `<ws_root>`。
- 显式项目可位于嵌套目录或工作区外；`enabled: false` 可暂时停用。
- `ignore` 作用于自动发现的一级目录。隐藏目录和常见构建目录始终忽略。
- 继续读取旧 `.xiaoyi-wsman.config.json` 的 `ignore`，但提示迁移。

## 扫描器

```bash
node <SKILL_DIR>/scripts/xiaoyi-wsman-scan.js [WORKSPACE_ROOT] [--json] [--issues-only] [--show-ignored]
```

扫描器必须保持只读。`--json` 输出包含 `workspace`、`projects`、`summary`、`ignored` 和 `config_issues` 的对象。诊断使用 `error | warning | info`，并提供稳定的 `code`。

## 真实性约束

- 不虚构工作区、进度、验证、阻塞解除或完成状态。
- 不因为 Git clean 就认为项目已完成，也不因为有文件改动就推断业务进展。
- 不把 `progress: 100` 等同于 `done`。
- 不在未读取事实源、未运行扫描器时回答状态问题。
- 不自动修改被管理项目的业务文件；只在用户要求执行项目工作或纳管时写入。
