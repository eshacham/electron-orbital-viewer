import React, { useId, useMemo, useState } from 'react';
import { filterMolecules, formatFormula, libraryEntries } from '../molecules/catalogue';
import { structureThumbAlt, structureThumbUrl } from '../molecules/thumb_paths';
import type { MoleculeIndexEntry } from '../molecules/types';
import './molecule_explore.css';

/** The category the quick pick shows (spec §9.4 Build). */
const QUICK_CATEGORY = 'first-examples';
const QUICK_COUNT = 5;

/** One tile: the build-time ball-and-stick picture (Task 11), or the formula, large, if the picture does not load. */
const QuickPickTile: React.FC<{ entry: MoleculeIndexEntry; current: boolean; onSelect(id: string): void }> = ({ entry, current, onSelect }) => {
    const [missing, setMissing] = useState(false);
    const formula = formatFormula(entry.formula);
    return (
        // WCAG 2.5.3: the visible caption (the name) leads the accessible name.
        <button type="button" className={`quick-pick-tile${current ? ' selected' : ''}`} aria-label={`${entry.name} (${formula})`}
            aria-current={current ? 'true' : undefined} title={`${entry.name} (${formula})`} onClick={() => onSelect(entry.id)}>
            {missing
                ? <span className="quick-pick-formula">{formula}</span>
                : <img className="quick-pick-image" src={structureThumbUrl(entry.id)} alt={structureThumbAlt(entry.name)} onError={() => setMissing(true)} />}
            <span className="quick-pick-label">{entry.name}</span>
        </button>
    );
};

interface QuickPickProps {
    entries: MoleculeIndexEntry[] | null;
    selectedId: string | null;
    onSelect(id: string): void;
}

/**
 * Molecules' quick pick (spec §9.4 Build): the first five library molecules
 * of "First examples", read from the index, never hard-coded. Membership is
 * the picker chip's own (ruling D7 a): the category or the tag, so silane --
 * tagged, not filed, there -- is the live fifth. Ruling T12-fit: the five sit
 * in one row of the panel, never a sideways scroll.
 */
const QuickPick: React.FC<QuickPickProps> = ({ entries, selectedId, onSelect }) => {
    const headingId = useId();
    const picks = useMemo(
        () => (entries ? filterMolecules(libraryEntries(entries), '', QUICK_CATEGORY).slice(0, QUICK_COUNT) : []),
        [entries],
    );
    if (picks.length === 0) return null;
    return (
        <div className="quick-pick" role="group" aria-labelledby={headingId}>
            <h2 id={headingId} className="ql-section">Quick pick</h2>
            <div className="quick-pick-row">
                {picks.map(entry => <QuickPickTile key={entry.id} entry={entry} current={entry.id === selectedId} onSelect={onSelect} />)}
            </div>
        </div>
    );
};

export default QuickPick;
