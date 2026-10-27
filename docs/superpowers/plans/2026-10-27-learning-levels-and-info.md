# Learning Levels and On-Demand Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four learning levels (Basics · Explore · Advanced · Research) that decide which controls and how much detail each reader sees, and move every explanation out of the panels into one always-open Info section at the top of the right panel, with (i) buttons beside terms.

**Architecture:** A level preference (localStorage, like the theme) plus a visit-only raise from links feeds one `useLevel()` hook; a single gate table (`CONTROL_LEVEL`) decides which controls render. Each mode gets a pure builder `<mode>Info(state, level, topic) → InfoContent` that owns every sentence the mode used to print in its panels; `<InfoPanel>` renders it above the inspector accordion (docked, drawer and phone tab). Panels keep controls and short labels only.

**Tech Stack:** React 19, MUI 7, Redux Toolkit, TypeScript, Jest + Testing Library, Vite; Playwright for live checks (tools/design/shoot.mjs).

**Spec:** `.impeccable/surfaces/public-index-html.md` (confirmed decisions, level table, direction contract). Also read `PRODUCT.md`, `DESIGN.md`, `.impeccable/critique/2026-10-27T11-47-4*Z__src-*-ui.md`.

## Global Constraints

- Level names and order, verbatim: **Basics · Explore · Advanced · Research**; first visit **Explore**; personal preference key `eov.level`.
- Link key is **`lvl`** (values `basics|explore|advanced|research`). `level` is already taken (Atoms drill level, Orbitals field level) — never reuse it.
- Links keep the recipient's own level; only the Share "Opens at" choice writes `lvl`. A `lvl` or a view that needs a higher level raises the level **for that visit only** and says so; it never writes `eov.level`.
- Controls above the level are **hidden, not greyed**; one quiet line says where they appear, e.g. "Charge and relativity appear at Advanced".
- Info: always open at the top of the right panel; explains the current selection (name, short plain explanation, key facts at the level); (i) beside a term switches the topic; a new selection returns to it; "How this was computed ›" holds method, references, validity — folded below Research, open at Research; compact, scrolls inside itself.
- Text bands: **plain** (Basics, Explore) · **technical** (Advanced) · **full** (Research). Each explanation is written once per band.
- Typography as text moves: real subscripts (3d<sub>z²</sub>, not `3d_z²`), U+2212 minus, units on every value, ×10ⁿ not `e-2`, typeset point groups (C₂ᵥ).
- Phone: a one-line caption under the header naming what is drawn, in every mode; sheet tabs **Explore · Info · View · Plot** (Molecules: Explore · Info · View).
- Unchanged: science colours, Glow, Atoms colours, the science text itself (it moves, its words don't, except the typography rules above), every existing link meaning.
- DESIGN.md rules apply (one blue voice, meaning-only status, tabular figures, phone 14 px body, no new colour literals).

## Review Focus

1. **A shared link to a higher-level view** (Orbitals field `combo=field`, Atoms charge/excite/non-default `rel`, `frac` ≠ 90, an Export-only path) opens at the needed level for that visit, shows the notice, and a reload of the same tab without `lvl` still respects the stored preference. → Task 1 tests `requiredLevel` + `visitLevel`; Task 2 App test.
2. **Lowering the level never changes what is drawn.** With Fe²⁺ (Advanced) on screen, switching to Explore keeps Fe²⁺ drawn and shows "Showing Fe²⁺ — charge controls appear at Advanced". → Task 2 App test.
3. **Info topic lifecycle:** (i) switches the topic; choosing a new selection returns Info to the selection; keyboard Enter/Space on (i); Info's heading is in an `aria-live="polite"` region so screen readers hear the change. → Task 4 tests.
4. **Long Info content never pushes the plot away:** at 1440×900 with Research level and Bonds N₂ (longest captions), Info scrolls inside itself and the Plot and data header stays on screen. → Task 4 CSS + Task 9 live metric.
5. **Phone parity:** the Info tab shows the same content as the desktop Info for the same state and level; the header caption names what is drawn during loading too. → Task 4 (tab) and Task 8 (caption) tests.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/levels/levels.ts` (new) | `LearningLevel`, `LEVELS`, `levelRank`, `atLeast`, `CONTROL_LEVEL` gate table, `levelPointer` copy |
| `src/levels/level_pref.ts` (new) | `levelPref` (`eov.level`) + visit override (`visitLevel`, `raiseForVisit`, `clearVisit`) |
| `src/levels/required_level.ts` (new) | `requiredLevel(state)`: the lowest level that can show the current view |
| `src/levels/useLevel.ts` (new) | `useLevel()` → `{ level, stored, raised, setLevel }` |
| `src/levels/LevelControl.tsx` (new) | top-bar segmented control (desktop/tablet) and menu items (phone) |
| `src/format/sci.ts` (new) | `formatSci`, `formatPointGroupTyped`, `OrbitalLabel` (subscript rendering) |
| `src/info/info_types.ts` (new) | `InfoContent`, `InfoFact`, `InfoTopicId` |
| `src/info/glossary.ts` (new) | per-term entries in three bands |
| `src/info/InfoPanel.tsx`, `src/info/InfoButton.tsx`, `src/info/info.css` (new) | rendering, (i) buttons, topic state |
| `src/info/{basic,atom,bonds,molecule}_info.ts` (new) | each mode's pure Info builder — owns the mode's former captions |
| `src/shell/Inspector.tsx` | new `info?: ReactNode` slot above the accordion (docked, drawer, stacked) |
| `src/shell/TopBar.tsx`, `PhoneTopBar.tsx`, `AvatarMenu.tsx` | level control placement |
| `src/components/ShareExportBar.tsx`, `src/App.tsx` (`handleShare` ~344) | "Opens at" |
| `src/main.tsx` (~43), `src/useUrlStateSync.ts` (~34) | read `lvl` |
| `src/App.tsx` | wiring: level gates per control, Info per mode, phone tabs, phone caption |
| `tools/design/shoot.mjs`, `tools/design/science_diff.mjs` | `--level`; science text read from Info |

---

### Task 1: Level model, preference, visit raise and the `lvl` link key

**Files:**
- Create: `src/levels/levels.ts`, `src/levels/level_pref.ts`, `src/levels/required_level.ts`
- Modify: `src/main.tsx:43`, `src/useUrlStateSync.ts:34-37`
- Test: `tests/levels/levels.test.ts`, `tests/levels/level_pref.test.ts`, `tests/levels/required_level.test.ts`

**Interfaces:**
- Produces:
  - `type LearningLevel = 'basics'|'explore'|'advanced'|'research'`; `LEVELS: readonly LearningLevel[]` (that order); `LEVEL_LABEL: Record<LearningLevel,string>` = `Basics|Explore|Advanced|Research`.
  - `levelRank(l): 0|1|2|3`; `atLeast(level, min): boolean`.
  - `type ControlId` = `'plot'|'structure'|'bondLabels'|'dipole'|'orbitalEnergies'|'properties'|'axes'|'charge'|'excite'|'relativity'|'combinations'|'enclosed'|'allOrbitals'|'exports'|'advancedAppearance'|'surfaceStyle'|'requestWorkspace'`; `CONTROL_LEVEL: Record<ControlId, LearningLevel>` per the spec table (explore: plot, structure, bondLabels, dipole, orbitalEnergies, properties, axes; advanced: charge, excite, relativity, combinations, enclosed, allOrbitals, exports, advancedAppearance, surfaceStyle; research: requestWorkspace). Picking, drill-down, the strip, opacity, cut away and Share are ungated.
  - `levelPointer(ids: ControlId[], level): string | null` — e.g. `"Charge and relativity appear at Advanced"`; null when nothing is hidden.
  - `levelPref` (`createPref('eov.level', …)`, decode unknown → `'explore'`, encode `'explore'` → null).
  - `visitLevel(): LearningLevel|null`; `raiseForVisit(l)`; `clearVisit()`; `subscribeVisit(fn)` — in-memory only.
  - `requiredLevel(state: RootState): LearningLevel` — advanced when: Orbitals `combo` set; Atoms charge ≠ 0, excited, or `rel` ≠ the element's default; `frac` ≠ 90 %; explore when: Molecules `struct` ≠ ball-and-stick or labels on; otherwise basics.
  - `readLevelParam(hash: string): LearningLevel|null`.
- Consumes: `createPref` (`src/design/local_pref.ts:29`), `RootState`.

- [ ] **Step 1: Write the failing tests**
  - `levels.test.ts`: `LEVELS` order; `atLeast('advanced','explore') === true`; `CONTROL_LEVEL.charge === 'advanced'`; `levelPointer(['charge','relativity'],'explore') === 'Charge and relativity appear at Advanced'`; `levelPointer(['plot'],'research') === null`.
  - `level_pref.test.ts`: default `'explore'`; stores `'basics'` under `eov.level`; garbage decodes to `'explore'`; `raiseForVisit('advanced')` leaves `localStorage['eov.level']` unchanged.
  - `required_level.test.ts`: `#mode=basic&combo=field…` → `'advanced'`; `#mode=atom&Z=26&charge=2` → `'advanced'`; `#mode=molecule&id=h2o&struct=space` → `'explore'`; `#mode=atom&Z=6` → `'basics'` (build states through `applyStateTo` into a test store).
  - `readLevelParam('#mode=atom&lvl=basics') === 'basics'`; `readLevelParam('#mode=atom&level=shell') === null`.
- [ ] **Step 2: Run** `npx jest tests/levels` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the three modules. `main.tsx`: before `applyState` at line 43, `raiseForVisit(max(readLevelParam(hash), requiredLevel-after-apply))` — apply state first, then compute `requiredLevel(store.getState())`, then raise when above the stored pref. `useUrlStateSync` hashchange: same, after `applyStateTo`.
- [ ] **Step 4: Run** `npx jest tests/levels tests/url_state.test.ts tests/use_url_state_sync.test.tsx` — Expected: PASS (existing link strings byte-identical: `lvl` is never written by `encodeStateOf`).
- [ ] **Step 5: Commit** `feat(levels): the level model, preference, visit raise and the lvl link key`

### Task 2: Level control, gating and the visit notice

**Files:**
- Create: `src/levels/useLevel.ts`, `src/levels/LevelControl.tsx`
- Modify: `src/shell/TopBar.tsx:116-117` (new `levelControl` slot between tabs and search), `src/shell/top_bar.css` (search width at 1100–1290 px), `src/shell/PhoneTopBar.tsx` + `src/App.tsx:1852-1857` (phone: level items in the avatar menu `extra`), `src/App.tsx` (gate every `ControlId` render site listed in the Interfaces, pointer lines, notice), `src/components/ShareExportBar.tsx:103-109,191-206` + `src/App.tsx:344-347` ("Opens at"), `src/shell/HelpDialog.tsx` (a "Learning levels" section)
- Test: `tests/levels/level_control.test.tsx`, `src/App.test.tsx` (new `describe('learning levels')`), `tests/share_export_bar.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `useLevel(): { level: LearningLevel; stored: LearningLevel; raised: boolean; setLevel(l: LearningLevel): void }` (`level` = max(stored, visit)); `setLevel` writes `levelPref` and clears the visit raise. `<LevelControl variant="segmented"|"menu" />`. `ShareExportBar` prop `onShare(opensAt?: LearningLevel): Promise<ShareOutcome>`.
- Gate sites (render only when `atLeast(level, CONTROL_LEVEL[id])`): Plot section in AtomInspector/BasicInspector/BondsInspector; MoleculeViewOptions structure (53–75), labels (77–80), dipole (81); orbital energies (SubshellPanel diagram + OrbitalEnergyList, chip energy text 249–273); Molecules Properties section (App 1663); AxesSwitch; SpeciesControls charge (222–232) and excite (234–271); RelativityControl (Controls 313–343); CombinationControls (BasicExplore 133); enclosed select (Controls 466–501); Molecules "all orbitals" (orbital list shows HOMO−3…LUMO+3 below Advanced with a "Show all orbitals at Advanced" pointer; Bonds MO diagrams stay complete at every level — they are the science, not an option); Export menu + Snapshot (ShareExportBar 92–152); AdvancedAppearance; surface-style toggle (Controls 544); MoleculeJobsSection/RequestWorkspace (owner and Research).

- [ ] **Step 1: Write the failing tests**
  - `level_control.test.tsx`: renders four radios named `Basics`, `Explore`, `Advanced`, `Research` in a group named "Learning level"; arrow keys move; choosing `Advanced` stores `advanced`.
  - App `learning levels`: at Explore, Atoms shows no "Charge" control and shows "Charge and relativity appear at Advanced"; switching to Advanced shows them; with `#mode=atom&Z=26&charge=2` and stored Explore, the notice "Opened at Advanced for this link — your level stays Explore." appears with a "Keep Advanced" button, and Fe²⁺ is drawn (title contains "Fe²⁺"); then choosing Explore keeps the title and shows "Showing Fe²⁺ — charge controls appear at Advanced" (Review Focus 1, 2).
  - Share: the Share button opens a menu with "Copy link" and "Opens at" (radios Recipient's level, Basics, Explore, Advanced, Research); "Opens at Basics" copies a URL ending `&lvl=basics`; "Copy link" adds no `lvl`.
  - Existing tests that toggle hidden controls set `localStorage['eov.level']='research'` in their `beforeEach`, each with a one-line why comment.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** The notice is a dismissible MUI `Alert` (severity info) under the top bar; "Keep <level>" calls `setLevel`. Help gets a short "Learning levels" paragraph naming the four levels and what Research adds.
- [ ] **Step 4: Run** whole `npx jest`, `npx tsc --noEmit -p tsconfig.json` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(levels): a level switch in the top bar; controls appear by level; links can open at a level`

### Task 3: Typography helpers

**Files:**
- Create: `src/format/sci.ts`, `src/format/OrbitalLabel.tsx`
- Test: `tests/format/sci.test.ts`, `tests/format/orbital_label.test.tsx`

**Interfaces:**
- Produces: `formatSci(x: number, digits = 3): string` (`0.0266 → "2.66 × 10⁻²"`, `5.52 → "5.52"`, negative with U+2212); `minus(s: string): string` (hyphen-minus before a digit → U+2212); `typedPointGroup(pg: string): string` (`C2v → C₂ᵥ`, `D6h → D₆ₕ`, `Dooh → D∞h`, `Cs → Cₛ`); `orbitalParts(n,l,ml): { base: string; sub: string | null }`; `<OrbitalLabel n l ml />` renders `{base}<sub>{sub}</sub>` with `aria-label` = today's `orbitalName` text without the underscore (e.g. `"3dz²"`).
- Consumes: `orbitalName` (`src/orbital_names.ts:34-45`), `formatPointGroup` (`src/molecules/orbital_display.ts:29-34`).

- [ ] **Step 1: Failing tests** with the exact values above, plus `orbitalParts(3,2,0) → {base:'3d', sub:'z²'}`, `orbitalParts(2,1,1) → {base:'2p', sub:'x'}`, `orbitalParts(7,4,2).sub === null` (beyond f keeps the mₗ form).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(format): scientific notation, true minus, typed point groups and orbital subscripts`

### Task 4: The Info section and (i) buttons

**Files:**
- Create: `src/info/info_types.ts`, `src/info/glossary.ts`, `src/info/InfoPanel.tsx`, `src/info/InfoButton.tsx`, `src/info/info.css`, `src/info/useInfoTopic.ts`
- Modify: `src/shell/Inspector.tsx` (prop `info?: React.ReactNode`, rendered before the accordion at docked 188, drawer 183, stacked 130), `src/shell/inspector.css` (Info `flex: none; max-height: 45%; overflow: auto`), `src/App.tsx` (phone tabs: insert Info second; split Orbitals "Orbital & view" into Explore and View)
- Test: `tests/info/info_panel.test.tsx`, `tests/info/glossary.test.ts`, `tests/shell/inspector.test.tsx`, `src/App.test.tsx:1892`, `tests/App.molecules.test.tsx:168-169`

**Interfaces:**
- Consumes: Task 2 `useLevel`, Task 3 helpers.
- Produces:
  - `type InfoTopicId = 'shell'|'subshell'|'orbital'|'enclosed'|'node'|'phase'|'density'|'esp'|'homoLumo'|'kohnSham'|'relativity'|'ionisation'|'bondOrder'|'potentialCurve'|'moDiagram'|'pointGroup'|'dipole'|'tier'`.
  - `interface InfoFact { label: string; value: React.ReactNode; min?: LearningLevel }`.
  - `interface InfoContent { title: React.ReactNode; plain: React.ReactNode; technical?: React.ReactNode; facts?: InfoFact[]; computed?: React.ReactNode }`.
  - `glossary: Record<InfoTopicId, { title: string; plain: string; technical: string; full?: string }>`.
  - `useInfoTopic(selectionKey: string): { topic: InfoTopicId|null; setTopic(t): void }` — resets to null when `selectionKey` changes.
  - `<InfoPanel content={InfoContent} topic={InfoTopicId|null} onClearTopic level />` — shows `plain` at Basics/Explore, `plain`+`technical` at Advanced, all at Research; facts filtered by `min`; `computed` in a disclosure "How this was computed" folded below Research, open at Research; heading in `aria-live="polite"`; when a topic is set, shows the glossary entry and a "Back to <selection>" button.
  - `<InfoButton topic label />` — 20×20 visual, 44×44 hit area, `aria-label="About <label>"`, accent-text colour, sets the topic and moves focus to Info's heading.
- [ ] **Step 1: Failing tests**
  - `info_panel.test.tsx`: at `basics` only `plain` renders; at `advanced` `technical` renders; at `research` "How this was computed" is expanded; facts with `min:'advanced'` hidden at `explore`; (i) click shows the glossary title and "Back to Carbon — 2p" restores; a new `selectionKey` resets the topic (Review Focus 3).
  - `glossary.test.ts`: every `InfoTopicId` has non-empty `plain` and `technical`; no entry contains `_` or a hyphen-minus before a digit.
  - Inspector: `info` renders above the accordion in docked, drawer and stacked variants and is not one of the accordion toggles.
  - Update `App.test.tsx:1892` and `App.molecules.test.tsx:168-169` so the accordion-toggle list is unchanged and an `Info` heading exists separately (why comment: Info is always open, not an accordion section).
  - Phone tabs: `['Explore','Info','View','Plot']` in Atoms, Bonds, Orbitals; `['Explore','Info','View']` in Molecules.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with the glossary texts written in the three bands (science reviewer checks wording in review). **Step 4: Run** whole jest + tsc — PASS.
- [ ] **Step 5: Commit** `feat(info): an always-open Info section, (i) buttons and a glossary in three bands`

### Task 5: Orbitals — Info builder, captions out, typography

**Files:**
- Create: `src/info/basic_info.ts`
- Modify: `src/basic_ui/BasicExplore.tsx:16-17,84-86` (remove `.basic-tile-caption`; `BASIC_ORBITALS_ABOUT` moves to the builder), `src/components/CombinationControls.tsx` (captions 18–25, 88–93, 164–172, 205 → Info; readouts stay as short labelled values), `src/components/Controls.tsx:483-499,601-607` (helpers → Info; keep the select/toggle labels), `src/basic_ui/BasicInspector.tsx` (pass `info`), chips and strip labels use `<OrbitalLabel>`; (i) beside "Shell n", "Subshell l", "Orbital mₗ" row labels (new visible labels per critique) and "Enclosed"
- Test: `tests/info/basic_info.test.ts`, `tests/basic_ui/basic_explore.test.tsx:24-31`, `src/App.test.tsx:283,1754`

**Interfaces:** Consumes Tasks 2, 3, 4. Produces `basicInfo(state: RootState, level: LearningLevel): InfoContent` — title `Hydrogen — <OrbitalLabel>`; plain: what the shape is and why (nodes count in words); facts: n, l, mₗ, nodes, E = −1/(2n²) Ha with eV beside it (`min:'explore'`), iso value `formatSci` with unit a₀⁻³ (`min:'advanced'`); computed: "exact one-electron solution, Z = 1" — and for `combo=field` the perturbation-theory method and validity (the critique's "exact" contradiction is fixed here: the field subtitle in `view_title.ts:61` becomes "1s + first-order Stark, Dalgarno–Lewis").

- [ ] **Step 1: Failing tests:** `basicInfo` for 3d<sub>z²</sub> at basics has no "Ha"; at explore has `−0.0556 Ha` (U+2212) and `−1.51 eV`; for `combo=field` computed text contains "first-order" and never "exact one-electron"; the Explore panel contains no paragraph text (query `.basic-tile-caption` absent; row labels "Shell n", "Subshell l", "Orbital mₗ" present).
- [ ] **Steps 2–4:** run FAIL → implement → whole jest + tsc PASS (update moved-text tests with why comments).
- [ ] **Step 5: Commit** `feat(orbitals): Info owns the explanations; labelled rows; orbital names with subscripts`

### Task 6: Atoms — Info builder, captions out, typography

**Files:**
- Create: `src/info/atom_info.ts`
- Modify: `src/components/LevelNav.tsx:401-413,450-462,474-505,555-565` (valence note, shell hint, method, About → Info; keep configuration line ★ and chips), `src/components/SubshellPanel.tsx:203-207,285-291,336-338` (notes → Info; chip energy text gated `orbitalEnergies`), `src/components/SpeciesControls.tsx:96-111,303-330` (method tooltip, limitation, compare line → Info; the IE value line stays at Advanced as a short labelled value), `src/components/RadialPlot.tsx:301,306-308` + `src/shell/KeyColumn.tsx:41` (the duplicated cut-face caption → Info once), `src/components/Controls.tsx:180-187,221-285` (relativity help/readout → Info), `src/atom/plot_tabs.ts:28-60` captions → Info, `src/atom_ui/AtomInspector.tsx` (pass `info`), `<OrbitalLabel>` in chips, strip, breadcrumb, Data card; (i) beside Shell, Subshell, Relativity, Ionisation energy
- Test: `tests/info/atom_info.test.ts` and the moved-text tests listed in the map (App.test 2153–2231, 2289–2293; level_nav_about; level_nav 350/375; subshell_panel 290–363; species_controls 271–342)

**Interfaces:** Consumes Tasks 2, 3, 4. Produces `atomInfo(state: RootState, level: LearningLevel): InfoContent` — per drill level (atom/shell/subshell/orbital); facts: configuration, valence (plain words), orbital energy (`min:'explore'`, eV first then Ha), IE vs NIST with signed % (`min:'advanced'`), relativity default (`min:'advanced'`); computed: `methodStatement`, `aboutRelativitySentence`, `relativisticEnergiesSentence`, `ieLimitationNote`, `deltaScfMethod`. The heavy-atom default note "Scalar relativistic is the default for this element" appears in Info whenever a link opened without `rel` (critique researcher red flag).

- [ ] **Step 1: Failing tests:** `atomInfo` for Pa at research contains the full About sentences and "+25.2 %"; at basics contains none of "LDA", "ΔSCF", "Ha"; the Explore panel has no `.level-nav-about`, `.level-nav-shell-hint`, `.subshell-isolate-hint`; the cut-face caption appears exactly once on screen (in Info).
- [ ] **Steps 2–4:** FAIL → implement → whole jest + tsc PASS.
- [ ] **Step 5: Commit** `feat(atoms): Info owns the explanations; one cut-face caption; subscripted names`

### Task 7: Bonds and Molecules — Info builders, captions out

**Files:**
- Create: `src/info/bonds_info.ts`, `src/info/molecule_info.ts`
- Modify (Bonds): `src/components/BondsPanel.tsx:94-98,199-214` (footer, density label, legend sentence → Info; heading stays short "Molecular orbitals"), `src/components/MoDiagram.tsx:96-97` (notes → Info), `src/bonds_ui/BondsInspector.tsx:53-60` (Data captions → Info computed; Data keeps frontier values), `src/bonds/curve.ts:55-78,114` + `PotentialCurvePlot.tsx:196,201` (plot captions → Info; the plot keeps axis labels and the R_e marker label), `src/bonds/captions.ts` (unchanged builders, now consumed by the Info builder)
- Modify (Molecules): `src/components/MoleculeNav.tsx:175-177`, `src/components/MoleculeOrbitalList.tsx:92-96,162-181` (caption wall → Info; the inside-ball note stays inline because it carries an action), `src/components/MoleculeViewOptions.tsx:48-50,67-74,82-89`, `src/components/MoleculeReadout.tsx:26,30`, `src/molecule_ui/MoleculePropertiesCard.tsx:16-31,84` (captions → Info; rows keep values with `typedPointGroup`), `src/components/EspLegend.tsx:46-48` (sentences → Info; legend ends gain words "electron-rich" / "electron-poor"), `src/components/ProvenancePanel.tsx` + `MoleculeProvenanceFooter.tsx` (the panel becomes Info's `computed` content; the pinned footer is removed), `src/App.tsx:1372,1377,2066-2069` (status lines stay; hover caption stays on the canvas)
- Test: `tests/info/bonds_info.test.ts`, `tests/info/molecule_info.test.ts`, moved-text tests (bonds_panel 198–224, bonds_inspector 43, molecule_nav 58–91, properties_card 62–128, provenance_panel, App.molecules 753–785, App.jobs 102/139/245/286)

**Interfaces:** Consumes Tasks 2, 3, 4. Produces `bondsInfo(state, data, level): InfoContent` (facts: R in a₀ and Å, E in the curve's units E − E(atoms) eV `min:'explore'` with the absolute Ha `min:'research'`, bond order; computed: `bondsCaptions`, `frontierText`, `orbitalCaveats`); `moleculeInfo(state, meta, level): InfoContent` (title from `moleculeTitle`; facts: formula, typed point group, electrons, dipole computed vs experiment, gap `min:'explore'`; computed: the former ProvenancePanel content — method, dispersion, structure checks, references, files; the Kohn–Sham caveat stated **once**).

- [ ] **Step 1: Failing tests:** on the water desktop view the geometry source text appears exactly once on screen and the Kohn–Sham caveat at most once (Review: critique P1 repetition); Bonds N₂ at basics shows no "CCSD(T)" and no "T1 diagnostic" outside the folded "How this was computed"; ESP legend ends read "electron-rich" and "electron-poor"; `moleculeInfo` at research has "How this was computed" open with the references list.
- [ ] **Steps 2–4:** FAIL → implement → whole jest + tsc PASS.
- [ ] **Step 5: Commit** `feat(bonds,molecules): Info owns the explanations; provenance stated once`

### Task 8: Phone caption under the header

**Files:**
- Modify: `src/App.tsx:1893-1925` (`phoneChrome`), `src/style.css` (`.phone-caption`)
- Test: `src/App.test.tsx` (`describe('phone layout')`)

**Interfaces:** Consumes `viewTitleText`/`viewSubtitle` (`App.tsx:513`). Produces one `<p class="phone-caption" aria-live="polite">` under the phone header in every mode: `<title> · <short subtitle>` (e.g. "Carbon 2p<sub>z</sub> · 90 % enclosed", "CO 5σ · R = 2.13 a₀", "Water · electron density"); the Bonds header span (1916–1919) folds into it so the drawn orbital is named (critique: header said CO while 5σ was drawn).

- [ ] **Step 1: Failing test:** at 390 px each mode's hash renders `.phone-caption` with the expected text, including during loading (caption shows the requested view with "loading…").
- [ ] **Steps 2–4:** FAIL → implement → whole jest + tsc PASS.
- [ ] **Step 5: Commit** `feat(phone): a caption under the header names what is drawn, in every mode`

### Task 9: Live verification, science text check and finish

**Files:**
- Modify: `tools/design/shoot.mjs` (`--level <l>` writes `eov.level` before load; metric `infoHeightPx`, `plotHeaderVisible`), `tools/design/science_diff.mjs` + shoot selectors (read `enclosedNote` and the other ★ texts from Info as well as their old places)
- Create: `docs/quantumlab/checks/levels/CHECKLIST.md`

- [ ] **Step 1:** Shoot every mode (c-whole, c-2pz, fe-shell, basic-3dz2, bonds-n2, bonds-co-orbital, water, glycine) × dark/light × desktop/tablet/phone at levels basics and research, with `--jobs-stub`.
- [ ] **Step 2:** `science_diff` against main at `--level research`: identical science strings (they moved, not changed), except the listed typography changes (subscripts, U+2212, ×10ⁿ, typed point groups) and the Orbitals field subtitle (Task 5). List each difference.
- [ ] **Step 3:** Review Focus 4 metric: at 1440×900, research, bonds-n2: `plotHeaderVisible === true`, Info scrolls inside.
- [ ] **Step 4:** Checklist with measured values; then the Impeccable finish review (`impeccable-finish-reviewer`) against the direction contract, fixes, verdict, and the documenter updating DESIGN.md (levels, Info, (i), the text bands).
- [ ] **Step 5: Commit** `docs(design): learning levels and Info — live check, checklist and DESIGN.md`
