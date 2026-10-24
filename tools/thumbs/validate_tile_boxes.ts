// On-demand proof for rulings T10-core / T10-core-I1/I2 and T10-mainbox (Task 16c): no surface the app draws
// for a Bonds or library orbital is cut by the box it is sampled in -- neither the main view's nor a strip
// tile's. Bundled and run by validate_tile_boxes.mjs (which also fetches the data); not part of the app or the
// jest suite.
//
// MAIN VIEW (rulings T10-mainbox, T16c-I1, T16c-cap). For every basis.json of every Bonds molecule at every
// scan point, every orbital (the Bonds list offers each), and every library molecule's every orbital (the
// Molecules list offers each), at 90, 95 and 99 %: the request the app sends -- bondsFieldRequest /
// planMoleculeRender, so each orbital's own box and resolution are view_box.ts's as shipped -- is sampled exactly as the orbital worker
// samples it (sampleFieldSource at the request's own box and resolution), its iso level found as the worker
// finds it (isoLevelForEnclosedFraction), and
//   - face/iso = the largest |ψ|² on the box's six faces over that iso level. ≥ 1 means the surface crosses
//     a face: the main view would draw it open there. Any such case is a CUT (exit code 1);
//   - "past the molecule's box" counts the surfaces with a sample at or above the iso level outside the
//     molecule's own box (Bonds: the farthest atom + MOLECULE_PADDING; Molecules: the density grid's) --
//     the surfaces that box cut before Task 16c;
//   - the step 2·rMax/resolution is compared with the molecule box's: every case the caps coarsen is listed
//     with its factor, and the resolution must be view_box.ts's rule's;
//   - where the surface comes near a face (face/iso ≥ REFERENCE_FACE), the iso level is compared with an
//     exact-superset reference (same step and centre, padded by half the grid a side): how much density the
//     box leaves out;
//   - R25-C: the request is meshed exactly as the orbital worker meshes it (generateFieldMeshes). Any case
//     it refuses -- "Could not resolve this surface" (orbital_mesh.ts's R22b guard) or no surface at all --
//     is UNRESOLVED (exit code 1). The surface's pieces (the connected sets of samples at or above the iso
//     level) are also measured: the smallest piece carrying ≥ PIECE_SHARE of the sampled density, as the
//     radius in voxels of a ball of that many samples, is reported with every case under COARSE_PIECE
//     voxels (information, not a failure: the R22b guard's own line is 2 voxels round the nucleus);
//   - a core sampled in its own box, smaller than the molecule's (view_box.ts, R25-C), is always checked
//     against the exact-superset reference: the density its box leaves out, and its iso level.
//
// STRIP TILES (rulings T10-core, Task 15, T16c-I1). Every Bonds orbital and every library molecule's frontier
// tiles (HOMO, SOMO, LUMO, LVMO -- frontierOrbitals): fitToOrbital fits a tile within the larger of the
// molecule's box and the orbital's originReach (its `limit`; tiles never probe). A fitted tile is sampled exactly as the strip samples it -- 40³,
// the basis moved to the box's centre (basisCentredOn) -- and so is a reference with the SAME step and SAME
// centre in a box twice as wide (80³). The tile's samples are then an exact subset of the reference's, so:
//   - left-out density = the reference's share outside the tile box;
//   - face/iso = as above, on the tile's own 40³ grid and iso level. ≥ 1 is a CUT (exit code 1);
//   - R25-C: the tile is meshed as the strip meshes it -- the strip's own request (fitToOrbital on the
//     probe-free main-view request, at 40³) through generateFieldMeshes; a refusal is UNRESOLVED.
// A tile that keeps its limit box is sampled at 40³ in that box and checked the same way.
//   node tools/thumbs/validate_tile_boxes.mjs [--data DIR] [--port 5411] [--only c2] [--jobs 8] [--skip-main] [--skip-tiles] [--reference-face 0.1]
//
// The whole sweep takes about 10 min on 8 threads (R25-C meshes every case), longer than one 540 s foreground
// command: split it by id prefix with --only, one foreground run per prefix -- Bonds files are <system>_NN.json,
// library molecules <id>.meta.json, and --only matches the start of either. These twelve prefixes cover every
// case of the v3 data, each run well under 540 s: a b c e f g h l n o p s (the totals of the slices add up to
// the whole: 171 Bonds files and 35 library molecules). Fetch first (one run without --only fetches it all).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { basisCentredOn, fitToOrbital, orbitalBox, originReach } from '../../src/molecules/orbital_box';
import { BONDS_THUMB_RESOLUTION } from '../../src/thumbs/bonds_strip_items';
import { MO_THUMB_RESOLUTION } from '../../src/thumbs/strip_items';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { generateFieldMeshes, sampleFieldSource } from '../../src/orbital_mesh';
import { isoLevelForEnclosedFraction } from '../../src/radial_distribution';
import { BONDS_RESOLUTION, BONDS_SYSTEMS, BondsSystemId, MOLECULE_PADDING } from '../../src/bonds/systems';
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import reducer, { selectBondsSystem, setBondsView, setScanPoint } from '../../src/store/bondsSlice';
import { gridHalfWidth, MOLECULE_MO_RESOLUTION, planMoleculeRender } from '../../src/molecules/render_plan';
import { MAX_VIEW_RESOLUTION, viewResolution } from '../../src/molecules/view_box';
import { frontierOrbitals } from '../../src/molecules/orbital_display';
import type { AnalyticFieldSource, FieldRenderRequest } from '../../src/field_source';
import type { BasisOrbital, MoleculeBasis, MoleculeIndexEntry } from '../../src/molecules/types';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';

