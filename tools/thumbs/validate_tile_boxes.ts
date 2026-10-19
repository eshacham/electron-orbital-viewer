// On-demand proof for rulings T10-core / T10-core-I1/I2: no Bonds strip tile's surface is cut by
// the box it is meshed in -- and, since Task 15, no Molecules strip tile's: every library
// molecule's frontier orbitals (HOMO, SOMO, LUMO, LVMO -- the tiles frontierOrbitals gives the
// strip), fitted within the density grid's box the main view draws every orbital in. Bundled and
// run by validate_tile_boxes.mjs (which also fetches the data); not part of the app or the jest suite.
//
// For every basis.json of every Bonds molecule at every scan point, and every orbital whose tile
// gets a fitted box (orbitalBox), the tile is sampled exactly as the strip samples it -- 40³, the
// basis moved to the box's centre (basisCentredOn) -- and so is a reference with the SAME step and
// SAME centre in a box twice as wide (80³). The tile's samples are then an exact subset of the
// reference's, so:
//   - left-out density = the reference's share outside the tile box;
//   - iso tile/ref = how far the tile's iso level is off for that reason alone;
//   - face/iso = the largest |ψ|² on the tile box's six faces over the tile's own iso level. ≥ 1
//     means the surface crosses a face: the tile is cut open.
// A cut tile is compared with the tile as it was before ruling T10-core (the whole molecule's box,
// 40³): cut there too = "already clipped on the molecule box"; whole there = a REGRESSION.
// Exit code 1 if there is any regression.
//   node tools/thumbs/validate_tile_boxes.mjs [--data DIR] [--port 5411] [--only c2]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { basisCentredOn, orbitalBox } from '../../src/molecules/orbital_box';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { sampleFieldSource } from '../../src/orbital_mesh';
import { isoLevelForEnclosedFraction } from '../../src/radial_distribution';
import { BONDS_SYSTEMS, MOLECULE_PADDING } from '../../src/bonds/systems';
import { frontierOrbitals } from '../../src/molecules/orbital_display';
import type { MoleculeBasis, MoleculeIndexEntry, MoleculeMeta } from '../../src/molecules/types';

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

type Sampled = { samples: Float32Array; side: number };

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

interface Tally {
    tiles: number; fitted: number; fallbacks: number; worstLeft: number; worstLeftAt: string;
    clipped: Map<number, { now: number; before: number }>;
    worstFace: Map<number, { value: number; at: string }>;
    regressions: string[];
    /** Fitted tiles the molecule's own box cuts as well (not regressions). */
    already: string[];
    /** Tiles that keep the molecule's box and are cut by it: unchanged by ruling T10-core, listed for the record. */
    unchangedCut: string[];
}

const newTally = (): Tally => ({
    tiles: 0, fitted: 0, fallbacks: 0, worstLeft: 0, worstLeftAt: '',
    clipped: new Map(FRACTIONS.map(f => [f, { now: 0, before: 0 }])),
    worstFace: new Map(FRACTIONS.map(f => [f, { value: 0, at: '' }])),
    regressions: [], already: [], unchangedCut: [],
});

/** One tile: `index` of `basis`, whose molecule box (the box the main view draws it in) has half-width `limit`. */
function checkTile(tally: Tally, name: string, basis: MoleculeBasis, index: number, limit: number): void {
    tally.tiles++;
    const { centre, halfWidth } = orbitalBox(basis, index, limit);
    if (halfWidth >= limit) {
        // The tile keeps the molecule's box: exactly the tile as it was before ruling T10-core.
        tally.fallbacks++;
        const old = sample(basis, index, limit, TILE_RESOLUTION);
        const oldFace = faceMax(old);
        for (const f of FRACTIONS) {
            const ratio = oldFace / isoLevelForEnclosedFraction(old.samples, f);
            if (ratio < 1) continue;
            tally.unchangedCut.push(`${name} at ${Math.round(f * 100)} %: molecule box ${limit.toFixed(2)} a₀, face/iso ${ratio.toFixed(3)}`);
        }
        return;
    }
    tally.fitted++;
    const moved = basisCentredOn(basis, centre);
    const tile = sample(moved, index, halfWidth, TILE_RESOLUTION);
    const reference = sample(moved, index, 2 * halfWidth, 2 * TILE_RESOLUTION);
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
    const face = faceMax(tile);
    let oldFace: Sampled | null = null;
    for (const f of FRACTIONS) {
        const iso = isoLevelForEnclosedFraction(tile.samples, f);
        const ratio = face / iso;
        const worst = tally.worstFace.get(f)!;
        if (ratio > worst.value) { worst.value = ratio; worst.at = name; }
        if (ratio < 1) continue;
        oldFace ??= sample(basis, index, limit, TILE_RESOLUTION);
        const oldRatio = faceMax(oldFace) / isoLevelForEnclosedFraction(oldFace.samples, f);
        const isoRatio = iso / isoLevelForEnclosedFraction(reference.samples, f);
        const line = `${name} at ${Math.round(f * 100)} %: box ${halfWidth.toFixed(2)} of ${limit.toFixed(2)} a₀, `
            + `face/iso ${ratio.toFixed(3)} (molecule box ${oldRatio.toFixed(3)}), iso tile/ref ${isoRatio.toFixed(4)}, left out ${(100 * left).toFixed(3)} %`;
        tally.clipped.get(f)!.now++;
        if (oldRatio >= 1) { tally.clipped.get(f)!.before++; tally.already.push(line); } else tally.regressions.push(line);
    }
}

