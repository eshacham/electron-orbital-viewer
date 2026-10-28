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
        for (const text of Object.values(glossary[id])) {
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