const FRACTIONS = [0.9, 0.95, 0.99];
const TILE_RESOLUTION = 40;
const COMPLETE = 'complete.json';
/** Task 15: the library's files live beside the Bonds ones, fetched (and marked complete) on their own. */
const LIBRARY = 'library';

const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
};

/** --fetch <base URL of a running dev server, e.g. http://localhost:5411/molecules/v3>: download every scan point's basis.json. */
async function fetchAll(baseUrl: string, dir: string): Promise<void> {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(join(dir, COMPLETE))) {
        let count = 0;
        for (const { id } of BONDS_SYSTEMS) {
            if (id === 'h2plus') continue; // exact, no basis
            const scan = await (await fetch(`${baseUrl}/${id}/scan.json`)).json() as { points: Array<{ index: number }> };
            for (const point of scan.points) {
                const index = String(point.index).padStart(2, '0');
                const response = await fetch(`${baseUrl}/${id}/scan/${index}/basis.json`);
                if (!response.ok) throw new Error(`${id} scan point ${index}: HTTP ${response.status}`);
                const basis = await response.json() as MoleculeBasis;
                // As loadBasis does: a basis is named for its scan point.
                writeFileSync(join(dir, `${id}_${index}.json`), JSON.stringify({ ...basis, id: `${id}@${index}` }));
                count++;
            }
        }
        writeFileSync(join(dir, COMPLETE), JSON.stringify({ baseUrl, count, fetched: new Date().toISOString() }));
        console.log(`fetched ${count} basis files into ${dir}`);
    }
    // Task 15: every library molecule's meta.json (its orbitals' roles and its density grid's box) and basis.json.
    const library = join(dir, LIBRARY);
    if (!existsSync(join(library, COMPLETE))) {
        mkdirSync(library, { recursive: true });
        const index = await (await fetch(`${baseUrl}/index.json`)).json() as MoleculeIndexEntry[];
        for (const { id } of index) {
            for (const file of ['meta', 'basis'] as const) {
                const response = await fetch(`${baseUrl}/${id}/${file}.json`);
                if (!response.ok) throw new Error(`${id} ${file}.json: HTTP ${response.status}`);
                const data = await response.json();
                writeFileSync(join(library, `${id}.${file}.json`), JSON.stringify(file === 'basis' ? { ...data, id } : data));
            }
        }
        writeFileSync(join(library, COMPLETE), JSON.stringify({ baseUrl, count: index.length, fetched: new Date().toISOString() }));
        console.log(`fetched ${index.length} library molecules into ${library}`);
    }
}

type Sampled = { samples: Float32Array; side: number; step: number; origin: number };

function sample(basis: MoleculeBasis, index: number, rMax: number, resolution: number): Sampled {
    registerMoleculeBasis(basis);
    return sampleFieldSource({ kind: 'analytic', id: 's', rMax, recipe: { type: 'gaussianMO', moleculeId: basis.id, index } }, resolution);
}

function faceMax({ samples, side }: Sampled): number {
    let max = 0;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        if (i !== 0 && i !== side - 1 && j !== 0 && j !== side - 1 && k !== 0 && k !== side - 1) continue;
        max = Math.max(max, samples[(i * side + j) * side + k] ** 2);
    }
    return max;
}

/** Whether any sample at or above `iso` lies outside the origin-centred cube of half-width `box`. */
function reachesPast({ samples, side, step, origin }: Sampled, iso: number, box: number): boolean {
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        if (samples[(i * side + j) * side + k] ** 2 < iso) continue;
        if (Math.max(Math.abs(origin + i * step), Math.abs(origin + j * step), Math.abs(origin + k * step)) > box + 1e-9) return true;
    }
    return false;
}

/** R25-C: a piece of surface carrying less than this share of the sampled density is not measured (a real sliver, e.g. B₂'s rings). */
const PIECE_SHARE = 0.01;
/** R25-C: pieces smaller than a ball of this many voxels' radius are listed (information). */
const COARSE_PIECE = 2;

