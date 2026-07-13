# AGENTS - xiaoyi-wsman skill 开发指导

本目录是技能自身，不是被管理项目的示例。

## 维护约定

- 修改脚本或模板前先读取 `SKILL.md` 与本文件。
- 保持扫描器只读；测试只能在临时目录创建 fixture。
- 同步维护阶段、字段、配置格式、模板、扫描器和测试。
- 新增诊断时提供稳定的 `code`、明确的 `severity` 和对应测试。
- 修改后在 `scripts/` 运行 `npm test`，再执行真实工作区扫描与 skill `quick_validate.py`。
