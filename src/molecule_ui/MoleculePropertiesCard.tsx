import React, { useMemo } from 'react';
import { formatFormula, multiplicityText } from '../molecules/catalogue';
import { formatDipole } from '../molecules/dipole';
import { formatOrbitalEnergy, formatPointGroup, gapTerm, orbitalGaps, GAP_CAVEAT } from '../molecules/orbital_display';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { tierOf } from '../molecules/types';
import { detectBonds } from '../molecules/ball_and_stick';
import { structureRows } from '../molecules/bond_labels';
import { validatedLine } from '../validation/geometry_honesty';
import { COMPUTED_LINE, TIER_LABEL } from '../components/TierBadge';
import './molecule_explore.css';

interface PropertyRow { term: string; value: string; caption?: string }

/** The rows of spec §9.4 Properties, each from the function the rest of the app already uses for it (ruling P10). */
function propertyRows(meta: LibraryMoleculeMeta): PropertyRow[] {
    return [
        { term: 'Formula', value: formatFormula(meta.formula) },
        { term: 'Point group', value: formatPointGroup(meta.symmetry.pointGroup), caption: meta.symmetry.labelNote },
        { term: 'Electrons', value: String(meta.electronCount) },
        { term: 'Multiplicity', value: multiplicityText(meta.multiplicity) },
        // Ruling T7-O3: a documented caveat stays beside the number it qualifies.
        { term: 'Dipole', value: `${formatDipole(meta)}${meta.caveat ? ` — ${meta.caveat}` : ''}` },
        // The orbital list's own gaps: HOMO–LUMO (SOMO–LUMO for an open shell) and HOMO–LVMO where the LVMO is
        // one of the calculation's orbitals -- none to a constructed LVMO (Ruling D4-energy), none without a virtual.
        ...orbitalGaps(meta.orbitals).map(gap => ({ term: gapTerm(gap), value: formatOrbitalEnergy(gap.hartree), caption: GAP_CAVEAT })),
        { term: 'Geometry', value: meta.geometrySource, caption: tierOf(meta) === 'computed' ? COMPUTED_LINE : validatedLine(meta) },
        // Ruling T12-dup: the tier's name only; its line is the Geometry caption above (and the title block's).
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
                        <dd>
                            <span className="molecule-property-value">{row.value}</span>
                            {row.caption && <span className="molecule-property-caption">{row.caption}</span>}
                        </dd>
                    </React.Fragment>
                ))}
            </dl>
            <MoleculeStructure meta={meta} />
        </>
    );
};

export default MoleculePropertiesCard;
