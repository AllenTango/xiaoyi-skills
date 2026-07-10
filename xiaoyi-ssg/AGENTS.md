# AGENTS.md — xiaoyi-ssg Development Guide

> 当前版本：v1.0.0  
> 最后更新：2026-07-10  
> 当前主干：v1 开发态（sources + views 模型）

本文件用于开发/维护 `xiaoyi-ssg` skill（位于 `<SKILL_DIR>`）时的 AI 协作约定。**它不是生成站点的指导**（生成站点的指导在生成的渲染管线中）。

---

## Hard Constraints (Mandatory for Any AI Modifying This Skill)

以下四条为强约束，违反任意一条即为不合格提交。

### 1. Version Consistency (User Authority Over Version Bumps)

- Stable version is **v1.0.0**. The user has exclusive authority over version bumps.
- **The AI must NOT automatically bump `version` under any circumstance.** This includes:
  - During testing (no temporary bumps even with "I will restore it later" intent)
  - After a large refactor
  - When the AI feels the change is "big enough to deserve a major version"
  - When aligning with the user's "should be a major version" hint in casual conversation
- **The AI's role on version questions is advisory only**: it may surface "this change might warrant a version bump" as a suggestion, then wait for the user's explicit instruction.
- If the user explicitly requests a version bump (e.g., "bump to v1.1.0", "release a major version"), follow this flow:
  1. Append a changelog entry to STATUS.md (date, reason, impact scope).
  2. Update SKILL.md frontmatter, AGENTS.md "Current Version" header, and any other version cross-references in lockstep.
  3. Run the full test suite and confirm it still passes.
  4. State the version change explicitly in the `git commit` message.
- After tests pass on a non-version change, **the `version` field must remain unchanged** (no spontaneous bumps, no "while I'm here" bumps).
- Any AI-initiated version change is a violation, regardless of intent.

### 2. Documentation Language

- Documents in this skill are split into two classes; apply language by class, not by file.
- **Class A — xiaoyi-ssg interaction dependencies** (AI loads these when the skill is invoked; token-sensitive):
  - `SKILL.md`, `AGENTS.md`, `prompts/*.md`, `templates/conventions.md`, `schemas/*.json`, `agents/openai.yaml`
  - Default: **English** to save tokens.
  - **Sole exceptions** (Simplified Chinese only):
    - `SKILL.md` frontmatter `description` field (the skill summary that AI sees when loading)
    - `AGENTS.md` introductory header (top-of-file blockquote + 1-line statement: version / last_updated / current-branch + scope clarification)
- **Class B — Non-interaction dependencies** (human / project management use; not token-sensitive):
  - `STATUS.md` and any future project-management document
  - Default: **Simplified Chinese**.
- Technical terms, command names, code identifiers, file paths, JSON keys remain in English.
- No Cantonese (`嘅`, `係`, `唔`, `冇`, `啲`, `咗`, `裝咗`, etc.). No mixed language drift.
- No colloquial expressions (`搞`, `整`, `弄`, `搞定`, `差不多`, `跑起来`).
- Punctuation: English content uses half-width; the Chinese exceptions (Class A preamble + Class B docs) use full-width.
- One file, one language. No half-English half-Chinese within a single paragraph.

### 2a. AI Reply Language (separate rule)

The above rule controls **files written by the AI**. A separate rule governs
**how the AI speaks to the user in chat**:

- The AI MUST reply in the same language the user used in the most recent
  message. If the user switches languages mid-thread, the AI follows the new
  language immediately.
- The reply-language rule applies to conversational text only: status lines,
  explanations, questions, error messages, suggestions. It does NOT override
  the class-based documentation language rule above.
- File contents the AI writes are still governed by §2: Class A files stay in
  English, Class B files stay in Simplified Chinese, generated user-site
  content follows `config.site.language`.
- If the user's language is ambiguous, default to Simplified Chinese for
  users in the CN locale and English otherwise; ask only when the ambiguity
  materially affects the answer.

### 3. Client Compatibility

- This skill does **not** emphasize client-agnostic. SKILL.md and AGENTS.md do not expand a 5+ client adapter matrix.
- Compatibility is given as a brief capability assumption only ("assume the client can load skills, run shell, read/write files"), without listing Hermes / Claude Code / Codex CLI / Cursor / Aider one by one.
- When a specific client command must be mentioned, use generic abstractions like `skill_view` / `Read` / `Write`. Put any client-specific detail in a single `prompts/` sub-file, never in the main SKILL.md / AGENTS.md.

### 4. Reference File Discipline

- Files listed in SKILL.md "Required Reading" are mandatory. Do not delete a required-reading file before confirming no downstream reference exists.
- Orphan references are forbidden. If a file is merged into another, delete the source after merging.
- Before deleting any file, `grep` the entire skill directory to confirm no other file references it.

### 5. GEO (Generative Engine Optimization) Source Discipline

- **The user's existing content is the GEO source.** `source/_<type>/*.md` files are what `render.js` aggregates into `/llms.txt`, `/llms-full.txt`, the per-page markdown mirror, and JSON-LD.
- **The AI must NOT invent a separate `_geo/` directory or require the user to author GEO-specific files.** Doing so contradicts the design — GEO is an output aggregator over the user's existing content, not a new authoring flow.
- **GEO features default to ON.** llms.txt, robots.txt with the standard AI bot list, JSON-LD, per-page markdown mirror, and semantic meta enrichment are built into every generated `render.js`. The user can disable via `config.geo.*`, but defaults are on.
- **`llms-full.txt` is opt-in** via `config.geo.llms_full: true`. Default off. Do not enable it by default in any sample, test, or generated pipeline.
- **The standard AI bot list is fixed** (15 bots listed in `prompts/geo-conventions.md` § `generateRobotsTxt`). Do not add bots the user did not request, do not remove bots unless the user explicitly says so.
- **`source/_<type>/*.md` frontmatter may need GEO extensions** (`summary`, `topics`, `audience`, `citation_key`, `content_type`, `updated`, `noai`) — but these are optional. When absent, `render.js` must auto-derive (`summary` from first paragraph) rather than emit empty values.
- **`source/_<type>/*.md` content itself is read directly for the markdown mirror**, not the rendered `body_html`. The mirror writes the raw markdown body with frontmatter stripped.

### 6. v1 Source + View Model & Build-time Security

The v1 engine is described in detail in `SKILL.md` § v1 Source + View Model and `prompts/data-sources.md` / `prompts/render-node-spec.md`. The following are mandatory invariants for any modification of this skill.

