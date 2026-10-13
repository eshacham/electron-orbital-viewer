# Phase 6G — QuantumLab visual redesign: design

**Date:** 2026-10-13. **Status:** design for the owner's review. The owner's
directions and the controller's decisions (listed in §0) are binding; the
remaining product and design calls are the developer's and are made here.
**Branch:** `design/quantumlab-redesign` (from
`origin/design/quantumlab-deep-space-light-clean`, app code as of `de690ad`).
This branch is docs only and will be rebased onto `main` after Phase 6D lands.

**Visual target:** `docs/quantumlab/references/theme-comparison.png` (Option A
"Deep Space", Option B "Light Clean", Molecule Builder, Learning Center, Admin
Dashboard; Option C "Aurora" was *not* chosen) and
`docs/quantumlab/references/original-concepts.png` (Dark Modern atom view,
Light Clean atom view, Cinematic molecule view, Learning Center, Admin). Both
are 1536 × 1024 mock-ups. Each panel is drawn at roughly 0.39× of a 1440 px
screen, so the proportions, colours and component shapes below are taken from
them, not their absolute pixel sizes.

**Supersedes:** the foundation on this branch (`src/design/*`,
`docs/quantumlab/IMPLEMENTATION.md`, `kit/apply_to_checkout.py`). Its themes
were not sampled from the concepts, it used two storage keys, and the kit
script's string anchors break as soon as `App.tsx` changes. §6 replaces it.

## 0. Binding inputs

**Owner:**
- The result looks like the concepts, at least in colours and visuals:
  Deep Space is the dark theme, Light Clean the light theme, and the Molecule,
  Learning and Admin panels are the targets for those screens. It should be
  cool, beautiful, easy to use, consistent and professional.
- The concepts' UI elements are a concept. **All** existing functionality
  stays. The layout follows the concepts; every panel keeps its purpose and
  gets a new UI.
- "Gallery" means the public library molecules that ship with the app.
  Renaming is the developer's call.
- No invented data, metrics or dead links. No "Projects" until accounts
  exist. Admin shows only real numbers.
- The brand is switchable (§5). The candidates are QuantumLab (default),
  AtomVista, NovaLab, LearnLab and MoleculeForge, each with its two-tone
  wordmark. The owner chooses with an owner-only selector, and production
  keeps one default until the owner picks a domain.

**Controller:** two themes (default from `prefers-color-scheme`, one
localStorage key `eov.theme`, never in share links, read by both entries,
switched from the top bar); the desktop layout of §7–§8; 3D visuals that match
the concepts' glowing translucent look without changing the science (§11);
a Gallery page (§9.5); a themed Admin with real KPI cards that keeps its own
bundle (§9.7); WCAG AA in both themes, keyboard access and reduced motion
(§13); thumbnails from a shared renderer or build-time images, with no second
WebGL context per thumbnail (§12); side-by-side screenshot verification
(§14); and delivery as 6G-1/6G-2/6G-3, each deployed (§16).

## 1. Goal

A visitor opening the app sees the concept: a polished scientific workstation
in a Deep Space or Light Clean theme, with a top bar, a mode rail, an Explore
panel, a large glowing 3D view with its title, axes, key and orbital strip,
and a data inspector. Everything the app can do today is still there and
easier to find. Nothing on screen is decoration that could be read as data,
and every colour on the 3D view says what it means.

## 2. Scope

**In:**
1. Design tokens for both themes, sampled from the concepts (§4).
2. Switchable brand (§5) and theme mechanics (§6).
3. The app shell: top bar with real search, mode rail, Explore panel,
   viewport frame and inspector, at desktop, tablet and phone sizes (§7–§8).
4. Re-composed screens for Atoms, Basic Orbitals, Bonds and Molecules (with
   the jobs panels), plus new Gallery and Learning screens and a re-composed
   Admin (§9).
5. The 3D look: phase palette, translucent glow, theme backgrounds, axes,
   keys and a Classic option, with an exact before/after mapping (§11).
6. Thumbnails for the orbital strip and the Gallery (§12).
7. Small additions that the concept layout needs, each real and tested:
   - standard atomic weights for the element tile;
   - the electron count on the tile, so ions read correctly;
   - R(r) and |R(r)|² plot tabs beside today's radial distribution;
   - a computed "orbital facts" card;
   - structure-only and space-filling molecule views;
   - bond lengths and angles drawn on the model;
   - a Show axes preference.

**Out:**
- Projects and user accounts (Phase 8).
- Vibration and Analysis tools (they appear when Phases 6E and 6B-4 ship).
- Bloom post-processing (§11.4).
- A starfield or textured background, a decorative nucleus (a real one is
  about 10⁻⁵ a₀ across), and "Show nodes" or "Model type ψ / |ψ|²" toggles,
  which the renderer does not have.
- Admin Users, Models, Storage, System and Settings views (no data exists).
- Quizzes, guided tours and playback speed in Learning.
- The methods page, citation, embed, compare view and PWA (they stay in
  Phase 7).
- Any change to the solvers, workers, isosurface levels, enclosed fractions,
  jobs API, billing or Cognito.

## 3. Principles

1. **The science is fixed.** Isosurface values, enclosed fractions, the meaning
   of phase, legends, captions, orbital labels, method strings and every
   number stay exactly as they are. The redesign changes only how things look
   and where they sit.
2. **One canvas.** There is one `WebGLRenderer`, created once and never
   remounted by a theme, brand, layout or screen change. Thumbnails reuse it
   (§12).
3. **Every colour is labelled.** Any hue on the 3D view, in a plot or in a
   thumbnail has a key on screen or in its accessible name.
4. **Tokens are the single source.** `src/design/tokens.ts` holds every colour,
   size and shadow for both themes. CSS custom properties, the MUI theme, the
   renderer's appearance and the contrast tests all read it.
5. **Real or absent.** A control, card, number or link exists only if it does
   something real. The concept's Projects, Users, Storage, Quizzes, playback
   speed, Settings gear and "1,482 models" are not built.
6. **The layout contract (§3.8 of the earlier specs) is amended, not
   dropped.** Desktop navigation sits on the left (rail + Explore), view data
   on the right (inspector). The phone uses `.phone-header` plus `PhoneSheet`.
   The viewport frame adds fixed overlay zones (title, toolbar, key column,
   strip, §8.5). Each zone is measured as a camera inset, so the camera never
   frames the object under one, and nothing else floats over the canvas.

## 4. Design tokens

All values live in `src/design/tokens.ts` as `TOKENS.dark` and
`TOKENS.light`. `src/design/tokens.css` is generated from that file
(`node tools/design/gen_tokens.mjs`) and checked in, so the first paint is
already themed; a test fails if the two differ. Names are `--ql-<group>-<role>`.

### 4.1 UI colour

"Sampled" is the median, or the extreme, of the concept pixels at that
element. The token is the chosen value, moved only where needed to pass AA.
The contrast column is against the token it sits on.

**Deep Space (dark)**

| Token | Sampled from concept A / Molecule | Token value | Use, contrast |
|---|---|---|---|
| `bg-app` | page/viewport `#021020`, `#010d1a` | `#020F1D` | page, gutters |
| `bg-bar` | top bar `#010c18` | `#010B17` | top bar, rail |
| `surface-1` | panel `#010f1c`–`#01121e` | `#071828` | Explore, inspector, cards |
| `surface-2` | select `#081a27`, segment `#091a29` | `#0B1C2D` | inputs, segments, thumb tiles |
| `surface-3` | element tile `#142537`, search `#112132` | `#13263B` | hover, element tile, search |
| `border-subtle` | divider `#152c3c` | `rgba(110,160,220,.16)` | panel and card edges |
| `border-strong` | tile edge `#1b304d` | `#2B4A6B` | inputs, segments (2.1:1, decorative) |
| `text-1` | title `#fcfcfb` | `#F2F6FA` | primary text, 16.5:1 on `surface-1` |
| `text-2` | subtitle `#cfd3d4`, tab `#bbcbd4` | `#C3CFDB` | secondary, 11.3:1 |
| `text-3` | rail label `#9aacbe` | `#93A6BA` | tertiary, captions, 7.2:1 |
| `accent` | checkbox `#087dfa`/`#2a85f8`, slider `#0486fc` | `#2A85F8` | checkbox, slider, icons (non-text 5.0:1) |
| `accent-text` | — | `#4C9BFF` | links and accent text, 6.4:1 |
| `accent-fill` | primary-button blue | `#1E5BD8` | primary button; white text 5.9:1 |
| `selected-fill` | 2p_z fill `#1425af`, 2p fill `#013b95` | `#0E3A99` | selected chip, segment, rail item; white 10.4:1 |
| `selected-edge` | segment edge `#11abf3`, underline `#1fb6f5` | `#1FB6F5` | selected edge, tab underline, focus ring (8.3:1) |
| `rail-active` | rail pill `#1a55d1`→`#02266a` | `linear-gradient(180deg,#123E9C,#0A2A6B)` | rail active pill |
| `avatar` | `#0661f9` | `#1E5BD8` | avatar disc |
| `success` / `warning` / `danger` | — | `#34D399` / `#FBBF24` / `#F87171` | status, 9.3 / 10.8 / 6.5:1 |
| `learn-accent` | LearnLab selection `#3726cc`, `#423de2` | text `#A78BFA`, fill `#5B3FD9` | Learning screen only; 6.9:1, white on fill 6.7:1 |
| `canvas` | viewport `#021020` with lighter centre | `radial-gradient(ellipse 70% 60% at 50% 45%, #0A1F3A 0%, #04142A 45%, #020C19 100%)` | 3D view backdrop |

**Light Clean (light)**

