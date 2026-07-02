---
name: xiaoyi-ssg
description: AI-driven static site generator that creates a custom rendering pipeline for each project through conversation, including content models, design tokens, accessible UI, and project-specific browser interactions. Use when Codex needs to generate or maintain a static site whose build output can include necessary client-side behavior such as navigation, search, filters, theme toggles, forms, galleries, media controls, maps, charts, or other static-host-compatible interactions.
---

# xiaoyi-ssg — Conversational Custom SSG Generator

A skill that generates **complete, project-specific static site generators** from natural language conversation. **One slash command, natural dialogue.** The AI understands your intent, extracts/creates a design system from references or descriptions, helps you define content types and interactions, and generates a complete rendering pipeline (`.xiaoyi-ssg/render.js` + `dev.js` + templates + CSS + browser JS) that runs independently — no AI needed for subsequent builds.

## 多语言支持 / Multilingual Support

**本技能会自动检测并使用您对话的语言进行回复**。除非您明确指定语言，否则：
- 中文对话 → 中文回复、中文文档
- English conversation → English replies, English docs
- 其他语言同理

**This skill automatically detects and replies in your conversation language**. Unless you explicitly specify a language:
- Chinese conversation → Chinese replies, Chinese docs
- English conversation → English replies, English docs
- Other languages likewise

---

## Core Philosophy / 核心理念

- **Conversational / 对话式**: `/xiaoyi-ssg` starts a dialogue. You describe what you want; the AI plans and generates a custom SSG. `/xiaoyi-ssg` 启动对话。您描述需求；AI 规划并生成专用 SSG。
- **Design system first / 设计系统优先**: On first run, the AI extracts/creates design tokens (colors, type, spacing, layout, motion) from your references or descriptions. Saved to `.xiaoyi-ssg-design-tokens.json`. Every rebuild uses the **same tokens** — consistent visual identity. Only content changes regenerate pages. 首次运行时，AI 从您的参考或描述中提取/创建设计 token（色彩、排版、间距、布局、动效）。保存至 `.xiaoyi-ssg-design-tokens.json`。每次重建复用**相同 token**——视觉一致。仅内容变更触发页面再生。
- **Generated, not templated / 生成而非模板**: No fixed templates or themes. The AI generates a complete rendering pipeline tailored to your content model and design intent. Pipeline writes to `public/`. 无固定模板或主题。AI 生成完整渲染管线，贴合您的内容模型与设计意图。管线输出到 `public/`。
- **Pipeline self-runs / 管线自运行**: After generation, build is `cd .xiaoyi-ssg && npm run build` (or `node .xiaoyi-ssg/render.js` from the site root) — **zero AI involvement**, deterministic, reproducible, CI/CD ready. 生成后构建可在 `.xiaoyi-ssg` 内运行 npm 脚本，或在站点根运行 `node .xiaoyi-ssg/render.js`。
- **Interaction-capable / 支持必要交互**: Static output may include project-specific client JavaScript for navigation, search, filters, theme toggles, forms, galleries, media controls, charts, maps, and other static-host-compatible interactions. Do not remove interaction needs just to keep pages "pure static". 静态输出可以包含项目所需的客户端交互脚本；不得为了“纯静态”而删减必要交互。
- **Live reload / 实时刷新**: `npm run dev` starts a dev server with file watching and auto-reload. Edit content → browser refreshes instantly. `npm run dev` 启动开发服务器，文件监听 + 自动刷新。编辑内容 → 浏览器即时刷新。
- **Content model defined by you / 内容模型由您定义**: You define content types through conversation (e.g., "project with cover, tech stack, links"). The AI generates front-matter schemas and corresponding list/detail templates. 您通过对话定义内容类型（如"带封面、技术栈、链接的项目"）。AI 生成 front-matter schema 与对应列表/详情模板。
- **References, not presets / 参考而非预设**: Share URLs, screenshots, or descriptions. The AI analyzes them for design intent. No built-in theme menu. 分享 URL、截图或描述。AI 分析提取设计意图。无内置主题菜单。
- **Skill is stateless / 技能无状态**: No `<SKILL_DIR>/state.json`. Site location = "walk up from cwd to find config.yml". 无 `<SKILL_DIR>/state.json`。站点定位 = "从 cwd 向上查找 config.yml"。

## Quick Start / 快速开始

