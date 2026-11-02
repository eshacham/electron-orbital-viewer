# Panel Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four fixes from the external review: an explicit construction choice in Orbitals, a resizable right panel with Info's "How this was computed" grouped as Method · Limits · Sources, rings and shell chips linked both ways in Atoms with a brass highlight, and a light-theme readability check.

**Architecture:** These are refinements in place on the Brass Instrument world:
- one new segmented control in `CombinationControls`;
- one new separator component in the docked inspector column, with a presentation pref;
- a typed `computed` shape in `info_types.ts` that the four builders fill;
- a shared `hoverRadius` for chip ↔ ring linking;
- a new shell-band helper.

**Tech Stack:** React 19, MUI 7, Redux Toolkit, three.js, Vite, TS, Jest/jsdom, `tools/design/shoot.mjs`, `tools/design/science_diff.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-02-panel-fixes-design.md`. DESIGN.md (the Brass Instrument world) and `docs/quantumlab/checks/*/RULINGS.md` bind.

## Global Constraints
- **Science and links:** no new science, computed value or copy, except the labels "Single orbital", "Hybrids", "Electric field", "Construction", "Method", "Limits", "Sources" and "Resize the right panel". `encodeStateOf` is untouched; the panel width is never in a link.
- **Colours:** science colours are untouched (science.ts, curve_colors.ts, orbital_glow.ts, ESP/density/CPK). Every UI colour comes from `src/design/tokens.ts`; tokens.css is generated.
- **Layout:** phone and medium-width layouts keep their structure. The Plot and data headers never leave the screen.
- **Rendering:** one WebGLRenderer, never remounted.
- **Gates:** whole jest (`--maxWorkers=4`), `npx tsc --noEmit -p .`, `npm run build` and `npm run -s check:admin-split` pass before each commit. Every behaviour change has a test that fails first.

## Review Focus
1. **A ⌘K pick or a link to a hybrid or field while Single orbital is showing.** The selector follows to Hybrids or Electric field, and no Shell n chip is pressed. Test in Task 1.
2. **Dragging the panel past its limits, or a viewport narrowed after a wide drag.** Width clamps to [290, min(560, 45 % of the viewport)]. At < 1290 px the stored width is ignored (drawer). Test in Task 2.
3. **A builder with no limits or no sources** (H₂⁺ exact, a hydrogen orbital). Those headings are absent, not empty. Test in Task 3.
4. **Hovering a chip while the pointer is also over the canvas, or the atom changing under a hovered chip.** There is no stale highlight; leaving clears it. A new atom recomputes the band. Test in Task 4.
5. **Keyboard: Tab through the Construction group and onto the resize separator.** Arrows act and the focus ring shows. Test in Tasks 1 and 2.

---

### Task 1: Orbitals: the Construction choice
**Files:**
- `src/components/CombinationControls.tsx`
- `src/basic_ui/BasicExplore.tsx`
- `src/basic_ui/basic_explore.css` (if needed)

**Tests:**
- `tests/combination_controls.test.tsx`
- `tests/basic_ui/basic_explore.test.tsx`
- `tests/app_combination_selection.test.tsx`

**Interfaces:**
- Produces: `type Construction = 'single' | 'hybrid' | 'field'` and `constructionOf(c: CombinationSelection): Construction`, exported from `src/combinations.ts`.

- [ ] **Step 1: Failing tests.**
  - At Advanced the group "Construction" has three options. Their accessible names are "Single orbital", "Hybrids" and "Electric field", and the pressed one follows `combination.kind`.
  - No "Combination" Select remains.
  - **Single orbital:** the Shell n chips render. **Hybrids / Electric field:** no Shell n chips render.
  - Choosing Hybrids from Single dispatches `{kind:'hybrid', hybrid:'sp3', member:'all'}`.
  - Choosing Hybrids again after Field returns the session's last hybrid. Field likewise.
  - Hybrids shows an exclusive "sp · sp² · sp³" group plus the existing Show row.
  - Choosing Single dispatches `NO_COMBINATION`. The stored n/l/mₗ are unchanged.
  - While a combination is drawn, no `.basic-chip` has `selected` or `aria-pressed="true"` (Review Focus 1).
  - A ⌘K pick or `applyStateTo` of a hybrid link updates the pressed option.
  - Below Advanced, no Construction group renders. The LevelLine pointer still shows.
  - Keyboard: arrow keys move within the group (MUI ToggleButtonGroup) (Review Focus 5).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** The "last hybrid / last field" memory is component state; it is never stored in a link.
