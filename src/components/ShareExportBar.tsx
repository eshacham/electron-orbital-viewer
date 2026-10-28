import React, { useState } from 'react';
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormHelperText, IconButton, InputLabel,
    ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Select, Snackbar, TextField, Tooltip,
} from '@mui/material';
import Check from '@mui/icons-material/Check';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import { EXPORT_ITEMS, ExportAvailability, ExportItem, ExportKind, ExportOptions } from '../export/run_export';
import { atLeast, CONTROL_LEVEL, LEVELS, LEVEL_LABEL, levelPointer, levelRank, LearningLevel } from '../levels/levels';
// Task 2: the quiet level line's style (.level-line).
import '../levels/levels.css';

/** The longest side of a print, offered as a choice (a desk model to a display piece). */
const PRINT_SIZES_MM = [30, 50, 80, 120];

/**
 * What Copy link did. Final review I1: `opensAt` is the level the link really opens at -- the one chosen, floored at
 * what the view needs -- or null for the recipient's own; omitted, the level chosen.
 */
export type ShareOutcome = ({ kind: 'copied' } | { kind: 'manual'; url: string }) & { opensAt?: LearningLevel | null };

interface ShareExportBarProps {
    /**
     * Copies a link to this view. Task 2: `opensAt` is the Share menu's "Opens at" choice -- the link then
     * carries `lvl`, setting the recipient's level for that visit (final review I1: above or below their own);
     * undefined keeps the recipient's own level.
     */
    onShare: (opensAt?: LearningLevel) => Promise<ShareOutcome>;
    /** The menu shows only when this is given (Task 8: not every caller exports yet). */
    onExport?: (kind: ExportKind, options: ExportOptions) => Promise<void>;
    availability?: ExportAvailability;
    /** How many separate solids an STL would hold right now (the viewer's surfaces), read as the print dialog opens. */
    stlSolids?: () => number;
    /** Fix round 1 (M5): the menu's own items -- defaults to EXPORT_ITEMS, but Bonds' CSV reads "Potential curve", not "Radial curves" (run_export.ts's exportItemsFor). */
    items?: ExportItem[];
    /** 'toolbar' is the viewport's icon row (spec §8.5): Snapshot, Share, Export; 'bar' is today's text buttons (the phone's View tab). */
    variant?: 'bar' | 'toolbar';
    /** Task 2: the learning level in use -- Snapshot and Export appear at Advanced. Omitted, everything shows. */
    level?: LearningLevel;
    /**
     * Final review I1: the least level this view can open at (`requiredLevel`) -- a link opens at least there, so
     * "Opens at" offers nothing below it and says why. Omitted, Basics: every level.
     */
    opensAtFloor?: LearningLevel;
}

/** The Share menu's "Opens at" choices: the recipient's own level (no `lvl`), then each level. */
const OPENS_AT: { value: LearningLevel | null; label: string }[] = [
    { value: null, label: 'Recipient’s level' },
    ...LEVELS.map(value => ({ value, label: LEVEL_LABEL[value] })),
];

/**
 * Share and Export, under Reset View. It lives inside Controls, so it is in
 * the right-hand panel on a desktop and in the View tab on a phone: no new
 * panel over the canvas (spec §3.8).
 */
