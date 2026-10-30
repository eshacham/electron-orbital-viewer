# Final polish — live check and checklist (plan Task 6)

**Taken 2026-10-30 on branch `design/final-polish`**, on top of `2a71162` (Tasks 1–5) plus the Task 6 cleanup commit.
Every run used its own Vite on 5413 (`node tools/design/shoot.mjs --gl metal --jobs-stub --level research --task fp-T6-<name>`),
headless Chromium, and stopped it (port 5413 free afterwards). Shots live beside this file (committed with `git add -f`).
**Result:** every shot settled, 0 page errors, except the LVMO shot's three expected `ERR_BLOCKED_BY_CLIENT` lines (the stub
blocks a computed job's grid files). `factLabelAlone` is 0 in every shot.

## Owner flags for the local test

What a reader will notice, in the order they will meet it.

- **⌘K debounce.** A ⌘K pick inside Orbitals now draws once, after a 150 ms debounce; the orbital already drawn draws
  nothing extra. Expect a beat before the picture changes, not an instant swap.
- **Link-correction notices.** A link with an out-of-range value now opens a notice naming the correction, in the same slot
  and with the same dismissal as "Opened at … for this link": `#mode=atom&Z=200` reads "This link asked for Z = 200;
  showing hydrogen (Z = 1)." (`link-z200-notice-*`). Several corrections in one link share one notice, spoken once.
  Links now clamp n, l and mₗ too. Data-dependent clamps (does this element have that shell, a diatomic's R) stay unreported.
- **Icon swaps.** The text glyphs are MUI icons: the strip toggle ("Hide orbitals" with a chevron), Info's "Back to …"
  (a chevron, `info-back-*`), the phone's "<Mode> ⌄", the Excite button, and Molecules' "Change" tile and picker button.
  Accessible names did not change. Molecules' icon swap is new in this round (owner ruling accepted: same look, a real icon).
- **Short eV / Ha headers.** The Atoms "Orbital energies" table headers read "eV" and "Ha" (named "Energy (eV)" and
  "Energy (Ha)" for assistive tech). Both number columns are right-aligned.
- **Whole-number core eV.** In that table an energy of 1000 eV or more is a whole number ("−100392" for uranium 1s) and Ha
  is one decimal from 100 Ha ("−3689.4"); below those, 2 and 3 decimals. The column reads in mixed precision across the
  boundary (accepted; the same rule as the subshell chips).
- **Label wrapping (Info).** A fact's value that is too long wraps inside its own column, between "… eV" and "(… Ha)" or after
  a "·"; a label never sits alone on a line. Fe's "Ionisation energy (Fe → Fe⁺)" may wrap onto two lines so its value can
  stay beside it ("never alone" outranks "labels on one line").
- **The drawer change.** At medium width (Orbitals, Atoms) the drawer shows Plot · Data once, in its bar; the inner
  Plot | Data row is gone. Docked and phone layouts are unchanged (`drawer-one-row-orbitals`, `facts-fe-drawer-1024`).
- **The bigger handle.** The curve handle on a filled curve is 18 px (was 14): a 2 px gap of the card's own colour between
  the dot and its ring, so the ring reads on N₂'s blue (`handle-n2-*-2x`). Light Clean shows a card-coloured gap, no halo.
  At 1x the dot's edge is softened (see the handle line below).
- **The band rows.** The MO core band and the folded band place their levels left to right in energy order on one row with
  an 8 px gap, wrapping to the row above when narrow (`mo-n2-core-band`: 1σg then 1σu*).

## Measured

### F1 link notice
- `#mode=atom&Z=200`, Research, dark desktop and light phone: one notice line in the notice slot, "This link asked for
  Z = 200; showing hydrogen (Z = 1)." with a dismiss button; hydrogen drawn. Shots `link-z200-notice-dark-desktop`,
  `link-z200-notice-light-phone`.

### F2 icons (2x crops)
- Strip toggle "Hide orbitals ⌄", dark and light: `strip-toggle-dark`, `strip-toggle-light`.
- Info Back (after pressing the Shell (i)): chevron then "Back to Carbon — whole atom", dark and light: `info-back-*`.
- Excite button at the 300 px Explore panel (1280, Fe): "Excite: promote one electron to…" fits with its chevron on one
  line, nothing clipped (`excite-1280`).
- Molecules desktop "Change" tile, water, dark and light: label then chevron, one line (`molecules-change-*`).
- AppShell "Show the Explore panel" reveal button (tablet, after hiding the panel): a ChevronRight in its tab (`reveal-button-tablet`).
- **Radial-plot fold toggle: not reachable in the app.** Every call of `renderRadialPlot` in `src/App.tsx` passes
  `collapsible={false}` and no caller passes `compact`, so the folded "D(r) plot ⌄" toggle can't be shot live (phone, Plot
  tab: the plot is open with no toggle). The swap is covered by `tests/atom/radial_plot.test.tsx` only. Dead in the live app;
  noted for the controller, not removed here.

