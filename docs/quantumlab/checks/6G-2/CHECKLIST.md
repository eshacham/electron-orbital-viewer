# 6G-2 live visual check — final (Task 17)

**Taken 2026-10-23 at commit `133d7d1`** (branch `design/quantumlab-6g2`; the head after Task 16d, review
approved). Compared with `main` at `72c8112`. This record covers Phase 6G-2: Orbitals (Basic), Bonds and
Molecules re-composed, the strips for all modes, and the work done after the plan was written (R24, T10-core,
T12–T16d).

**Fixed after the first run** (2026-10-23, commits `bd2446c`..`edc5e44` on `509c79a`): the four fails of the first
run are fixed, three in the app and one in the check. The affected scenes and sizes were re-shot under
`--task 6g2-final-fix*` (52 shots, all opened); see "Fixed after the first run" below. Every fail cell now reads pass
with the new numbers. No text could change (CSS placement, a list's opening scroll, a sample point), so the science
diff was not re-run.

**Scenes** (`tools/design/scenes.json`; the new ones were added in this task, with their ids and state keys
taken from `src/bonds/bonds_url.ts` and the live `molecules/v3` index and metas):

- Main set (12 scenes × dark, light × desktop 1440×900, tablet 1024×768, phone 390×844 = **72 shots**):
  - `basic-3dz2` (H 3d_z²), `basic-n4` (H 4d_xz)
  - `bonds-n2` (N₂ density), `bonds-n2-sg` (N₂ 3σg, `state=mo:restricted:3σg:0`), `bonds-co`
  - `water`, `water-orbitals` (`show=mo:4` = 1b1, the HOMO), `water-esp`, `benzene`
  - `c2h2-deep` (`id=c2h2&show=mo:5&struct=space`; index 5 = 1πu, the HOMO)
  - `c-2pz-cut`, `c-whole`
- Extras (dark + light, desktop only = **22 shots**):
  - Glycine first view (`molecule-complex`, 16d item 2).
  - B₂ 3σu* α at equilibrium (`bonds-b2-3su-alpha`, `state=mo:alpha:3σu*:0`; it opens on scan point 07, R = 3.00 a₀).
  - Li₂ 2σg at 99 % (`bonds-li2-2sg-99`, `…&frac=0.99`).
  - Pa configuration (`pa-whole`, `#mode=atom&Z=91&level=atom`, for T18).
  - Water with on-model labels (`--display '{"moleculeLabels":true}'`).
  - Water strip (`--crop .thumbnail-strip`).
  - NO₂ on its SOMO (`--click Orbitals`).
  - The Advanced appearance block open (`--click Display --click "Advanced appearance" --scroll "Reset to default" --crop .inspector`).
  - The request workspace (`--owner-session --preview-fixture preview_ok --click "Request a new molecule" --type water --click Preview`). It stops at the quote and sends no job.

Every run uses `--gl metal --jobs-stub`, its own Vite on 5411 (main: 5412) and its own headless Chromium.
**Molecules shots:** `api seen 2, stubbed 2, notStubbed 0` (the workspace shot: 3 / 3 / 0). **Other modes:**
0 `/api` requests. Vite's `/api` proxy points at the dead port 9, so nothing can reach a job server or AWS.

**Commands:**
```
S="node tools/design/shoot.mjs --gl metal --port 5411 --jobs-stub"
$S --task 6g2-final --run final1a --scenes basic-3dz2,basic-n4,bonds-n2,bonds-n2-sg,bonds-co,water --themes dark,light --sizes desktop,tablet,phone
$S --task 6g2-final --run final1b --scenes water-orbitals,water-esp,benzene,c2h2-deep,c-2pz-cut,c-whole --themes dark,light --sizes desktop,tablet,phone
# 6 shots hit a CDN timeout through Vite's /molecules proxy (ETIMEDOUT -> 500) and were retaken (runs retake1, retake2);
# /tmp/6g1-6g2-final-final1-metrics.json is final1a+final1b with the retakes substituted (72 shots, 0 errors).
$S --task 6g2-final-x --run x --scenes molecule-complex,bonds-b2-3su-alpha,bonds-li2-2sg-99,pa-whole --themes dark,light --sizes desktop
$S --task 6g2-final-pa --run pa-dark|pa-light --wait 240000 --scenes pa-whole --themes dark|light --sizes desktop   # Pa's ΔSCF line needs the full solve
$S --task 6g2-final-labels --run labels --scenes water --display '{"moleculeLabels":true}' --themes dark,light --sizes desktop
$S --task 6g2-final-strip --run strip --scenes water --crop .thumbnail-strip --themes dark,light --sizes desktop
$S --task 6g2-final-no2 --run no2 --scenes no2 --click Orbitals --themes dark,light --sizes desktop
$S --task 6g2-final-adv-scroll --run advs --scenes water --click Display --click "Advanced appearance" --scroll "Reset to default" --crop .inspector --themes dark,light --sizes desktop
$S --task 6g2-final-ws --run ws --scenes water --owner-session --preview-fixture preview_ok --click "Request a new molecule" --type water --click Preview --themes dark,light --sizes desktop
$S --task 6g2-final-hint --run hint --wait 240000 --scenes c-whole,c-2pz-cut,pa-whole --themes dark --sizes desktop,tablet,phone   # scale bar vs first-view hint
# after the fixes (bd2446c..edc5e44): only the affected scenes and sizes
$S --task 6g2-final-fix --run hint --scenes c-whole,c-2pz-cut --themes dark,light --sizes desktop,tablet,phone          # Fail 1
$S --task 6g2-final-fix-pa --run pa-<theme>-<size> --wait 240000 --scenes pa-whole --themes dark|light --sizes …       # Fail 1: dark desktop/tablet/phone, light desktop; one shot per run
$S --task 6g2-final-fix --run tablet1 --scenes basic-3dz2,basic-n4,bonds-n2,bonds-n2-sg,bonds-co,water --themes dark,light --sizes tablet   # Fail 3
$S --task 6g2-final-fix --run tablet2 --scenes water-orbitals,water-esp,benzene,c2h2-deep --themes dark,light --sizes tablet               # Fails 2, 3
$S --task 6g2-final-fix --run mo --scenes water-orbitals --themes dark,light --sizes desktop,phone                     # Fail 2
$S --task 6g2-final-fix-disp --run disp --click Display --scenes <the same 12> --themes dark --sizes desktop             # Fail 4
# science diff
git worktree add --detach /tmp/6g2-main 72c8112 && (cd /tmp/6g2-main && npm ci --silent)   # npm ci, not a symlink
node tools/design/shoot.mjs --root /tmp/6g2-main --task 6g2-main --run final1 --gl metal --port 5412 --jobs-stub \
  --scenes basic-3dz2,basic-n4,bonds-n2,bonds-n2-sg,bonds-co,water,water-orbitals,water-esp,benzene,c2h2-deep,c-2pz-cut,c-whole --themes dark --sizes desktop
$S --task 6g2-final-disp --run disp2 --click Display --scenes <the same 12> --themes dark --sizes desktop   # see "science_diff" below
node tools/design/science_diff.mjs /tmp/6g1-6g2-main-final1-metrics.json /tmp/6g1-6g2-final-science-metrics.json
git worktree remove /tmp/6g2-main --force
```

**Tool changes made for this record:**
- `shoot.mjs`:
  - **Enclosed-note read.** Under ruling R24-3 the inspector opens its content section, so Display, which holds
    the enclosed-fraction note, is folded at load. The load-time read therefore returns `null`. When that
    happens, the tool now keeps the note that `collectMetrics` reads after the scripted steps (`--click Display`).
  - **Two new boxes.** `.scale-readout` and `.first-view-hint` are now measured, for the overlap finding below.
  - **After the fixes (`edc5e44`):** the `overlaps` metric (`hint` against every overlay zone, `strip` against the
    drawer bar), `orbitalGapNote.hiddenPx`, and a `dx` offset for sample points (the `controls card` moved to
    `x 1, dx 8`).
- `composite.mjs`: a `--label` option. The default is "6G-1 build", so the 6G-1 composites can still be
  reproduced. These composites are labelled "6G-2 build".
- `concept_crops.json`: two new crops on `original-concepts`:
  - `cinematic` (Option 3, `{12, 510, 866, 475}`, the box the plan gave)
  - `cinematic-strip` (its tile row, `{252, 876, 608, 96}`)

## What changed since 6G-1 (visible below)

- **Orbitals (Basic)** (P2–P4): the n chips, then the subshell chips, then the orbital chips, and each chip draws
  when picked. Then the Combination select. The strip shows every orbital of n, grouped by subshell.
- **Bonds** (T9–T10, R23e): the system card with its bond type and bond order, a grouped Molecule select, the
  R slider, the energy line, a Total density | One orbital switch, ρ chips, and an MO level diagram with arrows
  and an "≈ core" divider. The strip holds the density and every orbital. Ruling T16c widened the main-view box
  so that diffuse orbitals are drawn whole.
- **Molecules** (T12–T16d, P1 single column):
  - **Explore:** header tile with "Change", the Quick pick row (5 tiles), the Density | ESP | Orbitals | None
    switch, Selection, "Request a new molecule", and the pinned "How this was computed".
  - **Inspector sections** (R24-3, one open at a time): Display, and Properties, which includes a Structure list.
  - **Strip:** "Hide views", with Ball and stick, Space filling, Electron density, ESP, HOMO/SOMO, LUMO, LVMO and
    All orbitals.
  - **Other:** on-model lengths and angles (T14), the request workspace in the viewport cell (P12/T16), and
    Advanced appearance at the foot of Display (T16b/16d). The first view is framed about the molecule's own
    centre (16d item 2). An open shell opens on its SOMO (T15-M2).
- **Atoms** (T3–T5): the valence rule (P14), the measured IE with a signed difference and a limitation note
  (P15), subshell chips with the energy wrapped onto its own line (P16), and a one-time "Drag to rotate · pick a
  shell to explore" hint (P17).
- **Everywhere:**
  - Opacity defaults to 0.9 (R24-1).
  - Glow uses the owner's R24-2c values: no white wash.
  - Inspector sections are titled accordions (R24-3).
  - The key column shows "Orbital tiles ψ > 0 / ψ < 0" whenever the strip shows phase-coloured tiles
    (T16-tilekey).

## Notes that apply throughout

1. **`controls card` (`#controls`) reads `missing` on every desktop and tablet shot of the main set (48/48).**
   - **Why:** under R24-3 the inspector opens its content section (Plot and data, or Properties), and Display,
     which holds `#controls`, is folded. This is the designed resting state, not a missing component.
   - **Display opened** (`--click Display`, 12 scenes, dark desktop): **12/12 read #071828, ΔE₀₀ 0** against
     `surface-1` (run `6g2-final-fix-disp`). In the first run 2/12 (`water-esp`, `c2h2-deep`) read #3e4d5c, ΔE₀₀
     16.98: the sample point (x 0.97, y 0.5 of `#controls`) landed on the Surface toggle's border. The point now
     sits on the card surface (Fixed after the first run, item 4).
2. **Two errors were retaken, no app errors.** Six first-pass shots logged `500` for `/molecules/v3/...`.
   Vite's proxy to the CDN timed out (ETIMEDOUT, network). All six were retaken clean. The final record has
   **0 errors on all 94 shots**, `settled=true` and `webglCanvases=1` everywhere.
3. **A "Share link" tooltip shows in every tablet shot.** It is a capture artefact. The tool opens the folded
   drawer to read state, then clicks the open bar button to fold it again. That leaves the pointer over the
   toolbar's Share link button. It is not app state at rest.
4. **Known pre-existing issues** (not fails of 6G-2; separate tickets):
   - The second-row core orbitals of H₂S, PH₃, SF₆ (1a1g) and SO₂ fail with "Could not resolve this surface"
     at every fraction (90/95/99 %), on 997032f and HEAD.
   - The cut plane and slider are measured from the origin. On off-centre molecules (5 library molecules, off by
     1–8 a₀) a "half" cut is not through the turning point, which 16d item 2 moved to the molecule's centre.
5. **Spacing is the same in every scene.**
   - **Desktop:** top bar 1440×56; Explore 315 at x=12; inspector 290 at x=1138; canvas 787×820 at (339,68);
     gutters 12 on every side.
   - **Tablet:** Explore 300; the inspector folded to a 41 px drawer bar at x=971 (main: 46 at x=966); canvas
     688×688. The strip is 620 wide at x=336 and ends at x=956, 15 px clear of the bar (ruling DB3, as the key
     column and toolbar).
   - **Phone:** `.phone-topbar` 390×52; `.phone-header` 374×44 at (8,60) in every mode except Basic, which has
     none (as in 6G-1).
   - **Tolerance:** 0 px off in every scene. The per-scene rows give only what differs.
6. **Typography.** Every probe reads Inter Variable. The title is 20/600 and the body 13/400. Nav is 14/500,
   except Basic's 14/600: that is the active tab's own emphasis, accepted in 6G-1. Caption is 12/600 where the
   key column has a heading ("Orbital tiles"), 12/400 for c-whole's cut-face caption, and `null` where nothing
   caption-sized is on screen (checked by eye). The phone has no desktop title/nav/body probes, by design.

## Results by scene

Rows are sizes; both themes are folded in. **Colours:**
- **Desktop/tablet:** 7/8 samples read ΔE₀₀ 0, and `controls card` is missing (note 1).
- **Phone:** 3/3 samples read ΔE₀₀ 0.
- The canvas samples are ΔE₀₀ 0, on vs off.

### basic-3dz2 (H 3d_z², Orbitals mode)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 ΔE₀₀ 0, note 1 | pass — key 73×64 at (1041,650); strip 763×154 at (351,722) | pass — "Hydrogen — 3d_z² orbital" 20/600; nav 14/600 (note 6); caption null | pass — n / subshell / orbital chips, Combination select, ψ key, D(r) plot, 9 tiles drawn (3s…3d_x²−y²) under 3s/3p/3d group labels; composite beside Option 2 | pass — `\|ψ\|² = 1.30e-5`, phaseKey identical to main, webgl 1, errors 0 |
| tablet | pass — 7/8 | pass — key 73×64 at (883,518); strip 620×154 at (336,590), clear of the drawer bar | pass | pass — strip scrolled to the selection | pass |
| phone | pass — 3/3 | pass — key 121×30 at (257,114) | n/a; caption null | pass — "Orbital & view" / "Plot" sheet tabs | pass |

### basic-n4 (H 4d_xz)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — as basic-3dz2 | pass — "Hydrogen — 4d_xz orbital" | pass — n = 4 chips with 4s/4p/4d/4f; strip 11 tiles drawn (4p_x…4f_yz², scrolled) | pass — `\|ψ\|² = 2.41e-6`, identical to main |
| tablet | pass — 7/8 | pass | pass | pass — 9 tiles drawn in view | pass |
| phone | pass — 3/3 | pass — key 121×30 | n/a | pass | pass |

### bonds-n2 (N₂ total density)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — key 220×152 at (894,578), density key and "Orbital tiles" key stacked; strip 763×138 | pass — "N₂ — Nitrogen"; caption 12/600 | pass — system card "triple bond, order 3", grouped select, R slider, energy line, Total density \| One orbital, ρ chips, MO diagram with "≈ core", E-vs-R plot; strip of the density plus 8 orbitals; composite beside Deep Space | pass — "ρ = 0.002 e/a₀³, total electron density"; plotLegend `["N₂","separated atoms"]`; R = 2.07 a₀ (1.098 Å); identical to main |
| tablet | pass — 7/8 | pass — key 220×152 at (736,446); strip 620×138 at (336,606), 0 px under the bar | pass | pass — strip clear of the drawer bar (fixed, item 3) | pass |
| phone | pass — 3/3 | pass — key 220×50 at (158,114) | n/a | pass — header "N₂ · R = 2.07 a₀" | pass |

### bonds-n2-sg (N₂ 3σg)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — key 73×64 at (1041,666) | pass — caption null | pass — One orbital selected, the 3σg level framed, 3σg tile selected, ψ key | pass — "N₂ 3σg, R = 2.07 a₀ (1.098 Å), 90% contour"; `\|ψ\|² = 1.76e-3` identical to main |
| tablet | pass — 7/8 | pass — strip clear of the bar | pass | pass (item 3 fixed, as bonds-n2) | pass |
| phone | pass — 3/3 | pass — key 121×30 | n/a | pass | pass |

### bonds-co (CO total density)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — as bonds-n2 | pass | pass — "Polar bonds (heteronuclear)", 5σ/1π/4σ…, 1σ/2σ tiles whole (T10-core) | pass — plotLegend `["CO","separated atoms"]`; identical to main |
| tablet | pass — 7/8 | pass — strip clear of the bar | pass | pass (item 3 fixed) | pass |
| phone | pass — 3/3 | pass — key 220×50 | n/a | pass | pass |

### water (H₂O density)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — key 187×122 at (927,592), "Orbital tiles" key plus the hover caption; strip 763×154 at (351,722) | pass — "Water (H₂O)"; caption 12/600 | pass — header tile and Change, Quick pick (Water selected), 4-way switch, Selection, "Request a new molecule", pinned footer, Properties open, Structure "2 bonds · 1 angle"; 7 tiles; composite beside Molecule Builder | pass — "ρ = 2.66e-2 e/a₀³" identical to main; errors 0 (stubbed) |
| tablet | pass — 7/8 | pass — key 187×122 at (769,460); strip 620×154, 0 px under the bar | pass | pass — the strip ends clear of the drawer bar; "All orbitals" is reached by scrolling the strip (fixed, item 3) | pass |
| phone | pass — 3/3 | pass — no key column (no strip and no mapped colour at rest) | n/a | pass — "Water · H₂O ▾" + Library chip; Explore / View tabs | pass |

### water-orbitals (H₂O 1b1, HOMO)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — key 187×100 at (927,614) | pass | pass — the Kohn–Sham gap note is whole under the MO-list key: `orbitalGapNote.hiddenPx` 0, note top 420 = key bottom 420 (fixed, item 2; first run: its first line was clipped); the rest pass (1b1 row selected, HOMO tile selected); composite beside Cinematic | pass — "MO 1b1 (HOMO), −0.324 Ha (−8.83 eV)"; `\|ψ\|² = 2.32e-3` identical to main |
| tablet | pass — 7/8 | pass — strip clear of the bar | pass | pass — the gap note is whole: `hiddenPx` 0, note top 475 = key bottom 475 (fixed, item 2; first run: its whole first line was hidden) | pass |
| phone | pass — 3/3 | pass — key 121×30 | n/a | pass | pass |

### water-esp (H₂O ESP)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 (with Display open: controls card ΔE₀₀ 0; first run 16.98, a probe fault, fixed in item 4) | pass — key 220×174 at (894,540), ESP bar plus tiles key | pass | pass — −0.05 / 0 / +0.05 Ha/e bar with ⓘ; ESP tile selected; red–blue map, rim not whitened (T15-b) | pass — "Fixed at ρ = 0.001 e/a₀³ — …" identical to main |
| tablet | pass — 7/8 | pass — key 220×174 at (736,408); strip clear of the bar | pass | pass (item 3 fixed) | pass |
| phone | pass — 3/3 | pass — key 220×44 | n/a | pass — ESP bar on the phone | pass |

### benzene (density)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — as water | pass | pass — 6 tiles; Structure "12 bonds"; oblique ball-and-stick tile (16d) | pass — "ρ = 2.77e-2 e/a₀³" identical to main |
| tablet | pass — 7/8 | pass — strip clear of the bar | pass | pass (item 3 fixed) | pass |
| phone | pass — 3/3 | pass | n/a | pass | pass |

### c2h2-deep (C₂H₂ 1πu, space filling)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 (with Display open: controls card ΔE₀₀ 0; first run 16.98, a probe fault, fixed in item 4) | pass — key 139×100 at (975,614) | pass | pass — the deep link restores Orbitals, 1πu HOMO (×2) and space filling. The vdW spheres hide most of the HOMO; this is expected (T13-M note under Structure). Hover caption "Hover or tap an atom" (T13-I4) | pass — `\|ψ\|² = 1.23e-3` identical to main |
| tablet | pass — 7/8 | pass — strip clear of the bar | pass | pass (item 3 fixed) | pass |
| phone | pass — 3/3 | pass — key 121×30 | n/a | pass | pass |

### c-2pz-cut (Carbon 2p_z, cut x:0.5)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — key 73×64 at (1041,650); strip 763×154; first-view hint 268×42 at (359,615), 8 px above the scale readout (359,665) on its left edge, 0 overlap with every zone | pass | pass — the cut face is turned toward the camera (P17/T5); subshell chips wrap the energy (P16); the IE line reads "measured 11.260 eV (NIST) · +4.5 %" (P15) | pass, with one explained difference — subshellChips lost the " · " before the energy (P16, see science_diff); `\|ψ\|² = 1.22e-3` identical |
| tablet | pass — 7/8 | pass — hint (344,483) 8 px above the scale readout (344,533), 0 overlap; strip clear of the bar | pass | pass | pass |
| phone | pass — 3/3 | pass | n/a | pass | pass |

### c-whole (Carbon, whole atom)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 7/8 | pass — key 202×102 at (912,628); hint (359,631) 8 px above the scale readout (359,681), 0 overlap | pass — caption 12/400 | pass — "Valence: 2s² 2p² · everything inside is core"; Whole atom / K / L ring tiles | pass — configuration `1s² 2s² 2p²`, plotLegend `["n=1","n=2 valence"]` identical to main |
| tablet | pass — 7/8 | pass — hint (344,499) 8 px above the scale readout (344,549), 0 overlap (fixed, item 1; first run 37 × 42 px); strip clear of the bar | pass | pass | pass |
| phone | pass — 3/3 | pass — key 220×74 | n/a; caption 12/400 | pass | pass |

### Extras (desktop, dark + light)

| shot | result |
|---|---|
| Glycine first view (16d item 2) | **pass.** The density fills about 190 px wide at the 5 a₀ scale (6G-1: about 133 px at 10 a₀). Structure: "9 bonds · 1 angle". |
| B₂ 3σu* α, R = 3.00 a₀ (equilibrium, 16c) | **pass.** Whole and closed, with no flat holes on the axis. The two thin rings are real \|ψ\|² regions (ruling T16c-rings). Title: "B₂ 3σu* (α), R = 3.00 a₀ (1.590 Å), 90% contour". |
| Li₂ 2σg at 99 % (16c) | **pass.** One closed surface at a 10 a₀ scale, not cut by the box. Title: "Li₂ 2σg, R = 5.05 a₀ (2.673 Å), 99% contour". |
| Pa configuration (for T18) | **pass** (re-shot after item 1, dark and light). Valence: "5f² 6d¹ 7s² · open 5f and 6d count as valence" (P14). The IE line reads "7.38 eV ΔSCF, LDA · measured 5.890 eV (NIST) · **+25.2 %**" plus the limitation note (P15); +25.2 % is the live value (7.376 vs 5.890 eV). The hint (359,631) sits 8 px above the scale readout (359,681) 143×49, with 0 overlap (first run: 10 × 42 px). Shells O/P/Q are marked valence; there are 7 ring tiles. |
| Water with labels (T14) | **pass.** Labels `["0.958 Å","0.958 Å","104.5°"]` with the angle arc and no overlap message. Insets are identical with labels on and off: `{top 134, right 199, bottom 166, left 0}` (R23f-3). |
| Water strip | **pass.** "Hide views", then 8 tiles: Ball and stick, Space filling, Electron density (selected), ESP, HOMO, LUMO, LVMO, All orbitals. Labels wrap to two lines, nothing is clipped, and the structure tiles are shaded (T15-a). |
| NO₂ SOMO (T15-M2) | **pass.** Title "MO 6a1 (SOMO), −0.230 Ha (−6.25 eV)"; the 6a1 ↑ row is selected over 4b2 HOMO; the SOMO tile is selected; "SOMO–LUMO gap 0.136 Ha (3.70 eV)"; multiplicity "2 (doublet)". |
| Advanced appearance (16b/16d) | **pass.** **Dark** has 7 rows at R24-2c's values: Edge strength 0.75, Edge sharpness 3.0, Brightness 0.11, Halo 0.10, Mesh lines 0.020, Mesh line whiteness 0.20, Edge whiteness (density and lobes) 0.51. **Light** has 5 rows: 1.00, 1.5, 0.21, 0.060, 0.12, with no halo and no edge whiteness. Reset to default is disabled at the defaults. |
| Request workspace (P12/T16) | **pass.** The workspace is 433×820 at (339,68), and `insets.left` = 433. The title is "Preview — H₂O / resolved structure, not yet computed". The preview ball-and-stick sits to the right of the workspace; the strip and tier line are hidden; PNG is disabled. Quote lines: 4 × 400 px, none clipped, `workspaceOverflow` []. **API:** `seen 3`, `stubbed 3`, `refused 0`, `notStubbed 0`; no job sent. |

## Fixed after the first run

The first run (`509c79a`) reported four fails. Each is fixed, tested and pinned by a `shoot.mjs` metric, then re-shot
(runs `6g2-final-fix`, `6g2-final-fix-pa`, `6g2-final-fix-disp`; 52 shots, all `settled`, `webglCanvases` 1, 0 errors,
0 non-stubbed `/api`).

1. **The first-view hint overlapped the scale readout** (new in 6G-2, P17): c-whole tablet 37 × 42 px, Pa desktop
   10 × 42 px, Pa tablet 54 × 42 px. **Fix (`bd2446c`):** on a desktop or tablet the hint stacks 8 px above the scale
   readout on its left edge. It reads the readout's own offset and measured height, as Molecules' label hint does
   (T14 M7). `useViewInsets` now publishes `--free-right`, so the hint stops short of the key column and folded
   drawer and wraps rather than running under them. While the canvas is busy it also clears the busy chip (D10).
   The phone keeps its spot above the sheet. **Metric:** `overlaps.hint` measures the hint against the scale readout,
   key column, strip, toolbar, title, drawer bar, busy chip, phone top bar, header and sheet. It reads 0 for every
   zone in all 16 hint shots.

   | scene | size | scale readout (x,y,w×h) | hint (x,y,w×h) | overlap (was) |
   |---|---|---|---|---|
   | c-whole | desktop | (359,681) 121×49 | (359,631) 268×42 | 0 (none) |
   | c-whole | tablet | (344,549) 98×49 | (344,499) 268×42 | **0** (37 × 42) |
   | c-2pz-cut | desktop / tablet | (359,665) 114×49 / (344,533) 95×49 | (359,615) / (344,483) 268×42 | 0 (none) |
   | pa-whole | desktop | (359,681) 143×49 | (359,631) 268×42 | **0** (10 × 42) |
   | pa-whole | tablet | (344,549) 115×49 | (344,499) 268×42 | **0** (54 × 42) |
   | all three | phone | (12,112) | (61,745) | 0 (none) |

   Both themes for c-whole and c-2pz-cut, and dark plus light desktop for Pa, give the same boxes.
2. **The MO-list key covered the Kohn–Sham gap note** in water's Orbitals view (desktop: first line clipped; tablet:
   first line hidden; desktop pre-existing on main). **Fix (`0e0be89`):** the list still opens with the HOMO
   centred, unless that would put the gap note under the sticky key. Then the note's top sits at the key's bottom
   edge, with the HOMO right under it. **Metric:** `orbitalGapNote.hiddenPx`, the note's height under the key or
   past the list's foot. It reads **0** on desktop (note top 420 = key bottom 420) and tablet (475 = 475), both
   themes. c2h2-deep's tablet shot was already clear and is unchanged (note 426, key 415). The composite
   `water-orbitals-dark-desktop.png` was regenerated from the new shot.
