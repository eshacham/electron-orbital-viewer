# The picture is the control — live check and checklist (plan Task 5)

Spec: `docs/superpowers/specs/2026-10-28-picture-is-the-control.md`. Tasks 1–4's commits: `fecb1e4` (strip picks the
orbital), `f62bb86` + `793ed8e` (sideways scroll cue), `02544cd` (the "Bond length" block), `39e3821` + `3d7d7d5` +
`f509ae5` (plain words at Basics). This check runs on `design/picture-control`, HEAD `f509ae5`.

## Owner flags for the local test

From the ledger (`.superpowers/sdd/2026-10-28-picture-is-the-control/progress.md`), these rulings ask for the
owner's own hands-on confirmation; nothing here was overturned by this check, but each is called out because a
screenshot alone cannot settle it (an interaction mid-flight, or a judgment call made without a review):

- **Picking from the strip, or from an n chip, always leaves a combination, including at Advanced.** (Task 1
  ruling, and ruling T1 M2 for the n chip.) Before, a strip pick at Advanced with a combination held did nothing
  visible; now it always clears the combination and draws the picked orbital, the same as a chip pick did below
  Advanced.
- **The Subshell and Orbital (i)s now sit on Info's fact labels.** (Task 1 ruling.) The strip's group labels (s · p
  · d · f · …) stay clean, with no (i) of their own.
- **Mid-drag, Info shows the committed R while the marker shows the draft.** (Task 3 review M5, flagged for the
  owner test.) The slider's own readout and the curve's marker follow the draft; Info's "Bond length R" fact updates
  only on commit.
- **When a molecule fails to load, the block line says "No curve to show."** (Ruling C9: a failure is said once, by
  the alert above; the block's own line names only what it lacks, not why.)
- **Data in Bonds appears at Explore, and the curve at every level.** The right panel's Data section (the frontier
  orbitals, Kohn–Sham energies) is gated at Explore and above, as before; the left panel's "Bond length" block,
  slider and curve are Basics content and show at every level.

## How it was shot

Own Vite on port 5413 only, `node tools/design/shoot.mjs --gl metal --jobs-stub --level <basics|research>`, dark
and light, headless Chromium. A phone shot adds `--click Explore` to open the phone sheet's Explore tab, where the
strip and the "Bond length" block live (spec §6); without it the sheet opens on its default View tab (canvas only).
The 1024 px drawer shots add `--drawer open`. Every one of the 68 shots below settled with 0 page errors and made 0
`/api` requests (neither mode calls the job server). Port 5413 was free before the first run and after the last.

```
S="node tools/design/shoot.mjs --gl metal --jobs-stub --port 5413"
O=basic-3dz2,basic-n9,basic-n9-mid,basic-n9-s
B=bonds-n2,bonds-h2plus,bonds-he2
# Orbitals (32 shots)
$S --task pc-T5-orb-basics-desktop   --run d --level basics   --scenes $O --themes dark,light --sizes desktop
$S --task pc-T5-orb-basics-phone     --run p --level basics   --scenes $O --themes dark,light --sizes phone --click Explore
$S --task pc-T5-orb-research-desktop --run d --level research --scenes $O --themes dark,light --sizes desktop
$S --task pc-T5-orb-research-phone   --run p --level research --scenes $O --themes dark,light --sizes phone --click Explore
# Bonds (36 shots)
$S --task pc-T5-bonds-basics-desktop   --run d --level basics   --scenes $B --themes dark,light --sizes desktop
$S --task pc-T5-bonds-basics-drawer    --run t --level basics   --scenes $B --themes dark,light --sizes tablet --drawer open
$S --task pc-T5-bonds-basics-phone     --run p --level basics   --scenes $B --themes dark,light --sizes phone --click Explore
$S --task pc-T5-bonds-research-desktop --run d --level research --scenes $B --themes dark,light --sizes desktop
$S --task pc-T5-bonds-research-drawer  --run t --level research --scenes $B --themes dark,light --sizes tablet --drawer open
$S --task pc-T5-bonds-research-phone   --run p --level research --scenes $B --themes dark,light --sizes phone --click Explore
# Step 2 extra widths (measurement only, not part of the 68; see "Size" below)
$S --task pc-T5-step2-widths-basics --run b --level basics   --scenes bonds-n2,bonds-he2 --themes dark --sizes 1280,1920
$S --task pc-T5-step2-widths        --run research --level research --scenes bonds-n2,bonds-he2 --themes dark --sizes 1280,1920
```

