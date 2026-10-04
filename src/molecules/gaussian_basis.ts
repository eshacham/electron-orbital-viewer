import type { FieldEvaluator } from '../field_source';
import type { BasisOrbital, GridSpec, MoleculeBasis } from './types';

/**
 * PySCF's spherical Gaussian AOs, rebuilt exactly (tools/molecules/basis_export.py
 * writes them; the plan's Design decisions state the convention). An AO is
 * [Σₖ cₖ e^(−αₖr²)] · S_lm(x, y, z) about its atom, S_lm the real solid
 * harmonics normalised on the unit sphere in PySCF's order (p: x, y, z;
 * l ≥ 2: m = −l … l), and cₖ libcint's contraction coefficient times the
 * primitive's normalisation (bas_ctr_coeff × gto_norm), so nothing is
 * normalised here. tests/molecules/gaussian_basis.test.ts pins every AO,
 * every shipped orbital and the density to PySCF's own eval_gto values;
 * change nothing here without regenerating those fixtures.
 *
 * Only `import type` from field_source (preflight T2 ↔ T7): field_source
 * imports this module, and a value import back would be a cycle.
 */
const S = 0.28209479177387814;
const P = 0.4886025119029199;
const D_XY = 1.0925484305920792, D_Z2 = 0.31539156525252005, D_X2Y2 = 0.5462742152960396;
const F_3 = 0.5900435899266435, F_XYZ = 2.890611442640554, F_1 = 0.4570457994644658;
const F_0 = 0.3731763325901154, F_2 = 1.445305721320277;

/** S_lm(x, y, z) for one shell into out[offset …], scaled by `scale` (the radial factor). */
function scaledSolidHarmonics(l: number, x: number, y: number, z: number, scale: number, out: Float64Array, offset: number): void {
    switch (l) {
        case 0: out[offset] = scale * S; return;
        case 1: {
            const p = scale * P;
            out[offset] = p * x; out[offset + 1] = p * y; out[offset + 2] = p * z;
            return;
        }
        case 2: {
            const xx = x * x, yy = y * y, zz = z * z;
            const dxy = scale * D_XY;
            out[offset] = dxy * x * y;
            out[offset + 1] = dxy * y * z;
            out[offset + 2] = scale * D_Z2 * (2 * zz - xx - yy);
            out[offset + 3] = dxy * x * z;
            out[offset + 4] = scale * D_X2Y2 * (xx - yy);
            return;
        }
        case 3: {
            const xx = x * x, yy = y * y, zz = z * z;
            const f1 = scale * F_1, f3 = scale * F_3;
            out[offset] = f3 * y * (3 * xx - yy);
            out[offset + 1] = scale * F_XYZ * x * y * z;
            out[offset + 2] = f1 * y * (4 * zz - xx - yy);
            out[offset + 3] = scale * F_0 * z * (2 * zz - 3 * xx - 3 * yy);
            out[offset + 4] = f1 * x * (4 * zz - xx - yy);
            out[offset + 5] = scale * F_2 * z * (xx - yy);
            out[offset + 6] = f3 * x * (xx - 3 * yy);
            return;
        }
        default: throw new RangeError(`l = ${l}: the Gaussian evaluator stops at f`);
    }
}

/** The real solid harmonics of one shell, PySCF's order, written to out[offset … offset + 2l]. */
export function solidHarmonics(l: number, x: number, y: number, z: number, out: Float64Array, offset: number): void {
    scaledSolidHarmonics(l, x, y, z, 1, out, offset);
}

/**
 * A primitive term is skipped where it cannot reach this in any AO. Each
 * |S_lm| on the unit sphere is under 1 (the largest, f's m = 0 along z, is
 * 0.75), so |c| r^l e^(−αr²) bounds the term; 1e-14 is six decades below a
 * float32 sample of an order-1 orbital and far below any contour drawn.
 */
const NEGLIGIBLE = 1e-14;

/**
 * r² beyond which |c| r^l e^(−αr²) < NEGLIGIBLE for good, or −1 if it never
 * reaches it. The bound peaks at r₀ = √(l/2α) and falls after it, so the
 * crossing is found by bisection on the falling side (once per primitive,
 * when the evaluator is built).
 */
