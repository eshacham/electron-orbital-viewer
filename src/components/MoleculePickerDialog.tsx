import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import MoleculePicker from './MoleculePicker';
import type { MoleculeIndexEntry } from '../molecules/types';

interface MoleculePickerDialogProps {
    open: boolean;
    entries: MoleculeIndexEntry[] | null;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onClose: () => void;
}

/** The phone's molecule choice, full screen, opened from the name in the header -- as ElementPickerDialog is for elements. */
const MoleculePickerDialog: React.FC<MoleculePickerDialogProps> = ({ open, entries, error, selectedId, onSelect, onClose }) => (
    <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="molecule-picker-title">
        <DialogTitle id="molecule-picker-title" className="element-picker-title">
            Choose a molecule
            <IconButton aria-label="close molecule picker" onClick={onClose} size="small">✕</IconButton>
        </DialogTitle>
        <DialogContent dividers className="element-picker-content">
            <MoleculePicker entries={entries} error={error} selectedId={selectedId} autoFocus
                onSelect={id => { onSelect(id); onClose(); }} />
        </DialogContent>
    </Dialog>
);

export default MoleculePickerDialog;
