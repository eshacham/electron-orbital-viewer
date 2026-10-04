import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setScanPoint } from '../store/bondsSlice';
import { loadBasis, loadMoleculeMeta, loadScan } from '../molecules/loader';
import { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../molecules/types';
import { BondsSystemId, DiatomicId, nearestScanIndex, pointId } from './systems';

export interface BondsData {
    scan: MoleculeScan | null;
    meta: MoleculeMeta | null;
    basis: MoleculeBasis | null;
    loading: boolean;
    error: string | null;
}

const NOTHING: BondsData = { scan: null, meta: null, basis: null, loading: false, error: null };
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A scan, or the reason there is none, tagged with the molecule it was asked for. */
type ScanResult = { system: BondsSystemId } & ({ scan: MoleculeScan; error: null } | { scan: null; error: string });
/** One scan point's files, or the reason they did not load, tagged with the point id asked for. */
type PointResult = { id: string } & ({ meta: MoleculeMeta; basis: MoleculeBasis; error: null } | { meta: null; basis: null; error: string });

/**
 * What the Bonds selection needs from the molecule data, fetched lazily. Also
 * snaps R to the scan once it is known: to the equilibrium point for a fresh
 * molecule, to the nearest point for an R that came from a URL.
 *
 * Every result is kept with the selection it answers (the system, or the
 * point id), and only a result that matches the current selection is
 * returned. A response that lands after the user has moved on is then
 * harmless: it can neither show the previous molecule's data under the new
 * one's name nor -- the scan snap passes its `system` to setScanPoint, which
 * the slice checks -- snap the new molecule to the old one's points.
 *
 * A failed load is reported here and only here (ruling C9): the panel shows
 * it; nothing is sent to the orbital slice's failure Snackbar, and the canvas
 * keeps the picture it had.
 */
export function useBondsData(): BondsData {
    const dispatch = useAppDispatch();
    const { system, R, scanIndex } = useAppSelector(state => state.bonds);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [pointResult, setPointResult] = useState<PointResult | null>(null);

    useEffect(() => {
        if (system === 'h2plus') return undefined;
        let live = true;
        loadScan(system).then(
            scan => {
                if (!live) return;
                setScanResult(scan.points.length > 0
                    ? { system, scan, error: null }
                    // nearestScanIndex is −1 here (Task 8's carry): nothing to snap to, so say so.
                    : { system, scan: null, error: 'its scan.json lists no scan points' });
            },
            e => { if (live) setScanResult({ system, scan: null, error: message(e) }); },
        );
        return () => { live = false; };
    }, [system]);

    const scan = scanResult?.system === system ? scanResult.scan : null;
    const scanError = scanResult?.system === system ? scanResult.error : null;

    useEffect(() => {
        if (!scan || scanIndex !== null || system === 'h2plus') return;
        const index = R === null ? scan.equilibriumIndex : nearestScanIndex(scan.points, R);
        if (index < 0 || index >= scan.points.length) return;
        dispatch(setScanPoint({ system, index, RBohr: scan.points[index].RBohr }));
    }, [scan, scanIndex, R, system, dispatch]);

    const id = system !== 'h2plus' && scanIndex !== null ? pointId(system as DiatomicId, scanIndex) : null;

    useEffect(() => {
        if (id === null) return undefined;
        let live = true;
        Promise.all([loadMoleculeMeta(id), loadBasis(id)]).then(
            ([meta, basis]) => { if (live) setPointResult({ id, meta, basis, error: null }); },
            e => { if (live) setPointResult({ id, meta: null, basis: null, error: message(e) }); },
        );
        return () => { live = false; };
    }, [id]);

    if (system === 'h2plus') return NOTHING;
    const point = pointResult !== null && pointResult.id === id ? pointResult : null;
    const error = scanError ?? point?.error ?? null;
    return { scan, meta: point?.meta ?? null, basis: point?.basis ?? null, loading: error === null && point === null, error };
}
