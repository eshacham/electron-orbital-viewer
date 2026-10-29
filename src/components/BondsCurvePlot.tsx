import React from 'react';
import PotentialCurvePlot, { type PlotInset } from './PotentialCurvePlot';
import { BondsState } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { UseH2PlusCurveResult } from '../bonds/useH2PlusCurve';
import { diatomicCurveSpec, h2plusCurveSpec } from '../bonds/curve';
import { DiatomicId, nearestScanIndex, snapH2PlusR } from '../bonds/systems';
import { atLeast, type LearningLevel } from '../levels/levels';

interface BondsCurvePlotProps {
    bonds: BondsState;
    data: BondsData;
    /** useH2PlusCurve's result; App enables it only in Bonds with H₂⁺ (ruling C7). */
    h2plus: UseH2PlusCurveResult;
    width: number;
    /**
     * Task 3 (picture control): the R to mark -- the R slider's draft while it (or the curve) is dragged, so the marker
     * moves with the thumb before the store catches up on release. Defaults to the store's R.
     */
    markerR?: number | null;
    /** Task 3: each R a drag on the curve passes, snapped as the slider snaps; null when the drag was cancelled. */
    onDraftR?: (R: number | null) => void;
    onCommitH2PlusR: (R: number) => void;
    onScanIndex: (index: number) => void;
    /**
     * Task 4 (picture control): the learning level. Below Explore the curve reads in plain words ("Energy (eV)",
     * "Distance between nuclei (Å)", "most stable"); what it draws is the same at every level. Omitted, as at Research.
     */
    level?: LearningLevel;
    /** Task 5b (finish fix 3): the plot's margins as drawn (PotentialCurvePlot's onInset), for the slider above it. */
    onInset?: (inset: PlotInset | null) => void;
}

/**
 * The Bonds potential curve. Task 3 (picture control): it sits in BondsPanel's "Bond length" block, under the R
 * slider, at every level and width (App passes it as the panel's `curve`); a tap or a drag on it sets R through the
 * slider's own commit paths, snapped as the slider snaps -- a molecule's nearest scan point, H₂⁺'s 0.01 a₀ step. The
 * slider is the keyboard path, so the plot's own hidden range input is left out. H₂⁺'s curve is computed in a worker,
 * so until it lands this says so, and if it fails, why (Task 9's carry); a molecule's comes with its scan, whose
 * loading and failures BondsPanel reports, so here it is simply absent until then.
 */
const BondsCurvePlot: React.FC<BondsCurvePlotProps> = ({ bonds, data, h2plus, width, markerR, onDraftR, onCommitH2PlusR, onScanIndex, level = 'research', onInset }) => {
    const marked = markerR === undefined ? bonds.R : markerR;
    const plain = !atLeast(level, 'explore');
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
        return (
            <PotentialCurvePlot {...h2plusCurveSpec(h2plus.curve, marked, bonds.view.kind === 'h2plus' ? bonds.view.state : '1sigma_g')} width={width} keyboardControl={false} plain={plain} onInset={onInset}
                onSelectR={onCommitH2PlusR} onDragR={onDraftR && (R => onDraftR(R === null ? null : snapH2PlusR(R)))} />
        );
    }
    const scan = data.scan;
    if (!scan) return null;
    return (
        <PotentialCurvePlot
            {...diatomicCurveSpec(bonds.system as DiatomicId, scan, marked)}
            width={width}
            keyboardControl={false}
            plain={plain}
            onInset={onInset}
            onSelectR={R => {
                // A molecule exists only at its scan points: a click between two lands on the nearer.
                const index = nearestScanIndex(scan.points, R);
                if (index >= 0) onScanIndex(index);
            }}
            onDragR={onDraftR && (R => onDraftR(R === null ? null : scan.points[nearestScanIndex(scan.points, R)]?.RBohr ?? null))}
        />
    );
};

export default BondsCurvePlot;
