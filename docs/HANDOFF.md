# Handoff — multi-electron atom viewer

Last updated 2026-08-30. Branch: `feat/multi-electron-atoms`, off `main` at
`eb210f2`.

**Read first:** `docs/superpowers/specs/2026-08-29-multi-electron-atoms.md`
(the design and its three addenda) and `README.md` (what the app is). This
file covers state, decisions that are not obvious from the code, and the
backlog.

---

## Where the work stands

Every item on the previous session's backlog is done, tested and verified in
the running app. The app now has three modes (the third, Bonds, is Phase 5,
below):

- **Atom mode** (default) — real neutral atoms, Z = 1…118, from a
  self-consistent-field calculation, chosen off a periodic table. Three
  levels: atom → shell → orbital, with core/valence distinguished at the atom
  level and per-subshell isolation at the shell level.
- **Basic Orbitals mode** — the exact one-electron viewer, fixed at Z = 1.
- **Bonds mode** — H₂⁺ solved exactly at any bond length, and ten more
  diatomics from a precomputed CCSD(T)/B3LYP pipeline, each with a potential
  curve, a molecular-orbital diagram and an electron density (see "Phase 5 —
  Bonds mode" below).

The physics engine is complete and externally validated. It reproduces NIST's
LDA total energies to **0.0002 %** (He −2.834829 vs −2.834836; Ne −128.233250
vs −128.233481; Ar −525.945350 vs −525.946195), and argon's 2s/2p orbital
energies read −10.794 / −8.443 Ha on screen against NIST's −10.794172 /
−8.443439.

~1423 tests, `npm run build` clean, `npx tsc --noEmit` clean. Deployed.

## Architecture of `src/atom/`

Physics, no rendering, no React:

| file | responsibility |
| --- | --- |
| `radial_grid.ts` | Logarithmic grid `r = rMin·e^(j·dx)`; Simpson quadrature with the `dr = r·dt` Jacobian; interpolation. **Throws on an even point count** (Simpson needs odd) and on `highestN` outside 1–7 |
| `numerov.ts` | Numerov integration of `y'' = g·y`. Pure numerics, no physics, no grid knowledge |
| `radial_solver.ts` | Bound-state eigenvalue search for one (n, l) in a given potential. Two-phase: node-count bracketing, then log-derivative matching. Throws if the solution is not contained by the grid |
| `configurations.ts` | Ground-state configurations Z = 1…118 from a hardcoded NIST-derived table (not Madelung + exceptions). All 20 aufbau exceptions verified. Also the valence-shell accessors |
| `hartree.ts` | Hartree potential from radial Poisson; Dirac/Slater exchange |
| `correlation.ts` | VWN5 correlation. Verified against published Ceperley–Alder values |
| `scf.ts` | The self-consistency loop. Adaptive mixing β (not fixed) because plain linear mixing charge-sloshes on transition metals and lanthanides |
| `atom_profile.ts` | Derives everything the UI needs from a converged solution: total/shell/subshell D(r), contour and **display** radii, shell peaks, numerical R_nl accessor |
| `shell_view.ts` | Levels 1–2: sphere + cut-face shader (ring colours, core/valence) |
| `shell_composition*.ts` | A shell's constituent orbitals rendered inside it, with isolation |
| `shell_pick.ts` | Radius → shell, for clicking a ring |
| `level_transition.ts` | Animated transitions between levels |
| `*_cache.ts` | Profile and mesh caches |
| `useAtomSolver.ts` | Owns the SCF worker lifecycle |

Outside `src/atom/`: `periodic_table.ts` (layout and block classification)
and `curve_colors.ts` (the single palette the plot, the rings and the lobes
all draw from).

**Naming, enforced throughout:** `D(r) = 4πr²ρ(r)` is the *radial
distribution*; `density` means `ρ(r)` alone. They differ by 4πr² and
conflating them causes real bugs.

## Decisions that are not obvious from the code

These cost real effort to arrive at; do not undo them without reading why.

- **Log grid is mandatory.** An atom spans ~2.5 orders of magnitude in
  radius. Uranium's 1s peaks inside 0.02 a₀ while its valence reaches past 40.
- **Grid extent must come from the physics, not a formula.** An invented
  `rMax` formula silently returned a **41 % wrong energy** for hydrogen's 7s.
  `gridForAtom` now sizes from a table of measured hydrogenic 99.99 % radii.
- **VWN5 correlation was added despite the spec scoping it out.** Without it
  there is no authoritative benchmark: NIST's LDA column is exchange **plus**
  VWN. Validation was the point of the exercise.
- **The radial curve ships on its log grid, not resampled uniformly.**
  Uniform resampling lost 78 % of uranium's K-shell peak even at 4096
  samples. The shader does `t = log(r/rMin)/dx` instead — exact at every scale.
- **The cut face scales against a *local* envelope, not the global peak.** A
  shell is legible because it is denser than the radii either side of it, not
  because it is dense outright. Global normalisation gave uranium's inner
  rings a peak-to-trough contrast of 0.028 — invisible. There is an
  acceptance test asserting **≥ 0.35 for Ar and U**; keep it passing.
- **Navigation comes from the configuration, never from detected peaks.**
  Shell peaks genuinely merge from about Z = 26: iron has 4 occupied shells
  but 3 resolved peaks, uranium 7 and 4. Zipping peaks to shells misaligns.
  This is also why `shell_pick.ts` picks off `shellIndexAtR` (which is what
  colours the rings) rather than a nearest-peak search.
- **Never label an orbital eigenvalue an ionisation energy.** LDA's
  self-interaction error puts neon's 2p 37 % away from the measured value.
- **Solve once per element, never per level change.** Navigation actions are
  pure reads. Only `setElement` (and `enclosedFraction`) start a solve.
- **One-electron systems bypass SCF** — LDA's self-interaction error would
  make hydrogen wrong where an exact answer already exists.
- **Potential construction stays swappable** so a scalar-relativistic v2 is a
  module addition rather than a rewrite (see "Known limits").
- **`contourRadius` and `displayRadius` are different quantities.** The first
  is the radius enclosing the requested fraction of the electrons and still
  means exactly that. The second is how big to *draw* the atom: the contour,
  widened where needed to clear the valence shell's own peak. They are
  different because "where is 90 % of the charge" and "how big is this atom"
  are different questions, and answering the first when asked the second put
  the valence shell off screen for 34 of the first 56 elements. See below.
- **Colour is applied through `style`, never a `stroke=` attribute, on the
  radial plot's curves.** `.radial-plot-line` sets a stroke in CSS, and a CSS
  declaration always beats an SVG presentation attribute.
- **The block a periodic-table tile is coloured by comes from its position in
  the table, not from `configurationFor(Z)`.** Addendum 3 proposed the
  opposite; every configuration-based rule tried misclassifies aufbau
  exceptions (lanthanum has no f electron at all; zinc's differentiating
  electron is 4s and it is unambiguously d-block). The test asserts the
  relationship in the direction that does hold — every d-block element has an
  occupied d subshell, and so on.
- **The URL carries camera direction but never distance.** Azimuth and
  elevation mean the same on any screen; distance does not, because the app
  fits the camera to the viewport and to the panels it measures
  (`useViewInsets`, `fitFactorFor`), which differ between a phone and a
  desktop — a stored distance would frame the atom wrongly on the other
  device. `frameOrbital` already keeps the current direction when it refits,
  so a direction set before the mesh lands survives framing.
- **PNG capture renders and reads the canvas back in the same JavaScript
  task, with no `preserveDrawingBuffer`.** That flag forces a buffer copy on
  every frame for the life of the page just to serve an occasional export;
  instead the capture raises the pixel ratio, renders once, copies the
  canvas out while the drawing buffer is still valid (before the browser
  composites), restores the ratio and renders again, so the screen is never
  left showing a cleared frame.
- **The cube file is re-sampled on demand, in a worker, rather than kept
  from the render that drew it.** The mesh worker returns only the 8-bit
  density map; holding the float field from every render for the rare case
  someone exports it would cost ~8.6 MB per render. Sampling is
  deterministic, so the export worker (`sampleFieldSource`, Phase 1's
  function) reproduces exactly the grid that was drawn.
- **Geometry exports always take the whole surface, never the cut.** A cut
  is a view setting; a cut surface is open and would not print or display
  as a solid. STL is refused outright unless every surface passes a
  manifold check first.
- **Basic Orbitals' selection, fraction and combination all live in the
  store, and a URL decoder never renders directly — it dispatches and calls
  `requestBasicRender()`.** A decoder cannot see what state the others on
  the same link have already set, and several decoders can run for one
  link (Phase 1's combination keys, and any a later mode adds), so `App`
  renders exactly once, after every dispatch from the link has landed, from
  whatever the store then says — never from what any one decoder saw.
- **A link's view waits in `atom.pendingView`, its cut in
  `orbital.pendingCut`, until the thing it depends on is ready.** `App`
  clears the cut whenever it enters an orbital view, so a link's cut has to
  be re-applied once the view it belongs to has actually landed — the
  pending slot is what survives the gap between "the link was decoded" and
  "the level/profile it names exists". The same shape covers Share pressed
  mid-solve: the link encodes `atom.pendingView` in preference to the
  transient whole-atom view still on screen, so it carries the view that
  was actually asked for.
- **Ion configurations are a NIST table, not a rule** (Phase 3). "Remove the
  outermost electron" gets 52 of the 301 offered cations wrong — V⁺ is 3d⁴,
  not 3d³ 4s¹; Y⁺ is 5s²; La⁺ is 5d²; every lanthanide 3+ ion is pure 4fⁿ;
  Th²⁺ is 5f 6d. `ion_configurations.ts` transcribes NIST ASD's Ground
  Shells column instead, checked entry by entry against a committed extract
  (`tests/atom/fixtures/nist_ion_ground_configurations.json`,
  `tests/atom/ion_configurations.test.ts`).
- **Pictures are restricted LDA; ΔSCF energies are spin-polarised LDA**
  (Phase 3). Restricted ΔSCF puts O, F and S 12–22 % off experiment — an
  atom and its ion have different numbers of unpaired electrons, and
  restricted LDA ignores the exchange energy that difference carries.
  Spin-polarised LDA (`spin_scf.ts`) puts all of H–Ar within 7.6 % and
  reproduces NIST's own LSD totals to 10⁻⁵ relative error.
- **Anions are checked for a bound HOMO every iteration, not only at the
  end** (Phase 3). `hasBoundState` (threshold 10⁻⁴ Ha) throws
  `UnboundAnionError` the moment a subshell's energy is not safely below
  zero; without it the loop converges to nonsense (H⁻ at −379 Ha) instead of
  failing honestly. Cl⁻ is unbound in this LDA; the spec's Br < Br⁻, I < I⁻
  radius ordering is asserted on the two anions this LDA does bind.
- **A neutral ground state's species key is exactly `String(Z)`** (Phase 3).
  `speciesKey({ Z, charge: 0, excitation: null })` returns the bare number,
  so every cache key (profile cache, mesh cache, energies cache) that
  existed before ions did is unchanged; Phase 4 appends relativity to these
  same keys — all of them, including the ones a search for "cache" in the
  UI layer misses: `solveSpeciesCache` in `scf.ts` (keyed by `speciesKey`),
  `delta_scf.ts`'s `cache` (by `speciesKey`),
  `energies_cache.ts`, and the worker's `referenceRadiiCache` (keyed
  `${Z}:${fraction}`). A relativistic solve that misses any one of them
  returns the non-relativistic answer memoised under the same key.
- **The reference ring is its own unstencilled mesh, not a second radius on
  the existing cut face** (Phase 3). The cut face's cap is stencilled to the
  current sphere, and a cation's neutral edge sits outside that stencil — a
  single mesh cannot show both.
- **The reference ring is drawn at the neutral's `displayRadius`** (ruling
  C11, Phase 3) — the same "drawn radius" the size-compare line quotes —
  not its `contourRadius`, so the ring is a like-for-like comparison against
  what is actually on screen. The camera's framing floor is a separate
  number, the neutral's own `framingRadius` (ruling C12): an earlier version
  floored on `displayRadius` and left He → He⁺ moving the camera 23.5 %,
  because a neutral is often framed well inside its own sphere.
- **ΔSCF occupations follow Hund's rule (maximum spin)** (Phase 3), not an
  arbitrary assignment within a degenerate configuration: an excitation out
  of a closed subshell lands in the highest-spin state it can reach — He
  1s→2s is 2³S, Mg 3s→3p is ³P — because spin-polarised LDA needs one
  occupation to solve, and the physically real one has the most unpaired
  spins.
- **An enclosed-fraction change mid-ΔSCF runs both workers at once** (Phase
  3). Ruling C15 only covers the moment a species is first selected — ΔSCF
  waits for that species' picture to land so the two solves don't contend
  for CPU — but a user who then drags the enclosed-fraction control while
  ΔSCF is still running starts a second picture solve alongside it,
  deliberately: gating that too would make the energy line wait on a
  setting that doesn't change it.
- **The energies cache holds 32 entries, keyed by `speciesKey` alone**
  (`energies_cache.ts`, Phase 3) — a ΔSCF result does not depend on the
  enclosed fraction, so the species is a pure cache key, and 32 comfortably
  covers a session's worth of stepped charges and excitations without the
  tens-of-seconds re-solve that stepping Na → Na⁺ → Na would otherwise cost
  every time.
- **An unbound anion is a verdict, not an error** (Phase 3). `state.atom.unbound`
  carries the message; the canvas is cleared (there is no profile to draw),
  the shell/subshell chips are disabled, and every export's refusal reason
  reads that same message rather than "waiting for the atom to finish
  solving" (ruling C4) — an anion this LDA cannot bind is reported, not
  silently worked around.
- **Exports name the species they show, not just the element** (Task 12b,
  Phase 3): `caption.ts`'s title line and the PNG caption read e.g. "Sodium
  ion Na⁺" or "Sodium, excited 3s → 3p"; exported file names get an ASCII
  suffix (`Na+1`, `Na_3s-3p`); a PNG with a reference ring on screen gets its
  own caption line naming the neutral it is compared against.
- **H₂⁺'s λ recurrence is pinned to one sign convention, chosen fresh at every
  R** (Phase 5, `src/bonds/h2plus.ts`). The nuclei sit at (0, 0, ±R/2) with
  r₊ the distance to the **+z** nucleus, so μ = (r₋ − r₊)/R = **+1 at the +z
  nucleus**. `eigenvectorFor`'s sign is arbitrary and picked afresh at every
  solve, so left alone, dragging the R slider could flip 1σu\*'s two lobes'
  colours from one frame to the next with nothing in the physics changing.
  Each factor is pinned independently instead: Λ positive at λ = 1 (it is
  nodeless, so that fixes it everywhere), M positive at μ = +1 — which makes
  1σg positive everywhere, and makes 1σu\*'s +z lobe always the positive one
  and its −z lobe always the negative one, at every R. Losing this pin is the
  kind of defect a screenshot catches and a unit test (which samples one R at
  a time) does not.
- **A molecule's density ships once, computed from the basis, never as
  twenty downloaded grids** (Phase 5, `src/molecules/gaussian_basis.ts`,
  `src/bonds/bonds_request.ts`). Shipping a density grid per scan point would
  multiply each molecule's data by up to twenty and blow the 3 MB budget by
  itself; instead `basis.json` carries the molecular-orbital coefficients
  (PySCF's own AO convention, checked to 10⁻¹⁰ against `mol.eval_gto` at
  generation time) and the app evaluates ρ = Σ occᵢψᵢ² from them directly, at
  render time, for whichever scan point is selected. The `density.bin.gz`
  that does ship (one per molecule, at the R_e scan point only) is not what
  Bonds mode draws from at all — it exists for §4.2's own file-format
  requirement and for a cross-check test that the TS evaluator reproduces
  PySCF's own density on that grid, nothing more.
