# Phase 6G-1 — QuantumLab shell, both themes and the Atom view: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor opening the viewer sees the concept's scientific workstation — top bar with real search, mode rail, Explore panel, a large glowing 3D view with its title, toolbar, key column and orbital strip, and a data inspector — in Deep Space or Light Clean, with the Atom mode fully re-composed and every other mode still working inside the new shell; deployed to the site.

**Architecture:** `src/design/tokens.ts` is the single source of every colour, size and shadow; a generated, checked-in `tokens.css` themes the first paint, a MUI theme is built from the same tokens, and an inline script sets `<html data-theme>` before CSS loads. Small localStorage-backed preference stores (`createPref` + `useSyncExternalStore`) hold the theme, brand and presentation choices outside Redux and outside share links. `App.tsx` keeps all its state and effects and hands slots to a new `src/shell/AppShell.tsx` grid (top bar, rail, Explore, viewport cell, inspector); the viewport cell stays `#canvas-container` with the one WebGL canvas, and every overlay zone in it is measured as a camera inset. The renderer gains `setAppearance()`, which recolours, re-materials and restyles the scene in place (Glow, Solid, Wireframe; Phase, Density, Classic), and a `ThumbnailService` that renders the atom strip's thumbnails through the main renderer.

**Tech Stack:** React 19, MUI 7 (+ `@mui/icons-material`), Redux Toolkit, three r176, Vite 6, TypeScript 5.8, Jest 29 + ts-jest + Testing Library (jsdom), `@fontsource-variable/inter` 5.x (OFL), Node 24 (runs `.ts` imports from `.mjs` tools natively), Playwright 1.59 from `/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` (live checks only).

**Spec:** `docs/superpowers/specs/2026-10-13-phase-6g-quantumlab-redesign-design.md` (binding) — this plan implements **only its 6G-1 sub-phase** (§16). Visual target (binding): `docs/quantumlab/references/theme-comparison.png` (Option A "Deep Space" = dark, Option B "Light Clean" = light) and `docs/quantumlab/references/original-concepts.png` (Option 1 Dark Modern atom view, Option 2 Light Clean atom view). Executors read the spec section a task names before starting it.

**Worktree:** `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab`, branch `design/quantumlab-redesign` (contains `origin/main` at `15feebc`). **Every command in this plan runs from that directory.** Measured on this worktree on 2026-10-13 before any change: `npm ci` 15 s; `npx jest` 157 suites passed, 1 skipped, 3451 tests passed, 75 skipped, ~111 s; `npm run build` ~3.5 s; `npm run check:admin-split` "admin split ok"; `npx tsc --noEmit -p tsconfig.json` exit 0 with no output.

## Global Constraints

Copied verbatim from the spec. Every task's requirements include this section.

- "**The science is fixed.** Isosurface values, enclosed fractions, the meaning of phase, legends, captions, orbital labels, method strings and every number stay exactly as they are. The redesign changes only how things look and where they sit." (§3.1)
- "**One canvas.** There is one `WebGLRenderer`, created once and never remounted by a theme, brand, layout or screen change. Thumbnails reuse it (§12)." (§3.2)
- "**Every colour is labelled.** Any hue on the 3D view, in a plot or in a thumbnail has a key on screen or in its accessible name." (§3.3)
- "**Tokens are the single source.** `src/design/tokens.ts` holds every colour, size and shadow for both themes. CSS custom properties, the MUI theme, the renderer's appearance and the contrast tests all read it." (§3.4)
- "**Real or absent.** A control, card, number or link exists only if it does something real." (§3.5)
- "Desktop navigation sits on the left (rail + Explore), view data on the right (inspector). The phone uses `.phone-header` plus `PhoneSheet`. The viewport frame adds fixed overlay zones (title, toolbar, key column, strip, §8.5). Each zone is measured as a camera inset, so the camera never frames the object under one, and nothing else floats over the canvas." (§3.6)
- "All values live in `src/design/tokens.ts` as `TOKENS.dark` and `TOKENS.light`. `src/design/tokens.css` is generated from that file (`node tools/design/gen_tokens.mjs`) and checked in, so the first paint is already themed; a test fails if the two differ. Names are `--ql-<group>-<role>`." (§4)
- "Inter Variable, self-hosted (`@fontsource-variable/inter`, OFL), replaces Roboto from Google Fonts. That removes a third-party request. The fallback is `system-ui, -apple-system, "Segoe UI", sans-serif`. Numbers in tables, readouts and KPIs use `font-variant-numeric: tabular-nums`." (§4.3) "On a phone, body is 14 and captions 12. Nothing is smaller than 11 px." (§4.3)
- "Under `prefers-reduced-motion` glows stay (they are static). Only movement is removed (§4.7)." "Nothing pulses, breathes or auto-rotates." (§4.6–4.7)
- "**Storage.** One key, `eov.theme`, set to `'dark'` or `'light'`. If it is absent, the theme follows `prefers-color-scheme` live (a `change` listener)." "On first load, the foundation's two keys (`eov.quantumlab.theme` and the kit's `eov-color-theme`) migrate into `eov.theme` and are deleted." "If localStorage is unavailable (Safari private mode), the choice lasts the session in memory." "The `storage` event keeps open tabs and `/admin.html` in step." (§6.1)
- "**Never in a link.** `encodeStateOf` is untouched. A test asserts the share URL is byte-identical before and after a theme or brand switch." (§6.5)
- "**Presentation preferences**, all in localStorage and never in links: `eov.render` holds surface style (`glow | solid | wireframe`) and scheme (`phase | density | classic`). `eov.display` holds `showAxes` and the radial plot tab." (§6.7 — see Ruling R1 for `wireframe`)
- "`useBrand()` resolves the brand from localStorage `eov.brand`, then from `DEFAULT_BRAND_ID`." "Only the owner can change it: a "Brand preview" radio list in the avatar menu, shown only while `selectIsOwner`. On the dev server only (`import.meta.env.DEV`), `?brand=<id>` also sets it, for quick screenshots." "An unknown id falls back to the default. The brand is never written into a share link." (§5)
- "Every gradient stop and solid accent is held to 4.5:1 against `bg-bar` (dark: 4.9–9.7:1; light: 5.4–7.1:1), and a test pins this." (§5)
- "The breakpoint names follow `useMediaQuery.ts`. `NARROW_VIEWPORT` (the phone layout) is unchanged. `MEDIUM_VIEWPORT` moves from `< 1200` to `< 1290`, the width below which the docked inspector would push the canvas under 560 px." (§7)
- "`#canvas-container` and `#orbital-canvas-host` keep their ids and their pointer handling." (§8.5)
- "Class names that tests or insets read (`.side-panel`, `.view-panel`, `#controls`, `.radial-plot`, `.phone-sheet`, `.molecule-legend-stack`…) are kept or moved together with their tests." (§10)
- "Mode items are buttons with `aria-pressed`, which keeps the accessible name and role tests rely on. They dispatch `handleModeChange` exactly as the old `Controls` Mode toggle did, so the four modes and their side effects are unchanged." (§8.2)
- "**Ruling:** the rim is the *same phase's* tint, never the other phase's hue." (§11.2) "**What does not change.** The geometry and its vertices, the iso value, cut planes, caps, stencil passes and opacity. Glow is presentation only." (§11.2)
- "`scheme = classic` restores today's colours, materials, axes and caps exactly (a test compares the uniforms and vertex colours to the old constants), over the theme's background." (§11.3)
- "The concept's High/Low bar therefore exists only where a scalar is really mapped. It is never shown beside a phase-coloured picture as if it described the surface." (§11.5)
- "**Decision: two sources, split by what the data allows. There is never a second WebGL context.**" (§12)
- "**Contrast.** WCAG AA in both themes" … "Large text, icons, control edges in their selected state, the focus ring, chart marks and plot curves need ≥ 3:1." (§13) "**Focus.** A 2 px `selected-edge` (dark) or `#1662E0` (light) outline with a 2 px offset, never removed, on every interactive element, MUI included." (§13) "**Search shortcut** ⌘K / Ctrl+K. It has a modifier, so it is outside WCAG 2.1.4. There are no single-key shortcuts." (§13)
- "`/admin.html` keeps its own entry, bundle and `ADMIN_ROOT_CLASS`. It reads `eov.theme` and `eov.brand`, and imports only `src/design/*` (tokens, theme, brand, ThemeSwitch, wordmark), none of the viewer's modules beyond what it imports today. `npm run check:admin-split` must stay green. Its markers stay `eov-admin-dashboard` and `Daily spend`." (§9.7)
- "**Out:** … Bloom post-processing (§11.4). A starfield or textured background, a decorative nucleus …, and "Show nodes" or "Model type ψ / |ψ|²" toggles, which the renderer does not have. … Any change to the solvers, workers, isosurface levels, enclosed fractions, jobs API, billing or Cognito." (§2)
- "Each sub-phase ships on its own: tests green, reviewed, deployed with `deploy.sh` (site), `check:admin-split` run after the build, the live visual check committed, and the owner told which environment it is in." (§16)
- 6G-1's scope, verbatim (§16): "Tokens, `tokens.css` generation and the font. Theme mechanics and migration; brands with the owner selector. Top bar: tabs, real search over elements, molecules, Bonds systems and Basic orbitals, help, theme switch, avatar. Rail; Explore panel; viewport frame (title, toolbar, keys, axes, strip); inspector. The Atoms screen complete (§9.1), including atomic weights, the electron count, the R / |R|² / ρ plot tabs and orbital facts. The 3D mapping (§11), with Glow, Classic and the theme palettes. `ThumbnailService` for atom strips. Phone and tablet baseline: themed, top bar, sheet restyled. Basic, Bonds and Molecules work inside the new shell with today's panels placed into the Explore and inspector slots and themed, not yet re-composed."

### Process rules (binding on every task)

- **Run every command from** `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab`. Use absolute paths with the Read/Edit/Write tools.
- **Foreground commands only.** Never background a command, never use `&`, `nohup` or `run_in_background`; no subagents. A command that starts a server (Vite) starts and stops it inside the same foreground command (`tools/design/shoot.mjs` does exactly that). Use the Bash tool's `timeout` of 600000 ms for `npx jest` (≈2 min) and for live checks (≈2–6 min).
- **Never** use the owner's browser, the Chrome extension tools, or the owner's dev servers (ports 5173 and 5391; also never 8787). Live checks run their own Vite on a free port (5411 by default; 5412–5419 if busy) and their own headless Chromium.
- **Never touch** `tools/jobs/.state/` or `tools/molecules/out/`. **Never read `infra/owner.env`. Never `source` `infra/deploy.sh` or `infra/jobs.sh`.** Any test that runs a script stubs `aws`, `cdk`, `docker`, `npm` and `node` first on `PATH` and sets `AWS_REGION=us-east-1` (this plan adds no such test: `infra/` is not changed). Python is not needed; do not run `tools/molecules/.venv` tests.
- **Commits:** `git add <paths>` then `git commit -m "<subject>" -m "<body>" -- <paths>` with the same explicit paths, never `git add -A`/`git commit -a`. The subject ends with `(Phase 6G-1)`. The message ends with a `Co-Authored-By:` trailer naming the model that makes the commit; the commands below show `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` — a different model names itself. Never push.
- **Tests:** a task is done only when `npx jest` (whole suite), `npx tsc --noEmit -p tsconfig.json` and `npm run build` pass, and `npm run check:admin-split` prints "admin split ok". Existing tests are changed only where this plan says so, each change with a one-line comment saying why (behaviour assertions — roles, names, dispatches — are kept; colour literals move to tokens). No test is deleted without a replacement.
- **Live visual verification** (tasks marked **[visual]**): run `node tools/design/shoot.mjs …` (Task 3 creates it) as that task's step says; it writes `/tmp/6g1-<task>-<scene>-<theme>-<size>.png` and `/tmp/6g1-<task>-metrics.json`. Then open every screenshot with the Read tool, open the concept (`docs/quantumlab/references/theme-comparison.png` Option A for dark and Option B for light; `original-concepts.png` Options 1 and 2 for the atom view), and write `/tmp/6g1-<task>-checklist.md` with the five headings below, each line "pass" or "fail — <what and where>". A "fail" on anything the task owns is fixed before the commit; a "fail" that belongs to a later task names that task.
  1. *Colours* — the metrics file's `samples` (page, top bar, rail, panel, inspector, canvas edge) against their tokens: ΔE₀₀ ≤ 3 for UI tokens, ≤ 5 canvas-on against canvas-off.
  2. *Spacing* — `boxes`: top bar 56, rail 76 (184 at ≥ 1680), Explore 315, inspector 290 (320 at ≥ 1680), gutters 12, each ±2 px.
  3. *Typography* — `fonts`: family starts with "Inter Variable"; title 20/600, nav 14/500, body 13/400, caption 12/400.
  4. *Components* — present and shaped as in the concept (name each one the task touched).
  5. *Science* — iso note, enclosed fraction, key wording and orbital labels unchanged (compare the visible text with the same scene on `main` described in the task); `webglCanvases` is 1; `errors` is empty.
- **Estimates** are wall-clock for one executor including the full test run; the owner wants them stated before each task starts.

## Review Focus

The five inputs or conditions the spec implies but no feature test would naturally exercise, most likely first. Each is pinned by the named test in its owning task.

1. **A theme or brand switch in the middle of a session** — expected: the share link copied afterwards is byte-identical to the one copied before (theme and brand never enter a link). Test: Task 8, `src/App.test.tsx` › `App: shell` › `a theme or brand switch leaves the share link byte-identical (Review Focus 1)`.
2. **localStorage that throws or is absent** (Safari private mode, a locked-down profile) — expected: theme, brand and presentation choices still apply for the session, in memory, and nothing throws. Test: Task 2, `tests/design/local_pref.test.ts` › `keeps the choice in memory when localStorage throws (Review Focus 2)`.
3. **The Density colour scheme with no cut, or at the whole-atom level** — expected: no High/Low colour bar stands beside a phase-coloured picture; the key column says "Pick a cut axis to see the density inside" and keeps the ψ key. Test: Task 12, `tests/shell/key_column.test.tsx` › `density scheme without a cut says how to see it and shows no colour bar (Review Focus 3)`.
4. **Switching mode on a phone, where the old Mode toggle is gone** — expected: the phone mode menu reaches all four modes and keeps the toggle's side effects (entering Molecules lowers an untouched opacity to 0.6; leaving gives it back). Test: Task 8, `tests/App.molecules.test.tsx` › `on a phone, the mode menu enters and leaves Molecules with the old toggle's opacity rule (Review Focus 4)`.
5. **Short or ambiguous search input** ("c", "1", "  ", "zz", "H₂O") — expected: an exact symbol or atomic number ranks first ("c" → Carbon before Calcium and Chlorine), whitespace returns nothing, nonsense says "No matches", subscript and plain formulas match alike. Tests: Task 5, `tests/search/search_index.test.ts` › `ranks an exact symbol first and ignores blank input (Review Focus 5)`; Task 7, `tests/shell/global_search.test.tsx` › `says No matches for nonsense (Review Focus 5)`.

## Rulings this plan makes (where the spec could not be followed as written, or left a choice)

- **R1 — Glow is a finish of the solid surface; Wireframe stays the link's.** Today the link carries `surf=solid|wire` (`url_state.ts` `encodeViewKeys`), so "surface style in `eov.render`" would either change links (forbidden by §6.5) or contradict them. The Display tab offers Glow / Solid / Wireframe; Wireframe dispatches `setSurfaceStyle({ mode: 'wireframe' })` exactly as today (link `surf=wire`); Glow and Solid both dispatch `mode: 'solid'` (link `surf=solid`) and store the finish in `eov.render` as `{ finish: 'glow' | 'solid', scheme }`. A link therefore opens in the receiver's own finish, never in a different shape.
- **R2 — The "Radial distribution" tab keeps today's curves and axis title at every level.** At subshell and orbital level today's plot is the subshell's D(r) = N·r²R(r)² (titled "Radial distribution D(r) = 4πr²ρ(r)"); renaming it "P(r) = r²R(r)²" would change either the title or the exported numbers (ruling C6, and §3.1). The two new tabs carry exact titles: "Wave function R(r)" and "Probability density |R(r)|² — radial factor of |ψ|²"; at atom and shell level "Density ρ(r) = D(r)/4πr²". Under scalar or spin–orbit relativity R(r) is the large component and its title says "(large component)".
- **R3 — Learning and Gallery are absent in 6G-1.** No lessons exist (§9.6 already hides Learning until they ship) and the Gallery screen is 6G-3 (§16). "Real or absent" (§3.5) wins over the concept's tab row: the top bar shows Explore and Molecules; the rail shows Atoms, Basic Orbitals, Bonds, Molecules and (owner) Admin.
- **R4 — Search covers computed molecules for the owner only, until 6G-3.** §8.3 searches "every finished computed molecule … from the public index (§9.5)"; that index is built in 6G-3. Until then the search uses what the picker uses today: `withComputed(index, isOwner ? computedJobs : null)`.
- **R5 — "Whole atom" and shell tiles are ring glyphs, not GPU thumbnails.** A shell view is a stencilled cut face with no mesh for `ThumbnailService` to render; those tiles are drawn with Canvas 2D from the profile's own D(r) and shell palette (the cut face's data). Orbital tiles are rendered through the main renderer as §12 says.
- **R6 — No viewport toolbar on a phone.** §7 and §9.8 give it no place; Reset view, Share and Export stay at the end of the phone's View tab (where they are today).
- **R7 — The inspector is stacked (Plot, then Data) inside the phone sheet's Plot tab**, without inner tabs, so the sheet's own "Plot" tab name stays unique for users and tests.
- **R8 — Admin in 6G-1 gets the theme mechanics, tokens and the theme switch only** (§6.2–6.4 name both entries); its redesign is 6G-3.
- **R9 — At 200 % zoom (720 CSS px) the phone layout applies**, because `NARROW_VIEWPORT` (≤ 760 px) is unchanged by §7; §13's "tablet layout" sentence cannot hold without changing it. Nothing may clip either way.
- **R10 — The mesh-line guard latches.** Lines turn off when an exponential moving average of frame time exceeds 20 ms over 60 frames and stay off until the appearance next changes (no flicker on and off).
- **R11 — Search lists all 11 `BONDS_SYSTEMS` entries** (H₂⁺ and the 10 diatomics).
- **R12 — Ball and stick:** in Light Clean (non-Classic) hydrogen is `#F2F2F2`; in Deep Space the atoms get the Glow rim at strength 0.15 (the same shader injection as the orbital rim). Everything else about Molecules waits for 6G-2.
- **R13 — The PNG gains a footer** — "<brand> (electron-orbital-viewer)", bottom-right, caption size — because there is no caption footer today; the plain PNG gets none.
- **R14 — The avatar is absent when it would do nothing** (a production build without sign-in configured), keeping ruling R4-rec ("a production build without sign-in shows visitors no owner plumbing", pinned by `src/App.jobs.test.tsx`).
- **R15 — "Jobs run on" moves into the avatar menu** with the rest of `ConnectedOwnerBar`; the session-ended line ("Session ended…", today's `SESSION_ENDED` wording) shows beside the avatar.
- **R16 — Estimate.** §16 says ~2–3 days; the tasks below sum to about 31 hours of execution (≈ 4 working days) plus review gates, because the Atom screen, the 3D mapping and the thumbnail service are each a day's work on their own.

## The other modes in 6G-1 (spec §16: "today's panels placed into the Explore and inspector slots and themed, not yet re-composed")

| Mode | Explore slot | Inspector slot | Viewport | Phone | Re-composed in |
|---|---|---|---|---|---|
| Basic Orbitals | today's `Controls` (n/l/mₗ selects, Update Orbital, combinations, view settings) | today's radial plot | title block, toolbar, key column (ψ or combination key), Glow/Classic/palettes | today's sheet tabs, View tab gains Reset/Share/Export | 6G-2 (§9.2) |
| Bonds | today's `BondsPanel` | today's `Controls` + potential curve | title block, toolbar, key column (ψ or ρ key) | today's sheet, mode menu | 6G-2 (§9.3) |
| Molecules (and the jobs panels) | today's `MoleculeNav` + `MoleculeJobsSection` | today's `Controls` + orbital list | title block, toolbar; the key stack stays bottom-centre as today | today's sheet, mode menu | 6G-2 (§9.4) |
| Admin (`/admin.html`) | — | — | themed from tokens, theme switch, brand wordmark and title | — | 6G-3 (§9.7) |

All four keep every behaviour they have today (links, exports, jobs, sign-in, camera insets, touch); only colours, fonts and the panels' positions change.

---

## File structure

```
src/design/                     (the design system; /admin.html may import only from here)
  tokens.ts                     NEW  TOKENS.dark/light, SHADOWS, LAYOUT, RADIUS, TYPE, MOTION, tokensCss()
  tokens.css                    NEW  generated by tools/design/gen_tokens.mjs, checked in
  colour_math.ts                NEW  hex→Lab, ΔE76, ΔE2000 (tests and the live-check tool)
  local_pref.ts                 NEW  createPref(): localStorage with in-memory fallback + storage event
  usePref.ts                    NEW  usePref(): useSyncExternalStore over a Pref
  theme_storage.ts              NEW  eov.theme, legacy migration, resolveMode
  theme.ts                      REWRITE quantumTheme(mode) built from TOKENS
  useQuantumTheme.ts            REWRITE { mode, choice, setChoice, theme }, sets <html data-theme>
  ThemeSwitch.tsx               REWRITE icon button + menu: Deep Space / Light Clean / Match system
  brands.ts                     NEW  BRANDS, brandPref, currentBrand(), exportAppLabel(), applyDevBrandParam()
  useBrand.ts                   NEW  useBrand()
  Wordmark.tsx, BrandMark.tsx   NEW  two-tone wordmark, redrawn atom mark
  design.css                    NEW  shared design-system rules (wordmark, focus ring, skip links, captions)
  science.ts                    NEW  phase/density/curve/axes colours per theme and scheme; Classic constants
  presentation.ts               NEW  eov.render / eov.display prefs
  appearance.ts                 NEW  Appearance (what the renderer is told), phase vertex colours
  quantumlab.css                DELETE (superseded, §0)
src/shell/                      NEW  the app frame
  AppShell.tsx  app_shell.css   grid per breakpoint, skip links, landmarks
  TopBar.tsx  top_bar.css       brand, primary tabs, search slot, theme switch, help, avatar
  Rail.tsx  rail.css  icons.tsx mode rail (and the phone mode menu's list)
  GlobalSearch.tsx  search.css  combobox over search_index
  HelpDialog.tsx  AvatarMenu.tsx  PhoneTopBar.tsx
  ExplorePanel.tsx  explore.css  Inspector.tsx  inspector.css
  TitleBlock.tsx  view_title.ts  ViewportToolbar.tsx  KeyColumn.tsx  keys.css
  ThumbnailStrip.tsx  strip.css  useRovingFocus.ts  useDocumentTitle.ts  useFullscreen.ts
src/atom_ui/                    NEW  the Atom screen's own pieces
  ElementTile.tsx  element_tile.css  AtomExplore.tsx  DisplayControls.tsx  AtomInspector.tsx  OrbitalFactsCard.tsx
src/search/search_index.ts      NEW  elements, library molecules, Bonds systems, Basic orbitals
src/atomic_weights.ts           NEW  IUPAC CIAAW 2021 abridged, [mass number] where none
src/orbital_facts.ts            NEW  n, l, mₗ, nodes and their surfaces, shape word
src/atom/plot_tabs.ts           NEW  R(r), |R(r)|², ρ(r) and today's D(r) curves per level
src/orbital_glow.ts             NEW  Glow: rim + emissive (onBeforeCompile), halo, mesh lines
src/thumbs/                     NEW  ThumbnailService.ts, render_thumbnail.ts, ring_glyph.ts, strip_items.ts
src/components/                 MODIFY Controls (mode toggle, Reset and actions leave; RelativityControl and
                                ViewStyleControls extracted), LevelNav (+variants), SubshellPanel (+part, palette),
                                RadialPlot (+signed/title/caption), ShareExportBar (+toolbar variant),
                                ElementPickerDialog (+popover variant), OrbitalViewer (appearance, resize, thumbs)
src/App.tsx, src/main.tsx, src/style.css, src/useViewInsets.ts, src/useMediaQuery.ts   MODIFY
src/orbital_visualizer.ts, src/orbital_material.ts, src/clip_caps.ts, src/atom/shell_view.ts,
src/atom/shell_composition_view.ts, src/field_overlay_view.ts, src/molecules/ball_and_stick.ts   MODIFY (appearance)
src/export/png.ts, stl.ts, gltf.ts, run_export.ts   MODIFY (brand label, PNG background and legend colours)
src/admin/main.tsx, AdminApp.tsx, admin.css         MODIFY (theme only)
src/theme.ts                    DELETE (appTheme; tests move to tokens)
public/index.html, public/admin.html, public/electron-icon.svg   MODIFY
tools/design/                   NEW  gen_tokens.mjs, shoot.mjs, scenes.json, sample_points.json,
                                composite.mjs, concept_crops.json
docs/quantumlab/checks/6G-1/    NEW  composites + CHECKLIST.md (Task 19)
tests/design/ tests/shell/ tests/atom_ui/ tests/search/ tests/thumbs/   NEW tests
tests/a11y/tokens_contrast.test.ts NEW; tests/a11y/panel_contrast.test.ts REWRITE; tests/style_stub.ts NEW
```

## Tasks at a glance

| # | Task | Estimate |
|---|---|---|
| 1 | Baseline, design tokens, generated `tokens.css`, colour maths, Inter | 45 min |
| 2 | Theme mechanics: storage, migration, no-flash script, MUI theme, theme switch | 60 min |
| 3 | Every existing surface themed in both themes; the live-check tool **[visual]** | 2 h |
| 4 | Brands: list, owner-only preference, wordmark, mark, title and export metadata | 60 min |
| 5 | Search index | 40 min |
| 6 | Top bar, rail, help dialog and avatar menu (components) | 90 min |
| 7 | Global search combobox | 60 min |
| 8 | The app shell: grid, rail and top bar wired, insets, medium drawer, phone top bar **[visual]** | 2.5 h |
| 9 | Viewport frame: title block, toolbar, key column, document title **[visual]** | 90 min |
| 10 | Atom Explore: element tile, atomic weights, pickers, breadcrumb, Configuration and Orbitals tabs **[visual]** | 2 h |
| 11 | Presentation preferences and the Display tab | 75 min |
| 12 | Science colours from one source: keys, plots, PNG legend | 60 min |
| 13 | Inspector: plot tabs, CSV per tab, orbital facts **[visual]** | 2 h |
| 14 | Renderer appearance in place: transparent canvas, schemes, palettes, axes, Classic **[visual]** | 2.5 h |
| 15 | Glow: rim, emissive, halo, mesh lines, frame-time guard **[visual]** | 2 h |
| 16 | `ThumbnailService` and the atom strip **[visual]** | 2.5 h |
| 17 | Tablet and phone baseline **[visual]** | 2 h |
| 18 | Accessibility pass: skip links, focus, roving keys, reduced motion, canvas text contrast | 90 min |
| 19 | Final live verification: composites and committed checklist **[visual]** | 75 min |
| 20 | Owner review of the Atom view beside the concept (controller presents) | 30 min + owner |
| 21 | Deploy the site (controller-confirmed) | 20 min |
| | **Total** | **≈ 31 h** |

---
### Task 1: Baseline, design tokens, generated `tokens.css`, colour maths, Inter

**Estimate:** 45 min. **Spec:** §4 (all of it), §4.3, §13 "Contrast".

**Files:**
- Create: `src/design/tokens.ts`, `src/design/tokens.css` (generated), `src/design/colour_math.ts`, `tools/design/gen_tokens.mjs`, `tests/style_stub.ts`
- Modify: `jest.config.ts` (CSS imports map to a stub), `package.json` + `package-lock.json` (Inter)
- Test: `tests/design/tokens.test.ts`, `tests/design/colour_math.test.ts`, `tests/a11y/tokens_contrast.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `parseCssColor`, `worstCaseContrast` from `src/a11y/contrast.ts` (unchanged).
- Produces (later tasks rely on these exact names):
  - `src/design/tokens.ts`: `type ThemeMode = 'dark' | 'light'`; `THEME_MODES: readonly ThemeMode[]`; `interface ColorTokens` (keys below); `type ColorRole = keyof ColorTokens`; `TOKENS: Record<ThemeMode, ColorTokens>`; `SHADOWS: Record<ThemeMode, { panel: string; popover: string; selected: string }>`; `LAYOUT` (numbers, px); `RADIUS`; `SPACE`; `TYPE`; `FONT_SANS: string`; `MOTION`; `CANVAS_BACKDROPS: Record<ThemeMode, string[]>`; `tokensCss(): string`; `cssVar(group: string, role: string): string` → `var(--ql-<group>-<role>)`.
  - `src/design/colour_math.ts`: `type Lab = [number, number, number]`; `hexToRgb255(hex): [number, number, number]`; `srgbToLinear(channel255): number`; `rgbToLab(rgb): Lab`; `hexToLab(hex): Lab`; `deltaE76(a, b): number`; `deltaE2000(a, b): number`. No imports (the Node tools import it directly).
  - CSS custom properties `--ql-color-<role>`, `--ql-shadow-<panel|popover|selected>`, `--ql-size-<kebab layout key>`, `--ql-radius-<xs|sm|md|lg|xl|pill>`, `--ql-space-<4|8|12|16|20|24|32>`, `--ql-type-<style>-<size|line|weight>`, `--ql-font-sans`, `--ql-motion-<hover|panel>`.

- [ ] **Step 1: Confirm the baseline (expect ~2.5 min)**

```bash
npm ci
npx jest 2>&1 | grep -E "^(Tests|Test Suites):"
npm run build 2>&1 | tail -2
npm run check:admin-split
npx tsc --noEmit -p tsconfig.json; echo "tsc exit $?"
```

Expected: `Test Suites: 1 skipped, 157 passed, 157 of 158 total`, `Tests: 75 skipped, 3451 passed, 3526 total`; `✓ built in …`; `admin split ok: no dashboard code reachable from index.html`; `tsc exit 0`. If any of these differs, stop and report — nothing below may start on a red baseline.

- [ ] **Step 2: Install the font package**

```bash
npm install @fontsource-variable/inter@^5.3.0
grep '"@fontsource-variable/inter"' package.json
```

Expected: `"@fontsource-variable/inter": "^5.3.0",` under `dependencies`. (It is imported in Task 3, when Roboto goes.)

- [ ] **Step 3: Let Jest load components that import CSS**

Create `tests/style_stub.ts`:

```ts
// Jest's stand-in for every imported .css file (jest.config.ts moduleNameMapper):
// stylesheets are Vite's business; tests read classes and roles, not rules.
export default {};
```

In `jest.config.ts`, replace the `moduleNameMapper` block with:

```ts
  moduleNameMapper: {
    '^.+/build_env$': '<rootDir>/tests/jobs/build_env_stub.ts',
    // Components import their own stylesheet (spec §10: "CSS lives in
    // src/design/*.css per component, imported by its component"); ts-jest
    // cannot parse CSS, so every .css import resolves to an empty module.
    '\\.css$': '<rootDir>/tests/style_stub.ts',
  },
```

(keep the existing comment above it about `import.meta`).

- [ ] **Step 4: Write the failing tests**

`tests/design/tokens.test.ts`:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LAYOUT, TOKENS, tokensCss, cssVar } from '../../src/design/tokens';

describe('design tokens (spec §4)', () => {
    it('tokens.css is exactly what tools/design/gen_tokens.mjs makes of tokens.ts', () => {
        // If this fails: node tools/design/gen_tokens.mjs, then commit both files.
        const onDisk = readFileSync(resolve(__dirname, '../../src/design/tokens.css'), 'utf8');
        expect(onDisk).toBe(tokensCss());
    });

    it('defines the same roles in both themes', () => {
        expect(Object.keys(TOKENS.light).sort()).toEqual(Object.keys(TOKENS.dark).sort());
    });

    it('names every custom property --ql-<group>-<role>', () => {
        const names = [...tokensCss().matchAll(/^\s*(--[\w-]+):/gm)].map(m => m[1]);
        expect(names.length).toBeGreaterThan(80);
        for (const name of names) expect(name).toMatch(/^--ql-(color|shadow|size|radius|space|type|font|motion)-[a-z0-9-]+$/);
        expect(cssVar('color', 'text-1')).toBe('var(--ql-color-text-1)');
    });

    it('themes the first paint: dark is the default, light overrides it', () => {
        const css = tokensCss();
        expect(css).toContain(':root, :root[data-theme="dark"] {');
        expect(css).toContain(':root[data-theme="light"] {');
        expect(css.indexOf(':root[data-theme="light"]')).toBeGreaterThan(css.indexOf(':root, :root[data-theme="dark"]'));
        expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*--ql-motion-hover: 0ms/);
    });

    it('sizes the desktop grid as §7 does: 76 + 315 + 290 + 4 × 12 = 729', () => {
        expect(LAYOUT.rail + LAYOUT.explore + LAYOUT.inspector + 4 * LAYOUT.gutter).toBe(729);
        // §8.6: PLOT_WIDTH becomes 258 (290 − 2 × 16).
        expect(LAYOUT.plotWidth).toBe(LAYOUT.inspector - 2 * LAYOUT.panelPadding);
    });

    it('carries the spec values verbatim', () => {
        expect(TOKENS.dark['bg-app']).toBe('#020F1D');
        expect(TOKENS.dark['selected-edge']).toBe('#1FB6F5');
        expect(TOKENS.light['text-3']).toBe('#5B6880');
        expect(TOKENS.light['selected-edge']).toBe('#1662E0');
    });
});
```

`tests/design/colour_math.test.ts`:

```ts
import { deltaE2000, deltaE76, hexToLab, srgbToLinear } from '../../src/design/colour_math';

describe('colour maths', () => {
    // Sharma, Wu & Dalal (2005), test pairs 1, 2 and 7.
    it.each([
        [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
        [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
        [[50, 0, 0], [50, -1, 2], 2.3669],
    ] as const)('ΔE2000 of %j and %j is %f', (a, b, expected) => {
        expect(deltaE2000([...a], [...b])).toBeCloseTo(expected, 4);
    });

    it('puts white at L* 100 and keeps sRGB pure red linear', () => {
        expect(hexToLab('#FFFFFF')[0]).toBeCloseTo(100, 3);
        expect(srgbToLinear(255)).toBe(1);
        expect(srgbToLinear(0)).toBe(0);
        expect(deltaE76(hexToLab('#000000'), hexToLab('#000000'))).toBe(0);
    });
});
```

`tests/a11y/tokens_contrast.test.ts`:

```ts
import { contrastRatio, parseCssColor, worstCaseContrast } from '../../src/a11y/contrast';
import { CANVAS_BACKDROPS, ColorRole, THEME_MODES, TOKENS } from '../../src/design/tokens';

/**
 * Spec §13: every text token on every surface it is used on is AA (4.5:1);
 * control edges in their selected state, the focus ring and accents are
 * 3:1 against what they sit on; text over the canvas is checked through its
 * scrim against the canvas's darkest and lightest points and a lit lobe.
 */
const rgb = (css: string): [number, number, number] => {
    const [r, g, b] = parseCssColor(css);
    return [r, g, b];
};
const ratio = (fg: string, bg: string) => contrastRatio(rgb(fg), rgb(bg));
const SURFACES: ColorRole[] = ['bg-app', 'bg-bar', 'surface-1', 'surface-2', 'surface-3'];
const TEXT: ColorRole[] = ['text-1', 'text-2', 'text-3', 'accent-text'];

describe.each(THEME_MODES)('%s tokens', mode => {
    const t = TOKENS[mode];

    it.each(TEXT.flatMap(fg => SURFACES.map(bg => [fg, bg] as const)))('%s on %s is at least 4.5:1', (fg, bg) => {
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['success', 'warning', 'danger', 'learn-accent-text', 'plot-axis'] as const)('%s text on surface-1 and bg-app is at least 4.5:1', role => {
        expect(ratio(t[role], t['surface-1'])).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[role], t['bg-app'])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['accent-fill', 'selected-fill', 'learn-accent-fill', 'avatar'] as const)('on-fill text on %s is at least 4.5:1', fill => {
        expect(ratio(t['on-fill'], t[fill])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['selected-edge', 'accent', 'focus-ring'] as const)('%s is at least 3:1 against surface-1, surface-2 and bg-app', role => {
        for (const bg of ['surface-1', 'surface-2', 'bg-app'] as const) expect(ratio(t[role], t[bg])).toBeGreaterThanOrEqual(3);
    });

    it('error alerts read', () => {
        expect(ratio(t['error-text'], t['error-bg'])).toBeGreaterThanOrEqual(4.5);
    });

    it('title-block text reads through its scrim over the canvas and a lit lobe', () => {
        for (const fg of ['text-1', 'text-2'] as const) {
            expect(worstCaseContrast(t[fg], t.scrim, CANVAS_BACKDROPS[mode])).toBeGreaterThanOrEqual(4.5);
        }
    });
});
```

- [ ] **Step 5: Run them to see them fail**

Run: `npx jest tests/design tests/a11y/tokens_contrast.test.ts`
Expected: FAIL — `Cannot find module '../../src/design/tokens'` (and `colour_math`).

- [ ] **Step 6: Write `src/design/tokens.ts`**

```ts
/**
 * The design system's single source (spec §3.4, §4): every colour, size and
 * shadow for both themes. tokens.css is generated from this file by
 * tools/design/gen_tokens.mjs and checked in, so the first paint is themed
 * before any script runs; the MUI theme (theme.ts), the renderer's appearance
 * and the contrast tests read the same objects.
 *
 * No imports: Node runs tools/design/*.mjs against this file directly.
 */
export type ThemeMode = 'dark' | 'light';
export const THEME_MODES: readonly ThemeMode[] = ['dark', 'light'];

export interface ColorTokens {
    'bg-app': string;
    'bg-bar': string;
    'surface-1': string;
    'surface-2': string;
    'surface-3': string;
    'border-subtle': string;
    'border-strong': string;
    'text-1': string;
    'text-2': string;
    'text-3': string;
    accent: string;
    'accent-text': string;
    'accent-fill': string;
    'selected-fill': string;
    'selected-edge': string;
    'rail-active': string;
    avatar: string;
    success: string;
    warning: string;
    danger: string;
    'learn-accent-text': string;
    'learn-accent-fill': string;
    /** The 3D view's backdrop, painted behind the transparent canvas (§6.6). */
    canvas: string;
    /** The backdrop as one colour: PNG export composites onto it (§6.6). */
    'canvas-solid': string;
    'plot-grid': string;
    'plot-axis': string;
    /** Text and icons on accent, selected and learn fills. */
    'on-fill': string;
    'focus-ring': string;
    /** The title block's backing: canvas-solid at 72 % (§8.5). */
    scrim: string;
    'error-bg': string;
    'error-text': string;
}
export type ColorRole = keyof ColorTokens;

export const TOKENS: Record<ThemeMode, ColorTokens> = {
    // Deep Space, sampled from concept A / Molecule Builder (spec §4.1).
    dark: {
        'bg-app': '#020F1D',
        'bg-bar': '#010B17',
        'surface-1': '#071828',
        'surface-2': '#0B1C2D',
        'surface-3': '#13263B',
        'border-subtle': 'rgba(110,160,220,.16)',
        'border-strong': '#2B4A6B',
        'text-1': '#F2F6FA',
        'text-2': '#C3CFDB',
        'text-3': '#93A6BA',
        accent: '#2A85F8',
        'accent-text': '#4C9BFF',
        'accent-fill': '#1E5BD8',
        'selected-fill': '#0E3A99',
        'selected-edge': '#1FB6F5',
        'rail-active': 'linear-gradient(180deg,#123E9C,#0A2A6B)',
        avatar: '#1E5BD8',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#F87171',
        'learn-accent-text': '#A78BFA',
        'learn-accent-fill': '#5B3FD9',
        canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #0A1F3A 0%, #04142A 45%, #020C19 100%)',
        'canvas-solid': '#04142A',
        'plot-grid': 'rgba(150,180,220,.12)',
        'plot-axis': '#93A6BA',
        'on-fill': '#FFFFFF',
        'focus-ring': '#1FB6F5',
        scrim: 'rgba(4,20,42,0.72)',
        'error-bg': '#3B1219',
        'error-text': '#FECACA',
    },
    // Light Clean, sampled from concept B / Admin (spec §4.1).
    light: {
        'bg-app': '#F4F7FB',
        'bg-bar': '#FFFFFF',
        'surface-1': '#FFFFFF',
        'surface-2': '#F1F5FA',
        'surface-3': '#E3EEFE',
        'border-subtle': '#E3E9F2',
        'border-strong': '#B8C4D6',
        'text-1': '#0B1220',
        'text-2': '#475467',
        'text-3': '#5B6880',
        accent: '#1662E0',
        'accent-text': '#1559D6',
        'accent-fill': '#1662E0',
        'selected-fill': '#1662E0',
        'selected-edge': '#1662E0',
        // §4.1: the rail's active item is surface-3 in Light Clean.
        'rail-active': '#E3EEFE',
        avatar: '#1662E0',
        success: '#15803D',
        warning: '#B45309',
        danger: '#B42318',
        'learn-accent-text': '#6D28D9',
        'learn-accent-fill': '#6D28D9',
        canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #FFFFFF 0%, #F6F9FD 60%, #EEF3F9 100%)',
        'canvas-solid': '#F7F9FC',
        'plot-grid': '#E6ECF4',
        'plot-axis': '#5B6880',
        'on-fill': '#FFFFFF',
        'focus-ring': '#1662E0',
        scrim: 'rgba(247,249,252,0.72)',
        'error-bg': '#FDEDED',
        'error-text': '#5F2120',
    },
};

/** §4.6: panels have no drop shadow in Deep Space; the selected glow is the concept's cyan halo. Light Clean has no glow. */
export const SHADOWS: Record<ThemeMode, { panel: string; popover: string; selected: string }> = {
    dark: {
        panel: 'inset 0 1px 0 rgba(255,255,255,.03)',
        popover: '0 12px 32px rgba(0,0,0,.45)',
        selected: '0 0 0 1px #1FB6F5, 0 0 12px rgba(31,182,245,.35)',
    },
    light: {
        panel: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)',
        popover: '0 12px 24px rgba(16,24,40,.12)',
        selected: '0 0 0 1px #1662E0',
    },
};

/** The canvas's darkest and lightest points and a lit lobe (§13: text over the canvas is checked against these). */
export const CANVAS_BACKDROPS: Record<ThemeMode, string[]> = {
    dark: ['#020C19', '#0A1F3A', '#FFF1E6'],
    light: ['#EEF3F9', '#FFFFFF', '#FFF1E6'],
};

/** Sizes in px (§4.4, §7, §8). */
export const LAYOUT = {
    topBar: 56,
    phoneTopBar: 52,
    rail: 76,
    railWide: 184,
    explore: 315,
    exploreMedium: 300,
    inspector: 290,
    inspectorWide: 320,
    inspectorBar: 44,
    gutter: 12,
    panelPadding: 16,
    sectionGap: 16,
    labelGap: 6,
    controlRow: 28,
    chip: 32,
    input: 36,
    search: 36,
    touch: 44,
    elementTileWidth: 88,
    elementTileHeight: 96,
    thumb: 72,
    thumbPhone: 56,
    thumbLabel: 16,
    stripHandle: 28,
    toolbarButton: 36,
    keyBar: 28,
    iconRail: 20,
    iconButton: 18,
    plotWidth: 258,
} as const;

export const RADIUS = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;
export const SPACE = [4, 8, 12, 16, 20, 24, 32] as const;

/** §4.3: size / line in px, weight. */
export const TYPE = {
    wordmark: { size: 20, line: 24, weight: 600 },
    title: { size: 20, line: 28, weight: 600 },
    kpi: { size: 28, line: 34, weight: 600 },
    section: { size: 14, line: 20, weight: 600 },
    nav: { size: 14, line: 20, weight: 500 },
    body: { size: 13, line: 20, weight: 400 },
    subtitle: { size: 13, line: 18, weight: 400 },
    caption: { size: 12, line: 16, weight: 400 },
    tick: { size: 11, line: 14, weight: 400 },
    rail: { size: 11, line: 14, weight: 500 },
} as const;

export const FONT_SANS = '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

/** §4.7, in ms; zero under prefers-reduced-motion (tokens.css). */
export const MOTION = { hover: 120, panel: 180 } as const;

const kebab = (key: string) => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

export function cssVar(group: string, role: string): string {
    return `var(--ql-${group}-${role})`;
}

function themeBlock(mode: ThemeMode): string[] {
    const lines = [`  color-scheme: ${mode};`];
    for (const [role, value] of Object.entries(TOKENS[mode])) lines.push(`  --ql-color-${role}: ${value};`);
    for (const [role, value] of Object.entries(SHADOWS[mode])) lines.push(`  --ql-shadow-${role}: ${value};`);
    return lines;
}

/** The stylesheet tools/design/gen_tokens.mjs writes to src/design/tokens.css. */
export function tokensCss(): string {
    const common: string[] = [`  --ql-font-sans: ${FONT_SANS};`];
    for (const [key, value] of Object.entries(LAYOUT)) common.push(`  --ql-size-${kebab(key)}: ${value}px;`);
    for (const [key, value] of Object.entries(RADIUS)) common.push(`  --ql-radius-${key}: ${value}px;`);
    for (const value of SPACE) common.push(`  --ql-space-${value}: ${value}px;`);
    for (const [style, spec] of Object.entries(TYPE)) {
        common.push(`  --ql-type-${style}-size: ${spec.size}px;`, `  --ql-type-${style}-line: ${spec.line}px;`, `  --ql-type-${style}-weight: ${spec.weight};`);
    }
    for (const [key, value] of Object.entries(MOTION)) common.push(`  --ql-motion-${key}: ${value}ms;`);
    return [
        '/* GENERATED by tools/design/gen_tokens.mjs from src/design/tokens.ts -- do not edit by hand. */',
        ':root {',
        ...common,
        '}',
        // Dark is the default too, so a page whose script did not run is still themed.
        ':root, :root[data-theme="dark"] {',
        ...themeBlock('dark'),
        '}',
        ':root[data-theme="light"] {',
        ...themeBlock('light'),
        '}',
        '@media (prefers-reduced-motion: reduce) {',
        '  :root { --ql-motion-hover: 0ms; --ql-motion-panel: 0ms; }',
        '}',
        '',
    ].join('\n');
}
```

- [ ] **Step 7: Write `src/design/colour_math.ts`**

```ts
/**
 * CIELAB and colour differences, for the science-colour tests (spec §4.2's
 * ΔE and L* claims) and the live check's "within ΔE₀₀ ≤ 3 of its token"
 * (spec §14). sRGB D65; CIEDE2000 after Sharma, Wu & Dalal (2005).
 * No imports: tools/design/shoot.mjs imports this file directly under Node.
 */
export type Lab = [number, number, number];

export function hexToRgb255(hex: string): [number, number, number] {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function srgbToLinear(channel255: number): number {
    const c = channel255 / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]: [number, number, number]): Lab {
    const [R, G, B] = [r, g, b].map(srgbToLinear);
    const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
    const [fx, fy, fz] = [f(x), f(y), f(z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
    return rgbToLab(hexToRgb255(hex));
}

export function deltaE76(a: Lab, b: Lab): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const hue = (b: number, a: number) => {
        if (a === 0 && b === 0) return 0;
        const h = Math.atan2(b, a) / rad;
        return h >= 0 ? h : h + 360;
    };
    const h1p = hue(b1, a1p);
    const h2p = hue(b2, a2p);
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) {
        if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
        else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
        + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
    const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
    const Sc = 1 + 0.045 * Cbp;
    const Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}
```

- [ ] **Step 8: Write the generator and generate `tokens.css`**

`tools/design/gen_tokens.mjs`:

```js
#!/usr/bin/env node
// Writes src/design/tokens.css from src/design/tokens.ts (spec §4: generated
// and checked in, so the first paint is already themed). Run after any token
// change; tests/design/tokens.test.ts fails while the two differ:
//   node tools/design/gen_tokens.mjs
// Node 24 strips the .ts file's types itself; tokens.ts has no imports.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensCss } from '../../src/design/tokens.ts';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/design/tokens.css');
writeFileSync(out, tokensCss());
console.log(`wrote ${out}`);
```

Run: `node tools/design/gen_tokens.mjs && head -3 src/design/tokens.css`
Expected: `wrote …/src/design/tokens.css`, then the GENERATED comment line and `:root {`.

- [ ] **Step 9: Run the new tests, then everything**

Run: `npx jest tests/design tests/a11y/tokens_contrast.test.ts`
Expected: PASS (all). Then `npx jest 2>&1 | grep -E "^(Tests|Test Suites):"` → 160 passed suites, 0 failed; `npx tsc --noEmit -p tsconfig.json; echo $?` → `0`; `npm run build` succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/design/tokens.ts src/design/tokens.css src/design/colour_math.ts tools/design/gen_tokens.mjs tests/style_stub.ts jest.config.ts package.json package-lock.json tests/design/tokens.test.ts tests/design/colour_math.test.ts tests/a11y/tokens_contrast.test.ts
git commit -m "feat(design): tokens for Deep Space and Light Clean, generated tokens.css, colour maths (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/tokens.ts src/design/tokens.css src/design/colour_math.ts tools/design/gen_tokens.mjs tests/style_stub.ts jest.config.ts package.json package-lock.json tests/design/tokens.test.ts tests/design/colour_math.test.ts tests/a11y/tokens_contrast.test.ts
```

---

### Task 2: Theme mechanics — storage, migration, no-flash script, MUI theme, theme switch

**Estimate:** 60 min. **Spec:** §6.1–§6.4. Nothing visible changes yet: the app keeps its old `appTheme` until Task 3 swaps theme and stylesheet together.

**Files:**
- Create: `src/design/local_pref.ts`, `src/design/usePref.ts`, `src/design/theme_storage.ts`
- Rewrite: `src/design/theme.ts`, `src/design/useQuantumTheme.ts`, `src/design/ThemeSwitch.tsx` (the foundation versions are imported by nothing — checked with `grep -rn "design/" src tests | grep -i import`, empty)
- Modify: `public/index.html`, `public/admin.html` (inline boot script)
- Test: `tests/design/local_pref.test.ts`, `tests/design/theme_storage.test.ts`, `tests/design/no_flash_script.test.ts`, `tests/design/use_quantum_theme.test.tsx`, `tests/design/quantum_theme.test.ts`, `tests/design/theme_switch.test.tsx`

**Interfaces:**
- Consumes: `TOKENS`, `SHADOWS`, `RADIUS`, `TYPE`, `FONT_SANS`, `ThemeMode` (Task 1).
- Produces:
  - `local_pref.ts`: `interface Pref<T> { get(): T; set(value: T): void; subscribe(listener: () => void): () => void }`; `interface PrefCodec<T> { decode(raw: string | null): T; encode(value: T): string | null }` (`null` = remove the key); `createPref<T>(key: string, codec: PrefCodec<T>): Pref<T>`. No React import (export modules use it).
  - `usePref.ts`: `usePref<T>(pref: Pref<T>): T`.
  - `theme_storage.ts`: `type ThemeChoice = ThemeMode | 'system'`; `THEME_KEY = 'eov.theme'`; `LEGACY_THEME_KEYS`; `decodeThemeChoice`, `encodeThemeChoice`; `themeChoicePref: Pref<ThemeChoice>`; `migrateLegacyTheme(storage)`; `resolveMode(choice, prefersLight): ThemeMode`; `PREFERS_LIGHT_QUERY = '(prefers-color-scheme: light)'`.
  - `theme.ts`: `quantumTheme(mode: ThemeMode): Theme`; `type QuantumThemeMode = ThemeMode`.
  - `useQuantumTheme.ts`: `useQuantumTheme(): { mode: ThemeMode; choice: ThemeChoice; setChoice(choice: ThemeChoice): void; theme: Theme }`; `usePrefersLight(): boolean`; `applyThemeToDocument(mode, root?)`.
  - `ThemeSwitch.tsx`: default export `ThemeSwitch` (no props): an icon button named `Theme: Deep Space` / `Theme: Light Clean` opening a menu of `menuitemradio`s "Deep Space", "Light Clean", "Match system"; `THEME_LABEL: Record<ThemeMode, string>`.
  - `<html data-theme="dark|light">` and `style.colorScheme` are set before CSS loads, in both HTML entries.

- [ ] **Step 1: Write the failing tests**

`tests/design/local_pref.test.ts`:

```ts
import { createPref } from '../../src/design/local_pref';

const codec = {
    decode: (raw: string | null) => (raw === 'a' || raw === 'b' ? raw : 'a'),
    encode: (value: 'a' | 'b') => (value === 'a' ? null : value),
};

afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

describe('createPref', () => {
    it('reads, writes and removes its one key', () => {
        const pref = createPref('test.pref', codec);
        expect(pref.get()).toBe('a');
        pref.set('b');
        expect(window.localStorage.getItem('test.pref')).toBe('b');
        expect(pref.get()).toBe('b');
        pref.set('a');
        expect(window.localStorage.getItem('test.pref')).toBeNull();
    });

    it('returns the same value object until the stored text changes (useSyncExternalStore needs that)', () => {
        const pref = createPref('test.obj', { decode: raw => ({ raw }), encode: (v: { raw: string | null }) => v.raw });
        expect(pref.get()).toBe(pref.get());
    });

    it('tells subscribers of its own writes and of another tab\'s', () => {
        const pref = createPref('test.pref', codec);
        const listener = jest.fn();
        const unsubscribe = pref.subscribe(listener);
        pref.set('b');
        expect(listener).toHaveBeenCalledTimes(1);
        window.localStorage.setItem('test.pref', 'a');
        window.dispatchEvent(new StorageEvent('storage', { key: 'test.pref', newValue: 'a' }));
        expect(listener).toHaveBeenCalledTimes(2);
        window.dispatchEvent(new StorageEvent('storage', { key: 'some.other.key', newValue: 'x' }));
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        pref.set('b');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps the choice in memory when localStorage throws (Review Focus 2)', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        const pref = createPref('test.pref', codec);
        expect(pref.get()).toBe('a');
        expect(() => pref.set('b')).not.toThrow();
        expect(pref.get()).toBe('b');
    });
});
```

`tests/design/theme_storage.test.ts`:

```ts
import { decodeThemeChoice, encodeThemeChoice, migrateLegacyTheme, resolveMode, THEME_KEY } from '../../src/design/theme_storage';

afterEach(() => window.localStorage.clear());

describe('theme storage (spec §6.1)', () => {
    it('stores dark or light, and "follow the system" as no key at all', () => {
        expect(decodeThemeChoice('dark')).toBe('dark');
        expect(decodeThemeChoice('light')).toBe('light');
        expect(decodeThemeChoice(null)).toBe('system');
        expect(decodeThemeChoice('sepia')).toBe('system');
        expect(encodeThemeChoice('system')).toBeNull();
        expect(encodeThemeChoice('light')).toBe('light');
    });

    it('resolves "system" from prefers-color-scheme', () => {
        expect(resolveMode('system', true)).toBe('light');
        expect(resolveMode('system', false)).toBe('dark');
        expect(resolveMode('dark', true)).toBe('dark');
    });

    it('migrates the foundation\'s two keys into eov.theme and deletes them', () => {
        window.localStorage.setItem('eov.quantumlab.theme', 'light');
        window.localStorage.setItem('eov-color-theme', 'dark');
        migrateLegacyTheme(window.localStorage);
        expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
        expect(window.localStorage.getItem('eov.quantumlab.theme')).toBeNull();
        expect(window.localStorage.getItem('eov-color-theme')).toBeNull();
    });

    it('never overwrites an existing eov.theme, and drops a legacy value it cannot read', () => {
        window.localStorage.setItem(THEME_KEY, 'dark');
        window.localStorage.setItem('eov.quantumlab.theme', 'light');
        migrateLegacyTheme(window.localStorage);
        expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
        window.localStorage.clear();
        window.localStorage.setItem('eov-color-theme', 'auto');
        migrateLegacyTheme(window.localStorage);
        expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
        expect(window.localStorage.getItem('eov-color-theme')).toBeNull();
        expect(() => migrateLegacyTheme(null)).not.toThrow();
    });
});
```

`tests/design/no_flash_script.test.ts`:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Spec §6.2: the same boot script in both entries, ahead of every stylesheet and module script. */
const html = (name: string) => readFileSync(resolve(__dirname, '../../public', name), 'utf8');
const scriptOf = (page: string) => {
    const match = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(page);
    if (!match) throw new Error('no data-theme-boot script');
    return match[1];
};
const run = (script: string) => new Function(script)();

function mediaReporting(light: boolean) {
    window.matchMedia = ((query: string) => ({ matches: light && query.includes('light'), media: query,
        addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    jest.restoreAllMocks();
});

describe('the no-flash theme script', () => {
    const index = html('index.html');
    const admin = html('admin.html');

    it('is identical in index.html and admin.html, and runs before any stylesheet or module', () => {
        expect(scriptOf(index)).toBe(scriptOf(admin));
        for (const page of [index, admin]) {
            const at = page.indexOf('data-theme-boot');
            expect(at).toBeGreaterThan(0);
            expect(at).toBeLessThan(page.indexOf('type="module"'));
            const stylesheet = page.indexOf('rel="stylesheet"');
            if (stylesheet >= 0) expect(at).toBeLessThan(stylesheet);
        }
    });

    it('applies a stored choice', () => {
        mediaReporting(true);
        window.localStorage.setItem('eov.theme', 'dark');
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('follows the system when nothing is stored', () => {
        mediaReporting(true);
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('migrates a legacy key on first load', () => {
        mediaReporting(false);
        window.localStorage.setItem('eov.quantumlab.theme', 'light');
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(window.localStorage.getItem('eov.theme')).toBe('light');
        expect(window.localStorage.getItem('eov.quantumlab.theme')).toBeNull();
    });

    it('still themes the page when localStorage throws', () => {
        mediaReporting(false);
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
});
```

`tests/design/quantum_theme.test.ts`:

```ts
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { quantumTheme } from '../../src/design/theme';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

describe.each(THEME_MODES)('quantumTheme(%s)', mode => {
    const theme = quantumTheme(mode);
    it('is built from the tokens', () => {
        expect(theme.palette.mode).toBe(mode);
        expect(theme.palette.background.default).toBe(TOKENS[mode]['bg-app']);
        expect(theme.palette.background.paper).toBe(TOKENS[mode]['surface-1']);
        expect(theme.palette.text.primary).toBe(TOKENS[mode]['text-1']);
        expect(theme.palette.primary.main).toBe(TOKENS[mode].accent);
        expect(theme.typography.fontFamily).toMatch(/^"Inter Variable"/);
    });
    it('primary text on a panel is AA, and its contrast text on primary too', () => {
        expect(contrastRatio(rgb(theme.palette.primary.main), rgb(TOKENS[mode]['surface-1']))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(rgb(theme.palette.primary.contrastText), rgb(theme.palette.primary.main))).toBeGreaterThanOrEqual(4.5);
    });
});
```

`tests/design/use_quantum_theme.test.tsx`:

```tsx
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useQuantumTheme } from '../../src/design/useQuantumTheme';

/** A matchMedia whose prefers-color-scheme answer the test can change, with its listeners. */
function controllableMedia(light: boolean) {
    const listeners = new Set<() => void>();
    let matches = light;
    window.matchMedia = ((query: string) => ({
        get matches() { return query.includes('prefers-color-scheme: light') ? matches : false; },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })) as unknown as typeof window.matchMedia;
    return { setLight(next: boolean) { matches = next; listeners.forEach(l => l()); } };
}

function Probe() {
    const { mode, choice, setChoice } = useQuantumTheme();
    return (
        <div>
            <span data-testid="mode">{mode}</span><span data-testid="choice">{choice}</span>
            <button onClick={() => setChoice('dark')}>dark</button>
        </div>
    );
}

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('useQuantumTheme (spec §6.1, §6.3)', () => {
    it('follows the system live while nothing is chosen', () => {
        const media = controllableMedia(false);
        render(<Probe />);
        expect(screen.getByTestId('mode')).toHaveTextContent('dark');
        expect(screen.getByTestId('choice')).toHaveTextContent('system');
        act(() => media.setLight(true));
        expect(screen.getByTestId('mode')).toHaveTextContent('light');
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('keeps an explicit choice whatever the system says', () => {
        const media = controllableMedia(true);
        render(<Probe />);
        act(() => screen.getByText('dark').click());
        expect(window.localStorage.getItem('eov.theme')).toBe('dark');
        act(() => media.setLight(true));
        expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    });

    it('follows another tab through the storage event', () => {
        controllableMedia(false);
        render(<Probe />);
        act(() => {
            window.localStorage.setItem('eov.theme', 'light');
            window.dispatchEvent(new StorageEvent('storage', { key: 'eov.theme', newValue: 'light' }));
        });
        expect(screen.getByTestId('mode')).toHaveTextContent('light');
    });
});
```

`tests/design/theme_switch.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeSwitch from '../../src/design/ThemeSwitch';

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('ThemeSwitch (spec §6.4)', () => {
    it('names the theme shown and offers Deep Space, Light Clean and Match system', () => {
        render(<ThemeSwitch />);
        fireEvent.click(screen.getByRole('button', { name: 'Theme: Deep Space' }));
        expect(screen.getAllByRole('menuitemradio').map(item => item.textContent)).toEqual(['Deep Space', 'Light Clean', 'Match system']);
        expect(screen.getByRole('menuitemradio', { name: 'Match system' })).toHaveAttribute('aria-checked', 'true');
    });

    it('switches, stores and announces the choice', () => {
        render(<ThemeSwitch />);
        fireEvent.click(screen.getByRole('button', { name: 'Theme: Deep Space' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light Clean' }));
        expect(window.localStorage.getItem('eov.theme')).toBe('light');
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(screen.getByRole('button', { name: 'Theme: Light Clean' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Theme: Light Clean' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Match system' }));
        expect(window.localStorage.getItem('eov.theme')).toBeNull();
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest tests/design`
Expected: FAIL — missing modules `local_pref`, `theme_storage`; `quantumTheme` has the foundation's colours; no `data-theme-boot` script.

- [ ] **Step 3: Write `src/design/local_pref.ts` and `src/design/usePref.ts`**

```ts
// src/design/local_pref.ts
/**
 * One localStorage key behind a tiny external store (spec §6.1, §6.7): the
 * theme, the brand and the presentation preferences live here, outside
 * Redux, so nothing in them can reach a share link. When storage is
 * unavailable or throws (Safari private mode) the value lasts the session in
 * memory. The `storage` event keeps other tabs and /admin.html in step.
 * No React import: export code reads prefs too.
 */
export interface Pref<T> {
    get(): T;
    set(value: T): void;
    subscribe(listener: () => void): () => void;
}

export interface PrefCodec<T> {
    decode(raw: string | null): T;
    /** null removes the key. */
    encode(value: T): string | null;
}

function storageOrNull(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

export function createPref<T>(key: string, codec: PrefCodec<T>): Pref<T> {
    // undefined: storage is the truth; anything else: storage failed and this is.
    let memory: string | null | undefined;
    let cache: { raw: string | null; value: T } | null = null;
    const listeners = new Set<() => void>();

    const readRaw = (): string | null => {
        if (memory !== undefined) return memory;
        try {
            return storageOrNull()?.getItem(key) ?? null;
        } catch {
            return null;
        }
    };

    const get = (): T => {
        const raw = readRaw();
        if (!cache || cache.raw !== raw) cache = { raw, value: codec.decode(raw) };
        return cache.value;
    };

    const set = (value: T): void => {
        const raw = codec.encode(value);
        try {
            const storage = storageOrNull();
            if (!storage) throw new Error('no localStorage');
            if (raw === null) storage.removeItem(key);
            else storage.setItem(key, raw);
            memory = undefined;
        } catch {
            memory = raw;
        }
        listeners.forEach(listener => listener());
    };

    const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => {
            if (event.key === key || event.key === null) listener();
        };
        if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
        return () => {
            listeners.delete(listener);
            if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
        };
    };

    return { get, set, subscribe };
}
```

```ts
// src/design/usePref.ts
import { useSyncExternalStore } from 'react';
import type { Pref } from './local_pref';

/** The pref's current value; re-renders when this tab or another changes it. */
export function usePref<T>(pref: Pref<T>): T {
    return useSyncExternalStore(pref.subscribe, pref.get, pref.get);
}
```

- [ ] **Step 4: Write `src/design/theme_storage.ts`**

```ts
import { createPref } from './local_pref';
import type { ThemeMode } from './tokens';

/** What the user chose; 'system' is stored as no key at all (spec §6.1). */
export type ThemeChoice = ThemeMode | 'system';

export const THEME_KEY = 'eov.theme';
/** The foundation's key and the kit's (spec §6.1): read once, then deleted. */
export const LEGACY_THEME_KEYS = ['eov.quantumlab.theme', 'eov-color-theme'] as const;
export const PREFERS_LIGHT_QUERY = '(prefers-color-scheme: light)';

export function decodeThemeChoice(raw: string | null): ThemeChoice {
    return raw === 'dark' || raw === 'light' ? raw : 'system';
}

export function encodeThemeChoice(choice: ThemeChoice): string | null {
    return choice === 'system' ? null : choice;
}

export const themeChoicePref = createPref<ThemeChoice>(THEME_KEY, { decode: decodeThemeChoice, encode: encodeThemeChoice });

export function resolveMode(choice: ThemeChoice, prefersLight: boolean): ThemeMode {
    return choice === 'system' ? (prefersLight ? 'light' : 'dark') : choice;
}

/** Same rule as the HTML boot script, for a page that loaded before it existed. */
export function migrateLegacyTheme(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): void {
    if (!storage) return;
    try {
        if (decodeThemeChoice(storage.getItem(THEME_KEY)) === 'system') {
            for (const key of LEGACY_THEME_KEYS) {
                const legacy = storage.getItem(key);
                if (legacy === 'dark' || legacy === 'light') {
                    storage.setItem(THEME_KEY, legacy);
                    break;
                }
            }
        }
        for (const key of LEGACY_THEME_KEYS) storage.removeItem(key);
    } catch {
        // Storage refused: the in-memory pref takes over (local_pref.ts).
    }
}
```

- [ ] **Step 5: Rewrite `src/design/theme.ts` and `src/design/useQuantumTheme.ts`**

```ts
// src/design/theme.ts
import { createTheme, type Theme } from '@mui/material/styles';
import { FONT_SANS, RADIUS, SHADOWS, TOKENS, TYPE, type ThemeMode } from './tokens';

export type QuantumThemeMode = ThemeMode;

/**
 * The MUI theme for one mode, from the tokens alone (spec §6.3): palette,
 * typography and shape, plus component overrides through MUI's own theme
 * API -- no blanket `.Mui*` stylesheet rewrites.
 */
export function quantumTheme(mode: ThemeMode): Theme {
    const t = TOKENS[mode];
    const focus = { outline: `2px solid ${t['focus-ring']}`, outlineOffset: 2 };
    return createTheme({
        palette: {
            mode,
            primary: { main: t.accent, contrastText: t['on-fill'] },
            success: { main: t.success },
            warning: { main: t.warning },
            error: { main: t.danger },
            background: { default: t['bg-app'], paper: t['surface-1'] },
            text: { primary: t['text-1'], secondary: t['text-2'], disabled: t['text-3'] },
            divider: t['border-subtle'],
        },
        shape: { borderRadius: RADIUS.md },
        typography: {
            fontFamily: FONT_SANS,
            fontSize: TYPE.body.size,
            button: { textTransform: 'none', fontWeight: 500 },
        },
        components: {
            MuiCssBaseline: { styleOverrides: { body: { backgroundColor: t['bg-app'], color: t['text-1'] } } },
            MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
            MuiPopover: { styleOverrides: { paper: { boxShadow: SHADOWS[mode].popover, border: `1px solid ${t['border-subtle']}` } } },
            // §13: a visible focus ring on every MUI control, never removed.
            MuiButtonBase: { styleOverrides: { root: { '&.Mui-focusVisible': focus } } },
            MuiToggleButton: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        '&.Mui-selected, &.Mui-selected:hover': {
                            backgroundColor: t['selected-fill'], color: t['on-fill'], borderColor: t['selected-edge'],
                        },
                    },
                },
            },
            MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm } } },
            MuiTooltip: { styleOverrides: { tooltip: { borderRadius: RADIUS.sm, fontSize: TYPE.caption.size } } },
        },
    });
}
```

```ts
// src/design/useQuantumTheme.ts
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Theme } from '@mui/material/styles';
import { quantumTheme } from './theme';
import { PREFERS_LIGHT_QUERY, resolveMode, themeChoicePref, type ThemeChoice } from './theme_storage';
import type { ThemeMode } from './tokens';
import { usePref } from './usePref';

// Its own media subscription rather than src/useMediaQuery.ts: /admin.html may
// import only src/design/* (spec §9.7).
function subscribePrefersLight(onChange: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const list = window.matchMedia(PREFERS_LIGHT_QUERY);
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
}

function prefersLightNow(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PREFERS_LIGHT_QUERY).matches;
}

export function usePrefersLight(): boolean {
    return useSyncExternalStore(subscribePrefersLight, prefersLightNow, () => false);
}

/** What the boot script in index.html/admin.html does, kept in step afterwards. */
export function applyThemeToDocument(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
}

export interface QuantumThemeState {
    mode: ThemeMode;
    choice: ThemeChoice;
    setChoice(choice: ThemeChoice): void;
    theme: Theme;
}

/** Any number of components may call this: they share one stored choice (local_pref). */
export function useQuantumTheme(): QuantumThemeState {
    const choice = usePref(themeChoicePref);
    const prefersLight = usePrefersLight();
    const mode = resolveMode(choice, prefersLight);
    useEffect(() => applyThemeToDocument(mode), [mode]);
    const theme = useMemo(() => quantumTheme(mode), [mode]);
    return { mode, choice, setChoice: themeChoicePref.set, theme };
}
```

- [ ] **Step 6: Rewrite `src/design/ThemeSwitch.tsx`**

```tsx
import React, { useState } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import Check from '@mui/icons-material/Check';
import { useQuantumTheme } from './useQuantumTheme';
import type { ThemeChoice } from './theme_storage';
import type { ThemeMode } from './tokens';

export const THEME_LABEL: Record<ThemeMode, string> = { dark: 'Deep Space', light: 'Light Clean' };

const CHOICES: Array<{ choice: ThemeChoice; label: string }> = [
    { choice: 'dark', label: THEME_LABEL.dark },
    { choice: 'light', label: THEME_LABEL.light },
    { choice: 'system', label: 'Match system' },
];

/** The top-bar theme switch (spec §6.4); the same component in /admin.html. */
const ThemeSwitch: React.FC = () => {
    const { mode, choice, setChoice } = useQuantumTheme();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const label = `Theme: ${THEME_LABEL[mode]}`;
    return (
        <>
            <Tooltip title={label}>
                <IconButton
                    className="ql-icon-button"
                    aria-label={label}
                    aria-haspopup="menu"
                    aria-expanded={anchor !== null}
                    onClick={event => setAnchor(event.currentTarget)}
                >
                    {mode === 'dark' ? <DarkModeOutlined fontSize="small" /> : <LightModeOutlined fontSize="small" />}
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {CHOICES.map(item => (
                    <MenuItem
                        key={item.choice}
                        role="menuitemradio"
                        aria-checked={choice === item.choice}
                        selected={choice === item.choice}
                        onClick={() => { setChoice(item.choice); setAnchor(null); }}
                    >
                        <ListItemIcon>{choice === item.choice ? <Check fontSize="small" /> : null}</ListItemIcon>
                        <ListItemText>{item.label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

export default ThemeSwitch;
```

- [ ] **Step 7: Add the boot script to both HTML entries**

In `public/index.html` and `public/admin.html`, insert directly after `<meta charset="UTF-8">` (before the icon link and before the Roboto stylesheet link, which Task 3 removes), byte-identical in both files:

```html
    <!-- Spec §6.2: sets the theme before any CSS loads, so the first paint is themed.
         There is no CSP today; if one is added, this script's hash goes in it. -->
    <script data-theme-boot>
      (function () { var m = null; try { var s = window.localStorage, v = s.getItem('eov.theme');
        if (v !== 'dark' && v !== 'light') { var o = s.getItem('eov.quantumlab.theme') || s.getItem('eov-color-theme'); if (o === 'dark' || o === 'light') { s.setItem('eov.theme', o); v = o; } }
        s.removeItem('eov.quantumlab.theme'); s.removeItem('eov-color-theme'); if (v === 'dark' || v === 'light') m = v; } catch (e) {}
        if (!m) m = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', m); document.documentElement.style.colorScheme = m; })();
    </script>
```

- [ ] **Step 8: Run the tests**

Run: `npx jest tests/design`
Expected: PASS. Then the full suite (`npx jest`), `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm run build` (the build still shows the old look: nothing imports the new theme yet).

- [ ] **Step 9: Commit**

```bash
git add src/design/local_pref.ts src/design/usePref.ts src/design/theme_storage.ts src/design/theme.ts src/design/useQuantumTheme.ts src/design/ThemeSwitch.tsx public/index.html public/admin.html tests/design/local_pref.test.ts tests/design/theme_storage.test.ts tests/design/no_flash_script.test.ts tests/design/use_quantum_theme.test.tsx tests/design/quantum_theme.test.ts tests/design/theme_switch.test.tsx
git commit -m "feat(design): one eov.theme key with migration, no-flash boot script, MUI theme from tokens, theme switch (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/local_pref.ts src/design/usePref.ts src/design/theme_storage.ts src/design/theme.ts src/design/useQuantumTheme.ts src/design/ThemeSwitch.tsx public/index.html public/admin.html tests/design/local_pref.test.ts tests/design/theme_storage.test.ts tests/design/no_flash_script.test.ts tests/design/use_quantum_theme.test.tsx tests/design/quantum_theme.test.ts tests/design/theme_switch.test.tsx
```

---

### Task 3: Every existing surface themed in both themes; the live-check tool [visual]

**Estimate:** 2 h (≈ 40 min of it is the stylesheet pass). **Spec:** §4.1, §4.3, §6.3, §9.7 (admin reads the theme), §13 "Contrast", §14 "Live visual check". The layout is still today's floating panels; the shell arrives in Task 8. After this task the whole app — every mode, the phone sheet and `/admin.html` — reads correctly in Deep Space and Light Clean.

**Files:**
- Create: `src/design/design.css`, `tools/design/shoot.mjs`, `tools/design/scenes.json`, `tools/design/sample_points.json`
- Modify: `src/main.tsx`, `src/App.tsx` (drop its own `ThemeProvider`/`CssBaseline`/`appTheme` and the canvas Box's inline `#111`), `src/style.css` (every colour literal → token, per the table in Step 4), `src/admin/main.tsx`, `src/admin/AdminApp.tsx`, `src/admin/admin.css`, `public/index.html`, `public/admin.html` (Roboto links go)
- Delete: `src/theme.ts`, `src/design/quantumlab.css`
- Test: rewrite `tests/a11y/panel_contrast.test.ts`; `tests/design/admin_theme.test.tsx` (new)

**Interfaces:**
- Consumes: `useQuantumTheme`, `migrateLegacyTheme`, `ThemeSwitch` (Task 2); `TOKENS`, `ColorRole`, `THEME_MODES` (Task 1).
- Produces:
  - `src/design/design.css` classes: `.ql-caption`, `.ql-section`, `.ql-body`, `.ql-tabular`, `.ql-icon-button`, `.skip-link`; the global `:focus-visible` ring.
  - `tools/design/shoot.mjs` CLI: `--task <id> --scenes <names> --themes dark,light --sizes desktop,phone[,wide,tablet,phone-landscape] [--port 5411] [--wait ms] [--render '<eov.render JSON>']`; scene names from `tools/design/scenes.json`; writes `/tmp/6g1-<task>-<scene>-<theme>-<size>.png` and `/tmp/6g1-<task>-metrics.json` (per shot: `metrics.boxes`, `metrics.fonts`, `metrics.webglCanvases`, `metrics.insets`, `metrics.text`, `colours[]` with ΔE₀₀, `errors[]`).
  - The viewer's root renders `<ThemeProvider theme={quantumTheme(mode)}>` around `<App/>` (`src/main.tsx` `Root`); `App` no longer provides a theme. `src/theme.ts` no longer exists.

- [ ] **Step 1: Write the new contrast test (fails until the stylesheet is tokenised)**

Replace `tests/a11y/panel_contrast.test.ts` entirely with:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { ColorRole, THEME_MODES, TOKENS } from '../../src/design/tokens';

/**
 * Spec §13: panel_contrast reads TOKENS instead of regex-parsing literal
 * colours. Two halves: (1) style.css and admin.css paint with tokens -- no
 * stray colour literal survives except the listed science colours; (2) each
 * rule that sets text declares the tokens named here, and that pair is AA
 * in both themes.
 */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('src/style.css');
const adminCss = read('src/admin/admin.css');

/** The top-level rule for `selector`, anchored to a line start. */
function rule(selector: string, sheet: string = css): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^\\s*${escaped} \\{`, 'm').exec(sheet);
    if (!match) throw new Error(`No rule for ${selector}`);
    return sheet.slice(match.index, sheet.indexOf('}', match.index));
}

/** Colour literals allowed to stay: science colours (Task 12 moves the first four to science.ts) and fixed badges. */
const STYLE_LITERALS_ALLOWED = new Set([
    '#4da3ff', 'rgba(77, 163, 255, 0.22)', // the single radial curve: CURVE_COLORS[0]
    '#e02020', '#2040ff', // the ψ legend swatches (Classic legend colours)
    'rgba(91, 141, 217, 0.20)', 'rgba(217, 139, 74, 0.20)', 'rgba(74, 168, 138, 0.20)', 'rgba(157, 122, 212, 0.20)', // periodic blocks
    'rgba(0, 0, 0, 0.6)', // the structure preview's atom outlines, drawn on CPK colours
    '#a84300', '#ffffff', // the Computed tier chip and its white text (5.6:1 in both themes)
]);
const literals = (sheet: string) => [...sheet.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)].map(m => m[0]);

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

interface Pair { selector: string; declares: string[]; fg: ColorRole; bg: ColorRole }
const v = (role: ColorRole) => `var(--ql-color-${role})`;
const PAIRS: Pair[] = [
    { selector: '.scale-readout', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.radial-plot', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.radial-plot-title', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.radial-plot-note', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-2' },
    { selector: '.radial-plot-scale', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-2' },
    { selector: '.radial-plot-legend', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.canvas-busy', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.canvas-unbound', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.phase-legend', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '#controls', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.side-panel .level-nav', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.level-nav-breadcrumbs', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.level-nav-method', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.level-nav-valence-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.level-nav-shell-hint', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.level-nav-about', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.subshell-panel-legend', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.subshell-isolate-hint', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.subshell-j-note', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.species-method', declares: [`color: ${v('accent-text')}`], fg: 'accent-text', bg: 'surface-1' },
    { selector: '.species-measured', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.species-compare', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.relativity-what-changed', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.periodic-table-panel', declares: [`background: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.mo-diagram', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.mo-box', declares: [`border-bottom: 2px solid ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.mo-break', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.mo-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.mo-footer', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.side-panel .bonds-panel', declares: [`background-color: ${v('surface-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.bonds-panel', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.bonds-captions', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.bonds-density-label', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.bonds-frontier', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.bonds-note', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'surface-1' },
    { selector: '.esp-legend', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.esp-legend-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.molecule-picker-name', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-picker-status', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.molecule-readout', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.molecule-caption', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-orbital-degeneracy', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.molecule-orbital-card', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.molecule-orbital-gap', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-orbital-gap-caveat', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-orbital-legend', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-nav-orbital', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.molecule-error', declares: [`background-color: ${v('error-bg')}`, `color: ${v('error-text')}`], fg: 'error-text', bg: 'error-bg' },
    { selector: '.sign-in-error', declares: [`background-color: ${v('error-bg')}`, `color: ${v('error-text')}`], fg: 'error-text', bg: 'error-bg' },
    { selector: '.tier-badge', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.molecule-jobs .job-status', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.quote-option-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.quote-option-unavailable', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'surface-1' },
];
const ADMIN_PAIRS: Pair[] = [
    { selector: '.eov-admin-dashboard', declares: [`background: ${v('bg-app')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'bg-app' },
    { selector: '.admin-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'bg-app' },
    { selector: '.admin-error', declares: [`color: ${v('danger')}`], fg: 'danger', bg: 'bg-app' },
    { selector: '.admin-absorbed', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'bg-app' },
    { selector: '.cost-billed', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'bg-app' },
    { selector: '.daily-spend-title', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'bg-app' },
    { selector: '.daily-spend-label', declares: [`fill: ${v('text-3')}`], fg: 'text-3', bg: 'bg-app' },
];

describe('the stylesheets paint with tokens', () => {
    it('style.css has no colour literal outside the listed science colours', () => {
        expect(literals(css).filter(l => !STYLE_LITERALS_ALLOWED.has(l))).toEqual([]);
    });
    it('admin.css has no colour literal at all', () => {
        expect(literals(adminCss)).toEqual([]);
    });
});

describe.each(THEME_MODES)('panel text meets WCAG AA in %s', mode => {
    it.each(PAIRS.map(p => [p.selector, p] as const))('%s', (selector, pair) => {
        for (const declaration of pair.declares) expect(rule(selector)).toContain(declaration);
        expect(contrastRatio(rgb(TOKENS[mode][pair.fg]), rgb(TOKENS[mode][pair.bg]))).toBeGreaterThanOrEqual(4.5);
    });
    it.each(ADMIN_PAIRS.map(p => [p.selector, p] as const))('admin.css %s', (selector, pair) => {
        for (const declaration of pair.declares) expect(rule(selector, adminCss)).toContain(declaration);
        expect(contrastRatio(rgb(TOKENS[mode][pair.fg]), rgb(TOKENS[mode][pair.bg]))).toBeGreaterThanOrEqual(4.5);
    });
    it('the Computed chip keeps white on its own amber', () => {
        expect(rule('.tier-badge .tier-chip-computed')).toContain('background-color: #a84300');
        expect(contrastRatio([255, 255, 255], rgb('#a84300'))).toBeGreaterThanOrEqual(4.5);
    });
    it('a chosen quote is outlined at 3:1 or better', () => {
        expect(rule('.quote-option.chosen')).toContain(`border: 2px solid ${v('selected-edge')}`);
        expect(contrastRatio(rgb(TOKENS[mode]['selected-edge']), rgb(TOKENS[mode]['surface-1']))).toBeGreaterThanOrEqual(3);
    });
});
```

`tests/design/admin_theme.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import AdminApp from '../../src/admin/AdminApp';

describe('/admin.html reads the theme (spec §6.3, §9.7)', () => {
    it('offers the same theme switch as the viewer', () => {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        render(<Provider store={store}><AdminApp /></Provider>);
        expect(screen.getByRole('button', { name: /^Theme: / })).toBeInTheDocument();
    });
});
```

Run: `npx jest tests/a11y/panel_contrast.test.ts tests/design/admin_theme.test.tsx`
Expected: FAIL — literals still in both stylesheets; no theme button in the dashboard.

- [ ] **Step 2: The design-system stylesheet**

Create `src/design/design.css`:

```css
/* src/design/design.css -- the design system's shared rules (spec §4, §13).
   Imported once by each entry, after tokens.css and before its own sheet. */
html, body, #root { font-family: var(--ql-font-sans); }
.ql-body { font-size: var(--ql-type-body-size); line-height: var(--ql-type-body-line); color: var(--ql-color-text-1); }
.ql-section {
  margin: 0;
  font-size: var(--ql-type-section-size); line-height: var(--ql-type-section-line);
  font-weight: var(--ql-type-section-weight); color: var(--ql-color-text-1);
}
.ql-caption { font-size: var(--ql-type-caption-size); line-height: var(--ql-type-caption-line); color: var(--ql-color-text-3); }
.ql-tabular { font-variant-numeric: tabular-nums; }
.ql-icon-button { color: var(--ql-color-text-2); }
/* §13: a 2 px ring with a 2 px offset on every interactive element, never removed. */
:focus-visible { outline: 2px solid var(--ql-color-focus-ring); outline-offset: 2px; }
/* §13: "Skip to 3D view" and "Skip to controls", visible when focused. */
.skip-link {
  position: absolute; left: 8px; top: -48px; z-index: 100;
  padding: 8px 12px; border-radius: var(--ql-radius-md);
  background: var(--ql-color-surface-3); color: var(--ql-color-text-1); text-decoration: none;
}
.skip-link:focus { top: 8px; }
@media (max-width: 760px), (max-height: 500px), (max-width: 1100px) and (orientation: portrait) {
  /* §4.3: on a phone body is 14 and captions 12. */
  .ql-body { font-size: 14px; }
}
```

- [ ] **Step 3: The entries provide the theme; App stops doing so**

`src/main.tsx` — replace the import of `./style.css` and the render call so the file reads (keep every other line as it is):

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource-variable/inter';
import './design/tokens.css';
import './design/design.css';
import './style.css';
import { store } from './store';
import App from './App';
import { applyState, bindUrlStateStore, registerBuiltInUrlKeys } from './url_state';
import { registerBondsUrlKeys } from './bonds/bonds_url';
import { registerMoleculeUrlKeys } from './molecules/url_keys';
import { registerComputedUrlKeys } from './jobs/url_keys';
import { bindJobsClient } from './jobs/client';
import { startOwnerSession } from './jobs/owner_session';
import { migrateLegacyTheme } from './design/theme_storage';
import { useQuantumTheme } from './design/useQuantumTheme';

// The boot script in index.html has already migrated and applied the theme;
// this repeats the migration for a page served before the script existed.
try { migrateLegacyTheme(window.localStorage); } catch { /* storage refused: the pref keeps it in memory */ }

/** The theme lives here, above App, so a theme change never remounts the viewer (spec §3.2). */
function Root() {
  const { theme } = useQuantumTheme();
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

// Restore a shared view before the first render, so the app never draws a
// default view on its way to the linked one.
bindUrlStateStore(store);
bindJobsClient(store);
registerBuiltInUrlKeys();
registerBondsUrlKeys();
registerMoleculeUrlKeys();
registerComputedUrlKeys();
applyState(window.location.hash);
// Back from Cognito: the view the owner left travelled in the sign-in state (its hash); restore it.
// The exchange is a network round trip, so the default view shows until it
// answers (preflight D23, accepted): holding the first render back instead
// would leave a blank page for as long as Cognito takes, or for ever.
void startOwnerSession(store.dispatch, '/').then(back => {
  if (back) applyState(new URL(back, window.location.origin).hash);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <Root />
    </Provider>
  </React.StrictMode>,
);
```

`src/App.tsx`:
- Remove `ThemeProvider` and `CssBaseline` from the `@mui/material` import, and delete `import { appTheme } from './theme';` and the comment line `// The theme lives in theme.ts so its contrast is testable.`
- In the returned JSX replace `<ThemeProvider theme={appTheme}>` / `<CssBaseline />` / `</ThemeProvider>` with a fragment `<>` … `</>`.
- In the `#canvas-container` `Box`, delete `backgroundColor: '#111'` from `sx` (style.css paints it from the token).

Delete `src/theme.ts` and `src/design/quantumlab.css`:

```bash
grep -rn "from './theme'\|from '../theme'\|src/theme'\|quantumlab.css" src tests || echo "no other users"
git rm -q src/theme.ts src/design/quantumlab.css
```

Expected: `no other users` (the only user of `appTheme` besides App was the old panel_contrast test, replaced in Step 1).

- [ ] **Step 4: Tokenise `src/style.css`**

Make these replacements (declaration by declaration; keep every other property and every comment as it is). "→" names the new declaration.

| Rule(s) | Old | New |
|---|---|---|
| `html, body, #root` | `font-family: 'Roboto', sans-serif;` · `background-color: #050505;` | `font-family: var(--ql-font-sans);` · `background-color: var(--ql-color-bg-app);` (add `color: var(--ql-color-text-1);`) |
| `#canvas-container` | `background-color: #111;` | `background: var(--ql-color-canvas);` |
| `.view-panel-toggle` | border `rgba(255, 255, 255, 0.18)` · background `rgba(8, 8, 10, 0.72)` · `color: #fff` · `font: 500 14px 'Roboto', sans-serif` | `border: 1px solid var(--ql-color-border-subtle)` · `background: var(--ql-color-surface-2)` · `color: var(--ql-color-text-1)` · `font: var(--ql-type-nav-weight) var(--ql-type-nav-size) var(--ql-font-sans)` |
| `.side-panel .level-nav`, `#controls`, `.side-panel .bonds-panel`, `.molecule-orbital-card`, `.molecule-jobs .job-status` (the `@media (max-height: 500px)` copy too) | `background-color: rgba(240, 240, 240, 0.96)` · `box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1)` · any `color: rgba(0, 0, 0, 0.87)` | `background-color: var(--ql-color-surface-1)` · `box-shadow: var(--ql-shadow-panel)` · `color: var(--ql-color-text-1)` — add `color: var(--ql-color-text-1)` and `border: 1px solid var(--ql-color-border-subtle)` where the rule had no colour |
| `.atom-error` (none) / `.sign-in-error`, `.molecule-error` | `color: rgb(95, 33, 32)` · `background-color: rgb(253, 237, 237)` | `color: var(--ql-color-error-text)` · `background-color: var(--ql-color-error-bg)` |
| `#controls input[type="number"]` | `border: 1px solid #ccc` | `border: 1px solid var(--ql-color-border-strong)` |
| `#controls button#update-orbital` / `:hover` | `#3498db` / `#2980b9` | `var(--ql-color-accent-fill)` / `var(--ql-color-accent)` |
| `.scale-readout`, `.radial-plot`, `.phase-legend`, `.esp-legend`, `.molecule-readout` | `background: rgba(8, 8, 10, 0.85)` · `border: 1px solid rgba(255, 255, 255, 0.16)` · `color: #fff` | `background: var(--ql-color-surface-2)` · `border: 1px solid var(--ql-color-border-subtle)` · `color: var(--ql-color-text-1)` |
| `.scale-readout-bar` | `border: 2px solid rgba(255, 255, 255, 0.95)` | `border: 2px solid var(--ql-color-text-1)` |
| `.radial-plot-title` | `rgba(255, 255, 255, 0.75)` | `color: var(--ql-color-text-2)` |
| `.radial-plot-axis` | `stroke: rgba(255, 255, 255, 0.35)` | `stroke: var(--ql-color-plot-axis)` |
| `.radial-plot-scale`, `.radial-plot-note` | `rgba(255, 255, 255, 0.7)`, `0.55` | `color: var(--ql-color-text-3)` |
| `.radial-plot-legend` | `rgba(255, 255, 255, 0.85)` | `color: var(--ql-color-text-2)` |
| `.radial-plot-legend-peak` | `background: rgba(255, 255, 255, 0.6)` | `background: var(--ql-color-text-3)` |
| `.radial-plot-legend-dash` | `rgba(255, 255, 255, 0.75)` | `border-top: 2px dashed var(--ql-color-text-2)` |
| `.radial-plot-peak` / `.radial-plot-hover-rule` | `rgba(255, 255, 255, 0.6)` / `0.8` | `stroke: var(--ql-color-text-3)` / `stroke: var(--ql-color-text-2)` |
| `.radial-plot-hover-readout` | `color: #fff` | `color: var(--ql-color-text-1)` |
| `.canvas-busy`, `.canvas-unbound` | `rgba(8, 8, 10, 0.8)`/`0.85` · border `rgba(255, 255, 255, 0.18)` / `rgba(255, 183, 77, 0.6)` · `#fff` | `background: var(--ql-color-surface-2)` · `border: 1px solid var(--ql-color-border-subtle)` / `border: 1px solid var(--ql-color-warning)` · `color: var(--ql-color-text-1)` |
| `.potential-marker` / `.potential-reference` / `.potential-axis-label` / `.potential-reference-note` | `#ffffff` / `#8bc34a` / `fill: #9aa4ad; font-size: 9px` / `#c5e1a5` | `stroke: var(--ql-color-text-1)` / `stroke: var(--ql-color-success)` (spec §9.3) / `fill: var(--ql-color-text-3); font-size: var(--ql-type-tick-size)` (§4.3: nothing under 11 px) / `color: var(--ql-color-success)` |
| phone `.level-nav-header`, `.bonds-header` | `background: rgba(240, 240, 240, 0.96)` · `box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35)` · `color: rgba(0, 0, 0, 0.87)` | `background: var(--ql-color-surface-1)` · `box-shadow: var(--ql-shadow-popover)` · `color: var(--ql-color-text-1)` |
| `.level-nav-location` | `rgba(0, 0, 0, 0.72)` | `color: var(--ql-color-text-2)` |
| `.phone-sheet` · `.phone-sheet.open .phone-sheet-tabs` · `.phone-sheet-tab` · `.phone-sheet-tab[aria-selected="true"]` · `.phone-sheet-body .radial-plot` | `rgba(240, 240, 240, 0.97)` + `0 -4px 24px rgba(0, 0, 0, 0.5)` · `rgba(0, 0, 0, 0.1)` · `rgba(0, 0, 0, 0.62)`, `font: 500 14px 'Roboto'` · `#1565c0` twice · `#111` | `background: var(--ql-color-surface-1)` + `box-shadow: var(--ql-shadow-popover)` · `border-top: 1px solid var(--ql-color-border-subtle)` · `color: var(--ql-color-text-2)`, `font: var(--ql-type-nav-weight) var(--ql-type-nav-size) var(--ql-font-sans)` · `color: var(--ql-color-accent-text); border-top-color: var(--ql-color-selected-edge)` · `background: var(--ql-color-surface-2)` |
| `.level-nav-breadcrumbs` | `rgba(0, 0, 0, 0.87)` | `color: var(--ql-color-text-1)` |
| `.level-nav-method`, `.level-nav-valence-note`, `.level-nav-about`, `.subshell-panel-legend` | `opacity: 0.75` / `0.75` / `0.85` / `0.75` | remove the `opacity` line; `color: var(--ql-color-text-2)` |
| `.level-nav-shell-hint`, `.subshell-isolate-hint`, `.subshell-j-note`, `.periodic-tile-number` | `opacity: 0.7` / `0.7` / `0.7` / `0.65` | remove the `opacity` line; `color: var(--ql-color-text-3)` |
| `.species-method` | `color: #1f4e9a; border-bottom: 1px dotted #1f4e9a` | `color: var(--ql-color-accent-text); border-bottom: 1px dotted var(--ql-color-accent-text)` |
| `.species-measured`, `.species-compare`, `.relativity-what-changed` | `rgba(0, 0, 0, 0.62)`, `0.7`, `0.78` | `color: var(--ql-color-text-2)` |
| `.species-compare-swatch` | `rgba(0, 0, 0, 0.6)` | `border-top: 2px dashed var(--ql-color-text-2)` |
| `.level-nav-shell-chip:not(.selected)` | `background: rgba(255, 255, 255, 0.7) !important` | `background: var(--ql-color-surface-2) !important` |
| `.level-nav-shell-chip.valence .MuiChip-label::before` | `background: #f4b400` | `background: var(--ql-color-warning)` |
| `.subshell-ml-button.selected` | `rgba(25, 118, 210, 0.14)` | `background: color-mix(in srgb, var(--ql-color-accent) 16%, transparent)` |
| `.subshell-energy-rule` / `.subshell-energy-leader` / `.subshell-energy-label` | `rgba(0, 0, 0, 0.28)` / `0.35` / `fill: rgba(0, 0, 0, 0.8)` | `stroke: var(--ql-color-border-strong)` / `stroke: var(--ql-color-text-3)` / `fill: var(--ql-color-text-2)` |
| `.periodic-table-panel` | `box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7)` · `rgba(8, 8, 10, 0.94)` · border `0.14` · `#fff` | `box-shadow: var(--ql-shadow-popover)` · `background: var(--ql-color-surface-1)` · `border: 1px solid var(--ql-color-border-subtle)` · `color: var(--ql-color-text-1)` |
| `.periodic-tile` | `background: rgba(255, 255, 255, 0.06)` · `color: #fff` | `background: var(--ql-color-surface-2)` · `color: var(--ql-color-text-1)` |
| `.periodic-tile.in-column` / `.periodic-tile.selected` | `rgba(255, 255, 255, 0.55)` / `0 0 0 2px #fff` | `inset 0 0 0 1px var(--ql-color-border-strong)` / `0 0 0 2px var(--ql-color-selected-edge)` |
| `.mo-diagram`, `.mo-box`, `.bonds-panel` | `rgba(0, 0, 0, 0.87)` | `var(--ql-color-text-1)` (`.mo-box`: `border-bottom: 2px solid var(--ql-color-text-1)`) |
| `.mo-box.selected` | `outline: 2px solid #1565c0` | `outline: 2px solid var(--ql-color-selected-edge)` |
| `.mo-break`, `.mo-note`, `.mo-footer`, `.bonds-captions`, `.bonds-density-label`, `.bonds-frontier` | `rgba(0, 0, 0, 0.6)` / `0.62` / `0.7` | `color: var(--ql-color-text-2)` |
| `.bonds-note`, `.quote-option-unavailable` | `#8a4100` | `color: var(--ql-color-warning)` |
| `.esp-legend-note` | `opacity: 0.85` | remove; `color: var(--ql-color-text-2)` |
| `.esp-legend-info[aria-expanded="true"]` (the rule with `color: #fff`) | `#fff` | `var(--ql-color-text-1)` |
| `.molecule-picker-name` / `.molecule-picker-status` | `opacity: 0.85` / `0.8` | remove; `color: var(--ql-color-text-2)` / `color: var(--ql-color-text-3)` |
| `.molecule-caption` / `.molecule-orbital-degeneracy` | `opacity: 0.75` / `0.7` | remove; `color: var(--ql-color-text-2)` / `color: var(--ql-color-text-3)` |
| `.molecule-orbital-row.selected` | `border-color: #1976d2` · `rgba(25, 118, 210, 0.08)` | `border-color: var(--ql-color-selected-edge)` · `background: color-mix(in srgb, var(--ql-color-accent) 10%, transparent)` |
| `.molecule-orbital-gap` / `-caveat` | dashed `rgba(0, 0, 0, 0.35)` ×2 · `rgba(0, 0, 0, 0.62)` | `var(--ql-color-border-strong)` ×2 · `color: var(--ql-color-text-2)` |
| `.molecule-orbital-legend` | `background-color: rgb(240, 240, 240)` · `rgba(0, 0, 0, 0.7)` | `background-color: var(--ql-color-surface-1)` · `color: var(--ql-color-text-2)` |
| `.molecule-nav-orbital` | `rgba(0, 0, 0, 0.87)` | `color: var(--ql-color-text-1)` |
| `.structure-preview svg` | `background: #111` | `background: var(--ql-color-canvas-solid)` |
| `.tier-badge` / `.molecule-jobs .MuiAccordion-root` | `rgba(240, 240, 240, 0.94)` | `background: var(--ql-color-surface-2); color: var(--ql-color-text-1)` / `background: var(--ql-color-surface-1)` |
| `.quote-option` / `.quote-option.chosen` / `.quote-option-note` | `rgba(0, 0, 0, 0.3)` / `#0d47a1` / `rgba(0, 0, 0, 0.7)` | `var(--ql-color-border-strong)` / `border: 2px solid var(--ql-color-selected-edge)` / `color: var(--ql-color-text-2)` |
| `.job-log-tail` | `background: #111; color: #e6e6e6` | `background: var(--ql-color-surface-3); color: var(--ql-color-text-1)` |

Then check nothing is left:

```bash
node -e "const s=require('fs').readFileSync('src/style.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');console.log([...s.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)].map(m=>m[0]).join('\n'))"
```

Expected: only the allowed literals of Step 1 (`#4da3ff`, `rgba(77, 163, 255, 0.22)`, `#e02020`, `#2040ff`, the four periodic-block tints, `rgba(0, 0, 0, 0.6)` in `.structure-preview-atom`, `#a84300`, `#ffffff`).

- [ ] **Step 5: Admin reads the theme**

`src/admin/main.tsx`: add, above `import './admin.css';`:

```ts
import '@fontsource-variable/inter';
import '../design/tokens.css';
import '../design/design.css';
import { migrateLegacyTheme } from '../design/theme_storage';
```

and before `ReactDOM.createRoot…`: `try { migrateLegacyTheme(window.localStorage); } catch { /* in memory */ }`.

`src/admin/AdminApp.tsx`: delete `createTheme` from the MUI import and the `adminTheme` constant with its comment; add

```ts
import ThemeSwitch from '../design/ThemeSwitch';
import { useQuantumTheme } from '../design/useQuantumTheme';
```

At the top of the component body: `const { theme } = useQuantumTheme();` and use `<ThemeProvider theme={theme}>`. In the header, after `<a href="/">Back to the viewer</a>`, add `<ThemeSwitch />`.

`src/admin/admin.css`: `html, body, #root` → `font-family: var(--ql-font-sans);` plus `background: var(--ql-color-bg-app);`; `.eov-admin-dashboard` → `background: var(--ql-color-bg-app); color: var(--ql-color-text-1);`; `.admin-note` → `color: var(--ql-color-text-2)`; `.admin-error` → `color: var(--ql-color-danger)`; `.admin-absorbed` → `color: var(--ql-color-warning)`; `.cost-billed`, `.daily-spend-title` → `color: var(--ql-color-text-1)`; `.daily-spend-bar` → `fill: var(--ql-color-accent)`; `.daily-spend-axis` → `stroke: var(--ql-color-plot-axis)`; `.daily-spend-label` → `fill: var(--ql-color-text-3)`. Its header comment's "on a white page" becomes "on the theme's page colour".

`public/index.html`: delete the Roboto `<link rel="stylesheet" …fonts.googleapis.com…>` and set `<title>QuantumLab</title>` (the default brand's name, spec §5). `public/admin.html`: delete the Roboto link and set `<title>Owner dashboard · QuantumLab</title>`.

- [ ] **Step 6: The live-check tool**

`tools/design/scenes.json`:

```json
{
  "home": "",
  "admin": "admin.html",
  "c-whole": "#mode=atom&Z=6&level=atom",
  "c-2pz": "#mode=atom&Z=6&level=orbital&n=2&l=1&ml=0",
  "fe-shell": "#mode=atom&Z=26&level=shell&n=3",
  "na-ion": "#mode=atom&Z=11&charge=1&level=atom",
  "basic-3dz2": "#mode=basic&n=3&l=2&ml=0",
  "bonds-n2": "#mode=bonds&system=n2",
  "water": "#mode=molecule&id=h2o"
}
```

`tools/design/sample_points.json` (a point is a fraction `x`/`y` of the element's box, or `px`/`py` pixels from its top-left; a missing element is reported, not an error):

```json
{
  "desktop": [
    { "name": "top bar", "selector": ".app-topbar", "x": 0.42, "py": 4, "token": "bg-bar" },
    { "name": "rail", "selector": ".app-rail", "x": 0.5, "y": 0.985, "token": "bg-bar" },
    { "name": "page gutter", "selector": ".app-workspace", "px": 6, "y": 0.5, "token": "bg-app" },
    { "name": "explore panel", "selector": ".explore-panel", "x": 0.5, "y": 0.992, "token": "surface-1" },
    { "name": "inspector", "selector": ".inspector", "x": 0.5, "y": 0.992, "token": "surface-1" },
    { "name": "controls card", "selector": "#controls", "x": 0.97, "y": 0.5, "token": "surface-1" },
    { "name": "canvas left edge", "selector": "#canvas-container", "x": 0.03, "y": 0.6, "token": "canvas" },
    { "name": "canvas upper right", "selector": "#canvas-container", "x": 0.97, "y": 0.22, "token": "canvas" }
  ],
  "phone": [
    { "name": "phone top bar", "selector": ".phone-topbar", "x": 0.5, "py": 3, "token": "bg-bar" },
    { "name": "sheet tabs", "selector": ".phone-sheet-tabs", "x": 0.5, "y": 0.5, "token": "surface-1" },
    { "name": "canvas left edge", "selector": "#canvas-container", "x": 0.03, "y": 0.55, "token": "canvas" }
  ]
}
```

`tools/design/shoot.mjs`:

```js
#!/usr/bin/env node
// The 6G live visual check (spec §14; the project's ruling D6). Starts its own
// Vite on a free port and its own headless Chromium, captures each scene in
// each theme and size, measures boxes, fonts and colours, then stops both in
// the same foreground run. It never touches the owner's browser or servers.
//   node tools/design/shoot.mjs --task T3 --scenes c-whole,c-2pz --themes dark,light --sizes desktop,phone [--port 5411] [--render '<eov.render JSON>']
// Writes /tmp/6g1-<task>-<scene>-<theme>-<size>.png and /tmp/6g1-<task>-metrics.json.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE2000, hexToLab } from '../../src/design/colour_math.ts';
import { TOKENS } from '../../src/design/tokens.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const OWNER_PORTS = new Set([5173, 5391, 8787]);
const SIZES = {
  desktop: { width: 1440, height: 900 },
  wide: { width: 1728, height: 1000 },
  tablet: { width: 1024, height: 768 },
  phone: { width: 390, height: 844, mobile: true },
  'phone-landscape': { width: 844, height: 390, mobile: true },
};

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const task = arg('task', 'adhoc');
const port = Number(arg('port', '5411'));
if (OWNER_PORTS.has(port)) throw new Error(`port ${port} is the owner's; use 5411-5419`);
const scenes = JSON.parse(readFileSync(resolve(ROOT, 'tools/design/scenes.json'), 'utf8'));
const samplePoints = JSON.parse(readFileSync(resolve(ROOT, 'tools/design/sample_points.json'), 'utf8'));
const sceneNames = arg('scenes', 'c-whole').split(',');
const themes = arg('themes', 'dark,light').split(',');
const sizes = arg('sizes', 'desktop,phone').split(',');
const extraWait = Number(arg('wait', '1500'));
// Optional presentation preferences (eov.render JSON), e.g. '{"finish":"solid","scheme":"density"}'.
const renderPrefs = arg('render', null);

function startVite() {
  const vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('Vite did not start within 30 s')), 30000);
    const watch = chunk => { if (String(chunk).includes(`localhost:${port}`)) { clearTimeout(timer); ok(); } };
    vite.stdout.on('data', watch);
    vite.stderr.on('data', chunk => { process.stderr.write(chunk); watch(chunk); });
    vite.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited with ${code}`)); });
  });
  return { vite, ready };
}

/** Waits for the canvas to stop saying it is busy, and stay quiet for 2.5 s. */
async function settle(page) {
  const deadline = Date.now() + 60000;
  let quietSince = null;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => Boolean(document.querySelector('.canvas-busy'))
      || document.querySelector('#canvas-container')?.getAttribute('data-busy') === 'true');
    if (busy) quietSince = null;
    else if (quietSince === null) quietSince = Date.now();
    else if (Date.now() - quietSince > 2500) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

function collectMetrics() {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const font = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, line: s.lineHeight };
  };
  const canvases = [...document.querySelectorAll('canvas')];
  return {
    theme: document.documentElement.dataset.theme ?? null,
    title: document.title,
    boxes: Object.fromEntries(['.app-topbar', '.app-rail', '.explore-panel', '#canvas-container', '.inspector', '.thumbnail-strip',
      '.viewport-title', '.viewport-toolbar', '.key-column', '.phone-topbar', '.phone-header', '.phone-sheet'].map(s => [s, box(s)])),
    fonts: { title: font('.viewport-title h1'), nav: font('.app-topbar-tab'), body: font('.explore-panel .ql-body') ?? font('.explore-panel'), caption: font('.ql-caption') },
    canvases: canvases.length,
    // The renderer's canvas, plus any canvas that is not a 2D thumbnail tile: §12 allows exactly one.
    webglCanvases: canvases.filter(c => !c.classList.contains('thumb-canvas')).length,
    insets: window.__eovInsets ?? null,
    text: {
      title: document.querySelector('.viewport-title')?.textContent ?? null,
      keys: document.querySelector('.key-column')?.textContent ?? null,
      enclosed: document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.textContent ?? null,
    },
  };
}

async function sampleColours(page, png, size) {
  const points = samplePoints[size.startsWith('phone') ? 'phone' : 'desktop'];
  return page.evaluate(async ({ b64, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0);
    const out = {};
    for (const p of points) {
      const el = document.querySelector(p.selector);
      if (!el) { out[p.name] = null; continue; }
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(r.x + (p.px ?? p.x * r.width))));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(r.y + (p.py ?? p.y * r.height))));
      const d = g.getImageData(x, y, 1, 1).data;
      out[p.name] = { x, y, token: p.token, hex: `#${[d[0], d[1], d[2]].map(c => c.toString(16).padStart(2, '0')).join('')}` };
    }
    return out;
  }, { b64: png.toString('base64'), points });
}

/** UI tokens within ΔE₀₀ 3; the canvas, drawn on and off, within 5 (the canvas must not paint its own backdrop). */
function judge(on, off, theme) {
  return Object.entries(on).map(([name, s]) => {
    if (!s) return { name, missing: true };
    if (s.token === 'canvas') {
      const dE = deltaE2000(hexToLab(s.hex), hexToLab(off[name].hex));
      return { name, hex: s.hex, canvasOff: off[name].hex, dE: Number(dE.toFixed(2)), pass: dE <= 5 };
    }
    const tokenHex = TOKENS[theme][s.token];
    if (!/^#[0-9a-f]{6}$/i.test(tokenHex)) return { name, hex: s.hex, token: s.token, note: 'token is not one flat colour' };
    const dE = deltaE2000(hexToLab(s.hex), hexToLab(tokenHex));
    return { name, hex: s.hex, token: s.token, tokenHex, dE: Number(dE.toFixed(2)), pass: dE <= 3 };
  });
}

const results = [];
const { vite, ready } = startVite();
let browser;
try {
  await ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const scene of sceneNames) {
    if (!(scene in scenes)) throw new Error(`unknown scene ${scene} (tools/design/scenes.json)`);
    for (const theme of themes) {
      for (const size of sizes) {
        const spec = SIZES[size];
        if (!spec) throw new Error(`unknown size ${size}`);
        const context = await browser.newContext({
          viewport: { width: spec.width, height: spec.height }, isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile),
          deviceScaleFactor: 1, reducedMotion: 'reduce',
        });
        await context.addInitScript(({ choice, prefs }) => {
          try {
            window.localStorage.setItem('eov.theme', choice);
            if (prefs) window.localStorage.setItem('eov.render', prefs);
          } catch { /* storage refused: the app keeps its defaults */ }
        }, { choice: theme, prefs: renderPrefs });
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(`http://localhost:${port}/${scenes[scene]}`, { waitUntil: 'load' });
        const settled = await settle(page);
        await page.waitForTimeout(extraWait);
        const file = `/tmp/6g1-${task}-${scene}-${theme}-${size}.png`;
        const png = await page.screenshot({ path: file });
        const metrics = await page.evaluate(collectMetrics);
        const on = await sampleColours(page, png, size);
        await page.addStyleTag({ content: '#orbital-canvas-host canvas { visibility: hidden !important; }' });
        await page.waitForTimeout(150);
        const off = await sampleColours(page, await page.screenshot(), size);
        results.push({ scene, theme, size, file, settled, metrics, colours: judge(on, off, theme), errors });
        console.log(`${file}  settled=${settled}  webgl=${metrics.webglCanvases}  errors=${errors.length}`);
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
writeFileSync(`/tmp/6g1-${task}-metrics.json`, JSON.stringify(results, null, 2));
console.log(`wrote /tmp/6g1-${task}-metrics.json (${results.length} shots)`);
```

- [ ] **Step 7: Run the tests and the build**

Run: `npx jest tests/a11y tests/design` → PASS. Then `npx jest` (whole suite: every App test still passes — App no longer provides a theme, and MUI's default theme in tests is fine), `npx tsc --noEmit -p tsconfig.json` (exit 0), `npm run build`, `npm run check:admin-split` ("admin split ok").

- [ ] **Step 8: Live check [visual] (expect ~4 min)**

```bash
lsof -iTCP:5411 -sTCP:LISTEN -P || echo "5411 free"
node tools/design/shoot.mjs --task T3 --scenes c-whole,c-2pz,basic-3dz2,bonds-n2 --themes dark,light --sizes desktop,phone
```

Expected: 16 lines `/tmp/6g1-T3-… settled=true webgl=1 errors=0`, then `wrote /tmp/6g1-T3-metrics.json (16 shots)`. (If 5411 is taken, add `--port 5412`.) Read every PNG and both concepts and write `/tmp/6g1-T3-checklist.md`. What this task owns: panel, card, sheet, chip and periodic-table colours match their tokens in both themes ("controls card" ΔE₀₀ ≤ 3); every text in every panel is readable in both themes; the font is Inter; the old layout is unchanged in shape (layout is Task 8 — note it, do not fail it); `/tmp/6g1-T3-c-2pz-light-desktop.png` still shows today's red/blue phase colours (Task 14). Then the dashboard in both themes: `node tools/design/shoot.mjs --task T3 --scenes admin --themes dark,light --sizes desktop` (the `admin` scene opens `/admin.html`; it shows the sign-in prompt, which is enough to judge its page, text and theme switch).

- [ ] **Step 9: Commit**

```bash
git add src/design/design.css src/main.tsx src/App.tsx src/style.css src/admin/main.tsx src/admin/AdminApp.tsx src/admin/admin.css public/index.html public/admin.html tools/design/shoot.mjs tools/design/scenes.json tools/design/sample_points.json tests/a11y/panel_contrast.test.ts tests/design/admin_theme.test.tsx
git commit -m "feat(design): every surface themed from tokens in Deep Space and Light Clean; Inter; live-check tool (Phase 6G-1)" -m "panel_contrast now reads TOKENS (spec §13) instead of literal colours; src/theme.ts and the foundation's quantumlab.css are gone." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/design.css src/main.tsx src/App.tsx src/style.css src/admin/main.tsx src/admin/AdminApp.tsx src/admin/admin.css public/index.html public/admin.html tools/design/shoot.mjs tools/design/scenes.json tools/design/sample_points.json tests/a11y/panel_contrast.test.ts tests/design/admin_theme.test.tsx src/theme.ts src/design/quantumlab.css
```

---

### Task 4: Brands — list, owner-only preference, wordmark, mark, admin title and export metadata

**Estimate:** 60 min. **Spec:** §5 (all), §4.8 (brand mark, favicon). The owner-only "Brand preview" control itself lives in the avatar menu (Task 6); this task makes the brand data, its store and everything that names it.

**Files:**
- Create: `src/design/brands.ts`, `src/design/useBrand.ts`, `src/design/Wordmark.tsx`, `src/design/BrandMark.tsx`
- Modify: `src/design/design.css` (wordmark rules), `public/electron-icon.svg` (redrawn mark = favicon), `src/main.tsx` (dev `?brand=`), `src/admin/AdminApp.tsx` (wordmark in the header; `document.title`), `src/export/stl.ts`, `src/export/gltf.ts`, `src/export/run_export.ts`, `src/export/png.ts` (footer)
- Test: `tests/design/brands.test.ts`, `tests/design/wordmark.test.tsx`; update `tests/export/cube_request.test.ts:34`, `tests/export/run_export.test.ts:457`, `tests/export/molecule_exports.test.ts:361,379`, `tests/export/stl.test.ts` (header), `tests/export/png.test.ts` (footer)

**Interfaces:**
- Consumes: `createPref` (Task 2), `usePref` (Task 2), `TOKENS`, `ThemeMode` (Task 1), `BUILD_ENV` (`src/jobs/build_env.ts`, mapped to a mutable stub in Jest).
- Produces:
  - `brands.ts`: `interface Brand { id: BrandId; name: string; parts: [string, string]; accent: { dark: string; light: string } }`; `type BrandId = 'quantumlab' | 'atomvista' | 'novalab' | 'learnlab' | 'moleculeforge'`; `BRANDS`; `DEFAULT_BRAND_ID`; `BRAND_KEY = 'eov.brand'`; `brandById(id: string | null): Brand`; `brandPref: Pref<BrandId>`; `currentBrand(): Brand`; `exportAppLabel(brand?: Brand): string` → `"QuantumLab (electron-orbital-viewer)"`; `applyDevBrandParam(search: string, dev: boolean): void`; `accentStops(accent: string): string[]`.
  - `useBrand.ts`: `useBrand(): Brand`.
  - `Wordmark.tsx`: `Wordmark({ brand, mode }: { brand: Brand; mode: ThemeMode })` → `<span class="ql-wordmark">`.
  - `BrandMark.tsx`: `BrandMark({ size }: { size?: number })` → decorative `<svg class="ql-brand-mark" aria-hidden>`.
  - `OverlaySpec.footer?: string` in `src/export/png.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/design/brands.test.ts`:

```ts
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import {
    accentStops, applyDevBrandParam, BRAND_KEY, brandById, brandPref, BRANDS, currentBrand, DEFAULT_BRAND_ID, exportAppLabel,
} from '../../src/design/brands';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };
afterEach(() => window.localStorage.clear());

describe('brands (spec §5)', () => {
    it('lists the five candidates with QuantumLab the default', () => {
        expect(BRANDS.map(b => b.id)).toEqual(['quantumlab', 'atomvista', 'novalab', 'learnlab', 'moleculeforge']);
        expect(DEFAULT_BRAND_ID).toBe('quantumlab');
        expect(BRANDS.every(b => b.parts.join('') === b.name)).toBe(true);
    });

    it('falls back to the default for an unknown or missing id', () => {
        expect(brandById('nonsense').id).toBe('quantumlab');
        expect(brandById(null).id).toBe('quantumlab');
        window.localStorage.setItem(BRAND_KEY, 'nonsense');
        expect(currentBrand().id).toBe('quantumlab');
    });

    it('stores the owner\'s preview choice under eov.brand', () => {
        brandPref.set('novalab');
        expect(window.localStorage.getItem(BRAND_KEY)).toBe('novalab');
        expect(currentBrand().name).toBe('NovaLab');
    });

    it('takes ?brand= only on the dev server, and only a known id', () => {
        applyDevBrandParam('?brand=atomvista', false);
        expect(currentBrand().id).toBe('quantumlab');
        applyDevBrandParam('?brand=nope', true);
        expect(currentBrand().id).toBe('quantumlab');
        applyDevBrandParam('?brand=atomvista', true);
        expect(currentBrand().id).toBe('atomvista');
    });

    it('labels exports with the brand and keeps the repository id, inside an STL header for every brand', () => {
        expect(exportAppLabel()).toBe('QuantumLab (electron-orbital-viewer)');
        for (const brand of BRANDS) {
            expect(`${exportAppLabel(brand)}, millimetres, 1 a0 = 0.01665 mm`.length).toBeLessThanOrEqual(80);
        }
    });

    it.each(THEME_MODES)('holds every accent stop to 4.5:1 against bg-bar in %s', mode => {
        for (const brand of BRANDS) {
            for (const stop of accentStops(brand.accent[mode])) {
                expect(contrastRatio(rgb(stop), rgb(TOKENS[mode]['bg-bar']))).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('reads a gradient\'s stops and a solid colour alike', () => {
        expect(accentStops('linear-gradient(90deg,#8A6CFF,#C05CF2)')).toEqual(['#8A6CFF', '#C05CF2']);
        expect(accentStops('#5AA9FF')).toEqual(['#5AA9FF']);
    });
});
```

`tests/design/wordmark.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import { BRANDS } from '../../src/design/brands';
import Wordmark from '../../src/design/Wordmark';
import BrandMark from '../../src/design/BrandMark';

describe('Wordmark and BrandMark', () => {
    it('renders the two-tone name, the second part in the accent with a solid fallback', () => {
        const { container } = render(<Wordmark brand={BRANDS[0]} mode="dark" />);
        expect(container.textContent).toBe('QuantumLab');
        const second = container.querySelector('.ql-wordmark-second') as HTMLElement;
        expect(second.textContent).toBe('Lab');
        expect(second.className).toContain('gradient');
        expect(second.style.getPropertyValue('--ql-brand-solid')).toBe('#8A6CFF');
    });

    it('keeps a solid accent solid', () => {
        const { container } = render(<Wordmark brand={BRANDS[1]} mode="light" />);
        const second = container.querySelector('.ql-wordmark-second') as HTMLElement;
        expect(second.className).not.toContain('gradient');
        expect(second.style.getPropertyValue('--ql-brand-solid')).toBe('#1559D6');
    });

    it('draws the mark as decoration beside the name', () => {
        const { container } = render(<BrandMark size={28} />);
        const svg = container.querySelector('svg.ql-brand-mark')!;
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.querySelectorAll('ellipse')).toHaveLength(3);
    });
});
```

Update the existing export tests (each with a comment `// Spec §5: export metadata names the brand, keeping the repository id.`):
- `tests/export/cube_request.test.ts:34`: `'electron-orbital-viewer: Neon (Ne, Z = 10), whole atom, 90% contour'` → `'QuantumLab (electron-orbital-viewer): Neon (Ne, Z = 10), whole atom, 90% contour'`.
- `tests/export/run_export.test.ts:457`: `'electron-orbital-viewer: Gold (Au, Z = 79), 6p1/2 subshell, with spin-orbit, 90% contour'` → the same with the `QuantumLab (electron-orbital-viewer): ` prefix.
- `tests/export/molecule_exports.test.ts:361` and `:379`: the same prefix change.
- `tests/export/stl.test.ts`, first test: add `expect(header.startsWith('QuantumLab (electron-orbital-viewer), millimetres')).toBe(true);`.
- `tests/export/png.test.ts`: add

```ts
describe('drawOverlays: the brand footer (spec §5, ruling R13)', () => {
    it('ends the caption band with the brand, right-aligned', () => {
        const { calls, painter } = recorder();
        drawOverlays(painter, 800, 600, 2, { caption: ['Carbon (C, Z = 6), whole atom, 90% contour'], scaleBar: null, phaseLegend: false, footer: 'QuantumLab (electron-orbital-viewer)' });
        const footer = calls.find(c => c[0] === 'fillText' && c[1] === 'QuantumLab (electron-orbital-viewer)')!;
        expect(footer).toBeDefined();
        // measureText is 7 px a character in this recorder; pad is 14 × 2.
        expect(footer[2]).toBe(800 - 28 - 'QuantumLab (electron-orbital-viewer)'.length * 7);
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest tests/design/brands.test.ts tests/design/wordmark.test.tsx tests/export`
Expected: FAIL — missing modules; the export titles still start `electron-orbital-viewer:`; no footer drawn.

- [ ] **Step 3: Write `src/design/brands.ts` and `src/design/useBrand.ts`**

```ts
// src/design/brands.ts
import { createPref } from './local_pref';

/**
 * The switchable brand (spec §5). Production shows DEFAULT_BRAND_ID until the
 * owner picks a domain -- a one-line change. The owner previews others from
 * the avatar menu; that writes eov.brand in their browser only, and the brand
 * never enters a share link.
 */
export type BrandId = 'quantumlab' | 'atomvista' | 'novalab' | 'learnlab' | 'moleculeforge';

export interface Brand {
    id: BrandId;
    name: string;
    /** The two-tone split: parts[1] renders in the accent. */
    parts: [string, string];
    /** CSS colour or gradient for parts[1], per theme. */
    accent: { dark: string; light: string };
}

export const BRANDS: readonly Brand[] = [
    { id: 'quantumlab', name: 'QuantumLab', parts: ['Quantum', 'Lab'],
        accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: 'linear-gradient(90deg,#3A4BE8,#7B3FE4)' } },
    { id: 'atomvista', name: 'AtomVista', parts: ['Atom', 'Vista'], accent: { dark: '#5AA9FF', light: '#1559D6' } },
    { id: 'novalab', name: 'NovaLab', parts: ['Nova', 'Lab'], accent: { dark: '#5CC8DE', light: '#0E7490' } },
    { id: 'learnlab', name: 'LearnLab', parts: ['Learn', 'Lab'], accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: '#6D28D9' } },
    { id: 'moleculeforge', name: 'MoleculeForge', parts: ['Molecule', 'Forge'],
        accent: { dark: 'linear-gradient(90deg,#B05CF0,#D946EF)', light: '#A21CAF' } },
];
export const DEFAULT_BRAND_ID: BrandId = 'quantumlab';
export const BRAND_KEY = 'eov.brand';

export function brandById(id: string | null): Brand {
    return BRANDS.find(brand => brand.id === id) ?? BRANDS.find(brand => brand.id === DEFAULT_BRAND_ID)!;
}

export const brandPref = createPref<BrandId>(BRAND_KEY, {
    decode: raw => brandById(raw).id,
    encode: id => id,
});

export function currentBrand(): Brand {
    return brandById(brandPref.get());
}

/** Export metadata (spec §5): the brand, with the repository id kept for traceability. */
export function exportAppLabel(brand: Brand = currentBrand()): string {
    return `${brand.name} (electron-orbital-viewer)`;
}

/** Dev server only (spec §5): `?brand=<id>` previews a brand for quick screenshots. */
export function applyDevBrandParam(search: string, dev: boolean): void {
    if (!dev) return;
    const id = new URLSearchParams(search).get('brand');
    if (id && BRANDS.some(brand => brand.id === id)) brandPref.set(id as BrandId);
}

/** The #rrggbb stops of a gradient, or the one colour of a solid accent. */
export function accentStops(accent: string): string[] {
    return accent.match(/#[0-9a-fA-F]{6}/g) ?? [];
}
```

```ts
// src/design/useBrand.ts
import { brandById, brandPref, type Brand } from './brands';
import { usePref } from './usePref';

export function useBrand(): Brand {
    return brandById(usePref(brandPref));
}
```

- [ ] **Step 4: Write the wordmark and the mark**

```tsx
// src/design/Wordmark.tsx
import React from 'react';
import { accentStops, type Brand } from './brands';
import type { ThemeMode } from './tokens';

/**
 * The brand's two-tone wordmark (spec §5): the first part in text-1, the
 * second in the accent -- gradient text via background-clip, with the
 * gradient's first stop as the solid fallback colour.
 */
const Wordmark: React.FC<{ brand: Brand; mode: ThemeMode }> = ({ brand, mode }) => {
    const accent = brand.accent[mode];
    const gradient = accent.startsWith('linear-gradient');
    const style = { '--ql-brand-solid': accentStops(accent)[0], '--ql-brand-accent': accent } as React.CSSProperties;
    return (
        <span className="ql-wordmark">
            <span className="ql-wordmark-first">{brand.parts[0]}</span>
            <span className={`ql-wordmark-second${gradient ? ' gradient' : ''}`} style={style}>{brand.parts[1]}</span>
        </span>
    );
};

export default Wordmark;
```

```tsx
// src/design/BrandMark.tsx
import React, { useId } from 'react';

/** The redrawn atom mark (spec §4.8): three orbit rings and a glowing core, accent → selected-edge. */
const BrandMark: React.FC<{ size?: number }> = ({ size = 28 }) => {
    const id = `qlm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg className="ql-brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`${id}-orbit`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" style={{ stopColor: 'var(--ql-color-accent)' }} />
                    <stop offset="1" style={{ stopColor: 'var(--ql-color-selected-edge)' }} />
                </linearGradient>
                <radialGradient id={`${id}-core`}>
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="0.45" style={{ stopColor: 'var(--ql-color-selected-edge)' }} />
                    <stop offset="1" style={{ stopColor: 'var(--ql-color-accent)', stopOpacity: 0 }} />
                </radialGradient>
            </defs>
            {[0, 60, 120].map(angle => (
                <ellipse key={angle} cx="16" cy="16" rx="13" ry="5" fill="none" stroke={`url(#${id}-orbit)`} strokeWidth="1.6"
                    transform={`rotate(${angle} 16 16)`} />
            ))}
            <circle cx="16" cy="16" r="5" fill={`url(#${id}-core)`} />
        </svg>
    );
};

export default BrandMark;
```

Append to `src/design/design.css`:

```css
/* §5: the wordmark, 20 px semibold; the accent part as gradient text with a solid fallback. */
.ql-wordmark {
  font-size: var(--ql-type-wordmark-size); line-height: var(--ql-type-wordmark-line);
  font-weight: var(--ql-type-wordmark-weight); letter-spacing: -0.01em; white-space: nowrap;
}
.ql-wordmark-first { color: var(--ql-color-text-1); }
.ql-wordmark-second { color: var(--ql-brand-solid); }
.ql-wordmark-second.gradient {
  background-image: var(--ql-brand-accent);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.ql-brand-mark { flex: 0 0 auto; }
```

Replace `public/electron-icon.svg` (the favicon; static colours, since a favicon cannot read CSS variables) with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>QuantumLab</title><defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A85F8"/><stop offset="1" stop-color="#1FB6F5"/></linearGradient><radialGradient id="c"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="#1FB6F5"/><stop offset="1" stop-color="#2A85F8" stop-opacity="0"/></radialGradient></defs><rect width="32" height="32" rx="7" fill="#020F1D"/><g fill="none" stroke="url(#o)" stroke-width="1.6"><ellipse cx="16" cy="16" rx="13" ry="5"/><ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(120 16 16)"/></g><circle cx="16" cy="16" r="5" fill="url(#c)"/></svg>
```

- [ ] **Step 5: Name the brand where §5 says**

`src/main.tsx`: add `import { BUILD_ENV } from './jobs/build_env';` and `import { applyDevBrandParam } from './design/brands';`, and next to the theme migration: `applyDevBrandParam(window.location.search, BUILD_ENV.dev);`.

`src/admin/AdminApp.tsx`: add imports `Wordmark` from `'../design/Wordmark'`, `BrandMark` from `'../design/BrandMark'`, `useBrand` from `'../design/useBrand'`; in the component `const brand = useBrand();` and `const { theme, mode } = useQuantumTheme();` (replacing the `{ theme }` line), plus

```ts
useEffect(() => { document.title = `Owner dashboard · ${brand.name}`; }, [brand.name]);
```

and in the header, before the `<Typography variant="h5" component="h1">`: `<span className="admin-brand"><BrandMark size={24} /><Wordmark brand={brand} mode={mode} /></span>`. Add to `src/admin/admin.css`: `.admin-brand { display: inline-flex; align-items: center; gap: 8px; }`.

`src/export/stl.ts`: `import { exportAppLabel } from '../design/brands';` and the header line becomes
``const header = `${exportAppLabel()}, millimetres, 1 a0 = ${mmPerBohr.toPrecision(4)} mm`.slice(0, 80);``

`src/export/gltf.ts`: `import { exportAppLabel } from '../design/brands';` and `root.name = exportAppLabel();`.

`src/export/run_export.ts`: `import { exportAppLabel } from '../design/brands';`; the three titles become `` `${exportAppLabel()}: ${viewDescription(state)}` `` (lines 384 and 683) and `` `${exportAppLabel()}: ${moleculeTitle(meta)} ESP grid (Ha/e), ${meta.method.density}` `` (line 701); in the PNG case, the `overlays` object for `kind === 'png'` gains `footer: exportAppLabel()` in both branches (molecule and not).

`src/export/png.ts`: in `OverlaySpec` add

```ts
    /** Ruling R13: the brand label, the last line of the caption band, right-aligned. */
    footer?: string;
```

and in `drawOverlays` replace the caption-band block (from `const wrappedLines` through the `wrappedLines.forEach(...)` line) with:

```ts
    const wrappedLines = spec.caption.flatMap(text => wrapText(painter, text, maxTextWidth));
    const bandLines = wrappedLines.length + (spec.footer ? 1 : 0);
    painter.fillStyle = 'rgba(0, 0, 0, 0.55)';
    painter.fillRect(0, 0, width, bandLines * line + 2 * pad - (line - 13 * scale));
    painter.fillStyle = '#ffffff';
    wrappedLines.forEach((text, i) => painter.fillText(text, pad, pad + i * line));
    if (spec.footer) {
        painter.font = `${11 * scale}px ${PNG_FONT}`;
        painter.fillText(spec.footer, width - pad - painter.measureText(spec.footer).width, pad + wrappedLines.length * line);
        painter.font = `${13 * scale}px ${PNG_FONT}`;
    }
```

and replace the remaining `${13 * scale}px Roboto, sans-serif` font string in `png.ts` (line 170, the start of `drawOverlays`) with `` `${13 * scale}px ${PNG_FONT}` ``, declaring near the top: `const PNG_FONT = '"Inter Variable", system-ui, sans-serif';` (Roboto is no longer loaded). Also in `src/orbital_visualizer.ts` `createAxisLabel`, `'italic 600 44px Roboto, sans-serif'` → `'italic 600 44px "Inter Variable", system-ui, sans-serif'`.

- [ ] **Step 6: Run the tests**

Run: `npx jest tests/design tests/export` → PASS. Then `npx jest`, `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `npm run check:admin-split` (the dashboard now imports `src/design/brands.ts`, `Wordmark`, `BrandMark` — allowed by §9.7; the split check must still say "admin split ok").

- [ ] **Step 7: Commit**

```bash
git add src/design/brands.ts src/design/useBrand.ts src/design/Wordmark.tsx src/design/BrandMark.tsx src/design/design.css public/electron-icon.svg src/main.tsx src/admin/AdminApp.tsx src/admin/admin.css src/export/stl.ts src/export/gltf.ts src/export/run_export.ts src/export/png.ts src/orbital_visualizer.ts tests/design/brands.test.ts tests/design/wordmark.test.tsx tests/export/cube_request.test.ts tests/export/run_export.test.ts tests/export/molecule_exports.test.ts tests/export/stl.test.ts tests/export/png.test.ts
git commit -m "feat(design): switchable brand with QuantumLab default; wordmark, mark, admin title and export metadata name it (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/brands.ts src/design/useBrand.ts src/design/Wordmark.tsx src/design/BrandMark.tsx src/design/design.css public/electron-icon.svg src/main.tsx src/admin/AdminApp.tsx src/admin/admin.css src/export/stl.ts src/export/gltf.ts src/export/run_export.ts src/export/png.ts src/orbital_visualizer.ts tests/design/brands.test.ts tests/design/wordmark.test.tsx tests/export/cube_request.test.ts tests/export/run_export.test.ts tests/export/molecule_exports.test.ts tests/export/stl.test.ts tests/export/png.test.ts
```

---

### Task 5: Search index

**Estimate:** 40 min. **Spec:** §8.3 (the index; the popover is Task 7). Rulings R4 (computed molecules: the owner's own list until 6G-3) and R11 (all 11 Bonds systems).

**Files:**
- Create: `src/search/search_index.ts`
- Test: `tests/search/search_index.test.ts`

**Interfaces:**
- Consumes: `ELEMENTS` (`src/elements.ts`), `BONDS_SYSTEMS`, `BondsSystemId` (`src/bonds/systems.ts`), `filterMolecules`, `formatFormula` (`src/molecules/catalogue.ts`), `LIBRARY_CATEGORIES` (`src/molecules/library_types.ts`), `COMPUTED_CATEGORY` (`src/jobs/computed.ts`), `orbitalName` (`src/orbital_names.ts`), `MoleculeIndexEntry`.
- Produces:
  - `type SearchAction = { kind: 'element'; Z: number } | { kind: 'molecule'; id: string } | { kind: 'bonds'; system: BondsSystemId } | { kind: 'basic'; n: number; l: number; ml: number }`
  - `type SearchGroup = 'Elements' | 'Molecules' | 'Bonds' | 'Basic orbitals'`; `SEARCH_GROUP_ORDER`; `SEARCH_GROUP_LIMIT = 6`
  - `interface SearchResult { key: string; group: SearchGroup; label: string; detail: string; action: SearchAction }`
  - `interface SearchSources { molecules: MoleculeIndexEntry[] | null }`
  - `normaliseQuery(text: string): string`; `searchAll(query: string, sources: SearchSources): SearchResult[]` (grouped in `SEARCH_GROUP_ORDER`, at most 6 per group, `[]` for a blank query).

- [ ] **Step 1: Write the failing test**

`tests/search/search_index.test.ts`:

```ts
import { normaliseQuery, searchAll, SEARCH_GROUP_LIMIT } from '../../src/search/search_index';
import { LIBRARY_INDEX } from '../molecules/fixtures';

const sources = { molecules: LIBRARY_INDEX };
const first = (query: string, group: string) => searchAll(query, sources).find(result => result.group === group);

describe('search index (spec §8.3)', () => {
    it.each(['fe', 'Iron', '26'])('finds iron from "%s"', query => {
        const result = searchAll(query, sources)[0];
        expect(result.group).toBe('Elements');
        expect(result.action).toEqual({ kind: 'element', Z: 26 });
        expect(result.label).toBe('Iron (Fe)');
    });

    it.each(['h2o', 'H₂O', 'water'])('finds water from "%s"', query => {
        expect(first(query, 'Molecules')?.action).toEqual({ kind: 'molecule', id: 'h2o' });
    });

    it('finds Basic orbitals by their names, written loosely', () => {
        expect(first('3dz2', 'Basic orbitals')?.action).toEqual({ kind: 'basic', n: 3, l: 2, ml: 0 });
        expect(first('3dz2', 'Basic orbitals')?.label).toBe('3d_z²');
        expect(first('4f xyz', 'Basic orbitals')?.action).toEqual({ kind: 'basic', n: 4, l: 3, ml: -2 });
    });

    it('finds the Bonds systems, H₂⁺ included', () => {
        expect(first('n2', 'Bonds')?.action).toEqual({ kind: 'bonds', system: 'n2' });
        expect(first('nitrogen', 'Bonds')?.action).toEqual({ kind: 'bonds', system: 'n2' });
        expect(first('h2+', 'Bonds')?.action).toEqual({ kind: 'bonds', system: 'h2plus' });
    });

    it('ranks an exact symbol first and ignores blank input (Review Focus 5)', () => {
        const elements = searchAll('c', sources).filter(r => r.group === 'Elements');
        expect(elements[0].label).toBe('Carbon (C)');
        expect(elements.length).toBe(SEARCH_GROUP_LIMIT);
        expect(searchAll('1', sources).filter(r => r.group === 'Elements').map(r => r.label)).toEqual(['Hydrogen (H)']);
        expect(searchAll('   ', sources)).toEqual([]);
        expect(searchAll('zz', sources)).toEqual([]);
    });

    it('keeps groups in order and each to six', () => {
        const groups = searchAll('c', sources).map(r => r.group);
        expect(groups).toEqual([...groups].sort((a, b) =>
            ['Elements', 'Molecules', 'Bonds', 'Basic orbitals'].indexOf(a) - ['Elements', 'Molecules', 'Bonds', 'Basic orbitals'].indexOf(b)));
        for (const group of new Set(groups)) expect(groups.filter(g => g === group).length).toBeLessThanOrEqual(SEARCH_GROUP_LIMIT);
    });

    it('works before the molecule index has loaded', () => {
        expect(() => searchAll('water', { molecules: null })).not.toThrow();
        expect(searchAll('water', { molecules: null }).some(r => r.group === 'Molecules')).toBe(false);
    });

    it('normalises sub- and superscripts, minus signs, spaces and underscores', () => {
        expect(normaliseQuery(' 3d_z² ')).toBe('3dz2');
        expect(normaliseQuery('H₂O')).toBe('h2o');
        expect(normaliseQuery('3d_x²−y²')).toBe('3dx2-y2');
        expect(normaliseQuery('H₂⁺')).toBe('h2+');
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest tests/search`
Expected: FAIL — `Cannot find module '../../src/search/search_index'`.

- [ ] **Step 3: Write `src/search/search_index.ts`**

```ts
import { ELEMENTS } from '../elements';
import { BONDS_SYSTEMS, type BondsSystemId } from '../bonds/systems';
import { filterMolecules, formatFormula } from '../molecules/catalogue';
import { LIBRARY_CATEGORIES } from '../molecules/library_types';
import { COMPUTED_CATEGORY } from '../jobs/computed';
import { orbitalName } from '../orbital_names';
import type { MoleculeIndexEntry } from '../molecules/types';

/**
 * The top bar's search (spec §8.3): one client-side index over data the app
 * already has -- all 118 elements, the library molecules (and, for the
 * owner, their computed ones: ruling R4), the Bonds systems and the Basic
 * orbitals. No server call. Opening a result does what the existing
 * pickers do; App owns that (Task 8's handleSearchPick).
 */
export type SearchAction =
    | { kind: 'element'; Z: number }
    | { kind: 'molecule'; id: string }
    | { kind: 'bonds'; system: BondsSystemId }
    | { kind: 'basic'; n: number; l: number; ml: number };

export type SearchGroup = 'Elements' | 'Molecules' | 'Bonds' | 'Basic orbitals';
export const SEARCH_GROUP_ORDER: readonly SearchGroup[] = ['Elements', 'Molecules', 'Bonds', 'Basic orbitals'];
export const SEARCH_GROUP_LIMIT = 6;

export interface SearchResult {
    key: string;
    group: SearchGroup;
    label: string;
    detail: string;
    action: SearchAction;
}

export interface SearchSources {
    /** The molecule picker's entries (withComputed for the owner), or null before the index loads. */
    molecules: MoleculeIndexEntry[] | null;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/** Lower case; sub- and superscript digits as digits; ⁺ as '+'; ⁻ and minus signs as '-'; no spaces or underscores. */
export function normaliseQuery(text: string): string {
    return text.trim().toLowerCase()
        .replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080))
        .replace(/[⁰¹²³⁴-⁹]/g, c => SUPERSCRIPT_DIGITS[c] ?? c)
        .replace(/⁺/g, '+')
        .replace(/[⁻−–]/g, '-')
        .replace(/[\s_]+/g, '');
}

function elementResults(q: string): SearchResult[] {
    const scored: Array<{ Z: number; name: string; symbol: string; score: number }> = [];
    for (const element of ELEMENTS) {
        const name = element.name.toLowerCase();
        const symbol = element.symbol.toLowerCase();
        const score = symbol === q || name === q || String(element.atomicNumber) === q ? 0
            : name.startsWith(q) ? 1
            : q.length <= 2 && symbol.startsWith(q) ? 2
            : q.length >= 3 && name.includes(q) ? 3
            : null;
        if (score !== null) scored.push({ Z: element.atomicNumber, name: element.name, symbol: element.symbol, score });
    }
    scored.sort((a, b) => a.score - b.score || a.Z - b.Z);
    return scored.map(({ Z, name, symbol }) => ({
        key: `element-${Z}`, group: 'Elements', label: `${name} (${symbol})`, detail: `Z = ${Z} · Atoms`, action: { kind: 'element', Z },
    }));
}

const CATEGORY_LABEL = new Map<string, string>([
    ...LIBRARY_CATEGORIES.map(c => [c.key, c.label] as [string, string]),
    [COMPUTED_CATEGORY.key, COMPUTED_CATEGORY.label],
]);

function moleculeResults(query: string, entries: MoleculeIndexEntry[] | null): SearchResult[] {
    if (!entries) return [];
    return filterMolecules(entries, query, null).map(entry => ({
        key: `molecule-${entry.id}`, group: 'Molecules', label: `${entry.name} (${formatFormula(entry.formula)})`,
        detail: `${CATEGORY_LABEL.get(entry.category) ?? entry.category} · Molecules`, action: { kind: 'molecule', id: entry.id },
    }));
}

function bondsResults(q: string): SearchResult[] {
    return BONDS_SYSTEMS
        .filter(system => normaliseQuery(system.formula).startsWith(q) || (q.length >= 2 && system.name.toLowerCase().includes(q)))
        .map(system => ({
            key: `bonds-${system.id}`, group: 'Bonds', label: `${system.formula} — ${system.name}`, detail: 'Bonds',
            action: { kind: 'bonds', system: system.id },
        }));
}

/** Every Basic orbital, n = 1…9, as its name and that name normalised. */
const BASIC_ORBITALS = (() => {
    const list: Array<{ n: number; l: number; ml: number; name: string; key: string }> = [];
    for (let n = 1; n <= 9; n++) {
        for (let l = 0; l < n; l++) {
            for (let ml = -l; ml <= l; ml++) {
                const name = orbitalName(n, l, ml);
                list.push({ n, l, ml, name, key: normaliseQuery(name) });
            }
        }
    }
    return list;
})();

function basicResults(q: string): SearchResult[] {
    if (q.length < 2 || !/^[1-9]/.test(q)) return [];
    return BASIC_ORBITALS.filter(orbital => orbital.key.startsWith(q)).map(({ n, l, ml, name }) => ({
        key: `basic-${n}-${l}-${ml}`, group: 'Basic orbitals', label: name, detail: 'Hydrogen-like, Z = 1 · Basic Orbitals',
        action: { kind: 'basic', n, l, ml },
    }));
}

export function searchAll(query: string, sources: SearchSources): SearchResult[] {
    const q = normaliseQuery(query);
    if (!q) return [];
    const groups: Record<SearchGroup, SearchResult[]> = {
        Elements: elementResults(q),
        Molecules: moleculeResults(query, sources.molecules),
        Bonds: bondsResults(q),
        'Basic orbitals': basicResults(q),
    };
    return SEARCH_GROUP_ORDER.flatMap(group => groups[group].slice(0, SEARCH_GROUP_LIMIT));
}
```

- [ ] **Step 4: Run it**

Run: `npx jest tests/search` → PASS. (`filterMolecules` already turns "H₂O" into "h2o", and matches names case-insensitively.) Then `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add src/search/search_index.ts tests/search/search_index.test.ts
git commit -m "feat(search): one client-side index over elements, molecules, Bonds systems and Basic orbitals (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/search/search_index.ts tests/search/search_index.test.ts
```

---

### Task 6: Top bar, rail, help dialog and avatar menu (components)

**Estimate:** 90 min. **Spec:** §8.1, §8.2, §4.8 (icons), §5 (brand preview), §13 (roving focus). Built and tested in isolation; Task 8 wires them into the app. Rulings R3 (no Learning/Gallery yet), R14 (no avatar when it would do nothing), R15 (jobs target in the avatar menu).

**Files:**
- Create: `src/shell/icons.tsx`, `src/shell/useRovingFocus.ts`, `src/shell/Rail.tsx`, `src/shell/rail.css`, `src/shell/TopBar.tsx`, `src/shell/top_bar.css`, `src/shell/HelpDialog.tsx`, `src/shell/AvatarMenu.tsx`
- Test: `tests/shell/rail.test.tsx`, `tests/shell/top_bar.test.tsx`, `tests/shell/help_dialog.test.tsx`, `tests/shell/avatar_menu.test.tsx`, `tests/shell/roving_focus.test.tsx`

**Interfaces:**
- Consumes: `ViewMode` (`src/store/atomSlice.ts`), `Brand`, `BRANDS`, `BrandId` (Task 4), `Wordmark`, `BrandMark` (Task 4), `ThemeSwitch` (Task 2), `ThemeMode` (Task 1), `OwnerSession` (`src/store/jobsSlice.ts`), `EXPORT_ITEMS` (`src/export/run_export.ts`), `MOLECULE_DATA_VERSION` (`src/molecules/data_version.ts`), `package.json` `version`.
- Produces:
  - `useRovingFocus(ref: React.RefObject<HTMLElement | null>, options: { selector: string; orientation: 'horizontal' | 'vertical' | 'both' }): void` — one tab stop per group; arrows, Home and End move focus; the pressed/selected/current item is the stop.
  - `Rail` (default export), props `{ mode: ViewMode; onModeChange(mode: ViewMode): void; isOwner: boolean; variant?: 'rail' | 'menu'; wide?: boolean }`; renders `<nav class="app-rail" aria-label="view mode">` with buttons named `atom mode`, `basic orbitals mode`, `bonds mode`, `molecule mode` (`aria-pressed`), visible labels Atoms / Basic Orbitals / Bonds / Molecules; Admin link (`/admin.html`) when `isOwner` in the rail variant. `MODE_LABEL: Record<ViewMode, string>`.
  - `TopBar` (default export), props `{ brand: Brand; mode: ThemeMode; tabs: TopBarTab[]; search: React.ReactNode; avatar: React.ReactNode; onHelp(): void; sessionNote?: string | null }`; `interface TopBarTab { key: string; label: string; href: string; current: boolean; onSelect(): void }`; renders `<header class="app-topbar">`.
  - `HelpDialog` (default export), props `{ open: boolean; onClose(): void; brand: Brand; aboutModel?: React.ReactNode }`.
  - `AvatarMenu` (default export), props `{ session: OwnerSession; isOwner: boolean; dev: boolean; ownerBar: React.ReactNode; onSignIn(): void; brandId: BrandId; onBrand(id: BrandId): void; extra?: React.ReactNode }`; `initialsOf(email: string | null): string`.
  - Icons: `AtomsIcon`, `BasicOrbitalsIcon`, `BondsIcon`, `MoleculesIcon` (20 px SVG components, `aria-hidden`).

- [ ] **Step 1: Write the failing tests**

`tests/shell/roving_focus.test.tsx`:

```tsx
import React, { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRovingFocus } from '../../src/shell/useRovingFocus';

function Group() {
    const ref = useRef<HTMLDivElement>(null);
    useRovingFocus(ref, { selector: 'button', orientation: 'vertical' });
    return (
        <div ref={ref}>
            <button aria-pressed="false">one</button>
            <button aria-pressed="true">two</button>
            <button aria-pressed="false">three</button>
        </div>
    );
}

describe('useRovingFocus (spec §13: arrow keys inside, Tab exits)', () => {
    it('makes the pressed item the one tab stop and moves with the arrows, Home and End', () => {
        render(<Group />);
        const [one, two, three] = screen.getAllByRole('button');
        expect([one.tabIndex, two.tabIndex, three.tabIndex]).toEqual([-1, 0, -1]);
        two.focus();
        fireEvent.keyDown(two, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(three);
        fireEvent.keyDown(three, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(one);
        fireEvent.keyDown(one, { key: 'End' });
        expect(document.activeElement).toBe(three);
        fireEvent.keyDown(three, { key: 'Home' });
        expect(document.activeElement).toBe(one);
        expect(one.tabIndex).toBe(0);
    });
});
```

`tests/shell/rail.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Rail from '../../src/shell/Rail';

describe('Rail (spec §8.2)', () => {
    it('is the view-mode navigation, with the names the tests and the old toggle used', () => {
        render(<Rail mode="atom" onModeChange={jest.fn()} isOwner={false} />);
        const nav = screen.getByRole('navigation', { name: 'view mode' });
        const names = within(nav).getAllByRole('button').map(b => b.getAttribute('aria-label'));
        expect(names).toEqual(['atom mode', 'basic orbitals mode', 'bonds mode', 'molecule mode']);
        expect(within(nav).getByRole('button', { name: 'atom mode' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(nav).getByRole('button', { name: 'bonds mode' })).toHaveAttribute('aria-pressed', 'false');
        expect(nav).toHaveTextContent('AtomsBasic OrbitalsBondsMolecules');
    });

    it('dispatches the mode the way the toggle did', () => {
        const onModeChange = jest.fn();
        render(<Rail mode="atom" onModeChange={onModeChange} isOwner={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
        expect(onModeChange).toHaveBeenCalledWith('molecule');
    });

    it('links the dashboard for the owner only, and never shows Learning or Gallery (ruling R3)', () => {
        const { rerender } = render(<Rail mode="atom" onModeChange={jest.fn()} isOwner={false} />);
        expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
        rerender(<Rail mode="atom" onModeChange={jest.fn()} isOwner />);
        expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin.html');
        expect(screen.queryByText(/learning|gallery/i)).toBeNull();
    });
});
```

`tests/shell/top_bar.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopBar, { TopBarTab } from '../../src/shell/TopBar';
import { BRANDS } from '../../src/design/brands';

const tab = (key: string, label: string, current: boolean, onSelect = jest.fn()): TopBarTab => ({ key, label, href: `/#mode=${key}`, current, onSelect });

describe('TopBar (spec §8.1)', () => {
    it('is the banner: brand home link, area tabs, search slot, theme, help and avatar', () => {
        const onHelp = jest.fn();
        const explore = tab('atom', 'Explore', true);
        const molecules = tab('molecule', 'Molecules', false);
        render(<TopBar brand={BRANDS[0]} mode="dark" tabs={[explore, molecules]} search={<input aria-label="search slot" />}
            avatar={<button>avatar slot</button>} onHelp={onHelp} />);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'QuantumLab, home' })).toHaveAttribute('href', '/');
        expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'Molecules' })).not.toHaveAttribute('aria-current');
        fireEvent.click(screen.getByRole('link', { name: 'Molecules' }));
        expect(molecules.onSelect).toHaveBeenCalled();
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Theme: / })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Help' }));
        expect(onHelp).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'avatar slot' })).toBeInTheDocument();
    });

    it('says a session ended beside the avatar, in today\'s words', () => {
        render(<TopBar brand={BRANDS[0]} mode="light" tabs={[]} search={null} avatar={null} onHelp={jest.fn()}
            sessionNote="Your owner session has ended. Sign in again to continue." />);
        expect(screen.getByRole('status')).toHaveTextContent('Your owner session has ended. Sign in again to continue.');
    });
});
```

`tests/shell/help_dialog.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import HelpDialog from '../../src/shell/HelpDialog';
import { BRANDS } from '../../src/design/brands';
import { EXPORT_ITEMS } from '../../src/export/run_export';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';

describe('HelpDialog (spec §8.1 item 5)', () => {
    it('explains gestures, keys, every export and the app, with no external links', () => {
        render(<HelpDialog open onClose={jest.fn()} brand={BRANDS[0]} aboutModel={<p>central-field model text</p>} />);
        const dialog = screen.getByRole('dialog', { name: 'Help' });
        expect(dialog).toHaveTextContent(/drag to rotate/i);
        expect(dialog).toHaveTextContent(/pinch|scroll/i);
        expect(dialog).toHaveTextContent('Ctrl+K');
        for (const item of EXPORT_ITEMS) expect(dialog).toHaveTextContent(item.label);
        expect(dialog).toHaveTextContent('QuantumLab');
        expect(dialog).toHaveTextContent(`molecule data ${MOLECULE_DATA_VERSION}`);
        expect(dialog).toHaveTextContent('Methods are stated beside every number.');
        expect(dialog).toHaveTextContent('central-field model text');
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
});
```

`tests/shell/avatar_menu.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AvatarMenu, { initialsOf } from '../../src/shell/AvatarMenu';
import type { OwnerSession } from '../../src/store/jobsSlice';

const session = (over: Partial<OwnerSession> = {}): OwnerSession =>
    ({ configured: true, signedIn: false, email: null, expired: false, error: null, ...over });
const base = { ownerBar: <div>owner bar</div>, onSignIn: jest.fn(), brandId: 'quantumlab' as const, onBrand: jest.fn() };

describe('AvatarMenu (spec §8.1 item 6, §5)', () => {
    it('is absent for a visitor of a build without sign-in (ruling R14)', () => {
        const { container } = render(<AvatarMenu {...base} session={session({ configured: false })} isOwner={false} dev={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('signs a visitor in from one "Owner sign-in" button', () => {
        const onSignIn = jest.fn();
        render(<AvatarMenu {...base} onSignIn={onSignIn} session={session()} isOwner={false} dev={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(onSignIn).toHaveBeenCalled();
    });

    it('shows the owner\'s initials and a menu with the owner bar and the brand preview', () => {
        const onBrand = jest.fn();
        render(<AvatarMenu {...base} onBrand={onBrand} session={session({ signedIn: true, email: 'EyalShacham@pcssoft.com' })} isOwner dev={false} />);
        const button = screen.getByRole('button', { name: 'Owner menu, signed in as EyalShacham@pcssoft.com' });
        expect(button).toHaveTextContent('ES');
        fireEvent.click(button);
        expect(screen.getByText('owner bar')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'NovaLab' }));
        expect(onBrand).toHaveBeenCalledWith('novalab');
    });

    it('hides the brand preview from anyone but the owner, and opens a menu on the dev server', () => {
        render(<AvatarMenu {...base} session={session({ configured: false })} isOwner={false} dev />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(screen.getByText('owner bar')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Brand preview' })).toBeNull();
    });

    it('holds the phone\'s Theme and Help even in a build without sign-in, named "Menu"', () => {
        render(<AvatarMenu {...base} session={session({ configured: false })} isOwner={false} dev={false} extra={<button>theme and help</button>} />);
        fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
        expect(screen.getByRole('button', { name: 'theme and help' })).toBeInTheDocument();
        expect(screen.queryByText('owner bar')).toBeNull();
    });

    it('makes initials from the address', () => {
        expect(initialsOf('eyal.shacham@x.com')).toBe('ES');
        expect(initialsOf('EyalShacham@x.com')).toBe('ES');
        expect(initialsOf('owner@x.com')).toBe('OW');
        expect(initialsOf(null)).toBe('O');
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest tests/shell`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/shell/useRovingFocus.ts`**

```ts
import { useEffect } from 'react';

const NEXT = { horizontal: ['ArrowRight'], vertical: ['ArrowDown'], both: ['ArrowRight', 'ArrowDown'] };
const PREVIOUS = { horizontal: ['ArrowLeft'], vertical: ['ArrowUp'], both: ['ArrowLeft', 'ArrowUp'] };
const CURRENT = '[aria-pressed="true"], [aria-selected="true"], [aria-current="page"], [aria-current="true"]';

/**
 * Roving tabindex (spec §13): a group is one Tab stop -- its pressed,
 * selected or current item, else its first -- and the arrow keys, Home and
 * End move inside it. Re-syncs when items change state or come and go.
 */
export function useRovingFocus(
    ref: React.RefObject<HTMLElement | null>,
    options: { selector: string; orientation: 'horizontal' | 'vertical' | 'both' },
): void {
    const { selector, orientation } = options;
    useEffect(() => {
        const container = ref.current;
        if (!container) return undefined;
        const items = () => [...container.querySelectorAll<HTMLElement>(selector)]
            .filter(item => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true');
        const sync = () => {
            const list = items();
            const current = list.find(item => item.matches(CURRENT)) ?? list[0];
            list.forEach(item => { item.tabIndex = item === current ? 0 : -1; });
        };
        const onKey = (event: KeyboardEvent) => {
            const list = items();
            const index = list.indexOf(document.activeElement as HTMLElement);
            if (index < 0) return;
            let next: number;
            if (NEXT[orientation].includes(event.key)) next = (index + 1) % list.length;
            else if (PREVIOUS[orientation].includes(event.key)) next = (index - 1 + list.length) % list.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = list.length - 1;
            else return;
            event.preventDefault();
            list.forEach(item => { item.tabIndex = -1; });
            list[next].tabIndex = 0;
            list[next].focus();
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-current', 'disabled'] });
        container.addEventListener('keydown', onKey);
        return () => {
            observer.disconnect();
            container.removeEventListener('keydown', onKey);
        };
    }, [ref, selector, orientation]);
}
```

- [ ] **Step 4: Write the icons, the rail and its stylesheet**

`src/shell/icons.tsx`:

```tsx
import React from 'react';

/** The four custom 20 px mode icons (spec §4.8), drawn on the Material grid; decoration beside a text label. */
const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" aria-hidden="true" focusable="false">{children}</svg>
);

/** A nucleus with three orbits. */
export const AtomsIcon: React.FC = () => (
    <Svg>
        <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </Svg>
);

/** A p dumbbell. */
export const BasicOrbitalsIcon: React.FC = () => (
    <Svg>
        <path d="M12 12C9 8.5 8.6 3 12 3s3 5.5 0 9Z" />
        <path d="M12 12c-3 3.5-3.4 9 0 9s3-5.5 0-9Z" />
    </Svg>
);

/** Two spheres joined by a stick. */
export const BondsIcon: React.FC = () => (
    <Svg>
        <circle cx="6.5" cy="12" r="3.5" />
        <circle cx="17.5" cy="12" r="3.5" />
        <path d="M10 12h4" />
    </Svg>
);

/** Three spheres. */
export const MoleculesIcon: React.FC = () => (
    <Svg>
        <circle cx="12" cy="8" r="3.2" />
        <circle cx="6" cy="17" r="2.6" />
        <circle cx="18" cy="17" r="2.6" />
        <path d="M10.4 10.6 7.6 14.9M13.6 10.6l2.8 4.3" />
    </Svg>
);
```

`src/shell/Rail.tsx`:

```tsx
import React, { useRef } from 'react';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import type { ViewMode } from '../store/atomSlice';
import { AtomsIcon, BasicOrbitalsIcon, BondsIcon, MoleculesIcon } from './icons';
import { useRovingFocus } from './useRovingFocus';
import './rail.css';

export const MODE_LABEL: Record<ViewMode, string> = { atom: 'Atoms', hydrogenic: 'Basic Orbitals', bonds: 'Bonds', molecule: 'Molecules' };

// The accessible names are the old Mode toggle's (spec §8.2): tests and
// assistive-technology users already know them.
const ITEMS: Array<{ mode: ViewMode; name: string; Icon: React.FC }> = [
    { mode: 'atom', name: 'atom mode', Icon: AtomsIcon },
    { mode: 'hydrogenic', name: 'basic orbitals mode', Icon: BasicOrbitalsIcon },
    { mode: 'bonds', name: 'bonds mode', Icon: BondsIcon },
    { mode: 'molecule', name: 'molecule mode', Icon: MoleculesIcon },
];

interface RailProps {
    mode: ViewMode;
    /** App's handleModeChange: the four modes and their side effects, unchanged. */
    onModeChange(mode: ViewMode): void;
    isOwner: boolean;
    /** 'menu' is the phone's mode menu: the same list, no Admin link. */
    variant?: 'rail' | 'menu';
    /** ≥ 1680 px: icon and label in a row (spec §7). */
    wide?: boolean;
}

/**
 * The mode rail (spec §8.2). Learning and Gallery join it when they exist
 * (ruling R3); until then "real or absent" keeps them out.
 */
const Rail: React.FC<RailProps> = ({ mode, onModeChange, isOwner, variant = 'rail', wide = false }) => {
    const itemsRef = useRef<HTMLDivElement>(null);
    useRovingFocus(itemsRef, { selector: '.app-rail-item', orientation: 'vertical' });
    return (
        <nav className={`app-rail${variant === 'menu' ? ' as-menu' : ''}${wide ? ' wide' : ''}`} aria-label="view mode">
            <div className="app-rail-items" ref={itemsRef}>
                {ITEMS.map(({ mode: itemMode, name, Icon }) => (
                    <button
                        key={itemMode}
                        type="button"
                        className="app-rail-item"
                        aria-label={name}
                        aria-pressed={mode === itemMode}
                        onClick={() => onModeChange(itemMode)}
                    >
                        <Icon />
                        <span className="app-rail-label">{MODE_LABEL[itemMode]}</span>
                    </button>
                ))}
            </div>
            {isOwner && variant === 'rail' && (
                <a className="app-rail-item app-rail-admin" href="/admin.html">
                    <AdminPanelSettingsOutlined sx={{ fontSize: 20 }} aria-hidden />
                    <span className="app-rail-label">Admin</span>
                </a>
            )}
        </nav>
    );
};

export default Rail;
```

`src/shell/rail.css`:

```css
/* src/shell/rail.css -- the mode rail (spec §8.2): 76 px, bg-bar, right border-subtle. */
.app-rail {
  grid-area: rail;
  display: flex; flex-direction: column; gap: 4px;
  min-height: 0; box-sizing: border-box; padding: 12px 8px;
  background: var(--ql-color-bg-bar);
  border-right: 1px solid var(--ql-color-border-subtle);
}
.app-rail-items { display: flex; flex-direction: column; gap: 4px; }
.app-rail-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border: 1px solid transparent; border-radius: var(--ql-radius-md);
  background: none; color: var(--ql-color-text-3); cursor: pointer; text-align: center; text-decoration: none;
  font: var(--ql-type-rail-weight) var(--ql-type-rail-size) / var(--ql-type-rail-line) var(--ql-font-sans);
  transition: background-color var(--ql-motion-hover) ease-out;
}
.app-rail-item:hover { background-color: var(--ql-color-surface-3); }
.app-rail-item[aria-pressed="true"] {
  background: var(--ql-color-rail-active);
  border-color: var(--ql-color-selected-edge);
  color: var(--ql-color-text-1);
  box-shadow: var(--ql-shadow-selected);
}
.app-rail-admin { margin-top: auto; }
.app-rail.wide .app-rail-item {
  flex-direction: row; justify-content: flex-start; gap: 10px; padding: 10px 12px;
  font-size: var(--ql-type-nav-size); line-height: var(--ql-type-nav-line);
}
.app-rail.as-menu { border-right: 0; padding: 8px; min-width: 220px; }
.app-rail.as-menu .app-rail-item {
  flex-direction: row; justify-content: flex-start; gap: 12px; min-height: var(--ql-size-touch);
  font-size: var(--ql-type-nav-size); line-height: var(--ql-type-nav-line);
}
```

- [ ] **Step 5: Write the top bar and its stylesheet**

`src/shell/TopBar.tsx`:

```tsx
import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import HelpOutline from '@mui/icons-material/HelpOutline';
import BrandMark from '../design/BrandMark';
import ThemeSwitch from '../design/ThemeSwitch';
import Wordmark from '../design/Wordmark';
import type { Brand } from '../design/brands';
import type { ThemeMode } from '../design/tokens';
import './top_bar.css';

export interface TopBarTab {
    key: string;
    label: string;
    /** Where the tab goes when opened in a new tab (middle-click); a plain click calls onSelect. */
    href: string;
    current: boolean;
    onSelect(): void;
}

interface TopBarProps {
    brand: Brand;
    mode: ThemeMode;
    tabs: TopBarTab[];
    search: React.ReactNode;
    avatar: React.ReactNode;
    onHelp(): void;
    /** Today's session-ended line (ruling R15), beside the avatar. */
    sessionNote?: string | null;
}

/** The 56 px top bar (spec §8.1): brand, area tabs, search, theme, help, avatar. */
const TopBar: React.FC<TopBarProps> = ({ brand, mode, tabs, search, avatar, onHelp, sessionNote }) => (
    <header className="app-topbar">
        <a className="app-topbar-brand" href="/" aria-label={`${brand.name}, home`}>
            <BrandMark size={28} />
            <Wordmark brand={brand} mode={mode} />
        </a>
        {tabs.length > 0 && (
            <nav className="app-topbar-tabs" aria-label="areas">
                {tabs.map(tab => (
                    <a
                        key={tab.key}
                        className="app-topbar-tab"
                        href={tab.href}
                        aria-current={tab.current ? 'page' : undefined}
                        onClick={event => { event.preventDefault(); tab.onSelect(); }}
                    >
                        {tab.label}
                    </a>
                ))}
            </nav>
        )}
        <div className="app-topbar-search">{search}</div>
        <div className="app-topbar-actions">
            <ThemeSwitch />
            <Tooltip title="Help">
                <IconButton className="ql-icon-button" aria-label="Help" onClick={onHelp}>
                    <HelpOutline fontSize="small" />
                </IconButton>
            </Tooltip>
            {sessionNote && <span role="status" className="ql-caption app-topbar-note">{sessionNote}</span>}
            {avatar}
        </div>
    </header>
);

export default TopBar;
```

`src/shell/top_bar.css`:

```css
/* src/shell/top_bar.css -- the top bar (spec §8.1): 56 px, bg-bar, bottom border-subtle. */
.app-topbar {
  grid-area: topbar;
  display: flex; align-items: center; gap: 24px;
  height: var(--ql-size-top-bar); padding: 0 16px; box-sizing: border-box;
  background: var(--ql-color-bg-bar);
  border-bottom: 1px solid var(--ql-color-border-subtle);
}
.app-topbar-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
.app-topbar-tabs { display: flex; align-items: stretch; gap: 20px; height: 100%; }
.app-topbar-tab {
  position: relative; display: inline-flex; align-items: center;
  color: var(--ql-color-text-2); text-decoration: none;
  font: var(--ql-type-nav-weight) var(--ql-type-nav-size) / var(--ql-type-nav-line) var(--ql-font-sans);
  transition: color var(--ql-motion-hover) ease-out;
}
.app-topbar-tab:hover { color: var(--ql-color-text-1); }
.app-topbar-tab[aria-current="page"] { color: var(--ql-color-text-1); font-weight: 600; }
/* A 2 px selected-edge underline 8 px below the baseline (concept A). */
.app-topbar-tab[aria-current="page"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 12px;
  height: 2px; border-radius: 1px; background: var(--ql-color-selected-edge);
}
.app-topbar-search { margin-left: auto; width: clamp(320px, 28vw, 400px); }
.app-topbar-actions { display: flex; align-items: center; gap: 4px; }
.app-topbar-note { max-width: 220px; }
.ql-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: var(--ql-radius-pill);
  background: var(--ql-color-avatar); color: var(--ql-color-on-fill);
  font: 600 13px var(--ql-font-sans);
}
/* §7: the area tabs hide below 1100 px; the rail is enough. */
@media (max-width: 1099px) { .app-topbar-tabs { display: none; } }
```

- [ ] **Step 6: Write the help dialog and the avatar menu**

`src/shell/HelpDialog.tsx`:

```tsx
import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import Close from '@mui/icons-material/Close';
import packageInfo from '../../package.json';
import type { Brand } from '../design/brands';
import { EXPORT_ITEMS } from '../export/run_export';
import { MOLECULE_DATA_VERSION } from '../molecules/data_version';

interface HelpDialogProps {
    open: boolean;
    onClose(): void;
    brand: Brand;
    /** The current mode's "About this model" text, where the mode has one. */
    aboutModel?: React.ReactNode;
}

/**
 * Help (spec §8.1 item 5): gestures, keys, export formats, About and the
 * current mode's model. No external links until the Phase 7 methods page.
 */
const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose, brand, aboutModel }) => (
    <Dialog open={open} onClose={onClose} aria-labelledby="help-title" maxWidth="sm" fullWidth>
        <DialogTitle className="help-title">
            {/* The name is the span alone: the close button's own name must not join it. */}
            <span id="help-title">Help</span>
            <IconButton aria-label="close help" onClick={onClose} size="small"><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers className="help-body ql-body">
            <h2 className="ql-section">Gestures</h2>
            <ul>
                <li>Drag to rotate the view; right-drag, or drag with two fingers, to pan.</li>
                <li>Scroll, or pinch, to zoom.</li>
                <li>Tap or click a ring on the cut face to open that shell; in Molecules, tap an atom or a bond to read it.</li>
            </ul>
            <h2 className="ql-section">Keyboard</h2>
            <ul>
                <li>⌘K (Mac) or Ctrl+K: search elements, molecules and orbitals.</li>
                <li>Tab moves between areas; the arrow keys move inside the mode rail, tab rows, chip groups and the orbital strip.</li>
                <li>Esc closes menus, popovers, the inspector drawer and full screen.</li>
            </ul>
            <h2 className="ql-section">Export formats</h2>
            <ul>
                {EXPORT_ITEMS.map(item => <li key={item.kind}>{item.label}: {item.detail}.</li>)}
            </ul>
            {aboutModel && (
                <>
                    <h2 className="ql-section">About this model</h2>
                    {aboutModel}
                </>
            )}
            <h2 className="ql-section">About</h2>
            <p>
                {brand.name} (electron-orbital-viewer), version {packageInfo.version}, molecule data {MOLECULE_DATA_VERSION}.
                Methods are stated beside every number.
            </p>
        </DialogContent>
    </Dialog>
);

export default HelpDialog;
```

`src/shell/AvatarMenu.tsx`:

```tsx
import React, { useState } from 'react';
import { FormControl, FormControlLabel, FormHelperText, FormLabel, IconButton, Popover, Radio, RadioGroup, Tooltip } from '@mui/material';
import MoreVert from '@mui/icons-material/MoreVert';
import PersonOutline from '@mui/icons-material/PersonOutline';
import { BRANDS, type BrandId } from '../design/brands';
import type { OwnerSession } from '../store/jobsSlice';

/** "eyal.shacham@…" or "EyalShacham@…" → "ES"; one name → its first two letters. */
export function initialsOf(email: string | null): string {
    if (!email) return 'O';
    const parts = email.split('@')[0].split(/[._-]+|(?=[A-Z])/).filter(Boolean);
    const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? 'O').slice(0, 2);
    return initials.toUpperCase();
}

interface AvatarMenuProps {
    session: OwnerSession;
    isOwner: boolean;
    /** The dev server, where the jobs target toggle lives (today's rule). */
    dev: boolean;
    /** <ConnectedOwnerBar page="/" showError={false} showDashboardLink />: today's sign-in, sign-out, jobs target and dashboard link. */
    ownerBar: React.ReactNode;
    onSignIn(): void;
    brandId: BrandId;
    onBrand(id: BrandId): void;
    /** The phone puts Theme and Help in here too (spec §9.8). */
    extra?: React.ReactNode;
}

/**
 * The avatar (spec §8.1 item 6). Signed out it is "Owner sign-in", which
 * grants nothing by itself; signed in it shows the owner's initials and a
 * menu with the owner bar and, for the owner only, the brand preview (§5).
 * Absent when it would do nothing: a production build without sign-in
 * (ruling R14).
 */
const AvatarMenu: React.FC<AvatarMenuProps> = ({ session, isOwner, dev, ownerBar, onSignIn, brandId, onBrand, extra }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    if (!dev && !session.configured && !session.signedIn && !extra) return null;
    const signedIn = session.signedIn;
    const canSignIn = session.configured || dev;
    // On a phone the avatar also holds Theme and Help (spec §9.8); without sign-in it is just a menu.
    const label = signedIn ? `Owner menu, signed in as ${session.email ?? 'the owner'}` : canSignIn ? 'Owner sign-in' : 'Menu';
    // A visitor of a production build with sign-in gets straight to Cognito.
    const opensMenu = signedIn || dev || isOwner || Boolean(extra) || !session.configured;
    return (
        <>
            <Tooltip title={signedIn ? 'Owner menu' : label}>
                <IconButton
                    className="ql-avatar-button"
                    aria-label={label}
                    aria-haspopup={opensMenu ? 'dialog' : undefined}
                    aria-expanded={opensMenu ? anchor !== null : undefined}
                    onClick={event => (opensMenu ? setAnchor(event.currentTarget) : onSignIn())}
                >
                    {signedIn ? <span className="ql-avatar" aria-hidden="true">{initialsOf(session.email)}</span>
                        : canSignIn ? <PersonOutline fontSize="small" /> : <MoreVert fontSize="small" />}
                </IconButton>
            </Tooltip>
            <Popover
                open={anchor !== null}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { className: 'avatar-menu', role: 'dialog', 'aria-label': 'Owner' } as object }}
            >
                {(signedIn || canSignIn) && ownerBar}
                {isOwner && (
                    <FormControl component="fieldset" className="avatar-brand">
                        <FormLabel component="legend" id="brand-preview-label">Brand preview</FormLabel>
                        <RadioGroup aria-labelledby="brand-preview-label" value={brandId}
                            onChange={event => onBrand(event.target.value as BrandId)}>
                            {BRANDS.map(brand => (
                                <FormControlLabel key={brand.id} value={brand.id} control={<Radio size="small" />} label={brand.name} />
                            ))}
                        </RadioGroup>
                        <FormHelperText>Previews the name in this browser only; nobody else sees it.</FormHelperText>
                    </FormControl>
                )}
                {extra}
            </Popover>
        </>
    );
};

export default AvatarMenu;
```

(The `RadioGroup` renders `role="radiogroup"` named by its legend, which the test's `queryByRole('radiogroup', { name: 'Brand preview' })` reads.) Add to `src/shell/top_bar.css`:

```css
.avatar-menu { padding: 12px 16px; min-width: 260px; display: flex; flex-direction: column; gap: 12px; }
.avatar-menu .owner-bar { margin-top: 0; }
```

- [ ] **Step 7: Run the tests**

Run: `npx jest tests/shell` → PASS. Then `npx tsc --noEmit -p tsconfig.json` (the `package.json` import needs `resolveJsonModule`, already on) and `npx jest`.

- [ ] **Step 8: Commit**

```bash
git add src/shell/icons.tsx src/shell/useRovingFocus.ts src/shell/Rail.tsx src/shell/rail.css src/shell/TopBar.tsx src/shell/top_bar.css src/shell/HelpDialog.tsx src/shell/AvatarMenu.tsx tests/shell/rail.test.tsx tests/shell/top_bar.test.tsx tests/shell/help_dialog.test.tsx tests/shell/avatar_menu.test.tsx tests/shell/roving_focus.test.tsx
git commit -m "feat(shell): top bar, mode rail, help dialog and avatar menu with the owner's brand preview (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/shell/icons.tsx src/shell/useRovingFocus.ts src/shell/Rail.tsx src/shell/rail.css src/shell/TopBar.tsx src/shell/top_bar.css src/shell/HelpDialog.tsx src/shell/AvatarMenu.tsx tests/shell/rail.test.tsx tests/shell/top_bar.test.tsx tests/shell/help_dialog.test.tsx tests/shell/avatar_menu.test.tsx tests/shell/roving_focus.test.tsx
```

---

### Task 7: Global search combobox

**Estimate:** 60 min. **Spec:** §8.1 item 3, §8.3, §13 (⌘K / Ctrl+K, Esc).

**Files:**
- Create: `src/shell/GlobalSearch.tsx`, `src/shell/search.css`
- Test: `tests/shell/global_search.test.tsx`

**Interfaces:**
- Consumes: `searchAll`, `SEARCH_GROUP_ORDER`, `SearchAction`, `SearchResult`, `SearchSources` (Task 5).
- Produces: `GlobalSearch` (default export), props `{ sources: SearchSources; onPick(action: SearchAction): void; onWantIndex?(): void; autoFocus?: boolean; variant?: 'bar' | 'sheet' }`. An `<input role="combobox">` named "Search elements, molecules and orbitals" with a grouped `listbox` (`role="group"` per group, `role="option"` per result, at most 6 per group), ↑/↓ move, Enter opens, Esc closes, "No matches" stated; ⌘K/Ctrl+K focuses it (`variant="bar"` only); `onWantIndex` fires on focus so App can load the molecule index.

- [ ] **Step 1: Write the failing test**

`tests/shell/global_search.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GlobalSearch from '../../src/shell/GlobalSearch';
import { LIBRARY_INDEX } from '../molecules/fixtures';

const setup = () => {
    const onPick = jest.fn();
    const onWantIndex = jest.fn();
    render(<GlobalSearch sources={{ molecules: LIBRARY_INDEX }} onPick={onPick} onWantIndex={onWantIndex} />);
    const input = screen.getByRole('combobox', { name: 'Search elements, molecules and orbitals' });
    return { onPick, onWantIndex, input };
};

describe('GlobalSearch (spec §8.3)', () => {
    it('lists grouped results and opens the first with Enter', () => {
        const { onPick, input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'fe' } });
        const list = screen.getByRole('listbox', { name: 'Search results' });
        expect(within(list).getByRole('group', { name: 'Elements' })).toBeInTheDocument();
        const options = within(list).getAllByRole('option');
        expect(options[0]).toHaveTextContent('Iron (Fe)');
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onPick).toHaveBeenCalledWith({ kind: 'element', Z: 26 });
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('moves with the arrows and points aria-activedescendant at the active option', () => {
        const { input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'c' } });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        const options = screen.getAllByRole('option');
        expect(options[1]).toHaveAttribute('aria-selected', 'true');
        expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    });

    it('opens a molecule with a click', () => {
        const { onPick, input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'h2o' } });
        fireEvent.click(screen.getByRole('option', { name: /Water/ }));
        expect(onPick).toHaveBeenCalledWith({ kind: 'molecule', id: 'h2o' });
    });

    it('says No matches for nonsense (Review Focus 5)', () => {
        const { input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'zz' } });
        expect(screen.getByRole('status')).toHaveTextContent('No matches');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes with Esc, asks for the index on focus, and takes Ctrl+K from anywhere', () => {
        const { input, onWantIndex } = setup();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(document.activeElement).toBe(input);
        fireEvent.focus(input);
        expect(onWantIndex).toHaveBeenCalled();
        fireEvent.change(input, { target: { value: 'fe' } });
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest tests/shell/global_search.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shell/GlobalSearch.tsx`**

```tsx
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import { searchAll, SEARCH_GROUP_ORDER, type SearchAction, type SearchResult, type SearchSources } from '../search/search_index';
import './search.css';

interface GlobalSearchProps {
    sources: SearchSources;
    /** Does what the existing pickers do (App's handleSearchPick). */
    onPick(action: SearchAction): void;
    /** The molecule index loads on demand; focusing the search asks for it. */
    onWantIndex?(): void;
    autoFocus?: boolean;
    /** 'sheet' is the phone's full-screen search: no shortcut hint, the list in the flow. */
    variant?: 'bar' | 'sheet';
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const slug = (text: string) => text.toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * The top bar's search (spec §8.3): a combobox over one client-side index,
 * grouped, at most six per group. ↑/↓ move, Enter opens, Esc closes;
 * ⌘K/Ctrl+K focuses it from anywhere (it has a modifier, so it is outside
 * WCAG 2.1.4's single-key rule).
 */
const GlobalSearch: React.FC<GlobalSearchProps> = ({ sources, onPick, onWantIndex, autoFocus = false, variant = 'bar' }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const id = useId();
    const listId = `${id}-results`;
    const optionId = (result: SearchResult) => `${id}-${result.key}`;
    const results = useMemo(() => searchAll(query, sources), [query, sources]);
    const showPopup = open && query.trim().length > 0;
    const showList = showPopup && results.length > 0;

    useEffect(() => {
        if (variant !== 'bar') return undefined;
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [variant]);

    const pick = (result: SearchResult) => {
        onPick(result.action);
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive(index => Math.min(results.length - 1, index + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(index => Math.max(0, index - 1));
        } else if (event.key === 'Enter') {
            if (showList && results[active]) {
                event.preventDefault();
                pick(results[active]);
            }
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className={`global-search ${variant}`}>
            <SearchIcon className="global-search-icon" fontSize="small" aria-hidden />
            <input
                ref={inputRef}
                className="global-search-input"
                type="search"
                role="combobox"
                aria-label="Search elements, molecules and orbitals"
                placeholder="Search elements, molecules…"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={showList ? listId : undefined}
                aria-activedescendant={showList && results[active] ? optionId(results[active]) : undefined}
                autoFocus={autoFocus}
                value={query}
                onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
                onFocus={() => { onWantIndex?.(); setOpen(true); }}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
            />
            {variant === 'bar' && <kbd className="global-search-hint" aria-hidden="true">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>}
            {showPopup && (
                <div className="global-search-popup">
                    {results.length === 0 ? (
                        <p className="global-search-empty" role="status">No matches</p>
                    ) : (
                        <ul id={listId} role="listbox" aria-label="Search results">
                            {SEARCH_GROUP_ORDER.filter(group => results.some(result => result.group === group)).map(group => (
                                <li key={group} role="presentation">
                                    <div className="global-search-group" id={`${id}-${slug(group)}`}>{group}</div>
                                    <ul role="group" aria-labelledby={`${id}-${slug(group)}`}>
                                        {results.filter(result => result.group === group).map(result => {
                                            const index = results.indexOf(result);
                                            return (
                                                <li
                                                    key={result.key}
                                                    id={optionId(result)}
                                                    role="option"
                                                    aria-selected={index === active}
                                                    className="global-search-option"
                                                    // Keeps focus in the field, so blur does not close the list first.
                                                    onMouseDown={event => event.preventDefault()}
                                                    onClick={() => pick(result)}
                                                >
                                                    <span className="global-search-label">{result.label}</span>
                                                    <span className="global-search-detail ql-caption">{result.detail}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
```

`src/shell/search.css`:

```css
/* src/shell/search.css -- the top bar's search (spec §8.1 item 3): 36 px, surface-3, radius md. */
.global-search {
  position: relative; display: flex; align-items: center; gap: 8px;
  height: var(--ql-size-search); padding: 0 10px; box-sizing: border-box;
  border-radius: var(--ql-radius-md); border: 1px solid var(--ql-color-border-subtle);
  background: var(--ql-color-surface-3); color: var(--ql-color-text-2);
}
/* The ring sits on the whole control (§13: 2 px, 2 px offset); the bare input inside draws none of its own. */
.global-search:focus-within { outline: 2px solid var(--ql-color-focus-ring); outline-offset: 2px; }
.global-search-input {
  flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--ql-color-text-1);
  font: var(--ql-type-body-weight) var(--ql-type-body-size) / var(--ql-type-body-line) var(--ql-font-sans);
}
.global-search-input::placeholder { color: var(--ql-color-text-3); opacity: 1; }
.global-search-hint {
  padding: 1px 5px; border-radius: var(--ql-radius-xs); border: 1px solid var(--ql-color-border-subtle);
  color: var(--ql-color-text-3); font: 500 11px / 14px var(--ql-font-sans);
}
.global-search-popup {
  position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; right: 0;
  max-height: min(480px, 70vh); overflow-y: auto; padding: 6px;
  border-radius: var(--ql-radius-md); border: 1px solid var(--ql-color-border-subtle);
  background: var(--ql-color-surface-1); box-shadow: var(--ql-shadow-popover);
}
.global-search.sheet { height: 44px; }
.global-search.sheet .global-search-popup { position: fixed; top: 64px; left: 0; right: 0; bottom: 0; max-height: none; border-radius: 0; }
.global-search-popup ul { list-style: none; margin: 0; padding: 0; }
.global-search-group {
  padding: 8px 8px 4px; color: var(--ql-color-text-3);
  font: 600 11px / 14px var(--ql-font-sans); letter-spacing: 0.04em; text-transform: uppercase;
}
.global-search-option {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 8px; border-radius: var(--ql-radius-sm); color: var(--ql-color-text-1); cursor: pointer;
}
.global-search.sheet .global-search-option { min-height: var(--ql-size-touch); align-items: center; box-sizing: border-box; }
.global-search-option[aria-selected="true"], .global-search-option:hover { background: var(--ql-color-surface-3); }
.global-search-empty { margin: 8px; color: var(--ql-color-text-2); }
```

- [ ] **Step 4: Run it**

Run: `npx jest tests/shell/global_search.test.tsx` → PASS. Then `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add src/shell/GlobalSearch.tsx src/shell/search.css tests/shell/global_search.test.tsx
git commit -m "feat(shell): global search combobox with groups, arrow keys, Esc and Ctrl/Cmd+K (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/shell/GlobalSearch.tsx src/shell/search.css tests/shell/global_search.test.tsx
```

---

### Task 8: The app shell — grid, rail and top bar wired, insets, medium drawer, phone top bar [visual]

**Estimate:** 2.5 h. **Spec:** §3.6, §7 (all breakpoints), §8.1–§8.4, §8.6 (the docked `.view-panel`), §9.8 (phone top bar, header offsets), §10 (`AppShell` row), §13 (landmarks, skip links). Every mode keeps today's panels: today's left column goes into Explore and today's right column into the inspector (Basic Orbitals, which had no left column, puts its `Controls` in Explore and its plot in the inspector). Rulings R3, R14, R15.

**Files:**
- Create: `src/shell/AppShell.tsx`, `src/shell/app_shell.css`, `src/shell/TabRow.tsx`, `src/shell/tabs.css`, `src/shell/ExplorePanel.tsx`, `src/shell/explore.css`, `src/shell/Inspector.tsx`, `src/shell/inspector.css`, `src/shell/PhoneTopBar.tsx`, `src/shell/phone_top_bar.css`
- Modify: `src/App.tsx`, `src/components/Controls.tsx` (the Mode toggle leaves), `src/useMediaQuery.ts`, `src/useViewInsets.ts`, `src/components/OrbitalViewer.tsx` (cell resize, dev insets), `src/style.css` (floating-panel positioning goes; phone offsets)
- Test: `tests/shell/app_shell.test.tsx`, `tests/shell/inspector.test.tsx` (new); rewrite the desktop cases of `tests/view_insets.test.ts`; update `src/App.test.tsx`, `src/App.jobs.test.tsx`, `tests/App.molecules.test.tsx`, `src/components/Controls.test.tsx`, `tests/orbital_viewer.test.tsx` as Step 1 lists

**Interfaces:**
- Consumes: `TopBar`, `TopBarTab`, `Rail`, `MODE_LABEL`, `HelpDialog`, `AvatarMenu`, `useRovingFocus` (Task 6); `GlobalSearch` (Task 7); `SearchAction` (Task 5); `useQuantumTheme`, `ThemeSwitch` (Task 2); `useBrand`, `brandPref`, `Wordmark`, `BrandMark` (Task 4); `LAYOUT` (Task 1); `ConnectedOwnerBar`, `signInHere` (`src/components/OwnerBar.tsx`); `sessionFailed`, `selectIsOwner` (`src/store/jobsSlice.ts`); `SESSION_ENDED` (`src/jobs/api.ts`); `BUILD_ENV`.
- Produces:
  - `AppShell` props `{ layout: 'desktop' | 'medium' | 'phone'; wide?: boolean; topBar?; rail?; explore?; inspector?; viewport: React.ReactNode; exploreCollapsed?: boolean; fullscreen?: boolean; shellRef?: React.Ref<HTMLDivElement> }` → `.app-shell` grid with `.app-workspace`, `<aside id="explore-panel" class="explore-panel side-panel" aria-label="Explore">`, two skip links.
  - `TabRow` props `{ idPrefix: string; label: string; tabs: TabItem[]; active: string; onChange(key: string): void }`, `interface TabItem { key: string; label: string }` → `role="tablist"` of `role="tab"` buttons with ids `${idPrefix}-tab-${key}` controlling `${idPrefix}-panel-${key}`.
  - `ExplorePanel` props `{ header?: React.ReactNode; tabs?: ExploreTab[]; active?: string; onTab?(key: string): void; body?: React.ReactNode }`, `interface ExploreTab extends TabItem { content: React.ReactNode }`.
  - `Inspector` props `{ variant: 'docked' | 'drawer' | 'stacked'; tabs?: InspectorTab[]; activeTab?: string; onTab?(key: string): void; body?: React.ReactNode; open?: boolean; onOpenChange?(open: boolean): void }`; docked → `<aside class="inspector view-panel" aria-label="Inspector">`; drawer → `<aside class="inspector inspector-drawer view-panel open|folded">` with a 44 px bar (one "View settings" button, or one button per tab named "<label> panel"); stacked → sections.
  - `PhoneTopBar` props `{ brand; themeMode; mode: ViewMode; onModeChange(mode): void; onOpenSearch(): void; avatar: React.ReactNode; compact?: boolean }` → `.phone-topbar` with a "Mode: <label>" button opening the rail as a menu.
  - `useMediaQuery.ts`: `MEDIUM_VIEWPORT = '(max-width: 1289px)'`; new `WIDE_VIEWPORT = '(min-width: 1680px)'`.
  - `useViewInsets.ts`: `TOP_ZONES`, `RIGHT_ZONES`, `BOTTOM_ZONES`, `PHONE_TOP_ZONES` (selector lists); `measureViewInsets` counts exactly these zones (and the phone sheet).
  - In dev builds only, `window.__eovInsets` holds the last insets (read by `tools/design/shoot.mjs`).
  - `App` callbacks later tasks use: `handleSearchPick(action: SearchAction)`, `setHelpOpen(open: boolean)`, `lastExploreModeRef`; the explore and inspector content are built in `exploreContent` and `inspectorBody` constants.

- [ ] **Step 1: Write and update the tests**

`tests/shell/inspector.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Inspector from '../../src/shell/Inspector';

const tabs = [{ key: 'plot', label: 'Plot', content: <p>plot body</p> }, { key: 'data', label: 'Data', content: <p>data body</p> }];

describe('Inspector (spec §8.6, §7 tablet)', () => {
    it('docks as the view panel with Plot and Data tabs', () => {
        const onTab = jest.fn();
        render(<Inspector variant="docked" tabs={tabs} activeTab="plot" onTab={onTab} />);
        const aside = screen.getByRole('complementary', { name: 'Inspector' });
        expect(aside).toHaveClass('view-panel');
        expect(screen.getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('plot body');
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(onTab).toHaveBeenCalledWith('data');
    });

    it('folds to a bar at medium width, opens over the view, and Esc closes it', () => {
        const onOpenChange = jest.fn();
        const { rerender } = render(<Inspector variant="drawer" body={<p>settings</p>} open={false} onOpenChange={onOpenChange} />);
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveClass('folded');
        fireEvent.click(screen.getByRole('button', { name: 'View settings' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        rerender(<Inspector variant="drawer" body={<p>settings</p>} open onOpenChange={onOpenChange} />);
        expect(screen.getByText('settings')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });

    it('stacks its tabs as sections inside the phone sheet (ruling R7)', () => {
        render(<Inspector variant="stacked" tabs={tabs} />);
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot body');
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('data body');
    });
});
```

`tests/shell/app_shell.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AppShell from '../../src/shell/AppShell';

const viewport = <main id="canvas-container" tabIndex={-1} aria-label="3D view">canvas</main>;

describe('AppShell (spec §7, §13 landmarks and skip links)', () => {
    it('lays the desktop grid out with skip links that move focus without touching the hash', () => {
        const { container } = render(<AppShell layout="desktop" topBar={<header>top</header>} rail={<nav aria-label="view mode" />}
            explore={<p>explore</p>} inspector={<aside aria-label="Inspector">inspector</aside>} viewport={viewport} />);
        expect(container.firstElementChild).toHaveClass('app-shell', 'desktop');
        expect(screen.getByRole('complementary', { name: 'Explore' })).toHaveClass('explore-panel', 'side-panel');
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
        const before = window.location.hash;
        fireEvent.click(screen.getByRole('link', { name: 'Skip to 3D view' }));
        expect(document.activeElement).toBe(screen.getByRole('main', { name: '3D view' }));
        expect(window.location.hash).toBe(before);
    });

    it('keeps the inspector out of the grid at medium width (it is a drawer in the viewport) and shows only the viewport on a phone', () => {
        const { container, rerender } = render(<AppShell layout="medium" explore={<p>explore</p>} inspector={<aside aria-label="Inspector" />} viewport={viewport} />);
        expect(container.firstElementChild).toHaveClass('medium');
        expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
        rerender(<AppShell layout="phone" explore={<p>explore</p>} viewport={viewport} />);
        expect(container.firstElementChild).toHaveClass('phone');
        expect(screen.queryByText('explore')).toBeNull();
    });
});
```

`tests/view_insets.test.ts` — keep the helper and the three phone cases; replace the two desktop cases with:

```ts
    it('on a desktop, keeps the object clear of every overlay zone of the viewport frame (spec §8.5)', () => {
        const root = layout({ width: 711, height: 820 }, {
            '.viewport-title': { left: 12, right: 330, top: 12, bottom: 76, width: 318, height: 64 },
            '.viewport-toolbar': { left: 495, right: 699, top: 12, bottom: 48, width: 204, height: 36 },
            '.key-column': { left: 640, right: 699, top: 300, bottom: 520, width: 59, height: 220 },
            '.thumbnail-strip': { left: 12, right: 699, top: 700, bottom: 808, width: 687, height: 108 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 76, right: 71, bottom: 120, left: 0 });
    });

    it('counts the periodic table and the inspector drawer, folded or open', () => {
        const root = layout({ width: 900, height: 700 }, {
            '.periodic-table-panel': { left: 12, right: 584, top: 12, bottom: 262, width: 572, height: 250 },
            '.inspector-drawer': { left: 566, right: 900, top: 0, bottom: 700, width: 334, height: 700 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 262, right: 334, bottom: 0, left: 0 });
    });

    // Ruling T16-d, kept: Molecules' key stack along the bottom.
    it('on a desktop, keeps the molecule clear of the legend stack along the bottom', () => {
        const root = layout({ width: 711, height: 820 }, {
            '.molecule-legend-stack': { left: 120, right: 580, top: 640, bottom: 808, width: 460, height: 168 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 0, right: 0, bottom: 180, left: 0 });
    });

    // The docked panels are siblings of the viewport now (spec §8.5: "the side-panel and view-panel selectors go").
    it('ignores a side or view panel, which no longer sits over the canvas', () => {
        const root = layout({ width: 711, height: 820 }, { '.side-panel': { left: 0, right: 315, top: 0, bottom: 820, width: 315, height: 820 } });
        expect(measureViewInsets(root, false)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('on a phone, counts the top bar and the header line below it (spec §9.8)', () => {
        const root = layout({ width: 390, height: 844 }, {
            '.phone-topbar': { left: 0, right: 390, top: 0, bottom: 52, width: 390, height: 52 },
            '.phone-header': { left: 8, right: 382, top: 60, bottom: 104, width: 374, height: 44 },
            '.phone-sheet': { left: 0, right: 390, top: 796, bottom: 844, width: 390, height: 48 },
        });
        expect(measureViewInsets(root, true)).toEqual({ top: 104, right: 0, bottom: 48, left: 0 });
    });
```

`src/components/Controls.test.tsx`: delete the `describe('mode toggle', …)` block, the test `'offers Bonds in the mode switch'` and the test `'offers Molecules in the mode switch'`, leaving a comment at each place: `// The Mode toggle left Controls for the rail (spec §8.2); tests/shell/rail.test.tsx pins the names and the dispatch.` Remove `onModeChange` from any remaining `render(<Controls … />)` call that passes it.

`src/App.jobs.test.tsx`:
- in `enterMolecules`: `if (narrow) fireEvent.click(screen.getByRole('tab', { name: 'View' }));` → `if (narrow) fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // the phone's mode menu (spec §9.8) replaced the Mode toggle in the View tab`
- in `"gives the owner on the dev server, running on this Mac, …"`: before the last `expect`, add `fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' })); // the owner bar lives in the avatar menu now (ruling R15)`
- in `'gives the signed-in owner of a production build …'`: before `expect(screen.getByText(/Signed in as owner@example.com/))`, add `fireEvent.click(screen.getByRole('button', { name: 'Owner menu, signed in as owner@example.com' })); // ruling R15`

`tests/App.molecules.test.tsx`:
- in `enterMolecules`: the same one-line change as `App.jobs.test.tsx`.
- add, inside `describe('Molecules mode', …)`:

```tsx
    it('on a phone, the mode menu enters and leaves Molecules with the old toggle\'s opacity rule (Review Focus 4)', async () => {
        const { store } = await enterMolecules(true);
        expect(store.getState().atom.mode).toBe('molecule');
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
        fireEvent.click(screen.getByRole('button', { name: /^Mode: / }));
        fireEvent.click(screen.getByRole('button', { name: 'atom mode' }));
        await flush();
        expect(store.getState().atom.mode).toBe('atom');
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(1);
        fireEvent.click(screen.getByRole('button', { name: /^Mode: / }));
        expect(screen.getByRole('button', { name: 'atom mode' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByRole('button', { name: /mode$/ }).map(b => b.getAttribute('aria-label')))
            .toEqual(['atom mode', 'basic orbitals mode', 'bonds mode', 'molecule mode']);
    });
```

`src/App.test.tsx`:
- in `'puts the view settings on their own tab, and a second tap folds the sheet'`: replace `expect(screen.getByRole('button', { name: /atom mode/i })).toBeInTheDocument();` with `expect(screen.getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument(); // the Mode toggle moved to the phone's mode menu (spec §9.8)`
- in `'on a phone: the header names the system and R, and the sheet has Explore, View and Plot'`: replace `fireEvent.click(screen.getByRole('tab', { name: 'View' }));` with `fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // spec §9.8`
- add `import { brandPref } from './design/brands';` and `import { MEDIUM_VIEWPORT } from './useMediaQuery';` and, after the `describe('App: Share', …)` block:

```tsx
describe('App: shell', () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => { window.matchMedia = originalMatchMedia; window.localStorage.clear(); });

    it('lays out the workstation: banner, view-mode rail, Explore, the 3D view and the inspector', () => {
        renderWithProvider(<App />);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'view mode' })).toBeInTheDocument();
        expect(screen.getByRole('complementary', { name: 'Explore' })).toBeInTheDocument();
        expect(screen.getByRole('main', { name: '3D view' })).toHaveAttribute('id', 'canvas-container');
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveClass('view-panel');
    });

    it('the Explore tab returns to the last of Atoms, Basic Orbitals and Bonds; Molecules has its own', () => {
        const { store } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'bonds mode' }));
        fireEvent.click(screen.getByRole('link', { name: 'Molecules' }));
        expect(store.getState().atom.mode).toBe('molecule');
        expect(screen.getByRole('link', { name: 'Molecules' })).toHaveAttribute('aria-current', 'page');
        fireEvent.click(screen.getByRole('link', { name: 'Explore' }));
        expect(store.getState().atom.mode).toBe('bonds');
    });

    it('opens a search result the way the pickers do', () => {
        const { store } = renderWithProvider(<App />);
        const search = screen.getByRole('combobox', { name: 'Search elements, molecules and orbitals' });
        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: 'fe' } });
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(store.getState().atom.Z).toBe(26);
        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: '2px' } });
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(store.getState().atom.mode).toBe('hydrogenic');
        expect(store.getState().orbital.basicSelection).toEqual({ n: 2, l: 1, ml: 1 });
    });

    it('a theme or brand switch leaves the share link byte-identical (Review Focus 1)', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: /^Theme: / }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light Clean' }));
        act(() => { brandPref.set('novalab'); });
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
        expect(writeText.mock.calls[1][0]).toBe(writeText.mock.calls[0][0]);
    });

    it('at medium width the inspector is a drawer over the viewport, folded until asked, and Esc closes it', () => {
        window.matchMedia = ((media: string) => ({ media, matches: media === MEDIUM_VIEWPORT,
            addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
        const { container } = renderWithProvider(<App />);
        const drawer = container.querySelector('#canvas-container .view-panel')!;
        expect(drawer).toHaveClass('folded');
        fireEvent.click(screen.getByRole('button', { name: 'View settings' }));
        expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('open');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('folded');
    });
});
```

`tests/orbital_viewer.test.tsx`: add `handleResize` to the existing named import from `'../src/orbital_visualizer'`, and a test:

```tsx
    it('resizes the renderer when its grid cell changes size without a window resize', () => {
        const callbacks: Array<() => void> = [];
        const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
            constructor(callback: () => void) { callbacks.push(callback); }
            observe() {}
            disconnect() {}
        };
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700);
        const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
        try {
            renderViewer();
            act(() => callbacks.forEach(callback => callback()));
            expect(handleResize).toHaveBeenCalledWith(expect.anything(), 700, 500);
        } finally {
            width.mockRestore();
            height.mockRestore();
            (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
        }
    });
```

Run: `npx jest tests/shell tests/view_insets.test.ts src/App.test.tsx src/App.jobs.test.tsx tests/App.molecules.test.tsx tests/orbital_viewer.test.tsx`
Expected: FAIL (missing modules; no rail in the app; insets still measure the side panels).

- [ ] **Step 2: The breakpoints and the insets**

`src/useMediaQuery.ts`: change `MEDIUM_VIEWPORT` to `'(max-width: 1289px)'` and rewrite its comment's figures ("below 1290 px the docked inspector would push the canvas under 560 px — spec §7; here the inspector is a drawer over the view"); add after it:

```ts
/**
 * Wide desktop (spec §7): at 1680 px and over, the rail shows icon and label
 * in a row (184 px) and the inspector widens to 320. Only meaningful when
 * neither NARROW_VIEWPORT nor MEDIUM_VIEWPORT matches.
 */
export const WIDE_VIEWPORT = '(min-width: 1680px)';
```

`src/useViewInsets.ts`: replace `measureViewInsets` with the version below, and in `useViewInsets` replace the selector string inside `observeAll` with `OBSERVED_ZONES`:

```ts
/** The viewport frame's overlay zones (spec §8.5), each measured as a camera inset. */
export const TOP_ZONES = ['.viewport-title', '.viewport-toolbar', '.periodic-table-panel'];
export const RIGHT_ZONES = ['.key-column', '.inspector-drawer'];
export const BOTTOM_ZONES = ['.thumbnail-strip', '.molecule-legend-stack'];
/** A phone's top bar and the header line under it (spec §9.8). */
export const PHONE_TOP_ZONES = ['.phone-topbar', '.phone-header'];
const OBSERVED_ZONES = [...TOP_ZONES, ...RIGHT_ZONES, ...BOTTOM_ZONES, ...PHONE_TOP_ZONES, '.phone-sheet'].join(', ');

/**
 * Which parts of the viewport cell are covered, in CSS pixels per edge. The
 * docked Explore panel and inspector sit beside the cell, not over it, so
 * they are not counted (spec §8.5); what is counted is every overlay zone
 * inside it: on a desktop the title block, toolbar and periodic table along
 * the top, the key column and the medium-width inspector drawer down the
 * right, the thumbnail strip and Molecules' key stack along the bottom; on a
 * phone the top bar and header line, and the sheet.
 */
export function measureViewInsets(container: HTMLElement, narrow: boolean): ViewInsets {
    const bounds = container.getBoundingClientRect();
    const insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const rects = (selector: string) => Array.from(container.querySelectorAll<HTMLElement>(selector))
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
    const each = (selectors: string[], apply: (rect: DOMRect) => void) => selectors.forEach(s => rects(s).forEach(apply));

    if (narrow) {
        each(PHONE_TOP_ZONES, rect => { insets.top = Math.max(insets.top, rect.bottom - bounds.top); });
        // The tabbed sheet: along the bottom of a phone held upright, down the
        // right of one turned sideways (only its tab bar, when folded).
        const sheet = rects('.phone-sheet')[0];
        if (sheet) {
            if (sheet.width > bounds.width * 0.6) insets.bottom = Math.max(0, bounds.bottom - sheet.top);
            else insets.right = Math.max(0, bounds.right - sheet.left);
        }
    } else {
        each(TOP_ZONES, rect => { insets.top = Math.max(insets.top, rect.bottom - bounds.top); });
        each(RIGHT_ZONES, rect => { insets.right = Math.max(insets.right, bounds.right - rect.left); });
        each(BOTTOM_ZONES, rect => { insets.bottom = Math.max(insets.bottom, bounds.bottom - rect.top); });
    }

    // Round so sub-pixel layout jitter does not count as a change.
    return {
        top: Math.max(0, Math.round(insets.top)),
        right: Math.max(0, Math.round(insets.right)),
        bottom: Math.max(0, Math.round(insets.bottom)),
        left: Math.max(0, Math.round(insets.left)),
    };
}
```

`src/components/OrbitalViewer.tsx`: add `import { BUILD_ENV } from '../jobs/build_env';`; make `handleInsets`

```ts
    const handleInsets = useCallback((insets: ViewInsets) => {
        setViewInsets(visualizerContextRef.current, insets);
        // The live check (tools/design/shoot.mjs) compares these with the zones; dev builds only.
        if (BUILD_ENV.dev) (window as Window & { __eovInsets?: ViewInsets }).__eovInsets = insets;
    }, []);
```

and add, after the existing window-resize effect:

```ts
    // The grid resizes the cell without any window resize: the medium-width
    // drawer, Explore folding, full screen (spec §7, §8.5).
    useEffect(() => {
        const host = canvasHostRef.current;
        if (!host || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            const context = visualizerContextRef.current;
            if (context && host.clientWidth > 0 && host.clientHeight > 0) {
                visualizerHandleResize(context, host.clientWidth, host.clientHeight);
            }
        });
        observer.observe(host);
        return () => observer.disconnect();
    }, []);
```

- [ ] **Step 3: Write the shell components**

`src/shell/TabRow.tsx`:

```tsx
import React, { useRef } from 'react';
import { useRovingFocus } from './useRovingFocus';
import './tabs.css';

export interface TabItem { key: string; label: string }

interface TabRowProps {
    idPrefix: string;
    label: string;
    tabs: TabItem[];
    active: string;
    onChange(key: string): void;
}

/** A row of tabs (spec §8.4: nav style, underline indicator; §13: arrows inside, Tab exits). */
const TabRow: React.FC<TabRowProps> = ({ idPrefix, label, tabs, active, onChange }) => {
    const ref = useRef<HTMLDivElement>(null);
    useRovingFocus(ref, { selector: '[role="tab"]', orientation: 'horizontal' });
    return (
        <div ref={ref} className="ql-tabs" role="tablist" aria-label={label}>
            {tabs.map(tab => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`${idPrefix}-tab-${tab.key}`}
                    aria-selected={tab.key === active}
                    aria-controls={`${idPrefix}-panel-${tab.key}`}
                    className="ql-tab"
                    onClick={() => onChange(tab.key)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

export default TabRow;
```

`src/shell/tabs.css`:

```css
/* src/shell/tabs.css -- panel tab rows (spec §8.4): nav style, a 2 px selected-edge underline. */
.ql-tabs { display: flex; gap: 20px; padding: 0 var(--ql-size-panel-padding); border-bottom: 1px solid var(--ql-color-border-subtle); }
.ql-tab {
  position: relative; padding: 12px 0 10px; border: 0; background: none; cursor: pointer;
  color: var(--ql-color-text-2);
  font: var(--ql-type-nav-weight) var(--ql-type-nav-size) / var(--ql-type-nav-line) var(--ql-font-sans);
  transition: color var(--ql-motion-hover) ease-out;
}
.ql-tab:hover { color: var(--ql-color-text-1); }
.ql-tab[aria-selected="true"] { color: var(--ql-color-text-1); font-weight: 600; }
.ql-tab[aria-selected="true"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 1px;
  background: var(--ql-color-selected-edge);
}
```

`src/shell/ExplorePanel.tsx`:

```tsx
import React, { useId } from 'react';
import TabRow, { type TabItem } from './TabRow';
import './explore.css';

export interface ExploreTab extends TabItem { content: React.ReactNode }

interface ExplorePanelProps {
    /** The subject's header card (the Atom screen's element tile and breadcrumb, Task 10). */
    header?: React.ReactNode;
    tabs?: ExploreTab[];
    active?: string;
    onTab?(key: string): void;
    /** Without tabs: today's left-column content, as it is (6G-1 for Basic, Bonds and Molecules). */
    body?: React.ReactNode;
}

/** The Explore panel's contents (spec §8.4); AppShell supplies the <aside>. The body scrolls on its own. */
const ExplorePanel: React.FC<ExplorePanelProps> = ({ header, tabs, active, onTab, body }) => {
    const id = useId();
    const current = tabs?.find(tab => tab.key === active) ?? tabs?.[0];
    return (
        <>
            {header && <div className="explore-header">{header}</div>}
            {tabs && current ? (
                <>
                    <TabRow idPrefix={id} label="Explore" tabs={tabs} active={current.key} onChange={key => onTab?.(key)} />
                    <div className="explore-body" role="tabpanel" id={`${id}-panel-${current.key}`} aria-labelledby={`${id}-tab-${current.key}`}>
                        {current.content}
                    </div>
                </>
            ) : (
                <div className="explore-body">{body}</div>
            )}
        </>
    );
};

export default ExplorePanel;
```

`src/shell/explore.css`:

```css
/* src/shell/explore.css -- the Explore panel's inside (spec §8.4); the frame is in app_shell.css. */
.explore-header { display: flex; flex-direction: column; gap: 12px; padding: var(--ql-size-panel-padding) var(--ql-size-panel-padding) 0; }
.explore-body {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: var(--ql-size-section-gap);
  padding: var(--ql-size-panel-padding);
}
/* Today's cards keep their content but drop their own card chrome inside the docked panel. */
.explore-panel .level-nav, .explore-panel .bonds-panel, .explore-panel #controls, .explore-panel .molecule-nav {
  position: static; width: auto; max-width: none; max-height: none; overflow: visible;
  margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none;
}
```

`src/shell/Inspector.tsx`:

```tsx
import React, { useEffect, useId } from 'react';
import TabRow, { type TabItem } from './TabRow';
import './inspector.css';

export interface InspectorTab extends TabItem { content: React.ReactNode }

interface InspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    tabs?: InspectorTab[];
    activeTab?: string;
    onTab?(key: string): void;
    /** Without tabs: today's right-column content (6G-1 for Basic, Bonds and Molecules). */
    body?: React.ReactNode;
    /** Drawer only. */
    open?: boolean;
    onOpenChange?(open: boolean): void;
}

/**
 * The inspector (spec §8.6): docked at 290 px on a desktop; at medium width a
 * 44 px edge bar whose buttons slide a 290 px drawer over the viewport's
 * right edge, non-modal and measured as a camera inset (§7); stacked inside
 * the phone sheet (ruling R7). `.view-panel` stays its class for the tests.
 */
const Inspector: React.FC<InspectorProps> = ({ variant, tabs, activeTab, onTab, body, open = false, onOpenChange }) => {
    const id = useId();
    const active = tabs?.find(tab => tab.key === activeTab) ?? tabs?.[0];

    useEffect(() => {
        if (variant !== 'drawer' || !open) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpenChange?.(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [variant, open, onOpenChange]);

    if (variant === 'stacked') {
        return (
            <div className="inspector-stacked">
                {tabs ? tabs.map(tab => <section key={tab.key} aria-label={tab.label} className="inspector-section">{tab.content}</section>) : body}
            </div>
        );
    }

    const content = tabs && active ? (
        <>
            <TabRow idPrefix={id} label="Inspector" tabs={tabs} active={active.key} onChange={key => onTab?.(key)} />
            <div className="inspector-body" role="tabpanel" id={`${id}-panel-${active.key}`} aria-labelledby={`${id}-tab-${active.key}`}>
                {active.content}
            </div>
        </>
    ) : (
        <div className="inspector-body">{body}</div>
    );

    if (variant === 'drawer') {
        const bar: TabItem[] = tabs ?? [{ key: 'view', label: 'View' }];
        return (
            <aside className={`inspector inspector-drawer view-panel ${open ? 'open' : 'folded'}`} aria-label="Inspector">
                <div className="inspector-bar">
                    {bar.map(item => {
                        const expanded = open && (!tabs || active?.key === item.key);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                className="inspector-bar-button"
                                aria-label={tabs ? `${item.label} panel` : 'View settings'}
                                aria-expanded={expanded}
                                onClick={() => {
                                    if (expanded) { onOpenChange?.(false); return; }
                                    if (tabs) onTab?.(item.key);
                                    onOpenChange?.(true);
                                }}
                            >
                                <span className="inspector-bar-label">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
                {open && <div className="inspector-drawer-panel">{content}</div>}
            </aside>
        );
    }

    return <aside className="inspector view-panel" aria-label="Inspector">{content}</aside>;
};

export default Inspector;
```

`src/shell/inspector.css`:

```css
/* src/shell/inspector.css -- the inspector's inside (spec §8.6) and its medium-width drawer (§7). */
.inspector-body {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: var(--ql-size-section-gap);
  padding: var(--ql-size-panel-padding);
}
.inspector #controls, .inspector .radial-plot, .inspector .molecule-orbital-card {
  position: static; width: auto; max-width: none !important; max-height: none; overflow: visible;
  margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none;
}
.inspector-drawer {
  position: absolute; z-index: 12; top: 0; right: 0; bottom: 0;
  display: flex; flex-direction: row-reverse;
  border-radius: 0 var(--ql-radius-xl) var(--ql-radius-xl) 0;
}
.inspector-bar {
  flex: 0 0 var(--ql-size-inspector-bar); display: flex; flex-direction: column; gap: 4px;
  padding: 8px 4px; box-sizing: border-box;
}
.inspector-drawer.open .inspector-bar { border-left: 1px solid var(--ql-color-border-subtle); }
.inspector-bar-button {
  writing-mode: vertical-rl; padding: 12px 6px; cursor: pointer;
  border: 1px solid transparent; border-radius: var(--ql-radius-md); background: none;
  color: var(--ql-color-text-2); font: var(--ql-type-nav-weight) var(--ql-type-nav-size) var(--ql-font-sans);
}
.inspector-bar-button[aria-expanded="true"] {
  background: var(--ql-color-selected-fill); border-color: var(--ql-color-selected-edge); color: var(--ql-color-on-fill);
}
.inspector-drawer-panel { display: flex; flex-direction: column; width: var(--ql-size-inspector); min-height: 0; }
.inspector-stacked { display: flex; flex-direction: column; gap: var(--ql-size-section-gap); }
@media (prefers-reduced-motion: no-preference) {
  .inspector-drawer-panel { animation: ql-drawer-in var(--ql-motion-panel) ease-out; }
}
@keyframes ql-drawer-in { from { transform: translateX(16px); opacity: 0; } to { transform: none; opacity: 1; } }
```

`src/shell/AppShell.tsx`:

```tsx
import React from 'react';
import './app_shell.css';

interface AppShellProps {
    layout: 'desktop' | 'medium' | 'phone';
    /** ≥ 1680 px (spec §7). */
    wide?: boolean;
    topBar?: React.ReactNode;
    rail?: React.ReactNode;
    explore?: React.ReactNode;
    /** Docked on a desktop; at medium width App renders it inside the viewport as a drawer instead. */
    inspector?: React.ReactNode;
    /** The viewport cell itself: <main id="canvas-container">, the one canvas and its overlay zones. */
    viewport: React.ReactNode;
    exploreCollapsed?: boolean;
    fullscreen?: boolean;
    shellRef?: React.Ref<HTMLDivElement>;
}

/** Focuses a landmark without touching location.hash, which is the app's view state (url_state.ts). */
function skipTo(event: React.MouseEvent<HTMLAnchorElement>, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.focus();
}

/**
 * The app frame (spec §7, §10): top bar, rail, Explore, the viewport cell
 * and the inspector on a grid. App keeps all its state and effects and
 * passes these slots; the viewport cell never remounts when the layout
 * changes (spec §3.2), because it is always this element's child.
 */
const AppShell: React.FC<AppShellProps> = ({ layout, wide = false, topBar, rail, explore, inspector, viewport, exploreCollapsed = false, fullscreen = false, shellRef }) => {
    const classes = ['app-shell', layout, wide && 'wide', exploreCollapsed && 'explore-collapsed', fullscreen && 'is-fullscreen'].filter(Boolean).join(' ');
    return (
        <div ref={shellRef} className={classes}>
            {layout !== 'phone' && (
                <>
                    <a className="skip-link" href="#canvas-container" onClick={event => skipTo(event, 'canvas-container')}>Skip to 3D view</a>
                    <a className="skip-link" href="#explore-panel" onClick={event => skipTo(event, 'explore-panel')}>Skip to controls</a>
                    {topBar}
                    {rail}
                </>
            )}
            <div className="app-workspace">
                {layout !== 'phone' && (
                    <aside id="explore-panel" className="explore-panel side-panel" aria-label="Explore" tabIndex={-1}>{explore}</aside>
                )}
                {viewport}
                {layout === 'desktop' && inspector}
            </div>
        </div>
    );
};

export default AppShell;
```

(The viewport stays inside `.app-workspace` in every layout, so React never moves or remounts `#canvas-container` when the window crosses a breakpoint.)

`src/shell/app_shell.css`:

```css
/* src/shell/app_shell.css -- the layout grid per breakpoint (spec §7).
   Desktop: 56 top bar; 76 rail | 315 Explore | canvas | 290 inspector, gutters and outer padding 12. */
.app-shell {
  position: relative; display: grid; width: 100%; height: 100dvh; overflow: hidden;
  grid-template-columns: var(--ql-size-rail) minmax(0, 1fr);
  grid-template-rows: var(--ql-size-top-bar) minmax(0, 1fr);
  grid-template-areas: 'topbar topbar' 'rail workspace';
  background: var(--ql-color-bg-app); color: var(--ql-color-text-1);
}
.app-shell.wide { grid-template-columns: var(--ql-size-rail-wide) minmax(0, 1fr); }
.app-workspace {
  grid-area: workspace; display: grid; min-width: 0; min-height: 0;
  gap: var(--ql-size-gutter); padding: var(--ql-size-gutter);
  grid-template-columns: var(--ql-size-explore) minmax(0, 1fr) var(--ql-size-inspector);
}
.app-shell.wide .app-workspace { grid-template-columns: var(--ql-size-explore) minmax(0, 1fr) var(--ql-size-inspector-wide); }
.app-shell.medium .app-workspace { grid-template-columns: var(--ql-size-explore-medium) minmax(0, 1fr); }
.app-shell.explore-collapsed .explore-panel { display: none; }
.app-shell.explore-collapsed .app-workspace { grid-template-columns: minmax(0, 1fr); }
.app-shell.desktop.explore-collapsed .app-workspace { grid-template-columns: minmax(0, 1fr) var(--ql-size-inspector); }
.explore-panel, .inspector {
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background: var(--ql-color-surface-1); color: var(--ql-color-text-1);
  border: 1px solid var(--ql-color-border-subtle); border-radius: var(--ql-radius-xl);
  box-shadow: var(--ql-shadow-panel);
}
#canvas-container.viewport-cell {
  position: relative; min-width: 0; min-height: 0; overflow: hidden;
  border-radius: var(--ql-radius-xl); background: var(--ql-color-canvas);
}
#canvas-container.viewport-cell:focus { outline: none; }
#canvas-container.viewport-cell:focus-visible { outline: 2px solid var(--ql-color-focus-ring); outline-offset: -2px; }
/* Phone: the viewport is the whole screen; its header, top bar and sheet sit inside it (spec §7). */
.app-shell.phone { display: block; }
.app-shell.phone .app-workspace { display: block; height: 100%; padding: 0; }
.app-shell.phone #canvas-container.viewport-cell { height: 100%; border-radius: 0; }
/* §8.5 Fullscreen: the rail, Explore and inspector hide; the viewport takes the screen. */
.app-shell.is-fullscreen { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); grid-template-areas: 'workspace'; }
.app-shell.is-fullscreen .app-topbar, .app-shell.is-fullscreen .app-rail,
.app-shell.is-fullscreen .explore-panel, .app-shell.is-fullscreen .inspector { display: none; }
.app-shell.is-fullscreen .app-workspace { grid-template-columns: minmax(0, 1fr); padding: 0; }
.app-shell.is-fullscreen #canvas-container.viewport-cell { border-radius: 0; }
```

`src/shell/PhoneTopBar.tsx`:

```tsx
import React, { useState } from 'react';
import { Button, IconButton, Popover } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BrandMark from '../design/BrandMark';
import Wordmark from '../design/Wordmark';
import type { Brand } from '../design/brands';
import type { ThemeMode } from '../design/tokens';
import type { ViewMode } from '../store/atomSlice';
import Rail, { MODE_LABEL } from './Rail';
import './phone_top_bar.css';

interface PhoneTopBarProps {
    brand: Brand;
    themeMode: ThemeMode;
    mode: ViewMode;
    onModeChange(mode: ViewMode): void;
    onOpenSearch(): void;
    avatar: React.ReactNode;
    /** A phone turned sideways: merged into the 44 px header line, without the wordmark (spec §7). */
    compact?: boolean;
}

/**
 * The phone's 52 px top bar (spec §9.8): brand, the mode menu ("Atoms ▾"
 * opens the rail's destinations), search, and the avatar, whose menu also
 * holds Theme and Help.
 */
const PhoneTopBar: React.FC<PhoneTopBarProps> = ({ brand, themeMode, mode, onModeChange, onOpenSearch, avatar, compact = false }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    return (
        <div className={`phone-topbar${compact ? ' compact' : ''}`}>
            {!compact && (
                <a className="app-topbar-brand" href="/" aria-label={`${brand.name}, home`}>
                    <BrandMark size={24} />
                    <Wordmark brand={brand} mode={themeMode} />
                </a>
            )}
            <Button
                size="small"
                className="phone-mode-button"
                aria-label={`Mode: ${MODE_LABEL[mode]}`}
                aria-haspopup="true"
                aria-expanded={anchor !== null}
                onClick={event => setAnchor(event.currentTarget)}
            >
                {MODE_LABEL[mode]} ▾
            </Button>
            <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
                <Rail variant="menu" mode={mode} isOwner={false} onModeChange={next => { setAnchor(null); onModeChange(next); }} />
            </Popover>
            <IconButton className="ql-icon-button" aria-label="Search" onClick={onOpenSearch}>
                <SearchIcon fontSize="small" />
            </IconButton>
            {avatar}
        </div>
    );
};

export default PhoneTopBar;
```

`src/shell/phone_top_bar.css`:

```css
/* src/shell/phone_top_bar.css -- the phone's top bar (spec §9.8), inside the viewport cell. */
.phone-topbar {
  position: absolute; z-index: 16; top: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 4px;
  height: var(--ql-size-phone-top-bar); padding: 0 8px; box-sizing: border-box;
  background: var(--ql-color-bg-bar); border-bottom: 1px solid var(--ql-color-border-subtle);
}
.phone-topbar .app-topbar-brand { margin-right: auto; min-width: 0; gap: 8px; }
.phone-topbar .ql-wordmark { font-size: 18px; line-height: 22px; }
.phone-topbar .MuiIconButton-root { width: var(--ql-size-touch); height: var(--ql-size-touch); }
.phone-mode-button.MuiButton-root { min-height: var(--ql-size-touch); color: var(--ql-color-text-1); font-weight: 600; }
.phone-topbar.compact { position: static; flex: 0 0 auto; height: 44px; padding: 0; background: none; border: 0; }
.phone-search-sheet { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--ql-color-bg-bar); }
.phone-search-sheet .global-search { flex: 1; }
.avatar-extra { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--ql-color-border-subtle); }
.avatar-extra-row { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 4: `Controls` loses the Mode toggle**

In `src/components/Controls.tsx`: delete `onModeChange` from `ControlsProps` and from the destructured props, and delete the whole `<FormControl component="fieldset" …>` block that renders the `mode-toggle` `ToggleButtonGroup` (with its comment), leaving a one-line comment: `{/* The Mode toggle moved to the rail and the phone's mode menu (spec §8.2). */}`.

- [ ] **Step 5: App composes the shell**

In `src/App.tsx`:

1. Imports — add:

```tsx
import { Button, Dialog, IconButton } from '@mui/material';
import Close from '@mui/icons-material/Close';
import HelpOutline from '@mui/icons-material/HelpOutline';
import AppShell from './shell/AppShell';
import TopBar, { TopBarTab } from './shell/TopBar';
import Rail from './shell/Rail';
import GlobalSearch from './shell/GlobalSearch';
import HelpDialog from './shell/HelpDialog';
import AvatarMenu from './shell/AvatarMenu';
import PhoneTopBar from './shell/PhoneTopBar';
import ExplorePanel from './shell/ExplorePanel';
import Inspector from './shell/Inspector';
import ThemeSwitch from './design/ThemeSwitch';
import { useQuantumTheme } from './design/useQuantumTheme';
import { useBrand } from './design/useBrand';
import { brandPref } from './design/brands';
import { LAYOUT } from './design/tokens';
import { BUILD_ENV } from './jobs/build_env';
import { SESSION_ENDED } from './jobs/api';
import { signInHere } from './components/OwnerBar';
import { sessionFailed } from './store/jobsSlice';
import { NO_COMBINATION } from './combinations';
import type { SearchAction } from './search/search_index';
```

and add `WIDE_VIEWPORT` to the `./useMediaQuery` import, `setCombination` is already imported from `./store/orbitalSlice`. Merge the MUI imports into the existing `@mui/material` import line.

2. `const PLOT_WIDTH = 278;` and its comment become:

```tsx
/** §8.6: the inspector's 290 px less its 16 px padding each side. */
const PLOT_WIDTH = LAYOUT.plotWidth;
```

3. After `const isMedium = …`, add:

```tsx
    const isWide = useMediaQuery(WIDE_VIEWPORT) && !isNarrow && !isMedium;
    const layout: 'desktop' | 'medium' | 'phone' = isNarrow ? 'phone' : isMedium ? 'medium' : 'desktop';
    const { mode: themeMode } = useQuantumTheme();
    const brand = useBrand();
    const [helpOpen, setHelpOpen] = useState(false);
    const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
    // The molecule index loads when Molecules opens -- or when someone starts a search (spec §8.3).
    const [searchWantsIndex, setSearchWantsIndex] = useState(false);
    const wantIndex = useCallback(() => setSearchWantsIndex(true), []);
    // §8.1: "Explore" returns to the last of Atoms, Basic Orbitals and Bonds used.
    const lastExploreModeRef = useRef<ViewMode>(atomMode === 'molecule' ? 'atom' : atomMode);
    useEffect(() => { if (atomMode !== 'molecule') lastExploreModeRef.current = atomMode; }, [atomMode]);
```

(`atomMode` is declared above; move these lines below the `isMoleculeMode`/`useMoleculeLoader` block if the compiler needs the order.) Change `useMoleculeLoader(isMoleculeMode);` to `useMoleculeLoader(isMoleculeMode || searchWantsIndex);`.

4. After `moleculeEntries`, add the search sources and the pick handler:

```tsx
    const searchSources = useMemo(() => ({ molecules: moleculeEntries }), [moleculeEntries]);
    // Opening a result does what the existing pickers do (spec §8.3).
    const handleSearchPick = useCallback((action: SearchAction) => {
        switch (action.kind) {
            case 'element':
                if (atomMode !== 'atom') handleModeChange('atom');
                handleAtomElementChange(action.Z);
                setTableOpen(false);
                break;
            case 'molecule':
                if (atomMode !== 'molecule') handleModeChange('molecule');
                dispatch(selectMolecule({ id: action.id }));
                break;
            case 'bonds':
                if (atomMode !== 'bonds') handleModeChange('bonds');
                dispatch(selectBondsSystem(action.system));
                break;
            case 'basic':
                dispatch(setCombination(NO_COMBINATION));
                dispatch(setBasicSelection({ n: action.n, l: action.l, ml: action.ml }));
                // Entering the mode draws the selection (setMode bumps basicRenderNonce); already in it, draw it now.
                if (atomMode !== 'hydrogenic') handleModeChange('hydrogenic');
                else dispatch(startOrbitalCalculation(basicOrbitalParams(action.n, action.l, action.ml, enclosedFraction)));
                break;
        }
    }, [atomMode, handleModeChange, handleAtomElementChange, dispatch, enclosedFraction]);
```

5. `controlsActions` becomes `shareExportBar` alone (the owner bar moved to the avatar, ruling R15): replace the `controlsActions` `useMemo` with `const controlsActions = shareExportBar;` and remove the `// The discreet owner sign-in …` comment. Remove `onModeChange={handleModeChange}` from `<Controls>`.

6. Replace everything from `return (` to the end of the component with the shell composition below. Every element between `<OrbitalViewer …/>` and the `<Snackbar>` is today's, unchanged, except: the old `isNarrow ? (…) : (…)` block (phone header + `PhoneSheet`, or `.side-panel` + `.view-panel`) is replaced by `{phoneChrome}` and the medium drawer.

```tsx
    const exploreContent = isAtomMode ? <LevelNav {...levelNavProps}>{subshellPanel}</LevelNav>
        : isBondsMode ? bondsPanel
        : isMoleculeMode ? <><MoleculeNav {...moleculeNavProps} /><MoleculeJobsSection /></>
        // Basic Orbitals had no left column: its n/l/mₗ, combination and view settings go here until 6G-2.
        : controls;
    const inspectorBody = (
        <>
            {!isBasicMode && controls}
            {renderRadialPlot(PLOT_WIDTH, false)}
        </>
    );

    const session = useAppSelector(state => state.jobs.session);
    const avatar = (
        <AvatarMenu
            session={session}
            isOwner={isOwner}
            dev={BUILD_ENV.dev}
            ownerBar={<ConnectedOwnerBar page="/" showError={false} />}
            onSignIn={() => signInHere('/', text => dispatch(sessionFailed(text)))}
            brandId={brand.id}
            onBrand={id => brandPref.set(id)}
            extra={isNarrow ? (
                <div className="avatar-extra">
                    <div className="avatar-extra-row"><ThemeSwitch /><span>Theme</span></div>
                    <Button size="small" startIcon={<HelpOutline fontSize="small" />} onClick={() => setHelpOpen(true)}>Help</Button>
                </div>
            ) : undefined}
        />
    );
    const urlMode = (viewMode: ViewMode) => ({ atom: 'atom', hydrogenic: 'basic', bonds: 'bonds', molecule: 'molecule' })[viewMode];
    const topBarTabs: TopBarTab[] = [
        { key: 'explore', label: 'Explore', href: `/#mode=${urlMode(lastExploreModeRef.current)}`, current: !isMoleculeMode,
            onSelect: () => handleModeChange(lastExploreModeRef.current) },
        { key: 'molecules', label: 'Molecules', href: '/#mode=molecule', current: isMoleculeMode, onSelect: () => handleModeChange('molecule') },
    ];
    const topBar = (
        <TopBar
            brand={brand}
            mode={themeMode}
            tabs={topBarTabs}
            search={<GlobalSearch sources={searchSources} onPick={handleSearchPick} onWantIndex={wantIndex} />}
            avatar={avatar}
            onHelp={() => setHelpOpen(true)}
            sessionNote={session.expired && !session.signedIn ? SESSION_ENDED : null}
        />
    );
    const phoneTopBar = (compact: boolean) => (
        <PhoneTopBar brand={brand} themeMode={themeMode} mode={atomMode} onModeChange={handleModeChange}
            onOpenSearch={() => setPhoneSearchOpen(true)} avatar={avatar} compact={compact} />
    );
    // A phone held upright: top bar, then the header line under it. Sideways: one merged 44 px line (spec §7).
    const phoneChrome = isNarrow && (
        <>
            {!isPhoneLandscape && phoneTopBar(false)}
            {isAtomMode && (
                <div className="phone-header">
                    {isPhoneLandscape && phoneTopBar(true)}
                    <LevelNav {...levelNavProps} variant="header" />
                </div>
            )}
            {isMoleculeMode && (
                <div className="phone-header">
                    {isPhoneLandscape && phoneTopBar(true)}
                    <MoleculeNav {...moleculeNavProps} variant="header" />
                </div>
            )}
            {isBondsMode && (
                <div className="phone-header">
                    {isPhoneLandscape && phoneTopBar(true)}
                    <span className="bonds-header">
                        {systemFormula(bonds.system)} · {bonds.R !== null ? `R = ${bonds.R.toFixed(2)} a₀`
                            : bondsData.error ? 'not loaded' : 'loading…'}
                    </span>
                </div>
            )}
            {isBasicMode && isPhoneLandscape && <div className="phone-header">{phoneTopBar(true)}</div>}
            <PhoneSheet tabs={phoneTabs} active={phoneTab} onChange={setPhoneTab} />
        </>
    );

    const viewport = (
        <main
            id="canvas-container"
            className={`viewport-cell${canvasBusyLabel ? ' busy' : ''}`}
            data-busy={isLoading ? 'true' : 'false'}
            aria-label="3D view"
            tabIndex={-1}
        >
            {/* …every element that was inside the old <Box id="canvas-container">, in the same order,
                from <OrbitalViewer …/> to the <Snackbar>…</Snackbar>, except the old isNarrow ? … : …
                panel block, which is replaced by the two lines below… */}
            {phoneChrome}
            {isMedium && (
                <Inspector variant="drawer" body={inspectorBody} open={viewPanelOpen}
                    onOpenChange={open => setViewPanelOpen(() => open)} />
            )}
        </main>
    );

    return (
        <>
            <AppShell
                layout={layout}
                wide={isWide}
                topBar={topBar}
                rail={<Rail mode={atomMode} onModeChange={handleModeChange} isOwner={isOwner} wide={isWide} />}
                explore={<ExplorePanel body={exploreContent} />}
                inspector={<Inspector variant="docked" body={inspectorBody} />}
                viewport={viewport}
            />
            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} brand={brand}
                aboutModel={isBasicMode ? <p>{BASIC_ORBITALS_ABOUT}</p> : undefined} />
            {isNarrow && (
                <Dialog fullScreen open={phoneSearchOpen} onClose={() => setPhoneSearchOpen(false)} aria-label="Search">
                    <div className="phone-search-sheet">
                        <IconButton aria-label="close search" onClick={() => setPhoneSearchOpen(false)}><Close fontSize="small" /></IconButton>
                        <GlobalSearch variant="sheet" autoFocus sources={searchSources} onWantIndex={wantIndex}
                            onPick={action => { setPhoneSearchOpen(false); handleSearchPick(action); }} />
                    </div>
                </Dialog>
            )}
        </>
    );
```

(The `{/* … */}` comment in the block above is an instruction to the implementer, not code to paste: move today's children of the old `Box` into the `<main>` verbatim — `OrbitalViewer`, the busy notice, both unbound notes, the phase legend, the molecule legend stack, `moleculeAlert`, the density key, the combination key, the `PeriodicTable`, the two picker dialogs, the solver alert, the sign-in alert and the `Snackbar` — and delete the comment.)

`BASIC_ORBITALS_ABOUT`: in `src/components/Controls.tsx` export the Basic Orbitals note as a constant and use it in the existing `FormHelperText` (so the text is defined once):

```tsx
/** Spec §7's one-electron framing, said under the Basic Orbitals controls and in Help. */
export const BASIC_ORBITALS_ABOUT = 'One electron, Z = 1 — the exact solution, and the idealised shape every multi-electron orbital '
  + 'is a distortion of. Pick an element in Atom mode for a real, many-electron atom.';
```

and import it in `App.tsx` with `Controls`: `import Controls, { RelativityReadout, BASIC_ORBITALS_ABOUT } from './components/Controls';`.

7. Remove the now-unused `Box` import if nothing else uses it.

- [ ] **Step 6: The stylesheet stops floating the panels**

In `src/style.css`:
- `:root`: `--phone-overlay-top: 112px;` and `--phone-legend-stack-top: 156px;` (both grow by the 52 px top bar, spec §9.8), with the comment updated.
- `html, body, #root` keep; `#root` keep. `#canvas-container`: delete `flex-grow`, `width`, `min-height` and their comments (the grid sizes the cell); keep `overflow: hidden`, `position: relative` and the token background.
- Delete the rules `.side-panel { position: absolute; … }`, `.side-panel > *`, `.view-panel-toggle`, `.view-panel { position: absolute; … }`, `.view-panel > *`, and the desktop media query that sets `.view-panel #controls` / `.view-panel .radial-plot` / `.view-panel .radial-plot.collapsed` widths. Keep the rule `.side-panel .level-nav` but delete its `max-height`, `overflow-y`, `padding`, `border-radius` and `box-shadow` declarations (its two colour declarations stay: Task 3's contrast test reads them); delete the media query that resets its `max-height`.
- Inside the phone media query: `.phone-header { … top: 8px; … }` → `top: calc(var(--ql-size-phone-top-bar) + 8px);`. Inside the `@media (max-height: 500px)` block add `.phone-header { top: 8px; display: flex; align-items: center; gap: 4px; }` (sideways the top bar merges into the header line).

- [ ] **Step 7: Run the tests**

Run: `npx jest tests/shell tests/view_insets.test.ts tests/orbital_viewer.test.tsx src/components/Controls.test.tsx` → PASS. Then the App suites: `npx jest src/App.test.tsx src/App.jobs.test.tsx tests/App.molecules.test.tsx tests/app_combination_selection.test.tsx` → PASS. Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `npm run check:admin-split`.

If an App test fails because an element moved, fix the app, not the test, unless the test asserted the Mode toggle's place (Step 1 lists every such change). Never loosen a behavioural assertion.

- [ ] **Step 8: Live check [visual] (expect ~6 min)**

```bash
node tools/design/shoot.mjs --task T8 --scenes c-whole,basic-3dz2,bonds-n2,water --themes dark,light --sizes desktop,phone
node tools/design/shoot.mjs --task T8m --scenes c-whole --themes dark --sizes tablet,wide,phone-landscape
```

Write `/tmp/6g1-T8-checklist.md`. This task owns: *Spacing* (from `metrics.boxes`: `.app-topbar` height 56; `.app-rail` width 76 (184 at `wide`); `.explore-panel` width 315 and x = 88; `.inspector` width 290 (320 at `wide`); `#canvas-container` width 711 at 1440; gutters 12 — all ±2 px); *Colours* top bar and rail = `bg-bar`, gutter = `bg-app`, panels = `surface-1` (ΔE₀₀ ≤ 3); *Components* — brand mark and two-tone wordmark, Explore/Molecules tabs with the underline on the current one, search box with the shortcut hint, theme, help and (dev server) avatar icons, rail items with the active pill and cyan halo (dark) / blue edge (light); tablet: inspector folded to a 44 px bar inside the viewport's right edge; phone: 52 px top bar with "Atoms ▾", the header line under it, the sheet; phone sideways: one merged line. *Science*: the Molecules/Bonds/Basic panels show the same text as before this task. `metrics.insets` at desktop has `left: 0` and `right: 0` (nothing covers the canvas yet but the table). Not yet owned: title block, toolbar, key column, strip (Tasks 9, 16), the transparent canvas (Task 14).

- [ ] **Step 9: Commit**

```bash
git add src/shell/AppShell.tsx src/shell/app_shell.css src/shell/TabRow.tsx src/shell/tabs.css src/shell/ExplorePanel.tsx src/shell/explore.css src/shell/Inspector.tsx src/shell/inspector.css src/shell/PhoneTopBar.tsx src/shell/phone_top_bar.css src/App.tsx src/components/Controls.tsx src/useMediaQuery.ts src/useViewInsets.ts src/components/OrbitalViewer.tsx src/style.css tests/shell/app_shell.test.tsx tests/shell/inspector.test.tsx tests/view_insets.test.ts src/App.test.tsx src/App.jobs.test.tsx tests/App.molecules.test.tsx src/components/Controls.test.tsx tests/orbital_viewer.test.tsx
git commit -m "feat(shell): the workstation grid -- top bar with search, mode rail, docked Explore and inspector, medium drawer, phone top bar (Phase 6G-1)" -m "Today's panels sit in the new slots for every mode; the Mode toggle moved to the rail and the phone's mode menu; insets now count the viewport's own overlay zones." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/shell/AppShell.tsx src/shell/app_shell.css src/shell/TabRow.tsx src/shell/tabs.css src/shell/ExplorePanel.tsx src/shell/explore.css src/shell/Inspector.tsx src/shell/inspector.css src/shell/PhoneTopBar.tsx src/shell/phone_top_bar.css src/App.tsx src/components/Controls.tsx src/useMediaQuery.ts src/useViewInsets.ts src/components/OrbitalViewer.tsx src/style.css tests/shell/app_shell.test.tsx tests/shell/inspector.test.tsx tests/view_insets.test.ts src/App.test.tsx src/App.jobs.test.tsx tests/App.molecules.test.tsx src/components/Controls.test.tsx tests/orbital_viewer.test.tsx
```

---

### Task 9: Viewport frame — title block, toolbar, key column, document title [visual]

**Estimate:** 90 min. **Spec:** §8.5 (zones table, Fullscreen), §5 (`document.title`), §9.1 "Viewport" (title wording), §10 (`Controls` Reset View and `ShareExportBar` move to the toolbar; `Controls`' `actions` slot goes). Ruling R6 (no toolbar on a phone).

**Files:**
- Create: `src/shell/view_title.ts`, `src/shell/TitleBlock.tsx`, `src/shell/ViewportToolbar.tsx`, `src/shell/KeyColumn.tsx`, `src/shell/viewport.css`, `src/shell/useDocumentTitle.ts`, `src/shell/useFullscreen.ts`
- Modify: `src/components/ShareExportBar.tsx` (`variant="toolbar"` + Snapshot), `src/components/Controls.tsx` (Reset View and `actions` leave), `src/App.tsx`, `src/style.css` (the keys' old floating positions)
- Test: `tests/shell/view_title.test.ts`, `tests/shell/viewport_toolbar.test.tsx`, `tests/shell/key_column.test.tsx`, `tests/shell/use_fullscreen.test.tsx`; update `tests/share_export_bar.test.tsx` (new cases only), `src/components/Controls.test.tsx` (drop `onResetView` from `baseProps` and line 37)

**Interfaces:**
- Consumes: `RootState`; `speciesOf`, `profileRelativity` (`src/store/atomSlice.ts`); `speciesTitle` (`src/atom/species.ts`); `subshellLabel` (`src/atom/configurations.ts`); `orbitalName`; `selectShownBasicOrbital`, `selectShownEnclosedFraction` (`src/store/orbitalSlice.ts`); `combinationTitle` (`src/combinations.ts`); `BONDS_SYSTEMS`; `viewDescription`, `moleculeTitle` (`src/export/caption.ts`); `useBrand` (Task 4); `AppShell`'s `shellRef`/`fullscreen` props (Task 8).
- Produces:
  - `viewTitle(state: RootState): { title: string; subtitle: string }` and `shellName(n: number): string` ("L shell").
  - `TitleBlock` props `{ title: string; subtitle: string; children?: React.ReactNode }` → `<div class="viewport-title"><h1>…</h1><p class="viewport-subtitle">…</p></div>` (the page's only `h1`).
  - `ViewportToolbar` props `{ onResetView(): void; shareExport: React.ReactNode; fullscreen: boolean; onToggleFullscreen(): void }` → `<div class="viewport-toolbar" role="toolbar" aria-label="View tools">`.
  - `KeyColumn` props `{ compact?: boolean; children: React.ReactNode }` → `<div class="key-column" role="group" aria-label="colour keys">`; `PhaseKey` props `{ positive?: string; negative?: string }` → `<div class="phase-legend" aria-label="surface colour key">` with "ψ > 0" and "ψ < 0" (without colour props it uses today's CSS swatch classes; Task 12 passes the scheme's colours).
  - `ShareExportBar` prop `variant?: 'bar' | 'toolbar'` (default `'bar'`, today's look); the toolbar variant renders icon buttons named "Snapshot", "Share" and "Export" (same ids `share-view`, `export-view`).
  - `useDocumentTitle(title: string): void`; `useFullscreen(target: React.RefObject<HTMLElement | null>): { active: boolean; toggle(): void }`.

- [ ] **Step 1: Write the failing tests**

`tests/shell/view_title.test.ts`:

```ts
import { drillToOrbital, drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { viewTitle } from '../../src/shell/view_title';
import { neonStore, sodiumIonStore } from '../export/fixtures';

describe('viewTitle (spec §9.1 "Viewport")', () => {
    it('names the species and the level, and states what is drawn and how', () => {
        const store = neonStore();
        expect(viewTitle(store.getState())).toEqual({
            title: 'Neon — whole atom',
            subtitle: '90 % of the electron density enclosed · LDA, non-relativistic',
        });
        store.dispatch(drillToShell(2));
        expect(viewTitle(store.getState()).title).toBe('Neon — L shell');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewTitle(store.getState()).title).toBe('Neon — 2p');
        store.dispatch(drillToOrbital(2, 1, 0));
        expect(viewTitle(store.getState())).toEqual({
            title: 'Neon — 2p_z orbital',
            subtitle: '|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic',
        });
    });

    it('names an ion as its species', () => {
        expect(viewTitle(sodiumIonStore().getState()).title).toBe('Sodium ion Na⁺ — whole atom');
    });

    it('titles Basic Orbitals and an empty Molecules view honestly', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        // The default Basic selection is 3d_z² (orbitalSlice DEFAULT_BASIC_SELECTION).
        expect(viewTitle(store.getState()).title).toBe('Hydrogen — 3d_z² orbital');
        store.dispatch(setMode('molecule'));
        expect(viewTitle(store.getState())).toEqual({ title: 'Molecules', subtitle: 'Choose a molecule' });
    });
});
```

`tests/shell/key_column.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import KeyColumn, { PhaseKey } from '../../src/shell/KeyColumn';

describe('KeyColumn (spec §8.5, §11.5)', () => {
    it('groups the colour keys, each with text', () => {
        render(<KeyColumn><PhaseKey /></KeyColumn>);
        const group = screen.getByRole('group', { name: 'colour keys' });
        expect(group).toHaveClass('key-column');
        expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ψ > 0ψ < 0');
    });

    it('paints the swatches in the colours it is given', () => {
        const { container } = render(<KeyColumn><PhaseKey positive="#FF7A2F" negative="#2F6BFF" /></KeyColumn>);
        const swatches = container.querySelectorAll<HTMLElement>('.phase-legend-swatch');
        expect(swatches[0].style.background).toBe('rgb(255, 122, 47)');
        expect(swatches[1].style.background).toBe('rgb(47, 107, 255)');
    });
});
```

`tests/shell/viewport_toolbar.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewportToolbar from '../../src/shell/ViewportToolbar';
import TitleBlock from '../../src/shell/TitleBlock';

describe('the viewport frame (spec §8.5)', () => {
    it('titles the view with the page heading', () => {
        render(<TitleBlock title="Carbon — 2p_z orbital" subtitle="|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic" />);
        expect(screen.getByRole('heading', { level: 1, name: 'Carbon — 2p_z orbital' })).toBeInTheDocument();
        expect(screen.getByText('|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic')).toHaveClass('viewport-subtitle');
    });

    it('offers Reset view, the share/export slot and Full screen as a toolbar', () => {
        const onResetView = jest.fn();
        const onToggleFullscreen = jest.fn();
        const { rerender } = render(<ViewportToolbar onResetView={onResetView} shareExport={<button>Share</button>} fullscreen={false} onToggleFullscreen={onToggleFullscreen} />);
        expect(screen.getByRole('toolbar', { name: 'View tools' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
        expect(onResetView).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
        expect(onToggleFullscreen).toHaveBeenCalled();
        rerender(<ViewportToolbar onResetView={onResetView} shareExport={null} fullscreen onToggleFullscreen={onToggleFullscreen} />);
        expect(screen.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true');
    });
});
```

`tests/shell/use_fullscreen.test.tsx`:

```tsx
import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFullscreen } from '../../src/shell/useFullscreen';

function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const { active, toggle } = useFullscreen(ref);
    return <div ref={ref}><button onClick={toggle}>toggle</button><span>{active ? 'on' : 'off'}</span></div>;
}

describe('useFullscreen (spec §8.5)', () => {
    it('falls back to focus mode where element full screen does not exist (iPhone Safari), and Esc leaves it', () => {
        render(<Probe />);
        act(() => screen.getByText('toggle').click());
        expect(screen.getByText('on')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText('off')).toBeInTheDocument();
    });
});
```

(jsdom has no `requestFullscreen` and `document.fullscreenEnabled` is undefined, so this exercises the focus-mode path.)

`tests/share_export_bar.test.tsx` — add:

```tsx
describe('ShareExportBar as the viewport toolbar (spec §8.5)', () => {
    it('names its icon buttons as the bar did, and Snapshot exports the captioned PNG directly', async () => {
        const onExport = jest.fn().mockResolvedValue(undefined);
        render(<ShareExportBar variant="toolbar" onShare={jest.fn()} onExport={onExport} availability={null} />);
        expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('id', 'share-view');
        expect(screen.getByRole('button', { name: 'Export' })).toHaveAttribute('id', 'export-view');
        fireEvent.click(screen.getByRole('button', { name: 'Snapshot' }));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('png', {}));
    });
});
```

(If the file does not already import `waitFor` and `fireEvent`, add them to its `@testing-library/react` import. If its existing props helper passes `availability` differently, pass whatever the file's other tests pass for "everything available".)

Run: `npx jest tests/shell tests/share_export_bar.test.tsx`
Expected: FAIL — modules missing; no `variant` on ShareExportBar.

- [ ] **Step 2: Write `src/shell/view_title.ts`**

```ts
import type { RootState } from '../store';
import { profileRelativity, speciesOf } from '../store/atomSlice';
import { selectShownBasicOrbital, selectShownEnclosedFraction } from '../store/orbitalSlice';
import { speciesTitle } from '../atom/species';
import { subshellLabel } from '../atom/configurations';
import type { RelativityMode } from '../atom/relativity';
import { orbitalName } from '../orbital_names';
import { combinationTitle } from '../combinations';
import { BONDS_SYSTEMS } from '../bonds/systems';
import { moleculeTitle, viewDescription } from '../export/caption';

const SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

/** "L shell": the X-ray letter, as the breadcrumb and the strip name shells. */
export function shellName(n: number): string {
    return `${SHELL_LETTERS[n - 1] ?? `n = ${n}`} shell`;
}

/** The drawn profile's method (ruling C9: the picture's mode, not the switch's). */
const METHOD: Record<RelativityMode, string> = {
    off: 'LDA, non-relativistic',
    scalar: 'LDA, scalar-relativistic',
    spinOrbit: 'LDA, with spin–orbit',
};

export interface ViewTitle {
    title: string;
    subtitle: string;
}

/**
 * The viewport's title block (spec §8.5, §9.1): "<Species> — <level>", and a
 * subtitle that says what is drawn, at which enclosed fraction, by which
 * method. Basic, Bonds and Molecules get an honest title from the state they
 * already show; their re-composed titles are 6G-2's.
 */
export function viewTitle(state: RootState): ViewTitle {
    const percent = `${Math.round(selectShownEnclosedFraction(state) * 100)} %`;
    const atom = state.atom;
    if (atom.mode === 'atom') {
        const orbital = atom.selectedOrbital;
        const subshell = atom.selectedSubshell;
        const level = atom.level === 'orbital' && orbital
            ? `${orbitalName(orbital.n, orbital.l, orbital.ml)} orbital${orbital.j === undefined ? '' : ` · ${subshellLabel(orbital.n, orbital.l, orbital.j)}`}`
            : atom.level === 'shell' && subshell ? subshellLabel(subshell.n, subshell.l, subshell.j)
            : atom.level === 'shell' && atom.selectedShell !== null ? shellName(atom.selectedShell)
            : 'whole atom';
        const method = METHOD[atom.profile ? profileRelativity(atom.profile) : 'off'];
        const drawn = atom.unbound ? 'nothing is drawn for this species'
            : atom.level === 'orbital' ? `|ψ|² isosurface · ${percent} enclosed`
            : `${percent} of the electron density enclosed`;
        return { title: `${speciesTitle(speciesOf(atom))} — ${level}`, subtitle: `${drawn} · ${method}` };
    }
    if (atom.mode === 'hydrogenic') {
        const combination = state.orbital.combination;
        const shown = selectShownBasicOrbital(state);
        const title = combination.kind !== 'none'
            ? `Hydrogen — ${combinationTitle(combination)}`
            : `Hydrogen — ${orbitalName(shown.n, shown.l, shown.ml)} orbital`;
        return { title, subtitle: `|ψ|² isosurface · ${percent} enclosed · exact one-electron solution, Z = 1` };
    }
    if (atom.mode === 'bonds') {
        const system = BONDS_SYSTEMS.find(entry => entry.id === state.bonds.system);
        return { title: system ? `${system.formula} — ${system.name}` : 'Bonds', subtitle: viewDescription(state) };
    }
    const meta = state.molecule.meta;
    return meta
        ? { title: moleculeTitle(meta), subtitle: viewDescription(state) }
        : { title: 'Molecules', subtitle: 'Choose a molecule' };
}
```

(If `moleculeTitle` is typed for `LibraryMoleculeMeta` and `state.molecule.meta` already is one, no cast is needed; otherwise pass `meta as LibraryMoleculeMeta`, as `caption.ts`'s own callers do.)

- [ ] **Step 3: Write the frame components and hooks**

`src/shell/TitleBlock.tsx`:

```tsx
import React from 'react';
import './viewport.css';

/** The viewport's title block (spec §8.5): the page's h1 and what is drawn, on a canvas scrim. */
const TitleBlock: React.FC<{ title: string; subtitle: string; children?: React.ReactNode }> = ({ title, subtitle, children }) => (
    <div className="viewport-title">
        <h1>{title}</h1>
        <p className="viewport-subtitle">{subtitle}</p>
        {children}
    </div>
);

export default TitleBlock;
```

`src/shell/ViewportToolbar.tsx`:

```tsx
import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import Fullscreen from '@mui/icons-material/Fullscreen';
import FullscreenExit from '@mui/icons-material/FullscreenExit';
import RestartAlt from '@mui/icons-material/RestartAlt';
import './viewport.css';

interface ViewportToolbarProps {
    onResetView(): void;
    /** <ShareExportBar variant="toolbar" …/>: Snapshot, Share and Export. */
    shareExport: React.ReactNode;
    fullscreen: boolean;
    onToggleFullscreen(): void;
}

/** The viewport's top-right toolbar (spec §8.5): 36 px icon buttons with tooltips. */
const ViewportToolbar: React.FC<ViewportToolbarProps> = ({ onResetView, shareExport, fullscreen, onToggleFullscreen }) => {
    const fullscreenLabel = fullscreen ? 'Exit full screen' : 'Full screen';
    return (
        <div className="viewport-toolbar" role="toolbar" aria-label="View tools">
            <Tooltip title="Reset view">
                <IconButton className="viewport-tool" aria-label="Reset view" onClick={onResetView}><RestartAlt fontSize="small" /></IconButton>
            </Tooltip>
            {shareExport}
            <Tooltip title={fullscreenLabel}>
                <IconButton className="viewport-tool" aria-label={fullscreenLabel} aria-pressed={fullscreen} onClick={onToggleFullscreen}>
                    {fullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                </IconButton>
            </Tooltip>
        </div>
    );
};

export default ViewportToolbar;
```

`src/shell/KeyColumn.tsx`:

```tsx
import React from 'react';
import './viewport.css';

/** The right-hand key column (spec §8.5, §11.5): every colour on the view, with text. */
const KeyColumn: React.FC<{ compact?: boolean; children: React.ReactNode }> = ({ compact = false, children }) => (
    <div className={`key-column${compact ? ' compact' : ''}`} role="group" aria-label="colour keys">{children}</div>
);

/**
 * The ψ key. Without colours it uses style.css's swatch classes (today's
 * #e02020 / #2040ff); Task 12 passes the active scheme's colours from
 * science.ts, the one source the PNG legend and the vertex colours share.
 */
export const PhaseKey: React.FC<{ positive?: string; negative?: string }> = ({ positive, negative }) => (
    <div className="phase-legend" aria-label="surface colour key">
        <span className="phase-legend-item">
            <span className="phase-legend-swatch positive" style={positive ? { background: positive } : undefined} />ψ &gt; 0
        </span>
        <span className="phase-legend-item">
            <span className="phase-legend-swatch negative" style={negative ? { background: negative } : undefined} />ψ &lt; 0
        </span>
    </div>
);

export default KeyColumn;
```

`src/shell/viewport.css`:

```css
/* src/shell/viewport.css -- the viewport frame's overlay zones (spec §8.5), each measured as a camera inset. */
.viewport-title {
  position: absolute; z-index: 11; top: 12px; left: 12px; max-width: calc(100% - 280px);
  padding: 10px 14px; border-radius: var(--ql-radius-lg);
  background: var(--ql-color-scrim); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
}
.viewport-title h1 {
  margin: 0; color: var(--ql-color-text-1);
  font: var(--ql-type-title-weight) var(--ql-type-title-size) / var(--ql-type-title-line) var(--ql-font-sans);
}
.viewport-subtitle {
  margin: 2px 0 0; color: var(--ql-color-text-2);
  font: var(--ql-type-subtitle-weight) var(--ql-type-subtitle-size) / var(--ql-type-subtitle-line) var(--ql-font-sans);
}
.viewport-toolbar { position: absolute; z-index: 11; top: 12px; right: 12px; display: flex; gap: 6px; }
.viewport-toolbar .MuiIconButton-root {
  width: var(--ql-size-toolbar-button); height: var(--ql-size-toolbar-button);
  border-radius: var(--ql-radius-md); color: var(--ql-color-text-1);
  background: color-mix(in srgb, var(--ql-color-surface-2) 80%, transparent);
  border: 1px solid var(--ql-color-border-subtle);
}
.viewport-toolbar .MuiIconButton-root:hover { background: var(--ql-color-surface-3); }
.key-column {
  position: absolute; z-index: 10; right: 12px; top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: stretch; gap: 8px; max-width: 220px;
}
/* Inside the column the keys are chips in the flow, not floating overlays of their own. */
.key-column .phase-legend, .key-column .density-key {
  position: static; transform: none; left: auto; right: auto; top: auto; bottom: auto;
  flex-direction: column; align-items: flex-start; gap: 6px; padding: 8px 10px;
  border-radius: var(--ql-radius-md); background: var(--ql-color-surface-2); color: var(--ql-color-text-1);
}
.key-column.compact { top: calc(var(--phone-overlay-top) + 4px); transform: none; }
.key-column.compact .phase-legend { flex-direction: row; padding: 4px 8px; font-size: var(--ql-type-caption-size); }
```

`src/shell/useDocumentTitle.ts`:

```ts
import { useEffect } from 'react';

/** "<view title> · <brand>" in the viewer (spec §5). */
export function useDocumentTitle(title: string): void {
    useEffect(() => { document.title = title; }, [title]);
}
```

`src/shell/useFullscreen.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

/**
 * Full screen for the app shell (spec §8.5): the Fullscreen API where the
 * browser has it; iPhone Safari has no element full screen, so there it is
 * "focus mode" -- the panels collapse. Esc leaves either.
 */
export function useFullscreen(target: React.RefObject<HTMLElement | null>): { active: boolean; toggle(): void } {
    const [native, setNative] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    useEffect(() => {
        const onChange = () => setNative(Boolean(document.fullscreenElement) && document.fullscreenElement === target.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, [target]);

    useEffect(() => {
        if (!focusMode) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocusMode(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [focusMode]);

    const toggle = useCallback(() => {
        const element = target.current;
        if (native) { void document.exitFullscreen?.(); return; }
        if (focusMode) { setFocusMode(false); return; }
        if (element && document.fullscreenEnabled && typeof element.requestFullscreen === 'function') {
            element.requestFullscreen().catch(() => setFocusMode(true));
        } else {
            setFocusMode(true);
        }
    }, [target, native, focusMode]);

    return { active: native || focusMode, toggle };
}
```

- [ ] **Step 4: ShareExportBar's toolbar variant; Controls loses Reset View and `actions`**

In `src/components/ShareExportBar.tsx`:
- add to the props interface: `/** 'toolbar' is the viewport's icon row (spec §8.5): Snapshot, Share, Export; 'bar' is today's text buttons (the phone's View tab). */ variant?: 'bar' | 'toolbar';` and destructure `variant = 'bar'`.
- add imports: `IconButton, Tooltip` from `@mui/material`; `CameraAltOutlined`, `LinkOutlined`, `FileDownloadOutlined` from `@mui/icons-material/…`.
- replace the opening `<Box className="share-export-bar" sx={{ mt: 1.5, display: 'flex', gap: 1 }}>` and the Share and Export `Button`s with:

```tsx
        <Box className={`share-export-bar ${variant}`} sx={variant === 'bar' ? { mt: 1.5, display: 'flex', gap: 1 } : { display: 'contents' }}>
            {variant === 'toolbar' && onExport && (
                <Tooltip title={availability?.png ?? 'Snapshot (PNG with caption)'}>
                    {/* A span keeps the tooltip on a disabled button. */}
                    <span>
                        <IconButton className="viewport-tool" aria-label="Snapshot" disabled={exporting || Boolean(availability?.png)}
                            onClick={() => { void runKind('png'); }}>
                            <CameraAltOutlined fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            )}
            {variant === 'toolbar' ? (
                <Tooltip title="Share link">
                    <IconButton id="share-view" className="viewport-tool" aria-label="Share" onClick={handleShare}><LinkOutlined fontSize="small" /></IconButton>
                </Tooltip>
            ) : (
                <Button id="share-view" variant="outlined" onClick={handleShare}>Share</Button>
            )}
            {onExport && (
                <>
                    {variant === 'toolbar' ? (
                        <Tooltip title="Export">
                            <IconButton id="export-view" className="viewport-tool" aria-label="Export" aria-haspopup="menu"
                                aria-controls={menuAnchor ? 'export-menu' : undefined} aria-expanded={menuAnchor !== null}
                                disabled={exporting} onClick={event => setMenuAnchor(event.currentTarget)}>
                                <FileDownloadOutlined fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Button id="export-view" variant="outlined" aria-haspopup="menu" aria-controls={menuAnchor ? 'export-menu' : undefined}
                            aria-expanded={menuAnchor !== null} disabled={exporting} onClick={event => setMenuAnchor(event.currentTarget)}>
                            Export
                        </Button>
                    )}
```

keeping the existing `<Menu …>` and everything after it exactly as it is (the closing `</>` and `)}` of the `onExport &&` block stay where they were). `runKind(kind, options = {})` already exists (`handleItem` calls it), so `runKind('png')` calls `onExport('png', {})`, as the test expects.

In `src/components/Controls.tsx`: delete `onResetView` and `actions` from `ControlsProps` and the destructuring; delete the `<Box className="controls-actions" …>` block (Reset View and Update Orbital share it: keep the Update Orbital `Button` and its condition, inside `<Box className="controls-actions" sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>` without the Reset View button), and delete `{actions}`. In `src/components/Controls.test.tsx` delete `onResetView: () => {},` from `baseProps` and `onResetView={() => {}}` at line 37, with the comment `// Reset View moved to the viewport toolbar (spec §8.5).`

- [ ] **Step 5: App places the frame**

In `src/App.tsx`:

```tsx
import TitleBlock from './shell/TitleBlock';
import ViewportToolbar from './shell/ViewportToolbar';
import KeyColumn, { PhaseKey } from './shell/KeyColumn';
import { viewTitle } from './shell/view_title';
import { useDocumentTitle } from './shell/useDocumentTitle';
import { useFullscreen } from './shell/useFullscreen';
```

After `const brand = useBrand();`:

```tsx
    const { title: viewTitleText, subtitle: viewSubtitle } = useAppSelector(viewTitle, shallowEqual);
    useDocumentTitle(`${viewTitleText} · ${brand.name}`);
    const shellRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(shellRef);
```

Next to `shareExportBar`, add the toolbar's copy (desktop) — same handlers:

```tsx
    const shareExportToolbar = useMemo(
        () => (
            <ShareExportBar variant="toolbar" onShare={handleShare} onExport={handleExport} availability={availability}
                stlSolids={stlSolids} items={exportItemsFor(atomMode)} />
        ),
        [handleShare, handleExport, availability, stlSolids, atomMode]
    );
```

Remove `onResetView={handleResetView}` and `actions={controlsActions}` from `<Controls>`, and delete `controlsActions`. The phone's View tab keeps Reset and Share/Export at its end (ruling R6): define

```tsx
    // A phone has no viewport toolbar (ruling R6): Reset view, Share and Export end the View tab, as before.
    const phoneViewActions = (
        <div className="view-actions">
            <Button id="reset-view" variant="outlined" onClick={handleResetView}>Reset view</Button>
            {shareExportBar}
        </div>
    );
```

and in `phoneTabs` replace every `content: controls` with `content: <>{controls}{phoneViewActions}</>`. Add to `src/style.css`: `.view-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }`.

Replace the old floating `{showPhaseLegend && !isMoleculeMode && phaseLegend}`, the `{isBondsDensity && (…density-key…)}` block and the `{combinationLegend && (…)}` block inside the viewport with one key column (same markup and labels as before, so `getByLabelText('surface colour key')`, `'combination colour key'` and the density wording keep working), and delete the old `phaseLegend` constant:

```tsx
            {!isMoleculeMode && (showPhaseLegend || isBondsDensity || combinationLegend) && (
                <KeyColumn compact={isNarrow}>
                    {showPhaseLegend && <PhaseKey />}
                    {isBondsDensity && (
                        <div className="phase-legend density-key" aria-label="surface colour key">
                            <span className="phase-legend-item">
                                <span className="phase-legend-swatch" style={{ background: DENSITY_SURFACE_HEX }} />
                                ρ = {drawnDensityIso} e/a₀³, total electron density
                            </span>
                        </div>
                    )}
                    {combinationLegend && (
                        <div className="phase-legend" aria-label="combination colour key">
                            {combinationLegend.map(item => (
                                <span key={item.label} className="phase-legend-item">
                                    <span className="phase-legend-swatch" style={{ background: item.color }} />{item.label}
                                </span>
                            ))}
                            <span className="phase-legend-item">darker: ψ &lt; 0</span>
                        </div>
                    )}
                </KeyColumn>
            )}
```

Inside the molecule legend stack, `{showPhaseLegend && phaseLegend}` becomes `{showPhaseLegend && <PhaseKey />}` (Molecules keeps its stack until 6G-2).

At the top of the viewport's children, right after `<OrbitalViewer …/>`:

```tsx
            {!isNarrow && <TitleBlock title={viewTitleText} subtitle={viewSubtitle} />}
            {!isNarrow && (
                <ViewportToolbar onResetView={handleResetView} shareExport={shareExportToolbar}
                    fullscreen={fullscreen.active} onToggleFullscreen={fullscreen.toggle} />
            )}
```

and pass `shellRef={shellRef} fullscreen={fullscreen.active}` to `<AppShell>`.

In `src/style.css`, the phone media query's `.phase-legend { top: 62px; … right: 12px; … }` and the landscape `.phase-legend { right: calc(46vw + 12px); }` now apply to a chip inside `.key-column.compact`: change the selector of both to `.key-column.compact` and keep their values (the column, not each key, sits under the header; landscape keeps it clear of the sheet).

- [ ] **Step 6: Run the tests**

Run: `npx jest tests/shell tests/share_export_bar.test.tsx src/components/Controls.test.tsx` → PASS; then `npx jest src/App.test.tsx src/App.jobs.test.tsx tests/App.molecules.test.tsx tests/app_combination_selection.test.tsx` → PASS (Share is now the toolbar's icon button, same name; the keys keep their labels). Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `npm run check:admin-split`.

- [ ] **Step 7: Live check [visual] (expect ~4 min)**

```bash
node tools/design/shoot.mjs --task T9 --scenes c-whole,c-2pz,fe-shell,water --themes dark,light --sizes desktop,phone
```

Checklist `/tmp/6g1-T9-checklist.md`. Owned here: the title block (top-left, scrim, title 20/600 `text-1`, subtitle 13 `text-2`; `metrics.fonts.title` = 20px/600 Inter), the toolbar (five 36 px square icon buttons top-right), the key column (right, vertically centred, chips on `surface-2`), `metrics.title` = "Carbon — 2p_z orbital · QuantumLab" for `c-2pz`; `metrics.insets.top` ≥ the title block's bottom and `metrics.insets.right` ≥ the key column's width at desktop; on a phone no title block or toolbar, Reset/Share/Export at the end of the View tab. Compare the title and toolbar with concept A/B's ("Carbon – 2pz orbital" top-left, icon buttons top-right). Science: the subtitle's fraction equals the Electron-enclosed select's value; key wording unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/shell/view_title.ts src/shell/TitleBlock.tsx src/shell/ViewportToolbar.tsx src/shell/KeyColumn.tsx src/shell/viewport.css src/shell/useDocumentTitle.ts src/shell/useFullscreen.ts src/components/ShareExportBar.tsx src/components/Controls.tsx src/components/Controls.test.tsx src/App.tsx src/style.css tests/shell/view_title.test.ts tests/shell/viewport_toolbar.test.tsx tests/shell/key_column.test.tsx tests/shell/use_fullscreen.test.tsx tests/share_export_bar.test.tsx
git commit -m "feat(shell): viewport frame -- title block, toolbar with snapshot/share/export/full screen, key column, document title (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/shell/view_title.ts src/shell/TitleBlock.tsx src/shell/ViewportToolbar.tsx src/shell/KeyColumn.tsx src/shell/viewport.css src/shell/useDocumentTitle.ts src/shell/useFullscreen.ts src/components/ShareExportBar.tsx src/components/Controls.tsx src/components/Controls.test.tsx src/App.tsx src/style.css tests/shell/view_title.test.ts tests/shell/viewport_toolbar.test.tsx tests/shell/key_column.test.tsx tests/shell/use_fullscreen.test.tsx tests/share_export_bar.test.tsx
```

---

### Task 10: Atom Explore — element tile, atomic weights, pickers, breadcrumb, Configuration and Orbitals tabs [visual]

**Estimate:** 2 h. **Spec:** §9.1 "Explore header" and tabs 1–2 (tab 3, Display, is Task 11), §10 rows `LevelNav`, `SpeciesControls`, `SubshellPanel`, `PeriodicTable`, `ElementPickerDialog`, `Controls` Relativity. The phone keeps today's Explore body (`LevelNav variant="body"`) and gains the Relativity switch there (spec §9.8: "Explore holds the left panel's tabs as sections").

**Files:**
- Create: `src/atomic_weights.ts`, `src/atom_ui/ElementTile.tsx`, `src/atom_ui/element_tile.css`, `src/atom_ui/AtomExplore.tsx`, `src/atom_ui/OrbitalEnergyList.tsx`
- Modify: `src/components/LevelNav.tsx` (variants `crumbs`, `configuration`, `about`), `src/components/SubshellPanel.tsx` (`part`), `src/components/Controls.tsx` (export `RelativityControl`), `src/components/ElementPickerDialog.tsx` (`variant="popover"`), `src/App.tsx`, `src/style.css` (periodic table as a popover under the tile)
- Test: `tests/atomic_weights.test.ts`, `tests/atom_ui/element_tile.test.tsx`, `tests/atom_ui/atom_explore.test.tsx`; additions to `tests/atom/level_nav.test.tsx` and `tests/atom/subshell_panel.test.tsx`; updates in `src/App.test.tsx` listed in Step 1

**Interfaces:**
- Consumes: `ExplorePanel`, `ExploreTab` (Task 8); `elementFor` (`src/elements.ts`); `speciesSymbol`, `AtomSpecies` (`src/atom/species.ts`); `SerialisedSubshell`; `subshellLabel`, `subshellSpokenLabel`; `shortMethodLabel`, `RelativityMode`; `formatElectrons` (`SubshellPanel.tsx`).
- Produces:
  - `atomic_weights.ts`: `ATOMIC_WEIGHTS: readonly string[]` (index Z − 1); `atomicWeightLabel(Z: number): string`; `ATOMIC_WEIGHT_SOURCE: string`.
  - `ElementTile` props `{ species: AtomSpecies; tableOpen: boolean; onOpenTable(): void; onToggleTable(): void; onOpenList(anchor: HTMLElement): void }`; the tile is a button named `change element, currently <Name>` (or `… currently Na⁺ · Sodium` for a species), as LevelNav's element button was; "Periodic Table" button (`aria-pressed`); "Choose an element from a list" (▾).
  - `AtomExplore` props `{ header: React.ReactNode; configuration: React.ReactNode; orbitals: React.ReactNode; display: React.ReactNode }` → `ExplorePanel` with tabs Configuration / Orbitals / Display.
  - `OrbitalEnergyList` props `{ subshells: SerialisedSubshell[]; relativity: RelativityMode }`.
  - `LevelNav` `variant?: 'full' | 'header' | 'body' | 'crumbs' | 'configuration' | 'about'`.
  - `SubshellPanel` `part?: 'all' | 'chips' | 'diagram'` (default `'all'`, today's panel).
  - `RelativityControl` (named export of `Controls.tsx`), props `{ relativity: RelativityMode; relativityIsDefault: boolean; onRelativityChange(mode: RelativityMode): void; relativityReadout: RelativityReadout | null }` — today's markup, unchanged.
  - `ElementPickerDialog` `variant?: 'dialog' | 'popover'`, `anchorEl?: HTMLElement | null`.

- [ ] **Step 1: Write the failing tests and update the App tests**

`tests/atomic_weights.test.ts`:

```ts
import { ATOMIC_WEIGHTS, ATOMIC_WEIGHT_SOURCE, atomicWeightLabel } from '../src/atomic_weights';

describe('standard atomic weights (spec §9.1)', () => {
    it('has all 118, pinned where the spec pins them', () => {
        expect(ATOMIC_WEIGHTS).toHaveLength(118);
        expect(atomicWeightLabel(6)).toBe('12.011');
        expect(atomicWeightLabel(26)).toBe('55.845');
        expect(atomicWeightLabel(43)).toBe('[98]');
        expect(atomicWeightLabel(118)).toBe('[294]');
    });
    it('is a decimal or a bracketed mass number, and names its source', () => {
        for (const weight of ATOMIC_WEIGHTS) expect(weight).toMatch(/^\d+\.\d+$|^\[\d+\]$/);
        expect(ATOMIC_WEIGHT_SOURCE).toMatch(/IUPAC CIAAW 2021/);
    });
});
```

`tests/atom_ui/element_tile.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ElementTile from '../../src/atom_ui/ElementTile';

const props = { tableOpen: false, onOpenTable: jest.fn(), onToggleTable: jest.fn(), onOpenList: jest.fn() };

describe('ElementTile (spec §9.1)', () => {
    it('shows Z, the electron count, the symbol, the name and the standard weight', () => {
        render(<ElementTile {...props} species={{ Z: 6, charge: 0, excitation: null }} />);
        const tile = screen.getByRole('button', { name: 'change element, currently Carbon' });
        expect(tile).toHaveTextContent('6');
        expect(tile).toHaveTextContent('6 e⁻');
        expect(tile).toHaveTextContent('Carbon');
        expect(tile).toHaveTextContent('12.011');
        expect(tile.getAttribute('title')).toMatch(/IUPAC CIAAW 2021/);
    });

    it('reads an ion: Na⁺ with 11 protons and 10 electrons', () => {
        render(<ElementTile {...props} species={{ Z: 11, charge: 1, excitation: null }} />);
        const tile = screen.getByRole('button', { name: 'change element, currently Na⁺ · Sodium' });
        expect(tile).toHaveTextContent('10 e⁻');
        expect(tile.querySelector('.element-tile-symbol')).toHaveTextContent('Na⁺');
    });

    it('opens the periodic table from the tile or its button, and the list from ▾', () => {
        const onOpenTable = jest.fn();
        const onToggleTable = jest.fn();
        const onOpenList = jest.fn();
        render(<ElementTile species={{ Z: 6, charge: 0, excitation: null }} tableOpen={false}
            onOpenTable={onOpenTable} onToggleTable={onToggleTable} onOpenList={onOpenList} />);
        fireEvent.click(screen.getByRole('button', { name: /^change element/ }));
        expect(onOpenTable).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Periodic Table' }));
        expect(onToggleTable).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Choose an element from a list' }));
        expect(onOpenList).toHaveBeenCalledWith(expect.any(HTMLElement));
    });
});
```

`tests/atom_ui/atom_explore.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtomExplore from '../../src/atom_ui/AtomExplore';
import OrbitalEnergyList from '../../src/atom_ui/OrbitalEnergyList';
import { neonProfile } from '../export/fixtures';

describe('AtomExplore (spec §9.1)', () => {
    it('heads the panel with the subject and tabs Configuration, Orbitals and Display', () => {
        render(<AtomExplore header={<p>tile</p>} configuration={<p>config</p>} orbitals={<p>orbitals</p>} display={<p>display</p>} />);
        expect(screen.getByText('tile')).toBeInTheDocument();
        expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Configuration', 'Orbitals', 'Display']);
        expect(screen.getByRole('tabpanel')).toHaveTextContent('config');
        fireEvent.click(screen.getByRole('tab', { name: 'Orbitals' }));
        expect(screen.getByRole('tabpanel')).toHaveTextContent('orbitals');
    });

    it('lists orbital energies, never as ionisation energies (ruling R19)', () => {
        render(<OrbitalEnergyList subshells={neonProfile().subshells} relativity="off" />);
        const table = screen.getByRole('table', { name: 'orbital energies, whole atom' });
        expect(table).toHaveTextContent('Orbital energies (eigenvalues, Ha), non-relativistic LDA');
        expect(screen.getAllByRole('row')).toHaveLength(4);
        expect(table.textContent).not.toMatch(/ionisation energy/i);
    });
});
```

`tests/atom/level_nav.test.tsx` — append:

```tsx
describe('LevelNav parts for the Explore panel (spec §9.1)', () => {
    const base = { Z: 6, selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 0 }, onNavigate: jest.fn() };

    it('crumbs: the back step and the whole breadcrumb', () => {
        render(<LevelNav {...base} variant="crumbs" />);
        expect(screen.getByRole('button', { name: /Back to 2p/ })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Carbon');
        expect(screen.queryByText(/Valence/)).toBeNull();
    });

    it('configuration: configuration, valence and shell chips, with its children', () => {
        render(<LevelNav {...base} variant="configuration"><span>subshell chips</span></LevelNav>);
        expect(screen.getByText(/1s² 2s² 2p²/)).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'shells' })).toBeInTheDocument();
        expect(screen.getByText('subshell chips')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
    });

    it('about: the method and the model, expanded, with no toggle', () => {
        const { container } = render(<LevelNav {...base} variant="about" />);
        expect(container.querySelector('.level-nav-about')).toHaveTextContent(/central-field model/);
        expect(screen.queryByRole('button', { name: /about this model/i })).toBeNull();
    });
});
```

(Use the file's existing imports of `render`, `screen` and `LevelNav`; add any that are missing.)

`tests/atom/subshell_panel.test.tsx` — append (reuse the file's existing profile/props helper for a shell with several subshells; the names below assume the helper is called `props()` — use whatever the file defines):

```tsx
describe('SubshellPanel parts (spec §9.1: chips in Configuration, the diagram in Orbitals)', () => {
    it('chips: the chip row and the hint, no diagram', () => {
        const { container } = render(<SubshellPanel {...props()} part="chips" />);
        expect(container.querySelector('.subshell-chip-row')).not.toBeNull();
        expect(container.querySelector('.subshell-energy-diagram')).toBeNull();
    });
    it('diagram: the whole-atom energy diagram, no chips', () => {
        const { container } = render(<SubshellPanel {...props()} part="diagram" />);
        expect(container.querySelector('.subshell-energy-diagram')).not.toBeNull();
        expect(container.querySelector('.subshell-chip-row')).toBeNull();
    });
});
```

`src/App.test.tsx` updates (each with a comment citing spec §9.1):
- `'says in About this model that a relativistic picture\'s energies are not'`: replace `fireEvent.click(screen.getByRole('button', { name: /about this model/i }));` with `fireEvent.click(screen.getByRole('tab', { name: 'Orbitals' })); // About is expanded inline in Explore › Orbitals (spec §9.1)`.
- `'sits in the right-hand view panel, at scalar by default for gold'`: rename to `'sits in Explore › Configuration, at scalar by default for gold'` and use `container.querySelector('.side-panel')` instead of `.view-panel` (spec §9.1: Relativity is in Configuration).
- `'is on the View tab of a phone'`: rename to `'is in the Explore tab of a phone'` and click `screen.getByRole('tab', { name: 'Explore' })` instead of `'View'` (spec §9.8: Explore holds the left panel's tabs).
- `"a user cut change made while a link's cut is still pending clears it, …"`: before clicking `'cut along x'`, add `fireEvent.click(screen.getByRole('tab', { name: 'Display' })); // the view controls are Explore › Display (spec §9.1)`.

Run: `npx jest tests/atomic_weights.test.ts tests/atom_ui tests/atom/level_nav.test.tsx tests/atom/subshell_panel.test.tsx`
Expected: FAIL — modules and variants missing.

- [ ] **Step 2: Write `src/atomic_weights.ts`**

```ts
/**
 * Standard atomic weights for the element tile (spec §9.1): IUPAC CIAAW
 * 2021, abridged to five significant figures (fewer where the abridged value
 * is an interval's conventional figure, e.g. Li 6.94); for an element with no
 * standard weight, the mass number of its longest-lived isotope in brackets.
 * Index Z − 1.
 */
export const ATOMIC_WEIGHT_SOURCE = 'Standard atomic weight, IUPAC CIAAW 2021 (abridged); [n]: mass number of the longest-lived isotope';

export const ATOMIC_WEIGHTS: readonly string[] = [
    '1.0080', '4.0026', '6.94', '9.0122', '10.81', '12.011', '14.007', '15.999', '18.998', '20.180',
    '22.990', '24.305', '26.982', '28.085', '30.974', '32.06', '35.45', '39.95', '39.098', '40.078',
    '44.956', '47.867', '50.942', '51.996', '54.938', '55.845', '58.933', '58.693', '63.546', '65.38',
    '69.723', '72.630', '74.922', '78.971', '79.904', '83.798', '85.468', '87.62', '88.906', '91.222',
    '92.906', '95.95', '[98]', '101.07', '102.91', '106.42', '107.87', '112.41', '114.82', '118.71',
    '121.76', '127.60', '126.90', '131.29', '132.91', '137.33', '138.91', '140.12', '140.91', '144.24',
    '[145]', '150.36', '151.96', '157.25', '158.93', '162.50', '164.93', '167.26', '168.93', '173.05',
    '174.97', '178.49', '180.95', '183.84', '186.21', '190.23', '192.22', '195.08', '196.97', '200.59',
    '204.38', '207.2', '208.98', '[209]', '[210]', '[222]', '[223]', '[226]', '[227]', '232.04',
    '231.04', '238.03', '[237]', '[244]', '[243]', '[247]', '[247]', '[251]', '[252]', '[257]',
    '[258]', '[259]', '[266]', '[267]', '[268]', '[269]', '[270]', '[269]', '[278]', '[281]',
    '[282]', '[285]', '[286]', '[289]', '[290]', '[293]', '[294]', '[294]',
];

export function atomicWeightLabel(Z: number): string {
    return ATOMIC_WEIGHTS[Z - 1] ?? '';
}
```

- [ ] **Step 3: LevelNav variants, SubshellPanel parts, RelativityControl, the popover list**

`src/components/LevelNav.tsx`:
- widen `variant?: 'full' | 'header' | 'body' | 'crumbs' | 'configuration' | 'about'` and document the three new ones in its doc comment ("the Explore panel's pieces (spec §9.1): `crumbs` is the back step and the breadcrumb under the element tile; `configuration` is the configuration, valence and shell chips, with `children` (the subshell chips) after them; `about` is the method and the About text, expanded").
- After the `if (variant === 'header') { … }` block, build the pieces once and use them in every variant:

```tsx
    const backButton = parent && (
        <Button size="small" className="level-nav-back" onClick={() => onNavigate(parent.target)}
            aria-label={parent.spoken === undefined ? undefined : `Back to ${parent.spoken}`}>
            ← Back to {parent.label}
        </Button>
    );
    const breadcrumbs = (
        <Breadcrumbs aria-label="breadcrumb" className="level-nav-breadcrumbs">
            {crumbs.map(crumb => (
                <Link key={crumb.key} component="button" type="button" underline="hover" color="inherit"
                    aria-label={crumb.spoken} onClick={() => onNavigate(crumb.target)}>
                    {crumb.label}
                </Link>
            ))}
        </Breadcrumbs>
    );
    const configurationLines = ( /* today's two Typography lines, the shells Box and the shell-hint Typography, moved here verbatim */ );
    const aboutText = ( /* today's two Typography elements inside <Collapse>: .level-nav-method and .level-nav-about, moved here verbatim */ );

    if (variant === 'crumbs') {
        return <Box className="level-nav level-nav-crumbs" aria-label="level navigation">{backButton}{breadcrumbs}</Box>;
    }
    if (variant === 'configuration') {
        return <Box className="level-nav level-nav-configuration-part">{configurationLines}{children}</Box>;
    }
    if (variant === 'about') {
        return <Box className="level-nav level-nav-about-part">{aboutText}</Box>;
    }
```

  The two `/* … moved here verbatim */` placeholders mean: cut the existing JSX for those elements out of the `full`/`body` return and paste it as the value of these constants (wrapped in `<>…</>`), then use `{configurationLines}` and `{aboutText}` in the `full`/`body` return where that JSX was (`{aboutText}` stays inside the existing `<Collapse in={aboutOpen}>`). The `full`/`body` output must stay byte-for-byte the same DOM — the existing `tests/atom/level_nav.test.tsx` cases prove it.

`src/components/SubshellPanel.tsx`:
- add to the props: `/** 'chips' (Explore › Configuration): the chip row, the hint and the mₗ row; 'diagram' (Explore › Orbitals): the j-level note and the whole-atom energy diagram; 'all': both, as today. */ part?: 'all' | 'chips' | 'diagram';` and destructure `part = 'all'`.
- `const showChips = part !== 'diagram'; const showDiagram = part !== 'chips';`
- wrap the chip row, the isolate hint and the mₗ row in `{showChips && (…)}`; wrap the legend Typography and the `<svg>` in `{showDiagram && (…)}`; show the j-note when `part === 'all'` in its current place, and at the top of the panel when `part === 'diagram'`.
- the outer `<Box className="subshell-panel" aria-label="subshells">` gets `aria-label={part === 'diagram' ? 'orbital energies' : 'subshells'}`.

`src/components/Controls.tsx`: move the Relativity `<FormControl …className="relativity-controls">…</FormControl>` JSX into a new named export and render it from `Controls` where it was:

```tsx
export interface RelativityControlProps {
  relativity: RelativityMode;
  relativityIsDefault: boolean;
  onRelativityChange(mode: RelativityMode): void;
  relativityReadout: RelativityReadout | null;
}

/** The Relativity switch (spec §5 Phase 4) -- Explore › Configuration in the Atom screen (spec §9.1); today's markup. */
export const RelativityControl: React.FC<RelativityControlProps> = ({ relativity, relativityIsDefault, onRelativityChange, relativityReadout }) => (
  <FormControl component="fieldset" margin="normal" fullWidth className="relativity-controls">
    {/* …the existing children of that FormControl, unchanged… */}
  </FormControl>
);
```

and in `Controls`' JSX: `{isAtomMode && onRelativityChange && relativity && (<RelativityControl relativity={relativity} relativityIsDefault={relativityIsDefault} onRelativityChange={onRelativityChange} relativityReadout={relativityReadout} />)}` with the existing comment above it. (`src/components/Controls.test.tsx`'s relativity cases must pass unchanged.)

`src/components/ElementPickerDialog.tsx`: add `variant?: 'dialog' | 'popover'` and `anchorEl?: HTMLElement | null` to the props (document: "'popover' is the desktop's ▾ list under the element tile, spec §9.1"); build `const list = (<>{TextField…}{List…}</>)` from the existing `TextField` and `List` JSX; then

```tsx
    if (variant === 'popover') {
        return (
            <Popover open={open} anchorEl={anchorEl ?? null} onClose={onClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { className: 'element-list-popover', role: 'dialog', 'aria-label': 'Choose an element' } as object }}>
                {list}
            </Popover>
        );
    }
```

before the existing `return (<Dialog …>`, which now renders `{list}` inside its `DialogContent`. Import `Popover` from `@mui/material`. Add to `src/style.css`: `.element-list-popover { width: 320px; max-height: min(520px, 70vh); padding: 12px; display: flex; flex-direction: column; gap: 8px; } .element-list-popover .MuiList-root { overflow-y: auto; }`.

- [ ] **Step 4: Write the tile, the energy list and AtomExplore**

`src/atom_ui/ElementTile.tsx`:

```tsx
import React from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import GridOnOutlined from '@mui/icons-material/GridOnOutlined';
import { elementFor } from '../elements';
import { ATOMIC_WEIGHT_SOURCE, atomicWeightLabel } from '../atomic_weights';
import { speciesSymbol, type AtomSpecies } from '../atom/species';
import './element_tile.css';

interface ElementTileProps {
    species: AtomSpecies;
    tableOpen: boolean;
    /** The tile itself opens the periodic table (it is "the way to change" the element). */
    onOpenTable(): void;
    onToggleTable(): void;
    /** ▾: the searchable list as a popover under the tile. */
    onOpenList(anchor: HTMLElement): void;
}

/**
 * The element tile (spec §9.1): Z top-left, the electron count top-right
 * ("11 / 10 e⁻" reads an ion), the symbol with any charge, the name and the
 * standard atomic weight.
 */
const ElementTile: React.FC<ElementTileProps> = ({ species, tableOpen, onOpenTable, onToggleTable, onOpenList }) => {
    const element = elementFor(species.Z);
    const name = element?.name ?? `Z = ${species.Z}`;
    // The charge only: an excitation is not part of a symbol.
    const symbol = speciesSymbol({ ...species, excitation: null });
    const ion = species.charge !== 0;
    return (
        <div className="element-header">
            <div className="element-header-row">
                <span className="ql-section">Element</span>
                <Tooltip title="Choose an element from a list">
                    <IconButton className="ql-icon-button" size="small" aria-label="Choose an element from a list"
                        onClick={event => onOpenList(event.currentTarget)}>
                        <ExpandMore fontSize="small" />
                    </IconButton>
                </Tooltip>
            </div>
            <div className="element-header-body">
                <button
                    type="button"
                    className="element-tile"
                    title={ATOMIC_WEIGHT_SOURCE}
                    aria-label={`change element, currently ${ion ? `${symbol} · ${name}` : name}`}
                    onClick={onOpenTable}
                >
                    <span className="element-tile-z ql-tabular">{species.Z}</span>
                    <span className="element-tile-electrons ql-tabular">{species.Z - species.charge} e⁻</span>
                    <span className="element-tile-symbol">{symbol}</span>
                    <span className="element-tile-name">{name}</span>
                    <span className="element-tile-weight ql-tabular">{atomicWeightLabel(species.Z)}</span>
                </button>
                <Button variant="outlined" size="small" className="element-table-button" startIcon={<GridOnOutlined fontSize="small" />}
                    aria-pressed={tableOpen} onClick={onToggleTable}>
                    Periodic Table
                </Button>
            </div>
        </div>
    );
};

export default ElementTile;
```

`src/atom_ui/element_tile.css`:

```css
/* src/atom_ui/element_tile.css -- the Atom screen's element tile (spec §9.1): 88 × 96, surface-3, radius lg. */
.element-header { display: flex; flex-direction: column; gap: 8px; }
.element-header-row { display: flex; align-items: center; justify-content: space-between; }
.element-header-body { display: flex; align-items: center; gap: 12px; }
.element-tile {
  position: relative; display: grid; grid-template-rows: auto 1fr auto auto; justify-items: center;
  width: var(--ql-size-element-tile-width); height: var(--ql-size-element-tile-height);
  padding: 6px 8px; box-sizing: border-box; cursor: pointer;
  border-radius: var(--ql-radius-lg); border: 1px solid var(--ql-color-selected-edge);
  background: var(--ql-color-surface-3); color: var(--ql-color-text-1); box-shadow: var(--ql-shadow-selected);
  font-family: var(--ql-font-sans);
}
.element-tile-z, .element-tile-electrons {
  position: absolute; top: 6px; font-size: var(--ql-type-tick-size); line-height: 14px; color: var(--ql-color-text-2);
}
.element-tile-z { left: 8px; }
.element-tile-electrons { right: 8px; }
.element-tile-symbol { grid-row: 2; align-self: end; font-size: 28px; line-height: 32px; font-weight: 600; }
.element-tile-name { grid-row: 3; font-size: var(--ql-type-caption-size); line-height: 16px; }
.element-tile-weight { grid-row: 4; font-size: var(--ql-type-tick-size); line-height: 14px; color: var(--ql-color-text-2); }
.element-table-button.MuiButton-root { color: var(--ql-color-text-1); border-color: var(--ql-color-border-strong); }
.element-table-button.MuiButton-root[aria-pressed="true"] { border-color: var(--ql-color-selected-edge); background: var(--ql-color-surface-3); }
.orbital-energy-list { width: 100%; border-collapse: collapse; font-size: var(--ql-type-body-size); }
.orbital-energy-list caption { text-align: left; margin-bottom: 6px; }
.orbital-energy-list th, .orbital-energy-list td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--ql-color-border-subtle); }
.orbital-energy-list td:last-child { text-align: right; }
```

`src/atom_ui/OrbitalEnergyList.tsx`:

```tsx
import React from 'react';
import type { SerialisedSubshell } from '../workers/atomWorker';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import { shortMethodLabel, type RelativityMode } from '../atom/relativity';
import { formatElectrons } from '../components/SubshellPanel';
import './element_tile.css';

/**
 * Every occupied subshell's orbital energy, deepest first (spec §9.1
 * Orbitals tab). Ruling R19: an eigenvalue, never called an ionisation
 * energy; the drawn profile's method is stated (ruling C9).
 */
const OrbitalEnergyList: React.FC<{ subshells: SerialisedSubshell[]; relativity: RelativityMode }> = ({ subshells, relativity }) => (
    <table className="orbital-energy-list ql-tabular" aria-label="orbital energies, whole atom">
        <caption className="ql-caption">Orbital energies (eigenvalues, Ha), {shortMethodLabel(relativity)}</caption>
        <thead>
            <tr><th scope="col">Subshell</th><th scope="col">Electrons</th><th scope="col">Energy</th></tr>
        </thead>
        <tbody>
            {[...subshells].sort((a, b) => a.energy - b.energy).map(subshell => (
                <tr key={`${subshell.n}-${subshell.l}-${subshell.j ?? ''}`}>
                    <th scope="row">
                        <span aria-hidden={subshell.j === undefined ? undefined : true}>{subshellLabel(subshell.n, subshell.l, subshell.j)}</span>
                        {subshell.j !== undefined && <span className="visually-hidden">{subshellSpokenLabel(subshell.n, subshell.l, subshell.j)}</span>}
                    </th>
                    <td>{formatElectrons(subshell.electrons)} of {subshell.j === undefined ? 2 * (2 * subshell.l + 1) : 2 * subshell.j + 1}</td>
                    <td>{subshell.energy.toFixed(3)} Ha</td>
                </tr>
            ))}
        </tbody>
    </table>
);

export default OrbitalEnergyList;
```

`src/atom_ui/AtomExplore.tsx`:

```tsx
import React, { useState } from 'react';
import ExplorePanel from '../shell/ExplorePanel';

interface AtomExploreProps {
    header: React.ReactNode;
    configuration: React.ReactNode;
    orbitals: React.ReactNode;
    display: React.ReactNode;
}

/** The Atom screen's Explore panel (spec §9.1): the subject header, then Configuration, Orbitals and Display. */
const AtomExplore: React.FC<AtomExploreProps> = ({ header, configuration, orbitals, display }) => {
    const [tab, setTab] = useState('configuration');
    return (
        <ExplorePanel
            header={header}
            active={tab}
            onTab={setTab}
            tabs={[
                { key: 'configuration', label: 'Configuration', content: configuration },
                { key: 'orbitals', label: 'Orbitals', content: orbitals },
                { key: 'display', label: 'Display', content: display },
            ]}
        />
    );
};

export default AtomExplore;
```

- [ ] **Step 5: App builds the Atom Explore panel**

In `src/App.tsx`:

```tsx
import AtomExplore from './atom_ui/AtomExplore';
import ElementTile from './atom_ui/ElementTile';
import OrbitalEnergyList from './atom_ui/OrbitalEnergyList';
import Controls, { RelativityReadout, BASIC_ORBITALS_ABOUT, RelativityControl } from './components/Controls';
```

State: `const [elementListAnchor, setElementListAnchor] = useState<HTMLElement | null>(null);`

Stop passing `relativity`, `relativityIsDefault`, `onRelativityChange` and `relativityReadout` to `<Controls>` (the switch is in Configuration now), and build:

```tsx
    const relativityControl = isAtomMode && (
        <RelativityControl relativity={relativity} relativityIsDefault={relativityIsDefault}
            onRelativityChange={handleRelativityChange} relativityReadout={relativityReadout} />
    );
    const subshellPanelProps = atomProfile && atomSelectedShell !== null ? {
        subshells: atomProfile.subshells, shellN: atomSelectedShell, selectedSubshell: atomSelectedSubshell,
        selectedOrbital: atomSelectedOrbital, onSelectSubshell: handleSelectSubshell, onSelectOrbital: handleSelectOrbital,
        relativity: atomProfile.relativity ?? 'off',
    } : null;
    const valenceShellN = atomProfile ? atomProfile.shells[atomProfile.shells.length - 1]?.n ?? 1 : 1;
    const atomExplore = (
        <AtomExplore
            header={(
                <>
                    <ElementTile species={species} tableOpen={tableOpen} onOpenTable={() => setTableOpen(true)}
                        onToggleTable={() => setTableOpen(open => !open)} onOpenList={setElementListAnchor} />
                    <LevelNav {...levelNavProps} variant="crumbs" />
                </>
            )}
            configuration={(
                <>
                    <LevelNav {...levelNavProps} variant="configuration">
                        {subshellPanelProps && (atomLevel === 'shell' || atomLevel === 'orbital') && <SubshellPanel {...subshellPanelProps} part="chips" />}
                    </LevelNav>
                    {speciesControls}
                    {relativityControl}
                </>
            )}
            orbitals={(
                <>
                    {atomProfile && (
                        <SubshellPanel subshells={atomProfile.subshells} shellN={atomSelectedShell ?? valenceShellN}
                            selectedSubshell={atomSelectedSubshell} selectedOrbital={atomSelectedOrbital}
                            onSelectSubshell={handleSelectSubshell} onSelectOrbital={handleSelectOrbital}
                            relativity={atomProfile.relativity ?? 'off'} part="diagram" />
                    )}
                    {atomProfile && <OrbitalEnergyList subshells={atomProfile.subshells} relativity={pictureRelativity} />}
                    <LevelNav {...levelNavProps} variant="about" />
                </>
            )}
            display={controls}
        />
    );
```

- the Explore slot: `AtomExplore` is a whole `ExplorePanel`, so it replaces the wrapper rather than going inside it — `<AppShell explore={isAtomMode ? atomExplore : <ExplorePanel body={exploreContent} />} …/>` (the atom branch of `exploreContent` is then unused; delete it).
- `inspectorBody`: `{!isBasicMode && !isAtomMode && controls}` (the atom's view controls are in Display now; the inspector keeps the plot).
- Phone: the atom's Explore tab content becomes `<><LevelNav {...levelNavProps} variant="body">{subshellPanel}</LevelNav>{relativityControl}</>`; the View tab keeps `controls` (now without the switch).
- The element list: `{isAtomMode && !isNarrow && <ElementPickerDialog variant="popover" anchorEl={elementListAnchor} open={elementListAnchor !== null} Z={atomZ} onSelect={handleAtomElementChange} onClose={() => setElementListAnchor(null)} />}` next to the phone's dialog.
- `levelNavProps.onChangeElement` on a desktop now opens the list: `onChangeElement: isNarrow ? () => setElementPickerOpen(true) : () => setTableOpen(true)` stays as it is (only the phone header and the `full` variant use it).
- Help's About for atom mode: `aboutModel={isAtomMode ? <LevelNav {...levelNavProps} variant="about" /> : isBasicMode ? <p>{BASIC_ORBITALS_ABOUT}</p> : undefined}`.

In `src/style.css`, the periodic table becomes a popover anchored under the tile, over the viewport (spec §9.1, still a top inset): in `.periodic-table-panel` set `top: 12px; left: 12px; transform: none;` (keep its existing width rules) and `z-index: 20` (above the title block, which it may cover while open).

- [ ] **Step 6: Run the tests**

Run: `npx jest tests/atomic_weights.test.ts tests/atom_ui tests/atom/level_nav.test.tsx tests/atom/subshell_panel.test.tsx src/components/Controls.test.tsx` → PASS. Then `npx jest src/App.test.tsx` (the four updated cases and every other) → PASS; then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `npm run check:admin-split`.

- [ ] **Step 7: Live check [visual] (expect ~4 min)**

```bash
node tools/design/shoot.mjs --task T10 --scenes home,c-whole,c-2pz,fe-shell,na-ion --themes dark,light --sizes desktop
node tools/design/shoot.mjs --task T10p --scenes c-whole --themes dark,light --sizes phone
```

(`home` opens with the periodic table on arrival, as today.) Checklist `/tmp/6g1-T10-checklist.md` against concept A (dark) and B (light) Explore panels: the "Element" header with ▾, the 88 × 96 tile (Z top-left, "6 e⁻" top-right, "C" large, "Carbon", "12.011"; cyan edge and halo in dark, blue edge in light), the "Periodic Table" button beside it, the breadcrumb under it, the Configuration / Orbitals / Display tab row with the underline, chips as 32 px segments; Na⁺ reads "11" and "10 e⁻" with "Na⁺"; the table opens under the tile over the viewport and closes; ▾ opens the searchable list. Science: the configuration and valence lines, chip labels, occupancies and energies are the same text as on `main` for the same element (compare with Task 3's screenshots); the energy list says "orbital energies", not ionisation energies.

- [ ] **Step 8: Commit**

```bash
git add src/atomic_weights.ts src/atom_ui/ElementTile.tsx src/atom_ui/element_tile.css src/atom_ui/AtomExplore.tsx src/atom_ui/OrbitalEnergyList.tsx src/components/LevelNav.tsx src/components/SubshellPanel.tsx src/components/Controls.tsx src/components/ElementPickerDialog.tsx src/App.tsx src/style.css tests/atomic_weights.test.ts tests/atom_ui/element_tile.test.tsx tests/atom_ui/atom_explore.test.tsx tests/atom/level_nav.test.tsx tests/atom/subshell_panel.test.tsx src/App.test.tsx
git commit -m "feat(atom): Explore panel -- element tile with atomic weight and electron count, table and list pickers, breadcrumb, Configuration and Orbitals tabs (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/atomic_weights.ts src/atom_ui/ElementTile.tsx src/atom_ui/element_tile.css src/atom_ui/AtomExplore.tsx src/atom_ui/OrbitalEnergyList.tsx src/components/LevelNav.tsx src/components/SubshellPanel.tsx src/components/Controls.tsx src/components/ElementPickerDialog.tsx src/App.tsx src/style.css tests/atomic_weights.test.ts tests/atom_ui/element_tile.test.tsx tests/atom_ui/atom_explore.test.tsx tests/atom/level_nav.test.tsx tests/atom/subshell_panel.test.tsx src/App.test.tsx
```

---

### Task 11: Presentation preferences and the Display tab

**Estimate:** 75 min. **Spec:** §6.7, §9.1 tab 3 "Display", ruling R1. The renderer reads these preferences in Tasks 14–15; here they are stored, offered and tested.

**Files:**
- Create: `src/design/presentation.ts`, `src/atom_ui/DisplayControls.tsx`
- Modify: `src/components/Controls.tsx` (`hideSurfaceStyle`), `src/App.tsx`
- Test: `tests/design/presentation.test.ts`, `tests/atom_ui/display_controls.test.tsx`

**Interfaces:**
- Consumes: `createPref` (Task 2), `usePref` (Task 2), `RenderMode` (`src/types/orbital.ts`).
- Produces:
  - `presentation.ts`: `type Finish = 'glow' | 'solid'`; `type ColourScheme = 'phase' | 'density' | 'classic'`; `interface RenderPrefs { finish: Finish; scheme: ColourScheme }`; `RENDER_KEY = 'eov.render'`; `DEFAULT_RENDER = { finish: 'glow', scheme: 'phase' }`; `renderPref: Pref<RenderPrefs>`; `type PlotTabId = 'wave' | 'density' | 'distribution' | 'rho'`; `interface DisplayPrefs { showAxes: boolean; plotTab: PlotTabId }`; `DISPLAY_KEY = 'eov.display'`; `DEFAULT_DISPLAY = { showAxes: true, plotTab: 'distribution' }`; `displayPref: Pref<DisplayPrefs>`; `decodeRender`, `decodeDisplay`.
  - `DisplayControls.tsx`: `SurfaceAndScheme` props `{ surfaceMode: RenderMode; meshLevel: boolean; onSurfaceMode(mode: RenderMode): void }` (groups "surface style": Glow / Solid / Wireframe; "colour scheme": Phase ψ / Density / Classic); `AxesSwitch` (no props; a switch named "Show axes").
  - `Controls` prop `hideSurfaceStyle?: boolean` (skips its own Solid/Wireframe group).

- [ ] **Step 1: Write the failing tests**

`tests/design/presentation.test.ts`:

```ts
import { decodeDisplay, decodeRender, DEFAULT_DISPLAY, DEFAULT_RENDER, displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('presentation preferences (spec §6.7)', () => {
    it('default to Glow, the phase scheme, axes shown and the radial distribution tab', () => {
        expect(renderPref.get()).toEqual({ finish: 'glow', scheme: 'phase' });
        expect(displayPref.get()).toEqual({ showAxes: true, plotTab: 'distribution' });
    });

    it('store JSON under eov.render and eov.display', () => {
        renderPref.set({ finish: 'solid', scheme: 'classic' });
        displayPref.set({ showAxes: false, plotTab: 'wave' });
        expect(JSON.parse(window.localStorage.getItem('eov.render')!)).toEqual({ finish: 'solid', scheme: 'classic' });
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toEqual({ showAxes: false, plotTab: 'wave' });
    });

    it('read anything malformed as the defaults, field by field', () => {
        expect(decodeRender('not json')).toEqual(DEFAULT_RENDER);
        expect(decodeRender('{"finish":"chrome","scheme":"density"}')).toEqual({ finish: 'glow', scheme: 'density' });
        expect(decodeDisplay('{"showAxes":"yes","plotTab":"rho"}')).toEqual({ showAxes: true, plotTab: 'rho' });
        expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    });
});
```

`tests/atom_ui/display_controls.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AxesSwitch, SurfaceAndScheme } from '../../src/atom_ui/DisplayControls';
import { displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('the Display tab (spec §9.1, ruling R1)', () => {
    it('offers Glow, Solid and Wireframe, with Glow the default', () => {
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel onSurfaceMode={jest.fn()} />);
        const group = screen.getByRole('group', { name: 'surface style' });
        expect(group).toHaveTextContent('GlowSolidWireframe');
        expect(screen.getByRole('button', { name: 'glow surface' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps Glow and Solid out of the link: both are the solid surface, the finish is local', () => {
        const onSurfaceMode = jest.fn();
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel onSurfaceMode={onSurfaceMode} />);
        fireEvent.click(screen.getByRole('button', { name: 'solid surface' }));
        expect(renderPref.get().finish).toBe('solid');
        expect(onSurfaceMode).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'wireframe surface' }));
        expect(onSurfaceMode).toHaveBeenCalledWith('wireframe');
        expect(renderPref.get().finish).toBe('solid');
    });

    it('coming back from Wireframe to Glow restores the solid surface and the glow finish', () => {
        const onSurfaceMode = jest.fn();
        render(<SurfaceAndScheme surfaceMode="wireframe" meshLevel onSurfaceMode={onSurfaceMode} />);
        expect(screen.getByRole('button', { name: 'wireframe surface' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'glow surface' }));
        expect(onSurfaceMode).toHaveBeenCalledWith('solid');
        expect(renderPref.get().finish).toBe('glow');
    });

    it('chooses the colour scheme and says what each one shows', () => {
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel={false} onSurfaceMode={jest.fn()} />);
        expect(screen.queryByRole('group', { name: 'surface style' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'density on the cut face' }));
        expect(renderPref.get().scheme).toBe('density');
        expect(screen.getByText(/\|ψ\|² on the cut face/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'classic colours' }));
        expect(renderPref.get().scheme).toBe('classic');
    });

    it('shows or hides the axes', () => {
        render(<AxesSwitch />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show axes' }));
        expect(displayPref.get().showAxes).toBe(false);
    });
});
```

Run: `npx jest tests/design/presentation.test.ts tests/atom_ui/display_controls.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 2: Write `src/design/presentation.ts`**

```ts
import { createPref } from './local_pref';

/**
 * How the 3D view is drawn, as the viewer's own preference (spec §6.7):
 * localStorage only, never in a link. Ruling R1: the link keeps `surf`
 * (solid or wireframe) as today; Glow is a finish of the solid surface, so
 * a link opens in the receiver's own finish.
 */
export type Finish = 'glow' | 'solid';
export type ColourScheme = 'phase' | 'density' | 'classic';
export interface RenderPrefs { finish: Finish; scheme: ColourScheme }

export const RENDER_KEY = 'eov.render';
export const DEFAULT_RENDER: RenderPrefs = { finish: 'glow', scheme: 'phase' };
const SCHEMES: readonly ColourScheme[] = ['phase', 'density', 'classic'];

function parse(raw: string | null): Record<string, unknown> {
    try {
        const value = JSON.parse(raw ?? '');
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

export function decodeRender(raw: string | null): RenderPrefs {
    const value = parse(raw);
    return {
        finish: value.finish === 'solid' ? 'solid' : 'glow',
        scheme: SCHEMES.includes(value.scheme as ColourScheme) ? value.scheme as ColourScheme : DEFAULT_RENDER.scheme,
    };
}

export const renderPref = createPref<RenderPrefs>(RENDER_KEY, { decode: decodeRender, encode: value => JSON.stringify(value) });

/** The inspector's plot tabs (spec §9.1): R(r), |R(r)|², today's radial distribution, ρ(r). */
export type PlotTabId = 'wave' | 'density' | 'distribution' | 'rho';
export interface DisplayPrefs { showAxes: boolean; plotTab: PlotTabId }

export const DISPLAY_KEY = 'eov.display';
export const DEFAULT_DISPLAY: DisplayPrefs = { showAxes: true, plotTab: 'distribution' };
const PLOT_TABS: readonly PlotTabId[] = ['wave', 'density', 'distribution', 'rho'];

export function decodeDisplay(raw: string | null): DisplayPrefs {
    const value = parse(raw);
    return {
        showAxes: typeof value.showAxes === 'boolean' ? value.showAxes : DEFAULT_DISPLAY.showAxes,
        plotTab: PLOT_TABS.includes(value.plotTab as PlotTabId) ? value.plotTab as PlotTabId : DEFAULT_DISPLAY.plotTab,
    };
}

export const displayPref = createPref<DisplayPrefs>(DISPLAY_KEY, { decode: decodeDisplay, encode: value => JSON.stringify(value) });
```

- [ ] **Step 3: Write `src/atom_ui/DisplayControls.tsx`**

```tsx
import React from 'react';
import { FormControl, FormControlLabel, FormHelperText, FormLabel, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { RenderMode } from '../types/orbital';
import { displayPref, renderPref, type ColourScheme } from '../design/presentation';
import { usePref } from '../design/usePref';

type SurfaceChoice = 'glow' | 'solid' | 'wireframe';

const SCHEME_HELP: Record<ColourScheme, string> = {
    phase: 'The surface is coloured by the sign of ψ.',
    density: '|ψ|² on the cut face, from the surface value (Low) to the peak (High); the surface keeps its ψ colours.',
    classic: 'The original red and blue, for continuity with textbooks and earlier exports.',
};

/** MUI upper-cases toggle labels; "Phase ψ" must not become "PHASE Ψ". */
const KEEP_CASE = { '& .MuiToggleButton-root': { textTransform: 'none' } } as const;

interface SurfaceAndSchemeProps {
    /** The store's surfaceStyle.mode -- what the link carries (ruling R1). */
    surfaceMode: RenderMode;
    /** Only a marching-cubes surface has a surface style (Controls' isMeshLevel rule). */
    meshLevel: boolean;
    onSurfaceMode(mode: RenderMode): void;
}

/** Display tab (spec §9.1): Surface style and Colour scheme. */
export const SurfaceAndScheme: React.FC<SurfaceAndSchemeProps> = ({ surfaceMode, meshLevel, onSurfaceMode }) => {
    const render = usePref(renderPref);
    const value: SurfaceChoice = surfaceMode === 'wireframe' ? 'wireframe' : render.finish;
    const chooseSurface = (next: SurfaceChoice | null) => {
        if (!next) return;
        if (next === 'wireframe') { onSurfaceMode('wireframe'); return; }
        renderPref.set({ ...render, finish: next });
        if (surfaceMode !== 'solid') onSurfaceMode('solid');
    };
    return (
        <>
            {meshLevel && (
                <FormControl component="fieldset" margin="normal" fullWidth className="surface-style-controls">
                    <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Surface style</FormLabel>
                    <ToggleButtonGroup value={value} exclusive size="small" fullWidth aria-label="surface style" sx={KEEP_CASE}
                        onChange={(_event, next: SurfaceChoice | null) => chooseSurface(next)}>
                        <ToggleButton value="glow" aria-label="glow surface">Glow</ToggleButton>
                        <ToggleButton value="solid" aria-label="solid surface">Solid</ToggleButton>
                        <ToggleButton value="wireframe" aria-label="wireframe surface">Wireframe</ToggleButton>
                    </ToggleButtonGroup>
                </FormControl>
            )}
            <FormControl component="fieldset" margin="normal" fullWidth className="colour-scheme-controls">
                <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Colour scheme</FormLabel>
                <ToggleButtonGroup value={render.scheme} exclusive size="small" fullWidth aria-label="colour scheme" sx={KEEP_CASE}
                    onChange={(_event, next: ColourScheme | null) => { if (next) renderPref.set({ ...render, scheme: next }); }}>
                    <ToggleButton value="phase" aria-label="phase colours">Phase ψ</ToggleButton>
                    <ToggleButton value="density" aria-label="density on the cut face">Density</ToggleButton>
                    <ToggleButton value="classic" aria-label="classic colours">Classic</ToggleButton>
                </ToggleButtonGroup>
                <FormHelperText sx={{ mx: 0 }}>{SCHEME_HELP[render.scheme]}</FormHelperText>
            </FormControl>
        </>
    );
};

/** Display tab (spec §9.1): the Show axes preference (§2 In, item 7). */
export const AxesSwitch: React.FC = () => {
    const display = usePref(displayPref);
    return (
        <FormControlLabel
            className="axes-switch"
            control={<Switch checked={display.showAxes} onChange={event => displayPref.set({ ...display, showAxes: event.target.checked })} />}
            label="Show axes"
        />
    );
};
```

- [ ] **Step 4: Controls hides its own surface toggle; App fills the Display tab**

`src/components/Controls.tsx`: add `/** The Atom Display tab offers Glow / Solid / Wireframe itself (ruling R1). */ hideSurfaceStyle?: boolean;` to the props, destructure `hideSurfaceStyle = false`, and change the Surface group's condition from `{isMeshLevel && (` to `{isMeshLevel && !hideSurfaceStyle && (`.

`src/App.tsx`: `import { AxesSwitch, SurfaceAndScheme } from './atom_ui/DisplayControls';`. In `<Controls …>` add `hideSurfaceStyle={isAtomMode}`, and make its children

```tsx
            {isAtomMode ? (
                <SurfaceAndScheme surfaceMode={surfaceStyle.mode} meshLevel={atomLevel === 'orbital'}
                    onSurfaceMode={mode => handleSurfaceStyleChange({ mode })} />
            ) : (moleculeOptions || null)}
```

(Controls renders its children for atom and molecule modes, after the Electron-enclosed select and before Opacity — which puts the order of spec §9.1: enclosed, surface style, colour scheme, opacity, cut.) Then the Atom Display tab and the phone's atom View tab become `<>{controls}<AxesSwitch /></>` (the phone tab keeps `{phoneViewActions}` after them).

- [ ] **Step 5: Run the tests**

Run: `npx jest tests/design/presentation.test.ts tests/atom_ui src/components/Controls.test.tsx src/App.test.tsx` → PASS. Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/design/presentation.ts src/atom_ui/DisplayControls.tsx src/components/Controls.tsx src/App.tsx tests/design/presentation.test.ts tests/atom_ui/display_controls.test.tsx
git commit -m "feat(atom): Display tab -- Glow/Solid/Wireframe, colour scheme and Show axes, stored outside links (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/presentation.ts src/atom_ui/DisplayControls.tsx src/components/Controls.tsx src/App.tsx tests/design/presentation.test.ts tests/atom_ui/display_controls.test.tsx
```

---

### Task 12: Science colours from one source — keys, plots, PNG legend

**Estimate:** 60 min. **Spec:** §4.2 (the whole table and its checks), §11.1 rows "ψ legend swatches", "Shell rings", "Subshell members", "Combination overlay", §11.5 (keys). The renderer adopts the same module in Task 14; here the keys, the plots and the PNG legend do, so a key can never disagree with what it labels.

**Files:**
- Create: `src/design/science.ts`
- Modify: `src/shell/KeyColumn.tsx` (+`ShellRingKey`, `DensityRampKey`, `AtomKeys`; `PhaseKey` colours become required), `src/shell/viewport.css`, `src/components/RadialPlot.tsx` (`lineColour`), `src/components/SubshellPanel.tsx` (`palette`), `src/export/png.ts` (`phaseColours`), `src/export/run_export.ts` (`ExportContext.phaseColours`), `src/App.tsx`, `src/style.css` (the four science literals go), `tests/a11y/panel_contrast.test.ts` (allow-list shrinks)
- Test: `tests/design/science.test.ts`, additions to `tests/shell/key_column.test.tsx`, `tests/export/png.test.ts`

**Interfaces:**
- Consumes: `TOKENS`, `ThemeMode` (Task 1); `ColourScheme` (Task 11); `hexToLab`, `deltaE76`, `hexToRgb255`, `srgbToLinear` (Task 1); `CURVE_COLORS` (`src/curve_colors.ts`); `DENSITY_SURFACE_HEX` (`src/bonds/systems.ts`).
- Produces (`src/design/science.ts`; no React, no three):
  - `CLASSIC` (today's constants: `positive '#FF0000'`, `negative '#0000FF'`, `legendPositive '#e02020'`, `legendNegative '#2040ff'`, `capPositive '#D42020'`, `capNegative '#2030D4'`, `densitySurface '#CFD8DC'`, `axisLabels { x '#ff9f40', y '#a0ff40', z '#40a8ff' }`)
  - `PHASE_COLOURS: Record<ThemeMode, { positive; negative; rimPositive; rimNegative }>`, `DENSITY_SURFACE: Record<ThemeMode, string>`, `DENSITY_RAMP: readonly string[]` (6 stops), `CURVE_COLORS_LIGHT: readonly string[]`
  - `interface PhaseColours { positive: string; negative: string; legendPositive: string; legendNegative: string; capPositive: string; capNegative: string; rimPositive: string | null; rimNegative: string | null }`
  - `phaseColours(theme: ThemeMode, scheme: ColourScheme): PhaseColours`
  - `curvePalette(theme, scheme): readonly string[]`; `themeCurveColour(hex: string, palette: readonly string[]): string` (maps a `CURVE_COLORS` entry to the same index; anything else unchanged)
  - `densitySurfaceHex(theme, scheme): string`
  - `interface AxesStyle { perAxis: boolean; line: string; lineOpacity: number; labels: { x: string; y: string; z: string }; arrowheads: boolean }`; `axesStyle(theme, scheme): AxesStyle`
  - `canvasSolid(theme): string`; `linearRgb(hex): [number, number, number]` (vertex colours); `displayRgb(hex): [number, number, number]` (0–1 sRGB, for the cap shader)
  - `KeyColumn.tsx`: `PhaseKey` props `{ positive: string; negative: string }` (required now); `ShellRingKey` props `{ items: Array<{ label: string; colour: string; spoken?: string }> }` (`aria-label="shell colour key"`); `DensityRampKey` (no props; `aria-label="cut-face density key"`); `AtomKeys` props `{ level: ViewLevel; scheme: ColourScheme; cutOn: boolean; phase: PhaseColours; shellItems: ShellRingKey['items'] }`.
  - `OverlaySpec.phaseColours?: [string, string]`; `ExportContext.phaseColours?: [string, string]`; `RadialPlot` prop `lineColour?: string`; `SubshellPanel` prop `palette?: readonly string[]`.

- [ ] **Step 1: Write the failing tests**

`tests/design/science.test.ts`:

```ts
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { deltaE76, hexToLab } from '../../src/design/colour_math';
import {
    axesStyle, CLASSIC, CURVE_COLORS_LIGHT, curvePalette, DENSITY_RAMP, densitySurfaceHex, displayRgb, linearRgb,
    phaseColours, themeCurveColour,
} from '../../src/design/science';
import { THEME_MODES } from '../../src/design/tokens';
import { CURVE_COLORS } from '../../src/curve_colors';
import { DENSITY_SURFACE_HEX } from '../../src/bonds/systems';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

describe('science colours (spec §4.2, §11)', () => {
    it('Classic is exactly today\'s constants, in both themes (§11.3)', () => {
        for (const theme of THEME_MODES) {
            expect(phaseColours(theme, 'classic')).toEqual({
                positive: '#FF0000', negative: '#0000FF', legendPositive: '#e02020', legendNegative: '#2040ff',
                capPositive: '#D42020', capNegative: '#2030D4', rimPositive: null, rimNegative: null,
            });
            expect(densitySurfaceHex(theme, 'classic').toLowerCase()).toBe(DENSITY_SURFACE_HEX.toLowerCase());
            expect(curvePalette(theme, 'classic')).toBe(CURVE_COLORS);
            expect(axesStyle(theme, 'classic')).toMatchObject({ perAxis: true, labels: CLASSIC.axisLabels });
        }
        expect(linearRgb(CLASSIC.positive)).toEqual([1, 0, 0]);
        expect(linearRgb(CLASSIC.negative)).toEqual([0, 0, 1]);
        expect(displayRgb(CLASSIC.capPositive).map(c => Math.round(c * 255))).toEqual([0xd4, 0x20, 0x20]);
    });

    it('the phase scheme\'s key, PNG legend and surface are one colour pair (one source)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme, 'phase');
            expect([p.legendPositive, p.legendNegative]).toEqual([p.positive, p.negative]);
            expect([p.capPositive, p.capNegative]).toEqual([p.positive, p.negative]);
            expect(phaseColours(theme, 'density')).toEqual(p);
        }
        expect(phaseColours('dark', 'phase').positive).toBe('#FF7A2F');
        expect(phaseColours('light', 'phase').negative).toBe('#1F5FE0');
    });

    it('separates + from − by colour and by lightness (ΔE ≥ 130; different L*)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme, 'phase');
            const [plus, minus] = [hexToLab(p.positive), hexToLab(p.negative)];
            expect(deltaE76(plus, minus)).toBeGreaterThanOrEqual(130);
            expect(Math.abs(plus[0] - minus[0])).toBeGreaterThanOrEqual(10);
        }
    });

    it('tints each rim with its own phase, never the other phase\'s hue (§11.2 ruling)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme, 'phase');
            const near = (rim: string, own: string, other: string) => deltaE76(hexToLab(rim), hexToLab(own)) < deltaE76(hexToLab(rim), hexToLab(other));
            expect(near(p.rimPositive!, p.positive, p.negative)).toBe(true);
            expect(near(p.rimNegative!, p.negative, p.positive)).toBe(true);
        }
    });

    it('ramps the density strictly upwards in lightness, 16.7 → 93.6', () => {
        const L = DENSITY_RAMP.map(hex => hexToLab(hex)[0]);
        expect(L[0]).toBeCloseTo(16.7, 1);
        expect(L[L.length - 1]).toBeCloseTo(93.6, 1);
        for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThan(L[i - 1]);
    });

    it('keeps curve identity across themes, every light curve ≥ 3:1 on white', () => {
        expect(CURVE_COLORS_LIGHT).toHaveLength(CURVE_COLORS.length);
        for (const hex of CURVE_COLORS_LIGHT) expect(contrastRatio(rgb(hex), [255, 255, 255])).toBeGreaterThanOrEqual(3);
        expect(curvePalette('dark', 'phase')).toBe(CURVE_COLORS);
        expect(curvePalette('light', 'phase')).toBe(CURVE_COLORS_LIGHT);
        expect(themeCurveColour(CURVE_COLORS[3], CURVE_COLORS_LIGHT)).toBe(CURVE_COLORS_LIGHT[3]);
        expect(themeCurveColour('#123456', CURVE_COLORS_LIGHT)).toBe('#123456');
    });
});
```

`tests/shell/key_column.test.tsx` — replace its two tests' `<PhaseKey />` with `<PhaseKey positive="#FF7A2F" negative="#2F6BFF" />` where colours are not the point, and add:

```tsx
import { AtomKeys, DensityRampKey, ShellRingKey } from '../../src/shell/KeyColumn';
import { phaseColours } from '../../src/design/science';

describe('the Atom screen\'s keys (spec §11.5)', () => {
    const phase = phaseColours('dark', 'phase');
    const shellItems = [{ label: 'n=1', colour: '#4da3ff' }, { label: 'n=2 valence', colour: '#ff6b6b' }];

    it('density scheme without a cut says how to see it and shows no colour bar (Review Focus 3)', () => {
        render(<KeyColumn><AtomKeys level="orbital" scheme="density" cutOn={false} phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.getByText('Pick a cut axis to see the density inside')).toBeInTheDocument();
        expect(screen.queryByLabelText('cut-face density key')).toBeNull();
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
    });

    it('with a cut, puts the High/Low bar beside the ψ key, with its exact caption', () => {
        render(<KeyColumn><AtomKeys level="orbital" scheme="density" cutOn phase={phase} shellItems={shellItems} /></KeyColumn>);
        const bar = screen.getByLabelText('cut-face density key');
        expect(bar).toHaveTextContent('High');
        expect(bar).toHaveTextContent('Low');
        expect(bar).toHaveTextContent('|ψ|² on the cut face: from the surface value (Low) to the peak (High), log scale');
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
    });

    it('never shows the bar beside a shell view, whatever the scheme', () => {
        render(<KeyColumn><AtomKeys level="atom" scheme="density" cutOn phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.queryByLabelText('cut-face density key')).toBeNull();
        const key = screen.getByLabelText('shell colour key');
        expect(key).toHaveTextContent('n=2 valence');
        expect(key).toHaveTextContent('cut face shading is scaled to local shell structure');
    });

    it('draws the ramp from the six science stops', () => {
        const { container } = render(<DensityRampKey />);
        expect((container.querySelector('.density-ramp-bar') as HTMLElement).style.background).toMatch(/linear-gradient/);
    });

    it('labels every ring colour', () => {
        render(<ShellRingKey items={shellItems} />);
        expect(screen.getByLabelText('shell colour key')).toHaveTextContent('n=1');
    });
});
```

`tests/export/png.test.ts` — add:

```ts
describe('drawOverlays: the ψ legend takes the scheme\'s colours (one source, spec §11.1)', () => {
    it('paints the legend swatches in the colours it is given, and today\'s without them', () => {
        const paint = (phaseColours?: [string, string]) => {
            const fills: string[] = [];
            const painter = {
                set fillStyle(value: string) { fills.push(value); }, get fillStyle() { return ''; },
                font: '', textBaseline: 'top' as CanvasTextBaseline,
                fillRect: () => {}, fillText: () => {}, measureText: (text: string) => ({ width: text.length * 7 }),
            };
            drawOverlays(painter, 800, 600, 2, { caption: [], scaleBar: null, phaseLegend: true, phaseColours });
            return fills;
        };
        expect(paint(['#FF7A2F', '#2F6BFF'])).toEqual(expect.arrayContaining(['#FF7A2F', '#2F6BFF']));
        expect(paint()).toEqual(expect.arrayContaining(['#e02020', '#2040ff']));
    });
});
```

Run: `npx jest tests/design/science.test.ts tests/shell/key_column.test.tsx tests/export/png.test.ts`
Expected: FAIL — `science` missing; `AtomKeys` missing; legend colours ignored.

- [ ] **Step 2: Write `src/design/science.ts`**

```ts
import { CURVE_COLORS } from '../curve_colors';
import { hexToRgb255, srgbToLinear } from './colour_math';
import type { ColourScheme } from './presentation';
import { TOKENS, type ThemeMode } from './tokens';

/**
 * The science colours (spec §4.2): what a hue on the 3D view, a plot or a
 * key MEANS, kept apart from the UI tokens. Every consumer -- the keys, the
 * PNG legend, the plot curves, the renderer's vertex colours, caps, shell
 * palette and axes -- asks this module, so a key cannot disagree with what
 * it labels. `classic` is today's look, constant for constant (§11.3).
 */
export const CLASSIC = {
    positive: '#FF0000',
    negative: '#0000FF',
    legendPositive: '#e02020',
    legendNegative: '#2040ff',
    capPositive: '#D42020',
    capNegative: '#2030D4',
    densitySurface: '#CFD8DC',
    axisLabels: { x: '#ff9f40', y: '#a0ff40', z: '#40a8ff' },
} as const;

export const PHASE_COLOURS: Record<ThemeMode, { positive: string; negative: string; rimPositive: string; rimNegative: string }> = {
    dark: { positive: '#FF7A2F', negative: '#2F6BFF', rimPositive: '#FFC59A', rimNegative: '#9CC2FF' },
    light: { positive: '#E8590C', negative: '#1F5FE0', rimPositive: '#9A3412', rimNegative: '#1E3A8A' },
};

export const DENSITY_SURFACE: Record<ThemeMode, string> = { dark: '#C9D6E8', light: '#7A8AA0' };

/** The "Density on the cut face" ramp, Low → High; L* rises strictly under normal vision and the three dichromacies. */
export const DENSITY_RAMP: readonly string[] = ['#16245E', '#3541B8', '#9C3FA8', '#E8644E', '#F9B97A', '#FBEBCF'];

/** CURVE_COLORS' light-theme twins: same order and hue family, each ≥ 3:1 on white. */
export const CURVE_COLORS_LIGHT: readonly string[] = ['#1D6FE0', '#D93A3A', '#B7791F', '#0F9D76', '#8B46D6', '#D9661F', '#C2328F', '#5B6880'];

export interface PhaseColours {
    positive: string;
    negative: string;
    legendPositive: string;
    legendNegative: string;
    capPositive: string;
    capNegative: string;
    rimPositive: string | null;
    rimNegative: string | null;
}

export function phaseColours(theme: ThemeMode, scheme: ColourScheme): PhaseColours {
    if (scheme === 'classic') {
        return {
            positive: CLASSIC.positive, negative: CLASSIC.negative,
            legendPositive: CLASSIC.legendPositive, legendNegative: CLASSIC.legendNegative,
            capPositive: CLASSIC.capPositive, capNegative: CLASSIC.capNegative,
            rimPositive: null, rimNegative: null,
        };
    }
    const p = PHASE_COLOURS[theme];
    return {
        positive: p.positive, negative: p.negative,
        legendPositive: p.positive, legendNegative: p.negative,
        capPositive: p.positive, capNegative: p.negative,
        rimPositive: p.rimPositive, rimNegative: p.rimNegative,
    };
}

export function curvePalette(theme: ThemeMode, scheme: ColourScheme): readonly string[] {
    return scheme === 'classic' || theme === 'dark' ? CURVE_COLORS : CURVE_COLORS_LIGHT;
}

/** The same curve, in this palette: index identity (3d is 3d in the plot and on the view, in both themes). */
export function themeCurveColour(hex: string, palette: readonly string[]): string {
    const index = CURVE_COLORS.findIndex(colour => colour.toLowerCase() === hex.toLowerCase());
    return index < 0 ? hex : palette[index];
}

export function densitySurfaceHex(theme: ThemeMode, scheme: ColourScheme): string {
    return scheme === 'classic' ? CLASSIC.densitySurface : DENSITY_SURFACE[theme];
}

export interface AxesStyle {
    /** Classic: AxesHelper's red/green/blue, one colour per axis. */
    perAxis: boolean;
    line: string;
    lineOpacity: number;
    labels: { x: string; y: string; z: string };
    arrowheads: boolean;
}

/**
 * §11.1 "Axes": one hue with 6 % arrowheads and labels in text-1 -- the
 * orange x label would have read as ψ > 0 -- or, in Classic, today's.
 */
export function axesStyle(theme: ThemeMode, scheme: ColourScheme): AxesStyle {
    if (scheme === 'classic') return { perAxis: true, line: '#ffffff', lineOpacity: 1, labels: { ...CLASSIC.axisLabels }, arrowheads: false };
    const label = TOKENS[theme]['text-1'];
    return theme === 'dark'
        ? { perAxis: false, line: '#4F86FF', lineOpacity: 0.7, labels: { x: label, y: label, z: label }, arrowheads: true }
        : { perAxis: false, line: '#8090A8', lineOpacity: 1, labels: { x: label, y: label, z: label }, arrowheads: true };
}

/** The solid colour a PNG export composites onto (§6.6). */
export function canvasSolid(theme: ThemeMode): string {
    return TOKENS[theme]['canvas-solid'];
}

/** sRGB hex → linear-light components: what three.js vertex colours are read in. */
export function linearRgb(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb255(hex);
    return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** sRGB hex → display-space 0–1 components: the cap shader ramps in display space (clip_caps.ts). */
export function displayRgb(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb255(hex);
    return [r / 255, g / 255, b / 255];
}
```

- [ ] **Step 3: The keys**

In `src/shell/KeyColumn.tsx`: make `PhaseKey`'s `positive` and `negative` required and always inline (`style={{ background: positive }}` / `negative`); add:

```tsx
import type { ViewLevel } from '../store/atomSlice';
import type { ColourScheme } from '../design/presentation';
import { DENSITY_RAMP, type PhaseColours } from '../design/science';

export interface ShellRingItem { label: string; colour: string; spoken?: string }

/** Atom and shell level (§11.5): one swatch per ring, matching the plot, with today's cut-face caption. */
export const ShellRingKey: React.FC<{ items: ShellRingItem[] }> = ({ items }) => (
    <div className="phase-legend shell-ring-key" aria-label="shell colour key">
        {items.map(item => (
            <span key={item.label} className="phase-legend-item">
                <span className="phase-legend-swatch" style={{ background: item.colour }} />
                <span aria-hidden={item.spoken ? true : undefined}>{item.label}</span>
                {item.spoken && <span className="visually-hidden">{item.spoken}</span>}
            </span>
        ))}
        <span className="key-caption">cut face shading is scaled to local shell structure</span>
    </div>
);

/** The "Density on the cut face" bar (§11.5): High at the top, Low at the bottom, an exact caption. */
export const DensityRampKey: React.FC = () => (
    <div className="density-ramp-key" aria-label="cut-face density key">
        <div className="density-ramp-scale">
            <span className="density-ramp-high">High</span>
            <span className="density-ramp-bar" style={{ background: `linear-gradient(to top, ${DENSITY_RAMP.join(', ')})` }} />
            <span className="density-ramp-low">Low</span>
        </div>
        <span className="key-caption">|ψ|² on the cut face: from the surface value (Low) to the peak (High), log scale</span>
    </div>
);

interface AtomKeysProps {
    level: ViewLevel;
    scheme: ColourScheme;
    cutOn: boolean;
    phase: PhaseColours;
    shellItems: ShellRingItem[];
}

/**
 * The Atom screen's key column (§9.1 "Viewport", §11.5). The High/Low bar
 * exists only where a scalar is mapped -- an orbital's cut face in the
 * Density scheme -- and never alone beside a phase-coloured surface.
 */
export const AtomKeys: React.FC<AtomKeysProps> = ({ level, scheme, cutOn, phase, shellItems }) => {
    if (level !== 'orbital') return <ShellRingKey items={shellItems} />;
    return (
        <>
            <PhaseKey positive={phase.legendPositive} negative={phase.legendNegative} />
            {scheme === 'density' && (cutOn
                ? <DensityRampKey />
                : <p className="key-note" role="note">Pick a cut axis to see the density inside</p>)}
        </>
    );
};
```

Append to `src/shell/viewport.css`:

```css
.key-column .shell-ring-key, .key-column .density-ramp-key, .key-column .key-note {
  padding: 8px 10px; border-radius: var(--ql-radius-md); background: var(--ql-color-surface-2); color: var(--ql-color-text-1);
}
.key-caption { display: block; max-width: 180px; color: var(--ql-color-text-2); font-size: var(--ql-type-caption-size); line-height: var(--ql-type-caption-line); }
.key-note { margin: 0; font-size: var(--ql-type-caption-size); color: var(--ql-color-text-2); }
.density-ramp-key { display: flex; flex-direction: column; gap: 6px; }
.density-ramp-scale { display: grid; grid-template-columns: var(--ql-size-key-bar); justify-items: center; gap: 4px; font-size: var(--ql-type-tick-size); }
.density-ramp-bar { width: var(--ql-size-key-bar); height: 140px; border-radius: var(--ql-radius-sm); }
```

In `src/style.css` delete `.phase-legend-swatch.positive { background: #e02020; }` and `.phase-legend-swatch.negative { background: #2040ff; }` (the swatches are inline now), and in `.radial-plot-line` / `.radial-plot-fill` delete `stroke: #4da3ff` / `fill: rgba(77, 163, 255, 0.22)` (RadialPlot sets them inline below). In `tests/a11y/panel_contrast.test.ts` remove those four literals from `STYLE_LITERALS_ALLOWED` and its comment.

- [ ] **Step 4: Plots, the subshell panel and the PNG legend take the theme's colours**

`src/components/RadialPlot.tsx`: add the prop `/** The single curve's colour (Basic Orbitals): CURVE_COLORS[0] in its theme's palette. */ lineColour?: string;` (destructure `lineColour = CURVE_COLORS[0]`, importing `CURVE_COLORS` from `'../curve_colors'`), and give the two single-curve paths `style={{ fill: lineColour, fillOpacity: 0.22 }}` and `style={{ stroke: lineColour }}`.

`src/components/SubshellPanel.tsx`: add `/** The theme's curve palette (science.ts curvePalette); CURVE_COLORS by default. */ palette?: readonly string[];` (destructure `palette = CURVE_COLORS`) and replace every `CURVE_COLORS[` in the component body with `palette[` and `% CURVE_COLORS.length` with `% palette.length`.

`src/export/png.ts`: in `OverlaySpec` add `/** The ψ key's swatches, from science.ts phaseColours (one source); today's colours when absent. */ phaseColours?: [string, string];` and in `drawOverlays` change the phase-legend row to

```ts
        const [positive, negative] = spec.phaseColours ?? ['#e02020', '#2040ff'];
        drawLegendRow(painter, width, height, scale, pad, [['ψ > 0', positive], ['ψ < 0', negative]]);
```

`src/export/run_export.ts`: add `/** The ψ key's colours on screen (science.ts phaseColours), so the PNG legend matches. */ phaseColours?: [string, string];` to `ExportContext`, and add `phaseColours: context.phaseColours` to both PNG `overlays` objects.

`src/App.tsx`:

```tsx
import { usePref } from './design/usePref';
import { renderPref } from './design/presentation';
import { curvePalette, densitySurfaceHex, phaseColours, themeCurveColour } from './design/science';
import { AtomKeys } from './shell/KeyColumn';
```

After `const { mode: themeMode } = useQuantumTheme();`:

```tsx
    const render = usePref(renderPref);
    const phase = useMemo(() => phaseColours(themeMode, render.scheme), [themeMode, render.scheme]);
    const palette = useMemo(() => curvePalette(themeMode, render.scheme), [themeMode, render.scheme]);
    /** A curve, key or swatch in this theme's palette (index identity, §4.2). */
    const themed = useCallback(<T extends { color: string }>(items: T[]): T[] =>
        items.map(item => ({ ...item, color: themeCurveColour(item.color, palette) })), [palette]);
```

- `renderRadialPlot`: pass `curves={themed([...atomCurves, ...comparisonCurves])}` for the atom plot, `curves={themed(combinationPlot.curves)}` for a combination, and `lineColour={palette[0]}` for the single Basic curve.
- every `<SubshellPanel …>` gets `palette={palette}`.
- `combinationLegend` used for the key and for export: `const combinationLegend = isBasicMode && renderedField && selectionLegend ? themed(selectionLegend) : null;`.
- the Bonds density swatch: `style={{ background: densitySurfaceHex(themeMode, render.scheme) }}`.
- the `KeyColumn` for the atom becomes:

```tsx
            {isAtomMode && atomProfile && !atomUnbound && (
                <KeyColumn compact={isNarrow}>
                    <AtomKeys level={atomLevel} scheme={render.scheme} cutOn={surfaceStyle.clipAxis !== 'none'} phase={phase}
                        shellItems={themed(atomCurves).map(curve => ({ label: curve.label, colour: curve.color, spoken: curve.spokenLabel }))} />
                </KeyColumn>
            )}
```

  and the existing non-molecule `KeyColumn` block is limited to `!isMoleculeMode && !isAtomMode`, with `<PhaseKey positive={phase.legendPositive} negative={phase.legendNegative} />`; the molecule stack's `<PhaseKey />` takes the same two props.
- `handleExport`'s `runExport` context gains `phaseColours: [phase.legendPositive, phase.legendNegative]` (and `phase` joins its dependency list).

- [ ] **Step 5: Run the tests**

Run: `npx jest tests/design tests/shell tests/export tests/a11y` → PASS; then `npx jest src/App.test.tsx tests/app_combination_selection.test.tsx tests/App.molecules.test.tsx` → PASS (the keys keep their labels; jsdom's default theme is Deep Space, so the default scheme is Phase); the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/design/science.ts src/shell/KeyColumn.tsx src/shell/viewport.css src/components/RadialPlot.tsx src/components/SubshellPanel.tsx src/export/png.ts src/export/run_export.ts src/App.tsx src/style.css tests/a11y/panel_contrast.test.ts tests/design/science.test.ts tests/shell/key_column.test.tsx tests/export/png.test.ts
git commit -m "feat(design): science colours from one source -- phase pair, density ramp, light curve palette, Classic; keys, plots and PNG legend use it (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/science.ts src/shell/KeyColumn.tsx src/shell/viewport.css src/components/RadialPlot.tsx src/components/SubshellPanel.tsx src/export/png.ts src/export/run_export.ts src/App.tsx src/style.css tests/a11y/panel_contrast.test.ts tests/design/science.test.ts tests/shell/key_column.test.tsx tests/export/png.test.ts
```

---

### Task 13: Inspector — plot tabs, CSV per tab, orbital facts [visual]

**Estimate:** 2 h. **Spec:** §8.6, §9.1 "Inspector" (Plot tabs, Data and the facts card), ruling C6 ("the exported number equals the plotted one"), ruling R2, ruling R7 (stacked on a phone).

**Files:**
- Create: `src/atom/plot_tabs.ts`, `src/orbital_facts.ts`, `src/atom_ui/OrbitalFactsCard.tsx`, `src/atom_ui/AtomInspector.tsx`, `src/atom_ui/inspector_atom.css`
- Modify: `src/components/RadialPlot.tsx` (`title`, `caption`, `signed`), `src/export/run_export.ts` (`ExportContext.csvQuantity`), `src/App.tsx`
- Test: `tests/atom/plot_tabs.test.ts`, `tests/orbital_facts.test.ts`, `tests/atom_ui/atom_inspector.test.tsx`, additions to `tests/atom/radial_plot.test.tsx`, `tests/export/run_export.test.ts`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `Inspector`, `InspectorTab`, `TabRow` (Task 8); `PlotTabId`, `displayPref` (Task 11); `RadialCurve` (`src/components/RadialPlot.tsx`); `SerialisedAtomProfile`, `SerialisedSubshell`; `subshellLabel`, `subshellSpokenLabel`, `configurationLabelOf`, `valenceConfigurationLabelOf`; `orbitalName`, `shellLetter`; `shortMethodLabel`; `formatDrawnRadius` (`src/atom/format_radius.ts`); `shellName` (Task 9).
- Produces:
  - `plot_tabs.ts`: `interface PlotTab { id: PlotTabId; label: string; title: string; caption: string | null; signed: boolean; csvQuantity: string | null }`; `plotTabsFor(level: ViewLevel, isolatedSubshell: boolean, relativistic: boolean): PlotTab[]`; `resolvePlotTab(tabs: PlotTab[], preferred: PlotTabId): PlotTab`; `interface PlotCurveInputs { profile: SerialisedAtomProfile; selectedSubshell: { n: number; l: number; j?: number } | null; rGrid: number[]; distribution: RadialCurve[] }`; `tabCurves(tab: PlotTabId, inputs: PlotCurveInputs): RadialCurve[]`.
  - `orbital_facts.ts`: `interface FactRow { term: string; value: string }`; `interface OrbitalFacts { title: string; rows: FactRow[]; notes: string[] }`; `angularNodeSurfaces(l, ml): string | null`; `shapeWord(l, ml): string | null`; `orbitalFacts(o, extras)`; `subshellFacts(s, extras)`; `atomFacts(args)`.
  - `OrbitalFactsCard` props `{ facts: OrbitalFacts }` → `<section aria-label="orbital facts">`.
  - `AtomInspector` props `{ variant: 'docked' | 'drawer' | 'stacked'; open?: boolean; onOpenChange?(open: boolean): void; plotTabs: PlotTab[]; plotTab: PlotTab; onPlotTab(id: PlotTabId): void; plot: React.ReactNode; facts: OrbitalFacts | null; csvReason: string | null; onExportCsv(): void }`.
  - `RadialPlot` props `title?: string` (overrides the computed title), `caption?: string | null` (a note line), `signed?: boolean` (zero line in the middle; scaled by the largest |value|).
  - `ExportContext.csvQuantity?: string` — replaces the CSV's `quantity:` comment and drops the D(r)-only notes and comparison columns.

- [ ] **Step 1: Write the failing tests**

`tests/atom/plot_tabs.test.ts`:

```ts
import { solveAtom } from '../../src/atom/scf';
import { buildSerialisedAtomProfile } from '../../src/workers/atomWorker';
import { plotTabsFor, resolvePlotTab, tabCurves } from '../../src/atom/plot_tabs';

const gridOf = (p: { rMin: number; dx: number; size: number }) => Array.from({ length: p.size }, (_, j) => p.rMin * Math.exp(j * p.dx));
const trapezoid = (r: number[], f: (j: number) => number) => {
    let sum = 0;
    for (let j = 1; j < r.length; j++) sum += 0.5 * (f(j) + f(j - 1)) * (r[j] - r[j - 1]);
    return sum;
};

describe('the inspector\'s plot tabs (spec §9.1, ruling R2)', () => {
    it('offers R, |R|² and the radial distribution for an orbital or one subshell; ρ and the distribution otherwise', () => {
        expect(plotTabsFor('orbital', true, false).map(t => t.id)).toEqual(['wave', 'density', 'distribution']);
        expect(plotTabsFor('shell', true, false).map(t => t.id)).toEqual(['wave', 'density', 'distribution']);
        expect(plotTabsFor('shell', false, false).map(t => t.id)).toEqual(['rho', 'distribution']);
        expect(plotTabsFor('atom', false, false).map(t => t.id)).toEqual(['rho', 'distribution']);
    });

    it('titles each with exactly which function it is, and keeps today\'s distribution title', () => {
        const [wave, density, distribution] = plotTabsFor('orbital', true, false);
        expect(wave.title).toBe('Wave function R(r) (a₀⁻³ᐟ²)');
        expect(density.title).toBe('Probability density |R(r)|² (a₀⁻³)');
        expect(density.caption).toBe('radial factor of |ψ|²');
        expect(distribution.title).toBe('Radial distribution D(r) = 4πr²ρ(r)');
        expect(distribution.csvQuantity).toBeNull();
        expect(plotTabsFor('orbital', true, true)[0].title).toBe('Wave function R(r), large component (a₀⁻³ᐟ²)');
        expect(plotTabsFor('atom', false, false)[0].title).toBe('Density ρ(r) = D(r)/4πr² (e/a₀³)');
    });

    it('falls back to the radial distribution when the stored tab is not offered here', () => {
        expect(resolvePlotTab(plotTabsFor('atom', false, false), 'wave').id).toBe('distribution');
        expect(resolvePlotTab(plotTabsFor('orbital', true, false), 'density').id).toBe('density');
    });

    it('plots the solved R(r) itself: hydrogen 1s is normalised, ∫R²r²dr = 1, and |R|² is its square', () => {
        const profile = buildSerialisedAtomProfile(solveAtom(1), 0.9);
        const rGrid = gridOf(profile);
        const inputs = { profile, selectedSubshell: { n: 1, l: 0 }, rGrid, distribution: [{ label: '1s', color: '#4da3ff', points: [] }] };
        const [wave] = tabCurves('wave', inputs);
        const [density] = tabCurves('density', inputs);
        expect(wave.label).toBe('1s · R(r)');
        expect(wave.points.map(p => p.value)).toEqual(Array.from(profile.subshells[0].R));
        expect(density.points[10].value).toBeCloseTo(wave.points[10].value ** 2, 12);
        expect(trapezoid(rGrid, j => wave.points[j].value ** 2 * rGrid[j] ** 2)).toBeCloseTo(1, 3);
        expect(wave.color).toBe('#4da3ff');
    });

    it('gives ρ(r) = D(r)/4πr², which integrates back to the electron count', () => {
        const profile = buildSerialisedAtomProfile(solveAtom(2), 0.9);
        const rGrid = gridOf(profile);
        const distribution = profile.shells.map(shell => ({ label: `n=${shell.n}`, color: '#4da3ff', points: rGrid.map((r, j) => ({ r, value: shell.curve[j] })) }));
        const [rho] = tabCurves('rho', { profile, selectedSubshell: null, rGrid, distribution });
        expect(rho.label).toBe('n=1 · ρ(r)');
        expect(trapezoid(rGrid, j => 4 * Math.PI * rGrid[j] ** 2 * rho.points[j].value)).toBeCloseTo(2, 2);
    });

    it('leaves the distribution tab\'s curves exactly as given (the exported number equals the plotted one)', () => {
        const profile = buildSerialisedAtomProfile(solveAtom(1), 0.9);
        const distribution = [{ label: '1s', color: '#4da3ff', points: [{ r: 1, value: 2 }] }];
        expect(tabCurves('distribution', { profile, selectedSubshell: null, rGrid: [], distribution })).toBe(distribution);
    });
});
```

`tests/orbital_facts.test.ts`:

```ts
import { angularNodeSurfaces, atomFacts, orbitalFacts, shapeWord, subshellFacts } from '../src/orbital_facts';

const extras = { enclosedFraction: 0.9, isoLevel: 1.234e-3, energy: -0.433, method: 'non-relativistic LDA' };
const value = (facts: ReturnType<typeof orbitalFacts>, term: string) => facts.rows.find(row => row.term === term)?.value;

describe('orbital facts (spec §9.1 "Data")', () => {
    it('names the node surfaces the spec names', () => {
        expect(angularNodeSurfaces(1, 0)).toBe('the xy plane');
        expect(angularNodeSurfaces(2, 0)).toBe('two cones');
        expect(angularNodeSurfaces(2, -2)).toBe('the xz and yz planes');
        expect(angularNodeSurfaces(0, 0)).toBeNull();
        expect(angularNodeSurfaces(4, 0)).toBeNull();
    });

    it('states n, l, mₗ, the real orbital, its nodes, the contour and the energy for 2p_z', () => {
        const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, extras);
        expect(facts.title).toBe('2p_z orbital');
        expect(value(facts, 'n')).toBe('2');
        expect(value(facts, 'l')).toBe('1 (p)');
        expect(value(facts, 'mₗ')).toBe('0');
        expect(value(facts, 'Radial nodes')).toBe('0');
        expect(value(facts, 'Angular nodes')).toBe('1 — the xy plane');
        expect(value(facts, 'Enclosed')).toBe('90 % of the electron');
        expect(value(facts, 'Iso value')).toBe('|ψ|² = 1.23e-3');
        expect(value(facts, 'Orbital energy')).toBe('−0.433 Ha (eigenvalue, non-relativistic LDA)');
        expect(facts.notes).toEqual(['ψ changes sign across every node.', 'Shape: dumbbell (qualitative).']);
    });

    it('counts radial nodes as n − l − 1 spheres', () => {
        expect(value(orbitalFacts({ n: 4, l: 0, ml: 0 }, extras), 'Radial nodes')).toBe('3 (spheres)');
        expect(value(orbitalFacts({ n: 3, l: 1, ml: 1 }, extras), 'Radial nodes')).toBe('1 (a sphere)');
    });

    it('says shapes only where they are conventional, and names a j-level', () => {
        expect(shapeWord(2, -2)).toBe('cloverleaf');
        expect(shapeWord(2, 0)).toBe('dumbbell with a ring');
        expect(shapeWord(4, 1)).toBeNull();
        expect(value(orbitalFacts({ n: 6, l: 1, ml: 0, j: 1.5 }, extras), 'j')).toBe('3/2');
    });

    it('describes a subshell and the whole atom without inventing anything', () => {
        const sub = subshellFacts({ n: 3, l: 2, electrons: 6 }, { enclosedFraction: 0.9, energy: -0.3, method: 'non-relativistic LDA' });
        expect(sub.title).toBe('3d subshell');
        expect(sub.rows.find(r => r.term === 'Electrons')?.value).toBe('6 of 10');
        const atom = atomFacts({ title: 'Whole atom', configuration: '1s² 2s² 2p²', valence: '2s² 2p²', shellCount: 2, drawnRadius: 2.346, method: 'non-relativistic LDA' });
        expect(atom.rows.map(r => r.term)).toEqual(['Configuration', 'Valence', 'Shells', 'Drawn radius']);
        expect(atom.rows[3].value).toBe('2.35 a₀ (non-relativistic LDA)');
    });
});
```

`tests/atom_ui/atom_inspector.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtomInspector from '../../src/atom_ui/AtomInspector';
import { plotTabsFor } from '../../src/atom/plot_tabs';
import { orbitalFacts } from '../../src/orbital_facts';

const tabs = plotTabsFor('orbital', true, false);
const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, { enclosedFraction: 0.9, isoLevel: null, energy: null, method: 'non-relativistic LDA' });

describe('AtomInspector (spec §8.6, §9.1)', () => {
    it('has Plot and Data; Plot holds the plot tabs, Data the facts and the CSV of the plot on screen', () => {
        const onPlotTab = jest.fn();
        const onExportCsv = jest.fn();
        render(<AtomInspector variant="docked" plotTabs={tabs} plotTab={tabs[2]} onPlotTab={onPlotTab}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={onExportCsv} />);
        expect(screen.getByRole('tab', { name: 'Radial distribution' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: 'Wave function' }));
        expect(onPlotTab).toHaveBeenCalledWith('wave');
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(screen.getByRole('region', { name: 'orbital facts' })).toHaveTextContent('2p_z orbital');
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
        expect(onExportCsv).toHaveBeenCalled();
    });

    it('stacks Plot and Data in the phone sheet', () => {
        render(<AtomInspector variant="stacked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()}
            plot={<p>plot</p>} facts={facts} csvReason="nothing drawn" onExportCsv={jest.fn()} />);
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot');
        expect(screen.getByRole('button', { name: 'Export CSV of this plot' })).toBeDisabled();
    });
});
```

`tests/atom/radial_plot.test.tsx` — add:

```tsx
describe('RadialPlot: tab titles and signed curves (spec §9.1)', () => {
    it('titles the plot as told and draws a signed curve about a zero line', () => {
        const curves = [{ label: '2s · R(r)', color: '#4da3ff', points: [{ r: 0, value: 1 }, { r: 1, value: -0.5 }, { r: 2, value: 0 }] }];
        const { container } = render(<RadialPlot n={1} l={0} Z={1} rMax={2} curves={curves} title="Wave function R(r) (a₀⁻³ᐟ²)" caption="large component" signed />);
        expect(container.querySelector('.radial-plot-title')).toHaveTextContent('Wave function R(r) (a₀⁻³ᐟ²)');
        expect(container.querySelector('.radial-plot-zero')).not.toBeNull();
        expect(screen.getByText('large component')).toBeInTheDocument();
    });
});
```

`tests/export/run_export.test.ts` — add, next to the existing CSV cases (reuse the file's atom store helper and `baseContext`):

```ts
    it('a plot tab\'s CSV states that tab\'s quantity and leaves out the D(r)-only notes (ruling C6)', async () => {
        const state = neonStore().getState();
        const result = await runExport('csv', { ...baseContext(state), csvCurves: [{ label: '1s · R(r)', points: [{ r: 1, value: 0.5 }] }],
            csvQuantity: 'R(r), the radial wave function, bohr^-3/2' });
        const text = new TextDecoder().decode(await readBlob(result.blob));
        expect(text).toContain('# quantity: R(r), the radial wave function, bohr^-3/2');
        expect(text).not.toContain('D(r) = 4*pi*r^2*rho(r)');
        expect(text).toContain('1s · R(r)');
    });
```

(Import `neonStore`, `baseContext` and `readBlob` from `./fixtures` if the file does not already.)

`src/App.test.tsx` — add to `describe('App: shell', …)`:

```tsx
    it('exports the curves of the plot tab on screen (ruling C6)', async () => {
        const download = jest.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {});
        try {
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile(), level: 'shell', selectedShell: 1, selectedSubshell: { n: 1, l: 0 } });
            fireEvent.click(screen.getByRole('tab', { name: 'Wave function' }));
            fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
            fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
            await waitFor(() => expect(download).toHaveBeenCalled());
            const text = new TextDecoder().decode(await readBlob(download.mock.calls[0][0] as Blob));
            expect(text).toContain('1s · R(r)');
            expect(text).toContain('# quantity: R(r)');
        } finally {
            download.mockRestore();
            window.localStorage.clear();
        }
    });
```

with `import * as downloadModule from './export/download';` and `import { readBlob } from '../tests/export/fixtures';` at the top of the file. (If `exportAvailability` refuses CSV for this preloaded store, set it up the way `tests/export/run_export.test.ts`'s atom CSV cases do; do not weaken the assertion.)

Run: `npx jest tests/atom/plot_tabs.test.ts tests/orbital_facts.test.ts tests/atom_ui/atom_inspector.test.tsx tests/atom/radial_plot.test.tsx tests/export/run_export.test.ts`
Expected: FAIL — modules and props missing.

- [ ] **Step 2: Write `src/atom/plot_tabs.ts`**

```ts
import type { SerialisedAtomProfile } from '../workers/atomWorker';
import type { ViewLevel } from '../store/atomSlice';
import type { RadialCurve } from '../components/RadialPlot';
import type { PlotTabId } from '../design/presentation';

/**
 * The inspector's plot tabs (spec §9.1). Ruling R2: "Radial distribution"
 * keeps today's curves, title and CSV exactly; the other tabs carry exact
 * axis titles. Under scalar or spin–orbit relativity R(r) is the large
 * component (radial_solver/relativistic_solver: R = u/r, R = G/r), and says so.
 */
export interface PlotTab {
    id: PlotTabId;
    label: string;
    title: string;
    caption: string | null;
    signed: boolean;
    /** The CSV's quantity line; null keeps today's D(r) statement. */
    csvQuantity: string | null;
}

const DISTRIBUTION: PlotTab = {
    id: 'distribution', label: 'Radial distribution', title: 'Radial distribution D(r) = 4πr²ρ(r)', caption: null, signed: false, csvQuantity: null,
};

export function plotTabsFor(level: ViewLevel, isolatedSubshell: boolean, relativistic: boolean): PlotTab[] {
    if (level === 'orbital' || (level === 'shell' && isolatedSubshell)) {
        return [
            {
                id: 'wave', label: 'Wave function', signed: true, caption: null,
                title: relativistic ? 'Wave function R(r), large component (a₀⁻³ᐟ²)' : 'Wave function R(r) (a₀⁻³ᐟ²)',
                csvQuantity: relativistic ? 'R(r), the radial wave function (large component), bohr^-3/2' : 'R(r), the radial wave function, bohr^-3/2',
            },
            {
                id: 'density', label: 'Probability density', signed: false, caption: 'radial factor of |ψ|²',
                title: 'Probability density |R(r)|² (a₀⁻³)', csvQuantity: '|R(r)|^2, the radial factor of |psi|^2, bohr^-3',
            },
            DISTRIBUTION,
        ];
    }
    return [
        {
            id: 'rho', label: 'Density', signed: false, caption: null, title: 'Density ρ(r) = D(r)/4πr² (e/a₀³)',
            csvQuantity: 'rho(r) = D(r)/(4*pi*r^2), electrons per bohr^3',
        },
        DISTRIBUTION,
    ];
}

export function resolvePlotTab(tabs: PlotTab[], preferred: PlotTabId): PlotTab {
    return tabs.find(tab => tab.id === preferred) ?? tabs.find(tab => tab.id === 'distribution') ?? tabs[0];
}

export interface PlotCurveInputs {
    profile: SerialisedAtomProfile;
    selectedSubshell: { n: number; l: number; j?: number } | null;
    rGrid: number[];
    /** Today's curves (App's atomCurves): the distribution tab, and the colours and labels the others reuse. */
    distribution: RadialCurve[];
}

export function tabCurves(tab: PlotTabId, inputs: PlotCurveInputs): RadialCurve[] {
    const { profile, selectedSubshell, rGrid, distribution } = inputs;
    if (tab === 'distribution') return distribution;
    if (tab === 'rho') {
        return distribution.filter(curve => !curve.dashed).map(curve => ({
            ...curve,
            label: `${curve.label} · ρ(r)`,
            points: curve.points.map(point => ({ r: point.r, value: point.r > 0 ? point.value / (4 * Math.PI * point.r * point.r) : 0 })),
        }));
    }
    const sub = selectedSubshell && profile.subshells.find(s => s.n === selectedSubshell.n && s.l === selectedSubshell.l && s.j === selectedSubshell.j);
    if (!sub) return [];
    const base = distribution.find(curve => !curve.dashed) ?? distribution[0];
    const square = tab === 'density';
    return [{
        label: `${base?.label ?? ''} · ${square ? '|R(r)|²' : 'R(r)'}`,
        ...(base?.spokenLabel ? { spokenLabel: `${base.spokenLabel}, ${square ? 'R squared' : 'R'}` } : {}),
        color: base?.color ?? '#4da3ff',
        points: rGrid.map((r, j) => ({ r, value: square ? sub.R[j] * sub.R[j] : sub.R[j] })),
    }];
}
```

- [ ] **Step 3: Write `src/orbital_facts.ts`**

```ts
import { orbitalName, shellLetter } from './orbital_names';
import { subshellLabel } from './atom/configurations';
import { formatDrawnRadius } from './atom/format_radius';

/**
 * The inspector's facts card (spec §9.1 "Data"): computed, never typed in.
 * Angular nodes are the real orbitals' nodal surfaces (orbital_names.ts's
 * sign convention: positive mₗ takes cos, negative sin), named for l ≤ 3;
 * shape words are the textbook ones, labelled qualitative.
 */
export interface FactRow { term: string; value: string }
export interface OrbitalFacts { title: string; rows: FactRow[]; notes: string[] }

const NODE_SURFACES: Record<string, string> = {
    '1:-1': 'the xz plane', '1:0': 'the xy plane', '1:1': 'the yz plane',
    '2:-2': 'the xz and yz planes', '2:-1': 'the xy and xz planes', '2:0': 'two cones',
    '2:1': 'the xy and yz planes', '2:2': 'the planes x = y and x = −y',
    '3:-3': 'three vertical planes (y = 0, y = ±√3 x)', '3:-2': 'the xy, yz and xz planes',
    '3:-1': 'the xz plane and two cones', '3:0': 'the xy plane and two cones',
    '3:1': 'the yz plane and two cones', '3:2': 'the xy plane and the planes x = ±y',
    '3:3': 'three vertical planes (x = 0, x = ±√3 y)',
};

const SHAPES: Record<string, string> = {
    '0:0': 'sphere',
    '1:-1': 'dumbbell', '1:0': 'dumbbell', '1:1': 'dumbbell',
    '2:-2': 'cloverleaf', '2:-1': 'cloverleaf', '2:0': 'dumbbell with a ring', '2:1': 'cloverleaf', '2:2': 'cloverleaf',
    '3:-3': 'six lobes in a plane', '3:-2': 'eight lobes', '3:-1': 'six lobes', '3:0': 'dumbbell with two rings',
    '3:1': 'six lobes', '3:2': 'eight lobes', '3:3': 'six lobes in a plane',
};

export function angularNodeSurfaces(l: number, ml: number): string | null {
    return NODE_SURFACES[`${l}:${ml}`] ?? null;
}

export function shapeWord(l: number, ml: number): string | null {
    return SHAPES[`${l}:${ml}`] ?? null;
}

const signed = (value: number) => (value < 0 ? `−${Math.abs(value)}` : String(value));
const percent = (fraction: number) => `${Math.round(fraction * 100)} %`;
const radialNodes = (n: number, l: number) => {
    const count = n - l - 1;
    return count === 0 ? '0' : `${count} (${count === 1 ? 'a sphere' : 'spheres'})`;
};
const energyText = (energy: number, method: string) =>
    `${energy < 0 ? '−' : ''}${Math.abs(energy).toFixed(3)} Ha (eigenvalue, ${method})`;

interface Extras { enclosedFraction: number; isoLevel: number | null; energy: number | null; method: string }

export function orbitalFacts(o: { n: number; l: number; ml: number; j?: number }, extras: Extras): OrbitalFacts {
    const surfaces = angularNodeSurfaces(o.l, o.ml);
    const rows: FactRow[] = [
        { term: 'n', value: String(o.n) },
        { term: 'l', value: `${o.l} (${shellLetter(o.l)})` },
        { term: 'mₗ', value: o.ml > 0 ? `+${o.ml}` : signed(o.ml) },
        { term: 'Real orbital', value: orbitalName(o.n, o.l, o.ml) },
        ...(o.j === undefined ? [] : [{ term: 'j', value: `${o.j * 2}/2` }]),
        { term: 'Radial nodes', value: radialNodes(o.n, o.l) },
        { term: 'Angular nodes', value: surfaces ? `${o.l} — ${surfaces}` : String(o.l) },
        { term: 'Enclosed', value: `${percent(extras.enclosedFraction)} of the electron` },
        { term: 'Iso value', value: extras.isoLevel === null ? '—' : `|ψ|² = ${extras.isoLevel.toExponential(2)}` },
        ...(extras.energy === null ? [] : [{ term: 'Orbital energy', value: energyText(extras.energy, extras.method) }]),
    ];
    const shape = shapeWord(o.l, o.ml);
    const notes = ['ψ changes sign across every node.', ...(shape ? [`Shape: ${shape} (qualitative).`] : [])];
    return { title: `${orbitalName(o.n, o.l, o.ml)} orbital`, rows, notes };
}

export function subshellFacts(
    s: { n: number; l: number; j?: number; electrons: number },
    extras: { enclosedFraction: number; energy: number | null; method: string },
): OrbitalFacts {
    const capacity = s.j === undefined ? 2 * (2 * s.l + 1) : 2 * s.j + 1;
    const electrons = Number.isInteger(s.electrons) ? String(s.electrons) : s.electrons.toFixed(2);
    return {
        title: `${subshellLabel(s.n, s.l, s.j)} subshell`,
        rows: [
            { term: 'n', value: String(s.n) },
            { term: 'l', value: `${s.l} (${shellLetter(s.l)})` },
            { term: 'Electrons', value: `${electrons} of ${capacity}` },
            { term: 'Radial nodes', value: radialNodes(s.n, s.l) },
            { term: 'Angular nodes', value: `${s.l} per orbital` },
            { term: 'Enclosed', value: `${percent(extras.enclosedFraction)} of the electron` },
            ...(extras.energy === null ? [] : [{ term: 'Orbital energy', value: energyText(extras.energy, extras.method) }]),
        ],
        notes: ['ψ changes sign across every node.'],
    };
}

export function atomFacts(args: { title: string; configuration: string; valence: string; shellCount: number; drawnRadius: number; method: string }): OrbitalFacts {
    return {
        title: args.title,
        rows: [
            { term: 'Configuration', value: args.configuration },
            { term: 'Valence', value: args.valence },
            { term: 'Shells', value: String(args.shellCount) },
            { term: 'Drawn radius', value: `${formatDrawnRadius(args.drawnRadius)} a₀ (${args.method})` },
        ],
        notes: [],
    };
}
```

- [ ] **Step 4: RadialPlot titles, captions and signed curves; the CSV quantity**

`src/components/RadialPlot.tsx`: add to the props

```ts
    /** The plot tab's exact axis title (spec §9.1); the computed title when absent. */
    title?: string;
    /** A note under the title, e.g. "radial factor of |ψ|²". */
    caption?: string | null;
    /** R(r) changes sign: zero line in the middle, scaled by the largest |value|. */
    signed?: boolean;
```

destructure `title: titleOverride, caption = null, signed = false`; in `multiCurvePaths` compute `const extent = signed ? max |value| : globalMax` and `const y = signed ? PADDING.top + plotHeight * (0.5 - point.value / (2 * extent)) : PADDING.top + plotHeight * (1 - point.value / extent)` (the unsigned branch is today's formula; add `signed` to the memo's dependencies); after the curves, when `signed`, draw `<line className="radial-plot-zero" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={PADDING.top + plotHeight / 2} y2={PADDING.top + plotHeight / 2} />`; `const title = titleOverride ?? (isMultiCurve ? … : …)` (today's expression); render `{caption && <div className="radial-plot-note">{caption}</div>}` right after the title. Add to `src/style.css`: `.radial-plot-zero { stroke: var(--ql-color-plot-axis); stroke-width: 1; stroke-dasharray: 2 2; }`.

`src/export/run_export.ts`: add to `ExportContext` `/** A plot tab's own quantity line (spec §9.1, ruling C6); absent keeps today's D(r) statement. */ csvQuantity?: string;`. In `csvFor`, the quantity becomes

```ts
    const quantity = context.csvQuantity ?? (state.atom.mode === 'atom'
        ? 'D(r) = 4*pi*r^2*rho(r), electrons per bohr (the radial distribution, not the density)'
        : 'P(r) = r^2*R(r)^2, probability per bohr');
```

(today's two strings, unchanged); push the orbital-level D(r) note only when `!context.csvQuantity`, and run the comparison-curve block only when `profile && !context.csvQuantity` (the dashed comparisons belong to the distribution tab alone, spec §9.1).

- [ ] **Step 5: The facts card and the Atom inspector**

`src/atom_ui/OrbitalFactsCard.tsx`:

```tsx
import React from 'react';
import type { OrbitalFacts } from '../orbital_facts';
import './inspector_atom.css';

/** The inspector's Data card (spec §9.1). */
const OrbitalFactsCard: React.FC<{ facts: OrbitalFacts }> = ({ facts }) => (
    <section className="facts-card" aria-label="orbital facts">
        <h2 className="ql-section">{facts.title}</h2>
        <dl className="facts-list ql-tabular">
            {facts.rows.map(row => (
                <React.Fragment key={row.term}>
                    <dt>{row.term}</dt>
                    <dd>{row.value}</dd>
                </React.Fragment>
            ))}
        </dl>
        {facts.notes.length > 0 && (
            <ul className="facts-notes ql-caption">{facts.notes.map(note => <li key={note}>{note}</li>)}</ul>
        )}
    </section>
);

export default OrbitalFactsCard;
```

`src/atom_ui/AtomInspector.tsx`:

```tsx
import React, { useId, useState } from 'react';
import { Button } from '@mui/material';
import Inspector from '../shell/Inspector';
import TabRow from '../shell/TabRow';
import type { PlotTab } from '../atom/plot_tabs';
import type { PlotTabId } from '../design/presentation';
import type { OrbitalFacts } from '../orbital_facts';
import OrbitalFactsCard from './OrbitalFactsCard';
import './inspector_atom.css';

interface AtomInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    open?: boolean;
    onOpenChange?(open: boolean): void;
    plotTabs: PlotTab[];
    plotTab: PlotTab;
    onPlotTab(id: PlotTabId): void;
    /** The RadialPlot for `plotTab`, built by App from the same curves the CSV exports. */
    plot: React.ReactNode;
    facts: OrbitalFacts | null;
    /** Why the CSV cannot be exported now (exportAvailability), or null. */
    csvReason: string | null;
    onExportCsv(): void;
}

/** The Atom screen's inspector (spec §9.1): Plot, with its function tabs, and Data. */
const AtomInspector: React.FC<AtomInspectorProps> = ({ variant, open, onOpenChange, plotTabs, plotTab, onPlotTab, plot, facts, csvReason, onExportCsv }) => {
    const [tab, setTab] = useState('plot');
    const id = useId();
    const plotContent = (
        <>
            <TabRow idPrefix={`${id}-plot`} label="plot" tabs={plotTabs.map(t => ({ key: t.id, label: t.label }))} active={plotTab.id}
                onChange={key => onPlotTab(key as PlotTabId)} />
            <div role="tabpanel" id={`${id}-plot-panel-${plotTab.id}`} aria-labelledby={`${id}-plot-tab-${plotTab.id}`} className="plot-tab-panel">
                {plot}
            </div>
        </>
    );
    const dataContent = (
        <>
            {facts && <OrbitalFactsCard facts={facts} />}
            <Button variant="outlined" size="small" disabled={csvReason !== null} title={csvReason ?? undefined} onClick={onExportCsv}>
                Export CSV of this plot
            </Button>
        </>
    );
    return (
        <Inspector
            variant={variant}
            open={open}
            onOpenChange={onOpenChange}
            activeTab={tab}
            onTab={setTab}
            tabs={[{ key: 'plot', label: 'Plot', content: plotContent }, { key: 'data', label: 'Data', content: dataContent }]}
        />
    );
};

export default AtomInspector;
```

`src/atom_ui/inspector_atom.css`:

```css
/* src/atom_ui/inspector_atom.css -- the Atom inspector's plot tabs and facts card (spec §9.1). */
.plot-tab-panel { padding-top: 12px; }
.inspector-body .ql-tabs { padding: 0; gap: 12px; }
.inspector-body .ql-tab { font-size: var(--ql-type-caption-size); }
.facts-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: var(--ql-radius-lg);
  background: var(--ql-color-surface-2); border: 1px solid var(--ql-color-border-subtle); }
.facts-list { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: var(--ql-type-body-size); }
.facts-list dt { color: var(--ql-color-text-2); }
.facts-list dd { margin: 0; color: var(--ql-color-text-1); }
.facts-notes { margin: 0; padding-left: 16px; }
```

- [ ] **Step 6: App wires the Atom inspector**

In `src/App.tsx`:

```tsx
import AtomInspector from './atom_ui/AtomInspector';
import { plotTabsFor, resolvePlotTab, tabCurves } from './atom/plot_tabs';
import { atomFacts, orbitalFacts, subshellFacts } from './orbital_facts';
import { displayPref, type PlotTabId } from './design/presentation';
import { shortMethodLabel } from './atom/relativity';
import { configurationLabelOf, valenceConfigurationLabelOf } from './atom/configurations';
import { shellName } from './shell/view_title';
```

After `atomCurves`/`comparisonCurves`:

```tsx
    const display = usePref(displayPref);
    const atomPlotTabs = useMemo(
        () => (atomProfile ? plotTabsFor(atomLevel, atomSelectedSubshell !== null, pictureRelativity !== 'off') : []),
        [atomProfile, atomLevel, atomSelectedSubshell, pictureRelativity],
    );
    const activePlotTab = atomPlotTabs.length > 0 ? resolvePlotTab(atomPlotTabs, display.plotTab) : null;
    const handlePlotTab = useCallback((id: PlotTabId) => displayPref.set({ ...displayPref.get(), plotTab: id }), []);
    const atomTabCurves = useMemo(
        () => (atomProfile && activePlotTab
            ? tabCurves(activePlotTab.id, { profile: atomProfile, selectedSubshell: atomSelectedSubshell, rGrid: atomRGrid, distribution: atomCurves })
            : []),
        [atomProfile, activePlotTab, atomSelectedSubshell, atomRGrid, atomCurves],
    );
    const atomFactsNow = useMemo(() => {
        if (!atomProfile) return null;
        const method = shortMethodLabel(pictureRelativity);
        const find = (s: { n: number; l: number; j?: number }) => atomProfile.subshells.find(x => x.n === s.n && x.l === s.l && x.j === s.j);
        if (atomLevel === 'orbital' && atomSelectedOrbital) {
            return orbitalFacts(atomSelectedOrbital, { enclosedFraction, isoLevel, energy: find(atomSelectedOrbital)?.energy ?? null, method });
        }
        if (atomSelectedSubshell) {
            const sub = find(atomSelectedSubshell);
            return sub ? subshellFacts(sub, { enclosedFraction, energy: sub.energy, method }) : null;
        }
        const configuration = speciesConfiguration(species);
        const shell = atomSelectedShell !== null ? atomProfile.shells.find(s => s.n === atomSelectedShell) : undefined;
        return atomFacts({
            title: shell ? shellName(shell.n) : 'Whole atom',
            configuration: configurationLabelOf(configuration), valence: valenceConfigurationLabelOf(configuration),
            shellCount: atomProfile.shells.length, drawnRadius: shell ? shell.contourRadius : atomProfile.displayRadius, method,
        });
    }, [atomProfile, pictureRelativity, atomLevel, atomSelectedOrbital, atomSelectedSubshell, atomSelectedShell, enclosedFraction, isoLevel, species]);
```

- the atom branch of `renderRadialPlot` uses the tab:

```tsx
        return atomProfile && activePlotTab && (
            <RadialPlot
                n={1} l={0} Z={atomProfile.Z} rMax={atomPlotRange}
                scale={atomLevel === 'atom' ? 'sqrt' : 'linear'} width={width} collapsible={collapsible}
                curves={themed(activePlotTab.id === 'distribution' ? [...atomCurves, ...comparisonCurves] : atomTabCurves)}
                title={activePlotTab.title} caption={activePlotTab.caption} signed={activePlotTab.signed}
                comparisonNote={activePlotTab.id === 'distribution' ? comparisonNote : null}
                peaks={activePlotTab.id === 'distribution' ? Array.from(atomProfile.shellPeaks) : undefined}
                cutFaceNote={atomLevel !== 'orbital'}
                hoverRadius={atomHoverRadius} onHoverRadius={handleAtomHoverRadius}
            />
        );
```

- `csvCurvesNow`: `if (isAtomMode) return activePlotTab && activePlotTab.id !== 'distribution' ? atomTabCurves : atomCurves;` (dependencies gain `activePlotTab`, `atomTabCurves`), and `handleExport`'s context gains `csvQuantity: isAtomMode ? activePlotTab?.csvQuantity ?? undefined : undefined` (and its dependency list `activePlotTab`).
- the atom inspector (desktop docked, medium drawer, phone stacked):

```tsx
    const atomInspector = (variant: 'docked' | 'drawer' | 'stacked') => activePlotTab && (
        <AtomInspector variant={variant} open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)}
            plotTabs={atomPlotTabs} plotTab={activePlotTab} onPlotTab={handlePlotTab}
            plot={renderRadialPlot(variant === 'stacked' ? PHONE_PLOT_WIDTH : PLOT_WIDTH, false)}
            facts={atomFactsNow} csvReason={availability.csv} onExportCsv={() => { void handleExport('csv', {}); }} />
    );
```

  `AppShell`'s `inspector` becomes `isAtomMode ? atomInspector('docked') : <Inspector variant="docked" body={inspectorBody} />`; the medium drawer becomes `isAtomMode ? atomInspector('drawer') : <Inspector variant="drawer" …/>` (today's); the phone's atom Plot tab content becomes `atomInspector('stacked')`. (`availability.csv` is the CSV reason `exportAvailability` already computes for the Export menu.)

- [ ] **Step 7: Run the tests**

Run: `npx jest tests/atom/plot_tabs.test.ts tests/orbital_facts.test.ts tests/atom_ui tests/atom/radial_plot.test.tsx tests/export/run_export.test.ts` → PASS (the hydrogen and helium solves take a few seconds). Then `npx jest src/App.test.tsx` → PASS (the existing atom tests see the default "Radial distribution" tab: same curves, same legend). Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 8: Live check [visual] (expect ~4 min)**

```bash
node tools/design/shoot.mjs --task T13 --scenes c-whole,c-2pz,fe-shell --themes dark,light --sizes desktop,phone
```

Checklist `/tmp/6g1-T13-checklist.md` against concept B's plot ("Wave function / Probability density / Radial distribution" tabs over the plot) and concept A's inspector proportions: Plot | Data tabs with the underline; the plot tab row; the plot 258 px wide inside the 290 px panel; plot chrome in tokens (axes `plot-axis`, grid `plot-grid`); light curves are the light palette; the Data card's rows read as in Step 3 for 2p_z (n 2, l 1 (p), mₗ 0, 2p_z, 0 radial nodes, "1 — the xy plane", "90 % of the electron", the iso value, the orbital energy with its method). For Fe shell: "Density" and "Radial distribution" tabs. On the phone: the Plot tab shows Plot then Data, stacked. Science: on the Radial distribution tab, the curves, legend and title are today's.

- [ ] **Step 9: Commit**

```bash
git add src/atom/plot_tabs.ts src/orbital_facts.ts src/atom_ui/OrbitalFactsCard.tsx src/atom_ui/AtomInspector.tsx src/atom_ui/inspector_atom.css src/components/RadialPlot.tsx src/export/run_export.ts src/App.tsx src/style.css tests/atom/plot_tabs.test.ts tests/orbital_facts.test.ts tests/atom_ui/atom_inspector.test.tsx tests/atom/radial_plot.test.tsx tests/export/run_export.test.ts src/App.test.tsx
git commit -m "feat(atom): inspector -- R(r), |R(r)|², ρ(r) and D(r) plot tabs, CSV of the tab on screen, orbital facts card (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/atom/plot_tabs.ts src/orbital_facts.ts src/atom_ui/OrbitalFactsCard.tsx src/atom_ui/AtomInspector.tsx src/atom_ui/inspector_atom.css src/components/RadialPlot.tsx src/export/run_export.ts src/App.tsx src/style.css tests/atom/plot_tabs.test.ts tests/orbital_facts.test.ts tests/atom_ui/atom_inspector.test.tsx tests/atom/radial_plot.test.tsx tests/export/run_export.test.ts src/App.test.tsx
```

---

### Task 14: Renderer appearance in place — transparent canvas, schemes, palettes, axes, Classic [visual]

**Estimate:** 2.5 h. **Spec:** §3.2, §6.6, §11.1 (every row except Material and Lights, which are Task 15), §11.3, §11.5 (the Density scheme on the cut face), ruling R12 (hydrogen in Light Clean). Nothing is re-meshed: colours, uniforms and the axes change on the existing objects.

**Files:**
- Create: `src/design/appearance.ts`
- Modify: `src/orbital_visualizer.ts`, `src/clip_caps.ts`, `src/atom/shell_view.ts`, `src/atom/shell_composition_view.ts`, `src/field_overlay_view.ts`, `src/molecules/ball_and_stick.ts`, `src/export/png.ts` (`CaptureTarget.background`), `src/components/OrbitalViewer.tsx`
- Test: `tests/visualizer_appearance.test.ts` (new); additions to `tests/orbital_viewer.test.tsx` (and `setAppearance: jest.fn()` in its `orbital_visualizer` mock), `tests/export/png.test.ts`

**Interfaces:**
- Consumes: `phaseColours`, `curvePalette`, `themeCurveColour`, `densitySurfaceHex`, `axesStyle`, `canvasSolid`, `linearRgb`, `displayRgb`, `DENSITY_RAMP`, `CLASSIC` (Task 12); `renderPref`, `displayPref`, `Finish`, `ColourScheme` (Task 11); `useQuantumTheme` (Task 2); `usePref` (Task 2).
- Produces:
  - `src/design/appearance.ts`: `interface Appearance { theme: ThemeMode; scheme: ColourScheme; finish: Finish; showAxes: boolean; lowPower: boolean }`; `CLASSIC_APPEARANCE: Appearance` (`{ theme: 'dark', scheme: 'classic', finish: 'solid', showAxes: true, lowPower: false }` — today's look, and what the visualizer uses when nobody has called `setAppearance`).
  - `orbital_visualizer.ts`: `VisualizerContext.appearance?: Appearance`; `setAppearance(context: VisualizerContext | null, appearance: Appearance): void`; every scene object that has colours carries `userData.applyAppearance(appearance)`; the axes group carries `userData.size` and `userData.styleKey`; the canvas is transparent (`alpha: true`, `scene.background = null`, clear alpha 0).
  - `clip_caps.ts`: `setCapsPhaseColours(caps, positive: [number, number, number], negative: [number, number, number]): void` (display-space 0–1); `setCapsDensityRamp(caps, on: boolean): void`; cap uniforms `rampMode` and `ramp[6]`.
  - `shell_view.ts`: `ShellViewOptions.palette?: readonly string[]`; `setShellViewPalette(view, palette): void`.
  - `shell_composition_view.ts`: `createCompositionLobesGroup(…, palette?: readonly string[])`; `recolourCompositionLobes(group, palette): void`.
  - `field_overlay_view.ts`: `recolourFieldOverlay(group, palette): void`.
  - `ball_and_stick.ts`: each atom material has `userData.Z`.
  - `png.ts`: `CaptureTarget.background?: string` — painted under the canvas before it is copied (§6.6: never a transparent hole).

- [ ] **Step 1: Write the failing tests**

`tests/visualizer_appearance.test.ts`:

```ts
import * as THREE from 'three';

jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../src/workers/createOrbitalWorker';
import { VisualizerContext, setAppearance, updateAtomViewInScene, updateOrbitalInScene } from '../src/orbital_visualizer';
import { defaultSurfaceStyle, MeshData } from '../src/types/orbital';
import { CLASSIC_APPEARANCE } from '../src/design/appearance';
import { CURVE_COLORS } from '../src/curve_colors';
import { CURVE_COLORS_LIGHT, DENSITY_RAMP, displayRgb, linearRgb } from '../src/design/science';

/** A VisualizerContext without a WebGLRenderer (jsdom has no WebGL) -- tests/atom/visualizer_dispatch.test.ts's recipe. */
function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
    };
}
const fakeWorker = () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null });
const meshData = (): MeshData => ({
    positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]], psiSigns: [1, -1, 1],
    densityMap: { data: new Uint8Array(1), side: 1, rMax: 20 }, isoLevel: 0.5,
});
async function drawOrbital(context: VisualizerContext) {
    const worker = fakeWorker();
    (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
    const pending = updateOrbitalInScene(context, { n: 2, l: 1, ml: 0, Z: 1, resolution: 4, rMax: 20, enclosedFraction: 0.9 });
    worker.onmessage!({ data: { type: 'success', meshData: meshData() } });
    await pending;
}
const surfaceOf = (context: VisualizerContext) => {
    let found: THREE.Mesh | null = null;
    context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) found = o; });
    return found! as THREE.Mesh;
};
const capOf = (context: VisualizerContext) => {
    let found: THREE.Mesh | null = null;
    context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.userData.isCap) found = o; });
    return found! as THREE.Mesh;
};
const colourAt = (mesh: THREE.Mesh, i: number) => {
    const c = mesh.geometry.getAttribute('color');
    return [c.getX(i), c.getY(i), c.getZ(i)];
};

describe('the renderer\'s appearance (spec §6.6, §11)', () => {
    it('draws today\'s Classic constants until told otherwise (§11.3)', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const surface = surfaceOf(context);
        expect(colourAt(surface, 0)).toEqual([1, 0, 0]);
        expect(colourAt(surface, 1)).toEqual([0, 0, 1]);
        const cap = capOf(context).material as THREE.ShaderMaterial;
        expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb('#D42020'));
        expect(cap.uniforms.negativePhase.value.toArray()).toEqual(displayRgb('#2030D4'));
        expect(cap.uniforms.rampMode.value).toBe(0);
        expect(context.currentAxesHelper!.children.some(child => child instanceof THREE.AxesHelper)).toBe(true);
    });

    it('recolours the same mesh in place for a theme and scheme, and back to Classic exactly', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const surface = surfaceOf(context);
        const geometry = surface.geometry;
        const positions = geometry.getAttribute('position').array;
        setAppearance(context, { theme: 'light', scheme: 'phase', finish: 'solid', showAxes: true, lowPower: false });
        expect(surfaceOf(context)).toBe(surface);
        expect(surface.geometry).toBe(geometry);
        expect(geometry.getAttribute('position').array).toBe(positions);
        linearRgb('#E8590C').forEach((v, k) => expect(colourAt(surface, 0)[k]).toBeCloseTo(v, 6));
        linearRgb('#1F5FE0').forEach((v, k) => expect(colourAt(surface, 1)[k]).toBeCloseTo(v, 6));
        setAppearance(context, CLASSIC_APPEARANCE);
        expect(colourAt(surface, 0)).toEqual([1, 0, 0]);
        expect(colourAt(surface, 1)).toEqual([0, 0, 1]);
    });

    it('maps |ψ|² on the cut face through the density ramp only in the Density scheme', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const cap = capOf(context).material as THREE.ShaderMaterial;
        setAppearance(context, { theme: 'dark', scheme: 'density', finish: 'solid', showAxes: true, lowPower: false });
        expect(cap.uniforms.rampMode.value).toBe(1);
        expect(cap.uniforms.ramp.value[0].toArray()).toEqual(displayRgb(DENSITY_RAMP[0]));
        expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb('#FF7A2F'));
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'solid', showAxes: true, lowPower: false });
        expect(cap.uniforms.rampMode.value).toBe(0);
    });

    it('restyles the axes to one hue, hides them on request, and keeps them a helper', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        const axes = context.currentAxesHelper!;
        expect(axes.children.some(child => child instanceof THREE.AxesHelper)).toBe(false);
        expect(axes.children.some(child => child instanceof THREE.LineSegments)).toBe(true);
        expect(axes.userData.isAxes).toBe(true);
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: false, lowPower: false });
        expect(context.currentAxesHelper!.visible).toBe(false);
    });

    it('gives a shell view the light curve palette, index for index', () => {
        const context = buildContext();
        updateAtomViewInScene(context, {
            contourRadius: 4, shellEmphasis: new Float32Array([0.1, 0.4, 1, 0.3, 0.05]), rMin: 0.1, dx: 0.5, size: 5, rMax: 0.1 * Math.exp(2),
        });
        let cap: THREE.ShaderMaterial | null = null;
        context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.userData.isCap) cap = o.material as THREE.ShaderMaterial; });
        const paletteOf = () => (cap as unknown as THREE.ShaderMaterial).uniforms.palette.value.map((v: THREE.Vector3) => v.toArray());
        expect(paletteOf()[3]).toEqual(displayRgb(CURVE_COLORS[3]));
        setAppearance(context, { theme: 'light', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        expect(paletteOf()[3]).toEqual(displayRgb(CURVE_COLORS_LIGHT[3]));
    });
});
```

(`displayRgb` and the shell view's `hexToRgb01` both divide by 255, so the palette comparison is exact.)

`tests/orbital_viewer.test.tsx`: add `setAppearance: jest.fn(),` to the `jest.mock('../src/orbital_visualizer', …)` factory and `setAppearance` to the named import from `'../src/orbital_visualizer'`; add imports `import { themeChoicePref } from '../src/design/theme_storage';` and `import { renderPref } from '../src/design/presentation';`; and add:

```tsx
    it('restyles in place on a theme or scheme change -- one renderer for the session (spec §3.2)', () => {
        renderViewer();
        act(() => { themeChoicePref.set('light'); });
        act(() => { renderPref.set({ finish: 'solid', scheme: 'classic' }); });
        expect(initVisualizer).not.toHaveBeenCalled();
        expect(cleanupVisualizer).not.toHaveBeenCalled();
        expect(setAppearance).toHaveBeenLastCalledWith(expect.anything(),
            expect.objectContaining({ theme: 'light', scheme: 'classic', finish: 'solid' }));
        window.localStorage.clear();
    });
```

(`cleanupVisualizer` must be in the named import too.)

`tests/export/png.test.ts` — add:

```ts
describe('captureViewPng over a transparent canvas (spec §6.6)', () => {
    it('paints the theme\'s solid canvas colour first, so a PNG never has a transparent hole', async () => {
        const { calls, factory } = recorder();
        const { renderer } = fakeRenderer(400, 300);
        await captureViewPng({ renderer, render: () => {}, background: '#04142A' }, { x: 0, y: 0, width: 400, height: 300 }, null, factory);
        const fill = calls.findIndex(c => c[0] === 'fillRect');
        const draw = calls.findIndex(c => c[0] === 'drawImage');
        expect(fill).toBeGreaterThanOrEqual(0);
        expect(fill).toBeLessThan(draw);
    });
});
```

(If `fakeRenderer` returns the renderer under a different name, use the file's own; `recorder()` is the file's existing helper.)

Run: `npx jest tests/visualizer_appearance.test.ts tests/orbital_viewer.test.tsx tests/export/png.test.ts`
Expected: FAIL — `setAppearance`, `rampMode`, `background` do not exist.

- [ ] **Step 2: `src/design/appearance.ts`**

```ts
import type { ColourScheme, Finish } from './presentation';
import type { ThemeMode } from './tokens';

/** What OrbitalViewer tells the renderer about how to draw (spec §6.6): never part of a link. */
export interface Appearance {
    theme: ThemeMode;
    scheme: ColourScheme;
    finish: Finish;
    showAxes: boolean;
    /** A phone: Glow's halo and mesh lines stay off (spec §11.2, §15). */
    lowPower: boolean;
}

/** Today's look, constant for constant (§11.3): what the visualizer draws until setAppearance is called. */
export const CLASSIC_APPEARANCE: Appearance = { theme: 'dark', scheme: 'classic', finish: 'solid', showAxes: true, lowPower: false };
```

- [ ] **Step 3: The cut-face shader learns the ramp; the shell view and the lobes take a palette**

`src/clip_caps.ts`:
- import `{ DENSITY_RAMP, displayRgb }` from `'./design/science'`.
- In `CAP_FRAGMENT_SHADER` add `uniform float rampMode;` and `uniform vec3 ramp[6];` after the other uniforms, and replace the `vec3 color = mix(…);` line with:

```glsl
        vec3 color;
        if (rampMode > 0.5) {
            // "Density on the cut face" (spec §11.5): |ψ|² from the surface
            // value (Low) to the peak (High), log scale -- climb is exactly
            // that quantity -- through the six-stop ramp.
            float t = clamp(climb, 0.0, 1.0) * 5.0;
            int i = int(floor(t));
            color = mix(ramp[i], ramp[min(i + 1, 5)], t - float(i));
        } else {
            // Dark where the cut meets the surface, full colour through the body of
            // the lobe, washing out at the densest point.
            color = mix(phase * (0.25 + 0.75 * climb), vec3(1.0), pow(climb, 2.2));
        }
```

- in the cap material's `uniforms` (where `positivePhase`/`negativePhase` are set) add `rampMode: { value: 0 }` and `ramp: { value: DENSITY_RAMP.map(hex => new THREE.Vector3(...displayRgb(hex))) }`.
- add:

```ts
/** The cut face's two phase colours, display-space 0–1 (science.ts displayRgb of phaseColours' caps). */
export function setCapsPhaseColours(caps: THREE.Object3D, positive: [number, number, number], negative: [number, number, number]): void {
    caps.traverse(object => {
        const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (!material?.uniforms?.positivePhase) return;
        material.uniforms.positivePhase.value.set(...positive);
        material.uniforms.negativePhase.value.set(...negative);
    });
}

/** The Density scheme's ramp on the cut face, on or off (spec §11.5). */
export function setCapsDensityRamp(caps: THREE.Object3D, on: boolean): void {
    caps.traverse(object => {
        const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (material?.uniforms?.rampMode) material.uniforms.rampMode.value = on ? 1 : 0;
    });
}
```

`src/atom/shell_view.ts`: add `/** The theme's curve palette (science.ts); CURVE_COLORS by default. */ palette?: readonly string[];` to `ShellViewOptions`; replace `const PALETTE = CURVE_COLORS.map(…)` with `const paletteVectors = (palette: readonly string[]) => palette.map(hex => new THREE.Vector3(...hexToRgb01(hex)));`; in `createShellView` use `palette: { value: paletteVectors(options.palette ?? CURVE_COLORS) }`; and add

```ts
/** Recolours a shell view's rings in place (spec §11.1 "Shell rings"): same indices, the theme's palette. */
export function setShellViewPalette(view: THREE.Object3D | null, palette: readonly string[]): void {
    view?.traverse(child => {
        const material = (child as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (material?.uniforms?.palette) material.uniforms.palette.value = paletteVectors(palette);
    });
}
```

`src/atom/shell_composition_view.ts`: give `createCompositionLobesGroup` a last parameter `palette: readonly string[] = CURVE_COLORS`; use `palette[component.colorIndex % palette.length]` for `baseColor`; store `mesh.userData.lobe = { colorIndex: component.colorIndex, l: component.l, ml: component.ml }` and `group.userData.distinguishOrbitals = distinguishOrbitals`; and add

```ts
/** Recolours the lobes in place with a palette, keeping each lobe's index and shade (spec §11.1 "Subshell members"). */
export function recolourCompositionLobes(group: THREE.Object3D, palette: readonly string[]): void {
    const distinguish = Boolean(group.userData.distinguishOrbitals);
    group.traverse(child => {
        const lobe = child.userData.lobe as { colorIndex: number; l: number; ml: number } | undefined;
        if (!lobe || !(child instanceof THREE.Mesh)) return;
        const base = palette[lobe.colorIndex % palette.length];
        (child.material as THREE.MeshStandardMaterial).color.set(distinguish ? orbitalShade(base, lobe.l + lobe.ml, 2 * lobe.l + 1) : base);
    });
}
```

`src/field_overlay_view.ts`: in `createFieldOverlayGroup` keep what a recolour needs — `group.userData.overlaySigns = meshes.map(mesh => mesh.psiSigns)` and `group.userData.overlayColors = colors` — and add

```ts
/** Recolours a combination overlay in place (spec §11.1 "Combination overlay"): the theme's palette, the ψ < 0 shade rule unchanged. */
export function recolourFieldOverlay(group: THREE.Object3D, palette: readonly string[]): void {
    const signs = group.userData.overlaySigns as number[][] | undefined;
    const colors = group.userData.overlayColors as string[] | undefined;
    if (!signs || !colors) return;
    const themed = colors.map(colour => themeCurveColour(colour, palette));
    const vertexColours = overlayVertexColors(signs.map(psiSigns => ({ psiSigns } as MeshData)), themed);
    group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const attribute = child.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        if (!attribute || attribute.array.length !== vertexColours.length) return;
        (attribute.array as Float32Array).set(vertexColours);
        attribute.needsUpdate = true;
    });
}
```

(import `themeCurveColour` from `'./design/science'`). `overlayVertexColors` reads only `psiSigns`, so the cast is enough.

`src/molecules/ball_and_stick.ts`: where each element's material is created, add `material.userData.Z = Z` (build the material in a local, set it, then `materials.set(Z, material)`).

- [ ] **Step 4: `setAppearance` and its consumers in `src/orbital_visualizer.ts`**

Imports:

```ts
import { CLASSIC_APPEARANCE, type Appearance } from './design/appearance';
import { axesStyle, curvePalette, densitySurfaceHex, displayRgb, linearRgb, phaseColours } from './design/science';
import { setCapsDensityRamp, setCapsPhaseColours } from './clip_caps';
import { setShellViewPalette } from './atom/shell_view';
import { recolourCompositionLobes } from './atom/shell_composition_view';
import { recolourFieldOverlay } from './field_overlay_view';
import { CPK_COLORS } from './molecules/ball_and_stick';
```

(merge with the existing imports from those modules).

`VisualizerContext`: add

```ts
    /** How to draw (spec §6.6), set by OrbitalViewer; Classic until then. Optional so test doubles need not carry it. */
    appearance?: Appearance;
```

and a helper `const appearanceOf = (context: VisualizerContext): Appearance => context.appearance ?? CLASSIC_APPEARANCE;`.

`initVisualizer`: `scene.background = null;` (with a comment: the viewport cell paints the canvas gradient token behind a transparent canvas, §6.6); `new THREE.WebGLRenderer({ antialias: true, stencil: true, alpha: true, premultipliedAlpha: true })`; after `setPixelRatio`: `renderer.setClearColor(0x000000, 0);`; in the context literal `appearance: CLASSIC_APPEARANCE`.

`updateSceneWithMeshData`: replace the colour-filling block and the caps colouring with a closure that does both and is kept for later:

```ts
        const colouring: 'custom' | 'density' | 'phase' = vertexColors ? 'custom' : uniformColour ? 'density' : 'phase';
        const signs = Int8Array.from(meshData.psiSigns, sign => (sign === 1 ? 1 : -1));
        if (vertexColors) {
            if (vertexColors.length !== meshData.positions.length * 3) {
                throw new Error(`mesh has ${meshData.positions.length} vertices, vertex colours given for ${vertexColors.length / 3}`);
            }
            colors.set(vertexColors);
        }
        // …geometry, material, mesh and caps are built exactly as before…
        const paint = (appearance: Appearance) => {
            const phase = phaseColours(appearance.theme, appearance.scheme);
            const attribute = geometry.getAttribute('color') as THREE.BufferAttribute;
            if (colouring === 'phase') {
                const [positive, negative] = [linearRgb(phase.positive), linearRgb(phase.negative)];
                for (let i = 0; i < signs.length; i++) attribute.setXYZ(i, ...(signs[i] === 1 ? positive : negative));
                attribute.needsUpdate = true;
                setCapsPhaseColours(caps, displayRgb(phase.capPositive), displayRgb(phase.capNegative));
                setCapsDensityRamp(caps, appearance.scheme === 'density');
            } else if (colouring === 'density') {
                // One colour throughout: a density carries no phase (ruling T7-a). THREE.Color, as before, for the cap's uniform.
                const colour = new THREE.Color(densitySurfaceHex(appearance.theme, appearance.scheme));
                for (let i = 0; i < signs.length; i++) attribute.setXYZ(i, colour.r, colour.g, colour.b);
                attribute.needsUpdate = true;
                setCapsPositiveColour(caps, colour);
            }
        };
        paint(appearanceOf(context));
        mesh.userData.applyAppearance = paint;
```

(the `uniformColour` argument keeps its meaning — "draw this as a density" — while its colour now comes from the scheme; `DENSITY_SURFACE_COLOUR` stays exported for any other user and equals Classic's. `linearRgb('#FF0000')` is exactly `[1, 0, 0]`, so Classic's vertex colours are today's to the bit.)

Where `createShellView({ … })` is called (≈ line 1553), add `palette: curvePalette(appearanceOf(context).theme, appearanceOf(context).scheme),` to its options and, after it, `view.userData.applyAppearance = (a: Appearance) => setShellViewPalette(view, curvePalette(a.theme, a.scheme));`.

Where `createCompositionLobesGroup(…)` is called (≈ line 1684), pass `curvePalette(appearanceOf(context).theme, appearanceOf(context).scheme)` as the new last argument and then `lobes.userData.applyAppearance = (a: Appearance) => recolourCompositionLobes(lobes, curvePalette(a.theme, a.scheme));`.

Where `createFieldOverlayGroup(…)` is called (≈ line 1190): after it, `group.userData.applyAppearance = (a: Appearance) => recolourFieldOverlay(group, curvePalette(a.theme, a.scheme)); group.userData.applyAppearance(appearanceOf(context));`.

`setMoleculeOverlay`: after `context.scene.add(overlay)`, `applyOverlayAppearance(overlay, appearanceOf(context));` with

```ts
/** Ruling R12: hydrogen's CPK white would vanish on Light Clean's page, so it is #F2F2F2 there (non-Classic). */
function applyOverlayAppearance(overlay: THREE.Object3D, appearance: Appearance): void {
    const hydrogen = appearance.theme === 'light' && appearance.scheme !== 'classic' ? '#F2F2F2' : CPK_COLORS[1];
    overlay.traverse(child => {
        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (material?.userData?.Z === 1) material.color.set(hydrogen);
    });
}
```

The axes — replace `AXIS_LABELS`, `addAxesHelper` and `removeAxesHelper` with:

```ts
const AXIS_DIRECTIONS: Array<{ text: 'x' | 'y' | 'z'; direction: [number, number, number] }> = [
    { text: 'x', direction: [1, 0, 0] }, { text: 'y', direction: [0, 1, 0] }, { text: 'z', direction: [0, 0, 1] },
];

/** §11.1 "Axes": Classic keeps AxesHelper's red/green/blue and today's labels; the themes draw one hue with 6 % arrowheads and labels in text-1. */
function addAxesHelper(context: VisualizerContext, size: number) {
    if (!context) return;
    removeAxesHelper(context);
    const appearance = appearanceOf(context);
    const style = axesStyle(appearance.theme, appearance.scheme);
    const group = new THREE.Group();
    group.userData.isAxes = true;
    group.userData.size = size;
    group.userData.styleKey = `${appearance.theme}|${appearance.scheme}`;
    if (style.perAxis) {
        group.add(new THREE.AxesHelper(size));
    } else {
        const lineMaterial = new THREE.LineBasicMaterial({ color: style.line, transparent: style.lineOpacity < 1, opacity: style.lineOpacity });
        const points = AXIS_DIRECTIONS.flatMap(({ direction: [x, y, z] }) => [new THREE.Vector3(), new THREE.Vector3(x, y, z).multiplyScalar(size)]);
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
        if (style.arrowheads) {
            for (const { direction: [x, y, z] } of AXIS_DIRECTIONS) {
                const head = new THREE.Mesh(new THREE.ConeGeometry(size * 0.022, size * 0.06, 16),
                    new THREE.MeshBasicMaterial({ color: style.line, transparent: style.lineOpacity < 1, opacity: style.lineOpacity }));
                // A cone points along +y; turn it onto its axis.
                head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z));
                head.position.set(x, y, z).multiplyScalar(size * 0.97);
                group.add(head);
            }
        }
    }
    for (const { text, direction: [x, y, z] } of AXIS_DIRECTIONS) {
        const sprite = createAxisLabel(text, style.labels[text]);
        if (!sprite) continue;
        sprite.position.set(x, y, z).multiplyScalar(size * 1.08);
        sprite.scale.setScalar(size * 0.12);
        group.add(sprite);
    }
    group.visible = appearance.showAxes;
    context.scene.add(group);
    context.currentAxesHelper = group;
}

function removeAxesHelper(context: VisualizerContext) {
    if (!context || !context.currentAxesHelper) return;
    context.scene.remove(context.currentAxesHelper);
    context.currentAxesHelper.traverse(object => {
        if (object instanceof THREE.AxesHelper) {
            object.dispose();
        } else if (object instanceof THREE.Sprite) {
            object.material.map?.dispose();
            object.material.dispose();
        } else if (object instanceof THREE.LineSegments || object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
        }
    });
    context.currentAxesHelper = null;
}
```

and the new export:

```ts
/**
 * Applies a new appearance in place (spec §6.6): vertex colours, cap and
 * shell-view uniforms, lobe and overlay colours, the axes. No remount, no
 * re-mesh, no camera change; each object recolours itself through the
 * `userData.applyAppearance` its creator left on it.
 */
export function setAppearance(context: VisualizerContext | null, appearance: Appearance): void {
    if (!context || context.isDisposed) return;
    context.appearance = appearance;
    const apply = (root: THREE.Object3D | null | undefined) => root?.traverse(object => {
        (object.userData.applyAppearance as ((a: Appearance) => void) | undefined)?.(appearance);
    });
    apply(context.currentOrbitalGroup);
    if (context.transition?.kind === 'cross-fade') apply(context.transition.outgoing);
    if (context.moleculeOverlay) applyOverlayAppearance(context.moleculeOverlay, appearance);
    const axes = context.currentAxesHelper;
    if (axes) {
        if (axes.userData.styleKey !== `${appearance.theme}|${appearance.scheme}`) addAxesHelper(context, axes.userData.size as number);
        context.currentAxesHelper!.visible = appearance.showAxes;
    }
}
```

(If the cross-fade transition's outgoing field is named differently in `VisualizerContext['transition']`, use that name.)

- [ ] **Step 5: PNG composites onto the theme's canvas colour; OrbitalViewer passes the appearance**

`src/export/png.ts`: in `CaptureTarget` add `/** §6.6: the theme's solid canvas colour, painted first -- the canvas is transparent. */ background?: string;`; in `captureViewPng`, right after `if (!painter) throw …`, add

```ts
    if (target.background) {
        painter.fillStyle = target.background;
        painter.fillRect(0, 0, out.width, out.height);
    }
```

(`ExportPainter` already has `fillStyle` and `fillRect`, from `OverlayPainter`.)

`src/components/OrbitalViewer.tsx`:

```tsx
import { useQuantumTheme } from '../design/useQuantumTheme';
import { usePref } from '../design/usePref';
import { displayPref, renderPref } from '../design/presentation';
import { canvasSolid } from '../design/science';
import type { Appearance } from '../design/appearance';
```

add `setAppearance` to the `orbital_visualizer` import; inside the component, before the initialisation effect:

```tsx
    const { mode: themeMode } = useQuantumTheme();
    const renderPrefs = usePref(renderPref);
    const displayPrefs = usePref(displayPref);
    const narrowForAppearance = useMediaQuery(NARROW_VIEWPORT);
    const appearance = useMemo<Appearance>(() => ({
        theme: themeMode, scheme: renderPrefs.scheme, finish: renderPrefs.finish,
        showAxes: displayPrefs.showAxes, lowPower: narrowForAppearance,
    }), [themeMode, renderPrefs, displayPrefs, narrowForAppearance]);
    // Read by the export handle, which outlives renders.
    const appearanceRef = useRef(appearance);
    appearanceRef.current = appearance;
```

(add `useMemo` to the React import). In the export handle's `capturePng`, pass `{ renderer: context.renderer, render: () => renderFrame(context), background: canvasSolid(appearanceRef.current.theme) }`. After the initialisation effect add:

```tsx
    // Spec §6.6: a theme, scheme, finish or axes change restyles the scene in place.
    useEffect(() => {
        setAppearance(visualizerContextRef.current, appearance);
    }, [appearance]);
```

- [ ] **Step 6: Run the tests**

Run: `npx jest tests/visualizer_appearance.test.ts tests/orbital_viewer.test.tsx tests/export/png.test.ts tests/atom/visualizer_dispatch.test.ts tests/orbital_material.test.ts tests/clip_caps.test.ts tests/atom/shell_view.test.ts` → PASS (the dispatch and shell-view suites build contexts without an appearance and must see exactly today's colours). Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 7: Live check [visual] (expect ~5 min)**

```bash
node tools/design/shoot.mjs --task T14 --scenes c-whole,c-2pz,fe-shell,basic-3dz2,water --themes dark,light --sizes desktop
```

Then the Density and Classic schemes (the tool's `--render` option presets `eov.render`):

```bash
node tools/design/shoot.mjs --task T14d --scenes c-2pz --themes dark,light --sizes desktop --render '{"finish":"solid","scheme":"density"}'
node tools/design/shoot.mjs --task T14c --scenes c-2pz --themes dark --sizes desktop --render '{"finish":"solid","scheme":"classic"}'
```

The Density run shows the cut face only if the view has a cut: open the Display tab in the screenshot's state is not possible headlessly, so for that run use the scene `c-2pz-cut` — add `"c-2pz-cut": "#mode=atom&Z=6&level=orbital&n=2&l=1&ml=0&cut=x:0.5"` to `tools/design/scenes.json` (a link's cut is part of today's URL state) and pass `--scenes c-2pz,c-2pz-cut`.

Checklist `/tmp/6g1-T14-checklist.md`: *Colours* — "canvas left edge" and "canvas upper right" now pass (canvas-on within ΔE₀₀ 5 of canvas-off: the WebGL canvas is transparent); the 2p_z lobes are `#FF7A2F`/`#2F6BFF` (dark) and `#E8590C`/`#1F5FE0` (light) under light (sample a lobe's brightest face by eye); the key's swatches are the same colours; Classic is red/blue exactly as before over the theme's gradient; the Fe shell rings use the light palette in Light Clean on the dark disc; axes are one blue-grey hue with arrowheads and text-coloured italic labels; Density with a cut shows the six-stop ramp on the cut face and the High/Low bar in the key. *Science* — iso note, enclosed fraction, key wording unchanged; `webglCanvases` 1. Compare the dark 2p_z with concept A's "Carbon – 2pz orbital": the colours are the concept's orange/blue family; the glow comes in Task 15.

- [ ] **Step 8: Commit**

```bash
git add src/design/appearance.ts src/orbital_visualizer.ts src/clip_caps.ts src/atom/shell_view.ts src/atom/shell_composition_view.ts src/field_overlay_view.ts src/molecules/ball_and_stick.ts src/export/png.ts src/components/OrbitalViewer.tsx tools/design/scenes.json tests/visualizer_appearance.test.ts tests/orbital_viewer.test.tsx tests/export/png.test.ts
git commit -m "feat(viewer): theme and scheme applied in place -- transparent canvas, phase and density colours, cut-face ramp, palettes, single-hue axes, Classic exact (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/design/appearance.ts src/orbital_visualizer.ts src/clip_caps.ts src/atom/shell_view.ts src/atom/shell_composition_view.ts src/field_overlay_view.ts src/molecules/ball_and_stick.ts src/export/png.ts src/components/OrbitalViewer.tsx tools/design/scenes.json tests/visualizer_appearance.test.ts tests/orbital_viewer.test.tsx tests/export/png.test.ts
```

---

### Task 15: Glow — rim, emissive, halo, mesh lines, lights, frame-time guard [visual]

**Estimate:** 2 h. **Spec:** §11.2 (all of it), §11.1 rows "Material", "Lights", "Ball-and-stick" (rim), §11.4 (no bloom), §15 (phone cost), rulings R10, R12. Glow is presentation only: geometry, iso value, cut planes, caps, stencil passes and opacity are untouched, and exports never see the halo or the lines.

**Files:**
- Create: `src/orbital_glow.ts`
- Modify: `src/orbital_visualizer.ts`
- Test: `tests/orbital_glow.test.ts` (new), additions to `tests/visualizer_appearance.test.ts`

**Interfaces:**
- Consumes: `Appearance`, `CLASSIC_APPEARANCE` (Task 14); `phaseColours` (Task 12); the T14 `paint` closure in `updateSceneWithMeshData`, `setAppearance`, `applyOverlayAppearance`, `appearanceOf`.
- Produces (`src/orbital_glow.ts`):
  - `interface GlowSettings { mode: 'additive' | 'ink'; rimPositive: THREE.Color; rimNegative: THREE.Color; emissive: number; rimStrength: number }`
  - `glowSettingsFor(appearance: Appearance): GlowSettings | null` (null for Classic or the Solid finish)
  - `applyGlow(material: THREE.MeshStandardMaterial, settings: GlowSettings | null): void` (in place; recompiles only when glow turns on or off)
  - `attachGlowExtras(group: THREE.Group, surface: THREE.Mesh, appearance: Appearance, options: { radius: number; clippingPlanes: THREE.Plane[]; solid: boolean; linesAllowed: boolean }): void` (halo in Deep Space only; lines unless low power or suppressed; neither in wireframe)
  - `updateFrameGuard(state: { ema: number; frames: number }, dtMs: number): boolean` — true once the 60-frame moving average passes 20 ms
  - `GLOW_LIGHTS = { ambient: 0.35, key: 0.6, fill: 0.25 }`, `SOLID_LIGHTS = { ambient: 0.5, key: 0.8, fill: 0.35 }`
  - `orbital_visualizer.ts`: `VisualizerContext.lights?: { ambient: THREE.AmbientLight; key: THREE.DirectionalLight; fill: THREE.DirectionalLight }`; `VisualizerContext.linesSuppressed?: boolean`; `setSurfaceStyle` re-applies the appearance (wireframe drops the extras).

- [ ] **Step 1: Write the failing tests**

`tests/orbital_glow.test.ts`:

```ts
import * as THREE from 'three';
import { applyGlow, attachGlowExtras, glowSettingsFor, updateFrameGuard } from '../src/orbital_glow';
import { CLASSIC_APPEARANCE } from '../src/design/appearance';

const glowDark = { theme: 'dark' as const, scheme: 'phase' as const, finish: 'glow' as const, showAxes: true, lowPower: false };
const shaderOf = (material: THREE.MeshStandardMaterial) => {
    const shader = {
        uniforms: {} as Record<string, THREE.IUniform>,
        vertexShader: THREE.ShaderLib.physical.vertexShader,
        fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return shader;
};

describe('Glow (spec §11.2)', () => {
    it('is off for Classic and for the Solid finish; additive in Deep Space, an ink rim in Light Clean', () => {
        expect(glowSettingsFor(CLASSIC_APPEARANCE)).toBeNull();
        expect(glowSettingsFor({ ...glowDark, finish: 'solid' })).toBeNull();
        expect(glowSettingsFor({ ...glowDark, scheme: 'classic' })).toBeNull();
        expect(glowSettingsFor(glowDark)!.mode).toBe('additive');
        expect(glowSettingsFor({ ...glowDark, theme: 'light' })!.mode).toBe('ink');
        expect(glowSettingsFor(glowDark)!.rimPositive.getHexString()).toBe(new THREE.Color('#FFC59A').getHexString());
    });

    it('injects a same-phase Fresnel rim and a 0.18 emissive term, and updates them without recompiling', () => {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        applyGlow(material, glowSettingsFor(glowDark));
        const shader = shaderOf(material);
        expect(shader.vertexShader).toContain('vQlPhase = phaseSign;');
        expect(shader.fragmentShader).toMatch(/qlRim[\s\S]*#include <opaque_fragment>/);
        expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * qlEmissive;');
        expect(shader.uniforms.qlEmissive.value).toBeCloseTo(0.18);
        const version = material.version;
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }));
        expect(material.version).toBe(version);
        expect(shader.uniforms.qlInk.value).toBe(1);
        applyGlow(material, null);
        expect(material.version).toBeGreaterThan(version);
    });

    it('adds the halo in Deep Space only and the mesh lines unless on a phone, sharing the surface geometry', () => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
        const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
        const group = new THREE.Group();
        group.add(surface);
        const extras = () => group.children.filter(child => child.userData.isGlowExtra);
        const options = { radius: 2, clippingPlanes: [], solid: true, linesAllowed: true };

        attachGlowExtras(group, surface, glowDark, options);
        expect(extras().map(child => child.userData.isGlowExtra).sort()).toEqual(['halo', 'lines']);
        expect(extras().every(child => (child as THREE.Mesh).geometry === geometry)).toBe(true);
        const halo = extras().find(child => child.userData.isGlowExtra === 'halo') as THREE.Mesh;
        expect((halo.material as THREE.ShaderMaterial).uniforms.qlHaloOffset.value).toBeCloseTo(0.03);
        expect((halo.material as THREE.ShaderMaterial).uniforms.qlHaloOpacity.value).toBeCloseTo(0.12);

        attachGlowExtras(group, surface, { ...glowDark, theme: 'light' }, options);
        expect(extras().map(child => child.userData.isGlowExtra)).toEqual(['lines']);
        attachGlowExtras(group, surface, { ...glowDark, lowPower: true }, options);
        expect(extras()).toHaveLength(0);
        attachGlowExtras(group, surface, glowDark, { ...options, solid: false });
        expect(extras()).toHaveLength(0);
        attachGlowExtras(group, surface, CLASSIC_APPEARANCE, options);
        expect(extras()).toHaveLength(0);
    });

    it('turns the lines off once frames average over 20 ms (ruling R10)', () => {
        const state = { ema: 16, frames: 0 };
        let suppress = false;
        for (let i = 0; i < 200; i++) suppress = updateFrameGuard(state, 16) || suppress;
        expect(suppress).toBe(false);
        for (let i = 0; i < 200; i++) suppress = updateFrameGuard(state, 30) || suppress;
        expect(suppress).toBe(true);
    });
});
```

`tests/visualizer_appearance.test.ts` — add (it already has `buildContext`, `drawOrbital`, `surfaceOf`):

```ts
import { collectExportSurfaces } from '../src/export/surfaces';
import { setSurfaceStyle } from '../src/orbital_visualizer';

describe('Glow on the drawn orbital (spec §11.2)', () => {
    const glow = { theme: 'dark' as const, scheme: 'phase' as const, finish: 'glow' as const, showAxes: true, lowPower: false };
    const extras = (context: VisualizerContext) => context.currentOrbitalGroup!.children.filter(child => child.userData.isGlowExtra);

    it('glows in place and never exports the halo or the lines', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const before = collectExportSurfaces(context.currentOrbitalGroup);
        setAppearance(context, glow);
        expect(extras(context)).toHaveLength(2);
        expect(surfaceOf(context).geometry.getAttribute('phaseSign').array).toEqual(Float32Array.from([1, -1, 1]));
        expect(collectExportSurfaces(context.currentOrbitalGroup)).toHaveLength(before.length);
    });

    it('drops the extras for a wireframe and brings them back for the solid surface', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, glow);
        setSurfaceStyle(context, { ...context.surfaceStyle, mode: 'wireframe' });
        expect(extras(context)).toHaveLength(0);
        setSurfaceStyle(context, { ...context.surfaceStyle, mode: 'solid' });
        expect(extras(context)).toHaveLength(2);
    });

    it('dims the lights for Glow, whose emissive term carries the rest, and restores them for Solid', () => {
        const context = buildContext();
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        setAppearance(context, glow);
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([0.35, 0.6, 0.25]);
        setAppearance(context, { ...glow, finish: 'solid' });
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([0.5, 0.8, 0.35]);
    });
});
```

Run: `npx jest tests/orbital_glow.test.ts tests/visualizer_appearance.test.ts`
Expected: FAIL — module missing; no extras; lights unchanged.

- [ ] **Step 2: Write `src/orbital_glow.ts`**

```ts
import * as THREE from 'three';
import type { Appearance } from './design/appearance';
import { phaseColours } from './design/science';

/**
 * The Glow finish (spec §11.2): the concept's glowing translucent look with
 * the science intact. A Fresnel rim tinted with the SAME phase's colour
 * (never the other's -- that would read as a sign change), an emissive term
 * of 0.18 × the surface colour, and in Deep Space a faint additive halo
 * drawn from the same geometry pushed out 1.5 % along its normals; fine
 * mesh lines at 6 % alpha show the real marching-cubes edges. Light Clean
 * mixes towards a darker "ink" rim, since added light is invisible on white.
 * No bloom (§11.4).
 */
export interface GlowSettings {
    mode: 'additive' | 'ink';
    rimPositive: THREE.Color;
    rimNegative: THREE.Color;
    emissive: number;
    rimStrength: number;
}

export const GLOW_LIGHTS = { ambient: 0.35, key: 0.6, fill: 0.25 } as const;
export const SOLID_LIGHTS = { ambient: 0.5, key: 0.8, fill: 0.35 } as const;

export function glowSettingsFor(appearance: Appearance): GlowSettings | null {
    if (appearance.finish !== 'glow' || appearance.scheme === 'classic') return null;
    const phase = phaseColours(appearance.theme, appearance.scheme);
    return {
        mode: appearance.theme === 'dark' ? 'additive' : 'ink',
        rimPositive: new THREE.Color(phase.rimPositive!),
        rimNegative: new THREE.Color(phase.rimNegative!),
        emissive: 0.18,
        rimStrength: 0.9,
    };
}

interface GlowUniforms {
    qlRimPositive: THREE.IUniform<THREE.Color>;
    qlRimNegative: THREE.IUniform<THREE.Color>;
    qlInk: THREE.IUniform<number>;
    qlEmissive: THREE.IUniform<number>;
    qlRimStrength: THREE.IUniform<number>;
}

const VERTEX_HEAD = 'attribute float phaseSign;\nvarying float vQlPhase;\n';
const FRAGMENT_HEAD = 'uniform vec3 qlRimPositive;\nuniform vec3 qlRimNegative;\nuniform float qlInk;\nuniform float qlEmissive;\nuniform float qlRimStrength;\nvarying float vQlPhase;\n';
const RIM = /* glsl */`
    // Fresnel rim, in the surface's own phase (vQlPhase: +1, -1, or 0 where
    // the mesh has no phase -- a density or an atom -- which takes a lighter
    // tint of its own colour).
    float qlRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
    vec3 qlRimColour = vQlPhase > 0.5 ? qlRimPositive : (vQlPhase < -0.5 ? qlRimNegative : mix(diffuseColor.rgb, vec3(1.0), 0.5));
    outgoingLight = qlInk > 0.5
        ? mix(outgoingLight, qlRimColour, qlRim * qlRimStrength)
        : outgoingLight + qlRimColour * qlRim * qlRimStrength;
`;

/** Applies (or removes) the Glow injection in place; colours change without a recompile. */
export function applyGlow(material: THREE.MeshStandardMaterial, settings: GlowSettings | null): void {
    if (!settings) {
        if (material.userData.glow) {
            material.onBeforeCompile = () => {};
            material.customProgramCacheKey = () => 'ql-plain';
            material.userData.glow = false;
            material.needsUpdate = true;
        }
        return;
    }
    const uniforms: GlowUniforms = material.userData.glowUniforms ?? {
        qlRimPositive: { value: new THREE.Color() },
        qlRimNegative: { value: new THREE.Color() },
        qlInk: { value: 0 },
        qlEmissive: { value: 0 },
        qlRimStrength: { value: 0 },
    };
    uniforms.qlRimPositive.value.copy(settings.rimPositive);
    uniforms.qlRimNegative.value.copy(settings.rimNegative);
    uniforms.qlInk.value = settings.mode === 'ink' ? 1 : 0;
    uniforms.qlEmissive.value = settings.emissive;
    uniforms.qlRimStrength.value = settings.rimStrength;
    material.userData.glowUniforms = uniforms;
    if (material.userData.glow) return;
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvQlPhase = phaseSign;');
        shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * qlEmissive;')
            .replace('#include <opaque_fragment>', `${RIM}\n\t#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'ql-glow';
    material.userData.glow = true;
    material.needsUpdate = true;
}

const HALO_VERTEX = /* glsl */`
    uniform float qlHaloOffset;
    varying vec3 vQlColour;
    #include <clipping_planes_pars_vertex>
    void main() {
        vQlColour = color;
        vec4 mvPosition = modelViewMatrix * vec4(position + normal * qlHaloOffset, 1.0);
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
    }
`;
const HALO_FRAGMENT = /* glsl */`
    uniform float qlHaloOpacity;
    varying vec3 vQlColour;
    #include <clipping_planes_pars_fragment>
    void main() {
        #include <clipping_planes_fragment>
        gl_FragColor = vec4(vQlColour, qlHaloOpacity);
        #include <colorspace_fragment>
    }
`;

function removeGlowExtras(group: THREE.Group): void {
    for (const child of [...group.children]) {
        if (!child.userData.isGlowExtra) continue;
        group.remove(child);
        // The geometry is the surface's own and is disposed with it.
        ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
}

/**
 * Brings a surface's Glow to `appearance`: the material injection always;
 * the halo (Deep Space) and the mesh lines only on a solid surface, never on
 * a phone (`lowPower`) and the lines not once the frame-time guard has
 * turned them off. Extras share the surface's geometry and are never marked
 * for export (export/surfaces.ts collects marked meshes only).
 */
export function attachGlowExtras(
    group: THREE.Group,
    surface: THREE.Mesh,
    appearance: Appearance,
    options: { radius: number; clippingPlanes: THREE.Plane[]; solid: boolean; linesAllowed: boolean },
): void {
    removeGlowExtras(group);
    const settings = glowSettingsFor(appearance);
    applyGlow(surface.material as THREE.MeshStandardMaterial, settings);
    if (!settings || !options.solid || appearance.lowPower) return;
    const geometry = surface.geometry;
    if (appearance.theme === 'dark') {
        const halo = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            vertexShader: HALO_VERTEX,
            fragmentShader: HALO_FRAGMENT,
            uniforms: { qlHaloOffset: { value: 0.015 * options.radius }, qlHaloOpacity: { value: 0.12 } },
            vertexColors: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            clipping: true,
            clippingPlanes: options.clippingPlanes,
        }));
        halo.userData.isGlowExtra = 'halo';
        group.add(halo);
    }
    if (options.linesAllowed) {
        const lines = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            wireframe: true, vertexColors: true, transparent: true, opacity: 0.06, depthWrite: false,
            clippingPlanes: options.clippingPlanes,
        }));
        lines.userData.isGlowExtra = 'lines';
        group.add(lines);
    }
}

/** A 60-frame moving average of frame time; true once it passes 20 ms (after a 120-frame warm-up). */
export function updateFrameGuard(state: { ema: number; frames: number }, dtMs: number): boolean {
    state.frames += 1;
    state.ema += (Math.min(dtMs, 250) - state.ema) / 60;
    return state.frames > 120 && state.ema > 20;
}
```

- [ ] **Step 3: Wire Glow into the visualizer**

In `src/orbital_visualizer.ts`:
- imports: `import { attachGlowExtras, applyGlow, glowSettingsFor, GLOW_LIGHTS, SOLID_LIGHTS, updateFrameGuard } from './orbital_glow';`
- `VisualizerContext` gains `lights?: { ambient: THREE.AmbientLight; key: THREE.DirectionalLight; fill: THREE.DirectionalLight };`, `linesSuppressed?: boolean;` and `frameGuard?: { ema: number; frames: number };`.
- `initVisualizer`: name the lights `ambientLight`, `directionalLight` (key) and `fillLight` as today, and put `lights: { ambient: ambientLight, key: directionalLight, fill: fillLight }, linesSuppressed: false, frameGuard: { ema: 16, frames: 0 }` into the context literal.
- `updateSceneWithMeshData`: after the colour attribute is created, add the phase attribute the rim reads: `geometry.setAttribute('phaseSign', new THREE.Float32BufferAttribute(colouring === 'phase' ? Array.from(signs) : new Array(signs.length).fill(0), 1));`; at the end of the T14 `paint` closure add

```ts
            attachGlowExtras(group, mesh, appearance, {
                radius: meshRadius(meshData), clippingPlanes: context.clippingPlanes,
                solid: context.surfaceStyle.mode === 'solid', linesAllowed: !context.linesSuppressed,
            });
```

- a lights helper, called at the end of `setAppearance`:

```ts
/** §11.1 "Lights": Glow lets its emissive term carry part of the light. */
function applyLights(context: VisualizerContext): void {
    if (!context.lights) return;
    const levels = glowSettingsFor(appearanceOf(context)) ? GLOW_LIGHTS : SOLID_LIGHTS;
    context.lights.ambient.intensity = levels.ambient;
    context.lights.key.intensity = levels.key;
    context.lights.fill.intensity = levels.fill;
}
```

  and at the start of `setAppearance` (after `context.appearance = appearance;`): `context.linesSuppressed = false; if (context.frameGuard) { context.frameGuard.ema = 16; context.frameGuard.frames = 0; }` (ruling R10: a new appearance gets a fresh look at frame time).
- `setSurfaceStyle` (the exported restyler): at its end, re-apply the current appearance to the drawn surface so a switch to or from Wireframe drops or restores the extras: `context.currentOrbitalGroup?.traverse(object => (object.userData.applyAppearance as ((a: Appearance) => void) | undefined)?.(appearanceOf(context)));`.
- `applyOverlayAppearance`: also give each atom material the rim at 0.15 in Deep Space (ruling R12):

```ts
    const rim = appearance.theme === 'dark' && appearance.scheme !== 'classic'
        ? { mode: 'additive' as const, rimPositive: new THREE.Color('#ffffff'), rimNegative: new THREE.Color('#ffffff'), emissive: 0, rimStrength: 0.15 }
        : null;
    // …inside the traverse, for every material with userData.Z: applyGlow(material, rim);
```

- `startAnimationLoop`'s `animate`: keep the previous timestamp and, after `renderFrame(context)`:

```ts
        if (previous !== null && context.frameGuard && !context.linesSuppressed && updateFrameGuard(context.frameGuard, timestamp - previous)) {
            // Ruling R10: off once frames average over 20 ms, until the appearance next changes.
            context.linesSuppressed = true;
            context.currentOrbitalGroup?.traverse(object => { if (object.userData.isGlowExtra === 'lines') object.visible = false; });
        }
        previous = timestamp;
```

  (declare `let previous: number | null = null;` beside `animate`).

- [ ] **Step 4: Run the tests**

Run: `npx jest tests/orbital_glow.test.ts tests/visualizer_appearance.test.ts tests/atom/visualizer_dispatch.test.ts tests/export` → PASS. Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 5: Live check [visual] (expect ~4 min)**

```bash
node tools/design/shoot.mjs --task T15 --scenes c-2pz,basic-3dz2,water --themes dark,light --sizes desktop,phone
```

Read the shots beside concept A's and Option 1's 2p_z (dark) and concept B's / Option 2's (light). Checklist `/tmp/6g1-T15-checklist.md`, owned here: *Components* — Deep Space: translucent lobes with a bright same-colour rim, a faint halo and a fine network texture (the mesh lines), no rim of the other phase's hue anywhere; Light Clean: ink rims, no halo, lobes not washed out; phone: no halo and no lines; Water (Molecules): atoms carry a faint rim in Deep Space, hydrogen is off-white on Light Clean. *Science* — the lobes' shape, size and cut are identical to Task 14's shots of the same scene (compare the two PNGs); the key is unchanged; `webglCanvases` 1; `errors` empty (a shader compile error shows here). If the glow is too strong or weak against the concept, adjust only `emissive`/`rimStrength`/halo opacity in `glowSettingsFor`/`attachGlowExtras`, note the values in the checklist, and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/orbital_glow.ts src/orbital_visualizer.ts tests/orbital_glow.test.ts tests/visualizer_appearance.test.ts
git commit -m "feat(viewer): Glow finish -- same-phase Fresnel rim, emissive, Deep Space halo, mesh lines with a frame-time guard, lights per finish (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/orbital_glow.ts src/orbital_visualizer.ts tests/orbital_glow.test.ts tests/visualizer_appearance.test.ts
```

---

### Task 16: `ThumbnailService` and the atom strip [visual]

**Estimate:** 2.5 h. **Spec:** §12 item 1 and item 3, §9.1 "Strip", §8.5 (bottom zone), §13 (the strip is a `listbox` of labelled `option`s; arrow keys). Ruling R5 (ring glyphs for the whole atom and shells). One WebGL context, ever.

**Files:**
- Create: `src/thumbs/ThumbnailService.ts`, `src/thumbs/render_thumbnail.ts`, `src/thumbs/ring_glyph.ts`, `src/thumbs/strip_items.ts`, `src/shell/ThumbnailStrip.tsx`, `src/shell/strip.css`
- Modify: `src/orbital_visualizer.ts` (`onAfterFrame`, `attachThumbnails`), `src/components/OrbitalViewer.tsx`, `src/App.tsx`, `src/style.css` (busy chip above the strip)
- Test: `tests/thumbs/thumbnail_service.test.ts`, `tests/thumbs/strip_items.test.ts`, `tests/thumbs/ring_glyph.test.ts`, `tests/shell/thumbnail_strip.test.tsx`; additions to `tests/orbital_viewer.test.tsx` (`attachThumbnails: jest.fn()` in the mock; called once)

**Interfaces:**
- Consumes: `NavigationTarget` (`src/components/LevelNav.tsx`); `OrbitalParams`, `MeshData`; `SerialisedAtomProfile`; `orbitalName`, `subshellLabel`, `subshellSpokenLabel`; `shellName` (Task 9); `Appearance`, `glowSettingsFor`, `applyGlow`, `phaseColours`, `linearRgb` (Tasks 12, 14, 15); `useRovingFocus` (Task 6); `CANONICAL_CAMERA_DIRECTION` (`src/camera_angles.ts`).
- Produces:
  - `ThumbnailService` (class) and `thumbnailService` (the one instance): `attach(host: ThumbHost)`, `detach()`, `status(): 'detached' | 'ready' | 'lost'`, `markLost()`, `request(request: ThumbRequest, onReady: (image: ThumbImage) => void): () => void`, `cancelAll()`, `tick()`, `cacheSize(): number`; `ThumbnailService.CACHE_LIMIT = 96`; `interface ThumbHost { createWorker(): Worker; isBusy(): boolean; themeKey(): string; render(meshData: MeshData): Promise<ThumbImage> }`; `interface ThumbRequest { contentKey: string; params: OrbitalParams }`; `type ThumbImage = { width: number; height: number }` (an `ImageBitmap` or a canvas).
  - `render_thumbnail.ts`: `createThumbnailRenderer(renderer: THREE.WebGLRenderer): { render(meshData: MeshData, appearance: Appearance): Promise<ThumbImage>; dispose(): void }` (a 160 × 160 `WebGLRenderTarget` on the main renderer; `readRenderTargetPixels`; `ImageBitmap`).
  - `ring_glyph.ts`: `drawRingGlyph(ctx: Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'arc' | 'stroke' | 'strokeStyle' | 'globalAlpha' | 'lineWidth'>, size: number, rings: RingLayer[], rGrid: ArrayLike<number>, rMax: number): void`; `interface RingLayer { curve: ArrayLike<number>; colour: string }`.
  - `strip_items.ts`: `THUMB_RESOLUTION = 32`; `type StripThumb = { kind: 'orbital'; request: ThumbRequest } | { kind: 'rings'; rings: RingLayer[]; rMax: number } | { kind: 'back' }`; `interface StripItem { key: string; label: string; spoken: string; group: string | null; target: NavigationTarget; selected: boolean; thumb: StripThumb }`; `atomStripItems(args: { profile: SerialisedAtomProfile; level: ViewLevel; selectedShell: number | null; selectedOrbital: { n: number; l: number; ml: number; j?: number } | null; enclosedFraction: number; palette: readonly string[] }): StripItem[]`.
  - `ThumbnailStrip` props `{ items: StripItem[]; label: string; rGrid: number[]; themeKey: string; onSelect(target: NavigationTarget): void; variant?: 'overlay' | 'sheet'; collapsed?: boolean; onCollapsedChange?(collapsed: boolean): void }` → `.thumbnail-strip` with a `listbox`.
  - `orbital_visualizer.ts`: `VisualizerContext.onAfterFrame?: () => void`; `attachThumbnails(context: VisualizerContext, service: ThumbnailService, options: { isBusy(): boolean; appearance(): Appearance }): void`.

- [ ] **Step 1: Write the failing tests**

`tests/thumbs/thumbnail_service.test.ts`:

```ts
import { ThumbnailService, ThumbHost, ThumbImage } from '../../src/thumbs/ThumbnailService';
import type { MeshData, OrbitalParams } from '../../src/types/orbital';

const params: OrbitalParams = { n: 2, l: 1, ml: 0, Z: 6, resolution: 32, rMax: 8, enclosedFraction: 0.9 };
const mesh = (): MeshData => ({ positions: [], cells: [], psiSigns: [], densityMap: { data: new Uint8Array(1), side: 1, rMax: 1 }, isoLevel: 1 });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fakeHost(over: Partial<ThumbHost> = {}) {
    const workers: Array<{ postMessage: jest.Mock; terminate: jest.Mock; onmessage: ((e: { data: unknown }) => void) | null; onerror: (() => void) | null }> = [];
    const renders: MeshData[] = [];
    let theme = 'dark|phase|glow';
    const host: ThumbHost = {
        createWorker: () => {
            const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
            workers.push(worker);
            return worker as unknown as Worker;
        },
        isBusy: () => false,
        themeKey: () => theme,
        render: async meshData => { renders.push(meshData); return { width: 160, height: 160 } as ThumbImage; },
        ...over,
    };
    return { host, workers, renders, setTheme: (next: string) => { theme = next; } };
}

describe('ThumbnailService (spec §12)', () => {
    it('starts one worker at a time and renders at most one thumbnail per frame', async () => {
        const service = new ThumbnailService();
        const { host, workers, renders } = fakeHost();
        service.attach(host);
        const ready = jest.fn();
        service.request({ contentKey: 'a', params }, ready);
        service.request({ contentKey: 'b', params: { ...params, ml: 1 } }, ready);
        service.tick();
        service.tick();
        expect(workers).toHaveLength(1);
        expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'calculate', params });
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        expect(renders).toHaveLength(1);
        expect(workers).toHaveLength(1);
        await flush();
        expect(ready).toHaveBeenCalledTimes(1);
        service.tick();
        expect(workers).toHaveLength(2);
    });

    it('never starts a job, or renders, while the main view is busy or a drag is on', () => {
        const service = new ThumbnailService();
        let busy = true;
        const { host, workers } = fakeHost({ isBusy: () => busy });
        service.attach(host);
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        expect(workers).toHaveLength(0);
        busy = false;
        service.tick();
        expect(workers).toHaveLength(1);
    });

    it('serves a cached image at once, keyed by theme|scheme|content, and evicts past 96', async () => {
        const service = new ThumbnailService();
        const { host, workers, setTheme } = fakeHost();
        service.attach(host);
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        await flush();
        const hit = jest.fn();
        service.request({ contentKey: 'a', params }, hit);
        expect(hit).toHaveBeenCalledTimes(1);
        setTheme('light|phase|glow');
        const miss = jest.fn();
        service.request({ contentKey: 'a', params }, miss);
        expect(miss).not.toHaveBeenCalled();
        for (let i = 0; i < 120; i++) service.store(`dark|phase|glow|k${i}`, { width: 1, height: 1 });
        expect(service.cacheSize()).toBe(ThumbnailService.CACHE_LIMIT);
    });

    it('cancels everything when the species changes, and ignores a reply that arrives late', () => {
        const service = new ThumbnailService();
        const { host, workers, renders } = fakeHost();
        service.attach(host);
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        service.cancelAll();
        expect(workers[0].terminate).toHaveBeenCalled();
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        expect(renders).toHaveLength(0);
    });

    it('forgets a queued tile that scrolled out of view', () => {
        const service = new ThumbnailService();
        const { host, workers } = fakeHost();
        service.attach(host);
        const unsubscribe = service.request({ contentKey: 'a', params }, jest.fn());
        unsubscribe();
        service.tick();
        expect(workers).toHaveLength(0);
    });

    it('stops on a lost context, so tiles fall back to their glyph and label', () => {
        const service = new ThumbnailService();
        const { host, workers } = fakeHost();
        service.attach(host);
        service.markLost();
        expect(service.status()).toBe('lost');
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        expect(workers).toHaveLength(0);
        expect(new ThumbnailService().status()).toBe('detached');
    });
});
```

`tests/thumbs/strip_items.test.ts`:

```ts
import { atomStripItems, THUMB_RESOLUTION } from '../../src/thumbs/strip_items';
import { neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';

const base = { profile: neonProfile(), selectedShell: null, selectedOrbital: null, enclosedFraction: 0.9, palette: CURVE_COLORS };

describe('the atom strip (spec §9.1 "Strip")', () => {
    it('shows the whole atom and one tile per shell at the atom level', () => {
        const items = atomStripItems({ ...base, level: 'atom' });
        expect(items.map(item => item.label)).toEqual(['Whole atom', 'K', 'L']);
        expect(items.map(item => item.spoken)).toEqual(['Whole atom', 'K shell (n = 1)', 'L shell (n = 2)']);
        expect(items[0].selected).toBe(true);
        expect(items[2].target).toEqual({ level: 'shell', n: 2 });
        expect(items.every(item => item.thumb.kind === 'rings')).toBe(true);
    });

    it('lists every occupied orbital of the open shell, grouped by subshell, after a back tile', () => {
        const items = atomStripItems({ ...base, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 } });
        expect(items.map(item => item.label)).toEqual(['Whole atom', '2s', '2p_y', '2p_z', '2p_x']);
        expect(items.map(item => item.group)).toEqual([null, '2s', '2p', '2p', '2p']);
        expect(items[0].thumb.kind).toBe('back');
        expect(items.find(item => item.selected)?.label).toBe('2p_z');
        expect(items[3].target).toEqual({ level: 'orbital', n: 2, l: 1, ml: 0 });
        const thumb = items[3].thumb;
        expect(thumb.kind === 'orbital' && thumb.request.params).toMatchObject({ n: 2, l: 1, ml: 0, Z: 10, resolution: THUMB_RESOLUTION });
        expect(thumb.kind === 'orbital' && thumb.request.contentKey).toContain('2|1|0');
    });
});
```

`tests/thumbs/ring_glyph.test.ts`:

```ts
import { drawRingGlyph } from '../../src/thumbs/ring_glyph';

describe('ring glyphs (ruling R5)', () => {
    it('draws one translucent ring per radius step, coloured by layer, brighter where D(r) is larger', () => {
        const calls: Array<{ radius: number; colour: string; alpha: number }> = [];
        const ctx = {
            strokeStyle: '' as string, globalAlpha: 1, lineWidth: 1,
            clearRect: jest.fn(), beginPath: jest.fn(), stroke: jest.fn(),
            arc(_x: number, _y: number, radius: number) { calls.push({ radius, colour: ctx.strokeStyle, alpha: ctx.globalAlpha }); },
        };
        const rGrid = [0, 1, 2, 3, 4];
        drawRingGlyph(ctx, 40, [{ curve: [0, 1, 4, 1, 0], colour: '#4da3ff' }], rGrid, 4);
        expect(ctx.clearRect).toHaveBeenCalled();
        const brightest = calls.reduce((a, b) => (b.alpha > a.alpha ? b : a));
        expect(brightest.colour).toBe('#4da3ff');
        expect(brightest.radius).toBeGreaterThan(5);
        expect(brightest.radius).toBeLessThan(15);
    });

    it('draws nothing for an empty curve, without throwing', () => {
        const ctx = { strokeStyle: '', globalAlpha: 1, lineWidth: 1, clearRect: jest.fn(), beginPath: jest.fn(), stroke: jest.fn(), arc: jest.fn() };
        expect(() => drawRingGlyph(ctx, 40, [{ curve: [0, 0, 0], colour: '#fff' }], [0, 1, 2], 2)).not.toThrow();
        expect(ctx.stroke).not.toHaveBeenCalled();
    });
});
```

`tests/shell/thumbnail_strip.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThumbnailStrip from '../../src/shell/ThumbnailStrip';
import { atomStripItems } from '../../src/thumbs/strip_items';
import { neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';

const profile = neonProfile();
const rGrid = Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
const items = atomStripItems({ profile, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

describe('ThumbnailStrip (spec §9.1, §13)', () => {
    it('is a listbox of labelled options, grouped by subshell, the shown orbital selected', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={jest.fn()} />);
        const list = screen.getByRole('listbox', { name: 'orbitals in view' });
        expect(screen.getByRole('group', { name: '2p' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '2p_z' })).toHaveAttribute('aria-selected', 'true');
        // Every tile but the back tile (an arrow) draws into its own 2D canvas -- never a WebGL one.
        expect(list.querySelectorAll('canvas.thumb-canvas')).toHaveLength(items.length - 1);
    });

    it('selects with a click or Enter, moves with the arrows, and folds to its handle', () => {
        const onSelect = jest.fn();
        const onCollapsedChange = jest.fn();
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={onSelect} onCollapsedChange={onCollapsedChange} />);
        fireEvent.click(screen.getByRole('option', { name: '2p_x' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        const selected = screen.getByRole('option', { name: '2p_z' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x' }));
        fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
        expect(onSelect).toHaveBeenLastCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        fireEvent.click(screen.getByRole('button', { name: 'Hide the orbital strip' }));
        expect(onCollapsedChange).toHaveBeenCalledWith(true);
    });
});
```

`tests/orbital_viewer.test.tsx`: add `attachThumbnails: jest.fn(),` to the visualizer mock and `attachThumbnails` to the named import; add

```tsx
    it('lends the one renderer to the thumbnail service once, on mount (spec §12)', () => {
        const store = createAppStore();
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect(initVisualizer).toHaveBeenCalledTimes(1);
        expect(attachThumbnails).toHaveBeenCalledTimes(1);
    });
```

Run: `npx jest tests/thumbs tests/shell/thumbnail_strip.test.tsx tests/orbital_viewer.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 2: Write `src/thumbs/ThumbnailService.ts`**

```ts
import type { MeshData, OrbitalParams } from '../types/orbital';

/**
 * Thumbnails for the strips (spec §12 item 1), from the MAIN renderer --
 * never a second WebGL context. Meshes come from the existing orbital worker
 * at a low resolution, one job at a time; at most one thumbnail is rendered
 * per animation frame (tick()); nothing starts while the main picture is
 * computing or the user is dragging the camera (host.isBusy()). Images are
 * kept in an LRU of 96, keyed by theme|scheme|finish|content, so a theme
 * switch re-renders and a revisit is instant. The host (OrbitalViewer via
 * orbital_visualizer.attachThumbnails) owns the GPU; this module only
 * schedules, which is why it is testable without WebGL.
 */
export type ThumbImage = { width: number; height: number };

export interface ThumbRequest {
    /** Everything the picture depends on except the theme: species, relativity, orbital, fraction. */
    contentKey: string;
    params: OrbitalParams;
}

export interface ThumbHost {
    createWorker(): Worker;
    isBusy(): boolean;
    themeKey(): string;
    render(meshData: MeshData): Promise<ThumbImage>;
}

type Listener = (image: ThumbImage) => void;

export class ThumbnailService {
    static readonly CACHE_LIMIT = 96;
    private host: ThumbHost | null = null;
    private lost = false;
    private readonly cache = new Map<string, ThumbImage>();
    private readonly listeners = new Map<string, Set<Listener>>();
    private queue: Array<{ key: string; params: OrbitalParams }> = [];
    private inFlight: { key: string; worker: Worker } | null = null;
    private ready: Array<{ key: string; meshData: MeshData }> = [];
    private rendering = false;

    attach(host: ThumbHost): void {
        this.host = host;
        this.lost = false;
    }

    detach(): void {
        this.cancelAll();
        this.host = null;
    }

    status(): 'detached' | 'ready' | 'lost' {
        return this.lost ? 'lost' : this.host ? 'ready' : 'detached';
    }

    markLost(): void {
        this.lost = true;
        this.cancelAll();
    }

    cacheSize(): number {
        return this.cache.size;
    }

    private keyOf(contentKey: string): string {
        return `${this.host?.themeKey() ?? 'detached'}|${contentKey}`;
    }

    request(request: ThumbRequest, onReady: Listener): () => void {
        const key = this.keyOf(request.contentKey);
        const cached = this.cache.get(key);
        if (cached) {
            // Refresh its place in the LRU.
            this.cache.delete(key);
            this.cache.set(key, cached);
            onReady(cached);
            return () => {};
        }
        const set = this.listeners.get(key) ?? new Set<Listener>();
        set.add(onReady);
        this.listeners.set(key, set);
        const pending = this.queue.some(job => job.key === key) || this.inFlight?.key === key || this.ready.some(job => job.key === key);
        if (!pending) this.queue.push({ key, params: request.params });
        return () => {
            set.delete(onReady);
            if (set.size > 0) return;
            this.listeners.delete(key);
            // Only tiles still in view are worth computing (§12: IntersectionObserver).
            this.queue = this.queue.filter(job => job.key !== key);
        };
    }

    /** Stores an image (most recent last) and tells whoever asked for it. */
    store(key: string, image: ThumbImage): void {
        this.cache.delete(key);
        this.cache.set(key, image);
        while (this.cache.size > ThumbnailService.CACHE_LIMIT) {
            const oldest = this.cache.keys().next().value as string;
            this.cache.delete(oldest);
        }
        const set = this.listeners.get(key);
        this.listeners.delete(key);
        set?.forEach(listener => listener(image));
    }

    cancelAll(): void {
        this.inFlight?.worker.terminate();
        this.inFlight = null;
        this.queue = [];
        this.ready = [];
        this.listeners.clear();
    }

    tick(): void {
        const host = this.host;
        if (!host || this.lost || host.isBusy()) return;
        if (this.ready.length > 0) {
            if (this.rendering) return;
            const { key, meshData } = this.ready.shift()!;
            this.rendering = true;
            host.render(meshData).then(
                image => { this.rendering = false; this.store(key, image); },
                () => { this.rendering = false; },
            );
            return;
        }
        if (this.inFlight || this.queue.length === 0) return;
        const { key, params } = this.queue.shift()!;
        const worker = host.createWorker();
        this.inFlight = { key, worker };
        worker.onmessage = (event: MessageEvent) => {
            worker.terminate();
            if (this.inFlight?.worker !== worker) return; // cancelled meanwhile
            this.inFlight = null;
            if (event.data?.type === 'success') this.ready.push({ key, meshData: event.data.meshData as MeshData });
        };
        worker.onerror = () => {
            worker.terminate();
            if (this.inFlight?.worker === worker) this.inFlight = null;
        };
        worker.postMessage({ type: 'calculate', params });
    }
}

/** The one service, lent the main renderer by OrbitalViewer. */
export const thumbnailService = new ThumbnailService();
```

- [ ] **Step 3: Write `src/thumbs/render_thumbnail.ts`, `ring_glyph.ts`, `strip_items.ts`**

`src/thumbs/render_thumbnail.ts`:

```ts
import * as THREE from 'three';
import type { MeshData } from '../types/orbital';
import type { Appearance } from '../design/appearance';
import { linearRgb, phaseColours } from '../design/science';
import { applyGlow, glowSettingsFor } from '../orbital_glow';
import { CANONICAL_CAMERA_DIRECTION } from '../camera_angles';
import type { ThumbImage } from './ThumbnailService';

const SIZE = 160;

/**
 * Draws one orbital mesh into a 160 × 160 render target on the main
 * renderer and reads it back (spec §12): one scene, one camera, one target,
 * reused; the main view's render target and clear colour are restored before
 * returning, so the next main frame is untouched. Glow's rim applies; the
 * halo and the lines do not (they would not read at 72 px).
 */
export function createThumbnailRenderer(renderer: THREE.WebGLRenderer): { render(meshData: MeshData, appearance: Appearance): Promise<ThumbImage>; dispose(): void } {
    const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(5, 5, 5).normalize();
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);
    const direction = new THREE.Vector3(...CANONICAL_CAMERA_DIRECTION).normalize();

    async function render(meshData: MeshData, appearance: Appearance): Promise<ThumbImage> {
        const phase = phaseColours(appearance.theme, appearance.scheme);
        const [positive, negative] = [linearRgb(phase.positive), linearRgb(phase.negative)];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions.flat(), 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(meshData.psiSigns.flatMap(sign => (sign === 1 ? positive : negative)), 3));
        geometry.setAttribute('phaseSign', new THREE.Float32BufferAttribute(meshData.psiSigns.map(sign => (sign === 1 ? 1 : -1)), 1));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0 });
        applyGlow(material, glowSettingsFor(appearance));
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        const radius = geometry.boundingSphere?.radius || 1;
        camera.position.copy(direction).multiplyScalar(radius * 4.2);
        camera.lookAt(0, 0, 0);

        const previousTarget = renderer.getRenderTarget();
        const previousClear = renderer.getClearColor(new THREE.Color());
        const previousAlpha = renderer.getClearAlpha();
        const pixels = new Uint8Array(SIZE * SIZE * 4);
        try {
            renderer.setRenderTarget(target);
            renderer.setClearColor(0x000000, 0);
            renderer.clear();
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClear, previousAlpha);
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        }
        // GL rows run bottom-up; an image's top-down.
        const flipped = new Uint8ClampedArray(pixels.length);
        const row = SIZE * 4;
        for (let y = 0; y < SIZE; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (SIZE - 1 - y) * row);
        const image = new ImageData(flipped, SIZE, SIZE);
        if (typeof createImageBitmap === 'function') return createImageBitmap(image);
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        canvas.getContext('2d')?.putImageData(image, 0, 0);
        return canvas;
    }

    return { render, dispose: () => target.dispose() };
}
```

`src/thumbs/ring_glyph.ts`:

```ts
/**
 * Ruling R5: a whole-atom or shell tile drawn from the profile's own D(r)
 * -- the data the cut face shows -- as concentric rings, brighter where
 * D(r) is larger, coloured like the plot and the 3D view. Canvas 2D, so no
 * WebGL; a radius maps linearly from the centre (0) to the tile's edge (rMax).
 */
export interface RingLayer { curve: ArrayLike<number>; colour: string }

type RingContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'arc' | 'stroke'> & {
    strokeStyle: string | CanvasGradient | CanvasPattern; globalAlpha: number; lineWidth: number;
};

function valueAt(rGrid: ArrayLike<number>, curve: ArrayLike<number>, r: number): number {
    // rGrid ascends; linear interpolation between the bracketing samples.
    let hi = 1;
    while (hi < rGrid.length - 1 && rGrid[hi] < r) hi++;
    const lo = hi - 1;
    const span = rGrid[hi] - rGrid[lo];
    const t = span > 0 ? Math.min(1, Math.max(0, (r - rGrid[lo]) / span)) : 0;
    return curve[lo] + t * (curve[hi] - curve[lo]);
}

export function drawRingGlyph(ctx: RingContext, size: number, rings: RingLayer[], rGrid: ArrayLike<number>, rMax: number): void {
    ctx.clearRect(0, 0, size, size);
    const centre = size / 2;
    const outer = size / 2 - 2;
    ctx.lineWidth = 1.5;
    for (const layer of rings) {
        let peak = 0;
        for (let j = 0; j < layer.curve.length; j++) peak = Math.max(peak, layer.curve[j]);
        if (!(peak > 0)) continue;
        for (let p = 1; p <= outer; p++) {
            const value = valueAt(rGrid, layer.curve, (p / outer) * rMax) / peak;
            if (value < 0.03) continue;
            ctx.globalAlpha = Math.min(1, value);
            ctx.strokeStyle = layer.colour;
            ctx.beginPath();
            ctx.arc(centre, centre, p, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
}
```

`src/thumbs/strip_items.ts`:

```ts
import type { SerialisedAtomProfile } from '../workers/atomWorker';
import type { ViewLevel } from '../store/atomSlice';
import type { NavigationTarget } from '../components/LevelNav';
import { orbitalName } from '../orbital_names';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import type { ThumbRequest } from './ThumbnailService';
import type { RingLayer } from './ring_glyph';

/** §12: strips mesh at 32³. */
export const THUMB_RESOLUTION = 32;

const LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

export type StripThumb = { kind: 'orbital'; request: ThumbRequest } | { kind: 'rings'; rings: RingLayer[]; rMax: number } | { kind: 'back' };

export interface StripItem {
    key: string;
    label: string;
    spoken: string;
    group: string | null;
    target: NavigationTarget;
    selected: boolean;
    thumb: StripThumb;
}

interface StripArgs {
    profile: SerialisedAtomProfile;
    level: ViewLevel;
    selectedShell: number | null;
    selectedOrbital: { n: number; l: number; ml: number; j?: number } | null;
    enclosedFraction: number;
    palette: readonly string[];
}

/**
 * The Atom strip (spec §9.1): at the whole-atom level, "Whole atom" and one
 * tile per shell; at shell, subshell or orbital level, a back tile and every
 * occupied orbital of the shell, each mₗ of each subshell (each j-level under
 * spin–orbit), grouped by subshell. A tile dispatches the same
 * NavigationTarget LevelNav does.
 */
export function atomStripItems(args: StripArgs): StripItem[] {
    const { profile, level, selectedShell, selectedOrbital, enclosedFraction, palette } = args;
    if (level === 'atom' || selectedShell === null) {
        const shells = profile.shells.map((shell, i) => ({ curve: shell.curve, colour: palette[i % palette.length] }));
        return [
            {
                key: 'atom', label: 'Whole atom', spoken: 'Whole atom', group: null, target: { level: 'atom' },
                selected: level === 'atom', thumb: { kind: 'rings', rings: shells, rMax: profile.displayRadius },
            },
            ...profile.shells.map((shell, i) => {
                const letter = LETTERS[shell.n - 1] ?? `n=${shell.n}`;
                return {
                    key: `shell-${shell.n}`, label: letter, spoken: `${letter} shell (n = ${shell.n})`, group: null,
                    target: { level: 'shell', n: shell.n } as NavigationTarget, selected: false,
                    thumb: { kind: 'rings', rings: [{ curve: shell.curve, colour: palette[i % palette.length] }], rMax: shell.contourRadius * 1.15 } as StripThumb,
                };
            }),
        ];
    }
    const items: StripItem[] = [{
        key: 'back', label: 'Whole atom', spoken: 'back to the whole atom', group: null, target: { level: 'atom' }, selected: false, thumb: { kind: 'back' },
    }];
    const species = profile.speciesKey ?? String(profile.Z);
    const relativity = profile.relativity ?? 'off';
    for (const subshell of profile.subshells.filter(s => s.n === selectedShell)) {
        const group = subshellLabel(subshell.n, subshell.l, subshell.j);
        for (let ml = -subshell.l; ml <= subshell.l; ml++) {
            const name = orbitalName(subshell.n, subshell.l, ml);
            const j = subshell.j;
            items.push({
                key: `orbital-${subshell.n}-${subshell.l}-${j ?? ''}-${ml}`,
                label: name,
                spoken: j === undefined ? name : `${name} of ${subshellSpokenLabel(subshell.n, subshell.l, j)}`,
                group,
                target: j === undefined ? { level: 'orbital', n: subshell.n, l: subshell.l, ml } : { level: 'orbital', n: subshell.n, l: subshell.l, ml, j },
                selected: Boolean(selectedOrbital && selectedOrbital.n === subshell.n && selectedOrbital.l === subshell.l
                    && selectedOrbital.ml === ml && selectedOrbital.j === j),
                thumb: {
                    kind: 'orbital',
                    request: {
                        contentKey: `${species}|${relativity}|${subshell.n}|${subshell.l}|${ml}|${j ?? ''}|${enclosedFraction}`,
                        params: {
                            n: subshell.n, l: subshell.l, ml, Z: profile.Z, resolution: THUMB_RESOLUTION, rMax: subshell.samplingRadius, enclosedFraction,
                            radialSamples: { R: subshell.R, rMin: profile.rMin, dx: profile.dx, size: profile.size },
                        },
                    },
                },
            });
        }
    }
    return items;
}
```

(`subshellLabel(2, 0)` is "2s", so the test's expected labels — a lone s orbital is named "2s" by `orbitalName` — hold.)

- [ ] **Step 4: Write the strip component**

`src/shell/ThumbnailStrip.tsx`:

```tsx
import React, { useEffect, useId, useRef, useState } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import type { NavigationTarget } from '../components/LevelNav';
import { thumbnailService } from '../thumbs/ThumbnailService';
import { drawRingGlyph } from '../thumbs/ring_glyph';
import type { StripItem } from '../thumbs/strip_items';
import { useRovingFocus } from './useRovingFocus';
import './strip.css';

interface ThumbnailStripProps {
    items: StripItem[];
    label: string;
    rGrid: number[];
    /** theme|scheme|finish: a change re-requests every visible tile. */
    themeKey: string;
    onSelect(target: NavigationTarget): void;
    /** 'sheet' is the phone's first row of the Explore tab: 56 px tiles, in the flow (spec §9.8). */
    variant?: 'overlay' | 'sheet';
    collapsed?: boolean;
    onCollapsedChange?(collapsed: boolean): void;
}

const Tile: React.FC<{ item: StripItem; px: number; rGrid: number[]; themeKey: string; onSelect(target: NavigationTarget): void }> = ({ item, px, rGrid, themeKey, onSelect }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [unavailable, setUnavailable] = useState(false);
    const { thumb } = item;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const context = canvas.getContext('2d');
        if (thumb.kind === 'rings') {
            if (context) drawRingGlyph(context, canvas.width, thumb.rings, rGrid, thumb.rMax);
            return undefined;
        }
        if (thumb.kind === 'back') return undefined;
        if (thumbnailService.status() !== 'ready') { setUnavailable(true); return undefined; }
        setUnavailable(false);
        let unsubscribe = () => {};
        const start = () => {
            unsubscribe = thumbnailService.request(thumb.request, image => {
                context?.clearRect(0, 0, canvas.width, canvas.height);
                context?.drawImage(image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
            });
        };
        // Only tiles in view are requested (§12).
        const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer?.disconnect();
                start();
            }
        });
        if (observer) observer.observe(canvas);
        else start();
        return () => { observer?.disconnect(); unsubscribe(); };
    }, [thumb, rGrid, themeKey]);

    return (
        <div
            role="option"
            aria-selected={item.selected}
            aria-label={item.spoken}
            className={`strip-tile${item.selected ? ' selected' : ''}`}
            onClick={() => onSelect(item.target)}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(item.target);
                }
            }}
        >
            <span className="strip-tile-image" style={{ width: px, height: px }}>
                {thumb.kind === 'back' ? <ArrowBack aria-hidden /> : (
                    <canvas ref={canvasRef} className="thumb-canvas" width={px * 2} height={px * 2} aria-hidden="true" />
                )}
                {unavailable && <span className="strip-tile-glyph" aria-hidden="true">{item.label}</span>}
            </span>
            <span className="strip-tile-label" aria-hidden="true">{item.label}</span>
        </div>
    );
};

/**
 * The thumbnail strip (spec §8.5 bottom zone, §9.1 "Strip", §13): a
 * listbox of labelled options, grouped by subshell, arrow keys inside and
 * Tab out, collapsible to a 28 px handle.
 */
const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({ items, label, rGrid, themeKey, onSelect, variant = 'overlay', collapsed = false, onCollapsedChange }) => {
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    useRovingFocus(listRef, { selector: '[role="option"]', orientation: 'horizontal' });
    const px = variant === 'sheet' ? 56 : 72;

    // Bring the shown orbital into view (instant under reduced motion: §4.7).
    useEffect(() => {
        const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        selected?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }, [items]);

    const groups: Array<{ label: string | null; items: StripItem[] }> = [];
    for (const item of items) {
        const last = groups[groups.length - 1];
        if (last && last.label === item.group) last.items.push(item);
        else groups.push({ label: item.group, items: [item] });
    }

    return (
        <div className={`thumbnail-strip ${variant}${collapsed ? ' collapsed' : ''}`}>
            {onCollapsedChange && (
                <button type="button" className="strip-handle" aria-expanded={!collapsed} aria-controls={listId}
                    aria-label={collapsed ? 'Show the orbital strip' : 'Hide the orbital strip'} onClick={() => onCollapsedChange(!collapsed)}>
                    <span aria-hidden="true">{collapsed ? '▴' : '▾'}</span>
                </button>
            )}
            {!collapsed && (
                <div id={listId} ref={listRef} className="strip-list" role="listbox" aria-label={label} aria-orientation="horizontal">
                    {groups.map((group, index) => (group.label ? (
                        <div key={`${group.label}-${index}`} role="group" aria-label={group.label} className="strip-group">
                            <span className="strip-group-label" aria-hidden="true">{group.label}</span>
                            <div className="strip-group-tiles">
                                {group.items.map(item => <Tile key={item.key} item={item} px={px} rGrid={rGrid} themeKey={themeKey} onSelect={onSelect} />)}
                            </div>
                        </div>
                    ) : group.items.map(item => <Tile key={item.key} item={item} px={px} rGrid={rGrid} themeKey={themeKey} onSelect={onSelect} />)))}
                </div>
            )}
        </div>
    );
};

export default ThumbnailStrip;
```

`src/shell/strip.css`:

```css
/* src/shell/strip.css -- the thumbnail strip (spec §8.5 bottom zone, §4.4 tiles 72 × 72 + 16 px label). */
.thumbnail-strip.overlay {
  position: absolute; z-index: 10; left: 12px; right: 12px; bottom: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;
}
.thumbnail-strip.overlay > * { pointer-events: auto; }
.strip-handle {
  height: var(--ql-size-strip-handle); min-width: 44px; padding: 0 10px; cursor: pointer;
  border-radius: var(--ql-radius-md); border: 1px solid var(--ql-color-border-subtle);
  background: var(--ql-color-surface-2); color: var(--ql-color-text-2);
}
.strip-list {
  display: flex; align-items: flex-end; gap: 12px; max-width: 100%; overflow-x: auto; padding: 4px 2px;
  scrollbar-width: thin;
}
@media (prefers-reduced-motion: no-preference) { .strip-list { scroll-behavior: smooth; } }
.strip-group { display: flex; flex-direction: column; gap: 2px; }
.strip-group-label { font: 500 11px / 14px var(--ql-font-sans); color: var(--ql-color-text-3); padding-left: 2px; }
.strip-group-tiles { display: flex; gap: 8px; }
.strip-tile { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; }
.strip-tile-image {
  position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: hidden;
  border-radius: var(--ql-radius-md); border: 1px solid var(--ql-color-border-subtle); background: var(--ql-color-surface-2);
  transition: box-shadow var(--ql-motion-hover) ease-out, border-color var(--ql-motion-hover) ease-out;
}
.strip-tile-image canvas { width: 100%; height: 100%; }
.strip-tile:hover .strip-tile-image { background: var(--ql-color-surface-3); }
.strip-tile.selected .strip-tile-image { border-color: var(--ql-color-selected-edge); box-shadow: var(--ql-shadow-selected); }
.strip-tile-glyph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 600 13px var(--ql-font-sans); color: var(--ql-color-text-2); }
.strip-tile-label { height: var(--ql-size-thumb-label); font: 500 12px / 16px var(--ql-font-sans); color: var(--ql-color-text-2); white-space: nowrap; }
.strip-tile.selected .strip-tile-label { color: var(--ql-color-text-1); font-weight: 600; }
.thumbnail-strip.sheet .strip-list { justify-content: flex-start; }
```

In `src/style.css`, so busy and unbound chips sit above the strip (spec §8.5 "Centre-bottom above strip"): add `.app-shell:not(.phone) .canvas-busy, .app-shell:not(.phone) .canvas-unbound { bottom: 140px; }` — keep whatever horizontal centring those rules already have.

- [ ] **Step 5: The visualizer lends its renderer; OrbitalViewer and App use the strip**

`src/orbital_visualizer.ts`:
- `VisualizerContext` gains `onAfterFrame?: () => void;` and `startAnimationLoop`'s `animate` calls `context.onAfterFrame?.();` right after `renderFrame(context)` (before the frame-time guard).
- add:

```ts
import { createThumbnailRenderer } from './thumbs/render_thumbnail';
import type { ThumbnailService } from './thumbs/ThumbnailService';

/**
 * Lends this context's renderer to the thumbnail service (spec §12: no
 * second WebGL context). The service ticks once per frame after the main
 * frame; a lost context stops it, and the tiles show their labels.
 */
export function attachThumbnails(
    context: VisualizerContext,
    service: ThumbnailService,
    options: { isBusy(): boolean; appearance(): Appearance },
): void {
    const thumbs = createThumbnailRenderer(context.renderer);
    service.attach({
        createWorker: createOrbitalWorker,
        isBusy: options.isBusy,
        themeKey: () => { const a = options.appearance(); return `${a.theme}|${a.scheme}|${a.finish}`; },
        render: meshData => thumbs.render(meshData, options.appearance()),
    });
    context.onAfterFrame = () => service.tick();
    context.renderer.domElement.addEventListener('webglcontextlost', () => service.markLost());
}
```

  and in `cleanupVisualizer`, set `context.onAfterFrame = undefined;`.

`src/components/OrbitalViewer.tsx`:
- import `attachThumbnails` with the other visualizer functions, and `import { thumbnailService } from '../thumbs/ThumbnailService';`.
- the busy flag the service reads (spec §12: "pause while a main render is in flight or a pointer drag is active"):

```tsx
    const mainBusy = useAppSelector(state => state.orbital.isLoading || state.atom.isSolving
        || state.orbital.compositionBusy || state.orbital.levelTransition || state.molecule.renderLabel !== null);
    const busyRef = useRef(mainBusy);
    busyRef.current = mainBusy;
    const draggingRef = useRef(false);
```

- in the initialisation effect, after `visualizerContextRef.current = context;`:

```tsx
            context.controls.addEventListener('start', () => { draggingRef.current = true; });
            context.controls.addEventListener('end', () => { draggingRef.current = false; });
            attachThumbnails(context, thumbnailService, {
                isBusy: () => busyRef.current || draggingRef.current,
                appearance: () => appearanceRef.current,
            });
```

  and in its cleanup, `thumbnailService.detach();`.

`src/App.tsx`:

```tsx
import ThumbnailStrip from './shell/ThumbnailStrip';
import { atomStripItems } from './thumbs/strip_items';
import { thumbnailService } from './thumbs/ThumbnailService';
```

```tsx
    const [stripCollapsed, setStripCollapsed] = useState(false);
    const stripItems = useMemo(
        () => (atomProfile && !atomUnbound
            ? atomStripItems({ profile: atomProfile, level: atomLevel, selectedShell: atomSelectedShell, selectedOrbital: atomSelectedOrbital, enclosedFraction, palette })
            : []),
        [atomProfile, atomUnbound, atomLevel, atomSelectedShell, atomSelectedOrbital, enclosedFraction, palette],
    );
    // A new species or relativity: nothing in flight belongs to the picture any more (§12).
    useEffect(() => () => thumbnailService.cancelAll(), [atomProfile?.speciesKey, atomProfile?.Z, pictureRelativity]);
    const stripThemeKey = `${themeMode}|${render.scheme}|${render.finish}`;
```

and in the viewport, after the key column:

```tsx
            {isAtomMode && !isNarrow && stripItems.length > 0 && (
                <ThumbnailStrip items={stripItems} label="orbitals in view" rGrid={atomRGrid} themeKey={stripThemeKey}
                    onSelect={handleLevelNavigate} variant="overlay" collapsed={stripCollapsed} onCollapsedChange={setStripCollapsed} />
            )}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest tests/thumbs tests/shell/thumbnail_strip.test.tsx tests/orbital_viewer.test.tsx` → PASS. Then `npx jest src/App.test.tsx` (the strip appears in atom tests; options are named, so existing role queries keep their targets — if a test's `getByRole('button', { name: … })` now also matches a strip option, it does not: options are `role="option"`), the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 7: Live check [visual] (expect ~5 min)**

```bash
node tools/design/shoot.mjs --task T16 --scenes c-whole,c-2pz,fe-shell --themes dark,light --sizes desktop --wait 6000
```

(`--wait 6000` gives the strip time to fill.) Checklist `/tmp/6g1-T16-checklist.md` against the concepts' strips (A: 1s 2s 2px 2py 2pz 3d along the bottom; B: 1s 2s 2px 2py 2pz 3d z² 3d x²−y²): tiles 72 × 72 with labels under them, the shown orbital's tile with the cyan halo (dark) / blue edge (light); C 2p_z: Whole atom (back), 2s, 2p_y, 2p_z, 2p_x with group labels "2s" "2p", each a real lobe picture in the theme's phase colours; C whole atom: Whole atom, K, L as ring glyphs in the shell palette; Fe shell (n = 3): 3s, 3p ×3, 3d ×5. `metrics.webglCanvases` is 1 (the tiles are `thumb-canvas` 2D canvases); `metrics.insets.bottom` ≥ the strip's height; the camera keeps the object above the strip; `errors` empty. Click-through is covered by the tests.

- [ ] **Step 8: Commit**

```bash
git add src/thumbs/ThumbnailService.ts src/thumbs/render_thumbnail.ts src/thumbs/ring_glyph.ts src/thumbs/strip_items.ts src/shell/ThumbnailStrip.tsx src/shell/strip.css src/orbital_visualizer.ts src/components/OrbitalViewer.tsx src/App.tsx src/style.css tests/thumbs/thumbnail_service.test.ts tests/thumbs/strip_items.test.ts tests/thumbs/ring_glyph.test.ts tests/shell/thumbnail_strip.test.tsx tests/orbital_viewer.test.tsx
git commit -m "feat(atom): orbital strip -- thumbnails rendered through the one renderer, ring glyphs for shells, listbox with arrow keys (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/thumbs/ThumbnailService.ts src/thumbs/render_thumbnail.ts src/thumbs/ring_glyph.ts src/thumbs/strip_items.ts src/shell/ThumbnailStrip.tsx src/shell/strip.css src/orbital_visualizer.ts src/components/OrbitalViewer.tsx src/App.tsx src/style.css tests/thumbs/thumbnail_service.test.ts tests/thumbs/strip_items.test.ts tests/thumbs/ring_glyph.test.ts tests/shell/thumbnail_strip.test.tsx tests/orbital_viewer.test.tsx
```

---

### Task 17: Tablet and phone baseline [visual]

**Estimate:** 2 h. **Spec:** §7 "Tablet / medium" (Explore collapsible to the rail; top-bar tabs hide below 1100; search shrinks to an icon opening a 360 px popover) and "Phone", §9.8 (the sheet restyled; the strip as the first row of the Explore tab; compact keys), §9.9. Ruling R9.

**Files:**
- Modify: `src/shell/TopBar.tsx` (`compactSearch`), `src/shell/ExplorePanel.tsx` (`onCollapse`), `src/shell/AppShell.tsx` (`onExpandExplore`), `src/shell/app_shell.css`, `src/components/PhoneSheet.tsx` (handle), `src/style.css` (phone sheet restyle), `src/App.tsx`
- Test: `tests/shell/phone_sheet.test.tsx` (new); additions to `tests/shell/top_bar.test.tsx`, `tests/shell/app_shell.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6–16 that it rearranges; `ThumbnailStrip` (`variant="sheet"`).
- Produces: `TopBar` prop `compactSearch?: boolean` (the search becomes an icon button named "Search" opening a 360 px popover holding the same `search` node); `ExplorePanel` prop `onCollapse?(): void` (a chevron button "Hide the Explore panel" in its header); `AppShell` prop `onExpandExplore?(): void` (when `exploreCollapsed`, a "Show the Explore panel" button at the workspace's left edge); `PhoneSheet` renders `.phone-sheet-handle` when open; the `TOPBAR_COMPACT = '(max-width: 1099px)'` query in `src/useMediaQuery.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/shell/phone_sheet.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PhoneSheet from '../../src/components/PhoneSheet';

describe('PhoneSheet, restyled (spec §9.8)', () => {
    it('keeps Explore / View / Plot and shows a grab handle when open', () => {
        const onChange = jest.fn();
        const tabs = [{ key: 'explore', label: 'Explore', content: <p>e</p> }, { key: 'view', label: 'View', content: <p>v</p> }, { key: 'plot', label: 'Plot', content: <p>p</p> }];
        const { container, rerender } = render(<PhoneSheet tabs={tabs} active={null} onChange={onChange} />);
        expect(container.querySelector('.phone-sheet-handle')).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'View' }));
        expect(onChange).toHaveBeenCalledWith('view');
        rerender(<PhoneSheet tabs={tabs} active="view" onChange={onChange} />);
        expect(container.querySelector('.phone-sheet-handle')).not.toBeNull();
        expect(screen.getByRole('tabpanel')).toHaveTextContent('v');
    });
});
```

`tests/shell/top_bar.test.tsx` — add:

```tsx
    it('shrinks the search to an icon that opens it in a popover below 1100 px (spec §7)', () => {
        render(<TopBar brand={BRANDS[0]} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null} onHelp={jest.fn()} compactSearch />);
        expect(screen.queryByLabelText('search slot')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
    });
```

`tests/shell/app_shell.test.tsx` — add:

```tsx
    it('folds Explore to the rail at medium width and brings it back', () => {
        const onExpandExplore = jest.fn();
        render(<AppShell layout="medium" exploreCollapsed onExpandExplore={onExpandExplore} explore={<p>explore</p>} viewport={viewport} />);
        expect(screen.queryByText('explore')).not.toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Show the Explore panel' }));
        expect(onExpandExplore).toHaveBeenCalled();
    });
```

(jsdom does not apply stylesheets, so for `not.toBeVisible()` AppShell must also set `hidden` on the collapsed `<aside>`; Step 3 does.)

`src/App.test.tsx` — inside `describe('phone layout', …)` add:

```tsx
        it('opens the Explore tab on the orbital strip, as its first row (spec §9.8)', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            const panel = screen.getByRole('tabpanel');
            const strip = within(panel).getByRole('listbox', { name: 'orbitals in view' });
            expect(panel.firstElementChild!.contains(strip)).toBe(true);
        });
```

Run: `npx jest tests/shell src/App.test.tsx -t "phone|Search|Explore|PhoneSheet"`
Expected: FAIL.

- [ ] **Step 2: Phone sheet and phone strip**

`src/components/PhoneSheet.tsx`: inside `{current && (…)}`, render the body `div` as today and, right after it in the DOM, `<div className="phone-sheet-handle" aria-hidden="true" />` (wrap the two in a fragment). The sheet is `flex-direction: column-reverse`, so the later element sits on top: the handle appears above the body.

`src/style.css`, in the phone media query (spec §9.8: "a `bg-bar` tab bar with the active tab in `accent-text` and a 2 px `selected-edge` bar; the sheet is `surface-1` with radius `xl` top corners and a 4 × 36 handle"):

```css
  .phone-sheet { border-radius: var(--ql-radius-xl) var(--ql-radius-xl) 0 0; border: 1px solid var(--ql-color-border-subtle); border-bottom: 0; }
  .phone-sheet-tabs { background: var(--ql-color-bg-bar); border-radius: 0; }
  .phone-sheet-tab { min-height: var(--ql-size-touch); border-top-width: 2px; }
  .phone-sheet-handle { width: 36px; height: 4px; margin: 8px auto 0; border-radius: var(--ql-radius-pill); background: var(--ql-color-border-strong); flex: 0 0 auto; }
  .phone-sheet-body .thumbnail-strip.sheet { margin: 0 -16px 8px; padding: 0 16px; }
```

(the existing `.phone-sheet-tab[aria-selected="true"]` already uses `accent-text` and `selected-edge` since Task 3). In the landscape block keep `border-radius: var(--ql-radius-xl) 0 0 0`.

`src/App.tsx`: the phone's atom Explore tab content becomes

```tsx
                <>
                    {stripItems.length > 0 && (
                        <ThumbnailStrip items={stripItems} label="orbitals in view" rGrid={atomRGrid} themeKey={stripThemeKey}
                            onSelect={handleLevelNavigate} variant="sheet" />
                    )}
                    <LevelNav {...levelNavProps} variant="body">{subshellPanel}</LevelNav>
                    {relativityControl}
                </>
```

- [ ] **Step 3: Tablet — Explore folds, the search shrinks**

`src/useMediaQuery.ts`: add

```ts
/** Below 1100 px the top bar drops its area tabs and the search becomes an icon (spec §7). */
export const TOPBAR_COMPACT = '(max-width: 1099px)';
```

`src/shell/TopBar.tsx`: add `/** Below 1100 px: the search is an icon opening a 360 px popover (spec §7). */ compactSearch?: boolean;`; import `Popover` and `SearchIcon` (`@mui/icons-material/Search`); keep a `const [searchAnchor, setSearchAnchor] = useState<HTMLElement | null>(null);` (import `useState`); and render the search slot as

```tsx
        {compactSearch ? (
            <div className="app-topbar-search compact">
                <IconButton className="ql-icon-button" aria-label="Search" onClick={event => setSearchAnchor(event.currentTarget)}>
                    <SearchIcon fontSize="small" />
                </IconButton>
                <Popover open={searchAnchor !== null} anchorEl={searchAnchor} onClose={() => setSearchAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{ paper: { className: 'search-popover' } }}>
                    {search}
                </Popover>
            </div>
        ) : (
            <div className="app-topbar-search">{search}</div>
        )}
```

(`TopBar` becomes a function component body with a hook; keep its export.) Add to `src/shell/top_bar.css`: `.app-topbar-search.compact { width: auto; } .search-popover { width: 360px; padding: 8px; overflow: visible; }`.

`src/shell/ExplorePanel.tsx`: add `/** Medium width: a chevron that folds the panel to the rail (spec §7). */ onCollapse?(): void;` and, when given, render at the top of the panel (before the header):

```tsx
            {onCollapse && (
                <div className="explore-collapse-row">
                    <IconButton className="ql-icon-button" size="small" aria-label="Hide the Explore panel" onClick={onCollapse}>
                        <ChevronLeft fontSize="small" />
                    </IconButton>
                </div>
            )}
```

(import `IconButton` from `@mui/material`, `ChevronLeft` from `@mui/icons-material/ChevronLeft`; add `.explore-collapse-row { display: flex; justify-content: flex-end; padding: 8px 8px 0; }` to `explore.css`.)

`src/shell/AppShell.tsx`: add `onExpandExplore?(): void;`; give the Explore `<aside>` `hidden={exploreCollapsed}`; and when `exploreCollapsed && onExpandExplore`, render inside `.app-workspace`, before the viewport:

```tsx
                    <button type="button" className="explore-reveal" aria-label="Show the Explore panel" aria-expanded={false}
                        aria-controls="explore-panel" onClick={onExpandExplore}>
                        <span aria-hidden="true">›</span>
                    </button>
```

and in `app_shell.css`: `.app-shell.explore-collapsed .app-workspace { grid-template-columns: 28px minmax(0, 1fr); }` (replacing the Task 8 rule for the collapsed medium layout) and `.explore-reveal { align-self: start; width: 28px; height: 56px; border-radius: var(--ql-radius-md); border: 1px solid var(--ql-color-border-subtle); background: var(--ql-color-surface-1); color: var(--ql-color-text-2); cursor: pointer; }`.

`src/App.tsx`: `const compactTopBar = useMediaQuery(TOPBAR_COMPACT) && !isNarrow;` and `const [exploreCollapsed, setExploreCollapsed] = useState(false);`; pass `compactSearch={compactTopBar}` to `TopBar`; pass `exploreCollapsed={isMedium && exploreCollapsed}` and `onExpandExplore={() => setExploreCollapsed(false)}` to `AppShell`; give both Explore slot values — `atomExplore` and `<ExplorePanel body={exploreContent} />` — `onCollapse={isMedium ? () => setExploreCollapsed(true) : undefined}` (add the same optional prop to `AtomExplore` and pass it through to its `ExplorePanel`).

- [ ] **Step 4: Run the tests**

Run: `npx jest tests/shell src/App.test.tsx` → PASS; then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 5: Live check [visual] (expect ~5 min)**

```bash
node tools/design/shoot.mjs --task T17 --scenes c-whole,c-2pz,water --themes dark,light --sizes phone,phone-landscape,tablet
```

Checklist `/tmp/6g1-T17-checklist.md`: *Phone 390 × 844* — 52 px top bar (brand, "Atoms ▾", search, avatar), the header line under it, the 3D view, compact keys under the header, the sheet's `bg-bar` tab bar with the active tab's 2 px bar; body text 14 px, captions 12, nothing under 11 (check `metrics.fonts`); every touch target ≥ 44 px (top-bar buttons, sheet tabs, strip tiles 56 px). *Phone sideways 844 × 390* — one merged 44 px line, the sheet down the right. *Tablet 1024 × 768* — rail 76, Explore 300 with its chevron, inspector folded to the 44 px bar inside the viewport's right edge, no area tabs, the search as an icon. Science: the same texts as on desktop. The phone checks a camera framed clear of the header and the sheet (`metrics.insets`).

Also the 200 % zoom stand-in (ruling R9): add `zoom: { width: 720, height: 450 }` to `SIZES` in `tools/design/shoot.mjs`, run `node tools/design/shoot.mjs --task T17z --scenes c-2pz --themes dark --sizes zoom`, and check nothing is clipped (the phone layout applies at 720 px).

- [ ] **Step 6: Commit**

```bash
git add src/shell/TopBar.tsx src/shell/top_bar.css src/shell/ExplorePanel.tsx src/shell/explore.css src/shell/AppShell.tsx src/shell/app_shell.css src/atom_ui/AtomExplore.tsx src/components/PhoneSheet.tsx src/style.css src/useMediaQuery.ts src/App.tsx tools/design/shoot.mjs tests/shell/phone_sheet.test.tsx tests/shell/top_bar.test.tsx tests/shell/app_shell.test.tsx src/App.test.tsx
git commit -m "feat(shell): tablet and phone baseline -- Explore folds to the rail, compact search, restyled sheet with the strip first (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/shell/TopBar.tsx src/shell/top_bar.css src/shell/ExplorePanel.tsx src/shell/explore.css src/shell/AppShell.tsx src/shell/app_shell.css src/atom_ui/AtomExplore.tsx src/components/PhoneSheet.tsx src/style.css src/useMediaQuery.ts src/App.tsx tools/design/shoot.mjs tests/shell/phone_sheet.test.tsx tests/shell/top_bar.test.tsx tests/shell/app_shell.test.tsx src/App.test.tsx
```

---

### Task 18: Accessibility pass — focus, roving keys in chip groups, reading order, reduced motion

**Estimate:** 90 min. **Spec:** §13 (Keyboard, Focus, Semantics, Targets, Reduced motion), §4.7. Most of §13 was built into Tasks 1–17 (contrast tests, landmarks, skip links, the listbox strip, tab rows, the rail's roving focus, Esc on the drawer and full screen); this task closes the rest and pins it.

**Files:**
- Create: `tools/design/keyboard_walk.mjs`
- Modify: `src/components/LevelNav.tsx` (roving focus in the shells group), `src/components/SubshellPanel.tsx` (in the subshell chips and the mₗ row), `src/design/design.css` (reduced-motion catch-all), `src/design/theme.ts` (focus rings on MUI Chip, Slider thumb and outlined inputs, whose own styles would otherwise win over `:focus-visible`)
- Test: `tests/a11y/focus_css.test.ts`, `tests/a11y/keyboard.test.tsx` (new); additions to `tests/design/quantum_theme.test.ts` and `src/App.test.tsx`

**Interfaces:**
- Consumes: `useRovingFocus` (Task 6).
- Produces: no new API. Every chip group (shells, subshells, mₗ) is one Tab stop with arrow keys inside; no stylesheet removes a focus outline without drawing a replacement; under `prefers-reduced-motion: reduce` no transition, animation or smooth scroll runs.

- [ ] **Step 1: Write the failing tests**

`tests/a11y/focus_css.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const SRC = resolve(__dirname, '../../src');
function cssFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith('.css') ? [path] : [];
    });
}
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Selectors allowed to drop the default outline, each because a replacement ring is drawn elsewhere. */
const OUTLINE_REPLACED: Record<string, string> = {
    '.global-search-input': '.global-search:focus-within draws the 2 px ring on the whole control',
    '#canvas-container.viewport-cell:focus': '#canvas-container.viewport-cell:focus-visible draws it for keyboard focus',
};

describe('focus is never removed (spec §13)', () => {
    it('removes an outline only where a replacement ring is drawn', () => {
        for (const file of cssFiles(SRC)) {
            const css = strip(readFileSync(file, 'utf8'));
            for (const match of css.matchAll(/([^{}]+)\{[^}]*outline:\s*(none|0)\b[^}]*\}/g)) {
                const selectors = match[1].split(',').map(s => s.trim());
                for (const selector of selectors) expect([file, selector, OUTLINE_REPLACED[selector] ?? 'NOT ALLOWED']).not.toContain('NOT ALLOWED');
            }
        }
    });

    it('draws a 2 px focus-ring outline with a 2 px offset everywhere', () => {
        const design = strip(readFileSync(join(SRC, 'design/design.css'), 'utf8'));
        expect(design).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--ql-color-focus-ring\);\s*outline-offset:\s*2px;\s*\}/);
    });

    it('stops every movement under prefers-reduced-motion, glows included only as static light (§4.7)', () => {
        const design = strip(readFileSync(join(SRC, 'design/design.css'), 'utf8'));
        expect(design).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*transition-duration:\s*0ms !important;[^@]*animation-duration:\s*0ms !important;[^@]*scroll-behavior:\s*auto !important;/);
    });
});
```

`tests/a11y/keyboard.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import LevelNav from '../../src/components/LevelNav';
import SubshellPanel from '../../src/components/SubshellPanel';
import { neonProfile } from '../export/fixtures';

describe('chip groups take the arrow keys and are one Tab stop (spec §13)', () => {
    it('the shells', () => {
        render(<LevelNav Z={10} selectedShell={2} selectedSubshell={null} selectedOrbital={null} onNavigate={jest.fn()} variant="configuration" />);
        const chips = within(screen.getByRole('group', { name: 'shells' })).getAllByRole('button').filter(b => b.classList.contains('level-nav-shell-chip'));
        expect(chips.map(chip => chip.tabIndex)).toEqual([-1, 0]);
        chips[1].focus();
        fireEvent.keyDown(chips[1], { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(chips[0]);
    });

    it('the subshells and the mₗ row', () => {
        const profile = neonProfile();
        render(<SubshellPanel subshells={profile.subshells} shellN={2} selectedSubshell={{ n: 2, l: 1 }} selectedOrbital={{ n: 2, l: 1, ml: 0 }}
            onSelectSubshell={jest.fn()} onSelectOrbital={jest.fn()} part="chips" />);
        const row = screen.getByRole('group', { name: 'magnetic quantum number' });
        const buttons = within(row).getAllByRole('button');
        expect(buttons.map(button => button.tabIndex)).toEqual([-1, 0, -1]);
        buttons[1].focus();
        fireEvent.keyDown(buttons[1], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(buttons[2]);
        const chips = within(screen.getByRole('group', { name: 'subshells in this shell' })).getAllByRole('button');
        expect(chips.filter(chip => chip.tabIndex === 0)).toHaveLength(1);
    });
});
```

`src/App.test.tsx` — add to `describe('App: shell', …)`:

```tsx
    it('reads top bar → rail → Explore → toolbar → strip → inspector, under one h1 (spec §13)', () => {
        const { container } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        const order = ['.app-topbar', '.app-rail', '.explore-panel', '.viewport-toolbar', '.thumbnail-strip', '.inspector']
            .map(selector => container.querySelector(selector)!);
        order.forEach(element => expect(element).not.toBeNull());
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });
```

`tests/design/quantum_theme.test.ts` — add inside the `describe.each`:

```ts
    it('draws the focus ring on MUI controls whose own styles would hide it (spec §13)', () => {
        const ring = { outline: `2px solid ${TOKENS[mode]['focus-ring']}`, outlineOffset: 2 };
        const overrides = theme.components!;
        expect((overrides.MuiButtonBase!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
        expect((overrides.MuiChip!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
        expect((overrides.MuiSlider!.styleOverrides!.thumb as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
        expect((overrides.MuiOutlinedInput!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focused']).toEqual(ring);
    });
```

Run: `npx jest tests/a11y tests/design/quantum_theme.test.ts src/App.test.tsx -t "focus|chip groups|reads top bar"`
Expected: FAIL — chip groups have no roving focus; no reduced-motion catch-all; no Chip/Slider/input rings.

- [ ] **Step 2: Roving focus in the chip groups**

`src/components/LevelNav.tsx`: import `useRef` and `useRovingFocus` (`'../shell/useRovingFocus'`); at the very top of the component body (before any early return, so the hook order never changes): `const shellsRef = useRef<HTMLDivElement>(null); useRovingFocus(shellsRef, { selector: '.level-nav-shell-chip', orientation: 'horizontal' });` and put `ref={shellsRef}` on the `<Box className="level-nav-shells" role="group" aria-label="shells">`.

`src/components/SubshellPanel.tsx`: the same pattern twice — `chipRowRef` on `.subshell-chip-row` with selector `'.subshell-chip'`, and `mlRowRef` on `.subshell-ml-row` with selector `'.subshell-ml-button'` (both `orientation: 'horizontal'`), hooks at the top of the component.

(MUI Chips and Buttons are focusable buttons with `aria-pressed`, which `useRovingFocus` reads as "current".)

In `src/design/theme.ts`, extend `components` (the `focus` constant already exists there):

```ts
            MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, '&.Mui-focusVisible': focus } } },
            MuiSlider: { styleOverrides: { thumb: { '&.Mui-focusVisible': focus } } },
            MuiOutlinedInput: { styleOverrides: { root: { '&.Mui-focused': focus } } },
```

(replacing Task 2's `MuiChip` entry).

- [ ] **Step 3: Reduced motion, everywhere**

Append to `src/design/design.css`:

```css
/* §4.7 under prefers-reduced-motion: hover, panels, sheet and strip move
   instantly. Glows stay (they are static). The camera tween and the
   shell↔orbital fade already honour reduced motion in the renderer. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest tests/a11y src/App.test.tsx tests/atom/level_nav.test.tsx tests/atom/subshell_panel.test.tsx` → PASS (existing chip tests click chips; roving only changes `tabIndex`). Then the whole suite, `npx tsc --noEmit -p tsconfig.json`, `npm run build`.

- [ ] **Step 5: Keyboard walk in the live app (expect ~3 min)**

A scripted keyboard pass, so the check is repeatable. Create `tools/design/keyboard_walk.mjs`:

```js
#!/usr/bin/env node
// Spec §13's keyboard check, live: its own Vite and headless Chromium (never
// the owner's), Tab through the Atom view at 1440 × 900, print every stop,
// and fail if any stop shows no 2 px focus ring. Composite MUI controls draw
// their ring on a wrapper, which is what is measured for them.
//   node tools/design/keyboard_walk.mjs [--port 5411]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', '5411'));
if ([5173, 5391, 8787].includes(port)) throw new Error(`port ${port} is the owner's; use 5411-5419`);

const vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('Vite did not start within 30 s')), 30000);
  const watch = chunk => { if (String(chunk).includes(`localhost:${port}`)) { clearTimeout(timer); ok(); } };
  vite.stdout.on('data', watch);
  vite.stderr.on('data', watch);
  vite.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited with ${code}`)); });
});

let browser;
let failures = 0;
try {
  await ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { try { window.localStorage.setItem('eov.theme', 'dark'); } catch { /* ignore */ } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/#mode=atom&Z=6&level=orbital&n=2&l=1&ml=0`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const host = element.closest('.global-search, .MuiSlider-thumb, .MuiInputBase-root, .MuiButtonBase-root') ?? element;
      const style = getComputedStyle(host);
      return {
        role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
        name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 60),
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth) || 0,
      };
    });
    if (!stop) continue;
    const ok = stop.outline !== 'none' && stop.width >= 2;
    if (!ok) failures++;
    console.log(`${String(i + 1).padStart(2)} ${ok ? 'ok  ' : 'FAIL'} ${stop.role} "${stop.name}" outline ${stop.outline} ${stop.width}px`);
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
if (failures) {
  console.error(`keyboard walk: ${failures} stop(s) without a 2 px ring`);
  process.exit(1);
}
console.log('keyboard walk ok: every stop showed a 2 px ring');
```

Run it:

```bash
node tools/design/keyboard_walk.mjs --port 5411
```

Expected: the first stops are "Skip to 3D view", "Skip to controls", the brand link, the area tabs, the search, Theme, Help, (avatar), then one rail stop, the Explore tabs and controls, the toolbar's buttons, one strip stop, the inspector's tabs — and `keyboard walk ok: every stop showed a 2 px ring`. Write the list into `/tmp/6g1-T18-checklist.md`.

- [ ] **Step 6: Commit**

```bash
git add src/components/LevelNav.tsx src/components/SubshellPanel.tsx src/design/design.css src/design/theme.ts tools/design/keyboard_walk.mjs tests/a11y/focus_css.test.ts tests/a11y/keyboard.test.tsx tests/design/quantum_theme.test.ts src/App.test.tsx
git commit -m "feat(a11y): chip groups take the arrow keys, focus rings are never removed, reduced motion stops all movement; reading order pinned (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/components/LevelNav.tsx src/components/SubshellPanel.tsx src/design/design.css src/design/theme.ts tools/design/keyboard_walk.mjs tests/a11y/focus_css.test.ts tests/a11y/keyboard.test.tsx tests/design/quantum_theme.test.ts src/App.test.tsx
```

---

### Task 19: Final live verification — composites beside the concept and the committed checklist [visual]

**Estimate:** 75 min (≈ 15 min of it is the `main` comparison run). **Spec:** §14 (Automated, Live visual check: captures for 6G-1's Atoms screens, composites, checklist items 1–6). This task changes no app code; if a check fails, stop and report which task owns the failure.

**Files:**
- Create: `tools/design/concept_crops.json`, `tools/design/composite.mjs`, `tools/design/science_diff.mjs`, `docs/quantumlab/checks/6G-1/*.png`, `docs/quantumlab/checks/6G-1/CHECKLIST.md`
- Modify: `tools/design/shoot.mjs` (`--root`, more science text)

**Interfaces:**
- Consumes: `tools/design/shoot.mjs` (Task 3), the whole app.
- Produces: `docs/quantumlab/checks/6G-1/atom-<scene>-<theme>-<size>.png` composites (concept crop left, capture right) and `CHECKLIST.md`, which Task 20 shows the owner.

- [ ] **Step 1: Everything automated is green (expect ~3 min)**

```bash
npx jest 2>&1 | grep -E "^(Tests|Test Suites):"
npx tsc --noEmit -p tsconfig.json; echo "tsc exit $?"
npm run build 2>&1 | tail -1 && npm run check:admin-split
git status --short
```

Expected: no failed suite; `tsc exit 0`; `admin split ok`; an empty `git status`.

- [ ] **Step 2: Let the live tool read another checkout and more science text**

In `tools/design/shoot.mjs`: replace `const ROOT = …` with

```js
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// --root runs another checkout's app (the `main` comparison of §14 check 5) with this tool and its scenes.
const ROOT = resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : DEFAULT_ROOT);
```

keep reading `scenes.json` and `sample_points.json` from `DEFAULT_ROOT` (change those two `resolve(ROOT, …)` calls to `resolve(DEFAULT_ROOT, …)`), and add to `collectMetrics()`'s `text`:

```js
      phaseKey: [...document.querySelectorAll('[aria-label="surface colour key"]')].map(e => e.textContent),
      plotLegend: [...document.querySelectorAll('.radial-plot-legend-item')].map(e => e.textContent),
      enclosedNote: document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.querySelector('.MuiFormHelperText-root')?.textContent ?? null,
      subshellChips: [...document.querySelectorAll('.subshell-chip')].map(e => e.textContent),
      configuration: document.querySelector('.level-nav-configuration')?.textContent ?? null,
```

(the Electron-enclosed helper is in the Display tab on the new build: before collecting on the new build, the tool clicks it — add `await page.getByRole('tab', { name: 'Display' }).click().catch(() => {});` right before `collectMetrics`, and `await page.getByRole('tab', { name: 'Configuration' }).click().catch(() => {});` right after, so the screenshot shows Configuration.)

- [ ] **Step 3: Capture 6G-1's screens in both themes and both sizes (expect ~6 min)**

```bash
node tools/design/shoot.mjs --task T19 --scenes c-whole,c-2pz,fe-shell --themes dark,light --sizes desktop,phone --wait 6000
```

Expected: 12 shots, every one `settled=true webgl=1 errors=0`.

- [ ] **Step 4: The same scenes on `main`, for check 5 (expect ~5 min)**

```bash
git worktree add --detach /tmp/6g1-main origin/main
(cd /tmp/6g1-main && npm ci --silent)
node tools/design/shoot.mjs --task T19main --root /tmp/6g1-main --scenes c-whole,c-2pz,fe-shell --themes dark --sizes desktop --wait 6000 --port 5412
git worktree remove --force /tmp/6g1-main
```

Create `tools/design/science_diff.mjs`:

```js
#!/usr/bin/env node
// §14 check 5: the science text on screen -- iso note, enclosed fraction, key
// wording, orbital labels, configuration -- identical to main for the same URL.
//   node tools/design/science_diff.mjs /tmp/6g1-T19main-metrics.json /tmp/6g1-T19-metrics.json
import { readFileSync } from 'node:fs';

const [mainFile, branchFile] = process.argv.slice(2);
const load = file => JSON.parse(readFileSync(file, 'utf8'));
const byScene = shots => Object.fromEntries(shots.filter(s => s.size === 'desktop' && s.theme === 'dark').map(s => [s.scene, s.metrics.text]));
const main = byScene(load(mainFile));
const branch = byScene(load(branchFile));
const FIELDS = ['phaseKey', 'plotLegend', 'enclosedNote', 'subshellChips', 'configuration'];
let differences = 0;
for (const scene of Object.keys(main)) {
  for (const field of FIELDS) {
    const before = JSON.stringify(main[scene]?.[field] ?? null);
    const after = JSON.stringify(branch[scene]?.[field] ?? null);
    if (before !== after) {
      differences++;
      console.log(`${scene} ${field}\n  main:   ${before}\n  6G-1:   ${after}`);
    }
  }
}
console.log(differences ? `${differences} difference(s): each must be explained in CHECKLIST.md or fixed` : 'science text identical to main');
process.exit(differences ? 1 : 0);
```

Run: `node tools/design/science_diff.mjs /tmp/6g1-T19main-metrics.json /tmp/6g1-T19-metrics.json`
Expected: `science text identical to main`, except differences the spec makes on purpose — the plot legend on the distribution tab must be identical; a `null` on one side where an element moved between tabs is a capture problem (fix Step 2's tab clicks), not a pass. Any other difference: stop and report it.

- [ ] **Step 5: Composites**

`tools/design/concept_crops.json` (pixel boxes in the 1536 × 1024 concept sheets; the Atom boxes were checked by cropping on 2026-10-13; the other three are for 6G-2/6G-3 and must be checked before use):

```json
{
  "theme-comparison": {
    "file": "docs/quantumlab/references/theme-comparison.png",
    "deep-space": { "x": 9, "y": 5, "width": 562, "height": 485 },
    "light-clean": { "x": 578, "y": 5, "width": 484, "height": 485 },
    "molecule-builder": { "x": 9, "y": 557, "width": 624, "height": 400 },
    "learning-center": { "x": 643, "y": 557, "width": 455, "height": 400 },
    "admin": { "x": 1106, "y": 557, "width": 425, "height": 400 }
  },
  "original-concepts": {
    "file": "docs/quantumlab/references/original-concepts.png",
    "dark-modern": { "x": 12, "y": 5, "width": 754, "height": 463 },
    "light-clean": { "x": 778, "y": 5, "width": 748, "height": 463 }
  }
}
```

`tools/design/composite.mjs`:

```js
#!/usr/bin/env node
// §14 "Composites": a capture beside its concept crop, written to docs/quantumlab/checks/.
// Draws in its own headless Chromium from data URLs -- no server, never the owner's browser.
//   node tools/design/composite.mjs --shot /tmp/x.png --sheet theme-comparison --crop deep-space --out docs/quantumlab/checks/6G-1/x.png
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const arg = name => { const i = process.argv.indexOf(`--${name}`); if (i < 0) throw new Error(`--${name} is required`); return process.argv[i + 1]; };
const crops = JSON.parse(readFileSync(resolve(ROOT, 'tools/design/concept_crops.json'), 'utf8'));
const sheet = crops[arg('sheet')];
const crop = sheet[arg('crop')];
const dataUrl = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body style="margin:0"></body>');
  const base64 = await page.evaluate(async ({ concept, shot, crop }) => {
    const load = src => new Promise((ok, fail) => { const image = new Image(); image.onload = () => ok(image); image.onerror = fail; image.src = src; });
    const [conceptImage, shotImage] = await Promise.all([load(concept), load(shot)]);
    const height = shotImage.height;
    const leftWidth = Math.round(crop.width * (height / crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = leftWidth + 24 + shotImage.width;
    canvas.height = height + 40;
    const g = canvas.getContext('2d');
    g.fillStyle = '#16181d';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(conceptImage, crop.x, crop.y, crop.width, crop.height, 0, 40, leftWidth, height);
    g.drawImage(shotImage, leftWidth + 24, 40);
    g.fillStyle = '#ffffff';
    g.font = '600 20px sans-serif';
    g.fillText('Concept', 8, 28);
    g.fillText('6G-1 build', leftWidth + 32, 28);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { concept: dataUrl(resolve(ROOT, sheet.file)), shot: dataUrl(arg('shot')), crop });
  const out = resolve(ROOT, arg('out'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(base64, 'base64'));
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
```

Run (dark beside concept A, light beside concept B; the 2p_z scenes also beside Options 1 and 2):

```bash
for scene in c-whole c-2pz fe-shell; do for size in desktop phone; do
  node tools/design/composite.mjs --shot /tmp/6g1-T19-$scene-dark-$size.png --sheet theme-comparison --crop deep-space --out docs/quantumlab/checks/6G-1/atom-$scene-dark-$size.png
  node tools/design/composite.mjs --shot /tmp/6g1-T19-$scene-light-$size.png --sheet theme-comparison --crop light-clean --out docs/quantumlab/checks/6G-1/atom-$scene-light-$size.png
done; done
node tools/design/composite.mjs --shot /tmp/6g1-T19-c-2pz-dark-desktop.png --sheet original-concepts --crop dark-modern --out docs/quantumlab/checks/6G-1/atom-c-2pz-dark-desktop-option1.png
node tools/design/composite.mjs --shot /tmp/6g1-T19-c-2pz-light-desktop.png --sheet original-concepts --crop light-clean --out docs/quantumlab/checks/6G-1/atom-c-2pz-light-desktop-option2.png
ls -la docs/quantumlab/checks/6G-1/
```

Expected: 14 PNGs. Open each with the Read tool.

- [ ] **Step 6: Write `docs/quantumlab/checks/6G-1/CHECKLIST.md`**

One section per capture (scene × theme × size), each with the six §14 checks as a table row "check | result | measured | note", filled from `/tmp/6g1-T19-metrics.json` and the composites:
1. *Colours* — every `colours[]` entry: name, sampled hex, token hex, ΔE₀₀, pass/fail (≤ 3 UI, ≤ 5 canvas on/off).
2. *Spacing* — `boxes` widths/heights against rail 76, Explore 315, inspector 290, top bar 56, gutters 12 (±2 px); phone: top bar 52, header line 44.
3. *Typography* — `fonts`: family, sizes and weights against §4.3.
4. *Components* — element tile, tab underline, chip segments, checkboxes/switches, thumbnail tiles with the selected glow, colour keys, toolbar: present and shaped as in the concept crop beside it; list what differs on purpose (no "Show nucleus"/"Show nodes"/"Model type" toggles — spec §2 Out; an inspector the concept A sheet lacks — spec §8.6; no Learning/Gallery/Projects — ruling R3).
5. *Science unchanged* — the `science_diff.mjs` result, and that `metrics.insets` keep the object clear of the zones (no lobe under the title, toolbar, keys or strip in the composite).
6. *One WebGL canvas, no console errors* — `webglCanvases` and `errors` per shot.

End with a summary line ("all pass", or the failing items with the task that owns each) and the date and commit it was taken at (`git rev-parse --short HEAD`).

- [ ] **Step 7: Commit**

```bash
git add tools/design/concept_crops.json tools/design/composite.mjs tools/design/science_diff.mjs tools/design/shoot.mjs docs/quantumlab/checks/6G-1
git commit -m "docs(design): 6G-1 live check -- Atom screens beside the concepts in both themes and sizes, checklist (Phase 6G-1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- tools/design/concept_crops.json tools/design/composite.mjs tools/design/science_diff.mjs tools/design/shoot.mjs docs/quantumlab/checks/6G-1
```

---

### Task 20: Owner review of the Atom view beside the concept (controller presents)

**Estimate:** 30 min of the controller's time, plus the owner's. **Spec:** §14 "Manual (owner)", §16 ("the owner told which environment it is in" comes after the deploy). No code.

The controller (not a subagent) does this, in the owner's own session:

- [ ] **Step 1:** Show the owner, side by side with the concepts, `docs/quantumlab/checks/6G-1/atom-c-2pz-dark-desktop.png`, `atom-c-2pz-light-desktop.png`, `atom-c-2pz-dark-desktop-option1.png`, `atom-c-2pz-light-desktop-option2.png`, `atom-c-whole-dark-desktop.png`, `atom-fe-shell-light-desktop.png` and the two `…-phone.png` 2p_z composites, plus `CHECKLIST.md`'s summary line.
- [ ] **Step 2:** Say plainly, in one short list, what differs from the concept on purpose and why: no "Show nucleus / Show nodes / Model type" (§2 Out: the renderer has none), an inspector the concept A sheet lacks (§8.6), Learning/Gallery/Projects absent (ruling R3), the High/Low bar only in the Density scheme with a cut (§11.5), the rim never in the other phase's hue (§11.2), Glow tuned values if Task 15 changed them.
- [ ] **Step 3:** Ask for approval to deploy. Approval, or a list of changes, is the owner's answer; a change becomes a follow-up task (with the same live check) before Task 21. Nothing is deployed without the owner's go-ahead.
- [ ] **Step 4:** Offer the manual checks §14 assigns the owner (rotate/pan/zoom, touch on a real phone, sign-in, one job request, every export kind, both themes, brand preview) — on the deployed site after Task 21, or on the owner's own dev server if they prefer, which this plan never starts.

---

### Task 21: Deploy the site (controller-confirmed)

**Estimate:** 20 min (the `site` phase builds, checks the admin split and the molecule data, and deploys the site stack; ~5–10 min), then 5 min of live verification. **Spec:** §16. **Only `infra/deploy.sh site`** — 6G-1 changes no compute, worker image or data, so `all`, `compute` and `image` are not run. Never `source` an infra script, never read `infra/owner.env` (the `site` phase does not read it either).

- [ ] **Step 1: Confirm with the controller.** Before anything touches AWS, the executor stops and asks the controller to confirm: "Ready to run `infra/deploy.sh site` from `design/quantumlab-redesign` at `<git rev-parse --short HEAD>`; Task 20 approved on <date>. Deploy now?" Proceed only on a yes. (Which branch production should serve is the controller's and owner's decision; this plan never pushes or merges.)

- [ ] **Step 2: Pre-flight (expect ~3 min)**

```bash
git status --short                      # expect: empty
npx jest 2>&1 | grep -E "^(Tests|Test Suites):"   # expect: no failures
aws configure list | grep region        # expect: us-east-1
```

- [ ] **Step 3: Deploy (one foreground command; expect 5–10 min)**

```bash
AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 ./infra/deploy.sh site
```

Use the Bash tool's 600000 ms timeout. Expected tail: `Checking the dashboard stays out of the main bundle...`, `admin split ok`, `Molecule data v3 is published; proceeding.`, CloudFormation `✅  ElectronOrbitalViewerStack`. If it is cut off by the timeout, CloudFormation carries on: re-run the same command (it resumes), never a different phase.

- [ ] **Step 4: Verify the live bundle (expect ~2 min)**

```bash
SITE=$(aws cloudformation describe-stacks --region us-east-1 --stack-name ElectronOrbitalViewerStack \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text)
echo "$SITE"
curl -s "$SITE/" | grep -o '<title>[^<]*</title>'                       # expect: <title>QuantumLab</title>
curl -s "$SITE/" | grep -c 'data-theme-boot'                            # expect: 1
curl -s "$SITE/" | grep -c 'fonts.googleapis.com'                       # expect: 0
LOCAL_MAIN=$(grep -o 'assets/main-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
LIVE_MAIN=$(curl -s "$SITE/" | grep -o 'assets/main-[A-Za-z0-9_-]*\.js' | head -1)
echo "local $LOCAL_MAIN live $LIVE_MAIN"                                # expect: the same file name
curl -s "$SITE/$LIVE_MAIN" | grep -c 'eov.theme'                        # expect: ≥ 1
curl -s "$SITE/$LIVE_MAIN" | grep -c 'eov-admin-dashboard'              # expect: 0 (the dashboard stays out)
curl -s "$SITE/admin.html" | grep -o '<title>[^<]*</title>'             # expect: <title>Owner dashboard · QuantumLab</title>
```

(CloudFront was invalidated by the deploy — `distribution_paths=["/*"]` in `infra/infra_stack.py`; if the live file name still differs, wait one minute and re-run the `curl` lines.)

Then one look at the live site in both themes, in a headless Chromium of the executor's own (never the owner's browser):

```bash
SITE="$SITE" node --input-type=module -e "
import { createRequire } from 'node:module';
const { chromium } = createRequire('/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(t => localStorage.setItem('eov.theme', t), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(process.env.SITE + '/#mode=atom&Z=6&level=orbital&n=2&l=1&ml=0');
  await page.waitForTimeout(8000);
  await page.screenshot({ path: '/tmp/6g1-live-' + theme + '.png' });
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas:not(.thumb-canvas)').length);
  console.log(theme, JSON.stringify(await page.title()), 'canvases', canvases, 'errors', errors.length);
  await context.close();
}
await browser.close();
"
```

Expected: `dark "Carbon — 2p_z orbital · QuantumLab" canvases 1 errors 0` and the same for light. Read both screenshots.

- [ ] **Step 5: Report**

Tell the controller, for the owner: the site URL, that 6G-1 is **deployed to the production site** (CloudFront `ElectronOrbitalViewerStack`) from `design/quantumlab-redesign` at `<sha>`, the live checks above with their results, and the two live screenshots. No commit is needed for a deploy.

---

## Self-review (done while writing; fixes are already in the tasks above)

**1. Spec coverage (6G-1 scope of §16, line by line).**
- Tokens, `tokens.css` generation and the font → Task 1 (tokens, generator, sync test, contrast), Task 3 (Inter in both entries, Roboto removed).
- Theme mechanics and migration → Task 2 (one key, legacy migration, system follow, storage event, in-memory fallback, boot script in both HTML files, MUI theme from tokens, three-item switch), Task 3 (both entries use it; `src/theme.ts` removed; panel_contrast reads tokens).
- Brands with the owner selector → Task 4 (data, pref, dev `?brand=`, fallback, wordmark, mark/favicon, titles, export metadata, contrast), Task 6 (Brand preview in the avatar menu, owner only).
- Top bar: tabs, real search, help, theme switch, avatar → Tasks 5–8 (Learning/Gallery absent: ruling R3).
- Rail; Explore; viewport frame (title, toolbar, keys, axes, strip); inspector → Tasks 6, 8, 9, 12, 14 (axes), 16 (strip), 13 (inspector).
- The Atoms screen complete, with atomic weights, electron count, R/|R|²/ρ tabs and orbital facts → Tasks 10, 11, 13 (ruling R2 for the distribution tab).
- The 3D mapping with Glow, Classic and the theme palettes → Tasks 12, 14, 15 (bloom out, §11.4).
- `ThumbnailService` for atom strips → Task 16 (ring glyphs for shells: ruling R5).
- Phone and tablet baseline → Tasks 8 (phone top bar, header offsets, medium drawer) and 17 (Explore folding, compact search, sheet restyle, strip first row).
- Basic, Bonds and Molecules inside the new shell with today's panels, themed → Task 3 (themed) and Task 8 (slots). Per mode, explicitly: **Basic Orbitals** — Explore holds today's `Controls` (n/l/mₗ, combination, view settings), the inspector its plot; **Bonds** — Explore holds today's `BondsPanel`, the inspector `Controls` and the potential curve; **Molecules** — Explore holds `MoleculeNav` and the jobs section, the inspector `Controls` and the orbital list; the molecule key stack stays bottom-centre; all three get the title block, toolbar and (non-Molecules) key column from Task 9 and the 3D mapping from Tasks 14–15. Their re-composition is 6G-2.
- Accessibility and contrast in both themes → Tasks 1, 3, 12 (science colours), 18. Deploy → Task 21, after the owner review in Task 20.
- §6.5's share-URL invariance → Review Focus 1, Task 8. §3.2's one renderer → Tasks 14 and 16 (`initVisualizer` once; one non-thumbnail canvas live).

**2. Placeholder scan.** No "TBD"/"TODO"/"handle edge cases". Three steps move existing JSX rather than retype it (LevelNav's configuration/about pieces, RelativityControl's children, App's viewport children); each names exactly which elements move and the existing tests that prove the DOM is unchanged.

**3. Type consistency.** Checked across tasks: `ThemeMode`, `ThemeChoice`, `Pref<T>`, `createPref`, `usePref`; `Brand`, `BrandId`, `brandPref`, `exportAppLabel`; `RenderPrefs`, `DisplayPrefs`, `PlotTabId`, `ColourScheme`, `Finish` (all in `presentation.ts`); `PhaseColours`, `phaseColours`, `curvePalette`, `themeCurveColour`, `densitySurfaceHex`, `axesStyle`, `linearRgb`, `displayRgb` (`science.ts`); `Appearance`, `CLASSIC_APPEARANCE` (`appearance.ts`); `setAppearance`, `attachThumbnails`, `VisualizerContext.appearance/lights/linesSuppressed/frameGuard/onAfterFrame`; `ThumbRequest`, `ThumbHost`, `ThumbnailService.store`/`cacheSize`; `StripItem`, `StripThumb`, `RingLayer`; `PlotTab` (with `csvQuantity`), `tabCurves`, `resolvePlotTab`; `ExportContext.phaseColours/csvQuantity`, `OverlaySpec.footer/phaseColours`, `CaptureTarget.background`; component props as listed in each task's Interfaces block.

**4. Review Focus.** Five lines, each with its test in its owning task: RF1 Task 8 (`src/App.test.tsx`), RF2 Task 2 (`tests/design/local_pref.test.ts`), RF3 Task 12 (`tests/shell/key_column.test.tsx`), RF4 Task 8 (`tests/App.molecules.test.tsx`), RF5 Tasks 5 and 7.

**Findings for the controller (not silently changed):**
- §13 says "the canvas keeps its existing keyboard camera controls"; there are none today (`orbital_controls_factory.ts` never calls `listenToKeyEvents`). Help therefore lists only real gestures; adding keyboard camera control is out of 6G-1's scope.
- §8.2 keeps the rail's accessible names ("atom mode", "molecule mode") while the visible labels are "Atoms", "Molecules"; WCAG 2.5.3 (label in name) wants the visible word inside the name. Renaming would change names tests rely on, which §8.2 forbids; flagged for 6G-3's accessibility polish.
