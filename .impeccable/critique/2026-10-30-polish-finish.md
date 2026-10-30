# Finish review — final polish (HEAD 2f8d094)

disposition: fix

Inputs not supplied or not fully read: there was no direction contract or QUALITY BAR card. This is a polish pass on a shipped world with no comp, so check 4 (contract and seed) does not apply, and TYPE, MATERIAL and GROUND are judged against DESIGN.md. I only grepped DESIGN.md and `.impeccable/design.json`. I did not open these shots: the handle crops, `info-back-*`, `strip-toggle-*`, `excite-1280`, `molecules-change-*`, `phone-caption-*`, `reveal-button-tablet`, `data-line-*`, `facts-*-phone`, `facts-n2-drawer-1024`, `table-uranium-1280` and `link-z200-notice-dark-desktop`. Rows that depend on them are marked unseen.

## persistence
Pass.
- PRODUCT.md is present.
- DESIGN.md is present and was written before this build. It already describes the shipped F2 Back chevron (line 528) and the F5 drawer (line 495). The checklist still lists the rest of its update as pending for the controller. Since the world is not new, that is disclosed here, not counted as a defect.
- No state.json is needed: this is a code-led polish. `.impeccable/mocks/` holds only the decision-round folders (`decision/`, `decision-levels/`), which need no approval record.
- Evidence (check 0) passes. All four `.impeccable/review/*.png` files and all 41 polish shots are present, the right size, with no blank areas. Each shows what its name says. They were taken at c23a31c. The change from there to 2f8d094 touches only docs and `tools/design`, and the recapture report confirms no app code changed.
- Science colours are unchanged. No token, theme or colour file is in the branch diff (5bc4d0a..2f8d094). The only colour-related lines are:
  - the handle's inline `background` became `backgroundColor`, with the same value;
  - the handle's new gap uses the surface-1 token.
- On screen, the ψ orange and blue tiles, the Glow on the selected tile, and the Atoms shell and periodic-table colours look the same as before.

## fidelity
The measure is the brief (F1–F7) plus the DESIGN.md world. There is no approved comp.

