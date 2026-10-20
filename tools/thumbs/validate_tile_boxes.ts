// On-demand proof for rulings T10-core / T10-core-I1/I2 and T10-mainbox (Task 16c): no surface the app draws
// for a Bonds or library orbital is cut by the box it is sampled in -- neither the main view's nor a strip
// tile's. Bundled and run by validate_tile_boxes.mjs (which also fetches the data); not part of the app or the
// jest suite.
//
// MAIN VIEW (ruling T10-mainbox). For every basis.json of every Bonds molecule at every scan point, every
// orbital (the Bonds list offers each), and every library molecule's every orbital (the Molecules list
// offers each), at 90, 95 and 99 %: the request the app sends -- bondsFieldRequest / planMoleculeRender,
// so the box and resolution are view_box.ts's as shipped -- is sampled exactly as the orbital worker
// samples it (sampleFieldSource at the request's own box and resolution), its iso level found as the worker
// finds it (isoLevelForEnclosedFraction), and
//   - face/iso = the largest |ψ|² on the box's six faces over that iso level. ≥ 1 means the surface crosses
//     a face: the main view would draw it open there. Any such case is a CUT (exit code 1);
//   - "past the molecule's box" counts the surfaces with a sample at or above the iso level outside the
//     molecule's own box (Bonds: the farthest atom + MOLECULE_PADDING; Molecules: the density grid's) --
//     the surfaces that box cut before Task 16c;
//   - the step 2·rMax/resolution is checked against the molecule box's (no coarser, unless capped).
//
// STRIP TILES (rulings T10-core, Task 15). Every Bonds orbital and every library molecule's frontier tiles
// (HOMO, SOMO, LUMO, LVMO -- frontierOrbitals): fitToOrbital fits a tile within the main view's box at that
// fraction (its `limit`, now view_box.ts's). A fitted tile is sampled exactly as the strip samples it -- 40³,
// the basis moved to the box's centre (basisCentredOn) -- and so is a reference with the SAME step and SAME
// centre in a box twice as wide (80³). The tile's samples are then an exact subset of the reference's, so:
//   - left-out density = the reference's share outside the tile box;
//   - face/iso = as above, on the tile's own 40³ grid and iso level. ≥ 1 is a CUT (exit code 1).
// A tile that keeps the main view's box is sampled at 40³ in that box and checked the same way.
//   node tools/thumbs/validate_tile_boxes.mjs [--data DIR] [--port 5411] [--only c2] [--jobs 8] [--skip-main] [--skip-tiles]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { basisCentredOn, orbitalBox } from '../../src/molecules/orbital_box';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { sampleFieldSource } from '../../src/orbital_mesh';
import { isoLevelForEnclosedFraction } from '../../src/radial_distribution';
import { BONDS_RESOLUTION, BONDS_SYSTEMS, BondsSystemId, MOLECULE_PADDING } from '../../src/bonds/systems';
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import reducer, { selectBondsSystem, setBondsView, setScanPoint } from '../../src/store/bondsSlice';
import { gridHalfWidth, MOLECULE_MO_RESOLUTION, planMoleculeRender } from '../../src/molecules/render_plan';
import { MAX_VIEW_RESOLUTION } from '../../src/molecules/view_box';
import { frontierOrbitals } from '../../src/molecules/orbital_display';
import type { FieldRenderRequest } from '../../src/field_source';
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

const pct = (f: number) => `${Math.round(f * 100)} %`;
const list = (lines: string[]) => (lines.length === 0 ? 'none' : `\n    ${lines.join('\n    ')}`);

interface MainTally {
    cases: number; points: number;
    grown: Map<number, number>; pastOld: Map<number, number>; worstFace: Map<number, { value: number; at: string }>;
    largest: { ratio: number; box: number; at: string }; highest: { resolution: number; at: string };
    capped: string[]; coarser: string[]; cut: string[];
}

const newMainTally = (): MainTally => ({
    cases: 0, points: 0,
    grown: new Map(FRACTIONS.map(f => [f, 0])), pastOld: new Map(FRACTIONS.map(f => [f, 0])),
    worstFace: new Map(FRACTIONS.map(f => [f, { value: 0, at: '' }])),
    largest: { ratio: 1, box: 0, at: '' }, highest: { resolution: 0, at: '' }, capped: [], coarser: [], cut: [],
});

/**
 * One point or molecule: `requestFor(orbital, f)` is the app's own main-view request. `oldBox` and
 * `baseResolution` are the box and resolution every orbital was drawn in before Task 16c.
 */
