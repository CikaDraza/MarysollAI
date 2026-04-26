# Handoff: Marysoll Design System & Landing Page

## Overview
This bundle delivers the **Marysoll** design system (a Serbian-language beauty & wellness booking platform) and a high-fidelity landing-page prototype for organic SEO entry, plus a logged-in app prototype for the booking dashboard.

The system targets multiple cities (Novi Sad, Beograd, Niš, Bor) and supports a multi-page architecture where every URL like `/novi-sad/termini`, `/beograd/makeup`, `/bor/haircut` is a dynamic city/service page. The single landing page (this handoff) is the SEO root; promo/blog/post pages are generated from a separate landing engine.

## About the Design Files
The HTML/CSS/JSX files in this bundle are **design references** — high-fidelity prototypes that show the intended look, behavior, copy, and tokens. They are **not production code to ship verbatim**.

Your task is to **recreate these designs inside the target codebase** (`MarysollAI`, a Next.js + Tailwind project — see `src/` and `globals.css`) using its established patterns:
- Components live in `src/components/`
- Tokens already exist in `src/app/globals.css` (`--primary-color`, `--secondary-color`, brand fonts, etc.)
- Use Tailwind v4 utility classes plus the existing CSS variables, not the inline styles in the prototypes.
- Heroicons v2 outline 24/1.5 is already used in the codebase (`@heroicons/react/24/outline`) — never hand-roll SVG icons.

If the codebase already has a header/footer/AI sidebar shell, **do not duplicate it** — slot the new sections into that shell.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, copy, interaction states, and motion timings are final. Recreate pixel-perfectly using the codebase's existing libraries.

## Screens / Views

### 1. Landing page (`/` — SEO root)
- **Purpose**: Convert organic search visitors. Communicate that real-time appointment slots exist across multiple Serbian cities; route the user to a search, a category, or the AI assistant.
- **Layout**: Single column, max-width 1240px centered, padding `16px 24px 120px`. Sections stack vertically:
  1. Header (sticky-ish, rounded-22px white bar)
  2. Hero (centered, ~96px top padding)
  3. TrustRow (4 inline checked items)
  4. QuickAccess (4-col grid of category photo cards)
  5. AIPrompt (Maria avatar + "Pitaj asistenta" CTA bar)
  6. BookingWidget (2-col: copy + interactive widget)
  7. StickyOffer (fixed bottom-left, dismissible)
  8. AIDrawer (slides in from right when invoked)
- **No bottom AI dock on this page** — that lives only on app/post/promo pages.

### 2. Header
- White rounded-22px bar with `box-shadow: var(--shadow-sm)`
- Left: Marysoll SVG logo, height 28px
- Right (in order): Theme toggle (icon button, 38×38, rounded-full), `SR ⌄` pill, `📍 Novi Sad ⌄` pill, `Login` primary button (small), `✨ Pitaj Mariju` AI trigger (text-only, primary color)
- Pills: `background: #F4F4F6`, `font: 600 13px Changa`, `border-radius: 12px`, `padding: 9px 12px`. On hover: `background: var(--brand-100)`.

### 3. Hero (centered)
- **Eyebrow**: `Marysoll · Novi Sad · Beograd · Niš · Bor` — `font: 600 12px Changa`, `letter-spacing: .12em`, uppercase, color `var(--secondary-color)` `#BA34B7`.
- **H1**: Two-line headline using `Abril Fatface` display: `Slobodni termini` / `u salonima <span class="ms-script">danas</span>` — the word *danas* is in `Berkshire Swash` `var(--primary-color)` `#5D0156`. H1: `clamp(40px, 6.4vw, 72px)` / `line-height: 1.05` / `letter-spacing: -0.025em`.
- **Subhead**: `Pronađi masažu, tretman ili šišanje u svom gradu i rezerviši odmah — bez poziva, bez čekanja.` — `font: 400 19px/1.5 Changa`, color `var(--fg-2)` `#4B4B55`, `max-width: 620px`, centered.
- **Search input**: full-width within max 760px container, `border-radius: 20px`, white background, `box-shadow: var(--shadow-md)`, `padding: 10px 10px 10px 22px`. Search icon at left (Heroicons MagnifyingGlass, 20×20). Inline `Pretraži` primary button (md size). Placeholder: `Otkrijte i rezervišite stručnjake za lepotu i velnes u vašoj blizini`. Focus state: `box-shadow: 0 0 0 3px var(--brand-200), var(--shadow-md)`.
- **Secondary CTA row** (centered, below search): `✨ Pitaj asistenta` ghost button (lg) + meta text `ili izaberi kategoriju ispod`.
- **Background**: two soft radial blob gradients at 22% / 18% opacity (top-left and bottom-right), magenta → aubergine, blurred 80px.

