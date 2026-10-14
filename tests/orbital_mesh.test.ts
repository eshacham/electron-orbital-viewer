import { generateOrbitalMesh, generateFieldMesh, sampleFieldSource } from '../src/orbital_mesh';
import { makeWaveFunctionEvaluator, radialWaveFunction } from '../src/quantum_functions';
import { computeSamplingRadius } from '../src/orbital_presets';
import { MeshData, OrbitalParams } from '../src/types/orbital';
import { solveAtom, AtomSolution } from '../src/atom/scf';
import { buildAtomProfile, subshellSamplingRadius, radiusEnclosing } from '../src/atom/atom_profile';
import { hydrogenicSource } from '../src/field_source';

/**
 * Welds vertices that share a position and reports the topology of the result.
 *
 * A closed isosurface must be watertight: every edge is shared by exactly two
 * triangles. An edge used by one triangle is a crack; an edge used by more than
 * two is a non-manifold seam. Both show up as visible holes in the render.
 */
function topology(mesh: MeshData, rMax: number) {
    const ids = new Map<string, number>();
    const welded: number[][] = [];
    const canonical = mesh.positions.map(p => {
        const key = p.map(v => Math.round(v / 1e-9)).join(',');
        if (!ids.has(key)) {
            ids.set(key, welded.length);
            welded.push(p);
        }
        return ids.get(key)!;
    });

    const edges = new Map<string, number>();
    let degenerate = 0;
    for (const [a, b, c] of mesh.cells) {
        const [u, v, w] = [canonical[a], canonical[b], canonical[c]];
        if (u === v || v === w || u === w) degenerate++;
        for (const [i, j] of [[a, b], [b, c], [c, a]]) {
            const [p, q] = [canonical[i], canonical[j]];
            if (p === q) continue;
            const key = p < q ? `${p}_${q}` : `${q}_${p}`;
            edges.set(key, (edges.get(key) ?? 0) + 1);
        }
    }

    // An opening where the surface meets a wall of the sampling box is the box
    // truncating the orbital, not a defect in the mesh. Only openings away from
    // the walls are cracks.
    const onBoxWall = (v: number) =>
        welded[v].some(c => Math.abs(Math.abs(c) - rMax) < 1e-9);

    let cracks = 0;
    let clippedAtBox = 0;
    let nonManifoldEdges = 0;
    for (const [key, count] of edges) {
        if (count > 2) nonManifoldEdges++;
        if (count !== 1) continue;
        const [u, v] = key.split('_').map(Number);
        if (onBoxWall(u) && onBoxWall(v)) clippedAtBox++;
        else cracks++;
    }
    return { cracks, clippedAtBox, nonManifoldEdges, degenerate, triangles: mesh.cells.length };
}

const orbital = (over: Partial<OrbitalParams>): OrbitalParams => ({
    n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9, ...over,
});

