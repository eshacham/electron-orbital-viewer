# Spec: Beyond Isolated Atoms — Fields, Ions, Relativity, Bonds and Molecules

**Status:** approved 2026-09-25 ("I want all of it")
**Extends:** `2026-08-29-multi-electron-atoms.md`. Removes nothing.
**Plans:** one per phase, `docs/superpowers/plans/2026-09-25-phase-N-*.md`.

---

## 1. Goal

Make this the tool students and researchers reach for when they want to *see*
electronic structure: from one electron around a proton, through every atom
of the periodic table, to the first bonds and the molecules chemistry is
taught with — and never show a picture that is prettier than it is true.

Two audiences, one rule each:

- **Students** need the concepts they are taught — hybrids, bonding and
  antibonding orbitals, lone pairs, polarity, ions, excited states — drawn
  from real calculations, with the "why" one click away.
- **Researchers and teachers** need to trust the numbers, cite the tool, and
  get data out: stated methods, published validation, shareable state,
  exportable meshes, grids and images.

## 2. Where the app stands

- **Basic Orbitals:** exact hydrogenic orbitals, marching cubes over a sampled
  ψ (`generateOrbitalMesh` in `src/orbital_mesh.ts`, evaluator from
  `makeWaveFunctionEvaluator` in `src/quantum_functions.ts`).
- **Atom mode:** central-field SCF (LDA exchange + VWN5 correlation),
  non-relativistic, neutral ground states, spherically averaged
  (`src/atom/scf.ts`, `radial_solver.ts`, `configurations.ts`). Three levels:
  atom → shell → orbital.
- Validated against NIST LDA to 0.0002 %. Relativistic error grows as ~Z²
  (Au 6s: 26.9 %).

What it cannot show, and this spec adds: external fields, hybrids, charged
and excited atoms, relativistic contraction and spin–orbit splitting, bonds,
and molecules.

## 3. Principles (apply to every phase)

1. **Every number states its method.** A displayed energy, radius, dipole or
   length carries its level of theory in the UI (tooltip or caption).
2. **Validated before shipped.** Each quantitative feature has a reference
   table (published values) and a test asserting agreement within a stated
   tolerance. The tolerance and the reference go in the phase's section below
   and in the Methods page (Phase 7).
3. **Qualitative is labelled qualitative.** A model chosen for illustration
   (LCAO from atomic orbitals, first-order perturbation theory) says so on
   screen, including its range of validity.
4. **Eigenvalues are not ionisation energies** (existing ruling R19). Where an
   ionisation or excitation energy is shown, it is a ΔSCF total-energy
   difference, labelled as such.
5. **Failures are shown, not hidden.** An anion LDA cannot bind, a field
   strong enough to ionise, an unconverged SCF: each is an explicit message,
   never a silently wrong picture.
6. **The existing renderer is the renderer.** New physics produces either an
   analytic ψ(x, y, z) evaluator or a sampled scalar grid (§4.1); both flow
   through marching cubes, the phase colouring, the cut-away caps and the
   enclosed-fraction contour that exist today.
7. **Performance budget.** Any new view renders in under 1.5 s on a 2020
   laptop and under 4 s on a mid-range phone; heavy work runs in a worker;
   the UI never blocks.
8. **Layout contract.** New panels live in the existing columns on desktop
   (navigation left, view settings right) and in the phone sheet's tabs
   (Explore / View / Plot). No new floating panel over the canvas.

## 4. Shared architecture

### 4.1 Field sources

Everything rendered is one of two sources, defined once in
`src/field_source.ts` (Phase 1 creates it):

