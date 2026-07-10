# render.js / dev.js Spec (v1 — Source + View Engine)

This document defines the full spec of the Node.js scripts the AI produces for the rendering pipeline. The AI writes code per this spec into the user project's `.xiaoyi-ssg/`.

> **v1 source + view model.** The engine knows nothing about blogs, docs, or landing pages. It knows only two open abstractions:
> - **`sources`** — where data comes from (local markdown, build-time API fetch, JSON/CSV files, RSS, inline, or derived). Resolved by pluggable **Source Adapters** (see [`data-sources.md`](./data-sources.md)).
> - **`views`** — how pages are generated (per-item, paginated, multi-source aggregate, or single computed page).
>
> There is no `collections`, no `forEach` enum, no hardcoded list/detail/tree branch. Any site shape — including API-backed apps and aggregation pages — is just a combination of sources and views. This is what removes the v1 "rigidity".

---

## Technical Constraints

- **Node.js 18+** (LTS, built-in `fetch`, `AbortSignal.timeout`, `fs.cpSync`).
- **ESM module system** (`"type": "module"`, `import`/`export`).
- **Path derivation**: derive `PIPELINE_DIR` from `import.meta.url`, then `SITE_ROOT = dirname(PIPELINE_DIR)`. Never use `process.cwd()` as the site root.
- Dependencies: `js-yaml`, `marked`, `chokidar` (dev only), `eta`. Pin and record any extra package in `interactions.manifest.json`.
- Template engine: `eta` (HTML escaping, raw HTML, conditionals, loops, async, filters).
- Two separate files: `render.js` (build) and `dev.js` (dev).
- Adapters live under `.xiaoyi-ssg/sources/`; the engine dispatches on `source.type`.
- Build-time fetch only. The engine never emits code that talks to an authed API from the browser.

---

## Site Language Contract

- `config.site.language` is the authoritative BCP 47 tag; init sets it from the user's request language unless overridden.
- Templates use `<html lang="<%= site.language || inferredFallback %>">`; the fallback is the inferred site language, not a hardcoded English default.
- All template-, JS-, feed-, 404-, pagination-, search/filter-, aria-facing strings localize to the site language. Identifiers may stay ASCII.
- Preserve the original language of user-authored markdown; do not translate content unless asked.

---

## Core Data Structures

### `template-manifest.json` (single source of truth)

Conforms to `schemas/template-manifest.json` (current v1). Two top-level arrays/objects:

