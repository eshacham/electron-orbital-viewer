import React, { useId, useState } from 'react';
import { Button, Slider } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { renderPref } from '../design/presentation';
import { usePref } from '../design/usePref';
import { useQuantumTheme } from '../design/useQuantumTheme';
import { glowPref, resetGlow, setGlowKnob } from '../design/glow_pref';
import { effectiveGlow, GLOW_CAPS, glowKnobApplies, type GlowKnob } from '../orbital_glow';
import './advanced_appearance.css';

/**
 * Task 16b (owner R24-adv): the Glow tuning the owner used on his throwaway
 * panel, kept for every viewer, in plain words. Each slider is one
 * GLOW_TUNING value (orbital_glow.ts), capped by GLOW_CAPS. The halo and the
 * mesh lines are absent where they are never drawn (a phone, `lowPower`);
 * the halo and the edge whiteness in Light Clean, which reads neither.
 */
const SLIDERS: ReadonlyArray<{ knob: GlowKnob; label: string; extra?: boolean; phaseless?: boolean }> = [
    // Task 16d item 11: "strength", not "glow" -- in Light Clean it drives a darker ink rim.
    { knob: 'rimStrength', label: 'Edge strength' },
    // GLOW_CAPS' rimPower, the Fresnel exponent: higher is a sharper, thinner edge (Task 16d item 11).
    { knob: 'rimPower', label: 'Edge sharpness' },
    { knob: 'emissive', label: 'Brightness' },
    { knob: 'haloOpacity', label: 'Halo', extra: true },
    { knob: 'linesOpacity', label: 'Mesh lines', extra: true },
    { knob: 'linesWhiten', label: 'Mesh line whiteness', extra: true },
    // Ruling T15-b: never applied to an ESP map, whose white means ≈ 0 potential. Task 16d item 13: it acts only on
    // a phase-less surface (vQlPhase 0), so it is offered only while one is drawn, and says which.
    { knob: 'ownRimWhiten', label: 'Edge whiteness (density and lobes)', phaseless: true },
];

/** Task 16d item 10: why the halo and mesh rows are disabled while ruling R10's frame-time guard has them off. */
export const EXTRAS_OFF_NOTE = 'Off to keep this device smooth';

const decimals = (knob: GlowKnob) => (GLOW_CAPS[knob].step < 0.01 ? 3 : GLOW_CAPS[knob].step < 0.1 ? 2 : 1);
const format = (knob: GlowKnob, value: number) => value.toFixed(decimals(knob));

interface AdvancedAppearanceProps {
    /**
     * Whether anything drawn can wear Glow: not a wireframe (today's
     * material), nor Atoms' whole-atom view (a shell picture, its strip ring
     * glyphs). False hides the block ("real or absent", spec §3.5).
     */
    drawsGlow: boolean;
    /** A phone (Appearance.lowPower): Glow's halo and mesh lines are never drawn there. */
    lowPower: boolean;
    /**
     * Task 16d item 13: a phase-less surface is drawn -- a density, composition lobes, a combination overlay --
     * the only kind the edge whiteness acts on (an orbital's rim is its phase's; an ESP map's is never whitened).
     */
    phaselessDrawn: boolean;
    /** Task 16d item 10: the frame-time guard has the halo and mesh lines off (ruling R10), until the look next changes. */
    extrasSuppressed?: boolean;
}

/**
 * "Advanced appearance": a folded block at the bottom of the inspector's
 * Display section (ruling R24-3 sections; it is Display's content, not a
 * section of its own), shown only while something drawn glows. A personal
 * preference for the current theme (eov.glow, glow_pref.ts), never in a
 * link; Reset to default brings back the owner's tuned values.
 */
const AdvancedAppearance: React.FC<AdvancedAppearanceProps> = ({ drawsGlow, lowPower, phaselessDrawn, extrasSuppressed = false }) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const { finish } = usePref(renderPref);
    const { mode: theme } = useQuantumTheme();
    const overrides = usePref(glowPref)[theme];
    if (finish !== 'glow' || !drawsGlow) return null;
    const values = effectiveGlow(theme, overrides);
    const shown = SLIDERS.filter(slider => glowKnobApplies(slider.knob, theme) && !(lowPower && slider.extra)
        && !(slider.phaseless && !phaselessDrawn));
    const bodyId = `${id}-body`;
    const noteId = `${id}-extras-off`;
    const firstExtra = shown.find(slider => slider.extra)?.knob;
    return (
        <div className="advanced-appearance">
            <button type="button" className="advanced-appearance-toggle" aria-expanded={open}
                aria-controls={open ? bodyId : undefined} onClick={() => setOpen(was => !was)}>
                Advanced appearance
                <ExpandMore className="advanced-appearance-chevron" fontSize="small" aria-hidden="true" />
            </button>
            {open && (
                <div id={bodyId} className="advanced-appearance-body">
                    {shown.map(({ knob, label, extra }) => {
                        const labelId = `${id}-${knob}`;
                        const { min, max, step } = GLOW_CAPS[knob];
                        const off = Boolean(extra) && extrasSuppressed;
                        return (
                            <React.Fragment key={knob}>
                                {off && knob === firstExtra && <p id={noteId} className="advanced-appearance-note">{EXTRAS_OFF_NOTE}</p>}
                                <div className="advanced-appearance-row">
                                    <div className="advanced-appearance-label">
                                        <span id={labelId}>{label}</span>
                                        <span className="advanced-appearance-value ql-tabular" aria-hidden="true">{format(knob, values[knob])}</span>
                                    </div>
                                    <Slider size="small" value={values[knob]} min={min} max={max} step={step} disabled={off}
                                        aria-labelledby={labelId} getAriaValueText={value => format(knob, value)}
                                        // On the input itself (the slider role), where a screen reader reads it -- MUI puts a plain
                                        // aria-describedby on the root.
                                        slotProps={{ input: { 'aria-describedby': off ? noteId : undefined } }}
                                        onChange={(_event, value) => setGlowKnob(theme, knob, Array.isArray(value) ? value[0] : value)} />
                                </div>
                            </React.Fragment>
                        );
                    })}
                    <Button size="small" variant="outlined" className="advanced-appearance-reset"
                        disabled={Object.keys(overrides).length === 0} onClick={() => resetGlow(theme)}>
                        Reset to default
                    </Button>
                </div>
            )}
        </div>
    );
};

export default AdvancedAppearance;
