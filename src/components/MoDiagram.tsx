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
 * The molecular-orbital energy diagram, to one true eV scale (science corrections S1): every level holding electrons and the lowest wholly empty one
 * at its energy, MO_PX_PER_EV for every system, read off an eV axis at the left; a close pair side by side at its true
 * heights, never pushed apart. Two bands are not to scale, each in one row behind a break marked on the axis: the core,
 * far below (10+ Ha down, it would flatten everything else), and the higher empty levels, above (ruling M2). A system
 * too tall for the cap shrinks to fit, and a note under the axis says so. Each box is a native <button> --
 * keyboard-reachable by Tab, activated by Enter/Space -- that draws that orbital. Task 7a: the bond order footer and the
 * α/β note under it are Info's (bondsInfo); the labels carry a real subscript g or u.
 */
const MoDiagram: React.FC<MoDiagramProps> = ({ orbitals, selectedIndex, onSelect, width = MO_DIAGRAM_WIDTH }) => {
    const model = useMemo(() => buildMoDiagram(orbitals), [orbitals]);
    const layout = useMemo(() => layoutMoDiagram(model.levels, { width }), [model, width]);
    const { axis, breakY, upperBreakY, height } = layout;
    // A break's mark sits on the axis at the middle of its line: a gap with two slanted strokes, and the axis runs on
    // beside the band's row.
    const breakMid = breakY === null ? null : breakY + MO_BREAK_LINE / 2;
    const upperMid = upperBreakY === null ? null : upperBreakY + MO_BREAK_LINE / 2;
    const breakMark = (mid: number) => (
        <g className="mo-axis-break" key={mid}>
            <line x1={MO_AXIS_X - 4} x2={MO_AXIS_X + 4} y1={mid} y2={mid - 4} />
            <line x1={MO_AXIS_X - 4} x2={MO_AXIS_X + 4} y1={mid + 4} y2={mid} />
        </g>
    );

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
    const rowsWhere = (band: (level: DiagramLevel) => boolean) => layout.rows
        .filter(row => band(model.levels[row.levelIndex]))
        .map(row => renderLevel(model.levels[row.levelIndex], row.y, row.xOffset));

    return (
        <div className="mo-diagram" style={{ width }} role="group" aria-label="molecular orbital energy diagram">
            <div className="mo-levels" style={{ height }}>
                <svg className="mo-axis" aria-hidden="true" width={MO_AXIS_WIDTH} height={height}>
                    {/* The unit heads the scale it names: under the upper break when the higher empty levels fold. */}
                    <text className="mo-axis-unit" x={LABEL_X} y={upperBreakY === null ? 0 : upperBreakY + MO_BREAK_LINE}
                        textAnchor="end" dominantBaseline="hanging">eV</text>
                    {upperMid !== null && <line className="mo-axis-line" x1={MO_AXIS_X} x2={MO_AXIS_X} y1={0} y2={upperMid - 2} />}
                    {upperMid !== null && breakMark(upperMid)}
                    <line className="mo-axis-line" x1={MO_AXIS_X} x2={MO_AXIS_X} y1={upperMid === null ? axis.top : upperMid + 2}
                        y2={breakMid === null ? axis.bottom : breakMid - 2} />
                    {axis.ticks.map(tick => (
                        <g key={tick.label}>
                            <line className="mo-axis-tick" x1={MO_AXIS_X - TICK} x2={MO_AXIS_X} y1={tick.y} y2={tick.y} />
                            <text className="mo-axis-label" x={LABEL_X} y={tick.y} textAnchor="end" dominantBaseline="central">{tick.label}</text>
                        </g>
                    ))}
                    {breakMid !== null && breakMark(breakMid)}
                    {breakMid !== null && <line className="mo-axis-line" x1={MO_AXIS_X} x2={MO_AXIS_X} y1={breakMid + 2} y2={height} />}
                </svg>
                {/* Reading and tab order (re-review N2): the levels to scale bottom-up, then the folded band above them, then
                    the core; each is placed by its own top and left, so the order moves nothing on screen. */}
                {rowsWhere(level => !level.core && !level.folded)}
                {upperBreakY !== null && <div className="mo-break mo-break-upper" style={{ top: upperBreakY, left: MO_LEVEL_LEFT }}>≈ higher empty levels</div>}
                {rowsWhere(level => level.folded)}
                {breakY !== null && <div className="mo-break" style={{ top: breakY, left: MO_LEVEL_LEFT }}>≈ core</div>}
                {rowsWhere(level => level.core)}
            </div>
            {/* The axis is a picture (aria-hidden); so is this remark about its scale. */}
            {axis.shrunk && <div className="mo-axis-note" aria-hidden="true">scale reduced to fit</div>}
        </div>
    );
};

export default MoDiagram;