- **A density surface is drawn at a fixed ρ, never an "enclosed fraction"**
  (ruling T7-a, Phase 5). A 0.25 a₀ shipped-grid spacing (and the coarser
  grid Bonds mode actually meshes at, 96³ over a box padded 6.5 a₀ past the
  outer nucleus) cannot integrate a nitrogen 1s cusp finely enough for "90 %
  of the electrons" to mean what it says — one misaligned sample can hold
  0.7–0.9 of the two 1s electrons it represents. Chemists already draw
  ρ = 0.002 e/a₀³ as the conventional molecular outline, so the panel offers
  exactly that and two higher values (0.05, 0.2) instead of a percentage;
  `FieldRenderRequest` carries this as `densityIsoValue`, and the worker
  draws the contour at that value itself (`generateIsoValueMesh`, squaring
  the recipe's √ρ samples) — no enclosed fraction is computed or searched
  for, so none of Phase 1's histogram rounding reaches the surface.
- **Where the generated data actually lives, and why not in `dist/` or
  `public/`** (Phase 5, amendment 2026-09-26). The plan's original design
  would have copied `public/molecules/` into the build with a small
  `closeBundle` Vite plugin — until it was noticed that `vite.config.ts` sets
  `root: 'public'`, which makes Vite resolve `publicDir` to `public/public`,
  so **nothing under `public/molecules/` was ever going to reach `dist/`**
  through that mechanism at all (verified: `dist/` holds only `index.html`
  and `assets/`). Rather than restructure the existing root/publicDir setup
  for every other asset, the owner moved molecule data to S3 behind
  CloudFront instead (spec §4.5): `tools/molecules/publish.py` uploads the
  generated tree to `s3://<bucket>/molecules/<version>/`, with a SHA-256
  checksum on every object, a committed manifest
  (`tools/molecules/manifest/<version>.json`) checked byte-for-byte against
  the local tree before any upload, and the published marker (`index.json`)
  written last, only once every other object has verified through S3 itself
  — so a half-finished publish is never mistaken for a finished one, and a
  resumed run only repeats the objects that did not finish. A published
  version is immutable by policy (`ensure_unpublished` refuses to overwrite
  one); a mistake needs a new version (`v2`), not a silent overwrite of `v1`.
  `infra/deploy.sh` refuses to deploy an app bundle whose
  `MOLECULE_DATA_VERSION` (`src/molecules/data_version.ts`) does not match
  `tools/molecules/version.py`'s `DATA_VERSION`, and refuses again unless
  that version's `index.json` already answers HTTP 200 through CloudFront —
  so the deploy gate catches both a version bump forgotten in one file and
  app code shipped ahead of its own data. In development,
  `vite.config.ts`'s `serveLocalMolecules` middleware serves
  `tools/molecules/out/` directly (so data can be driven before it is
  published at all), falling through to a proxy at the real CloudFront
  distribution otherwise — the same two-tier fallback production's own
  `fetch` effectively gets, since a `403` (S3's answer for a missing key,
  not `404`) is what an unpublished version returns either way.
- **Orbitals are selected and addressed by label, never by index, across a
  change in R** (Phase 5, `src/store/bondsSlice.ts`'s `BondsView`,
  `src/bonds/bonds_request.ts`'s `findOrbital`). PySCF's own MO ordering is
  an artefact of that geometry's SCF, not a stable identity — "3σg" at one
  scan point is not reliably orbital index 6 at another. `BondsView`'s `mo`
  variant instead carries `{ label, spin, component }` (the `component`-th
  orbital sharing that label and spin, for a degenerate pair), so dragging
  the slider keeps "3σg" selected by what it *is* rather than silently
  switching to whatever now sits at the old index — which, left unfixed,
  would occasionally draw the wrong orbital under the right-looking label
  and no error at all.
- **B₂'s triplet ground state and He₂'s full-CI treatment are both
  owner-visible deviations from the plan as first written** (Phase 5,
  `tools/molecules/molecules.py`, ruling C3). B₂ is not in the spec's own
  list of diatomics, and its ground state (³Σg⁻, two unpaired electrons in
  1πu — real paramagnetism, the same physics O₂'s does) only came up because
  it was added as a teaching case alongside the others; without an explicit
  `irrep_nelec` pin it is easy for SCF to settle into a different state
  entirely. He₂ runs at full configuration interaction — four electrons, the
  owner's explicit instruction — which is more accurate than, and stretches,
  the spec's "full CI for two electrons" (§7); flagged here rather than
  quietly taken as in-scope.
- **1σu\*'s one well sits outside the slider's own range, and the caption
  says so rather than calling the state flatly repulsive** (Phase 5,
  `src/bonds/h2plus.ts`). Its total energy decreases monotonically across
  the whole 0.5–10 a₀ slider — met on its own, that looks like a textbook
  purely-repulsive antibonding curve — but it is not: past 10 a₀ the curve
  turns around into a genuine, if tiny, polarisation well, 0.06 mHa deep at
  R ≈ 12.5 a₀, before rising again towards the H + H⁺ limit. Asserted by a
  dedicated test rather than discovered live, because nothing about a
  monotonically falling curve on the visible range would otherwise hint that
  a well exists just past its edge.

## Known limits of the model — quantified, and stated in the README

**Relativity is no longer only a measured gap — it is a switch (Phase 4).**
*Off* is exactly the non-relativistic model above, and its Z²-scaling error
against NIST's ScRLDA (Ne 1s/2s/2p 0.032 %/0.250 %/0.097 %, Au 6s 26.9 %, the
effect that makes gold yellow) is unchanged and still the reason *Scalar* is
the default from caesium onward (`defaultRelativityFor`, Z ≥ 55). *Scalar*
is Koelling–Harmon (mass-velocity and Darwin terms, no spin–orbit); *With
spin–orbit* is the full radial Dirac equation, splitting every l > 0
subshell into j = l ± ½ levels occupied in proportion to 2j + 1. Both apply
the MacDonald–Vosko relativistic correction to LDA exchange, because NIST's
own ScRLDA/RLDA tables do (judgment call 2 below) — the validation below
would not mean what it claims otherwise.

**Validated against NIST, within the spec's bars** (`tests/atom/
relativistic_nist.test.ts`, `src/validation/relativity_results.json`, 241
entries across Ne, Ar, Kr, Xe, Au, Hg, Rn, U):

| Column | Worst Etot | Worst eigenvalue |
| --- | --- | --- |
| ScRLDA (scalar) | U, 0.0010 % | U 5f, 0.496 % |
| RLDA (spin–orbit) | Ne, 0.00018 % | U 5f₊, 0.054 % |

Both are inside the spec's 1 % bar for every element, with wide margin.
Restricted to Z ≤ 18 (Ne, Ar) — the spec's tighter bar — the worst case in
either column is Ar 3p at 0.011 %, inside the 0.1 % the spec asks there.

**A systematic ~0.1 % scalar core-level offset** (final review
recommendation; not a bug as far as anything here measures). Every scalar
core eigenvalue of the heavy atoms is *less* bound than NIST's ScRLDA by a
near-constant fraction that grows gently with Z: U 1s by 3.24 Ha (0.076 %),
2s by 0.72 Ha (0.091 %), 2p by 0.66 Ha (0.100 %), 3s–5p 0.07–0.10 %; Au, Hg
and Rn's 1s/2s/2p 0.06–0.09 %. The RLDA column, solved by the same code with
the same exchange, grid and nucleus, matches to about 0.001 % (U core
levels within 1 mHa), and the scalar *total* energies match to 0.001 % — so
the offset sits in how the scalar eigenvalue is defined, not in the
self-consistent field. The likely cause is a convention difference in the
scalar equation rather than a defect: whether the small component Q² is
counted in the scalar density (it is here, as in the Dirac case), or the
exact form of the Koelling–Harmon centrifugal term (j-averaged κ(κ+1)
against l(l+1), with or without the relativistic mass in it). Nobody has
traced it to one of these; it is ten times inside the spec's bar, but a
future change to the scalar equation should be checked against it rather
than against the 1 % bar alone.

**The light-atom finding behind that 0.1 % bar's wording** (recorded in
`global-constraints.md` while this phase was planned, carried forward here
because it is still the right reading): switching relativity *on* moves
argon's total energy by 0.30 % and its 3s eigenvalue by 0.82 % from the
non-relativistic answer — real physics, consistent with this file's own Ne
2s figure above (0.25 %), not noise. Reread literally ("light atoms
unchanged within 0.1 % when relativity is on") the spec would be false. Read
as "for Z ≤ 18, the relativistic calculation agrees with NIST's own
relativistic columns within 0.1 %" — the table above — it is true and
carries the spec's actual intent: that the *relativistic* result is right,
not that relativity has no effect on a light atom.

**Known remaining approximations**, all of them already true of the
non-relativistic model except the first two:
- **Point nucleus** in every mode, matching NIST's own tables (confirmed
  against NIST's Procedure page, Task 1) — a finite nuclear size would shift
  s eigenvalues for the heaviest elements by an amount this model cannot see.
- **Spherically averaged over j, not just over l.** An open subshell's
  electrons are shared between its j-levels in proportion to 2j + 1
  (`splitByJ`), exactly as they were already shared uniformly across an
  l-subshell's mₗ states — a continuation of the model's central-field
  assumption, not a new one.
- **A j-level's orbital is drawn with the plain l-basis angular shape**
  (spec §3.6): level 3 shows R(r) of that j-level times the ordinary real
  spherical harmonic, the large component only — not the true
  |j, mⱼ⟩ angular dependence, whose large component keeps the one l but
  mixes two mₗ values with the two spin states (the small component carries
  the other l), and has no analogue in this renderer. Exports say so explicitly ("large
  component, l-basis angular part", `run_export.ts`); D(r) and the radial
  curves are the real, relativistic R(r) and do not have this limit.
- **Level 3 has no relativity framing floor.** The whole-atom and open-shell
  views hold the camera across a mode switch (`framingRadius`/
  `contourRadius`, ruling C14), but the marching-cubes orbital at level 3
  frames on its own sampling box and can re-zoom when a mode switch changes
  that box. Accepted (Task 11 M2): the effect the floor exists to keep
  visible — a heavy atom's s/p shell contracting — is a shell-level
  phenomenon, not one a single orbital's own view depends on holding still.

The *visual* content is otherwise exactly as robust as before: orbital
shapes, node counts, shell topology and occupancy are exact at any Z in
every mode; only energies and, now, s/p shell contraction are the numbers
relativity changes.

---

## What this session did

Six items, in the order they were asked for. Each is committed separately
with its reasoning in the commit message.

### 1. Composition readability (`ebb80d7`)

Clicking a subshell chip isolates that subshell's orbitals; clicking it again
returns to the overlapping whole-shell view, which stays the default because
the overlap is the teaching point (spec §2).

Isolation alone did not fix the case that motivated it. Iron's blob *is* its
five 3d orbitals, so removing 3s and 3p left a blob. Each member of an
isolated subshell now gets its own shade of that subshell's curve colour
(`orbitalShade` in `curve_colors.ts`), with the mₗ buttons carrying matching
swatches as the legend.

Two colour-linkage bugs surfaced while driving the app, both invisible to a
green suite:

- **Every multi-curve plot line drew blue.** `.radial-plot-line` sets a
  stroke in `style.css`, and a CSS declaration beats an SVG presentation
  attribute — so the `stroke=` prop was ignored while the legend swatch
  beside it (an inline style, which wins) showed the real colour. The
  existing test asserted the attribute, i.e. exactly the thing the browser
  was overriding. Addendum 2's whole premise is that the 2D and 3D views
  share one palette; they only ever agreed by coincidence when the index
  happened to be 0.
- **Isolating a subshell recoloured its curve** to index 0's blue while its
  lobes stayed gold, because the colour index came from the filtered array
  rather than the subshell's position in its shell.

### 2. Basic Orbitals rename (`a1291d7`)

"Hydrogen-like" → **Basic Orbitals**, element control removed, Z fixed at
`BASIC_ORBITALS_Z` in `orbital_presets.ts`. The stored mode value stays
`'hydrogenic'` — it names the model, which the rename did not change.

Spec §7 requires the one-electron framing to be stated outright, and it used
to ride on the Z picker's helper text; it now has a line of its own.

### 3. Clickable rings and explicit deselect (`abbeb01`)

Clicking a ring at the whole-atom level opens that shell. Press and release
are tracked separately because the canvas is also OrbitControls' drag
surface — a 200 px drag across a ring must not navigate, and was verified
live not to. The pointer cursor appears only over a pickable radius, inside
the atom, at the level where picking does something.

The selected shell chip carries an explicit ✕, toggles back to the whole atom
when clicked again, and reports `aria-pressed`. A hint line says the rings are
clickable and, once one is open, how to get back out.

### 4. Periodic table (`c48136b`)

Own panel across the top, collapsible, coloured by block, column lit on hover
or selection. The dropdown remains the narrow-screen fallback; exactly one of
the two is ever present. The detached lanthanide/actinide rows have no IUPAC
groups, so a lanthanide's column-mate is the actinide below it.

### 5. Core versus valence (`a135f13`)

The distinction itself is small: core rings recede, the valence ring lifts
towards white while keeping its hue, the valence configuration gets its own
line, the shell chips are marked, the plot legend names the valence curve.

Two much larger problems had to be fixed first, and both were found by
driving the app rather than by any test:

- **The valence shell was outside the drawn sphere for most of the periodic
  table.** At the default 90 % enclosed fraction, 34 of the first 56 elements
  have their valence shell's own D(r) peak outside the contour — sodium's by
  1.67×, caesium's by 2.63×. The cut face is stencilled to the sphere, so
  the valence shell was not dim, it was absent. Hence `displayRadius`.
- **The valence ring had nothing to paint on.** The total's emphasis curve
  does not resolve the valence shell for most elements: sodium's 3s is a
  shoulder on the 2p tail, never a local maximum, and scored 0.66 against a
  0.9 ramp threshold. The ring is now shaded from its own shell's D_n(r),
  sampled only where that shell already dominates the total, so an inner lobe
  of a 3s cannot paint a spurious ring over the core.

**Trade-off, accepted:** a heavy atom's atom-level view is now framed on its
true extent, so uranium's core rings compress to a bright dot. That span is
real — 0.02 a₀ to 4 a₀ — and the drill-down is the way in: one click on a
shell chip reframes to it. If this turns out to bother people, the options
are a non-linear radial mapping on the cut face (dishonest about scale, and
the scale bar would have to go) or a zoom preset per level.

### 6. Finish

README rewritten for both renames and all the new behaviour; this file
rewritten; full suite, `tsc` and `build` clean; end-to-end drive across 16
elements spanning every block and every aufbau exception, at desktop and
phone widths, with no console errors; deployed.

A separate phone pass afterwards (390x844 and 844x390, touch emulation, not
just a resized desktop window) found four more layout defects, three of them
hiding the level-2 drill-down entirely — see commit `ebb250e`. The short
version: the subshell panel laid out as one 797px row inside a horizontally
scrolling strip and never wrapped; the strip's retained scroll position put
it off the left edge even after reordering it first; the compact plot's
title stretched its panel to almost the full screen width; and landscape
stacked three panels into 390px of height so the plot sat on the sheet.
Short viewports now get their own rule, because there width is the plentiful
dimension rather than the scarce one.

One live-only defect fixed on the way to that: **the radial plot and scale
readout were completely hidden behind LevelNav on a phone.** Both were pinned
to the top, and LevelNav is wider, opaque and above them in z-order. It
predates this session (the panel was already taller than the plot's 12 px
offset) and the new valence line made it total. They now sit below LevelNav's
30dvh cap, and the sheet toggle no longer covers the breadcrumb's first
segment — which is the way back to the whole atom, so losing it to an overlap
was worse than losing a label.

### A later round of testing found six more

Reported from the running app after the six items above shipped, and all
fixed in `ec2d25c`.

1. **The app could hang with nothing on screen.** Re-picking the element
   already selected clears the profile (`setElement` always does) but changed
   none of `[mode, Z, enclosedFraction]`, so the effect that starts a solve
   never re-ran. `AtomState.solveNonce` is bumped by every `setElement` and is
   part of that dependency list now. This is also what the empty hydrogen
   legend in the previous round's sweep actually was — it was written off as
   a timing artefact, wrongly.
2. **"A sphere with a strange box inside."** The composition view sized each
   lobe's box from the subshell's 99.99% radius. Right for a single orbital,
   but 2.25–3.44x the radius actually drawn, and this view renders up to
   sixteen lobes at once on a coarse grid — so most of the box was empty
   space bought with resolution. Ruthenium's 5s came out as a 438-vertex
   faceted block reaching 3.57 a₀ against a true 5.23. Boxes now come from
   `compositeSamplingRadius`: the drawn contour with a 1.45x margin, measured
   against the worst real isosurface reach (1.19x, a 4f) across s/p/d/f from
   carbon to uranium. s subshells additionally render at 65³ — one mesh each,
   and a diffuse high-n s has a |ψ|² spike at the nucleus that biases the
   contour search on a coarse grid.
3. **The outer shell read as the app background.** The cold floor is lifted
   and the sphere draws its own rim — a disc fading into black has no edge to
   see. The radial plot's axis also ran 20% past the sphere beside it, which
   is what made the curve appear to continue into nothing; it ends exactly
   where the sphere does now.
4. **A default view per element**, derived from each element's own profile
   rather than 118 hand-tuned presets. See the judgment calls below.
5. **The resolution control is gone**; every marching-cubes render is 129³.

6. **No easy way back from an orbital, on a phone.** The subshell panel
   unmounted the instant you picked an orbital, so the mL buttons you had
   just used disappeared and the breadcrumb — small text links, partly under
   the sheet toggle — was the only route out. LevelNav now carries an
   explicit **Back** control whenever there is somewhere to go, labelled with
   where it goes, and it steps out one level at a time so the ladder out
   mirrors the ladder in: an orbital → its subshell, still isolated → the
   whole shell → the whole atom. Every step is expressible with the existing
   navigation targets (`drillToSubshell` clears the orbital, `drillToShell`
   clears the subshell), so no reducer changed. The subshell panel also stays
   mounted at the orbital level now, with the current mL marked, which makes
   a sibling orbital one tap instead of a round trip.

Proof for (2) and (4) is a published contact sheet of the default view of
all 118 elements, captured from the running app in one automated pass:
<https://claude.ai/code/artifact/454adb20-98b7-466e-8451-731768eec58e>. It
was produced by temporarily turning on `preserveDrawingBuffer` on the
renderer and reading `canvas.toDataURL` per element; that flag is **not**
committed — turn it back on if the sheet ever needs regenerating.

---

## UX review round (2026-09-25)

Found by driving the app at 1440x900 and 390x844/844x390 with touch; all
fixed and checked live. The layout decisions worth knowing:

- **The cut is a shell-view thing.** Entering any orbital view (atom level 3,
  or Basic Orbitals) clears it; stepping back to a shell view restores the
  cut it had. The inherited half-cut used to hide half of every orbital.
- **z is up** (`camera.up`, set before OrbitControls reads it), so the
  default shell cut is now X (`SHELL_VIEW_CUT_AXIS`), the face turned most
  squarely to the default camera.
- **Panels are measured, and the camera avoids them.** `useViewInsets`
  measures what the panels cover; `setViewInsets` shifts the projection
  centre with `setViewOffset` and scales the fit distance, keeping the
  user's zoom in proportion. Desktop: navigation left, view settings and
  plot right. The periodic table folds after a pick.
- **Level 3 frames on the drawn surface**, not the sampling box, once the
  mesh lands; re-framing is still keyed on the box so switching mₗ keeps
  the zoom.
- **Phone element choice** is a full-screen searchable list opened from the
  element name; the dropdown in the sideways strip is gone.

## Phase 1 — hybrids and the Stark effect (2026-09-25)

Basic Orbitals mode gained a Combination picker: sp/sp²/sp³ hybrids of
hydrogen's n = 2 shell, and hydrogen in a uniform electric field (the
polarised 1s and the n = 2 Stark states). Decisions worth knowing:

- **The 2s enters every hybrid with a minus sign**,
  `hᵢ = −(1/√(k+1)) ψ₂ₛ + √(k/(k+1)) (dᵢ·p)`. Hydrogen's R₂₀ is positive only
  inside its node at 2 a₀; 95 % of the 2s density lies beyond it, where it is
  negative. With +ψ₂ₛ each hybrid's large lobe would point opposite its own
  label — the sign is what makes the lobe and the direction agree.
- **A lobe's axis is the density-weighted centroid of its positive half**,
  Σ_{ψ>0} rψ² / Σ_{ψ>0} ψ², not the grid's argmax of |ψ|². An argmax snaps to
  one voxel; at the render grid's 0.33 a₀ spacing and a peak 3–4 a₀ out, that
  is up to ~5° of error — ten times the sp³ angle tolerance. The centroid
  uses the whole drawn lobe instead. Measured on the actual render grid: sp
  and sp³'s centroids land on the exact textbook angles (180°, 109.47122°,
  matching to 7 significant figures — the cube's own symmetries map those
  two sets onto themselves), and sp² — whose 120° rotation is not a cube
  symmetry, so it shows the real grid error — still lands within 0.00006° of
  120°, far inside the ±0.5° budget.
- **Overlays are one merged mesh, with no cut-face caps.** The stencil-cap
  trick assumes a single capped object on screen (the same call
  `shell_composition_view.ts` makes for composition lobes); a cut through an
  overlay opens the lobes' insides rather than shading a cross-section.
  Overlays render at 96³ (`OVERLAY_RESOLUTION`) rather than the single-source
  129³, and share each basis orbital's samples across members of the same
  overlay (an sp³ overlay is four hybrids built from the same four terms, so
  each term is only evaluated once). Measured live at 1440×900: sp³ all four
  drawn in 533 ms, sp² in 465 ms, sp in 280 ms, a single sp³ hybrid (h₁) in
  545 ms — all comfortably under the 1500 ms desktop budget. At phone width
  (390×844) sp³-all measured 505 ms. That figure is unthrottled: the
  Playwright MCP tooling used for the phone pass had no CPU-throttling or
  touch-pointer emulation hook, so the spec's 4× throttled, touch-driven
  budget (4 s) was not literally exercised — 505 ms unthrottled leaves ample
  headroom under it, but a genuinely throttled measurement is still owed.
- **The n = 2 field slider is capped at 0.0039 a.u.**, the field at which the
  classical over-the-barrier limit (F = E²/4, E = −1/8 Ha for n = 2) frees
  the electron — above it there is no bound state left to perturb. The spec
  states it (F = 1/256 ≈ 0.0039 a.u., §5 Phase 1, corrected 2026-09-25 from
  the Phase 1 plan's 0.05 a.u., which is safe for n = 1 only); the view
  refuses stronger fields rather than drawing them (§3.5).
- **α is validated at F = 0.01 a.u., not 0.05.** The polarised-1s recipe is
  ψ₁ₛ + (first-order correction), and normalising that sum costs accuracy as
  F grows: 0.05 % at F = 0.01 versus 1.4 % at F = 0.05 — nearly 30× worse —
  so the validation row measures at the smaller field, where the first-order
  approximation is closest to exact. Measured there: α ≈ 4.4959 a₀³ against
  the exact 4.5 (≈0.09 % error), and ⟨2s|z|2p_z⟩ ≈ −2.99998 a₀ against the
  exact −3 (≈0.0007 % error) — both from quadrature on the same 129³ grid the
  app draws.
- **`src/validation/references.ts` computes every phase-1 row at import
  time** (grid quadrature over several combinations, about a second). That is
  fine for tests and fine for now, but Phase 7's Methods page must lazy-load
  this module rather than pulling it into the app's entry bundle. Later
  phases should append rows the same way this phase did: `app` comes from
  calling the function the phase's own physics test calls, never a
  hand-typed number, so the table and the tests cannot drift apart.

## Phase 2 — share and export (2026-09-25)

The view is always in the URL (`src/url_state.ts`), and both modes can
export the picture (`src/export/`). The README's
[Share and export](README.md#share-and-export) section is the user-facing
description of keys and formats; this section is what differs from the
phase plan, or isn't visible from reading one file.

### URL state

- **One registry, keyed by mode, read in a fixed order.** `registerUrlKeys`
  appends an `{ encoder, decoder }` pair under a mode name or the shared
  `ANY_MODE` group. Encoding writes `mode`, then that mode's groups, then any
  shared key not already written; decoding always runs the shared group
  first, then the named mode's groups, in registration order. See "Process
  notes" below for how a later phase adds to it.
- **A decoder never throws past the link.** `applyStateTo` wraps every
  decoder call and logs rather than rethrows, so a hand-edited or truncated
  key (`Z=abc`, `cut=w:2`, `mode=molecule`) loses only what it could not use,
  not the rest of the link.
- **Numbers are decimal literals, not whatever `Number()` accepts.**
  `parseNumberInRange` requires `DECIMAL_LITERAL` to match first — `Number()`
  on its own also accepts `'0x1'` and padded whitespace, which would decode a
  key as a number nobody actually wrote into the link.
- **A link's cut waits in `orbital.pendingCut`**, applied once
  `atom.pendingView` is null (the view it belongs to has landed), **and is
  cleared by any user cut change, element pick, or mode switch that happens
  before that point** (`App.tsx`'s `handleSurfaceStyleChange`,
  `handleAtomElementChange`, `handleModeChange`) — otherwise a stale link cut
  could land on top of a cut the user set while the solve it was waiting on
  was still running.
- **A link with no `cam` key resets a moved camera to the canonical angle**
  (`decodeViewKeys` always dispatches `restoreCamera`, passing `null` when
  the key is absent) — the alternative, leaving whatever the camera already
  showed, would mean a link only sometimes reproduces the sender's view,
  depending on what the receiving tab happened to be looking at already.
- **`frac`, `cut`, `op` and `surf` are always written, even at their
  defaults** — unlike `cam`, which is left out exactly at the canonical
  angle. So every link the app makes carries all five settings it shows, and
  reproduces the sender's picture in any tab. Decoding is not symmetric
  with that: a link *missing* `frac`, `cut`, `op` or `surf` (hand-written,
  or the spec's own shorthand §4.3 example) leaves the opening tab's value
  for that key alone (`decodeViewKeys` dispatches only what it can parse);
  only a missing `cam` resets, to the canonical angle, because "no `cam`"
  is what the encoder writes for canonical.
- **`frac` is the contour drawn, not the panel's** (`selectShownEnclosedFraction`
  in `orbitalSlice.ts`). Basic Orbitals applies a new enclosed fraction only
  on Update Orbital, like its n/l/mₗ, so until then a link and every caption
  state the drawn orbital's own fraction. Combinations and atom mode redraw
  as the fraction changes, so there the store's value is already the drawn
  one.
- **For Phase 4:** a link without `rel` must decode as relativistic
  corrections *off* — every Phase 2 link predates the key, and must go on
  reproducing the picture it showed when it was made. Treat absence as
  "off", not as "the tab's current setting" and not as a new default.
- **For Phase 7:** lesson links should write the full view-key set — `frac`,
  `cut`, `op`, `surf`, and `cam` unless the canonical angle is meant —
  because a missing `frac`/`cut`/`op`/`surf` inherits whatever the reader's
  tab already had, so a terse lesson link would open a different picture in
  different tabs.
- **A pasted or typed link that names a recognised mode closes the
  periodic-table pop-over** (`useUrlStateSync`'s `onApplyHash`, wired from
  `App.tsx` to `closeTable`) — otherwise the view the link just restored
  could load directly behind it.

### Export, by format — as built, not as planned

- **Every export's availability comes from one function per kind**
  (`run_export.ts`), and the first reason that applies is the one shown.
  `drawnReason` is the base: in atom mode, waiting for the atom (no profile
  yet), then — at the orbital level only — the last render failed; in Basic
  Orbitals, a refused combination (its own message, ruling C10), then the
  last render failed, then nothing drawn yet. On top of it:
  - `pngReason` (both PNGs): `drawnReason`, then — at a shell — its lobes
    failed to compute (`COMPOSITION_FAILED_REASON`), then the picture still
    computing (`PICTURE_BUSY_REASON`: an orbital or combination render in
    flight, the atom solving, a shell's lobes being built, or a level
    transition running).
  - `geometryReason` (STL, glTF): the whole-atom level first (it has no
    surface, `WHOLE_ATOM_GEOMETRY_REASON`), then `pngReason`.
  - `csvReason`: atom mode needs only the profile (its curves are the SCF's,
    at every level — a failed 3D render does not touch them); Basic Orbitals
    uses `drawnReason`.
  - `cubeReason`: atom levels 1–2 need only the profile; otherwise
    `drawnReason`, then the surface still computing (`CUBE_BUSY_REASON`),
    then an overlay of several members (`CUBE_OVERLAY_REASON`).

  The export menu shows the reason as the item's secondary text; unavailable
  items stay reachable by arrow key so a screen reader reads it. At the
  click, `runExport` checks again, then the 3D view must be mounted
  (`VIEW_NOT_READY_REASON`), then each encoder applies its own checks on what
  the scene actually holds (nothing to export, a non-finite or zero-size
  surface, STL's manifold check).
- **PNG** draws the combination's own colour key instead of the plain
  ψ-sign key when one is on screen (ruling C5) — the two are mutually
  exclusive in the app itself. The caption is wrapped to the image width
  (a method statement can run past 1000 px at 13 CSS px) and a lost WebGL
  context fails the capture outright rather than silently copying out
  whatever pixels happen to be left in the buffer.
- **CSV** is UTF-8 with a leading BOM and LF line endings — Excel otherwise
  guesses the system codepage and mangles the em dashes, superscripts and
  fractions (—, ², ½) a caption can contain. Basic Orbitals and the
  Combination picker sample at `PLOT_SAMPLE_COUNT` (240, `src/
  radial_distribution.ts`) — the same constant the on-screen plot uses, so
  the exported numbers are the plotted ones, not a re-sample. A non-finite
  value refuses the whole export by name and radius rather than writing an
  empty cell. The n = 2 Stark method line states its own validity window
  (well below the over-the-barrier field, 1/256 a.u. ≈ 0.0039 a.u.) rather
  than the generic "F ≪ 1 a.u." phrasing the n = 1 case uses, which would
  overstate it roughly 250×; it also states that tunnelling is ignored.
- **STL** refuses unless every surface in the scene is individually
  watertight (ruling T10-I1). A shell's lobes and an overlay's members are
  exported as that many separate solids — welding them into one mesh would
  make every shared vertex belong to four triangles instead of two, and no
  multi-lobe file would ever pass the check. Where a file holds more than
  one solid, the print dialog states it plainly: "N overlapping solids,
  each watertight; your slicer merges them into one" — not "watertight",
  because the file as a whole was never checked as one shape. **Follow-up,
  not built:** export the union's outer shell instead — marching cubes over
  max_i f_i (the pointwise maximum of the member densities) rather than each
  member separately, in a worker — so a strict external checker (trimesh,
  Netfabb) that inspects the whole file as one body does not warn on an
  overlay or shell-lobe STL. The per-member export above is correct and
  slices fine; this would additionally satisfy tools stricter than a slicer.
- **Cube** is ψ (real, bohr⁻³ᐟ²) exactly as drawn, for a single-source field
  or an orbital, re-sampled by the same `sampleFieldSource` the mesh worker
  used. For atom levels 1–2 (no 3D field) it is ρ(r) = D(r)/(4πr²) in
  electrons/bohr³ on a box enclosing 99.9% of the shown curve, carrying
  forward Task 12's note that features finer than the grid spacing (a heavy
  atom's 1s) are not resolved by any uniform grid. A multi-member overlay is
  refused (`CUBE_OVERLAY_REASON`) rather than exported as one of its
  members or as a sum. `cube_request.ts` is deliberately narrow — it and
  `cube.ts` are the *only* modules `exportWorker.ts` imports (ruling C8), so
  the worker never pulls in three.js or Redux; building a request out of
  live state (`cubeJobFor`, which needs `RootState` and `caption.ts`) stays
  on the main thread, in `run_export.ts`.
- **A shell's lobes and a level transition change the picture with no
  render request in flight**, so each reports itself to the store.
  `OrbitalViewer`'s composition effect sets `orbital.compositionBusy` when
  it posts a lobe build and clears it on the reply, on a newer run of the
  effect, on leaving the shell level and on unmount; a failed build sets
  `compositionFailed` and the app's error message (the same Snackbar as a
  failed render) instead of only logging. The visualizer's animation loop
  reports a running transition through `onTransitionChange`
  (`reportTransitionState`, once per change, up to a frame late) into
  `orbital.levelTransition`. PNG, STL and glTF wait on all three.

## Phase 3 — ions and excited states (2026-09-25)

Atom mode's Z no longer has to mean a neutral atom. A Charge stepper (−2 to
+3, clamped to whatever `ion_configurations.ts`'s NIST table actually offers
for that element) and an Excite menu (promotes one electron from the
valence subshell up — `species.ts`'s `excitationSources`/
`excitationTargets`: every open subshell, plus the outermost shell's
occupied subshells, except that shell's s and p when it also holds a d or f
(Fe³⁺ 3s/3p, Pd 4s/4p are core; their d is the valence); targets in
hydrogen-like (n, l) order for a cation, Madelung order for a neutral, four
per source) select one of three things the SCF can now solve: a
neutral ground state, an ion, or an excited atom with one electron moved.
All three are carried as a single `AtomSpecies = { Z, charge, excitation }`
and a single `speciesKey` string that the caches, the worker protocol and
the URL all key on alike.

### URL state

- **Key order: `Z`, then the species keys (`charge`, `excite`), then
  `level`/`n`/`l`/`ml`** (`encodeAtomKeys`/`decodeAtomKeys`,
  `src/url_state.ts` — ruling C2). Decoding runs `setElement` →
  `setCharge` → `setExcitation` → `solveStarted` → `requestAtomView`, in
  that order, because `setCharge`/`setExcitation` clear `pendingView` as
  part of resetting for a new species (the same reset `setElement` already
  did) — the view a link asked for has to be requested *after* that reset,
  not before it, or it is cleared the instant it lands. **Phase 4 inserts
  `rel` right after `Z`**, ahead of `charge`/`excite`, so the eventual order
  is `Z`, `rel`, `charge`, `excite`, `level`, `n`, `l`, `ml`.
- **A neutral ground state's link stays byte-identical to Phase 2's.**
  `encodeSpeciesParams` writes nothing for `{ charge: 0, excitation: null }`,
  so every link made before ions existed still encodes and decodes exactly
  as it did.
- **An unoffered charge or excitation is ignored, not clamped** (ruling
  C14) — `decodeSpeciesParams` falls back to the neutral ground state for a
  charge the element doesn't offer, or an excitation the current charge
  doesn't offer, the same way a shell/orbital key for a level the element
  lacks falls back to the whole atom.
- **The round-trip property test gained two shapes, `ion` and `excited`**
  (`tests/url_state.test.ts`'s `Shape` union and `randomView`, ruling C3) —
  its fixture profiles now carry a `speciesKey` matching whatever species
  the random draw picked, because `applyPendingView` only lands a link's
  view on the profile that matches the selected species (ruling C1);
  without that, an ion's or an excited atom's round trip would silently
  stop at `level: 'atom'` instead of exercising the rest of the key set.

### Validation

H–Ar's ΔSCF first ionisation energies land within 7.6 % of NIST (helium is
the worst case: 22.72 eV against 24.587 eV); sodium's 3s → 3p excitation
energy comes out 2.18 eV against the D line's 2.104 eV — both inside the
spec's 10 % bar. `tests/atom/delta_scf_nist.test.ts` checks the full sweep
(gated behind `ATOM_SLOW_TESTS=1`, ~3 minutes) against a committed results
file, `src/validation/ion_results.json`, with a fast subset (He, Li) also
recomputed on every default `npx jest` run so a silent regression in the
committed numbers cannot hide behind the slow gate alone.

## Phase 4 — relativity (2026-09-25)

Atom mode gained a Relativity switch (Off / Scalar / With spin–orbit,
Controls panel — layout contract §3.8). See "Known limits" above for the
modes, the NIST validation and the remaining approximations; this section is
what differs from the phase plan, costs money (time), or isn't visible from
reading one file.

### URL state (ruling C1)

- **`rel` sits right after `Z`**, ahead of `charge`/`excite`
  (`encodeAtomKeys`/`decodeAtomKeys`): `Z`, `rel`, `charge`, `excite`,
  `level`, `n`, `l`, `ml`, with `j` after `l` once a link names a j-level
  (ruling C8).
- **Absent or invalid `rel` decodes to off**, so every link made before this
  phase — and a hand-edited `rel=nonsense` — still reproduces exactly the
  picture it showed. The encoder writes `rel` whenever the *effective* mode
  is not off, so a default-scalar gold link encodes `rel=scalar` even though
  nobody touched the switch.
- **Choosing the current element's default clears the override** (ruling
  T11-a, fixing I2 found in Task 11's review; corrected in the final
  review, I3). As built: `setRelativity` stores `null` when the mode chosen
  equals the *current* element's default, and the mode otherwise;
  `setElement` never touches the override. So a real departure persists
  across element picks — Scalar chosen on carbon is still the override on
  gold, and Off chosen on gold still applies on uranium — and the only way
  back to following the default is to choose the current element's
  default. Two things make that reachable and visible: the "Default for
  this element" helper is derived from `effective === defaultRelativityFor(Z)`
  (not from the override being `null`), so Scalar on gold reads as the
  default whichever element it was chosen on; and clicking the
  already-selected button re-chooses it (the toggle's null is passed on as
  the shown mode), so clicking Scalar on gold clears a carried-over
  override and carbon is off again. The URL decoder normalises the same way
  against the decoded element, so a link whose `rel` is its element's
  default opens following the default, as if nobody had touched the switch.

### Cache keys (ruling C2)

Every relativity-sensitive cache — the species solve
(`solveSpeciesCache`), the serialised profile (`profile_cache.ts`), the
shell mesh (`shell_mesh_cache.ts`) and the neutral reference ring
(`atomWorker.ts`'s `referenceRadiiFor`) — keys `off` exactly as it always
was (bare `speciesKey`, byte-identical) and keys every other mode
`${speciesKey}@${relativity}`. `shell_mesh_cache` additionally folds in the
isolated j-level, since 6p½ and 6p³⁄₂ are different meshes at the same
(n, l).

The species solve memo is bounded (final review recommendation): a
neutral ground state without relativity is kept for good (at most 118, so
`solveAtom(Z)` stays one object), everything else — ions, excitations,
every relativistic solve — least recently used first, 48 at most
(`SOLVE_CACHE_LIMIT`). `failedNonRelativisticSolves` (verdicts only, no
grids) is not bounded.

### Warm/cold start and the non-relativistic search throwing (rulings T7-a, T7-b)

A relativistic solve seeds from the *same species'* converged
non-relativistic potential rather than the screened guess — it is on the
same grid (`gridForAtom` depends only on Z and the highest n) and starting
next to the answer saves iterations (47 → 37 for neutral gold, measured
again below). Where that seed throws or fails to converge, `solveSpecies`
retries from the screened (cold) start and reports its outcome instead
(ruling T7-a) — found necessary for 16 heavy species where the relativistic
equation, asked in the non-relativistic potential, finds a barely bound f
level pushed out of the bound spectrum in its first iterations (Tm/Yb with
spin–orbit, and several 6s→5d/7s→5f excitations; see the Backlog sweep
entry below for the full list).

The non-relativistic eigenvalue search now throws the same "no bound state"
diagnostic the relativistic one always has, rather than silently returning
whatever root it last tried (ruling T7-b) — before this, Pr–Eu's 6s → 4f
excitation "converged" in off mode with a phantom 4f at −192 Ha, shipped
since Phase 3. A verdict from either solver is classified one of six ways
by the heavy sweep (`relativistic_heavy_sweep.ts`): `converged`,
`unconverged`, `unbound` (an anion's electron is not bound, as always),
`notBound`/`noBoundState` (an honest LDA verdict — the promoted or valence
electron the species asks for is simply not bound in this method, not a
solver bug), or `error` (an actual bug, the only outcome that fails the
sweep). `KNOWN_FAILURES` pins every non-`converged` outcome **both ways** —
a species that starts converging when the list says it shouldn't fails the
shard exactly as one that stops converging does — so neither a regression
nor an unnoticed fix can drift past the suite silently. The full
classification, including which excitations are unbound and why, is in the
Backlog's "Which heavy species do not converge" entry below.

### ΔSCF energies stay non-relativistic (ruling C6)

Ionisation and excitation energies are, in every relativity mode, ΔSCF
differences from the non-relativistic spin-polarised LDA — spin-polarised
MacDonald–Vosko exchange is out of scope, and ΔSCF is validated only
through argon (Phase 3's table above). With a relativistic picture on
screen this has to be said or a heavy atom's shown energy reads as
carrying a relativistic shift it does not include: `deltaScfMethod
(pictureMode)` (`delta_scf.ts`) and LevelNav's
`relativisticEnergiesSentence(mode)` both state plainly that the picture is
drawn by the switch's method while the energies stay the non-relativistic
one, whenever the picture is not off. The energies caches are untouched —
keyed by `speciesKey` alone, not cleared by a relativity switch — since the
numbers they hold do not depend on it.

### A missing comparison or reference is named, not silently dropped

The dashed non-relativistic curve and the "what changed" valence-s
contraction need the *same species'* non-relativistic solve (ruling C5);
where that solve fails or does not converge (the Pr–Eu 6s → 4f case above,
or any species whose off-mode solve itself does not converge),
`comparisonUnavailable` carries why ("No non-relativistic comparison: …")
and is shown in the readout's place rather than the readout silently
vanishing. Independently, the neutral reference ring's own second solve
inside the worker can fail on its own account; `referenceUnavailable`
covers that case the same way, shown where the reference-ring note would
be. The two are unrelated: a picture can have a comparison but no
reference, or vice versa.

### Cost (ruling C16)

A relativistic pick costs two solves (the non-relativistic one the worker
needs anyway for the comparison curve, then the relativistic one warm-seeded
from it); an ion or excitation of a heavy element costs up to four (its own
pair, plus the neutral reference's pair for the ring and the camera's
framing floor). Accepted per ruling C16. Measured directly (bundled with
esbuild, run under plain Node rather than jest — the process notes below
explain why jest is not the tool for this): non-relativistic seed solve,
then the relativistic solve warm-started from it, then the same relativistic
solve cold (screened-start, no seed), for three neutral heavy atoms and one
heavy ion:

| Species | Mode | NR seed | Warm (iterations) | Cold (iterations) |
| --- | --- | --- | --- | --- |
| Au | scalar | 0.94 s | 2.71 s (37) | 3.41 s (47) |
| Au | spin–orbit | — (cached) | 4.85 s (37) | 6.08 s (47) |
| U | scalar | 1.19 s | 4.47 s (38) | 5.73 s (48) |
| U | spin–orbit | — (cached) | 6.50 s (38) | 8.20 s (48) |
| Og | scalar | 1.17 s | 4.90 s (39) | 5.61 s (45) |
| Og | spin–orbit | — (cached) | 7.15 s (39) | 8.61 s (47) |
| Au⁺ | scalar | 0.79 s | 3.11 s (37) | 3.83 s (45) |
| Au⁺ | spin–orbit | — (cached) | 4.57 s (37) | 5.41 s (44) |

("— (cached)" marks spin–orbit's reuse of the already-measured neutral/ionic
non-relativistic seed in the same run.) A first-ever pick's real cost is NR
seed + warm, e.g. Og with spin–orbit from cold: 1.17 + 7.15 ≈ 8.3 s — the
Review Focus 5 case, confirmed live to converge without error. The warm
start saves iterations everywhere measured (10 fewer for Au and Au⁺, also
10 for U, 6–8 for Og) without exception; it does not always save wall time
once the NR seed's own cost is counted, because the app needs that NR solve
regardless, for the comparison curve. An Au-scalar total of 3.65 s here
matches the 3.9 s Task 7 logged bundling the same way, cross-checking the
method.

### Payload size

A relativistic profile's serialised payload carries the non-relativistic
comparison curves alongside the drawn ones (for the dashed overlay and the
valence-s contraction), which costs uranium's payload about +390 KB over
its non-relativistic size. Accepted per ruling C16 (Task 8 review) — the
comparison is wanted on every relativistic pick, not an opt-in extra.

### Staleness checks and the slow suite

`relativistic_nist.test.ts` includes a fast default-run subset (mirroring
Phase 3's He/Li ion-validation subset above): neon is cheap enough to
re-solve on every `npx jest` run and compare against the committed
`relativity_results.json` to 1e-6, so a solver regression that moves the
committed NIST numbers is caught without `ATOM_SLOW_TESTS=1`. The two
exhaustive sweeps (`excitation_sweep_<k>`, `relativistic_heavy_sweep_<k>`)
are excluded from the default run entirely via `jest.config.ts`'s
`testPathIgnorePatterns` (not merely `.skip`, which still compiles and sets
up every shard — ruling T7-e) unless `ATOM_SLOW_TESTS=1`; see "Process
notes" below for batching them. `jest.config.ts` also sets
`workerIdleMemoryLimit: '1GB'`, recycling a worker once it idles above that —
the heavy SCF suites leave large memoised solutions behind, and a full run
has lost a worker to SIGSEGV mid-suite three times (never yet reproduced in
isolation; see "Process notes").

### Judgment calls made without asking (this phase)

1. **RK4 over Numerov for the relativistic radial equations**
   (`coupled_rk4.ts`, Task 3). Numerov needs a single second-order ODE; the
   coupled Koelling–Harmon and Dirac equations are a first-order pair for
   the large and small components (G, F) with no Numerov-compatible
   second-order form. RK4 needs the potential at the half-step too, supplied
   by 4-point midpoint interpolation at the same fourth order, so the whole
   integrator stays fourth-order accurate on the same log-r grid the
   non-relativistic Numerov solver already uses.
2. **The MacDonald–Vosko relativistic exchange correction is always on in
   both relativistic modes**, not an independent toggle, because NIST's own
   ScRLDA and RLDA tables both use it — the validation above is a comparison
   against those tables, and comparing against the right correction is the
   only way it means anything. `RELATIVISTIC_EXCHANGE_CORRECTION` records
   this as a fact about the fixtures, not a choice this app made
   independently.
3. **`relativityOverride` is global, persisting across element picks;
   choosing the current element's default clears it** (ruling T11-a, above)
   — `setRelativity` normalises, `setElement` does not. Found live in Task
   11's review (I2): without the normalisation, choosing Scalar on gold
   froze an explicit "scalar" that followed the user to carbon. The final
   review (I3) found the helper still keyed to `override === null`, so
   Scalar carried from carbon onto gold did not read "Default for this
   element"; it now compares the effective mode with the element's
   default, and re-clicking the selected mode re-chooses it.
4. **The relativistic SCF is seeded from the same species' converged
   non-relativistic potential (NR-seeded), not the screened guess** (ruling
   C2) — it is on the same grid, the worker needs the non-relativistic
   solve anyway for the comparison curve, and starting next to the answer
   measurably saves iterations (above). Where that seed fails, the cold
   start's own verdict is reported instead (T7-a) — the saving is opportunistic,
   never load-bearing for correctness.

## Phase 5 — Bonds mode (2026-10-04)

Atom mode and Basic Orbitals mode both solve one atom; this phase adds a
third mode, Bonds, which solves molecules — one exactly (H₂⁺, any R, live in
the browser) and ten more from a real quantum-chemistry pipeline that runs
offline and ships its results. This section is what differs from the phase
plan, what the S3 amendment changed on the way, or isn't visible from
reading one file; the bullets above under "Decisions that are not obvious
from the code" cover the sharpest individual traps. 15 tasks, each reviewed
and fixed before the next started; the full ledger is
`.superpowers/sdd/2026-09-25-phase-5-bonds-mode/progress.md`.

### H₂⁺: exact, not fitted

`src/bonds/h2plus.ts` separates the Schrödinger equation in prolate
spheroidal coordinates (λ, μ) and finds the one energy at which the μ
equation's lowest eigenvalue and the λ equation's highest agree — see the
"Design decisions" section above (written while this phase was planned) for
the derivation, and the λ-sign-convention bullet above for how the two
factors are pinned against an arbitrary eigenvector sign. Validated to the
spec's own bars: R_e = 1.99719 a₀ (spec: 1.997 ± 0.5 %), E(R_e) =
−0.6026346 Ha (spec: −0.6026 ± 0.1 %), and E_el(1σg, R = 2 a₀) =
−1.1026342145 Ha against the same published figure to six decimal places —
all three computed by the solver itself at import time
(`src/validation/phase5.ts`), never hand-typed. The slider's range, [0.5,
10] a₀, is a UI choice, not the solver's own limit (it answers up to
R = 100 a₀, past which the 40-term Jaffé series stops converging); `checkR`
throws outside (0, 100] rather than return a wrong number, and
`bondsFieldRequest` clamps every R that could reach it — a URL's, a curve
click's — before it does.

### The diatomics pipeline, as it actually ran

`tools/molecules/` is the offline tool (`uv venv --python 3.12
--managed-python tools/molecules/.venv`, `uv pip install --python
tools/molecules/.venv/bin/python -r tools/molecules/requirements.txt`;
`requirements.lock` pins every transitive dependency so a rerun months later
reproduces the same numbers). `generate.py --only <id>` writes one
molecule's tree to `version.OUT_ROOT`
(`tools/molecules/out/<DATA_VERSION>/<id>/`, git-ignored); every reference
calculation is described by a settings dict (molecule, method, basis,
geometry, reference determinant, pinned occupations, frozen-core count,
thresholds, PySCF version, and `CACHE_SCHEMA`) and cached under a SHA-256
hash of it in `tools/molecules/.cache/` — the dict is stored beside the
value and compared on read, so any change to how a number would be computed,
including bumping `CACHE_SCHEMA` by hand, misses the cache rather than
silently reusing a stale one (ruling T4-b). A run cut short resumes where it
stopped; O₂'s UCCSD(T) points run about 28 s each, so a full molecule is
minutes, not seconds.

**The validity rule (rulings T4-a, T4-d)** ships a diatomic's curve only as
far as the first of its twenty computed points where CCSD fails to converge,
its T1 diagnostic exceeds `max(base limit, 1.5 × T1 at R_e)` (base limit
0.02 closed-shell, 0.03 open-shell — Lee & Taylor's rule of thumb), or the
energy stops rising towards dissociation (`fit.py`'s `valid_range`, which
checks all three in that order and reports whichever fires first, with the
R and the number behind it, e.g. `"T1 diagnostic 0.0214 exceeds 0.0200 at
R = 2.5307 a₀"`). The growth allowance (1.5×) exists because an absolute 0.02
bar alone would fail CO at R_e itself (its own T1 there is 0.018, 90 % of
the way to the bar) and would leave B₂ and C₂ — already over the bar at
R_e — with no valid points at all; with it, both ship their full
below-dissociation range flagged `multireference: true` instead of being
silently dropped. As generated: N₂ ships 14 of 20 points (stops at R =
2.53 a₀), O₂ 16 of 20, CO 13 of 20, F₂ 15 of 20, HF 17 of 20; H₂, He₂ and Li₂
(all exact — full CI or, for Li₂, CCSD(T) that is full CI in its frozen-core
space) ship all 20. `MIN_VALID_POINTS = 8` would fail the generator loudly
rather than ship a curve too short to show a minimum; nothing generated hit
it.

**D_e is always `E(A) + E(B) − E(R_e)` from independent free-atom
calculations**, at the molecule's own method, basis and each atom's real
ground spin state (`molecules.ATOM_GROUND_STATES`: N ⁴S, O ³P, B ²P, and so
on; full CI for H and He) — never read off the last shipped scan point,
which for seven of the ten molecules is well short of dissociation. No
counterpoise correction is applied anywhere; for every bound molecule here
it is far smaller than D_e, but He₂'s entire ~0.04 mHa well is of the same
order as the correction it does not have, which is exactly why the app
calls it "no chemical bond" rather than a weak one.

**Why Be₂ is not among the ten** (ruling C4): it reads as included by the
spec/plan's "the period-2 series, Li₂ … F₂", but its bond order is 0 in the
simple MO picture (the two valence electrons past Li₂ exactly fill 2σu*,
cancelling 2σg), and showing that honestly needs its own bond-order-0
caption and validation row rather than borrowing the bond-order-N captions
every other molecule in the table shares. `tools/molecules/molecules.py`
records the reasoning next to `DIATOMICS`; carried forward here as a C4
line item for whoever adds a future data version.

**Li₂'s frozen core (ruling T4-c)**: both 1s shells are frozen in CCSD(T),
which makes it exact — full CI — for the two valence electrons that are
left, so the whole 20-point curve ships with no validity cutoff at all. The
cost is core–valence correlation, which the frozen core cannot capture: R_e
comes out 5.102 a₀ (2.700 Å) against Huber & Herzberg's 2.673 Å, about
1.01 % long. `captions.ts`'s `li2Caveat` computes that percentage from the
shipped fit rather than a hand-typed number, so it cannot drift from the
data it describes.

**Orbital selection and labelling** (`tools/molecules/labels.py`): every
occupied MO plus the virtuals with the largest projection onto PySCF's MINAO
minimal basis, up to that basis's size, labelled from the molecule's own
D∞h/C∞v symmetry (`symm.label_orb_symm`) as nσg/nσu*/nπu/nπg*, numbered per
irrep in energy order; the antibonding star applies to a homonuclear
molecule only, so CO and HF's `bondOrder` is `null` rather than guessed.
`SELECTION_TIE_MARGIN = 0.05`: a kept virtual whose MINAO weight beats the
runner-up by less than 5 % of its own norm is recorded as a `nearTie` on the
orbital (CO's 6σ at 0.80 R_e, B₂'s β spin at 1.22 R_e are the measured
cases) — always two σ virtuals of one irrep sharing the valence σ* character,
so the label is right either way and only the shape is a matter of mixing;
`orbitalCaveats` (`src/bonds/captions.ts`) surfaces it in the panel rather
than presenting one arbitrary pick as certain.

### Exact-ρ density surfaces (ruling T7-a)

A molecule's density is never shipped as a per-geometry grid (twenty of
those would blow the 3 MB budget on their own); the app evaluates
ρ = Σ occᵢψᵢ² live from the shipped `basis.json` via a new field recipe,
`{ type: 'gaussianDensity', moleculeId }`, whose evaluator returns √ρ —
Phase 1's own convention for a density-type grid source — so
`meshFromSamples` squares it back before marching cubes runs (the same
convention the cube exporter has to undo explicitly, see Task 13b below).
The surface is drawn at exactly one of three ρ values (0.002, 0.05,
0.2 e/a₀³), never a percentage: `FieldRenderRequest.densityIsoValue` goes to
`generateIsoValueMesh` (`src/orbital_mesh.ts`), which marches cubes at that
ρ directly — it is never converted into an enclosed fraction, so Phase 1's
contour search (and its histogram rounding) is bypassed for Bonds densities. `bondAxisMinimumDensity`
(`src/bonds/bond_density.ts`) samples 200 points on the segment between a
diatomic's two nuclei from the same basis and occupations, so the panel can
say, read off the actual density rather than assumed, whether the chosen
surface is still one envelope around both nuclei or has already separated
into two — that minimum runs from 0.71 e/a₀³ for N₂ down to 0.0125 for Li₂
at R_e, so no single ρ value means the same shape for every molecule.

### The molecular-orbital diagram

`buildMoDiagram` (`src/bonds/mo_diagram.ts`) draws Kohn–Sham eigenvalues to
scale for the valence levels and compresses the 1s cores (more than 1 Ha
lower) into their own row under a break — stated on screen as orbital
energies and never as ionisation energies, the same distinction atom mode's
own diagram already draws, because Koopmans' theorem does not hold exactly
for a density functional either. Restricted molecules get one level per
label with ↑↓ from its occupation (C₂ among them: a closed-shell singlet,
run restricted); the unrestricted ones (O₂, B₂) draw levels at α energies
with ↑ from the α orbital and ↓ from the same-labelled β one, so O₂'s two
unpaired π* electrons show as two degenerate boxes each carrying a lone ↑ —
Hund's rule, visibly. Drawing α energies can hide an order β puts the other
way (final review I1): O₂'s α levels have 1πu (−0.573 Ha) below 3σg
(−0.559), but β (3σg −0.521, 1πu −0.470) and the photoelectron spectrum
(b ⁴Σg⁻, a 3σg hole, above a ⁴Πu) put 3σg lower — the textbook O₂-versus-N₂
swap. `buildMoDiagram` records every valence pair whose β order differs
(`betaOrderSwaps`), and `spinOrderNote` names them under the diagram, citing
photoelectron spectra only when both swapped β levels are occupied (a
spectrum ionises only occupied levels): O₂ gets "in β — and in
photoelectron spectra — 3σg lies below 1πu", B₂ (whose swapped β pair is
empty) "in β, 3σg lies below 1πu", restricted molecules nothing. Clicking a
box dispatches `BondsView`'s `{ kind: 'mo', label, spin, component }`, never
a bare index (see the label-not-index bullet above).

