# Design system — « Deux lumières »

The app is a shared space for two people. The page background is two soft lights —
amber (partner A, `userId % 2 === 0`) and teal (partner B) — meeting behind frosted
glass. Apple/Google feel: native system sans for UI, translucent materials, pill
controls, large titles. One bold thing (the two-light backdrop seen through glass);
everything else quiet.

## Principles

1. **Blur only what floats, and only where it pays.** `backdrop-filter` is re-run on
   every scroll frame for anything over moving content, so: nav bar → light
   `--blur-nav`; dialog/login sheets → `--blur` (static, shown briefly); sticky
   headers and small controls over scrolling content (zoom buttons) → near-opaque
   `--glass-bg-dense`, no blur; dialog `::backdrop` → dim only, no blur. Content
   panes and cards use a frosted _fill_ (translucent background + light border), no
   blur — keeps long lists cheap.
2. **Radius follows hierarchy.** Small things inside cards `--radius-sm`, controls
   `--radius-md`, cards/panes `--radius-lg`, floating sheets/nav `--radius-xl`,
   buttons/chips/toggles `--radius-pill`. Never one radius everywhere.
3. **Serif for what we wrote, sans for the app.** `--font-serif` (Newsreader) for page
   large titles, entry titles, year headings, journal prose (textarea + rendered
   text). `--font-sans` (system: SF Pro on Apple, Roboto on Android) for everything
   else: nav, buttons, labels, metadata.
4. **No decoration.** Sentence case everywhere (no all-caps labels, no letter-spaced
   eyebrows). No entrance animations. Motion only answers an action (press, toggle).
5. **Partner colors mean authorship only** (`--author-a`, `--author-b`). The action
   accent is `--color-accent` (blue). Don't mix them.

## Tokens (defined in `src/app.css`)

| Token | Light | Dark |
|---|---|---|
| `--bg-base` | `#edf0f5` | `#0d1015` |
| `--light-a` (amber glow) | `rgb(245 166 35 / 0.32)` | `rgb(217 119 6 / 0.20)` |
| `--light-b` (teal glow) | `rgb(20 184 166 / 0.28)` | `rgb(13 148 136 / 0.20)` |
| `--color-text` | `#171a21` | `#eceff4` |
| `--color-text-muted` | `#596070` | `#9aa3b2` |
| `--color-accent` | `#1f5eff` | `#7fa6ff` |
| `--color-accent-contrast` | `#ffffff` | `#0d1015` |
| `--color-accent-soft` (selected chips, active nav) | `rgb(31 94 255 / 0.12)` | `rgb(127 166 255 / 0.16)` |
| `--color-danger` / `--color-important` | `#d92d20` | `#ff7a6e` |
| `--author-a` | `#b45309` | `#f59e0b` |
| `--author-b` | `#0f766e` | `#2dd4bf` |
| `--glass-bg` (floating chrome) | `rgb(255 255 255 / 0.62)` | `rgb(24 28 36 / 0.58)` |
| `--glass-bg-dense` (sticky headers, controls over scrolling content; no blur) | `rgb(247 248 250 / 0.96)` | `rgb(26 30 38 / 0.96)` |
| `--surface` (= `--color-surface`, panes/cards) | `rgb(255 255 255 / 0.72)` | `rgb(255 255 255 / 0.06)` |
| `--surface-strong` (inputs, secondary buttons) | `rgb(255 255 255 / 0.88)` | `rgb(255 255 255 / 0.10)` |
| `--glass-border` (pane edge highlight) | `rgb(255 255 255 / 0.70)` | `rgb(255 255 255 / 0.10)` |
| `--color-border` (control edges) | `rgb(23 26 33 / 0.14)` | `rgb(255 255 255 / 0.16)` |
| `--hairline` (dividers) | `rgb(23 26 33 / 0.08)` | `rgb(255 255 255 / 0.08)` |
| `--shadow-pane` | `0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.05)` | `0 1px 2px rgb(0 0 0 / 0.3)` |
| `--shadow-float` | `0 10px 40px rgb(15 23 42 / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.6)` | `0 10px 40px rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.06)` |
| `--blur` (sheets: dialogs, login) | `saturate(180%) blur(24px)` | same |
| `--blur-nav` (nav bar) | `blur(16px)` | same |
| `--radius-sm/md/lg/xl/pill` | `10px / 14px / 20px / 28px / 999px` | same |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', Roboto, 'Segoe UI', system-ui, sans-serif` | |
| `--font-serif` | `'Newsreader Variable', Newsreader, 'Newsreader Fallback', Georgia, serif` | |

