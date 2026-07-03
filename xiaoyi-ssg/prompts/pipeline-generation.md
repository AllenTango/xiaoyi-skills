# Pipeline Generation Prompt

指导 AI 生成完整渲染管线（`.xiaoyi-ssg/` 目录下所有文件）。

## 输入上下文

```json
{
  "tokens": { ... },           // 完整 design-tokens.json 的 tokens 对象
  "content_types": { ... },    // content-types.json 完整内容
  "config": { ... },           // config.yml 解析后的对象
  "components_needed": [       // 基于 content-types 推导的组件清单
    "base-layout",
    "header",
    "footer",
    "nav",
    "card-project",
    "card-post",
    "pagination",
    "breadcrumb",
    "article-meta",
    "prev-next-nav",
    "hero-index"
  ],
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
├── render.js                 # 核心渲染脚本（构建）
├── dev.js                    # 开发服务器（watch + serve + live reload）
├── preview.js                # 静态预览服务器
├── package.json              # 依赖声明
├── package-lock.json         # 依赖锁定
├── node_modules/             # npm install 生成，git 忽略
├── templates/
│   ├── base.html
│   ├── list-<type>.html      // 每个 content-type 一套
│   ├── detail-<type>.html    // 每个 content-type 一套
│   ├── page.html
│   └── index.html
├── assets/
│   ├── style.css             // 完整 CSS（含 Critical CSS 标记）
│   ├── script.js             // 交互入口
│   ├── interactions/         // 可选交互模块
│   └── data/                 // 可选静态 JSON 数据，如 search-index.json
├── config.schema.json        // 配置校验 schema
├── content-types.json        // 副本
├── interactions.manifest.json // 交互契约、依赖、fallback、验证点
└── pipeline-manifest.json    // 元数据
```

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
    "dev": "node dev.js",
    "preview": "node preview.js"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "marked": "^12.0.0",
    "chokidar": "^3.6.0"
  }
}
```

默认只使用以上依赖。若用户明确需要复杂图表、地图、全文搜索等交互，可以添加必要 npm 依赖；必须固定版本、避免 CDN-only 方案，并在 `interactions.manifest.json` 说明用途与 fallback。

### 2. render.js — 核心渲染脚本

- **单文件**，Node.js 18+，ESM（`import`）
- 依赖：`js-yaml`（YAML 解析）、`marked`（Markdown → HTML）
- 模板渲染必须支持数组、条件、HTML 转义、raw HTML、属性安全输出，以及 `data-*` 交互钩子；可自实现，也可在确有必要时加入轻量模板依赖
- 必须包含：增量构建（哈希缓存）、全局数据计算、交互数据生成、模板渲染、资源拷贝、Feed/Sitemap/404 生成
- 详见 `prompts/render-node-spec.md`

### 3. dev.js — 开发服务器

- **单文件**，Node.js 18+，ESM
- 依赖：`chokidar`（文件监听）、复用 `render.js` 构建逻辑
- 功能：
  - HTTP 服务器 serve `public/`（端口 3000，被占用自动递增）
  - chokidar 监听 `source/**/*.md`、`.xiaoyi-ssg/templates/**`、`.xiaoyi-ssg/assets/**`、`.xiaoyi-ssg/interactions.manifest.json`、`.xiaoyi-ssg-design-tokens.json`、`config.yml`、`source/_media/**`
  - 变更 → 增量构建（复用 render.js 逻辑） → SSE 推送 reload
  - HTML 响应拦截：在 `</body>` 前注入 SSE 客户端脚本
- 详见 `prompts/render-node-spec.md`

### 4. preview.js — 静态预览服务器

- **单文件**，Node.js 18+，ESM
- 零依赖（仅 `http` + `fs` 内置模块）
- 功能：启动 HTTP 服务器 serve `public/`，无监听、无注入

### 5. 模板生成原则

**base.html** — 布局骨架
- `<header role="banner">`：站点标题链接首页、主导航（来自 `config.pages`）、移动端菜单按钮
- `<main role="main">`：容器宽度受 `tokens.layout.containerMax` 限制
- `<footer role="contentinfo">`：版权、RSS链接、外部链接、UTC时钟
- CSS 变量完整映射 tokens（见下）
- 无内联样式，仅语义化 class + CSS 变量
- 在 `</body>` 前加载 `assets/script.js`。仅当页面需要大型独立交互时再按需加载模块或数据文件

**list-<type>.html** — 列表页
- 页面标题 (H1)
- 面包屑导航
- 卡片网格（复用对应 card 结构）
- 分页控件（首页/上一页/页码/下一页/末页，当前页高亮）
- 语义化：`<nav aria-label="Pagination">`
- 若有搜索/筛选/排序需求，生成对应控件、`data-*` 属性、ARIA live region、清除按钮、空状态、无 JS fallback

**detail-<type>.html** — 详情页
- 面包屑导航
- 文章标题、日期、标签、分类、封面图
- 正文内容 (`body_html`)
- 上一篇/下一篇导航（标题、链接、可选缩略图、日期）
- 语义化：`<nav aria-label="Article navigation">`

**page.html** — 通用页面
- 面包屑导航
- 标题、正文内容

**index.html** — 首页
- 若单一内容类型：重定向或直接渲染列表
- 若多类型：聚合展示（各类型最新 N 条 + 入口链接）

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
  "templates": ["base.html", "list-post.html", ...],
  "interactions_hash": "sha256:...",
  "renderer_version": "2.0",
  "runtime": "node"
}
```

## 输出要求

- 所有文件内容作为字符串返回，由 AI 写入用户项目
- 代码风格：ESM `import`、HTML 语义化、CSS 变量驱动
- 依赖默认限 `js-yaml`、`marked`、`chokidar`；若交互需要额外包，必须固定版本、写入 manifest，并确保 `npm install && npm run build` 可运行
- 确保生成的 `render.js`、`dev.js`、`preview.js` 可直接运行

## 关键约束

1. **Tokens 不可变**：生成的管线不再解析 tokens，仅使用内联的 CSS 变量值
2. **模板包含交互钩子**：每个模板包含完整页面结构和必要 `data-*`/ARIA 钩子；允许浏览器 JS 做渐进增强
3. **确定性**：相同输入 → 相同输出（seed 固定）
4. **增量友好**：模板、交互 manifest、交互模块、交互数据变更会触发相关页面重建（哈希包含这些输入）
5. **dev server 注入**：仅 dev 模式注入 SSE 脚本，build 产物不含注入脚本
6. **ESM 模块**：所有 `.js` 文件使用 `import`/`export`，`package.json` 含 `"type": "module"`