```ts
/** An analytic field, evaluated on demand in a worker. */
export interface AnalyticFieldSource {
    kind: 'analytic';
    /** Stable id for caching, e.g. 'hydrogenic:2,1,0,Z1' or 'hybrid:sp3:0'. */
    id: string;
    /** Serialisable recipe; the worker rebuilds the evaluator from it. */
    recipe: FieldRecipe;
    /** Half-width of the sampling box, a0. */
    rMax: number;
}

/** A precomputed or client-computed grid. */
export interface GridFieldSource {
    kind: 'grid';
    id: string;
    /** Points per axis. */
    shape: [number, number, number];
    /** World position of grid point (0,0,0), a0. */
    origin: [number, number, number];
    /** Spacing, a0. */
    spacing: number;
    /** ψ (signed) or ρ (non-negative); tells the renderer whether to phase-colour. */
    quantity: 'psi' | 'density';
    values: Float32Array;
}

export type FieldSource = AnalyticFieldSource | GridFieldSource;
```

`FieldRecipe` is a discriminated union that grows per phase:
`{ type: 'hydrogenic', n, l, ml, Z, radialSamples? }` (today's case),
`{ type: 'combination', terms: Array<{ coefficient: number; orbital: HydrogenicRecipe }> }`
(Phase 1 hybrids and Stark states), `{ type: 'polarized1s', field: number }`
(Phase 1), `{ type: 'h2plus', R: number, state: string }` (Phase 5),
`{ type: 'gaussianMO', moleculeId: string, index: number }` (Phases 5–6),
`{ type: 'gaussianDensity', moleculeId: string }` (Phase 5; evaluates √ρ
from the shipped basis, so a bond scan needs one basis file per geometry
rather than twenty density grids).

Densities are drawn two ways. Where a grid integrates reliably (Phase 6's
voxel-averaged grids) the enclosed-fraction contour applies as for atoms.
Where it cannot — a point-sampled grid under-integrates the core cusps by
up to ~15 % — the contour is a fixed density value (ρ = 0.002, 0.05 or
0.2 e/a₀³, and the conventional 0.001 for electrostatic-potential maps),
labelled as such.

`generateOrbitalMesh` is generalised to `generateFieldMesh(source,
resolution, enclosedFraction)`; the old signature stays as a thin wrapper
so nothing existing changes behaviour. For `quantity: 'density'` the field is
ρ itself (no squaring) and every vertex takes the single "density" colour.

### 4.2 Molecule data format (Phases 5–6)

Produced offline by `tools/molecules/` (Python, PySCF), consumed by the app:

```
public/molecules/index.json           — list: id, name, formula, category, tags
public/molecules/<id>/meta.json       — see below
public/molecules/<id>/density.bin.gz  — Float32 ρ on the grid in meta.grid
public/molecules/<id>/esp.bin.gz      — Float32 electrostatic potential, coarser grid
public/molecules/<id>/basis.json      — Gaussian basis + MO coefficients (molden-equivalent)
```

`meta.json`:

```json
{
  "id": "h2o", "name": "Water", "formula": "H2O",
  "atoms": [{ "Z": 8, "position": [0, 0, 0.2217] }, "... bohr"],
  "geometrySource": "experiment (CCCBDB)",
  "method": { "density": "B3LYP/def2-TZVP", "energies": "CCSD(T)/aug-cc-pVTZ" },
  "totalEnergyHartree": -76.4,
  "dipoleDebye": 1.85,
  "orbitals": [{ "index": 4, "label": "1b1", "energyHartree": -0.49, "occupation": 2, "role": "HOMO" }],
  "grid": { "shape": [96, 96, 96], "origin": [-7, -7, -7], "spacing": 0.147 },
  "espGrid": { "shape": [48, 48, 48], "origin": [-7, -7, -7], "spacing": 0.294 },
  "references": [{ "quantity": "dipole", "value": 1.855, "unit": "D", "source": "CRC Handbook" }],
  "generator": { "pyscf": "2.x", "script": "tools/molecules/generate.py", "commit": "<sha>" }
}
```

Density and ESP ship as grids (decoded with `DecompressionStream('gzip')`);
molecular orbitals ship as basis + coefficients and are evaluated in a
worker on demand — one MO on a 96³ grid is ~10⁸ Gaussian evaluations with
screening, inside the budget, and keeps each molecule under **3 MB**.
Molecules are lazy-loaded; nothing loads until chosen.

### 4.3 URL state (Phase 2, used by all later phases)

The whole view round-trips through the URL hash, e.g.
`#mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&cut=x:0.5&frac=0.9` or
`#mode=molecule&id=h2o&show=mo:4&iso=0.9`. One module
(`src/url_state.ts`) owns encoding/decoding; each mode registers its keys.
Unknown or invalid keys are ignored, never thrown on. Its API, which later
phases depend on by name:

```ts
export function encodeState(): string;              // current view → hash, no '#'
export function applyState(hash: string): void;     // hash → dispatches restoring the view
export function registerUrlKeys(
    mode: string,
    encoder: (state: RootState) => Record<string, string>,
    decoder: (params: URLSearchParams, dispatch: AppDispatch) => void
): void;
```

### 4.4 Validation table (Phase 1 creates it, every phase appends)

`src/validation/references.ts` holds every quantitative check the app makes
against published values, one row each:

```ts
export interface ValidationRow {
    phase: number; quantity: string; system: string;
    app: number; reference: number; unit: string;
    tolerancePercent: number; referenceSource: string; method: string;
}
export const VALIDATION: ValidationRow[];
```

`app` values come from the real computation (a test or the offline pipeline
writes them), never typed by hand. `tests/validation/references.test.ts`
fails if any row is outside its tolerance; the Methods page (Phase 7)
renders the same rows.

## 5. Phases

Each phase ships on its own: tests green, verified in the running app at
desktop and phone sizes, deployed.

### Phase 1 — Hybrids and the Stark effect (Basic Orbitals)

**What the user sees.** Basic Orbitals gains a *Combination* picker next to
n/l/mₗ: **sp**, **sp²**, **sp³** (each hybrid selectable, or all at once
overlaid in distinct colours), and **Electric field**:

- *n = 1 in a field:* a field-strength slider (0 to 0.05 a.u., with the V/m
  equivalent shown) draws the ground state polarised by first-order
  perturbation theory, ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ (Dalgarno–Lewis), with the
  induced dipole μ = αF shown and α = 9/2 a₀³.
- *n = 2 in a field:* the Stark (parabolic) states (2s ± 2p_z)/√2, with the
  first-order shifts ±3F labelled — the field-selected basis, which is also
  the sp hybrid shape. Its slider stops at 1/256 ≈ 0.0039 a.u.: above the
  classical over-the-barrier field F = E²/4 an n = 2 electron is not bound,
  and the view says so instead of drawing it. (Corrected 2026-09-25 from the
  Phase 1 plan; 0.05 a.u. is safe for n = 1 only.)

**Validation.** Hybrids orthonormal on the sampling grid (|⟨i|j⟩ − δᵢⱼ| <
10⁻³); sp³ lobe axes at 109.47° ± 0.5°; α computed from the drawn ψ by
numerical integration = 4.5 ± 1 %; |⟨2s|z|2p_z⟩| = 3 a₀ ± 1 %.

**Honesty.** Hybrids are captioned "a basis choice for one atom — hybrids
describe bonding directions, not a free atom's ground state". The field
view is captioned with its validity (F ≪ 1 a.u.; ionisation by tunnelling
ignored) and refuses fields above 0.05 a.u.

### Phase 2 — Share and export

**What the user sees.** A *Share* button copies a URL that restores the exact
view (§4.3); *Export* offers PNG (at 2× screen resolution, with or without
overlays), glTF (colours kept, for slides and AR) and STL (for 3D printing,
watertight, in millimetres at a chosen scale), CSV of the radial
distribution curves, and — for researchers — a Gaussian cube file of the
sampled field.

**Validation.** URL round-trip property test over every mode and level;
exported STL passes a manifold check; cube file readable by the standard
format rules (header, units bohr, values).

### Phase 3 — Ions and excited states (atom mode)

**What the user sees.** The element picker gains a *Charge* stepper (−2 to
+3, limited per element to what is physically sensible) and an *Excite*
action on the valence subshell ("promote one electron to…"). The atom
redraws; the scale bar makes Na⁺ shrinking and Cl⁻ swelling obvious; a
compare strip shows the neutral atom's contour ring for reference.

Energies shown: **ionisation energy** and **excitation energy** as ΔSCF
differences of total energies, labelled "ΔSCF, LDA". (Recorded 2026-09-25
from the Phase 3 prototype: the energies need the spin-polarised form of the
same functional — plain LDA misses O, F and S by 12–22 % — while the pictures
stay on the NIST-validated spin-restricted LDA. The tooltip states both.
Most anions, Cl⁻ included, are unbound in LDA; the anion-size check uses
Br⁻ and I⁻, which are bound.)

**Physics.** `solveAtom` accepts a configuration rather than Z alone; ion
configurations come from a NIST-derived table (transition metals lose 4s
first: Fe²⁺ is [Ar] 3d⁶). Anions: if the highest occupied eigenvalue is
≥ 0 the electron is unbound in LDA — show "LDA does not bind this anion"
and do not draw it as if it did.

**Validation.** ΔSCF first ionisation energies for H–Ar within 10 % of NIST
experimental values (e.g. Na 5.139 eV, Cl 12.968 eV); Na 3s→3p excitation
within 10 % of 2.104 eV (the D line); contour radius strictly ordered
Na⁺ < Na, and neutral < anion for the anions LDA binds (Br⁻, I⁻); Cl⁻
reported as unbound.

### Phase 4 — Relativity

**What the user sees.** A *Relativity* switch in atom mode: *off*
(today), *scalar* (default from Cs onward once shipped), *with spin–orbit*.
With spin–orbit, subshells split into j-levels (6p → 6p½, 6p³⁄₂); the
radial plot overlays the non-relativistic curve for comparison; a
"what changed" readout reports the contraction of the valence s shell in
percent.

**Physics.** Scalar-relativistic Koelling–Harmon radial equation
(mass-velocity and Darwin terms), then two-component Dirac for spin–orbit,
plugged into the same `RadialState` interface the SCF already consumes.

**Validation.** Against NIST's ScRLDA and RLDA tables (Kotochigova et al.):
total energies and eigenvalues within 1 % for Ne, Ar, Kr, Xe, Au, Hg, Rn,
U (Au 6s currently 26.9 % off). For Z ≤ 18 the relativistic results agree
with NIST's relativistic columns within 0.1 %, and for Z ≤ 10 switching
relativity on moves the total energy by less than 0.1 %. (Corrected
2026-09-25: the earlier wording, "light atoms unchanged within 0.1 %", is
false — argon's total energy really moves 0.30 % and its 3s eigenvalue
0.82 %, as the Phase 4 plan measured.)

### Phase 5 — Bonds mode: the first bond, exactly

**What the user sees.** A third mode, **Bonds**, for two-atom systems:

- **H₂⁺, solved exactly** (prolate spheroidal coordinates, separable ODEs) at
  any internuclear distance R from a slider; the potential-energy curve
  beside it with the current R marked; bonding 1σg and antibonding 1σu*
  drawn, density piling up between the nuclei in one and a node in the
  other.
- **H₂, He₂, Li₂ … F₂, CO, HF, N₂, O₂:** precomputed bond-length scans
  (§4.2 data, 20 geometries per molecule) with the slider snapping to them;
  a molecular-orbital energy diagram with occupations — O₂'s two unpaired
  π* electrons and He₂'s zero bond order explicit.

**Physics.** H₂⁺ live in a worker. Everything else from the offline pipeline
(`tools/molecules/`, PySCF): energies at CCSD(T)/aug-cc-pVTZ (full CI for
H₂), densities and orbitals at B3LYP/def2-TZVP.

**Validation.** H₂⁺: R_e = 1.997 a₀ ± 0.5 %, E(R_e) = −0.6026 Ha ± 0.1 %.
H₂: R_e = 1.401 a₀ ± 1 %, D_e = 4.75 eV ± 2 %. N₂ R_e 1.098 Å, O₂ 1.207 Å,
F₂ 1.412 Å, CO 1.128 Å, HF 0.917 Å, each within 1 %. O₂ ground state is
the triplet.

### Phase 6 — Molecule library

**What the user sees.** A molecule picker (search + categories: *first
examples*, *hybridisation*, *polarity*, *aromatic*, *biomolecule fragments*)
with an initial set of 25: H₂O, NH₃, CH₄, CO₂, C₂H₂, C₂H₄, C₂H₆, HCN,
H₂CO, CH₃OH, HCOOH, BF₃, SF₆, benzene, pyridine, formamide, glycine,
ethanol, acetone, O₃, NO₂, SO₂, PH₃, H₂S, SiH₄.

For each: ball-and-stick geometry with bond lengths and angles on hover;
the **total density** isosurface; the **electrostatic potential mapped on
it** (red negative, blue positive — how polarity is taught); any **MO**
from a list with energies (HOMO/LUMO marked); the **dipole** arrow; the
cut-away, opacity and export exactly as for atoms.

**Validation.** Geometries within 0.01 Å / 1° of the stated source; dipoles
within 10 % of experiment (water 1.85 D, ammonia 1.47 D); HOMO–LUMO
ordering matches the stated method; densities integrate to the electron
count within 0.5 %.

### Phase 7 — Learning and research

**What the user sees.**

- **Guided lessons**: short, linked sequences that drive the app ("Why the
  periodic table has its shape", "What is a bond?", "Why water is bent",
  "Why gold is yellow"). Each step sets the view via URL state and shows two
  or three sentences; students can leave and explore at any step.
- **Compare view**: two atoms or molecules side by side at the same scale
  (the backlog's "relative atomic size", generalised).
- **Methods & validation page**: every method, every approximation, every
  reference table from Phases 1–6 with the app's numbers next to the
  published ones, generated from the same data the tests assert.
- **Cite this**: `CITATION.cff`, a Zenodo DOI per release, a "How to cite"
  panel.
- **Embed mode**: `?embed=1` hides chrome for iframes in course pages and
  LMSs; a copy-embed-code action.
- **Accessibility**: full keyboard navigation of every control, screen-reader
  labels for the 3D view's state ("Iron, M shell, cut along x at 50 %"),
  reduced-motion respected, WCAG AA contrast.
- **Offline**: installable PWA; atoms work fully offline, molecules cache
  once viewed.

## 6. Decisions for the owner (not made in this spec)

1. **Licence** — `package.json` says ISC; adoption and citation favour an
   OSI licence stated in a LICENSE file (MIT for the code, CC-BY-4.0 for the
   generated molecule data is the common pairing).
2. **Analytics** — whether to collect privacy-respecting usage counts
   (no cookies) to learn which lessons and molecules are used.
3. **Domain and name** — a memorable domain instead of the CloudFront URL.

## 7. Out of scope

Dynamics (molecular vibrations, reactions), periodic solids, arbitrary user
molecules computed in the browser (a later option: PySCF under Pyodide), and
multi-reference methods beyond full CI for two electrons.

## 8. Sequencing

1 → 2 → 3 → 4 → 5 → 6 → 7, each deployed when done. Phase 2 comes early
because every later phase is more useful the moment it can be shared.
Phase 5 builds the offline molecule pipeline that Phase 6 extends; Phase 7
reads the validation data the others produce.
