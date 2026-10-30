// tests/info/glossary.test.ts -- Task 4: every term an (i) can open is written in the three bands (plain, technical,
// and optionally full), in the app's typography: no code-style "_" names and a true minus (U+2212) before a number.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { glossary } from '../../src/info/glossary';
import { INFO_TOPIC_IDS } from '../../src/info/info_types';

/** Every app source file, tests left out. */
function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
}

describe('glossary (Task 4)', () => {
    it('has exactly one entry per InfoTopicId', () => {
        expect(Object.keys(glossary).sort()).toEqual([...INFO_TOPIC_IDS].sort());
    });

    it.each(INFO_TOPIC_IDS.map(id => [id]))('%s has a title and non-empty plain and technical bands', id => {
        const entry = glossary[id];
        expect(entry.title.trim()).not.toBe('');
        expect(entry.plain.trim()).not.toBe('');
        expect(entry.technical.trim()).not.toBe('');
        if (entry.full !== undefined) expect(entry.full.trim()).not.toBe('');
    });

    it.each(INFO_TOPIC_IDS.map(id => [id]))('%s uses the app typography: no "_" and no hyphen-minus before a digit', id => {
        const { marks, ...bands } = glossary[id];
        const texts = [...Object.values(bands), ...(marks ?? []).flatMap(mark => [mark.mark, mark.text])];
        for (const text of texts) {
            expect([id, text.includes('_')]).toEqual([id, false]);
            expect([id, /-\d/.test(text)]).toEqual([id, false]);
        }
    });

    // The bands stay short (plan: plain at most 2 sentences, technical at most 3).
    it.each(INFO_TOPIC_IDS.map(id => [id]))('%s keeps its plain band to 2 sentences and its technical band to 3', id => {
        const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z(|ψρμΔ])/).filter(Boolean).length;
        expect([id, sentences(glossary[id].plain) <= 2]).toEqual([id, true]);
        expect([id, sentences(glossary[id].technical) <= 3]).toEqual([id, true]);
    });

    // Owner R26-2: the Atoms Orbitals tab's diagram and table are explained here, true to what SubshellPanel draws: one
    // line per subshell (per j-level with spin–orbit), placed by log |E| with the least bound at the top; the values are
    // Kohn–Sham (LDA) eigenvalues, not ionisation energies, which are ΔSCF.
    it('explains the orbital energy levels in three bands (owner R26-2)', () => {
        const entry = glossary.energyLevels;
        expect(entry.title).toBe('Orbital energies');
        expect(entry.plain).toMatch(/one subshell's orbital energy/);
        expect(entry.plain).toMatch(/held more tightly/);
        expect(entry.plain).toMatch(/log scale/);
        expect(entry.technical).toMatch(/Kohn–Sham/);
        expect(entry.technical).toMatch(/LDA/);
        expect(entry.technical).toMatch(/not ionisation energies/);
        expect(entry.technical).toMatch(/ΔSCF/);
        expect(entry.technical).toMatch(/log \|E\|/);
        expect(entry.full).toMatch(/j = l − ½ and j = l \+ ½/);
        expect(entry.full).toMatch(/[Ss]calar/);
    });

    // Owner R26-3 ("there is no info about the orbitals notation (e.g., ↑↓ 2σg)"): the MO diagram's plain band explains
    // every mark the diagram shows, one short line each -- checked against what MoDiagram draws for N₂, CO, H₂⁺, He₂ and
    // O₂ (CO's and HF's labels carry no g/u and no *; O₂'s π* and H₂⁺'s 1σg hold a lone ↑; only N₂-like rows have a core).
    it("explains every mark of the MO diagram in its plain band, one line each (owner R26-3)", () => {
        const marks = glossary.moDiagram.marks!;
        expect(marks.map(mark => mark.mark)).toEqual(['―', '↑↓', '↑', 'σ, π', 'g, u', '*', '1, 2, 3', '≈ core', '≈ higher empty levels']);
        const text = (mark: string) => marks.find(entry => entry.mark === mark)!.text;
        expect(text('―')).toMatch(/one orbital/i);
        expect(text('―')).toMatch(/no arrows.*empty/);
        expect(text('↑↓')).toMatch(/two electrons.*opposite spins/i);
        expect(text('↑')).toMatch(/one electron/i);
        expect(text('σ, π')).toMatch(/bond axis/);
        expect(text('σ, π')).toMatch(/nodal plane/);
        expect(text('g, u')).toMatch(/gerade/);
        expect(text('g, u')).toMatch(/ungerade/);
        expect(text('g, u')).toMatch(/centre/);
        expect(text('g, u')).toMatch(/CO and HF/);
        expect(text('*')).toMatch(/[Aa]ntibonding/);
        expect(text('1, 2, 3')).toMatch(/1σg, 2σg, 3σg/);
        expect(text('≈ core')).toMatch(/below a break/);
        // Science corrections (ruling M2): the higher empty levels fold into a band over a second break.
        expect(text('≈ higher empty levels')).toMatch(/empty orbitals above the lowest empty one.*above a break/i);
        expect(text('≈ higher empty levels')).toMatch(/not to scale/);
        // One short line each.
        for (const mark of marks) expect([mark.mark, mark.text.length <= 140]).toEqual([mark.mark, true]);
        // Arrows are real arrows (U+2191, U+2193), and the lines name what a reader hears.
        expect('↑↓').toBe('\u2191\u2193');
        expect(marks.filter(mark => /[―↑↓]/.test(mark.mark)).every(mark => mark.spoken)).toBe(true);
    });

    // Owner R26-2: the Kohn–Sham entry now also opens beside an atom's orbital energies, so it may not speak of
    // molecules alone.
    it('words the Kohn–Sham entry for atoms as well as molecules (owner R26-2)', () => {
        expect(glossary.kohnSham.plain).not.toMatch(/molecular orbitals here/);
        expect(glossary.kohnSham.plain).toMatch(/atoms/);
    });

    // Final review M3: an entry no (i) opens is unreachable -- each has an (i) beside its term somewhere on screen:
    // an InfoButton's `topic`, a fact label's (i) (withInfo's / labelWithInfo's topic argument) or an Orbitals row's
    // (BasicExplore's rowLabel).
    it('every entry is opened by some (i)', () => {
        const source = sourceFiles(resolve(__dirname, '../../src')).map(path => readFileSync(path, 'utf8')).join('\n');
        const opened = INFO_TOPIC_IDS.filter(id =>
            new RegExp(`topic(=|:\\s*)["']${id}["']|[wW]ithInfo\\([^,]+,\\s*'${id}'|rowLabel\\('[^']*',.*'${id}'`).test(source));
        expect(opened).toEqual([...INFO_TOPIC_IDS]);
    });
});
