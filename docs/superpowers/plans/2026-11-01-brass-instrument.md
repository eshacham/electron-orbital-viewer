# Brass Instrument Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Deep Space / Light Clean with the Brass Instrument world, with a slight temper per learning level, a serif signature, a dark viewing field in both modes, and the engraved graticule. The result is a prototype for the owner's live test.

**Architecture:** tokens.ts stays the single source. It gains per-level tempers, which are emitted as `:root[data-theme][data-level]` blocks plus a `[data-theme]` scope that nests. The MUI theme is built per (mode, level). The viewing field is a token scope (`data-theme="dark"` on the viewport's overlay layer, plus a nested MUI ThemeProvider), and the renderer's appearance theme is taken from `VIEWPORT_MODE`.

**Tech Stack:** React 19, MUI 7, three.js, Vite, TS, Jest/jsdom, `@fontsource-variable/source-serif-4` (new), `tools/design/shoot.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-01-brass-instrument.md`. The direction contract is in `.impeccable/surfaces/public-index-html.md`, and the comps are in `docs/quantumlab/references/brass/`. Earlier rulings in `docs/quantumlab/checks/*/RULINGS.md` still bind, except where they name a Deep Space / Light Clean colour, glow or the violet wordmark.

## Global Constraints
- **Science colours are never changed:**
  - `src/design/science.ts`;
  - `src/curve_colors.ts`;
  - ESP / density / phase / CPK;
  - `src/orbital_glow.ts`.
- **Product stays the same:** no layout size, control, copy or computed value changes, except what the spec names.
- **Colour sources:** every colour comes from `tokens.ts`. Add a role there before using a new value. No hex in component CSS.
- **Tokens:** `tokens.css` stays generated (`node tools/design/gen_tokens.mjs`), never hand-edited.
- **Admin split:** `/admin.html` may import only `src/design/*`. It has no level, so it gets the Explore temper.
- **TDD and gates:** every behaviour change gets a test that fails first. Before each commit, run:
  - the whole jest suite (`npx jest --maxWorkers=4`; rerun a lone flake by itself);
  - `npx tsc --noEmit -p .`;
  - `npm run build`;
  - `npm run -s check:admin-split`.
- **Don't touch:**
  - `infra/owner.env` (never read it);
  - `tools/jobs/.state`;
  - `tools/molecules/out`.
- **Forbidden:**
  - no `git stash` in any form;
  - no sourcing `infra/*.sh`;
  - ports 5173, 5174, 5416 and 5419 are the owner's.
- **Shots:** use port 5413 only.

## The tempers (exact values)
**Explore is the handoff palette.** The other columns are OKLCH tempers of it. On-accent is `#000000` in dark and `#FFFFFF` in light. On-fill is `text-1` of the same temper, because the selected fill is a tint. `rail-active` = `selected-fill`, and `avatar` = `accent`.

| role | dark/basics | dark/explore | dark/advanced | dark/research | light/basics | light/explore | light/advanced | light/research |
|---|---|---|---|---|---|---|---|---|
| bg-app | #18140E | #141513 | #131513 | #101618 | #F8EFE0 | #F4F0E6 | #F2F0E9 | #ECF1F3 |
| bg-bar | #18140E | #141513 | #131513 | #101618 | #FFF9EA | #FEFAF1 | #FCFAF3 | #F6FBFD |
| surface-1 | #27221C | #22231F | #212321 | #1E2426 | #FFFBEC | #FFFCF5 | #FEFCF5 | #F8FDFF |
| surface-2 | #2E2923 | #2A2A28 | #282B28 | #262B2D | #FDF3E4 | #F8F4EC | #F6F4ED | #F0F5F7 |
| surface-3 | #37322C | #323330 | #313431 | #2E3436 | #F2E8DA | #EDE9E1 | #EBEAE2 | #E5EAEC |
| border-subtle | #3C342B | #353632 | #323733 | #2E373B | #EADCC6 | #E3DED1 | #E1DED3 | #D8DFE2 |
| border-strong | #635337 | #625238 | #5F543E | #5A5546 | #D5C1A7 | #D4C6A8 | #CFC3AD | #C9C4B5 |
| text-1 | #EEE7D8 | #EEE7D8 | #EEE7D8 | #E1E9EC | #292720 | #292720 | #292720 | #22282B |
| text-2 | #BDAD9A | #B9AF99 | #A9B3AB | #A1B3BB | #6E5939 | #655C49 | #615D4D | #545F63 |
| text-3 | #9F8F7D | #9A917E | #8C958D | #84959D | #7E6847 | #746B58 | #706C5C | #636E72 |
| accent / accent-text / accent-fill / selected-edge | #DAAA54 | #C4A15A | #BD9E5E | #B8A87C | #8E6011 | #806020 | #795D24 | #675B37 |
| selected-fill | #443212 | #403319 | #3F341C | #3B3525 | #F8E1C3 | #F3E2C7 | #F1E3CA | #EAE4D2 |
| focus-ring | #EEBD68 | #D7B46D | #D0B170 | #CBBB8E | #8E6011 | #806020 | #795D24 | #675B37 |

**Mode-wide roles (not tempered):**
- **Dark:**
  - status `success #5CC98A`, `warning #F0B429`, `danger #F07167`;
  - `error-bg #3A1D18`, `error-text #F8D3CC`;
  - `plot-grid rgba(238,231,216,.10)`, `plot-axis` = text-3 of explore;
  - `swatch-ring` transparent.
- **Light:**
  - `success #2F7A4A`, `warning #9A5B0B`, `danger #A8322A`;
  - `error-bg #FBEAE6`, `error-text #5A1F17`;
  - `plot-grid #E6DECB`, `plot-axis #746B58`;
  - `swatch-ring #746B58`.
- **The viewing field (both modes):**
  - dark: `canvas radial-gradient(ellipse 70% 60% at 50% 45%, #1B1C19 0%, #10110F 55%, #0B0C0A 100%)`, `canvas-solid #10110F`;
  - light: `radial-gradient(ellipse 70% 60% at 50% 45%, #2A2A26 0%, #20201D 55%, #1A1A17 100%)`, `canvas-solid #20201D`;
  - `scrim` is canvas-solid at 72 %.

**If a pinned contrast test fails on a pair:** a test may pin a pair the table did not check, such as text-3 on surface-3. Then lighten (dark) or darken (light) **only that temper's text-3**, in OKLCH L steps of 0.01, until it passes. Record the value in the report.

**Shadows (both modes):**
- **Panels:**
  - dark `inset 0 1px 0 rgba(255,255,255,.03)`;
  - light `0 1px 2px rgba(41,39,32,.06), 0 1px 3px rgba(41,39,32,.08)`.
- **Popover:**
  - dark `0 12px 32px rgba(0,0,0,.5)`;
  - light `0 12px 24px rgba(41,39,32,.12)`.
- **`selected`:** `0 0 0 1px <selected-edge>`.
- **`selected-tile`** and **`selected-halo`:** `none`. No glows.

**Basics type and shape:** body 14/20, caption 13/18, `--ql-radius-md` 10 and `--ql-radius-lg` 14. These go under `[data-level="basics"]` only. Phone body stays 14.

## Review Focus
1. **A level switch** changes chrome only. Assert this in Task 1:
   - no canvas redraw;
   - no strip thumbnail re-render;
   - no layout size change, apart from Basics type.
2. **A link that raises the level for one visit** must temper the chrome to the visit level, and must not write the stored level. Test in Task 1.
3. **Light mode, inspector drawer open over the dark field** (1024 px): the drawer is in light tokens and readable, and the field's overlays are dark. Test in Task 3.
4. **Phone, light mode:** the top bar and sheet are light, and the field is dark. The caption is readable. Test in Task 3.
5. **PNG export in light mode** composites onto the dark field colour, and the caption stays readable. Test in Task 3.

---

### Task 1: Tokens, level tempers, MUI per level
**Files:**
- `src/design/tokens.ts`, plus the generated `src/design/tokens.css` via `tools/design/gen_tokens.mjs`.
- `src/design/theme.ts`: `quantumTheme(mode, level = 'explore')`.
- `src/design/useQuantumTheme.ts`: an optional level argument.
- A new `src/design/level_temper.ts`: `applyLevelToDocument(level, root)`. It lives in design and has no levels import; the type is a string union declared in tokens.ts as `TemperLevel`.
- `public/index.html`'s boot script: it also sets `data-level` from `eov.level` when that is valid.
- The viewer's wiring: `src/App.tsx` or `src/levels/useLevel.ts` keeps `data-level` = the effective level, visit included.
- `src/a11y/contrast.ts` and its tests.
- `src/design/Wordmark.tsx` / `design.css`: only to remove the violet gradient, so the tests stay coherent. Task 2 restyles it.

**Interfaces:**
- **Produces:**
  - `TEMPERS: Record<ThemeMode, Record<TemperLevel, Partial<ColorTokens>>>`;
  - `VIEWPORT_MODE: Record<ThemeMode, ThemeMode>` = `{ dark: 'dark', light: 'dark' }`. It is exported for Task 3 and unused here.
  - `TOKENS[mode]` = the explore temper merged over the mode-wide roles.

**Steps:**
- [ ] **Step 1: failing tests.**
  - `tokens.test.ts`:
    - every temper cell equals the table;
    - `tokensCss()` emits one block per mode and level, with the selector `[data-theme="<m>"][data-level="<l>"]` and its `:root` twin;
    - the mode blocks are scoped as `:root, [data-theme="dark"]` and `[data-theme="light"]`, so a nested `data-theme` overrides.
  - Contrast, for all 8 tempers:
    - text-1/2/3 on bg-app and surface-1/2 ≥ 4.5;
    - accent-text on surface-1/2 ≥ 4.5;
    - selected-edge and focus-ring on bg-app, surface-1 and selected-fill ≥ 3;
    - text-1 on selected-fill ≥ 4.5;
    - on-accent on accent ≥ 4.5.
  - `quantum_theme.test.ts`: `quantumTheme('dark','research').palette.primary.main === '#B8A87C'`, and Basics' body1 fontSize is 14.
  - Boot script test (`no_flash_script.test.ts`): `eov.level=basics` gives `data-level="basics"` before paint, and a junk value gives no attribute.
  - Viewer test:
    - changing level updates `document.documentElement.dataset.level`;
    - a visit-raised level sets the visit level and leaves `eov.level` unchanged;
    - the renderer's appearance key and the strip's `themeKey` do not change on a level switch.
  - No glow: `SHADOWS.dark['selected-tile'] === 'none'`.
- [ ] **Step 2:** run them and see them FAIL.
- [ ] **Step 3: implement.** Basics' type and radius overrides go in the basics block (CSS vars), and in the MUI theme for that level.
- [ ] **Step 4:** gate.
- [ ] **Step 5:** commit `feat(design): the Brass Instrument palette with a temper per learning level (brass)`.

### Task 2: Serif signature
**Files:**
- `package.json`: add `@fontsource-variable/source-serif-4`.
- `src/design/tokens.ts`: `FONT_SERIF = '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif'`, `--ql-font-serif`, `TYPE.specimen {26,32,500}` and `TYPE.infoTitle {17,24,600}`.
- Import the font once wherever Inter is imported, for both entries.
- `src/design/Wordmark.tsx` + `design.css`:
  - serif 24/28 weight 600 in `accent-text`, one colour, no gradient;
  - phone 20/24.
- `src/shell/TitleBlock.tsx` + css: the title in serif specimen. The subtitle stays Inter.
- Info's title (`src/info/InfoPanel.tsx` / `info.css`): serif infoTitle.

**Tests:** `wordmark.test.tsx`, the TitleBlock and Info tests, `tokens.test.ts`, and an admin test that the admin wordmark uses the serif.

**Steps:**
- [ ] **Step 1: failing tests.**
  - The classes carry `font-family: var(--ql-font-serif)` (CSS-source test).
  - The wordmark has no gradient and no violet hex.
  - The specimen title size var is 26.
  - The font is imported in both entries.
  - The admin bundle still passes admin-split.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implement. Long titles (for example "Magnesium, excited 3s → 3p — whole atom") must not overlap the toolbar: keep the title block's existing max-width and wrapping.
- [ ] **Step 4:** gate.
- [ ] **Step 5:** commit `feat(design): Source Serif for the wordmark, the specimen title and Info's title (brass)`.

### Task 3: The viewing field is dark in both modes
**Files:**
- `src/App.tsx`:
  - `viewportMode = VIEWPORT_MODE[themeMode]` feeds the renderer appearance, `phaseColours`, `curvePalette`, `themed()`, `densitySurfaceHex` in the canvas key, `stripThemeKey` and the thumbnail look;
  - plots in the inspector keep `themeMode`.
- The viewport overlay layer: `data-theme={viewportMode}` plus a nested `ThemeProvider theme={quantumTheme(viewportMode, level)}` around the overlays (title, toolbar, keys, scale bar, strip, notices, busy, hint, unbound, request workspace).
- Page chrome that renders inside `#canvas-container` resets to the page mode with its own `data-theme={themeMode}` and the page ThemeProvider:
  - the inspector drawer `.view-panel`;
  - the phone top bar;
  - the phone sheet;
  - the phone caption.
- `src/export/png.ts`: the backdrop is `canvas-solid` of `viewportMode`.
- The scene axes, `src/orbital_visualizer.ts` `axesStyle`: driven by `viewportMode`. Task 4 recolours them.

**Tests:** `src/App.test.tsx`, the phone tests and `tests/export/*`.

**Steps:**
- [ ] **Step 1: failing tests.** In light mode:
  - the canvas container's overlay layer has `data-theme="dark"`;
  - the drawer and phone sheet have `data-theme="light"`;
  - the renderer receives appearance theme `'dark'`;
  - the inspector plot uses the light curve palette;
  - PNG export uses `#20201D`.

  In dark mode nothing changes.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implement. Scope by attribute, so CSS variables do the work; don't fork components.
- [ ] **Step 4:** gate.
- [ ] **Step 5:** commit `feat(viewer): the viewing field stays dark in both modes; page chrome keeps the page's mode (brass)`.

### Task 4: The engraved graticule; colour sweep
**Files:**
- `src/scale_bar.ts` and its CSS: a 1 px `accent` rule with end ticks (8 px) and 4 graduations (4 px), and the label in `text-1`. Same length logic.
- `src/orbital_visualizer.ts` `axesStyle`:
  - dark field: line `#8F8676` at opacity 0.85;
  - labels in text-1 of the viewport.
  - Replaces `#4F86FF` and `#8090A8`.
- Sweep `src/**/*.css` and the non-science TS for leftover Deep Space / Light Clean literals (`#1FB6F5`, `#2A85F8`, `#1662E0`, the violet), and for `rgba(31,182,245`. Replace them with tokens.
- Selection audit:
  - every selected state (toggle, level row, tabs, chips, strip tile, MO level, (i) pressed) shows the brass edge or marker, not fill alone;
  - the strip tile ring is 2 px `selected-edge`.

**Tests:** a CSS-source test that no listed literal remains outside tokens.ts / science; the scale bar's DOM/SVG has ticks; the axes colours per viewport mode.

**Steps:**
- [ ] **Step 1:** failing tests.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** gate.
- [ ] **Step 5:** commit `feat(design): the engraved graticule; the last blue and cyan literals become brass tokens (brass)`.

### Task 5: Live check
- [ ] **Shots** with shoot.mjs, `--gl metal`, port 5413:
  - Basics Orbitals 2p_z;
  - Advanced Atoms Mg excited 3s→3p;
  - Research Molecules water ESP;
  - Research benzene.

  Take each in both modes at desktop 1492×905, plus 1280×720 for the water shot and phone for Basics Orbitals and water. Add Explore and Advanced shots of one scene to show the temper steps.
- [ ] **Measure:** contrast is sampled live on the title over the field, and on the drawer at 1024 light.
- [ ] **Write** `docs/quantumlab/checks/brass/CHECKLIST.md` with the shots and measured values. "Finish review" and "DESIGN.md" are pending (controller).
- [ ] **Commit** `docs(design): brass — live check and checklist`.
