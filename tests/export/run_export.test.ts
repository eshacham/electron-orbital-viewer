// GLTFExporter ships only as an ES module, which this project's ts-jest cannot
// load (see orbital_controls_factory.ts), so the factory is mocked.
jest.mock('../../src/export/gltf_exporter_factory', () => ({ exportGlb: jest.fn(async () => new ArrayBuffer(12)) }));

import { runExport, exportAvailability, cubeJobFor, WAITING_FOR_ATOM_REASON, NOTHING_DRAWN_REASON, PICTURE_BUSY_REASON, VIEW_NOT_READY_REASON, RENDER_FAILED_REASON, COMPOSITION_FAILED_REASON } from '../../src/export/run_export';
import { setMode, drillToShell, drillToSubshell, drillToOrbital, solveStarted, solveSucceeded, levelUp, setRelativity } from '../../src/store/atomSlice';
import {
    setCombination, startOrbitalCalculation, startFieldCalculation, failOrbitalCalculation, startCompositionBuild, endCompositionBuild, failCompositionBuild,
    setLevelTransition,
} from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { selectionProblem } from '../../src/combinations';
import { NOTHING_TO_EXPORT_REASON } from '../../src/export/surfaces';
import {
    makeStore, neonStore, sodiumIonStore, chlorideUnboundStore, readText, baseContext, octahedron, exportHandle, goldStore, goldProfile,
    bondsMoleculeStore, bondsH2PlusStore, N2_BASIS, N2_META, N2_SCAN, O2_META,
} from './fixtures';

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

