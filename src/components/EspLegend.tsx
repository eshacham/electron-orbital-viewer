import React, { useState } from 'react';
import { ESP_SIGN_NOTE, ESP_TICKS, espLegendGradient, espRangeNote, espSurfaceNote } from '../molecules/esp_color';

interface EspLegendProps {
    /** ESP range on the drawn vertices, Ha/e; null until the surface lands. */
    range: [number, number] | null;
    method: string;
    /**
     * Ruling T16-c: a sideways phone has under 400 px of height, and the
     * full key covered the molecule. Compact keeps the bar and its scale;
     * the notes -- the method among them -- are behind an info toggle.
     */
    compact?: boolean;
}

/**
 * The ESP map's key: states the fixed scale, the 0.001 surface (ruling D4:
 * exact, not an enclosed fraction) and the method, and -- once a surface is
 * drawn -- this molecule's own range, flagging when it runs past the fixed
 * scale. Sits in `.molecule-legend-stack`, the bottom-centre slot the ψ
 * legend (`.phase-legend`) uses (spec §3.8: no new floating panel).
 */
const EspLegend: React.FC<EspLegendProps> = ({ range, method, compact = false }) => {
    const [notesOpen, setNotesOpen] = useState(false);
    const showNotes = !compact || notesOpen;
    return (
        <div className={compact ? 'esp-legend compact' : 'esp-legend'} aria-label="electrostatic potential colour key">
            <div
                className="esp-legend-bar"
                data-gradient={espLegendGradient()}
                style={{ backgroundImage: espLegendGradient() }}
            />
            <div className="esp-legend-ticks">
                {ESP_TICKS.map(tick => <span key={tick}>{tick}</span>)}
            </div>
            {compact && (
                <button type="button" className="esp-legend-info" aria-label="about this colour key"
                    aria-expanded={notesOpen} onClick={() => setNotesOpen(open => !open)}>ⓘ</button>
            )}
            {showNotes && (
                <>
                    {/* Worded in esp_color.ts, shared with the PNG export's key (Task 16b). */}
                    <div className="esp-legend-note">{ESP_SIGN_NOTE}</div>
                    <div className="esp-legend-note">{espSurfaceNote(method)}</div>
                    {range && <div className="esp-legend-note">{espRangeNote(range)}</div>}
                </>
            )}
        </div>
    );
};

export default EspLegend;
