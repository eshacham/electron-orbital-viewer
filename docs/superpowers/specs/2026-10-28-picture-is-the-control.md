# The picture is the control — Orbitals and Bonds (owner-confirmed 2026-10-28)

This feature came out of an Impeccable shape round on 2026-10-28. It is step 2 of the 2026-10-27 critique follow-ups:
- Orbitals P2: "Two pickers for one choice; n=9 overflows, 81-tile strip, no scroll cue."
- Bonds P1: "The bond-length story split across three panels; curve collapses under Display and hides < 1290 px."

The owner's answers:
- Strip picks the orbital; chips keep only Shell n.
- Curve and slider together.
- Show the curve at Basics too.

The owner confirmed the brief as written.

## 1. Job and audience
The audience is learners, teachers and researchers using Orbitals and Bonds (Operate mode). Each of these views has one choice the picture is about: which orbital, and how far apart the nuclei are. That choice is made on the picture's own surfaces, in one place, not two or three.

## 2. Outcome and proof
- **Orbitals:** you pick an orbital by tapping its thumbnail. The strip is the menu.
- **Bonds:** you change R and watch the energy curve's marker and the 3D bond move together, in one place.
- **Success:**
  - Every Orbitals choice can be reached from the strip plus a Shell n row.
  - Bonds' R story (slider, curve, Rₑ, the energy at R) sits in one panel at every level and every width, including below 1290 px.

## 3. Direction
The existing QuantumLab world stays unchanged: Deep Space and Light Clean tokens, the DESIGN.md rules, and the science colours untouched.

**Orbitals**
- The left panel keeps **Shell n** only. The Subshell l and Orbital mₗ chip rows are removed.
- The strip under the picture becomes the picker. It shows every orbital of the chosen shell, grouped s · p · d · f · …, and each group is labelled.

**Bonds**
- The energy curve moves into the left panel, directly under the R slider, as one "Bond length" block.
- Dragging or tapping on the curve sets R. It snaps to the computed points, as the slider does.
- The slider stays, for keyboard use and fine steps.
- The marker, the slider and the picture always agree.
- For Bonds, the right panel's Plot and data keeps only the Data tab.

## 4. Scope and boundaries
- **In scope:** Orbitals and Bonds; desktop, drawer and phone; all four learning levels.
- **Untouched:**
  - Atoms and Molecules (the owner: "Molecules — all good").
  - The science colours and Glow.
  - The Info panel and the levels system.
  - Combinations, which stay at Advanced in their own section.
- **Anti-goals:**
  - No second picker comes back.
  - No curve hidden behind a collapsed section.

## 5. States and ranges
**Orbitals**
- Shells n = 1–9 hold 1 to 81 orbitals. Large shells scroll in subshell groups, with a visible scroll cue.
- The group of the selected orbital comes into view.
- The selected tile keeps the selected style.

**Bonds**
- Ten systems plus H₂⁺. Edge cases:
  - He₂ has no well.
  - H₂⁺ has two exact curves.
- While the picture loads, the marker moves at once and the energy readout says it is updating. No number is ever shown stale.

## 6. Interaction and layout
- **Bonds curve at every level:** the curve shows at every level, Basics included, as Basics content. At Basics its axes read in plain words and units: "Energy (eV)" against "Distance between nuclei (Å)". The Rₑ marker is named "most stable".
- **Keyboard:**
  - The strip is a listbox moved with the arrow keys.
  - The curve's marker can be moved by keyboard through the same slider.
- **Phone:**
  - The "Bond length" block lives in the Explore tab.
  - The strip stays under the picture.

## 7. Decisions made (not for the builder to invent)
- Orbitals' Basics strip gets no extra filtering. Shell n plus the strip is already simple.
- Large shells use a horizontal scroll by group, not wrapping rows.
- Info and its (i) buttons follow the controls to their new places.
- Molecules' "one picture, three control places" critique finding stays parked.
