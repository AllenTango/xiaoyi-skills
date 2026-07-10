# Site Manifest Generation (current v1)

This prompt guides the AI in producing `.xiaoyi-ssg/template-manifest.json` from the user's intent. The manifest conforms to `schemas/template-manifest.json` (current v1) and is the **only** structural declaration the engine reads.

> **Core principle**: the engine does not know site types. There is no "blog mode / docs mode / landing mode" baked in. The AI assembles a manifest from two open abstractions:
> - **`sources`** — where the data lives (markdown / http / json / csv / rss / inline / derived). See [`data-sources.md`](./data-sources.md).
> - **`views`** — what pages to emit and how. Source-type agnostic.
>
> Any site shape — including the long tail (API-backed apps, aggregation pages, dashboards, taxonomy) — is a valid combination of sources + views. If a need is not covered by a built-in adapter, the user (or AI) writes a new adapter under `.xiaoyi-ssg/sources/` and registers its `type` in the schema; the engine does not change.

---

## Manifest Skeleton (Mandatory)

See `schemas/template-manifest.json`:

```typescript
{
  version: 1,                                  // const 1 — current v1 manifest shape
  sources: {
    [name: string]: SourceDef                  // see schemas/source.schema.json
  },
  views: [
    {
      name: string,
      type: "layout" | "page",
      file: string,                            // templates/<file>.html
      layout?: string,                         // required when type=page
      output?: string,                         // required when type=page; placeholders: {slug},{n},{lang},{source},{field},{date:FMT}
      for?: { each?: string, paginate?: string, perPage?: number, where?: object },
      use?: string[],                          // source names whose datasets are injected as top-level vars
      data?: object,
      lang?: string[]
    }
  ],
  globals?: { site?, nav?, tokens? }
}
```

A minimal manifest must contain: ≥1 source and ≥1 view. There must be at least one layout view (`type=layout`) referenced by every page view.

---

## Field Decision Guide

### 1. `sources` — one entry per data origin

Pick the adapter by **where the data lives**, not by what the page looks like. The page model is independent.

| Where the data lives | Adapter | Example |
|----------------------|---------|---------|
| Local markdown files (`source/_posts/*.md`) | `markdown` | `{ "type": "markdown", "dir": "source/_posts" }` |
| Build-time HTTP API | `http` | `{ "type": "http", "url": "https://api.../x", "auth": { "env": "X_TOKEN" } }` |
| Local or remote JSON file | `json` | `{ "type": "json", "file": "data/changelog.json" }` |
| Local or remote CSV file | `csv` | `{ "type": "csv", "url": "https://.../x.csv", "delimiter": "," }` |
| RSS / Atom feed | `rss` | `{ "type": "rss", "url": "https://blog.example.com/feed" }` |
| Hand-coded in the manifest | `inline` | `{ "type": "inline", "items": [...] }` |
| Computed from another source (groupBy/filter/...) | `derived` | `{ "type": "derived", "from": "posts", "op": "groupBy", "field": "tags" }` |

Common optional fields across adapters:

- `map` — rename/normalize fields into the standard item shape (`{ slug: "id", title: "name" }`).
- `defaults` — fill missing values (`{ date: "" }` for APIs with no date).
- `sort` — applied after the adapter produces items.
- `tree` — assemble `parent`/`nav_order` tree for sidebar navigation.
- `cache.key` / `cache.ttl` — remote sources only; default fallback `cache`.
- `fallback` — `cache` / `empty` / `fail`.

Required fields per adapter are enforced by `schemas/source.schema.json` `allOf` clauses.

### 2. `views[].for` — Expansion Strategy

A view expands into one or more concrete render tasks. Three shapes, source-type agnostic:

| Value | Meaning | Binds |
|-------|---------|-------|
| `{ "each": "<source>" }` | one page per item | `item`, `source` |
| `{ "paginate": "<source>", "perPage": N }` | one page per pagination slice | `items` (current slice), `pagination`, `page` (1-based), `source` |
| `for` omitted | single page (home / 404 / computed) | nothing from `for`; reads from `use` and/or `data` |

Optional `for.where` filters items before expansion (`field/value` pairs; array value = any-match).

The page model is no longer a closed enum. `for.paginate` works on any source (an API list, a derived dataset, a CSV file). `for.each` works on a `groupBy` derived source → one page per tag/category/author — exactly the taxonomy behavior the v1 engine couldn't express.

### 3. `views[].use` — Multi-Source Aggregation

`use` injects the **full datasets** of named sources as top-level variables in the view's render data. Independent of `for`. This is what unlocks:

- Home pages that show "recent posts" **and** "latest products" **and** "recent releases" in one template.
- Dashboards that mix API stats with markdown commentary.
- A single landing page that aggregates one item from each source.