**Size.** The brief's matrix — Orbitals (4 scenes × 2 themes × 2 sizes × 2 levels = 32) plus Bonds (3 scenes × 2
themes × 3 sizes × 2 levels = 36) — is 68 shots, under the ~80 guideline, so the full matrix (dark and light, every
listed size, both levels) is kept; no reduction to light-only was needed.

**Tool changes** (`tools/design/shoot.mjs`, this task):
- `SIZES` gains `'1280'` and `'1920'` (1280×900, 1920×1080) — the brief's Step 2 widths; 1440 is already `desktop`.
- `metrics.stripCue`: the Orbitals strip's sideways scroll cue (`useMoreSideways`/`groupScroll`, Task 2) —
  `hasMoreBefore`, `hasMoreAfter` and the list's `mask`/`-webkit-mask`, read the same way `info.moreCue` already
  reads Info's own cue.
- `metrics.bondsLength`: the "Bond length" block's fit in the left column — `.side-panel`'s and `.bonds-length`'s
  own width and horizontal overflow (`scrollWidth − clientWidth`), read the same way `workspaceOverflow` already
  reads the request workspace's.

## Step 1 — Shots

### Orbitals: n = 3 and n = 9, dark and light × desktop and phone, at Basics and Research

Scenes: `basic-3dz2` (n = 3, 9 tiles, no cue needed), `basic-n9` (n = 9, last tile, left cue), `basic-n9-mid` (n = 9,
mid-strip, both cues) and `basic-n9-s` (n = 9, first tile, right cue) — the last three are Task 2's own live-check
scenes. All 32 shots settled, 0 errors.

| Scene | Level | Desktop (dark / light) | Phone, Explore tab (dark / light) |
|---|---|---|---|
| basic-3dz2 | Basics | `orb-basics-basic-3dz2-dark-desktop.png` / `orb-basics-basic-3dz2-light-desktop.png` | `orb-basics-basic-3dz2-dark-phone.png` / `orb-basics-basic-3dz2-light-phone.png` |
| basic-n9 | Basics | `orb-basics-basic-n9-dark-desktop.png` / `orb-basics-basic-n9-light-desktop.png` | `orb-basics-basic-n9-dark-phone.png` / `orb-basics-basic-n9-light-phone.png` |
| basic-n9-mid | Basics | `orb-basics-basic-n9-mid-dark-desktop.png` / `orb-basics-basic-n9-mid-light-desktop.png` | `orb-basics-basic-n9-mid-dark-phone.png` / `orb-basics-basic-n9-mid-light-phone.png` |
| basic-n9-s | Basics | `orb-basics-basic-n9-s-dark-desktop.png` / `orb-basics-basic-n9-s-light-desktop.png` | `orb-basics-basic-n9-s-dark-phone.png` / `orb-basics-basic-n9-s-light-phone.png` |
| basic-3dz2 | Research | `orb-research-basic-3dz2-dark-desktop.png` / `orb-research-basic-3dz2-light-desktop.png` | `orb-research-basic-3dz2-dark-phone.png` / `orb-research-basic-3dz2-light-phone.png` |
| basic-n9 | Research | `orb-research-basic-n9-dark-desktop.png` / `orb-research-basic-n9-light-desktop.png` | `orb-research-basic-n9-dark-phone.png` / `orb-research-basic-n9-light-phone.png` |
| basic-n9-mid | Research | `orb-research-basic-n9-mid-dark-desktop.png` / `orb-research-basic-n9-mid-light-desktop.png` | `orb-research-basic-n9-mid-dark-phone.png` / `orb-research-basic-n9-mid-light-phone.png` |
| basic-n9-s | Research | `orb-research-basic-n9-s-dark-desktop.png` / `orb-research-basic-n9-s-light-desktop.png` | `orb-research-basic-n9-s-dark-phone.png` / `orb-research-basic-n9-s-light-phone.png` |

