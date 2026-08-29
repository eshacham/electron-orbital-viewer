# Spec: Multi-Electron Atoms — Three-Level Viewer

**Status:** approved 2026-08-29
**Supersedes:** nothing. Extends the existing hydrogen-like viewer; removes none of it.

---

## 1. Problem

The app today solves exactly one problem: a single electron bound to a point
nucleus of charge Z. The element dropdown sets Z, so picking "Carbon" draws
C⁵⁺ — a bare carbon nucleus with one electron — not carbon. Because Z enters
only the radial factor (`rhoPerR = 2Z/n` and the normalisation in
`makeWaveFunctionEvaluator`), changing it rescales every length by 1/Z and
leaves the shape untouched. The camera reframes to fit, so even the size change
is invisible without the scale bar.

The goal is to show **what real atoms look like**, for every element, and to
stay honest about it.

## 2. What "an atom looks like" actually is

Three facts constrain the whole design:

1. **A filled subshell has spherically symmetric density** (Unsöld's theorem,
   Σ_m |Y_l^m|² = (2l+1)/4π). Under the central-field approximation an atom's
   total density ρ(r) is therefore a function of r alone. The isosurface of an
   atom is a **sphere**, always.
2. **ρ(r) itself is close to monotonically decreasing.** Shell structure is
   *not* visible in ρ. It is visible in the radial distribution
   **D(r) = 4πr²ρ(r)**, whose peaks are the shells. Everything that renders
   shell structure must therefore shade by D(r), labelled as such.
3. **Orbital lobes are a basis choice.** p_x/p_y/p_z are a real-valued basis
   for three degenerate states whose sum is spherical. This is standard
   pedagogy and we keep it, but the UI must not imply a filled 2p⁶ subshell
   physically consists of three lobes.

Consequence: the three levels are a **decomposition**, not a spatial nesting.
Shells interpenetrate. Navigation must read as filtering/peeling, not as flying
inward.

## 3. The three levels

| Level | Renders | Radial panel | Navigation out |
| --- | --- | --- | --- |
| **Atom** | Sphere at the contour enclosing `enclosedFraction` of all electrons; cut-away shaded by total D(r) → visible rings | Total D(r), one peak per occupied n | Click a ring / peak → that shell |
| **Shell** (n) | Sphere at the contour for that shell's electrons only; cut-away shaded by that shell's D_n(r) | D_n(r) split into per-subshell curves (2s, 2p …) overlaid | Click a subshell → its orbitals |
| **Orbital** (n,l,mₗ) | Existing marching-cubes isosurface, phase-coloured, with the **numerical** R_nl | P(r) = r²R_nl(r)² for that orbital | Back to shell |

Levels 1 and 2 need no 3D sampling grid: ρ is spherical, so the cut face
computes r from world position and reads a **1D radial texture** at full
resolution. This sidesteps the voxel-resolution problem entirely — a uranium K
shell is resolvable on the cut face even though a 129³ Cartesian grid sized for
its valence shell would smear it across two voxels.

Level 3 keeps the existing pipeline unchanged apart from the radial function.

## 4. Physics engine

**Method:** self-consistent field, central-field approximation, non-relativistic,
spin-restricted, spherically averaged open shells. Exchange treated at the
local-density (Dirac/Slater) level: `V_x(r) = −(3ρ(r)/π)^(1/3)`. No correlation
functional in v1.

**Why LDA exchange and not Hartree–Fock:** exchange becomes a local function of
the density instead of a set of non-local Slater integrals between orbital
pairs. It gets shell structure, orbital sizes and the l-degeneracy splitting
right, which is what the visualisation needs, at a fraction of the code. HF is
a later upgrade behind the same interface.

**Radial equation.** With u(r) = r·R(r), atomic units:

```
u''(r) = [ l(l+1)/r² + 2(V(r) − ε) ] u(r)
```

On a logarithmic grid `r = r_min·e^(j·dx)`, substituting `y(t) = u(r)/√r`
(t = ln r) turns this into a pure Numerov form with no first-derivative term:

```
y''(t) = g(t)·y(t),    g(t) = (l + ½)² + 2r²(V(r) − ε)
```

A log grid is required, not optional: the 1s of a heavy atom lives inside
0.01 a₀ while its valence shell reaches 50 a₀.

**Eigenvalue search:** bisection on ε using node counting (state (n,l) has
n−l−1 nodes in u), refined by matching the logarithmic derivative of inward and
outward integrations at the outer classical turning point.

**Self-consistency:** Hartree potential from radial Poisson, linear potential
mixing, converged on max|ΔV|.

**One-electron systems bypass SCF.** LDA has a self-interaction error, so an
SCF hydrogen would not reproduce the exact answer the app already computes.
For N = 1 the exact analytic solution is used.

## 5. Scope of quantum numbers

Ground-state neutral atoms occupy only s, p, d, f. Oganesson (Z=118) is
[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶ — highest occupied l is 3, highest occupied n is 7.

- **Atom mode:** l ∈ {0,1,2,3}, n ∈ 1…7. The SCF solver needs four angular
  channels, no more.
- **Hydrogen-like mode is retained unchanged**, including n ≤ 9 and l ≤ 8. It
  stays exact, it is the validation oracle for the numerical solver, and it is
  what excited states would need.

Ground-state configurations come from a hardcoded NIST table (118 entries),
not from Madelung ordering plus an exceptions list — the exceptions (Cr, Cu,
Nb, Mo, Ru, Rh, Pd, Ag, La, Ce, Gd, Pt, Au, Ac, Th, Pa, U, Np, Cm, Lr) are
numerous enough that the table is both shorter and correct.

## 6. Cross-view linkage

The 3D cut-away and the 2D radial plot show the same function and must be
linked by pointer position:

- **Cut-away → plot:** point-to-point. Intersect the pointer ray with the
  existing `clipPlane`, take r = |hit|, mark that r on the plot.
- **Plot → cut-away:** point-to-circle. A radius r is a sphere in 3D; where it
  meets a cut plane at offset d it is a **circle of radius √(r² − d²)**, empty
  when r < |d|. Hovering the plot draws a ring on the cut face.

## 7. Honesty requirements

These are product requirements, not nice-to-haves. The app's value is that it
is true.

- The cut-face shading legend must say **D(r) = 4πr²ρ(r)**, not "density".
- The atom view must state the method and its approximations somewhere
  reachable: central-field, spherically averaged, LDA exchange, no correlation,
  non-relativistic.
- Hydrogen-like mode must stay labelled as a one-electron ion.
- Computed quantities that have published reference values (total energies,
  orbital energies, ⟨r⟩) must be tested against them, not against themselves.

## 8. Explicitly out of scope for v1

- Hartree–Fock exchange, correlation functionals, relativistic corrections
- Electron correlation visualisation (the conditional-density P(r₂|r₁) idea)
- Molecules, bonding, excited states, photon absorption
- Ions (neutral atoms only)
- Non-spherical open-shell densities (multiplet structure)

## 9. Acceptance

- Numerical solver reproduces analytic hydrogenic R_nl and E = −Z²/2n² to
  ≥ 6 significant figures for a spread of (n, l, Z).
- SCF converges for all Z ∈ 1…118 without manual tuning.
- Computed LDA total energies match published LDA atomic values within 1 %.
- Argon's total D(r) shows three resolved peaks; neon's shows two.
- All three levels render, navigate in both directions, and survive the
  existing 1065-test suite unbroken.
- Production build succeeds and the app is deployable by `./infra/deploy.sh`.
