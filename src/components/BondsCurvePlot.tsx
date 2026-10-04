import React from 'react';
import PotentialCurvePlot from './PotentialCurvePlot';
import { BondsState } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { UseH2PlusCurveResult } from '../bonds/useH2PlusCurve';
import { diatomicCurveSpec, h2plusCurveSpec } from '../bonds/curve';
import { DiatomicId, nearestScanIndex } from '../bonds/systems';

interface BondsCurvePlotProps {
    bonds: BondsState;
    data: BondsData;
    /** useH2PlusCurve's result; App enables it only in Bonds with H₂⁺ (ruling C7). */
    h2plus: UseH2PlusCurveResult;
    width: number;
    onCommitH2PlusR: (R: number) => void;
    onScanIndex: (index: number) => void;
}

/**
 * The Bonds potential curve, for the view column (desktop) or the Plot tab
 * (phone) -- the layout contract keeps it out of BondsPanel. H₂⁺'s curve is
 * computed in a worker, so until it lands this says so, and if it fails, why
 * (Task 9's carry); a molecule's comes with its scan, whose loading and
 * failures BondsPanel reports, so here it is simply absent until then.
 */
const BondsCurvePlot: React.FC<BondsCurvePlotProps> = ({ bonds, data, h2plus, width, onCommitH2PlusR, onScanIndex }) => {
    if (bonds.system === 'h2plus') {
        if (h2plus.error) {
            return (
                <div className="radial-plot potential-curve" role="alert">
                    <div className="radial-plot-note">The H₂⁺ potential curves could not be computed: {h2plus.error}</div>
                </div>
            );
        }
        if (!h2plus.curve) {
            return (
                <div className="radial-plot potential-curve">
                    <div className="radial-plot-note" role="status">Computing the exact H₂⁺ curves…</div>
                </div>
            );
        }
        return <PotentialCurvePlot {...h2plusCurveSpec(h2plus.curve, bonds.R)} width={width} onSelectR={onCommitH2PlusR} />;
    }
    const scan = data.scan;
    if (!scan) return null;
    return (
        <PotentialCurvePlot
            {...diatomicCurveSpec(bonds.system as DiatomicId, scan, bonds.R)}
            width={width}
            onSelectR={R => {
                // A molecule exists only at its scan points: a click between two lands on the nearer.
                const index = nearestScanIndex(scan.points, R);
                if (index >= 0) onScanIndex(index);
            }}
        />
    );
};

export default BondsCurvePlot;