What the shots show (both levels alike): the left panel holds "Shell n" only, with no Subshell or Orbital chip row
(`orb-research-basic-3dz2-dark-desktop.png`). The strip under the picture is grouped 3s/3p/3d (or 9s…9g, scrolling)
and marks the selected tile. Info's Subshell and Orbital facts each carry their own (i)
(`orb-research-basic-3dz2-dark-desktop.png`). On a phone, `basic-n9-mid`'s strip shows a tile cut at each edge with
the fade visible (`orb-basics-basic-n9-mid-dark-phone.png`); `basic-n9-s`'s strip sits flush left with only the
right tile cut (`orb-basics-basic-n9-s-dark-phone.png`).

### Bonds: N₂, H₂⁺ and He₂, dark and light × desktop, 1024 drawer and phone, at Basics and Research

All 36 shots settled, 0 errors.

| Scene | Level | Desktop (dark / light) | 1024 drawer, open (dark / light) | Phone, Explore tab (dark / light) |
|---|---|---|---|---|
| N₂ | Basics | `bonds-n2-basics-dark-desktop.png` / `bonds-n2-basics-light-desktop.png` | `bonds-n2-basics-dark-tablet.png` / `bonds-n2-basics-light-tablet.png` | `bonds-n2-basics-dark-phone.png` / `bonds-n2-basics-light-phone.png` |
| H₂⁺ | Basics | `bonds-h2plus-basics-dark-desktop.png` / `bonds-h2plus-basics-light-desktop.png` | `bonds-h2plus-basics-dark-tablet.png` / `bonds-h2plus-basics-light-tablet.png` | `bonds-h2plus-basics-dark-phone.png` / `bonds-h2plus-basics-light-phone.png` |
| He₂ | Basics | `bonds-he2-basics-dark-desktop.png` / `bonds-he2-basics-light-desktop.png` | `bonds-he2-basics-dark-tablet.png` / `bonds-he2-basics-light-tablet.png` | `bonds-he2-basics-dark-phone.png` / `bonds-he2-basics-light-phone.png` |
| N₂ | Research | `bonds-n2-research-dark-desktop.png` / `bonds-n2-research-light-desktop.png` | `bonds-n2-research-dark-tablet.png` / `bonds-n2-research-light-tablet.png` | `bonds-n2-research-dark-phone.png` / `bonds-n2-research-light-phone.png` |
| H₂⁺ | Research | `bonds-h2plus-research-dark-desktop.png` / `bonds-h2plus-research-light-desktop.png` | `bonds-h2plus-research-dark-tablet.png` / `bonds-h2plus-research-light-tablet.png` | `bonds-h2plus-research-dark-phone.png` / `bonds-h2plus-research-light-phone.png` |
| He₂ | Research | `bonds-he2-research-dark-desktop.png` / `bonds-he2-research-light-desktop.png` | `bonds-he2-research-dark-tablet.png` / `bonds-he2-research-light-tablet.png` | `bonds-he2-research-dark-phone.png` / `bonds-he2-research-light-phone.png` |

What the shots show: at every level the "Bond length" block (heading with its (i), R readout, slider, the curve
full width, the legend and the Rₑ note) sits as one unit under the molecule select
(`bonds-n2-research-dark-desktop.png`). At Basics it reads plain words — "Energy (eV)", "Distance between nuclei
(Å)", "Dotted line: most stable, 1.10 Å" for N₂ and "…, 1.06 Å" for H₂⁺ (`bonds-n2-basics-dark-desktop.png`,
`bonds-h2plus-basics-dark-desktop.png`); He₂ has no well and so no Rₑ line
(`bonds-he2-basics-dark-desktop.png`). The right panel shows Display only at Basics, with "Data appears at Explore"
(`bonds-he2-basics-dark-desktop.png`), and Display plus Data at Research
(`bonds-n2-research-dark-desktop.png`). The 1024 px drawer's one bar button reads "View" at Basics and "Data" at
Research (`bonds-n2-basics-dark-tablet.png`, `bonds-n2-research-dark-tablet.png`); the block itself stays in the
left panel, outside the drawer, at every width. On a phone the block sits inside the Explore tab's sheet, full
width (`bonds-n2-basics-dark-phone.png`).

## Step 2 — Measure

### The Bond length block fits the left column at 1280, 1440 and 1920 px, and on phone, with no horizontal overflow