/**
 * R25-C: the smallest piece of the surface |ψ|² = iso -- a connected (face-adjacent) set of samples at or
 * above it -- that carries at least PIECE_SHARE of the sampled density, as the radius, in voxels, of a ball
 * of that many samples. A 1s core the grid cannot resolve is a piece of 8 samples (radius 1.24).
 */
function smallestPiece({ samples, side }: Sampled, iso: number): number {
    let total = 0;
    for (let i = 0; i < samples.length; i++) total += samples[i] ** 2;
    const seen = new Uint8Array(samples.length);
    const stack: number[] = [];
    let smallest = Infinity;
    for (let start = 0; start < samples.length; start++) {
        if (seen[start] || samples[start] ** 2 < iso) continue;
        let count = 0, mass = 0;
        seen[start] = 1;
        stack.push(start);
        while (stack.length > 0) {
            const at = stack.pop()!;
            count++;
            mass += samples[at] ** 2;
            const k = at % side, j = Math.floor(at / side) % side, i = Math.floor(at / (side * side));
            const neighbours = [
                i > 0 ? at - side * side : -1, i < side - 1 ? at + side * side : -1,
                j > 0 ? at - side : -1, j < side - 1 ? at + side : -1, k > 0 ? at - 1 : -1, k < side - 1 ? at + 1 : -1,
            ];
            for (const next of neighbours) {
                if (next < 0 || seen[next] || samples[next] ** 2 < iso) continue;
                seen[next] = 1;
                stack.push(next);
            }
        }
        if (mass >= PIECE_SHARE * total) smallest = Math.min(smallest, Math.cbrt((3 * count) / (4 * Math.PI)));
    }
    return smallest;
}