```bash
# 1. 进入空目录（或现有站点根目录）
# 1. Enter an empty directory (or existing site root)
cd my-site

# 2. 启动对话
# 2. Start the conversation
/xiaoyi-ssg

# AI: "想做什么站点？有参考链接/截图/描述？"
# AI: "What kind of site? Any reference links, screenshots, or descriptions?"
# 您: "极简作品集。参考：https://example.com/portfolio"
# You: "A minimal portfolio. Reference: https://example.com/portfolio"
# AI 抓取参考，分析设计意图
# AI fetches reference, analyzes design intent
# AI: "需要什么内容类型？如：项目、文章、关于页"
# AI: "What content types? e.g., projects, articles, about page"
# 您: "项目（封面、技术栈、链接）、文章（标题、日期、标签）、关于页"
# You: "Projects (cover, tech stack, repo/live links), articles (title, date, tags), about page"
# AI 生成：config.yml、content-types.json、design-tokens.json、.xiaoyi-ssg/ (render.js, dev.js, templates, CSS, JS)
# AI generates: config.yml, content-types.json, design-tokens.json, .xiaoyi-ssg/ (render.js, dev.js, templates, CSS, JS)
# AI 自动 npm install + 首次 build
# AI auto npm install + first build
# AI: "完成。运行 'cd .xiaoyi-ssg && npm run dev' 启动开发服务器"
# AI: "Done. Run 'cd .xiaoyi-ssg && npm run dev' to start dev server"

/xiaoyi-ssg
# 您: "新增项目：'Neural Style Transfer'，封面、Python/PyTorch、github.com/..."
# You: "Add a project: 'Neural Style Transfer' with cover, Python/PyTorch, github.com/..."
# AI 创建 source/_projects/neural-style-transfer.md
# 若 dev server 运行中 → 自动增量构建 → 浏览器刷新
# If dev server running → auto incremental build → browser refresh

/xiaoyi-ssg
# 您: "构建一下"
# You: "Build it"
# AI 运行 npm run build，输出到 public/，报告摘要
# AI runs npm run build, outputs to public/, reports summary

/xiaoyi-ssg
# 您: "调暗色，加大间距"
# You: "Make it darker, increase spacing"
# AI 更新 design-tokens.json，重新生成 .xiaoyi-ssg/，提示用 --fresh 重建
# AI updates design-tokens.json, regenerates .xiaoyi-ssg/, tells you to run with --fresh
```

## Site Structure (After Init) / 站点结构（初始化后）

```
<site-root>/
├── config.yml                      # Site config (generated) / 站点配置（生成）
├── .xiaoyi-ssg-design-tokens.json  # Persisted design system (colors, type, spacing, layout, motion) / 持久化设计系统（色彩、排版、间距、布局、动效）
├── .xiaoyi-ssg-cache.json          # Build cache (gitignored) / 构建缓存（git忽略）
├── source/
│   ├── _posts/                     # Content type: posts (if defined) / 内容类型：文章（若定义）
│   ├── _projects/                  # Content type: projects (if defined) / 内容类型：项目（若定义）
│   ├── _media/                     # User-managed media files / 用户维护的媒体文件
│   └── _<your-type>/               # Any custom types you define / 您定义的任意自定义类型
├── .xiaoyi-ssg/                    # Generated pipeline source; commit it, ignore node_modules / 生成管线源码；建议提交，忽略 node_modules
│   ├── render.js                   # Core renderer (Node.js ESM) / 核心渲染器（Node.js ESM）
│   ├── dev.js                      # Dev server (watch + live reload) / 开发服务器（监听+实时刷新）
│   ├── preview.js                  # Static preview server / 静态预览服务器
│   ├── package.json                # Dependencies (js-yaml, marked, chokidar) / 依赖声明
│   ├── package-lock.json           # Lockfile / 依赖锁定
│   ├── node_modules/               # Pipeline dependencies (gitignored) / 管线依赖（git 忽略）
│   ├── templates/                  # Project-specific templates (tokens inlined as CSS vars) / 项目专用模板（token 内联为 CSS 变量）
│   │   ├── base.html               # Layout skeleton: header + main + footer / 布局骨架：header + main + footer
│   │   ├── list-<type>.html        # List page template (pagination, card grid) / 列表页模板（分页、卡片网格）
│   │   ├── detail-<type>.html      # Detail page template (prev/next, full content) / 详情页模板（上一篇/下一篇、完整内容）
│   │   ├── page.html               # Generic page template / 通用页面模板
│   │   └── index.html              # Home page template / 首页模板
│   ├── assets/
│   │   ├── style.css               # Complete CSS (with Critical CSS markers) / 完整 CSS（含 Critical CSS 标记）
│   │   ├── script.js               # Interaction bootstrap / 交互入口
│   │   ├── interactions/           # Optional modules for search, filters, gallery, forms, charts, etc. / 可选交互模块
│   │   └── data/                   # Optional generated static JSON payloads / 可选生成静态 JSON 数据
│   ├── config.schema.json          # Config validation schema (trimmed from template) / 配置校验 schema（从模板裁剪）
│   ├── content-types.json          # Content type definitions (copy for renderer) / 内容类型定义（渲染器副本）
│   ├── interactions.manifest.json  # Interaction contract and generated modules / 交互契约与模块清单
│   └── pipeline-manifest.json      # Pipeline metadata (generation time, refs, hashes) / 管线元数据（生成时间、引用、哈希）
└── public/                         # Generated output (deploy this, gitignored) / 生成输出（部署此目录，git忽略）
    ├── index.html
    ├── blog/ (or your types)
    ├── projects/
    ├── about/
    ├── assets/
    │   ├── style.css
    │   ├── script.js
    │   ├── interactions/
    │   └── data/
    ├── feed.xml
    ├── feed.json
    ├── sitemap.xml
    └── 404.html
```

