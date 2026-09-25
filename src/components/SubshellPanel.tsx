import React from 'react';
import { Box, Chip, Typography, Button } from '@mui/material';
import { SerialisedSubshell } from '../workers/atomWorker';
import { subshellLabel } from '../atom/configurations';
import { orbitalName } from '../orbital_names';
import { CURVE_COLORS, orbitalShade } from '../curve_colors';

interface SubshellPanelProps {
    /**
     * Every occupied subshell of the whole atom, not just the selected
     * shell's — the energy diagram below spans the whole atom, so it needs
     * all of them; the chip row then filters down to `shellN` itself.
     */
    subshells: SerialisedSubshell[];
    /** n of the currently selected shell. */
    shellN: number;
    /** The subshell currently drilled into, if any — shows the mₗ row when set. */
    selectedSubshell: { n: number; l: number } | null;
    /**
     * The individual orbital currently being rendered (level 3), if any.
     * The panel stays mounted at that level so the mL row does not vanish
     * behind the user; this is what marks which of its buttons is current.
     */
    selectedOrbital?: { n: number; l: number; ml: number } | null;
    onSelectSubshell: (n: number, l: number) => void;
    onSelectOrbital: (n: number, l: number, ml: number) => void;
}

const DIAGRAM_WIDTH = 220;
const DIAGRAM_HEIGHT = 96;
const DIAGRAM_PADDING = 6;
/** Room on the right of the rules for the current shell's subshell labels. */
const DIAGRAM_LABEL_WIDTH = 44;
/** Closest two labels may sit, in px, before they are pushed apart. */
const LABEL_SPACING = 11;

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
 * Ruling R19: the energy shown is an SCF orbital eigenvalue, in Hartree —
 * never described as an ionisation energy. LDA's self-interaction error
 * makes that comparison wrong by tens of percent even for light atoms, so
 * the label here is deliberately "orbital energy" throughout.
 */
const SubshellPanel: React.FC<SubshellPanelProps> = ({
    subshells, shellN, selectedSubshell, selectedOrbital = null, onSelectSubshell, onSelectOrbital,
}) => {
    const shellSubshells = subshells.filter(s => s.n === shellN);

    const energies = subshells.map(s => s.energy);
    const minEnergy = Math.min(...energies);
    const maxEnergy = Math.max(...energies);

    const activeSubshell = selectedSubshell && selectedSubshell.n === shellN
        ? shellSubshells.find(s => s.l === selectedSubshell.l) ?? null
        : null;
    // The subshell's own curve colour: its position within the shell, which
    // is exactly the index App.tsx's atomCurves and shell_composition.ts's
    // colorIndex both use, so the chip, the curve and the 3D lobes agree.
    const activeSubshellColor = activeSubshell
        ? CURVE_COLORS[shellSubshells.indexOf(activeSubshell) % CURVE_COLORS.length]
        : CURVE_COLORS[0];

    return (
        <Box className="subshell-panel" aria-label="subshells">
            <Box className="subshell-chip-row" role="group" aria-label="subshells in this shell">
                {shellSubshells.map(subshell => {
                    const isSelected = selectedSubshell !== null
                        && selectedSubshell.n === subshell.n
                        && selectedSubshell.l === subshell.l;
                    return (
                        <Chip
                            key={`${subshell.n}-${subshell.l}`}
                            className={`subshell-chip${isSelected ? ' selected' : ''}`}
                            data-n={subshell.n}
                            data-l={subshell.l}
                            color={isSelected ? 'primary' : 'default'}
                            // A toggle, not a one-way selection: pressed means
                            // this subshell's orbitals are isolated in the 3D
                            // composition view, and clicking it again returns to
                            // the overlapping view (Addendum 2's readability
                            // follow-up -- see App.tsx's handleSelectSubshell).
                            aria-pressed={isSelected}
                            onClick={() => onSelectSubshell(subshell.n, subshell.l)}
                            label={
                                <span className="subshell-chip-content">
                                    <span className="subshell-chip-label">{subshellLabel(subshell.n, subshell.l)}</span>
                                    {' · '}
                                    {/* Addendum 2's explicit occupancy readout ("2p: 2 of 6") -- carbon's
                                        2p2 and neon's 2p6 look identical as a bare electron count, but
                                        "2 of 6" vs "6 of 6" says outright which one is full. Capacity is
                                        2*(2l+1): two spins in each of the 2l+1 real orbitals. */}
                                    <span className="subshell-chip-occupancy">
                                        {subshell.electrons} of {2 * (2 * subshell.l + 1)} e⁻
                                    </span>
                                    {' · '}
                                    <span className="subshell-chip-energy">
                                        {subshell.energy.toFixed(3)} Ha (orbital energy)
                                    </span>
                                </span>
                            }
                        />
                    );
                })}
            </Box>

            {/* Addendum 2's readability follow-up. Iron's five 3d orbitals
                overlap into one gold blob; isolating a subshell is how you
                read them apart. Said outright, because user testing showed
                the affordance is not discoverable on its own -- and said
                honestly: the overlapping view is the default *because* the
                overlap is real (spec §2). */}
            <Typography variant="caption" className="subshell-isolate-hint" display="block">
                {selectedOrbital
                    ? `Showing one orbital of ${subshellLabel(selectedOrbital.n, selectedOrbital.l)} — pick another below, or Back for the whole subshell`
                    : selectedSubshell
                        ? `Showing ${subshellLabel(selectedSubshell.n, selectedSubshell.l)} alone — click its chip again for the whole shell`
                        : 'Click a subshell to show its orbitals on their own'}
            </Typography>

            {activeSubshell && (
                <Box className="subshell-ml-row" role="group" aria-label="magnetic quantum number">
                    {Array.from({ length: 2 * activeSubshell.l + 1 }, (_, i) => i - activeSubshell.l).map(ml => (
                        <Button
                            key={ml}
                            size="small"
                            className={`subshell-ml-button${
                                selectedOrbital
                                && selectedOrbital.n === activeSubshell.n
                                && selectedOrbital.l === activeSubshell.l
                                && selectedOrbital.ml === ml ? ' selected' : ''}`}
                            aria-pressed={Boolean(
                                selectedOrbital
                                && selectedOrbital.n === activeSubshell.n
                                && selectedOrbital.l === activeSubshell.l
                                && selectedOrbital.ml === ml
                            )}
                            onClick={() => onSelectOrbital(activeSubshell.n, activeSubshell.l, ml)}
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
                            {orbitalName(activeSubshell.n, activeSubshell.l, ml)}
                        </Button>
                    ))}
                </Box>
            )}

            {/* The whole atom's orbital energies, with this shell's subshells
                picked out in their own colours and named. It used to be
                captioned "Radial distribution D(r)", which it is not. */}
            <Typography variant="caption" className="subshell-panel-legend" display="block">
                Orbital energies, whole atom (log |E|)
            </Typography>

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
                            <g key={`label-${sub.n}-${sub.l}`}>
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
                                    {subshellLabel(sub.n, sub.l)}
                                </text>
                            </g>
                        );
                    });
                })()}
                {subshells.map(subshell => {
                    const isCurrent = subshell.n === shellN;
                    const y = ruleY(subshell.energy, minEnergy, maxEnergy);
                    const color = isCurrent
                        ? CURVE_COLORS[shellSubshells.indexOf(subshell) % CURVE_COLORS.length]
                        : undefined;
                    return (
                        <g key={`${subshell.n}-${subshell.l}`}>
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
        </Box>
    );
};

export default SubshellPanel;
