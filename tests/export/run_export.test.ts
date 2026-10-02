// GLTFExporter ships only as an ES module, which this project's ts-jest cannot
// load (see orbital_controls_factory.ts), so the factory is mocked.
jest.mock('../../src/export/gltf_exporter_factory', () => ({ exportGlb: jest.fn(async () => new ArrayBuffer(12)) }));

import { runExport, exportAvailability, WAITING_FOR_ATOM_REASON, NOTHING_DRAWN_REASON, PICTURE_BUSY_REASON, VIEW_NOT_READY_REASON, RENDER_FAILED_REASON } from '../../src/export/run_export';
import { setMode, drillToShell, drillToSubshell, drillToOrbital, solveStarted } from '../../src/store/atomSlice';
import { setCombination, startOrbitalCalculation, failOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { selectionProblem } from '../../src/combinations';
import { NOTHING_TO_EXPORT_REASON } from '../../src/export/surfaces';
import { makeStore, neonStore, readText, baseContext, octahedron, exportHandle } from './fixtures';

// Fix round 1, M3: startOrbitalCalculation sets currentParams before the
// render finishes, and failOrbitalCalculation does not clear it back out --
// so without this check, every export kind read a failed request as "drawn"
// and would have tried (and for PNG/STL/glTF, mostly succeeded, misleadingly)
// to export the picture that failed to appear.
describe('exportAvailability and runExport: a render that failed', () => {
    it('refuses every kind with a stated reason, even though currentParams is still set from the failed request', async () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        store.dispatch(failOrbitalCalculation('worker crashed'));
        const state = store.getState();
        expect(state.orbital.currentParams).not.toBeNull();
        expect(state.orbital.renderFailed).toBe(true);

        const availability = exportAvailability(state);
        expect(availability.csv).toBe(RENDER_FAILED_REASON);
        expect(availability.png).toBe(RENDER_FAILED_REASON);
        expect(availability['png-plain']).toBe(RENDER_FAILED_REASON);
        expect(availability.stl).toBe(RENDER_FAILED_REASON);
        expect(availability.glb).toBe(RENDER_FAILED_REASON);
        expect(availability.cube).toBe(RENDER_FAILED_REASON);

        await expect(runExport('csv', baseContext(state))).rejects.toThrow(RENDER_FAILED_REASON);
    });
});

describe('exportAvailability: a failed orbital render in atom mode', () => {
    // Re-review of M3: atom mode's level 3 renders through the same orbital
    // request, so its failure must refuse too -- but only at that level.
    it('refuses at the orbital level, and not once back at a shell view', () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        store.dispatch(drillToSubshell(2, 1));
        store.dispatch(drillToOrbital(2, 1, 0));
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        store.dispatch(failOrbitalCalculation('worker crashed'));
        expect(exportAvailability(store.getState()).png).toBe(RENDER_FAILED_REASON);
        expect(exportAvailability(store.getState()).cube).toBe(RENDER_FAILED_REASON);

        store.dispatch(drillToShell(2));
        expect(exportAvailability(store.getState()).png).toBeNull();
    });

    // Final review M6: the plot at the orbital level is the subshell's D(r)
    // from the solved profile, which a failed 3D render does not touch.
    it('still offers CSV at the orbital level, whose curves come from the solved profile', async () => {
        const store = neonStore();
        store.dispatch(drillToOrbital(2, 1, 0));
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        store.dispatch(failOrbitalCalculation('worker crashed'));
        expect(exportAvailability(store.getState()).csv).toBeNull();
        const csvCurves = [{ label: '2p', points: [{ r: 1, value: 0.5 }] }];
        const result = await runExport('csv', { ...baseContext(store.getState()), csvCurves });
        expect(await readText(result.blob)).toContain('0.5');
    });
});

