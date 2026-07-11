# GEO (Generative Engine Optimization) Conventions

> Required pre-reading:
> 1. [`SKILL.md`](../SKILL.md) — skill entry, Frontmatter language policy
> 2. [`templates/conventions.md`](../templates/conventions.md) — frontmatter + variable binding rules
> 3. [`prompts/render-node-spec.md`](./render-node-spec.md) — render.js structure, before adding GEO generators

This file defines how `xiaoyi-ssg` makes sites consumable by AI search engines and LLM-based assistants (ChatGPT, Claude, Perplexity, Google AI Overviews, Bing Copilot, etc.) without requiring the user to author GEO-specific files.

---

## Core Principle

**The user's existing content is the GEO source.**

For a blog, `source/posts/*.md` is the GEO source. For docs, `source/docs/**/*.md` is the GEO source. For landing/about, `source/<singleton>/*.md` is the GEO source. There is no separate `geo/` directory; the AI must not invent one.

`render.js` aggregates the existing content into AI-friendly artifacts:

| Artifact | Always on? | Source | Output |
|----------|-----------|--------|--------|
| `llms.txt` | Yes | All content items (title + summary) | `/llms.txt` (Answer.AI standard) |
| `llms-full.txt` | Opt-in (`config.geo.llms_full: true`) | All content bodies (raw markdown) | `/llms-full.txt` |
| `robots.txt` | Yes | Hardcoded AI bot list + config policy | `/robots.txt` |
| Per-page markdown mirror | Yes for content pages (off for landing) | The source `.md` file, frontmatter stripped | `/<page-url>/index.md` |
| JSON-LD per page | Yes (unless `config.geo.jsonld: false`) | Frontmatter fields + item body | `<script type="application/ld+json">` in `<head>` |
| Semantic meta enrichment | Yes | Frontmatter + manifest | `<meta property="article:*">`, `<time datetime>`, `<article>` |

**All seven features are built-in. The user does not need to opt in to get a GEO-ready site.**

---

## Frontmatter GEO Extensions

These fields are optional. When absent, sensible defaults apply.

| Field | Type | Used in | Default |
|-------|------|---------|---------|
| `summary` | `string` | llms.txt entry, JSON-LD `description`, `<meta name="description">` | first paragraph of body, truncated to 200 chars |
| `topics` | `string[]` | JSON-LD `keywords`, `<meta name="keywords">` | `[]` |
| `audience` | `string` | JSON-LD `audience` | omitted |
| `citation_key` | `string` | Citation footer block | omitted |
| `content_type` | `string` | JSON-LD `@type` override | auto-mapped from collection (see Schema Mapping below) |
| `updated` | `date` | Sitemap `<lastmod>`, JSON-LD `dateModified` | falls back to `date` |
| `noai` | `boolean` | `<meta name="robots" content="noai">` per page | `config.geo.noai` (site-wide default) |

When the user does not provide `summary`, `render.js` must auto-derive it from the **raw markdown source** (read via `contentFileMap.get(item.url)`, never from `item.body_html` — that's already-rendered HTML, and stripping HTML tags to recover plain text is lossy):

```javascript
function deriveSummary(item, contentFileMap) {
  if (item.summary) return item.summary;
  const mdPath = contentFileMap?.get(item.url);
  const raw = mdPath ? readFileSync(mdPath, 'utf-8') : '';
  const text = raw.replace(/^---[\s\S]*?---\n?/, '').replace(/[#*`>_-]/g, '').trim();
  const firstPara = text.split(/\n\s*\n/)[0] || '';
  return firstPara.slice(0, 200).trim();
}
```

For items where `item.url` is not in `contentFileMap` (API / JSON / CSV / RSS / inline / derived — i.e. non-markdown sources), this function returns `''`. The caller is responsible for emitting `<meta name="description">` with the empty string or omitting the tag entirely for non-content pages (404, landing with no markdown mirror, etc.).

This auto-derivation is mandatory — the AI must never emit `<meta name="description">` as empty for a markdown-source page.

---

## config.yml Additions

```yaml
geo:
  # AI bot policy. allow = default open, block = deny all common AI crawlers,
  # custom = use a per-bot map in geo.ai_bot_rules below.
  ai_bots: allow

  # Optional per-bot rules (only used when ai_bots: custom).
  # ai_bot_rules:
  #   GPTBot: allow
  #   ClaudeBot: allow
  #   CCBot: block

  # Whether to emit /llms-full.txt (concatenated markdown body of all content).
  # Large sites should keep this off; small sites can opt in.
  llms_full: false

  # Per-page markdown mirror: /post/foo/ also gets /post/foo/index.md.
  # Strongly recommended for content sites; off for landing-only sites.
  markdown_mirror: true

  # Emit JSON-LD structured data in <head>.
  jsonld: true

  # Site-wide robots default. true = inject <meta name="robots" content="noai"> on every page.
  # Per-page `noai` frontmatter overrides this.
  noai: false
