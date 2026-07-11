---
name: xiaoyi-ssg
version: 1.0.0
description: 仅在用户显式调用 /xiaoyi-ssg、提及 xiaoyi-ssg、或要求创建/维护 xiaoyi 站点交付项目时使用。生成并维护项目本地的内容、设计、渲染、预览与发布管线，含内容模型、设计 token、可访问 UI，以及兼容静态托管的浏览器交互（导航、搜索、筛选、主题切换、表单、画廊、媒体控件、图表、地图等）。
required_skills:
  - id: frontend-design
---

# xiaoyi-ssg

Lightweight router for a generated site delivery pipeline. Keep this file in context; load detailed prompt files only when the matching task requires them.

## Required Dependencies

> Mandatory: before any `/xiaoyi-ssg` action, the AI must confirm `frontend-design` is loaded. On failure, abort and prompt the user to install. Using `self-extracted` or any other design source as a workaround is forbidden.

**Pre-flight flow:**

1. Call `skill_view(name="frontend-design")` to load the skill.
2. Success: use its content as the design source. Set `source_skill` to `"frontend-design"` and `source_ref` to the loaded file path in `.xiaoyi-ssg-design-tokens.json`.
3. Failure: show the user the install command and pause:
   ```text
   xiaoyi-ssg requires the frontend-design skill.
   Install: npx skills add https://github.com/anthropics/skills --skill frontend-design
   ```
   Do not proceed with pipeline generation.
4. Hard override: only when the user explicitly passes `--allow-self-extracted` may the pre-flight be skipped. In that case, `source_skill` must be set to `"self-extracted"` for traceability, and `pipeline-manifest.json` must record `allowed_self_extracted: true` with a timestamp.

**Single source of truth for design**: `source_skill` is uniformly `"frontend-design"` (unless overridden). Values like `popular-web-designs/*`, `claude-design`, or `self-extracted` are not accepted.

## Client Compatibility

> This section gives a brief note only. The client adapter matrix is not expanded.

The skill content is independent of any specific AI client. Clients are assumed to provide:

- Skill content loading (`load_skill` / `skill_view` / `Read` or equivalent)
- Shell command execution
- File read and write

## Required Reading — Pipeline Generation Constraints

> Mandatory: before writing any `render.js` / `dev.js` / Eta template, the AI must read these files. Skipping them produces broken output. These are hard rules derived from v1.0.0 testing plus the v1 source + view model.

| File | Reason |
|------|--------|
| [`templates/conventions.md`](./templates/conventions.md) | Eta syntax (`<%~ body %>` not `<%-`), variable binding (top-level not `it.`), custom field flattening, 5-step self-test. |
| [`prompts/render-node-spec.md`](./prompts/render-node-spec.md) | v1 engine: `loadSources` + `expandViews`, mandatory self-test, port auto-increment. |
| [`prompts/data-sources.md`](./prompts/data-sources.md) | Source Adapters: markdown / http / json / csv / rss / inline / derived. Secrets only from `process.env`, never to `public/`. Cache + fallback. |
| [`prompts/pipeline-generation.md`](./prompts/pipeline-generation.md) | Full pipeline generation guide, `package.json` dependencies, sources/ directory layout. |
| [`prompts/design-system-extraction.md`](./prompts/design-system-extraction.md) | Rules for normalizing `frontend-design` content into xiaoyi tokens. |
| [`prompts/template-manifest-generation.md`](./prompts/template-manifest-generation.md) | current manifest: `sources + views` patterns, open-ended assembly. |
| [`prompts/geo-conventions.md`](./prompts/geo-conventions.md) | GEO source discipline (markdown sources = source), llms.txt / robots.txt / JSON-LD / md mirror specs. |
| [`schemas/template-manifest.json`](./schemas/template-manifest.json) | current manifest JSON Schema (sources + views). |
| [`schemas/source.schema.json`](./schemas/source.schema.json) | Source Adapter definition JSON Schema. |

## First Rules

