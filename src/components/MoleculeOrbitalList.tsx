import React, { useEffect, useMemo, useRef } from 'react';
import { Chip, Typography } from '@mui/material';
import {
    CONSTRUCTED_LABEL, CONSTRUCTED_MARK, CONSTRUCTED_NOTE, DIFFUSE_MARK, DIFFUSE_NOTE, GAP_CAVEAT, LVMO_NOTE, UNCLASSIFIED_NOTE,
    VALENCE_THRESHOLD, degeneracyCounts, diffuseDescription, formatOrbitalEnergy, isConstructed, isUpperEstimate, labelsSentence,
    orbitalGaps,
} from '../molecules/orbital_display';
import type { LibraryMoleculeMeta } from '../molecules/library_types';

interface MoleculeOrbitalListProps {
    orbitals: LibraryMoleculeMeta['orbitals'];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    method: string;
    symmetry: LibraryMoleculeMeta['symmetry'];
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
 *
 * Phase 6D (spec §4, §5): a diffuse virtual carries a mark whose accessible
 * name gives its valence share -- "unbound" only when its energy is above
 * zero (Ruling D4). The LVMO is chipped and described. A constructed LVMO
 * (orbitals.py appends it where no canonical virtual is valence) carries its
 * own mark, and its energy reads "upper estimate", never "≈": it is the
 * orbital's value within the valence space, several eV above the canonical
 * virtuals (Ruling D4-energy). The divider gives the HOMO–LUMO gap, and the
 * HOMO–LVMO gap too where the LVMO is one of the calculation's own orbitals,
 * with the Kohn–Sham caveat. Older data, with no classes, says its virtuals
 * are unclassified rather than implying either.
 */
const MoleculeOrbitalList: React.FC<MoleculeOrbitalListProps> = ({ orbitals, selectedIndex, onSelect, method, symmetry }) => {
    const rows = useMemo(() => [...orbitals].sort((a, b) => b.energyHartree - a.energyHartree), [orbitals]);
    const counts = useMemo(() => degeneracyCounts(orbitals), [orbitals]);
    // Ruling T16-b: highest first reads like an MO diagram, but puts the
    // virtuals on top -- so the gap is marked where the occupied orbitals
    // begin, and the list opens with the HOMO in view.
    const firstOccupied = rows.findIndex(o => o.occupation > 0);
    const gaps = orbitalGaps(orbitals);
    const gapText = gaps.length ? gaps.map(g => `${g.name} gap ${formatOrbitalEnergy(g.hartree)}`).join(' · ') : null;
    const homoIndex = (rows.find(o => o.role === 'HOMO') ?? rows[firstOccupied])?.index;
    const diffuse = orbitals.filter(o => o.class === 'diffuse');
    const lvmo = orbitals.some(o => o.role === 'LVMO');
    const constructed = orbitals.some(isConstructed);
    const unclassified = orbitals.some(o => !(o.occupation > 0)) && !orbitals.some(o => o.class !== undefined);
    const unlabelled = orbitals.find(o => o.labelNote);
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
                            <div role="separator" aria-label={`${gapText}. ${GAP_CAVEAT}`} className="molecule-orbital-gap">
                                {gapText}
                                <span className="molecule-orbital-gap-caveat">{GAP_CAVEAT}</span>
                            </div>
                        )}
                        <button type="button" aria-pressed={orbital.index === selectedIndex}
                            ref={orbital.index === homoIndex ? homoRef : undefined}
                            className={`molecule-orbital-row${orbital.index === selectedIndex ? ' selected' : ''}`}
                            onClick={() => onSelect(orbital.index)}>
                            <span className="molecule-orbital-label">
                                {orbital.label}
                                {orbital.class === 'diffuse' && (
                                    <span className="molecule-orbital-mark" role="img" aria-label={diffuseDescription(orbital)}
                                        title={diffuseDescription(orbital)}>{DIFFUSE_MARK}</span>
                                )}
                                {isConstructed(orbital) && (
                                    <span className="molecule-orbital-mark" role="img" aria-label={CONSTRUCTED_LABEL}
                                        title={CONSTRUCTED_NOTE}>{CONSTRUCTED_MARK}</span>
                                )}
                            </span>
                            <span className="molecule-orbital-occupancy">{OCCUPANCY[Math.round(orbital.occupation)] ?? ''}</span>
                            <span className="molecule-orbital-energy">
                                {formatOrbitalEnergy(orbital.energyHartree)}
                                {isUpperEstimate(orbital) && <span className="molecule-orbital-estimate">, upper estimate</span>}
                            </span>
                            {degenerate > 1 && <span className="molecule-orbital-degeneracy">×{degenerate}</span>}
                            {role && <Chip size="small" label={role} className="molecule-orbital-role" />}
                        </button>
                    </React.Fragment>
                );
            })}
            <Typography variant="caption" className="molecule-caption">
                Kohn–Sham orbital energies, {method}. Not ionisation energies.
                {' '}{labelsSentence(symmetry)}
                {diffuse.length > 0 && <>
                    {' '}{DIFFUSE_MARK} partly diffuse virtual (under {Math.round(VALENCE_THRESHOLD * 100)} % valence): {DIFFUSE_NOTE}.
                    {diffuse.some(o => o.energyHartree > 0) && ' Those at positive energy are unbound, basis-set dependent states, not bound orbitals.'}
                </>}
                {lvmo && <>{' '}LVMO: the lowest valence virtual orbital, {LVMO_NOTE}.</>}
                {constructed && <>{' '}{CONSTRUCTED_MARK} LVMO {CONSTRUCTED_NOTE}.</>}
                {unclassified && <>{' '}{UNCLASSIFIED_NOTE}</>}
                {unlabelled && <>{' '}?: {unlabelled.labelNote}.</>}
            </Typography>
        </div>
    );
};

export default MoleculeOrbitalList;