| Token | Sampled from concept B / Admin | Token value | Use, contrast |
|---|---|---|---|
| `bg-app` | page `#f4f8fc` | `#F4F7FB` | page |
| `bg-bar` | top bar `#f9fafd` | `#FFFFFF` | top bar, rail |
| `surface-1` | panel `#f8fafd`, card `#fdfcfc` | `#FFFFFF` | panels, cards |
| `surface-2` | segment interior | `#F1F5FA` | inputs, segments, thumb tiles |
| `surface-3` | rail active `#cbe2fe` | `#E3EEFE` | hover, rail active |
| `border-subtle` | divider `#e3e8f3`, card `#e9eff6` | `#E3E9F2` | panel and card edges |
| `border-strong` | segment edge `#d6d9dc` | `#B8C4D6` | inputs, segments |
| `text-1` | title `#03051a`, KPI `#05050a` | `#0B1220` | 18.7:1 on white |
| `text-2` | body label `#5d6577` | `#475467` | 7.7:1 |
| `text-3` | subtitle `#7e8daa` (3.4:1, fails AA) | `#5B6880` | 5.6:1, 5.2:1 on `bg-app` |
| `accent` | segment `#046efa`, checkbox `#0066fe` | `#1662E0` | controls; 5.4:1, white on it 5.4:1 |
| `accent-text` | — | `#1559D6` | links, 6.1:1 |
| `selected-fill` | `#1878fd` | `#1662E0` | selected chip; white 5.4:1 |
| `selected-edge` | thumb edge `#498efd` | `#1662E0` | selected edge, focus ring |
| `success` / `warning` / `danger` | KPI green `#4bd585`, red `#fb3e44` (both fail AA) | `#15803D` / `#B45309` / `#B42318` | 5.0 / 5.0 / 6.6:1 |
| `learn-accent` | — | text and fill `#6D28D9` | 7.1:1 |
| `canvas` | viewport `#f8fafd` | `radial-gradient(ellipse 70% 60% at 50% 45%, #FFFFFF 0%, #F6F9FD 60%, #EEF3F9 100%)` | 3D view backdrop |

**Plot chrome** (radial plot, Bonds curve, admin chart): dark grid
`rgba(150,180,220,.12)` and axes `text-3`; light grid `#E6ECF4` and axes
`#5B6880`. Curve colours are science colours (§4.2).

### 4.2 Science colours (separate from the UI)

These encode meaning. They are not UI accents. §11 maps each one from before
to after.

