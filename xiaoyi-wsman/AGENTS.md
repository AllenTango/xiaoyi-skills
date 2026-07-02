# AGENTS — xiaoyi-wsman 开发指导

本文件用于开发/维护 `xiaoyi-wsman`（位于 `<SKILL_DIR>`）时的 AI 协作约定。**它不是被管理项目的指导**（被管理项目的指导使用 `templates/AGENTS.md`）。

## 路径约定

- **`<SKILL_DIR>`**：本 skill 自身的目录绝对路径，随用户安装位置而变（如 `~/workspace/skills/xiaoyi-wsman/`、`~/.opencode/skills/xiaoyi-wsman/` 等）。本文中所有指向本 skill 自身文件的位置统一用 `<SKILL_DIR>` 占位。开发者本机的 `<SKILL_DIR>` 不影响通用约定。

## 范围与边界

- 本 skill 自身的代码、文档、脚本、模板存放在 `<SKILL_DIR>` 内。
- **被管理的 workspace 不在此目录**。workspace 由用户在对话中指定，路径可能与 `<SKILL_DIR>` 完全无关。
- 不要在 `<SKILL_DIR>` 内创建被管理的"项目"——这里只是 skill 自身。

## 核心约定

1. **不动用户 workspace**：除经用户**明确指示**通过模板初始化项目外，AI 不主动在用户 workspace 内写入任何文件。
2. **脚本只读**：`scripts/xiaoyi-wsman-scan.sh` 必须是只读的。任何修改文件的工作由 AI 用 Edit/Write 工具完成，不通过脚本。
3. **state.json 仅记录 ws_root**：用户指定/切换 workspace 时写入；写入前必须回显绝对路径并得到用户确认。仅此一字段，不掺杂其它状态。
4. **模板稳定**：`templates/` 下的三个文件是契约。修改前需考虑向后兼容（已在管理中的项目依赖现有 frontmatter 字段）。
5. **五阶段是硬约束**：`idea | in-progress | review | done | paused`。`done` 前 `reviewed`/`tested` 必须为 `true`。脚本已实现此校验，新增校验时对齐脚本与 SKILL.md 的语义。

## 文件职责

| 文件 | 职责 | 修改触发 |
|------|------|----------|
| `SKILL.md` | 技能定义、frontmatter、工作流 | 工作流/触发词变更 |
| `README.md` | 人读使用说明 | 用法或安装步骤变更 |
| `AGENTS.md` | 本文件：开发 AI 协作约定 | 开发约定变更 |
| `templates/STATUS.md` | 状态文件模板（项目用） | 阶段字段或 frontmatter 变更 |
| `templates/AGENTS.md` | AI 指导模板（项目用） | 项目级 AI 协作约定变更 |
| `templates/README.md` | README 模板（项目用） | 项目级 README 约定变更 |
| `scripts/xiaoyi-wsman-scan.sh` | bash 版扫描校验脚本（Linux/macOS/Git Bash/WSL，bash 3.2+） | 新增校验规则或输出格式变更 |
| `scripts/xiaoyi-wsman-scan.ps1` | PowerShell 版扫描校验脚本（Windows 原生 / pwsh） | 同上；修改时必须与 .sh 行为等价 |
| `state.json` | 持久化当前 workspace 根 | 用户在对话中指定/切换 workspace |

## 扩展校验规则

如需在扫描脚本中新增一致性校验（同步影响 `.sh` 与 `.ps1` 两份）：

1. 在 SKILL.md 的「三、阶段流转与硬约束」先描述规则（用户视角）。
2. 在两个脚本的「一致性校验」注释列表登记规则名（机读视角）。
3. 实现脚本逻辑：先检查 status 文件存在再访问 frontmatter；issue 描述清晰、可读；JSON 输出字段顺序保持一致。
4. 在 SKILL.md「四、扫描脚本用法」中更新示例（如有必要）。

## 跨平台约束（脚本层面）

`.sh` 与 `.ps1` 是**等价**的两个实现，行为必须一致：

- 输出字段：`name / stage / progress / last_updated / reviewed / tested / git / issues`。
- 异常类型、阶段判定、`STALE_DAYS` 默认值、隐藏目录忽略规则，全部对齐。
- 修改任一版本时，**必须**同步另一版本（哪怕仅改措辞）。同步前不允许只发一版。

`.sh` 的兼容性底线：**bash 3.2+**。不允许使用 `declare -A`、低版本不兼容的内建。Linux/macOS 自带 bash 均要可运行。

## 测试

修改脚本后，至少用以下情况自测：

1. **空 workspace**：0 个项目，输出"项目总数: 0"。
2. **理想 workspace**：每个项目 STATUS.md 完整、stage=done 且 reviewed/tested=true 且 git clean。
3. **异常 workspace**：故意缺文件、stage=done 但 git dirty、stage=done 但 reviewed=false —— 验证每条 issue 都被列出（不重复不漏列）。
4. **macOS 兼容**：在 Linux 上用 `bash -c 'BASH_COMPAT=32 bash xiaoyi-wsman-scan.sh ...'` 模拟 macOS bash 3.2，验证不报 `declare: -A: invalid option` 等错误。

测试 workspace 可放在 `/tmp/wsman-*`，结束后清理。

若 PowerShell (`pwsh`) 在开发环境可用，额外对 `.ps1` 跑同一组测试。