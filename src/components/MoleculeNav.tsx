import React, { useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import MoleculeOrbitalList from './MoleculeOrbitalList';
import { formatFormula } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { MoleculeSurface } from '../store/moleculeSlice';

interface MoleculeNavProps {
    /** 'full': the desktop card. A phone splits it like LevelNav: 'header' (always on screen) and 'body' (Explore tab). */
    variant?: 'full' | 'header' | 'body';
    entries: MoleculeIndexEntry[] | null;
    indexError: string | null;
    meta: LibraryMoleculeMeta | null;
    selectedId: string | null;
    isLoading: boolean;
    surface: MoleculeSurface;
    onSelectMolecule: (id: string) => void;
    onSurfaceChange: (surface: MoleculeSurface) => void;
    onOpenPicker?: () => void;
}

const MoleculeNav: React.FC<MoleculeNavProps> = ({
    variant = 'full', entries, indexError, meta, selectedId, isLoading, surface, onSelectMolecule, onSurfaceChange, onOpenPicker,
}) => {
    // Open until something is chosen, then folded, as the periodic table does after a pick.
    const [pickerOpen, setPickerOpen] = useState(selectedId === null);
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

    const choose = (id: string) => { onSelectMolecule(id); setPickerOpen(false); };
    const homo = meta?.orbitals.find(o => o.role === 'HOMO') ?? meta?.orbitals[0];
    const picker = <MoleculePicker entries={entries} error={indexError} selectedId={selectedId} onSelect={choose} />;

    return (
        <div className="molecule-nav level-nav">
            <Typography variant="h6" className="molecule-nav-title">
                {title}{meta && <span className="molecule-nav-formula"> {formatFormula(meta.formula)}</span>}
            </Typography>
            {isLoading && <Typography variant="body2">Loading {name ?? selectedId}…</Typography>}
            {variant === 'full' && (pickerOpen || !selectedId ? picker : (
                <Button size="small" onClick={() => setPickerOpen(true)}>Change molecule</Button>
            ))}
            {meta && (
                <>
                    <ToggleButtonGroup exclusive size="small" fullWidth aria-label="surface" className="molecule-surface-toggle"
                        value={surface.kind}
                        onChange={(_event, kind: MoleculeSurface['kind'] | null) => {
                            if (kind === 'density' || kind === 'esp') onSurfaceChange({ kind });
                            else if (kind === 'mo' && homo) onSurfaceChange({ kind: 'mo', index: homo.index });
                        }}>
                        <ToggleButton value="density">Density</ToggleButton>
                        <ToggleButton value="esp">Electrostatic potential</ToggleButton>
                        <ToggleButton value="mo">Orbitals</ToggleButton>
                    </ToggleButtonGroup>
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
                    {picker}
                </>
            )}
        </div>
    );
};

export default MoleculeNav;
