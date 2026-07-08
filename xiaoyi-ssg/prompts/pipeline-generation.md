# Pipeline Generation Prompt

> ⚠️ **必读前置**：
> 1. [`templates/conventions.md`](../templates/conventions.md) — 模板语法、变量绑定、custom fields 强制约定
> 2. [`prompts/render-node-spec.md`](./render-node-spec.md) — render.js 完整规格
> 3. [`references/frontend-design-integration.md`](../references/frontend-design-integration.md) — `assets/style.css` 的 design token、card/hero/nav、dark mode、a11y 模板代码（生成 CSS 时直接照搬）

指导 AI 生成完整渲染管线（`.xiaoyi-ssg/` 目录下所有文件）。

## 输入上下文

```json
{
  "tokens": { ... },           // 完整 design-tokens.json 的 tokens 对象
  "content_types": { ... },    // content-types.json 完整内容
  "config": { ... },           // config.yml 解析后的对象
  "site_language": {           // inferred from the user's request unless explicitly overridden
    "code": "zh-CN",
    "source": "user-request|explicit-user-choice",
    "ui_language": "Chinese (Simplified)"
  },
  "interactions_needed": [      // 基于用户需求、参考站点和内容模型推导
    {
      "name": "project-filter",
      "pages": ["projects"],
      "behavior": "filter cards by tag without full page reload",
      "fallback": "server-rendered full list remains readable"
    }
  ],
  "dark_mode": true
}
```

## 生成目标

一次性生成 `<PIPELINE_DIR>/` 完整文件集：

```
.xiaoyi-ssg/
├── render.js                 # 核心渲染脚本（构建）——模板清单驱动
├── dev.js                    # 开发服务器（watch + serve + live reload）
├── package.json              # 依赖声明
├── package-lock.json         # 依赖锁定
├── node_modules/             # npm install 生成，git 忽略
├── templates/                # 项目专用模板（由 manifest 决定清单）
│   ├── base.html             // 布局骨架
│   ├── *.html                // 由 template-manifest.json 声明的每个 page 模板
│   └── partials/             // 可选片段
├── assets/
│   ├── style.css             // 完整 CSS（含 Critical CSS 标记）
│   ├── script.js             // 交互入口
│   ├── interactions/         // 可选交互模块
│   └── data/                 // 可选静态 JSON 数据
├── template-manifest.json    # 单一事实来源：声明 collections、templates、globals
├── config.schema.json        // 配置校验 schema
├── content-types.json        // 内容类型定义（供 AI/校验用，渲染器不再直接读取）
├── interactions.manifest.json // 交互契约、依赖、fallback、验证点
└── pipeline-manifest.json    // 元数据
```

## Language Inheritance

- On init/new site, infer the primary site language from the user's request language unless the user explicitly asks for another language.
- Write `config.site.language` as a valid BCP 47 language tag matching that inferred language, for example `zh-CN`, `en`, `ja`, or `fr`.
- All user-facing generated text must use the inferred site language: site title/subtitle when AI-created, nav labels, content type labels, starter Markdown, page headings, buttons, placeholders, empty states, pagination labels, search/filter labels, theme labels, comments text, 404 text, RSS/feed titles, README snippets, and accessibility labels.
- Keep route slugs, code identifiers, filenames, JSON keys, package names, and internal function names ASCII when appropriate. Do not let ASCII identifiers force English UI copy.
- If a reference site uses another language, treat it as visual/content inspiration only; do not switch the generated site's primary language unless the user asked for that.
- If the user mixes languages, prefer the language used for the actual site request. Ask only when the primary site language is ambiguous and materially affects generated content.

## 生成策略

### 1. package.json — 依赖声明

```json
{
  "name": "xiaoyi-ssg-renderer",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node render.js",
    "build:fresh": "node render.js --fresh",
    "dev": "node dev.js"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "marked": "^12.0.0",
    "chokidar": "^3.6.0",
    "eta": "^3.2.0"
  }
}
```

默认只使用以上依赖。若用户明确需要复杂图表、地图、全文搜索等交互，可以添加必要 npm 依赖；必须固定版本、避免 CDN-only 方案，并在 `interactions.manifest.json` 说明用途与 fallback。

### 2. render.js — 核心渲染脚本（模板清单驱动）

- **单文件**，Node.js 18+，ESM（`import`）
- 依赖：`js-yaml`（YAML 解析）、`marked`（Markdown → HTML）、`eta`（模板引擎）
- **核心逻辑**：
  1. 读取 `template-manifest.json`（单一事实来源）
  2. 扫描内容 → 构建 `collections`（按 manifest 的 collections 配置排序、分页、树形）
  3. `expandTemplates()`：按 manifest.templates 展开为具体渲染任务
  4. 遍历任务 → 渲染 → 写入 `public/`
  5. 复制 assets、生成交互数据、Feed、Sitemap、404
  6. 增量缓存（哈希包含：模板文件、manifest、tokens、配置、内容文件）
- 详见 `prompts/render-node-spec.md`（新版）

### 3. dev.js — 开发服务器