/** R25-C: meshes `request` exactly as the orbital worker does; the reason it refuses, or null when it draws. */
function meshRefusal(request: FieldRenderRequest): string | null {
    try {
        generateFieldMeshes(request);
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

const pct = (f: number) => `${Math.round(f * 100)} %`;
const list = (lines: string[]) => (lines.length === 0 ? 'none' : `\n    ${lines.join('\n    ')}`);

interface MainTally {
    cases: number; points: number; samples: number; samplesBefore: number;
    grown: Map<number, number>; pastOld: Map<number, number>; worstFace: Map<number, { value: number; at: string }>;
    largest: { ratio: number; box: number; at: string }; highest: { resolution: number; at: string };
    /** Every case whose step is coarser than the molecule box's, with its factor and the cap that set it (ruling T16c-cap). */
    coarsened: string[];
    /** A resolution other than view_box's rule gives: a bug. */
    wrongResolution: string[];
    /** Exact-superset reference checks, where the surface comes near the box (face/iso ≥ REFERENCE_FACE). */
    referenced: number; worstIso: { value: number; at: string }; worstLeft: { value: number; at: string }; isoOff: string[];
    cut: string[];
    /** R25-C: cases the worker's mesh refuses ("Could not resolve this surface", no surface). */
    unresolved: string[];
    /** R25-C: the smallest surface piece, in voxels, and every case whose smallest piece is under COARSE_PIECE. */
    smallest: { value: number; at: string }; coarse: string[];
    /** R25-C: compact orbitals sampled in a box smaller than the molecule's; against their exact-superset reference, the most density such a box leaves out and the iso level furthest off. */
    shrunk: number; shrunkLeft: { value: number; at: string }; shrunkIso: { value: number; at: string }; shrunkIsoOff: string[];
}

const newMainTally = (): MainTally => ({
    cases: 0, points: 0, samples: 0, samplesBefore: 0,
    grown: new Map(FRACTIONS.map(f => [f, 0])), pastOld: new Map(FRACTIONS.map(f => [f, 0])),
    worstFace: new Map(FRACTIONS.map(f => [f, { value: 0, at: '' }])),
    largest: { ratio: 1, box: 0, at: '' }, highest: { resolution: 0, at: '' }, coarsened: [], wrongResolution: [],
    referenced: 0, worstIso: { value: 1, at: '' }, worstLeft: { value: 0, at: '' }, isoOff: [], cut: [],
    unresolved: [], smallest: { value: Infinity, at: '' }, coarse: [], shrunk: 0, shrunkLeft: { value: 0, at: '' },
    shrunkIso: { value: 1, at: '' }, shrunkIsoOff: [],
});

/** Where the surface comes this near the box (face/iso), its iso level is also checked against a reference that holds everything. */
const REFERENCE_FACE = Number(arg('reference-face') ?? 0.1);
/** isoLevelForEnclosedFraction's histogram bin, 10^(12/4096); two bins is the tolerance reported. */
const ISO_TWO_BINS = 10 ** (24 / 4096);

/**
 * The exact-superset reference for a main-view grid (box B, resolution N): the same step and centre, padded by
 * ⌈N/2⌉ steps a side, so the view's samples are exactly the reference's middle. Returns iso view/ref and the
 * reference's share of the density outside the view's box.
 */
function againstReference(source: AnalyticFieldSource, resolution: number, viewIso: number, fraction: number): { isoRatio: number; left: number } {
    const step = (2 * source.rMax) / resolution;
    const pad = Math.ceil(resolution / 2);
    const reference = sampleFieldSource({ ...source, rMax: source.rMax + pad * step }, resolution + 2 * pad);
    const side = reference.side;
    let total = 0, inside = 0;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        const d = reference.samples[(i * side + j) * side + k] ** 2;
        total += d;
        if (i >= pad && i <= pad + resolution && j >= pad && j <= pad + resolution && k >= pad && k <= pad + resolution) inside += d;
    }
    return { isoRatio: viewIso / isoLevelForEnclosedFraction(reference.samples, fraction), left: 1 - inside / total };
}

/**
 * One point or molecule: `requestFor(orbital, f)` is the app's own main-view request (ruling T16c-I1: each
 * orbital its own box). `oldBox` and `baseResolution` are the box and resolution every orbital was drawn in
 * before Task 16c; `nao` the basis's size, which the mesh budget caps the resolution by.
 */
function checkMainView(
    tally: MainTally, name: string, orbitals: readonly BasisOrbital[], oldBox: number, baseResolution: number, nao: number,
    requestFor: (orbital: BasisOrbital, fraction: number) => FieldRenderRequest,
): void {
    tally.points++;
    const grown = new Set<number>();
    for (const orbital of orbitals) {
        // The same box and resolution at two fractions is the same grid: sampled once.
        const grids = new Map<string, Sampled>();
        for (const f of FRACTIONS) {
            tally.cases++;
            const request = requestFor(orbital, f);
            const [source] = request.sources;
            const box = source.rMax;
            const { resolution } = request;
            const label = `${name} ${orbital.label}${orbital.spin === 'restricted' ? '' : ` (${orbital.spin})`} at ${pct(f)}`;
            tally.samples += (resolution + 1) ** 3;
            tally.samplesBefore += (baseResolution + 1) ** 3;
            if (box > oldBox) grown.add(f);
            if (box / oldBox > tally.largest.ratio) tally.largest = { ratio: box / oldBox, box, at: label };
            if (resolution > tally.highest.resolution) tally.highest = { resolution, at: label };
            if (resolution !== viewResolution(baseResolution, oldBox, box, nao)) tally.wrongResolution.push(`${label}: ${resolution}`);
            const factor = (box / resolution) / (oldBox / baseResolution);
            if (factor > 1 + 1e-12) {
                const cap = resolution >= MAX_VIEW_RESOLUTION ? `the resolution cap ${MAX_VIEW_RESOLUTION}`
                    : resolution === baseResolution ? `the mesh budget (${nao} basis functions: no growth past ${baseResolution})`
                        : `the mesh budget (${nao} basis functions)`;
                tally.coarsened.push(`${label}: box ${box.toFixed(2)} a₀ @ ${resolution}, step ×${factor.toFixed(3)} (${cap})`);
            }
            const grid = `${box}|${resolution}`;
            if (!grids.has(grid)) {
                request.bases?.forEach(registerMoleculeBasis);
                grids.set(grid, sampleFieldSource(source, resolution));
            }
            const sampled = grids.get(grid)!;
            const iso = isoLevelForEnclosedFraction(sampled.samples, f);
            const ratio = faceMax(sampled) / iso;
            const worst = tally.worstFace.get(f)!;
            if (ratio > worst.value) { worst.value = ratio; worst.at = label; }
            if (reachesPast(sampled, iso, oldBox)) tally.pastOld.set(f, tally.pastOld.get(f)! + 1);
            if (ratio >= 1) tally.cut.push(`${label}: box ${box.toFixed(2)} a₀ at ${resolution}, face/iso ${ratio.toFixed(3)}`);
            const refusal = meshRefusal(request);
            if (refusal) tally.unresolved.push(`${label}: box ${box.toFixed(2)} a₀ at ${resolution}: ${refusal}`);
            const piece = smallestPiece(sampled, iso);
            if (piece < tally.smallest.value) tally.smallest = { value: piece, at: label };
            if (piece < COARSE_PIECE) tally.coarse.push(`${label}: ${piece.toFixed(2)} voxels (box ${box.toFixed(2)} a₀ at ${resolution})`);
            if (box < oldBox) {
                // R25-C: a compact box is always checked against the exact-superset reference (twice its width,
                // the same step): what it leaves out, and its iso level against one that holds everything.
                tally.shrunk++;
                const { isoRatio, left } = againstReference(source, resolution, iso, f);
                if (left > tally.shrunkLeft.value) tally.shrunkLeft = { value: left, at: label };
                const off = Math.max(isoRatio, 1 / isoRatio);
                if (off > tally.shrunkIso.value) tally.shrunkIso = { value: off, at: label };
                if (off > ISO_TWO_BINS) tally.shrunkIsoOff.push(`${label}: iso view/ref ${isoRatio.toFixed(4)}, left out ${(100 * left).toFixed(4)} %`);
            }
            if (ratio >= REFERENCE_FACE) {
                tally.referenced++;
                const { isoRatio, left } = againstReference(source, resolution, iso, f);
                if (isoRatio > tally.worstIso.value) tally.worstIso = { value: isoRatio, at: label };
                if (left > tally.worstLeft.value) tally.worstLeft = { value: left, at: label };
                if (isoRatio > ISO_TWO_BINS) tally.isoOff.push(`${label}: iso view/ref ${isoRatio.toFixed(4)}, left out ${(100 * left).toFixed(3)} %`);
            }
        }
    }
    for (const f of grown) tally.grown.set(f, tally.grown.get(f)! + 1);
}

function reportMain(title: string, tally: MainTally): void {
    console.log(`${title} main view: ${tally.points} points, ${tally.cases} orbital × fraction cases`);
    for (const f of FRACTIONS) {
        const worst = tally.worstFace.get(f)!;
        console.log(`  at ${pct(f)}: some orbital's box grown at ${tally.grown.get(f)} of ${tally.points}; `
            + `${tally.pastOld.get(f)} surfaces reach past the molecule's own box (cut before Task 16c); `
            + `worst face/iso ${worst.value.toFixed(4)} (${worst.at})`);
    }
    console.log(`  mean samples per mesh ${(tally.samples / tally.cases / 1e6).toFixed(3)} M (before Task 16c ${(tally.samplesBefore / tally.cases / 1e6).toFixed(3)} M); `
        + `largest box ${tally.largest.box.toFixed(2)} a₀, ${tally.largest.ratio.toFixed(3)} × the molecule's (${tally.largest.at}); `
        + `highest resolution ${tally.highest.resolution} (${(tally.highest.resolution + 1) ** 3} samples, ${tally.highest.at})`);
    console.log(`  iso level against an exact-superset reference, ${tally.referenced} cases with face/iso ≥ ${REFERENCE_FACE}: `
        + `worst iso view/ref ${tally.worstIso.value.toFixed(4)} (${tally.worstIso.at}), worst left out ${(100 * tally.worstLeft.value).toFixed(3)} % (${tally.worstLeft.at}); `
        + `beyond two histogram bins: ${list(tally.isoOff)}`);
    console.log(`  step coarser than the molecule box's (ruling T16c-cap), ${tally.coarsened.length} cases: ${list(tally.coarsened)}`);
    console.log(`  resolution other than view_box's rule (a bug): ${list(tally.wrongResolution)}`);
    console.log(`  cores sampled in their own compact box (R25-C), ${tally.shrunk} cases, against an exact-superset reference: `
        + `most left out ${(100 * tally.shrunkLeft.value).toFixed(4)} % (${tally.shrunkLeft.at || 'none'}), `
        + `iso furthest off ×${tally.shrunkIso.value.toFixed(4)} (${tally.shrunkIso.at || 'none'}); beyond two histogram bins: ${list(tally.shrunkIsoOff)}`);
    console.log(`  smallest surface piece carrying ≥ ${100 * PIECE_SHARE} % of the density: ${tally.smallest.value.toFixed(2)} voxels (${tally.smallest.at}); `
        + `under ${COARSE_PIECE} voxels (information), ${tally.coarse.length} cases: ${list(tally.coarse)}`);
    console.log(`  CUT: ${list(tally.cut)}`);
    console.log(`  UNRESOLVED: ${list(tally.unresolved)}`);
}

interface TileTally {
    cases: number; fitted: number; mainBox: number; worstLeft: number; worstLeftAt: string;
    worstFace: Map<number, { value: number; at: string }>; cut: string[];
    /** R25-C: tiles the worker's mesh refuses. */
    unresolved: string[];
}

const newTileTally = (): TileTally => ({
    cases: 0, fitted: 0, mainBox: 0, worstLeft: 0, worstLeftAt: '',
    worstFace: new Map(FRACTIONS.map(f => [f, { value: 0, at: '' }])), cut: [], unresolved: [],
});

/** One orbital's tile: `limitFor(f)` is the box fitToOrbital fits within -- the molecule's, or the orbital's originReach where further (ruling T16c-I1). */
function checkTile(
    tally: TileTally, name: string, basis: MoleculeBasis, index: number, limitFor: (fraction: number) => number,
    /** R25-C (review M3): the strip's own tile request at this fraction -- fitToOrbital on its probe-free request, at 40³. */
    tileFor: (fraction: number) => FieldRenderRequest,
): void {
    const fitted = orbitalBox(basis, index, Infinity);
    let tile: Sampled | null = null;
    const mainBoxTiles = new Map<number, Sampled>();
    for (const f of FRACTIONS) {
        tally.cases++;
        const limit = limitFor(f);
        let sampled: Sampled;
        const meshed = tileFor(f);
        meshed.bases?.forEach(registerMoleculeBasis);
        const refusal = meshRefusal(meshed);
        if (refusal) tally.unresolved.push(`${name} at ${pct(f)}: ${refusal}`);
        if (fitted.halfWidth >= limit) {
            // fitToOrbital keeps the limit box itself.
            tally.mainBox++;
            if (!mainBoxTiles.has(limit)) mainBoxTiles.set(limit, sample(basis, index, limit, TILE_RESOLUTION));
            sampled = mainBoxTiles.get(limit)!;
        } else {
            tally.fitted++;
            if (!tile) {
                const moved = basisCentredOn(basis, fitted.centre);
                tile = sample(moved, index, fitted.halfWidth, TILE_RESOLUTION);
                const reference = sample(moved, index, 2 * fitted.halfWidth, 2 * TILE_RESOLUTION);
                // The tile's grid is the reference's middle (indices 20…60): what lies outside it is left out.
                const side = reference.side;
                let total = 0, inside = 0;
                for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
                    const d = reference.samples[(i * side + j) * side + k] ** 2;
                    total += d;
                    if (i >= 20 && i <= 60 && j >= 20 && j <= 60 && k >= 20 && k <= 60) inside += d;
                }
                const left = 1 - inside / total;
                if (left > tally.worstLeft) { tally.worstLeft = left; tally.worstLeftAt = name; }
            }
            sampled = tile;
        }
        const ratio = faceMax(sampled) / isoLevelForEnclosedFraction(sampled.samples, f);
        const worst = tally.worstFace.get(f)!;
        if (ratio > worst.value) { worst.value = ratio; worst.at = name; }
        if (ratio >= 1) {
            const box = fitted.halfWidth >= limit ? `the main view's box ${limit.toFixed(2)} a₀` : `fitted box ${fitted.halfWidth.toFixed(2)} of ${limit.toFixed(2)} a₀`;
            tally.cut.push(`${name} at ${pct(f)}: ${box}, face/iso ${ratio.toFixed(3)}`);
        }
    }
}