Legacy aliases kept so existing components keep working: `--color-bg` = `--bg-base`,
`--color-surface` = `--surface`.

Fallbacks: under `@media (prefers-reduced-transparency: reduce)` and
`@supports not (backdrop-filter: blur(1px))`, `--glass-bg`/`--glass-bg-dense`/`--surface`
become opaque (`#f7f8fa` light / `#1a1e26` dark) and `--blur`/`--blur-nav` are dropped.

Fonts: the root layout preloads Newsreader's Latin woff2 (the same hashed asset the
`@font-face` uses). `'Newsreader Fallback'` is local Georgia with
`size-adjust`/`ascent-override`/`descent-override` matched to Newsreader, so the swap
barely shifts layout.

## Type scale

Body 1.0625rem (17px) / 1.5. Meta 0.8125rem. Secondary 0.9375rem.
Large title (page `h1`): serif, 600, 2.25rem mobile / 2.75rem ≥1024px, line-height 1.1,
letter-spacing -0.01em. Section title (`h2`): serif 600 1.375rem. Card/entry title:
serif 600 1.125rem. Journal prose: serif 1.125rem / 1.65. Line length ≤ 70ch.

## Global elements (from `src/app.css`, components should not restyle these)

- `body`: `--bg-base` plus a `body::before` fixed layer (inset 0, z-index -1) with
  two radial gradients: `--light-a` at top-left, `--light-b` at bottom-right
  (~60vmax each). Fixed layer, not `background-attachment: fixed` (iOS ignores it).
- `button`, `a.btn`: pill, min-height 44px, padding `0 1.125rem`, weight 600,
  `--surface-strong` bg, 1px `--color-border`, text `--color-text`. Press: `scale(.97)`
  120ms. `.btn-primary` / `button[type=submit]`: `--color-accent` bg,
  `--color-accent-contrast` text, no border. `.btn-danger`: danger text.
  `.btn-ghost`: transparent bg, no border.
- `input`, `select`, `textarea`: `--radius-md`, `--surface-strong` bg, 1px
  `--color-border`, padding `0.625rem 0.875rem`; focus: border accent + ring.
- `:focus-visible`: `outline: 2px solid var(--color-accent); outline-offset: 2px`.
- `.pane`: `--surface` bg, 1px `--glass-border`, `--radius-lg`, `--shadow-pane`,
  padding 1rem (1.25rem ≥768px).
- `.glass`: `--glass-bg` + `backdrop-filter: var(--blur)` + `--shadow-float` +
  1px `--glass-border`. Floating only.
- `.chip`: pill, min-height 44px (visual 36px OK via padding if hit area ≥44),
  `--surface` bg; `[aria-pressed=true]` / `.selected`: `--color-accent-soft` bg,
  accent text.
- `.page`: `max-width: 1120px; margin-inline: auto; padding: 1.5rem 16px 2rem`
  (24px sides ≥768px). `.page-narrow`: same with `max-width: 720px`.
- Motion: everything under `@media (prefers-reduced-motion: reduce)` disables transforms
  and transitions.

## Components

- **Nav**: mobile → fixed floating capsule, `left/right: 12px`,
  `bottom: calc(12px + env(safe-area-inset-bottom))`, `--radius-xl`, `.glass` look with
  `--blur-nav`, six items each with a 22px inline SVG icon (`aria-hidden`, stroke 1.75)
  above a 0.6875rem label; active = accent text + `--color-accent-soft` pill. Desktop (≥1024px) →
  sticky top capsule centered (`margin: 12px auto 0; width: fit-content`), labels only,
  active = `--surface-strong` filled pill.
- **FAB « Ajouter »**: `.btn-primary` pill + `--shadow-float`, floats above the mobile
  nav (bottom = nav height + 24px).
- **Cards** (timeline items, search results, trash rows, occurrence rows): `.pane`
  look with `--radius-lg`; title serif.
- **Dialogs/lightbox**: backdrop `rgb(0 0 0 / 0.35)`, no blur;
  sheet `.glass` `--radius-xl`.
- **Calendar author markers**: `--author-a` / `--author-b`.
