# Markdown Source Field Modeling

This prompt covers one specific data origin: **local markdown sources**. In v1, markdown is one of seven Source Adapters, not the center of the engine. Use this file when the user is authoring content that lives as `source/_<type>/*.md`. For other data origins, see [`data-sources.md`](./data-sources.md).

> **v1 shift.** Content modeling is now narrower than before: it only describes the front-matter fields of a markdown source (validation, defaults, display hints). The engine itself no longer has "content types" as a first-class concept; pages are described by `views` over `sources`. The `content-types.json` file still exists for front-matter validation and AI-driven content authoring, but `render.js` reads sources, not content types, for rendering.

---

## Interaction Flow

```
AI: "Where does the content live? Local markdown, API, JSON file, feed, or derived from another source?"
User: "Local markdown for posts and projects."
AI: "For each markdown source, tell me: directory name, label, and which fields each .md file needs."
User: "posts under source/_posts, fields: title, date, tags, cover, excerpt, draft."
AI: Generate / update content-types.json
AI: "Confirm? If yes, the matching sources + views will be generated in template-manifest.json."
User: "Confirmed"
AI: Regenerate pipeline (current manifest)
```

For each markdown source, ask in this order:

### 1. Basic Identity

```
AI: "Type name (kebab-case, e.g., post, project, talk)?"
User: "project"
AI: "English label?"
User: "Project"
AI: "Content directory name (default source/_project)?"
User: "Use default"
```

### 2. Field Definitions

```
AI: "Define front-matter fields. Tell me for each: field name, type, required, default, description. Common types:
- string: single-line text
- datetime: date and time (YYYY-MM-DD HH:MM:SS)
- date: date only (YYYY-MM-DD)
- boolean: true / false
- string[]: array of strings
- url: link
- number: number
- object: any JSON object

Required field recommendation: title, date"
```

User provides them one by one; the AI organizes:

```json
"fields": {
  "title":       { "type": "string",   "required": true },
  "date":        { "type": "date",     "required": true },
  "cover":       { "type": "string",   "required": true, "description": "Cover image path" },
  "tech_stack":  { "type": "string[]", "required": false, "description": "Tech stack tags" },
  "repo_url":    { "type": "url",      "required": false },
  "live_url":    { "type": "url",      "required": false },
  "description": { "type": "string",   "required": true },
  "featured":    { "type": "boolean",  "default": false }
}
```

### 3. Media / Relationship Fields

```
AI: "Do you need special media fields?
- images[]: gallery
- video_url + embed_type: video
- audio_url: audio

Do you need relationship fields?
- related[]: related content
- series: series membership"
```

### 4. Pagination / Layout (a view concern, not a content-type concern)

In v1, page layout (grid/list/masonry) and pagination per-page count live in the **view** declaration, not in the content type. Ask:

```
AI: "List view layout preference? (grid / list / masonry, default grid)"
AI: "How many items per page? (default 12)"
```

These answers go into the matching `view.for.paginate.perPage` and the template file (`list.html`).

---

## Common Markdown Source Field Sets

| Use case | Typical fields |
|----------|----------------|
| `post` (article) | title, date, tags[], categories[], cover, excerpt, draft |
| `project` | title, date, cover, tech_stack[], repo_url, live_url, description, featured |
| `video` | title, date, video_url, embed_type (youtube/bilibili/vimeo/local), cover, tags[] |
| `gallery` | title, date, images[], cover, tags[] |
| `page` (singleton) | title, date, nav, nav_title, nav_order |
| `talk` | title, date, event, video_url, slides_url, cover, description |
| `essay` | title, date, tags[], cover, excerpt |
| `link` | title, date, url, description, tags[] |

---

## Generation Spec

Output `content-types.json`:

```json
{
  "version": 1,
  "types": {
    "project": {
      "label": "Project",
      "dir": "source/_projects",
      "fields": {
        "title":       { "type": "string",   "required": true },
        "date":        { "type": "date",     "required": true },
        "cover":       { "type": "string",   "required": true },
        "tech_stack":  { "type": "string[]", "required": false },
        "repo_url":    { "type": "url",      "required": false },
        "live_url":    { "type": "url",      "required": false },
        "description": { "type": "string",   "required": true },
        "featured":    { "type": "boolean",  "default": false }
      }
    },
    "post": {
      "label": "Article",
      "dir": "source/_posts",
      "fields": {
        "title":       { "type": "string",   "required": true },
        "date":        { "type": "datetime", "required": true },
        "tags":        { "type": "string[]", "required": false },
        "categories":  { "type": "string[]", "required": false },
        "cover":       { "type": "string",   "required": false },
        "excerpt":     { "type": "string",   "required": false },
        "draft":       { "type": "boolean",  "default": false }
      }
    }
  },
  "nav_order": ["post", "project"]
}
```

> **Note on v1 alignment.** Each `types.<name>.dir` corresponds to a markdown source in `template-manifest.json`:
>
> ```json
> "sources": {
>   "projects": { "type": "markdown", "dir": "source/_projects", "sort": { "field": "date", "order": "desc" } },
>   "posts":    { "type": "markdown", "dir": "source/_posts",    "sort": { "field": "date", "order": "desc" } }
> }
> ```
>
> The two files are kept in sync by the pipeline-generation flow. `render.js` does **not** read `content-types.json` to find content; it reads `template-manifest.json`'s sources. `content-types.json` is used by the AI for authoring guidance and (optionally) by the markdown adapter to validate front-matter.

---

## Field Type Validation Rules

| Type | Validation | Example |
|------|------------|---------|
| `string` | non-empty string | `"Hello World"` |
| `datetime` | ISO 8601 date and time | `"2025-01-15 14:30:00"` |
| `date` | ISO 8601 date | `"2025-01-15"` |
| `boolean` | `true` / `false` | `true` |
| `string[]` | array of strings | `["tag1", "tag2"]` |
| `url` | valid URL | `"https://example.com"` |
| `number` | number | `42` |
| `object` | any JSON object | `{"key": "value"}` |

---

## Post-Generation Actions

1. Write `<SITE_ROOT>/.xiaoyi-ssg/content-types.json`.
2. Trigger `template-manifest.json` v1 sync: add the corresponding markdown `source` entry; add/refresh the matching `view` entries.
3. Create `source/_<type>/` directory if it does not already exist.
4. Trigger `REGENERATE_PIPELINE` to regenerate the matching sources, views, and templates.

---

## Hint to AI

> Markdown content modeling is now a subset of source modeling, not the whole game.
> 1. First ask whether the content is local markdown at all. If the user wants an API, a JSON file, a feed, or aggregated data — go straight to `data-sources.md`.
> 2. For markdown sources, define the **minimum necessary** fields; each must have a clear purpose (template rendering, SEO, filtering, display).
> 3. When the user is unsure, give standard recommendations for that type.
> 4. Pagination, layout, and how the source is displayed are **view-level** decisions, not content-type-level.