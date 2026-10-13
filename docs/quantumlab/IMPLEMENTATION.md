# QuantumLab UI — repository-specific handoff
Branch: design/quantumlab-deep-space-light-clean

## Status
This branch contains the **theme foundation**, not the full layout transformation. Do not represent it as a completed redesign.

## Actual architecture
- React 19, MUI 7, Redux Toolkit, Three.js, Vite.
- Viewer: src/App.tsx, src/main.tsx, src/style.css, src/theme.ts.
- Atom navigation: src/components/LevelNav.tsx, PeriodicTable.tsx, SubshellPanel.tsx.
- Hydrogenic controls: src/components/Controls.tsx.
- Molecules: MoleculeNav.tsx, MoleculeViewOptions.tsx, MoleculeOrbitalList.tsx.
- 3D host: OrbitalViewer.tsx and #orbital-canvas-host.
- Admin is a separate entry: src/admin/main.tsx, AdminApp.tsx, admin.css.
- Keep admin code split (npm run check:admin-split).

## Integration
1. In src/App.tsx replace the static appTheme with useQuantumTheme().theme and place ThemeSwitch inside a visible header/tool area; avoid calling hooks conditionally.
2. In src/admin/AdminApp.tsx replace the static adminTheme with the same hook and add ThemeSwitch in .admin-header.
3. Import ./design/quantumlab.css after ./style.css in src/main.tsx; import ../design/quantumlab.css after ./admin.css in src/admin/main.tsx.
4. Do not alter Redux state or hash serialization; theme is localStorage-only and must not change shared model URLs.
5. Keep the scientific 3D canvas background independent of UI paper color until both light/dark rendering contrast has been checked.

## Full layout transformation — work remaining
- Add a slim responsive workspace navigation rail for Atom / Basic Orbitals / Molecules / Bonds / Learning without changing existing mode values.
- Organize existing left-side LevelNav / MoleculeNav and periodic-table controls into a consistent Explore panel.
- Organize right-side Controls / MoleculeViewOptions and RadialPlot / MoleculeOrbitalList into a configurable View + Data inspector.
- Preserve central #orbital-canvas-host with pointer gestures, camera-fit insets, and export controls.
- Preserve mobile PhoneSheet, its tab affordances, and phone overlay offsets. Do not force desktop grid rules onto phones.
- Apply matching cards, filtering, charts, and accessible data tables to the owner dashboard, without importing the viewer bundle.
- Preserve Learning Center hover and persistent explanations; ensure keyboard/focus equivalents.
- Preserve existing accessibility contrast tests and test both themes.

## Acceptance
Run npm install, npm run build, npm test -- --runInBand, npm run check:admin-split.
Manually test atom, hydrogenic, molecule (including C2H2 deep link), bonds, admin auth, 3D rotate/pan/zoom, mobile, share/export, and both theme selections.

## Visual direction
Deep Space: navy panels, electric blue accents, generous 3D viewport.
Light Clean: bright white panels, muted blue borders, strong scientific chart legibility.
Keep the same information architecture and features in both themes.
