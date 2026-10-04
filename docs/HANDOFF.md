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
the running app. The app now has two modes:

- **Atom mode** (default) — real neutral atoms, Z = 1…118, from a
  self-consistent-field calculation, chosen off a periodic table. Three
  levels: atom → shell → orbital, with core/valence distinguished at the atom
  level and per-subshell isolation at the shell level.
- **Basic Orbitals mode** — the exact one-electron viewer, fixed at Z = 1.

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
