import React, { useMemo } from 'react';
import { multiplicityText } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { tierOf } from '../molecules/types';
import { detectBonds } from '../molecules/ball_and_stick';
import { structureRows } from '../molecules/bond_labels';
import { TIER_LABEL } from '../validation/geometry_honesty';
import DisclosureChevron from '../components/DisclosureChevron';
import './molecule_explore.css';

interface PropertyRow { term: string; value: React.ReactNode }

/**
 * The rows of spec §9.4 Properties, each from the function the rest of the app already uses for it (ruling P10).
 * Task 7b fix round 1 (ruling on concern 4): each molecule number has one home, Info -- the point group, electrons,
 * dipole (with ozone's caveat) and gaps are its facts, beside their (i)s and the Kohn–Sham caveat, and the title names
 * the formula. The card keeps what Info does not show: the multiplicity, where the geometry comes from (said once on
 * screen), the data tier, and the structure tables below.
 */
function propertyRows(meta: LibraryMoleculeMeta): PropertyRow[] {
    return [
        { term: 'Multiplicity', value: multiplicityText(meta.multiplicity) },
        { term: 'Geometry', value: meta.geometrySource },
        // Ruling T12-dup: the tier's name only; its line is the title block's (and, on a phone, Info's last note).
        { term: 'Data tier', value: TIER_LABEL[tierOf(meta)] },
    ];
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/**
 * Ruling T14-I2 (spec §9.4.1's "Structure table"): every bond's length and every two-bond angle, the
 * on-model labels' own numbers (bond_labels.ts structureRows), as real tables -- the labels are aria-hidden,
 * and a pick needs a pointer, so this is where a keyboard or screen reader finds them. Folded under a
 * summary that counts them, so a large molecule keeps the card short; there whether or not labels are on.
 */
const MoleculeStructure: React.FC<{ meta: LibraryMoleculeMeta }> = ({ meta }) => {
    const rows = useMemo(() => structureRows(meta.atoms, detectBonds(meta.atoms)), [meta.atoms]);
    const table = (caption: string, [what, value]: [string, string], items: Array<[string, string]>) => (
        <table className="molecule-structure-table ql-tabular">
            <caption>{caption}</caption>
            <thead><tr><th scope="col">{what}</th><th scope="col">{value}</th></tr></thead>
            <tbody>
                {items.map(([atoms, value]) => <tr key={atoms}><th scope="row">{atoms}</th><td>{value}</td></tr>)}
            </tbody>
        </table>
    );
    return (
        <details className="molecule-structure">
            <summary>
                Structure
                <span className="molecule-structure-count">
                    {[plural(rows.bonds.length, 'bond'), rows.angles.length ? plural(rows.angles.length, 'angle') : null].filter(Boolean).join(' · ')}
                </span>
                <DisclosureChevron />
            </summary>
            {table('Bond lengths', ['Bond', 'Length'], rows.bonds.map(r => [r.atoms, r.length]))}
            {rows.angles.length > 0 && table('Angles', ['Atoms', 'Angle'], rows.angles.map(r => [r.atoms, r.angle]))}
        </details>
    );
};

/**
 * Molecules' Properties (spec §9.4, ruling P10): facts `meta` already
 * carries, in the strings the rest of the app already shows, nothing
 * retyped. It is the inspector's Properties section, whose header names it
 * (ruling R24-3), so the card carries no heading of its own. `meta` is null
 * while a chosen molecule's facts are on their way: the section stays, saying
 * so, so the open section never jumps on a molecule change (ruling T12-I1).
 */
const MoleculePropertiesCard: React.FC<{ meta: LibraryMoleculeMeta | null }> = ({ meta }) => {
    if (meta === null) return <p className="molecule-properties-status">Loading…</p>;
    return (
        <>
            <dl className="molecule-properties ql-tabular">
                {propertyRows(meta).map(row => (
                    <React.Fragment key={row.term}>
                        <dt>{row.term}</dt>
                        <dd><span className="molecule-property-value">{row.value}</span></dd>
                    </React.Fragment>
                ))}
            </dl>
            <MoleculeStructure meta={meta} />
        </>
    );
};

export default MoleculePropertiesCard;
