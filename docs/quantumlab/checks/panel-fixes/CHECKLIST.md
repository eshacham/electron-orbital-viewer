# Panel fixes — live check (Task 5)

**Taken 2026-11-02 at `f8aacd2`** (branch `design/panel-fixes`; Tasks 1-4 on top of `401694b`). Own Playwright
(Chromium, `--use-angle=metal --ignore-gpu-blocklist`), Vite on port 5413 started and stopped inside each run.
Level via `eov.level`, theme via `eov.theme`, panel width via `eov.inspectorWidth`, all written before load.
Shots are in `shots/` (PNG, force-added: `*.png` is gitignored). Every shot was opened with Read once (a few in
2x2 contact sheets) and shows what its name says. The only console errors seen are `/api/v1/jobs` 500s on the
Molecules screen (the job server is not running; the page says so) — not from this branch.

**Result: all 7 checks pass after two rulings.** P4 passes under ruling T5-P4: the light field is a deliberately lighter charcoal. The Check 2 layout defect (1300 px with a 560 px panel collapsed the Library badge) is fixed in 3f82e6c (ruling T2-max): the separator's maximum keeps the 3D view at 520 px or more, which gives 417 px at 1300. The re-shot is `shots/panel-water-research-560-dark-1300-after-max.png`; the Library line wraps tall in the narrow title box but reads. "Finish review": pending (controller).

## 1. Orbitals — Construction (Task 1), Advanced, 1492x900, both themes — PASS
Shots: `shots/orbitals-single-{dark,light}-1492.png`, `orbitals-hybrids-sp3-all-{dark,light}-1492.png`,
`orbitals-field-n2-{dark,light}-1492.png`.
- Single `#mode=basic&n=2&l=1&ml=0`: group reads Single orbital (pressed) · Hybrids · Electric field; **9 Shell n
  chips** (n = 1..9) under it.
- Hybrids `#mode=basic&combo=sp3`: Hybrids pressed, link rewrites to `combo=sp3&member=all`; **0 Shell n chips**;
  sp / sp² / sp³ and All / h₁..h₄ shown.
- Electric field `#mode=basic&combo=field&level=2&F=0.003`: Electric field pressed; **0 Shell n chips** (the two
  "n = 1 / n = 2" buttons are the Level control, not Shell n). F = 0.01 is refused at n = 2 (limit about 0.0039 a.u.)
  — the refusal card is the app working as designed, so 0.003 is shot.
- Light theme: viewing field stays dark, chrome is Ivory; nothing clipped.

## 2. Right panel width and the radial plot (Task 2), Research — PASS, with one layout concern
Shots: `panel-orbitals-research-{default,560}-dark-1492.png`, `panel-water-research-{default,560}-{dark,light}-1492.png`,
`panel-n2-research-{default,560}-{dark,light}-1492.png` (light: water default and 560, N₂ 560), `panel-water-research-560-dark-1300.png`, `panel-water-research-560-stored-dark-1280.png`,
`panel-water-research-drawer-open-dark-1280.png`.
- Default at 1492: separator `aria-valuenow` 290, min 290, max 560, separator at x = 1181; panel content 241 px.
- Stored 560 at 1492: valuenow 560, content 511 px, separator at x = 911. Orbitals radial plot SVG: **241 px at the
  default, 511 px at 560** — it follows the panel.
- 1300 px (narrowest docked): stored 560 is honoured (max = min(560, 45 % of 1300 = 585) = 560); separator x = 719.
- **1280 px: the panel is the folded drawer** (no separator in the DOM, "View" tab on the right edge), stored 560 is
  **ignored**; opened drawer is about 290 px wide (`panel-water-research-drawer-open-dark-1280.png`).
  45 % of the viewport never binds in the docked range (it is < 560 only below 1245 px, where the drawer applies).
- **Concern (not fixed): at 1300 px with the panel at 560, the Molecules stage is 377 px wide and its Library
  provenance banner collapses** (`panel-water-research-560-dark-1300.png`): the "Library" badge is 47 px wide and
  its text overflows (`scrollWidth > clientWidth`), the sentence "Curated; geometry from experiment; dipole checked
  against published values." sits in a column about 75 px wide (nine lines), the title "Water (H₂O)" wraps to two
  lines, and the molecule sits off-centre. Comparison (stage width, badge): 1492/default 839 px, badge 57; 1300/default
  647 px, badge 57; 1492/560 569 px, badge 57 and the sentence wraps to four lines (acceptable); 1300/560 **377 px,
  badge 47 and overflowing**. The permitted maximum (560 at the lowest docked width) leaves the stage too narrow for
  that banner. Reported for a ruling (e.g. a stage minimum in the clamp, or letting the banner stack).

## 3. Info — Method · Limits · Sources (Task 3), Research — PASS
Shots: `panel-water-research-{default,560}-{dark,light}-1492.png` (scrolled to Method),
`panel-n2-research-{default,560}-dark-1492.png`, `panel-n2-research-560-{limits,sources}-dark-1492.png`,
`panel-n2-research-default-limits-dark-1492.png`, `panel-n2-research-560-light-1492.png`.
- Headings are 12 px, weight 600, Inter, colour `rgb(181,175,162)` dark / `rgb(98,92,80)` light (text-2).
- **Water: Method and Sources only; Limits absent** (no empty heading). **N₂: Method, Limits, Sources**, in that order
  (tops 49 / 192 / 356 px at 560, ascending). "How this was computed" is open at Research.
- The three blocks are not separately foldable; the outer disclosure stays.
- At the 241 px default the sentences wrap tightly but stay inside the panel; at 560 they read at about 2 lines each.

