import React, { useEffect, useMemo, useRef } from 'react';
import { Chip, Link, Typography } from '@mui/material';
import {
    CONSTRUCTED_LABEL, CONSTRUCTED_MARK, CONSTRUCTED_NOTE, DIFFUSE_MARK, degeneracyCounts, diffuseDescription, isConstructed,
    isUpperEstimate, frontierOccupied, orbitalGaps,
} from '../molecules/orbital_display';
import { orbitalEnergyText } from '../format/energy';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
// Task 2: the quiet level line's style (.level-line).
import '../levels/levels.css';

interface MoleculeOrbitalListProps {
    orbitals: LibraryMoleculeMeta['orbitals'];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    /**
     * Owner R25-A2: non-zero for a moment after the strip's "Orbital list" tile brings the list into view (style.css);
     * R25-A-M1: an even run adds the replay class, so a second press restarts the fade.
     */
    highlightRun?: number;
    /**
     * Owner R25-C (ruling R25-C-present): "<orbital> lies inside the S ball" while the drawn surface is hidden
     * inside the balls the structure draws (inside_ball.ts insideBallNoteFor), else absent; `onHideStructure`
     * sets Structure to None. The first of the notes under the list: it is about the orbital drawn.
     */
    insideBallNote?: string | null;
    onHideStructure?: () => void;
    /**
     * Task 2: every row (Advanced and above). False (below Advanced) keeps the frontier window, HOMO−3 to LUMO+3,
     * and the orbital drawn wherever it is, with a line saying the rest are at Advanced. Default true.
     */
    allOrbitals?: boolean;
    /**
     * Ruling T2-energies: orbital energies are Explore's. False (Basics) drops each row's energy and the gap note;
     * the names, occupancy, degeneracy and HOMO/LUMO/SOMO chips stay. Default true.
     */
    showEnergies?: boolean;
}

/** How many orbitals either side of the HOMO/LUMO boundary a list below Advanced keeps: HOMO−3…LUMO+3. */
const FRONTIER_WINDOW = 4;
/** degeneracyCounts' default tolerance: orbitals closer than this are one degenerate group. */
const DEGENERATE_HARTREE = 1e-4;
/** Task 2's line where the rest of the list would be (the brief's own words). */
export const ALL_ORBITALS_POINTER = 'Show all orbitals at Advanced';

const OCCUPANCY: Record<number, string> = { 2: '↑↓', 1: '↑', 0: '' };
/** The row's short form of "upper estimate" (fix round 1: the full words overflowed a 300 px card beside ×3 and the
 * LVMO chip); the key explains it, and the accessible name keeps the full words. Never "≈" (Ruling D4-energy). */
const UPPER_SHORT = 'upper est.';

/**
 * "5.17 eV (0.190 Ha)" as two pieces that each stay whole, so a narrow row wraps between them, not inside one. Task 7b:
 * eV first, Ha in parentheses -- the Task 6 ruling, and Info's own orbital energy (format/energy.ts orbitalEnergyText).
 */
