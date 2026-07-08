# render.js / dev.js 规格文档（模板清单驱动版）

此文档定义 AI 生成渲染管线时应产出的 Node.js 脚本完整规格。AI 按此规格生成代码，写入用户项目的 `.xiaoyi-ssg/`。

---

## 技术约束

- **Node.js 18+**（LTS，内置 `fetch`、`fs.cpSync`）
- **ESM 模块系统**（`"type": "module"`，使用 `import`/`export`）
- **路径推导**：`render.js`、`dev.js` 必须从 `import.meta.url` 推导 `PIPELINE_DIR`，再用 `dirname(PIPELINE_DIR)` 推导 `SITE_ROOT`。不要用 `process.cwd()` 作为站点根。
- 依赖：`js-yaml`（YAML 解析）、`marked`（Markdown → HTML）、`chokidar`（文件监听，仅 dev.js）、`eta`（模板引擎）
- 模板引擎：使用 `eta`（~2KB，ESM，支持 HTML 转义、raw HTML、条件、数组循环、异步、自定义过滤器）
- 两个独立文件：`render.js`（构建）、`dev.js`（开发）
- 允许生成 `assets/script.js`、`assets/interactions/*.js`、`assets/data/*.json` 来实现静态托管兼容的浏览器交互；交互不得依赖 dev server 才能工作

---

## Site Language Contract

- The generated renderer must treat `config.site.language` as the authoritative BCP 47 language tag for the site.
- The init/new-site workflow must set `config.site.language` from the user's request language unless the user explicitly specifies another language.
- Templates must use `<html lang="<%= it.site.language || inferredFallback %>">`; the fallback must be the inferred site language from generation time, not a hard-coded English default.
- All user-facing strings produced by templates, generated JavaScript, generated feeds, 404 pages, pagination, search/filter UI, comments UI, aria labels, placeholders, and empty states must be localized to the site language.
- Internal identifiers may remain ASCII/English, but visible text such as "Home", "Search", "Tags", "Comments", "Loading", "No results", "Previous", "Next", and "Page Not Found" must be translated when the site language is not English.
- Generated search indexes may include any content language, but UI labels and result status messages must match `config.site.language`.
- When rendering existing user-authored Markdown, preserve the original content language; do not translate user content unless explicitly requested.

---

## 核心数据结构：template-manifest.json

渲染管线的**单一事实来源**。AI 生成管线时，必须根据用户的内容模型和站点结构意图，生成一份符合 `schemas/template-manifest.json` 的清单。

### 清单结构概览

```json
{
  "version": 1,
  "collections": {
    "posts": {
      "source": "source/_posts",
      "sort": { "field": "date", "order": "desc" },
      "pagination": { "perPage": 10, "path": "/blog/page/{n}/" }
    },
    "landing": { "source": "source/_landing", "singleton": true },
    "docs": { "source": "source/_docs", "sort": { "field": "nav_order" }, "tree": true }
  },
  "templates": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "index", "type": "page", "layout": "base", "file": "index.html", "output": "/", "data": {...} },
    { "name": "list", "type": "page", "layout": "base", "file": "list.html", "output": "{collection.pagination.path}", "forEach": "collections" },
    { "name": "detail", "type": "page", "layout": "base", "file": "detail.html", "output": "/{collection}/{slug}/", "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404.html" }
  ]
}
```

### 关键字段定义

| 字段 | 说明 |
|------|------|
| `collections` | 内容集合定义，键=集合名，值=源路径、排序、分页、singleton、tree 等 |
| `templates[]` | 模板定义数组 |
| `templates[].type` | `"layout"`（布局模板，含 `<%- body %>` 插槽）或 `"page"`（渲染输出页面） |
| `templates[].forEach` | 展开策略：`"collections"`（每集合一份）、`"items"`（每内容项一份）、`"pagination"`（每分页一份）、省略=单次 |
| `templates[].output` | 输出路径模板，支持占位符：`{collection}`、`{slug}`、`{n}`（页码）、`{lang}`、`{date:YYYY}` 等 |
| `templates[].lang` | 可选，语言代码数组，展开时注入 `{lang}` 占位符 |
| `collections[].pagination` | 启用分页时的配置：`perPage`、`path`（含 `{n}` 占位符） |
| `collections[].singleton` | 仅取第一项渲染单页（落地页、关于页等） |
| `collections[].tree` | 构建树形结构（用于文档站侧边栏导航） |

---

## render.js — 核心渲染脚本

### 总体流程

