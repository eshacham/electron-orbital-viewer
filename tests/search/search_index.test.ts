import { normaliseQuery, searchAll, SEARCH_GROUP_LIMIT } from '../../src/search/search_index';
import { LIBRARY_INDEX } from '../molecules/fixtures';

const sources = { molecules: LIBRARY_INDEX };
const first = (query: string, group: string) => searchAll(query, sources).find(result => result.group === group);

describe('search index (spec §8.3)', () => {
    it.each(['fe', 'Iron', '26'])('finds iron from "%s"', query => {
        const result = searchAll(query, sources)[0];
        expect(result.group).toBe('Elements');
        expect(result.action).toEqual({ kind: 'element', Z: 26 });
        expect(result.label).toBe('Iron (Fe)');
    });

    it.each(['h2o', 'H₂O', 'water'])('finds water from "%s"', query => {
        expect(first(query, 'Molecules')?.action).toEqual({ kind: 'molecule', id: 'h2o' });
    });

    // Ruling R23a: the group is named "Orbitals" now (was "Basic orbitals");
    // the action's 'basic' kind is the internal id and is unchanged.
    it('finds Orbitals by their names, written loosely', () => {
        expect(first('3dz2', 'Orbitals')?.action).toEqual({ kind: 'basic', n: 3, l: 2, ml: 0 });
        expect(first('3dz2', 'Orbitals')?.label).toBe('3d_z²');
        expect(first('4f xyz', 'Orbitals')?.action).toEqual({ kind: 'basic', n: 4, l: 3, ml: -2 });
    });

    it('finds the Bonds systems, H₂⁺ included', () => {
        expect(first('n2', 'Bonds')?.action).toEqual({ kind: 'bonds', system: 'n2' });
        expect(first('nitrogen', 'Bonds')?.action).toEqual({ kind: 'bonds', system: 'n2' });
        expect(first('h2+', 'Bonds')?.action).toEqual({ kind: 'bonds', system: 'h2plus' });
    });

    it('ranks an exact symbol first and ignores blank input (Review Focus 5)', () => {
        const elements = searchAll('c', sources).filter(r => r.group === 'Elements');
        expect(elements[0].label).toBe('Carbon (C)');
        expect(elements.length).toBe(SEARCH_GROUP_LIMIT);
        expect(searchAll('1', sources).filter(r => r.group === 'Elements').map(r => r.label)).toEqual(['Hydrogen (H)']);
        expect(searchAll('   ', sources)).toEqual([]);
        expect(searchAll('zz', sources)).toEqual([]);
    });

    it('keeps groups in order and each to six', () => {
        const groups = searchAll('c', sources).map(r => r.group);
        expect(groups).toEqual([...groups].sort((a, b) =>
            ['Elements', 'Molecules', 'Bonds', 'Orbitals'].indexOf(a) - ['Elements', 'Molecules', 'Bonds', 'Orbitals'].indexOf(b)));
        for (const group of new Set(groups)) expect(groups.filter(g => g === group).length).toBeLessThanOrEqual(SEARCH_GROUP_LIMIT);
    });

    it('works before the molecule index has loaded', () => {
        expect(() => searchAll('water', { molecules: null })).not.toThrow();
        expect(searchAll('water', { molecules: null }).some(r => r.group === 'Molecules')).toBe(false);
    });

    it('normalises sub- and superscripts, minus signs, spaces and underscores', () => {
        expect(normaliseQuery(' 3d_z² ')).toBe('3dz2');
        expect(normaliseQuery('H₂O')).toBe('h2o');
        expect(normaliseQuery('3d_x²−y²')).toBe('3dx2-y2');
        expect(normaliseQuery('H₂⁺')).toBe('h2+');
    });
});
