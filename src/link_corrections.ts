/**
 * Final polish F1: a link whose values are out of range opens corrected, and says what it corrected. Each decoder
 * (url_state.ts, bonds_url.ts) returns one `LinkCorrection` per value it brought into range; whatever applies a link
 * (main.tsx's boot and Cognito-return reads, useUrlStateSync's hashchange) hands them here, and App's notice reads
 * them -- the same mechanism as the visit level's "Opened at … for this link" (level_pref.ts `setVisitLevel`): module
 * state, in memory only, counted per link so a dismissal belongs to the one link, and replaced by the next link.
 */
export interface LinkCorrection {
    /** The value's plain name, as the notice writes it: 'Z', 'n', 'l', 'mₗ', 'charge', 'R'. */
    field: string;
    /** What the link asked for, as written in it. */
    asked: string;
    /** What is shown instead, as the notice writes it: 'hydrogen (Z = 1)', 'n = 9', 'the whole atom'. */
    used: string;
}

export interface LinkCorrectionsState {
    corrections: readonly LinkCorrection[];
    /** Which link these came from: a new one each time a link brings any correction, so a dismissal is per link. */
    id: number;
}

const NONE: readonly LinkCorrection[] = [];
let state: LinkCorrectionsState = { corrections: NONE, id: 0 };
const listeners = new Set<() => void>();

/** A link's own minus is written as the app writes one (U+2212), so "mₗ = -7" reads like the "mₗ = −1" beside it. */
const asWritten = (asked: string) => asked.replace(/^-/, '−');

/**
 * One sentence for every correction, joined with "; ": "This link asked for Z = 200; showing hydrogen (Z = 1)." or
 * "This link asked for Z = 200; showing hydrogen (Z = 1); asked for n = 12; showing the whole atom."
 */
export function linkCorrectionText(corrections: readonly LinkCorrection[]): string {
    const clauses = corrections.map(({ field, asked, used }) => `asked for ${field} = ${asWritten(asked)}; showing ${used}`);
    return `This link ${clauses.join('; ')}.`;
}

/** The corrections the link just applied brought, replacing the last link's: an empty list takes its notice away. */
export function setLinkCorrections(corrections: readonly LinkCorrection[]): void {
    if (corrections.length === 0 && state.corrections.length === 0) return;
    state = corrections.length === 0
        ? { corrections: NONE, id: state.id }
        : { corrections: [...corrections], id: state.id + 1 };
    listeners.forEach(listener => listener());
}

export function clearLinkCorrections(): void {
    setLinkCorrections(NONE);
}

/** The current corrections and the link they came from: one object per change, for useSyncExternalStore. */
export function linkCorrections(): LinkCorrectionsState {
    return state;
}

export function subscribeLinkCorrections(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
