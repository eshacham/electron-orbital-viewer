# Science corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every energy, gap, grouping, label and colour on screen tells the truth about the computed data.

**Architecture:** The data stays as it is; only the presentation changes. The work:
- the MO diagram moves onto one true eV scale with an axis;
- the remaining energies read eV first through `src/format/energy.ts`;
- valence labels and degeneracy groups each come from one shared function;
- status tokens are removed from non-status marks.

**Tech Stack:** React 19, MUI 7, Redux Toolkit, Vite, TS, Jest/jsdom, and `tools/design/shoot.mjs` for live shots.

**Spec:** `docs/superpowers/specs/2026-10-30-science-corrections.md`. Prior rulings that still bind: `docs/quantumlab/checks/levels/RULINGS.md` and `docs/quantumlab/checks/picture-control/RULINGS.md`.

## Global Constraints
- Presentation only. No computed value, data file or science colour (phase, density, ESP, shell palette) changes. Glow stays untouched.
- Use only the energy formatters in `src/format/energy.ts`: `orbitalEnergyText`, `absoluteEnergyText`, `energyDifferenceText` and `hartreeText`, plus any new helper added there. No local formatters.
- Use tokens only and add no new colours. DESIGN.md rules apply: Meaning-Only Status, One Blue Voice, Science Is Not Style.
- Keep the earlier rulings: one home per number, eV first, place:topic (i), spoken plain digits, and lowering the level never changes what is drawn.
- Every behaviour change gets a test that fails first. Whole jest (`--maxWorkers=4`), `npx tsc --noEmit -p .`, `npm run build` and `npm run -s check:admin-split` must pass before each commit.

## Review Focus
1. **He₂ against H₂.** On the shared scale, He₂'s 1σg–1σu* pair must look nearly level and H₂'s gap large. Two levels closer than a box sit side by side at their true heights. Test in Task 2.
2. **The largest-span system.** If one system exceeds the height cap, its axis must label the shrunk scale. Nothing may be clipped off the top or bottom. Test in Task 2.
3. **Unlabelled orbitals ("?") in a computed molecule.** They still group by energy, and a labelled e-pair is still ×2. Test in Task 4.
4. **Valence for a neutral transition metal (Fe), its ion (Fe²⁺), Ga³⁺, Gd³⁺ and Lu³⁺.** The panel label and Info's plain words must name the same subshells. Test in Task 3.
5. **Light theme.** The neutral Rₑ line still reads as distinct from the dashed marker and the grid. Live check in Task 6.

---

### Task 1: The remaining energies read eV first
**Files:**
- `src/format/energy.ts` (add `evText(h: number): string`, giving "−13.6 eV" to 3 significant figures with U+2212)
- `src/components/SubshellPanel.tsx:181,196-198,231-233`
- `src/atom_ui/OrbitalEnergyList.tsx:22,39`
- `src/components/MoDiagram.tsx:78` (tooltip)
- `src/bonds/curve.ts:41,143-145`
- `src/components/ProvenancePanel.tsx:17,56,71`

**Tests:**
- `tests/atom/subshell_panel.test.tsx` (:47-78, :374-409)
- `tests/atom_ui/atom_explore.test.tsx`
- `tests/bonds/mo_diagram.test.tsx`
- `tests/bonds/bonds_curve.test.tsx:125-129`
- `tests/info/bonds_info.test.ts:313`
- `tests/jobs/provenance_panel.test.tsx:187-191`

**Interfaces:** Produces `evText`. Every other site uses the existing formatters.

- [ ] **Step 1: Failing tests, exact strings.**
  - A subshell chip reads "2s · 2 of 2 e⁻" and "−13.6 eV orbital energy". Its aria-label ends "…, −13.6 eV (−0.501 Ha) orbital energy (<method>)". Keep the `orbitalEnergyText` precision in the aria-label: "−13.63 eV (−0.501 Ha)", whatever `orbitalEnergyText` gives.
  - The table has column headers "Energy (eV)" and "(Ha)". Row C 2p reads "−5.41" and "−0.199".
  - The MO tooltip reads `${label}: ε = ${orbitalEnergyText(E)}`.
  - The H₂⁺ note reads "…, E = −16.40 eV (−0.6026 Ha); Dₑ = …" and the zero reads "Zero: H + H⁺ (−13.61 eV, −0.5 Ha)". Use `absoluteEnergyText` precision rules where they fit, and pin the exact strings the code produces.
  - Provenance reads "Total energy −2080.79 eV (−76.358723 Ha), including −0.0156 eV (−0.000574 Ha) of D3(BJ)." Keep 6-decimal Ha; take the eV digits from a helper `totalEnergyText(h)` = `${eV to 2 dp} eV (${Ha to 6 dp} Ha)` added to energy.ts. The zero-point energy is formatted the same way.
