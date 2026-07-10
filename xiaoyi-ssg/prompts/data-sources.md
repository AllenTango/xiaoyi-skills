# Source Adapters (Data Layer)

This file defines the **data layer** of the engine: how a source definition in `template-manifest.json` becomes a normalized array of items. It is the mechanism that lets `xiaoyi-ssg` serve long-tail needs — API-backed apps, aggregation pages, external data — without special-casing them in the engine.

Read together with [`render-node-spec.md`](./render-node-spec.md) (engine internals) and [`schemas/source.schema.json`](../schemas/source.schema.json) (field contract).

---

## Model

The engine has no concept of "blog", "docs", or "landing". It only knows:

```
sources[]  →  loadSources()  →  datasets: { [name]: Item[] }
views[]    →  expandViews()  →  tasks     →  render  →  public/
```

Every source, regardless of kind, resolves to the same **normalized item shape**, so a `markdown` post and an `http` product are interchangeable inputs to any view (`for.each`, `for.paginate`, `use`).

### Normalized Item Shape

```js
{
  slug,            // URL-safe id (required; derived if absent — see Slug Rules)
  title,           // display title
  date,            // ISO date string or '' (String()-coerced; never a JS Date)
  date_display,    // formatted per config.site.language
  excerpt,         // short text or ''
  cover,           // image URL/path or undefined
  tags,            // string[] (default [])
  categories,      // string[] (default [])
  body_html,       // rendered HTML body (markdown/rss) or '' (data sources)
  url,             // canonical page url, filled in by the view that owns the item
  source,          // originating source name
  draft,           // boolean (default false)
  ...rest          // ALL other fields flattened to top level (so item.price, item.stars work directly)
}
```

> The raw markdown source is **not** carried on the item. The markdown adapter records the source file path into `contentFileMap: Map<pageUrl, sourceMdPath>`; the GEO markdown mirror and `llms-full.txt` re-read from disk via that map. Do not invent an `item.body` field — it does not exist.

Custom/API fields are **flattened to the top level**. Do not bury them under `customFields`; templates must be able to write `<%= item.price %>` directly.

---

## Adapter Contract

Each adapter is one file under `.xiaoyi-ssg/sources/<type>.js` exporting:

```js
export async function load(def, ctx) {
  // def  = the source definition object (validated against source.schema.json)
  // ctx  = { SITE_ROOT, PIPELINE_DIR, CACHE_DIR, config, fetchWithCache, applyMap, log }
  // returns: Item[]  (BEFORE sort/tree; the engine applies sort/tree/map generically)
}
```

The engine dispatches on `def.type`. **Unknown type → clear error naming the missing adapter file**, not a silent skip and not a fallback to markdown. Adding a new data kind = add one adapter file + one `enum` value in the schema; the main loop is untouched.

`applyMap(item, def.map, def.defaults)` and generic `sort`/`tree` are engine helpers applied to every adapter's output, so adapters only produce raw items.

---

## Built-in Adapters

### `markdown` (default content)

The classic path. Reads `def.dir` (`source/_posts` etc.), parses front-matter with `js-yaml`, renders body with `marked`.

```json
{ "type": "markdown", "dir": "source/_posts", "sort": { "field": "date", "order": "desc" } }
```

- `slug` = front-matter `slug` else filename without date prefix/extension.
- `body_html` = rendered markdown; raw markdown path is recorded in `contentFileMap` for the GEO markdown mirror.
- All front-matter keys are flattened to the item top level.

### `http` (build-time API fetch)

Fetches a remote API **at build time only** and snapshots the response. This is the core long-tail unlock.

```json
{
  "type": "http",
  "url": "https://api.example.com/v1/products",
  "auth": { "env": "PRODUCTS_API_TOKEN", "header": "Authorization", "prefix": "Bearer " },
  "select": "$.data.items",
  "map": { "slug": "id", "title": "name", "cover": "image_url", "price": "unit_price" },
  "defaults": { "date": "" },
  "cache": { "key": "products-v1", "ttl": 3600 },
  "fallback": "cache",
  "timeout": 15000
}
```

Adapter algorithm:

1. Resolve secret: `const secret = def.auth ? process.env[def.auth.env] : null`.
   - If `def.auth` is set but the env var is missing → follow `fallback` (do **not** send an empty/`Bearer undefined` header).
2. Build request: apply `headers`; if `secret`, place it in `auth.header` (with `prefix`) or `auth.query`.
3. Check snapshot: if `cache.ttl` and a fresh snapshot exists, return it without fetching.
4. `fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) })`.
5. Non-2xx or network error → `fallback` (`cache` | `empty` | `fail`).
6. Parse JSON, apply `select` (JSONPath-lite) to reach the array.
7. `map` + `defaults` → normalized items; write snapshot (see Snapshot Cache).

### `json` / `csv` (local or remote structured file)

```json
{ "type": "json", "file": "data/changelog.json", "select": "$.entries" }
{ "type": "csv", "url": "https://example.com/data.csv", "delimiter": ",", "map": { "title": "name" } }
```