// Final review I2/M9: a shell's lobes are built after the shell view is
// up (OrbitalViewer clears the old ones at once), and a level transition
// animates between two pictures -- either way the canvas is not yet the
// picture the caption names.
describe('exportAvailability: the shell\'s lobes and level transitions', () => {
    it('waits while the lobes are computing: images and geometry, not CSV or the radial cube', () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        store.dispatch(startCompositionBuild());
        const busy = exportAvailability(store.getState());
        expect([busy.png, busy['png-plain'], busy.stl, busy.glb]).toEqual(Array(4).fill(PICTURE_BUSY_REASON));
        expect(busy.csv).toBeNull();
        expect(busy.cube).toBeNull();
        store.dispatch(endCompositionBuild());
        expect(exportAvailability(store.getState()).png).toBeNull();
    });

    it('waits while a level transition is running', async () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        store.dispatch(setLevelTransition(true));
        expect(exportAvailability(store.getState()).png).toBe(PICTURE_BUSY_REASON);
        expect(exportAvailability(store.getState()).glb).toBe(PICTURE_BUSY_REASON);
        await expect(runExport('png', { ...baseContext(store.getState()), handle: exportHandle() })).rejects.toThrow(PICTURE_BUSY_REASON);
        store.dispatch(setLevelTransition(false));
        expect(exportAvailability(store.getState()).png).toBeNull();
    });

    it('refuses, with the reason, a shell whose lobes failed, rather than export it without them', async () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        store.dispatch(startCompositionBuild());
        store.dispatch(failCompositionBuild('worker crashed'));
        const failed = exportAvailability(store.getState());
        expect([failed.png, failed['png-plain'], failed.stl, failed.glb]).toEqual(Array(4).fill(COMPOSITION_FAILED_REASON));
        expect(failed.csv).toBeNull();
        await expect(runExport('stl', { ...baseContext(store.getState()), handle: exportHandle() })).rejects.toThrow(COMPOSITION_FAILED_REASON);
        // The whole atom has no lobes to have lost.
        store.dispatch(levelUp());
        expect(exportAvailability(store.getState()).png).toBeNull();
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

// Task 12b (ruling C4): an unbound anion draws nothing (spec §3.5), and
// every export kind must say so with the store's own message -- never the
// generic "waiting for the atom" reason, which would read as if a solve
// were merely still running.
// Final review M5: a relativity switch keeps the old mode's picture up while
// the new one solves (ruling C9), but the view link a file embeds already
// names the new mode -- so every export waits, and file and link never
// disagree about which picture they describe.
describe('exportAvailability: a picture re-solving for a relativity switch', () => {
    it('refuses every kind while the picture on screen is the old mode\'s, and allows them once the new one lands', () => {
        const store = goldStore('scalar');
        store.dispatch(drillToShell(6));
        store.dispatch(setRelativity('spinOrbit'));
        store.dispatch(solveStarted());
        expect(exportAvailability(store.getState())).toEqual({
            png: PICTURE_BUSY_REASON, 'png-plain': PICTURE_BUSY_REASON, csv: PICTURE_BUSY_REASON,
            stl: PICTURE_BUSY_REASON, glb: PICTURE_BUSY_REASON, cube: PICTURE_BUSY_REASON,
        });
        store.dispatch(solveSucceeded(goldProfile('spinOrbit', { j: true })));
        expect(exportAvailability(store.getState())).toEqual({ png: null, 'png-plain': null, csv: null, stl: null, glb: null, cube: null });
    });
});

describe('exportAvailability and runExport: an unbound anion', () => {
    it('refuses every kind with the store\'s own unbound message, not WAITING_FOR_ATOM_REASON', async () => {
        const store = chlorideUnboundStore();
        const message = store.getState().atom.unbound!;
        expect(message).toMatch(/^LDA does not bind this anion/);

        const availability = exportAvailability(store.getState());
        expect(availability.png).toBe(message);
        expect(availability['png-plain']).toBe(message);
        expect(availability.csv).toBe(message);
        expect(availability.cube).toBe(message);
        expect(availability.stl).toBe(message);
        expect(availability.glb).toBe(message);

        for (const kind of ['png', 'png-plain', 'csv', 'cube', 'stl', 'glb'] as const) {
            expect(availability[kind]).not.toBe(WAITING_FOR_ATOM_REASON);
            await expect(runExport(kind, { ...baseContext(store.getState()), handle: exportHandle() })).rejects.toThrow(message);
        }
    });
});

// Task 12b (ruling C4): the picture's own PNG/CSV/cube text all say what is
// on screen, including the dashed neutral-comparison ring an ion's
// whole-atom view adds (profile.reference).
describe('runExport: an ion\'s exports name the species and the reference ring', () => {
    it('adds the ring line to the PNG caption', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(sodiumIonStore().getState()), handle: exportHandle({ capturePng }), phaseLegend: false };
        await runExport('png', context);
        expect(capturePng).toHaveBeenLastCalledWith(expect.objectContaining({
            caption: [
                'Sodium ion Na⁺ (Z = 11), 1s² 2s² 2p⁶, whole atom, 90% contour',
                expect.stringMatching(/^central-field SCF/),
                'dashed ring: neutral Na drawn radius 1.28 a₀',
            ],
        }));
    });

    it('adds the ring line as a CSV comment', async () => {
        const context = { ...baseContext(sodiumIonStore().getState()), csvCurves: [{ label: 'total', points: [{ r: 0.1, value: 1 }] }] };
        const text = await readText((await runExport('csv', context)).blob);
        expect(text).toContain('# dashed ring: neutral Na drawn radius 1.28 a₀');
    });

    it('adds the ring line to the cube job\'s description', () => {
        const job = cubeJobFor(sodiumIonStore().getState());
        expect(job.type).toBe('radialCube');
        if (job.type === 'radialCube') expect(job.description).toContain('dashed ring: neutral Na drawn radius 1.28 a₀');
    });

    it('names an ion\'s file stem with an ASCII charge suffix', async () => {
        const state = sodiumIonStore().getState();
        const csvCurves = [{ label: 'total', points: [{ r: 0.1, value: 1 }] }];
        expect((await runExport('csv', { ...baseContext(state), csvCurves })).filename).toBe('orbital-viewer_Na+1_atom.csv');
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

/** The shared log grid a goldProfile's curves are sampled on (see run_export.ts's own profileRGrid) -- csvCurves must share it, since radialCurvesToCsv refuses columns sampled at different radii. */
function gridFor(profile: { rMin: number; dx: number; size: number }): number[] {
    return Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
}

// Task 12b (ruling C7): the PNG caption already carries the mode through
// methodStatement (pinned directly in caption.test.ts); this exercises it
// end to end through runExport, the way the existing "carries the caption
// and method" PNG test does for off.
describe('runExport: PNG caption carries the mode (ruling C7)', () => {
    it('names the drawn profile\'s mode in the method line', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(goldStore('scalar').getState()), handle: exportHandle({ capturePng }), phaseLegend: false };
        await runExport('png', context);
        expect(capturePng).toHaveBeenLastCalledWith(expect.objectContaining({
            caption: ['Gold (Au, Z = 79), whole atom, scalar-relativistic, 90% contour', expect.stringMatching(/^central-field SCF, scalar-relativistic/)],
        }));
    });
});

// Final review I1: with spin–orbit a j-level's lobes are the l orbitals'
// shapes sized by its own R(r) (spec §3.6) -- a basis choice the panel
// states on screen, so a PNG of those lobes carries it too; the method line
// alone does not say it.
describe('runExport: PNG caption states the j-level angular-shape caveat (final review I1)', () => {
    async function captionOf(store: ReturnType<typeof goldStore>): Promise<string[]> {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        await runExport('png', { ...baseContext(store.getState()), handle: exportHandle({ capturePng }), phaseLegend: false });
        return capturePng.mock.calls[capturePng.mock.calls.length - 1][0].caption;
    }

    it('names the isolated j-level at the subshell level', async () => {
        const store = goldStore('spinOrbit', { j: true });
        store.dispatch(drillToShell(6));
        store.dispatch(drillToSubshell(6, 1, 0.5));
        expect(await captionOf(store)).toContain('lobes: the p orbitals\' shapes sized by 6p½\'s R(r) — a basis choice; a |j, m_j⟩ state\'s shape differs');
    });

    it('speaks of each j-level at the shell level, where their lobes overlap', async () => {
        const store = goldStore('spinOrbit', { j: true });
        store.dispatch(drillToShell(6));
        expect(await captionOf(store)).toContain('lobes: the l orbitals\' shapes sized by each j-level\'s R(r) — a basis choice; a |j, m_j⟩ state\'s shape differs');
    });

    it('names the orbital\'s j-level at the orbital level', async () => {
        const store = goldStore('spinOrbit', { j: true });
        store.dispatch(drillToShell(6));
        store.dispatch(drillToSubshell(6, 1, 1.5));
        store.dispatch(drillToOrbital(6, 1, 0, 1.5));
        expect(await captionOf(store)).toContain('lobes: the p orbital\'s shape sized by 6p³⁄₂\'s R(r) — a basis choice; a |j, m_j⟩ state\'s shape differs');
    });

    it('adds nothing where no j-level lobes are drawn: whole atom, scalar, or a shell with no j-level beyond s', async () => {
        const whole = goldStore('spinOrbit', { j: true });
        expect(await captionOf(whole)).toHaveLength(2);
        const scalar = goldStore('scalar');
        scalar.dispatch(drillToShell(6));
        scalar.dispatch(drillToSubshell(6, 1));
        expect(await captionOf(scalar)).toHaveLength(2);
        const inner = goldStore('spinOrbit', { j: true });
        inner.dispatch(drillToShell(5));
        expect(await captionOf(inner)).toHaveLength(2);
    });
});

// Task 12b (ruling C7), requirement 4: the CSV carries the same dashed
// non-relativistic curves RadialPlot overlays (Task 12), or -- when there
// is none -- the reason said as a comment instead.
describe('runExport: CSV includes the dashed non-relativistic comparison curves (ruling C7)', () => {
    it('adds a column per comparison curve, headed "... non-relativistic"', async () => {
        const store = goldStore('scalar', { comparison: true });
        const profile = store.getState().atom.profile!;
        const rGrid = gridFor(profile);
        const csvCurves = [{ label: 'n=6', points: rGrid.map((r, j) => ({ r, value: profile.shells[1].curve[j] })) }];
        const text = await readText((await runExport('csv', { ...baseContext(store.getState()), csvCurves })).blob);
        const header = text.split('\n').find(line => line.startsWith('r_bohr'))!;
        expect(header).toContain('n=6');
        expect(header).toContain('n=6 non-relativistic');
    });

    it('states the isolated j-level twin\'s scaling as the on-screen legend does (Task 12)', async () => {
        const store = goldStore('spinOrbit', { j: true, comparison: true });
        store.dispatch(drillToSubshell(6, 1, 1.5));
        const profile = store.getState().atom.profile!;
        const rGrid = gridFor(profile);
        const pThreeHalves = profile.subshells.find(s => s.l === 1 && s.j === 1.5)!;
        const csvCurves = [{ label: '6p³⁄₂', points: rGrid.map((r, j) => ({ r, value: pThreeHalves.curve[j] })) }];
        const text = await readText((await runExport('csv', { ...baseContext(store.getState()), csvCurves })).blob);
        expect(text).toContain('# dashed: non-relativistic 6p, scaled to the 4 electrons shown');
    });

    it('adds the comparisonUnavailable reason as a comment when there is no baseline', async () => {
        const store = goldStore('scalar');
        const reason = 'No non-relativistic comparison: Pr-Eu 6s -> 4f has no non-relativistic answer.';
        store.dispatch(solveSucceeded({ ...store.getState().atom.profile!, comparisonUnavailable: reason }));
        const profile = store.getState().atom.profile!;
        const csvCurves = [{ label: 'n=6', points: gridFor(profile).map((r, j) => ({ r, value: profile.shells[1].curve[j] })) }];
        const text = await readText((await runExport('csv', { ...baseContext(store.getState()), csvCurves })).blob);
        expect(text).toContain(`# ${reason}`);
    });

    it('adds no comparison column and no comment for an off-mode profile (byte-identical case)', async () => {
        const store = neonStore();
        const csvCurves = [{ label: 'n=1', points: [{ r: 0.1, value: 1 }, { r: 0.2, value: 2 }] }];
        const text = await readText((await runExport('csv', { ...baseContext(store.getState()), csvCurves })).blob);
        // Exactly the same output the pre-existing, pinned CSV test expects
        // (tests/export/run_export.test.ts, "writes the plotted curves...")
        // -- no comparison column, no extra comment line, for a profile with
        // no `nonRelativistic`/`comparisonUnavailable` (every profile before
        // Phase 4, and every off-mode one since).
        expect(text).toBe(
            '# Neon (Ne, Z = 10), whole atom, 90% contour\n'
            + '# quantity: D(r) = 4*pi*r^2*rho(r), electrons per bohr (the radial distribution, not the density)\n'
            + '# method: central-field SCF, LDA exchange + VWN5 correlation, non-relativistic, spherically averaged\n'
            + '# r in bohr (a0)\n'
            + '# view: http://x/#mode=atom&Z=10\n'
            + 'r_bohr,n=1\n0.1,1\n0.2,2\n'
        );
    });
});

// Task 13b (ruling C5): Bonds mode's exports -- captions, file names and the
// cube name the system, R and method; availability follows the drawn
// picture, like every other mode.
describe('Bonds mode exports (ruling C5, Task 13b)', () => {
    describe('exportAvailability follows the drawn picture, like every other mode', () => {
        it('refuses with NOTHING_DRAWN_REASON before any Bonds picture lands', () => {
            const store = makeStore();
            store.dispatch(setMode('bonds'));
            const availability = exportAvailability(store.getState());
            for (const kind of ['png', 'png-plain', 'stl', 'glb', 'cube'] as const) {
                expect(availability[kind]).toBe(NOTHING_DRAWN_REASON);
            }
        });

        it('offers every kind once a picture has landed', () => {
            const availability = exportAvailability(bondsH2PlusStore().getState());
            for (const kind of ['png', 'png-plain', 'csv', 'stl', 'glb', 'cube'] as const) {
                expect(availability[kind]).toBeNull();
            }
        });

        it('waits (PICTURE_BUSY_REASON) for a 3D render in flight, but offers CSV at once (it reads the scan/curve, not the mesh)', () => {
            const store = bondsH2PlusStore();
            // Re-request the same picture: startFieldCalculation alone, without
            // the landing finishOrbitalCalculation bondsH2PlusStore also sends.
            store.dispatch(startFieldCalculation(store.getState().orbital.currentField!));
            const availability = exportAvailability(store.getState());
            expect(availability.png).toBe(PICTURE_BUSY_REASON);
            expect(availability.cube).toBe('The surface is still being computed.');
            expect(availability.csv).toBeNull();
        });

        it('refuses every kind, including CSV, after a failed render', async () => {
            const store = bondsH2PlusStore();
            store.dispatch(failOrbitalCalculation('worker crashed'));
            const availability = exportAvailability(store.getState());
            for (const kind of ['png', 'png-plain', 'csv', 'stl', 'glb', 'cube'] as const) {
                expect(availability[kind]).toBe(RENDER_FAILED_REASON);
            }
            await expect(runExport('png', baseContext(store.getState()))).rejects.toThrow(RENDER_FAILED_REASON);
        });
    });

    describe('PNG caption', () => {
        it('carries the system/R/orbital line and the method line', async () => {
            const capturePng = jest.fn().mockResolvedValue(new Blob(['png']));
            const context = { ...baseContext(bondsMoleculeStore().getState()), handle: exportHandle({ capturePng }), bondsScan: N2_SCAN };
            await runExport('png', context);
            const overlays = capturePng.mock.calls[0][0];
            expect(overlays.caption[0]).toBe('N₂ 3σg, R = 2.07 a₀ (1.098 Å)');
            expect(overlays.caption[1]).toBe('B3LYP/def2-TZVP');
        });
    });

    describe('CSV: the potential curve E(R), not a radial curve', () => {
        it('writes H2+\'s exact curve, both states, with R in a0 and Angstrom and E relative and absolute', async () => {
            const text = await readText((await runExport('csv', baseContext(bondsH2PlusStore().getState()))).blob);
            expect(text).toContain('# Exact within Born–Oppenheimer');
            const header = text.split('\n').find(line => line.startsWith('R_bohr'));
            expect(header).toBe('R_bohr,R_angstrom,E_1sigma_g_eV,E_1sigma_g_Ha,E_1sigma_u_eV,E_1sigma_u_Ha');
            const firstRow = text.split('\n').find(line => line.startsWith('0.5,'));
            expect(firstRow!.split(',')).toHaveLength(6);
        });

        it('writes a diatomic\'s shipped scan points, zero at the separated atoms, with D_e/R_e comments', async () => {
            const context = { ...baseContext(bondsMoleculeStore().getState()), bondsScan: N2_SCAN };
            const text = await readText((await runExport('csv', context)).blob);
            const lines = text.split('\n');
            expect(lines[0]).toContain('N₂ potential curve');
            expect(text).toContain('# Energies: CCSD(T)/aug-cc-pVTZ (frozen core).');
            expect(text).toContain('D_e = 8.16 eV');
            expect(text).toContain('R_e = 2.074 a₀');
            expect(lines).toContain('R_bohr,R_angstrom,E_eV,E_Ha');
            // Point 1 (R = 2.074): E relative to the separated atoms is (energyHartree - separatedAtomsHartree) * HARTREE_TO_EV.
            const row = lines.find(line => line.startsWith('2.074,'));
            expect(row).toBeDefined();
            const [, , eEv, eHa] = row!.split(',').map(Number);
            expect(eEv).toBeCloseTo((N2_SCAN.points[1].energyHartree - N2_SCAN.fit.separatedAtomsHartree) * 27.211386245988, 4);
            expect(eHa).toBeCloseTo(N2_SCAN.points[1].energyHartree, 6);
        });

        it('refuses a diatomic\'s CSV without the scan (not yet loaded)', async () => {
            await expect(runExport('csv', baseContext(bondsMoleculeStore().getState()))).rejects.toThrow(/not available/);
        });
    });

    describe('cube and file names', () => {
        it('names the cube and PNG files after the system, R and what is drawn', async () => {
            const h2plus = await runExport('csv', baseContext(bondsH2PlusStore().getState()));
            expect(h2plus.filename).toBe('orbital-viewer_H2plus_R2.00_1sigmag.csv');
        });
    });
});
