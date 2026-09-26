# Phase 2 — Share and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A *Share* button that copies a URL restoring the exact view, and an *Export* menu offering PNG (2×, with or without overlays), glTF, STL (watertight, millimetres), CSV of the radial curves and a Gaussian cube file of the sampled field.

**Architecture:** `src/url_state.ts` is the one module that owns the URL hash: a registry of key groups per mode (`registerUrlKeys`), `encodeState()`/`applyState()` over a bound store, and the built-in groups for atom mode, Basic Orbitals (including Phase 1's combinations) and the view keys every mode shares. Everything the URL carries has to be in Redux for that to work, so Basic Orbitals' n/l/mₗ, the enclosed fraction and Phase 1's combination move out of `App`'s local state, and the camera direction is mirrored into the store. A restored atom view cannot be applied until its SCF lands, so the requested view waits in `atom.pendingView` and is applied by `solveSucceeded`. Exports live under `src/export/`: pure encoders (CSV, STL, cube, glTF scene) with tests, a viewer handle that `OrbitalViewer` fills (PNG capture, surface collection), and a worker for the cube file.

**Tech Stack:** TypeScript, React 19, MUI 7, Redux Toolkit, three.js 0.176 (`three/addons/exporters/GLTFExporter.js`, already a dependency), Vite, Jest + ts-jest + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` (§3 principles, §4.3 URL state, §5 Phase 2).

**Precondition:** Phase 1 (`docs/superpowers/plans/2026-09-25-phase-1-hybrids-and-stark.md`) has landed. This plan edits code in the shape Phase 1 leaves it: `src/field_source.ts` (`AnalyticFieldSource`, `hydrogenicSource`, `makeFieldEvaluator`), `sampleFieldSource` in `src/orbital_mesh.ts`, `src/combinations.ts` (`CombinationSelection`, `NO_COMBINATION`, `combinationTitle`, `combinationCurves`), `basicOrbitalParams(n, l, ml, enclosedFraction)` in `src/orbital_presets.ts`, `orbital.currentField` / `startFieldCalculation`, and `App`'s `combination` state and combination effect. Check with `ls src/field_source.ts src/combinations.ts` before starting; if either is missing, stop and report.

## Global Constraints

- The URL API, verbatim from spec §4.3, which later phases call by name: `export function encodeState(): string;` (current view → hash, no '#'), `export function applyState(hash: string): void;` (hash → dispatches restoring the view), `export function registerUrlKeys(mode: string, encoder: (state: RootState) => Record<string, string>, decoder: (params: URLSearchParams, dispatch: AppDispatch) => void): void;`. The mode key is `mode`. Phase 4 adds its `rel` key inside this module's atom group and its round-trip case to `tests/url_state.test.ts`, so both names are fixed.
- "Unknown or invalid keys are ignored, never thrown on."
- "Every number states its method." Every export that carries numbers (CSV, cube, PNG caption) states the level of theory.
- "Failures are shown, not hidden." An export that cannot be made says why; it never writes an empty, partial or non-watertight file.
- "Performance budget … heavy work runs in a worker; the UI never blocks." Nothing added here may cost frame time in normal use: no `preserveDrawingBuffer`, no per-render copies of the sampled field.
- "Layout contract. New panels live in the existing columns on desktop (navigation left, view settings right) and in the phone sheet's tabs (Explore / View / Plot). No new floating panel over the canvas." Share and Export sit in `Controls`, which is the right `.view-panel` on desktop and the *View* tab on a phone.
- Atomic units. Cube files are in bohr (positive atom count). `D(r) = 4πr²ρ(r)` is the *radial distribution*; `density` means ρ(r) only (HANDOFF naming rule).
- No new runtime or dev dependencies. The property test uses a seeded PRNG, not fast-check.
- British spelling and the codebase's comment register (prose on *why*; see `src/radial_distribution.ts`).
- Every existing test passes at every commit. `ATOM_SLOW_TESTS` gating is untouched.
- Run every command in the foreground. Tests: `npx jest <path>`. Types: `npx tsc --noEmit -p .`.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Live checks use the dev server at http://localhost:5391 (`npx vite --port 5391 --strictPort`), at 1440x900 and at 390x844 with touch emulation.

## Review Focus

1. **Hand-edited or truncated links** (`Z=abc`, `n=9`, `ml=5`, `cut=w:2`, `op=`, `mode=molecule`) must load the deepest valid part of the view and never throw or leave a blank canvas. Test: Task 5, "ignores what it cannot use".
2. **A link to something the element does not have** (hydrogen's 3d) must fall back to the deepest level that exists, not hang in "solving". Tests: Task 3 (reducer) and Task 5 (end to end).
3. **Share pressed while the linked atom is still solving** must copy the view that was asked for, not the transient whole-atom view. Test: Task 5, "a link copied mid-solve".
4. **Export pressed before there is anything to export** (the shell's lobes still computing, an orbital still loading, STL/glTF at the whole-atom level, a cube of a multi-member overlay) must give a stated reason. Tests: Tasks 10, 11 and 13.
5. **Clipboard refused** (plain http, an iframe without permission) must show the link in a dialog to copy by hand. Test: Task 7.

---

## Design decisions

- **Camera direction is in the URL; distance is not.** A d orbital looked at down z and from the side are different pictures, and azimuth/elevation mean the same on any screen. Distance does not: the app fits the camera to the viewport and to the panels it measures (`useViewInsets`, `fitFactorFor`), which differ between a phone and a desktop, so a stored distance would frame the atom wrongly on the other device. `cam=az,el` in whole degrees, omitted at the canonical view. `frameOrbital` already keeps the current direction when it refits, so a direction set before the mesh lands survives framing.
- **PNG: render and read in the same task, no `preserveDrawingBuffer`.** Setting that flag forces a buffer copy on every frame for the life of the page. Instead the capture raises the pixel ratio, renders once, copies the canvas into a 2D canvas in the same JavaScript task (the drawing buffer is valid until the browser composites), restores the ratio and renders again so no blank frame is shown. "2× screen resolution" is 2× the current drawing buffer, capped at 4096 px on the long side (GPU memory on phones and integrated graphics). The image is cropped to the area the panels leave free, where the view offset centres the atom.
- **The cube file is resampled on demand, in a worker.** The mesh worker returns only the 8-bit density map; keeping the float field for every render would cost ~8.6 MB per render for a rare action. Sampling is deterministic, so the export worker re-samples exactly the source that was drawn (`sampleFieldSource`, Phase 1). Atom levels 1–2 have no 3D field; their cube is ρ(r) = D(r)/(4πr²) of what the cut face shows (total, shell or subshell), on a box enclosing 99.9 % of it.
- **Geometry exports take the whole surface.** The cut is a view setting; a cut surface is open and would not print. STL is refused, with the reason, unless every surface passes a manifold check (every edge shared by exactly two triangles, consistently oriented). glTF is scaled so the model is 20 cm across (AR) and records `metresPerBohr` in the root node's extras.
- **Basic Orbitals renders through a nonce.** A URL decoder cannot see the state, and several decoders may run for one mode (Phase 1's combination keys, later ones). So decoders only set state and call `requestBasicRender()`; `App` renders once, after every dispatch has landed, from whatever the state then says.
- **A restored cut is re-applied after the view lands.** `App` clears the cut when entering an orbital view. The link's cut is held in `orbital.pendingCut` and applied by an effect declared after that one, once `atom.pendingView` is null.

## File Structure

| File | Create / Modify | Responsibility |
| --- | --- | --- |
| `src/store/orbitalSlice.ts` | Modify | `basicSelection`, `enclosedFraction`, `combination`, `basicRenderNonce`, `cameraAngles`, `cameraRestoreNonce`, `pendingCut`; `selectShownBasicOrbital` |
| `src/store/atomSlice.ts` | Modify | `pendingView`, `requestAtomView`, applied in `solveSucceeded` |
| `src/store/index.ts`, `src/store/hooks.ts` | Modify | `AppStore` type, `useAppStore` |
| `src/camera_angles.ts` | Create | Camera direction ↔ whole-degree azimuth/elevation (z up) |
| `src/url_state.ts` | Create | Registry, `encodeState`/`applyState`, built-in key groups, parsers |
| `src/useUrlStateSync.ts` | Create | Keeps the hash in step (`replaceState`), applies typed hashes |
| `src/share.ts` | Create | Share URL, clipboard with fallback |
| `src/components/ShareExportBar.tsx` | Create | Share and Export buttons, menu, STL dialog, notices |
| `src/export/caption.ts` | Create | View description, method statement, file names |
| `src/export/csv.ts` | Create | Radial curves → CSV |
| `src/export/download.ts` | Create | Blob → file download |
| `src/export/run_export.ts` | Create | Export kinds, availability, dispatch to encoders |
| `src/export/handle.ts` | Create | `ViewerExportHandle`, filled by `OrbitalViewer` |
| `src/export/png.ts` | Create | Pixel ratio, crop, overlays, capture |
| `src/export/surfaces.ts` | Create | Marked meshes → `ExportSurface[]`, bounds |
| `src/export/mesh_topology.ts` | Create | Weld, manifold and orientation report |
| `src/export/stl.ts` | Create | Binary STL in millimetres |
| `src/export/gltf.ts`, `src/export/gltf_exporter_factory.ts` | Create | glTF scene; lazy `GLTFExporter` (isolated for Jest, like `orbital_controls_factory.ts`) |
| `src/export/cube.ts` | Create | Cube format, field and radial-density grids |
| `src/export/cube_request.ts` | Create | Cube request types, blob builder, worker round trip |
| `src/workers/exportWorker.ts`, `src/workers/createExportWorker.ts` | Create | Worker and its `import.meta.url` factory |
| `src/App.tsx`, `src/main.tsx`, `src/components/Controls.tsx`, `src/components/OrbitalViewer.tsx`, `src/orbital_visualizer.ts`, `src/atom/shell_composition_view.ts` | Modify | Wiring |
| `README.md`, `docs/HANDOFF.md` | Modify | Task 14 |

---

### Task 1: Basic Orbitals' view state in Redux

**Files:**
- Modify: `src/store/orbitalSlice.ts`, `src/App.tsx`, `src/components/Controls.tsx` (`handleUpdateOrbital` only)
- Test: `tests/orbital_slice.test.ts` (Phase 1 created it; append), `src/App.test.tsx` (append)

**Interfaces:**
- Consumes: `basicOrbitalParams(n, l, ml, enclosedFraction): OrbitalParams`, `DEFAULT_ENCLOSED_FRACTION`, `BASIC_ORBITALS_Z` (`src/orbital_presets.ts`); `CombinationSelection`, `NO_COMBINATION` (`src/combinations.ts`); `setMode` (`src/store/atomSlice.ts`).
- Produces: `interface BasicSelection { n: number; l: number; ml: number }`; `DEFAULT_BASIC_SELECTION`; state `basicSelection`, `enclosedFraction`, `combination`, `basicRenderNonce`; actions `setBasicSelection(Partial<BasicSelection>)`, `setEnclosedFraction(number)`, `setCombination(CombinationSelection)`, `requestBasicRender()`; `setMode('hydrogenic')` also bumps `basicRenderNonce`; `selectShownBasicOrbital(state: RootState): BasicSelection`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/orbital_slice.test.ts` (add the imports to the top of the file):

```ts
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer, {
    setBasicSelection, setEnclosedFraction, setCombination, requestBasicRender, selectShownBasicOrbital,
    DEFAULT_BASIC_SELECTION,
} from '../src/store/orbitalSlice';
import atomReducer from '../src/store/atomSlice';
import { basicOrbitalParams, DEFAULT_ENCLOSED_FRACTION } from '../src/orbital_presets';
import { NO_COMBINATION } from '../src/combinations';

const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });

describe('orbitalSlice: Basic Orbitals view state', () => {
    it('starts at 3d_z², the default fraction and no combination', () => {
        const { orbital } = makeStore().getState();
        expect(orbital.basicSelection).toEqual({ n: 3, l: 2, ml: 0 });
        expect(orbital.enclosedFraction).toBe(DEFAULT_ENCLOSED_FRACTION);
        expect(orbital.combination).toEqual(NO_COMBINATION);
    });

    it('merges partial selections and stores the fraction and combination', () => {
        const store = makeStore();
        store.dispatch(setBasicSelection({ n: 4 }));
        store.dispatch(setBasicSelection({ l: 3, ml: -2 }));
        store.dispatch(setEnclosedFraction(0.75));
        store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }));
        const { orbital } = store.getState();
        expect(orbital.basicSelection).toEqual({ n: 4, l: 3, ml: -2 });
        expect(orbital.enclosedFraction).toBe(0.75);
        expect(orbital.combination).toEqual({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
    });

    it('asks for a Basic Orbitals render on switching to it, and on request', () => {
        const store = makeStore();
        store.dispatch(setMode('atom'));
        expect(store.getState().orbital.basicRenderNonce).toBe(0);
        store.dispatch(setMode('hydrogenic'));
        expect(store.getState().orbital.basicRenderNonce).toBe(1);
        store.dispatch(requestBasicRender());
        expect(store.getState().orbital.basicRenderNonce).toBe(2);
    });

    it('reports the orbital drawn, not an unsubmitted selection', () => {
        const store = makeStore();
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 1, 0.9)));
        store.dispatch(setBasicSelection({ n: 5 }));
        expect(selectShownBasicOrbital(store.getState())).toEqual({ n: 2, l: 1, ml: 1 });
    });

    it('falls back to the selection when the drawn orbital is an atom-mode one', () => {
        const store = makeStore();
        store.dispatch(startOrbitalCalculation({
            ...basicOrbitalParams(2, 1, 0, 0.9), Z: 18,
            radialSamples: { R: new Float64Array(3), rMin: 1e-3, dx: 0.1, size: 3 },
        }));
        expect(selectShownBasicOrbital(store.getState())).toEqual(DEFAULT_BASIC_SELECTION);
    });
});
```

(`setMode` and `startOrbitalCalculation` are already imported by Phase 1's part of the file; if not, add them to the imports above.)

Append inside `describe('App', ...)` in `src/App.test.tsx` (add `setBasicSelection` to the `./store/orbitalSlice` import):

```tsx
    it('switching to Basic Orbitals draws the selection held in the store', () => {
        const { store } = renderWithProvider(<App />);
        act(() => { store.dispatch(setBasicSelection({ n: 2, l: 1, ml: 1 })); });
        fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
        expect(store.getState().orbital.currentParams).toMatchObject({ n: 2, l: 1, ml: 1, Z: 1 });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/orbital_slice.test.ts src/App.test.tsx`
Expected: FAIL — `setBasicSelection` is not exported.

- [ ] **Step 3: Implement**

`src/store/orbitalSlice.ts` — add to the imports, the state interface, `initialState`, the reducers, the existing `setMode` case in `extraReducers`, and the exports:

```ts
import { BASIC_ORBITALS_Z, DEFAULT_ENCLOSED_FRACTION } from '../orbital_presets';
import { CombinationSelection, NO_COMBINATION } from '../combinations';
import type { RootState } from './index';

export interface BasicSelection { n: number; l: number; ml: number; }
export const DEFAULT_BASIC_SELECTION: BasicSelection = { n: 3, l: 2, ml: 0 };

// OrbitalState gains:
  /** Basic Orbitals' panel choice. In the store, not App, because a shared link restores it. */
  basicSelection: BasicSelection;
  /** The contour's enclosed share, for both modes. */
  enclosedFraction: number;
  /** Phase 1's combination picker. */
  combination: CombinationSelection;
  /** Bumped to ask App for a Basic Orbitals render once every pending dispatch has landed. */
  basicRenderNonce: number;

// initialState gains:
  basicSelection: { ...DEFAULT_BASIC_SELECTION },
  enclosedFraction: DEFAULT_ENCLOSED_FRACTION,
  combination: NO_COMBINATION,
  basicRenderNonce: 0,

// reducers gain:
    setBasicSelection: (state, action: PayloadAction<Partial<BasicSelection>>) => {
      state.basicSelection = { ...state.basicSelection, ...action.payload };
    },
    setEnclosedFraction: (state, action: PayloadAction<number>) => {
      state.enclosedFraction = action.payload;
    },
    setCombination: (state, action: PayloadAction<CombinationSelection>) => {
      state.combination = action.payload;
    },
    requestBasicRender: (state) => {
      state.basicRenderNonce += 1;
    },

// in extraReducers' existing setMode case, first line:
      if (action.payload === 'hydrogenic') state.basicRenderNonce += 1;

/**
 * The Basic Orbitals orbital a link or a caption should name: the one drawn,
 * which can differ from the panel until Update Orbital is pressed. An orbital
 * with a numerical radial factor, or another Z, is atom mode's level 3 and
 * does not count.
 */
export function selectShownBasicOrbital(state: RootState): BasicSelection {
  const drawn = state.orbital.currentParams;
  if (drawn && !drawn.radialSamples && drawn.Z === BASIC_ORBITALS_Z) {
    return { n: drawn.n, l: drawn.l, ml: drawn.ml };
  }
  return state.orbital.basicSelection;
}
```

Add `setBasicSelection, setEnclosedFraction, setCombination, requestBasicRender` to the exported actions.

`src/App.tsx`:

1. Replace the `useState` lines for `n`, `l`, `ml`, `enclosedFraction` and Phase 1's `combination` with store reads and stable dispatchers (keep the names, so the rest of the component is unchanged):

```ts
    const { n, l, ml } = useAppSelector(state => state.orbital.basicSelection);
    const enclosedFraction = useAppSelector(state => state.orbital.enclosedFraction);
    const combination = useAppSelector(state => state.orbital.combination);
    const basicRenderNonce = useAppSelector(state => state.orbital.basicRenderNonce);
    // Stable, because Controls' n/l effects list these callbacks as dependencies.
    const setN = useCallback((value: number) => dispatch(setBasicSelection({ n: value })), [dispatch]);
    const setL = useCallback((value: number) => dispatch(setBasicSelection({ l: value })), [dispatch]);
    const setMl = useCallback((value: number) => dispatch(setBasicSelection({ ml: value })), [dispatch]);
    const handleEnclosedFractionChange = useCallback((value: number) => dispatch(setEnclosedFraction(value)), [dispatch]);
    const handleCombinationChange = useCallback((value: CombinationSelection) => dispatch(setCombination(value)), [dispatch]);
```

2. Delete `defaultN`, `defaultL`, `isInitializedRef`, the "Initial render - only run once" effect and the mode-switch effect (`if (isAtomMode || combination.kind !== 'none') return; …` keyed on `[isAtomMode]`). Put in their place:

```ts
    // Basic Orbitals draws its plain orbital here and nowhere else: on the
    // switch into the mode (setMode bumps the nonce) and when a restored link
    // asks (requestBasicRender). One effect, run after every dispatch of the
    // batch has landed, so a link's selection and combination are both in
    // place before anything is drawn. A combination draws through Phase 1's
    // own effect below instead.
    useEffect(() => {
        if (basicRenderNonce === 0 || isAtomMode || combination.kind !== 'none') return;
        dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basicRenderNonce]);
```

3. In `<Controls …>`: `onEnclosedFractionChange={handleEnclosedFractionChange}` and `onCombinationChange={handleCombinationChange}`. Add `setBasicSelection, setEnclosedFraction, setCombination` to the `./store/orbitalSlice` import; remove imports left unused.

`src/components/Controls.tsx`, `handleUpdateOrbital`: build the params with `basicOrbitalParams(initialN, initialL, initialMl, initialEnclosedFraction)` instead of the inline object (same fields).

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/orbital_slice.test.ts src/App.test.tsx src/components/Controls.test.tsx tests/combinations.test.ts && npx tsc --noEmit -p .`
Expected: PASS, including Phase 1's "a combination survives a round trip through atom mode" and "None redraws the orbital in the panel"; tsc clean.

- [ ] **Step 5: Live check (regression only), 1440x900 and 390x844**

Basic Orbitals: 3d_z² draws on entering the mode; pick n = 4, l = 1, mₗ = 0, Update Orbital → 4p_z; Combination → sp³ draws; None → 4p_z again; Atom → Basic → 4p_z (not 3d_z²). On the phone, the same through the *Orbital & view* tab.

- [ ] **Step 6: Commit**

```bash
git add src/store/orbitalSlice.ts src/App.tsx src/components/Controls.tsx tests/orbital_slice.test.ts src/App.test.tsx
git commit -m "refactor(state): Basic Orbitals selection, fraction and combination live in the store

A shared link has to restore them, and a URL decoder can only dispatch.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Camera direction as angles, mirrored into the store

**Files:**
- Create: `src/camera_angles.ts`
- Modify: `src/orbital_visualizer.ts` (`defaultCameraPosition`), `src/store/orbitalSlice.ts`, `src/components/OrbitalViewer.tsx`
- Test: `tests/camera_angles.test.ts`, `tests/orbital_slice.test.ts`

**Interfaces:**
- Produces: `interface CameraAngles { azimuth: number; elevation: number }` (whole degrees, z up, azimuth in (−180, 180], elevation in [−89, 89]); `CANONICAL_CAMERA_DIRECTION`; `CANONICAL_CAMERA_ANGLES` (= `{ azimuth: 29, elevation: 30 }`); `anglesFromDirection(x, y, z)`; `directionFromAngles(angles): THREE.Vector3`; `isCanonicalAngles(angles)`; `cameraAnglesOf(camera, target)`; `applyCameraAngles(camera, target, angles | null)`. Store: `cameraAngles: CameraAngles | null` (null = canonical), `cameraRestoreNonce`; actions `cameraMoved(CameraAngles)`, `restoreCamera(CameraAngles | null)`.

- [ ] **Step 1: Write the failing tests**

`tests/camera_angles.test.ts`:

```ts
import * as THREE from 'three';
import {
    anglesFromDirection, directionFromAngles, CANONICAL_CAMERA_ANGLES, applyCameraAngles, cameraAnglesOf,
} from '../src/camera_angles';

describe('camera angles', () => {
    it('names the canonical three-quarter view', () => {
        expect(CANONICAL_CAMERA_ANGLES).toEqual({ azimuth: 29, elevation: 30 });
    });

    it('round-trips whole-degree angles through a direction', () => {
        for (let azimuth = -179; azimuth <= 180; azimuth += 7) {
            for (let elevation = -89; elevation <= 89; elevation += 11) {
                const d = directionFromAngles({ azimuth, elevation });
                expect(anglesFromDirection(d.x, d.y, d.z)).toEqual({ azimuth, elevation });
            }
        }
    });

    it('holds elevation short of the pole, where azimuth stops meaning anything', () => {
        expect(anglesFromDirection(0, 0, 5)).toEqual({ azimuth: 0, elevation: 89 });
    });

    it('turns the camera to the angles at the distance it already had', () => {
        const target = new THREE.Vector3(1, 1, 1);
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(1, 1, 11);
        applyCameraAngles(camera, target, { azimuth: 90, elevation: 0 });
        expect(camera.position.distanceTo(target)).toBeCloseTo(10, 9);
        expect(cameraAnglesOf(camera, target)).toEqual({ azimuth: 90, elevation: 0 });
        applyCameraAngles(camera, target, null);
        expect(cameraAnglesOf(camera, target)).toEqual(CANONICAL_CAMERA_ANGLES);
    });
});
```

Append to `tests/orbital_slice.test.ts` (import `cameraMoved, restoreCamera` from the slice and `CANONICAL_CAMERA_ANGLES` from `../src/camera_angles`):

```ts
describe('orbitalSlice: camera', () => {
    it('records a settled camera and forgets it at the canonical view', () => {
        const store = makeStore();
        store.dispatch(cameraMoved({ azimuth: 120, elevation: -10 }));
        expect(store.getState().orbital.cameraAngles).toEqual({ azimuth: 120, elevation: -10 });
        store.dispatch(cameraMoved(CANONICAL_CAMERA_ANGLES));
        expect(store.getState().orbital.cameraAngles).toBeNull();
    });

    it('bumps the restore nonce so the viewer turns the camera', () => {
        const store = makeStore();
        store.dispatch(restoreCamera({ azimuth: 45, elevation: 20 }));
        expect(store.getState().orbital).toMatchObject({ cameraAngles: { azimuth: 45, elevation: 20 }, cameraRestoreNonce: 1 });
        store.dispatch(restoreCamera(null));
        expect(store.getState().orbital).toMatchObject({ cameraAngles: null, cameraRestoreNonce: 2 });
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/camera_angles.test.ts tests/orbital_slice.test.ts`
Expected: FAIL — cannot find `../src/camera_angles`.

- [ ] **Step 3: Implement**

`src/camera_angles.ts`:

```ts
import * as THREE from 'three';

/**
 * Which side the camera looks from, in whole degrees with z up: azimuth
 * round the z axis from +x, elevation above the xy plane. Whole degrees
 * because this goes in a shared link, where 29.2517 says nothing 29 does
 * not. Distance is deliberately absent: the app fits it to the screen and
 * the panels, which differ between the device that shared and the one that
 * opens the link.
 */
export interface CameraAngles { azimuth: number; elevation: number; }

/** The canonical three-quarter view (see defaultCameraPosition's comment). */
export const CANONICAL_CAMERA_DIRECTION: readonly [number, number, number] = [0.75, 0.42, 0.5];

const DEGREES = 180 / Math.PI;
/** Short of the pole, where azimuth is undefined and OrbitControls flips. */
const MAX_ELEVATION = 89;

export function anglesFromDirection(x: number, y: number, z: number): CameraAngles {
    const length = Math.hypot(x, y, z) || 1;
    const elevation = Math.round(Math.asin(Math.max(-1, Math.min(1, z / length))) * DEGREES);
    let azimuth = Math.round(Math.atan2(y, x) * DEGREES);
    if (azimuth <= -180) azimuth += 360;
    // + 0 turns -0 into 0, so a link never reads "-0".
    return {
        azimuth: azimuth + 0,
        elevation: Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, elevation)) + 0,
    };
}

export const CANONICAL_CAMERA_ANGLES: CameraAngles = anglesFromDirection(...CANONICAL_CAMERA_DIRECTION);

export function directionFromAngles({ azimuth, elevation }: CameraAngles): THREE.Vector3 {
    const a = azimuth / DEGREES;
    const e = elevation / DEGREES;
    return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e));
}

export function isCanonicalAngles(angles: CameraAngles): boolean {
    return angles.azimuth === CANONICAL_CAMERA_ANGLES.azimuth && angles.elevation === CANONICAL_CAMERA_ANGLES.elevation;
}

export function cameraAnglesOf(camera: THREE.Camera, target: THREE.Vector3): CameraAngles {
    const d = camera.position.clone().sub(target);
    return anglesFromDirection(d.x, d.y, d.z);
}

/** Turns the camera to these angles (null: the canonical view), keeping its distance. */
export function applyCameraAngles(camera: THREE.Camera, target: THREE.Vector3, angles: CameraAngles | null): void {
    const distance = camera.position.distanceTo(target) || 1;
    const direction = angles
        ? directionFromAngles(angles)
        : new THREE.Vector3(...CANONICAL_CAMERA_DIRECTION).normalize();
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    camera.lookAt(target);
}
```

`src/orbital_visualizer.ts`, `defaultCameraPosition`: return `new THREE.Vector3(...CANONICAL_CAMERA_DIRECTION).normalize().multiplyScalar(distance);` (import it from `./camera_angles`; keep the comment).

`src/store/orbitalSlice.ts`: state `cameraAngles: CameraAngles | null` (initial `null`) and `cameraRestoreNonce: number` (initial `0`), and:

```ts
    // The viewer reports the camera once it settles. Stored as null at the
    // canonical view, so an untouched view's link carries no cam key.
    cameraMoved: (state, action: PayloadAction<CameraAngles>) => {
      const next = isCanonicalAngles(action.payload) ? null : action.payload;
      const current = state.cameraAngles;
      const same = next === null
        ? current === null
        : current !== null && current.azimuth === next.azimuth && current.elevation === next.elevation;
      if (!same) state.cameraAngles = next;
    },
    // A restored link: the nonce is what the viewer watches.
    restoreCamera: (state, action: PayloadAction<CameraAngles | null>) => {
      state.cameraAngles = action.payload && !isCanonicalAngles(action.payload) ? action.payload : null;
      state.cameraRestoreNonce += 1;
    },
```

`src/components/OrbitalViewer.tsx` — after the initialisation effect:

```ts
    // The camera's direction, into the store once it settles (OrbitControls
    // fires every damped frame), so a shared link can carry it.
    useEffect(() => {
        const context = visualizerContextRef.current;
        if (!context) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const settle = () => {
            timer = null;
            dispatch(cameraMoved(cameraAnglesOf(context.camera, context.controls.target)));
        };
        const onChange = () => {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(settle, CAMERA_SETTLE_MS);
        };
        context.controls.addEventListener('change', onChange);
        return () => {
            context.controls.removeEventListener('change', onChange);
            if (timer !== null) clearTimeout(timer);
        };
    }, [dispatch]);

    // A restored link turns the camera. frameOrbital keeps the direction it
    // finds, so this survives the framing that follows when the mesh lands.
    const cameraRestoreNonce = useAppSelector(state => state.orbital.cameraRestoreNonce);
    const restoredCameraAngles = useAppSelector(state => state.orbital.cameraAngles);
    useEffect(() => {
        const context = visualizerContextRef.current;
        if (!context || cameraRestoreNonce === 0) return;
        applyCameraAngles(context.camera, context.controls.target, restoredCameraAngles);
        context.controls.update();
        // Only a restore moves the camera; the user's own moves also change
        // cameraAngles and must not.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraRestoreNonce]);
```

with `const CAMERA_SETTLE_MS = 300;` at module level and imports of `cameraMoved` and `applyCameraAngles, cameraAnglesOf`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/camera_angles.test.ts tests/orbital_slice.test.ts tests/atom/visualizer_dispatch.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Live check (regression), 1440x900**

Drag the view: rotation and damping unchanged. Reset View returns to the same three-quarter angle as before this task. No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/camera_angles.ts src/orbital_visualizer.ts src/store/orbitalSlice.ts src/components/OrbitalViewer.tsx tests/camera_angles.test.ts tests/orbital_slice.test.ts
git commit -m "feat(camera): camera direction as whole-degree angles, mirrored into the store

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A requested atom view and cut wait for the solve

**Files:**
- Modify: `src/store/atomSlice.ts`, `src/store/orbitalSlice.ts`, `src/App.test.tsx` (the `defaultAtomState` fixture only)
- Test: `tests/atom/atom_slice.test.ts`, `tests/orbital_slice.test.ts`

**Interfaces:**
- Produces: `interface PendingAtomView { level: ViewLevel; shell: number | null; subshell: { n: number; l: number } | null; orbital: { n: number; l: number; ml: number } | null }`; `AtomState.pendingView`; action `requestAtomView(PendingAtomView)`; `setElement` clears it; `solveSucceeded` applies it (deepest occupied part) and clears it. `interface CutSetting { clipAxis: ClipAxis; clipPosition: number }`; `orbital.pendingCut`; actions `requestCut(CutSetting)` (sets the surface style's cut now and remembers it), `clearPendingCut()`. Later phases that add selection fields (Phase 4's j) extend `PendingAtomView` and its application here.

- [ ] **Step 1: Write the failing tests**

Append to `tests/atom/atom_slice.test.ts` (import `requestAtomView, PendingAtomView` from the slice; `neonLikeProfile` and `buildStore` are already in the file):

```ts
describe('a requested view lands with the solve', () => {
    const landOnNeon = (view: PendingAtomView) => {
        const store = buildStore();
        store.dispatch(setElement(10));
        store.dispatch(requestAtomView(view));
        store.dispatch(solveSucceeded(neonLikeProfile()));
        return store.getState().atom;
    };
    const orbital = (n: number, l: number, ml: number): PendingAtomView =>
        ({ level: 'orbital', shell: n, subshell: { n, l }, orbital: { n, l, ml } });

    it('opens the requested orbital once the profile arrives', () => {
        const atom = landOnNeon(orbital(2, 1, -1));
        expect(atom).toMatchObject({ level: 'orbital', selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: -1 }, pendingView: null });
    });

    it('stops at the subshell when mₗ is out of range', () => {
        expect(landOnNeon(orbital(2, 1, 2))).toMatchObject({ level: 'shell', selectedSubshell: { n: 2, l: 1 }, selectedOrbital: null });
    });

    // Review Focus 2: neon has no n = 3 shell.
    it('falls back to the whole atom for a shell the element does not have', () => {
        expect(landOnNeon(orbital(3, 2, 0))).toMatchObject({ level: 'atom', selectedShell: null, pendingView: null });
    });

    it('is cancelled by picking another element, and not re-applied by a later solve', () => {
        const store = buildStore();
        store.dispatch(setElement(10));
        store.dispatch(requestAtomView(orbital(2, 1, 0)));
        store.dispatch(setElement(10));
        expect(store.getState().atom.pendingView).toBeNull();
        store.dispatch(solveSucceeded(neonLikeProfile()));
        expect(store.getState().atom.level).toBe('atom');
    });
});
```

Append to `tests/orbital_slice.test.ts` (import `requestCut, clearPendingCut`):

```ts
describe('orbitalSlice: a restored cut', () => {
    it('is applied at once and remembered until cleared', () => {
        const store = makeStore();
        store.dispatch(requestCut({ clipAxis: 'y', clipPosition: 0.5 }));
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'y', clipPosition: 0.5 });
        expect(store.getState().orbital.pendingCut).toEqual({ clipAxis: 'y', clipPosition: 0.5 });
        store.dispatch(clearPendingCut());
        expect(store.getState().orbital.pendingCut).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/atom/atom_slice.test.ts tests/orbital_slice.test.ts`
Expected: FAIL — `requestAtomView` is not exported.

- [ ] **Step 3: Implement**

`src/store/atomSlice.ts`:

```ts
/**
 * A view asked for before it can be shown: a shared link names a shell or
 * an orbital, but occupancy is only known once the SCF lands. Applied by
 * solveSucceeded, as deep as the profile allows.
 */
export interface PendingAtomView {
    level: ViewLevel;
    shell: number | null;
    subshell: { n: number; l: number } | null;
    orbital: { n: number; l: number; ml: number } | null;
}
```

Add `pendingView: PendingAtomView | null` to `AtomState` (initial `null`); in `setElement` add `state.pendingView = null;`; add the reducer

```ts
        requestAtomView: (state, action: PayloadAction<PendingAtomView>) => {
            state.pendingView = action.payload;
        },
```

end `solveSucceeded` with `applyPendingView(state);`, export `requestAtomView`, and add above the slice:

```ts
/** Opens a pending view to the deepest level the solved profile actually has. */
function applyPendingView(state: AtomState): void {
    const view = state.pendingView;
    const profile = state.profile;
    if (!view || !profile || profile.Z !== state.Z) return;
    state.pendingView = null;
    state.level = 'atom';
    state.selectedShell = null;
    state.selectedSubshell = null;
    state.selectedOrbital = null;
    if (view.level === 'atom' || view.shell === null || !shellIsOccupied(profile, view.shell)) return;
    state.level = 'shell';
    state.selectedShell = view.shell;
    const subshell = view.subshell;
    if (!subshell || subshell.n !== view.shell || !subshellIsOccupied(profile, subshell.n, subshell.l)) return;
    state.selectedSubshell = { n: subshell.n, l: subshell.l };
    const orbital = view.orbital;
    if (view.level !== 'orbital' || !orbital || orbital.n !== subshell.n || orbital.l !== subshell.l
        || orbital.ml < -subshell.l || orbital.ml > subshell.l) return;
    state.level = 'orbital';
    state.selectedOrbital = { n: orbital.n, l: orbital.l, ml: orbital.ml };
}
```

`src/store/orbitalSlice.ts`:

```ts
export interface CutSetting { clipAxis: ClipAxis; clipPosition: number; }
// state: pendingCut: CutSetting | null  (initial null)
    // A shared link's cut. Applied now, and again by App once the linked view
    // is on screen, because entering an orbital view clears the cut.
    requestCut: (state, action: PayloadAction<CutSetting>) => {
      state.surfaceStyle = { ...state.surfaceStyle, ...action.payload };
      state.pendingCut = action.payload;
    },
    clearPendingCut: (state) => {
      state.pendingCut = null;
    },
```

(import `ClipAxis` from `../types/orbital`; export both actions.)

`src/App.test.tsx`: add `pendingView: null,` to `defaultAtomState`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/atom/atom_slice.test.ts tests/orbital_slice.test.ts tests/atom/use_atom_solver.test.tsx src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/atomSlice.ts src/store/orbitalSlice.ts src/App.test.tsx tests/atom/atom_slice.test.ts tests/orbital_slice.test.ts
git commit -m "feat(state): a requested atom view and cut wait for the solve

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `src/url_state.ts` — the registry

**Files:**
- Create: `src/url_state.ts`
- Modify: `src/store/index.ts` (export `AppStore`)
- Test: `tests/url_state.test.ts`

**Interfaces:**
- Consumes: `RootState`, `AppDispatch` (`src/store/index.ts`); `ViewMode`.
- Produces: the spec's `encodeState(): string`, `applyState(hash: string): void`, `registerUrlKeys(mode, encoder, decoder): void`; plus `ANY_MODE = '*'` (key groups every mode gets: decoded first, encoded last), `UrlEncoder`, `UrlDecoder`, `urlModeOf(state): string` (`atom` → `'atom'`, `hydrogenic` → `'basic'`), `encodeStateOf(state: RootState): string`, `applyStateTo(hash: string, dispatch: AppDispatch): void`, `bindUrlStateStore(store | null)`, `hasSharedView(hash): boolean`, `resetUrlKeysForTests()`. Several groups may register for one mode; they merge in registration order. `export type AppStore = typeof store` in `src/store/index.ts`.

- [ ] **Step 1: Write the failing test**

`tests/url_state.test.ts`:

```ts
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer, { setEnclosedFraction } from '../src/store/orbitalSlice';
import atomReducer, { setMode } from '../src/store/atomSlice';
import {
    registerUrlKeys, resetUrlKeysForTests, encodeStateOf, applyStateTo, encodeState, applyState,
    bindUrlStateStore, hasSharedView, urlModeOf, ANY_MODE,
} from '../src/url_state';

const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });
const noop = () => {};

describe('url_state registry', () => {
    beforeEach(() => { resetUrlKeysForTests(); bindUrlStateStore(null); });

    it('writes the mode, then its keys, then the shared keys', () => {
        registerUrlKeys(ANY_MODE, s => ({ frac: String(s.orbital.enclosedFraction) }), noop);
        registerUrlKeys('atom', s => ({ Z: String(s.atom.Z) }), noop);
        expect(encodeStateOf(makeStore().getState())).toBe('mode=atom&Z=1&frac=0.9');
    });

    it('calls Basic Orbitals "basic", and leaves the mode out when nothing is registered for it', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(urlModeOf(store.getState())).toBe('basic');
        registerUrlKeys(ANY_MODE, () => ({ op: '1' }), noop);
        expect(encodeStateOf(store.getState())).toBe('op=1');
    });

    it('merges groups for one mode in order, and decodes shared keys first', () => {
        const calls: string[] = [];
        registerUrlKeys('atom', () => ({ a: '1' }), () => calls.push('first'));
        registerUrlKeys('atom', () => ({ b: '2' }), () => calls.push('second'));
        registerUrlKeys(ANY_MODE, () => ({}), () => calls.push('shared'));
        expect(encodeStateOf(makeStore().getState())).toBe('mode=atom&a=1&b=2');
        applyStateTo('#mode=atom', makeStore().dispatch);
        expect(calls).toEqual(['shared', 'first', 'second']);
    });

    it('keeps ":" and "," readable and escapes what URLSearchParams would mangle', () => {
        registerUrlKeys('atom', () => ({ cut: 'x:0.5', cam: '10,-20', odd: 'a+b c&d' }), noop);
        const hash = encodeStateOf(makeStore().getState());
        expect(hash).toBe('mode=atom&cut=x:0.5&cam=10,-20&odd=a%2Bb%20c%26d');
        expect(new URLSearchParams(hash).get('odd')).toBe('a+b c&d');
    });

    it('ignores an unknown mode, and one failing decoder does not stop the rest', () => {
        const seen: string[] = [];
        registerUrlKeys('atom', () => ({}), () => { throw new Error('bad'); });
        registerUrlKeys('atom', () => ({}), p => { seen.push(p.get('Z') ?? ''); });
        const warn = jest.spyOn(console, 'warn').mockImplementation(noop);
        applyStateTo('#mode=molecule&Z=3', makeStore().dispatch);
        expect(seen).toEqual([]);
        applyStateTo('#mode=atom&Z=3', makeStore().dispatch);
        expect(seen).toEqual(['3']);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('does nothing for an empty hash', () => {
        const decoder = jest.fn();
        registerUrlKeys(ANY_MODE, () => ({}), decoder);
        applyStateTo('', makeStore().dispatch);
        applyStateTo('#', makeStore().dispatch);
        expect(decoder).not.toHaveBeenCalled();
    });

    it('recognises a shared view only for a registered mode', () => {
        registerUrlKeys('atom', () => ({}), noop);
        expect(hasSharedView('#mode=atom&Z=26')).toBe(true);
        expect(hasSharedView('#mode=molecule')).toBe(false);
        expect(hasSharedView('')).toBe(false);
    });

    it('encodeState and applyState work on the bound store, and say so when there is none', () => {
        expect(() => encodeState()).toThrow(/bindUrlStateStore/);
        const store = makeStore();
        bindUrlStateStore(store);
        registerUrlKeys(ANY_MODE, s => ({ frac: String(s.orbital.enclosedFraction) }), (p, dispatch) => {
            const f = Number(p.get('frac'));
            if (f > 0) dispatch(setEnclosedFraction(f));
        });
        applyState('#frac=0.5');
        expect(store.getState().orbital.enclosedFraction).toBe(0.5);
        expect(encodeState()).toBe('frac=0.5');
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/url_state.test.ts`
Expected: FAIL — cannot find `../src/url_state`.

- [ ] **Step 3: Implement**

`src/store/index.ts`: add `export type AppStore = typeof store;`.

`src/url_state.ts`:

```ts
import type { RootState, AppDispatch } from './store';
import type { ViewMode } from './store/atomSlice';

/**
 * The URL hash is the view (spec §4.3). This module owns reading and writing
 * it; each mode registers the keys it needs. Unknown or invalid keys are
 * ignored, never thrown on: a hand-edited link loads what it can.
 */
export type UrlEncoder = (state: RootState) => Record<string, string>;
export type UrlDecoder = (params: URLSearchParams, dispatch: AppDispatch) => void;

/** Key groups every mode gets (the view settings): decoded first, encoded last. */
export const ANY_MODE = '*';

interface KeyGroup { encoder: UrlEncoder; decoder: UrlDecoder; }
const registry = new Map<string, KeyGroup[]>();

/** The URL's name for each stored mode. The stored value names the model; the URL names what the user picked. */
const URL_MODE: Record<ViewMode, string> = { atom: 'atom', hydrogenic: 'basic' };

export function registerUrlKeys(mode: string, encoder: UrlEncoder, decoder: UrlDecoder): void {
    registry.set(mode, [...(registry.get(mode) ?? []), { encoder, decoder }]);
}

export function resetUrlKeysForTests(): void {
    registry.clear();
}

export function urlModeOf(state: RootState): string {
    return URL_MODE[state.atom.mode];
}

/** ':' and ',' stay readable; '+', spaces and '&' are escaped, since URLSearchParams reads '+' as a space. */
function encodeValue(value: string): string {
    return encodeURIComponent(value).replace(/%3A/gi, ':').replace(/%2C/gi, ',');
}

export function encodeStateOf(state: RootState): string {
    const mode = urlModeOf(state);
    const entries = new Map<string, string>();
    const modeGroups = registry.get(mode);
    if (modeGroups) {
        entries.set('mode', mode);
        for (const group of modeGroups) {
            for (const [key, value] of Object.entries(group.encoder(state))) entries.set(key, value);
        }
    }
    for (const group of registry.get(ANY_MODE) ?? []) {
        for (const [key, value] of Object.entries(group.encoder(state))) {
            if (!entries.has(key)) entries.set(key, value);
        }
    }
    return Array.from(entries, ([key, value]) => `${encodeURIComponent(key)}=${encodeValue(value)}`).join('&');
}

function paramsOf(hash: string): URLSearchParams {
    return new URLSearchParams(hash.replace(/^#/, ''));
}

function runDecoder(group: KeyGroup, params: URLSearchParams, dispatch: AppDispatch): void {
    try {
        group.decoder(params, dispatch);
    } catch (error) {
        // A link must never take the app down; the rest of it still applies.
        console.warn('url_state: skipped a key group that could not be decoded', error);
    }
}

export function applyStateTo(hash: string, dispatch: AppDispatch): void {
    const params = paramsOf(hash);
    if (Array.from(params.keys()).length === 0) return;
    for (const group of registry.get(ANY_MODE) ?? []) runDecoder(group, params, dispatch);
    const mode = params.get('mode');
    if (mode === null || mode === ANY_MODE) return;
    for (const group of registry.get(mode) ?? []) runDecoder(group, params, dispatch);
}

export function hasSharedView(hash: string): boolean {
    const mode = paramsOf(hash).get('mode');
    return mode !== null && mode !== ANY_MODE && registry.has(mode);
}

interface UrlStateStore { getState(): RootState; dispatch: AppDispatch; }
let boundStore: UrlStateStore | null = null;

/** main.tsx binds the app's store; tests bind their own, or null. */
export function bindUrlStateStore(store: UrlStateStore | null): void {
    boundStore = store;
}

function requireStore(): UrlStateStore {
    if (!boundStore) throw new Error('url_state: call bindUrlStateStore(store) before encodeState/applyState.');
    return boundStore;
}

export function encodeState(): string {
    return encodeStateOf(requireStore().getState());
}

export function applyState(hash: string): void {
    applyStateTo(hash, requireStore().dispatch);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/url_state.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/url_state.ts src/store/index.ts tests/url_state.test.ts
git commit -m "feat(url): URL state registry with encodeState, applyState and registerUrlKeys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The built-in keys, and the round-trip property test

**Files:**
- Modify: `src/url_state.ts` (append)
- Test: `tests/url_state.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1–4; `ENCLOSED_FRACTIONS`; `MIN_ATOMIC_NUMBER`, `MAX_ATOMIC_NUMBER`; `CombinationSelection`, `NO_COMBINATION` (Phase 1); `HybridKind` (`src/hybrids.ts`).
- Produces: `registerBuiltInUrlKeys()`; parsers `parseIntInRange`, `parseNumberInRange`, `parseCut`, `formatCut`, `parseCamera`, `parseAtomView`, `parseBasicSelection`, `parseCombination`, `formatCombination`. Keys — shared: `frac`, `cut` (`none` or `<axis>:<depth 0–1>`), `op`, `surf` (`solid`|`wire`), `cam` (`az,el`, omitted at canonical); atom: `Z`, `level`, `n`, `l`, `ml`; basic: `n`, `l`, `ml`, `combo` (`none`|`sp`|`sp2`|`sp3`|`field`, always written), with a hybrid `member` (0-based index or `all`), with a field `level` (`1`|`2`), `F` (a.u.) and `stark` (Phase 1's `StarkChoice`: `lower`|`upper`|`both`). These names are fixed: Phase 7's lessons already use them. Canonical order: `mode`, mode keys, `frac`, `cut`, `op`, `surf`, `cam`. Phase 4 adds `rel=off|scalar|so` in `encodeAtomKeys`/`decodeAtomKeys` after `Z`; Phase 5 registers `mode=bonds` with `system`, `R`, `state` through `registerUrlKeys('bonds', …)`.

Out-of-range values are never clamped. A well-formed `F` of any size or sign (`F=0.08`; `F=0.01` at `level=2`, above 0.0039) and a `member` past the hybrid count decode as given, so the selection lands in Phase 1's refused state: `selectionProblem` returns its message, `fieldRequestFor` returns null, and nothing is drawn (Phase 1 Review Focus 3). A key that is not well-formed (`combo=sp4`, `F=abc`, `level=3`) is ignored like any other invalid key: an unknown `combo` means no combination; a missing or malformed `F`, `level` or `stark` takes Phase 1's default (`DEFAULT_FIELD_AU`, level 1, `lower`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/url_state.test.ts` (extend imports: `registerBuiltInUrlKeys` from `../src/url_state`; `setElement, solveSucceeded, drillToShell, drillToSubshell, drillToOrbital` from the atom slice; `setBasicSelection, setSurfaceStyle, setCombination, cameraMoved, startOrbitalCalculation, selectShownBasicOrbital` from the orbital slice; `basicOrbitalParams, ENCLOSED_FRACTIONS` from `../src/orbital_presets`; `CombinationSelection, selectionProblem, fieldRequestFor` from `../src/combinations`; types `RootState` from `../src/store`, `SerialisedAtomProfile` from `../src/workers/atomWorker`):

```ts
/** Every shell up to maxN, every subshell up to f: any view is reachable. */
function profileFor(Z: number, maxN = 7): SerialisedAtomProfile {
    const shells: SerialisedAtomProfile['shells'] = [];
    const subshells: SerialisedAtomProfile['subshells'] = [];
    for (let n = 1; n <= maxN; n++) {
        shells.push({ n, electrons: 2, contourRadius: n, curve: new Float64Array(3), emphasis: new Float32Array(3) });
        for (let l = 0; l <= Math.min(3, n - 1); l++) {
            subshells.push({ n, l, electrons: 2, energy: -1 / n, curve: new Float64Array(3), R: new Float64Array(3), samplingRadius: n, compositeSamplingRadius: n });
        }
    }
    return {
        Z, converged: true, rMin: 1e-3, dx: 0.1, size: 3, total: new Float32Array(3), totalEmphasis: new Float32Array(3),
        contourRadius: maxN, valencePeakRadius: maxN, displayRadius: maxN, shellPeaks: new Float64Array([1]),
        shellIndexAtR: new Float32Array(3), shells, subshells,
    };
}

/** Applies a link to a fresh store and, in atom mode, lands the solve it asked for. */
function restore(hash: string, maxN = 7) {
    const store = makeStore();
    applyStateTo(hash, store.dispatch);
    const { atom } = store.getState();
    if (atom.mode === 'atom' && atom.pendingView) store.dispatch(solveSucceeded(profileFor(atom.Z, maxN)));
    return store;
}

function mulberry32(seed: number): () => number {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type Shape = 'atom' | 'shell' | 'subshell' | 'orbital' | 'basic' | 'hybrid' | 'field';

function randomView(rand: () => number, shape: Shape) {
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
    const store = makeStore();
    if (shape === 'basic' || shape === 'hybrid' || shape === 'field') {
        store.dispatch(setMode('hydrogenic'));
        const n = int(1, 9), l = int(0, n - 1), ml = int(-l, l);
        store.dispatch(setBasicSelection({ n, l, ml }));
        if (shape === 'basic') store.dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, 0.9)));
        const combination: CombinationSelection = shape === 'hybrid'
            ? { kind: 'hybrid', hybrid: pick(['sp', 'sp2', 'sp3'] as const), member: rand() < 0.5 ? 'all' : int(0, 1) }
            : shape === 'field'
                ? { kind: 'field', level: pick([1, 2] as const), field: int(0, 50) / 1000, stark: pick(['lower', 'upper', 'both'] as const) }
                : { kind: 'none' };
        store.dispatch(setCombination(combination));
    } else {
        const Z = int(1, 118);
        store.dispatch(setElement(Z));
        store.dispatch(solveSucceeded(profileFor(Z)));
        const n = int(1, 7), l = int(0, Math.min(3, n - 1)), ml = int(-l, l);
        if (shape === 'shell') store.dispatch(drillToShell(n));
        if (shape === 'subshell') store.dispatch(drillToSubshell(n, l));
        if (shape === 'orbital') store.dispatch(drillToOrbital(n, l, ml));
    }
    store.dispatch(setEnclosedFraction(pick(ENCLOSED_FRACTIONS)));
    store.dispatch(setSurfaceStyle({
        opacity: int(1, 20) * 0.05,
        mode: pick(['solid', 'wireframe'] as const),
        clipAxis: pick(['none', 'x', 'y', 'z'] as const),
        clipPosition: 1 - int(0, 100) / 50,
    }));
    if (rand() < 0.7) store.dispatch(cameraMoved({ azimuth: int(-179, 180), elevation: int(-89, 89) }));
    return store;
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** What a link promises to restore. */
function viewOf(state: RootState) {
    const { atom, orbital } = state;
    const style = orbital.surfaceStyle;
    return {
        mode: atom.mode,
        atom: atom.mode === 'atom'
            ? { Z: atom.Z, level: atom.level, shell: atom.selectedShell, subshell: atom.selectedSubshell, orbital: atom.selectedOrbital }
            : null,
        basic: atom.mode === 'hydrogenic' ? { orbital: selectShownBasicOrbital(state), combination: orbital.combination } : null,
        frac: orbital.enclosedFraction,
        opacity: round2(style.opacity),
        surface: style.mode,
        clipAxis: style.clipAxis,
        clipPosition: style.clipAxis === 'none' ? null : round2(style.clipPosition),
        camera: orbital.cameraAngles,
    };
}

describe('built-in URL keys', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); });

    // Spec §5 Phase 2: "URL round-trip property test over every mode and level".
    it.each<Shape>(['atom', 'shell', 'subshell', 'orbital', 'basic', 'hybrid', 'field'])(
        'round-trips random %s views',
        shape => {
            const rand = mulberry32(shape.length * 7919);
            for (let i = 0; i < 60; i++) {
                const original = randomView(rand, shape);
                const hash = encodeStateOf(original.getState());
                const restored = restore(hash);
                expect(encodeStateOf(restored.getState())).toBe(hash);
                expect(viewOf(restored.getState())).toEqual(viewOf(original.getState()));
            }
        },
    );

    it('restores the spec example: iron 3d_z², cut along x through the nucleus', () => {
        const hash = 'mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&frac=0.9&cut=x:0.5&op=1&surf=solid';
        const store = restore(hash);
        expect(store.getState().atom).toMatchObject({ Z: 26, level: 'orbital', selectedOrbital: { n: 3, l: 2, ml: 0 } });
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'x', clipPosition: 0 });
        expect(encodeStateOf(store.getState())).toBe(hash);
    });

    it('writes a combination with the keys Phase 1 expects', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.0039, stark: 'both' }));
        expect(encodeStateOf(store.getState())).toMatch(/^mode=basic&n=3&l=2&ml=0&combo=field&level=2&F=0.0039&stark=both&/);
        store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp3', member: 1 }));
        expect(encodeStateOf(store.getState())).toMatch(/^mode=basic&n=3&l=2&ml=0&combo=sp3&member=1&/);
        store.dispatch(setCombination({ kind: 'none' }));
        expect(encodeStateOf(store.getState())).toMatch(/^mode=basic&n=3&l=2&ml=0&combo=none&/);
    });

    // Phase 1 Review Focus 3: out of range is refused with a message, never clamped.
    it('decodes an out-of-range field or member into Phase 1\'s refused state', () => {
        const refused: Array<[string, CombinationSelection]> = [
            ['#mode=basic&combo=field&level=1&F=0.08', { kind: 'field', level: 1, field: 0.08, stark: 'lower' }],
            ['#mode=basic&combo=field&level=2&F=0.01&stark=upper', { kind: 'field', level: 2, field: 0.01, stark: 'upper' }],
            ['#mode=basic&combo=sp&member=5', { kind: 'hybrid', hybrid: 'sp', member: 5 }],
        ];
        for (const [hash, expected] of refused) {
            const store = makeStore();
            applyStateTo(hash, store.dispatch);
            expect(store.getState().orbital.combination).toEqual(expected);
            expect(selectionProblem(store.getState().orbital.combination)).not.toBeNull();
            expect(fieldRequestFor(store.getState().orbital.combination, 0.9)).toBeNull();
        }
    });

    // Review Focus 1.
    it('ignores what it cannot use', () => {
        const cases: Array<[string, (s: RootState) => void]> = [
            ['#mode=atom&Z=abc&level=orbital', s => expect(s.atom).toMatchObject({ mode: 'atom', Z: 1, pendingView: null })],
            ['#mode=atom&Z=26&level=orbital&n=9&l=2&ml=0', s => expect(s.atom.pendingView?.level).toBe('atom')],
            ['#mode=atom&Z=26&level=orbital&n=3&l=2&ml=5', s => expect(s.atom.pendingView).toMatchObject({ level: 'shell', subshell: { n: 3, l: 2 }, orbital: null })],
            ['#mode=basic&n=2&l=2&ml=0', s => expect(s.orbital.basicSelection).toEqual({ n: 3, l: 2, ml: 0 })],
            ['#mode=basic&combo=sp4&member=1', s => expect(s.orbital.combination).toEqual({ kind: 'none' })],
            ['#mode=basic&combo=field&level=3&F=abc&stark=sideways', s => expect(s.orbital.combination).toEqual({ kind: 'field', level: 1, field: 0.03, stark: 'lower' })],
            ['#frac=0.42&op=7&surf=glass&cut=w:0.5&cam=400,0&bogus=1', s => {
                expect(s.orbital.enclosedFraction).toBe(0.9);
                expect(s.orbital.surfaceStyle).toMatchObject({ opacity: 1, mode: 'solid', clipAxis: 'none' });
                expect(s.orbital.cameraAngles).toBeNull();
            }],
            ['#mode=molecule&id=h2o', s => expect(s.atom.mode).toBe('atom')],
            ['#op=&cut=&Z=', s => expect(s.orbital.surfaceStyle.opacity).toBe(1)],
        ];
        for (const [hash, check] of cases) {
            const store = makeStore();
            expect(() => applyStateTo(hash, store.dispatch)).not.toThrow();
            check(store.getState());
        }
    });

    // Review Focus 2.
    it('a link to an orbital the element lacks opens the whole atom', () => {
        const store = restore('#mode=atom&Z=1&level=orbital&n=3&l=2&ml=0', 1);
        expect(store.getState().atom).toMatchObject({ level: 'atom', pendingView: null });
    });

    // Review Focus 3.
    it('a link copied mid-solve carries the view that was asked for', () => {
        const store = makeStore();
        applyStateTo('#mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&cut=none', store.dispatch);
        expect(store.getState().atom.level).toBe('atom');
        expect(encodeStateOf(store.getState())).toMatch(/^mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&frac=0.9&cut=none&/);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/url_state.test.ts`
Expected: FAIL — `registerBuiltInUrlKeys` is not exported.

- [ ] **Step 3: Implement** (append to `src/url_state.ts`, imports at the top)

```ts
import { setMode, setElement, solveStarted, requestAtomView, PendingAtomView } from './store/atomSlice';
import {
    setBasicSelection, setEnclosedFraction, setCombination, requestBasicRender, requestCut, restoreCamera,
    setSurfaceStyle, selectShownBasicOrbital, BasicSelection, CutSetting,
} from './store/orbitalSlice';
import { ENCLOSED_FRACTIONS } from './orbital_presets';
import { MIN_ATOMIC_NUMBER, MAX_ATOMIC_NUMBER } from './elements';
import { CombinationSelection, NO_COMBINATION, DEFAULT_FIELD_AU } from './combinations';
import { HybridKind } from './hybrids';
import { CameraAngles } from './camera_angles';
import { ClipAxis } from './types/orbital';

export function parseIntInRange(value: string | null, min: number, max: number): number | null {
    if (value === null || !/^-?\d+$/.test(value)) return null;
    const n = Number(value);
    return n >= min && n <= max ? n : null;
}

export function parseNumberInRange(value: string | null, min: number, max: number): number | null {
    if (value === null || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100 + 0;

/** Depth as the Depth slider shows it: 0 nothing removed, 0.5 through the nucleus, 1 everything. */
export function formatCut(cut: CutSetting): string {
    return cut.clipAxis === 'none' ? 'none' : `${cut.clipAxis}:${round2((1 - cut.clipPosition) / 2)}`;
}

export function parseCut(value: string | null): CutSetting | null {
    if (value === 'none') return { clipAxis: 'none', clipPosition: 0 };
    const match = value ? /^([xyz]):(.+)$/.exec(value) : null;
    const depth = match ? parseNumberInRange(match[2], 0, 1) : null;
    if (!match || depth === null) return null;
    return { clipAxis: match[1] as ClipAxis, clipPosition: round2(1 - 2 * depth) };
}

export function parseCamera(value: string | null): CameraAngles | null {
    const match = value ? /^(-?\d+),(-?\d+)$/.exec(value) : null;
    const azimuth = match ? parseIntInRange(match[1], -179, 180) : null;
    const elevation = match ? parseIntInRange(match[2], -89, 89) : null;
    return azimuth === null || elevation === null ? null : { azimuth, elevation };
}

function encodeViewKeys(state: RootState): Record<string, string> {
    const { surfaceStyle, enclosedFraction, pendingCut, cameraAngles } = state.orbital;
    const keys: Record<string, string> = {
        frac: String(enclosedFraction),
        // A cut still waiting for its view is the one the link asked for.
        cut: formatCut(pendingCut ?? surfaceStyle),
        op: String(round2(surfaceStyle.opacity)),
        surf: surfaceStyle.mode === 'wireframe' ? 'wire' : 'solid',
    };
    if (cameraAngles) keys.cam = `${cameraAngles.azimuth},${cameraAngles.elevation}`;
    return keys;
}

function decodeViewKeys(params: URLSearchParams, dispatch: AppDispatch): void {
    const fraction = parseNumberInRange(params.get('frac'), 0, 1);
    if (fraction !== null && ENCLOSED_FRACTIONS.includes(fraction)) dispatch(setEnclosedFraction(fraction));
    const opacity = parseNumberInRange(params.get('op'), 0.05, 1);
    if (opacity !== null) dispatch(setSurfaceStyle({ opacity: round2(opacity) }));
    const surface = params.get('surf');
    if (surface === 'solid' || surface === 'wire') dispatch(setSurfaceStyle({ mode: surface === 'wire' ? 'wireframe' : 'solid' }));
    const cut = parseCut(params.get('cut'));
    if (cut) dispatch(requestCut(cut));
    // No cam key means the canonical view, so a link always sets the camera.
    dispatch(restoreCamera(parseCamera(params.get('cam'))));
}

export function parseAtomView(params: URLSearchParams): PendingAtomView {
    const whole: PendingAtomView = { level: 'atom', shell: null, subshell: null, orbital: null };
    const level = params.get('level');
    if (level !== 'shell' && level !== 'orbital') return whole;
    const n = parseIntInRange(params.get('n'), 1, 7);
    if (n === null) return whole;
    const shell: PendingAtomView = { level: 'shell', shell: n, subshell: null, orbital: null };
    const l = parseIntInRange(params.get('l'), 0, Math.min(3, n - 1));
    if (l === null) return shell;
    const subshell: PendingAtomView = { ...shell, subshell: { n, l } };
    if (level !== 'orbital') return subshell;
    const ml = parseIntInRange(params.get('ml'), -l, l);
    return ml === null ? subshell : { level: 'orbital', shell: n, subshell: { n, l }, orbital: { n, l, ml } };
}

function encodeAtomKeys(state: RootState): Record<string, string> {
    const atom = state.atom;
    // Mid-solve, the link is the view that was asked for, not the whole atom shown meanwhile.
    const view: PendingAtomView = atom.pendingView
        ?? { level: atom.level, shell: atom.selectedShell, subshell: atom.selectedSubshell, orbital: atom.selectedOrbital };
    const keys: Record<string, string> = { Z: String(atom.Z), level: view.level };
    if (view.level !== 'atom' && view.shell !== null) {
        keys.n = String(view.shell);
        if (view.subshell) keys.l = String(view.subshell.l);
        if (view.level === 'orbital' && view.orbital) keys.ml = String(view.orbital.ml);
    }
    return keys;
}

function decodeAtomKeys(params: URLSearchParams, dispatch: AppDispatch): void {
    dispatch(setMode('atom'));
    const Z = parseIntInRange(params.get('Z'), MIN_ATOMIC_NUMBER, MAX_ATOMIC_NUMBER);
    // Without an element there is no solve to land a level on.
    if (Z === null) return;
    dispatch(setElement(Z));
    dispatch(solveStarted());
    dispatch(requestAtomView(parseAtomView(params)));
}

export function parseBasicSelection(params: URLSearchParams): BasicSelection | null {
    const n = parseIntInRange(params.get('n'), 1, 9);
    const l = n === null ? null : parseIntInRange(params.get('l'), 0, n - 1);
    const ml = l === null ? null : parseIntInRange(params.get('ml'), -l, l);
    return n === null || l === null || ml === null ? null : { n, l, ml };
}

/**
 * Phase 1's combination, with the key names Phase 7's lessons use. Values
 * are never clamped: an out-of-range F or member decodes as given, so the
 * selection lands in Phase 1's refused state (selectionProblem says why and
 * nothing is drawn) instead of silently showing a different field.
 */
export function parseCombination(params: URLSearchParams): CombinationSelection {
    const combo = params.get('combo');
    if (combo === 'sp' || combo === 'sp2' || combo === 'sp3') {
        const member = params.get('member');
        const index = parseIntInRange(member, 0, Number.MAX_SAFE_INTEGER);
        return { kind: 'hybrid', hybrid: combo as HybridKind, member: index ?? 'all' };
    }
    if (combo === 'field') {
        const level = params.get('level') === '2' ? 2 : 1;
        const strength = parseNumberInRange(params.get('F'), -Number.MAX_VALUE, Number.MAX_VALUE);
        const stark = params.get('stark');
        return {
            kind: 'field', level, field: strength ?? DEFAULT_FIELD_AU,
            stark: stark === 'upper' || stark === 'both' ? stark : 'lower',
        };
    }
    return NO_COMBINATION;
}

export function formatCombination(selection: CombinationSelection): Record<string, string> {
    if (selection.kind === 'hybrid') {
        return { combo: selection.hybrid, member: String(selection.member) };
    }
    if (selection.kind === 'field') {
        return {
            combo: 'field', level: String(selection.level),
            F: String(Number(selection.field.toPrecision(6))), stark: selection.stark,
        };
    }
    return { combo: 'none' };
}

function encodeBasicKeys(state: RootState): Record<string, string> {
    const shown = selectShownBasicOrbital(state);
    return { n: String(shown.n), l: String(shown.l), ml: String(shown.ml), ...formatCombination(state.orbital.combination) };
}

function decodeBasicKeys(params: URLSearchParams, dispatch: AppDispatch): void {
    dispatch(setMode('hydrogenic'));
    const selection = parseBasicSelection(params);
    if (selection) dispatch(setBasicSelection(selection));
    dispatch(setCombination(parseCombination(params)));
    // App draws once every decoder has dispatched (see basicRenderNonce).
    dispatch(requestBasicRender());
}

/** Registers the keys this app has today. main.tsx calls it once, before applyState. */
export function registerBuiltInUrlKeys(): void {
    registerUrlKeys(ANY_MODE, encodeViewKeys, decodeViewKeys);
    registerUrlKeys('atom', encodeAtomKeys, decodeAtomKeys);
    registerUrlKeys('basic', encodeBasicKeys, decodeBasicKeys);
}
```

(`ENCLOSED_FRACTIONS` is `number[]`; if TypeScript types it `readonly`, `.includes` still works.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/url_state.test.ts && npx tsc --noEmit -p .`
Expected: PASS. If a random case fails, the failing hash is in the message: fix the encoder or decoder, never the property.

- [ ] **Step 5: Commit**

```bash
git add src/url_state.ts tests/url_state.test.ts
git commit -m "feat(url): atom, Basic Orbitals and view keys, with a round-trip property test

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Restore on load, and keep the hash in step

**Files:**
- Create: `src/useUrlStateSync.ts`
- Modify: `src/main.tsx`, `src/App.tsx`, `src/store/hooks.ts`
- Test: `tests/use_url_state_sync.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `encodeStateOf`, `applyStateTo`, `bindUrlStateStore`, `applyState`, `registerBuiltInUrlKeys`, `hasSharedView` (Tasks 4–5); `clearPendingCut` (Task 3).
- Produces: `useAppStore(): AppStore` (`src/store/hooks.ts`); `useUrlStateSync(target?: Window, delayMs?: number): void` — writes the canonical hash with `history.replaceState` (never a new history entry), ≤ `delayMs` after any store change, and applies a hash the user types (`hashchange`).

- [ ] **Step 1: Write the failing tests**

`tests/use_url_state_sync.test.tsx`:

```tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer, { setEnclosedFraction } from '../src/store/orbitalSlice';
import atomReducer from '../src/store/atomSlice';
import { resetUrlKeysForTests, registerBuiltInUrlKeys } from '../src/url_state';
import { useUrlStateSync } from '../src/useUrlStateSync';

const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });
const mount = (store: ReturnType<typeof makeStore>) => renderHook(() => useUrlStateSync(window, 50), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
});

describe('useUrlStateSync', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); window.history.replaceState(null, '', '/'); });
    afterEach(() => { jest.useRealTimers(); resetUrlKeysForTests(); window.history.replaceState(null, '', '/'); });

    it('writes the view into the hash on mount, without a history entry', () => {
        const before = window.history.length;
        mount(makeStore());
        expect(window.location.hash).toBe('#mode=atom&Z=1&level=atom&frac=0.9&cut=none&op=1&surf=solid');
        expect(window.history.length).toBe(before);
    });

    it('follows later changes after a short delay, still without history entries', () => {
        jest.useFakeTimers();
        const store = makeStore();
        const before = window.history.length;
        mount(store);
        act(() => { store.dispatch(setEnclosedFraction(0.5)); });
        expect(window.location.hash).toContain('frac=0.9');
        act(() => { jest.advanceTimersByTime(60); });
        expect(window.location.hash).toContain('frac=0.5');
        expect(window.history.length).toBe(before);
    });

    it('applies a hash typed into the address bar', async () => {
        const store = makeStore();
        mount(store);
        act(() => { window.location.hash = '#mode=basic&n=2&l=1&ml=0'; });
        await waitFor(() => expect(store.getState().atom.mode).toBe('hydrogenic'));
        expect(store.getState().orbital.basicSelection).toEqual({ n: 2, l: 1, ml: 0 });
    });
});
```

Append to `src/App.test.tsx` (imports: `resetUrlKeysForTests, registerBuiltInUrlKeys, applyStateTo` from `./url_state`; `solveSucceeded` from `./store/atomSlice`):

```tsx
describe('App: opening a shared link', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); clearProfileCacheForTests(); });
    // The hook writes the hash, and jsdom keeps it between tests: clean up so
    // later tests still open with the periodic table.
    afterEach(() => { resetUrlKeysForTests(); window.history.replaceState(null, '', '/'); });

    const openLink = (hash: string) => {
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        render(<Provider store={store}><App /></Provider>);
        act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });
        return store;
    };

    it('lands on the linked orbital with no cut, once the solve arrives', () => {
        const store = openLink('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&frac=0.9&cut=none&op=1&surf=solid');
        expect(store.getState().atom).toMatchObject({ level: 'orbital', selectedOrbital: { n: 2, l: 1, ml: 0 } });
        expect(store.getState().orbital.surfaceStyle.clipAxis).toBe('none');
        expect(store.getState().orbital.pendingCut).toBeNull();
    });

    it('keeps a linked cut at the orbital level, where entering it would clear the cut', () => {
        const store = openLink('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&cut=y:0.25');
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'y', clipPosition: 0.5 });
    });

    it('opens without the periodic table over a shared view', () => {
        openLink('#mode=atom&Z=18&level=atom');
        expect(screen.queryByLabelText('periodic table')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/use_url_state_sync.test.tsx src/App.test.tsx -t "useUrlStateSync|shared link"`
Expected: FAIL — cannot find `../src/useUrlStateSync`; the App cases fail on the cut and the periodic table.

- [ ] **Step 3: Implement**

`src/store/hooks.ts`:

```ts
import { TypedUseSelectorHook, useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState, AppDispatch, AppStore } from './index';
// …existing two hooks unchanged…
export const useAppStore: () => AppStore = useStore as () => AppStore;
```

`src/useUrlStateSync.ts`:

```ts
import { useEffect } from 'react';
import { useAppStore } from './store/hooks';
import { applyStateTo, encodeStateOf } from './url_state';

/**
 * The address bar always holds the current view, so it is itself the share
 * link. replaceState, never pushState: every slider drag would otherwise be
 * a Back-button step. Changes are batched for `delayMs`; pointer hover alone
 * dispatches on every move and must not rewrite the URL each time.
 */
export function useUrlStateSync(target: Window = window, delayMs = 250): void {
    const store = useAppStore();
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const write = () => {
            timer = null;
            const next = encodeStateOf(store.getState());
            if (target.location.hash.replace(/^#/, '') !== next) {
                target.history.replaceState(target.history.state, '', `#${next}`);
            }
        };
        const unsubscribe = store.subscribe(() => {
            if (timer === null) timer = setTimeout(write, delayMs);
        });
        // replaceState does not fire hashchange, so this is only ever a hash
        // the user typed or a link followed within the page.
        const onHashChange = () => applyStateTo(target.location.hash, store.dispatch);
        target.addEventListener('hashchange', onHashChange);
        write();
        return () => {
            unsubscribe();
            target.removeEventListener('hashchange', onHashChange);
            if (timer !== null) clearTimeout(timer);
        };
    }, [store, target, delayMs]);
}
```

`src/main.tsx`, before `ReactDOM.createRoot`:

```ts
import { applyState, bindUrlStateStore, registerBuiltInUrlKeys } from './url_state';

