# Template Manifest Generation Prompt

指导 AI 根据用户的站点意图与内容模型，生成 `.xiaoyi-ssg/template-manifest.json`。

> **核心原则**：引擎（render.js）不知道任何具体站点类型。AI 现场组装清单，引擎只解释 JSON。
> 无 "落地页模式/博客模式/文档站模式" 等引擎内置概念——只有"AI 选择如何组合 manifest 字段"。

---

## 清单结构（强制）

参考 `schemas/template-manifest.json`：

```typescript
{
  version: 1,
  collections: {
    [collectionName: string]: {
      source: string,                   // 内容源目录，如 "source/_posts"
      sort?: { field: string, order: 'asc'|'desc' },
      pagination?: { perPage: number, path: string },  // path 含 {n} 占位符
      singleton?: boolean,              // 仅取第一项渲染单页
      tree?: boolean,                   // 构建树形结构（文档站侧边栏用）
    }
  },
  templates: [
    {
      name: string,
      type: 'layout' | 'page',
      layout?: string,                  // type=page 时必填，引用 layout 模板名
      file: string,                     // templates/ 下的文件名
      output?: string,                  // type=page 时必填，含占位符
      data?: object,                    // 静态数据绑定
      forEach?: 'collections' | 'items' | 'pagination',
      lang?: string[],                  // 多语言展开
    }
  ],
  globals?: { site?, nav?, tokens? },
}
```

---

## 关键字段决策指南

### 1. `collections` —— 每个内容类型对应一个集合

| 用户意图 | 集合配置 |
|---------|----------|
| "博客文章" | `posts: { source: "source/_posts", sort: {field: "date", order: "desc"}, pagination: {perPage: 10, path: "/blog/page/{n}/"} }` |
| "项目展示" | `projects: { source: "source/_projects", sort: {field: "date", order: "desc"}, pagination: {perPage: 12, path: "/projects/page/{n}/"} }` |
| "落地页（单页）" | `landing: { source: "source/_landing", singleton: true }` |
| "文档站" | `docs: { source: "source/_docs", sort: {field: "nav_order", order: "asc"}, tree: true }` |
| "关于页（单例）" | `about: { source: "source/_about", singleton: true }` |

### 2. `templates[].forEach` —— 模板展开策略

| 值 | 含义 | 典型用途 |
|----|------|---------|
| `"collections"` | 对每个集合各展开一次 | 列表页（posts、projects 各一套） |
| `"items"` | 对集合内每个内容项各展开一次 | 详情页、文章页、文档页 |
| `"pagination"` | 对每个分页各展开一次 | 分页列表（与 pagination 配合） |
| 省略 | 仅展开一次 | 首页、404、singleton 单页 |

### 3. `output` —— 输出路径模板

占位符：
- `{collection}` —— 集合名（展开时可用）
- `{slug}` —— 内容项 slug（`forEach: "items"` 时）
- `{n}` —— 页码（`forEach: "pagination"` 时）
- `{lang}` —— 语言代码（多语言时）
- `{date:YYYY-MM-DD}` —— 日期格式

示例：
- `/{slug}/` —— 详情页：`/hello-world/`
- `/blog/page/{n}/` —— 分页：`/blog/page/2/`
- `/projects/{slug}/` —— 项目详情：`/projects/site-forge/`
- `/{lang}/blog/{slug}/` —— 多语言：`/zh/blog/hello/`

### 4. `singleton` 与 `tree` —— 特殊形态

- `singleton: true` —— 集合内**只渲染一项**（取第一项）。用于落地页、关于页、单例内容。
- `tree: true` —— 构建**树形结构**（基于 `parent` / `nav_order` 字段）。用于文档站侧边栏、分类树。

---

## 模式组装示例（仅供参考，AI 可现场组合新模式）

### 模式 A：纯落地页

用户："做个产品落地页，只要首页"

```json
{
  "version": 1,
  "collections": {
    "landing": { "source": "source/_landing", "singleton": true }
  },
  "templates": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "landing", "type": "page", "layout": "base", "file": "landing.html", "output": "/",
      "data": { "collection": "landing", "singleton": true } },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404.html" }
  ]
}
```

### 模式 B：博客/作品集

用户："技术博客 + 作品集"

```json
{
  "version": 1,
  "collections": {
    "posts": { "source": "source/_posts", "sort": { "field": "date", "order": "desc" },
      "pagination": { "perPage": 10, "path": "/blog/page/{n}/" } },
    "projects": { "source": "source/_projects", "sort": { "field": "date", "order": "desc" },
      "pagination": { "perPage": 12, "path": "/projects/page/{n}/" } }
  },
  "templates": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "index", "type": "page", "layout": "base", "file": "index.html", "output": "/" },
    { "name": "list", "type": "page", "layout": "base", "file": "list.html",
      "output": "{collection.pagination.path}", "forEach": "collections" },
    { "name": "detail", "type": "page", "layout": "base", "file": "detail.html",
      "output": "/{collection}/{slug}/", "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404.html" }
  ]
}
```

### 模式 C：文档站

用户："做个像 VitePress 的文档站"