| Element | Verdict | Evidence |
|---|---|---|
| TYPE | match | Same sans and the same scale and weight steps in all four review shots. |
| MATERIAL | match | The renders are computed. No imitation physical effects were added. |
| GROUND | match | Deep Space and Light Clean grounds are untouched, with no token changes. |
| F1 link notice | match | `link-z200-notice-light-phone` shows one line in the notice slot, "…asked for Z = 200; showing hydrogen (Z = 1).", with an info icon and a dismiss button. Hydrogen is drawn. |
| F1 one draw per pick | adaptation | Cannot be seen in a screenshot; the tests cover it. Draws wait 150 ms (debounce), per the T1 ruling. |
| F2 strip toggle, phone "Bonds ⌄" | match | The MUI chevron shows in `desktop.png`, `desktop-light.png` and the mobile top bar. |
| F2 Back chevron, Excite, Change | unseen | Their shots were not opened. |
| **Molecules "Structure" disclosure marker** | **contradicted** | It shows the browser's default ▶ (`facts-lvmo-info-232`). The app's own `<details>` (`.info-computed`, info.css:75–82) hides that marker and uses a trailing ExpandMore chevron that turns 180°, as DESIGN.md:496/525 requires. Three other disclosures keep the default marker too: `.quote-details` ("Price, line by line", "What makes up the price") and `.local-server-how` ("How to start it"). This conflicts with F2 ("any other … used as a control icon") and with the craft floor's rules on glyph icons and browser defaults. |
| F3 fact rows | match | The N₂ "Total energy" value wraps between eV and (Ha). The LVMO row "5.00 eV / (0.184 Ha), / upper estimate" sits in its value column. No label stands alone. |
| **F3 Fe label break** | **contradicted** | In `facts-fe-drawer-1024`, "Ionisation energy (Fe →" ends line 1 and "Fe⁺) (i)" starts line 2, so the reaction is split at the arrow. The ruling lets a label wrap, but not inside the reaction. F3's own rule is to break at a no-break boundary. |
| F4 energy table | match | Gold (22 rows) and lead (24 rows) are complete. The "eV" and "Ha" headers sit on one line and the numbers are right-aligned. Mixed precision across 1000 eV / 100 Ha is an adaptation cited to the T2 ruling. |
| F4 Bonds "·" separator | match | In `desktop.png`, "· LUMO 1πg*" starts the second line. |
| F4 caption radius | match | Now `--ql-radius-md` (checklist). |
| Jobs accordion radius | adaptation, accept | 10 px became `--ql-radius-lg` (12 px). That is the jobs world's card radius (DESIGN.md:499, the 12 px budget card), and it nests correctly around the 8 px `.quote-option` inside it. Keep it. |
| F4 MO box hover | match | Dark, sampled: card (7,24,40), box at rest (11,28,45), hovered box (19,38,59), plus the border-strong edge. Light: (241,245,250) at rest, (227,238,254) hovered. Quiet in Deep Space but visible. |
| F5 drawer, one Plot · Data row | match to the letter | Only the bar's row shows (`drawer-one-row-orbitals`, `facts-fe-drawer-1024`). |
| **Drawer "Plot" selected while content starts with Info** | **contradicted, naming only** | DESIGN.md:495 (Task 4) puts Info above the sections, so Info coming first is fine. The problem: the bar's "Plot" underline drives the third section, which is still titled "Plot and data" but shows only Plot. The name the bar selects appears nowhere beside the content it controls. |
| F6 handle | match at 1x | `desktop.png` shows the ring, a dark gap, then the dot on N₂'s blue curve. The 2x shots are unseen. |
| F6 folded band (B₂, C₂) | match | 1πg* (two boxes) then 3σu*, in energy order, 8 px apart, on one row. Core band: 1σg then 1σu*. |
| F6 folded band wrap | adaptation | Cannot happen in shipped data: the diagram is a fixed 260 px. Covered by a unit test (`tests/bonds/mo_layout.test.ts`). |
| F7 cleanup | not visual | Strings are unchanged according to the checklist. |
| Added without approval | none | — |

## ceiling
For a polish round this is mostly reached. What is still unused or open:
- The hover in Deep Space is the faintest state in the system. It is visible, but only just at 1x.
- About 15 raw radius values remain in style.css (`8px`, `6px`, `4px`, `3px`). DESIGN.md:580 says "take every radius from tokens". F4 only asked for the 10 px ones, so this is parked, not a defect.
- On the C₂ phone shot (`mo-folded-band-c2-phone`), the near-equal 3σg and 2σu* boxes and labels stack with no gap. This is in the to-scale area and the levels system, which this round does not touch. It belongs to a later round.

## material_fixes
1. **Disclosure markers (F2, craft floor).** Give `.molecule-structure`, `.quote-details` and `.local-server-how` the same treatment as `.info-computed`: no default marker (`::-webkit-details-marker { display: none }` plus `list-style: none`) and a trailing `ExpandMore` that turns 180° over `--ql-motion-hover`. The T2 ruling that swapped Molecules' glyph icons ("same look, a real icon") already covers this.
2. **Drawer naming (F5).** In the drawer only, title the tabbed section by the bar's active tab ("Plot" or "Data") instead of "Plot and data", so the selected bar tab names the content it controls. Docked and phone layouts stay unchanged, and the region's accessible name (from the bar button) still works.
3. **Fe label wrap (F3).** Keep "(Fe → Fe⁺)" together, for example with non-breaking spaces around the arrow or the same no-break grouping FactValue uses. The label should then break as "Ionisation energy" / "(Fe → Fe⁺) (i)". This holds for every ionisation-energy label of the form "(X → X⁺)".

