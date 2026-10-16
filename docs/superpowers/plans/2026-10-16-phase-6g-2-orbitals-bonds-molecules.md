# Phase 6G-2 — Orbitals, Bonds, Molecules and the jobs panels: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three modes 6G-1 left "placed, not re-composed" — Orbitals (Basic), Bonds and Molecules — get their 6G-2 composition (chips that draw on selection, header tiles, strips, plot tabs, a Properties card, space-filling and structure-only views, on-model bond lengths and angles, a quick pick with build-time thumbnails), the owner's jobs tools get a workspace and readable prices, five Atoms-view science and usability fixes from the owner's external review ship with it, and the result is live-checked, owner-reviewed and deployed.

**Architecture:** Nothing structural changes: `App.tsx` keeps its state and hands slots to `AppShell`; each mode's Explore panel stays the single column the owner shaped in rounds 22–23 (ruling P1) and gains a header tile; the inspector keeps its Display section on top (ruling R20b family) and gains Plot | Data tabs for Orbitals and Bonds and a Properties card for Molecules. The one renderer stays one renderer: `ThumbnailService` learns two more job kinds (analytic field meshes through the orbital worker, grid meshes through the grid-mesh worker) so Bonds and Molecules strips render through the same offscreen pass the Atoms strip uses. Bond labels are a DOM overlay projected from the main camera after each frame. Build-time quick-pick thumbnails are rendered once by a dev-only page through the app's own renderer and shipped as static WebP in the site bundle.

**Tech Stack:** React 19, MUI 7, Redux Toolkit, three r176, Vite 6, TypeScript 5.8, Jest 29 + ts-jest + Testing Library (jsdom), Node 24, Playwright 1.59 from `/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` (live checks only; `--gl metal`).

**Spec:** `docs/superpowers/specs/2026-10-13-phase-6g-quantumlab-redesign-design.md` (binding vision; §9.2, §9.3, §9.4, §9.4.1 and §16's 6G-2 line are this plan's scope; §3, §8, §10–§14 bind every task). **Owner rulings that override the spec:** `.superpowers/sdd/2026-10-13-phase-6g-1-shell-themes-atom/rulings.md` and the `Ruling R2x…` lines of `progress.md` beside it — where they differ from the spec, the rulings win (the reconciliation table below says where). **What is live:** `docs/quantumlab/checks/6G-1/CHECKLIST.md` (re-shot at `15814b1`). **Visual targets:** `docs/quantumlab/references/theme-comparison.png` (Molecule Builder crop, `tools/design/concept_crops.json` → `molecule-builder`) and `docs/quantumlab/references/original-concepts.png` Option 3 "Cinematic — Research Focus (Molecule View)" (no crop box yet; Task 17 adds `cinematic: { x: 12, y: 510, width: 866, height: 475 }`). The Orbitals and Bonds screens have no concept of their own: they follow the Atom view's shell (Option 1 / Option 2) and the Molecule Builder's left-panel language.