### 4. TrustRow
- 4 inline items, single row, centered. Items: `Slobodni termini u realnom vremenu`, `Rezervacija bez poziva`, `Više salona na jednom mestu`, `Gotovo za 30 sekundi`
- Each: `✔` (color `var(--primary-color)`) + label, `font: 500 14px Changa`, color `var(--fg-2)`.

### 5. QuickAccess (categories)
- **Section head** centered: eyebrow `Brzi pristup`, H2 `Šta ti treba danas?`
- **4-col grid**, gap 16px, of category photo cards:
  - `Nokti` — *Manikir · Gel · Nail art* — image: nails-kikikiss.jpg
  - `Frizura` — *Šišanje · Farbanje · Feniranje* — image: haircut-shisham.png
  - `Masaža` — *Relaks · Sportska · Aroma* — image: gel-kikikiss.jpg
  - `Šminka` — *Dnevna · Večernja · Mladenačka* — image: makeup-belisimo.png
- **Card**: white, `border-radius: 22px`, `box-shadow: var(--shadow-sm)`, overflow hidden. Photo at top (180px tall, `background-size: cover`). Below photo: label `font: 700 18px Changa` and meta `font: 500 13px Changa` color `var(--fg-3)`. Padding: `14px 16px 2px` for label, `0 16px 16px` for meta.
- **Hover**: `transform: translateY(-3px)`, `box-shadow: var(--shadow-md)`, transition `.22s var(--ease-out)`.

### 6. AIPrompt bar
- `background: #FAF7FB` (lavender wash), `border: 1px solid var(--brand-100)`, `border-radius: 28px`, `padding: 22px 24px`. Flex row: 56×56 round Maria avatar + heading + subhead + push-to-right `Pitaj Mariju` primary button.

### 7. BookingWidget (interactive demo)
- 2-col grid (1fr 1fr) on ≥880px, single column below. Left: copy block. Right: white booking card with:
  - Header: `Novi termin` H3 + `Studio Lavanda` muted tag
  - Service select field (`Masaža leđa · 30 min` etc.)
  - Date input + duration variant chips (`30 min` / `45 min` / `60 min` / `90 min`) — active chip: `background: #111114`, color `#fff`, radius 12px
  - Slot grid (4 cols, times 09:00–15:00) — active slot: `background: var(--secondary-color) #BA34B7`, color `#fff`
  - Footer row: price (`font: 800 22px Changa`) + `Zakaži termin` dark CTA
- Card: `border-radius: 28px`, `padding: 22px`, `box-shadow: var(--shadow-lg)`.

### 8. StickyOffer (fixed bottom-left)
- Dark pill `background: #111114`, `border-radius: 20px`, `padding: 12px 14px 12px 12px`. 36×36 magenta bolt icon circle + 2-line text + close X. Dismissible. Hide when AI drawer is open.

