import React, { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, TextField } from '@mui/material';

export type ShareOutcome = { kind: 'copied' } | { kind: 'manual'; url: string };

interface ShareExportBarProps {
    onShare: () => Promise<ShareOutcome>;
}

/**
 * Share (and, from the next task, Export) under Reset View. It lives inside
 * Controls, so it is in the right-hand panel on a desktop and in the View
 * tab on a phone: no new panel over the canvas (spec §3.8).
 */
const ShareExportBar: React.FC<ShareExportBarProps> = ({ onShare }) => {
    const [notice, setNotice] = useState<string | null>(null);
    const [manualUrl, setManualUrl] = useState<string | null>(null);

    const handleShare = async () => {
        const outcome = await onShare();
        if (outcome.kind === 'copied') setNotice('Link copied — it opens this exact view.');
        else setManualUrl(outcome.url);
    };

    return (
        <Box className="share-export-bar" sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
            <Button id="share-view" variant="outlined" onClick={handleShare}>Share</Button>
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