## Configuration (`config.yml`) / 配置

Generated during init, tailored to your site / 初始化时生成，贴合您的站点：

```yaml
site:
  title: "My Portfolio"              # 站点标题
  subtitle: "Designer & Developer"   # 副标题
  author: "Jane Doe"                 # 作者
  email: "jane@example.com"          # 邮箱
  language: "en"                     # 语言
  timezone: "UTC"                    # 时区
  url: "https://jane.dev"            # 站点 URL
  description: "Portfolio of selected work"  # 描述

pages:                    # Enabled content types + nav order / 启用的内容类型+导航顺序
  - projects
  - posts
  - about

per_page: 12              # Pagination size for list pages / 列表页分页大小

nav:
  home_title: "Home"      # 首页标题
  external_links: []      # [{ title, url, target }] / 外部链接

# Optional per-type overrides (generated based on your content types)
# 可选的每类型覆盖（基于您的内容类型生成）
projects:
  layout: "grid"
  show_cover: true

posts:
  layout: "list"
  show_excerpt: true
  excerpt_length: 200

about:
  content_file: "source/_about/index.md"
```

## Content Front-Matter / 内容前置元数据

Defined by **you** during init. Examples / 初始化时由您定义。示例：

### Project (custom type) / 项目（自定义类型）

```markdown
---
title: "Neural Style Transfer"
date: 2025-01-15
cover: "/images/nst-cover.jpg"
tech_stack: ["Python", "PyTorch", "OpenCV"]
repo_url: "https://github.com/jane/nst"
live_url: "https://nst-demo.jane.dev"
description: "Real-time artistic style transfer using VGG19."
featured: true
---
Project details...
```

### Post (custom type) / 文章（自定义类型）

```markdown
---
title: "Why I Switched to Rust"
date: 2025-01-10 14:30:00
tags: ["rust", "systems", "learning"]
categories: ["engineering"]
cover: "/images/rust-cover.jpg"
draft: false
excerpt: "A personal account of moving from Go to Rust..."
---
Article content...
```

### About Page (singleton) / 关于页面（单例）

```markdown
---
title: "About Me"
date: 2025-01-01
nav: true
nav_title: "About"
nav_order: 3
---
Page content...
```

**Field types / 字段类型**: `string`, `datetime`, `date`, `boolean`, `string[]`, `url`, `number`, `object`.

## Design Tokens (`.xiaoyi-ssg-design-tokens.json`) / 设计 Token

Created on first init from your references + preferences. Persists across sessions / 首次初始化时从参考与偏好创建。跨会话持久化。

