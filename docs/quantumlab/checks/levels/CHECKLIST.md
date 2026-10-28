# Learning levels and Info — live check (plan Task 9)

**Taken 2026-10-27 on branch `design/levels-info`**, in three rounds:
- **Task 9:** Step 1, Step 3 and items 1–7, on head `71f2cd6` plus Task 9's three commits (`614a840`, `bbd71a0`,
  `41272c3`) and its fix round (`874143d`);
- **Task 9b:** the finish fixes (`ec1edbe`, `d8406c8`);
- **Task 9c:** the last fix round, and Step 2's science diff re-run over 20 scenes after every text change (see "Last
  fix round").

The baseline for the science diff is `main` at `468ade0`, which is the merge-base. Each time, it was built from a clean
detached worktree (`git worktree add --detach /tmp/levels-main 468ade0`, then `npm ci`). The worktree was removed and
pruned afterwards.

## Owner flags for the local test

- **PF5:** the pinned "How this was computed" footer is gone from Molecules. Its content now lives in Info, folded
  below Research and open at Research.
- **The Properties card is trimmed** (ruling, concern 4 of Task 7b). Each number has one home, in Info. The card keeps
  multiplicity, geometry, data tier and the structure table.
- **The phone tier line now appears in Info**, as its last note. On a phone you have to scroll to reach it (item 4).
- **New in this task (no visual change):** a relativity change in Atoms is spoken again by a hidden polite line,
  "Relativity: scalar relativistic", once as the new picture lands (item 6). On a phone the caption under the header is
  now spoken from a hidden copy. It says each view once the canvas is no longer waiting for it; the visible caption
  still shows "loading…".
- **The dipole arrow at Basics** (Task 9c ruling). It is still drawn at Basics. The Display section's line says so,
  "Showing the dipole arrow — Display controls appear at Explore", and Info gives the arrow's convention whenever it is
  drawn (`fix9c-dipole-held-basics-water-dark-desktop.png`). **In that shot the arrow itself cannot be seen: it is not
  distinguishable inside water's 90 % density in a headless render** (task-9c-report.md, concern 2). To see it on your
  own test, lower the Display opacity (or raise the enclosed fraction) until the surface is translucent enough to show
  the arrow from O toward the midpoint of the two O–H bonds. Please confirm on a real GPU that the arrow is visible at
  Basics; if it reads wrong, the fallback is to hide the arrow at Basics.
- **Info has no Configuration fact** (Task 9c ruling). The panel's configuration line, which labels the drill-down, is
  its one home at every level. The finish reviewer's verdict pass noted no capture after round 2 showed this on
  screen; `finish-atoms-research-facts-dark-desktop.png` (Atoms, Research, carbon, whole atom; task 9 cleanup) now
  shows the default facts with no Configuration row: Valence, Ionisation energy, Measured (NIST), Relativity and
  Enclosed only.
- **VoiceOver spot check** (Task 9 review M7; task-9c-review.md M1). `sr_pass.mjs` cannot tell whether a status region
  inserted together with its text is read, because that depends on the screen reader and browser. It counts such
  regions apart, as "uncertain", and also cannot tell whether an `aria-describedby` description is spoken, since
  VoiceOver speaks a description as a delayed hint rather than logging it as an attribute read. With VoiceOver, please
  check:
  - in Atoms on a desktop, a relativity change, e.g. carbon Off → Scalar: the busy label "Solving … (scalar-
    relativistic)…" is inserted with its text; then "Relativity: scalar relativistic";
  - in Atoms on a desktop, a charge step: "C⁺";
  - **in Molecules on a phone**, opening the Explore tab: the readout "Tap an atom or bond for angles and lengths" is
    inserted with its text (the second "uncertain" region; levels-sr-9c.txt);
  - **after pressing "Back to …"**, whether the heading's description is spoken once focus lands on "Info" (I3) — the
    heading's accessible name stays "Info", but it is described by the selection's title (e.g. "Water (H2O) — 1b1
    orbital") via `aria-describedby`.

  Then check that each is heard once.

## Finish review

pending (controller): the `impeccable-finish-reviewer` against the direction contract, its fixes and verdict.

## Finish fixes

Task 9b applies the finish review's eight material fixes (`.impeccable/critique/2026-10-27-levels-finish.md`,
disposition fix). Shot on this branch's own Vite on 5413, `--gl metal --jobs-stub`, 1440 × 900 desktop and 390 × 844
phone. Every shot settled with 0 page errors. Molecules saw 2 `/api` requests, both stubbed.

**Before and after** (dark, desktop):

| View | Before | After |
|---|---|---|
| Molecules Basics, water: Info | `finish-before-basics-water-dark-desktop.png` | `finish-after-basics-water-dark-desktop.png` |
| Orbitals Explore, 3dz²: the lead | `finish-before-explore-basic-3dz2-dark-desktop.png` | `finish-after-explore-basic-3dz2-dark-desktop.png` |
| Bonds Research, N₂: the canvas | `finish-before-research-bonds-n2-dark-desktop.png` | `finish-after-research-bonds-n2-dark-desktop.png` |
| Atoms Research, carbon 2pz: the panel | `finish-before-research-c-2pz-dark-desktop.png` | `finish-after-research-c-2pz-dark-desktop.png` |

What changed in them:
- **Molecules Basics:** Info has no point group, the dipole reads "1.86 D", and (in this shot) the arrow's convention
  is gone. Info now fits without scrolling. The subtitle reads "electron density · 90 % enclosed", with no e-notation ρ
  and no repeat of the title. **Task 9c reverses this:** the convention now shows at Basics too, whenever the arrow is
  drawn; see "Last fix round" and the dipole owner flag above.
- **Orbitals Explore:** the lead is 3 lines, and "How this was computed" is above the fold (before, it was cut).
- **Bonds Research:** the subtitle is "electron density", with no R and no ρ. The canvas key and Info hold those, and
  the R slider keeps its readout. "Total energy" stays on one line, and its value drops below it whole.
- **Atoms Research:** no ionisation-energy line in the panel. The (i)s sit beside "Shells" and "Subshells", not at
  the panel's edge. The subtitle is "|ψ|² isosurface · LDA, non-relativistic".

