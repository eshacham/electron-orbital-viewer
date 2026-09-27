import React, { useState } from 'react';
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, InputLabel,
    ListItemText, Menu, MenuItem, Select, Snackbar, TextField,
} from '@mui/material';
import { EXPORT_ITEMS, ExportAvailability, ExportKind, ExportOptions } from '../export/run_export';

/** The longest side of a print, offered as a choice (a desk model to a display piece). */
const PRINT_SIZES_MM = [30, 50, 80, 120];

export type ShareOutcome = { kind: 'copied' } | { kind: 'manual'; url: string };

interface ShareExportBarProps {
    onShare: () => Promise<ShareOutcome>;
    /** The menu shows only when this is given (Task 8: not every caller exports yet). */
    onExport?: (kind: ExportKind, options: ExportOptions) => Promise<void>;
    availability?: ExportAvailability;
}

/**
 * Share and Export, under Reset View. It lives inside Controls, so it is in
 * the right-hand panel on a desktop and in the View tab on a phone: no new
 * panel over the canvas (spec §3.8).
 */
const ShareExportBar: React.FC<ShareExportBarProps> = ({ onShare, onExport, availability }) => {
    const [notice, setNotice] = useState<string | null>(null);
    // Fix round 1 (M6): MUI's Snackbar starts its auto-hide timer once, when
    // `open` first turns true, and does not notice a later change to
    // `message` while it stays open -- so "Preparing export…" replaced by an
    // error a moment before the original 4s ran out would vanish almost at
    // once. Keying the Snackbar on this (bumped on every new notice, success
    // or failure alike) remounts it, which restarts the timer.
    const [noticeId, setNoticeId] = useState(0);
    const showNotice = (message: string) => {
        setNotice(message);
        setNoticeId(id => id + 1);
    };
    const [manualUrl, setManualUrl] = useState<string | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [stlOpen, setStlOpen] = useState(false);
    const [printSize, setPrintSize] = useState(50);

    const handleShare = async () => {
        const outcome = await onShare();
        if (outcome.kind === 'copied') showNotice('Link copied — it opens this exact view.');
        else setManualUrl(outcome.url);
    };

    const runKind = async (kind: ExportKind, options: ExportOptions = {}) => {
        if (!onExport) return;
        setMenuAnchor(null);
        showNotice('Preparing export…');
        try {
            await onExport(kind, options);
            setNotice(null);
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'The export failed.');
        }
    };
    const handleItem = (kind: ExportKind) => {
        // STL needs a size first: millimetres are what a slicer reads, and
        // the file carries no other scale.
        if (kind === 'stl') {
            setMenuAnchor(null);
            setStlOpen(true);
        } else {
            void runKind(kind);
        }
    };

    return (
        <Box className="share-export-bar" sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
            <Button id="share-view" variant="outlined" onClick={handleShare}>Share</Button>
            {onExport && (
                <>
                    <Button
                        id="export-view"
                        variant="outlined"
                        aria-haspopup="menu"
                        aria-controls={menuAnchor ? 'export-menu' : undefined}
                        aria-expanded={menuAnchor !== null}
                        onClick={event => setMenuAnchor(event.currentTarget)}
                    >
                        Export
                    </Button>
                    <Menu id="export-menu" anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
                        {EXPORT_ITEMS.map(item => {
                            const reason = availability?.[item.kind] ?? null;
                            return (
                                <MenuItem key={item.kind} disabled={reason !== null} onClick={() => handleItem(item.kind)}>
                                    <ListItemText primary={item.label} secondary={reason ?? item.detail} />
                                </MenuItem>
                            );
                        })}
                    </Menu>
                </>
            )}
            <Dialog open={stlOpen} onClose={() => setStlOpen(false)}>
                <DialogTitle>Export for 3D printing</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth margin="dense" size="small">
                        <InputLabel id="print-size-label">Longest side</InputLabel>
                        <Select
                            labelId="print-size-label"
                            id="print-size"
                            label="Longest side"
                            value={String(printSize)}
                            onChange={event => setPrintSize(Number(event.target.value))}
                        >
                            {PRINT_SIZES_MM.map(mm => <MenuItem key={mm} value={String(mm)}>{mm} mm</MenuItem>)}
                        </Select>
                        <FormHelperText>
                            Binary STL in millimetres; the scale (mm per a₀) is in the file header. The whole
                            surface is exported: the cut is a view setting, and a cut surface would not print.
                        </FormHelperText>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStlOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={() => { setStlOpen(false); void runKind('stl', { longestSideMm: printSize }); }}>
                        Export STL
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={manualUrl !== null} onClose={() => setManualUrl(null)} fullWidth>
                <DialogTitle>Copy this link</DialogTitle>
                <DialogContent>
                    <TextField
                        value={manualUrl ?? ''}
                        fullWidth
                        multiline
                        autoFocus
                        onFocus={event => event.target.select()}
                        slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'link to this view' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setManualUrl(null)}>Done</Button>
                </DialogActions>
            </Dialog>
            <Snackbar
                key={noticeId}
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                message={notice}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
        </Box>
    );
};

export default ShareExportBar;