function primitiveReachSquared(c: number, alpha: number, l: number): number {
    const logC = Math.log(Math.abs(c));
    if (l === 0) return logC > Math.log(NEGLIGIBLE) ? (logC - Math.log(NEGLIGIBLE)) / alpha : -1;
    const excess = (r: number) => logC + l * Math.log(r) - alpha * r * r - Math.log(NEGLIGIBLE);
    let low = Math.sqrt(l / (2 * alpha));
    if (!(excess(low) > 0)) return -1;
    let high = 2 * low;
    while (excess(high) > 0) high *= 2;
    for (let step = 0; step < 60; step++) {
        const middle = (low + high) / 2;
        if (excess(middle) > 0) low = middle; else high = middle;
    }
    return high * high;
}

interface PreparedShell {
    cx: number; cy: number; cz: number;
    l: number;
    /** First AO of this shell; it has 2l + 1. */
    offset: number;
    width: number;
    /** Largest primitive reach: beyond it the whole shell is zero. */
    cutoffSquared: number;
    exponents: Float64Array;
    coefficients: Float64Array;
    reachSquared: Float64Array;
}

export interface AOEvaluator {
    readonly nao: number;
    /** Every AO at (x, y, z), PySCF's order, into out[0 … nao − 1]. */
    evaluate(x: number, y: number, z: number, out: Float64Array): void;
}

function prepareShells(basis: MoleculeBasis): PreparedShell[] {
    let offset = 0;
    const shells = basis.shells.map(shell => {
        const atom = basis.atoms[shell.atom];
        if (!atom) throw new Error(`Basis ${basis.id}: a shell sits on atom ${shell.atom}, which the file does not list`);
        if (shell.exponents.length !== shell.coefficients.length) {
            throw new Error(`Basis ${basis.id}: a shell has ${shell.exponents.length} exponents and ${shell.coefficients.length} coefficients`);
        }
        const reachSquared = Float64Array.from(shell.exponents, (alpha, k) => primitiveReachSquared(shell.coefficients[k], alpha, shell.l));
        const prepared: PreparedShell = {
            cx: atom[0], cy: atom[1], cz: atom[2], l: shell.l, offset, width: 2 * shell.l + 1,
            cutoffSquared: Math.max(-1, ...reachSquared),
            exponents: Float64Array.from(shell.exponents),
            coefficients: Float64Array.from(shell.coefficients),
            reachSquared,
        };
        offset += prepared.width;
        return prepared;
    });
    if (offset !== basis.nao) throw new Error(`Basis ${basis.id}: shells describe ${offset} AOs, file says ${basis.nao}`);
    return shells;
}

/**
 * Exponents, coefficients, centres and screening radii are unpacked once
 * here; the per-point loop is arithmetic on typed arrays and one Math.exp
 * per primitive within reach.
 */
export function makeAOEvaluator(basis: MoleculeBasis): AOEvaluator {
    const shells = prepareShells(basis);
    return {
        nao: basis.nao,
        evaluate(x, y, z, out) {
            for (let s = 0; s < shells.length; s++) {
                const shell = shells[s];
                const dx = x - shell.cx, dy = y - shell.cy, dz = z - shell.cz;
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 > shell.cutoffSquared) {
                    out.fill(0, shell.offset, shell.offset + shell.width);
                    continue;
                }
                const { exponents, coefficients, reachSquared } = shell;
                let radial = 0;
                for (let k = 0; k < exponents.length; k++) {
                    if (r2 <= reachSquared[k]) radial += coefficients[k] * Math.exp(-exponents[k] * r2);
                }
                scaledSolidHarmonics(shell.l, dx, dy, dz, radial, out, shell.offset);
            }
        },
    };
}

/**
 * One orbital's nonzero coefficients and the AOs they multiply. Symmetry
 * makes most of them exactly zero (a σ orbital of N₂ uses 22 of 62 AOs; the
 * occupied orbitals of O₂ 292 of 992 entries), and skipping an exact zero
 * changes nothing.
 */
interface OrbitalTerms {
    weight: number;
    aos: Int32Array;
    coefficients: Float64Array;
}

function termsOf(basis: MoleculeBasis, orbital: BasisOrbital, weight: number): OrbitalTerms {
    if (orbital.coefficients.length !== basis.nao) {
        throw new Error(`Basis ${basis.id}: orbital ${orbital.index} has ${orbital.coefficients.length} coefficients for ${basis.nao} AOs`);
    }
    const aos: number[] = [];
    orbital.coefficients.forEach((c, mu) => { if (c !== 0) aos.push(mu); });
    return { weight, aos: Int32Array.from(aos), coefficients: Float64Array.from(aos, mu => orbital.coefficients[mu]) };
}