Measured with `metrics.bondsLength` (new this task): the left column's own box (`.side-panel`; phone has none, the
block is the Explore tab's full width instead) and the block's own box (`.bonds-length`), each read for
`scrollWidth − clientWidth`. N₂ and He₂ at Basics and Research, dark, at every width named in the brief:

| Width | Column width | Column overflow | Block width | Block overflow (N₂ / He₂) | Block overflow (H₂⁺) |
|---|---|---|---|---|---|
| 1280 | 300 px | **0** | 266 px | 1 px | — |
| 1440 (desktop) | 315 px | **0** | 281 px | 1 px | 0 px |
| 1920 | 315 px | **0** | 281 px | 1 px | — |
| phone (390, Explore tab) | n/a (full width) | n/a | 356 px | 1 px | 0 px |

Shots: `bonds-n2-research-dark-1280.png`, `bonds-n2-research-dark-1920.png` (1280 and 1920 px; 1440 and phone are
already cited in Step 1, e.g. `bonds-n2-research-dark-desktop.png`). Values hold identically at Basics and at both
themes (checked; not re-cited).

**Verdict: pass.** The column itself (what the brief asks to "fit") never overflows at any width — `0` in every
case, at both levels and both themes. The block's own `scrollWidth` reads 1 px over its `clientWidth` for the two
scan-based systems (N₂, He₂) at every width and both levels, but not for H₂⁺ (0 px everywhere measured); this is a
sub-pixel figure under the project's own existing overflow tolerance (`scrollWidth > clientWidth + 1`, used
throughout this tool's other overflow checks, e.g. `info.overflow`), and it never reaches the column that holds it.
Nothing clips or scrolls in any of the 68 Step 1 shots. Worth a glance on a real screen, since this is a headless
measurement: if it turns out to be a visible seam rather than sub-pixel rounding, the fix is local to the curve's
own width calculation in `PotentialCurvePlot`/`useElementWidth`.

### The Orbitals strip with n = 9 on phone shows its cue

Measured with `metrics.stripCue` (new this task), phone, Explore tab, both levels, both themes (16 readings; the
values below hold unchanged at Basics and Research alike — recorded once):

| Scene | hasMoreBefore | hasMoreAfter | Mask drawn |
|---|---|---|---|
| basic-3dz2 (n = 3) | true | false | left-edge fade |
| basic-n9 (last tile) | true | false | left-edge fade |
| basic-n9-mid (mid-strip) | true | true | both-edge fade |
| basic-n9-s (first tile) | false | true | right-edge fade |

**Verdict: pass.** n = 9's cue shows exactly where more tiles lie off screen in each position, and the mask class is
never `none` while a cue is true. (n = 3's strip also already scrolls at this width and shows a cue of its own, 9
tiles already being wider than a 356 px phone column with the Tonal Scroll Cue Rule's labels — not a defect, just
not the case the brief asks this item to prove.) Shots: `orb-basics-basic-n9-dark-phone.png`,
`orb-basics-basic-n9-mid-dark-phone.png`, `orb-basics-basic-n9-s-dark-phone.png`. The same holds at desktop width
(checked in the Step 1 metrics; not a brief requirement, recorded as a bonus confirmation of Task 2's Review Focus
2).

### Info is still capped at 45%

Reusing `metrics.info.share` (levels Task 9). Desktop and the 1024 px drawer, both levels, both modes (every value
below is identical across themes):

| Mode | Level | Size | Share |
|---|---|---|---|
| Orbitals | Basics | desktop | 0.304–0.335 (varies by scene; never above 0.335) |
| Orbitals | Research | desktop | 0.449 |
| Bonds | Basics | desktop | 0.25–0.339 (varies by system) |
| Bonds | Research | desktop | 0.449 |
| Bonds | Basics | 1024 drawer | 0.439–0.45 |
| Bonds | Research | 1024 drawer | 0.45 |

**Verdict: pass.** Nothing exceeds 0.45 (the rounding of 45 % the levels check already established as the cap) in
either mode, at either level, docked or in the drawer. On a phone Info is its own full-width tab, not a docked
column sharing space with the canvas, so the share metric does not apply there (reads `null`), the same as it does
in the levels check.

## Step 3 — Record

- **Finish review:** pending (controller).
- **DESIGN.md:** pending (controller).

