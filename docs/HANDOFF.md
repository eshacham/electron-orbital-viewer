# Handoff — multi-electron atom viewer

Written 2026-08-30 so a fresh session can continue without loss. Branch:
`feat/multi-electron-atoms`, off `main` at `eb210f2`.

**Read first:** `docs/superpowers/specs/2026-08-29-multi-electron-atoms.md`
(the design and its four addenda) and `README.md` (what the app is). This file
covers state, backlog, and the decisions that are not obvious from the code.

---

## Where the work stands

The app now has two modes:

- **Atom mode** (default) — real neutral atoms, Z = 1…118, from a
  self-consistent-field calculation. Three levels: atom → shell → orbital.
- **Hydrogen-like mode** — the original exact one-electron viewer, unchanged.
  *Pending rename to "Basic Orbitals" with its Z control removed — see backlog.*

The physics engine is complete and externally validated. It reproduces NIST's
LDA total energies to **0.0002 %** (He −2.834829 vs −2.834836; Ne −128.233250
vs −128.233481; Ar −525.945350 vs −525.946195), and argon's 2s/2p orbital
energies read −10.794 / −8.443 Ha on screen against NIST's −10.794172 /
−8.443439.

~1316 tests, `npm run build` clean, `npx tsc --noEmit` clean.

## Architecture of `src/atom/`

Physics, no rendering, no React:

| file | responsibility |
| --- | --- |
| `radial_grid.ts` | Logarithmic grid `r = rMin·e^(j·dx)`; Simpson quadrature with the `dr = r·dt` Jacobian; interpolation. **Throws on an even point count** (Simpson needs odd) and on `highestN` outside 1–7 |
| `numerov.ts` | Numerov integration of `y'' = g·y`. Pure numerics, no physics, no grid knowledge |
| `radial_solver.ts` | Bound-state eigenvalue search for one (n, l) in a given potential. Two-phase: node-count bracketing, then log-derivative matching. Throws if the solution is not contained by the grid |
| `configurations.ts` | Ground-state configurations Z = 1…118 from a hardcoded NIST-derived table (not Madelung + exceptions). All 20 aufbau exceptions verified |
| `hartree.ts` | Hartree potential from radial Poisson; Dirac/Slater exchange |
| `correlation.ts` | VWN5 correlation. Verified against published Ceperley–Alder values |
| `scf.ts` | The self-consistency loop. Adaptive mixing β (not fixed) because plain linear mixing charge-sloshes on transition metals and lanthanides |
| `atom_profile.ts` | Derives everything the UI needs from a converged solution: total/shell/subshell D(r), contour radii, shell peaks, numerical R_nl accessor |
| `shell_view.ts` | Levels 1–2: sphere + cut-face shader |
| `shell_composition*.ts` | A shell's constituent orbitals rendered inside it |
| `level_transition.ts` | Animated transitions between levels |
| `*_cache.ts` | Profile and mesh caches |
| `useAtomSolver.ts` | Owns the SCF worker lifecycle |

**Naming, enforced throughout:** `D(r) = 4πr²ρ(r)` is the *radial
distribution*; `density` means `ρ(r)` alone. They differ by 4πr² and conflating
them causes real bugs.

## Decisions that are not obvious from the code

Numbered as in the working ledger. These cost real effort to arrive at; do not
undo them without reading why.

- **Log grid is mandatory.** An atom spans ~2.5 orders of magnitude in radius.
  Uranium's 1s peaks inside 0.02 a₀ while its valence reaches past 40.
- **Grid extent must come from the physics, not a formula.** An invented
  `rMax` formula silently returned a **41 % wrong energy** for hydrogen's 7s.
  `gridForAtom` now sizes from a table of measured hydrogenic 99.99 % radii.
- **VWN5 correlation was added despite the spec scoping it out.** Without it
  there is no authoritative benchmark: NIST's LDA column is exchange **plus**
  VWN. Validation was the point of the exercise.
- **The radial curve ships on its log grid, not resampled uniformly.** Uniform
  resampling lost 78 % of uranium's K-shell peak even at 4096 samples. The
  shader does `t = log(r/rMin)/dx` instead — exact at every scale.
- **The cut face scales against a *local* envelope, not the global peak.** A
  shell is legible because it is denser than the radii either side of it, not
  because it is dense outright. Global normalisation gave uranium's inner rings
  a peak-to-trough contrast of 0.028 — invisible. There is an acceptance test
  asserting **≥ 0.35 for Ar and U**; keep it passing.
- **Navigation comes from the configuration, never from detected peaks.**
  Shell peaks genuinely merge from about Z = 26: iron has 4 occupied shells but
  3 resolved peaks, uranium 7 and 4. Zipping peaks to shells misaligns.
- **Never label an orbital eigenvalue an ionisation energy.** LDA's
  self-interaction error puts neon's 2p 37 % away from the measured value.
- **Solve once per element, never per level change.** Navigation actions are
  pure reads. Only `setElement` (and `enclosedFraction`) start a solve.
