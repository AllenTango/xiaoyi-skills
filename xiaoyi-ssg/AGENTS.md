# AGENTS.md — xiaoyi-ssg Development Guide

> 当前版本：v1.0.0  
> 最后更新：2026-07-09

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
  - When aligning with the user's "should be v2" hint in casual conversation
- **The AI's role on version questions is advisory only**: it may surface "this change might warrant a version bump" as a suggestion, then wait for the user's explicit instruction.
- If the user explicitly requests a version bump (e.g., "bump to v1.1.0", "release v2"), follow this flow:
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
    - `AGENTS.md` introductory header (the 2-line preamble)
- **Class B — Non-interaction dependencies** (human / project management use; not token-sensitive):
  - `STATUS.md` and any future project-management document
  - Default: **Simplified Chinese**.
- Technical terms, command names, code identifiers, file paths, JSON keys remain in English.
- No Cantonese (`嘅`, `係`, `唔`, `冇`, `啲`, `咗`, `裝咗`, etc.). No mixed language drift.
- No colloquial expressions (`搞`, `整`, `弄`, `搞定`, `差不多`, `跑起来`).
- Punctuation: English content uses half-width; the Chinese exceptions (Class A preamble + Class B docs) use full-width.
- One file, one language. No half-English half-Chinese within a single paragraph.

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

---

## Path Conventions

- **`<SKILL_DIR>`**: absolute path of this skill's own directory; varies by install location. Use this placeholder throughout this document for any reference to the skill's own files.
- **`<SITE_ROOT>`**: the site root the user is currently operating on (contains `config.yml`). **Not inside `<SKILL_DIR>`**. AI locates it per session by walking up from the current working directory to find `config.yml`.
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
| `SKILL.md` | Skill definition, frontmatter, workflow, interaction contract | Interaction flow / capability change |
| `AGENTS.md` | This file: AI collaboration conventions for development | Development convention change |
| `prompts/pipeline-generation.md` | Guide AI in generating the full rendering pipeline | Pipeline structure / template strategy / CSS generation strategy change |
| `prompts/content-type-definition.md` | Guide AI in defining content types with the user | Content type flow / field types change |
| `prompts/design-system-extraction.md` | Guide AI in normalizing `frontend-design` content into xiaoyi tokens | Token schema / normalization strategy change |
| `prompts/render-node-spec.md` | Full spec of the rendering script (Node.js) | Renderer structure / algorithm change |
| `prompts/template-manifest-generation.md` | Guide AI in generating `template-manifest.json` | Manifest structure / pattern examples change |
| `templates/conventions.md` | Eta template syntax, variable binding, custom fields mandatory rules | Template engine constraint change |
| `schemas/design-tokens.json` | design-tokens JSON Schema (for validation) | Token field add/remove |
| `schemas/config.schema.json` | config.yml validation schema | Site config field add/remove |
| `schemas/template-manifest.json` | template-manifest validation schema | Manifest structure change |

> Note: `references/frontend-design-integration.md` was merged into `SKILL.md` § Design System Delegation and then deleted.

---

## AI Orchestration Logic (Core)

### Entry: `/xiaoyi-ssg`

When the user types `/xiaoyi-ssg` or `/xiaoyi-ssg <initial-intent>`, the AI executes:

```
1. Pre-flight: load frontend-design (see above).
2. Locate site root:
   - Walk up from cwd to find config.yml
   - Found → <SITE_ROOT> = that directory
   - Not found → recognize as INIT_PIPELINE intent; guide the user to create a new site
3. Read context (if site exists):
   - config.yml
   - .xiaoyi-ssg-design-tokens.json (if exists)
   - .xiaoyi-ssg/content-types.json (if exists)
   - source/**/*.md list (grouped by content type)
   - .xiaoyi-ssg/pipeline-manifest.json (if exists, contains generation metadata)
4. Recognize intent (user input + context):
   - INIT_PIPELINE: no config.yml, or user explicitly says "new site/project"
   - RUN_BUILD: "build/generate/publish/preview" with pipeline present
   - RUN_DEV: "dev/realtime/watch" with pipeline present
   - REGENERATE_PIPELINE: "switch style/adjust layout/change color/theme/add content type/change content type"
   - DEFINE_CONTENT_TYPE: "add a XX type/new content type"
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
| "add a 'project' type with cover, tech stack, links" | DEFINE_CONTENT_TYPE | Current content-types |
| "change this article's title to..." | CONTENT_EDIT | Need to locate file |
| "preview it" | PREVIEW | After build or directly via dev |
| "check if there is any problem" | DIAGNOSE | Scan logic |

**Ambiguity handling**: if intent is unclear, the AI proactively asks (e.g., "Do you want to adjust the visual style, or add a new content type?").

---

### Action Implementations

#### INIT_PIPELINE (Initialize the Rendering Pipeline)

```
1. Pre-flight loads frontend-design (already done above).
2. Discover requirements through dialogue:
   - "What kind of site do you want? Any reference links / screenshots / text description?"
   - User provides: reference URL, or text description (e.g., "minimalist tech blog", "portfolio", "documentation site")
3. Reference site analysis (if a URL is given):
   - WebFetch the page HTML
   - Per prompts/reference-analysis.md extract: color, typography, spacing, layout, components, interactions
   - Output structured design intent: design-intent.json
4. Clarify the content model:
   - "What content types do you need? For example: articles, projects, videos, galleries, pages..."
   - For each type, ask about fields: required / optional, media fields, relationship fields
   - Per prompts/content-type-definition.md generate content-types.json
5. Determine site structure:
   - Nav order, homepage layout, list / detail page structure
   - Generate config.yml (site basics, pages order, per_page, etc.)
6. Generate the design system:
   - Read prompts/design-system-extraction.md
   - Extract tokens from frontend-design, normalize into .xiaoyi-ssg-design-tokens.json
   - Required fields: source_skill (="frontend-design"), color, typography, layout, component, motion, seed
7. Generate the rendering pipeline:
   - Read prompts/pipeline-generation.md and prompts/render-node-spec.md
   - Inputs: tokens + content-types + config + component requirements
   - Generate all <PIPELINE_DIR>/ files in one pass
8. Persist files:
   - config.yml
   - .xiaoyi-ssg-design-tokens.json
   - .xiaoyi-ssg/content-types.json
   - source/ directory structure (create missing _<type>/ per content-types; create source/_media/; do not overwrite existing files)
   - <PIPELINE_DIR>/ (render.js, dev.js, package.json, templates/, assets/, config.schema.json, pipeline-manifest.json)
   - .gitignore (ignore public/, .DS_Store, *.log, .xiaoyi-ssg-cache.json, .xiaoyi-ssg/node_modules/)
9. Install dependencies and first build:
   - Run `npm install` in <PIPELINE_DIR>/
   - Run first build: `cd .xiaoyi-ssg && npm run build`
   - Output success message
10. Suggest next steps:
    - Realtime dev: `cd .xiaoyi-ssg && npm run dev`
    - Add content: `/xiaoyi-ssg` → "add a new article..."
    - Deploy: `cd .xiaoyi-ssg && npm run build` → deploy public/
```

#### RUN_BUILD (Run the Rendering Pipeline)

```
Prerequisite: <PIPELINE_DIR>/render.js must exist

Run: node .xiaoyi-ssg/render.js [--fresh]