```json
{
  "version": 1,
  "sources": {
    "posts":    { "type": "markdown", "dir": "source/_posts", "sort": { "field": "date", "order": "desc" } },
    "products": { "type": "http", "url": "https://api.example.com/products",
                  "auth": { "env": "PRODUCTS_API_TOKEN", "prefix": "Bearer " },
                  "select": "$.data.items", "map": { "slug": "id", "title": "name" },
                  "cache": { "key": "products", "ttl": 3600 }, "fallback": "cache" },
    "tags":     { "type": "derived", "from": "posts", "op": "groupBy", "field": "tags" }
  },
  "views": [
    { "name": "base",    "type": "layout", "file": "base.html" },
    { "name": "home",    "type": "page", "layout": "base", "file": "home.html", "output": "/", "use": ["posts", "products"] },
    { "name": "post",    "type": "page", "layout": "base", "file": "detail.html", "output": "/blog/{slug}/", "for": { "each": "posts" } },
    { "name": "blog",    "type": "page", "layout": "base", "file": "list.html", "output": "/blog/page/{n}/", "for": { "paginate": "posts", "perPage": 10 } },
    { "name": "product", "type": "page", "layout": "base", "file": "product.html", "output": "/shop/{slug}/", "for": { "each": "products" } },
    { "name": "tag",     "type": "page", "layout": "base", "file": "tag.html", "output": "/tag/{slug}/", "for": { "each": "tags" } },
    { "name": "404",     "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### View field semantics

| Field | Meaning |
|-------|---------|
| `type` | `"layout"` (wrapper with `<%~ body %>`) or `"page"` (emits output). |
| `for.each` | Source name → one page per item; binds `item`, `source`. |
| `for.paginate` + `for.perPage` | Source name → one page per pagination slice; binds `items`, `pagination`, `page`. |
| `for.where` | Optional pre-expansion filter (field/value; array = any-match). |
| `for` omitted | Single page (home, 404, computed). |
| `use` | Source names whose full datasets inject as top-level vars (multi-source aggregation). Independent of `for`. |
| `output` | Path template; placeholders `{slug}`, `{n}`, `{lang}`, `{source}`, `{field}`, `{date:FMT}`. |
| `lang` | Expand once per language code. |

---

## render.js — Core Render Script

> ⚠️ **Mandatory pre-read**: [`templates/conventions.md`](../templates/conventions.md) (Eta syntax, variable binding, field flattening) and [`data-sources.md`](./data-sources.md) (adapter contract, security). Non-compliance produces pipelines that look correct but render empty or leak secrets.

### Engine Function Index

The AI that materializes `render.js` must implement (or import from generated helpers) every name in the table below. Signatures are authoritative; bodies are implementation-defined but must satisfy the documented contract.

| Function | Signature | Contract |
|----------|-----------|----------|
| `loadManifest()` | `() => Manifest` | Parse + validate `.xiaoyi-ssg/template-manifest.json` against `schemas/template-manifest.json`. Throws on schema violation, including unknown `source.type` not in the `enum`. |
| `loadConfig()` | `() => Config` | Parse + validate `config.yml` against `schemas/config.schema.json`. |
| `loadTokens()` | `() => DesignTokens` | Parse + validate `.xiaoyi-ssg-design-tokens.json` against `schemas/design-tokens.json`. |
| `loadContentTypes()` | `() => ContentTypes` | Parse + validate `.xiaoyi-ssg/content-types.json` against `schemas/content-types.json`. Used for AI authoring guidance and optional frontmatter validation; `render.js` does **not** read it to find content. |
| `loadInteractionsManifest()` | `() => InteractionsManifest` | Parse + validate `.xiaoyi-ssg/interactions.manifest.json` against `schemas/interactions.manifest.schema.json`. Optional; default empty `{ version: 1, interactions: [] }` when absent. |
| `loadCache()` | `() => Cache` | Read `.xiaoyi-ssg-cache.json` if present; default `{ version: 1, outputs: {} }`. |
| `validateConfig(config)` | `(c: Config) => void` | Enforce **semantic** checks that the JSON Schema alone cannot express. The schema already rejects missing `site.title` / `site.language` and bad `site.language` regex (`^[a-z]{2,3}(-[A-Z]{2})?$`); `validateConfig` adds: `site.url` must parse as a valid URL when present; `site.timezone` must be a valid IANA tz (e.g. `Asia/Shanghai`) when present; `geo.ai_bot_rules` keys must be a subset of the canonical 15-bot list (see `prompts/geo-conventions.md`); `geo.ai_bots: "custom"` requires a non-empty `geo.ai_bot_rules` object. Throw on any violation. |
| `buildNav(config, manifest, datasets)` | `(c, m, ds) => NavItem[]` | Read `config.nav` (declared in `config.yml` per `schemas/config.schema.json`) and shape it into `NavItem[]` (each: `{ title, url, active?, children? }`). If `config.nav` is absent, build a minimal default by walking manifest page views whose `output` is a top-level path (`/about/`, `/blog/`, …), using each view's `name` as the title and `output` as the url. Do not invent `nav: true` flags on views — that field does not exist in the schema. |
| `recentGlobals(datasets, manifest)` | `(ds, m) => { recentItems: Item[], allItemsUrl: string }` | First non-empty dataset (by declaration order in `manifest.sources`) drives `recentItems` (sliced to 5) and `allItemsUrl` (`/${sourceName}/`). |
| `initEta()` | `() => Eta` | Configure with `views: templates/`, `useWith: true`, `cache: true`. |
| `loadSources(sources, ctx)` | `(sources, ctx) => Promise<{ datasets, meta }>` | Topological dispatch through `ADAPTERS[source.type]`. Returns `{ datasets, meta: { [name]: { tree? } } }` — see §`loadSources`. |
| `topoSortByDerivedFrom(sources)` | `(sources) => string[]` | Source names ordered so each `derived.from` is resolved first. Throws on cycle. |
| `normalizeItem(item, def, sourceName)` | `(it, def, n) => Item` | Apply `def.map` + `def.defaults`, coerce `date` to string, default `tags`/`categories` to `[]`, spread all keys to the top level. |
| `sortItems(items, sort)` | `(items, { field, order }) => items` | Stable sort by `field`. Unknown fields sort last. |
| `buildTree(items)` | `(items) => TreeNode` | Build parent/child tree from `parent` + `nav_order` fields. Roots are items with no `parent`. |
| `expandViews(views, datasets, config)` | `(views, ds, c) => Task[]` | Source-type agnostic expansion into `for.each` / `for.paginate` / single tasks. |
| `filterWhere(items, where)` | `(items, where?) => items` | Apply `where: { field: value | value[] }` filter (array = any-match). |
| `buildPagination(current, total, baseOutput)` | `(n, total, tpl) => Pagination` | Build `{ current, total, base_url, pages, prev_url, next_url }` from the 1-based current page and total. `baseOutput` is the view's `output` template with `{n}` (or the equivalent dir-style prefix) for linking to other pages. `pages` is the array to render (e.g. `[1, 2, 3, '…', 10]`) with `'…'` elision when total > 7. `prev_url` / `next_url` are `null` at the ends. |
| `injectUsed(use, datasets)` | `(use, ds) => Record<string, Item[]>` | `{ [sourceName]: datasets[sourceName] || [] }` for each `use` entry; consumed by `ctxBase`. |
| `instantiate(view, ctx)` | `(view, ctx) => Task` | Compute `output` via `interpolate + normalizePath`; carry `data` for the template. |
| `interpolate(template, ctx)` | `(tpl: string, ctx) => string` | Replace `{slug}`, `{n}` (= `ctx.page`), `{lang}`, `{source}`, `{field}`, `{date:FMT}`. Undefined → `''`. |
| `normalizePath(p)` | `(p: string) => string` | Collapse `//` → `/`, ensure single trailing `/` for directory outputs. |
| `renderWithLayout(eta, layout, file, data)` | `(eta, layoutName, file, data) => Promise<string>` | Render page template, then layout with `{ ...data, body }` (layout must splice via `<%~ body %>`). |
| `assignItemUrls(tasks, datasets)` | `(tasks, ds) => void` | Set `item.url` to `task.output` so interaction data and GEO link lists see the canonical URL. |
| `computeTaskHash(task, tokens, config, interactions, datasets)` | `(t, tk, c, im, ds) => string` | sha256 of inputs (source file for markdown, JSON for API/derived items, template files, tokens, config subset, interactions manifest, style/script). |
| `cacheHit(output, hash)` | `(output, hash) => boolean` | True if `cache.outputs[output]?.hash === hash` and existing file is on disk. |
| `updateCache(output, hash)` | `(output, hash) => void` | Write into in-memory `cache`; persisted by `saveCache` at the end. |
| `writeOutput(output, html)` | `(output, html) => void` | `public/<output>/index.html` for directory outputs; `mkdir -p` parents. |
| `copyAssets()` | `() => void` | `cp -r templates/assets/* public/assets/` (use `fs.cpSync`). |
| `buildExtras(config, datasets, interactions)` | `(c, ds, im) => Record<string, unknown>` | Produce `assets/data/*.json` payloads (search index, filter facets, gallery). See §Interaction Data Generation. |
| `writeExtras(extras)` | `(extras) => void` | Write each entry to `public/assets/data/<filename>`. |
| `generateFeeds(datasets, config, manifest)` | `(ds, c, m) => void` | RSS / Atom / JSON Feed per source. |
| `generateSitemap(tasks, config)` | `(tasks, c) => void` | Aggregate `public/<output>/index.html` paths; respect per-page `updated`. |
| `generateLegacy404(eta, manifest)` | `(eta, m) => void` | After the main render loop, write a top-level `public/404.html` for legacy static hosts (Cloudflare Pages, Netlify default, GitHub Pages) that serve `/404.html` instead of `/404/index.html`. Locate the `404` view in `manifest.views` (must be present per template-manifest-generation.md post-generation checklist), re-render it with the base layout + a minimal data object, and write the result to `public/404.html`. The `/404/index.html` form is produced by the regular render loop. |
| `generateGeo(datasets, tasks, config, contentTypes)` | `(ds, tasks, c, ct) => void` | `llms.txt` / `llms-full.txt` / `robots.txt` / markdown mirror / JSON-LD. Full spec in `prompts/geo-conventions.md`. |
| `assertNoSecretsInOutput(manifest.sources)` | `(sources) => void` | **Mandatory self-test.** For every source with `auth`: (1) resolve `process.env[auth.env]`; if the env var is missing, skip (no secret was used to fetch — but log a warning so the user knows `auth.env` is set without a value). (2) If resolved, scan every file under `public/` (including `public/assets/data/*.json`) as text and binary (`grep -rIl` semantics on UTF-8; binary detection by first-8KB null-byte count). (3) Throw on any match, with a message naming the source, the env var, and the file (never the secret value itself). Exits non-zero. Must be the last step before `printSummary` so the build is not declared successful on a leak. |
| `saveCache(cache)` | `(c) => void` | Write `.xiaoyi-ssg-cache.json` atomically (tmp + rename). |
| `printSummary(tasks, datasets)` | `(tasks, ds) => void` | `build done · rendered=N cached=M …` (one line). On warning, append a second line. |