## keep
Keep the science colours, the Glow and the Atoms palettes exactly as they are. Also keep the new rule that a value wraps only at its no-break boundaries, and the energy-ordered, 8 px band rows.


---

# Verdict pass (HEAD b291074)

## verdict
1. **Disclosure markers (F2, craft floor): resolved.**
   - The Molecules "Structure" disclosure now shows a trailing ExpandMore chevron. It points down when closed (`structclosed-…-crop`) and turns 180° when open (`structopen-…-crop`, and the full desktop shot). The browser's default ▶ is gone.
   - `.local-server-how` behaves the same way. I shot it on 5411 at Research with the jobs server stubbed as down: `/tmp/6g1-vpclosed-water-dark-desktop.png` and `/tmp/6g1-vpopen-water-dark-desktop.png`. "How to start it" has the chevron at the far end of the row, pointing down, then up once opened. Vite is stopped and port 5411 is free.
   - The two `.quote-details` disclosures appear in none of the shots. In the source they use the same `<summary>…<DisclosureChevron /></summary>` markup and the same global `details > summary` rule (style.css:1699–1702). The test also scans the source for any summary without a chevron.
2. **Drawer naming (F5): resolved.**
   - At 1024 the tabbed section's title follows the bar. It reads "Plot" when the bar's Plot tab is underlined (`drawerplot-…-tablet`, Fe tablet) and "Data" when Data is underlined (`drawerdata-…-tablet`).
   - The docked layout at 1440 still says "Plot and data" with its own Plot · Data row (`z200`, `carbon`), as the fix required.
3. **Fe label wrap (F3): partial.**
   - Fe now breaks as "Ionisation energy" / "(Fe → Fe⁺) (i)" (`fe-…-tablet`). Carbon at 1440 breaks as "Ionisation energy" / "(C → C⁺) (i)".
   - Hydrogen still breaks inside its reaction, on Atoms' default element at 1440. `z200-link-z200-dark-desktop` shows "Ionisation energy (H → H⁺" / "(bare nucleus)) (i)": the opening bracket is left unclosed on line 1 and a doubled "))" starts line 2.
   - The cause is in `ionisationQualifier` (atom_text.ts). It holds only the spaces around the arrow, and the space before "(bare nucleus)" is still a normal space.
   - This is exactly the case the fix named ("every ionisation-energy label of the form (X → X⁺)"). It also breaks DESIGN.md's new line "a reaction stays together". The fix report saw it and left it open.

Regressions from this batch: none seen.
- The global `details > summary` flex rule leaves `.info-computed` unchanged (the "How this was computed" chevron is in the same place in the Data drawer and the desktop shots).
- The correction notice shows at Z=200, and picking Carbon clears it.
- The DESIGN.md diff in 990afbe records all three fixes as built (Icons and Disclosures, the drawer bar, the Fact Grid reaction rule).

## remaining
- **F3, the bare-nucleus labels.** Hold the whole qualifier as one unit by putting a no-break space before "(bare nucleus)" as well, so the label breaks as "Ionisation energy" / "(H → H⁺ (bare nucleus)) (i)". This also covers every one-electron ion at Advanced ("He⁺ → He²⁺ (bare nucleus)"). Then check hydrogen at the 1024 drawer and on a phone, where the held group is about 150 px wide, so it neither overflows nor squeezes the value column.
- **Uncaptured.** The two `.quote-details` disclosures ("Price, line by line" and "What makes up the price") are confirmed in the source but appear in no shot. Capture one, closed and open, alongside the F3 recapture.
- **Earlier ceiling items, still parked and not counted as defects:** the faint MO hover in Deep Space, the raw radius values left in style.css, and the C₂ phone boxes stacked with no gap.

disposition: fix

**Controller:** the one remaining item (bare-nucleus labels) is fixed in bd3a5c2, failing test first, and checked live in the 1024 drawer and on a phone with no overflow. The quote-details disclosures are accepted as source-verified (owner-only path). The ceiling items stay parked.
