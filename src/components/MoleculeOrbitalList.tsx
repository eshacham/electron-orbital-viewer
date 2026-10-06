import React, { useEffect, useMemo, useRef } from 'react';
import { Chip, Typography } from '@mui/material';
import { degeneracyCounts, formatOrbitalEnergy, formatPointGroup } from '../molecules/orbital_display';
import type { LibraryMoleculeMeta } from '../molecules/library_types';

interface MoleculeOrbitalListProps {
    orbitals: LibraryMoleculeMeta['orbitals'];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    method: string;
    symmetry: { pointGroup: string; labelGroup: string };
}

const OCCUPANCY: Record<number, string> = { 2: '↑↓', 1: '↑', 0: '' };

/**
 * The list's own scrollTop that centres `row` in it. The list is scrolled
 * directly rather than through scrollIntoView, which also scrolls every
 * scrolling ancestor -- on a desktop the right-hand column, whose controls
 * would jump out of view to reach a row of the card under them.
 */
export function centredScrollTop(list: HTMLElement, row: HTMLElement): number {
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return Math.max(0, list.scrollTop + (rowRect.top - listRect.top) - (listRect.height - rowRect.height) / 2);
}

/**
 * Every shipped orbital, highest first so HOMO and LUMO sit together near
 * the top. This is Molecules' Plot-slot content (ruling D23): MoDiagram
 * groups degeneracy by irrep label and is kept Bonds-only, not generalised
 * to the library's lower-symmetry molecules.
 */
const MoleculeOrbitalList: React.FC<MoleculeOrbitalListProps> = ({ orbitals, selectedIndex, onSelect, method, symmetry }) => {
    const rows = useMemo(() => [...orbitals].sort((a, b) => b.energyHartree - a.energyHartree), [orbitals]);
    const counts = useMemo(() => degeneracyCounts(orbitals), [orbitals]);
    const labelGroup = formatPointGroup(symmetry.labelGroup);
    const pointGroup = formatPointGroup(symmetry.pointGroup);
    // Ruling T16-b: highest first reads like an MO diagram, but puts the
    // virtuals on top -- so the gap is marked where the occupied orbitals
    // begin, and the list opens with the HOMO in view.
    const firstOccupied = rows.findIndex(o => o.occupation > 0);
    const gap = firstOccupied > 0 ? rows[firstOccupied - 1].energyHartree - rows[firstOccupied].energyHartree : null;
    // Open-shell NO₂'s highest occupied orbital is its SOMO, so the gap the
    // divider spans is SOMO–LUMO, not HOMO–LUMO (final review M6).
    const lower = firstOccupied >= 0 && rows[firstOccupied].role === 'SOMO' ? 'SOMO' : 'HOMO';
    const gapText = gap === null ? null : `${lower}–LUMO gap ${formatOrbitalEnergy(gap)}`;
    const homoIndex = (rows.find(o => o.role === 'HOMO') ?? rows[firstOccupied])?.index;
    const listRef = useRef<HTMLDivElement>(null);
    const homoRef = useRef<HTMLButtonElement>(null);
    // On opening, and for each new molecule -- not on every pick, which
    // would snap the list back while it is being browsed.
    useEffect(() => {
        if (listRef.current && homoRef.current) listRef.current.scrollTop = centredScrollTop(listRef.current, homoRef.current);
    }, [orbitals]);
    return (
        <div className="molecule-orbital-list" ref={listRef}>
            {rows.map((orbital, position) => {
                const role = orbital.role ? String(orbital.role) : null;
                const degenerate = counts.get(orbital.index) ?? 1;
                return (
                    <React.Fragment key={orbital.index}>
                        {position === firstOccupied && gapText && (
                            <div role="separator" aria-label={gapText} className="molecule-orbital-gap">{gapText}</div>
                        )}
                        <button type="button" aria-pressed={orbital.index === selectedIndex}
                            ref={orbital.index === homoIndex ? homoRef : undefined}
                            className={`molecule-orbital-row${orbital.index === selectedIndex ? ' selected' : ''}`}
                            onClick={() => onSelect(orbital.index)}>
                            <span className="molecule-orbital-label">{orbital.label}</span>
                            <span className="molecule-orbital-occupancy">{OCCUPANCY[Math.round(orbital.occupation)] ?? ''}</span>
                            <span className="molecule-orbital-energy">{formatOrbitalEnergy(orbital.energyHartree)}</span>
                            {degenerate > 1 && <span className="molecule-orbital-degeneracy">×{degenerate}</span>}
                            {role && <Chip size="small" label={role} className="molecule-orbital-role" />}
                        </button>
                    </React.Fragment>
                );
            })}
            <Typography variant="caption" className="molecule-caption">
                Kohn–Sham orbital energies, {method}. Not ionisation energies.
                {' '}Labels: irreducible representations of {labelGroup}
                {symmetry.labelGroup !== symmetry.pointGroup ? `, the subgroup of ${pointGroup} the calculation uses` : ''}.
            </Typography>
        </div>
    );
};

export default MoleculeOrbitalList;
