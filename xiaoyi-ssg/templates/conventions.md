# Template Conventions for xiaoyi-ssg Pipelines

> ⚠️ **Mandatory reading for any AI generating a pipeline via `/xiaoyi-ssg`.**
> Non-compliance produces pipelines that look correct but render empty pages.

This file is the single source of truth for template syntax, data shape, and variable binding rules used by the auto-generated render pipeline. Following it prevents the most common pitfalls observed in early xiaoyi-ssg tests.

---

## 1. Templating engine

The pipeline uses **Eta v3** for templates (`<% ... %>`, `<%= ... %>`, `<%~ ... %>`). Eta is **not** Nunjucks, EJS, or Jinja2. Common confusion:

| Feature              | Eta                              | EJS / Nunjucks | Notes                  |
| -------------------- | -------------------------------- | -------------- | ---------------------- |
| Output escaped       | `<%= value %>`                   | `<%= value %>` | Same                   |
| Output raw           | `<%~ value %>`                   | `<%- value %>` | **Different!**         |
| If                   | `<% if (cond) { %>`              | `<% if (cond) %>` | Eta requires braces for blocks |
| For                  | `<% for (const x of arr) { %>`   | similar        | Always block-scoped    |
| Variable scope       | top-level data access (no `it.`) | often `it.x`   | See §3 below           |

### 1.1 Raw output in layout

The base layout includes `<%~ body %>` to splice the rendered page template. **Do not** use `<%- body %>` — Eta does not recognize the `<%-` syntax and will silently output an empty string.

```html
<!-- base.html — correct -->
<%~ body %>

<!-- base.html — WRONG (Eta silently outputs nothing) -->
<%- body %>
```

---

## 2. Template variables: top-level only