**Worktree:** `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab`, branch `design/quantumlab-6g2` (= `main` @ `72c8112`; 6G-1 is tag `v3.0-quantumlab`, live; the jobs owner-group check is merged). **Every command in this plan runs from that directory.** Measured on 2026-10-16 before any change: `npx jest` 207 suites, 4020 tests passed, 75 skipped, ~4 min wall (one intermittent jsdom worker crash in `src/orbital_viewer.test.tsx` on a first run — known since Task 20d, passes on re-run and alone; a task's "green" means a run with no failure, re-run once if that suite alone crashed); `npx tsc --noEmit -p tsconfig.json` exit 0; `npm run build` ~4 s; `npm run check:admin-split` prints `admin split ok`.

---

## Reconciliation: spec requirement → status

Statuses: **DONE** (shipped in 6G-1 or its rounds; where), **SUPERSEDED** (an owner ruling changed it; which), **TODO** (→ task). "P-n" are this plan's rulings (next section); "R-…" are the controller's rulings from the owner's external review (also recorded there).

| # | Spec requirement | Status |
|---|---|---|
| **§9.2 Orbitals (Basic)** | | |
| 1 | Explore header: fixed "Hydrogen-like, Z = 1" tile with today's one-electron note as caption | TODO → T6 |
| 2 | Energy level (n) chips 1–9 | TODO → T6 |
| 3 | Subshell chips s, p, d, f, g, h… only l < n | TODO → T6 |
| 4 | Orbital chips named by `orbitalName` | TODO → T6 |
| 5 | Draws on selection: chip change dispatches `startOrbitalCalculation` after 150 ms; replaces "Update Orbital"; `basicRenderNonce`, links and tests keep their meaning | TODO → T6 |
| 6 | Combination section (`CombinationControls`) in Configuration | DONE — `App.tsx` `renderControls('selection')` puts it in Explore (ruling R20b, Task 20b) |
| 7 | Orbitals tab: the orbital facts card | SUPERSEDED — no Explore tabs in this mode (P1); the facts card goes to the inspector's Data tab as in Atoms (P2) → T7 |
| 8 | Display as §9.1 | DONE — inspector Display section (rulings R20b, T20b-display-header, T20b-enclosed); Classic/Density removed (R22a) |
| 9 | Strip: orbitals of the current n grouped by l (n² tiles), lazy | TODO → T8 |
| 10 | Inspector plot tabs as §9.1; a combination keeps today's single plot | TODO → T7 |
| **§9.3 Bonds** | | |
| 11 | Explore header: the system tile (formula, name, "exact" for H₂⁺) | TODO → T9 |
| 12 | Configuration: system select, R, what to draw — "today's `BondsPanel`, regrouped" | DONE — ruling R23e (Task 23e, `b8035cb..610b599`): select grouped by bond type with bond orders, "Show: Total density \| One orbital", MO list under its heading and legend |
| 13 | Orbitals: `MoDiagram` restyled — `text-1` level lines, `accent-text` arrows, captions | TODO (verify) → T9 (`MoDiagram.tsx` holds no colour literal; T9 confirms its CSS reads tokens and records it, or fixes it) |
| 14 | Display as §9.1; the density key states the fixed ρ | DONE — inspector Display; key column `ρ = … e/a₀³, total electron density` (`App.tsx` Bonds `KeyColumn`, R23c-1 corner) |
| 15 | Strip: the system's drawable states (each MO, plus total density) | TODO → T10 |
| 16 | Inspector Plot: `BondsCurvePlot` / `PotentialCurvePlot` on plot-chrome tokens; reference colour `#8bc34a` → `success` | DONE — 6G-1 Task 12 (science colours from one source); `grep -c '#8bc34a' src/components/*.tsx` = 0; T9's live check re-reads the plot chrome |
| 17 | Data: captions, frontier orbitals and every method line | TODO → T9 (inspector Data tab, P19) |
| **§9.4 Molecules** | | |
| 18 | Left panel tabs Build / View / Properties | SUPERSEDED — ruling R23f ("left = what, right = how/data") and P1: Build → the Explore header (T12); View → the inspector Display (DONE, R20b/R23f); Properties → the inspector Data (T12) |
| 19 | Build: quick pick, five tiles with build-time thumbnails from "First examples", read from the index | TODO → T11 (tool) + T12 (tiles) |
| 20 | Build: molecule select (`MoleculePicker` search + category chips) in a popover | TODO → T12 (today inline under "Change molecule"; becomes a popover from the header tile, P1) |
| 21 | "…" opens the Gallery | SUPERSEDED — deferred to 6G-3 with the Gallery (§16; §3.5 real or absent) |
| 22 | Owner: "Request a new molecule" opens the Jobs tool | TODO → T16 (R-requestspace) |
| 23 | View: Surface Density / ESP / Orbital with an orbital select listing every orbital by 6D label and role | DONE — `MoleculeNav` switch + `MoleculeOrbitalList` in Explore (R23f, Task 23f) |
| 24 | View: Representation Ball and stick / Space filling (Bondi 1964) / None | TODO → T13 |
| 25 | View: Show bond lengths and angles | TODO → T14 |
| 26 | View: Dipole arrow with value and caveat, unseparated | DONE — `MoleculeViewOptions` inside the Display section (ruling T7-O3 kept) |
| 27 | View: Electron enclosed with the fixed-ρ and ESP notes | DONE — `Controls` `fractionNote` / `isoNote` |
| 28 | View: Opacity (untouched 1 → 0.6 on entry), surface style, colour scheme, cut away | DONE — scheme removed by R22a; the rest is the Display section |
| 29 | Properties: formula, point group, electrons, multiplicity, dipole, HOMO–LUMO/LVMO gap with caveat, geometry source + honesty line, tier line | TODO → T12 (inspector Data card, P10) |
| 30 | Right tool column (88 px): Structure, Orbitals, ESP, Provenance, Jobs | SUPERSEDED — R22c (readout → Explore "Selection"), R23f (MO list → Explore), Task 22c (ESP legend compact in the key column, notes behind ⓘ), R23f-2 (provenance → pinned footer), jobs stay in Explore (`MoleculeJobsSection`); T16 reshapes the jobs part |
| 31 | Strip: Ball and stick, Space filling, Density, ESP, HOMO, LUMO, LVMO, "All orbitals" | TODO → T15 |
| 32 | URL keys `show=none`, `struct=space` (backward-compatible) | TODO → T13 |
| 33 | Title "<Name> (<formula>)", subtitle surface + method, tier badge under it | DONE — `view_title.ts`; R22c put `TierBadge` in `TitleBlock` (`CHECKLIST.md` water scene) |
| 34 | Key column holds ESP, phase or density keys | DONE — `App.tsx` Molecules `KeyColumn` (R23c-1 corner) |
| **§9.4.1 Bond lengths and angles** | | |
| 35 | Screen-space DOM overlay from projected 3D points each frame; `aria-hidden` mirror of the Structure table | TODO → T14 |
| 36 | Every bond's length (Å, 3 dp) and the angle at each two-bond atom (arc + degrees); > 12 atoms → picked atom/bond only | TODO → T14 |
| 37 | Labels 12/600 `text-1` on a `surface-2` 85 % pill; arcs 1.5 px `selected-edge` | TODO → T14 |
| 38 | Off by default; the switch is in View | TODO → T14 (switch in the inspector Display; a display preference, never in a link — P9) |
| **§16, the 6G-2 line** | | |
| 39 | Rebased on 6D | DONE — `main` @ `72c8112` contains 6D (v3 data) |
| 40 | Re-composition of §9.2–§9.4 | rows 1–34 |
| 41 | Structure-only and space-filling views; on-model lengths and angles | TODO → T13, T14 |
| 42 | Strips for all three modes | TODO → T8, T10, T15 |
| 43 | Build-time Gallery/quick-pick thumbnails generated and published with the data version | TODO → T11 (shipped in the site bundle, not the data bucket — P11) |
| 44 | The jobs panels restyled in the Jobs tool | TODO → T1 (R-pricebreakdown), T16 (R-requestspace) |
| **§12 / §14 for this sub-phase** | | |
| 45 | Runtime thumbnails for Basic, Bonds and the current molecule's views on the main renderer | TODO → T8, T10, T15 |
| 46 | §14 captures: Basic (3d_z²), Bonds (N₂ σg), Molecules (water HOMO; water ESP; benzene density; the C₂H₂ deep link); composites and `docs/quantumlab/checks/6G-2/CHECKLIST.md` | TODO → T17 |
| **Owner's external review (controller rulings, 2026-10-16)** | | |
| 47 | R-valence: valence = outermost shell + partly filled (n−1)d / (n−2)f; filled d¹⁰/f¹⁴ are core; shell markers; caption | TODO → T2 |
| 48 | R-help: "About this model" / Help follows the selected relativity and says picture vs energies | TODO → T2 |
| 49 | R-accuracy: every calculated IE shows method, NIST value where one exists, signed %, limitation note; Pa check first | TODO → T3 |
| 50 | R-plotroom: Display collapsed by default under 1000 px tall; subshell rows wrap the energy | TODO → T4 |
| 51 | R-firstview: camera at the cut face on first load / share link; one-time dismissible hint | TODO → T5 |
| 52 | R-requestspace: a request workspace in the viewport cell | TODO → T16 |
| 53 | R-pricebreakdown: stacked cost lines replace the four-column table (early, live bug) | TODO → T1 |
| 54 | Admin: billed-vs-metered reconciliation; scannable jobs table; prediction quality per sizing version | SUPERSEDED — out of 6G-2, listed under "Deferred to 6G-3 (Admin)" below |

**Counts:** DONE 12 · SUPERSEDED 5 · TODO 36 · row 40 is a pointer to rows 1–34 (54 rows). Rows 41, 42 and 45 restate §16/§12 scope already carried by rows 9, 15, 24, 25, 31; every TODO row maps onto Tasks 1–17.

---

## Rulings this plan makes

Science decisions are the developer's (owner delegates them); UX decisions follow the owner's rounds 22–23 and the controller's R-rulings. Each line ends with what it costs if wrong.

- **P1 — No new tab rows in Explore.** Bonds and Molecules keep the single-column Explore the owner shaped in rounds 22–23 and approved ("it looks good", live `b0740a1`); Orbitals' Explore (selection + combination) is one short column too. The spec's Bonds *Configuration | Orbitals | Display* and Molecules *Build | View | Properties* tabs are superseded: *Display/View* already live in the inspector (R20b family, R23f), *Properties* goes to the inspector's Data (P10), *Build* is the Explore header (tile, change ▾ popover, quick pick). Each mode gets a header tile like the Atom's element tile. — cost if wrong: one tab row per mode, added later without moving content.
- **P2 — Orbitals' facts card lives in the inspector Data tab** (as Atoms), computed by `orbitalFacts()` with the hydrogenic iso and fraction; not in Explore. — cost: none (one slot).
- **P3 — Draw on selection.** A chip change updates `basicSelection` at once (as the selects do today) and dispatches `startOrbitalCalculation(basicOrbitalParams(n, l, ml, fraction))` after 150 ms with no further change, through `handleOrbitalParamsChange`; `basicRenderNonce`, `selectShownBasicOrbital` and the link stay as they are (a link names the drawn orbital). "Update Orbital" is removed; the 17 tests that press it pick a chip and advance fake timers instead, each with a why comment. The enclosed fraction keeps ruling T20b-enclosed (applies at once). — cost: test churn only.
- **P4 — Orbitals strip at 64³** (`THUMB_RESOLUTION`, R20d): n² tiles grouped by l, labelled by `orbitalName`; only visible tiles request (the strip's `IntersectionObserver` gating, already present); the key column heads the phase key "Orbital tiles" while the strip shows (ruling T16-tilekey). High-n tiles are shape hints at this resolution and the key says so by that heading. — cost: 81 coarse tiles at n = 9.
- **P5 — `ThumbRequest` becomes a union** of three job kinds — `{ params: OrbitalParams }` (today), `{ field: FieldRenderRequest }` (one analytic source through the orbital worker's `calculateFields`, resolution 40 as §12 says for MOs), and `{ grid: GridMeshRequest }` (through `createGridMeshWorker`) — each with its own `contentKey` and a `colouring: 'phase' | 'density' | { kind: 'esp'; grid: ScalarGrid; limit: number }`. The host gains `createGridWorker`; `render()` takes the mesh and the colouring. Phase tiles stay pixel-identical (a test pins the old path). — cost: one more branch in a scheduler that is already tested without WebGL.
- **P6 — Molecules strip tiles.** *Density, ESP, HOMO, LUMO, LVMO* render through P5 (density and ESP from the loaded density grid; MOs analytic at 40³); *Ball and stick* and *Space filling* are Canvas-2D glyphs of the real structure (`projectStructure`, CPK, the same projection `StructurePreview` uses); *All orbitals* is an icon tile that switches the surface to Orbitals and focuses the MO list. — cost: GPU time per molecule (≤ 5 meshes, one per frame).
- **P7 — `StripItem<T>` is generic over its target** (`NavigationTarget` for Atoms and Orbitals, `BondsView` for Bonds, a `MoleculeStripTarget` for Molecules); `ThumbnailStrip<T>` forwards `onSelect(target: T)`. — cost: a type parameter on two files.
- **P8 — Representation replaces `showStructure`.** `moleculeSlice.representation: 'ball-and-stick' | 'space-filling' | 'none'`; `setShowStructure(true/false)` is kept as an alias (ball-and-stick / none) so every caller and test keeps working; URL `struct=0` ↔ none, `struct=space` ↔ space-filling, absent or `1` ↔ ball-and-stick; `show=none` draws no surface (`surface.kind = 'none'`, which `planMoleculeRender` treats as "clear the mesh"). Picking works in every representation (spheres carry `moleculePart`). — cost: one enum where a boolean was.
- **P8b — Van der Waals radii: Bondi 1964 (J. Phys. Chem. 68, 441) as the spec says, plus Mantina et al. 2009 (J. Phys. Chem. A 113, 5806) for the H–Kr elements Bondi does not list (Be, B, Al, Ca, Ge).** Sc–Co have no radius in either source; a molecule holding one of them gets "Space filling" disabled with the reason "no van der Waals radius tabulated for Fe (Bondi 1964 / Mantina 2009)". No third source, no guessing. — cost: space filling unavailable for a few computed transition-metal molecules.
- **P9 — Bond labels are a display preference** (`eov.display.moleculeLabels`, default off, never in a link), drawn by a `MoleculeLabels` overlay inside `#canvas-container` and positioned after every frame from `camera.project`, via a listener set on the visualizer context (`context.afterFrameListeners`; `attachThumbnails` registers `service.tick` there instead of owning `onAfterFrame`). The overlay is `aria-hidden`; the Selection section's readout stays the accessible text. Angles use an SVG arc of 8 projected points. With > 12 atoms and nothing picked, a caption in the overlay says "Pick an atom or bond to label it". — cost: one frame listener.
- **P10 — Properties card** (`MoleculePropertiesCard`, inspector Data) renders only facts `meta` carries, with the strings the rest of the app already uses — `formatFormula`, `formatPointGroup` + the symmetry `labelNote`, `electronCount`, `multiplicity`, `formatDipole` + `caveat`, the HOMO–LUMO (and LVMO) gap with `GAP_CAVEAT` (`orbital_display.ts`), `geometrySource` + `validatedLine`/`tierLine`. Nothing retyped: tests assert equality with those functions' output. — cost: none.
- **P11 — Build-time thumbnails ship in the site bundle:** `public/molecule-thumbs/v3/<id>.webp` (264 × 264, transparent, CPK ball-and-stick, one camera direction), generated by `tools/thumbs/render_thumbs.mjs` driving a dev-only page `tools/thumbs/thumbs.html` (served by the dev server from the repo, never a build input) through the app's own renderer in a headless Chromium of its own. Not published to the data bucket in 6G-2 (no `publish.py` change, `deploy.sh site` is enough); 6G-3's Gallery may move them. A missing file shows the formula large (spec §12). — cost: ~150 KB in the site bundle; a move later.
- **P12 — Request workspace** (R-requestspace): `RequestWorkspace` renders inside `#canvas-container` as `.request-workspace` (left-anchored, `min(560px, 55%)` wide, full height, scrolls inside) while `jobs.request.open && isOwner && !isNarrow`; it is a LEFT camera inset (`LEFT_ZONES = ['.request-workspace']` in `useViewInsets.ts`). It holds the whole `RequestPanel` (form, recipe, Preview, `PreviewDetails` minus the SVG, `QuoteChooser`, submit). The resolved structure is drawn on the one canvas: `RequestPanel` reports the preview's atoms (`canonicalToBohr(preview.atoms)`) to `jobs.request.previewAtoms`; `useMoleculeView` draws that ball-and-stick (no surface, no dipole) while it is set, and the molecule's own picture returns when it clears (edit, close, submit, mode change, sign-out). The title block reads "Preview — <formula>" meanwhile. The Explore panel keeps only a "Request a new molecule" button (toggles `requestOpened`) and `JobStatusPanel`. Esc closes the workspace and returns focus to that button. Phones keep today's in-sheet panel with the SVG preview. — cost: a layout move; every existing behaviour (quote invalidation on edit, approval before submit, owner-only) is pinned by the existing `request_panel.test.tsx`, which moves with the component.
- **P13 — Price lines** (R-pricebreakdown): `<ul class="quote-lines" aria-label="<Option> price, line by line">` of `<li>` rows — item label, then "estimated $x · up to $y", then the note on its own line — replaces the `<table>`; `quote_chooser.test.tsx`'s two table assertions become list-item assertions with a why comment. — cost: none.
- **P14 — Valence rule** (R-valence, science): `valenceSubshellsOf(configuration)` = every subshell of the outermost n, plus every partly filled d or f subshell (0 < electrons < 2(2l+1)) of a lower n; filled d¹⁰ / f¹⁴ stay core. `valenceShellsOf` is the set of n those subshells span (so the "· valence" marker and the plot legend's "n=3 valence" follow it); `valenceConfigurationLabelOf` lists them in configuration order; the caption "open 5f and 6d count as valence" appears only when an inner subshell is included. `valenceShellOf` (highest n) keeps its name and meaning for the solver's framing. — cost: a label and a marker change for d/f-block elements; nothing numeric.
- **P15 — Ionisation energies** (R-accuracy, science): `NIST_FIRST_IONISATION_EV` extends to Z = 103 (NIST ASD, Kramida et al.; the table in T3, to be verified against NIST ASD before commit); the measured value shows for every species with one (overrides ruling C15's Z ≤ 18 gate: that gate was about the *spec check*, not the display); the signed difference is `(calculated − measured) / measured`, one decimal, with its sign; the limitation note "ΔSCF LDA with spherically averaged open shells; expect larger errors for d- and f-block elements" shows when |Δ| > 10 % or the species' configuration has a partly filled d or f subshell (P14's rule). The Pa check (T3 step 1) decides whether 7.38 eV is the model or a bug before any wording ships. — cost: one data file and one sentence.
- **P16 — Display collapsed on short windows** (R-plotroom): `displayOpen` becomes `boolean | null` in `eov.display` (null = never chosen); the inspector opens it when `window.innerHeight ≥ 1000` and collapses it below; a stored choice wins. Subshell chips let the energy wrap to a second line (`.subshell-chip-energy { flex-basis: 100% }`, chip height auto). — cost: none.
- **P17 — First view at the cut face** (R-firstview): whenever the camera is put at the canonical direction (`frameOrbital(…, restoreDefaultDirection = true)`: first load, a share link, element pick, Reset view) and a cut is active, the direction is `cutFaceCameraDirection(axis)` — on the removed (+axis) side, ~25° elevated and ~12° off-axis so the face is seen at a slight angle; user orbits are never touched. Reset view is included for consistency (it means "the standard view of this"). The one-time hint "Drag to rotate · pick a shell to explore" is a static chip at the viewport bottom-centre in Atoms mode, dismissed by its ✕, the first drag or a shell pick, stored in `eov.hint` (never in a link; no motion). — cost: Reset view with a cut shows the face, not the three-quarter view.
- **P18 — About this model follows the switch** (R-help): `LevelNav`'s about text takes `selected` (the Relativity switch) and `picture` (the drawn profile's mode): `methodStatement(selected)`, `aboutRelativitySentence(selected)`, and when `picture ≠ selected` the sentence "The picture on screen is still <picture mode>; the <selected mode> one is being solved." The ΔSCF sentence (energies are non-relativistic spin-polarised LDA in every mode, ruling C6) is kept and placed right after it, so the paragraph says what the picture shows and what the energies come from. Help's "About this model" renders the same component. — cost: wording only.
- **P19 — Bonds inspector gets Plot | Data** (as Atoms): Plot = the curve; Data = frontier orbitals, orbital caveats and the methods list (`bondsCaptions`) moved out of `BondsPanel`; the energy line and the bond-order footer stay with the R slider and the diagram. The phone's Plot tab stacks both. — cost: layout move only.
- **P20 — Bonds header tile**: formula (28/600), name, the bond-type group, `bondOrderSelectText`, and an "exact" chip for H₂⁺; the grouped select stays as the picker below it. — cost: none.
- **P21 — Estimate.** §16 says ~2–3 days; the tasks below sum to ≈ 33 h (≈ 4.5 working days) because the owner's external review adds ~8 h (valence, IE, first view, workspace, prices) and three strips need the thumbnail pipeline generalised.
- **P22 — Deploy is `infra/deploy.sh site` only** (no compute, image or data change; P11 keeps thumbnails in the site).

**Controller rulings from the owner's external review** (binding; restated with cost): **R-valence** (→ P14); **R-help** (→ P18); **R-accuracy** (→ P15; if the Pa check finds a bug, T3 fixes it — cost: ΔSCF values change for affected species, which would be a correction); **R-plotroom** (→ P16); **R-firstview** (→ P17); **R-requestspace** (→ P12); **R-pricebreakdown** (→ P13, Task 1, first).

## Deferred to 6G-3 (Admin) — no tasks here

- Admin reconciliation of AWS billed vs metered: period, coverage, attributed or explicitly unexplained delta.
- A scannable admin jobs table: main row = molecule, status, runtime, cost, Open result; files and diagnostics in expandable details; the monthly budget summary above the history.
- Prediction quality per sizing version: predicted vs actual runtime and memory.
- The Gallery "…" entry (§9.4 Build) and the public computed index (§9.5).

---

## Global Constraints

Copied verbatim from the spec (via the 6G-1 plan's list); where an owner ruling overrides a line, the override is stated after it. Every task's requirements include this section.

- "**The science is fixed.** Isosurface values, enclosed fractions, the meaning of phase, legends, captions, orbital labels, method strings and every number stay exactly as they are. The redesign changes only how things look and where they sit." (§3.1) — *This plan's science changes (P14, P15, P18) are the owner's own review items, each recorded as a ruling; everything else is bound by §3.1.*
- "**One canvas.** There is one `WebGLRenderer`, created once and never remounted by a theme, brand, layout or screen change. Thumbnails reuse it (§12)." (§3.2)
- "**Every colour is labelled.** Any hue on the 3D view, in a plot or in a thumbnail has a key on screen or in its accessible name." (§3.3)
- "**Tokens are the single source.** `src/design/tokens.ts` holds every colour, size and shadow for both themes. CSS custom properties, the MUI theme, the renderer's appearance and the contrast tests all read it." (§3.4)
- "**Real or absent.** A control, card, number or link exists only if it does something real." (§3.5)
- "Desktop navigation sits on the left (rail + Explore), view data on the right (inspector). The phone uses `.phone-header` plus `PhoneSheet`. The viewport frame adds fixed overlay zones (title, toolbar, key column, strip, §8.5). Each zone is measured as a camera inset, so the camera never frames the object under one, and nothing else floats over the canvas." (§3.6) — **Overridden by R23a:** there is no rail; the top bar's tabs are the four modes. **R23c-1:** the key column is the bottom-right corner. **R23f-3:** nothing that hovers may change an inset.
- "Inter Variable, self-hosted (`@fontsource-variable/inter`, OFL), replaces Roboto from Google Fonts. That removes a third-party request. The fallback is `system-ui, -apple-system, "Segoe UI", sans-serif`. Numbers in tables, readouts and KPIs use `font-variant-numeric: tabular-nums`." (§4.3) "On a phone, body is 14 and captions 12. Nothing is smaller than 11 px." (§4.3)
- "Under `prefers-reduced-motion` glows stay (they are static). Only movement is removed (§4.7)." "Nothing pulses, breathes or auto-rotates." (§4.6–4.7)
- "**Never in a link.** `encodeStateOf` is untouched. A test asserts the share URL is byte-identical before and after a theme or brand switch." (§6.5)
- "**Presentation preferences**, all in localStorage and never in links: `eov.render` holds surface style (`glow | solid | wireframe`) and scheme (`phase | density | classic`). `eov.display` holds `showAxes` and the radial plot tab." (§6.7) — **Overridden by R22a:** there is no scheme; `eov.render` holds `finish` only (ruling R1: Wireframe stays the link's). `eov.display` also holds `displayOpen` (T20b-display-header) and, from this plan, `moleculeLabels` (P9); `eov.hint` holds the dismissed hint (P17).
- "`#canvas-container` and `#orbital-canvas-host` keep their ids and their pointer handling." (§8.5)
- "Class names that tests or insets read (`.side-panel`, `.view-panel`, `#controls`, `.radial-plot`, `.phone-sheet`, `.molecule-legend-stack`…) are kept or moved together with their tests." (§10)
- "**Ruling:** the rim is the *same phase's* tint, never the other phase's hue." (§11.2) "**What does not change.** The geometry and its vertices, the iso value, cut planes, caps, stencil passes and opacity. Glow is presentation only." (§11.2)
- "The concept's High/Low bar therefore exists only where a scalar is really mapped. It is never shown beside a phase-coloured picture as if it described the surface." (§11.5) — **R22a:** there is no density scheme; the ESP bar and the Bonds/Molecules density key remain.
- "**Decision: two sources, split by what the data allows. There is never a second WebGL context.**" (§12) — **R20d:** strips mesh at 64³, not 32³; this plan's MO tiles use 40³ (§12's MO figure).
- "**Contrast.** WCAG AA in both themes" … "Large text, icons, control edges in their selected state, the focus ring, chart marks and plot curves need ≥ 3:1." (§13) "**Focus.** A 2 px `selected-edge` (dark) or `#1662E0` (light) outline with a 2 px offset, never removed, on every interactive element, MUI included." (§13) — **Overridden by R23b-1:** outlined inputs and Selects use their own 2 px focused border as the indicator, no extra outline. "**Search shortcut** ⌘K / Ctrl+K. It has a modifier, so it is outside WCAG 2.1.4. There are no single-key shortcuts." (§13)
- "`/admin.html` keeps its own entry, bundle and `ADMIN_ROOT_CLASS` … `npm run check:admin-split` must stay green." (§9.7)
- "**Out:** … Bloom post-processing (§11.4). A starfield or textured background, a decorative nucleus …, and "Show nodes" or "Model type ψ / |ψ|²" toggles … Any change to the solvers, workers, isosurface levels, enclosed fractions, jobs API, billing or Cognito." (§2) — *P5 adds message kinds the workers already answer; no solver changes. P15 adds a reference data file, not a solver change. If T3's Pa check finds a solver bug, fixing it is R-accuracy's explicit instruction.*
- "Each sub-phase ships on its own: tests green, reviewed, deployed with `deploy.sh` (site), `check:admin-split` run after the build, the live visual check committed, and the owner told which environment it is in." (§16)
- 6G-2's scope, verbatim (§16): "Rebased on 6D. The re-composition of §9.2–§9.4: chips that draw on selection; the Bonds regroup; Molecules' Build / View / Properties tabs, tool column and inspector tools. Structure-only and space-filling views; on-model lengths and angles. Strips for all three modes. The build-time Gallery/quick-pick thumbnails generated and published with the data version. The jobs panels restyled in the Jobs tool." — *tabs and tool column per P1 and R23f; publication per P11.*
- Owner rulings that bind every task here: R20a-1 (one phase palette), R20a-2 (opacity 0.7 default), R22a (Phase only), R22c (no prose over the canvas), R23a (top tabs, "Orbitals"), R23b-1/2/3, R23c-1/2/3, R23d, R23e, R23f, R23f-2, R23f-3, T16-optname ("<label> orbital" option names), T16-tilekey, WCAG-2.5.3 (visible label inside the accessible name).

### Process rules (binding on every task)

- **Run every command from** `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab`. Use absolute paths with the Read/Edit/Write tools.
- **Foreground commands only.** Never background a command, never use `&`, `nohup` or `run_in_background`; no subagents. A command that starts a server (Vite) starts and stops it inside the same foreground command (`tools/design/shoot.mjs` and `tools/thumbs/render_thumbs.mjs` do exactly that). Use the Bash tool's `timeout` of 600000 ms for `npx jest` (≈4 min) and for live checks (≈2–6 min).
- **Never** use the owner's browser, the Chrome extension tools, or the owner's dev servers (ports 5173 and 5391; also never 8787). Live checks run their own Vite on a free port (5411 by default; 5412–5419 if busy) and their own headless Chromium — Playwright from `/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` (what `shoot.mjs` already requires), launched with `--gl metal`.
- **Never touch** `tools/jobs/.state/` or `tools/molecules/out/`. **Never read `infra/owner.env`. Never `source` `infra/deploy.sh` or `infra/jobs.sh`.** No task here runs a script that needs `aws`/`cdk`/`docker` except Task 19 (the deploy itself). Python is not needed; do not run `tools/molecules/.venv` tests.
- **Never `git stash`** (the stash is shared with other worktrees). Set work aside with a WIP commit if you must.
- **Commits:** `git add <paths>` then `git commit -m "<subject>" -m "<body>" -- <paths>` with the same explicit paths, never `git add -A` / `git commit -a`. The subject ends with `(Phase 6G-2)`. The message ends with a `Co-Authored-By:` trailer naming the model that makes the commit (`Co-Authored-By: <model name> <noreply@anthropic.com>`). **Never push.**
- **Tests:** a task is done only when `npx jest` (whole suite), `npx tsc --noEmit -p tsconfig.json` and `npm run build` pass, and `npm run check:admin-split` prints `admin split ok`. Existing tests change only where this plan says so, each change with a one-line comment saying why (behaviour assertions — roles, names, dispatches — are kept; colour literals move to tokens). No test is deleted without a replacement.
- **Live visual verification** (tasks marked **[visual]**): `node tools/design/shoot.mjs --task 6g2-<task> --run <label> --gl metal --port 5411 --scenes <…> --themes dark,light --sizes desktop,phone` (add `tablet` where the task says) writes `/tmp/6g1-6g2-<task>-<scene>-<theme>-<size>.png` and `/tmp/6g1-6g2-<task>-<label>-metrics.json`. Open every screenshot with the Read tool, open the concept crop the task names, and write `/tmp/6g2-<task>-checklist.md` with the five headings of §14 (Colours ΔE₀₀ ≤ 3 UI / ≤ 5 canvas; Spacing: top bar 56, Explore 315, inspector 290, gutters 12, ±2 px; Typography: Inter Variable, title 20/600, nav 14/500, body 13/400, caption 12/400; Components present and shaped; Science unchanged: `webglCanvases` 1, `errors` empty, the task's named strings identical to the pre-task shot). A "fail" on anything the task owns is fixed before the commit; a "fail" that belongs to a later task names that task.
- **Science diff:** tasks that touch a mode's captions run `node tools/design/science_diff.mjs <before-metrics> <after-metrics>` between a pre-task and post-task shoot of the same scenes and expect `identical` for every string the task does not own.
- **Estimates** are wall-clock for one executor including the full test run; the owner wants them stated before each task starts.

## Review Focus

The five inputs the spec implies but no feature test would naturally exercise, most likely to bite first; each is pinned by the named test in its owning task.

1. **Three chip clicks within 150 ms in Orbitals mode** (n, then l, then mₗ) — expected: exactly one `startOrbitalCalculation`, for the final selection; the link copied afterwards names that orbital. Test: T6, `src/components/Controls.test.tsx` › `draws once, for the last of three quick chip changes (Review Focus 1)`.
2. **A share link with an unknown `struct` or `show` value** (`struct=banana`, `show=mo:`) — expected: the value is dropped, the molecule opens in ball-and-stick with its default surface, nothing throws, and `linkRejected` is not dispatched (the id was fine). Test: T13, `tests/molecules/url_keys.test.ts` › `drops an unknown struct or show value and keeps the molecule (Review Focus 2)`.
3. **Labels on, a molecule with more than 12 atoms, nothing picked** — expected: no label pills, one caption "Pick an atom or bond to label it", and the readout section unchanged. Test: T14, `tests/molecules/molecule_labels.test.tsx` › `large molecule shows only the picked part and says so (Review Focus 3)`.
4. **The request workspace is open when the session ends, the owner signs out, or the mode changes** — expected: the workspace closes (session-ended keeps the form in the sheet's alert path as today), the preview structure leaves the canvas and the molecule's own picture returns, a non-owner never sees `.request-workspace`. Test: T16, `tests/jobs/request_workspace.test.tsx` › `closes and restores the molecule when the session ends, on sign-out and on mode change (Review Focus 4)`.
5. **A Bonds strip while the scan point's basis is still loading, or after the system changes mid-job** — expected: tiles show their glyph, no mesh job is started for another R's or another system's basis, and a job in flight for the old system is cancelled. Test: T10, `tests/thumbs/bonds_strip_items.test.ts` › `requests nothing until the basis for this R has loaded, and the service cancels on a system change (Review Focus 5)`.

---

## File structure

```
src/atom/configurations.ts                 MODIFY  valenceSubshellsOf, valenceShellsOf, valenceNote (P14)
src/atom/ionisation_references.ts          MODIFY  NIST_FIRST_IONISATION_EV to Z = 103 (P15)
src/atom/ie_accuracy.ts                    NEW     signedDifferencePercent, limitationNote (P15)
src/components/LevelNav.tsx                MODIFY  valence line + caption + shell markers; about(selected, picture) (P14, P18)
src/components/SpeciesControls.tsx         MODIFY  measured for every Z, signed %, limitation note
src/components/SubshellPanel.tsx, src/style.css   MODIFY  energy wraps (P16)
src/design/presentation.ts                 MODIFY  displayOpen: boolean | null; moleculeLabels; hintPref (P16, P9, P17)
src/shell/Inspector.tsx                    MODIFY  default open by window height
src/camera_angles.ts                       MODIFY  cutFaceCameraDirection (P17)
src/orbital_visualizer.ts                  MODIFY  frameOrbital uses it; afterFrameListeners; attachThumbnails job kinds (P5, P9, P17)
src/shell/FirstViewHint.tsx                NEW     the one-time hint (P17)
src/components/QuoteChooser.tsx            MODIFY  price lines (P13)
src/basic_ui/BasicExplore.tsx  basic_explore.css  NEW  header tile, n / l / orbital chip rows, combination slot (T6)
src/basic_ui/useDrawOnSelection.ts         NEW     the 150 ms debounce (P3)
src/basic_ui/BasicInspector.tsx            NEW     Plot | Data for Orbitals (T7)
src/atom/plot_tabs.ts                      MODIFY  hydrogenic curve inputs (T7)
src/thumbs/strip_items.ts                  MODIFY  StripItem<T>; basicStripItems (T8)
src/thumbs/ThumbnailService.ts  render_thumbnail.ts  MODIFY  ThumbRequest union, colourings, grid worker (P5)
src/thumbs/bonds_strip_items.ts            NEW     (T10)
src/thumbs/molecule_strip_items.ts  structure_glyph.ts  NEW  (T15)
src/shell/ThumbnailStrip.tsx               MODIFY  generic target; 'structure' and 'icon' thumbs (P7, P6)
src/bonds_ui/BondsExplore.tsx  BondsInspector.tsx  bonds_explore.css  NEW  (T9)
src/components/BondsPanel.tsx              MODIFY  frontier/caveats/captions leave for the inspector (P19)
src/molecules/vdw_radii.ts                 NEW     Bondi 1964 + Mantina 2009 (P8b)
src/molecules/ball_and_stick.ts            MODIFY  buildSpaceFilling, Representation
src/store/moleculeSlice.ts  src/molecules/url_keys.ts  useMoleculeView.ts  render_plan.ts   MODIFY  representation, show=none, previewAtoms
src/molecules/bond_labels.ts               NEW     label geometry (pure) (P9)
src/components/MoleculeLabels.tsx  molecule_labels.css  NEW  the overlay (P9)
src/components/MoleculeViewOptions.tsx     MODIFY  representation segmented control + labels switch
src/molecule_ui/MoleculeExplore.tsx  MoleculeHeader.tsx  QuickPick.tsx  MoleculePropertiesCard.tsx  molecule_explore.css   NEW  (T12)
src/components/MoleculeNav.tsx             MODIFY  picker becomes a popover from the header (T12)
src/components/RequestWorkspace.tsx  request_workspace.css  NEW  (P12)
src/components/MoleculeJobsSection.tsx  RequestPanel.tsx  PreviewDetails.tsx  MODIFY  entry button, previewAtoms, SVG only on phones
src/store/jobsSlice.ts                     MODIFY  request.previewAtoms
src/useViewInsets.ts                       MODIFY  LEFT_ZONES
src/App.tsx                                MODIFY  the three modes' slots, strips, hint, workspace
tools/thumbs/render_thumbs.mjs  public/thumbs.html (dev-only, not a build input)  src/thumbs/thumbs_page.ts   NEW  (P11)
src/molecules/thumb_paths.ts               NEW     structureThumbUrl, structureThumbAlt
public/molecule-thumbs/v3/<id>.webp        NEW     25 files (T11)
tools/design/scenes.json  concept_crops.json  MODIFY  6G-2 scenes, cinematic crop
docs/quantumlab/checks/6G-2/               NEW     composites + CHECKLIST.md (T17)
tests/atom/ tests/basic_ui/ tests/bonds_ui/ tests/molecules/ tests/molecule_ui/ tests/thumbs/ tests/jobs/ tests/shell/   tests per task
```

## Tasks at a glance

| # | Task | Estimate |
|---|---|---|
| 1 | Price breakdown as stacked lines (live bug, first) | 30 min |
| 2 | Atoms: valence rule and "About this model" that follows the switch | 90 min |
| 3 | Atoms: ionisation energy accuracy — the Pa check, NIST to Z = 103, signed %, limitation note | 2 h |
| 4 | Atoms: Display collapsed on short windows; subshell rows wrap the energy | 45 min |
| 5 | Atoms: first view at the cut face; the one-time hint **[visual]** | 90 min |
| 6 | Orbitals Explore: header tile, chips, draw on selection **[visual]** | 2.5 h |
| 7 | Orbitals inspector: R(r) / \|R\|² / D(r) tabs, facts card, CSV per tab | 90 min |
| 8 | Orbitals strip: n² tiles grouped by l **[visual]** | 90 min |
| 9 | Bonds: header tile, Plot \| Data inspector, MoDiagram check **[visual]** | 2 h |
| 10 | Thumbnail service: field and grid jobs; the Bonds strip **[visual]** | 2.5 h |
| 11 | Build-time structure thumbnails: tool and the 25 WebPs | 2 h |
| 12 | Molecules Explore header, quick pick, picker popover, Properties card **[visual]** | 2.5 h |
| 13 | Representation (ball-and-stick / space filling / none), `struct=space`, `show=none` **[visual]** | 2 h |
| 14 | On-model bond lengths and angles **[visual]** | 2.5 h |
| 15 | Molecules strip **[visual]** | 2.5 h |
| 16 | Jobs: the request workspace in the viewport cell **[visual]** | 3 h |
| 17 | Final live verification: 6G-2 composites and committed checklist **[visual]** | 90 min |
| 18 | Owner review beside the Molecule Builder and Cinematic concepts (controller presents) | 30 min + owner |
| 19 | Deploy the site (controller-confirmed) | 30 min |
| | **Total** | **≈ 33 h** |

---

### Task 1: Price breakdown as stacked lines

**Estimate:** 30 min. **Ruling:** P13 (R-pricebreakdown). **Spec:** §9.4 "Jobs (owner)"; §16 "jobs panels restyled".

**Files:**
- Modify: `src/components/QuoteChooser.tsx` (`LineDetails`, lines 72–92)
- Modify: `src/style.css` (`.quote-lines` rules, lines 1527–1528)
- Test: `tests/jobs/quote_chooser.test.tsx` (the two assertions at lines 44–47 and 58–59)

**Interfaces:** none produced; consumes `AvailableQuoteOption.lines: QuoteLine[]` (`src/jobs/api_types.ts:64`).

- [ ] **Step 1: Change the two table assertions to list assertions** (why comment: `// Ruling P13: the four-column table clipped its notes in a 300 px panel; the lines are stacked now.`). Replace `getByRole('table', { name: 'Spot price, line by line' })` with `getByRole('list', { name: 'Spot price, line by line' })` and the `getAllByRole('row').map(textContent)` expectation with `getAllByRole('listitem').map(li => li.textContent)` whose expected strings are, per line, `${label}estimated ${estimate} · up to ${maximum}${note}` using the same `formatUsd` values the old rows carried (compute them from the fixture quote the test already builds). Add a test `each line's note is its own block, never clipped`: every `li` contains a `.quote-line-note` element and no `table` exists in the document.
- [ ] **Step 2: Run** `npx jest tests/jobs/quote_chooser.test.tsx` — Expected: FAIL (`Unable to find role="list"`).
- [ ] **Step 3: Replace the table.** In `LineDetails` render:

```tsx
<ul className="quote-lines" aria-label={`${optionLabel(option.option)} price, line by line`}>
  {option.lines.map(line => (
    <li key={line.item} className="quote-line">
      <span className="quote-line-item">{line.label}</span>
      <span className="quote-line-amounts">estimated {formatUsd(line.estimateUsd)} · up to {formatUsd(line.maximumUsd)}</span>
      <span className="quote-line-note">{line.note}</span>
    </li>
  ))}
</ul>
```

CSS: `.quote-lines { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 6px; font-size: var(--ql-type-caption-size); font-variant-numeric: tabular-nums; }` `.quote-line { display: grid; gap: 1px; min-width: 0; }` `.quote-line-item { font-weight: 600; color: var(--ql-color-text-1); }` `.quote-line-amounts { color: var(--ql-color-text-2); }` `.quote-line-note { color: var(--ql-color-text-3); overflow-wrap: anywhere; }`.
- [ ] **Step 4: Run** `npx jest tests/jobs/quote_chooser.test.tsx tests/jobs/request_panel.test.tsx` — Expected: PASS.
- [ ] **Step 5: Width check (no live shoot needed):** render `QuoteChooser` in the test at a 280 px wide container (`style.width`) and assert `scrollWidth <= clientWidth` is not available in jsdom — instead assert no element inside `.quote-lines` has `white-space: nowrap` via `getComputedStyle` of the stub stylesheet (`tests/style_stub.ts`), and that `.quote-line-note` has `overflow-wrap: anywhere`. Then one Playwright shot at 1024 × 768 (tablet) of the owner panel is Task 16's; this task's visual check is the test.
- [ ] **Step 6: Whole suite, tsc, build, admin split** (Process rules). **Commit:** `git add src/components/QuoteChooser.tsx src/style.css tests/jobs/quote_chooser.test.tsx && git commit -m "fix(jobs): the quote's price breakdown is stacked lines that fit any panel width (Phase 6G-2)" -m "Ruling P13 / R-pricebreakdown: the four-column table overflowed the panel and clipped its explanation column." -- src/components/QuoteChooser.tsx src/style.css tests/jobs/quote_chooser.test.tsx`

---

### Task 2: Atoms — valence rule and "About this model" that follows the switch

**Estimate:** 90 min. **Rulings:** P14 (R-valence), P18 (R-help). **Spec:** §3.1 (every number and label right), §9.1 Configuration lines.

**Files:**
- Modify: `src/atom/configurations.ts` (after `valenceElectronsFor`, line 270)
- Modify: `src/components/LevelNav.tsx` (valence line 361–368; `valenceN` 224 and `isValence` 373; about text 418–450; props 93–99)
- Modify: `src/App.tsx` (`levelNavProps` 1016–1032: add `selectedRelativity: relativity`)
- Modify: wherever the plot legend's "valence" marker is built — `grep -rn "valence" src/atom/atom_profile.ts src/atom/comparison_curves.ts src/App.tsx | grep -v valenceShellOf` names it; it reads `valenceShellsOf` after this task
- Test: `tests/atom/configurations.test.ts`, `tests/atom/level_nav_about.test.tsx` (new), `src/App.test.tsx` (the valence assertions it has: `grep -n "Valence:" src/App.test.tsx`)

**Interfaces produced:**
```ts
// src/atom/configurations.ts
export function valenceSubshellsOf(configuration: SubshellOccupancy[]): SubshellOccupancy[];
export function valenceShellsOf(configuration: SubshellOccupancy[]): ReadonlySet<number>;   // the n values valenceSubshellsOf spans
export function valenceNote(configuration: SubshellOccupancy[]): string | null;             // "open 5f and 6d count as valence" | null
// valenceConfigurationLabelOf now labels valenceSubshellsOf(configuration) in configuration order.
// src/components/LevelNav.tsx
export function aboutPictureSentence(selected: RelativityMode, picture: RelativityMode): string | null;
```

- [ ] **Step 1: Tests for the rule** (`tests/atom/configurations.test.ts`, new `describe('valence (ruling P14)')`), using `configurationFor(Z)` and `ionConfigurationFor(Z, charge)`:

```ts
const label = (Z: number) => valenceConfigurationLabelOf(configurationFor(Z));
it.each([
  [6, '2s² 2p²', null], [11, '3s¹', null], [17, '3s² 3p⁵', null],
  [26, '3d⁶ 4s²', 'open 3d counts as valence'], [30, '4s²', null], [29, '4s¹', null], [24, '3d⁵ 4s¹', 'open 3d counts as valence'],
  [58, '4f¹ 5d¹ 6s²', 'open 4f and 5d count as valence'], [64, '4f⁷ 5d¹ 6s²', 'open 4f and 5d count as valence'],
  [70, '6s²', null], [71, '5d¹ 6s²', 'open 5d counts as valence'],
  [91, '5f² 6d¹ 7s²', 'open 5f and 6d count as valence'], [92, '5f³ 6d¹ 7s²', 'open 5f and 6d count as valence'],
])('Z=%i reads %s', (Z, expected, note) => {
  expect(label(Z)).toBe(expected);
  expect(valenceNote(configurationFor(Z))).toBe(note);
});
it('shell set spans every valence subshell', () => {
  expect([...valenceShellsOf(configurationFor(91))].sort()).toEqual([5, 6, 7]);
  expect([...valenceShellsOf(configurationFor(30))]).toEqual([4]);
});
it('the outermost shell is always whole, even when it ends in a filled d (Zn²⁺ = [Ar] 3d¹⁰)', () => {
  expect(valenceConfigurationLabelOf(ionConfigurationFor(30, 2))).toBe('3s² 3p⁶ 3d¹⁰');
  expect(valenceNote(ionConfigurationFor(30, 2))).toBeNull();
});
```
The last test pins what the rule does *not* change: the outermost shell is listed whole (today's behaviour); the rule only adds partly filled d/f subshells *beneath* it.
- [ ] **Step 2: Run** `npx jest tests/atom/configurations.test.ts` — Expected: FAIL (`valenceNote is not a function`).
- [ ] **Step 3: Implement in `configurations.ts`:**

```ts
const capacityOf = (s: SubshellOccupancy) => 2 * (2 * s.l + 1);
/** Ruling P14 (R-valence): the outermost shell, plus any partly filled d or f subshell beneath it. */
export function valenceSubshellsOf(configuration: SubshellOccupancy[]): SubshellOccupancy[] {
    const outer = valenceShellOf(configuration);
    return configuration.filter(s => s.n === outer || (s.l >= 2 && s.n < outer && s.electrons > 0 && s.electrons < capacityOf(s)));
}
export function valenceShellsOf(configuration: SubshellOccupancy[]): ReadonlySet<number> {
    return new Set(valenceSubshellsOf(configuration).map(s => s.n));
}
export function valenceConfigurationLabelOf(configuration: SubshellOccupancy[]): string {
    return configurationLabelOf(valenceSubshellsOf(configuration));
}
export function valenceNote(configuration: SubshellOccupancy[]): string | null {
    const outer = valenceShellOf(configuration);
    const inner = valenceSubshellsOf(configuration).filter(s => s.n < outer).map(s => `${s.n}${'spdfgh'[s.l]}`);
    if (inner.length === 0) return null;
    return `open ${inner.join(' and ')} count${inner.length === 1 ? 's' : ''} as valence`;
}
```
`configurationLabelOf` must keep configuration order (it does today — it maps the list it is given). `valenceElectronsFor` is unchanged (it is the outermost shell's count and is used for the tile's count — check its callers with `grep -rn valenceElectronsFor src` and leave them).
- [ ] **Step 4: LevelNav.** Valence line: `Valence: {valenceConfigurationLabelOf(speciesConfiguration)}` then, when `valenceNote(...)` is non-null, `<span className="level-nav-valence-note"> · {note}</span>`; the old "· everything inside is core" shows only when the note is null and `shells.length > 1`. Shell chips: `isValence = valenceShells.has(shell.n)` with `const valenceShells = valenceShellsOf(speciesConfiguration)`. Plot legend marker: the builder found in Files reads the same set (one function, two readers). Update `src/App.test.tsx`'s valence assertions only where a d/f-block element is asserted (why comment naming P14).
- [ ] **Step 5: About text test** (`tests/atom/level_nav_about.test.tsx`): render `<LevelNav … variant="about" selectedRelativity="spinOrbit" relativity="scalar" pictureShown />` and assert the text contains `methodStatement('spinOrbit')`, `aboutRelativitySentence('spinOrbit')`, and `'The picture on screen is still scalar-relativistic; the one with spin–orbit is being solved.'`; with both `'off'` the sentence is absent and the text contains `'no spin-orbit coupling'` exactly once; with both `'spinOrbit'` it never contains `'no spin-orbit'`. Also `Help` (`tests/shell/help_dialog.test.tsx`): `aboutModel` renders whatever App passes — add one assertion in `src/App.test.tsx`'s existing Help test that with the switch on "With spin–orbit" the dialog text contains `'radial Dirac equation'`.
- [ ] **Step 6: Implement P18.** `LevelNav` gains `selectedRelativity?: RelativityMode` (defaults to `relativity`); `aboutPictureSentence(selected, picture)` returns null when equal, else `` `The picture on screen is still ${PICTURE_WORDS[picture]}; ${SELECTED_WORDS[selected]} is being solved.` `` with `PICTURE_WORDS = { off: 'non-relativistic', scalar: 'scalar-relativistic', spinOrbit: 'the Dirac (spin–orbit) one' }` and `SELECTED_WORDS = { off: 'the non-relativistic one', scalar: 'the scalar-relativistic one', spinOrbit: 'the one with spin–orbit' }`. The about paragraph uses `selectedRelativity` for `methodStatement` and `aboutRelativitySentence`, inserts `aboutPictureSentence` right after, then the existing ΔSCF sentence and `relativisticEnergiesSentence(selectedRelativity)`. App passes `selectedRelativity: relativity` (the effective switch, `App.tsx:225`).
- [ ] **Step 7: Run** `npx jest tests/atom src/App.test.tsx tests/shell/help_dialog.test.tsx` — Expected: PASS. Then the whole suite, tsc, build, admin split.
- [ ] **Step 8: Commit** (paths: the files above) — subject `fix(atoms): valence counts open d and f subshells; About this model follows the Relativity switch (Phase 6G-2)`, body naming rulings P14 and P18 with the Pa and Fe examples.

---

### Task 3: Atoms — ionisation energy accuracy

**Estimate:** 2 h (the actinide solves in step 1 take ~1–3 min each on this machine; run them once, foreground, with a 600000 ms timeout). **Ruling:** P15 (R-accuracy). **Spec:** §3.1; Phase 3's ruling C6 (ΔSCF from spin-polarised LDA; validated through Ar).

**Files:**
- Create: `tests/atom/delta_scf_heavy.test.ts` (the check; `describe.skip` unless `ATOM_SLOW_TESTS=1`, like `delta_scf_nist.test.ts`)
- Modify: `src/atom/ionisation_references.ts` (extend the table), `src/components/SpeciesControls.tsx` (lines 113–124 `EnergyLine`, 155–160 `measuredEv`)
- Create: `src/atom/ie_accuracy.ts`
- Test: `tests/atom/ie_accuracy.test.ts`, `tests/atom/species_controls_energies.test.tsx` (extend the existing SpeciesControls test file if one exists: `ls tests/atom | grep -i species`)

**Interfaces produced:**
```ts
// src/atom/ie_accuracy.ts
export function signedDifferencePercent(calculatedEv: number, measuredEv: number): number;   // (calc − meas) / meas × 100
export function formatSignedPercent(percent: number): string;                                // "+25.3 %", "−0.4 %", "0.0 %" never "−0.0 %"
export const IE_LIMITATION_NOTE = 'ΔSCF LDA with spherically averaged open shells; expect larger errors for d- and f-block elements';
export function ieLimitationNote(species: AtomSpecies, percent: number | null): string | null;  // note when |percent| > 10 or the configuration has a partly filled d/f (valenceNote(...) !== null)
```

- [ ] **Step 1: The Pa check (before any wording).** Write `tests/atom/delta_scf_heavy.test.ts`:

```ts
import { ionisationEnergy, polarisedTotalEnergy } from '../../src/atom/delta_scf';
import { neutralGround } from '../../src/atom/species';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';
import { configurationLabelOf } from '../../src/atom/configurations';
jest.setTimeout(1800000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
(SLOW ? describe : describe.skip)('ΔSCF first ionisation energies of d/f-block elements (ruling P15 check)', () => {
  // NIST ASD, eV: Pa 5.89, U 6.194, Th 6.307, Ce 5.539, Yb 6.254, Lu 5.426, Fe 7.902, Zn 9.394
  it.each([[91, 5.89], [92, 6.194], [90, 6.307], [58, 5.539], [70, 6.254], [71, 5.426], [26, 7.902], [30, 9.394]])('Z=%i', (Z, nist) => {
    const reading = ionisationEnergy(neutralGround(Z))!;
    const cation = configurationLabelOf(ionConfigurationFor(Z, 1));
    console.log(`Z=${Z}: ${reading.valueEv.toFixed(3)} eV vs NIST ${nist} (${(100 * (reading.valueEv - nist) / nist).toFixed(1)} %); cation ${cation}; E(neutral) ${polarisedTotalEnergy(neutralGround(Z)).toFixed(6)} Ha`);
    expect(Number.isFinite(reading.valueEv)).toBe(true);
  });
});
```
Run: `ATOM_SLOW_TESTS=1 npx jest tests/atom/delta_scf_heavy.test.ts 2>&1 | grep -E "Z=|Tests:"` (timeout 600000). Expected: eight lines; Pa ≈ 7.38 eV (+25 %) reproduces the owner's observation. Then answer, in the task report, these three questions from the printed lines and the code: (a) **Which electron is removed?** `ionisedSpeciesOf` takes the cation's NIST ground configuration from `ion_configurations.ts:120` (Pa⁺ = `[Rn] 5f2 7s2`, i.e. the 6d electron leaves) — correct by construction (a table of measured ground states, not a rule). (b) **Is the cation configuration right?** Compare the printed `cation` with NIST ASD's "Ground Shells" for Pa II (5f² 7s²), U II (5f³ 7s²), Th II (6d² 7s), Ce II (4f 5d²), Yb II (4f¹⁴ 6s), Lu II (4f¹⁴ 6s²) — `tests/atom/fixtures/nist_ion_ground_configurations.json` pins the table already; a mismatch is a bug and this task fixes the table entry (with the fixture). (c) **Is the size of the error the model's?** Expected pattern: Fe and Zn within ~5 %; the lanthanides within ~5–10 %; Th/Pa/U +15–25 %. ΔSCF LDA with spherical averaging of open 5f² 6d¹ shells (no multiplet resolution, LDA's self-interaction error on the localised 5f) over-binds the neutral relative to the cation — the sign (calculated too high) and the magnitude match the literature for LDA on early actinides. **Decision rule:** if (a) and (b) hold and the errors follow that pattern, it is the model's limitation and steps 2–6 ship the note. If a cation configuration is wrong, or the error is > 40 %, or the lanthanides are also > 15 % off, stop and report with the numbers — that is a bug hunt (same ruling: the task fixes it) before any wording.
- [ ] **Step 2: Reference data.** Extend `NIST_FIRST_IONISATION_EV` to Z = 103 (eV, NIST ASD "Ionization Energies", retrieved 2026-10-16; **verify every value against NIST ASD before commit** — the executor fetches `https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html` if it can; otherwise ships this table and says so in the commit body):
  K 4.341, Ca 6.113, Sc 6.561, Ti 6.828, V 6.746, Cr 6.767, Mn 7.434, Fe 7.902, Co 7.881, Ni 7.640, Cu 7.726, Zn 9.394, Ga 5.999, Ge 7.899, As 9.789, Se 9.752, Br 11.814, Kr 14.000, Rb 4.177, Sr 5.695, Y 6.217, Zr 6.634, Nb 6.759, Mo 7.092, Tc 7.119, Ru 7.361, Rh 7.459, Pd 8.337, Ag 7.576, Cd 8.994, In 5.786, Sn 7.344, Sb 8.608, Te 9.010, I 10.451, Xe 12.130, Cs 3.894, Ba 5.212, La 5.577, Ce 5.539, Pr 5.470, Nd 5.525, Pm 5.582, Sm 5.644, Eu 5.670, Gd 6.150, Tb 5.864, Dy 5.939, Ho 6.022, Er 6.108, Tm 6.184, Yb 6.254, Lu 5.426, Hf 6.825, Ta 7.550, W 7.864, Re 7.834, Os 8.438, Ir 8.967, Pt 8.959, Au 9.226, Hg 10.438, Tl 6.108, Pb 7.417, Bi 7.286, Po 8.418, At 9.318, Rn 10.749, Fr 4.073, Ra 5.278, Ac 5.380, Th 6.307, Pa 5.89, U 6.194, Np 6.266, Pu 6.026, Am 5.974, Cm 5.991, Bk 6.198, Cf 6.282, Es 6.368, Fm 6.50, Md 6.58, No 6.626, Lr 4.96.
  The H–Ar entries keep their existing full-precision values (the Phase 3 validation reads them). Test (`tests/atom/ie_accuracy.test.ts`): the table has an entry for every Z in 1…103 and none above; `NIST_FIRST_IONISATION_EV[91]` is `5.89`; `[26]` is `7.902`; the H–Ar values are unchanged (compare to a literal copy of the old 18).
- [ ] **Step 3: `ie_accuracy.ts` tests** (same file): `signedDifferencePercent(7.38, 5.89)` ≈ 25.3; `formatSignedPercent(25.3)` = `'+25.3 %'`; `formatSignedPercent(-0.04)` = `'0.0 %'` (never `'−0.0 %'`, as `SpeciesControls` M11 already rules for sizes); `ieLimitationNote(neutralGround(91), 25.3)` = `IE_LIMITATION_NOTE`; `ieLimitationNote(neutralGround(26), 2.1)` = the note (open 3d); `ieLimitationNote(neutralGround(11), 3.0)` = null; `ieLimitationNote(neutralGround(11), 12)` = the note (large error). Implement.
- [ ] **Step 4: `SpeciesControls`.** `measuredEv = species.charge === 0 ? NIST_FIRST_IONISATION_EV[species.Z] : undefined` (drop the `Z <= 18` gate; why comment: P15 overrides C15's display gate). `EnergyLine` renders, after the measured value, `` · {formatSignedPercent(percent)} `` with `aria-label` "difference from measured", and below the line (when `ieLimitationNote` is non-null) a `<Typography variant="caption" className="species-limitation">` with the note. Test (`species_controls_energies.test.tsx`): a Pa reading of 7.38 shows `measured 5.890 eV (NIST)`, `+25.3 %` and the note; a Na reading of 5.3 shows `measured 5.139 eV (NIST)`, `+3.1 %` and no note; a +1 ion shows no measured value and no percentage.
- [ ] **Step 5: Run** `npx jest tests/atom src/App.test.tsx` — Expected: PASS. Whole suite, tsc, build, admin split.
- [ ] **Step 6: Commit** — `fix(atoms): every ionisation energy shows its NIST value, signed difference and the model's limitation (Phase 6G-2)`, body: the Pa numbers from step 1 and the answer to (a)–(c); `Co-Authored-By` trailer.

---

### Task 4: Atoms — Display collapsed on short windows; subshell rows wrap the energy

**Estimate:** 45 min. **Ruling:** P16 (R-plotroom).

**Files:**
- Modify: `src/design/presentation.ts` (38–58), `src/shell/Inspector.tsx` (`InspectorDisplay`, 117–134), `src/components/SubshellPanel.tsx` (chip label 250–262), `src/style.css` (`.subshell-chip` rules near 771)
- Test: `tests/design/presentation.test.ts`, `tests/shell/inspector.test.tsx`, `tests/atom_ui/` or the existing SubshellPanel test (`grep -rl "subshell-chip" tests src | head`)

- [ ] **Step 1: Tests.** `presentation.test.ts`: `decodeDisplay(null).displayOpen` is `null`; `decodeDisplay('{"displayOpen":false}').displayOpen` is `false`; `decodeDisplay('{"displayOpen":"x"}').displayOpen` is `null`. `inspector.test.tsx`: with `window.innerHeight = 800` and no stored choice the Display section renders collapsed (`aria-expanded="false"`); with `innerHeight = 1000` expanded; with `displayPref.set({...displayOpen:true})` and `innerHeight = 700` expanded (stored choice wins); clicking stores a boolean. SubshellPanel test: the chip label contains `.subshell-chip-energy` holding `−0.501 Ha` (orbital energy) as its own element.
- [ ] **Step 2: Run** the three test files — Expected: FAIL.
- [ ] **Step 3: Implement.** `DisplayPrefs.displayOpen: boolean | null`, `DEFAULT_DISPLAY.displayOpen = null`, decode keeps booleans only. `InspectorDisplay`: `const open = display.displayOpen ?? (typeof window === 'undefined' || window.innerHeight >= 1000)`; the toggle writes `!open`. `SubshellPanel`: wrap the energy text (the `{energy} Ha` + method part at line ~257) in `<span className="subshell-chip-energy">`. CSS: `.subshell-chip { height: auto; } .subshell-chip .MuiChip-label { white-space: normal; } .subshell-chip-content { display: flex; flex-wrap: wrap; column-gap: 4px; } .subshell-chip-energy { flex-basis: 100%; }` — the separator `' · '` before the energy is dropped (the line break replaces it).
- [ ] **Step 4: Run** the tests — PASS. Whole suite, tsc, build, admin split.
- [ ] **Step 5: Commit** — `fix(atoms): the Display section starts collapsed on short windows; subshell rows wrap their energy (Phase 6G-2)` (ruling P16).

---

### Task 5: Atoms — first view at the cut face; the one-time hint **[visual]**

**Estimate:** 90 min. **Ruling:** P17 (R-firstview). **Spec:** §3.6 (the camera frames the object), §4.7 (no motion), §6.7 (preferences never in links).

**Files:**
- Modify: `src/camera_angles.ts` (add `cutFaceCameraDirection`), `src/orbital_visualizer.ts` (`frameOrbital`, 649–691)
- Create: `src/shell/FirstViewHint.tsx`, `src/shell/first_view_hint.css`
- Modify: `src/design/presentation.ts` (`hintPref`), `src/App.tsx` (render the hint in the viewport cell in Atoms mode; dismiss on `cameraMoved` and on a shell pick)
- Test: `tests/camera_angles.test.ts`, `tests/visualizer_view_insets.test.ts` (frameOrbital has a fake-context fixture there), `tests/shell/first_view_hint.test.tsx`, `src/App.test.tsx`

**Interfaces produced:**
```ts
// src/camera_angles.ts
export function cutFaceCameraDirection(axis: 'x' | 'y' | 'z'): readonly [number, number, number];
//   x → [0.88, 0.18, 0.44], y → [0.18, 0.88, 0.44], z → [0.44, 0.18, 0.88], each normalised (≈25° elevation, ≈12° off the axis)
// src/design/presentation.ts
export const hintPref = createPref<{ rotateDismissed: boolean }>('eov.hint', …);
```

- [ ] **Step 1: Tests.** `camera_angles.test.ts`: each direction is unit length, its dominant component is the axis, the other two are positive (the face is seen from the removed side, slightly above). `visualizer_view_insets.test.ts` (fake context): `frameOrbital(context, 5, true)` with `context.surfaceStyle.clipAxis = 'x'` puts `camera.position` along `cutFaceCameraDirection('x')` × distance; with `clipAxis = 'none'` along `CANONICAL_CAMERA_DIRECTION`; with `restoreDefaultDirection = false` the direction is the camera's own (unchanged behaviour). Shell views: `context.isShellView = true` uses `shellViewClipAxis(context)` (the fallback axis when none).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** in `frameOrbital`: `const direction = restoreDefaultDirection ? new THREE.Vector3(...(axis === 'none' ? CANONICAL_CAMERA_DIRECTION : cutFaceCameraDirection(axis))) : …` where `axis = context.isShellView ? shellViewClipAxis(context) : context.surfaceStyle.clipAxis`. `defaultCameraPosition` is untouched (thumbnails and the initial camera use it).
- [ ] **Step 4: Hint tests** (`first_view_hint.test.tsx`): renders `role="note"` with text `Drag to rotate · pick a shell to explore` and a button named `Dismiss hint`; clicking stores `{ rotateDismissed: true }` and unmounts; with the pref already dismissed it renders nothing; it has no animation class (`getComputedStyle` has no `animation-name` other than `none` in the stub). `src/App.test.tsx`: in Atoms mode the hint is present on first render; after `cameraMoved` is dispatched it is gone and the pref is set; in Orbitals mode it never renders; the share link is byte-identical before and after dismissal (reuse the Review Focus 1 helper from 6G-1).
- [ ] **Step 5: Implement** `FirstViewHint` (a `surface-2` chip with `text-1` text, caption size, ✕ icon button; CSS position `bottom: calc(var(--strip-clearance, 0px) + 12px)`, centred, `pointer-events: auto`; it is **not** an inset zone — it floats above the strip clearance like the busy chip, §8.5 "centre-bottom above strip"). App: render `isAtomMode && !hintDismissed && <FirstViewHint onDismiss={…} />`; dismiss in the `cameraMoved` handler path and in `handleLevelNavigate` when the target is a shell.
- [ ] **Step 6: Run** the tests; whole suite, tsc, build, admin split.
- [ ] **Step 7 [visual]:** `node tools/design/shoot.mjs --task 6g2-t5 --run a --gl metal --port 5411 --scenes c-2pz-cut,c-whole --themes dark,light --sizes desktop,phone`. Checklist: `c-2pz-cut` shows the cut face toward the camera (the cap's shading visible, not an edge-on plane) in both themes; `c-whole` shows the hint chip at the bottom centre clear of the strip and key column; science strings identical to a pre-task shot (`science_diff`); `webglCanvases` 1, `errors` empty.
- [ ] **Step 8: Commit** — `feat(atoms): a share link or first load looks at the cut face; a one-time rotate hint (Phase 6G-2)` (ruling P17).

---

### Task 6: Orbitals Explore — header tile, chips, draw on selection **[visual]**

**Estimate:** 2.5 h. **Rulings:** P1, P3. **Spec:** §9.2 Explore header and Configuration; §4.4 (chips 32 px), §13 (chip groups use arrow keys; names contain labels).

**Files:**
- Create: `src/basic_ui/BasicExplore.tsx`, `src/basic_ui/basic_explore.css`, `src/basic_ui/useDrawOnSelection.ts`
- Modify: `src/components/Controls.tsx` (the Basic selection half — n/l/mₗ selects, orbital-name heading, Update Orbital, the Z = 1 note — leaves; `part='selection'` in Basic mode renders nothing but `CombinationControls`), `src/App.tsx` (Explore slot for Basic: `BasicExplore`; phone Explore tab)
- Modify tests: `src/components/Controls.test.tsx` (12 references), `src/App.test.tsx` (4), `tests/export/caption.test.ts` (1) — each change with `// Ruling P3: chips draw on selection; Update Orbital is gone.`
- Test: `tests/basic_ui/basic_explore.test.tsx`, `tests/basic_ui/use_draw_on_selection.test.tsx`

**Interfaces produced:**
```ts
// src/basic_ui/useDrawOnSelection.ts
export const DRAW_DEBOUNCE_MS = 150;
/** Calls draw(selection) DRAW_DEBOUNCE_MS after the last change of selection; never on mount; cancelled on unmount or when `enabled` turns false. */
export function useDrawOnSelection(selection: BasicSelection, enabled: boolean, draw: (s: BasicSelection) => void): void;
// src/basic_ui/BasicExplore.tsx
interface BasicExploreProps {
  selection: BasicSelection; onChange(change: Partial<BasicSelection>): void;   // dispatches setBasicSelection, as App's setN/setL/setMl do
  combination: CombinationSelection; onCombinationChange(s: CombinationSelection): void;
  onCollapse?(): void;
}
```
Visible structure: header tile `.basic-tile` (88 × 96, `surface-3`, radius `lg`): top "Z = 1", centre "H" 28/600, "Hydrogen-like", caption below the tile = `BASIC_ORBITALS_ABOUT` (`Controls.tsx:296`, moved here, exported still for Help). Then three chip rows, each a `role="group"` with `useRovingFocus` (horizontal): **Energy level (n)** chips `1`…`9` (names `n = 3`); **Subshell** chips `s p d f g h i j k`[0…n−1] (names `3d subshell`); **Orbital** chips `orbitalName(n, l, ml)` for ml ∈ [−l, l] (names `3d_z² orbital` — ruling T16-optname's form). Selected chip: `selected-fill` + `selected-edge`, `aria-pressed`. While a combination is active the rows are disabled (as the selects were) and the heading reads `combinationTitle(combination)` + " — not drawn" when `selectionProblem`. Then `CombinationControls`. Phone: the same component in the sheet's "Orbital & view" tab ahead of the view half.

- [ ] **Step 1: Debounce tests** (`use_draw_on_selection.test.tsx`, fake timers): no call on mount; one change → one call after 150 ms with that selection; three changes within 150 ms → one call with the last (**Review Focus 1**, also in `Controls.test.tsx` as the named test, through `BasicExplore` + a mock `draw`); `enabled=false` → never; unmount before 150 ms → never.
- [ ] **Step 2: BasicExplore tests:** chip rows and names as above for `{n:3,l:2,ml:0}` (9 n-chips, 3 subshell chips s/p/d, 5 orbital chips); clicking `n = 4` calls `onChange({ n: 4 })`; clicking `p` calls `onChange({ l: 1 })` and the orbital row re-derives (ml resets to 0 through the existing `Controls`-style correction — put that correction in `BasicExplore`: if `l ≥ n` → `onChange({ l: 0, ml: 0 })`; if `|ml| > l` → `onChange({ ml: 0 })`, run in an effect exactly as `Controls` lines 318–325 did); the tile reads `Z = 1`, `Hydrogen-like`; the caption is `BASIC_ORBITALS_ABOUT`; arrow keys move focus within a row (reuse `tests/shell/roving_focus.test.tsx`'s pattern).
- [ ] **Step 3: Run** — FAIL. **Step 4: Implement** both files and the CSS (tokens only; chips 32 px, `radius md`, gap 6).
- [ ] **Step 5: Wire App.** `exploreContent` for Basic = `<BasicExplore selection={{n,l,ml}} onChange={…} combination… onCollapse…/>` inside `ExplorePanel`'s `body`; `useDrawOnSelection({n,l,ml}, isBasicMode && combination.kind === 'none', s => handleOrbitalParamsChange(basicOrbitalParams(s.n, s.l, s.ml, enclosedFraction)))` — placed in App beside the nonce effect (`App.tsx:500–504`), which stays as it is (it draws on mode entry and link restore; the debounce never fires on mount, so no double draw: add the test `entering the mode draws once (nonce), not twice` in `src/App.test.tsx`). Remove from `Controls` the Basic selection block (lines 383–435 selects and heading, 296 note, 660–672 Update Orbital) and from `App.test.tsx`/`Controls.test.tsx`/`caption.test.ts` the "Update Orbital" presses (choose chips + `jest.advanceTimersByTime(150)` instead). `#controls` id: the selection half no longer renders in Basic mode, so `renderControls('view')` must carry `id="controls"` in Basic mode (the insets and tests read it; note 1 of `CHECKLIST.md`) — change `Controls`' id rule to `id={part === 'view' && mode !== 'hydrogenic' ? undefined : 'controls'}` with a why comment, and keep `.controls-view`.
- [ ] **Step 6: Run** `npx jest src/components/Controls.test.tsx src/App.test.tsx tests/export tests/basic_ui` — PASS. Whole suite, tsc, build, admin split.
- [ ] **Step 7 [visual]:** `--task 6g2-t6 --scenes basic-3dz2 --sizes desktop,tablet,phone`. Add scene `basic-n4: "#mode=basic&n=4&l=2&ml=1"` to `scenes.json` and shoot it too. Checklist: tile 88 × 96; three chip rows, selected chip glow (dark) / ring (light); no "Update Orbital"; title "Hydrogen — 3d_z² orbital"; `|ψ|² = 1.30e-5` identical to `CHECKLIST.md`'s basic-3dz2 line; `science_diff` identical against a pre-task shot of `basic-3dz2`.
- [ ] **Step 8: Commit** — `feat(orbitals): header tile and n / subshell / orbital chips that draw on selection (Phase 6G-2)` (rulings P1, P3).

---

### Task 7: Orbitals inspector — R(r) / |R|² / D(r) tabs, facts card, CSV per tab

**Estimate:** 90 min. **Rulings:** P2; 6G-1's R2 (the distribution tab keeps today's curve and CSV), T13-tablabels, C6 (exported = plotted). **Spec:** §9.2 Inspector, §9.1 Plot/Data.

**Files:**
- Modify: `src/atom/plot_tabs.ts` (add hydrogenic inputs to `tabCurves`), `src/App.tsx` (Basic inspector = `BasicInspector`; CSV export of the tab on screen — follow how `atomTabCurves` feeds `handleExport('csv')` for Atoms, `App.tsx:1057–1062`)
- Create: `src/basic_ui/BasicInspector.tsx` (a thin composition of `Inspector` with tabs Plot | Data, `TabRow` of plot tabs, `OrbitalFactsCard`, "Export CSV of this plot" — mirror `AtomInspector`; do not duplicate its JSX: extract the Plot-tab-row + Data-card body from `AtomInspector` into `src/atom_ui/PlotDataTabs.tsx` and have both use it)
- Test: `tests/atom/plot_tabs.test.ts` (exists? `ls tests/atom | grep plot`; else create), `tests/basic_ui/basic_inspector.test.tsx`, `tests/export/` CSV test for the Basic tabs

**Interfaces produced:**
```ts
// src/atom/plot_tabs.ts
export interface HydrogenicCurveInputs { n: number; l: number; Z: 1; rMax: number; colour: string }
export function hydrogenicTabCurves(tab: PlotTabId, inputs: HydrogenicCurveInputs): RadialCurve[];
//   'wave': R_nl(r) from radialWaveFunction(n, l, r, 1) on PLOT_SAMPLE_COUNT points to rMax (signed)
//   'density': R(r)²
//   'distribution': today's curve exactly (radialProfile(n, l, Z, rMax) — whatever RadialPlot computes today for n/l/Z)
export const BASIC_PLOT_TABS: PlotTab[] = plotTabsFor('orbital', false, false);   // the non-relativistic orbital set
```

- [ ] **Step 1: Tests.** `hydrogenicTabCurves('wave', {n:1,l:0,…})` at r → 0 is positive and ≈ 2 (R₁₀(0) = 2 for Z = 1); `'density'` is its square pointwise; `'distribution'` equals the points `RadialPlot` plots today for n=1,l=0 (call the same function it uses — read `RadialPlot.tsx` to name it — and compare arrays); the 2s wave curve changes sign exactly once; tabs are the three of `plotTabsFor('orbital', false, false)` with labels `R(r)`, `|R|²`, `D(r)`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.**
- [ ] **Step 4: Inspector tests:** `BasicInspector` renders the tab row (names `Wave function R(r)`, `Probability density |R|²`, `Radial distribution D(r)`), the active tab's plot (`RadialPlot` with `title` = the tab's title), the Data tab with `OrbitalFactsCard` for `orbitalFacts({n:3,l:2,ml:0}, { enclosedFraction, isoValue })` (ruling T13-isostale: `…` while computing) and the CSV button; the `displayPref.plotTab` choice persists (as Atoms). A combination (`selectionPlot` non-null) hides the tab row and shows today's single plot (spec §9.2 last line).
- [ ] **Step 5: Implement** `BasicInspector` and wire App (`inspector` slot and the medium drawer for Basic; the phone's Plot tab stacks Plot then Data, ruling R7). CSV: `exportCurvesFor('csv')` in Basic mode returns `hydrogenicTabCurves(activePlotTab.id, …)` with `csvQuantity` from the tab (ruling C6), tested in `tests/export` by exporting after switching to `R(r)` and asserting the quantity line and that the numbers equal the plotted curve.
- [ ] **Step 6: Run** tests; whole suite, tsc, build, admin split. **Commit** — `feat(orbitals): R(r), |R|² and D(r) plot tabs, the facts card and CSV per tab in the inspector (Phase 6G-2)` (ruling P2).

---

### Task 8: Orbitals strip — n² tiles grouped by l **[visual]**

**Estimate:** 90 min. **Rulings:** P4, P7; T16-optname, T16-tilekey. **Spec:** §9.2 Strip, §12.

**Files:**
- Modify: `src/thumbs/strip_items.ts` (`StripItem<T = NavigationTarget>`; add `basicStripItems`), `src/shell/ThumbnailStrip.tsx` (generic `T`), `src/App.tsx` (strip for Basic; key heading), `src/shell/KeyColumn.tsx` if the "Orbital tiles" heading needs a Basic variant
- Test: `tests/thumbs/strip_items.test.ts` (add), `tests/shell/thumbnail_strip.test.tsx` (generic target compiles; no behaviour change), `src/App.test.tsx`

**Interfaces produced:**
```ts
export function basicStripItems(args: { selection: BasicSelection; enclosedFraction: number }): StripItem<BasicSelection>[];
// n² items for args.selection.n: for l in 0..n−1, for ml in −l..l → key `basic-n-l-ml`, label orbitalName(n,l,ml), spoken `${label} orbital`,
// group subshellLabel(n, l) ("3d"), target { n, l, ml }, selected when equal to the selection,
// thumb { kind: 'orbital', request: { contentKey: `basic|${n}|${l}|${ml}|${fraction}`, params: { ...basicOrbitalParams(n,l,ml,fraction), resolution: THUMB_RESOLUTION } } }
```

- [ ] **Step 1: Tests:** n = 3 → 9 items in groups `3s` (1), `3p` (3), `3d` (5), in that order, ml ascending; n = 9 → 81; the selected item is the selection; every request's `params.resolution` is 64 and `params.Z` is 1; spoken names end with ` orbital`. **Visibility gating:** `ThumbnailStrip` already observes tiles (`grep -c IntersectionObserver src/shell/ThumbnailStrip.tsx` = 1); add one test that an off-screen tile does not call `thumbnailService.request` (mock `IntersectionObserver` with no intersections).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (`StripItem<T>`: the `target` field's type; `ThumbnailStrip<T>` forwards it; existing callers infer `NavigationTarget`).
- [ ] **Step 4: App:** `stripItems` in Basic mode = `basicStripItems({ selection, enclosedFraction })`; `onSelect` → `dispatch(setBasicSelection(target))` (the debounce draws); the phone sheet's "Orbital & view" tab gets the strip as its first row (`variant="sheet"`, as Atoms); key column in Basic mode: `PhaseKey heading="Orbital tiles"` beside the surface's `PhaseKey` while the strip is shown and expanded (ruling T16-tilekey, same rule as `AtomKeys.orbitalTiles`). `src/App.test.tsx`: in Basic mode the strip is a `listbox` named `orbitals in view` with 9 options for n = 3; choosing `3p_x orbital` dispatches `setBasicSelection({n:3,l:1,ml:1})` and, after 150 ms, one calculation.
- [ ] **Step 5: Run**; whole suite, tsc, build, admin split.
- [ ] **Step 6 [visual]:** `--task 6g2-t8 --scenes basic-3dz2,basic-n4 --sizes desktop,phone`. Checklist: 9 tiles grouped `3s | 3p | 3d` with 11 px group labels (16 tiles for n = 4), selected tile ring + glow (dark) / ring only (light); key column shows "Orbital tiles" + ψ key; `webglCanvases` 1; `metrics.thumbs` (shoot.mjs reports tile fill — if it does not, count `.thumb-canvas[data-drawn="true"]` ≥ 9 at settle) — all 9 drawn within 10 s (R20d's budget).
- [ ] **Step 7: Commit** — `feat(orbitals): the strip shows every orbital of the current n, grouped by subshell (Phase 6G-2)` (rulings P4, P7).

---

### Task 9: Bonds — header tile, Plot | Data inspector, MoDiagram check **[visual]**

**Estimate:** 2 h. **Rulings:** P1, P19, P20. **Spec:** §9.3; owner ruling R23e stays as shipped.

**Files:**
- Create: `src/bonds_ui/BondsExplore.tsx` (header tile + the existing `BondsPanel` body), `src/bonds_ui/BondsInspector.tsx` (Plot | Data via `PlotDataTabs` from T7 or a plain `Inspector` with two tabs), `src/bonds_ui/bonds_explore.css`
- Modify: `src/components/BondsPanel.tsx` (remove the `frontier`, `caveats` and `bonds-captions` blocks, lines 191–199; export `bondsDataLines(bonds, data)` returning `{ frontier, caveats, captions }` for the inspector), `src/App.tsx` (Bonds slots; phone Plot tab stacks Data), `src/components/MoDiagram.tsx` + its CSS (step 5)
- Test: `tests/bonds_ui/bonds_explore.test.tsx`, `tests/bonds_ui/bonds_inspector.test.tsx`, the existing `BondsPanel` tests (`grep -rl "bonds-captions\|methods" tests/bonds src | head`) move their captions assertions to the inspector test with a why comment (P19)

**Header tile (`.bonds-tile`):** formula 28/600 (`systemFormula`), name, group line (`BONDS_SYSTEMS[i].group`), `bondOrderSelectText(id)`, and for `h2plus` a `Chip` "exact" (`success` colour, name "exact solution"). Below it the grouped select, R slider, energy, Show switch, MO section — `BondsPanel` as it is minus the three data blocks.

- [ ] **Step 1: Tests.** Explore: for N₂ the tile reads `N₂`, `Nitrogen`, `σ and π bonds (second-row homonuclear)`, `triple bond, order 3`; for H₂⁺ the `exact` chip; the select, slider and Show switch still render (existing names). Inspector: tab `Plot` holds `BondsCurvePlot` (role/aria as today); tab `Data` holds the frontier line, each caveat, and the `methods` list (`aria-label="methods"`) with the same strings `bondsCaptions(system, scan)` returns; nothing of these remains in the Explore panel (query the whole App render in `src/App.test.tsx`'s Bonds test: `methods` list is inside `.view-panel`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** and wire App (`exploreContent` Bonds → `BondsExplore`; inspector → `BondsInspector` with `top=inspectorDisplay`; phone Plot tab = Plot then Data stacked).
- [ ] **Step 4: Run**; whole suite, tsc, build, admin split.
- [ ] **Step 5: MoDiagram check (row 13).** `grep -n "stroke\|fill\|color" src/components/MoDiagram.tsx src/style.css | grep -i "mo-"` — if every stroke/fill resolves to a `--ql-*` token (`text-1` level lines, `accent-text` arrows, `text-3` leaders) record "already on tokens" in the checklist; else move the literal to the token in `style.css` and add the assertion to `tests/a11y/panel_contrast.test.ts` that `.mo-level` stroke is `text-1` and `.mo-arrow` is `accent-text` (names as the component uses them).
- [ ] **Step 6 [visual]:** `--task 6g2-t9 --scenes bonds-n2,bonds-co,bonds-h2plus,bonds-co-orbital --sizes desktop,tablet,phone`; `science_diff` against a pre-task shoot of the same scenes: identical (`R = 2.07 a₀ (1.098 Å)`, plot legends, the density key). Checklist: tile present; Data tab holds the methods list; no overlap at tablet width (R23e's fixed overlap stays fixed); MoDiagram colours per step 5.
- [ ] **Step 7: Commit** — `feat(bonds): a system tile heads Explore; frontier, caveats and methods move to the inspector's Data tab (Phase 6G-2)` (rulings P19, P20).

---

### Task 10: Thumbnail service — field and grid jobs; the Bonds strip **[visual]**

**Estimate:** 2.5 h. **Rulings:** P5, P7; R20d, DC12, T16-failtile. **Spec:** §9.3 Strip, §12 (one renderer; MOs at 40³; jobs pause while busy; cancelled on system change).

**Files:**
- Modify: `src/thumbs/ThumbnailService.ts` (`ThumbRequest` union, job kinds, `ThumbHost.createGridWorker`, `render(mesh, colouring)`), `src/thumbs/render_thumbnail.ts` (`render(meshData, appearance, opacity, extrasAllowed, colouring)`), `src/orbital_visualizer.ts` (`attachThumbnails`: `createGridWorker: createGridMeshWorker`, pass colouring), `src/thumbs/thumb_key.ts` (colouring enters the cache key via `contentKey`, which the item builders make unique per colouring)
- Create: `src/thumbs/bonds_strip_items.ts`
- Modify: `src/App.tsx` (Bonds strip; `onSelect` → `setBondsView(target)`), `src/shell/ThumbnailStrip.tsx` (nothing new beyond T8's generic)
- Test: `tests/thumbs/thumbnail_service.test.ts` (extend), `tests/thumbs/render_thumbnail.test.ts` (colourings), `tests/thumbs/bonds_strip_items.test.ts`, `src/App.test.tsx`

**Interfaces produced:**
```ts
// ThumbnailService.ts
export type ThumbColouring = 'phase' | 'density' | { kind: 'esp'; grid: ScalarGrid; limit: number };
export type ThumbRequest =
  | { kind: 'orbital'; contentKey: string; params: OrbitalParams }                       // today's (kind added; the old shape without `kind` still accepted = 'orbital')
  | { kind: 'field'; contentKey: string; field: FieldRenderRequest; colouring: ThumbColouring }   // one source; the worker message { type: 'calculateFields', request }
  | { kind: 'grid'; contentKey: string; grid: GridMeshRequest; colouring: ThumbColouring };
export interface ThumbHost { createWorker(): Worker; createGridWorker(): Worker; isBusy(): boolean; themeKey(): string; render(meshData: MeshData, colouring: ThumbColouring): Promise<ThumbImage>; }
// render_thumbnail.ts: 'density' colours every vertex densitySurfaceHex(theme) (science.ts, display → linear as the main view does, ruling DC2b); 'esp' uses espVertexColors(meshData.positions, grid, limit).colors verbatim; 'phase' is today's path.
// bonds_strip_items.ts
export type BondsStripItem = StripItem<BondsView>;
export function bondsStripItems(args: { bonds: BondsState; data: BondsData; h2plusR: number | null; enclosedFraction: number }): BondsStripItem[];
//   H₂⁺: two tiles 1σg, 1σu* (field requests from cachedH2PlusSource-equivalent `h2plusSource(R, state)` at resolution 40, colouring 'phase');
//   molecules: one 'density' tile first (field request from bondsFieldRequest(…{view:{kind:'density'}}) at resolution 40, colouring 'density', label "Total density", spoken "total electron density"),
//   then one tile per orbital of data.meta.orbitals in diagram order (label `${label}${SPIN_SUFFIX}`, spoken `${label} orbital`, group by σ/π symmetry label family? — no: group null; the diagram is the grouping), each an analytic gaussianMO field request (bondsFieldRequest with that view) at resolution 40;
//   returns [] while bondsFieldRequest would return null for the density view (basis not loaded for this R) — Review Focus 5.
```
The `contentKey` for a field tile is `` `bonds|${system}|${pointId or R}|${view key}|${fraction}|${colouring kind}` ``; for a grid tile T15 defines it.

- [ ] **Step 1: Service tests** (no WebGL; the fake host pattern already in `thumbnail_service.test.ts`): a `field` request posts `{ type: 'calculateFields', request }` to `createWorker()` and renders `meshes[0]` with its colouring; a `grid` request posts to `createGridWorker()` and renders the response mesh; an `orbital` request without `kind` still works (pixel path unchanged: the fake host's `render` receives `'phase'`); jobs never start while `isBusy()`; `cancelAll` on a system change drops a queued field job (Review Focus 5's second half); a failed worker calls `onFailed` (T16-failtile). `render_thumbnail.test.ts`: colouring `'density'` sets every colour triple to the linear form of `densitySurfaceHex('dark')`; `'esp'` copies `espVertexColors` output; `'phase'` unchanged (existing assertions).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the union, the two worker paths (the orbital worker's `FieldWorkerMessage` shape is in `orbital_visualizer.ts:1360–1440`; the grid worker's in `grid_mesh_request.ts`), and the colourings.
- [ ] **Step 4: Items tests** (`bonds_strip_items.test.ts`, fixtures from `tests/bonds`): N₂ with its basis loaded → `[Total density, 1σg, 1σu*, 2σg, 2σu*, 1πu, 1πu, 3σg]`-style order equal to `data.meta.orbitals` order, selected = the current view; H₂⁺ → two tiles; basis for another point → `[]` (**Review Focus 5**, named test); every field request's `resolution` is 40 and has exactly one source.
- [ ] **Step 5: Implement; wire App** (`stripItems` Bonds; `onSelect` → `dispatch(setBondsView(target))`; overlay variant on desktop, sheet row in the phone's Explore tab). `src/App.test.tsx`: Bonds strip is a `listbox` with the density tile first; choosing `2σu* orbital` dispatches `setBondsView({kind:'mo',…})`.
- [ ] **Step 6: Run**; whole suite, tsc, build, admin split.
- [ ] **Step 7 [visual]:** `--task 6g2-t10 --scenes bonds-n2,bonds-co-orbital,bonds-h2plus --sizes desktop,phone`. Checklist: density tile in the density colour, MO tiles in phase colours, selected tile matches the view; `webglCanvases` 1; all tiles drawn ≤ 10 s; the key column keeps the ρ key and gains "Orbital tiles" ψ key while the strip shows orbital tiles (T16-tilekey).
- [ ] **Step 8: Commit** — `feat(bonds): the strip shows total density and every molecular orbital, rendered through the one renderer (Phase 6G-2)` (ruling P5).

---

### Task 11: Build-time structure thumbnails — tool and the 25 WebPs

**Estimate:** 2 h. **Ruling:** P11. **Spec:** §12 item 2 (264 × 264, 2×, transparent, CPK ball-and-stick, `alt` "Ball-and-stick model of <name>"), §16.

**Files:**
- Create: `tools/thumbs/render_thumbs.mjs` (Node; starts its own Vite on 5411–5419, its own headless Chromium with `--gl metal`, visits `/thumbs.html?id=<id>` per molecule, screenshots the canvas element with `omitBackground: true`, writes WebP), `public/thumbs.html` (dev-only: served by the dev server because `public` is Vite's root, **never emitted** because it is not in `build.rollupOptions.input`; it loads `../src/thumbs/thumbs_page.ts` exactly as `public/index.html` loads `../src/main.tsx`) + `src/thumbs/thumbs_page.ts` (a `WebGLRenderer` with `alpha: true`, `buildBallAndStick(meta.atoms, detectBonds(meta.atoms))`, `THUMB_CAMERA_DIRECTION`, `SOLID_LIGHTS`, square 528 px canvas; reads `/molecules/v3/<id>/meta.json` through the dev server's proxy; sets `window.__thumbReady = true` after the first frame)
- Create: `public/molecule-thumbs/v3/<id>.webp` × 25 (from `index.json`'s `libraryEntries`)
- Create: `src/molecules/thumb_paths.ts` → `export const structureThumbUrl = (id: string) => `/molecule-thumbs/${MOLECULE_DATA_VERSION}/${id}.webp``; `export const structureThumbAlt = (name: string) => `Ball-and-stick model of ${name}``
- Test: `tests/molecules/thumb_paths.test.ts`; `tests/molecules/thumb_files.test.ts` (every `libraryEntries(index)` id from a committed copy of `index.json` — `tests/fixtures/molecules/index.json` if present, else fetch once in the tool and commit the list to the test as a literal — has a file in `public/molecule-thumbs/v3/`, each ≤ 20 KB, and the directory has no extra files)

- [ ] **Step 1: Path tests** — write, run (FAIL), implement `thumb_paths.ts`.
- [ ] **Step 2: Write the tool and page.** `vite.config.ts` is not changed: `public/thumbs.html` is served in dev because `public` is the root, and it is not built because only `index.html` and `admin.html` are rollup inputs. `thumb_files.test.ts` pins both facts: `vite.config.ts` read as text contains no `thumbs`, and `public/thumbs.html`'s only script is `../src/thumbs/thumbs_page.ts`. After this task's `npm run build`, `ls dist/thumbs.html` must fail (record it in the commit body). The tool waits for `window.__thumbReady`, then `page.locator('canvas').screenshot({ omitBackground: true, type: 'webp', quality: 90 })` and resizes to 264 × 264 with `sharp` if present, else writes the 528 px capture and notes the size (§12's 2× is 528 px anyway — ship 528 px files if `sharp` is not a dependency; do not add a dependency for this).
- [ ] **Step 3: Generate.** `node tools/thumbs/render_thumbs.mjs --port 5413 --gl metal` (foreground, timeout 600000). Expected output: one line per molecule `h2o 264x264 5.8 KB`, then `25 written`. Open three with the Read tool (water, benzene, glycine): transparent background, CPK colours, the whole molecule inside the frame at the canonical direction.
- [ ] **Step 4: Run** `npx jest tests/molecules/thumb_paths.test.ts tests/molecules/thumb_files.test.ts` — PASS. Whole suite, tsc, build, admin split.
- [ ] **Step 5: Commit** — `feat(molecules): build-time ball-and-stick thumbnails for the library, rendered by the app's own renderer (Phase 6G-2)` (ruling P11; list the sizes).

---

### Task 12: Molecules Explore — header, quick pick, picker popover, Properties card **[visual]**

**Estimate:** 2.5 h. **Rulings:** P1, P10; R22c, R23f, R23f-2 stay. **Spec:** §9.4 Build and Properties; concept Molecule Builder (left panel: Molecule select, quick tiles).

**Files:**
- Create: `src/molecule_ui/MoleculeHeader.tsx` (tile: name 16/600, formula, "Change ▾" button opening the picker popover, the `TierBadge` is **not** repeated here — it is in the title block, R22c), `src/molecule_ui/QuickPick.tsx` (five `<button>` tiles 72 × 72 image + label, `img alt = structureThumbAlt(name)`; fallback: the formula large), `src/molecule_ui/MoleculePropertiesCard.tsx`, `src/molecule_ui/molecule_explore.css`
- Modify: `src/components/MoleculeNav.tsx` (the inline picker becomes `MoleculePickerDialog variant="popover"` anchored to the header's button — add the variant to `MoleculePickerDialog` as `ElementPickerDialog` has; the `body` variant on phones keeps the inline list), `src/App.tsx` (Explore: header → quick pick → `MoleculeNav` surface switch + list → Selection → jobs → pinned footer; inspector `body` = `MoleculePropertiesCard`)
- Test: `tests/molecule_ui/molecule_header.test.tsx`, `quick_pick.test.tsx`, `properties_card.test.tsx`, `tests/App.molecules.test.tsx`

**Properties card rows (exact labels → values):** `Formula` → `formatFormula(meta.formula)`; `Point group` → `formatPointGroup(meta.symmetry.pointGroup)` + (labelNote as caption when present); `Electrons` → `meta.electronCount`; `Multiplicity` → `meta.multiplicity`; `Dipole` → `formatDipole(meta)` + ` — ${caveat}` when present (T7-O3); `HOMO–LUMO gap` → the same string `MoleculeOrbitalList` renders for the gap (read its builder's name from `MoleculeOrbitalList.tsx` and import it; move it to `orbital_display.ts` if it is local) + caption `GAP_CAVEAT`; `LVMO gap` likewise when the role exists; `Geometry` → `meta.geometrySource` + caption `validatedLine(meta)` (library) / `COMPUTED_LINE` (computed); `Data tier` → `tierLine(meta)`. Heading "Properties". Rows are a `<dl>`.

- [ ] **Step 1: Tests.** Header: name, formula, button `Change molecule` opens a popover `dialog` with the search box and category chips (existing `MoleculePicker` roles); choosing dispatches `selectMolecule`. Quick pick: with an index whose `first-examples` are water, ammonia, methane, carbon dioxide, ethanol → five buttons in index order named `Water (H₂O)` etc., each `img` with the alt and `src` `/molecule-thumbs/v3/h2o.webp`; a missing thumb (`onError`) shows the formula; the current molecule's tile is `aria-current="true"`; a category with fewer than five entries shows what it has. Properties: every row above against the water fixture (`tests/fixtures`), equality with the imported functions' output (never literals except the labels).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (CSS on tokens: tile `surface-2`, radius `md`, selected `selected-edge` ring; card rows `caption` labels, `body` values, tabular numerals).
- [ ] **Step 4: App wiring**; `tests/App.molecules.test.tsx`: the Explore order above (query order of headings `Selection`, the quick-pick group `Quick pick`, the surface switch); the inspector contains `Properties`; the pinned footer is still last and still Esc-closable (existing test). Phone: Explore tab = header (compact), quick pick row, then today's order.
- [ ] **Step 5: Run**; whole suite, tsc, build, admin split.
- [ ] **Step 6 [visual]:** `--task 6g2-t12 --scenes water,molecule-complex,water-orbitals --sizes desktop,tablet,phone`; composite beside `molecule-builder` (`node tools/design/composite.mjs` as Task 19 of 6G-1 used it). Checklist: tile, quick pick (5 WebPs rendered), Properties card in the inspector under Display; `science_diff` identical (`ρ = 3.46e-2 e/a₀³` on glycine, the Library line).
- [ ] **Step 7: Commit** — `feat(molecules): a molecule tile and quick pick head Explore; a Properties card in the inspector (Phase 6G-2)` (rulings P1, P10).

---

### Task 13: Representation — ball-and-stick / space filling / none; `struct=space`, `show=none` **[visual]**

**Estimate:** 2 h. **Rulings:** P8, P8b. **Spec:** §9.4 View (representation), URL keys; §2 (structure-only and space-filling are in scope); §3.5.

**Files:**
- Create: `src/molecules/vdw_radii.ts`
- Modify: `src/molecules/ball_and_stick.ts` (`buildSpaceFilling(atoms)`; `Representation` type), `src/store/moleculeSlice.ts` (`representation`; `setRepresentation`; `setShowStructure` alias; `surface.kind: 'none'`), `src/molecules/url_keys.ts` (encode/decode), `src/molecules/useMoleculeView.ts` (overlay by representation; `'none'` surface clears the mesh), `src/molecules/render_plan.ts` (`'none'` → clear), `src/components/MoleculeViewOptions.tsx` (segmented control `Structure: Ball and stick | Space filling | None`, names "ball-and-stick structure" etc.; the switch "Ball-and-stick" is replaced — tests that toggle it change with a why comment), `src/shell/view_title.ts` (subtitle for `show=none`: `Structure only · <geometry method>` — read how subtitles are built there), `src/App.tsx` (`moleculeSelectionSection` gates on `representation !== 'none'`; `moleculeCaptionZone` likewise)
- Test: `tests/molecules/vdw_radii.test.ts`, `tests/molecules/ball_and_stick.test.ts` (exists? else `tests/molecules/space_filling.test.ts`), `tests/molecules/url_keys.test.ts`, `tests/molecules/molecule_slice.test.ts`, `tests/App.molecules.test.tsx`

**`vdw_radii.ts` (complete):**
```ts
/** Van der Waals radii, Å. Bondi 1964 (J. Phys. Chem. 68, 441) where it lists the element; Mantina et al. 2009
 * (J. Phys. Chem. A 113, 5806) for Be, B, Al, Ca and Ge, which Bondi does not. Sc–Co have no value in either: absent, not guessed (ruling P8b). */
export const VDW_RADII_ANGSTROM: Readonly<Record<number, number>> = {
  1: 1.20, 2: 1.40, 3: 1.82, 4: 1.53, 5: 1.92, 6: 1.70, 7: 1.55, 8: 1.52, 9: 1.47, 10: 1.54,
  11: 2.27, 12: 1.73, 13: 1.84, 14: 2.10, 15: 1.80, 16: 1.80, 17: 1.75, 18: 1.88, 19: 2.75, 20: 2.31,
  28: 1.63, 29: 1.40, 30: 1.39, 31: 1.87, 32: 2.11, 33: 1.85, 34: 1.90, 35: 1.85, 36: 2.02,
};
export const VDW_SOURCE = 'Bondi 1964; Be, B, Al, Ca, Ge from Mantina et al. 2009';
/** The element symbols of `atoms` with no tabulated radius, in first-seen order; empty when space filling is available. */
export function missingVdwRadii(atoms: { Z: number }[]): string[];
export function spaceFillingUnavailableReason(atoms: { Z: number }[]): string | null;  // "no van der Waals radius tabulated for Fe (Bondi 1964 / Mantina 2009)"
```

- [ ] **Step 1: Tests.** Radii: H 1.20, C 1.70, O 1.52, N 1.55, Cl 1.75, Ge 2.11 (Mantina), `missingVdwRadii([{Z:26},{Z:6}])` = `['Fe']`, reason string exact; water → null. `buildSpaceFilling(waterAtoms)`: three spheres, scale = radius/BOHR_TO_ANGSTROM, CPK materials with `userData.Z` (R12's recolour still works), no sticks, `userData.moleculePart === 'atom'` with indices (picking). URL: `encode({representation:'space-filling'})` → `struct=space`; `'none'` → `struct=0`; ball-and-stick → no key; decode `space`/`0`/`1`/absent; `show=none` ↔ `{kind:'none'}`; **Review Focus 2** named test: `decode({ id:'h2o', struct:'banana', show:'mo:' })` → `{ id:'h2o' }` only. Slice: `setShowStructure(false)` → `'none'`, `true` → `'ball-and-stick'`; `setRepresentation('space-filling')`; `representation 'none'` clears `pick`. View title: a `{kind:'none'}` surface subtitle reads `Structure only · geometry: <meta.geometrySource>`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** `MoleculeViewOptions`: the segmented control (32 px, `KEEP_CASE`), disabled "Space filling" with `title` = the reason when unavailable; the surface switch in `MoleculeNav` gains a fourth option `None` (`show=none`) named "no surface".
- [ ] **Step 4: Run**; whole suite (expect `tests/App.molecules.test.tsx`'s Ball-and-stick switch assertions to be updated with why comments), tsc, build, admin split.
- [ ] **Step 5 [visual]:** add scenes `water-space: "#mode=molecule&id=h2o&struct=space"` and `water-structure: "#mode=molecule&id=h2o&show=none"`; `--task 6g2-t13 --scenes water-space,water-structure,water --sizes desktop,phone`. Checklist: space filling shows three overlapping vdW spheres and no sticks; structure-only shows no surface and the subtitle `Structure only…`; the share link in `metrics.url` carries `struct=space` / `show=none`; `webglCanvases` 1.
- [ ] **Step 6: Commit** — `feat(molecules): space-filling and structure-only views; struct=space and show=none in links (Phase 6G-2)` (rulings P8, P8b).

---

### Task 14: On-model bond lengths and angles **[visual]**

**Estimate:** 2.5 h. **Ruling:** P9. **Spec:** §9.4.1 (all of it), §3.3 (every drawn thing labelled — the labels *are* text), §13 (the overlay is `aria-hidden`; the Selection readout is the accessible form).

**Files:**
- Create: `src/molecules/bond_labels.ts` (pure geometry), `src/components/MoleculeLabels.tsx`, `src/components/molecule_labels.css`
- Modify: `src/orbital_visualizer.ts` (`context.afterFrameListeners: Set<() => void>`; the render loop calls each after `onAfterFrame`'s old place; `attachThumbnails` adds `service.tick` and removes it in `disposeThumbnails`), `src/components/OrbitalViewer.tsx` (renders `<MoleculeLabels contextRef={…} />` inside `#canvas-container` when the mode is molecule), `src/design/presentation.ts` (`moleculeLabels: boolean`, default `false`), `src/components/MoleculeViewOptions.tsx` (switch "Show bond lengths and angles", stored in `displayPref`)
- Test: `tests/molecules/bond_labels.test.ts`, `tests/molecules/molecule_labels.test.tsx`, `tests/visualizer_appearance.test.ts` or `tests/orbital_viewer.test.tsx` (listener set), `tests/design/presentation.test.ts`

**`bond_labels.ts` (complete core):**
```ts
export const LABEL_ATOM_LIMIT = 12;
export interface LengthLabel { kind: 'length'; bond: number; text: string; world: [number, number, number] }        // midpoint
export interface AngleLabel  { kind: 'angle'; atom: number; text: string; world: [number, number, number]; arc: [number, number, number][] }  // label point + 9 arc points
export type ModelLabel = LengthLabel | AngleLabel;
/** What to label: everything for ≤ LABEL_ATOM_LIMIT atoms; only the picked atom's angle / picked bond's length above it; [] when nothing applies. */
export function modelLabels(atoms: MoleculeAtom[], bonds: Bond[], pick: MoleculePick | null): ModelLabel[] {
  const all = atoms.length <= LABEL_ATOM_LIMIT;
  const out: ModelLabel[] = [];
  bonds.forEach((bond, index) => {
    if (!all && !(pick?.kind === 'bond' && pick.index === index)) return;
    const [p, q] = [atoms[bond.a].position, atoms[bond.b].position];
    out.push({ kind: 'length', bond: index, text: `${bond.lengthAngstrom.toFixed(3)} Å`, world: [(p[0]+q[0])/2, (p[1]+q[1])/2, (p[2]+q[2])/2] });
  });
  atoms.forEach((atom, index) => {
    if (!all && !(pick?.kind === 'atom' && pick.index === index)) return;
    const n = bonds.filter(b => b.a === index || b.b === index).map(b => (b.a === index ? b.b : b.a));
    if (n.length !== 2) return;                                   // §9.4.1: the angle at each atom with exactly two bonds
    const v = new THREE.Vector3(...atom.position);
    const u = new THREE.Vector3(...atoms[n[0]].position).sub(v).normalize();
    const w = new THREE.Vector3(...atoms[n[1]].position).sub(v).normalize();
    const degrees = THREE.MathUtils.radToDeg(u.angleTo(w));
    const r = 0.35 * Math.min(bonds.find(b => (b.a===index&&b.b===n[0])||(b.b===index&&b.a===n[0]))!.lengthAngstrom, bonds.find(b => (b.a===index&&b.b===n[1])||(b.b===index&&b.a===n[1]))!.lengthAngstrom) / BOHR_TO_ANGSTROM;
    const arc = Array.from({ length: 9 }, (_, i) => { const t = i / 8; const d = u.clone().lerp(w, t).normalize().multiplyScalar(r); return [v.x + d.x, v.y + d.y, v.z + d.z] as [number, number, number]; });
    const bis = u.clone().add(w).normalize().multiplyScalar(r * 1.6);
    out.push({ kind: 'angle', atom: index, text: `${degrees.toFixed(1)}°`, world: [v.x + bis.x, v.y + bis.y, v.z + bis.z], arc });
  });
  return out;
}
/** World → CSS px inside the canvas, or null behind the camera. */
export function projectToCanvas(camera: THREE.Camera, width: number, height: number, world: [number, number, number]): { x: number; y: number } | null;
```
`MoleculeLabels` reads `meta`, `pick`, `representation` and `displayPref.moleculeLabels`; when on and `representation !== 'none'`, it registers one listener that projects every label and writes `style.transform = translate(x, y)` on pre-rendered pill elements and the `d` of each arc `<path>` (no React re-render per frame: refs + direct DOM writes); hidden when `meta` changes until the next frame. Pills: `.model-label` 12/600 `text-1` on `color-mix(in srgb, var(--ql-color-surface-2) 85%, transparent)`, radius `sm`, `pointer-events: none`; arcs 1.5 px `selected-edge`, `fill: none`. The whole overlay is `aria-hidden="true"`. Above the limit with nothing picked, one caption `.model-label-hint` "Pick an atom or bond to label it" at the overlay's bottom-left (no inset change: `pointer-events:none`, absolute; R23f-3).

- [ ] **Step 1: Geometry tests.** Water (`tests/fixtures` meta): two length labels `0.958 Å`-class (`toFixed(3)` of the fixture's bonds; compare to `detectBonds` output) at bond midpoints, one angle at O with text `104.5°`-class (= `anglesAtAtom` degrees to 1 dp) and 9 arc points each at distance `r` from O; methane: 4 lengths, 0 angles (C has 4 bonds; H has 1); a 13-atom fixture with no pick → `[]`; with `pick={kind:'atom', index}` → that atom's angle only; `projectToCanvas` of a point on the camera axis → canvas centre; behind the camera → null.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `bond_labels.ts`.
- [ ] **Step 4: Overlay tests** (`molecule_labels.test.tsx`, fake context with a `PerspectiveCamera` and a 600 × 400 canvas): pref off → renders nothing; on → `.model-label` count = labels, all `aria-hidden`; a frame listener call moves them (transform changes after moving the camera); **Review Focus 3** named test: glycine-sized (> 12) fixture, nothing picked → only the hint caption; picked bond → one pill; `representation: 'none'` → nothing. Listener-set test: `attachThumbnails` adds exactly one listener; `disposeThumbnails` removes it; the loop calls each listener once per frame (extend the existing `onAfterFrame` test, if any: `grep -rn onAfterFrame tests`).
- [ ] **Step 5: Implement** the overlay, the listener set, the pref and the switch (`MoleculeViewOptions`: `FormControlLabel` "Show bond lengths and angles", `Switch`, writes `displayPref`).
- [ ] **Step 6: Run**; whole suite, tsc, build, admin split. Share-link invariance: in `tests/App.molecules.test.tsx` assert the link is byte-identical before and after toggling the switch.
- [ ] **Step 7 [visual]:** shoot with the pref on: `--task 6g2-t14 --scenes water,molecule-complex --sizes desktop --display '{"moleculeLabels":true}'` — add a `--display` argument to `shoot.mjs` beside `--render` (same mechanism, key `eov.display`). Checklist: water shows `0.958 Å` × 2 (or the fixture's values) and `104.5°` with its arc, beside the Cinematic concept crop (`original-concepts` `cinematic`); glycine (10 atoms, ≤ 12) shows all its labels without overlapping the key column; nothing moved in the panels (R23f-3: `metrics.insets` identical with the pref on and off).
- [ ] **Step 8: Commit** — `feat(molecules): bond lengths and angles drawn on the model from projected points (Phase 6G-2)` (ruling P9).

---

### Task 15: Molecules strip **[visual]**

**Estimate:** 2.5 h. **Rulings:** P6, P7, P5. **Spec:** §9.4 Strip (eight tiles; "Each tile sets `surface` / representation exactly as the View tab does"), §12.

**Files:**
- Create: `src/thumbs/molecule_strip_items.ts`, `src/thumbs/structure_glyph.ts` (Canvas 2D: `drawStructureGlyph(ctx, size, atoms, representation)` from `projectStructure(canonical, yaw = 0)` — convert `MoleculeAtom` (bohr) to `CanonicalAtom` (Å) first; circles in CPK with a 1 px `text-3` outline, sticks for ball-and-stick, vdW circles for space filling)
- Modify: `src/shell/ThumbnailStrip.tsx` (thumb kinds `'structure'` and `'icon'`), `src/thumbs/strip_items.ts` (`StripThumb` union grows), `src/App.tsx` (strip in Molecules mode; `onSelect`), `src/components/MoleculeNav.tsx` (an `focusOrbitalList()` ref for the "All orbitals" tile)
- Test: `tests/thumbs/molecule_strip_items.test.ts`, `tests/thumbs/structure_glyph.test.ts`, `tests/App.molecules.test.tsx`

**Interfaces produced:**
```ts
export type MoleculeStripTarget = { representation: Representation } | { surface: MoleculeSurface } | { openOrbitals: true };
export function moleculeStripItems(args: { meta: LibraryMoleculeMeta; surface: MoleculeSurface; representation: Representation; enclosedFraction: number; densityGrid: ScalarGrid | null; espGrid: ScalarGrid | null; espLimit: number }): StripItem<MoleculeStripTarget>[];
// order: Ball and stick (structure glyph) · Space filling (glyph; omitted when spaceFillingUnavailableReason ≠ null) · Electron density (grid job, 'density') · Electrostatic potential (grid job, colouring esp) · HOMO (field job, moleculeOrbitalSource(meta, homo.index) at MOLECULE thumbnail resolution 40, 'phase') · LUMO · LVMO (when the role exists) · All orbitals (icon).
// spoken names: "ball-and-stick structure", "space-filling structure", "electron density surface", "electrostatic potential on the density surface", "HOMO orbital", "LUMO orbital", "LVMO orbital", "all orbitals — open the list".
// selected: the tile whose target equals the current surface/representation (density/esp/mo index; the structure tiles are selected by representation only when surface.kind === 'none').
// density/ESP tiles are omitted (not glyph-faked) while densityGrid is null (not loaded yet): real or absent.
```
Grid jobs: `GridMeshRequest` built exactly as `useMoleculeView` builds the main view's density request for `enclosedFraction` (read `render_plan.ts` `planMoleculeRender` and reuse its request builder; the thumbnail request's `contentKey` = `` `mol|${meta.id}|density|${fraction}` `` / `…|esp|…`).

- [ ] **Step 1: Tests.** Items for water with grids loaded: 7 tiles in the order above (no LVMO unless the fixture has the role) with the right thumb kinds and request kinds; without grids: the two structure tiles, HOMO, LUMO, All orbitals only; a Fe-containing fixture: no Space filling tile; selected follows `surface`; targets as specified. Glyph: draws `atoms.length` circles (spy on `ctx.arc`) and `bonds × 2` lines for ball-and-stick, no lines for space filling.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** `ThumbnailStrip` `'structure'` tiles draw with `drawStructureGlyph` in an effect (like `'rings'`); `'icon'` tiles render an inline SVG (three circles) and the label.
- [ ] **Step 4: App:** `onSelect`: `{representation}` → `setRepresentation`; `{surface}` → `setSurface`; `{openOrbitals}` → `setSurface({kind:'mo', index: homo})` then `moleculeNavRef.current?.focusOrbitalList()`. `tests/App.molecules.test.tsx`: the strip is a `listbox` named `views of this molecule`; choosing `HOMO orbital` dispatches `setSurface({kind:'mo', index})`; `all orbitals — open the list` focuses the first row of the MO list.
- [ ] **Step 5: Run**; whole suite, tsc, build, admin split.
- [ ] **Step 6 [visual]:** `--task 6g2-t15 --scenes water,water-orbitals,molecule-complex --sizes desktop,phone`; composite beside `molecule-builder` (its bottom strip: Ball and stick, Space filling, Electrostatic potential, HOMO, LUMO, All orbitals). Checklist: tile order and labels; ESP tile coloured by the ESP ramp; one canvas; all tiles drawn ≤ 10 s; the key column shows the ψ "Orbital tiles" heading only while an orbital tile is visible and the surface is not an orbital (T16-tilekey's rule) — ESP/density tiles are keyed by the ESP bar / density key already on screen? No: when the main surface is density, the strip's HOMO/LUMO hues need the ψ key → show `PhaseKey heading="Orbital tiles"` whenever the strip is expanded in Molecules mode (same as T8).
- [ ] **Step 7: Commit** — `feat(molecules): a strip of the molecule's views — structure, density, potential and frontier orbitals (Phase 6G-2)` (ruling P6).

---

### Task 16: Jobs — the request workspace in the viewport cell **[visual]**

**Estimate:** 3 h. **Ruling:** P12 (R-requestspace). **Spec:** §9.4 Jobs tool; 6B's rulings pinned by `tests/jobs/request_panel.test.tsx` (quote invalidation on edit, approval before submit, session-ended handling, owner-only).

**Files:**
- Create: `src/components/RequestWorkspace.tsx`, `src/components/request_workspace.css`
- Modify: `src/store/jobsSlice.ts` (`request.previewAtoms: CanonicalAtom[] | null`; actions `previewResolved(atoms)`, `previewCleared()`; `requestOpened(false)`, `requestDraftChanged`, `sessionFailed`, sign-out and `setMode` away from molecule all clear it — reducers/extraReducers), `src/components/RequestPanel.tsx` (calls `onPreviewResolved(preview.atoms)` when a preview lands and `onPreviewCleared()` on `clear()`; new optional props; `showStructureSvg` prop default true, false in the workspace), `src/components/PreviewDetails.tsx` (`StructurePreview` behind `showStructureSvg`), `src/components/MoleculeJobsSection.tsx` (desktop: the entry `Button` "Request a new molecule" (`aria-expanded`) + `JobStatusPanel`; phone: today's accordion unchanged), `src/molecules/useMoleculeView.ts` (`previewAtoms` → overlay = ball-and-stick of `canonicalToBohr(previewAtoms)`, field mesh cleared, dipole off; cleanup restores), `src/shell/view_title.ts` (`Preview — <formula>` title while `previewAtoms`; subtitle "resolved structure, not yet computed"), `src/useViewInsets.ts` (`LEFT_ZONES = ['.request-workspace']`, measured into `insets.left` like `RIGHT_ZONES` into `right`), `src/App.tsx` (render the workspace in the viewport cell; Esc handling)
- Test: `tests/jobs/request_workspace.test.tsx` (new), `tests/jobs/jobs_slice.test.ts`, `tests/jobs/request_panel.test.tsx` (unchanged behaviour; add the two callback assertions), `tests/view_insets.test.ts` (left zone), `tests/molecules/use_molecule_view.test.ts` (exists? `ls tests/molecules`; else add to `tests/App.molecules.test.tsx`), `src/App.jobs.test.tsx`

**Workspace layout (`.request-workspace`, `role="region"`, `aria-label="Request a molecule"`):** header row with the title "Request a molecule" and a close `IconButton` (name "Close the request workspace"); body = `RequestPanel` (form, recipe radios with their detail lines, charge/multiplicity, the target caption, Preview button, `PreviewDetails` without the SVG, `SubmitArea` with `QuoteChooser` — P13's lines); footer caption = the spot/on-demand explanation already in `QuoteChooser`'s option cards (nothing new is written). Width `min(560px, 55%)` of the cell, full height, `surface-1`, radius `xl` on the right edge, scrolls inside; the canvas shows the preview structure to its right (the camera inset keeps it clear). Keyboard: Esc (not consumed inside) closes and focuses the entry button; the Tab order is entry button → workspace → toolbar.

- [ ] **Step 1: Slice tests.** `previewResolved(atoms)` sets `request.previewAtoms`; `requestDraftChanged`, `previewCleared`, `requestOpened(false)`, `sessionFailed`, the sign-out action and `setMode('atom')` each clear it (**Review Focus 4**'s store half).
- [ ] **Step 2: Workspace tests** (`request_workspace.test.tsx`, store + fake jobs API as `request_panel.test.tsx` does): not rendered for a non-owner or on a phone (`NARROW`); for the owner with `request.open` it renders the region with the form; after Preview resolves, `previewResolved` is dispatched with the atoms and no `svg[role=img]` is in the workspace; editing the text clears the preview and the quote (existing assertion, now via the workspace); Esc closes (`requestOpened(false)`) and focus lands on the `Request a new molecule` button; **Review Focus 4** named test: with the workspace open, `sessionFailed` → the session alert shows inside the workspace (today's R4 wording) and `previewAtoms` is null; sign-out → the region is gone; `setMode('bonds')` → gone, `previewAtoms` null.
- [ ] **Step 3: Run** — FAIL. **Step 4: Implement** slice, panel callbacks, workspace, insets (`LEFT_ZONES`; `tests/view_insets.test.ts`: a `.request-workspace` of width 500 at the cell's left gives `insets.left = 500`), `useMoleculeView` preview branch (test: with `previewAtoms` the overlay group has `isBallAndStick` children and no field mesh; clearing restores the molecule's overlay), view title, App wiring (toolbar stays; key column stays; the strip hides while the workspace is open — it would describe the molecule, not the preview; `moleculeCaptionZone` false while open).
- [ ] **Step 5: Run** `npx jest tests/jobs src/App.jobs.test.tsx tests/App.molecules.test.tsx tests/view_insets.test.ts` — PASS; whole suite, tsc, build, admin split.
- [ ] **Step 6 [visual]:** needs an owner session and a job server. Use 6G-1's throwaway-server mechanism (`tools/design/shoot.mjs` + `JOBS_OUT_ROOT`, the `--jobs` flag Task 19 of 6G-1 documented in `CHECKLIST.md` — if no flag exists, add `--owner-session` to `shoot.mjs` that injects the local dev session the existing `src/App.jobs.test.tsx` fixtures use against `tools/jobs` local server started by the tool on 8788; never 8787). Scenes: `water` with `request.open` → `--click "Request a new molecule"`, then type `caffeine`, Preview, settle. Sizes desktop, tablet. Checklist: workspace width ≤ 560; the canvas shows the resolved structure clear of it (`insets.left` ≈ workspace width); quote lines (T1) fit; Esc closes; no second canvas; `errors` empty.
- [ ] **Step 7: Commit** — `feat(jobs): requesting a molecule opens a workspace in the viewport with the resolved structure on the one canvas (Phase 6G-2)` (ruling P12).

---

### Task 17: Final live verification — 6G-2 composites and committed checklist **[visual]**

**Estimate:** 90 min. **Spec:** §14 (captures, composites, checklist), §16.

**Files:**
- Modify: `tools/design/scenes.json` (ensure `basic-3dz2`, `basic-n4`, `bonds-n2-sg: "#mode=bonds&system=n2&state=mo%3Arestricted%3A3%CF%83g%3A0"` — verify the state key's form against `bonds-co-orbital` and `src/bonds/bonds_url.ts`, `water-orbitals`, `water-esp: "#mode=molecule&id=h2o&show=esp"`, `benzene: "#mode=molecule&id=benzene"` (id per `index.json`), `c2h2-deep: "#mode=molecule&id=<acetylene id>&show=mo:<homo index>&struct=space"` — look both up with `curl -s https://d3rhfcclqjt4tf.cloudfront.net/molecules/v3/index.json`), `tools/design/concept_crops.json` (`cinematic` crop, header)
- Create: `docs/quantumlab/checks/6G-2/CHECKLIST.md` and the composites `docs/quantumlab/checks/6G-2/<screen>-<theme>-<size>.png`

- [ ] **Step 1:** `node tools/design/shoot.mjs --task 6g2-final --run final1 --gl metal --port 5411 --scenes basic-3dz2,basic-n4,bonds-n2,bonds-n2-sg,bonds-co,water,water-orbitals,water-esp,benzene,c2h2-deep,c-2pz-cut,c-whole --themes dark,light --sizes desktop,tablet,phone` (timeout 600000; split into two runs with `--run final1a/final1b` if one exceeds 10 min).
- [ ] **Step 2: Science diff against `main`:** `git worktree add --detach /tmp/6g2-main 72c8112 && (cd /tmp/6g2-main && npm ci --silent)`; `node tools/design/shoot.mjs --root /tmp/6g2-main --task 6g2-main --run final1 --port 5412 --scenes basic-3dz2,bonds-n2,bonds-co,water,benzene --themes dark --sizes desktop`; `node tools/design/science_diff.mjs /tmp/6g1-6g2-main-final1-metrics.json /tmp/6g1-6g2-final-final1-metrics.json` — Expected: identical for every string except those this plan's rulings changed (P14 valence lines and markers for d/f-block elements — none of these scenes; P15 adds measured/percent lines — not in these scenes; the Basic facts/plot titles are additions, not changes). `git worktree remove /tmp/6g2-main --force`.
- [ ] **Step 3: Composites:** `node tools/design/composite.mjs` for `water` + `molecule-builder`, `water-orbitals` + `cinematic`, `basic-3dz2` + `light-clean` (original-concepts Option 2, the chips row), `bonds-n2` + `deep-space`; write them into `docs/quantumlab/checks/6G-2/`.
- [ ] **Step 4: `CHECKLIST.md`** in the format of `docs/quantumlab/checks/6G-1/CHECKLIST.md` (header with commit, commands, "what changed since 6G-1", notes, results by scene × size with the five columns, composites list, science_diff result, summary). Every cell pass/fail with the measured numbers.
- [ ] **Step 5: Commit** — `docs(design): 6G-2 live visual check — composites and checklist (Phase 6G-2)` with the paths under `docs/quantumlab/checks/6G-2/`, `tools/design/scenes.json`, `tools/design/concept_crops.json`.

---

### Task 18: Owner review beside the concepts (controller presents)

**Estimate:** 30 min of the controller's time, plus the owner's. **Spec:** §14 "Manual (owner)". No code. The controller (not a subagent) does this in the owner's session:

- [ ] **Step 1:** Show, side by side with the concepts, `docs/quantumlab/checks/6G-2/water-dark-desktop.png` (beside Molecule Builder), `water-orbitals-dark-desktop.png` (beside Cinematic), `basic-3dz2-light-desktop.png` (beside Option 2's chips), `bonds-n2-dark-desktop.png`, the three phone shots, and the Atoms fixes: `c-2pz-cut` (cut face toward the camera), a Pa screenshot of the Configuration lines (`#mode=atom&Z=91&level=atom`, shot ad hoc with `--task 6g2-pa`) showing `Valence: 5f² 6d¹ 7s² · open 5f and 6d count as valence` and the IE line with its NIST value, `+25.3 %` and the limitation note.
- [ ] **Step 2:** Say plainly what differs from the spec on purpose and why (rulings P1, P6, P8b, P11, P12, P19): no tab rows in Bonds/Molecules Explore; Space filling disabled for Sc–Co molecules; thumbnails in the site bundle; the request workspace instead of the 88 px tool column; Bonds data in the inspector.
- [ ] **Step 3:** Ask for approval to deploy. A change list becomes follow-up tasks (same live check) before Task 19. Nothing deploys without the owner's go-ahead.
- [ ] **Step 4:** Offer the manual checks §14 assigns the owner (rotate/pan/zoom, touch on a phone, sign-in, one job request through the workspace, every export kind, both themes) on the deployed site after Task 19.

---

### Task 19: Deploy the site (controller-confirmed)

**Estimate:** 30 min (build + checks + deploy ~5–10 min, verification ~5 min). **Spec:** §16. **Ruling:** P22 — **only `infra/deploy.sh site`**; 6G-2 changes no compute, worker image or molecule data. Never `source` an infra script, never read `infra/owner.env`.

- [ ] **Step 1: Confirm with the controller.** Stop and ask: "Ready to run `infra/deploy.sh site` from `design/quantumlab-6g2` at `<git rev-parse --short HEAD>`; Task 18 approved on <date>. Deploy now?" Proceed only on a yes. (Branch/merge decisions are the owner's; this plan never pushes or merges.)
- [ ] **Step 2: Pre-flight (~4 min):** `git status --short` (expect empty); `npx jest 2>&1 | grep -E "^(Tests|Test Suites):"` (no failures); `aws configure list | grep region` (us-east-1).
- [ ] **Step 3: Deploy (one foreground command; 5–10 min; timeout 600000):** `AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 ./infra/deploy.sh site`. Expected tail: `admin split ok`, `Molecule data v3 is published; proceeding.`, `✅  ElectronOrbitalViewerStack`. If cut off by the timeout, re-run the same command (CloudFormation resumes), never another phase.
- [ ] **Step 4: Verify the live bundle:** the `curl` block of 6G-1's Task 21 step 4 (title `QuantumLab`, `data-theme-boot` 1, no `fonts.googleapis.com`, local and live `main-*.js` names equal, `eov-admin-dashboard` 0 in the main bundle, admin title), plus `curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$SITE/molecule-thumbs/v3/h2o.webp"` → `200 image/webp`. Then the headless-Chromium look from 6G-1's Task 21 (own browser, `--use-angle=swiftshader`), for `#mode=basic&n=3&l=2&ml=0`, `#mode=bonds&system=n2`, `#mode=molecule&id=h2o` in both themes: title, `canvases 1`, `errors 0`.
- [ ] **Step 5: Tell the owner which environment it is in:** "Production (CloudFront `d3rhfcclqjt4tf`) serves `design/quantumlab-6g2` @ `<sha>`; not merged." Record the deploy line in the ledger.
