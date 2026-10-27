import React from 'react';
import './viewport.css';
import type { ViewLevel } from '../store/atomSlice';
import type { PhaseColours } from '../design/science';

/** The right-hand key column (spec §8.5, §11.5): every colour on the view, with text. */
const KeyColumn: React.FC<{ compact?: boolean; children: React.ReactNode }> = ({ compact = false, children }) => (
    <div className={`key-column${compact ? ' compact' : ''}`} role="group" aria-label="colour keys">{children}</div>
);

/**
 * The ψ key: positive and negative swatches, always in the theme's phase
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

/**
 * Atom and shell level (§11.5): one swatch per ring, matching the plot. Task 6: the cut-face caption it carried is said
 * once, in Info (atomInfo), not here and again under the plot.
 */
export const ShellRingKey: React.FC<{ items: ShellRingItem[] }> = ({ items }) => (
    <div className="phase-legend shell-ring-key" aria-label="shell colour key">
        {items.map(item => (
            <span key={item.label} className="phase-legend-item">
                <span className="phase-legend-swatch" style={{ background: item.colour }} />
                <span aria-hidden={item.spoken ? true : undefined}>{item.label}</span>
                {item.spoken && <span className="visually-hidden">{item.spoken}</span>}
            </span>
        ))}
    </div>
);

interface AtomKeysProps {
    level: ViewLevel;
    phase: PhaseColours;
    shellItems: ShellRingItem[];
    /** The strip below shows orbital pictures (shell or subshell level): their ψ colours need a key too (§3.3). */
    orbitalTiles?: boolean;
}

/**
 * The Atom screen's key column (§9.1 "Viewport", §11.5): the shell rings at
 * atom and shell level, the ψ key at orbital level. Ruling R22a: no
 * High/Low bar -- an orbital's surface and cut face are always phase-coloured.
 */
export const AtomKeys: React.FC<AtomKeysProps> = ({ level, phase, shellItems, orbitalTiles = false }) => {
    if (level !== 'orbital') {
        return (
            <>
                <ShellRingKey items={shellItems} />
                {/* Ruling T16-tilekey (§3.3): the strip's orbital tiles are phase-coloured; at orbital level the surface key covers them. */}
                {orbitalTiles && <PhaseKey positive={phase.positive} negative={phase.negative} heading="Orbital tiles" label="orbital tile colour key" />}
            </>
        );
    }
    return <PhaseKey positive={phase.positive} negative={phase.negative} />;
};

export default KeyColumn;