describe('runExport: PNG', () => {
    it('asks the viewer for an image, with the caption and method, or without overlays', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(neonStore().getState()), handle: exportHandle({ capturePng }), phaseLegend: false };
        expect((await runExport('png', context)).filename).toBe('orbital-viewer_Ne_atom.png');
        expect(capturePng).toHaveBeenLastCalledWith({ caption: ['Neon (Ne, Z = 10), whole atom, 90% contour', expect.stringMatching(/^central-field SCF/)], phaseLegend: false });
        expect((await runExport('png-plain', context)).filename).toBe('orbital-viewer_Ne_atom_view.png');
        expect(capturePng).toHaveBeenLastCalledWith(null);
    });

    it('says so when the 3D view is not ready', async () => {
        await expect(runExport('png', baseContext(neonStore().getState()))).rejects.toThrow(VIEW_NOT_READY_REASON);
    });

    // Ruling C5: App shows a combination colour key instead of the plain
    // ψ-sign key when more than one source is overlaid (its
    // combinationLegend); the PNG must carry the same key, so it describes
    // what it shows rather than only ever naming ψ's sign.
    it('carries the combination colour key through to the capture, when App has one on screen (ruling C5)', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const combinationLegend = [{ label: 'h₁', color: '#20c020' }, { label: 'h₂', color: '#c02020' }];
        const context = {
            ...baseContext(neonStore().getState()),
            handle: exportHandle({ capturePng }),
            phaseLegend: false,
            combinationLegend,
        };
        await runExport('png', context);
        expect(capturePng).toHaveBeenLastCalledWith(expect.objectContaining({ combinationLegend }));
    });

    it('never asks for a combination key when App has none (plain ψ key, or nothing overlaid)', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(neonStore().getState()), handle: exportHandle({ capturePng }), phaseLegend: true };
        await runExport('png', context);
        expect(capturePng).toHaveBeenLastCalledWith({ caption: expect.any(Array), phaseLegend: true });
    });

    // I3: a PNG photographs whatever the canvas currently shows, unlike CSV
    // (whose curves are read fresh off the store at click time) -- so it
    // must refuse in every case CSV refuses (drawnReason), and also while a
    // fresh computation is in flight, when the canvas still shows the old
    // picture under a caption that already names the new one.
    describe('refuses like CSV, and also while busy (ruling I3)', () => {
        it('refuses before the atom has solved, same reason as CSV', async () => {
            const capturePng = jest.fn();
            const context = { ...baseContext(makeStore().getState()), handle: exportHandle({ capturePng }), phaseLegend: false };
            expect(exportAvailability(makeStore().getState()).png).toBe(WAITING_FOR_ATOM_REASON);
            await expect(runExport('png', context)).rejects.toThrow(WAITING_FOR_ATOM_REASON);
            expect(capturePng).not.toHaveBeenCalled();
        });

        it('refuses with a refused combination\'s own reason, same as CSV', async () => {
            const store = makeStore();
            store.dispatch(setMode('hydrogenic'));
            const combination = { kind: 'field' as const, level: 2 as const, field: 0.01, stark: 'lower' as const };
            store.dispatch(setCombination(combination));
            const capturePng = jest.fn();
            const context = { ...baseContext(store.getState()), handle: exportHandle({ capturePng }), phaseLegend: false };
            const reason = selectionProblem(combination)!;
            expect(exportAvailability(store.getState()).png).toBe(reason);
            await expect(runExport('png', context)).rejects.toThrow(reason);
            expect(capturePng).not.toHaveBeenCalled();
        });

        it('refuses while a fresh solve is in flight, even though the old profile is still what is drawn', async () => {
            const store = neonStore();
            store.dispatch(solveStarted()); // e.g. re-solving a new element -- Neon's profile is still on screen
            // CSV is unaffected: its curves are read fresh at click time, and the (stale) profile is still there to read.
            expect(exportAvailability(store.getState()).csv).toBeNull();
            expect(exportAvailability(store.getState()).png).toBe(PICTURE_BUSY_REASON);
            expect(exportAvailability(store.getState())['png-plain']).toBe(PICTURE_BUSY_REASON);
            const capturePng = jest.fn();
            const context = { ...baseContext(store.getState()), handle: exportHandle({ capturePng }), phaseLegend: false };
            await expect(runExport('png', context)).rejects.toThrow(PICTURE_BUSY_REASON);
            await expect(runExport('png-plain', context)).rejects.toThrow(PICTURE_BUSY_REASON);
            expect(capturePng).not.toHaveBeenCalled();
        });
    });
});

