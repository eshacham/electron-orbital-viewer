import React from 'react';
import { ESP_TICKS, espLegendGradient } from '../molecules/esp_color';
import InfoButton from '../info/InfoButton';

interface EspLegendProps {
    /**
     * Ruling T16-c: a sideways phone has under 400 px of height; compact is the thinner, shorter bar. Ruling R22c: the
     * key column is a narrow strip on every viewport, so App always asks for it.
     */
    compact?: boolean;
}

/**
 * The ESP map's key: the bar on its fixed scale, its two ends named -- electron-rich where the potential is negative
 * (red, ESP_STOPS), electron-poor where it is positive (blue) -- and an (i) on the map's term. Task 7b: the notes the
 * key kept behind its own ⓘ (the colours and scale, the fixed ρ = 0.001 surface and the method, this molecule's range)
 * are Info's sentences now (moleculeInfo); the PNG export's key still prints them (esp_color.ts). Ruling R22c (owner
 * review 2026-10-14): sits in the right-hand key column every mode uses (`KeyColumn`).
 */
const EspLegend: React.FC<EspLegendProps> = ({ compact = false }) => (
    <div className={compact ? 'esp-legend compact' : 'esp-legend'} aria-label="electrostatic potential colour key">
        <div
            className="esp-legend-bar"
            data-gradient={espLegendGradient()}
            style={{ backgroundImage: espLegendGradient() }}
        />
        <div className="esp-legend-ticks">
            {ESP_TICKS.map(tick => <span key={tick}>{tick}</span>)}
        </div>
        <div className="esp-legend-ends">
            <span>electron-rich</span>
            <span>electron-poor</span>
        </div>
        <span className="esp-legend-info">
            <InfoButton topic="esp" label="Electrostatic potential" place="legend" />
        </span>
    </div>
);

export default EspLegend;
