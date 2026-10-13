import type { SerialisedAtomProfile } from '../workers/atomWorker';
import type { ViewLevel } from '../store/atomSlice';
import type { NavigationTarget } from '../components/LevelNav';
import { orbitalName } from '../orbital_names';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import type { ThumbRequest } from './ThumbnailService';
import type { RingLayer } from './ring_glyph';

/** §12: strips mesh at 32³. */
export const THUMB_RESOLUTION = 32;

const LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

export type StripThumb = { kind: 'orbital'; request: ThumbRequest } | { kind: 'rings'; rings: RingLayer[]; rMax: number } | { kind: 'back' };

export interface StripItem {
    key: string;
    label: string;
    spoken: string;
    group: string | null;
    target: NavigationTarget;
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
                key: 'atom', label: 'Whole atom', spoken: 'Whole atom', group: null, target: { level: 'atom' },
                selected: level === 'atom', thumb: { kind: 'rings', rings: shells, rMax: profile.displayRadius },
            },
            ...profile.shells.map((shell, i) => {
                const letter = LETTERS[shell.n - 1] ?? `n=${shell.n}`;
                return {
                    key: `shell-${shell.n}`, label: letter, spoken: `${letter} shell (n = ${shell.n})`, group: null,
                    target: { level: 'shell', n: shell.n } as NavigationTarget, selected: false,
                    thumb: { kind: 'rings', rings: [{ curve: shell.curve, colour: palette[i % palette.length] }], rMax: shell.contourRadius * 1.15 } as StripThumb,
                };
            }),
        ];
    }
    const items: StripItem[] = [{
        key: 'back', label: 'Whole atom', spoken: 'back to the whole atom', group: null, target: { level: 'atom' }, selected: false, thumb: { kind: 'back' },
    }];
    const species = profile.speciesKey ?? String(profile.Z);
    const relativity = profile.relativity ?? 'off';
    for (const subshell of profile.subshells.filter(s => s.n === selectedShell)) {
        const group = subshellLabel(subshell.n, subshell.l, subshell.j);
        for (let ml = -subshell.l; ml <= subshell.l; ml++) {
            const name = orbitalName(subshell.n, subshell.l, ml);
            const j = subshell.j;
            items.push({
                key: `orbital-${subshell.n}-${subshell.l}-${j ?? ''}-${ml}`,
                label: name,
                spoken: j === undefined ? name : `${name} of ${subshellSpokenLabel(subshell.n, subshell.l, j)}`,
                group,
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
