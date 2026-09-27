import { runExport, exportAvailability } from '../../src/export/run_export';
import { makeStore, neonStore, readText, baseContext } from './fixtures';

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
        expect(exportAvailability(state).csv).toBe('Waiting for the atom to finish solving.');
        await expect(runExport('csv', baseContext(state))).rejects.toThrow('Waiting for the atom to finish solving.');
    });
});