- **Current manifest only.** The v1 development branch uses the `sources + views` form. Older collection-style drafts must be migrated deliberately; do not add a silent compatibility shim that hides schema drift.
- **Open data layer.** A site is data + pages. New data origins are added by writing one Source Adapter under `.xiaoyi-ssg/sources/<type>.js` and registering the `type` in `schemas/source.schema.json`. The engine main loop is not modified. Do not encode site shapes ("blog mode", "shop mode") into the engine; describe them as manifest combinations.
- **Source-type agnostic engine.** `loadSources` dispatches on `source.type`. `expandViews` is driven by `for.each` / `for.paginate` / `use` / single-page — no source name is hardcoded. The engine throws on unknown source `type` (naming the missing adapter file) and on unknown `for.*` source reference. Do not add silent fallbacks to markdown for unknown types.
- **Build-time fetch only.** The browser never talks to an authed API. All fetches happen in `render.js`. Adapters use Node 18 built-in `fetch` with `AbortSignal.timeout`. No CDN-only deps for fetches.
- **Secrets come from `process.env` only.** The manifest stores only the env var **name** (`source.auth.env`); the value never appears in `public/`, `assets/data/`, the snapshot cache (`.xiaoyi-ssg/.cache/sources/`), `pipeline-manifest.json`, logs, or error messages. The `assertNoSecretsInOutput` self-test runs after every build and exits non-zero on any leak. Snapshot writers must scrub values equal to known resolved secrets before writing.
- **Snapshot cache is `.gitignore`-d.** `.xiaoyi-ssg/.cache/` MUST be in the generated project's `.gitignore`. Snapshot JSON files may contain large or sensitive source payloads; they are a build artifact, not source.
- **Dev does not hammer APIs.** `dev.js` must respect each remote source's `cache.ttl` and not re-fetch on every keystroke. To force a re-fetch in dev, the user runs `npm run build:fresh` (which calls `render.js --fresh`); this is the only path that ignores snapshots within TTL.
- **`fallback` is mandatory and deliberate.** Every remote source must declare a `fallback` (`cache` / `empty` / `fail`); default in code is `cache` for resilience, but the AI is expected to ask the user and pick `fail` for load-bearing sources.

---

## Path Conventions

- **`<SKILL_DIR>`**: absolute path of this skill's own directory; varies by install location. Use this placeholder throughout this document for any reference to the skill's own files.
- **`<SITE_ROOT>`**: the site root the user is currently operating on. **Not inside `<SKILL_DIR>`**. The AI locates it per session by walking up from the current working directory. The first directory containing a recognized site marker becomes `<SITE_ROOT>`. If none is found, the cwd itself is the candidate root (init may still proceed).
- **Site-root markers** (a project of *any* site or static-export kind matches here — the list is intentionally not enumerated by generator name):
  1. `config.yml` + sibling `.xiaoyi-ssg/` → existing xiaoyi-ssg project.
  2. Any other YAML/JSON/TOML file at the root whose filename or top-level keys indicate it is a site configuration (`hugo.toml`, `_config.yml`, `pelicanconf.py`, `eleventy.config.js`, `astro.config.*`, etc.). Detection rule: a recognized root-level config file in a well-known convention (leading underscore, known generator name, or a top-level key such as `baseURL` / `title` / `params` / `output: export` / `site`).
  3. `package.json` with a known site tool or static-export dependency (`hexo`, `@11ty/eleventy`, `astro`, `next` with `output: "export"`, `gatsby`, `vuepress`, etc.).
  4. `index.html` / `index.htm` at the root plus one of: a `public/`, `dist/`, `_site/`, `output/` directory containing generated HTML, OR a sibling content directory such as `content/`, `posts/`, `pages/`, `src/`.
- **Hard principle**: the marker rules are *examples*, not an exhaustive allow-list. If the AI sees an unknown but obvious site configuration file at the root of a directory the user pointed at, treat that directory as `<SITE_ROOT>` and proceed. If the AI is unsure whether a directory is actually a site project, ask the user before assuming.
- **`<PIPELINE_DIR>`**: `<SITE_ROOT>/.xiaoyi-ssg/` — the generated rendering pipeline directory.

---

## Required Dependencies

`xiaoyi-ssg` must be used together with the `frontend-design` skill. Both are mandatory.

| Dependency | Required | Source | Purpose |
|------------|----------|--------|---------|
| `frontend-design` | Yes | https://github.com/anthropics/skills/tree/main/skills/frontend-design | All design tokens (color, typography, spacing, motion) and component CSS patterns. AI is forbidden from inventing visual systems. |
| `npx skills` (CLI) | Yes | npm | For installing skills. Bundled with the Node.js runtime. |
| Node.js 18+ | Yes | nodejs.org | Runtime for `render.js` / `dev.js`. |

**Pre-flight flow** (must run before the AI orchestration logic below):

1. Call `skill_view(name="frontend-design")` to load the skill.
2. Failure: show the user the install command and pause; wait for explicit confirmation.
3. Success: continue with the AI orchestration logic below.

**Hard override (`--allow-self-extracted`)**

The pre-flight is mandatory by default. The sole escape hatch is the explicit user flag `--allow-self-extracted`, which authorizes the AI to derive design tokens without a loaded design source. When this flag is set:

- `source_skill` in `.xiaoyi-ssg-design-tokens.json` MUST be set to `"self-extracted"`.
- `pipeline-manifest.json` MUST record the override as `allowed_self_extracted: true` together with the ISO8601 timestamp at which the user passed the flag.
- The AI MUST still explain to the user (before any token derivation) what the override means — namely, that the design will not trace back to a curated design source and that the user is taking on responsibility for the resulting visual coherence.

No other values (e.g., `popular-web-designs/*`, `claude-design`) are accepted for `source_skill` regardless of the override flag.

See [`SKILL.md` § Required Dependencies](./SKILL.md).

---

## Core Conventions

1. **Single entry point**: `/xiaoyi-ssg` is the only slash command. The AI infers user intent from dialogue and dispatches to the matching action.
2. **Generation over parsing**: there are no fixed templates. On init, theme change, or content type change, the AI generates the full rendering pipeline and writes it into `<PIPELINE_DIR>`.
3. **Pipeline is self-running**: subsequent builds are run by the user directly with `node <PIPELINE_DIR>/render.js`, **without AI involvement**, to guarantee determinism, reproducibility, and CI/CD compatibility.
4. **Design system persistence**: `<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json` records the full design tokens and `source_skill` provenance. The pipeline inlines them into templates and CSS at generation time; no runtime JSON parsing.
5. **Skill is stateless**: do not write `<SKILL_DIR>/state.json`. Site location relies on "walking up from cwd to find `config.yml`".
6. **Design source delegation**: all design tokens come from the `frontend-design` skill (mandatory). User dialogue, reference URLs, and screenshots are used to select or adjust a specific brand subset within `frontend-design`; this skill does not maintain a hardcoded theme library.
7. **Node.js first**: installing this skill requires `npx skills add` (depends on Node.js). The user environment is assumed to have Node.js, so the rendering pipeline is Node.js-based.
8. **Interaction is not decoration**: when a site needs search, filtering, theme switching, lightbox, form validation, players, charts, maps, etc., the pipeline must generate static-host-compatible browser JS, data files, and fallbacks. Do not strip necessary interactions to keep things "purely static".
9. **Protect `source/` content**: `source/` is user content. Outside `INIT` / `NEW_CONTENT` / `CONTENT_EDIT` / `DEFINE_CONTENT_TYPE` (where the manifest explicitly permits new directories or specific file edits), `REGENERATE_PIPELINE` / `STYLE` / `INTERACTION` / `BUILD` / `DEV` / `PREVIEW` / `DIAGNOSE` must not overwrite, delete, reformat, or bulk rewrite `source/**/*.md` or `source/_media/**`.

