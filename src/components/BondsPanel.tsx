import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FormControl, InputLabel, LinearProgress, MenuItem, Select, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { BondsState, BondsView } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { BONDS_SYSTEMS, BondsSystemId, DENSITY_ISO_VALUES, nearestScanIndex, systemFormula } from '../bonds/systems';
import { H2PLUS_R_RANGE, h2plusTotalEnergy } from '../bonds/h2plus';
import { bondsCaptions, densitySurfaceText, frontierText, lengths, orbitalCaveats, signed } from '../bonds/captions';
import { bondAxisMinimumDensity } from '../bonds/bond_density';
import { bondOrderText, h2plusOrbitals } from '../bonds/mo_diagram';
import MoDiagram from './MoDiagram';

interface BondsPanelProps {
    bonds: BondsState;
    data: BondsData;
    /** Why the drawn picture differs from the selection, if it does. */
    note: string | null;
    onSelectSystem: (id: BondsSystemId) => void;
    onCommitH2PlusR: (R: number) => void;
    onScanIndex: (index: number) => void;
    onView: (view: BondsView) => void;
    onDensityIso: (value: number) => void;
}

const withFullStop = (text: string) => (text.endsWith('.') ? text : `${text}.`);

/**
 * Bonds mode's navigation: system, geometry, what to draw, the diagram, and
 * every method (spec §3.1). The potential curve is not here: the layout
 * contract puts it in the view column and the phone's Plot tab (BondsCurvePlot).
 */
