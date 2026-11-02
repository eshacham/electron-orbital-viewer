---
name: QuantumLab
description: Computed orbitals, atoms, bonds and molecules in the browser, and the owner's metered job ledger, as one matte brass instrument with a dark viewing field.
colors:
  # Brass Instrument, dark mode, Explore temper (the base: :root, [data-theme="dark"]). Source: src/design/tokens.ts TOKENS.dark.
  bg-app: "#141513"
  bg-bar: "#141513"
  surface-1: "#22231F"
  surface-2: "#2A2A28"
  surface-3: "#323330"
  border-subtle: "#353632"
  border-strong: "#625238"
  text-1: "#EEE7D8"
  text-2: "#B9AF99"
  text-3: "#A39A87"
  accent: "#C4A15A"
  selected-fill: "#403319"
  focus-ring: "#D7B46D"
  on-accent: "#000000"
  success: "#5CC98A"
  warning: "#F0B429"
  danger: "#F4746A"
  error-bg: "#3A1D18"
  error-text: "#F8D3CC"
  canvas-solid: "#10110F"
  field-axis: "#8F8676"
  plot-grid: "rgba(238,231,216,.10)"
  plot-axis: "#A39A87"
  scrim: "rgba(16,17,15,0.84)"
  # Light mode, Explore temper ([data-theme="light"]). Source: TOKENS.light.
  bg-app-light: "#F4F0E6"
  bg-bar-light: "#FEFAF1"
  surface-1-light: "#FFFCF5"
  surface-2-light: "#F8F4EC"
  surface-3-light: "#EDE9E1"
  border-subtle-light: "#E3DED1"
  border-strong-light: "#D4C6A8"
  text-1-light: "#292720"
  text-2-light: "#655C49"
  text-3-light: "#716855"
  accent-light: "#806020"
  selected-fill-light: "#F3E2C7"
  focus-ring-light: "#806020"
  on-accent-light: "#FFFFFF"
  success-light: "#2C7747"
  warning-light: "#975804"
  danger-light: "#A8322A"
  error-bg-light: "#FBEAE6"
  error-text-light: "#5A1F17"
  canvas-solid-light: "#20201D"
  plot-grid-light: "#E6DECB"
  plot-axis-light: "#716855"
  swatch-ring-light: "#746B58"
  # The level tempers' accents (TEMPER_TABLE). Every other tempered role is in the sidecar's extensions.tempers.
  accent-basics: "#DAAA54"
  accent-advanced: "#BD9D5C"
  accent-research: "#B7A16E"
  accent-basics-light: "#8E6011"
  accent-advanced-light: "#7A5C20"
  accent-research-light: "#705826"
  # Science colours (src/design/science.ts): meaning, not style. Never re-tinted per mode, level or look.
  phase-positive: "#FF7A2F"
  phase-negative: "#2F6BFF"
  rim-positive: "#FFC59A"
  rim-negative: "#9CC2FF"
  rim-positive-light: "#9A3412"
  rim-negative-light: "#1E3A8A"
  density-surface: "#C9D6E8"
  density-surface-light: "#7A8AA0"
typography:
  wordmark:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.01em"
  wordmark-compact:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.01em"
  wordmark-tight:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.01em"
  specimen:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: "32px"
  info-title:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
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
  body-basics:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
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
  caption-basics:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
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
  md-basics: "10px"
  lg: "12px"
  lg-basics: "14px"
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
  wordmark:
    textColor: "{colors.accent}"
    typography: "{typography.wordmark}"
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
  specimen-title-block:
    backgroundColor: "{colors.scrim}"
    textColor: "{colors.text-1}"
    typography: "{typography.specimen}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  scale-bar:
    textColor: "{colors.text-1}"
    padding: "10px 14px 8px"
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
  curve-handle-filled:
    rounded: "{rounded.pill}"
    size: "18px"
  curve-handle-hollow:
    rounded: "{rounded.pill}"
    size: "14px"
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
    textColor: "{colors.text-1}"
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
    textColor: "{colors.text-1}"
  chip-filter:
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    height: "24px"
  chip-filter-selected:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.text-1}"
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
    textColor: "{colors.text-1}"
  level-line:
    textColor: "{colors.text-3}"
    typography: "{typography.caption}"
  info-section:
    textColor: "{colors.text-2}"
    typography: "{typography.body}"
    padding: "10px 16px 12px"
  info-title:
    textColor: "{colors.text-1}"
    typography: "{typography.info-title}"
  info-computed-summary:
    textColor: "{colors.accent}"
    typography: "{typography.caption}"
    height: "28px"
  info-button:
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    size: "20px"
  info-button-pressed:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.pill}"
    size: "20px"
  info-topic-chip:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.text-1}"
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
  orbital-energy-cell:
    typography: "{typography.figure}"
    padding: "4px"
  phone-caption:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    typography: "{typography.body-phone}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
---

# Design System: QuantumLab

## Overview

**Creative North Star: "The Brass Instrument"**

QuantumLab is a precise scientific instrument, not a showcase. The specimen (the computed orbital, density or molecule) is lit inside a dark viewing field, and everything around it is matte metal and engraved type: obsidian or warm ivory panels, hairline rules, one matte brass for what you can act on and what is selected, and three serif names (the QuantumLab wordmark, the specimen's title, Info's title) set like an instrument's engraving. On the owner's Operate pages the same metal holds the month's money and jobs. The only loud colours on screen are the science colours and the status colours, and both mean something.

Density is deliberate. The viewer is a fixed full-window workstation (top bar; Explore, viewing field, inspector) at 13 px body text; the Operate surfaces are scrolling documents on the same tokens, built from one budget strip, a compact chart band drawn on the page itself, and one-line rows that open in place. Every figure carries its unit and its word ("of", "held", "charged", "so far"), set in tabular figures so columns of money and minutes align.

Two page modes (the theme switch names them Obsidian, dark, and Ivory, light) share every token role; four learning levels temper them slightly. Basics is polished brass for younger learners (warmer grounds, brighter brass, 14 px body, softer corners), Explore is the reference palette, and Advanced and Research grow quieter and more neutral toward a pewter brass for experienced scientists. A temper moves warmth and brass brightness only, never hue, never layout. The viewing field stays dark in both page modes and wears its mode's Explore temper at every level, so switching level or mode never redraws the picture. The system is MUI 7 driven entirely from `src/design/tokens.ts` (tokens.css is generated from it; `theme.ts` builds one MUI theme per mode and level). The world refuses the generic blue SaaS panel and every literal laboratory costume: no gears, rivets, parchment or gold gradients, and no glows.

