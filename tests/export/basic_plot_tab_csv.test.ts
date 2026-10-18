import { runExport } from '../../src/export/run_export';
import { setMode } from '../../src/store/atomSlice';
import { startOrbitalCalculation, finishOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { BASIC_PLOT_TABS, hydrogenicTabCurves } from '../../src/atom/plot_tabs';
import { CURVE_COLORS } from '../../src/curve_colors';
import { makeStore, baseContext, readText } from './fixtures';

/**
 * Basic Orbitals' plot tabs (spec §9.2: "Plot tabs as §9.1"): the CSV is the
 * tab on screen, its quantity line included (ruling C6). App.tsx builds the
 * context the same way (csvCurvesNow/handleExport) once a tab is picked via
 * displayPref.plotTab -- simulated here directly, as Task 13's own
 * csvQuantity test does for the Atom screen (tests/export/run_export.test.ts).
 */
describe('Basic Orbitals\' plot tabs: the CSV is the tab on screen (ruling C6)', () => {
    it('exports R(r), after switching to that tab, with its own quantity line and the plotted numbers', async () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        const params = basicOrbitalParams(3, 2, 0, 0.9);
        store.dispatch(startOrbitalCalculation(params));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));

        const waveTab = BASIC_PLOT_TABS.find(t => t.id === 'wave')!;
        const curves = hydrogenicTabCurves('wave', { n: params.n, l: params.l, Z: 1, rMax: params.rMax, colour: CURVE_COLORS[0] });

        const result = await runExport('csv', { ...baseContext(store.getState()), csvCurves: curves, csvQuantity: waveTab.csvQuantity ?? undefined });
        const text = await readText(result.blob);
        const lines = text.split('\n');

        expect(text).toContain(`# quantity: ${waveTab.csvQuantity}`);
        expect(waveTab.csvQuantity).toBe('R(r), the radial wave function, bohr^-3/2');
        // Not the default D(r)-tab text (ruling C6: the exported quantity names the tab actually on screen).
        expect(text).not.toContain('probability per bohr');

        const headerIndex = lines.findIndex(line => line.startsWith('r_bohr'));
        expect(lines[headerIndex]).toContain(curves[0].label);
        const firstRow = lines[headerIndex + 1].split(',');
        expect(Number(firstRow[0])).toBeCloseTo(curves[0].points[0].r, 10);
        expect(Number(firstRow[1])).toBeCloseTo(curves[0].points[0].value, 10);
        const lastPoint = curves[0].points[curves[0].points.length - 1];
        const lastRow = lines[headerIndex + curves[0].points.length].split(',');
        expect(Number(lastRow[1])).toBeCloseTo(lastPoint.value, 10);
    });

    it('keeps the default radial-distribution quantity for the D(r) tab (null csvQuantity, ruling R2)', async () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        const params = basicOrbitalParams(2, 1, 1, 0.9);
        store.dispatch(startOrbitalCalculation(params));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));

        const distributionTab = BASIC_PLOT_TABS.find(t => t.id === 'distribution')!;
        expect(distributionTab.csvQuantity).toBeNull();
        const curves = hydrogenicTabCurves('distribution', { n: params.n, l: params.l, Z: 1, rMax: params.rMax, colour: CURVE_COLORS[0] });

        const result = await runExport('csv', { ...baseContext(store.getState()), csvCurves: curves, csvQuantity: distributionTab.csvQuantity ?? undefined });
        const text = await readText(result.blob);
        expect(text).toContain('# quantity: P(r) = r^2*R(r)^2, probability per bohr');
    });
});
