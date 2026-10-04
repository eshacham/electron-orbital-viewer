import { extremeEigenvalue } from './tridiagonal';

/**
 * H₂⁺, solved exactly within the Born–Oppenheimer approximation.
 *
 * One electron and two clamped protons at (0, 0, ±R/2) is the one molecule
 * whose Schrödinger equation separates. In prolate spheroidal coordinates
 * λ = (r₊ + r₋)/R ∈ [1, ∞) and μ = (r₋ − r₊)/R ∈ [−1, 1] (r₊ the distance to
 * the +z proton), a σ state (m = 0) is ψ = Λ(λ)M(μ), and with
 * p = (R/2)√(−2E_el) and a separation constant A the two factors obey
 *
 *     μ:  d/dμ[(1 − μ²)M′] + (A + p²μ²)M = 0
 *     λ:  d/dλ[(λ² − 1)Λ′] + (−A + 2Rλ − p²λ²)Λ = 0.
 *
 * For a trial p each equation alone fixes A, as an eigenvalue; the energy is
 * the p at which the two A agree. Each is turned into a symmetric tridiagonal
 * matrix by expanding in functions that already meet its boundary
 * conditions:
 *
 * - μ, in normalised Legendre functions P̄ₖ: A is the lowest eigenvalue of
 *   diag(k(k + 1)) − p²X², X² the matrix of μ². Even k gives the gerade
 *   1σg, odd k the ungerade 1σu*.
 * - λ, in Jaffé's series Λ = (λ + 1)^σ e^(−p(λ − 1)) Σ gₙxⁿ with
 *   x = (λ − 1)/(λ + 1) and σ = R/p − 1, which builds in both the regular
 *   behaviour at λ = 1 and the exponential decay at infinity. Substituting
 *   gives a three-term recurrence αₙgₙ₊₁ + βₙgₙ + γₙgₙ₋₁ = 0 with
 *   αₙ = (n + 1)², βₙ = −2n² + (2σ − 4p)n + σ(2p + 1) − p² − A and
 *   γₙ = (n − 1 − σ)² (derived for the Phase 5 plan and checked
 *   numerically there); symmetrised, A is the highest eigenvalue of the
 *   matrix with diagonal βₙ + A and off-diagonal √(αₙγₙ₊₁) = (n + 1)|n − σ|.
 *   The highest is the nodeless Λ, which both states share.
 *
 * Nothing here is a fit or a variational bound. Both expansions converge
 * geometrically, and the terms kept (24 and 40) are far past convergence at
 * every R the slider offers: doubling both moved no energy on it by more than
 * 3 × 10⁻¹⁴ Ha when this was written, and by at most 5 × 10⁻¹¹ Ha anywhere
 * from 0.01 to 100 a₀. The published values, limits and equilibrium in
 * tests/bonds/h2plus_energy.test.ts are what that buys. What remains is the
 * Born–Oppenheimer approximation itself -- infinitely heavy protons -- and
 * no relativity, both of which the published values compared against share.
 *
 * Energies are in Hartree, distances in bohr; E_el excludes the protons'
 * repulsion 1/R, which h2plusTotalEnergy adds.
 */

export type H2PlusState = '1sigma_g' | '1sigma_u';
export const H2PLUS_STATES: readonly H2PlusState[] = ['1sigma_g', '1sigma_u'];
export const H2PLUS_LABELS: Record<H2PlusState, string> = { '1sigma_g': '1σg', '1sigma_u': '1σu*' };
/**
 * The slider's range, in bohr. Below 0.5 a₀ the picture is already the He⁺
 * united atom; past 10 a₀ it is H + H⁺ with the bond gone.
 */
export const H2PLUS_R_RANGE = { min: 0.5, max: 10 } as const;

const ANGULAR_TERMS = 24;
const RADIAL_TERMS = 40;

