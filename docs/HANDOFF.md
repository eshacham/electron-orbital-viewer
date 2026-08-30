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

~1405 tests, `npm run build` clean, `npx tsc --noEmit` clean. Deployed.

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

## Known limits of the model — quantified, and stated in the README

Relativistic error scales roughly as Z². Measured against NIST's ScRLDA:

| | error vs relativistic |
| --- | --- |
| Ne 1s / 2s / 2p | 0.032 % / 0.250 % / 0.097 % |
| Au 1s | 9.0 % |
| Au 5d | 16.1 % |
| **Au 6s** | **26.9 %** |

So: sub-1 % through krypton, ~1–2 % at xenon, 10–27 % from gold. Gold's 6s
error is exactly the effect that makes gold yellow.

The *visual* content is far more robust than the numeric: orbital shapes,
node counts, shell topology and occupancy are exact at any Z; only energies
degrade.

**Planned v2 is scalar-relativistic (Koelling–Harmon)** — roughly 150 lines
against one modified ODE, reusing the same shooting method and plugging into
the same `RadialState` interface. It would take gold's 6s from 27 % to under
1 %.

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

---

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

---

## Backlog

### Not started
- **Relative atomic size** (Addendum 2 §4) — the last of the four "what makes
  atoms different" items, and the one the spec marked "only if it earns its
  place". The scale bar carries it; nothing draws attention to it. With
  `displayRadius` now tracking the valence shell, a size comparison against
  the previously selected element would be cheap and would finally make the
  contraction-across-a-period, jump-at-a-new-one pattern visible.
- **Scalar-relativistic v2** (see "Known limits").

### Known, accepted, not scheduled
- `prefers-reduced-motion` for the level transitions is verified at unit
  level and by code review, but not live — the browser tooling had no hook to
  set the media feature.
- The cross-fade renders the scene twice for ~350 ms.
- A busy SCF worker queues behind an abandoned slow solve. Correctness is
  preserved by request id; latency in that narrow case is not.
- With `clipAxis` inherited as `'none'` at atom levels 1–2, no cut-away button
  shows pressed and the position slider stays hidden until X/Y/Z is clicked.
  The view renders correctly regardless.
- Level 3 frames the camera on the sampling box (the 99.99 % radius), not on
  the visible contour, so a diffuse orbital sits smallish in frame. Shared
  with Basic Orbitals mode and unchanged from before.

---

## Process notes for whoever continues

**Subagents must run commands in the foreground.** A subagent that backgrounds
a long command and ends its turn is stranded permanently — the completion
notification routes to the parent session, not to it. Two agents were lost
this way before the cause was found. Always state this in a dispatch, along
with expected durations so a multi-minute foreground wait reads as normal.

**Expensive SCF sweeps are gated behind `ATOM_SLOW_TESTS=1`.** The default
suite is ~57 s; the full set is ~2 min. Do not un-gate them.

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
- The level-2 subshell panel was off-screen on a phone in both directions at
  once, and in landscape the plot sat on top of the controls sheet

Corollary, learned the hard way this session: **checking one narrow width is
not testing a phone.** The first pass resized to 420px and confirmed the
selector swapped; the real defects only showed at a true 390x844 with touch,
and again on rotation.

The pattern: unit tests validated the functions and nothing validated the
system. Drive the app.

**Deployment:** `./infra/deploy.sh` builds and pushes to S3 + CloudFront.