describe('generateOrbitalMesh', () => {
    // Each of these renders with visible holes before the field is normalised.
    const cases: Array<[string, OrbitalParams]> = [
        ['3d  (n=3 l=2 ml=0) @32', orbital({ resolution: 32 })],
        ['3d  (n=3 l=2 ml=0) @64', orbital({ resolution: 64 })],
        ['7f  (n=7 l=3 ml=0) @64', orbital({ n: 7, l: 3, ml: 0, resolution: 64, rMax: 90, enclosedFraction: 0.9 })],
        ['9   (n=9 l=8 ml=8) @64', orbital({ n: 9, l: 8, ml: 8, resolution: 64, rMax: 200, enclosedFraction: 0.9 })],
        ['1s  (n=1 l=0 ml=0) @64', orbital({ n: 1, l: 0, ml: 0, resolution: 64, rMax: 10, enclosedFraction: 0.9 })],
    ];

    it.each(cases)('produces a crack-free surface for %s', (_name, params) => {
        const mesh = generateOrbitalMesh(params);
        const t = topology(mesh, params.rMax);

        expect(t.triangles).toBeGreaterThan(0);
        expect(t.degenerate).toBe(0);
        expect(t.nonManifoldEdges).toBe(0);
        expect(t.cracks).toBe(0);
    });

    it('closes completely when the box is large enough to contain the orbital', () => {
        // 7f at the app's preset rMax=90 is truncated by the box; at 120 it fits.
        const params = orbital({ n: 7, l: 3, ml: 0, resolution: 64, rMax: 120, enclosedFraction: 0.9 });
        const t = topology(generateOrbitalMesh(params), params.rMax);

        expect(t.cracks).toBe(0);
        expect(t.clippedAtBox).toBe(0);
    });

    it('emits one psi sign per vertex, each +1 or -1', () => {
        const mesh = generateOrbitalMesh(orbital({}));
        expect(mesh.psiSigns).toHaveLength(mesh.positions.length);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1, -1]));
    });

    // Asking for a contour by the share of the electron it encloses cannot fail
    // the way a raw density could: there is always a threshold holding 90% of
    // the field, whatever the orbital. The old "no isosurface at this iso-level"
    // case is unreachable by construction now.
    it('always finds a contour, whatever the orbital', () => {
        for (const [n, l, ml] of [[1, 0, 0], [9, 8, 8], [7, 0, 0]] as number[][]) {
            const mesh = generateOrbitalMesh(orbital({
                n, l, ml, rMax: computeSamplingRadius(n, l, 1), resolution: 24,
            }));
            expect(mesh.isoLevel).toBeGreaterThan(0);
            expect(mesh.cells.length).toBeGreaterThan(0);
        }
    });

    it('rejects unusable parameters', () => {
        expect(() => generateOrbitalMesh(orbital({ rMax: 0 }))).toThrow(/must be positive/);
        expect(() => generateOrbitalMesh(orbital({ resolution: 0 }))).toThrow(/must be positive/);
        expect(() => generateOrbitalMesh(orbital({ resolution: 33.5 }))).toThrow(/whole number/);
        expect(() => generateOrbitalMesh(orbital({ enclosedFraction: 0 }))).toThrow(/enclosedFraction/);
        expect(() => generateOrbitalMesh(orbital({ enclosedFraction: 1 }))).toThrow(/enclosedFraction/);
    });
});

describe('psi sign per vertex', () => {
    // The sign carried from the inside grid sample must match psi evaluated
    // directly at the vertex, which is what the colouring used to do.
    it.each([
        ['2pz', { n: 2, l: 1, ml: 0, Z: 1, resolution: 32, rMax: 15, enclosedFraction: 0.9 }],
        ['3dz2', { n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9 }],
        ['4f', { n: 4, l: 3, ml: 2, Z: 1, resolution: 32, rMax: 35, enclosedFraction: 0.9 }],
    ] as Array<[string, OrbitalParams]>)('agrees with psi at the vertex for %s', (_n, params) => {
        const mesh = generateOrbitalMesh(params);
        const psi = makeWaveFunctionEvaluator(params.n, params.l, params.ml, params.Z);

        let mismatches = 0;
        mesh.positions.forEach(([x, y, z], i) => {
            const direct = psi(x, y, z) >= 0 ? 1 : -1;
            if (direct !== mesh.psiSigns[i]) mismatches++;
        });
        expect(mismatches).toBe(0);
    });

    it('puts positive psi on +z for 2pz', () => {
        const params: OrbitalParams = { n: 2, l: 1, ml: 0, Z: 1, resolution: 32, rMax: 15, enclosedFraction: 0.9 };
        const mesh = generateOrbitalMesh(params);
        const topmost = mesh.positions.reduce((best, p, i) =>
            p[2] > mesh.positions[best][2] ? i : best, 0);
        expect(mesh.psiSigns[topmost]).toBe(1);
    });
});