function reportTiles(title: string, tally: TileTally): void {
    console.log(`${title} strip tiles: ${tally.cases} tile × fraction cases: fitted ${tally.fitted}, in their limit box ${tally.mainBox}`);
    for (const f of FRACTIONS) {
        const worst = tally.worstFace.get(f)!;
        console.log(`  at ${pct(f)}: worst face/iso ${worst.value.toFixed(4)} (${worst.at})`);
    }
    console.log(`  worst left-out density of a fitted tile ${(100 * tally.worstLeft).toFixed(3)} % (${tally.worstLeftAt})`);
    console.log(`  CUT: ${list(tally.cut)}`);
    console.log(`  UNRESOLVED: ${list(tally.unresolved)}`);
}

/** Bonds' main-view request for one orbital of a scan point, as App asks for it. */
function bondsRequest(system: BondsSystemId, point: number, basis: MoleculeBasis, orbital: BasisOrbital, fraction: number, probe = true): FieldRenderRequest {
    const component = basis.orbitals.filter(o => o.label === orbital.label && o.spin === orbital.spin).indexOf(orbital);
    const state = reducer(reducer(reducer(undefined, selectBondsSystem(system)), setScanPoint({ index: point, RBohr: 1 })),
        setBondsView({ kind: 'mo', label: orbital.label, spin: orbital.spin, component }));
    const built = bondsFieldRequest(state, basis, fraction, { probe });
    if (!built || built.note || built.request.sources[0].recipe.type !== 'gaussianMO') throw new Error(`${basis.id} ${orbital.label}: no orbital request`);
    return built.request;
}

