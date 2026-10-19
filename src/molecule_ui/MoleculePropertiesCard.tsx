import React from 'react';
import { formatFormula } from '../molecules/catalogue';
import { formatDipole } from '../molecules/dipole';
import { formatOrbitalEnergy, formatPointGroup, gapTerm, orbitalGaps, GAP_CAVEAT } from '../molecules/orbital_display';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { tierOf } from '../molecules/types';
import { validatedLine } from '../validation/geometry_honesty';
import { COMPUTED_LINE, tierLine } from '../components/TierBadge';
import './molecule_explore.css';

interface PropertyRow { term: string; value: string; caption?: string }

/** The rows of spec §9.4 Properties, each from the function the rest of the app already uses for it (ruling P10). */
function propertyRows(meta: LibraryMoleculeMeta): PropertyRow[] {
    return [
        { term: 'Formula', value: formatFormula(meta.formula) },
        { term: 'Point group', value: formatPointGroup(meta.symmetry.pointGroup), caption: meta.symmetry.labelNote },
        { term: 'Electrons', value: String(meta.electronCount) },
        { term: 'Multiplicity', value: String(meta.multiplicity) },
        // Ruling T7-O3: a documented caveat stays beside the number it qualifies.
        { term: 'Dipole', value: `${formatDipole(meta)}${meta.caveat ? ` — ${meta.caveat}` : ''}` },
        // The orbital list's own gaps: HOMO–LUMO (SOMO–LUMO for an open shell) and HOMO–LVMO where the LVMO is
        // one of the calculation's orbitals -- none to a constructed LVMO (Ruling D4-energy), none without a virtual.
        ...orbitalGaps(meta.orbitals).map(gap => ({ term: gapTerm(gap), value: formatOrbitalEnergy(gap.hartree), caption: GAP_CAVEAT })),
        { term: 'Geometry', value: meta.geometrySource, caption: tierOf(meta) === 'computed' ? COMPUTED_LINE : validatedLine(meta) },
        { term: 'Data tier', value: tierLine(meta) },
    ];
}

/**
 * Molecules' Properties (spec §9.4, ruling P10): facts `meta` already
 * carries, in the strings the rest of the app already shows, nothing
 * retyped. It is the inspector's Properties section, whose header names it
 * (ruling R24-3), so the card carries no heading of its own.
 */
const MoleculePropertiesCard: React.FC<{ meta: LibraryMoleculeMeta }> = ({ meta }) => (
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
);

export default MoleculePropertiesCard;
