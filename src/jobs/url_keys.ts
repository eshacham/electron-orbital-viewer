import { registerUrlKeys } from '../url_state';
import type { RootState, AppDispatch } from '../store';
import { jobLinkRejected, selectMolecule } from '../store/moleculeSlice';
import { parseSurface } from '../molecules/url_keys';
import { isJobKey } from '../molecules/job_paths';

/**
 * A computed molecule's link: #mode=molecule&job=<key> (spec §9.1). Anyone
 * can open it -- it reads only the public result files -- so this key is
 * registered for everyone, not just the owner.
 */
export function encodeJobUrl(selectedId: string | null): Record<string, string> {
    return isJobKey(selectedId) ? { job: selectedId } : {};
}

/** The key is hex, which is case-blind (M2): a link that has been upper-cased on its way still names the job. */
export function decodeJobUrl(params: URLSearchParams): string | null {
    const value = params.get('job')?.toLowerCase() ?? null;
    return isJobKey(value) ? value : null;
}

export function registerComputedUrlKeys(): void {
    registerUrlKeys(
        'molecule',
        (state: RootState) => encodeJobUrl(state.molecule.selectedId),
        (params: URLSearchParams, dispatch: AppDispatch) => {
            // Phase 6's own decoder, registered first, has already switched to Molecules mode.
            const raw = params.get('job');
            const key = decodeJobUrl(params);
            if (key) {
                dispatch(selectMolecule({ id: key, surface: parseSurface(params.get('show') ?? undefined) }));
            } else if (raw) {
                // Present but rejected (D14) -- a blank Molecules screen would hide
                // that the link named something (spec §3.5; ruling T12-a's pattern).
                dispatch(jobLinkRejected(raw));
            }
        },
    );
}
