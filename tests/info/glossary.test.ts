// tests/info/glossary.test.ts -- Task 4: every term an (i) can open is written in the three bands (plain, technical,
// and optionally full), in the app's typography: no code-style "_" names and a true minus (U+2212) before a number.
import { glossary } from '../../src/info/glossary';
import { INFO_TOPIC_IDS } from '../../src/info/info_types';

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
});
