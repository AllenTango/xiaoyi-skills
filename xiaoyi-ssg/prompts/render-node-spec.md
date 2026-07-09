# render.js / dev.js Spec (Template-Manifest-Driven)

This document defines the full spec of the Node.js scripts the AI should produce when generating the rendering pipeline. The AI writes code per this spec into the user project's `.xiaoyi-ssg/`.

---

## Technical Constraints

- **Node.js 18+** (LTS, built-in `fetch`, `fs.cpSync`)
- **ESM module system** (`"type": "module"`, use `import`/`export`)
- **Path derivation**: `render.js` and `dev.js` must derive `PIPELINE_DIR` from `import.meta.url`, then derive `SITE_ROOT` as `dirname(PIPELINE_DIR)`. Do not use `process.cwd()` as the site root.
- Dependencies: `js-yaml` (YAML parsing), `marked` (Markdown → HTML), `chokidar` (file watching, dev.js only), `eta` (template engine).
- Template engine: use `eta` (~2KB, ESM, supports HTML escaping, raw HTML, conditionals, loops, async, custom filters).
- Two separate files: `render.js` (build) and `dev.js` (dev).
- Allowed to generate `assets/script.js`, `assets/interactions/*.js`, `assets/data/*.json` to implement static-host-compatible browser interactions. Interactions must not depend on the dev server to work.

---

## Site Language Contract

- The generated renderer must treat `config.site.language` as the authoritative BCP 47 language tag for the site.
- The init/new-site workflow must set `config.site.language` from the user's request language unless the user explicitly specifies another language.
- Templates must use `<html lang="<%= site.language || inferredFallback %>">`; the fallback must be the inferred site language from generation time, not a hard-coded English default.
- All user-facing strings produced by templates, generated JavaScript, generated feeds, 404 pages, pagination, search/filter UI, comments UI, aria labels, placeholders, and empty states must be localized to the site language.
- Internal identifiers may remain ASCII/English, but visible text such as "Home", "Search", "Tags", "Comments", "Loading", "No results", "Previous", "Next", and "Page Not Found" must be translated when the site language is not English.
- Generated search indexes may include any content language, but UI labels and result status messages must match `config.site.language`.
- When rendering existing user-authored Markdown, preserve the original content language; do not translate user content unless explicitly requested.

---

## Core Data Structure: template-manifest.json

The single source of truth for the rendering pipeline. When the AI generates the pipeline, it must produce a manifest that conforms to `schemas/template-manifest.json` based on the user's content model and site structure intent.