- **单文件**，Node.js 18+，ESM
- 依赖：`chokidar`（文件监听）、复用 `render.js` 的 `build()` 函数
- 功能：
  - HTTP 服务器 serve `public/`（端口 3000，被占用自动递增）
  - chokidar 监听 `source/**/*.md`、`.xiaoyi-ssg/templates/**`、`.xiaoyi-ssg/assets/**`、`.xiaoyi-ssg/template-manifest.json`、`.xiaoyi-ssg/content-types.json`、`.xiaoyi-ssg/interactions.manifest.json`、`.xiaoyi-ssg-design-tokens.json`、`config.yml`、`source/_media/**`
  - 变更 → 增量构建（复用 render.js 逻辑） → SSE 推送 reload
  - HTML 响应拦截：在 `</body>` 前注入 SSE 客户端脚本
- 详见 `prompts/render-node-spec.md`（新版）

### 4. template-manifest.json — 单一事实来源

**由 AI 根据用户意图 + 内容模型生成**。声明：

- `collections`：内容源配置（source 路径、排序、分页、singleton、tree）
- `templates`：每个模板的名字、类型、布局、文件名、输出路径模板、数据绑定、展开策略
- `globals`：全局注入数据

AI 生成时的决策规则：

| 用户意图 | 生成的 manifest 关键点 |
|---------|---------------------|
| "落地页，只要首页" | `collections.landing.singleton=true`；templates: base + landing(output="/") + 404 |
| "博客/作品集" | `collections.posts.pagination` + `forEach: "collections"` (list) + `forEach: "items"` (detail) |
| "文档站" | `collections.docs.tree=true`；templates: doc-index + doc-page(forEach: items) |
| "组合站点" | 多 collections + 多 templates，按需组合 |

### 5. 模板生成原则

**base.html** — 布局骨架（layout 类型）
- `<header role="banner">`：站点标题链接首页、主导航（来自 `config.pages`）、移动端菜单按钮
- `<main role="main">`：容器宽度受 `tokens.layout.containerMax` 限制
- `<footer role="contentinfo">`：版权、RSS链接、外部链接、UTC时钟
- CSS 变量完整映射 tokens
- 无内联样式，仅语义化 class + CSS 变量
- 在 `</body>` 前加载 `assets/script.js`

**page 模板** — 由 manifest 声明的每个 page 模板
- 列表页（`forEach: "collections"` + `forEach: "pagination"`）：页面标题、面包屑、卡片网格、分页控件、搜索/筛选控件（若 manifest 声明）
- 详情/文档页（`forEach: "items"`）：面包屑、标题、日期、标签、封面、正文、上一篇/下一篇（可选）、树形侧边栏（若 `tree: true`）
- 首页/单例页（无 `forEach` 或 `singleton: true`）：聚合展示或单页内容
- 404 页：固定 output `/404.html`

**Breadcrumb / URL safety**
- URL path data and visual separators must be separate.
- Breadcrumb item `url` values must be normalized internal paths such as `/`, `/blog/`, `/blog/post-title/`; never store `//`.
- Generate the visual breadcrumb separator in exactly one place. Prefer CSS `.breadcrumb li + li::before { content: "/"; }`.
- Do not render literal `/`, `//`, or separator text inside breadcrumb item data or template loops when CSS already provides separators.
- Do not emit separators before the first item or after the last item.
- Filter out empty breadcrumb items before rendering.

### 6. CSS 变量映射（内联到模板/CSS）

```css
:root {
  /* Color */
  --color-bg: <tokens.color.background>;
  --color-bg-dark: <tokens.color.backgroundDark>;
  --color-text: <tokens.color.text>;
  --color-text-dark: <tokens.color.textDark>;
  --color-accent: <tokens.color.accent>;
  --color-accent-hover: <tokens.color.accentHover>;
  --color-muted: <tokens.color.muted>;
  --color-border: <tokens.color.border>;
  --color-border-dark: <tokens.color.borderDark>;
  --color-focus: <tokens.color.focus>;
  --color-error: <tokens.color.error>;
  --color-success: <tokens.color.success>;

  /* Typography */
  --font-display: <tokens.typography.fontDisplay>;
  --font-body: <tokens.typography.fontBody>;
  --font-mono: <tokens.typography.fontMono>;
  --line-length: <tokens.typography.lineLength>;
  --letter-spacing-display: <tokens.typography.letterSpacing.display>;
  --letter-spacing-body: <tokens.typography.letterSpacing.body>;
  --letter-spacing-caps: <tokens.typography.letterSpacing.caps>;

  /* Layout */
  --container-max: <tokens.layout.containerMax>;
  --header-height: <tokens.layout.headerHeight>;
  --footer-height: <tokens.layout.footerHeight>;
  --sidebar-width: <tokens.layout.sidebarWidth>;
  --grid-columns: <tokens.layout.gridColumns>;
  --gutter: <tokens.layout.gutter>;
  --rhythm: <tokens.layout.rhythm>;
  --radius: <tokens.layout.radius>;

  /* Motion */
  --transition-fast: <tokens.motion.transitionFast>;
  --transition-base: <tokens.motion.transitionBase>;
}

@media (prefers-color-scheme: dark) {
  :root {
    {
    --color-bg: <tokens.darkMode.color.background>;
    --color-text: <tokens.darkMode.color.text>;
    --color-border: <tokens.darkMode.color.border>;
    --color-muted: <tokens.darkMode.color.muted>;
  }
}
```

