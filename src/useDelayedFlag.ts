import { useEffect, useState } from 'react';

/**
 * Follows `active`, but only after it has stayed on for `delayMs`.
 *
 * Used for the busy indicator. Renders land in a few hundred milliseconds, and
 * something that appears and vanishes that fast reads as a flicker rather than
 * feedback — so nothing is shown at all unless the work is actually taking long
 * enough to be worth mentioning. Switching off is immediate: once the work is
 * done there is nothing to report.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
    const [raised, setRaised] = useState(false);

    useEffect(() => {
        if (!active) {
            setRaised(false);
            return;
        }
        const timer = window.setTimeout(() => setRaised(true), delayMs);
        return () => window.clearTimeout(timer);
    }, [active, delayMs]);

    return raised;
}