- [ ] **Step 2: Run them, and confirm they FAIL.**
- [ ] **Step 3: Implement**, using only energy.ts helpers. Update the comments and glossary text that say "in Ha" (`glossary.ts:178`).
- [ ] **Step 4: Gate.** Whole jest, tsc, build and admin split must pass.
- [ ] **Step 5: Commit** `fix(energies): the last Ha-first energies read eV first (science corrections)`

### Task 2: The MO diagram on one true eV scale, with an axis
**Files:**
- `src/components/MoDiagram.tsx` (layout at :17-28 and :55-66, the break at :93)
- a new `src/bonds/mo_layout.ts` (pure layout)
- `src/style.css:1015-1064`
- `src/info/glossary.ts` (`moDiagram` technical text, if it mentions stretching)

**Tests:** `tests/bonds/mo_layout.test.ts` (new) and `tests/bonds/mo_diagram.test.tsx` (keep the break test at :233-246).

**Interfaces:**
- `layoutMoDiagram(levels: MoLevel[], opts?: { pxPerEv?: number; maxHeight?: number }): { rows: { levelIndex: number; y: number; xOffset: number }[]; axis: { ticks: { y: number; label: string }[]; pxPerEv: number; shrunk: boolean }; height: number; breakY: number | null }`
- Constants: `MO_PX_PER_EV = 5` and `MO_MAX_HEIGHT = 320`.

- [ ] **Step 1: Measure and record.** From the published v3 data the tests already use (fixtures in tests/), record each Bonds system's valence span in eV in the report. If the fixtures don't cover all ten, say which ones were measured.
- [ ] **Step 2: Failing tests.**
  - Valence y is linear in energy at `MO_PX_PER_EV`. He₂'s two levels are less than 1 px apart and are placed side by side (`xOffset > 0` on the upper one).
  - H₂'s gap in px equals its eV gap × 5.
  - No level's y changes because of a neighbour.
  - Ticks every 5 eV, labelled with U+2212, when the span is under 20 eV; otherwise every 10 eV.
  - A synthetic span over the cap gives `shrunk: true` and a smaller `pxPerEv`, with every row inside `[0, height]`.
  - The break sits between the core band and the lowest valence row.
- [ ] **Step 3: Implement.**
  - Draw the axis as a thin `plot-axis` line with `text-3` tick labels at the left of the diagram.
  - When `shrunk`, add a visually small axis note "scale reduced to fit" in text-3.
  - Boxes and labels sit at true y. Side-by-side offsets use the box width plus a gap.
  - Width stays within the left column (use the existing width).
- [ ] **Step 4: Gate.**
- [ ] **Step 5: Commit** `fix(bonds): the MO diagram is drawn to one true eV scale with an axis (science corrections)`

### Task 3: One valence rule for the panel and Info
**Files:**
- `src/atom/configurations.ts:243-289` (add `valenceView(config): { subshells: Subshell[]; frame: 'outer' | 'df-outside-full-sp' ; core: Subshell[]; openInner: Subshell[] }`, and rewrite `valenceConfigurationLabelOf` on top of it)
- `src/info/atom_info.ts:72-92` (`valencePlainWords` uses `valenceView`)
- `src/components/LevelNav.tsx:338`
- `src/orbital_facts.ts:146,151`

**Tests:** `tests/atom/level_nav.test.tsx:16,360`, `tests/info/atom_info.test.ts:193-224`, and new cases in `tests/atom/configurations.test.ts`.

- [ ] **Step 1: Failing tests (exact label strings).**
  - Fe: "2 … " stays as today. Pin the current neutral Fe label first, then keep it.
  - Fe²⁺: "Valence: 3d⁶ (outside 3s² 3p⁶)"
  - Ga³⁺: "Valence: 3d¹⁰ (outside 3s² 3p⁶)"
  - Gd³⁺: "Valence: 5s² 5p⁶ · open 4f⁷"
  - Lu³⁺: "Valence: 5s² 5p⁶"
  - C: "Valence: 2s² 2p²"
  - Li: "Valence: 2s¹"
  - For each species, Info's plain words name the same subshells as the label. Assert that both derive from the same `valenceView` result.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.** `valencePlainWords` is a wording of `valenceView`. The label is its compact form.
