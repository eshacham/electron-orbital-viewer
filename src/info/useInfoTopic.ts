/**
 * The Info topic lifecycle (plan Task 4, Review Focus 3): an (i) beside a term switches Info to that term; choosing
 * a new selection returns Info to the selection. `useInfoTopic` owns the topic; `InfoTopicProvider` hands it to
 * every (i) and to Info, with the id of Info's region (aria-controls) and the request to move focus to Info's heading.
 */
import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { InfoTopicId } from './info_types';

export interface InfoTopicState {
    /** The term Info explains, or null while Info explains the selection. */
    topic: InfoTopicId | null;
    setTopic(topic: InfoTopicId | null): void;
}

/**
 * The topic, reset to null whenever `selectionKey` changes (ruling PF4 names each mode's key). The reset happens
 * during the render that sees the new key, so Info never shows the old term against the new selection for a frame,
 * and returning to an earlier selection does not bring its old term back.
 */
export function useInfoTopic(selectionKey: string): InfoTopicState {
    const [state, setState] = useState<{ key: string; topic: InfoTopicId | null }>({ key: selectionKey, topic: null });
    if (state.key !== selectionKey) setState({ key: selectionKey, topic: null });
    const topic = state.key === selectionKey ? state.topic : null;
    const setTopic = useCallback((next: InfoTopicId | null) => setState({ key: selectionKey, topic: next }), [selectionKey]);
    return { topic, setTopic };
}

interface InfoTopicContextValue extends InfoTopicState {
    /** Info's region: what an active (i) controls. */
    regionId: string;
    /** Info's heading, the focus target after an (i) or Back is pressed. */
    headingId: string;
    /** Ask Info to focus its heading on its next render (it may mount only then: the phone tab, the drawer). */
    requestFocus(): void;
    /** Info's side of `requestFocus`: true once per request. */
    takeFocusRequest(): boolean;
    /** Bring Info on screen where the layout can hide it (the phone's Info tab, the folded drawer). */
    reveal(): void;
    /** Info is in the DOM now -- only then may an active (i) name its region in aria-controls (review M1). */
    infoMounted: boolean;
    /** Info's side of `infoMounted`: call on mount; the returned function on unmount. */
    registerInfo(): () => void;
}

const InfoTopicContext = createContext<InfoTopicContextValue | null>(null);

export const InfoTopicProvider: React.FC<InfoTopicState & { onReveal?(): void; children?: React.ReactNode }> = ({
    topic, setTopic, onReveal, children,
}) => {
    const id = useId();
    const pendingFocus = useRef(false);
    // A count, not a flag: an unmount and the next mount can land in either order within one commit.
    const [mountedInfo, setMountedInfo] = useState(0);
    // Stable, so Info's mount effect runs once per mount, not on every count change.
    const registerInfo = useCallback(() => {
        setMountedInfo(count => count + 1);
        return () => setMountedInfo(count => count - 1);
    }, []);
    // The layout's latest reveal, read at click time, so a new callback each App render does not churn the context.
    const revealRef = useRef(onReveal);
    useLayoutEffect(() => { revealRef.current = onReveal; });
    const value = useMemo<InfoTopicContextValue>(() => ({
        topic,
        setTopic,
        regionId: `${id}-info`,
        headingId: `${id}-info-heading`,
        requestFocus: () => { pendingFocus.current = true; },
        takeFocusRequest: () => {
            const pending = pendingFocus.current;
            pendingFocus.current = false;
            return pending;
        },
        reveal: () => revealRef.current?.(),
        infoMounted: mountedInfo > 0,
        registerInfo,
    }), [topic, setTopic, id, mountedInfo, registerInfo]);
    return React.createElement(InfoTopicContext.Provider, { value }, children);
};

/** The Info context, or null outside a provider (Info and an (i) still render; the (i) then does nothing). */
export function useInfoTopicContext(): InfoTopicContextValue | null {
    return useContext(InfoTopicContext);
}
