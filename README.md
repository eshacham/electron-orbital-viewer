# Electron Orbital Viewer

An interactive 3D viewer for hydrogen-like atomic orbitals, in the browser.

Live: https://d3rhfcclqjt4tf.cloudfront.net

Pick a set of quantum numbers and it draws a surface of constant probability
density, coloured by the sign of ψ — red where the wave function is positive,
blue where it is negative. You can turn it, cut it open, and read off how big it
actually is.

---

## What it shows

- **Any orbital up to n = 9** — every (n, l, mₗ) combination, 285 in all.
- **Both phases of ψ**, so nodal surfaces are where the colours meet.
- **A nucleus of charge Z** from hydrogen to oganesson. This is a *hydrogen-like*
  ion, not a neutral atom — see [Limitations](#limitations).
- **The iso level**, the density contour the surface is drawn at. Lowering it
  grows the surface outward; raising it shrinks it toward the densest core.

And to look inside:

- **Solid or wireframe.** Wireframe is see-through; solid is the only readable
  option at high resolution, where a wireframe becomes a wall of lines.
- **Opacity**, so outer shells stop hiding inner ones.
- **A cut-away plane** along X, Y or Z, positioned with a slider. The cut face is
  capped and shaded by the density it passes through, so a slice through a 7s
  reads like tree rings rather than a hollow shell.
- **A scale bar in Bohr radii.** The camera frames every orbital to fill the
  view, so without this a carbon 3d looks exactly like a hydrogen 3d despite
  being six times smaller.

---

## How it works

**1. The wave function.** ψ(r, θ, φ) = R_nl(r) · Y_lmₗ(θ, φ), the exact
analytic solution for one electron bound to a point nucleus of charge Z.
Everything that depends only on (n, l, mₗ, Z) — normalisation constants, the
Laguerre coefficients — is computed once per orbital rather than per sample.

**2. Sizing the box.** The sampling box has to contain the whole isosurface or
the orbital comes out sliced flat against the wall. Since |ψ|² factors into a
radial and an angular part, the outermost point of the surface is the largest r
where R(r)² times the angular peak still reaches the iso level. That is computed
per orbital, so the box tracks mₗ, Z and the iso level rather than being a fixed
table.

**3. Sampling.** ψ is evaluated once at every point of a regular grid over
[−rMax, rMax]³ — 33³, 65³ or 129³ points for low, medium and high — inside a Web
Worker, so the UI stays live.

**4. Meshing.** Marching cubes over |ψ|² − isoLevel in float64, sharing vertices
between neighbouring cells. The result is an indexed, watertight mesh.

**5. Rendering.** three.js. Vertex colours carry sign(ψ). The cut-away is a real
clipping plane, capped with the usual stencil trick — back faces increment the
stencil, front faces decrement it, and a quad is drawn wherever the count is
non-zero. That quad reads the sampled wave function back out of a 3D texture, on
a log scale between the iso level and the orbital's peak, which is what makes
the cut face show density falling off rather than a flat colour.

A render is a few hundred milliseconds; the heaviest case measured (9s at 129³)
was under 0.6 s. Requests supersede each other, so changing your mind mid-render
is safe.

---

## Physics conventions

- **Atomic units.** Radial distance r is in Bohr radii, so a₀ = 1 throughout.
  The scale bar is labelled `a₀`.
- **Real spherical harmonics.** The angular parts are the real combinations that
  give the familiar p_x / d_xy / d_z² shapes, not the complex eigenstates of L̂_z.
- **No Condon–Shortley phase.** `associatedLegendrePolynomial` omits the (−1)^m
  factor; the sign convention is carried in the real harmonic combinations
  instead. Pass |mₗ| for its `m` argument.
- **Angles in radians**, θ ∈ [0, π], φ ∈ [0, 2π).
- **Validated quantum numbers.** n ≥ 1, 0 ≤ l ≤ n−1, −l ≤ mₗ ≤ l, Z ≥ 1; anything
  else throws rather than silently producing a wrong picture.

---

## Limitations

Worth being clear about what this is not.

**One electron.** The Schrödinger equation is solved exactly only for a single
electron around a point nucleus, and that is what this draws. Choosing carbon
gives you C⁵⁺ — a carbon nucleus with one electron — not carbon's actual
orbitals. There is no electron–electron repulsion, no screening, no correlation.
Real many-electron orbitals are similar in shape but not the same, and their
energies are not the hydrogen-like ones at all.

**No hybrids, no molecules.** sp, sp² and sp³ hybrids and molecular orbitals —
most of what an introductory chemistry course actually reasons with — are
outside what this computes.

**Non-relativistic, spinless.** No fine structure, no spin–orbit coupling. For
high Z, where relativistic effects genuinely matter, the shapes shown are
increasingly a fiction.

**The iso level is a raw density, not a percentage.** It is a threshold on |ψ|²
in atomic units, so surfaces at the same iso level for different orbitals do not
enclose the same fraction of the electron. A "90 % of the electron is inside
this surface" contour would be more meaningful and is not implemented.

**Nothing is named.** The viewer shows the numbers you chose, not "3d_z²". You
have to know what (3, 2, 0) looks like to notice when it looks wrong.

**Resolution is finite.** The voxel is 2·rMax / resolution, so a wide box at a
high n leaves the fine radial structure under-resolved, and marching cubes
rounds off sharp features. The sampling radius is also capped, which a very low
iso level on a high n can hit — in that case the surface will touch the box.

**One cut plane, axis-aligned.** No arbitrary orientation, no multiple planes.

**No export.** No image, mesh or state saving; no shareable links.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 722 tests
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
| `src/orbital_presets.ts` | Iso level per (n, l), and the derived sampling radius |
| `src/orbital_mesh.ts` | Samples the grid and produces the mesh plus the density map |
| `src/marching_cubes.ts` | The isosurface algorithm |
| `src/orbital_visualizer.ts` | three.js scene, camera framing, worker lifecycle |
| `src/clip_caps.ts` | Stencil-capped cut faces and their density shader |
| `src/orbital_material.ts` | Surface material: solid/wireframe, opacity, clipping |
| `src/scale_bar.ts` | Bohr-radius scale readout |
| `src/components/` | React controls and the viewer host |
| `src/workers/` | The off-thread calculation |
| `infra/` | CDK stack for S3 + CloudFront hosting |