### F3 long facts at Research (own Vite; `info.factLabelAlone.count` and `info.overflow`)
| View | Row width | Label alone | Overflow (scroller X / fact rows) |
|---|---|---|---|
| Bonds N₂, 1024 drawer | 243 px | 0 | 0 / none |
| Atoms Fe, 1024 drawer | 243 px | 0 | 0 / none |
| Bonds N₂, phone 390 | 356 px | 0 | 0 / none |
| Atoms Fe, phone 390 | 356 px | 0 | 0 / none |
| Computed water LVMO, `--info-width 232` (rows 200 px) | 200 px | 0 | 0 / none |

- N₂ "Total energy": "−2976.40 eV" then "(−109.38074 Ha)" on its own line, value column right; "E − E(atoms)" the same, 2 lines.
  At phone width both fit on one line.
- Fe: "Ionisation energy (Fe → Fe⁺)" label 2 lines, value "8.04 eV" beside it; "Measured (NIST)" value 2 lines.
- LVMO "Orbital energy" at 200 px rows: "5.00 eV / (0.184 Ha), / upper estimate" in 3 value lines, label 2 lines, none alone.
- Shots: `facts-n2-drawer-1024`, `facts-fe-drawer-1024`, `facts-n2-phone`, `facts-fe-phone`, `facts-lvmo-info-232`.
- **`--info-width 200` as literally asked** narrows the Info section to 200 px, which is 168 px of fact rows (the section is 32 px
  wider than its rows; 232 gives 200 px rows). That is the unsupported width the T3 re-review parked: the value column
  overflows its row by 5 px there (`overflow.factRows`: dd 5, scroll 5), no label alone. 200 px rows pass.

### F4 energy table (Research, 1280 wide, Explore panel 298 px content / 300 outer)
`energyTable` metric: scrollWidth against clientWidth for the table, its `.explore-body` and the panel.
| Atom | Rows | Table | `.explore-body` | `.explore-panel` | Column widths (Subshell/Electrons/eV/Ha) |
|---|---|---|---|---|---|
| Uranium (non-rel.) | 18 | 266 / 266 | 298 / 298 | 298 / 298 | 64 / 69 / 69 / 64 |
| Gold, with spin–orbit (22 j rows) | 22 | 266 / 266 | 298 / 298 | 298 / 298 | 66 / 71 / 65 / 65 |
| Lead, with spin–orbit (24 j rows) | 24 | 266 / 266 | 298 / 298 | 298 / 298 | 66 / 71 / 65 / 65 |
- scrollWidth equals clientWidth everywhere: no sideways scroll. The table fills its box exactly (266 in 266), so there is no
  slack: the widest cells are uranium 1s "−100392" / "−3689.4" and the j rows' "1s½ 1s j = 1/2". Keep watching it if a
  column ever grows. Gold's first row reads −80077 eV / −2942.8 Ha; lead's −87337 / −3209.6.
- Shots: `table-uranium-1280`, `table-gold-so-1280`, `table-lead-so-1280` (header "Subshell Electrons eV Ha", right-aligned numbers).

### F4 Bonds Data line on a phone (2x crops)
- "Kohn–Sham orbital energies —" then "HOMO 3σg: ε = −11.92 eV (−0.438 Ha)" and "· LUMO 1πg*: ε = −0.91 eV (−0.033 Ha)" for N₂;
  O₂ reads "SOMO 1πg* α ×2 …" and "· LUMO 1πg* β …". The "·" leads its entry and wraps with it: no line holds only the separator
  (`data-line-n2-phone`, `data-line-o2-phone`).

### F4 phone caption corner
- Carbon 2pz caption, dark and light: 208 × 28 px, an 8 px corner (`--ql-radius-md`, as its neighbours), no 10 px corner (`phone-caption-*`).

### F5 drawer with one tab row
- Orbitals (3dz², `drawer-one-row-orbitals`) and Atoms (Fe, `facts-fe-drawer-1024`) at 1024, drawer open: the bar shows "Plot | Data"
  once; the section below starts with Info; no second Plot | Data row. (Bonds, which has only Data, shows "Data" alone.)

