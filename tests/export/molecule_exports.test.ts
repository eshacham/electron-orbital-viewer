// Task 16b (ruling D5): Molecules mode's exports -- captions, file stems,
// refusal reasons, the PNG's ESP key, cube files and the orbital-table CSV.
// Phase 5's Task 13b did the same for Bonds; this mirrors its tests.

// GLTFExporter ships only as an ES module, which this project's ts-jest cannot
// load (see orbital_controls_factory.ts), so the factory is mocked.
jest.mock('../../src/export/gltf_exporter_factory', () => ({ exportGlb: jest.fn(async () => new ArrayBuffer(12)) }));
// The grids and the basis are fetched outside Redux (grid_cache.ts, loader.ts);
// a cube export reads the same cached copies the view drew from.
jest.mock('../../src/molecules/grid_cache', () => ({ getDensityGrid: jest.fn(), getEspGrid: jest.fn() }));
jest.mock('../../src/molecules/loader', () => ({ ...jest.requireActual('../../src/molecules/loader'), loadBasis: jest.fn() }));

import {
    runExport, exportAvailability, exportItemsFor, moleculeCubeJob, EXPORT_ITEMS, ExportKind,
    PICTURE_BUSY_REASON, NOTHING_DRAWN_REASON, MOLECULE_NONE_REASON, MOLECULE_LOADING_REASON,
} from '../../src/export/run_export';
import { exportFileStem, methodStatement, moleculeDrawnPicture, viewDescription } from '../../src/export/caption';
import { buildCubeBlob, CubeRequest } from '../../src/export/cube_request';
import { setMode } from '../../src/store/atomSlice';
import {
    selectMolecule, metaLoaded, metaFailed, linkRejected, setSurface, renderStarted, renderFinished, renderFailed, MoleculeSurface,
} from '../../src/store/moleculeSlice';
import { getDensityGrid, getEspGrid } from '../../src/molecules/grid_cache';
import { loadBasis } from '../../src/molecules/loader';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';
import type { MoleculeBasis } from '../../src/molecules/types';
import { makeStore, baseContext, readText, exportHandle, octahedron } from './fixtures';
import { waterMeta } from '../molecules/fixtures';

const OZONE_CAVEAT = 'Ozone has strong multireference character: single-reference B3LYP overestimates its dipole moment.';
const water = (overrides: Record<string, unknown> = {}) => waterMeta({
    method: { density: 'B3LYP/def2-TZVPD', energies: 'B3LYP/def2-TZVPD' }, ...overrides,
});
const ozone = () => water({ id: 'o3', name: 'Ozone', formula: 'O3', caveat: OZONE_CAVEAT });
const ALL_KINDS: ExportKind[] = ['png', 'png-plain', 'csv', 'stl', 'glb', 'cube'];
const PICTURE_KINDS: ExportKind[] = ['png', 'png-plain', 'stl', 'glb', 'cube'];

/** Molecules mode with `meta` chosen and loaded, nothing rendered yet. */
function loadedStore(meta: LibraryMoleculeMeta = water()) {
    const store = makeStore();
    store.dispatch(setMode('molecule'));
    store.dispatch(selectMolecule({ id: meta.id }));
    store.dispatch(metaLoaded({ id: meta.id, meta }));
    return store;
}

/** ...and `surface` drawn and landed, as useMoleculeView reports it. */
function drawnStore(surface: MoleculeSurface, meta: LibraryMoleculeMeta = water(), isoLevel = surface.kind === 'esp' ? 0.001 : 0.00231) {
    const store = loadedStore(meta);
    store.dispatch(setSurface(surface));
    store.dispatch(renderStarted('Loading…'));
    store.dispatch(renderFinished({
        isoLevel, espRange: surface.kind === 'esp' ? [-0.061, 0.071] : undefined,
        drawn: { id: meta.id, surface, enclosedFraction: store.getState().orbital.enclosedFraction },
    }));
    return store;
}

function fakeCubeWorker() {
    const posted: CubeRequest[] = [];
    const worker = {
        onmessage: null as unknown, onerror: null, onmessageerror: null, terminate: jest.fn(),
        postMessage(request: CubeRequest) {
            posted.push(request);
            setTimeout(() => (this.onmessage as ((e: { data: unknown }) => void) | null)?.({ data: { type: 'success', blob: buildCubeBlob(request), requestId: request.requestId } }));
        },
    };
    return { posted, create: () => worker as never };
}

const WATER_BASIS = { id: 'h2o', spherical: true, convention: 'pyscf', atoms: [], nao: 1, shells: [], orbitals: [] } as unknown as MoleculeBasis;
const smallGrid = (values: number[]) => ({
    kind: 'grid', id: 'density:h2o', quantity: 'density', shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: Float32Array.from(values),
});

beforeEach(() => {
    jest.clearAllMocks();
    (getDensityGrid as jest.Mock).mockResolvedValue(smallGrid([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
    (getEspGrid as jest.Mock).mockResolvedValue({ shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: Float32Array.from([-0.04, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 14.2]) });
    (loadBasis as jest.Mock).mockResolvedValue(WATER_BASIS);
});

describe('moleculeDrawnPicture: what was rendered, never what is merely selected', () => {
    it('describes the landed surface with its contour, method and geometry source', () => {
        expect(moleculeDrawnPicture(drawnStore({ kind: 'mo', index: 4 }).getState())).toEqual({
            id: 'h2o', name: 'Water', formula: 'H2O',
            surface: { mo: 4, label: '1b1', role: 'HOMO', energyHartree: -0.31 },
            enclosedFraction: 0.9, isoLevel: 0.00231,
            method: 'B3LYP/def2-TZVPD', geometrySource: 'experiment (CCCBDB)',
        });
        expect(moleculeDrawnPicture(drawnStore({ kind: 'esp' }, ozone()).getState())).toEqual(expect.objectContaining({
            surface: 'esp', caveat: OZONE_CAVEAT,
        }));
    });

    it('is null while a molecule is chosen but nothing has landed, or while the next render is in flight', () => {
        expect(moleculeDrawnPicture(loadedStore().getState())).toBeNull();
        const store = drawnStore({ kind: 'density' });
        store.dispatch(setSurface({ kind: 'esp' }));
        store.dispatch(renderStarted('Mapping the potential on Water…'));
        expect(moleculeDrawnPicture(store.getState())).toBeNull();
    });
});

describe('captions and file stems', () => {
    it('water, density: the enclosed fraction and the ρ it produced', () => {
        const state = drawnStore({ kind: 'density' }).getState();
        expect(viewDescription(state)).toBe('Water (H₂O), density, 90 % enclosed (ρ = 2.31e-3 e/a₀³)');
        expect(methodStatement(state)).toBe('B3LYP/def2-TZVPD (PySCF); geometry: experiment (CCCBDB)');
        expect(exportFileStem(state)).toBe('orbital-viewer_H2O_density-90');
    });

    // Preflight D15 (ruling 16b): a computed molecule's picture says what it
    // is, so it can never be passed off as a validated one.
    it('a computed molecule states its tier; a validated one says nothing extra', () => {
        const computed = drawnStore({ kind: 'density' }, water({ tier: 'computed' })).getState();
        expect(methodStatement(computed)).toBe(
            'B3LYP/def2-TZVPD (PySCF); geometry: experiment (CCCBDB); computed on request, not benchmarked against experiment');
        expect(methodStatement(drawnStore({ kind: 'density' }, water({ tier: 'validated' })).getState()))
            .toBe('B3LYP/def2-TZVPD (PySCF); geometry: experiment (CCCBDB)');
    });

    it('water, ESP: the fixed surface and scale', () => {
        const state = drawnStore({ kind: 'esp' }).getState();
        expect(viewDescription(state)).toBe('Water (H₂O), ESP on ρ = 0.001 e/a₀³ surface, ±0.05 Ha/e');
        expect(exportFileStem(state)).toBe('orbital-viewer_H2O_esp');
    });

    it('water, an MO: its label, role and energy', () => {
        const state = drawnStore({ kind: 'mo', index: 4 }).getState();
        expect(viewDescription(state)).toBe('Water (H₂O), MO 1b1 (HOMO), −0.310 Ha (−8.44 eV), 90 % enclosed');
        expect(exportFileStem(state)).toBe('orbital-viewer_H2O_mo4-1b1');
    });

    it('keeps stems ASCII: primes spelled out, a bracketed formula replaced by the id', () => {
        const meta = water({
            id: 'acetone', name: 'Acetone', formula: '(CH3)2CO',
            orbitals: [{ index: 0, label: "10a'", energyHartree: -0.4, occupation: 2 }, { index: 1, label: '2a"', energyHartree: -0.3, occupation: 2, role: 'HOMO' }],
        });
        expect(exportFileStem(drawnStore({ kind: 'mo', index: 0 }, meta).getState())).toBe('orbital-viewer_acetone_mo0-10ap');
        expect(exportFileStem(drawnStore({ kind: 'mo', index: 1 }, meta).getState())).toBe('orbital-viewer_acetone_mo1-2app');
    });

    it('never falls through to Basic Orbitals\' hydrogen wording', () => {
        for (const state of [loadedStore().getState(), drawnStore({ kind: 'esp' }).getState()]) {
            expect(methodStatement(state)).not.toMatch(/hydrogen/i);
            expect(viewDescription(state)).not.toMatch(/Hydrogen/);
            expect(exportFileStem(state)).not.toMatch(/_H_basic/);
        }
    });

    it('puts ozone\'s caveat into the PNG caption', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png']));
        await runExport('png', { ...baseContext(drawnStore({ kind: 'density' }, ozone()).getState()), handle: exportHandle({ capturePng }) });
        expect(capturePng.mock.calls[0][0].caption).toEqual([
            'Ozone (O₃), density, 90 % enclosed (ρ = 2.31e-3 e/a₀³)',
            'B3LYP/def2-TZVPD (PySCF); geometry: experiment (CCCBDB)',
            OZONE_CAVEAT,
        ]);
    });
});

describe('refusal reasons (never the Basic Orbitals fallthrough)', () => {
    const expectAll = (availability: Record<ExportKind, string | null>, kinds: ExportKind[], reason: string | null) => {
        for (const kind of kinds) expect([kind, availability[kind]]).toEqual([kind, reason]);
    };

    it('no molecule chosen', () => {
        const store = makeStore();
        store.dispatch(setMode('molecule'));
        expectAll(exportAvailability(store.getState()), ALL_KINDS, MOLECULE_NONE_REASON);
    });

    it('meta still loading', () => {
        const store = makeStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        expectAll(exportAvailability(store.getState()), ALL_KINDS, MOLECULE_LOADING_REASON);
    });

    it('a load error, in the store\'s own words -- metaFailed\'s and linkRejected\'s', () => {
        const store = makeStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'xyz' }));
        store.dispatch(metaFailed({ id: 'xyz', message: 'HTTP 404' }));
        expectAll(exportAvailability(store.getState()), ALL_KINDS, 'Could not load “xyz”: HTTP 404');
        store.dispatch(linkRejected('nope!'));
        expectAll(exportAvailability(store.getState()), ALL_KINDS, 'This link names no molecule in the library (“nope!”)');
    });

    it('nothing landed yet', () => {
        expectAll(exportAvailability(loadedStore().getState()), PICTURE_KINDS, NOTHING_DRAWN_REASON);
    });

    it('a render in flight refuses every picture export (the orbital table does not depend on it)', async () => {
        const store = drawnStore({ kind: 'density' });
        store.dispatch(setSurface({ kind: 'mo', index: 4 }));
        // The selection is ahead of the picture before the view has even
        // raised its busy label: still refused.
        expectAll(exportAvailability(store.getState()), PICTURE_KINDS, PICTURE_BUSY_REASON);
        store.dispatch(renderStarted('Computing 1b1…'));
        const availability = exportAvailability(store.getState());
        expectAll(availability, PICTURE_KINDS, PICTURE_BUSY_REASON);
        expect(availability.csv).toBeNull();
        await expect(runExport('png', { ...baseContext(store.getState()), handle: exportHandle() })).rejects.toThrow(PICTURE_BUSY_REASON);
    });

    it('a contour change not yet redrawn refuses too (the file\'s link would name the new one)', () => {
        const store = drawnStore({ kind: 'density' });
        const state = store.getState();
        const moved = { ...state, orbital: { ...state.orbital, enclosedFraction: 0.5 } };
        expect(exportAvailability(moved).png).toBe(PICTURE_BUSY_REASON);
    });

    // Task 15's minor: a failed surface switch must never export the surface
    // it was switching away from.
    it('a failed render refuses every picture export, naming the failure', () => {
        const store = drawnStore({ kind: 'density' });
        store.dispatch(setSurface({ kind: 'esp' }));
        store.dispatch(renderStarted('Mapping the potential on Water…'));
        store.dispatch(renderFailed('Could not load /molecules/v2/h2o/esp.bin.gz (HTTP 404)'));
        const availability = exportAvailability(store.getState());
        expectAll(availability, PICTURE_KINDS, 'The surface failed to draw (Could not load /molecules/v2/h2o/esp.bin.gz (HTTP 404)), so there is nothing to export.');
        expect(availability.csv).toBeNull();
    });

    it('offers every kind once a surface has landed', () => {
        expectAll(exportAvailability(drawnStore({ kind: 'esp' }).getState()), ALL_KINDS, null);
    });
});

