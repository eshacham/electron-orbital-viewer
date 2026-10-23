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
    presentFieldMesh: jest.fn(() => 2), clearFieldMesh: jest.fn(), setMoleculeOverlay: jest.fn(), cancelPendingRender: jest.fn(), frameStructure: jest.fn(),
    pointerRaycaster: jest.fn(), updateFieldInScene: jest.fn(async () => ({ status: 'rendered', isoLevel: 0.02 })),
}));

import { createAppStore } from '../../src/store';
import { selectMolecule, metaLoaded, setSurface, setRepresentation, setShowDipole } from '../../src/store/moleculeSlice';
import { previewCleared, previewResolved } from '../../src/store/jobsSlice';
import { canonicalToBohr } from '../../src/jobs/structure_projection';
import type { CanonicalAtom } from '../../src/jobs/api_types';
import { loadBasis, loadMoleculeIndex, loadMoleculeMeta } from '../../src/molecules/loader';
import { getDensityGrid, getEspGrid } from '../../src/molecules/grid_cache';
import { createGridMeshWorker } from '../../src/workers/createGridMeshWorker';
import {
    cancelPendingRender, clearFieldMesh, frameStructure, presentFieldMesh, setMoleculeOverlay, updateFieldInScene, VisualizerContext,
} from '../../src/orbital_visualizer';
import { overlayExtent } from '../../src/molecules/ball_and_stick';
import type { MoleculeBasis } from '../../src/molecules/types';
import { useMoleculeLoader } from '../../src/molecules/useMoleculeLoader';
import { useMoleculeView } from '../../src/molecules/useMoleculeView';
import { planMoleculeRender } from '../../src/molecules/render_plan';
import { LIBRARY_INDEX, methaneMeta, waterMeta } from './fixtures';

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
function LoaderHarness({ active, indexOnly = false }: { active: boolean; indexOnly?: boolean }) {
    useMoleculeLoader(active, { indexOnly });
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
            colors: ['#ffffff'], memberLabels: ['1b1'], resolution: 95, enclosedFraction: 0.8, label: 'Computing 1b1…',
            // Task 16c (ruling T10-mainbox): an MO is framed for the density's box; this stub basis carries no
            // orbital, so nothing grows the sampling box past it.
            frameBox: 6.43,
            bases: [waterBasis] } });
    });
    // Ruling P8: show=none plans no surface at all -- the mesh is cleared.
    it('plans a clear canvas for no surface', () => {
        expect(planMoleculeRender(waterMeta(), { kind: 'none' }, 0.9)).toEqual({ kind: 'clear' });
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
    // Final review M5: a link naming a Bonds diatomic (n2) or an id the
    // library lacks passes url_keys' pattern; once the index is in, it is
    // refused as a link to nothing in the library -- never Bonds' meta run
    // through asLibraryMeta's developer text, nor a bare "HTTP 403".
    const LINK_REFUSAL = /This link names no molecule in the library/;
    it('refuses a Bonds diatomic or unknown id once the index is in, without fetching it', async () => {
        (loadMoleculeIndex as jest.Mock).mockResolvedValue([...LIBRARY_INDEX, { id: 'n2', name: 'N2', formula: 'N2', category: 'diatomic', tags: [] }]);
        const store = makeStore();
        render(<Provider store={store}><LoaderHarness active /></Provider>);
        await flush();
        for (const id of ['n2', 'zzz']) {
            act(() => { store.dispatch(selectMolecule({ id })); });
            await flush();
            expect(store.getState().molecule.error).toMatch(LINK_REFUSAL);
            expect(store.getState().molecule.error).toContain(`“${id}”`);
            expect(store.getState().molecule.selectedId).toBeNull();
        }
        expect(loadMoleculeMeta).not.toHaveBeenCalled();
    });
    it('refuses it too when the link was applied before the index arrived', async () => {
        const index = deferred<typeof LIBRARY_INDEX>();
        (loadMoleculeIndex as jest.Mock).mockReturnValue(index.promise);
        (loadMoleculeMeta as jest.Mock).mockRejectedValue(new Error('HTTP 403'));
        const store = makeStore();
        store.dispatch(selectMolecule({ id: 'zzz' }));
        render(<Provider store={store}><LoaderHarness active /></Provider>);
        await flush();
        await act(async () => { index.resolve(LIBRARY_INDEX); await index.promise; });
        await flush();
        expect(store.getState().molecule.error).toMatch(LINK_REFUSAL);
        expect(store.getState().molecule.error).not.toMatch(/HTTP 403/);
    });
    it('leaves a library molecule to load as before', async () => {
        (loadMoleculeIndex as jest.Mock).mockResolvedValue(LIBRARY_INDEX);
        (loadMoleculeMeta as jest.Mock).mockResolvedValue(waterMeta());
        const store = makeStore();
        render(<Provider store={store}><LoaderHarness active /></Provider>);
        await flush();
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await flush();
        expect(store.getState().molecule.error).toBeNull();
        expect(store.getState().molecule.meta?.id).toBe('h2o');
    });
});