function checkMainView(
    tally: MainTally, name: string, orbitals: readonly BasisOrbital[], oldBox: number, baseResolution: number,
    requestFor: (orbital: BasisOrbital, fraction: number) => FieldRenderRequest,
): void {
    tally.points++;
    const boxes = new Map<number, { box: number; resolution: number }>();
    for (const f of FRACTIONS) {
        const first = requestFor(orbitals[0], f);
        const box = first.sources[0].rMax;
        const resolution = first.resolution;
        boxes.set(f, { box, resolution });
        if (box > oldBox) tally.grown.set(f, tally.grown.get(f)! + 1);
        const where = `${name} at ${pct(f)}`;
        if (box / oldBox > tally.largest.ratio) tally.largest = { ratio: box / oldBox, box, at: where };
        if (resolution > tally.highest.resolution) tally.highest = { resolution, at: where };
        if ((2 * box) / resolution > (2 * oldBox) / baseResolution * (1 + 1e-12)) {
            (resolution >= MAX_VIEW_RESOLUTION ? tally.capped : tally.coarser).push(`${where}: box ${box.toFixed(2)} a₀ at ${resolution}`);
        }
    }
    for (const orbital of orbitals) {
        // The same box and resolution at two fractions is the same grid: sampled once.
        const grids = new Map<string, Sampled>();
        for (const f of FRACTIONS) {
            const { box, resolution } = boxes.get(f)!;
            tally.cases++;
            const request = requestFor(orbital, f);
            const [source] = request.sources;
            const label = `${name} ${orbital.label}${orbital.spin === 'restricted' ? '' : ` (${orbital.spin})`} at ${pct(f)}`;
            // Ruling T10-mainbox: one box per (point, fraction), whatever the orbital.
            if (source.rMax !== box || request.resolution !== resolution) tally.cut.push(`${label}: box ${source.rMax} differs from the point's ${box}`);
            const grid = `${source.rMax}|${request.resolution}`;
            if (!grids.has(grid)) {
                request.bases?.forEach(registerMoleculeBasis);
                grids.set(grid, sampleFieldSource(source, request.resolution));
            }
            const sampled = grids.get(grid)!;
            const iso = isoLevelForEnclosedFraction(sampled.samples, f);
            const ratio = faceMax(sampled) / iso;
            const worst = tally.worstFace.get(f)!;
            if (ratio > worst.value) { worst.value = ratio; worst.at = label; }
            if (reachesPast(sampled, iso, oldBox)) tally.pastOld.set(f, tally.pastOld.get(f)! + 1);
            if (ratio >= 1) tally.cut.push(`${label}: box ${box.toFixed(2)} a₀ at ${resolution}, face/iso ${ratio.toFixed(3)}`);
        }
    }
}

function reportMain(title: string, tally: MainTally): void {
    console.log(`${title} main view: ${tally.points} points, ${tally.cases} orbital × fraction cases`);
    for (const f of FRACTIONS) {
        const worst = tally.worstFace.get(f)!;
        console.log(`  at ${pct(f)}: box grown at ${tally.grown.get(f)} of ${tally.points}; `
            + `${tally.pastOld.get(f)} surfaces reach past the molecule's own box (cut before Task 16c); `
            + `worst face/iso ${worst.value.toFixed(4)} (${worst.at})`);
    }
    console.log(`  largest box ${tally.largest.box.toFixed(2)} a₀, ${tally.largest.ratio.toFixed(3)} × the molecule's (${tally.largest.at}); `
        + `highest resolution ${tally.highest.resolution} (${(tally.highest.resolution + 1) ** 3} samples, ${tally.highest.at})`);
    console.log(`  step coarser than the molecule box's, at the resolution cap ${MAX_VIEW_RESOLUTION}: ${list(tally.capped)}`);
    console.log(`  step coarser than the molecule box's, under the cap (a bug): ${list(tally.coarser)}`);
    console.log(`  CUT: ${list(tally.cut)}`);
}

interface TileTally {
    cases: number; fitted: number; mainBox: number; worstLeft: number; worstLeftAt: string;
    worstFace: Map<number, { value: number; at: string }>; cut: string[];
}

const newTileTally = (): TileTally => ({
    cases: 0, fitted: 0, mainBox: 0, worstLeft: 0, worstLeftAt: '',
    worstFace: new Map(FRACTIONS.map(f => [f, { value: 0, at: '' }])), cut: [],
});

