// tests/molecule_ui/properties_card.test.tsx -- Molecules' Properties card (Phase 6G-2 Task 12, ruling P10).
// Ruling P10: nothing retyped -- every value is compared with the output of the function the rest of the app
// already uses for it; only the row labels are literals.
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import MoleculePropertiesCard from '../../src/molecule_ui/MoleculePropertiesCard';
// Task 16d item 7: one import from catalogue (it was imported twice).
import { multiplicityText } from '../../src/molecules/catalogue';
import { TIER_LABEL } from '../../src/components/TierBadge';
import { glycineAtoms, methaneMeta, waterMeta } from '../molecules/fixtures';
import PreviewDetails from '../../src/components/PreviewDetails';
import { previewFixture } from '../jobs/api_fixtures';

type Meta = ReturnType<typeof waterMeta>;

/** term → { value, caption } in document order, read from the card's <dl>. */
function rows(container: HTMLElement) {
    const list = container.querySelector('dl') as HTMLElement;
    expect(list).not.toBeNull();
    const out: Array<{ term: string; value: string; caption: string | null }> = [];
    for (const dt of Array.from(list.querySelectorAll('dt'))) {
        const dd = dt.nextElementSibling as HTMLElement;
        expect(dd.tagName).toBe('DD');
        // Fix round 2 (N5): a caption is whatever the <dd> says beyond its value (the caption class is gone with the
        // captions, so querying it would find nothing whatever the card printed).
        const value = dd.querySelector('.molecule-property-value')?.textContent ?? '';
        const rest = (dd.textContent ?? '').replace(value, '').trim();
        out.push({ term: dt.textContent ?? '', value, caption: rest || null });
    }
    return out;
}
const row = (container: HTMLElement, term: string) => rows(container).find(r => r.term === term);

describe('MoleculePropertiesCard (spec §9.4 Properties, ruling P10)', () => {
    // Task 7b fix round 1 (ruling on concern 4): each molecule number has one home, Info -- the point group, electrons,
    // dipole (with ozone's caveat) and the gaps are its facts, beside their (i)s and the Kohn–Sham caveat
    // (tests/info/molecule_info.test.ts re-homes this file's point-group, caveat and gap tests), and the title names the
    // formula. The card keeps only what Info does not show.
    it('gives water\'s rows, in order -- multiplicity, geometry, data tier -- and none of Info\'s numbers', () => {
        const meta = waterMeta();
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        expect(rows(container)).toEqual([
            { term: 'Multiplicity', value: multiplicityText(meta.multiplicity), caption: null },
            // The geometry source, said once on screen.
            { term: 'Geometry', value: meta.geometrySource, caption: null },
            // Ruling T12-dup: the tier's name only -- its line is the title block's (and on a phone Info's last note).
            { term: 'Data tier', value: TIER_LABEL.validated, caption: null },
        ]);
        expect(container.textContent).not.toMatch(/Formula|Point group|Electrons|Dipole|gap|eV|Ha\b/);
    });

    it('is a description list with tabular numerals (spec §4.3)', () => {
        const { container } = render(<MoleculePropertiesCard meta={waterMeta()} />);
        expect(container.querySelector('dl')).toHaveClass('ql-tabular');
    });

    // The one number only the card had stays on it: an open shell's multiplicity.
    it('names an open shell\'s multiplicity', () => {
        const meta = waterMeta({ multiplicity: 2 });
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        expect(row(container, 'Multiplicity')?.value).toBe(multiplicityText(2));
    });

    // Task 7b: the computed line that captioned the geometry is the title block's (TierBadge), not repeated here.
    it('gives a computed molecule\'s geometry, and its tier row names the tier', () => {
        const meta: Meta = waterMeta({ tier: 'computed', geometrySource: 'optimised (B3LYP-D3(BJ)/def2-SVP)' });
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        expect(row(container, 'Geometry')).toEqual({ term: 'Geometry', value: meta.geometrySource, caption: null });
        expect(row(container, 'Data tier')?.value).toBe(TIER_LABEL.computed);
    });

    // Ruling T12-I1: the section stays while a chosen molecule's facts are on their way.
    it('says it is loading while the chosen molecule\'s meta is on its way', () => {
        const { container } = render(<MoleculePropertiesCard meta={null} />);
        expect(container.querySelector('dl')).toBeNull();
        expect(container).toHaveTextContent('Loading…');
    });
});

