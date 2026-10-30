# Science corrections — live check, science diff and checklist (plan Task 6)

**Taken 2026-10-30 on branch `fix/science-corrections`, head `f9ca2d2`** (Tasks 1–5 and the controller's small fixes),
against `main` at `ef3d213`, which is the merge-base. Main was built from a clean detached worktree
(`git worktree add --detach /tmp/sc-main ef3d213`, then `npm ci`), removed and pruned afterwards.

Every run used its own Vite (branch on 5413, main on 5412), `--gl metal --jobs-stub`, headless Chromium, and stopped it.
**Result:** every shot settled, 0 page errors. The one exception is expected: `computed-water-structure` logs three
`ERR_BLOCKED_BY_CLIENT` lines, because the stub blocks a computed job's grid files (it is shot with `show=none`).

## Owner flags for the local test

What a reader will notice, in the order they will meet it. Every number is the one the run measured.

- **The MO diagram follows the energy span and has an eV axis.** On main every system was drawn 220 px tall with no
  axis. Now the height is the span at one scale (5 px per eV): H₂⁺ 84 px, He₂ 50, HF 223, N₂ 241, CO 246, O₂ 258.
  So O₂, CO and N₂ are taller than before, and H₂⁺ and He₂ are shorter. The axis carries ticks at 5 or 10 eV steps and
  the unit "eV". Nothing overflows the diagram's box (top, bottom or right: 0 px in all 7 measured cases, both themes).
  The Molecular orbitals section can fall below the fold at 1440 × 900 for O₂, CO and N₂ (Task 2's recorded concern).
- **He₂ now looks level, H₂⁺ does not.** He₂'s 1σg and 1σu* are −17.95 and −17.86 eV: 0.09 eV apart, side by side at
  their true heights. H₂⁺'s are −30.00 and −18.16 eV: a 11.8 eV gap, 59 px. (H₂ itself has no scene in this set; the
  He₂ / H₂ comparison is pinned by Task 2's test.)
- **Core and "higher empty levels" bands.** The deep levels sit under a break marked "≈ core": N₂ 1σg and 1σu*,
  O₂ the same two, CO 1σ and 2σ, HF 1σ. Above the lowest wholly empty level, N₂ and CO fold the rest under a second
  break marked "≈ higher empty levels" (N₂ 3σu*, CO 6σ). O₂ and HF have no such band (O₂ draws 3σu* to scale at +4.32 eV;
  HF draws 4σ). H₂⁺ and He₂ have no core band.
- **Energies read eV first.**
  - Atoms subshell chips read "−13.6 eV orbital energy" (the full "−13.63 eV (−0.501 Ha)" is in the accessible name and
    tooltip).
  - The Atoms "Orbital energies" table now has two columns, "Energy (eV)" then "(Ha)".
  - H₂⁺'s curve note reads "E = −16.40 eV (−0.6026 Ha)", and the zero reads "Zero: H + H⁺ (−13.61 eV, −0.5 Ha)".
  - The MO tooltips read "3σg: ε = −11.92 eV (−0.438 Ha)".
  - Molecules' "How this was computed" total energy and D3(BJ) term read eV first with Ha in parentheses, e.g. water
    "−2080.78 eV (−76.467311 Ha)". The owner's job progress line stays in Ha.
- **"Valence: … (outside …)" labels.** Fe²⁺ now reads "Valence: 3d⁶ (outside 3s² 3p⁶)" (was "3s² 3p⁶ 3d⁶"), Ga³⁺
  "3d¹⁰ (outside 3s² 3p⁶)", Gd³⁺ "5s² 5p⁶ · open 4f⁷" (was "4f⁷ 5s² 5p⁶"). Neutral Fe still reads "3d⁶ 4s²", C
  "2s² 2p²". Info's plain words ("8 electrons in the outer shell and 7 in the open 4f") did not change; the label now
  agrees with them by construction. Two follow-on effects of the one rule: neutral Pd reads "4d¹⁰ (outside 4s² 4p⁶)",
  and 541 excited-state wordings now read in configuration order (T3 ledger lines).
- **×N marks that changed (Molecules).** A near-tie across different symmetry labels is no longer marked. I opened the
  Orbital list of all 25 library molecules on both sides: 18 are identical, 7 differ, and only in these rows:
  - **SF₆:** 1t1u ×6 → ×3, 1eg ×6 → ×2, 2a1g ×6 → ×1. The old ×6 was a false merge of three different core orbitals
    (1t1u, 1eg and 2a1g).
  - **CO₂:** 1σg and 1σu ×2 → ×1.
  - **NO₂:** 1a1 and 1b2 ×2 → ×1 (the "NO₂ ×2" of the critique).
  - **O₃:** 2a1 and 1b2 ×2 → ×1. **SO₂:** 2a1 and 1b2 ×2 → ×1.
  - **Acetone:** 4a′ and 3a′ ×2 → ×1. **Pyridine:** 4a1, 2b2, 2a1 and 1b2 ×2 → ×1.

  All of them are core near-ties across labels. Real degeneracies (silane 2t2 ×3, 1e ×2; SF₆ 6t1u ×3, 3eg ×2) stay.
  The ledger names F₂ in this list too; no library molecule has the id `f2`, so it does not appear here.
- **The neutral Rₑ line and chips.** The "most stable" line on the Bonds curve is a thin dotted line in text-2, no longer
  success green; its note under the plot is plain text. The tier chips ("Library", "Computed") and H₂⁺'s "exact" chip
  are neutral outlined chips. The Computed chip's hard-coded hex is gone. The outline is faint by ruling (about
  1.6–2.0 : 1; the label carries the meaning).
- **The valence dot in its shell colour.** The dot on the Atoms "N shell (n = 4) · valence" chip is the colour the 3D
  view gives that shell (Fe: M amber, N green; Gd³⁺: N green, O purple), no longer warning amber. The selected chip's dot
  keeps a ring on its fill.
- **What did not move:** the 3D pictures, every computed value, phase, density and ESP colours, Glow. "only qualitative"
  keeps warning.

## Step 1 — shots (44, in this folder)

All dark and light shots are Research unless named. Bonds shots are the Molecular orbitals section (desktop 1440 × 900;
phone 390 × 844 with the Explore sheet opened by `--click Explore`).

- **Bonds MO diagram:** `mo-<system>-<theme>-<size>.png`, systems h2plus, he2, n2, o2, co, hf; dark and light; desktop
  and phone (24).
- **Review Focus 5 (the curve):** `curve-n2-re-<theme>.png` (marker at Rₑ) and `curve-n2-far-<theme>.png` (marker at the
  scan's far end, 2.41 a₀, the end of the plot's axis and 0.32 a₀ from Rₑ; the URL asks R = 3.4 and snaps to the nearest scan point) (4).
- **Tier chips:** `tier-library-`, `tier-computed-`, `tier-exact-` × dark, light (6).
- **Atoms (dark desktop, Advanced):** `atom-fe-atom-…`, `atom-fe2-ion-…`, `atom-ga3-ion-…`, `atom-gd3-ion-…` (4, whole panel);
  `atom-fe-subshell-chips.png` and `atom-fe2-subshell-chips.png` (the eV chips, from M-shell scenes); `atom-fe-energy-table.png`
  (the two-column table) (3).
- **Molecules (dark desktop, Research, Orbital list):** `mol-no2-…`, `mol-silane-…`, `mol-sf6-…` (3). The list scrolls
  inside its panel, so each shows the rows from the top.

### MO diagram, measured (`getBoundingClientRect` of `.mo-diagram`, both themes identical)

| System | Height (px) | Levels | Ticks | Core band | Higher-empty band |
|---|---|---|---|---|---|
| H₂⁺ (R = 1.997 a₀) | 84.2 | 2 | −20, −25, −30 | no | no |
| He₂ | 50.0 | 2 | −15, −20 | no | no |
| N₂ | 241.4 | 8 | −10, −20, −30 | 1σg, 1σu* | 3σu* |
| O₂ | 258.3 | 8 | 0, −10, −20, −30 | 1σg, 1σu* | no |
| CO | 246.3 | 8 | −10, −20, −30 | 1σ, 2σ | 6σ |
| HF | 223.4 | 5 | 0, −10, −20, −30 | 1σ | no |
| N₂ at the far scan point (2.41 a₀) | 218.7 | 8 | −10, −20 | 1σg, 1σu* | 3σu* |

Main: 220.0 px for each of the first six, 0 axis labels. Overflow of any box or label past the diagram: 0 px (top,
bottom, right) in all 14 measurements.

### Review Focus 5 — the neutral Rₑ line in light and dark (N₂ curve)

The marker was moved well away from Rₑ (101.6 px apart on the plot; at Rₑ they are 3.8 px apart). Measured with
`getComputedStyle` on the SVG lines, contrast against the plot's background:

| | Rₑ line (`.potential-reference`) | Marker (`.potential-marker`) | Plot axis (`.radial-plot-axis`) |
|---|---|---|---|
| Dark (bg rgb 7 24 40) | rgb 195 207 219, 1 px, dash 1 3: **11.34 : 1** | rgb 242 246 250, 1 px, dash 3 2: 16.52 : 1 | rgb 147 166 186, solid: 7.18 : 1 |
| Light (bg white) | rgb 71 84 103, 1 px, dash 1 3: **7.69 : 1** | rgb 11 18 32, 1 px, dash 3 2: 18.72 : 1 | rgb 91 104 128, solid: 5.62 : 1 |

**Pass.** In both themes the Rₑ line is dotted (1 on, 3 off), the marker is dashed (3 on, 2 off), and the axis is solid
and lower in contrast than the Rₑ line. The line reads at once as a different thing from both, in `curve-n2-far-light.png`
and `-dark.png`. At the default R the marker sits 3.8 px from the line, so the line shows beside the marker's dashes
(`curve-n2-re-*.png`); T5's recorded concern, still true, still readable.

## Step 2 — the science diff against main (Research)

`science_diff.mjs` compared main (`ef3d213`) with this branch's head. Both sides were shot dark, desktop and phone, at
Research, with `--sweep`, over 21 scenes: c-whole, c-2pz, fe-shell, fe-atom, fe2-ion, ga3-ion, gd3-ion, na-ion,
basic-3dz2, bonds-h2plus, bonds-he2, bonds-n2, bonds-o2, bonds-co, bonds-hf, bonds-co-orbital, water, no2, silane, sf6,
glycine (42 shots per side, each side in two runs; 0 errors, all settled). The output is `/tmp/6g1-sc-T6-scidiff.txt`.

**Counts.** Main-only 94 sentences, branch-only 102, the ★ fields differ in c-2pz and fe-shell (`subshellChips`). The
script's typography auto-class found 0, because every difference here is a changed number or label.
- **(a) typography / format (eV first): 177 sentences** (87 main-only, 90 branch-only). They are energies reprinted eV
  first, in the table's cells, the chips, the MO tooltips and the total energy. Verified by arithmetic, not by eye
  (`/tmp/sc-t6-tools/classify.py`): all 92 Ha values on main's side convert (x 27.2114 eV per Ha) to an eV value on the
  branch's side within the printed precision, and every eV value on the branch's side is one of those 92 (0 stray).
  7 of the 92 are HOMO and LUMO lines that main already printed eV first; their eV forms are present on the branch too
  (checked scene by scene).
- **(b) spec decisions: 19 sentences** (7 main-only, 12 branch-only): the two table headers, the valence labels
  (S3) and the "higher empty levels" label. The table below lists every row, (a) and (b), with its basis.
- **(c) unexplained: 0.** And the ×N marks, which the sweep does not read, were compared separately (the flags above;
  the 7 molecules are all S4).

### (b) Ruled or reviewed changes

| Main | Branch | Count (main / branch) | Basis |
|---|---|---|---|
| "Orbital energies (Ha)" | "Energy (eV)", "Energy (Ha)" (two columns; 37 cells in each now eV, not Ha) | 1 + 37 / 2 + 37 | S2; T1 ruling: the "(Ha)" header keeps its text, its accessible name is "Energy (Ha)" |
| "2s · 2 of 2 e⁻ −0.501 Ha (orbital energy)" (chips) | "2s · 2 of 2 e⁻ −13.6 eV orbital energy"; accessible name and tooltip "2s, 2 of 2 electrons, −13.63 eV (−0.501 Ha) orbital energy (non-relativistic LDA)" | 10 / 20 | S2; T1: 3 s.f. below 1 eV, the chip loses its parentheses |
| "Dotted line: Re = 1.997 a₀ (1.057 Å), E = −0.6026 Ha;" and "Zero: H + H⁺ (−0.5 Ha), the grey line." | "… E = −16.40 eV (−0.6026 Ha);" and "Zero: H + H⁺ (−13.61 eV, −0.5 Ha), the grey line." | 2 / 2 | S2 (H₂⁺ curve note) |
| "1σg: ε = −1.1026 Ha" and the other MO levels (tooltip and Data text), Bonds H₂⁺, He₂, N₂, O₂, CO, HF | "1σg: ε = −30.00 eV (−1.103 Ha)" | 33 / 26 | S1 (tooltips eV first); S2. The 7 lines not listed on the branch side already read eV first on main |
| "Total energy −76.467311 Ha, including −0.000574 Ha of D3(BJ)." (water, NO₂, silane, SF₆, glycine) | "Total energy −2080.78 eV (−76.467311 Ha), including −0.0156 eV (−0.000574 Ha) of D3(BJ)." | 5 / 5 | S2 (total energy and dispersion, Ha at full precision) |
| Fe²⁺ "Valence: 3s² 3p⁶ 3d⁶" and "Valence 3s² 3p⁶ 3d⁶: everything inside is core." | "Valence: 3d⁶ (outside 3s² 3p⁶)" and the same in the sentence; the chip's title "3d⁶ (outside 3s² 3p⁶)" | 2 / 3 | S3; T3 (ff9bc11), T3 re-review |
| Ga³⁺ "Valence: 3s² 3p⁶ 3d¹⁰" (and the sentence) | "Valence: 3d¹⁰ (outside 3s² 3p⁶)" | 2 / 3 | S3 (the spec's own example) |
| Gd³⁺ "Valence: 4f⁷ 5s² 5p⁶" (and the sentence) | "Valence: 5s² 5p⁶ · open 4f⁷" | 2 / 3 | S3 (the spec's own example) |
| — | "≈ higher empty levels" (the second break's label; N₂, CO, CO orbital) | 0 / 1 | S1 (the band), T2 ruling M2: draw the occupied, part-filled and lowest empty levels to scale, fold the rest |

The counts add to 94 main-only and 102 branch-only.

**What the diff did not show, and why.** Fe (neutral) and C, Na⁺: their valence label and Info's plain words are
identical on both sides (no difference listed). Info's plain valence words did not change in any scene, as T3 reported.
The Rₑ line, the tier chips and the valence dot are colour changes (S5), which a text diff cannot see; they are
checked in the shots above. The MO levels' on-screen layout is not text either; it is measured in the table above.

## Step 3 — checklist

| Item | State |
|---|---|
| Step 1 shots | done, 44 in this folder |
| Step 2 science diff, (c) | **0** |
| Review Focus 5 (Rₑ line, light and dark) | pass, measured above |
| Review Focus 1 on screen (He₂ against H₂⁺) | pass: He₂ pair 0.09 eV apart, side by side; H₂⁺ pair 11.8 eV apart (the H₂ comparison is Task 2's test) |
| Review Focus 2 (nothing clipped) | pass: 0 px overflow in 14 measurements; no system shrank (largest 258 px, O₂) |
| Review Focus 4 (valence) | pass: Fe²⁺, Ga³⁺, Gd³⁺ labels match Info's words (shots `atom-*`) |
| Finish review | **pending (controller)** |
| DESIGN.md | **pending (controller)** |

## How it was shot

```
S="node tools/design/shoot.mjs --gl metal --port 5413 --jobs-stub --task sc-T6 --level research --crop .mo-section"
$S --run bd --scenes bonds-h2plus,bonds-he2,bonds-n2,bonds-o2,bonds-co,bonds-hf --themes dark,light --sizes desktop
$S --run bp --scenes (same) --themes dark,light --sizes phone --click Explore
# curve: --scenes bonds-n2-far,bonds-n2 --crop .potential-curve ; tiers: --crop .tier-badge (water, computed-water-structure
#   with --computed-meta) and --crop .bonds-tile (bonds-h2plus)
# atoms: --level advanced --scenes fe-atom,fe2-ion,ga3-ion,gd3-ion ; chips --crop .subshell-panel on fe-shell,fe2-shell3 ;
#   table --scenes fe-atom-table --click Orbitals --crop .orbital-energy-list
# molecules: --scenes no2,silane,sf6 --click "Orbital list" --crop .molecule-orbital-block
# science diff, each side in two runs (A = c-whole … bonds-h2plus, B = bonds-he2 … glycine):
node tools/design/shoot.mjs --root /tmp/sc-main --port 5412 --task sc-T6-main --run a --jobs-stub --gl metal --level research --sweep --scenes $A --themes dark --sizes desktop,phone   # and --run b --scenes $B
node tools/design/shoot.mjs --port 5413 --task sc-T6-br --run a ...                                                                                                                      # and --run b
node tools/design/science_diff.mjs /tmp/6g1-sc-T6-main-merged.json /tmp/6g1-sc-T6-br-merged.json --sizes desktop,phone
```

**Tool changes:** `tools/design/scenes.json` gains `bonds-hf`, `bonds-n2-far`, `fe-atom`, `fe-atom-table`, `fe2-ion`,
`fe2-shell3`, `ga3-ion`, `gd3-ion` and `silane`. The geometry, contrast and ×N measurements were taken with one-off
Playwright scripts (not committed): they read `getBoundingClientRect`, `getComputedStyle` and the Orbital list rows
of all 25 library molecules on both sides.

## Finish-review captures

**Taken 2026-10-30 at head `bcea6e3`** for the Impeccable finish review: `--gl metal --jobs-stub`, own Vite on 5413, stopped
after each run, 0 page errors (the computed-water runs log the same expected `ERR_BLOCKED_BY_CLIENT` lines as above).
Research and dark unless the name says otherwise. Full-viewport means 1440 × 900 or 390 × 844, not scrolled and not cropped,
unless the name says "scrolled".

**1. The four review files in `.impeccable/review/`** (git-ignored folder, added with `-f`), now the Bonds tab, N₂, Research, dark.
The old four showed the owner dashboard (`admin.html`), not Bonds; they are replaced as asked. Framing as before: desktop and
desktop-light 1440 × 900 viewports; `mobile-first-screen.png` the 390 × 844 first screen (canvas, sheet collapsed to its tab bar).
The Bonds phone page does not scroll (document height 844 px, measured), so "full page" is 390 × 844: `mobile.png` is that page with
the Explore sheet open (same picture as `bonds-n2-dark-phone-full.png`), where the old dashboard page was 390 × 1533.
- `.impeccable/review/desktop.png` (dark), `desktop-light.png` (light), `mobile.png`, `mobile-first-screen.png`.

**2. Bonds, desktop (the Molecular orbitals section sits below the fold on purpose: this is what a 1440 × 900 window shows)**
- `bonds-o2-dark-desktop-full.png`, `bonds-n2-dark-desktop-full.png`, `bonds-co-dark-desktop-full.png`, `bonds-n2-light-desktop-full.png`
- `bonds-n2-dark-desktop-basics-full.png` (level Basics)

**3. Bonds, phone (390 × 844, Explore sheet opened with `--click Explore`)**
- `bonds-o2-dark-phone-full.png`, `bonds-n2-dark-phone-full.png`: the sheet's first screen.
- `bonds-o2-dark-phone-full-scrolled.png`, `bonds-n2-dark-phone-full-scrolled.png`: scrolled inside the sheet (`--scroll "≈ core"`, the
  label at the diagram's foot) until the whole MO diagram shows, the sheet's top edge in view.

**4. Molecules provenance ("How this was computed" is open by default at Research; clicking it would close it)**
- `mol-water-provenance-dark-desktop.png`, `mol-water-provenance-dark-phone.png` (Info tab): scrolled to the footer, so the whole
  "Total energy −2080.78 eV (−76.467311 Ha), including −0.0156 eV (−0.000574 Ha) of D3(BJ)." and its wrap are visible.
- `mol-water-computed-provenance-dark-desktop.png`: `computed-water-structure` with `--computed-meta`, showing the total energy and
  "zero-point energy 0.575 eV (0.021134 Ha)". **The committed `computed_water_meta.json` has no `frequencyCheck`**, so the run used a copy
  in `/tmp` with one field added: `frequencyCheck` = minimum, 0 imaginary, `zeroPointEnergyHartree` 0.021134 (the value
  `tests/jobs/provenance_panel.test.tsx` uses). The ZPE number is a layout stand-in, not a computed water value.

**5. Atoms, Fe, phone 390 (Advanced)**
- `atom-fe-subshell-chips-phone.png`: `fe-shell`, Explore sheet scrolled to "Subshells": the shell chips with their dots and the
  whole subshell chip column (3s, 3p, 3d, eV first).
- `atom-fe-energy-table-phone.png`: **not taken.** The Orbital energies table is the Orbitals tab of the desktop Explore panel
  (`AtomExplore`); the phone sheet (Explore, Info, View, Plot) never mounts `.orbital-energy-list`. Checked on `fe-atom`, `fe-shell` and
  an orbital scene, at Advanced and Research, in all four tabs. The phone has only the log-scale energy diagram (shell level).

**6. Atoms, Gd³⁺, light, desktop, Advanced**
- `atom-gd3-ion-light-desktop.png`: "Valence: 5s² 5p⁶ · open 4f⁷", and the N and O shell chips with their dots.

**7. MO tooltip**
- `mo-n2-tooltip-dark-desktop.png`: N₂, Research, the pointer resting on the 3σg level (the diagram scrolled into view, the pointer held
  2.5 s). **Headless Chromium does not draw a native `title` tooltip**, so the shot shows the hover state only. The `title`, read through
  Playwright from `.mo-box`: `3σg: ε = −11.92 eV (−0.438 Ha)`; its accessible name is `3σg orbital, 2 electrons`.

**8. MO diagram, scale reduced to fit (O₂, scan point 00, R = 1.825 a₀, Research, dark)**
- `mo-o2-shrunk-dark-desktop.png`, `mo-o2-shrunk-dark-phone.png`: the `.mo-section` crop (`--crop .mo-section`; the phone with the Explore
  sheet opened by `--click Explore`). Scene `bonds-o2-00` (`#mode=bonds&system=o2&R=1.825`, new in `scenes.json`; R snaps to scan point 00,
  the compressed end of O₂'s scan). Both show the note "scale reduced to fit" under the axis and the adapted ticks (20, 10, 0, −10 … −40 eV:
  the span outgrows 320 px at 5 px per eV, so the whole scale shrinks). 0 page errors. Taken at head `8198852`, own Vite on 5413, stopped.

Scripted with `shoot.mjs` (`--task rc`) except the tooltip, which needed a hover on a control with no accessible name of its own and
a read of `title`: a one-off Playwright script, same Chromium arguments, not committed.

## Final fix wave: chip outline, Ha-first grep

**The science diff cannot catch a Ha-first string that did not change.** `science_diff.mjs` compares what the screen says on this branch
with what it said on main, so an energy that read Ha first on main and still does stays out of the diff. The final review found O₂'s
"0.0478 Ha (1.30 eV)" that way. A grep of the UI strings for "Ha" is part of this check:

```
grep -rnE '\bHa\b|mHa' src --include='*.ts' --include='*.tsx' | grep -vE '^src/(export|jobs)/' | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)'
```

Excluded, as ruled: exports, the CSV and cube columns, and the job progress line (`jobs/format.ts`, the SCF log's Ha). Read each hit:
an energy must read eV first with Ha (or mHa) beside it. Hits that are not an energy in a sentence (a unit of a potential, a force or a
tolerance) are listed below, not changed.

Run on the final-fix head. **Fixed (plain format swaps):** O₂'s triplet–singlet gap (`captions.ts`, now "1.30 eV (0.0478 Ha)"),
He₂'s well depth ("1.06 × 10⁻³ eV, 0.04 mHa"), H₂⁺'s polarisation well ("1.6 × 10⁻³ eV (0.06 mHa)"), H₂⁺'s Dₑ line (through
`totalEnergyText`). **Still Ha-only on screen, not changed:**

- `stark.ts:46`, `info/basic_info.ts:71`: "E = −1/8 Ha" inside the formula F = E²/4 (an exact atomic-unit expression, not a measured energy).
- `info/basic_info.ts:179`: "E = −1/(2n²) Ha", the hydrogenic formula (exact, in atomic units).
- `atom/scf_shared.ts:148,176`, `workers/atomWorker.ts:442`: "not bound by 10⁻⁴ Ha or more", the solver's binding threshold in an error message
  (a tolerance constant, pinned by tests; a swap would restate a convergence criterion in eV).
- `bonds/captions.ts:51`: "solved to 10⁻¹⁰ Ha", H₂⁺'s solver tolerance (same kind).
- `molecules/esp_color.ts`, `info/glossary.ts:91-92`: "Ha/e", the unit of an electrostatic potential, with kcal/mol beside it; not an energy.
- `components/ProvenancePanel.tsx:79`: "Ha/bohr", a force unit (the largest gradient component).
- `components/PotentialCurvePlot.tsx:109-110`: a `'Ha'` branch that is Ha first; no caller passes it (every curve passes 'eV'), so it is unreachable on screen.
- `validation/*.ts`: reference tables with a Ha unit column; nothing in the UI renders them.

**Neutral chip outline (final review I3), measured live** (own Vite on 5413, stopped; Playwright, Chromium 1440 × 900, probe `/tmp/chip-probe-5413.mjs`).
Before the fix the border computed to MUI's grey (rgb(97,97,97) dark, rgb(189,189,189) light). After, with `.MuiChip-root.neutral-chip`, the computed
`border-top-color` is the `--ql-color-border-strong` token in both themes (1 px). Contrast of that border against the surface the chip sits on:

| Theme | Chip | Border | Surface | Border : surface | Label : surface |
|---|---|---|---|---|---|
| dark | H₂⁺ "exact" (`.bonds-tile`) | rgb(43,74,107) | rgb(19,38,59) | 1.68 | 14.14 |
| dark | Library tier (`.tier-badge`) | rgb(43,74,107) | rgb(11,28,45) | 1.88 | 15.87 |
| light | H₂⁺ "exact" (`.bonds-tile`) | rgb(184,196,214) | rgb(227,238,254) | 1.51 | 15.98 |
| light | Library tier (`.tier-badge`) | rgb(184,196,214) | rgb(241,245,250) | 1.61 | 17.10 |

The border is decoration (ruling: non-interactive chip, the label carries the meaning; WCAG 1.4.11 does not ask 3:1 of it). The light H₂⁺
chip, 1.51, is a little under the ruled "~1.6–2.0" band: it sits on the pale-blue `bonds-tile`, not the page card. Recorded, not changed.