/** Legendre degrees of one state's μ expansion: even k is gerade, odd k ungerade. */
const DEGREES: Record<H2PlusState, number[]> = {
    '1sigma_g': Array.from({ length: ANGULAR_TERMS }, (_, i) => 2 * i),
    '1sigma_u': Array.from({ length: ANGULAR_TERMS }, (_, i) => 2 * i + 1),
};

interface Tridiagonal { diag: Float64Array; off: Float64Array }

/**
 * aₖ = ⟨k + 1|μ|k⟩ between normalised Legendre functions, from the
 * recurrence μPₖ = [(k + 1)Pₖ₊₁ + kPₖ₋₁]/(2k + 1) (m = 0: both states are σ).
 */
function muCoupling(k: number): number {
    return Math.sqrt(((k + 1) ** 2) / ((2 * k + 1) * (2 * k + 3)));
}

/**
 * μ² in one parity's Legendre basis. μ only couples k to k ± 1, so μ² couples
 * k to k and k ± 2 and never mixes parities: ⟨k|μ²|k⟩ = aₖ² + aₖ₋₁²,
 * ⟨k + 2|μ²|k⟩ = aₖaₖ₊₁.
 */
function muSquared(degrees: number[]): Tridiagonal {
    const diag = new Float64Array(degrees.length);
    const off = new Float64Array(degrees.length - 1);
    degrees.forEach((k, i) => {
        diag[i] = muCoupling(k) ** 2 + (k > 0 ? muCoupling(k - 1) ** 2 : 0);
        if (i < degrees.length - 1) off[i] = muCoupling(k) * muCoupling(k + 1);
    });
    return { diag, off };
}

/** The μ equation's matrix at a trial p; its lowest eigenvalue is A. */
function angularMatrix(p: number, degrees: number[]): Tridiagonal {
    const mu2 = muSquared(degrees);
    return {
        diag: Float64Array.from(degrees, (k, i) => k * (k + 1) - p * p * mu2.diag[i]),
        off: mu2.off.map(v => -p * p * v),
    };
}

/** The λ equation's symmetrised Jaffé matrix at a trial p; its highest eigenvalue is A. */
function radialMatrix(p: number, R: number): Tridiagonal & { sigma: number } {
    const sigma = R / p - 1;
    const diag = new Float64Array(RADIAL_TERMS);
    const off = new Float64Array(RADIAL_TERMS - 1);
    for (let n = 0; n < RADIAL_TERMS; n++) {
        diag[n] = -2 * n * n + (2 * sigma - 4 * p) * n + sigma * (2 * p + 1) - p * p;
        if (n < RADIAL_TERMS - 1) off[n] = (n + 1) * Math.abs(n - sigma);
    }
    return { diag, off, sigma };
}

/** A from λ minus A from μ: zero exactly where p is an eigenvalue of the full problem. */
function mismatch(p: number, R: number, degrees: number[]): number {
    const radial = radialMatrix(p, R);
    const angular = angularMatrix(p, degrees);
    return extremeEigenvalue(radial.diag, radial.off, 'highest') - extremeEigenvalue(angular.diag, angular.off, 'lowest');
}

/**
 * The largest R the solver answers for, in bohr. Past it the 40-term Jaffé
 * series stops converging -- doubling it moved E_el by 2 × 10⁻⁹ Ha at 200 a₀
 * and by 7 × 10⁻⁴ Ha at 500 a₀ -- and bisection would still return a number,
 * so the solver refuses rather than answer wrongly. At 100 a₀ both states
 * still agree with the doubled basis to 10⁻¹³ Ha and with the H + H⁺ limit
 * −1/2 − 1/R − 9/(4R⁴) to 10⁻¹¹ Ha, ten times the slider's reach.
 */
const MAX_R = 100;

function checkR(R: number): void {
    if (!Number.isFinite(R) || !(R > 0)) {
        throw new RangeError(`H₂⁺ needs a positive, finite internuclear distance; got ${R}`);
    }
    if (R > MAX_R) {
        throw new RangeError(`H₂⁺ is solved only up to R = ${MAX_R} a₀, where its series still converge; got ${R}`);
    }
}

