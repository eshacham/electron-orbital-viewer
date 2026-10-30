import {
    configurationFor, shellsFor, configurationLabel, subshellLabel,
    valenceConfigurationLabelOf, valenceShellsOf, valenceNote, valenceView, valenceLabelOfView,
} from '../../src/atom/configurations';
import { ionConfigurationFor, allowedCharges } from '../../src/atom/ion_configurations';
import { speciesConfiguration, excitationSources, excitationTargets, excitationLabel, type Excitation } from '../../src/atom/species';
import { valencePlainWords, valenceWordsOfView } from '../../src/info/atom_info';
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
        // Science corrections S3: the whole outermost shell is still valence, but the label now frames it -- a full
        // d around the closed s and p reads "3d¹⁰ (outside 3s² 3p⁶)", the same frame Info's words use.
        expect(valenceConfigurationLabelOf(ionConfigurationFor(30, 2))).toBe('3d¹⁰ (outside 3s² 3p⁶)');
        expect(valenceNote(ionConfigurationFor(30, 2))).toBeNull();
    });
});

// Science corrections S3: one valence rule. The panel's "Valence:" label and Info's plain words are two renderings
// of valenceView, so they cannot name different subshells.
describe('one valence rule (science corrections S3)', () => {
    const config = (Z: number, charge = 0) => speciesConfiguration({ Z, charge, excitation: null });
    const named = (text: string) => text.match(/\d[spdfgh]/g) ?? [];

    it.each([
        ['Fe',   26, 0, '3d⁶ 4s²'],                        // today's neutral labels stay, pinned before the change
        ['Gd',   64, 0, '4f⁷ 5d¹ 6s²'],
        ['C',     6, 0, '2s² 2p²'],
        ['Li',    3, 0, '2s¹'],
        ['Fe²⁺', 26, 2, '3d⁶ (outside 3s² 3p⁶)'],
        ['Ga³⁺', 31, 3, '3d¹⁰ (outside 3s² 3p⁶)'],
        ['Gd³⁺', 64, 3, '5s² 5p⁶ · open 4f⁷'],
        ['Lu³⁺', 71, 3, '5s² 5p⁶'],                        // a full 4f is core, as in the neutral atom
        ['Gd²⁺', 64, 2, '4f⁷ 5d¹ (outside 5s² 5p⁶)'],
    ])('%s reads Valence: %s', (_name, Z, charge, label) => {
        expect(valenceConfigurationLabelOf(config(Z, charge))).toBe(label);
    });

    it.each([
        [26, 0, 'outer'], [26, 2, 'df-outside-full-sp'], [31, 3, 'df-outside-full-sp'], [64, 3, 'outer'], [71, 3, 'outer'],
    ] as const)('Z = %i, charge %i has the %s frame', (Z, charge, frame) => {
        expect(valenceView(config(Z, charge)).frame).toBe(frame);
    });

    it('separates the closed s and p from the d, and the open inner f from the outer shell', () => {
        const fe2 = valenceView(config(26, 2));
        expect(fe2.core.map(s => `${s.n}${'spdf'[s.l]}`)).toEqual(['3s', '3p']);
        expect(fe2.subshells.map(s => `${s.n}${'spdf'[s.l]}`)).toEqual(['3s', '3p', '3d']);
        const gd3 = valenceView(config(64, 3));
        expect(gd3.core).toEqual([]);
        expect(gd3.openInner.map(s => `${s.n}${'spdf'[s.l]}`)).toEqual(['4f']);
        expect(valenceView(config(71, 3)).openInner).toEqual([]);
    });

    // Review Focus 4: for every species the app offers -- each element's allowed charges, each ground state and every
    // excitation offered for it -- the label and the plain words are renderings of the one view, and the d and f
    // subshells (plus the framing s and p) they name are the same. Nothing is skipped: allowedCharges lists only what
    // speciesConfiguration accepts.
    it('the label and Info\'s plain words are renderings of one valenceView, for every species and excitation', () => {
        let ground = 0;
        let excited = 0;
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) for (const charge of allowedCharges(Z)) {
            const excitations: (Excitation | null)[] = [null];
            for (const from of excitationSources(Z, charge)) {
                for (const to of excitationTargets(Z, charge, from)) excitations.push({ from, to });
            }
            for (const excitation of excitations) {
                const c = speciesConfiguration({ Z, charge, excitation });
                const view = valenceView(c);
                const label = valenceConfigurationLabelOf(c);
                const words = valencePlainWords(c);
                const where = `${Z}/${charge}/${excitation ? excitationLabel(excitation) : 'ground'}`;
                expect({ where, label }).toEqual({ where, label: valenceLabelOfView(view) });
                expect({ where, words }).toEqual({ where, words: valenceWordsOfView(view) });
                // Ruling T3 I1: a frame with nothing to be outside of is never printed.
                expect({ where, label: /outside\s*\)|outside\s*$/.test(label) }).toEqual({ where, label: false });
                expect({ where, words: /outside( a full)?\s*$/.test(words) }).toEqual({ where, words: false });
                const df = view.subshells.filter(s => s.l >= 2).map(s => `${s.n}${'spdfgh'[s.l]}`);
                expect({ where, label: named(label).filter(n => 'dfgh'.includes(n[1])) }).toEqual({ where, label: df });
                // The words say "the outer shell" for whatever sits in it, so they name a d/f only when it is framed
                // (the d/f frame) or open beneath the outer shell.
                const wordsDf = (view.frame === 'df-outside-full-sp' ? view.subshells.filter(s => !view.core.includes(s)) : view.openInner)
                    .map(s => `${s.n}${'spdfgh'[s.l]}`);
                expect({ where, words: named(words).filter(n => 'dfgh'.includes(n[1])) }).toEqual({ where, words: wordsDf });
                if (view.frame === 'df-outside-full-sp') {
                    const sp = view.core.map(s => `${s.n}${'spdfgh'[s.l]}`);
                    expect(named(label).filter(n => n[1] === 's' || n[1] === 'p')).toEqual(sp);
                    expect(named(words).filter(n => n[1] === 's' || n[1] === 'p')).toEqual(sp);
                }
                if (excitation) excited++; else ground++;
            }
        }
        // The exact counts: a change in what the app offers should be noticed here.
        expect({ ground, excited }).toEqual({ ground: 444, excited: 2703 });
    });

    // Ruling (T3 I1): the d/f frame needs a full s AND p in the outermost shell. An excited atom whose outermost shell
    // has a lone d, or a d beside a full s but no p, reads in configuration order and says "outer shell".
    it.each([
        ['C 2p → 3d', 6, 0, { from: { n: 2, l: 1 }, to: { n: 3, l: 2 } }, '3d¹', '1 electron in the outer shell'],
        ['Al 3p → 3d', 13, 0, { from: { n: 3, l: 1 }, to: { n: 3, l: 2 } }, '3s² 3d¹', '3 electrons in the outer shell'],
    ])('%s has no frame', (_name, Z, charge, excitation, label, words) => {
        const c = speciesConfiguration({ Z, charge, excitation });
        expect(valenceView(c).frame).toBe('outer');
        expect(valenceConfigurationLabelOf(c)).toBe(label);
        expect(valencePlainWords(c)).toBe(words);
    });
});
