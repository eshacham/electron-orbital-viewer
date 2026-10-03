import { KNOWN_FAILURES as HEAVY, offeredHeavySpecies, offeredHeavyNeutrals, outcomeKey } from './relativistic_heavy_sweep';
import { KNOWN_FAILURES as LIGHT, offeredSpecies } from './excitation_sweep';
import { speciesKey } from '../../src/atom/species';

// The two slow sweeps pin their verdicts (ruling T7-d) but run only with
// ATOM_SLOW_TESTS=1. These checks on the lists themselves are instant, so
// they run by default: a key no shard can produce would otherwise sit in
// a list unnoticed, and "unbound" must mean an anion.
const isAnionKey = (key: string) => /^\d+-\d/.test(key);

describe('the slow sweeps\' known-failure lists', () => {
    it('name only species and modes the heavy sweep solves', () => {
        const swept = new Set([
            ...offeredHeavySpecies().flatMap(s => [outcomeKey(s, 'off'), outcomeKey(s, 'scalar')]),
            ...offeredHeavyNeutrals().map(s => outcomeKey(s, 'spinOrbit')),
        ]);
        for (const key of Object.keys(HEAVY)) expect([key, swept.has(key)]).toEqual([key, true]);
    });

    it('name only species the excitation sweep solves', () => {
        const swept = new Set(offeredSpecies().map(speciesKey));
        for (const key of Object.keys(LIGHT)) expect([key, swept.has(key)]).toEqual([key, true]);
    });

    it('call exactly the anions unbound', () => {
        for (const [key, verdict] of Object.entries(HEAVY)) expect([key, verdict === 'unbound']).toEqual([key, isAnionKey(key)]);
        for (const [key, { picture }] of Object.entries(LIGHT)) expect([key, picture === 'unbound']).toEqual([key, isAnionKey(key)]);
    });
});