Adapter ctx shape (passed as second arg to every `adapter.load`):

```js
{
  SITE_ROOT,                       // absolute path
  PIPELINE_DIR,                    // absolute path
  CACHE_DIR,                       // absolute path to .xiaoyi-ssg/.cache/
  config,                          // parsed Config
  fetchWithCache,                  // (url, init, cacheKey, ttl) => Promise<Response>
  applyMap,                        // (item, def.map, def.defaults) => Item
  log,                             // (level, message, meta?) => void  (console fallback)
  name,                            // current source name
  datasets,                        // already-resolved datasets (for derived adapters)
}
```

### Overall Flow

```javascript
export async function build(fresh = false) {
  const manifest      = loadManifest();          // validate against schema v1
  const config        = loadConfig();
  const tokens        = loadTokens();
  const contentTypes  = loadContentTypes();       // still used to validate markdown front-matter
  const interactions  = loadInteractionsManifest();
  const cache         = loadCache();

  validateConfig(config);

  // 1. Resolve every source (topological: derived after its `from`)
  const { datasets, meta: datasetsMeta } = await loadSources(manifest.sources, buildCtx(config));
  //    datasets     = { [sourceName]: Item[] }   — markdown, http, derived, ... all uniform
  //    datasetsMeta = { [sourceName]: { tree? } } — only present for sources with tree: true

  // 2. Global data
  const nav = buildNav(config, manifest, datasets);
  const globals = { site: config.site, nav, tokens, build_time: new Date().toISOString(), ...recentGlobals(datasets, manifest) };

  const eta = initEta();

  // 3. Expand views into concrete tasks (source-type agnostic)
  const tasks = expandViews(manifest.views, datasets, config);

  // 4. Fill item.url now that we know each item's owning view/output
  assignItemUrls(tasks, datasets);

  // 5. Render each task with incremental cache
  for (const task of tasks) {
    const hash = computeTaskHash(task, tokens, config, interactions, datasets);
    if (!fresh && cacheHit(task.output, hash)) continue;
    const data = { ...globals, ...task.data };
    const html = await renderWithLayout(eta, task.layout, task.file, data);
    writeOutput(task.output, html);
    updateCache(task.output, hash);
  }

  // 6. Assets, interaction data, feeds, sitemap, 404, GEO
  copyAssets();
  writeExtras(buildExtras(config, datasets, interactions));
  generateFeeds(datasets, config, manifest);
  generateSitemap(tasks, config);
  generateLegacy404(eta, manifest);
  generateGeo(datasets, tasks, config, contentTypes);   // see GEO section

  // 7. Security self-check, save cache, summary
  assertNoSecretsInOutput(manifest.sources);            // MANDATORY
  saveCache(cache);
  printSummary(tasks, datasets);
}
```

