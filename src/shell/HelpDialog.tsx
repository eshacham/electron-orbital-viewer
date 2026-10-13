import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import Close from '@mui/icons-material/Close';
import packageInfo from '../../package.json';
import type { Brand } from '../design/brands';
import { EXPORT_ITEMS } from '../export/run_export';
import { MOLECULE_DATA_VERSION } from '../molecules/data_version';

interface HelpDialogProps {
    open: boolean;
    onClose(): void;
    brand: Brand;
    /** The current mode's "About this model" text, where the mode has one. */
    aboutModel?: React.ReactNode;
}

/**
 * Help (spec §8.1 item 5): gestures, keys, export formats, About and the
 * current mode's model. No external links until the Phase 7 methods page.
 */
const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose, brand, aboutModel }) => (
    <Dialog open={open} onClose={onClose} aria-labelledby="help-title" maxWidth="sm" fullWidth>
        <DialogTitle className="help-title">
            {/* The name is the span alone: the close button's own name must not join it. */}
            <span id="help-title">Help</span>
            <IconButton aria-label="close help" onClick={onClose} size="small"><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers className="help-body ql-body">
            <h2 className="ql-section">Gestures</h2>
            <ul>
                <li>Drag to rotate the view; right-drag, or drag with two fingers, to pan.</li>
                <li>Scroll, or pinch, to zoom.</li>
                <li>Tap or click a ring on the cut face to open that shell; in Molecules, tap an atom or a bond to read it.</li>
            </ul>
            <h2 className="ql-section">Keyboard</h2>
            <ul>
                <li>⌘K (Mac) or Ctrl+K: search elements, molecules and orbitals.</li>
                <li>Tab moves between areas; the arrow keys move inside the mode rail, tab rows, chip groups and the orbital strip.</li>
                <li>Esc closes menus, popovers, the inspector drawer and full screen.</li>
            </ul>
            <h2 className="ql-section">Export formats</h2>
            <ul>
                {EXPORT_ITEMS.map(item => <li key={item.kind}>{item.label}: {item.detail}.</li>)}
            </ul>
            {aboutModel && (
                <>
                    <h2 className="ql-section">About this model</h2>
                    {aboutModel}
                </>
            )}
            <h2 className="ql-section">About</h2>
            <p>
                {brand.name} (electron-orbital-viewer), version {packageInfo.version}, molecule data {MOLECULE_DATA_VERSION}.
                Methods are stated beside every number.
            </p>
        </DialogContent>
    </Dialog>
);

export default HelpDialog;
