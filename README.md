# Electron Orbital Viewer

An interactive 3D viewer for atomic structure, in the browser.

Live: https://d3rhfcclqjt4tf.cloudfront.net

Four modes. **Atom** solves the real, many-electron ground state of any
neutral element from hydrogen to oganesson, from scratch, and lets you drill
from the whole atom down to a single shell, subshell or orbital — picking the
element off a real periodic table. **Basic Orbitals** is the idealised
picture: pick a set of quantum numbers and it draws the exact one-electron
surface at Z = 1, coloured by the sign of ψ — red where the wave function is
positive, blue where it is negative. **Bonds** is where atoms become
molecules: H₂⁺ solved exactly at any bond length, and ten more diatomics from
a real quantum-chemistry pipeline, each with its own potential curve,
molecular-orbital diagram and electron density. **Molecules** is a library of
25 real, polyatomic molecules — water to glycine — picked by name, formula or
category, each with its ball-and-stick geometry, total density, mapped
electrostatic potential and a full list of molecular orbitals with
HOMO/LUMO marked. In every mode, you can turn the picture, cut it open, and
read off how big it actually is.

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
  of its orbitals in its own colour, spread evenly round the colour wheel,
  because five interpenetrating cloverleaves in one colour are a blob.
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
  configuration. It folds to a header once you pick, so the atom gets the
  view. On a phone, where a table does not fit, the element's name at the
  head of the navigation card opens a searchable list instead.
- **Clickable rings.** The ring you can see is the thing you click to open
  that shell; clicking the open shell again (or its ✕) returns to the whole
  atom.
