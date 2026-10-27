import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FormControl, InputLabel, LinearProgress, ListSubheader, MenuItem, Select, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { BondsState, BondsView } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { BOND_GROUP_ORDER, BONDS_SYSTEMS, BondsSystemId, DENSITY_ISO_VALUES, bondOrderSelectText, nearestScanIndex, systemFormula } from '../bonds/systems';
import { H2PLUS_R_RANGE } from '../bonds/h2plus';
import { lengths } from '../bonds/captions';
import { h2plusOrbitals } from '../bonds/mo_diagram';
import { MoleculeOrbitalInfo } from '../molecules/types';
import { frontierOccupied } from '../molecules/orbital_display';
import { withSubscripts } from '../format/subscripts';
import InfoButton from '../info/InfoButton';
import MoDiagram from './MoDiagram';

/** The orbital "One orbital" opens onto when none is picked yet: the HOMO, or the SOMO if open-shell (preflight D8's shared resolver). */
function frontierOccupiedIndex(orbitals: readonly MoleculeOrbitalInfo[]): number | null {
    return frontierOccupied(orbitals)?.index ?? null;
}

export interface BondsPanelProps {
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

/**
 * Bonds mode's navigation: system, geometry, what to draw and the diagram.
 * The potential curve is not here: the layout contract puts it in the view
 * column and the phone's Plot tab (BondsCurvePlot). Task 7a: the panel keeps
 * controls and short labels -- the energy line, the density label, the MO
 * legend and the bond-order footer are Info's (bondsInfo), with every method.
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

    const status = data.loading ? `Loading ${formula}…`
        : !isExact && meta && bonds.R !== null ? `${formula} at R = ${bonds.R.toFixed(2)} a₀ loaded.` : '';
    const failure = data.error && (scan && bonds.R !== null
        ? `${formula} at ${lengths(bonds.R)} could not be loaded: ${data.error}. The view still shows the previous picture.`
        : `${formula} could not be loaded: ${data.error}. The view still shows the previous system.`);

    return (
        <div className="bonds-panel">
            <FormControl fullWidth size="small" margin="dense">
                <InputLabel id="bonds-system-label">Molecule (by bond type)</InputLabel>
                <Select labelId="bonds-system-label" label="Molecule (by bond type)" value={bonds.system}
                    onChange={event => onSelectSystem(event.target.value as BondsSystemId)}
                    renderValue={value => {
                        const system = BONDS_SYSTEMS.find(s => s.id === value);
                        return system ? `${system.formula} — ${system.name}` : value;
                    }}>
                    {BOND_GROUP_ORDER.flatMap(group => [
                        <ListSubheader key={group}>{group}</ListSubheader>,
                        ...BONDS_SYSTEMS.filter(s => s.group === group).map(s => (
                            <MenuItem key={s.id} value={s.id} aria-label={`${s.formula} — ${s.name}, ${bondOrderSelectText(s.id)}`}>
                                <div>
                                    <div>{s.formula} — {s.name}</div>
                                    <Typography variant="caption" color="text.secondary" component="div">{bondOrderSelectText(s.id)}</Typography>
                                </div>
                            </MenuItem>
                        )),
                    ])}
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
                    }}
                    // WAI-ARIA slider: Home and End go to the first and last
                    // points. MUI with step={null} treats them as one mark
                    // down or up, so they are taken in the capture phase,
                    // before its own handler sees them.
                    slotProps={{ input: { onKeyDownCapture: (event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key !== 'Home' && event.key !== 'End') return;
                        event.preventDefault();
                        event.stopPropagation();
                        const index = event.key === 'Home' ? 0 : scan.points.length - 1;
                        setDraftR(scan.points[index].RBohr);
                        onScanIndex(index);
                    } } }} />
            )}

            {isExact ? (
                <ToggleButtonGroup exclusive size="small" fullWidth aria-label="H₂⁺ state" value={view.kind === 'h2plus' ? view.state : null}
                    onChange={(_, state) => state && onView({ kind: 'h2plus', state })}>
                    {/* One span each: a ToggleButton lays out as flex, which would drop the space after the <sub>. */}
                    <ToggleButton value="1sigma_g" aria-label="1σg (bonding)"><span>{withSubscripts('1σg')} bonding</span></ToggleButton>
                    <ToggleButton value="1sigma_u" aria-label="1σu* (antibonding)"><span>{withSubscripts('1σu*')} antibonding</span></ToggleButton>
                </ToggleButtonGroup>
            ) : (
                <>
                    {/* Ruling R23e: an explicit, two-way switch -- the owner's reading of the
                        old lone "Total density" button as ambiguous ("Is Total density a
                        button?"). Picking "One orbital" with nothing picked yet opens on the
                        frontier (HOMO, or SOMO where the ground state is open-shell); picking
                        it again, or a box in the diagram below, is unchanged. */}
                    <ToggleButtonGroup exclusive size="small" fullWidth aria-label="Show" value={view.kind === 'density' ? 'density' : 'orbital'}
                        onChange={(_, v) => {
                            if (v === 'density') onView({ kind: 'density' });
                            else if (v === 'orbital' && selectedIndex === null && orbitals) {
                                const index = frontierOccupiedIndex(orbitals);
                                if (index !== null) onView(viewForIndex(index));
                            }
                        }}>
                        <ToggleButton value="density" aria-label="Total electron density">Total density</ToggleButton>
                        <ToggleButton value="orbital" aria-label="One orbital" disabled={!orbitals || orbitals.length === 0}>One orbital</ToggleButton>
                    </ToggleButtonGroup>
                    {/* Task 7a: what the surface at this ρ shows is Info's (bondsInfo), with no method in it. */}
                    {view.kind === 'density' && (
                        <ToggleButtonGroup exclusive size="small" fullWidth aria-label="Density surface" value={bonds.densityIso}
                            onChange={(_, v) => v !== null && onDensityIso(v)}>
                            {DENSITY_ISO_VALUES.map(v => <ToggleButton key={v} value={v} aria-label={`ρ = ${v} e/a₀³`}>ρ = {v}</ToggleButton>)}
                        </ToggleButtonGroup>
                    )}
                </>
            )}
            {note && <Typography variant="caption" className="bonds-note">{withSubscripts(note)}</Typography>}

            {orbitals && orbitals.length > 0 && (
                <div className="mo-section">
                    {/* Task 7a: a short heading with an (i); the legend, the bond-order footer and the α/β note are Info's. */}
                    <div className="mo-heading-row">
                        <Typography variant="subtitle2" className="mo-heading">Molecular orbitals</Typography>
                        <InfoButton topic="moDiagram" label="Molecular orbitals" />
                    </div>
                    <MoDiagram orbitals={orbitals} selectedIndex={selectedIndex}
                        onSelect={index => onView(viewForIndex(index))} />
                </div>
            )}
        </div>
    );
};

export default BondsPanel;