function report(title: string, tally: Tally, files: string): void {
    console.log(`${title}: ${files}, tiles ${tally.tiles}: fitted tiles ${tally.fitted}, molecule-box tiles ${tally.fallbacks}`);
    for (const f of FRACTIONS) {
        const { now, before } = tally.clipped.get(f)!;
        const worst = tally.worstFace.get(f)!;
        console.log(`  at ${Math.round(f * 100)} %: ${now} fitted tiles cut (${now - before} new, ${before} already cut on the molecule box); `
            + `worst face/iso ${worst.value.toFixed(4)} (${worst.at})`);
    }
    console.log(`  worst left-out density ${(100 * tally.worstLeft).toFixed(3)} % (${tally.worstLeftAt})`);
    const list = (lines: string[]) => (lines.length === 0 ? 'none' : `\n    ${lines.join('\n    ')}`);
    console.log(`  REGRESSIONS (cut now, whole on the molecule box): ${list(tally.regressions)}`);
    console.log(`  fitted tiles already cut on the molecule box (not regressions): ${list(tally.already)}`);
    console.log(`  molecule-box tiles cut by that box (unchanged, not regressions): ${list(tally.unchangedCut)}`);
}

/** Every Bonds molecule × scan point × orbital: the Bonds strip shows every orbital (ruling T10-core). */
function sweepBonds(dir: string, only?: string): Tally {
    const files = readdirSync(dir).filter(f => /_\d\d\.json$/.test(f) && (!only || f.startsWith(only))).sort();
    const tally = newTally();
    for (const file of files) {
        const basis: MoleculeBasis = JSON.parse(readFileSync(join(dir, file), 'utf8'));
        const limit = Math.max(...basis.atoms.map(atom => Math.hypot(...atom))) + MOLECULE_PADDING;
        for (const orbital of basis.orbitals) {
            checkTile(tally, `${basis.id} ${orbital.label}${orbital.spin === 'restricted' ? '' : ` (${orbital.spin})`}`, basis, orbital.index, limit);
        }
    }
    report('Bonds', tally, `basis files ${files.length}`);
    return tally;
}

/** Task 15: every library molecule's frontier tiles, in the density grid's box (render_plan's gridHalfWidth). */
function sweepLibrary(dir: string, only?: string): Tally {
    const library = join(dir, LIBRARY);
    const ids = readdirSync(library).filter(f => f.endsWith('.meta.json')).map(f => f.slice(0, -'.meta.json'.length))
        .filter(id => !only || id.startsWith(only)).sort();
    const tally = newTally();
    for (const id of ids) {
        const meta = JSON.parse(readFileSync(join(library, `${id}.meta.json`), 'utf8')) as MoleculeMeta & { grid: { origin: number[] } };
        const basis: MoleculeBasis = JSON.parse(readFileSync(join(library, `${id}.basis.json`), 'utf8'));
        const limit = Math.abs(meta.grid.origin[0]);
        for (const { role, orbital } of frontierOrbitals(meta.orbitals)) checkTile(tally, `${id} ${role} ${orbital.label}`, basis, orbital.index, limit);
    }
    report('Molecules (library frontier tiles)', tally, `molecules ${ids.length}`);
    return tally;
}

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
    const regressions = sweepBonds(dir, only).regressions.length + sweepLibrary(dir, only).regressions.length;
    console.log(`swept in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    process.exitCode = regressions > 0 ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });
