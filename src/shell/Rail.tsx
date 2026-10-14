import React, { useRef } from 'react';
import type { ViewMode } from '../store/atomSlice';
import { AtomsIcon, BasicOrbitalsIcon, BondsIcon, MoleculesIcon } from './icons';
import { useRovingFocus } from './useRovingFocus';
import './rail.css';

// Ruling R23a (round 23): the desktop/tablet rail is gone -- its four
// destinations moved into the top bar's tabs, in this order, and
// "Basic Orbitals" became "Orbitals" everywhere user-visible. This
// component now renders only the phone's mode menu (PhoneTopBar's
// "<Mode> ▾" button opens it); App.tsx builds the top bar's tabs from
// MODE_ITEMS below, so the order, labels and old accessible names have one
// source.
export const MODE_LABEL: Record<ViewMode, string> = { hydrogenic: 'Orbitals', atom: 'Atoms', bonds: 'Bonds', molecule: 'Molecules' };

// oldName is the old Mode toggle's accessible name (spec §8.2): tests and
// assistive-technology users already know it. Controller ruling
// WCAG-2.5.3-detail (label-in-name, WCAG 2.5.3): the rendered aria-label is
// "<Visible label> (<old name>)" -- e.g. "Atoms (atom mode)" -- so the
// visible label is part of the accessible name, with the old name kept
// inside the parentheses for continuity.
export const MODE_ITEMS: Array<{ mode: ViewMode; oldName: string; Icon: React.FC }> = [
    { mode: 'hydrogenic', oldName: 'basic orbitals mode', Icon: BasicOrbitalsIcon },
    { mode: 'atom', oldName: 'atom mode', Icon: AtomsIcon },
    { mode: 'bonds', oldName: 'bonds mode', Icon: BondsIcon },
    { mode: 'molecule', oldName: 'molecule mode', Icon: MoleculesIcon },
];

interface RailProps {
    mode: ViewMode;
    /** App's handleModeChange: the four modes and their side effects, unchanged. */
    onModeChange(mode: ViewMode): void;
}

/**
 * The phone's mode menu (spec §8.2, as amended by ruling R23a): opened from
 * PhoneTopBar's "<Mode> ▾" button.
 */
const Rail: React.FC<RailProps> = ({ mode, onModeChange }) => {
    const itemsRef = useRef<HTMLDivElement>(null);
    useRovingFocus(itemsRef, { selector: '.app-rail-item', orientation: 'vertical' });
    return (
        <nav className="app-rail" aria-label="view mode">
            <div className="app-rail-items" ref={itemsRef}>
                {MODE_ITEMS.map(({ mode: itemMode, oldName, Icon }) => (
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
        </nav>
    );
};

export default Rail;
