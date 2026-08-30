import { solveAtom } from '../../src/atom/scf';
import {
    buildAtomProfile,
    subshellSamplingRadius,
    compositeSamplingRadius,
    COMPOSITE_BOX_MARGIN,
} from '../../src/atom/atom_profile';
import { compositeResolutionFor } from '../../src/atom/shell_composition';
import { generateOrbitalMesh } from '../../src/orbital_mesh';

/**
 * Regression cover for a defect reported from the running app: ruthenium's
 * O shell "renders a sphere with a strange box inside", and gadolinium
 * rendered badly for the same reason.
 *
 * The cause was the composition view's sampling box. `subshellSamplingRadius`
 * is the 99.99% radius — correct and conservative for a single orbital, but
 * 2.25–3.44x the radius actually drawn, and the composition view renders up
 * to sixteen orbitals at once on a coarse grid. Most of the box was empty
 * space bought with resolution: ruthenium's 5s came out as a 438-vertex
 * faceted block reaching 3.57 a₀ against a true 5.23.
 *
 * Ruthenium is solved once here and reused; it is the cheapest element that
 * exhibits the bug.
 */
describe('shell-composition lobe quality', () => {
    const atom = solveAtom(44);
    const profile = buildAtomProfile(atom, 0.9);
    const fiveS = profile.subshells.find(s => s.n === 5 && s.l === 0)!;
    const R = atom.states.find(s => s.n === 5 && s.l === 0)!.R;

    const meshFor = (rMax: number, resolution: number) => generateOrbitalMesh({
        n: 5, l: 0, ml: 0, Z: 44, resolution, rMax, enclosedFraction: 0.9,
        radialSamples: { R, rMin: profile.grid.rMin, dx: profile.grid.dx, size: profile.grid.size },
    });

    const reach = (mesh: { positions: number[][] }) =>
        mesh.positions.reduce((far, [x, y, z]) => Math.max(far, Math.hypot(x, y, z)), 0);

    it('never sizes the composite box larger than the orbital\'s true extent', () => {
        for (const subshell of profile.subshells) {
            const full = subshellSamplingRadius(profile.grid, subshell.curve.values);
            expect(subshell.contourRadius).toBeGreaterThan(0);
            expect(compositeSamplingRadius(profile.grid, subshell.curve.values, subshell.contourRadius))
                .toBeLessThanOrEqual(full);
        }
    });

    /**
     * The margin has to clear the furthest the isosurface actually reaches.
     * Measured across s/p/d/f from carbon to uranium, the worst ratio of
     * reach to enclosed-fraction radius is 1.19 (a 4f, whose lobes stretch
     * furthest along their axes relative to the spherically averaged D(r)).
     */
    it('leaves room beyond the measured worst-case reach of 1.19x the contour', () => {
        expect(COMPOSITE_BOX_MARGIN).toBeGreaterThan(1.19);
    });

    it('keeps every lobe clear of the box wall, so nothing renders as a block', () => {
        for (const subshell of profile.subshells) {
            const box = compositeSamplingRadius(profile.grid, subshell.curve.values, subshell.contourRadius);
            const Rn = atom.states.find(s => s.n === subshell.n && s.l === subshell.l)!.R;
            const mesh = generateOrbitalMesh({
                n: subshell.n, l: subshell.l, ml: subshell.l, Z: 44,
                resolution: compositeResolutionFor(subshell.l),
                rMax: box, enclosedFraction: 0.9,
                radialSamples: { R: Rn, rMin: profile.grid.rMin, dx: profile.grid.dx, size: profile.grid.size },
            });
            const onWall = mesh.positions.filter(
                ([x, y, z]) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > box * 0.98
            ).length;
            expect(onWall).toBe(0);
        }
    });

    it('ruthenium\'s 5s reaches within 5% of its true extent, where the old box lost 32%', () => {
        const truth = reach(meshFor(subshellSamplingRadius(profile.grid, fiveS.curve.values), 128));
        const fixed = reach(meshFor(
            compositeSamplingRadius(profile.grid, fiveS.curve.values, fiveS.contourRadius),
            compositeResolutionFor(0)
        ));
        expect(fixed / truth).toBeGreaterThan(0.95);
    });

    it('and resolves it with an order of magnitude more surface than the old box did', () => {
        const before = meshFor(subshellSamplingRadius(profile.grid, fiveS.curve.values), 32).positions.length;
        const after = meshFor(
            compositeSamplingRadius(profile.grid, fiveS.curve.values, fiveS.contourRadius),
            compositeResolutionFor(0)
        ).positions.length;
        // 438 before, ~10k after: the difference between a faceted block and a sphere.
        expect(before).toBeLessThan(1000);
        expect(after).toBeGreaterThan(5000);
    });
});