describe('PNG: the on-screen keys', () => {
    it('draws the ESP colour key, with its scale and method notes, in ESP view', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png']));
        await runExport('png', { ...baseContext(drawnStore({ kind: 'esp' }).getState()), handle: exportHandle({ capturePng }), phaseLegend: true });
        const overlays = capturePng.mock.calls[0][0];
        expect(overlays.phaseLegend).toBe(false);
        expect(overlays.colourBar.ticks).toEqual(['−0.05', '0', '+0.05 Ha/e']);
        expect(overlays.colourBar.colours).toHaveLength(64);
        // Red (negative) on the left, blue (positive) on the right, as on screen.
        expect(overlays.colourBar.colours[0]).toMatch(/^rgb\((1[7-9]\d), /);
        expect(overlays.colourBar.colours[63]).toMatch(/^rgb\(\d{2}, \d+, (1[6-9]\d)\)$/);
        expect(overlays.colourBar.notes).toEqual([
            'red: negative, electron-rich · blue: positive, electron-poor · ±31 kcal/mol',
            'fixed at ρ = 0.001 e/a₀³ (not an enclosed fraction) · B3LYP/def2-TZVPD',
            'this molecule: −0.061 to +0.071 Ha/e, saturated beyond the scale',
        ]);
    });

    it('draws the ψ-sign key for an MO and no key for the density', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png']));
        await runExport('png', { ...baseContext(drawnStore({ kind: 'mo', index: 4 }).getState()), handle: exportHandle({ capturePng }) });
        await runExport('png', { ...baseContext(drawnStore({ kind: 'density' }).getState()), handle: exportHandle({ capturePng }), phaseLegend: true });
        expect([capturePng.mock.calls[0][0].phaseLegend, capturePng.mock.calls[0][0].colourBar]).toEqual([true, null]);
        expect([capturePng.mock.calls[1][0].phaseLegend, capturePng.mock.calls[1][0].colourBar]).toEqual([false, null]);
    });

    it('names the file after the drawn surface', async () => {
        const handle = exportHandle({ capturePng: jest.fn().mockResolvedValue(new Blob(['png'])) });
        expect((await runExport('png', { ...baseContext(drawnStore({ kind: 'esp' }).getState()), handle })).filename).toBe('orbital-viewer_H2O_esp.png');
    });
});