## Finish fixes (Task 5b)

The finish review (`.impeccable/critique/2026-10-28-picture-control-finish.md`) returned **fix** with eight material
fixes; the controller's brief ruled on two of them (the drawer, and the units). Commits on `design/picture-control`:
`8d1e746` (drawer), `d38b6b4` + `0dc752b` (one instrument, the handle, the phone order), `265d5ee` (Basics units and
labels), `49b8e7e` (strip groups and the desktop cue). Science colours, Glow and the Atoms colours are unchanged; every
new style is a token.

**How it was shot.** Own Vite on port 5413 only, `node tools/design/shoot.mjs --gl metal --jobs-stub --port 5413`,
headless Chromium; every shot settled, 0 page errors, 0 `/api` requests; nothing listened on 5413 before or after.
`shoot.mjs` gains two readings (this task): `metrics.bondsLength.thumbX` / `markerX` (the slider thumb's and the
marker's centres, px from the block's left edge) and `.handle` (its box, ring colour and shadow as drawn), and
`metrics.stripCue.scrollLeft` / `clientWidth` / `groups` (each visible group's box, its label's left edge and its
snap margin, px from the list's left edge).

```
node tools/design/shoot.mjs ... --task pc-T5b-bonds-basics-phone --level basics   --scenes bonds-n2,bonds-h2plus --themes dark,light --sizes phone --click Explore
node tools/design/shoot.mjs ... --task pc-T5b-drawer             --level research --scenes bonds-n2,basic-3dz2 --themes dark,light --sizes tablet --drawer open
node tools/design/shoot.mjs ... --task pc-T5b-block-basics       --level basics   --scenes bonds-n2,bonds-h2plus,bonds-he2 --themes dark,light --sizes desktop --crop .bonds-length
node tools/design/shoot.mjs ... --task pc-T5b-block-research     --level research --scenes bonds-n2,bonds-h2plus,bonds-he2 --themes dark,light --sizes desktop --crop .bonds-length
node tools/design/shoot.mjs ... --task pc-T5b-strip-desktop      --level basics   --scenes basic-n9,basic-n9-mid --themes dark,light --sizes desktop
node tools/design/shoot.mjs ... --task pc-T5b-strip-phone        --level basics   --scenes basic-n9,basic-n9-mid --themes dark,light --sizes phone --click Explore
```

The two `finish-aligned-*-zoom.png` are the N₂ Basics block crops, cut to the slider and the plot and enlarged 2×.

| # | Fix | Verdict | Shots |
|---|---|---|---|
| 1 | Phone Bonds: the Bond length block right under the strip | pass | `finish-bonds-n2-basics-dark-phone.png`, `finish-bonds-n2-basics-light-phone.png`, `finish-bonds-h2plus-basics-dark-phone.png`, `finish-bonds-h2plus-basics-light-phone.png` |
| 2 | 1024 drawer: a quiet horizontal label (ruled) | pass | `finish-drawer-bonds-n2-research-dark-tablet.png`, `finish-drawer-bonds-n2-research-light-tablet.png`, `finish-drawer-orbitals-3dz2-research-dark-tablet.png`, `finish-drawer-orbitals-3dz2-research-light-tablet.png` |
| 3 | One instrument: the thumb over the marker | pass | `finish-aligned-n2-basics-dark-zoom.png`, `finish-aligned-n2-basics-light-zoom.png`, and every `finish-block-*.png` |
| 4 | A handle on the curve | pass | `finish-block-n2-basics-dark.png` / `-light.png`, `finish-block-h2plus-basics-dark.png` / `-light.png` |
| 5 | Basics units; Research axis ends (ruled) | pass | `finish-block-n2-basics-light.png`, `finish-bonds-n2-basics-light-phone.png` (caption), `finish-block-n2-research-light.png`, `finish-block-h2plus-research-light.png` |
| 6 | Basics curve labels | pass | `finish-block-n2-basics-light.png`, `finish-block-h2plus-basics-light.png`, `finish-block-he2-basics-light.png` (and `-dark`) |
| 7 | Strip groups: sticky, section type, phone breaks | pass | `finish-strip-n9-last-dark-desktop.png`, `finish-strip-n9-mid-dark-phone.png`, `finish-strip-n9-last-dark-phone.png` (and `-light`) |
| 8 | Desktop cue: the next group peeks at a rest | pass | `finish-strip-n9-mid-dark-desktop.png`, `finish-strip-n9-mid-light-desktop.png` |

**1. Phone Bonds.** On a phone the Explore tab is now the strip, then the "Bond length" block (heading, readout,
slider, curve), then the identity card and the molecule select (`BondsPanel`'s `lengthFirst`, which App passes on a
phone). The curve is on screen with the picture at Basics for N₂ and H₂⁺: the sheet shows the plot and its marker
under the strip. The H₂⁺ slider sits at y ≈ 585 of 844, well clear of the tab bar (`finish-bonds-h2plus-basics-light-phone.png`).

**2. 1024 drawer.** Open, the bar is a surface-2 strip under a hairline, its label read across in text-2 (text-1 for
the open one) with a chevron; no selected-fill, accent or on-fill on any bar button. Folded, the edge bar is
unchanged. It is a shell fix, so every mode: Bonds shows "Data ›", Orbitals "Plot ›  Data". One press still opens and
closes it under the same name ("Data panel"), and Esc still returns focus to it.

**3. One instrument.** The slider's track is inset by the margins the plot draws with (`PLOT_PAD`, `plotX`, and the
left margin the plot reports through `onInset`, which widens to fit the energy labels). Measured, thumb centre against
marker centre, px from the block's left edge:

| System | Basics (dark, light) | Research (dark, light) |
|---|---|---|
| N₂ | 166.8 / 166.8 | 167.7 / 167.7 |
| H₂⁺ | 71.7 / 71.7 | 74.3 / 74.3 |
| He₂ | 206.6 / 206.6 | 208.0 / 208.0 |

Equal to a tenth of a pixel everywhere. The Basics and Research values differ only because the rounded Basics labels
are narrower, so the plot's left margin is narrower too. The block's `blockOverflowX` now reads 0 for every system
(it was 1 px for N₂ and He₂ in Step 2), because the slider no longer spans the block's full width.

**4. A handle.** A 10 px dot in the first curve's colour (14 px with its 2 px ring), ringed in `selected-edge`
(Deep Space `rgb(31, 182, 245)`, Light Clean `rgb(22, 98, 224)`), with `--ql-shadow-selected-halo` in Deep Space and
none in Light Clean, as measured. Its 44 px hit area carries `cursor: ew-resize` and `touch-action: none`. The Rₑ line
stays green and dotted, beside it (`finish-aligned-n2-basics-light-zoom.png`).

**5. Units (ruled).** At Basics the readout and the slider's value text read "Distance between nuclei 1.10 Å", and the
phone caption reads "N₂ electron density · distance between nuclei 1.10 Å". From Explore both keep "R = 2.07 a₀
(1.098 Å)" and "R = 2.07 a₀". From Explore the x-axis reads "1.66 a₀ · R · 2.41 a₀" (H₂⁺ "0.50 a₀ · R · 10 a₀"); the
maximum is no longer fused into the title.

**6. Basics labels.** The energy ends are rounded to 2 significant figures, and 0 labels the separated-atoms line.
An end that would sit on the 0 gives way to it, which is N₂'s top end, 0.47. The labels read N₂ "0 … −9.9", H₂⁺
"8.2 · 0 · −4.1" and He₂ "1.4 · 0 · −0.26". He₂'s axis now starts a fifth of the span below zero at every level, so
its zero line stands about 15 px above the x-axis and the scan ticks. H₂⁺'s legend reads "bonding · antibonding ·
apart" at Basics; the words come from `curve.ts`. From Explore, H₂⁺ keeps "1σg · 1σu* · H + H⁺" and the ends their
three figures.

**7. Strip groups.** Labels are in section type (600 14/20, text-1) and sticky inside their group. They stand where
they are laid out at rest and hold 24 px from the list's edge once it has scrolled, just past the fade. Measured
`labelLeft` = 24 for 9l at the last tile, desktop and phone, and for 9g at mid. Phone labels break before "(":
"9g" / "(mₗ = -2)" (`finish-strip-n9-mid-dark-phone.png`).

