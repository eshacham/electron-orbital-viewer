import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton, Popover } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import type { MoleculeIndexEntry } from '../molecules/types';

interface MoleculePickerDialogProps {
    open: boolean;
    entries: MoleculeIndexEntry[] | null;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onClose: () => void;
    /** 'popover' hangs under the Explore header tile's "Change ▾" (spec §9.4, Task 12); 'dialog' (the default) is the phone's full screen. */
    variant?: 'dialog' | 'popover';
    /** What the popover hangs under (the header tile its Change button sits in); 'popover' only. */
    anchorEl?: HTMLElement | null;
}

/**
 * The molecule choice -- today's search and category chips (MoleculePicker)
 * -- as ElementPickerDialog is for elements: full screen on a phone, opened
 * from the name in the header; a popover under the header tile's button on
 * a desktop or tablet.
 */
const MoleculePickerDialog: React.FC<MoleculePickerDialogProps> = ({
    open, entries, error, selectedId, onSelect, onClose, variant = 'dialog', anchorEl,
}) => {
    const picker = (
        <MoleculePicker entries={entries} error={error} selectedId={selectedId} autoFocus
            onSelect={id => { onSelect(id); onClose(); }} />
    );

    if (variant === 'popover') {
        return (
            <Popover open={open} anchorEl={anchorEl ?? null} onClose={onClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: -4, horizontal: 'left' }}
                slotProps={{
                    paper: { className: 'molecule-list-popover', role: 'dialog', 'aria-label': 'Choose a molecule' } as object,
                    // As ElementPickerDialog: the grow-in starts hidden, which swallows the
                    // filter's autoFocus in a browser; focus it once the popover shows.
                    transition: { onEntered: (node: HTMLElement) => node.querySelector<HTMLInputElement>('input')?.focus() },
                }}>
                {picker}
            </Popover>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="molecule-picker-title">
            <DialogTitle id="molecule-picker-title" className="element-picker-title">
                Choose a molecule
                <IconButton aria-label="close molecule picker" onClick={onClose} size="small">✕</IconButton>
            </DialogTitle>
            <DialogContent dividers className="element-picker-content">
                {picker}
            </DialogContent>
        </Dialog>
    );
};

export default MoleculePickerDialog;
