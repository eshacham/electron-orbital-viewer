# Electron Orbital Viewer

An interactive 3D viewer for atomic structure, in the browser.

Live: https://d3rhfcclqjt4tf.cloudfront.net

Two modes. **Atom** solves the real, many-electron ground state of any
neutral element from hydrogen to oganesson, from scratch, and lets you drill
from the whole atom down to a single shell, subshell or orbital — picking the
element off a real periodic table. **Basic Orbitals** is the idealised
picture: pick a set of quantum numbers and it draws the exact one-electron
surface at Z = 1, coloured by the sign of ψ — red where the wave function is
positive, blue where it is negative. Either way, you can turn it, cut it
open, and read off how big it actually is.

---

## What it shows

### Atom mode

- **Any neutral element, Z = 1 to 118**, solved from scratch by a
  self-consistent field — its real ground-state electron configuration
  (Hund's rules, the actual 4s/3d and 4f/5d/6s filling order, not a naive
  Aufbau list), not a hydrogen-like stand-in.
- **Three levels of drill-down**: the whole atom, one principal shell (K, L,
  M, …), and within a shell its individual subshells (3s, 3p, 3d, …) down to
  a single orbital lobe. The whole-atom and single-shell levels render as a
  cut-away sphere shaded by the radial distribution; the orbital level hands
  off to the same marching-cubes lobe used by Basic Orbitals mode, built from
  the atom's own numerically solved R_nl(r) rather than the analytic
  hydrogenic form.
- **The radial distribution D(r) = 4πr²ρ(r)**, plotted with one curve per
  shell — or, once you've drilled into one, per subshell — so the atom's
  whole structure is visible in a single view: argon's three curves peak at
  0.06, 0.29 and 1.22 a₀, its K, L and M shells. Each curve's colour is the
  colour of its ring on the 3D cut face, so the two views read as one object.
- **What the shells are made of.** Drilling into a shell renders its occupied
  orbitals *inside* it, at true relative scale, with how full each subshell
  is spelled out ("3d · 6 of 10 e⁻"). Carbon's L shell is a 2s sphere and
  three 2p dumbbells; iron's M shell adds five 3d cloverleaves; uranium's N
  shell adds seven 4f orbitals. Clicking a subshell shows it on its own, each
  of its orbitals in a distinct shade, because five interpenetrating
  cloverleaves in one colour are a blob.
- **Core versus valence.** The outermost shell's ring is lit and the core's
  recede, and the valence configuration is named on its own — 3s¹ for sodium,
  3s² 3p⁵ for chlorine, 3s² 3p⁶ for argon. This is the periodic table's logic
  rendered rather than asserted: Li, Na and K all show one lonely s electron
  outside a closed core; F and Cl both show one short of full.
- **A periodic table for choosing the element**, coloured by block (s/p/d/f)
  rather than by chemical family — the block names which subshell type its
  row is filling, so a d-block tile predicts cloverleaves and an f-block tile
  predicts seven-lobed shapes. Selecting or hovering an element lights its
  whole column, because a group *is* a column: its members share a valence
  configuration.
- **Clickable rings.** The ring you can see is the thing you click to open
  that shell; clicking the open shell again (or its ✕) returns to the whole
  atom.