```json
{
  "version": 1,
  "theme_ref": "https://example.com/portfolio|custom",
  "theme_manifesto_hash": "sha256:...",
  "tokens": {
    "color": {
      "background": "#faf9f7",
      "backgroundDark": "#1a1a1a",
      "text": "#1a1a1a",
      "textDark": "#faf9f7",
      "accent": "#3b2f7a",
      "accentHover": "#2d245e",
      "muted": "#8a8680",
      "border": "#e8e6e3",
      "borderDark": "#333333",
      "focus": "#3b2f7a",
      "error": "#c0392b",
      "success": "#27ae60"
    },
    "typography": {
      "fontDisplay": "'Fraunces', Georgia, serif",
      "fontBody": "'Source Serif 4', Georgia, serif",
      "fontMono": "'JetBrains Mono', monospace",
      "scale": {
        "h1": "clamp(2.5rem, 5vw, 4rem) / 1.1",
        "h2": "clamp(1.75rem, 3.5vw, 2.5rem) / 1.2",
        "h3": "clamp(1.25rem, 2.5vw, 1.75rem) / 1.3",
        "body": "1.125rem / 1.75",
        "small": "0.875rem / 1.6",
        "micro": "0.8125rem / 1.5"
      },
      "lineLength": "65ch",
      "letterSpacing": {
        "display": "-0.02em",
        "body": "0",
        "caps": "0.08em"
      }
    },
    "layout": {
      "containerMax": "65ch",
      "headerHeight": "auto",
      "footerHeight": "auto",
      "sidebarWidth": "none",
      "gridColumns": 1,
      "gutter": "3rem",
      "rhythm": "3rem",
      "radius": "3px"
    },
    "component": {
      "card": "no-border, whitespace-separation",
      "cardMedia": "aspect-video, object-cover, border-radius-inherit",
      "nav": "text-only, uppercase, letter-spacing-0.1em",
      "button": "ghost, accent-text, hairline-border",
      "form": "inline-labels, hairline-bottom-border",
      "blockquote": "left-border-3px-accent, italic",
      "code": "muted-bg, padding-0.2em-0.4em, radius-3px",
      "pre": "dark-bg, light-text, overflow-auto",
      "media": "aspect-video, object-cover, border-radius-inherit",
      "pagination": "centered, numbered, active-accent",
      "breadcrumb": "minimal, slash-separator"
    },
    "motion": {
      "entrance": "staggered fade-up, 150ms base, 60ms stagger",
      "hover": "color-transition 120ms ease-out",
      "focus": "accent-outline-2px offset-2px",
      "transitionFast": "120ms ease-out",
      "transitionBase": "150ms cubic-bezier(0.2, 0.8, 0.2, 1)"
    }
  },
  "darkMode": {
    "color": {
      "background": "#1a1a1a",
      "text": "#faf9f7",
      "border": "#333333",
      "muted": "#8a8680"
    }
  },
  "seed": 123456789
}
```

**Behavior / 行为**：
- First init → extract from references/preferences → save / 首次初始化 → 从参考/偏好提取 → 保存
- Rebuild → **reuse tokens** → same visual identity / 重建 → **复用 token** → 视觉一致
- Content changes → only affected pages regenerate / 内容变更 → 仅受影响页面再生成
- Style adjustments → tokens updated → full rebuild with `--fresh` / 样式调整 → token 更新 → 用 `--fresh` 全量重建

## Source Content Protection / source 内容保护

`source/` is the user content area, not the generated pipeline area. Treat `source/**/*.md` and `source/_media/**` as user-owned. Do not overwrite, delete, reformat, or bulk rewrite source content during style adjustments, reference/theme changes, interaction updates, pipeline regeneration, build, dev, preview, or diagnose operations.

Allowed `source/` writes are limited to:
- init: create missing directories and optional starter content only when the target path does not already exist.
- new content: create the requested single content file.
- content edit: modify only the file the user identified or confirmed.
- content type add: create the missing `source/_<type>/` directory without touching existing files.
- migration/rename/delete: perform only after the user explicitly asks for it and the agent shows the planned affected paths.

`source/` 是用户内容区，不是生成管线区。除非当前意图明确是新增/编辑/迁移内容，否则不得修改 `source/**/*.md` 或 `source/_media/**`。

## AI Orchestration (Internal) / AI 编排（内部）

When you invoke `/xiaoyi-ssg`, the agent / 调用 `/xiaoyi-ssg` 时，AI 代理：

