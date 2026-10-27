// tests/molecule_ui/properties_card.test.tsx -- Molecules' Properties card (Phase 6G-2 Task 12, ruling P10).
// Ruling P10: nothing retyped -- every value is compared with the output of the function the rest of the app
// already uses for it; only the row labels are literals.
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import MoleculePropertiesCard from '../../src/molecule_ui/MoleculePropertiesCard';
// Task 16d item 7: one import from catalogue (it was imported twice).
import { formatFormula, multiplicityText } from '../../src/molecules/catalogue';
import { dipoleFactText } from '../../src/molecules/dipole';
import { formatPointGroup, gapTerm, orbitalGaps } from '../../src/molecules/orbital_display';
import { orbitalEnergyText } from '../../src/format/energy';
import { nb } from '../../src/format/text';
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
        out.push({
            term: dt.textContent ?? '',
            value: dd.querySelector('.molecule-property-value')?.textContent ?? '',
            caption: dd.querySelector('.molecule-property-caption')?.textContent ?? null,
        });
    }
    return out;
}
const row = (container: HTMLElement, term: string) => rows(container).find(r => r.term === term);

/** A gap's value as the card (and Info) print it: eV first, Ha in parentheses, held on one line (Task 7b). */
const gapValue = (hartree: number) => nb(orbitalEnergyText(hartree));

describe('MoleculePropertiesCard (spec §9.4 Properties, ruling P10)', () => {
    // Task 7b: values only -- the captions (the gap's Kohn–Sham caveat, the geometry's tier line, the point group's
    // label note) are Info's, each said once; the gap reads eV first and the dipole in Info's own wording.
    it('gives water\'s rows, in order, with the strings the rest of the app already uses, and no captions', () => {
        const meta = waterMeta();
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        const [gap] = orbitalGaps(meta.orbitals);
        expect(rows(container)).toEqual([
            { term: 'Formula', value: formatFormula(meta.formula), caption: null },
            { term: 'Point group', value: formatPointGroup(meta.symmetry.pointGroup), caption: null },
            { term: 'Electrons', value: String(meta.electronCount), caption: null },
            { term: 'Multiplicity', value: multiplicityText(meta.multiplicity), caption: null },
            { term: 'Dipole', value: dipoleFactText(meta), caption: null },
            { term: gapTerm(gap), value: gapValue(gap.hartree), caption: null },
            { term: 'Geometry', value: meta.geometrySource, caption: null },
            // Ruling T12-dup: the tier's name only -- its line is the title block's.
            { term: 'Data tier', value: TIER_LABEL.validated, caption: null },
        ]);
        // The label is the one Info gives the same gap; eV first.
        expect(gapTerm(gap)).toBe('HOMO–LUMO gap');
        expect(gapValue(gap.hartree).replace(/\u00A0/g, ' ')).toBe('8.71 eV (0.320 Ha)');
    });

    it('is a description list with tabular numerals (spec §4.3)', () => {
        const { container } = render(<MoleculePropertiesCard meta={waterMeta()} />);
        expect(container.querySelector('dl')).toHaveClass('ql-tabular');
    });

    // Task 7b: the point group is typeset (<PointGroupLabel>, ruling T3-pg); its label note is Info's (labelsSentence).
    it('typesets the point group, with no caption', () => {
        const meta = waterMeta({ symmetry: { pointGroup: 'Dooh', labelGroup: 'D2h', labels: 'subgroup', labelNote: 'labelled in D2h, the subgroup PySCF uses' } });
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        expect(row(container, 'Point group')).toEqual({ term: 'Point group', value: formatPointGroup('Dooh'), caption: null });
        const value = [...container.querySelectorAll('dt')].find(dt => dt.textContent === 'Point group')!.nextElementSibling as HTMLElement;
        expect(value.querySelector('sub')).toHaveTextContent('∞h');
        expect(container.textContent).not.toContain(meta.symmetry.labelNote);
    });

    it('puts a documented caveat beside the dipole, unseparated (T7-O3, ozone)', () => {
        const caveat = 'Ozone has strong multireference character.';
        const meta = waterMeta({ id: 'o3', name: 'Ozone', caveat });
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        expect(row(container, 'Dipole')?.value).toBe(`${dipoleFactText(meta)} — ${caveat}`);
    });

    it('gives the HOMO–LVMO gap too where the LVMO is one of the calculation\'s own orbitals', () => {
        const meta = waterMeta({
            orbitals: [
                { index: 0, label: '1πg', energyHartree: -0.30, occupation: 2, role: 'HOMO' },
                { index: 1, label: '5σg', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.4, class: 'diffuse' },
                { index: 2, label: '2πu', energyHartree: 0.20, occupation: 0, role: 'LVMO', valenceCharacter: 0.97, class: 'valence' },
            ],
        });
        const gaps = orbitalGaps(meta.orbitals);
        expect(gaps).toHaveLength(2);
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        for (const gap of gaps) {
            // Task 7b: no caption -- the Kohn–Sham caveat is Info's, said once.
            expect(row(container, gapTerm(gap))).toEqual({ term: gapTerm(gap), value: gapValue(gap.hartree), caption: null });
        }
        expect(gaps.map(gapTerm)).toEqual(['HOMO–LUMO gap', 'HOMO–LVMO gap']);
    });

    it('gives no gap to a constructed LVMO (Ruling D4-energy), and none at all where there is no virtual', () => {
        const constructed = waterMeta({
            orbitals: [
                ...waterMeta().orbitals,
                { index: 6, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', kind: 'valence-virtual', constructed: true, energyApproximate: true },
            ],
        });
        const one = render(<MoleculePropertiesCard meta={constructed} />);
        expect(rows(one.container).map(r => r.term).filter(term => term.endsWith('gap'))).toEqual(['HOMO–LUMO gap']);
        one.unmount();
        const occupiedOnly = waterMeta({ orbitals: waterMeta().orbitals.filter(o => o.occupation > 0) });
        const none = render(<MoleculePropertiesCard meta={occupiedOnly} />);
        expect(rows(none.container).some(r => r.term.endsWith('gap'))).toBe(false);
    });

    it('names an open shell\'s gap from its SOMO', () => {
        const meta = waterMeta({
            multiplicity: 2,
            orbitals: [
                { index: 0, label: '1a1', energyHartree: -0.6, occupation: 1, spin: 'alpha', role: 'SOMO' },
                { index: 1, label: '2a1', energyHartree: 0.1, occupation: 0, spin: 'alpha', role: 'LUMO' },
            ],
        });
        const { container } = render(<MoleculePropertiesCard meta={meta} />);
        expect(row(container, 'SOMO–LUMO gap')?.value).toBe(gapValue(orbitalGaps(meta.orbitals)[0].hartree));
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
