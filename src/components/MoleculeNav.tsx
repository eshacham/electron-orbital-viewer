import React from 'react';
import { Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import MoleculeOrbitalList from './MoleculeOrbitalList';
import { formatFormula } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { MoleculeSurface } from '../store/moleculeSlice';


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

const MoleculeNav: React.FC<MoleculeNavProps> = ({
    variant = 'full', entries, indexError, meta, selectedId, surface, onSelectMolecule, onSurfaceChange, onOpenPicker,
}) => {
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
    const homo = meta?.orbitals.find(o => o.role === 'HOMO') ?? meta?.orbitals[0];

    return (
        <div className="molecule-nav level-nav">
            {meta && (
                <>
                    <ToggleButtonGroup exclusive size="small" fullWidth aria-label="surface" className="molecule-surface-toggle"
                        value={surface.kind}
                        onChange={(_event, kind: MoleculeSurface['kind'] | null) => {
                            if (kind === 'density' || kind === 'esp' || kind === 'none') onSurfaceChange({ kind });
                            else if (kind === 'mo' && homo) onSurfaceChange({ kind: 'mo', index: homo.index });
                        }}>
                        <ToggleButton value="density">Density</ToggleButton>
                        <ToggleButton value="esp">Electrostatic potential</ToggleButton>
                        <ToggleButton value="mo">Orbitals</ToggleButton>
                        {/* Ruling P8: structure only (show=none); the name holds the visible label (WCAG 2.5.3). */}
                        <ToggleButton value="none" aria-label="None (no surface)">None</ToggleButton>
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
};

export default MoleculeNav;