---

## File Responsibilities

| File | Responsibility | Modification trigger |
|------|----------------|----------------------|
| `SKILL.md` | Skill definition, frontmatter, workflow, interaction contract, v1 engine summary, security hard rules | Interaction flow / capability / model change |
| `AGENTS.md` | This file: AI collaboration conventions for development (v1 invariants, orchestration logic) | Development convention / model / orchestration change |
| `prompts/pipeline-generation.md` | Guide AI in generating the full rendering pipeline (sources/ dir, security self-test) | Pipeline structure / template strategy / CSS strategy change |
| `prompts/data-sources.md` | v1 Source Adapter contract: kinds (markdown / http / json / csv / rss / inline / derived), security, cache, fallback | New adapter kind / security rule / cache strategy change |
| `prompts/content-type-definition.md` | Guide AI in defining markdown front-matter schemas with the user | Markdown content type flow / field types change |
| `prompts/design-system-extraction.md` | Guide AI in normalizing `frontend-design` content into xiaoyi tokens | Token schema / normalization strategy change |
| `prompts/render-node-spec.md` | v1 engine spec: `loadSources` + `expandViews`, hash cache, port auto-increment | Renderer structure / algorithm change |
| `prompts/template-manifest-generation.md` | Guide AI in generating `template-manifest.json` v1 (sources + views) | Manifest structure / pattern examples change |
| `templates/conventions.md` | Eta template syntax, variable binding, custom fields mandatory rules | Template engine constraint change |
| `schemas/design-tokens.json` | design-tokens JSON Schema (for validation) | Token field add/remove |
| `schemas/config.schema.json` | config.yml validation schema | Site config field add/remove |
| `schemas/template-manifest.json` | current manifest JSON Schema (sources + views) | Manifest structure change |
| `schemas/source.schema.json` | Source Adapter definition JSON Schema | New adapter kind / source field change |

> Note: `references/frontend-design-integration.md` was merged into `SKILL.md` § Design System Delegation and then deleted.

---

## AI Orchestration Logic (Core)

### Entry: `/xiaoyi-ssg`

When the user types `/xiaoyi-ssg` or `/xiaoyi-ssg <initial-intent>`, the AI executes:

```
1. Pre-flight: load frontend-design (see above).
2. Locate site root:
   - Walk up from cwd and look for any recognized site-root marker
     (see "Site-root markers" near the top of this file).
   - Match found → <SITE_ROOT> = that directory; record which marker
     matched and whether it is xiaoyi-ssg or another site/static-export project.
   - No match → cwd is the candidate root; continue to step 3 with
     intent routing; do NOT yet write any files.
3. Read context (if site exists):
   - For xiaoyi-ssg sites: config.yml + .xiaoyi-ssg-design-tokens.json +
     .xiaoyi-ssg/content-types.json + source/**/*.md list +
     .xiaoyi-ssg/pipeline-manifest.json.
   - For other site/static-export projects: read the source tool's own config file
     (hugo.toml, _config.yml, astro.config.*, etc.) and the existing
     content tree, but DO NOT modify them. Use them only to inform the
     user-facing takeover banner.
   - For unknown / no-site directories: ask the user before assuming
     <SITE_ROOT>.
4. Recognize intent (user input + context):
   - INIT_PIPELINE: no marker matched, or user explicitly says "new site/project"
   - TAKE_OVER_EXISTING: site marker matched; route to Sub-flow A
     (xiaoyi-ssg), Sub-flow B (other site/static-export migration), or Sub-flow
     C (unknown / not a site project) per the takeover spec
   - RUN_BUILD: "build/generate/publish/preview" with pipeline present
   - RUN_DEV: "dev/realtime/watch" with pipeline present
   - REGENERATE_PIPELINE: "switch style/adjust layout/change color/theme/add content type/add data source/change data source"
   - DEFINE_CONTENT_TYPE: "add a markdown XX type/new content type" (front-matter schema)
   - ADD_DATA_SOURCE: "pull from this API / aggregate this RSS / group by tag / fetch this JSON / fetch this CSV" (v1 source kinds)
   - ANALYZE_REFERENCE: "reference this site/like xxx.com"
   - CONTENT_EDIT: "change title/add tag/change date/edit body" → locate file and edit
   - PREVIEW: "preview/show effect/local server"
   - DIAGNOSE: "check/diagnose/what is wrong"
   - HELP: "how to use/help/what commands"
5. Execute the matching action (see "Action Implementations" below); ask for clarification when needed.
6. Return result + next-step suggestions.
```

### Intent Recognition Rules

| Example user phrasing | Recognized intent | Required context |
|-----------------------|--------------------|------------------|
| "create a portfolio site" / "init a portfolio" | INIT_PIPELINE | None / current dir |
| "build a site like https://example.com" | INIT_PIPELINE + ANALYZE_REFERENCE | URL |
| "build/generate the site" / "build" | RUN_BUILD | Pipeline must exist |
| "dev mode" / "realtime preview" / "watch" / "dev" | RUN_DEV | Pipeline must exist |
| "switch to a cleaner style" / "darken the theme" | REGENERATE_PIPELINE | Current tokens + pipeline-manifest |
| "add a 'project' type with cover, tech stack, links" | DEFINE_CONTENT_TYPE | Current content-types + current manifest markdown source |
| "pull products from https://api.shop.example.com, with token PRODUCTS_API_TOKEN" | ADD_DATA_SOURCE (http) | URL, auth.env, JSONPath select, field map, fallback |
| "aggregate posts by tag into /tag/{slug}/ pages" | ADD_DATA_SOURCE (derived groupBy) + REGENERATE_PIPELINE | Current markdown source; which field to group by |
| "import https://example.com/changelog.json as a news page" | ADD_DATA_SOURCE (json or http) | URL or file path, JSONPath select |
| "fetch my GitHub repos into a projects page" | ADD_DATA_SOURCE (http) | URL, optional auth.env, field map |
| "change this article's title to..." | CONTENT_EDIT | Need to locate file |
| "preview it" | PREVIEW | After build or directly via dev |
| "check if there is any problem" | DIAGNOSE | Scan logic |
| "switch to a darker theme", "add a project type", "regenerate", or any phrasing on a directory that already has a recognized site marker | TAKE_OVER_EXISTING (Sub-flow A if xiaoyi-ssg, Sub-flow B if another site/static-export project) | Site marker must be detected first |