```javascript
async function build(fresh = false) {
  // 1. 加载清单 + 校验
  const manifest = loadManifest();
  validateManifest(manifest);

  // 2. 加载配置、tokens、content-types、interactions
  const config = loadConfig();
  const tokens = loadTokens();
  const contentTypes = loadContentTypes();
  const interactions = loadInteractionsManifest();
  const cache = loadCache();

  // 3. 校验配置
  validateConfig(config);
  validateContentTypes(contentTypes);

  // 4. 扫描内容 → collections 数据
  const collections = scanCollections(manifest, contentTypes);

  // 5. 全局数据
  const nav = buildNav(config, contentTypes);
  const globals = { site: config.site, nav, tokens, build_time: new Date().toISOString() };

  // 6. 初始化 Eta
  const eta = initEta();

  // 7. 展开模板任务
  const tasks = expandTemplates(manifest, collections);

  // 8. 渲染每个任务（增量缓存）
  for (const task of tasks) {
    const hash = computeTaskHash(task, tokens, config, interactions);
    if (!fresh && cacheHit(task.output, hash)) continue;

    const data = { ...globals, ...task.data };
    const html = renderWithLayout(eta, task.layout, task.file, data);
    writeOutput(task.output, html);
    updateCache(task.output, hash);
  }

  // 9. 复制 assets、生成交互数据、feed、sitemap、404
  copyAssets();
  writeExtras(buildExtras(config, collections, interactions));
  generateFeeds(collections, config);
  generateSitemap(tasks, config);
  generate404(config, tokens, eta, nav);

  // 10. 保存缓存、输出摘要
  saveCache(cache);
  printSummary(outputs);
}
```

### 关键函数规格

#### `loadManifest()`
- 读取 `.xiaoyi-ssg/template-manifest.json`
- 按 `schemas/template-manifest.json` 校验
- 校验失败直接 `process.exit(1)`

#### `scanCollections(manifest, contentTypes)`
- 遍历 `manifest.collections`，读取各 `source` 目录下 `.md` 文件
- 解析 front-matter，校验必需字段（参考 `contentTypes.types[collectionName].fields`）
- 生成标准化 item 对象：
  ```js
  { collection, slug, title, date, dateDisplay, tags, categories, cover, excerpt, bodyHtml, draft, navOrder, parent, customFields }
  ```
- 按 `sort.field` / `sort.order` 排序
- 预计算 `pagination`（若定义）：`{ perPage, totalPages, path }`
- 构建 `tree`（若 `tree: true`）：按 `parent`/`navOrder` 组装树形结构
- 返回：`{ [colName]: { items, pagination, tree, singleton } }`

#### `expandTemplates(manifest, collections)`
将声明式模板展开为具体渲染任务列表：

```js
function expandTemplates(manifest, collections) {
  const tasks = [];
  for (const tpl of manifest.templates) {
    if (tpl.type !== 'page') continue;

    const langs = tpl.lang?.length ? tpl.lang : [null];
    const cols = tpl.forEach === 'collections' ? Object.keys(collections) : [null];

    for (const lang of langs) {
      for (const colName of cols) {
        const col = colName ? collections[colName] : null;

        if (tpl.forEach === 'items' && col) {
          for (const item of col.items) tasks.push(instantiate(tpl, { collection: colName, item, lang, col }));
        } else if (tpl.forEach === 'pagination' && col?.pagination) {
          for (let p = 1; p <= col.pagination.totalPages; p++) tasks.push(instantiate(tpl, { collection: colName, page: p, pagination: col.pagination, lang, col }));
        } else if (tpl.forEach === 'collections' && col) {
          tasks.push(instantiate(tpl, { collection: colName, col, lang }));
        } else {
          tasks.push(instantiate(tpl, { collection: colName, col, lang }));
        }
      }
    }
  }
  return tasks;
}

function instantiate(tpl, ctx) {
  return {
    name: tpl.name,
    layout: tpl.layout,
    file: tpl.file,
    output: interpolate(tpl.output, { ...tpl.data, ...ctx }),
    data: { ...tpl.data, ...ctx }
  };
}
```

#### `interpolate(template, ctx)`
路径模板插值，支持占位符：
- `{collection}`、`{slug}`、`{n}`、`{lang}`
- `{date:YYYY}` 等日期格式
- 未定义占位符 → 空字符串

#### `computeTaskHash(task, tokens, config, interactions)`
计算任务输入哈希，用于增量缓存：
```
hash = sha256(
  contentFile (若有) +
  templateFile (task.file) +
  layoutFile (task.layout) +
  JSON.stringify(tokens) +
  JSON.stringify({ site: config.site, pages: config.pages }) +
  JSON.stringify(interactions)
)
```

#### `renderWithLayout(eta, layoutName, templateName, data)`
```js
const body = eta.render(templateName, data);
return eta.render(layoutName, { ...data, body });
```