**8. Desktop cue.** At n9-mid on the desktop the rest is scrollLeft 1337, 9g's snap margin is −57 px, and 9h starts at
706 of the strip's 763 px. Its first tile and its "9h" label sit clear of the fade (`finish-strip-n9-mid-dark-desktop.png`).
9g's first tile sits under the left fade, and its label holds at 24. Rule: a group whose own tiles end before the
view's edge plus a fade width snaps further on, so 32 px of the next group's first tile show clear of the fade. A
pick rests where a snap does when the picked tile is clear of both fades there; otherwise it is centred, as before.
For example, 9l's last tile is still centred.

**Done in `aed8e8d`.** DESIGN.md records the strip as picker, the sideways Tonal Scroll Cue, the Bond length block,
and the changes in this section: the open drawer label, the curve handle, and the sticky group labels.

### Fix round 1 (Task 5b review and finish verdict pass 1)

Commits: `55c2492` (handle and labels), `d832720` (drawer), `298b53b` (strip peek wiring). These shots were taken the
same way as above, on our own Vite on port 5413, under `--task pc-T5b2-*`. Every shot settled with 0 errors and 0
`/api` requests. `scenes.json` gains `bonds-h2plus-u` (R = 4 a₀, 1σu\* drawn, both curves on the plot) and
`bonds-h2plus-u-off` (R = 2 a₀, 1σu\* drawn, its curve above the plot).

| Item | Verdict | Shots |
|---|---|---|
| I1: the H₂⁺ handle rides the drawn state's curve | pass | `finish2-block-h2plus-u-basics-dark.png`, `finish2-block-h2plus-u-basics-light.png` |
| I2: off the plot, the handle is drawn hollow | pass | `finish2-block-h2plus-u-off-basics-dark.png`, `finish2-block-h2plus-u-off-basics-light.png` |
| M1 (ruling): the drawer's underlined tab and its own Close panel control, in Orbitals, Atoms and Bonds | pass | `finish2-drawer-orbitals-3dz2-research-{dark,light}-tablet.png`, `finish2-drawer-atoms-c-2pz-research-{dark,light}-tablet.png`, `finish2-drawer-bonds-n2-research-{dark,light}-tablet.png` |
| He₂'s 0 no longer crowds the bottom end label | pass | `finish2-block-he2-basics-dark.png`, `finish2-block-he2-basics-light.png` |
| M3/M6: the peek still shows at rest after the rewiring | pass | `finish2-strip-n9-mid-dark-desktop.png`, `finish2-strip-n9-mid-light-desktop.png` |

**I1 and I2.** With 1σu\* drawn at R = 4 a₀, the handle is filled in 1σu\*'s colour, measured as `rgb(255, 107, 107)`.
Its thumb is at 122.0 px and its marker at 122.1 px. At R = 2 a₀, 1σu\* (+9.05 eV) is above the plot's 8.16 eV top. The
handle then stands on the marker line at the top edge as a ring only, measured with background `rgba(0, 0, 0, 0)`. It
is still the thing to drag, and it is not read as a point at 8.2 eV. 1σg's own small value dot stays where 1σg is.

**M1.** No chevron sits between the bar's labels any more. The open tab ("Plot", "Data" or "View") is marked by a 2 px
text-1 underline and weight 600, with no accent and no fill. A separate "Close panel" control (a chevron in text-2,
44 px) sits at the bar's far right. The open tab still closes the drawer in one press, under its own name ("Plot
panel", "Data panel"). Esc still returns focus to that tab.

**He₂.** An end label now gives way to the 0 within 16 px (it was 12). At Basics He₂ reads "1.4" at the top and "0" at
the zero line, with no "−0.26" crowding the foot of the axis. Above Basics there is no 0 label, so nothing can overlap
at any level.

**M2.** A drag that starts on the handle's hit area keeps the offset from the handle's centre, so a press off-centre
leaves R where it was. A tap elsewhere on the curve still sets R at the tap. This is checked by unit tests, not a
capture.

**M3, M4 and M6.** At n9-mid the rest is unchanged: scrollLeft 1337, 9g's margin −57 px, and 9h at 706 of 763. The pick
rest now measures the shifts itself, so the strip scrolls once on load and a resize alone no longer scrolls it back.
Shifts are paired with groups by key. A tile that the shift would hide rests at its group's own snap before the strip
centres it. All of this is checked by unit tests.
