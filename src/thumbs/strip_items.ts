import type { SerialisedAtomProfile } from '../workers/atomWorker';
import type { ViewLevel } from '../store/atomSlice';
import type { NavigationTarget } from '../components/LevelNav';
import { orbitalName } from '../orbital_names';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import type { ThumbRequest } from './ThumbnailService';
import type { RingLayer } from './ring_glyph';
import type { BasicSelection } from '../store/orbitalSlice';
import { basicOrbitalParams } from '../orbital_presets';

/**
 * Ruling R20d (overrides §12's 32³): strips mesh at 64³ -- 32³'s ~560-vertex
 * p lobes showed their facets even at 72 px. Measured on the dev machine
 * (headless Chromium, Metal): ~75-90 ms a job, a full M-shell strip (9
 * tiles) filled in under 1 s; 48³ was ~50 ms a job.
 */
export const THUMB_RESOLUTION = 64;

const LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

export type StripThumb = { kind: 'orbital'; request: ThumbRequest } | { kind: 'rings'; rings: RingLayer[]; rMax: number } | { kind: 'back' };

/**
 * Generic over what a tile dispatches: `NavigationTarget` (the default, the
 * Atom strip's own LevelNav targets) or, for Basic Orbitals, a plain
 * `BasicSelection` -- there is no drill-down there, just n/l/mₗ (Task 8).
 */
export interface StripItem<T = NavigationTarget> {
    key: string;
    label: string;
    spoken: string;
    group: string | null;
    /** The group's name for a screen reader: "6p j = 3/2" where the visible label is "6p³⁄₂" (ruling T16-spoken). */
    groupSpoken: string | null;
    target: T;
    selected: boolean;
    thumb: StripThumb;
}

interface StripArgs {
    profile: SerialisedAtomProfile;
    level: ViewLevel;
    selectedShell: number | null;
    selectedOrbital: { n: number; l: number; ml: number; j?: number } | null;
    enclosedFraction: number;
    palette: readonly string[];
}

/**
 * The Atom strip (spec §9.1): at the whole-atom level, "Whole atom" and one
 * tile per shell; at shell, subshell or orbital level, a back tile and every
 * occupied orbital of the shell, each mₗ of each subshell (each j-level under
 * spin–orbit), grouped by subshell. A tile dispatches the same
 * NavigationTarget LevelNav does.
 */
export function atomStripItems(args: StripArgs): StripItem[] {
    const { profile, level, selectedShell, selectedOrbital, enclosedFraction, palette } = args;
    if (level === 'atom' || selectedShell === null) {
        const shells = profile.shells.map((shell, i) => ({ curve: shell.curve, colour: palette[i % palette.length] }));
        return [
            {
                key: 'atom', label: 'Whole atom', spoken: 'Whole atom', group: null, groupSpoken: null, target: { level: 'atom' },
                selected: level === 'atom', thumb: { kind: 'rings', rings: shells, rMax: profile.displayRadius },
            },
            ...profile.shells.map((shell, i) => {
                const letter = LETTERS[shell.n - 1] ?? `n=${shell.n}`;
                return {
                    key: `shell-${shell.n}`, label: letter, spoken: `${letter} shell (n = ${shell.n})`, group: null, groupSpoken: null,
                    target: { level: 'shell', n: shell.n } as NavigationTarget, selected: false,
                    thumb: { kind: 'rings', rings: [{ curve: shell.curve, colour: palette[i % palette.length] }], rMax: shell.contourRadius * 1.15 } as StripThumb,
                };
            }),
        ];
    }
    const items: StripItem[] = [{
        key: 'back', label: 'Whole atom', spoken: 'back to the whole atom', group: null, groupSpoken: null, target: { level: 'atom' }, selected: false, thumb: { kind: 'back' },
    }];
    const species = profile.speciesKey ?? String(profile.Z);
    const relativity = profile.relativity ?? 'off';
    for (const subshell of profile.subshells.filter(s => s.n === selectedShell)) {
        const group = subshellLabel(subshell.n, subshell.l, subshell.j);
        const groupSpoken = subshellSpokenLabel(subshell.n, subshell.l, subshell.j);
        for (let ml = -subshell.l; ml <= subshell.l; ml++) {
            const name = orbitalName(subshell.n, subshell.l, ml);
            const j = subshell.j;
            items.push({
                key: `orbital-${subshell.n}-${subshell.l}-${j ?? ''}-${ml}`,
                label: name,
                // Ruling T16-optname (spec §13): "2p_z orbital"; under spin–orbit, which j-level too.
                spoken: j === undefined ? `${name} orbital` : `${name} orbital of ${groupSpoken}`,
                group,
                groupSpoken,
                target: j === undefined ? { level: 'orbital', n: subshell.n, l: subshell.l, ml } : { level: 'orbital', n: subshell.n, l: subshell.l, ml, j },
                selected: Boolean(selectedOrbital && selectedOrbital.n === subshell.n && selectedOrbital.l === subshell.l
                    && selectedOrbital.ml === ml && selectedOrbital.j === j),
                thumb: {
                    kind: 'orbital',
                    request: {
                        contentKey: `${species}|${relativity}|${subshell.n}|${subshell.l}|${ml}|${j ?? ''}|${enclosedFraction}`,
                        params: {
                            n: subshell.n, l: subshell.l, ml, Z: profile.Z, resolution: THUMB_RESOLUTION, rMax: subshell.samplingRadius, enclosedFraction,
                            radialSamples: { R: subshell.R, rMin: profile.rMin, dx: profile.dx, size: profile.size },
                        },
                    },
                },
            });
        }
    }
    return items;
}

/**
 * The Basic Orbitals strip (spec §9.2 "Strip", §12, Task 8): every orbital of
 * the current n -- n² tiles, grouped by subshell (l = 0..n-1), each mₗ of
 * each subshell ascending -- unlike the Atom strip there is no drill-down or
 * back tile: the whole n² set is always in view, and a tile dispatches the
 * same `{n, l, ml}` BasicSelection a chip click does (App.tsx's
 * `useDrawOnSelection` debounce draws it 150 ms later).
 */
export function basicStripItems(args: { selection: BasicSelection; enclosedFraction: number }): StripItem<BasicSelection>[] {
    const { selection, enclosedFraction } = args;
    const { n } = selection;
    const items: StripItem<BasicSelection>[] = [];
    for (let l = 0; l < n; l++) {
        const group = subshellLabel(n, l);
        const groupSpoken = subshellSpokenLabel(n, l);
        for (let ml = -l; ml <= l; ml++) {
            const name = orbitalName(n, l, ml);
            items.push({
                key: `basic-${n}-${l}-${ml}`,
                label: name,
                // Ruling T16-optname (spec §13): "3p_x orbital".
                spoken: `${name} orbital`,
                group,
                groupSpoken,
                target: { n, l, ml },
                selected: l === selection.l && ml === selection.ml,
                thumb: {
                    kind: 'orbital',
                    request: {
                        contentKey: `basic|${n}|${l}|${ml}|${enclosedFraction}`,
                        params: { ...basicOrbitalParams(n, l, ml, enclosedFraction), resolution: THUMB_RESOLUTION },
                    },
                },
            });
        }
    }
    return items;
}