// Restore a shared view before the first render, so the app never draws a
// default view on its way to the linked one.
bindUrlStateStore(store);
registerBuiltInUrlKeys();
applyState(window.location.hash);
```

`src/App.tsx`:

1. After `useAtomSolver(enclosedFraction);` add `useUrlStateSync();`.
2. `const [tableOpen, setTableOpen] = useState(() => !hasSharedView(window.location.hash));` — a shared link opens on its view, not under the periodic table.
3. In `handleAtomElementChange`, add `dispatch(clearPendingCut());` after `dispatch(setSurfaceStyle(...))`: picking an element cancels a link's cut.
4. Directly after the effect that clears the cut on entering an orbital view (the one keyed on `[isOrbitalView, dispatch]`), add:

```ts
    // A shared link's cut, re-applied once the linked view is on screen. It
    // has to come after the effect above: entering the linked orbital clears
    // the cut, and in the same commit this puts the link's back.
    const pendingCut = useAppSelector(state => state.orbital.pendingCut);
    const atomPendingView = useAppSelector(state => state.atom.pendingView);
    useEffect(() => {
        if (!pendingCut || atomPendingView) return;
        dispatch(setSurfaceStyle(pendingCut));
        dispatch(clearPendingCut());
    }, [pendingCut, atomPendingView, isOrbitalView, dispatch]);
