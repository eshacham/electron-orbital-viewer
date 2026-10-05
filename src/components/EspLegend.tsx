import React from 'react';
import { ESP_LIMIT_HARTREE, HARTREE_TO_KCAL_PER_MOL, ESP_SURFACE_DENSITY, espLegendGradient, formatEsp } from '../molecules/esp_color';

interface EspLegendProps {
    /** ESP range on the drawn vertices, Ha/e; null until the surface lands. */
    range: [number, number] | null;
    method: string;
}

/**
 * The ESP map's key: states the fixed scale, the 0.001 surface (ruling D4:
 * exact, not an enclosed fraction) and the method, and -- once a surface is
 * drawn -- this molecule's own range, flagging when it runs past the fixed
 * scale. Sits in `.molecule-legend-stack`, the bottom-centre slot the ψ
 * legend (`.phase-legend`) uses (spec §3.8: no new floating panel).
 */
const EspLegend: React.FC<EspLegendProps> = ({ range, method }) => {
    const saturated = range !== null && (range[0] < -ESP_LIMIT_HARTREE || range[1] > ESP_LIMIT_HARTREE);
    return (
        <div className="esp-legend" aria-label="electrostatic potential colour key">
            <div
                className="esp-legend-bar"
                data-gradient={espLegendGradient()}
                style={{ backgroundImage: espLegendGradient() }}
            />
            <div className="esp-legend-ticks">
                <span>−{ESP_LIMIT_HARTREE}</span>
                <span>0</span>
                <span>+{ESP_LIMIT_HARTREE} Ha/e</span>
            </div>
            <div className="esp-legend-note">
                red: negative, electron-rich · blue: positive, electron-poor · ±{Math.round(ESP_LIMIT_HARTREE * HARTREE_TO_KCAL_PER_MOL)} kcal/mol
            </div>
            <div className="esp-legend-note">
                fixed at ρ = {ESP_SURFACE_DENSITY} e/a₀³ (not an enclosed fraction) · {method}
            </div>
            {range && (
                <div className="esp-legend-note">
                    this molecule: {formatEsp(range[0])} to {formatEsp(range[1])} Ha/e{saturated ? ', saturated beyond the scale' : ''}
                </div>
            )}
        </div>
    );
};

export default EspLegend;