- [ ] **Step 4:** Gate.
- [ ] **Step 5:** Commit `feat(orbitals): an explicit Construction choice — Single orbital · Hybrids · Electric field (panel fixes)`

### Task 2: The right panel can be widened
**Files:**
- Create: `src/shell/InspectorResizer.tsx`
- `src/shell/app_shell.css` (the grid's inspector column reads `--inspector-width`)
- `src/App.tsx` (wire it, docked layout only)
- `src/design/presentation.ts`: `inspectorWidthPref`, key `eov.inspectorWidth`; value a number or null; decode rejects non-finite values.

**Tests:**
- `tests/shell/inspector_resizer.test.tsx`
- `tests/design/presentation.test.ts`

**Interfaces:**
- Produces: `clampInspectorWidth(px: number, viewport: number): number` = `min(max(px, 290), min(560, 0.45 * viewport))`, rounded.

- [ ] **Step 1: Failing tests.**
  - The separator has `role="separator"`, `aria-orientation="vertical"`, `aria-valuemin=290`, `aria-valuemax=min(560, 0.45·vw)`, `aria-valuenow`, the name "Resize the right panel", and `tabIndex=0`.
  - ←/→ change the width by 16 px (← widens, because the panel is on the right). Home and End go to the minimum and maximum.
  - Pointer drag (pointerdown → pointermove → pointerup with capture) sets the width from the pointer's x.
  - Double-click resets to `null`, which means the default 290/320.
  - The width persists in `eov.inspectorWidth`, and a reload restores it.
  - `clampInspectorWidth` covers the cases: 200 → 290, 9999 at a 1500 viewport → 560, 9999 at a 1100 viewport → 495 (Review Focus 2).
  - Medium and phone layouts render no separator and ignore the pref.
  - `encodeStateOf` is byte-identical before and after a resize.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - A 6 px hit area with a 1 px hairline: `border-subtle`, brass `selected-edge` on hover and `:focus-visible`, `cursor: col-resize`.
  - The width flows into the grid through the CSS variable.
  - Camera insets use the existing measurement. Check that a resize triggers it, and add a ResizeObserver hook-up only if it doesn't.
  - While dragging, set `user-select: none` on the body.
- [ ] **Step 4:** Gate. Also live-check at 1492 px: drag to 560 and back, and check the model is not under the panel and the Plot and data header is still visible.
- [ ] **Step 5:** Commit `feat(shell): the right panel can be widened — a drag and keyboard separator, remembered locally (panel fixes)`

### Task 3: "How this was computed" as Method · Limits · Sources
**Files:**
- `src/info/info_types.ts`: `computed?: ComputedParts`, with `interface ComputedParts { method: React.ReactNode; limits?: React.ReactNode; sources?: React.ReactNode }`.
- `src/info/InfoPanel.tsx` and `info.css`.
- The four builders: `basic_info.ts`, `atom_info.ts`, `bonds_info.ts`, `molecule_info.ts`, plus `src/components/ProvenancePanel.tsx` if molecules need a split.

**Tests:**
- `tests/info/info_panel.test.tsx`
- each builder's test
- a `science_diff` run

**Interfaces:**
- Produces: `ComputedParts`. InfoPanel renders an `h3`-level caption heading per present part, in the order Method, Limits, Sources.

- [ ] **Step 1: Failing tests.**
  - InfoPanel renders the headings "Method", "Limits" and "Sources" only for present parts (Review Focus 3).
  - The disclosure keeps its title and its level behaviour (open at Research).
  - Each builder test asserts which sentences are in which part, by moving their existing assertions:
    - **Orbitals single:** method = the exact one-electron solution with marching cubes; no limits.
    - **Field:** method = the perturbation theory; limits = `FIELD_VALIDITY` / `N2_FIELD_LIMIT` / the hyperpolarisability share.
    - **Atoms:** method = `methodStatement`; limits = `aboutModelText` caveats; ΔSCF stays in method.
    - **Bonds:** method = `bondsCaptions` method; limits = `orbitalCaveats` and `curveNote`.
    - **Molecules:** method = geometry, SCF, dispersion and frequency lines; limits = legacy and open-shell caveats; sources = the PubChem link and the reference-data source line.

    The implementer reads each text and files every sentence. A sentence that is both method and limit goes to Limits.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Headings are caption-size Inter 600 in `text-2`, with 8 px above each heading after the first. The text is moved, never reworded.
- [ ] **Step 4:** Gate.
  - Then run a shoot `--sweep` before and after on the scenes 2pz, field n=2, Mg excited, N₂ and water at Research.
  - `node tools/design/science_diff.mjs <before> <after>` must report identical text, except the three added headings. Record the run in the report.
- [ ] **Step 5:** Commit `feat(info): How this was computed reads Method · Limits · Sources, the same sentences regrouped (panel fixes)`

### Task 4: Rings and shell chips point at each other
**Files:**
- `src/atom/shell_pick.ts`: `shellBandRadius(profile: ShellPickProfile, n: number): number | null`, the geometric mean of the end radii of the longest contiguous run of grid points whose `shellIndexAtR` maps to shell n; null if none.
- `src/components/LevelNav.tsx`: a `linked` class on the chip of `shellAtRadius(profile, hoverRadius)`. `onMouseEnter`/`onFocus` dispatch `setAtomHoverRadius(shellBandRadius(...))`; `onMouseLeave`/`onBlur` dispatch `null`.
- `src/style.css`: `.level-nav-shell-chip.linked:not(.selected)` gets `surface-3` and `box-shadow: inset 0 0 0 1px var(--ql-color-selected-edge)`.
- `src/atom/shell_view.ts` + `src/orbital_visualizer.ts`: the highlight colour is a uniform `highlightColor`, set from `TOKENS.dark['accent']` through the appearance, replacing the literal `vec3(0.30,0.95,1.00)`.

**Tests:**
- `tests/atom/shell_pick.test.ts`
- `tests/components/level_nav*.test.tsx`
- `tests/atom/shell_view.test.ts`

**Interfaces:**
- Consumes: `shellAtRadius`, `state.atom.hoverRadius`, `setAtomHoverRadius`.

- [ ] **Step 1: Failing tests.**
  - `shellBandRadius` returns a radius r with `shellAtRadius(profile, r) === n` for every shell of synthetic profiles. These include a profile whose shell n has two separate runs, where the longer one wins. It returns null for an absent n.
  - With `hoverRadius` inside shell 2's band, the L chip has `linked`, and no other chip does. A selected chip never gets `linked` styling.
  - Hovering or focusing the M chip dispatches `setAtomHoverRadius(r)` with `shellAtRadius(r) === 3`. Leaving or blurring dispatches `null` (Review Focus 4).
  - When the atom changes, the next hover uses the new profile.
  - The shader source contains no `0.30, 0.95, 1.00`. The material's `highlightColor` uniform equals the field accent.
  - The linking happens only at the whole-atom level, where rings are pickable.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Gate. Also live-check Fe at whole atom: hover the rings and the chips, and confirm the brass circle.
- [ ] **Step 5:** Commit `feat(atoms): rings and shell chips point at each other; the ring highlight is brass (panel fixes)`

### Task 5: Live check
- [ ] **Shots** (port 5413, `--gl metal`), Advanced/Research, both themes at 1492 px, plus 1280 px for the panel:
  - Orbitals Single, Hybrids sp³ all and Electric field n=2;
  - the panel at default and at 560 px with Info's three headings, on water and N₂ at Research;
  - Fe whole atom with a chip hovered and a ring hovered;
  - phone Orbitals at Advanced, to show no change in layout.
- [ ] **P4:** Mg 3s→3p at Advanced, both themes, at 100 % and 45 %, matched captures. Sample the field and surface pixels and state whether light equals dark.
- [ ] **Write** `docs/quantumlab/checks/panel-fixes/CHECKLIST.md` with the shots and measured values.
- [ ] **Commit** `docs(design): panel fixes — live check and checklist (panel fixes)`