Render script logic (Node.js ESM, see prompts/render-node-spec.md for details):
1. Read config.yml + .xiaoyi-ssg-design-tokens.json + content-types.json
2. Scan source/ and parse front-matter per content-type (validate required fields)
3. Read .xiaoyi-ssg-cache.json
4. Compute global data: nav array, pagination plan, prev/next mapping
5. For each output path, compute input hash: content file + template files used + tokens + config key fields + interactions manifest + assets
6. Incremental decision: hash unchanged and not --fresh → reuse public/ existing file; otherwise re-render
7. Generate interaction data: search index, filter facets, gallery/chart data as static JSON or data attributes
8. Render: templates must support HTML escaping, raw HTML, conditionals, loops, safe attribute output, and data-* interaction hooks
9. Write public/<path>/index.html
10. Copy assets/ → public/assets/
11. Generate feeds (RSS/JSON), sitemap.xml, 404.html
12. Update .xiaoyi-ssg-cache.json
13. Print summary: file count, enabled interactions, duration, cache hit rate, warnings
```

#### RUN_DEV (Realtime Dev Mode)

```
Prerequisite: <PIPELINE_DIR>/dev.js must exist

Run: node .xiaoyi-ssg/dev.js [--port 3000]

Dev server logic (see prompts/render-node-spec.md):
1. Start an HTTP server (default port 3000, auto-increment on conflict) serving public/
2. Start chokidar watching:
   - source/**/*.md (content change)
   - .xiaoyi-ssg/templates/** (template change)
   - .xiaoyi-ssg-design-tokens.json (design change)
   - config.yml (config change)
   - source/_media/** (media change)
3. On change:
   a. Run incremental build (reusing render.js logic)
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
5. Trigger REGENERATE_PIPELINE (regenerate the matching list/detail templates)
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
   - Components: card, nav, button, form, pagination, breadcrumb styles
   - Motion: entrance, hover, focus, page transition tendency
3. Output design-intent.json for downstream design system generation
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

> Template selection is declared by `template-manifest.json` `templates[]`.  
> Pagination is declared by `manifest.collections[].pagination`.  
> Singleton pages are expressed by `manifest.collections[].singleton: true`.

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
      "breadcrumb": "<description from frontend-design>"
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
  "runtime": "node"
}
```

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

// Main flow: loadManifest → scanCollections → expandTemplates → render tasks → copyAssets → syncTokensToCSS → generateExtras → saveCache → printSummary
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
    breadcrumb: [{title: "Home", url: "/"}, {title: "Blog", url: "/blog/"}],
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

- For each output path, compute an input hash: content file + template files used + tokens + config key fields + **template-manifest.json** + interactions manifest + interaction modules + data files + style/script + tokens (for syncTokensToCSS) → SHA256 (`crypto.createHash`).
- If the hash matches cache and is not `--fresh` → **skip render**, reuse the existing `public/` file.
- `--fresh`: ignore cache, force re-render of all pages.
- Implicit per-page build: only process outputs related to changed content; the rest is reused.

---

## Test Checklist

After any logic change, verify at least:

1. **New site**: `/xiaoyi-ssg` → dialogue → generate config.yml + content-types + tokens + pipeline + source/ + npm install + first build.
2. **Run build**: `node .xiaoyi-ssg/render.js` → public/ complete site (HTML, CSS, JS, feed, sitemap, 404).
3. **Reproducible**: two consecutive `render.js` runs → outputs byte-identical (except timestamp fields).
4. **Cache invalidation**: modify one content file → re-run `render.js` → only the related pages rebuild; others are reused.
5. **Force refresh**: `render.js --fresh` → all pages re-render.
6. **Realtime dev**: `cd .xiaoyi-ssg && npm run dev` → modify md → browser auto-refresh.
7. **Style adjustment**: `/xiaoyi-ssg` → "adjust color/layout" → update tokens → regenerate pipeline → `render.js --fresh` → takes effect.
8. **Content type add/remove**: `/xiaoyi-ssg` → "add a 'project' type" → define fields → regenerate pipeline → available.
9. **Reference site analysis**: give URL → AI extracts design intent → fused into tokens.

---

> Maintenance principle: documentation first, convention over configuration, AI-executable means fully documented.  
> Core pattern: dialogue generates pipeline → pipeline runs itself → iterate by regenerating the pipeline.
