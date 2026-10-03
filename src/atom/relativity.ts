/**
 * The vocabulary of Phase 4: which relativistic treatment is in force, the
 * Dirac quantum number κ and its j-levels, and the words the UI uses for
 * them. No numerics here beyond the closed-form Dirac hydrogen energy, which
 * is the relativistic solver's exact oracle the way the analytic R_nl is the
 * non-relativistic one's.
 */
import type { SubshellOccupancy } from './configurations';

/** c in atomic units (spec value). NIST used 137.0359895; the difference is 4e-9 relative. */
export const SPEED_OF_LIGHT = 137.035999;

/**
 * 'off' is the Schrödinger equation (today's app); 'scalar' is Koelling–Harmon
 * (mass-velocity and Darwin terms, spin-orbit dropped); 'spinOrbit' is the
 * radial Dirac equation, which splits each l > 0 subshell into j = l ± 1/2.
 */
export type RelativityMode = 'off' | 'scalar' | 'spinOrbit';
export const RELATIVITY_MODES: readonly RelativityMode[] = ['off', 'scalar', 'spinOrbit'];

/** Spec §5 Phase 4: scalar by default from Cs onward, where relativistic error passes a few percent. */
export const RELATIVISTIC_DEFAULT_FROM_Z = 55;

/**
 * Whether a relativistic mode also applies the MacDonald–Vosko correction to
 * LDA exchange. NIST's Procedure page states both RLDA and ScRLDA do, and
 * those are the tables this is validated against, so matching them is the
 * only way the validation means anything. The fixtures record the same fact
 * (method.relativisticExchangeCorrection) and a test holds the two together.
 */
export const RELATIVISTIC_EXCHANGE_CORRECTION = true;

export function defaultRelativityFor(Z: number): RelativityMode {
    return Z >= RELATIVISTIC_DEFAULT_FROM_Z ? 'scalar' : 'off';
}

/** κ = -(l+1) for j = l + 1/2, κ = l for j = l - 1/2 (the usual Dirac convention). */
export function kappaFor(l: number, j: number): number {
    if (!Number.isInteger(l) || l < 0) throw new Error(`l must be a non-negative integer, got ${l}.`);
    if (j === l + 0.5) return -(l + 1);
    if (l > 0 && j === l - 0.5) return l;
    throw new Error(`j=${j} is not l ± 1/2 for l=${l}.`);
}

export function lForKappa(kappa: number): number {
    return kappa < 0 ? -kappa - 1 : kappa;
}

export function jForKappa(kappa: number): number {
    return Math.abs(kappa) - 0.5;
}

export interface JLevelOccupancy {
    n: number;
    l: number;
    j: number;
    kappa: number;
    /** Fractional for an open subshell: shared in proportion to 2j+1 (spherical averaging, as NIST's RLDA). */
    electrons: number;
}

/**
 * One subshell's electrons shared between its j-levels in proportion to
 * 2j + 1, lower j first (NIST's table order). This is the relativistic
 * extension of the spherical averaging the whole model rests on: every
 * m_j state of the subshell is equally occupied, so the density stays
 * spherical. NIST's own example: p² → 2/3 in p½, 4/3 in p³⁄₂.
 */
export function splitByJ(subshell: SubshellOccupancy): JLevelOccupancy[] {
    const { n, l, electrons } = subshell;
    if (l === 0) return [{ n, l, j: 0.5, kappa: -1, electrons }];
    const lower = 2 * l;          // 2j + 1 at j = l - 1/2
    const upper = 2 * l + 2;      // 2j + 1 at j = l + 1/2
    const total = lower + upper;
    return [
        { n, l, j: l - 0.5, kappa: l, electrons: (electrons * lower) / total },
        { n, l, j: l + 0.5, kappa: -(l + 1), electrons: (electrons * upper) / total },
    ];
}

/**
 * Exact bound-state energy of one electron in -Z/r, rest mass removed:
 * E = c² [ (1 + (Zα/(n - |κ| + γ))²)^(-1/2) - 1 ], γ = sqrt(κ² - (Zα)²).
 */