- Reply in the user's language unless they request otherwise.
- On init/new site, infer the primary site language from the user's request language unless they explicitly specify another. Write it to `config.site.language` as a valid BCP 47 tag (e.g., `zh-CN`, `en`).
- The inferred language drives all user-facing text: `<html lang>`, nav labels, UI copy, starter Markdown, 404 / pagination / search / filter / theme labels, RSS / Sitemap titles, README snippets, accessibility labels.
- Do not default generated sites to English merely because examples, comments, or identifiers are English. Keep identifiers ASCII when useful; visible UI text follows the inferred site language.
- `<SITE_ROOT>` is the directory containing `config.yml`. `<PIPELINE_DIR>` is `<SITE_ROOT>/.xiaoyi-ssg/`.
- Locate an existing site by walking up from the current directory to find `config.yml`.
- Do not write `<SKILL_DIR>/state.json`. The skill is stateless.
- Build output lives in `public/`, user content in `source/`, generated pipeline source in `.xiaoyi-ssg/`.
- Subdirectories under `source/` are user-managed and must not start with `_`; use `source/<type>/` and `source/media/`.

## Source Protection

`source/` is user-owned content. Unless the current intent is explicitly content creation, editing, migration, or deletion, do not overwrite, delete, reformat, or bulk rewrite:

- `source/**/*.md`
- `source/media/**`

Allowed `source/` writes:

- **init**: create missing directories and optional starter content only when the target path does not already exist.
- **new content**: create the requested single content file.
- **content edit**: modify only the file the user identified or confirmed.
- **content type add**: create the missing `source/<type>/` directory without touching existing files.
- **migration/rename/delete**: proceed only after showing affected paths and getting explicit user intent.

## Site Shape

Generated sites should follow this layout:

```text
<SITE_ROOT>/
├── config.yml
├── .xiaoyi-ssg-design-tokens.json
├── .xiaoyi-ssg-cache.json
├── source/
│   ├── media/
│   └── <type>/            # markdown content (when used)
├── .xiaoyi-ssg/
│   ├── package.json
│   ├── package-lock.json
│   ├── node_modules/
│   ├── render.js           # v1 engine: loadSources + expandViews
│   ├── dev.js              # dev server (manifest + adapter watching)
│   ├── sources/            # Source Adapters (markdown/http/json/csv/rss/inline/derived)
│   ├── templates/          # declared by template-manifest.json
│   ├── assets/
│   │   ├── style.css
│   │   ├── script.js
│   │   ├── interactions/
│   │   └── data/
│   ├── .cache/             # remote source snapshots (git-ignored)
│   │   └── sources/
│   ├── template-manifest.json   # current single source of truth: sources + views
│   ├── content-types.json       # markdown front-matter schema (render.js does not read this)
│   ├── interactions.manifest.json
│   └── pipeline-manifest.json
└── public/
```

Commit `.xiaoyi-ssg/` pipeline source. Ignore `.xiaoyi-ssg/node_modules/`, `public/`, `.xiaoyi-ssg-cache.json`, `.xiaoyi-ssg/.cache/`.

## GEO (Generative Engine Optimization)

> Built-in. No user setup required.

Every generated site ships with GEO-ready artifacts, derived from the user's existing content (`source/<type>/*.md`):

- `/llms.txt` — Answer.AI standard site map for LLMs (always on)
- `/llms-full.txt` — concatenated markdown body of all content (opt-in via `config.geo.llms_full: true`)
- `/robots.txt` — with a fixed 15-bot AI crawler list, policy from `config.geo.ai_bots`
- Per-page markdown mirror at `/<page>/index.md` (frontmatter stripped, body unchanged)
- JSON-LD in `<head>` per page (schema.org `BlogPosting` / `TechArticle` / `WebSite` / etc. by collection)
- Semantic `<meta property="article:*">`, `<time datetime>`, `<article>` enrichment

**GEO source discipline**: the user's existing markdown files are the source. The AI must NOT invent a separate `geo/` directory or require a new authoring flow. Frontmatter may be enriched with `summary`, `topics`, `audience`, `citation_key`, `content_type`, `updated`, `noai` — but all are optional; defaults auto-derive.

See [`prompts/geo-conventions.md`](./prompts/geo-conventions.md) for the full spec (output formats, schema mapping, cache participation, common pitfalls).

## v1 Source + View Model

