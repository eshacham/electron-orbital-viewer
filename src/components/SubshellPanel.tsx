import React, { useRef } from 'react';
import { Box, Chip, Button } from '@mui/material';
import { SerialisedSubshell } from '../workers/atomWorker';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import { RelativityMode, methodStatement, shortMethodLabel } from '../atom/relativity';
import { CURVE_COLORS, orbitalShade } from '../curve_colors';
import { useRovingFocus } from '../shell/useRovingFocus';
import { OrbitalLabel } from '../format/OrbitalLabel';
import { evText, orbitalEnergyText } from '../format/energy';
import { formatElectrons, subshellCapacity } from '../atom/atom_text';
import InfoButton from '../info/InfoButton';

interface SubshellPanelProps {
    /**
     * Every occupied subshell of the whole atom, not just the selected
     * shell's — the energy diagram below spans the whole atom, so it needs
     * all of them; the chip row then filters down to `shellN` itself.
     */
    subshells: SerialisedSubshell[];
    /**
     * n of the currently selected shell; null with none open (the whole
     * atom, Explore › Orbitals), which picks nothing out: no chips, no
     * labelled or coloured rules, no j-level note (controller ruling
     * T10-wholeatom -- the 3D view draws shell rings, not lobes, there).
     */
    shellN: number | null;
    /**
     * The subshell currently drilled into, if any — shows the mₗ row when
     * set. With spin–orbit it is one j-level, and `j` says which.
     */
    selectedSubshell: { n: number; l: number; j?: number } | null;
    /**
     * The individual orbital currently being rendered (level 3), if any.
     * The panel stays mounted at that level so the mL row does not vanish
     * behind the user; this is what marks which of its buttons is current.
     */
    selectedOrbital?: { n: number; l: number; ml: number; j?: number } | null;
    /** `j` is the chip's j-level with spin–orbit, undefined otherwise. */
    onSelectSubshell: (n: number, l: number, j?: number) => void;
    onSelectOrbital: (n: number, l: number, ml: number, j?: number) => void;
    /**
     * The mode the drawn profile was solved in (ruling C9: what describes the
     * picture reads the profile's mode, not the switch's). Only a
     * relativistic one adds anything; 'off' is the panel as it always was.
     */
    relativity?: RelativityMode;
    /**
     * 'chips' (Explore › Configuration): the chip row and the mₗ row;
     * 'diagram' (Explore › Orbitals): the whole-atom energy diagram; 'all':
     * both. Task 6: the hint and the j-level note are Info's (atomInfo).
     */
    part?: 'all' | 'chips' | 'diagram';
    /** The theme's curve palette (science.ts curvePalette); CURVE_COLORS by default. */
    palette?: readonly string[];
    /**
     * Task 2: orbital energies appear at Explore. False (Basics) drops each chip's energy, from its text and
     * its spoken name, and the whole-atom diagram; the chips and the mₗ row stay. Default true.
     */
    showEnergies?: boolean;
}

const DIAGRAM_WIDTH = 220;
const DIAGRAM_HEIGHT = 96;
const DIAGRAM_PADDING = 6;
/** Room on the right of the rules for the current shell's subshell labels. */
const DIAGRAM_LABEL_WIDTH = 44;
/** Closest two labels may sit, in px, before they are pushed apart. */
const LABEL_SPACING = 11;

/** Same subshell, and with spin–orbit the same j-level (j absent on both otherwise). */
function sameSubshell(a: { n: number; l: number; j?: number } | null, b: { n: number; l: number; j?: number }): boolean {
    return a !== null && a.n === b.n && a.l === b.l && a.j === b.j;
}

/**
 * Label positions for rules at `ys`, pushed apart so none overlap: a shell's
 * subshells can sit within a pixel or two of each other (uranium's 4s-4f),
 * and their labels printed on top of one another. Order is preserved.
 */
export function spreadLabels(ys: number[], spacing: number, min: number, max: number): number[] {
    const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    const placed = order.map(entry => entry.y);
    for (let k = 1; k < placed.length; k++) {
        placed[k] = Math.max(placed[k], placed[k - 1] + spacing);
    }
    // Anything pushed off the bottom slides the whole run back up.
    const overflow = placed.length > 0 ? placed[placed.length - 1] - max : 0;
    if (overflow > 0) {
        for (let k = placed.length - 1; k >= 0; k--) {
            placed[k] = Math.max(min, placed[k] - overflow);
            if (k > 0 && placed[k - 1] > placed[k] - spacing) placed[k - 1] = placed[k] - spacing;
        }
    }
    const result = new Array<number>(ys.length);
    order.forEach((entry, k) => { result[entry.i] = placed[k]; });
    return result;
}