When Eta is configured with `useWith: true` (the pipeline's default), every variable in the data object is bound to the template's top scope. **Do not prefix with `it.`** — it will be treated as the literal property `it` on the data, which is undefined.

```html
<!-- correct -->
<title><%= pageTitle || site.title %></title>
<p><%= site.description %></p>
<% for (const post of (recentPosts || [])) { %>
  <a href="<%= post.url %>"><%= post.title %></a>
<% } %>

<!-- WRONG (silent empty) -->
<title><%= it.pageTitle || it.site.title %></title>
<% for (const post of (it.recentPosts || [])) { %>
```

If you really want an `it` alias (e.g. for nested templates), set it explicitly at the top of the template:

```html
<% const it = @raw %>
```

But this is rarely needed and discouraged.

---

## 3. Data shape passed to page templates

The render pipeline builds the data object for each page template as follows:

```js
data = {
  ...globals,        // site, nav, recentPosts/recentProjects, allPostsUrl, body, ...
  ...task.data,      // collection, col, item (for detail), page (for page type), pagination, ...
  pageTitle,         // derived from item.title + site.title
  pageDescription,   // derived from item.excerpt or site.description
}
```

### 3.1 Inside `for` loops — access fields directly on the loop variable

Eta iterates a JS array and binds each element to the loop variable. Inside the loop body, use that variable:

```html
<% for (const post of recentPosts) { %>
  <h2><%= post.title %></h2>
  <time><%= post.dateDisplay %></time>
  <% for (const tag of post.tags) { %>
    <span class="tag">#<%= tag %></span>
  <% } %>
<% } %>
```

### 3.2 Custom fields are flattened to top level on each item

For every parsed Markdown file, the front-matter is **merged into the item object at top level**, not just stored in `customFields`. So `data.year`, `data.tech_stack`, `data.demo_url` etc. are accessible directly as `item.year`, `item.tech_stack`, `item.demo_url`.

```yaml
---
title: "Next.js SaaS Starter"
year: 2026
tech_stack: [Next.js, TypeScript, Prisma]
demo_url: "https://..."
---
```

```html
<% for (const project of recentProjects) { %>
  <h3><%= project.title %></h3>
  <span class="year"><%= project.year %></span>
  <p><%= project.description %></p>
  <% for (const t of project.tech_stack) { %>
    <span class="chip"><%= t %></span>
  <% } %>
<% if (project.demo_url) { %>
  <a href="<%= project.demo_url %>">Demo</a>
<% } %>
<% } %>
```

The raw `customFields` object is also exposed for advanced cases (e.g. dynamic field lookups), but prefer direct access.

---

## 4. Collection name binding

For list templates, the render pipeline passes both `collection` (string) and `col` (object containing items and pagination). Either is usable:

```html
<% const items = (col && col.items) || []; %>
<% const name = collection; %>
```

For page titles, labels, and optional navigation helpers to read the friendly collection name, the data also exposes `collectionName` (mirrored from `collection`). Use it in copy:

```html
<h1><%= collectionName === 'post' ? 'Posts' : collectionName %></h1>
```

---

## 4.1 Frontmatter GEO extensions (optional)

`render.js` recognizes these frontmatter fields for GEO output. All are optional; defaults auto-derive when absent (see `prompts/geo-conventions.md`).

| Field | Type | Effect when present | Default when absent |
|-------|------|---------------------|---------------------|
| `summary` | string | Used in `/llms.txt` entry, JSON-LD `description`, `<meta name="description">` | First paragraph of body, truncated to 200 chars |
| `topics` | string[] | JSON-LD `keywords`, `<meta name="keywords">` | Omitted |
| `audience` | string | JSON-LD `audience` | Omitted |
| `citation_key` | string | Citation footer block (when template renders one) | Omitted |
| `content_type` | string | JSON-LD `@type` override | Auto-mapped from collection name (`post` → `BlogPosting`, `doc` → `TechArticle`, etc.) |
| `updated` | date | Sitemap `<lastmod>`, JSON-LD `dateModified` | Falls back to `date` |
| `noai` | boolean | `<meta name="robots" content="noai">` on this page only | Site-wide `config.geo.noai` |

Templates read these via the standard `item.*` access (frontmatter is flattened onto the item at scan time, see §3.2):

```html
<meta name="description" content="<%= item.summary || '' %>">
<time datetime="<%= item.updated || item.date %>"><%= item.date_display %></time>
<% if (item.noai) { %>
  <meta name="robots" content="noai">
<% } %>
```

---

## 5. Required template files

A complete pipeline must define these in `template-manifest.json` (current v1):

| Template name | Purpose                                  | Output path             | Notes                                |
| ------------- | ---------------------------------------- | ----------------------- | ------------------------------------ |
| `base`        | Layout wrapper (HTML shell + nav/footer) | (layout only)           | Contains `<%~ body %>`               |
| `home`        | Homepage                                 | `/`                     | Uses `recentItems`/`allItemsUrl` (generic over the primary source) or `use: [...]` to iterate multiple datasets |
| `<source>-list` | One per source                         | `/<source>/` or `/<source>/page/{n}/` | A `for.paginate` view over a source; iterates `items` |
| `<source>-detail` | One per source                       | `/<source>/{slug}/`     | A `for.each` view; iterates single item bound as `item` |
| `tag` / aggregation | Taxonomy pages                    | `/tag/{field}/`         | A `for.each` view over a `derived` source (e.g. `groupBy`) |
| `404`         | Not found                                 | `/404/`                 | Engine appends `index.html` at write time |

---

## 6. Style integration with frontend-design

When generating `assets/style.css`, leverage design tokens from `<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json`. Common token groupings:

| Token group | Example fields | CSS variables to emit |
| ----------- | -------------- | --------------------- |
| `color`     | `bg`, `fg`, `accent`, `border` | `--color-bg`, `--color-fg`, `--color-accent`, `--color-border` |
| `typography` | `font-sans`, `font-mono`, `base-size`, `line-height` | `--font-sans`, `--font-mono`, `--text-base`, `--leading-normal` |
| `layout`    | `container`, `radius` | `--container-max`, `--radius-base` |
| `motion`    | `duration-fast`, `duration-base` | `--motion-fast`, `--motion-base` |

For richer component styling (cards, hero, nav, post lists), consult the **frontend-design** skill which provides curated component patterns and accessibility tokens. Reference it from `prompts/pipeline-generation.md` so the AI generating the CSS knows to load it as auxiliary context.

---

## 7. Self-test after generation

After generating a pipeline, run the following smoke tests before declaring success:

1. `node .xiaoyi-ssg/render.js --fresh` exits with `build done` and a non-zero `rendered=` count.
2. `grep -l '<html' public/index.html` matches.
3. `grep -c '<%~ body' .xiaoyi-ssg/templates/base.html` is 1 (raw body not escaped).
4. `grep -c 'recentItems\|allItemsUrl' .xiaoyi-ssg/templates/index.html` is at least 1 (index uses generic recent-items globals; per-source names like `recentPosts` / `recentProjects` are anti-patterns — see §8).
5. The content collection count in `public/<col>/` matches the number of source files in `source/_<col>/`.

If any check fails, do not claim the pipeline works.

For GEO-specific smoke tests (always add these):

6. `grep -c 'application/ld+json' public/<detail-page>/index.html` is ≥ 1 (JSON-LD injected).
7. `cat public/llms.txt` shows `# {site.title}` as the first line and at least one `- [...]` bullet per non-empty collection.
8. `cat public/robots.txt` lists every bot in the standard 15-bot AI crawler list.
9. For at least one content page, `cat public/<page>/index.md` is non-empty and does not begin with `---` (frontmatter stripped).
10. With `config.geo.llms_full: false`, `public/llms-full.txt` does not exist. Flip to `true` and rebuild — it appears.

---

## 8. Anti-patterns to avoid

- ❌ `<%- body %>` in `base.html` — outputs empty
- ❌ `it.xxx` in any template — `it` is not bound by default
- ❌ `recentPosts` in render.js globals but `recentProjects` referenced in template — naming mismatch
- ❌ Hardcoding a source name in `render.js` (e.g. `datasets.posts`, `collections.post`) — breaks any other source name. Iterate `Object.keys(datasets)` / `Object.values(datasets).flatMap(...)` instead.
- ❌ Hardcoding `contentTypes.types[name]` in `render.js` for rendering — render.js reads `template-manifest.json` sources, not content-types.json. The latter is for AI authoring guidance and optional markdown front-matter validation.
- ❌ Setting `<% const it = data %>` then using `it.customFields.xxx` in a loop — verbose and brittle; flatten custom fields at adapter normalization time instead (see §3.2)
- ❌ Inventing legacy collection-style `collections` or `forEach: items/collections/pagination` in the engine — the current v1 model is `sources + views`.

---

## 9. When in doubt

- Look at `references/lark_cli_dashboard.md` in the `feishu-doc-sync` skill — it follows similar principles (deterministic API → render).
- Look at any well-formed xiaoyi-ssg site under `~/temp/ssg-demo*` for working examples after `node .xiaoyi-ssg/render.js --fresh`.
- When the AI generates a pipeline that renders empty pages, **the data-binding section (§3) is the first place to check** — 80% of the time it's an `it.` prefix or `<%-` instead of `<%~`.
