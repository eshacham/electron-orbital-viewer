import type React from 'react';
import type { AnalyticFieldSource, GridFieldSource, FieldSource, FieldRecipe, FieldRenderRequest } from '../../src/field_source';
import type { generateFieldMesh } from '../../src/orbital_mesh';
import type { updateFieldInScene, VisualizerContext, RenderOutcome } from '../../src/orbital_visualizer';
import type { MeshData } from '../../src/types/orbital';
import type { loadMoleculeIndex, loadMoleculeMeta, loadDensityGrid, loadBasis } from '../../src/molecules/loader';
import type { MoleculeMeta, MoleculeIndexEntry } from '../../src/molecules/types';
import type MoDiagram from '../../src/components/MoDiagram';
import type { registerUrlKeys, encodeState, applyState } from '../../src/url_state';
import type { ValidationRow, relativeErrorPercent } from '../../src/validation/references';
import type { ViewMode } from '../../src/store/atomSlice';
import type { RootState, AppDispatch } from '../../src/store';

/** Never called: its body is the contract, and tsc is the checker. */
function contracts(): void {
    const mesh: (source: FieldSource, resolution: number, enclosedFraction: number) => MeshData =
        null as unknown as typeof generateFieldMesh;
    const draw: (context: VisualizerContext | null, request: FieldRenderRequest) => Promise<RenderOutcome> =
        null as unknown as typeof updateFieldInScene;
    const recipe: FieldRecipe = { type: 'gaussianMO', moleculeId: 'h2o', index: 4 };
    const mo: AnalyticFieldSource = { kind: 'analytic', id: 'gaussianMO:h2o:4', recipe, rMax: 6.4 };
    const request: FieldRenderRequest = { sources: [mo], colors: ['#ffffff'], memberLabels: ['HOMO'], resolution: 95, enclosedFraction: 0.9, label: 'HOMO' };
    const grid: GridFieldSource = { kind: 'grid', id: 'h2o:density', shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, quantity: 'density', values: new Float32Array(8) };
    const row: ValidationRow = { phase: 6, quantity: 'dipole moment', system: 'H2O', app: 1.87, reference: 1.855, unit: 'D', tolerancePercent: 10, referenceSource: 'CRC', method: 'B3LYP/def2-TZVP' };
    const error: (row: ValidationRow) => number = null as unknown as typeof relativeErrorPercent;
    const register: (
        mode: string,
        encoder: (state: RootState) => Record<string, string>,
        decoder: (params: URLSearchParams, dispatch: AppDispatch) => void,
    ) => void = null as unknown as typeof registerUrlKeys;
    const encode: () => string = null as unknown as typeof encodeState;
    const apply: (hash: string) => void = null as unknown as typeof applyState;
    const index: () => Promise<MoleculeIndexEntry[]> = null as unknown as typeof loadMoleculeIndex;
    const meta: (id: string) => Promise<MoleculeMeta> = null as unknown as typeof loadMoleculeMeta;
    const density: (meta: MoleculeMeta) => Promise<GridFieldSource> = null as unknown as typeof loadDensityGrid;
    const basis: (id: string) => Promise<unknown> = null as unknown as typeof loadBasis;
    const entry: MoleculeIndexEntry = { id: 'h2o', name: 'Water', formula: 'H2O', category: 'first-examples', tags: ['polarity'] };
    // The spec §4.2 example, verbatim in shape: Phase 5's type must accept it.
    const spec: MoleculeMeta = {
        id: 'h2o', name: 'Water', formula: 'H2O',
        atoms: [{ Z: 8, position: [0, 0, 0.2217] }],
        geometrySource: 'experiment (CCCBDB)',
        method: { density: 'B3LYP/def2-TZVP', energies: 'CCSD(T)/aug-cc-pVTZ' },
        totalEnergyHartree: -76.4, dipoleDebye: 1.85,
        orbitals: [{ index: 4, label: '1b1', energyHartree: -0.49, occupation: 2, role: 'HOMO' }],
        grid: { shape: [96, 96, 96], origin: [-7, -7, -7], spacing: 0.147 },
        espGrid: { shape: [48, 48, 48], origin: [-7, -7, -7], spacing: 0.294 },
        references: [{ quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook' }],
        generator: { pyscf: '2.x', script: 'tools/molecules/generate.py', commit: 'abc1234' },
    };
    const diagram: React.ComponentProps<typeof MoDiagram> = {
        orbitals: spec.orbitals, selectedIndex: null, onSelect: (_index: number) => undefined, width: 278,
    };
    const bonds: ViewMode = 'bonds';
    void [mesh, draw, request, grid, row, error, register, encode, apply, index, meta, density, basis, entry, diagram, bonds];
}

describe('phase contracts', () => {
    it('is type-checked by tsc; this only proves the file loads', () => {
        expect(typeof contracts).toBe('function');
    });
});
