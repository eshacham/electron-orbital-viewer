import React from 'react';
import { Typography } from '@mui/material';
import Inspector from '../shell/Inspector';
import { BondsState } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { frontierParts } from '../bonds/captions';
import { withSubscripts } from '../format/subscripts';
import { h2plusLevelParts } from '../bonds/mo_diagram';
import InfoButton from '../info/InfoButton';

interface BondsInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    /**
     * The view settings (Controls' view half), heading the inspector above
     * Data, as every other mode's inspector heads its content (ruling
     * T20b-display-header). App leaves it out of the phone's stacked
     * inspector: there the sheet's own View tab holds them.
     */
    display?: React.ReactNode;
    /** Task 4: Info, always open above the sections (Inspector's `info`). App leaves it out of the phone's stacked inspector: there it has its own tab. */
    info?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    bonds: BondsState;
    data: BondsData;
    /** Task 2: false below Explore -- no Data section at all (the Display line says where it appears). Default true. */
    showData?: boolean;
}

/**
 * A lead and its entries as one line of text: each "· entry" after the first sits in a no-break span, so the "·" is held
 * to the entry it introduces and never wraps onto a line of its own (final polish F4). The text is unchanged.
 */
function heldList(lead: string, entries: readonly string[]): React.ReactNode {
    return (
        <>
            {withSubscripts(lead)}
            {entries.map((entry, index) => (
                <React.Fragment key={entry}>
                    {index > 0 && ' '}
                    <span className="bonds-held">{index > 0 && '· '}{withSubscripts(entry)}</span>
                </React.Fragment>
            ))}
        </>
    );
}

/**
 * Bonds mode's inspector (spec §9.3, Phase 6G-2 Task 9): Display on top,
 * then Data (titled sections, one open at a time, ruling R24-3) -- the
 * values: a molecule's frontier orbital(s) with their Kohn–Sham energies,
 * H₂⁺'s two exact levels. Task 3 (picture control): the potential curve
 * that was the Plot tab here is BondsPanel's now, under the R slider, so
 * "Plot and data" keeps only Data, as one section with no tab row; it names
 * itself the drawer bar's section, so the medium drawer stays one press
 * from it (ruling I5 kept H₂⁺'s Data for that). Task 7a: the method captions
 * and near-tie caveats are Info's "How this was computed" (bondsInfo); Data
 * keeps the values. Fix round 1 (I3): the frontier energies say they are
 * Kohn–Sham eigenvalues, with that (i), right beside them (ruling R19).
 */
const BondsInspector: React.FC<BondsInspectorProps> = ({ variant, info, display, open, onOpenChange, bonds, data, showData = true }) => {
    const frontier = bonds.system !== 'h2plus' && data.meta ? frontierParts(data.meta.orbitals) : [];
    const values = bonds.system === 'h2plus'
        ? bonds.R !== null && (
            <Typography variant="caption" className="bonds-frontier">{heldList('Exact levels — ', h2plusLevelParts(bonds.R))}</Typography>
        )
        // While the next scan point loads there are no values yet; they follow once its files land.
        : frontier.length > 0 && (
            <div className="bonds-data-line">
                <Typography variant="caption" className="bonds-frontier">{heldList('Kohn–Sham orbital energies — ', frontier)}</Typography>
                <InfoButton topic="kohnSham" label="Kohn–Sham orbitals" place="data" />
            </div>
        );
    return (
        <Inspector
            variant={variant}
            info={info}
            open={open}
            onOpenChange={onOpenChange}
            barSection="data"
            sections={[
                ...(display ? [{ key: 'display', title: 'Display', content: display }] : []),
                ...(showData ? [{ key: 'data', title: 'Data', content: values }] : []),
            ]}
        />
    );
};

export default BondsInspector;