**The pressed (i) and its topic chip** (owner amendment). Two modes, both themes, desktop and phone:
- Atoms, Shells (i):
  - desktop: `finish-pressed-atoms-c-whole-{dark,light}-desktop.png`;
  - phone: `finish-pressed-atoms-chip-c-whole-{dark,light}-phone.png` shows the Info tab with the chip, and
    `finish-pressed-atoms-i-c-whole-{dark,light}-phone.png` shows the Explore tab with the pressed (i).
- Molecules, the ESP key's (i): `finish-pressed-esp-water-esp-{dark,light}-{desktop,phone}.png`. On the phone, the
  pressed (i) on the canvas key and the chip in the Info tab are in one shot.
- In dark, the pressed (i) wears the cyan halo (`--ql-shadow-selected-halo`). Task 9c made it the strip tile's soft
  glow; see "Last fix round". In light, it is the solid accent with no glow.
- **Re-shot (task 9 cleanup):** the finish reviewer's verdict pass flagged that two of these dark, phone shots
  predated Task 9c's glow and still showed the 9b hard ring: `finish-pressed-atoms-i-c-whole-dark-phone.png`
  (`--click Explore --click "About Shell" --click Explore`, level explore, scene c-whole) and
  `finish-pressed-esp-water-esp-dark-phone.png` (`--click "About Electrostatic potential"`, level explore, scene
  water-esp), both `--port 5413 --gl metal --jobs-stub --sizes phone`. Both are replaced under the same names and now
  show the soft glow. The light phone shots already showed the correct solid accent and were left as they were.

