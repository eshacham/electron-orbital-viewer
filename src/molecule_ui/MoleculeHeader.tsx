import React, { useRef, useState } from 'react';
import { Button } from '@mui/material';
import MoleculePickerDialog from '../components/MoleculePickerDialog';
import { LibraryLoadAlert } from '../components/MoleculePicker';
import { formatFormula } from '../molecules/catalogue';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeIndexEntry } from '../molecules/types';
import './molecule_explore.css';
import ExpandMore from '@mui/icons-material/ExpandMore';

interface MoleculeHeaderProps {
    entries: MoleculeIndexEntry[] | null;
    indexError: string | null;
    meta: LibraryMoleculeMeta | null;
    selectedId: string | null;
    isLoading: boolean;
    onSelectMolecule(id: string): void;
    /** A phone's Explore tab: one row, and Change opens the phone's full-screen picker (`onOpenPicker`). */
    compact?: boolean;
    onOpenPicker?(): void;
}

/**
 * Molecules' Explore header tile (spec §9.4 Build, ruling P1): the
 * molecule's name and formula, and "Change ▾", which opens today's search
 * and category chips as a popover under it. The tier badge is not repeated
 * here -- it sits under the title on the canvas (ruling R22c).
 */
const MoleculeHeader: React.FC<MoleculeHeaderProps> = ({
    entries, indexError, meta, selectedId, isLoading, onSelectMolecule, compact = false, onOpenPicker,
}) => {
    const [open, setOpen] = useState(false);
    const tileRef = useRef<HTMLDivElement>(null);
    // The index names a molecule whose meta is still on its way.
    const entry = entries?.find(e => e.id === selectedId) ?? null;
    const name = meta?.name ?? entry?.name ?? null;
    const formula = meta?.formula ?? entry?.formula ?? null;
    const popover = !compact;

    return (
        <>
            <div className={`molecule-tile${compact ? ' compact' : ''}`} ref={tileRef}>
                <div className="molecule-tile-text">
                    <span className="molecule-tile-name">{name ?? 'Choose a molecule'}</span>
                    {formula && <span className="molecule-tile-formula">{formatFormula(formula)}</span>}
                    {isLoading && <span className="molecule-tile-status">Loading…</span>}
                </div>
                <Button size="small" variant="outlined" className="molecule-tile-change" endIcon={<ExpandMore aria-hidden="true" />}
                    aria-label={name ? 'Change molecule' : 'Choose a molecule'}
                    aria-haspopup="dialog" aria-expanded={popover ? open : undefined}
                    onClick={() => (popover ? setOpen(true) : onOpenPicker?.())}>
                    {name ? 'Change' : 'Choose'}
                </Button>
                {/* The button opens it; it hangs under the whole tile, left-aligned, so it never covers the name or
                    formula it is changing (hung from the button's own corner it was pushed back over them). Closing
                    returns focus to the button. */}
                {popover && (
                    <MoleculePickerDialog variant="popover" anchorEl={open ? tileRef.current : null} open={open}
                        entries={entries} error={indexError} selectedId={selectedId}
                        onSelect={onSelectMolecule} onClose={() => setOpen(false)} />
                )}
            </div>
            {/* Ruling T12-I2: a library that did not load is said here, under the tile, as the inline picker said it
                before it became a popover. A phone's Explore tab keeps its inline list, which says it already. */}
            {indexError && !compact && <LibraryLoadAlert error={indexError} />}
        </>
    );
};

export default MoleculeHeader;
