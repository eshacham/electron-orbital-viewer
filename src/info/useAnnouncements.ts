/**
 * Task 9 fix round 1 (the screen-reader pass): what a polite live region is given, so that each change is heard once.
 * Both keep the region's element and change only its text -- a region inserted together with its text is not
 * reliably read.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * The phone caption's spoken copy: the last settled view. `settled` is null while the view loads, so "loading…" and the
 * flicker of a load (a molecule's name, then its surface, then "loading…" again) are never said; the view is said once
 * it is on screen. Empty until the first one settles.
 */
export function useSettledText(settled: string | null): string {
    const [spoken, setSpoken] = useState('');
    useEffect(() => {
        if (settled !== null) setSpoken(settled);
    }, [settled]);
    return spoken;
}

/**
 * A line said only when `text` changes while `key` stays the same (Atoms' relativity, keyed by the drawn species: a
 * new element's own default is not a change of relativity). The first text for a key is taken silently; null leaves
 * the line as it is.
 */
export function useChangeAnnouncement(text: string | null, key: string | null): string {
    const [spoken, setSpoken] = useState('');
    const last = useRef<{ key: string | null; text: string } | null>(null);
    useEffect(() => {
        if (text === null) return;
        const previous = last.current;
        last.current = { key, text };
        if (previous && previous.key === key && previous.text !== text) setSpoken(text);
    }, [text, key]);
    return spoken;
}
