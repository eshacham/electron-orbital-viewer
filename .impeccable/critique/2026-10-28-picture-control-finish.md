# Finish review — the picture is the control (2026-10-28, HEAD fe03403)

disposition: fix

Inputs and limits: there is no QUALITY BAR card, so the ceiling is judged against DESIGN.md's named rules. This is a code-led build, so there is no approved comp, no state.json and no comp-diff. I set aside `.impeccable/review/*.png` because it dates from Oct 26, before this build, and used the 68 CHECKLIST shots plus the two extra-width shots (1280, 1920) as the desktop, drawer and phone set. I viewed 19 of the 70 shots; every one is valid and the right size. The `impeccable` CLI is not installed, so I could not run `--check-seed`; the seed is corroborated by `.impeccable/questions/seeds/4e476c80448e1899.json`. No capture shows the Bonds curve on a phone, a drag in progress, the loading state, or keyboard focus on the strip or slider. I did not start Vite, because my instructions forbid rendering. I did not read RULINGS.md, PRODUCT.md's body, design.json, the bonds critique file, or any code beyond `strip.css`, `PotentialCurvePlot.tsx`, `inspector.css` and the `style.css` diff.

## persistence
Pass, with one gap.
- **PRODUCT.md** exists.
- **Comps and state:** no comp round was needed, because the build is code-led. `.impeccable/mocks/` holds only `decision/` and `decision-levels/`, which are exempt, and no state.json is required.
- **Seed:** FORM carries `seed:4e476c80448e1899`, which is a reference, not a raw key.
- **DESIGN.md gap:** DESIGN.md predates this build and does not yet describe what was built: the strip as the picker, the sideways twin of the Tonal Scroll Cue Rule, and the "Bond length" block. CHECKLIST Step 3 already lists this as pending for the documenter.
- **Colours:** `git diff 8688b35..fe03403 -- src public` touches no colour value, Glow or Atoms rule. The science colours are unchanged.

## fidelity
There is no comp, so each row is judged against the owner-confirmed brief and OWN-WORLD.