**Ambiguity handling**: if intent is unclear, the AI proactively asks (e.g., "Do you want to adjust the visual style, or add a new content type?").

---

### Action Implementations

#### INIT_PIPELINE (Initialize the Rendering Pipeline)

```
1. Pre-flight loads frontend-design (already done above).
2. Discover requirements through dialogue:
   - "What kind of site do you want? Any reference links / screenshots / text description?"
   - User provides: reference URL, or text description (e.g., "minimalist tech blog", "portfolio", "documentation site", "API-backed shop")
3. Reference site analysis (if a URL is given):
   - WebFetch the page HTML
   - Per prompts/reference-analysis.md extract: color, typography, spacing, layout, components, interactions
   - Output structured design intent: design-intent.json
4. Clarify the data model (v1: data ORIGIN first, not content type):
   - "Where does the data live? Local markdown files? An API? A JSON/CSV file? An RSS feed? Or derived from another source?"
   - For EACH data origin, ask which fields are needed and how they map to the standard item shape.
   - For local markdown sources, per prompts/content-type-definition.md generate content-types.json (front-matter schema only; render.js does not read this for rendering, only for AI authoring guidance).
   - For API sources, ask: which env var holds the secret (record name only in auth.env)? What JSONPath selects the array? What `map` renames fields? What's the `fallback` policy?
5. Determine site structure:
   - Which sources get per-item pages (for.each), which get lists (for.paginate), which aggregate on the home (use).
   - Nav order, homepage layout, list / detail page structure.
   - Generate config.yml (site basics, pages order, geo block, dev block).
6. Generate the design system:
   - Read prompts/design-system-extraction.md
   - Extract tokens from frontend-design, normalize into .xiaoyi-ssg-design-tokens.json
   - Required fields: source_skill (="frontend-design"), color, typography, layout, component, motion, seed
7. Generate the rendering pipeline:
   - Read prompts/pipeline-generation.md, prompts/render-node-spec.md, prompts/data-sources.md
   - Inputs: tokens + content-types + config + sources/views manifest + interactions
   - Generate all <PIPELINE_DIR>/ files in one pass, including the .xiaoyi-ssg/sources/ adapter directory and the current manifest
8. Persist files:
   - config.yml
   - .xiaoyi-ssg-design-tokens.json
   - .xiaoyi-ssg/content-types.json (markdown front-matter schema; only present when the site uses markdown sources)
   - .xiaoyi-ssg/template-manifest.json (v1: sources + views)
   - source/ directory structure (create missing _<type>/ per markdown sources; create source/_media/; do not overwrite existing files)
   - <PIPELINE_DIR>/ (render.js, dev.js, package.json, sources/, templates/, assets/, config.schema.json, pipeline-manifest.json)
   - .gitignore (ignore public/, .DS_Store, *.log, .xiaoyi-ssg-cache.json, .xiaoyi-ssg/node_modules/, .xiaoyi-ssg/.cache/)
   - **README.md at <SITE_ROOT>**: brief, in the inferred site language, explaining directory layout, how to add content, how to run build / dev, and which env vars to set for API sources.
   - **One demo `*.md` per markdown content type** in each `source/_<type>/` directory (only if empty) so the site has at least one renderable item per type. Each demo file MUST include a valid frontmatter matching the content-type schema and at least three short paragraphs of body content.
9. Install dependencies and first build:
   - Run `npm install` in <PIPELINE_DIR>/
   - Run first build: `cd .xiaoyi-ssg && npm run build`
   - Output success message
10. Suggest next steps:
    - Realtime dev: `cd .xiaoyi-ssg && npm run dev`
    - Add content: `/xiaoyi-ssg` → "add a new article..."
    - Force re-fetch remote sources: `cd .xiaoyi-ssg && npm run build:fresh`
    - Deploy: `cd .xiaoyi-ssg && npm run build` → deploy public/
```

#### RUN_BUILD (Run the Rendering Pipeline)

```
Prerequisite: <PIPELINE_DIR>/render.js must exist

Run: node .xiaoyi-ssg/render.js [--fresh]

Render script logic (Node.js ESM, see prompts/render-node-spec.md for details):
1. Read config.yml + .xiaoyi-ssg-design-tokens.json + content-types.json + template-manifest.json (current v1)
2. loadSources(): dispatch to Source Adapters (markdown / http / json / csv / rss / inline / derived) in topological order. Output: datasets.
3. Read .xiaoyi-ssg-cache.json (build cache) and .xiaoyi-ssg/.cache/sources/*.json (source snapshots)
4. expandViews(): expand views (for.each / for.paginate / use / single) into concrete render tasks. Source-type agnostic.
5. For each output path, compute input hash: source items (or source file for markdown) + template files used + tokens + config key fields + interactions manifest + assets
6. Incremental decision: hash unchanged and not --fresh → reuse public/ existing file; otherwise re-render
7. Generate interaction data: search index, filter facets, gallery/chart data as static JSON or data attributes (data flows from any source via datasets, not just markdown)
8. Render: templates must support HTML escaping, raw HTML, conditionals, loops, safe attribute output, and data-* interaction hooks
9. Write public/<path>/index.html
10. Copy assets/ → public/assets/
11. Generate feeds (RSS/JSON), sitemap.xml, 404.html, GEO outputs
12. assertNoSecretsInOutput(): grep public/ for resolved auth.env values; fail non-zero on any leak
13. Update .xiaoyi-ssg-cache.json
14. Print summary: file count, enabled interactions, duration, cache hit rate, warnings (including any remote fetch that fell back)
```

#### RUN_DEV (Realtime Dev Mode)

```
Prerequisite: <PIPELINE_DIR>/dev.js must exist

Run: node .xiaoyi-ssg/dev.js [--port 3000]

Dev server logic (see prompts/render-node-spec.md):
1. Start an HTTP server (default port 3000, auto-increment on conflict) serving public/
2. Start chokidar watching:
   - source/**/*.md (markdown content change)
   - .xiaoyi-ssg/templates/** (template change)
   - .xiaoyi-ssg/assets/** (asset change)
   - .xiaoyi-ssg/sources/** (adapter change)
   - .xiaoyi-ssg/template-manifest.json (manifest change)
   - .xiaoyi-ssg/content-types.json (front-matter schema change)
   - .xiaoyi-ssg/interactions.manifest.json (interaction change)
   - .xiaoyi-ssg-design-tokens.json (design change)
   - config.yml (config change)
   - source/_media/** (media change)
3. On change:
   a. Run incremental build (reusing render.js logic). Remote sources are NOT re-fetched on every keystroke; each source's snapshot + cache.ttl is respected. To force a re-fetch, the user runs npm run build:fresh.
   b. Push a reload event through SSE
4. HTTP response interception: inject an SSE client script before HTML </body>
5. Console output: changed file, rebuilt pages, duration, access URL

User workflow:
- Start the dev server in a terminal
- AI adds/edits content → dev server detects → incremental build → browser auto-refresh
- User edits md directly → same flow
```