### 9. AIDrawer (right slide-in, 420px max)
- Pinned right: `position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 92vw)`. Translates from `translateX(100%)` to `translateX(0)` over `.28s var(--ease-out)`.
- Head: avatar + `Marija` name + `Online` status (success green) + close button. Gradient from `#FAF7FB` → `#fff`.
- Body: chat bubbles (Maria left, user right). Maria bubble: `background: #F4F4F6`, `border-bottom-left-radius: 4px`. User bubble: `background: var(--primary-color)`, white text, `border-bottom-right-radius: 4px`.
- Suggestion chips strip above input: `background: #FAF7FB`, primary text, brand-100 border, pill shape.
- Input row: textarea (resize none, `background: #F4F4F6`, focus → white + outline `var(--secondary-color)`) + send button.

### 10. Booking-app dashboard (`/app` after login)
- Outer chrome with header (logo, nav: `Moji termini` / `Zakaži novi` / `Saloni`, avatar + name + logout)
- `/app` (default): Appointments list — `Predstojeći termini` (card grid, 260px min) + `Istorija` muted grid below
- `/app/book`: Inline calendar block with optional AI suggestion banner
- **Bottom AI dock** (fixed, blurred backdrop) — DO show this here, NOT on the landing.

### 11. Login card (`/auth`)
- Centered 420px white card, radius 28px. Tab row `Prijava` / `Registracija` (segmented). Standard form fields, full-width primary CTA, `Zaboravljena lozinka?` link.

## Interactions & Behavior
- **Theme toggle** in header swaps `[data-theme="dark"]` on `<html>`. Codebase already has dark-mode token flips in `globals.css`; the design extends them — see `colors_and_type.css` `@media (prefers-color-scheme: dark)` block.
- **Hero `Pretraži`** → scrolls to BookingWidget (smooth scroll). City pages may instead route to `/<grad>/termini?q=<query>`.
- **Hero `Pitaj asistenta`** / header `Pitaj Mariju` / AIPrompt CTA → opens AIDrawer.
- **QuickAccess cards** → on landing: scroll to BookingWidget. In production: route to `/<grad>/<kategorija>`.
- **BookingWidget** chips and slots toggle active state; price updates per service. `Zakaži termin` → if logged out, open auth modal; if logged in, post to booking API and show toast `Termin potvrđen za 14:00`.
- **AIDrawer** input: Enter sends, Shift+Enter newline. Send disables until non-empty.
- **StickyOffer**: dismiss sets `localStorage.marysoll_sticky_dismissed = '1'` (recommended) and hides for the session. Auto-hide while drawer is open.
- **Motion**: all transitions use `var(--ease-out)` `cubic-bezier(.2,.7,.2,1)`. Durations: hover/state `.18s`, drawer `.28s`, larger ambient `.38s`.

## State Management
- `theme: 'light' | 'dark'` (persist to `localStorage`, hydrate on mount)
- `drawerOpen: boolean`
- `stickyDismissed: boolean`
- `selectedService, selectedVariant, selectedDate, selectedSlot` for booking widget
- `chatMessages: { role: 'user' | 'maria', text: string }[]` and `chatLoading: boolean` for drawer; suggestion chips populate textarea on click

## Design Tokens
All tokens are defined in `colors_and_type.css` (and mirrored to `src/app/globals.css` in the codebase). Key values:

### Brand colors
- `--primary-color: #5D0156` (deep aubergine) — text, primary brand
- `--secondary-color: #BA34B7` (magenta) — interactive accents, buttons
- `--secondary-hover: #962992`
- Brand scale: `--brand-50 #fbf3fb`, `100 #f5e1f4`, `200 #e9bfe8`, `300 #d57ed3`, `400 #c454c1`, `500 #BA34B7`, `600 #962992`, `700 #761e74`, `800 #5D0156`, `900 #3d0138`

### Surfaces
- `--background: #F4F6F8`, `--surface: #ffffff`, `--surface-2: #FAF7FB`

### Text
- `--fg-1: #111114` (primary), `--fg-2: #4B4B55` (secondary), `--fg-3: #8A8A93` (muted)

### Borders
- `--border-1: #E7E5EA`, `--border-2: #D9D5DD`

### Radii
- 6 / 10 / 14 / 20 / 28 / 36 / 999

