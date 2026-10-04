import type { AnalyticFieldSource, FieldEvaluator } from '../field_source';
import { eigenvectorFor, extremeEigenvalue } from './tridiagonal';

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

/** A state from outside the type (a link, a message) is refused by name, not left to fail on a missing table. */
function checkState(state: H2PlusState): void {
    if (!H2PLUS_STATES.includes(state)) {
        throw new Error(`H₂⁺ has no state ${JSON.stringify(state)} here; the states solved are ${H2PLUS_STATES.join(' and ')}`);
    }
}

/** Bisection on p stops at this width: the energy, −2p²/R², is then fixed to about 4p × 10⁻¹³/R² ≤ 4 × 10⁻¹³/R Ha. */
const P_TOLERANCE = 1e-13;

/**
 * The p at which the two separated equations agree, by bisection on the sign
 * of the mismatch, which needs no derivative. On the slider's range the
 * bracket below, [0.45R, 1.05R], lies inside [10⁻³, 40], where the mismatch
 * was checked monotone with a single sign change (4000 points of p at every
 * 0.05 a₀ from 0.5 to 10 a₀, both states, when this was written), so no
 * spurious root can be picked up there. Off the slider (down to 10⁻⁴ a₀, up
 * to MAX_R) monotonicity was not swept; there the sign check guards the
 * bracket, and the united-atom and H + H⁺ limits the tests assert vouch for
 * the root found.
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
    checkState(state);
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
 * curve has one minimum there and no derivative is to hand). Each energy
 * carries a floor of about 5 × 10⁻¹⁴ Ha, set by P_TOLERANCE and by the
 * eigenvalue bisection's own tolerance (tridiagonal.ts), not by double
 * rounding. Near the bottom the curve rises only as k(δR)²/2 (k ≈ 0.1 Ha/a₀²),
 * so that floor hides any δR below about 10⁻⁶ a₀: narrowing the bracket to
 * 10⁻⁷ a₀ goes past it, R_e is good to about 10⁻⁶ a₀ (it returns 1.9971924),
 * and E(R_e), flat to first order, to the floor.
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

/**
 * One state at one R, solved: what the picture is drawn from.
 *
 * ψ = N Λ(λ) M(μ) with M = Σ angular[i] P̄_degrees[i](μ) (P̄ₖ the Legendre
 * functions normalised to 1 on [−1, 1], so ∫M² dμ = 1) and
 * Λ = (λ + 1)^σ e^(−p(λ − 1)) Σ radial[n] xⁿ, x = (λ − 1)/(λ + 1). Plain data
 * throughout: a worker can rebuild the evaluator from it, or, cheaper, from
 * the recipe { R, state } that solves it again.
 */
export interface H2PlusSolution {
    R: number;
    state: H2PlusState;
    p: number;
    sigma: number;
    electronicEnergy: number;
    totalEnergy: number;
    degrees: number[];
    /** Unit coefficients of M(μ) on normalised Legendre functions of `degrees`. */
    angular: Float64Array;
    /** Jaffé coefficients gₙ of Λ(λ). */
    radial: Float64Array;
    /** N, making ∫ψ² dV = 1. */
    normalisation: number;
}

/** Λ(λ), unnormalised. The prefactor is one exp of a log rather than pow and exp: it is in every sample of the grid. */
function radialFactor(g: Float64Array, sigma: number, p: number, lambda: number): number {
    const x = (lambda - 1) / (lambda + 1);
    let sum = 0;
    for (let n = g.length - 1; n >= 0; n--) sum = sum * x + g[n];
    return Math.exp(sigma * Math.log(lambda + 1) - p * (lambda - 1)) * sum;
}

/**
 * Σₖ cₖPₖ(μ) over every degree up to c's length, by the upward recurrence
 * (k + 1)Pₖ₊₁ = (2k + 1)μPₖ − kPₖ₋₁, which is stable on [−1, 1]. The
 * coefficients go with the plain Pₖ, so the P̄ₖ normalisation is folded into
 * them once rather than into every sample.
 */
function legendreSeries(c: Float64Array, mu: number): number {
    let sum = c[0];
    let previous = 1;
    let current = mu;
    for (let k = 1; k < c.length; k++) {
        sum += c[k] * current;
        const next = ((2 * k + 1) * mu * current - k * previous) / (k + 1);
        previous = current;
        current = next;
    }
    return sum;
}

