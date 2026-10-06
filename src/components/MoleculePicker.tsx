import React, { useMemo, useState } from 'react';
import { Alert, Chip, List, ListItemButton, TextField, Typography } from '@mui/material';
import { LIBRARY_CATEGORIES } from '../molecules/library_types';
import { filterMolecules, formatFormula } from '../molecules/catalogue';
import type { MoleculeIndexEntry } from '../molecules/types';
import { COMPUTED_CATEGORY } from '../jobs/computed';

interface MoleculePickerProps {
    entries: MoleculeIndexEntry[] | null;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    autoFocus?: boolean;
}

/** Search plus the spec's five categories. Lives in the navigation column on a desktop and in the Explore tab and a full-screen dialog on a phone. */
const MoleculePicker: React.FC<MoleculePickerProps> = ({ entries, error, selectedId, onSelect, autoFocus = false }) => {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const matches = useMemo(() => (entries ? filterMolecules(entries, query, category) : []), [entries, query, category]);
    // The owner's computed molecules join as one more category, present only
    // when there are some: nobody else is ever given computed entries.
    const categories = useMemo(
        () => (entries?.some(entry => entry.category === COMPUTED_CATEGORY.key) ? [...LIBRARY_CATEGORIES, COMPUTED_CATEGORY] : LIBRARY_CATEGORIES),
        [entries],
    );

    if (error) return <Alert severity="error" role="alert">Could not load the molecule library: {error}. Reload the page to try again.</Alert>;
    if (!entries) return <Typography variant="body2" className="molecule-picker-status">Loading the molecule library…</Typography>;

    return (
        <div className="molecule-picker">
            <TextField
                autoFocus={autoFocus} fullWidth size="small" placeholder="Name or formula" value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter' && matches.length > 0) {
                        event.preventDefault();   // as ElementPickerDialog: the same Enter must not re-open anything
                        onSelect(matches[0].id);
                    }
                }}
                slotProps={{ htmlInput: { 'aria-label': 'filter molecules' } }}
            />
            <div className="molecule-category-chips" role="group" aria-label="molecule categories">
                <Chip label="All" size="small" clickable color={category === null ? 'primary' : 'default'} aria-pressed={category === null} onClick={() => setCategory(null)} />
                {categories.map(c => (
                    <Chip key={c.key} label={c.label} size="small" clickable color={category === c.key ? 'primary' : 'default'}
                        aria-pressed={category === c.key} onClick={() => setCategory(category === c.key ? null : c.key)} />
                ))}
            </div>
            {matches.length === 0 ? (
                <Typography variant="body2" className="molecule-picker-status">No molecule matches “{query}”.</Typography>
            ) : (
                <List dense aria-label="molecules" className="molecule-picker-list">
                    {matches.map(entry => (
                        <ListItemButton key={entry.id} selected={entry.id === selectedId} onClick={() => onSelect(entry.id)} className="molecule-picker-item">
                            <span className="molecule-picker-formula">{formatFormula(entry.formula)}</span>
                            <span className="molecule-picker-name">{entry.name}</span>
                        </ListItemButton>
                    ))}
                </List>
            )}
        </div>
    );
};

export default MoleculePicker;
