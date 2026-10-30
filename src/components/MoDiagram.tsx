import React, { useMemo } from 'react';
import { DiagramBox, DiagramLevel, buildMoDiagram } from '../bonds/mo_diagram';
import { MoleculeOrbitalInfo } from '../molecules/types';
import { withSubscripts } from '../format/subscripts';
import { spokenText } from '../format/sci';
import { orbitalEnergyText } from '../format/energy';
import { layoutMoDiagram, MO_AXIS_WIDTH, MO_AXIS_X, MO_BOX_WIDTH, MO_BREAK_LINE, MO_DIAGRAM_WIDTH, MO_LEVEL_LEFT } from '../bonds/mo_layout';

interface MoDiagramProps {
    /** meta.json's `orbitals`, or H₂⁺'s two exact levels (h2plusOrbitals). */
    orbitals: MoleculeOrbitalInfo[];
    /** The orbital on screen, by index; its box is outlined and aria-pressed. */
    selectedIndex: number | null;
    /** The clicked box's orbital index (the α orbital of an unrestricted pair). */
    onSelect?: (index: number) => void;
    width?: number;
}

/**
 * A level's accessible name (owner R26-3): what pressing it draws -- "2σg orbital, 2 electrons", with plain digits
 * (ruling M6) -- and, for a degenerate partner, which of the pair it is, as the strip names it ("1πu orbital (1 of 2)",
 * bonds_strip_items.ts). The electrons are the arrows it shows: an empty level is "empty". Its energy is Info's fact (the
 * One Home Per Number Rule) and stays in the hover title.
 */
function boxLabel(level: DiagramLevel, box: DiagramBox, index: number): string {
    const electrons = (box.up ? 1 : 0) + (box.down ? 1 : 0);
    const which = level.boxes.length > 1 ? ` (${index + 1} of ${level.boxes.length})` : '';
    const count = electrons === 0 ? 'empty' : electrons === 1 ? '1 electron' : `${electrons} electrons`;
    return `${spokenText(level.label)} orbital${which}, ${count}`;
}

/** The axis's tick marks and labels, left of MO_AXIS_X. */
const TICK = 4;
const LABEL_X = MO_AXIS_X - TICK - 2;

/**
 * The molecular-orbital energy diagram, to one true eV scale (science corrections S1): valence levels at their
 * energies, MO_PX_PER_EV for every system, read off an eV axis at the left; a close pair side by side at its true
 * heights, never pushed apart; cores in one row under a break, marked on the axis (they sit 10+ Ha lower and would
 * flatten everything else). A system too tall for the cap shrinks to fit, and a note under the axis says so. Each box
 * is a native <button> -- keyboard-reachable by Tab, activated by Enter/Space -- that draws that orbital. Task 7a: the
 * bond order footer and the α/β note under it are Info's (bondsInfo); the labels carry a real subscript g or u.
 */
const MoDiagram: React.FC<MoDiagramProps> = ({ orbitals, selectedIndex, onSelect, width = MO_DIAGRAM_WIDTH }) => {
    const model = useMemo(() => buildMoDiagram(orbitals), [orbitals]);
    const layout = useMemo(() => layoutMoDiagram(model.levels), [model]);
    const { axis, breakY, height } = layout;
    // The break's mark sits on the axis at the middle of the "≈ core" line: a gap with two slanted strokes, then the
    // axis runs on beside the core row.
    const breakMid = breakY === null ? null : breakY + MO_BREAK_LINE / 2;

    const renderLevel = (level: DiagramLevel, y: number, xOffset: number) => (
        <div key={`${level.spin}:${level.label}`} className="mo-level" style={{ top: y, left: MO_LEVEL_LEFT + xOffset }}>
            {level.boxes.map((box, i) => (
                <button
                    key={box.orbitalIndex}
                    type="button"
                    className={`mo-box${box.orbitalIndex === selectedIndex ? ' selected' : ''}`}
                    style={{ width: MO_BOX_WIDTH }}
                    aria-label={boxLabel(level, box, i)}
                    aria-pressed={box.orbitalIndex === selectedIndex}
                    title={`${level.label}: ε = ${orbitalEnergyText(level.energyHartree)}`}
                    onClick={() => onSelect?.(box.orbitalIndex)}
                >
                    {box.up && <span>↑</span>}
                    {box.down && <span>↓</span>}
                </button>
            ))}
            <span className="mo-label">{withSubscripts(level.label)}</span>
        </div>
    );

    return (
        <div className="mo-diagram" style={{ width }} role="group" aria-label="molecular orbital energy diagram">
            <div className="mo-levels" style={{ height }}>
                <svg className="mo-axis" aria-hidden="true" width={MO_AXIS_WIDTH} height={height}>
                    <text className="mo-axis-unit" x={LABEL_X} y={0} textAnchor="end" dominantBaseline="hanging">eV</text>
                    <line className="mo-axis-line" x1={MO_AXIS_X} x2={MO_AXIS_X} y1={axis.top}
                        y2={breakMid === null ? axis.bottom : breakMid - 2} />
                    {axis.ticks.map(tick => (
                        <g key={tick.label}>
                            <line className="mo-axis-tick" x1={MO_AXIS_X - TICK} x2={MO_AXIS_X} y1={tick.y} y2={tick.y} />
                            <text className="mo-axis-label" x={LABEL_X} y={tick.y} textAnchor="end" dominantBaseline="central">{tick.label}</text>
                        </g>
                    ))}
                    {breakMid !== null && (
                        <g className="mo-axis-break">
                            <line x1={MO_AXIS_X - 4} x2={MO_AXIS_X + 4} y1={breakMid} y2={breakMid - 4} />
                            <line x1={MO_AXIS_X - 4} x2={MO_AXIS_X + 4} y1={breakMid + 4} y2={breakMid} />
                            <line className="mo-axis-line" x1={MO_AXIS_X} x2={MO_AXIS_X} y1={breakMid + 2} y2={height} />
                        </g>
                    )}
                </svg>
                {layout.rows.filter(row => !model.levels[row.levelIndex].core)
                    .map(row => renderLevel(model.levels[row.levelIndex], row.y, row.xOffset))}
                {breakY !== null && <div className="mo-break" style={{ top: breakY, left: MO_LEVEL_LEFT }}>≈ core</div>}
                {layout.rows.filter(row => model.levels[row.levelIndex].core)
                    .map(row => renderLevel(model.levels[row.levelIndex], row.y, row.xOffset))}
            </div>
            {axis.shrunk && <div className="mo-axis-note">scale reduced to fit</div>}
        </div>
    );
};

export default MoDiagram;