### `loadSources(sources, ctx)`

```javascript
import * as markdown from './sources/markdown.js';
import * as http from './sources/http.js';
import * as jsonSrc from './sources/json.js';
import * as csvSrc from './sources/csv.js';
import * as rss from './sources/rss.js';
import * as inlineSrc from './sources/inline.js';
import * as derived from './sources/derived.js';

const ADAPTERS = { markdown, http, json: jsonSrc, csv: csvSrc, rss, inline: inlineSrc, derived };

async function loadSources(sources, ctx) {
  const order = topoSortByDerivedFrom(sources);   // derived sources after its `from`
  const datasets = {};
  const meta = {};                                // per-source metadata (tree, ...); kept separate
  for (const name of order) {
    const def = sources[name];
    const adapter = ADAPTERS[def.type];
    if (!adapter) throw new Error(`Unknown source type "${def.type}" for source "${name}". Add .xiaoyi-ssg/sources/${def.type}.js.`);
    let items = await adapter.load(def, { ...ctx, name, datasets });
    items = items.map(it => normalizeItem(it, def, name));   // map + defaults + flatten
    if (def.sort) items = sortItems(items, def.sort);
    datasets[name] = items;
    if (def.tree) meta[name] = { tree: buildTree(items) };   // only set when tree is requested
  }
  return { datasets, meta };
}
```

