// tests/molecules/molecule_hooks.test.tsx
import React, { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/molecules/loader', () => ({
    loadMoleculeIndex: jest.fn(), loadMoleculeMeta: jest.fn(), loadDensityGrid: jest.fn(), loadBasis: jest.fn(),
}));
jest.mock('../../src/molecules/grid_cache', () => ({ getDensityGrid: jest.fn(), getEspGrid: jest.fn() }));
jest.mock('../../src/workers/createGridMeshWorker', () => ({ createGridMeshWorker: jest.fn() }));
jest.mock('../../src/orbital_visualizer', () => ({
    presentFieldMesh: jest.fn(() => 2), clearFieldMesh: jest.fn(), setMoleculeOverlay: jest.fn(), cancelPendingRender: jest.fn(),
    pointerRaycaster: jest.fn(), updateFieldInScene: jest.fn(async () => ({ status: 'rendered', isoLevel: 0.02 })),
}));

import { createAppStore } from '../../src/store';
import { selectMolecule, metaLoaded, setSurface } from '../../src/store/moleculeSlice';
import { loadBasis, loadMoleculeIndex, loadMoleculeMeta } from '../../src/molecules/loader';
import { getDensityGrid, getEspGrid } from '../../src/molecules/grid_cache';
import { createGridMeshWorker } from '../../src/workers/createGridMeshWorker';
import {
    cancelPendingRender, presentFieldMesh, setMoleculeOverlay, updateFieldInScene, VisualizerContext,
} from '../../src/orbital_visualizer';
import type { MoleculeBasis } from '../../src/molecules/types';
import { useMoleculeLoader } from '../../src/molecules/useMoleculeLoader';
import { useMoleculeView } from '../../src/molecules/useMoleculeView';
import { planMoleculeRender } from '../../src/molecules/render_plan';
import { LIBRARY_INDEX, waterMeta } from './fixtures';

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
// D36: the app's own store, so the hooks see the state shape they will in the app.
const makeStore = () => createAppStore();
const fakeContext = () => ({ renderer: { domElement: document.createElement('canvas') }, isDisposed: false, moleculeOverlay: null }) as unknown as VisualizerContext;
const waterBasis = { id: 'h2o', spherical: true, convention: 'pyscf', atoms: [], nao: 58, shells: [], orbitals: [] } as unknown as MoleculeBasis;

function fakeWorker() {
    return { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as null | ((e: { data: unknown }) => void), onerror: null };
}
const meshOf = (tag: number) => ({ positions: [[0, 0, 0]], cells: [], psiSigns: [1], densityMap: { data: new Uint8Array(1), side: 1, rMax: 6 }, isoLevel: tag });
const densityGrid = () => ({ values: new Float32Array(8), shape: [2, 2, 2] });

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

// Separate harnesses: with the loader running, the view tests' selections would trigger meta loads and extra renders.
function LoaderHarness({ active }: { active: boolean }) {
    useMoleculeLoader(active);
    return null;
}
function Harness({ active, fraction = 0.9, context }: { active: boolean; fraction?: number; context: VisualizerContext }) {
    const ref = useRef<VisualizerContext | null>(context);
    useMoleculeView(ref, active, fraction);
    return null;
}
function AppHarness({ context }: { context: VisualizerContext }) {
    useMoleculeLoader(true);
    const ref = useRef<VisualizerContext | null>(context);
    useMoleculeView(ref, true, 0.9);
    return null;
}

beforeEach(() => {
    jest.clearAllMocks();
    (loadBasis as jest.Mock).mockResolvedValue(waterBasis);
});

describe('planMoleculeRender', () => {
    it('meshes the grid, fixing the ESP surface at ρ = 0.001, and sends MOs as gaussianMO sources at 96³ with their basis', () => {
        const meta = waterMeta();
        expect(planMoleculeRender(meta, { kind: 'density' }, 0.9)).toEqual({ kind: 'grid', fraction: 0.9, colourByEsp: false, label: 'Loading Water…' });
        expect(planMoleculeRender(meta, { kind: 'esp' }, 0.9)).toEqual(expect.objectContaining({ fraction: 'espSurface', colourByEsp: true }));
        const mo = planMoleculeRender(meta, { kind: 'mo', index: 4 }, 0.8, waterBasis);
        expect(mo).toEqual({ kind: 'mo', label: 'Computing 1b1…', request: {
            sources: [{ kind: 'analytic', id: 'gaussianMO:h2o:4', recipe: { type: 'gaussianMO', moleculeId: 'h2o', index: 4 }, rMax: 6.43 }],
            colors: ['#ffffff'], memberLabels: ['Computing 1b1…'], resolution: 95, enclosedFraction: 0.8, label: 'Computing 1b1…',
            bases: [waterBasis] } });
    });
});