describe('runExport: CSV', () => {
    it('writes the plotted curves with what they are and how they were computed', async () => {
        const context = { ...baseContext(neonStore().getState()), csvCurves: [{ label: 'n=1', points: [{ r: 0.1, value: 1 }, { r: 0.2, value: 2 }] }] };
        const result = await runExport('csv', context);
        expect(result.filename).toBe('orbital-viewer_Ne_atom.csv');
        const text = await readText(result.blob);
        expect(text).toContain('# Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(text).toContain('# quantity: D(r) = 4*pi*r^2*rho(r)');
        expect(text).toContain('# method: central-field SCF');
        expect(text).toContain('# view: http://x/#mode=atom&Z=10');
        expect(text).toContain('r_bohr,n=1\n0.1,1\n0.2,2\n');
    });

    it('refuses, with the reason, before the atom is solved', async () => {
        const state = makeStore().getState();
        expect(exportAvailability(state).csv).toBe(WAITING_FOR_ATOM_REASON);
        await expect(runExport('csv', baseContext(state))).rejects.toThrow('Waiting for the atom to finish solving.');
    });

    // Fix round 1, M3: Excel reads the file's codepage from the BOM plus
    // the MIME type's charset; without them a caption's em dash or
    // superscript arrives mangled.
    it('writes a UTF-8 BOM and states the charset, so non-ASCII captions round-trip', async () => {
        const context = {
            ...baseContext(neonStore().getState()),
            csvCurves: [{ label: 'd_z² — ½', points: [{ r: 0.1, value: 1 }] }],
        };
        const result = await runExport('csv', context);
        expect(result.blob.type).toBe('text/csv;charset=utf-8');
        const text = await readText(result.blob);
        // TextDecoder strips the BOM by default; what is left must not have
        // been corrupted by writing it as one byte per character.
        expect(text.charCodeAt(0)).not.toBe(0xfeff);
        expect(text).toContain('d_z² — ½');
    });

    // Fix round 1, M4.
    describe('exportAvailability', () => {
        it('gives a refused combination its own reason (ruling C10), not the generic "nothing drawn"', () => {
            const store = makeStore();
            store.dispatch(setMode('hydrogenic'));
            const combination = { kind: 'field' as const, level: 2 as const, field: 0.01, stark: 'lower' as const };
            store.dispatch(setCombination(combination));
            const reason = exportAvailability(store.getState()).csv;
            expect(reason).toBe(selectionProblem(combination));
            expect(reason).not.toBe(NOTHING_DRAWN_REASON);
        });

        it('says nothing is drawn yet for Basic Orbitals with no render requested', () => {
            const store = makeStore();
            store.dispatch(setMode('hydrogenic'));
            expect(exportAvailability(store.getState()).csv).toBe(NOTHING_DRAWN_REASON);
        });
    });

    // Fix round 1, M5: the orbital level's curve is still the whole
    // subshell's D(r) (RadialPlot draws one curve per subshell, not per
    // m_l), which the file should say so it is not read as specific to the
    // one orbital named in its filename.
    it('notes that an orbital-level curve is its subshell\'s, independent of m_l', async () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        store.dispatch(drillToSubshell(2, 1));
        store.dispatch(drillToOrbital(2, 1, 1));
        const context = { ...baseContext(store.getState()), csvCurves: [{ label: '2p', points: [{ r: 0.1, value: 1 }] }] };
        const text = await readText((await runExport('csv', context)).blob);
        expect(text).toContain('# note: D(r) is the subshell\'s, independent of m_l');
    });
});

describe('runExport: STL', () => {
    it('prints what the viewer holds, at the chosen size', async () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        const handle = exportHandle({ collectSurfaces: () => [octahedron()] });
        const result = await runExport('stl', { ...baseContext(store.getState()), handle, longestSideMm: 80 });
        expect(result.filename).toBe('orbital-viewer_Ne_shell_n2.stl');
        expect(result.blob.size).toBe(84 + 50 * 8);
    });

    // Review Focus 4.
    it('is unavailable at the whole-atom level, and refuses while the surface is still coming', async () => {
        expect(exportAvailability(neonStore().getState()).stl).toMatch(/whole-atom view is a shaded cut face/);
        const store = neonStore();
        store.dispatch(drillToShell(2));
        const handle = exportHandle();
        await expect(runExport('stl', { ...baseContext(store.getState()), handle, longestSideMm: 50 })).rejects.toThrow(/Nothing to export yet/);
        // Ruling R1: one wording, shared with glTF.
        await expect(runExport('stl', { ...baseContext(store.getState()), handle, longestSideMm: 50 })).rejects.toThrow(NOTHING_TO_EXPORT_REASON);
    });

    it('refuses, like the PNG, before anything is drawn and while a picture is still computing', () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        store.dispatch(solveStarted());
        expect(exportAvailability(store.getState()).stl).toBe(PICTURE_BUSY_REASON);
        const basic = makeStore();
        basic.dispatch(setMode('hydrogenic'));
        expect(exportAvailability(basic.getState()).stl).toBe(NOTHING_DRAWN_REASON);
    });

    it('says so when the 3D view is not ready', async () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        await expect(runExport('stl', { ...baseContext(store.getState()), longestSideMm: 50 })).rejects.toThrow(VIEW_NOT_READY_REASON);
    });
});

describe('runExport: cube', () => {
    it('asks the worker for the cube and names it .cube', async () => {
        const worker = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null, onmessageerror: null, terminate: jest.fn(),
            postMessage(request: { requestId: number }) { setTimeout(() => worker.onmessage?.({ data: { type: 'success', blob: new Blob(['c']), requestId: request.requestId } } as MessageEvent)); } };
        const result = await runExport('cube', { ...baseContext(neonStore().getState()), createCubeWorker: () => worker });
        expect(result.filename).toBe('orbital-viewer_Ne_atom.cube');
    });
});

describe('runExport: glTF', () => {
    it('writes a .glb of what the viewer holds, and not at the whole-atom level', async () => {
        const store = neonStore();
        expect(exportAvailability(store.getState()).glb).toMatch(/whole-atom view/);
        store.dispatch(drillToShell(2));
        const handle = exportHandle({ collectSurfaces: () => [octahedron()] });
        const result = await runExport('glb', { ...baseContext(store.getState()), handle });
        expect(result.filename).toBe('orbital-viewer_Ne_shell_n2.glb');
        expect(result.blob.type).toBe('model/gltf-binary');
    });
});
