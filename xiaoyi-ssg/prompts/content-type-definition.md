# Content Type Definition Prompt

This prompt guides the AI in defining content types with the user through dialogue and generating `content-types.json`.

## Interaction Flow

```
AI: "What content types do you need? For example: articles, projects, videos, galleries, pages, talks, essays..."
User: "Projects (cover, tech stack, links), articles (title, date, tags), about page"
AI: For each type, ask about fields (see below)
AI: Generate content-types.json
AI: "Confirm? If yes, the matching list/detail templates will be generated."
User: "Confirmed"
AI: Trigger pipeline regeneration
```

## Field Definition Guidance

For each content type, ask in this order:

### 1. Basic Identity (Required)

```
AI: "Type name (kebab-case, e.g., project, talk, essay)?"
User: "project"
AI: "English label?"
User: "Project"
AI: "Content directory name (default source/_project)?"
User: "Use default"
```

### 2. Field Definitions (Core)

```
AI: "Define fields. Tell me for each: field name, type, required, default, description. Common types:
- string: single-line text
- datetime: date and time (YYYY-MM-DD HH:MM:SS)
- date: date only (YYYY-MM-DD)
- boolean: true / false
- string[]: array of strings
- url: link
- number: number
- object: any object

Required field recommendation: title, date"
```

User provides them one by one; the AI organizes:

```json
"fields": {
  "title": { "type": "string", "required": true },
  "date": { "type": "date", "required": true },
  "cover": { "type": "string", "required": true, "description": "Cover image path" },
  "tech_stack": { "type": "string[]", "required": false, "description": "Tech stack tags" },
  "repo_url": { "type": "url", "required": false },
  "live_url": { "type": "url", "required": false },
  "description": { "type": "string", "required": true },
  "featured": { "type": "boolean", "default": false }
}
```

### 3. Media / Relationship Fields (Optional)

```
AI: "Do you need special media fields?
- images[]: gallery
- video_url + embed_type: video
- audio_url: audio

Do you need relationship fields?
- related[]: related content
- series: series membership"
```

### 4. Templates and Pagination

```
AI: "List page layout preference? (grid / list / masonry, default grid)"
AI: "How many items per page? (default 12)"
```

## Content Type Categories and Default Field Suggestions

| Type | Typical fields | Description |
|------|----------------|-------------|
| `post` (article) | title, date, tags[], categories[], cover, excerpt, draft | Standard blog post |
| `project` (project) | title, date, cover, tech_stack[], repo_url, live_url, description, featured | Portfolio project |
| `video` (video) | title, date, video_url, embed_type (youtube/bilibili/vimeo/local), cover, tags[] | Video log |
| `gallery` (gallery) | title, date, images[], cover, tags[] | Photo gallery / album |
| `page` (page) | title, date, nav, nav_title, nav_order | Standalone page (about/contact) |
| `talk` (talk) | title, date, event, video_url, slides_url, cover, description | Conference talk |
| `essay` (essay) | title, date, tags[], cover, excerpt | Short piece / reflection |
| `link` (link) | title, date, url, description, tags[] | Link bookmarks / favorites |

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
        "title": { "type": "string", "required": true },
        "date": { "type": "date", "required": true },
        "cover": { "type": "string", "required": true },
        "tech_stack": { "type": "string[]", "required": false },
        "repo_url": { "type": "url", "required": false },
        "live_url": { "type": "url", "required": false },
        "description": { "type": "string", "required": true },
        "featured": { "type": "boolean", "default": false }
      }
    },
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
    "about": {
      "label": "About",
      "dir": "source/_about",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "date", "required": false },
        "nav": { "type": "boolean", "default": true },
        "nav_title": { "type": "string", "required": false },
        "nav_order": { "type": "number", "default": 99 }
      }
    }
  },
  "nav_order": ["project", "post", "about"]
}
```

> Notes:
> - Template selection is declared by `template-manifest.json` `templates[]` (see `prompts/template-manifest-generation.md`).
> - Pagination is declared by `manifest.collections[].pagination`.
> - Singleton pages are expressed by `manifest.collections[].singleton: true`.

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

## Post-Generation Actions

1. Write `<SITE_ROOT>/.xiaoyi-ssg/content-types.json`.
2. Trigger `template-manifest.json` to sync update (if a content type is added, the corresponding collection must be added; templates expand per user intent).
3. Create `source/_<type>/` directory.
4. Trigger `REGENERATE_PIPELINE` to regenerate the matching templates and manifest.

## Hint to AI

> You are a content modeler. Guide the user in defining the **minimum necessary fields**; avoid over-engineering. Each field must have a clear purpose (template rendering, SEO, filtering, display). When the user is unsure, give standard recommendations for that type. The generated JSON must pass `schemas/config.schema.json` validation.
>
> **Key principle**: `content-types.json` only defines the **data structure** (content sources, fields, types), **not rendering** (list / detail / pagination, etc.). All rendering is expressed by `template-manifest.json`.