> `loadSources` returns `{ datasets, meta }` (not just `datasets`). Templates access `datasets.<sourceName>` via `use: [...]` injection; `meta.<sourceName>.tree` is consumed by the docs-tree sidebar render path. Keeping meta off the items array prevents accidental iteration of `meta` keys when the engine calls `Object.values(datasets).flatMap(d => d)` for interaction data generation (see §Interaction Data Generation).

- **No hardcoded source names.** Do not special-case `posts` / `collections.post`. Every source is generic.
- `normalizeItem` applies `def.map`, `def.defaults`, coerces `date` via `String(...)`, defaults `tags`/`categories` to `[]`, and **flattens all remaining keys to the top level**.
- Unknown `type` → throw (no silent skip, no fallback to markdown).

### `expandViews(views, datasets, config)`

```javascript
function expandViews(views, datasets, config) {
  const tasks = [];
  for (const view of views) {
    if (view.type !== 'page') continue;
    const langs = view.lang?.length ? view.lang : [null];
    for (const lang of langs) {
      const ctxBase = { lang, ...injectUsed(view.use, datasets) };

      if (view.for?.each) {
        const items = filterWhere(datasets[view.for.each] || [], view.for.where);
        for (const item of items) {
          tasks.push(instantiate(view, { ...ctxBase, source: view.for.each, item }));
        }
      } else if (view.for?.paginate) {
        const all = filterWhere(datasets[view.for.paginate] || [], view.for.where);
        const perPage = view.for.perPage || 10;
        const totalPages = Math.max(1, Math.ceil(all.length / perPage));
        for (let p = 1; p <= totalPages; p++) {
          const items = all.slice((p - 1) * perPage, p * perPage);
          const pagination = buildPagination(p, totalPages, view.output);
          tasks.push(instantiate(view, { ...ctxBase, source: view.for.paginate, items, page: p, pagination }));
        }
      } else {
        tasks.push(instantiate(view, ctxBase));   // single page (home / 404 / computed)
      }
    }
  }
  return tasks;
}

function instantiate(view, ctx) {
  return {
    name: view.name,
    layout: view.layout,
    file: view.file,
    output: normalizePath(interpolate(view.output, { ...view.data, ...ctx, slug: ctx.item?.slug, field: ctx.item?.value })),
    data: { ...view.data, ...ctx }
  };
}

function injectUsed(use, datasets) {
  const out = {};
  for (const name of (use || [])) out[name] = datasets[name] || [];
  return out;   // e.g. view with use:["posts","products"] gets top-level `posts`, `products`
}
```

- `for.each` / `for.paginate` / neither — three branches, source-agnostic. No enum of "collections/items/pagination".
- `where` filters before expansion.
- `use` injects whole datasets by name for aggregation pages.

### `interpolate(template, ctx)` & `normalizePath(p)`