- **One-electron systems bypass SCF** — LDA's self-interaction error would make
  hydrogen wrong where an exact answer already exists.
- **Potential construction stays swappable** so a scalar-relativistic v2 is a
  module addition rather than a rewrite (see "Known limits").

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

The *visual* content is far more robust than the numeric: orbital shapes, node
counts, shell topology and occupancy are exact at any Z; only energies degrade.

**Planned v2 is scalar-relativistic (Koelling–Harmon)** — roughly 150 lines
against one modified ODE, reusing the same shooting method and plugging into
the same `RadialState` interface. It would take gold's 6s from 27 % to under
1 %.

---

## Backlog

### Done and verified
1. Legend jumping on hover — fixed (`cebf4ff`)
2. Scrollbar on the level-nav panel — fixed (`d9b326c`)
4. Atom mode blank after using the other mode — fixed (`cf2d580`). Cause: a
   shell view's content *is* its cut face, so the shared "Cut away: Off"
   setting left nothing to draw
5. Outer shell invisible against the background — fixed (`afe2b55`)
6. Controls shown where they do nothing — fixed (`360bad8`). Resolution and
   Surface matter only for a real marching-cubes mesh, i.e. hydrogen-like mode
   or atom level 3, so they are hidden at atom levels 1–2

### Done, with a follow-up
- **Shell composition view** (`81e7647`) — a shell's occupied orbitals render
  inside it at true scale, coloured to match the radial plot, with occupancy
  shown as "3d · 6 of 10 e⁻". Atom-level rings now colour by n. Timings at
  resolution 32, off the main thread: C 4 meshes 112 ms, Fe 9 meshes 247 ms,
  U 16 meshes 457 ms; cached per (Z, n, resolution, fraction).

  **Follow-up needed:** with five d orbitals overlapping, iron's M shell reads
  as a single gold blob rather than five distinguishable cloverleaves. The
  overlap is physically honest — they do occupy the same space, which is the
  teaching point — but it is hard to look at. Proposed fix: clicking a subshell
  chip isolates that subshell's orbitals, keeping the overlapping view as the
  default and isolation as the way to read it. Same mechanism would serve the
  "explicit deselect" item below.

### Not started, in priority order
- **Rename "Hydrogen-like" → "Basic Orbitals" and remove its Z control.**
  Decided; cost recorded in Addendum 2 (loses He⁺/Li²⁺ and the 1/Z scaling
  demonstration).
- **Clickable rings in 3D + explicit shell deselect.** The pointer→radius
  mapping already exists for the hover linkage; this makes the drill-down
  discoverable, which testing showed it is not.
- **Periodic table selector** replacing the dropdown — coloured by **block
  (s/p/d/f)**, not chemical family, because block is derivable from what the
  engine computes and predicts which orbital shapes the composition view will
  show. Highlight the selected element's column, since a group *is* a column
  because its members share a valence configuration. Spec: Addendum 3.
- **Core vs valence distinction** in the atom view. An element's chemistry is
  almost entirely its outermost shell; making that visually distinct renders
  the periodic table's logic directly (Li/Na/K alike, F/Cl alike, Ne/Ar alike).

### Known, accepted, not scheduled
- `prefers-reduced-motion` for the level transitions is verified at unit level
  and by code review, but not live — the browser tooling had no hook to set the
  media feature.
- The cross-fade renders the scene twice for ~350 ms.
- A busy SCF worker queues behind an abandoned slow solve. Correctness is
  preserved by request id; latency in that narrow case is not.
- With `clipAxis` inherited as `'none'` at atom levels 1–2, no cut-away button
  shows pressed and the position slider stays hidden until X/Y/Z is clicked.
  The view renders correctly regardless.

---

## Process notes for whoever continues

**Subagents must run commands in the foreground.** A subagent that backgrounds
a long command and ends its turn is stranded permanently — the completion
notification routes to the parent session, not to it. Two agents were lost this
way before the cause was found. Always state this in a dispatch, along with
expected durations so a multi-minute foreground wait reads as normal.

**Expensive SCF sweeps are gated behind `ATOM_SLOW_TESTS=1`.** The default
suite is ~70 s; the full set is ~2 min. Do not un-gate them.

**Verify in the live app, not only in tests.** Every serious defect in this
project was invisible to a green suite:
- Numerov tests used a constant `g`, under which a correct implementation and a
  deliberately broken one produce byte-identical output
- A grid-extent bug returned a 41 % wrong energy with 1084 tests passing
- Argon rendered 21× too small with 1260 tests passing
- The profile cache never had a hit in the running app, while a test measured
  it at 3210 ms → 0.001 ms — because the test never crossed the worker boundary

The pattern: unit tests validated the functions and nothing validated the
system. Drive the app.

**Deployment:** `./infra/deploy.sh` builds and pushes to S3 + CloudFront. It
has **not** been run — everything so far is local to the branch.