describe('useMoleculeLoader', () => {
    it('loads nothing until the mode is active, then only the index; meta only once chosen', async () => {
        (loadMoleculeIndex as jest.Mock).mockResolvedValue([...LIBRARY_INDEX, { id: 'h2', name: 'H2', formula: 'H2', category: 'diatomic', tags: [] }]);
        (loadMoleculeMeta as jest.Mock).mockResolvedValue(waterMeta());
        const store = makeStore();
        const { rerender } = render(<Provider store={store}><LoaderHarness active={false} /></Provider>);
        await flush();
        expect(loadMoleculeIndex).not.toHaveBeenCalled();
        rerender(<Provider store={store}><LoaderHarness active /></Provider>);
        await flush();
        expect(store.getState().molecule.index).toHaveLength(25);
        expect(loadMoleculeMeta).not.toHaveBeenCalled();
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await flush();
        expect(loadMoleculeMeta).toHaveBeenCalledWith('h2o');
        expect(store.getState().molecule.meta?.id).toBe('h2o');
    });
    it('says so when a meta.json predates the library, rather than drawing it', async () => {
        (loadMoleculeIndex as jest.Mock).mockResolvedValue(LIBRARY_INDEX);
        (loadMoleculeMeta as jest.Mock).mockResolvedValue(waterMeta({ espGrid: undefined }));
        const store = makeStore();
        render(<Provider store={store}><LoaderHarness active /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await flush();
        expect(store.getState().molecule.meta).toBeNull();
        expect(store.getState().molecule.error).toMatch(/Could not load “h2o”: h2o: meta.json has no espGrid/);
    });
});

describe('useMoleculeView', () => {
    it('never presents a superseded mesh', async () => {
        const workers = [fakeWorker(), fakeWorker()];
        (createGridMeshWorker as jest.Mock).mockReturnValueOnce(workers[0]).mockReturnValueOnce(workers[1]);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); store.dispatch(metaLoaded({ id: 'nh3', meta: waterMeta({ id: 'nh3', name: 'Ammonia' }) })); });
        await flush();
        const [first, second] = workers.map(w => w.postMessage.mock.calls[0][0].requestId);
        act(() => { workers[0].onmessage!({ data: { type: 'success', meshData: meshOf(1), requestId: first } }); });
        await flush();
        expect(presentFieldMesh).not.toHaveBeenCalled();
        act(() => { workers[1].onmessage!({ data: { type: 'success', meshData: meshOf(2), requestId: second } }); });
        await flush();
        expect(presentFieldMesh).toHaveBeenCalledTimes(1);
        expect((presentFieldMesh as jest.Mock).mock.calls[0][1].isoLevel).toBe(2);
        expect(store.getState().molecule.renderLabel).toBeNull();
    });
    it('never presents a superseded surface: density switched to ESP mid-render shows only the ESP map', async () => {
        const workers = [fakeWorker(), fakeWorker()];
        (createGridMeshWorker as jest.Mock).mockReturnValueOnce(workers[0]).mockReturnValueOnce(workers[1]);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        (getEspGrid as jest.Mock).mockResolvedValue({ shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: new Float32Array(8).fill(0.01) });
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
        await flush();
        expect(workers[0].terminate).toHaveBeenCalled();
        const [first, second] = workers.map(w => w.postMessage.mock.calls[0][0]);
        expect(first.enclosedFraction).toBe(0.9);
        expect(second.isoValue).toBe(0.001);
        act(() => { workers[0].onmessage!({ data: { type: 'success', meshData: meshOf(0.03), requestId: first.requestId } }); });
        await flush();
        expect(presentFieldMesh).not.toHaveBeenCalled();
        act(() => { workers[1].onmessage!({ data: { type: 'success', meshData: meshOf(0.001), requestId: second.requestId } }); });
        await flush();
        expect(presentFieldMesh).toHaveBeenCalledTimes(1);
        expect((presentFieldMesh as jest.Mock).mock.calls[0][2].vertexColors).toHaveLength(3);
        expect(store.getState().molecule.isoLevel).toBe(0.001);
    });
    it('re-picking the molecule being drawn reloads it rather than hanging (loadNonce)', async () => {
        const workers = [fakeWorker(), fakeWorker()];
        (createGridMeshWorker as jest.Mock).mockReturnValueOnce(workers[0]).mockReturnValueOnce(workers[1]);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        (loadMoleculeIndex as jest.Mock).mockResolvedValue(LIBRARY_INDEX);
        // The loader's own cache hands back the very same meta object for a repeated id.
        const meta = waterMeta();
        (loadMoleculeMeta as jest.Mock).mockResolvedValue(meta);
        const store = makeStore();
        render(<Provider store={store}><AppHarness context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await flush();
        expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await flush();
        expect(loadMoleculeMeta).toHaveBeenCalledTimes(2);
        expect(workers[0].terminate).toHaveBeenCalled();
        expect(workers[1].postMessage).toHaveBeenCalledTimes(1);
        const request = workers[1].postMessage.mock.calls[0][0];
        act(() => { workers[1].onmessage!({ data: { type: 'success', meshData: meshOf(5), requestId: request.requestId } }); });
        await flush();
        expect(presentFieldMesh).toHaveBeenCalledTimes(1);
        expect(store.getState().molecule.renderLabel).toBeNull();
        expect(store.getState().molecule.isoLevel).toBe(5);
    });
    it('colours the ESP surface, drawn exactly at ρ = 0.001, and records the range drawn', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue({ values: new Float32Array([1, 0.0005, 0, 0, 0, 0, 0, 0]), shape: [2, 2, 2] });
        (getEspGrid as jest.Mock).mockResolvedValue({ shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: new Float32Array(8).fill(-0.02) });
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'esp' } })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        const request = worker.postMessage.mock.calls[0][0];
        expect(request.isoValue).toBe(0.001);
        expect(request.enclosedFraction).toBeUndefined();
        act(() => { worker.onmessage!({ data: { type: 'success', meshData: meshOf(0.001), requestId: request.requestId } }); });
        await flush();
        const options = (presentFieldMesh as jest.Mock).mock.calls[0][2];
        expect(options.vertexColors).toHaveLength(3);
        expect(options.boxRMax).toBeCloseTo(6.43, 9);
        expect(store.getState().molecule.espRange?.[0]).toBeCloseTo(-0.02, 6);
    });
    it('draws an orbital through updateFieldInScene with its basis, and the overlay follows the mode', async () => {
        const context = fakeContext();
        const store = makeStore();
        const { rerender } = render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        await flush();
        expect(loadBasis).toHaveBeenCalledWith('h2o');
        const request = (updateFieldInScene as jest.Mock).mock.calls.at(-1)[1];
        expect(request.sources[0].recipe).toEqual({ type: 'gaussianMO', moleculeId: 'h2o', index: 4 });
        expect(request.bases).toEqual([waterBasis]);
        expect(request.memberLabels).toEqual(['Computing 1b1…']);
        expect(store.getState().molecule.isoLevel).toBe(0.02);
        expect((setMoleculeOverlay as jest.Mock).mock.calls.some(call => call[1] !== null)).toBe(true);
        rerender(<Provider store={store}><Harness active={false} context={context} /></Provider>);
        expect((setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1]).toBeNull();
    });
    it('a slow orbital cannot land over the density asked for after it (cancelPendingRender)', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const slowMo = deferred<{ status: 'rendered'; isoLevel: number }>();
        const store = makeStore();
        const context = fakeContext();
        render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'mo', index: 4 } })); });
        (updateFieldInScene as jest.Mock).mockImplementationOnce(() => slowMo.promise);
        act(() => { store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        expect(updateFieldInScene).toHaveBeenCalledTimes(1);
        expect(store.getState().molecule.renderLabel).toBe('Computing 1b1…');
        (cancelPendingRender as jest.Mock).mockClear();
        act(() => { store.dispatch(setSurface({ kind: 'density' })); });
        expect(cancelPendingRender).toHaveBeenCalledWith(context);
        await flush();
        // The orbital's own reply, arriving late, must not finish the density's render.
        await act(async () => { slowMo.resolve({ status: 'rendered', isoLevel: 0.5 }); });
        await flush();
        expect(store.getState().molecule.renderLabel).toBe('Loading Water…');
        expect(store.getState().molecule.isoLevel).not.toBe(0.5);
        const request = worker.postMessage.mock.calls[0][0];
        act(() => { worker.onmessage!({ data: { type: 'success', meshData: meshOf(0.03), requestId: request.requestId } }); });
        await flush();
        expect(store.getState().molecule.isoLevel).toBe(0.03);
        expect(store.getState().molecule.renderLabel).toBeNull();
    });
    // Ruling D38: a terminated worker never replies, so cleanup itself must take the busy label down.
    it('leaving the mode mid-mesh cancels the worker and never leaves the busy label up', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const store = makeStore();
        const context = fakeContext();
        const { rerender } = render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        expect(store.getState().molecule.renderLabel).toBe('Loading Water…');
        rerender(<Provider store={store}><Harness active={false} context={context} /></Provider>);
        await flush();
        expect(worker.terminate).toHaveBeenCalled();
        expect(store.getState().molecule.renderLabel).toBeNull();
        expect(store.getState().molecule.renderError).toBeNull();
        const request = worker.postMessage.mock.calls[0][0];
        act(() => { worker.onmessage!({ data: { type: 'success', meshData: meshOf(1), requestId: request.requestId } }); });
        await flush();
        expect(presentFieldMesh).not.toHaveBeenCalled();
    });
    it('leaving the mode mid-orbital stops the orbital worker and never leaves the busy label up', async () => {
        (updateFieldInScene as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
        const store = makeStore();
        const context = fakeContext();
        const { rerender } = render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'mo', index: 4 } })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        expect(store.getState().molecule.renderLabel).toBe('Computing 1b1…');
        (cancelPendingRender as jest.Mock).mockClear();
        rerender(<Provider store={store}><Harness active={false} context={context} /></Provider>);
        await flush();
        expect(cancelPendingRender).toHaveBeenCalledWith(context);
        expect(store.getState().molecule.renderLabel).toBeNull();
    });
});
