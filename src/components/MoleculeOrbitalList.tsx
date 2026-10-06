import React, { useMemo } from 'react';
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
    return (
        <div className="molecule-orbital-list">
            {rows.map(orbital => {
                const role = orbital.role ? String(orbital.role) : null;
                const degenerate = counts.get(orbital.index) ?? 1;
                return (
                    <button key={orbital.index} type="button" aria-pressed={orbital.index === selectedIndex}
                        className={`molecule-orbital-row${orbital.index === selectedIndex ? ' selected' : ''}`}
                        onClick={() => onSelect(orbital.index)}>
                        <span className="molecule-orbital-label">{orbital.label}</span>
                        <span className="molecule-orbital-occupancy">{OCCUPANCY[Math.round(orbital.occupation)] ?? ''}</span>
                        <span className="molecule-orbital-energy">{formatOrbitalEnergy(orbital.energyHartree)}</span>
                        {degenerate > 1 && <span className="molecule-orbital-degeneracy">×{degenerate}</span>}
                        {role && <Chip size="small" label={role} className="molecule-orbital-role" />}
                    </button>
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