function EnergyParts({ energyHartree }: { energyHartree: number }) {
    const [ev, ha] = orbitalEnergyText(energyHartree).split(' (');
    return <><span className="molecule-orbital-energy-part">{ev}</span> <span className="molecule-orbital-energy-part">({ha}</span></>;
}

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
 * virtuals (Ruling D4-energy). A plain rule marks where the occupied
 * orbitals begin. Owner R25-A4: the rows come first and every note is
 * under them. Task 7b: those notes -- the gaps with the Kohn–Sham caveat, the
 * key to the marks, the method, the labels and the virtuals' classes -- are
 * Info's now (moleculeInfo), each said once; the gaps are Info's and the
 * Properties card's values. Under the rows stay only the inside-ball note,
 * which carries its action, and the level line.
 */
const MoleculeOrbitalList: React.FC<MoleculeOrbitalListProps> = ({
    orbitals, selectedIndex, onSelect, highlightRun = 0, insideBallNote, onHideStructure, allOrbitals = true,
    showEnergies = true,
}) => {
    const sorted = useMemo(() => [...orbitals].sort((a, b) => b.energyHartree - a.energyHartree), [orbitals]);
    // Below Advanced: the four highest occupied and the four lowest virtual orbitals, plus the one drawn (a link's
    // choice stays listed -- lowering the level never changes what is drawn, Review Focus 2). Ruling T2-M9: an edge
    // that falls inside a degenerate group moves out to take the whole group (degeneracyCounts' own tolerance).
    const rows = useMemo(() => {
        const boundary = sorted.findIndex(o => o.occupation > 0);
        if (allOrbitals || boundary < 0) return sorted;
        const sameLevel = (a: number, b: number) => Math.abs(sorted[a].energyHartree - sorted[b].energyHartree) < DEGENERATE_HARTREE;
        let first = Math.max(0, boundary - FRONTIER_WINDOW);
        let last = Math.min(sorted.length - 1, boundary + FRONTIER_WINDOW - 1);
        while (first > 0 && sameLevel(first - 1, first)) first--;
        while (last < sorted.length - 1 && sameLevel(last + 1, last)) last++;
        return sorted.filter((orbital, position) => (position >= first && position <= last) || orbital.index === selectedIndex);
    }, [allOrbitals, sorted, selectedIndex]);
    const trimmed = rows.length < sorted.length;
    const counts = useMemo(() => degeneracyCounts(orbitals), [orbitals]);
    // Ruling T16-b: highest first reads like an MO diagram, but puts the
    // virtuals on top -- so the gap is marked where the occupied orbitals
    // begin, and the list opens with the HOMO in view.
    const firstOccupied = rows.findIndex(o => o.occupation > 0);
    // The rule stands where the energies are shown and there is a gap to mark (Task 7b: its words are Info's).
    const gapRule = showEnergies && orbitalGaps(orbitals).length > 0;
    // Preflight D8 / Task 16d: the shared resolver (an open shell's SOMO, else the HOMO); older data, the highest occupied row.
    const homoIndex = (frontierOccupied(orbitals) ?? rows[firstOccupied])?.index;
    const listRef = useRef<HTMLDivElement>(null);
    const homoRef = useRef<HTMLButtonElement>(null);
    // On opening, and for each new molecule -- not on every pick, which
    // would snap the list back while it is being browsed. (Task 17 fix's
    // extra rule for the gap note over the HOMO went with the note, R25-A4:
    // nothing lies over a row now.)
    useEffect(() => {
        if (listRef.current && homoRef.current) {
            listRef.current.scrollTop = centredScrollTop(listRef.current, homoRef.current);
        }
    }, [orbitals]);
    return (
        <div className="molecule-orbital-block">
            <div className={`molecule-orbital-list${highlightRun > 0 ? ' highlight' : ''}${highlightRun > 0 && highlightRun % 2 === 0 ? ' highlight-replay' : ''}`}
                ref={listRef}>
                {rows.map((orbital, position) => {
                    const role = orbital.role ? String(orbital.role) : null;
                    const degenerate = counts.get(orbital.index) ?? 1;
                    return (
                        <React.Fragment key={orbital.index}>
                            {/* Ruling T16-b: where the occupied orbitals begin; its words, the gap, are Info's (Task 7b). */}
                            {position === firstOccupied && gapRule && <div className="molecule-orbital-gap-rule" aria-hidden="true" />}
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
                                {showEnergies ? (
                                    <span className="molecule-orbital-energy">
                                        <EnergyParts energyHartree={orbital.energyHartree} />
                                        {isUpperEstimate(orbital) && <>
                                            <span className="molecule-orbital-estimate" aria-hidden="true">{UPPER_SHORT}</span>
                                            <span className="visually-hidden">upper estimate</span>
                                        </>}
                                    </span>
                                ) : <span aria-hidden="true" /> /* holds the energy column, so the chips stay in theirs */}
                                {degenerate > 1 && <span className="molecule-orbital-degeneracy">×{degenerate}</span>}
                                {role && <Chip size="small" label={role} className="molecule-orbital-role" />}
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>
            <div className="molecule-orbital-notes">
                {insideBallNote && onHideStructure && (
                    // Owner R25-C: never over the canvas (R22c); the button is the real action it names -- no
                    // automatic switch, the structure stays the link's.
                    <Typography variant="caption" component="p" role="note" aria-label={`${insideBallNote} — set Structure to None to see it.`}
                        className="molecule-caption molecule-inside-ball-note">
                        {insideBallNote} —{' '}
                        <Link component="button" type="button" className="molecule-inside-ball-action" onClick={onHideStructure}>
                            set Structure to None
                        </Link>
                        {' '}to see it.
                    </Typography>
                )}
                {trimmed && <p className="ql-caption level-line">{ALL_ORBITALS_POINTER}</p>}
            </div>
        </div>
    );
};

export default MoleculeOrbitalList;
