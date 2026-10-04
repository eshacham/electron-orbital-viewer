import React, { useMemo } from 'react';
import { DiagramBox, DiagramLevel, buildMoDiagram, spinOrderNote } from '../bonds/mo_diagram';
import { MoleculeOrbitalInfo } from '../molecules/types';

interface MoDiagramProps {
    /** meta.json's `orbitals`, or H₂⁺'s two exact levels (h2plusOrbitals). */
    orbitals: MoleculeOrbitalInfo[];
    /** The orbital on screen, by index; its box is outlined and aria-pressed. */
    selectedIndex: number | null;
    /** The clicked box's orbital index (the α orbital of an unrestricted pair). */
    onSelect?: (index: number) => void;
    /** Bond order and method, under the diagram. */
    footer?: string;
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

const SPIN_WORD: Record<string, string> = { alpha: ', alpha spin', beta: ', beta spin', restricted: '' };

/**
 * A box's accessible name: which degenerate partner it is, its energy (a
 * Kohn–Sham eigenvalue for a molecule, an exact electronic energy for H₂⁺ --
 * never called an ionisation energy), how many electrons sit in it, and its
 * spin where that is meaningful (O₂'s α/β pair have different occupations).
 */
function boxLabel(level: DiagramLevel, box: DiagramBox, index: number): string {
    const occupation = (box.up ? 1 : 0) + (box.down ? 1 : 0);
    return `${level.label} (${index + 1} of ${level.boxes.length}), ${level.energyHartree.toFixed(3)} Ha, `
        + `occupation ${occupation}${SPIN_WORD[level.spin]}`;
}

/**
 * The molecular-orbital energy diagram: valence levels to scale, cores in a
 * compressed band under a break (they sit 10+ Ha lower and would flatten
 * everything else). Each box is a native <button> -- keyboard-reachable by
 * Tab, activated by Enter/Space -- that draws that orbital.
 */
const MoDiagram: React.FC<MoDiagramProps> = ({ orbitals, selectedIndex, onSelect, footer, width = 260 }) => {
    const model = useMemo(() => buildMoDiagram(orbitals), [orbitals]);
    const note = spinOrderNote(model);
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
                    title={`${level.label}: ε = ${level.energyHartree.toFixed(4)} Ha`}
                    onClick={() => onSelect?.(box.orbitalIndex)}
                >
                    {box.up && <span>↑</span>}
                    {box.down && <span>↓</span>}
                </button>
            ))}
            <span className="mo-label">{level.label}</span>
        </div>
    );

    return (
        <div className="mo-diagram" style={{ width }} role="group" aria-label="molecular orbital energy diagram">
            <div className="mo-levels" style={{ height: HEIGHT }}>
                {valence.map((level, i) => renderLevel(level, ys[i]))}
                {core.length > 0 && <div className="mo-break" style={{ top: HEIGHT - CORE_BAND }}>≈ core</div>}
                {core.map((level, i) => renderLevel(level, CORE_ROW_Y, i * CORE_COLUMN))}
            </div>
            {note && <div className="mo-note">{note}</div>}
            {footer && <div className="mo-footer">{footer}</div>}
        </div>
    );
};

export default MoDiagram;
