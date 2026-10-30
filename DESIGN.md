---
name: QuantumLab
description: Computed orbitals, atoms, bonds and molecules in the browser, and the owner's metered job ledger, in one navy instrument world.
colors:
  # Deep Space (dark, the default theme: :root and [data-theme="dark"]). Source: src/design/tokens.ts TOKENS.dark.
  bg-app: "#020F1D"
  bg-bar: "#010B17"
  surface-1: "#071828"
  surface-2: "#0B1C2D"
  surface-3: "#13263B"
  border-subtle: "rgba(110,160,220,.16)"
  border-strong: "#2B4A6B"
  text-1: "#F2F6FA"
  text-2: "#C3CFDB"
  text-3: "#93A6BA"
  accent: "#2A85F8"
  accent-text: "#4C9BFF"
  accent-fill: "#1E5BD8"
  selected-fill: "#0E3A99"
  selected-edge: "#1FB6F5"
  focus-ring: "#1FB6F5"
  on-fill: "#FFFFFF"
  on-accent: "#000000"
  success: "#34D399"
  warning: "#FBBF24"
  danger: "#F87171"
  error-bg: "#3B1219"
  error-text: "#FECACA"
  canvas-solid: "#04142A"
  plot-grid: "rgba(150,180,220,.12)"
  plot-axis: "#93A6BA"
  scrim: "rgba(4,20,42,0.72)"
  # Light Clean ([data-theme="light"]). Source: src/design/tokens.ts TOKENS.light.
  bg-app-light: "#F4F7FB"
  bg-bar-light: "#FFFFFF"
  surface-1-light: "#FFFFFF"
  surface-2-light: "#F1F5FA"
  surface-3-light: "#E3EEFE"
  border-subtle-light: "#E3E9F2"
  border-strong-light: "#B8C4D6"
  text-1-light: "#0B1220"
  text-2-light: "#475467"
  text-3-light: "#5B6880"
  accent-light: "#1662E0"
  accent-text-light: "#1559D6"
  selected-fill-light: "#1662E0"
  selected-edge-light: "#1662E0"
  focus-ring-light: "#1662E0"
  on-accent-light: "#FFFFFF"
  success-light: "#15803D"
  warning-light: "#B45309"
  danger-light: "#B42318"
  error-bg-light: "#FDEDED"
  error-text-light: "#5F2120"
  canvas-solid-light: "#F7F9FC"
  plot-grid-light: "#E6ECF4"
  swatch-ring-light: "#5B6880"
  # Science colours (src/design/science.ts): meaning, not style. Never re-tinted per theme or for any look.
  phase-positive: "#FF7A2F"
  phase-negative: "#2F6BFF"
  rim-positive: "#FFC59A"
  rim-negative: "#9CC2FF"
  rim-positive-light: "#9A3412"
  rim-negative-light: "#1E3A8A"
  density-surface: "#C9D6E8"
  density-surface-light: "#7A8AA0"
  # Brand wordmark gradient stops (src/design/brands.ts): the "Lab" half of the wordmark only.
  brand-violet-start: "#8A6CFF"
  brand-violet-end: "#C05CF2"
  brand-violet-start-light: "#3A4BE8"
  brand-violet-end-light: "#7B3FE4"
typography:
  wordmark:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  section:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  nav:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  body:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  body-phone:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  button:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
  subtitle:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  caption:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  tick:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "14px"
  figure:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "\"tnum\""
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
  gutter: "12px"
  panel-padding: "16px"
  section-gap: "16px"
components:
  top-bar:
    backgroundColor: "{colors.bg-bar}"
    textColor: "{colors.text-1}"
    height: "56px"
  top-bar-phone:
    backgroundColor: "{colors.bg-bar}"
    height: "52px"
  top-bar-tab:
    textColor: "{colors.text-2}"
    typography: "{typography.nav}"
  top-bar-tab-current:
    textColor: "{colors.text-1}"
  docked-panel:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.xl}"
    padding: "{spacing.panel-padding}"
  explore-panel:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.xl}"
    width: "315px"
  inspector-panel:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.xl}"
    width: "290px"
  viewport:
    backgroundColor: "{colors.canvas-solid}"
    rounded: "{rounded.xl}"
  key-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  strip-tile:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.md}"
    size: "72px"
  strip-tile-label:
    textColor: "{colors.text-2}"
    typography: "{typography.body}"
  strip-group-label-picker:
    textColor: "{colors.text-1}"
    typography: "{typography.section}"
  curve-handle:
    rounded: "{rounded.pill}"
    size: "10px"
  curve-handle-hit:
    size: "44px"
  drawer-bar-open:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    padding: "0 8px"
  drawer-bar-tab-open:
    textColor: "{colors.text-1}"
    height: "44px"
    padding: "0 8px"
  drawer-bar-close:
    textColor: "{colors.text-2}"
    size: "44px"
  mo-level-box:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.xs}"
    width: "22px"
    height: "18px"
  mo-level-box-hover:
    backgroundColor: "{colors.surface-3}"
  mo-level-box-selected:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.on-fill}"
  button-contained:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-outlined:
    textColor: "{colors.accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "3px 9px"
  button-text:
    textColor: "{colors.accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  toggle-selected:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.on-fill}"
  chip-filter:
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    height: "24px"
  chip-filter-selected:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.sm}"
  status-chip:
    textColor: "{colors.text-1}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "1px 9px 1px 7px"
  input-search:
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    height: "36px"
  budget-strip:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  cap-bar:
    backgroundColor: "{colors.surface-3}"
    rounded: "{rounded.pill}"
    height: "4px"
  job-list:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.lg}"
  job-list-header:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-3}"
    typography: "{typography.caption}"
    padding: "8px 12px"
  job-row:
    textColor: "{colors.text-1}"
    typography: "{typography.figure}"
    padding: "6px 12px"
  job-row-hover:
    backgroundColor: "{colors.surface-2}"
  job-row-linked:
    backgroundColor: "{colors.surface-3}"
  job-row-details:
    backgroundColor: "{colors.surface-2}"
    padding: "12px 16px 16px 44px"
  prediction-gauge:
    backgroundColor: "{colors.surface-3}"
    rounded: "{rounded.pill}"
    width: "56px"
    height: "6px"
  prediction-gauge-over:
    backgroundColor: "{colors.warning}"
  log-block:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-1}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  level-control:
    rounded: "{rounded.sm}"
    height: "32px"
  level-control-option:
    textColor: "{colors.text-2}"
    typography: "{typography.caption}"
    padding: "0 10px"
  level-control-option-selected:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.on-fill}"
  level-line:
    textColor: "{colors.text-3}"
    typography: "{typography.caption}"
  info-section:
    textColor: "{colors.text-2}"
    typography: "{typography.body}"
    padding: "10px 16px 12px"
  info-title:
    textColor: "{colors.text-1}"
  info-computed-summary:
    textColor: "{colors.accent-text}"
    typography: "{typography.caption}"
    height: "28px"
  info-button:
    textColor: "{colors.accent-text}"
    rounded: "{rounded.pill}"
    size: "20px"
  info-button-pressed:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.pill}"
    size: "20px"
  info-topic-chip:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.on-fill}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  info-fact-label:
    textColor: "{colors.text-3}"
    typography: "{typography.figure}"
    width: "max-content"
  info-fact-value:
    textColor: "{colors.text-1}"
    typography: "{typography.figure}"
  phone-caption:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    typography: "{typography.body-phone}"
    padding: "4px 10px"
