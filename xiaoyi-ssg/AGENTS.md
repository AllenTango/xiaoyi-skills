# AGENTS.md — xiaoyi-ssg 开发指导

本文件用于开发/维护 `xiaoyi-ssg` skill（位于 `<SKILL_DIR>`）时的 AI 协作约定。**它不是生成站点的指导**（生成站点的指导在生成的渲染管线中）。

## 路径约定

- **`<SKILL_DIR>`**：本 skill 自身的目录绝对路径，随安装位置而变。本文中所有指向本 skill 自身文件的位置统一用 `<SKILL_DIR>` 占位。
- **`<SITE_ROOT>`**：用户正在操作的站点根目录（含 `config.yml`）。**不在 `<SKILL_DIR>` 内**。AI 在每次会话中从当前工作目录向上查找 `config.yml` 确定。
- **`<PIPELINE_DIR>`**：`<SITE_ROOT>/.xiaoyi-ssg/` — 生成的专用渲染管线目录。

## 核心约定

1. **单一入口**：`/xiaoyi-ssg` 是唯一 slash 命令。AI 通过对话理解用户意图并执行相应动作。
2. **生成而非解析**：不再有固定模板。**初始化/主题变更/内容类型变更时，AI 生成完整渲染管线**写入 `<PIPELINE_DIR>`。
3. **管线自运行**：后续 `build` 由用户直接运行 `node <PIPELINE_DIR>/render.js`，**无需 AI 参与**，保证确定性、可复现、可 CI/CD。
4. **设计系统持久化**：`<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json` 记录完整设计 token，管线生成时内联到模板/CSS，运行时不再解析。
5. **Skill 无状态**：不写 `<SKILL_DIR>/state.json`。站点定位靠「从 cwd 向上找 config.yml」。
6. **对话驱动设计**：设计灵感来自用户对话描述、参考链接、截图，**无内置主题/参考库**。
7. **Node.js 优先**：安装本 skill 需 `npx skills add`（依赖 Node.js），用户环境必有 Node.js，故渲染管线基于 Node.js。
8. **交互不是附属品**：网站需要搜索、筛选、主题切换、灯箱、表单校验、播放器、图表、地图等行为时，必须生成静态托管兼容的浏览器 JS、数据文件和 fallback，不得为了“纯静态”删减必要交互。
9. **保护 source 内容**：`source/` 是用户内容区。除 INIT/NEW_CONTENT/CONTENT_EDIT/DEFINE_CONTENT_TYPE 中明确允许的新增目录或指定文件修改外，REGENERATE_PIPELINE、STYLE、INTERACTION、BUILD、DEV、PREVIEW、DIAGNOSE 均不得覆盖、删除、格式化或批量重写 `source/**/*.md` 与 `source/_media/**`。

## 文件职责

| 文件 | 职责 | 修改触发 |
|------|------|----------|
| `SKILL.md` | 技能定义、frontmatter、工作流、交互契约 | 交互流程/能力变更 |
| `AGENTS.md` | 本文件：开发 AI 协作约定 | 开发约定变更 |
| `README.md` | 人读使用说明、安装、交互示例 | 用法/安装步骤变更 |
| `prompts/pipeline-generation.md` | 指导 AI 生成完整渲染管线 | 管线结构/模板策略/CSS生成策略变更 |
| `prompts/reference-analysis.md` | 指导 AI 分析参考站点提取设计意图 | 分析维度/输出格式变更 |
| `prompts/content-type-definition.md` | 指导 AI 引导用户定义内容类型 | 内容类型定义流程/字段类型变更 |
| `prompts/design-system-extraction.md` | 指导 AI 融合生成 design-tokens | Token 结构/生成策略变更 |
| `prompts/render-node-spec.md` | 渲染脚本（Node.js）完整规格 | 渲染脚本结构/算法变更 |
| `schemas/design-tokens.json` | 设计 token JSON Schema（校验用） | Token 字段增减 |
| `schemas/config.schema.json` | 配置 schema 模板（管线生成时裁剪） | 配置字段增减 |

---

## AI 编排逻辑（核心）

### 入口：`/xiaoyi-ssg`

用户输入 `/xiaoyi-ssg` 或 `/xiaoyi-ssg <初始意图>` 时，AI 执行：

