import {
    configurationFor, shellsFor, configurationLabel, subshellLabel,
    valenceConfigurationLabelOf, valenceShellsOf, valenceNote,
} from '../../src/atom/configurations';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';
import { MAX_ATOMIC_NUMBER } from '../../src/elements';

describe('electron configurations', () => {
    it('covers every element', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            expect(configurationFor(Z).length).toBeGreaterThan(0);
        }
    });

    it('assigns exactly Z electrons to every neutral atom', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            const total = configurationFor(Z).reduce((sum, s) => sum + s.electrons, 0);
            expect(total).toBe(Z);
        }
    });

    it('never overfills a subshell', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            for (const subshell of configurationFor(Z)) {
                expect(subshell.electrons).toBeGreaterThan(0);
                expect(subshell.electrons).toBeLessThanOrEqual(2 * (2 * subshell.l + 1));
                expect(subshell.l).toBeLessThan(subshell.n);
                expect(subshell.l).toBeLessThanOrEqual(3);
                expect(subshell.n).toBeLessThanOrEqual(7);
            }
        }
    });

    it('knows carbon', () => {
        expect(configurationLabel(6)).toBe('1s² 2s² 2p²');
    });

    it('knows the aufbau exceptions', () => {
        expect(configurationLabel(24)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵ 4s¹');   // chromium
        expect(configurationLabel(29)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s¹');  // copper
    });

    it('knows oganesson ends at 7p6', () => {
        const configuration = configurationFor(118);
        const last = configuration[configuration.length - 1];
        expect(last).toEqual({ n: 7, l: 1, electrons: 6 });
    });

    it('groups subshells into shells', () => {
        const shells = shellsFor(6);
        expect(shells).toHaveLength(2);
        expect(shells[0]).toEqual({ n: 1, electrons: 2, subshells: [{ n: 1, l: 0, electrons: 2 }] });
        expect(shells[1].n).toBe(2);
        expect(shells[1].electrons).toBe(4);
        expect(shells[1].subshells).toHaveLength(2);
    });

    it('labels subshells', () => {
        expect(subshellLabel(2, 1)).toBe('2p');
        expect(subshellLabel(4, 3)).toBe('4f');
    });

    it('labels a j-level in the spec\'s notation', () => {
        expect(subshellLabel(6, 1, 1.5)).toBe('6p³⁄₂');
        expect(subshellLabel(2, 0, 0.5)).toBe('2s½');
    });

    it('orders subshells by n then l regardless of filling order', () => {
        const chromium = configurationFor(24);
        const keys = chromium.map(s => s.n * 10 + s.l);
        expect(keys).toEqual([...keys].sort((a, b) => a - b));
    });

    it('does not let a caller corrupt the cached configuration', () => {
        const first = configurationFor(6);
        first.push({ n: 99, l: 0, electrons: 1 });

        const second = configurationFor(6);
        expect(second).toHaveLength(3);
        expect(second.some(s => s.n === 99)).toBe(false);
    });

    // Exact configurationLabel strings for six non-exception elements spanning
    // the periods, chosen to catch a wrong-but-electron-balanced transcription
    // that the totals/bounds/exceptions tests above would miss. Each expected
    // string was derived independently from the same source used to build the
    // table (the NIST-cited "Electron configurations of the elements" data
    // page: https://en.wikipedia.org/wiki/Electron_configurations_of_the_elements_(data_page)),
    // by expanding that source's own noble-gas-core notation and sorting by
    // (n, l) by hand -- not read back from this module's own output.
    it.each([
        [14, '1s² 2s² 2p⁶ 3s² 3p²'],                                                     // Si: [Ne] 3s2 3p2
        [33, '1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s² 4p³'],                                         // As: [Ar] 3d10 4s2 4p3
        [50, '1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s² 4p⁶ 4d¹⁰ 5s² 5p²'],                            // Sn: [Kr] 4d10 5s2 5p2
        [68, '1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s² 4p⁶ 4d¹⁰ 4f¹² 5s² 5p⁶ 6s²'],                    // Er: [Xe] 4f12 6s2
        [82, '1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s² 4p⁶ 4d¹⁰ 4f¹⁴ 5s² 5p⁶ 5d¹⁰ 6s² 6p²'],           // Pb: [Xe] 4f14 5d10 6s2 6p2
        [118, '1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s² 4p⁶ 4d¹⁰ 4f¹⁴ 5s² 5p⁶ 5d¹⁰ 5f¹⁴ 6s² 6p⁶ 6d¹⁰ 7s² 7p⁶'], // Og: [Rn] 5f14 6d10 7s2 7p6
    ] as Array<[number, string]>)('knows the full configuration of Z=%i', (Z, expected) => {
        expect(configurationLabel(Z)).toBe(expected);
    });
});

// Ruling P14 (R-valence): valence is the outermost shell, plus any partly
// filled (n-1)d or (n-2)f subshell beneath it -- a filled d/f subshell is
// core, same as it always was, and so is a d/f subshell that happens to
// still be open but sits two or more shells below the outermost one.
describe('valence (ruling P14)', () => {
    const label = (Z: number) => valenceConfigurationLabelOf(configurationFor(Z));

    it.each([
        [6, '2s² 2p²', null], [11, '3s¹', null], [17, '3s² 3p⁵', null],
        [26, '3d⁶ 4s²', 'open 3d counts as valence'], [30, '4s²', null], [29, '4s¹', null], [24, '3d⁵ 4s¹', 'open 3d counts as valence'],
        [58, '4f¹ 5d¹ 6s²', 'open 4f and 5d count as valence'], [64, '4f⁷ 5d¹ 6s²', 'open 4f and 5d count as valence'],
        [70, '6s²', null], [71, '5d¹ 6s²', 'open 5d counts as valence'],
        [91, '5f² 6d¹ 7s²', 'open 5f and 6d count as valence'], [92, '5f³ 6d¹ 7s²', 'open 5f and 6d count as valence'],
    ])('Z=%i reads %s', (Z, expected, note) => {
        expect(label(Z)).toBe(expected);
        expect(valenceNote(configurationFor(Z))).toBe(note);
    });

    it('shell set spans every valence subshell', () => {
        expect([...valenceShellsOf(configurationFor(91))].sort()).toEqual([5, 6, 7]);
        expect([...valenceShellsOf(configurationFor(30))]).toEqual([4]);
    });

    it('the outermost shell is always whole, even when it ends in a filled d (Zn²⁺ = [Ar] 3d¹⁰)', () => {
        expect(valenceConfigurationLabelOf(ionConfigurationFor(30, 2))).toBe('3s² 3p⁶ 3d¹⁰');
        expect(valenceNote(ionConfigurationFor(30, 2))).toBeNull();
    });
});