> The v1 engine is structurally open. There is no "blog mode" / "docs mode" / "landing mode" baked in.

A site is described by two orthogonal, open abstractions:

- **`sources`** — named data origins. Each source is resolved by a Source Adapter (markdown / http / json / csv / rss / inline / derived) into the same normalized item shape. New kinds = add one adapter file under `.xiaoyi-ssg/sources/<type>.js` + one `enum` entry in `schemas/source.schema.json`; the engine does not change.
- **`views`** — page generators. Each view is either a layout (`type=layout`) or a page (`type=page`). Pages expand into concrete tasks via one of three shapes, source-type agnostic:
  - `for.each: <source>` → one page per item (detail, product, repo, tag page, ...).
  - `for.paginate: <source>` → one page per pagination slice (list, archive, paginated API, ...).
  - `for` omitted → single page (home, 404, computed). May pull data from multiple sources via `use: [...]`.

Concretely, this removes three earlier collection-style limitations at once:

- **API-backed apps are first-class**: `{ type: "http", url, auth: { env } }` is a source like any other; products / GitHub repos / Notion pages / RSS feeds all render through the same `for.each` mechanism as markdown posts.
- **Aggregation / taxonomy pages are first-class**: a `derived` source of `op: "groupBy"` produces one item per distinct tag/category/author, and a `for.each` view over it emits one `/tag/{field}/` page per group.
- **Multi-source home pages are first-class**: `use: ["posts", "products", "releases"]` injects each dataset as a top-level variable; the home template iterates them independently.

Full contract: [`prompts/data-sources.md`](./prompts/data-sources.md), [`prompts/template-manifest-generation.md`](./prompts/template-manifest-generation.md), [`prompts/render-node-spec.md`](./prompts/render-node-spec.md).

The current v1 development branch uses the `sources + views` form. Older collection-style drafts should be migrated deliberately; this remains within the v1 scope and does not imply a version bump.

## Intent Routing

| Intent | Trigger examples | Required files |
|--------|------------------|----------------|
| init / new site | "create a portfolio site" | prompts/template-manifest-generation, prompts/data-sources, prompts/design-system-extraction, prompts/pipeline-generation, prompts/render-node-spec |
| style/theme/reference change | "switch to a cleaner style", "like xxx.com" | prompts/reference-analysis (if URL/screenshot), prompts/design-system-extraction, prompts/template-manifest-generation, prompts/pipeline-generation, prompts/render-node-spec |
| content type add/change | "add a 'project' type" | prompts/content-type-definition (for markdown); update `.xiaoyi-ssg/content-types.json` and the corresponding markdown `source` + `view` in `template-manifest.json` |
| **data source add/change** | "pull from this API / fetch this feed / aggregate by tag" | prompts/data-sources, prompts/template-manifest-generation; update `template-manifest.json` (`sources` + `view` consuming it); regenerate pipeline |
| interaction add/change | "add search/filter/lightbox" | prompts/pipeline-generation, prompts/render-node-spec |
| new content | "add a new article" | create file only; do not regenerate pipeline unless content model changes |
| content edit | "change the title/add a tag" | modify only the confirmed content file |
| build | "build/generate/publish" | `node .xiaoyi-ssg/render.js` (from `<SITE_ROOT>`) or `npm run build` (from `<PIPELINE_DIR>`) |
| dev | "dev/realtime preview/watch" | `node .xiaoyi-ssg/dev.js` (includes live reload). Remote sources are not re-fetched on every keystroke — respect each source's `cache.ttl`; use `npm run build:fresh` to force re-fetch. |
| preview | "preview" | use `dev.js` or open `public/index.html` directly |
| diagnose | "check/diagnose" | scan config, tokens, sources, manifest, source frontmatter, build output; do not modify files unless asked |

## Pipeline Rules

`render.js` and `dev.js` must derive paths from `import.meta.url`:

```js
const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
```

Do not use `process.cwd()` as the site root.

Static output may include generated browser JavaScript. Do not remove necessary interaction to keep pages "purely static". Pinned npm dependencies are allowed when interactions materially need them; record them in `interactions.manifest.json`.

Navigation URLs must be normalized. Breadcrumb navigation is optional and should be generated only when the chosen site structure or design source calls for it.

