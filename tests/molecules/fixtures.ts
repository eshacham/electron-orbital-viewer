import type { LibraryMoleculeMeta, MoleculeAtom } from '../../src/molecules/library_types';

export const BOHR_PER_ANGSTROM = 1 / 0.529177210903;
const rad = (deg: number) => (deg * Math.PI) / 180;

function bent(Zc: number, Zl: number, rAngstrom: number, apexDeg: number): MoleculeAtom[] {
    const r = rAngstrom * BOHR_PER_ANGSTROM;
    const h = rad(apexDeg) / 2;
    return [
        { Z: Zc, position: [0, 0, 0] },
        { Z: Zl, position: [0, r * Math.sin(h), r * Math.cos(h)] },
        { Z: Zl, position: [0, -r * Math.sin(h), r * Math.cos(h)] },
    ];
}
export const waterAtoms = () => bent(8, 1, 0.958, 104.5);
export const ozoneAtoms = () => bent(8, 8, 1.278, 116.8);
export function methaneAtoms(): MoleculeAtom[] {
    const s = (1.087 * BOHR_PER_ANGSTROM) / Math.sqrt(3);
    return [{ Z: 6, position: [0, 0, 0] }, ...[[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]
        .map(([a, b, c]) => ({ Z: 1, position: [s * a, s * b, s * c] as [number, number, number] }))];
}

export function waterMeta(overrides: Record<string, unknown> = {}): LibraryMoleculeMeta {
    const half = 6.43;
    return {
        id: 'h2o', name: 'Water', formula: 'H2O', atoms: waterAtoms(),
        geometrySource: 'experiment (CCCBDB)',
        method: { density: 'B3LYP/def2-TZVP', energies: 'B3LYP/def2-TZVP' },
        totalEnergyHartree: -76.46, dipoleDebye: 1.862, dipoleVectorDebye: [0, 0, 1.862],
        orbitals: [
            { index: 0, label: '1a1', energyHartree: -19.13, occupation: 2 },
            { index: 1, label: '2a1', energyHartree: -1.00, occupation: 2 },
            { index: 2, label: '1b2', energyHartree: -0.53, occupation: 2 },
            { index: 3, label: '3a1', energyHartree: -0.38, occupation: 2 },
            { index: 4, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
            { index: 5, label: '4a1', energyHartree: 0.01, occupation: 0, role: 'LUMO' },
        ],
        grid: { shape: [96, 96, 96], origin: [-half, -half, -half], spacing: (2 * half) / 95 },
        espGrid: { shape: [48, 48, 48], origin: [-half, -half, -half], spacing: (2 * half) / 47 },
        espRangeOnSurface: [-0.061, 0.071], electronCount: 10, densityIntegral: 9.998, multiplicity: 1,
        symmetry: { pointGroup: 'C2v', labelGroup: 'C2v' },
        references: [{ quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 }],
        generator: { pyscf: '2.6.0', script: 'tools/molecules/build_library.py', commit: 'abc1234' },
        ...overrides,
    } as unknown as LibraryMoleculeMeta;
}
export const methaneMeta = () => waterMeta({
    id: 'ch4', name: 'Methane', formula: 'CH4', atoms: methaneAtoms(), dipoleDebye: 0.0004, dipoleVectorDebye: [0.0004, 0, 0],
    references: [{ quantity: 'dipole', value: 0, unit: 'D', source: 'zero by symmetry', tolerance: 0.01 }],
});
