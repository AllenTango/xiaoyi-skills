# Template Manifest Generation Prompt

This prompt guides the AI in generating `.xiaoyi-ssg/template-manifest.json` based on the user's site intent and content model.

> **Core principle**: the engine (`render.js`) knows nothing about specific site types. The AI assembles the manifest on the spot; the engine just interprets the JSON.
> No "landing mode / blog mode / docs mode" baked into the engine — only "AI decides how to combine manifest fields".

---

## Manifest Structure (Mandatory)

See `schemas/template-manifest.json`:

```typescript
{
  version: 1,
  collections: {
    [collectionName: string]: {
      source: string,                   // content source directory, e.g., "source/_posts"
      sort?: { field: string, order: 'asc'|'desc' },
      pagination?: { perPage: number, path: string },  // path contains {n} placeholder
      singleton?: boolean,              // only use first item to render single page
      tree?: boolean,                   // build tree structure (for docs site sidebar)
    }
  },
  templates: [
    {
      name: string,
      type: 'layout' | 'page',
      layout?: string,                  // required when type=page; references layout template name
      file: string,                     // file name under templates/
      output?: string,                  // required when type=page; contains placeholders
      data?: object,                    // static data bindings
      forEach?: 'collections' | 'items' | 'pagination',
      lang?: string[],                  // multi-language expansion
    }
  ],
  globals?: { site?, nav?, tokens? },
}
```

---

## Key Field Decision Guide

### 1. `collections` — one entry per content type

| User intent | Collection config |
|-------------|-------------------|
| "Blog articles" | `posts: { source: "source/_posts", sort: {field: "date", order: "desc"}, pagination: {perPage: 10, path: "/blog/page/{n}/"} }` |
| "Project showcase" | `projects: { source: "source/_projects", sort: {field: "date", order: "desc"}, pagination: {perPage: 12, path: "/projects/page/{n}/"} }` |
| "Landing page (single page)" | `landing: { source: "source/_landing", singleton: true }` |
| "Documentation site" | `docs: { source: "source/_docs", sort: {field: "nav_order", order: "asc"}, tree: true }` |
| "About page (singleton)" | `about: { source: "source/_about", singleton: true }` |

### 2. `templates[].forEach` — Template Expansion Strategy

| Value | Meaning | Typical use |
|-------|---------|-------------|
| `"collections"` | one expansion per collection | List pages (one set for posts, another for projects) |
| `"items"` | one expansion per content item in the collection | Detail pages, article pages, doc pages |
| `"pagination"` | one expansion per paginated page | Paginated lists (combined with `pagination`) |
| omitted | expand only once | Home, 404, singleton pages |

### 3. `output` — Output Path Template

Placeholders:

- `{collection}` — collection name (available during expansion)
- `{slug}` — content item slug (when `forEach: "items"`)
- `{n}` — page number (when `forEach: "pagination"`)
- `{lang}` — language code (for multi-language)
- `{date:YYYY-MM-DD}` — date format

Examples:

- `/{slug}/` — detail page: `/hello-world/`
- `/blog/page/{n}/` — pagination: `/blog/page/2/`
- `/projects/{slug}/` — project detail: `/projects/site-forge/`
- `/{lang}/blog/{slug}/` — multi-language: `/zh/blog/hello/`

### 4. `singleton` and `tree` — Special Shapes

- `singleton: true` — **only render one item** (take the first) from the collection. Used for landing, about, singleton content.
- `tree: true` — build a **tree structure** (based on `parent` / `nav_order` fields). Used for docs site sidebar, category tree.

---

## Pattern Assembly Examples (for reference only; AI may compose new patterns on the spot)

### Pattern A: Pure Landing Page

User: "Make a product landing page, only need the homepage"

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
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### Pattern B: Blog / Portfolio

User: "Tech blog + portfolio"

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
      "forEach": "collections" },
    { "name": "detail", "type": "page", "layout": "base", "file": "detail.html",
      "output": "/{collection}/{slug}/", "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### Pattern C: Documentation Site

User: "Make a documentation site like VitePress"

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
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### Pattern D: Combined Site (Landing Homepage + Blog + Documentation)

User: "Product homepage + user blog + help docs"

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
      "forEach": "collections" },
    { "name": "blog-detail", "type": "page", "layout": "base", "file": "blog-detail.html",
      "output": "/blog/{slug}/", "forEach": "items" },
    { "name": "doc-index", "type": "page", "layout": "base", "file": "doc-index.html",
      "output": "/docs/", "data": { "collection": "docs", "tree": true } },
    { "name": "doc-page", "type": "page", "layout": "base", "file": "doc-page.html",
      "output": "/docs/{slug}/", "data": { "collection": "docs", "tree": true },
      "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### Pattern E: Multi-Language Combined Site

User: "Product landing + docs in Chinese and English"

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

## Post-Generation Checklist

After generating the manifest, the AI must self-check:

- [ ] `version: 1` present
- [ ] At least one template of `type: "layout"` (usually `base`)
- [ ] Every `type: "page"` template references an existing layout
- [ ] Every `type: "page"` template has `output`
- [ ] Every `forEach: "items"` template corresponds to a collection that exists with a `source`
- [ ] Every `forEach: "pagination"` template corresponds to a collection that defines `pagination`
- [ ] Placeholders in `output` match the expansion strategy
- [ ] `404` template exists

---

## Hint to AI

> You are a manifest architect. Your job:
> 1. Understand the user's intent (landing / blog / docs / combined / multi-language, etc.)
> 2. Assemble `template-manifest.json`'s `collections` and `templates` on the spot
> 3. There is no "pattern enumeration" — any combination is possible
> 4. Every new requirement is a new manifest; the engine interprets as usual
>
> The output must be a valid JSON object matching `schemas/template-manifest.json`.
> After generation, use the checklist to self-verify.

## GEO Note

GEO outputs (`/llms.txt`, `/robots.txt`, per-page markdown mirror, JSON-LD) are **not declared in `template-manifest.json`**. They are emitted automatically by `render.js` based on `source/_<type>/*.md` content + `config.geo.*`. The manifest does not need a `templates[]` entry for them, and adding one would be wrong.

The only manifest-level concern is: detail/doc/project templates must use `forEach: "items"` so `render.js` can identify the source markdown path for the per-page mirror and emit per-item JSON-LD. Singletons and list pages are skipped by the mirror (their URL + index.md would be redundant or misleading).
