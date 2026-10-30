# Science corrections (step 3 of the 2026-10-27 critique follow-ups)

The owner said "start" on 2026-10-30. The owner delegates chemistry and science decisions, so the decisions below are the controller's. They come from the critique snapshots of 2026-10-27, the deferred items in docs/quantumlab/checks/levels/ (CHECKLIST item 7, the RULINGS), and docs/quantumlab/checks/picture-control/RULINGS.md.

## Goal
Every number and picture states what it is and is drawn honestly. Gaps, energies, groupings, labels and colours must not imply more, or less, than the computed data says.

## S1. The MO diagram is drawn to scale (Bonds; critique P1)
Today each system's valence levels are stretched to fill the panel, and the levels are pushed apart to at least 20 px. So He₂'s 4 mHa split is drawn like H₂'s 490 mHa split. Decisions:
- **One scale.** Every diatomic uses the same scale, a fixed number of px per eV. Levels sit at their true energies, and the diagram's height follows the system's energy span.
  - A system whose span would exceed the panel's height cap is the only exception. It shrinks to fit, and its axis says so.
- **Energy axis.** An axis in eV with labelled ticks is always drawn, so the spacing can be read.
- **Collisions.** When two levels are closer than a box's height, the upper one is offset sideways. It is never pushed up, so its height stays true.
- **Core band.** The core band stays below a break. The break is marked on the axis.
- **Tooltips.** Each level's tooltip gives the energy eV first: "3σg: ε = −11.92 eV (−0.438 Ha)".

## S2. Energies read eV first everywhere a reader sees them
This finishes the "eV first" ruling from the levels work.
- **Atoms subshell chips** show "−13.6 eV orbital energy". Their accessible name and tooltip carry the full "−13.62 eV (−0.501 Ha)".
- **The Atoms "Orbital energies" table** gets two columns: "Energy (eV)", then "(Ha)".
- **The H₂⁺ curve note** reads "E = −16.40 eV (−0.6026 Ha)". The zero reads "Zero: H + H⁺ (−13.61 eV, −0.5 Ha)".
- **The Molecules "How this was computed" total energy and dispersion** read eV first with Ha in parentheses, at full Ha precision. The zero-point energy reads the same way.
- **Unchanged:**
  - The owner's job progress line stays in Ha, the SCF log convention.
  - CSV and cube files keep their data columns.

## S3. One valence rule (Atoms)
The panel's "Valence:" label and Info's plain valence words come from one function, so they never disagree.
- When the outer s and p are full and the valence holds a d or f subshell, the label reads "Valence: 3d⁶ (outside 3s² 3p⁶)". Examples: Fe²⁺, and Ga³⁺ "Valence: 3d¹⁰ (outside 3s² 3p⁶)".
- Otherwise the label lists the outer shell, plus "· open 4f⁷" for an open inner f, e.g. Gd³⁺ "Valence: 5s² 5p⁶ · open 4f⁷".
- Neutral atoms read as today, e.g. "Valence: 2s² 2p²".

## S4. Degeneracy marks follow symmetry (Molecules; critique "NO₂ ×2")
- Orbitals are grouped as degenerate when they share a symmetry label, e.g. "1e" or "2t2". An energy near-tie across different labels is never marked ×N.
- Unlabelled orbitals ("?") fall back to the energy test (1e-4 Ha).
- One function serves the orbital list, Info and the Basics window edge.

## S5. Status colours mean status only (DESIGN.md Meaning-Only Status)
- **The Rₑ "most stable" line and its note** leave success green. They become a neutral dotted line in text-2, still clearly unlike the dashed marker and its handle.
- **The tier chips** "Library" and "Computed", and the H₂⁺ "exact" chip, become neutral outlined chips. The label carries the meaning, and the Computed chip's hard-coded hex goes away.
- **The Atoms valence-shell dot** leaves warning amber. It takes the colour the 3D view gives that shell, which is already a science colour, so the chip and the ring match.
- **Caveat text that is a caution** (Bonds "only qualitative") keeps warning.

## Deferred, not in this step
- Whole-atom view inner shells hidden behind the outermost shell (critique P1). This needs a design round with the owner, because it changes how the picture is drawn.
- An out-of-range Z in a link (Z=200 silently shows H). This is hardening.
- The pre-existing double draw on a ⌘K pick or a link in Orbitals. This is polish.

## Untouched
Science colours (phase, density, ESP, shell palette), Glow, and every computed value. This step changes presentation only and never recomputes data.