```

Imports: `useUrlStateSync`, `hasSharedView` from `./url_state`, `clearPendingCut`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/use_url_state_sync.test.tsx src/App.test.tsx tests/url_state.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Live verification, desktop 1440x900**

1. Open `http://localhost:5391/#mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&frac=0.9&cut=x:0.5&op=0.8&surf=solid&cam=120,20`. Expect: no periodic table; "Solving Iron…" then iron's 3d_z² in the orbital view, cut along X at 50 %, opacity 80 % (right panel reads *Opacity: 80%*, *Cut away X*, *Depth: 50% — through the nucleus*), seen from a different side than the default. Left panel: Iron › M shell › 3d › 3d_z².
2. Drag the opacity slider to 60 %. Within half a second the address bar ends `…&op=0.6&surf=solid&cam=120,20`.
3. Press the browser's Back button once: it leaves the app (or returns to the previous page), not to 80 % opacity.
4. Edit the address bar to `…level=orbital&n=4&l=0&ml=0…` and press Enter: the view switches to 4s without a reload.
5. Reload: the same view comes back.
6. Open `http://localhost:5391/#mode=basic&n=4&l=3&ml=0&combo=sp3&member=all&frac=0.9&cut=none&op=1&surf=solid`: Basic Orbitals with the sp³ overlay; *Combination* reads sp³.
7. Open `http://localhost:5391/#mode=basic&combo=field&level=1&F=0.08`, then `…&combo=field&level=2&F=0.01&stark=lower`: each shows Phase 1's refusal message with the value as given (the slider is not silently moved to the limit), and nothing is drawn as if the field were allowed.
8. Open `http://localhost:5391/#mode=atom&Z=abc&level=nonsense`: the app loads normally on hydrogen. Console: no errors.