- `file` (local, relative to site root) and `url` (remote) are mutually exclusive.
- `csv`: first row is the header; each subsequent row becomes an item keyed by header names.

### `rss` (feed aggregation)

```json
{ "type": "rss", "url": "https://blog.example.com/feed.xml", "map": { "excerpt": "description" } }
```

- Parse `<item>`/`<entry>` into items: `title`, `url` (link), `date` (pubDate/updated), `excerpt`, `body_html` (content:encoded when present).

### `inline` (literal items in the manifest)

```json
{ "type": "inline", "items": [ { "slug": "a", "title": "Alpha" }, { "slug": "b", "title": "Beta" } ] }
```

For tiny fixed datasets (feature lists, pricing tiers) that do not warrant a file.

### `derived` (compute from another source)

Enables aggregation/taxonomy pages the closed model could not express.

```json
{ "type": "derived", "from": "posts", "op": "groupBy", "field": "tags" }
```

`op` semantics:

| op | output |
|----|--------|
| `groupBy` | one item per distinct value of `field`: `{ slug, value, count, items }` (for `/tag/{slug}/` pages) |
| `filter` | items of `from` matching `where` |
| `map` | items of `from` with only mapped fields |
| `flatten` | flatten an array field into individual items |
| `unique` | de-duplicate `from` by `field` |
| `count` | single item `{ count }` (for stat/summary pages) |

`derived` runs **after** its `from` source is resolved; the engine orders source resolution so dependencies load first (topological order; cycles are an error).

---

## JSONPath-lite (`select` / `map` values)

A minimal subset is enough; do not pull a full JSONPath dependency:

- `$` = response root
- `.key` = object property
- `.a.b.c` = nested property
- `[n]` = array index
- A bare field name in `map` (`"name"`, `"image_url"`) = a top-level property of each item.

If the expression does not resolve, treat as `undefined` and let `defaults` fill in.

---

## Snapshot Cache (remote sources)

Remote adapters (`http`, remote `json`/`csv`, `rss`) snapshot their normalized items to:

```
.xiaoyi-ssg/.cache/sources/<key>.json
```

- `<key>` = `cache.key` if set, else a sha256 of the source definition **with secrets stripped**.
- Snapshot format: `{ "fetched_at": ISO8601, "items": [...] }`.
- Purpose: reproducible offline / CI-without-secret builds via `fallback: "cache"`, and TTL-based re-fetch skipping.
- `.xiaoyi-ssg/.cache/` is **git-ignored**.

---

## Security (Hard Rules)

These are mandatory and enforced by a build self-test:

1. **Secrets come only from `process.env` at build time.** The manifest stores only the env var **name** (`auth.env`), never the value.
2. **Secrets never reach the client.** No secret value may appear in `public/**`, in `assets/data/*.json`, in the snapshot cache, or in any generated JS. All fetching happens in `render.js` at build time; the browser never talks to the authed API.
3. **No secret in provenance.** `pipeline-manifest.json`, logs, and error messages must reference `auth.env` by name only; if a fetch fails, the message says `env PRODUCTS_API_TOKEN is not set`, never the value.
4. **Snapshot scrubbing.** Before writing a snapshot, strip any field whose value equals a known `process.env` secret used in the request.
5. **Client-runtime fetching is out of scope.** The engine is build-time fetch only. If a future need requires public read-only keys in the browser, that must be a separate, explicitly-flagged feature — do not do it implicitly here.

Build self-test (added to the mandatory checklist): after build, for every `auth.env` used, confirm its resolved value does **not** occur anywhere under `public/`. If it does, fail the build.

---

## Slug Rules

- Use `map.slug` if provided, else `id`/`slug`/`key` field, else a slugified `title`, else a stable index.
- Slugs must be URL-safe (lowercase, `[a-z0-9-]`), unique within a source. On collision, append `-2`, `-3`, …
- Never let an API's raw numeric id become a bare path segment without confirming it is URL-safe.

---

## Failure & Determinism

- A source with `fallback: "cache"` and no snapshot yields `[]` and a warning; the build still succeeds so the site scaffold is inspectable.
- `fallback: "fail"` is for sources whose absence makes the site meaningless (e.g. the only product source of a shop) — it aborts with a non-zero exit and a clear message.
- Determinism: with a snapshot present and `ttl` unexpired, two consecutive builds produce byte-identical output (except timestamp fields). Live fetches are non-deterministic by nature; the snapshot is what restores reproducibility for CI.

---

## Hint to AI

> You are a data architect first, a page designer second.
> 1. Ask where each piece of data lives: local markdown, an API, a file, a feed, or derived from another source.
> 2. Model each as a `source`. Pick the adapter by origin, not by page type.
> 3. For APIs: always ask whether auth is needed; if yes, use `auth.env` and tell the user which env var to set (`PRODUCTS_API_TOKEN=...`). Never inline a token.
> 4. Choose `fallback` deliberately: `cache` for resilience, `fail` for load-bearing sources.
> 5. Only after the data model is settled, design `views` over those sources.