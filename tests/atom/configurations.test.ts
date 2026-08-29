import { configurationFor, shellsFor, configurationLabel, subshellLabel } from '../../src/atom/configurations';
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