- **Orbital energies**, in Hartree, next to each subshell — labelled
  explicitly as orbital energies, never ionisation energies, because they
  are not the same number (see [Limitations](#limitations)).
- **A camera and a radial-plot axis framed to what the atom actually is** —
  the contour holding the requested share of the electron, widened where
  needed to reach the valence shell — not to the sampling grid behind it,
  which is sized generously to hold the faintest tail and would otherwise
  render argon 20x too small and gold 100x too small: a few pixels in an
  empty view.
- **A convergence guarantee.** Every neutral atom, Z = 1 to 118, reaches a
  converged self-consistent solution; the app never renders one that has not
  (see [How it works](#how-it-works)).

### Basic Orbitals mode

- **Any orbital up to n = 9** — every (n, l, mₗ) combination, 285 in all.
- **Both phases of ψ**, so nodal surfaces are where the colours meet.
- **One electron, Z = 1** — the case the Schrödinger equation solves exactly,
  and the idealised shape every multi-electron orbital is a distortion of.
  There is no element control here: atom mode above covers every real
  element.
- **How much of the electron the surface encloses** — 50 %, 75 %, 90 %, 95 % or
  99 %. The density contour that achieves it is derived per orbital and reported
  beneath the control, so "90 %" means the same thing for a 1s as for a 9f.
- **The orbital's name** — `3d_z²`, `4f_xyz` — rather than leaving you to decode
  three quantum numbers.
- **The radial distribution**, P(r) = r²R(r)², plotted beside the view. Its peaks
  are the shells — n − l of them, countable — and its zeros are the radial nodes,
  which is what the concentric structure in a cut-open orbital actually is.

### Both modes, to look inside

- **A default view per element.** Picking an element gives you the standard
  view of it, derived from its own solved profile: the camera back at the
  canonical angle, framed on that atom's own extent, with the cut-away on and
  centred. Opacity and enclosed fraction are yours and are left alone.
- **Solid or wireframe.** Wireframe is see-through; solid is the only readable
  option at high resolution, where a wireframe becomes a wall of lines.
- **Opacity**, so outer shells stop hiding inner ones.
- **A cut-away plane** along X, Y or Z, positioned with a slider. The cut face is
  capped and shaded by the density it passes through, so a slice through a 7s
  reads like tree rings rather than a hollow shell.
- **A scale bar in Bohr radii.** The camera frames every view to fill the
  screen, so without this a carbon 3d looks exactly like a hydrogen 3d despite
  being six times smaller.

---

## How it works

### Rendering one orbital (Basic Orbitals mode, and atom mode's orbital level)

**1. The wave function.** ψ(r, θ, φ) = R_nl(r) · Y_lmₗ(θ, φ). In Basic
Orbitals mode R_nl is the exact analytic solution for one electron bound to a
point nucleus of charge Z (fixed at Z = 1); everything that depends only on
(n, l, mₗ, Z) —
normalisation constants, the Laguerre coefficients — is computed once per
orbital rather than per sample. Atom mode's orbital level swaps in the same
atom's own numerically solved R_nl(r) (see below) in place of the analytic
form and reuses everything downstream unchanged — the angular part Y_lmₗ
never differs between the two.

**2. Sizing the box.** The sampling box has to contain the whole isosurface or
the orbital comes out sliced flat against the wall. It is sized from the radial
distribution — the radius holding all but a ten-thousandth of the electron, which
bounds the orbital in every direction and needs no contour to be chosen first.
That ordering matters, because the contour is derived from the samples taken
inside this box; sizing the box from the contour and the contour from the box
would be circular. Atom mode's orbital level applies the identical rule to the
selected subshell's own numerical D(r) rather than to the whole atom's grid —
a screened inner subshell can be tens of times smaller than the grid that
comfortably holds the atom's outermost shell, and a box sized from the wrong
one leaves nothing for marching cubes to find.

**3. Sampling.** ψ is evaluated once at every point of a regular grid over
[−rMax, rMax]³ — 129³ points — inside a Web Worker, so the UI stays live.
There is no resolution control: the coarser grids that used to be offered
cost accuracy as well as detail, because a diffuse orbital's contour search
is biased by the handful of samples nearest the nucleus where |ψ|² is
largest, and a coarse grid draws the surface too small. The shell-composition
view sizes its own, much smaller grids separately, since it renders up to
sixteen orbitals at once.

**4. Choosing the contour.** The requested share of the electron is turned into a
density threshold by binning the samples by log density and walking down from the
densest bin until the accumulated density reaches the target. Sorting two million
samples would cost more than the render; binning is a single pass.

**5. Meshing.** Marching cubes over |ψ|² − isoLevel in float64, sharing vertices
between neighbouring cells. The result is an indexed, watertight mesh.

**6. Rendering.** three.js. Vertex colours carry sign(ψ). The cut-away is a real
clipping plane, capped with the usual stencil trick — back faces increment the
stencil, front faces decrement it, and a quad is drawn wherever the count is
non-zero. That quad reads the sampled wave function back out of a 3D texture, on
a log scale between the iso level and the orbital's peak, which is what makes
the cut face show density falling off rather than a flat colour.

A render is a few hundred milliseconds; the heaviest case measured (9s at 129³)
was under 0.6 s. Requests supersede each other, so changing your mind mid-render
is safe.

### Solving the atom (self-consistent field)

Atom mode's whole-atom and shell levels don't sample a 3D grid at all — under
the central-field approximation the density is spherically symmetric, so
there is nothing to march cubes over. What they need is D(r), and getting
that right for a real element means actually solving the many-electron
problem, approximately:

**1. The grid.** A logarithmic radial grid, r_j = rMin · e^(j·dx) — an atom
spans two and a half orders of magnitude between a heavy nucleus's innermost
shell and its outermost, and a uniform grid resolving the inner one would
need thousands of times more points to reach the outer one.

**2. One subshell at a time.** Each occupied (n, l) is a bound-state
eigenvalue problem, solved by Numerov integration with a shooting method:
count nodes to bracket the energy, integrate inward and outward from the
turning point, and refine until the two solutions and their derivatives
agree.

**3. The mean field.** Every electron moves in the field of the nucleus and
the averaged charge of all the others: the Hartree potential plus Dirac–Slater
exchange plus VWN5 local-density correlation (LDA — see
[Limitations](#limitations) for what this does and doesn't capture).

**4. Mixing to self-consistency.** Solve every subshell in the current
potential, rebuild the potential from the resulting density, mix the two at
an adaptive rate (so near-degenerate subshells — 4s/3d, 4f/5d — don't
oscillate indefinitely), and repeat until the potential stops moving
(max|ΔV·r| < 1e-6) or 200 iterations pass. Hydrogen is the one exception:
one electron has no self-interaction to get wrong, so it bypasses the LDA
loop entirely and returns the exact Coulomb solution.

**Validation.** Every neutral element, Z = 1 to 118, reaches a converged
solution — this is a gate the app enforces, not a possibility it merely
reports honestly. Against NIST's published LDA reference data, total
energies match to **0.0002%**: He −2.834829 Ha (NIST −2.834836), Ne
−128.233250 Ha (NIST −128.233481), Ar −525.945350 Ha (NIST −525.946195).
Orbital eigenvalues agree to within 0.02% in the worst case measured.

### Framing what's actually on screen

The camera and the radial plot's horizontal axis are both scoped to the
*contour* that is actually drawn — never to the sampling grid behind it. The
grid is deliberately oversized (it has to hold the faintest tail of the
outermost shell, however small the innermost one is), so framing the camera
to it left a heavy atom rendering as a handful of pixels in an otherwise
black view: argon 20x too small, gold 100x too small. The same fix applies
to the radial plot's x-axis, which used to span the whole grid and crush
every shell peak into the first few percent of the width. The whole-atom
level's plot additionally uses a square-root axis, labelled as such, since a
heavy atom's inner shells can sit within a couple of percent of the range
even after that fix — gold's peaks span 0.014 to 0.385 a₀, a 27x range that
a linear axis still crowds against the left edge.

One further correction, at the whole-atom level only. The enclosed-fraction
contour answers "where is 90% of the charge", and for a many-electron atom
that is dominated by the compact core: at the default 90%, 34 of the first 56
elements have their *valence* shell's peak outside it — sodium's by a factor
of 1.67, caesium's by 2.63 — and since the cut face is stencilled to the
sphere, the valence shell was not dim, it was off the picture. So the
whole-atom sphere is drawn at whichever is larger, the contour or a little
past the valence peak. The contour itself is untouched and still means
exactly what it says; these are two different questions, and only the second
one is "how big is this atom".

---

## Physics conventions

- **Atomic units throughout.** Radial distance r is in Bohr radii (a₀ = 1);
  energies — the SCF's total energy, each subshell's eigenvalue — are in
  Hartree (Ha), never eV.
- **D(r) vs P(r).** Atom mode plots D(r) = 4πr²ρ(r), the radial electron
  density for a shell or subshell holding possibly several electrons.
  Basic Orbitals mode plots P(r) = r²R(r)², the same idea for a single
  electron's own radial factor. They coincide for a one-electron subshell,
  which is why hydrogen looks identical in both modes.
- **Central-field, spherically averaged.** The self-consistent field treats
  every electron as moving in the *spherically averaged* field of all the
  others. An open subshell's electrons (carbon's 2p², say) are spread evenly
  across every orbital of that subshell rather than assigned to particular
  ones — the standard approximation behind the periodic table's usual
  orbital diagrams, not a simplification specific to this app.
- **Electron configurations from NIST's Ground Levels and Ionization
  Energies table**, Z = 1 to 118 — actual filling order (4s before 3d, the
  lanthanide/actinide exceptions), not a naive Aufbau list.
- **Real spherical harmonics.** The angular parts are the real combinations that
  give the familiar p_x / d_xy / d_z² shapes, not the complex eigenstates of L̂_z.
  This is unchanged between modes: atom mode's orbital level swaps in a
  numerical R_nl(r) but keeps the same Y_lmₗ.
- **No Condon–Shortley phase.** `associatedLegendrePolynomial` omits the (−1)^m
  factor; the sign convention is carried in the real harmonic combinations
  instead. Pass |mₗ| for its `m` argument.
- **Angles in radians**, θ ∈ [0, π], φ ∈ [0, 2π).
- **Validated quantum numbers.** n ≥ 1, 0 ≤ l ≤ n−1, −l ≤ mₗ ≤ l, Z ≥ 1; anything
  else throws rather than silently producing a wrong picture.

---

## Limitations

Worth being clear about what this is not — in both modes.

### Atom mode

**Central-field approximation: open shells are spherically averaged.** Every
electron moves in the averaged field of all the others, not the instantaneous
field of their actual positions — there is no angular correlation between
electrons. An open subshell (carbon's 2p²) is modelled as its electrons spread
evenly across every orbital of that subshell, not arranged the way Hund's
rules might suggest for a specific real-orbital picture. This is the standard
approximation behind most textbook orbital diagrams, not a shortcut unique to
this app — but it is an approximation.

**LDA exchange with VWN correlation — no exact exchange.** The local-density
approximation treats exchange and correlation as functions of the local
density alone. It captures the bulk of the electron-electron interaction well
enough to match NIST's own published LDA values (see
[How it works](#how-it-works)), but it is not exact (Hartree–Fock) exchange,
and it carries a self-interaction error that LDA does not fully cancel — see
the ionisation-energy point below.

**Non-relativistic — sub-1% through krypton, tens of percent by gold.**
Relativistic corrections scale roughly with Z², so they are genuinely
negligible for light elements and genuinely not for heavy ones. Measured
against NIST's scalar-relativistic reference: neon's orbital energies are
within 0.25%, but gold's 6s orbital energy is **27% away** from the
relativistic value — precisely the relativistic contraction of the 6s
orbital that is the textbook explanation for why gold is yellow rather than
silvery like most metals. This app computes the non-relativistic number, so
for gold and its heavy neighbours the energies (not the shapes — see below)
are the least trustworthy numbers on screen.

**Neutral atoms only.** No ions, no cations or anions of any element — Z sets
both the nuclear charge and the electron count together.

**Orbital eigenvalues are not ionisation energies.** Koopmans' theorem, which
would let you read an ionisation energy straight off an eigenvalue, does not
hold for LDA: its self-interaction error means an electron still feels a
fraction of its own repulsion. Neon's 2p eigenvalue comes out **37% away**
from its measured ionisation energy — a light atom, where relativity plays no
part, so the whole gap is this one effect. The UI labels every energy
"orbital energy" and nothing that implies otherwise; treat the number as a
solution to the model equations, not a measured or measurable quantity.

**Individual orbital lobes are a basis choice, not separate physical
objects.** Within one subshell, the real p_x/p_y/p_z (or the five real d
orbitals) are one particular orthonormal basis for a degenerate subspace —
any other orthonormal combination of them describes the same physical state
equally validly. What's physically meaningful is the subshell's total,
spherically symmetric density (what the shell and subshell levels actually
show); the individual lobe you get by drilling to level 3 is a real solution
of the same equations, but not a privileged one.

**A heavy atom's core compresses to a dot at the whole-atom level.** Once
the view reaches out to the valence shell, the span it has to cover is real
and enormous: uranium's K shell peaks inside 0.02 a₀ and its 7s near 4 a₀, a
factor of 200 in one linear picture. The core rings are still there, still
coloured and still countable in the radial plot (which uses a square-root
axis for exactly this reason), but at the atom level they are small. Opening
a shell — click its chip — reframes the camera onto it.

**Shell peaks merge from about Z = 26 onward, so the visible ring count is
not the shell count.** Neighbouring shells' D(r) genuinely overlap more as
they compress inward with increasing nuclear charge — iron (Z = 26, four
occupied shells) already resolves only three peaks in its total radial
distribution, and heavier atoms merge further still. This is real physics,
not a rendering limitation, but it means counting rings is not a reliable way
to count shells past the middle of the periodic table.

### Basic Orbitals mode

**One electron, and only hydrogen's.** The Schrödinger equation is solved
exactly only for a single electron around a point nucleus, and that is what
this draws — at Z = 1. There is no electron–electron repulsion, no screening
and no correlation, so nothing here is an element other than hydrogen; atom
mode above is what solves for real, many-electron atoms.

The nuclear-charge control this mode used to carry is gone, and with it the
one-electron ions (He⁺, Li²⁺, …) and the direct demonstration that raising Z
shrinks an orbital without changing its shape. That was a deliberate trade
for one element control in the app rather than two meaning different things;
nothing in the solver is restricted, so it is a UI change only.

**No hybrids, no molecules.** sp, sp² and sp³ hybrids and molecular orbitals —
most of what an introductory chemistry course actually reasons with — are
outside what this computes.

**Non-relativistic, spinless.** No fine structure, no spin–orbit coupling. For
high Z, where relativistic effects genuinely matter, the shapes shown are
increasingly a fiction.

### Both modes

**The enclosed fraction, and level 3's box, are of the sampled grid.** The
sampling box (Basic Orbitals mode, and atom mode's orbital level) holds all but
a ten-thousandth of the electron, so "90 %" is 90 % to within that — not of an
exact infinite integral. The threshold is also quantised by the grid it is
derived from. Levels 1 and 2 in atom mode have no such caveat: the shell view
reads its contour straight off the SCF's own D(r), with no marching-cubes box
in between.

**Resolution is finite.** The voxel is 2·rMax / resolution, so a wide box at a
high n leaves the fine radial structure under-resolved, and marching cubes
rounds off sharp features. The sampling radius is also capped, which the
widest orbitals could in principle hit — in that case the surface would touch
the box.

**One cut plane, axis-aligned.** No arbitrary orientation, no multiple planes.

**No export.** No image, mesh or state saving; no shareable links.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 1400+ tests
npm run build      # production bundle into dist/
```

Deployment is an AWS CDK stack (S3 + CloudFront) under `infra/`:

```bash
./infra/deploy.sh                     # builds, then cdk deploy
```

It needs the AWS CDK CLI (`npm i -g aws-cdk`) and credentials for the target
account. The Python side pins its own dependencies in `infra/requirements.txt`.

---

## Layout

| Path | What it is |
| --- | --- |
| `src/quantum_functions.ts` | The physics: radial functions, Legendre, real spherical harmonics, and a fast per-orbital evaluator |
| `src/orbital_presets.ts` | The enclosed-fraction options and the derived sampling radius |
| `src/orbital_mesh.ts` | Samples the grid and produces the mesh plus the density map |
| `src/marching_cubes.ts` | The isosurface algorithm |
| `src/orbital_visualizer.ts` | three.js scene, camera framing (on the visible contour, not the sampling grid), worker lifecycle |
| `src/clip_caps.ts` | Stencil-capped cut faces and their density shader |
| `src/orbital_material.ts` | Surface material: solid/wireframe, opacity, clipping |
| `src/radial_distribution.ts` | P(r) = r²R(r)², the box-sizing radius, and the contour for a given enclosed fraction |
| `src/orbital_names.ts` | Spectroscopic names for the real orbitals |
| `src/scale_bar.ts` | Bohr-radius scale readout |
| `src/atom/radial_grid.ts` | The shared logarithmic radial grid every atomic calculation runs on |
| `src/atom/numerov.ts` | Numerov integration of the radial Schrödinger equation |
| `src/atom/radial_solver.ts` | Shooting-method bound-state solver for one (n, l) subshell |
| `src/atom/hartree.ts` | The Hartree potential and Dirac/Slater exchange |
| `src/atom/correlation.ts` | VWN5 local-density correlation |
| `src/atom/scf.ts` | The self-consistent field loop: nuclear charge in, converged ground-state atom out |
| `src/atom/configurations.ts` | Ground-state electron configurations, Z = 1 to 118 |
| `src/atom/atom_profile.ts` | Converged solution → per-shell/subshell D(r) curves, contour radii, shell peaks, and level-3's sampling radius |
| `src/atom/shell_view.ts` | The spherical cut-away shading for levels 1-2 (whole atom / single shell), including the ring colours and the core/valence distinction |
| `src/atom/shell_composition.ts` | Which orbitals a shell is made of, how full each is, and the isolate-one-subshell filter |
| `src/atom/shell_pick.ts` | Radius → shell, for clicking a ring on the cut face |
| `src/periodic_table.ts` | Where each element sits in the 18-column table, and which block it belongs to |
| `src/curve_colors.ts` | The one palette the radial plot, the rings and the orbital lobes all draw from |
| `src/atom/useAtomSolver.ts` | React hook driving the atom worker and dispatching its result |
| `src/store/` | Redux state: Basic Orbitals params/surface style, and atom mode's drill-down level, profile and hover linkage |
| `src/components/` | React controls and the viewer host, including atom mode's level navigation and subshell panel |
| `src/workers/` | The off-thread calculation: marching cubes (`orbitalWorker.ts`) and the SCF solve (`atomWorker.ts`) |
| `infra/` | CDK stack for S3 + CloudFront hosting |

---

## Continuing this work

Design, decisions, backlog and process notes for the multi-electron atom work
live in [docs/HANDOFF.md](docs/HANDOFF.md), with the full spec in
[docs/superpowers/specs/](docs/superpowers/specs/).