/** One orbital's tile: `limitFor(f)` is the main view's box at that fraction, the box fitToOrbital fits within. */
function checkTile(tally: TileTally, name: string, basis: MoleculeBasis, index: number, limitFor: (fraction: number) => number): void {
    const fitted = orbitalBox(basis, index, Infinity);
    let tile: Sampled | null = null;
    const mainBoxTiles = new Map<number, Sampled>();
    for (const f of FRACTIONS) {
        tally.cases++;
        const limit = limitFor(f);
        let sampled: Sampled;
        if (fitted.halfWidth >= limit) {
            // fitToOrbital keeps the main view's own box.
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
    console.log(`${title} strip tiles: ${tally.cases} tile × fraction cases: fitted ${tally.fitted}, in the main view's box ${tally.mainBox}`);
    for (const f of FRACTIONS) {
        const worst = tally.worstFace.get(f)!;
        console.log(`  at ${pct(f)}: worst face/iso ${worst.value.toFixed(4)} (${worst.at})`);
    }
    console.log(`  worst left-out density of a fitted tile ${(100 * tally.worstLeft).toFixed(3)} % (${tally.worstLeftAt})`);
    console.log(`  CUT: ${list(tally.cut)}`);
}

/** Bonds' main-view request for one orbital of a scan point, as App asks for it. */
function bondsRequest(system: BondsSystemId, point: number, basis: MoleculeBasis, orbital: BasisOrbital, fraction: number): FieldRenderRequest {
    const component = basis.orbitals.filter(o => o.label === orbital.label && o.spin === orbital.spin).indexOf(orbital);
    const state = reducer(reducer(reducer(undefined, selectBondsSystem(system)), setScanPoint({ index: point, RBohr: 1 })),
        setBondsView({ kind: 'mo', label: orbital.label, spin: orbital.spin, component }));
    const built = bondsFieldRequest(state, basis, fraction);
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
    if (main) checkMainView(t.bondsMain, basis.id, basis.orbitals, moleculeBox, BONDS_RESOLUTION, requestFor);
    if (!tiles) return;
    for (const orbital of basis.orbitals) {
        checkTile(t.bondsTiles, `${basis.id} ${orbital.label}${orbital.spin === 'restricted' ? '' : ` (${orbital.spin})`}`, basis, orbital.index,
            f => requestFor(orbital, f).sources[0].rMax);
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
    if (main) checkMainView(t.libraryMain, id, orbitals, gridHalfWidth(meta), MOLECULE_MO_RESOLUTION, requestFor);
    if (!tiles) return;
    for (const { role, orbital } of frontierOrbitals(meta.orbitals)) {
        checkTile(t.libraryTiles, `${id} ${role} ${orbital.label}`, basis, orbital.index, f => requestFor(orbital, f).sources[0].rMax);
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
    return {
        cases: a.cases + b.cases, points: a.points + b.points, grown: sum(a.grown, b.grown), pastOld: sum(a.pastOld, b.pastOld),
        worstFace: new Map(FRACTIONS.map(f => [f, a.worstFace.get(f)!.value >= b.worstFace.get(f)!.value ? a.worstFace.get(f)! : b.worstFace.get(f)!])),
        largest: a.largest.ratio >= b.largest.ratio ? a.largest : b.largest,
        highest: a.highest.resolution >= b.highest.resolution ? a.highest : b.highest,
        capped: [...a.capped, ...b.capped], coarser: [...a.coarser, ...b.coarser], cut: [...a.cut, ...b.cut],
    };
}

function mergeTiles(a: TileTally, b: TileTally): TileTally {
    const left = a.worstLeft >= b.worstLeft ? a : b;
    return {
        cases: a.cases + b.cases, fitted: a.fitted + b.fitted, mainBox: a.mainBox + b.mainBox, worstLeft: left.worstLeft, worstLeftAt: left.worstLeftAt,
        worstFace: new Map(FRACTIONS.map(f => [f, a.worstFace.get(f)!.value >= b.worstFace.get(f)!.value ? a.worstFace.get(f)! : b.worstFace.get(f)!])),
        cut: [...a.cut, ...b.cut],
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
    console.log(`${cuts} cut; swept in ${((Date.now() - started) / 1000).toFixed(0)} s on ${threads} thread${threads === 1 ? '' : 's'}`);
    process.exitCode = cuts > 0 ? 1 : 0;
}

if (isMainThread) main().catch(error => { console.error(error); process.exitCode = 2; });
else {
    const { dir, jobs, options } = workerData as { dir: string; jobs: Job[]; options: Options };
    parentPort!.postMessage(runJobs(dir, jobs, options));
}