Example:

```json
{ "name": "home", "type": "page", "layout": "base", "file": "home.html",
  "output": "/", "use": ["posts", "products", "releases"] }
```

The template can iterate `<% posts.forEach(p => { %>…<% }) %>` and `<% products.slice(0,6).forEach(p => { %>…<% }) %>` independently.

### 4. `output` — Path Template

Placeholders:

- `{slug}` — current item's slug (under `for.each`)
- `{n}` — current page number (under `for.paginate`)
- `{lang}` — current language code (when `lang` is set)
- `{source}` — originating source name
- `{field}` — current item's `value` (useful with `for.each` over a `groupBy` derived source → `/tag/{field}/`)
- `{date:YYYY-MM-DD}` — date format on `item.date`

Paths are normalized by the engine: collapsed `//`, single trailing `/`, `index.html` appended at write time for directory paths.

### 5. `layout` & `file`

- `type=layout`: only `file` is required (e.g. `base.html` with the `<%~ body %>` slot).
- `type=page`: requires both `layout` (name of a layout view) and `file` (page body template). A page without a layout is allowed only by deliberately passing `layout: null` — there is no implicit fallback.

### 6. `lang` — Multi-Language Expansion

If `lang: ["zh", "en"]` is set on a page view, the engine expands the view once per language and substitutes `{lang}`. The same mechanism works for any source.

---

## Pattern Assembly (Reference, Not Exhaustive)

These are starting points. The model is open: combine sources, mix `for.each`/`for.paginate`/`use` freely, add a new adapter when needed.

### Pattern A — Pure Landing Page