1. **Locate site / 定位站点** — walk up from cwd to find `config.yml` (or guide init if none) / 从 cwd 向上查找 `config.yml`（未找到则引导初始化）
2. **Read context / 读取上下文** — `config.yml`, `.xiaoyi-ssg-design-tokens.json` (if exists), glob `source/**/*.md`, `.xiaoyi-ssg/pipeline-manifest.json`
3. **Parse intent / 解析意图** from your message / 从您的消息中：
   - `init` — create new site (guided conversation) / 创建新站点（引导对话）
   - `new <type> <title>` — create content file / 创建内容文件
   - `build` / `rebuild` — run `cd .xiaoyi-ssg && npm run build` or `node .xiaoyi-ssg/render.js` / 运行构建
   - `dev` — run `cd .xiaoyi-ssg && npm run dev` or `node .xiaoyi-ssg/dev.js` (live reload) / 运行开发服务器（实时刷新）
   - `style adjust` — modify tokens, regenerate pipeline / 修改 token，重新生成管线
   - `content type` — add/modify content types, regenerate pipeline / 增改内容类型，重新生成管线
   - `interaction` — add/modify browser behavior, regenerate assets/templates as needed / 增改浏览器交互，按需重生成资源/模板
   - `reference` — analyze URL, extract design intent / 分析 URL，提取设计意图
   - `edit` — modify existing content front-matter/body / 修改现有内容 front-matter/正文
   - `preview` — suggest `npm run preview` or `open public/index.html` / 建议预览命令
   - `diagnose` — scan for issues / 扫描问题
   - `help` — explain capabilities / 解释能力
4. **Execute / 执行** — perform the action, report result / 执行动作，报告结果
5. **Loop / 循环** — wait for next message / 等待下一条消息

**Intent examples / 意图示例**：
- "帮我建个作品集站点，参考这个链接..." → init + analyze reference
- "新增一个项目：'Mobile App'，有封面、技术栈、链接" → new project
- "构建一下" → run `cd .xiaoyi-ssg && npm run build`
- "开发模式" / "实时预览" → run `cd .xiaoyi-ssg && npm run dev`
- "换个风格，更极简些，配色调深色" → edit tokens + regenerate pipeline
- "加个'演讲'类型，有视频、幻灯片、日期" → define content type + regenerate pipeline
- "项目页要能按标签筛选，搜索时不刷新页面" → interaction update + regenerate script/templates
- "加暗色切换和图片灯箱" → interaction update + regenerate script/templates
- "预览" → preview hint

## Build Pipeline (`.xiaoyi-ssg/render.js`) / 构建管线

1. **Scan / 扫描** — read `config.yml`, glob `source/**/*.md`, parse front-matter, validate against `content-types.json` / 读取配置、扫描内容、解析 front-matter、校验内容类型
2. **Tokens / 设计 Token** — load `.xiaoyi-ssg-design-tokens.json` / 加载设计 token
3. **Diff / 差异** — for each output file, compute input hash (content + templates used + tokens + config). Skip if unchanged. / 对每个输出文件计算输入哈希（内容+使用的模板+token+配置）。未变则跳过
4. **Global data / 全局数据** — build nav array from `config.pages`; compute pagination plans; build prev/next for each content item / 从配置构建导航、计算分页、构建上一篇/下一篇
5. **Interaction data / 交互数据** — generate static JSON payloads or inline data attributes required by client interactions (search index, filter facets, gallery metadata, chart data) / 生成客户端交互需要的静态数据
6. **Generate / 生成** — **only for stale pages** (hash changed or `--fresh`) / **仅针对过期页面**（哈希变更或 `--fresh`）：
   - Load design tokens + page data (content, pagination, site meta, nav, prev/next) / 加载 token + 页面数据
   - Render templates with interaction hooks (`data-*`, ARIA states, noscript fallbacks where useful) / 渲染模板并包含交互钩子
   - Write `public/<path>/index.html` / 写入输出
   - Update cache with new hash / 更新缓存哈希
7. **Assets / 资源** — copy `.xiaoyi-ssg/assets/` → `public/assets/`, including interaction modules and generated JSON payloads / 复制资源、交互模块与静态 JSON 数据
8. **Extras / 附加产物** — `feed.xml` (posts), `feed.json`, `sitemap.xml`, `404.html` / RSS、JSON Feed、站点地图、404页
9. **Report / 报告** — summary: files generated, interactions enabled, time, cache hit rate, warnings / 摘要：生成文件数、已启用交互、耗时、缓存命中率、警告