- Placeholders: `{slug}`, `{n}` (→ `ctx.page`), `{lang}`, `{source}`, `{field}`, `{date:FMT}`. Undefined → `''`.
- `normalizePath` collapses `//` → `/`, ensures a single trailing `/` for directory outputs, and appends `index.html` at write time for dir-style paths (fixes dev EISDIR).

### `renderWithLayout(eta, layoutName, pageTemplate, data)`

```javascript
const body = await eta.renderAsync(pageTemplate, data);
return await eta.renderAsync(layoutName, { ...data, body });
```

> Earlier drafts of this spec injected a `sourceName: data.source` alias for templates. v1 templates use `source` directly (see `templates/conventions.md` §4); the alias is dropped. If a legacy pipeline references `sourceName`, update the template.

- Eta `useWith: true`: layout must concat with `<%~ body %>` (not `<%- body %>`).
- Templates access fields at top level (`<%= site.title %>`, `<%= item.price %>`); never `it.`.

### General Globals (home page)

The home template often wants "recent N" + "all-X link". Compute generically over the first non-singleton source, but prefer whatever the home view declares in `use`:

```javascript
function recentGlobals(datasets, manifest) {
  const primary = Object.keys(datasets).find(n => (datasets[n] || []).length) || null;
  return primary
    ? { recentItems: datasets[primary].slice(0, 5), allItemsUrl: `/${primary}/` }
    : { recentItems: [], allItemsUrl: '/' };
}
```

Templates uniformly use `recentItems` / `allItemsUrl`. Do not invent per-source global names.

### `computeTaskHash(task, tokens, config, interactions, datasets)`

```
hash = sha256(
  sourceFile (markdown item file, if any) +
  JSON.stringify(task.data.item || task.data.items || null) +   // covers API/derived items
  templateFile (task.file) + layoutFile (task.layout) +
  JSON.stringify(tokens) +
  JSON.stringify({ site: config.site, geo: config.geo }) +
  JSON.stringify(interactions) +
  style.css + script.js (if present)
)
```

- For API/derived sources there is no source file, so the item JSON participates directly. A changed API snapshot changes the hash → the page rebuilds.

### Mandatory Self-Test (after generation)

Run all of these; do not claim success on partial pass:

1. `node .xiaoyi-ssg/render.js --fresh` → exit 0, prints `build done · rendered=N cached=0 …`.
2. `grep -l '<html' public/index.html` → hit.
3. `grep -c '<%~ body' .xiaoyi-ssg/templates/base.html` → ≥ 1.
4. Every `view.for.each` / `for.paginate` names a `source` that exists in `sources`.
5. For every markdown source, `#items ≈ #detail pages` (allowing GEO/feed/sitemap/404 exceptions).
6. **Security**: for every source with `auth.env`, the resolved `process.env[...]` value does NOT appear anywhere under `public/` (`assertNoSecretsInOutput`). Fail hard if it does.
7. Design source check (below).

### Design System Source Check

Before generating `assets/style.css`, load `frontend-design`, normalize to `.xiaoyi-ssg-design-tokens.json`, and confirm `source_skill == "frontend-design"` (or `"self-extracted"` only after `--allow-self-extracted`). CSS must trace to the tokens; the AI does not redesign.

---

## dev.js — Dev Server

```javascript
import { build } from './render.js';
import chokidar from 'chokidar';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);

await build(false);

// Required watch paths — see §Required Watch Paths below. Single source of truth.
const WATCH_PATHS = [
  'source/**/*.md',
  'source/_media/**',
  'config.yml',
  '.xiaoyi-ssg-design-tokens.json',
  '.xiaoyi-ssg/template-manifest.json',
  '.xiaoyi-ssg/content-types.json',
  '.xiaoyi-ssg/interactions.manifest.json',
  '.xiaoyi-ssg/templates/**',
  '.xiaoyi-ssg/assets/**',
  '.xiaoyi-ssg/sources/**',
];

const watcher = chokidar.watch(WATCH_PATHS.map(p => join(SITE_ROOT, p)), {
  ignoreInitial: true,
  ignored: ['**/node_modules/**', '**/.cache/**', '**/public/**'],
});
let buildLock = null;
watcher.on('all', (event, filepath) => {
  if (buildLock) return;
  buildLock = setTimeout(async () => {
    buildLock = null;
    try { await build(false); broadcastReload(); }
    catch (e) { console.error(`[dev] build failed after change to ${filepath}:`, e.message); }
  }, 300);
});
```