interface Options { main: boolean; tiles: boolean }
interface Tallies { bondsMain: MainTally; bondsTiles: TileTally; libraryMain: MainTally; libraryTiles: TileTally; files: number; molecules: number }

const newTallies = (): Tallies => ({
    bondsMain: newMainTally(), bondsTiles: newTileTally(), libraryMain: newMainTally(), libraryTiles: newTileTally(), files: 0, molecules: 0,
});

/** One Bonds scan point: every orbital in the main view and as a strip tile (the Bonds list and strip offer each). */
function sweepBondsFile(dir: string, file: string, { main, tiles }: Options, t: Tallies): void {
    t.files++;
    const basis: MoleculeBasis = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const [system, point] = basis.id.split('@') as [BondsSystemId, string];
    const requestFor = (orbital: BasisOrbital, f: number) => bondsRequest(system, Number(point), basis, orbital, f);
    const moleculeBox = Math.max(...basis.atoms.map(atom => Math.hypot(...atom))) + MOLECULE_PADDING;
    if (main) checkMainView(t.bondsMain, basis.id, basis.orbitals, moleculeBox, BONDS_RESOLUTION, basis.nao, requestFor);
    if (!tiles) return;
    const moved = new Map<string, MoleculeBasis>();
    for (const orbital of basis.orbitals) {
        checkTile(t.bondsTiles, `${basis.id} ${orbital.label}${orbital.spin === 'restricted' ? '' : ` (${orbital.spin})`}`, basis, orbital.index,
            () => Math.max(moleculeBox, originReach(basis, orbital.index)),
            // As bonds_strip_items.ts builds it: the probe-free request, fitted, at the strip's resolution.
            f => ({ ...fitToOrbital(bondsRequest(system, Number(point), basis, orbital, f, false), basis, moved), resolution: BONDS_THUMB_RESOLUTION }));
    }
}

