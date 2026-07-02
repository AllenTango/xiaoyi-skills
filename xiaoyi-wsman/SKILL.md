---
name: xiaoyi-wsman
description: 管理固定结构 workspace（每个项目子目录含 STATUS.md / AGENTS.md / README.md）下多个项目的阶段、进度、调整落实与审核测试情况。仅在用户通过 slash 命令（如 /xiaoyi-wsman）显式调用本 skill 时加载；不要基于本描述自动触发，不要因"列出项目 / 切换目录 / 进度如何"等普通措辞自动加载。
---

# xiaoyi-wsman — Workspace 项目管理

解决痛点：无法清晰知道 workspace 下"有哪些项目 / 各项目阶段 / 进度 / 调整是否落实 / 审核测试情况"。

## 核心约定（先理解）

- **workspace 结构**：`~/WORKSPACE/项目X/` —— workspace 根目录下，每个一级子目录视为一个项目。隐藏目录被忽略。
- **每个项目必含三文件**（位于项目根）：
  - `STATUS.md` —— 状态的**唯一信息源**。含 YAML frontmatter（机读）+ 正文（人读）。
  - `AGENTS.md` —— AI 协作指导。
  - `README.md` —— 人读说明。
- **五阶段**：`idea | in-progress | review | done | paused`。标记 `done` 前，`reviewed` 与 `tested` 必须为 `true`。
- **真实性原则**：状态必须反映真实情况。AI 不得为求好看而虚标。脚本会校验一致性并标记异常。
- **`<SKILL_DIR>` 占位符**：本 skill 安装后的目录绝对路径。随安装方式不同，可能为 `~/workspace/skills/xiaoyi-wsman/`、`~/.opencode/skills/xiaoyi-wsman/`、`~/.claude/skills/xiaoyi-wsman/` 或其它位置。下文示例统一用 `<SKILL_DIR>` 占位，使用前由 AI 解析为实际绝对路径。

> 工作流要求只列要点即可。AI 在回答任何"项目状态/进度"类问题前，**先运行扫描脚本**，再以脚本输出为依据作答 —— 保证结果准确。

## 一、Workspace 的指定与切换

workspace 根目录由用户在**对话中指定**，可随时切换。AI 必须在每次回答状态类问题前，确认当前 workspace 根。

**触发语（示意）**：
- "workspace 在 `~/workspace`" / "管理 `~/projects`" —— **设置** workspace 根。
- "切换到 `~/other-ws`" / "换到 `~/work`" —— **切换** workspace 根。
- "workspace 是哪" —— **告知**当前 workspace 根。

**实现方式**：

1. **本对话内**：在每次对话中，AI 用 `<ws_root>` 这一心智变量记录当前 workspace 根；用户未指定时，先反问确认（不能凭空假设）。
2. **跨会话持久化**：将当前 workspace 根写入 `<SKILL_DIR>/state.json`（`{"ws_root": "<path>"}`）。新会话开始时若本目录已存在 `state.json`，优先读取并向用户确认；用户也可在开场直接指定覆盖。
3. **路径解析**：使用前展开 `~`、相对路径转绝对路径，并用 `cd && pwd` 验证存在。**禁止**用任何 AI 自己编造的路径。

**持久化文件位置**：`<SKILL_DIR>/state.json`

```json
{ "ws_root": "/abs/path/to/workspace" }
```

写入规则：
- 仅在用户**明确**指定/切换 workspace 时写入。
- 写入前向用户回显解析后的**绝对路径**并确认。
- 文件不存在时正常（视为未指定，反问即可）。

## 二、工作流

### A. 用户说"列一下项目 / 进度如何 / 有哪些项目"

1. 确认 `<ws_root>`（参见第一节）。未指定则反问。
2. 运行（按平台选择脚本）：
   - bash 环境：`bash <SKILL_DIR>/scripts/xiaoyi-wsman-scan.sh "$WS_ROOT"`
   - PowerShell 环境：`pwsh <SKILL_DIR>/scripts/xiaoyi-wsman-scan.ps1 "$WS_ROOT"`

   加 `--json` / `-Json` 输出版（结构化消费时使用）。
3. 基于脚本输出作答：
   - 先给"按阶段分组"的汇总（idea / in-progress / review / done / paused）。
   - 再列**异常项目**（行首 `!!`）并逐条说明。
   - 用户问"项目 X 进度如何"时，单独打开该项目的 `STATUS.md`（脚本仅展示 frontmatter，正文有更多细节）。
4. **禁止**在未运行脚本前作答。

### B. 用户说"把项目 X 纳管 / 初始化项目"

1. 确认 `<ws_root>` 下是否存在 `项目X/`；不存在则反问路径。
2. 检测是否已含 `STATUS.md` / `AGENTS.md` / `README.md`：缺失的用 `templates/` 填充。
   - 模板路径：`<SKILL_DIR>/templates/{STATUS,AGENTS,README}.md`
   - 替换 `{{PROJECT_NAME}}` → 项目目录名；`{{TODAY}}` → 当天 `YYYY-MM-DD`。
3. 若项目内只有 `方案.md` / 仅有空目录 → 阶段设为 `idea`。
4. 若项目已有代码但无 `STATUS.md` → 根据代码成熟度初始化 `stage`（无依据时保守设为 `in-progress`）并明确告知用户初始化假设。
5. 完成后**再跑一次扫描**，确认初始化无误。