**The scroll cue** (a tonal 24 px bottom fade, only while more is below):
- **Showing:** `finish-cue-on-bonds-n2-{dark,light}-desktop-crop.png` (Research, N₂) and
  `finish-cue-phone-bonds-n2-dark-phone.png` (the phone sheet's Info tab). metrics.info.moreBelow is true, and the
  mask is `linear-gradient(<text colour> calc(100% − 24px), transparent)`. Task 9c keeps Info's last pixel opaque, so
  the hairline under it stays (see "Last fix round").
- **Not showing:** `finish-cue-off-water-{dark,light}-desktop-crop.png` (Basics, water: Info fits). moreBelow is
  false and the mask is `none`.

**Measured** (`tools/design/shoot.mjs`, new metrics `info.leadLines`, `info.factLabelLines` and `info.moreBelow`):
- **Leads:** 1–3 lines at Basics and Explore in every scene swept: c-whole, c-2pz, fe-shell, na-ion, pa-whole,
  basic-3dz2, basic-n4, bonds-n2, bonds-co-orbital, bonds-n2-sg, bonds-n2-1pu, bonds-h2plus, bonds-o2, water,
  water-esp, water-orbitals, core-water, c2h2-deep, benzene, glycine and no2. Before, they were 8–9 (Orbitals), 6
  (H₂⁺), 7 (ESP) and 4 (Bonds MO, C₂H₂ HOMO).
- **Fact labels:** every one is 1 line at Research, desktop and phone, in bonds-n2, bonds-h2plus, c-2pz, pa-whole,
  na-ion, water, water-orbitals, water-esp and no2. No fact (i) wrapped under its label.
  - Task 9b review I2: under `nowrap` that count was 1 by construction, and a long label (Br⁻'s) ran out of its row.
  - Task 9c lets a label wrap only when it alone cannot fit, and measures overflow (see "Last fix round").
- **Review Focus 4:** Info's share stays 0.449.

## Last fix round (Task 9c)

The Task 9 and Task 9b reviews' findings and the controller's 9c rulings (W/task-9c-brief.md). Shot on this branch's
own Vite on 5413 with `--gl metal --jobs-stub`. Every shot settled with 0 page errors.

**What changed on screen:**
- **The hairline under Info stays while the scroll cue shows** (9b review I1). The mask now keeps Info's last pixel
  opaque: `linear-gradient(<text colour> calc(100% − 25px), transparent calc(100% − 1px), <text colour> calc(100% −
  1px))`. The phone sheet has no border, so it still fades to its edge. See
  `fix9c-cue-hairline-bonds-n2-{dark,light}-desktop-crop.png`, Research N₂: moreBelow is true and the rule above
  "Display" is drawn.
- **A fact label fits its row** (9b review I2, M3).
  - The label is `width: max-content; max-width: 100%` with no minimum width, so it wraps only when it alone cannot fit.
  - The new metric `metrics.info.overflow` reports the scroller's horizontal overflow and every fact row whose label or
    value runs past it.
  - Br⁻ at Advanced: the overflow is 0, with no rows past their edge, on desktop
    (`fix9c-br-anion-advanced-dark-desktop.png`), in the drawer (`…-dark-tablet.png`) and on a phone
    (`…-dark-phone.png`). "Ionisation energy (= electron affinity of Br)" takes 2 lines on desktop and in the drawer,
    and 1 on a phone; its value goes below it.
  - "Valence 8 electrons in the outer shell" fits on one line again, and the ring's "(+5 %)" keeps its "%".
- **The pressed (i) among resting ones, in dark** (9b review M7, ruling): the strip tile's soft glow.
  `fix9c-pressed-among-resting-c-2pz-dark-desktop.png` shows Atoms at Research with Subshells (i) pressed and the topic
  chip "Subshell" in Info. Shells (i) and Relativity (i) are at rest.
- **"‹ Back to …" wraps from the left**, with the chevron held to "Back" (`fix9c-back-wrap-water-esp-light-desktop.png`:
  "‹ Back to Water (H₂O) — electrostatic potential" on two lines).
- **The dipole at Basics** (rulings): `fix9c-dipole-held-basics-water-dark-desktop.png`. The Display line reads
  "Showing the dipole arrow — Display controls appear at Explore", and Info shows the convention. The experiment shows
  from Advanced and its citation from Research.
- **Text:**
  - "The density is all the occupied orbitals together: …" is a technical sentence in Molecules and Bonds (9b I3).
  - "These orbital energies are Kohn–Sham eigenvalues …" (M1).
  - The cut-face note follows the facts at every level (M2).
  - Exports write ×10ⁿ (M4).
  - An Atoms subshell's subtitle says "electron cloud" (M5).
  - Subtitles are lower case (M8).
  - Info drops the Configuration fact (M10).
  - Step 2 classifies every sentence.
- **Screen reader** (9 review I1–I3): see item 6, "After Task 9c".

**Commands:**
```
S="node tools/design/shoot.mjs --gl metal --port 5413 --jobs-stub"
$S --task lv9c-br --run d --level advanced --scenes br-anion --themes dark --sizes desktop
$S --task lv9c-br-drawer --run t --level advanced --drawer open --scenes br-anion --themes dark --sizes tablet
$S --task lv9c-br-phone --run p --level advanced --click Info --scenes br-anion --themes dark --sizes phone
$S --task lv9c-cue --run c --level research --crop .inspector --scenes bonds-n2 --themes dark,light --sizes desktop
$S --task lv9c-pressed --run p --level research --click "About Subshell" --scenes c-2pz --themes dark --sizes desktop
$S --task lv9c-back --run b --level research --click "About Electrostatic potential" --scenes water-esp --themes light,dark --sizes desktop
$S --task lv9c-dipole --run b2 --level basics --scenes water --themes dark --sizes desktop
node tools/design/sr_pass.mjs --port 5413 --level research --sizes desktop,phone --out /tmp/levels-sr-9c.json   # item 6
# Step 2 (science diff), main from a detached worktree at 468ade0, each side in two runs:
A=c-whole,c-2pz,fe-shell,basic-3dz2,bonds-n2,bonds-co-orbital,water,glycine
B=basic-stark-n2,basic-field-n1,basic-sp3,bonds-h2plus,bonds-he2,water-esp,water-orbitals,au-6s-orbital,au-6s-off-orbital,pb-6p12-orbital,na-ion,cl-anion
node tools/design/shoot.mjs --root /tmp/levels-main --port 5412 --task lv9c-main --run a --jobs-stub --gl metal --level research --sweep --scenes $A --themes dark --sizes desktop,phone   # and --run b --scenes $B
$S --task lv9c-sci --run a --level research --sweep --scenes $A --themes dark --sizes desktop,phone                                                                                       # and --run b --scenes $B
node tools/design/science_diff.mjs /tmp/lv9c-main-metrics.json /tmp/lv9c-sci-metrics.json --sizes desktop,phone   # each side's a and b runs merged
```

**Tool changes:**
- `shoot.mjs` gains `metrics.info.overflow`.
- `scenes.json` gains `basic-field-n1`, `basic-sp3`, `bonds-he2`, `au-6s-off-orbital` and `br-anion`.
- `science_diff.mjs` (Task 9 review M9) parses `--sizes` by name and no longer exports `flat` from a script that runs on
  import.
- `sr_pass.mjs` (M6, M7):
  - one argument helper;
  - a per-event tally: "told" counts live text and the page's own focus moves, and "uncertain" counts regions inserted
    with their text;
  - a focus move logs the element's description.

## DESIGN.md

pending (controller): the documenter updates DESIGN.md (levels, Info, the (i), the text bands). Task 9b adds one
token, `--ql-shadow-selected-halo`. Task 9c (ruling) gives it the strip tile's soft glow:
- Deep Space: `0 0 12px 1px rgba(31,182,245,.5)`, the same value as `--ql-shadow-selected-tile`;
- Light Clean: `none`.

It belongs in DESIGN.md's Shadow Vocabulary (task-9b-review.md:181, M7).

## How it was shot

These are Task 9's runs. Task 9c's are listed under "Last fix round", and Step 2 now reports the 9c re-run.

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
# Step 2, first run (science diff, dark, desktop + phone, Research; superseded by Task 9c's 20-scene run)
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
relativity are hidden, and each place shows its "appears at …" line. Two Step 1 shots are kept as examples, and both
predate Task 9b's finish fixes:
- `basics-water-dark-desktop.png`: Basics, with the Plot section hidden and the pointer lines;
- `research-water-light-phone.png`: Research on a phone, in light.

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

### 6. Screen-reader pass — **done by reading the accessibility side live**; every change is now announced once (`fix(atoms)`, fix round 1 `fix(a11y)`, then Task 9c `fix(a11y)`)
**Why not VoiceOver:** it cannot be driven non-interactively here. Starting it would speak on the owner's machine
and take over input.

**What was done:** `tools/design/sr_pass.mjs` installs a watcher before the page's first script. It logs:
- every text change of every live region (aria-live polite or assertive, role status, alert or log), with its region;
- every focus move, with the focused element's name.

A region inserted together with its text is logged as `region-added`. Task 9 review M7 asked whether the tool counts
it correctly. **It cannot**: whether such a region is read depends on the screen reader and browser (VoiceOver often
reads an inserted `role="status"`; NVDA with Chrome often does not).
- Since Task 9c, each event's tally keeps these apart as **uncertain**, never folded into the count of what is told.
- The owner's local test spot-checks them with VoiceOver (see "Owner flags").
- The tables count only what is told: live text and the page's own focus moves.

Each mode, at Research on desktop and on phone, is put through these events:
- a selection change;
- an (i) opened, then cleared (desktop: the (i) again; phone, and an (i) inside Info: "Back to …");
- loading and done;
- for Atoms only, a relativity change.

**Logs:**
- `/tmp/levels-sr-research.txt` is the first pass.
- `/tmp/levels-sr-fix1.txt` is the pass after fix round 1; the table below is from it.
- `/tmp/levels-sr-9c.txt` (and `.json`, with each event's tally) is the pass after Task 9c.
- `/tmp/levels-sr-main.txt` is `main`, read with `--root`.

**After Task 9c** (`/tmp/levels-sr-9c.txt`; "told" per event):
- **Every event is told once in all four modes, on desktop and on phone.** The one exception is Bonds' desktop R step,
  which tells two things, "Loading N₂…" and then "… loaded.", as before.
- **Uncertain** (inserted with their text, from main):
  - Atoms desktop, relativity: the busy label "Solving Carbon ion C⁺ (scalar-relativistic)…";
  - Molecules phone, on opening the Explore tab: the readout "Tap an atom or bond for angles and lengths".
- **Charge on a phone (9 review I2):** C → C⁺ is told once, by the caption "Carbon ion C⁺ · electron density". The
  stepper's status region is not rendered on a phone (`SpeciesControls announceStatus={!isNarrow}`), and its value stays
  visible. On a desktop it is still the status "C⁺", once.
- **Back (9 review I3):** pressing "Back to Water (H2O) — 1b1 orbital" moves focus to the heading. The heading is now
  described by the selection: the log reads `h2 "Info (described: Water (H2O) — 1b1 orbital)"`. This holds in every
  mode on a phone and in Molecules on a desktop. The heading's name stays "Info", and its description (plain digits)
  is the title, while no topic is open.
- **Relativity (9 review I1):**
  - The line is emptied when the species changes, or when there is nothing to say. An emptied region says nothing.
  - So Scalar on carbon after Scalar on gold is a real change of text, and is heard: the App test "says Scalar on
    carbon after Scalar on gold: a new element starts its line afresh".
  - Nothing stale is left for a virtual cursor: after argon is drawn, the line is empty, where it used to read "with
    spin–orbit".

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
- **Phone caption:** the visible caption is `aria-hidden` and still shows "· loading…" at once.
  - A hidden polite copy (`.phone-caption-live`, `useSettledText`) holds the last caption that is not waiting for its
    view, and never says "loading…". So a load and a relativity re-solve are heard once.
  - The name in it uses plain digits ("N2", "H2O"; Task 8 ruling M6).
  - Task 9 review M3: "not waiting" is now asked of `captionIsLoading` (view_title.ts), not matched on the words. It
    means the canvas's busy label is down. In the short debounce before the label goes up, a new selection's caption is
    said just before its picture is drawn. That is still once.
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
- Desktop loading is silent, as on main.
- Fixed in Task 9c: the phone's charge status, which spoke beside the caption (I2). Also fixed: Back landing on a
  heading that said only "Info" (I3). Its description now names the selection.

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

`science_diff.mjs` compares `main` (468ade0, the merge-base) with this branch. **Task 9c re-ran it last**, after every
text change of the last fix round (head `e8189de`, the fix commits of this round). Both sides were shot dark, on desktop
and phone, at Research, with `--sweep`, over 20 scenes:
- the 8 Step 1 scenes (Task 9b changed their on-screen text): c-whole, c-2pz, fe-shell, basic-3dz2, bonds-n2,
  bonds-co-orbital, water, glycine;
- the scenes where the addendum's ruled changes live (Task 9 review I4): basic-stark-n2, bonds-h2plus, water-esp,
  water-orbitals, au-6s-orbital, pb-6p12-orbital, na-ion, cl-anion;
- four new ones in `scenes.json`: `basic-field-n1` (the field, n = 1), `basic-sp3` (a hybrid), `bonds-he2` and
  `au-6s-off-orbital` (Au with relativity off).

Every shot settled with 0 page errors (40 per side). The raw output is `/tmp/lv9c-scidiff.txt`; the merged metrics are
`/tmp/lv9c-main-metrics.json` and `/tmp/lv9c-sci-metrics.json`.

**The ★ fields** (dark desktop):
- `subshellChips` differs by U+2212 only, in c-2pz, fe-shell, au-6s-orbital, au-6s-off-orbital and pb-6p12-orbital: (a).
- `enclosedNote` is `null` on main in 10 scenes, because main's note sits under the folded Display section (R24-3). The
  branch reads Info's "Iso value" fact, e.g. "|ψ|² = 1.22 × 10⁻³ a₀⁻³". That is (b): the enclosed helper moved into
  Info (task-5-review.md:53-54), with ×10ⁿ and the unit the iso value now carries (ledger 74).

**Sentences:** 127 main-only and 248 branch-only. The script also auto-classified 183 + 179 as typography only.
Every sentence is classified below. A sentence shared by several scenes is listed once.

**Counts:**
- **(a):** 354 auto-classified sentences, plus 10 main-only and 12 branch-only by hand (listed under (a)). The 8
  main-side auto entries "|ψ|² = 1.22e-3" and the like are not counted here: they gained a unit, so they are (b) (Task 9
  review M1).
- **(b):** 112 main-only and 232 branch-only, plus those 8. Each is in the table, or in the three Bonds changes below.
- **(c): 0 after fix round 1.** The first classification found 9 lines in 3 findings (5 main-only, 4 branch-only).
  The controller ruled on all three (ledger 231–233). Fix round 1 then fixed two of them and re-ran the diff for the
  four scenes involved. See "(c) and fix round 1" below.
  - Net change: the 3 combination iso values are now found on the branch with their unit. The script lists them as
    auto-(a), and they are (b) here, like the other 8.
  - The 4 ΔSCF lines are gone.
  - The 2 Cl⁻ cut lines are (b) by ruling.

### (a) Typography
- **Auto (354):**
  - U+2212 in every energy;
  - "2p_z" → "2pz" in chips, the strip, the breadcrumb and the titles;
  - "R_e"/"D_e" → Rₑ/Dₑ;
  - "ρ = 2.66e-2" → "2.66 × 10⁻²";
  - "C2v" → "C₂ᵥ" in the labels sentence.

  The script's lists are in `/tmp/lv9c-scidiff.txt`. I read both lists: nothing in them is more than these rules.
- **By hand: words identical; only punctuation, case or spacing changed as the line became a sentence in Info:**
  - "Valence: 2s² 2p² · everything inside is core" → "Valence 2s² 2p²: everything inside is core." The same holds for
    Fe ("open 3d counts as valence"), Au, Pb, Na⁺ and Cl⁻.
  - "cut face shading is scaled to local shell structure" → "Cut face shading is scaled to local shell structure.";
  - "central-field SCF, LDA exchange with VWN correlation, spherically averaged" → capitalised, with a full stop. The
    scalar-relativistic (Au) and Dirac (Pb) method statements are the same.
  - main's on-screen "no bound state **fortheir** extra electron" → "for their". Main's JSX dropped the space, and
    the branch's text has it.
  - H₂⁺'s "E = E_el + 1/R." → "E = E(el) + 1/R.":
    - this is the shared caption string, which is plain Unicode (src/bonds/captions.ts:22-23, ledger 178);
    - Unicode has no subscript l, so "el" is written in parentheses rather than with a "_".

### (b) Ruled or reviewed changes
Each row cites the ruling's ledger line (W/progress.md), or the review finding as file:line, or the plan's interface.
(Task 9 review M2: dispatch lines are no longer cited; the finding they carried is.)

| Main | Branch | Basis |
|---|---|---|
| "Click a ring …, or a shell above, to open it"; "M shell (n=3) only — click it again, or the ✕, …"; "Showing one orbital of 2p — pick another below, or Back …"; "One orbital of 2p — Back steps out one level at a time" (and 6s, 6p½); "s/p/d/f lobes you can select below" | "… or a shell chip …"; "Showing the M shell (n=3) only — click its chip again, or the ✕ on the chip, …"; "… pick another of its orbitals, or go back …" (one hint per level); "orbitals you can pick one by one" | Position words: task-6-review.md:189 (M1) |
| "Ionisation energy (C → C⁺): 11.77 eV ΔSCF, LDA · measured 11.260 eV (NIST) · +4.5 %" (and Fe, Au, Pb, Na⁺'s "— (next ion not offered)"); aria "difference from measured" | Info facts "Ionisation energy (C → C⁺) 11.77 eV", "Measured (NIST) 11.260 eV (calculated +4.5 %)"; ΔSCF in "How this was computed"; no panel line | Plan Task 6 (IE as a short labelled value; IE vs NIST fact); ledger 99; the panel line removed, ledger 206 and 220 |
| "−0.199 Ha (eigenvalue, non-relativistic LDA)" (and Au, Au off, Pb) | "Orbital energy −5.42 eV (−0.199 Ha)", "… · eigenvalue, non-relativistic LDA" | eV first: ledger 100 |
| — | "4 electrons in the outer shell", "2 electrons in the outer shell and 6 in the open 3d", "1 electron …", "8 electrons …" | Plain valence: Plan Task 6; task-6-review.md:118 (I2); task-6-rereview.md:120 (N1) |
| — | "Its ionisation energy is ΔSCF LDA with spherically averaged open shells; …" | IE limitation subject: task-6-review.md:169 (I3) |
| "radial factor of \|ψ\|²" (plot caption) | "\|R(r)\|² is the radial factor of \|ψ\|²." | Moved with a subject: task-6-review.md:169 (the I3 rule) |
| "large component only, not the whole \|ψ\|²" (Au, Pb) | "Under relativity R(r) is the large component: \|R(r)\|² leaves out the small component, so it is not the whole radial part of \|ψ\|²." | task-6-review.md:238 (M5) |
| — | "The orbital energy is an eigenvalue of the non-relativistic LDA, not an ionisation energy." (and scalar, Dirac) | task-6-review.md:204 (M2) |
| — | "One of the 3 p orbital shapes, drawn with 6p½'s own radial function, a dumbbell."; "The one orbital of 6s, a sphere." | task-6-review.md:218 (M3); Plan Task 6 (lead per drill level) |
| — | "Relativity is off here, though scalar relativistic is the default for an element this heavy." (Au off) | ledger 98 |
| "contour enclosing this fraction of the electron density" (Atoms shell helper) | "Enclosed 90 % of the electron density" fact + the (i) "About Enclosed fraction" | Plan Task 5 (Enclosed fact); task-5-review.md:131 (concern 4, Enclosed (i) in every mode) |
| "dashed ring: neutral Na, drawn radius 4.05 a₀ · Na⁺ 1.28 a₀ (−68 %)"; aria "size compared with the neutral atom" | "Dashed ring" fact, same value (no-break spaces) | Plan Task 6 (the ring comparison moves to Info); task-6-review.md:68-69 (same strings) |
| "Pick an axis to slice the orbital open." (no cut) | not shown while no cut is on (every mode) | task-5-review.md:52 and task-6-review.md:318-320 ("an instruction rather than science") |
| "About this model" (phone heading) | "How this was computed" | Plan Task 6 (About → Info); PF5, ledger 32 |
| "energy level (n)", "subshell (l)", "orbital (mₗ)" (aria); phone tab "Orbital & view" | Visible rows "Shell n", "Subshell l", "Orbital mₗ"; tabs "Explore", "Info", "View" | Plan Tasks 4 and 5; task-5-review.md:135-138 (concern 5) |
| — | Orbitals: "A dumbbell with a ring, shaped by its 2 nodes — …", "Nodes 2 (0 radial, 2 angular)", "Energy −1.51 eV (−0.0556 Ha)", "ψ = Rₙₗ(r) Y(θ, φ): …", "Its size grows roughly as n².", "E = −1/(2n²) Ha depends on n alone, …", "Exact one-electron solution, Z = 1: …", "The surface is the contour of constant \|ψ\|² that encloses 90 % …, by marching cubes." | Plan Task 5 interface; ledger 100 (eV first, formula kept); the lead cut to 3 lines, `.impeccable/critique/2026-10-27-levels-finish.md:68` (fix 5) |
| "Pick an element in Atom mode for a real, many-electron atom." | not in Info; Help keeps it | Finish fix 5 (critique :68); task-9b-review.md:69 |
| "One electron, Z = 1 — the exact solution, and the idealised shape …" in the field and hybrid views | Each view's own text: the field's perturbation method and validity; the hybrid's "Built from hydrogen's exact 2s and 2p (Z = 1). …" | Plan Task 5 (the field method and validity); ledger 77 (a field view is perturbation theory, never "exact"); ledger 78 (the hybrid) |
| — | Field n = 1 and n = 2: "The cloud shifts a little that way …", "Polarisability α", "α = 9/2 a₀³, exact for hydrogen, so μ = αF." (main: "… exact for hydrogen."), "The 1s energy does not change to first order in F, …", "At n = 2 it mixes 2s with 2pz: …", "Energy at F = 0", "Lower/Upper state ΔE", "ΔE = ∓3F, from ⟨2s\|z\|2pz⟩ = −3 a₀ …", "Drawn: the n = 2 Stark states …" | Plan Task 5; task-5-review.md:37 and :47 (science read); ledger 77 |
| "(2s + 2p_z)/√2: ΔE = −3F = −0.0060 Ha (−0.16 eV)" (and +3F) | "(2s + 2pz)/√2: ΔE = −3F = −0.163 eV (−0.0060 Ha)" | eV first: ledger 100; 3 significant figures: ledger 116 |
| — | Hybrid: "Hybrids 2s and 3 × 2p", "hᵢ = −(1/√4) ψ₂ₛ + √(3/4) (dᵢ · p), …", "All n = 2 states share one energy, …", "Exact one-electron solution, Z = 1, for the 2s and 2p.", "A hybrid is a linear combination of these degenerate states — for hydrogen still a stationary state with E₂ — …" | Plan Task 5 (hybridInfo); ledger 78 |
| "H 1s in a field, F = 0.030 a.u."; "Hydrogen — H 1s in a field, …" | "Hydrogen — 1s in a field, F = 0.030 a.u." | The double naming: ledger 79 (Task 8) |
| "E = −109.38074 Ha, CCSD(T)/aug-cc-pVTZ (frozen core)" (and CO, H₂⁺'s "E = −0.60263 Ha (exact, Born–Oppenheimer)", He₂'s "E = −5.80123 Ha, FCI/…") | "Total energy −2976.40 eV (−109.38074 Ha)" + "Energies: CCSD(T)/aug-cc-pVTZ (frozen core)." | ledger 131, 100 |
| — | Bonds facts at the current R: N₂'s "E − E(atoms) −9.44 eV (−0.347 Ha)", He₂'s "E − E(atoms) −8.58 × 10⁻⁴ eV (−3.15 × 10⁻⁵ Ha)", H₂⁺'s "E − E(atoms) −2.79 eV (−0.103 Ha)" and H₂⁺'s "Total energy −16.40 eV (−0.60263 Ha)" | Plan Task 7; ledger 131, 100 (eV first, one home); task-7a-review.md:49 (N₂'s E − E(atoms), checked), :53 (H₂⁺'s E − E(atoms), checked) and :115/:118 (H₂⁺'s total energy, asked for and matching −0.60263 Ha × 27.211386) |
| "Molecular orbitals (lowest energy at the bottom)" | "Molecular orbitals" + (i) (the glossary says "lowest energy at the bottom") | Plan Task 7 ("heading stays short"); task-7a-review.md:17 |
| "Bond order 3." (and H₂⁺'s "Bond order ½. One electron, exact energies.") | "Bond order 3" fact; H₂⁺ "One electron, so the energies are exact." | task-7a-review.md:148 (M5); task-7a-review.md:98 and :150 (the H₂⁺ wording) |
| "Bond order 3 — counted from the valence orbitals' bonding/antibonding character; g/u labels don't apply …" | Fact + "Counted from the valence orbitals' bonding or antibonding character; g/u labels do not apply …" | task-7a-review.md:148 (M5 wording) |
| "HOMO 3σg (ε = −0.438 Ha) · LUMO 1πg* (ε = −0.033 Ha)" (and CO's, He₂'s) | "Frontier orbitals — HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · …"; Data "Kohn–Sham orbital energies — …" | ledger 100 and 131 (eV first); task-7a-review.md:100 (I3, the Kohn–Sham qualifier) |
| "methods" (aria of main's Data captions) | gone; the captions are in "How this was computed" | Plan Task 7; task-7a-review.md:19 (spec compliance: "Data keeps only the frontier values") |
| H₂⁺ curve caption "Exact within Born–Oppenheimer (nuclei fixed). Zero: … 1σu* has no minimum on this range." | Its parts, each kept: "Exact within Born–Oppenheimer (nuclei fixed): the separated spheroidal equations …" and "1σu* has no minimum between 0.5 and 10 a₀; …" in "How this was computed"; "Plot: E − E(H + H⁺), in eV. Zero: …, the grey line." | task-7a-review.md:29-36 (every part of the old curve caption has a home); ledger 187 |
| — | H₂⁺: "H₂⁺ is two protons sharing one electron: …", "In 1σg, the bonding orbital, …", "It is solved exactly here for nuclei held in place.", "Exact levels — 1σg Eel = …" | Plan Task 7 (bondsInfo); task-7a-review.md:130-133 (M1, M2); ledger 135 (the exact levels); finish fix 5 (the lead split) |
| He₂ "No chemical bond: … (0.04 mHa below …), comparable to this basis' superposition error, with no counterpoise correction."; the curve's "(0.04 mHa)" form | "… comparable to this basis' superposition error." "No counterpoise correction" is said once, in "Energies: FCI/aug-cc-pVTZ (no counterpoise correction)." | task-7a-review.md:154 (M6, said once) |
| — | "N₂ has 14 electrons; the surface shows where they are likely to be found." (and He₂, water, glycine) | The density lead: task-7b-review.md:161 (M6); cut to 3 lines, finish fix 5 |
| — | "The density is all the occupied orbitals together: the sum of their \|ψ\|², each weighted by how many electrons it holds." (Bonds and Molecules, Advanced) | task-9b-review.md:126 (I3) |
| — | CO 5σ: "5σ is a σ orbital of CO.", "It is symmetric around the bond axis.", "It holds 2 electrons.", "It is the HOMO: the highest level that holds electrons."; facts "−10.9 eV (−0.401 Ha)", "Orbital energy −10.50 eV (−0.386 Ha)", "90 % of the orbital's \|ψ\|²" | Plan Task 7 (bondsInfo); task-7a-review.md:177 (M10); finish fix 5 (lead, notes, technical) |
| "N₂ · R = 2.07 a₀", "CO · R = 2.13 a₀", "H₂⁺ · R = 2.00 a₀", "He₂ · R = 5.85 a₀" (phone header) | Captions "N₂ electron density · R = 2.07 a₀", "CO 5σ · R = 2.13 a₀", … | Phone captions: Task 8; ledger 172, 227 |
| Phone blobs (one string of joined captions, N₂, CO, He₂) | each sentence present on the branch, or one of the rows above | (checked sentence by sentence) |
| Canvas subtitles: "N₂ total density, surface at ρ = 0.002 e/a₀³, R = 2.07 a₀ (1.098 Å)", "CO 5σ, R = 2.13 a₀ (…), 90% contour", "H₂⁺ 1σg, …", "He₂ total density, …"; "Water (H₂O), density, 90 % enclosed (ρ = 2.66e-2 e/a₀³)", "…, ESP on ρ = 0.001 e/a₀³ surface, ±0.05 Ha/e", "…, MO 1b1 (HOMO), −0.324 Ha (−8.83 eV), 90 % enclosed"; Atoms' "90 % of the electron density enclosed · LDA, …", "\|ψ\|² isosurface · 90 % enclosed · LDA, …"; Orbitals' "\|ψ\|² isosurface · 90 % enclosed · exact one-electron solution, Z = 1" | At Research: "electron density", "5σ orbital · \|ψ\|² isosurface", "1σg orbital · \|ψ\|² isosurface", "electrostatic potential", "1b1 orbital (HOMO) · \|ψ\|² isosurface", "electron density · LDA, non-relativistic", "\|ψ\|² isosurface · LDA, …", "\|ψ\|² isosurface · n = 2 Stark states, …" | Finish fixes 2 and 3 (`.impeccable/critique/2026-10-27-levels-finish.md:61`, `:66`); ledger 205, 207 (exports keep the full line); task-9b-review.md:173 (M5) and :190 (M8) |
| "Geometry: experiment (CCCBDB). Density, potential and orbitals: B3LYP-D3(BJ)/def2-TZVPD (PySCF)."; "geometry: … · sticks show connectivity, not bond order"; glycine's "Geometry: B3LYP-D3(BJ)/def2-TZVP optimised …" | Geometry in the Properties row once; "Method: B3LYP-D3(BJ)/def2-TZVPD, PySCF 2.8.0."; "Sticks show connectivity, not bond order." | Experimental geometry stated once: task-7b-review.md:84 (I1) and :125 (I6); ledger 154 |
| "bond: 0.958 Å — experiment (CCCBDB); geometry from experiment (not a test of the method)", "angle: 104.5 deg — …"; glycine's "dihedral: 0 deg — conformer check" | "O–H 0.958 Å, H–O–H 104.5°: the experimental geometry itself, so no test of the method"; "dihedral: 0° — conformer check" | task-7b-review.md:84-87 (I1); "°" for "deg": task-7b-review.md:75 (Task 9 review M1: not typography) |
| "Checked against" | "Checked against published values:" | task-7b-review.md:92 (I2) |
| "How this was computed→" (pinned link) | Info's "How this was computed" | PF5, ledger 32 |
| "Formula" (Properties row) | gone (the title has it) | ledger 154 |
| "μ = 1.86 D (B3LYP-D3(BJ)/def2-TZVPD) · experiment 1.855 D" (and glycine's) | Research: "Dipole μ 1.86 D computed · 1.855 D experiment (CRC Handbook, via CCCBDB)"; glycine's "… 1.1 D experiment (microwave, conformer I (Lovas et al. 1995))" | ledger 154 (one home, Info); ledger 218 (the experiment from Advanced, its citation from Research); the method in "How this was computed" |
| "0.314 Ha (8.55 eV)", "0.253 Ha (6.88 eV)", "HOMO–LUMO gap 0.314 Ha (8.55 eV)."; the orbital list's "−0.324 Ha (−8.83 eV)" … "−19.138 Ha (−520.76 eV)", "0.184 Ha (5.00 eV)upper est." | "8.55 eV (0.314 Ha)", …; the list "−8.83 eV (−0.324 Ha)" … | ledger 100 |
| "Kohn–Sham orbital energies, B3LYP-D3(BJ)/def2-TZVPD."; "Not ionisation energies."; "Kohn–Sham orbital gap — neither …" | "These orbital energies are Kohn–Sham eigenvalues, not ionisation energies, and the HOMO–LUMO gap is a Kohn–Sham orbital gap — …"; the method in "How this was computed" | Plan Task 7 (the caveat once); finish fix 5 (one sentence); task-9b-review.md:144 (M1, "These") |
| "◌ partly diffuse virtual (under 75 % valence) · ◇ constructed LVMO, … · upper est.: …"; "◌ partly diffuse virtual (under 75 % valence): its shape depends on the basis."; "Those at positive energy are unbound, …" | "◌ marks a partly diffuse virtual (under 75 % valence).", "◇ marks a constructed LVMO, …", "“upper est.” marks …"; "A partly diffuse virtual (◌): its shape depends on the basis."; "Diffuse virtuals at positive energy are unbound, …" | task-7b-review.md:135 (M1, its own subject) and :140 (M2) |
| — | Water 1b1: "1b1 is one of H₂O's molecular orbitals.", "It is the HOMO: the highest orbital that holds electrons.", "The surface is a contour of constant \|ψ\|², at the value that encloses the chosen fraction of the orbital."; the density's "The surface is a contour of constant density ρ, …" | Plan Task 7b (moleculeInfo); task-7b-review.md:98 (I3) and :56 (the isoNote → the contour sentence); finish fix 5 |
| "about this colour key" (aria); "Fixed at ρ = 0.001 e/a₀³ — the surface ESP maps are conventionally drawn on, not an enclosed fraction" | "About Electrostatic potential"; "The map is drawn on the surface ρ = 0.001 e/a₀³, a common convention (Bader's) …, so Electron enclosed does not apply to it." | task-7b-review.md:32 (the key's (i)) and :157 (M5) |
| — | ESP: "electron-rich", "electron-poor" (the key's ends), "Red where the potential is negative (electron-rich), …", "Potential range −0.051 to +0.068 Ha/e", "This molecule's potential runs beyond the scale, …", "Every molecule is drawn on the same scale, …" | task-7b-review.md:25 and :54 (ESP key notes kept, levelled); finish fix 5 (the lead) |
| — | "Library: Curated; …" (phone, Info) | Phone tier line: ledger 155 |
| — | Titles "Carbon — whole atom", "Iron — M shell", "Gold — 6s orbital", "Lead — 6pz orbital · 6p½", "Sodium ion Na⁺ — whole atom", "Chlorine ion Cl⁻ — whole atom — not drawn", "N₂ — total electron density", "CO — 5σ orbital", "H₂⁺ — 1σg orbital", "He₂ — total electron density", "Hydrogen — n = 2 Stark states", "Water (H₂O) — …", "Glycine (NH₂CH₂COOH) — electron density"; leads "Carbon has 6 electrons in 2 shells.", "The cut face shows them as rings.", "One of the 3 p orbitals of 2p, a dumbbell.", "The M shell (n=3) holds 14 of Iron's 26 electrons: …", "Na⁺ has 10 electrons …", "Cl⁻ has 18 electrons …", "Nothing is drawn for this species, so there is no shell to open."; fact labels (Enclosed, Iso value, Bond length R, E − E(atoms), Total energy, Orbital energy, Nodes, Energy, Dipole μ, Measured (NIST), Dashed ring, Potential range); "Info"; (i) names "About …"; "Shells", "Subshells" | Plan Task 4 (Info, InfoButton aria-label), Tasks 5–7 (titles, leads, facts); finish fix 7 ("Shells (i)", critique :73) |
| — | The same titles with plain digits: "N2 — total electron density", "Water (H2O) — …", "Glycine (NH2CH2COOH) — …", "H2⁺ — 1σg orbital", "He2 — …", "Hydrogen — sp³ hybrid h1" | Info heading's hidden description: Task 9 review I3 (task-9-review.md:127); plain digits, ledger 173 |
| — | "Cut face shading is scaled to local shell structure." after the facts, at every level | task-9b-review.md:152 (M2) |
| "\|ψ\|² = 1.22e-3" (and 7 more: basic-3dz2, bonds-co-orbital, H₂⁺, water-orbitals, Au, Au off, Pb; auto-listed as (a)) | "Iso value \|ψ\|² = 1.22 × 10⁻³ a₀⁻³" | Plan Task 5 (the iso value with its unit); ledger 74 (Task 9 review M1: the unit is not typography) |

### (b) The three Bonds changes ruled after the first report (ledger lines 185–189)
The first report listed these three as (c) unexplained. Each is described in the Task 7a report, and the controller
then ruled them (retroactive ruling, ledger lines 185–189). He₂'s and H₂⁺'s versions of 1 and 2 are the same.

1. **The density sentence lost its method tag.** "Total electron density **(B3LYP/def2-TZVP)**, surface at ρ = 0.002
   e/a₀³, …" became "Total electron density, surface at ρ = 0.002 e/a₀³, …".
   - Ruled at line 186: the tag left the plain band because the method is stated in "How this was computed".
   - Checked live: N₂'s "How this was computed" reads "Orbitals and density: B3LYP/def2-TZVP; orbital energies are
     B3LYP/def2-TZVP Kohn–Sham eigenvalues — not ionisation energies." This is for the finish review to confirm.
2. **The curve's zero gained words.** "Zero: N ⁴S + N ⁴S, UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core)." became
   "**Plot: E − E(separated atoms), in eV.** Zero: …, **the grey line**." CO's and He₂'s are the same. Ruled at line
   187: the addition follows eV first.
3. **The fixed-ρ note gained a clause.** "… chosen with the ρ buttons beside the orbitals — not at an enclosed
   fraction." became "… chosen with the ρ buttons — not at an enclosed fraction, **so Electron enclosed does not apply
   to it**."
   - Dropping "beside the orbitals" is the position-word rule (task-6-review.md:189).
   - The clause is ruled at line 188: it is the enclosed helper's move.

### (c) and fix round 1 — **(c) = 0**
The first classification reported the three findings below. The controller ruled on each:
- ruling c1 is ledger 231;
- ruling c2 is ledger 232;
- ruling c3 is ledger 233.

Fix round 1 (`3f9d2d6`) then re-ran `science_diff.mjs` for the four scenes involved: basic-stark-n2, basic-field-n1,
basic-sp3 and cl-anion. That run was dark, desktop and phone, at Research, 16 shots, 0 errors (`/tmp/lv9cr1-scidiff.txt`).
- **1 → (b), fixed.** The field and hybrid views now give Info's "Iso value" fact from Advanced. The value is the one
  the picture is drawn at, once that combination has landed.
  - The re-run reads "|ψ|² = 8.15 × 10⁻⁵ a₀⁻³", "1.55 × 10⁻³ a₀⁻³" and "8.85 × 10⁻⁵ a₀⁻³", the same values main shows,
    now with their unit.
  - The ★ `enclosedNote` field reads them too.
  - Basis: ruling c1 (ledger 231), and the unit (ledger 74).
- **2 → (b), accepted.** With nothing drawn, there is nothing to cut. Ruling c2 (ledger 232). The two main-only lines
  remain in the re-run, as ruled.
- **3 → fixed.** With nothing drawn, the ΔSCF paragraph appears only if Info shows an energy it explains. Cl⁻ shows
  none, so the paragraph is gone, and none of its 4 lines is in the re-run. When there is no picture and an energy is
  shown, the wording names the method alone (`deltaScfMethod(null)`). Ruling c3 (ledger 233).

Every other line of the re-run is a row above, unchanged.

The first report's three findings, as they stood:
1. **A combination's iso value has no home** (3 main-only lines).
   - Main shows the contour's value under Electron enclosed in the field and hybrid views: "|ψ|² = 8.15e-5"
     (basic-stark-n2), "|ψ|² = 1.55e-3" (basic-field-n1) and "|ψ|² = 8.85e-5" (basic-sp3).
   - The branch shows it nowhere. Info gives an "Iso value" fact for a single orbital only (`enclosedFacts`,
     src/info/basic_info.ts:95-105); the field and hybrid builders give Enclosed alone.
   - No ruling or review covers combinations.
2. **Cl⁻, with nothing drawn, loses the Cut away helper** (2 main-only lines).
   - Main shows "Slices off the +x side to show the shells inside." and "The atom is round, so X, Y and Z give the same
     rings, facing a different way." under Cut away, although the unbound anion draws nothing.
   - The branch says the cut text only while a picture is drawn (`clipAxis !== 'none' && profile` in atomInfo).
   - This is arguably right, since there are no shells to slice. But no ruling covers it: task-6-review.md:318-320
     names the "Pick an axis" prompt as the only loss.
3. **Cl⁻, with nothing drawn, gains the ΔSCF paragraph** (4 branch-only lines).
   - The branch's "How this was computed" adds "ΔSCF: the difference of two self-consistent total energies, … — a
     different, spin-restricted form of the same LDA draws the picture on screen.", "Occupations follow Hund's rule
     …", "One-electron species are exact." and "Never an orbital eigenvalue." (`deltaScfMethod`, atom_info.ts).
   - Main says nothing about ΔSCF for this species.
   - The paragraph explains energies that Info does not show for an unbound species (`energyFacts` returns none).
     Its "draws the picture on screen" is untrue when nothing is drawn.

**An observation for the science read (new text, not a diff):** Bonds' plain lead says "the HOMO: the highest **level**
that holds electrons". Molecules was changed to "the highest **orbital** that holds electrons" in 7b
(task-7b-review.md:98, I3: "use 'orbital', not 'level'").