## 4. Atoms — rings and shell chips (Task 4), Fe whole atom, Advanced, 1492 — PASS
Shots: `fe-whole-nohover-{dark,light}-1492.png`, `fe-whole-chipM-hover-{dark,light}-1492.png`,
`fe-whole-ring-hover-{dark,light}-1492.png`, `fe-whole-chip-keyboard-focus-{dark,light}-1492.png`.
- No hover: no chip linked. Pointer scan along the cut face's horizontal axis links N, M, L, K, L, M, N in order
  (x = 600..792).
- **Chip → ring:** hovering the M chip links it and draws a brass circle on the cut face; diff against the no-hover
  frame: 725 px, bbox 70 x 72 px centred on the atom (radius about 35 px), mean colour `rgb(195,160,90)` against
  `#C4A15A` = `rgb(196,161,90)`. The plot's hover line and "r = 0.97 a₀ — n=3 valence" follow. The circle has the dark casing and
  reads on the warm M ring. Identical in both themes (the field is dark in both).
- **Ring → chip:** pointer at (660, 443) draws a 824 px circle (same brass) and links the M chip; the plot readout
  follows ("r = 1.11 a₀ — n=3 valence" in light).
- **Linked chip style:** dark `background rgb(51,51,48)` + `box-shadow rgb(189,157,92) 0 0 0 1px inset`; light
  `rgb(235,234,226)` + `rgb(122,92,32) 0 0 0 1px inset` (surface-3 and the selected edge).
- **Leave clears:** pointer to (5, 5): no linked chip, both themes.
- **Keyboard:** focusing a chip (roving tabindex put the focus on K) links it and draws the circle (readout "r = 0.00 a₀ — n=1");
  Tab to the next control clears it.

## 5. Phone — nothing changed except Construction (390x844, touch) — PASS
Shots: `phone-orbitals-advanced-{dark,light}-390.png` (stage), `phone-orbitals-advanced-explore-sheet-{dark,light}-390.png`,
`phone-orbitals-advanced-explore-sheet-BASELINE-401694b-dark-390.png`.
- No resize separator, no horizontal scroll (scrollWidth 390).
- Built the baseline (`git archive 401694b`, same Vite, own temp copy) and shot the same states. Pixel diff
  (any channel > 24): **0 px** on the stage, the Info sheet, the View sheet and the Plot sheet in both themes. Element
  rectangles are identical there (0 moved).
- The Explore sheet differs only by design: the "Combination" select is replaced by the Construction segmented group
  (Single orbital · Hybrids · Electric field) above Shell n, which moves down 52 px; the Shell n chips are the same.

## 6. Keyboard (Review Focus 5) — PASS (limited)
The separator is in the tab order (`role=separator`, `aria-valuenow/min/max` as above); arrow behaviour and focus ring
are covered by `tests/shell/inspector_resizer.test.tsx`. Not exercised live beyond the attributes.

## 7. P4 — Mg 3s→3p, Advanced, both themes, 100 % and 45 % — PASS (ruling T5-P4)

**Ruling T5-P4 (controller):** pass. The light theme's field is a deliberately lighter charcoal (brass spec B4: `#20201D` against dark's `#10110F`). The model's surface colours are pixel-identical at 100 % and within 3–4 levels at 45 % (blended over the lighter backdrop), so the light theme reads as well as the dark one. The spec's "identical" wording was too strict and is corrected.

Shots: `mg-3s-3p-{dark,light}-op{100,45}-1492.png`. Link `#mode=atom&Z=12&excite=3s-3p&level=orbital&n=3&l=1&ml=0&cam=30,20&op={1,0.45}`
(fixed camera so the two themes frame the same pixels).

| point (screen px) | 100 % dark | 100 % light | 45 % dark | 45 % light |
|---|---|---|---|---|
| field (450, 350) | 16,17,15 | 32,32,29 | 16,17,15 | 32,32,29 |
| field (1100, 500) | 15,16,14 | 31,31,28 | 15,16,14 | 31,31,28 |
| field (800, 250) | 19,20,18 | 35,35,31 | 19,20,18 | 35,35,31 |
| field (420, 560) | 15,16,14 | 31,31,28 | 15,16,14 | 31,31,28 |
| surface, blue lobe (700, 340) | 28,59,142 | 28,59,142 | 78,89,118 | 81,92,120 |
| surface, orange lobe (700, 540) | 138,63,22 | 138,63,22 | 120,63,30 | 124,67,34 |

- **Surface (100 %): identical to the pixel** — the science colours are the same in both themes.
- **Field: not identical.** Light's field is lighter by +16, +15, +14 (R, G, B) at every point sampled; over the canvas stage
  (680 x 450 px) 251,269 of 306,000 pixels differ by > 8, max 15. The page chrome differs too, as expected.
- **At 45 % the surface differs by 3-4 levels** (blue 78,89,118 vs 81,92,120; orange 120,63,30 vs 124,67,34): the
  translucent surface blends with the lighter field behind it. The readability of the surface in light is not worse.
- **Cause (read, not changed):** `VIEWPORT_MODE` makes the renderer, overlays and science colours dark in both modes,
  but `src/design/tokens.ts:197-198` says "the backdrop itself stays the page mode's own `canvas` (light's is a
  charcoal field)": dark `#1B1C19 → #10110F → #0B0C0A`, light `#2A2A26 → #20201D → #1A1A17` (tokens.ts:155, 170); the brass
  spec §Rendering also gives light a charcoal `#262622 → #1C1C19` field. So the panel-fixes spec P4 sentence "The field is
  identical (`VIEWPORT_MODE`)" is stricter than the design. No code change planned in P4; reported for a ruling:
  either accept (the surface and science colours are identical; the backdrop is a shade lighter by design) or make
  light's backdrop the dark one.

## Gates
Not re-run here (no product code changed in this task).