### Shadows
- `--shadow-sm: 0 2px 6px rgba(20,0,18,.06)`
- `--shadow-md: 0 8px 24px rgba(20,0,18,.08)`
- `--shadow-lg: 0 16px 48px rgba(20,0,18,.12)`
- `--shadow-brand: 0 12px 32px rgba(93,1,86,.18)`

### Typography
- `--main-font: 'Changa', system-ui, sans-serif` — load from Google Fonts, weights 200–800
- `--heading-font: 'Berkshire Swash', cursive` — used as romantic accent only, single words like *danas*, *Zovemo vas*
- `--display-font: 'Abril Fatface', serif` — used on hero H1; ship `fonts/AbrilFatface-Regular.ttf` from this bundle as `@font-face`
- Type scale: `--display-1 700 64px/1.05`, `--h1 700 40px/1.1`, `--h2 700 32px/1.15`, `--h3 600 24px/1.25`, `--body 400 16px/1.55`, `--caption 500 12px/1.4`, `--eyebrow 600 12px/1.2 + uppercase + .12em tracking`

### Motion
- `--ease-out: cubic-bezier(.2,.7,.2,1)`, `--dur-fast: 140ms`, `--dur-base: 220ms`, `--dur-slow: 380ms`

## Assets
All in `assets/` of this bundle:
- `logo.svg` — primary horizontal lockup
- `favicon.ico`
- `salons/nails-kikikiss.jpg`, `salons/gel-kikikiss.jpg`, `salons/makeup-belisimo.png`, `salons/haircut-shisham.png` — category card imagery
- `avatars/maria.png`, `avatars/claudia.png` — chat / user avatars
- `hero-image-marysoll.png`, `marysoll-assistant-hero.png` — additional hero illustrations available in the codebase

Plus `fonts/AbrilFatface-Regular.ttf` for the display face.

## SEO (landing only)
This page is the organic-SEO entry; other pages (city/category, blog, promo) get traffic from Google Maps, Instagram, TikTok, and email/newsletter campaigns. The landing's `<head>` ships:
- Title, description, keywords (Serbian, multi-city)
- `<link rel="canonical">`
- OpenGraph + Twitter card tags
- JSON-LD `WebSite` (with `SearchAction` template `https://marysoll.rs/pretraga?q={search_term_string}`)
- JSON-LD `Organization` (`areaServed: [Novi Sad, Beograd, Niš, Bor]`, Instagram + TikTok `sameAs`)
Reference: `ui_kits/landing/index.html`'s `<head>` block — copy verbatim into the Next.js `metadata` export and a JSON-LD `<Script>` in the page component.

## Files in this bundle
- `colors_and_type.css` — design tokens (truth source)
- `assets/` — logos, salon photos, avatars, favicon
- `fonts/` — Abril Fatface display font
- `ui_kits/shared/Icons.jsx` — Heroicons references used in prototypes (in production: `@heroicons/react/24/outline`)
- `ui_kits/landing/` — landing page prototype + components (Header, Hero, TrustRow, QuickAccess, AIPrompt, BookingWidget, StickyOffer, AIDrawer)
- `ui_kits/app/` — logged-in app prototype (AppShell, AppointmentsList, CalendarBlock, LoginCard, AIAgentDock)
- `README.md` — this document

## Implementation notes for the codebase
- **Header / footer / AI sidebar / appointment widget** are global chrome — implement once in `src/app/layout.tsx` (or a shared layout) and reuse across all city/service pages.
- **Hide the AI sidebar/dock on `/`** (the landing) per the brief; show it on every other page.
- The booking widget on the landing is a **demo** — live booking happens on city/service pages. Keep it interactive but non-persistent here.
- For `/<grad>/<kategorija>` pages: reuse `Header`, the same hero/category visual language, but populate from the landing-engine CMS. Server-render with `generateMetadata` per city+category for SEO.
- Don't translate strings to English — the product is Serbian (Latin). Imperative voice: *Pogledaj*, *Rezerviši*, *Zakaži*, *Pretraži*.
