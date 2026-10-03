import {
    SPEED_OF_LIGHT, defaultRelativityFor, kappaFor, lForKappa, jForKappa, splitByJ,
    diracHydrogenicEnergy, jLabel, relativityLabel, methodStatement,
    encodeRelativityParam, decodeRelativityParam,
} from '../../src/atom/relativity';

describe('relativity vocabulary', () => {
    it('uses the spec\'s speed of light', () => {
        expect(SPEED_OF_LIGHT).toBe(137.035999);
    });

    it('defaults to scalar from caesium onward and off before it', () => {
        expect(defaultRelativityFor(54)).toBe('off');
        expect(defaultRelativityFor(55)).toBe('scalar');
        expect(defaultRelativityFor(118)).toBe('scalar');
        expect(defaultRelativityFor(1)).toBe('off');
    });

    it('maps (l, j) to κ with the Dirac sign convention and back', () => {
        expect(kappaFor(0, 0.5)).toBe(-1);
        expect(kappaFor(1, 0.5)).toBe(1);
        expect(kappaFor(1, 1.5)).toBe(-2);
        expect(kappaFor(3, 2.5)).toBe(3);
        expect(kappaFor(3, 3.5)).toBe(-4);
        for (const kappa of [-4, -3, -2, -1, 1, 2, 3]) {
            expect(kappaFor(lForKappa(kappa), jForKappa(kappa))).toBe(kappa);
        }
        expect(() => kappaFor(0, -0.5)).toThrow();
        expect(() => kappaFor(1, 2.5)).toThrow();
    });

    it('splits a subshell between its j-levels in proportion to 2j+1, lower j first', () => {
        expect(splitByJ({ n: 6, l: 0, electrons: 1 })).toEqual([{ n: 6, l: 0, j: 0.5, kappa: -1, electrons: 1 }]);
        const p = splitByJ({ n: 2, l: 1, electrons: 2 });
        expect(p.map(s => s.j)).toEqual([0.5, 1.5]);
        expect(p[0].electrons).toBeCloseTo(2 / 3, 12);   // NIST's own example
        expect(p[1].electrons).toBeCloseTo(4 / 3, 12);
        const f = splitByJ({ n: 5, l: 3, electrons: 3 });   // uranium 5f3
        expect(f[0].electrons).toBeCloseTo(9 / 7, 12);
        expect(f[1].electrons).toBeCloseTo(12 / 7, 12);
        // A full subshell fills both j-levels to capacity.
        const full = splitByJ({ n: 5, l: 2, electrons: 10 });
        expect(full.map(s => s.electrons)).toEqual([4, 6]);
    });

    it('gives the exact Dirac hydrogenic energy, reducing to -Z²/2n² for small Z/c', () => {
        // E(1s) = c²(γ - 1), γ = sqrt(1 - (Z/c)²)
        const Z = 80;
        const gamma = Math.sqrt(1 - (Z / SPEED_OF_LIGHT) ** 2);
        expect(diracHydrogenicEnergy(1, -1, Z)).toBeCloseTo(SPEED_OF_LIGHT ** 2 * (gamma - 1), 8);
        expect(diracHydrogenicEnergy(1, -1, 1)).toBeCloseTo(-0.5000066566, 9);
        // 2s½ and 2p½ are exactly degenerate in a Coulomb field; 2p³⁄₂ lies above.
        expect(diracHydrogenicEnergy(2, -1, Z)).toBeCloseTo(diracHydrogenicEnergy(2, 1, Z), 9);
        expect(diracHydrogenicEnergy(2, -2, Z)).toBeGreaterThan(diracHydrogenicEnergy(2, 1, Z));
    });

    it('labels j-levels as the spec writes them', () => {
        expect(jLabel(0.5)).toBe('½');
        expect(jLabel(1.5)).toBe('³⁄₂');
        expect(jLabel(2.5)).toBe('⁵⁄₂');
        expect(jLabel(3.5)).toBe('⁷⁄₂');
        expect(() => jLabel(4.5)).toThrow();
    });

    it('names each mode and states its method', () => {
        expect(relativityLabel('off')).toBe('Off');
        expect(relativityLabel('scalar')).toBe('Scalar');
        expect(relativityLabel('spinOrbit')).toBe('With spin–orbit');
        // 'off' must stay exactly LevelNav's existing statement.
        expect(methodStatement('off')).toBe('central-field SCF, LDA exchange with VWN correlation, spherically averaged');
        expect(methodStatement('scalar')).toMatch(/Koelling–Harmon/);
        expect(methodStatement('scalar')).toMatch(/MacDonald–Vosko/);
        expect(methodStatement('spinOrbit')).toMatch(/Dirac/);
        expect(methodStatement('spinOrbit')).toMatch(/2j\+1/);
    });

    it('round-trips through a URL parameter and ignores anything unknown', () => {
        expect(encodeRelativityParam('spinOrbit')).toBe('so');
        expect(encodeRelativityParam(null)).toBeNull();
        for (const mode of ['off', 'scalar', 'spinOrbit'] as const) {
            expect(decodeRelativityParam(encodeRelativityParam(mode))).toBe(mode);
        }
        expect(decodeRelativityParam('dirac')).toBeNull();
        expect(decodeRelativityParam(undefined)).toBeNull();
    });
});
