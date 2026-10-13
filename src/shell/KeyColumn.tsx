import React from 'react';
import './viewport.css';
import type { ViewLevel } from '../store/atomSlice';
import type { ColourScheme } from '../design/presentation';
import { DENSITY_RAMP, type PhaseColours } from '../design/science';

/** The right-hand key column (spec §8.5, §11.5): every colour on the view, with text. */
const KeyColumn: React.FC<{ compact?: boolean; children: React.ReactNode }> = ({ compact = false, children }) => (
    <div className={`key-column${compact ? ' compact' : ''}`} role="group" aria-label="colour keys">{children}</div>
);

/**
 * The ψ key: positive and negative swatches, always in the active scheme's
 * colours (science.ts, the one source the PNG legend and the vertex colours
 * share). `heading` and `label` say what it describes when that is not the
 * surface on the view (ruling T16-tilekey: the strip's orbital tiles).
 */
export const PhaseKey: React.FC<{ positive: string; negative: string; heading?: string; label?: string }> = ({ positive, negative, heading, label = 'surface colour key' }) => (
    <div className="phase-legend" aria-label={label}>
        {heading && <span className="key-heading">{heading}</span>}
        <span className="phase-legend-item">
            <span className="phase-legend-swatch positive" style={{ background: positive }} />ψ &gt; 0
        </span>
        <span className="phase-legend-item">
            <span className="phase-legend-swatch negative" style={{ background: negative }} />ψ &lt; 0
        </span>
    </div>
);

export interface ShellRingItem { label: string; colour: string; spoken?: string }

/** Atom and shell level (§11.5): one swatch per ring, matching the plot, with today's cut-face caption. */
export const ShellRingKey: React.FC<{ items: ShellRingItem[] }> = ({ items }) => (
    <div className="phase-legend shell-ring-key" aria-label="shell colour key">
        {items.map(item => (
            <span key={item.label} className="phase-legend-item">
                <span className="phase-legend-swatch" style={{ background: item.colour }} />
                <span aria-hidden={item.spoken ? true : undefined}>{item.label}</span>
                {item.spoken && <span className="visually-hidden">{item.spoken}</span>}
            </span>
        ))}
        <span className="key-caption">cut face shading is scaled to local shell structure</span>
    </div>
);

/** The "Density on the cut face" bar (§11.5): High at the top, Low at the bottom, an exact caption. */
export const DensityRampKey: React.FC = () => (
    <div className="density-ramp-key" aria-label="cut-face density key">
        <div className="density-ramp-scale">
            <span className="density-ramp-high">High</span>
            <span className="density-ramp-bar" style={{ background: `linear-gradient(to top, ${DENSITY_RAMP.join(', ')})` }} />
            <span className="density-ramp-low">Low</span>
        </div>
        <span className="key-caption">|ψ|² on the cut face: from the surface value (Low) to the peak (High), log scale</span>
    </div>
);

interface AtomKeysProps {
    level: ViewLevel;
    scheme: ColourScheme;
    cutOn: boolean;
    phase: PhaseColours;
    shellItems: ShellRingItem[];
    /** The strip below shows orbital pictures (shell or subshell level): their ψ colours need a key too (§3.3). */
    orbitalTiles?: boolean;
}

/**
 * The Atom screen's key column (§9.1 "Viewport", §11.5). The High/Low bar
 * exists only where a scalar is mapped -- an orbital's cut face in the
 * Density scheme -- and never alone beside a phase-coloured surface.
 */
export const AtomKeys: React.FC<AtomKeysProps> = ({ level, scheme, cutOn, phase, shellItems, orbitalTiles = false }) => {
    if (level !== 'orbital') {
        return (
            <>
                <ShellRingKey items={shellItems} />
                {/* Ruling T16-tilekey (§3.3): the strip's orbital tiles are phase-coloured; at orbital level the surface key covers them. */}
                {orbitalTiles && <PhaseKey positive={phase.legendPositive} negative={phase.legendNegative} heading="Orbital tiles" label="orbital tile colour key" />}
            </>
        );
    }
    return (
        <>
            <PhaseKey positive={phase.legendPositive} negative={phase.legendNegative} />
            {scheme === 'density' && (cutOn
                ? <DensityRampKey />
                : <p className="key-note" role="note">Pick a cut axis to see the density inside</p>)}
        </>
    );
};

export default KeyColumn;
