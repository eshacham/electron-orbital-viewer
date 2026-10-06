import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { indexFailed, indexLoaded, linkRejected, metaFailed, metaLoaded } from '../store/moleculeSlice';
import { loadMoleculeIndex, loadMoleculeMeta } from './loader';
import { asLibraryMeta } from './library_types';
import { libraryEntries } from './catalogue';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Spec §4.2 "nothing loads until chosen": the index when the mode opens, a
 * meta.json when a molecule is picked. `loadNonce` is a dependency so that
 * re-picking the molecule already chosen loads it again (selectMolecule has
 * just cleared its meta) instead of leaving "loading" up for ever. A reply
 * for a molecule no longer selected is dropped by metaLoaded/metaFailed.
 */
export function useMoleculeLoader(active: boolean): void {
    const dispatch = useAppDispatch();
    const index = useAppSelector(state => state.molecule.index);
    const indexError = useAppSelector(state => state.molecule.indexError);
    const selectedId = useAppSelector(state => state.molecule.selectedId);
    const loadNonce = useAppSelector(state => state.molecule.loadNonce);

    useEffect(() => {
        if (!active || index !== null || indexError) return;
        let cancelled = false;
        loadMoleculeIndex()
            .then(entries => { if (!cancelled) dispatch(indexLoaded(libraryEntries(entries))); })
            .catch(error => { if (!cancelled) dispatch(indexFailed(message(error))); });
        return () => { cancelled = true; };
    }, [active, index, indexError, dispatch]);

    // A link's id passes url_keys' pattern without being in the library: a
    // Bonds diatomic (n2) would load Bonds' meta and fail asLibraryMeta with
    // developer text, an unknown one fail as a bare HTTP 403. Once the index
    // is in, either is refused as the link it is (final review M5); before
    // then, a reply for it lands first and this overwrites its message.
    const isUnknown = (id: string | null) => !!id && index !== null && !index.some(entry => entry.id === id);
    useEffect(() => {
        if (active && isUnknown(selectedId)) dispatch(linkRejected(selectedId!));
        // isUnknown reads index and selectedId, both watched.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, index, selectedId, dispatch]);

    // Read, not watched: the index arriving must not reload a molecule.
    const unknownRef = useRef(isUnknown);
    unknownRef.current = isUnknown;
    useEffect(() => {
        if (!active || !selectedId || unknownRef.current(selectedId)) return;
        const id = selectedId;
        loadMoleculeMeta(id)
            .then(meta => dispatch(metaLoaded({ id, meta: asLibraryMeta(meta) })))
            .catch(error => dispatch(metaFailed({ id, message: message(error) })));
    }, [active, selectedId, loadNonce, dispatch]);
}
