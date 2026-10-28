# Learning levels and Info — live check (plan Task 9)

**Taken 2026-10-27 on branch `design/levels-info`** (head `71f2cd6` plus this task's two fixes). The baseline for the
science diff is `main` at `468ade0`, which is the merge-base. It was built from a clean detached worktree
(`git worktree add --detach /tmp/levels-main 468ade0`, then `npm ci`), and the worktree was removed and pruned afterwards.

## Owner flags for the local test

- **PF5:** the pinned "How this was computed" footer is gone from Molecules. Its content now lives in Info, folded
  below Research and open at Research.
- **The Properties card is trimmed** (ruling, concern 4 of Task 7b). Each number has one home, in Info. The card keeps
  multiplicity, geometry, data tier and the structure table.
- **The phone tier line now appears in Info**, as its last note. On a phone you have to scroll to reach it (item 4).
- **New in this task (no visual change):** a relativity change in Atoms is spoken again by a hidden polite line,
  "Relativity: scalar relativistic", once as the new picture lands (item 6). On a phone the caption under the header is
  now spoken from a hidden copy that says each view once it has settled; the visible caption still shows "loading…".

## Finish review

pending (controller): the `impeccable-finish-reviewer` against the direction contract, its fixes and verdict.

## DESIGN.md

pending (controller): the documenter updates DESIGN.md (levels, Info, the (i), the text bands).

## How it was shot

Every run used its own Vite, branch on 5413 and main on 5412, with `--gl metal --jobs-stub` and headless Chromium.
**/api:** Molecules shots saw 2, stubbed 2 and refused 0. The other modes made no `/api` requests at all.
**Result:** 0 page errors, every shot settled.

```
S="node tools/design/shoot.mjs --gl metal --port 5413 --jobs-stub"
SC=c-whole,c-2pz,fe-shell,basic-3dz2,bonds-n2,bonds-co-orbital,water,glycine
# Step 1 (96 shots)
$S --task lv-research --run r1 --level research --sweep --scenes c-whole,c-2pz,fe-shell,basic-3dz2 --themes dark,light --sizes desktop,tablet,phone
$S --task lv-research --run r2 --level research --sweep --scenes bonds-n2,bonds-co-orbital,water,glycine --themes dark,light --sizes desktop,tablet,phone
$S --task lv-basics --run b1 --level basics --scenes $SC --themes dark,light --sizes desktop,tablet,phone
# Step 2 (science diff, dark, desktop + phone, Research)
node tools/design/shoot.mjs --root /tmp/levels-main --port 5412 --task lv-main --run sci --jobs-stub --gl metal --level research --sweep --scenes $SC --themes dark --sizes desktop,phone
$S --task lv-sci --run sci --level research --sweep --scenes $SC --themes dark --sizes desktop,phone
node tools/design/science_diff.mjs /tmp/6g1-lv-main-sci-metrics.json /tmp/6g1-lv-sci-sci-metrics.json --sizes desktop,phone
# Checklist items
$S --task lv-fix3 --run d --level research --scenes c-whole,c-2pz,fe-shell,bonds-n2,bonds-co-orbital,water,glycine --themes dark,light --sizes desktop   # item 3, after the fix
$S --task lv-explore --run e --level explore --scenes $SC --themes dark --sizes desktop                                   # item 2
$S --task lv-drawer-<explore|research> --run t --level <l> --drawer open --scenes $SC --themes dark --sizes tablet       # item 1
$S --task lv-phoneinfo-<explore|research> --run p --level <l> --click Info --scenes water,glycine,bonds-n2,c-2pz --themes dark --sizes phone   # item 4
$S --task lv-landscape --run l --scenes sf6,water --themes dark,light --sizes phone-landscape                             # item 5 (+ research, dark)
$S --task lv-energy --run e --level research --sweep --scenes water-orbitals,water-esp,basic-stark-n2,bonds-h2plus,na-ion --themes dark --sizes desktop   # item 7
node tools/design/sr_pass.mjs --port 5413 --level research --sizes desktop,phone                                        # item 6 (again after fix round 1)
node tools/design/sr_pass.mjs --root /tmp/levels-main --port 5412 --level research --sizes desktop                      # item 6: did main announce loading?
```

**Tool changes:**

- **`shoot.mjs`:**
  - `--level <l>` writes `eov.level` before the page loads. `main` ignores it.
  - `--sweep` opens every tab and inspector section, plus `main`'s "How this was computed" disclosure. It collects the
    text blocks, titles and aria-labels into `metrics.scienceText`.
  - `metrics.info` records: `heightPx` (the plan's infoHeightPx), the share of the column, `scrolls`, the scrollbar
    width, any "more" cue (mask or shadow), where "How this was computed" sits, whether each fact's (i) wrapped, and
    where the last note sits.
  - `metrics.plotHeaderVisible` checks that the "Plot and data" header is on screen and is the topmost element at its
    centre.
  - `overlaps.caption` measures the phone caption against the scale readout, the key, the toolbar and the hint.
  - The ★ texts are read from Info where their old place is gone: `enclosedNote` comes from the "Iso value" fact, and
    `configuration` from the "Configuration" fact.
- **`scenes.json`:** adds `glycine` and `sf6`.
- **`science_diff.mjs`:** keeps the ★ fields, and adds a "moved, not changed" sentence check over `scienceText`:
  - Every sentence on one side is looked for anywhere in the other side's text for the same scene and size.
  - A sentence found only after the typography rules is reported as (a). Those rules are: subscripts and superscripts
    read flat, U+2212 read as "-", ×10ⁿ read as e-notation, "_" dropped, and no-break or thin spaces read as spaces.
- **`sr_pass.mjs`** (new): the screen-reader pass; `--root` runs another checkout (the `main` check). See item 6.

The full shot set is in `/tmp/6g1-lv-{research,basics}-<scene>-<theme>-<size>.png`; this folder keeps the ones the
items cite. I looked at all 96 Step 1 shots, as one contact sheet per scene and level (`/tmp/lv-sheet-<level>-<scene>.png`).
Nothing was clipped or overlapping, and no control was missing. At Basics, the Plot section, charge, excitation and
relativity are hidden, and each place shows its "appears at …" line.

## Step 3 — Review Focus 4 (1440 × 900, Research, bonds-n2)

| Measure | dark | light |
|---|---|---|
| `plotHeaderVisible` | **true** | **true** |
| Info `heightPx` / column | 368 / 820 px (0.449) | 368 / 820 px (0.449) |
| Info scrolls inside | **true** (scrollHeight 1134 > clientHeight 367) | true |
| "How this was computed" | open, below Info's fold (it scrolls in) | same |

**Verdict:** pass. Shot: `research-bonds-n2-dark-desktop.png`. Every Research desktop scene gives the same 368 px
(0.449) height with `plotHeaderVisible` true. Molecules has no Plot section, so it reads `null` there.

## Live checklist (addendum)

### 1. Medium-width drawer: Info at most 45 % and scrolling inside — **pass**
These were measured at 1024 × 768 with the drawer open (`--drawer open`).

| Level | Scenes | Info / drawer panel | share | scrolls |
|---|---|---|---|---|
| Explore | Atoms, Orbitals, Bonds (6 scenes) | 251 / 557 px | 0.450 | true (263–403 px of content) |
| Explore | water, glycine | 275 / 611 px | 0.450 | true |
| Research | Atoms, Orbitals, Bonds | 251 / 557 px | 0.450 | true (674–1443 px) |
| Research | water, glycine | 275 / 611 px | 0.450 | true |

The share is 0.450 (rounding of 45 %), and no scene grows past it. The accordion headers stay in view below Info.
Shot: `item1-drawer-research-bonds-n2-dark-tablet.png`.

### 2. "How this was computed" cut at Info's edge, at Explore — **recorded: nothing shows there is more**
These were measured at 1440 × 900, Explore, dark. Info's visible bottom is the fold.

| Scene | Info height | scrolls | summary | at the fold |
|---|---|---|---|---|
| c-whole | 304 | no | 332–360 | visible |
| c-2pz | 312 | no | 340–368 | visible |
| fe-shell | 368 (0.449) | yes, 403/367 | 432–460 | **cut** (the fold is at 437) |
| basic-3dz2 | 368 (0.449) | yes, 392/367 | 421–449 | **cut** (the fold is at 437) |
| bonds-n2 | 264 | no | 292–320 | visible |
| bonds-co-orbital | 328 | no | 356–384 | visible |
| water | 368 (0.449) | yes, 611/367 | 640–668 | **below the fold** (203 px down) |
| glycine | 368 (0.449) | yes, 651/367 | 680–708 | **below the fold** |

The only cue is the cut line itself (`item2-explore-basic-3dz2-dark-desktop.png`). The scroller has no mask and no
shadow. It reserves a 15 px gutter (`scrollbar-gutter: stable`), but no thumb is drawn until it scrolls: on macOS that
is overlay scrollbars. In water and glycine at Explore the summary is fully below the fold, so nothing at all says it
exists. At Research it is open and below the fold in every mode, so the same applies to its first line. This is
recorded, not fixed (ruling at ledger line 80).

### 3. A fact's (i) wrapping under a long label — **fixed** (`fix(info)`)
**Before:** at Research on desktop, the (i) sat on the line below its label in five places:
- Atoms "Ionisation energy (C → C⁺)" and "(Fe → Fe⁺)";
- Bonds "E − E(atoms)" and "Orbital energy";
- Molecules "Dipole μ" and "HOMO–LUMO gap".

Before shot: `item3-before-c-2pz-dark-desktop.png`.

**The fix:** in the shared InfoPanel fact layout (`src/info/info.css`), a label that carries an (i) no longer shrinks:

```css
.info-fact:has(> dt .info-button) { flex-wrap: wrap; row-gap: 0; }
.info-fact:has(> dt .info-button) > dt { flex: none; max-width: 100%; }
.info-fact:has(> dt .info-button) > dd { margin-left: auto; }
```

When the value no longer fits beside the label and its (i), the value wraps below and stays right-aligned. Facts
without an (i) keep their old layout.

**After:** re-shot at Research, desktop, dark and light, 7 scenes. `factButtons[].wrapped` is false for every labelled
(i) (14 shots, 0 wrapped). The values that went below their labels are these:
- the IE;
- E − E(atoms);
- the orbital energy;
- the dipole;
- the gap.

The drawer (tablet) and phone show 0 wrapped as well. After shots: `item3-after-c-2pz-dark-desktop.png` and
`item3-after-bonds-co-orbital-dark-desktop.png`.

**Test:** `tests/info/info_panel.test.tsx`, "keeps a fact's (i) beside its label …". It failed before the CSS was
added (the DOM part passed, the CSS rule was missing) and passes after.

### 4. The phone tier line is Molecules Info's last note — **recorded**
These were measured at 390 × 844 with the Info tab open, in the sheet body scroller (406 px visible, bottom at 799).

| Level | Scene | Tier line top / bottom | Below the visible bottom by |
|---|---|---|---|
| Explore | water, glycine | 842 / 882 | 43 px (needs about 83 px of scroll) |
| Research | water, glycine | 886 / 926 | 87 px (needs about 127 px of scroll) |

Shot: `item4-phone-info-water-dark.png`. The note's text is "Library: Curated; geometry from experiment; dipole
checked against published values." No fix was needed (addendum).

### 5. Molecules phone-landscape header (Task 8's grid) — **pass**
These were measured at 844 × 390, in dark and light, at Explore and at Research.

| Scene | Header | Caption | Caption ∩ scale readout | Caption ∩ top bar |
|---|---|---|---|---|
| SF₆ | 440 × 114 (the title wraps the formula onto the tier row) | 263 × 28 at y 94 | 0 | 0 |
| water | 384 × 82 | 177 × 28 at y 62 | 0 | 0 |

The scale readout starts 8 px below the caption in both scenes (SF₆ y 130, water y 98). The caption reads "Sulfur
hexafluoride · electron density" and "Water · electron density". The Research shots are identical. Shots:
`item5-sf6-dark-phone-landscape.png` and `item5-water-light-phone-landscape.png`.

### 6. Screen-reader pass — **done by reading the accessibility side live**; every change is now announced once (`fix(atoms)`, then fix round 1 `fix(a11y)`)
**Why not VoiceOver:** it cannot be driven non-interactively here. Starting it would speak on the owner's machine
and take over input.

**What was done:** `tools/design/sr_pass.mjs` installs a watcher before the page's first script. It logs:
- every text change of every live region (aria-live polite or assertive, role status, alert or log), with its region;
- every focus move, with the focused element's name.

A region inserted together with its text is logged as `region-added`, because screen readers do not reliably read
those. Each mode, at Research on desktop and on phone, is put through these events:
- a selection change;
- an (i) opened, then cleared (desktop: the (i) again; phone, and an (i) inside Info: "Back to …");
- loading and done;
- for Atoms only, a relativity change.

**Logs:**
- `/tmp/levels-sr-research.txt` is the first pass.
- `/tmp/levels-sr-fix1.txt` is the pass after fix round 1; the table is from it.
- `/tmp/levels-sr-main.txt` is `main`, read with `--root`.

**After fix round 1** (the counts are what a reader hears per event):

| Mode · size | Selection | (i) open | (i) clear | Loading and done | Relativity (Atoms) |
|---|---|---|---|---|---|
| Orbitals · desktop | 1: Info "Info: Hydrogen — 3dxy orbital" | 1: focus moves to the heading "Info Orbital" | 1: Info live with the title | n = 4: 1 (the new title); loading silent, as on main | — |
| Atoms · desktop | 1 (Info) | 1 (focus) | 1 (Info) | C → C⁺: 1 ("charge: C⁺"); loading and done silent, as on main | **1:** "Relativity: scalar relativistic", when the picture lands |
| Bonds · desktop | 1 (Info) | 1 (focus) | 1 (Info) | R step: "Loading N₂…" and "N₂ at R = 2.12 a₀ loaded.", 1 each | — |
| Molecules · desktop | 1 (Info, "… — 1b1 orbital") | 1 (focus) | 1: "Back to Water (H2O) — 1b1 orbital" names the way back; focus moves to "Info" | surface change: 1 (Info); loading silent, as on main. **First load: 1** ("Info: Water (H2O) — electron density") | — |
| Orbitals · phone | 1: caption "Hydrogen 3dxy · 90 % enclosed" | 1 (focus) | 1 ("Back to Hydrogen — 3dxy orbital", then focus) | 1 (the caption once settled) | — |
| Atoms · phone | 1 (caption) | 1 (focus) | 1 | C → C⁺: the caption, plus "C⁺" from the charge status (main's status; see below) | **1:** "Relativity: scalar relativistic"; the caption's spoken copy does not change |
| Bonds · phone | 1 (caption "N2 3σg · R = 2.07 a₀") | 1 (focus) | 1 | **R step: 1** (the caption, "N2 3σg · R = 2.12 a₀"); the panel status is not live on a phone | — |
| Molecules · phone | 1 (caption "Water 1b1 (HOMO) · 90 % enclosed") | 1 (focus) | 1 | **First load: 1** ("Water · electron density"); a surface change: 1 | — |

**Before fix round 1** (first pass):
- **Relativity:** a change was unspoken. The first fix made it heard on a phone as the readout twice plus the caption
  twice.
- **Bonds on a phone:** said "done" twice (the status and the caption).
- **Molecules' first load:** said the Info title twice on desktop ("Info: Water", then the real title) and the caption
  four times on a phone ("Molecule · loading…", the molecule, "· loading…", the molecule).

**The fixes:**
- **Relativity** (`fix(atoms)`, ledger line 96, reworked in fix round 1 per lines 190–196): `atomInfo` returns
  `announce: "Relativity: <off | scalar relativistic | with spin–orbit>"`. This is the drawn picture's relativity, in
  the switch's own words, from Advanced.
  - App says it from `<p class="visually-hidden relativity-live" aria-live="polite" aria-atomic="true">`, which is
    mounted for the whole of Atom mode. Info is not mounted in the phone's other tabs or in the folded drawer, which is
    where the switch is.
  - It is said only when the text changes for the same drawn species (`useChangeAnnouncement`, keyed by the profile's
    species). So it is said once, when the new picture lands; a new element's own default is not a change.
  - The readout's numbers stay in Info's technical band. Main said "Solving…" and then "What changed…" (2).
- **Phone caption:** the visible caption is `aria-hidden` and still shows "· loading…" at once. A hidden polite copy
  (`.phone-caption-live`, `useSettledText`) holds the last settled view and never says "loading…", so a load and a
  relativity re-solve are heard once. The name in it uses plain digits ("N2", "H2O"; Task 8 ruling M6).
- **Bonds status:** on a phone the panel's "… loaded." status is not rendered (`announceStatus={!isNarrow}`). The
  caption says the loaded view.
- **Molecules first load:** `moleculeInfo` marks its stand-in (the index name while the meta loads) as
  `provisional`. InfoPanel never announces a provisional title and announces the real one after it once. Replacing one
  molecule with another is also heard once.
- **"Back to …":** its accessible name is "Back to <selection>" with plain digits, e.g. "Back to Water (H2O) —
  electron density". Info's own announcement uses the same plain digits ("Info: N2 — 3σg orbital").

**Desktop loading (ruling line 195):** I checked `main` the same way. `sr_pass.mjs --root /tmp/levels-main`, in a
detached worktree at 468ade0 that was removed afterwards, gave:
- Orbitals n = 4: nothing;
- Atoms C → C⁺: "C⁺" only;
- Molecules surface changes: nothing.

On main too, the canvas busy label is a status region inserted with its text. Main was silent, so loading was left
as it is.

**Tests:** each failed first, then passed.
- `tests/info/info_panel.test.tsx`:
  - "announces a waited-for selection once: never its provisional title, then its real one";
  - "names the way back after the selection, with plain digits".
- `tests/info/molecule_info.test.ts`: the stand-in is `provisional`, a loaded molecule is not.
- `tests/info/atom_info.test.ts`: "gives the drawn picture's relativity as the line to speak, from Advanced".
- `src/App.test.tsx`:
  - "says a relativity change once, when it lands, from an always-mounted line -- also on a phone" (the same element;
    the caption copy unchanged; a new element silent);
  - "has the one spoken line on a desktop too, quiet on first load";
  - the phone caption tests: the spoken copy is polite and never says "loading…";
  - Bonds on a phone has no "… loaded." status.
- `tests/App.molecules.test.tsx`: the spoken copy stays on the drawn molecule while the next one loads.

**What a reader is given (plain digits):**
- "Info: Hydrogen — 3dxy orbital"
- "Info: N2 — 3σg orbital"
- "Info: Water (H2O) — 1b1 orbital"
- "Hydrogen 3dxy · 90 % enclosed"
- "N2 3σg · R = 2.12 a₀"
- "Water 1b1 (HOMO) · 90 % enclosed"

Units keep their typeset form (a₀). The accessible names in the tree match, e.g. buttons "3dz² orbital" and "2pz".

**Still recorded:**
- The charge stepper's own status ("C⁺", from main) speaks beside the phone caption on a charge change.
- Desktop loading is silent, as on main.
- Clearing an (i) by "Back to …" moves focus to the heading "Info". The selection is named by the button the reader
  just pressed.

### 7. Energies still Ha first on screen — **recorded** (input to the science-corrections step)
These come from the Research sweeps: 8 scenes, plus water-orbitals, water-esp, the n = 2 Stark field, H₂⁺ and Na⁺.

- **Atoms, subshell chips** (Explore panel, Advanced+): "2s · 2 of 2 e⁻ −0.501 Ha (orbital energy)", "3d · 6 of 10
  e⁻ −0.295 Ha (orbital energy)". These are the panel energy chips (ledger line 117).
- **Atoms, Data tab table** "Orbital energies (eigenvalues, Ha), non-relativistic LDA": −9.948 Ha, −0.501 Ha,
  −0.199 Ha (C); −254.225 … −0.198 Ha (Fe); −38.005 … −1.343 Ha (Na⁺). Ha only.
- **Bonds, MO diagram buttons:**
  - their accessible names: "2σg (1 of 1), −1.131 Ha, occupation 2" … "3σu* (1 of 1), 0.770 Ha, occupation 0";
  - their tooltips: "3σg: ε = −0.4382 Ha", and the same for CO and H₂⁺.

  Both are Ha only.
- **H₂⁺ curve note:** "Dotted line: Rₑ = 1.997 a₀ (1.057 Å), E = −0.6026 Ha; Dₑ = 2.79 eV (0.1026 Ha) to H + H⁺." The
  E is Ha only. The curve zero reads "Zero: H + H⁺ (−0.5 Ha)".
- **Molecules, "How this was computed":** "Total energy −76.467311 Ha, including −0.000574 Ha of D3(BJ)." Ha only.
- **Formulas, kept as formulas:** Orbitals "E = −1/(2n²) Ha"; Stark "(F = E²/4, E = −1/8 Ha)".
- **Not energies:** the ESP scale "±0.05 Ha/e (±31 kcal/mol)" and the range "−0.051 to +0.068 Ha/e" are potentials.

Everything else reads eV first.

## Step 2 — the science diff against main (Research)

`science_diff.mjs` compares `main` (468ade0) with this branch. Both sides were shot dark, on desktop and phone, at
Research, for the 8 scenes, with `--sweep`.

**The ★ fields:**
- `subshellChips` differs by U+2212 only (a).
- `enclosedNote` reads `null` on main because main's note sits under the folded Display section (R24-3). The branch
  reads Info's "Iso value". The sweep compares the two strings, and they differ only in typography and the added unit
  (a).

**Sentences:** 51 main-only and 118 branch-only. The script also auto-classified 83 + 86 as typography only. Every
sentence is classified below; a sentence shared by several scenes is listed once.

**Counts:** (a) the 169 auto-classified sentences, plus the 6 by-hand cases listed under (a); (b) every other
sentence, in the table, and the three Bonds changes below (first reported as (c), now ruled); **(c) 0**.

### (a) Typography
- **Auto (169):**
  - U+2212 in every energy;
  - "2p_z" → "2pz" in chips, the strip, the breadcrumb and the titles;
  - "R_e"/"D_e" → Rₑ/Dₑ;
  - "|ψ|² = 1.22e-3" → "1.22 × 10⁻³ a₀⁻³", with the unit added (a global constraint: units on every value);
  - "ρ = 2.66e-2" → "2.66 × 10⁻²".

  The script's lists are in `/tmp/lv-scidiff.txt`.
- **By hand: words identical, only punctuation, case or spacing changed as the line became a sentence in Info:**
  - "Valence: 2s² 2p² · everything inside is core" → "Valence 2s² 2p²: everything inside is core." (and Fe's "open 3d
    counts as valence");
  - "cut face shading is scaled to local shell structure" → "Cut face shading is scaled to local shell structure.";
  - "central-field SCF, LDA exchange with VWN correlation, spherically averaged" → capitalised, with a full stop;
  - "Click a subshell to show its orbitals on their own" → with a full stop;
  - main's on-screen "no bound state **fortheir** extra electron" → "for their". Main's JSX dropped the space, and
    the branch's text has it.
  - "dihedral: 0 deg" → "0°" (the 7b review's "degrees shown as °");
  - "angle: 104.5 deg" is folded into the item (b) below.

### (b) Ruled or reviewed changes (ledger = W/progress.md line)
Ledger lines are cited by number. Where the basis is a task review the ledger records as ordered or accepted, that is
said explicitly.

| Main | Branch | Basis |
|---|---|---|
| "Click a ring …, or a shell above, to open it"; "M shell (n=3) only — click it again, or the ✕, …"; "Showing one orbital of 2p — pick another below, or Back …"; "One orbital of 2p — Back steps out one level at a time"; "s/p/d/f lobes you can select below" | "… or a shell chip …"; "Showing the M shell (n=3) only — click its chip again, or the ✕ on the chip, …"; "… pick another of its orbitals, or go back …" (one hint per level); "orbitals you can pick one by one" | Position words: 104 (task-6-review M1) |
| "Ionisation energy (C → C⁺): 11.77 eV ΔSCF, LDA · measured 11.260 eV (NIST) · +4.5 %"; aria "difference from measured" | Panel "Ionisation energy (C → C⁺): 11.77 eV"; Info facts "Ionisation energy (C → C⁺) 11.77 eV", "Measured (NIST) 11.260 eV (calculated +4.5 %)"; ΔSCF in "How this was computed" | Plan Task 6 (IE as a short labelled value; IE vs NIST fact), 99 |
| "−0.199 Ha (eigenvalue, non-relativistic LDA)" | "Orbital energy −5.42 eV (−0.199 Ha)", "… · eigenvalue, non-relativistic LDA" | eV first: 100 |
| — | "4 electrons in the outer shell", "2 electrons in the outer shell and 6 in the open 3d" | Plain valence: plan Task 6, 97 (I2), 115 (N1) |
| — | "Its ionisation energy is ΔSCF LDA with spherically averaged open shells; …" | IE limitation subject: 97 (I3) |
| "radial factor of |ψ|²" (plot caption) | "|R(r)|² is the radial factor of |ψ|²." | Moved with a subject: 92, 97 (the I3 rule) |
| — | "The orbital energy is an eigenvalue of the non-relativistic LDA, not an ionisation energy." | 104 (task-6-review M2) |
| "contour enclosing this fraction of the electron density" (Atoms shell helper) | "Enclosed 90 % of the electron density" fact + the (i) "About Enclosed fraction" | 84 (the Atoms enclosed helper carried to Task 6), plan Task 5 |
| "Pick an axis to slice the orbital open." (no cut) | not shown while no cut is on (every mode) | Reviewed: task-5-review:52 and task-6-review:320 ("an instruction rather than science"); Tasks 5 and 6 complete at 83 and 120 |
| "About this model" (phone heading) | "How this was computed" | Plan Task 6 (About → Info) |
| "energy level (n)", "subshell (l)", "orbital (mₗ)" (aria); phone tab "Orbital & view" | Visible rows "Shell n", "Subshell l", "Orbital mₗ"; tabs "Explore", "Info", "View" | Plan Tasks 4 and 5; 72 |
| — | Orbitals: "A dumbbell with a ring, shaped by its 2 nodes — …", "Nodes 2 (0 radial, 2 angular)", "Energy −1.51 eV (−0.0556 Ha)", "ψ = Rₙₗ(r) Y(θ, φ): …", "Its size grows roughly as n².", "E = −1/(2n²) Ha depends on n alone, …", "Exact one-electron solution, Z = 1: …", "The surface is the contour of constant |ψ|² that encloses 90 % …, by marching cubes." | Plan Task 5 interface (plain with nodes in words; facts; computed "exact one-electron solution, Z = 1"); 81 (fix-round wording); 100 (eV first, formula kept) |
| — | Atoms: "Carbon has 6 electrons in 2 shells.", "The cut face shows them as rings.", "One of the 3 p orbitals of 2p, a dumbbell.", "The M shell (n=3) holds 14 of Iron's 26 electrons: …" | Plan Task 6 interface (per drill level); 104 |
| "E = −109.38074 Ha, CCSD(T)/aug-cc-pVTZ (frozen core)" (and CO's) | "Total energy −2976.40 eV (−109.38074 Ha)" + "Energies: CCSD(T)/aug-cc-pVTZ (frozen core)." | 131, 100 |
| "Molecular orbitals (lowest energy at the bottom)" | "Molecular orbitals" + (i) (the glossary says "lowest energy at the bottom") | Plan Task 7 ("heading stays short") |
| "Bond order 3." | "Bond order 3" fact | 137 (task-7a-review M5) |
| "Bond order 3 — counted from the valence orbitals' bonding/antibonding character; g/u labels don't apply …" | Fact + "Counted from the valence orbitals' bonding or antibonding character; g/u labels do not apply …" | 137 (task-7a-review M5 wording) |
| "HOMO 3σg (ε = −0.438 Ha) · LUMO 1πg* (ε = −0.033 Ha)" (and CO's) | "Frontier orbitals — HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · …"; Data "Kohn–Sham orbital energies — …" | 100/131 (eV first); 137 (7a I3 Kohn–Sham qualifier, M8 lead) |
| "methods" (aria of main's Data captions) | gone; the captions are in "How this was computed" | Plan Task 7 |
| — | "N₂ has 14 electrons; … all its occupied orbitals together." | Density lead: 158 (7b M6, both modes) |
| — | CO 5σ: "5σ is a σ orbital of CO.", "It is symmetric around the bond axis.", "It holds 2 electrons.", "It is the HOMO: the highest level that holds electrons."; facts "−10.9 eV (−0.401 Ha)", "Orbital energy −10.50 eV (−0.386 Ha)", "90 % of the orbital's |ψ|²" | Plan Task 7 (bondsInfo); 123/134 (reviewed); 137 (M10) |
| "N₂ · R = 2.07 a₀", "CO · R = 2.13 a₀" (phone header) | Captions "N₂ electron density · R = 2.07 a₀", "CO 5σ · R = 2.13 a₀" | Phone captions: Task 8, 166–181 |
| Other phone captions | "Carbon · electron density", "Carbon 2pz · 90 % enclosed", "Iron M shell · 90 % enclosed", "Hydrogen 3dz² · 90 % enclosed", "Water · electron density" | Task 8; 172 |
| "Geometry: experiment (CCCBDB). Density, potential and orbitals: B3LYP-D3(BJ)/def2-TZVPD (PySCF)."; "geometry: experiment (CCCBDB) · sticks show connectivity, not bond order"; glycine's "Geometry: B3LYP-D3(BJ)/def2-TZVP optimised …" | Geometry in the Properties row once; "Method: B3LYP-D3(BJ)/def2-TZVPD, PySCF 2.8.0."; "Sticks show connectivity, not bond order." | Experimental geometry stated once: 153, 154, 158 (7b I1, I6) |
| "bond: 0.958 Å — experiment (CCCBDB); geometry from experiment (not a test of the method)", "angle: 104.5 deg — …" | "O–H 0.958 Å, H–O–H 104.5°: the experimental geometry itself, so no test of the method" | 158 (7b I1) |
| "Checked against" | "Checked against published values:" | 158 (7b I2; the header follows the tier rule) |
| "How this was computed→" (pinned link) | Info's "How this was computed" | PF5 (32) |
| "Formula" (Properties row) | gone (the title has it) | 154 |
| "μ = 1.86 D (B3LYP-D3(BJ)/def2-TZVPD) · experiment 1.855 D" (and glycine's) | "Dipole μ 1.86 D computed · 1.855 D experiment (CRC Handbook, via CCCBDB)" | 154 (one home, Info); reviewed: task-7b-review M4 quotes this string. The method is stated in "How this was computed" |
| "0.314 Ha (8.55 eV)", "0.253 Ha (6.88 eV)" | "8.55 eV (0.314 Ha)", "6.88 eV (0.253 Ha)" | 100 |
| "Kohn–Sham orbital gap — neither the optical gap …" | "The HOMO–LUMO gap is a Kohn–Sham orbital gap — …" + "Orbital energies here are Kohn–Sham eigenvalues, not ionisation energies." | Plan Task 7 (Kohn–Sham caveat once); 153 (audit: kept, once); the 97 rule (a subject) |
| — | "The surface is a contour of constant density ρ, at the value that encloses the chosen fraction of the electrons." | 153 (7b audit: the isoNote → the technical contour sentence) |
| — | "Library: Curated; geometry from experiment; …" (phone, Info) | Phone tier line: 155 |
| — | Titles "Carbon — whole atom", "Iron — M shell", "N₂ — total electron density", "CO — 5σ orbital", "Water (H₂O) — electron density", "Glycine (NH₂CH₂COOH) — electron density"; fact labels (Configuration, Enclosed, Iso value, Bond length R, E − E(atoms), Total energy, Orbital energy, Nodes, Energy, Dipole μ, Measured (NIST)); "Info"; (i) names "About …" | Plan Task 4 (Info, InfoButton aria-label) and Tasks 5–7 (titles, facts) |

### (b) The three Bonds changes ruled after the first report (ledger lines 185–189)
The first report listed these three as (c) unexplained. Each is described in the Task 7a report, and the controller
then ruled them (retroactive ruling, ledger lines 185–189).

1. **The density sentence lost its method tag.** "Total electron density **(B3LYP/def2-TZVP)**, surface at ρ = 0.002
   e/a₀³, …" became "Total electron density, surface at ρ = 0.002 e/a₀³, …".
   - Ruled at line 186: the tag left the plain band because the method is stated in "How this was computed".
   - Checked live: N₂'s "How this was computed" reads "Orbitals and density: B3LYP/def2-TZVP; orbital energies are
     B3LYP/def2-TZVP Kohn–Sham eigenvalues — not ionisation energies." This is for the finish review to confirm.
2. **The curve's zero gained words.** "Zero: N ⁴S + N ⁴S, UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core)." became
   "**Plot: E − E(separated atoms), in eV.** Zero: …, **the grey line**." CO's is the same. Ruled at line 187: the
   addition follows eV first.
3. **The fixed-ρ note gained a clause.** "… chosen with the ρ buttons beside the orbitals — not at an enclosed
   fraction." became "… chosen with the ρ buttons — not at an enclosed fraction, **so Electron enclosed does not apply
   to it**."
   - Dropping "beside the orbitals" is the position-word rule (104).
   - The clause is ruled at line 188: it is the enclosed helper's move.

**An observation for the science read (new text, not a diff):** Bonds' plain lead says "the HOMO: the highest **level**
that holds electrons". Molecules was changed to "the highest **orbital** that holds electrons" in 7b (I3: "use
'orbital', not 'level'").
