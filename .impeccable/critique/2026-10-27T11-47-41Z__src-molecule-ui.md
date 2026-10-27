---
target: Molecules mode
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/src/molecule_ui"
timestamp: 2026-10-27T11-47-41Z
slug: src-molecule-ui
---
# Critique: Molecules mode (src/molecule_ui), 2026-10-27, commit 468ade0
Method: dual-agent (A: design review · B: detector + headless browser overlay)
Score 26/40 (Acceptable). H1 3, H2 2, H3 3, H4 2, H5 3, H6 3, H7 2, H8 2, H9 3, H10 3.
Specificity: MO-diagram-like orbital list, tier line, dipole computed vs experiment, acting notes, data-drawn thumbnails — authored; frame generic.
Detector: CLI 1 advisory (16px .molecule-tile-name molecule_explore.css:23). Browser: gradient-text (false positive), straggler on the local-server line MoleculeJobsSection.tsx:62 (true), nested-cards ×3 (.phase-legend judgment; ProvenancePanel accordion 10px radius style.css:1628 and .molecule-readout style.css:1425 true).
P1 Provenance repeated to noise (geometry source ×5, method ×3–4, KS caveat ×3) — distill.
P1 One picture, three control places (Surface in Explore, Structure in collapsed Display, mixed strip selection) — layout.
P1 Learner barrier: e-notation, C2v untypeset, "Electron enclosed", a0/Å mix, ESP legend without words, no HOMO/LUMO gloss — clarify.
P2 Phone canvas doesn't say what is drawn — adapt.
P2 Selection reading detached (readout far from atom), no atom indices on model, Structure table omits most angles — clarify.
Also: NO₂ ×2 marks an accidental near-degeneracy across irreps (orbital_display.ts:11, 1e-4 Ha); Library badge success-green; orbital list lacks arrow-key navigation; canvas has no aria-label.