- [ ] **Step 6: Live verification, phone 390x844 with touch**

Open the URL from step 1. The phone header's breadcrumb shows Iron › … › 3d_z²; *View* tab shows Cut away X, Depth 50 %, Opacity 80 %. The orbital is centred in the free canvas. Rotate to 844x390: same view.

- [ ] **Step 7: Commit**

```bash
git add src/useUrlStateSync.ts src/main.tsx src/App.tsx src/store/hooks.ts tests/use_url_state_sync.test.tsx src/App.test.tsx
git commit -m "feat(url): restore a shared view on load and keep the hash in step

replaceState only, so view changes never flood the Back button.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Share

**Files:**
- Create: `src/share.ts`, `src/components/ShareExportBar.tsx`
- Modify: `src/components/Controls.tsx` (an `actions` slot), `src/App.tsx`
- Test: `tests/share.test.ts`, `tests/share_export_bar.test.tsx`

**Interfaces:**
- Produces: `shareUrlFor(hash, location?)`; `interface ClipboardEnv { clipboard?: { writeText(text: string): Promise<void> }; execCopy?: (text: string) => boolean }`; `copyText(text, env?): Promise<boolean>`; `execCommandCopy(text): boolean`; `type ShareOutcome = { kind: 'copied' } | { kind: 'manual'; url: string }`; `ShareExportBar` with prop `onShare: () => Promise<ShareOutcome>`; `Controls` prop `actions?: React.ReactNode`, rendered under Reset View.

- [ ] **Step 1: Write the failing tests**

`tests/share.test.ts`:

```ts
import { copyText, shareUrlFor } from '../src/share';

describe('share', () => {
    it('builds the link from this page, keeping its query', () => {
        expect(shareUrlFor('mode=atom&Z=26', { origin: 'https://x.org', pathname: '/app/', search: '?embed=1' }))
            .toBe('https://x.org/app/?embed=1#mode=atom&Z=26');
    });

    it('uses the clipboard API when it works', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        const execCopy = jest.fn();
        expect(await copyText('u', { clipboard: { writeText }, execCopy })).toBe(true);
        expect(writeText).toHaveBeenCalledWith('u');
        expect(execCopy).not.toHaveBeenCalled();
    });

    it('falls back to execCommand when the clipboard API refuses', async () => {
        const execCopy = jest.fn().mockReturnValue(true);
        expect(await copyText('u', { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, execCopy })).toBe(true);
        expect(execCopy).toHaveBeenCalledWith('u');
    });

    it('reports failure when neither works (insecure page, no clipboard)', async () => {
        expect(await copyText('u', { execCopy: () => false })).toBe(false);
    });
});
```

`tests/share_export_bar.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShareExportBar from '../src/components/ShareExportBar';

describe('ShareExportBar: Share', () => {
    it('says the link was copied', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'copied' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
    });

    // Review Focus 5.
    it('shows the link to copy by hand when the clipboard is refused', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'manual', url: 'http://x/#mode=atom&Z=26' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(await screen.findByRole('textbox', { name: /link to this view/i })).toHaveValue('http://x/#mode=atom&Z=26');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/share.test.ts tests/share_export_bar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/share.ts`:

```ts
export function shareUrlFor(
    hash: string,
    location: Pick<Location, 'origin' | 'pathname' | 'search'> = window.location,
): string {
    return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

export interface ClipboardEnv {
    clipboard?: { writeText(text: string): Promise<void> };
    execCopy?: (text: string) => boolean;
}

/** The pre-Clipboard-API copy, which still works on plain http where navigator.clipboard is absent. */
export function execCommandCopy(text: string): boolean {
    if (typeof document.execCommand !== 'function') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        area.remove();
    }
}

/** True if the text reached the clipboard. False means: show it for copying by hand. */
export async function copyText(
    text: string,
    env: ClipboardEnv = { clipboard: navigator.clipboard, execCopy: execCommandCopy },
): Promise<boolean> {
    if (env.clipboard) {
        try {
            await env.clipboard.writeText(text);
            return true;
        } catch {
            // Refused (permissions, an iframe, no user gesture): try the old way.
        }
    }
    return env.execCopy ? env.execCopy(text) : false;
}
```

`src/components/ShareExportBar.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, TextField } from '@mui/material';

export type ShareOutcome = { kind: 'copied' } | { kind: 'manual'; url: string };

interface ShareExportBarProps {
    onShare: () => Promise<ShareOutcome>;
}

/**
 * Share (and, from the next task, Export) under Reset View. It lives inside
 * Controls, so it is in the right-hand panel on a desktop and in the View
 * tab on a phone: no new panel over the canvas (spec §3.8).
 */
const ShareExportBar: React.FC<ShareExportBarProps> = ({ onShare }) => {
    const [notice, setNotice] = useState<string | null>(null);
    const [manualUrl, setManualUrl] = useState<string | null>(null);

    const handleShare = async () => {
        const outcome = await onShare();
        if (outcome.kind === 'copied') setNotice('Link copied — it opens this exact view.');
        else setManualUrl(outcome.url);
    };

    return (
        <Box className="share-export-bar" sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
            <Button id="share-view" variant="outlined" onClick={handleShare}>Share</Button>
            <Dialog open={manualUrl !== null} onClose={() => setManualUrl(null)} fullWidth>
                <DialogTitle>Copy this link</DialogTitle>
                <DialogContent>
                    <TextField
                        value={manualUrl ?? ''}
                        fullWidth
                        multiline
                        autoFocus
                        onFocus={event => event.target.select()}
                        slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'link to this view' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setManualUrl(null)}>Done</Button>
                </DialogActions>
            </Dialog>
            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                message={notice}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
        </Box>
    );
};

export default ShareExportBar;
```

`src/components/Controls.tsx`: add to `ControlsProps`

```ts
  /** Share and Export (ShareExportBar), under Reset View. */
  actions?: React.ReactNode;
```

destructure `actions`, and render `{actions}` immediately after the `.controls-actions` `<Box>` and before the progress bar.

`src/App.tsx`:

```ts
    const store = useAppStore();
    const handleShare = useCallback(async (): Promise<ShareOutcome> => {
        const url = shareUrlFor(encodeStateOf(store.getState()));
        return (await copyText(url)) ? { kind: 'copied' } : { kind: 'manual', url };
    }, [store]);
    // Memoised: Controls is React.memo, and a fresh element every render would defeat it.
    const shareExportBar = useMemo(() => <ShareExportBar onShare={handleShare} />, [handleShare]);
```

and pass `actions={shareExportBar}` to `<Controls>`. Imports: `useAppStore`, `ShareExportBar, { ShareOutcome }`, `shareUrlFor, copyText`, `encodeStateOf`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/share.test.ts tests/share_export_bar.test.tsx src/components/Controls.test.tsx src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Live verification**

Desktop 1440x900: *Share* sits under *Reset View* in the right panel, inside the card, no overflow. Pick Neon, open the 2p shell, set opacity 70 %, rotate. Click Share: "Link copied — it opens this exact view." at the bottom. Paste into a new tab: the same shell, opacity and orientation. Fallback: in the console run `Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); document.execCommand = () => false;` then Share: the "Copy this link" dialog shows the URL, selected on focus.

Phone 390x844 with touch: *View* tab → Share below Reset View, reachable without horizontal scroll; the notice appears above the tab bar and does not hide the tabs for longer than it lasts.

- [ ] **Step 6: Commit**

```bash
git add src/share.ts src/components/ShareExportBar.tsx src/components/Controls.tsx src/App.tsx tests/share.test.ts tests/share_export_bar.test.tsx
git commit -m "feat(share): Share copies a link to the exact view, with a copy-by-hand fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The Export menu, and CSV of the radial curves

**Files:**
- Create: `src/export/caption.ts`, `src/export/csv.ts`, `src/export/download.ts`, `src/export/run_export.ts`, `tests/export/fixtures.ts`
- Modify: `src/components/ShareExportBar.tsx`, `src/App.tsx`
- Test: `tests/export/caption.test.ts`, `tests/export/csv.test.ts`, `tests/export/run_export.test.ts`, `tests/share_export_bar.test.tsx`

**Interfaces:**
- Consumes: `selectShownBasicOrbital` (Task 1); `combinationTitle`, `combinationCurves` (Phase 1); `radialProfile`.
- Produces:
  - caption: `ATOM_METHOD`, `BASIC_METHOD`, `methodStatement(state)`, `viewDescription(state)`, `exportFileStem(state)`.
  - csv: `interface CsvCurve { label: string; points: Array<{ r: number; value: number }> }`, `radialCurvesToCsv(curves, commentLines): string`.
  - download: `downloadBlob(blob, filename, doc?)`.
  - run_export: `type ExportKind = 'csv'` (later tasks widen it), `interface ExportItem { kind; label; detail }`, `EXPORT_ITEMS`, `interface ExportOptions { longestSideMm?: number }`, `interface ExportContext extends ExportOptions { state: RootState; shareUrl: string; csvCurves: CsvCurve[] }` (later tasks add optional fields), `interface ExportResult { blob: Blob; filename: string }`, `type ExportAvailability = Record<ExportKind, string | null>` (null = available, else the reason shown), `exportAvailability(state)`, `runExport(kind, context): Promise<ExportResult>`.
  - `ShareExportBar` gains optional `onExport?: (kind: ExportKind, options: ExportOptions) => Promise<void>` and `availability?: ExportAvailability`; the menu shows only when `onExport` is given.

- [ ] **Step 1: Write the failing tests**

`tests/export/fixtures.ts`:

```ts
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from '../../src/store/orbitalSlice';
import atomReducer, { setElement, solveSucceeded } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';

export const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });

/** Neon-shaped: shells 1 and 2; 1s, 2s, 2p; hydrogen-like D(r) on an odd log grid. */
export function neonProfile(): SerialisedAtomProfile {
    const size = 401, rMin = 1e-4, dx = Math.log(30 / rMin) / (size - 1);
    const D = new Float64Array(size);
    for (let j = 0; j < size; j++) { const r = rMin * Math.exp(j * dx); D[j] = 4 * r * r * Math.exp(-2 * r); }
    const shell = (n: number) => ({ n, electrons: n === 1 ? 2 : 8, contourRadius: n, curve: D, emphasis: new Float32Array(size) });
    const sub = (n: number, l: number) => ({ n, l, electrons: 2, energy: -1, curve: D, R: new Float64Array(size), samplingRadius: 3, compositeSamplingRadius: 3 });
    return {
        Z: 10, converged: true, rMin, dx, size, total: Float32Array.from(D), totalEmphasis: new Float32Array(size),
        contourRadius: 2, valencePeakRadius: 1, displayRadius: 2, shellPeaks: new Float64Array([1]),
        shellIndexAtR: new Float32Array(size), shells: [shell(1), shell(2)], subshells: [sub(1, 0), sub(2, 0), sub(2, 1)],
    };
}

export function neonStore() {
    const store = makeStore();
    store.dispatch(setElement(10));
    store.dispatch(solveSucceeded(neonProfile()));
    return store;
}

export function readBlob(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

export async function readText(blob: Blob): Promise<string> {
    return Array.from(new Uint8Array(await readBlob(blob)), c => String.fromCharCode(c)).join('');
}
```

`tests/export/caption.test.ts`:

```ts
import { drillToShell, drillToSubshell, drillToOrbital, setMode } from '../../src/store/atomSlice';
import { setCombination } from '../../src/store/orbitalSlice';
import { viewDescription, exportFileStem, methodStatement, ATOM_METHOD, BASIC_METHOD } from '../../src/export/caption';
import { makeStore, neonStore } from './fixtures';

describe('export captions', () => {
    it('names each atom level, with the method', () => {
        const store = neonStore();
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_atom');
        expect(methodStatement(store.getState())).toBe(ATOM_METHOD);
        store.dispatch(drillToShell(2));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), n = 2 shell, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_shell_n2');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), 2p subshell, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_subshell_n2_l1');
        store.dispatch(drillToOrbital(2, 1, 1));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), 2p_x, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_n2_l1_ml1');
    });

    it('names Basic Orbitals and its combinations, saying when a model is qualitative', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_H_basic_n3_l2_ml0');
        expect(methodStatement(store.getState())).toBe(BASIC_METHOD);
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        expect(methodStatement(store.getState())).toMatch(/first-order perturbation theory/);
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_H_field1');
    });
});
```

`tests/export/csv.test.ts`:

```ts
import { radialCurvesToCsv } from '../../src/export/csv';

describe('radialCurvesToCsv', () => {
    it('writes comments, a header naming each curve, and one row per radius', () => {
        const csv = radialCurvesToCsv([
            { label: '2s', points: [{ r: 0.5, value: 0.25 }, { r: 1, value: 0.125 }] },
            { label: 'n=2, valence', points: [{ r: 0.5, value: 1e-9 }, { r: 1, value: 3 }] },
        ], ['Neon', 'method: x']);
        expect(csv.split('\n')).toEqual(['# Neon', '# method: x', 'r_bohr,2s,"n=2, valence"', '0.5,0.25,1e-9', '1,0.125,3', '']);
    });

    it('refuses curves sampled at different radii, and no curves at all', () => {
        expect(() => radialCurvesToCsv([
            { label: 'a', points: [{ r: 1, value: 0 }] }, { label: 'b', points: [{ r: 2, value: 0 }] },
        ], [])).toThrow(/same radii/);
        expect(() => radialCurvesToCsv([], [])).toThrow(/No curves/);
    });
});
```

