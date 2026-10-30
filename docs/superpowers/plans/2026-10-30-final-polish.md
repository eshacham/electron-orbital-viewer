# Final polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the parked polish items: one draw per pick, honest link corrections, real icons, no orphan labels or separators, token radii, one drawer tab row, a visible handle and MO bands in order, and cleanup.

**Architecture:** These are refinements in place. Each task touches a narrow set of files and adds a test that fails first.

**Tech Stack:** React 19, MUI 7 (`@mui/icons-material`), Redux Toolkit, Vite, TS, Jest/jsdom, `tools/design/shoot.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-30-final-polish.md`. Earlier rulings bind: `docs/quantumlab/checks/{levels,picture-control,science}/RULINGS.md`.

## Global Constraints
- Polish only. Keep the QuantumLab world, behaviour, copy and science exactly as they are, except for the items in the spec. Use tokens only and add no new colours. DESIGN.md rules apply.
- Accessible names stay the same unless the spec says otherwise. Keep: one announcement per change, spoken plain digits, and place:topic (i).
- Every behaviour change gets a test that fails first. Whole jest (`--maxWorkers=4`), `npx tsc --noEmit -p .`, `npm run build` and `npm run -s check:admin-split` must pass before each commit.

## Review Focus
1. **A ⌘K pick to the orbital already drawn.** It must draw zero extra times, and it must never draw zero times when the orbital differs. Test in Task 1.
2. **A link with several out-of-range values** (Z=200 & n=12). One notice names every correction, and it is spoken once. Test in Task 1.
3. **Fact values that are long at 200 px drawer width and on a 390 px phone.** No label sits alone, and nothing overflows. Test in Task 3 and the live check in Task 6.
4. **Keyboard users in the drawer after the inner tab row is hidden.** The bar's tabs still switch Plot/Data, and focus order stays sane. Test in Task 4.
5. **The handle ring gap in light theme.** It must not create a white halo artefact on the Light Clean ground. Live check in Task 6.

---

### Task 1: One draw per pick; link corrections are said
**Files:**
- `src/basic_ui/useDrawOnSelection.ts`
- `src/App.tsx` (the ⌘K pick handler and the hashchange path)
- the hash parser/clamp: `src/url_state*` or `src/store/*` (find where Z and n are clamped)
- the notice slot used by `applyLevelForHash` (`src/levels/apply_level.ts` / AppShell notice)

**Tests:** `tests/basic_ui/use_draw_on_selection.test.tsx`, `src/App.test.tsx`, and the URL-state tests.

- [ ] **Step 1: failing tests.**
  - With fake timers: a ⌘K pick of a new orbital in Orbitals draws once. A pasted link to a new orbital while in Orbitals draws once. A ⌘K pick or link that leaves a combination draws once. A ⌘K pick of the orbital already drawn draws 0 extra times.
  - `#mode=atom&Z=200` shows hydrogen, plus the notice "This link asked for Z = 200; showing hydrogen (Z = 1)." Use the exact wording; for other fields, build the wording from the same template. It is dismissible and spoken once.
  - Two corrections give one notice that lists both.
- [ ] **Step 2: run, and see them FAIL.**
- [ ] **Step 3: implement.** Fix the draw cause in the hook; do not add special cases in App. The clamp reports its corrections, and the notice renders them.
- [ ] **Step 4: gate.**
- [ ] **Step 5: commit** `fix(app): one draw per pick; a corrected link says what it corrected (final polish)`

### Task 2: Icons, small layout and type
**Files:**
- `src/shell/ThumbnailStrip.tsx:296` (▾/▴)
- the Info Back button (`src/info/InfoPanel.tsx`, `info.css:29`)
- `src/shell/PhoneTopBar.tsx` ("<Mode> ▾")
- any other glyph-as-icon found with `grep -rn "‹\|›\|▾\|▴" src`
- `src/atom_ui/OrbitalEnergyList.tsx` (header)
- the Bonds Data line separator (`src/bonds_ui/BondsInspector.tsx` or `src/bonds/captions.ts` frontier line)
- `src/style.css:483,1238,1688` (10 px corners)
- the MO level hover (`style.css` `.mo-box`)

**Tests:** the touched component tests, plus a CSS-source test for the radii and the hover rule.

