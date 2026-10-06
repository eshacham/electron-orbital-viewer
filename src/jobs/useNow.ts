import { useEffect, useState } from 'react';

/** The time, re-read every second while `ticking`: an elapsed-time readout that moves between 5 s polls. */
export function useNow(ticking: boolean, intervalMs = 1000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!ticking) return undefined;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(id);
    }, [ticking, intervalMs]);
    return now;
}
