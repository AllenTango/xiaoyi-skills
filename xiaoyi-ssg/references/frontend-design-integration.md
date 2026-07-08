# frontend-design Integration Notes for xiaoyi-ssg

> This file is a reference when generating the `assets/style.css` for an
> xiaoyi-ssg pipeline. It distills the most relevant patterns from
> frontend-design work into quick rules so a generated site looks credible
> on day one.

## Color tokens → CSS variables

Emit CSS custom properties at `:root` from `.xiaoyi-ssg-design-tokens.json`:

```css
:root {
  --color-bg: <color.bg>;
  --color-bg-alt: <color.bg-alt or color.surface>;
  --color-fg: <color.fg>;
  --color-fg-muted: <color.fg-muted or color.text-muted>;
  --color-accent: <color.accent>;
  --color-border: <color.border>;
  --font-sans: <typography.font-sans>;
  --font-mono: <typography.font-mono>;
  --text-base: <typography.base-size or "16px">;
  --leading-normal: <typography.line-height or "1.6">;
  --container-max: <layout.container>;
  --radius-base: <layout.radius>;
  --motion-fast: <motion.duration-fast>;
  --motion-base: <motion.duration-base>;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* dark-mode overrides if dark_mode === true in tokens */
  }
}
```

## Layout primitives

```css
.container { max-width: var(--container-max); margin-inline: auto; padding-inline: 1.5rem; }
.stack > * + * { margin-block-start: 1rem; }
.stack-lg > * + * { margin-block-start: 2rem; }
.flow > * + * { margin-block-start: var(--flow, 1rem); }
.grid { display: grid; gap: 1.5rem; }
@media (min-width: 768px) { .grid-2 { grid-template-columns: 1fr 1fr; } .grid-3 { grid-template-columns: repeat(3, 1fr); } }
```

## Hero / page-header

```css
.hero { padding-block: 4rem; text-align: center; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.1; }
.hero p { color: var(--color-fg-muted); max-width: 60ch; margin-inline: auto; }
```

## Card grid (post / project / doc)

```css
.cards { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.card { background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-base); padding: 1.25rem; transition: transform var(--motion-fast); }
.card:hover { transform: translateY(-2px); }
.card-meta { font-size: 0.85rem; color: var(--color-fg-muted); }
.card h2, .card h3 { margin-block: 0.4rem; }
.tags { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0; list-style: none; }
.tag { font-size: 0.75rem; padding: 0.15rem 0.5rem; border: 1px solid var(--color-border); border-radius: 999px; color: var(--color-accent); }
```

## Header / nav / footer

```css
.site-header { padding-block: 1rem; border-bottom: 1px solid var(--color-border); position: sticky; top: 0; background: var(--color-bg); }
.site-header .container { display: flex; align-items: center; justify-content: space-between; }
.site-title { font-weight: 700; text-decoration: none; color: var(--color-fg); }
.site-nav { display: flex; gap: 1.25rem; }
.site-nav a { text-decoration: none; color: var(--color-fg-muted); }
.site-nav a[aria-current="page"], .site-nav a.active { color: var(--color-fg); font-weight: 600; }
.site-footer { padding-block: 2rem; border-top: 1px solid var(--color-border); color: var(--color-fg-muted); font-size: 0.875rem; text-align: center; }
```

## Article body (post detail / doc detail)

```css
.prose { max-width: 70ch; margin-inline: auto; line-height: var(--leading-normal); }
.prose h2 { margin-block: 2rem 0.75rem; }
.prose h3 { margin-block: 1.5rem 0.5rem; }
.prose p { margin-block: 0 1rem; }
.prose code { font-family: var(--font-mono); background: var(--color-bg-alt); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.92em; }
.prose pre { background: var(--color-bg-alt); padding: 1rem; border-radius: var(--radius-base); overflow-x: auto; }
.prose pre code { background: none; padding: 0; }
.prose a { color: var(--color-accent); }
.prose ul, .prose ol { padding-inline-start: 1.5rem; margin-block: 0.5rem 1rem; }
.prose li + li { margin-block-start: 0.25rem; }
.prose blockquote { border-inline-start: 3px solid var(--color-accent); padding-inline-start: 1rem; color: var(--color-fg-muted); }
```

## Dark mode toggle (CSS only)

```css
:root[data-theme="dark"] {
  --color-bg: <color.bg-dim>;
  --color-bg-alt: <color.bg-alt-dim>;
  --color-fg: <color.fg-light>;
  --color-fg-muted: <color.fg-muted-light>;
  --color-border: <color.border-light>;
}
```

JS toggle (in `assets/script.js`):

```js
const root = document.documentElement;
const stored = localStorage.getItem('theme');
if (stored) root.dataset.theme = stored;
else if (matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
document.querySelector('[data-action="theme-toggle"]')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
});
```

## Accessibility baseline (must ship)

- `<html lang="...">` set from `site.language`
- `<a class="skip-link" href="#main">` at top of body, hidden until focused
- One `<h1>` per page
- `<nav aria-label="...">` for each nav region
- `<time datetime="YYYY-MM-DD">` for dates
- Form fields with `<label>`
- `:focus-visible { outline: 2px solid var(--color-accent); }`
- Respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  ```

## Common pitfalls

- Forgetting `min-height` on `<main>` makes short pages collapse the footer up.
- Using `vh` units for full-bleed sections breaks on iOS Safari (use `dvh` or `svh`).
- Inline SVGs without `aria-hidden="true"` pollute the accessibility tree.
- Hex colors with alpha `#fff8` won't validate — use `color-mix(in srgb, var(--color-fg) 50%, transparent)` or `rgb(from var(--color-fg) r g b / 50%)`.
- `:focus { outline: none }` without a replacement violates WCAG 2.4.7.

## Inspiration sources to draw from

When the user mentions a reference site, prefer to extract: color palette, font pairing, hero layout, card density, nav style, footer tone. Do not copy markup verbatim — only the design intent. Feed the intent through `prompts/design-system-extraction.md`.