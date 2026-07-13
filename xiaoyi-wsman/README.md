# xiaoyi-wsman

面向代码与非代码项目的 workspace 状态管理技能。项目事实保存在各项目的 `STATUS.md`，工作区通过 `.xiaoyi-wsman.json` 配置自动发现、显式项目和忽略规则。

主要工作流与完整配置见 [`SKILL.md`](./SKILL.md)。扫描器保持只读：

```bash
node scripts/xiaoyi-wsman-scan.js /path/to/workspace --show-ignored
```
