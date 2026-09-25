import React, { useMemo, useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    TextField,
    List,
    ListItemButton,
    IconButton,
} from '@mui/material';
import { ELEMENTS } from '../elements';
import { BLOCK_COLORS, BLOCK_LABELS, tileOf } from '../periodic_table';

interface ElementPickerDialogProps {
    open: boolean;
    /** The element currently shown, marked in the list. */
    Z: number;
    onSelect: (Z: number) => void;
    onClose: () => void;
}

/**
 * Element selection on a phone.
 *
 * The periodic table needs about 500 px across and does not fit, and the
 * dropdown that stood in for it sat in the controls sheet, which scrolls
 * sideways: changing element -- the main thing you do in atom mode -- took
 * opening the sheet and scrolling a strip three screens wide. This opens
 * from the element name in the navigation card instead, full screen, with a
 * filter that matches a symbol, a name or an atomic number.
 */
const ElementPickerDialog: React.FC<ElementPickerDialogProps> = ({ open, Z, onSelect, onClose }) => {
    const [query, setQuery] = useState('');

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return ELEMENTS;
        return ELEMENTS.filter(element =>
            element.symbol.toLowerCase() === q
            || element.name.toLowerCase().includes(q)
            || String(element.atomicNumber) === q
            || (q.length <= 2 && element.symbol.toLowerCase().startsWith(q))
        );
    }, [query]);

    const choose = (atomicNumber: number) => {
        onSelect(atomicNumber);
        setQuery('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="element-picker-title">
            <DialogTitle id="element-picker-title" className="element-picker-title">
                Choose an element
                <IconButton aria-label="close element picker" onClick={onClose} size="small">✕</IconButton>
            </DialogTitle>
            <DialogContent dividers className="element-picker-content">
                <TextField
                    autoFocus
                    fullWidth
                    size="small"
                    placeholder="Name, symbol or number"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter' && matches.length > 0) {
                            // Closing hands focus back to the button that
                            // opened this; without preventDefault the same
                            // Enter's keypress then activates that button and
                            // the picker reopens.
                            event.preventDefault();
                            choose(matches[0].atomicNumber);
                        }
                    }}
                    slotProps={{ htmlInput: { 'aria-label': 'filter elements' } }}
                />
                <List dense aria-label="elements">
                    {matches.map(element => {
                        const block = tileOf(element.atomicNumber)?.block;
                        return (
                            <ListItemButton
                                key={element.atomicNumber}
                                selected={element.atomicNumber === Z}
                                onClick={() => choose(element.atomicNumber)}
                                className="element-picker-item"
                            >
                                <span className="element-picker-number">{element.atomicNumber}</span>
                                <span className="element-picker-symbol">{element.symbol}</span>
                                <span className="element-picker-name">{element.name}</span>
                                {block && (
                                    <span className="element-picker-block">
                                        <span
                                            className="element-picker-block-swatch"
                                            style={{ background: BLOCK_COLORS[block] }}
                                        />
                                        {BLOCK_LABELS[block]}
                                    </span>
                                )}
                            </ListItemButton>
                        );
                    })}
                </List>
            </DialogContent>
        </Dialog>
    );
};

export default ElementPickerDialog;
