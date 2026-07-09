---
name: xiaoyi-ssg
version: 1.2.0
description: Use only when the user explicitly invokes /xiaoyi-ssg, names xiaoyi-ssg, or asks to create/maintain a xiaoyi static-site project. Generates and maintains a project-specific static-site pipeline with content models, design tokens, accessible UI, and static-host-compatible browser interactions such as navigation, search, filters, theme toggles, forms, galleries, media controls, charts, or maps.
client_compatibility: any AI agent with skills-protocol support (Hermes, Claude Code, Codex CLI, Cursor, Aider, Continue.dev, etc.). The skill content is client-agnostic; the user's client must provide the equivalent of `load_skill` / `skill_view` and a way to run shell + write files.
---

# xiaoyi-ssg

Use this skill as a lightweight router for a generated static site pipeline. Keep this file in context; load detailed prompt files only when the matching task requires them.

## Client Compatibility

This skill works in **any AI client that supports the open skills protocol** (Hermes Agent, Claude Code, OpenAI Codex CLI, Cursor, Aider, Continue.dev, OpenHands, Roo Code, etc.). It assumes the client can:

1. **Load the skill's prompt files** — equivalent to `load_skill("xiaoyi-ssg")` or `skill_view(name="xiaoyi-ssg", file_path="prompts/pipeline-generation.md")`. The exact command varies by client.
2. **Run shell commands** — to invoke `node render.js`, `npm install`, `git init`, etc.
3. **Read and write files** — to update `<SITE_ROOT>/config.yml`, `source/_post/*.md`, `public/index.html`, etc.
4. **Optionally delegate to other skills** — for design tokens, this skill recommends `popular-web-designs` / `claude-design` / `design-md` (Hermes ecosystem names; equivalent names on other clients: OpenAI Codex uses `~/.codex/skills/`, Claude Code uses `.claude/skills/` or plugin marketplace, Cursor uses `~/.cursor/rules`, etc.).

If your client lacks skills-protocol support but can read these files directly, that also works — the prompts in `prompts/` and `references/` are plain Markdown intended for any AI to consume.

## First Rules

- Reply in the user's language unless they ask otherwise.
- For init/new site generation, infer the site's primary language from the user's request language unless the user explicitly specifies another site language.
- The inferred site language must drive `config.site.language`, HTML `<html lang>`, navigation labels, UI copy, starter Markdown content, metadata, fallback/error text, search/filter labels, pagination labels, comments text, and README snippets generated for that site.
- Do not default generated sites to English merely because examples, package names, code comments, or references are English. Keep code identifiers in ASCII when useful, but user-facing site text follows the inferred site language.
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
│   ├── render.js              # 核心渲染（manifest 驱动，< 150 行主循环）
│   ├── dev.js                 # 开发服务器（manifest 监听）
│   ├── templates/             # 由 template-manifest.json 声明的清单
│   ├── assets/
│   │   ├── style.css
│   │   ├── script.js
│   │   ├── interactions/
│   │   └── data/
│   ├── template-manifest.json # 单一事实来源：collections、templates、globals
│   ├── content-types.json
│   ├── interactions.manifest.json
│   └── pipeline-manifest.json
└── public/
```

Commit `.xiaoyi-ssg/` pipeline source. Ignore `.xiaoyi-ssg/node_modules/`, `public/`, and `.xiaoyi-ssg-cache.json`.

## Intent Routing

- **init / new site**: guide site creation, content types, design direction, then read `prompts/content-type-definition.md`, `prompts/template-manifest-generation.md`, `references/frontend-design-integration.md`, `prompts/design-system-extraction.md`, `prompts/pipeline-generation.md`, and `prompts/render-node-spec.md`.
- **style/theme/reference change**: preserve `source/`; update design tokens and regenerate only the pipeline. Read `prompts/reference-analysis.md` if a reference URL/screenshot is involved, then `references/frontend-design-integration.md`, `prompts/design-system-extraction.md`, `prompts/template-manifest-generation.md`, `prompts/pipeline-generation.md`, and `prompts/render-node-spec.md`.
- **content type add/change**: read `prompts/content-type-definition.md`; update `.xiaoyi-ssg/content-types.json` and `.xiaoyi-ssg/template-manifest.json` (add/extend collection); create only missing `source/_<type>/` directories.
- **interaction add/change**: preserve `source/`; update templates/assets/interactions/data/manifest as needed. Read `prompts/pipeline-generation.md` and `prompts/render-node-spec.md`.
- **new content**: create one content file under the matching `source/_<type>/`; do not regenerate the pipeline unless the content model changed.
- **content edit**: edit only the confirmed content file.
- **build**: run from `<SITE_ROOT>` with `node .xiaoyi-ssg/render.js`, or from `<PIPELINE_DIR>` with `npm run build`.
- **dev**: run from `<SITE_ROOT>` with `node .xiaoyi-ssg/dev.js`, or from `<PIPELINE_DIR>` with `npm run dev`.
- **preview**: use `node .xiaoyi-ssg/dev.js` (includes live reload) or open `public/index.html` directly.
- **diagnose**: inspect config, tokens, content types, manifest, source frontmatter, pipeline files, and build output. Do not modify files unless the user asks for fixes.

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
npx skills add /absolute/path/to/xiaoyi-skills --list
```

---

## Common Pitfalls (learned from real tests)

When a generated pipeline renders empty pages, check these first:

1. **Empty `<main>` after first build** — 90% of the time it's the base layout. Must be `<%~ body %>`, not `<%- body %>` (Eta does not recognize `<%-`).
2. **List/index template renders nothing** — templates are using `it.col` or `it.recentPosts`. Eta with `useWith: true` does NOT bind `it`. Use top-level variables: `<%= col %>`, `<%= recentPosts %>`.
3. **Custom fields like `year`, `tech_stack` show `undefined`** — render.js's `scanCollections` must spread `...data` onto each item so `item.year` works without going through `item.customFields.year`. The spec requires this — confirm the generated `render.js` includes `...data` in the item builder.
4. **`recentPosts is not defined`** — render.js's globals and template names must match. Use `recentItems` / `allItemsUrl` as generic globals; if you want `recentPosts` style, pick one and stick to it.
5. **Hardcoded `collections.post` in render.js** — breaks any non-post collection. Replace with `Object.values(collections).flatMap(c => c.items)` or use the `primaryColName` lookup pattern.
6. **`contentTypes.types[name]` undefined** — content-types.json may use `collections` key instead. render.js must read both: `(contentTypes.types || contentTypes.collections || {})[name]`.
7. **Pipeline generation thinks it succeeded but pages are empty** — always run the 5 self-tests in `prompts/render-node-spec.md` (§ "必做自测"). If any fails, the pipeline is broken regardless of `node render.js` exit code.

When debugging, compare against `~/temp/ssg-demo*/.xiaoyi-ssg/templates/base.html` — these are known-good examples after fixing the above issues.

For full conventions see `templates/conventions.md`.

## Design System: Always Delegate to Design Skills (Client-Agnostic)

When generating `assets/style.css`, you must NOT invent design tokens from scratch. First load a design source from whichever design skills or plain Markdown references your AI client provides, then normalize that source into `.xiaoyi-ssg-design-tokens.json` using `prompts/design-system-extraction.md`.

| User intent | Hermes Agent | Claude Code | OpenAI Codex CLI | Cursor | Aider / Continue.dev |
|------------|--------------|-------------|------------------|--------|-----------------------|
| "Like Stripe / Linear / Vercel / Notion / Anthropic / etc." (54 brands) | `popular-web-designs` | marketplace plugin `claude-design` or local `~/.claude/skills/popular-web-designs/` | `~/.codex/skills/popular-web-designs/` | copy templates into `~/.cursor/rules/` | paste templates into project `.aider/` or repo `AGENTS.md` |
| Original design from scratch, no specific brand | `claude-design` | `claude-design` marketplace plugin | custom workflow | `~/.cursor/rules/claude-design.md` | `~/.aider/` rules |
| Persist tokens as a formal DESIGN.md spec file | `design-md` | local skill or plugin | local skill | local rule | local rule |
| Fallback (no design skill available) | Read `popular-web-designs/templates/claude.md` directly as a reference file | Same — it's plain Markdown | Same | Same | Same |

The fallback path is important: even if your client has no design skill installed, the 54 brand templates in `popular-web-designs/templates/*.md` are plain Markdown files an AI can read directly with `cat` / `Read` / file tools when those files are available in the user's environment. They include complete design tokens and implementation notes with CSS variables and font links.

Full dispatch rules and the 54-brand list live in `references/frontend-design-integration.md`. The reference file is intentionally thin — it lists *which design source to load*, never *what CSS to write* — so single-source-of-truth design intent flows from whichever design source your client provides into your pipeline.

The internal `references/frontend-design-integration.md` previously contained hand-written CSS snippets; those have been removed in favor of strict delegation. Do not reintroduce hardcoded CSS, color tokens, or font stacks in this skill.

## Responsive & Client-Agnostic Output (Mandatory)

Generated sites must work on **any device, any browser, any viewport size** without user-agent detection or device-specific JavaScript shims.

**Forbidden:**

- ❌ User-Agent string sniffing (`navigator.userAgent.match(/iPhone/)` etc.)
- ❌ Client Hints API for capability gating (`navigator.userDataMobile`)
- ❌ Device-specific CSS classes hardcoded by JS (`.is-mobile`)
- ❌ "Download our app" prompts that block the responsive web view
- ❌ Minimum screen width requirements that hide content on small viewports
- ❌ Touch vs mouse detection that disables hover-only interactions on touch devices
- ❌ iOS-only or Android-only features (no `-webkit-` required for core functionality)

**Required:**

- ✅ Mobile-first CSS: base styles target narrow viewports; `@media (min-width: 768px)` etc. add desktop enhancements
- ✅ Use only `pointer` / `hover` / `any-pointer` / `any-hover` media queries when capability gating is truly needed (e.g. `lightbox hover vs tap`); always provide a non-hover fallback
- ✅ All interactive elements reachable via keyboard, with visible focus rings (`:focus-visible`)
- ✅ Use `dvh` / `svh` units (not `vh`) for full-viewport sections to handle iOS Safari's dynamic chrome
- ✅ Test layouts at 360px (small phone), 768px (tablet), 1280px (desktop), 1920px (wide desktop)
- ✅ Respect `prefers-reduced-motion` and `prefers-color-scheme` as users' actual preference, not just a CSS class toggle

When in doubt, follow the responsive guidance baked into the chosen `popular-web-designs` template — Stripe, Anthropic, Linear, etc. all ship mobile-first responsive CSS in their `Hermes Implementation Notes`.