const ShareExportBar: React.FC<ShareExportBarProps> = ({
    onShare, onExport: exportHandler, availability, stlSolids, items = EXPORT_ITEMS, variant = 'bar', level = 'research',
    opensAtFloor = 'basics',
}) => {
    // Task 2: below Advanced there is no Snapshot or Export at all -- hidden, not greyed; the Share menu says where.
    const exportsShown = atLeast(level, CONTROL_LEVEL.exports);
    const onExport = exportsShown ? exportHandler : undefined;
    const exportsPointer = exportHandler ? levelPointer(['exports'], level) : null;
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
    const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
    // Task 2: the Share menu's "Opens at" -- kept while the bar is mounted, so a second copy opens at the same level.
    const [chosenOpensAt, setOpensAt] = useState<LearningLevel | null>(null);
    // Final review I1: a level chosen below what the view now needs reads as that floor -- the level the link opens at.
    const belowFloor = (at: LearningLevel) => levelRank(at) < levelRank(opensAtFloor);
    const opensAt = chosenOpensAt && belowFloor(chosenOpensAt) ? opensAtFloor : chosenOpensAt;
    // The level the link on screen (copied, or in the copy-by-hand dialog) opens at, and whether the view raised it.
    const [copiedAt, setCopiedAt] = useState<{ at: LearningLevel; floored: boolean } | null>(null);
    const [stlOpen, setStlOpen] = useState(false);
    const [printSize, setPrintSize] = useState(50);
    const [solidCount, setSolidCount] = useState(0);
    // M6: a build in flight -- "Preparing export…" must not time itself out
    // while it is still true (a cube can take longer than the usual 4s
    // notice window), and the Export control is disabled meanwhile so a
    // second click cannot start a second build on top of the first.
    const [exporting, setExporting] = useState(false);

    const handleShare = async () => {
        setShareAnchor(null);
        const chosen = chosenOpensAt;
        const outcome = await onShare(chosen ?? undefined);
        // Final review I1: say the level the link really opens at, and why when the view needs more than was chosen.
        const at = outcome.opensAt !== undefined ? outcome.opensAt : opensAt;
        const copied = at ? { at, floored: at !== chosen } : null;
        setCopiedAt(copied);
        const where = copied ? `, at ${LEVEL_LABEL[copied.at]}${copied.floored ? ', the least this view needs' : ''}` : '';
        if (outcome.kind === 'copied') showNotice(`Link copied — it opens this exact view${where}.`);
        else setManualUrl(outcome.url);
    };
    const shareButtonProps = {
        id: 'share-view',
        'aria-haspopup': 'menu' as const,
        'aria-controls': shareAnchor ? 'share-menu' : undefined,
        'aria-expanded': shareAnchor !== null,
        onClick: (event: React.MouseEvent<HTMLElement>) => setShareAnchor(event.currentTarget),
    };

    const runKind = async (kind: ExportKind, options: ExportOptions = {}) => {
        if (!onExport || exporting) return;
        setMenuAnchor(null);
        setExporting(true);
        showNotice('Preparing export…');
        try {
            await onExport(kind, options);
            setNotice(null);
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'The export failed.');
        } finally {
            setExporting(false);
        }
    };
    const handleItem = (kind: ExportKind) => {
        // STL needs a size first: millimetres are what a slicer reads, and
        // the file carries no other scale.
        if (kind === 'stl') {
            setMenuAnchor(null);
            setSolidCount(stlSolids?.() ?? 0);
            setStlOpen(true);
        } else {
            void runKind(kind);
        }
    };

    return (
        <Box className={`share-export-bar ${variant}`} sx={variant === 'bar' ? { mt: 1.5, display: 'flex', gap: 1 } : { display: 'contents' }}>
            {variant === 'toolbar' && onExport && (
                <Tooltip title={availability?.png ?? 'Snapshot (PNG with caption)'}>
                    {/* A span keeps the tooltip on a disabled button. */}
                    <span>
                        <IconButton className="viewport-tool" aria-label="Snapshot" disabled={exporting || Boolean(availability?.png)}
                            onClick={() => { void runKind('png'); }}>
                            <CameraAltOutlined fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            )}
            {variant === 'toolbar' ? (
                <Tooltip title="Share link">
                    <IconButton className="viewport-tool" aria-label="Share" {...shareButtonProps}><LinkOutlined fontSize="small" /></IconButton>
                </Tooltip>
            ) : (
                <Button variant="outlined" {...shareButtonProps}>Share</Button>
            )}
            {/* Task 2: Copy link, then where the link opens -- the recipient's own level unless chosen here.
                A radio chooses and keeps the menu open; Copy link copies at the level chosen. */}
            <Menu id="share-menu" anchorEl={shareAnchor} open={shareAnchor !== null} onClose={() => setShareAnchor(null)}
                slotProps={{ list: { 'aria-label': 'Share' } }}>
                <MenuItem onClick={() => { void handleShare(); }}>
                    <ListItemIcon><LinkOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Copy link" />
                </MenuItem>
                <Divider />
                {/* Flat, not a nested group: MUI's MenuList moves focus over its own children only. Each
                    radio's name says what it chooses ("Opens at Basics"), holding its visible label. */}
                <ListSubheader>Opens at</ListSubheader>
                {OPENS_AT.map(option => {
                    const checked = option.value === opensAt;
                    // Final review I1: a link opens at least at what its view needs; a level below it is not offered.
                    const unavailable = option.value !== null && belowFloor(option.value);
                    return (
                        <MenuItem key={option.label} role="menuitemradio" aria-checked={checked} aria-label={`Opens at ${option.label}`}
                            disabled={unavailable} onClick={() => setOpensAt(option.value)}>
                            <ListItemIcon>{checked && <Check fontSize="small" />}</ListItemIcon>
                            <ListItemText primary={option.label} />
                        </MenuItem>
                    );
                })}
                {opensAtFloor !== 'basics' && (
                    <li role="none" className="ql-caption level-line share-menu-note">
                        This view needs {LEVEL_LABEL[opensAtFloor]}, so a link to it opens at {LEVEL_LABEL[opensAtFloor]} or above
                    </li>
                )}
                {exportsPointer && <li role="none" className="ql-caption level-line share-menu-note">{exportsPointer}</li>}
            </Menu>
            {onExport && (
                <>
                    {variant === 'toolbar' ? (
                        <Tooltip title="Export">
                            <IconButton id="export-view" className="viewport-tool" aria-label="Export" aria-haspopup="menu"
                                aria-controls={menuAnchor ? 'export-menu' : undefined} aria-expanded={menuAnchor !== null}
                                disabled={exporting} onClick={event => setMenuAnchor(event.currentTarget)}>
                                <FileDownloadOutlined fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Button id="export-view" variant="outlined" aria-haspopup="menu" aria-controls={menuAnchor ? 'export-menu' : undefined}
                            aria-expanded={menuAnchor !== null} disabled={exporting} onClick={event => setMenuAnchor(event.currentTarget)}>
                            Export
                        </Button>
                    )}
                    {/* Final review M5: an unavailable item stays reachable by
                        arrow key, so a keyboard or screen-reader user hears its
                        reason (the secondary text) rather than having it
                        skipped. It is still disabled: Enter does nothing. */}
                    <Menu
                        id="export-menu"
                        anchorEl={menuAnchor}
                        open={menuAnchor !== null}
                        onClose={() => setMenuAnchor(null)}
                        slotProps={{ list: { disabledItemsFocusable: true } }}
                    >
                        {items.map(item => {
                            const reason = availability?.[item.kind] ?? null;
                            const unavailable = reason !== null || exporting;
                            return (
                                <MenuItem
                                    key={item.kind}
                                    disabled={unavailable}
                                    onClick={() => { if (!unavailable) handleItem(item.kind); }}
                                >
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
                        {/* Ruling T10-I1: each solid passes the manifold check on its own, but where
                            they meet the file as a whole does not -- say so rather than call it watertight. */}
                        {solidCount > 1 && (
                            <FormHelperText>
                                {solidCount} overlapping solids, each watertight; your slicer merges them into one.
                            </FormHelperText>
                        )}
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStlOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        disabled={exporting}
                        onClick={() => { setStlOpen(false); void runKind('stl', { longestSideMm: printSize }); }}
                    >
                        Export STL
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={manualUrl !== null} onClose={() => setManualUrl(null)} fullWidth>
                <DialogTitle>Copy this link</DialogTitle>
                <DialogContent>
                    {copiedAt && (
                        <p className="ql-caption">
                            Opens at {LEVEL_LABEL[copiedAt.at]}{copiedAt.floored && ', the least this view needs'}
                        </p>
                    )}
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
                // M6: undefined while a build is in flight -- MUI takes that
                // as "no auto-hide" -- so a cube that takes longer than 4s
                // does not lose its "Preparing export…" notice out from
                // under it while it is still building.
                autoHideDuration={exporting ? undefined : 4000}
                onClose={() => setNotice(null)}
                message={notice}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
        </Box>
    );
};

export default ShareExportBar;
