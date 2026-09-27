import { runExport, exportAvailability, WAITING_FOR_ATOM_REASON, NOTHING_DRAWN_REASON, PICTURE_BUSY_REASON } from '../../src/export/run_export';
import { setMode, drillToShell, drillToSubshell, drillToOrbital, solveStarted } from '../../src/store/atomSlice';
import { setCombination } from '../../src/store/orbitalSlice';
import { selectionProblem } from '../../src/combinations';
import { NOTHING_TO_EXPORT_REASON } from '../../src/export/surfaces';
import { makeStore, neonStore, readText, baseContext, octahedron } from './fixtures';

describe('runExport: PNG', () => {
    it('asks the viewer for an image, with the caption and method, or without overlays', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(neonStore().getState()), handle: { capturePng, collectSurfaces: () => [] }, phaseLegend: false };
        expect((await runExport('png', context)).filename).toBe('orbital-viewer_Ne_atom.png');
        expect(capturePng).toHaveBeenLastCalledWith({ caption: ['Neon (Ne, Z = 10), whole atom, 90% contour', expect.stringMatching(/^central-field SCF/)], phaseLegend: false });
        expect((await runExport('png-plain', context)).filename).toBe('orbital-viewer_Ne_atom_view.png');
        expect(capturePng).toHaveBeenLastCalledWith(null);
    });

    it('says so when the 3D view is not ready', async () => {
        await expect(runExport('png', baseContext(neonStore().getState()))).rejects.toThrow('The 3D view is not ready yet.');
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
            handle: { capturePng, collectSurfaces: () => [] },
            phaseLegend: false,
            combinationLegend,
        };
        await runExport('png', context);
        expect(capturePng).toHaveBeenLastCalledWith(expect.objectContaining({ combinationLegend }));
    });

    it('never asks for a combination key when App has none (plain ψ key, or nothing overlaid)', async () => {
        const capturePng = jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
        const context = { ...baseContext(neonStore().getState()), handle: { capturePng, collectSurfaces: () => [] }, phaseLegend: true };
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
            const context = { ...baseContext(makeStore().getState()), handle: { capturePng, collectSurfaces: () => [] }, phaseLegend: false };
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
            const context = { ...baseContext(store.getState()), handle: { capturePng, collectSurfaces: () => [] }, phaseLegend: false };
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
            const context = { ...baseContext(store.getState()), handle: { capturePng, collectSurfaces: () => [] }, phaseLegend: false };
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
        const handle = { capturePng: jest.fn(), collectSurfaces: () => [octahedron()] };
        const result = await runExport('stl', { ...baseContext(store.getState()), handle, longestSideMm: 80 });
        expect(result.filename).toBe('orbital-viewer_Ne_shell_n2.stl');
        expect(result.blob.size).toBe(84 + 50 * 8);
    });

    // Review Focus 4.
    it('is unavailable at the whole-atom level, and refuses while the surface is still coming', async () => {
        expect(exportAvailability(neonStore().getState()).stl).toMatch(/whole-atom view is a shaded cut face/);
        const store = neonStore();
        store.dispatch(drillToShell(2));
        const handle = { capturePng: jest.fn(), collectSurfaces: () => [] };
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
        await expect(runExport('stl', { ...baseContext(store.getState()), longestSideMm: 50 })).rejects.toThrow('The 3D view is not ready yet.');
    });
});
