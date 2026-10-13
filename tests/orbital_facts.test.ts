import { angularNodeSurfaces, atomFacts, orbitalFacts, shapeWord, subshellFacts } from '../src/orbital_facts';

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

    it('states n, l, mₗ, the real orbital, its nodes, the contour and the energy for 2p_z', () => {
        const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, extras);
        expect(facts.title).toBe('2p_z orbital');
        expect(value(facts, 'n')).toBe('2');
        expect(value(facts, 'l')).toBe('1 (p)');
        expect(value(facts, 'mₗ')).toBe('0');
        expect(value(facts, 'Radial nodes')).toBe('0');
        expect(value(facts, 'Angular nodes')).toBe('1 — the xy plane');
        expect(value(facts, 'Enclosed')).toBe('90 % of the electron');
        expect(value(facts, 'Iso value')).toBe('|ψ|² = 1.23e-3');
        expect(value(facts, 'Orbital energy')).toBe('−0.433 Ha (eigenvalue, non-relativistic LDA)');
        expect(facts.notes).toEqual(['ψ changes sign across every node.', 'Shape: dumbbell (qualitative).']);
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
        const atom = atomFacts({ title: 'Whole atom', configuration: '1s² 2s² 2p²', valence: '2s² 2p²', shellCount: 2, drawnRadius: 2.346, method: 'non-relativistic LDA' });
        expect(atom.rows.map(r => r.term)).toEqual(['Configuration', 'Valence', 'Shells', 'Drawn radius']);
        expect(atom.rows[3].value).toBe('2.35 a₀ (non-relativistic LDA)');
    });
});