// Ruling DB4: the top bar's search wants the molecule index outside Molecules
// (spec §8.3) -- the index alone, not a molecule's files or a link's refusal.
describe('useMoleculeLoader: the index alone, for search', () => {
    it('outside Molecules, loads the index without fetching the selected molecule or refusing a link', async () => {
        (loadMoleculeIndex as jest.Mock).mockResolvedValue(LIBRARY_INDEX);
        (loadMoleculeMeta as jest.Mock).mockResolvedValue(waterMeta());
        const store = makeStore();
        store.dispatch(selectMolecule({ id: 'h2o' }));
        const { rerender } = render(<Provider store={store}><LoaderHarness active={false} indexOnly /></Provider>);
        await flush();
        expect(store.getState().molecule.index).toHaveLength(LIBRARY_INDEX.length);
        expect(loadMoleculeMeta).not.toHaveBeenCalled();
        act(() => { store.dispatch(selectMolecule({ id: 'zzz' })); });
        await flush();
        expect(store.getState().molecule.selectedId).toBe('zzz');
        expect(store.getState().molecule.error).toBeNull();
        expect(loadMoleculeMeta).not.toHaveBeenCalled();
        // Entering Molecules then behaves as it always has.
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        rerender(<Provider store={store}><LoaderHarness active indexOnly /></Provider>);
        await flush();
        expect(loadMoleculeIndex).toHaveBeenCalledTimes(1);
        expect(loadMoleculeMeta).toHaveBeenCalledWith('h2o');
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
    // Task 16c fix round 1 (review Minor 3): the density and an orbital are framed for one box -- the density grid's --
    // so moving between them keeps the user's zoom, however far the orbital's own sampling box grows.
    it('frames the density and an orbital for the same box (rulings T10-mainbox, T16c-I1)', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        const { requestId } = worker.postMessage.mock.calls[0][0];
        act(() => { worker.onmessage!({ data: { type: 'success', meshData: meshOf(1), requestId } }); });
        await flush();
        const densityBox = (presentFieldMesh as jest.Mock).mock.calls[0][2].boxRMax;
        expect(densityBox).toBeCloseTo(6.43, 9);
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        await flush();
        expect((updateFieldInScene as jest.Mock).mock.calls.at(-1)[1].frameBox).toBe(densityBox);
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
        // Carry from Task 15 (Task 16b): the orbital's own name, never the
        // busy text, so "Computing…" cannot reach a key or an exported solid.
        expect(request.memberLabels).toEqual(['1b1']);
        expect(store.getState().molecule.isoLevel).toBe(0.02);
        expect(store.getState().molecule.drawn).toEqual({ id: 'h2o', surface: { kind: 'mo', index: 4 }, enclosedFraction: 0.9 });
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
        // The density landed, not the orbital that was cancelled under it.
        expect(store.getState().molecule.drawn).toEqual({ id: 'h2o', surface: { kind: 'density' }, enclosedFraction: 0.9 });
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
    // Final review (cancel line): the MO path awaits loadBasis before its
    // own updateFieldInScene supersedes anything, so a render another mode
    // left in flight could land in that window -- it is cancelled up front,
    // as the grid path's is.
    it('cancels a render already in flight before an orbital waits for its basis', async () => {
        const basis = deferred<MoleculeBasis>();
        (loadBasis as jest.Mock).mockReturnValueOnce(basis.promise);
        const store = makeStore();
        const context = fakeContext();
        render(<Provider store={store}><Harness active context={context} /></Provider>);
        (cancelPendingRender as jest.Mock).mockClear();
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'mo', index: 4 } })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        expect(cancelPendingRender).toHaveBeenCalledWith(context);
        expect(updateFieldInScene).not.toHaveBeenCalled();
        await act(async () => { basis.resolve(waterBasis); await basis.promise; });
        await flush();
        expect(updateFieldInScene).toHaveBeenCalledTimes(1);
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
    // Task 15's carry, fixed in Task 16 (spec §3.5: "never a stale picture"):
    // a surface that fails must not leave the previous one standing beside
    // its error -- the density under an "ESP failed" alert reads as the ESP.
    it('clears the previous surface when the next one fails, and records why', async () => {
        (getEspGrid as jest.Mock).mockRejectedValue(new Error('Could not load /molecules/v2/h2o/esp.bin.gz (HTTP 404)'));
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const context = fakeContext();
        const store = makeStore();
        render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'esp' } })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        (clearFieldMesh as jest.Mock).mockClear();
        const request = worker.postMessage.mock.calls[0][0];
        act(() => { worker.onmessage!({ data: { type: 'success', meshData: meshOf(0.001), requestId: request.requestId } }); });
        await flush();
        expect(presentFieldMesh).not.toHaveBeenCalled();
        expect(clearFieldMesh).toHaveBeenCalledWith(context);
        expect(store.getState().molecule.renderError).toMatch(/HTTP 404/);
        expect(store.getState().molecule.renderLabel).toBeNull();
    });

    // Ruling P8: no surface draws none -- the mesh is cleared, nothing is computed, nothing is said to be
    // busy, and a surface still computing is abandoned.
    it('clears the surface for show=none, cancelling one in flight and starting nothing', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const context = fakeContext();
        const store = makeStore();
        render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        await flush();
        expect(store.getState().molecule.renderLabel).toBe('Loading Water…');
        (clearFieldMesh as jest.Mock).mockClear();
        act(() => { store.dispatch(setSurface({ kind: 'none' })); });
        await flush();
        expect(worker.terminate).toHaveBeenCalled();
        expect(clearFieldMesh).toHaveBeenCalledWith(context);
        expect(createGridMeshWorker).toHaveBeenCalledTimes(1);
        expect(store.getState().molecule.renderLabel).toBeNull();
        expect(store.getState().molecule.drawn).toBeNull();
        // With no surface to fit, the camera fits what is drawn: the overlay on the canvas (ruling T13-I2).
        const overlay = (setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1];
        expect(frameStructure).toHaveBeenCalledTimes(1);
        expect(frameStructure).toHaveBeenCalledWith(context, overlayExtent(overlay));
    });
    // Ruling P8: the overlay follows the representation -- ball and stick (spheres and sticks), space filling
    // (van der Waals spheres only), or no structure at all; the dipole arrow is its own switch either way.
    it('builds the overlay for the representation chosen', async () => {
        const store = makeStore();
        render(<Provider store={store}><Harness active context={fakeContext()} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o', surface: { kind: 'none' } })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        const parts = () => {
            const overlay = (setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1] as import('three').Group;
            const found: string[] = [];
            overlay.traverse(node => { if (node.userData.moleculePart) found.push(node.userData.moleculePart); });
            return { atoms: found.filter(p => p === 'atom').length, bonds: found.filter(p => p === 'bond').length };
        };
        expect(parts()).toEqual({ atoms: 3, bonds: 4 });
        act(() => { store.dispatch(setRepresentation('space-filling')); });
        expect(parts()).toEqual({ atoms: 3, bonds: 0 });
        act(() => { store.dispatch(setRepresentation('none')); });
        expect(parts()).toEqual({ atoms: 0, bonds: 0 });
    });

    // Ruling T13-I2: while no surface is drawn, a representation switch re-frames only when the new
    // structure is bigger -- ball → space keeps the spheres whole, space → ball never zooms in -- and
    // with a surface drawn the structure never moves the camera.
    it('re-frames the structure grow-only while no surface is drawn, and never under a surface', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const context = fakeContext();
        const store = makeStore();
        render(<Provider store={store}><Harness active context={context} /></Provider>);
        // Methane: no dipole arrow (μ = 0), so the overlay is the structure alone.
        act(() => { store.dispatch(selectMolecule({ id: 'ch4', surface: { kind: 'none' } })); store.dispatch(metaLoaded({ id: 'ch4', meta: methaneMeta() })); });
        await flush();
        const lastOverlay = () => (setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1];
        const ballAndStick = overlayExtent(lastOverlay());
        expect((frameStructure as jest.Mock).mock.calls).toEqual([[context, ballAndStick]]);
        act(() => { store.dispatch(setRepresentation('space-filling')); });
        const spaceFilling = overlayExtent(lastOverlay());
        expect(spaceFilling).toBeGreaterThan(ballAndStick);
        expect((frameStructure as jest.Mock).mock.calls).toEqual([[context, ballAndStick], [context, spaceFilling]]);
        act(() => { store.dispatch(setRepresentation('ball-and-stick')); });
        act(() => { store.dispatch(setRepresentation('none')); });
        expect(frameStructure).toHaveBeenCalledTimes(2);
        // Under a surface the surface frames the camera; the structure never does.
        act(() => { store.dispatch(setSurface({ kind: 'density' })); });
        await flush();
        act(() => { store.dispatch(setRepresentation('space-filling')); });
        expect(frameStructure).toHaveBeenCalledTimes(2);
        // Back to no surface: framed afresh to what is drawn now.
        act(() => { store.dispatch(setSurface({ kind: 'none' })); });
        await flush();
        expect((frameStructure as jest.Mock).mock.calls.at(-1)).toEqual([context, spaceFilling]);
    });

    // Task 16 (ruling P12): the request workspace's preview is drawn on the one canvas -- ball and stick
    // of the resolved atoms, centred, no surface and no dipole -- and the molecule's own picture returns
    // when it clears.
    it('draws a request preview as ball and stick with no surface, and restores the molecule after it', async () => {
        const worker = fakeWorker();
        (createGridMeshWorker as jest.Mock).mockReturnValue(worker);
        (getDensityGrid as jest.Mock).mockResolvedValue(densityGrid());
        const context = fakeContext();
        const store = makeStore();
        render(<Provider store={store}><Harness active context={context} /></Provider>);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() })); });
        act(() => { store.dispatch(setShowDipole(true)); });
        await flush();
        expect(createGridMeshWorker).toHaveBeenCalledTimes(1);
        const moleculeOverlay = (setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1] as import('three').Group;
        (clearFieldMesh as jest.Mock).mockClear();
        (frameStructure as jest.Mock).mockClear();

        // Methane-like, off-centre: four H round a C at (5, 5, 5) Å.
        const atoms: CanonicalAtom[] = [[6, 5, 5, 5], [1, 5.63, 5.63, 5.63], [1, 4.37, 4.37, 5.63], [1, 4.37, 5.63, 4.37], [1, 5.63, 4.37, 4.37]];
        act(() => { store.dispatch(previewResolved({ atoms, formula: 'CH4' })); });
        await flush();
        const overlay = (setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1] as import('three').Group;
        expect(overlay === moleculeOverlay).toBe(false);   // (THREE objects are not printable in a failure)
        expect(overlay.children.some(child => child.userData.isBallAndStick)).toBe(true);
        const parts: string[] = [];
        overlay.traverse(node => { if (node.userData.moleculePart) parts.push(node.userData.moleculePart); });
        expect(parts.filter(p => p === 'atom')).toHaveLength(5);
        expect(parts.filter(p => p === 'bond')).toHaveLength(8);
        // No dipole arrow: the overlay is the structure alone.
        expect(overlay.children.length).toBe(1);
        // Centred on its atoms, so the camera turns about the preview itself.
        const carbon = canonicalToBohr(atoms)[0].position;
        const centre = canonicalToBohr(atoms).reduce((sum, a) => sum.map((c, k) => c + a.position[k] / atoms.length), [0, 0, 0]);
        const drawnCarbon: number[][] = [];
        overlay.traverse(node => { if (node.userData.moleculePart === 'atom' && node.userData.index === 0) drawnCarbon.push(node.position.toArray()); });
        expect(drawnCarbon).toHaveLength(1);
        drawnCarbon[0].forEach((c, k) => expect(c).toBeCloseTo(carbon[k] - centre[k], 6));
        // No surface: the field mesh is cleared and nothing new is meshed; the camera frames the preview.
        expect(clearFieldMesh).toHaveBeenCalledWith(context);
        expect(createGridMeshWorker).toHaveBeenCalledTimes(1);
        expect(frameStructure).toHaveBeenLastCalledWith(context, overlayExtent(overlay));

        // Cleared: the molecule's own overlay (with its arrow) and its surface come back.
        act(() => { store.dispatch(previewCleared()); });
        await flush();
        const restored = (setMoleculeOverlay as jest.Mock).mock.calls.at(-1)[1] as import('three').Group;
        expect(restored.children.length).toBe(moleculeOverlay.children.length);
        const restoredParts: string[] = [];
        restored.traverse(node => { if (node.userData.moleculePart) restoredParts.push(node.userData.moleculePart); });
        expect(restoredParts.filter(p => p === 'atom')).toHaveLength(3);
        expect(createGridMeshWorker).toHaveBeenCalledTimes(2);
    });
});
