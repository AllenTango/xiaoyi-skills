# xiaoyi-ssg

[![skills.sh](https://skills.sh/b/AllenTango/xiaoyi-skills)](https://skills.sh/AllenTango/xiaoyi-skills)

![xiaoyi-ssg visual identity](assets/xiaoyi-ssg-identity.png)

AI-driven static site generator that creates a **custom rendering pipeline for each project** through conversation. No fixed templates — the AI generates a complete, self-contained SSG (`render.js` + `dev.js` + templates + CSS + browser JS) tailored to your content model, design intent, and necessary interactions.

> **Static-host compatible, interaction-capable.** The AI *is* the generator. Design tokens persist for consistent output across rebuilds. Live-reload dev server and project-specific browser interactions are included when needed.

## Features

- 💬 **Conversational interface** — `/xiaoyi-ssg` starts a dialogue. Describe what you want; the AI plans and generates a custom SSG.
- 🎨 **Design system persistence** — First run extracts tokens (colors, type, spacing, layout, motion) from your references or descriptions. Saved to `.xiaoyi-ssg-design-tokens.json`. Every rebuild reuses the **same tokens** — consistent visual identity. Only content changes regenerate pages.
- 📝 **Your content model** — You define content types through conversation (projects, articles, videos, etc.). The AI generates front-matter schemas and corresponding list/detail templates.
- 🧩 **Composable pages** — Any combination of content types. Single type = that page is home. Multiple = auto index + each type + pages.
- **Necessary interactions** — Generate accessible browser behavior such as search, filters, sorting, theme toggles, menus, lightboxes, form validation, media controls, charts, and maps when the site needs them.
- 🔗 **Reference-driven design** — Share URLs, screenshots, or descriptions. The AI analyzes them for design intent. No built-in theme menu.
- ⚡ **Live reload dev server** — `npm run dev` starts a watch + serve + auto-refresh server. Edit content → browser refreshes instantly.
- 🌐 **SEO & feeds built-in** — Open Graph, Twitter Cards, JSON-LD, RSS/JSON Feed, sitemap, 404 page.
- 📦 **Zero config to start** — Guided init creates everything + auto `npm install` + first build.
- 🔄 **Pipeline self-runs** — After generation, build is `cd .xiaoyi-ssg && npm run build` or `node .xiaoyi-ssg/render.js` — **zero AI involvement**, deterministic, reproducible, CI/CD ready.

## Installation

### Via skills CLI (recommended)

```bash
# Install the skill for your AI agent
npx skills add AllenTango/xiaoyi-skills --skill xiaoyi-ssg

# Global install (available across all projects)
npx skills add AllenTango/xiaoyi-skills --skill xiaoyi-ssg -g

# Install to specific agents
npx skills add AllenTango/xiaoyi-skills --skill xiaoyi-ssg -a opencode -a claude-code

# Use the latest CLI explicitly
npx skills@latest add AllenTango/xiaoyi-skills --skill xiaoyi-ssg
```

To install from a local checkout, use an absolute path:

```bash
npx skills add /absolute/path/to/xiaoyi-skills --skill xiaoyi-ssg
```

On Windows, prefer an absolute path such as `D:\AICodeProjects\xiaoyi-skills`; relative paths like `.\xiaoyi-skills` may be interpreted as a repository name by the CLI.

### Manual

```bash
# Clone the package, then install this skill through the skills CLI
git clone git@github.com:AllenTango/xiaoyi-skills.git
npx skills add /absolute/path/to/xiaoyi-skills --skill xiaoyi-ssg
```

## Quick Start

```bash
# 1. Enter an empty directory (or your site root)
cd my-site

# 2. Start the conversation
/xiaoyi-ssg

# AI: "What kind of site? Any reference links, screenshots, or descriptions?"
# You: "A minimal portfolio. Reference: https://example.com/portfolio"
# AI fetches reference, analyzes design intent
# AI: "What content types? e.g., projects, articles, about page"
# You: "Projects (cover, tech stack, repo/live links), articles (title, date, tags), about page"
# AI generates: config.yml, content-types.json, design-tokens.json, .xiaoyi-ssg/ (render.js, dev.js, templates, CSS, JS)
# AI auto npm install + first build
# AI: "Done. Run 'cd .xiaoyi-ssg && npm run dev' to start dev server"

# 3. Start dev server (live reload)
cd .xiaoyi-ssg && npm run dev
# → Site Forge dev server running at http://localhost:3000

# 4. Add content (natural language) — browser auto-refreshes if dev server running
/xiaoyi-ssg
# You: "Add a project: 'Neural Style Transfer' with cover, Python/PyTorch, github.com/..."
# → Creates source/_projects/neural-style-transfer.md
# → Dev server detects change → incremental build → browser refreshes

# 5. Build for production
/xiaoyi-ssg
# You: "Build it"
# → Runs npm run build, generates complete site to public/

# 6. Tweak design (persists across builds)
/xiaoyi-ssg
# You: "Make it darker, increase spacing"
# → Edits design-tokens.json, regenerates .xiaoyi-ssg/, rebuilds with --fresh
```

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Conversation     │   References   │     │  Your Preferences │
│  (what you want)  │  (URLs, desc)  │     │  (colors, feel)   │
└──────┬──────┘     └──────┬───────┘     └────────┬─────────┘
       │                   │                      │
       ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      xiaoyi-ssg AI                          │
│  1. Locate site (find config.yml up from cwd)               │
│  2. Read context (config + tokens + content)                │
│  3. Parse intent from conversation                          │
│  4. Execute: init / new content / build / dev / style       │
│  5. Generate: tokens + content-types + config → pipeline   │
│  6. Build: render.js → public/ (pages, pagination, assets)  │
│  7. Dev: dev.js → watch + serve + live reload               │
│  8. Update .xiaoyi-ssg-design-tokens.json + cache           │
└─────────────────────────────────────────────────────────────┘
```

## What You Can Say

| Intent | Example Phrases |
|--------|-----------------|
| **New site** | "帮我建个作品集" / "新建一个技术博客" / "init a portfolio" |
| **Add content** | "新增一个项目：《Neural Style Transfer`" / "加个视频页面" / "新建图集：日本之行" |
| **Build** | "构建一下" / "生成站点" / "build it" / "发布" |
| **Dev mode** | "开发模式" / "实时预览" / "dev" / "watch" |
| **Style adjust** | "换个风格，更极简些" / "主色调换成深绿" / "字体大一点" / "行高宽一点" |
| **Content type** | "加个'演讲'类型，有视频、幻灯片、日期" / "删掉视频类型" |
| **Reference** | "参考这个网站：https://example.com" / "像 xxx.com 一样" |
| **Edit** | "把这篇文章标题改成..." / "加个标签" / "改日期" |
| **Preview** | "预览一下" / "本地看看效果" / "启动服务" |
| **Diagnose** | "检查有没问题" / "哪里不对" |
| **Help** | "怎么用" / "帮助" / "有哪些功能" |

The AI handles all the tedious details — file paths, front-matter, pagination, SEO meta, asset hashing, cache invalidation.

## Site Structure (After Init)

```
my-site/
├── config.yml                      # Site config
├── .xiaoyi-ssg-design-tokens.json  # Persisted design system (colors, type, spacing, layout, motion)
├── .xiaoyi-ssg-cache.json          # Build cache (gitignored)
├── source/
│   ├── _posts/                     # Content type: posts (if defined)
│   ├── _projects/                  # Content type: projects (if defined)
│   ├── _media/                     # User-managed media files
│   └── _<your-type>/               # Any custom types you define
├── .xiaoyi-ssg/                    # Generated pipeline source; commit it, ignore node_modules
│   ├── render.js                   # Core renderer (Node.js ESM)
│   ├── dev.js                      # Dev server (watch + serve + live reload via SSE)
│   ├── package.json                # Dependencies (js-yaml, marked, chokidar, eta)
│   ├── package-lock.json           # Lockfile
│   ├── node_modules/               # Pipeline dependencies (gitignored)
│   ├── templates/                  # Project-specific templates (Eta engine)
│   │   ├── base.html               # Layout skeleton: header + main + footer
│   │   ├── list-<type>.html        # List page template (pagination, card grid)
│   │   ├── detail-<type>.html      # Detail page template (prev/next, full content)
│   │   ├── page.html               # Generic page template
│   │   └── index.html              # Home page template
│   ├── assets/
│   │   ├── style.css               # Complete CSS (with Critical CSS markers)
│   │   ├── script.js               # Interaction bootstrap
│   │   ├── interactions/           # Optional modules for search, filters, gallery, forms, charts, etc.
│   │   └── data/                   # Optional static JSON payloads
│   ├── config.schema.json          # Config validation schema
│   ├── content-types.json          # Content type definitions (copy for renderer)
│   ├── interactions.manifest.json  # Interaction contract and generated modules
│   └── pipeline-manifest.json      # Pipeline metadata (generation time, refs, hashes)
└── public/                         # Generated output (deploy this)
    ├── index.html
    ├── blog/ (or your types)
    ├── projects/
    ├── about/
    ├── assets/
    │   ├── style.css
    │   ├── script.js
    │   ├── interactions/
    │   └── data/
    ├── feed.xml
    ├── feed.json
    ├── sitemap.xml
    └── 404.html
```

`source/` is user-owned content. Style changes, theme/reference updates, interaction updates, pipeline regeneration, build, dev, and diagnose operations must not overwrite, delete, reformat, or bulk rewrite `source/**/*.md` or `source/_media/**`. Only explicit content operations should write there.

## Configuration (`config.yml`)

Generated during init, tailored to your site:

```yaml
site:
  title: "My Portfolio"
  subtitle: "Designer & Developer"
  author: "Jane Doe"
  email: "jane@example.com"
  language: "en"
  timezone: "UTC"
  url: "https://jane.dev"
  description: "Portfolio of selected work"

pages:                    # Enabled content types + nav order
  - projects
  - posts
  - about

per_page: 12              # Pagination size for list pages

nav:
  home_title: "Home"
  external_links: []      # [{ title, url, target }]

# Optional per-type overrides (generated based on your content types)
projects:
  layout: "grid"
  show_cover: true

posts:
  layout: "list"
  show_excerpt: true
  excerpt_length: 200

about:
  content_file: "source/_about/index.md"
```

## Content Front-Matter

Defined by **you** during init. Examples:

### Project (custom type)

```markdown
---
title: "Neural Style Transfer"
date: 2025-01-15
cover: "/images/nst-cover.jpg"
tech_stack: ["Python", "PyTorch", "OpenCV"]
repo_url: "https://github.com/jane/nst"
live_url: "https://nst-demo.jane.dev"
description: "Real-time artistic style transfer using VGG19."
featured: true
---
Project details...
```

### Post (custom type)

```markdown
---
title: "Why I Switched to Rust"
date: 2025-01-10 14:30:00
tags: ["rust", "systems", "learning"]
categories: ["engineering"]
cover: "/images/rust-cover.jpg"
draft: false
excerpt: "A personal account of moving from Go to Rust..."
---
Article content...
```

### About Page (singleton)

```markdown
---
title: "About Me"
date: 2025-01-01
nav: true
nav_title: "About"
nav_order: 3
---
Page content...
```

**Field types**: `string`, `datetime`, `date`, `boolean`, `string[]`, `url`, `number`, `object`.

## Design Tokens (`.xiaoyi-ssg-design-tokens.json`)

Created on first init from your references + preferences. Persists across sessions.

```json
{
  "version": 1,
  "theme_ref": "https://example.com/portfolio|custom",
  "theme_manifesto_hash": "sha256:...",
  "tokens": {
    "color": {
      "background": "#faf9f7",
      "backgroundDark": "#1a1a1a",
      "text": "#1a1a1a",
      "textDark": "#faf9f7",
      "accent": "#3b2f7a",
      "accentHover": "#2d245e",
      "muted": "#8a8680",
      "border": "#e8e6e3",
      "borderDark": "#333333",
      "focus": "#3b2f7a",
      "error": "#c0392b",
      "success": "#27ae60"
    },
    "typography": {
      "fontDisplay": "'Fraunces', Georgia, serif",
      "fontBody": "'Source Serif 4', Georgia, serif",
      "fontMono": "'JetBrains Mono', monospace",
      "scale": {
        "h1": "clamp(2.5rem, 5vw, 4rem) / 1.1",
        "h2": "clamp(1.75rem, 3.5vw, 2.5rem) / 1.2",
        "h3": "clamp(1.25rem, 2.5vw, 1.75rem) / 1.3",
        "body": "1.125rem / 1.75",
        "small": "0.875rem / 1.6",
        "micro": "0.8125rem / 1.5"
      },
      "lineLength": "65ch",
      "letterSpacing": {
        "display": "-0.02em",
        "body": "0",
        "caps": "0.08em"
      }
    },
    "layout": {
      "containerMax": "65ch",
      "headerHeight": "auto",
      "footerHeight": "auto",
      "sidebarWidth": "none",
      "gridColumns": 1,
      "gutter": "3rem",
      "rhythm": "3rem",
      "radius": "3px"
    },
    "component": {
      "card": "no-border, whitespace-separation",
      "cardMedia": "aspect-video, object-cover, border-radius-inherit",
      "nav": "text-only, uppercase, letter-spacing-0.1em",
      "button": "ghost, accent-text, hairline-border",
      "form": "inline-labels, hairline-bottom-border",
      "blockquote": "left-border-3px-accent, italic",
      "code": "muted-bg, padding-0.2em-0.4em, radius-3px",
      "pre": "dark-bg, light-text, overflow-auto",
      "media": "aspect-video, object-cover, border-radius-inherit",
      "pagination": "centered, numbered, active-accent",
      "breadcrumb": "minimal, slash-separator"
    },
    "motion": {
      "entrance": "staggered fade-up, 150ms base, 60ms stagger",
      "hover": "color-transition 120ms ease-out",
      "focus": "accent-outline-2px offset-2px",
      "transitionFast": "120ms ease-out",
      "transitionBase": "150ms cubic-bezier(0.2, 0.8, 0.2, 1)"
    }
  },
  "darkMode": {
    "color": {
      "background": "#1a1a1a",
      "text": "#faf9f7",
      "border": "#333333",
      "muted": "#8a8680"
    }
  },
  "seed": 123456789
}
```

**Behavior**:
- First init → extract from references/preferences → save
- Rebuild → **reuse tokens** → same visual identity
- Content changes → only affected pages regenerate
- Style adjustments → tokens updated → full rebuild with `--fresh`

## Build Pipeline (`.xiaoyi-ssg/render.js`)

1. **Scan** — read `config.yml`, glob `source/**/*.md`, parse front-matter, validate against `content-types.json`
2. **Tokens** — load `.xiaoyi-ssg-design-tokens.json`
3. **Diff** — for each output file, compute input hash (content + templates used + tokens + config + interaction manifest/assets). Skip if unchanged.
4. **Global data** — build nav array from `config.pages`; compute pagination plans; build prev/next for each content item
5. **Interaction data** — generate static JSON payloads or data attributes for search, filters, galleries, charts, and other client behavior.
6. **Generate** — **only for stale pages** (hash changed or `--fresh`):
   - Load design tokens + page data (content, pagination, site meta, nav, prev/next)
   - Render templates with interaction hooks (`data-*`, ARIA states, and useful fallbacks)
   - Write `public/<path>/index.html`
   - Update cache with new hash
7. **Assets** — copy `.xiaoyi-ssg/assets/` → `public/assets/`, including modules and generated JSON payloads
8. **Extras** — `feed.xml` (posts), `feed.json`, `sitemap.xml`, `404.html`
9. **Report** — summary: files generated, interactions enabled, time, cache hit rate, warnings

**Cost optimization**: `render.js` is **pure Node.js**. Unchanged pages reuse cached output — no regeneration cost. Layout/theme/design persists via tokens and cache.

## Dev Server (`.xiaoyi-ssg/dev.js`)

```bash
cd .xiaoyi-ssg && npm run dev
# → Site Forge dev server running at http://localhost:3000
```

1. **HTTP server** — serve `public/` on port 3000 (auto-increment if occupied)
2. **File watch** — `chokidar` monitors `source/**/*.md`, `.xiaoyi-ssg/templates/**`, `.xiaoyi-ssg/assets/**`, `.xiaoyi-ssg/interactions.manifest.json`, `.xiaoyi-ssg-design-tokens.json`, `config.yml`, `source/_media/**`
3. **Incremental build** — on change: rebuild only affected pages
4. **Live reload** — SSE (Server-Sent Events) pushes reload event → browser auto-refreshes
5. **HTML injection** — dev server injects SSE client script before `</body>`

Edit content → browser auto-refreshes. AI adds content → dev server detects → incremental build → refresh.

## Renderer Constraints (Embedded in Generated Pipeline)

- Semantic HTML5 (article, section, nav, header, footer, main, aside)
- WCAG AA contrast, keyboard accessible
- Responsive: ≤640px, 641-1024px, ≥1025px
- Static-host compatible browser JS is allowed and generated when the site needs interaction. Prefer no external runtime dependencies; if charts, maps, or complex search require npm packages, pin them and document them in `interactions.manifest.json`.
- Critical CSS inlined in `<style>`; rest in `assets/style.css` via `<link rel="preload" as="style">`
- No inline `style="..."` attributes
- Images: `loading="lazy"`, width/height, `srcset` if multiple sizes
- Code blocks: prefer build-time/CSS highlighting; allow client enhancements such as copy buttons when requested
- SEO: title, meta description, canonical, Open Graph, Twitter Card, JSON-LD
- **Shared layout skeleton (all pages)**: identical `<header role="banner">` (site title/logo → home, main nav from `config.pages`, mobile menu), `<footer role="contentinfo">` (copyright, RSS, external links), `<main role="main">` wrapper with max-width from `tokens.layout.containerMax`, breadcrumb/back-home nav on all non-home pages. Tokens define layout/color/typography/component/motion — **never vary per page**.
- **Article detail pages**: title, date, tags, categories, cover; **prev/next navigation** (by date, with title + link + optional thumbnail). `<nav aria-label="Article navigation">`
- **List pages**: page title (H1), pagination control (first/prev/page numbers/next/last, current highlighted). `<nav aria-label="Pagination">`
- **About/page/special pages**: title, content, breadcrumb nav.
- **Responsive breakpoints consistent**: all pages trigger same layout changes at ≤640px / 641-1024px / ≥1025px (nav collapse, column count, type scale).
- **Uniqueness**: Each pipeline generation produces a distinctive visual interpretation within the token constraints.

## Deployment

The `public/` directory is a complete static site. Deploy anywhere:

- **GitHub Pages**: push `public/` to `gh-pages` branch or use Actions
- **Netlify/Vercel/Cloudflare Pages**: connect repo, set output dir to `public`
- **Any static host**: upload `public/` contents

```yaml
# .github/workflows/deploy.yml (example)
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install & Build
        run: |
          cd .xiaoyi-ssg
          npm install
          npm run build
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

## Requirements

- **AI agent** with Read/Write/Edit/Glob/Grep/Bash tools (opencode, Claude Code, etc.)
- **Node.js 18+** (for `render.js` and `dev.js`)

Installing the skill via `npx skills add` already requires Node.js, so no additional runtime is needed.

## License

No license has been declared yet.
