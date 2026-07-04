---
name: xiaoyi-ssg
description: Use only when the user explicitly invokes /xiaoyi-ssg, names xiaoyi-ssg, or asks to create/maintain a xiaoyi static-site project. Generates and maintains a project-specific static-site pipeline with content models, design tokens, accessible UI, and static-host-compatible browser interactions such as navigation, search, filters, theme toggles, forms, galleries, media controls, charts, or maps.
---

# xiaoyi-ssg

Use this skill as a lightweight router for a generated static site pipeline. Keep this file in context; load detailed prompt files only when the matching task requires them.

## First Rules

- Reply in the user's language unless they ask otherwise.
- Treat `<SITE_ROOT>` as the directory containing `config.yml`.
- Treat `<PIPELINE_DIR>` as `<SITE_ROOT>/.xiaoyi-ssg/`.
- Locate an existing site by walking up from the current directory to find `config.yml`.
- Do not write `<SKILL_DIR>/state.json`; the skill is stateless.
- Build output lives in `public/`. User content lives in `source/`. Generated pipeline source lives in `.xiaoyi-ssg/`.

## Source Protection

`source/` is user-owned content, not generated pipeline state. Unless the current intent is explicitly content creation, content editing, content migration, or content deletion, do not overwrite, delete, reformat, or bulk rewrite:

- `source/**/*.md`
- `source/_media/**`

Allowed `source/` writes:

- init: create missing directories and optional starter content only when the target path does not already exist.
- new content: create the requested single content file.
- content edit: modify only the file the user identified or confirmed.
- content type add: create the missing `source/_<type>/` directory without touching existing files.
- migration/rename/delete: proceed only after showing affected paths and getting explicit user intent.

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
│   ├── render.js
│   ├── dev.js
│   ├── templates/
│   ├── assets/
│   │   ├── style.css
│   │   ├── script.js
│   │   ├── interactions/
│   │   └── data/
│   ├── content-types.json
│   ├── interactions.manifest.json
│   └── pipeline-manifest.json
└── public/
```

Commit `.xiaoyi-ssg/` pipeline source. Ignore `.xiaoyi-ssg/node_modules/`, `public/`, and `.xiaoyi-ssg-cache.json`.

## Intent Routing

- **init / new site**: guide site creation, content types, design direction, then read `prompts/content-type-definition.md`, `prompts/design-system-extraction.md`, `prompts/pipeline-generation.md`, and `prompts/render-node-spec.md`.
- **style/theme/reference change**: preserve `source/`; update design tokens and regenerate only the pipeline. Read `prompts/reference-analysis.md` if a reference URL/screenshot is involved, then `prompts/design-system-extraction.md`, `prompts/pipeline-generation.md`, and `prompts/render-node-spec.md`.
- **content type add/change**: read `prompts/content-type-definition.md`; update `.xiaoyi-ssg/content-types.json`; create only missing `source/_<type>/` directories; then regenerate list/detail pipeline files.
- **interaction add/change**: preserve `source/`; update templates/assets/interactions/data/manifest as needed. Read `prompts/pipeline-generation.md` and `prompts/render-node-spec.md`.
- **new content**: create one content file under the matching `source/_<type>/`; do not regenerate the pipeline unless the content model changed.
- **content edit**: edit only the confirmed content file.
- **build**: run from `<SITE_ROOT>` with `node .xiaoyi-ssg/render.js`, or from `<PIPELINE_DIR>` with `npm run build`.
- **dev**: run from `<SITE_ROOT>` with `node .xiaoyi-ssg/dev.js`, or from `<PIPELINE_DIR>` with `npm run dev`.
- **preview**: use `node .xiaoyi-ssg/dev.js` (includes live reload) or open `public/index.html` directly.
- **diagnose**: inspect config, tokens, content types, source frontmatter, pipeline files, and build output. Do not modify files unless the user asks for fixes.

## Pipeline Rules

- `render.js` and `dev.js` must derive paths from `import.meta.url`:

```js
const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
```

- Do not use `process.cwd()` as the site root.
- Static output may include generated browser JavaScript. Do not remove necessary interaction just to keep pages "pure static".
- Prefer no external runtime dependencies, but allow pinned npm dependencies when requested interactions materially need them. Record them in `interactions.manifest.json`.
- Breadcrumb and nav URLs must be normalized. Visual breadcrumb separators must be generated in exactly one place (prefer CSS), never by URL data and template text at the same time.

## Breadcrumb / URL Safety

When generating or updating render logic:

- Keep URL paths and visual separators separate.
- Never store `//` as breadcrumb data.
- Do not render literal `/` separators in templates if CSS already adds them.
- Do not add breadcrumb separators before the first item or after the last item.
- Normalize all internal paths with helper functions from `prompts/render-node-spec.md`.

Preferred breadcrumb markup:

```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumb">
    <!-- li items only; separators are CSS-only -->
  </ol>
</nav>
```

Preferred separator CSS:

```css
.breadcrumb li + li::before {
  content: "/";
}
```

## Required Checks

After changing this skill:

```bash
PYTHONUTF8=1 python path/to/quick_validate.py ./xiaoyi-ssg
npx skills add /absolute/path/to/xiaoyi-skills --list
```