---

# Design System: QuantumLab

## Overview

**Creative North Star: "The Night Instrument"**

QuantumLab is a measuring instrument, not a showcase. A navy room (Deep Space) or a clean daylight bench (Light Clean) holds one lit object: the computed orbital, density or molecule on the canvas, or, on the owner's Operate pages, the month's money and jobs. The chrome is quiet, tonal and dense: surfaces step a few points of lightness apart, borders are hairlines, and the only loud colours on screen are the science colours, which mean something, and the status colours, which also mean something. Accent blue marks what you can act on, what is selected, and the single line of money that matters.

Density is deliberate. The viewer is a fixed full-window workstation (top bar; Explore, canvas, inspector) at 13 px body text; the Operate surfaces are scrolling documents on the same tokens, built from one budget strip, a compact chart band drawn on the page itself, and one-line rows that open in place. Every figure carries its unit and its word ("of", "held", "charged", "so far"), set in tabular figures so columns of money and minutes align.

Both themes are first-class and share every structural token; only colour, shadow and the canvas backdrop change. The system is MUI 7 driven entirely from `src/design/tokens.ts` (tokens.css is generated from it), so a new surface inherits the world by importing tokens.css and design.css and using the MUI theme from `theme.ts`.

**Key Characteristics:**
- Tonal navy layering in Deep Space; hairline borders and a light lift in Light Clean.
- Science colours untouched in both themes; status colours carry meaning only.
- Inter Variable throughout, a narrow ramp (11 to 20 px), tabular figures for every number.
- Fixed workstation for the viewer; scrolling ledger for Operate pages.
- Short ease-out motion (120 / 180 ms), zero under reduced motion.
- Four learning levels decide which controls exist and how deep Info goes; hidden controls leave one quiet line, never a greyed control.

## Colors

A cool navy-to-ice neutral ladder with one electric blue for action and selection, a cyan selection edge, and a set of meaning-bearing hues that are never decoration.

### Primary
- **Signal Blue** (`accent` / `accent-light`): primary actions (contained buttons, outlined and text buttons), the cumulative charged line and the "now" dot on the month band, the charged segment of the cap bar and the swatch that keys it. On a contained fill, text is `on-accent` (black in Deep Space, white in Light Clean, chosen for contrast).
- **Link Blue** (`accent-text` / `accent-text-light`): links and inline accent text, a step brighter than Signal Blue in Deep Space so it reads at body size.
- **Deep Selection** (`selected-fill`, edge `selected-edge`): the selected state of toggles, filter chips, the level switch, the pressed (i) and a drawn MO level; text on it is `on-fill`. In Deep Space the edge is a cyan (`selected-edge`, also `focus-ring`) that draws top-bar and panel tab underlines, the selected strip tile's ring and the potential curve's handle ring; in Light Clean both collapse to the accent. The inspector's drawer bar never takes it: folded, its buttons are `text-2` ink; open, the open tab is marked in `text-1` (Navigation).

### Secondary
- **Status set** (`success`, `warning`, `danger`, plus `accent` for "running or queued"): what happened to a job. Success green is done-as-predicted; Warning amber is past a prediction or money absorbed past an approval; Danger red is failed. Light Clean darkens each for contrast on white.
- **Error surface** (`error-bg`, `error-text`): inline error panels.

### Tertiary (science, not UI)
- **Phase Orange** (`phase-positive`) and **Phase Blue** (`phase-negative`): ψ > 0 and ψ < 0, one pair in both themes. Glow rims are the same phase's own lighter tint in Deep Space (`rim-positive`, `rim-negative`) and a darker ink in Light Clean (`rim-*-light`).
- **Density Grey-Blue** (`density-surface` / `density-surface-light`): a phase-less density surface. ESP maps and orbital curves use their own palettes from `science.ts` (`CURVE_COLORS` and its index-matched light twins).