/**
 * Vertical position for an energy rule: least-bound (least negative) states
 * near the top, most tightly bound (most negative) near the bottom, which is
 * the usual convention for an energy-level diagram.
 *
 * On a log scale of the binding energy |E|, because the whole atom spans
 * orders of magnitude: uranium's 1s sits near -3600 Ha and its 7s near
 * -0.1, so a linear axis crushed every level from n = 3 outwards into one
 * line at the top. Falls back to the middle when every subshell shares one
 * energy (a single-subshell atom).
 */
/**
 * A React key per subshell entry: with spin–orbit one (n, l) is two j-levels,
 * so j has to be part of it. Absent j gives today's key.
 */
function subshellKey(subshell: Pick<SerialisedSubshell, 'n' | 'l' | 'j'>): string {
    return subshell.j === undefined ? `${subshell.n}-${subshell.l}` : `${subshell.n}-${subshell.l}-${subshell.j}`;
}

function ruleY(energy: number, minEnergy: number, maxEnergy: number): number {
    const logOf = (e: number) => Math.log10(Math.max(Math.abs(e), 1e-6));
    const top = logOf(maxEnergy);      // least bound: smallest |E|
    const bottom = logOf(minEnergy);   // most bound: largest |E|
    const range = bottom - top;
    const t = range > 0 ? (logOf(energy) - top) / range : 0.5;
    return DIAGRAM_PADDING + t * (DIAGRAM_HEIGHT - 2 * DIAGRAM_PADDING);
}

/**
 * Chips for the selected shell's subshells (label, occupancy, orbital
 * energy), an mₗ row once one of them is drilled into, and an energy-level
 * diagram spanning the whole atom with the selected shell picked out.
 *
 * Ruling R19: the energy shown is an SCF orbital eigenvalue, in eV first (Ha in the tooltip) —
 * never described as an ionisation energy. LDA's self-interaction error
 * makes that comparison wrong by tens of percent even for light atoms, so
 * the label here is deliberately "orbital energy" throughout.
 */