#### REGENERATE_PIPELINE (Regenerate the Rendering Pipeline)

```
Trigger: theme/layout/color adjustment, content type add/remove/edit

1. Read current:
   - .xiaoyi-ssg-design-tokens.json
   - .xiaoyi-ssg/content-types.json
   - .xiaoyi-ssg/pipeline-manifest.json
   - config.yml
2. Clarify the adjustment direction in dialogue:
   a. Fine-tune tokens: read current tokens → interactively modify specific fields → write back
   b. Re-analyze reference: user provides new URL/description → re-analyze → generate new tokens
   c. Structural layout change: modify layout tokens (container/grid/sidebar/header/footer)
   d. Content type change: invoke DEFINE_CONTENT_TYPE logic to add/remove/edit content-types.json
3. After any change: re-execute INIT_PIPELINE step 7 (generate rendering pipeline) to overwrite <PIPELINE_DIR>/
   - Preserve user-added dependencies in package.json (if any)
   - pipeline-manifest.json records: generation time, theme reference source, tokens hash, content-types hash
   - If package.json changes, re-run npm install
   - Do not modify source/**/*.md or source/_media/**
   - Only when a content type is added and its directory does not exist, allow creating an empty source/_<type>/
4. Prompt the user to run `npm run build:fresh` or `npm run dev` inside <SITE_ROOT>/.xiaoyi-ssg/ to see the effect
```

#### DEFINE_CONTENT_TYPE (Define/Modify a Content Type)

```
1. Ask for the type name (kebab-case, e.g., project, talk, essay)
2. Ask for field definitions (per prompts/content-type-definition.md):
   - Required: title, date, etc.
   - Optional: tags[], categories[], cover, excerpt
   - Media: images[], video_url+embed_type, audio_url
   - Relationship: related[], series
   - Custom: any key-value
3. Generate / update content-types.json (with JSON Schema-compatible field definitions)
4. Create source/_<type>/ directory only if it does not already exist; do not modify existing content
5. Trigger REGENERATE_PIPELINE: add the matching markdown `source` entry to template-manifest.json and the corresponding `view` entries; regenerate templates.
```

#### ADD_DATA_SOURCE (Add/Modify a Data Source)

This is the v1 intent for API-backed apps, RSS aggregation, JSON/CSV data, or computed (derived) sources. It is parallel to DEFINE_CONTENT_TYPE and covers the long-tail that earlier collection-style drafts could not express cleanly.

```
1. Confirm the source kind: http / json / csv / rss / inline / derived. If none fit, propose writing a new Source Adapter under .xiaoyi-ssg/sources/<type>.js + registering the type in schemas/source.schema.json; this is a normal extension path.
2. Ask for the source-level fields (per prompts/data-sources.md and schemas/source.schema.json):
   - http: url, method, headers, auth (env var NAME only — never a value), select (JSONPath-lite), map, defaults, cache.ttl, fallback, timeout
   - json/csv: file or url, select, map, defaults, cache, fallback, timeout
   - rss: url, map, cache, fallback, timeout
   - inline: items
   - derived: from (source name), op (groupBy / filter / map / flatten / unique / count), field, where
3. Ask which views consume it:
   - per-item pages (for.each) — what URL pattern and which template?
   - paginated list (for.paginate) — perPage and URL pattern?
   - aggregated on the home (use: [...]) — alongside which other sources?
   - taxonomy pages over a derived groupBy source — for.each with output like `/tag/{field}/`
4. If auth.env is set: confirm the user knows which env var to set in their build environment. NEVER write the value into the manifest, README, or pipeline-manifest.json; record only the name.
5. Update current template-manifest.json: add the source entry and the matching view entries. Do NOT introduce a legacy collection-style entry; the current v1 model is sources + views.
6. Trigger REGENERATE_PIPELINE: regenerate render.js (or confirm the existing engine already supports the adapter), templates, interaction data, and CSS if needed.
7. After the user runs npm run build:fresh, run the mandatory self-test including assertNoSecretsInOutput.
```

#### CONTENT_EDIT (Edit Content)

```
1. Parse or ask for location: type + title/date/tag → locate source/_<type>/<slug>.md
2. Ask for the change: title, date, tags, categories, cover, body, custom fields
3. Update front-matter and/or body
4. Hint: if dev server is running → auto refresh; otherwise run build for incremental update
```

#### PREVIEW (Preview)

```
1. If public/ does not exist or content has changed → prompt to build first
2. Suggest:
   - Realtime dev: node .xiaoyi-ssg/dev.js (watch + live reload)
   - Or open public/index.html directly
```

#### DIAGNOSE (Diagnose)

```
Run an in-memory scan (no external script):
- config.yml existence, YAML parse, required fields (validate per config.schema.json)
- .xiaoyi-ssg-design-tokens.json existence, schema validation
- .xiaoyi-ssg/content-types.json existence, schema validation
- <PIPELINE_DIR>/render.js existence
- <PIPELINE_DIR>/package.json existence, node_modules/ installed
- Whether the directories defined in content-types exist
- Whether content file front-matter matches the corresponding content-type definition
- Slug uniqueness (within the same type)
- Local media file existence
Output: human-readable list + problem severity (error/warning)
```

#### ANALYZE_REFERENCE (Analyze a Reference Site)

```
Input: URL provided by the user
1. WebFetch the HTML (and CSS/JS as needed)
2. Per prompts/reference-analysis.md extract:
   - Color: primary, background, text, accent, border, semantic
   - Typography: heading / body / monospace stacks, scale
   - Spacing: container width, rhythm, gap, radius
   - Layout: column count, sidebar, header/footer style, hero
   - Components: card, nav, button, form, pagination, and optional breadcrumb styles if the reference uses them
   - Motion: entrance, hover, focus, page transition tendency
3. Output design-intent.json for downstream design system generation
```

#### TAKE_OVER_EXISTING (Take Over or Migrate an Existing Static Site)