function orbitalTerms(basis: MoleculeBasis, index: number): OrbitalTerms[] {
    const orbital = basis.orbitals[index];
    if (!orbital || orbital.index !== index) throw new RangeError(`Basis ${basis.id} has no orbital ${index}`);
    return [termsOf(basis, orbital, 1)];
}

/**
 * ρ = Σ occᵢ ψᵢ² over the shipped orbitals, α and β alike for an
 * unrestricted molecule (each spin-orbital carries its own occupation, 1).
 * Every occupied orbital is shipped (outputs.orbital_entries keeps them all),
 * so this is the whole B3LYP density -- the definition
 * outputs.density_on_grid writes into density.bin.gz.
 */
function densityTerms(basis: MoleculeBasis): OrbitalTerms[] {
    return basis.orbitals.filter(o => o.occupation > 0).map(o => termsOf(basis, o, o.occupation));
}

function psiOf(terms: OrbitalTerms, chi: Float64Array): number {
    const { aos, coefficients } = terms;
    let psi = 0;
    for (let t = 0; t < aos.length; t++) psi += coefficients[t] * chi[aos[t]];
    return psi;
}

/**
 * Orbitals that use the same AOs -- one irrep's, in practice: O₂'s sixteen
 * occupied spin-orbitals fall into σ, πx and πy -- packed as one dense
 * coefficient block, so each AO is gathered once per group rather than once
 * per orbital.
 */
interface OrbitalGroup {
    aos: Int32Array;
    /** Row r holds orbital r's coefficients for `aos`. */
    rows: Float64Array;
    weights: Float64Array;
}

function groupOrbitals(orbitals: OrbitalTerms[]): OrbitalGroup[] {
    const groups = new Map<string, OrbitalTerms[]>();
    for (const terms of orbitals) {
        const key = terms.aos.join(',');
        groups.set(key, [...(groups.get(key) ?? []), terms]);
    }
    return [...groups.values()].map(members => {
        const n = members[0].aos.length;
        const rows = new Float64Array(members.length * n);
        members.forEach((terms, r) => rows.set(terms.coefficients, r * n));
        return { aos: members[0].aos, rows, weights: Float64Array.from(members, terms => terms.weight) };
    });
}

function groupedRhoOf(groups: OrbitalGroup[], chi: Float64Array, gathered: Float64Array): number {
    let rho = 0;
    for (let g = 0; g < groups.length; g++) {
        const { aos, rows, weights } = groups[g];
        const n = aos.length;
        for (let a = 0; a < n; a++) gathered[a] = chi[aos[a]];
        for (let r = 0, start = 0; r < weights.length; r++, start += n) {
            let psi = 0;
            for (let a = 0; a < n; a++) psi += rows[start + a] * gathered[a];
            rho += weights[r] * psi * psi;
        }
    }
    return rho;
}

function rhoOf(orbitals: OrbitalTerms[], chi: Float64Array): number {
    let rho = 0;
    for (let i = 0; i < orbitals.length; i++) {
        const psi = psiOf(orbitals[i], chi);
        rho += orbitals[i].weight * psi * psi;
    }
    return rho;
}

/** ψ of the orbital at `index` in basis.orbitals (what a 'gaussianMO' recipe names). */
export function moEvaluator(basis: MoleculeBasis, index: number): FieldEvaluator {
    const [terms] = orbitalTerms(basis, index);
    const aos = makeAOEvaluator(basis);
    const chi = new Float64Array(aos.nao);
    return (x, y, z) => {
        aos.evaluate(x, y, z, chi);
        return psiOf(terms, chi);
    };
}

/** ρ (e/a₀³) at a point; see densityTerms for what it sums. */
export function densityEvaluator(basis: MoleculeBasis): FieldEvaluator {
    const orbitals = densityTerms(basis);
    const aos = makeAOEvaluator(basis);
    const chi = new Float64Array(aos.nao);
    return (x, y, z) => {
        aos.evaluate(x, y, z, chi);
        return rhoOf(orbitals, chi);
    };
}

type GridQuantity = 'psi' | 'rho' | 'rootRho';

/**
 * S_lm(dx, dy, dz[at + k]) · radial[k] for every k of a grid row, into the
 * chi rows of AOs offset … offset + 2l (chi[mu * nz + k]).
 */