## Navigation / URL Safety

- Normalize nav, pagination, detail, index, and optional breadcrumb URLs with helper functions from `prompts/render-node-spec.md`.
- Do not use breadcrumb navigation as a required design element. Header nav, section nav, sidebar nav, tabs, filters, previous/next links, or other patterns may be more appropriate.
- If breadcrumbs are generated, keep URL paths and visual separators separate.
- If breadcrumbs are generated, never store `//` as breadcrumb data.
- If breadcrumbs are generated, do not render literal `/`, `//`, or separator text inside breadcrumb item data or template loops when CSS already provides separators.
- If breadcrumbs are generated, do not emit separators before the first item or after the last item.
- Normalize all internal paths with helper functions from `prompts/render-node-spec.md`.

Acceptable breadcrumb markup when breadcrumbs are intentionally used:

```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumb">
    <!-- li items only; separators are CSS-only -->
  </ol>
</nav>
```

## Required Checks

After changing this skill:

```bash
npx skills add /absolute/path/to/xiaoyi-skills --list
```

## Common Pitfalls (v1 — learned from real tests)

When a generated pipeline renders empty pages, leaks secrets, or fails expansion, check these first.

### Rendering

1. **Empty `<main>` after first build** — 90% of the time it's the base layout. Must be `<%~ body %>`, not `<%- body %>` (Eta does not recognize `<%-`).
2. **Templates use `it.foo`** — Eta with `useWith: true` does NOT bind `it`. Use top-level variables: `<%= site.title %>`, `<%= item.price %>`, `<%= recentItems %>`.
3. **Custom fields like `year`, `tech_stack`, `price` show `undefined`** — the adapter's `normalizeItem` must spread all keys to the top level. Templates access `item.year`, `item.tech_stack`, `item.price` directly; no `item.customFields.*`.
4. **Home template wants `recentPosts` but the source isn't posts** — do not invent per-source globals. Use the generic `recentItems` / `allItemsUrl` computed by the engine, or declare `use: [...]` on the home view and iterate the injected datasets.
5. **Hardcoded source names in `render.js`** — the engine must not special-case `posts` / `products` / etc. Always iterate `Object.keys(datasets)` or `Object.values(datasets).flatMap(d => d)`.
6. **Detail view expands for the wrong source** — `for.each` / `for.paginate` MUST name a source that exists in `sources`. The engine throws on unknown source names; do not silently expand for all sources as a "fallback".
7. **Pagination page shows wrong items** — `for.paginate` requires `perPage`. `expandViews` slices the filtered dataset in order; verify `sort` is set on the source if order matters.
8. **Derived source is empty** — verify `from` resolves first (topological order is automatic; cycles throw). For `groupBy`, the `field` must exist on items of the source.
9. **Date field parsed by js-yaml as Date** — `<time datetime>` outputs `Wed Jul 08 2026 18:00:00 GMT+0800` instead of ISO. `normalizeItem` must explicitly call `String(item.date)`.
10. **Tokens color change does not update `public/assets/style.css`** — must regenerate the `:root` CSS variable block from tokens.
11. **dev server `/post/` path triggers EISDIR** — the trailing `/` of `urlPath` must append `index.html`.

### Data layer / security

12. **Auth header sent as `Bearer undefined`** — `auth.env` is set in `template-manifest.json` but the env var is not actually present in the build environment. The adapter must NOT send an empty/broken header; follow `fallback` (`cache` / `empty` / `fail`) instead.
13. **Secret value ends up in `public/`** — every secret comes from `process.env` at build time. The `assertNoSecretsInOutput` self-test greps `public/` for resolved secret values and fails the build on any match. If a snapshot contains a secret, the adapter must scrub it before writing the cache.
14. **HTTP fetch never falls back** — `fallback` defaults to `cache`. For load-bearing sources (the only product source of a shop), set `fallback: "fail"` so the build aborts loudly rather than silently producing an empty site.
15. **dev rebuilds hammer the API on every keystroke** — dev must NOT re-fetch remote sources on every change; it respects each source's snapshot + `cache.ttl`. To force a re-fetch in dev, set `cache.ttl: 0` or run `npm run build:fresh`.
16. **`http` adapter is missing for a custom type** — adding a new source kind requires writing `.xiaoyi-ssg/sources/<type>.js` (exporting `async load(def, ctx)`) AND adding the `type` to `schemas/source.schema.json` `enum`. Otherwise the engine throws `Unknown source type`.
17. **Derived source cycle** — A is `from: B`, B is `from: A`. Topological sort fails; the engine throws. Verify the dependency graph.

### Manifest / views

18. **Empty `views` array** — every site needs at least one view (and at least one layout view).
19. **Page view without `layout`** — `type=page` requires a layout name. The engine does not silently fall back to raw output.
20. **Page view without `output`** — `type=page` requires `output`. The engine does not silently fall back.
21. **`use: [...]` names a non-existent source** — engine throws; do not silently drop the variable.

For full rules and examples see [`templates/conventions.md`](./templates/conventions.md) and [`prompts/render-node-spec.md`](./prompts/render-node-spec.md).

## Responsive & Output Requirements (Mandatory)

Generated sites must work on **any device, any browser, any viewport size** without user-agent detection or device-specific JavaScript shims.

**Forbidden:**

- User-Agent string sniffing (`navigator.userAgent.match(/iPhone/)` etc.)
- Client Hints API for capability gating (`navigator.userDataMobile`)
- Device-specific CSS classes hardcoded by JS (`.is-mobile`)
- "Download our app" prompts that block the responsive web view
- Minimum screen width requirements that hide content on small viewports
- Touch vs mouse detection that disables hover-only interactions on touch devices
- iOS-only or Android-only features (no `-webkit-` required for core functionality)

**Required:**

- Mobile-first CSS: base styles target narrow viewports; `@media (min-width: 768px)` etc. add desktop enhancements.
- Use only `pointer` / `hover` / `any-pointer` / `any-hover` media queries when capability gating is truly needed (e.g., `lightbox hover vs tap`); always provide a non-hover fallback.
- All interactive elements reachable via keyboard, with visible focus rings (`:focus-visible`).
- Use `dvh` / `svh` units (not `vh`) for full-viewport sections to handle iOS Safari's dynamic chrome.
- Test layouts at 360px (small phone), 768px (tablet), 1280px (desktop), 1920px (wide desktop).
- Respect `prefers-reduced-motion` and `prefers-color-scheme` as users' actual preference, not just a CSS class toggle.

## Build-time fetch & secrets (Hard Rules)

> The engine is build-time fetch only. The browser never talks to an authed API.

- Secrets live in `process.env` and only at build time. The manifest stores only the env var **name** (`source.auth.env`); the value never appears in any artifact.
- No secret value is allowed in `public/**`, `assets/data/*.json`, the source snapshot cache (`.xiaoyi-ssg/.cache/sources/`), `pipeline-manifest.json`, logs, or error messages.
- `render.js` must run `assertNoSecretsInOutput(manifest.sources)` after build and exit non-zero on any leak. This is part of the mandatory self-test.
- If a future need requires a public read-only key in the browser, that is a separate, explicitly-flagged feature — do not enable it implicitly here. Ask the user.

See [`prompts/data-sources.md`](./prompts/data-sources.md) § Security for the full rule set.

## Design System Delegation (Mandatory)

This skill does not invent CSS templates or design tokens. All design decisions are delegated to the `frontend-design` skill.

`frontend-design` (Anthropic official cross-brand design spec) is the **sole** design source for `xiaoyi-ssg`. Any other source such as `popular-web-designs/*`, `claude-design`, or `self-extracted` is not accepted (unless `--allow-self-extracted` is explicitly passed).

Implementation flow:

1. Load `frontend-design` and extract tokens (color, typography, spacing, radius, motion).
2. Use `prompts/design-system-extraction.md` to normalize them into `.xiaoyi-ssg-design-tokens.json`.
3. The `source_skill` field is uniformly `"frontend-design"`.
4. Map tokens to `:root` CSS variables at render time; do not re-parse JSON at runtime.
5. CSS font stacks, colors, radii, and motion must trace back to `frontend-design`; the AI must not redesign.
