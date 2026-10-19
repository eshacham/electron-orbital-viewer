import React, { useCallback, useEffect, useRef } from 'react';
import { IconButton } from '@mui/material';
import Close from '@mui/icons-material/Close';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { previewCleared, previewResolved, requestOpened, selectIsOwner } from '../store/jobsSlice';
import { NARROW_VIEWPORT, useMediaQuery } from '../useMediaQuery';
import type { CanonicalAtom } from '../jobs/api_types';
import RequestPanel from './RequestPanel';
import { REQUEST_WORKSPACE_ID, useRequestPanel } from './MoleculeJobsSection';
import './request_workspace.css';

/**
 * Whether the request workspace is on screen: Molecules mode, wider than a
 * phone (a phone keeps the panel in its sheet), the owner's request open --
 * or the owner's session ended under it, when it stays to say so with the
 * form kept (R4). App reads the same answer to hide what would describe the
 * molecule beside it (the strip, the hover caption).
 */
export function useRequestWorkspaceOpen(): boolean {
    const narrow = useMediaQuery(NARROW_VIEWPORT);
    // Narrow selectors: App calls this, and must not re-render on every job update.
    return useAppSelector(state => state.atom.mode === 'molecule' && state.jobs.request.open
        && (selectIsOwner(state) || state.jobs.session.expired)) && !narrow;
}

export interface RequestWorkspaceProps {
    /** Explore's "Request a new molecule" button: closing returns focus there. */
    returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * The owner's request as a workspace in the viewport cell (ruling P12,
 * R-requestspace): left-anchored over the canvas and measured as its left
 * camera inset (useViewInsets' LEFT_ZONES), so the resolved structure --
 * drawn on the one canvas by useMoleculeView from `request.previewAtoms` --
 * sits clear of it on the right. It holds the whole request panel (form,
 * recipes, Preview, what was resolved, the quote and approval) without the
 * panel's own SVG drawing. Esc that nothing inside has used closes it, and
 * focus goes back to the entry that opened it.
 */
const RequestWorkspace: React.FC<RequestWorkspaceProps> = ({ returnFocusRef }) => {
    const dispatch = useAppDispatch();
    const shown = useRequestWorkspaceOpen();
    const { panelProps } = useRequestPanel();
    const region = useRef<HTMLElement>(null);

    // Opened, the molecule field takes focus: the request starts there.
    useEffect(() => {
        if (shown) region.current?.querySelector<HTMLInputElement>('input[aria-label^="molecule"], textarea[aria-label^="molecule"]')?.focus();
    }, [shown]);

    const close = useCallback(() => {
        dispatch(requestOpened(false));
        returnFocusRef.current?.focus();
    }, [dispatch, returnFocusRef]);
    const onResolved = useCallback((atoms: CanonicalAtom[]) => { dispatch(previewResolved(atoms)); }, [dispatch]);
    const onCleared = useCallback(() => { dispatch(previewCleared()); }, [dispatch]);

    if (!shown) return null;
    return (
        <section id={REQUEST_WORKSPACE_ID} ref={region} className="request-workspace" aria-labelledby="request-workspace-title"
            onKeyDown={event => {
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                event.preventDefault();
                close();
            }}>
            <header className="request-workspace-head">
                <h2 id="request-workspace-title">Request a molecule</h2>
                <IconButton aria-label="Close the request workspace" size="small" onClick={close}><Close fontSize="small" /></IconButton>
            </header>
            <div className="request-workspace-body">
                <RequestPanel {...panelProps} showStructureSvg={false} onPreviewResolved={onResolved} onPreviewCleared={onCleared} />
            </div>
        </section>
    );
};

export default RequestWorkspace;