describe('radialSamples override', () => {
    // Samples the exact analytic R_nl on a log grid, the same way a converged
    // SCF solution's R(r) would arrive over the worker boundary, and checks
    // that generateOrbitalMesh's worker-side interpolation reproduces the
    // analytic surface closely rather than merely "producing some mesh".
    function sampleAnalyticRadial(n: number, l: number, Z: number, rMin: number, rMaxSample: number, size: number) {
        const dx = Math.log(rMaxSample / rMin) / (size - 1);
        const R = new Float64Array(size);
        for (let j = 0; j < size; j++) {
            R[j] = radialWaveFunction(n, l, rMin * Math.exp(j * dx), Z);
        }
        return { R, rMin, dx, size };
    }

    it('actually uses radialSamples instead of silently falling back to the analytic radial factor', () => {
        const params = orbital({ n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9 });
        const analyticMesh = generateOrbitalMesh(params);

        // A radial factor with no nodes and a much faster decay than R_32 --
        // nothing like the analytic curve. If radialSamples were silently
        // ignored this mesh would come out identical to analyticMesh instead
        // of having a markedly different iso level. Decay rate 0.3, not the
        // original 3: ruling R22b's Fix C (orbital_mesh.ts checkSurfaceResolved)
        // now rejects a mesh confined to the nucleus voxel, and this synthetic
        // R (no r^l suppression at the origin, unlike a real l=2 state) decayed
        // so fast at rate 3 that its own genuinely-tiny 90% surface tripped
        // that guard at this test's coarse resolution (32). Rate 0.3 keeps the
        // "much faster than R_32, markedly different iso" intent (R_32 itself
        // decays over tens of a0) while resolving to a real, many-voxel surface.
        const rMin = 1e-4;
        const rMaxSample = 60;
        const size = 2001;
        const dx = Math.log(rMaxSample / rMin) / (size - 1);
        const R = new Float64Array(size);
        for (let j = 0; j < size; j++) R[j] = Math.exp(-0.3 * rMin * Math.exp(j * dx));

        const overriddenMesh = generateOrbitalMesh({ ...params, radialSamples: { R, rMin, dx, size } });

        expect(overriddenMesh.cells.length).toBeGreaterThan(0);
        expect(overriddenMesh.isoLevel).not.toBeCloseTo(analyticMesh.isoLevel, 6);
    });

    it('reproduces the analytic isosurface when fed a sampled version of the same radial function', () => {
        const params = orbital({ n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9 });
        const radialSamples = sampleAnalyticRadial(3, 2, 1, 1e-4, 60, 2001);

        const analyticMesh = generateOrbitalMesh(params);
        const numericalMesh = generateOrbitalMesh({ ...params, radialSamples });

        expect(numericalMesh.cells.length).toBeGreaterThan(0);
        expect(numericalMesh.isoLevel).toBeCloseTo(analyticMesh.isoLevel, 3);
        const vertexCountRatio = numericalMesh.positions.length / analyticMesh.positions.length;
        expect(vertexCountRatio).toBeGreaterThan(0.95);
        expect(vertexCountRatio).toBeLessThan(1.05);
    });

    it('produces a crack-free surface when the radial factor comes from samples', () => {
        const params = orbital({ n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9 });
        const radialSamples = sampleAnalyticRadial(3, 2, 1, 1e-4, 60, 2001);

        const mesh = generateOrbitalMesh({ ...params, radialSamples });
        const t = topology(mesh, params.rMax);

        expect(t.degenerate).toBe(0);
        expect(t.nonManifoldEdges).toBe(0);
        expect(t.cracks).toBe(0);
    });
});

/**
 * Regression guard for the level-3 (single-orbital) counterpart of the
 * grid-vs-contour framing bug fixed in orbital_visualizer.ts and
 * RadialPlot.tsx: the sampling box for one subshell's orbital lobes was
 * being sized from the *whole atom's* shared log grid (rMax ~44 a0 for
 * argon) instead of that subshell's own radial extent. Argon's 2p sits at
 * about 1.3 a0 -- 35x smaller -- so at a normal resolution the orbital spans
 * a couple of voxels out of a much wider box, and marching cubes finds
 * essentially nothing: an empty viewport with only the axes helper, not an
 * error, because a near-empty isosurface is not the same failure as an
 * invalid parameter.
 *
 * This is real `solveAtom` output, not a synthetic radial function, because
 * the bug is specifically about the *ratio* between a subshell's own extent
 * and the atom's shared grid -- a property only a real converged solve has.
 */