/** One library molecule: every orbital in the main view, the frontier orbitals as strip tiles (Task 15). */
function sweepLibraryMolecule(dir: string, id: string, { main, tiles }: Options, t: Tallies): void {
    t.molecules++;
    const library = join(dir, LIBRARY);
    const meta = JSON.parse(readFileSync(join(library, `${id}.meta.json`), 'utf8')) as LibraryMoleculeMeta;
    const basis: MoleculeBasis = JSON.parse(readFileSync(join(library, `${id}.basis.json`), 'utf8'));
    const requestFor = (orbital: { index: number }, f: number) => {
        const plan = planMoleculeRender(meta, { kind: 'mo', index: orbital.index }, f, basis);
        if (plan.kind !== 'mo') throw new Error(`${id}: no orbital plan`);
        return plan.request;
    };
    const orbitals = meta.orbitals.map(o => basis.orbitals[o.index]);
    if (main) checkMainView(t.libraryMain, id, orbitals, gridHalfWidth(meta), MOLECULE_MO_RESOLUTION, basis.nao, requestFor);
    if (!tiles) return;
    const moved = new Map<string, MoleculeBasis>();
    for (const { role, orbital } of frontierOrbitals(meta.orbitals)) {
        checkTile(t.libraryTiles, `${id} ${role} ${orbital.label}`, basis, orbital.index, () => Math.max(gridHalfWidth(meta), originReach(basis, orbital.index)),
            // As molecule_strip_items.ts builds it: the probe-free plan at the strip's resolution, fitted.
            f => {
                const plan = planMoleculeRender(meta, { kind: 'mo', index: orbital.index }, f, basis, { probe: false });
                if (plan.kind !== 'mo') throw new Error(`${id}: no orbital plan`);
                return fitToOrbital({ ...plan.request, resolution: MO_THUMB_RESOLUTION }, basis, moved);
            });
    }
}

type Job = { kind: 'bonds' | 'library'; name: string };

function runJobs(dir: string, jobs: Job[], options: Options): Tallies {
    const t = newTallies();
    for (const job of jobs) (job.kind === 'bonds' ? sweepBondsFile : sweepLibraryMolecule)(dir, job.name, options, t);
    return t;
}

function mergeMain(a: MainTally, b: MainTally): MainTally {
    const sum = (x: Map<number, number>, y: Map<number, number>) => new Map(FRACTIONS.map(f => [f, x.get(f)! + y.get(f)!]));
    const larger = <T extends { value: number }>(x: T, y: T) => (x.value >= y.value ? x : y);
    return {
        cases: a.cases + b.cases, points: a.points + b.points, samples: a.samples + b.samples, samplesBefore: a.samplesBefore + b.samplesBefore,
        grown: sum(a.grown, b.grown), pastOld: sum(a.pastOld, b.pastOld),
        worstFace: new Map(FRACTIONS.map(f => [f, larger(a.worstFace.get(f)!, b.worstFace.get(f)!)])),
        largest: a.largest.ratio >= b.largest.ratio ? a.largest : b.largest,
        highest: a.highest.resolution >= b.highest.resolution ? a.highest : b.highest,
        coarsened: [...a.coarsened, ...b.coarsened], wrongResolution: [...a.wrongResolution, ...b.wrongResolution],
        referenced: a.referenced + b.referenced, worstIso: larger(a.worstIso, b.worstIso), worstLeft: larger(a.worstLeft, b.worstLeft),
        isoOff: [...a.isoOff, ...b.isoOff], cut: [...a.cut, ...b.cut],
        unresolved: [...a.unresolved, ...b.unresolved], smallest: a.smallest.value <= b.smallest.value ? a.smallest : b.smallest,
        coarse: [...a.coarse, ...b.coarse], shrunk: a.shrunk + b.shrunk, shrunkLeft: larger(a.shrunkLeft, b.shrunkLeft),
        shrunkIso: larger(a.shrunkIso, b.shrunkIso), shrunkIsoOff: [...a.shrunkIsoOff, ...b.shrunkIsoOff],
    };
}