// Ruling T12-M1: one wording for the spin multiplicity, the request preview's and the Properties card's.
// Ruling T14-I2 (spec §9.4.1's "Structure table"): the on-model labels are aria-hidden, so their numbers are
// here as real tables -- every bond and every two-bond angle, always, whether or not the labels are on.
describe('MoleculePropertiesCard: the Structure tables (ruling T14-I2)', () => {
    const cells = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)
        .map(row => Array.from(row.children).map(cell => cell.textContent));

    it('lists water’s two O–H lengths and its angle, in a folded Structure block a keyboard can open', () => {
        const { container } = render(<MoleculePropertiesCard meta={waterMeta()} />);
        const block = container.querySelector('details.molecule-structure') as HTMLDetailsElement;
        expect(block).not.toBeNull();
        const summary = block.querySelector('summary')!;
        expect(summary).toHaveTextContent(/^Structure2 bonds · 1 angle$/);
        expect(block.open).toBe(false);
        fireEvent.click(summary);
        const lengths = within(block).getByRole('table', { name: 'Bond lengths' });
        expect(cells(lengths)).toEqual([['O1–H2', '0.958 Å'], ['O1–H3', '0.958 Å']]);
        expect(within(lengths).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Bond', 'Length']);
        expect(within(lengths).getAllByRole('rowheader').map(h => h.textContent)).toEqual(['O1–H2', 'O1–H3']);
        const angles = within(block).getByRole('table', { name: 'Angles' });
        expect(cells(angles)).toEqual([['H2–O1–H3', '104.5°']]);
        expect(block.querySelector('table')).toHaveClass('ql-tabular');
    });

    it('lists glycine’s nine bonds and its one angle', () => {
        const { container } = render(<MoleculePropertiesCard meta={waterMeta({ id: 'glycine', atoms: glycineAtoms() })} />);
        const block = container.querySelector('details.molecule-structure') as HTMLElement;
        expect(block.querySelector('summary')).toHaveTextContent(/^Structure9 bonds · 1 angle$/);
        expect(cells(within(block).getByRole('table', { name: 'Bond lengths' }))).toHaveLength(9);
        expect(cells(within(block).getByRole('table', { name: 'Angles' }))).toEqual([['C3–O5–H6', expect.stringMatching(/^\d{3}\.\d°$/)]]);
    });

    it('has no Angles table where no atom has exactly two bonds (methane)', () => {
        const { container } = render(<MoleculePropertiesCard meta={methaneMeta()} />);
        const block = container.querySelector('details.molecule-structure') as HTMLElement;
        expect(block.querySelector('summary')).toHaveTextContent(/^Structure4 bonds$/);
        expect(cells(within(block).getByRole('table', { name: 'Bond lengths' }))).toHaveLength(4);
        expect(within(block).queryByRole('table', { name: 'Angles' })).toBeNull();
    });
});

describe('multiplicityText', () => {
    it('names the multiplicity after its number, and gives the bare number past the named ones', () => {
        expect(multiplicityText(1)).toBe('1 (singlet)');
        expect(multiplicityText(2)).toBe('2 (doublet)');
        expect(multiplicityText(3)).toBe('3 (triplet)');
        expect(multiplicityText(6)).toBe('6 (sextet)');
        expect(multiplicityText(7)).toBe('7');
    });

    it('is the wording both the request preview and the Properties card show', () => {
        const { container } = render(<PreviewDetails preview={{ ...previewFixture('preview_ok'), multiplicity: 3 }} />);
        const dt = Array.from(container.querySelectorAll('dt')).find(e => e.textContent === 'Multiplicity') as HTMLElement;
        expect(dt.nextElementSibling).toHaveTextContent(multiplicityText(3));
        expect(dt.nextElementSibling?.textContent).toBe('3 (triplet)');
    });
});