```
1. 定位站点根：
   - 从 cwd 向上查找 config.yml
   - 找到 → <SITE_ROOT> = 该目录
   - 未找到 → 识别为 INIT_PIPELINE 意图，引导新建站点

2. 读取上下文（若站点存在）：
   - config.yml
   - .xiaoyi-ssg-design-tokens.json（若存在）
   - .xiaoyi-ssg/content-types.json（若存在）
   - source/**/*.md 列表（按 content-types 分组）
   - .xiaoyi-ssg/pipeline-manifest.json（若存在，含生成元数据）

3. 识别意图（结合用户输入 + 上下文）：
   - INIT_PIPELINE: 无 config.yml，或用户明确说「新建站点/项目」
   - RUN_BUILD: 「构建/生成/发布/预览」且管线已存在
   - RUN_DEV: 「开发/实时/监听/watch」且管线已存在
   - REGENERATE_PIPELINE: 「换风格/调整布局/改配色/改主题/加内容类型/改内容类型」
   - DEFINE_CONTENT_TYPE: 「加个XX类型/新增内容类型」
   - ANALYZE_REFERENCE: 「参考这个网站/像xxx.com一样」
   - CONTENT_EDIT: 「改标题/加标签/改日期/修改正文」— 定位文件编辑
   - PREVIEW: 「预览/看看效果/本地服务」— 建议运行 build 后预览
   - DIAGNOSE: 「检查/诊断/哪里不对」
   - HELP: 「怎么用/帮助/命令有哪些」

4. 执行对应动作（见下「动作实现」），必要时追问澄清。
5. 返回结果 + 下一步建议。
```

### 意图识别规则

| 用户表述示例 | 识别意图 | 所需上下文 |
|-------------|---------|-----------|
| "新建一个作品集站点" / "init a portfolio" | INIT_PIPELINE | 无/当前目录 |
| "参考 https://example.com 做一个" | INIT_PIPELINE + ANALYZE_REFERENCE | URL |
| "构建/生成站点" / "build" | RUN_BUILD | 管线需存在 |
| "开发模式" / "实时预览" / "watch" / "dev" | RUN_DEV | 管线需存在 |
| "换个风格，更极简些" / "调暗色" | REGENERATE_PIPELINE | 当前 tokens + pipeline-manifest |
| "加个'项目'类型，有封面、技术栈、链接" | DEFINE_CONTENT_TYPE | 当前 content-types |
| "把这篇文章标题改成..." | CONTENT_EDIT | 需定位文件 |
| "预览一下" | PREVIEW | build 后或直接 dev |
| "检查有没问题" | DIAGNOSE | scan 逻辑 |

**歧义处理**：若意图不明确，AI 主动追问（如：「您是想调整视觉风格、还是新增内容类型？」）。

---

### 动作实现

#### INIT_PIPELINE（初始化生成渲染管线）

```
1. 对话发现需求：
   - "想做什么样的站点？有参考链接/截图/文字描述？"
   - 用户给出：参考 URL、或文字描述（如"极简技术博客"、"作品集"、"文档站"）

2. 参考站点分析（若有 URL）：
   - 调用 WebFetch 抓取页面 HTML
   - 按 prompts/reference-analysis.md 提取：色彩、字体、间距、布局模式、组件风格、交互模式
   - 输出结构化设计意图：design-intent.json

3. 澄清内容模型：
   - "需要什么内容类型？例如：文章、项目、视频、图集、页面..."
   - 对每类型追问字段：必需/可选、媒体字段、关系字段
   - 按 prompts/content-type-definition.md 生成 content-types.json
   - 示例输出见下「内容类型定义规范」

4. 确定站点结构：
   - 导航项顺序、首页布局偏好、列表/详情页结构
   - 生成 config.yml（含 site 基础信息、pages 顺序、per_page 等）

5. 生成设计系统：
   - 融合：参考站提取的 design-intent + 用户偏好描述
   - 按 prompts/design-system-extraction.md 生成完整 .xiaoyi-ssg-design-tokens.json
   - 必含字段：color, typography, layout, component, motion, seed

6. 生成渲染管线：
   - 读取 prompts/pipeline-generation.md + prompts/render-node-spec.md
   - 输入：tokens + content-types + config + 组件需求清单
   - 一次性生成 <PIPELINE_DIR>/ 全部文件（见下「渲染管线产物规格」）

7. 落盘文件：
   - config.yml
   - .xiaoyi-ssg-design-tokens.json
   - .xiaoyi-ssg/content-types.json
   - source/ 目录结构（按 content-types 创建缺失的 _<type>/，创建 source/_media/；不得覆盖已有文件）
    - <PIPELINE_DIR>/ (render.js, dev.js, package.json, templates/, assets/, config.schema.json, pipeline-manifest.json)
   - .gitignore（忽略 public/, .DS_Store, *.log, .xiaoyi-ssg-cache.json, .xiaoyi-ssg/node_modules/）

8. 安装依赖并首次构建：
   - 在 <PIPELINE_DIR>/ 执行 `npm install`
   - 执行首次构建：`cd .xiaoyi-ssg && npm run build`
   - 输出成功提示

9. 建议下一步：
   - 实时开发：`cd .xiaoyi-ssg && npm run dev`
   - 添加内容：`/xiaoyi-ssg` → "新增文章..."
   - 部署：`cd .xiaoyi-ssg && npm run build` → 部署 public/
```