### C. 进入某个项目工作 / 用户说"在项目 X 中加个功能 / 修个 bug"

1. cd 到项目目录；先读 `STATUS.md` 与 `AGENTS.md`。
2. 工作过程中若涉及"调整方案/新增需求/变更范围"，**立刻**在 `STATUS.md` 的「调整记录」追加一行（即使未落实也先记录）。
3. 实质性工作完成后，**强制回写** `STATUS.md`：
   - 更新 frontmatter：`stage` / `progress`（0-100）/`last_updated` / `reviewed` / `tested`。
   - 「调整记录」中此前追加的变更更新落实状态（已落实/部分落实/未落实）。
   - 「进度概览」「待办 / 阻塞」同步。
4. 若改动了代码且 STATUS 更新前 git 有未提交改动，提示用户提交。

### D. 用户说"切换 workspace"

参见第一节。向用户回显新的绝对路径并写入 `state.json`。

## 三、阶段流转与硬约束

```
idea  →  in-progress  →  review  →  done
   ↘                              ↙
            paused  ←———————
```

- 进入 `done` 前必须满足：`reviewed: true` 且 `tested: true`。
- 进入 `review`：代码已写完，等待人/AI 审核与测试。
- 进入 `paused`：`last_updated` 可不更新，但需在「待办/阻塞」中记录原因。
- `reviewed` / `tested` 含义：经人为或 AI 完整地复核/测试通过。**仅"代码能跑"不等于 reviewed/tested**。

## 四、扫描脚本用法

脚本是**只读**的；任何写操作都发生在 AI 调用 Edit/Write 工具时。

提供两个等价版本，覆盖全平台：

| 平台 | 脚本 | 解释器要求 |
|------|------|-----------|
| Linux / macOS / Windows (Git Bash / WSL) | `scripts/xiaoyi-wsman-scan.sh` | bash 3.2+（兼容 macOS 默认 bash） |
| Windows 原生 / 跨平台 PowerShell | `scripts/xiaoyi-wsman-scan.ps1` | PowerShell 5.1+（Win10 自带）或 PowerShell 7+ |

**AI 选择规则**：根据当前 shell 环境选择对应脚本：
- 看到 `$PSVersionTable` 或 `pwsh` / `powershell` → `xiaoyi-wsman-scan.ps1`
- 否则 → `xiaoyi-wsman-scan.sh`
- 不确定时先 `uname -a` / `$PSVersionTable.PSVersion` 判断，再调用。

### bash 版本

```bash
# 文本表格（人类可读）
bash <SKILL_DIR>/scripts/xiaoyi-wsman-scan.sh "$WS_ROOT"

# JSON（AI 结构化消费）
bash <SKILL_DIR>/scripts/xiaoyi-wsman-scan.sh "$WS_ROOT" --json

# 只看异常
bash <SKILL_DIR>/scripts/xiaoyi-wsman-scan.sh "$WS_ROOT" --issues-only
```

### PowerShell 版本

```powershell
# 文本表格
pwsh <SKILL_DIR>/scripts/xiaoyi-wsman-scan.ps1 "$WS_ROOT"

# Windows PowerShell（5.1）也行
powershell -File <SKILL_DIR>/scripts/xiaoyi-wsman-scan.ps1 "$WS_ROOT" -IssuesOnly

# JSON
pwsh <SKILL_DIR>/scripts/xiaoyi-wsman-scan.ps1 "$WS_ROOT" -Json
```

参数：
- 位置参数 `[WorkspaceRoot]`：workspace 根，默认当前目录。
- `-Json` / `-IssuesOnly`：开关参数，对应 bash 版的 `--json` / `--issues-only`。

### 共用环境变量

- `WSMAN_STALE_DAYS` —— 多少天未更新视为陈旧（默认 30）。

### 输出字段（两版本一致）

`name / stage / progress / last_updated / reviewed / tested / git / issues` —— AI 解析其中任一版本即可。

## 五、常见指令（用于引导用户）

- "workspace 在 `~/workspace`" —— 设置。
- "切换到 `~/projects`" —— 切换。
- "列出所有项目" / "项目进度如何" —— 工作流 A。
- "把 `~/workspace/项目3` 纳管" —— 工作流 B。
- "在 `项目1` 加个 xxx" —— 工作流 C（开始时按 C 处理）。
- "跑一下扫描" / "检查一致性" —— 工作流 A（侧重异常）。

## 六、本 skill 自身文件结构

```
<SKILL_DIR>/
├── SKILL.md         # 本文件
├── AGENTS.md        # 本 skill 开发/维护时的 AI 指导
├── README.md        # 本 skill 的人读说明
├── state.json       # 当前 workspace 根（持久化，可选）
├── templates/       # 纳管项目时使用的标准模板
│   ├── STATUS.md
│   ├── AGENTS.md
│   └── README.md
└── scripts/
    ├── xiaoyi-wsman-scan.sh     # bash 3.2+（Linux / macOS / Git Bash / WSL）
    └── xiaoyi-wsman-scan.ps1    # PowerShell 5.1+（Windows 原生 / 跨平台 pwsh）
```

skill 自身目录 `<SKILL_DIR>` 是**只与本 skill 相关的存放位置**；被管理的 workspace 由用户在对话中指定，与 `<SKILL_DIR>` 完全无关。两者通过本 skill 解耦。