```

Defaults when `config.geo` is absent:

- `ai_bots: allow`
- `llms_full: false`
- `markdown_mirror: true`
- `jsonld: true`
- `noai: false`

The AI must always generate a `geo:` block in `config.yml` even if all values are defaults — explicit is better than implicit, and the user can edit one field without surprises.

---

## `render.js` Additions

### `generateLlmsTxt(datasets, config, contentTypes)` — Always On

Output: `/llms.txt` (Answer.AI / Jeremy Howard standard).

Format:

```markdown
# {site.title}

> {site.description}

## {collectionLabel1}

- [{item.title}]({site.url}{item.url}): {item.summary | derived}
- [{item.title}]({site.url}{item.url}): {item.summary | derived}

## {collectionLabel2}

- [{item.title}]({site.url}{item.url}): {item.summary | derived}
```

Rules:

- H1: site.title
- Blockquote: site.description (omit if empty)
- One `##` section per non-singleton, non-empty collection, ordered by `contentTypes.nav_order` then collection name
- Within each section: items sorted by the collection's manifest sort (desc date for posts, asc nav_order for docs)
- Singleton items (landing, about) appear as a flat bullet list after the sectioned collections, under `## Pages`
- Draft items (`item.draft === true`) must be excluded
- Per-item line: `- [{title}]({absoluteUrl}): {summary}`. If summary is empty, omit the `: ...` part — never emit `: ` with nothing after it
- Use `site.url` to build absolute URLs only when present; otherwise relative URLs

### `generateLlmsFullTxt(datasets, config, contentFileMap)` — Opt-In

Output: `/llms-full.txt`.

Rules:

- Only run when `config.geo.llms_full === true`
- Same H1 / blockquote header as llms.txt
- For each item (non-draft, in `nav_order`), emit a divider and the raw markdown body:

  ```markdown
  ---

  ## [{title}]({absoluteUrl})

  {raw markdown body, frontmatter stripped}
  ```

- Use the **raw markdown body** (frontmatter stripped, read via `contentFileMap`), not `body_html` — LLMs benefit more from markdown source

### `generateRobotsTxt(config)` — Always On

Output: `/robots.txt`.

The default AI bot list (the AI must use this exact list, no more, no less):

```
GPTBot, ChatGPT-User, OAI-SearchBot, Claude-Web, ClaudeBot,
PerplexityBot, Perplexity-User, Google-Extended, anthropic-ai,
Bytespider, CCBot, cohere-ai, Applebot-Extended, Amazonbot, Meta-ExternalAgent
```

Rules:

- Top section: `User-agent: *` with `Allow: /` (or `Disallow: /` when `config.geo.noai === true`)
- Then one `User-agent: {bot}` block per bot in the list above. Each block's policy follows `config.geo.ai_bots`:
  - `allow` → `Allow: /`
  - `block` → `Disallow: /`
  - `custom` → look up `config.geo.ai_bot_rules[bot]` (default `Allow: /` if absent)
- Trailing `Sitemap: {site.url}/sitemap.xml` line (omit when site.url is empty)
- Trailing `# Generated by xiaoyi-ssg` comment

### `mirrorMarkdown(tasks, contentFiles, config)` — Always On for Content Pages

Output: per-page `/<page-url>/index.md`.

Rules:

- Only runs when `config.geo.markdown_mirror !== false`
- Only mirrors `for.each` outputs (detail pages, doc pages, project pages, etc.) — never mirror singleton or list pages, and never mirror pages whose item came from a non-markdown source (API/JSON/CSV/RSS/derived items have no source `.md` file). The mirror is gated by `contentFileMap`, which the markdown adapter populates.
- For each mirrored page: read the source `.md` file, strip frontmatter, write to `public/<pageUrl>/index.md`
- Strip frontmatter means: remove the leading `---\n...\n---\n` if present; if absent, copy as-is
- The mirror preserves the raw markdown body unchanged — do not re-render to HTML, do not add wrappers
- Add a single trailing HTML comment line `<!-- mirrored from: <sourcePath> by xiaoyi-ssg -->` for traceability (LLMs ignore HTML comments; humans reading the mirror benefit)

### `buildJsonLd(item, col, site, config)` — Always On (when `config.geo.jsonld !== false`)

Returns a JSON-LD string injected into the `<head>` of every content page.

Schema mapping by collection:

| Collection context | `@type` |
|-------------------|---------|
| Singleton landing (homepage) | `WebSite` (+ nested `Organization`) |
| Singleton about / contact / similar | `WebPage` |
| `post` / `posts` / `articles` / `blog` | `BlogPosting` |
| `doc` / `docs` (with `tree: true`) | `TechArticle` |
| `project` / `projects` / `work` / `portfolio` | `CreativeWork` (with `@type: "SoftwareSourceCode"` if `repo_url` present) |
| Other | `Article` |

Per-item payload:

```json
{
  "@context": "https://schema.org",
  "@type": "{mapped type}",
  "headline": "{item.title}",
  "description": "{item.summary | derived}",
  "url": "{site.url}{item.url}",
  "datePublished": "{item.date}",
  "dateModified": "{item.updated || item.date}",
  "author": { "@type": "Person", "name": "{site.author | site.title}" },
  "publisher": { "@type": "Organization", "name": "{site.title}" },
  "keywords": "{item.topics | [] join ', '}",
  "inLanguage": "{site.language}"
}
```

For doc pages, additionally include `isPartOf` / `hasPart` only when parent chain is known from tree structure.

For landing homepage, omit `item.*` references and emit:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "{site.title}",
  "description": "{site.description}",
  "url": "{site.url}",
  "inLanguage": "{site.language}",
  "publisher": { "@type": "Organization", "name": "{site.title}" }
}
```

When `config.geo.jsonld === false` or the item is draft, emit an empty string.

### Wire-up Order in `build()`

After `generateFeed` and `generateSitemap`, call (in this order):

```javascript
buildExtras(...);
generateFeed(...);
generateSitemap(...);
generateLlmsTxt(datasets, config, contentTypes);    // always
if (config.geo?.llms_full) generateLlmsFullTxt(datasets, config);  // opt-in
generateRobotsTxt(config);                              // always
mirrorMarkdown(tasks, contentFileMap, config);          // always (when enabled)
```

`contentFileMap` is a `Map<pageUrl, sourceMdPath>` built by the **markdown** Source Adapter during `loadSources` — for each item the adapter records `{ item.url: sourceFile }`. The mirror then writes a markdown file only for tasks whose `output` is in `contentFileMap`. Tasks whose items came from `http`/`json`/`csv`/`rss`/`inline`/`derived` are skipped by the mirror.

### Cache Participation

GEO outputs participate in the hash cache:

- `llms.txt` hash includes: collection item titles + summaries + manifest sort + config.site (the hash only re-computes when titles/summaries/sort change)
- `robots.txt` hash includes: `config.geo` block + `config.site.url`
- `llms-full.txt` hash includes: all item body strings + manifest sort
- Markdown mirror: hash includes the source file content; on change, only the matching `<url>/index.md` is rewritten

`--fresh` re-emits everything regardless.

---

## Template Additions

### `base.html`

Add a JSON-LD slot inside `<head>`:

```html
<head>
  ...
  <%~ jsonLd %>
