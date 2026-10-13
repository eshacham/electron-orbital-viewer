import { orbitalName, shellLetter } from './orbital_names';
import { subshellLabel } from './atom/configurations';
import { formatDrawnRadius } from './atom/format_radius';

/**
 * The inspector's facts card (spec §9.1 "Data"): computed, never typed in.
 * Angular nodes are the real orbitals' nodal surfaces (orbital_names.ts's
 * sign convention: positive mₗ takes cos, negative sin), named for l ≤ 3;
 * shape words are the textbook ones, labelled qualitative.
 */
export interface FactRow { term: string; value: string }
export interface OrbitalFacts { title: string; rows: FactRow[]; notes: string[] }

const NODE_SURFACES: Record<string, string> = {
    '1:-1': 'the xz plane', '1:0': 'the xy plane', '1:1': 'the yz plane',
    '2:-2': 'the xz and yz planes', '2:-1': 'the xy and xz planes', '2:0': 'two cones',
    '2:1': 'the xy and yz planes', '2:2': 'the planes x = y and x = −y',
    '3:-3': 'three vertical planes (y = 0, y = ±√3 x)', '3:-2': 'the xy, yz and xz planes',
    '3:-1': 'the xz plane and two cones', '3:0': 'the xy plane and two cones',
    '3:1': 'the yz plane and two cones', '3:2': 'the xy plane and the planes x = ±y',
    '3:3': 'three vertical planes (x = 0, x = ±√3 y)',
};

const SHAPES: Record<string, string> = {
    '0:0': 'sphere',
    '1:-1': 'dumbbell', '1:0': 'dumbbell', '1:1': 'dumbbell',
    '2:-2': 'cloverleaf', '2:-1': 'cloverleaf', '2:0': 'dumbbell with a ring', '2:1': 'cloverleaf', '2:2': 'cloverleaf',
    '3:-3': 'six lobes in a plane', '3:-2': 'eight lobes', '3:-1': 'six lobes', '3:0': 'dumbbell with two rings',
    '3:1': 'six lobes', '3:2': 'eight lobes', '3:3': 'six lobes in a plane',
};

export function angularNodeSurfaces(l: number, ml: number): string | null {
    return NODE_SURFACES[`${l}:${ml}`] ?? null;
}

export function shapeWord(l: number, ml: number): string | null {
    return SHAPES[`${l}:${ml}`] ?? null;
}

const signed = (value: number) => (value < 0 ? `−${Math.abs(value)}` : String(value));
const percent = (fraction: number) => `${Math.round(fraction * 100)} %`;
const radialNodes = (n: number, l: number) => {
    const count = n - l - 1;
    return count === 0 ? '0' : `${count} (${count === 1 ? 'a sphere' : 'spheres'})`;
};
const energyText = (energy: number, method: string) =>
    `${energy < 0 ? '−' : ''}${Math.abs(energy).toFixed(3)} Ha (eigenvalue, ${method})`;

interface Extras { enclosedFraction: number; isoLevel: number | null; energy: number | null; method: string }

export function orbitalFacts(o: { n: number; l: number; ml: number; j?: number }, extras: Extras): OrbitalFacts {
    const surfaces = angularNodeSurfaces(o.l, o.ml);
    const rows: FactRow[] = [
        { term: 'n', value: String(o.n) },
        { term: 'l', value: `${o.l} (${shellLetter(o.l)})` },
        { term: 'mₗ', value: o.ml > 0 ? `+${o.ml}` : signed(o.ml) },
        { term: 'Real orbital', value: orbitalName(o.n, o.l, o.ml) },
        ...(o.j === undefined ? [] : [{ term: 'j', value: `${o.j * 2}/2` }]),
        { term: 'Radial nodes', value: radialNodes(o.n, o.l) },
        { term: 'Angular nodes', value: surfaces ? `${o.l} — ${surfaces}` : String(o.l) },
        { term: 'Enclosed', value: `${percent(extras.enclosedFraction)} of the electron` },
        { term: 'Iso value', value: extras.isoLevel === null ? '—' : `|ψ|² = ${extras.isoLevel.toExponential(2)}` },
        ...(extras.energy === null ? [] : [{ term: 'Orbital energy', value: energyText(extras.energy, extras.method) }]),
    ];
    const shape = shapeWord(o.l, o.ml);
    const notes = ['ψ changes sign across every node.', ...(shape ? [`Shape: ${shape} (qualitative).`] : [])];
    return { title: `${orbitalName(o.n, o.l, o.ml)} orbital`, rows, notes };
}

export function subshellFacts(
    s: { n: number; l: number; j?: number; electrons: number },
    extras: { enclosedFraction: number; energy: number | null; method: string },
): OrbitalFacts {
    const capacity = s.j === undefined ? 2 * (2 * s.l + 1) : 2 * s.j + 1;
    const electrons = Number.isInteger(s.electrons) ? String(s.electrons) : s.electrons.toFixed(2);
    return {
        title: `${subshellLabel(s.n, s.l, s.j)} subshell`,
        rows: [
            { term: 'n', value: String(s.n) },
            { term: 'l', value: `${s.l} (${shellLetter(s.l)})` },
            { term: 'Electrons', value: `${electrons} of ${capacity}` },
            { term: 'Radial nodes', value: radialNodes(s.n, s.l) },
            { term: 'Angular nodes', value: `${s.l} per orbital` },
            { term: 'Enclosed', value: `${percent(extras.enclosedFraction)} of the electron` },
            ...(extras.energy === null ? [] : [{ term: 'Orbital energy', value: energyText(extras.energy, extras.method) }]),
        ],
        notes: ['ψ changes sign across every node.'],
    };
}

export function atomFacts(args: { title: string; configuration: string; valence: string; shellCount: number; drawnRadius: number; method: string }): OrbitalFacts {
    return {
        title: args.title,
        rows: [
            { term: 'Configuration', value: args.configuration },
            { term: 'Valence', value: args.valence },
            { term: 'Shells', value: String(args.shellCount) },
            { term: 'Drawn radius', value: `${formatDrawnRadius(args.drawnRadius)} a₀ (${args.method})` },
        ],
        notes: [],
    };
}