### Manifest Structure Overview

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
    { "name": "index", "type": "page", "layout": "base", "file": "index.html", "output": "/", "data": {} },
    { "name": "list", "type": "page", "layout": "base", "file": "list.html", "output": "{collection.pagination.path}", "forEach": "collections" },
    { "name": "detail", "type": "page", "layout": "base", "file": "detail.html", "output": "/{collection}/{slug}/", "forEach": "items" },
    { "name": "404", "type": "page", "layout": "base", "file": "404.html", "output": "/404/" }
  ]
}
```

### Key Field Definitions

| Field | Description |
|-------|-------------|
| `collections` | Content collection definitions, key = collection name, value = source path, sort, pagination, singleton, tree, etc. |
| `templates[]` | Array of template definitions |
| `templates[].type` | `"layout"` (layout template, contains `<%~ body %>` slot) or `"page"` (renders an output page) |
| `templates[].forEach` | Expansion strategy: `"collections"` (one per collection), `"items"` (one per content item), `"pagination"` (one per page), omitted = single expansion |
| `templates[].output` | Output path template, supports placeholders: `{collection}`, `{slug}`, `{n}` (page number), `{lang}`, `{date:YYYY}`, etc. |
| `templates[].lang` | Optional, language code array; injects `{lang}` placeholder during expansion |
| `collections[].pagination` | Pagination config when enabled: `perPage`, `path` (contains `{n}` placeholder) |
| `collections[].singleton` | Render only the first item as a single page (for landing, about, singleton content) |
| `collections[].tree` | Build tree structure (used for docs site sidebar navigation) |

---

## render.js — Core Render Script

> ⚠️ **Mandatory**: before generating `render.js`, the AI must first read [`templates/conventions.md`](../templates/conventions.md). It defines the Eta syntax, variable binding, and custom field flattening rules. Non-compliance produces pipelines that look correct but render empty pages.

### Overall Flow

```javascript
async function build(fresh = false) {
  // 1. Load manifest + validate
  const manifest = loadManifest();
  validateManifest(manifest);

  // 2. Load config, tokens, content-types, interactions
  const config = loadConfig();
  const tokens = loadTokens();
  const contentTypes = loadContentTypes();
  const interactions = loadInteractionsManifest();
  const cache = loadCache();

  // 3. Validate config
  validateConfig(config);
  validateContentTypes(contentTypes);

  // 4. Scan content → collections data
  const collections = scanCollections(manifest, contentTypes);

  // 5. Global data
  const nav = buildNav(config, contentTypes);
  const globals = { site: config.site, nav, tokens, build_time: new Date().toISOString() };

  // 6. Initialize Eta
  const eta = initEta();

  // 7. Expand template tasks
  const tasks = expandTemplates(manifest, collections);

  // 8. Render each task (incremental cache)
  for (const task of tasks) {
    const hash = computeTaskHash(task, tokens, config, interactions);
    if (!fresh && cacheHit(task.output, hash)) continue;

    const data = { ...globals, ...task.data };
    const html = renderWithLayout(eta, task.layout, task.file, data);
    writeOutput(task.output, html);
    updateCache(task.output, hash);
  }

  // 9. Copy assets, generate interaction data, feed, sitemap, 404
  copyAssets();
  writeExtras(buildExtras(config, collections, interactions));
  generateFeeds(collections, config);
  generateSitemap(tasks, config);
  generate404(config, tokens, eta, nav);

  // 10. Save cache, print summary
  saveCache(cache);
  printSummary(outputs);
}
```

### Key Function Specs

#### `loadManifest()`
- Read `.xiaoyi-ssg/template-manifest.json`
- Validate per `schemas/template-manifest.json`
- On failure, `process.exit(1)`

#### `scanCollections(manifest, contentTypes)`
- Iterate over `manifest.collections`, read each `source` directory's `.md` files
- Parse front-matter, validate required fields (see `contentTypes.types[collectionName].fields`)
  - **Compatibility**: `content-types.json` schema may use the `types` or `collections` key (render.js reads `types` first, falls back to `collections`)
- Generate standardized item objects:
  ```js
  { collection, slug, title, date, dateDisplay, tags, categories, cover, excerpt, bodyHtml, draft, navOrder, parent, customFields,
    // custom fields flattened to top level (templates use item.year instead of item.customFields.year)
    ...data
  }
  ```
- Sort by `sort.field` / `sort.order`
- Pre-compute `pagination` (if defined): `{ perPage, totalPages, path }`
- Build `tree` (if `tree: true`): assemble by `parent` / `navOrder`
- Returns: `{ [colName]: { items, pagination, tree, singleton } }`

#### `expandTemplates(manifest, collections)`
Expand declarative templates into a list of concrete render tasks:

```js
function expandTemplates(manifest, collections) {
  const tasks = [];
  for (const tpl of (manifest.templates || [])) {
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
Path template interpolation, supports placeholders:
- `{collection}`, `{slug}`, `{n}`, `{lang}`
- `{date:YYYY}`, etc. (date format)
- Undefined placeholder → empty string

#### `computeTaskHash(task, tokens, config, interactions)`
Compute the task input hash, used for incremental cache:
```
hash = sha256(
  contentFile (if any) +
  templateFile (task.file) +
  layoutFile (task.layout) +
  JSON.stringify(tokens) +
  JSON.stringify({ site: config.site, pages: config.pages }) +
  JSON.stringify(interactions) +
  assets/style.css content (if exists) +
  assets/script.js content (if exists)
)
```

#### `renderWithLayout(eta, layoutName, pageTemplate, data)`
```js
const dataWithExtras = { ...data, collectionName: data.collection || data.collectionName };
const body = await eta.renderAsync(pageTemplate, dataWithExtras);
return await eta.renderAsync(layoutName, { ...dataWithExtras, body });
```
- **Note**: Eta defaults to `useWith: true`; in the layout, body concatenation must use `<%~ body %>` (not `<%- body %>`, which would output an empty string).
- In templates, access fields directly at top level (`<%= site.title %>`); do NOT prefix with `it.` (`<%= it.site.title %>` will fail).
- `collectionName` compatibility: `data.collection` is automatically exposed as `collectionName`, so the template can uniformly map type names like "post" to friendly labels.

### General Globals (for home page)

The home page template needs "most recent N items" + "all-X link". `render.js` finds the first non-`page` collection as `primaryCollection`:

```js
const primaryColName = Object.keys(collections).find(k => k !== 'page') || 'post';
globals.recentItems = (collections[primaryColName]?.items || []).slice(0, 5);
globals.allItemsUrl = `/${primaryColName}/`;
```

The template uniformly uses `recentItems` and `allItemsUrl` to avoid writing different global names per content type (`recentPosts` / `recentProjects`). If you want the old naming, add a top-level compat in the template: `<% const recentPosts = recentItems %>`.

### Mandatory Self-Test (run after generation)

After generating the pipeline, **the AI must run these 5 checks** before declaring success:

1. `node .xiaoyi-ssg/render.js --fresh` → exit code 0, output `build done · rendered=N cached=0 files=... · Nms`
2. `grep -l '<html' public/index.html` → hit
3. `grep -c '<%~ body' .xiaoyi-ssg/templates/base.html` → at least 1 (confirm layout uses raw body)
4. `grep -cE 'recentItems|recentPosts' .xiaoyi-ssg/templates/index.html` → at least 1 (home page uses recent items)
5. `find source/_* -name '*.md' | wc -l` == `find public -name 'index.html' | wc -l - 3` (3 = feed/sitemap/404 exceptions)

If any fails, the pipeline is broken and must be fixed; do not claim "it mostly works".

### Design System Source Mandatory Check

Before generating `assets/style.css`, the AI must load `frontend-design` and normalize into `.xiaoyi-ssg-design-tokens.json`:

1. **Check 1**: `.xiaoyi-ssg-design-tokens.json` must contain a non-empty `source_skill` field with value `"frontend-design"` (or `"self-extracted"` only after explicit `--allow-self-extracted`).
2. **Check 2**: `grep -c 'source_skill' <SITE_ROOT>/.xiaoyi-ssg-design-tokens.json` ≥ 1.
3. **Check 3**: `source_skill` does NOT accept `popular-web-designs/*` / `claude-design` / `design-md` / etc.
4. **Check 4**: CSS font stacks, primary colors, radii, and motion must be traceable to `source_skill` / `source_ref` and `normalization_notes`; the AI is not allowed to redesign.

---

## dev.js — Dev Server

### Core Structure

```javascript
import { build } from './render.js';
import chokidar from 'chokidar';

// 1. Initial build
await build(false);

// 2. Start HTTP server serving public/ (port 3000 auto-increment)
// 3. Inject SSE client script before HTML </body>
// 4. chokidar watch:
//    - source/**/*.md
//    - .xiaoyi-ssg/templates/**
//    - .xiaoyi-ssg/assets/**
//    - .xiaoyi-ssg/template-manifest.json
//    - .xiaoyi-ssg/content-types.json
//    - .xiaoyi-ssg/interactions.manifest.json
//    - .xiaoyi-ssg-design-tokens.json
//    - config.yml
//    - source/_media/**
// 5. On change → debounce 300ms → incremental build build(false) → SSE push reload
```

### Key Points

- **Reuse build**: dev.js `import { build } from './render.js'`, in-process call, avoiding `execSync` overhead
- **Watch manifest change**: `template-manifest.json` change triggers full re-expansion + render
- **SSE injection**: only dev mode injects; build output does not

---

## Interaction Data Generation (buildExtras)

At the end of the build, generate `public/assets/data/*.json` for browser interactions to consume:

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

## Additional Artifacts

| Artifact | Generation |
|----------|------------|
| `feed.xml` / `feed.json` | Iterate `collections.posts` or `collections.articles` top 50 items |
| `sitemap.xml` | Iterate all `tasks` `output` (excluding 404) |
| `404.html` | Render the `404` template (declared in manifest) |
| `llms.txt` | Aggregate all content items, always on |
| `llms-full.txt` | Opt-in via `config.geo.llms_full`, concat raw markdown bodies |
| `robots.txt` | Always on, 15-bot AI crawler list + policy |
| `<page>/index.md` | Per-page markdown mirror, opt-out via `config.geo.markdown_mirror: false` |

---

## GEO Generators (Generative Engine Optimization)

> Full spec: [`geo-conventions.md`](./geo-conventions.md). This section is the render.js side: function shapes, output paths, cache participation.

### `generateLlmsTxt(collections, config, contentTypes)`

Always on. Writes `public/llms.txt`.

```javascript
function generateLlmsTxt(collections, config, contentTypes) {
  const site = config.site || {};
  const navOrder = (contentTypes && contentTypes.nav_order) || Object.keys(collections);
  const lines = [];
  lines.push(`# ${site.title || ''}`);
  if (site.description) lines.push(`\n> ${site.description}\n`);
  else lines.push('');
  const sortedCols = navOrder.filter(k => collections[k]).concat(
    Object.keys(collections).filter(k => !navOrder.includes(k))
  );
  for (const colName of sortedCols) {
    const col = collections[colName];
    if (!col || col.singleton || !col.items || col.items.length === 0) continue;
    const label = (col.typeDef && col.typeDef.label) || colName;
    lines.push(`\n## ${label}\n`);
    for (const item of col.items) {
      if (item.draft) continue;
      const url = `${site.url || ''}${item.url}`;
      const desc = item.summary || item.excerpt || item.description || '';
      lines.push(desc
        ? `- [${item.title}](${url}): ${desc}`
        : `- [${item.title}](${url})`);
    }
  }
  // Singleton pages go in a flat ## Pages section
  const singletonEntries = [];
  for (const [colName, col] of Object.entries(collections)) {
    if (!col.singleton || !col.items || !col.items[0]) continue;
    const item = col.items[0];
    const url = `${site.url || ''}${item.url}`;
    const desc = item.summary || item.excerpt || item.description || '';
    singletonEntries.push(desc
      ? `- [${item.title}](${url}): ${desc}`
      : `- [${item.title}](${url})`);
  }
  if (singletonEntries.length) {
    lines.push(`\n## Pages\n`);
    for (const e of singletonEntries) lines.push(e);
  }
  writeFileSync(join(PUBLIC_DIR, 'llms.txt'), lines.join('\n') + '\n', 'utf-8');
}
```

### `generateLlmsFullTxt(collections, config)`

Opt-in. Writes `public/llms-full.txt`. Reads raw markdown from source files (not `body_html`).

```javascript
function generateLlmsFullTxt(collections, config, contentFileMap) {
  if (!config.geo || !config.geo.llms_full) return;
  const site = config.site || {};
  const parts = [`# ${site.title || ''}\n`];
  if (site.description) parts.push(`> ${site.description}\n`);
  for (const [colName, col] of Object.entries(collections)) {
    if (!col || !col.items) continue;
    for (const item of col.items) {
      if (item.draft) continue;
      const sourcePath = contentFileMap && contentFileMap.get(item.url);
      if (!sourcePath) continue;
      const raw = readFileSync(sourcePath, 'utf-8');
      const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
      const body = m ? m[1] : raw;
      parts.push(`\n---\n\n## [${item.title}](${site.url || ''}${item.url})\n\n${body.trim()}\n`);
    }
  }
  writeFileSync(join(PUBLIC_DIR, 'llms-full.txt'), parts.join(''), 'utf-8');
}
```

`contentFileMap` is `Map<pageUrl, sourceMdPath>` built during `scanCollections`.

### `generateRobotsTxt(config)`

Always on. Writes `public/robots.txt`. Hardcoded 15-bot list.

```javascript
const AI_BOTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'Claude-Web', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'anthropic-ai',
  'Bytespider', 'CCBot', 'cohere-ai', 'Applebot-Extended', 'Amazonbot', 'Meta-ExternalAgent'
];