- [ ] **Step 4: Gate.**
- [ ] **Step 5: Commit** `fix(atoms): one valence rule for the panel label and Info (science corrections)`

### Task 4: Degeneracy marks follow symmetry labels
**Files:**
- `src/molecules/orbital_display.ts:14,76` (rewrite `degeneracyCounts` to group by equal label; '?' falls back to energy with tol 1e-4)
- `src/components/MoleculeOrbitalList.tsx:44,105,113`
- `src/info/molecule_info.ts:90-112`

**Tests:** `tests/molecules/molecule_nav.test.tsx:53-56,92-100,636-659` and `tests/info/molecule_info.test.ts`.

- [ ] **Step 1: Failing tests.**
  - NO₂'s 1b2 and 1a1 (1.9e-5 Ha apart) are each ×1.
  - A pair labelled "1e" is ×2. A labelled "2t2" triple is ×3 (silane stays ×3).
  - Two "?" orbitals 1e-5 Ha apart are ×2. Two "?" orbitals 1e-3 apart are ×1.
  - The Basics window edge never splits a labelled group.
  - Info's "one of N with the same energy" follows the same groups. Reword it to "one of N degenerate orbitals" when the group comes from a label.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** one exported `degenerateGroups(orbitals)`. Remove the duplicate `DEGENERATE_HARTREE` and `SAME_LEVEL_HARTREE` constants.
- [ ] **Step 4: Gate.**
- [ ] **Step 5: Commit** `fix(molecules): degeneracy marks follow symmetry labels (science corrections)`

### Task 5: Status colours mean status only
**Files:**
- `src/style.css:438,440` (Rₑ line and note), `:748-757` (valence dot), `:1692` (Computed chip hex)
- `src/components/TierBadge.tsx:27`
- `src/bonds_ui/BondsExplore.tsx:34` ("exact" chip)
- the shell palette source used by the 3D view for the valence dot. Find it, and do not change it.
- DESIGN.md (the Rₑ line bullet near line 558, plus the tier chip and valence dot mentions)

**Tests:** `tests/bonds/potential_curve_plot.test.tsx:536`, `tests/a11y/panel_contrast.test.ts:71,86,147`, `tests/jobs/provenance_panel.test.tsx:77`, and the tier badge tests.

- [ ] **Step 1: Failing tests.**
  - `.potential-reference` stroke and its note use `--ql-color-text-2`, and keep the dotted dash. The marker stays dashed text-1.
  - The tier chips and the "exact" chip are outlined with no success/warning colour, and their labels are unchanged.
  - The Computed chip has no hard-coded hex.
  - The valence dot's colour equals the 3D view's colour for that shell. Read it from the same exported palette and assert equality.
  - Contrast tests pass for text-2 in both themes.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.** Update DESIGN.md's lines to match.
- [ ] **Step 4: Gate.**
- [ ] **Step 5: Commit** `fix(design): status colours mean status only — Rₑ line, tier chips, valence dot (science corrections)`

### Task 6: Live check and science diff
**Files:** create `docs/quantumlab/checks/science/CHECKLIST.md` with shots `docs/quantumlab/checks/science/*.png`.

- [ ] **Step 1: Shots.** Use `node tools/design/shoot.mjs --gl metal --jobs-stub --level <l>` on port 5413 only.
  - Bonds MO diagram for H₂⁺, He₂, N₂, O₂, CO and HF (whichever scenes exist): dark and light, desktop and phone, Research.
  - Atoms Fe, Fe²⁺, Ga³⁺ and Gd³⁺ panels.
  - Molecules NO₂ and silane orbital lists.
  - The Rₑ line in light and dark.
  - The tier chips.
- [ ] **Step 2: Science diff.** Compare against main at `--level research` with `tools/design/science_diff.mjs`. Classify every difference as (a) typography/format (eV first), (b) a spec decision S1–S5 (cite it), or (c) unexplained.
- [ ] **Step 3: Write CHECKLIST.md** with measured values. Mark "Finish review" and "DESIGN.md" as pending (controller).
- [ ] **Step 4: Commit** `docs(design): science corrections — live check, science diff and checklist`