function mergeTiles(a: TileTally, b: TileTally): TileTally {
    const left = a.worstLeft >= b.worstLeft ? a : b;
    return {
        cases: a.cases + b.cases, fitted: a.fitted + b.fitted, mainBox: a.mainBox + b.mainBox, worstLeft: left.worstLeft, worstLeftAt: left.worstLeftAt,
        worstFace: new Map(FRACTIONS.map(f => [f, a.worstFace.get(f)!.value >= b.worstFace.get(f)!.value ? a.worstFace.get(f)! : b.worstFace.get(f)!])),
        cut: [...a.cut, ...b.cut], unresolved: [...a.unresolved, ...b.unresolved],
    };
}

const merge = (a: Tallies, b: Tallies): Tallies => ({
    bondsMain: mergeMain(a.bondsMain, b.bondsMain), bondsTiles: mergeTiles(a.bondsTiles, b.bondsTiles),
    libraryMain: mergeMain(a.libraryMain, b.libraryMain), libraryTiles: mergeTiles(a.libraryTiles, b.libraryTiles),
    files: a.files + b.files, molecules: a.molecules + b.molecules,
});

async function main(): Promise<void> {
    const dir = arg('data');
    if (!dir) throw new Error('--data DIR is required');
    const fetchFrom = arg('fetch');
    if (fetchFrom) { await fetchAll(fetchFrom, dir); return; }
    for (const marker of [join(dir, COMPLETE), join(dir, LIBRARY, COMPLETE)]) {
        if (!existsSync(marker)) throw new Error(`${marker} is missing: fetch the data first (validate_tile_boxes.mjs does)`);
    }
    const started = Date.now();
    const only = arg('only');
    const options: Options = { main: !process.argv.includes('--skip-main'), tiles: !process.argv.includes('--skip-tiles') };
    const jobs: Job[] = [
        ...readdirSync(dir).filter(f => /_\d\d\.json$/.test(f) && (!only || f.startsWith(only))).sort().map(name => ({ kind: 'bonds' as const, name })),
        ...readdirSync(join(dir, LIBRARY)).filter(f => f.endsWith('.meta.json')).map(f => f.slice(0, -'.meta.json'.length))
            .filter(id => !only || id.startsWith(only)).sort().map(name => ({ kind: 'library' as const, name })),
    ];
    // --jobs N: the files are shared round-robin among N worker threads, and their tallies merged.
    const threads = Math.max(1, Math.min(jobs.length, Number(arg('jobs') ?? 1)));
    let tallies: Tallies;
    if (threads === 1) tallies = runJobs(dir, jobs, options);
    else {
        const shares = Array.from({ length: threads }, (_, n) => jobs.filter((_, i) => i % threads === n));
        const results = await Promise.all(shares.map(share => new Promise<Tallies>((done, fail) => {
            const worker = new Worker(__filename, { workerData: { dir, jobs: share, options } });
            worker.once('message', done);
            worker.once('error', fail);
        })));
        tallies = results.reduce(merge);
    }
    const { bondsMain, bondsTiles, libraryMain, libraryTiles, files, molecules } = tallies;
    if (options.main) reportMain(`Bonds (${files} basis files)`, bondsMain);
    if (options.tiles) reportTiles('Bonds', bondsTiles);
    if (options.main) reportMain(`Molecules (${molecules} library molecules)`, libraryMain);
    if (options.tiles) reportTiles('Molecules (frontier)', libraryTiles);
    const cuts = bondsMain.cut.length + bondsTiles.cut.length + libraryMain.cut.length + libraryTiles.cut.length;
    const unresolved = bondsMain.unresolved.length + bondsTiles.unresolved.length + libraryMain.unresolved.length + libraryTiles.unresolved.length;
    console.log(`${cuts} cut, ${unresolved} unresolved; swept in ${((Date.now() - started) / 1000).toFixed(0)} s on ${threads} thread${threads === 1 ? '' : 's'}`);
    process.exitCode = cuts + unresolved > 0 ? 1 : 0;
}

if (isMainThread) main().catch(error => { console.error(error); process.exitCode = 2; });
else {
    const { dir, jobs, options } = workerData as { dir: string; jobs: Job[]; options: Options };
    parentPort!.postMessage(runJobs(dir, jobs, options));
}
