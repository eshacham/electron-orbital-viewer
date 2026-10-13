# QuantumLab visual handoff

## Selected themes
- **Deep Space** is the dark theme: navy canvas surroundings, blue accents, orange/blue orbital phase imagery, softly bordered cards.
- **Light Clean** is the light theme: white panels, pale gray-blue background, blue controls, restrained borders.
- The user chooses the theme; **admin supports both**.

## Original reference images
The original high-resolution concept PNGs are in the companion **quantumlab-repo-aligned-kit.zip** supplied in the ChatGPT conversation, under `references/original-concepts.png` and `references/theme-comparison.png`. The two SVGs in this directory are **new simplified wireframes**, not substitutes for those original reference images.

## Layout target
Desktop: 76px navigation rail; 315px left Explore pane; flexible center Three.js viewport; 290px right View/Data inspector; optional bottom orbital strip within viewport. Maintain user-controlled panel collapse and minimum canvas width.

Phone: preserve the existing PhoneSheet and header overlays; use tabs rather than squeezing three columns. Tablet: collapse right inspector before reducing canvas excessively.

### Existing component mapping
- `LevelNav`, `PeriodicTable`, `MoleculeNav` -> Explore.
- `Controls`, `MoleculeViewOptions`, `RadialPlot`, `MoleculeOrbitalList` -> View/Data inspector (depending on mode).
- `OrbitalViewer` / `#orbital-canvas-host` -> center; do not remount on appearance changes.
- `ShareExportBar` -> viewport toolbar.
- `PhoneSheet` -> preserve as mobile interaction model.
- `AdminApp`, `JobsTable`, `CostPanel` -> themed dashboard; retain own bundle.

### Behavior contracts
No changes to `url_state`, Redux slices, 3D math, workers, Cognito login, jobs APIs, or billing. Theme is localStorage preference and not encoded in model share links. Preserve accessibility and responsiveness.

### Current implementation status
The branch currently contains foundation components and wireframes, **not** a completed UI transformation or wired theme toggle. See `IMPLEMENTATION.md` for remaining integration and validation.
