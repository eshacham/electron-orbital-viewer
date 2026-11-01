# QuantumLab visual design handoff

November 1, 2026. Proposed design, not an implemented interface.

## Start here

Read `REVIEW-AND-DESIGN-DIRECTION.md` for the recommendation and `SYSTEMATIC-REVIEW.md` for observed behavior, coverage and unresolved checks. Use the two new images as the primary visual references:

- `concepts/quantumlab-instrument-dark.png`
- `concepts/quantumlab-instrument-light.png`

They show a matching Research / Molecules / Water ESP workspace. The recommended identity is a contemporary scientific instrument: obsidian or warm ivory, selective brass or bronze, restrained serif branding and specimen titles, readable sans-serif controls, precise numerical typography. The light concept retains a dark model viewport to support translucent surfaces. This is a proposal to test against actual rendering, not a requirement that every light-theme viewport remain dark.

The two themes retain the same conceptual layout. Small generated spacing differences are not intended theme-specific behavior. Palette tokens are in the design-direction document; sampled image pixels are not authoritative tokens.

## Instructions for the implementing agent

Review the live application and existing implementation before changing it. Preserve its construction-left / model-centre / inspection-right architecture, four views, four learning levels, contextual information, linked model hover and selection, and scientific capabilities. Keep AI conversation external; do not add an embedded chat panel. The product must work independently of an AI assistant.

Use these concepts for visual hierarchy, proportion, typography, palette and brand restraint. They do not define complete control inventories or new scientific behavior. Absence from a concept is not permission to remove a feature. Preserve mode-dependent controls, disabled-state explanations, provenance, warnings, units and methods. Design a readable expanded method view and resizable inspector; these cannot be demonstrated by a static image alone.

The models, thumbnails, labels and numbers in the generated images are illustrative. Implement the real renderer and source data, never a generated molecular image or a hard-coded scientific value. The surface shape and colour distribution are not validated scientific results. For example, the concepts show the dipole toggle enabled but omit a visible dipole arrow; that is an illustration omission, not a proposed behavior. Controls and image captions must be checked against the application. Maintain red/blue ESP meanings and all existing scientific colour conventions independently of the brass brand accent.

Build and evaluate real states across Orbitals, Atoms, Bonds and Molecules and across Basics, Explore, Advanced and Research. Begin with the three prototype states described in the review. Test matching themes, contextual-info return, hover, rotation, pan, zoom, cuts, keyboard operation, loading, narrow layouts, contrast, sharing and exports. The review records what has and has not been verified; do not treat a visually convincing mockup as a passed test.

## Supporting material

- `review-final-water.png`: actual application screenshot, the scientific/context reference for this pair.
- `review-current-dark.png` and `review-current-light.png`: current-app theme observations, not redesigns.
- `concepts/quantumlab-three-directions.png`: earlier Victorian / brass instrument / minimalist exploration, included as historical background only.
- `concepts/quantumlab-brass-light.png`: earlier, more ornate light exploration; superseded by the new instrument light concept.
- `concepts/original-laboratory-reference.png`: original inspiration, not a working-interface specification.
- `CONCEPT-PROMPTS.md`: generation provenance and prompts.

The recommended concepts intentionally reduce ornament compared with the early references. Preserve recognisable scientific craftsmanship through the visual system without literal laboratory scenery or decorative metal frames in the working application.

## Authority and status

User requirements and verified application behavior govern functionality. The review describes observations and proposals separately. The new images guide appearance; early references provide inspiration only. Resolve conflicts in that order and verify scientific details from the implementation. The palette and layout still require rendered accessibility and responsive checks. No production changes have been made.

Created with the built-in Imagegen tool from an actual application screenshot. The generated images were visually inspected; they are concept artwork, not screenshots of functioning redesigned software.