- Remote sources are **not** re-fetched on every keystroke: dev respects each source's snapshot + `cache.ttl`. A manual full refresh (`build:fresh`) or expired TTL triggers a re-fetch. This keeps dev fast and avoids hammering APIs.
- Reuse `build` in-process (no `execSync`).

### Required Watch Paths (single source of truth)

dev.js `chokidar.watch` MUST subscribe to **exactly** this list. The same list is also used by `pipeline-generation.md` to validate the generated `dev.js` at the end of pipeline generation (the AI must not invent a different list — additions/removals happen here, in this prompt).

| Path | Reason |
|------|--------|
| `source/**/*.md` | Markdown content changes |
| `source/_media/**` | User-managed media (images, video) |
| `config.yml` | Site config / language / nav / dev settings |
| `.xiaoyi-ssg-design-tokens.json` | Design tokens → CSS variable regeneration |
| `.xiaoyi-ssg/template-manifest.json` | Sources / views / expansion strategy change |
| `.xiaoyi-ssg/content-types.json` | Frontmatter schema (authoring hints + optional validation) |
| `.xiaoyi-ssg/interactions.manifest.json` | Browser-interaction contract |
| `.xiaoyi-ssg/templates/**` | Eta template body / layout edits |
| `.xiaoyi-ssg/assets/**` | `style.css` / `script.js` / interaction modules / static data |
| `.xiaoyi-ssg/sources/**` | Source Adapter source code edits |

**Explicitly NOT watched** (regenerated, git-ignored, or runtime-only):

- `public/**` — build output, never a source
- `.xiaoyi-ssg/node_modules/**` — npm artifacts
- `.xiaoyi-ssg/.cache/**` — remote source snapshots, regenerated by `build`
- `.xiaoyi-ssg-cache.json` — per-output hash cache, regenerated by `build`

### Mandatory: Port Auto-Increment