#### RUN_BUILD（运行渲染管线）

```
前置：<PIPELINE_DIR>/render.js 必须存在

执行：运行 `node .xiaoyi-ssg/render.js [--fresh]`

渲染脚本逻辑（Node.js ESM，详见 prompts/render-node-spec.md）：
1. 读取 config.yml + .xiaoyi-ssg-design-tokens.json + content-types.json
2. 扫描 source/ 按 content-types 分组解析 front-matter（校验必需字段）
3. 读取 .xiaoyi-ssg-cache.json
4. 计算全局数据：nav 数组、pagination 计划、prev/next 映射
5. 对每个输出路径计算输入哈希：内容文件 + 使用的模板文件 + tokens + config 关键字段 + interactions manifest + assets
6. 增量判断：哈希未变且非 --fresh → 复用 public/ 现有文件；否则重新渲染
7. 生成交互数据：搜索索引、筛选 facets、gallery/chart 数据等静态 JSON 或 data attributes
8. 渲染：模板必须支持 HTML 转义、raw HTML、条件、数组循环、属性安全输出和 `data-*` 交互钩子
9. 写入 public/<path>/index.html
10. 复制 assets/ → public/assets/
11. 生成 feeds (RSS/JSON)、sitemap.xml、404.html
12. 更新 .xiaoyi-ssg-cache.json
13. 输出摘要：文件数、已启用交互、耗时、缓存命中率、警告
```

#### RUN_DEV（实时开发模式）

```
前置：<PIPELINE_DIR>/dev.js 必须存在

执行：运行 `node .xiaoyi-ssg/dev.js [--port 3000]`

dev server 逻辑（详见 prompts/render-node-spec.md）：
1. 启动 HTTP 服务器（默认端口 3000，被占用则自动递增），serve public/
2. 启动 chokidar 监听：
   - source/**/*.md（内容变更）
   - .xiaoyi-ssg/templates/**（模板变更）
   - .xiaoyi-ssg-design-tokens.json（设计变更）
   - config.yml（配置变更）
   - source/_media/**（媒体变更）
3. 检测到变更：
   a. 运行增量构建（复用 render.js 逻辑）
   b. 通过 SSE（Server-Sent Events）推送 reload 事件
4. HTTP 响应拦截：在 HTML 的 </body> 前注入 SSE 客户端脚本
5. 控制台输出：变更文件、重建页面数、耗时、访问 URL

用户工作流：
- 终端启动 dev server
- AI 新增/编辑内容 → dev server 检测 → 增量构建 → 浏览器自动刷新
- 用户直接编辑 md → 同上
```

#### REGENERATE_PIPELINE（重新生成渲染管线）