```
Trigger: walking up from cwd finds a directory with any recognized site
marker (see "Site-root markers" above). The user requests a /xiaoyi-ssg
action. The AI MUST recognize the existing project and route to the
matching sub-flow below — never silently create a sibling project, never
overwrite the user's existing files.

Sub-flow A — xiaoyi-ssg → xiaoyi-ssg (already our pipeline):

1. Use <SITE_ROOT> = the directory containing config.yml + .xiaoyi-ssg/.
2. Read pipeline-manifest.json under .xiaoyi-ssg/ to recover last
   generation metadata (tokens hash, content-types hash, generation time,
   renderer version, source_skill).
3. Read all existing files the user owns:
   - config.yml
   - .xiaoyi-ssg-design-tokens.json
   - .xiaoyi-ssg/content-types.json
   - .xiaoyi-ssg/template-manifest.json
   - All source/_<type>/*.md (grouped by collection)
4. Decide action by user phrasing:
   - Style/theme change → update .xiaoyi-ssg-design-tokens.json (preserve
     custom fields the user added), then REGENERATE_PIPELINE.
   - Content type add → DEFINE_CONTENT_TYPE then REGENERATE_PIPELINE.
   - Content edit → CONTENT_EDIT (do NOT regenerate the pipeline).
   - Build / dev / preview → RUN_BUILD / RUN_DEV / PREVIEW without
     touching any pipeline source file.
5. NEVER overwrite existing user content. NEVER recreate source/_<type>/
   that already exists. NEVER bump version unless the user asks.

Sub-flow B — other site/static-export project → xiaoyi-ssg (migration):

Trigger: site-root marker matched but the directory is NOT a xiaoyi-ssg
project (no config.yml + .xiaoyi-ssg/ pair). Examples include Hugo,
Jekyll, Hexo, Eleventy, Astro, Next.js static export, plain static HTML,
or any unfamiliar site/static-export project the AI recognizes.

Hard rules (these override convenience):

a. The user's existing files are SACRED. The AI MUST NOT modify, delete,
   reformat, or move any file the existing site relies on. Specifically:
   - Do NOT touch the existing generator's config file (hugo.toml,
     _config.yml, astro.config.*, etc.).
   - Do NOT touch the existing generator's content tree (content/,
     _posts/, src/content/, app/, etc.).
   - Do NOT touch the existing build output (public/, dist/, _site/,
     out/, build/) until the user has confirmed migration is complete
     and the old build can be replaced.
b. xiaoyi-ssg artifacts are written to a NEW sibling location to keep
   both worlds operational during migration:
   - xiaoyi-ssg config: <SITE_ROOT>/config.yml (only if absent)
   - xiaoyi-ssg tokens: <SITE_ROOT>/.xiaoyi-ssg-design-tokens.json
   - xiaoyi-ssg pipeline: <SITE_ROOT>/.xiaoyi-ssg/
   - xiaoyi-ssg content: <SITE_ROOT>/source/_<type>/ (new tree, parallel
     to the existing content tree, NOT replacing it)
   - xiaoyi-ssg build output: <SITE_ROOT>/.xiaoyi-ssg-build/ by default
     (NOT public/, so it does not collide with Hugo's / Jekyll's public
     / Jekyll's _site, etc.). The user can later point their CDN at
     this directory and delete the old generator's output.
c. If <SITE_ROOT>/config.yml already exists from a prior xiaoyi-ssg run
   that was abandoned, ask the user whether to overwrite, merge, or
   keep the old file before writing a new one.
d. If the user explicitly says "migrate all my old posts to source/_posts",
   the AI copies the content files into source/_<type>/ with frontmatter
   converted to xiaoyi-ssg's schema. The originals are left in place.
   If the user does NOT explicitly ask for content migration, the AI
   only generates the pipeline scaffolding and waits.

Flow:

1. Detect the existing generator by reading its config file (e.g.,
   hugo.toml's `baseURL`/`title` keys, _config.yml's `name`/`plugins`
   keys, package.json's dependencies) — but DO NOT add generator-
   specific parsers to the xiaoyi-ssg skill. Content migration is a
   per-call ad-hoc conversion the AI performs in dialogue, not a
   feature the skill ships with.
2. Print a takeover banner explaining:
   - which generator was detected
   - which files xiaoyi-ssg will create (config.yml, .xiaoyi-ssg/,
     .xiaoyi-ssg-build/, source/) and which it will NOT touch
   - that the old build is left in place until the user confirms
3. Ask the user to confirm migration scope:
   - Just the pipeline scaffolding (no content)
   - Migrate content from <old-generator-content-tree> to
     source/_<type>/ (one-time copy, originals untouched)
   - Full migration including deleting the old build (only after
     user has verified .xiaoyi-ssg-build/ works)
4. Proceed with the chosen scope. The "REGENERATE_PIPELINE" step still
   runs so .xiaoyi-ssg/ matches the rest of the skill, but it MUST
   respect rule (a) above.

Sub-flow C — unknown / not a site project:

If the AI walks up and the candidate root does not satisfy any site
marker, the AI MUST ask the user before treating cwd as <SITE_ROOT>.
Possible reasons the directory may not be a site at all: it is the
user's home directory, a docs folder for a single component, a random
project. The user should explicitly say "this is the site" before the
AI writes any xiaoyi-ssg files.

In all sub-flows:

- NEVER bump version unless the user asks.
- ALWAYS print a banner so the user sees the takeover decision.
- ALWAYS honour the user's existing files — read-only on their side.
```

---

## Content Type Definition Spec

**File**: `<SITE_ROOT>/.xiaoyi-ssg/content-types.json`

```json
{
  "version": 1,
  "types": {
    "post": {
      "label": "Article",
      "dir": "source/_posts",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "datetime", "required": true },
        "tags": { "type": "string[]", "required": false },
        "categories": { "type": "string[]", "required": false },
        "cover": { "type": "string", "required": false },
        "excerpt": { "type": "string", "required": false },
        "draft": { "type": "boolean", "default": false }
      }
    },
    "project": {
      "label": "Project",
      "dir": "source/_projects",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "date", "required": true },
        "cover": { "type": "string", "required": true },
        "tech_stack": { "type": "string[]", "required": false },
        "repo_url": { "type": "url", "required": false },
        "live_url": { "type": "url", "required": false },
        "description": { "type": "string", "required": true },
        "featured": { "type": "boolean", "default": false }
      }
    }
  },
  "nav_order": ["post", "project", "about"]
}
```

**Field types**: `string`, `datetime`, `date`, `boolean`, `string[]`, `url`, `number`, `object`.

> **v1 alignment.** `content-types.json` describes the **front-matter schema** for markdown sources (authoring guidance and optional validation). It does NOT drive rendering. Page shape and pagination are declared in `template-manifest.json` v1: per-item pages via `views[].for.each`, paginated lists via `views[].for.paginate`, singleton pages via a `markdown` source that yields one item (no special flag is required — use a single-source `for.each` view or a single-page view with `use: [...]`).
> The JSON keys `types.<name>.dir` correspond to markdown `sources.<name>.dir` in `template-manifest.json`; both files are kept in sync by the pipeline-generation flow.

---

## Design System Spec

**File**: `<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json`