### F6 handle and band
- **N₂ handle, dark and light, 2x** (`handle-n2-dark-2x`, `handle-n2-light-2x`; the whole Bond length block): box 18 px, border
  `rgb(31, 182, 245)` in dark with the halo `0 0 12px 1px`, `rgb(22, 98, 224)` in light with no halo; fill `rgb(77, 163, 255)`.
  The gap reads as the card's colour in both: dark shows a dark ring between dot and cyan ring; light shows white, no halo artefact.
- **1x DPR check (19 × 19 px crop, magnified 16× nearest-neighbour):** with the hard stop `transparent 5px, surface-1 5px` the dot's
  edge was a pure staircase (no intermediate pixels), the outer ring antialiased (`handle-1x-before-*-16x`). **Applied the soft
  stop `transparent 4.5px, surface-1 5px`** (src/style.css, test updated): the dot's edge now has intermediate pixels in dark and
  light, no halo (`handle-1x-soft-*-16x`).
- **N₂ core band** (`mo-n2-core-band`): 1σg then 1σu* on one row, in energy order, 8 px apart (pinned exactly in `tests/bonds/mo_layout.test.ts`);
  at the bottom under the "≈ core" break. The folded band's own rows are pinned by the same test file.

## Unit-level changes made in this task
- `energyInUnitText` and `evHaPairText` in `src/format/energy.ts` replace the curve plot's local `formatEnergy` and the Bonds/H₂⁺
  `Dₑ = … eV (… Ha)` strings (strings unchanged); the hidden range input and the `keyboardControl` prop are gone from `PotentialCurvePlot`
  (both callers passed `false`).
- Ha 100 rounding cases (−99.9996 → "−100.0", −99.9994 → "−99.999") and the exact 8 px band gap are pinned.
- act() warnings: not worked on (optional); the full run prints 47 "not wrapped in act" lines both before and after.

## Finish-review captures

Taken 2026-10-30 at `c23a31c` (its own Vite on 5411, headless Chromium, `--gl metal --jobs-stub --level research`, stopped after each run;
0 page errors except the LVMO shot's three expected `ERR_BLOCKED_BY_CLIENT` lines). New tool options: scenes `bonds-b2`, `bonds-c2`
(tools/design/scenes.json); `--clip '<selector> || <selector>' [--clip-pad px]` (a screenshot of the union of those elements' boxes)
and the size `1280-tall` (1280 x 1500, so the Explore panel shows a whole energy table) in tools/design/shoot.mjs. No app code changed.

- **MO box hover, N2 at 1280, Research, 2x** (`--hover "1πu orbital (2 of 2), 2 electrons"`, crop = the 1πu level plus 6 px): the right-hand box is hovered,
  its partner at rest beside it. Surface-3 fill and the border-strong hairline on the three non-line edges read on both cards.
  `mo-hover-n2-dark.png`, `mo-hover-n2-light.png`.
- **Folded band with two levels.** B2 at its opening point (R = 3.005 a0) and C2 at its (R = 2.348 a0) both fold **1πg\* and 3σu\*** under
  "≈ higher empty levels": two boxes then label, 8 px, one box then label, on one row. The MO section at 1280 and on a 390 phone
  (Explore sheet), 2x. The band does **not** wrap on either: the diagram is a fixed 260 px wide on every layout (the same crop at 1280
  and phone), and its two levels take 142 px of the 222 px row; the wrap path is pinned by `tests/bonds/mo_layout.test.ts`, not shown.
  `mo-folded-band-b2-1280.png`, `mo-folded-band-b2-phone.png`, `mo-folded-band-c2-1280.png`, `mo-folded-band-c2-phone.png`.
- **Full energy tables, 1280, Research, with spin-orbit** (Orbitals tab; the `table` element itself, on a 1500 px tall window so nothing scrolls):
  gold's 22 rows, 1s½ to 6s½ (1 of 2); lead's 24 rows, 1s½ to 6p3/2 (1.33 of 4). Table 266 / 266 wide, no sideways scroll.
  `table-gold-so-1280.png`, `table-lead-so-1280.png` (overwritten).
- **LVMO Info at 232 px** (`computed-water-lvmo`, desktop, 2x, `--info-width 232`): cropped from the top of Info to the bottom of Properties'
  Structure row, no empty background below. `facts-lvmo-info-232.png` (overwritten).
- **Review shots** (git-ignored `.impeccable/review/`, not committed): Bonds N2 Research, `desktop.png` and `desktop-light.png` (1440 x 900),
  `mobile.png` (390 x 844, Explore tab open) and `mobile-first-screen.png` (390 x 844, as the page opens), at this HEAD, 1x.

## Pending (controller)
- [ ] **Finish review** — pending (controller).
- [ ] **DESIGN.md** — pending (controller).
