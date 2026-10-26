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

## Colors

A cool navy-to-ice neutral ladder with one electric blue for action and selection, a cyan selection edge, and a set of meaning-bearing hues that are never decoration.

### Primary
- **Signal Blue** (`accent` / `accent-light`): primary actions (contained buttons, outlined and text buttons), the cumulative charged line and the "now" dot on the month band, the charged segment of the cap bar and the swatch that keys it. On a contained fill, text is `on-accent` (black in Deep Space, white in Light Clean, chosen for contrast).
- **Link Blue** (`accent-text` / `accent-text-light`): links and inline accent text, a step brighter than Signal Blue in Deep Space so it reads at body size.
- **Deep Selection** (`selected-fill`, edge `selected-edge`): the selected state of toggles, filter chips, the inspector bar button; text on it is `on-fill`. In Deep Space the edge is a cyan (`selected-edge`, also `focus-ring`) that draws tab underlines and the selected strip tile's ring; in Light Clean both collapse to the accent.

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

## Layout

**Viewer (fixed workstation).** A full-height grid: a 56 px top bar (52 px on a phone), then a workspace with 12 px outer padding and 12 px gutters holding Explore (315 px; 300 px at medium), the canvas (fluid) and the inspector (290 px; 320 px at 1680 px and wider). Panels pad 16 px with 16 px between sections. Below 1290 px the inspector folds to a 44 px vertical bar over the canvas edge and opens as a drawer; Explore can collapse to a 28 px reveal. On a phone (max-width 760 px, or max-height 500 px, or portrait up to 1100 px) the canvas is the whole screen and the top bar, header and a bottom sheet sit inside it. The canvas's corners are fixed roles: title top-left, toolbar top-right, scale bar bottom-left, key column bottom-right (220 px max), with the thumbnail strip (72 px tiles, 16 px labels, 12 px between tiles) along the bottom.

**Operate pages (scrolling ledger).** A document on `bg-app`, content capped at 1440 px, padded 16/24/48 px, stacked with 12 px gaps: top bar, a month title row with its controls, the budget strip, the month band (about 120 px, no box of its own), filter chips with search and sort, then the list. At 1024 px and below the strip regroups to three columns and memory moves into each row's details; at 600 px and below the strip folds to the available figure behind a disclosure, the band thins, and each row becomes a two-line grid item (molecule / status, then time / cost / action).

Spacing follows a 4 px step (4, 8, 12, 16, 20, 24, 32). Touch targets are 44 px, the search field 36 px, a control row 28 px.

## Elevation & Depth

Depth is tonal first. In Deep Space panels carry no drop shadow, only a 1 px inner top highlight; separation comes from the surface ladder and hairline borders. Light Clean adds a soft two-layer lift to panels. Popovers float in both themes. Selection in Deep Space is a cyan ring with a soft halo; Light Clean has no glow, only a 1 px accent ring.

### Shadow Vocabulary
- **Panel** (Deep Space `inset 0 1px 0 rgba(255,255,255,.03)`; Light Clean `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)`): docked panels, the budget strip and the job list.
- **Popover** (Deep Space `0 12px 32px rgba(0,0,0,.45)`; Light Clean `0 12px 24px rgba(16,24,40,.12)`), with a `border-subtle` hairline: menus, popovers, search results.
- **Selected** (Deep Space `0 0 0 1px #1FB6F5, 0 0 12px rgba(31,182,245,.35)`; Light Clean `0 0 0 1px #1662E0`).
- **Selected tile** (Deep Space `0 0 12px 1px rgba(31,182,245,.5)`; Light Clean none): the selected strip tile, inside its 2 px edge.

### Named Rules
**The Glow Belongs To Deep Space Rule.** Halos and added light exist only in the dark theme; Light Clean expresses the same states with ink rings and darker rims.

**The Glow Finish Is The Owner's Rule.** The 3D Glow finish (`src/orbital_glow.ts`, GLOW_TUNING) is presentation only and its values were tuned live by the owner; they are recorded there, not here, and are not restyled.

## Shapes

Softly squared. Docked viewer panels and the canvas take 16 px corners; Operate cards (budget strip, job list) take 12 px; key chips, strip tiles, buttons, inputs and the inspector bar's buttons take 8 px; filter chips and tooltips 6 px; small hit areas 4 px. Pills (999 px) are reserved for status chips, the avatar, and thin bars (cap bar, prediction gauge). Borders are 1 px hairlines; selection and current-tab marks are 2 px. On a phone and in fullscreen the canvas loses its corners and runs edge to edge.

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

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius and duration from `tokens.ts` through `tokens.css` or the MUI theme; add a role there before using a new value.
- **Do** set every comparable number in tabular figures and pair it with its unit and its word ("$0.04 of $0.51", "1.20 so far of 2.10 GB").
- **Do** draw an overrun in amber however small, and key every status tone in a legend or in words.
- **Do** say an off-scale reference (a cap, a limit) in words rather than drawing it at a false height.
- **Do** open a record's detail in place under its row, one step away, rather than navigating off the list.
- **Do** keep a visible 2 px focus ring on every interactive element and honour reduced motion (hover 120 ms, panels 180 ms, ease-out, 0 ms when reduced).
- **Do** give secondary text a real colour token (`text-2`, `text-3`), never opacity, so contrast tests see the painted colour.

### Don't:
- **Don't** whiten, tint, darken or swap the phase, density or ESP colours for either theme or any finish.
- **Don't** use green, amber, red or the running-blue as decoration, section colour or emphasis.
- **Don't** build KPI-tile grids or wide spreadsheets that push cost off screen on Operate pages; use the strip, the band and one-line rows.
- **Don't** set anything under 11 px, or uppercase labels and buttons.
- **Don't** add drop shadows to Deep Space panels or glows to Light Clean.
- **Don't** let the wordmark's violet gradient leave the wordmark.
