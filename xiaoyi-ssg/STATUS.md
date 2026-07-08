---
project: xiaoyi-ssg
stage: in-progress
progress: 90
last_updated: 2026-07-08
reviewed: false
tested: true
---
# xiaoyi-ssg — Conversational static site generator

对话式静态站生成器。AI 通过 /xiaoyi-ssg 命令引导用户设计内容模型与设计 token，生成自管 pipeline。

## 当前进展
- [x] SKILL.md + AGENTS.md + prompts/ 完整
- [x] schemas/ JSON schema 校验通过
- [x] npm 安全扫描：0 risk
- [x] 真实 INIT_PIPELINE 测试（Case A blog + Case B portfolio）
- [x] 真实截图验证（4 张 / case，dark/light 都通过）
- [x] 发现并修复 9 个 bug（见 AGENTS.md 改动）
- [x] templates/conventions.md（强制 Eta 语法 / 变量绑定）
- [x] references/frontend-design-integration.md（CSS 模板库）
- [x] 5 步必做自测条款
- [x] SKILL.md Common Pitfalls 段
- [ ] 等待社区 review + 合并