**Critical CSS 标记**：在 `style.css` 中用注释标记 Critical CSS 范围，渲染脚本内联到 HTML `<style>`。

```css
/* critical:start */
:root { ... }  /* 所有 CSS 变量 */
.site-header { ... }  /* header 关键样式 */
.site-footer { ... }
.main-wrapper { ... }
/* critical:end */
```

### 7. 组件样式生成（基于 tokens.component）

将 tokens.component 的描述性字符串转为具体 CSS 规则。例如：

- `card: "no-border, whitespace-separation"` → `.card { border: none; margin-bottom: var(--rhythm); }`
- `nav: "text-only, uppercase, letter-spacing-0.1em"` → `.nav a { text-transform: uppercase; letter-spacing: 0.1em; }`
- `button: "ghost, accent-text, hairline-border"` → `.btn { background: transparent; color: var(--color-accent); border: 1px solid var(--color-border); }`

### 8. script.js — 必需交互

- 作为交互 bootstrap：扫描 `[data-interaction]`，初始化需要的模块，避免全局变量污染
- 默认包含移动端菜单切换、可访问的展开/折叠状态同步、可选 UTC 时钟、平滑锚点滚动
- 按需求生成模块：搜索、筛选、排序、标签/分类 chips、暗色切换、本地偏好记忆、lightbox、视频懒加载、表单校验、复制按钮、tabs/accordion、图表、地图等
- 每个交互必须支持键盘操作、焦点管理、ARIA 状态同步、`prefers-reduced-motion`，并在无 JS 时尽量保持内容可读或链接可用
- 对需要数据的交互，生成 `assets/data/*.json`，并在构建哈希中包含数据输入

### 9. interactions.manifest.json

```json
{
  "version": 1,
  "interactions": [
    {
      "name": "project-filter",
      "pages": ["projects"],
      "selectors": ["[data-interaction=\"project-filter\"]"],
      "modules": ["assets/interactions/filter.js"],
      "data": ["assets/data/projects.json"],
      "dependencies": [],
      "fallback": "full project list remains visible without JavaScript",
      "accessibility": ["keyboard", "aria-live", "focus-visible"],
      "verification": ["filter by tag", "clear filter", "empty state"]
    }
  ]
}
```

### 10. config.schema.json

从模板裁剪，仅保留当前站点用到的字段。用于 `render.js` 启动时校验。

### 11. pipeline-manifest.json

```json
{
  "version": 1,
  "generated_at": "ISO8601",
  "theme_ref": "reference-url|custom",
  "theme_manifesto_hash": "sha256:...",
  "tokens_hash": "sha256:...",
  "content_types_hash": "sha256:...",
  "templates": ["base.html", "landing.html", "list.html", "detail.html", "doc-page.html", ...],
  "interactions_hash": "sha256:...",
  "renderer_version": "3.0",
  "runtime": "node"
}
```

## 输出要求

- 所有文件内容作为字符串返回，由 AI 写入用户项目
- 代码风格：ESM `import`、HTML 语义化、CSS 变量驱动
- 依赖默认限 `js-yaml`、`marked`、`chokidar`、`eta`；若交互需要额外包，必须固定版本、写入 manifest，并确保 `npm install && npm run build` 可运行
- 确保生成的 `render.js`、`dev.js` 可直接运行

## 关键约束

1. **Tokens 不可变**：生成的管线不再解析 tokens，仅使用内联的 CSS 变量值
2. **模板包含交互钩子**：每个模板包含完整页面结构和必要 `data-*`/ARIA 钩子；允许浏览器 JS 做渐进增强
3. **确定性**：相同输入 → 相同输出（seed 固定）
4. **增量友好**：以下变更会触发相关页面重建（哈希包含这些输入）：
   - 内容文件 `source/**/*.md`
   - 模板文件 `.xiaoyi-ssg/templates/**/*.html`
   - 模板清单 `.xiaoyi-ssg/template-manifest.json`
   - 设计 tokens `.xiaoyi-ssg-design-tokens.json`
   - 配置 `config.yml`
   - 内容类型 `.xiaoyi-ssg/content-types.json`
   - 交互 manifest `.xiaoyi-ssg/interactions.manifest.json`
   - 交互模块 `.xiaoyi-ssg/assets/interactions/*.js`
   - 交互数据 `.xiaoyi-ssg/assets/data/*.json`
   - 样式/脚本 `.xiaoyi-ssg/assets/style.css`, `.xiaoyi-ssg/assets/script.js`
5. **dev server 注入**：仅 dev 模式注入 SSE 脚本，build 产物不含注入脚本
6. **ESM 模块**：所有 `.js` 文件使用 `import`/`export`，`package.json` 含 `"type": "module"`
7. **无硬编码模板集**：render.js 完全由 template-manifest.json 驱动，不内置 list/detail/index 等固定分支