/** Bisection on p stops at this width: the energy, −2p²/R², is then fixed to about 4p × 10⁻¹³/R² ≤ 4 × 10⁻¹³/R Ha. */
const P_TOLERANCE = 1e-13;

/**
 * The p at which the two separated equations agree, by bisection on the sign
 * of the mismatch, which is monotone in p (checked on 4000 points of
 * [10⁻³, 40] at every 0.05 a₀ of the slider when this was written), so no
 * spurious root can be picked up and no derivative is needed.
 *
 * The bracket comes from the physics rather than a fixed interval: both
 * states lie between the He⁺ united atom's 1s and the separated atoms' H 1s,
 * −2 ≤ E_el < −1/2, so p = (R/2)√(−2E_el) lies in (R/2, R]. A fixed [10⁻³, 40]
 * held only for 0.002 ≲ R ≲ 80 a₀; [0.45R, 1.05R] held at every R tried,
 * 10⁻⁴ to 100 a₀, and is narrower. The sign check still refuses, rather than bisects, if it ever
 * fails to straddle the root.
 */
function separationP(R: number, state: H2PlusState): number {
    checkR(R);
    const degrees = DEGREES[state];
    let lo = 0.45 * R;
    let hi = 1.05 * R;
    const signLo = Math.sign(mismatch(lo, R, degrees));
    if (signLo === Math.sign(mismatch(hi, R, degrees))) {
        throw new Error(`H₂⁺ ${H2PLUS_LABELS[state]}: no bound state bracketed at R = ${R} a₀`);
    }
    for (let i = 0; i < 100 && hi - lo > P_TOLERANCE; i++) {
        const mid = 0.5 * (lo + hi);
        if (Math.sign(mismatch(mid, R, degrees)) === signLo) lo = mid;
        else hi = mid;
    }
    return 0.5 * (lo + hi);
}

/** The electronic energy at internuclear distance R, in Hartree, without the protons' repulsion. */
export function h2plusElectronicEnergy(R: number, state: H2PlusState): number {
    const p = separationP(R, state);
    return (-2 * p * p) / (R * R);
}

/** E_el + 1/R: the Born–Oppenheimer potential energy the nuclei move on. */
export function h2plusTotalEnergy(R: number, state: H2PlusState): number {
    return h2plusElectronicEnergy(R, state) + 1 / R;
}

export function h2plusCurve(Rs: readonly number[], state: H2PlusState): number[] {
    return Rs.map(R => h2plusTotalEnergy(R, state));
}

/**
 * The minimum of the 1σg curve, by golden-section search on [1.5, 2.5] a₀ (the
 * curve has one minimum there and no derivative is to hand). Narrowing the
 * bracket to 10⁻⁷ a₀ is past what the curve can resolve: near the bottom the
 * energy moves by only ~k(δR)²/2 ≈ 10⁻¹⁵ Ha for δR = 10⁻⁷ (k ≈ 0.1 Ha/a₀²),
 * below its own rounding, so R_e is good to about 10⁻⁶ a₀ and E(R_e) to
 * rounding.
 */
export function h2plusEquilibrium(): { R: number; totalEnergy: number } {
    const f = (R: number) => h2plusTotalEnergy(R, '1sigma_g');
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = 1.5;
    let b = 2.5;
    let c = b - ratio * (b - a);
    let d = a + ratio * (b - a);
    let fc = f(c);
    let fd = f(d);
    while (b - a > 1e-7) {
        if (fc < fd) { b = d; d = c; fd = fc; c = b - ratio * (b - a); fc = f(c); }
        else { a = c; c = d; fc = fd; d = a + ratio * (b - a); fd = f(d); }
    }
    const R = 0.5 * (a + b);
    return { R, totalEnergy: f(R) };
}
