# Brass Instrument — live check (plan Task 5)

**Taken 2026-11-01 on branch `design/brass-instrument`, head `c92ac15`.** No product code was changed.

- **Method:** headless Chromium on the Mac's GPU (ANGLE Metal), Vite on port 5413 started and stopped inside each run, device pixel ratio 1 (2 for the crops). The level was set through `eov.level` and the theme through `eov.theme` before load. Each shot waits until the canvas has been quiet for 2.5 s, plus 1.5 s.
- **Shots:** `docs/quantumlab/checks/brass/shots/`. Every file was opened once and shows what its name says.
- **Contrast** is measured live, not from tokens. The text colour comes from the computed style, with ancestor opacity. The ground comes from pixels, with all text made transparent and the page re-shot; `min` is the worst pixel under the text and `med` the median. WCAG 2.x ratios.
- **Baseline for "was it already so":** `main` at `842a705`, run in a temporary detached worktree (removed afterwards).
- **Console:** every shot is free of page errors. The molecule shots log two `500` responses. They come from the job server's `/api` proxy, which points at a dead port by design (the "local job server isn't running" note in the panel), and they are not rendering errors.
- Canvas errors, blank canvases and half-loaded states: none.

## Result at a glance

| # | Check | Result |
|---|---|---|
| 1 | Scenes in both modes at 1492×905 | pass |
| 2 | Water ESP at 1280×720, both modes | pass |
| 3 | Phone 390×844: Basics Orbitals and water | pass |
| 4 | Temper steps (water ESP at Basics, Explore, Advanced, Research) | pass |
| 5 | Title contrast over the field | pass (min 7.4:1 over a lit lobe) |
| 6 | Drawer contrast at 1024 light | pass (min 4.55:1) |
| 7 | Field dark in both modes; page chrome keeps the page mode | pass |
| 8 | Graticule | pass |
| 9 | Top bar 761–1100 px with the wider wordmark | **FAIL — defect D1** |
| 10 | Phone bar 320–360 px with the wider wordmark | **FAIL — defect D2** (the baseline also overlapped at 320 and 340) |
| 11 | Long 26 px title, including request-open | pass |
| 12 | Phone landscape light: Bonds, Basic, Atoms and Molecules headers | pass |
| 13 | Drilled-down Atoms strip on phone light, back-tile arrow | pass |
| 14 | Toggle-group middle selected button, brass left border | pass |
| — | Finish review | pending (controller) |
| — | DESIGN.md | pending (controller) |

## Defects (not fixed: the brief says report, don't fix)

### D1. The top bar's account button is pushed off-screen at 761–~811 px and 1101–~1146 px

The wider serif wordmark makes the brand 188 px wide (155 px on `main`). The tabs, the level control, the search and the actions are fixed or at their minimum, so the avatar button ends past the viewport edge. The bar clips it, with no horizontal scroll and no overlap, so the button is simply gone.

How far past the right edge the avatar button ends (px). Dark and light measured the same; Explore was measured at the widths shown in the first table.

| Viewport width | Basics | Explore | Advanced | Research | `main` (`842a705`) |
|---|---|---|---|---|---|
| 761 | 33 | 39 | 56 | 51 | Research 16, others 0 |
| 800 | 0 (−6) | 0 | 17 | 12 | 0 |
| 900, 1000 | 0 (−16) | 0 (−16) | 0 (−16) | 0 (−16) | 0 |
| 1100 | 41 | 25 | 26 | 25 | 0 |

