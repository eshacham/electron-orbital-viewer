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
    /**
     * Task 6 fix round 2 (owner: only one (i) is ever shown pressed): the (i) whose press set the current topic, by its
     * id (InfoButton: its place and topic, stable across a remount) -- a topic can have more than one (i) on screen (Atoms' ionisation energy: the panel's line and Info's
     * fact). Null when no (i) set it: no topic, or a topic left by Back or a new selection.
     */
    activeButtonId: string | null;
    /** An (i) pressed: Info shows `topic`, and the (i) with `buttonId` is the active one. */
    press(topic: InfoTopicId, buttonId: string): void;
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
    // Fix round 2: which (i) set the topic. Any other change of topic -- Back or a new selection clearing it -- forgets
    // the presser during the render that sees it (the same pattern as useInfoTopic's reset), so no (i) stays pressed
    // and a later topic set another way never lights a stale one. Only an (i) sets a topic; Back and a new selection
    // only clear it.
    const [pressed, setPressed] = useState<{ topic: InfoTopicId; buttonId: string } | null>(null);
    if (pressed && pressed.topic !== topic) setPressed(null);
    const activeButtonId = pressed && pressed.topic === topic ? pressed.buttonId : null;
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
        activeButtonId,
        press: (next: InfoTopicId, buttonId: string) => {
            setPressed({ topic: next, buttonId });
            setTopic(next);
        },
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
    }), [topic, setTopic, activeButtonId, id, mountedInfo, registerInfo]);
    return React.createElement(InfoTopicContext.Provider, { value }, children);
};

/** The Info context, or null outside a provider (Info and an (i) still render; the (i) then does nothing). */
export function useInfoTopicContext(): InfoTopicContextValue | null {
    return useContext(InfoTopicContext);
}