describe('atom mode level 3: the box must be sized from the subshell, not the whole atom (spec bugfix)', () => {
    let atom: AtomSolution;
    let state: AtomSolution['states'][number];
    let correctRMax: number;

    beforeAll(() => {
        atom = solveAtom(18); // argon
        state = atom.states.find(s => s.n === 2 && s.l === 1)!; // 2p
        const profile = buildAtomProfile(atom, 0.9);
        const curve = profile.subshells.find(s => s.n === 2 && s.l === 1)!.curve.values;
        correctRMax = subshellSamplingRadius(atom.grid, curve);
    });

    function paramsAt(rMax: number): OrbitalParams {
        return {
            n: 2, l: 1, ml: 0, Z: 18, resolution: 64, rMax, enclosedFraction: 0.9,
            radialSamples: { R: state.R, rMin: atom.grid.rMin, dx: atom.grid.dx, size: atom.grid.size },
        };
    }

    it("sizes argon 2p's own box far smaller than the atom's shared grid", () => {
        const wholeAtomGridRMax = atom.grid.r[atom.grid.size - 1];
        expect(correctRMax).toBeGreaterThan(0.5);
        expect(correctRMax).toBeLessThan(5);
        expect(wholeAtomGridRMax / correctRMax).toBeGreaterThan(10);
    });

    it('produces a real, non-empty mesh when the box is sized from the subshell', () => {
        const mesh = generateOrbitalMesh(paramsAt(correctRMax));

        expect(mesh.positions.length).toBeGreaterThan(0);
        expect(mesh.cells.length).toBeGreaterThan(0);
    });

    it('reproduces the bug when sized from the whole atom instead: nothing left for marching cubes to find', () => {
        const wholeAtomGridRMax = atom.grid.r[atom.grid.size - 1];
        const correctMesh = generateOrbitalMesh(paramsAt(correctRMax));

        // Either the box is so oversized that no isosurface is found at all
        // (generateOrbitalMesh throws), or a handful of degenerate vertices
        // survive -- either way, a tiny fraction of the correctly-sized
        // mesh's vertex count is the signature of the regression this guards.
        let vertexCount = 0;
        try {
            vertexCount = generateOrbitalMesh(paramsAt(wholeAtomGridRMax)).positions.length;
        } catch {
            vertexCount = 0;
        }
        expect(vertexCount).toBeLessThan(correctMesh.positions.length * 0.05);
    });
});

/**
 * Regression guard for the hydrogen-like path's own box sizing: a second,
 * unrelated bug surfaced while fixing the atom-mode one above. Both modes'
 * marching-cubes render reads the same `orbital.currentParams` (App.tsx),
 * and switching out of atom mode without resetting it left hydrogen-like
 * mode rendering with whatever tiny rMax an atom-mode orbital (argon's 2p,
 * ~1.7 a0) had last set, instead of its own computeSamplingRadius(n, l, Z).
 * At that scale hydrogen's default 3d (rMax should be ~35 a0) samples only
 * its innermost, near-featureless tail -- monotonic and one-signed -- which
 * is exactly why the fix below (both phases present) is the cheap tell.
 * The App.tsx-level fix (reset on the mode transition) has its own test in
 * App.test.tsx; this one guards the hydrogen-like path itself never having
 * been rerouted through the atom-mode sizing code in the first place.
 */
describe('hydrogen-like path: unaffected by atom-mode box sizing', () => {
    it("computeSamplingRadius(3, 2, 1) is still around 35 a0", () => {
        expect(computeSamplingRadius(3, 2, 1)).toBeGreaterThan(30);
        expect(computeSamplingRadius(3, 2, 1)).toBeLessThan(40);
    });

    it('produces a non-empty mesh with both phases present at that box size', () => {
        const rMax = computeSamplingRadius(3, 2, 1);
        const mesh = generateOrbitalMesh(orbital({ n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax }));

        expect(mesh.positions.length).toBeGreaterThan(0);
        // A p or d orbital's mesh containing only one sign is the signature
        // of a box sized so small it only samples one lobe's near-origin
        // tail (or none at all) -- the exact failure mode this guards.
        expect(mesh.psiSigns).toContain(1);
        expect(mesh.psiSigns).toContain(-1);
    });
});

/**
 * General regression guard, requested directly: for any orbital with l > 0,
 * the angular factor changes sign across at least one nodal plane/cone, so
 * `psiSigns` must contain both +1 and -1. A single-signed mesh for l > 0 is
 * the signature of the angular part having silently gone missing or
 * degenerated to a constant (effectively l = 0) -- a *different* failure
 * mode than the box-sizing bugs above (which show up as an empty or
 * near-empty mesh instead, not a wrongly-signed full one). l = 0 orbitals
 * are deliberately excluded: 1s has no node at all and is legitimately
 * single-signed everywhere, so asserting both signs there would be asserting
 * something false rather than guarding a bug.
 *
 * Covers both the analytic hydrogen-like path (3d, 7f, the l=8 case already
 * exercised above) and the numerical atom-mode path (argon's 2p, built from
 * a real `solveAtom(18)` exactly as the level-3 UI does).
 */