function generateRobotsTxt(config) {
  const site = config.site || {};
  const geo = config.geo || {};
  const policy = geo.ai_bots === 'block' ? 'Disallow' : 'Allow';
  const customRules = geo.ai_bot_rules || {};
  const lines = ['User-agent: *'];
  lines.push(geo.noai ? 'Disallow: /' : 'Allow: /');
  if (site.url) lines.push(`\nSitemap: ${site.url}/sitemap.xml`);
  for (const bot of AI_BOTS) {
    let botPolicy = policy;
    if (geo.ai_bots === 'custom') {
      const rule = customRules[bot];
      botPolicy = rule === 'block' ? 'Disallow' : 'Allow';
    }
    lines.push(`\nUser-agent: ${bot}`);
    lines.push(`${botPolicy}: /`);
  }
  lines.push('\n# Generated by xiaoyi-ssg');
  writeFileSync(join(PUBLIC_DIR, 'robots.txt'), lines.join('\n') + '\n', 'utf-8');
}
```

### `mirrorMarkdown(tasks, contentFileMap, config)`

Always on when `config.geo.markdown_mirror !== false`. Writes per-page `<url>/index.md`.

```javascript
function mirrorMarkdown(tasks, contentFileMap, config) {
  if (config.geo && config.geo.markdown_mirror === false) return;
  if (!contentFileMap) return;
  for (const task of tasks) {
    if (!task.output) continue;
    const sourcePath = contentFileMap.get(task.output);
    if (!sourcePath) continue;  // not a content-page task (skip singletons, lists)
    const raw = readFileSync(sourcePath, 'utf-8');
    const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
    const body = m ? m[1] : raw;
    const outDir = join(PUBLIC_DIR, task.output.replace(/\/$/, ''));
    ensureDir(outDir);
    writeFileSync(
      join(outDir, 'index.md'),
      body.trimEnd() + `\n\n<!-- mirrored from: ${relative(SITE_ROOT, sourcePath)} by xiaoyi-ssg -->\n`,
      'utf-8'
    );
  }
}
```

### `buildJsonLd(item, col, site, config, colName)`

Returns a JSON-LD string (or empty) injected into `<head>` via `data.jsonLd`.

```javascript
const SCHEMA_MAP = {
  post: 'BlogPosting', posts: 'BlogPosting', article: 'BlogPosting', articles: 'BlogPosting',
  blog: 'BlogPosting',
  doc: 'TechArticle', docs: 'TechArticle',
  project: 'CreativeWork', projects: 'CreativeWork',
  talk: 'Event', talks: 'Event'
};

