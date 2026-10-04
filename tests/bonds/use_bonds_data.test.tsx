import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../../src/store';
import { selectBondsSystem, restoreBonds } from '../../src/store/bondsSlice';

jest.mock('../../src/molecules/loader', () => ({
    loadScan: jest.fn(), loadMoleculeMeta: jest.fn(), loadBasis: jest.fn(),
}));
import { loadScan, loadMoleculeMeta, loadBasis } from '../../src/molecules/loader';
import { useBondsData } from '../../src/bonds/useBondsData';

const scanOf = (Rs: number[], equilibriumIndex: number, energies: number[] = Rs.map(() => -1), bound = true) => ({
    points: Rs.map((RBohr, index) => ({ index, id: `n2@0${index}`, RBohr, energyHartree: energies[index], dftEnergyHartree: -1, t1Diagnostic: 0.01 })),
    equilibriumIndex,
    fit: { bound },
});
const scan = scanOf([1.8, 2.0, 2.2], 1);

function setup() {
    const store = createAppStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    return { store, wrapper };
}

/** A promise the test settles by hand, to land a response after the selection has moved on. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

beforeEach(() => {
    jest.clearAllMocks();
    (loadScan as jest.Mock).mockResolvedValue(scan);
    (loadMoleculeMeta as jest.Mock).mockImplementation(async (id: string) => ({ id }));
    (loadBasis as jest.Mock).mockImplementation(async (id: string) => ({ id }));
});

describe('useBondsData', () => {
    it('loads nothing for H2+', () => {
        const { wrapper } = setup();
        const { result } = renderHook(() => useBondsData(), { wrapper });
        expect(result.current).toEqual({ scan: null, meta: null, basis: null, loading: false, error: null });
        expect(loadScan).not.toHaveBeenCalled();
    });

    it('snaps a fresh molecule to its equilibrium point and loads that point', async () => {
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.basis).toEqual({ id: 'n2@01' }));
        expect(store.getState().bonds).toMatchObject({ scanIndex: 1, R: 2.0 });
        expect(result.current.meta).toEqual({ id: 'n2@01' });
        expect(result.current.loading).toBe(false);
        expect(loadScan).toHaveBeenCalledWith('n2');
    });

    // Fix round 1, M4: an unbound pair (He₂) has no bond length, and its
    // equilibriumIndex is only a placeholder on the repulsive wall; it opens
    // where its energy is lowest, at van der Waals contact.
    it('opens an unbound pair at its lowest-energy point, not at the placeholder equilibrium', async () => {
        (loadScan as jest.Mock).mockResolvedValue(scanOf([2.4, 3.0, 5.85, 7.2], 1, [-5.75, -5.789, -5.8012274, -5.8012102], false));
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('he2'));
        renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(2));
        expect(store.getState().bonds.R).toBe(5.85);
    });

    it('snaps a restored R to the nearest scan point', async () => {
        const { store, wrapper } = setup();
        store.dispatch(restoreBonds({ system: 'n2', R: 2.19 }));
        renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(2));
        expect(store.getState().bonds.R).toBe(2.2);
    });

    it('reports a failed load', async () => {
        (loadScan as jest.Mock).mockRejectedValue(new Error('Could not load /molecules/n2/scan.json (HTTP 404)'));
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toMatch(/HTTP 404/));
        expect(result.current.loading).toBe(false);
    });

    it("reports a failed point load, and clears it once another point loads", async () => {
        (loadBasis as jest.Mock).mockImplementation(async (id: string) => {
            if (id === 'n2@01') throw new Error('Could not load /molecules/v1/n2/scan/01/basis.json (HTTP 403)');
            return { id };
        });
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toMatch(/HTTP 403/));
        expect(result.current.scan).toBe(scan);
        act(() => { store.dispatch({ type: 'bonds/setScanPoint', payload: { system: 'n2', index: 2, RBohr: 2.2 } }); });
        await waitFor(() => expect(result.current.basis).toEqual({ id: 'n2@02' }));
        expect(result.current.error).toBeNull();
    });

    // Task 8's carry: a scan that lands after the user picked another
    // molecule must not snap that one to the old molecule's points.
    it("does not snap a newly picked molecule to the previous one's late scan", async () => {
        const n2 = deferred<typeof scan>();
        const o2Scan = scanOf([2.0, 2.3, 2.6], 1);
        (loadScan as jest.Mock).mockImplementation((id: string) => (id === 'n2' ? n2.promise : Promise.resolve(o2Scan)));
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        act(() => { store.dispatch(selectBondsSystem('o2')); });
        await waitFor(() => expect(store.getState().bonds.R).toBe(2.3));
        await act(async () => { n2.resolve(scan); });
        expect(store.getState().bonds).toMatchObject({ system: 'o2', scanIndex: 1, R: 2.3 });
        expect(result.current.scan).toBe(o2Scan);
    });

    // Task 8's carry: nearestScanIndex is −1 for an empty scan.
    it('says so, rather than snapping to point −1, when a scan has no points', async () => {
        (loadScan as jest.Mock).mockResolvedValue({ points: [], equilibriumIndex: 0 });
        const { store, wrapper } = setup();
        store.dispatch(restoreBonds({ system: 'n2', R: 2.1 }));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toMatch(/no scan points/));
        expect(store.getState().bonds.scanIndex).toBeNull();
        expect(loadMoleculeMeta).not.toHaveBeenCalled();
    });

    it('reports a scan whose equilibrium index is not one of its points, rather than loading forever', async () => {
        (loadScan as jest.Mock).mockResolvedValue({ ...scan, equilibriumIndex: 3 });
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toMatch(/equilibriumIndex 3 is not one of its 3 scan points/));
        expect(result.current.loading).toBe(false);
        expect(store.getState().bonds.scanIndex).toBeNull();
    });

    it('forgets an old failure as soon as the same molecule is asked for again', async () => {
        const o2 = deferred<typeof scan>();
        const retry = deferred<typeof scan>();
        (loadScan as jest.Mock).mockRejectedValueOnce(new Error('offline'))
            .mockImplementationOnce(() => o2.promise).mockImplementationOnce(() => retry.promise);
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toBe('offline'));
        act(() => { store.dispatch(selectBondsSystem('o2')); });
        act(() => { store.dispatch(selectBondsSystem('n2')); });
        expect(result.current).toMatchObject({ error: null, loading: true });
        await act(async () => { retry.resolve(scan); });
        await waitFor(() => expect(result.current.basis).toEqual({ id: 'n2@01' }));
    });

    it('drops the previous molecule and its error when another is picked', async () => {
        (loadScan as jest.Mock).mockImplementation(async (id: string) => {
            if (id === 'n2') throw new Error('offline');
            return scan;
        });
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toBe('offline'));
        act(() => { store.dispatch(selectBondsSystem('f2')); });
        expect(result.current.error).toBeNull();
        await waitFor(() => expect(result.current.basis).toEqual({ id: 'f2@01' }));
    });
});