`tests/export/run_export.test.ts`:

```ts
import { runExport, exportAvailability, ExportContext } from '../../src/export/run_export';
import { RootState } from '../../src/store';
import { makeStore, neonStore, readText } from './fixtures';

export const baseContext = (state: RootState): ExportContext => ({ state, shareUrl: 'http://x/#mode=atom&Z=10', csvCurves: [] });

describe('runExport: CSV', () => {
    it('writes the plotted curves with what they are and how they were computed', async () => {
        const context = { ...baseContext(neonStore().getState()), csvCurves: [{ label: 'n=1', points: [{ r: 0.1, value: 1 }, { r: 0.2, value: 2 }] }] };
        const result = await runExport('csv', context);
        expect(result.filename).toBe('orbital-viewer_Ne_atom.csv');
        const text = await readText(result.blob);
        expect(text).toContain('# Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(text).toContain('# quantity: D(r) = 4*pi*r^2*rho(r)');
        expect(text).toContain('# method: central-field SCF');
        expect(text).toContain('# view: http://x/#mode=atom&Z=10');
        expect(text).toContain('r_bohr,n=1\n0.1,1\n0.2,2\n');
    });

    it('refuses, with the reason, before the atom is solved', async () => {
        const state = makeStore().getState();
        expect(exportAvailability(state).csv).toBe('Waiting for the atom to finish solving.');
        await expect(runExport('csv', baseContext(state))).rejects.toThrow('Waiting for the atom to finish solving.');
    });
});
```

Append to `tests/share_export_bar.test.tsx` (imports: `waitFor` from testing-library; `EXPORT_ITEMS, ExportAvailability` from `../src/export/run_export`):

```tsx
const allAvailable = (): ExportAvailability =>
    Object.fromEntries(EXPORT_ITEMS.map(item => [item.kind, null])) as ExportAvailability;
const share = async () => ({ kind: 'copied' as const });

describe('ShareExportBar: Export', () => {
    it('lists every export, with the reason when one is unavailable', () => {
        const availability = { ...allAvailable(), csv: 'Waiting for the atom to finish solving.' };
        render(<ShareExportBar onShare={share} onExport={jest.fn()} availability={availability} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        const item = screen.getByRole('menuitem', { name: /radial curves/i });
        expect(item).toHaveAttribute('aria-disabled', 'true');
        expect(item).toHaveTextContent('Waiting for the atom to finish solving.');
    });

    it('runs the chosen export and shows why one failed', async () => {
        const onExport = jest.fn().mockRejectedValue(new Error('Nothing is drawn yet.'));
        render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /radial curves/i }));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('csv', {}));
        expect(await screen.findByText('Nothing is drawn yet.')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/export tests/share_export_bar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/export/caption.ts`:

```ts
import type { RootState } from '../store';
import { elementFor } from '../elements';
import { orbitalName } from '../orbital_names';
import { subshellLabel } from '../atom/configurations';
import { selectShownBasicOrbital } from '../store/orbitalSlice';
import { combinationTitle } from '../combinations';

/** Spec §3.1: every exported number says how it was computed. */
export const ATOM_METHOD = 'central-field SCF, LDA exchange + VWN5 correlation, non-relativistic, spherically averaged';
export const BASIC_METHOD = 'exact one-electron (hydrogenic) solution, Z = 1';

export function methodStatement(state: RootState): string {
    if (state.atom.mode === 'atom') return ATOM_METHOD;
    const combination = state.orbital.combination;
    if (combination.kind === 'hybrid') {
        return `${BASIC_METHOD}; hybrids are linear combinations of these, a basis choice rather than a state of the free atom (qualitative)`;
    }
    if (combination.kind === 'field') {
        return combination.level === 1
            ? 'hydrogen 1s polarised by first-order perturbation theory (Dalgarno-Lewis); valid for F << 1 a.u., tunnelling ignored'
            : 'hydrogen n = 2 Stark states (2s +/- 2p_z)/sqrt 2, first-order degenerate perturbation theory; valid for F << 1 a.u.';
    }
    return BASIC_METHOD;
}

export function viewDescription(state: RootState): string {
    const percent = `${Math.round(state.orbital.enclosedFraction * 100)}% contour`;
    if (state.atom.mode !== 'atom') {
        const combination = state.orbital.combination;
        if (combination.kind !== 'none') return `Hydrogen, ${combinationTitle(combination)}, ${percent}`;
        const o = selectShownBasicOrbital(state);
        return `Hydrogen ${orbitalName(o.n, o.l, o.ml)}, ${percent}`;
    }
    const { Z, level, selectedShell, selectedSubshell, selectedOrbital } = state.atom;
    const element = elementFor(Z);
    const name = element ? `${element.name} (${element.symbol}, Z = ${Z})` : `Z = ${Z}`;
    if (level === 'orbital' && selectedOrbital) {
        return `${name}, ${orbitalName(selectedOrbital.n, selectedOrbital.l, selectedOrbital.ml)}, ${percent}`;
    }
    if (level === 'shell' && selectedSubshell) return `${name}, ${subshellLabel(selectedSubshell.n, selectedSubshell.l)} subshell, ${percent}`;
    if (level === 'shell' && selectedShell !== null) return `${name}, n = ${selectedShell} shell, ${percent}`;
    return `${name}, whole atom, ${percent}`;
}

/** ASCII only: file names travel through systems that mangle "²". */
export function exportFileStem(state: RootState): string {
    if (state.atom.mode !== 'atom') {
        const combination = state.orbital.combination;
        if (combination.kind === 'hybrid') {
            return `orbital-viewer_H_${combination.hybrid}${combination.member === 'all' ? '' : `_h${combination.member + 1}`}`;
        }
        if (combination.kind === 'field') return `orbital-viewer_H_field${combination.level}`;
        const o = selectShownBasicOrbital(state);
        return `orbital-viewer_H_basic_n${o.n}_l${o.l}_ml${o.ml}`;
    }
    const { Z, level, selectedShell, selectedSubshell, selectedOrbital } = state.atom;
    const symbol = elementFor(Z)?.symbol ?? `Z${Z}`;
    if (level === 'orbital' && selectedOrbital) {
        return `orbital-viewer_${symbol}_n${selectedOrbital.n}_l${selectedOrbital.l}_ml${selectedOrbital.ml}`;
    }
    if (level === 'shell' && selectedSubshell) return `orbital-viewer_${symbol}_subshell_n${selectedSubshell.n}_l${selectedSubshell.l}`;
    if (level === 'shell' && selectedShell !== null) return `orbital-viewer_${symbol}_shell_n${selectedShell}`;
    return `orbital-viewer_${symbol}_atom`;
}
```

`src/export/csv.ts`:

```ts
export interface CsvCurve {
    label: string;
    points: Array<{ r: number; value: number }>;
}

const formatNumber = (value: number) => (Number.isFinite(value) ? String(Number(value.toPrecision(8))) : '');
const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/**
 * One column per curve against a shared r column. Every curve the app plots
 * shares its radii (the atom's log grid, or one uniform sweep), so a
 * mismatch is a caller bug, not something to paper over by interpolating.
 */
export function radialCurvesToCsv(curves: CsvCurve[], commentLines: string[]): string {
    if (curves.length === 0) throw new Error('No curves to export.');
    const radii = curves[0].points.map(p => p.r);
    for (const curve of curves) {
        if (curve.points.length !== radii.length || curve.points.some((p, i) => p.r !== radii[i])) {
            throw new Error('Curves must be sampled at the same radii.');
        }
    }
    const lines = commentLines.map(line => `# ${line}`);
    lines.push(['r_bohr', ...curves.map(c => quote(c.label))].join(','));
    radii.forEach((r, i) => lines.push([formatNumber(r), ...curves.map(c => formatNumber(c.points[i].value))].join(',')));
    return `${lines.join('\n')}\n`;
}
```

`src/export/download.ts`:

```ts
export function downloadBlob(blob: Blob, filename: string, doc: Document = document): void {
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    doc.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked later, not at once: some browsers start the download after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

`src/export/run_export.ts`:

```ts
import type { RootState } from '../store';
import { CsvCurve, radialCurvesToCsv } from './csv';
import { exportFileStem, methodStatement, viewDescription } from './caption';

export type ExportKind = 'csv';

export interface ExportItem { kind: ExportKind; label: string; detail: string; }

/** Menu order. Each later format adds its entry here. */
export const EXPORT_ITEMS: ExportItem[] = [
    { kind: 'csv', label: 'Radial curves (CSV)', detail: 'the plotted curves, every sample' },
];

export interface ExportOptions { longestSideMm?: number; }

export interface ExportContext extends ExportOptions {
    state: RootState;
    /** Written into files, so a file says which view it came from. */
    shareUrl: string;
    csvCurves: CsvCurve[];
}

export interface ExportResult { blob: Blob; filename: string; }

/** null: available. Otherwise the reason, shown in the menu (spec §3.5). */
export type ExportAvailability = Record<ExportKind, string | null>;

function drawnReason(state: RootState): string | null {
    if (state.atom.mode === 'atom') return state.atom.profile ? null : 'Waiting for the atom to finish solving.';
    return state.orbital.currentParams || state.orbital.currentField ? null : 'Nothing is drawn yet.';
}

export function exportAvailability(state: RootState): ExportAvailability {
    return { csv: drawnReason(state) };
}

function csvFor({ state, shareUrl, csvCurves }: ExportContext): string {
    const quantity = state.atom.mode === 'atom'
        ? 'D(r) = 4*pi*r^2*rho(r), electrons per bohr (the radial distribution, not the density)'
        : 'P(r) = r^2*R(r)^2, probability per bohr';
    return radialCurvesToCsv(csvCurves, [
        viewDescription(state), `quantity: ${quantity}`, `method: ${methodStatement(state)}`, 'r in bohr (a0)', `view: ${shareUrl}`,
    ]);
}

export async function runExport(kind: ExportKind, context: ExportContext): Promise<ExportResult> {
    const reason = exportAvailability(context.state)[kind];
    if (reason) throw new Error(reason);
    const stem = exportFileStem(context.state);
    switch (kind) {
        case 'csv':
            return { blob: new Blob([csvFor(context)], { type: 'text/csv' }), filename: `${stem}.csv` };
    }
}
```

`src/components/ShareExportBar.tsx` — extend the props and add the menu after the Share button:

```tsx
import { ListItemText, Menu, MenuItem } from '@mui/material';
import { EXPORT_ITEMS, ExportAvailability, ExportKind, ExportOptions } from '../export/run_export';

interface ShareExportBarProps {
    onShare: () => Promise<ShareOutcome>;
    onExport?: (kind: ExportKind, options: ExportOptions) => Promise<void>;
    availability?: ExportAvailability;
}

// inside the component:
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const runKind = async (kind: ExportKind, options: ExportOptions = {}) => {
        if (!onExport) return;
        setMenuAnchor(null);
        setNotice('Preparing export…');
        try {
            await onExport(kind, options);
            setNotice(null);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'The export failed.');
        }
    };
    const handleItem = (kind: ExportKind) => { void runKind(kind); };

// JSX, after the Share button:
            {onExport && (
                <>
                    <Button
                        id="export-view"
                        variant="outlined"
                        aria-haspopup="menu"
                        aria-controls={menuAnchor ? 'export-menu' : undefined}
                        onClick={event => setMenuAnchor(event.currentTarget)}
                    >
                        Export
                    </Button>
                    <Menu id="export-menu" anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
                        {EXPORT_ITEMS.map(item => {
                            const reason = availability?.[item.kind] ?? null;
                            return (
                                <MenuItem key={item.kind} disabled={reason !== null} onClick={() => handleItem(item.kind)}>
                                    <ListItemText primary={item.label} secondary={reason ?? item.detail} />
                                </MenuItem>
                            );
                        })}
                    </Menu>
                </>
            )}
```

`src/App.tsx`, just above `const controls = (`:

```ts
    const availability = useAppSelector(exportAvailability, shallowEqual);
    // What the plot shows, at the moment of export.
    const csvCurvesNow = useCallback((): CsvCurve[] => {
        if (isAtomMode) return atomCurves;
        if (renderedField) return combinationCurves(combination)?.curves ?? [];
        if (!renderedParams) return [];
        const { n: pn, l: pl, Z: pZ, rMax } = renderedParams;
        return [{ label: 'P(r)', points: radialProfile(pn, pl, pZ, rMax, 480).map(p => ({ r: p.r, value: p.probability })) }];
    }, [isAtomMode, atomCurves, renderedField, combination, renderedParams]);
    const handleExport = useCallback(async (kind: ExportKind, options: ExportOptions) => {
        const state = store.getState();
        const result = await runExport(kind, { state, shareUrl: shareUrlFor(encodeStateOf(state)), csvCurves: csvCurvesNow(), ...options });
        downloadBlob(result.blob, result.filename);
    }, [store, csvCurvesNow]);
```

Move the `shareExportBar` memo below these and make it `<ShareExportBar onShare={handleShare} onExport={handleExport} availability={availability} />` with deps `[handleShare, handleExport, availability]`. Imports: `shallowEqual` from `react-redux`; `exportAvailability, runExport, ExportKind, ExportOptions`; `CsvCurve`; `downloadBlob`; `radialProfile`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/export tests/share_export_bar.test.tsx src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Live verification**

Desktop 1440x900: *Export* beside *Share*. Iron, whole atom → Export → *Radial curves (CSV)* → `orbital-viewer_Fe_atom.csv` downloads. Open it (`head -8 ~/Downloads/orbital-viewer_Fe_atom.csv`): five `#` lines, then `r_bohr,n=1,n=2,n=3,n=4 valence`, then numbers. Open the M shell and export again: columns 3s, 3p, 3d. Basic Orbitals 2p_z: one `P(r)` column. Reload the page and open the Export menu during "Solving Iron…": the CSV item is greyed with "Waiting for the atom to finish solving."
Phone 390x844: *View* tab → Export → the menu opens over the sheet, items readable, and the CSV downloads.

- [ ] **Step 6: Commit**

```bash
git add src/export src/components/ShareExportBar.tsx src/App.tsx tests/export tests/share_export_bar.test.tsx
git commit -m "feat(export): Export menu, with the radial curves as CSV stating their method

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: PNG at 2×, with or without overlays

**Files:**
- Create: `src/export/png.ts`, `src/export/handle.ts`
- Modify: `src/orbital_visualizer.ts` (extract `renderFrame`), `src/components/OrbitalViewer.tsx`, `src/export/run_export.ts`, `src/App.tsx`
- Test: `tests/export/png.test.ts`, `tests/export/run_export.test.ts`

**Interfaces:**
- Consumes: `ScaleBar`, `formatScaleLabel` (`src/scale_bar.ts`); `ViewInsets`, `getScaleBar`.
- Produces: `MAX_EXPORT_SIDE_PX = 4096`; `exportPixelRatio(currentRatio, cssWidth, cssHeight, maxSide?)`; `interface CropRect { x; y; width; height }` (CSS px); `freeAreaCrop(width, height, insets?)`; `interface OverlaySpec { caption: string[]; scaleBar: ScaleBar | null; phaseLegend: boolean }`; `OverlayPainter`, `ExportPainter`, `ExportCanvas`; `drawOverlays(painter, width, height, scale, spec)`; `interface CaptureTarget { renderer: CaptureRenderer; render(): void }`; `captureViewPng(target, crop, overlays, createCanvas?, maxSide?): Promise<Blob>`. `renderFrame(context: VisualizerContext): void` in the visualizer. `handle.ts`: `interface PngOverlayInput { caption: string[]; phaseLegend: boolean }`, `interface ViewerExportHandle { capturePng(overlays: PngOverlayInput | null): Promise<Blob> }`. `ExportKind` gains `'png' | 'png-plain'`; `ExportContext` gains optional `handle?: ViewerExportHandle | null` and `phaseLegend?: boolean`. `OrbitalViewer` gains prop `exportHandleRef?: React.MutableRefObject<ViewerExportHandle | null>`.

- [ ] **Step 1: Write the failing tests**

`tests/export/png.test.ts`:

```ts
import { exportPixelRatio, freeAreaCrop, drawOverlays, captureViewPng, ExportCanvas, OverlayPainter } from '../../src/export/png';

function recorder() {
    const calls: Array<[string, ...unknown[]]> = [];
    const painter: OverlayPainter & { drawImage: (...args: number[]) => void } = {
        fillStyle: '', font: '', textBaseline: 'top',
        fillRect: (...args: number[]) => { calls.push(['fillRect', ...args]); },
        fillText: (text: string, x: number, y: number) => { calls.push(['fillText', text, x, y]); },
        measureText: (text: string) => ({ width: text.length * 7 }),
        drawImage: (...args: number[]) => { calls.push(['drawImage', ...args.slice(1)]); },
    };
    const factory = (width: number, height: number): ExportCanvas => ({
        width, height, getContext: () => painter,
        toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })),
    });
    return { calls, painter, factory };
}

describe('PNG export', () => {
    it('doubles the drawing buffer, capped on the long side', () => {
        expect(exportPixelRatio(1, 1440, 900)).toBe(2);
        expect(exportPixelRatio(2, 1440, 900)).toBeCloseTo(4096 / 1440, 9);
        expect(exportPixelRatio(2, 390, 844)).toBe(4);
    });

    it('crops to what the panels leave free, where the view is centred', () => {
        expect(freeAreaCrop(1440, 900, { top: 0, right: 340, bottom: 0, left: 320 })).toEqual({ x: 320, y: 0, width: 780, height: 900 });
        expect(freeAreaCrop(400, 800)).toEqual({ x: 0, y: 0, width: 400, height: 800 });
        // Panels covering almost everything: the view was fitted to the whole canvas.
        expect(freeAreaCrop(400, 800, { top: 0, right: 200, bottom: 0, left: 150 })).toEqual({ x: 0, y: 0, width: 400, height: 800 });
    });

    it('draws the caption, a scale bar of the right length and the phase key', () => {
        const { calls, painter } = recorder();
        drawOverlays(painter, 800, 600, 2, { caption: ['Iron 3d_z²', 'method'], scaleBar: { lengthBohr: 2, pixels: 50 }, phaseLegend: true });
        const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
        expect(texts).toEqual(expect.arrayContaining(['Iron 3d_z²', 'method', '2 a₀', 'ψ > 0', 'ψ < 0']));
        expect(calls).toContainEqual(['fillRect', 28, expect.any(Number), 100, 6]);
    });

    it('renders once at the export ratio, crops, and puts the ratio back', async () => {
        let ratio = 1;
        const log: string[] = [];
        const target = {
            renderer: {
                getPixelRatio: () => ratio,
                setPixelRatio: (r: number) => { ratio = r; log.push(`ratio ${r}`); },
                domElement: { clientWidth: 1000, clientHeight: 500 } as unknown as HTMLCanvasElement,
            },
            render: () => { log.push(`render ${ratio}`); },
        };
        const { calls, factory } = recorder();
        const blob = await captureViewPng(target, { x: 300, y: 0, width: 400, height: 500 }, null, factory);
        expect(blob.type).toBe('image/png');
        expect(log).toEqual(['ratio 2', 'render 2', 'ratio 1', 'render 1']);
        expect(calls[0]).toEqual(['drawImage', 600, 0, 800, 1000, 0, 0, 800, 1000]);
    });

    it('puts the pixel ratio back even when rendering fails', async () => {
        let ratio = 1;
        const target = {
            renderer: { getPixelRatio: () => ratio, setPixelRatio: (r: number) => { ratio = r; }, domElement: { clientWidth: 100, clientHeight: 100 } as unknown as HTMLCanvasElement },
            render: () => { if (ratio === 2) throw new Error('context lost'); },
        };
        await expect(captureViewPng(target, { x: 0, y: 0, width: 100, height: 100 }, null, recorder().factory)).rejects.toThrow('context lost');
        expect(ratio).toBe(1);
    });
});
```

Append to `tests/export/run_export.test.ts`:

```ts
describe('runExport: PNG', () => {
    it('asks the viewer for an image, with the caption and method, or without overlays', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(neonStore().getState()), handle: { capturePng, collectSurfaces: () => [] }, phaseLegend: false };
        expect((await runExport('png', context)).filename).toBe('orbital-viewer_Ne_atom.png');
        expect(capturePng).toHaveBeenLastCalledWith({ caption: ['Neon (Ne, Z = 10), whole atom, 90% contour', expect.stringMatching(/^central-field SCF/)], phaseLegend: false });
        expect((await runExport('png-plain', context)).filename).toBe('orbital-viewer_Ne_atom_view.png');
        expect(capturePng).toHaveBeenLastCalledWith(null);
    });

    it('says so when the 3D view is not ready', async () => {
        await expect(runExport('png', baseContext(neonStore().getState()))).rejects.toThrow('The 3D view is not ready yet.');
    });
});
```

(`collectSurfaces` is not on `ViewerExportHandle` until Task 10; `context` is a variable, not a literal at the call, so no excess-property error arises.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/export/png.test.ts tests/export/run_export.test.ts`
Expected: FAIL — cannot find `../../src/export/png`.

- [ ] **Step 3: Implement**

`src/export/png.ts`:

```ts
import type { ViewInsets } from '../orbital_visualizer';
import { ScaleBar, formatScaleLabel } from '../scale_bar';

/** Long-side cap: 2× a Retina desktop would be ~83 MB of colour alone, times MSAA. */
export const MAX_EXPORT_SIDE_PX = 4096;

/** Spec: "PNG at 2× screen resolution" — twice the drawing buffer, within the cap. */
export function exportPixelRatio(currentRatio: number, cssWidth: number, cssHeight: number, maxSide = MAX_EXPORT_SIDE_PX): number {
    const wanted = 2 * (currentRatio > 0 ? currentRatio : 1);
    return Math.min(wanted, maxSide / Math.max(cssWidth, cssHeight, 1));
}

export interface CropRect { x: number; y: number; width: number; height: number; }

/**
 * The part of the canvas no panel covers. The view offset centres the atom
 * there, so the image is the atom, not the black under the panels. Mirrors
 * fitFactorFor's rule: below a quarter of the canvas the fit used all of it.
 */
export function freeAreaCrop(width: number, height: number, insets?: ViewInsets): CropRect {
    if (!insets) return { x: 0, y: 0, width, height };
    const freeWidth = width - insets.left - insets.right;
    const freeHeight = height - insets.top - insets.bottom;
    const useX = freeWidth >= width * 0.25;
    const useY = freeHeight >= height * 0.25;
    return {
        x: useX ? insets.left : 0, y: useY ? insets.top : 0,
        width: useX ? freeWidth : width, height: useY ? freeHeight : height,
    };
}

export interface OverlaySpec { caption: string[]; scaleBar: ScaleBar | null; phaseLegend: boolean; }

export interface OverlayPainter {
    fillStyle: string | CanvasGradient | CanvasPattern;
    font: string;
    textBaseline: CanvasTextBaseline;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number): void;
    measureText(text: string): { width: number };
}

export interface ExportPainter extends OverlayPainter {
    drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

export interface ExportCanvas {
    width: number;
    height: number;
    getContext(type: '2d'): ExportPainter | null;
    toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/** The on-screen overlays, redrawn at export scale (they are DOM, not canvas). */
export function drawOverlays(painter: OverlayPainter, width: number, height: number, scale: number, spec: OverlaySpec): void {
    const pad = 14 * scale;
    const line = 18 * scale;
    painter.font = `${13 * scale}px Roboto, sans-serif`;
    painter.textBaseline = 'top';
    painter.fillStyle = 'rgba(0, 0, 0, 0.55)';
    painter.fillRect(0, 0, width, spec.caption.length * line + 2 * pad - (line - 13 * scale));
    painter.fillStyle = '#ffffff';
    spec.caption.forEach((text, i) => painter.fillText(text, pad, pad + i * line));

    painter.textBaseline = 'bottom';
    if (spec.scaleBar) {
        const barY = height - pad - 3 * scale;
        painter.fillStyle = '#ffffff';
        painter.fillRect(pad, barY, spec.scaleBar.pixels * scale, 3 * scale);
        painter.fillText(formatScaleLabel(spec.scaleBar.lengthBohr), pad, barY - 4 * scale);
    }
    if (spec.phaseLegend) {
        let right = width - pad;
        for (const [color, label] of [['#2040ff', 'ψ < 0'], ['#e02020', 'ψ > 0']]) {
            const textWidth = painter.measureText(label).width;
            painter.fillStyle = '#ffffff';
            painter.fillText(label, right - textWidth, height - pad);
            painter.fillStyle = color;
            painter.fillRect(right - textWidth - 16 * scale, height - pad - 12 * scale, 11 * scale, 11 * scale);
            right -= textWidth + 28 * scale;
        }
    }
}

export interface CaptureRenderer {
    getPixelRatio(): number;
    setPixelRatio(ratio: number): void;
    readonly domElement: HTMLCanvasElement;
}
export interface CaptureTarget { renderer: CaptureRenderer; render(): void; }

const defaultCanvas = (width: number, height: number): ExportCanvas => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as ExportCanvas;
};

function canvasToBlob(canvas: ExportCanvas): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'))), 'image/png'));
}

/**
 * Renders one frame at the export ratio and copies it out in the same task,
 * before the browser composites and clears the drawing buffer; so there is
 * no preserveDrawingBuffer and no per-frame cost. The ratio is restored and
 * the frame re-rendered at once, so the screen never shows a cleared canvas.
 */
export async function captureViewPng(
    target: CaptureTarget, crop: CropRect, overlays: OverlaySpec | null,
    createCanvas: (width: number, height: number) => ExportCanvas = defaultCanvas, maxSide = MAX_EXPORT_SIDE_PX,
): Promise<Blob> {
    const { renderer } = target;
    const previous = renderer.getPixelRatio();
    const element = renderer.domElement;
    const ratio = exportPixelRatio(previous, element.clientWidth || crop.width, element.clientHeight || crop.height, maxSide);
    const out = createCanvas(Math.round(crop.width * ratio), Math.round(crop.height * ratio));
    const painter = out.getContext('2d');
    if (!painter) throw new Error('This browser cannot compose an image.');
    try {
        renderer.setPixelRatio(ratio);
        target.render();
        painter.drawImage(element, crop.x * ratio, crop.y * ratio, crop.width * ratio, crop.height * ratio, 0, 0, out.width, out.height);
    } finally {
        renderer.setPixelRatio(previous);
        target.render();
    }
    if (overlays) drawOverlays(painter, out.width, out.height, ratio, overlays);
    return canvasToBlob(out);
}
```

`src/export/handle.ts`:

```ts
/** What the export code may ask of the 3D view. OrbitalViewer fills it. */
export interface PngOverlayInput { caption: string[]; phaseLegend: boolean; }

export interface ViewerExportHandle {
    capturePng(overlays: PngOverlayInput | null): Promise<Blob>;
}
```

`src/orbital_visualizer.ts` — extract the body of `animate` after `tickTransition` into an exported function and call it from `animate`:

```ts
/** One frame: the ring width a shell view needs at this zoom, then the render (two passes mid cross-fade). */
export function renderFrame(context: VisualizerContext): void {
    const { renderer, scene, camera, controls } = context;
    if (context.isShellView) {
        const pxToWorld = worldUnitsPerPixel(camera.position.distanceTo(controls.target), camera.fov, renderer.domElement.clientHeight);
        setShellViewRingWidth(context.currentOrbitalGroup, pxToWorld * HIGHLIGHT_RING_HALF_WIDTH_PX);
    }
    if (context.transition?.kind === 'cross-fade') renderCrossFade(context, context.transition);
    else renderer.render(scene, camera);
}
```

(`animate` becomes: `controls.update(); if (context.transition) tickTransition(context, timestamp); renderFrame(context); context.animationFrameId = requestAnimationFrame(animate);` — move the existing comments with the code.)

`src/components/OrbitalViewer.tsx`: add the prop `exportHandleRef?: React.MutableRefObject<ViewerExportHandle | null>`; in the initialisation effect, after `visualizerContextRef.current = context;`:

```ts
            if (exportHandleRef) {
                exportHandleRef.current = {
                    capturePng: (overlays) => {
                        const host = canvasHostRef.current!;
                        const width = host.clientWidth;
                        const height = host.clientHeight;
                        return captureViewPng(
                            { renderer: context.renderer, render: () => renderFrame(context) },
                            freeAreaCrop(width, height, context.viewInsets),
                            overlays && {
                                ...overlays,
                                // The same bar the readout shows (see the scale effect below).
                                scaleBar: getScaleBar(context, height, Math.max(80, Math.min(240, width * 0.22))),
                            },
                        );
                    },
                };
            }
```

and in its cleanup `if (exportHandleRef) exportHandleRef.current = null;`; add `exportHandleRef` to that effect's dependencies.

`src/export/run_export.ts`: `export type ExportKind = 'png' | 'png-plain' | 'csv';`; put two items first in `EXPORT_ITEMS`:

```ts
    { kind: 'png', label: 'Image (PNG, 2×)', detail: 'with caption, scale bar and colour key' },
    { kind: 'png-plain', label: 'Image (PNG, 2×), view only', detail: 'no overlays' },
```

`ExportContext` gains `handle?: ViewerExportHandle | null; phaseLegend?: boolean;`; `exportAvailability` gains `png: null, 'png-plain': null`; `runExport` gains:

```ts
        case 'png':
        case 'png-plain': {
            if (!context.handle) throw new Error('The 3D view is not ready yet.');
            const overlays = kind === 'png'
                ? { caption: [viewDescription(context.state), methodStatement(context.state)], phaseLegend: Boolean(context.phaseLegend) }
                : null;
            return { blob: await context.handle.capturePng(overlays), filename: kind === 'png' ? `${stem}.png` : `${stem}_view.png` };
        }
```