describe('CSV: the orbital table', () => {
    it('lists every orbital with label, role, occupation and energy in Ha and eV, under a header naming the molecule, method and view', async () => {
        const context = { ...baseContext(drawnStore({ kind: 'esp' }, ozone()).getState()), shareUrl: 'http://x/#mode=molecule&id=o3' };
        const result = await runExport('csv', context);
        expect(result.filename).toBe('orbital-viewer_O3_orbitals.csv');
        const lines = (await readText(result.blob)).replace(/^﻿/, '').split('\n');
        expect(lines.slice(0, 5)).toEqual([
            '# Ozone (O₃): molecular orbitals',
            '# method: B3LYP/def2-TZVPD (PySCF); geometry: experiment (CCCBDB)',
            `# ${OZONE_CAVEAT}`,
            '# energies in hartree (Ha) and electronvolts (eV), 1 Ha = 27.211386 eV',
            '# view: http://x/#mode=molecule&id=o3',
        ]);
        expect(lines[5]).toBe('index,label,role,occupation,energy_Ha,energy_eV');
        expect(lines[6]).toBe('0,1a1,,2,-19.13,-520.55381');
        expect(lines[10]).toBe('4,1b1,HOMO,2,-0.31,-8.4355297');
        expect(lines[11]).toBe('5,4a1,LUMO,0,0.01,0.27211386');
        expect(lines).toHaveLength(13);
        expect(lines[12]).toBe('');
    });

    it('quotes a double-primed label rather than breaking the row', async () => {
        const meta = water({ orbitals: [{ index: 0, label: '2a"', energyHartree: -0.3, occupation: 2, role: 'HOMO' }] });
        const text = await readText((await runExport('csv', baseContext(drawnStore({ kind: 'density' }, meta).getState()))).blob);
        expect(text).toContain('\n0,"2a""",HOMO,2,-0.3,');
    });

    it('is labelled "Orbital table (CSV)" in Molecules mode; STL/glTF say the structure is left out', () => {
        const items = exportItemsFor('molecule');
        expect(items.find(i => i.kind === 'csv')?.label).toBe('Orbital table (CSV)');
        expect(items.find(i => i.kind === 'stl')?.detail).toMatch(/ball-and-stick and dipole arrow not included/);
        expect(items.find(i => i.kind === 'glb')?.detail).toMatch(/ball-and-stick and dipole arrow not included/);
        expect(items.map(i => i.kind)).toEqual(EXPORT_ITEMS.map(i => i.kind));
        expect(exportItemsFor('hydrogenic')).toBe(EXPORT_ITEMS);
    });
});