```json
{
  "version": 1,
  "collections": {
    "docs": { "source": "source/_docs", "sort": { "field": "nav_order", "order": "asc" }, "tree": true }
  },
  "templates": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "doc-index", "type": "page", "layout": "base", "file": "doc-index.html",
      "output": "/docs/", "data": { "collection": "docs", "tree": true } },
    { "name": "doc-page", "type": "page", "layout": "base", "file": "doc-page.html",
      "output": "/docs/{slug}/", "data": { "collection": "docs", "tree": true },
      "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404.html" }
  ]
}
```

### 模式 D：组合站点（落地页首页 + 博客 + 文档站）

用户："产品官网首页 + 用户博客 + 帮助文档"

```json
{
  "version": 1,
  "collections": {
    "landing": { "source": "source/_landing", "singleton": true },
    "posts": { "source": "source/_posts", "sort": { "field": "date" },
      "pagination": { "perPage": 10, "path": "/blog/page/{n}/" } },
    "docs": { "source": "source/_docs", "sort": { "field": "nav_order" }, "tree": true }
  },
  "templates": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "landing", "type": "page", "layout": "base", "file": "landing.html", "output": "/",
      "data": { "collection": "landing", "singleton": true } },
    { "name": "blog-list", "type": "page", "layout": "base", "file": "blog-list.html",
      "output": "{collection.pagination.path}", "forEach": "collections" },
    { "name": "blog-detail", "type": "page", "layout": "base", "file": "blog-detail.html",
      "output": "/blog/{slug}/", "forEach": "items" },
    { "name": "doc-index", "type": "page", "layout": "base", "file": "doc-index.html",
      "output": "/docs/", "data": { "collection": "docs", "tree": true } },
    { "name": "doc-page", "type": "page", "layout": "base", "file": "doc-page.html",
      "output": "/docs/{slug}/", "data": { "collection": "docs", "tree": true },
      "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404.html" }
  ]
}
```

### 模式 E：多语言组合站

用户："产品落地页 + 文档站，中英文"

```json
{
  "version": 1,
  "collections": {
    "landing": { "source": "source/_landing", "singleton": true },
    "docs": { "source": "source/_docs", "sort": { "field": "nav_order" }, "tree": true }
  },
  "templates": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "landing", "type": "page", "layout": "base", "file": "landing.html",
      "output": "/{lang}/", "data": { "collection": "landing", "singleton": true },
      "lang": ["zh", "en"] },
    { "name": "doc-index", "type": "page", "layout": "base", "file": "doc-index.html",
      "output": "/{lang}/docs/", "data": { "collection": "docs", "tree": true },
      "lang": ["zh", "en"] },
    { "name": "doc-page", "type": "page", "layout": "base", "file": "doc-page.html",
      "output": "/{lang}/docs/{slug}/", "data": { "collection": "docs", "tree": true },
      "forEach": "items", "lang": ["zh", "en"] },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html",
      "output": "/{lang}/404.html", "lang": ["zh", "en"] }
  ]
}
```

---

## 生成检查清单

AI 生成 manifest 后必须自检：

- [ ] `version: 1` 存在
- [ ] 至少有一个 `layout` 类型的模板（通常是 `base`）
- [ ] 所有 `type: "page"` 的模板都引用了存在的 layout
- [ ] 所有 `type: "page"` 的模板都有 `output`
- [ ] 所有 `forEach: "items"` 的模板对应集合存在且有 `source`
- [ ] 所有 `forEach: "pagination"` 的模板对应集合定义了 `pagination`
- [ ] `output` 中的占位符与展开策略匹配
- [ ] `404` 模板存在

---

## 主题切换下的 manifest

若启用主题资产库（`themes/<name>/`），**每套主题携带自己的 manifest**：

```
themes/
├── minimal/
│   ├── template-manifest.json     ← 主题专属清单
│   ├── templates/
│   └── assets/
├── dark-editorial/
│   ├── template-manifest.json
│   ├── templates/
│   └── assets/
```

`SWITCH_THEME` 操作：
1. 复制目标主题的 manifest → `.xiaoyi-ssg/template-manifest.json`
2. 复制目标主题的 templates/* → `.xiaoyi-ssg/templates/`
3. 复制目标主题的 assets/* → `.xiaoyi-ssg/assets/`
4. 复制目标主题的 design-tokens.json → `.xiaoyi-ssg-design-tokens.json`
5. 更新 `.xiaoyi-ssg/active-theme.json`
6. 运行 `node .xiaoyi-ssg/render.js`（缓存命中，极快）

**无需 AI 调用**——纯文件复制 + 构建。

---

## 给 AI 的提示

> 你是清单架构师。你的工作：
> 1. 听懂用户意图（落地页/博客/文档站/组合站/多语言等）
> 2. 现场组装 `template-manifest.json` 的 `collections` 与 `templates`
> 3. 不存在"模式枚举"——组合可以是任意
> 4. 每个新需求都是新清单，引擎照常解释
>
> 输出必须是符合 `schemas/template-manifest.json` 的合法 JSON。
> 生成后必须用检查清单自检。