const BondsPanel: React.FC<BondsPanelProps> = ({ bonds, data, note, onSelectSystem, onCommitH2PlusR, onScanIndex, onView, onDensityIso }) => {
    const isExact = bonds.system === 'h2plus';
    const formula = systemFormula(bonds.system);
    const { scan, meta } = data;

    // The sliders move freely while dragged; the (heavier) redraw waits for release.
    const [draftR, setDraftR] = useState(bonds.R ?? 2);
    useEffect(() => { if (bonds.R !== null) setDraftR(bonds.R); }, [bonds.R]);

    const orbitals = useMemo(
        () => (isExact ? h2plusOrbitals(bonds.R ?? 2) : meta?.orbitals ?? null),
        [isExact, bonds.R, meta],
    );
    /** The diagram reports an orbital index; the store keeps label, spin and component (see BondsView). */
    const viewForIndex = (index: number): BondsView => {
        if (isExact) return { kind: 'h2plus', state: index === 0 ? '1sigma_g' : '1sigma_u' };
        const orbital = orbitals!.find(o => o.index === index)!;
        const spin = orbital.spin ?? 'restricted';
        const siblings = orbitals!.filter(o => o.label === orbital.label && (o.spin ?? 'restricted') === spin);
        return { kind: 'mo', label: orbital.label, spin, component: siblings.findIndex(o => o.index === index) };
    };
    // A local const, so the narrowing below survives into the filter callback.
    const view = bonds.view;
    const selectedIndex = view.kind === 'h2plus' ? (view.state === '1sigma_g' ? 0 : 1)
        : view.kind === 'mo' && orbitals
            ? orbitals.filter(o => o.label === view.label && (o.spin ?? 'restricted') === view.spin)[view.component]?.index ?? null
            : null;

    // The readout follows the thumb while it is dragged, for a molecule too.
    const shownR = isExact || bonds.R !== null ? draftR : null;
    const energy = isExact
        ? `E = ${signed(h2plusTotalEnergy(draftR, view.kind === 'h2plus' ? view.state : '1sigma_g'), 5)} Ha (exact, Born–Oppenheimer)`
        : meta ? `E = ${signed(meta.totalEnergyHartree, 5)} Ha, ${meta.method.energies}` : null;
    const footer = isExact
        ? `${withFullStop(bondOrderText(0.5))} One electron, exact energies.`
        : withFullStop(bondOrderText(meta?.bondOrder));
    const frontier = !isExact && meta ? frontierText(meta.orbitals) : null;
    const caveats = isExact ? [] : orbitalCaveats(meta);
    const densityMethod = scan?.densityMethod ?? meta?.method.density ?? null;
    // Whether a surface is one envelope or splits around each nucleus, read
    // off the density drawn (≈ 200 basis evaluations, once per point).
    const minOnAxis = useMemo(() => (data.basis ? bondAxisMinimumDensity(data.basis) : null), [data.basis]);

    const status = data.loading ? `Loading ${formula}…`
        : !isExact && meta && bonds.R !== null ? `${formula} at R = ${bonds.R.toFixed(2)} a₀ loaded.` : '';
    const failure = data.error && (scan && bonds.R !== null
        ? `${formula} at ${lengths(bonds.R)} could not be loaded: ${data.error}. The view still shows the previous picture.`
        : `${formula} could not be loaded: ${data.error}. The view still shows the previous system.`);

    return (
        <div className="bonds-panel">
            <FormControl fullWidth size="small" margin="dense">
                <InputLabel id="bonds-system-label">System</InputLabel>
                <Select labelId="bonds-system-label" label="System" value={bonds.system}
                    onChange={event => onSelectSystem(event.target.value as BondsSystemId)}>
                    {BONDS_SYSTEMS.map(s => <MenuItem key={s.id} value={s.id}>{s.formula} — {s.name}</MenuItem>)}
                </Select>
            </FormControl>

            {/* Polite, for progress; the Alert below is assertive, for failures. */}
            <div className="visually-hidden" role="status">{status}</div>
            {failure && <Alert severity="error">{failure}</Alert>}
            {data.loading && <LinearProgress aria-label={`Loading ${formula}`} />}

            {shownR !== null && <Typography variant="body2" className="bonds-r">{lengths(shownR)}</Typography>}
            {isExact ? (
                <Slider aria-label="Internuclear distance R" size="small" min={H2PLUS_R_RANGE.min} max={H2PLUS_R_RANGE.max} step={0.01}
                    value={draftR} getAriaValueText={lengths}
                    onChange={(_, v) => setDraftR(v as number)} onChangeCommitted={(_, v) => onCommitH2PlusR(v as number)} />
            ) : scan && bonds.R !== null && (
                <Slider aria-label="Internuclear distance R" size="small" step={null}
                    min={scan.points[0].RBohr} max={scan.points[scan.points.length - 1].RBohr}
                    marks={scan.points.map(p => ({ value: p.RBohr }))} value={draftR}
                    getAriaValueText={v => `${lengths(v)}, point ${nearestScanIndex(scan.points, v) + 1} of ${scan.points.length}`}
                    onChange={(_, v) => setDraftR(v as number)}
                    onChangeCommitted={(_, v) => {
                        const index = nearestScanIndex(scan.points, v as number);
                        if (index >= 0) onScanIndex(index);
                    }} />
            )}
            {energy && <Typography variant="body2" className="bonds-energy">{energy}</Typography>}

            {isExact ? (
                <ToggleButtonGroup exclusive size="small" fullWidth aria-label="H₂⁺ state" value={view.kind === 'h2plus' ? view.state : null}
                    onChange={(_, state) => state && onView({ kind: 'h2plus', state })}>
                    <ToggleButton value="1sigma_g" aria-label="1σg (bonding)">1σg bonding</ToggleButton>
                    <ToggleButton value="1sigma_u" aria-label="1σu* (antibonding)">1σu* antibonding</ToggleButton>
                </ToggleButtonGroup>
            ) : (
                <>
                    <ToggleButton size="small" fullWidth value="density" selected={view.kind === 'density'} aria-label="Total electron density"
                        onChange={() => onView({ kind: 'density' })}>Total density</ToggleButton>
                    {view.kind === 'density' && (
                        <>
                            <ToggleButtonGroup exclusive size="small" fullWidth aria-label="Density surface" value={bonds.densityIso}
                                onChange={(_, v) => v !== null && onDensityIso(v)}>
                                {DENSITY_ISO_VALUES.map(v => <ToggleButton key={v} value={v} aria-label={`ρ = ${v} e/a₀³`}>ρ = {v}</ToggleButton>)}
                            </ToggleButtonGroup>
                            <Typography variant="caption" className="bonds-density-label">
                                {densitySurfaceText(bonds.densityIso, densityMethod, minOnAxis)}
                            </Typography>
                        </>
                    )}
                </>
            )}
            {note && <Typography variant="caption" className="bonds-note">{note}</Typography>}

            {orbitals && orbitals.length > 0 && (
                <MoDiagram orbitals={orbitals} selectedIndex={selectedIndex} footer={footer}
                    onSelect={index => onView(viewForIndex(index))} />
            )}
            {frontier && <Typography variant="caption" className="bonds-frontier">{frontier}</Typography>}
            {caveats.map(caveat => <Typography key={caveat} variant="caption" className="bonds-note">{caveat}</Typography>)}

            <ul className="bonds-captions" aria-label="methods">
                {bondsCaptions(bonds.system, scan).map(caption => <li key={caption}>{caption}</li>)}
            </ul>
        </div>
    );
};

export default BondsPanel;