```json
{
  "version": 1,
  "source_skill": "frontend-design",
  "source_ref": "skill:frontend-design/SKILL.md",
  "theme_ref": "<user_specified_brand_or_default>",
  "theme_manifesto_hash": "sha256:<64 lowercase hex chars>",
  "tokens": {
    "color": {
      "background": "#ffffff",
      "backgroundDark": "#0a0a0a",
      "text": "#1a1a1a",
      "textDark": "#faf9fc",
      "accent": "#635bff",
      "accentHover": "#4f46e5",
      "muted": "#6b7280",
      "border": "#e5e7eb",
      "borderDark": "#2f3441",
      "focus": "#635bff",
      "error": "#b42318",
      "success": "#067647"
    },
    "typography": {
      "fontDisplay": "<value from frontend-design>",
      "fontBody": "<value from frontend-design>",
      "fontMono": "<value from frontend-design>",
      "scale": {
        "h1": "clamp(2rem, 4vw, 4rem) / 1.05",
        "h2": "clamp(1.5rem, 3vw, 2.5rem) / 1.15",
        "h3": "clamp(1.25rem, 2vw, 1.75rem) / 1.25",
        "body": "1rem / 1.6",
        "small": "0.875rem / 1.5",
        "micro": "0.75rem / 1.4"
      },
      "lineLength": "68ch",
      "letterSpacing": {
        "display": "0em",
        "body": "0em",
        "caps": "0.06em"
      }
    },
    "layout": {
      "containerMax": "72rem",
      "headerHeight": "auto",
      "footerHeight": "auto",
      "sidebarWidth": "none",
      "gridColumns": 3,
      "gutter": "1.5rem",
      "rhythm": "2rem",
      "radius": "8px"
    },
    "component": {
      "card": "<description from frontend-design>",
      "cardMedia": "<description from frontend-design>",
      "nav": "<description from frontend-design>",
      "button": "<description from frontend-design>",
      "form": "<description from frontend-design>",
      "blockquote": "<description from frontend-design>",
      "code": "<description from frontend-design>",
      "pre": "<description from frontend-design>",
      "media": "<description from frontend-design>",
      "pagination": "<description from frontend-design>",
      "breadcrumb": "<optional; include only when breadcrumb navigation is part of the chosen design>"
    },
    "motion": {
      "entrance": "<description from frontend-design>",
      "hover": "<description from frontend-design>",
      "focus": "<description from frontend-design>",
      "transitionFast": "120ms ease-out",
      "transitionBase": "180ms ease-out"
    }
  },
  "darkMode": {
    "color": {
      "background": "#0a0a0a",
      "text": "#faf9fc",
      "border": "#2f3441",
      "muted": "#9ca3af"
    }
  },
  "normalization_notes": [
    "<notes for fields inferred during normalization>"
  ],
  "seed": 123456789
}
```

---

## Render Pipeline Artifact Spec

**Directory**: `<SITE_ROOT>/.xiaoyi-ssg/`

```text
.xiaoyi-ssg/
├── render.js                 # Core render script (Node.js ESM, incremental build)
├── dev.js                    # Dev server (watch + serve + live reload via SSE)
├── package.json              # Dependency declaration (js-yaml, marked, chokidar, eta)
├── package-lock.json         # Lock file (npm install)
├── node_modules/             # Pipeline deps (git ignore)
├── templates/                # Project-specific templates (manifest-driven)
│   ├── base.html             # Layout skeleton (layout type, referenced by manifest)
│   └── *.html                # Each page template declared by template-manifest.json
├── assets/
│   ├── style.css             # Full CSS (with Critical CSS comments)
│   ├── script.js             # Interaction entry (mobile menu, search, filter, lightbox, etc.)
│   ├── interactions/         # Optional interaction modules
│   └── data/                 # Optional static JSON data
├── template-manifest.json    # Single source of truth: collections, templates, globals
├── interactions.manifest.json # Interaction contract, deps, fallbacks, verification
├── config.schema.json        # Config validation schema
├── content-types.json        # Content type definitions
└── pipeline-manifest.json    # Pipeline metadata
```

### package.json (written to the user project)

```json
{
  "name": "xiaoyi-ssg-renderer",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node render.js",
    "build:fresh": "node render.js --fresh",
    "dev": "node dev.js"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "marked": "^12.0.0",
    "chokidar": "^3.6.0",
    "eta": "^3.2.0"
  }
}
```

### pipeline-manifest.json

```json
{
  "version": 1,
  "generated_at": "2026-01-15T14:30:00Z",
  "source_skill": "frontend-design",
  "theme_ref": "<brand>",
  "theme_manifesto_hash": "sha256:<64 lowercase hex chars>",
  "tokens_hash": "sha256:...",
  "content_types_hash": "sha256:...",
  "templates": [
    "base.html",
    "landing.html",
    "list.html",
    "detail.html"
  ],
  "renderer_version": "3.0",
  "runtime": "node",
  "allowed_self_extracted": false,
  "allowed_self_extracted_at": null
}
```

> The `allowed_self_extracted` / `allowed_self_extracted_at` pair is the audit trail for the `--allow-self-extracted` hard override (see § Required Dependencies above). Default `false` / `null`. When the user explicitly passes `--allow-self-extracted`, both fields are set: `allowed_self_extracted: true` and `allowed_self_extracted_at` to the ISO8601 timestamp at which the override was issued. `source_skill` is then `"self-extracted"`.

---

## Render Script Core Spec (for prompts/render-node-spec.md generation)

### Technical Constraints

- Node.js 18+ (LTS, built-in `fetch`, `fs.cpSync`)
- ESM module system (`"type": "module"`, use `import`/`export`)
- Dependencies: `js-yaml` (YAML parsing), `marked` (Markdown → HTML), `chokidar` (file watching, dev.js only), `eta` (template engine)
- Template engine: `eta` (~2KB, ESM, supports HTML escaping, raw HTML, conditionals, loops, async, custom filters)
- Two separate files: `render.js` (build) and `dev.js` (dev)
- Runtime validation: `render.js` validates config.yml, design-tokens.json, content-types.json at startup
- Optional image processing: `sharp` (separately installable), generates responsive sizes + WebP + blur placeholder

### render.js core

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg render pipeline - auto-generated, do not edit manually
 * Regenerate via: /xiaoyi-ssg → adjust style/content type → regenerate pipeline
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { Eta } from 'eta';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
const PUBLIC_DIR = join(SITE_ROOT, 'public');
const CACHE_FILE = join(SITE_ROOT, '.xiaoyi-ssg-cache.json');

// Load config and data
const config = yaml.load(readFileSync(join(SITE_ROOT, 'config.yml'), 'utf-8'));
const tokens = JSON.parse(readFileSync(join(SITE_ROOT, '.xiaoyi-ssg-design-tokens.json'), 'utf-8'));
const contentTypes = JSON.parse(readFileSync(join(PIPELINE_DIR, 'content-types.json'), 'utf-8'));
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) : { version: 1, outputs: {} };