**Cost optimization / 成本优化**: `render.js` is **pure Node.js**. Unchanged pages reuse cached output — no regeneration cost. Layout/theme/design persists via tokens and cache. / `render.js` 为**纯 Node.js**。未变页面复用缓存输出——无再生成成本。布局/主题/设计通过 token 与缓存持久化。

## Dev Server (`.xiaoyi-ssg/dev.js`) / 开发服务器

1. **HTTP server / HTTP 服务器** — serve `public/` on port 3000 (auto-increment if occupied) / 在端口 3000 serve `public/`（被占用则自动递增）
2. **File watch / 文件监听** — `chokidar` monitors `source/**/*.md`, `.xiaoyi-ssg/templates/**`, `.xiaoyi-ssg/assets/**`, `.xiaoyi-ssg/interactions.manifest.json`, `.xiaoyi-ssg-design-tokens.json`, `config.yml`, `source/_media/**` / chokidar 监听内容、模板、交互资源、token、配置、媒体
3. **Incremental build / 增量构建** — on change: rebuild only affected pages / 变更时：仅重建受影响页面
4. **Live reload / 实时刷新** — SSE (Server-Sent Events) pushes reload event → browser auto-refreshes / SSE 推送 reload 事件 → 浏览器自动刷新
5. **HTML injection / HTML 注入** — dev server injects SSE client script before `</body>` / dev server 在 `</body>` 前注入 SSE 客户端脚本

```bash
# Start dev server / 启动开发服务器
cd .xiaoyi-ssg && npm run dev
# → Site Forge dev server running at http://localhost:3000

# Edit content → browser auto-refreshes / 编辑内容 → 浏览器自动刷新
# AI adds content → dev server detects → incremental build → refresh / AI 新增内容 → dev server 检测 → 增量构建 → 刷新
```

## Renderer Constraints (Embedded in Generated Pipeline) / 渲染器约束（内嵌于生成的管线）

- Semantic HTML5 (article, section, nav, header, footer, main, aside) / 语义化 HTML5
- WCAG AA contrast, keyboard accessible / WCAG AA 对比度、键盘可达
- Responsive: ≤640px, 641-1024px, ≥1025px / 响应式断点
- Static-host compatible: output must work from `public/` on any static host; browser JS is allowed when it is generated, bundled, copied, and documented by the pipeline / 兼容静态托管；允许由管线生成、复制并记录的浏览器 JS
- Prefer zero external runtime dependencies, but allow npm browser/build dependencies when a requested interaction materially needs them (for example charts, maps, complex search). Pin them in `.xiaoyi-ssg/package.json`, avoid CDN-only dependencies, and document why they are needed in `interactions.manifest.json`. / 默认零外部运行时依赖；必要时允许声明 npm 依赖，禁止只依赖 CDN
- Critical CSS inlined in `<style>`; rest in `assets/style.css` via `<link rel="preload" as="style">` / Critical CSS 内联；其余放入 `assets/style.css` 并预加载
- No inline `style="..."` attributes / 无内联样式属性
- Images: `loading="lazy"`, width/height, `srcset` if multiple sizes / 图片懒加载、宽高、多规格 srcset
- Code blocks: prefer build-time or CSS highlighting; allow client enhancement for copy buttons, line toggles, or advanced highlighting when requested / 代码块优先构建期或 CSS 高亮；按需求允许客户端增强
- Interactions must be accessible: keyboard operable, ARIA state synchronized, focus managed for dialogs/menus, prefers-reduced-motion respected, and usable without hover-only controls. / 交互必须可访问
- Progressive enhancement: core content remains readable without JavaScript where practical; when an interaction is essential, provide clear fallback text or non-JS links/actions. / 渐进增强
- SEO: title, meta description, canonical, Open Graph, Twitter Card, JSON-LD / SEO 元数据完整
- **Shared layout skeleton (all pages) / 全站共享布局骨架**: identical `<header role="banner">` (site title/logo → home, main nav from `config.pages`, mobile menu), `<footer role="contentinfo">` (copyright, RSS, external links), `<main role="main">` wrapper with max-width from `tokens.layout.containerMax`, breadcrumb/back-home nav on all non-home pages. Tokens define layout/color/typography/component/motion — **never vary per page**. / 所有页面相同的 header/footer/main 结构，token 定义布局/色彩/排版/组件/动效——**严禁逐页差异**
- **Article detail pages / 文章详情页**: title, date, tags, categories, cover; **prev/next navigation** (by date, with title + link + optional thumbnail). `<nav aria-label="Article navigation">` / 标题、日期、标签、分类、封面；上一篇/下一篇导航
- **List pages / 列表页**: page title (H1), pagination control (first/prev/page numbers/next/last, current highlighted). `<nav aria-label="Pagination">` / 页面标题、分页控件
- **About/page/special pages / 关于/页面/特殊页**: title, content, breadcrumb nav. / 标题、正文、面包屑
- **Responsive breakpoints consistent / 响应式断点一致**: all pages trigger same layout changes at ≤640px / 641-1024px / ≥1025px (nav collapse, column count, type scale). / 所有页面在相同断点触发相同布局变化
- **Uniqueness / 独特性**: Each pipeline generation produces a distinctive visual interpretation within the token constraints. / 每次管线生成在 token 约束下产出独特视觉诠释