describe('l > 0 orbitals are never single-signed (angular part must vary)', () => {
    const l_gt_0_cases: Array<[string, OrbitalParams]> = [
        ['3d (n=3 l=2 ml=0)', orbital({ resolution: 32 })],
        ['7f (n=7 l=3 ml=0)', orbital({ n: 7, l: 3, ml: 0, resolution: 64, rMax: 90, enclosedFraction: 0.9 })],
        ['l=8 (n=9 l=8 ml=8)', orbital({ n: 9, l: 8, ml: 8, resolution: 64, rMax: 200, enclosedFraction: 0.9 })],
    ];

    it.each(l_gt_0_cases)('%s has both phases present', (_name, params) => {
        const mesh = generateOrbitalMesh(params);
        expect(mesh.psiSigns).toContain(1);
        expect(mesh.psiSigns).toContain(-1);
    });

    it('argon 2p (numerical R(r), l=1) has both phases present, evenly split', () => {
        const atom = solveAtom(18);
        const state = atom.states.find(s => s.n === 2 && s.l === 1)!;
        const profile = buildAtomProfile(atom, 0.9);
        const curve = profile.subshells.find(s => s.n === 2 && s.l === 1)!.curve.values;
        const rMax = subshellSamplingRadius(atom.grid, curve);

        const mesh = generateOrbitalMesh({
            n: 2, l: 1, ml: 0, Z: 18, resolution: 64, rMax, enclosedFraction: 0.9,
            radialSamples: { R: state.R, rMin: atom.grid.rMin, dx: atom.grid.dx, size: atom.grid.size },
        });

        expect(mesh.psiSigns).toContain(1);
        expect(mesh.psiSigns).toContain(-1);
        // p_z is antisymmetric under z -> -z, so the two lobes should be
        // (near-)equal in vertex count, not merely both present.
        const pos = mesh.psiSigns.filter(s => s === 1).length;
        const neg = mesh.psiSigns.filter(s => s === -1).length;
        expect(pos).toBeGreaterThan(0);
        expect(neg).toBeGreaterThan(0);
        expect(Math.abs(pos - neg) / (pos + neg)).toBeLessThan(0.05);
    });
});

/**
 * Task 22b, ruling R22b: with relativity on, a heavy atom's s (and
 * spin-orbit p½) radial function is singular at r = 0 (task-22b-findings.md
 * §3). One Cartesian grid sample sits exactly on the nucleus, and
 * isoLevelForEnclosedFraction counted it as if it stood for a whole voxel --
 * for Ac 6s it held 97-99.6% of the sampled density, so the "90% surface"
 * collapsed to a 6-vertex octahedron one voxel across (|psi|^2 = 7.70e+4,
 * radius 5.1e-4 a0) instead of a real sphere out near r90 = 2.28 a0. Fix A
 * (orbital_mesh.ts, withCorrectedNucleusSample) replaces that one sample with
 * the nucleus voxel's own mean density.
 *
 * Real `solveAtom` output, not a synthetic radial function: the bug is
 * specifically about a real relativistic R(r)'s singularity at the origin.
 */
