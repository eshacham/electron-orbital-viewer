# Panel fixes from the external review (after v3.7-quantumlab)

## Origin
On 2026-11-02 the owner said "yes" to the four panel fixes queued from the external review in `docs/quantumlab/references/brass/`. When asked about researchers' needs, the owner answered: "i'm not a chemist. you are closer to that title than me. your reasoning." So the design calls below are the controller's, made from what learners, teachers and researchers need. The owner will judge the result live before anything ships.

## Goals
1. In Orbitals, it is always plain what is being built: one orbital, a hybrid set, or an orbital in an electric field. No control from another construction looks active.
2. A researcher can give the right panel the room to read methods, limits and sources without hunting.
3. In Atoms, the 3D rings and the left panel's shell chips point at each other.
4. The light theme's model reads as well as the dark theme's (confirm only).

**Non-goals:**
- no new science or computed values;
- no new copy beyond the three section labels and the selector's three labels;
- no change to links (`encodeStateOf` untouched; width is a local preference);
- phone and medium-width layouts keep their structure.

**Anti-goals:**
- a control that changes the picture when the reader only meant to look;
- any change to science colours;
- a resize that hides the Plot and data headers;
- a hint or tip text.

## P1. Orbitals: an explicit construction choice (Advanced and up)
- **The selector.** At the top of the Orbitals left panel, a segmented control labelled **Single orbital · Hybrids · Electric field**. It is a standard MUI ToggleButtonGroup, exclusive, in the brass selection style. It replaces the "Combination" Select in `CombinationControls`. Below Advanced the selector is absent (single orbitals only), and the existing LevelLine pointer stays.
- **Single orbital** shows the Shell n chips. The thumbnail strip stays the l/mₗ picker, as now.
- **Hybrids** shows two rows:
  - the hybrid type as a segmented row **sp · sp² · sp³**;
  - the existing **Show** row (All · h₁…hₙ).

  The Shell n chips are not shown. Entering Hybrids from Single starts at **sp³, All**, the classic methane teaching case. Within the session, it returns to the last hybrid the reader had.
- **Electric field** shows the existing level / strength / Stark controls and readouts, unchanged. The Shell n chips are not shown. It enters at the existing field defaults, or the session's last field.
- **Single orbital again** returns to the orbital the reader had: the stored n, l, mₗ are untouched while a combination is drawn.
- **The strip in Hybrids or Electric field.** It shows the stored shell's orbitals with no tile selected, as now. Picking a tile switches the selector to Single orbital, which is the existing `handleBasicPick` behaviour. The selector follows state (`combination.kind`), so a ⌘K pick, a link or a strip pick updates it with no extra wiring.
- **Shell n chips.** While a combination is drawn, no Shell n chip carries `selected` or `aria-pressed=true`. This fixes the review's "n = 4 stays lit".
- **Accessibility.** The group is named "Construction". Each option's accessible name equals its visible label (WCAG 2.5.3). The heading and Info keep their current combination titles.

## P2. Research Info gets room
- **The right panel's width can be dragged.**
  - It applies in the docked layout only (≥ 1290 px, the `.app-workspace` inspector column). A 6 px handle sits on its left edge with a 1 px hairline that turns brass on hover and focus.
  - Width runs from 290 px (the token minimum) up to 560 px, and is never more than 45 % of the viewport. The canvas column flexes.
  - Double-click resets to the default (290, or 320 when wide).
  - The handle is focusable, with `role="separator"`, `aria-orientation="vertical"`, `aria-valuemin/max/now` in px and the name "Resize the right panel". ←/→ move it 16 px; Home/End go to the minimum and maximum.
  - The width is stored as a local presentation preference (localStorage, in the style of `eov.display`), never in a link. Camera insets update through the existing measurement, so the model never sits under the panel.
- **"How this was computed" is grouped under three headings: Method · Limits · Sources.**
  - The text is each builder's existing sentences, regrouped. No wording changes except the three headings. `tools/design/science_diff.mjs` must show the text moved, not changed.
  - **Method** holds how it was computed: the solver or theory, basis, grid, functional, geometry source.
  - **Limits** holds validity ranges, caveats and approximations, so the limits sit beside the method.
  - **Sources** holds references, data sources and links (PubChem CID, reference values).
  - A builder with nothing for a heading omits that heading. Headings are caption-size Inter 600 in `text-2`. The blocks are not separately foldable; the outer disclosure keeps its level behaviour (open at Research).

## P3. Atoms: rings and shell chips point at each other (whole-atom level)
- **Ring → chip.** While the pointer is over a ring in the 3D cut face, the left panel's chip for the shell under it (`shellAtRadius` on the existing `hoverRadius`) shows the "linked" state: `surface-3` with a 1 px brass inset edge. It is not the selected look. Hovering the radial plot links the same way, through the same `hoverRadius`.
- **Chip → ring.** Pointer hover or keyboard focus on a shell chip sets `hoverRadius` to a radius inside that shell's band, the midpoint of its widest contiguous run in `shellIndexAtR`. The 3D highlight circle and the plot's hover line follow. Leaving or blurring clears it, unless the pointer is on the canvas.
- **Highlight colour.** The 3D ring highlight becomes the field's brass (`#C4A15A`, the dark Explore accent) instead of the hard-coded cyan. It is a uniform fed from tokens, not a literal in the shader. This is chrome, not science.
- **Announcements.** The link is visual only. Nothing is announced on hover.

## P4. Light-theme readability (confirm)
- **The check.** Take matched live captures of Mg 3s→3p at Advanced, in both themes at the default opacity and at 45 %, and record them in the checklist.
- **Expected.** The field is dark in both themes (`VIEWPORT_MODE`), and the model's colours are the same. The light theme's field is a deliberately lighter charcoal (brass B4: `#20201D` against `#10110F`). (Ruling T5-P4: an earlier wording said "identical", which was stricter than the brass design.)
- **If the check fails.** No code is planned here; a failure would be reported for a ruling.

## Acceptance
- **Gates:** jest, tsc, build and admin-split are green.
- **Live check:** both themes at 1492 and 1280 px, plus a phone check that nothing changed there.
- **Reviews:** a task review per task and a final branch review.
- **Hand-off:** the owner gets a local link with a what-to-try list.
