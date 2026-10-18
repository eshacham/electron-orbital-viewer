import React from 'react';
import { IconButton } from '@mui/material';
import Close from '@mui/icons-material/Close';
import { hintPref } from '../design/presentation';
import { usePref } from '../design/usePref';
import './first_view_hint.css';

interface FirstViewHintProps {
    /**
     * Told when the hint's own button dismisses it, beyond the pref write
     * every dismissal path shares -- App has nothing further to do with it
     * today, but the caller, not this component, decides that.
     */
    onDismiss?(): void;
}

/**
 * Atoms mode's one-time hint (ruling P17): says how to explore the view, then
 * never shows again once the viewer rotates the camera, picks a shell, or
 * dismisses it here -- whichever comes first (App wires the first two; this
 * component is the third). `eov.hint` (localStorage only, spec §6.7, never a
 * link key) is the single source for "has this been seen", read here too and
 * not only by the caller that gates mounting this at all, so the chip hides
 * itself even if ever rendered unconditionally. No animation (spec §4.6-4.7:
 * "nothing pulses, breathes or auto-rotates" survives `prefers-reduced-motion`
 * by never existing in the first place).
 */
const FirstViewHint: React.FC<FirstViewHintProps> = ({ onDismiss }) => {
    const { rotateDismissed } = usePref(hintPref);
    if (rotateDismissed) return null;

    const dismiss = () => {
        hintPref.set({ rotateDismissed: true });
        onDismiss?.();
    };

    return (
        <div className="first-view-hint" role="note">
            <span className="first-view-hint-text">Drag to rotate · pick a shell to explore</span>
            <IconButton
                className="ql-icon-button first-view-hint-dismiss"
                aria-label="Dismiss hint"
                size="small"
                onClick={dismiss}
            >
                <Close fontSize="small" />
            </IconButton>
        </div>
    );
};

export default FirstViewHint;