// Initialize Eta
const eta = new Eta({
  views: join(PIPELINE_DIR, 'templates'),
  defaultExtension: '.html',
  useWith: true,
  cache: true,
  rmWhitespace: false,
});

const fresh = process.argv.includes('--fresh');

// Main flow: loadManifest → loadSources (dispatch by type) → expandViews → render tasks → copyAssets → generateExtras → GEO → assertNoSecretsInOutput → saveCache → printSummary
```

### dev.js core

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg dev server - live render + Live Reload
 */
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import { build } from './render.js';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
const PUBLIC_DIR = join(SITE_ROOT, 'public');

const SSE_SCRIPT = `<script>(function(){try{var s=new EventSource('/__live');s.addEventListener('reload',function(){location.reload();});}catch(e){}})();</script>`;

// Port auto-increment: 3000 in use → 3001 → ...
```

### Template Data Contract

Each template receives a uniform data structure:

```javascript
const data = {
  site: config.site,                    // {title, subtitle, author, email, language, timezone, url, description}
  nav: navItems,                        // [{title, url, active, children}]
  page: {
    type: "list|detail|page|index",
    title: "...",
    url: "/blog/",
    breadcrumb: undefined,              // optional: [{title: "Home", url: "/"}, {title: "Blog", url: "/blog/"}]
  },
  pagination: {                         // list pages only
    current: 1,
    total: 5,
    base_url: "/blog/",
    pages: [1, 2, 3, "...", 5],
    prev_url: null,
    next_url: "/blog/page/2/"
  },
  items: [...],                         // list pages: content excerpt array
  item: {...},                          // detail pages: single content full data (with body_html)
  prev_item: {...},                     // detail pages: previous
  next_item: {...},                     // detail pages: next
  tokens: tokens,                       // design tokens (rare runtime use)
  build_time: "ISO8601",
};
```

Templates render via Eta; support HTML escaping, raw HTML, conditionals, loops, async, custom filters.

Standard content item fields:

```javascript
{
  type: "post",
  slug: "hello-world",
  title: "Hello World",
  date: "2025-01-15",
  date_display: "2025-01-15",
  tags: ["tag1", "tag2"],
  categories: ["cat1"],
  cover: "/images/cover.jpg",
  excerpt: "Excerpt text...",
  url: "/blog/hello-world/",
  body_html: "<p>Body HTML...</p>",  // detail pages only
  custom_fields: {...}
}
```

---

## Cache Mechanism

**File**: `<SITE_ROOT>/.xiaoyi-ssg-cache.json`

```json
{
  "version": 1,
  "outputs": {
    "/blog/hello-world/": {
      "hash": "sha256:...",
      "inputs": [
        "source/_posts/2025-01-15-hello-world.md",
        ".xiaoyi-ssg/templates/detail.html",
        ".xiaoyi-ssg/templates/base.html",
        ".xiaoyi-ssg/template-manifest.json"
      ],
      "template_names": ["detail", "base"]
    }
  }
}
```

**Algorithm**:

- For each output path, compute an input hash: source items (file for markdown, JSON for API/derived) + template files used + tokens + config key fields + **template-manifest.json** + interactions manifest + interaction modules + data files + style/script + tokens (for syncTokensToCSS) → SHA256 (`crypto.createHash`).
- If the hash matches cache and is not `--fresh` → **skip render**, reuse the existing `public/` file.
- `--fresh`: ignore cache, force re-render of all pages. Also forces remote sources to ignore their snapshot TTL and re-fetch.
- Implicit per-page build: only process outputs related to changed sources/items; the rest is reused.
- Remote source snapshots live separately at `.xiaoyi-ssg/.cache/sources/<key>.json` (git-ignored). The build cache key for API/derived pages participates the snapshot contents directly; a refresh of the snapshot invalidates the page hash.

---

## Test Checklist

After any logic change, verify at least:

1. **New site**: `/xiaoyi-ssg` → dialogue → generate config.yml + content-types + tokens + sources/views manifest + pipeline + source/ + npm install + first build.
2. **Run build**: `node .xiaoyi-ssg/render.js` → public/ complete site (HTML, CSS, JS, feed, sitemap, 404, GEO).
3. **Reproducible**: two consecutive `render.js` runs (with remote sources either pinned by TTL or unchanged) → outputs byte-identical (except timestamp fields).
4. **Cache invalidation**: modify one content file → re-run `render.js` → only the related pages rebuild; others are reused.
5. **Force refresh**: `render.js --fresh` → all pages re-render; remote sources ignore TTL and re-fetch.
6. **Realtime dev**: `cd .xiaoyi-ssg && npm run dev` → modify md → browser auto-refresh. Modify a markdown source file → only the related pages rebuild; verify the remote sources are NOT re-fetched on every keystroke.
7. **Style adjustment**: `/xiaoyi-ssg` → "adjust color/layout" → update tokens → regenerate pipeline → `render.js --fresh` → takes effect.
8. **Markdown content type add/remove**: `/xiaoyi-ssg` → "add a 'project' type" → define fields → update content-types.json + corresponding markdown `source` + `view` in manifest → regenerate pipeline → available.
9. **API data source add**: `/xiaoyi-ssg` → "pull products from https://api.shop.example.com, with PRODUCTS_API_TOKEN" → AI adds `source.type=http` with `auth.env=PRODUCTS_API_TOKEN` + matching `for.each` view → regenerate pipeline → set `PRODUCTS_API_TOKEN` env var → `render.js --fresh` → products pages appear; `grep -r "<token-value>" public/` returns nothing.
10. **Derived source (taxonomy)**: `/xiaoyi-ssg` → "aggregate posts by tag into /tag/{slug}/ pages" → AI adds `derived:groupBy tags` source + `for.each` view with `output: /tag/{field}/` → regenerate → one page per tag renders.
11. **Multi-source home**: `/xiaoyi-ssg` → "show recent posts and latest products on the home" → home view declares `use: ["posts", "products"]` → template iterates both → home renders both.
12. **Auth failure handling**: configure a source with a fake `auth.env` and unset env var → build must follow `fallback` (no `Bearer undefined` header, no crash) → check log + `public/` for absence of leaked token.
13. **Secret leak check**: `assertNoSecretsInOutput` runs as part of the mandatory self-test after every build. Force a leak (write a snapshot containing the secret) and verify the build fails non-zero.
14. **Reference site analysis**: give URL → AI extracts design intent → fused into tokens.

---

> Maintenance principle: documentation first, convention over configuration, AI-executable means fully documented.  
> Core pattern: dialogue generates pipeline → pipeline runs itself → iterate by regenerating the pipeline.
