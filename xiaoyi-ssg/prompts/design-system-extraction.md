# Design Token Normalization Prompt

This prompt tells the AI how to convert an already-loaded design source into the project-local `.xiaoyi-ssg-design-tokens.json` file. It does not authorize the AI to invent a visual system from scratch.

Before using this prompt, complete the pre-flight in [`SKILL.md` § Required Dependencies](../SKILL.md) and load the `frontend-design` skill. The `self-extracted` source is only allowed when the user explicitly passes `--allow-self-extracted`.

## Inputs

```json
{
  "design_source": {
    "source_skill": "frontend-design",
    "source_ref": "skill:frontend-design/SKILL.md",
    "loaded_content_summary": "Loaded source brief summary",
    "implementation_notes": "Exact CSS variables, font links, font stacks, or token notes from the source"
  },
  "design_intent": { "...": "optional output from reference-analysis.md" },
  "user_preferences": {
    "color_direction": "optional user override",
    "spacing": "optional user override",
    "typography": "optional user override",
    "motion": "optional user override"
  },
  "content_types": { "...": "content model; affects component coverage" },
  "site_structure": { "...": "layout needs such as sidebar, hero, docs tree" }
}
```

## Source Priority

1. User's explicit visual preferences.
2. Loaded `frontend-design` tokens and implementation notes.
3. Reference-site analysis (only when the user asked for that reference).
4. Conservative system-safe completion for required schema fields that are absent.

Do not use unstated "built-in aesthetics" to replace the loaded design source. When a required field is missing, derive the smallest compatible value from the source, explain it in `normalization_notes`, and keep `source_skill` accurate.

## Output Schema

Write exactly one JSON object matching `schemas/design-tokens.json`:

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
      "text": "#0a2540",
      "textDark": "#f6f9fc",
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
      "fontDisplay": "value copied or normalized from the loaded source",
      "fontBody": "value copied or normalized from the loaded source",
      "fontMono": "value copied or normalized from the loaded source",
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
      "card": "description normalized from source",
      "cardMedia": "description normalized from source",
      "nav": "description normalized from source",
      "button": "description normalized from source",
      "form": "description normalized from source",
      "blockquote": "description normalized from source",
      "code": "description normalized from source",
      "pre": "description normalized from source",
      "media": "description normalized from source",
      "pagination": "description normalized from source",
      "breadcrumb": "description normalized from source"
    },
    "motion": {
      "entrance": "description normalized from source",
      "hover": "description normalized from source",
      "focus": "description normalized from source",
      "transitionFast": "120ms ease-out",
      "transitionBase": "180ms ease-out"
    }
  },
  "darkMode": {
    "color": {
      "background": "#0a0a0a",
      "text": "#f6f9fc",
      "border": "#2f3441",
      "muted": "#9ca3af"
    }
  },
  "normalization_notes": [
    "Short notes for fields inferred because the loaded source did not provide an exact xiaoyi token."
  ],
  "seed": 123456789
}
```

## Normalization Rules

- Keep `source_skill` truthful. The default value is `"frontend-design"`. Use `"self-extracted"` only when no design skill, design file, reference URL, or user-provided design spec is available (and only after `--allow-self-extracted`).
- Preserve exact color values, font stacks, spacing scales, radii, and motion timings from the loaded source whenever possible.
- Convert source token names into the xiaoyi schema; do not change the schema to match the source.
- If the source provides only light mode, derive `darkMode.color` from source neutrals and record that derivation in `normalization_notes`.
- If the source provides component CSS rather than component tokens, summarize each component style as a short descriptive string and let `pipeline-generation.md` map it to project CSS.
- Generate `theme_manifesto_hash` from the loaded source content plus explicit user overrides. Use lowercase hex.
- Keep values CSS-compatible and schema-compatible. Include units on lengths.

## User Confirmation

For broad visual changes, summarize only the decisions that materially affect the site before writing files:

```text
Design source: frontend-design
Primary tokens: light background, blue-violet accent, sans display/body
Adjusted for this site: 3-column project cards, 72rem container, 8px radius
```

Do not ask the user to confirm every raw token unless the request is exploratory or ambiguous.