function angularRow(l: number, dx: number, dy: number, dz: Float64Array, at: number, radial: Float64Array, chi: Float64Array, offset: number, nz: number): void {
    const row = (m: number) => (offset + m) * nz;
    switch (l) {
        case 0: { const r0 = row(0); for (let k = 0; k < nz; k++) chi[r0 + k] = S * radial[k]; return; }
        case 1: {
            const r0 = row(0), r1 = row(1), r2 = row(2);
            for (let k = 0; k < nz; k++) {
                const f = P * radial[k];
                chi[r0 + k] = f * dx; chi[r1 + k] = f * dy; chi[r2 + k] = f * dz[at + k];
            }
            return;
        }
        case 2: {
            const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3), r4 = row(4);
            const xx = dx * dx, yy = dy * dy;
            for (let k = 0; k < nz; k++) {
                const z = dz[at + k], f = radial[k];
                chi[r0 + k] = f * D_XY * dx * dy;
                chi[r1 + k] = f * D_XY * dy * z;
                chi[r2 + k] = f * D_Z2 * (2 * z * z - xx - yy);
                chi[r3 + k] = f * D_XY * dx * z;
                chi[r4 + k] = f * D_X2Y2 * (xx - yy);
            }
            return;
        }
        case 3: {
            const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3), r4 = row(4), r5 = row(5), r6 = row(6);
            const xx = dx * dx, yy = dy * dy;
            for (let k = 0; k < nz; k++) {
                const z = dz[at + k], zz = z * z, f = radial[k];
                chi[r0 + k] = f * F_3 * dy * (3 * xx - yy);
                chi[r1 + k] = f * F_XYZ * dx * dy * z;
                chi[r2 + k] = f * F_1 * dy * (4 * zz - xx - yy);
                chi[r3 + k] = f * F_0 * z * (2 * zz - 3 * xx - 3 * yy);
                chi[r4 + k] = f * F_1 * dx * (4 * zz - xx - yy);
                chi[r5 + k] = f * F_2 * z * (xx - yy);
                chi[r6 + k] = f * F_3 * dx * (xx - 3 * yy);
            }
            return;
        }
        default: throw new RangeError(`l = ${l}: the Gaussian evaluator stops at f`);
    }
}

/**
 * The same values as the point evaluators above, over a whole grid at once
 * -- the route every drawn molecule takes (96³ is 0.9 M points). Two things
 * make it cheaper than point by point:
 *
 * - On a regular grid e^(−α|r − A|²) = e^(−αΔx²) e^(−αΔy²) e^(−αΔz²), so
 *   each primitive's three factors are tabulated once per axis and no
 *   Math.exp is taken per point.
 * - It works a grid row (fixed x, y; every z) at a time, so every inner
 *   loop is a long, contiguous multiply-add over z rather than a short sum
 *   per point; the orbital sums then cost what their arithmetic costs.
 *
 * Shells no requested orbital uses are left out, and a shell whose
 * screening radius (makeAOEvaluator's) ends before the row comes near its
 * atom is skipped for that whole row. Measured on O₂ (task-7 report).
 */
