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