describe('cube', () => {
    it('density: the shipped grid as it is, one atom record per nucleus', async () => {
        const job = await moleculeCubeJob(drawnStore({ kind: 'density' }).getState());
        expect(job.type).toBe('gridCube');
        if (job.type !== 'gridCube') throw new Error('unreachable');
        expect(job.atoms).toEqual(water().atoms.map(a => ({ Z: a.Z, position: a.position })));
        expect(job.description).toMatch(/^rho\(x,y,z\), total electron density, electrons\/bohr\^3/);
        const text = await readText(buildCubeBlob({ ...job, requestId: 1 }));
        const lines = text.split('\n');
        expect(lines[0]).toBe('electron-orbital-viewer: Water (H2O), density, 90 % enclosed (rho = 2.31e-3 e/a03)');
        expect(lines[2]).toBe('    3   -1.000000   -1.000000   -1.000000');
        expect(lines[3]).toBe('    2    2.000000    0.000000    0.000000');
        expect(lines[6]).toBe('    8    8.000000    0.000000    0.000000    0.000000');
        expect(lines[9]).toBe('  1.00000E-01  2.00000E-01');
    });

    it('ESP: the shipped ESP grid, in Ha/e, saying how it was sampled', async () => {
        const job = await moleculeCubeJob(drawnStore({ kind: 'esp' }).getState());
        if (job.type !== 'gridCube') throw new Error('expected a grid cube');
        expect(Array.from(job.grid.values)).toEqual(Array.from(Float32Array.from([-0.04, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 14.2])));
        expect(job.description).toMatch(/electrostatic potential/);
        expect(job.description).toMatch(/Ha\/e/);
        expect(job.description).toMatch(/0\.05 bohr/);
        // Final review M3: the file is the volume grid, not the coloured
        // ρ = 0.001 surface, so its title names the grid (the description
        // still says how the app colours the surface by it).
        expect((await readText(buildCubeBlob({ ...job, requestId: 1 }))).split('\n')[0])
            .toBe('electron-orbital-viewer: Water (H2O) ESP grid (Ha/e), B3LYP/def2-TZVPD');
        expect(job.description).toContain('+/-0.05 Ha/e scale');
        // The on-screen / PNG description is the surface's, unchanged.
        expect(viewDescription(drawnStore({ kind: 'esp' }).getState())).toBe('Water (H₂O), ESP on ρ = 0.001 e/a₀³ surface, ±0.05 Ha/e');
    });

    it('MO: through the cube worker\'s field path, with the basis registered (as the MO render does)', async () => {
        const job = await moleculeCubeJob(drawnStore({ kind: 'mo', index: 4 }).getState());
        if (job.type !== 'fieldCube') throw new Error('expected a field cube');
        expect(job.source.recipe).toEqual({ type: 'gaussianMO', moleculeId: 'h2o', index: 4 });
        expect(job.bases).toEqual([WATER_BASIS]);
        expect(job.resolution).toBe(95);
        expect(job.atoms).toHaveLength(3);
        expect(job.title).toContain('MO 1b1 (HOMO)');
    });

    it('goes through runExport to the worker, named after the drawn surface; ozone\'s caveat in the header', async () => {
        const worker = fakeCubeWorker();
        const result = await runExport('cube', { ...baseContext(drawnStore({ kind: 'esp' }, ozone()).getState()), createCubeWorker: worker.create });
        expect(result.filename).toBe('orbital-viewer_O3_esp.cube');
        expect(worker.posted[0].type).toBe('gridCube');
        expect((await readText(result.blob)).split('\n')[1]).toContain('Ozone has strong multireference character');
    });
});

describe('STL and glTF: the drawn surface only', () => {
    it('glTF\'s description says the structure overlay is not included', async () => {
        const { exportGlb } = jest.requireMock('../../src/export/gltf_exporter_factory');
        const handle = exportHandle({ collectSurfaces: () => [octahedron('surface')] });
        const result = await runExport('glb', { ...baseContext(drawnStore({ kind: 'esp' }).getState()), handle });
        expect(result.filename).toBe('orbital-viewer_H2O_esp.glb');
        const scene = (exportGlb as jest.Mock).mock.calls[0][0];
        expect(scene.children[0].userData.description).toMatch(/ball-and-stick structure and dipole arrow not included/);
    });
});
