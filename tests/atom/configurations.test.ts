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
});
