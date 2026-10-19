import React, { useMemo } from 'react';
import { describePick, detectBonds } from '../molecules/ball_and_stick';
import type { MoleculeAtom, MoleculePick } from '../molecules/library_types';

interface MoleculeReadoutProps {
    atoms: MoleculeAtom[]; pick: MoleculePick | null; geometrySource: string; touch: boolean;
    /** Space filling draws van der Waals spheres -- no sticks, no bonds to pick -- and the notes say so (ruling T13-I4). */
    spaceFilling?: boolean;
}

/**
 * Lengths and angles for whatever the pointer is on (tap on a phone), with
 * where the geometry comes from. Ruling R22c (owner review 2026-10-14): no
 * longer a chip floating over the canvas -- App.tsx places it in a scrolling
 * Explore-panel section (desktop) or the phone's Explore tab, never over the
 * 3D view, so a long pick scrolls with the mouse instead of trapping it.
 */
const MoleculeReadout: React.FC<MoleculeReadoutProps> = ({ atoms, pick, geometrySource, touch, spaceFilling = false }) => {
    const bonds = useMemo(() => detectBonds(atoms), [atoms]);
    // Ruling R23c-3: on a desktop (not `touch`) the "nothing picked yet" hint
    // moves to a bottom-right viewport caption (App.tsx's .molecule-hover-caption),
    // so it is not said twice -- a phone has no such corner, so its Explore tab
    // keeps the in-panel line.
    const hint = spaceFilling ? 'Tap an atom for its angles and neighbours' : 'Tap an atom or bond for angles and lengths';
    const lines = pick ? describePick(atoms, bonds, pick) : touch ? [hint] : [];
    const drawn = spaceFilling ? 'van der Waals spheres (Bondi 1964 / Mantina 2009)' : 'sticks show connectivity, not bond order';
    return (
        <div className="molecule-readout" role="status" aria-live="polite">
            {lines.map(line => <div key={line}>{line}</div>)}
            <div className="esp-legend-note">geometry: {geometrySource} · {drawn}</div>
        </div>
    );
};

export default MoleculeReadout;