```
触发：主题/布局/配色调整、内容类型增删改

1. 读取当前：
   - .xiaoyi-ssg-design-tokens.json
   - .xiaoyi-ssg/content-types.json
   - .xiaoyi-ssg/pipeline-manifest.json
   - config.yml

2. 对话澄清调整方向：
   a. 微调 tokens：读取当前 tokens → 交互修改特定字段 → 写回
   b. 重新分析参考：用户给新 URL/描述 → 重新分析 → 生成新 tokens
   c. 结构性布局变更：修改 layout token（container/grid/sidebar/header/footer）
   d. 内容类型变更：调用 DEFINE_CONTENT_TYPE 逻辑增删改 content-types.json

3. 任何变更后：重新执行 INIT_PIPELINE 步骤 6（生成渲染管线）覆盖 <PIPELINE_DIR>/
   - 保留 package.json 中的用户自定义依赖（若有）
   - pipeline-manifest.json 记录：生成时间、主题参考来源、tokens hash、content-types hash
   - 若 package.json 变更，重新执行 npm install
   - 禁止修改 `source/**/*.md` 和 `source/_media/**`
   - 仅当内容类型新增且目录不存在时，允许创建对应 `source/_<type>/` 空目录

4. 提示用户：在 `<SITE_ROOT>/.xiaoyi-ssg/` 内运行 `npm run build:fresh` 或 `npm run dev` 查看效果
```

#### DEFINE_CONTENT_TYPE（定义/修改内容类型）

```
1. 追问类型名称（kebab-case，如 project, talk, essay）
2. 追问字段定义（按 prompts/content-type-definition.md）：
   - 必需字段：title, date 等
   - 可选字段：tags[], categories[], cover, excerpt
   - 媒体字段：images[], video_url+embed_type, audio_url
   - 关系字段：related[], series
   - 自定义字段：任意键值
3. 生成/更新 content-types.json（含 JSON Schema 兼容的字段定义）
4. 仅在目录不存在时创建 source/_<type>/ 目录；不得修改该目录下已有内容
5. 触发 REGENERATE_PIPELINE（重新生成对应 list/detail 模板）
```

#### CONTENT_EDIT（编辑内容）

```
1. 解析/询问定位：类型 + 标题/日期/标签 → 定位 source/_<type>/<slug>.md
2. 追问修改项：标题、日期、标签、分类、封面、正文、自定义字段
3. 更新 front-matter 和/或正文
4. 提示：若 dev server 运行中 → 自动刷新；否则运行 build 即可增量更新
```

#### PREVIEW（预览）

```
1. 若 public/ 不存在或内容已变更 → 提示先运行 build
2. 建议：
   - 实时开发：node .xiaoyi-ssg/dev.js（watch + live reload）
   - 或直接：open public/index.html
```

#### DIAGNOSE（诊断）

```
执行内存扫描（无外部脚本）：
- config.yml 存在性、YAML 解析、必需字段（按 config.schema.json 校验）
- .xiaoyi-ssg-design-tokens.json 存在性、Schema 校验
- .xiaoyi-ssg/content-types.json 存在性、Schema 校验
- <PIPELINE_DIR>/render.js 存在性
- <PIPELINE_DIR>/package.json 存在性、node_modules/ 是否已安装
- content-types 定义的目录是否存在
- 内容文件 front-matter 符合对应 content-type 定义
- slug 去重（同类型内）
- 本地媒体文件存在性
输出：人类可读列表 + 问题分级（error/warning）
```

#### ANALYZE_REFERENCE（分析参考站点）

```
输入：用户提供的 URL
1. WebFetch 抓取 HTML（必要时抓取 CSS/JS）
2. 按 prompts/reference-analysis.md 提取：
   - 色彩：主色、背景、文字、强调、边框、语义色
   - 字体：标题/正文/等宽字体栈、字级层级
   - 间距：容器宽度、节奏、间隙、圆角
   - 布局：栏数、侧边栏、header/footer 风格、英雄区
   - 组件：卡片、导航、按钮、表单、分页、面包屑风格
   - 动效：入场、悬停、焦点、页面切换倾向
3. 输出 design-intent.json 供设计系统生成使用
```

---

## 内容类型定义规范

**文件**：`<SITE_ROOT>/.xiaoyi-ssg/content-types.json`

```json
{
  "version": 1,
  "types": {
    "post": {
      "label": "文章",
      "dir": "source/_posts",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "datetime", "required": true },
        "tags": { "type": "string[]", "required": false },
        "categories": { "type": "string[]", "required": false },
        "cover": { "type": "string", "required": false },
        "excerpt": { "type": "string", "required": false },
        "draft": { "type": "boolean", "default": false }
      },
      "list_template": "list-post.html",
      "detail_template": "detail-post.html",
      "per_page": 10
    },
    "project": {
      "label": "项目",
      "dir": "source/_projects",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "date", "required": true },
        "cover": { "type": "string", "required": true },
        "tech_stack": { "type": "string[]", "required": false },
        "repo_url": { "type": "url", "required": false },
        "live_url": { "type": "url", "required": false },
        "description": { "type": "string", "required": true },
        "featured": { "type": "boolean", "default": false }
      },
      "list_template": "list-project.html",
      "detail_template": "detail-project.html",
      "per_page": 12
    }
  },
  "nav_order": ["post", "project", "about"]
}
```

**字段类型**：`string`, `datetime`, `date`, `boolean`, `string[]`, `url`, `number`, `object`。

---

## 设计系统规范

**文件**：`<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json`

```json
{
  "version": 1,
  "theme_ref": "reference-url|custom",
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

---

## 渲染管线产物规格

**目录**：`<SITE_ROOT>/.xiaoyi-ssg/`

```
.xiaoyi-ssg/
├── render.js                 # 核心渲染脚本（Node.js ESM，增量构建）
├── dev.js                    # 开发服务器（watch + serve + live reload via SSE）
├── package.json              # 依赖声明（js-yaml, marked, chokidar, eta）
├── package-lock.json         # 依赖锁定（npm install 生成）
├── node_modules/             # 管线依赖（git 忽略）
├── templates/                # 该项目专用模板（Eta 引擎）
│   ├── base.html             # 布局骨架：header + main + footer
│   ├── list-<type>.html      # 列表页模板（含 pagination、card grid）
│   ├── detail-<type>.html    # 详情页模板（含 prev/next、完整内容）
│   ├── page.html             # 通用页面模板
│   └── index.html            # 首页模板（聚合或重定向）
├── assets/
│   ├── style.css             # 完整 CSS（含 Critical CSS 注释标记）
│   ├── script.js             # 交互入口（移动端菜单、搜索、筛选、灯箱等）
│   ├── interactions/         # 可选交互模块
│   └── data/                 # 可选静态 JSON 数据
├── interactions.manifest.json # 交互契约、依赖、fallback、验证点
├── config.schema.json        # 配置校验 schema（从模板裁剪）
├── content-types.json        # 内容类型定义（副本，供渲染脚本校验）
└── pipeline-manifest.json    # 管线元数据
```

### package.json（生成到用户项目）

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

### pipeline-manifest.json

```json
{
  "version": 1,
  "generated_at": "2025-01-15T14:30:00Z",
  "theme_ref": "reference-url",
  "theme_manifesto_hash": "sha256:...",
  "tokens_hash": "sha256:...",
  "content_types_hash": "sha256:...",
  "templates": [
    "base.html",
    "list-post.html",
    "detail-post.html",
    "page.html",
    "index.html"
  ],
  "renderer_version": "2.0",
  "runtime": "node"
}
```

---

## 渲染脚本核心规格（供 prompts/render-node-spec.md 生成）

### 技术约束
- Node.js 18+（LTS，内置 `fetch`、`fs.cpSync`）
- ESM 模块系统（`"type": "module"`，使用 `import`/`export`）
- 依赖：`js-yaml`（YAML 解析）、`marked`（Markdown 解析）、`chokidar`（文件监听，仅 dev.js）、`eta`（模板引擎）
- 模板引擎：使用 `eta`（~2KB，ESM，支持 HTML 转义、raw HTML、条件、数组循环、异步、自定义过滤器）
- 两文件分离：`render.js`（构建）+ `dev.js`（开发）
- 运行时校验：render.js 启动时校验 config.yml、design-tokens.json、content-types.json
- 可选图片处理：sharp（需单独安装），生成响应式尺寸 + WebP + blur placeholder

### render.js 核心

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg 渲染管线 - 自动生成，请勿手动修改
 * 重新生成：/xiaoyi-ssg → 调整风格/内容类型 → 重新生成管线
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { Eta } from 'eta';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
const PUBLIC_DIR = join(SITE_ROOT, 'public');
const CACHE_FILE = join(SITE_ROOT, '.xiaoyi-ssg-cache.json');

// 加载配置与数据
const config = yaml.load(readFileSync(join(SITE_ROOT, 'config.yml'), 'utf-8'));
const tokens = JSON.parse(readFileSync(join(SITE_ROOT, '.xiaoyi-ssg-design-tokens.json'), 'utf-8'));
const contentTypes = JSON.parse(readFileSync(join(PIPELINE_DIR, 'content-types.json'), 'utf-8'));
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) : { version: 1, outputs: {} };

// 初始化 Eta 模板引擎
const eta = new Eta({
  views: join(PIPELINE_DIR, 'templates'),
  cache: true,
  rmWhitespace: false,
});

const fresh = process.argv.includes('--fresh');

// ... 主流程：scanContent → buildNav/Pagination/PrevNext → renderAllPages → copyAssets → generateFeeds/Sitemap/404 → saveCache → printSummary
```

### dev.js 核心

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg 开发服务器 - 实时渲染 + Live Reload
 */
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { build } from './render.js';
import chokidar from 'chokidar';