/** M's coefficients on the plain Pₖ, indexed by degree: P̄ₖ = √((2k + 1)/2) Pₖ, and the other parity's degrees are zero. */
function legendreCoefficients(degrees: number[], angular: Float64Array, scale: number): Float64Array {
    const c = new Float64Array(degrees[degrees.length - 1] + 1);
    degrees.forEach((k, i) => { c[k] = scale * angular[i] * Math.sqrt((2 * k + 1) / 2); });
    return c;
}

/**
 * Simpson's rule on λ ∈ [1, 1 + 40/p] with this many intervals. The
 * integrand Λ² is smooth there (the cusps sit at λ = 1, μ = ±1, where the
 * separated factors are themselves analytic). Doubling the count moved N by
 * at most 3 × 10⁻¹⁰ (relative) at every 0.25 a₀ of the slider, both states,
 * when this was written -- the most at 10 a₀, where Λ falls fastest in λ --
 * so ∫ψ² = 1 holds far beyond anything a 128³ picture can show.
 */
const NORM_INTERVALS = 4000;

/**
 * ∫(ΛM)² dV, unnormalised. The volume element is (R/2)³(λ² − μ²) dλ dμ dφ, so
 * the integral splits into one-dimensional ones:
 * (R/2)³ 2π [∫Λ²λ² dλ ∫M² dμ − ∫Λ² dλ ∫M²μ² dμ]. ∫M² dμ = 1 because the
 * angular coefficients are a unit vector on an orthonormal basis, and
 * ∫M²μ² dμ = cᵀX²c with X² the same μ² matrix the solver used -- exact for
 * the truncated M, since μ² never leaves its parity. Only the λ integrals are
 * numerical; past 1 + 40/p, e^(−2p(λ − 1)) is below 10⁻³⁴.
 */
function normIntegral(s: H2PlusSolution): number {
    const lambdaMax = 1 + 40 / s.p;
    const h = (lambdaMax - 1) / NORM_INTERVALS;
    let i0 = 0;
    let i2 = 0;
    for (let i = 0; i <= NORM_INTERVALS; i++) {
        const lambda = 1 + i * h;
        const weight = i === 0 || i === NORM_INTERVALS ? 1 : i % 2 ? 4 : 2;
        const L = radialFactor(s.radial, s.sigma, s.p, lambda);
        i0 += weight * L * L;
        i2 += weight * L * L * lambda * lambda;
    }
    i0 *= h / 3;
    i2 *= h / 3;
    const mu2 = muSquared(s.degrees);
    let j2 = 0;
    for (let i = 0; i < s.degrees.length; i++) {
        j2 += s.angular[i] ** 2 * mu2.diag[i];
        if (i < s.degrees.length - 1) j2 += 2 * s.angular[i] * s.angular[i + 1] * mu2.off[i];
    }
    return (s.R / 2) ** 3 * 2 * Math.PI * (i2 - i0 * j2);
}

/**
 * The wavefunction of one state at one R: the energy as h2plusElectronicEnergy
 * finds it, then each factor's coefficients as the eigenvector of its matrix
 * at that energy, then N by quadrature.
 */
export function solveH2Plus(R: number, state: H2PlusState): H2PlusSolution {
    const p = separationP(R, state);
    const degrees = [...DEGREES[state]];
    const angularM = angularMatrix(p, degrees);
    const angular = eigenvectorFor(angularM.diag, angularM.off, extremeEigenvalue(angularM.diag, angularM.off, 'lowest'));
    const radialM = radialMatrix(p, R);
    const v = eigenvectorFor(radialM.diag, radialM.off, extremeEigenvalue(radialM.diag, radialM.off, 'highest'));
    // Undo the symmetrisation. With D = diag(dₙ), D⁻¹SD is the recurrence's
    // own matrix when dₙ₊₁/dₙ = √(γₙ₊₁/αₙ), so its eigenvector -- the Jaffé
    // coefficients -- is gₙ = vₙ/dₙ with d₀ = 1 and dₙ₊₁ = dₙ(n + 1)/|n − σ|
    // (σ ∈ (0, 1), never an integer, so no factor vanishes).
    const radial = new Float64Array(v.length);
    let scale = 1;
    for (let n = 0; n < v.length; n++) {
        radial[n] = v[n] / scale;
        scale *= (n + 1) / Math.abs(n - radialM.sigma);
    }
    // eigenvectorFor's sign is arbitrary, and it is chosen afresh at every R:
    // left alone, dragging the slider could swap 1σu's two colours from one
    // frame to the next. So each factor is pinned on its own: Λ positive at
    // λ = 1 (Λ(1) = 2^σ g₀; Λ is nodeless, so positive everywhere) and M
    // positive at μ = +1, the +z nucleus (M(1) = Σ cₖ √((2k + 1)/2)). For 1σg
    // that makes ψ positive everywhere; for 1σu, whose M is odd with its one
    // node on the midplane, it makes the lobe on the +z nucleus positive and
    // the one on the −z nucleus negative, at every R.
    if (radial[0] < 0) radial.forEach((c, n) => { radial[n] = -c; });
    if (legendreSeries(legendreCoefficients(degrees, angular, 1), 1) < 0) angular.forEach((c, i) => { angular[i] = -c; });
    const electronicEnergy = (-2 * p * p) / (R * R);
    const solution: H2PlusSolution = {
        R, state, p, sigma: radialM.sigma, electronicEnergy, totalEnergy: electronicEnergy + 1 / R,
        degrees, angular, radial, normalisation: 1,
    };
    solution.normalisation = 1 / Math.sqrt(normIntegral(solution));
    return solution;
}