```javascript
function startServerWithPortRetry(server, basePort, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryListen = (port) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          attempt++; console.warn(`⚠️  Port ${port} in use, trying ${port + 1}...`);
          tryListen(port + 1);
        } else reject(err);
      });
      server.once('listening', () => {
        const actualPort = server.address().port;
        console.log(`🌐 Dev server running at http://localhost:${actualPort}${actualPort !== basePort ? ` (port ${basePort} was occupied)` : ''}`);
        resolve(actualPort);
      });
      server.listen(port);
    };
    tryListen(basePort);
  });
}
```

Emit this exact pattern (or a functional equivalent). A hardcoded `server.listen(port)` without retry is forbidden. Default base port `config.dev.port` (typically `3000`); on exhaustion, exit non-zero with a clear message.

---

## Interaction Data Generation (buildExtras)

Generate `public/assets/data/*.json` for browser interactions. Iterate `interactions.interactions`; the data is drawn from `datasets` (any source, not just markdown). **Never include secret-derived fields** — only public, display-safe fields.

The match against built-in generators is **exact-name**, not substring: only an interaction named exactly `search` triggers the search-index aggregator, only an interaction named exactly `filter` triggers the facet aggregator. Earlier drafts used `name.includes('search')` / `name.includes('filter')` which double-generated for names like `filter-search` (matched both branches) and missed the difference between `search` and `search-suggestions`. Other interactions with `data: [...]` files must have those files produced by a custom generator (see `interactions.manifest.schema.json` `generator` field) or by a one-off data file written into `assets/data/` and listed in `interactions.manifest.json`.

```javascript
function buildExtras(config, datasets, interactions) {
  const data = {};
  const allItems = Object.values(datasets).flatMap(d => d);   // every source contributes
  for (const it of (interactions.interactions || [])) {
    if (it.name === 'search') {
      data['search-index.json'] = allItems.map(i => ({
        title: i.title, url: i.url, type: i.source, excerpt: i.excerpt || '',
        tags: i.tags || [], text: [i.title, i.excerpt].filter(Boolean).join(' ')
      }));
    } else if (it.name === 'filter') {
      const names = it.content_types || Object.keys(datasets);
      data[`${it.name}.json`] = {                                  // typically filter.json
        items: names.flatMap(n => (datasets[n] || []).map(i => ({
          title: i.title, url: i.url, type: n, tags: i.tags || [], categories: i.categories || [], date: i.date || ''
        })))
      };
    }
  }
  return data;
}
```

---

## GEO Generators

> Full spec: [`geo-conventions.md`](./geo-conventions.md). GEO aggregates over the user's **markdown** sources (existing content is the source). API/derived items may appear in `llms.txt` link lists but have no markdown mirror (no source file). `contentFileMap` (built by the markdown adapter) maps page url → source `.md` for the mirror and `llms-full.txt`.

Wire-up after feeds/sitemap:

```javascript
generateLlmsTxt(datasets, config, contentTypes);
if (config.geo?.llms_full) generateLlmsFullTxt(datasets, config, contentFileMap);
generateRobotsTxt(config);
mirrorMarkdown(tasks, contentFileMap, config);
```

- `generateLlmsTxt`: iterate `datasets` in nav order; skip empty; group by source label; list `- [title](url): summary`.
- `generateRobotsTxt`: always on, fixed 15-bot list (`geo-conventions.md`), policy from `config.geo.ai_bots`.
- `mirrorMarkdown`: only for tasks whose `output` maps to a markdown source file in `contentFileMap`; skip API/derived/list/singleton pages.
- JSON-LD (`buildJsonLd`) injected via `data.jsonLd`; `SCHEMA_MAP` keyed by `item.content_type` or source name, default `Article` (or `WebSite` for a landing/home singleton). **The full `SCHEMA_MAP` table (collection name → `@type`, payload schema, opt-out conditions) is defined in [`geo-conventions.md` § `buildJsonLd`](./geo-conventions.md) — do not duplicate or diverge it.**

The GEO function bodies are unchanged from prior spec except they iterate `datasets` (source-generic) rather than a `collections` object. Do not invent a `_geo/` directory.

---

## Cache File Format

`.xiaoyi-ssg-cache.json`:

```json
{ "version": 1, "outputs": { "/blog/page/1/": { "hash": "sha256...", "inputs": ["template-manifest.json", "list.html", "base.html"] } } }
```

Source snapshots live separately under `.xiaoyi-ssg/.cache/sources/<key>.json` (git-ignored). See [`data-sources.md`](./data-sources.md) § Snapshot Cache.

---

## File Header (generation-time metadata)

```javascript
/**
 * xiaoyi-ssg rendering pipeline (v1 — source + view engine)
 * Regenerate via: /xiaoyi-ssg → adjust sources/views/style → regenerate pipeline
 * Generated at: {{GENERATED_AT}}
 * Manifest hash: {{MANIFEST_HASH}}  Tokens: {{TOKENS_HASH}}  Content-Types: {{CONTENT_TYPES_HASH}}
 */
```

---

## Key Generation Constraints

1. **ESM modules** — `import`/`export`; `package.json` `"type": "module"`.
2. **Two files** — `render.js` (build), `dev.js` (dev), independent.
3. **Adapter directory** — `.xiaoyi-ssg/sources/*.js`, one per source type; engine dispatches on `type`.
4. **Minimal default deps** — `js-yaml`, `marked`, `chokidar`, `eta`; pin extras in `interactions.manifest.json`.
5. **Determinism** — same inputs (incl. source snapshots) → same output; live fetches restored to reproducibility via snapshot cache.
6. **Incremental build** — hash cache; unchanged tasks skip render; changed API snapshot re-renders dependent pages.
7. **Browser interaction** — build output loads `assets/script.js` and modules; interactions never call authed APIs.
8. **Dev SSE injection** — dev only.
9. **Port auto-increment** — mandatory in `dev.js`.
10. **Debounce** — 300ms + build lock.
11. **Runtime validation** — manifest (current v1), config, tokens, content-types validated at startup.
12. **Unknown source/view type → explicit error** naming the missing adapter or invalid field. No silent fallback, no markdown assumption.
13. **Build-time fetch only; secrets from `process.env`, never written to any artifact.** Enforced by `assertNoSecretsInOutput`.