---

## dev.js — 开发服务器

### 核心结构

```javascript
import { build } from './render.js';
import chokidar from 'chokidar';

// 1. 初次构建
await build(false);

// 2. 启动 HTTP 服务器 serve public/（端口 3000 自动递增）
// 3. 注入 SSE 客户端脚本到 HTML </body> 前
// 4. chokidar 监听：
//    - source/**/*.md
//    - .xiaoyi-ssg/templates/**
//    - .xiaoyi-ssg/assets/**
//    - .xiaoyi-ssg/template-manifest.json
//    - .xiaoyi-ssg/content-types.json
//    - .xiaoyi-ssg/interactions.manifest.json
//    - .xiaoyi-ssg-design-tokens.json
//    - config.yml
//    - source/_media/**
// 5. 变更 → 防抖 300ms → 增量构建 build(false) → SSE 推送 reload
```

### 关键点

- **构建复用**：dev.js `import { build } from './render.js'`，进程内调用，避免 `execSync` 开销
- **监听清单变更**：`template-manifest.json` 变更触发完整重新展开 + 渲染
- **SSE 注入**：仅 dev 模式注入，build 产物不含

---

## 交互数据生成（buildExtras）

在构建末期生成 `public/assets/data/*.json`，供浏览器交互消费：

```javascript
function buildExtras(config, collections, interactions) {
  const data = {};
  for (const interaction of interactions.interactions || []) {
    if (interaction.name.includes('search')) {
      const allItems = Object.values(collections).flatMap(c => c.items);
      data['search-index.json'] = allItems.map(item => ({
        title: item.title, url: item.url, type: item.collection,
        excerpt: item.excerpt || '', tags: item.tags || [],
        text: [item.title, item.excerpt].filter(Boolean).join(' ')
      }));
    }
    if (interaction.name.includes('filter')) {
      const types = interaction.content_types || Object.keys(collections);
      data[`${interaction.name}.json`] = {
        items: types.flatMap(type => (collections[type] || { items: [] }).items.map(item => ({
          title: item.title, url: item.url, type,
          tags: item.tags || [], categories: item.categories || [], date: item.date || ''
        })))
      };
    }
  }
  return data;
}
```

---

## 附加产物

| 产物 | 生成方式 |
|------|----------|
| `feed.xml` / `feed.json` | 遍历 `collections.posts` 或 `collections.articles` 前 50 项 |
| `sitemap.xml` | 遍历所有 `tasks` 的 `output`（排除 404） |
| `404.html` | 渲染 `404` 模板（清单中声明） |

---

## 缓存文件格式

`.xiaoyi-ssg-cache.json`：
```json
{
  "version": 1,
  "outputs": {
    "/blog/page/1/": { "hash": "sha256...", "inputs": ["template-manifest.json", "list.html", "base.html"] }
  }
}
```

---

## 生成时的占位符替换

AI 生成 `render.js` / `dev.js` 时，替换文件头部元数据：

```javascript
/**
 * xiaoyi-ssg 渲染管线 - 模板清单驱动版
 * 重新生成：/xiaoyi-ssg → 调整风格/内容类型 → 重新生成管线
 * 生成时间: {{GENERATED_AT}}
 * 清单哈希: {{MANIFEST_HASH}}
 * Tokens Hash: {{TOKENS_HASH}}
 * Content-Types Hash: {{CONTENT_TYPES_HASH}}
 */
```

---

## 关键生成约束

1. **ESM 模块** — 所有 `.js` 使用 `import`/`export`，`package.json` 含 `"type": "module"`
2. **两文件分离** — `render.js`（构建）、`dev.js`（开发）各自独立
3. **依赖默认最小** — `js-yaml`、`marked`、`chokidar`、`eta`；交互需要额外包时固定版本并记录到 `interactions.manifest.json`
4. **模板能力完整** — Eta 支持 HTML 转义、raw HTML、条件、数组循环、异步、自定义过滤器
5. **确定性** — 相同输入产生相同输出（缓存哈希机制）
6. **增量构建** — 哈希缓存机制，未变任务跳过渲染
7. **浏览器交互** — build 产物必须能加载 `assets/script.js` 与所需模块
8. **dev server 注入** — 仅 dev 模式注入 SSE 脚本
9. **端口自动递增** — dev.js 端口被占用时自动 +1 重试
10. **防抖** — 文件变更后 300ms 防抖 + 构建锁
11. **运行时校验** — 启动时校验 manifest、config、tokens、content-types
12. **无回退分支** — 无 manifest 或校验失败直接报错退出，**不兼容旧版管线**