- [ ] **Step 1: failing tests.**
  - No visible glyph "▾ ▴ ‹ ›" remains in the rendered control text. Each one is an MUI icon with `aria-hidden`, and its accessible name is unchanged.
  - The Back button's visible text no longer starts with "‹".
  - The table header text is "Energy (eV)" and stays on one line. Assert `white-space: nowrap` on the header cells in CSS, or a shorter header such as "eV" / "Ha" with `aria-label`s "Energy (eV)" / "Energy (Ha)". Pick the shorter-header option if a nowrap header would make the table overflow at 390 px.
  - The Data line's separator is wrapped with its following item in a no-break span.
  - The 10 px corners use `var(--ql-radius-*)`.
  - The MO box hover rule sets `surface-3` and is not overridden; check specificity.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: gate.**
- [ ] **Step 5: commit** `fix(design): real icons, a one-line table header, held separators, token radii, a visible MO hover (final polish)`

### Task 3: Fact rows never leave a label alone
**Files:** `src/info/info.css` (the fact grid) and `src/info/InfoPanel.tsx`, plus `src/format/energy.ts` if a break hint is needed between "eV" and "(Ha)".

**Tests:** `tests/info/info_panel.test.tsx` (CSS and markup) and a live metric in Task 6.

- [ ] **Step 1: failing tests.**
  - The fact grid keeps the label and value on one row, with the value column allowed to wrap.
  - Energy values carry a break opportunity (`<wbr>`, or a split into two no-break spans) between "… eV" and "(… Ha)", and never inside a number.
  - A test with a long value (`absoluteEnergyText(-109.38074)`) renders the value's two parts as two no-break spans.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: implement.** Use the shortest change to the grid. Undo the "value drops below its label" rule only where it would leave a label alone.
- [ ] **Step 4: gate.**
- [ ] **Step 5: commit** `fix(info): a fact's value wraps in its own column; no label sits alone (final polish)`

### Task 4: One Plot · Data row in the drawer
**Files:** `src/shell/Inspector.tsx` and `src/shell/inspector.css`.

**Tests:** `tests/shell/inspector.test.tsx`.

- [ ] **Step 1: failing tests.**
  - In `variant="drawer"` with a tabbed section, the inner tab row is not rendered (or is hidden from both layout and accessibility). The bar's tabs switch `activeTab`.
  - The docked and stacked variants still render the inner row.
  - Keyboard: Tab from the bar's open tab reaches the section content.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: gate.**
- [ ] **Step 5: commit** `fix(shell): the drawer shows Plot · Data once, in its bar (final polish)`

### Task 5: The handle's ring reads on blue; the MO bands sit in order
**Files:** `src/components/PotentialCurvePlot.tsx` (the handle), `src/style.css` (the handle rules), and `src/bonds/mo_layout.ts` (the band packing).

**Tests:** `tests/bonds/potential_curve_plot.test.tsx` and `tests/bonds/mo_layout.test.ts`.

- [ ] **Step 1: failing tests.**
  - The handle draws a 2 px gap ring in the plot's surface colour between the dot and the selected-edge ring. Use a token, no new colour.
  - Band levels are placed left to right in ascending energy with one constant gap. N₂'s core band puts 1σg then 1σu* adjacent.
  - A wrapped band test, three or more levels, covers the core band too.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: gate.**
- [ ] **Step 5: commit** `fix(bonds): the handle's ring reads on any fill; band levels sit in energy order (final polish)`

### Task 6: Cleanup, live check, finish review
**Files:**
- Modify: the remaining local energy formatters → `src/format/energy.ts`. List them with `grep -rn "toFixed" src | grep -i "ha\|ev"`. Strings stay identical.
- Modify: `PotentialCurvePlot.tsx`, to remove the unused hidden-range path if it has no caller.
- Create: `docs/quantumlab/checks/polish/CHECKLIST.md` and its shots.

- [ ] **Step 1: cleanup** with the tests already pinning the strings. Gate.
- [ ] **Step 2: shots.** Use `shoot.mjs` on port 5413 only.
  - A Z=200 link notice.
  - The strip toggle icon.
  - The Info Back icon.
  - Long facts at Research in the 1024 drawer and on phone: Bonds N₂ total energy, Atoms Fe.
  - The energy table header.
  - The Bonds Data line on phone.
  - The drawer with one tab row (Orbitals, Atoms).
  - The handle on N₂ in dark and light.
  - The N₂ core band.
  - The phone caption corner.
  - A measured metric for any label alone (`metrics.info.labelAlone` or similar; add it).
- [ ] **Step 3: CHECKLIST.md.** Write the measured values. "Finish review" and "DESIGN.md" are pending (controller).
- [ ] **Step 4: commit** `docs(design): final polish — live check and checklist`
