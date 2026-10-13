import React, { useRef } from 'react';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import type { ViewMode } from '../store/atomSlice';
import { AtomsIcon, BasicOrbitalsIcon, BondsIcon, MoleculesIcon } from './icons';
import { useRovingFocus } from './useRovingFocus';
import './rail.css';

export const MODE_LABEL: Record<ViewMode, string> = { atom: 'Atoms', hydrogenic: 'Basic Orbitals', bonds: 'Bonds', molecule: 'Molecules' };

// oldName is the old Mode toggle's accessible name (spec §8.2): tests and
// assistive-technology users already know it. Controller ruling
// WCAG-2.5.3-detail (label-in-name, WCAG 2.5.3): the rendered aria-label is
// "<Visible label> (<old name>)" -- e.g. "Atoms (atom mode)" -- so the
// visible label is now part of the accessible name, with the old name kept
// inside the parentheses for continuity.
const ITEMS: Array<{ mode: ViewMode; oldName: string; Icon: React.FC }> = [
    { mode: 'atom', oldName: 'atom mode', Icon: AtomsIcon },
    { mode: 'hydrogenic', oldName: 'basic orbitals mode', Icon: BasicOrbitalsIcon },
    { mode: 'bonds', oldName: 'bonds mode', Icon: BondsIcon },
    { mode: 'molecule', oldName: 'molecule mode', Icon: MoleculesIcon },
];

interface RailProps {
    mode: ViewMode;
    /** App's handleModeChange: the four modes and their side effects, unchanged. */
    onModeChange(mode: ViewMode): void;
    isOwner: boolean;
    /** 'menu' is the phone's mode menu: the same list, no Admin link. */
    variant?: 'rail' | 'menu';
    /** ≥ 1680 px: icon and label in a row (spec §7). */
    wide?: boolean;
}

/**
 * The mode rail (spec §8.2). Learning and Gallery join it when they exist
 * (ruling R3); until then "real or absent" keeps them out.
 */
const Rail: React.FC<RailProps> = ({ mode, onModeChange, isOwner, variant = 'rail', wide = false }) => {
    const itemsRef = useRef<HTMLDivElement>(null);
    useRovingFocus(itemsRef, { selector: '.app-rail-item', orientation: 'vertical' });
    return (
        <nav className={`app-rail${variant === 'menu' ? ' as-menu' : ''}${wide ? ' wide' : ''}`} aria-label="view mode">
            <div className="app-rail-items" ref={itemsRef}>
                {ITEMS.map(({ mode: itemMode, oldName, Icon }) => (
                    <button
                        key={itemMode}
                        type="button"
                        className="app-rail-item"
                        aria-label={`${MODE_LABEL[itemMode]} (${oldName})`}
                        aria-pressed={mode === itemMode}
                        onClick={() => onModeChange(itemMode)}
                    >
                        <Icon />
                        <span className="app-rail-label">{MODE_LABEL[itemMode]}</span>
                    </button>
                ))}
            </div>
            {isOwner && variant === 'rail' && (
                <a className="app-rail-item app-rail-admin" href="/admin.html">
                    <AdminPanelSettingsOutlined sx={{ fontSize: 20 }} aria-hidden />
                    <span className="app-rail-label">Admin</span>
                </a>
            )}
        </nav>
    );
};

export default Rail;
