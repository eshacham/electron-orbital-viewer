import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import Fullscreen from '@mui/icons-material/Fullscreen';
import FullscreenExit from '@mui/icons-material/FullscreenExit';
import RestartAlt from '@mui/icons-material/RestartAlt';
import './viewport.css';

interface ViewportToolbarProps {
    onResetView(): void;
    /** <ShareExportBar variant="toolbar" …/>: Snapshot, Share and Export. */
    shareExport: React.ReactNode;
    fullscreen: boolean;
    onToggleFullscreen(): void;
}

/** The viewport's top-right toolbar (spec §8.5): 36 px icon buttons with tooltips. */
const ViewportToolbar: React.FC<ViewportToolbarProps> = ({ onResetView, shareExport, fullscreen, onToggleFullscreen }) => {
    const fullscreenLabel = fullscreen ? 'Exit full screen' : 'Full screen';
    return (
        <div className="viewport-toolbar" role="toolbar" aria-label="View tools">
            <Tooltip title="Reset view">
                <IconButton className="viewport-tool" aria-label="Reset view" onClick={onResetView}><RestartAlt fontSize="small" /></IconButton>
            </Tooltip>
            {shareExport}
            <Tooltip title={fullscreenLabel}>
                <IconButton className="viewport-tool" aria-label={fullscreenLabel} aria-pressed={fullscreen} onClick={onToggleFullscreen}>
                    {fullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                </IconButton>
            </Tooltip>
        </div>
    );
};

export default ViewportToolbar;
