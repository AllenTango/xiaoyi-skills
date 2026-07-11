---
project: xiaoyi-ssg
stage: in-progress
progress: 90
last_updated: 2026-07-09
reviewed: false
tested: true
---
# xiaoyi-ssg — 对话式站点交付技能

对话式站点交付技能。AI 通过 /xiaoyi-ssg 命令引导用户设计内容模型与设计 token，生成项目本地的内容、设计、渲染、预览与发布管线；静态托管兼容产物是输出能力，不是产品定位。

## 当前进展

- [x] SKILL.md + AGENTS.md + prompts/ 完整
- [x] schemas/ JSON schema 校验通过
- [x] npm 安全扫描：0 risk
- [x] 真实 INIT_PIPELINE 测试（Case A blog + Case B portfolio）
- [x] 真实截图验证（4 张 / case，dark/light 都通过）
- [x] 发现并修复 9 个 bug（v1.0.0 阶段）
- [x] v1.0.0 后扩展：TAKE_OVER_EXISTING 拆分为三个子流程
  - Sub-flow A：xiaoyi-ssg → xiaoyi-ssg（已存在项目合并）
  - Sub-flow B：其他站点 / 静态导出项目 → xiaoyi-ssg（Hugo/Jekyll/Hexo/Eleventy/Astro/Next 静态导出/纯 HTML 等任意站点项目迁入）
  - Sub-flow C：未知 / 非站点目录（必须先向用户确认）
- [x] v1.0.0 后扩展：site-root 标记由“枚举工具”改为“通用规则”，不再因未知工具而漏判
- [x] v1.0.0 后扩展：dev.js 强制端口自动递增、CSS 路径契约、示例 + README、交互语言分离规则
- [x] templates/conventions.md（强制 Eta 语法 / 变量绑定）
- [x] 5 步必做自测条款
- [x] SKILL.md Common Pitfalls 段
- [x] 强制 frontend-design 依赖（pre-flight + 唯一 source_skill 来源）
- [x] Required Reading 段在 SKILL.md 显眼位置
- [x] AGENTS.md 顶部 4 条硬约束（版本/语言/Client/引用）
- [x] xiaoyi-ssg 交互依赖文档统一为英文（节省 token），含 2 处简体中文例外
- [x] 移除 Client-agnostic 过度强调，Client Compatibility 段简化为能力假设
- [x] 合并 references/frontend-design-integration.md 到 SKILL.md § Design System Delegation，删除该文件
- [x] 删除冗余 README.md
- [x] 项目管理文档 STATUS.md 保留简体中文
- [x] GEO 支持（默认开启）：用户现有 `source/<type>/*.md` 即 GEO 来源，render.js 自动聚合为 `/llms.txt`、`/robots.txt`、每页 markdown 镜像、JSON-LD；`llms-full.txt` opt-in
- [x] v1 开发范围澄清：sources + views、数据源扩展、取消旧定位等调整均属于 v1 范围，不代表大版本或 breaking release
- [ ] 等待社区 review + 合并

## 已知约束

修改本技能的开发 AI 必读 [`AGENTS.md` § 硬约束](./AGENTS.md)，含：

1. **版本一致性规则（用户权限优先）**：v1.0.0 为稳定版本，**AI 不得自动 bump 版本号**——任何版本变更必须由用户明确指令触发；AI 仅可建议
2. **文档语言规范**：
   - A 类（xiaoyi-ssg 交互依赖）：英文为主，仅 2 处简体中文例外
   - B 类（项目管理等非交互依赖）：简体中文
3. **Client 适配规则**：不展开 client-agnostic 适配矩阵
4. **引用文件清单规则**：删除文件前 `grep` 确认无孤儿引用
5. **GEO 来源纪律**：用户的现有 `source/<type>/*.md` 即 GEO 来源，**AI 不得发明 `geo/` 目录或要求用户额外撰写 GEO 文件**；GEO 是输出聚合器，不是新的创作流

## 文档分类

### A 类：xiaoyi-ssg 交互依赖（AI 加载技能时读，token 敏感）

- SKILL.md（主体英文，frontmatter `description` 简体中文）
- AGENTS.md（顶部 4 行简述中文，4 条硬约束与主体英文）
- prompts/*.md
- templates/conventions.md
- schemas/*.json
- agents/openai.yaml（OpenAI Codex CLI 接口）

### B 类：非交互依赖（人/项目管理用，无需省 token）

- STATUS.md（本文件）
