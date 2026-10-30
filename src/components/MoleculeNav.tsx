import React, { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import MoleculeOrbitalList, { centredScrollTop } from './MoleculeOrbitalList';
import { formatFormula } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { MoleculeSurface } from '../store/moleculeSlice';
import { frontierOccupied } from '../molecules/orbital_display';
import ExpandMore from '@mui/icons-material/ExpandMore';


interface MoleculeNavProps {
    /**
     * 'full': the desktop card -- the surface switch and its list; the molecule's name and the picker are the
     * Explore header tile's (MoleculeHeader, Task 12). A phone splits it like LevelNav: 'header' (always on
     * screen) and 'body' (Explore tab, which keeps the inline browse list).
     */
    variant?: 'full' | 'header' | 'body';
    entries: MoleculeIndexEntry[] | null;
    indexError: string | null;
    meta: LibraryMoleculeMeta | null;
    selectedId: string | null;
    /** Said by the header tile now (MoleculeHeader, Task 12); kept in the Phase 6 props contract (tests/jobs/phase6_contracts.test.ts). */
    isLoading: boolean;
    surface: MoleculeSurface;
    onSelectMolecule: (id: string) => void;
    onSurfaceChange: (surface: MoleculeSurface) => void;
    onOpenPicker?: () => void;
    /**
     * Owner R25-C (ruling R25-C-present): "<orbital> lies inside the S ball" while the drawn surface is hidden
     * inside the balls the structure draws (inside_ball.ts insideBallNoteFor), else absent; `onHideStructure`
     * sets Structure to None. Shown by the orbital list, first among its notes below the rows.
     */
    insideBallNote?: string | null;
    onHideStructure?: () => void;
    /** Task 2: the orbital list's every row (Advanced); false shows HOMO−3…LUMO+3 (MoleculeOrbitalList). Default true. */
    allOrbitals?: boolean;
    /** Ruling T2-energies: the orbital list's energies (Explore); false hides them (MoleculeOrbitalList). Default true. */
    showEnergies?: boolean;
}

/** What App may ask of the card (Task 15): the strip's "Orbital list" tile brings the orbital list into view. */
export interface MoleculeNavHandle {
    /**
     * Owner R25-A2 (it only moved focus, invisible with Orbitals already drawn): scrolls the list into view in the
     * panel that holds it (a desktop/tablet's Explore, a phone's Explore sheet), the drawn orbital's row into view
     * in the list, focuses that row and highlights the list for LIST_HIGHLIGHT_MS -- now, or, when the list is not
     * on screen yet (the surface was switched to Orbitals in the same event), once it renders.
     */
    revealOrbitalList(): void;
}

/** How long the list stays highlighted after the "Orbital list" tile (R25-A2; style.css fades it out). */
export const LIST_HIGHLIGHT_MS = 1000;
/** The panels the list scrolls in: Molecules' Explore on a desktop or tablet, the phone sheet's body. */
const PANEL_SCROLLERS = '.molecule-explore-scroll, .phone-sheet-body';
const REVEAL_MARGIN = 8;

/**
 * R25-A-I1: whether the list is actually displayed -- not inside a folded tablet Explore (`<aside hidden>`) nor a
 * panel full screen hides (display: none). A list that is mounted but not displayed counts as missing, so the
 * one-render wait covers its unfolding and nothing is focused or highlighted unseen.
 */
function isDisplayed(element: HTMLElement): boolean {
    if (element.closest('[hidden]')) return false;
    return typeof element.checkVisibility !== 'function' || element.checkVisibility();
}

/**
 * The panel's scrollTop that shows `element`: unchanged when it is in view; else scrolled only as far as needed
 * to bring its far edge REVEAL_MARGIN inside the panel's, never so far that its near edge leaves -- a list taller
 * than the panel shows its top. scrollTop is set on the panel alone, never through scrollIntoView, which also
 * scrolls every scrolling ancestor (centredScrollTop's reason).
 */
export function revealScrollTop(panel: HTMLElement, element: HTMLElement): number {
    const view = panel.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const top = view.top + REVEAL_MARGIN;
    const bottom = view.bottom - REVEAL_MARGIN;
    if (box.top < top) return Math.max(0, panel.scrollTop - (top - box.top));
    if (box.bottom > bottom) return panel.scrollTop + Math.min(box.bottom - bottom, box.top - top);
    return panel.scrollTop;
}

const MoleculeNav = React.forwardRef<MoleculeNavHandle, MoleculeNavProps>(({
    variant = 'full', entries, indexError, meta, selectedId, surface, onSelectMolecule, onSurfaceChange, onOpenPicker,
    insideBallNote, onHideStructure, allOrbitals = true, showEnergies = true,
}, ref) => {
    const navRef = useRef<HTMLDivElement>(null);
    const surfaceLabelId = useId();
    const revealWanted = useRef(false);
    // R25-A-M1: 0 is off; each press counts up, and the list alternates its highlight class by parity so a second
    // press within the second replays the fade (style.css) rather than leaving it where it was.
    const [highlightRun, setHighlightRun] = useState(0);
    const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (highlightTimer.current !== null) clearTimeout(highlightTimer.current); }, []);
    // The pressed row is the orbital drawn: the list is scrolled to it, so focus lands where the eye already is.
    const reveal = () => {
        const list = navRef.current?.querySelector<HTMLElement>('.molecule-orbital-list');
        const row = list?.querySelector<HTMLElement>('.molecule-orbital-row[aria-pressed="true"]')
            ?? list?.querySelector<HTMLElement>('.molecule-orbital-row');
        if (!list || !row || !isDisplayed(list)) return false;
        list.scrollTop = centredScrollTop(list, row);
        const panel = list.closest<HTMLElement>(PANEL_SCROLLERS);
        if (panel) panel.scrollTop = revealScrollTop(panel, list);
        row.focus({ preventScroll: true });
        setHighlightRun(run => run + 1);
        if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => { highlightTimer.current = null; setHighlightRun(0); }, LIST_HIGHLIGHT_MS);
        return true;
    };
    useImperativeHandle(ref, () => ({ revealOrbitalList: () => { revealWanted.current = !reveal(); } }), []);
    // One render later at most: a wish the next render cannot meet (no list) is dropped, never kept to steal focus later.
    useEffect(() => {
        if (!revealWanted.current) return;
        revealWanted.current = false;
        reveal();
    });
    const name = meta?.name ?? entries?.find(e => e.id === selectedId)?.name ?? null;
    const title = name ? `${name}` : 'Choose a molecule';

    if (variant === 'header') {
        return (
            <div className="molecule-nav-header level-nav-header">
                <Button className="level-nav-change-element" endIcon={<ExpandMore aria-hidden="true" />} onClick={onOpenPicker}
                    aria-label={name ? `Change molecule, currently ${name}` : 'Choose a molecule'}>
                    {title}{meta ? ` · ${formatFormula(meta.formula)}` : ''}
                </Button>
            </div>
        );
    }

    // Task 12 (ruling P1): the name, the loading line and the picker moved to the header tile above this card
    // (MoleculeHeader and its "Change ▾" popover); until a molecule has loaded the desktop card has nothing.
    if (variant === 'full' && !meta) return null;
    // Preflight D8 / Task 16d: the SOMO of an open shell, else the HOMO (one shared resolver); older data, the first.
    const homo = (meta && frontierOccupied(meta.orbitals)) ?? meta?.orbitals[0];

    return (
        <div className="molecule-nav level-nav" ref={navRef}>
            {meta && (
                <>
                    {/* Owner R25-A4: a visible label over the switch, which names its group (WCAG 2.5.3); R25-A-M4: the
                        field's own gap spaces them. */}
                    <div className="molecule-surface-field">
                        <Typography variant="subtitle2" id={surfaceLabelId} className="molecule-surface-label">Surface</Typography>
                        <ToggleButtonGroup exclusive size="small" fullWidth aria-labelledby={surfaceLabelId} className="molecule-surface-toggle"
                            value={surface.kind}
                            onChange={(_event, kind: MoleculeSurface['kind'] | null) => {
                                if (kind === 'density' || kind === 'esp' || kind === 'none') onSurfaceChange({ kind });
                                else if (kind === 'mo' && homo) onSurfaceChange({ kind: 'mo', index: homo.index });
                            }}>
                            <ToggleButton value="density">Density</ToggleButton>
                            <ToggleButton value="esp">Electrostatic potential</ToggleButton>
                            <ToggleButton value="mo">Orbitals</ToggleButton>
                            {/* Ruling P8: structure only (show=none, the link's key unchanged). Owner R25-A4: "None" said nothing
                                of what is left out -- it reads "No surface", and that is its name. */}
                            <ToggleButton value="none">No surface</ToggleButton>
                        </ToggleButtonGroup>
                    </div>
                    {/* Ruling R23f: the orbital list (and its legend) lives in
                        the Explore panel now, under this switch, on every
                        layout -- a desktop/tablet's docked panel and a
                        phone's Explore tab alike (variant no longer matters
                        here; it still does for the picker and browse list
                        above/below, which the phone alone needs inline).
                        Retires the old desktop-only "Showing <orbital> --
                        pick another in the orbital list on the right"
                        summary: the list itself, now beside the switch, both
                        names the orbital drawn (its own `.selected` row and
                        `aria-pressed`) and carries its per-orbital marks and
                        captions, so restating it here would only repeat it. */}
                    {surface.kind === 'mo' && (
                        <MoleculeOrbitalList orbitals={meta.orbitals} selectedIndex={surface.index}
                            onSelect={index => onSurfaceChange({ kind: 'mo', index })} highlightRun={highlightRun}
                            insideBallNote={insideBallNote} onHideStructure={onHideStructure} allOrbitals={allOrbitals}
                            showEnergies={showEnergies} labelRegime={meta.symmetry?.labels} />
                    )}
                    {/* Task 7b: the geometry and method caption that stood here is Info's -- the geometry source is the
                        Properties row's, the method "How this was computed"'s, each said once. */}
                </>
            )}
            {variant === 'body' && (
                <>
                    <Typography variant="subtitle2" className="molecule-nav-browse">Browse molecules</Typography>
                    <MoleculePicker entries={entries} error={indexError} selectedId={selectedId} onSelect={onSelectMolecule} />
                </>
            )}
        </div>
    );
});
MoleculeNav.displayName = 'MoleculeNav';

export default MoleculeNav;
