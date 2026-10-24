import React, { useEffect, useId, useImperativeHandle, useRef } from 'react';
import { Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import MoleculeOrbitalList from './MoleculeOrbitalList';
import { formatFormula } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { MoleculeSurface } from '../store/moleculeSlice';
import { frontierOccupied } from '../molecules/orbital_display';


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
}

/** What App may ask of the card (Task 15): the strip's "All orbitals" tile puts focus in the orbital list. */
export interface MoleculeNavHandle {
    /**
     * Focuses the row of the orbital drawn, in the list beside the surface switch -- now, or, when the list is
     * not on screen yet (the surface was switched to Orbitals in the same event), once it renders.
     */
    focusOrbitalList(): void;
}

const MoleculeNav = React.forwardRef<MoleculeNavHandle, MoleculeNavProps>(({
    variant = 'full', entries, indexError, meta, selectedId, surface, onSelectMolecule, onSurfaceChange, onOpenPicker,
}, ref) => {
    const navRef = useRef<HTMLDivElement>(null);
    const surfaceLabelId = useId();
    const focusWanted = useRef(false);
    // The pressed row is the orbital drawn: the list opens centred on it, so focus lands where the eye already is.
    const focusRow = () => {
        const row = navRef.current?.querySelector<HTMLElement>('.molecule-orbital-row[aria-pressed="true"]')
            ?? navRef.current?.querySelector<HTMLElement>('.molecule-orbital-row');
        row?.focus();
        return Boolean(row);
    };
    useImperativeHandle(ref, () => ({ focusOrbitalList: () => { focusWanted.current = !focusRow(); } }), []);
    // One render later at most: a wish the next render cannot meet (no list) is dropped, never kept to steal focus later.
    useEffect(() => {
        if (!focusWanted.current) return;
        focusWanted.current = false;
        focusRow();
    });
    const name = meta?.name ?? entries?.find(e => e.id === selectedId)?.name ?? null;
    const title = name ? `${name}` : 'Choose a molecule';

    if (variant === 'header') {
        return (
            <div className="molecule-nav-header level-nav-header">
                <Button className="level-nav-change-element" onClick={onOpenPicker}
                    aria-label={name ? `Change molecule, currently ${name}` : 'Choose a molecule'}>
                    {title}{meta ? ` · ${formatFormula(meta.formula)}` : ''} ▾
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
                    {/* Owner R25-A4: a visible label over the switch, which names its group (WCAG 2.5.3). */}
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
                            onSelect={index => onSurfaceChange({ kind: 'mo', index })}
                            method={meta.method.density} symmetry={meta.symmetry} />
                    )}
                    <Typography variant="caption" className="molecule-caption">
                        Geometry: {meta.geometrySource}. Density, potential and orbitals: {meta.method.density} (PySCF).
                    </Typography>
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