// 1. 启动 HTTP 服务器 serve public/
// 2. chokidar 监听 source/ + templates/ + tokens + config
// 3. 变更 → 增量构建（进程内执行，避免 execSync 开销） → SSE 推送 reload
// 4. HTML 响应注入 SSE 客户端脚本

const SSE_SCRIPT = `<script>const __sfEs=new EventSource('/__live');__sfEs.addEventListener('reload',()=>location.reload());</script>`;

// 端口自动递增：3000 被占用 → 3001 → ... 
```

### 模板数据契约

每个模板接收统一数据结构：

```javascript
const data = {
  site: config.site,                    // {title, subtitle, author, email, language, timezone, url, description}
  nav: navItems,                        // [{title, url, active, children}]
  page: {
    type: "list|detail|page|index",
    title: "...",
    url: "/blog/",
    breadcrumb: [{title: "Home", url: "/"}, {title: "Blog", url: "/blog/"}],
  },
  pagination: {                         // 仅列表页
    current: 1,
    total: 5,
    base_url: "/blog/",
    pages: [1, 2, 3, "...", 5],
    prev_url: null,
    next_url: "/blog/page/2/"
  },
  items: [...],                         // 列表页：内容摘要数组
  item: {...},                          // 详情页：单条内容完整数据（含 body_html）
  prev_item: {...},                     // 详情页：上一篇
  next_item: {...},                     // 详情页：下一篇
  tokens: tokens,                       // 设计 token（极少数运行时判断用）
  build_time: "ISO8601",
};
```

模板使用 Eta 引擎渲染，支持 HTML 转义、raw HTML、条件、数组循环、异步、自定义过滤器。

内容项标准字段：

```javascript
{
  type: "post",
  slug: "hello-world",
  title: "Hello World",
  date: "2025-01-15",
  date_display: "2025-01-15",
  tags: ["tag1", "tag2"],
  categories: ["cat1"],
  cover: "/images/cover.jpg",
  excerpt: "摘要文本...",
  url: "/blog/hello-world/",
  body_html: "<p>正文 HTML...</p>",  // 仅详情页
  custom_fields: {...}
}
```

---

## 缓存机制

**文件**：`<SITE_ROOT>/.xiaoyi-ssg-cache.json`

```json
{
  "version": 1,
  "outputs": {
    "public/blog/hello-world/index.html": {
      "hash": "sha256:...",
      "inputs": [
        "source/_posts/2025-01-15-hello-world.md",
        ".xiaoyi-ssg/templates/detail-post.html",
        ".xiaoyi-ssg/templates/base.html"
      ],
      "template_names": ["detail-post", "base"]
    }
  }
}
```

**算法**：
- 对每个输出文件，计算输入哈希：内容文件 + 使用的模板文件 + tokens + config 关键字段 + interactions manifest + 交互模块 + 数据文件 + 样式/脚本 → SHA256（`crypto.createHash`）
- 若哈希匹配缓存且非 `--fresh` → **跳过渲染**，直接复用 `public/` 现有文件
- `--fresh`：忽略缓存，强制重新渲染所有页面
- 单页构建（隐式）：只处理变更内容关联的输出，其余复用

---

## 测试清单

修改逻辑后，至少验证：

1. **新建站点**：`/xiaoyi-ssg` → 对话 → 生成 config.yml + content-types + tokens + pipeline + source/ + npm install + 首次 build
2. **运行构建**：`node .xiaoyi-ssg/render.js` → public/ 完整站点（HTML、CSS、JS、feed、sitemap、404）
3. **可复现**：连续两次 `render.js` → 输出文件逐字节相同（除时间戳字段）
4. **缓存失效**：修改一篇内容 → 再次 `render.js` → 仅该内容相关页面重建，其他复用
5. **强制刷新**：`render.js --fresh` → 所有页面重新渲染
6. **实时开发**：`cd .xiaoyi-ssg && npm run dev` → 修改 md → 浏览器自动刷新
7. **风格调整**：`/xiaoyi-ssg` → "调整配色/布局" → 更新 tokens → 重新生成管线 → `render.js --fresh` → 生效
8. **内容类型增删**：`/xiaoyi-ssg` → "加个'项目'类型" → 定义字段 → 重新生成管线 → 可用
9. **参考站点分析**：给 URL → AI 提取设计意图 → 融合生成 tokens

---

> 维护原则：**文档先行，约定优于配置，AI 可执行即文档完备。**
> 核心范式：**对话生成管线 → 管线自运行 → 迭代重新生成管线**。