- **Orbital energies**, in Hartree, next to each subshell — labelled
  explicitly as orbital energies, never ionisation energies, because they
  are not the same number (see [Limitations](#limitations)) — and as a
  level diagram of the whole atom on a log |E| scale, with the open shell's
  subshells named.
- **A camera and a radial-plot axis framed to what the atom actually is** —
  the contour holding the requested share of the electron, widened where
  needed to reach the valence shell — not to the sampling grid behind it,
  which is sized generously to hold the faintest tail and would otherwise
  render argon 20x too small and gold 100x too small: a few pixels in an
  empty view.
- **A convergence guarantee.** Every neutral atom, Z = 1 to 118, reaches a
  converged self-consistent solution; the app never renders one that has not
  (see [How it works](#how-it-works)).
- **Ions and excited states.** A Charge stepper beside the element (−2 to
  +3, only where the element actually has one) solves the real ion, from a
  NIST-derived table of measured ground configurations rather than a
  "remove the outermost electron" guess — Fe²⁺ is [Ar] 3d⁶, not
  [Ar] 3d⁵ 4s¹. An Excite menu promotes one electron from the valence
  subshell to a higher one (Na 3s → 3p and similar). Either way, a dashed
  ring on the cut face marks the neutral atom's own drawn radius, so Na⁺'s
  shrinkage or Br⁻'s swelling reads directly against it. Ionisation and
  excitation energies are **ΔSCF** — differences of spin-polarised LDA total
  energies, never an orbital eigenvalue — labelled "ΔSCF, LDA": H–Ar's first
  ionisation energies land within 7.6 % of NIST (worst case helium), and
  sodium's 3s → 3p comes out 2.18 eV against the D line's 2.104 eV. Most
  anions are not bound at all in this LDA — H⁻, C⁻, O⁻, F⁻, S⁻, Cl⁻ and O²⁻
  among them — and the app says so rather than drawing a wrong picture;
  bromine's and iodine's anions are.
- **Relativity, as a switch.** *Off* is the model above exactly as
  described. *Scalar* (Koelling–Harmon: the mass-velocity and Darwin
  terms, no spin–orbit) is the default from caesium (Z = 55) onward, where
  the non-relativistic error passes a few percent; *With spin–orbit* (the
  full radial Dirac equation) is available for any element on request, and
  both are validated against NIST's own ScRLDA/RLDA tables to within 1 %
  (see [Limitations](#limitations)). With spin–orbit on, every p/d/f
  subshell splits into its j-levels (6p½, 6p³⁄₂, …), each occupied in
  proportion to 2j + 1 — uranium's open 5f³ reads "1.29 of 6 e⁻" in 5f⁵⁄₂ —
  and the orbital energy diagram, the subshell chips and the breadcrumb all
  name the j-level rather than the plain subshell. Switching to a
  relativistic mode adds a dashed curve to the radial plot (the same
  species' own non-relativistic D(r), for a direct before/after comparison)
  and a "what changed" readout naming the outermost occupied s shell's
  contraction, e.g. gold's 6s contracting 14.1 % (mean radius 3.31 → 2.85
  a₀) — both state their method in the same line, and both say plainly when
  they are unavailable (an unconverged or unbound non-relativistic
  baseline) rather than silently vanishing. The ionisation/excitation
  energies stay non-relativistic ΔSCF in every mode — the UI says so
  whenever the picture itself is relativistic, so a heavy atom's shown
  energy never reads as carrying a shift it does not include. Every export
  (image, CSV, cube) names the mode, and any j-level, in its caption and
  file name.

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
- **Combinations** — sp, sp² and sp³ hybrids of hydrogen's 2s and 2p (one at a
  time in phase colours, or all at once, one colour each), and hydrogen in an
  electric field: the 1s polarised to first order (μ = αF, α = 9/2 a₀³) with
  the field in a.u. and V/m, and the n = 2 Stark states (2s ± 2p_z)/√2 with
  their ±3F shifts. The radial plot shows what went in: 2s, 2p and their
  weighted sum, which is the combination's exact radial distribution.

### Bonds mode

- **H₂⁺, solved exactly.** The one molecule whose Schrödinger equation
  actually separates: in prolate spheroidal coordinates (λ, μ), with the
  nuclei fixed (Born–Oppenheimer), the two coupled equations are solved by
  expanding each in a basis that already meets its own boundary conditions —
  normalised Legendre functions for the angular factor, Jaffé's series for
  the radial one — and finding the one energy at which both agree, by
  bisection, with no fitting and no basis-set error. The slider covers R =
  0.5 to 10 a₀; below it the picture is already the He⁺ united atom, above it
  the bond is gone. Two states are drawn: **1σg**, bonding, the pile-up of
  density between the nuclei that a free hydrogen atom's 1s does not have,
  and **1σu\***, antibonding, with a node across the midplane. R_e = 1.997 a₀
  and E(R_e) = −0.6026 Ha match the published values to the spec's tolerance,
  and E_el(1σg, R = 2 a₀) = −1.102634 Ha matches the reference to six
  significant figures — the solver's own error at every point is some
  10⁻¹⁰ Ha, far past any of these bars (see
  [Limitations](#limitations) for what "exact" still leaves out). 1σu\* has
  no minimum anywhere on the slider's range: it is not flatly repulsive, but
  its only well — 0.06 mHa deep, a polarisation effect — sits at 12.5 a₀,
  outside what the slider shows, and the caption says so rather than call
  the curve something it is not.
- **Ten more diatomics, precomputed.** H₂, He₂, Li₂, B₂, C₂, N₂, O₂, F₂, CO
  and HF, each a bond-length scan of up to twenty points (13–20 ship;
  curves stop where single-reference CCSD(T) stops being valid) — dense
  near R_e, sparse out towards dissociation — computed once, offline, and
  shipped rather than
  solved in the browser. Energies are CCSD(T)/aug-cc-pVTZ (full CI for H₂,
  and for He₂ too — four electrons is still exact within the basis and
  cheap, going further than the two-electron case the spec itself asks for);
  densities and orbitals are B3LYP/def2-TZVP; O₂ and B₂ (triplets) run
  unrestricted and C₂ (a closed-shell singlet) restricted, all three with
  their occupations pinned so the self-consistent field cannot wander into
  another state. The slider snaps to one of the shipped scan points — there
  is no geometry between them, because nothing between them was ever
  calculated. R_e lands within 1 % of experiment everywhere the spec checks
  it: N₂ 1.104 Å (1.098), O₂ 1.213 Å (1.207), F₂ 1.418 Å (1.412), CO 1.136 Å
  (1.128), HF 0.921 Å (0.917); H₂'s R_e (1.404 a₀ against 1.401) and D_e
  (4.71 eV against the exact 4.75 eV) both land inside their own, wider
  bars. O₂'s ground state is confirmed the triplet it is given as: the same
  pipeline's UCCSD(T) places it 0.048 Ha (1.30 eV) below the closed-shell
  singlet computed at the same geometry.
- **A curve stops exactly where its method does.** Single-reference
  CCSD(T) is not trusted past the point its own diagnostics say it should
  be, so a curve ships only as far as the first scan point that fails to
  converge, whose T1 diagnostic exceeds 0.02 (closed-shell) or 0.03
  (open-shell) — or 1.5× T1's own value at R_e, if that is looser — or where
  the energy turns over instead of continuing to rise towards dissociation.
  N₂ ships 14 of its 20 computed points, stopping at R = 2.53 a₀, where T1
  reaches 0.0214; O₂ ships 16 of 20, CO 13, F₂ 15, HF 17. The caption names
  both the stopping point and the reason every time — "the bond breaks into
  open-shell atoms" is the method's own limit, not a defect in a number this
  app reports.
- **B₂ and C₂ are kept regardless, and say so first.** Both molecules' T1
  diagnostic is already past the single-reference limit at R_e itself
  (0.040 against a limit of 0.030 for B₂'s triplet; 0.038 against 0.020 for
  C₂), so CCSD(T) and B3LYP are only qualitative for either, throughout.
  They ship anyway, each captioned "strongly multireference" ahead of
  everything else, because B₂'s paramagnetism (its ground state is the
  triplet ³Σg⁻, two unpaired electrons in 1πu, bond order 1) and C₂'s
  contested bond (bond order 2 by the simple count, though the real
  picture is more complicated) are worth showing honestly captioned, not
  omitting.
- **Dissociation energy always comes from separated atoms, never from the
  last point on a curve.** A curve cut short at its validity limit has not
  reached dissociation, so D_e is computed independently: free-atom
  calculations at the molecule's own method, basis and ground spin state
  (N: ⁴S, O: ³P, and so on — full CI for H and He), so D_e = E(A) + E(B) −
  E(R_e) compares like with like, with no counterpoise correction.
  aug-cc-pVTZ underbinds by a few % against experiment (N₂ 9.44 eV against
  9.91, O₂ 4.98 against 5.21; H₂ at full CI 0.9 %), and the caption says so.
- **He₂ has no chemical bond.** At full CI, its curve shows only a van der
  Waals well about 0.04 mHa deep — the same order as this basis's own
  superposition error. Bond order 0; the view opens not at a fitted
  "equilibrium" (there isn't one) but at the scan's actual lowest-energy
  point, R = 5.85 a₀ — van der Waals contact, not a bond — and the caption
  says exactly that rather than a found "R_e" implying otherwise.
- **Li₂ is exact, with a caveat.** Both lithium 1s cores are frozen, which
  leaves CCSD(T) correlating only the two valence electrons — where it is
  full CI, exactly, so the whole 20-point curve ships with no cutoff. But a
  frozen core cannot correlate with the valence pair at all, and that
  missing core–valence correlation puts R_e about 1 % longer than
  experiment (2.673 Å); the caption states the method is exact for the
  valence pair, not that R_e itself is.
- **Be₂ is not among the ten.** Its bond order is 0 in the simple MO
  picture — the two extra valence electrons past Li₂ exactly fill the
  antibonding level that cancels the bonding one — and showing it honestly
  needs its own bond-order-0 caption and validation row rather than reusing
  the rest of the table's. Deferred to a future data version; see
  [docs/HANDOFF.md](docs/HANDOFF.md).
- **Every orbital has a name, not a number.** Labels come from the
  molecule's own D∞h or C∞v symmetry (nσg, nσu\*, nπu, nπg\*, numbered per
  irrep in energy order); the antibonding star means something for a
  homonuclear molecule only, so CO and HF's bond order is left undefined
  rather than guessed from it. The diagram draws every occupied orbital plus
  the virtuals with the largest overlap onto a minimal atomic basis, up to
  that basis's size; clicking a level draws it. Dragging R keeps "3σg"
  selected by its label, not its position in a list, because the orbital
  ordering PySCF reports can shift between geometries. An orbital
  occasionally ties for selection with another virtual of the same symmetry
  at a compressed geometry (CO's 6σ is one); the panel says so, rather than
  presenting one arbitrary pick as the only one.
- **The molecular-orbital diagram.** Kohn–Sham eigenvalues, drawn to scale
  for the valence levels, with the 1s cores — more than a hartree lower —
  collapsed into their own compressed row below a break. Labelled as orbital
  energies and nowhere as ionisation energies, the same distinction atom
  mode draws. O₂'s two unpaired electrons show exactly where Hund's rule
  puts them, each a single up arrow in a degenerate 1πg\* box; He₂'s HOMO is
  already antibonding, which is what its bond order 0 means. The
  unrestricted molecules (O₂, B₂) draw α energies, with a down arrow
  marking the matching β orbital; where β orders two levels the other way,
  the diagram names them. O₂'s α levels put 1πu just below 3σg, but in β —
  and in its photoelectron spectrum — 3σg lies below 1πu, the textbook
  O₂-versus-N₂ swap, and the caption under the diagram says exactly that.
- **The density is drawn at a fixed value, not a fraction.** The app
  evaluates ρ = Σ occᵢψᵢ² directly from the molecule's own shipped Gaussian
  basis, at exactly one of three choices — 0.002, 0.05 or 0.2 e/a₀³ — never
  "the contour holding 90 % of the electrons": a grid coarse enough to keep
  every molecule's data under its size budget cannot integrate a nitrogen
  1s cusp finely enough for a claimed percentage to mean what it says. The
  lowest value, 0.002 e/a₀³, is the conventional molecular outline and means
  the same thing for every molecule; the panel also reads straight off the
  density whether the surface at the chosen value is still one envelope
  around both nuclei or has already split into two separate pieces around
  each — a number alone does not say which.
- **Exports name the system, the geometry and the method**, in the caption
  and the file name alike. The CSV is the potential curve E(R), not a radial
  distribution; the cube file is ψ for an orbital or ρ for a density (never
  the √ρ the app samples internally), with both nuclei written into it.
- **Regenerating the data.** The whole pipeline lives in `tools/molecules/`,
  a Python offline tool with no runtime role in the app:

  ```bash
  uv venv --python 3.12 --managed-python tools/molecules/.venv
  uv pip install --python tools/molecules/.venv/bin/python -r tools/molecules/requirements.txt
  tools/molecules/.venv/bin/python tools/molecules/generate.py --only n2
  tools/molecules/.venv/bin/python -m pytest tools/molecules -q
  ```

  `generate.py` caches every reference calculation under a hash of what
  decided it (method, basis, geometry, PySCF version and more), so a run cut
  short resumes rather than redoing finished points; dropping `--only`
  regenerates every molecule. The generated tree
  (`tools/molecules/out/<version>/`) is never committed and never bundled —
  it is published to S3 behind CloudFront, versioned and immutable, and
  served through a small Vite dev middleware locally before it is published.
  See [docs/HANDOFF.md](docs/HANDOFF.md) for the publish and deploy details.

### Molecules mode

- **25 real molecules, five categories.** First examples (H₂O, NH₃, CH₄,
  CO₂), hybridisation (C₂H₂, C₂H₄, C₂H₆, HCN, H₂CO, BF₃, SiH₄), polarity
  (SF₆, O₃, NO₂, SO₂, PH₃, H₂S, CH₃OH, HCOOH, ethanol, acetone), aromatic
  (benzene, pyridine) and biomolecule fragments (formamide, glycine) — picked
  by name, formula or category from a search list, not typed as a formula.
  Every molecule shows ball-and-stick geometry (hover an atom or bond for its
  length/angle, each captioned with its source), the total electron density,
  the electrostatic potential mapped onto that density, and the full list of
  molecular orbitals with HOMO and LUMO marked and a divider at the
  HOMO–LUMO gap.
- **Methods, stated on every number.** Geometry is experimental (CCCBDB)
  where symmetry fixes it in a few parameters, or B3LYP/def2-TZVP optimised
  (PySCF + geomeTRIC) for the seven molecules without a usable experimental
  structure — `meta.geometrySource` names which, on screen, every time.
  Density, dipole, electrostatic potential and orbitals are all
  **B3LYP/def2-TZVPD**: the owner's call (2026-10-05) after the plain
  def2-TZVP basis missed five molecules' dipoles outside tolerance (water,
  ammonia, hydrogen sulfide, ethanol and ozone); adding def2-TZVPD's diffuse
  functions brought every one back within tolerance except ozone, which
  ships as a documented exception (below). NO₂, the one open-shell molecule
  here, is solved ROKS (restricted open-shell Kohn–Sham) — one orbital set,
  its unpaired electron a SOMO, not a separate α/β pair.
- **The electrostatic potential is mapped at exactly ρ = 0.001 e/a₀³** —
  the conventional ESP isosurface, not an enclosed fraction of the density
  — on a fixed, symmetric ±0.05 Ha/e (±31.4 kcal/mol) colour scale, the same
  for every molecule so two molecules' polarity can be compared by eye:
  red where the surface is negative (electron-rich — lone pairs, π faces),
  blue where it is positive (electron-poor — acidic H). A molecule whose own
  range is narrower than the scale reads pale; one that exceeds it is
  captioned "saturated beyond the scale" rather than silently re-scaled.
  The total-density surface, by contrast, is still the enclosed fraction
  (the Electron Enclosed select), but evaluated on a voxel-averaged grid —
  unlike Bonds mode's fixed-ρ density (see [Bonds mode](#bonds-mode) above)
  — because voxel averaging, not a fixed value, is what makes a library
  molecule's grid integrable past a heavy atom's 1s cusp at this box size.
- **Ozone is a known miss, pinned both ways.** B3LYP/def2-TZVPD gives
  ozone a dipole of 0.66 D against the experimental 0.53 D — outside even
  the floored 10 % tolerance below — because ozone has strong
  multireference character that a single-reference method like B3LYP
  does not capture well. Rather than hide it or quietly loosen its row's
  tolerance, ozone's dipole reference carries a `knownMiss` flag (both in
  the Python reference table and in the TypeScript `ValidationRow` it
  produces) that the validation table and a test pin to fail exactly as
  stated; the app's own readout shows the same sentence as a caption next
  to ozone's dipole.
- **Dipole tolerance is 10 %, floored at 0.05 D.** The spec states
  dipoles' tolerance verbatim as "within 10 % of experiment"; for a small
  dipole (NO₂'s 0.316 D, for instance) a bare 10 % is tighter than the
  method can be expected to hit, so every dipole row's tolerance is
  `max(10 % of experiment, 0.05 D)` — a deliberate, documented deviation
  from the spec's verbatim wording, stated here and in every affected row's
  method caption.
- **The box margin is 6.5 bohr past the outermost atom.** Wide enough that
  def2-TZVPD's diffuse functions — the same ones that fix the dipoles above
  — do not leak density through the sampling box's own face; HCN, the
  worst case, still has face density under 2×10⁻⁶ e/a₀³ at this margin. A
  narrower box that looked fine at def2-TZVP started leaking once the
  diffuse functions were added, which is why the margin is wider here than
  Bonds mode's.
- **The orbital list, not a diagram.** Unlike Bonds mode's two-level
  molecular-orbital diagram (drawn for a diatomic's cylindrical symmetry),
  a library molecule's point-group symmetry varies too widely for one
  diagram component to read well across all 25, so the Plot slot here
  shows `MoleculeOrbitalList` instead — every orbital, energy-descending,
  with HOMO/LUMO marked and each member of a degenerate set on its own
  row, badged with the set's size ("×3" on each of SF₆'s triply-degenerate
  HOMO rows under its octahedral symmetry), so every orbital can still be
  picked and drawn.
- **Exports name the orbital, not just the molecule.** The PNG caption,
  file stem, glTF/STL and the Gaussian-cube header all carry the molecule's
  name, formula and, for an orbital, its label and index (e.g.
  `orbital-viewer_NH2CH2COOH_mo19-16ap.png` for glycine's HOMO). The ESP
  surface's cube file states its own semantics in its title line — the
  raw ESP grid in Ha/e, sampled on the density's ρ = 0.001 surface, never
  confused with the density values a non-ESP cube carries. The orbital
  list itself exports as a CSV (index, label, energy in Ha and eV,
  occupancy, HOMO/LUMO/SOMO role).
- **Regenerating the data.** The same offline pipeline as Bonds mode
  (`tools/molecules/`), with the library's own modules:

  ```bash
  tools/molecules/.venv/bin/python tools/molecules/optimise.py glycine --basis def2-SVP   # repeat until converged
  tools/molecules/.venv/bin/python tools/molecules/optimise.py glycine                    # def2-TZVP, repeat until converged
  tools/molecules/.venv/bin/python tools/molecules/build_library.py --only glycine
  tools/molecules/.venv/bin/python tools/molecules/build_library.py --rows-only
  tools/molecules/.venv/bin/python tools/molecules/publish.py v2 --manifest-only
  tools/molecules/.venv/bin/python tools/molecules/publish.py v2 --dry-run
  ```

  `optimise.py` is only needed for the seven molecules without a usable
  experimental geometry; `build_library.py --only <id>` builds one
  molecule's files (meta, grids, basis) into `version.OUT_ROOT/<id>/`
  without touching the others, and `--rows-only` rebuilds the validation
  table from whatever is already on disk, without recomputing anything.
  Every file actually published must come from **one clean generator
  commit** — `publish.py` refuses to publish a tree mixing provenance from
  two different commits — so a real `publish.py v2` run (no
  `--manifest-only`/`--dry-run`) is a deliberate, reviewed step, not a
  routine part of iterating on one molecule.

### Across every mode, to look inside

- **A default view per element.** Picking an element gives you the standard
  view of it, derived from its own solved profile: the camera back at the
  canonical angle, framed on that atom's own extent, with the cut-away on and
  centred. Opacity and enclosed fraction are yours and are left alone.
- **Solid or wireframe.** Wireframe is see-through; solid is the only readable
  option at high resolution, where a wireframe becomes a wall of lines.
- **Opacity**, so outer shells stop hiding inner ones.
- **A cut-away plane** along X, Y or Z, positioned with a slider. The cut face is
  capped and shaded by the density it passes through, so a slice through a 7s
  reads like tree rings rather than a hollow shell. The shell views need a cut
  (it is all they draw); an orbital is shown whole when you open it, and the
  shell view's cut comes back when you step out.
- **z up**, the chemistry convention, so 2p_z, 3d_z² and 4f_z³ stand
  upright. The axes are labelled, and orbital surfaces carry a key for the
  sign of ψ.
- **Bonds reuses the same viewer**, cut plane, opacity, solid/wireframe,
  camera and Share/Export alike — an H₂⁺ state or a molecular orbital is a ψ
  surface, red and blue by sign exactly like Basic Orbitals' own; a density
  surface has no phase to show, so it is drawn in a single neutral grey
  instead.
- **Panels that stay off the atom.** Navigation runs down the left, view
  settings and the radial plot down the right, and the scene is centred and
  fitted in whatever the panels leave uncovered — on a phone too, where it
  moves up when the controls sheet opens. While a new element solves or an
  orbital is meshed, the old picture dims and says what it is waiting for.
- **A scale bar in Bohr radii.** The camera frames every view to fill the
  screen, so without this a carbon 3d looks exactly like a hydrogen 3d despite
  being six times smaller.

---

## Computed molecules (on request, owner only)

Molecules mode's 25-molecule library (above) is picked and built ahead of
time. On top of it, the owner can request any further molecule — by name,
SMILES or pasted XYZ — computed on demand against the same real
quantum-chemistry pipeline the library itself comes from. Every molecule
carries a visible tier badge: **Validated** for one of the 25 library
molecules, checked against an experimental or published reference, or
**Computed** for one requested on demand, by the same method but not
benchmarked against anything. "Computed" is a promise about the method, not
about accuracy — nobody has checked this particular result against
experiment.

A computed molecule's link, `#mode=molecule&job=<64-character job key>`,
opens for anyone — there is no sign-in to view one. Before the job has
finished, or if it failed, the link says so explicitly ("This computed
molecule has no finished result yet: its job may still be running, or it
failed. Open the link again once it has finished.") rather than a blank
screen or a stale picture left over from whatever was open before.

**"How this was computed"**, on every molecule of either tier, states the
method, where the geometry came from (CCCBDB experiment or a
B3LYP/def2-TZVP optimisation for the library; a PubChem record or pasted
XYZ coordinates for a computed one) and what to be wary of. For a computed
molecule it also links the files that produced it — `input.py` (the exact
PySCF script; open it and run it again), `output.log`, `geometry.xyz` and
`job.json`, plus `trajectory.xyz` for an optimisation. The dev server
serves them as plain text, to read in the browser rather than download,
and so does production: the AWS worker writes them to S3 as `text/plain`
(`.py`, `.log`, `.xyz`) or `application/json` (Phase 6B-3). The owner, signed in or on This Mac, sees one more
line: the job's own wall time and cost, read from the job record itself,
never from the published molecule.

**Requesting one** is owner-only, and only where the build knows how to run
jobs: on the dev server, or in a production build once signed in. On the
dev server, start the local job server (needed only for This Mac; never
for AWS):

```bash
cd tools && ../tools/molecules/.venv/bin/python -m jobs.local_server
```

Then choose **This Mac** in the "where jobs run" group next to
Share/Export. The side panel's "Request a molecule" takes a name, SMILES or
pasted XYZ, previews what it resolved to (formula, charge, electrons, a
ball-and-stick SVG, which recipe and sizing it would run, and the owner's
predicted time and cost) and submits it. The status panel then polls every
5 seconds — stage, latest energy, a log tail, elapsed time against the
Fargate time estimate, and the cost reserved or spent — until the job
finishes and opens itself, or fails with the option to retry the same
atoms as a new attempt. The job is followed for as long as the page is
open, whatever the mode or the phone sheet shows, and the typed request
survives folding the sheet or switching tabs.

**`/admin.html`** is the owner's dashboard: every job this month in a
plain, sortable, filterable table (predicted against actual time and
memory, with the same file links), and a cost panel — spent, reserved,
remaining, projected by month end, a day-by-day spend chart and, on AWS,
the billed figure from Cost Explorer. It is a second Vite entry, built and
shipped entirely apart from the main page: `infra/deploy.sh` runs
`node tools/check_admin_split.mjs dist` after its build and refuses to
deploy if that ever stops being true (`npm run check:admin-split` runs the
same check by hand after any build).

**Build-time settings:**

| Variable | What it does |
| --- | --- |
| `VITE_JOBS_API_URL` | the deployed API's base URL (production only; the dev server always uses the local proxy below) |
| `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN` | Cognito managed login; leave any one unset and there is no sign-in: the dev server and `/admin.html` say "not configured in this build", and the production viewer shows visitors no sign-in line at all |
| `JOBS_AWS_API_URL` | dev-server only: where the proxy sends an "AWS" request (`/api/aws/…`); unset, AWS falls through to the local server, which the UI reports as not configured |

---

## Share and export

**The address bar is always the link.** Every change — element, level,
camera, cut, opacity, combination — rewrites the URL hash (debounced, via
`replaceState`, so a slider drag is not a hundred Back-button stops), so
there is no separate "generate link" step: the **Share** button next to Reset
View just copies what is already there. If the clipboard is refused (plain
http, an iframe without permission) it shows the link in a dialog to copy by
hand instead. Opening a link applies what it can and ignores the rest —
a hand-edited or truncated key never throws, it just falls back to the
deepest valid part of the view — and closes the periodic-table pop-over so
the view it just restored is visible.

The spec's own example — iron, the 3d_z² orbital, cut through the nucleus
along x, at a 90% contour:

```
#mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&cut=x:0.5&frac=0.9
```

| Key | Meaning |
| --- | --- |
| `mode` | `atom`, `basic`, `bonds` or `molecule` |
| `frac` | enclosed fraction — one of the presets 0.5, 0.75, 0.9, 0.95, 0.99; any other value is ignored |
| `cut` | `none`, or `<x\|y\|z>:<depth>` — depth 0–1 as the Depth slider shows it (0 nothing removed, 0.5 through the nucleus, 1 everything) |
| `op` | opacity, 0.05–1 |
| `surf` | `solid` or `wire` |
| `cam` | `<azimuth>,<elevation>`, whole degrees; left out at the canonical view, and a link with no `cam` key resets a moved camera to canonical rather than leaving it where it was |
| `Z`, `level` (`atom`\|`shell`\|`orbital`), `n`, `l`, `ml` | atom mode's element and drill-down |
| `charge` | atom mode's ion charge, an integer; ignored (falls back to neutral) unless the element actually offers it |
| `excite` | atom mode's promoted electron, `<from>-<to>` e.g. `3s-3p`; ignored (falls back to the ground state) unless the current element and charge offer that promotion |
| `rel` | atom mode's relativistic treatment, `scalar` or `so` (with spin–orbit); written whenever the mode shown is not off, so an absent or unrecognised `rel` means off — which is what every link made before relativity showed |
| `j` | atom mode's j-level of the subshell `l`, `1/2`, `3/2`, `5/2` or `7/2`; with spin–orbit only, and only l ± ½ (½ for s) — anything else is ignored. A link's `j` that the mode shown does not have opens the shell instead |
| `n`, `l`, `ml` | Basic Orbitals' quantum numbers |
| `combo` (`sp`\|`sp2`\|`sp3`\|`field`\|`none`), `member` (a hybrid's index, or `all`), `level` (a field's: 1 or 2), `F` (field strength, a.u.), `stark` (`lower`\|`upper`\|`both`) | the Combination picker |
| `system` | Bonds mode's system — `h2plus` or one of the ten diatomic ids (`h2`, `he2`, `li2`, `b2`, `c2`, `n2`, `o2`, `f2`, `co`, `hf`); an id this app does not offer is ignored, falling back to H₂⁺ |
| `R` | Bonds mode's internuclear distance, in bohr; H₂⁺ clamps and rounds it to its slider's 0.01 a₀ step within [0.5, 10], a diatomic snaps it to the nearest of its shipped scan points (up to twenty: 13–20 ship; curves stop where single-reference CCSD(T) stops being valid) once the scan has loaded |
| `state` | Bonds mode's drawn picture — `1sigma_g` or `1sigma_u` for H₂⁺; `density` or `density:<iso>` (one of 0.002, 0.05, 0.2) for a molecule's total density; `mo:<restricted\|alpha\|beta>:<label>:<component>` for a molecular orbital by its label (e.g. `mo:restricted:3σg:0`), never by index, so the link still finds "3σg" if PySCF's own ordering differs at another R |
| `id` | Molecules mode's selected molecule, one of the 25 library ids (`h2o`, `glycine`, …); an id this app does not offer shows an explicit "this link names no molecule in the library" message rather than a blank screen |
| `show` | Molecules mode's drawn surface — `density`, `esp`, or `mo:<index>` by the orbital's numeric index (unlike Bonds, which indexes by label: a library molecule's orbital order does not shift the way a diatomic's can across geometries, since there is no slider here); an index with no matching orbital falls back to `density` once the molecule's data has loaded |
| `struct`, `dipole` | Molecules mode's ball-and-stick and dipole-arrow visibility, `0` to hide (both default on, so only an off state is ever written) |

Atom mode's own keys always appear in the order `Z`, `rel`, `charge`,
`excite`, `level`, `n`, `l`, `j`, `ml` — so a non-relativistic neutral
ground state's link (no `rel`, `charge`, `excite` or `j`) is byte-identical
to one made before ions or relativity existed. Bonds mode's own keys always
appear in the order `system`, `R`, `state` — e.g.
`#mode=bonds&system=h2plus&R=2&state=1sigma_g`, or
`#mode=bonds&system=n2&R=2.09&state=mo:restricted:3σg:0` for a molecular
orbital. A link whose `system`, `R` or `state` cannot be used is ignored
like any other malformed key — `R` falls back to the molecule's own
equilibrium point (or, for an unbound molecule, its van der Waals contact),
and an unrecognised `state` falls back to the total density.

`frac`, `cut`, `op` and `surf` are always written, even at their defaults, so
a link reproduces the sender's picture in any tab rather than whatever that
tab's settings happened to be; a hand-written link that leaves one out keeps
the opening tab's own setting for it (only a missing `cam` resets). `frac` is
the contour drawn: in Basic Orbitals a new fraction counts once Update Orbital
has drawn it. Number keys (`frac`, `op`, `cam`, `F`) accept
decimal literals only — hex, leading `+`, or stray whitespace are ignored
like any other malformed key, not parsed as a number nobody wrote.

**Export**, beside Share, offers:

- **Image (PNG, 2×)**, with or without the caption/scale-bar/key overlay —
  twice the on-screen resolution, capped at 4096 px on the long side,
  cropped to the area the side panels leave free. The caption states the
  view and its method, word-wrapped to the image width; the key is either
  the plain ψ-sign key or, when a combination is on screen, its own colour
  key. Refuses while the picture is still computing (a shell's lobes and a
  level transition included), while the atom is solving, if a shell's lobes
  failed to compute, or if the WebGL context is lost mid-capture.
- **Radial curves (CSV)** — UTF-8 with a BOM, LF line endings, `#`-prefixed
  comment lines (what the view is, the quantity plotted, the method, and the
  share link for this exact view), one column per curve against a shared
  `r` (bohr). Basic Orbitals and the Combination picker sample 240 points —
  the same count the plot itself draws; atom mode's curves are the SCF's own
  grid samples. Bonds mode's CSV is its potential curve E(R) instead of a
  radial distribution — H₂⁺'s own 191-point solved curve, or a diatomic's
  shipped scan points (up to twenty: 13–20 ship; curves stop where
  single-reference CCSD(T) stops being valid) — with the method and, for a
  diatomic, the multireference or validity-cutoff caveat in the comment
  lines too. Molecules mode's CSV is different again: not a curve but the
  **orbital table** — index, label, energy (Ha and eV), occupancy and
  HOMO/LUMO/SOMO role for every orbital, in the same energy-descending order
  the on-screen list shows.
- **3D model (glTF, `.glb`)** — binary, colours kept, scaled so the model is
  20 cm across (a convenient AR/tabletop size); the scale back to bohr
  (`metresPerBohr`) is recorded in the root node's `extras`.
- **3D print (STL)** — binary, in millimetres, at a chosen longest-side size;
  the scale is recorded in the file's own header. Refused unless every
  surface is watertight (every edge shared by exactly two triangles,
  consistently oriented) — a half-open contour from a low enclosed fraction
  is the usual cause, and the message suggests lowering it. A shell's lobes
  or a hybrid overlay's members export as that many separate solids, each
  individually watertight; where a file holds more than one, the dialog
  says so ("N overlapping solids, each watertight; your slicer merges them
  into one") rather than calling the whole file watertight. glTF and STL
  are not offered at atom mode's whole-atom level, which is a shaded cut
  face rather than a surface; open a shell or an orbital first.
- **Field grid (Gaussian cube)**, lengths in bohr throughout. For an orbital
  or a single-member field it is ψ itself (real, bohr⁻³ᐟ²), sampled on
  exactly the grid that was drawn. For atom mode's whole-atom or shell
  levels — no 3D field to sample — it is ρ(r) = D(r)/(4πr²) in
  electrons/bohr³, on a box enclosing 99.9% of the shown curve, with a note
  that features finer than the grid spacing (a heavy atom's 1s) are not
  resolved. A multi-member overlay (a hybrid's "All", Stark's "Both") is
  refused — it is several fields in one picture, not one grid. Built in a
  Web Worker. Bonds mode's cube carries both nuclei and names the system and
  R in its title; a density surface's cube is ρ itself, not the √ρ the field
  evaluator sends the renderer. Molecules mode's cube follows the same rule
  for density and orbitals; its **electrostatic potential** cube is
  different again — the raw ESP grid itself, in Ha/e, not a wavefunction or
  a density, with a title line that says exactly that ("…, ESP grid
  (Ha/e)") so it is never mistaken for a surface-value file.

Every export states its method (the same wording the caption, CSV and cube
headers all use), and refuses with a stated reason rather than writing an
empty, partial or non-watertight file: when nothing is drawn, the picture is
still computing, the atom is still solving, a combination is refused (its
own message), or the last render failed.

**Not exported:** the cut (geometry export takes the whole surface — a cut
is a view setting, and a cut surface would not print or display correctly),
and the camera's distance (the URL carries only its direction — see the
Design decisions in [docs/HANDOFF.md](docs/HANDOFF.md) for why).

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

### Solving Bonds mode

**H₂⁺ is solved, not looked up.** Its own worker separates the Schrödinger
equation in (λ, μ) and finds the energy at which the μ equation's lowest
eigenvalue and the λ equation's highest agree, by bisection on a bracket
derived from the physics itself (both states lie between the He⁺ united
atom's 1s and the separated H 1s limits). Dragging the slider resolves a new
R on every release, in well under a millisecond per point; the potential
curve across the whole 0.5–10 a₀ range (191 points, sampled every 0.05 a₀;
the slider itself steps 0.01 a₀) is computed once per session, off the main
thread, in its own worker, and cached for the rest of it — a failure is not
cached, so returning to H₂⁺ asks again.

**A diatomic's picture comes from its own shipped Gaussian basis, not a
downloaded mesh.** `basis.json` carries the molecular-orbital coefficients
on the same real spherical-harmonic AO convention PySCF itself uses; the app
evaluates ψ or ρ from those coefficients at render time, in the same Web
Worker (and the same marching-cubes code) that draws every other surface in
the app. A molecule's data loads lazily — nothing under `/molecules/` is
fetched until Bonds mode actually picks one — and is fetched once per
session; a failed fetch is forgotten, so the next attempt is a real retry,
and the canvas keeps showing the previous system rather than going blank.

**Meshing runs at 96³**, not the 129³ a single Basic Orbitals surface gets:
timed against §3.7's 1.5 s budget on a 2020-class laptop, the dearest case
measured (O₂'s density, sampled and meshed) came to 0.7–0.9 s; H₂⁺ alone at
the higher 128³ resolution ran 1.1–1.7 s, over budget on a slow machine, which
is why Bonds settled on the lower one.

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

**Relativity is a switch, not a fixed approximation — but *Off* keeps its
old error, uncorrected.** Relativistic corrections scale roughly with Z², so
they are genuinely negligible for light elements and genuinely not for heavy
ones: with the switch *Off*, neon's orbital energies are still within 0.25%
of the relativistic value, but gold's 6s is still **27% away** —
precisely the relativistic contraction of the 6s orbital that is the
textbook explanation for why gold is yellow rather than silvery like most
metals. *Scalar* (Koelling–Harmon: the mass-velocity and Darwin terms) is
on by default from caesium onward, where that error passes a few percent;
*With spin–orbit* (the full Dirac equation) is available for any element on
request. Both are validated against NIST's own ScRLDA/RLDA reference tables
to within 1 % for the eight validated atoms (Ne, Ar, Kr, Xe, Au, Hg, Rn, U),
and within 0.1% for Z ≤ 18 specifically against
NIST's own relativistic columns — switching relativity on still moves a
light atom's own numbers measurably (argon's total energy by 0.30%, its 3s
orbital energy by 0.82%), which is real physics the non-relativistic number
was never claiming to capture, not an error in either number. *Off* is still
offered and still computes the plain non-relativistic number exactly as
before — now clearly labelled as such, and no longer the only number this
app can show for a heavy atom.

**Isolated atoms and their ions — no molecules.** An ion or an excited atom
uses the same model with its own electron count or one electron moved, so
this is still one atom at a time. Spin–orbit coupling is a relativity mode
(above), not always included: with it on, a p/d/f subshell's j-levels
(6p½, 6p³⁄₂, …) carry real orbital energies and real radial functions R(r) —
but the orbital lobe you can drill down to still draws the ordinary l-basis
angular shape, never the true |j, mⱼ⟩ angular dependence: its large
component keeps the one l but mixes two mₗ values with the two spin states,
which has no analogue in this renderer. **Most
anions are not bound at all in this LDA** — H⁻, C⁻, O⁻, F⁻, S⁻, Cl⁻ and O²⁻
among the elements light enough to validate — and the app reports that
rather than drawing a picture for an electron the model does not actually
keep; Br⁻ and I⁻ are bound, and the spec's size-ordering check runs against
those two (without relativity: forced into a relativistic mode, both are
reported unbound by an approximate check — see `docs/HANDOFF.md`).

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

**Hybrids are a basis choice, not a state.** They describe bonding
directions; a free hydrogen or carbon atom is not in one. The 2s enters with
a minus sign, because hydrogen's 2s is negative beyond its node at 2 a₀ where
95 % of it lies, and this is the sign that points each large lobe along its
axis. **The field view is first-order perturbation theory:** valid for
F ≪ 1 a.u., tunnelling ignored, refused above 0.05 a.u. (n = 1) and above
0.0039 a.u. (n = 2, where the electron would no longer be bound). **No
molecules here** — that is Bonds mode, below.

**Non-relativistic, spinless.** No fine structure, no spin–orbit coupling. For
high Z, where relativistic effects genuinely matter, the shapes shown are
increasingly a fiction.

### Bonds mode

**Born–Oppenheimer throughout.** Every system here — H₂⁺'s exact solution and
every precomputed diatomic alike — fixes the nuclei and solves only the
electronic problem; there is no nuclear motion, no vibrational levels, no
zero-point energy. D_e is the bare electronic well depth, stated as such; the
true, spectroscopic D₀ is always a little smaller.

**A diatomic is sampled only at up to twenty geometries** (13–20 ship; curves
stop where single-reference CCSD(T) stops being valid). The slider snaps to
the nearest of them; nothing between two scan points was ever calculated, so
there is no continuous potential curve to read off more finely than that —
the spacing itself is the method's own compromise between resolving R_e
(dense there) and reaching towards dissociation (sparse further out).

**Single-reference CCSD(T) has a stated reach, and the curve stops at it.**
Past the point named in its own caption, the method itself is no longer
trusted for that molecule (see [What it shows](#bonds-mode) above) — this is
not a gap in the data, it is where single-determinant quantum chemistry
genuinely stops describing a bond breaking homolytically into open-shell
atoms. B₂ and C₂ are shown anyway, past their own single-reference limit even
at R_e, captioned as qualitative throughout.

**No counterpoise correction anywhere.** D_e and He₂'s van der Waals well
both carry some basis-set superposition error; for every bound molecule here
it is far smaller than D_e itself, but for He₂, whose entire well is of that
same order, the well's depth should not be read as more precise than "a few
hundredths of a mHa, bound order 0".

**Densities and orbitals are B3LYP, not the energy method.** A molecule's
picture (density surface, molecular-orbital shapes and energies) comes from
a Kohn–Sham calculation separate from the CCSD(T)/FCI potential curve; the
two methods can, in principle, disagree on details neither this app nor its
validation checks. Orbital energies are Kohn–Sham eigenvalues — stated as
such on screen, next to every one — not ionisation energies, for the same
reason atom mode's own orbital energies are not: Koopmans' theorem does not
hold exactly for a density functional either.

**Li₂'s R_e is about 1 % too long**, and B₂ and C₂'s bond orders come from a
simple g/u electron count that does not capture either molecule's real
multireference character; both are captioned where they appear rather than
silently shown as exact.

### Molecules mode

**Ozone's dipole is a known miss, by design.** 0.66 D against experiment's
0.53 D, outside even the floored 10 % tolerance below — stated in ozone's
own caption and pinned as a `knownMiss` in both the Python reference table
and the TypeScript validation row, so a test fails if the miss is ever
silently "fixed" by a tolerance change rather than a real method change.

**The dipole tolerance is floored at 0.05 D**, not a bare 10 % as the spec's
prose states verbatim — a documented, deliberate deviation (see
[Molecules mode](#molecules-mode) above), because 10 % of a small dipole
like NO₂'s 0.316 D is tighter than B3LYP/def2-TZVPD can be expected to hit.

**The electrostatic potential surface is drawn at a fixed ρ, like Bonds
mode's density — never an enclosed fraction.** Unlike Bonds mode, though,
Molecules' own *density* surface (not ESP) is the enclosed fraction, just
evaluated on a voxel-averaged rather than point-sampled grid; the two
surfaces in this mode follow different rules from each other, and the panel
names which rule is in force next to each one.

**Geometries are frozen, not interactive.** Unlike Bonds mode's R slider,
there is no way to stretch, compress or rotate a bond length in Molecules
mode — each of the 25 molecules is shown at exactly one geometry (CCCBDB
experiment or a B3LYP/def2-TZVP optimum), and that is the only geometry its
data file holds.

**The ten diatomics behind Bonds mode are not in this library**, and their
own grids stay point-sampled as Phase 5 shipped them — they were
regenerated at the Molecules library's own generator commit (so a published
version is never a mix of two commits' provenance) but not changed in kind;
Bonds mode never draws a library molecule, nor vice versa.

### All four modes

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

**Export is the picture, not a saved session.** PNG, CSV, glTF, STL and
Gaussian-cube export what is on screen (see
[Share and export](#share-and-export)); there is no scene file, undo
history or bookmarked-session format beyond the URL. Geometry export always
takes the whole surface — the cut is a view setting and does not travel into
it — and the URL's camera key carries direction only, never distance.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 3200+ tests
npm run build      # production bundle into dist/
```

The dev server proxies "This Mac" jobs to `127.0.0.1:8787` (the local job
server, [above](#computed-molecules-on-request-owner-only)) and serves
computed molecules from `tools/molecules/out`; two environment variables
point it elsewhere instead — `JOBS_LOCAL_API_URL` and `JOBS_OUT_ROOT` —
which is how this project's own live checks run their own throwaway job
server and result directory without touching a running dev session's.

Bonds mode's ten diatomics and Molecules mode's 25-molecule library share one
offline Python pipeline under `tools/molecules/` — see [Bonds mode](#bonds-mode)
and [Molecules mode](#molecules-mode) above for how to run it. It is never
built by `npm run build`, and nothing under `/molecules/` ships in `dist/`:
the generated tree is published to the stack's own S3 bucket behind
CloudFront (`tools/molecules/publish.py`), versioned and immutable, and the
running app fetches it from there — in development, a small Vite middleware
serves it locally instead when it has been generated but not yet published,
falling back to the published CloudFront copy otherwise. The library ships
as its own data version, **v2** (483 data files plus the manifest; manifest
`tools/molecules/manifest/v2.json`), published from one generator commit
(`979f341`) that also regenerated the ten diatomics at the same commit —
identical to v1 apart from `meta.json`'s provenance (commit, dataVersion) —
so `publish.py` never ships a version mixing two commits' provenance.

Deployment is two AWS CDK stacks under `infra/`: the site (S3 + CloudFront)
and, since Phase 6B-3, the on-demand compute stack (Batch on Fargate, the jobs
API behind Cognito, DynamoDB, and the cost guards). `infra/README.md` is the
guide: its phases, what each needs, and the owner's controls.

```bash
./infra/deploy.sh                     # all: compute stack, worker image, then the site built against it
./infra/deploy.sh site                # the site only
```

With no argument it runs `all`, which deploys the compute stack and builds
and pushes the ARM64 worker image, so it needs `infra/owner.env` (one line,
`ALERT_EMAIL=…`, gitignored), OrbStack's `docker`, the AWS CDK CLI
(`npm i -g aws-cdk`) and credentials for the account; it pins us-east-1.
`site` alone needs only the CDK CLI and credentials. Before any site deploy
it refuses to ship a bundle whose owner dashboard leaks into the viewer
(`tools/check_admin_split.mjs`), or one that reads a molecule data version
which was never published — it checks `tools/molecules/version.py`'s
`DATA_VERSION` against `src/molecules/data_version.ts`'s
`MOLECULE_DATA_VERSION`, and both against a live HTTP 200 on that version's
`index.json` through CloudFront — rather than deploy an app that can load
nothing in Bonds mode.

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
| `src/field_source.ts` | The Combination picker's field types: the analytic/sampled source union, `FieldRenderRequest`, the evaluator, and the field-refusal message |
| `src/field_integrals.ts` | Grid quadrature on a sampled field: overlap and ⟨z⟩ integrals, and the positive-lobe centroid and share |
| `src/hybrids.ts` | sp, sp² and sp³ hybrid directions, recipes and sources for hydrogen's n = 2 shell, and their measured lobe axes |
| `src/stark.ts` | Hydrogen in a uniform field: the polarised 1s, the n = 2 Stark states, and α and ⟨2s\|z\|2p_z⟩ measured from the drawn grid |
| `src/combinations.ts` | The Combination picker's selection type, field requests, titles, radial curves and overlay legend |
| `src/field_overlay_view.ts` | Several field sources merged into one mesh, each member its own colour, no cut-face caps |
| `src/validation/` | The `VALIDATION` table behind the Methods page: every quantitative claim beside its reference value, `app` computed by the same function its physics test calls |
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
| `src/workers/` | The off-thread calculation: marching cubes (`orbitalWorker.ts`), the SCF solve (`atomWorker.ts`), and building a cube file (`exportWorker.ts`) |
| `src/url_state.ts` | The URL hash as the view: `encodeState`/`applyState`, the mode-keyed key-group registry (`registerUrlKeys`), and the shared/atom/basic key codecs |
| `src/share.ts` | The share link and its clipboard copy, with the pre-Clipboard-API fallback |
| `src/export/` | Each export format's encoder (`png.ts`, `csv.ts`, `stl.ts`, `gltf.ts`, `cube.ts`), the availability/refusal logic and dispatch (`run_export.ts`), and the surface collection and manifold check they share (`surfaces.ts`, `mesh_topology.ts`) |
| `src/components/ShareExportBar.tsx` | The Share and Export controls: the export menu, the STL print-size dialog, and the manual-copy dialog |
| `infra/` | CDK stack for S3 + CloudFront hosting (the app bundle, and the molecule-data bucket/distribution Bonds mode reads) |
| `src/bonds/h2plus.ts` | H₂⁺'s exact solver: the separated λ/μ equations, their tridiagonal eigenproblems, the wavefunction and its field evaluator |
| `src/bonds/tridiagonal.ts` | The symmetric tridiagonal eigensolver (extreme eigenvalue and its eigenvector) both of H₂⁺'s equations reduce to |
| `src/bonds/systems.ts` | The ten diatomics plus H₂⁺: ids, formulas, R-snapping, scan-point lookup, and the shared Bonds rendering constants |
| `src/bonds/captions.ts` | Every Bonds method statement and caveat (validity cutoff, multireference, Li₂'s frozen core, He₂'s van der Waals well, density-surface wording) |
| `src/bonds/curve.ts` | The potential-curve plot spec for H₂⁺ and for a diatomic's scan, relative to the separated fragments |
| `src/bonds/mo_diagram.ts` | The molecular-orbital diagram's levels (restricted and unrestricted) and H₂⁺'s own two-level diagram |
| `src/bonds/bond_density.ts` | The lowest density on the segment between a diatomic's two nuclei, to say whether a surface is one envelope or two |
| `src/bonds/bonds_request.ts` | The `FieldRenderRequest` Bonds mode's current selection asks for, and the note when the drawn picture differs from it |
| `src/bonds/bonds_url.ts` | Bonds mode's URL keys (`system`, `R`, `state`) |
| `src/bonds/useBondsData.ts` | Lazily loads a diatomic's scan, meta and basis for the current selection, and snaps R to a shipped scan point |
| `src/bonds/useH2PlusCurve.ts` | Drives the H₂⁺ curve worker, shared across callers for the life of a Bonds/H₂⁺ session |
| `src/workers/h2plusCurveWorker.ts` | Computes the whole H₂⁺ potential curve off the main thread |
| `src/molecules/loader.ts` | Lazy, cached fetches of a molecule's index/meta/scan/basis/density-grid from the published data release |
| `src/molecules/data_version.ts` | `MOLECULE_DATA_VERSION`, which must equal `tools/molecules/version.py`'s `DATA_VERSION` |
| `src/molecules/types.ts` | The JSON shapes `tools/molecules/generate.py` writes |
| `src/molecules/gaussian_basis.ts` | Evaluates a molecular orbital or the total density from a shipped `basis.json`, in PySCF's own AO convention |
| `src/molecules/basis_registry.ts` | Registers a Bonds basis so a `'gaussianMO'`/`'gaussianDensity'` recipe can be evaluated in a worker that has no store |
| `src/components/BondsPanel.tsx` | Bonds mode's navigation: system, geometry, what to draw, the MO diagram, and every method statement |
| `src/components/BondsCurvePlot.tsx` | The Bonds potential-curve plot, in the view column (desktop) or Plot tab (phone) |
| `src/components/MoDiagram.tsx` | The molecular-orbital energy diagram, shared between a diatomic and H₂⁺'s own two levels |
| `src/store/bondsSlice.ts` | Bonds mode's selection: system, R, scan index, drawn view and density iso-value |
| `tools/molecules/` | The offline Python pipeline: `molecules.py` (the ten diatomics' geometry and methods), `quantum.py` (PySCF calculations, cached by settings hash), `fit.py` (R_e, D_e, the CCSD(T) validity range), `labels.py` (σ/π orbital labels and selection), `basis_export.py` (the AO convention exported to TS), `outputs.py` (JSON/grid writing), `generate.py` (the CLI), `publish.py` (S3 publishing), `version.py` (`DATA_VERSION`) — plus the 25-molecule library's own `library.py` (the catalogue, categories and references), `optimise.py` (the seven geomeTRIC-optimised geometries), `build_library.py` (the library's build CLI), `density.py` (voxel-averaged density, `check_density`), `esp.py` (the fixed-ρ ESP surface and its range), `grid.py` (the 6.5-bohr-margin sampling box), `orbitals.py` (the library's orbital table), `compact.py` (float32 gzip grid encoding) |
| `src/molecules/catalogue.ts` | The 25-molecule index: search/category filtering (`filterMolecules`) and formula formatting, read from `public/molecules/index.json` |
| `src/molecules/library_types.ts` | `LibraryMoleculeMeta`, `LIBRARY_CATEGORIES`, and the REQUIRED-fields guard that refuses a pre-library `meta.json` rather than draw it without ESP/dipole |
| `src/molecules/binary.ts` | Decodes a library molecule's gzip float32 grids (density, ESP) |
| `src/molecules/grid_cache.ts` | The session-long cache of up to three most-recently-chosen molecules' grids |
| `src/molecules/grid_mesh_request.ts` | Builds a `GridMeshRequest` (density or ESP) for the mesh worker from a loaded molecule's grid |
| `src/molecules/dipole.ts` | The dipole arrow's vector, magnitude and physics-convention direction |
| `src/molecules/esp.ts`, `src/molecules/esp_color.ts` | The fixed ±0.05 Ha/e diverging colour scale and the per-molecule range shown in the key |
| `src/molecules/ball_and_stick.ts` | The structure overlay: atoms, bond sticks, and the hover readout's length/angle text |
| `src/molecules/orbital_display.ts` | Orbital list rows: label, energy in Ha/eV, occupancy, HOMO/LUMO/SOMO role, degenerate-set grouping |
| `src/molecules/render_plan.ts` | What the canvas should be showing right now, from the store's `surface` plus the loaded meta/grids/basis |
| `src/molecules/useMoleculeLoader.ts`, `useMoleculeView.ts` | Lazily load a chosen molecule's meta/grid/basis and drive the mesh worker, dropping a stale result if the selection moved on |
| `src/molecules/url_keys.ts` | Molecules mode's URL keys (`id`, `show`, `struct`, `dipole`) and the explicit `linkRejected` message for a malformed id |
| `src/store/moleculeSlice.ts` | Molecules mode's selection: id, surface (density/esp/mo), structure/dipole visibility, load/render error state |
| `src/components/MoleculeNav.tsx` | Desktop `.side-panel` navigation (and the phone header/Explore-tab variants): picker, surface toggle, selected-orbital name |
| `src/components/MoleculePicker.tsx`, `MoleculePickerDialog.tsx` | The search-plus-category picker, and its full-screen phone dialog |
| `src/components/MoleculeViewOptions.tsx` | Ball-and-stick/dipole-arrow switches and the dipole caption (with a molecule's `caveat`, e.g. ozone's) |
| `src/components/MoleculeOrbitalList.tsx` | The Plot slot's full orbital list: HOMO/LUMO marking, the HOMO–LUMO gap divider, HOMO scrolled into view on open |
| `src/components/MoleculeReadout.tsx` | The hover/pick readout: atom or bond, its length/angle and geometry-source caption |

---

## Continuing this work

Design, decisions, backlog and process notes for the multi-electron atom work
live in [docs/HANDOFF.md](docs/HANDOFF.md), with the full spec in
[docs/superpowers/specs/](docs/superpowers/specs/).