const SubshellPanel: React.FC<SubshellPanelProps> = ({
    subshells, shellN, selectedSubshell, selectedOrbital = null, onSelectSubshell, onSelectOrbital, relativity = 'off',
    part = 'all', palette = CURVE_COLORS, showEnergies = true,
}) => {
    const shellSubshells = subshells.filter(s => s.n === shellN);

    const energies = subshells.map(s => s.energy);
    const minEnergy = Math.min(...energies);
    const maxEnergy = Math.max(...energies);

    const activeSubshell = selectedSubshell && selectedSubshell.n === shellN
        ? shellSubshells.find(s => sameSubshell(selectedSubshell, s)) ?? null
        : null;
    // §13: the subshell chips and the mₗ row are each one Tab stop with the
    // arrow keys inside. The mₗ row mounts only once a subshell is picked, so
    // its hook re-attaches on the active subshell (ruling DX2).
    const chipRowRef = useRef<HTMLDivElement>(null);
    const mlRowRef = useRef<HTMLDivElement>(null);
    useRovingFocus(chipRowRef, { selector: '.subshell-chip', orientation: 'horizontal' }, part);
    useRovingFocus(mlRowRef, { selector: '.subshell-ml-button', orientation: 'horizontal' }, activeSubshell && subshellKey(activeSubshell));
    // The subshell's own curve colour: its position within the shell, which
    // is exactly the index App.tsx's atomCurves and shell_composition.ts's
    // colorIndex both use, so the chip, the curve and the 3D lobes agree.
    const activeSubshellColor = activeSubshell
        ? palette[shellSubshells.indexOf(activeSubshell) % palette.length]
        : palette[0];
    const showChips = part !== 'diagram';
    const showDiagram = part !== 'chips' && showEnergies;

    return (
        <Box className="subshell-panel" aria-label={part === 'diagram' ? 'orbital energies' : 'subshells'}>
            {showChips && (
                <>
                    {/* Task 9b (finish review, fix 7): the (i) sits beside the word it explains -- a short label naming the row, as
                        Orbitals' "Shell n (i)" -- not at the far end of the chips. */}
                    <div className="info-term">
                        <span className="info-term-label">Subshells</span>
                        <InfoButton topic="subshell" label="Subshell" />
                    </div>
                    <Box ref={chipRowRef} className="subshell-chip-row" role="group" aria-label="subshells in this shell">
                        {shellSubshells.map(subshell => {
                            const isSelected = sameSubshell(selectedSubshell, subshell);
                            const electrons = formatElectrons(subshell.electrons);
                            const capacity = subshellCapacity(subshell);
                            // Science corrections S2: the chip reads eV first to three figures; the accessible name and the
                            // tooltip carry the full orbitalEnergyText ("−13.63 eV (−0.501 Ha)").
                            const energy = evText(subshell.energy);
                            const fullEnergy = orbitalEnergyText(subshell.energy);
                            return (
                                <Chip
                                    key={subshellKey(subshell)}
                                    className={`subshell-chip${isSelected ? ' selected' : ''}`}
                                    data-n={subshell.n}
                                    data-l={subshell.l}
                                    data-j={subshell.j}
                                    // "6p³⁄₂" is read aloud as superscripts and a
                                    // fraction slash; a j-level chip says "6p j = 3/2"
                                    // instead. Without j the visible text already
                                    // reads well and stays the name. The name replaces
                                    // the visible text, whose energy states its method
                                    // only as a hover title, so it names the method
                                    // too (spec §3.1, final review M8).
                                    aria-label={subshell.j === undefined ? undefined
                                        : `${subshellSpokenLabel(subshell.n, subshell.l, subshell.j)}, ${electrons} of ${capacity} electrons`
                                            + (showEnergies ? `, ${fullEnergy} orbital energy (${shortMethodLabel(relativity)})` : '')}
                                    color={isSelected ? 'primary' : 'default'}
                                    // A toggle, not a one-way selection: pressed means
                                    // this subshell's orbitals are isolated in the 3D
                                    // composition view, and clicking it again returns to
                                    // the overlapping view (Addendum 2's readability
                                    // follow-up -- see App.tsx's handleSelectSubshell).
                                    aria-pressed={isSelected}
                                    // j only for a j-level, so without spin–orbit the
                                    // call is exactly the (n, l) it always was.
                                    onClick={() => (subshell.j === undefined
                                        ? onSelectSubshell(subshell.n, subshell.l)
                                        : onSelectSubshell(subshell.n, subshell.l, subshell.j))}
                                    label={
                                        <span className="subshell-chip-content">
                                            <span className="subshell-chip-label">{subshellLabel(subshell.n, subshell.l, subshell.j)}</span>
                                            {' · '}
                                            {/* Addendum 2's explicit occupancy readout ("2p: 2 of 6") -- carbon's
                                                2p2 and neon's 2p6 look identical as a bare electron count, but
                                                "2 of 6" vs "6 of 6" says outright which one is full. Capacity is
                                                2*(2l+1): two spins in each of the 2l+1 real orbitals -- or 2j+1
                                                for a j-level, whose share of an open subshell is fractional. */}
                                            <span className="subshell-chip-occupancy">
                                                {electrons} of {capacity} e⁻
                                            </span>
                                            {/* Spec §3.1: a relativistic eigenvalue states its method. No
                                                ' · ' separator here (Phase 6G-2, P16): the energy wraps onto
                                                its own line (.subshell-chip-energy's flex-basis: 100%) instead
                                                of truncating in a narrow inspector, and the line break reads
                                                as the separator. */}
                                            {showEnergies && (
                                                <span
                                                    className="subshell-chip-energy"
                                                    title={`${fullEnergy} orbital energy`
                                                        + (relativity === 'off' ? '' : ` (eigenvalue): ${methodStatement(relativity)}`)}
                                                >
                                                    {energy} orbital energy
                                                </span>
                                            )}
                                        </span>
                                    }
                                />
                            );
                        })}
                    </Box>

                    {/* Task 6: the isolate hint (Addendum 2's readability follow-up -- isolating a subshell is how
                        you read iron's five overlapping 3d orbitals apart) and the j-level note are said in Info. */}

                    {activeSubshell && (
                        <Box ref={mlRowRef} className="subshell-ml-row" role="group" aria-label="magnetic quantum number">
                            {Array.from({ length: 2 * activeSubshell.l + 1 }, (_, i) => i - activeSubshell.l).map(ml => (
                                <Button
                                    key={ml}
                                    size="small"
                                    className={`subshell-ml-button${
                                        sameSubshell(selectedOrbital, activeSubshell)
                                        && selectedOrbital!.ml === ml ? ' selected' : ''}`}
                                    aria-pressed={sameSubshell(selectedOrbital, activeSubshell) && selectedOrbital!.ml === ml}
                                    onClick={() => (activeSubshell.j === undefined
                                        ? onSelectOrbital(activeSubshell.n, activeSubshell.l, ml)
                                        : onSelectOrbital(activeSubshell.n, activeSubshell.l, ml, activeSubshell.j))}
                                >
                                    {/* The legend for the isolated composition view
                                        (Addendum 2's readability follow-up): each of
                                        the subshell's orbitals is drawn in its own
                                        shade of the subshell colour in 3D, and this
                                        is where a shade gets its name. A swatch
                                        rather than coloured label text, which at
                                        these hues (a gold 3d_z² on a light panel)
                                        does not hold up as readable. Same arguments
                                        to orbitalShade as shell_composition_view.ts
                                        passes, so the two cannot drift apart. */}
                                    <span
                                        className="subshell-ml-swatch"
                                        style={{ background: orbitalShade(activeSubshellColor, activeSubshell.l + ml, 2 * activeSubshell.l + 1) }}
                                    />
                                    {/* Task 6: the name with a real subscript (2p<sub>z</sub>), spoken "2pz". */}
                                    <OrbitalLabel n={activeSubshell.n} l={activeSubshell.l} ml={ml} />
                                </Button>
                            ))}
                        </Box>
                    )}
                </>
            )}

            {/* The whole atom's orbital energies, with this shell's subshells
                picked out in their own colours and named. It used to be
                captioned "Radial distribution D(r)", which it is not. */}
            {showDiagram && (
                <>
                    {/* Owner R26-2: a short label with its scale, and an (i) beside it to the energyLevels entry, which
                        says what the lines are, what "log |E|" means and that these are Kohn–Sham eigenvalues (the
                        THESIS: the panel holds the label, Info the explanation). Its own place, so it lights alone. */}
                    <div className="info-term subshell-panel-legend">
                        <span className="info-term-label">Orbital energies (log scale)</span>
                        <InfoButton topic="energyLevels" label="Orbital energies" place="energy-diagram" />
                    </div>

                    <svg
                        className="subshell-energy-diagram"
                        width={DIAGRAM_WIDTH}
                        height={DIAGRAM_HEIGHT}
                        role="img"
                        aria-label="orbital energy diagram"
                    >
                        {(() => {
                            const labelYs = spreadLabels(
                                shellSubshells.map(sub => ruleY(sub.energy, minEnergy, maxEnergy)),
                                LABEL_SPACING,
                                LABEL_SPACING / 2,
                                DIAGRAM_HEIGHT - LABEL_SPACING / 2
                            );
                            return shellSubshells.map((sub, i) => {
                                const y = ruleY(sub.energy, minEnergy, maxEnergy);
                                const lineEnd = DIAGRAM_WIDTH - DIAGRAM_PADDING - DIAGRAM_LABEL_WIDTH;
                                return (
                                    <g key={`label-${subshellKey(sub)}`}>
                                        <line
                                            className="subshell-energy-leader"
                                            x1={lineEnd}
                                            y1={y}
                                            x2={lineEnd + 10}
                                            y2={labelYs[i]}
                                        />
                                        <text
                                            className="subshell-energy-label"
                                            x={lineEnd + 13}
                                            y={labelYs[i]}
                                            dominantBaseline="middle"
                                        >
                                            {subshellLabel(sub.n, sub.l, sub.j)}
                                        </text>
                                    </g>
                                );
                            });
                        })()}
                        {subshells.map(subshell => {
                            const isCurrent = subshell.n === shellN;
                            const y = ruleY(subshell.energy, minEnergy, maxEnergy);
                            const color = isCurrent
                                ? palette[shellSubshells.indexOf(subshell) % palette.length]
                                : undefined;
                            return (
                                <g key={subshellKey(subshell)}>
                                    <line
                                        className={`subshell-energy-rule${isCurrent ? ' current' : ''}`}
                                        x1={DIAGRAM_PADDING}
                                        x2={DIAGRAM_WIDTH - DIAGRAM_PADDING - DIAGRAM_LABEL_WIDTH}
                                        y1={y}
                                        y2={y}
                                        // style, not stroke=: a CSS stroke beats the attribute.
                                        style={color ? { stroke: color } : undefined}
                                    />
                                </g>
                            );
                        })}
                    </svg>
                </>
            )}
        </Box>
    );
};

export default SubshellPanel;