describe('Fix A (ruling R22b): a relativistic s/p½ orbital\'s 90% surface is not the nucleus voxel', () => {
    jest.setTimeout(5 * 60 * 1000);

    /** u^2 (+ Q^2 for a relativistic state): proportional to P(r), as atom_profile.ts's subshellCurveOf builds it. */
    function radialCurveOf(state: { u: Float64Array; Q?: Float64Array }): Float64Array {
        const { u, Q } = state;
        const values = new Float64Array(u.length);
        if (Q) { for (let j = 0; j < values.length; j++) values[j] = u[j] * u[j] + Q[j] * Q[j]; }
        else { for (let j = 0; j < values.length; j++) values[j] = u[j] * u[j]; }
        return values;
    }

    function meshReach(mesh: MeshData): number {
        let maxR = 0;
        for (const [x, y, z] of mesh.positions) maxR = Math.max(maxR, Math.hypot(x, y, z));
        return maxR;
    }

    /** One SCF orbital's params at a given resolution, boxed at 2x its radial r90 (plenty of room). */
    function scfOrbitalParams(
        Z: number, n: number, l: number, state: { R: Float64Array }, grid: AtomSolution['grid'],
        r90: number, resolution: number,
    ): OrbitalParams {
        return {
            n, l, ml: 0, Z, resolution, rMax: r90 * 2, enclosedFraction: 0.9,
            radialSamples: { R: state.R, rMin: grid.rMin, dx: grid.dx, size: grid.size },
        };
    }

    // Measured (see the task report): maxR lands within ~1% of r90 for every
    // case below, comfortably inside the findings' ±5% tolerance; 64³ and
    // 128³ iso levels agree to ~1-2%.
    const cases: Array<{
        name: string; Z: number; relativity: 'scalar' | 'spinOrbit'; n: number; l: number; j?: number;
    }> = [
        { name: 'Ac scalar 6s', Z: 89, relativity: 'scalar', n: 6, l: 0 },
        { name: 'Ac scalar 7s', Z: 89, relativity: 'scalar', n: 7, l: 0 },
        { name: 'Au scalar 6s', Z: 79, relativity: 'scalar', n: 6, l: 0 },
        { name: 'Cs scalar 6s', Z: 55, relativity: 'scalar', n: 6, l: 0 },
    ];

    it.each(cases)('$name: furthest vertex tracks r90, not the nucleus voxel', ({ Z, relativity, n, l, j }) => {
        const atom = solveAtom(Z, relativity);
        const state = atom.states.find(s => s.n === n && s.l === l && (j === undefined || s.j === j))!;
        const r90 = radiusEnclosing(atom.grid, radialCurveOf(state), 0.9);

        let isoAt64 = 0;
        let isoAt128 = 0;
        for (const resolution of [64, 128]) {
            const mesh = generateOrbitalMesh(scfOrbitalParams(Z, n, l, state, atom.grid, r90, resolution));
            // The old bug: a 6-vertex octahedron reaching 5e-4 to 1e-3 a0,
            // regardless of r90. The fix: a real surface near r90.
            expect(mesh.positions.length).toBeGreaterThan(1000);
            const reach = meshReach(mesh);
            expect(reach).toBeGreaterThan(r90 * 0.95);
            expect(reach).toBeLessThan(r90 * 1.05);
            if (resolution === 64) isoAt64 = mesh.isoLevel;
            else isoAt128 = mesh.isoLevel;
        }
        expect(Math.abs(isoAt128 - isoAt64) / isoAt64).toBeLessThan(0.05);
    });

    it('Pb spin-orbit 6p½ p_z: furthest vertex tracks r90, well-resolved at 64³', () => {
        const atom = solveAtom(82, 'spinOrbit');
        const state = atom.states.find(s => s.n === 6 && s.l === 1 && s.j === 0.5)!;
        const r90 = radiusEnclosing(atom.grid, radialCurveOf(state), 0.9);

        const mesh64 = generateOrbitalMesh(scfOrbitalParams(82, 6, 1, state, atom.grid, r90, 64));
        const mesh128 = generateOrbitalMesh(scfOrbitalParams(82, 6, 1, state, atom.grid, r90, 128));

        // As-is (before Fix A), the 128³ mesh reached only 4.6 a0 with a
        // pinched waist (task-22b-findings.md's prototype table).
        expect(meshReach(mesh128)).toBeGreaterThan(4.6 * 0.9);
        expect(mesh64.positions.length).toBeGreaterThan(3000);
        expect(Math.abs(mesh128.isoLevel - mesh64.isoLevel) / mesh64.isoLevel).toBeLessThan(0.05);
    });

    it('never touches sampleFieldSource: cube export, hybrids and Stark states keep the true point value', () => {
        const atom = solveAtom(89, 'scalar');
        const state = atom.states.find(s => s.n === 6 && s.l === 0)!;
        const source = hydrogenicSource({
            n: 6, l: 0, ml: 0, Z: 89, resolution: 64, rMax: 4.9, enclosedFraction: 0.9,
            radialSamples: { R: state.R, rMin: atom.grid.rMin, dx: atom.grid.dx, size: atom.grid.size },
        });
        const field = sampleFieldSource(source, 64);
        const centre = (field.side >> 1);
        const index = (centre * field.side + centre) * field.side + centre;
        // The raw point value at the nucleus: R(rMin) * Y_00, hugely larger
        // than the corrected voxel mean generateFieldMesh computes for the
        // same source (the meshing-path-only test above gets iso ~4e-3;
        // sampleFieldSource's own untouched sample is nowhere near that
        // scale -- it is the same R(rMin) ~ 987 singularity the bug report
        // measured).
        expect(Math.abs(field.samples[index])).toBeGreaterThan(100);
    });

    it('rejects an unresolvable surface instead of drawing a one-voxel speck (Fix C)', () => {
        // A box so enormous relative to the real orbital that even the
        // corrected mesh cannot resolve a 90% surface inside it -- the
        // degenerate-surface guard must fire rather than hand back a speck.
        const source = hydrogenicSource({
            n: 1, l: 0, ml: 0, Z: 1, resolution: 64, rMax: 400, enclosedFraction: 0.9,
        });
        expect(() => generateFieldMesh(source, 64, 0.9)).toThrow(/could not resolve this surface/i);
    });
});
