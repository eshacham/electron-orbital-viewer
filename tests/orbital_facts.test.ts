import {
    angularNodeSurfaces, atomFacts, hartreeText, isoValueText, orbitalEnergyText, orbitalFacts, shapeWord, shellFacts, subshellFacts,
} from '../src/orbital_facts';

const extras = { enclosedFraction: 0.9, isoLevel: 1.234e-3, energy: -0.433, method: 'non-relativistic LDA' };
const value = (facts: ReturnType<typeof orbitalFacts>, term: string) => facts.rows.find(row => row.term === term)?.value;

describe('orbital facts (spec §9.1 "Data")', () => {
    it('names the node surfaces the spec names', () => {
        expect(angularNodeSurfaces(1, 0)).toBe('the xy plane');
        expect(angularNodeSurfaces(2, 0)).toBe('two cones');
        expect(angularNodeSurfaces(2, -2)).toBe('the xz and yz planes');
        expect(angularNodeSurfaces(0, 0)).toBeNull();
        expect(angularNodeSurfaces(4, 0)).toBeNull();
    });

    // Task 6: the name is flat text ("2pz", the card draws its <sub> from `orbital`), the iso value has ×10ⁿ and its
    // unit, and the energy reads eV first, then Ha -- the texts Info uses too.
    it('states n, l, mₗ, the real orbital, its nodes, the contour and the energy for 2pz', () => {
        const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, extras);
        expect(facts.title).toBe('2pz orbital');
        expect(facts.orbital).toEqual({ n: 2, l: 1, ml: 0 });
        expect(facts.rows.find(row => row.term === 'Real orbital')).toMatchObject({ value: '2pz', orbital: { n: 2, l: 1, ml: 0 } });
        expect(value(facts, 'n')).toBe('2');
        expect(value(facts, 'l')).toBe('1 (p)');
        expect(value(facts, 'mₗ')).toBe('0');
        expect(value(facts, 'Radial nodes')).toBe('0');
        expect(value(facts, 'Angular nodes')).toBe('1 — the xy plane');
        expect(value(facts, 'Enclosed')).toBe('90 % of the electron');
        expect(value(facts, 'Iso value')).toBe(isoValueText(1.234e-3));
        expect(value(facts, 'Orbital energy')).toBe('−11.78 eV (−0.433 Ha) · eigenvalue, non-relativistic LDA');
        expect(facts.notes).toEqual(['ψ changes sign across every node.', 'Shape: dumbbell (qualitative).']);
    });

    // Task 6: one text per value for the Data card, the chips, the energy table and Info, so they cannot drift.
    it('writes the iso value with ×10ⁿ and a₀⁻³ on one line, and an orbital energy eV first with true minus signs', () => {
        expect(isoValueText(1.234e-3)).toBe('|ψ|²\u00A0=\u00A01.23\u00A0×\u00A010⁻³\u00A0a₀⁻³');
        expect(hartreeText(-0.2)).toBe('−0.200 Ha');
        expect(orbitalEnergyText(-0.2)).toBe('−5.44 eV (−0.200 Ha)');
        expect(orbitalEnergyText(-3600.5)).not.toMatch(/-/);
    });

    it('counts radial nodes as n − l − 1 spheres', () => {
        expect(value(orbitalFacts({ n: 4, l: 0, ml: 0 }, extras), 'Radial nodes')).toBe('3 (spheres)');
        expect(value(orbitalFacts({ n: 3, l: 1, ml: 1 }, extras), 'Radial nodes')).toBe('1 (a sphere)');
    });

    it('says shapes only where they are conventional, and names a j-level', () => {
        expect(shapeWord(2, -2)).toBe('cloverleaf');
        expect(shapeWord(2, 0)).toBe('dumbbell with a ring');
        expect(shapeWord(4, 1)).toBeNull();
        expect(value(orbitalFacts({ n: 6, l: 1, ml: 0, j: 1.5 }, extras), 'j')).toBe('3/2');
    });

    it('describes a subshell and the whole atom without inventing anything', () => {
        const sub = subshellFacts({ n: 3, l: 2, electrons: 6 }, { enclosedFraction: 0.9, energy: -0.3, method: 'non-relativistic LDA' });
        expect(sub.title).toBe('3d subshell');
        expect(sub.rows.find(r => r.term === 'Electrons')?.value).toBe('6 of 10');
        // Final review A, M6: a 3d^6 subshell's surface encloses 90% of EACH orbital's
        // probability, not 90% "of the electron" as if the subshell held one. The
        // orbital-level card above keeps "of the electron" -- it does hold one.
        expect(sub.rows.find(r => r.term === 'Enclosed')?.value).toBe("90 % of each orbital's probability");
        const atom = atomFacts({ title: 'Whole atom', configuration: '1s² 2s² 2p²', valence: '2s² 2p²', shellCount: 2, drawnRadius: 2.346, method: 'non-relativistic LDA' });
        expect(atom.rows.map(r => r.term)).toEqual(['Configuration', 'Valence', 'Shells', 'Drawn radius']);
        expect(atom.rows[3].value).toBe('2.35 a₀ (non-relativistic LDA)');
    });

    // Ruling T13-shellcard: a shell's card states the shell's own facts, never the whole atom's.
    it('describes a shell by its own occupancy, electrons and drawn radius (Fe M shell)', () => {
        const shell = shellFacts({ n: 3, occupancy: '3s² 3p⁶ 3d⁶', electrons: 14, drawnRadius: 1.6, method: 'non-relativistic LDA' });
        expect(shell.title).toBe('M shell');
        expect(shell.rows).toEqual([
            { term: 'n', value: '3' },
            { term: 'Occupancy', value: '3s² 3p⁶ 3d⁶' },
            { term: 'Electrons', value: '14' },
            { term: 'Drawn radius', value: '1.60 a₀ (non-relativistic LDA)' },
        ]);
        expect(shell.rows.map(r => r.term)).not.toContain('Configuration');
        expect(shell.rows.map(r => r.term)).not.toContain('Shells');
    });

    // Ruling T13-isostale: the previous orbital's iso value is never shown under the new orbital's name.
    it('marks the iso value as pending while the orbital computes', () => {
        const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, { ...extras, isoPending: true });
        const iso = facts.rows.find(row => row.term === 'Iso value');
        expect(iso).toEqual({ term: 'Iso value', value: '…', spokenValue: 'computing' });
    });
});
