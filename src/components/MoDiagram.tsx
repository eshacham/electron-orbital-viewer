import React, { useMemo } from 'react';
import { DiagramBox, DiagramLevel, buildMoDiagram } from '../bonds/mo_diagram';
import { MoleculeOrbitalInfo } from '../molecules/types';
import { withSubscripts } from '../format/subscripts';
import { minus, spokenText } from '../format/sci';

interface MoDiagramProps {
    /** meta.json's `orbitals`, or H₂⁺'s two exact levels (h2plusOrbitals). */
    orbitals: MoleculeOrbitalInfo[];
    /** The orbital on screen, by index; its box is outlined and aria-pressed. */
    selectedIndex: number | null;
    /** The clicked box's orbital index (the α orbital of an unrestricted pair). */
    onSelect?: (index: number) => void;
    width?: number;
}

const HEIGHT = 220;
/**
 * The core band under the valence levels: the "≈ core" line, then the core
 * row, each clear of its neighbours (levels are 18 px boxes centred on their
 * y; the break is one 13 px line). At 28 px the break was drawn across both.
 */
const CORE_BAND = 44;
const CORE_ROW_Y = HEIGHT - CORE_BAND + 26;
const BOX = 22;
const MIN_ROW = 20;
/** Core levels (1σg, 1σu*: millihartree apart) share the band's one row, side by side. */
const CORE_COLUMN = 110;

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

/**
 * The molecular-orbital energy diagram: valence levels to scale, cores in a
 * compressed band under a break (they sit 10+ Ha lower and would flatten
 * everything else). Each box is a native <button> -- keyboard-reachable by
 * Tab, activated by Enter/Space -- that draws that orbital. Task 7a: the bond
 * order footer and the α/β note under it are Info's (bondsInfo); the labels
 * carry a real subscript g or u.
 */
const MoDiagram: React.FC<MoDiagramProps> = ({ orbitals, selectedIndex, onSelect, width = 260 }) => {
    const model = useMemo(() => buildMoDiagram(orbitals), [orbitals]);
    const valence = model.levels.filter(level => !level.core);
    const core = model.levels.filter(level => level.core);
    const energies = valence.map(level => level.energyHartree);
    const lo = Math.min(...energies);
    const hi = Math.max(...energies);
    const span = hi - lo || 1;
    const top = 10;
    const bottom = HEIGHT - (core.length ? CORE_BAND : 0) - 14;
    // To scale, but never closer than one row: O₂'s 3σg and 1πu sit 0.01 Ha apart.
    const ys: number[] = [];
    valence.forEach((level, i) => {
        const y = bottom - ((level.energyHartree - lo) / span) * (bottom - top);
        ys.push(i === 0 ? y : Math.min(y, ys[i - 1] - MIN_ROW));
    });

    const renderLevel = (level: DiagramLevel, y: number, left = 0) => (
        <div key={`${level.spin}:${level.label}`} className="mo-level" style={{ top: y, left }}>
            {level.boxes.map((box, i) => (
                <button
                    key={box.orbitalIndex}
                    type="button"
                    className={`mo-box${box.orbitalIndex === selectedIndex ? ' selected' : ''}`}
                    style={{ width: BOX }}
                    aria-label={boxLabel(level, box, i)}
                    aria-pressed={box.orbitalIndex === selectedIndex}
                    title={`${level.label}: ε = ${minus(level.energyHartree.toFixed(4))} Ha`}
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
            <div className="mo-levels" style={{ height: HEIGHT }}>
                {valence.map((level, i) => renderLevel(level, ys[i]))}
                {core.length > 0 && <div className="mo-break" style={{ top: HEIGHT - CORE_BAND }}>≈ core</div>}
                {core.map((level, i) => renderLevel(level, CORE_ROW_Y, i * CORE_COLUMN))}
            </div>
        </div>
    );
};

export default MoDiagram;