| Role | Deep Space | Light Clean | Classic (both themes) |
|---|---|---|---|
| ψ > 0 surface | `#FF7A2F` | `#E8590C` | `#FF0000` (today's) |
| ψ < 0 surface | `#2F6BFF` | `#1F5FE0` | `#0000FF` (today's) |
| ψ > 0 rim (glow) | `#FFC59A` | `#9A3412` | none |
| ψ < 0 rim (glow) | `#9CC2FF` | `#1E3A8A` | none |
| Total density surface | `#C9D6E8` | `#7A8AA0` | `#CFD8DC` (today's) |
| Cut-face density ramp ("Density" scheme) | 6 stops: `#16245E` `#3541B8` `#9C3FA8` `#E8644E` `#F9B97A` `#FBEBCF` | same | — |
| ESP map | ColorBrewer RdBu, unchanged | unchanged | unchanged |
| Shell/subshell curve palette | today's `CURVE_COLORS` | light variant, same order and hue family: `#1D6FE0` `#D93A3A` `#B7791F` `#0F9D76` `#8B46D6` `#D9661F` `#C2328F` `#5B6880` | today's |
| Axes | lines `#4F86FF` at 70 %, labels `text-1` | lines `#8090A8`, labels `text-1` | today's red/green/blue |
| CPK atom colours | unchanged | unchanged | unchanged |

Checks behind these choices:
- **Phase pair.** CIELAB ΔE between + and − is 142 (dark) and 137 (light).
  Under simulated deuteranopia, protanopia and tritanopia (Machado 2009) it
  is ≥ 99 and ≥ 112. L* differs too (66 against 50; 56 against 44), so the
  pair still separates in greyscale.
- **Density ramp.** L* rises strictly from 16.7 to 93.6 under normal vision
  and under all three simulations (the smallest step is 2.4 L* under
  protanopia). Its hues follow the concept's Low→High bar (sampled
  `#2399f2` → `#5441d7` → `#97387c` → `#d74f3b` → `#f3834b` → `#f7c488` →
  `#f4eedc`), but the dark end is moved so the ramp is monotonic. The
  concept's own bar is not.
- **Light curve palette.** Every colour is ≥ 3:1 against white, as required
  for graphics. Index identity is kept: 3d is the same index in the plot and
  on the 3D view in both themes.

### 4.3 Typography

Inter Variable, self-hosted (`@fontsource-variable/inter`, OFL), replaces
Roboto from Google Fonts. That removes a third-party request. The fallback is
`system-ui, -apple-system, "Segoe UI", sans-serif`. Numbers in tables,
readouts and KPIs use `font-variant-numeric: tabular-nums`. Sizes are derived
from the concepts' ratios: the title is about 1.6× the body, nav and tabs
about 1.1×, rail labels about 0.85×.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| `wordmark` | 20 / 24, −0.01em | 600 | brand in top bar |
| `title` | 20 / 28 | 600 | viewport title ("Carbon — 2p_z orbital"), page h1 |
| `kpi` | 28 / 34 | 600 | admin KPI values |
| `section` | 14 / 20 | 600 | panel section heads ("Subshell") |
| `nav` | 14 / 20 | 500 | top-bar tabs, panel tabs |
| `body` | 13 / 20 | 400 | controls, labels, lists |
| `subtitle` | 13 / 18 | 400, `text-2` | viewport subtitle |
| `caption` | 12 / 16 | 400, `text-3` | helper text, method notes, chart ticks (11) |
| `rail` | 11 / 14 | 500 | rail labels under icons |

On a phone, body is 14 and captions 12. Nothing is smaller than 11 px.

### 4.4 Spacing and sizing

- **Grid.** 4 px base; the scale is 4, 8, 12, 16, 20, 24, 32.
- **Panels.** Padding 16. Section gap 16. Label-to-control gap 6. Control
  rows 28 apart (checkbox lists).
- **Control heights.** Chips and segments 32 (desktop), inputs and selects
  36, top-bar search 36, top bar 56, phone touch targets 44.
- **Element tile.** 88 × 96.
- **Thumbnail tiles.** 72 × 72 image plus a 16 px label (desktop), 56 × 56
  (phone).
- **Icons.** 20 px in the rail and toolbar, 18 in buttons.

### 4.5 Radii

`xs` 4 (checkbox), `sm` 6 (chips, tooltips, tags), `md` 8 (inputs, segments,
buttons, thumbnail tiles), `lg` 12 (cards: element tile, KPI, Gallery card),
`xl` 16 (panels, viewport frame, phone sheet), `pill` 999 (avatar, status
chips).

### 4.6 Elevation and glow

**Dark:**
- Panels have no drop shadow: a `border-subtle` edge plus
  `inset 0 1px 0 rgba(255,255,255,.03)`.
- Selected chips, rail items and thumbnails:
  `0 0 0 1px #1FB6F5, 0 0 12px rgba(31,182,245,.35)`. This is the concept's
  cyan halo.
- Popovers and menus: `0 12px 32px rgba(0,0,0,.45)`.

**Light:**
- Panels: `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)`.
- Popovers: `0 12px 24px rgba(16,24,40,.12)`.
- Selected items: `0 0 0 1px #1662E0`. There is no glow in Light Clean.

Under `prefers-reduced-motion` glows stay (they are static). Only movement is
removed (§4.7).

### 4.7 Motion

| Movement | Normal | Reduced motion |
|---|---|---|
| Hover, press | 120 ms ease-out | 0 ms |
| Tab underline, panel collapse, sheet | 180 ms ease-out | 0 ms |
| Strip scroll | smooth | instant |
| Shell↔orbital cross-fade, camera tween | as today | as today (already honour reduced motion) |

Nothing pulses, breathes or auto-rotates.

### 4.8 Iconography

Material Symbols "Outlined" from `@mui/icons-material` (already a
dependency). Four custom 20 px SVGs drawn on the same grid: Atoms (nucleus
with three orbits), Basic Orbitals (a p dumbbell), Bonds (two spheres joined
by a stick) and Molecules (three spheres). The brand mark is a redrawn
`public/electron-icon.svg`: an atom with three orbit rings and a glowing core
in `accent` → `selected-edge`. It is also the favicon.

## 5. Branding

**Decision.** The brand is data: `src/design/brands.ts`.

```ts
export interface Brand {
  id: 'quantumlab' | 'atomvista' | 'novalab' | 'learnlab' | 'moleculeforge';
  name: string;                       // "QuantumLab"
  parts: [string, string];            // ["Quantum", "Lab"] -- the two-tone split
  accent: { dark: string; light: string }; // CSS colour or gradient for parts[1]
}
export const BRANDS: readonly Brand[] = [
  { id: 'quantumlab',    name: 'QuantumLab',    parts: ['Quantum', 'Lab'],
    accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: 'linear-gradient(90deg,#3A4BE8,#7B3FE4)' } },
  { id: 'atomvista',     name: 'AtomVista',     parts: ['Atom', 'Vista'],
    accent: { dark: '#5AA9FF', light: '#1559D6' } },
  { id: 'novalab',       name: 'NovaLab',       parts: ['Nova', 'Lab'],
    accent: { dark: '#5CC8DE', light: '#0E7490' } },
  { id: 'learnlab',      name: 'LearnLab',      parts: ['Learn', 'Lab'],
    accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: '#6D28D9' } },
  { id: 'moleculeforge', name: 'MoleculeForge', parts: ['Molecule', 'Forge'],
    accent: { dark: 'linear-gradient(90deg,#B05CF0,#D946EF)', light: '#A21CAF' } },
];
export const DEFAULT_BRAND_ID: Brand['id'] = 'quantumlab';
```

**Where the accents come from.** "Lab" in Option A samples at `#9456c0`–`#8f4bbe`
(anti-aliased, darker than the true stroke). "Forge" samples at `#ab3ac4`,
"Vista" at `#0a33ee` and NovaLab's "Lab" at `#64bace`. The tokens are the
same hues at full intensity.

**Rendering and contrast.** The first part renders in `text-1`, the second in
the accent (gradient text via `background-clip:text`, with a solid fallback
colour equal to the gradient's first stop). The wordmark is 20 px semibold.
Every gradient stop and solid accent is held to 4.5:1 against `bg-bar`
(dark: 4.9–9.7:1; light: 5.4–7.1:1), and a test pins this.

**Choosing a brand.**
- `useBrand()` resolves the brand from localStorage `eov.brand`, then from
  `DEFAULT_BRAND_ID`.
- Only the owner can change it: a "Brand preview" radio list in the avatar
  menu, shown only while `selectIsOwner`. On the dev server only
  (`import.meta.env.DEV`), `?brand=<id>` also sets it, for quick screenshots.
- The setting previews names in that browser and changes nothing for anyone
  else.
- An unknown id falls back to the default. The brand is never written into a
  share link.

**Where the brand appears.**
- Top bar wordmark and brand mark.
- `document.title`: `"<view title> · <brand.name>"` in the viewer (for
  example "Carbon — 2p_z orbital · QuantumLab"), and
  `"Owner dashboard · <brand.name>"` in admin. The static `<title>` in both
  HTML files is the default brand's name.
- Admin header.
- Help → About.
- Export metadata: the PNG caption footer, and the STL header, glTF scene name
  and cube title. These become `"<brand.name> (electron-orbital-viewer)"`;
  the repository id is kept for traceability, and the STL header stays within
  80 bytes.

**Production default.** `DEFAULT_BRAND_ID` is the one value production shows
until the owner picks a domain, and changing it is a one-line change.

**Learning sub-brand.** **Decision:** the Learning screen's header shows the
chosen brand's wordmark followed by a "Learn" tag (12 px semibold,
`learn-accent` fill, white text, radius `sm`): "QuantumLab · Learn",
"AtomVista · Learn". When the brand is LearnLab itself the tag is omitted, so
it never reads "LearnLab Learn". The rail and tab label stays the plain word
"Learning".

## 6. Theming mechanics

1. **Storage.** One key, `eov.theme`, set to `'dark'` or `'light'`. If it is
   absent, the theme follows `prefers-color-scheme` live (a `change`
   listener).
   - On first load, the foundation's two keys (`eov.quantumlab.theme` and the
     kit's `eov-color-theme`) migrate into `eov.theme` and are deleted.
   - If localStorage is unavailable (Safari private mode), the choice lasts
     the session in memory.
   - The `storage` event keeps open tabs and `/admin.html` in step.
2. **No flash.** A six-line inline script in `public/index.html` and
   `public/admin.html` (there is no CSP today; if one is added, this script's
   hash goes in it) sets `<html data-theme>` and `color-scheme` before CSS
   loads. `tokens.css` defines both `[data-theme]` blocks.
3. **React.** `useQuantumTheme()` (rewritten) returns
   `{ mode, choice, setChoice }` with `choice ∈ dark | light | system`, and
   `quantumTheme(mode)`, a MUI theme built from `TOKENS[mode]`. That theme
   includes palette, typography, shape and component overrides scoped to the
   design system's classes, with no blanket `.Mui*` rewrites. Both
   `main.tsx` and `admin/main.tsx` use it. `src/theme.ts` (`appTheme`) is
   removed after a dependency search and its tests move to tokens.
4. **Switch.** A top-bar icon button (sun or moon) with the accessible name
   "Theme: Deep Space" opens a three-item menu: Deep Space, Light Clean, Match
   system. It is the same component in admin.
5. **Never in a link.** `encodeStateOf` is untouched. A test asserts the share
   URL is byte-identical before and after a theme or brand switch.
6. **Renderer.** `OrbitalViewer` passes `appearance = { theme, scheme,
   surface, showAxes }` to `orbital_visualizer.setAppearance()`, which updates
   material uniforms, vertex-colour palettes, axes and the shell palette
   texture **in place**: no remount, no re-mesh, no camera change.
   - The WebGL canvas is transparent (`alpha: true`, `premultipliedAlpha:
     true`, `scene.background = null`). The viewport cell paints the
     `canvas` gradient token behind it.
   - Export composites onto the theme's solid canvas colour (`#04142A` dark,
     `#F7F9FC` light), so a PNG never comes out with a transparent hole.
7. **Presentation preferences**, all in localStorage and never in links:
   - `eov.render` holds surface style (`glow | solid | wireframe`) and scheme
     (`phase | density | classic`).
   - `eov.display` holds `showAxes` and the radial plot tab.

## 7. Layout grid per breakpoint

The breakpoint names follow `useMediaQuery.ts`. `NARROW_VIEWPORT` (the phone
layout) is unchanged. `MEDIUM_VIEWPORT` moves from `< 1200` to `< 1290`, the
width below which the docked inspector would push the canvas under 560 px.

**Desktop ≥ 1290 (verified at 1440 × 900).** Gutters are 12 and the outer
padding is 12. Fixed width = 76 + 315 + 290 + 4 × 12 = 729, so the canvas gets
`W − 729` (711 at 1440).

```
┌──────────────────────────────────────────────────────────────────────────────┐ 56
│ ◉ QuantumLab   Explore  Molecules  Learning  Gallery   [⌕ Search… ⌘K] ☾ ? (ES)│ top bar
├────┬───────────────┬──────────────────────────────────────────┬──────────────┤
│ ⚛  │ Element    ▾  │ Carbon — 2p_z orbital        [⟲][◎][⤴][⤓][⛶]│ Plot │ Data │
│Atom│ ┌──────┐[▦ PT]│ |ψ|² isosurface · 90 % enclosed · LDA      │ ──────────── │
│ ∞  │ │6  6e⁻│      │                 z                   High │ [Radial dist.]│
│Basic│ │  C   │      │                 │   ╭─╮               ▓  │  P(r) plot   │
│ ⚬‑⚬│ │Carbon│      │          x ─────●───╰─╯─── y        ▓  │              │
│Bond│ │12.011│      │                 │   ╭─╮               ▓  │ legend, note │
│ ⁂  │ └──────┘      │                     ╰─╯               Low  │──────────────│
│Mol │ Atom › L › 2p │  ψ>0 ■  ψ<0 ■                              │ facts card   │
│────│ Config│Orbit.│Disp│ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐                 │ energies     │
│ 📖 │  …tab body…   │ │1s││2s││2px│2py│2pz│3d…│ thumbnail strip  │ CSV ▸        │
│Learn│ (scrolls)     │ └──┘└──┘└──┘└──┘└──┘└──┘                 │              │
│ ▦  │               │                                            │              │
│Gall.│              │                                            │              │
│ ⚙  │               │                                            │              │
│Admin│               │                                            │              │
└────┴───────────────┴──────────────────────────────────────────┴──────────────┘
 76     315             W − 729                                    290
```

**Wide desktop ≥ 1680.** The rail expands to 184 px, with the icon and label
in a row as in concept A, and the inspector to 320 px.

**Tablet / medium (761 – 1289 wide, landscape).** The rail stays 76. Explore
is 300 and collapsible to the rail with a chevron. The inspector collapses
first to a 44 px edge bar of vertical tab buttons (Plot, Data; Molecules: its
tools). Opening it slides a 290 px drawer over the viewport's right edge,
non-modal, measured as a camera inset (today's `.view-panel.folded`
behaviour, restyled). Top-bar primary tabs hide below 1100 (the rail is
enough), and search shrinks to an icon that opens a 360 px popover.

```
┌──────────────────────────────────────────────────────────────┐
│ ◉ QuantumLab                         [⌕] ☾ ? (ES)            │
├────┬──────────────┬─────────────────────────────────────────┬─┤
│rail│ Explore 300  │ viewport (≥ 560)                         │▸│ ← inspector bar
│    │              │                                          │P│
│    │              │                                          │D│
└────┴──────────────┴─────────────────────────────────────────┴─┘
```

**Phone (`NARROW_VIEWPORT`; verified at 390 × 844).** This keeps the
`PhoneSheet` model.

```
┌──────────────────────────────┐
│ ◉ QuantumLab  [Atoms ▾] ⌕ (ES)│ 52  phone top bar
│ ‹ Carbon · 1s² 2s² 2p² ▾      │ 44  .phone-header (LevelNav/MoleculeNav header)
│                              │
│        3D view (full)        │
│                              │
│ ψ>0 ■ ψ<0 ■        High▕Low  │     keys (compact)
├──────────────────────────────┤
│  Explore  │  View  │  Plot   │ 56  PhoneSheet tab bar
└──────────────────────────────┘
```

On a landscape phone (height ≤ 500) the sheet runs down the right as today,
and the top bar merges into the header line, which keeps 44 px.

## 8. The shell

### 8.1 Top bar (56 px, `bg-bar`, bottom `border-subtle`)

Left to right:

1. **Brand.** Mark and wordmark (§5). A link to the default view, keyboard
   reachable.
2. **Primary tabs.** These are areas: **Explore** (Atoms, Basic Orbitals,
   Bonds; it returns to the last of these used), **Molecules**, **Learning**
   (present once lessons ship, §9.6), **Gallery**.
   - Active tab: `text-1`, weight 600, with a 2 px `selected-edge` underline
     8 px below the baseline (concept A). Inactive tabs: `text-2`.
   - They are `<a>` elements with `aria-current="page"`.
3. **Search.** 320–400 px, `surface-3`, radius `md`, placeholder "Search
   elements, molecules…", ⌘K / Ctrl+K hint. Details in §8.3.
4. **Theme switch** (§6.4).
5. **Help (?).** Opens a dialog with gestures (rotate, pan, zoom, tap to
   pick), keyboard shortcuts, the export formats, About (brand, app version,
   molecule data version, "methods are stated beside every number") and the
   "About this model" text for the current mode. It has no external links
   until the Phase 7 methods page exists.
6. **Avatar.** 32 px disc, `avatar` fill.
   - Signed out: a person-outline icon labelled "Owner sign-in". It runs
     today's `ConnectedOwnerBar` sign-in. Anyone may see it, and it grants
     nothing.
   - Signed in: the owner's initials from the session email. The menu holds:
     signed in as …, Admin dashboard, Jobs run on (This Mac / AWS; dev
     server only, today's toggle), Brand preview (§5), Sign out.
   - Session-ended and sign-in errors keep today's alert placement and wording.

### 8.2 Rail (76 px, `bg-bar`, right `border-subtle`)

- **Items** are icon over label: **Atoms**, **Basic Orbitals**, **Bonds**,
  **Molecules**, a divider, **Learning** (once lessons ship), **Gallery**,
  then, pinned to the bottom, **Admin** (owner only; a link to
  `/admin.html`).
- **States.** Active: the `rail-active` pill (radius `md`) with a 1 px
  `selected-edge` edge and icon and label in `text-1`. Inactive: `text-3`.
  Hover: `surface-3`.
- **Semantics.** `<nav aria-label="view mode">`. Mode items are buttons with
  `aria-pressed`, which keeps the accessible name and role tests rely on.
  They dispatch `handleModeChange` exactly as the old `Controls` Mode toggle
  did, so the four modes and their side effects are unchanged.
- **Removal.** The Mode toggle leaves `Controls`.

### 8.3 Search (real)

One index, built on the client from data the app already has:

- **Elements.** All 118, matched on name, symbol or Z. "fe", "Iron" and "26"
  find Fe.
- **Library molecules.** Name and formula, using `filterMolecules`, so "h2o"
  and "H₂O" work.
- **Bonds systems.** The 10 diatomics in `BONDS_SYSTEMS`.
- **Basic orbitals.** Names via `orbital_names` ("3dz2", "4f xyz").
- **Computed molecules.** Every finished computed molecule, for everyone, from the public index (§9.5).
- **Lessons**, once they exist.

Results show in a combobox popover (`role="combobox"` + `listbox`), grouped
with group headings and at most 6 per group. ↑ and ↓ move, Enter opens, Esc
closes. Opening does what the existing pickers do: `handleAtomElementChange`,
`selectMolecule`, `selectBondsSystem`, `setBasicSelection` plus mode change.
"No matches" is stated. There is no server call.

### 8.4 Explore panel (315 px, `surface-1`, radius `xl`, padding 16)

A header card for the current subject sits above a tab row (`nav` style,
underline indicator; the tabs are `role="tablist"`). The tab body scrolls on
its own, which keeps today's single-scroll rule and stops two scrollbars
fighting. The contents per mode are in §9.

### 8.5 Viewport frame (the canvas cell, radius `xl`, `canvas` token)

`#canvas-container` and `#orbital-canvas-host` keep their ids and their
pointer handling. The cell holds the one canvas and these overlay zones. Each
zone is measured into `ViewInsets` by `measureViewInsets`, which gains
selectors for them; the side-panel and view-panel selectors go, because those
panels are now docked outside the cell.

| Zone | Content | Look |
|---|---|---|
| Top-left | **Title block**: h1 view title ("Carbon — 2p_z orbital", "Water (H₂O)"); subtitle = what is drawn ("\|ψ\|² isosurface · 90 % enclosed · LDA", "HOMO — 1b₁ · B3LYP-D3(BJ)/def2-TZVPD"); molecules add the tier badge under it | title 20/600 `text-1`, subtitle 13 `text-2`; scrim `color-mix(canvas-solid 72 %, transparent)` + 8 px backdrop blur, radius `lg` |
| Top-right | **Toolbar**: Reset view, Snapshot (PNG with caption, the existing `png` export), Share link, Export ▾ (the existing `ShareExportBar` menu: PNG, PNG plain, CSV, STL, glTF, cube, as offered per mode), Fullscreen | 36 px square icon buttons, `surface-2` at 80 %, radius `md`, tooltips |
| Right, centred vertically | **Key column**: phase key, density colour bar, ESP key, density-surface key, combination key, whichever apply (§11.5) | 28 px wide colour bar with "High" / "Low" and an exact caption; solid `surface-2` chips |
| Bottom-left | Scale readout (existing), axis triad for molecules | existing scale bar restyled |
| Bottom | **Thumbnail strip** (§12): 1–n tiles, horizontally scrollable, collapsible to a 28 px handle | tiles `surface-2`, radius `md`; selected tile `selected-edge` + glow |
| Centre-bottom above strip | Canvas busy status, unbound note, molecule pick readout | existing components, restyled chips |

**Fullscreen** uses the Fullscreen API on the app shell, hiding the rail,
Explore and inspector. iPhone Safari has no element fullscreen, so there it
collapses the panels instead ("focus mode"). Esc leaves either.

### 8.6 Inspector (290 px, `surface-1`, radius `xl`)

- **Atoms, Basic Orbitals and Bonds** use two tabs:
  - **Plot**: the radial plot or Bonds potential curve (§9).
  - **Data**: the orbital facts card (§9.1), energies, and "Export CSV of this
    plot".
- **Molecules** replaces the tabs with a tool column (§9.4).
- `.view-panel` keeps its class for the existing tests and gains the docked
  layout.
- `PLOT_WIDTH` becomes 258 (290 − 2 × 16), which removes the old 278 + card
  padding arithmetic.

## 9. Screens

### 9.1 Atoms (6G-1) — concept A / Dark Modern / Light Clean atom views

**Explore header (always visible):**
- **Element tile** (88 × 96, `surface-3`, radius `lg`, 1 px `selected-edge`
  in dark, `accent` border in light):
  - top-left Z; top-right the electron count "6 e⁻", so an ion reads "11 /
    10 e⁻" (this replaces the concept's second number);
  - the symbol at 28/600, with any charge as a superscript (Na⁺);
  - the name;
  - the standard atomic weight. This is new data: `src/atomic_weights.ts`,
    IUPAC CIAAW 2021 abridged values, with the mass number of the
    longest-lived isotope in brackets ("[98]") for elements with no standard
    weight. The source is given in the tile's tooltip, and a test pins
    C 12.011, Fe 55.845, Tc [98], Og [294].
- **Periodic Table button** opens the existing `PeriodicTable` as a popover
  anchored under the tile, over the viewport, measured as a top inset as
  today. It still opens on arrival without a shared view.
- **▾** opens a searchable element list (today's `ElementPickerDialog` list,
  as a popover).
- **Breadcrumb** below: Atom › L shell › 2p › 2p_z. This is today's LevelNav
  breadcrumb with its back affordance and spoken labels.

**Tabs:**
1. **Configuration.** Each part is today's component, restyled.
   - Configuration and valence lines.
   - **Shells** chips (K, L, M…), 32 px segments.
   - **Subshells** chips with occupancy ("3d · 6 of 10 e⁻") and orbital
     energy.
   - **Orbital** mₗ chips with their colour swatches, plus the isolate hint.
   - **Species**: charge stepper, Excite menu, ΔSCF energies with method
     tooltips, measured NIST values, size comparison and unbound alert.
   - **Relativity** segmented control (Off / Scalar / With spin–orbit) with
     its help and the "what changed" live readout.
2. **Orbitals.**
   - The orbital energy-level diagram (log |E|).
   - The subshell energy list ("orbital energy", never "ionisation energy",
     ruling R19).
   - The j-level note under spin–orbit.
   - "About this model", expanded inline.
3. **Display.**
   - Electron enclosed (select and iso note).
   - Surface style: **Glow** (default), Solid, Wireframe.
   - Colour scheme: **Phase ψ** (default), **Density on the cut face**,
     **Classic**.
   - Opacity slider (default 1, as today; Glow looks right from 0.7–1).
   - Cut away: axis segments, depth slider with marks, and help text.
   - Show axes switch.

Reset view moves to the toolbar. Share and Export move to the toolbar, and
`Controls`' `actions` slot goes.

**Viewport.**
- Title "<Species> — <level>": "Carbon — whole atom", "Carbon — L shell",
  "Carbon — 2p", "Carbon — 2p_z orbital".
- Subtitle states the method ("LDA, non-relativistic" or "scalar-relativistic")
  and the enclosed fraction.
- Labelled axes.
- Key column: the phase key at orbital level; at whole-atom and shell level a
  "Shell rings — colour = shell, matches the plot" key built from the shell
  palette, with today's cut-face note ("cut face shading is scaled to local
  shell structure") as its caption; in the Density scheme, the High/Low bar
  (§11.5).

**Strip.**
- Whole atom: a "Whole atom" tile plus one tile per shell (K, L, M…).
- Shell, subshell or orbital level: a back tile, then every occupied orbital of
  the shell (each mₗ of each subshell, j-levels under spin–orbit), grouped by
  subshell with 11 px group labels.
- Selecting a tile dispatches the same `NavigationTarget` that LevelNav does.

**Inspector.**
- **Plot.** Tabs that follow the concept's Light Clean plot, each with an
  exact axis title:
  - Orbital and subshell level: **Wave function** (`R(r)`), **Probability
    density** (`|R(r)|²`, captioned "radial factor of |ψ|²"), **Radial
    distribution** (`P(r) = r²R(r)²`, the default and today's plot).
  - Whole atom and shell: **Density** (`ρ(r) = D(r)/4πr²`) and **Radial
    distribution** (`D(r) = 4πr²ρ(r)`, the default).
  - Relativistic dashed comparisons and their notes show on the
    radial-distribution tab only, where they are validated today.
  - Peaks, the hover readout and the `sqrt` scale at atom level are unchanged.
  - CSV export writes the curves of the tab on screen, so the exported number
    still equals the plotted one (ruling C6).
- **Data.** The **orbital facts** card (`src/orbital_facts.ts`, pure, tested):
  - n, l (letter), mₗ and the real-orbital name;
  - radial nodes n − l − 1 and angular nodes l, with their surfaces named
    (p_z: "xy plane"; d_z²: "two cones"; d_xy: "xz and yz planes");
  - the enclosed fraction and the iso value;
  - "ψ changes sign across every node";
  - a qualitative shape word ("dumbbell", "cloverleaf"), labelled
    "qualitative".
  
  At atom and shell level it holds the configuration, valence, shell count and
  displayed radius with its method.

### 9.2 Basic Orbitals (6G-2)

- **Explore header.** A fixed "Hydrogen-like, Z = 1" tile, with today's
  one-electron note as its caption.
- **Configuration.**
  - **Energy level (n)**: chips 1–9, as concept B's row.
  - **Subshell**: chips s, p, d, f, g, h…, only l < n.
  - **Orbital**: chips named by `orbitalName` (2p_x, 2p_y, 2p_z…).
  - **Draws on selection**, as the atom mode does. This replaces the "Update
    Orbital" button: a chip change dispatches `startOrbitalCalculation` after
    150 ms of no further change. `basicRenderNonce`, links and tests keep
    their meaning.
  - A **Combination** section (today's `CombinationControls`: sp, sp², sp³
    hybrids; the field and Stark states).
- **Orbitals.** The orbital facts card (the same component as §9.1).
- **Display.** As §9.1.
- **Strip.** The orbitals of the current n, grouped by l (1 + 3 + 5 + … = n²
  tiles; at n = 9 that is 81). Thumbnails render lazily as tiles scroll into
  view (§12).
- **Inspector.** Plot tabs as §9.1. A combination keeps today's single
  radial-distribution plot of its ingredients and their weighted sum.

### 9.3 Bonds (6G-2)

- **Explore header.** The system tile (formula, name, "exact" for H₂⁺).
- **Configuration.** System select, R (exact H₂⁺ slider or scan-point
  stepper), and what to draw (σg / σu / density with its ρ buttons). This is
  today's `BondsPanel`, regrouped.
- **Orbitals.** `MoDiagram` restyled: level lines use `text-1` strokes and
  occupation arrows in `accent-text`, with captions.
- **Display.** As §9.1. The density key states the fixed ρ.
- **Strip.** The system's drawable states (each MO from the diagram, plus
  total density).
- **Inspector Plot.** `BondsCurvePlot` / `PotentialCurvePlot` restyled with
  plot chrome tokens. Its reference curve colour moves from `#8bc34a` to
  `success`.
- **Data.** Captions, frontier orbitals and every method line.

### 9.4 Molecules (6G-2) — concept Molecule Builder / Cinematic

```
┌────┬────────────────────┬─────────────────────────────────────┬──────┬───────────┐
│rail│ Build│View│Properties│ Water (H₂O)                  [toolbar]│Struct│ inspector │
│    │ Quick pick          │ HOMO — 1b₁ · B3LYP-D3(BJ)/def2-TZVPD │Orbit.│ (selected │
│    │ [H₂O][CH₄][CO₂][NH₃][C₆H₆]  [Validated ▸]                 │ ESP  │  tool)    │
│    │ [Water (H₂O)    ▾][…]│        0.958 Å   ╭O╮   104.5°       │Proven│           │
│    │ Browse library ▸    │              H╯     ╰H               │Jobs* │           │
│    │ (owner) Request new ▸│                                     │      │           │
│    │                     │ [Ball&stick][Space][Density][ESP][HOMO][LUMO][LVMO]      │
└────┴────────────────────┴─────────────────────────────────────┴──────┴───────────┘
                                                                   88     290  (*owner)
```

**Left panel tabs (concept: Build / View / Properties).**
- **Build.**
  - Quick pick: five tiles with build-time structure thumbnails (§12) for
    the "First examples" category, read from the index (water, ammonia,
    methane, carbon dioxide, and the fifth from that category), so the list
    is never hard-coded.
  - Molecule select: today's `MoleculePicker` search and category chips, in a
    popover.
  - "…" opens the Gallery.
  - **Owner:** "Request a new molecule", which opens the Jobs tool.
- **View.**
  - Surface: Density / Electrostatic potential / Orbital, with an orbital
    select listing every orbital by its 6D label and role.
  - Representation: **Ball and stick**, **Space filling** (new: van der
    Waals spheres, Bondi 1964 radii, sourced and tested), **None**.
  - Show bond lengths and angles (new, §9.4.1).
  - Dipole arrow, with its value and caveat (ozone), unseparated (ruling
    T7-O3).
  - Electron enclosed, with today's fixed-ρ and ESP notes.
  - Opacity (entering the mode still lowers an untouched 1 to 0.6), surface
    style, colour scheme, cut away.
- **Properties.** Facts already in `meta`:
  - formula, point group (labels in the full group after 6D), electron count,
    multiplicity;
  - dipole with its method;
  - the HOMO–LUMO gap (and LVMO gap) with 6D's caveat ("Kohn–Sham orbital
    gap — neither the optical nor the fundamental gap");
  - geometry source, with 6D's geometry-honesty line;
  - the tier badge's line.

**Right tool column (88 px).** Labelled icon buttons, as in the concept. Each
selects what the inspector shows; none changes the drawing.
- **Structure**: today's `MoleculeReadout` as a pinned table of bond lengths
  and angles, the picked atom or bond, and the geometry source.
- **Orbitals**: `MoleculeOrbitalList` with 6D's labels, ✱/diffuse marks,
  LVMO note, constructed-LVMO mark, gaps and caveats.
- **ESP**: `EspLegend` in full, with the range and saturation note.
- **Provenance**: `ProvenancePanel`, with 6D's method, the D3(BJ) line, the
  frequency-check result and the time-budget note.
- **Jobs** (owner): `RequestPanel`, `QuoteChooser`, `PreviewDetails`,
  `StructurePreview` and `JobStatusPanel`.

Vibration and Analysis are added to the column only when Phases 6E and 6B-4
ship.

**Strip.**
- Ball and stick, Space filling, Electron density, Electrostatic potential,
  HOMO and LUMO.
- LVMO when 6D's role is present.
- An "All orbitals" tile that opens the Orbitals tool.
- Each tile sets `surface` / representation exactly as the View tab does.

**URL keys.** The `show` and `struct` values extend backward-compatibly:
- `show=none` (structure only);
- `struct=space` (space filling); `struct=1` / `0` keep their meaning.

**Title.** "<Name> (<formula>)". The subtitle names the surface and method
("HOMO — 1b₁ · B3LYP-D3(BJ)/def2-TZVPD", "ρ = 1.0e-3 e/a₀³ · ESP map"). The
tier badge sits under it. The key column holds ESP, phase or density keys.

#### 9.4.1 Bond lengths and angles on the model

**Decision.** Labels are drawn in screen space by a DOM overlay positioned
from projected 3D points each frame. This avoids any second renderer, the
text stays crisp and readable by screen readers, and the overlay is an
`aria-hidden` mirror of the Structure table.

**What is drawn.**
- Every bond's length (Å, 3 decimals, from `meta.atoms`, the numbers
  `MoleculeReadout` uses), and the angle at each atom with exactly two bonds,
  as an arc plus a degree label (water's "104.5°").
- Molecules with more than 12 atoms show only the picked atom's or bond's
  values, to avoid clutter.

**Look.**
- Labels: 12/600 `text-1` on a `surface-2` 85 % pill.
- Arcs: 1.5 px `selected-edge`.

**Visibility.** Off by default (today's readout-on-hover stays). The switch is
in View.

### 9.5 Gallery (6G-3) — new

**Decision.** Gallery is a screen of the app, reached at `#screen=gallery`.
A `screen` key is registered with url_state. The viewer is the default, and
`Share` never writes `screen`, because a share link describes a 3D view.

```
┌────┬───────────────────┬─────────────────────────────────────────────────────┐
│rail│ Search  [⌕ name…] │ Gallery · 25 molecules · 10 diatomics               │
│    │ Collection         │ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐ │
│    │ ◉ Molecules (25)   │ │ thumb  ││ thumb  ││ thumb  ││ thumb  ││ thumb  │ │
│    │ ○ Diatomics (10)   │ │Water   ││Ammonia ││Methane ││CO₂     ││Acetyl. │ │
│    │ ○ Computed (N)     │ │H₂O     ││NH₃     ││CH₄     ││CO₂     ││C₂H₂    │ │
│    │ Category chips     │ │1st ex. ││1st ex. ││hybrid. ││polarity││sp      │ │
│    │ Tags: sp sp² …     │ └────────┘└────────┘└────────┘└────────┘└────────┘ │
│    │ Sort: Name ▾       │ … (auto-fill, min 184 px)                          │
│    │ ▦ All 118 elements →│                                                    │
└────┴───────────────────┴─────────────────────────────────────────────────────┘
```

- **Collections.**
  - **Molecules**: the 25 library entries from `index.json` (water…glycine).
  - **Diatomics**: the 10 `BONDS_SYSTEMS`; these open Bonds mode.
  - **Computed**: every finished (DONE) computed molecule, **public to
    everyone** (owner decision 2026-10-13: the owner paid for them, past and
    future, and wants them shared). FAILED, running and cancelled jobs are
    never listed. Visitors cannot call the owner-only jobs API, so the
    listing comes from a **public static index**: `molecules/jobs/index.json`
    on the data bucket, served by CloudFront, holding for each DONE job its
    key, name, formula, recipe, method, compute version, finished date and
    thumbnail path — no prices, no owner data, no failure details. It is
    rewritten (conditional write, so two writers cannot lose an entry) when a
    job settles DONE — by the reconcile settlement path, which already runs
    once per job — and backfilled once for the jobs already DONE. A computed
    card opens `#mode=molecule&job=<key>` (the link that already opens for
    anyone), shows the Computed badge, its recipe and its date, and gets a
    build-time-style thumbnail rendered when the job finishes (or a generic
    tile until one exists). The owner still sees the extra job details
    (cost, status) in the jobs panels; the Gallery shows only the public
    fields. When paying users arrive (Phase 8), each job gets a public /
    private choice and only public ones enter the index; the owner's jobs
    stay public.
  - **Atoms** are not 118 cards. The periodic table *is* the atom gallery, so
    one link card, "All 118 elements → Periodic table", opens Atoms with the
    table.
- **Filters.** Real fields only: text (name, formula, id, tags; the same
  `filterMolecules`), category chips (the five library categories), tags
  (`sp`, `sp2`, `sp3`, `radical`…, read from the index) and sort (name;
  formula). Counts are computed.
- **Card.**
  - 184 × 232, `surface-1`, radius `lg`, `border-subtle`, hover `surface-3`
    with the selected-edge glow.
  - 132 px thumbnail area on `canvas`.
  - Name 14/600, formula 13, category tag (`sm` radius, `surface-2`).
  - A computed card adds its recipe and finished date.
- **One-click open.** The whole card is one link (`<a href="#mode=molecule&id=h2o">`),
  so middle-click and "open in new tab" work, and Enter opens it. There is no
  secondary action.
- **Empty state.** "No molecule matches '…'", with a "Clear filters" button.
- **Phone.** 2 columns (cards 168 wide). The filters move into a "Filters"
  sheet.

### 9.6 Learning (6G-3) — concept Learning Center

**Decision (developer, product call).** The concept's Learning screen needs
lessons, and the app has none yet. 6G-3 therefore brings Phase 7's lesson
model and its four lessons forward from
`docs/superpowers/plans/2026-09-25-phase-7-learning-and-research.md`
Tasks 7–9:
- the `Lesson` and `LessonStep` types, feature gating and highlight targets;
- `periodic-table-shape`, `what-is-a-bond`, `water-bent`, `gold-yellow`;
- `lessonSlice`, the URL keys `lesson` and `step`, and the driver.

The rest of Phase 7 stays where it is (compare, methods page, citation, embed,
PWA, analytics). The Learning rail item and tab render only when
`LESSONS.some(lessonAvailable)`, so nothing appears empty. If 6G-3 has to
ship without the lessons, the item stays hidden; that is the fallback, not an
empty page.

```
┌────┬────────────────────┬───────────────────────────────────────────────────┐
│rail│ Lessons            │ What is a bond?                                    │
│    │ Atomic structure   │ Two hydrogen atoms share their electrons…  (summary)│
│    │  ▸ The periodic    │ [Interactive][Explanation][Key points][Examples]   │
│    │    table's shape   │ ┌──────────────── viewport ────────────┐┌────────┐ │
│    │ Bonding            │ │   (the one canvas, driven by the step) ││ facts  │ │
│    │  ▸ What is a bond? │ │                                        ││ card   │ │
│    │ Molecules          │ └────────────────────────────────────────┘└────────┘ │
│    │  ▸ Why water bends │ ‹ Prev   ● ● ◉ ○ ○ ○   Step 3 of 6   Next ›          │
│    │ Relativity         │                                                     │
│    │  ▸ Why gold is gold│                                                     │
└────┴────────────────────┴───────────────────────────────────────────────────┘
```

- **Left panel.** Lessons grouped by topic (topic headings 14/600; items with
  an icon, the selected one on a `learn-accent` fill with white text, as in
  the concept). Lessons whose features have not shipped are not listed.
- **Header.** The lesson title in the `title` style and its summary in `body`.
- **Tabs.** Shown only when they have content:
  - **Interactive**: the live viewer, driven by the step's hash. This is the
    same canvas: the screen is a layout variant of the shell grid and the
    canvas host does not move or remount.
  - **Explanation**: the step body.
  - **Key points**: the orbital facts card for what is on screen.
  - **Examples**: real links to library molecules or other lessons named by
    the step.
- **Step bar.** Prev, step dots (a `tablist`), "Step k of N", Next. There is
  no play or speed control, because steps are not timed.
- **Divergence.** A diverged view is said as in Phase 7 ("you have moved away
  from this step — Back to step"), including Phase 7's busy rule.
- **Accent.** `learn-accent` (violet) replaces `accent` on this screen only:
  the selected item, active tab and step dot. This is the concept's LearnLab
  colouring, and the neutral surfaces stay those of the theme.

### 9.7 Admin (6G-3) — concept Admin Dashboard

`/admin.html` keeps its own entry, bundle and `ADMIN_ROOT_CLASS`. It reads
`eov.theme` and `eov.brand`, and imports only `src/design/*` (tokens, theme,
brand, ThemeSwitch, wordmark), none of the viewer's modules beyond what it
imports today. `npm run check:admin-split` must stay green. Its markers stay
`eov-admin-dashboard` and `Daily spend`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ QuantumLab  Admin   Overview  Jobs  Costs       [Month: 2026-10 ▾] ☾ (ES)│
├────────┬─────────────────────────────────────────────────────────────────┤
│Overview│ ┌Jobs this month┐┌Spent───────┐┌Remaining of cap┐┌Reserved┐┌Avg cost┐│
│Jobs    │ │ 14            ││ $3.42      ││ $46.58 of $50  ││ $0.80  ││ $0.31  ││
│Costs   │ │ 11 done·2 fail││ AWS billed ││ ▓▓▓▓░░░░ 7 %   ││queued/ ││per done││
│────────│ │ ↑3 vs same day││ $3.37 (as  ││ projected $9.10││running ││ job    ││
│← Viewer│ └───────────────┘└────────────┘└────────────────┘└────────┘└────────┘│
│        │ ┌ Daily spend, 2026-10 (settled jobs) ────────────────────────────┐ │
│        │ │ ▁▃ ▅▂  ▇ ▃▁  — cap pace                                        │ │
│        │ └─────────────────────────────────────────────────────────────────┘ │
│        │ ┌ Jobs ─ Status▾ Recipe▾ Size▾ ───────────────────────────────────┐ │
│        │ │ table (existing columns, sortable)            [open][files ▾]  │ │
│        │ └─────────────────────────────────────────────────────────────────┘ │
└────────┴─────────────────────────────────────────────────────────────────┘
```

- **Top bar.** Brand and an "Admin" tag. Tabs Overview, Jobs, Costs (section
  anchors on one page). The month select (today's `recentMonths`, styled as
  the concept's "Last 30 days" dropdown), the theme switch and the avatar
  (`ConnectedOwnerBar`'s sign-in and sign-out). The left nav repeats the
  sections, plus "← Back to the viewer".
- **KPI cards** (`lg` radius; label `caption`, value `kpi`, sub-line
  `caption`). Every value comes from the existing `api.list(month)` and
  `api.costs(month)`:
  - **Jobs this month**: count, with "n done · n failed · n running".
  - **Spent**: the meter's `spentUsd`, with AWS billed and "as of" when
    `billing` exists.
  - **Remaining of cap**: `remainingUsd` "of `capUsd`", a progress bar of
    committed ÷ cap, and the projection with its formula in a tooltip.
  - **Reserved**: `reservedUsd`, "worst case of everything queued or running".
  - **Average cost per completed job**: Σ charged (or `actualUsd` for
    pre-quote records) over DONE jobs ÷ the DONE count. "—" when there are
    none.
  - **Deltas**, only for Jobs and Spent: "vs the same day last month". They
    come from the previous month's list and daily spend (one more pair of
    requests, which are real), and are hidden when that month has no data.
    The arrows use `success`/`danger` together with "+"/"−" text, so colour
    is never the only cue.
- **Daily spend chart** (`DailySpendChart` restyled):
  - Bars in `accent` with rounded 3 px tops.
  - Plot-chrome gridlines, week ticks on the x axis and $ ticks on the y axis.
  - A dashed "cap pace" line (cap ÷ days in the month), labelled.
  - Today's `<title>` hover text, and a focusable bar list so the values are
    reachable by keyboard.
  - It is responsive: its width follows its card.
- **Jobs table.** `JobsTable` restyled. Every column, filter, sort and note
  stays.
  - Header row `surface-2`, sticky; rows 40 px; tabular numbers.
  - Status chips: Done `success`, Failed `danger`, Running/Starting `accent`,
    Queued `text-3`, all with text.
  - Row actions as icon buttons: Open (the job's `#mode=molecule&job=` link)
    and Files ▾ (`jobLinks`). These are the concept's view and download icons
    with real targets.
  - The table still scrolls inside its own box on a phone.
- **Cost notes.** Today's explanatory paragraphs (Phase 6C's storage and
  delivery note, prices retrieved) move under the chart as `caption` text,
  unchanged in wording.

### 9.8 Phone (6G-1 baseline, 6G-3 polish)

- **Top bar (52).** Brand mark and wordmark, the mode menu button
  ("Atoms ▾" opens the rail's destinations as a menu), a search icon (opens a
  full-screen search sheet) and the avatar (whose menu also holds Theme and
  Help).
- **Header line.** `.phone-header` keeps LevelNav, MoleculeNav or the Bonds
  header.
  - `--phone-overlay-top` and `--phone-legend-stack-top` grow by 52 px.
  - `measureViewInsets(narrow)` adds `.phone-topbar` to the top inset.
- **PhoneSheet.**
  - Tabs Explore / View / Plot, unchanged in meaning: Explore holds the left
    panel's tabs as sections, View holds Display, Plot holds the inspector.
  - Restyled: a `bg-bar` tab bar with the active tab in `accent-text` and a
    2 px `selected-edge` bar; the sheet is `surface-1` with radius `xl` top
    corners and a 4 × 36 handle.
  - The thumbnail strip becomes the first row of the Explore tab (56 px
    tiles), not an overlay.
- **Viewport keys.** Compact chips, as today's `compact` variants.
- **Gallery.** 2 columns.
- **Learning.** Lesson text in the sheet, viewer above, step bar in the sheet
  header.
- **Admin.** KPI cards 2 per row; the chart at full width; the table scrolls
  inside itself.

### 9.9 Tablet

See §7. The inspector collapses before the canvas shrinks. At 761–1100 in
portrait the phone layout applies, as `NARROW_VIEWPORT` already says.

## 10. Component inventory

| Today | New home | New look |
|---|---|---|
| `App.tsx` layout JSX | `src/shell/AppShell.tsx`: grid (top bar, rail, Explore, viewport cell, inspector); App keeps its state and effects and passes slots | §7 grid |
| `Controls` Mode toggle | `Rail` (desktop), phone mode menu | §8.2 |
| `Controls` Relativity | Explore › Configuration (Atoms) | segmented, `selected-fill` |
| `Controls` Basic n/l/mₗ selects + Update Orbital | Explore › Configuration (Basic) as chips, drawing on selection | §9.2 |
| `Controls` enclosed fraction, surface, opacity, cut | Explore › Display (all modes); phone View tab | 32 px segments, 4 px slider track in `accent`, white 14 px thumb |
| `Controls` Reset View | viewport toolbar | icon button |
| `ShareExportBar` | viewport toolbar (Snapshot, Share, Export ▾) | menu with item labels and details unchanged |
| `ConnectedOwnerBar` | avatar menu (viewer, admin); jobs target and brand preview inside | §8.1 |
| `LevelNav` (full) | Explore header (tile + breadcrumb) + Configuration (config, valence, shells) + Orbitals ("About this model") | tile §9.1, chips |
| `LevelNav` header / body variants | `.phone-header` / Explore tab | restyled |
| `SpeciesControls` | Explore › Configuration › Species | stepper 32 px, method tooltips unchanged |
| `SubshellPanel` chips, mₗ row | Explore › Configuration | chips with occupancy and energy |
| `SubshellPanel` energy diagram | Explore › Orbitals | plot chrome tokens |
| `PeriodicTable` | popover from the tile's Periodic Table button | block colours per theme, AA text, selected `selected-edge` |
| `ElementPickerDialog` | ▾ popover (desktop), dialog (phone) | list rows 36 / 44 |
| `CombinationControls` | Explore › Configuration (Basic) | chips + swatches |
| `RadialPlot` | inspector › Plot, with the tabs of §9.1 | plot chrome, curve palette per theme |
| `BondsPanel`, `MoDiagram` | Explore › Configuration / Orbitals (Bonds) | §9.3 |
| `BondsCurvePlot`, `PotentialCurvePlot` | inspector › Plot (Bonds) | plot chrome |
| `MoleculeNav` | Explore › Build (quick pick, select) + View (surface) | §9.4 |
| `MoleculePicker`, `MoleculePickerDialog` | Build popover; phone dialog; Gallery filters reuse `filterMolecules` | chips `sm`, list rows |
| `MoleculeViewOptions` | Explore › View (representation, dipole, labels) | switches |
| `MoleculeOrbitalList` (+6D labels, LVMO, marks) | inspector › Orbitals tool | rows 32, selected `selected-fill`, energies tabular |
| `EspLegend` | key column (compact) + inspector › ESP tool (full) | colour bar 28 px |
| `MoleculeReadout` | inspector › Structure tool + on-model labels | table |
| `TierBadge` (+6D validated line) | under the viewport title | pill, `success` dot for Validated, `accent` for Computed |
| `MoleculeJobsSection`, `RequestPanel`, `QuoteChooser`, `PreviewDetails`, `StructurePreview` | inspector › Jobs tool (owner) | cards, radio rows 40 px |
| `JobStatusPanel` | inspector › Jobs tool, plus a status chip on the Jobs tool icon while a followed job runs | status chips §9.7 |
| `ProvenancePanel` (+6D) | inspector › Provenance tool | definition list, file links as text links |
| `PhoneSheet` | unchanged model, restyled | §9.8 |
| phase legend, density key, combination key | key column | §11.5 |
| canvas busy, unbound note, errors | viewport centre-bottom / toasts | `surface-2` chips |
| scale readout | viewport bottom-left | restyled |
| `AdminApp`, `CostPanel`, `DailySpendChart`, `JobsTable` | admin shell, KPI row, chart card, table card | §9.7 |
| `src/theme.ts` (`appTheme`) | removed; `src/design/theme.ts` from tokens | §6 |
| `src/design/ThemeSwitch.tsx` (foundation) | rewritten as a top-bar menu | §6.4 |
| `src/design/quantumlab.css` (foundation) | replaced by `tokens.css` + component CSS modules | — |
| new | `TopBar`, `Rail`, `GlobalSearch`, `HelpDialog`, `AvatarMenu`, `Wordmark`, `ViewportFrame`, `ThumbnailStrip`, `KeyColumn`, `Inspector`, `ToolColumn`, `OrbitalFactsCard`, `GalleryScreen`, `LearningScreen`, `KpiCard` | — |

CSS lives in `src/design/*.css` per component, imported by its component.
`style.css` keeps only canvas and phone geometry rules. Class names that tests
or insets read (`.side-panel`, `.view-panel`, `#controls`, `.radial-plot`,
`.phone-sheet`, `.molecule-legend-stack`…) are kept or moved together with
their tests.

## 11. 3D visual mapping

### 11.1 Before → after

| Element | Before (code) | After: Deep Space / Light Clean | Classic |
|---|---|---|---|
| Canvas | `scene.background = 0x050505`; container `#111` | transparent canvas over the `canvas` gradient (§4.1) | the theme gradient |
| ψ > 0 surface | vertex colour linear (1, 0, 0) (`orbital_visualizer.ts` ~1834) | `#FF7A2F` / `#E8590C` (sRGB, converted to linear for vertex colours) | (1, 0, 0) |
| ψ < 0 surface | linear (0, 0, 1) | `#2F6BFF` / `#1F5FE0` | (0, 0, 1) |
| ψ legend swatches | CSS `#e02020` / `#2040ff`; PNG legend `#e02020` / `#2040ff` (`png.ts:205`) | the active scheme's surface colours, from one source (`phaseColours(theme, scheme)`) | `#e02020` / `#2040ff` |
| Cut face, + | `#D42020`, dark→full→white ramp (`clip_caps.ts`) | Phase scheme: `#FF7A2F`/`#E8590C`, same ramp shape; Density scheme: the 6-stop ramp on \|climb\| | `#D42020` |
| Cut face, − | `#2030D4` | `#2F6BFF` / `#1F5FE0` | `#2030D4` |
| Material | `MeshStandardMaterial`, roughness 0.45, metalness 0 | Glow (§11.2); Solid = today's; Wireframe = today's | today's |
| Total density surface | `#CFD8DC` (`DENSITY_SURFACE_HEX`) | `#C9D6E8` / `#7A8AA0` | `#CFD8DC` |
| ESP map | RdBu `#b2182b … #f7f7f7 … #2166ac` | unchanged | unchanged |
| Shell rings | `CURVE_COLORS` palette; cold floor `(0.17,0.20,0.36)`; warm `(1.00,0.85,0.45)`; edge rim `(0.62,0.70,0.90)`; highlight `(0.30,0.95,1.00)` | dark: unchanged; light: the light curve palette (§4.2), the rest unchanged (the disc stays dark navy, a deliberate dark "slide" on the light page so ring contrast is unchanged) | unchanged |
| Subshell members | `orbitalShade(CURVE_COLORS…)` | the same function over the theme's palette | unchanged |
| Combination overlay | `CURVE_COLORS`, ψ<0 × 0.45 shade | the theme's palette; the shade rule unchanged | unchanged |
| Axes | `AxesHelper` (x red, y green, z blue); labels `#ff9f40` `#a0ff40` `#40a8ff` | one hue (§4.2) with 6 % arrowheads; labels italic in `text-1`. The orange x label would have read as ψ > 0 | today's |
| Ball-and-stick | CPK, roughness 0.45 | CPK unchanged; Deep Space adds a 0.15 rim; H on Light Clean `#F2F2F2` | today's |
| Lights | ambient 0.5, key 0.8, fill 0.35 | Glow: ambient 0.35, key 0.6, fill 0.25 (the emissive term carries the rest); Solid: today's | today's |

### 11.2 The Glow surface (the concept look, with the science intact)

`createOrbitalMaterial` gains a `glow` variant: `MeshStandardMaterial` plus
`onBeforeCompile`, applied in place by `setAppearance`.

- **Body.** The vertex phase colour, an emissive term of 0.18 × that colour,
  and transparency at the user's opacity. It keeps `depthWrite = false` when
  translucent, as today.
- **Fresnel rim.** `rim = pow(1 − |dot(N, V)|, 2.5)`, adding
  `rimColour × rim × 0.9` (dark) or mixing towards the darker rim colour (light,
  "ink rim", since additive light is invisible on white).
  - **Ruling:** the rim is the *same phase's* tint, never the other phase's
    hue. The concept's blue rim on an orange lobe would read as a sign
    change, so it is not reproduced.
- **Halo (Deep Space only).** The same geometry drawn a second time as back
  faces, with vertices pushed out by 1.5 % of the mesh radius (in the vertex
  shader, not a new mesh), additive blending, opacity 0.12, and no depth
  write. It does not show in Light Clean.
- **Mesh lines.** At 6 % alpha, mesh edges drawn with the existing geometry
  as a wireframe material: the concept's fine network texture. These are the
  real marching-cubes edges. They are off on phones and when the frame time is
  over 20 ms.
- **What does not change.** The geometry and its vertices, the iso value, cut
  planes, caps, stencil passes and opacity. Glow is presentation only.
  `exportHandle` PNG captures it as seen. STL, glTF and cube exports are
  unaffected (glTF keeps the vertex colours of the active scheme and says so
  in its detail line).

### 11.3 Classic

`scheme = classic` restores today's colours, materials, axes and caps exactly
(a test compares the uniforms and vertex colours to the old constants), over
the theme's background. It exists for continuity with textbooks and earlier
exports.

### 11.4 Bloom

Out of 6G. Rim and halo reach the concept's look without a post-processing
pass. A bloom pass would complicate the stencil caps, readback and PNG export,
and cost phones about a frame. It is reconsidered only if the §14
side-by-side check fails on glow.

### 11.5 Keys (always on screen with their colours)

| Drawn | Key (key column) |
|---|---|
| Orbital, Phase scheme | "ψ > 0" and "ψ < 0" swatches, scheme colours |
| Orbital, Density scheme | vertical bar, ramp; "High" at top, "Low" at bottom; caption "\|ψ\|² on the cut face: from the surface value (Low) to the peak (High), log scale". The ψ key stays beside it, because the surface keeps its phase colours. Shown only while a cut is on; otherwise it says "Pick a cut axis to see the density inside" |
| Shell view (atom, shell) | ring swatches per shell, matching the plot, caption "cut face shading is scaled to local shell structure" (today's wording) |
| Total density (Bonds, Molecules) | swatch, "ρ = … e/a₀³, total electron density" (today's wording) |
| ESP | `EspLegend` (today's wording, scale and range) |
| Combination | member swatches, "darker: ψ < 0" (today's) |

The concept's High/Low bar therefore exists only where a scalar is really
mapped. It is never shown beside a phase-coloured picture as if it described
the surface.

## 12. Thumbnails

**Decision: two sources, split by what the data allows. There is never a
second WebGL context.**

1. **Runtime, from one shared offscreen pass on the main renderer.** This
   covers the strips: atom orbitals, Basic Orbitals, Bonds states, and the
   current molecule's views, including computed ones.
   - *Why:* the data is already on the client (the atom's own R_nl(r), the
     molecule's loaded grids and basis), the atom's thumbnails depend on Z,
     charge, excitation and relativity (118 × ions × 3 modes; impossible to
     pre-render), and runtime thumbnails follow the theme and scheme
     automatically.
   - *How:* `src/thumbs/ThumbnailService.ts` owns one `THREE.Scene`, one
     camera and one 160 × 160 `WebGLRenderTarget` on the **main**
     `WebGLRenderer`.
   - Meshes come from the existing mesh workers at reduced resolution (32³;
     MOs 40³), flagged low priority. Jobs start only after the main picture
     has landed. They pause while a main render is in flight or a pointer drag
     is active, and are cancelled when the species, molecule or system
     changes.
   - At most one thumbnail renders per animation frame. It is read back with
     `readRenderTargetPixels`, painted to a 2D canvas, and kept as an
     `ImageBitmap` drawn into the tile's `<canvas>` (no blob churn).
   - The cache is an LRU of 96 entries keyed by `theme|scheme|content key`.
   - Only tiles visible in the strip (`IntersectionObserver`) are requested.
   - On WebGL context loss, tiles show a glyph and their text label.
2. **Build time, for the Gallery and quick-pick.** These show many molecules
   at once, whose data the client has not loaded.
   - *Why:* 25 + 10 cards would otherwise mean dozens of grid downloads and
     meshings on a phone.
   - *How:* `tools/thumbs/render_thumbs.mjs` drives the app's own renderer
     (a dev-only `thumbs.html` entry that imports `orbital_visualizer` and
     `ball_and_stick`) in its own headless Chromium against its own Vite. It
     writes one transparent-background ball-and-stick WebP (264 × 264, 2×)
     per molecule and per diatomic.
   - Structure is CPK and theme-independent, so one image serves both
     themes. The `alt` text is "Ball-and-stick model of <name>".
   - Files are published immutably with the molecule data version:
     `/molecules/<version>/<id>/thumb.webp`, about 6 KB each, about 210 KB in
     total. The generator runs in the 6D v3 publication or as a v3 addendum.
     If a file is missing, the card shows the formula large in its place.
   - Computed cards use the job's `StructurePreview`-style SVG drawn from
     its `geometry.xyz`, which is already fetched for the provenance panel.
     That is SVG, not WebGL.
3. **Tests.**
   - `WebGLRenderer` is constructed exactly once across a session that opens
     the strip, switches theme and opens the Gallery.
   - Cache eviction and keying.
   - Thumbnail jobs never start while the main view is busy.
   - In the live check, `document.querySelectorAll('canvas')` holds one
     WebGL canvas.

## 13. Accessibility

- **Contrast.** WCAG AA in both themes, extending the existing tests:
  - `tests/a11y/tokens_contrast.test.ts` checks every text token against
    every surface token it is used on (≥ 4.5:1).
  - Large text, icons, control edges in their selected state, the focus ring,
    chart marks and plot curves need ≥ 3:1.
  - `panel_contrast.test.ts` is rewritten to read `TOKENS` instead of
    regex-parsing literal colours from `style.css`.
  - Text over the canvas (the title block, keys) is checked with
    `worstCaseContrast` against the backdrops `[canvas darkest, canvas
    lightest, brightest surface colour #FFF1E6]` through its scrim.
  - The brand accents are checked against `bg-bar`.
- **Keyboard.**
  - **Skip links** "Skip to 3D view" and "Skip to controls".
  - **Order:** top bar → rail → Explore → viewport toolbar → strip →
    inspector.
  - **Arrow-key widgets.** The rail, tab rows, chip groups and strip use
    arrow keys (roving tabindex) and Tab exits.
  - **Search shortcut** ⌘K / Ctrl+K. It has a modifier, so it is outside WCAG
    2.1.4. There are no single-key shortcuts.
  - **Esc** closes popovers, menus, the drawer and fullscreen.
  - **The canvas** keeps its existing keyboard camera controls.
- **Focus.** A 2 px `selected-edge` (dark) or `#1662E0` (light) outline with
  a 2 px offset, never removed, on every interactive element, MUI included.
- **Semantics.**
  - Landmarks: `header` (top bar), `nav` (rail), `aside` (Explore,
    inspector), `main` (viewport).
  - The viewport title is the page `h1`.
  - The strip is a `listbox` with labelled `option`s ("2p_z orbital",
    `aria-selected`).
  - Every colour key has text.
  - Every status announcement keeps its existing live region.
- **Targets.** ≥ 24 × 24 on desktop (WCAG 2.5.8); controls are 32+. Phone
  targets are 44.
- **Reduced motion.** §4.7. The glow is static and nothing animates on its
  own.
- **Zoom and reflow.** At 200 % zoom (720 CSS px wide) the tablet layout
  applies and nothing is clipped. At 400 % the phone layout applies.

## 14. Verification

**Automated (every sub-phase):**
- `npm test`, `npm run build`, `npm run check:admin-split`.
- New tests:
  - tokens (contrast, the generated CSS in sync);
  - brands (list, fallback, the dev parameter only in DEV, contrast);
  - theme storage (key, migration, system follow, storage event; never in
    URL);
  - share URL invariance under a theme or brand switch;
  - search (Fe by "fe", "Iron" and "26"; "h2o" → water; "3dz2" → Basic);
  - atomic weights; orbital facts; R(r) normalisation and the curve-tab CSV;
  - Classic equals the old constants; phase colours have one source (screen
    legend = PNG legend = vertex colours);
  - one WebGL renderer; thumbnail scheduling;
  - Gallery counts and filters; the KPI arithmetic from fixtures;
  - the `screen` key, and the `show=none` and `struct=space` keys round-trip.

**Live visual check (the project's method, ruling D6).** One foreground
command starts its own Vite (`:5402`), with a throwaway job server only where
jobs are exercised, and its own headless Chromium (Playwright from Node). It
never uses the owner's `:5391`/`:8787` session or browser, and stops
everything at the end.

- **Captures:**
  - 1440 × 900 in Deep Space and in Light Clean, and 390 × 844 in both.
  - Screens per sub-phase: Atoms (carbon, whole atom; carbon 2p_z orbital
    level; Fe shell level).
  - Then Basic (3d_z²), Bonds (N₂ σg), Molecules (water HOMO; water ESP;
    benzene density; the C₂H₂ deep link).
  - Then Gallery, Learning (what-is-a-bond, step 3) and Admin (fixture month).
- **Composites.** Each capture is placed beside its concept crop (theme
  comparison A / B, Molecule Builder, Learning Center, Admin; crop boxes are
  listed in `tools/design/concept_crops.json`) into
  `docs/quantumlab/checks/6G-n/<screen>-<theme>.png`, which is committed.
- **Checklist per screen** (written into
  `docs/quantumlab/checks/6G-n/CHECKLIST.md` with pass/fail and notes). This
  is not pixel equality.
  1. *Colours:* page, panel, top bar, selected chip, accent and text are
     sampled from the screenshot at fixed points and are within ΔE₀₀ ≤ 3 of
     their tokens; the canvas centre and edge are within ΔE₀₀ ≤ 5 of the
     gradient.
  2. *Spacing:* rail 76, Explore 315, inspector 290, top bar 56, gutters 12,
     each ±2 px, measured from DOM boxes.
  3. *Typography:* computed font family Inter and the sizes and weights of
     §4.3 for title, nav, body and caption, read with `getComputedStyle`.
  4. *Components present and shaped as in the concept:* element tile, tab
     underline, chip segments, checkboxes, thumbnail tiles and selected glow,
     colour bar, toolbar, KPI cards.
  5. *Science unchanged:* the iso note, enclosed fraction, key wording and
     orbital labels are identical to `main` for the same URL (text compared);
     the camera frames the object clear of every overlay zone (inset boxes
     against the projected bounding box).
  6. *One WebGL canvas.* No console errors.
- **Manual (owner).** Rotate, pan and zoom; touch on a real phone; sign-in;
  one job request; every export kind; both themes; brand preview.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Docking the panels changes camera framing (insets were tuned for floating panels) | `measureViewInsets` is rewritten with its tests first; the §14 check 5 per screen |
| Translucent glow + halo + lines cost frame time on phones | lines and halo off on phones and when frames exceed 20 ms; Solid stays one tap away; measured in the live check |
| Glow on white looks washed out | Light Clean uses ink rims and no additive halo (§11.2); judged against concept B |
| Phase orange vs ESP red read as the same meaning | separate keys always on screen; ESP red is darker (`#b2182b`) than phase orange; Classic users keep red/blue |
| Test churn: many tests assert literal colours or `Controls` structure | tests move to tokens; behaviour assertions (roles, names, dispatches) are kept; no test is deleted without a replacement |
| Phase 6D lands mid-6G with conflicts in `MoleculeOrbitalList`, `ProvenancePanel`, `TierBadge`, `style.css` | 6G-1 does not touch the Molecules components; rebase before 6G-2; 6D's components are restyled, not rewritten |
| Bringing Phase 7's lessons into 6G-3 grows the phase | the Learning item is hidden if they slip (§9.6); the rest of Phase 7 is untouched |
| Inter replaces Roboto and widths shift (labels wrap, the 300 px card) | checked by the §14 layout check; Inter is metrically close to Roboto |
| Build-time thumbnails depend on the 6D v3 publication | missing thumbnails fall back to a formula card; a v3 addendum publish if needed |
| The top-bar "Owner sign-in" is visible to everyone and may suggest public accounts | labelled "Owner sign-in"; it grants nothing; it goes when Phase 8 brings accounts |
| localStorage unavailable | in-memory fallback (§6.1) |

## 16. Sub-phases and rollout

Each sub-phase ships on its own: tests green, reviewed, deployed with
`deploy.sh` (site), `check:admin-split` run after the build, the live visual
check committed, and the owner told which environment it is in.

**6G-1 — shell, themes and the Atom view (~2–3 days).**
- Tokens, `tokens.css` generation and the font.
- Theme mechanics and migration; brands with the owner selector.
- Top bar: tabs, real search over elements, molecules, Bonds systems and
  Basic orbitals, help, theme switch, avatar.
- Rail; Explore panel; viewport frame (title, toolbar, keys, axes, strip);
  inspector.
- The Atoms screen complete (§9.1), including atomic weights, the electron
  count, the R / |R|² / ρ plot tabs and orbital facts.
- The 3D mapping (§11), with Glow, Classic and the theme palettes.
- `ThumbnailService` for atom strips.
- Phone and tablet baseline: themed, top bar, sheet restyled.
- Basic, Bonds and Molecules work inside the new shell with today's panels
  placed into the Explore and inspector slots and themed, not yet
  re-composed.

**6G-2 — Basic Orbitals, Bonds, Molecules and the jobs panels (~2–3 days).**
- Rebased on 6D.
- The re-composition of §9.2–§9.4: chips that draw on selection; the Bonds
  regroup; Molecules' Build / View / Properties tabs, tool column and
  inspector tools.
- Structure-only and space-filling views; on-model lengths and angles.
- Strips for all three modes.
- The build-time Gallery/quick-pick thumbnails generated and published with
  the data version.
- The jobs panels restyled in the Jobs tool.

**6G-3 — Gallery, Learning, Admin and phone polish (~2 days).**
- The Gallery screen and the `screen` key.
- Learning, with Phase 7's lesson model and four lessons (§9.6).
- The Admin redesign (KPI cards, chart, table).
- Phone polish for every screen.
- The final §14 composites for all screens.

## 17. Decisions recorded here (developer)

- **Renames.**
  - Primary tabs: Explore / Molecules / Learning / Gallery.
  - The inspector's tabs are **Plot / Data**, not "View / Data", which would
    clash with the phone's View tab and the Display tab.
  - The Gallery's "Diatomics" collection is the Bonds systems.
- **The element tile's second number is the electron count.** The concept's
  "6 6" is ambiguous, and the count makes ions legible.
- **Learning is a sub-brand tag,** not a separate wordmark (§5).
- **R(r), |R(r)|² and ρ(r) plot tabs are added** (concept B). Their axis
  titles state exactly which function each is.
- **Thumbnails split** into runtime on the main renderer and build-time
  structure images (§12).
- **No bloom, starfield, decorative nucleus or fake toggles** (§2 Out, §11.4).
- **Phase 7 Tasks 7–9 (lessons) move into 6G-3** (§9.6).
