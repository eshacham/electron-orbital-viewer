import { configurationFor, configurationLabel, configurationLabelOf, shellsFor, shellsOf, valenceShellOf, valenceConfigurationLabelOf } from '../../src/atom/configurations';
import {
    neutralGround, isNeutralGround, speciesKey, speciesConfiguration, excitationSources, excitationTargets,
    isValidExcitation, chargeSuffix, speciesSymbol, speciesTitle, excitationLabel, encodeSpeciesParams, decodeSpeciesParams,
    AtomSpecies,
} from '../../src/atom/species';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';

const ref = (label: string) => ({ n: Number(label[0]), l: 'spdf'.indexOf(label[1]) });
const labels = (refs: Array<{ n: number; l: number }>) => refs.map(r => `${r.n}${'spdf'[r.l]}`);
const na3p: AtomSpecies = { Z: 11, charge: 0, excitation: { from: ref('3s'), to: ref('3p') } };

describe('configuration-based labels', () => {
    it('agree with the Z-based ones for neutral atoms', () => {
        for (const Z of [1, 6, 26, 79]) {
            expect(configurationLabelOf(configurationFor(Z))).toBe(configurationLabel(Z));
            expect(shellsOf(configurationFor(Z))).toEqual(shellsFor(Z));
        }
    });
    it('describe an excited atom by its own configuration', () => {
        const c = speciesConfiguration({ Z: 11, charge: 0, excitation: { from: ref('3s'), to: ref('4s') } });
        expect(shellsOf(c).map(s => s.n)).toEqual([1, 2, 4]);
        expect(valenceShellOf(c)).toBe(4);
        expect(valenceConfigurationLabelOf(c)).toBe('4s¹');
    });
});

