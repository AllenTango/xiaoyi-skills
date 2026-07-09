# Reference Analysis Prompt

This prompt guides the AI in analyzing a reference site (URL / HTML / screenshot description) and extracting structured design intent.

## Input

- URL provided by the user (HTML fetched via WebFetch)
- Or text description / screenshot description from the user

## Output: design-intent.json

```json
{
  "source": "https://example.com/portfolio",
  "extracted_at": "2025-01-15T14:30:00Z",
  "color": {
    "background": "warm white #faf9f7 / dark gray #1a1a1a",
    "text": "near-black #1a1a1a / warm white #faf9f7",
    "accent": "deep indigo #3b2f7a — sparingly used for links, hr, active nav",
    "muted": "warm gray #8a8680 — meta text, border, disabled state",
    "border": "hairline #e8e6e3 / subtle #333333",
    "semantic": {
      "focus": "#3b2f7a",
      "error": "#c0392b",
      "success": "#27ae60"
    }
  },
  "typography": {
    "fontDisplay": "'Fraunces', Georgia, serif — high contrast, sharp serifs, distinctive italics",
    "fontBody": "'Source Serif 4', Georgia, serif — readable at small sizes, old-style numerals",
    "fontMono": "'JetBrains Mono', monospace — tight tracking, clear punctuation",
    "scale": {
      "h1": "clamp(2.5rem, 5vw, 4rem) / 1.1",
      "h2": "clamp(1.75rem, 3vw, 2.5rem) / 1.2",
      "h3": "clamp(1.25rem, 2.25vw, 1.625rem) / 1.3",
      "body": "1.125rem / 1.75",
      "small": "0.875rem / 1.55"
    },
    "lineLength": "65ch",
    "letterSpacing": {
      "display": "-0.02em",
      "body": "0",
      "caps": "0.08em"
    }
  },
  "spacing": {
    "rhythm": "3rem",
    "gutter": "1.5rem",
    "radius": "3px"
  },
  "layout": {
    "containerMax": "65ch",
    "headerHeight": "auto",
    "footerHeight": "auto",
    "sidebarWidth": "none",
    "gridColumns": 1,
    "gutter": "3rem",
    "rhythm": "3rem"
  },
  "components": {
    "card": "no border, no shadow — separation by whitespace only. Title in heading font, meta in muted small text, excerpt in body font. Hover: title underline shifts to accent color.",
    "grid": "n/a — single column stack",
    "nav": "text only, uppercase, letter-spacing 0.1em, active state in accent color. No default underline.",
    "button": "ghost — accent text, hairline border, padding 0.75rem 1.5rem. Hover: fill with accent color, text in accent background.",
    "form": "inline labels, hairline bottom border on inputs, accent focus ring",
    "blockquote": "left border 3px accent, italic body, muted citation",
    "code": "monospace, muted background, padding 0.2em 0.4em, radius 3px",
    "pre": "monospace, near-black background, warm white text, horizontal scroll, padding 1.5rem",
    "hr": "hairline, centered, 20% width, accent color",
    "pagination": "centered, prev/next + page numbers, active state accent fill, ample touch targets",
    "media": "aspect-video, object-cover, border-radius-inherit"
  },
  "motion": {
    "entrance": "staggered fade-up (opacity 0→1, translateY 1rem→0) — 150ms base, 60ms stagger, cubic-bezier(0.2, 0.8, 0.2, 1)",
    "hover": "color transition 120ms ease-out (links, buttons, card titles)",
    "scroll": "none — respect prefers-reduced-motion",
    "focus": "accent outline 2px, offset 2px — instant",
    "pageTransition": "instant — no client-side routing"
  },
  "fontsSelfHosted": [
    "Fraunces: woff2, variable (opsz, wght, SOFT, WONK), subset latin",
    "Source Serif 4: woff2, variable (wght), subset latin",
    "JetBrains Mono: woff2, variable (wght), subset latin"
  ],
  "uniquenessGuidance": "Each generation should vary: header bottom padding (2.5–4rem), body font line-height (1.7–1.85), accent color density (links only vs links+hr+active nav), card excerpt length (2 vs 3 lines), whether the post page h1 has a subtle top border. Never repeat the same rhythm.",
  "confidence": 0.85,
  "notes": "The reference is a single-column blog with no sidebar, minimal nav. Suitable for long-form reading."
}
```

## Analysis Dimensions and Extraction Methods

### 1. Color

- Use browser dev tools or compute the dominant palette.
- Extract: background, text, accent, muted, border, semantic colors (focus/error/success).
- Note light/dark mode differences (`prefers-color-scheme` CSS or class toggle).

### 2. Typography

- Identify heading / body / monospace font stacks (computed `font-family`).
- Extract the type scale: h1–h3, body, small, micro `font-size` + `line-height`.
- Line length constraint (`max-width` or `ch` units).
- Letter spacing (`letter-spacing`).

### 3. Spacing

- Container maximum width.
- Rhythm / baseline grid (vertical spacing between modules).
- Gap / slot width (grid gap, component padding).
- Corner radius.

### 4. Layout

- Column count (CSS grid / template-columns, flex basis).
- Sidebar: presence, width, position (left/right), sticky.
- Header / Footer: height, positioning (fixed/sticky/static), background, border.
- Hero: presence, height, content structure.

### 5. Component Style

- Card: border/shadow/background, hover state, media ratio, meta layout.
- Nav: text/icon, size, case, spacing, active state, mobile mode.
- Button: variants (primary/secondary/ghost), radius, padding, hover/focus.
- Form: label position, input border/background, focus state, validation hint.
- Blockquote: left border / indent / font style / citation style.
- Code: inline / block, background, radius, line numbers, copy button.
- Pagination: layout, page-number style, active state, ellipsis.
- Breadcrumb, if present: separator, depth, clickable range.

### 6. Motion

- Entrance: type, duration, easing, stagger delay.
- Hover: color/transform/shadow transition.
- Scroll: parallax / reveal / header shadow.
- Focus: outline / offset / animation.
- Page transition: SPA or not, transition type.

### 7. Self-Hosted Fonts

- Identify `@font-face` or font service URLs.
- Extract font family, weight, format, subset.

## Handling Strategy

| Situation | Handling |
|-----------|----------|
| User provides a URL | WebFetch the HTML; fetch key CSS/JS as needed |
| User provides a screenshot description | Derive from the description; mark lower `confidence` |
| User provides a text description | Structure directly, no fetch needed |
| Cannot extract a field | Leave empty; later filled by user preference |
| Multiple reference sites merged | Analyze each separately, then merge by user-defined weights (confirm with user) |

## Output Requirements

- Output the full `design-intent.json` structure.
- `confidence` field indicates extraction confidence (0-1).
- `notes` record key observations, uncertainties, suggested follow-up.
- All values use CSS-compatible format (with units, `clamp()` etc.).

## Hint to AI

> You are a design system analyst. Extract **executable design specifications** from the reference site the user provides, not subjective descriptions. Each field must be directly translatable to CSS variables or component rules. When something is ambiguous, mark it and suggest asking the user.