export function diracHydrogenicEnergy(n: number, kappa: number, Z: number): number {
    const zc = Z / SPEED_OF_LIGHT;
    const gamma = Math.sqrt(kappa * kappa - zc * zc);
    const radialQuantumNumber = n - Math.abs(kappa);
    const c2 = SPEED_OF_LIGHT * SPEED_OF_LIGHT;
    return c2 * (1 / Math.sqrt(1 + (zc / (radialQuantumNumber + gamma)) ** 2) - 1);
}

const J_LABELS: Record<string, string> = { '0.5': '½', '1.5': '³⁄₂', '2.5': '⁵⁄₂', '3.5': '⁷⁄₂' };

/** "6p" + jLabel(1.5) reads "6p³⁄₂", the spec's own notation. Only s-f occur, so j ≤ 7/2. */
export function jLabel(j: number): string {
    const label = J_LABELS[String(j)];
    if (!label) throw new Error(`No label for j=${j}; only j = 1/2 ... 7/2 occur in s-f subshells.`);
    return label;
}

export function relativityLabel(mode: RelativityMode): string {
    switch (mode) {
        case 'off': return 'Off';
        case 'scalar': return 'Scalar';
        case 'spinOrbit': return 'With spin–orbit';
    }
}

/**
 * The SCF a failure message names (ruling T7-f): "Scalar-relativistic SCF
 * for Samarium, excited 6s → 4f: ...". A failure has to say which method
 * failed, since the same species may solve in another mode.
 */
export function scfLabel(mode: RelativityMode): string {
    switch (mode) {
        case 'off': return 'Non-relativistic SCF';
        case 'scalar': return 'Scalar-relativistic SCF';
        case 'spinOrbit': return 'Dirac (spin–orbit) SCF';
    }
}

/** The one-line method statement every displayed number in atom mode answers to (spec §3.1). */
export function methodStatement(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return 'central-field SCF, LDA exchange with VWN correlation, spherically averaged';
        case 'scalar':
            return 'central-field SCF, scalar-relativistic (Koelling–Harmon: mass-velocity and Darwin terms, no spin–orbit), '
                + 'LDA exchange with the MacDonald–Vosko relativistic correction and VWN correlation, spherically averaged';
        case 'spinOrbit':
            return 'central-field SCF, radial Dirac equation (spin–orbit included; j = l ± ½ levels occupied in proportion to 2j+1), '
                + 'LDA exchange with the MacDonald–Vosko relativistic correction and VWN correlation, spherically averaged';
    }
}

/**
 * The level of theory in a few words, for a number that has to state its
 * method in the same line (spec §3.1) -- the "what changed" readout, the
 * reference-ring note, the ΔSCF tooltip -- where `methodStatement`'s full
 * sentence would crowd out the number itself. MacDonald–Vosko is named
 * because it is what sets these numbers apart from a plain relativistic
 * kinetic energy on top of the usual LDA (RELATIVISTIC_EXCHANGE_CORRECTION).
 */
export function shortMethodLabel(mode: RelativityMode): string {
    switch (mode) {
        case 'off': return 'non-relativistic LDA';
        case 'scalar': return 'scalar-relativistic LDA (MacDonald–Vosko exchange)';
        case 'spinOrbit': return 'Dirac LDA (MacDonald–Vosko exchange)';
    }
}

const URL_VALUES: Record<RelativityMode, string> = { off: 'off', scalar: 'scalar', spinOrbit: 'so' };

/**
 * The `rel` URL parameter's codec primitives (spec §4.3). These are plain
 * string<->mode mappings; they do not themselves decide what an absent or
 * invalid parameter means for the picture shown -- that is the URL-state
 * layer's job (ruling C1, `src/url_state.ts`), because it alone knows the
 * element's default and the stored override. `null` in is "write nothing"
 * (the caller passes it for whichever mode a link should leave unstated);
 * `null` out is "not a mode this codec recognises" (the caller then applies
 * C1's rule: absent or invalid decodes to off).
 */
export function encodeRelativityParam(mode: RelativityMode | null): string | null {
    return mode === null ? null : URL_VALUES[mode];
}

/** Unknown or missing values are ignored, never thrown on (spec §4.3). */
export function decodeRelativityParam(value: string | null | undefined): RelativityMode | null {
    const match = RELATIVITY_MODES.find(mode => URL_VALUES[mode] === value);
    return match ?? null;
}