## Commands (AI-Recognized Intents) / 命令（AI 识别意图）

| Intent | Trigger Phrases / 触发短语 | Action / 动作 |
|--------|-----------------|--------|
| `init` | "建站", "初始化", "新建站点", "帮我建个..." | Guided site creation → generates full pipeline / 引导建站 → 生成完整管线 |
| `new` | "新增文章", "加个项目", "新视频", "新页面" | Create content file with front-matter / 创建带 front-matter 的内容文件 |
| `build` | "构建", "build", "生成", "重新生成" | Run `cd .xiaoyi-ssg && npm run build` or `node .xiaoyi-ssg/render.js` / 运行构建 |
| `dev` | "开发", "dev", "实时", "watch", "监听" | Run `cd .xiaoyi-ssg && npm run dev` or `node .xiaoyi-ssg/dev.js` / 运行开发服务器 |
| `style adjust` | "换风格", "调配色", "改布局", "字体大一点" | Edit tokens → regenerate pipeline → build --fresh / 改 token → 重生成管线 → 用 --fresh 重建 |
| `content type` | "加个XX类型", "新增内容类型" | Define fields → update content-types.json → regenerate pipeline / 定义字段 → 更新内容类型 → 重生成管线 |
| `interaction` | "加搜索", "筛选", "暗色切换", "灯箱", "表单校验", "图表", "地图", "不刷新页面" | Define interaction contract → update templates/assets/manifest → rebuild / 定义交互契约 → 更新模板、资源、清单 → 重建 |
| `reference` | "参考这个网站", "像xxx.com一样" | WebFetch + analyze → extract design intent / 抓取分析 → 提取设计意图 |
| `edit` | "改标题", "加标签", "改日期", "修改正文" | Locate file → update front-matter/body / 定位文件 → 更新 front-matter/正文 |
| `preview` | "预览", "看看效果", "本地服务" | Suggest `npm run preview` or open / 建议预览命令 |
| `diagnose` | "检查", "诊断", "哪里不对" | Scan validation rules / 扫描校验规则 |
| `help` | "帮助", "怎么用", "有哪些功能" | Explain capabilities / 解释能力 |

## Deployment / 部署

The `public/` directory is a complete static site. Deploy anywhere / `public/` 为完整静态站点。可部署至任意平台：

- **GitHub Pages**: push `public/` to `gh-pages` branch or use Actions / 推送到 `gh-pages` 分支或用 Actions
- **Netlify/Vercel/Cloudflare Pages**: connect repo, set output dir to `public` / 关联仓库，设置输出目录为 `public`
- **Any static host / 任意静态主机**: upload `public/` contents / 上传 `public/` 内容

```yaml
# .github/workflows/deploy.yml (example)
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install & Build
        run: |
          cd .xiaoyi-ssg
          npm install
          npm run build
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

## Requirements / 环境要求

- **AI agent** with Read/Write/Edit/Glob/Grep/Bash tools (opencode, Claude Code, etc.) / 具备读写/编辑/glob/grep/bash 工具的 AI 代理
- **Node.js 18+** (for `render.js`, `dev.js`, and preview server) / 用于渲染脚本、开发服务器与预览服务

Installing the skill via `npx skills add` already requires Node.js, so no additional runtime is needed / 通过 `npx skills add` 安装本技能已需要 Node.js，故无需额外运行时。