| Element | Verdict |
|---|---|
| TYPE (Inter, tabular figures, sizes unchanged) | match |
| MATERIAL (no imitation material; the tile's radial lift was there before this build) | match |
| GROUND (Deep Space navy and Light Clean pale ground, as OWN-WORLD names; no colour token changed) | match |
| Orbitals left panel keeps Shell n only; Combination select at Advanced and above | match |
| Strip is the picker, grouped s · p · d · f · … | match |
| Group labels at n=9 | **contradicted**. A label sits only over its group's first tile, so it scrolls away with it. At 9l, the last tile, on desktop (`orb-basics-basic-n9-light-desktop.png`) and at n9-mid on a phone (`orb-basics-basic-n9-mid-dark-phone.png`), no group label is on screen. Tile labels carry the subshell, which softens this but does not meet "each group is labelled". |
| Scroll cue on phone (n9, n9-s, n9-mid) | match. A cut tile and a fade show on the correct edge. |
| Scroll cue on desktop at a group-snapped rest | **contradicted** (it is true but you cannot see it). In n9-mid, 9g fills the strip exactly. The right fade lands on the whole m = +4 tile, and nothing from 9h, 9i, 9k or 9l peeks in. The 40 tiles beyond have to be inferred. |
| Selected tile easy to find (dark cyan ring with glow; light 2 px accent ring; bold label) | match at every n and on phone |
| The selected tile's group scrolls into view | match |
| Info's (i)s moved to Info's fact labels | adaptation, cited by the Task 1 ruling in progress.md (spec §7) |
| Bond length block in one panel at 1280, 1440, 1920 and the 1024 drawer, every level | match |
| Bond length block on phone | **contradicted** against the outcome "watch the curve's marker and the 3D bond move together". In every phone shot the Explore sheet opens on the strip, the identity card and the molecule select. The slider sits at the fold, and for H₂⁺ (`bonds-h2plus-basics-light-phone.png`) it sits under the tab bar. The curve is never on screen with the picture, and no shot captures it on a phone at all. |
| Slider and curve as one instrument | **contradicted**. The slider track spans the block's full width, but the curve's x-axis starts after the y-label gutter. The thumb therefore sits 12 px (N₂) to 30 px (H₂⁺) to the left of the marker, so they read as two stacked instruments. |
| The curve invites a tap or drag | **missing**. The marker is a 1 px dashed hairline (`.potential-marker`, 3 2 dash, `text-1`) with 3 px dots and no handle. Touch gets no hint at all, and the mouse gets only `cursor: pointer`. |
| Rₑ line, green and dotted, distinct from the marker | match |
| Basics axes "Energy (eV)" and "Distance between nuclei (Å)"; "most stable" | match |
| Basics R readout "R = 2.07 a₀ (1.098 Å)" | **contradicted**, an uncited deviation. It leads with a₀ at Basics, while the curve below speaks Å. The block shows R three ways: 2.07 a₀, 1.098 Å and 1.10 Å. The phone caption also reads "R = 2.07 a₀". |
| Basics energy tick values (0.472 / −9.91; 8.16 / −4.08; 1.37 / −0.0662) | **contradicted**. Basics calls for rounded values, but these are raw extremes, and the separated-atoms zero line has no label. |
| He₂ curve floor | **contradicted**. The zero line and the x-axis sit about 4 px apart with the snap-tick comb between them, so they read as a hollow bar (`bonds-he2-basics-light-desktop.png`, `-tablet.png`). |
| H₂⁺ legend at Basics, "1σg / 1σu* / H + H⁺" | **contradicted**. It is technical where N₂'s legend ("separated atoms") is plain. |
| Research x-axis ends ("1.66" … "R (2.41 a₀ · 1.27 Å)"; H₂⁺ "0.5" … "R (10 a₀ · 5.29 Å)") | **contradicted**. The left end has no unit, and the right end is fused into the axis title so it reads as "R in units of 10 a₀". |
| He₂ has no well and no Rₑ line; H₂⁺ shows two exact curves | match |
| Right panel at Basics shows Display plus "Data appears at Explore"; at Research, Display plus Data | match |
| 1024 drawer, open | **contradicted** (layout). The inspector bar stacks above the panel as a full-width, 56 px, `selected-fill` bar, with "View" or "Data" set in `writing-mode: vertical-rl` (`inspector.css:61-67`). It is the loudest blue on screen, which breaks One Blue Voice. The bar predates this build, but this build relabelled it, and the drawer fails the brief's check. |
| Data drawer's Kohn–Sham line | Minor: its "·" separator falls onto a line of its own. |
| Loading state ("updating", nothing stale) | not captured, so not judged |

## ceiling
No card was supplied, so this is judged against DESIGN.md. Three of the world's own devices go unused on the new controls:
- **Deep Selection on the curve.** The `selected-edge` ring and the Deep Space halo the selected strip tile wears belong on the R marker, so that the thing you drag looks like the thing you selected.
- **The Tonal Scroll Cue's honesty on desktop.** The phone strip has it; at a group-snapped desktop rest it is lost.
- **Section type for the strip's group labels.** At 500 11 px in `text-3`, the s · p · d labels are the quietest text on the canvas, even though they are now a menu's headings.

## material_fixes
1. **Fidelity, phone Bonds.** Put the "Bond length" block (readout, slider, curve) directly under the strip in the Explore sheet, above the identity card and the molecule select. The curve then shares the screen with the picture, and the H₂⁺ slider comes out from under the tab bar. Then capture the curve on a phone, which no shot shows today.
2. **Fidelity, 1024 drawer.** Seat the inspector bar beside the open panel as a rail, or give the open state a horizontal, quiet label. Remove the full-width, vertical-text, `selected-fill` bar that sits above Info (`inspector.css:56-67`).
3. **Fidelity, one instrument.** Inset the R slider's track by the plot's own `left` and `PAD.right`, so that the thumb stands directly over the curve's marker at every R.
4. **Fidelity, a curve that invites a drag.** Give the marker a handle on the curve: a dot of at least 10 px in the series colour with the `selected-edge` ring (and the halo in Deep Space), a 44 px hit area, and an `ew-resize` cursor. Keep the Rₑ line green and dotted so the two never read alike.
5. **Fidelity, Basics units.** At Basics the readout should use the curve's words and unit, for example "Distance between nuclei 1.10 Å", rounded. The phone caption should match. At Research, give both axis ends the same format with units, and do not fuse the maximum into the axis title.
6. **Fidelity, Basics curve labels.** Label 0 at the separated-atoms line and round the energy ends. Separate He₂'s zero line from the x-axis so the floor stops reading as a hollow bar. Give H₂⁺'s legend plain words at Basics (bonding · antibonding · apart).
7. **Fidelity, strip groups.** Make `.strip-group-label` sticky inside its group, just past the 24 px fade, so the visible group is always named. Raise it to section type. On phone, break tile labels on purpose, before "(", instead of letting "9g (mₗ =" / "−2)" split mid-expression.
8. **Fidelity, desktop cue.** End a group-snapped rest with part of the next group's first tile and its label showing, so "more" is seen rather than only faded. Then have the documenter record the sideways cue, the strip as picker and the Bond length block in DESIGN.md.

## keep
Keep these through every fix:
- one strip as the only orbital picker, with Shell n alone in the panel;
- the curve in the left panel at every level, never behind a collapse;
- the green Rₑ "most stable" note;
- Deep Selection on the selected tile;
- the science colours exactly as they are.

---
Answers to the four questions:
- **The strip** is clearly the picker, and the selected tile is easy to find at every n. Its group labels and its desktop cue fall short at n=9 (fixes 7 and 8).
- **The Bond length block** is one block on desktop and in the drawer. It does not yet read as one instrument, and the curve does not invite a drag (fixes 3 and 4). On a phone the outcome fails (fix 1).
- **The Basics plain labels** are clear on the axes but undercut by the a₀ readout, the raw tick values and H₂⁺'s legend (fixes 5 and 6).
- **The layouts:** the drawer layout is not sound (fix 2), and the phone layout is not sound for Bonds (fix 1).

The controller can save this to `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/.impeccable/critique/2026-10-28-picture-control-finish.md`. The shots are in `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/picture-control/`.

disposition: fix


---

# Verdict pass 1 (HEAD 9a60a40)

**verdict**

Inputs: I viewed 18 of the 30 finish shots, and every one I viewed is valid and the right size. I did not open these 12: `finish-bonds-n2-basics-light-phone`, `finish-bonds-h2plus-basics-dark-phone`, `finish-drawer-bonds-n2-research-light-tablet`, `finish-strip-n9-last-dark-desktop`, `finish-strip-n9-mid-light-desktop`, `finish-strip-n9-last-dark-phone`, `finish-strip-n9-mid-light-phone`, and five `finish-block-*` crops (h2plus-basics-light, h2plus-research-dark, he2-basics-dark, n2-basics-dark, n2-research-light). The captures cannot show the handle's `ew-resize` cursor, its 44 px hit area, or a drag in progress. I did not start Vite. `git diff fe03403..9a60a40 -- src` adds no raw colour value, so the science colours, Glow and Atoms are unchanged.

1. **Phone Bonds: resolved.** On a phone the Explore sheet now shows the strip, then Bond length (readout, slider, curve with handle), then the card. The curve is on screen with the picture for N₂ and H₂⁺. The H₂⁺ slider sits at about y 585, well clear of the tab bar.
2. **1024 drawer: resolved, as ruled.** The open bar is a quiet horizontal label with no selected-fill and no accent: Bonds reads "Data ›" and Orbitals reads "Plot › Data". Regression 1 below covers a side effect.
3. **One instrument: resolved.** The thumb stands over the marker in both zoom crops and in every block crop I checked: N₂, H₂⁺ and He₂, at Basics and Research, in dark and light, and on both phone shots.
4. **Handle: resolved, for what a capture can show.** It is a 10 px dot in the series colour with a `selected-edge` ring, with a halo in Deep Space and none in Light Clean. The Rₑ line stays green and dotted beside it.
5. **Basics units and Research axis ends: resolved.** The Basics readout reads "Distance between nuclei 1.10 Å" and the phone caption matches it. At Research the axis reads "1.66 a₀ · R · 2.41 a₀" and "0.50 a₀ · R · 10 a₀", and the maximum is no longer fused into the title.
6. **Basics curve labels: resolved.** A 0 now labels the separated-atoms line, the ends are rounded (−9.9; 8.2 / −4.1; 1.4 / −0.26) and the H₂⁺ legend reads "bonding · antibonding · apart". He₂'s zero line now stands clear of the x-axis, with the tick comb below the axis, so the hollow bar is gone. Regression 2 below covers a side effect.
7. **Strip groups: resolved.** The "9l" and "9g" labels are sticky in section type, at the last tile and at mid, on desktop and phone. Phone tile labels break before "(".
8. **Desktop cue: resolved on screen.** At n9-mid on desktop, 9h's first tile and its "9h" label show clear of the fade, and 9g's label holds at the left. The other half of this fix, recording the new rules in DESIGN.md, is still open: it is the documenter's Step 3.

Regressions the fix batch introduced:

- **Regression 1 (contradicted): the open drawer's chevron.** In Orbitals the bar reads "Plot ›   Data" (`finish-drawer-orbitals-3dz2-research-*-tablet.png`), which reads as a breadcrumb "Plot > Data", not as a close control. The open tab differs from the other only in text-1 against text-2 ink. In Bonds, "Data ›" reads as "go further into Data". Atoms gets the same bar, but no capture shows it. The ruling asked for a quiet horizontal label; it did not ask for this chevron.
- **Regression 2 (minor): He₂'s Basics energy labels.** The new "0" label sits about 11 px above "−0.26" (`finish-block-he2-basics-light.png`), so the two labels crowd into one cluster at the axis foot.

**remaining**

- **Regression 1, still open.** Take the chevron out from between the labels: make it a separate close control at the bar's far right, named "Close panel". Mark the open tab with something beyond ink, such as weight 600 or the underline the drawer's own Plot | Data tabs use below it. The bar must still use no selected-fill and no accent.
- **Regression 2, minor.** Let He₂'s bottom end give way to the 0 the way N₂'s top end does, or give the two labels more room.
- **DESIGN.md (fix 8, second half).** It still has to record:
  - the strip as the picker;
  - the sideways Tonal Scroll Cue and the group peek at a rest;
  - sticky group labels in section type;
  - the Bond length block with its aligned slider and handle;
  - the quiet open-drawer label.

  It also has to correct the "Deep Selection marks the inspector bar button" line. The documenter owns this.

All eight earlier fixes are resolved in the captures. The verdict stays fix because of regression 1, which is small.

disposition: fix


---

# Verdict pass 2 (HEAD 4cde96f)

disposition: ship

All 14 `finish2-*.png` captures are valid and the size their names claim: six drawer shots at 1024×768, two strip shots at 1440×900, and six block crops at 281 px wide. I opened every one. I read the diffs for `d832720` and `Inspector.tsx`. I did not start Vite. A still capture can't show two of the fixes: the grab offset (M2) and the strip that scrolls once and doesn't snap back on resize (M3/M6). Those rest on unit tests only.

## verdict

- **Regression 1, the open drawer's chevron: resolved.** All six drawer shots show it, for Orbitals, Atoms and Bonds in dark and light.
  - Nothing sits between the labels any more. Orbitals and Atoms read "**Plot**  Data" and Bonds reads "**Data**".
  - The open tab is marked with weight 600 and a 2 px text-1 underline. There is no accent and no fill, as ruled.
  - A separate "Close panel" chevron sits at the bar's far right in text-2. It points toward the right edge, matching the left panel's "‹" fold control.
  - It gets the keyboard focus ring from the global `:focus-visible` rule in `design.css:14`.
  - Nothing in the bar reads as a breadcrumb now.
- **Regression 2, He₂'s "0" crowding "−0.26": resolved.** In `finish2-block-he2-basics-{dark,light}.png` the energy axis shows only "1.4" at the top and "0" at the zero line.
  - The "−0.26" label is gone, which is acceptable: He₂ has no well, so that floor value was padding, not data.
  - The zero line still stands clear of the x-axis, with the tick comb below it.
- **The four handle and strip fixes:**
  - **The H₂⁺ handle follows the drawn state (I1): resolved.** In the u-basics shots, with 1σu* drawn at 2.12 Å, the handle is filled in the antibonding red and sits on the red curve, with the thumb directly over it.
  - **A hollow handle off the plot (I2): resolved.** In the u-off shots at 1.06 Å, the handle is an empty ring on the marker line at the plot's top edge. The ring is in the selection-edge colour, not red, so it doesn't read as a red data point at 8.2.
  - **The n9-mid peek after the rewiring (M3/M6): holds.** 9h's first tile and its "9h" label show clear of the fade, and the "9g" label stays at the left, in dark and light.
  - **The grab offset (M2): not visible in a capture**, so it is not scored here. It is covered by unit tests only.
- **Regressions introduced by this fix batch: none below the bar.**

## remaining

- **Owner-test note: two "Plot · Data" rows.** In the Orbitals and Atoms drawers, the bar's tabs repeat the inner "Plot and data" tabs. The two rows stay in sync, now have nearly the same styling, and mark the selected tab differently: a text-1 underline in the bar, an accent underline inside the panel.
  - The mirrored bar is older than this batch (ruling R24-I1).
  - The underline is the controller's ruling, and it follows the remedy pass 1 suggested.
  - So this is not counted as a regression. It is worth checking during the owner's hands-on test.
- **Owner-test note: the handle ring in dark mode.** The handle's selection-edge ring is hard to see against N₂'s fill colour (the task report's M7).
- **DESIGN.md update (second half of fix 8).** This is the documenter's job after this verdict and does not count against the disposition. It must:
  - record the strip as the picker;
  - record the sideways scroll cue and the group peek;
  - record the sticky group labels in section type;
  - record the Bond length block, with its aligned slider and its handle, including the hollow off-plot state;
  - record the open drawer's underlined tab and its Close panel control;
  - correct the line that says Deep Selection marks the inspector bar button.

This "ship" covers the two regressions and the four handle and strip fixes scored above. It does not cover the whole surface.

The evidence is in `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/picture-control/` (the `finish2-*.png` files).

disposition: ship
