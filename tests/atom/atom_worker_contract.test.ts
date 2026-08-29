import { buildSerialisedAtomProfile, SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { solveAtom, AtomSolution } from '../../src/atom/scf';
import { buildAtomProfile, resampleUniform } from '../../src/atom/atom_profile';

/**
 * The worker cannot hand a class instance or a closure across the boundary,
 * so this exercises the serialisation contract directly: the payload builder
 * must produce only plain objects, arrays, numbers and typed arrays, and it
 * must survive a structuredClone round trip (the same mechanism
 * postMessage/onmessage uses) with every value intact. This is deliberately
 * not a DOM/worker test -- see orbitalWorker.ts, which has none either,
 * because `self` cannot be exercised meaningfully under jsdom.
 */
describe('atom worker serialisation contract', () => {
    // Helium: two electrons, cheap to solve, and (unlike hydrogen) exercises
    // the real SCF loop rather than the one-electron bypass.
    let atom: AtomSolution;
    let profile: SerialisedAtomProfile;

    beforeAll(() => {
        atom = solveAtom(2);
        profile = buildSerialisedAtomProfile(atom, 0.9);
    });

    /** Recursively asserts every value transferable is a number, plain array,
     * plain object, or Float64Array/Float32Array -- nothing a structured
     * clone (or a real postMessage) would choke on. */
    function assertTransferable(value: unknown, path: string): void {
        if (value === null) return;
        const type = typeof value;
        if (type === 'number' || type === 'string' || type === 'boolean') return;
        if (value instanceof Float64Array || value instanceof Float32Array) return;
        if (Array.isArray(value)) {
            value.forEach((item, i) => assertTransferable(item, `${path}[${i}]`));
            return;
        }
        if (type === 'object') {
            expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
            for (const [key, item] of Object.entries(value as object)) {
                assertTransferable(item, `${path}.${key}`);
            }
            return;
        }
        throw new Error(`Non-transferable value at ${path}: ${type}`);
    }

    it('contains only plain, transferable values', () => {
        assertTransferable(profile, 'profile');
    });

    it('round-trips through structuredClone with values intact', () => {
        const cloned = structuredClone(profile);

        expect(cloned).toEqual(profile);
        // A genuine clone, not the same references.
        expect(cloned.total).not.toBe(profile.total);
        expect(cloned.subshells[0].R).not.toBe(profile.subshells[0].R);
        expect(cloned.subshells[0].R).toBeInstanceOf(Float64Array);
        expect(cloned.resampled).toBeInstanceOf(Float32Array);
    });

    it('carries the shell list, subshell list with energies, and contour radii', () => {
        expect(profile.Z).toBe(2);
        expect(profile.shells.length).toBeGreaterThan(0);
        expect(profile.subshells.length).toBeGreaterThan(0);
        for (const subshell of profile.subshells) {
            expect(Number.isFinite(subshell.energy)).toBe(true);
            expect(subshell.energy).toBeLessThan(0);
        }
        expect(profile.contourRadius).toBeGreaterThan(0);
        for (const shell of profile.shells) {
            expect(shell.contourRadius).toBeGreaterThan(0);
        }
    });

    it('carries a shellPeaks list and one R array per occupied subshell on the shared grid', () => {
        expect(profile.shellPeaks.length).toBeGreaterThan(0);
        for (const subshell of profile.subshells) {
            expect(subshell.R.length).toBe(profile.size);
        }
        expect(profile.total.length).toBe(profile.size);
    });

    it('carries a raw, unnormalised resampled radial texture (ruling R16)', () => {
        expect(profile.resampled.length).toBeGreaterThan(1);
        expect(profile.resampledRMax).toBeGreaterThan(0);

        // R16: no normalisation or quantisation belongs here. Cross-check
        // against resampleUniform called directly on the total D(r) curve --
        // if the worker's payload builder scaled or clamped the values on
        // the way out, this would no longer match.
        const total = buildAtomProfile(atom, 0.9).total.values;
        const expected = resampleUniform(atom.grid, total, profile.resampledRMax, profile.resampled.length);
        for (let i = 0; i < expected.length; i++) {
            expect(profile.resampled[i]).toBeCloseTo(expected[i], 6);
        }
    });
});