### Exports from Bonds (Task 13b, ruling C5)

`src/export/caption.ts`'s `bondsDrawnPicture` reads what is actually on
screen from the rendered `FieldRenderRequest`'s own recipe — never
`state.bonds` directly — so an export always matches the drawn picture
during a load, not the selection that is still in flight (the fix-round-1
defect this ruling exists to prevent: exporting what the user just clicked
before the data for it has landed). Every export states the system, R and
method in both its caption and its ASCII file-name stem
(`orbital-viewer_N2_R2.07_3sigmag`-style). Bonds' CSV
(`run_export.ts`'s `bondsCsvFor`) is the potential curve E(R) — H₂⁺'s own
191-point solved curve (read from the live plot's already-cached
`H2PlusCurve`, never re-solved on the main thread) or a diatomic's shipped
scan points (up to twenty: 13–20 ship; curves stop where single-reference
CCSD(T) stops being valid) — not a radial distribution. The cube exporter
(`cube_request.ts`, `cube.ts`) carries both nuclei as `CubeAtom`s; for a
density recipe it squares the evaluator's √ρ back to ρ before writing it,
the same undo `meshFromSamples` performs for the on-screen surface. Every
Bonds export is refused outright while `useBondsData` is still loading or
has failed, or while the drawn picture's own system/scan-point does not yet
match the current selection — `bondsBlockReason` checks both before
`cubeJobFor`/`bondsCsvFor` ever run.

### URL state (`src/bonds/bonds_url.ts`, ruling C8)

Three keys, in a fixed order: `system` (`h2plus` or a `DiatomicId`), `R`
(bohr, three decimals), `state` (`1sigma_g`/`1sigma_u` for H₂⁺;
`density`/`density:<iso>` for a molecule's total density; `mo:<spin>:<label>
:<component>` for an orbital, by label, never by index — `#mode=bonds&
system=n2&R=2.09&state=mo:restricted:3σg:0`). Every value is clamped or
ignored, never thrown on (Review Focus 4): an unknown `system` is ignored
outright (`isBondsSystemId`); `R` is parsed only if finite and positive,
then clamped by the slice itself — `snapH2PlusR` for H₂⁺, the nearest
shipped scan point once the scan has loaded for a molecule (`R: null` until
then means "snap to the equilibrium, or the opening point for an unbound
molecule, once the scan is known" — `useBondsData`'s own job, not the URL
decoder's); an unparseable or malformed `state` token (`parseState`'s regex
checks on spin and label) is dropped, leaving the system's own default
view. `registerBondsUrlKeys()` registers under mode `'bonds'`, alongside the
shared view-key group (`frac`/`cut`/`op`/`surf`/`cam`) every mode already
gets from `ANY_MODE`.

### Validation (`src/validation/phase5.ts`)

H₂⁺'s three rows (E_el at R = 2, R_e, E(R_e)) are computed by the app's own
solver at import time, against Bates, Ledsham & Stewart (1953) and Wind
(1965). The diatomics' rows are written by `generate.py` into
`src/validation/generated/phase5_diatomics.json` — committed, not
recomputed by the TS test suite, since recomputing them means running PySCF
— and read in verbatim: H₂ R_e 1.404 a₀ (ref. 1.401, ±1 %) and D_e 4.71 eV
(ref. 4.75, ±2 %); N₂ R_e 1.104 Å (1.098), O₂ 1.213 Å (1.207), F₂ 1.418 Å
(1.412), CO 1.136 Å (1.128), HF 0.921 Å (0.917), all within the spec's 1 %.
O₂'s ground state being the triplet is checked directly, not inferred from
its occupation alone: a `spinCheck` scan point runs the same UCCSD(T) for
both the triplet and a closed-shell singlet at the same geometry, and the
triplet comes out 0.0478 Ha (1.30 eV) lower. That check is a row too
(final review M7): "O₂ E(closed-shell singlet) − E(triplet)", app 1.30 eV,
written by `validation_rows` from the scan's `spinCheck`. It is a *bound*,
not a target — the closed-shell determinant mixes a ¹Δg and b ¹Σg⁺, so no
measured gap is its reference — so `ValidationRow` gained an optional
`bound: 'above'` (app must exceed `reference`, here 0; `tolerancePercent`
0 and unused), and `rowPasses()` checks either kind. Phase 7's Methods page
must render a bound row as "> 0", not as a percentage error.

### What is still open

- **Be₂** is the obvious next molecule for a `v2` data version — see the
  dedicated bullet above.
- **Spin contamination** (⟨S²⟩) is not checked for the UHF/UKS references
  (O₂ and B₂; C₂ is a closed-shell singlet, run restricted); nothing
  observed in the generated data suggests it, but nothing asserts it is
  small either.
- **No zero-point energy anywhere** — every D_e here is the bare electronic
  well depth; a spectroscopic D₀ would need a vibrational frequency this
  phase does not compute. D_e also falls 1–5 % short of experiment's
  (aug-cc-pVTZ underbinds: N₂ 9.44 eV against 9.91, F₂ 1.58 against 1.66;
  H₂ at full CI 0.9 %), and the D_e caption says so.
- **The `.cache` and `out/` directories are git-ignored and can grow large**
  across several data versions on one machine; nothing here prunes them.

#### For Phase 6

- **A `v2` must regenerate all ten diatomics at the same commit as the new
  molecules.** `publish.py` refuses a tree whose `meta.json` files name more
  than one generator commit (or a `-dirty` one): the manifest records a
  single `generatedBy.commit`, and v1 is published and immutable, so v2
  cannot reuse v1's files as they stand. That is cheap only with the
  settings cache (`tools/molecules/.cache/`, ruling T4-b) still on disk —
  a rerun then re-solves only the DFT and grid steps; from a cold cache O₂'s
  UCCSD(T) alone is ~28 s a point. If regenerating everything becomes the
  bottleneck, make provenance per molecule in the manifest (one commit per
  molecule id) rather than relaxing the check.
- **The v1 `density.bin.gz` grids are point-sampled, not voxel-averaged.**
  `outputs.density_on_grid` writes ρ at each node; summed as Σρ·h³ over the
  shipped 0.25 a₀ grid they integrate to the electron count +0.0 % (H₂),
  +0.4 % (HF), +0.5 % (He₂), +1.0 % (O₂), +1.7 % (Li₂), +3.2 % (C₂), +5.0 %
  (F₂), +6.8 % (CO), +12.0 % (B₂) and +14.6 % (N₂) — one node near a 1s
  cusp stands for far more charge than its voxel holds. Bonds mode never
  draws these grids (it evaluates ρ from `basis.json`), so v1 is unaffected,
  but Phase 6's "integrates to N within 0.5 %" needs voxel-averaged writing
  (e.g. sub-sampling each voxel, or integrating the Gaussians over it
  analytically) in `density_on_grid`, and a test that sums a grid.
- **Diatomic-only code paths Phase 6 must generalise:**
  `DIATOMIC_IDS` / `BONDS_SYSTEMS` (`src/bonds/systems.ts`, a fixed list);
  `bondsDrawnPicture`'s `const [a, b] = basis.atoms` R
  (`src/export/caption.ts`, and every caption/stem that prints one R); the
  URL's `MO_LABEL` regex (σ/π/δ g/u labels only) and its `[01]` component
  check (two-fold degeneracy at most) in `src/bonds/bonds_url.ts`;
  `bondAxisMinimumDensity` (`src/bonds/bond_density.ts`, two atoms or null);
  `generateIsoValueMesh` (`src/orbital_mesh.ts`, refuses anything but a
  `gaussianDensity` recipe — a grid source will need its own path); the MO
  diagram's core detection (`buildMoDiagram`: one widest gap over 1 Ha —
  SF₆ has S 1s, then S 2s/2p and F 1s, each separated by more than 1 Ha,
  so a single split misfiles levels); and `orbitalSlice`'s `isBondsField`,
  which treats any `gaussianMO`/`gaussianDensity` recipe as Bonds — a
  Phase 6 molecule drawn from the same recipes would be cleared on
  switching to Basic Orbitals as if it were a Bonds picture.
- **Ruling C13 is deferred to Phase 6:** Phase 1's carry-forward "report
  large negative densities in grid sources" has no Phase 5 home (Bonds
  draws no grids). Phase 6 draws grids and must report them. v1's grids
  hold none (`density_on_grid` zeroes values below `ZERO_BELOW`, and the
  smallest shipped sample is ≥ 0).

## Phase 6 — Molecule library (2026-10-05)

A fourth mode, Molecules: 25 real polyatomic molecules (water to glycine),
picked by name/formula/category, each with ball-and-stick geometry, total
density, a mapped electrostatic potential and a full orbital list. It shares
Bonds mode's offline pipeline (`tools/molecules/`) and data-serving path
(S3 behind CloudFront, a Vite dev middleware locally) but is its own data
version, its own `src/molecules/` catalogue/store/components, and its own
set of decisions below. 17 tasks, each reviewed and fixed before the next
started; the full ledger is
`.superpowers/sdd/2026-09-25-phase-6-molecule-library/progress.md`.

### Voxel-averaged density, and why

Bonds mode's density is drawn at one of three fixed ρ values, evaluated live
from `basis.json` (see Phase 5's "Exact-ρ density surfaces" above) — point
sampling is fine there because the surface is re-evaluated analytically, not
read off a shipped grid. The library's density, by contrast, *is* a shipped
grid (§4.1 binds), and a point-sampled grid at this box size under-resolves
a heavy atom's 1s cusp badly enough that the enclosed-fraction contour the
spec calls for would be wrong: Phase 5's own v1 diatomic grids, point-sampled
at a coarser spacing, integrate to the electron count anywhere from +0.4 %
(HF) to +14.6 % (N₂) — nowhere near this phase's 0.5 % bar. Rather than
dropping the enclosed-fraction contour for a handful of fixed ρ buttons
(ruling D4's rejected alternative), the library's grid is **voxel-averaged**
(`density.voxel_averaged_density`, `density.check_density`): each grid node
holds the average of ρ sampled finely across its own voxel rather than its
value at one point, which is what brings every library molecule's density
integral within the 0.5 % bar. The ESP surface is the opposite case — it is
drawn at exactly one physically meaningful value (ρ = 0.001 e/a₀³, see
below), where an enclosed-fraction contour would mean nothing — so it is
built by a separate, additive code path (`generateGridIsoValueMesh`) that
never runs `enclosedFractionForDensity` at all. The density select and the
ESP surface therefore follow two different rules from each other in the
same mode, and the panel names which rule is in force next to each one.

### The fixed ±0.05 Ha/e ESP scale, and ρ = 0.001

Every molecule's electrostatic potential is coloured on the same symmetric
±0.05 Ha/e (±31.4 kcal/mol) scale, mapped onto the surface at exactly
ρ = 0.001 e/a₀³ — the conventional ESP isosurface value, not an enclosed
fraction of anything. Both are deliberate: a *shared* scale is what makes
two molecules' polarity comparable by eye (benzene's π faces and water's O
lone pair read on the same red/blue axis), where a per-molecule auto-scale
would flatter a weakly polar molecule into looking as dramatic as a
strongly polar one. A molecule whose own ESP range is narrower than ±0.05
reads pale rather than being stretched to fill the scale; one that exceeds
it (several of the 25 do, water among them) is captioned "saturated beyond
the scale" so the clipping is visible, not silently absorbed. `esp.py`'s
`esp_surface_range` reports each molecule's actual min/max for that
caption; `src/molecules/esp_color.ts` never reads it to rescale the colour
map itself.

### ROKS for NO₂

NO₂ is the one open-shell molecule in the library (a doublet — one unpaired
electron in its 3b₁-like SOMO). Rather than run unrestricted Kohn–Sham
(UKS) and carry a second, β-spin orbital set the way Phase 5's O₂ and B₂
do, NO₂ runs **ROKS** (restricted open-shell Kohn–Sham): one shared set of
spatial orbitals, the unpaired electron's own orbital marked SOMO rather
than HOMO. The choice is `orbitals.py`'s and is deliberate, not a
limitation of the pipeline — a library of 25 molecules shown through one
`MoleculeOrbitalList` component reads far more consistently with one
orbital set per molecule than with NO₂ alone needing the α/β split Bonds
mode's `MoDiagram` already handles for its own two unrestricted diatomics.

### The structure overlay is deliberately unclipped

`buildBallAndStick`'s own comment states it: the atoms and bond sticks are
never clipped by the cut-away, even when the density or ESP surface next to
them is. The cut is for seeing inside the surface; the structure is what
you are looking for once you are in there, so cutting it away with the
surface would hide the very thing the cut was meant to reveal.

### Framing is keyed on the grid box, not the drawn surface

A molecule's camera framing uses `boxRMax = gridHalfWidth(meta)` — half the
width of the molecule's own sampling box (`meta.grid.origin[0]`, always
negative, so its absolute value is the half-width) — never the radius of
whatever surface happens to be drawn. Density, ESP and every orbital for one
molecule therefore share one framing, so switching between them does not
reframe the camera (`orbital_visualizer.ts`'s `prepareBoxFraming` only
reframes when `boxRMax` itself changes, i.e. on a new molecule, not a new
surface) — the desktop legend stack's own height is counted separately, as
a view inset, so it does not fight this rule (see Task 16's "Framing" fix
round note).

### The B3LYP/def2-TZVPD switch (owner decision 2026-10-05)

Task 7's first pass, at the plan's original B3LYP/def2-TZVP, measured five
dipoles outside the 10 % tolerance: water (2.07 D against 1.855), ammonia
(1.71 against 1.471), ozone (0.67 against 0.53), hydrogen sulfide (1.11
against 0.97) and ethanol (1.60 against 1.44). Asked for a recommendation,
the controller measured the same five at B3LYP/def2-TZVPD (the same
functional, with def2-TZVP's basis augmented by diffuse functions) and
found four back within tolerance (water 1.858, ammonia 1.515, H₂S 0.972,
ethanol 1.579) with only ozone still missing (0.655, still over its 0.53 D
reference even floored). The owner chose TZVPD for every one of the 25
molecules' *properties* — density, dipole, ESP and orbitals — while leaving
geometries as they already were (CCCBDB experiment, or B3LYP/def2-TZVP
optimised where there is no usable experimental structure); Bonds mode's
own ten diatomics are untouched, still def2-TZVP throughout. The wider
basis's diffuse tails are also why the library's sampling box margin is
6.5 bohr past the outermost atom rather than a narrower value that would
have been enough at def2-TZVP alone — the first generation run at a 5.0
bohr margin failed its own box-leak check at CH₄ (face density 1.2×10⁻⁵,
over the 1×10⁻⁵ limit); HCN, the worst case at the widened margin, still
sits comfortably under 2×10⁻⁶.

### Ozone: a known miss, pinned both ways

Ozone's dipole stays outside tolerance even at TZVPD (0.66 D against 0.53,
the floored tolerance still only 0.053 D) because ozone has strong
multireference character that no single-reference method — B3LYP among
them — describes well. Rather than special-case its tolerance or drop its
validation row, `ValidationRow` gained an optional `knownMiss?: string`
field (the Python `Reference` a matching `known_miss`), and
`references.test.ts` pins `rowPasses(row) === !row.knownMiss` **both
ways** — the row must fail exactly because it is a known miss, not because
something else broke, and a future fix that brings ozone's dipole back
within tolerance must also clear `knownMiss` or the pinned-failure
assertion itself goes red. `meta.json` carries the same sentence as
`caveat`, shown in the app next to ozone's dipole reading, not buried in a
table nobody sees.

### The dipole tolerance floor (ruling D28), restated

The spec's §3.2 is verbatim: "dipoles within 10 % of experiment." For a
small reference dipole (NO₂'s 0.316 D is the extreme case in this library),
a bare 10 % is tighter than B3LYP/def2-TZVPD can be expected to land, so
every dipole row's actual tolerance is `max(10 % of experiment, 0.05 D)` —
a deliberate, documented deviation from the spec's own wording, stated in
every affected row's method caption and in the README's own validation
section, not left to be discovered by someone diffing a tolerance column.

### Data: v2, published to S3, not committed

Unlike the plan's original assumption (~50 MB of generated data committed
to git), the library's 483 generated data files (plus the manifest's own copy:
484 objects under `molecules/v2/`) are **published to S3 behind
CloudFront as data version v2** — the same serving path Bonds mode's v1
already used — with a manifest at `tools/molecules/manifest/v2.json` and
every file's provenance pointing at **one generator commit, `979f341`**.
`publish.py` refuses to publish a tree whose `meta.json` files name more
than one commit, so Task 7's generation had to run (and rerun, after the
margin fix above) entirely at that one commit before publishing — nothing
under `public/molecules/` or `tools/molecules/out/` is committed to git at
all. The ten diatomics behind Bonds mode were **regenerated at the same
commit** (ruling P0: `publish.py` would otherwise refuse a v2 mixing v1's
diatomic provenance with the library's own), and came out identical to v1
apart from `meta.json`'s provenance (commit, dataVersion) — confirmed by a
TS fixture cross-check — so Bonds mode's own
picture is unchanged by this phase. Their grids **stay point-sampled**
(ruling D35): Bonds mode never draws them (it evaluates ρ live from
`basis.json`, as Phase 5 describes above), so voxel-averaging them would
cost generation time for no visible difference; the 0.5 % integral bar
applies only to the 25 library molecules' own grids.

### Orbitals: one list, not a diagram (ruling D23)

Bonds mode's `MoDiagram` draws a two-level diagram that depends on a
diatomic's cylindrical (D∞h/C∞v) symmetry — σ/π/δ labels, a g/u split, a
slider's worth of geometries to animate between. A library molecule's point
group varies far more widely across the 25 (C₂ᵥ, C₃ᵥ, D₆ₕ, Td, Oh and more),
so rather than generalise `MoDiagram` to all of them, the Plot slot shows
`MoleculeOrbitalList` instead — every orbital, energy-descending, HOMO and
LUMO marked, a divider at the HOMO–LUMO gap, each member
of a degenerate set on its own row with a ×N badge giving the set's size
(SF₆'s octahedral HOMO, three rows each badged ×3, is the sharpest
example), so every member stays pickable. `MoDiagram` itself is untouched and stays Bonds-only; a future
phase that wants a polyatomic MO diagram is a separate, deliberate ask, not
an oversight here.

### Exports (Task 16b)

Every export states the molecule and, for an orbital, its label and index,
in both caption and file-name stem (`orbital-viewer_NH2CH2COOH_mo19-16ap.*`
for glycine's HOMO). The Gaussian-cube exporter's ESP path is its own case:
unlike a density or orbital cube (ψ or ρ, Phase 5's existing convention),
the ESP cube is the raw electrostatic-potential grid itself, in Ha/e — its
title line says so explicitly ("…, ESP grid (Ha/e)") so it is never
mistaken for a surface-value file by whatever reads it next. The orbital
list itself exports as its own CSV — index, label, energy (Ha and eV),
occupancy, role — independent of the PNG/glTF/STL/cube exports of the
drawn picture, and (deliberately, unlike Bonds' CSV, which refuses after a
failed render) still exports even when the last surface render failed,
since the orbital table does not depend on what is currently drawn.

### Regenerating the data

```bash
tools/molecules/.venv/bin/python tools/molecules/optimise.py <id> --basis def2-SVP   # repeat until converged
tools/molecules/.venv/bin/python tools/molecules/optimise.py <id>                    # def2-TZVP, repeat until converged
tools/molecules/.venv/bin/python tools/molecules/build_library.py --only <id>
tools/molecules/.venv/bin/python tools/molecules/build_library.py --rows-only
tools/molecules/.venv/bin/python tools/molecules/publish.py v2 --manifest-only
tools/molecules/.venv/bin/python tools/molecules/publish.py v2 --dry-run
```

`optimise.py` is only needed for the seven molecules with no usable
experimental geometry. As with Bonds mode, every file actually published
must come from one clean generator commit — a real, non-`--dry-run`,
non-`--manifest-only` `publish.py v2` is a controller/reviewer step after a
full regeneration, not a routine part of iterating on one molecule, and a
published version is immutable: a mistake needs v3, not a v2 patch.

### Owner decisions this phase surfaced

- **The property basis, B3LYP/def2-TZVPD** (above) — asked and decided
  2026-10-05, the single largest change from the plan as written.
- **Ozone's known miss** — accepted as a documented exception rather than
  pursued further (e.g. a multireference method), per the same decision.
- **The data licence (spec §6.1) is still open.** The spec's own backlog
  flags this as an owner action, not resolved by this phase: code under
  ISC (`package.json`) with no stated licence for the generated molecule
  data itself; the spec's suggested pairing is MIT for the code and
  CC-BY-4.0 for the data, in a `LICENSE` file neither phase has added.
- **A Zenodo DOI for v2 is outstanding**, same as v1 before it — the
  spec asks each data version be archived on Zenodo with its own DOI
  (owner action) so a figure that cites this app's numbers can cite the
  exact, immutable data behind them; nothing in this phase or Phase 5
  before it has done that archiving.

### For 6B

The on-demand spec's on-demand-molecule plans (6B-1/6B-2/6B-3) were written
assuming def2-TZVP throughout, the plan's original basis before the owner
decision above. Before 6B-1 starts, its preflight must switch the
on-demand spec's §5.2/§8.2 (the `RECIPES` basis, the basis-size table, any
pinned keys computed at def2-TZVP, and sizing-test numbers such as water's
basis function count, 43 at TZVP versus 58 at TZVPD) to def2-TZVPD, so an
on-demand molecule's properties are computed at the same basis as this
library's 25 — otherwise a user comparing a library molecule against an
on-demand one would be comparing two different methods without being told.

## Phase 6B-1 — on-demand generation: jobs core, worker, local backend (2026-10-06)

Spec: `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md`.
This phase ships everything behind the on-demand "compute this molecule"
flow except the UI (6B-2) and the AWS backend (6B-3): canonicalisation and
keying (`tools/jobs/canonical.py`), PubChem resolution
(`tools/jobs/pubchem.py`), deterministic sizing and pricing
(`tools/jobs/sizing.py`, `prices.py`), a crash-safe local store and meter
(`tools/jobs/store.py`), the framework-independent request handlers
(`tools/jobs/handlers.py`), a local HTTP server and subprocess runner
(`local_server.py`, `runner.py`), a worker that runs one job end to end and
writes Phase 6's own result files (`worker.py`), a CLI (`cli.py`), and the
ARM64 Docker image this task adds (`tools/jobs/Dockerfile`), verified under
OrbStack. See `tools/jobs/README.md` for the module map and how to run it.

### Sizing version 1

Fitted (Task 11) from three real local runs — water (N 58), benzene (N
276), caffeine (N 614, run by the controller in the background per Ruling
D6) — all on an **Apple M2 Pro**, where PySCF's macOS wheel is
single-threaded (`lib.num_threads() == 1` regardless of `OMP_NUM_THREADS`).
Fitted constants in `sizing.CONSTANTS`:

```
m0 = 0.412, m2 = 3.73, t0 = 5.0, t3 = 19400.0, g = 1.5, f2 = 2480.0
```

`t0` and `g` are held fixed (the brief/Ruling D14); 6B-3 refits both, plus
`speedup`, from a real AWS Fargate ladder. This task's own container smoke
test (methane) measured `actual.threads == 10` inside the Linux image —
confirming the Mac's single-threaded number is a local artefact, not a
property of PySCF itself, and that 6B-3's refit will see real OpenMP
speedup the local fit never could.

### Rulings made in this phase

- **D6** — the controller ran the caffeine calibration job itself, in the
  background, as one command (precedent: Ruling T7-gen), because PySCF's
  single-threaded macOS wheel put caffeine at an estimated ~55 minutes,
  longer than one foreground implementer call can run. Water and benzene
  ran in the foreground.
- **D13** — the worker writes `geometryOptimisation: {steps, converged}`;
  6B-2 widens the TS type (`src/molecules/library_types.ts`) to
  `{ converged; maxGradient?; steps? }` rather than the worker computing a
  final SVP gradient it does not otherwise need.
- **D14** — the sizing model gained a second, separate term for the
  file-writing stage: `predicted seconds = OPEN_SHELL(...) ×
  [SCF/speedup(c)] + f2·(N/1000)²`, with `f2` **not** divided by `speedup`
  (Phase 6's grid-writing code has no threading on the Mac).
  `provenance.wallSeconds` is taken *after* the files are written, not just
  after the SCF. `f2` is fitted from the `writing files` stage alone;
  sizing tests that assume pure SCF scaling monkeypatch `f2 = 0`.
- **D15** — a `RuntimeError` from `build_library.check_box` (small anions,
  e.g. F⁻, whose diffuse density reaches the sampling box's face) is
  reclassified from `worker-error` to `box-too-small` with a message an
  owner can read, rather than the grid-maintainer-facing message
  `check_box` itself raises. No margin change.
- **T5-a** (Critical) — `FileStore`'s meter is *derived*: each job record
  carries its own unsettled reservation and a per-month list of settled
  charges, and the meter sums them. The public `meter(month)` is lock-free
  by design (every record is replaced whole by `os.replace`, so a reader
  sees each one before or after a write, never half); the cap check inside
  `create_job`/`requeue_failed` computes the same sum *under* the lock, so
  two writers can never both fit under the cap. Create/requeue/settle
  are each one atomic record write, so a crash between two writes can never
  double-apply or half-apply money. 6B-3's `DynamoStore` keeps its own
  transactional meter item but must pass the same contract tests.
- **T5-b** — `update_job` gained an optional attempt guard (`rec['attempt']
  == attempt` when given); the worker passes its attempt on every heartbeat
  and its final status write, so a superseded attempt can never clobber the
  current one's record. Settlement happens exactly once per reservation,
  done by the runner/reconcile, never by the worker itself.
  `latestEnergyHartree` resets on requeue.
- **T6-a** — handler hardening: the recipe type/whitelist is checked in
  `_request` before any PubChem call; a runner-failure write is guarded
  (`expect_status` QUEUED/STARTING + attempt, settle only if the guarded
  update succeeded); a preview skips the budget refusal when an existing job
  is DONE or already active (resubmitting would cost nothing); a charge is
  refused as `bad-multiplicity` when electrons exceed 2× the property
  basis's function count; a concurrent Retry that finds the job no longer
  FAILED returns 200 with the current record; the job route matches only an
  exact 64-hex key.
- **T11-a** — `decide()` must also clear a **time headroom** against the
  recipe's ceiling, not just pick the cheapest size that fits memory:
  `TIME_HEADROOM = 1.5`; it walks sizes smallest-first and picks the first
  whose predicted seconds × 1.5 is still ≤ the recipe's ceiling (clamping
  the timeout, as before, to `clamp(3 × predicted, 600, ceiling)`, which is
  then always ≥ 1.5× predicted). If no size clears the time bar, the job is
  refused `too-long`, naming the fastest memory-qualifying size. Without
  this, caffeine sized to S with a 3600 s ceiling-clamped timeout against a
  measured single-threaded wall time of 4466 s — a timeout that could never
  succeed.
- **D2** — the Dockerfile adds `ARG GENERATOR_COMMIT=unknown` and
  `ENV JOBS_GENERATOR_COMMIT=${GENERATOR_COMMIT}` right after `FROM`; the
  image is built with `--build-arg GENERATOR_COMMIT=$(git rev-parse HEAD)`;
  the worker reads `JOBS_GENERATOR_COMMIT` from the environment in
  preference to shelling out to `git` (which the image has neither the
  binary nor a repository for). Verified in this task's smoke test:
  `meta.json`'s `generator.commit` and `provenance.generatorCommit` both
  equalled the build's `git rev-parse HEAD`.
- **D12** — `geometric` has no `linux/aarch64` wheel and builds from its
  pure-Python sdist during the image build; this is expected and was seen
  again in this task's build (~0.4 s). The base image must stay glibc ≥
  2.28 (`python:3.12-slim` qualifies; `h5py` 3.16.0 has no manylinux2014
  wheel, so an older base would not).
- **`meta.provenance.costUsd` is always `null`**; a job's actual cost lives
  on the job record (the store's ledger), not duplicated into the published
  molecule metadata.
- **The charge default comes from PubChem's SDF formal charge** (the `M
  CHG` line), not always 0 — ammonium resolves to charge +1. Spec §5.1's
  "charge defaults to 0" remains the default only for a pasted XYZ, which
  has no SDF to read a formal charge from.
- **The worker reads the canonical job from the store record**, not from a
  `job.json` fetched from S3, and writes `job.json` itself alongside the
  other result files once the job is done.
- **`/api/aws` is a path prefix, not a header** (spec §12) — the same route
  table serves both backends, distinguished by URL rather than by a header
  a proxy or cache could drop.

### Response shapes (Task 6), as finally shipped

Task 6's brief fixed the shapes 6B-2 and 6B-3 consume (preview, submit,
get, list, costs, Meter, `geometrySource`, the error envelope); they are
unchanged except for two additions from the final review:

- **`Decision.estimateFor`** — always `"fargate"`. It is part of every
  `decision.sizing` in a preview and every record's `sizing`: the size,
  `predictedSeconds` and `timeoutSeconds` are Fargate figures even for a
  local job, which this Mac runs single-threaded and with no time limit.
- **`internal-error` (HTTP 500)** — `Api.handle`'s last resort for an
  exception no route expected: `{"error": {"code": "internal-error",
  "message": "<ExceptionType>: <last line of its message>"}}`, with the
  traceback on the server's stderr. Before, the local server dropped the
  connection.

Also new on the public view: `peakMemoryGB` is present from the start
(`null` until the first heartbeat) and reset by a retry; a resumed
optimisation's `meta.json` `geometryOptimisation` carries `resumedFrom: n`
(the attempt whose last trajectory frame it started from).

### Final-review fix wave

- **I1, never stuck locally** — `LocalRunner` sweeps every `backend ==
  'local'` record (all months, via the new `Store.jobs_with_backend`) once
  at start: `QUEUED` re-queued; `STARTING`, or `RUNNING` with a heartbeat
  older than 90 s, → `FAILED worker-crashed` ("the local server stopped
  before this job finished") and settled at $0; terminal-but-unsettled →
  settled. A worker interrupted by Ctrl-C marks its own attempt `FAILED`
  (guarded) and re-raises; `cli submit --wait` catches `BaseException`
  around `run_job`, fails (guarded) and settles, then re-raises. SIGTERM is
  deliberately not caught: on AWS it is a Spot reclaim, and the retry must
  still find the job claimable.
- **I2** — PubChem bodies this phase cannot read (HTML sent with 200, a
  truncated read, reshaped JSON) are `pubchem-unavailable` 503, not an
  exception; anything else unexpected is the 500 `internal-error` above.
- **I3** — `FileStore._write` uses a unique temp file per write (same
  directory, then `os.replace`); concurrent `put_resolution` calls used to
  collide on one `<name>.tmp`.
- **I4, one runner per key** — `LocalRunner` runs nothing (and settles
  nothing) when its `QUEUED → STARTING` guarded update fails, nor fails a
  job its worker reports as a `duplicate`; `claim` refuses an attempt older
  than the record's; `cli --wait` runs as the record's current attempt.
- **M5** — `LocalRunner(grid_points=…)` forwards `--grid-points`; a
  `JOBS_SLOW=1` test runs the real `python -m jobs.worker` command on H₂.
- **M6** — `cli` gained `--charge`, `--multiplicity` and `--retry`.

### For 6B-2

- Show the preview's `geometrySource` and `existing.geometrySource` side by
  side: a name that now resolves to a different PubChem record, or an XYZ
  for a key first submitted by name, otherwise looks identical.
- The XYZ paste error for a count line with no comment line after it should
  say that is what is wrong: today the first atom is taken as the comment,
  and the error reads "the header says 3 atoms but 2 follow".
- Label the sizing "Fargate estimate" from `decision.sizing.estimateFor`.
- Handle the new `internal-error` (500) code like any other refusal: show
  its message.
- Widen the `geometryOptimisation` type (Ruling D13) with `resumedFrom?`.

### For 6B-3

- Reserve `cost(timeout + an image-pull allowance)` per attempt: spec §6.4
  bills from `pullStartedAt`, so today's `attempts × cost(timeout)`
  under-reserves by the pull time.
- `DynamoStore` implements `jobs_with_backend(backend)` or no-ops it
  (returns `[]`) if reconcile makes a start-up sweep unnecessary there.

### What 6B-3 must add behind these interfaces

- `DynamoStore`, meeting the same `Store` contract `FileStore` does
  (including the T5-a derived-meter contract tests and the T5-b attempt
  guard).
- `BatchRunner`, submitting to AWS Batch in place of `LocalRunner`'s
  subprocess.
- `S3Sink`, writing the same file set `LocalSink` does. It must clear a
  partial result root (one with no `done.json`) before re-queuing a retry —
  otherwise a retry fails forever with "already in the result folder."
- `worker --aws`, and settlement folded into reconcile.
- Carried-forward gaps from this phase's review: `costs.daily` versus
  `spentUsd` after a cross-month retry needs dated ledger entries the
  current meter does not keep; the `api` Lambda must itself enforce the
  131072-byte request body limit (`local_server` enforces it locally, but a
  Lambda in front of API Gateway cannot rely on that); and sizing version 1
  is unverified on real hardware — before trusting it, measure real
  multi-vCPU SCF speedup and file-writing-stage speedup on Fargate (the
  files term `f2·(N/1000)²` is not divided by `speedup` today because the
  Mac's grid-writing code is single-threaded regardless of vCPU count, but
  PySCF's grid/ESP code is OpenMP-threaded on Linux — this task's own
  container run saw `threads == 10` — so 6B-3 should re-measure whether the
  files term scales with vCPU count on Fargate and likely divide it by
  `speedup` there instead).

## Phase 6B-2 — the interface (2026-10-06)

Spec: `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` §9.
This phase ships the UI behind 6B-1's jobs core: the computed tier
throughout Molecules mode, the owner's request/status/provenance panels,
sign-in, and `/admin.html`. The AWS backend itself (DynamoDB, Batch, S3,
Cognito, the HTTP API) is 6B-3.

### What shipped

- **A computed tier and the `job` URL key** — `#mode=molecule&job=<64-hex
  key>` opens any computed molecule's result for anyone, with an explicit
  "no finished result yet" message before `done.json` exists, and no stale
  or blank picture left over from whatever was open before.
- **The provenance panel**, "How this was computed", on every molecule of
  either tier: method, geometry source, caveats, and — for a computed
  molecule — its input/output/geometry files, generator commit and sizing
  version, plus (owner only) the job's own wall time and cost.
- **The request panel and its preview** — a name, SMILES or pasted XYZ in; a
  ball-and-stick SVG, formula, charge, multiplicity, electron count, the
  resolved recipe and the owner's predicted time and cost out — before
  Submit ever sends anything but what was previewed.
- **Live status** — stage, latest energy (with its method), a log tail,
  elapsed time and cost, polled every 5 s while a job is `QUEUED`,
  `STARTING` or `RUNNING`, never two requests in flight for one key (even
  across an unmount and remount), each abandoned after 15 s as a passing
  "could not be refreshed", none while the tab is hidden; `DONE` opens the
  molecule by itself. The followed job is watched from `App`
  (`useFollowedJob`), not the status panel, so it still opens with the
  phone sheet folded; the request draft lives in the jobs slice.
- **Owner sign-in** — Cognito managed login with TOTP MFA via
  `oidc-client-ts` (code + PKCE), the access token kept in memory only and
  the refresh token in `sessionStorage`. Without Cognito settings the dev
  server and `/admin.html` say "not configured in this build" and the
  production viewer shows visitors no sign-in line (ruling R4-rec). A
  sign-in that does not complete is said in fixed words in a dismissible
  alert on whichever mode the return lands on, and an error answer with
  `state` goes back to the view the owner left. Only a refusal ends a
  session; a renewal that cannot reach Cognito keeps the refresh token.
- **The where-jobs-run choice** — This Mac or AWS, persisted in
  `localStorage` under `eov.jobs.target`, shared by `/` and `/admin.html`;
  a production build ignores it and always uses the deployed API.
- **`/admin.html`**, the owner's dashboard — a plain, sortable, filterable
  jobs table (predicted against actual) and a cost panel (spent, reserved,
  remaining, projected, a hand-drawn daily-spend chart, AWS's billed
  figure) — a second Vite entry whose code never reaches the main bundle,
  checked on every deploy: `infra/deploy.sh` runs
  `node tools/check_admin_split.mjs dist` after its build and refuses to
  ship on failure.

### Rulings made in this plan

- **The id carries the tier.** A computed molecule's id is its
  64-character lowercase-hex job key (a link with it upper-cased is
  lower-cased, since hex is case-blind). Library ids match `^[a-z0-9]+$`
  (no `-`, no length cap), so the pattern alone would admit a 64-hex
  library id; none exists — library ids are short names — and `isJobKey`
  is tested before any library lookup. `moleculePath(id)` chooses the base from the id alone —
  `/molecules/<DATA_VERSION>/<id>` for the library,
  `/molecules/jobs/<key>` for a job — so Phase 6's meta/basis/density/ESP
  loads, and the MO worker (handed only `recipe.moleculeId`), work
  unchanged.
- **The preview is drawn in SVG**, not a second WebGL context: it reuses
  Phase 6's bonding rule, radii and CPK colours but not its `THREE.Group`,
  renders under jsdom like the rest of the UI, and can be turned by
  dragging.
- **Ball-and-stick now covers H–Kr** (Cordero et al. 2008 radii, Jmol
  colours) — Phase 6's tables covered only the library's nine elements, and
  a computed molecule may hold any element up to krypton (spec §5.1).
- **The sign-in link sits under Share/Export**, the app's only menu row, in
  the view settings; the "where jobs run" choice sits beside it on the dev
  server.
- **`#mode=molecule&job=<key>`** is the share link — Phase 6 already names
  the mode `molecule` in links, not `molecules` (see Findings below).
- **The session is restored from the refresh token.** `OwnerAuth` copies
  `{refresh_token, scope, profile}` to `sessionStorage` after every sign-in
  or renewal; on load it seeds an in-memory `User` from that and calls
  `signinSilent()`, which takes the refresh-token grant in `oidc-client-ts`
  3.5.0. Closing the tab signs out, since the access and ID tokens never
  leave memory. **D23:** after a Cognito redirect, the default view renders
  briefly before the saved view is restored from the returned `state` —
  accepted.
- The owner's cost comes from the job record (`GET /api/v1/jobs/{key}`'s
  `actualUsd`/`reservedUsd`), never from the published molecule —
  `meta.provenance.costUsd` is always null.
- Retry rebuilds the request as XYZ from the canonical atoms (already
  rounded to 10⁻⁵ Å), with explicit charge and multiplicity, so it
  reproduces the same key without needing the original form.
- **Live verification (ruling D6).** Each live check runs a throwaway job
  server (`:8797`, temporary state and result directories) and its own
  Vite (`:5401`, started with `JOBS_LOCAL_API_URL` and `JOBS_OUT_ROOT`
  pointing at them) and its own headless Chromium, all started and stopped
  inside one foreground command — never the owner's `:5391`/`:8787` dev
  session, `tools/jobs/.state`, `tools/molecules/out`, or its Playwright
  MCP window. A real job runs end to end through this throwaway stack from
  request to `DONE`; only the figures a local job cannot produce itself
  (AWS's billed costs, in the dashboard) are stubbed. `README.md`'s
  dev-server paragraph names both environment variables.

### Layout and live-check notes

- **`/admin.html`'s cost panel sits beside the table only from 1880 px
  wide** (Task 15); narrower, it sits below the table instead. The split
  check runs in `infra/deploy.sh` after every deploy's build; run
  `npm run check:admin-split` by hand after any other build — it is the
  check that the split survives a dependency or chunking change, not a
  one-time proof.
- **A running local job shows no stage, latest energy or log tail** (Task
  12): the worker reports those from its first heartbeat, at 30 s, and most
  local jobs (water, ammonia, a single-point run) finish before that. A
  longer job, or any job on AWS, shows them throughout.
- **On a landscape phone, the legend stack already touches the molecule's
  top** (ruling T16-c) — true of Phase 6's own stack before this phase, not
  introduced by the compact tier badge, which adds no height of its own
  there.

### What 6B-3 must supply

- The four `VITE_*` values at build: `VITE_JOBS_API_URL`,
  `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN`.
- Cognito callback **and** sign-out URLs for `<CloudFront>/`,
  `<CloudFront>/admin.html`, `http://localhost:5173/`,
  `http://localhost:5173/admin.html`, `http://localhost:5391/` and
  `http://localhost:5391/admin.html`, with scopes `openid email`.
- HTTP API CORS allowing the `Authorization` and `Content-Type` headers and
  the `GET`/`POST` methods from those same origins.
- S3 result objects under `molecules/jobs/` serving `.py`, `.log` and
  `.xyz` as `text/plain; charset=utf-8`.
- **`done.json` 403 caching.** CloudFront caches an error answer for 10 s by
  default. If anyone reads a job's `done.json` through the same edge in the
  10 s before it finishes (the owner checking the share link in another
  tab, say), the DONE auto-open can get that cached 403 and say "no
  finished result yet" under a status that says Done. The client now reads
  the result once more 11 s after a DONE-triggered open that reports "not
  finished" (`useFollowedJob`); 6B-3 should still set an error-caching
  minimum TTL of 0 for 403 on `molecules/jobs/*`, so a shared link opened
  just after a job finishes is not held back either.
- **Keep the data bucket unlistable** — no `s3:ListBucket` for the
  CloudFront OAC. A missing object then answers 403. With list permission
  it would answer 404, and the distribution-wide `ErrorResponse(404 →
  /index.html, 200)` (`infra/infra_stack.py`) would turn a missing
  `done.json` into the HTML page: the loader would report "is not valid
  JSON" instead of "not finished".
- The `billing` record shaped `{ usd, through }`.
- `JOBS_AWS_API_URL` for the dev proxy.
- Keep Cognito refresh-token rotation **off** — `oidc-client-ts`'s own
  renewal timer bypasses the single-refresh guard this phase's client
  relies on for a 401 mid-session, and rotation would race it. Call
  Cognito's `/oauth2/revoke` on sign-out, since closing the tab alone only
  drops the client's own copy of the refresh token, not the token itself.

### Findings

- Spec §9.1 writes `mode=molecules`; Phase 6's own links say `molecule`.
  This plan follows Phase 6.
- Spec §9.3 names `geometrySource.name`; 6B-1 writes `title` and `query`
  instead. This plan follows 6B-1's actual shape.
- Phase 6's `LibraryExtras.geometryOptimisation` was `{converged,
  maxGradient}`; 6B-1's worker writes `{steps, converged}` (and
  `resumedFrom` on a resumed attempt). The type is widened to match, rather
  than cast around.
- Task 1 Step 3's diatomic-only probe (`caption.ts`, `orbitalSlice.ts`,
  `bonds_url.ts`, `MoDiagram.tsx`, `src/bonds/*.ts`) found nothing to
  report: every hit is either squarely inside `src/bonds/`, or
  `orbitalSlice.ts`'s `isBondsField` guard, or `caption.ts`'s
  `bondsDrawnPicture`, which returns `null` before reaching the line in
  question unless the system is a Bonds one — a molecule's own drawn
  picture can never reach it.

## Phase 6B-3 — AWS (2026-10-07)

Plan: `docs/superpowers/plans/2026-10-05-phase-6b-3-aws.md`. Spec:
`docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` §6–§12.
This phase puts 6B-1's jobs core behind AWS: the same handlers in a Lambda,
with AWS adapters behind 6B-1's interfaces (`tools/jobs/README.md`, "In
AWS"). It ran real jobs, and it refits sizing from them (version 2).

### What shipped

- **`ElectronOrbitalViewerComputeStack`** (`infra/compute_stack.py`,
  `infra/cost_guards.py`; 78 resources, first deployed 2026-10-06 23:03Z in
  139 s). It holds:
  - Batch on Fargate and Fargate Spot (Linux/ARM64): one job definition,
    with size and timeout set per job.
  - The jobs table (DynamoDB, **retained** on destroy).
  - A stack-owned ECR repository that keeps the last 5 images.
  - The `api`, `reconcile` and `billing` Lambdas.
  - An HTTP API behind Cognito (Essentials plan, TOTP MFA, token
    revocation on).
  - Cost guards: the $10/month Budget with its deny-SubmitJob action on
    the api role, four alarms, and the cost-anomaly monitor (on since this
    task).
  - Its outputs: `JobsApiUrl`, `CognitoAuthority`, `CognitoDomain`,
    `UserPoolId`, `UserPoolClientId`, `JobsTableName`, `ApiFunctionName`,
    `ApiRoleName`, `DenySubmitPolicyArn`, `WorkerLogGroup`,
    `WorkerRepositoryUri`.
- **The site stack** is unchanged except one additive `ErrorResponse(403,
  ttl 0)` (Ruling D13). The site build now carries the `VITE_*` sign-in
  settings, and sign-out revokes the refresh token (Task 10b, D11).
- **Controls:**
  - `infra/deploy.sh [all|site|compute|image|destroy-compute]`, with
    `ANOMALY_MONITOR=on|off` for the compute phases (unset keeps the
    deployed value).
  - `infra/jobs.sh pause|resume|status|api|wait`.
  - Both pin us-east-1. `infra/README.md` documents them, and the owner
    actions.
- **Worker images** pushed so far:
  - `74f9efa349cf30b4` (Task 11);
  - `06ef13d73af5ac33` (Task 12: the probe and the IAM fix);
  - `cd138f4426a4e172` (this task: sizing v2), job definition revision 3;
  - `e3b0c44298fc1c14` (a stray, from the fix wave's incident below; no
    job definition names it, and ECR's keep-5 rule will expire it);
  - `acbe94cda99aac6c` (the final fix wave, commit `ff2f9b4`, under the
    new tag recipe), job definition revision 5.

### The verdicts

- **XL (32 vCPU / 244 GB, ARM64) exists:**
  - 2026-10-05 (Task 1): ECS registered a 32768/249856 ARM64 task
    definition, and Batch accepted a Fargate job definition of that size.
    Both probes were then removed.
  - 2026-10-07 (Task 12 Step 10): the speedup probe **ran** as
    `32768 249856 FARGATE_SPOT arm64` (ECS `describe-tasks`). Branch X-A:
    `SIZES` is unchanged.
- **Fargate Spot runs ARM64 Batch jobs:** proven on 2026-10-07 by the probe
  and by the first water job, both on `FARGATE_SPOT`. Branch S-A:
  `SPOT_AVAILABLE = True`. A real Spot interruption (ethanol, below) was
  retried by Batch and finished. This is Review Focus 1, seen live.

### The first job and the ladder (Tasks 12–13, all on S = 2 vCPU / 8 GB, Spot)

| key (first 12) | molecule, recipe | v1 predicted | actual | cost |
|---|---|---|---|---|
| `22b6b939b8af` | water, single (A) | 11.7 s, 0.42 GB | 15.04 s, 0.326 GB | $0.000497 (60 s minimum) |
| `ffdaf035aee5` | benzene, single (A) | 314.9 s, 0.70 GB | 262.75 s, 6.104 GB | $0.002575 |
| — | caffeine, single (A) | 2097.4 s on M | not run: ≥ 10 min, the gate's skip | $0 |
| `df22d76f6f7a` | water, optimise (B) | 127.6 s, 0.42 GB | 23.01 s, 0.351 GB | $0.000505 |
| `2233f97f7719` | ethanol, optimise (B) | 373.7 s, 0.52 GB | 124.92 s (attempt 2, after a Spot reclaim of attempt 1 at ~4 min), 1.392 GB | $0.00323 |

- **The ladder:** $0.0068 of its $1 cap, settled to billed seconds on the
  2026-10 meter.
- **The speedup probe:** ≈ $0.109 (645 s at XL on Spot), outside the meter.
- **Water's first submit** failed `submit-failed` and was settled at $0
  (the IAM finding below). The retry ran as attempt 2.
- Every result file matched `done.json` through CloudFront, and dedupe
  returned the same record.

### Sizing version 2 (Task 14)

```
m0 0.341  m2 6.77  t0 4.84  t3 26600  g 1.5  f2 5240
speedup(c)       = min(c, 16)^0.867     (SCF)
files_speedup(c) = min(c, 32)^0.631     (the file write)
```

Fitted with `python -m jobs.calibrate --aws --probe …`. The reasoning is in
`sizing.py`'s comment and commit `13ad2f4`. Ruling T14-speedup: where the
data allow two answers, take the slower prediction, because an
under-prediction spends a timed-out attempt.

- **The SCF levels off at 16 threads.** Benzene took 92.1, 46.8, 26.6 and
  28.1 s at 4, 8, 16 and 32 threads. A plain power law (0.596) misses by up
  to 30 %. `min(c, 16)^0.867` fits within 5.2 %: −3.9 %, +1.5 %, +5.2 % and
  −2.5 % at 32, 16, 8 and 4. Under v2, L and XL are equally fast for the
  SCF, so a time-bound job takes the cheaper L unless the file write
  needs XL.
- **The file write is threaded on Linux.** It took 187.6, 105.9, 66.1 and
  51.1 s and kept improving to 32. It gets its own law: −8.1/+10.0/+6.3/
  −7.0 %. The undivided form misses by up to 2.1×. 6B-1's "single-threaded"
  premise came from macOS, whose PySCF has **no OpenMP**
  (`lib.num_threads(n)` warns and stays 1). Every local run was
  single-threaded in PySCF's own code, so a local refit cannot replace v2.
- **t3 comes from the probe, not the ladder.** S gives PySCF 6.5 GB
  (`PYSCF_MAX_MEMORY` = 80 %), so every ladder SCF ran with its
  two-electron integrals **in core**. That holds up to N ≈ 280. Caffeine
  and anything larger on S–L runs **direct**, as the probe did at PySCF's
  default 4000 MB. Its benzene SCF ran ~3× slower than the ladder's, so its
  t3 (26 600) beats the ladder's (9 050), as the slower prediction. t0 is
  the ladder's intercept.
- **Memory is fitted on the working set.** Benzene's 6.1 GB peak on S is
  5.4 GB of in-core integrals that PySCF took only because they fitted.
  Fitting raw peaks gave `m2` 79, which would have refused C₆₀-scale
  molecules as too large. `calibrate` subtracts the integrals
  (`incore_eri_gb`) and adds the probe's direct-mode peaks (0.9 GB).
  **Admin view caveat:** a small molecule's peak on AWS will read well
  above its prediction. That is opportunistic, not a misfit.
- **Guards** (Task 14's list): only `g` fired. It was fitted at −0.175 (the
  ladder's few optimisation steps ran faster than the rule predicts), so it
  stays at 1.5. Nothing else needed a guard.
- **Checks** (`tools/jobs/tests/test_sizing.py`):
  - every ladder job's wall time is at most `TIME_HEADROOM` × its v2
    prediction. On S, water single is 1.02× and the others are 0.19–0.65×
    (ethanol is checked against a 270 s floor for an uninterrupted run);
  - the probe's SCF and file write are predicted within 15 % at every
    thread count. The worst is the files term at 32 and 4: −12.3 % and
    −11.3 %.

| | v1 | v2 |
|---|---|---|
| water single | S spot 11.7 s, 0.42 GB | S spot 14.7 s, 0.36 GB |
| water optimise | S spot 127.6 s | S spot 122.1 s |
| ethanol optimise | S spot 373.7 s, timeout 1121 s | S spot 414.5 s, timeout 1244 s |
| benzene single | S spot 314.9 s, 0.70 GB | S spot 421.5 s, 0.86 GB |
| caffeine single | M spot 2097 s, 1.82 GB, reserve $0.1848 | M spot 2276 s, 2.89 GB, reserve $0.1848 |
| caffeine optimise | L on-demand 3658 s, reserve $1.52 | L spot 3417 s, reserve $1.45 |
| C₆₀ single | too-long (8.9 h on XL) | too-long (11.7 h on XL) |
| C₆₀ optimise | too-long (54.6 h) | too-long (102 h) |

**Redeployed 2026-10-07:**

- `deploy.sh image` pushed `cd138f4426a4e172`. `ANOMALY_MONITOR=on
  deploy.sh compute` then finished UPDATE_COMPLETE in 30 s: job definition
  rev 3, the three Lambdas, and the monitor and its subscription created.
- The user pool is unchanged, so no owner re-enrolment is needed.
- Previews through `jobs.sh api` answer `version 2`:
  - water: S, Spot, 14.7 s, 600 s timeout, reserve $0.01788;
  - caffeine: M, Spot, 2275.5 s, 3600 s timeout, reserve $0.184761.
- ECR holds 3 images.
- `aws ce get-anomaly-monitors` lists `electron-orbital-viewer` (CUSTOM,
  tag `app`) with an IMMEDIATE subscription, beside the account's own
  `Default-Services-Monitor`.
- No job was submitted.

### Findings

- **SubmitJob with tags needs `batch:TagResource` on the job definition
  (and the queues), not only on `job/*`** (Task 12). The first real submit
  was refused `AccessDeniedException … batch:TagResource on …
  job-definition/…`. moto does not evaluate IAM, so no unit test could
  catch it. Commit `6cd136b` grants it on this stack's own job definition
  and queues, with a synth test. Any future action that tags on create
  needs the same check against real AWS.
- **D11 verified live:** after the owner's sign-out, CloudTrail shows
  `Revoke_POST` then `Logout` (2026-10-07 11:28Z), and Cognito's discovery
  lists `revocation_endpoint`.
- **Per-host speed varies.** Benzene's file write took 206 s at 2 threads
  on S, but 187.6 s at 4 threads on the XL host. So a 2→4 vCPU step across
  hosts can gain far less than the probe's own 4→8. v2 anchors t3 and f2 on
  the slower (probe) host, and over-predicts on S as a result.
- **The optimisation step count over-predicts.** `10 + 2·atoms` gives 16
  for water, which converged in 3. This is safe, but optimise
  reservations run ~3–5× high.

### The rulings

From the plan:
- ECR is stack-owned (keep the last 5), pushed by `deploy.sh`, and not a
  CDK asset.
- Attempt numbers rise across owner retries (`JOB_ATTEMPT_OFFSET`).
- A `RUNNING` record whose Batch job is waiting again is a Spot retry in
  progress, not stale.
- After 30 min in `RUNNABLE`, a job is terminated as `FAILED no-capacity`
  and settled at what ran, unless the wait is the app's own: see the
  final-review fix wave below (I1).
- The stale-jobs alert is reconcile publishing to SNS (no log metric
  filter).
- The budget is account-wide, and the anomaly monitor is a tag (`app`)
  monitor.
- The `billing` figure is month-to-date `UnblendedCost` by both tags.
- `PYSCF_MAX_MEMORY` is 80 % of the size's memory.
- Cognito uses the Essentials plan with managed login.
- The jobs table is retained on destroy.
- `jobs.sh api` invokes the Lambda with the owner's IAM credentials.

From the ledger:
- **D:** every preflight D-row's fix is adopted unless overruled.
- **D13:** one additive site-stack 403 ErrorResponse with TTL 0.
- **D14:** the anomaly monitor is gated behind `-c anomalyMonitor=on`, off
  until the tags are active.
- **D15:** a speedup probe replaces the XL `--help` smoke.
- **D16:** the charges ledger is fixed now; `costs.daily` is by charge
  date.
- **D11:** the refresh token is revoked on sign-out (Task 10b).
- **AWS-auth:** the owner's "do both" authorises the plan's AWS writes
  within its caps.
- **no-parallel-implementers:** never two implementers in one worktree.
- **T5-D28:** a batch-lost run is charged what the worker reported.
- **D8-IAM:** the worker's prefix-conditioned `s3:ListBucket` was dropped,
  since S3Sink maps 403 to missing.
- **T10-anomaly:** an unset `ANOMALY_MONITOR` keeps the deployed value.
- **T4-trailer:** commit trailers name the model that wrote the commit.
- **T14-speedup:** saturating SCF law; the files term divided by its own
  law; f2 refitted; the slower prediction where the data are ambiguous.

### Owner actions

- **Done 2026-10-07:**
  1. SNS subscription confirmed.
  2. Sign-in created; password and TOTP enrolled.
  3. Cost-allocation tags `app`/`component` Active (by CLI, on the
     owner's go-ahead), and the anomaly monitor turned on at this task's
     redeploy.
- **Open:** Task 12 Step 8's browser check (the `/admin.html` row and the
  water share link in a private window). It was asked on 2026-10-07; its
  outcome is not in the ledger.
- **After any `destroy-compute` and redeploy, repeat actions 1–2:** the
  user pool and SNS subscription are new, and the old authenticator entry
  stops working. Turn the monitor on again with `ANOMALY_MONITOR=on`.
  Also run `deploy.sh site`, since the live site keeps the deleted
  stack's sign-in settings until it is rebuilt.
- **The retained jobs table:** `destroy-compute` keeps the old table, with
  its history and meters. It is auto-named, so a redeploy creates a new,
  empty table. A redeploy in the same month starts the meter at $0 again,
  so it does not count what the month has already spent. The $10 Budget,
  with its deny-SubmitJob action, is then the only stop on a second
  $8.80.

### Spec and 6B-1 corrections found here

- Spec §6.6's literal stale rule ("heartbeat older than 5 minutes while
  Batch says it is not running") would fail every Spot retry. Settled as
  in the rulings.
- 6B-1's `requeue_failed` kept the original `month`. The controller
  corrected both plans so a retry is charged to the month it is made in.
- `cdk.context.json` is ignored, because the repo is public.
- 6B-1's "the files term is single-threaded" was a macOS artefact (no
  OpenMP). On Linux it divides by a speedup (above).

### Residual minors (deferred, recorded in the ledger)

- `s3_sink.content_type`, for a name without a `.`, slices the last
  character. The result is a harmless default.
- The worker's accept-existing DONE records the checking attempt's
  `wallSeconds`. `_check_complete`'s listed-check covers `RESULT_FILES`
  only, though the hash loop covers everything listed.
- Reconcile's outcome label can describe a refused write (the
  no-capacity/ENDED race). The money is still right.
- `handlers.py`'s `runnerJobId` write after submit is unguarded. A submit
  slower than 600 s would have left that run uncharged; since the final
  fix wave (M2) the worker records its own Batch job id at claim, so only
  a run whose worker also failed that write waits a day for `batch-lost`.
- `billing_handler` builds its store per invocation (daily, negligible).
- The `costalerts.amazonaws.com` publish grant on the topic sits outside
  the D14 gate. It is moot now that the monitor is on, and since the final
  fix wave (M6) it requires `aws:SourceAccount` = this account.
- The probe's budget does not re-double `last` after a skip. That only
  matters for custom thread lists.

### Final-review fix wave (2026-10-07)

The whole-branch review (`.superpowers/sdd/2026-10-05-phase-6b-3-aws/final-review.md`,
"With fixes": 2 Important, 9 Minor) and the Task 14 review's three minors were
fixed together. Behaviour that changed:

- **I1, no-capacity counts our own queue.** Each compute environment holds
  32 vCPU (`batch_runner.MAX_VCPUS`, which `compute_stack.py` now imports),
  so one XL fills a queue. Before failing a job that has waited 30 min,
  reconcile sums the vCPUs of this app's own jobs on the same capacity that
  are `RUNNING` or queued ahead of it. If that plus the job's own vCPUs
  passes the cap, the job waits on (outcome `waiting-own-jobs`, no alert).
  Its clock restarts when one of our jobs on that queue ends. Jobs behind it
  never count, so two waiting XLs cannot excuse each other for ever: the one
  ahead is judged on AWS alone. The no-capacity message now names AWS
  capacity or the account's Fargate quota, and says our own jobs were not
  holding the queue.
- **I2, the worker's image tag leaves out documentation.** `image_tag` and
  `.dockerignore` both exclude `tools/jobs/**/*.md`. That is a recipe
  change, so HEAD's tag differs from every earlier one. `deploy.sh compute`
  now **refuses** when ECR lacks the tag it would name; `all`, or `image`
  then `compute`, is the way. `image_tag` also refuses when git cannot list
  the inputs, and `push_image` reads the commit before building (see the
  incident below). Sourcing `deploy.sh` only defines its functions.
- **M1, M2, a record without a Batch job id.** The worker writes
  `AWS_BATCH_JOB_ID` as `runnerJobId` at claim where none is
  (`Store.note_runner_job_id`, both stores). The api's id write is outside
  the submit's `except`, so failing to write it is a 500, not
  `submit-failed`. Reconcile settles a `FAILED`/`DONE` record with no id
  that was never settled (after the 10-minute grace, at what its worker
  reported), and leaves a `RUNNING` record without one for a day.
  `submit-lost` now says "no AWS Batch job was recorded", which is what it
  knows.
- **M3, expected refusals are 4xx.** `paused` is 409 (was 503) and
  `pubchem-unavailable` 424 (was 503), so the `Api5xx` alarm keeps
  threshold 1 and means a fault. PubChem's per-call timeout is 6 s (was
  10), so a resolution's three calls fit in the api Lambda's 29 s.
- **M4–M6, infra hardening.** The billing role's `PutItem`/`GetItem` carry
  `LeadingKeys BILLING#*`. The budget counts spend before credits and
  refunds. The alert topic lets `costalerts` publish only with
  `aws:SourceAccount` = this account, and EventBridge only for the
  `BatchFailed` rule (`aws:SourceArn`); that rule now uses its own target,
  since `SnsTopic`'s grant had no condition.
- **M7, admin links.** A failure recorded for a worker that was stopped
  (reconcile's `timed-out`, `out-of-memory`, `spot-interrupted`,
  `worker-lost`, `batch-lost`, `batch-failed`, and a local
  `worker-crashed`) shows no attempt links unless the worker reported it
  itself (`actual` set).
- **M8:** the root README's deploy section points to `infra/README.md`.
- **M9, cache headers.** Root result files are `no-cache`; only `done.json`
  is `immutable`. A partial root may be cleared and rewritten (D7), and a
  file fetched in between would otherwise sit at the edge for a year.
  CloudFront and browsers now revalidate root files by ETag.
- **Recommendation 5:** once a day (the sweep in 00:00–00:15 UTC) reconcile
  also scans every month for unsettled records.
- **Task 14 minors:** `test_sizing.py` checks that `HEADROOM` × predicted
  memory covers every AWS sample's working set. The caffeine and XL lines
  under "What 6B-4 inherits" are corrected.

**Incident during this wave (2026-10-07 12:55–13:00Z).** The first draft of
`test_deploy_script.py` sourced `deploy.sh`, whose phases then ran as `all`
with the real AWS credentials. It ran from the infra venv's x86_64 Python,
under which `/usr/bin/git` fails on Apple silicon, so:

- `image_tag` hashed an empty listing, and an image tagged
  `e3b0c44298fc1c14` (the empty string's hash, with an empty
  `GENERATOR_COMMIT`) was built from the working tree (`37435e9`'s worker)
  and pushed at 12:57:43Z.
- `deploy compute` updated the compute stack at 12:58:56–12:59:30Z: job
  definition rev 4 on that image, and `37435e9`'s Lambdas and infra. The
  anomaly monitor stayed on.
- A site deploy had started when the processes were killed at about
  13:00Z. The site stack did not change (still `UPDATE_COMPLETE` from
  11:36Z).
- The owner's caffeine job (started 12:54Z on rev 3) was not touched.

The fixes above make this impossible to repeat: the guard, the checked git
calls, and the test's failing `aws`/`docker`/`cdk`/`npm` stand-ins.

**Deployed 2026-10-07 13:10–13:16Z** with `infra/deploy.sh all`
(`ANOMALY_MONITOR` unset, so it stayed on):

- The image `acbe94cda99aac6c` was pushed, with `GENERATOR_COMMIT` `ff2f9b4`.
- Compute was `UPDATE_COMPLETE`: job definition rev 5 on that tag, and the
  api Lambda's `JOB_DEFINITION` names rev 5.
- The site was `UPDATE_COMPLETE`. The live `index.html`, `admin.html` and
  admin bundle hash the same as `dist/`.
- Checks:
  - 401 without a token, with a POST, and with a forged token.
  - The site's CORS preflight answers 204 with its origin. A foreign
    origin gets no allow-origin. Managed login answers 200.
  - No NAT gateways, and the four alarms are `OK`.
  - `jobs.sh status`: generation enabled; meter spent $0.0068, reserved
    $0.1848 (the owner's caffeine job).
  - A water preview answers sizing version 2: S, Spot, 14.7 s, 600 s,
    $0.01788.
  - The budget's CostTypes have IncludeCredit and IncludeRefund false.
  - The topic policy carries both conditions.
  - The anomaly monitor and its subscription are present.
- The owner's caffeine job (`f4e66d73…`, M, Spot, rev 3) was `RUNNING` in
  `SCF (DIIS)` throughout, with heartbeats fresh at 13:17Z. Nothing
  touched it.
- No job was submitted.

### What 6B-4 inherits

- **Recipe C** (spec §4) is 6B-4's. The handlers, sizing and worker
  extend to it as they did for A and B.
- **Caffeine single on M is the first owner job worth running.** It is
  predicted at 38 min Spot, reserving $0.18. It would give the first
  direct-SCF point from a real job, and the first M (4 vCPU) timing,
  which the ladder never reached. Refit (version 3) once a few such jobs
  exist. Pass the probe again (`--probe`), or the deployed laws are kept.
- **Still unmeasured:**
  - the 2-thread probe point (budget-skipped);
  - `g` (no optimisation long enough to fit it);
  - the SCF's saturation for molecules much larger than benzene, which
    may scale further than 16;
  - XL holding caffeine-scale integrals in core, so running faster than
    predicted (safe). Only XL can: caffeine's N is 614 at def2-TZVPD, and
    its 133 GB of integrals fit under PySCF's 80 % share of XL's 244 GB
    but not L's 64 GB (`calibrate.incore_eri_gb`).
- **The thinnest timeout margin is caffeine single on M:** predicted
  2275.5 s, with its timeout clamped to the recipe's 3600 s ceiling, so
  1.58× rather than `TIMEOUT_FACTOR`'s 3×. It is the first owner job
  worth running (below), and the one most likely to time out if v2
  under-predicts direct SCF on M.
  **Measured 2026-10-07** (the owner's run, `f4e66d73…`, M Spot, one
  attempt): DONE in 3135 s, 87 % of the timeout. The SCF took 2289 s
  (v2's whole-job prediction was 2276 s, so the SCF alone was on the
  mark) and writing files 847 s, which v2 under-predicts on M. Peak
  memory 1.9 GB of 16. Cost $0.052962 against $0.184761 reserved. A
  sizing v3 refit that adds this sample (it raises the files term) is the
  first follow-up; until then, caffeine-scale single points on M sit
  close to the 1 h ceiling.
- **The expensive molecules** (C₆₀ and larger drugs) stay the owner's to
  start, from the UI. C₆₀ is refused too-long under both versions at this
  phase's 1 h / 2 h ceilings, so raising the ceilings is a 6B-4 ruling,
  not a sizing fix.
- **The meter after a same-month destroy and redeploy** (above). A
  persistent table name, or carrying the month's meter forward, would
  close the gap if it matters.

## Judgment calls made without asking

Recorded for review, per the session's standing authority.

1. **Went further than "isolate a subshell" on item 1.** The stated fix does
   not make iron's five 3d orbitals readable, because they are the blob. Added
   per-orbital shading within an isolated subshell, with the mₗ buttons as its
   legend.
2. **Fixed two colour bugs and one narrow-layout bug found while verifying**,
   rather than only noting them. All three defeat features the spec asks for.
3. **Periodic-table block comes from table position, not configuration** —
   see "Decisions" above.
4. **A lanthanide's highlighted column is the actinide below it.** The
   detached rows have no IUPAC groups; the vertical analogy is the real one.
5. **Added `displayRadius` rather than changing `contourRadius`.** The
   contour is a quantity the UI makes claims about; widening it would have
   made those claims false.
6. **Accepted the compressed heavy-atom core** (see item 5 above) rather than
   introducing a non-linear radial mapping.
7. **Did the work in this session rather than dispatching subagents.** The six
   items share state across `atom_profile.ts`, `shell_view.ts`,
   `OrbitalViewer.tsx` and `App.tsx`, and three of them turned on defects only
   visible while driving the app; handing that back and forth would have cost
   more than it saved. The subagent guidance below still stands for whoever
   continues.
8. **Left `ViewMode = 'hydrogenic'` as the stored value** after the rename. It
   names the model, not the label.
9. **"A default view per element" is derived, not tabulated.** The ask was to
   "set one up for each of the elements"; 118 hand-tuned presets would be
   118 things to keep true as the renderer changes. Picking an element
   instead restores the canonical camera angle, frames on that atom's own
   `displayRadius`, and turns the cut on and centres it — which is the
   element-specific part, since the framing radius comes from that element's
   own solve. Opacity and enclosed fraction are left alone: the user set
   those deliberately and they are not per-element.
10. **Removing Low and Medium left nothing to choose, so the control went
   too**, rather than leaving a one-option toggle.

---

## Backlog

### Not started
- **Relative atomic size** (Addendum 2 §4) — the last of the four "what makes
  atoms different" items, and the one the spec marked "only if it earns its
  place". The scale bar carries it; nothing draws attention to it. With
  `displayRadius` now tracking the valence shell, a size comparison against
  the previously selected element would be cheap and would finally make the
  contraction-across-a-period, jump-at-a-new-one pattern visible.
- **STL's union outer shell** (Phase 2 follow-up) — marching cubes on
  max_i f_i across a shell's lobes or an overlay's members, in a worker, as
  an additional export alongside the current per-member one, so a strict
  external manifold checker (trimesh, Netfabb) inspecting the file as one
  body does not warn on it. See "Phase 2 — share and export" above.
- **`ScfOptions.startingPotential` exists; do not seed an excited state
  from its neutral ground state** (final review I2, measured). Started from
  potassium's converged neutral potential, K 4s → 4d "converges" in 39
  iterations to −904 Ha with a 4d eigenvalue of −168 Ha: a neutral atom's
  LDA potential has no Coulomb tail, binds no diffuse 4d, and the radial
  solver returns a state anyway. C 2s → 3d, Na 3s → 3d and He 1s → 2p do the
  same; the spin-polarised He 1s → 2s collapses its 2s onto the 1s. The
  option is for Phase 4's relativistic solve, started from the *same*
  species' non-relativistic one. K 4s → 4d therefore still does not
  converge, and says so by name.
- **Twelve offered excitations have a negative ΔSCF energy, and say why**
  (final review, ruling FR-1). LDA over-binds d relative to s, so it puts
  these "excited" configurations below the ground one they start from;
  measured by the Z ≤ 56 sweep (`ATOM_SLOW_TESTS=1`,
  `tests/atom/excitation_sweep_*.test.ts`), picture = restricted total-energy
  gap, energy = the spin-polarised ΔSCF shown on screen:

  | Excitation | picture | ΔSCF energy |
  | --- | --- | --- |
  | Ti 4s → 3d | above ground | −0.311 eV |
  | V 4s → 3d | above ground | −1.209 eV |
  | Mn 4s → 3d | 0.025 Ha below | positive |
  | Fe 4s → 3d | 0.042 Ha below | positive |
  | Co 4s → 3d | 0.058 Ha below | −0.720 eV |
  | Ni 4s → 3d | 0.075 Ha below | −1.572 eV |
  | Y⁺ 5s → 4d | 0.005 Ha below | −0.655 eV |
  | Zr 5s → 4d | above ground | −0.376 eV |
  | Tc 5s → 4d | 0.058 Ha below | −0.634 eV |
  | Ru 5s → 4d | 0.031 Ha below | positive |
  | Rh 5s → 4d | 0.055 Ha below | −0.704 eV |
  | Ba⁺ 6s → 5d | 0.001 Ha below | positive |

  A negative energy is shown with "below the ground configuration in LDA —
  a known LDA error for s→d transfer" (`BELOW_GROUND_NOTE`, on screen and
  in the CSV comment). The only offered species for Z ≤ 56 that does not
  converge is K 4s → 4d; its energy line says the energies were not
  computed because the picture's SCF did not converge (ruling FR-2).
- **Which heavy species do not converge, and why** (ruling C11's slow
  sweep after Task 7's fix round; `ATOM_SLOW_TESTS=1
  tests/atom/relativistic_heavy_sweep_*.test.ts`: all 1,812 offered species
  for Z = 55..118, every ion and excitation, in scalar mode and without
  relativity, plus the 64 neutrals with spin-orbit). Every outcome that is
  not "converged" is pinned in the sweep's `KNOWN_FAILURES`, both ways, so
  this list cannot drift from the code. Everything else converges -- Tm and
  Yb with spin-orbit included.

  *An honest LDA verdict, shown as such* ("Scalar-relativistic SCF for
  Samarium, excited 6s → 4f: the promoted 4f electron is not bound",
  `UnboundElectronError`, ruling T7-b): the promoted f electron leaves the
  bound spectrum during the self-consistent iterations and does not come
  back, from either start.

  | Excitation | Mode | Elements | Why |
  | --- | --- | --- | --- |
  | 6s → 4f | off and scalar | Pr, Nd, Pm, Sm, Eu (5) | unbound even without relativity: halving the mixing down to 1e-4 still pushes the 4f out. Until this round the Schrödinger solver handed back a 4f at −192 Ha here and the SCF "converged" around it -- drawn in off mode since Phase 3, and the warm seed and dashed baseline in Phase 4 |
  | 6s → 4f | scalar | Ce, Tb, Dy, Ho, Er, Tm (6) | the 4f is bound by only 3–66 mHa without relativity; the scalar shift (about +0.1 Ha for a 4f) unbinds it |
  | 7s → 5f | scalar | Pu, Am (2) | the 5f is bound by 0.10 and 0.12 Ha without relativity; the scalar shift of the 5f across these excitations is +0.13 (Pa) to +0.24 Ha (Md), about +0.17 Ha here |

  The spin-polarised ΔSCF energies of Pr, Nd, Eu and Tb–Er 6s → 4f give
  the same verdict (they "converged" on garbage or ran out of iterations).

  *Unbound anions* (`UnboundAnionError`, as since Phase 3): Pb⁻, Bi⁻, Po⁻,
  Po²⁻ in both modes; At⁻ only with scalar relativity -- it holds its 6p
  without relativity and loses it with. How each verdict is reached
  differs, and the relativistic ones are weaker than they read (final
  review I2):

  - Pb⁻, Bi⁻, Po⁻ and Po²⁻ in scalar and spin–orbit are **inherited**, not
    separately solved: they are unbound without relativity, the
    relativistic solve's warm start (`convergedNonRelativisticPotential`)
    rethrows that verdict, and no relativistic SCF runs. The same holds for
    every lighter anion this LDA does not bind (H⁻, C⁻, O⁻, O²⁻, F⁻, Si⁻,
    P⁻, S⁻, S²⁻, Cl⁻, Ge⁻, As⁻, Se⁻, Se²⁻, Sn⁻, Sb⁻, Te⁻, Te²⁻) when a
    relativistic mode is forced on.
  - At⁻ (scalar, its default; and spin–orbit), and Br⁻ and I⁻ when a
    relativistic mode is forced on, are bound without relativity (HOMO
    −12.5, −2.1 and −9.9 mHa, measured) and are reported unbound by ruling
    C12's **non-relativistic** bound-state check of the relativistic SCF's
    potential in its first iterations, not by a relativistic eigenvalue.
    For a p electron the scalar equation binds slightly more than the
    Schrödinger one in the same potential, so these three verdicts could
    be an artefact of the approximation; nothing here measures that.

  The verdict names the mode and the species in a relativistic mode
  ("Scalar-relativistic SCF for Astatine ion At⁻: LDA does not bind this
  anion: …"), and the converged anion's final check on the relativistic
  eigenvalues names the j-level with spin–orbit; off keeps its bare
  sentence.

  *What converges now that did not* (rulings T7-a, T7-c): 16 species whose
  relativistic solve, warm-started from the non-relativistic potential,
  found a barely bound f level pushed out in its first iterations, while a
  cold (screened) start converges: Tm and Yb with spin-orbit (their own
  4f⁷⁄₂), 6s → 5d of Pr, Nd, Ho, Er, Tm, Yb (the 4f), and 7s → 5f of Pa, U,
  Np, Bk, Cf, Es, Fm, Md (the 5f, which ends bound by only 2–42 mHa).
  `solveSpecies` now retries from the screened start whenever the warm
  start throws or does not converge. Task 7 had recorded all 29 failures as
  the solver not finding states "once the mass-velocity/Darwin terms are
  in"; that was wrong on both counts: 16 were the missing fallback, 13 are
  physics.

  *Still a solver limitation*: none in the sweep. A `StateNotFoundError`
  (the radial solvers' "too small to hold …, or the potential does not bind
  it" and containment messages) now reaches the user only for a level the
  node count says *is* bound and the search still cannot find. The search
  can still bracket a false root at a discontinuity of its mismatch (one
  was measured for Pu 7s → 5f, mid-SCF, at −10.1 Ha); the node-count check
  catches it, and for Pu the level was not bound anyway.

  Off mode is otherwise untouched, measured over all 3,146 offered species
  (Z = 1–118, old code against new): restricted, 3,119 identical bit for
  bit (total energy and iteration count) and 22 anions with identical
  verdicts; spin-polarised, 3,117 and 22 likewise. Phase 3's own Z ≤ 56
  sweep is unchanged, its 12 below-ground excitations included.
- **Phase 4 must thread relativity into the worker's neutral reference
  solve, not only the selected species' own solve** (Phase 3 follow-up).
  The reference ring and the camera's framing floor both come from solving
  the neutral atom a second time inside `atomWorker.ts`; if that second
  solve stays non-relativistic while the main solve gains `rel`, the two
  will silently stop agreeing on what "the same element, unexcited" looks
  like — a relativistic ion compared against a non-relativistic neutral
  reference.

### Known, accepted, not scheduled
- `prefers-reduced-motion` for the level transitions is verified at unit
  level and by code review, but not live — the browser tooling had no hook to
  set the media feature.
- The cross-fade renders the scene twice for ~350 ms.
- A busy SCF worker queues behind an abandoned slow solve. Correctness is
  preserved by request id; latency in that narrow case is not.

---

## Process notes for whoever continues

**Subagents must run commands in the foreground.** A subagent that backgrounds
a long command and ends its turn is stranded permanently — the completion
notification routes to the parent session, not to it. Two agents were lost
this way before the cause was found. Always state this in a dispatch, along
with expected durations so a multi-minute foreground wait reads as normal.

**Expensive SCF sweeps are gated behind `ATOM_SLOW_TESTS=1`.** The default
suite is ~60 s (floored by `tests/orbital_presets.test.ts`, ~60 s on its own
worker). The two exhaustive sweeps -- `excitation_sweep_<k>` (80 shards,
Z ≤ 56) and `relativistic_heavy_sweep_<k>` (80 scalar + 3 spin-orbit
shards, Z ≥ 55) -- are left out of the default run by `jest.config.ts`
rather than merely skipped, and each is hours of worker time. Run them in
batches that fit a ten-minute foreground command, e.g.
`ATOM_SLOW_TESTS=1 npx jest --maxWorkers=7 "relativistic_heavy_sweep_(15|16|17|18|19|20|21)\.test"`
(7 heavy shards ≈ 8 min, 8 excitation shards ≈ 8 min on a 10-core
machine). Each shard checks its outcomes against its sweep's
`KNOWN_FAILURES` both ways; update the list and this file together. The
rest of the slow set (NIST, warm/cold, SCF, ΔSCF) is ~12 min. Jest runs
the solver about 3.5× slower than plain node (measured: Au scalar 14 s
under jest, 3.9 s bundled with esbuild); for exploratory sweeps a bundled
script is the faster tool. `relativistic_nist.test.ts` logs the cost of a
seeded scalar platinum solve against the non-relativistic one instead of
asserting it (wall-clock ratios under parallel workers are not a stable
test): measured 8.1 s against 6.8 s, ratio 1.18, budget ~3. Do not un-gate
them.

**A jest worker SIGSEGV has now been seen three times during a full run**
(`atom_worker_contract.test.ts` once in Phase 2, `delta_scf.test.ts` once
more and `atom_worker_contract.test.ts` again during Phase 3) — always
passes alone or on an immediate rerun, never yet reproduced in isolation.
Not root-caused. If it recurs, try bounding `workerIdleMemoryLimit`/
`maxWorkers` in the jest config before assuming a real regression in the
code under test.

**A test that needs a real store builds one with `createAppStore()` (or
reuses its `SERIALIZABLE_CHECK`), never a bare `configureStore`.**
(`src/store/index.ts`.) A plain `configureStore` is missing production's
serializable-check exceptions for the typed arrays an atom profile and a
numerically-sourced orbital's `radialSamples` carry by design, so it prints
a console.error for every `solveSucceeded` or `startOrbitalCalculation` a
test dispatches — real noise that was masking real warnings until Phase 2
swept the suite to zero. Keep it at zero.

**Adding a URL key for a later phase/mode:** call `registerUrlKeys(mode,
encoder, decoder)` for a brand-new mode (`src/url_state.ts`), or fold a new
key into an existing encoder/decoder pair (`encodeViewKeys`/`decodeViewKeys`
for a key every mode should carry, `encodeAtomKeys`/`decodeAtomKeys` or
`encodeBasicKeys`/`decodeBasicKeys` for a mode-specific one). Either way, add
a case to `tests/url_state.test.ts`'s round-trip property test (the `Shape`
union and `randomView`'s `it.each`) so the new key is swept by the same
seeded-PRNG property every existing key is, rather than only unit-tested in
isolation.

**Verify in the live app, not only in tests.** Every serious defect in this
project was invisible to a green suite, and this session added four more to
the list:
- Numerov tests used a constant `g`, under which a correct implementation and
  a deliberately broken one produce byte-identical output
- A grid-extent bug returned a 41 % wrong energy with 1084 tests passing
- Argon rendered 21× too small with 1260 tests passing
- The profile cache never had a hit in the running app, while a test measured
  it at 3210 ms → 0.001 ms — because the test never crossed the worker boundary
- Every radial-plot curve drew blue while a test asserted the `stroke`
  attribute the browser was overriding with CSS
- The valence shell was outside the drawn sphere for 34 of the first 56
  elements, with an acceptance test for ring contrast passing throughout
- The radial plot was entirely hidden behind another panel on a phone
- Re-picking the current element hung the app in a permanent solving state,
  with every solver test passing
- Ruthenium's 5s rendered as a faceted block at a third of its size, with the
  composition view's own tests green throughout
- The level-2 subshell panel was off-screen on a phone in both directions at
  once, and in landscape the plot sat on top of the controls sheet

Corollary, learned the hard way this session: **checking one narrow width is
not testing a phone.** The first pass resized to 420px and confirmed the
selector swapped; the real defects only showed at a true 390x844 with touch,
and again on rotation.

The pattern: unit tests validated the functions and nothing validated the
system. Drive the app.

**Deployment:** `./infra/deploy.sh` builds and pushes to S3 + CloudFront.
