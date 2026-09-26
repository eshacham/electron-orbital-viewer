# Phase 6 — Molecule Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth mode, **Molecules**, with a searchable, categorised library of 25 molecules, each showing ball-and-stick geometry (lengths and angles on hover), the total-density isosurface, the electrostatic potential mapped on it, any molecular orbital from a list with energies, and the dipole arrow, all validated against published values.

**Architecture:** An offline PySCF pipeline (`tools/molecules/build_library.py`, extending Phase 5's `generate.py`) writes the spec §4.2 files per molecule: a voxel-averaged density grid, a coarse ESP grid, Phase 5's basis JSON and a `meta.json` carrying geometry, dipole vector, orbital table and references. The client lazy-loads them through Phase 5's loader; the density grid is meshed in a worker by Phase 1's `generateFieldMesh` and drawn by the existing mesh path with optional per-vertex ESP colours; MOs go through Phase 1's `updateFieldInScene` as `gaussianMO` sources; ball-and-stick and the dipole arrow are a separate overlay group that survives surface changes.

**Tech Stack:** TypeScript, React 19, MUI 7, three.js 0.176, Redux Toolkit, Vite, Jest + ts-jest; Python 3, PySCF 2.x, geomeTRIC, NumPy, pytest.

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` (§3, §4.1, §4.2 binding; §5 Phase 6 is the requirement).

## Global Constraints

- **Every number states its method** (§3.1): each length, angle, dipole, orbital energy and ESP value on screen carries its source in a caption (`meta.geometrySource`, `meta.method.density`).
- **Validated before shipped** (§3.2), verbatim: "Geometries within 0.01 Å / 1° of the stated source; dipoles within 10 % of experiment (water 1.85 D, ammonia 1.47 D); HOMO–LUMO ordering matches the stated method; densities integrate to the electron count within 0.5 %." Rows go into Phase 1's validation table.
- **Failures are shown, not hidden** (§3.5): a missing file, a bad URL id or a failed mesh is an explicit message, never a stale or blank picture.
- **The existing renderer is the renderer** (§3.6): marching cubes via `generateFieldMesh`, the cut-away caps, opacity, the enclosed-fraction contour.
- **Performance** (§3.7): under 1.5 s on a 2020 laptop, under 4 s on a mid-range phone; meshing in a worker.
- **Layout contract** (§3.8): desktop navigation in `.side-panel` (left), view settings and plot in `.view-panel` (right); phone `.phone-header` plus `PhoneSheet` tabs Explore / View / Plot. No new floating panel over the canvas (the bottom-centre legend slot `.phase-legend` already exists and is reused).
- **Size:** every `public/molecules/<id>/` directory ≤ **3,000,000 bytes** (§4.2 "under 3 MB"); nothing is fetched until a molecule is chosen (§4.2 "lazy-loaded").
- **Methods:** density, ESP, dipole, orbitals at **B3LYP/def2-TZVP** (PySCF). Geometry from CCCBDB experiment where symmetry fixes it in a few parameters, else B3LYP/def2-TZVP optimised, stated in `meta.geometrySource`. Open-shell NO₂ uses ROKS (one orbital set, a SOMO).
- **Units:** data files in bohr and Hartree (§4.2); UI shows Å (1 bohr = 0.529177210903 Å), degrees, debye, Ha with eV beside it (27.211386 eV/Ha).
- **Grid convention (Phase 1, verbatim):** grid sources are a centred cube — same points per axis, origin = −half-width — values z-fastest, `index = (i * shape[1] + j) * shape[2] + k`; `generateFieldMesh(grid, resolution, f)` requires `resolution === shape[0] − 1`.
- **ESP scale:** fixed symmetric ±0.05 Ha/e (±31.4 kcal/mol) for every molecule, on the ρ = 0.001 e/a₀³ surface; diverging red (negative) / white / blue (positive). Justification in Task 9.
- **Dependencies from other phases, exact names** (Task 1 checks them all):
  - Phase 1: `src/field_source.ts` — `AnalyticFieldSource`, `GridFieldSource`, `FieldSource`, `FieldRecipe`, `FieldRenderRequest { sources: AnalyticFieldSource[]; colors: string[]; resolution: number; enclosedFraction: number; label: string }`; `src/orbital_mesh.ts` — `generateFieldMesh(source: FieldSource, resolution: number, enclosedFraction: number): MeshData`; `src/orbital_visualizer.ts` — `updateFieldInScene(context, request: FieldRenderRequest, showAxes?: boolean): Promise<RenderOutcome>`, `updateSceneWithMeshData(context, meshData, crossFadeFromShellView?)` (Phase 1 drops its `params` argument); `src/validation/references.ts` — `ValidationRow { phase: number; quantity: string; system: string; app: number; reference: number; unit: string; tolerancePercent: number; referenceSource: string; method: string }`, `VALIDATION`, `relativeErrorPercent(row)`; per-phase rows live in `src/validation/phaseN.ts` as `PHASE_N_ROWS` and are spread into `VALIDATION`.
  - Phase 2: `src/url_state.ts` — `encodeState(): string`, `applyState(hash: string): void`, `registerUrlKeys(mode: string, encoder: (state: RootState) => Record<string, string>, decoder: (params: URLSearchParams, dispatch: AppDispatch) => void)`; its `URL_MODE: Record<ViewMode, string>` names each mode in the URL, and a mode's own decoder dispatches `setMode`. The enclosed fraction (`orbital.enclosedFraction`, key `frac`) is Phase 2's shared key; this phase registers only molecule-owned keys.
  - Phase 5: `src/molecules/loader.ts` — `loadMoleculeIndex(): Promise<MoleculeIndexEntry[]>`, `loadMoleculeMeta(id): Promise<MoleculeMeta>`, `loadDensityGrid(meta): Promise<GridFieldSource>`, `loadBasis(id)`; `src/molecules/types.ts` — `MoleculeMeta` (§4.2 shape), `MoleculeIndexEntry { id, name, formula, category, tags }`; `FieldRecipe` variant `{ type: 'gaussianMO'; moleculeId: string; index: number }`, drawable through `updateFieldInScene` (§4.1: "the worker rebuilds the evaluator from it"); `src/components/MoDiagram.tsx` (default export); `ViewMode` includes `'bonds'`; `tools/molecules/generate.py` exposing `basis_json(mol, mf) -> dict` (the basis.json payload `loadBasis` reads); `public/molecules/index.json`.
  - **Reconciled against the written Phase 5 plan (2026-09-25).** The loader, type, `basis_json` and `MoDiagram` names above match it exactly (`MoDiagram` props are `{ orbitals, selectedIndex, onSelect?(index), footer?, width? }`). Three differences to resolve in Task 1's contract check rather than by editing Phase 5: (a) Phase 5's `src/molecules/types.ts` already exports `MoleculeAtom`, `GridSpec` and `MOLECULES_BASE_URL = '/molecules'` (and `decodeFloat32` for gzip grids) — import those instead of redefining them in `library_types.ts` / `binary.ts`, and keep only the library-specific types there. (b) Phase 5 draws densities at fixed iso-values (`FieldRenderRequest.densityIsoValue`, `generateIsoValueMesh`) because a point-sampled grid mis-integrates core cusps; this plan's voxel-averaged grid and `enclosedFractionForDensity` fix that for the library. Use the voxel-averaged grid for library molecules, keep Phase 5's iso-value path for the bond scans, and make the ESP surface (fixed ρ = 0.001) use `generateIsoValueMesh`. (c) Phase 5 adds a `'gaussianDensity'` recipe (evaluates √ρ from the basis); use it wherever this plan would otherwise need a density evaluator.
- Data URLs are `/molecules/<id>/…` (Vite root is `public/`, base `/`).
- **No new npm dependencies.** Python: add `geometric` to `tools/molecules/requirements.txt` (Phase 5's file).
- British spelling in UI copy and comments; comments explain *why*, in the register of `src/radial_distribution.ts`.
- TDD every task. TS: `npx jest <path>`, `npx tsc --noEmit -p .`. Python: `pytest tools/molecules -q` (fast; recomputation tests gated behind `MOLECULES_SLOW=1`). Never run the full Jest suite until Task 17.
- **Foreground only.** Every command, including the long PySCF runs, runs in the foreground with the Bash tool's 600000 ms timeout; long jobs are chunked (one molecule, or a few optimisation steps, per call) so no call exceeds ~8 minutes.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Live verification: the dev server at http://localhost:5391 (`npx vite --port 5391 --strictPort` if it is not up; never a second one). Desktop **1440×900**, phone **390×844** with touch emulation. Check `.side-panel` / `.view-panel` on desktop, `.phone-header` and the Explore / View / Plot tabs on the phone, and zero console errors.

## Review Focus

1. **Grid bytes already un-gzipped by the host.** S3/CloudFront or a proxy may serve `*.bin.gz` with `Content-Encoding: gzip`, so the browser hands over raw floats and `DecompressionStream` throws. Expect the loader to detect the missing gzip magic and use the bytes as they are. Test: Task 8, "passes through bytes that are not gzip".
2. **Python and TypeScript disagreeing on axis order.** A transposed grid still renders a plausible surface with the ESP colours on the wrong side, which is worse than a crash. Expect a value written at (i, j, k) in Python to be read at (i, j, k) in TS. Test: shared fixture `tests/fixtures/molecules/axis_order.bin.gz`, written in Task 4, read in Task 8.
3. **Switching molecules or surfaces while a mesh is in flight.** Expect never to see molecule A's surface under molecule B's sticks, and re-picking the same molecule to reload rather than hang. Tests: Task 15, "a superseded mesh is never presented"; Task 12, `loadNonce`.
4. **The 0.001 surface cut off by the box.** Too tight a box clips the ESP surface flat against the cube wall and leaks density off the grid. Expect the build to refuse. Tests: Task 6, `check_box`; Task 7, "density vanishes at the box faces".
5. **Symmetric molecules and degenerate orbitals.** CH₄ or SF₆ must show no dipole arrow (a 0.002 D noise vector would point somewhere random), and all members of a degenerate HOMO set (CH₄ t₂, benzene e₁g) carry the HOMO mark. Tests: Task 10, "no arrow below 0.05 D"; Task 5, "all three CH₄ HOMOs are marked".

---

## Design decisions (read before Task 1)

**Geometry sources.** Built exactly from the parameters below (Task 2). Values are CCCBDB experimental geometries; Task 7 Step 1 re-reads each against CCCBDB before the first build.

| id | molecule | category (+ tags) | geometry | parameters (Å, °) | μ reference (D) |
| --- | --- | --- | --- | --- | --- |
| h2o | Water | first-examples (polarity, hybridisation) | experiment | O–H 0.958, H–O–H 104.5 | 1.855 |
| nh3 | Ammonia | first-examples (polarity, hybridisation) | experiment | N–H 1.012, H–N–H 106.7 | 1.471 |
| ch4 | Methane | first-examples (hybridisation) | experiment | C–H 1.087, Td 109.47 | 0 (symmetry) |
| co2 | Carbon dioxide | first-examples (polarity) | experiment | C=O 1.160, linear | 0 |
| c2h2 | Acetylene | hybridisation (sp) | experiment | C≡C 1.203, C–H 1.063 | 0 |
| c2h4 | Ethylene | hybridisation (sp2) | experiment | C=C 1.339, C–H 1.087, H–C–H 117.4 | 0 |
| c2h6 | Ethane | hybridisation (sp3) | experiment | C–C 1.535, C–H 1.094, H–C–C 111.2, staggered | 0 |
| hcn | Hydrogen cyanide | hybridisation (polarity, sp) | experiment | H–C 1.065, C≡N 1.153 | 2.985 |
| h2co | Formaldehyde | hybridisation (polarity, sp2) | experiment | C=O 1.205, C–H 1.111, H–C–H 116.1 | 2.332 |
| bf3 | Boron trifluoride | hybridisation (polarity, sp2) | experiment | B–F 1.307, D3h | 0 |
| sih4 | Silane | hybridisation (first-examples) | experiment | Si–H 1.480, Td | 0 |
| sf6 | Sulfur hexafluoride | polarity (hybridisation) | experiment | S–F 1.561, Oh | 0 |
| o3 | Ozone | polarity (first-examples) | experiment | O–O 1.278, O–O–O 116.8 | 0.53 |
| no2 | Nitrogen dioxide | polarity (radical) | experiment | N–O 1.194, O–N–O 133.9 | 0.316 |
| so2 | Sulfur dioxide | polarity | experiment | S–O 1.431, O–S–O 119.3 | 1.633 |
| ph3 | Phosphine | polarity (hybridisation) | experiment | P–H 1.420, H–P–H 93.3 | 0.574 |
| h2s | Hydrogen sulfide | polarity (hybridisation) | experiment | S–H 1.336, H–S–H 92.1 | 0.97 |
| benzene | Benzene | aromatic | experiment | C–C 1.397, C–H 1.084, D6h | 0 |
| ch3oh | Methanol | polarity (biomolecule-fragments, hybridisation) | B3LYP opt. | plausibility: C–O 1.427, O–H 0.956 | 1.70 |
| hcooh | Formic acid (Z) | polarity (biomolecule-fragments) | B3LYP opt. | C=O 1.202, C–O 1.343; H–O–C=O ≈ 0° | 1.425 |
| ethanol | Ethanol (anti) | polarity (biomolecule-fragments) | B3LYP opt. | C–C 1.512, C–O 1.431; H–O–C–C ≈ 180° | 1.44 (anti conformer) |
| acetone | Acetone | polarity (biomolecule-fragments) | B3LYP opt. | C=O 1.213, C–C 1.520 | 2.88 |
| pyridine | Pyridine | aromatic (polarity) | B3LYP opt. | N–C2 1.338, C2–C3 1.394 | 2.215 |
| formamide | Formamide | biomolecule-fragments (polarity) | B3LYP opt. | C=O 1.212, C–N 1.368 | 3.73 |
| glycine | Glycine (conformer I) | biomolecule-fragments | B3LYP opt. | C–N 1.467, C–C 1.526, C=O 1.205; N–C–C=O ≈ 0° | 1.1 (conformer I) |

The seven optimised molecules need many parameters, or their gas-phase conformer is the point, so they are optimised at the density's own level and flagged. Their experimental parameters are a **plausibility check** at 0.03 Å (B3LYP's usual error is ~0.01 Å); the spec's 0.01 Å / 1° applies to the experimental geometries against CCCBDB.

**Dipole tolerance.** 10 % of experiment, with a floor of 0.05 D (10 % of 0.5 D). Below 0.5 D, 10 % is smaller than basis-set noise (NO₂: ±0.03 D). Zero-by-symmetry molecules must compute |μ| < 0.01 D. If any molecule misses, **do not loosen the tolerance**: stop and ask the owner, offering def2-TZVPD (diffuse functions, which mainly improve dipoles) for that molecule. That is a method change, so it is the owner's decision.

**Voxel-averaged density.** Point samples of ρ on a 0.15–0.2 a₀ grid cannot integrate a nuclear cusp. Neon's 1s decays over 0.05 a₀, and one sample at the nucleus alone would hold ~5 electrons. So each grid value is the **average of ρ over its voxel** (Gauss–Legendre: 2³ points everywhere, 8³ within 1.2 a₀ of a heavy nucleus, 16³ in the voxel holding it). Σ ρᵢ h³ is then the electron count up to the box tail. Near the 0.001 surface this moves values by O(h²ρ″/24), about 2 %, which moves the drawn surface by ~0.01 a₀. Task 4's Ne test shows point sampling is >5 % off and voxel averaging <0.5 % off.

**Box and grid.** Centred cube, half-width = max |atom coordinate| + 5 a₀, so the 0.001 surface (2.5–3.5 a₀ beyond nuclei) is well inside. The build refuses if ρ on any face ≥ 10⁻⁵. Density 96³ (falling back to 88³, 80³ if the directory would exceed 3 MB); ESP on half the points over the same box. Floats are rounded to 10 mantissa bits (relative error ≤ 4.9 × 10⁻⁴) and ρ < 10⁻⁷ is flushed to zero before gzip, roughly halving the files. gzip `mtime=0` makes builds byte-reproducible.

**ESP surface.** ESP maps are conventionally drawn on ρ = 0.001 e/a₀³ (Bader's molecular surface), not on an enclosed-fraction contour: a 90 % contour sits where the nuclei dominate, and every map would read blue. With *Electrostatic potential* selected, the contour is fixed at 0.001. It is realised by converting 0.001 into the enclosed fraction it corresponds to on the grid (`enclosedFractionForDensity`), so `generateFieldMesh` is unchanged. The enclosed-fraction control is disabled, with a note saying why.

**Structure overlay.** Balls are CPK colours (Jmol palette) at 0.4 × the Cordero covalent radius. Sticks join pairs closer than 1.2 × (r_cov,i + r_cov,j) and show connectivity, not bond order, as the caption says. The overlay is not clipped by the cut: the cut exists to see inside the density, and slicing atoms in half helps nothing. The dipole arrow sits at the centre of nuclear charge, 1 a₀ per debye, and points from − to + (IUPAC/physics convention). The caption notes that many textbooks draw the crossed arrow the other way.

**Orbitals.** The list holds all occupied orbitals plus five virtuals, extended to finish a degenerate set. Labels are PySCF irreps in the calculation's abelian subgroup (`labelGroup`), with the full point group (`pointGroup`) stated beside them. Degenerate sets are grouped (|ΔE| < 10⁻⁴ Ha). Roles: HOMO on every member of the highest doubly-occupied set, LUMO on the lowest empty set, SOMO on a singly occupied orbital. Caption: Kohn–Sham energies are not ionisation energies (§3.4).

---

## File Structure

**Offline pipeline — `tools/molecules/` (Python):**

| File | Responsibility |
| --- | --- |
| `conftest.py` | Puts this directory on `sys.path` for tests (create only if Phase 5 has not) |
| `measure.py` | `BOHR_TO_ANGSTROM`, `distance`, `angle`, `dihedral`, `angular_difference`, `measure(reference, coords)` |
| `library.py` | Catalogue: `Reference`, `LibraryMolecule`, `LIBRARY` (25), `by_id`, geometry builders |
| `optimise.py` | Resumable B3LYP optimisation in bounded steps; `geometries/<id>.xyz`; `geometry_for(entry)` |
| `grid.py` | `GridSpec`, `grid_for(coords, points)`, `SURFACE_MARGIN_BOHR` |
| `density.py` | `total_dm`, `eval_density`, `voxel_averaged_density` |
| `compact.py` | `compact_float32`, `write_float32_gz`, `read_float32_gz` |
| `esp.py` | `esp_on_points`, `esp_surface_range` |
| `orbitals.py` | `orbital_labels`, `degeneracy_groups`, `orbital_table` |
| `build_library.py` | One molecule → §4.2 files; `merge_index`; budget guard; validation rows; CLI |
| `tests/test_*.py` | Unit tests (fast) and shipped-data validation |

**Client:**

| File | Responsibility |
| --- | --- |
| `src/molecules/library_types.ts` | `MoleculeAtom`, `MoleculePick`, `MoleculeReference`, `GridSpec`, `LibraryExtras`, `LibraryMoleculeMeta`, `LIBRARY_CATEGORIES`, `asLibraryMeta`, `MOLECULES_BASE_URL` |
| `src/molecules/binary.ts` | `gunzipIfNeeded`, `fetchFloat32Grid` |
| `src/molecules/esp.ts` | `ScalarGrid`, `loadEspGrid`, `sampleTrilinear` |
| `src/molecules/grid_cache.ts` | `getDensityGrid`, `getEspGrid`, `clearGridCache` (3-entry LRU of promises) |
| `src/molecules/esp_color.ts` | ESP constants, colour map, `espVertexColors`, `espLegendGradient`, `enclosedFractionForDensity` |
| `src/molecules/ball_and_stick.ts` | Radii, CPK colours, `detectBonds`, readouts, `buildBallAndStick`, `pickMoleculePart`, `disposeOverlay` |
| `src/molecules/dipole.ts` | `dipoleArrow`, `formatDipole` |
| `src/molecules/grid_mesh_request.ts` | `handleGridMeshRequest` (pure worker body) |
| `src/workers/gridMeshWorker.ts`, `createGridMeshWorker.ts` | Density-grid meshing worker |
| `src/molecules/mesh_worker_client.ts` | `runMeshWorker` |
| `src/molecules/catalogue.ts` | `libraryEntries`, `filterMolecules`, `formatFormula` |
| `src/molecules/orbital_display.ts` | `HARTREE_TO_EV`, `degeneracyCounts`, `formatOrbitalEnergy` |
| `src/molecules/render_plan.ts` | `planMoleculeRender`, `moleculeOrbitalSource`, `MOLECULE_MO_RESOLUTION` |
| `src/molecules/useMoleculeLoader.ts` | Index and meta loading (lazy) |
| `src/molecules/useMoleculeView.ts` | Scene orchestration: surface, overlay, picking |
| `src/molecules/url_keys.ts` | `encodeMoleculeUrl`, `decodeMoleculeUrl`, `registerMoleculeUrlKeys` |
| `src/store/moleculeSlice.ts` | Molecule-mode state |
| `src/validation/phase6.ts`, `molecule_rows.json` | `PHASE_6_ROWS` (generated rows) |
| `src/components/MoleculePicker.tsx`, `MoleculePickerDialog.tsx`, `MoleculeNav.tsx`, `MoleculeOrbitalList.tsx`, `MoleculeReadout.tsx`, `MoleculeViewOptions.tsx`, `EspLegend.tsx` | UI |

**Modified:** `src/orbital_visualizer.ts` (`presentFieldMesh`, `clearFieldMesh`, `setMoleculeOverlay`, `pointerRaycaster`, a `vertexColors` argument on `updateSceneWithMeshData`), `src/store/atomSlice.ts` (`ViewMode` gains `'molecule'`), `src/store/index.ts`, `src/components/OrbitalViewer.tsx`, `src/components/Controls.tsx`, `src/App.tsx`, `src/main.tsx`, `src/style.css`, `src/validation/references.ts`, `tools/molecules/requirements.txt`, `vite.config.ts` (only if Task 1 finds data missing from `dist/`), `README.md`, `docs/HANDOFF.md`.

**Tests:** `tests/molecules/*.test.ts(x)`, `tests/molecules/fixtures.ts`, `tests/fixtures/molecules/axis_order.bin.gz`, `tools/molecules/tests/*.py`.

---

### Task 1: Contracts with Phases 1, 2 and 5

**Files:**
- Create: `tests/molecules/phase_contracts.test.ts`, `tools/molecules/tests/test_phase5_contract.py`, `tools/molecules/conftest.py` (only if absent)
- Modify: `tools/molecules/requirements.txt`, `vite.config.ts` (conditional, Step 5)

**Interfaces:**
- Consumes: every name under "Dependencies from other phases".
- Produces: nothing new. A failure here means a name or shape differs from what this plan assumes. Fix the **uses in this plan's later tasks** (search-and-replace the name), never the other phase's code, and record the mapping in this task's commit message.

- [ ] **Step 1: Write the TS contract (checked by tsc; type-only imports so Jest never loads a worker)**

```ts
// tests/molecules/phase_contracts.test.ts
import type React from 'react';
import type { AnalyticFieldSource, GridFieldSource, FieldSource, FieldRecipe, FieldRenderRequest } from '../../src/field_source';
import type { generateFieldMesh } from '../../src/orbital_mesh';
import type { updateFieldInScene, VisualizerContext, RenderOutcome } from '../../src/orbital_visualizer';
import type { MeshData } from '../../src/types/orbital';
import type { loadMoleculeIndex, loadMoleculeMeta, loadDensityGrid, loadBasis } from '../../src/molecules/loader';
import type { MoleculeMeta, MoleculeIndexEntry } from '../../src/molecules/types';
import type MoDiagram from '../../src/components/MoDiagram';
import type { registerUrlKeys, encodeState, applyState } from '../../src/url_state';
import type { ValidationRow, relativeErrorPercent } from '../../src/validation/references';
import type { ViewMode } from '../../src/store/atomSlice';
import type { RootState, AppDispatch } from '../../src/store';

/** Never called: its body is the contract, and tsc is the checker. */
function contracts(): void {
    const mesh: (source: FieldSource, resolution: number, enclosedFraction: number) => MeshData =
        null as unknown as typeof generateFieldMesh;
    const draw: (context: VisualizerContext | null, request: FieldRenderRequest) => Promise<RenderOutcome> =
        null as unknown as typeof updateFieldInScene;
    const recipe: FieldRecipe = { type: 'gaussianMO', moleculeId: 'h2o', index: 4 };
    const mo: AnalyticFieldSource = { kind: 'analytic', id: 'gaussianMO:h2o:4', recipe, rMax: 6.4 };
    const request: FieldRenderRequest = { sources: [mo], colors: ['#ffffff'], resolution: 95, enclosedFraction: 0.9, label: 'HOMO' };
    const grid: GridFieldSource = { kind: 'grid', id: 'h2o:density', shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, quantity: 'density', values: new Float32Array(8) };
    const row: ValidationRow = { phase: 6, quantity: 'dipole moment', system: 'H2O', app: 1.87, reference: 1.855, unit: 'D', tolerancePercent: 10, referenceSource: 'CRC', method: 'B3LYP/def2-TZVP' };
    const error: (row: ValidationRow) => number = null as unknown as typeof relativeErrorPercent;
    const register: (
        mode: string,
        encoder: (state: RootState) => Record<string, string>,
        decoder: (params: URLSearchParams, dispatch: AppDispatch) => void,
    ) => void = null as unknown as typeof registerUrlKeys;
    const encode: () => string = null as unknown as typeof encodeState;
    const apply: (hash: string) => void = null as unknown as typeof applyState;
    const index: () => Promise<MoleculeIndexEntry[]> = null as unknown as typeof loadMoleculeIndex;
    const meta: (id: string) => Promise<MoleculeMeta> = null as unknown as typeof loadMoleculeMeta;
    const density: (meta: MoleculeMeta) => Promise<GridFieldSource> = null as unknown as typeof loadDensityGrid;
    const basis: (id: string) => Promise<unknown> = null as unknown as typeof loadBasis;
    const entry: MoleculeIndexEntry = { id: 'h2o', name: 'Water', formula: 'H2O', category: 'first-examples', tags: ['polarity'] };
    // The spec §4.2 example, verbatim in shape: Phase 5's type must accept it.
    const spec: MoleculeMeta = {
        id: 'h2o', name: 'Water', formula: 'H2O',
        atoms: [{ Z: 8, position: [0, 0, 0.2217] }],
        geometrySource: 'experiment (CCCBDB)',
        method: { density: 'B3LYP/def2-TZVP', energies: 'CCSD(T)/aug-cc-pVTZ' },
        totalEnergyHartree: -76.4, dipoleDebye: 1.85,
        orbitals: [{ index: 4, label: '1b1', energyHartree: -0.49, occupation: 2, role: 'HOMO' }],
        grid: { shape: [96, 96, 96], origin: [-7, -7, -7], spacing: 0.147 },
        espGrid: { shape: [48, 48, 48], origin: [-7, -7, -7], spacing: 0.294 },
        references: [{ quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook' }],
        generator: { pyscf: '2.x', script: 'tools/molecules/generate.py', commit: 'abc1234' },
    };
    const diagram: React.ComponentProps<typeof MoDiagram> = {
        orbitals: spec.orbitals, selectedIndex: null, onSelect: (_index: number) => undefined, width: 278,
    };
    const bonds: ViewMode = 'bonds';
    void [mesh, draw, request, grid, row, error, register, encode, apply, index, meta, density, basis, entry, diagram, bonds];
}

describe('phase contracts', () => {
    it('is type-checked by tsc; this only proves the file loads', () => {
        expect(typeof contracts).toBe('function');
    });
});
```

- [ ] **Step 2: Write the Python contract**

```python
# tools/molecules/tests/test_phase5_contract.py
import json

from pyscf import gto, scf


def test_generate_exposes_basis_json():
    import generate
    mol = gto.M(atom='H 0 0 0; H 0 0 0.74', basis='sto-3g', verbose=0)
    mf = scf.RHF(mol).run()
    payload = generate.basis_json(mol, mf)
    assert isinstance(payload, dict) and payload
    json.dumps(payload)


def test_geometric_is_installed():
    import geometric  # noqa: F401  (geometry optimisation, Task 3)
```

If `tools/molecules/conftest.py` does not exist, create it:

```python
# tools/molecules/conftest.py
import pathlib
import sys

# Tests import the pipeline's modules by bare name, as the scripts themselves do.
sys.path.insert(0, str(pathlib.Path(__file__).parent))
```

Append `geometric>=1.0` to `tools/molecules/requirements.txt`, then `pip install -r tools/molecules/requirements.txt` in Phase 5's environment.

- [ ] **Step 3: Run both**

Run: `npx tsc --noEmit -p . && npx jest tests/molecules/phase_contracts.test.ts && pytest tools/molecules/tests/test_phase5_contract.py -q`
Expected: tsc clean, 1 Jest test and 2 pytest tests pass. On a tsc error, apply the rule in **Interfaces** above and rerun until clean.

- [ ] **Step 4: Check the data ships in a build**

Run: `npm run build && test -f dist/molecules/index.json && echo SHIPPED`
Expected: `SHIPPED`. If so, skip to Step 6.

- [ ] **Step 5 (only without `SHIPPED`): copy `public/molecules` into `dist/`**

With `root: 'public'`, Vite's `publicDir` is `public/public`, so nothing in `public/molecules` is copied. Add this to `vite.config.ts`:

```ts
import { cpSync, existsSync } from 'fs';
import type { Plugin } from 'vite';

/** Vite's root is public/, so its publicDir (public/public) is empty; the molecule data is copied as it stands. */
function copyMoleculeData(): Plugin {
    return {
        name: 'copy-molecule-data',
        apply: 'build',
        closeBundle() {
            const from = resolve(__dirname, 'public/molecules');
            if (existsSync(from)) cpSync(from, resolve(__dirname, 'dist/molecules'), { recursive: true });
        },
    };
}
```

Then set `plugins: [react(), copyMoleculeData()]` and rerun Step 4 until it prints `SHIPPED`.

- [ ] **Step 6: Commit**

```bash
git add tests/molecules/phase_contracts.test.ts tools/molecules/tests/test_phase5_contract.py tools/molecules/conftest.py tools/molecules/requirements.txt vite.config.ts
git commit -m "test(molecules): pin the Phase 1/2/5 interfaces the molecule library builds on

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The catalogue — 25 molecules, their geometries and references

**Files:**
- Create: `tools/molecules/measure.py`, `tools/molecules/library.py`, `tools/molecules/tests/test_library.py`

**Interfaces:**
- Produces: `measure.BOHR_TO_ANGSTROM`; `distance(p, q)`, `angle(p, vertex, q)`, `dihedral(a, b, c, d)`, `angular_difference(a, b)`, `measure(ref, coords_angstrom) -> float`. `library.CATEGORIES`, `EXPERIMENT`, `OPTIMISED`, `Reference(quantity, value, unit, source, tolerance, atoms=(), label='')`, `LibraryMolecule(id, name, formula, category, tags, geometry_source, atoms=(), zmatrix='', spin=0, references=())` with `.optimised`, `LIBRARY: tuple[LibraryMolecule, ...]`, `by_id(id)`. Atom indices in references follow the order in `atoms` / `zmatrix`, which PySCF preserves.

- [ ] **Step 1: Write the failing tests**

```python
# tools/molecules/tests/test_library.py
import pytest

from library import CATEGORIES, LIBRARY, OPTIMISED, by_id
from measure import angle, dihedral, measure

SPEC_IDS = {'h2o', 'nh3', 'ch4', 'co2', 'c2h2', 'c2h4', 'c2h6', 'hcn', 'h2co', 'ch3oh', 'hcooh', 'bf3', 'sf6',
            'benzene', 'pyridine', 'formamide', 'glycine', 'ethanol', 'acetone', 'o3', 'no2', 'so2', 'ph3', 'h2s', 'sih4'}
OPTIMISED_IDS = {'ch3oh', 'hcooh', 'pyridine', 'formamide', 'glycine', 'ethanol', 'acetone'}


def test_the_spec_list_exactly():
    ids = [m.id for m in LIBRARY]
    assert len(ids) == len(set(ids)) == 25
    assert set(ids) == SPEC_IDS


def test_every_category_has_a_primary_member_and_categories_are_known():
    assert {m.category for m in LIBRARY} == set(CATEGORIES)


def test_exactly_the_seven_are_optimised_and_have_a_start():
    assert {m.id for m in LIBRARY if m.optimised} == OPTIMISED_IDS
    for m in LIBRARY:
        assert (m.zmatrix or m.atoms), m.id
        assert m.geometry_source == OPTIMISED or m.atoms, m.id


@pytest.mark.parametrize('entry', [m for m in LIBRARY if not m.optimised], ids=lambda m: m.id)
def test_experimental_geometries_reproduce_their_parameters(entry):
    coords = [xyz for _, xyz in entry.atoms]
    for ref in entry.references:
        if ref.quantity in ('bond', 'angle'):
            assert measure(ref, coords) == pytest.approx(ref.value, abs=1e-6), ref.label


def test_symmetric_builders_make_every_equivalent_angle_equal():
    coords = [xyz for _, xyz in by_id('nh3').atoms]
    assert angle(coords[1], coords[0], coords[3]) == pytest.approx(106.7, abs=1e-9)
    assert angle(coords[2], coords[0], coords[3]) == pytest.approx(106.7, abs=1e-9)


def test_dipole_tolerance_is_ten_percent_with_a_floor():
    tol = {m.id: next(r.tolerance for r in m.references if r.quantity == 'dipole') for m in LIBRARY}
    assert tol['h2o'] == pytest.approx(0.1855)
    assert tol['no2'] == pytest.approx(0.05)
    assert tol['ch4'] == pytest.approx(0.01)


def test_dihedral_sign_and_wrap():
    assert dihedral((1, 0, 0), (0, 0, 0), (0, 0, 1), (1, 0, 1)) == pytest.approx(0.0, abs=1e-9)
    assert abs(dihedral((1, 0, 0), (0, 0, 0), (0, 0, 1), (-1, 0, 1))) == pytest.approx(180.0)
```

- [ ] **Step 2: Run to verify they fail**

Run: `pytest tools/molecules/tests/test_library.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'library'`.

- [ ] **Step 3: Implement `measure.py`**

```python
# tools/molecules/measure.py
"""Lengths and angles off Cartesian coordinates, the one place the pipeline and its tests measure geometry."""
import numpy as np

BOHR_TO_ANGSTROM = 0.529177210903


def distance(p, q):
    return float(np.linalg.norm(np.subtract(p, q)))


def angle(p, vertex, q):
    u, v = np.subtract(p, vertex), np.subtract(q, vertex)
    c = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v))
    return float(np.degrees(np.arccos(np.clip(c, -1.0, 1.0))))


def dihedral(a, b, c, d):
    b0, b1, b2 = np.subtract(a, b), np.subtract(c, b), np.subtract(d, c)
    b1 = b1 / np.linalg.norm(b1)
    v = b0 - np.dot(b0, b1) * b1
    w = b2 - np.dot(b2, b1) * b1
    return float(np.degrees(np.arctan2(np.dot(np.cross(b1, v), w), np.dot(v, w))))


def angular_difference(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def measure(ref, coords):
    """The value of a bond, angle or dihedral Reference on these coordinates (Å)."""
    points = [coords[i] for i in ref.atoms]
    if ref.quantity == 'bond':
        return distance(*points)
    if ref.quantity == 'angle':
        return angle(*points)
    if ref.quantity == 'dihedral':
        return dihedral(*points)
    raise ValueError(f'{ref.quantity} is not a geometric quantity')
```

- [ ] **Step 4: Implement `library.py`**

```python
# tools/molecules/library.py
"""
The molecule library of spec Phase 6: what ships, where each geometry comes
from, and what each is checked against (spec §3.1-3.2).

A molecule whose experimental structure symmetry pins down in a few
parameters is built here from CCCBDB's values, exactly. The seven that need
many parameters, or whose gas-phase conformer is the point, are optimised at
the density's own level of theory (optimise.py) and say so. Lengths Å, angles
degrees; Reference.atoms index the order written here, which PySCF keeps.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

CATEGORIES = ('first-examples', 'hybridisation', 'polarity', 'aromatic', 'biomolecule-fragments')
EXPERIMENT = 'experiment (CCCBDB)'
OPTIMISED = 'B3LYP/def2-TZVP optimised (PySCF + geomeTRIC)'
CRC = 'CRC Handbook, via CCCBDB'
PLAUSIBLE = 'experiment (CCCBDB); plausibility check of the optimised geometry'

Atom = tuple[str, tuple[float, float, float]]


@dataclass(frozen=True)
class Reference:
    quantity: str          # 'dipole' | 'bond' | 'angle' | 'dihedral'
    value: float
    unit: str              # 'D' | 'Å' | 'deg'
    source: str
    tolerance: float       # absolute, in `unit`
    atoms: tuple[int, ...] = ()
    label: str = ''


@dataclass(frozen=True)
class LibraryMolecule:
    id: str
    name: str
    formula: str
    category: str
    tags: tuple[str, ...]
    geometry_source: str
    atoms: tuple[Atom, ...] = ()
    zmatrix: str = ''
    spin: int = 0
    references: tuple[Reference, ...] = ()

    @property
    def optimised(self) -> bool:
        return self.geometry_source == OPTIMISED


def dipole(value, source=CRC):
    # 10 % (spec), floored at 0.05 D: below 0.5 D, 10 % is under basis-set noise.
    return Reference('dipole', value, 'D', source, max(0.1 * abs(value), 0.05))


def zero_dipole():
    return Reference('dipole', 0.0, 'D', 'zero by symmetry', 0.01)


def bond(a, b, value, label, source=EXPERIMENT, tolerance=0.01):
    return Reference('bond', value, 'Å', source, tolerance, (a, b), label)


def angle(a, v, b, value, label, source=EXPERIMENT, tolerance=1.0):
    return Reference('angle', value, 'deg', source, tolerance, (a, v, b), label)


def plausible(a, b, value, label):
    return bond(a, b, value, label, PLAUSIBLE, 0.03)


def conformer(a, b, c, d, value, label):
    return Reference('dihedral', value, 'deg', 'conformer check', 15.0, (a, b, c, d), label)


def _p(x, y, z):
    return (float(x), float(y), float(z))


def bent(x, y, r, apex):
    h = math.radians(apex) / 2
    return ((x, _p(0, 0, 0)), (y, _p(0, r * math.sin(h), r * math.cos(h))), (y, _p(0, -r * math.sin(h), r * math.cos(h))))


def pyramidal(x, y, r, apex):
    # Three ligands at polar angle t from -z: cos(apex) = (3 cos²t - 1) / 2.
    cos_t = math.sqrt((2 * math.cos(math.radians(apex)) + 1) / 3)
    sin_t = math.sqrt(1 - cos_t ** 2)
    ligands = tuple((y, _p(r * sin_t * math.cos(2 * math.pi * k / 3), r * sin_t * math.sin(2 * math.pi * k / 3), -r * cos_t))
                    for k in range(3))
    return ((x, _p(0, 0, 0)),) + ligands


def tetrahedral(x, y, r):
    s = r / math.sqrt(3.0)
    return ((x, _p(0, 0, 0)),) + tuple((y, _p(s * a, s * b, s * c)) for a, b, c in ((1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)))


def trigonal_planar(x, y, r):
    return ((x, _p(0, 0, 0)),) + tuple(
        (y, _p(r * math.cos(math.radians(120 * k)), r * math.sin(math.radians(120 * k)), 0)) for k in range(3))


def octahedral(x, y, r):
    return ((x, _p(0, 0, 0)),) + tuple((y, _p(*v)) for v in ((r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)))


def linear(chain):
    return tuple((symbol, _p(0, 0, z)) for symbol, z in chain)


def ethylene(rcc, rch, hch):
    phi, z = math.radians(hch) / 2, rcc / 2
    atoms = [('C', _p(0, 0, z)), ('C', _p(0, 0, -z))]
    for sign in (1, -1):
        for side in (1, -1):
            atoms.append(('H', _p(0, side * rch * math.sin(phi), sign * (z + rch * math.cos(phi)))))
    return tuple(atoms)


def ethane(rcc, rch, hcc):
    t, z = math.radians(180.0 - hcc), rcc / 2
    atoms = [('C', _p(0, 0, z)), ('C', _p(0, 0, -z))]
    for sign, offset in ((1, 0.0), (-1, 60.0)):   # staggered
        for k in range(3):
            phi = math.radians(offset + 120.0 * k)
            atoms.append(('H', _p(rch * math.sin(t) * math.cos(phi), rch * math.sin(t) * math.sin(phi), sign * (z + rch * math.cos(t)))))
    return tuple(atoms)


def formaldehyde(rco, rch, hch):
    h = math.radians(hch) / 2
    return (('C', _p(0, 0, 0)), ('O', _p(0, 0, rco)),
            ('H', _p(0, rch * math.sin(h), -rch * math.cos(h))), ('H', _p(0, -rch * math.sin(h), -rch * math.cos(h))))


def aromatic_ring(ring, rcc, rch):
    """A regular hexagon in the xy plane (side = circumradius); a ring N carries no H."""
    atoms = [(s, _p(rcc * math.cos(math.radians(60 * k)), rcc * math.sin(math.radians(60 * k)), 0)) for k, s in enumerate(ring)]
    atoms += [('H', _p((rcc + rch) * math.cos(math.radians(60 * k)), (rcc + rch) * math.sin(math.radians(60 * k)), 0))
              for k, s in enumerate(ring) if s == 'C']
    return tuple(atoms)


METHANOL = """C
O 1 1.427
H 2 0.956 1 108.9
H 1 1.093 2 106.3 3 180.0
H 1 1.093 2 112.0 3 61.8
H 1 1.093 2 112.0 3 -61.8"""
FORMIC_ACID = """C
O 1 1.202
O 1 1.343 2 124.9
H 3 0.972 1 106.3 2 0.0
H 1 1.097 2 124.1 3 180.0"""
FORMAMIDE = """C
O 1 1.212
N 1 1.368 2 124.7
H 1 1.098 2 122.5 3 180.0
H 3 1.002 1 119.0 2 0.0
H 3 1.002 1 121.0 2 180.0"""
GLYCINE = """N
C 1 1.467
C 2 1.526 1 112.1
O 3 1.205 2 125.1 1 0.0
O 3 1.355 2 111.6 1 180.0
H 5 0.967 3 106.5 2 180.0
H 2 1.093 3 107.4 1 121.9
H 2 1.093 3 107.4 1 -121.9
H 1 1.013 2 110.2 3 57.9
H 1 1.013 2 110.2 3 -57.9"""
ETHANOL = """C
C 1 1.512
O 2 1.431 1 107.8
H 3 0.960 2 108.5 1 180.0
H 2 1.098 3 110.0 1 120.0
H 2 1.098 3 110.0 1 -120.0
H 1 1.093 2 110.5 3 180.0
H 1 1.093 2 110.5 3 60.0
H 1 1.093 2 110.5 3 -60.0"""
ACETONE = """C
O 1 1.213
C 1 1.520 2 121.7
C 1 1.520 2 121.7 3 180.0
H 3 1.090 1 110.0 2 0.0
H 3 1.090 1 110.0 2 120.0
H 3 1.090 1 110.0 2 -120.0
H 4 1.090 1 110.0 2 0.0
H 4 1.090 1 110.0 2 120.0
H 4 1.090 1 110.0 2 -120.0"""

M, E, O = LibraryMolecule, EXPERIMENT, OPTIMISED

LIBRARY: tuple[LibraryMolecule, ...] = (
    M('h2o', 'Water', 'H2O', 'first-examples', ('polarity', 'hybridisation'), E, bent('O', 'H', 0.958, 104.5),
      references=(bond(0, 1, 0.958, 'O–H'), angle(1, 0, 2, 104.5, 'H–O–H'), dipole(1.855))),
    M('nh3', 'Ammonia', 'NH3', 'first-examples', ('polarity', 'hybridisation'), E, pyramidal('N', 'H', 1.012, 106.7),
      references=(bond(0, 1, 1.012, 'N–H'), angle(1, 0, 2, 106.7, 'H–N–H'), dipole(1.471))),
    M('ch4', 'Methane', 'CH4', 'first-examples', ('hybridisation',), E, tetrahedral('C', 'H', 1.087),
      references=(bond(0, 1, 1.087, 'C–H'), angle(1, 0, 2, 109.47, 'H–C–H'), zero_dipole())),
    M('co2', 'Carbon dioxide', 'CO2', 'first-examples', ('polarity',), E, linear((('C', 0.0), ('O', -1.160), ('O', 1.160))),
      references=(bond(0, 1, 1.160, 'C=O'), angle(1, 0, 2, 180.0, 'O=C=O'), zero_dipole())),
    M('c2h2', 'Acetylene', 'C2H2', 'hybridisation', ('sp',), E,
      linear((('C', -0.6015), ('C', 0.6015), ('H', -1.6645), ('H', 1.6645))),
      references=(bond(0, 1, 1.203, 'C≡C'), bond(0, 2, 1.063, 'C–H'), zero_dipole())),
    M('c2h4', 'Ethylene', 'C2H4', 'hybridisation', ('sp2',), E, ethylene(1.339, 1.087, 117.4),
      references=(bond(0, 1, 1.339, 'C=C'), bond(0, 2, 1.087, 'C–H'), angle(2, 0, 3, 117.4, 'H–C–H'), zero_dipole())),
    M('c2h6', 'Ethane', 'C2H6', 'hybridisation', ('sp3',), E, ethane(1.535, 1.094, 111.2),
      references=(bond(0, 1, 1.535, 'C–C'), bond(0, 2, 1.094, 'C–H'), angle(2, 0, 1, 111.2, 'H–C–C'), zero_dipole())),
    M('hcn', 'Hydrogen cyanide', 'HCN', 'hybridisation', ('polarity', 'sp'), E, linear((('H', -1.065), ('C', 0.0), ('N', 1.153))),
      references=(bond(0, 1, 1.065, 'H–C'), bond(1, 2, 1.153, 'C≡N'), dipole(2.985))),
    M('h2co', 'Formaldehyde', 'H2CO', 'hybridisation', ('polarity', 'sp2'), E, formaldehyde(1.205, 1.111, 116.1),
      references=(bond(0, 1, 1.205, 'C=O'), bond(0, 2, 1.111, 'C–H'), angle(2, 0, 3, 116.1, 'H–C–H'), dipole(2.332))),
    M('bf3', 'Boron trifluoride', 'BF3', 'hybridisation', ('polarity', 'sp2'), E, trigonal_planar('B', 'F', 1.307),
      references=(bond(0, 1, 1.307, 'B–F'), angle(1, 0, 2, 120.0, 'F–B–F'), zero_dipole())),
    M('sih4', 'Silane', 'SiH4', 'hybridisation', ('first-examples',), E, tetrahedral('Si', 'H', 1.480),
      references=(bond(0, 1, 1.480, 'Si–H'), zero_dipole())),
    M('sf6', 'Sulfur hexafluoride', 'SF6', 'polarity', ('hybridisation',), E, octahedral('S', 'F', 1.561),
      references=(bond(0, 1, 1.561, 'S–F'), angle(1, 0, 3, 90.0, 'F–S–F'), zero_dipole())),
    M('o3', 'Ozone', 'O3', 'polarity', ('first-examples',), E, bent('O', 'O', 1.278, 116.8),
      references=(bond(0, 1, 1.278, 'O–O'), angle(1, 0, 2, 116.8, 'O–O–O'), dipole(0.53))),
    M('no2', 'Nitrogen dioxide', 'NO2', 'polarity', ('radical',), E, bent('N', 'O', 1.194, 133.9), spin=1,
      references=(bond(0, 1, 1.194, 'N–O'), angle(1, 0, 2, 133.9, 'O–N–O'), dipole(0.316))),
    M('so2', 'Sulfur dioxide', 'SO2', 'polarity', (), E, bent('S', 'O', 1.431, 119.3),
      references=(bond(0, 1, 1.431, 'S–O'), angle(1, 0, 2, 119.3, 'O–S–O'), dipole(1.633))),
    M('ph3', 'Phosphine', 'PH3', 'polarity', ('hybridisation',), E, pyramidal('P', 'H', 1.420, 93.3),
      references=(bond(0, 1, 1.420, 'P–H'), angle(1, 0, 2, 93.3, 'H–P–H'), dipole(0.574))),
    M('h2s', 'Hydrogen sulfide', 'H2S', 'polarity', ('hybridisation',), E, bent('S', 'H', 1.336, 92.1),
      references=(bond(0, 1, 1.336, 'S–H'), angle(1, 0, 2, 92.1, 'H–S–H'), dipole(0.97))),
    M('benzene', 'Benzene', 'C6H6', 'aromatic', (), E, aromatic_ring(('C',) * 6, 1.397, 1.084),
      references=(bond(0, 1, 1.397, 'C–C'), bond(0, 6, 1.084, 'C–H'), zero_dipole())),
    M('ch3oh', 'Methanol', 'CH3OH', 'polarity', ('biomolecule-fragments', 'hybridisation'), O, zmatrix=METHANOL,
      references=(plausible(0, 1, 1.427, 'C–O'), plausible(1, 2, 0.956, 'O–H'), dipole(1.70))),
    M('hcooh', 'Formic acid', 'HCOOH', 'polarity', ('biomolecule-fragments',), O, zmatrix=FORMIC_ACID,
      references=(plausible(0, 1, 1.202, 'C=O'), plausible(0, 2, 1.343, 'C–O'),
                  conformer(3, 2, 0, 1, 0.0, 'H–O–C=O (Z)'), dipole(1.425))),
    M('ethanol', 'Ethanol', 'C2H5OH', 'polarity', ('biomolecule-fragments',), O, zmatrix=ETHANOL,
      references=(plausible(0, 1, 1.512, 'C–C'), plausible(1, 2, 1.431, 'C–O'),
                  conformer(3, 2, 1, 0, 180.0, 'H–O–C–C (anti)'), dipole(1.44, 'microwave, anti conformer'))),
    M('acetone', 'Acetone', '(CH3)2CO', 'polarity', ('biomolecule-fragments',), O, zmatrix=ACETONE,
      references=(plausible(0, 1, 1.213, 'C=O'), plausible(0, 2, 1.520, 'C–C'), dipole(2.88))),
    M('pyridine', 'Pyridine', 'C5H5N', 'aromatic', ('polarity',), O, aromatic_ring(('N', 'C', 'C', 'C', 'C', 'C'), 1.39, 1.08),
      references=(plausible(0, 1, 1.338, 'N–C2'), plausible(1, 2, 1.394, 'C2–C3'), dipole(2.215))),
    M('formamide', 'Formamide', 'HCONH2', 'biomolecule-fragments', ('polarity',), O, zmatrix=FORMAMIDE,
      references=(plausible(0, 1, 1.212, 'C=O'), plausible(0, 2, 1.368, 'C–N'), dipole(3.73))),
    M('glycine', 'Glycine', 'NH2CH2COOH', 'biomolecule-fragments', (), O, zmatrix=GLYCINE,
      references=(plausible(0, 1, 1.467, 'C–N'), plausible(1, 2, 1.526, 'C–C'), plausible(2, 3, 1.205, 'C=O'),
                  conformer(0, 1, 2, 3, 0.0, 'N–C–C=O (conformer I)'),
                  dipole(1.1, 'microwave, conformer I (Lovas et al. 1995)'))),
)


def by_id(molecule_id: str) -> LibraryMolecule:
    for molecule in LIBRARY:
        if molecule.id == molecule_id:
            return molecule
    raise KeyError(f'{molecule_id} is not in the molecule library')
```

Acetylene's z values are ±1.203/2 = ±0.6015 and ±(0.6015 + 1.063) = ±1.6645.

- [ ] **Step 5: Run to verify they pass**

Run: `pytest tools/molecules/tests/test_library.py -q`
Expected: PASS (≈25 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/molecules/measure.py tools/molecules/library.py tools/molecules/tests/test_library.py
git commit -m "feat(molecules): catalogue of the 25 library molecules, geometries and references

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Optimised geometries, in bounded steps

**Files:**
- Create: `tools/molecules/optimise.py`, `tools/molecules/tests/test_optimise.py`, `tools/molecules/geometries/` (the `.xyz` files are committed in Task 7)

**Interfaces:**
- Consumes: `LibraryMolecule`, `by_id`, `OPTIMISED` (Task 2).
- Produces: `GEOMETRY_DIR`, `GRADIENT_TOLERANCE = 4.5e-4` (Ha/bohr); `write_xyz(path, atoms, comment)`, `read_xyz(path) -> (atoms, comment)`; `make_dft(mol, xc)`; `optimise_steps(entry, maxsteps=4, basis='def2-TZVP', xc='B3LYP') -> {'converged': bool, 'maxGradient': float, 'basis': str}`; `geometry_for(entry) -> (atoms, info)`, where `info` is `{}` for experimental geometries and `{'converged': True, 'maxGradient': g}` for optimised ones. It raises if the xyz is missing, unconverged, or not at def2-TZVP.

**Why bounded steps:** a glycine B3LYP/def2-TZVP step (SCF + gradient) takes about a minute, and no single command may run past the 10-minute tool timeout. Each call runs a few steps and writes the geometry it reached, and the next call resumes from it.

- [ ] **Step 1: Write the failing tests**

```python
# tools/molecules/tests/test_optimise.py
import os

import pytest

import optimise
from library import OPTIMISED, LibraryMolecule, bent, by_id
from measure import angle, distance


def test_xyz_round_trip(tmp_path):
    atoms = [('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.757, 0.587))]
    optimise.write_xyz(tmp_path / 'w.xyz', atoms, 'converged=true maxGradient=1.000e-05 method=B3LYP/def2-TZVP')
    back, comment = optimise.read_xyz(tmp_path / 'w.xyz')
    assert back == atoms and comment.startswith('converged=true')


def test_experimental_geometry_is_the_catalogue_one():
    atoms, info = optimise.geometry_for(by_id('h2o'))
    assert atoms == list(by_id('h2o').atoms) and info == {}


def test_refuses_missing_unconverged_or_wrong_basis(tmp_path, monkeypatch):
    monkeypatch.setattr(optimise, 'GEOMETRY_DIR', tmp_path)
    entry = by_id('glycine')
    with pytest.raises(FileNotFoundError, match='optimise.py glycine'):
        optimise.geometry_for(entry)
    atoms = [('N', (0.0, 0.0, 0.0))]
    optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, 'converged=false maxGradient=3.000e-03 method=B3LYP/def2-TZVP')
    with pytest.raises(RuntimeError, match='not converged'):
        optimise.geometry_for(entry)
    optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, 'converged=true maxGradient=1.000e-05 method=B3LYP/def2-SVP')
    with pytest.raises(RuntimeError, match='def2-TZVP'):
        optimise.geometry_for(entry)


@pytest.mark.skipif(not os.environ.get('MOLECULES_SLOW'), reason='runs a real optimisation (~1 min)')
def test_optimises_a_distorted_water(tmp_path, monkeypatch):
    monkeypatch.setattr(optimise, 'GEOMETRY_DIR', tmp_path)
    entry = LibraryMolecule('w', 'w', 'H2O', 'polarity', (), OPTIMISED, bent('O', 'H', 1.02, 112.0))
    result = optimise.optimise_steps(entry, maxsteps=40, basis='def2-SVP')
    assert result['converged'] and result['maxGradient'] < optimise.GRADIENT_TOLERANCE
    coords = [xyz for _, xyz in optimise.read_xyz(tmp_path / 'w.xyz')[0]]
    assert 0.955 < distance(coords[0], coords[1]) < 0.975
    assert 100.0 < angle(coords[1], coords[0], coords[2]) < 106.0
```

- [ ] **Step 2: Run to verify they fail**

Run: `pytest tools/molecules/tests/test_optimise.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'optimise'`.

- [ ] **Step 3: Implement**

```python
# tools/molecules/optimise.py
"""
B3LYP/def2-TZVP geometries for the library's seven optimised molecules.

Resumable by design: each run takes at most `maxsteps` geomeTRIC steps from
wherever the last run stopped, and writes what it reached to
geometries/<id>.xyz with its convergence in the comment line. A first pass
at def2-SVP from the catalogue's start is much cheaper; the def2-TZVP passes
then start near the minimum. Only a converged def2-TZVP geometry is ever
used (geometry_for).

    python tools/molecules/optimise.py glycine --basis def2-SVP   # repeat until converged
    python tools/molecules/optimise.py glycine                    # repeat until converged
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from library import LibraryMolecule, by_id

GEOMETRY_DIR = Path(__file__).parent / 'geometries'
GRADIENT_TOLERANCE = 4.5e-4   # Ha/bohr, geomeTRIC's default gmax
FINAL_BASIS = 'def2-TZVP'


def write_xyz(path, atoms, comment):
    lines = [str(len(atoms)), comment] + [f'{s} {x:.8f} {y:.8f} {z:.8f}' for s, (x, y, z) in atoms]
    Path(path).write_text('\n'.join(lines) + '\n')


def read_xyz(path):
    lines = Path(path).read_text().splitlines()
    count = int(lines[0])
    atoms = []
    for line in lines[2:2 + count]:
        symbol, x, y, z = line.split()
        atoms.append((symbol, (float(x), float(y), float(z))))
    return atoms, lines[1]


def _comment_fields(comment):
    return dict(part.split('=', 1) for part in comment.split())


def make_dft(mol, xc='B3LYP'):
    from pyscf import dft
    mf = dft.RKS(mol) if mol.spin == 0 else dft.ROKS(mol)
    mf.xc = xc
    mf.grids.level = 4
    mf.conv_tol = 1e-10
    return mf


def optimise_steps(entry: LibraryMolecule, maxsteps=4, basis=FINAL_BASIS, xc='B3LYP'):
    from pyscf import gto
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel

    GEOMETRY_DIR.mkdir(parents=True, exist_ok=True)
    path = GEOMETRY_DIR / f'{entry.id}.xyz'
    start = read_xyz(path)[0] if path.exists() else (entry.zmatrix or list(entry.atoms))
    mol = gto.M(atom=start, unit='Angstrom', basis=basis, spin=entry.spin, verbose=0)
    converged, mol_eq = geometric_kernel(make_dft(mol, xc), maxsteps=maxsteps)
    mf = make_dft(mol_eq, xc)
    mf.kernel()
    gmax = float(np.abs(mf.nuc_grad_method().kernel()).max())
    coords = mol_eq.atom_coords(unit='Angstrom')
    atoms = [(mol_eq.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(mol_eq.natm)]
    done = bool(converged) and gmax < GRADIENT_TOLERANCE
    write_xyz(path, atoms, f'converged={str(done).lower()} maxGradient={gmax:.3e} method={xc}/{basis}')
    return {'converged': done, 'maxGradient': gmax, 'basis': basis}


def geometry_for(entry: LibraryMolecule):
    if not entry.optimised:
        return list(entry.atoms), {}
    path = GEOMETRY_DIR / f'{entry.id}.xyz'
    if not path.exists():
        raise FileNotFoundError(f'{entry.id}: no geometry at {path}; run `python tools/molecules/optimise.py {entry.id}`')
    atoms, comment = read_xyz(path)
    fields = _comment_fields(comment)
    if fields.get('converged') != 'true':
        raise RuntimeError(f'{entry.id}: optimisation not converged yet (max gradient {fields.get("maxGradient")}); run optimise.py again')
    if not fields.get('method', '').endswith(FINAL_BASIS):
        raise RuntimeError(f'{entry.id}: geometry is at {fields.get("method")}, not {FINAL_BASIS}; continue at {FINAL_BASIS}')
    return atoms, {'converged': True, 'maxGradient': float(fields['maxGradient'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('id')
    parser.add_argument('--steps', type=int, default=4)
    parser.add_argument('--basis', default=FINAL_BASIS)
    args = parser.parse_args()
    print(args.id, optimise_steps(by_id(args.id), args.steps, args.basis))
```

The resume path reads the xyz, so a def2-SVP pass followed by def2-TZVP passes continues from the SVP geometry. The comment's `method=` records which basis produced the file on disk.

- [ ] **Step 4: Run to verify they pass**

Run: `pytest tools/molecules/tests/test_optimise.py -q && MOLECULES_SLOW=1 pytest tools/molecules/tests/test_optimise.py -q -k distorted`
Expected: 3 passed, then 1 passed (about a minute).

- [ ] **Step 5: Commit**

```bash
git add tools/molecules/optimise.py tools/molecules/tests/test_optimise.py
git commit -m "feat(molecules): resumable B3LYP/def2-TZVP optimisation for the seven optimised molecules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Voxel-averaged density grid, compaction and the grid files

**Files:**
- Create: `tools/molecules/grid.py`, `tools/molecules/density.py`, `tools/molecules/compact.py`, `tools/molecules/tests/test_density_grid.py`, `tests/fixtures/molecules/axis_order.bin.gz`

**Interfaces:**
- Produces: `GridSpec(points, half_width)` with `.shape`, `.origin`, `.spacing`, `.axis()`, `.coords()` (C order, z fastest, bohr), `.as_meta()`; `SURFACE_MARGIN_BOHR = 5.0`; `grid_for(coords_bohr, points, margin=SURFACE_MARGIN_BOHR) -> GridSpec`. `total_dm(mf) -> ndarray` (spin-summed); `eval_density(mol, dm, coords, chunk=100_000)`; `voxel_averaged_density(mol, dm, grid, far=2, near=8, nucleus=16) -> ndarray(shape)`. `compact_float32(values, mantissa_bits=10, floor=0.0) -> float32 ndarray`; `write_float32_gz(path, values)`; `read_float32_gz(path) -> float32 ndarray`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/molecules/tests/test_density_grid.py
import gzip
from pathlib import Path

import numpy as np
import pytest
from pyscf import dft, gto

from compact import compact_float32, read_float32_gz, write_float32_gz
from density import eval_density, total_dm, voxel_averaged_density
from grid import GridSpec, grid_for

FIXTURE = Path(__file__).resolve().parents[3] / 'tests' / 'fixtures' / 'molecules' / 'axis_order.bin.gz'


def test_grid_is_a_centred_cube_z_fastest():
    grid = GridSpec(5, 2.0)
    assert grid.shape == (5, 5, 5) and grid.origin == (-2.0, -2.0, -2.0) and grid.spacing == pytest.approx(1.0)
    coords = grid.coords()
    assert np.allclose(coords[0], [-2, -2, -2]) and np.allclose(coords[1], [-2, -2, -1]) and np.allclose(coords[5], [-2, -1, -2])


def test_grid_for_adds_the_margin_to_the_furthest_coordinate():
    grid = grid_for(np.array([[0.0, 0.0, 0.0], [0.0, -3.0, 1.0]]), 96)
    assert grid.half_width == pytest.approx(8.0) and grid.as_meta()['shape'] == [96, 96, 96]


def test_axis_order_fixture_matches_c_order():
    """The fixture tests/molecules/binary.test.ts reads: value at (i, j, k) is 100 i + 10 j + k."""
    i, j, k = np.meshgrid(range(2), range(3), range(4), indexing='ij')
    assert np.array_equal(read_float32_gz(FIXTURE), (100 * i + 10 * j + k).astype(np.float32).ravel())


def test_compaction_error_floor_and_size(tmp_path):
    rng = np.random.default_rng(1)
    values = np.exp(-rng.uniform(0, 20, 50_000)).astype(np.float32)
    compact = compact_float32(values, mantissa_bits=10, floor=1e-7)
    kept = values >= 1e-7
    assert np.all(compact[~kept] == 0)
    assert np.max(np.abs(compact[kept] / values[kept] - 1)) <= 2 ** -11
    write_float32_gz(tmp_path / 'raw.gz', values)
    write_float32_gz(tmp_path / 'c.gz', compact)
    assert (tmp_path / 'c.gz').stat().st_size < 0.7 * (tmp_path / 'raw.gz').stat().st_size


def test_gz_is_reproducible(tmp_path):
    write_float32_gz(tmp_path / 'a.gz', np.arange(10))
    write_float32_gz(tmp_path / 'b.gz', np.arange(10))
    assert (tmp_path / 'a.gz').read_bytes() == (tmp_path / 'b.gz').read_bytes()
    assert gzip.decompress((tmp_path / 'a.gz').read_bytes())[:4] == np.float32(0).tobytes()


def test_voxel_averaging_integrates_a_cusp_that_point_sampling_cannot():
    # Ne off a grid point: its 1s decays over 0.05 a0 against 0.2 a0 voxels.
    mol = gto.M(atom=[('Ne', (0.037, -0.061, 0.083))], unit='Bohr', basis='def2-SVP', verbose=0)
    mf = dft.RKS(mol)
    mf.xc = 'B3LYP'
    mf.kernel()
    dm = total_dm(mf)
    grid = GridSpec(40, 4.0)
    averaged = voxel_averaged_density(mol, dm, grid).sum() * grid.spacing ** 3
    pointwise = eval_density(mol, dm, grid.coords()).sum() * grid.spacing ** 3
    assert abs(averaged - 10) / 10 < 0.005
    assert abs(pointwise - 10) / 10 > 0.05
```

- [ ] **Step 2: Run to verify they fail**

Run: `pytest tools/molecules/tests/test_density_grid.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'compact'`.

- [ ] **Step 3: Implement `grid.py`, `compact.py`, `density.py`**

```python
# tools/molecules/grid.py
"""The sampling box: a cube centred on PySCF's origin, which is what Phase 1's grid sources require."""
from dataclasses import dataclass

import numpy as np

# The ρ = 0.001 surface lies 2.5-3.5 a0 beyond the nuclei; 5 a0 keeps it clear
# of the walls with room for the tail the integral needs.
SURFACE_MARGIN_BOHR = 5.0


@dataclass(frozen=True)
class GridSpec:
    points: int
    half_width: float

    @property
    def shape(self):
        return (self.points,) * 3

    @property
    def origin(self):
        return (-self.half_width,) * 3

    @property
    def spacing(self):
        return 2 * self.half_width / (self.points - 1)

    def axis(self):
        return np.linspace(-self.half_width, self.half_width, self.points)

    def coords(self):
        ax = self.axis()
        return np.stack(np.meshgrid(ax, ax, ax, indexing='ij'), -1).reshape(-1, 3)

    def as_meta(self):
        return {'shape': list(self.shape), 'origin': list(self.origin), 'spacing': self.spacing}


def grid_for(coords_bohr, points, margin=SURFACE_MARGIN_BOHR):
    return GridSpec(points, float(np.abs(np.asarray(coords_bohr)).max()) + margin)
```

```python
# tools/molecules/compact.py
"""Float32 grids as the client reads them: little-endian, C order, gzip with a zero mtime so builds reproduce byte for byte."""
import gzip
from pathlib import Path

import numpy as np


def compact_float32(values, mantissa_bits=10, floor=0.0):
    """
    Rounds each value to `mantissa_bits` of mantissa (relative error at most
    2^-(bits+1)) and flushes |v| < floor to zero. The dropped low bits are
    what gzip cannot compress; keeping them roughly doubles every file for
    precision far below what marching cubes or a colour map can show.
    """
    out = np.array(values, dtype=np.float32, copy=True).ravel()
    if floor > 0:
        out[np.abs(out) < floor] = 0.0
    drop = 23 - mantissa_bits
    bits = out.view(np.uint32)
    bits += np.uint32(1 << (drop - 1))
    bits &= np.uint32((0xFFFFFFFF << drop) & 0xFFFFFFFF)
    return out.reshape(np.shape(values))


def write_float32_gz(path, values):
    data = np.ascontiguousarray(values, dtype='<f4').tobytes()
    with open(path, 'wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, compresslevel=9, mtime=0) as gz:
        gz.write(data)


def read_float32_gz(path):
    return np.frombuffer(gzip.decompress(Path(path).read_bytes()), dtype='<f4')
```

```python
# tools/molecules/density.py
"""
Electron density on the shipped grid, as voxel averages.

A point sample cannot integrate a nuclear cusp: neon's 1s decays over 0.05 a0,
and one sample at the nucleus on a 0.2 a0 grid alone holds ~5 electrons. Each
grid value is therefore the mean of ρ over its voxel, by Gauss-Legendre
quadrature: 2³ points everywhere (exact for cubics, so smooth regions are
unchanged to O(h⁴)), 8³ near a nucleus, 16³ in the voxel holding one. Then
Σ ρ h³ is the electron count, which is what the spec's 0.5 % check asserts,
and near the 0.001 surface the values move by ~2 %, i.e. ~0.01 a0 of surface.
"""
import numpy as np


def total_dm(mf):
    dm = mf.make_rdm1()
    return dm[0] + dm[1] if np.ndim(dm) == 3 else dm


def eval_density(mol, dm, coords, chunk=100_000):
    from pyscf.dft import numint
    coords = np.asarray(coords, dtype=float)
    out = np.empty(len(coords))
    for start in range(0, len(coords), chunk):
        ao = numint.eval_ao(mol, coords[start:start + chunk])
        out[start:start + chunk] = numint.eval_rho(mol, ao, dm)
    return out


def _voxel_rule(n, h):
    nodes, weights = np.polynomial.legendre.leggauss(n)
    offsets = np.stack(np.meshgrid(nodes, nodes, nodes, indexing='ij'), -1).reshape(-1, 3) * (h / 2)
    w = (weights[:, None, None] * weights[None, :, None] * weights[None, None, :]).reshape(-1) / 8.0
    return offsets, w


def voxel_averaged_density(mol, dm, grid, far=2, near=8, nucleus=16):
    centres = grid.coords()
    h = grid.spacing
    tier = np.full(len(centres), far, dtype=int)
    for Z, R in zip(mol.atom_charges(), mol.atom_coords()):
        d = np.linalg.norm(centres - R, axis=1)
        core = 0.6 if Z <= 2 else 1.2
        tier[d < core + h] = np.maximum(tier[d < core + h], near)
        tier[d < h] = np.maximum(tier[d < h], nucleus)
    rho = np.empty(len(centres))
    for n in np.unique(tier):
        idx = np.nonzero(tier == n)[0]
        offsets, w = _voxel_rule(int(n), h)
        batch = max(1, 200_000 // len(w))
        for start in range(0, len(idx), batch):
            block = idx[start:start + batch]
            points = (centres[block][:, None, :] + offsets[None, :, :]).reshape(-1, 3)
            rho[block] = eval_density(mol, dm, points).reshape(len(block), -1) @ w
    return rho.reshape(grid.shape)
```

- [ ] **Step 4: Write the shared axis-order fixture**

Run: `mkdir -p tests/fixtures/molecules && python -c "import sys, numpy as np; sys.path.insert(0, 'tools/molecules'); from compact import write_float32_gz; i, j, k = np.meshgrid(range(2), range(3), range(4), indexing='ij'); write_float32_gz('tests/fixtures/molecules/axis_order.bin.gz', 100 * i + 10 * j + k)"`
Expected: no output. The file is 24 floats.

- [ ] **Step 5: Run to verify they pass**

Run: `pytest tools/molecules/tests/test_density_grid.py -q`
Expected: 6 passed (Ne takes a few seconds).

- [ ] **Step 6: Commit**

```bash
git add tools/molecules/grid.py tools/molecules/density.py tools/molecules/compact.py tools/molecules/tests/test_density_grid.py tests/fixtures/molecules/axis_order.bin.gz
git commit -m "feat(molecules): voxel-averaged density grids that integrate to the electron count

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Electrostatic potential, dipole and the orbital table

**Files:**
- Create: `tools/molecules/esp.py`, `tools/molecules/orbitals.py`, `tools/molecules/tests/test_esp_orbitals.py`

**Interfaces:**
- Consumes: `total_dm`, `eval_density` (Task 4); `make_dft` (Task 3); `by_id` (Task 2).
- Produces: `NUCLEAR_CLAMP_BOHR = 0.05`; `esp_on_points(mol, dm, coords, chunk=256) -> ndarray` (Ha/e); `esp_surface_range(esp, rho, lo=8e-4, hi=1.25e-3) -> (min, max)`. `orbital_labels(irreps) -> list[str]`; `degeneracy_groups(energies, tol=1e-4) -> list[int]`; `orbital_table(mol, mf, extra_virtuals=5) -> list[dict]`, rows `{index, label, energyHartree, occupation, role?}` with `role ∈ {'HOMO', 'LUMO', 'SOMO'}`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/molecules/tests/test_esp_orbitals.py
import numpy as np
from pyscf import gto
from pyscf.dft import numint

from density import total_dm
from esp import esp_on_points
from library import by_id
from optimise import make_dft
from orbitals import degeneracy_groups, orbital_labels, orbital_table


def scf(molecule_id, symmetry=True):
    entry = by_id(molecule_id)
    mol = gto.M(atom=list(entry.atoms), unit='Angstrom', basis='def2-SVP', spin=entry.spin, symmetry=symmetry, verbose=0)
    mf = make_dft(mol)
    mf.kernel()
    return mol, mf


def test_labels_count_per_irrep_and_pair_degenerate_components():
    assert orbital_labels(['A1', 'A1', 'B2', 'A1', 'B1']) == ['1a1', '2a1', '1b2', '3a1', '1b1']
    assert orbital_labels(['A1g', 'E1uy', 'E1ux', 'A1g']) == ['1a1g', '1e1u', '1e1u', '2a1g']


def test_degeneracy_groups():
    assert degeneracy_groups([-1.0, -0.5, -0.49999, -0.2]) == [0, 1, 1, 2]


def test_esp_signs_on_water():
    mol, mf = scf('h2o', symmetry=False)       # the builder's frame: O at 0, H on +z
    dm = total_dm(mf)
    o, h1 = mol.atom_coords()[0], mol.atom_coords()[1]
    beyond_o = o + np.array([0.0, 0.0, -3.0])
    beyond_h = h1 + 1.5 * (h1 - o) / np.linalg.norm(h1 - o)
    far = np.array([0.0, 0.0, 30.0])
    v = esp_on_points(mol, dm, np.array([beyond_o, beyond_h, far]))
    assert v[0] < 0 < v[1] and abs(v[2]) < 5e-3


def test_water_homo_is_the_out_of_plane_lone_pair_and_dipole_points_to_the_hydrogens():
    mol, mf = scf('h2o')
    table = orbital_table(mol, mf)
    homo = next(r for r in table if r.get('role') == 'HOMO')
    lumo = next(r for r in table if r.get('role') == 'LUMO')
    assert homo['energyHartree'] < lumo['energyHartree'] and homo['label'][1:] in ('b1', 'b2')
    c = mol.atom_coords()
    normal = np.cross(c[1] - c[0], c[2] - c[0])
    normal /= np.linalg.norm(normal)
    u = (c[1] - c[0]) / np.linalg.norm(c[1] - c[0])
    v = np.cross(normal, u)
    plane = np.array([c[0] + a * u + b * v for a in np.linspace(-2, 2, 9) for b in np.linspace(-2, 2, 9)])
    psi = lambda pts: numint.eval_ao(mol, pts) @ mf.mo_coeff[:, homo['index']]
    assert np.abs(psi(plane)).max() < 1e-8 < 1e-2 < np.abs(psi(plane + 0.7 * normal)).max()
    mu = np.asarray(mf.dip_moment(unit='Debye', verbose=0))
    assert 1.7 < np.linalg.norm(mu) < 2.3
    assert np.dot(mu, (c[1] + c[2]) / 2 - c[0]) > 0          # from - (O) towards + (H)


def test_all_three_ch4_homos_are_marked():
    mol, mf = scf('ch4')
    assert sum(1 for r in orbital_table(mol, mf) if r.get('role') == 'HOMO') == 3


def test_no2_has_one_somo_below_the_lumo():
    mol, mf = scf('no2')
    table = orbital_table(mol, mf)
    somo = [r for r in table if r.get('role') == 'SOMO']
    lumo = next(r for r in table if r.get('role') == 'LUMO')
    assert len(somo) == 1 and somo[0]['occupation'] == 1.0 and somo[0]['energyHartree'] < lumo['energyHartree']


def test_table_keeps_occupied_plus_five_virtuals_and_completes_a_degenerate_set():
    mol, mf = scf('ch4')
    table = orbital_table(mol, mf)
    virtual = [r for r in table if r['occupation'] == 0]
    assert len([r for r in table if r['occupation'] > 0]) == 5 and len(virtual) >= 5
    groups = degeneracy_groups(mf.mo_energy)
    last = virtual[-1]['index']
    assert last + 1 >= len(mf.mo_energy) or groups[last + 1] != groups[last]
```

- [ ] **Step 2: Run to verify they fail**

Run: `pytest tools/molecules/tests/test_esp_orbitals.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'esp'`.

- [ ] **Step 3: Implement**

```python
# tools/molecules/esp.py
"""
Electrostatic potential V(r) = Σ Z_A/|r - R_A| - ∫ρ(r')/|r - r'| dr', in Ha/e.

The electronic part uses PySCF's point-charge fake molecule: three-centre
integrals (μν|1/r|C) contracted with the density matrix. Chunks of 256 points
keep that array near 100 MB even for SF6. The nuclear term is clamped at
0.05 a0 so a grid point that lands on a nucleus stays finite; ESP is only
ever read on the 0.001 surface, far from any nucleus.
"""
import numpy as np

NUCLEAR_CLAMP_BOHR = 0.05


def esp_on_points(mol, dm, coords, chunk=256):
    from pyscf import df, gto
    coords = np.asarray(coords, dtype=float)
    charges = mol.atom_charges().astype(float)
    nuclei = mol.atom_coords()
    out = np.empty(len(coords))
    for start in range(0, len(coords), chunk):
        block = coords[start:start + chunk]
        r = np.linalg.norm(block[:, None, :] - nuclei[None, :, :], axis=2)
        nuclear = (charges[None, :] / np.maximum(r, NUCLEAR_CLAMP_BOHR)).sum(axis=1)
        electronic = np.einsum('ijp,ij->p', df.incore.aux_e2(mol, gto.fakemol_for_charges(block)), dm)
        out[start:start + chunk] = nuclear - electronic
    return out


def esp_surface_range(esp, rho, lo=8e-4, hi=1.25e-3):
    """ESP extremes over the grid points lying in a thin shell around ρ = 0.001: the map's range, for validation."""
    shell = (rho > lo) & (rho < hi)
    if not shell.any():
        raise RuntimeError('no ESP grid point lies near the 0.001 surface; the ESP grid is too coarse')
    return float(esp[shell].min()), float(esp[shell].max())
```

```python
# tools/molecules/orbitals.py
"""
The orbital list meta.json carries: every occupied orbital and the first few
virtuals, labelled by irrep in the calculation's abelian subgroup (PySCF only
labels those), with degenerate sets kept together and HOMO / LUMO / SOMO on
every member of the relevant set.
"""
import numpy as np

DEGENERACY_TOL = 1e-4


def orbital_labels(irreps):
    counts, labels = {}, []
    for irrep in irreps:
        name = irrep.lower()
        # A degenerate pair's components (E1ux, E1uy) share one label; they
        # are counted separately so either may come first in energy order.
        if name.startswith('e') and name[-1] in 'xy':
            key, component = name[:-1], name[-1]
        else:
            key, component = name, ''
        counts[(key, component)] = counts.get((key, component), 0) + 1
        labels.append(f'{counts[(key, component)]}{key}')
    return labels


def degeneracy_groups(energies, tol=DEGENERACY_TOL):
    groups, current = [], 0
    for i, e in enumerate(energies):
        if i and abs(e - energies[i - 1]) >= tol:
            current += 1
        groups.append(current)
    return groups


def orbital_table(mol, mf, extra_virtuals=5):
    energies = np.asarray(mf.mo_energy, dtype=float)
    occ = np.asarray(mf.mo_occ, dtype=float)
    if mol.symmetry:
        from pyscf import symm
        labels = orbital_labels(list(symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, mf.mo_coeff)))
    else:
        labels = [f'ψ{i + 1}' for i in range(len(energies))]
    groups = degeneracy_groups(list(energies))
    occupied = [i for i in range(len(occ)) if occ[i] > 0]
    virtual = [i for i in range(len(occ)) if occ[i] == 0]
    keep_virtual = virtual[:extra_virtuals]
    while keep_virtual and len(keep_virtual) < len(virtual) and groups[virtual[len(keep_virtual)]] == groups[keep_virtual[-1]]:
        keep_virtual.append(virtual[len(keep_virtual)])
    doubly = [i for i in occupied if occ[i] > 1.5]
    homo_group = groups[max(doubly, key=lambda i: energies[i])] if doubly else None
    lumo_group = groups[min(virtual, key=lambda i: energies[i])] if virtual else None
    rows = []
    for i in occupied + keep_virtual:
        row = {'index': int(i), 'label': labels[i], 'energyHartree': float(energies[i]), 'occupation': float(occ[i])}
        if 0.5 < occ[i] < 1.5:
            row['role'] = 'SOMO'
        elif occ[i] > 1.5 and groups[i] == homo_group:
            row['role'] = 'HOMO'
        elif occ[i] == 0 and groups[i] == lumo_group:
            row['role'] = 'LUMO'
        rows.append(row)
    return rows
```

- [ ] **Step 4: Run to verify they pass**

Run: `pytest tools/molecules/tests/test_esp_orbitals.py -q`
Expected: 7 passed (under a minute).

- [ ] **Step 5: Commit**

```bash
git add tools/molecules/esp.py tools/molecules/orbitals.py tools/molecules/tests/test_esp_orbitals.py
git commit -m "feat(molecules): ESP on a grid, dipole direction and a labelled orbital table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Building one molecule's files, the index and the validation rows

**Files:**
- Create: `tools/molecules/build_library.py`, `tools/molecules/tests/test_build_library.py`

**Interfaces:**
- Consumes: `generate.basis_json(mol, mf)` (Phase 5); everything from Tasks 2–5.
- Produces: `PUBLIC`, `ROWS` (`src/validation/molecule_rows.json`), `BUDGET_BYTES = 3_000_000`, `GRID_POINTS_TRIES = (96, 88, 80)`, `FACE_DENSITY_LIMIT = 1e-5`, `DENSITY_FLOOR = 1e-7`, `class BudgetExceeded(RuntimeError)`; `run_dft(atoms, spin, basis, xc) -> (mol, mf)`; `check_box(density)`; `build_molecule(entry, out_root=PUBLIC, basis='def2-TZVP', xc='B3LYP', grid_points=GRID_POINTS_TRIES, budget=BUDGET_BYTES) -> index entry dict`; `merge_index(path, entries)`; `validation_rows(entry, meta) -> list[dict]` (`ValidationRow` shape, `phase: 6`); `write_validation_rows(public_root=PUBLIC, out=ROWS)`; CLI `--only id,id | --all | --rows-only`.
- meta.json = spec §4.2 plus `dipoleVectorDebye`, `espRangeOnSurface`, `electronCount`, `densityIntegral`, `multiplicity`, `symmetry {pointGroup, labelGroup}`, `geometryOptimisation?`; each reference also carries `tolerance` and, for geometry, `atoms` and `label`. `method.energies` is B3LYP/def2-TZVP too: this phase computes no CCSD(T).

- [ ] **Step 1: Write the failing tests**

```python
# tools/molecules/tests/test_build_library.py
import json

import numpy as np
import pytest

from build_library import BudgetExceeded, build_molecule, check_box, merge_index, validation_rows
from compact import read_float32_gz
from library import by_id


@pytest.fixture(scope='module')
def water(tmp_path_factory):
    out = tmp_path_factory.mktemp('molecules')
    entry = build_molecule(by_id('h2o'), out_root=out, basis='def2-SVP', grid_points=(40,))
    return out, entry, json.loads((out / 'h2o' / 'meta.json').read_text())


def test_writes_the_four_spec_files(water):
    out, entry, meta = water
    assert {p.name for p in (out / 'h2o').iterdir()} == {'meta.json', 'density.bin.gz', 'esp.bin.gz', 'basis.json'}
    assert entry == {'id': 'h2o', 'name': 'Water', 'formula': 'H2O', 'category': 'first-examples', 'tags': ['polarity', 'hybridisation']}


def test_meta_carries_grids_method_and_the_additions(water):
    _, _, meta = water
    assert meta['grid']['shape'] == [40, 40, 40] and meta['espGrid']['shape'] == [20, 20, 20]
    assert meta['method'] == {'density': 'B3LYP/def2-SVP', 'energies': 'B3LYP/def2-SVP'}
    assert meta['geometrySource'] == 'experiment (CCCBDB)' and meta['electronCount'] == 10 and meta['multiplicity'] == 1
    assert len(meta['dipoleVectorDebye']) == 3 and 1.7 < meta['dipoleDebye'] < 2.3
    assert meta['espRangeOnSurface'][0] < 0 < meta['espRangeOnSurface'][1]
    assert meta['symmetry']['pointGroup'] == 'C2v'
    assert {'quantity': 'dipole', 'value': 1.855, 'unit': 'D', 'source': 'CRC Handbook, via CCCBDB', 'tolerance': pytest.approx(0.1855)} in meta['references']


def test_shipped_density_integrates_to_ten_electrons(water):
    out, _, meta = water
    rho = read_float32_gz(out / 'h2o' / 'density.bin.gz')
    assert rho.size == 40 ** 3
    assert abs(rho.astype(np.float64).sum() * meta['grid']['spacing'] ** 3 - 10) / 10 < 0.005
    assert meta['densityIntegral'] == pytest.approx(rho.astype(np.float64).sum() * meta['grid']['spacing'] ** 3)


def test_budget_guard(tmp_path):
    with pytest.raises(BudgetExceeded):
        build_molecule(by_id('h2o'), out_root=tmp_path, basis='def2-SVP', grid_points=(40,), budget=1000)


def test_check_box_rejects_density_at_a_face():
    rho = np.zeros((4, 4, 4))
    rho[1, 1, 3] = 2e-5
    with pytest.raises(RuntimeError, match='box face'):
        check_box(rho)
    check_box(np.zeros((4, 4, 4)))


def test_merge_index_keeps_other_entries_and_orders_the_library(tmp_path):
    path = tmp_path / 'index.json'
    path.write_text(json.dumps([{'id': 'h2', 'name': 'Hydrogen', 'formula': 'H2', 'category': 'diatomic', 'tags': []},
                                {'id': 'nh3', 'name': 'old', 'formula': 'NH3', 'category': 'first-examples', 'tags': []}]))
    merge_index(path, [{'id': 'h2o', 'name': 'Water', 'formula': 'H2O', 'category': 'first-examples', 'tags': []}])
    merge_index(path, [{'id': 'nh3', 'name': 'Ammonia', 'formula': 'NH3', 'category': 'first-examples', 'tags': []}])
    assert [(e['id'], e['name']) for e in json.loads(path.read_text())] == [('h2', 'Hydrogen'), ('h2o', 'Water'), ('nh3', 'Ammonia')]


def test_validation_rows_have_the_phase1_shape(water):
    _, _, meta = water
    rows = validation_rows(by_id('h2o'), meta)
    keys = {'phase', 'quantity', 'system', 'app', 'reference', 'unit', 'tolerancePercent', 'referenceSource', 'method'}
    assert all(set(r) == keys and r['phase'] == 6 for r in rows)
    by_quantity = {r['quantity']: r for r in rows}
    assert set(by_quantity) == {'bond length O–H', 'angle H–O–H', 'dipole moment', 'electrons in shipped density grid'}
    assert by_quantity['bond length O–H']['app'] == pytest.approx(0.958, abs=2e-3)
    assert by_quantity['angle H–O–H']['unit'] == '°' and by_quantity['dipole moment']['tolerancePercent'] == pytest.approx(10.0)
```

The water geometry is catalogue-exact, and PySCF's reorientation only rotates it, so the O–H length survives to 2 × 10⁻³ Å (Float64 round trip).

- [ ] **Step 2: Run to verify they fail**

Run: `pytest tools/molecules/tests/test_build_library.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'build_library'`.

- [ ] **Step 3: Implement**

```python
# tools/molecules/build_library.py
"""
Builds the molecule library's files (spec §4.2) into public/molecules/<id>/,
merges public/molecules/index.json, and derives the validation rows the app's
Methods page shows (src/validation/molecule_rows.json) from the meta.json
files actually shipped.

One molecule per call keeps every run under the tool timeout:
    python tools/molecules/build_library.py --only h2o
    python tools/molecules/build_library.py --rows-only
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path

import numpy as np

import generate
from compact import compact_float32, write_float32_gz
from density import eval_density, total_dm, voxel_averaged_density
from esp import esp_on_points, esp_surface_range
from grid import grid_for
from library import LIBRARY, by_id
from measure import BOHR_TO_ANGSTROM, measure
from optimise import geometry_for, make_dft
from orbitals import orbital_table

REPO = Path(__file__).resolve().parents[2]
PUBLIC = REPO / 'public' / 'molecules'
ROWS = REPO / 'src' / 'validation' / 'molecule_rows.json'
BUDGET_BYTES = 3_000_000
GRID_POINTS_TRIES = (96, 88, 80)
FACE_DENSITY_LIMIT = 1e-5
DENSITY_FLOOR = 1e-7
UNITS = {'deg': '°'}


class BudgetExceeded(RuntimeError):
    pass


def run_dft(atoms, spin, basis, xc):
    from pyscf import gto
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=spin, symmetry=True, verbose=0)
    mf = make_dft(mol, xc)
    mf.kernel()
    if not mf.converged:
        raise RuntimeError(f'SCF did not converge ({xc}/{basis})')
    return mol, mf


def check_box(density, limit=FACE_DENSITY_LIMIT):
    d = np.asarray(density)
    faces = max(d[0].max(), d[-1].max(), d[:, 0].max(), d[:, -1].max(), d[:, :, 0].max(), d[:, :, -1].max())
    if faces >= limit:
        raise RuntimeError(f'density {faces:.1e} at the box face: the 0.001 surface may be cut off; widen SURFACE_MARGIN_BOHR')


def _size(directory):
    return sum(f.stat().st_size for f in directory.iterdir() if f.is_file())


def _commit():
    try:
        return subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return 'unknown'


def _reference_json(ref):
    out = {'quantity': ref.quantity, 'value': ref.value, 'unit': ref.unit, 'source': ref.source, 'tolerance': ref.tolerance}
    if ref.atoms:
        out['atoms'] = list(ref.atoms)
    if ref.label:
        out['label'] = ref.label
    return out


def build_molecule(entry, out_root=PUBLIC, basis='def2-TZVP', xc='B3LYP', grid_points=GRID_POINTS_TRIES, budget=BUDGET_BYTES):
    import pyscf
    atoms, optimisation = geometry_for(entry)
    mol, mf = run_dft(atoms, entry.spin, basis, xc)
    dm = total_dm(mf)
    coords = mol.atom_coords()
    out = Path(out_root) / entry.id
    out.mkdir(parents=True, exist_ok=True)
    (out / 'basis.json').write_text(json.dumps(generate.basis_json(mol, mf), separators=(',', ':')))
    dipole = np.asarray(mf.dip_moment(unit='Debye', verbose=0), dtype=float)
    orbitals = orbital_table(mol, mf)
    for points in grid_points:
        grid, esp_grid = grid_for(coords, points), grid_for(coords, points // 2)
        density = compact_float32(voxel_averaged_density(mol, dm, grid), floor=DENSITY_FLOOR)
        check_box(density)
        esp_coords = esp_grid.coords()
        esp = esp_on_points(mol, dm, esp_coords)
        write_float32_gz(out / 'density.bin.gz', density)
        write_float32_gz(out / 'esp.bin.gz', compact_float32(esp))
        meta = {
            'id': entry.id, 'name': entry.name, 'formula': entry.formula,
            'atoms': [{'Z': int(mol.atom_charge(i)), 'position': [float(v) for v in coords[i]]} for i in range(mol.natm)],
            'geometrySource': entry.geometry_source,
            'method': {'density': f'{xc}/{basis}', 'energies': f'{xc}/{basis}'},
            'totalEnergyHartree': float(mf.e_tot),
            'dipoleDebye': float(np.linalg.norm(dipole)),
            'dipoleVectorDebye': [float(v) for v in dipole],
            'orbitals': orbitals,
            'grid': grid.as_meta(),
            'espGrid': esp_grid.as_meta(),
            'espRangeOnSurface': list(esp_surface_range(esp, eval_density(mol, dm, esp_coords))),
            'electronCount': int(mol.nelectron),
            'densityIntegral': float(density.astype(np.float64).sum() * grid.spacing ** 3),
            'multiplicity': entry.spin + 1,
            'symmetry': {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname},
            'references': [_reference_json(r) for r in entry.references],
            'generator': {'pyscf': pyscf.__version__, 'script': 'tools/molecules/build_library.py', 'commit': _commit()},
        }
        if optimisation:
            meta['geometryOptimisation'] = optimisation
        (out / 'meta.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')
        if _size(out) <= budget:
            return {'id': entry.id, 'name': entry.name, 'formula': entry.formula, 'category': entry.category, 'tags': list(entry.tags)}
    raise BudgetExceeded(f'{entry.id}: {_size(out)} bytes at {grid_points[-1]}³ exceeds {budget}')


def merge_index(path, entries):
    path = Path(path)
    order = {m.id: i for i, m in enumerate(LIBRARY)}
    merged = {e['id']: e for e in (json.loads(path.read_text()) if path.exists() else [])}
    merged.update({e['id']: e for e in entries})
    others = [e for e in merged.values() if e['id'] not in order]
    ours = sorted((e for e in merged.values() if e['id'] in order), key=lambda e: order[e['id']])
    path.write_text(json.dumps(others + ours, indent=1, ensure_ascii=False) + '\n')


def validation_rows(entry, meta):
    coords = [np.asarray(a['position']) * BOHR_TO_ANGSTROM for a in meta['atoms']]
    rows = []
    for ref in entry.references:
        if ref.quantity == 'dipole':
            if ref.value == 0:
                continue      # a percentage of zero is meaningless; test_library_data asserts |μ| < 0.01 D instead
            quantity, app, method = 'dipole moment', meta['dipoleDebye'], meta['method']['density']
        elif ref.quantity in ('bond', 'angle'):
            quantity = f'{"bond length" if ref.quantity == "bond" else "angle"} {ref.label}'
            app, method = measure(ref, coords), meta['geometrySource']
        else:
            continue
        rows.append({'phase': 6, 'quantity': quantity, 'system': entry.formula, 'app': round(float(app), 4),
                     'reference': ref.value, 'unit': UNITS.get(ref.unit, ref.unit),
                     'tolerancePercent': round(100 * ref.tolerance / abs(ref.value), 3),
                     'referenceSource': ref.source, 'method': method})
    rows.append({'phase': 6, 'quantity': 'electrons in shipped density grid', 'system': entry.formula,
                 'app': round(meta['densityIntegral'], 4), 'reference': meta['electronCount'], 'unit': 'e',
                 'tolerancePercent': 0.5, 'referenceSource': 'electron count',
                 'method': f'{meta["method"]["density"]}, voxel-averaged {meta["grid"]["shape"][0]}³ grid'})
    return rows


def write_validation_rows(public_root=PUBLIC, out=ROWS):
    rows = []
    for entry in LIBRARY:
        meta_path = Path(public_root) / entry.id / 'meta.json'
        if meta_path.exists():
            rows += validation_rows(entry, json.loads(meta_path.read_text()))
    Path(out).write_text(json.dumps(rows, indent=1, ensure_ascii=False) + '\n')
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--only')
    group.add_argument('--all', action='store_true')
    group.add_argument('--rows-only', action='store_true')
    args = parser.parse_args(argv)
    if not args.rows_only:
        ids = [m.id for m in LIBRARY] if args.all else args.only.split(',')
        for molecule_id in ids:
            started = time.time()
            entry = build_molecule(by_id(molecule_id))
            merge_index(PUBLIC / 'index.json', [entry])
            print(f'{molecule_id}: {_size(PUBLIC / molecule_id)} bytes in {time.time() - started:.0f} s')
    print(f'{len(write_validation_rows())} validation rows')


if __name__ == '__main__':
    main()
```

The mapping from `'deg'` to `'°'` exists because the Methods page prints `unit` as it stands.

- [ ] **Step 4: Run to verify they pass**

Run: `pytest tools/molecules/tests/test_build_library.py -q`
Expected: 7 passed (1–2 minutes).

- [ ] **Step 5: Commit**

```bash
git add tools/molecules/build_library.py tools/molecules/tests/test_build_library.py
git commit -m "feat(molecules): build one molecule's spec §4.2 files, the index and its validation rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Generate the library and validate what ships

**Files:**
- Create: `tools/molecules/tests/test_library_data.py`, `tests/molecules/size_budget.test.ts`, `src/validation/phase6.ts`, generated `public/molecules/<25 ids>/*`, `tools/molecules/geometries/*.xyz`, `src/validation/molecule_rows.json`
- Modify: `public/molecules/index.json` (merged), `src/validation/references.ts`

**Interfaces:**
- Consumes: `build_library` CLI (Task 6), `optimise.py` CLI (Task 3), `VALIDATION`, `ValidationRow` (Phase 1).
- Produces: the shipped library; `PHASE_6_ROWS: ValidationRow[]` spread into `VALIDATION`.

- [ ] **Step 1: Confirm every reference value against CCCBDB before computing anything**

For each molecule in the table under "Design decisions", open CCCBDB (cccbdb.nist.gov → Experimental data → the species → Geometry, and Dipole) and compare. Pay most attention to the values most likely to have been transcribed wrongly: C₂H₆ (1.535 / 1.094 / 111.2), NO₂ (1.194 / 133.9, 0.316 D), O₃ (0.53 D), the ethanol anti-conformer dipole (1.44 D) and the glycine conformer I dipole (1.1 D, Lovas et al. 1995). Where CCCBDB differs, correct `library.py`, rerun `pytest tools/molecules/tests/test_library.py -q`, and commit with the source in the message.

- [ ] **Step 2: Write the shipped-data validation (fails: nothing built yet)**

```python
# tools/molecules/tests/test_library_data.py
"""Spec Phase 6 validation, asserted on the files that actually ship."""
import json
from pathlib import Path

import numpy as np
import pytest

from compact import read_float32_gz
from library import LIBRARY, by_id
from measure import BOHR_TO_ANGSTROM, angular_difference, measure

REPO = Path(__file__).resolve().parents[3]
PUBLIC = REPO / 'public' / 'molecules'
EACH = pytest.mark.parametrize('entry', LIBRARY, ids=lambda m: m.id)


def meta(entry):
    return json.loads((PUBLIC / entry.id / 'meta.json').read_text())


def coords(m):
    return [np.asarray(a['position']) * BOHR_TO_ANGSTROM for a in m['atoms']]


def test_index_lists_the_library_in_catalogue_order():
    index = json.loads((PUBLIC / 'index.json').read_text())
    assert [e['id'] for e in index if e['id'] in {m.id for m in LIBRARY}] == [m.id for m in LIBRARY]


@EACH
def test_geometry_matches_its_stated_source(entry):
    m = meta(entry)
    for ref in entry.references:
        if ref.quantity in ('bond', 'angle'):
            assert abs(measure(ref, coords(m)) - ref.value) <= ref.tolerance, ref.label
        if ref.quantity == 'dihedral':
            assert angular_difference(measure(ref, coords(m)), ref.value) <= ref.tolerance, ref.label
    if entry.optimised:
        assert m['geometryOptimisation']['converged'] and m['geometryOptimisation']['maxGradient'] < 4.5e-4


@EACH
def test_dipole_within_tolerance(entry):
    ref = next(r for r in entry.references if r.quantity == 'dipole')
    assert abs(meta(entry)['dipoleDebye'] - ref.value) <= ref.tolerance


@EACH
def test_density_integrates_to_the_electron_count(entry):
    m = meta(entry)
    rho = read_float32_gz(PUBLIC / entry.id / 'density.bin.gz').astype(np.float64)
    assert rho.size == np.prod(m['grid']['shape'])
    assert abs(rho.sum() * m['grid']['spacing'] ** 3 - m['electronCount']) / m['electronCount'] < 0.005


@EACH
def test_density_vanishes_at_the_box_faces(entry):
    m = meta(entry)
    rho = read_float32_gz(PUBLIC / entry.id / 'density.bin.gz').reshape(m['grid']['shape'])
    assert max(rho[0].max(), rho[-1].max(), rho[:, 0].max(), rho[:, -1].max(), rho[:, :, 0].max(), rho[:, :, -1].max()) < 1e-5


@EACH
def test_homo_below_lumo_with_roles_on_whole_sets(entry):
    orbitals = meta(entry)['orbitals']
    occupied = [o for o in orbitals if o['occupation'] > 0]
    empty = [o for o in orbitals if o['occupation'] == 0]
    homo = [o for o in orbitals if o.get('role') == 'HOMO']
    lumo = [o for o in orbitals if o.get('role') == 'LUMO']
    assert homo and lumo
    assert max(o['energyHartree'] for o in homo) == max(o['energyHartree'] for o in occupied if o['occupation'] == 2)
    assert min(o['energyHartree'] for o in lumo) == min(o['energyHartree'] for o in empty)
    assert max(o['energyHartree'] for o in occupied) < min(o['energyHartree'] for o in empty)
    assert len({round(o['energyHartree'], 4) for o in homo}) == 1


@EACH
def test_within_the_size_budget(entry):
    assert sum(f.stat().st_size for f in (PUBLIC / entry.id).iterdir()) <= 3_000_000


def test_esp_ranges_are_physical():
    lo, hi = meta(by_id('h2o'))['espRangeOnSurface']
    assert lo < -0.03 and hi > 0.03                        # a polar molecule: both ends strongly charged
    lo, hi = meta(by_id('benzene'))['espRangeOnSurface']
    assert -0.04 < lo < 0 < hi < 0.04                       # weak π-face negative, weak C-H positive
    for entry in LIBRARY:
        assert all(abs(v) < 0.2 for v in meta(entry)['espRangeOnSurface'])


def test_rows_file_is_current():
    from build_library import validation_rows
    rows = json.loads((REPO / 'src' / 'validation' / 'molecule_rows.json').read_text())
    assert rows == [r for entry in LIBRARY for r in validation_rows(entry, meta(entry))]
```

Run: `pytest tools/molecules/tests/test_library_data.py -q`
Expected: FAIL (`FileNotFoundError` for meta.json).

- [ ] **Step 3: Optimise the seven, a few steps per call**

For each of `ch3oh hcooh formamide acetone ethanol pyridine glycine`: first run `python tools/molecules/optimise.py <id> --basis def2-SVP --steps 10` until it prints `'converged': True` (each call is under 5 min). Then run `python tools/molecules/optimise.py <id> --steps 4` until it prints `'converged': True` (each call ≤ 8 min for glycine, less for the rest). Every command runs in the foreground with a 600000 ms timeout. Expect 2–6 calls per molecule.

- [ ] **Step 4: Build the library, one molecule per call**

Run each in the foreground with a 600000 ms timeout: `python tools/molecules/build_library.py --only <id>` for every id in catalogue order. Small molecules take 1–3 min; glycine, acetone, benzene, pyridine and SF₆ take up to ~8 min. Each prints its byte count. A `BudgetExceeded` after all three grid sizes is a real finding: stop and report the molecule and its size to the owner.

- [ ] **Step 5: Run the validation**

Run: `python tools/molecules/build_library.py --rows-only && pytest tools/molecules/tests/test_library_data.py -q`
Expected: all pass. **If a dipole fails, do not change the tolerance.** Report the molecule, the computed and reference values, and offer def2-TZVPD for it. That is a method change, so it is the owner's decision. If a conformer check fails, the optimisation fell into another minimum: delete that molecule's xyz and restart Step 3 for it.

- [ ] **Step 6: The client-side size budget test**

```ts
// tests/molecules/size_budget.test.ts
import fs from 'fs';
import path from 'path';

/** Spec §4.2: every molecule under 3 MB. Fails naming each molecule directory that is over. */
const ROOT = path.resolve(__dirname, '../../public/molecules');
const BUDGET_BYTES = 3_000_000;

describe('molecule size budget', () => {
    it('keeps every public/molecules/<id> within 3 MB', () => {
        const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory());
        expect(dirs.length).toBeGreaterThanOrEqual(25);
        const over = dirs
            .map(d => ({ id: d.name, bytes: fs.readdirSync(path.join(ROOT, d.name)).reduce((sum, f) => sum + fs.statSync(path.join(ROOT, d.name, f)).size, 0) }))
            .filter(d => d.bytes > BUDGET_BYTES);
        expect(over).toEqual([]);
    });
});
```

Run: `npx jest tests/molecules/size_budget.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the rows to the shared validation table**

```ts
// src/validation/phase6.ts
import type { ValidationRow } from './references';
import rows from './molecule_rows.json';

/**
 * The molecule library (spec Phase 6). Generated by
 * tools/molecules/build_library.py from the meta.json files that ship, so
 * `app` is exactly what the app displays; tools/molecules/tests/
 * test_library_data.py fails if this file falls out of date.
 */
export const PHASE_6_ROWS: ValidationRow[] = rows as ValidationRow[];
```

In `src/validation/references.ts`, add `import { PHASE_6_ROWS } from './phase6';` beside the other phase imports and append `...PHASE_6_ROWS` as the last element of the `VALIDATION` array literal.

Run: `npx jest tests/validation/references.test.ts && npx tsc --noEmit -p .`
Expected: PASS. Phase 1's test checks every row within tolerance and every `phase|system|quantity` key unique.

- [ ] **Step 8: Commit (data included)**

```bash
git add public/molecules tools/molecules/geometries tools/molecules/tests/test_library_data.py tests/molecules/size_budget.test.ts src/validation/phase6.ts src/validation/molecule_rows.json src/validation/references.ts tools/molecules/library.py
git commit -m "feat(molecules): the 25-molecule library, validated: geometry, dipoles, electron counts, HOMO/LUMO, size

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Client loading: types, gzip handling, the ESP grid, trilinear sampling, the grid cache

**Files:**
- Create: `src/molecules/library_types.ts`, `src/molecules/binary.ts`, `src/molecules/esp.ts`, `src/molecules/grid_cache.ts`, `tests/molecules/fixtures.ts`, `tests/molecules/binary.test.ts`, `tests/molecules/grid_cache.test.ts`

**Interfaces:**
- Consumes: `MoleculeMeta`, `MoleculeIndexEntry` (Phase 5 `src/molecules/types.ts`); `loadDensityGrid` (Phase 5); `GridFieldSource` (Phase 1).
- Produces:
  ```ts
  export type MoleculeAtom = { Z: number; position: [number, number, number] };          // bohr
  export type MoleculePick = { kind: 'atom'; index: number } | { kind: 'bond'; index: number };
  export interface MoleculeReference { quantity: string; value: number; unit: string; source: string; tolerance?: number; atoms?: number[]; label?: string }
  export interface GridSpec { shape: [number, number, number]; origin: [number, number, number]; spacing: number }
  export interface LibraryExtras { dipoleVectorDebye: [number, number, number]; espGrid: GridSpec; espRangeOnSurface: [number, number]; electronCount: number; densityIntegral: number; multiplicity: number; symmetry: { pointGroup: string; labelGroup: string }; geometryOptimisation?: { converged: boolean; maxGradient: number } }
  export type LibraryMoleculeMeta = MoleculeMeta & LibraryExtras;
  export const LIBRARY_CATEGORIES: ReadonlyArray<{ key: string; label: string }>;
  export function asLibraryMeta(meta: MoleculeMeta): LibraryMoleculeMeta;
  export const MOLECULES_BASE_URL = '/molecules';
  export function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array>;
  export function fetchFloat32Grid(url: string, expectedLength: number): Promise<Float32Array>;
  export interface ScalarGrid extends GridSpec { values: Float32Array }
  export function loadEspGrid(meta: LibraryMoleculeMeta, baseUrl?: string): Promise<ScalarGrid>;
  export function sampleTrilinear(grid: ScalarGrid, x: number, y: number, z: number): number;
  export function getDensityGrid(meta: LibraryMoleculeMeta): Promise<GridFieldSource>;
  export function getEspGrid(meta: LibraryMoleculeMeta): Promise<ScalarGrid>;
  export function clearGridCache(): void;
  ```
- Test fixtures (`tests/molecules/fixtures.ts`): `BOHR_PER_ANGSTROM`, `waterAtoms()`, `methaneAtoms()`, `ozoneAtoms()`, `waterMeta(overrides?)`, `methaneMeta()`.

- [ ] **Step 1: Write the fixtures and failing tests**

```ts
// tests/molecules/fixtures.ts
import type { LibraryMoleculeMeta, MoleculeAtom } from '../../src/molecules/library_types';

export const BOHR_PER_ANGSTROM = 1 / 0.529177210903;
const rad = (deg: number) => (deg * Math.PI) / 180;

function bent(Zc: number, Zl: number, rAngstrom: number, apexDeg: number): MoleculeAtom[] {
    const r = rAngstrom * BOHR_PER_ANGSTROM;
    const h = rad(apexDeg) / 2;
    return [
        { Z: Zc, position: [0, 0, 0] },
        { Z: Zl, position: [0, r * Math.sin(h), r * Math.cos(h)] },
        { Z: Zl, position: [0, -r * Math.sin(h), r * Math.cos(h)] },
    ];
}
export const waterAtoms = () => bent(8, 1, 0.958, 104.5);
export const ozoneAtoms = () => bent(8, 8, 1.278, 116.8);
export function methaneAtoms(): MoleculeAtom[] {
    const s = (1.087 * BOHR_PER_ANGSTROM) / Math.sqrt(3);
    return [{ Z: 6, position: [0, 0, 0] }, ...[[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]
        .map(([a, b, c]) => ({ Z: 1, position: [s * a, s * b, s * c] as [number, number, number] }))];
}

export function waterMeta(overrides: Record<string, unknown> = {}): LibraryMoleculeMeta {
    const half = 6.43;
    return {
        id: 'h2o', name: 'Water', formula: 'H2O', atoms: waterAtoms(),
        geometrySource: 'experiment (CCCBDB)',
        method: { density: 'B3LYP/def2-TZVP', energies: 'B3LYP/def2-TZVP' },
        totalEnergyHartree: -76.46, dipoleDebye: 1.862, dipoleVectorDebye: [0, 0, 1.862],
        orbitals: [
            { index: 0, label: '1a1', energyHartree: -19.13, occupation: 2 },
            { index: 1, label: '2a1', energyHartree: -1.00, occupation: 2 },
            { index: 2, label: '1b2', energyHartree: -0.53, occupation: 2 },
            { index: 3, label: '3a1', energyHartree: -0.38, occupation: 2 },
            { index: 4, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
            { index: 5, label: '4a1', energyHartree: 0.01, occupation: 0, role: 'LUMO' },
        ],
        grid: { shape: [96, 96, 96], origin: [-half, -half, -half], spacing: (2 * half) / 95 },
        espGrid: { shape: [48, 48, 48], origin: [-half, -half, -half], spacing: (2 * half) / 47 },
        espRangeOnSurface: [-0.061, 0.071], electronCount: 10, densityIntegral: 9.998, multiplicity: 1,
        symmetry: { pointGroup: 'C2v', labelGroup: 'C2v' },
        references: [{ quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 }],
        generator: { pyscf: '2.6.0', script: 'tools/molecules/build_library.py', commit: 'abc1234' },
        ...overrides,
    } as unknown as LibraryMoleculeMeta;
}
export const methaneMeta = () => waterMeta({
    id: 'ch4', name: 'Methane', formula: 'CH4', atoms: methaneAtoms(), dipoleDebye: 0.0004, dipoleVectorDebye: [0.0004, 0, 0],
    references: [{ quantity: 'dipole', value: 0, unit: 'D', source: 'zero by symmetry', tolerance: 0.01 }],
});
```

```ts
// tests/molecules/binary.test.ts
import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';
import path from 'path';
import { ReadableStream, DecompressionStream } from 'node:stream/web';
import { gunzipIfNeeded, fetchFloat32Grid } from '../../src/molecules/binary';
import { sampleTrilinear, loadEspGrid, ScalarGrid } from '../../src/molecules/esp';
import { asLibraryMeta } from '../../src/molecules/library_types';
import { waterMeta } from './fixtures';

// jsdom has neither; the browser has both.
Object.assign(globalThis, { ReadableStream, DecompressionStream });

const floats = (values: number[]) => new Uint8Array(new Float32Array(values).buffer);
function mockFetch(body: Uint8Array, ok = true, status = 200) {
    globalThis.fetch = jest.fn(async () => ({ ok, status, arrayBuffer: async () => body.slice().buffer })) as unknown as typeof fetch;
}

describe('gunzipIfNeeded', () => {
    it('inflates gzip', async () => {
        expect(Array.from(await gunzipIfNeeded(new Uint8Array(gzipSync(Buffer.from([1, 2, 3])))))).toEqual([1, 2, 3]);
    });
    it('passes through bytes that are not gzip (the host already applied Content-Encoding)', async () => {
        const raw = floats([1.5, 2.5]);
        expect(await gunzipIfNeeded(raw)).toBe(raw);
    });
});

describe('fetchFloat32Grid', () => {
    it('decodes the expected number of floats', async () => {
        mockFetch(new Uint8Array(gzipSync(Buffer.from(floats([1, 2, 3, 4])))));
        expect(Array.from(await fetchFloat32Grid('/x.bin.gz', 4))).toEqual([1, 2, 3, 4]);
    });
    it('says what went wrong, never returns a short grid', async () => {
        mockFetch(floats([1, 2, 3]));
        await expect(fetchFloat32Grid('/x.bin.gz', 4)).rejects.toThrow('expected 4 values, got 3');
        mockFetch(new Uint8Array(0), false, 404);
        await expect(fetchFloat32Grid('/x.bin.gz', 4)).rejects.toThrow('HTTP 404');
    });
});

describe('sampleTrilinear', () => {
    it('reads the shared Python fixture at the same (i, j, k): 100 i + 10 j + k', async () => {
        const bytes = await gunzipIfNeeded(new Uint8Array(readFileSync(path.resolve(__dirname, '../fixtures/molecules/axis_order.bin.gz'))));
        const grid: ScalarGrid = { shape: [2, 3, 4], origin: [0, 0, 0], spacing: 1, values: new Float32Array(bytes.buffer, bytes.byteOffset, 24) };
        expect(sampleTrilinear(grid, 1, 2, 3)).toBe(123);
        expect(sampleTrilinear(grid, 0.5, 1, 0)).toBeCloseTo(60, 6);
    });
    it('is exact for a linear field and clamps outside the box', () => {
        const n = 5;
        const values = new Float32Array(n ** 3);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) values[(i * n + j) * n + k] = 2 * i - j + 0.5 * k;
        const grid: ScalarGrid = { shape: [n, n, n], origin: [-2, -2, -2], spacing: 1, values };
        const f = (x: number, y: number, z: number) => 2 * (x + 2) - (y + 2) + 0.5 * (z + 2);
        expect(sampleTrilinear(grid, 0.3, -1.7, 1.25)).toBeCloseTo(f(0.3, -1.7, 1.25), 5);
        expect(sampleTrilinear(grid, 99, -99, 0)).toBeCloseTo(f(2, -2, 0), 5);
    });
});

describe('loadEspGrid and asLibraryMeta', () => {
    it('loads the coarse grid named in meta.espGrid', async () => {
        const meta = waterMeta({ espGrid: { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2 } });
        mockFetch(floats([0, 1, 2, 3, 4, 5, 6, 7]));
        const grid = await loadEspGrid(meta);
        expect(globalThis.fetch).toHaveBeenCalledWith('/molecules/h2o/esp.bin.gz');
        expect(grid.values[7]).toBe(7);
        expect(grid.shape).toEqual([2, 2, 2]);
    });
    it('refuses a meta.json that predates the library', () => {
        const { espGrid, ...old } = waterMeta() as unknown as Record<string, unknown>;
        void espGrid;
        expect(() => asLibraryMeta(old as never)).toThrow('h2o: meta.json has no espGrid');
    });
});
```

```ts
// tests/molecules/grid_cache.test.ts
jest.mock('../../src/molecules/loader', () => ({ loadDensityGrid: jest.fn() }));
import { loadDensityGrid } from '../../src/molecules/loader';
import { getDensityGrid, clearGridCache } from '../../src/molecules/grid_cache';
import { waterMeta } from './fixtures';

const load = loadDensityGrid as jest.Mock;

describe('grid cache', () => {
    beforeEach(() => { clearGridCache(); load.mockReset(); });

    it('loads a molecule once however often it is asked for', async () => {
        load.mockResolvedValue({ id: 'h2o' });
        const [a, b] = [getDensityGrid(waterMeta()), getDensityGrid(waterMeta())];
        expect(a).toBe(b);
        await a;
        expect(load).toHaveBeenCalledTimes(1);
    });
    it('forgets a failure, so choosing the molecule again retries', async () => {
        load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'h2o' });
        await expect(getDensityGrid(waterMeta())).rejects.toThrow('offline');
        await expect(getDensityGrid(waterMeta())).resolves.toEqual({ id: 'h2o' });
    });
    it('keeps only the three most recent molecules', async () => {
        load.mockImplementation(async (meta: { id: string }) => ({ id: meta.id }));
        for (const id of ['a', 'b', 'c', 'd']) await getDensityGrid(waterMeta({ id }));
        await getDensityGrid(waterMeta({ id: 'a' }));
        expect(load).toHaveBeenCalledTimes(5);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/binary.test.ts tests/molecules/grid_cache.test.ts`
Expected: FAIL, "Cannot find module '../../src/molecules/binary'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/library_types.ts
import type { MoleculeMeta } from './types';

/**
 * What the molecule library adds to a spec §4.2 meta.json. The §4.2 fields
 * themselves are Phase 5's `MoleculeMeta`; everything here is written by
 * tools/molecules/build_library.py.
 */
export type MoleculeAtom = { Z: number; position: [number, number, number] };
export type MoleculePick = { kind: 'atom'; index: number } | { kind: 'bond'; index: number };
export interface MoleculeReference {
    quantity: string; value: number; unit: string; source: string;
    tolerance?: number; atoms?: number[]; label?: string;
}
export interface GridSpec { shape: [number, number, number]; origin: [number, number, number]; spacing: number }
export interface LibraryExtras {
    /** Debye, from − to + (IUPAC), in the frame of `atoms`. */
    dipoleVectorDebye: [number, number, number];
    espGrid: GridSpec;
    /** ESP extremes (Ha/e) near ρ = 0.001 on the coarse grid; for validation. */
    espRangeOnSurface: [number, number];
    electronCount: number;
    densityIntegral: number;
    multiplicity: number;
    symmetry: { pointGroup: string; labelGroup: string };
    geometryOptimisation?: { converged: boolean; maxGradient: number };
}
export type LibraryMoleculeMeta = MoleculeMeta & LibraryExtras;

export const MOLECULES_BASE_URL = '/molecules';

export const LIBRARY_CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [
    { key: 'first-examples', label: 'First examples' },
    { key: 'hybridisation', label: 'Hybridisation' },
    { key: 'polarity', label: 'Polarity' },
    { key: 'aromatic', label: 'Aromatic' },
    { key: 'biomolecule-fragments', label: 'Biomolecule fragments' },
];

const REQUIRED: Array<keyof LibraryExtras> = ['dipoleVectorDebye', 'espGrid', 'espRangeOnSurface', 'electronCount', 'symmetry'];

/** A meta.json from before the library cannot be drawn honestly (no ESP, no dipole direction); say so rather than guess. */
export function asLibraryMeta(meta: MoleculeMeta): LibraryMoleculeMeta {
    const record = meta as unknown as Record<string, unknown>;
    const missing = REQUIRED.filter(key => record[key] === undefined);
    if (missing.length) {
        throw new Error(`${meta.id}: meta.json has no ${missing.join(', ')}; regenerate it with tools/molecules/build_library.py`);
    }
    return meta as LibraryMoleculeMeta;
}
```

```ts
// src/molecules/binary.ts
/**
 * Float32 grids arrive gzipped (spec §4.2) -- unless the host has already
 * decoded them: S3/CloudFront or a proxy may serve *.bin.gz with
 * Content-Encoding: gzip, and then the browser hands over raw floats. The
 * gzip magic bytes decide, so both work.
 */
export async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
    if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } })
        .pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
}

export async function fetchFloat32Grid(url: string, expectedLength: number): Promise<Float32Array> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
    const bytes = await gunzipIfNeeded(new Uint8Array(await response.arrayBuffer()));
    if (bytes.length !== expectedLength * 4) {
        throw new Error(`${url}: expected ${expectedLength} values, got ${bytes.length / 4}`);
    }
    const aligned = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
    return new Float32Array(aligned.buffer, aligned.byteOffset, expectedLength);
}
```

```ts
// src/molecules/esp.ts
import { fetchFloat32Grid } from './binary';
import { GridSpec, LibraryMoleculeMeta, MOLECULES_BASE_URL } from './library_types';

/** A scalar grid in Phase 1's convention: z fastest, index = (i * ny + j) * nz + k. */
export interface ScalarGrid extends GridSpec { values: Float32Array }

export async function loadEspGrid(meta: LibraryMoleculeMeta, baseUrl: string = MOLECULES_BASE_URL): Promise<ScalarGrid> {
    const { shape, origin, spacing } = meta.espGrid;
    const values = await fetchFloat32Grid(`${baseUrl}/${meta.id}/esp.bin.gz`, shape[0] * shape[1] * shape[2]);
    return { shape, origin, spacing, values };
}

/** Trilinear interpolation, clamped to the box: a vertex a hair outside the last cell reads the edge, not garbage. */
export function sampleTrilinear(grid: ScalarGrid, x: number, y: number, z: number): number {
    const [nx, ny, nz] = grid.shape;
    const cell = (c: number, o: number, n: number): [number, number] => {
        const t = Math.min(n - 1, Math.max(0, (c - o) / grid.spacing));
        const i = Math.min(n - 2, Math.floor(t));
        return [i, t - i];
    };
    const [i, fx] = cell(x, grid.origin[0], nx);
    const [j, fy] = cell(y, grid.origin[1], ny);
    const [k, fz] = cell(z, grid.origin[2], nz);
    const at = (a: number, b: number, c: number) => grid.values[((i + a) * ny + (j + b)) * nz + (k + c)];
    const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
    return lerp(
        lerp(lerp(at(0, 0, 0), at(0, 0, 1), fz), lerp(at(0, 1, 0), at(0, 1, 1), fz), fy),
        lerp(lerp(at(1, 0, 0), at(1, 0, 1), fz), lerp(at(1, 1, 0), at(1, 1, 1), fz), fy),
        fx,
    );
}
```

```ts
// src/molecules/grid_cache.ts
import type { GridFieldSource } from '../field_source';
import { loadDensityGrid } from './loader';
import { loadEspGrid, ScalarGrid } from './esp';
import type { LibraryMoleculeMeta } from './library_types';

/**
 * The typed-array grids stay out of Redux (they are megabytes) and are kept
 * here instead, for the last three molecules: switching back and forth
 * between two costs nothing, and memory stays bounded. A failed load is
 * forgotten, so choosing the molecule again retries.
 */
const CAPACITY = 3;

class PromiseCache<T> {
    private entries = new Map<string, Promise<T>>();
    get(key: string, load: () => Promise<T>): Promise<T> {
        const hit = this.entries.get(key);
        if (hit) {
            this.entries.delete(key);
            this.entries.set(key, hit);
            return hit;
        }
        const promise = load();
        this.entries.set(key, promise);
        promise.catch(() => { if (this.entries.get(key) === promise) this.entries.delete(key); });
        while (this.entries.size > CAPACITY) this.entries.delete(this.entries.keys().next().value as string);
        return promise;
    }
    clear(): void { this.entries.clear(); }
}

const densities = new PromiseCache<GridFieldSource>();
const esps = new PromiseCache<ScalarGrid>();

export const getDensityGrid = (meta: LibraryMoleculeMeta) => densities.get(meta.id, () => loadDensityGrid(meta));
export const getEspGrid = (meta: LibraryMoleculeMeta) => esps.get(meta.id, () => loadEspGrid(meta));
export function clearGridCache(): void { densities.clear(); esps.clear(); }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/binary.test.ts tests/molecules/grid_cache.test.ts && npx tsc --noEmit -p .`
Expected: PASS (11 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/library_types.ts src/molecules/binary.ts src/molecules/esp.ts src/molecules/grid_cache.ts tests/molecules/fixtures.ts tests/molecules/binary.test.ts tests/molecules/grid_cache.test.ts
git commit -m "feat(molecules): load ESP grids, tolerate pre-decoded gzip, sample trilinearly, cache three molecules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: ESP colouring, the 0.001 surface, and the legend

**Files:**
- Create: `src/molecules/esp_color.ts`, `src/components/EspLegend.tsx`, `tests/molecules/esp_color.test.ts`, `tests/molecules/esp_legend.test.tsx`
- Modify: `src/style.css` (append the legend's rules)

**Interfaces:**
- Consumes: `sampleTrilinear`, `ScalarGrid` (Task 8); `hexToRgb01` (`src/curve_colors.ts`); `generateFieldMesh`, `GridFieldSource` (Phase 1, in the test).
- Produces: `ESP_LIMIT_HARTREE = 0.05`, `ESP_SURFACE_DENSITY = 0.001`, `HARTREE_TO_KCAL_PER_MOL = 627.509`, `ESP_STOPS`, `espColorSrgb(value, limit): [number, number, number]`, `espVertexColors(positions: number[][], grid: ScalarGrid, limit: number): { colors: Float32Array; min: number; max: number }` (linear RGB for three.js), `espLegendGradient(): string`, `formatEsp(v): string`, `enclosedFractionForDensity(values: Float32Array, rho: number): number`; `<EspLegend range={[min, max] | null} method="B3LYP/def2-TZVP" />`.

**Why a fixed ±0.05 Ha/e.** An auto-ranged scale stretches each map to its own extremes, so benzene's weak ±0.02 would look as polar as formamide's ±0.08. Comparing molecules, which is how polarity is taught, needs one scale. On the 0.001 surface the 25 molecules span roughly −0.08 to +0.08 Ha/e. At ±0.05 (±31 kcal/mol, the range of common textbook maps) a nonpolar molecule stays near white, which is itself the lesson. The legend states the saturation and shows this molecule's actual range, measured on the drawn vertices.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/molecules/esp_color.test.ts
import * as THREE from 'three';
import { espColorSrgb, espVertexColors, espLegendGradient, enclosedFractionForDensity, ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY, formatEsp } from '../../src/molecules/esp_color';
import { generateFieldMesh } from '../../src/orbital_mesh';
import type { GridFieldSource } from '../../src/field_source';
import { hexToRgb01 } from '../../src/curve_colors';

const L = ESP_LIMIT_HARTREE;
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));

describe('ESP colour map', () => {
    it('is red at −limit, white at 0, blue at +limit, and saturates beyond', () => {
        close(espColorSrgb(-L, L), hexToRgb01('#b2182b'));
        close(espColorSrgb(0, L), hexToRgb01('#f7f7f7'));
        close(espColorSrgb(L, L), hexToRgb01('#2166ac'));
        close(espColorSrgb(-3 * L, L), espColorSrgb(-L, L));
        const [r, , b] = espColorSrgb(-0.3 * L, L);
        expect(r).toBeGreaterThan(b);
    });
    it('writes linear-space vertex colours and reports the range it drew', () => {
        const grid = { shape: [2, 2, 2] as [number, number, number], origin: [-1, -1, -1] as [number, number, number], spacing: 2, values: new Float32Array(8).fill(-L) };
        const { colors, min, max } = espVertexColors([[0, 0, 0], [0.5, 0.5, 0.5]], grid, L);
        const red = new THREE.Color('#b2182b');
        close(Array.from(colors.slice(0, 3)), [red.r, red.g, red.b]);
        expect(min).toBeCloseTo(-L, 6);
        expect(max).toBeCloseTo(-L, 6);
    });
    it('builds the legend gradient from the same stops', () => {
        expect(espLegendGradient()).toBe('linear-gradient(to right, #b2182b 0%, #ef8a62 25%, #f7f7f7 50%, #67a9cf 75%, #2166ac 100%)');
        expect(formatEsp(-0.0612)).toBe('−0.061');
        expect(formatEsp(0.05)).toBe('+0.050');
    });
});

describe('the 0.001 surface as an enclosed fraction', () => {
    it('is the share of the density above the threshold', () => {
        expect(enclosedFractionForDensity(new Float32Array([0.5, 0.0005, 0.002, 0]), 0.001)).toBeCloseTo(0.502 / 0.5025, 9);
    });
    it('makes generateFieldMesh draw ρ = 0.001 on a real grid', () => {
        const n = 41, half = 6, h = (2 * half) / (n - 1);
        const values = new Float32Array(n ** 3);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
            const [x, y, z] = [i, j, k].map(v => -half + v * h);
            values[(i * n + j) * n + k] = Math.exp(-(x * x + y * y + z * z) / 2.88);
        }
        const source: GridFieldSource = { kind: 'grid', id: 'blob', shape: [n, n, n], origin: [-half, -half, -half], spacing: h, quantity: 'density', values };
        const mesh = generateFieldMesh(source, n - 1, enclosedFractionForDensity(values, ESP_SURFACE_DENSITY));
        expect(Math.abs(mesh.isoLevel / ESP_SURFACE_DENSITY - 1)).toBeLessThan(0.03);
    });
});
```

```tsx
// tests/molecules/esp_legend.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import EspLegend from '../../src/components/EspLegend';

describe('EspLegend', () => {
    it('states the scale, units, surface and method, and when this molecule saturates it', () => {
        const { container } = render(<EspLegend range={[-0.061, 0.071]} method="B3LYP/def2-TZVP" />);
        expect(screen.getByText('−0.05')).toBeInTheDocument();
        expect(screen.getByText('+0.05 Ha/e')).toBeInTheDocument();
        expect(container.textContent).toMatch(/±31 kcal\/mol/);
        expect(container.textContent).toMatch(/ρ = 0\.001 e\/a₀³ · B3LYP\/def2-TZVP/);
        expect(container.textContent).toMatch(/this molecule: −0\.061 to \+0\.071 Ha\/e, saturated beyond the scale/);
        expect(container.querySelector('[data-gradient]')?.getAttribute('data-gradient')).toMatch(/^linear-gradient/);
    });
    it('does not claim saturation for a weakly polar molecule', () => {
        const { container } = render(<EspLegend range={[-0.02, 0.019]} method="B3LYP/def2-TZVP" />);
        expect(container.textContent).not.toMatch(/saturated/);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/esp_color.test.ts tests/molecules/esp_legend.test.tsx`
Expected: FAIL, "Cannot find module '../../src/molecules/esp_color'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/esp_color.ts
import * as THREE from 'three';
import { hexToRgb01 } from '../curve_colors';
import { sampleTrilinear, ScalarGrid } from './esp';

/** One fixed, symmetric scale for every molecule, so maps are comparable (see the plan's Task 9). */
export const ESP_LIMIT_HARTREE = 0.05;
/** Bader's molecular surface, the convention ESP maps are drawn on. e/a₀³. */
export const ESP_SURFACE_DENSITY = 0.001;
export const HARTREE_TO_KCAL_PER_MOL = 627.509;

/** ColorBrewer RdBu, in display space: red where the potential is negative (electron-rich). */
export const ESP_STOPS: ReadonlyArray<{ t: number; hex: string }> = [
    { t: -1, hex: '#b2182b' }, { t: -0.5, hex: '#ef8a62' }, { t: 0, hex: '#f7f7f7' }, { t: 0.5, hex: '#67a9cf' }, { t: 1, hex: '#2166ac' },
];
const STOP_RGB = ESP_STOPS.map(stop => hexToRgb01(stop.hex));

/** Interpolated in display space, like the legend's CSS gradient, so the two agree. */
export function espColorSrgb(value: number, limit: number): [number, number, number] {
    const t = Math.max(-1, Math.min(1, value / limit));
    let i = 0;
    while (i < ESP_STOPS.length - 2 && t > ESP_STOPS[i + 1].t) i++;
    const f = (t - ESP_STOPS[i].t) / (ESP_STOPS[i + 1].t - ESP_STOPS[i].t);
    const [a, b] = [STOP_RGB[i], STOP_RGB[i + 1]];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Per-vertex ESP colours in three's linear working space, plus the range actually drawn. */
export function espVertexColors(positions: number[][], grid: ScalarGrid, limit: number): { colors: Float32Array; min: number; max: number } {
    const colors = new Float32Array(positions.length * 3);
    const color = new THREE.Color();
    let min = Infinity;
    let max = -Infinity;
    positions.forEach(([x, y, z], i) => {
        const v = sampleTrilinear(grid, x, y, z);
        if (v < min) min = v;
        if (v > max) max = v;
        const [r, g, b] = espColorSrgb(v, limit);
        color.setRGB(r, g, b, THREE.SRGBColorSpace);
        colors[3 * i] = color.r;
        colors[3 * i + 1] = color.g;
        colors[3 * i + 2] = color.b;
    });
    return { colors, min, max };
}

export function espLegendGradient(): string {
    return `linear-gradient(to right, ${ESP_STOPS.map(s => `${s.hex} ${Math.round((s.t + 1) * 50)}%`).join(', ')})`;
}

export function formatEsp(v: number): string {
    return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(3)}`;
}

/**
 * The enclosed fraction whose contour is ρ = `rho`: the share of Σρ carried
 * by points denser than it. generateFieldMesh inverts this back to the same
 * density, so the ESP surface needs no second meshing path.
 */
export function enclosedFractionForDensity(values: Float32Array, rho: number): number {
    let inside = 0;
    let total = 0;
    for (let i = 0; i < values.length; i++) {
        total += values[i];
        if (values[i] > rho) inside += values[i];
    }
    return Math.min(0.9999, inside / total);
}
```

```tsx
// src/components/EspLegend.tsx
import React from 'react';
import { ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY, HARTREE_TO_KCAL_PER_MOL, espLegendGradient, formatEsp } from '../molecules/esp_color';

interface EspLegendProps {
    /** ESP range on the drawn vertices, Ha/e; null until the surface lands. */
    range: [number, number] | null;
    method: string;
}

/** The ESP map's key, in the bottom-centre slot the ψ legend uses. States the scale, surface and method (§3.1). */
const EspLegend: React.FC<EspLegendProps> = ({ range, method }) => {
    const saturated = range !== null && (range[0] < -ESP_LIMIT_HARTREE || range[1] > ESP_LIMIT_HARTREE);
    return (
        <div className="esp-legend" aria-label="electrostatic potential colour key">
            <div className="esp-legend-bar" data-gradient={espLegendGradient()} style={{ backgroundImage: espLegendGradient() }} />
            <div className="esp-legend-ticks">
                <span>−{ESP_LIMIT_HARTREE}</span><span>0</span><span>+{ESP_LIMIT_HARTREE} Ha/e</span>
            </div>
            <div className="esp-legend-note">
                red: negative, electron-rich · blue: positive, electron-poor · ±{Math.round(ESP_LIMIT_HARTREE * HARTREE_TO_KCAL_PER_MOL)} kcal/mol
            </div>
            <div className="esp-legend-note">on ρ = {ESP_SURFACE_DENSITY} e/a₀³ · {method}</div>
            {range && (
                <div className="esp-legend-note">
                    this molecule: {formatEsp(range[0])} to {formatEsp(range[1])} Ha/e{saturated ? ', saturated beyond the scale' : ''}
                </div>
            )}
        </div>
    );
};

export default EspLegend;
```

Append to `src/style.css`:

```css
/* ESP key and molecule readouts share the phase legend's slot, stacked. */
.molecule-legend-stack {
  position: absolute; left: var(--free-center-x, 50%); bottom: 20px; transform: translateX(-50%);
  z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none;
  max-width: min(420px, calc(100vw - 24px));
}
.esp-legend, .molecule-readout {
  padding: 6px 12px; border-radius: 8px; background: rgba(8, 8, 10, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.16); color: #fff; font-size: 12px; text-align: center;
}
.esp-legend-bar { height: 10px; width: 240px; border-radius: 3px; margin: 2px auto; }
.esp-legend-ticks { display: flex; justify-content: space-between; width: 240px; margin: 0 auto; }
.esp-legend-note { opacity: 0.85; }
@media (max-width: 760px), (max-height: 500px), (max-width: 1100px) and (orientation: portrait) {
  .molecule-legend-stack { bottom: calc(var(--phone-sheet-height, 56px) + 8px); }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/esp_color.test.ts tests/molecules/esp_legend.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (7 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/esp_color.ts src/components/EspLegend.tsx src/style.css tests/molecules/esp_color.test.ts tests/molecules/esp_legend.test.tsx
git commit -m "feat(molecules): ESP on the 0.001 surface, one fixed red-white-blue scale, and its key

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Ball-and-stick, geometry readouts, picking and the dipole arrow

**Files:**
- Create: `src/molecules/ball_and_stick.ts`, `src/molecules/dipole.ts`, `tests/molecules/ball_and_stick.test.ts`

**Interfaces:**
- Consumes: `MoleculeAtom`, `MoleculePick`, `LibraryMoleculeMeta` (Task 8); `elementFor(Z)` (`src/elements.ts`).
- Produces: `BOHR_TO_ANGSTROM`, `COVALENT_RADII_ANGSTROM`, `CPK_COLORS`, `BOND_TOLERANCE = 1.2`, `ATOM_RADIUS_FACTOR = 0.4`, `BOND_RADIUS_BOHR = 0.12`; `interface Bond { a: number; b: number; lengthAngstrom: number }`; `detectBonds(atoms, tolerance?) : Bond[]`; `bondLabel(atoms, bond): string`; `anglesAtAtom(atoms, bonds, vertex): Array<{ label: string; degrees: number; count: number }>`; `describePick(atoms, bonds, pick): string[]`; `buildBallAndStick(atoms, bonds): THREE.Group`; `pickMoleculePart(overlay: THREE.Object3D, raycaster: THREE.Raycaster): MoleculePick | null`; `disposeOverlay(group: THREE.Object3D): void`. `DIPOLE_BOHR_PER_DEBYE = 1`, `DIPOLE_MIN_DEBYE = 0.05`, `dipoleArrow(meta): THREE.ArrowHelper | null`, `formatDipole(meta): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/molecules/ball_and_stick.test.ts
import * as THREE from 'three';
import { detectBonds, anglesAtAtom, describePick, buildBallAndStick, pickMoleculePart, bondLabel } from '../../src/molecules/ball_and_stick';
import { dipoleArrow, formatDipole } from '../../src/molecules/dipole';
import { waterAtoms, methaneAtoms, ozoneAtoms, waterMeta, methaneMeta } from './fixtures';

describe('bonds from distances', () => {
    it('finds water’s two O–H bonds at 0.958 Å, and no H–H', () => {
        const bonds = detectBonds(waterAtoms());
        expect(bonds.map(b => [b.a, b.b])).toEqual([[0, 1], [0, 2]]);
        bonds.forEach(b => expect(b.lengthAngstrom).toBeCloseTo(0.958, 6));
        expect(bondLabel(waterAtoms(), bonds[0])).toBe('O–H');
    });
    it('does not join methane’s hydrogens or ozone’s terminal oxygens', () => {
        expect(detectBonds(methaneAtoms())).toHaveLength(4);
        expect(detectBonds(ozoneAtoms())).toHaveLength(2);
    });
    it('refuses an element it has no radius for, rather than guessing', () => {
        expect(() => detectBonds([{ Z: 26, position: [0, 0, 0] }])).toThrow('no covalent radius for Fe');
    });
});

describe('readouts', () => {
    it('reports water’s angle at O and a hydrogen’s neighbour', () => {
        const atoms = waterAtoms();
        const bonds = detectBonds(atoms);
        expect(anglesAtAtom(atoms, bonds, 0)).toEqual([{ label: 'H–O–H', degrees: 104.5, count: 1 }]);
        expect(describePick(atoms, bonds, { kind: 'atom', index: 0 })).toEqual(['O, atom 1', '∠H–O–H 104.5°']);
        expect(describePick(atoms, bonds, { kind: 'atom', index: 2 })).toEqual(['H, atom 3', 'bonded to O']);
        expect(describePick(atoms, bonds, { kind: 'bond', index: 1 })).toEqual(['O–H 0.958 Å']);
    });
    it('groups methane’s six equal angles', () => {
        const atoms = methaneAtoms();
        expect(anglesAtAtom(atoms, detectBonds(atoms), 0)).toEqual([{ label: 'H–C–H', degrees: 109.5, count: 6 }]);
    });
});

describe('the ball-and-stick group', () => {
    const atoms = waterAtoms();
    const bonds = detectBonds(atoms);
    const group = buildBallAndStick(atoms, bonds);

    it('has a sphere per atom and two half-sticks per bond, tagged for picking', () => {
        const parts = group.children.map(c => c.userData.moleculePart);
        expect(parts.filter(p => p === 'atom')).toHaveLength(3);
        expect(parts.filter(p => p === 'bond')).toHaveLength(4);
    });
    it('picks the atom or bond under a ray', () => {
        const raycaster = new THREE.Raycaster();
        raycaster.set(new THREE.Vector3(10, 0, 0), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toEqual({ kind: 'atom', index: 0 });
        const [, y, z] = atoms[1].position;
        raycaster.set(new THREE.Vector3(10, y / 2, z / 2), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toEqual({ kind: 'bond', index: 0 });
        raycaster.set(new THREE.Vector3(10, 30, 30), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toBeNull();
    });
});

describe('the dipole arrow', () => {
    it('starts at the centre of nuclear charge and is 1 a₀ per debye, pointing − to +', () => {
        const arrow = dipoleArrow(waterMeta())!;
        const atoms = waterAtoms();
        const cz = atoms.reduce((s, a) => s + a.Z * a.position[2], 0) / 10;
        expect(arrow.position.z).toBeCloseTo(cz, 9);
        const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
        expect(direction.z).toBeCloseTo(1, 9);
        expect(arrow.userData.lengthBohr).toBeCloseTo(1.862, 9);
    });
    it('draws no arrow below 0.05 D, where the direction is noise', () => {
        expect(dipoleArrow(methaneMeta())).toBeNull();
    });
    it('states the method and the experimental value', () => {
        expect(formatDipole(waterMeta())).toBe('μ = 1.86 D (B3LYP/def2-TZVP) · experiment 1.855 D');
        expect(formatDipole(methaneMeta())).toBe('μ = 0 by symmetry (computed 0.00 D, B3LYP/def2-TZVP)');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/ball_and_stick.test.ts`
Expected: FAIL, "Cannot find module '../../src/molecules/ball_and_stick'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/ball_and_stick.ts
import * as THREE from 'three';
import { elementFor } from '../elements';
import type { MoleculeAtom, MoleculePick } from './library_types';

export const BOHR_TO_ANGSTROM = 0.529177210903;
/** Cordero et al. 2008 (C sp³). Every element in the library, and no guessing beyond it. */
export const COVALENT_RADII_ANGSTROM: Record<number, number> = { 1: 0.31, 5: 0.84, 6: 0.76, 7: 0.71, 8: 0.66, 9: 0.57, 14: 1.11, 15: 1.07, 16: 1.05 };
/** Jmol's CPK palette. */
export const CPK_COLORS: Record<number, string> = { 1: '#ffffff', 5: '#ffb5b5', 6: '#909090', 7: '#3050f8', 8: '#ff0d0d', 9: '#90e050', 14: '#f0c8a0', 15: '#ff8000', 16: '#ffff30' };
export const BOND_TOLERANCE = 1.2;
export const ATOM_RADIUS_FACTOR = 0.4;
export const BOND_RADIUS_BOHR = 0.12;

export interface Bond { a: number; b: number; lengthAngstrom: number }

const symbol = (Z: number) => elementFor(Z)?.symbol ?? `Z${Z}`;
function radius(Z: number): number {
    const r = COVALENT_RADII_ANGSTROM[Z];
    if (r === undefined) throw new Error(`no covalent radius for ${symbol(Z)}`);
    return r;
}
const vec = (atom: MoleculeAtom) => new THREE.Vector3(...atom.position);

/**
 * Connectivity from distance alone: a stick wherever two atoms are closer
 * than 1.2 × the sum of their covalent radii. It says which atoms are
 * joined, not the bond order -- the caption says so.
 */
export function detectBonds(atoms: MoleculeAtom[], tolerance: number = BOND_TOLERANCE): Bond[] {
    atoms.forEach(atom => radius(atom.Z));
    const bonds: Bond[] = [];
    for (let a = 0; a < atoms.length; a++) {
        for (let b = a + 1; b < atoms.length; b++) {
            const d = vec(atoms[a]).distanceTo(vec(atoms[b])) * BOHR_TO_ANGSTROM;
            if (d < tolerance * (radius(atoms[a].Z) + radius(atoms[b].Z))) bonds.push({ a, b, lengthAngstrom: d });
        }
    }
    return bonds;
}

export function bondLabel(atoms: MoleculeAtom[], bond: Bond): string {
    return `${symbol(atoms[bond.a].Z)}–${symbol(atoms[bond.b].Z)}`;
}

export function anglesAtAtom(atoms: MoleculeAtom[], bonds: Bond[], vertex: number): Array<{ label: string; degrees: number; count: number }> {
    const neighbours = bonds.filter(b => b.a === vertex || b.b === vertex).map(b => (b.a === vertex ? b.b : b.a));
    const groups = new Map<string, { label: string; degrees: number; count: number }>();
    for (let i = 0; i < neighbours.length; i++) {
        for (let j = i + 1; j < neighbours.length; j++) {
            const u = vec(atoms[neighbours[i]]).sub(vec(atoms[vertex]));
            const w = vec(atoms[neighbours[j]]).sub(vec(atoms[vertex]));
            const degrees = Math.round(THREE.MathUtils.radToDeg(u.angleTo(w)) * 10) / 10;
            const ends = [symbol(atoms[neighbours[i]].Z), symbol(atoms[neighbours[j]].Z)].sort();
            const label = `${ends[0]}–${symbol(atoms[vertex].Z)}–${ends[1]}`;
            const key = `${label}|${degrees}`;
            const group = groups.get(key) ?? { label, degrees, count: 0 };
            group.count += 1;
            groups.set(key, group);
        }
    }
    return [...groups.values()].sort((p, q) => p.degrees - q.degrees);
}

export function describePick(atoms: MoleculeAtom[], bonds: Bond[], pick: MoleculePick): string[] {
    if (pick.kind === 'bond') {
        const bond = bonds[pick.index];
        return [`${bondLabel(atoms, bond)} ${bond.lengthAngstrom.toFixed(3)} Å`];
    }
    const head = `${symbol(atoms[pick.index].Z)}, atom ${pick.index + 1}`;
    const angles = anglesAtAtom(atoms, bonds, pick.index);
    if (angles.length) return [head, ...angles.map(a => `∠${a.label} ${a.degrees.toFixed(1)}°${a.count > 1 ? ` (×${a.count})` : ''}`)];
    const neighbours = bonds.filter(b => b.a === pick.index || b.b === pick.index).map(b => symbol(atoms[b.a === pick.index ? b.b : b.a].Z));
    return [head, neighbours.length ? `bonded to ${neighbours.join(', ')}` : 'not bonded'];
}

const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const STICK = new THREE.CylinderGeometry(BOND_RADIUS_BOHR, BOND_RADIUS_BOHR, 1, 12);

/**
 * Spheres and half-sticks, each coloured by its own atom. Deliberately not
 * clipped by the cut: the cut is for seeing inside the density, and the
 * structure is what you are looking for in there.
 */
export function buildBallAndStick(atoms: MoleculeAtom[], bonds: Bond[]): THREE.Group {
    const group = new THREE.Group();
    group.userData.isBallAndStick = true;
    const materials = new Map<number, THREE.MeshStandardMaterial>();
    const material = (Z: number) => {
        if (!materials.has(Z)) materials.set(Z, new THREE.MeshStandardMaterial({ color: CPK_COLORS[Z], roughness: 0.45, metalness: 0 }));
        return materials.get(Z)!;
    };
    atoms.forEach((atom, index) => {
        const sphere = new THREE.Mesh(SPHERE, material(atom.Z));
        sphere.scale.setScalar(ATOM_RADIUS_FACTOR * radius(atom.Z) / BOHR_TO_ANGSTROM);
        sphere.position.copy(vec(atom));
        sphere.userData = { moleculePart: 'atom', index };
        group.add(sphere);
    });
    const up = new THREE.Vector3(0, 1, 0);
    bonds.forEach((bond, index) => {
        const [p, q] = [vec(atoms[bond.a]), vec(atoms[bond.b])];
        const middle = p.clone().add(q).multiplyScalar(0.5);
        for (const [end, Z] of [[p, atoms[bond.a].Z], [q, atoms[bond.b].Z]] as Array<[THREE.Vector3, number]>) {
            const half = new THREE.Mesh(STICK, material(Z));
            half.position.copy(end).add(middle).multiplyScalar(0.5);
            half.scale.set(1, end.distanceTo(middle), 1);
            half.quaternion.setFromUnitVectors(up, middle.clone().sub(end).normalize());
            half.userData = { moleculePart: 'bond', index };
            group.add(half);
        }
    });
    group.updateMatrixWorld(true);
    return group;
}

export function pickMoleculePart(overlay: THREE.Object3D, raycaster: THREE.Raycaster): MoleculePick | null {
    for (const hit of raycaster.intersectObject(overlay, true)) {
        const part = hit.object.userData.moleculePart;
        if (part === 'atom' || part === 'bond') return { kind: part, index: hit.object.userData.index };
    }
    return null;
}

/** Materials are per-group; the two shared geometries are module-level and live for the page. */
export function disposeOverlay(group: THREE.Object3D): void {
    group.traverse(child => {
        if (child instanceof THREE.ArrowHelper) child.dispose();
        else if (child instanceof THREE.Mesh && child.geometry !== SPHERE && child.geometry !== STICK) child.geometry.dispose();
        if (child instanceof THREE.Mesh) (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => m.dispose());
    });
}
```

```ts
// src/molecules/dipole.ts
import * as THREE from 'three';
import type { LibraryMoleculeMeta } from './library_types';

export const DIPOLE_BOHR_PER_DEBYE = 1;
/** Below this the computed direction of a symmetric molecule's (zero) dipole is numerical noise. */
export const DIPOLE_MIN_DEBYE = 0.05;
const ARROW_COLOR = '#ffd166';

/**
 * μ from − to + (the IUPAC and physics convention), from the centre of
 * nuclear charge, 1 a₀ per debye. Drawn over everything: it is an
 * annotation, and inside an opaque density it would otherwise vanish.
 */
export function dipoleArrow(meta: LibraryMoleculeMeta): THREE.ArrowHelper | null {
    const mu = new THREE.Vector3(...meta.dipoleVectorDebye);
    const magnitude = mu.length();
    if (magnitude < DIPOLE_MIN_DEBYE) return null;
    const totalZ = meta.atoms.reduce((sum, atom) => sum + atom.Z, 0);
    const origin = meta.atoms
        .reduce((sum, atom) => sum.add(new THREE.Vector3(...atom.position).multiplyScalar(atom.Z)), new THREE.Vector3())
        .divideScalar(totalZ);
    const length = magnitude * DIPOLE_BOHR_PER_DEBYE;
    const head = Math.min(0.35 * length, 0.6);
    const arrow = new THREE.ArrowHelper(mu.normalize(), origin, length, ARROW_COLOR, head, 0.6 * head);
    arrow.userData = { isDipoleArrow: true, lengthBohr: length };
    arrow.renderOrder = 5;
    for (const material of [arrow.line.material, arrow.cone.material] as THREE.Material[]) material.depthTest = false;
    return arrow;
}

export function formatDipole(meta: LibraryMoleculeMeta): string {
    const method = meta.method.density;
    const reference = meta.references.find(r => r.quantity === 'dipole');
    if (reference && reference.value === 0) return `μ = 0 by symmetry (computed ${meta.dipoleDebye.toFixed(2)} D, ${method})`;
    const experiment = reference ? ` · experiment ${reference.value} D` : '';
    return `μ = ${meta.dipoleDebye.toFixed(2)} D (${method})${experiment}`;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/ball_and_stick.test.ts && npx tsc --noEmit -p .`
Expected: PASS (11 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/ball_and_stick.ts src/molecules/dipole.ts tests/molecules/ball_and_stick.test.ts
git commit -m "feat(molecules): ball-and-stick from covalent radii, length and angle readouts, picking, dipole arrow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: Visualizer support and the density-grid worker

**Files:**
- Modify: `src/orbital_visualizer.ts`
- Create: `src/molecules/grid_mesh_request.ts`, `src/workers/gridMeshWorker.ts`, `src/workers/createGridMeshWorker.ts`, `src/molecules/mesh_worker_client.ts`, `tests/molecules/visualizer_molecule.test.ts`, `tests/molecules/grid_mesh_worker.test.ts`

**Interfaces:**
- Consumes: `updateSceneWithMeshData(context, meshData, crossFadeFromShellView?)` as Phase 1 leaves it; `generateFieldMesh`, `GridFieldSource` (Phase 1); `disposeOverlay` (Task 10).
- Produces:
  ```ts
  // orbital_visualizer.ts
  // VisualizerContext gains: moleculeOverlay?: THREE.Group | null
  export interface PresentFieldMeshOptions { vertexColors?: Float32Array; boxRMax: number; showAxes?: boolean }
  export function presentFieldMesh(context: VisualizerContext | null, meshData: MeshData, options: PresentFieldMeshOptions): number; // surface radius
  export function clearFieldMesh(context: VisualizerContext | null): void;
  export function setMoleculeOverlay(context: VisualizerContext | null, overlay: THREE.Group | null): void;
  export function pointerRaycaster(context: VisualizerContext, event: PointerEvent): THREE.Raycaster;
  // grid_mesh_request.ts
  export interface GridMeshRequest { type: 'calculate'; source: GridFieldSource; enclosedFraction: number; requestId: number }
  export type MeshWorkerResponse = { type: 'success'; meshData: MeshData; requestId: number } | { type: 'error'; message: string; requestId: number };
  export function handleGridMeshRequest(request: GridMeshRequest): MeshWorkerResponse;
  // createGridMeshWorker.ts
  export function createGridMeshWorker(): Worker;
  // mesh_worker_client.ts
  export function runMeshWorker(worker: Worker, request: GridMeshRequest): Promise<MeshData>;
  ```
- Framing reuses `framedBox`: a molecule's density and its MOs share one box (`meta.grid` half-width), so switching between them keeps the camera, as switching mₗ does today. `presentFieldMesh` re-frames only when `boxRMax` changes.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/molecules/visualizer_molecule.test.ts
import * as THREE from 'three';

jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { VisualizerContext, presentFieldMesh, clearFieldMesh, setMoleculeOverlay, pointerRaycaster } from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, MeshData } from '../../src/types/orbital';

/** As tests/atom/visualizer_dispatch.test.ts: a context without a WebGL renderer. */
function buildContext(): VisualizerContext {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: canvas } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
    };
}

const mesh = (): MeshData => ({
    positions: [[0, 0, 0], [2, 0, 0], [0, 2, 0]], cells: [[0, 1, 2]], psiSigns: [1, 1, 1],
    densityMap: { data: new Uint8Array(1), side: 1, rMax: 6 }, isoLevel: 0.001,
});

describe('presentFieldMesh', () => {
    it('draws the mesh with the given vertex colours verbatim', () => {
        const context = buildContext();
        const colors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        expect(presentFieldMesh(context, mesh(), { vertexColors: colors, boxRMax: 6 })).toBeCloseTo(2, 9);
        const surface = context.currentOrbitalGroup!.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh;
        expect(Array.from((surface.geometry.getAttribute('color') as THREE.BufferAttribute).array)).toEqual(Array.from(colors));
    });
    it('refuses colours that do not match the vertices', () => {
        expect(() => presentFieldMesh(buildContext(), mesh(), { vertexColors: new Float32Array(3), boxRMax: 6 })).toThrow(/3 vertices/);
    });
    it('re-frames only when the box changes, and supersedes any calculation in flight', () => {
        const context = buildContext();
        const worker = { terminate: jest.fn() } as unknown as Worker;
        context.activeWorker = worker;
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(worker.terminate).toHaveBeenCalled();
        expect(context.requestCounter).toBe(1);
        const framed = context.camera.position.clone();
        context.camera.position.set(1, 2, 3);
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(context.camera.position.toArray()).toEqual([1, 2, 3]);
        presentFieldMesh(context, mesh(), { boxRMax: 7 });
        expect(context.camera.position.length()).toBeCloseTo(framed.length(), 6);
    });
    it('clearFieldMesh empties the scene of the surface', () => {
        const context = buildContext();
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        clearFieldMesh(context);
        expect(context.currentOrbitalGroup).toBeNull();
    });
});

describe('the molecule overlay', () => {
    it('is added, replaced (disposing the old one) and removed, independent of the surface', () => {
        const context = buildContext();
        const first = new THREE.Group();
        const material = new THREE.MeshBasicMaterial();
        const dispose = jest.spyOn(material, 'dispose');
        first.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
        setMoleculeOverlay(context, first);
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(context.scene.children).toContain(first);
        const second = new THREE.Group();
        setMoleculeOverlay(context, second);
        expect(context.scene.children).not.toContain(first);
        expect(dispose).toHaveBeenCalled();
        setMoleculeOverlay(context, null);
        expect(context.scene.children).not.toContain(second);
    });
    it('casts the pointer ray through the canvas', () => {
        const ray = pointerRaycaster(buildContext(), { clientX: 50, clientY: 50 } as PointerEvent).ray;
        expect(ray.direction.z).toBeCloseTo(-1, 6);
    });
});
```

```ts
// tests/molecules/grid_mesh_worker.test.ts
import { handleGridMeshRequest } from '../../src/molecules/grid_mesh_request';
import { runMeshWorker } from '../../src/molecules/mesh_worker_client';
import type { GridFieldSource } from '../../src/field_source';

function blob(n = 17, half = 4): GridFieldSource {
    const h = (2 * half) / (n - 1);
    const values = new Float32Array(n ** 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const [x, y, z] = [i, j, k].map(v => -half + v * h);
        values[(i * n + j) * n + k] = Math.exp(-(x * x + y * y + z * z));
    }
    return { kind: 'grid', id: 'blob', shape: [n, n, n], origin: [-half, -half, -half], spacing: h, quantity: 'density', values };
}

describe('grid meshing', () => {
    it('meshes a density grid on its own resolution', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), enclosedFraction: 0.9, requestId: 7 });
        expect(response.type).toBe('success');
        expect(response.requestId).toBe(7);
    });
    it('reports a failure as a message', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), enclosedFraction: 1.5, requestId: 8 });
        expect(response).toEqual(expect.objectContaining({ type: 'error', requestId: 8 }));
    });
    it('runMeshWorker resolves on its own reply, ignoring a stale one', async () => {
        const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null };
        const pending = runMeshWorker(worker as unknown as Worker, { type: 'calculate', source: blob(), enclosedFraction: 0.9, requestId: 2 });
        worker.onmessage!({ data: { type: 'success', meshData: 'stale', requestId: 1 } });
        worker.onmessage!({ data: { type: 'success', meshData: 'mine', requestId: 2 } });
        await expect(pending).resolves.toBe('mine');
        expect(worker.terminate).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/visualizer_molecule.test.ts tests/molecules/grid_mesh_worker.test.ts`
Expected: FAIL, "presentFieldMesh is not a function" and "Cannot find module '../../src/molecules/grid_mesh_request'".

- [ ] **Step 3: Implement the visualizer changes**

In `src/orbital_visualizer.ts`:

1. Add to `VisualizerContext`:
```ts
    /**
     * A molecule's ball-and-stick and dipole arrow. Kept apart from
     * currentOrbitalGroup so switching density / ESP / orbital, which
     * replaces that group, leaves the structure in place.
     */
    moleculeOverlay?: THREE.Group | null;
```
2. Add `import { disposeOverlay } from './molecules/ball_and_stick';`.
3. Give `updateSceneWithMeshData` a trailing parameter `vertexColors?: Float32Array` and wrap its existing per-vertex colouring loop, whatever Phase 1 left there:
```ts
        if (vertexColors) {
            // A caller-supplied colouring (the ESP map) replaces the phase colours outright.
            if (vertexColors.length !== meshData.positions.length * 3) {
                throw new Error(`mesh has ${meshData.positions.length} vertices, vertex colours given for ${vertexColors.length / 3}`);
            }
            colors.set(vertexColors);
        } else {
            // ...the existing psiSigns colouring loop, unchanged...
        }
```
4. After `updateFieldInScene`, add:
```ts
/**
 * Draws a mesh computed elsewhere (a molecule's density grid, meshed in its
 * own worker) with the same caps, cut extent, framing and axes discipline as
 * an orbital. Supersedes anything in flight: the newest request owns the
 * scene. Re-frames only when the box changes, so a molecule's density and
 * its orbitals, which share one box, keep the user's camera.
 */
export interface PresentFieldMeshOptions { vertexColors?: Float32Array; boxRMax: number; showAxes?: boolean }

export function presentFieldMesh(context: VisualizerContext | null, meshData: MeshData, options: PresentFieldMeshOptions): number {
    if (!context || context.isDisposed) return 0;
    context.activeWorker?.terminate();
    context.activeWorker = null;
    context.requestCounter++;
    cancelTransition(context);
    updateSceneWithMeshData(context, meshData, false, options.vertexColors);
    const surfaceRadius = meshRadius(meshData) || options.boxRMax;
    context.clipExtent = surfaceRadius;
    updateClipPlane(context.clipPlane, context.surfaceStyle.clipAxis, context.surfaceStyle.clipPosition, surfaceRadius);
    refreshCaps(context);
    if (context.framedBox !== options.boxRMax) {
        frameOrbital(context, (surfaceRadius * ORBITAL_FRAMING_MARGIN) / Math.sqrt(3));
        context.framedBox = options.boxRMax;
    }
    if (options.showAxes) addAxesHelper(context, surfaceRadius * AXES_LENGTH_FACTOR);
    else removeAxesHelper(context);
    return surfaceRadius;
}

/** Clears the surface (not the overlay), e.g. on entering Molecules with nothing chosen yet. */
export function clearFieldMesh(context: VisualizerContext | null): void {
    if (!context || context.isDisposed) return;
    context.activeWorker?.terminate();
    context.activeWorker = null;
    context.requestCounter++;
    clearCurrentOrbital(context, context.scene);
    removeAxesHelper(context);
    context.framedBox = undefined;
}

export function setMoleculeOverlay(context: VisualizerContext | null, overlay: THREE.Group | null): void {
    if (!context || context.isDisposed) return;
    if (context.moleculeOverlay) {
        context.scene.remove(context.moleculeOverlay);
        disposeOverlay(context.moleculeOverlay);
    }
    context.moleculeOverlay = overlay;
    if (overlay) context.scene.add(overlay);
}

/** The shared raycaster, aimed through the pointer (the same arithmetic radiusUnderPointer uses). */
export function pointerRaycaster(context: VisualizerContext, event: PointerEvent): THREE.Raycaster {
    const bounds = context.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, context.camera);
    return raycaster;
}
```
5. In `cleanupVisualizer`, call `setMoleculeOverlay(context, null);` before `clearCurrentOrbital`.

- [ ] **Step 4: Implement the worker pieces**

```ts
// src/molecules/grid_mesh_request.ts
import type { GridFieldSource } from '../field_source';
import { generateFieldMesh } from '../orbital_mesh';
import type { MeshData } from '../types/orbital';

export interface GridMeshRequest { type: 'calculate'; source: GridFieldSource; enclosedFraction: number; requestId: number }
export type MeshWorkerResponse =
    | { type: 'success'; meshData: MeshData; requestId: number }
    | { type: 'error'; message: string; requestId: number };

/** The worker's whole job, kept pure so it is testable without a Worker. A grid is meshed at its own resolution (Phase 1's rule). */
export function handleGridMeshRequest(request: GridMeshRequest): MeshWorkerResponse {
    try {
        const meshData = generateFieldMesh(request.source, request.source.shape[0] - 1, request.enclosedFraction);
        return { type: 'success', meshData, requestId: request.requestId };
    } catch (error) {
        return { type: 'error', message: error instanceof Error ? error.message : 'Could not mesh this grid', requestId: request.requestId };
    }
}
```

```ts
// src/workers/gridMeshWorker.ts
import { GridMeshRequest, handleGridMeshRequest } from '../molecules/grid_mesh_request';

interface WorkerScope {
    onmessage: ((event: MessageEvent<GridMeshRequest>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
}
const worker = self as unknown as WorkerScope;

worker.onmessage = event => {
    if (event.data.type !== 'calculate') return;
    const response = handleGridMeshRequest(event.data);
    worker.postMessage(response, response.type === 'success' ? [response.meshData.densityMap.data.buffer] : []);
};
```

```ts
// src/workers/createGridMeshWorker.ts
/** Isolated for the same reason as createOrbitalWorker.ts: import.meta.url does not load under ts-jest. */
export function createGridMeshWorker(): Worker {
    return new Worker(new URL('./gridMeshWorker.ts', import.meta.url), { type: 'module' });
}
```

```ts
// src/molecules/mesh_worker_client.ts
import type { MeshData } from '../types/orbital';
import type { GridMeshRequest, MeshWorkerResponse } from './grid_mesh_request';

/**
 * One request, one reply, then the worker is done. The grid is copied, not
 * transferred: the cache keeps the main thread's copy for the next surface.
 */
export function runMeshWorker(worker: Worker, request: GridMeshRequest): Promise<MeshData> {
    return new Promise((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
            if (event.data.requestId !== request.requestId) return;
            worker.terminate();
            if (event.data.type === 'success') resolve(event.data.meshData);
            else reject(new Error(event.data.message));
        };
        worker.onerror = (event: ErrorEvent) => {
            worker.terminate();
            reject(new Error(event.message || 'The meshing worker failed'));
        };
        worker.postMessage(request);
    });
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/molecules/visualizer_molecule.test.ts tests/molecules/grid_mesh_worker.test.ts tests/atom/visualizer_dispatch.test.ts && npx tsc --noEmit -p .`
Expected: PASS, the existing dispatch tests included; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/orbital_visualizer.ts src/molecules/grid_mesh_request.ts src/molecules/mesh_worker_client.ts src/workers/gridMeshWorker.ts src/workers/createGridMeshWorker.ts tests/molecules/visualizer_molecule.test.ts tests/molecules/grid_mesh_worker.test.ts
git commit -m "feat(render): present precomputed meshes with vertex colours, a persistent molecule overlay, grid worker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Molecule-mode state and its URL keys

**Files:**
- Create: `src/store/moleculeSlice.ts`, `src/molecules/url_keys.ts`, `tests/molecules/molecule_slice.test.ts`
- Modify: `src/store/atomSlice.ts` (`ViewMode`), `src/url_state.ts` (`URL_MODE`), `src/store/index.ts`, `src/main.tsx`

**Interfaces:**
- Consumes: `LibraryMoleculeMeta`, `MoleculePick` (Task 8); `MoleculeIndexEntry` (Phase 5); `registerUrlKeys`, `URL_MODE` (Phase 2); `setMode` (atomSlice); `RootState`, `AppDispatch`.
- Produces:
  ```ts
  export type ViewMode = 'atom' | 'hydrogenic' | 'bonds' | 'molecule';
  export type MoleculeSurface = { kind: 'density' } | { kind: 'esp' } | { kind: 'mo'; index: number };
  export interface MoleculeState {
      index: MoleculeIndexEntry[] | null; indexError: string | null;
      selectedId: string | null; meta: LibraryMoleculeMeta | null; isLoadingMeta: boolean; error: string | null;
      surface: MoleculeSurface; showStructure: boolean; showDipole: boolean; pick: MoleculePick | null;
      loadNonce: number;
      renderLabel: string | null; renderError: string | null; isoLevel: number | null; espRange: [number, number] | null;
  }
  // actions
  indexLoaded(entries), indexFailed(message), selectMolecule({ id, surface? }), metaLoaded({ id, meta }), metaFailed({ id, message }),
  setSurface(surface), setShowStructure(boolean), setShowDipole(boolean), setPick(pick | null),
  renderStarted(label), renderFinished({ isoLevel, espRange? }), renderFailed(message)
  // url_keys.ts
  export function encodeMoleculeUrl(state: MoleculeState): Record<string, string>;
  export function decodeMoleculeUrl(params: Record<string, string>): { id?: string; surface?: MoleculeSurface; structure?: boolean; dipole?: boolean };
  export function registerMoleculeUrlKeys(): void;
  ```
- URL keys (spec §4.3 example `#mode=molecule&id=h2o&show=mo:4&iso=0.9`): `mode=molecule` (via `URL_MODE`), `id`, `show` (`density` | `esp` | `mo:<index>`), `struct=0`, `dipole=0` (written only when off). The contour key is Phase 2's shared `frac`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/molecules/molecule_slice.test.ts
import reducer, {
    selectMolecule, metaLoaded, metaFailed, setSurface, renderStarted, renderFinished, renderFailed, indexLoaded,
} from '../../src/store/moleculeSlice';
import { encodeMoleculeUrl, decodeMoleculeUrl } from '../../src/molecules/url_keys';
import { waterMeta } from './fixtures';

const init = () => reducer(undefined, { type: '@@init' });

describe('moleculeSlice', () => {
    it('starts empty: nothing is loaded until a molecule is chosen', () => {
        const s = init();
        expect([s.index, s.selectedId, s.meta]).toEqual([null, null, null]);
        expect(s.surface).toEqual({ kind: 'density' });
    });
    it('selecting clears the old molecule and bumps the nonce, even for the same id', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        const nonce = s.loadNonce;
        s = reducer(s, selectMolecule({ id: 'h2o' }));
        expect(s.meta).toBeNull();
        expect(s.isLoadingMeta).toBe(true);
        expect(s.loadNonce).toBe(nonce + 1);
    });
    it('ignores a meta that arrives for a molecule no longer selected', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, selectMolecule({ id: 'nh3' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(s.meta).toBeNull();
    });
    it('keeps a density or ESP choice across molecules but not an orbital index', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, setSurface({ kind: 'esp' }));
        expect(reducer(s, selectMolecule({ id: 'nh3' })).surface).toEqual({ kind: 'esp' });
        s = reducer(s, setSurface({ kind: 'mo', index: 4 }));
        expect(reducer(s, selectMolecule({ id: 'nh3' })).surface).toEqual({ kind: 'density' });
    });
    it('drops an orbital the molecule does not have, from a URL or anywhere', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o', surface: { kind: 'mo', index: 99 } }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(s.surface).toEqual({ kind: 'density' });
        expect(reducer(s, setSurface({ kind: 'mo', index: 99 })).surface).toEqual({ kind: 'density' });
        expect(reducer(s, setSurface({ kind: 'mo', index: 4 })).surface).toEqual({ kind: 'mo', index: 4 });
    });
    it('reports a failed load explicitly', () => {
        let s = reducer(init(), selectMolecule({ id: 'xyz' }));
        s = reducer(s, metaFailed({ id: 'xyz', message: 'HTTP 404' }));
        expect(s.error).toBe('Could not load “xyz”: HTTP 404');
        expect(s.isLoadingMeta).toBe(false);
    });
    it('tracks the render: busy label, result, failure', () => {
        let s = reducer(init(), renderStarted('Loading Water…'));
        expect(s.renderLabel).toBe('Loading Water…');
        s = reducer(s, renderFinished({ isoLevel: 0.001, espRange: [-0.06, 0.07] }));
        expect([s.renderLabel, s.isoLevel, s.espRange]).toEqual([null, 0.001, [-0.06, 0.07]]);
        s = reducer(s, renderFailed('No isosurface'));
        expect(s.renderError).toBe('No isosurface');
        expect(reducer(s, indexLoaded([])).index).toEqual([]);
    });
});

describe('molecule URL keys', () => {
    it('round-trips', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, setSurface({ kind: 'mo', index: 4 }));
        const encoded = encodeMoleculeUrl({ ...s, showDipole: false });
        expect(encoded).toEqual({ id: 'h2o', show: 'mo:4', dipole: '0' });
        expect(decodeMoleculeUrl(encoded)).toEqual({ id: 'h2o', surface: { kind: 'mo', index: 4 }, dipole: false });
    });
    it('writes nothing with no molecule chosen', () => {
        expect(encodeMoleculeUrl(init())).toEqual({});
    });
    it('ignores invalid values rather than throwing', () => {
        expect(decodeMoleculeUrl({ id: 'H2O!<script>', show: 'mo:x', struct: 'maybe', dipole: '2' })).toEqual({});
        expect(decodeMoleculeUrl({ show: 'mo:-1' })).toEqual({});
        expect(decodeMoleculeUrl({ id: 'benzene', show: 'esp', struct: '0' })).toEqual({ id: 'benzene', surface: { kind: 'esp' }, structure: false });
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/molecule_slice.test.ts`
Expected: FAIL, "Cannot find module '../../src/store/moleculeSlice'".

- [ ] **Step 3: Implement**

In `src/store/atomSlice.ts`, extend the union, keeping Phase 5's member: `export type ViewMode = 'atom' | 'hydrogenic' | 'bonds' | 'molecule';`

```ts
// src/store/moleculeSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { LibraryMoleculeMeta, MoleculePick } from '../molecules/library_types';

export type { MoleculePick };
export type MoleculeSurface = { kind: 'density' } | { kind: 'esp' } | { kind: 'mo'; index: number };

/**
 * Molecules mode. Only JSON lives here -- the density and ESP grids are
 * megabytes of typed arrays and stay in grid_cache.ts. `loadNonce` is the
 * atomSlice.solveNonce lesson: re-picking the molecule already chosen must
 * reload, not leave "loading" on screen for ever.
 */
export interface MoleculeState {
    index: MoleculeIndexEntry[] | null;
    indexError: string | null;
    selectedId: string | null;
    meta: LibraryMoleculeMeta | null;
    isLoadingMeta: boolean;
    error: string | null;
    surface: MoleculeSurface;
    showStructure: boolean;
    showDipole: boolean;
    pick: MoleculePick | null;
    loadNonce: number;
    renderLabel: string | null;
    renderError: string | null;
    isoLevel: number | null;
    espRange: [number, number] | null;
}

const initialState: MoleculeState = {
    index: null, indexError: null, selectedId: null, meta: null, isLoadingMeta: false, error: null,
    surface: { kind: 'density' }, showStructure: true, showDipole: true, pick: null, loadNonce: 0,
    renderLabel: null, renderError: null, isoLevel: null, espRange: null,
};

const hasOrbital = (meta: LibraryMoleculeMeta | null, index: number) => !!meta && meta.orbitals.some(o => o.index === index);

const moleculeSlice = createSlice({
    name: 'molecule',
    initialState,
    reducers: {
        indexLoaded: (state, action: PayloadAction<MoleculeIndexEntry[]>) => { state.index = action.payload; state.indexError = null; },
        indexFailed: (state, action: PayloadAction<string>) => { state.indexError = action.payload; },
        selectMolecule: (state, action: PayloadAction<{ id: string; surface?: MoleculeSurface }>) => {
            state.selectedId = action.payload.id;
            state.meta = null;
            state.isLoadingMeta = true;
            state.error = null;
            state.renderError = null;
            state.pick = null;
            state.espRange = null;
            state.loadNonce += 1;
            // An orbital index means nothing in another molecule; density and ESP carry over.
            state.surface = action.payload.surface ?? (state.surface.kind === 'mo' ? { kind: 'density' } : state.surface);
        },
        metaLoaded: (state, action: PayloadAction<{ id: string; meta: LibraryMoleculeMeta }>) => {
            if (action.payload.id !== state.selectedId) return;
            state.meta = action.payload.meta;
            state.isLoadingMeta = false;
            if (state.surface.kind === 'mo' && !hasOrbital(state.meta, state.surface.index)) state.surface = { kind: 'density' };
        },
        metaFailed: (state, action: PayloadAction<{ id: string; message: string }>) => {
            if (action.payload.id !== state.selectedId) return;
            state.isLoadingMeta = false;
            state.error = `Could not load “${action.payload.id}”: ${action.payload.message}`;
        },
        setSurface: (state, action: PayloadAction<MoleculeSurface>) => {
            const surface = action.payload;
            if (surface.kind === 'mo' && !hasOrbital(state.meta, surface.index)) return;
            state.surface = surface;
            if (surface.kind !== 'esp') state.espRange = null;
        },
        setShowStructure: (state, action: PayloadAction<boolean>) => { state.showStructure = action.payload; if (!action.payload) state.pick = null; },
        setShowDipole: (state, action: PayloadAction<boolean>) => { state.showDipole = action.payload; },
        setPick: (state, action: PayloadAction<MoleculePick | null>) => { state.pick = action.payload; },
        renderStarted: (state, action: PayloadAction<string>) => { state.renderLabel = action.payload; state.renderError = null; },
        renderFinished: (state, action: PayloadAction<{ isoLevel: number; espRange?: [number, number] }>) => {
            state.renderLabel = null;
            state.isoLevel = action.payload.isoLevel;
            state.espRange = action.payload.espRange ?? null;
        },
        renderFailed: (state, action: PayloadAction<string>) => { state.renderLabel = null; state.renderError = action.payload; },
    },
});

export const {
    indexLoaded, indexFailed, selectMolecule, metaLoaded, metaFailed, setSurface, setShowStructure, setShowDipole,
    setPick, renderStarted, renderFinished, renderFailed,
} = moleculeSlice.actions;
export default moleculeSlice.reducer;
```

```ts
// src/molecules/url_keys.ts
import { registerUrlKeys } from '../url_state';
import type { RootState, AppDispatch } from '../store';
import { setMode } from '../store/atomSlice';
import { MoleculeState, MoleculeSurface, selectMolecule, setShowDipole, setShowStructure } from '../store/moleculeSlice';

const ID = /^[a-z0-9-]{1,40}$/;

function surfaceKey(surface: MoleculeSurface): string {
    return surface.kind === 'mo' ? `mo:${surface.index}` : surface.kind;
}

function parseSurface(value: string | undefined): MoleculeSurface | undefined {
    if (value === 'density' || value === 'esp') return { kind: value };
    const match = value?.match(/^mo:(\d{1,4})$/);
    return match ? { kind: 'mo', index: Number(match[1]) } : undefined;
}

function parseFlag(value: string | undefined): boolean | undefined {
    return value === '1' ? true : value === '0' ? false : undefined;
}

export function encodeMoleculeUrl(state: MoleculeState): Record<string, string> {
    if (!state.selectedId) return {};
    const out: Record<string, string> = { id: state.selectedId, show: surfaceKey(state.surface) };
    if (!state.showStructure) out.struct = '0';
    if (!state.showDipole) out.dipole = '0';
    return out;
}

/** Unknown or malformed values are dropped, never thrown on (spec §4.3). An unknown id fails visibly at load. */
export function decodeMoleculeUrl(params: Record<string, string>) {
    const out: { id?: string; surface?: MoleculeSurface; structure?: boolean; dipole?: boolean } = {};
    if (params.id && ID.test(params.id)) out.id = params.id;
    const surface = parseSurface(params.show);
    if (surface && out.id) out.surface = surface;
    const structure = parseFlag(params.struct);
    if (structure !== undefined) out.structure = structure;
    const dipole = parseFlag(params.dipole);
    if (dipole !== undefined) out.dipole = dipole;
    return out;
}

export function registerMoleculeUrlKeys(): void {
    registerUrlKeys(
        'molecule',
        (state: RootState) => encodeMoleculeUrl(state.molecule),
        (params: URLSearchParams, dispatch: AppDispatch) => {
            // A mode's own decoder switches to it (Phase 2's convention).
            dispatch(setMode('molecule'));
            const decoded = decodeMoleculeUrl(Object.fromEntries(params));
            if (decoded.id) dispatch(selectMolecule({ id: decoded.id, surface: decoded.surface }));
            if (decoded.structure !== undefined) dispatch(setShowStructure(decoded.structure));
            if (decoded.dipole !== undefined) dispatch(setShowDipole(decoded.dipole));
        },
    );
}
```

Note the test case `{ show: 'mo:-1' }` decodes to `{}`: the pattern rejects `-1`, and a `show` without an `id` is dropped.

In `src/url_state.ts`, add `molecule: 'molecule'` to `URL_MODE` (tsc requires it once `ViewMode` has the member). In `src/store/index.ts`: `import moleculeReducer from './moleculeSlice';` and add `molecule: moleculeReducer` to `reducer`. In `src/main.tsx`, before `ReactDOM.createRoot`: `import { registerMoleculeUrlKeys } from './molecules/url_keys';` and `registerMoleculeUrlKeys();`, so the keys exist before Phase 2 first applies the hash.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/molecule_slice.test.ts tests/atom/atom_slice.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean. If tsc reports a non-exhaustive `switch` on `ViewMode` anywhere, add `case 'molecule':` beside `case 'bonds':` with the same body (Phase 5's other mode that draws its own scene), and name the file in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/store/moleculeSlice.ts src/store/atomSlice.ts src/store/index.ts src/molecules/url_keys.ts src/main.tsx tests/molecules/molecule_slice.test.ts
git commit -m "feat(molecules): Molecules mode state, stale-load guards, and shareable URL keys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 13: The molecule picker (search and categories), inline and full-screen

**Files:**
- Create: `src/molecules/catalogue.ts`, `src/components/MoleculePicker.tsx`, `src/components/MoleculePickerDialog.tsx`, `tests/molecules/molecule_picker.test.tsx`
- Modify: `tests/molecules/fixtures.ts` (append `LIBRARY_INDEX`), `src/style.css`

**Interfaces:**
- Consumes: `LIBRARY_CATEGORIES` (Task 8); `MoleculeIndexEntry` (Phase 5).
- Produces: `libraryEntries(entries): MoleculeIndexEntry[]` (drops Phase 5's non-library entries, e.g. diatomic scans, which live in Bonds mode); `filterMolecules(entries, query, category: string | null)`; `formatFormula(formula): string` (subscripts); `<MoleculePicker entries error selectedId onSelect autoFocus? />`; `<MoleculePickerDialog open entries error selectedId onSelect onClose />`, the phone's full-screen picker, mirroring `ElementPickerDialog`.

- [ ] **Step 1: Append the index fixture and write the failing tests**

```ts
// tests/molecules/fixtures.ts (append)
import type { MoleculeIndexEntry } from '../../src/molecules/types';

const ROWS: Array<[string, string, string, string, string[]]> = [
    ['h2o', 'Water', 'H2O', 'first-examples', ['polarity', 'hybridisation']], ['nh3', 'Ammonia', 'NH3', 'first-examples', ['polarity', 'hybridisation']],
    ['ch4', 'Methane', 'CH4', 'first-examples', ['hybridisation']], ['co2', 'Carbon dioxide', 'CO2', 'first-examples', ['polarity']],
    ['c2h2', 'Acetylene', 'C2H2', 'hybridisation', ['sp']], ['c2h4', 'Ethylene', 'C2H4', 'hybridisation', ['sp2']],
    ['c2h6', 'Ethane', 'C2H6', 'hybridisation', ['sp3']], ['hcn', 'Hydrogen cyanide', 'HCN', 'hybridisation', ['polarity', 'sp']],
    ['h2co', 'Formaldehyde', 'H2CO', 'hybridisation', ['polarity', 'sp2']], ['bf3', 'Boron trifluoride', 'BF3', 'hybridisation', ['polarity', 'sp2']],
    ['sih4', 'Silane', 'SiH4', 'hybridisation', ['first-examples']], ['sf6', 'Sulfur hexafluoride', 'SF6', 'polarity', ['hybridisation']],
    ['o3', 'Ozone', 'O3', 'polarity', ['first-examples']], ['no2', 'Nitrogen dioxide', 'NO2', 'polarity', ['radical']],
    ['so2', 'Sulfur dioxide', 'SO2', 'polarity', []], ['ph3', 'Phosphine', 'PH3', 'polarity', ['hybridisation']],
    ['h2s', 'Hydrogen sulfide', 'H2S', 'polarity', ['hybridisation']], ['benzene', 'Benzene', 'C6H6', 'aromatic', []],
    ['ch3oh', 'Methanol', 'CH3OH', 'polarity', ['biomolecule-fragments', 'hybridisation']], ['hcooh', 'Formic acid', 'HCOOH', 'polarity', ['biomolecule-fragments']],
    ['ethanol', 'Ethanol', 'C2H5OH', 'polarity', ['biomolecule-fragments']], ['acetone', 'Acetone', '(CH3)2CO', 'polarity', ['biomolecule-fragments']],
    ['pyridine', 'Pyridine', 'C5H5N', 'aromatic', ['polarity']], ['formamide', 'Formamide', 'HCONH2', 'biomolecule-fragments', ['polarity']],
    ['glycine', 'Glycine', 'NH2CH2COOH', 'biomolecule-fragments', []],
];
export const LIBRARY_INDEX: MoleculeIndexEntry[] = ROWS.map(([id, name, formula, category, tags]) => ({ id, name, formula, category, tags }));
```

```tsx
// tests/molecules/molecule_picker.test.tsx
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { filterMolecules, formatFormula, libraryEntries } from '../../src/molecules/catalogue';
import MoleculePicker from '../../src/components/MoleculePicker';
import MoleculePickerDialog from '../../src/components/MoleculePickerDialog';
import { LIBRARY_INDEX } from './fixtures';

const ids = (q: string, c: string | null = null) => filterMolecules(LIBRARY_INDEX, q, c).map(e => e.id);

describe('catalogue', () => {
    it('matches name, formula (with or without subscripts) and tags', () => {
        expect(ids('water')).toEqual(['h2o']);
        expect(ids('H2O')).toEqual(['h2o']);
        expect(ids('h₂o')).toEqual(['h2o']);
        expect(ids('c2')).toEqual(['c2h2', 'c2h4', 'c2h6', 'ethanol']);
        expect(ids('radical')).toEqual(['no2']);
    });
    it('filters by category, primary or tagged', () => {
        expect(ids('', 'aromatic')).toEqual(['benzene', 'pyridine']);
        expect(ids('', 'polarity')).toContain('h2o');
        expect(ids('', 'biomolecule-fragments')).toEqual(['ch3oh', 'hcooh', 'ethanol', 'acetone', 'formamide', 'glycine']);
    });
    it('writes formulas with subscripts and keeps only library entries', () => {
        expect(formatFormula('(CH3)2CO')).toBe('(CH₃)₂CO');
        expect(formatFormula('C6H6')).toBe('C₆H₆');
        expect(libraryEntries([...LIBRARY_INDEX, { id: 'h2', name: 'Hydrogen', formula: 'H2', category: 'diatomic', tags: [] }])).toHaveLength(25);
    });
});

describe('MoleculePicker', () => {
    it('searches, filters by category, and picks', () => {
        const onSelect = jest.fn();
        render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId="h2o" onSelect={onSelect} />);
        const list = screen.getByRole('list', { name: 'molecules' });
        expect(within(list).getAllByRole('button')).toHaveLength(25);
        fireEvent.click(screen.getByRole('button', { name: 'Aromatic' }));
        expect(within(list).getAllByRole('button')).toHaveLength(2);
        fireEvent.click(within(list).getByRole('button', { name: /Pyridine/ }));
        expect(onSelect).toHaveBeenCalledWith('pyridine');
    });
    it('picks the first match on Enter and says when nothing matches', () => {
        const onSelect = jest.fn();
        render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={onSelect} />);
        const box = screen.getByLabelText('filter molecules');
        fireEvent.change(box, { target: { value: 'benz' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('benzene');
        fireEvent.change(box, { target: { value: 'xenon' } });
        expect(screen.getByText('No molecule matches “xenon”.')).toBeInTheDocument();
    });
    it('shows loading and failure explicitly', () => {
        const { rerender } = render(<MoleculePicker entries={null} error={null} selectedId={null} onSelect={() => {}} />);
        expect(screen.getByText('Loading the molecule library…')).toBeInTheDocument();
        rerender(<MoleculePicker entries={null} error="HTTP 500" selectedId={null} onSelect={() => {}} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load the molecule library: HTTP 500');
    });
    it('closes the phone dialog once a molecule is chosen', () => {
        const onSelect = jest.fn();
        const onClose = jest.fn();
        render(<MoleculePickerDialog open entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={onSelect} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Water/ }));
        expect(onSelect).toHaveBeenCalledWith('h2o');
        expect(onClose).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/molecule_picker.test.tsx`
Expected: FAIL, "Cannot find module '../../src/molecules/catalogue'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/catalogue.ts
import { LIBRARY_CATEGORIES } from './library_types';
import type { MoleculeIndexEntry } from './types';

const LIBRARY_KEYS = new Set(LIBRARY_CATEGORIES.map(c => c.key));
const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** The picker lists the library; Phase 5's bond-scan entries share index.json but belong to Bonds mode. */
export function libraryEntries(entries: MoleculeIndexEntry[]): MoleculeIndexEntry[] {
    return entries.filter(entry => LIBRARY_KEYS.has(entry.category));
}

function normalise(text: string): string {
    return text.trim().toLowerCase().replace(/[₀-₉]/g, c => String(SUBSCRIPTS.indexOf(c))).replace(/\s+/g, '');
}

export function filterMolecules(entries: MoleculeIndexEntry[], query: string, category: string | null): MoleculeIndexEntry[] {
    const q = normalise(query);
    return entries.filter(entry =>
        (!category || entry.category === category || entry.tags.includes(category))
        && (!q || entry.name.toLowerCase().includes(q) || normalise(entry.formula).startsWith(q) || entry.id === q || entry.tags.includes(q)));
}

export function formatFormula(formula: string): string {
    return formula.replace(/([A-Za-z)])(\d+)/g, (_, head: string, digits: string) => head + [...digits].map(d => SUBSCRIPTS[Number(d)]).join(''));
}
```

```tsx
// src/components/MoleculePicker.tsx
import React, { useMemo, useState } from 'react';
import { Alert, Chip, List, ListItemButton, TextField, Typography } from '@mui/material';
import { LIBRARY_CATEGORIES } from '../molecules/library_types';
import { filterMolecules, formatFormula } from '../molecules/catalogue';
import type { MoleculeIndexEntry } from '../molecules/types';

interface MoleculePickerProps {
    entries: MoleculeIndexEntry[] | null;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    autoFocus?: boolean;
}

/** Search plus the spec's five categories. Lives in the navigation column on a desktop and in the Explore tab and a full-screen dialog on a phone. */
const MoleculePicker: React.FC<MoleculePickerProps> = ({ entries, error, selectedId, onSelect, autoFocus = false }) => {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const matches = useMemo(() => (entries ? filterMolecules(entries, query, category) : []), [entries, query, category]);

    if (error) return <Alert severity="error" role="alert">Could not load the molecule library: {error}. Reload the page to try again.</Alert>;
    if (!entries) return <Typography variant="body2" className="molecule-picker-status">Loading the molecule library…</Typography>;

    return (
        <div className="molecule-picker">
            <TextField
                autoFocus={autoFocus} fullWidth size="small" placeholder="Name or formula" value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter' && matches.length > 0) {
                        event.preventDefault();   // as ElementPickerDialog: the same Enter must not re-open anything
                        onSelect(matches[0].id);
                    }
                }}
                slotProps={{ htmlInput: { 'aria-label': 'filter molecules' } }}
            />
            <div className="molecule-category-chips" role="group" aria-label="molecule categories">
                <Chip label="All" size="small" clickable color={category === null ? 'primary' : 'default'} aria-pressed={category === null} onClick={() => setCategory(null)} />
                {LIBRARY_CATEGORIES.map(c => (
                    <Chip key={c.key} label={c.label} size="small" clickable color={category === c.key ? 'primary' : 'default'}
                        aria-pressed={category === c.key} onClick={() => setCategory(category === c.key ? null : c.key)} />
                ))}
            </div>
            {matches.length === 0 ? (
                <Typography variant="body2" className="molecule-picker-status">No molecule matches “{query}”.</Typography>
            ) : (
                <List dense aria-label="molecules" className="molecule-picker-list">
                    {matches.map(entry => (
                        <ListItemButton key={entry.id} selected={entry.id === selectedId} onClick={() => onSelect(entry.id)} className="molecule-picker-item">
                            <span className="molecule-picker-formula">{formatFormula(entry.formula)}</span>
                            <span className="molecule-picker-name">{entry.name}</span>
                        </ListItemButton>
                    ))}
                </List>
            )}
        </div>
    );
};

export default MoleculePicker;
```

```tsx
// src/components/MoleculePickerDialog.tsx
import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import type { MoleculeIndexEntry } from '../molecules/types';

interface MoleculePickerDialogProps {
    open: boolean;
    entries: MoleculeIndexEntry[] | null;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onClose: () => void;
}

/** The phone's molecule choice, full screen, opened from the name in the header -- as ElementPickerDialog is for elements. */
const MoleculePickerDialog: React.FC<MoleculePickerDialogProps> = ({ open, entries, error, selectedId, onSelect, onClose }) => (
    <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="molecule-picker-title">
        <DialogTitle id="molecule-picker-title" className="element-picker-title">
            Choose a molecule
            <IconButton aria-label="close molecule picker" onClick={onClose} size="small">✕</IconButton>
        </DialogTitle>
        <DialogContent dividers className="element-picker-content">
            <MoleculePicker entries={entries} error={error} selectedId={selectedId} autoFocus
                onSelect={id => { onSelect(id); onClose(); }} />
        </DialogContent>
    </Dialog>
);

export default MoleculePickerDialog;
```

Append to `src/style.css`:

```css
.molecule-picker { display: flex; flex-direction: column; gap: 8px; }
.molecule-category-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.molecule-picker-list { max-height: 280px; overflow-y: auto; }
.molecule-picker-item { gap: 10px; }
.molecule-picker-formula { min-width: 84px; font-weight: 600; }
.molecule-picker-name { opacity: 0.85; }
.molecule-picker-status { padding: 8px 0; opacity: 0.8; }
.MuiDialog-root .molecule-picker-list { max-height: none; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/molecule_picker.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (7 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/catalogue.ts src/components/MoleculePicker.tsx src/components/MoleculePickerDialog.tsx src/style.css tests/molecules/fixtures.ts tests/molecules/molecule_picker.test.tsx
git commit -m "feat(molecules): searchable, categorised molecule picker, inline and full-screen

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Navigation card, orbital list, readout and view options

**Files:**
- Create: `src/molecules/orbital_display.ts`, `src/components/MoleculeOrbitalList.tsx`, `src/components/MoleculeNav.tsx`, `src/components/MoleculeReadout.tsx`, `src/components/MoleculeViewOptions.tsx`, `tests/molecules/molecule_nav.test.tsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `MoleculePicker` (Task 13); `formatFormula`; `LibraryMoleculeMeta`, `MoleculePick`, `MoleculeAtom` (Task 8); `MoleculeSurface` (Task 12); `detectBonds`, `describePick` (Task 10).
- Produces: `HARTREE_TO_EV = 27.211386`, `formatOrbitalEnergy(e)`, `degeneracyCounts(orbitals, tol?) : Map<number, number>`; components:
  ```ts
  <MoleculeOrbitalList orbitals selectedIndex onSelect method symmetry />
  <MoleculeNav variant?: 'full' | 'header' | 'body' entries indexError meta selectedId isLoading surface onSelectMolecule onSurfaceChange onOpenPicker? />
  <MoleculeReadout atoms pick geometrySource touch />
  <MoleculeViewOptions showStructure showDipole onShowStructure onShowDipole dipoleText />
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/molecules/molecule_nav.test.tsx
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MoleculeNav from '../../src/components/MoleculeNav';
import MoleculeOrbitalList from '../../src/components/MoleculeOrbitalList';
import MoleculeReadout from '../../src/components/MoleculeReadout';
import MoleculeViewOptions from '../../src/components/MoleculeViewOptions';
import { formatOrbitalEnergy, degeneracyCounts } from '../../src/molecules/orbital_display';
import { LIBRARY_INDEX, waterMeta, waterAtoms } from './fixtures';

const navProps = {
    entries: LIBRARY_INDEX, indexError: null, meta: waterMeta(), selectedId: 'h2o', isLoading: false,
    surface: { kind: 'density' } as const, onSelectMolecule: jest.fn(), onSurfaceChange: jest.fn(),
};

describe('orbital display', () => {
    it('formats energies in Ha with eV beside', () => {
        expect(formatOrbitalEnergy(-0.4913)).toBe('−0.491 Ha (−13.37 eV)');
    });
    it('counts degenerate sets', () => {
        const counts = degeneracyCounts([{ index: 2, energyHartree: -0.5 }, { index: 3, energyHartree: -0.50001 }, { index: 4, energyHartree: -0.5 + 1e-5 }, { index: 5, energyHartree: 0.1 }]);
        expect([counts.get(2), counts.get(5)]).toEqual([3, 1]);
    });
});

describe('MoleculeOrbitalList', () => {
    it('lists highest first, marks HOMO and LUMO, states the method and that energies are not ionisation energies', () => {
        const onSelect = jest.fn();
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={4} onSelect={onSelect}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        const rows = screen.getAllByRole('button');
        expect(rows[0]).toHaveTextContent('4a1');
        expect(rows[1]).toHaveTextContent('1b1');
        expect(rows[1]).toHaveTextContent('HOMO');
        expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
        expect(rows[0]).toHaveTextContent('LUMO');
        fireEvent.click(rows[2]);
        expect(onSelect).toHaveBeenCalledWith(3);
        expect(container.textContent).toMatch(/Kohn–Sham orbital energies, B3LYP\/def2-TZVP\. Not ionisation energies\./);
    });
});

describe('MoleculeNav', () => {
    it('opens the picker from the phone header', () => {
        const onOpenPicker = jest.fn();
        render(<MoleculeNav {...navProps} variant="header" onOpenPicker={onOpenPicker} />);
        fireEvent.click(screen.getByRole('button', { name: 'Change molecule, currently Water' }));
        expect(onOpenPicker).toHaveBeenCalled();
    });
    it('shows the picker until a molecule is chosen, then folds it (desktop)', () => {
        const onSelectMolecule = jest.fn();
        const { rerender } = render(<MoleculeNav {...navProps} meta={null} selectedId={null} onSelectMolecule={onSelectMolecule} />);
        fireEvent.click(within(screen.getByRole('list', { name: 'molecules' })).getByRole('button', { name: /Ammonia/ }));
        expect(onSelectMolecule).toHaveBeenCalledWith('nh3');
        rerender(<MoleculeNav {...navProps} onSelectMolecule={onSelectMolecule} />);
        expect(screen.queryByRole('list', { name: 'molecules' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Change molecule' }));
        expect(screen.getByRole('list', { name: 'molecules' })).toBeInTheDocument();
    });
    it('switches surfaces; Orbitals opens at the HOMO', () => {
        const onSurfaceChange = jest.fn();
        render(<MoleculeNav {...navProps} onSurfaceChange={onSurfaceChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Electrostatic potential' }));
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'esp' });
        fireEvent.click(screen.getByRole('button', { name: 'Orbitals' }));
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'mo', index: 4 });
    });
    it('states where the geometry and the density come from', () => {
        const { container } = render(<MoleculeNav {...navProps} />);
        expect(container.textContent).toMatch(/Geometry: experiment \(CCCBDB\)/);
        expect(container.textContent).toMatch(/Density, potential and orbitals: B3LYP\/def2-TZVP \(PySCF\)/);
    });
});

describe('readout and view options', () => {
    it('reads out a pick, or says how to get one', () => {
        const { rerender, container } = render(<MoleculeReadout atoms={waterAtoms()} pick={{ kind: 'atom', index: 0 }} geometrySource="experiment (CCCBDB)" touch={false} />);
        expect(container.textContent).toMatch(/∠H–O–H 104\.5°/);
        expect(container.textContent).toMatch(/geometry: experiment \(CCCBDB\)/);
        rerender(<MoleculeReadout atoms={waterAtoms()} pick={null} geometrySource="experiment (CCCBDB)" touch />);
        expect(container.textContent).toMatch(/Tap an atom or bond/);
    });
    it('toggles structure and dipole and states the arrow convention', () => {
        const onShowDipole = jest.fn();
        const { container } = render(<MoleculeViewOptions showStructure showDipole onShowStructure={() => {}} onShowDipole={onShowDipole} dipoleText="μ = 1.86 D" />);
        fireEvent.click(screen.getByLabelText('Dipole arrow'));   // role is checkbox or switch depending on the MUI minor
        expect(onShowDipole).toHaveBeenCalledWith(false);
        expect(container.textContent).toMatch(/points from − to \+/);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/molecule_nav.test.tsx`
Expected: FAIL, "Cannot find module '../../src/components/MoleculeNav'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/orbital_display.ts
export const HARTREE_TO_EV = 27.211386;
const signed = (v: number, digits: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export function formatOrbitalEnergy(energyHartree: number): string {
    return `${signed(energyHartree, 3)} Ha (${signed(energyHartree * HARTREE_TO_EV, 2)} eV)`;
}

/** Size of each orbital's degenerate set (|ΔE| below tol, chained through energy order), keyed by orbital index. */
export function degeneracyCounts(orbitals: Array<{ index: number; energyHartree: number }>, tol = 1e-4): Map<number, number> {
    const sorted = [...orbitals].sort((a, b) => a.energyHartree - b.energyHartree);
    const counts = new Map<number, number>();
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i].energyHartree - sorted[i - 1].energyHartree >= tol) {
            for (let j = start; j < i; j++) counts.set(sorted[j].index, i - start);
            start = i;
        }
    }
    return counts;
}
```

```tsx
// src/components/MoleculeOrbitalList.tsx
import React, { useMemo } from 'react';
import { Chip, Typography } from '@mui/material';
import { degeneracyCounts, formatOrbitalEnergy } from '../molecules/orbital_display';
import type { LibraryMoleculeMeta } from '../molecules/library_types';

interface MoleculeOrbitalListProps {
    orbitals: LibraryMoleculeMeta['orbitals'];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    method: string;
    symmetry: { pointGroup: string; labelGroup: string };
}

const OCCUPANCY: Record<number, string> = { 2: '↑↓', 1: '↑', 0: '' };

/** Every shipped orbital, highest first so HOMO and LUMO sit together near the top. */
const MoleculeOrbitalList: React.FC<MoleculeOrbitalListProps> = ({ orbitals, selectedIndex, onSelect, method, symmetry }) => {
    const rows = useMemo(() => [...orbitals].sort((a, b) => b.energyHartree - a.energyHartree), [orbitals]);
    const counts = useMemo(() => degeneracyCounts(orbitals), [orbitals]);
    return (
        <div className="molecule-orbital-list">
            {rows.map(orbital => {
                const role = orbital.role ? String(orbital.role) : null;
                const degenerate = counts.get(orbital.index) ?? 1;
                return (
                    <button key={orbital.index} type="button" aria-pressed={orbital.index === selectedIndex}
                        className={`molecule-orbital-row${orbital.index === selectedIndex ? ' selected' : ''}`}
                        onClick={() => onSelect(orbital.index)}>
                        <span className="molecule-orbital-label">{orbital.label}</span>
                        <span className="molecule-orbital-occupancy">{OCCUPANCY[Math.round(orbital.occupation)] ?? ''}</span>
                        <span className="molecule-orbital-energy">{formatOrbitalEnergy(orbital.energyHartree)}</span>
                        {degenerate > 1 && <span className="molecule-orbital-degeneracy">×{degenerate}</span>}
                        {role && <Chip size="small" label={role} className="molecule-orbital-role" />}
                    </button>
                );
            })}
            <Typography variant="caption" className="molecule-caption">
                Kohn–Sham orbital energies, {method}. Not ionisation energies.
                {' '}Labels: irreducible representations of {symmetry.labelGroup}
                {symmetry.labelGroup !== symmetry.pointGroup ? `, the subgroup of ${symmetry.pointGroup} the calculation uses` : ''}.
            </Typography>
        </div>
    );
};

export default MoleculeOrbitalList;
```

```tsx
// src/components/MoleculeNav.tsx
import React, { useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import MoleculeOrbitalList from './MoleculeOrbitalList';
import { formatFormula } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { MoleculeSurface } from '../store/moleculeSlice';

interface MoleculeNavProps {
    /** 'full': the desktop card. A phone splits it like LevelNav: 'header' (always on screen) and 'body' (Explore tab). */
    variant?: 'full' | 'header' | 'body';
    entries: MoleculeIndexEntry[] | null;
    indexError: string | null;
    meta: LibraryMoleculeMeta | null;
    selectedId: string | null;
    isLoading: boolean;
    surface: MoleculeSurface;
    onSelectMolecule: (id: string) => void;
    onSurfaceChange: (surface: MoleculeSurface) => void;
    onOpenPicker?: () => void;
}

const MoleculeNav: React.FC<MoleculeNavProps> = ({
    variant = 'full', entries, indexError, meta, selectedId, isLoading, surface, onSelectMolecule, onSurfaceChange, onOpenPicker,
}) => {
    // Open until something is chosen, then folded, as the periodic table does after a pick.
    const [pickerOpen, setPickerOpen] = useState(selectedId === null);
    const name = meta?.name ?? entries?.find(e => e.id === selectedId)?.name ?? null;
    const title = name ? `${name}` : 'Choose a molecule';

    if (variant === 'header') {
        return (
            <div className="molecule-nav-header level-nav-header">
                <Button className="level-nav-change-element" onClick={onOpenPicker}
                    aria-label={name ? `Change molecule, currently ${name}` : 'Choose a molecule'}>
                    {title}{meta ? ` · ${formatFormula(meta.formula)}` : ''} ▾
                </Button>
            </div>
        );
    }

    const choose = (id: string) => { onSelectMolecule(id); setPickerOpen(false); };
    const homo = meta?.orbitals.find(o => o.role === 'HOMO') ?? meta?.orbitals[0];
    const picker = <MoleculePicker entries={entries} error={indexError} selectedId={selectedId} onSelect={choose} />;

    return (
        <div className="molecule-nav level-nav">
            <Typography variant="h6" className="molecule-nav-title">
                {title}{meta && <span className="molecule-nav-formula"> {formatFormula(meta.formula)}</span>}
            </Typography>
            {isLoading && <Typography variant="body2">Loading {name ?? selectedId}…</Typography>}
            {variant === 'full' && (pickerOpen || !selectedId ? picker : (
                <Button size="small" onClick={() => setPickerOpen(true)}>Change molecule</Button>
            ))}
            {meta && (
                <>
                    <ToggleButtonGroup exclusive size="small" fullWidth aria-label="surface" className="molecule-surface-toggle"
                        value={surface.kind}
                        onChange={(_event, kind: MoleculeSurface['kind'] | null) => {
                            if (kind === 'density' || kind === 'esp') onSurfaceChange({ kind });
                            else if (kind === 'mo' && homo) onSurfaceChange({ kind: 'mo', index: homo.index });
                        }}>
                        <ToggleButton value="density">Density</ToggleButton>
                        <ToggleButton value="esp">Electrostatic potential</ToggleButton>
                        <ToggleButton value="mo">Orbitals</ToggleButton>
                    </ToggleButtonGroup>
                    {surface.kind === 'mo' && (
                        <MoleculeOrbitalList orbitals={meta.orbitals} selectedIndex={surface.index}
                            onSelect={index => onSurfaceChange({ kind: 'mo', index })}
                            method={meta.method.density} symmetry={meta.symmetry} />
                    )}
                    <Typography variant="caption" className="molecule-caption">
                        Geometry: {meta.geometrySource}. Density, potential and orbitals: {meta.method.density} (PySCF).
                    </Typography>
                </>
            )}
            {variant === 'body' && (
                <>
                    <Typography variant="subtitle2" className="molecule-nav-browse">Browse molecules</Typography>
                    {picker}
                </>
            )}
        </div>
    );
};

export default MoleculeNav;
```

```tsx
// src/components/MoleculeReadout.tsx
import React, { useMemo } from 'react';
import { describePick, detectBonds } from '../molecules/ball_and_stick';
import type { MoleculeAtom, MoleculePick } from '../molecules/library_types';

interface MoleculeReadoutProps { atoms: MoleculeAtom[]; pick: MoleculePick | null; geometrySource: string; touch: boolean }

/** Lengths and angles for whatever the pointer is on (tap on a phone), with where the geometry comes from. */
const MoleculeReadout: React.FC<MoleculeReadoutProps> = ({ atoms, pick, geometrySource, touch }) => {
    const bonds = useMemo(() => detectBonds(atoms), [atoms]);
    const lines = pick ? describePick(atoms, bonds, pick) : [`${touch ? 'Tap' : 'Hover over'} an atom or bond for angles and lengths`];
    return (
        <div className="molecule-readout" role="status" aria-live="polite">
            {lines.map(line => <div key={line}>{line}</div>)}
            <div className="esp-legend-note">geometry: {geometrySource} · sticks show connectivity, not bond order</div>
        </div>
    );
};

export default MoleculeReadout;
```

```tsx
// src/components/MoleculeViewOptions.tsx
import React from 'react';
import { FormControlLabel, FormGroup, Switch, Typography } from '@mui/material';

interface MoleculeViewOptionsProps {
    showStructure: boolean; showDipole: boolean;
    onShowStructure: (on: boolean) => void; onShowDipole: (on: boolean) => void;
    dipoleText: string | null;
}

/** Molecule-only view settings, shown inside Controls in the right-hand column / View tab. */
const MoleculeViewOptions: React.FC<MoleculeViewOptionsProps> = ({ showStructure, showDipole, onShowStructure, onShowDipole, dipoleText }) => (
    <FormGroup className="molecule-view-options">
        <FormControlLabel control={<Switch size="small" checked={showStructure} onChange={e => onShowStructure(e.target.checked)} />} label="Ball-and-stick" />
        <FormControlLabel control={<Switch size="small" checked={showDipole} onChange={e => onShowDipole(e.target.checked)} />} label="Dipole arrow" />
        {dipoleText && <Typography variant="body2">{dipoleText}</Typography>}
        <Typography variant="caption" className="molecule-caption">
            The arrow points from − to + (the physics convention), 1 a₀ per debye; many chemistry texts draw it the other way.
        </Typography>
    </FormGroup>
);

export default MoleculeViewOptions;
```

Append to `src/style.css`:

```css
.molecule-nav { display: flex; flex-direction: column; gap: 8px; }
.molecule-nav-formula { font-weight: 400; opacity: 0.8; }
.molecule-caption { display: block; opacity: 0.75; line-height: 1.35; }
.molecule-orbital-list { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; }
.molecule-orbital-row {
  display: grid; grid-template-columns: 48px 28px 1fr auto auto; align-items: center; gap: 6px;
  padding: 4px 6px; border: 1px solid transparent; border-radius: 6px; background: none; font: inherit; text-align: left; cursor: pointer;
}
.molecule-orbital-row.selected { border-color: #1976d2; background: rgba(25, 118, 210, 0.08); }
.molecule-orbital-energy { font-variant-numeric: tabular-nums; }
.molecule-orbital-degeneracy { opacity: 0.7; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/molecule_nav.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (10 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/orbital_display.ts src/components/MoleculeOrbitalList.tsx src/components/MoleculeNav.tsx src/components/MoleculeReadout.tsx src/components/MoleculeViewOptions.tsx src/style.css tests/molecules/molecule_nav.test.tsx
git commit -m "feat(molecules): navigation card, orbital list with HOMO/LUMO, readouts and view options

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 15: Loading and scene orchestration hooks; OrbitalViewer wiring

**Files:**
- Create: `src/molecules/render_plan.ts`, `src/molecules/useMoleculeLoader.ts`, `src/molecules/useMoleculeView.ts`, `tests/molecules/molecule_hooks.test.tsx`
- Modify: `src/components/OrbitalViewer.tsx`

**Interfaces:**
- Consumes: `loadMoleculeIndex`, `loadMoleculeMeta` (Phase 5); `asLibraryMeta` (Task 8); `libraryEntries` (Task 13); `getDensityGrid`, `getEspGrid` (Task 8); `enclosedFractionForDensity`, `espVertexColors`, `ESP_LIMIT_HARTREE`, `ESP_SURFACE_DENSITY` (Task 9); `buildBallAndStick`, `detectBonds`, `pickMoleculePart` (Task 10); `dipoleArrow` (Task 10); `presentFieldMesh`, `clearFieldMesh`, `setMoleculeOverlay`, `pointerRaycaster`, `updateFieldInScene` (Task 11 / Phase 1); `createGridMeshWorker`, `runMeshWorker` (Task 11); the slice actions (Task 12).
- Produces: `MOLECULE_MO_RESOLUTION = 95`; `gridHalfWidth(meta)`; `moleculeOrbitalSource(meta, index): AnalyticFieldSource`; `planMoleculeRender(meta, surface, enclosedFraction): MoleculeRenderPlan`, where `MoleculeRenderPlan = { kind: 'grid'; fraction: number | 'espSurface'; colourByEsp: boolean; label: string } | { kind: 'mo'; request: FieldRenderRequest; label: string }`; `useMoleculeLoader(active: boolean): void`; `useMoleculeView(contextRef: React.RefObject<VisualizerContext | null>, active: boolean, enclosedFraction: number): void`.
- MOs render at 96³ (spec §4.2: "one MO on a 96³ grid … inside the budget") through `updateFieldInScene` with one `gaussianMO` source, so phase colours and caps are the Basic Orbitals ones.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/molecules/molecule_hooks.test.tsx
import React, { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('../../src/molecules/loader', () => ({ loadMoleculeIndex: jest.fn(), loadMoleculeMeta: jest.fn(), loadDensityGrid: jest.fn() }));
jest.mock('../../src/molecules/grid_cache', () => ({ getDensityGrid: jest.fn(), getEspGrid: jest.fn() }));
jest.mock('../../src/workers/createGridMeshWorker', () => ({ createGridMeshWorker: jest.fn() }));
jest.mock('../../src/orbital_visualizer', () => ({
    presentFieldMesh: jest.fn(() => 2), clearFieldMesh: jest.fn(), setMoleculeOverlay: jest.fn(),
    pointerRaycaster: jest.fn(), updateFieldInScene: jest.fn(async () => ({ status: 'rendered', isoLevel: 0.02 })),
}));

import moleculeReducer, { selectMolecule, metaLoaded, setSurface } from '../../src/store/moleculeSlice';
import { loadMoleculeIndex, loadMoleculeMeta } from '../../src/molecules/loader';
import { getDensityGrid, getEspGrid } from '../../src/molecules/grid_cache';
import { createGridMeshWorker } from '../../src/workers/createGridMeshWorker';
import { presentFieldMesh, setMoleculeOverlay, updateFieldInScene, VisualizerContext } from '../../src/orbital_visualizer';
import { useMoleculeLoader } from '../../src/molecules/useMoleculeLoader';
import { useMoleculeView } from '../../src/molecules/useMoleculeView';
import { planMoleculeRender } from '../../src/molecules/render_plan';
import { LIBRARY_INDEX, waterMeta } from './fixtures';

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const makeStore = () => configureStore({ reducer: { molecule: moleculeReducer }, middleware: m => m({ serializableCheck: false }) });
const fakeContext = () => ({ renderer: { domElement: document.createElement('canvas') }, isDisposed: false, moleculeOverlay: null }) as unknown as VisualizerContext;

function fakeWorker() {
    return { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as null | ((e: { data: unknown }) => void), onerror: null };
}
const meshOf = (tag: number) => ({ positions: [[0, 0, 0]], cells: [], psiSigns: [1], densityMap: { data: new Uint8Array(1), side: 1, rMax: 6 }, isoLevel: tag });

// Separate harnesses: with the loader running, the view tests' selections would trigger real meta loads and extra renders.
function LoaderHarness({ active }: { active: boolean }) {
    useMoleculeLoader(active);
    return null;
}
function Harness({ active, fraction = 0.9, context }: { active: boolean; fraction?: number; context: VisualizerContext }) {
    const ref = useRef<VisualizerContext | null>(context);
    useMoleculeView(ref, active, fraction);
    return null;
}

beforeEach(() => jest.clearAllMocks());

describe('planMoleculeRender', () => {
    it('meshes the grid, fixing the ESP surface at ρ = 0.001, and sends MOs as gaussianMO sources at 96³', () => {
        const meta = waterMeta();
        expect(planMoleculeRender(meta, { kind: 'density' }, 0.9)).toEqual({ kind: 'grid', fraction: 0.9, colourByEsp: false, label: 'Loading Water…' });
        expect(planMoleculeRender(meta, { kind: 'esp' }, 0.9)).toEqual(expect.objectContaining({ fraction: 'espSurface', colourByEsp: true }));
        const mo = planMoleculeRender(meta, { kind: 'mo', index: 4 }, 0.8);
        expect(mo).toEqual({ kind: 'mo', label: 'Computing 1b1…', request: {
            sources: [{ kind: 'analytic', id: 'gaussianMO:h2o:4', recipe: { type: 'gaussianMO', moleculeId: 'h2o', index: 4 }, rMax: 6.43 }],
            colors: ['#ffffff'], resolution: 95, enclosedFraction: 0.8, label: 'Computing 1b1…' } });
    });
});

describe('useMoleculeLoader', () => {
    it('loads nothing until the mode is active, then only the index; meta only once chosen', async () => {
        (loadMoleculeIndex as jest.Mock).mockResolvedValue([...LIBRARY_INDEX, { id: 'h2', name: 'H2', formula: 'H2', category: 'diatomic', tags: [] }]);
        (loadMoleculeMeta as jest.Mock).mockResolvedValue(waterMeta());
        const store = makeStore();
        const { rerender } = render(<Provider store={store}><LoaderHarness active={false} /></Provider>);
        await flush();
        expect(loadMoleculeIndex).not.toHaveBeenCalled();
        rerender(<Provider store={store}><LoaderHarness active /></Provider>);
        await flush();
        expect(store.getState().molecule.index).toHaveLength(25);
        expect(loadMoleculeMeta).not.toHaveBeenCalled();
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await flush();
        expect(loadMoleculeMeta).toHaveBeenCalledWith('h2o');
        expect(store.getState().molecule.meta?.id).toBe('h2o');
    });
});

describe('useMoleculeView', () => {
    it('never presents a superseded mesh', async () => {
        const workers = [fakeWorker(), fakeWorker()];
        (createGridMeshWorker as jest.Mock).mockReturnValueOnce(workers[0]).mockReturnValueOnce(workers[1]);
        (getDensityGrid as jest.Mock).mockResolvedValue({ values: new Float32Array(8), shape: [2, 2, 2] });
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); store.dispatch(metaLoaded({ id: 'nh3', meta: waterMeta({ id: 'nh3', name: 'Ammonia' }) })); });
        await flush();
        const [first, second] = workers.map(w => w.postMessage.mock.calls[0][0].requestId);
        act(() => { workers[0].onmessage!({ data: { type: 'success', meshData: meshOf(1), requestId: first } }); });
        await flush();
        expect(presentFieldMesh).not.toHaveBeenCalled();
        act(() => { workers[1].onmessage!({ data: { type: 'success', meshData: meshOf(2), requestId: second } }); });
        await flush();
        expect(presentFieldMesh).toHaveBeenCalledTimes(1);
        expect((presentFieldMesh as jest.Mock).mock.calls[0][1].isoLevel).toBe(2);
        expect(store.getState().molecule.renderLabel).toBeNull();
    });
    it('colours the ESP surface and records the range drawn', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue({ values: new Float32Array([1, 0.0005, 0, 0, 0, 0, 0, 0]), shape: [2, 2, 2] });
        (getEspGrid as jest.Mock).mockResolvedValue({ shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: new Float32Array(8).fill(-0.02) });
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'esp' } })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        const request = worker.postMessage.mock.calls[0][0];
        expect(request.enclosedFraction).toBeCloseTo(1 / 1.0005, 6);
        act(() => { worker.onmessage!({ data: { type: 'success', meshData: meshOf(0.001), requestId: request.requestId } }); });
        await flush();
        const options = (presentFieldMesh as jest.Mock).mock.calls[0][2];
        expect(options.vertexColors).toHaveLength(3);
        expect(options.boxRMax).toBeCloseTo(6.43, 9);
        expect(store.getState().molecule.espRange?.[0]).toBeCloseTo(-0.02, 6);
    });
    it('draws an orbital through updateFieldInScene, and the overlay follows the mode', async () => {
        const context = fakeContext();
        const store = makeStore();
        const { rerender } = render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        await flush();
        expect((updateFieldInScene as jest.Mock).mock.calls.at(-1)[1].sources[0].recipe).toEqual({ type: 'gaussianMO', moleculeId: 'h2o', index: 4 });
        expect((setMoleculeOverlay as jest.Mock).mock.calls.some(call => call[1] !== null)).toBe(true);
        rerender(<Provider store={store}><Harness active={false} context={context} /></Provider>);
        expect((setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1]).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/molecules/molecule_hooks.test.tsx`
Expected: FAIL, "Cannot find module '../../src/molecules/useMoleculeLoader'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/render_plan.ts
import type { AnalyticFieldSource, FieldRenderRequest } from '../field_source';
import type { LibraryMoleculeMeta } from './library_types';
import type { MoleculeSurface } from '../store/moleculeSlice';

/** Spec §4.2's budget case: one MO on a 96³ grid. */
export const MOLECULE_MO_RESOLUTION = 95;

export type MoleculeRenderPlan =
    | { kind: 'grid'; fraction: number | 'espSurface'; colourByEsp: boolean; label: string }
    | { kind: 'mo'; request: FieldRenderRequest; label: string };

export const gridHalfWidth = (meta: LibraryMoleculeMeta) => Math.abs(meta.grid.origin[0]);

export function moleculeOrbitalSource(meta: LibraryMoleculeMeta, index: number): AnalyticFieldSource {
    return { kind: 'analytic', id: `gaussianMO:${meta.id}:${index}`, recipe: { type: 'gaussianMO', moleculeId: meta.id, index }, rMax: gridHalfWidth(meta) };
}

export function planMoleculeRender(meta: LibraryMoleculeMeta, surface: MoleculeSurface, enclosedFraction: number): MoleculeRenderPlan {
    if (surface.kind === 'mo') {
        const orbital = meta.orbitals.find(o => o.index === surface.index);
        const label = `Computing ${orbital?.label ?? `orbital ${surface.index}`}…`;
        return {
            kind: 'mo', label,
            request: { sources: [moleculeOrbitalSource(meta, surface.index)], colors: ['#ffffff'], resolution: MOLECULE_MO_RESOLUTION, enclosedFraction, label },
        };
    }
    if (surface.kind === 'esp') return { kind: 'grid', fraction: 'espSurface', colourByEsp: true, label: `Mapping the potential on ${meta.name}…` };
    return { kind: 'grid', fraction: enclosedFraction, colourByEsp: false, label: `Loading ${meta.name}…` };
}
```

```ts
// src/molecules/useMoleculeLoader.ts
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { indexFailed, indexLoaded, metaFailed, metaLoaded } from '../store/moleculeSlice';
import { loadMoleculeIndex, loadMoleculeMeta } from './loader';
import { asLibraryMeta } from './library_types';
import { libraryEntries } from './catalogue';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Spec §4.2 "nothing loads until chosen": the index when the mode opens, a meta.json when a molecule is picked. */
export function useMoleculeLoader(active: boolean): void {
    const dispatch = useAppDispatch();
    const index = useAppSelector(state => state.molecule.index);
    const indexError = useAppSelector(state => state.molecule.indexError);
    const selectedId = useAppSelector(state => state.molecule.selectedId);
    const loadNonce = useAppSelector(state => state.molecule.loadNonce);

    useEffect(() => {
        if (!active || index !== null || indexError) return;
        let cancelled = false;
        loadMoleculeIndex()
            .then(entries => { if (!cancelled) dispatch(indexLoaded(libraryEntries(entries))); })
            .catch(error => { if (!cancelled) dispatch(indexFailed(message(error))); });
        return () => { cancelled = true; };
    }, [active, index, indexError, dispatch]);

    useEffect(() => {
        if (!active || !selectedId) return;
        const id = selectedId;
        loadMoleculeMeta(id)
            .then(meta => dispatch(metaLoaded({ id, meta: asLibraryMeta(meta) })))
            .catch(error => dispatch(metaFailed({ id, message: message(error) })));
    }, [active, selectedId, loadNonce, dispatch]);
}
```

```ts
// src/molecules/useMoleculeView.ts
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { renderFailed, renderFinished, renderStarted, setPick, MoleculePick } from '../store/moleculeSlice';
import { clearFieldMesh, pointerRaycaster, presentFieldMesh, setMoleculeOverlay, updateFieldInScene, VisualizerContext } from '../orbital_visualizer';
import { createGridMeshWorker } from '../workers/createGridMeshWorker';
import { runMeshWorker } from './mesh_worker_client';
import { getDensityGrid, getEspGrid } from './grid_cache';
import { ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY, enclosedFractionForDensity, espVertexColors } from './esp_color';
import { buildBallAndStick, detectBonds, pickMoleculePart } from './ball_and_stick';
import { dipoleArrow } from './dipole';
import { gridHalfWidth, planMoleculeRender } from './render_plan';

const TAP_TOLERANCE_PX = 6;
const samePick = (a: MoleculePick | null, b: MoleculePick | null) => a?.kind === b?.kind && a?.index === b?.index;

/**
 * Molecules mode's scene: the surface (density, ESP-coloured density, or an
 * MO), the structure overlay, and picking. Each surface request is numbered;
 * a result that is no longer the newest is dropped, so a slow load for one
 * molecule can never land under another's structure.
 */
export function useMoleculeView(contextRef: React.RefObject<VisualizerContext | null>, active: boolean, enclosedFraction: number): void {
    const dispatch = useAppDispatch();
    const meta = useAppSelector(state => state.molecule.meta);
    const surface = useAppSelector(state => state.molecule.surface);
    const showStructure = useAppSelector(state => state.molecule.showStructure);
    const showDipole = useAppSelector(state => state.molecule.showDipole);
    const requestRef = useRef(0);

    // Structure and dipole: rebuilt only when they change, never by a surface switch.
    useEffect(() => {
        const context = contextRef.current;
        if (!context) return;
        if (!active || !meta) { setMoleculeOverlay(context, null); return; }
        const group = new THREE.Group();
        if (showStructure) group.add(buildBallAndStick(meta.atoms, detectBonds(meta.atoms)));
        const arrow = showDipole ? dipoleArrow(meta) : null;
        if (arrow) group.add(arrow);
        setMoleculeOverlay(context, group);
    }, [contextRef, active, meta, showStructure, showDipole]);

    // Nothing chosen yet: do not leave the previous mode's picture up.
    useEffect(() => {
        if (active && !meta) clearFieldMesh(contextRef.current);
    }, [contextRef, active, meta]);

    useEffect(() => {
        const context = contextRef.current;
        if (!context || !active || !meta) return;
        const plan = planMoleculeRender(meta, surface, enclosedFraction);
        const requestId = ++requestRef.current;
        const current = () => requestRef.current === requestId && !context.isDisposed;
        let worker: Worker | null = null;
        dispatch(renderStarted(plan.label));
        (async () => {
            try {
                if (plan.kind === 'mo') {
                    const outcome = await updateFieldInScene(context, plan.request, false);
                    if (outcome.status === 'rendered' && current()) dispatch(renderFinished({ isoLevel: outcome.isoLevel }));
                    return;
                }
                const grid = await getDensityGrid(meta);
                if (!current()) return;
                const fraction = plan.fraction === 'espSurface' ? enclosedFractionForDensity(grid.values, ESP_SURFACE_DENSITY) : plan.fraction;
                worker = createGridMeshWorker();
                const meshData = await runMeshWorker(worker, { type: 'calculate', source: grid, enclosedFraction: fraction, requestId });
                if (!current()) return;
                let esp: ReturnType<typeof espVertexColors> | null = null;
                if (plan.colourByEsp) {
                    const espGrid = await getEspGrid(meta);
                    if (!current()) return;
                    esp = espVertexColors(meshData.positions, espGrid, ESP_LIMIT_HARTREE);
                }
                presentFieldMesh(context, meshData, { vertexColors: esp?.colors, boxRMax: gridHalfWidth(meta) });
                dispatch(renderFinished({ isoLevel: meshData.isoLevel, espRange: esp ? [esp.min, esp.max] : undefined }));
            } catch (error) {
                if (current()) dispatch(renderFailed(error instanceof Error ? error.message : String(error)));
            }
        })();
        return () => { worker?.terminate(); };
    }, [contextRef, active, meta, surface, enclosedFraction, dispatch]);

    // Hover with a mouse; tap (press and release without dragging) on touch.
    useEffect(() => {
        const context = contextRef.current;
        if (!context || !active || !meta) return;
        const canvas = context.renderer.domElement;
        let last: MoleculePick | null = null;
        let pressedAt: { x: number; y: number } | null = null;
        const pickAt = (event: PointerEvent) =>
            context.moleculeOverlay ? pickMoleculePart(context.moleculeOverlay, pointerRaycaster(context, event)) : null;
        const report = (pick: MoleculePick | null) => {
            if (samePick(pick, last)) return;
            last = pick;
            dispatch(setPick(pick));
        };
        const onMove = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse') return;
            const pick = pickAt(event);
            canvas.style.cursor = pick ? 'pointer' : '';
            report(pick);
        };
        const onDown = (event: PointerEvent) => { pressedAt = { x: event.clientX, y: event.clientY }; };
        const onUp = (event: PointerEvent) => {
            const start = pressedAt;
            pressedAt = null;
            if (event.pointerType === 'mouse' || !start) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_TOLERANCE_PX) return;
            report(pickAt(event));
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerup', onUp);
        return () => {
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointerup', onUp);
            canvas.style.cursor = '';
            dispatch(setPick(null));
        };
    }, [contextRef, active, meta, dispatch]);
}
```

In `src/components/OrbitalViewer.tsx`:

1. `import { useMoleculeView } from '../molecules/useMoleculeView';` and, directly after the initialisation effect (so the context exists when its effects run), `useMoleculeView(visualizerContextRef, atomMode === 'molecule', enclosedFraction);`.
2. In the `stateParams` effect and Phase 1's `fieldRequest` effect, add `if (atomMode === 'molecule') return;` as the first line after the context check (both already list `atomMode` in their dependencies). A Basic Orbitals request left in the orbital slice must never draw over a molecule; the molecule hook owns the scene in this mode.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/molecules/molecule_hooks.test.tsx tests/molecules/visualizer_molecule.test.ts && npx tsc --noEmit -p .`
Expected: PASS (5 hook tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/render_plan.ts src/molecules/useMoleculeLoader.ts src/molecules/useMoleculeView.ts src/components/OrbitalViewer.tsx tests/molecules/molecule_hooks.test.tsx
git commit -m "feat(molecules): lazy loading, surface orchestration that drops stale results, hover and tap picking

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: App and Controls integration, desktop and phone

**Files:**
- Modify: `src/components/Controls.tsx`, `src/App.tsx`, `src/App.test.tsx` (store gains the molecule reducer), `src/style.css`
- Create: `src/App.molecules.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 9–15; `MoDiagram` (Phase 5); `useDelayedFlag`, `PhoneSheet`.
- Produces: Controls props `enclosedFractionNote?: string`, `enclosedFractionDisabled?: boolean`; a *Molecules* mode button (value `'molecule'`); App layout for the mode.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/App.molecules.test.tsx
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './store/orbitalSlice';
import atomReducer from './store/atomSlice';
import moleculeReducer, { selectMolecule, metaLoaded, setSurface, renderFinished } from './store/moleculeSlice';
import App from './App';
import { LIBRARY_INDEX, waterMeta } from '../tests/molecules/fixtures';

jest.mock('./components/OrbitalViewer', () => ({ __esModule: true, default: () => <div data-testid="orbital-viewer" /> }));
jest.mock('./orbital_visualizer', () => ({}));
jest.mock('./workers/createAtomWorker', () => ({ createAtomWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null })) }));
jest.mock('./molecules/loader', () => ({
    loadMoleculeIndex: jest.fn(async () => LIBRARY_INDEX), loadMoleculeMeta: jest.fn(async () => waterMeta()), loadDensityGrid: jest.fn(),
}));

function installMatchMedia(matches: boolean) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({ media, matches, addEventListener: () => {}, removeEventListener: () => {} });
}
const makeStore = () => configureStore({
    reducer: { orbital: orbitalReducer, atom: atomReducer, molecule: moleculeReducer },
    middleware: m => m({ serializableCheck: false }),
});
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

async function enterMolecules(narrow: boolean) {
    installMatchMedia(narrow);
    const store = makeStore();
    const utils = render(<Provider store={store}><App /></Provider>);
    if (narrow) fireEvent.click(screen.getByRole('tab', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
    await flush();
    return { store, ...utils };
}

describe('Molecules mode', () => {
    it('puts the picker in the left column on a desktop, and the view settings on the right', async () => {
        const { container } = await enterMolecules(false);
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('list', { name: 'molecules' })).toBeInTheDocument();
        expect(within(container.querySelector('.view-panel') as HTMLElement).getByText(/Opacity/)).toBeInTheDocument();
    });
    it('offers the picker from the phone header and in the Explore tab', async () => {
        const { container } = await enterMolecules(true);
        const header = container.querySelector('.phone-header') as HTMLElement;
        fireEvent.click(within(header).getByRole('button', { name: 'Choose a molecule' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('Choose a molecule');
        fireEvent.click(screen.getByRole('button', { name: 'close molecule picker' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        expect(screen.getByText('Browse molecules')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Plot' })).toBeInTheDocument();
    });
    it('locks the contour to ρ = 0.001 for the ESP map, and shows its key', async () => {
        const { store, container } = await enterMolecules(false);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); store.dispatch(renderFinished({ isoLevel: 0.001, espRange: [-0.06, 0.07] })); });
        expect(container.textContent).toMatch(/Fixed at ρ = 0\.001 e\/a₀³/);
        expect(screen.getByLabelText('electrostatic potential colour key')).toBeInTheDocument();
        expect(screen.queryByLabelText('surface colour key')).toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/App.molecules.test.tsx`
Expected: FAIL, "Unable to find an accessible element with the role "button" and name "molecule mode"".

- [ ] **Step 3: Controls**

In `src/components/Controls.tsx`:
1. Props: add
```ts
  /** Replaces the enclosed-fraction helper text (Molecules mode states ρ, or why the contour is fixed). */
  enclosedFractionNote?: string;
  /** The ESP map is always drawn on ρ = 0.001; the fraction does not apply. */
  enclosedFractionDisabled?: boolean;
```
2. After the last existing mode `ToggleButton`: `<ToggleButton value="molecule" aria-label="molecule mode">Molecules</ToggleButton>`.
3. Every Basic-Orbitals-only branch currently gated on `!isAtomMode` (the n/l/mₗ block, the "One electron, Z = 1" note in the `isAtomMode ? … : …` else-branch, the Update Orbital button, and Phase 1's combination picker) is gated on `mode === 'hydrogenic'` instead. Where the else-branch is the Basic Orbitals note, replace `isAtomMode ? (A) : (B)` with `isAtomMode ? (A) : mode === 'hydrogenic' ? (B) : null`.
4. The enclosed-fraction `Select` gets `disabled={enclosedFractionDisabled}`, and its `FormHelperText` renders `enclosedFractionNote` when given, ahead of the existing wording.
5. `{isAtomMode && children}` becomes `{(isAtomMode || mode === 'molecule') && children}`.

- [ ] **Step 4: App**

In `src/App.tsx`:
1. Imports: the molecule slice actions (`selectMolecule`, `setSurface`, `setShowStructure`, `setShowDipole`), `useMoleculeLoader`, `MoleculeNav`, `MoleculePickerDialog`, `MoleculeReadout`, `MoleculeViewOptions`, `EspLegend`, `MoDiagram` (default from `./components/MoDiagram`), `formatDipole`.
2. State:
```ts
    const isMoleculeMode = atomMode === 'molecule';
    const molecule = useAppSelector(state => state.molecule);
    useMoleculeLoader(isMoleculeMode);
    const [moleculePickerOpen, setMoleculePickerOpen] = useState(false);
    const showMoleculeBusy = useDelayedFlag(molecule.renderLabel !== null || molecule.isLoadingMeta, BUSY_INDICATOR_DELAY_MS);
```
3. The mode-switch effect that seeds Basic Orbitals: `if (isAtomMode) return;` becomes `if (atomMode !== 'hydrogenic') return;`, with dependency `[atomMode]`. Entering Molecules must not start a hydrogen calculation.
4. Opacity default. The structure must show through the density, so on entering the mode lower an untouched full opacity once:
```ts
    useEffect(() => {
        if (isMoleculeMode && surfaceStyle.opacity === 1) dispatch(setSurfaceStyle({ opacity: 0.6 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMoleculeMode]);
```
   The existing "cut belongs to shell views" effect already treats Molecules as an orbital view (`!isAtomMode`), so the cut starts off.
5. `canvasBusyLabel`: prepend `isMoleculeMode ? (showMoleculeBusy ? (molecule.renderLabel ?? `Loading ${molecule.selectedId}…`) : null) : …`.
6. `showPhaseLegend` becomes `atomMode === 'hydrogenic' || (isAtomMode && atomLevel === 'orbital') || (isMoleculeMode && molecule.surface.kind === 'mo')`, keeping any `'bonds'` term Phase 5 added.
7. Molecule pieces:
```tsx
    const moleculeNavProps = {
        entries: molecule.index, indexError: molecule.indexError, meta: molecule.meta, selectedId: molecule.selectedId,
        isLoading: molecule.isLoadingMeta, surface: molecule.surface,
        onSelectMolecule: (id: string) => dispatch(selectMolecule({ id })),
        onSurfaceChange: (surface: MoleculeSurface) => dispatch(setSurface(surface)),
        onOpenPicker: () => setMoleculePickerOpen(true),
    };
    const moleculeOptions = molecule.meta && (
        <MoleculeViewOptions showStructure={molecule.showStructure} showDipole={molecule.showDipole}
            onShowStructure={on => dispatch(setShowStructure(on))} onShowDipole={on => dispatch(setShowDipole(on))}
            dipoleText={formatDipole(molecule.meta)} />
    );
    const moleculeDiagram = (width: number) => molecule.meta && (
        <div className="molecule-diagram-card">
            <MoDiagram orbitals={molecule.meta.orbitals} width={width}
                selectedIndex={molecule.surface.kind === 'mo' ? molecule.surface.index : null}
                onSelect={(index: number) => dispatch(setSurface({ kind: 'mo', index }))} />
        </div>
    );
    const moleculeNote = molecule.surface.kind === 'esp'
        ? 'Fixed at ρ = 0.001 e/a₀³, the surface ESP maps are conventionally drawn on'
        : molecule.isoLevel === null ? undefined
        : molecule.surface.kind === 'mo' ? `|ψ|² = ${molecule.isoLevel.toExponential(2)}` : `ρ = ${molecule.isoLevel.toExponential(2)} e/a₀³`;
```
   Pass `enclosedFractionNote={isMoleculeMode ? moleculeNote : undefined}` and `enclosedFractionDisabled={isMoleculeMode && molecule.surface.kind === 'esp'}` to `Controls`, and `{isMoleculeMode ? moleculeOptions : null}` as its children (atom mode keeps passing none).
8. `renderRadialPlot` returns `moleculeDiagram(width)` in Molecules mode, so the right column and the Plot tab show the MO energy diagram where atoms show the radial plot.
9. Phone tabs in Molecules mode:
```tsx
        : isMoleculeMode ? [
            { key: 'explore', label: 'Explore', content: <MoleculeNav {...moleculeNavProps} variant="body" /> },
            { key: 'view', label: 'View', content: controls },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ]
```
10. Layout: the phone header renders `<MoleculeNav {...moleculeNavProps} variant="header" />` inside `.phone-header` when `isMoleculeMode`. The desktop `.side-panel` renders `<MoleculeNav {...moleculeNavProps} />` when `isMoleculeMode`. On the phone, `<MoleculePickerDialog open={moleculePickerOpen} entries={molecule.index} error={molecule.indexError} selectedId={molecule.selectedId} onSelect={id => dispatch(selectMolecule({ id }))} onClose={() => setMoleculePickerOpen(false)} />`.
11. Canvas overlays in Molecules mode, in the existing bottom-centre slot:
```tsx
                {isMoleculeMode && molecule.meta && (
                    <div className="molecule-legend-stack">
                        {molecule.showStructure && (
                            <MoleculeReadout atoms={molecule.meta.atoms} pick={molecule.pick} geometrySource={molecule.meta.geometrySource} touch={isNarrow} />
                        )}
                        {molecule.surface.kind === 'esp' && <EspLegend range={molecule.espRange} method={molecule.meta.method.density} />}
                    </div>
                )}
                {isMoleculeMode && (molecule.error || molecule.renderError) && (
                    <Alert severity="error" className="atom-error">{molecule.error ?? molecule.renderError}</Alert>
                )}
```
   Show the ψ phase legend in Molecules mode only for MOs (step 6); it and the stack share the slot, so when both apply, put the phase legend inside the stack instead of rendering it separately.
12. In `src/App.test.tsx`, add `molecule: moleculeReducer` (imported from `./store/moleculeSlice`) to the test store's reducers. App now reads `state.molecule`.

Append to `src/style.css`:
```css
.molecule-diagram-card { background: rgba(240, 240, 240, 0.94); border-radius: 10px; padding: 10px; }
.molecule-legend-stack .phase-legend { position: static; transform: none; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest src/App.molecules.test.tsx src/App.test.tsx src/components/Controls.test.tsx && npx tsc --noEmit -p .`
Expected: PASS, the existing App and Controls tests included; tsc clean.

- [ ] **Step 6: Live verification, desktop 1440×900**

With the dev server at http://localhost:5391 and the Playwright browser tools (`browser_resize` 1440×900, `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages`):
1. Switch to Molecules. The `.side-panel` shows "Choose a molecule", the search box, six category chips and 25 rows; `.view-panel` shows the view settings; the canvas is empty, and the Network panel shows only `index.json` fetched.
2. Pick Water. The list folds to "Change molecule". A translucent density with the ball-and-stick inside appears within 1.5 s (check the `Visualizer:` timing or the Performance panel). The dipole arrow points from O towards the H side. The right column shows the MO diagram. Only `h2o/meta.json` and `h2o/density.bin.gz` are fetched.
3. Hover the O: the readout reads `O, atom 1 / ∠H–O–H 104.5°`. Hover an O–H stick: `O–H 0.958 Å`. The cursor is a pointer only over the structure.
4. Choose *Electrostatic potential*: red over the O lone pairs, blue at the H. The key reads −0.05 … +0.05 Ha/e with "this molecule: …". The enclosed-fraction select is disabled with the ρ = 0.001 note. Switch to Benzene: the map is near white with a pale red π face, on the same scale.
5. *Orbitals*: the list shows 1b1 as HOMO. Click it: red/blue lobes perpendicular to the plane, ψ legend showing, camera unchanged.
6. Cut X at 50 %: the density is capped, the sticks are whole. Opacity 1: the surface hides the sticks, and at 0.3 they are clear.
7. Methane: no dipole arrow; the view settings say "μ = 0 by symmetry".
8. `browser_console_messages`: no errors.

- [ ] **Step 7: Live verification, phone 390×844 (touch)**

`browser_resize` 390×844 with touch emulation:
1. The header reads "Choose a molecule". Tapping it opens the full-screen dialog; typing "pyr" leaves Pyridine; tapping it closes the dialog and the header reads "Pyridine · C₅H₅N ▾".
2. The Explore tab shows the surface toggle and, below it, "Browse molecules" with the picker. View holds the controls with Ball-and-stick / Dipole arrow. Plot holds the MO diagram.
3. Tap the N atom: the readout lists its C–N–C angle. A drag rotates without changing the readout.
4. Nothing overlaps: the readout and ESP key sit above the sheet's tab bar and clear of `.phone-header`; the molecule is centred in the free area (the view insets apply).
5. Rotate to 844×390: the sheet moves to the right edge and the legend stack stays in the free area.
6. No console errors.

Fix any defect found, add a test for it where one can be written, and rerun Step 5.

- [ ] **Step 8: Commit**

```bash
git add src/components/Controls.tsx src/App.tsx src/App.test.tsx src/App.molecules.test.tsx src/style.css
git commit -m "feat(molecules): Molecules mode in the app: picker left, settings and MO diagram right, phone header and tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: End-to-end sweep, performance, export parity, docs

**Files:**
- Modify: `README.md`, `docs/HANDOFF.md`

**Interfaces:**
- Consumes: the whole phase.
- Produces: a verified, documented Molecules mode.

- [ ] **Step 1: Full checks**

Run, each in the foreground: `npx jest` (about a minute), then `npx tsc --noEmit -p .`, then `npm run build && test -f dist/molecules/h2o/density.bin.gz && echo SHIPPED`, then `pytest tools/molecules -q`.
Expected: all green; `SHIPPED`.

- [ ] **Step 2: Sweep all 25 at desktop size**

At 1440×900, pick each molecule from the picker in turn and view density, then ESP, then its HOMO. For each, record in a scratch note (not committed) the time from pick to surface, and any console error. Expected: every molecule renders all three; ESP colours sit where chemistry expects (negative on O/N lone pairs and π faces, positive on acidic H); no errors. Pass: every density under 1.5 s on this machine, every MO under 1.5 s after the first per molecule (the basis fetch).

- [ ] **Step 3: Phone budget**

At 390×844 with 4× CPU throttling (Performance panel), time density and HOMO for glycine and SF₆, the largest. Expected: under 4 s each (§3.7). If over, report the timing. Do not lower the MO resolution silently: that is a spec trade-off for the owner.

- [ ] **Step 4: Share and export parity**

In Molecules mode with glycine's HOMO shown and dipole off: Phase 2's *Share* URL, opened in a new tab, restores `#mode=molecule&id=glycine&show=mo:<homo>&dipole=0`. The *Export* menu's PNG, glTF and STL each download a non-empty file, and the PNG shows what the canvas shows. A URL with `id=nope` shows "Could not load “nope”: …" and no stale picture. A URL with `show=mo:999` shows the density.

- [ ] **Step 5: Docs**

`README.md`: a "Molecules" section. It covers the 25 molecules and categories; what each view shows; methods (B3LYP/def2-TZVP via PySCF, geometry sources, the ρ = 0.001 ESP surface and the fixed ±0.05 Ha/e scale); the validation tolerances; and how to regenerate (`tools/molecules/optimise.py`, `build_library.py --only <id>`, `--rows-only`).
`docs/HANDOFF.md`: a "Molecule library" section. It records the decisions that are not obvious from the code: voxel-averaged density and why; the fixed ESP scale; ROKS for NO₂; the overlay being unclipped; framing keyed on the grid box. It also lists the owner decisions this phase surfaced: any dipole escalation, the committed data size (~50 MB in git), and the data licence (spec §6.1).

- [ ] **Step 6: Commit**

```bash
git add README.md docs/HANDOFF.md
git commit -m "docs: the molecule library -- methods, validation, regeneration, and decisions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (§5 Phase 6):**
- Picker with search and the five categories: Task 13 (desktop left column, phone header dialog, and Explore tab, wired in Task 16).
- The 25 molecules: Task 2 catalogue; Task 7 build; Task 7 index-order test.
- Ball-and-stick with lengths and angles on hover: Task 10, Task 14 readout, Task 15 picking.
- Total density: Tasks 4, 11, 15. ESP mapped on it, red negative and blue positive: Tasks 5, 9, 15.
- Any MO from a list with energies, HOMO/LUMO marked: Tasks 5, 14, 15; plus Phase 5's MoDiagram in the Plot slot (Task 16).
- Dipole arrow: Task 10. Cut-away, opacity and export as for atoms: Tasks 11, 16, 17.
- Validation: geometry to 0.01 Å / 1° (Task 7), dipoles within 10 % with the stated floor (Task 7), HOMO–LUMO ordering (Tasks 5, 7), density integrals within 0.5 % (Tasks 4, 6, 7).
- §4.2: file set and meta (Task 6); ≤ 3 MB (Tasks 6, 7, both languages); lazy loading (Task 15 test); `DecompressionStream` (Task 8).
- §4.3: URL keys (Task 12). §3.1 methods on every number: captions in Tasks 9, 10, 14. §3.2: rows in `VALIDATION` (Task 7). §3.5: explicit errors (Tasks 8, 12, 13, 16).

**Placeholder scan:** no TBD/TODO. The conditional steps (Task 1 Steps 5 and the contract fixes, Task 7's escalation paths) each state the exact check and the exact action.

**Type consistency:** `LibraryMoleculeMeta`, `MoleculeSurface`, `MoleculePick`, `GridMeshRequest` / `MeshWorkerResponse`, `PresentFieldMeshOptions { vertexColors?, boxRMax, showAxes? }`, `planMoleculeRender` and `MOLECULE_MO_RESOLUTION` are used with the same names and shapes in every task that consumes them. Python: `Reference(quantity, value, unit, source, tolerance, atoms, label)`, `build_molecule(...)`, `validation_rows(entry, meta)` likewise.

**Review Focus → owning tests:** gzip pass-through (Task 8), axis order (Tasks 4 + 8), superseded meshes (Task 15) and re-pick nonce (Task 12), box truncation (Tasks 6 + 7), zero-dipole arrow and degenerate HOMO sets (Tasks 10 + 5).