```json
{
  "version": 1,
  "sources": {
    "landing": { "type": "markdown", "dir": "source/_landing" }
  },
  "views": [
    { "name": "base", "type": "layout", "file": "base.html" },
    { "name": "landing", "type": "page", "layout": "base", "file": "landing.html", "output": "/" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### Pattern B — Blog / Portfolio (pure markdown)

```json
{
  "version": 1,
  "sources": {
    "posts":    { "type": "markdown", "dir": "source/_posts", "sort": { "field": "date", "order": "desc" } },
    "projects": { "type": "markdown", "dir": "source/_projects", "sort": { "field": "date", "order": "desc" } }
  },
  "views": [
    { "name": "base",      "type": "layout", "file": "base.html" },
    { "name": "post",      "type": "page", "layout": "base", "file": "detail.html",  "output": "/blog/{slug}/",      "for": { "each": "posts" } },
    { "name": "blog-list", "type": "page", "layout": "base", "file": "list.html",    "output": "/blog/page/{n}/",   "for": { "paginate": "posts", "perPage": 10 } },
    { "name": "project",   "type": "page", "layout": "base", "file": "project.html", "output": "/projects/{slug}/","for": { "each": "projects" } },
    { "name": "projects",  "type": "page", "layout": "base", "file": "list.html",    "output": "/projects/page/{n}/", "for": { "paginate": "projects", "perPage": 12 } },
    { "name": "404",       "type": "page", "layout": "base", "file": "404.html",     "output": "/404/" }
  ]
}
```

### Pattern C — Documentation (with tree sidebar)

```json
{
  "version": 1,
  "sources": {
    "docs": { "type": "markdown", "dir": "source/_docs", "sort": { "field": "nav_order", "order": "asc" }, "tree": true }
  },
  "views": [
    { "name": "base",      "type": "layout", "file": "base.html" },
    { "name": "doc-index", "type": "page", "layout": "base", "file": "doc-index.html", "output": "/docs/", "use": ["docs"] },
    { "name": "doc-page",  "type": "page", "layout": "base", "file": "doc-page.html",  "output": "/docs/{slug}/", "for": { "each": "docs" } },
    { "name": "404",       "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

The doc-index template receives `docs.tree` (built by the markdown adapter from `parent`/`nav_order`) for the sidebar.

### Pattern D — API-backed app (the long tail)

A user wants a product catalog pulled from an API, with tag aggregation pages. This is the exact shape v1 could not express.

```json
{
  "version": 1,
  "sources": {
    "products": {
      "type": "http",
      "url": "https://api.shop.example.com/v1/products",
      "auth": { "env": "SHOP_API_TOKEN", "prefix": "Bearer " },
      "select": "$.data.items",
      "map": { "slug": "id", "title": "name", "cover": "image_url", "price": "unit_price" },
      "defaults": { "date": "", "tags": [], "excerpt": "" },
      "cache": { "ttl": 3600 },
      "fallback": "cache",
      "timeout": 15000
    },
    "tags": { "type": "derived", "from": "products", "op": "groupBy", "field": "tags" }
  },
  "views": [
    { "name": "base",         "type": "layout", "file": "base.html" },
    { "name": "home",         "type": "page", "layout": "base", "file": "home.html",      "output": "/", "use": ["products"] },
    { "name": "product",      "type": "page", "layout": "base", "file": "product.html",   "output": "/shop/{slug}/", "for": { "each": "products" } },
    { "name": "shop-list",    "type": "page", "layout": "base", "file": "list.html",      "output": "/shop/page/{n}/", "for": { "paginate": "products", "perPage": 12 } },
    { "name": "tag",          "type": "page", "layout": "base", "file": "tag.html",       "output": "/shop/tag/{field}/", "for": { "each": "tags" } },
    { "name": "404",          "type": "page", "layout": "base", "file": "404.html",       "output": "/404/" }
  ]
}
```

- `products` resolves to normalized items at build time (one snapshot per `cache.ttl`).
- `tags` derives `{ slug, value, count, items }` per distinct tag → one page per tag with `{field}` substituted into the URL.
- `home` aggregates the full `products` dataset via `use`.

### Pattern E — Mixed Sources (markdown + API + JSON feed)

```json
{
  "version": 1,
  "sources": {
    "posts":      { "type": "markdown", "dir": "source/_posts", "sort": { "field": "date", "order": "desc" } },
    "github":     { "type": "http", "url": "https://api.github.com/users/me/repos",
                    "auth": { "env": "GH_TOKEN" }, "map": { "slug": "name", "title": "full_name", "cover": "owner.avatar_url" } },
    "changelog":  { "type": "json", "file": "data/changelog.json" },
    "tags":       { "type": "derived", "from": "posts", "op": "groupBy", "field": "tags" }
  },
  "views": [
    { "name": "base",     "type": "layout", "file": "base.html" },
    { "name": "home",     "type": "page", "layout": "base", "file": "home.html",      "output": "/", "use": ["posts", "github", "changelog"] },
    { "name": "post",     "type": "page", "layout": "base", "file": "detail.html",    "output": "/blog/{slug}/", "for": { "each": "posts" } },
    { "name": "blog",     "type": "page", "layout": "base", "file": "list.html",      "output": "/blog/page/{n}/", "for": { "paginate": "posts", "perPage": 10 } },
    { "name": "repo",     "type": "page", "layout": "base", "file": "repo.html",      "output": "/projects/{slug}/", "for": { "each": "github" } },
    { "name": "tag",      "type": "page", "layout": "base", "file": "tag.html",       "output": "/tag/{field}/", "for": { "each": "tags" } },
    { "name": "404",      "type": "page", "layout": "base", "file": "404.html",       "output": "/404/" }
  ]
}
```

This is a single pipeline with three different data origins and a derived source — none of which required any change to the engine.

### Pattern F — Multi-language

Same as A–E with `lang: ["zh", "en"]` on each page view and `{lang}` in `output`. The engine expands each page once per language; sources are shared (one markdown dir per language, or one multilingual content source, as the user chooses).

---

## Post-Generation Checklist

The AI must self-verify before writing the file:

- [ ] `version: 1`.
- [ ] At least one source and one view.
- [ ] At least one layout view exists.
- [ ] Every `type=page` view references an existing layout name.
- [ ] Every `type=page` view has `output`.
- [ ] Every `for.each` / `for.paginate` references a source name that exists in `sources`.
- [ ] Every `for.paginate` sets `perPage`.
- [ ] Every `auth.env` is a name only (no value); the user has been told which env var to set.
- [ ] Every remote source has a `fallback` (defaults to `cache`).
- [ ] `404` view exists.

If any check fails, fix and re-verify.

---

## GEO Note

GEO outputs (`llms.txt`, `robots.txt`, per-page markdown mirror, JSON-LD) are **not declared in the manifest**. The engine emits them generically over the **markdown** sources. API / JSON / CSV / RSS / inline / derived items may appear in `llms.txt` link lists but have no markdown mirror (no source `.md` file). No `_geo/` directory; no separate authoring flow. See [`geo-conventions.md`](./geo-conventions.md).

---

## Hint to AI

> You are a manifest architect.
> 1. Ask **where the data lives** first (local / API / file / feed / computed). One entry per origin in `sources`.
> 2. For each origin, ask what fields exist; map them to the standard item shape (`map`) and fill gaps (`defaults`).
> 3. For APIs that need auth, ask the user for the env var name; record only the name in `auth.env`.
> 4. Only then design views: which sources get per-item pages (`for.each`), which get lists (`for.paginate`), which aggregate on the home (`use`).
> 5. Add a new adapter when a real need exceeds the seven built-ins; do not bend the engine.