</head>
```

Add a markdown mirror `<link>` for content pages (rendered when `data.mirror_md_url` is present):

```html
<% if (mirror_md_url) { %>
  <link rel="alternate" type="text/markdown" href="<%= mirror_md_url %>">
<% } %>
```

> Eta with `useWith: true` binds every data key at the top scope, so the condition reads `mirror_md_url`, not `it.mirror_md_url`. See [`templates/conventions.md`](../templates/conventions.md) §2.

### Detail / Doc Page Templates

Use semantic HTML5:

- Wrap the body in `<article itemscope itemtype="https://schema.org/{type}">`
- Date strings in `<time datetime="{item.date}">`
- Author byline in `<address>` with `rel="author"`

The JSON-LD script is rendered automatically by `render.js` into `data.jsonLd`; the template just emits `<%~ jsonLd %>` in `<head>` (already covered by base.html).

### When `<head>` Cannot Hold JSON-LD

For very large schemas, the AI may inline a `<script type="application/ld+json">` block in the page body before `<script src="/assets/script.js">`. Either is acceptable; the default is `<head>` via the base.html slot.

---

## `dev.js` Watch Paths

Add to the chokidar watch list:

- `source/<type>/**` (already covered by `source/**`)
- `config.yml` (already covered)

No additional paths needed — GEO outputs are derived from content + config, both already watched.

---

## Common Pitfalls

1. **llms.txt with `: ` and no summary** — emits `- [Foo](https://.../foo/): `. Validate: every line must either have content after the colon or omit the colon entirely.
2. **llms-full.txt contains rendered HTML** — re-read the raw markdown from disk via `contentFileMap.get(task.output)` (the markdown adapter records `Map<pageUrl, sourceMdPath>` for every `for.each` output of a markdown source). The item carries `body_html`, never the raw body — pass the raw markdown bytes, not the rendered HTML. LLMs prefer markdown source.
3. **JSON-LD with `datePublished: "Invalid Date"`** — guard with `if (item.date)`. If frontmatter `date` is missing or unparseable, omit the field rather than emitting garbage.
4. **`robots.txt` with conflicting directives** — when `config.geo.noai === true`, the `User-agent: *` block must say `Disallow: /`, not `Allow: /`. The AI bot blocks below follow `config.geo.ai_bots`, not `noai`. These are independent policies.
5. **Markdown mirror copies `body_html`** — must be the raw source markdown with frontmatter stripped. Re-reading the original `.md` file (not the parsed item) is mandatory.
6. **Per-page `noai: true` does not remove JSON-LD** — page-level `noai` only injects `<meta name="robots" content="noai">`. JSON-LD is content metadata for AI to read; the meta robots tag is the opt-out. These are separate concerns.
7. **Mirroring singleton or non-markdown pages** — `/about/index.md` for an about page is meaningless; skip singleton outputs. Mirror only `for.each` outputs whose items came from a markdown source (i.e. present in `contentFileMap`). Pages whose items came from API/JSON/CSV/RSS/derived sources have no source `.md` and must not be mirrored.
8. **JSON-LD `inLanguage` missing on multilingual sites** — always pull from `site.language` (BCP 47). If the site has per-page language overrides, use the page-level value.

---

## AI Self-Check Before Generation

Before writing `render.js`:

- [ ] `config.geo` block written to `config.yml` with all 5 fields (explicit defaults)
- [ ] `generateLlmsTxt`, `generateRobotsTxt`, `mirrorMarkdown` always present
- [ ] `generateLlmsFullTxt` guarded by `config.geo.llms_full`
- [ ] `buildJsonLd` returns empty string for `config.geo.jsonld === false` or draft items
- [ ] `contentFileMap` built during scan, used by mirror
- [ ] base.html has `<%~ jsonLd %>` slot in `<head>`
- [ ] cache hash includes GEO output inputs
- [ ] `dev.js` chokidar watch unchanged (GEO inputs already covered)

After generating `render.js`, write a tiny smoke fixture (3-item collection) and verify:

- [ ] `/llms.txt` exists, H1 is site title, every item line is well-formed
- [ ] `/robots.txt` lists all 15 bots and a Sitemap line
- [ ] One content page has matching `/index.md` (frontmatter stripped, body unchanged)
- [ ] One content page's `<head>` has a `<script type="application/ld+json">` with valid JSON
- [ ] `config.geo.llms_full: false` → no `/llms-full.txt`; flip to `true` → file appears

---

## Hint to AI

> You are making the user's existing content consumable by AI. Do not invent a new content authoring flow; do not require the user to write a separate `llms.md`. The markdown files the user already wrote are the source.
>
> When in doubt, err toward more AI-friendly output: emit JSON-LD, emit the markdown mirror, emit llms.txt. The user can disable any of these via `config.geo.*`. Defaults are on because GEO is the reason the user is here.
