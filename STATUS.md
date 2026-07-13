---
project: xiaoyi-skills
kind: code
stage: active
health: green
priority: P2
progress:
last_updated: 2026-07-13
next_review: 2026-07-20
next_action: "审查并提交 xiaoyi-wsman 的 v1.1 变更"
blocked_by: ""
paused_reason: ""
review_status: passed
verification_status: passed
---

# xiaoyi-skills - 状态

## 目标与完成标准

- 目标：维护可复用、可验证、可安装的个人 AI skills。
- 完成标准：每个技能结构有效、行为有验证证据、说明与实现一致并可被技能 CLI 发现。
- 不在范围内：在技能仓库中保存被管理项目的业务运行状态。

## 进度概览

### 已验证事实

- 仓库当前包含 `xiaoyi-ssg` 与 `xiaoyi-wsman` 两个技能。
- `xiaoyi-wsman` 已加入通用项目模型、工作区配置、忽略规则、外部项目和路径级 Git 检测。
- `xiaoyi-wsman` 自动测试 6/6 通过，skill 结构校验通过。
- 当前仓库存在尚未提交的 `xiaoyi-wsman` 调整。

### 当前工作

- 真实 `/Users/tango/Workspace` 已完成纳管与复盘验收：5 个项目、4 个忽略目录、0 条诊断。

### 下一步

- 审查并提交 `xiaoyi-wsman` 的 v1.1 变更。

## 调整记录

| 日期 | 调整 / 决策 | 来源 | 落实状态 | 备注 |
|------|-------------|------|----------|------|
| 2026-07-13 | 将技能仓库作为工作区组合中的一个项目纳管 | 用户/AI | 已落实 | 子技能继续保留各自 STATUS.md |

## 阻塞与风险

- 阻塞：无。
- 风险：仓库当前 dirty，提交前需检查所有变更边界。

## 审核与验证

- 审核状态：passed
- 验证状态：passed
- 验证证据：子技能测试 6/6 通过；真实工作区复扫为 5 个项目、0 error、0 warning、0 info。

## 待确认

- [ ] 工作区验收完成后是否提交并发布新版技能。