### Neutral
- **Abyss and Bar** (`bg-app`, `bg-bar`): page and top-bar ground; the bar is the darkest strip in Deep Space and white in Light Clean.
- **Surface ladder** (`surface-1` panels and cards, `surface-2` headers, hovers, open details, key chips, `surface-3` the stronger "linked" state, gauge and cap-bar tracks, log blocks).
- **Hairlines** (`border-subtle` for every panel, row and cell divider; `border-strong` for the band's day axis and scrollbars).
- **Ink ladder** (`text-1` primary and figures, `text-2` secondary labels, `text-3` captions, units, "of …" qualifiers, axis labels).
- **Canvas** (`canvas-solid`): the 3D view's solid backdrop for export; on screen it is a radial gradient (sidecar).

### Named Rules
**The Science Is Not Style Rule.** Phase, density and ESP colours are never whitened, tinted, darkened or swapped per theme for a look. Where a phase hue falls under 3:1 on its panel (Light Clean's orange), a `swatch-ring` outline carries the contrast; the hue stays.

**The Meaning-Only Status Rule.** Green, amber, red and the running-blue appear only where they state an outcome, and every use is keyed (a legend, a chip label, or words). Amber means "past a prediction" at any overrun, with no tolerance, or "billed past the approved maximum, absorbed by the app".

**The One Blue Voice Rule.** Signal Blue marks actions, selection and the one money line; it is never a section tint, a decorative stroke or a background wash.

**The Wordmark Keeps The Violet Rule.** The violet gradient lives only in the "Lab" half of the wordmark (solid fallback included); it is not a UI colour.

## Typography

**Display Font:** none; the system has no display face.
**Body Font:** Inter Variable (with system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** ui-monospace, SF Mono, Menlo (job keys and logs on the jobs page only; no token yet)

**Character:** One neutral grotesque at small, even sizes; hierarchy comes from weight (400 / 500 / 600) and ink step, not size jumps.

### Hierarchy
- **Title** (600, 20/28 px, letter-spacing -0.01em on Operate pages): view and page titles ("October 2026"), MUI h1 to h6.
- **Wordmark** (600, 20/24 px, -0.01em): the brand lockup in the top bar.
- **Section** (600, 14/20 px): panel and inspector section headings.
- **Nav** (500, 14/20 px; 600 when current): top-bar tabs, panel tabs, the page name beside the wordmark.
- **Body** (400, 13/20 px; 14 px on a phone): all running text and table cells. Buttons are body at 500, sentence case, never uppercase.
- **Caption** (400, 12/16 px; 12 on a phone too): table headers, legends, notes, chip and status text, units.
- **Tick** (400, 11/14 px): plot and band axis labels and band job names. Nothing in the product is set under 11 px.

### Named Rules
**The Tabular Figures Rule.** Every number that can sit above or beside another (money, durations, memory, ticks) is set with `font-variant-numeric: tabular-nums` (`.ql-tabular`).

**The Phone Fourteen Rule.** Body steps to 14 px under the phone query; captions and ticks do not grow.

**The No Shouting Rule.** No uppercase labels, no tracked-out small caps, no size over 20 px in product chrome.

**The Typeset Science Rule.** Names of what is drawn carry real subscripts: an orbital's 3d<sub>z²</sub>, an MO's 1σ<sub>g</sub>, an irrep's 1b<sub>1</sub>, a point group's C<sub>2v</sub> or T<sub>d</sub> (everything past the first letter in a real `<sub>`, so any suffix works), a quantity's R<sub>e</sub>; an underscore is never shown. Signs are a true minus (U+2212); values outside the plain range read "2.66 × 10⁻²", never e-notation. A surface that cannot hold markup (the document title, an export caption, an accessible name built as a string) takes the flat Unicode form ("3dz²", "1b₁", "C₂ᵥ"); a spoken name takes plain digits ("H2O", "1b1", "3dz²"), because screen readers voice Unicode subscript digits inconsistently. One parser feeds all three forms (`src/format/sci.ts`, `src/format/subscripts.ts`, `OrbitalLabel`, `PointGroupLabel`), so they never disagree.

**The eV First Rule.** An energy reads in electron-volts first with hartree in parentheses, held on one line: "−5.41 eV (−0.199 Ha)". A difference carries its sign either way ("+9.05 eV (+0.333 Ha)") at three significant figures, so nothing rounds to "−0.00 eV"; a total energy keeps Ha to five places. One Ha→eV factor (CODATA 2018) lives in `src/format/energy.ts`. The rule covers the Atoms subshell chips (eV alone to three figures, "−8.03 eV", with the full text in the chip's name and tooltip) and the orbital-energies table ("Energy (eV)" before "(Ha)"), the MO level tooltips, the H₂⁺ curve note and the Molecules provenance (totals and corrections with Ha at the job's six places). An eV figure of 1000 or more is a whole number ("−1339 eV"), never "−1.34 × 10³ eV".

## Layout

**Viewer (fixed workstation).** A full-height grid: a 56 px top bar (52 px on a phone), then a workspace with 12 px outer padding and 12 px gutters holding Explore (315 px; 300 px at medium), the canvas (fluid) and the inspector (290 px; 320 px at 1680 px and wider). Panels pad 16 px with 16 px between sections. Below 1290 px the inspector folds to a 44 px vertical bar over the canvas edge and opens as a drawer; Explore can collapse to a 28 px reveal. On a phone (max-width 760 px, or max-height 500 px, or portrait up to 1100 px) the canvas is the whole screen and the top bar, header and a bottom sheet sit inside it. The canvas's corners are fixed roles: title top-left, toolbar top-right, scale bar bottom-left, key column bottom-right (220 px max), with the thumbnail strip (72 px tiles, 16 px labels, 12 px between tiles or groups, 8 px between tiles inside a group) along the bottom. In Orbitals the strip is the picker and never folds (no handle); on a phone it is the first row of the Explore tab, and in Bonds the "Bond length" block follows it directly there.

**Operate pages (scrolling ledger).** A document on `bg-app`, content capped at 1440 px, padded 16/24/48 px, stacked with 12 px gaps: top bar, a month title row with its controls, the budget strip, the month band (about 120 px, no box of its own), filter chips with search and sort, then the list. At 1024 px and below the strip regroups to three columns and memory moves into each row's details; at 600 px and below the strip folds to the available figure behind a disclosure, the band thins, and each row becomes a two-line grid item (molecule / status, then time / cost / action).

Spacing follows a 4 px step (4, 8, 12, 16, 20, 24, 32). Touch targets are 44 px, the search field 36 px, a control row 28 px.

**Info and the level switch (viewer).** Info sits always open at the top of the inspector, above the accordion, capped at 45 % of the inspector's height; it scrolls inside itself, with a `border-subtle` hairline under it, so the accordion's headers (Plot and data among them) never leave the screen. In a stacked inspector Info takes its natural height with no cap. On a phone Info is a tab of the bottom sheet, and a caption under the header names what is drawn. The level switch sits in the top bar between the tabs and search as a segmented row of four; below 1024 px it is one button naming the level, opening the four as a list in a popover; on a phone the list is titled "Learning level" in the avatar menu, one 44 px row per level.

## Elevation & Depth

Depth is tonal first. In Deep Space panels carry no drop shadow, only a 1 px inner top highlight; separation comes from the surface ladder and hairline borders. Light Clean adds a soft two-layer lift to panels. Popovers float in both themes. Selection in Deep Space is a cyan ring with a soft halo; Light Clean has no glow, only a 1 px accent ring.

### Shadow Vocabulary
- **Panel** (Deep Space `inset 0 1px 0 rgba(255,255,255,.03)`; Light Clean `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)`): docked panels, the budget strip and the job list.
- **Popover** (Deep Space `0 12px 32px rgba(0,0,0,.45)`; Light Clean `0 12px 24px rgba(16,24,40,.12)`), with a `border-subtle` hairline: menus, popovers, search results.
- **Selected** (Deep Space `0 0 0 1px #1FB6F5, 0 0 12px rgba(31,182,245,.35)`; Light Clean `0 0 0 1px #1662E0`).
- **Selected tile** (Deep Space `0 0 12px 1px rgba(31,182,245,.5)`; Light Clean none): the selected strip tile, inside its 2 px edge.
- **Selected halo** (`--ql-shadow-selected-halo`: Deep Space `0 0 12px 1px rgba(31,182,245,.5)`; Light Clean `none`): a small selected mark whose fill alone sits too close to `surface-1` (about 1.8:1): the pressed (i) and the potential curve's handle. It is the selected tile's soft blurred glow, never a hard ring; Light Clean's solid accent fill already reads, so it gets none.

### Named Rules
**The Glow Belongs To Deep Space Rule.** Halos and added light exist only in the dark theme; Light Clean expresses the same states with ink rings and darker rims.

**The Tonal Scroll Cue Rule.** A scroller with more below it says so with a tonal fade, not a shadow, glow, arrow or "More": the last ~24 px fade out through a `mask-image` while (and only while) `scrollTop + clientHeight < scrollHeight`. Where the scroller has a hairline under it (Info in the inspector), the mask keeps that last pixel opaque so the hairline stays drawn; the phone sheet, which has none, fades to its edge. The mask is never animated, so reduced motion has nothing to stop. It works the same in both themes.

Its sideways twin is opt-in (the strip's `groupScroll`, Orbitals only): the left, right or both 24 px edges fade from the list's own `scrollLeft` (one pixel of slack at each end), with the same tonal-only mask. The list snaps by subshell group (`scroll-snap-type: x proximity`, each group's start edge) with `scroll-padding-inline: 24px`, so a snapped rest sits flush with where the fade starts and no fade is drawn before the first group. At rest the next group peeks in: a group whose own tiles would end inside the view snaps a little further on, so 32 px of the next group's first tile and its label stand clear of the right fade. Snapping is native, not animated.

**The Glow Finish Is The Owner's Rule.** The 3D Glow finish (`src/orbital_glow.ts`, GLOW_TUNING) is presentation only and its values were tuned live by the owner; they are recorded there, not here, and are not restyled.

## Shapes

Softly squared. Docked viewer panels and the canvas take 16 px corners; Operate cards (budget strip, job list) take 12 px; key chips, strip tiles, buttons, inputs and the folded inspector bar's buttons take 8 px (the open bar's are square, flush in their strip); filter chips and tooltips 6 px; small hit areas and the MO level boxes' top corners 4 px. Pills (999 px) are reserved for status chips, the avatar, and thin bars (cap bar, prediction gauge). Borders are 1 px hairlines; selection and current-tab marks are 2 px. On a phone and in fullscreen the canvas loses its corners and runs edge to edge.

## Components

### Buttons
- **Shape:** gently rounded (8 px), sentence case, body size at weight 500.
- **Contained:** Signal Blue fill with `on-accent` text: the one primary action in a panel (request, approve, export).
- **Outlined (small):** accent text and outline, padding 3 × 9 px: row actions ("Open result", "Follow", "Details"), "Charged, held, projected, AWS billed" on a phone.
- **Text:** accent text, no outline: secondary actions (Reload, "Why they differ").
- **Focus:** a 2 px `focus-ring` outline at 2 px offset on every interactive element, never removed; outlined inputs use their own 2 px focus-ring border instead.

### Chips
- **Filter chips:** MUI small outlined chips (6 px radius, 24 px tall) with a muted count after the label; selected takes `selected-fill`, `selected-edge` and `on-fill`, count included.
- **Status chip:** a non-interactive pill with a hairline border, caption text at 500 in `text-1`, and a 7 px dot in the status tone. The word is one of Queued, Starting, Running, Done, Failed; the dot's tone, not the word, carries "over prediction".
- **Key chips:** the canvas keys sit on `surface-2` at 8 px radius with 11 px round swatches.
- **Neutral chips:** the data-tier chips ("Library", "Computed") and the H₂⁺ "exact" chip are small outlined chips in `text-1` on a `border-strong` hairline, with no fill and no status colour: the label is the meaning (the Meaning-Only Status Rule). The hairline is decoration, 1.5 to 1.9:1 against the chip's surface (measured live, both themes; the label passes at 14:1 or more). It is paired with MUI's own class (`.MuiChip-root.neutral-chip`): MUI's injected outlined rule loads after style.css and would draw its grey at equal specificity.
- **Valence dot:** the 7 px dot on an Atoms valence-shell chip (with its "· valence" label) is that shell's own ring colour in the 3D view, read from the same curve palette as the strip's rings, with the `swatch-ring` outline (a 1.5 px `on-fill` ring on a selected chip, where the fill could swallow it); it is never warning amber.

### Cards / Containers
- **Corner Style:** 16 px for docked viewer panels; 12 px for Operate cards.
- **Background:** `surface-1`; headers and open details on `surface-2`.
- **Shadow Strategy:** Panel shadow (see Elevation).
- **Border:** 1 px `border-subtle`; inner cells divide with the same hairline.
- **Internal Padding:** 16 px in viewer panels; 10 × 14 px per budget-strip cell; 6 × 12 px per list cell.

### Inputs / Fields
- **Style:** MUI outlined, small, 8 px radius; search carries a leading magnifier adornment.
- **Focus:** a 2 px `focus-ring` border on the fieldset (the global outline is suppressed on the inner input so it does not overdraw the floating label).

### Navigation
- **Top bar:** `bg-bar` with a bottom hairline; wordmark and mark at left, tabs in nav type (`text-2`, `text-1` and 600 when current, underlined by a 2 px `selected-edge` bar), search and actions at right. Operate pages reuse the bar with the page name beside the wordmark and a "Back to the viewer" link.
- **Panel tabs:** the same nav style and 2 px underline, 20 px apart, above a hairline.
- **Drawer bar (below 1290 px):** folded, a 44 px vertical bar of `text-2` labels set sideways at the canvas edge. Open, it becomes a quiet horizontal label across the top of the drawer: a `surface-2` strip under a `border-subtle` hairline, 8 px side padding, each tab a 44 px row in nav type and `text-2`, hover `text-1`. The open tab is marked by a 2 px `text-1` underline (an inset bottom shadow) and weight 600: no accent, no fill, no `selected-fill`. A separate "Close panel" control, a 44 px chevron in `text-2`, sits at the bar's far right and returns focus to the open tab. The bar sits flush against the drawer's clipped edge, so its buttons draw the 2 px focus ring inside (offset −2 px).
- **Disclosure:** inspector sections are titled accordions, one open at a time; their chevron points down when folded and rotates to point up when open (180°, 180 ms).

### Budget Strip (Operate signature)
One line of named figures in a 12 px card: Available of cap (with a 4 px pill cap bar: charged in Signal Blue, held in a 40 % blend of the accent into `surface-3`), Charged, Held "for running jobs", Projected "by <month end>", and AWS billed "to <day>" against the meter with the gap said in words ("$0.29 more than the meter", or "matches the meter"). Labels are `text-3`, figures semibold `text-1`, swatches 8 px. Why the figures differ sits behind one text-button disclosure as a `surface-2` note, said only as far as the app knows.

### Month Band (Operate signature)
A compact chart drawn straight on the page: a day axis with week ticks, one short bar per job on its day in its status tone (dimmed to 30 % when filtered out, never hidden), a smooth monotone (Fritsch-Carlson) cumulative charged line in Signal Blue that cannot appear to fall or overshoot, a dashed projection to month end, and a dashed `text-3` cap line. When the month's figures are under half the cap, the band scales to its own figures and states the cap in words above the plot ("cap $8.80 is above this scale"); the cap is never drawn at a false height. Only running and failed jobs are named, in tick type, and only where they fit. A legend keys every line and tone. Marks are a roving-focus keyboard group; hovering or focusing a mark lights its row (`surface-3`) and vice versa.

### Job Rows (Operate signature)
One line per job in a fixed-layout table: molecule name (600) with formula and meta in `text-3`, status chip, run time against prediction (a 56 × 6 px pill gauge with a 2 px `text-1` notch at the prediction; overrun past the notch is amber, and the figure turns amber at 500), memory against prediction, charged "of" approved (right-aligned), and one outlined action: Open result when done, Follow while running, Details otherwise. The row's name is a disclosure that opens details in place on `surface-2` (quote lines, attempts ledger, sizing version, files, diagnostics) in an auto-fill grid of 250 px columns; hover is `surface-2`, linked-from-the-band is `surface-3`. A failed row leads with its reason in `danger`, read from the error code ("SCF not converged").

### Money Precision (Operate rule set)
- **Summaries and rows** show two decimals (`formatUsd`); a row charge under a cent reads "under $0.01" rather than a micro figure.
- **Small figures elsewhere** keep four significant figures below a cent, so nothing reads as zero that is not.
- **Details** print the meter's own micro-dollars (`$0.000000`), so quote lines and attempts add up exactly to "Total charged".
- **Never bare:** every figure carries its word ("held", "of", "estimated", "up to", "absorbed by the app").

### Learning Levels (viewer signature)
Four levels, in reading order Basics · Explore · Advanced · Research, decide which controls exist and how deep Info goes. Each gated control has one first level (`CONTROL_LEVEL`, `src/levels/levels.ts`): the plot, structure, bond labels, the dipole arrow, orbital energies, properties and axes at Explore; charge, excitation, relativity, combinations, the enclosed fraction, all orbitals, exports, advanced appearance and surface style at Advanced; molecule requests at Research. Picking an orbital, drilling down, the thumbnail strip, opacity, cut-away and Share are never gated.
- **Switch:** a radio group (one tab stop; arrows move, choose and wrap; Home and End reach the ends). The segmented row is 32 px tall with a 6 px corner and a `border-strong` outline, options split by hairlines, caption type in `text-2`, hover on `surface-2`; the level in use takes Deep Selection (`selected-fill`, a 1 px inset `selected-edge`, `on-fill`, 600). Focus draws inside the clipped row (offset −3 px).
- **Pointer line:** under a section whose controls the level hides, one caption line in `text-3` names the nearest deeper level's controls only, with the right verb: "Charge and relativity appear at Advanced". Never a list spanning two levels.
- **Held-value note:** while a hidden control still holds a value off its default, the line says what the picture keeps and where its control lives instead: "Showing Fe²⁺ — charge controls appear at Advanced" (`hiddenValueNote`). Lowering the level never changes what is drawn.
- **Opens at:** Share's menu offers "Opens at", with Recipient's level (the default, which writes no level) then the four levels. A link that needs more than the reader's level raises it for that visit only, said by an info notice in its own row under the top bar; the stored level is untouched.

**The Hide, Don't Grey Rule.** A control above the reader's level is absent, not disabled. Its place holds one quiet line saying where it appears, or what it still holds; a greyed control is never shown.

### Info (viewer signature)
One quiet section, always open, that explains the current selection or the term an (i) opened. Heading "Info" in section type; the selection's title in body at 600 `text-1`; running text in body `text-2` (14 px on a phone, the Phone Fourteen Rule); 6 px between blocks; padding 10 × 16 × 12 px. Placement, cap and scrolling are in Layout; its cue is the Tonal Scroll Cue Rule.
- **Order:** title, the plain lead, the facts, the notes that qualify them, the technical text, then "How this was computed". The facts come before the technical text so the numbers stay above Info's fold at Advanced and Research.
- **How this was computed:** a disclosure in caption accent text (28 px row), its body caption `text-3`; folded below Research and open at Research, with the inspector's chevron convention (down folded, up open, 180°). Method, references and validity live here, not in the lead.
- **Bands:** plain text at Basics and Explore; technical text added at Advanced; the full text (method and caveats) added at Research. Each band reads on from the one before. Facts carry their own first level (a point group from Advanced, an experimental value and its citation from Advanced and Research). Glossary terms an (i) opens use the same bands.
- **Lead length:** at Basics and Explore a lead is 3 lines or fewer, with no navigation sentence in it; technical text and notes are short paragraphs, one idea each, never one wall.
- **Topic and the way back:** an (i) switches Info to its term, named by the topic chip in the heading; "‹ Back to <selection>" in caption accent text, the pressed (i) again, or a new selection returns Info to the selection. Each change is announced once: by focus on the heading after an (i) or Back, otherwise by a polite live region.
- **Science words:** Info explains the phase colours and conventions in words; it never re-tints them (the Science Is Not Style Rule).

**The Plain First Rule.** Every explanation starts plain and grows by band. A scientific term with an (i) or a reference never appears below the level its band opens at.

**The One Home Per Number Rule.** Each figure has one place on screen. A key number lives in Info's facts, a control's value in that control's readout, a scale in the canvas key; the canvas subtitle is one plain line that restates neither the title nor Info's numbers, and adds the method only at Research. A panel line that would repeat an Info fact is dropped.

### Info Button (i) and Topic Chip
- **(i):** a 20 px circle with a 1.5 px ring and a 10 px glyph in `accent-text`, transparent at rest, `surface-2` on hover, with a 44 px hit area around it. Pressed, it takes Deep Selection: `selected-fill`, a `selected-edge` ring, `on-fill` glyph, and the selected halo in Deep Space (Light Clean: a solid accent with no glow, the Glow Belongs To Deep Space Rule). Accent at rest because it is an action (the One Blue Voice Rule).
- **Semantics:** a native toggle button named "About <term>", with `aria-pressed`, and `aria-controls` naming Info only while Info is in the DOM. Pressing moves focus to Info's heading and brings Info on screen (the phone's Info tab, the folded drawer); pressing the pressed one returns Info to the selection and keeps focus on the (i).
- **Topic chip:** the term Info now explains, as a pill in the heading beside "Info": `selected-fill`, a 1 px inset `selected-edge`, `on-fill` caption at 600, padding 1 × 8 px. It wears the pressed (i)'s fill and edge so the two read as a pair; being larger, it needs no halo.
- **Placement:** an (i) sits right beside the word it explains ("Shells (i)", "Shell n (i)", a fact's label), never floating at a panel's far edge. A gloss on a whole control may close that control's row (Relativity's segmented control, the ESP key).

**The One Pressed (i) Rule.** At most one (i) is pressed at a time, and only the one whose press set the topic; a second (i) for the same term elsewhere stays at rest.

### Fact Grid
Info's key facts as a definition list in tabular figures (the Tabular Figures Rule): label in `text-3` at the left, value in `text-1` at the right, 12 px between, 2 px between rows. A label takes its max-content width and keeps to one line ("Total energy", "Measured (NIST)", "HOMO–LUMO gap"), wrapping only when it alone cannot fit the row; there is no minimum label column. The value takes the rest of the row and wraps at its own spaces; a value that cannot fit beside its label drops below it, whole, still at the right. A label may carry its (i), which stays beside the label.

### Phone Caption
On a phone, a one-line pill under the header names what is drawn: "<title> · <one qualifier>" ("Carbon · electron density"; an orbital's qualifier is its enclosed share; a Bonds view's is its R, at Basics in Å in the curve's words ("distance between nuclei 1.10 Å") and from Explore up in a₀ ("R = 2.13 a₀")). Body-phone type, the title in `text-1` with real subscripts and an ellipsis when long, the qualifier in `text-2` and never cut; `surface-1` with the popover shadow, padding 4 × 10 px. While the view loads the qualifier says "loading…". It is announced once per change, after the canvas stops waiting, from a hidden polite copy with plain digits; Info leaves a new selection to it, so a reader hears each change once.

### Thumbnail Strip as Picker (Orbitals signature)
In Orbitals the picture is the control: the left panel keeps one chip row, Shell n, and the strip under the canvas picks the orbital. It is always expanded (no collapse handle). Tiles are grouped by subshell (3s, 3p, 3d; 9s to 9l), each group a labelled `role="group"`; the selected tile wears the strip's 2 px `selected-edge` ring and, in Deep Space, the selected-tile glow. A pick from the strip or a Shell n chip draws that orbital at every level.
- **Group labels:** the group's heading in section type (600, 14/20 px) in `text-1`, sticky inside its own group so the group on screen is always named: at rest it stands where it is laid out; once the strip has scrolled it holds 24 px from the list's edge, just past the left fade. Elsewhere (other modes' strips) group labels stay 500 11/14 px in `text-3`.
- **Tile labels:** on a phone a long name breaks only before its "(" ("9g" / "(mₗ = −2)"), never inside either part.
- **Scrolling:** by subshell group, with the sideways twin of the Tonal Scroll Cue Rule and the next group peeking in at rest (Elevation). A pick rests where a snap would when the picked tile stands clear of both fades there; otherwise it is centred.

### Bond Length Block (Bonds signature)
R's whole story is one block, read top to bottom as one instrument: the "Bond length" heading (section weight, `text-1`) with its (i), the readout, the R slider, then the potential curve at the block's full width, its legend, its axis row and the Rₑ note. 2 px between parts; the curve is in flow, with no card of its own. The energy at R is Info's fact, so the block has no energy readout (the One Home Per Number Rule). On a phone the block comes right after the strip, above the identity card and the molecule select.
- **One axis:** the slider's track is inset by the plot's own gutters (the left margin the plot reports, which widens to fit its energy labels, and its 8 px right pad), so the thumb stands over the curve's marker to a tenth of a pixel.
- **Marker:** a 1 px dashed `text-1` line (3 2) at R, with a 3 px dot in each series' colour where that series is on the plot.
- **Handle:** a 10 px dot in the colour of the series it rides (the drawn state's curve, else the first) with a 2 px `selected-edge` ring, wearing the selected halo in Deep Space and nothing in Light Clean. Its hit area is 44 px across with an `ew-resize` cursor; a drag that starts on it keeps its offset from the centre, a tap elsewhere on the curve sets R there. Where its curve is off the plot at R, or has no value there, the handle stays on the marker line at the plot's edge as a hollow ring, so it never reads as a point at a false energy.
- **Rₑ line:** a 1 px dotted line (1 3) in `text-2` at the fitted Rₑ, keyed by its note under the plot in the same `text-2` (it states no outcome, so it takes no status colour; it stays unlike the marker's dashed `text-1`). He₂ has no well, so it has none.
- **Basics words:** the readout and the slider's value text read "Distance between nuclei 1.10 Å"; the plot is titled "Energy (eV)", its x-axis row reads the ends in Å around "Distance between nuclei (Å)", the energy ends round to 2 significant figures with 0 labelling the separated-atoms line (an end within 16 px of the 0 gives way to it), H₂⁺'s legend reads "bonding · antibonding · apart", and the note reads "Dotted line: most stable, 1.10 Å".
- **Explore and up (Research included):** the readout keeps "R = 2.07 a₀ (1.098 Å)", each axis end carries its unit ("1.66 a₀ · R · 2.41 a₀"), the legend takes the symmetry labels with real subscripts, and the note names Rₑ and Dₑ in full.

### MO Diagram (Bonds, science corrections S1)
A plot, drawn flat on the panel like the radial and potential plots: the levels sit at their true energies on one linear eV scale, read off an axis at the left. It is 260 px wide by default, with a 34 px axis gutter and the levels starting 4 px past it.
- **One scale:** every system shares 5 px per eV, so a 0.1 eV split reads as nothing and a 13 eV gap reads as a gap. Drawn to scale are every level holding electrons and the lowest wholly empty one. The diagram's height follows their span, capped at 320 px. A system taller than that is the one exception: its whole scale shrinks to fit, and one caption line under the axis, in tick type and `text-3`, says "scale reduced to fit".
- **Axis:** a 1 px `plot-axis` line with 4 px ticks. Tick labels are whole eV with a true minus and no unit ("−10", "0"), in tick type, `text-3` and tabular figures, set right against their ticks. Ticks come every 5 eV under a 20 eV span and every 10 eV otherwise. On a shrunk scale the step stays, unless its ticks would fall under 16 px apart; then it takes the first coarser step (20, 50, 100, …) that clears 16 px. An axis holding fewer than two ticks widens to the round values on either side, so two labelled ticks always give the scale. The unit "eV" is named once, in the same tick type, at the head of the to-scale part: the top of the gutter, or just under the upper break when the higher empty levels fold.
- **Breaks:** two bands are not to scale, each behind a break. A break is one 11/13 px `text-2` line beside the levels, with two slanted `plot-axis` strokes interrupting the axis. "≈ core" sits under the highest gap over 1 Ha at or below the HOMO (the highest such gap, not the widest; gaps among the empty levels never count), and every level under it goes into the core band. H₂⁺, with one electron, never has one. "≈ higher empty levels" sits above the lowest wholly empty level, and every level above it folds into the band over the break. A level is drawn with both spins, so a half-filled level counts as filled (O₂'s 1πg* stays to scale and 3σu* is its lowest wholly empty level). Inside a band, levels run in energy order, left to right in two columns, and a full row wraps upwards.
- **Close levels:** a level is never moved up or down. Levels are placed lowest first, each at the leftmost place where neither its boxes nor its label come within 8 px of a level already drawn, so of two levels closer than a box, the higher steps right.
- **Tooltip:** a level box's hover title gives the energy eV first: "3σg: ε = −11.92 eV (−0.438 Ha)". Its accessible name says what it draws, not the energy (the One Home Per Number Rule).

**The True Height Rule.** An MO level sits at its own energy on the diagram's one scale. A collision is cleared sideways, never by moving a level up or down, and anything not drawn to scale sits behind a marked break.

### MO Level Buttons (Bonds, owner R26)
Each level box in the MO diagram is a native toggle button (22 × 18 px) named for what it draws ("2σg orbital, 2 electrons"), so it looks pressable: at rest a `surface-2` tile edged by a `border-subtle` hairline, standing on its 2 px `text-1` level line, with 4 px top corners; `surface-3` on hover (120 ms); and, when it is the orbital drawn, Deep Selection: `selected-fill`, `on-fill` arrows and level line, and the selected shadow (cyan ring and halo in Deep Space, accent ring in Light Clean), with `aria-pressed`. Focus keeps the global 2 px ring. At Basics and Explore one `text-3` caption under the heading says "Pick a level to draw that orbital."

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius and duration from `tokens.ts` through `tokens.css` or the MUI theme; add a role there before using a new value.
- **Do** set every comparable number in tabular figures and pair it with its unit and its word ("$0.04 of $0.51", "1.20 so far of 2.10 GB").
- **Do** draw an overrun in amber however small, and key every status tone in a legend or in words.
- **Do** say an off-scale reference (a cap, a limit) in words rather than drawing it at a false height.
- **Do** open a record's detail in place under its row, one step away, rather than navigating off the list.
- **Do** keep a visible 2 px focus ring on every interactive element and honour reduced motion (hover 120 ms, panels 180 ms, ease-out, 0 ms when reduced).
- **Do** give secondary text a real colour token (`text-2`, `text-3`), never opacity, so contrast tests see the painted colour.
- **Do** hide a control above the reader's level and leave its one-line pointer, or its held-value note while it still holds a value.
- **Do** order Info as title, plain lead, facts, notes, technical, then "How this was computed", and keep Basics and Explore leads to 3 lines or fewer.
- **Do** give each number one home, and set energies eV first with Ha in parentheses.
- **Do** put an (i) beside the word it explains, with `aria-pressed` and `aria-controls`, and let only one be pressed.
- **Do** set names of what is drawn with real subscripts and a true minus; flat Unicode where markup cannot go, plain digits where it is spoken.
- **Do** stand a control over the plot it moves: inset its track by the plot's own gutters, and draw its handle hollow when the value is off the plot.

### Don't:
- **Don't** whiten, tint, darken or swap the phase, density or ESP colours for either theme or any finish.
- **Don't** use green, amber, red or the running-blue as decoration, section colour or emphasis.
- **Don't** build KPI-tile grids or wide spreadsheets that push cost off screen on Operate pages; use the strip, the band and one-line rows.
- **Don't** set anything under 11 px, or uppercase labels and buttons.
- **Don't** add drop shadows to Deep Space panels or glows to Light Clean.
- **Don't** let the wordmark's violet gradient leave the wordmark.
- **Don't** grey out a control the level hides, or let lowering the level change what is drawn.
- **Don't** print e-notation, a hyphen for a minus, or an underscore in a name.
- **Don't** repeat a figure across the subtitle, a panel line, the canvas key and Info.
- **Don't** cue more content with a drop shadow, a glow, an arrow or a "More" label; use the tonal fade.