**Key Characteristics:**
- Matte brass on obsidian (dark) or bronze on warm ivory (light); one accent, used for action and selection only.
- A dark viewing field in both page modes, framed by the engraved graticule: a fine brass scale bar with graduations and a warm neutral axis ink.
- Source Serif 4 in exactly three places (wordmark, specimen title, Info title); Inter Variable for every control, label and number, in tabular figures.
- Selection is a brass-tinted fill, a brass edge and a weight step, never colour alone; no glow anywhere.
- Four level tempers in warmth and brass brightness only; Basics also reads larger and rounder.
- Science colours untouched in every mode and level; status colours carry meaning only.
- Short ease-out motion (120 / 180 ms), zero under reduced motion.

## Colors

A warm neutral ladder (obsidian to ivory) with one matte brass for action and selection, tempered per learning level in warmth and brightness, and a set of meaning-bearing hues that are never decoration.

### Primary
- **Matte Brass** (`accent`, dark) / **Bronze** (`accent-light`): the one accent. It draws primary actions (contained buttons, outlined and text buttons), links and inline accent text (`accent-text` is the same value), the wordmark, the (i) at rest, the caret, the cumulative charged line, the "now" dot and the charged cap-bar segment on the Operate pages, and the graticule's rule and ticks on the field. On a contained brass fill, text is `on-accent` (black in dark mode, white in light, chosen for contrast). `accent-fill`, `selected-edge` and `avatar` all resolve to the accent; `focus-ring` is a step brighter in dark mode (`focus-ring`) and the bronze itself in light.
- **Brass Tint** (`selected-fill` / `selected-fill-light`): the selected state's ground, a low-chroma brass tint, always worn with the brass `selected-edge` and the temper's own `text-1` on top (`on-fill` is `text-1`, because the fill is a tint). Toggles, filter and shell chips, the level switch, the topic chip, a drawn MO level and the browser's own text selection use it. `rail-active` is the same tint.

### Secondary
- **Status set** (`success`, `warning`, `danger`, plus the accent for "running or queued"): what happened to a job. Success green is done-as-predicted; Warning amber is past a prediction or money absorbed past an approval; Danger red is failed. Each mode carries its own values, re-checked for contrast on the warm grounds, and every status colour clears 4.5:1 on all five surfaces (`bg-app`, `bg-bar`, `surface-1` to `surface-3`) in all eight tempers (pinned by tests). Final review I2 lifted three values in OKLCH L steps of 0.01, hue and chroma kept: dark `danger` #F07167 to #F4746A, light `success` #2F7A4A to #2C7747, light `warning` #9A5B0B to #975804.
- **Error surface** (`error-bg`, `error-text`): inline error panels.

### Tertiary (science, not UI)
- **Phase Orange** (`phase-positive`) and **Phase Blue** (`phase-negative`): ψ > 0 and ψ < 0, one pair in every mode. Glow rims are the phase's own lighter tint on the dark field (`rim-positive`, `rim-negative`) and a darker ink for the light variants (`rim-*-light`).
- **Density Grey-Blue** (`density-surface` / `density-surface-light`): a phase-less density surface. ESP maps and orbital curves use their own palettes from `science.ts` (`CURVE_COLORS` and its index-matched light twins). The 3D view, its thumbnails and the canvas keys take the dark science variants in both page modes, because the field is dark; inspector plots keep the page mode's variants.

### Neutral
- **Obsidian and Warm Ivory grounds** (`bg-app`, `bg-bar`): the page and top-bar ground. In dark mode the bar is the page itself; in light mode it is a step paler than the page.
- **Surface ladder** (`surface-1` panels and cards, `surface-2` headers, hovers, open details, key chips, `surface-3` the stronger "linked" state, the keyboard-active search option, gauge and cap-bar tracks, log blocks).
- **Hairlines** (`border-subtle` for every panel, row and cell divider; `border-strong`, a brass-umber, for the level switch's outline, the band's day axis, neutral chips and scrollbars).
- **Ivory and Umber ink** (`text-1` primary and figures, `text-2` secondary labels, `text-3` captions, units, "of …" qualifiers, axis labels). Every text role clears 4.5:1 on every surface it can sit on, in all eight mode × level tempers (pinned by tests).
- **The viewing field** (`canvas`, `canvas-solid`): a radial charcoal gradient in both modes (dark mode near-black, light mode a slightly lifted charcoal, `canvas-solid-light`); the solid value is what a PNG export composites onto. `scrim` is the field's solid at 84 %, behind the specimen title.
- **Field axis** (`field-axis`): the 3D axes' warm neutral ink, the same in both modes because the field is dark in both.

