# The picture is the control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orbitals' thumbnail strip becomes the orbital picker, so the left panel keeps only Shell n. Bonds' energy curve moves under the R slider as one "Bond length" block that sets R and shows at every learning level.

**Architecture:** This is mostly relocation and wiring. `basicStripItems` already lists every orbital of shell n grouped by subshell. `PotentialCurvePlot` already has `onSelectR`, snapping and keyboard input. So:
- `BasicExplore` drops two chip rows.
- `ThumbnailStrip` gains an opt-in group-scroll mode with a horizontal scroll cue.
- `BondsPanel` gains the curve, sized from its own column.
- `BondsInspector` becomes Data-only.
- `PotentialCurvePlot` gains a plain-label mode for Basics.

**Tech Stack:** React 19, MUI 7, Redux Toolkit, three.js, Vite, TypeScript, Jest/jsdom, Playwright live shots (`tools/design/shoot.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-28-picture-is-the-control.md`. Decisions already made on this codebase are recorded in `docs/quantumlab/checks/levels/RULINGS.md`, and every task must keep them.

## Global Constraints
- Use QuantumLab Deep Space and Light Clean tokens only. Add no new colours. Science colours, Glow and the Atoms colours stay untouched (DESIGN.md "Science Is Not Style").
- Atoms and Molecules stay as they are. The shared `ThumbnailStrip` changes only behind an opt-in prop that only Orbitals passes.
- Keep the earlier rulings:
  - one home per number;
  - lowering the level never changes what is drawn;
  - an (i) is identified by `place:topic`;
  - spoken names use plain digits;
  - energies are eV first in Info;
  - one announcement per change.
- Basics curve copy is verbatim: y axis "Energy (eV)"; x axis "Distance between nuclei (Å)"; the Rₑ marker label "most stable".
- Every behaviour change gets a test that fails first. Whole jest, `npx tsc --noEmit -p .`, `npm run build` and `npm run -s check:admin-split` pass before each commit.

## Review Focus
1. **A collapsed strip in Orbitals.** `stripCollapsed` is shared across modes, so the strip may already be collapsed when the reader enters Orbitals. In Orbitals the strip still shows and offers no "Hide orbitals" toggle, because it is the only picker. Test in Task 1.
2. **n = 9 on a 390 px phone (81 tiles).** The selected tile scrolls into view, the right/left cue shows while more tiles lie off screen, and the arrow keys reach every tile. Test in Task 2, plus a live shot in Task 5.
3. **A strip pick while an Advanced combination is active.** It leaves the combination and draws the picked orbital, as a chip pick did. Test in Task 1.
4. **Curve input at the edges.**
   - A tap outside the curve's x range clamps.
   - H₂⁺ is continuous (step 0.01 a₀).
   - He₂ has no Rₑ line and still takes taps.
   - A tap on a scan system commits the nearest scan point, the same one the slider would choose.

   Test in Task 3.
5. **Lowering to Basics in Bonds with R at a non-default scan point.** The curve stays visible with plain labels, and R and the picture stay unchanged. Test in Task 4.

---

### Task 1: Orbitals — Shell n is the only chip row; the strip is the picker

**Files:**
- Modify:
  - `src/basic_ui/BasicExplore.tsx`: remove the Subshell l and Orbital mₗ rows at `:122-148`, plus their refs and `useRovingFocus` calls at `:68-73`.
  - `src/info/basic_info.ts`: the Subshell and Orbital facts at `:173-175`.
  - `src/App.tsx`: the Orbitals strip at `:2258-2261` and the phone strip at `:1977-1980`.
  - `src/shell/HelpDialog.tsx`, where it describes the Orbitals chips.
- Test:
  - `tests/basic_ui/basic_explore.test.tsx`
  - `tests/info/basic_info.test.ts`
  - `src/App.test.tsx`
  - the help dialog test

**Interfaces:**
- Consumes: `ThumbnailStrip` props `collapsible`, `items` and `onSelect`; `handleBasicPick` (`App.tsx:~297`); `InfoButton` `place`.
- Produces: `BasicExplore` without the l/mₗ rows. The props interface is unchanged: `onPick` is still used by the n row.

- [ ] **Step 1: Write the failing tests**
  - `basic_explore`: renders `group` "Shell n" and no group named "Subshell l" or "Orbital mₗ". The existing n-row tests stay. Delete the l/mₗ row tests, and add a comment saying the strip now covers them, pointing at the App test.
  - `App.test`: in Orbitals at desktop width, pressing the strip option "3d<sub>xz</sub>" (find it via `getByRole('listbox', { name: 'orbitals in view' })`) sets `orbital.selection` to `{ n: 3, l: 2, ml: 1 }`.
  - `App.test`, Review Focus 1: dispatch the shared strip-collapse in Atoms, then switch to Orbitals. The listbox is visible and there is no "Hide orbitals" button.
  - `App.test`, Review Focus 3: at Advanced, with the n = 2 Stark combination active, pressing strip option "2p<sub>x</sub>" clears the combination and selects `{ n: 2, l: 1, ml: 1 }`.
  - `basic_info`: the "Subshell l" and "Orbital mₗ" fact labels each carry an (i) with `place: 'info'`, so the subshell and orbital glossary entries stay reachable once their rows are gone.
- [ ] **Step 2: Run them, and expect FAIL**
- [ ] **Step 3: Implement**
  - Remove the two rows from `BasicExplore`.
  - In Orbitals, pass `collapsible={false}` to the strip, on both desktop and phone.
  - Add the (i) to the two Info fact labels, using the existing fact-label (i) pattern from `atom_info`/`bonds_info`.
  - Reword HelpDialog's Orbitals line to say you pick the shell on the left and the orbital from the strip.
- [ ] **Step 4: Whole jest, tsc and the build pass**
- [ ] **Step 5: Commit** `feat(orbitals): the strip picks the orbital; Shell n is the only chip row (picture control)`

### Task 2: The strip scrolls by subshell group, with a horizontal cue (opt-in)

**Files:**
- Create: `src/shell/useMoreSideways.ts`
- Modify:
  - `src/shell/ThumbnailStrip.tsx`
  - `src/shell/strip.css`
  - `src/App.tsx` (Orbitals' two strips pass `groupScroll`)
- Test: `tests/shell/thumbnail_strip.test.tsx`, `tests/shell/use_more_sideways.test.tsx`

**Interfaces:**
- Consumes: the technique of `useMoreBelow` (`src/shell/useMoreBelow.ts`): a scroll listener plus a ResizeObserver, with cleanup.
- Produces:
  - `useMoreSideways(ref: RefObject<HTMLElement | null>): { before: boolean; after: boolean }`. `before` is true while `scrollLeft > 1`. `after` is true while `scrollLeft + clientWidth < scrollWidth - 1`.
  - `ThumbnailStrip` prop `groupScroll?: boolean`, default `false`.

- [ ] **Step 1: Write the failing tests**
  - `use_more_sideways`: with a stubbed `scrollWidth` 800, `clientWidth` 300 and `scrollLeft` 0, it returns `{ before: false, after: true }`. After `scrollLeft = 500` and a scroll event, it returns `{ before: true, after: false }`. Unmounting disconnects the observer and removes the listener.
  - `thumbnail_strip`, with `groupScroll`:
    - the list gets `has-more-after` / `has-more-before` from the hook;
    - each `role="group"` gets class `strip-group-snap`;
    - without `groupScroll`, none of these classes appear (Atoms, Bonds and Molecules are untouched).
  - `thumbnail_strip`, Review Focus 2: with 81 items (from `basicStripItems` with n = 9) and the selected item last, the list's scroll position brings the selected tile into view (the existing scroll-into-view effect), and ArrowRight/End reach the last option.
- [ ] **Step 2: Run them, and expect FAIL**
- [ ] **Step 3: Implement**
  - With `groupScroll`, the list uses `scroll-snap-type: x proximity` and groups use `scroll-snap-align: start`.
  - The cue is a horizontal `mask-image` fade of about 24 px on whichever side has more. It is tonal only: no shadow, no arrow. The pattern follows DESIGN.md "Tonal Scroll Cue", turned sideways, and it respects reduced motion (no animated scroll-snap behaviour override).
- [ ] **Step 4: Whole jest, tsc and the build pass**
- [ ] **Step 5: Commit** `feat(strip): Orbitals' strip scrolls by subshell with a sideways cue (picture control)`

### Task 3: Bonds — one "Bond length" block: the slider, then the curve that sets R

**Files:**
- Create: `src/shell/useElementWidth.ts`, unless an equivalent exists (search first).
- Modify:
  - `src/components/BondsPanel.tsx` (the slider block at `:116-143`)
  - `src/components/BondsCurvePlot.tsx`
  - `src/bonds_ui/BondsInspector.tsx` (the sections at `:65-75`)
  - `src/App.tsx`:
    - `renderRadialPlot` for Bonds at `:1704-1709`, `:1849`;
    - the phone Bonds "Plot" tab at `:1943`;
    - the `onSelectR` wiring through `setH2PlusR` / `handleScanIndex` (`:776-779`, `:1667-1668`).
- Test:
  - `tests/bonds/bonds_panel.test.tsx`
  - `tests/bonds_ui/bonds_inspector.test.tsx`
  - `tests/bonds/potential_curve_plot.test.tsx`
  - `src/App.test.tsx`

**Interfaces:**
- Consumes:
  - `PotentialCurvePlot` props (`src/components/PotentialCurvePlot.tsx:21-33`), including `onSelectR`, `snapRs` and `markerR`;
  - `diatomicCurveSpec(system, scan, R)` and `h2plusCurveSpec(curve, R)` (`src/bonds/curve.ts`);
  - `nearestScanIndex` (`src/bonds/systems.ts`).
- Produces:
  - `useElementWidth(ref: RefObject<HTMLElement | null>): number`, which uses a ResizeObserver and is 0 until measured.
  - `BondsPanel` gains the prop `curve: React.ReactNode | ((width: number, markerR: number | null) => React.ReactNode)`. The panel renders it under the slider inside `<section aria-labelledby=…>`, headed "Bond length", passing the measured width and the slider's draft R.
  - `BondsInspector` keeps one section, key `'data'`, title "Data", with no tab row.
  - The phone Bonds tab keeps key `'plot'` but is labelled "Data".

- [ ] **Step 1: Write the failing tests**
  - `bonds_panel`:
    - Under the slider there is a region named "Bond length" that contains the slider and an `img`/plot whose accessible name includes "potential energy curve". Use the curve's existing name if it has one; read `PotentialCurvePlot` first.
    - During a slider drag (fire `change` without commit), the curve marker's `x` follows the draft R before release.
  - `App.test`, Review Focus 4:
    - N₂: clicking the curve at the pixel for R = 2.4 a₀ commits the same scan index as `nearestScanIndex(scan.points, 2.4)`.
    - H₂⁺: a click commits R snapped to 0.01 a₀.
    - A click left of the plot area commits the range minimum.
    - He₂: the plot renders with no `.potential-reference` line and still commits on click.
  - `bonds_inspector`:
    - Bonds has a single "Data" section with no "Plot" tab.
    - The old "has Plot and Data" test is replaced, with a why comment.
    - Phone: the sheet tab reads "Data".
  - `App.test`:
    - The Bonds curve appears at every level: at Basics, the left panel contains the curve.
    - The right panel has no "Plot and data" heading for Bonds at any level, and the Data section shows from Explore.
- [ ] **Step 2: Run them, and expect FAIL**
- [ ] **Step 3: Implement**
  - Move the Bonds curve out of `renderRadialPlot` into `BondsPanel` through the `curve` prop.
  - Size it with `useElementWidth` on the block, and render nothing until the width is above 0.
  - Wire `onSelectR` to the same commit paths as the slider.
  - Leave the curve out of the `plot` level gate; the Data section keeps that gate.
  - Do not add an energy readout to the block. Info's E − E(atoms) fact is the one home for that number. It updates in the same render as the commit, so it is never stale.
- [ ] **Step 4: Whole jest, tsc and the build pass**
- [ ] **Step 5: Commit** `feat(bonds): the curve sits under the R slider and sets R; Data keeps the numbers (picture control)`

### Task 4: The curve speaks plainly at Basics

**Files:**
- Modify:
  - `src/components/PotentialCurvePlot.tsx` (title/unit at `:111`, x readout at `:195-199`, reference note at `:205`)
  - `src/components/BondsCurvePlot.tsx`
  - `src/bonds/curve.ts` (the `referenceR.label` builders at `:86`, `:120`)
- Test: `tests/bonds/potential_curve_plot.test.tsx`, `tests/bonds/bonds_curve.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `LearningLevel` and `atLeast` from `src/levels/levels.ts`; the Task 3 `curve` render-prop.
- Produces: the `PotentialCurvePlot` prop `plain?: boolean`. It is true below Explore. `BondsCurvePlot` gets it as `level` and derives `plain = !atLeast(level, 'explore')`.

- [ ] **Step 1: Write the failing tests**
  - `potential_curve_plot` with `plain`:
    - the y label reads "Energy (eV)";
    - the x readout reads "Distance between nuclei (Å)", with Å tick values (a₀ × 0.529177, 2 significant decimals);
    - the reference note reads "most stable" plus the Rₑ value in Å, e.g. "most stable: 1.10 Å".
  - Without `plain`: today's strings exactly. Keep the existing tests at `:128-132` and `:143-152` unchanged.
  - `App.test`, Review Focus 5:
    1. In Bonds at Explore, pick scan index 5 for N₂.
    2. Switch to Basics.
    3. Expect the same scan index, the curve still visible, the "Energy (eV)" label shown, and no change to `bonds.R`.
- [ ] **Step 2: Run them, and expect FAIL**
- [ ] **Step 3: Implement**
  - Pass `level` from `BondsPanel` (it already has `level`).
  - Plain mode changes labels only; the data and marker are identical.
- [ ] **Step 4: Whole jest, tsc and the build pass**
- [ ] **Step 5: Commit** `feat(bonds): the curve's axes read in plain words at Basics (picture control)`

### Task 5: Live check, finish review and DESIGN.md

**Files:**
- Create: `docs/quantumlab/checks/picture-control/CHECKLIST.md` with shots `docs/quantumlab/checks/picture-control/*.png`.
- Modify: DESIGN.md and `.impeccable/design.json`. The documenter does this; the controller dispatches it.

- [ ] **Step 1: Shots.** Use `node tools/design/shoot.mjs --gl metal --jobs-stub --level <l>` on port 5413 only.
  - Orbitals, n = 3 and n = 9: dark and light, desktop and phone, at Basics and Research, including the cue showing.
  - Bonds, for each of N₂, H₂⁺ and He₂: dark and light, desktop, drawer and phone, at Basics and Research.
  - Cite each shot in CHECKLIST.md.
- [ ] **Step 2: Measure.**
  - The Bond length block fits the left column at 1280, 1440 and 1920 px, and on phone, with no horizontal overflow (use the overflow metric).
  - The Orbitals strip with n = 9 on phone shows its cue.
  - Info is still capped at 45 %.
- [ ] **Step 3: Record in CHECKLIST.md.** The controller then runs the Impeccable finish review against the spec, applies its fixes, and has the documenter update DESIGN.md (Orbitals picker, Bond length block, sideways cue).
- [ ] **Step 4: Commit** `docs(design): the picture is the control — live check and checklist (picture control)`