3. **On tablet the strip ran 29 px under the folded drawer bar** (pre-existing; 34 px on main). **Fix (`53635c3`):**
   the strip joins ruling DB3's medium-width rule, `right: calc(var(--ql-size-inspector-bar) + 12px)`, with the
   toolbar and key column. **Metric:** `overlaps.strip` (the strip against `.inspector-drawer .inspector-bar`)
   reads **0** in all 24 tablet shots. The strip is now 336–956 against the bar at 971–1012. A strip longer than
   that ends at its own scroll edge, not under the bar; the last tile is reached by scrolling, as before.
4. **The `controls card` colour sample read ΔE₀₀ 16.98** with Display open (`water-esp`, `c2h2-deep`). This was a
   check fault. **Fix (`edc5e44`, tool only):** `#controls` has no chrome of its own in the docked panels, so the
   sample no longer reads a point inside it, where a full-width toggle's border can sit. It reads the panel
   surface 8 px past its right edge (`x 1, dx 8`; `dx` is a new CSS-px offset in `sample_points.json`). **Result:**
   **12/12 read #071828, ΔE₀₀ 0** with Display open. No other colour sample changed.

**Seen in the re-shoot, not one of the four (pre-existing, unchanged from the first run's Pa phone shot):** on a
phone, Pa's key column (seven shells) runs past the screen's right edge. "n=5 valence" is cut at the edge, and the
n=6 and n=7 entries and the cut-face caption are not visible in the 220×106 box. Left for a separate decision.

## Composites

`node tools/design/composite.mjs --label "6G-2 build" --shot <shot> --sheet <sheet> --crop <crop> --out docs/quantumlab/checks/6G-2/<name>.png`.
All six were opened and checked: the right scene and theme beside the right crop, with nothing clipped.

| file | shot | concept crop |
|---|---|---|
| `water-dark-desktop.png` | water, dark, desktop | theme-comparison `molecule-builder` |
| `water-orbitals-dark-desktop.png` | water-orbitals, dark, desktop | original-concepts `cinematic` (Option 3) |
| `water-labels-dark-desktop.png` | water with labels, dark, desktop | original-concepts `cinematic` (its 104.5° / 0.958 Å labels) |
| `basic-3dz2-light-desktop.png` | basic-3dz2, light, desktop | original-concepts `light-clean` (Option 2, its chips row) |
| `bonds-n2-dark-desktop.png` | bonds-n2, dark, desktop | theme-comparison `deep-space` |
| `water-strip-dark-desktop.png` | the `.thumbnail-strip` crop, water, dark | original-concepts `cinematic-strip` (Option 3's tile row) |

Total size of the six PNGs: **11 MB** (6G-1's 14: 21 MB).

## science_diff result

The main checkout was `npm ci`'d in a detached worktree at `/tmp/6g2-main` (72c8112; not symlinked: its
`node_modules` must match its own lockfile). The worktree was removed after the run.

**Raw diff** (`/tmp/6g1-6g2-main-final1-metrics.json` vs `/tmp/6g1-6g2-final-final1-metrics.json`):
13 differences.
- **12 are `enclosedNote` null on the branch.** This is not a science change: R24-3 folds Display at load,
  so the note is not in the DOM when the tool reads it.
- **Re-shot with Display open** (`--click Display`, run `disp2`): the full enclosed-select text
  ("Electron enclosed90%…note") is **identical to main for all 12 scenes**. Opening Display folds "Plot and
  data" (one section at a time), so that run's `plotLegend` is empty.
- **Merged record:** `/tmp/6g1-6g2-final-science-metrics.json` combines the two passes: `enclosedNote` from
  the Display-open pass and every other field from the default-view pass.

```
$ node tools/design/science_diff.mjs /tmp/6g1-6g2-main-final1-metrics.json /tmp/6g1-6g2-final-science-metrics.json
c-2pz-cut subshellChips
  main:   ["2s · 2 of 2 e⁻ · -0.501 Ha (orbital energy)","2p · 2 of 6 e⁻ · -0.199 Ha (orbital energy)"]
  6G-1:   ["2s · 2 of 2 e⁻-0.501 Ha (orbital energy)","2p · 2 of 6 e⁻-0.199 Ha (orbital energy)"]
1 difference(s): each must be explained in CHECKLIST.md or fixed
```
(The tool still labels the branch column "6G-1".)

**The one difference is ruling P16.** The subshell chip drops its " · " before the energy, which now wraps
onto its own line (`SubshellPanel.tsx`, e6d63f6). The line break is the separator. The numbers, labels and
units are unchanged.

**Text outside science_diff's five fields,** compared too:
- **Titles:** identical for all 12 scenes.
- **Key column:** the only differences are additions.
  - "Orbital tilesψ > 0ψ < 0" in `bonds-n2`, `bonds-co`, `water`, `water-esp` and `benzene` (T16-tilekey:
    the strip's tiles are phase-coloured).
  - `c2h2-deep`'s hover caption reads "Hover or tap an atom", not "… or bond", under space filling (T13-I4).

**Not in these scenes:** P14's valence-line changes for d/f-block elements and P15's measured/percent lines
apply to none of the 12 scenes, apart from C's unchanged valence line. They are shown live in the Pa extra.

## Summary

- **Shots:** 94 in total (72 main set + 22 extras).
- **Health:** every shot is `settled=true` with `webglCanvases=1` and 0 errors (after six CDN-timeout retakes).
- **Stub:** 0 non-stubbed `/api` requests.
- **UI colours:** every sample matches its token exactly (ΔE₀₀ 0). The `controls card` reads `missing` at rest
  (note 1) and ΔE₀₀ 0 in 12/12 with Display open.
- **Layout:** every structural box is exact for its layout.
- **Science:** text identical to `main` @ 72c8112 except the one P16 separator.

**No open fails.** The first run's four fails are fixed (see "Fixed after the first run"):
1. The first-view hint now stacks above the scale readout, with 0 overlap. It was 37 px (c-whole tablet),
   10 px (Pa desktop) and 54 px (Pa tablet).
2. The Kohn–Sham gap note is whole under the MO-list key (`hiddenPx` 0), desktop and tablet.
3. The tablet strip clears the drawer bar: 0 overlap, was 29 px.
4. The `controls card` sample reads the card surface: ΔE₀₀ 0 in 12/12 Display-open scenes.

The two known pre-existing issues (second-row core "Could not resolve", and the cut plane measured from the
origin) are listed in note 4 and are not 6G-2 fails.
