# QuantumLab — repository-aligned theme kit

Target repository: https://github.com/eshacham/electron-orbital-viewer
Inspected revision: `de690ad2dd766f0a6f268fe8762bc2861ce44957` (from GitHub code search).

## What this kit is
An **implementation starter**, not a fully verified application patch. It is grounded in the repository's real React 19 / MUI 7 / Redux / Vite / Three.js architecture. It preserves the existing atom, hydrogenic, molecule, bonds, owner-auth, URL serialization and camera behavior by changing the MUI theme and existing card styling rather than replacing components.

## Installation in a fresh checkout
1. Copy `src/design/` from this package to the checkout's `src/design/`.
2. Copy `apply_to_checkout.py` to the checkout root and run `python3 apply_to_checkout.py` once.
3. Run `npm ci`, `npm run build`, `npm test`, `npm run check:admin-split`.
4. Review and test at desktop and phone widths, including touch orbit controls and sign-in.
5. Do not deploy without reviewing the visual changes and the existing accessibility tests.

The script fails loudly if expected code anchors differ; it never rewrites the physics, stores or 3D renderer.

## Files inspected
- `package.json`: React 19, MUI 7, Vite 6, Redux Toolkit, Three.js
- `src/App.tsx`: ThemeProvider, viewer and molecule modes, existing side panels, URL/state hooks
- `src/theme.ts`: existing single MUI palette and contrast comment
- `src/style.css`: canvas host, left/right overlay columns, phone constraints, radial plot, insets
- `src/components/Controls.tsx`: scientific control API
- `src/components/MoleculeNav.tsx`: molecule selection, density/ESP/orbitals, responsive variants
- `src/main.tsx`: main entry and hash-state restore
- `src/admin/AdminApp.tsx`: separate admin ThemeProvider, owner authentication, jobs and costs
- `src/admin/main.tsx` and `src/admin/admin.css`: independent admin entry and stylesheet

## Integration notes for the agent
- **Do not replace** `#canvas-container`, `#orbital-canvas-host`, `.side-panel`, `.view-panel`, `#controls`, `.radial-plot`, or phone sheet geometry. They participate in camera insets, plot sizing, touch and scroll behavior.
- Theme preference uses localStorage key `eov-color-theme`, not the URL hash, so shared scientific links stay unchanged. Both entrypoints read the same key.
- The admin is independently bundled; its stylesheet and theme provider must be changed separately. Preserve `ADMIN_ROOT_CLASS`, `check:admin-split` and owner auth gating.
- Keep physical scientific color conventions, legends and phase encodings consistent. Changing the surrounding chrome is safe; changing renderer colors requires scientific review.
- This kit does **not** add invented dashboard metrics, new scientific capabilities, or pretend the illustrative orbital screenshots are live assets.
- Existing tests may assert exact old color values. Update tests only after validating actual WCAG contrast and intentional changes; never blindly delete them.
- `src/theme.ts` remains present for compatibility with any tests or imports that still refer to `appTheme`. Do not delete it without a dependency search.

## Further design work
The visual references show the desired polished destination, not a claim that all panels have been rebuilt. Once the basic theme is stable, progressively refine LevelNav, PeriodicTable, SubshellPanel, MoleculeViewOptions, RadialPlot and owner JobsTable with component-scoped styles and screenshot tests. Avoid global `.Mui*` overrides that affect scientific controls indiscriminately.

## Visual references
- `references/original-concepts.png`: original five concept panels
- `references/theme-comparison.png`: A Deep Space / B Light Clean plus molecule, learning and admin

These are design references, **not production UI graphics**.

**Branch note:** The branch's `src/design/` files were independently authored and are not byte-identical to the files in the original ZIP. Reconcile differences before running the script. Original PNGs remain in the downloadable ZIP.
