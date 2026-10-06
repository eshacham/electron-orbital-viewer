import React, { useMemo } from 'react';
import { describePick, detectBonds } from '../molecules/ball_and_stick';
import type { MoleculeAtom, MoleculePick } from '../molecules/library_types';

interface MoleculeReadoutProps { atoms: MoleculeAtom[]; pick: MoleculePick | null; geometrySource: string; touch: boolean }

/**
 * Lengths and angles for whatever the pointer is on (tap on a phone), with
 * where the geometry comes from. A dark chip over the canvas, like
 * `EspLegend`; whichever task assembles the Molecules view places it inside
 * `.molecule-legend-stack` alongside `EspLegend` (Task 9's own note) rather
 * than this component positioning itself.
 */
const MoleculeReadout: React.FC<MoleculeReadoutProps> = ({ atoms, pick, geometrySource, touch }) => {
    const bonds = useMemo(() => detectBonds(atoms), [atoms]);
    const lines = pick ? describePick(atoms, bonds, pick) : [`${touch ? 'Tap' : 'Hover over'} an atom or bond for angles and lengths`];
    return (
        <div className="molecule-readout" role="status" aria-live="polite">
            {lines.map(line => <div key={line}>{line}</div>)}
            <div className="esp-legend-note">geometry: {geometrySource} · sticks show connectivity, not bond order</div>
        </div>
    );
};

export default MoleculeReadout;
