# Final polish (step 4 of the 2026-10-27 critique follow-ups)

**Origin.** The owner said "continue" on 2026-10-30 after v3.5-quantumlab shipped. These are refinements, not a redesign: the QuantumLab world, behaviour, copy and science stay as they are. The items come from the parked lines in the RULINGS files of levels, picture control and science, from the finish reviews' "ceiling" notes, and from the owner-test notes. The controller makes the decisions (the owner delegates).

## Fixes, in triage order

### F1. Functional and state
- **One draw per pick.** A ⌘K pick, or a pasted link to a new orbital while already in Orbitals, draws the orbital once, not twice. A ⌘K pick or a link that leaves a combination also draws once (today it draws 2 times).
- **Links with values out of range are corrected, and the app says so.**
  - Example: a link with Z = 200 shows hydrogen today, with no word. It now shows one line in the existing notice slot, e.g. "This link asked for Z = 200; showing hydrogen (Z = 1)." The same applies to other out-of-range link values the hash parser already clamps.
  - The notice uses the same mechanism and dismissal as the "Opened at … for this link" notice.

### F2. Icons
- The text glyphs used as icons become the app's own MUI icon family: the strip's "▾"/"▴" toggle, Info's "‹ Back to …", and any other "‹ › ▾ ▴" used as a control icon. The phone's "<Mode> ▾" is in scope too.
- Accessible names do not change.

### F3. Fact rows (Info)
- A fact's label never sits alone on its line.
- When a value is too long for its row, it wraps inside its own value column at a no-break boundary: between "… eV" and "(… Ha)", or after a "·".
- Labels stay on one line, as today.

### F4. Small layout and type
- **The Atoms energy table header.** "Energy (eV)" fits on one line beside "(Ha)", or both headers share one line style.
- **The Bonds Data "·" separator** never wraps onto a line of its own.
- **Corner radii.**
  - The phone caption's 10 px corner, and the other two 10 px corners in style.css, use a radius token. The nearest token is `--ql-radius-md` (8 px) or `-lg` (12 px); pick the one the neighbours use.
  - The jobs accordion's 10 px corner stays only if it is in the jobs page's own system; otherwise it is tokenised too.
- **The MO level hover is visible**, using the R26 surface-3 hover. Check it renders on the boxes: the finish review saw no visible hover.

### F5. Drawer: one Plot · Data row
In the medium-width drawer (Orbitals, Atoms), the bar's "Plot · Data" and the inner section's Plot | Data tab row say the same thing. The bar keeps them. The inner tab row is not shown in the drawer, because the bar drives it. The docked and phone layouts are unchanged.

### F6. Bonds handle and MO bands
- **The curve handle in dark.** The handle's ring gets a 2 px surface gap between the dot and the ring, so it reads as a ring on N₂'s blue fill. Tokens only.
- **The MO core band and the folded band.** Their levels sit left to right in energy order, with one even gap. Today a second level can land far right, which in the not-to-scale bands means nothing.

### F7. Code and asset cleanup
- The remaining local energy formatters move to `src/format/energy.ts`. Displayed strings stay unchanged; the existing tests pin them.
- Remove the now-unused hidden range input path in `PotentialCurvePlot`, if nothing uses it.
- Add a test for the core band wrapping.
- Document the known act() warnings, or reduce them where a fix is local. This is optional and bounded.

## Untouched
- Science colours, Glow and the Atoms colours.
- All computed values.
- The Info and levels systems.
- Molecules' controls ("all good", owner).
- The whole-atom inner shells (they need an owner design round).