function sampleOnGrid(basis: MoleculeBasis, orbitals: OrbitalTerms[], quantity: GridQuantity, grid: GridSpec): Float32Array {
    const used = new Uint8Array(basis.nao);
    for (const terms of orbitals) for (const mu of terms.aos) used[mu] = 1;
    const shells = prepareShells(basis).filter(shell => used.subarray(shell.offset, shell.offset + shell.width).some(u => u === 1));
    // Which shell each AO belongs to, to skip the AOs of a shell out of reach.
    const shellOfAO = new Int32Array(basis.nao).fill(-1);
    shells.forEach((shell, s) => shellOfAO.fill(s, shell.offset, shell.offset + shell.width));

    const [nx, ny, nz] = grid.shape;
    const [ox, oy, oz] = grid.origin;
    const h = grid.spacing;
    const first = new Int32Array(shells.length + 1);
    shells.forEach((shell, s) => { first[s + 1] = first[s] + shell.exponents.length; });
    const primitives = first[shells.length];
    // ex[p * nx + i] = c_p e^(−α_p (x_i − A_x)²); ey and ez likewise, without c_p.
    const ex = new Float64Array(primitives * nx);
    const ey = new Float64Array(primitives * ny);
    const ez = new Float64Array(primitives * nz);
    // dz[s * nz + k] = z_k − A_z for shell s's atom.
    const dz = new Float64Array(shells.length * nz);
    shells.forEach((shell, s) => {
        for (let k = 0; k < nz; k++) dz[s * nz + k] = oz + k * h - shell.cz;
        for (let q = 0; q < shell.exponents.length; q++) {
            const p = first[s] + q, alpha = shell.exponents[q], c = shell.coefficients[q];
            for (let i = 0; i < nx; i++) { const d = ox + i * h - shell.cx; ex[p * nx + i] = c * Math.exp(-alpha * d * d); }
            for (let j = 0; j < ny; j++) { const d = oy + j * h - shell.cy; ey[p * ny + j] = Math.exp(-alpha * d * d); }
            for (let k = 0; k < nz; k++) { const d = oz + k * h - shell.cz; ez[p * nz + k] = Math.exp(-alpha * d * d); }
        }
    });

    const groups = groupOrbitals(orbitals);
    const chi = new Float64Array(basis.nao * nz);   // chi[mu * nz + k]
    const radial = new Float64Array(nz);
    const psi = new Float64Array(nz);
    const rho = new Float64Array(nz);
    const inReach = new Uint8Array(shells.length);
    const values = new Float32Array(nx * ny * nz);
    for (let i = 0; i < nx; i++) {
        const x = ox + i * h;
        for (let j = 0; j < ny; j++) {
            const y = oy + j * h;
            for (let s = 0; s < shells.length; s++) {
                const shell = shells[s];
                const dx = x - shell.cx, dy = y - shell.cy;
                inReach[s] = dx * dx + dy * dy <= shell.cutoffSquared ? 1 : 0;
                if (!inReach[s]) continue;
                radial.fill(0);
                for (let p = first[s]; p < first[s + 1]; p++) {
                    const scale = ex[p * nx + i] * ey[p * ny + j];
                    if (scale === 0) continue;
                    const from = p * nz;
                    for (let k = 0; k < nz; k++) radial[k] += scale * ez[from + k];
                }
                angularRow(shell.l, dx, dy, dz, s * nz, radial, chi, shell.offset, nz);
            }

            const out = (i * ny + j) * nz;
            if (quantity === 'psi') {
                const { aos, coefficients } = orbitals[0];
                psi.fill(0);
                for (let t = 0; t < aos.length; t++) {
                    if (!inReach[shellOfAO[aos[t]]]) continue;
                    const c = coefficients[t], from = aos[t] * nz;
                    for (let k = 0; k < nz; k++) psi[k] += c * chi[from + k];
                }
                for (let k = 0; k < nz; k++) values[out + k] = psi[k];
                continue;
            }
            rho.fill(0);
            for (let g = 0; g < groups.length; g++) {
                const { aos, rows, weights } = groups[g];
                const n = aos.length;
                for (let r = 0; r < weights.length; r++) {
                    psi.fill(0);
                    for (let a = 0; a < n; a++) {
                        if (!inReach[shellOfAO[aos[a]]]) continue;
                        const c = rows[r * n + a], from = aos[a] * nz;
                        for (let k = 0; k < nz; k++) psi[k] += c * chi[from + k];
                    }
                    const w = weights[r];
                    for (let k = 0; k < nz; k++) rho[k] += w * psi[k] * psi[k];
                }
            }
            if (quantity === 'rho') for (let k = 0; k < nz; k++) values[out + k] = rho[k];
            else for (let k = 0; k < nz; k++) values[out + k] = Math.sqrt(rho[k]);
        }
    }
    return values;
}

/** ψ of orbital `index` on a grid, z-fastest like GridFieldSource: index = (i * ny + j) * nz + k. */
export function moOnGrid(basis: MoleculeBasis, index: number, grid: GridSpec): Float32Array {
    return sampleOnGrid(basis, orbitalTerms(basis, index), 'psi', grid);
}

/**
 * ρ on a grid, z-fastest like GridFieldSource: index = (i * ny + j) * nz + k
 * -- or √ρ with `root`, what a 'gaussianDensity' recipe samples (taken in
 * float64, before the float32 store).
 */
export function densityOnGrid(basis: MoleculeBasis, grid: GridSpec, { root = false } = {}): Float32Array {
    return sampleOnGrid(basis, densityTerms(basis), root ? 'rootRho' : 'rho', grid);
}
