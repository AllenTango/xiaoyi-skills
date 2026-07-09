---
name: xiaoyi-ssg
version: 1.0.0
description: 仅在用户显式调用 /xiaoyi-ssg、提及 xiaoyi-ssg、或要求创建/维护 xiaoyi 静态站项目时使用。生成并维护项目专属的静态站渲染管线，含内容模型、设计 token、可访问 UI，以及兼容静态托管的浏览器交互（导航、搜索、筛选、主题切换、表单、画廊、媒体控件、图表、地图等）。
required_skills:
  - id: frontend-design
---

# xiaoyi-ssg

Lightweight router for a generated static site pipeline. Keep this file in context; load detailed prompt files only when the matching task requires them.

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

> Mandatory: before writing any `render.js` / `dev.js` / Eta template, the AI must read these 5 files. Skipping them produces broken output. These are hard rules derived from v1.0.0 testing.

| File | Reason |
|------|--------|
| [`templates/conventions.md`](./templates/conventions.md) | Eta syntax (`<%~ body %>` not `<%-`), variable binding (top-level not `it.`), custom field flattening, 5-step self-test. |
| [`prompts/render-node-spec.md`](./prompts/render-node-spec.md) | Full spec of `render.js` / `dev.js`, `expandTemplates` rules, 5-step mandatory self-test. |
| [`prompts/pipeline-generation.md`](./prompts/pipeline-generation.md) | Full pipeline generation guide, `package.json` dependencies, `template-manifest` decisions. |
| [`prompts/design-system-extraction.md`](./prompts/design-system-extraction.md) | Rules for normalizing `frontend-design` content into xiaoyi tokens. |
| [`prompts/template-manifest-generation.md`](./prompts/template-manifest-generation.md) | `template-manifest.json` field definitions, pattern examples. |
| [`prompts/geo-conventions.md`](./prompts/geo-conventions.md) | GEO source discipline (existing content = source), llms.txt / robots.txt / JSON-LD / md mirror specs. |

## First Rules

- Reply in the user's language unless they request otherwise.
- On init/new site, infer the primary site language from the user's request language unless they explicitly specify another. Write it to `config.site.language` as a valid BCP 47 tag (e.g., `zh-CN`, `en`).
- The inferred language drives all user-facing text: `<html lang>`, nav labels, UI copy, starter Markdown, 404 / pagination / search / filter / theme labels, RSS / Sitemap titles, README snippets, accessibility labels.
- Do not default generated sites to English merely because examples, comments, or identifiers are English. Keep identifiers ASCII when useful; visible UI text follows the inferred site language.
- `<SITE_ROOT>` is the directory containing `config.yml`. `<PIPELINE_DIR>` is `<SITE_ROOT>/.xiaoyi-ssg/`.
- Locate an existing site by walking up from the current directory to find `config.yml`.
- Do not write `<SKILL_DIR>/state.json`. The skill is stateless.
- Build output lives in `public/`, user content in `source/`, generated pipeline source in `.xiaoyi-ssg/`.

## Source Protection

`source/` is user-owned content. Unless the current intent is explicitly content creation, editing, migration, or deletion, do not overwrite, delete, reformat, or bulk rewrite:

- `source/**/*.md`
- `source/_media/**`

Allowed `source/` writes:

- **init**: create missing directories and optional starter content only when the target path does not already exist.
- **new content**: create the requested single content file.
- **content edit**: modify only the file the user identified or confirmed.
- **content type add**: create the missing `source/_<type>/` directory without touching existing files.
- **migration/rename/delete**: proceed only after showing affected paths and getting explicit user intent.

## Site Shape

Generated sites should follow this layout:

```text
<SITE_ROOT>/
├── config.yml
├── .xiaoyi-ssg-design-tokens.json
├── .xiaoyi-ssg-cache.json
├── source/
│   ├── _media/
│   └── _<type>/
├── .xiaoyi-ssg/
│   ├── package.json
│   ├── package-lock.json
│   ├── node_modules/
│   ├── render.js              # core render (manifest-driven, main loop < 150 lines)
│   ├── dev.js                 # dev server (manifest watching)
│   ├── templates/             # declared by template-manifest.json
│   ├── assets/
│   │   ├── style.css
│   │   ├── script.js
│   │   ├── interactions/
│   │   └── data/
│   ├── template-manifest.json # single source of truth
│   ├── content-types.json
│   ├── interactions.manifest.json
│   └── pipeline-manifest.json
└── public/
```

Commit `.xiaoyi-ssg/` pipeline source. Ignore `.xiaoyi-ssg/node_modules/`, `public/`, `.xiaoyi-ssg-cache.json`.

## GEO (Generative Engine Optimization)

> Built-in. No user setup required.

Every generated site ships with GEO-ready artifacts, derived from the user's existing content (`source/_<type>/*.md`):

- `/llms.txt` — Answer.AI standard site map for LLMs (always on)
- `/llms-full.txt` — concatenated markdown body of all content (opt-in via `config.geo.llms_full: true`)
- `/robots.txt` — with a fixed 15-bot AI crawler list, policy from `config.geo.ai_bots`
- Per-page markdown mirror at `/<page>/index.md` (frontmatter stripped, body unchanged)
- JSON-LD in `<head>` per page (schema.org `BlogPosting` / `TechArticle` / `WebSite` / etc. by collection)
- Semantic `<meta property="article:*">`, `<time datetime>`, `<article>` enrichment

**GEO source discipline**: the user's existing markdown files are the source. The AI must NOT invent a separate `_geo/` directory or require a new authoring flow. Frontmatter may be enriched with `summary`, `topics`, `audience`, `citation_key`, `content_type`, `updated`, `noai` — but all are optional; defaults auto-derive.

See [`prompts/geo-conventions.md`](./prompts/geo-conventions.md) for the full spec (output formats, schema mapping, cache participation, common pitfalls).

## Intent Routing

| Intent | Trigger examples | Required files |
|--------|------------------|----------------|
| init / new site | "create a portfolio site" | prompts/content-type-definition, prompts/template-manifest-generation, prompts/design-system-extraction, prompts/pipeline-generation, prompts/render-node-spec |
| style/theme/reference change | "switch to a cleaner style", "like xxx.com" | prompts/reference-analysis (if URL/screenshot), prompts/design-system-extraction, prompts/template-manifest-generation, prompts/pipeline-generation, prompts/render-node-spec |
| content type add/change | "add a 'project' type" | prompts/content-type-definition; update `.xiaoyi-ssg/content-types.json` and `template-manifest.json` |
| interaction add/change | "add search/filter/lightbox" | prompts/pipeline-generation, prompts/render-node-spec |
| new content | "add a new article" | create file only; do not regenerate pipeline unless content model changes |
| content edit | "change the title/add a tag" | modify only the confirmed content file |
| build | "build/generate/publish" | `node .xiaoyi-ssg/render.js` (from `<SITE_ROOT>`) or `npm run build` (from `<PIPELINE_DIR>`) |
| dev | "dev/realtime preview/watch" | `node .xiaoyi-ssg/dev.js` (includes live reload) |
| preview | "preview" | use `dev.js` or open `public/index.html` directly |
| diagnose | "check/diagnose" | scan config, tokens, content types, manifest, source frontmatter, build output; do not modify files unless asked |

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

## Common Pitfalls (learned from real tests)

When a generated pipeline renders empty pages, check these first:

1. **Empty `<main>` after first build** — 90% of the time it's the base layout. Must be `<%~ body %>`, not `<%- body %>` (Eta does not recognize `<%-`).
2. **List/index template renders nothing** — templates are using `it.col` or `it.recentPosts`. Eta with `useWith: true` does NOT bind `it`. Use top-level variables: `<%= col %>`, `<%= recentItems %>`.
3. **Custom fields like `year`, `tech_stack` show `undefined`** — `render.js`'s `scanCollections` must spread `...data` onto each item so `item.year` works without going through `item.customFields.year`. The spec requires this — confirm the generated `render.js` includes `...data` in the item builder.
4. **`recentPosts is not defined`** — `render.js`'s globals and template names must match. Use `recentItems` / `allItemsUrl` as generic globals; if you want `recentPosts` style, pick one and stick to it.
5. **Hardcoded `collections.post` in `render.js`** — breaks any non-post collection. Replace with `Object.values(collections).flatMap(c => c.items)` or use the `primaryColName` lookup pattern.
6. **`contentTypes.types[name]` undefined** — `content-types.json` may use `collections` key. `render.js` must read both: `(contentTypes.types || contentTypes.collections || {})[name]`.
7. **page-detail template expands to all collections** — `manifest` must explicitly declare `data.collection`; `render.js` must not fall back to expanding for all collections.
8. **`forEach: collections` non-paginated branch overwrites paginated branch** — use `/${collectionName}/` to reconstruct the path; do not use `tpl.output` directly.
9. **Date field parsed by js-yaml as Date** — `<time datetime>` outputs `Wed Jul 08 2026 18:00:00 GMT+0800` instead of ISO. `render.js` must explicitly call `String(data.date)`.
10. **Tokens color change does not update `public/assets/style.css`** — must regenerate the `:root` CSS variable block from tokens.
11. **dev server `/post/` path triggers EISDIR** — the trailing `/` of `urlPath` must append `index.html`.

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

## Design System Delegation (Mandatory)

This skill does not invent CSS templates or design tokens. All design decisions are delegated to the `frontend-design` skill.

`frontend-design` (Anthropic official cross-brand design spec) is the **sole** design source for `xiaoyi-ssg`. Any other source such as `popular-web-designs/*`, `claude-design`, or `self-extracted` is not accepted (unless `--allow-self-extracted` is explicitly passed).

Implementation flow:

1. Load `frontend-design` and extract tokens (color, typography, spacing, radius, motion).
2. Use `prompts/design-system-extraction.md` to normalize them into `.xiaoyi-ssg-design-tokens.json`.
3. The `source_skill` field is uniformly `"frontend-design"`.
4. Map tokens to `:root` CSS variables at render time; do not re-parse JSON at runtime.
5. CSS font stacks, colors, radii, and motion must trace back to `frontend-design`; the AI must not redesign.
