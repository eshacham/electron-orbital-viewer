import React from 'react';
import { Box, Chip, Typography, Button } from '@mui/material';
import { SerialisedSubshell } from '../workers/atomWorker';
import { subshellLabel } from '../atom/configurations';
import { orbitalName } from '../orbital_names';

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
    onSelectSubshell: (n: number, l: number) => void;
    onSelectOrbital: (n: number, l: number, ml: number) => void;
}

const DIAGRAM_WIDTH = 120;
const DIAGRAM_HEIGHT = 80;
const DIAGRAM_PADDING = 6;

/**
 * Vertical position for an energy rule: least-bound (least negative) states
 * near the top, most tightly bound (most negative) near the bottom, which is
 * the usual convention for an energy-level diagram. Falls back to the
 * middle when every subshell happens to share one energy (a single-subshell
 * atom), so the divide-by-zero case never has to be a special case above.
 */
function ruleY(energy: number, minEnergy: number, maxEnergy: number): number {
    const range = maxEnergy - minEnergy;
    const t = range > 0 ? (energy - minEnergy) / range : 0.5;
    return DIAGRAM_PADDING + (1 - t) * (DIAGRAM_HEIGHT - 2 * DIAGRAM_PADDING);
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
    subshells, shellN, selectedSubshell, onSelectSubshell, onSelectOrbital,
}) => {
    const shellSubshells = subshells.filter(s => s.n === shellN);

    const energies = subshells.map(s => s.energy);
    const minEnergy = Math.min(...energies);
    const maxEnergy = Math.max(...energies);

    const activeSubshell = selectedSubshell && selectedSubshell.n === shellN
        ? shellSubshells.find(s => s.l === selectedSubshell.l) ?? null
        : null;

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

            {activeSubshell && (
                <Box className="subshell-ml-row" role="group" aria-label="magnetic quantum number">
                    {Array.from({ length: 2 * activeSubshell.l + 1 }, (_, i) => i - activeSubshell.l).map(ml => (
                        <Button
                            key={ml}
                            size="small"
                            className="subshell-ml-button"
                            onClick={() => onSelectOrbital(activeSubshell.n, activeSubshell.l, ml)}
                        >
                            {orbitalName(activeSubshell.n, activeSubshell.l, ml)}
                        </Button>
                    ))}
                </Box>
            )}

            <Typography variant="caption" className="subshell-panel-legend" display="block">
                Radial distribution D(r) = 4πr²ρ(r)
            </Typography>

            <svg
                className="subshell-energy-diagram"
                width={DIAGRAM_WIDTH}
                height={DIAGRAM_HEIGHT}
                role="img"
                aria-label="orbital energy diagram"
            >
                {subshells.map(subshell => (
                    <line
                        key={`${subshell.n}-${subshell.l}`}
                        className={`subshell-energy-rule${subshell.n === shellN ? ' current' : ''}`}
                        x1={DIAGRAM_PADDING}
                        x2={DIAGRAM_WIDTH - DIAGRAM_PADDING}
                        y1={ruleY(subshell.energy, minEnergy, maxEnergy)}
                        y2={ruleY(subshell.energy, minEnergy, maxEnergy)}
                    />
                ))}
            </svg>
        </Box>
    );
};

export default SubshellPanel;
