---
project: xiaoyi-wsman
kind: code
stage: review
health: green
priority: P2
progress: 100
last_updated: 2026-07-13
next_review: 2026-07-20
next_action: "审查并提交 v1.1 变更，观察一周后复盘默认阈值"
blocked_by: ""
paused_reason: ""
review_status: passed
verification_status: passed
---

# xiaoyi-wsman - Workspace 状态管理器

## 目标与完成标准

- 目标：让 AI 以本地文件为长期记忆，统一管理代码与非代码项目的状态、下一步、阻塞和复盘。
- 完成标准：支持自动发现与显式项目、可靠诊断、路径级 Git 检测、旧格式迁移和可重复测试。
- 不在范围内：替代具体项目的业务工具，或根据聊天记忆自动宣称项目完成。

## 进度概览

### 已验证事实

- 已更新 `SKILL.md`、项目模板和维护约定。
- 已支持 `.xiaoyi-wsman.json`、嵌套/外部项目与旧 ignore 配置兼容。
- 已加入项目类型、健康度、优先级、下一步、阻塞和通用验证状态。
- 已将 Git 检测限定到当前项目路径，并改用参数化进程调用。
- 已加入 `error/warning/info` 诊断、阶段化陈旧阈值和 JSON 组合视图。
- 6 个 Node 测试已通过，覆盖正常扫描、诊断、外部项目、Git 隔离、旧格式和 issues-only。

### 当前工作

- 真实 `/Users/tango/Workspace` 项目组合验收已完成：纳管 5 个项目，忽略 4 个非项目目录，复扫无诊断。

### 下一步

- 审查并提交 v1.1 变更，观察一周后复盘默认阈值。

## 调整记录

| 日期 | 调整 / 决策 | 来源 | 落实状态 | 备注 |
|------|-------------|------|----------|------|
| 2026-07-13 | 从代码 workspace 扫描器扩展为通用项目组合事实管理器 | 用户/AI | 已落实 | 保持旧字段读取兼容 |
| 2026-07-13 | 配置迁移到工作区 `.xiaoyi-wsman.json` | AI | 已落实 | 不再向技能目录写运行状态 |
| 2026-07-13 | 增加显式项目注册和路径级 Git 检测 | AI | 已落实 | 已由自动测试验证 |

## 阻塞与风险

- 阻塞：无。
- 风险：旧项目在迁移新 frontmatter 字段前会产生兼容提示和缺失字段警告。

## 审核与验证

- 审核状态：passed
- 验证状态：passed
- 验证证据：`npm test` 6/6 通过，`quick_validate.py` 返回 `Skill is valid!`；真实 workspace 复扫为 5 个项目、0 error、0 warning、0 info。

## 待确认

- [ ] 实际使用一周后评估默认陈旧阈值是否合适。
