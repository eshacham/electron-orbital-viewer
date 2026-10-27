Scope: the viewer, all four modes (`/`, src/App.tsx, src/shell/*, src/basic_ui, src/atom_ui, src/bonds_ui,
src/molecule_ui, src/components/*). Mode: Operate. Feature: learning levels and on-demand Info (owner-confirmed shape
brief, 2026-10-27).
Audience and job: learners, teachers and researchers (co-primary). No one meets more text or controls than their
level needs; everything else is one step away. Builds on the critique of 2026-10-27 (all four modes 26/40; shared
failures: real-world match, consistency, minimalism — text repeated, captions as walls, code-style names, missing
units, phone canvas unnamed).

Confirmed decisions:
- Levels Basics · Explore · Advanced · Research, switch in the top bar; a personal preference; first visit Explore.
- Links keep the recipient's own level by default; Share offers "Opens at: <level>" (writes a level key).
- A link to a view that needs a higher level raises the level for that visit and says so.
- Controls above the level are hidden (not greyed); one quiet line says where they appear.
- Level table — Basics: pick element/orbital/bond/molecule, drill down, the strip; Info + a simple Display (opacity,
  cut away); plain words, rounded, eV. Explore: + Plot and data, structure options, bond labels, orbital energies,
  Properties; + key numbers with units. Advanced: + charge and excite, relativity, combinations and field, enclosed
  %, all orbitals and spin channels, exports, Advanced appearance, full Display; + scientific terms each with (i).
  Research: everything incl. the owner's request workspace; "How this was computed" open; full precision, methods,
  references, validity limits.
- Info: always open at the top of the right panel; explains the current selection (name, short plain explanation,
  key facts at the level); (i) beside a term switches the topic; a new selection returns to it; "How this was
  computed ›" holds method, references, validity (folded below Research, open at Research); compact, scrolls inside.
- Phone: one-line caption under the header naming what is drawn; sheet tabs Explore · Info · View · Plot.
- Text is written once per level band (plain / technical / full); typography fixed as it moves (subscripts, U+2212,
  units).
Out of scope here: the picture as the control (step 2), science corrections (step 3), final polish (step 4); science
colours, Glow and the Atoms colours stay untouched.

## Direction contract

THESIS: Panels hold controls and short labels; every explanation has one home, Info, written for the reader's level.
Refuses captions-as-walls and the one-size panel that serves nobody well.

OWN-WORLD: QuantumLab Deep Space and Light Clean tokens unchanged; Inter with tabular figures; Info as a quiet
section at the top of the right panel; (i) buttons small, accent-text, only beside terms that need them; standard
controls; no new colours.

STORY: A learner sees the picture, its name and a plain sentence, and unlocks more as they advance; a researcher
switches to Research and gets every method, reference and limit without hunting.

FIRST VIEWPORT: Top bar with the mode tabs, a Learning level segmented control (Basics · Explore · Advanced ·
Research) and search. Left: building controls with (i) beside terms, no paragraphs. Centre: the picture with its
title and one plain subtitle. Bottom: the strip. Right: Info (selection name, explanation, key facts, "How this was
computed ›"), then Display and Plot and data / Properties.

FORM: Info always open with (i) buttons pointing to it, 1st of 7 on the ordered list; seed:4e476c80448e1899

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
