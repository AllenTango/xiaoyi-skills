---
project: xiaoyi-wsman
stage: review
progress: 100
last_updated: 2026-07-08
reviewed: true
tested: true
---
# xiaoyi-wsman — Workspace status manager

扫描固定结构 workspace 项目，输出 STATUS/AGENTS/README 三件套一致性 + 阶段统计。

## 当前进展
- [x] SKILL.md + AGENTS.md + templates/ 完整
- [x] scanner 真实测试：3 模式（human/json/issues-only）全部 work
- [x] npm 安全扫描：0 risk
- [x] 真实 scanner 验证（含异常项目检测）
- [x] 新增 `--show-ignored` flag
- [x] 配置文件 `.xiaoyi-wsman.config.json` 支持 ignore glob
- [x] 3 层过滤：hidden + 内置默认 + 用户配置
- [x] 完整测试套件（空/理想/异常/JSON/stale days/bad config/真实 repo）全通过
- [x] SKILL.md 加 "Ignoring Subdirectories" 段