A 5 px sweep of 761–1200 px (Basics and Research, the two ends of the level control's width) finds exactly these clipped ranges:

| Level | Brass | `main` |
|---|---|---|
| Basics | 761–791 and 1101–1146 (max 33 and 40 px) | none |
| Research | 761–811 and 1101–1126 (max 51 and 25 px) | 761–776 (max 16 px) |

At 1160 px and wider, and at 820–1000 px, the button is fully on screen.

Shots: `shots/topbar-dark-761.png`, `shots/topbar-light-761.png`, `shots/topbar-dark-1100.png`, `shots/topbar-light-1100.png`. The 761 shots show Orbitals, Atoms, Bonds, Molecules, Explore, search and theme/help with no account button; the 1100 shots show theme/help and cut off at the avatar. All four are Explore level.

Measured boxes (Explore, 761 px, dark): brand 16–204, tabs 228–495, level 519–600, compact search 624–660, actions 684–800 (viewport 761). No two children overlap and the minimum gap is 24 px, so overlap is not the failure; the row is simply wider than the viewport.

### D2. On a phone narrower than 370 px the wordmark collides with the mode button

The brand link shrinks with the row, but the serif wordmark does not (it is 125 px of text, 40–165). It spills out of the link and over the "Molecules" mode button.

| Viewport width | Brand link box | Wordmark glyphs end at | Mode label starts at | Glyph overlap, brass | Glyph overlap, `main` |
|---|---|---|---|---|---|
| 320 | 8–129 | 165 | 128 | 37 px | 21 px |
| 340 | 8–142 | 165 | 144 | 21 px | 5 px |
| 360 | 8–155 | 165 | 160 | 5 px | 0 px |
| 370 | 8–161 | 165 | 169 | 0 | 0 |
| 380–400 | 8–165 | 165 | 172+ | 0 | 0 |

The overlap is the same in Basics and Research, in light and dark. The element-box check (link boxes, no overlap) passes, so the collision is only found by measuring the text glyphs. The baseline already collided at 320 and 340; the wider wordmark makes it worse and extends it to 360.

Shots: `shots/phonebar-light-320.png`, `shots/phonebar-dark-320.png`, `shots/phonebar-light-340.png`, `shots/phonebar-light-360.png`. At 360 the "b" touches the "M".

## 1. The four scenes in both modes at 1492×905

Each scene has a dark and a light shot. The levels are Basics for Orbitals, Advanced for Atoms, Research for Molecules.

| Scene | Dark | Light |
|---|---|---|
| Basics Orbitals 2p_z (`#mode=basic&n=2&l=1&ml=0`) | `shots/2pz-basics-dark-desktop.png` | `shots/2pz-basics-light-desktop.png` |
| Advanced Atoms Mg 3s→3p (`#mode=atom&Z=12&excite=3s-3p&level=atom`) | `shots/mg-3s3p-advanced-dark-desktop.png` | `shots/mg-3s3p-advanced-light-desktop.png` |
| Research Molecules water ESP (`#mode=molecule&id=h2o&show=esp`) | `shots/water-esp-research-dark-desktop.png` | `shots/water-esp-research-light-desktop.png` |
| Research benzene (`#mode=molecule&id=benzene`) | `shots/benzene-research-dark-desktop.png` | `shots/benzene-research-light-desktop.png` |

Measured on each: all page text on its ground (68–96 text runs per shot) clears 4.5:1 at the median, with no failures. The tightest page text is the ⌘K chip in the search (4.52–4.57:1) and, in Basics light, the "X Y Z" cut-away toggle labels (4.55:1, see note N1). The title block does not overlap the toolbar in any of them.

Page chrome against the spec palette, sampled from the Explore shots (hex from the sampled pixels): dark workspace `#141513`, dark panel `#22231F`, light workspace `#F4F0E6`, light panel `#FFFCF5`. These are exact.

**Pass.**

## 2. Water ESP at 1280×720

`shots/water-esp-research-dark-1280.png`, `shots/water-esp-research-light-1280.png`.

Layout is the medium form: the left column and the canvas fill the width, and the inspector folds to a "View" tab on the right. No overlap between the title (336,80, 624×110) and the toolbar. Title contrast is 15.5:1 (dark) and 15.15:1 (light) for the h1 and 8.79 and 8.59 for the subtitle. The search placeholder is cut ("Search elements, mo") with a 143 px input; `main` has the same 143 px input and the same clip (note N2).

**Pass.**

## 3. Phone 390×844

| Scene | Dark | Light |
|---|---|---|
| Basics Orbitals 2p_z | `shots/2pz-basics-dark-phone.png` | `shots/2pz-basics-light-phone.png` |
| Research water ESP | `shots/water-esp-research-dark-phone.png` | `shots/water-esp-research-light-phone.png` |

In both modes the 3D field is dark. In light the top bar, the caption, the molecule picker and the sheet's bottom bar are light page chrome, as the spec says; the scale bar and the colour key sit in the dark overlay. Caption ink on its light pill is 14.4:1 and 13.7:1. The lowest text on the page is the "·" separator at 6.0–7.2:1. The wordmark on the phone is brass, not ink (note N5), at 5.22:1 in light. No horizontal scroll.

**Pass.**

## 4. Temper steps (water ESP, desktop)

| Level | Dark | Light |
|---|---|---|
| Basics | `shots/water-esp-basics-dark-desktop.png` | `shots/water-esp-basics-light-desktop.png` |
| Explore | `shots/water-esp-explore-dark-desktop.png` | `shots/water-esp-explore-light-desktop.png` |
| Advanced | `shots/water-esp-advanced-dark-desktop.png` | `shots/water-esp-advanced-light-desktop.png` |
| Research | `shots/water-esp-research-dark-desktop.png` | `shots/water-esp-research-light-desktop.png` |

Sampled page ground and panel ground (RGB):

| Level | Dark ground | Dark panel | Light ground | Light panel |
|---|---|---|---|---|
| Basics | 24,20,14 | 39,34,28 | 248,239,224 | 255,251,236 |
| Explore | 20,21,19 | 34,35,31 | 244,240,230 | 255,252,245 |
| Advanced | 19,21,19 | 33,35,33 | 242,240,233 | 254,252,245 |
| Research | 16,22,24 | 30,36,38 | 236,241,243 | 248,253,255 |

Basics is the warmest and brightest, Explore is the reference, Advanced is a touch cooler, Research is cool graphite. The steps are visible but slight, as intended. The molecule has the same size in the four shots and the field corner sample is the same (dark 11,12,10; light 26,26,23); the four title boxes are identical (351,80, 559×126). Read off the screenshots, the molecule in Basics sits about 6 px further left than in the other three (x 513–780 against 519–785): Basics has a different key column and strip, and so a different view inset. Explore, Advanced and Research are identical. The Basics type is visibly larger in the Display and Info text. I did not measure the font sizes.

**Pass.**

## 5. Title contrast over the field

Measured with the title text hidden, the page re-shot and the ground sampled under the title's own glyph boxes.

| Shot | h1 colour | h1 min : 1 | Subtitle colour | Subtitle min : 1 |
|---|---|---|---|---|
| 2p_z Basics, dark | 238,231,216 | 15.49 | 189,173,154 (dark) | 8.68 |
| 2p_z Basics, light | 238,231,216 | 15.14 | same | 8.53 |
| Mg Advanced, dark / light | 238,231,216 | 15.40 / 15.13 | | 8.78 / 8.62 |
| Water ESP Research, dark / light | 238,231,216 | 15.50 / 15.15 | | 8.79 / 8.59 |
| Water ESP Basics / Explore / Advanced, dark | 238,231,216 | 15.49 / 15.49 / 15.49 | | 8.72 / 8.77 / 8.83 |
| Water ESP Basics / Explore / Advanced, light | 238,231,216 | 15.14 / 15.14 / 15.14 | | 8.53 / 8.57 / 8.63 |

The parked case from Task 1, "text-2 over a lit lobe", was measured with the camera zoomed in so the object sits behind the title (`shots/titlelobe-n9s-basics-light-1024.png`, 1024×640, Basics 9s and 9f, and water ESP):

| Scene | h1 min | Subtitle min | Floor |
|---|---|---|---|
| Hydrogen 9s, Basics | 13.22 | 7.51 | 3 (large) / 4.5 |
| Hydrogen 9f z³, Basics | 13.16 | 7.40 | |
| Water ESP, Research | 14.28 | 8.11 | |

The same numbers come out in dark and light, since the field and the scrim are the same in both. The scrim keeps the subtitle at 7.4:1 or better even over a lit lobe, so Task 1's 3.7:1 worry does not occur.

**Pass.** Floor is 4.5:1 (3:1 for the 26 px h1).

## 6. Drawer contrast at 1024×768, light

Drawer opened (`.inspector-drawer`, 292×688 at 720,68), every text run measured against its own ground. Light shots: `shots/drawer1024-2pz-basics-light.png`, `shots/drawer1024-water-esp-explore-light.png`, `shots/drawer1024-water-esp-research-light.png`. Dark measured too, no shot.

| Scene and level | Text runs | Lowest median | Light result | Dark lowest |
|---|---|---|---|---|
| 2p_z, Basics | 27 | 4.55 ("X", the toggle label, note N1) | pass | 5.63 |
| Water ESP, Basics | 25 | 4.55 (same) | pass | 5.63 |
| Water ESP, Explore | 38 | 4.84 ("Method:") | pass | 5.67 |
| Water ESP, Advanced | 42 | 5.36 | pass | 5.73 |
| Water ESP, Research | 42 | 5.35 | pass | 5.67 |
| Mg 3s→3p, Advanced | 34 | 4.83 (the plot's "0"; worst single pixel 4.09, on a gridline) | pass | 5.73 |

No text run in the drawer falls below 4.5:1 at the median at any of the four levels, in light or dark. The drawer is light page chrome over the dark field, as designed (spec B4).

**Pass.**

## 7. Field dark in both modes, page chrome in the page's mode

Field sampled just inside the canvas, at the bottom centre and the left and right edges: dark mode (12,13,11) / (15,16,14); light mode (28,28,25) / (31,31,28). The light field is therefore the charcoal of the spec, not a light surface. The top bar, left column, Info panel, drawer, phone top bar, caption and sheet are light in light mode. Both modes show the same science colours, and the brass overlays (scale bar, keys, thumbnail strip, toolbar) are dark in both.

The 1280 light shot's right-edge sample (248,253,255) is the drawer's "View" tab, which is page chrome, not the field.

The request workspace (`shots/request-open-glycine-research-light-1280.png`) is a dark panel in both modes, because it sits in the viewing field's scope. It is consistent with the overlays. If the owner wants it to follow the page, that is a one-scope change.

**Pass.**

## 8. Graticule

`shots/graticule-scalebar-explore-dark.png`, `shots/graticule-scalebar-explore-light.png` (device pixel ratio 2).

- The scale bar is a 1 px brass rule (196,161,90) with 2 end ticks (8 px high) and 4 graduations (4 px high), 6 ticks in all, over a readout ground of (42,42,40). The rule is 5.88:1 against the readout. The label ("10 a₀") is ivory (238,231,216) at 11.68:1.
- The dark and light shots are identical, since the readout sits in the dark field scope.
- The axes (visible in the 2p_z shots) are a warm neutral grey-beige with ivory x/y/z labels, with no blue. The axis line is thin and low in contrast against the field by design.

**Pass.**

## 9. Top bar 761–1100 px

**Fail, defect D1 above.** No overlap anywhere in 761–1100 (minimum gap 16–24 px); the failure is the avatar button past the right edge. The wordmark itself is fine (Source Serif 4, 108 px of text in a 188 px brand). The search collapses to an icon from 761 to 1000 px and returns at 1100 px at 110 px wide.

## 10. Phone bar 320–360 px

**Fail, defect D2 above.** No overlap of the controls' boxes at any width from 320 to 390, nothing past the right edge (largest right edge 312 of 320), and no horizontal scroll. The wordmark's glyphs collide with the mode label under 370 px.

## 11. Long 26 px title, including request-open

The longest titles found at 1024 px are the excited ions, such as "Gadolinium ion Gd³⁺, excited 4f → 5d — whole atom" (two lines at 1024 px, one at 1280 px).

| Shot | Title box (x,y,w×h) | Toolbar box | Overlap |
|---|---|---|---|
| `shots/longtitle-gd3-excited-advanced-light-1024.png` | 336,80, 408×104 (2 lines) | 752,80, 204×36 | none |
| `shots/longtitle-gd3-excited-advanced-dark-1280.png` | 336,80, 662×72 (1 line) | 1008,80, 204×36 | none |
| `shots/request-open-glycine-research-dark-1492.png` | 812,124, 354×146 | 962,80, 204×36 | none (and none with the workspace, 339–800) |
| `shots/request-open-glycine-research-light-1280.png` | 855,124, 357×146 | 1008,80, 204×36 | none (workspace 324–843) |

With the request workspace open the title block moves beside it, under the toolbar's row, as designed, and the 26 px serif wraps cleanly. Contrast is 15.1–15.5:1 for the h1 and 8.6–8.7:1 for the subtitle. The request panel's own text clears 4.5:1 (lowest median 6.69:1).

One observation, not a brass change: at 1492 px with the workspace open the scale bar's right end tucks under the ESP colour key (see the bottom of the glycine shot). The scale bar's width follows the canvas, so it is the same on `main`.

**Pass.**

## 12. Phone landscape (844×390), light — Bonds, Basic, Atoms, Molecules

`shots/landscape-bonds-n2-research-light-844x390.png`, `shots/landscape-basic-3dz2-basics-light-844x390.png`, `shots/landscape-atom-mg-advanced-light-844x390.png`, `shots/landscape-water-research-light-844x390.png`.

In every one the header (mode button, search, account, and the element or molecule picker), the caption pill, and the sheet's bottom bar are light page chrome over the dark field. All are readable: the lowest text on any page is 6.0–6.2:1 (the "·" separator). The header box is 82 px high at (8,8) and the caption pill is 28 px high below it (y 62–90); neither overlaps the scale bar, the key or the picture. There is no toolbar in this layout. There is no bare, unstyled page chrome on the canvas: the one other chip, the "Library" tier badge on Molecules, is a light chip with ink text, in the same page mode. The Bonds readout "ρ = 0.002 e/a₀³ …" is a dark overlay.

**Pass.**

## 13. Drilled-down Atoms strip on phone light

`shots/phone-atoms-fe-shell3-advanced-light-sheet.png` (Fe, M shell, sheet open at Explore).

The back tile ("Whole atom") has a dark picture with an ivory arrow, rgb(238,231,216), even though the sheet is light. The tile ground samples at (41,44,41)–(45,48,45), so the arrow reads at 10.9–11.6:1. The tile labels and the sheet are light chrome. The strip scrolls (nine tiles at 56 px); the back tile, 3s, 3p tiles are on screen first.

**Pass.** (The same arrow also appears on the phone header's "←" button, in light, which is page chrome by design.)

## 14. Toggle-group middle selected button

`shots/toggle-cutaway-y-basics-dark.png`, `shots/toggle-cutaway-y-basics-light.png`, `shots/toggle-relativity-scalar-advanced-light.png` (device pixel ratio 2).

Computed in the browser for the selected middle button:

| Case | Left border | Right border | Selected ground | Edge vs panel | Edge vs selected ground |
|---|---|---|---|---|---|
| Cut-away "Y", Basics, dark | 1 px solid rgb(218,170,84) | same | rgb(68,50,18) | 7.67:1 | 5.76:1 |
| Cut-away "Y", Basics, light | 1 px solid rgb(142,96,17) | same | rgb(248,225,195) | 5.33:1 | 4.32:1 |
| Relativity "Scalar", Advanced, light | 1 px solid rgb(121,93,36) | same | rgb(241,227,202) | 6.0:1 | 4.87:1 |

The unselected neighbours have a transparent left border, and the one before the selected button keeps its neutral right border. The brass left edge is visible in all three crops, with no gap or doubled line at the junctions. Selection is a brass edge plus tinted fill plus ink, never colour alone.

**Pass.** (Every edge clears the 3:1 floor.)

## Notes (not defects of this change)

- **N1.** In Basics light, the unselected cut-away labels "X Y Z" are `rgba(0,0,0,0.54)`, MUI's default toggle colour, not a token (4.55:1, just above the floor). They read a little neutral-grey next to the warm ink. Selected and Explore-and-above toggles use tokens. One token on the Basics toggle would fix it.
- **N2.** The search placeholder is clipped at 1160–1280 px (the input is 121–143 px wide for a 184 px placeholder). It is identical on `main`, which has the same widths. Not a brass regression.
- **N3.** Phone light uses a light caption pill over the dark field (page chrome by design, spec B4 and Task 3 brief item 4); it reads at 13.7–14.4:1.
- **N5.** Spec B3 says the wordmark is "brass; ink on the phone". On the phone it is brass in both modes (bronze `#806020` family in light, 5.22:1), not ink; Task 2's brief set one accent-text colour for both. It reads well. If the spec's wording is meant literally, it is a one-rule change in `src/shell/phone_top_bar.css`.
- **N4.** The 500 responses on molecule scenes are the dead local job server (the panel says so).

## Pending

- **Finish review:** pending (controller).
- **DESIGN.md:** pending (controller).