`src/App.tsx`: `const exportHandleRef = useRef<ViewerExportHandle | null>(null);`, pass `exportHandleRef={exportHandleRef}` to `<OrbitalViewer>`, and add `handle: exportHandleRef.current, phaseLegend: showPhaseLegend` to the `runExport` context (add `showPhaseLegend` to `handleExport`'s dependencies; move `handleExport` below `showPhaseLegend` if needed).

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/export tests/atom/visualizer_dispatch.test.ts src/App.test.tsx && npx tsc --noEmit -p . && grep -rn preserveDrawingBuffer src`
Expected: PASS; tsc clean; the grep prints nothing.

- [ ] **Step 5: Live verification, desktop 1440x900**

1. Basic Orbitals 3d_z², rotated. Export → *Image (PNG, 2×)*. The file `orbital-viewer_H_basic_n3_l2_ml0.png` is twice the free area: check with `sips -g pixelWidth -g pixelHeight ~/Downloads/orbital-viewer_H_basic_n3_l2_ml0.png` (on a 1× display about 1560x1800; on Retina capped at 4096 on the long side). The orbital is centred, the caption band reads "Hydrogen 3d_z², 90% contour" and the method line, the scale bar bottom-left matches the on-screen bar's label, the ψ key bottom-right.
2. *View only*: same image with no overlays.
3. During export, watch the canvas: no black flash, no jump in framing.
4. Iron whole atom: image shows the cut rings; no ψ key.
5. Performance: DevTools Performance, record 5 s of orbiting before and after an export: frame times unchanged.

- [ ] **Step 6: Live verification, phone 390x844 with touch**

View tab → Export → *Image (PNG, 2×)*: the download starts; the image is the free area between header and tab bar, 4× (a phone pixel ratio of 2 doubled), long side ≤ 4096.

- [ ] **Step 7: Commit**

```bash
git add src/export src/orbital_visualizer.ts src/components/OrbitalViewer.tsx src/App.tsx tests/export
git commit -m "feat(export): PNG at twice the drawing buffer, with or without overlays

Render and read in the same task: no preserveDrawingBuffer, no per-frame cost.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Surfaces, a manifold check, and STL in millimetres

**Files:**
- Create: `src/export/surfaces.ts`, `src/export/mesh_topology.ts`, `src/export/stl.ts`
- Modify: `src/orbital_visualizer.ts` (`updateSceneWithMeshData`), `src/atom/shell_composition_view.ts`, Phase 1's `createFieldOverlayGroup` (in `src/orbital_visualizer.ts` or its own module — wherever Phase 1 put it), `src/export/handle.ts`, `src/export/run_export.ts`, `src/components/OrbitalViewer.tsx`, `src/components/ShareExportBar.tsx`, `tests/export/fixtures.ts` (add `octahedron`)
- Test: `tests/export/surfaces.test.ts`, `tests/export/mesh_topology.test.ts`, `tests/export/stl.test.ts`, `tests/export/run_export.test.ts`, `tests/share_export_bar.test.tsx`

**Interfaces:**
- Produces: `interface ExportSurface { name: string; positions: Float32Array; indices: Uint32Array; colors: Float32Array }` (world space, bohr; linear RGB per vertex); `markExportSurface(mesh, name)`; `collectExportSurfaces(root: THREE.Object3D | null): ExportSurface[]`; `interface SurfaceBounds { min; max; longestSide }`, `surfaceBounds(surfaces)`. `interface TopologyReport { triangles; degenerateTriangles; boundaryEdges; nonManifoldEdges; misorientedEdges; signedVolume }`, `weldVertices(positions): Uint32Array`, `meshTopology(positions, indices)`, `isWatertight(report)`. `class StlExportError extends Error`, `encodeStl(surfaces, longestSideMm): ArrayBuffer`. `ViewerExportHandle.collectSurfaces(): ExportSurface[]`. `ExportKind` gains `'stl'`. `PRINT_SIZES_MM = [30, 50, 80, 120]` in the bar.

- [ ] **Step 1: Write the failing tests**

Add to `tests/export/fixtures.ts`:

```ts
import type { ExportSurface } from '../../src/export/surfaces';

/** A closed octahedron of half-width 1 bohr, wound outward. */
export function octahedron(name = 'octa'): ExportSurface {
    return {
        name,
        positions: new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]),
        indices: new Uint32Array([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]),
        colors: new Float32Array(18).fill(1),
    };
}
```

Task 9's PNG test passes a handle with `collectSurfaces: () => []`; it type-checks now that the handle has that method.

`tests/export/surfaces.test.ts`:

```ts
import * as THREE from 'three';
import { collectExportSurfaces, markExportSurface, surfaceBounds } from '../../src/export/surfaces';
import { octahedron } from './fixtures';

const triangle = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    return geometry;
};

describe('collectExportSurfaces', () => {
    it('takes only marked meshes, in world space, coloured by their material', () => {
        const root = new THREE.Group();
        root.position.set(1, 0, 0);
        const marked = new THREE.Mesh(triangle(), new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.5, 0) }));
        markExportSurface(marked, '2p_x');
        root.add(marked, new THREE.Mesh(triangle(), new THREE.MeshBasicMaterial()));
        const surfaces = collectExportSurfaces(root);
        expect(surfaces).toHaveLength(1);
        expect(surfaces[0].name).toBe('2p_x');
        expect(Array.from(surfaces[0].positions)).toEqual([1, 0, 0, 2, 0, 0, 1, 1, 0]);
        expect(Array.from(surfaces[0].indices)).toEqual([0, 1, 2]);
        expect(Array.from(surfaces[0].colors.slice(0, 3))).toEqual([1, 0.5, 0]);
    });

    it('keeps per-vertex colours where the mesh has them (the ψ phase)', () => {
        const geometry = triangle();
        geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 1, 0, 0], 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
        markExportSurface(mesh, 'surface');
        expect(Array.from(collectExportSurfaces(mesh)[0].colors)).toEqual([1, 0, 0, 0, 0, 1, 1, 0, 0]);
    });

    it('returns nothing without a scene, and measures bounds', () => {
        expect(collectExportSurfaces(null)).toEqual([]);
        expect(surfaceBounds([octahedron()]).longestSide).toBe(2);
    });
});
```

`tests/export/mesh_topology.test.ts`:

```ts
import { meshTopology, isWatertight } from '../../src/export/mesh_topology';
import { generateOrbitalMesh } from '../../src/orbital_mesh';
import { computeSamplingRadius } from '../../src/orbital_presets';
import { octahedron } from './fixtures';

describe('meshTopology', () => {
    it('passes a closed, outward-wound solid', () => {
        const { positions, indices } = octahedron();
        const report = meshTopology(positions, indices);
        expect(report).toMatchObject({ triangles: 8, boundaryEdges: 0, nonManifoldEdges: 0, misorientedEdges: 0 });
        expect(report.signedVolume).toBeCloseTo(4 / 3, 9);
        expect(isWatertight(report)).toBe(true);
    });

    it('finds an opening and a flipped triangle', () => {
        const { positions, indices } = octahedron();
        expect(meshTopology(positions, indices.slice(0, 21)).boundaryEdges).toBe(3);
        const flipped = indices.slice();
        [flipped[1], flipped[2]] = [flipped[2], flipped[1]];
        expect(meshTopology(positions, flipped).misorientedEdges).toBe(3);
        expect(isWatertight(meshTopology(positions, flipped))).toBe(false);
    });

    // Spec §5 Phase 2: "exported STL passes a manifold check" — on the app's real surfaces.
    it.each([[2, 1, 0], [3, 2, 0]])('the app\'s own %i,%i,%i surface is watertight', (n, l, ml) => {
        const mesh = generateOrbitalMesh({ n, l, ml, Z: 1, resolution: 32, rMax: computeSamplingRadius(n, l, 1), enclosedFraction: 0.9 });
        const report = meshTopology(Float32Array.from(mesh.positions.flat()), Uint32Array.from(mesh.cells.flat()));
        expect(isWatertight(report)).toBe(true);
    });
});
```

`tests/export/stl.test.ts`:

```ts
import { encodeStl, StlExportError } from '../../src/export/stl';
import { octahedron } from './fixtures';

const floatsAt = (buffer: ArrayBuffer, offset: number, count: number) =>
    Array.from({ length: count }, (_, i) => new DataView(buffer).getFloat32(offset + 4 * i, true));

describe('encodeStl', () => {
    it('writes binary STL: an 80-byte header, a count, 50 bytes per triangle', () => {
        const buffer = encodeStl([octahedron()], 50);
        expect(buffer.byteLength).toBe(84 + 50 * 8);
        expect(new DataView(buffer).getUint32(80, true)).toBe(8);
        const header = String.fromCharCode(...new Uint8Array(buffer, 0, 80));
        expect(header.startsWith('solid')).toBe(false);
        expect(header).toContain('millimetres, 1 a0 = 25.00 mm');
    });

    it('scales the longest side to the chosen size in millimetres', () => {
        // First triangle's first vertex: (1, 0, 0) bohr, 2 bohr across, printed 50 mm across.
        expect(floatsAt(encodeStl([octahedron()], 50), 84 + 12, 3)).toEqual([25, 0, 0]);
    });

    it('winds every triangle outward, flipping a surface wound inward', () => {
        const inward = octahedron();
        for (let t = 0; t < inward.indices.length; t += 3) [inward.indices[t + 1], inward.indices[t + 2]] = [inward.indices[t + 2], inward.indices[t + 1]];
        const buffer = encodeStl([inward], 50);
        for (let t = 0; t < 8; t++) {
            const [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz] = floatsAt(buffer, 84 + 50 * t, 12);
            expect(nx * (ax + bx + cx) + ny * (ay + by + cy) + nz * (az + bz + cz)).toBeGreaterThan(0);
        }
    });

    it('refuses an open surface or nothing at all, saying why', () => {
        const open = { ...octahedron('2p_z'), indices: octahedron().indices.slice(0, 21) };
        expect(() => encodeStl([open], 50)).toThrow(StlExportError);
        expect(() => encodeStl([open], 50)).toThrow(/2p_z is not watertight/);
        expect(() => encodeStl([], 50)).toThrow(/Nothing to export yet/);
    });
});
```

Append to `tests/export/run_export.test.ts`:

```ts
describe('runExport: STL', () => {
    it('prints what the viewer holds, at the chosen size', async () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        const handle = { capturePng: jest.fn(), collectSurfaces: () => [octahedron()] };
        const result = await runExport('stl', { ...baseContext(store.getState()), handle, longestSideMm: 80 });
        expect(result.filename).toBe('orbital-viewer_Ne_shell_n2.stl');
        expect(result.blob.size).toBe(84 + 50 * 8);
    });

    // Review Focus 4.
    it('is unavailable at the whole-atom level, and refuses while the surface is still coming', async () => {
        expect(exportAvailability(neonStore().getState()).stl).toMatch(/whole-atom view is a shaded cut face/);
        const store = neonStore();
        store.dispatch(drillToShell(2));
        const handle = { capturePng: jest.fn(), collectSurfaces: () => [] };
        await expect(runExport('stl', { ...baseContext(store.getState()), handle, longestSideMm: 50 })).rejects.toThrow(/Nothing to export yet/);
    });
});
```

(Import `drillToShell` from the atom slice and `octahedron` from `./fixtures`.)

Append to `tests/share_export_bar.test.tsx`:

```tsx
    it('asks for a print size before exporting STL', async () => {
        const onExport = jest.fn().mockResolvedValue(undefined);
        render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /3D print/i }));
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /longest side/i }));
        fireEvent.click(screen.getByRole('option', { name: '80 mm' }));
        fireEvent.click(screen.getByRole('button', { name: /export stl/i }));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('stl', { longestSideMm: 80 }));
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/export tests/share_export_bar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/export/surfaces.ts`:

```ts
import * as THREE from 'three';

/** A surface to export: world-space bohr, indexed triangles, linear RGB per vertex. */
export interface ExportSurface { name: string; positions: Float32Array; indices: Uint32Array; colors: Float32Array; }

/**
 * Marks the meshes that are the surface itself. Caps, the shell view's
 * sphere, axes and labels are view furniture and stay unmarked.
 */
export function markExportSurface(mesh: THREE.Mesh, name: string): void {
    mesh.userData.exportName = name;
}

export function collectExportSurfaces(root: THREE.Object3D | null): ExportSurface[] {
    if (!root) return [];
    root.updateWorldMatrix(true, true);
    const surfaces: ExportSurface[] = [];
    const point = new THREE.Vector3();
    root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || typeof object.userData.exportName !== 'string') return;
        const geometry = object.geometry as THREE.BufferGeometry;
        const position = geometry.getAttribute('position');
        if (!position || position.count === 0) return;
        const count = position.count;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
            positions.set([point.x, point.y, point.z], 3 * i);
        }
        const index = geometry.getIndex();
        const indices = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: count }, (_, i) => i);
        const colorAttribute = geometry.getAttribute('color');
        const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial;
        const base = material.color ?? new THREE.Color(1, 1, 1);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            colors.set(colorAttribute
                ? [colorAttribute.getX(i), colorAttribute.getY(i), colorAttribute.getZ(i)]
                : [base.r, base.g, base.b], 3 * i);
        }
        surfaces.push({ name: object.userData.exportName, positions, indices, colors });
    });
    return surfaces;
}

export interface SurfaceBounds { min: [number, number, number]; max: [number, number, number]; longestSide: number; }

export function surfaceBounds(surfaces: ExportSurface[]): SurfaceBounds {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const { positions } of surfaces) {
        for (let i = 0; i < positions.length; i++) {
            const axis = i % 3;
            min[axis] = Math.min(min[axis], positions[i]);
            max[axis] = Math.max(max[axis], positions[i]);
        }
    }
    return { min, max, longestSide: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) };
}
```

`src/export/mesh_topology.ts`:

```ts
/**
 * Whether a triangle mesh bounds a solid: every edge shared by exactly two
 * triangles, traversed in opposite directions by the two. A 3D printer
 * cannot fill a surface with a hole in it, and a slicer's guess at one is not
 * the orbital (spec §5 Phase 2: "watertight").
 */
export interface TopologyReport {
    triangles: number;
    degenerateTriangles: number;
    boundaryEdges: number;
    nonManifoldEdges: number;
    misorientedEdges: number;
    /** Positive when the triangles are wound outward. */
    signedVolume: number;
}

/** Canonical vertex ids: marching cubes can emit coincident vertices (a crossing exactly at a grid point). */
export function weldVertices(positions: Float32Array): Uint32Array {
    let extent = 0;
    for (let i = 0; i < positions.length; i++) extent = Math.max(extent, Math.abs(positions[i]));
    const tolerance = Math.max(extent, 1e-12) * 1e-6;
    const ids = new Map<string, number>();
    const canonical = new Uint32Array(positions.length / 3);
    for (let v = 0; v < canonical.length; v++) {
        const key = `${Math.round(positions[3 * v] / tolerance)},${Math.round(positions[3 * v + 1] / tolerance)},${Math.round(positions[3 * v + 2] / tolerance)}`;
        let id = ids.get(key);
        if (id === undefined) { id = ids.size; ids.set(key, id); }
        canonical[v] = id;
    }
    return canonical;
}

export function meshTopology(positions: Float32Array, indices: Uint32Array): TopologyReport {
    const id = weldVertices(positions);
    const edges = new Map<string, { forward: number; backward: number }>();
    let degenerate = 0;
    let volume = 0;
    const p = (v: number, axis: number) => positions[3 * v + axis];
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const [u, v, w] = [id[a], id[b], id[c]];
        if (u === v || v === w || u === w) { degenerate++; continue; }
        for (const [from, to] of [[u, v], [v, w], [w, u]]) {
            const key = from < to ? `${from}_${to}` : `${to}_${from}`;
            const entry = edges.get(key) ?? { forward: 0, backward: 0 };
            if (from < to) entry.forward++; else entry.backward++;
            edges.set(key, entry);
        }
        volume += (p(a, 0) * (p(b, 1) * p(c, 2) - p(b, 2) * p(c, 1))
            - p(a, 1) * (p(b, 0) * p(c, 2) - p(b, 2) * p(c, 0))
            + p(a, 2) * (p(b, 0) * p(c, 1) - p(b, 1) * p(c, 0))) / 6;
    }
    let boundary = 0, nonManifold = 0, misoriented = 0;
    for (const { forward, backward } of edges.values()) {
        const uses = forward + backward;
        if (uses === 1) boundary++;
        else if (uses > 2) nonManifold++;
        else if (forward !== 1) misoriented++;
    }
    return {
        triangles: indices.length / 3, degenerateTriangles: degenerate, boundaryEdges: boundary,
        nonManifoldEdges: nonManifold, misorientedEdges: misoriented, signedVolume: volume,
    };
}

export function isWatertight(report: TopologyReport): boolean {
    return report.triangles > report.degenerateTriangles
        && report.boundaryEdges === 0 && report.nonManifoldEdges === 0 && report.misorientedEdges === 0;
}
```

`src/export/stl.ts`:

```ts
import { ExportSurface, surfaceBounds } from './surfaces';
import { isWatertight, meshTopology, weldVertices } from './mesh_topology';

export class StlExportError extends Error {}

/**
 * Binary STL, in millimetres (the unit slicers assume), the longest side at
 * the size chosen. Every surface must pass the manifold check; one that does
 * not is refused with the reason rather than printed as something else.
 */
export function encodeStl(surfaces: ExportSurface[], longestSideMm: number): ArrayBuffer {
    if (surfaces.length === 0) throw new StlExportError('Nothing to export yet — the surface is still being computed.');
    const { longestSide } = surfaceBounds(surfaces);
    if (!(longestSideMm > 0) || !(longestSide > 0)) throw new StlExportError('Pick a print size.');
    const mmPerBohr = longestSideMm / longestSide;

    const triangles: Array<{ surface: ExportSurface; a: number; b: number; c: number }> = [];
    for (const surface of surfaces) {
        const report = meshTopology(surface.positions, surface.indices);
        if (!isWatertight(report)) {
            throw new StlExportError(`${surface.name} is not watertight (${report.boundaryEdges} open edges), so it would not print as a solid. Try a lower enclosed fraction.`);
        }
        const flip = report.signedVolume < 0;
        const id = weldVertices(surface.positions);
        for (let t = 0; t < surface.indices.length; t += 3) {
            const [a, b, c] = [surface.indices[t], surface.indices[t + 1], surface.indices[t + 2]];
            if (id[a] === id[b] || id[b] === id[c] || id[a] === id[c]) continue;
            triangles.push(flip ? { surface, a, b: c, c: b } : { surface, a, b, c });
        }
    }

    const buffer = new ArrayBuffer(84 + 50 * triangles.length);
    const view = new DataView(buffer);
    const header = `electron-orbital-viewer, millimetres, 1 a0 = ${mmPerBohr.toFixed(2)} mm`.slice(0, 80);
    for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
    view.setUint32(80, triangles.length, true);

    let offset = 84;
    const vertex = (s: ExportSurface, v: number) => [0, 1, 2].map(axis => s.positions[3 * v + axis] * mmPerBohr);
    for (const { surface, a, b, c } of triangles) {
        const [pa, pb, pc] = [vertex(surface, a), vertex(surface, b), vertex(surface, c)];
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const length = Math.hypot(n[0], n[1], n[2]) || 1;
        for (const value of [...n.map(x => x / length), ...pa, ...pb, ...pc]) {
            view.setFloat32(offset, value, true);
            offset += 4;
        }
        view.setUint16(offset, 0, true);
        offset += 2;
    }
    return buffer;
}
```

Marking the surfaces:
- `src/orbital_visualizer.ts`, `updateSceneWithMeshData`: after `const mesh = new THREE.Mesh(geometry, material);` add `markExportSurface(mesh, 'surface');`.
- `src/atom/shell_composition_view.ts`: after `const mesh = new THREE.Mesh(geometry, material);` add `markExportSurface(mesh, orbitalName(component.n, component.l, component.ml));` (import `orbitalName` from `../orbital_names`).
- Phase 1's `createFieldOverlayGroup`: replace `group.add(new THREE.Mesh(geometry, createOrbitalMaterial(style, clippingPlanes)));` with `const mesh = new THREE.Mesh(geometry, createOrbitalMaterial(style, clippingPlanes)); markExportSurface(mesh, 'overlay'); group.add(mesh);`.

`src/export/handle.ts`: add `collectSurfaces(): ExportSurface[];` to `ViewerExportHandle` (import the type). `src/components/OrbitalViewer.tsx`: add `collectSurfaces: () => collectExportSurfaces(context.currentOrbitalGroup),` to the handle.

`src/export/run_export.ts`: `ExportKind` gains `'stl'`; item after the PNGs: `{ kind: 'stl', label: '3D print (STL)', detail: 'watertight, in millimetres' }`; add

```ts
const WHOLE_ATOM_GEOMETRY = 'The whole-atom view is a shaded cut face, not a surface. Open a shell or an orbital to export geometry.';

function geometryReason(state: RootState): string | null {
    if (state.atom.mode === 'atom' && state.atom.level === 'atom') return WHOLE_ATOM_GEOMETRY;
    return state.orbital.isLoading ? 'The surface is still being computed.' : drawnReason(state);
}
```

`stl: geometryReason(state)` in `exportAvailability`, and the case:

```ts
        case 'stl': {
            const surfaces = context.handle?.collectSurfaces() ?? [];
            return { blob: new Blob([encodeStl(surfaces, context.longestSideMm ?? 50)], { type: 'model/stl' }), filename: `${stem}.stl` };
        }
```

`src/components/ShareExportBar.tsx`: `const PRINT_SIZES_MM = [30, 50, 80, 120];`, state `stlOpen` and `printSize` (default 50); `handleItem` becomes `kind === 'stl' ? (setMenuAnchor(null), setStlOpen(true)) : void runKind(kind)` (as an if/else); and the dialog:

```tsx
            <Dialog open={stlOpen} onClose={() => setStlOpen(false)}>
                <DialogTitle>Export for 3D printing</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth margin="dense" size="small">
                        <InputLabel id="print-size-label">Longest side</InputLabel>
                        <Select
                            labelId="print-size-label"
                            id="print-size"
                            label="Longest side"
                            value={String(printSize)}
                            onChange={event => setPrintSize(Number(event.target.value))}
                        >
                            {PRINT_SIZES_MM.map(mm => <MenuItem key={mm} value={String(mm)}>{mm} mm</MenuItem>)}
                        </Select>
                        <FormHelperText>
                            Binary STL in millimetres; the scale (mm per a₀) is in the file header. The whole
                            surface is exported: the cut is a view setting, and a cut surface would not print.
                        </FormHelperText>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStlOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={() => { setStlOpen(false); void runKind('stl', { longestSideMm: printSize }); }}>
                        Export STL
                    </Button>
                </DialogActions>
            </Dialog>
```

(imports `FormControl, FormHelperText, InputLabel, Select`.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/export tests/share_export_bar.test.tsx tests/atom/shell_composition.test.ts tests/atom/visualizer_dispatch.test.ts && npx tsc --noEmit -p .`
Expected: PASS. If a real orbital surface reports misoriented edges, stop and report it: the check is the requirement, not the thing to relax.

- [ ] **Step 5: Live verification**

Desktop 1440x900: Iron whole atom → Export: *3D print (STL)* greyed with the whole-atom reason. Open the 3d orbital → *3D print* → Longest side 80 mm → Export STL: `orbital-viewer_Fe_n3_l2_ml0.stl`. Check with `python3 -c "import struct;d=open('$HOME/Downloads/orbital-viewer_Fe_n3_l2_ml0.stl','rb').read();print(d[:80]);print(struct.unpack('<I',d[80:84])[0], (len(d)-84)//50)"`: header names millimetres, the two counts agree. Import into a slicer (PrusaSlicer or Cura, if installed): no "open edges" or "auto-repaired" warning; size 80 mm on its longest axis. Open the M shell (lobes): STL of all lobes exports. Basic Orbitals sp³ overlay: exports.
Phone 390x844: View tab → Export → 3D print: the dialog fits, the size select opens, the file downloads.

- [ ] **Step 6: Commit**

```bash
git add src/export src/orbital_visualizer.ts src/atom/shell_composition_view.ts src/components tests/export tests/share_export_bar.test.tsx
git commit -m "feat(export): STL in millimetres, refused unless every surface is watertight

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(If Phase 1's `createFieldOverlayGroup` lives in its own file, add that file to `git add`.)

---

### Task 11: glTF with colours

**Files:**
- Create: `src/export/gltf.ts`, `src/export/gltf_exporter_factory.ts`
- Modify: `src/export/run_export.ts`
- Test: `tests/export/gltf.test.ts`, `tests/export/run_export.test.ts`

**Interfaces:**
- Consumes: `ExportSurface`, `surfaceBounds` (Task 10).
- Produces: `GLTF_LONGEST_SIDE_METRES = 0.2`; `buildGltfScene(surfaces, description): THREE.Scene`; `encodeGlb(surfaces, description): Promise<ArrayBuffer>`; `exportGlb(scene): Promise<ArrayBuffer>` (factory; lazily imports `GLTFExporter`). `ExportKind` gains `'glb'`.

- [ ] **Step 1: Write the failing tests**

`tests/export/gltf.test.ts`:

```ts
import * as THREE from 'three';

// GLTFExporter ships only as an ES module, which this project's ts-jest cannot
// load (see orbital_controls_factory.ts), so the factory is mocked.
jest.mock('../../src/export/gltf_exporter_factory', () => ({ exportGlb: jest.fn(async () => new ArrayBuffer(12)) }));

import { buildGltfScene, encodeGlb } from '../../src/export/gltf';
import { exportGlb } from '../../src/export/gltf_exporter_factory';
import { octahedron } from './fixtures';

describe('glTF export', () => {
    it('builds one vertex-coloured mesh per surface, scaled to a 20 cm model', () => {
        const scene = buildGltfScene([octahedron('a'), octahedron('b')], 'Neon, 2p subshell');
        const root = scene.children[0];
        expect(root.children.map(child => child.name)).toEqual(['a', 'b']);
        expect(root.scale.x * 2).toBeCloseTo(0.2, 9);
        expect(root.userData).toMatchObject({ unit: 'bohr', description: 'Neon, 2p subshell', metresPerBohr: 0.1 });
        const mesh = root.children[0] as THREE.Mesh;
        expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
        expect(mesh.geometry.getAttribute('color').count).toBe(6);
    });

    it('hands the scene to the exporter, and refuses an empty one', async () => {
        expect((await encodeGlb([octahedron()], 'x')).byteLength).toBe(12);
        expect(exportGlb).toHaveBeenCalledTimes(1);
        await expect(encodeGlb([], 'x')).rejects.toThrow(/Nothing to export yet/);
    });
});
```

Append to `tests/export/run_export.test.ts` (add at the top of that file the same `jest.mock('../../src/export/gltf_exporter_factory', …)` line):

```ts
describe('runExport: glTF', () => {
    it('writes a .glb of what the viewer holds, and not at the whole-atom level', async () => {
        const store = neonStore();
        expect(exportAvailability(store.getState()).glb).toMatch(/whole-atom view/);
        store.dispatch(drillToShell(2));
        const handle = { capturePng: jest.fn(), collectSurfaces: () => [octahedron()] };
        const result = await runExport('glb', { ...baseContext(store.getState()), handle });
        expect(result.filename).toBe('orbital-viewer_Ne_shell_n2.glb');
        expect(result.blob.type).toBe('model/gltf-binary');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/export/gltf.test.ts tests/export/run_export.test.ts`
Expected: FAIL — cannot find `../../src/export/gltf`.

- [ ] **Step 3: Implement**

`src/export/gltf_exporter_factory.ts`:

```ts
import type * as THREE from 'three';

/**
 * Isolated for the same reason as orbital_controls_factory.ts: three's
 * addons ship only as ES modules, which Jest here cannot load. Imported
 * lazily as well, so the exporter is a separate chunk fetched on first use
 * rather than weight on every page load.
 */
export async function exportGlb(scene: THREE.Object3D): Promise<ArrayBuffer> {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const result = await new GLTFExporter().parseAsync(scene, { binary: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('The glTF exporter returned JSON where binary was asked for.');
    return result;
}
```

`src/export/gltf.ts`:

```ts
import * as THREE from 'three';
import { ExportSurface, surfaceBounds } from './surfaces';
import { exportGlb } from './gltf_exporter_factory';

/** Tabletop size for AR, and irrelevant to slides, which rescale anyway. */
export const GLTF_LONGEST_SIDE_METRES = 0.2;

/**
 * A clean scene of just the surfaces: plain standard materials with the
 * app's colours (the ψ phase, or the subshell palette), opaque, no clipping
 * or stencil caps. glTF's unit is the metre, so the root is scaled and its
 * extras record by how much.
 */
export function buildGltfScene(surfaces: ExportSurface[], description: string): THREE.Scene {
    const scene = new THREE.Scene();
    const metresPerBohr = GLTF_LONGEST_SIDE_METRES / surfaceBounds(surfaces).longestSide;
    const root = new THREE.Group();
    root.name = 'electron-orbital-viewer';
    root.scale.setScalar(metresPerBohr);
    root.userData = { description, unit: 'bohr', metresPerBohr };
    for (const surface of surfaces) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(surface.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = surface.name;
        root.add(mesh);
    }
    scene.add(root);
    return scene;
}

export async function encodeGlb(surfaces: ExportSurface[], description: string): Promise<ArrayBuffer> {
    if (surfaces.length === 0) throw new Error('Nothing to export yet — the surface is still being computed.');
    return exportGlb(buildGltfScene(surfaces, description));
}
```

`src/export/run_export.ts`: `ExportKind` gains `'glb'`; item before STL: `{ kind: 'glb', label: '3D model (glTF .glb)', detail: 'colours kept — slides and AR' }`; availability `glb: geometryReason(state)`; case:

```ts
        case 'glb': {
            const description = `${viewDescription(context.state)}; ${methodStatement(context.state)}`;
            const buffer = await encodeGlb(context.handle?.collectSurfaces() ?? [], description);
            return { blob: new Blob([buffer], { type: 'model/gltf-binary' }), filename: `${stem}.glb` };
        }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/export && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Live verification**

Desktop: Basic Orbitals 3d_z² → Export → *3D model (glTF .glb)*. Drag the file onto https://gltf-viewer.donmccurdy.com: red and blue lobes and the ring, lit, about 20 cm across (the viewer's stats), no validation errors in its report. Neon 2p subshell (lobes): three coloured lobes. The Network panel shows the GLTFExporter chunk fetched only on the first glTF export. Phone 390x844: the item is reachable and downloads.

- [ ] **Step 6: Commit**

```bash
git add src/export tests/export
git commit -m "feat(export): glTF with colours kept, 20 cm across, scale in extras

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The Gaussian cube format and its grids

**Files:**
- Create: `src/export/cube.ts`
- Test: `tests/export/cube.test.ts`

**Interfaces:**
- Consumes: `AnalyticFieldSource`, `hydrogenicSource`, `makeFieldEvaluator` (`src/field_source.ts`, Phase 1); `sampleFieldSource(source, resolution): SampledField` (`src/orbital_mesh.ts`, Phase 1); `RadialGrid`, `cumulativeIntegral`, `interpolateOnGrid`.
- Produces: `interface CubeGrid { shape: [number, number, number]; origin: [number, number, number]; spacing: number; values: Float32Array }` (x slowest, z fastest — the shape of spec §4.1's `GridFieldSource`, so Phase 5–6 grids export through the same encoder); `interface CubeAtom { Z: number; position: [number, number, number] }`; `interface RadialCurveOnGrid { D: ArrayLike<number>; rMin: number; dx: number; size: number }`; `formatCubeValue(v): string`; `asciiLine(text): string`; `encodeCube(grid, atoms, title, description): string[]`; `fieldCubeGrid(source, resolution): CubeGrid`; `RADIAL_CUBE_FRACTION = 0.999`; `radiusEnclosing(curve, fraction): number`; `radialDensityCubeGrid(curve, resolution): CubeGrid`.

- [ ] **Step 1: Write the failing test**

`tests/export/cube.test.ts`:

```ts
import {
    encodeCube, formatCubeValue, fieldCubeGrid, radialDensityCubeGrid, radiusEnclosing, asciiLine, CubeGrid,
} from '../../src/export/cube';
import { hydrogenicSource, makeFieldEvaluator } from '../../src/field_source';

/** Reads a cube file by the format's rules: 2 comments, counts and vectors in bohr, atoms, values. */
function parseCube(text: string) {
    const lines = text.split('\n');
    const numbers = (line: string) => line.trim().split(/\s+/).map(Number);
    const [natoms, ...origin] = numbers(lines[2]);
    const axes = [3, 4, 5].map(i => numbers(lines[i]));
    const atoms = lines.slice(6, 6 + natoms).map(numbers);
    const dataLines = lines.slice(6 + natoms).filter(line => line.trim() !== '');
    const tokens = dataLines.join(' ').trim().split(/\s+/);
    return { comments: lines.slice(0, 2), natoms, origin, axes, atoms, dataLines, tokens, values: tokens.map(Number) };
}

const tiny: CubeGrid = { shape: [2, 3, 7], origin: [-1, -2, -3], spacing: 0.5, values: Float32Array.from({ length: 42 }, (_, i) => (i - 20) * 1e-3) };

describe('Gaussian cube', () => {
    it('formats values in E13.5 with a two-digit exponent', () => {
        expect(formatCubeValue(1.2345e-3)).toBe('  1.23450E-03');
        expect(formatCubeValue(-0.5)).toBe(' -5.00000E-01');
        expect(formatCubeValue(0)).toBe('  0.00000E+00');
        expect(formatCubeValue(1e-120)).toBe('  0.00000E+00');
        expect(formatCubeValue(Number.NaN)).toBe('  0.00000E+00');
    });

    it('writes the header in bohr and the values x-slowest, six to a line', () => {
        const cube = parseCube(encodeCube(tiny, [{ Z: 26, position: [0, 0, 0] }], 'Iron 3d_z²', 'ψ, bohr^-3/2').join(''));
        expect(cube.comments).toEqual(['Iron 3d_z2', 'psi, bohr^-3/2']);
        expect(cube.natoms).toBe(1);   // positive: bohr
        expect(cube.origin).toEqual([-1, -2, -3]);
        expect(cube.axes).toEqual([[2, 0.5, 0, 0], [3, 0, 0.5, 0], [7, 0, 0, 0.5]]);
        expect(cube.atoms).toEqual([[26, 26, 0, 0, 0]]);
        expect(cube.values).toHaveLength(42);
        expect(cube.tokens.every(t => /^-?\d\.\d{5}E[+-]\d{2}$/.test(t))).toBe(true);
        expect(cube.dataLines.every(line => line.trim().split(/\s+/).length <= 6)).toBe(true);
        // Each z row starts a line: 2 x 3 rows of 7 values = 6 rows x 2 lines.
        expect(cube.dataLines).toHaveLength(12);
        cube.values.forEach((v, i) => expect(v).toBeCloseTo(tiny.values[i], 6));
    });

    it('samples a field source on the grid it was drawn on', () => {
        const source = hydrogenicSource({ n: 2, l: 1, ml: 0, Z: 1, resolution: 16, rMax: 10, enclosedFraction: 0.9 });
        const grid = fieldCubeGrid(source, 16);
        expect(grid.shape).toEqual([17, 17, 17]);
        expect(grid.origin).toEqual([-10, -10, -10]);
        expect(grid.spacing).toBeCloseTo(1.25, 12);
        const psi = makeFieldEvaluator(source.recipe);
        const at = (i: number, j: number, k: number) => grid.values[(i * 17 + j) * 17 + k];
        expect(at(8, 8, 12)).toBeCloseTo(psi(0, 0, 5), 6);
        expect(at(3, 11, 2)).toBeCloseTo(psi(-6.25, 3.75, -7.5), 6);
    });

    it('turns a radial distribution into a density that integrates to the electrons', () => {
        // Hydrogen 1s: D(r) = 4r²e^(-2r), so ρ = e^(-2r)/π, one electron.
        const size = 1201, rMin = 1e-4, dx = Math.log(40 / rMin) / (size - 1);
        const D = Float64Array.from({ length: size }, (_, j) => { const r = rMin * Math.exp(j * dx); return 4 * r * r * Math.exp(-2 * r); });
        const curve = { D, rMin, dx, size };
        const halfWidth = radiusEnclosing(curve, 0.999);
        // 1 - e^(-2R)(1 + 2R + 2R²) = 0.999 at R ≈ 5.6.
        expect(halfWidth).toBeGreaterThan(5.4);
        expect(halfWidth).toBeLessThan(5.8);
        const grid = radialDensityCubeGrid(curve, 64);
        const centre = grid.values[(32 * 65 + 32) * 65 + 32];
        expect(centre).toBeCloseTo(1 / Math.PI, 3);
        const electrons = grid.values.reduce((sum, v) => sum + v, 0) * grid.spacing ** 3;
        expect(electrons).toBeGreaterThan(0.98);
        expect(electrons).toBeLessThan(1.02);
    });

    it('keeps comment lines to printable ASCII on one line', () => {
        expect(asciiLine('ρ(r) − 4f_z³\nnext')).toBe('rho(r) - 4f_z3 next');
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/export/cube.test.ts`
Expected: FAIL — cannot find `../../src/export/cube`.

- [ ] **Step 3: Implement**

`src/export/cube.ts`:

```ts
import { AnalyticFieldSource } from '../field_source';
import { sampleFieldSource } from '../orbital_mesh';
import { RadialGrid, cumulativeIntegral, interpolateOnGrid } from '../atom/radial_grid';

/** A regular grid, x slowest and z fastest, in bohr: the cube layout and spec §4.1's GridFieldSource shape. */
export interface CubeGrid { shape: [number, number, number]; origin: [number, number, number]; spacing: number; values: Float32Array; }
export interface CubeAtom { Z: number; position: [number, number, number]; }
export interface RadialCurveOnGrid { D: ArrayLike<number>; rMin: number; dx: number; size: number; }

/** Fortran E13.5, which every cube reader accepts. Below 1e-99 is written as 0 to keep the exponent two digits. */
export function formatCubeValue(value: number): string {
    const v = Number.isFinite(value) && Math.abs(value) >= 1e-99 ? value : 0;
    const [mantissa, exponent] = v.toExponential(5).split('e');
    const e = Number(exponent);
    return `${mantissa}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`.padStart(13);
}

/** Cube comment lines are single-line ASCII. */
export function asciiLine(text: string): string {
    return text.replace(/ψ/g, 'psi').replace(/ρ/g, 'rho').replace(/−/g, '-')
        .normalize('NFKD').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
}

const fixed = (v: number) => v.toFixed(6).padStart(12);
const count = (v: number) => String(v).padStart(5);

/** The file as chunks, for new Blob(chunks): a 129³ grid is ~28 MB of text, never one string. */
export function encodeCube(grid: CubeGrid, atoms: CubeAtom[], title: string, description: string): string[] {
    const [n1, n2, n3] = grid.shape;
    if (grid.values.length !== n1 * n2 * n3) throw new Error('Cube grid: the values do not match its shape.');
    const s = grid.spacing;
    const chunks = [
        `${asciiLine(title)}\n${asciiLine(description)}\n`,
        `${count(atoms.length)}${fixed(grid.origin[0])}${fixed(grid.origin[1])}${fixed(grid.origin[2])}\n`,
        `${count(n1)}${fixed(s)}${fixed(0)}${fixed(0)}\n${count(n2)}${fixed(0)}${fixed(s)}${fixed(0)}\n${count(n3)}${fixed(0)}${fixed(0)}${fixed(s)}\n`,
        atoms.map(a => `${count(a.Z)}${fixed(a.Z)}${fixed(a.position[0])}${fixed(a.position[1])}${fixed(a.position[2])}\n`).join(''),
    ];
    let index = 0;
    for (let i = 0; i < n1; i++) {
        const rows: string[] = [];
        for (let j = 0; j < n2; j++) {
            let line = '';
            for (let k = 0; k < n3; k++) {
                line += formatCubeValue(grid.values[index++]);
                if (k % 6 === 5 || k === n3 - 1) { rows.push(line); line = ''; }
            }
        }
        chunks.push(`${rows.join('\n')}\n`);
    }
    return chunks;
}

/** The drawn field, re-sampled exactly as the mesh worker sampled it. */
export function fieldCubeGrid(source: AnalyticFieldSource, resolution: number): CubeGrid {
    const field = sampleFieldSource(source, resolution);
    return { shape: [field.side, field.side, field.side], origin: [field.origin, field.origin, field.origin], spacing: field.step, values: field.samples };
}

/** Built directly: the profile's own grid, whatever its point count. */
function gridOf(curve: RadialCurveOnGrid): RadialGrid {
    const r = Float64Array.from({ length: curve.size }, (_, j) => curve.rMin * Math.exp(j * curve.dx));
    return { r, dx: curve.dx, size: curve.size, rMin: curve.rMin, rMax: r[curve.size - 1] };
}

export const RADIAL_CUBE_FRACTION = 0.999;

export function radiusEnclosing(curve: RadialCurveOnGrid, fraction: number): number {
    const grid = gridOf(curve);
    const running = cumulativeIntegral(grid, Float64Array.from(curve.D));
    const total = running[grid.size - 1];
    for (let j = 0; j < grid.size; j++) if (running[j] >= fraction * total) return grid.r[j];
    return grid.rMax;
}

/**
 * ρ(r) = D(r)/(4πr²) of a spherically averaged atom, on a cube enclosing
 * 99.9 % of it. Features finer than the spacing (a heavy atom's 1s) are not
 * resolved by any uniform grid; the description line says so.
 */
export function radialDensityCubeGrid(curve: RadialCurveOnGrid, resolution: number): CubeGrid {
    const grid = gridOf(curve);
    const D = Float64Array.from(curve.D);
    const halfWidth = radiusEnclosing(curve, RADIAL_CUBE_FRACTION);
    const side = resolution + 1;
    const step = (2 * halfWidth) / resolution;
    const values = new Float32Array(side * side * side);
    let index = 0;
    for (let i = 0; i < side; i++) {
        const x = -halfWidth + i * step;
        for (let j = 0; j < side; j++) {
            const y = -halfWidth + j * step;
            for (let k = 0; k < side; k++) {
                const z = -halfWidth + k * step;
                const r = Math.max(Math.hypot(x, y, z), grid.rMin);
                values[index++] = interpolateOnGrid(grid, D, r) / (4 * Math.PI * r * r);
            }
        }
    }
    return { shape: [side, side, side], origin: [-halfWidth, -halfWidth, -halfWidth], spacing: step, values };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/export/cube.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/export/cube.ts tests/export/cube.test.ts
git commit -m "feat(export): Gaussian cube encoder, drawn-field and radial-density grids

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The cube file, built in a worker

**Files:**
- Create: `src/export/cube_request.ts`, `src/workers/exportWorker.ts`, `src/workers/createExportWorker.ts`
- Modify: `src/export/run_export.ts`, `src/App.tsx`, `src/App.test.tsx` (mock the factory)
- Test: `tests/export/cube_request.test.ts`, `tests/export/run_export.test.ts`

**Interfaces:**
- Consumes: Task 12; `hydrogenicSource`; `ORBITAL_RESOLUTION`; `ATOM_METHOD`, `methodStatement`, `viewDescription`.
- Produces: `type CubeRequest = { type: 'fieldCube'; source: AnalyticFieldSource; resolution: number; atoms: CubeAtom[]; title: string; description: string; requestId: number } | { type: 'radialCube'; curve: RadialCurveOnGrid; resolution: number; atoms; title; description; requestId }`; `type CubeResponse = { type: 'success'; blob: Blob; requestId } | { type: 'error'; message: string; requestId }`; `type CubeJob = WithoutRequestId<CubeRequest>`; `buildCubeBlob(request): Blob`; `interface CubeWorkerHandle`; `requestCube(job, createWorker): Promise<Blob>`; `cubeJobFor(state): CubeJob`; `cubeReason(state): string | null`. `ExportKind` gains `'cube'`; `ExportContext` gains `createCubeWorker?: () => CubeWorkerHandle`; `createExportWorker(): Worker`.

- [ ] **Step 1: Write the failing tests**

`tests/export/cube_request.test.ts`:

```ts
import { buildCubeBlob, requestCube, cubeJobFor, cubeReason, CubeWorkerHandle, CubeRequest } from '../../src/export/cube_request';
import { drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { setCombination, startOrbitalCalculation, startFieldCalculation, finishOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { fieldRequestFor } from '../../src/combinations';
import { makeStore, neonStore, readText } from './fixtures';

function fakeWorker(reply: (request: CubeRequest) => unknown): CubeWorkerHandle & { terminate: jest.Mock } {
    const worker = {
        onmessage: null, onerror: null, terminate: jest.fn(),
        postMessage(request: CubeRequest) { setTimeout(() => worker.onmessage?.({ data: reply(request) } as MessageEvent)); },
    } as CubeWorkerHandle & { terminate: jest.Mock };
    return worker;
}

describe('cube requests', () => {
    it('builds a cube blob from a radial job', async () => {
        const job = cubeJobFor(neonStore().getState());
        expect(job.type).toBe('radialCube');
        const text = await readText(buildCubeBlob({ ...job, resolution: 8, requestId: 1 } as CubeRequest));
        expect(text.split('\n')[0]).toBe('electron-orbital-viewer: Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(text.split('\n')[1]).toMatch(/^rho\(r\) = D\(r\)\/\(4 pi r\^2\), total electron density/);
        expect(text.split('\n')[6].trim().split(/\s+/)).toEqual(['10', '10.000000', '0.000000', '0.000000', '0.000000']);
    });

    it('takes the subshell\'s curve at the shell level when one is isolated', () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        expect(cubeJobFor(store.getState())).toMatchObject({ type: 'radialCube', description: expect.stringContaining('n = 2 shell') });
        store.dispatch(drillToSubshell(2, 1));
        expect(cubeJobFor(store.getState())).toMatchObject({ description: expect.stringContaining('2p subshell') });
    });

    it('re-samples the drawn orbital for Basic Orbitals, and refuses an overlay', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(cubeReason(store.getState())).toBe('Nothing is drawn yet.');
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        expect(cubeReason(store.getState())).toBe('The surface is still being computed.');
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
        expect(cubeReason(store.getState())).toBeNull();
        expect(cubeJobFor(store.getState())).toMatchObject({ type: 'fieldCube', resolution: 128, atoms: [{ Z: 1, position: [0, 0, 0] }] });
        const sp3All = { kind: 'hybrid', hybrid: 'sp3', member: 'all' } as const;
        store.dispatch(setCombination(sp3All));
        store.dispatch(startFieldCalculation(fieldRequestFor(sp3All, 0.9)!));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
        expect(cubeReason(store.getState())).toMatch(/pick one member/);
    });

    it('round-trips through a worker, and terminates it either way', async () => {
        const ok = fakeWorker(request => ({ type: 'success', blob: new Blob(['cube']), requestId: request.requestId }));
        expect((await requestCube(cubeJobFor(neonStore().getState()), () => ok)).size).toBe(4);
        expect(ok.terminate).toHaveBeenCalled();
        const bad = fakeWorker(request => ({ type: 'error', message: 'out of memory', requestId: request.requestId }));
        await expect(requestCube(cubeJobFor(neonStore().getState()), () => bad)).rejects.toThrow('out of memory');
        expect(bad.terminate).toHaveBeenCalled();
    });
});
```

Append to `tests/export/run_export.test.ts`:

```ts
describe('runExport: cube', () => {
    it('asks the worker for the cube and names it .cube', async () => {
        const worker = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null, terminate: jest.fn(),
            postMessage(request: { requestId: number }) { setTimeout(() => worker.onmessage?.({ data: { type: 'success', blob: new Blob(['c']), requestId: request.requestId } } as MessageEvent)); } };
        const result = await runExport('cube', { ...baseContext(neonStore().getState()), createCubeWorker: () => worker });
        expect(result.filename).toBe('orbital-viewer_Ne_atom.cube');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/export/cube_request.test.ts tests/export/run_export.test.ts`
Expected: FAIL — cannot find `../../src/export/cube_request`.

- [ ] **Step 3: Implement**

`src/export/cube_request.ts`:

```ts
import type { RootState } from '../store';
import { AnalyticFieldSource, hydrogenicSource } from '../field_source';
import { ORBITAL_RESOLUTION } from '../orbital_presets';
import { subshellLabel } from '../atom/configurations';
import { CubeAtom, RadialCurveOnGrid, encodeCube, fieldCubeGrid, radialDensityCubeGrid } from './cube';
import { ATOM_METHOD, methodStatement, viewDescription } from './caption';

interface CubeMeta { atoms: CubeAtom[]; title: string; description: string; requestId: number; }
export type CubeRequest =
    | ({ type: 'fieldCube'; source: AnalyticFieldSource; resolution: number } & CubeMeta)
    | ({ type: 'radialCube'; curve: RadialCurveOnGrid; resolution: number } & CubeMeta);
export type CubeResponse =
    | { type: 'success'; blob: Blob; requestId: number }
    | { type: 'error'; message: string; requestId: number };

type WithoutRequestId<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export type CubeJob = WithoutRequestId<CubeRequest>;

export function buildCubeBlob(request: CubeRequest): Blob {
    const grid = request.type === 'fieldCube'
        ? fieldCubeGrid(request.source, request.resolution)
        : radialDensityCubeGrid(request.curve, request.resolution);
    return new Blob(encodeCube(grid, request.atoms, request.title, request.description), { type: 'chemical/x-cube' });
}

/** Why there is no cube to write yet, or null. */
export function cubeReason(state: RootState): string | null {
    if (state.atom.mode === 'atom' && state.atom.level !== 'orbital') {
        return state.atom.profile ? null : 'Waiting for the atom to finish solving.';
    }
    const { currentParams, currentField, isLoading } = state.orbital;
    if (!currentParams && !currentField) return 'Nothing is drawn yet.';
    if (isLoading) return 'The surface is still being computed.';
    if (currentField && currentField.sources.length !== 1) {
        return 'An overlay is several fields in one picture; pick one member to export its grid.';
    }
    return null;
}

/** What the view shows, as a cube job: the drawn ψ, or ρ(r) of what the cut face shows. */
export function cubeJobFor(state: RootState): CubeJob {
    const title = `electron-orbital-viewer: ${viewDescription(state)}`;
    const atom = state.atom;
    if (atom.mode === 'atom' && atom.level !== 'orbital' && atom.profile) {
        const profile = atom.profile;
        const sub = atom.selectedSubshell;
        const subshell = atom.level === 'shell' && sub ? profile.subshells.find(s => s.n === sub.n && s.l === sub.l) : undefined;
        const shell = atom.level === 'shell' ? profile.shells.find(s => s.n === atom.selectedShell) : undefined;
        const what = subshell ? `${subshellLabel(subshell.n, subshell.l)} subshell` : shell ? `n = ${shell.n} shell` : 'total';
        return {
            type: 'radialCube',
            curve: { D: subshell?.curve ?? shell?.curve ?? profile.total, rMin: profile.rMin, dx: profile.dx, size: profile.size },
            resolution: ORBITAL_RESOLUTION,
            atoms: [{ Z: profile.Z, position: [0, 0, 0] }],
            title,
            description: `rho(r) = D(r)/(4 pi r^2), ${what} electron density, electrons/bohr^3, box enclosing 99.9%; ${ATOM_METHOD}; lengths in bohr`,
        };
    }
    const { currentParams, currentField } = state.orbital;
    const source = currentField ? currentField.sources[0] : hydrogenicSource(currentParams!);
    const resolution = currentField ? currentField.resolution : currentParams!.resolution;
    const Z = currentParams?.Z ?? 1;
    return {
        type: 'fieldCube', source, resolution, atoms: [{ Z, position: [0, 0, 0] }], title,
        description: `psi(x,y,z), real, bohr^-3/2, on the grid as drawn; ${methodStatement(state)}; lengths in bohr`,
    };
}

export interface CubeWorkerHandle {
    postMessage(message: CubeRequest): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<CubeResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
}

let nextRequestId = 0;

/** One worker per file: a cube is rare, and the worker's memory goes with it. */
export function requestCube(job: CubeJob, createWorker: () => CubeWorkerHandle): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const worker = createWorker();
        const requestId = ++nextRequestId;
        worker.onmessage = event => {
            worker.terminate();
            if (event.data.type === 'success') resolve(event.data.blob);
            else reject(new Error(event.data.message));
        };
        worker.onerror = event => {
            worker.terminate();
            reject(new Error(event.message || 'The cube file could not be built.'));
        };
        worker.postMessage({ ...job, requestId } as CubeRequest);
    });
}
```

`src/workers/exportWorker.ts`:

```ts
import { buildCubeBlob, CubeRequest } from '../export/cube_request';

// See orbitalWorker.ts for why the scope is described rather than typed as WebWorker.
interface WorkerScope {
    onmessage: ((event: MessageEvent<CubeRequest>) => void) | null;
    postMessage(message: unknown): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
    const { requestId } = event.data;
    try {
        scope.postMessage({ type: 'success', blob: buildCubeBlob(event.data), requestId });
    } catch (error) {
        scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The cube file could not be built.', requestId });
    }
};
```

`src/workers/createExportWorker.ts`:

```ts
/** Isolated for the reason given in createOrbitalWorker.ts: import.meta.url, which Jest cannot parse. */
export function createExportWorker(): Worker {
    return new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });
}
```

`src/export/run_export.ts`: `ExportKind` gains `'cube'`; last item `{ kind: 'cube', label: 'Field grid (Gaussian cube)', detail: 'the sampled ψ or ρ, in bohr — for VMD, VESTA, Avogadro' }`; `ExportContext` gains `createCubeWorker?: () => CubeWorkerHandle`; availability `cube: cubeReason(state)`; case:

```ts
        case 'cube': {
            if (!context.createCubeWorker) throw new Error('The cube worker is not available.');
            return { blob: await requestCube(cubeJobFor(context.state), context.createCubeWorker), filename: `${stem}.cube` };
        }
```

`src/App.tsx`: add `createCubeWorker: createExportWorker as unknown as () => CubeWorkerHandle` to the `runExport` context (a DOM `Worker`'s `onmessage` is typed with `this`; the cast states that it satisfies the handle structurally).

`src/App.test.tsx`: next to the `createAtomWorker` mock add

```ts
jest.mock('./workers/createExportWorker', () => ({ createExportWorker: jest.fn() }));
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/export src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Live verification, desktop 1440x900**

1. Basic Orbitals 2p_z → Export → *Field grid (Gaussian cube)*. "Preparing export…" shows; drag the view while it builds — it keeps rotating (worker, not main thread). `orbital-viewer_H_basic_n2_l1_ml0.cube` (~28 MB). `head -7` shows two ASCII comment lines, `    1` atom, three axis lines of 129 points, `    1    1.000000 …`. Count: `python3 -c "import sys;t=open(sys.argv[1]).read().split('\n');print(sum(len(l.split()) for l in t[7:]))" ~/Downloads/orbital-viewer_H_basic_n2_l1_ml0.cube` prints 2146689 (129³). If VESTA or Avogadro is installed, open it: two lobes along z with opposite sign.
2. Iron whole atom → cube: description line says total electron density and the method. Iron 3d_z² (level 3) → cube of ψ with the atom line `26`.
3. sp³ *All* → the cube item is greyed with "pick one member"; h₁ → available.
4. While Iron is still solving after a reload, the cube item reads "Waiting for the atom to finish solving."

- [ ] **Step 6: Live verification, phone 390x844**

View tab → Export → cube on Basic 2p_z: the notice shows, the UI stays responsive, the file downloads (or the browser offers to save it).

- [ ] **Step 7: Commit**

```bash
git add src/export src/workers/exportWorker.ts src/workers/createExportWorker.ts src/App.tsx src/App.test.tsx tests/export
git commit -m "feat(export): Gaussian cube of the sampled field, built in a worker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Documentation and whole-phase verification

**Files:**
- Modify: `README.md`, `docs/HANDOFF.md`

- [ ] **Step 1: README**

Add a "Share and export" section: the Share button and that the address bar is always the link; the key list from Task 5 with the spec example URL; each export with its format, units and method statement (PNG 2× capped at 4096 px; glTF 20 cm, scale in extras; STL millimetres, watertight or refused; CSV comment lines; cube in bohr, ψ as drawn or ρ(r) for levels 1–2); what is not exported (the cut; the camera distance).

- [ ] **Step 2: HANDOFF**

Under "Decisions that are not obvious from the code", add one bullet each, with the reason from this plan's *Design decisions*: camera direction but not distance in the URL; PNG render-then-read without `preserveDrawingBuffer`; the cube re-sampled in a worker rather than kept per render; exports take the whole surface; Basic Orbitals' selection, fraction and combination live in the store, and render through `basicRenderNonce`; a link's view waits in `pendingView`, its cut in `pendingCut`. Under "Process notes": how a later phase adds URL keys (`registerUrlKeys(mode, …)` for a new mode, or extend the built-in group, plus a case in `tests/url_state.test.ts`'s property test).

- [ ] **Step 3: Whole suite, types, build**

Run: `npx jest` (about a minute), then `npx tsc --noEmit -p .`, then `npm run build`.
Expected: all green; the build emits a separate chunk for `GLTFExporter` and one for `exportWorker`.

- [ ] **Step 4: End-to-end live pass**

At 1440x900 and at 390x844 with touch (and 844x390): for Carbon (whole atom), Iron (3d_z², cut X 50 %, opacity 80 %, rotated), Neon 2p subshell, Basic 4f_z³, Basic sp³ h₂ and Basic field n = 2 *Both*: Share → open in a new tab → identical view; export PNG, glTF, STL (where offered), CSV and cube; every greyed item states its reason. Console free of errors throughout.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/HANDOFF.md
git commit -m "docs: share and export — keys, formats, units and the decisions behind them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Deploy (`./infra/deploy.sh`) only with the owner's go-ahead.

---

## Self-review

- **Spec coverage.** Share copies a URL restoring the exact view → Tasks 4–7. "each mode registers its keys", API names verbatim → Task 4 (Phase 4's `rel` fits `encodeAtomKeys`/`decodeAtomKeys` in the same file, test in `tests/url_state.test.ts`). Unknown/invalid keys ignored → Tasks 4–5. PNG 2×, with or without overlays → Task 9. glTF, colours kept → Task 11. STL watertight, millimetres, chosen scale → Task 10. CSV of the radial curves → Task 8. Cube of the sampled field → Tasks 12–13. Validation: round-trip property over every mode and level (atom, shell, subshell, orbital, basic, hybrid, field) → Task 5; STL manifold check on real surfaces → Task 10; cube format rules (header, bohr, values) → Task 12. Principles: method stated (caption, CSV, cube, glTF extras), failures shown (availability reasons, STL refusal, Phase 1's field refusal reachable by URL), worker for heavy work, layout contract (Controls slot).
- **Placeholders.** None; the one conditional (Phase 1's `createFieldOverlayGroup` location) names the exact line to change.
- **Type consistency.** `ExportKind` grows `csv` → `png | png-plain` → `stl` → `glb` → `cube`, with `EXPORT_ITEMS`, `exportAvailability` and `runExport` extended in the same task each time; `ExportContext`'s later fields are optional so earlier tests stay valid. `basicOrbitalParams(n, l, ml, fraction)` is Phase 1's positional signature throughout. `ViewerExportHandle` gains `collectSurfaces` in Task 10, which Task 9's run_export test already supplies.
- **Review Focus.** Each of the five has its test in the owning task (Tasks 5, 3/5, 5, 10/11/13, 7).