describe('species', () => {
    it('keys a neutral ground state by Z alone, so existing cache keys do not change', () => {
        expect(speciesKey(neutralGround(26))).toBe('26');
        expect(speciesKey({ Z: 11, charge: 1, excitation: null })).toBe('11+1');
        expect(speciesKey({ Z: 17, charge: -1, excitation: null })).toBe('17-1');
        expect(speciesKey(na3p)).toBe('11:3s>3p');
        expect(speciesKey({ Z: 20, charge: 1, excitation: { from: ref('4s'), to: ref('4p') } })).toBe('20+1:4s>4p');
        expect(isNeutralGround(neutralGround(3))).toBe(true);
        expect(isNeutralGround(na3p)).toBe(false);
    });

    it('moves exactly one electron for an excitation', () => {
        expect(configurationLabelOf(speciesConfiguration(na3p))).toBe('1s² 2s² 2p⁶ 3p¹');
        expect(configurationLabelOf(speciesConfiguration({ Z: 6, charge: 0, excitation: { from: ref('2s'), to: ref('2p') } })))
            .toBe('1s² 2s¹ 2p³');
    });

    it('offers a neutral main-group atom its outermost shell as the source, and the four next subshells as targets', () => {
        expect(labels(excitationSources(11, 0))).toEqual(['3s']);
        expect(labels(excitationTargets(11, 0, ref('3s')))).toEqual(['3p', '4s', '3d', '4p']);
        expect(labels(excitationSources(6, 0))).toEqual(['2s', '2p']);
        expect(labels(excitationTargets(6, 0, ref('2s')))).toEqual(['2p', '3s', '3p', '3d']);
        expect(labels(excitationTargets(26, 0, ref('4s')))).toEqual(['3d', '4p', '5s', '4d']);
        expect(labels(excitationTargets(10, 0, ref('2p')))).toEqual(['3s', '3p', '3d']);
        expect(excitationSources(17, -1)).toEqual([]);          // no excitation of an anion
    });

    // Final review I1: the open subshell is the valence of a d or f ion, and
    // a closed d10 with nothing outside it is the valence of Cu+ and Pd --
    // while a closed core under a valence shell (Na 2p, K 3p) stays out.
    // Targets run in hydrogen-like (n, l) order for a cation, Madelung order
    // for a neutral atom, and an empty subshell the ground state skipped
    // (Pd's 5s, Ca+'s 3d) always counts as above.
    it.each([
        // [what, Z, charge, sources, { source: targets }]
        ['Fe³⁺ excites its open 3d, and its 3s/3p into 3d', 26, 3, ['3s', '3p', '3d'],
            { '3s': ['3d', '4s', '4p', '4d'], '3p': ['3d', '4s', '4p', '4d'], '3d': ['4s', '4p', '4d'] }],
        ['Cu⁺ excites its d¹⁰ into the empty 4s', 29, 1, ['3s', '3p', '3d'],
            { '3d': ['4s', '4p', '4d'], '3s': ['4s', '4p', '4d'] }],
        ['Pd excites its d¹⁰ into the 5s the ground state left empty', 46, 0, ['4s', '4p', '4d'],
            { '4d': ['5s', '5p', '5d'] }],
        ['Gd³⁺ excites its open 4f', 64, 3, ['4f', '5s', '5p'],
            { '4f': ['5d', '6s', '6p', '6d'], '5p': ['5d', '6s', '6p', '6d'] }],
        ['U³⁺ excites its open 5f', 92, 3, ['5f', '6s', '6p'],
            { '5f': ['6d', '7s', '7p', '7d'] }],
        ['Na keeps the D line first and leaves its 2p core alone', 11, 0, ['3s'],
            { '3s': ['3p', '4s', '3d', '4p'] }],
        ['C excites 2s into its half-empty 2p', 6, 0, ['2s', '2p'],
            { '2s': ['2p', '3s', '3p', '3d'], '2p': ['3s', '3p', '3d'] }],
        ['Ne offers the n = 3 shell, nothing past it', 10, 0, ['2s', '2p'],
            { '2p': ['3s', '3p', '3d'] }],
        ['K leaves its 3p core alone', 19, 0, ['4s'],
            { '4s': ['3d', '4p', '5s', '4d'] }],
        ['Ca⁺ reaches the 3d its ground state skipped (the 729 nm line)', 20, 1, ['4s'],
            { '4s': ['3d', '4p', '4d', '5s'] }],
    ] as Array<[string, number, number, string[], Record<string, string[]>]>)('%s', (_what, Z, charge, sources, targets) => {
        expect(labels(excitationSources(Z, charge))).toEqual(sources);
        for (const [from, expected] of Object.entries(targets)) {
            expect(labels(excitationTargets(Z, charge, ref(from)))).toEqual(expected);
            for (const to of expected) {
                const excited = speciesConfiguration({ Z, charge, excitation: { from: ref(from), to: ref(to) } });
                expect(excited.reduce((sum, s) => sum + s.electrons, 0)).toBe(Z - charge);   // one electron moved, none lost
            }
        }
    });

    it('never offers more than four targets, the source itself, or a full subshell', () => {
        for (let Z = 1; Z <= 118; Z++) {
            for (const charge of [0, 1, 2, 3]) {
                for (const from of excitationSources(Z, charge)) {
                    const targets = excitationTargets(Z, charge, from);
                    expect(targets.length).toBeLessThanOrEqual(4);
                    expect(targets.some(t => t.n === from.n && t.l === from.l)).toBe(false);
                    const ground = ionConfigurationFor(Z, charge);
                    for (const t of targets) {
                        const held = ground.find(s => s.n === t.n && s.l === t.l)?.electrons ?? 0;
                        expect(held).toBeLessThan(2 * (2 * t.l + 1));
                    }
                }
            }
        }
    });

    it('validates an excitation against the species it would apply to', () => {
        expect(isValidExcitation(11, 0, { from: ref('3s'), to: ref('3p') })).toBe(true);
        expect(isValidExcitation(11, 0, { from: ref('2p'), to: ref('3p') })).toBe(false);  // not a source
        expect(isValidExcitation(11, 1, { from: ref('3s'), to: ref('3p') })).toBe(false);  // Na+ has no 3s
        expect(() => speciesConfiguration({ Z: 11, charge: 0, excitation: { from: ref('3s'), to: ref('9d') } })).toThrow();
    });

    it('labels charges and species the way chemistry writes them', () => {
        expect([0, 1, 2, 3, -1, -2].map(chargeSuffix)).toEqual(['', '⁺', '²⁺', '³⁺', '⁻', '²⁻']);
        expect(speciesSymbol({ Z: 26, charge: 2, excitation: null })).toBe('Fe²⁺');
        expect(speciesSymbol(na3p)).toBe('Na*');
        expect(speciesTitle(neutralGround(11))).toBe('Sodium');
        expect(speciesTitle({ Z: 17, charge: -1, excitation: null })).toBe('Chlorine ion Cl⁻');
        expect(speciesTitle(na3p)).toBe('Sodium, excited 3s → 3p');
        expect(excitationLabel(na3p.excitation!)).toBe('3s → 3p');
    });

    it('round-trips through URL parameters, writing nothing for the neutral ground state', () => {
        expect(encodeSpeciesParams(neutralGround(11))).toEqual({});
        const params = encodeSpeciesParams({ Z: 20, charge: 1, excitation: { from: ref('4s'), to: ref('4p') } });
        expect(params).toEqual({ charge: '1', excite: '4s-4p' });
        expect(decodeSpeciesParams(20, new URLSearchParams(params))).toEqual({ charge: 1, excitation: { from: ref('4s'), to: ref('4p') } });
    });

    it('decodeSpeciesParams ignores anything the element does not offer', () => {
        const neutral = { charge: 0, excitation: null };
        expect(decodeSpeciesParams(11, new URLSearchParams('charge=3'))).toEqual(neutral);
        expect(decodeSpeciesParams(11, new URLSearchParams('charge=abc'))).toEqual(neutral);
        expect(decodeSpeciesParams(11, new URLSearchParams('excite=3s-9z'))).toEqual(neutral);
        expect(decodeSpeciesParams(11, new URLSearchParams('charge=1&excite=3s-3p'))).toEqual({ charge: 1, excitation: null });
    });
});