function buildJsonLd(item, col, site, config, colName, isSingleton) {
  if (config.geo && config.geo.jsonld === false) return '';
  if (item && item.draft) return '';
  if (isSingleton && (!item || colName === 'landing')) {
    // WebSite for landing
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: site.title, description: site.description,
      url: site.url, inLanguage: site.language,
      publisher: { '@type': 'Organization', name: site.title }
    };
    return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  }
  if (!item) return '';
  const mappedType = (item.content_type && SCHEMA_MAP[item.content_type])
    || SCHEMA_MAP[colName]
    || 'Article';
  const desc = item.summary || item.excerpt || '';
  const ld = {
    '@context': 'https://schema.org',
    '@type': mappedType,
    headline: item.title,
    description: desc,
    url: `${site.url || ''}${item.url}`,
    datePublished: item.date || undefined,
    dateModified: item.updated || item.date || undefined,
    author: { '@type': 'Person', name: site.author || site.title },
    publisher: { '@type': 'Organization', name: site.title },
    keywords: Array.isArray(item.topics) ? item.topics.join(', ') : undefined,
    inLanguage: site.language
  };
  Object.keys(ld).forEach(k => ld[k] === undefined && delete ld[k]);
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}
```

### Wire-up Order

After `generateFeed` and `generateSitemap`, append:

```javascript
generateLlmsTxt(collections, config, contentTypes);
if (config.geo && config.geo.llms_full) {
  generateLlmsFullTxt(collections, config, contentFileMap);
}
generateRobotsTxt(config);
mirrorMarkdown(tasks, contentFileMap, config);
```

### Cache Hash Inputs

| Output | Inputs in hash |
|--------|----------------|
| `llms.txt` | `collections[*].items[].title`, `summary`, `excerpt`, `url`, `draft`; `config.site.title/description/url`; `contentTypes.nav_order`; per-collection `manifest.collections[*].sort` |
| `llms-full.txt` | All `source/_<type>/*.md` raw content + per-collection sort |
| `robots.txt` | `config.geo` block + `config.site.url` |
| `<page>/index.md` | The single source `.md` content for that page |
| JSON-LD on page | Item `summary`/`topics`/`updated`/`content_type` + `site.author`/`site.language` |

`--fresh` re-emits all GEO outputs regardless.

### `contentFileMap` Construction

During `scanCollections`, when iterating items:

```javascript
for (const f of files) {
  // ... existing item building ...
  items.push(item);
  // record mapping for markdown mirror
  contentFileMap.set(item.url, f);
}
```

The map is module-level (or passed via build state) and used after render loop.

---

## Cache File Format

`.xiaoyi-ssg-cache.json`:

```json
{
  "version": 1,
  "outputs": {
    "/blog/page/1/": { "hash": "sha256...", "inputs": ["template-manifest.json", "list.html", "base.html"] }
  }
}
```

---

## Placeholder Substitution at Generation Time

When AI generates `render.js` / `dev.js`, replace the file header metadata:

```javascript
/**
 * xiaoyi-ssg rendering pipeline - template-manifest-driven
 * Regenerate via: /xiaoyi-ssg → adjust style/content type → regenerate pipeline
 * Generated at: {{GENERATED_AT}}
 * Manifest hash: {{MANIFEST_HASH}}
 * Tokens Hash: {{TOKENS_HASH}}
 * Content-Types Hash: {{CONTENT_TYPES_HASH}}
 */
```

---

## Key Generation Constraints

1. **ESM modules** — all `.js` use `import`/`export`; `package.json` has `"type": "module"`.
2. **Two separate files** — `render.js` (build) and `dev.js` (dev) are independent.
3. **Minimal default dependencies** — `js-yaml`, `marked`, `chokidar`, `eta`; pin and record additional packages in `interactions.manifest.json` when interactions need them.
4. **Complete template capability** — Eta supports HTML escaping, raw HTML, conditionals, loops, async, custom filters.
5. **Determinism** — same input produces same output (cache hash mechanism).
6. **Incremental build** — hash cache; unchanged tasks skip render.
7. **Browser interaction** — build output must be able to load `assets/script.js` and required modules.
8. **dev server injection** — only dev mode injects the SSE script.
9. **Port auto-increment** — when dev.js port is in use, automatically +1 and retry.
10. **Debounce** — 300ms debounce + build lock after file change.
11. **Runtime validation** — manifest, config, tokens, content-types validated at startup.
12. **No fallback branch** — no manifest or validation failure → direct error exit, **incompatible with old pipeline versions**.
