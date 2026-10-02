import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { energiesStarted, energiesSucceeded, energiesFailed, pictureLanded, selectSpeciesEnergies } from '../store/atomSlice';
import { createAtomWorker } from '../workers/createAtomWorker';
import { AtomWorkerHandle, AtomWorkerMessage } from './useAtomSolver';
import { speciesKey } from './species';
import { getCachedEnergies, setCachedEnergies } from './energies_cache';

const FAILED = 'The ΔSCF calculation failed.';

/**
 * ΔSCF energies for the species on screen, in their own worker.
 *
 * Two extra spin-polarised solves per species -- a second or two for light
 * atoms, tens of seconds for the heaviest -- must never queue in front of the
 * picture (HANDOFF: "a busy SCF worker queues behind an abandoned slow
 * solve"). So this worker is disposable: a species change terminates it and
 * starts a fresh one, and the store drops any reply for a species that is
 * no longer selected (energiesSucceeded checks the key).
 *
 * Nor do they compete with the picture for the CPU (ruling C15): nothing is
 * asked for until the species' own profile has landed. An anion LDA does not
 * bind never lands one, so it is never asked for energies either -- the
 * unbound alert already says why there is nothing to show.
 *
 * Keyed on the species and on whether its picture has landed, never on the
 * enclosed fraction: a fraction change re-solves the picture but leaves the
 * profile in place until the new one replaces it, so the landed flag stays
 * true and the energies (which do not depend on the fraction) carry on.
 *
 * A species computed earlier this session is served from energies_cache.ts
 * without a worker at all: the terminated worker took delta_scf's own
 * memoisation with it, and Na -> Na⁺ -> Na should not cost the ΔSCF twice.
 */
export function useDeltaScfEnergies(createWorker: () => AtomWorkerHandle = createAtomWorker): void {
    const dispatch = useAppDispatch();
    const mode = useAppSelector(state => state.atom.mode);
    const Z = useAppSelector(state => state.atom.Z);
    const charge = useAppSelector(state => state.atom.charge);
    const excitation = useAppSelector(state => state.atom.excitation);
    const landed = useAppSelector(state => pictureLanded(state.atom));
    // A mode switch away and back re-runs the effect below; energies already
    // in hand for this species are kept rather than recomputed.
    const done = useAppSelector(state => selectSpeciesEnergies(state)?.status === 'done');
    const nextRequestId = useRef(0);

    useEffect(() => {
        if (mode !== 'atom' || !landed || done) return;
        const key = speciesKey({ Z, charge, excitation });
        const cached = getCachedEnergies(key);
        if (cached) {
            // Lands as done, which re-runs this effect and stops at `done`.
            dispatch(energiesSucceeded({ speciesKey: key, ...cached }));
            return;
        }
        const requestId = ++nextRequestId.current;
        dispatch(energiesStarted(key));
        const worker = createWorker();
        worker.onmessage = (event: MessageEvent<AtomWorkerMessage>) => {
            const data = event.data;
            if (data.requestId !== requestId) return;
            if (data.type === 'energies') {
                setCachedEnergies(data.speciesKey, { ionisation: data.ionisation, excitation: data.excitation });
                dispatch(energiesSucceeded({ speciesKey: data.speciesKey, ionisation: data.ionisation, excitation: data.excitation }));
            } else {
                // The worker reports every throw from delta_scf -- an
                // unconverged polarised SCF, an anion it cannot bind -- as
                // an 'error' reply rather than crashing (Task 6's carry).
                dispatch(energiesFailed({ speciesKey: key, message: data.type === 'success' ? FAILED : data.message || FAILED }));
            }
            worker.terminate();
        };
        worker.onerror = (event: ErrorEvent) => {
            dispatch(energiesFailed({ speciesKey: key, message: event.message || FAILED }));
            worker.terminate();
        };
        worker.postMessage({ type: 'energies', Z, charge, excitation, requestId });
        return () => { worker.terminate(); };
        // createWorker excluded for the same reason as in useAtomSolver.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, Z, charge, excitation, landed, done, dispatch]);
}