/**
 * How many leading coefficients matter: the rest, summed in absolute value,
 * are below 10⁻¹⁶ of the whole, so with |Pₖ(μ)| ≤ 1 and 0 ≤ x < 1 dropping
 * them moves the series by less than double rounding does. The terms kept
 * for the energy are far past convergence -- at R = 2 a₀ the last angular
 * coefficient is 10⁻⁵⁴, and 17 of 47 Legendre degrees are enough -- and they
 * are summed at each of a 128³ grid's two million samples: dropping them took
 * sampling one from 0.74 s to 0.29 s when this was written (Node, Apple M2 Pro).
 */
function significantLength(c: Float64Array): number {
    const total = c.reduce((sum, v) => sum + Math.abs(v), 0);
    let tail = 0;
    let n = c.length;
    while (n > 1 && tail + Math.abs(c[n - 1]) <= 1e-16 * total) tail += Math.abs(c[--n]);
    return n;
}

/**
 * ψ at a point, nuclei at (0, 0, ±R/2). On the axis rounding can carry λ
 * and μ a hair outside [1, ∞) and [−1, 1]; they are clamped back, so both
 * series are only ever summed where they were derived.
 */
export function h2plusEvaluator(s: H2PlusSolution): FieldEvaluator {
    const { R, p, sigma } = s;
    const half = R / 2;
    const radial = s.radial.slice(0, significantLength(s.radial));
    const legendre = legendreCoefficients(s.degrees, s.angular, s.normalisation);
    const angular = legendre.slice(0, significantLength(legendre));
    return (x, y, z) => {
        const rho2 = x * x + y * y;
        const rPlus = Math.sqrt(rho2 + (z - half) * (z - half));
        const rMinus = Math.sqrt(rho2 + (z + half) * (z + half));
        const lambda = Math.max(1, (rPlus + rMinus) / R);
        const mu = Math.max(-1, Math.min(1, (rMinus - rPlus) / R));
        return radialFactor(radial, sigma, p, lambda) * legendreSeries(angular, mu);
    };
}

/**
 * Half-width of the sampling box: past the far nucleus by 9/κ, κ = √(−2E_el)
 * the decay rate ψ ~ e^(−κ(r₊ + r₋)/2) sets far out, so along the axis ψ² has
 * fallen by e⁻¹⁸ from the nucleus to the wall, and across the midplane by
 * more. For one hydrogen atom the same rule leaves about 3 × 10⁻⁶ of the
 * electron outside, well inside the 10⁻⁴ every Basic Orbitals box allows
 * (orbital_presets.ts).
 */
export function h2plusSamplingRadius(s: H2PlusSolution): number {
    return s.R / 2 + 9 / Math.sqrt(-2 * s.electronicEnergy);
}

/** The field source Bonds mode draws for H₂⁺: a recipe, so the worker solves it again rather than receiving the arrays. */
export function h2plusSource(R: number, state: H2PlusState): AnalyticFieldSource {
    return {
        kind: 'analytic',
        id: `h2plus:${R.toFixed(4)}:${state}`,
        recipe: { type: 'h2plus', R, state },
        rMax: h2plusSamplingRadius(solveH2Plus(R, state)),
    };
}