### Named Rules
**The Science Is Not Style Rule.** Phase, density and ESP colours are never whitened, tinted, darkened or swapped per mode, level or look. Where a phase hue falls under 3:1 on its panel (the light mode's orange), a `swatch-ring` outline carries the contrast; the hue stays.

**The Meaning-Only Status Rule.** Green, amber, red and the running accent appear only where they state an outcome, and every use is keyed (a legend, a chip label, or words). Amber means "past a prediction" at any overrun, with no tolerance, or "billed past the approved maximum, absorbed by the app".

**The Selected-Ink Rule.** `text-3` and `accent-text` never sit on `selected-fill` (they measure 4.32 to 4.43:1 there in some tempers); a selected row, chip or option draws `on-fill` or `text-2` (pinned by `tests/a11y/selected_ink.test.ts`).

**The One Brass Voice Rule.** The brass marks actions, selection, the wordmark, the graticule and the one money line; it is never a section tint, a decorative stroke, a gradient or a background wash.

**The Temper, Not Hue Rule.** A learning level changes the chrome's warmth and the brass's brightness only (Basics warmer and more golden, Advanced and Research progressively more neutral on the brass's own hue). It never shifts hue, never moves the layout, and never touches the science colours or the viewing field.

**The Dark Field Rule.** The viewing field and everything drawn on it (title, toolbar, scale bar, keys, strip, notices, the phone header) wear `VIEWPORT_MODE`'s mode, which is dark for both page modes, at that mode's Explore temper at every level. Page chrome that sits inside the field (the inspector drawer, the phone top bar and sheet, pickers, menus opened from the toolbar) keeps the page's mode and level. `VIEWPORT_MODE` in tokens.ts is the one switch that would give a light page its light field back.

## Typography

**Display Font:** Source Serif 4 Variable (with Source Serif 4, Georgia, serif), self-hosted via @fontsource-variable
**Body Font:** Inter Variable (with system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** ui-monospace, SF Mono, Menlo (job keys and logs on the jobs page only; no token yet)

**Character:** An engraved serif names things; a neutral grotesque runs the instrument. Below the three serif names, hierarchy comes from weight (400 / 500 / 600) and ink step, not size jumps.

### Hierarchy
- **Specimen** (Source Serif 4, 500, 26/32 px): the name of what is drawn, top-left on the viewing field over the scrim. On a phone the caption's name takes the serif at the caption's own size instead.
- **Wordmark** (Source Serif 4, 600, 24/28 px, −0.01em, brass): the QuantumLab name in the top bar on the viewer and the Operate pages. It steps to 20/24 below 1160 px and on a phone, and to 18/22 from 860 px down and on a phone under 380 px.
- **Info title** (Source Serif 4, 600, 17/24 px): the selection's or topic's name at the head of Info; 17 px on a phone too (it is a title, not body).
- **Title** (Inter, 600, 20/28 px, −0.01em on Operate pages): page titles ("October 2026"), MUI h1 to h6.
- **Section** (600, 14/20 px): panel and inspector section headings.
- **Nav** (500, 14/20 px; 600 when current): top-bar tabs, panel tabs, the page name beside the wordmark.
- **Body** (400, 13/20 px; 14/20 at Basics and on a phone): all running text and table cells. Buttons are body at 500, sentence case, never uppercase.
- **Subtitle** (400, 13/18 px): the plain line under the specimen title.
- **Caption** (400, 12/16 px; 13/18 at Basics; 12 on a phone): table headers, legends, notes, chip and status text, units, the level switch.
- **Tick** (400, 11/14 px): plot and band axis labels and band job names. Nothing in the product is set under 11 px.

### Named Rules
**The Three Serif Places Rule.** Source Serif 4 sets the wordmark, the specimen title (and the phone caption's name) and Info's title, nothing else. Every control, label, number and running sentence is Inter.

**The Tabular Figures Rule.** Every number that can sit above or beside another (money, durations, memory, ticks, the scale bar's label) is set with `font-variant-numeric: tabular-nums` (`.ql-tabular`).

**The Phone Fourteen Rule.** Body steps to 14 px under the phone query; captions and ticks do not grow. Basics reads body 14 and caption 13 at every width; the viewing field puts the base sizes back.

**The No Shouting Rule.** No uppercase labels and no tracked-out small caps. Inter chrome stays at or under 20 px; only the serif names go larger.

**The Typeset Science Rule.** Names of what is drawn carry real subscripts: an orbital's 3d<sub>z²</sub>, an MO's 1σ<sub>g</sub>, an irrep's 1b<sub>1</sub>, a point group's C<sub>2v</sub> or T<sub>d</sub> (everything past the first letter in a real `<sub>`, so any suffix works), a quantity's R<sub>e</sub>, and in the serif titles a formula's digits too (H<sub>2</sub>O), because Source Serif's subsets carry no subscript glyphs; an underscore is never shown. In the serif names a subscript drops and shrinks (0.68 em, −0.28 em, line height 0) without growing the line box. Signs are a true minus (U+2212); values outside the plain range read "2.66 × 10⁻²", never e-notation. A surface that cannot hold markup (the document title, an export caption, an accessible name built as a string) takes the flat Unicode form ("3dz²", "1b₁", "C₂ᵥ"); a spoken name takes plain digits ("H2O", "1b1", "3dz²"), because screen readers voice Unicode subscript digits inconsistently. One parser feeds all three forms (`src/format/sci.ts`, `src/format/subscripts.ts`, `OrbitalLabel`, `PointGroupLabel`), so they never disagree.

**The eV First Rule.** An energy reads in electron-volts first with hartree in parentheses, held on one line: "−5.41 eV (−0.199 Ha)". A difference carries its sign either way ("+9.05 eV (+0.333 Ha)") at three significant figures, so nothing rounds to "−0.00 eV"; a total energy keeps Ha to five places. One Ha→eV factor (CODATA 2018) lives in `src/format/energy.ts`. The rule covers the Atoms subshell chips (eV alone to three figures, "−8.03 eV", with the full text in the chip's name and tooltip) and the Atoms orbital-energies table (eV before Ha, each column headed by its bare unit, "eV" and "Ha", with the accessible names "Energy (eV)" and "Energy (Ha)"; its own precision is under Orbital Energies Table), the MO level tooltips, the H₂⁺ curve note and the Molecules provenance (totals and corrections with Ha at the job's six places). An eV figure of 1000 or more is a whole number ("−1339 eV"), never "−1.34 × 10³ eV".

## Layout

**Viewer (fixed workstation).** A full-height grid: a 56 px top bar (52 px on a phone), then a workspace with 12 px outer padding and 12 px gutters holding Explore (315 px; 300 px at medium), the viewing field (fluid) and the inspector (290 px; 320 px at 1680 px and wider). Panels pad 16 px with 16 px between sections. Below 1290 px the inspector folds to a 44 px vertical bar over the field's edge and opens as a drawer; Explore can collapse to a 28 px reveal. On a phone (max-width 760 px, or max-height 500 px, or portrait up to 1100 px) the field is the whole screen and the top bar, header and a bottom sheet sit inside it. The field's corners are fixed roles: the specimen title top-left, toolbar top-right, scale bar bottom-left, key column bottom-right (220 px max), with the thumbnail strip (72 px tiles, 16 px labels, 12 px between tiles or groups, 8 px between tiles inside a group) along the bottom. In Orbitals the strip is the picker and never folds (no handle); on a phone it is the first row of the Explore tab, and in Bonds the "Bond length" block follows it directly there. The top bar's gaps close from 24 to 16 px below 1160 px (and between 1100 and 1290 px, where the level switch takes room from search), so the avatar stays on screen at every level from 761 px up.

**Operate pages (scrolling ledger).** A document on `bg-app`, content capped at 1440 px, padded 16/24/48 px, stacked with 12 px gaps: top bar, a month title row with its controls, the budget strip, the month band (about 120 px, no box of its own), filter chips with search and sort, then the list. At 1024 px and below the strip regroups to three columns and memory moves into each row's details; at 600 px and below the strip folds to the available figure behind a disclosure, the band thins, and each row becomes a two-line grid item (molecule / status, then time / cost / action). The Operate pages carry no level, so they wear Explore.

Spacing follows a 4 px step (4, 8, 12, 16, 20, 24, 32). Touch targets are 44 px, the search field 36 px, a control row 28 px. No level changes a layout size.

**Info and the level switch (viewer).** Info sits always open at the top of the inspector, above the accordion, capped at 45 % of the inspector's height; it scrolls inside itself, with a `border-subtle` hairline under it, so the accordion's headers (Plot and data among them) never leave the screen. In a stacked inspector Info takes its natural height with no cap. On a phone Info is a tab of the bottom sheet, and a caption under the header names what is drawn. The level switch sits in the top bar between the tabs and search as a segmented row of four; below 1024 px it is one button naming the level, opening the four as a list in a popover; on a phone the list is titled "Learning level" in the avatar menu, one 44 px row per level.

## Elevation & Depth

Depth is tonal first. Dark-mode panels carry no drop shadow, only a 1 px inner top highlight; separation comes from the surface ladder and hairline borders. Light-mode panels add a soft two-layer umber lift. Popovers float in both modes. The specimen title sits on the field's own colour at 84 % with an 8 px backdrop blur, so its subtitle reads over a lit lobe. Selection adds a 1 px brass ring and nothing more.

### Shadow Vocabulary
- **Panel** (dark `inset 0 1px 0 rgba(255,255,255,.03)`; light `0 1px 2px rgba(41,39,32,.06), 0 1px 3px rgba(41,39,32,.08)`): docked panels, the budget strip and the job list.
- **Popover** (dark `0 12px 32px rgba(0,0,0,.5)`; light `0 12px 24px rgba(41,39,32,.12)`), with a `border-subtle` hairline: menus, popovers, search results, the phone caption.
- **Selected** (`0 0 0 1px var(--ql-color-selected-edge)`, both modes): the 1 px brass ring of a selected chip, a drawn MO level and the selected ml button. It reads the variable, so it follows whichever temper resolved on the element.
- **Selected tile / Selected halo** (`none`, both modes): kept as roles so no rule has to change, and drawn as nothing; the tile's selection is its own 2 px brass edge and the pressed (i)'s is its solid brass disc.

### Named Rules
**The No Glow Rule.** Nothing in the chrome glows: no halo, no bloom, no coloured shadow. A state is a brass edge, a tint and a weight; light belongs to the specimen alone.

**The Tonal Scroll Cue Rule.** A scroller with more below it says so with a tonal fade, not a shadow, glow, arrow or "More": the last ~24 px fade out through a `mask-image` while (and only while) `scrollTop + clientHeight < scrollHeight`. Info's fade is eased in three stops (half, an eighth, then clear) so it reads as fading out, not as a cut line; where the scroller has a hairline under it (Info in the inspector), the mask keeps that last pixel opaque so the hairline stays drawn; the phone sheet, which has none, fades to its edge. The mask is never animated, so reduced motion has nothing to stop. It works the same in both modes.

Its sideways twin is opt-in (the strip's `groupScroll`, Orbitals only): the left, right or both 24 px edges fade from the list's own `scrollLeft` (one pixel of slack at each end), with the same tonal-only mask. The list snaps by subshell group (`scroll-snap-type: x proximity`, each group's start edge) with `scroll-padding-inline: 24px`, so a snapped rest sits flush with where the fade starts and no fade is drawn before the first group. At rest the next group peeks in: a group whose own tiles would end inside the view snaps a little further on, so 32 px of the next group's first tile and its label stand clear of the right fade. Snapping is native, not animated.

**The Glow Finish Is The Owner's Rule.** The 3D Glow finish (`src/orbital_glow.ts`, GLOW_TUNING) is the specimen's own presentation, not chrome, and its values were tuned live by the owner; they are recorded there, not here, and are not restyled. The No Glow Rule does not reach it.

## Shapes

Softly squared, with hairlines. Docked viewer panels and the viewing field take 16 px corners; Operate cards (budget strip, job list), the viewer's jobs cards and the specimen title block take 12 px (`--ql-radius-lg`); key chips, strip tiles, buttons, inputs, toolbar buttons, the phone caption (`--ql-radius-md`) and the folded inspector bar's buttons take 8 px (the open bar's are square, flush in their strip); filter chips, tooltips and the level switch 6 px; small hit areas and the MO level boxes' top corners 4 px. At Basics `md` and `lg` soften by 2 px (10 and 14 px); the field and its contents keep the base radii. Pills (999 px) are reserved for status chips, the topic chip, the avatar, and thin bars (cap bar, prediction gauge). Borders are 1 px hairlines; selection on a control is a 1 px brass edge, and on tabs and tiles 2 px. On a phone and in fullscreen the field loses its corners and runs edge to edge. The brass favicon is the same atom drawing, a brass orbit on an obsidian 7 px-cornered square.

## Components

### Buttons
- **Shape:** gently rounded (8 px; 10 px at Basics), sentence case, body size at weight 500.
- **Contained:** a matte brass fill with `on-accent` text: the one primary action in a panel (request, approve, export).
- **Outlined (small):** brass text and outline, padding 3 × 9 px: row actions ("Open result", "Follow", "Details"), "Charged, held, projected, AWS billed" on a phone.
- **Text:** brass text, no outline: secondary actions (Reload, "Why they differ").
- **Toolbar (field):** 36 px square icon buttons at 8 px, `surface-2` at 80 % over the field with a `border-subtle` hairline, `text-1` icons, `surface-3` on hover.
- **Focus:** a 2 px `focus-ring` outline at 2 px offset on every interactive element, never removed; outlined inputs use their own 2 px focus-ring border instead.

### Chips
- **Filter and shell chips:** MUI small outlined chips (6 px radius, 24 px tall) with a muted count after the label; selected takes the Brass Tint, its `text-1` ink and the 1 px brass ring (`selected` shadow), count included, never MUI's solid accent fill (brass on brass would hide the edge).
- **Status chip:** a non-interactive pill with a hairline border, caption text at 500 in `text-1`, and a 7 px dot in the status tone. The word is one of Queued, Starting, Running, Done, Failed; the dot's tone, not the word, carries "over prediction".
- **Key chips:** the field's keys sit on `surface-2` at 8 px radius with 11 px round swatches.
- **Neutral chips:** the data-tier chips ("Library", "Computed") and the H₂⁺ "exact" chip are small outlined chips in `text-1` on a `border-strong` hairline, with no fill and no status colour: the label is the meaning (the Meaning-Only Status Rule). It is paired with MUI's own class (`.MuiChip-root.neutral-chip`): MUI's injected outlined rule loads after style.css and would draw its grey at equal specificity.
- **Valence dot:** the 7 px dot on an Atoms valence-shell chip (with its "· valence" label) is that shell's own ring colour in the 3D view, read from the same curve palette as the strip's rings, with the `swatch-ring` outline (a 1.5 px `on-fill` ring on a selected chip, where the tint could swallow it); it is never warning amber.

### Cards / Containers
- **Corner Style:** 16 px for docked viewer panels; 12 px for Operate cards (14 px at Basics does not apply to Operate pages, which carry no level).
- **Background:** `surface-1`; headers and open details on `surface-2`.
- **Shadow Strategy:** Panel shadow (see Elevation).
- **Border:** 1 px `border-subtle`; inner cells divide with the same hairline.
- **Internal Padding:** 16 px in viewer panels; 10 × 14 px per budget-strip cell; 6 × 12 px per list cell.

### Inputs / Fields
- **Style:** MUI outlined, small, 8 px radius; search carries a leading magnifier adornment.
- **Focus:** a 2 px `focus-ring` border on the fieldset (the global outline is suppressed on the inner input so it does not overdraw the floating label).
- **Search results:** grouped options on `surface-1`; hover and the keyboard-active option take `surface-3`, and the keyboard-active one also a 2 px inset brass marker down its leading edge, as MUI's selected list rows and menu items do.
- **Browser surfaces:** a text selection is the Brass Tint with `text-1`; the caret is the accent; scrollbars are `border-strong` on a transparent track. Each is set again on every `data-theme` scope, so the field and the page chrome inside it draw their own.

### Icons and Disclosures
- **Icons:** every control's chevron, caret, close or action mark is an MUI icon (`@mui/icons-material`: ChevronLeft and ChevronRight, ExpandMore and ExpandLess, Close, and so on) at the control's small size, aria-hidden; the control's own name carries the meaning. A text glyph (‹ › ▾ ▴) never stands in for one, and "Back to <selection>" in Info leads with a ChevronLeft icon, not a "‹".
- **Details disclosures:** every `<details>` hides the browser's marker; its summary reads label first, with a trailing ExpandMore (`DisclosureChevron`) at the row's far end that turns 180° when open (the hover motion, 120 ms ease-out, instant under reduced motion). Info's "How this was computed" set the pattern; the jobs, quote and molecule-properties disclosures follow it.

**The Real Icon Rule.** A control draws an MUI icon, aria-hidden, never a text glyph (‹ › ▾ ▴), and a `<details>` disclosure shows a trailing ExpandMore that turns 180° in place of the browser's marker.

### Navigation
- **Top bar:** `bg-bar` with a bottom hairline; the brass favicon mark and the serif brass wordmark at left, tabs in nav type (`text-2`, `text-1` and 600 when current, underlined by a 2 px brass `selected-edge` bar 12 px above the bar's foot), the level switch, search and actions at right. Operate pages reuse the bar with the page name beside the wordmark and a "Back to the viewer" link.
- **Panel tabs:** the same nav style and 2 px brass underline, 20 px apart, above a hairline.
- **Phone sheet tabs:** the selected tab is in brass text with a 2 px brass top edge.
- **Drawer bar (below 1290 px):** folded, a 44 px vertical bar of `text-2` labels set sideways at the field's edge. Open, it becomes a quiet horizontal label across the top of the drawer: a `surface-2` strip under a `border-subtle` hairline, 8 px side padding, each tab a 44 px row in nav type and `text-2`, hover `text-1`. The open tab is marked by a 2 px `text-1` underline (an inset bottom shadow) and weight 600: no accent, no fill, no `selected-fill`. A separate "Close panel" control, a 44 px chevron in `text-2`, sits at the bar's far right and returns focus to the open tab. The bar's tabs are the only Plot · Data row in the drawer: the tabbed section does not repeat it, takes the active bar tab's name as its title ("Plot" or "Data"), and its panel is a region labelled by that bar button (the bar's buttons are not tabs, so the panel is not a tabpanel). Docked, stacked and phone keep the section's own title and tab row. The bar sits flush against the drawer's clipped edge, so its buttons draw the 2 px focus ring inside (offset −2 px).
- **Disclosure:** inspector sections are titled accordions, one open at a time; their chevron points down when folded and rotates to point up when open (180°, 180 ms).

### Specimen Title Block (viewer signature)
The name of what is drawn, top-left on the field: the specimen serif (26/32 px, 500, `text-1`, real subscripts that drop and shrink) over the plain subtitle (Inter 13/18, `text-2`), on the `scrim` (the field's solid at 84 %, 8 px backdrop blur), 12 px corners, padding 10 × 14 px, at most the field's width less 280 px. Molecules' tier line sits under the subtitle in the same block. On a phone the caption's name is the specimen title (see Phone Caption).

### The Engraved Graticule (viewer signature)
The field's measuring marks, drawn straight on the field with no card: a 1 px brass rule with an 8 px end tick at each end and four 4 px graduations between (whole-pixel ticks, so they stay sharp), the length label above it in `text-1`, Inter 14 px at 500, tabular figures ("20 a₀"). The brass is the field's own (its mode's Explore at every level). The 3D axes take `field-axis` at 0.85 opacity with `text-1` labels, never the phase orange, because an axis says nothing about phase. A PNG export composites onto `canvas-solid` and draws the same bar, ticks and label at export scale in Explore brass (an export is a document, not the reader's level).

**The Engraved, Not Lit Rule.** The graticule is chrome: thin, brass and still. It never gains a card, a glow or a science colour.

### Budget Strip (Operate signature)
One line of named figures in a 12 px card: Available of cap (with a 4 px pill cap bar: charged in brass, held in a 40 % blend of the accent into `surface-3`), Charged, Held "for running jobs", Projected "by <month end>", and AWS billed "to <day>" against the meter with the gap said in words ("$0.29 more than the meter", or "matches the meter"). Labels are `text-3`, figures semibold `text-1`, swatches 8 px. Why the figures differ sits behind one text-button disclosure as a `surface-2` note, said only as far as the app knows.

### Month Band (Operate signature)
A compact chart drawn straight on the page: a day axis with week ticks, one short bar per job on its day in its status tone (dimmed to 30 % when filtered out, never hidden), a smooth monotone (Fritsch-Carlson) cumulative charged line in brass that cannot appear to fall or overshoot, a dashed brass projection to month end, and a dashed `text-3` cap line. When the month's figures are under half the cap, the band scales to its own figures and states the cap in words above the plot ("cap $8.80 is above this scale"); the cap is never drawn at a false height. Only running and failed jobs are named, in tick type, and only where they fit. A legend keys every line and tone. Marks are a roving-focus keyboard group; hovering or focusing a mark lights its row (`surface-3`) and vice versa.

### Job Rows (Operate signature)
One line per job in a fixed-layout table: molecule name (600) with formula and meta in `text-3`, status chip, run time against prediction (a 56 × 6 px pill gauge with a 2 px `text-1` notch at the prediction; overrun past the notch is amber, and the figure turns amber at 500), memory against prediction, charged "of" approved (right-aligned), and one outlined action: Open result when done, Follow while running, Details otherwise. The row's name is a disclosure that opens details in place on `surface-2` (quote lines, attempts ledger, sizing version, files, diagnostics) in an auto-fill grid of 250 px columns; hover is `surface-2`, linked-from-the-band is `surface-3`. A failed row leads with its reason in `danger`, read from the error code ("SCF not converged").

### Money Precision (Operate rule set)
- **Summaries and rows** show two decimals (`formatUsd`); a row charge under a cent reads "under $0.01" rather than a micro figure.
- **Small figures elsewhere** keep four significant figures below a cent, so nothing reads as zero that is not.
- **Details** print the meter's own micro-dollars (`$0.000000`), so quote lines and attempts add up exactly to "Total charged".
- **Never bare:** every figure carries its word ("held", "of", "estimated", "up to", "absorbed by the app").

### Learning Levels (viewer signature)
Four levels, in reading order Basics · Explore · Advanced · Research, decide which controls exist, how deep Info goes and which temper the chrome wears (`data-level` on the root). Each gated control has one first level (`CONTROL_LEVEL`, `src/levels/levels.ts`): the plot, structure, bond labels, the dipole arrow, orbital energies, properties and axes at Explore; charge, excitation, relativity, combinations, the enclosed fraction, all orbitals, exports, advanced appearance and surface style at Advanced; molecule requests at Research. Picking an orbital, drilling down, the thumbnail strip, opacity, cut-away and Share are never gated.
- **Tempers:** Basics, polished brass: the warmest grounds, the brightest brass, body 14 and caption 13, `md`/`lg` corners 2 px softer. Explore: the reference palette. Advanced: a touch more neutral, the brass a touch deeper. Research: graphite grounds, a desaturated pewter brass, the dense 13/12 type. One temper per mode per level; the full table lives in tokens.ts and the sidecar.
- **Switch:** a radio group (one tab stop; arrows move, choose and wrap; Home and End reach the ends). The segmented row is 32 px tall with a 6 px corner and a `border-strong` outline, options split by hairlines, caption type in `text-2`, hover on `surface-2`; the level in use takes the Brass Tint, a 1 px inset brass edge, `text-1` and 600. Focus draws inside the clipped row (offset −3 px).
- **Pointer line:** under a section whose controls the level hides, one caption line in `text-3` names the nearest deeper level's controls only, with the right verb: "Charge and relativity appear at Advanced". Never a list spanning two levels.
- **Held-value note:** while a hidden control still holds a value off its default, the line says what the picture keeps and where its control lives instead: "Showing Fe²⁺ — charge controls appear at Advanced" (`hiddenValueNote`). Lowering the level never changes what is drawn.
- **Opens at:** Share's menu offers "Opens at", with Recipient's level (the default, which writes no level) then the four levels. A link that needs more than the reader's level raises it for that visit only, said by an info notice in its own row under the top bar; the stored level is untouched.

**The Hide, Don't Grey Rule.** A control above the reader's level is absent, not disabled. Its place holds one quiet line saying where it appears, or what it still holds; a greyed control is never shown.

### Link Corrections (viewer)
A link with out-of-range values opens corrected and says what it corrected in the notice slot (the visit notice's row under the top bar; on a phone, its room under the header): an MUI info notice with `role="status"`, one sentence naming every correction, "This link asked for Z = 200; showing hydrogen (Z = 1).", further ones joined by "; ", a link's minus written as a true minus. Its spoken copy is plain ("m l" for mₗ, "bohr" for a₀, "minus", plain digits), read in place of the typeset one, which is aria-hidden. The notice clears on the reader's first view change after the link (the mode, the species, the selection, or Bonds' system or R) and is dismissed per link. When a link brings both notices, the correction sits 4 px under the visit notice, and the two dismiss buttons have distinct names: "Dismiss level notice" and "Dismiss link correction".

### Info (viewer signature)
One quiet section, always open, that explains the current selection or the term an (i) opened. Heading "Info" in section type; the selection's title in the Info-title serif (17/24, 600, `text-1`, real subscripts that drop and shrink); running text in body `text-2` (14 px on a phone and at Basics); 6 px between blocks; padding 10 × 16 × 12 px. Placement, cap and scrolling are in Layout; its cue is the Tonal Scroll Cue Rule.
- **Order:** title, the plain lead, the facts, the notes that qualify them, the technical text, then "How this was computed". The facts come before the technical text so the numbers stay above Info's fold at Advanced and Research.
- **How this was computed:** a disclosure in caption brass text (28 px row), its body caption `text-3`; folded below Research and open at Research, with the inspector's chevron convention (down folded, up open, 180°). Method, references and validity live here, not in the lead.
- **Bands:** plain text at Basics and Explore; technical text added at Advanced; the full text (method and caveats) added at Research. Each band reads on from the one before. Facts carry their own first level (a point group from Advanced, an experimental value and its citation from Advanced and Research). Glossary terms an (i) opens use the same bands.
- **Lead length:** at Basics and Explore a lead is 3 lines or fewer, with no navigation sentence in it; technical text and notes are short paragraphs, one idea each, never one wall.
- **Topic and the way back:** an (i) switches Info to its term, named by the topic chip in the heading; "Back to <selection>" with a chevron icon before it, in caption brass text, the pressed (i) again, or a new selection returns Info to the selection. Each change is announced once: by focus on the heading after an (i) or Back, otherwise by a polite live region.
- **Science words:** Info explains the phase colours and conventions in words; it never re-tints them (the Science Is Not Style Rule).
- **Empty readout:** a readout slot with nothing to show (Molecules' Selection while nothing is hovered) reads "Nothing selected" in `text-3`, drawn but not spoken, rather than leaving its heading over blank space.

**The Plain First Rule.** Every explanation starts plain and grows by band. A scientific term with an (i) or a reference never appears below the level its band opens at.

**The One Home Per Number Rule.** Each figure has one place on screen. A key number lives in Info's facts, a control's value in that control's readout, a scale in the field's key; the specimen subtitle is one plain line that restates neither the title nor Info's numbers, and adds the method only at Research. A panel line that would repeat an Info fact is dropped.

### Info Button (i) and Topic Chip
- **(i):** a 20 px circle with a 1.5 px ring and a 10 px glyph in brass, transparent at rest, `surface-2` on hover, with a 44 px hit area around it. Pressed, it is a solid brass disc: `accent-fill` with the `on-accent` glyph (black on Obsidian, white on Ivory), so the one (i) whose topic Info is showing reads at a glance (owner review, 2026-11-02: the tint was too close to a resting ring at 20 px). No halo. Brass at rest because it is an action (the One Brass Voice Rule).
- **Semantics:** a native toggle button named "About <term>", with `aria-pressed`, and `aria-controls` naming Info only while Info is in the DOM. Pressing moves focus to Info's heading and brings Info on screen (the phone's Info tab, the folded drawer); pressing the pressed one returns Info to the selection and keeps focus on the (i).
- **Topic chip:** the term Info now explains, as a pill in the heading beside "Info": the Brass Tint, a 1 px inset brass edge, `text-1` caption at 600, padding 1 × 8 px. It is the selection's tint beside the pressed (i)'s solid disc, so the term and its button read as a pair.
- **Placement:** an (i) sits right beside the word it explains ("Shells (i)", "Shell n (i)", a fact's label), never floating at a panel's far edge. A gloss on a whole control may close that control's row (Relativity's segmented control, the ESP key).

**The One Pressed (i) Rule.** At most one (i) is pressed at a time, and only the one whose press set the topic; a second (i) for the same term elsewhere stays at rest.

### Fact Grid
Info's key facts as a definition list in tabular figures (the Tabular Figures Rule): label in `text-3` at the left, value in `text-1` at the right, 12 px between, 2 px between rows. A label takes its max-content width and keeps to one line ("Total energy", "Measured (NIST)", "HOMO–LUMO gap"); there is no minimum label column. A label never sits alone on its line: label and value share one row, and the value takes the rest of it, right-aligned. A value is held with no-break spaces and wraps in its own column only at its no-break boundaries: between "… eV" and "(… Ha)" ("−2976.40 eV" / "(−109.38074 Ha)"), after a "·", or after a held "),", so a note in "(−0.50100 Ha), upper estimate" may take its own line; never inside a number. Only when the value's longest part cannot sit beside the label's one line does the label wrap, and the value still stays beside it, never below. A long label may wrap, but a reaction stays together: "Ionisation energy" / "(Fe → Fe⁺)", never at the arrow. A label may carry its (i), which stays with the label's last word.

### Subshell Chips (Atoms)
One width for every chip in a shell (owner review, 2026-11-02): the row is a grid of equal columns (`repeat(auto-fill, minmax(120px, 1fr))`) and each chip fills its cell, so 3s, 3p and 3d, or a j-level's 5f⁵⁄₂, never differ in length. A chip reads three lines, the same break in every chip: the name and occupancy ("3d · 6 of 10 e⁻"), the value ("−8.03 eV"), then "orbital energy"; the value and its words each hold together. The m_l row under it keeps its natural widths.

### Orbital Energies Table (Atoms)
The whole atom's subshells in energy order, one row each: Subshell, Electrons, then the energy in eV and in Ha (the eV First Rule), at body size in tabular figures, each row over a `border-subtle` hairline, with 4 px cell padding. The two number columns and their headers are right-aligned, and no header wraps. The energy headers are the bare units, "eV" and "Ha", with the accessible names "Energy (eV)" and "Energy (Ha)", so a heavy atom's figures fit the 300 px Explore panel without a sideways scroll. The table keeps its own precision, judged on the rounded value: Ha has 1 decimal at |E| ≥ 100 Ha and 3 below ("−3689.7", "−0.199"); eV is a whole number at |E| ≥ 1000 eV and has 2 decimals below ("−100392", "−5.41"). Every other Ha display keeps its own places.

### Phone Caption
On a phone, a one-line pill under the header names what is drawn: "<title> · <one qualifier>" ("Carbon · electron density"; an orbital's qualifier is its enclosed share; a Bonds view's is its R, at Basics in Å in the curve's words ("distance between nuclei 1.10 Å") and from Explore up in a₀ ("R = 2.13 a₀")). The phone header is a window of the field (it wears the field's mode and Explore temper). Body-phone type: the name in the serif (the phone's specimen title, at the caption's own size) in `text-1` with real subscripts and an ellipsis when long, the qualifier in Inter `text-2` and never cut; `surface-1` with the popover shadow, 8 px corners (`--ql-radius-md`), padding 4 × 10 px. While the view loads the qualifier says "loading…". It is announced once per change, after the field stops waiting, from a hidden polite copy with plain digits; Info leaves a new selection to it, so a reader hears each change once.

### Thumbnail Strip as Picker (Orbitals signature)
In Orbitals the picture is the control: the left panel keeps one chip row, Shell n, and the strip under the field picks the orbital. It is always expanded (no collapse handle). Tiles are grouped by subshell (3s, 3p, 3d; 9s to 9l), each group a labelled `role="group"`; tiles are windows of the field, rendered dark in both modes, and the selected tile wears a 2 px brass `selected-edge` ring with its label in `text-1` at 600, no glow. A pick from the strip or a Shell n chip draws that orbital at every level.
- **Group labels:** the group's heading in section type (600, 14/20 px) in `text-1`, sticky inside its own group so the group on screen is always named: at rest it stands where it is laid out; once the strip has scrolled it holds 24 px from the list's edge, just past the left fade. Elsewhere (other modes' strips) group labels stay 500 11/14 px in `text-3`.
- **Tile labels:** on a phone a long name breaks only before its "(" ("9g" / "(mₗ = −2)"), never inside either part.
- **Scrolling:** by subshell group, with the sideways twin of the Tonal Scroll Cue Rule and the next group peeking in at rest (Elevation). A pick rests where a snap would when the picked tile stands clear of both fades there; otherwise it is centred.

### Bond Length Block (Bonds signature)
R's whole story is one block, read top to bottom as one instrument: the "Bond length" heading (section weight, `text-1`) with its (i), the readout, the R slider, then the potential curve at the block's full width, its legend, its axis row and the Rₑ note. 2 px between parts; the curve is in flow, with no card of its own. The energy at R is Info's fact, so the block has no energy readout (the One Home Per Number Rule). On a phone the block comes right after the strip, above the identity card and the molecule select.
- **One axis:** the slider's track is inset by the plot's own gutters (the left margin the plot reports, which widens to fit its energy labels, and its 8 px right pad), so the thumb stands over the curve's marker to a tenth of a pixel.
- **Marker:** a 1 px dashed `text-1` line (3 2) at R, with a 3 px dot in each series' colour where that series is on the plot.
- **Handle:** a 10 px dot in the colour of the series it rides (the drawn state's curve, else the first), a 2 px gap in `surface-1` (the plot's own ground), then a 2 px brass `selected-edge` ring: 18 px across, so the ring reads on any fill. The dot meets the gap with a soft stop over its last half pixel, so its edge is never a staircase at 1x. No halo. Its hit area is 44 px across with an `ew-resize` cursor; a drag that starts on it keeps its offset from the centre, a tap elsewhere on the curve sets R there. Where its curve is off the plot at R, or has no value there, the handle stays on the marker line at the plot's edge as a hollow ring, unchanged (the 2 px ring alone, no fill and no gap, 14 px across), so it never reads as a point at a false energy.
- **Rₑ line:** a 1 px dotted line (1 3) in `text-2` at the fitted Rₑ, keyed by its note under the plot in the same `text-2` (it states no outcome, so it takes no status colour; it stays unlike the marker's dashed `text-1`). He₂ has no well, so it has none.
- **Basics words:** the readout and the slider's value text read "Distance between nuclei 1.10 Å"; the plot is titled "Energy (eV)", its x-axis row reads the ends in Å around "Distance between nuclei (Å)", the energy ends round to 2 significant figures with 0 labelling the separated-atoms line (an end within 16 px of the 0 gives way to it), H₂⁺'s legend reads "bonding · antibonding · apart", and the note reads "Dotted line: most stable, 1.10 Å".
- **Explore and up (Research included):** the readout keeps "R = 2.07 a₀ (1.098 Å)", each axis end carries its unit ("1.66 a₀ · R · 2.41 a₀"), the legend takes the symmetry labels with real subscripts, and the note names Rₑ and Dₑ in full.

### MO Diagram (Bonds, science corrections S1)
A plot, drawn flat on the panel like the radial and potential plots: the levels sit at their true energies on one linear eV scale, read off an axis at the left. It is 260 px wide by default, with a 34 px axis gutter and the levels starting 4 px past it.
- **One scale:** every system shares 5 px per eV, so a 0.1 eV split reads as nothing and a 13 eV gap reads as a gap. Drawn to scale are every level holding electrons and the lowest wholly empty one. The diagram's height follows their span, capped at 320 px. A system taller than that is the one exception: its whole scale shrinks to fit, and one caption line under the axis, in tick type and `text-3`, says "scale reduced to fit".
- **Axis:** a 1 px `plot-axis` line with 4 px ticks. Tick labels are whole eV with a true minus and no unit ("−10", "0"), in tick type, `text-3` and tabular figures, set right against their ticks. Ticks come every 5 eV under a 20 eV span and every 10 eV otherwise. On a shrunk scale the step stays, unless its ticks would fall under 16 px apart; then it takes the first coarser step (20, 50, 100, …) that clears 16 px. An axis holding fewer than two ticks widens to the round values on either side, so two labelled ticks always give the scale. The unit "eV" is named once, in the same tick type, at the head of the to-scale part: the top of the gutter, or just under the upper break when the higher empty levels fold.
- **Breaks:** two bands are not to scale, each behind a break. A break is one 11/13 px `text-2` line beside the levels, with two slanted `plot-axis` strokes interrupting the axis. "≈ core" sits under the highest gap over 1 Ha at or below the HOMO (the highest such gap, not the widest; gaps among the empty levels never count), and every level under it goes into the core band. H₂⁺, with one electron, never has one. "≈ higher empty levels" sits above the lowest wholly empty level, and every level above it folds into the band over the break. A level is drawn with both spins, so a half-filled level counts as filled (O₂'s 1πg* stays to scale and 3σu* is its lowest wholly empty level). Inside a band (core or folded), levels run in ascending energy, left to right in one row at one even 8 px gap (a band's x says nothing but order), and a full row wraps to the row above.
- **Close levels:** a level is never moved up or down. Levels are placed lowest first, each at the leftmost place where neither its boxes nor its label come within 8 px of a level already drawn, so of two levels closer than a box, the higher steps right.
- **Tooltip:** a level box's hover title gives the energy eV first: "3σg: ε = −11.92 eV (−0.438 Ha)". Its accessible name says what it draws, not the energy (the One Home Per Number Rule).

**The True Height Rule.** An MO level sits at its own energy on the diagram's one scale. A collision is cleared sideways, never by moving a level up or down, and anything not drawn to scale sits behind a marked break.

### MO Level Buttons (Bonds, owner R26)
Each level box in the MO diagram is a native toggle button (22 × 18 px) named for what it draws ("2σg orbital, 2 electrons"), so it looks pressable: at rest a `surface-2` tile edged by a `border-subtle` hairline, standing on its 2 px `text-1` level line, with 4 px top corners; `surface-3` on hover (120 ms), its hairline taking `border-strong` on the three sides that are not the level line; and, when it is the orbital drawn, the selection: the Brass Tint, a brass edge on its three sides plus the 1 px brass `selected` ring, `text-1` arrows and level line, with `aria-pressed`. Focus keeps the global 2 px ring. At Basics and Explore one `text-3` caption under the heading says "Pick a level to draw that orbital."

**The Never Colour Alone Rule.** Every selected state wears three things: the Brass Tint (or, on a tile or tab, no fill), a brass edge (1 px on controls, 2 px on tabs and tiles, a 2 px inset marker on list rows), and a weight or ink step; `aria-pressed`, `aria-selected` or `aria-checked` says it too. A tint alone, or a solid brass fill that hides its own edge, is never a selection.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius and duration from `tokens.ts` through `tokens.css` or the MUI theme; add a role there, in every temper, before using a new value.
- **Do** temper a level in warmth and brass brightness only, from the Explore base, and check every text role at 4.5:1 and every edge and focus ring at 3:1 in all eight mode × level tempers.
- **Do** keep the viewing field dark in both page modes, at its mode's Explore temper, and put page chrome that sits inside it back in the page's mode and level.
- **Do** mark a selection with the Brass Tint, a brass edge and a weight or ink step together.
- **Do** set the wordmark, the specimen title and Info's title in Source Serif 4 with real `<sub>` digits, and everything else in Inter.
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
- **Do** say what a corrected link changed in its notice, with a plain spoken copy, and clear it on the reader's first view change.

### Don't:
- **Don't** whiten, tint, darken or swap the phase, density or ESP colours for any mode, level or finish.
- **Don't** shift hue between levels, or let a level move the layout or redraw the picture.
- **Don't** add a glow, halo, bloom or coloured shadow to any chrome; and don't add gears, rivets, parchment, gold gradients or any other laboratory costume.
- **Don't** use the brass as a section tint, a decorative stroke, a gradient or a background wash, and don't use green, amber, red or the running accent as decoration or emphasis.
- **Don't** select with colour alone, or with a solid brass fill whose edge cannot be seen.
- **Don't** set the serif anywhere but the three names, or set anything under 11 px, or uppercase or track a label or button.
- **Don't** build KPI-tile grids or wide spreadsheets that push cost off screen on Operate pages; use the strip, the band and one-line rows.
- **Don't** grey out a control the level hides, or let lowering the level change what is drawn.
- **Don't** print e-notation, a hyphen for a minus, or an underscore in a name.
- **Don't** repeat a figure across the subtitle, a panel line, the field's key and Info.
- **Don't** cue more content with a drop shadow, a glow, an arrow or a "More" label; use the tonal fade.
- **Don't** draw a chevron, caret or close mark as a text glyph (‹ › ▾ ▴), or leave a `<details>` on the browser's marker; use the MUI icon, aria-hidden.
