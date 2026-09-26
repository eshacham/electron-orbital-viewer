import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    ThemeProvider,
    CssBaseline,
    Box,
    Alert,
    Snackbar,
    CircularProgress
} from '@mui/material';
import { useAppDispatch, useAppSelector } from './store/hooks';
import {
    startOrbitalCalculation,
    startFieldCalculation,
    finishOrbitalCalculation,
    failOrbitalCalculation,
    dismissOrbitalError,
    resetView,
    setSurfaceStyle,
    clearPicture
} from './store/orbitalSlice';
import {
    setMode,
    setElement,
    solveStarted,
    goToLevel,
    drillToShell,
    drillToSubshell,
    drillToOrbital,
    clearSubshell,
    setHoverRadius as setAtomHoverRadius,
} from './store/atomSlice';
import { subshellLabel } from './atom/configurations';
import { useAtomSolver } from './atom/useAtomSolver';
import Controls from './components/Controls';
import { appTheme } from './theme';
import OrbitalViewer from './components/OrbitalViewer';
import RadialPlot, { RadialCurve } from './components/RadialPlot';
import LevelNav, { NavigationTarget } from './components/LevelNav';
import PhoneSheet from './components/PhoneSheet';
import SubshellPanel from './components/SubshellPanel';
import PeriodicTable from './components/PeriodicTable';
import ElementPickerDialog from './components/ElementPickerDialog';
import { elementFor } from './elements';
import { orbitalName } from './orbital_names';
import { CombinationSelection, NO_COMBINATION, fieldRequestFor, combinationCurves, overlayLegend, samePicture } from './combinations';
import { DEFAULT_ENCLOSED_FRACTION, computeSamplingRadius, basicOrbitalParams, BASIC_ORBITALS_Z, ORBITAL_RESOLUTION, SHELL_VIEW_CUT_AXIS } from './orbital_presets';
import { OrbitalParams, SurfaceStyle } from './types/orbital';
import { useDelayedFlag } from './useDelayedFlag';
import { useMediaQuery, NARROW_VIEWPORT, MEDIUM_VIEWPORT } from './useMediaQuery';
import { CURVE_COLORS } from './curve_colors';

/**
 * The radial plot's drawing width on a desktop: the right-hand panel's 300 px,
 * less the plot card's own padding and border, so the two cards line up.
 */
const PLOT_WIDTH = 278;
/** The plot's width in the phone sheet, which is at most 400 px across. */
const PHONE_PLOT_WIDTH = 300;

/** How long a render has to take before the viewer is told it is working. */
const BUSY_INDICATOR_DELAY_MS = 400;

const defaultN = 3;
const defaultL = 2;

/** r_j = rMin * e^(j*dx), j = 0..size-1 -- the shared log grid every atom-profile curve is sampled on (see atomWorker.ts). */
function gridRadii(rMin: number, dx: number, size: number): number[] {
    return Array.from({ length: size }, (_, j) => rMin * Math.exp(j * dx));
}

// The theme lives in theme.ts so its contrast is testable.

function App() {
    const dispatch = useAppDispatch();
    const { isLoading, error, surfaceStyle, isoLevel } = useAppSelector(state => state.orbital);
    // The plot describes what is on screen, so it follows the rendered orbital
    // rather than the pending selection in the panel.
    const renderedParams = useAppSelector(state => state.orbital.currentParams);

    const atomMode = useAppSelector(state => state.atom.mode);
    const atomZ = useAppSelector(state => state.atom.Z);
    const atomLevel = useAppSelector(state => state.atom.level);
    const atomSelectedShell = useAppSelector(state => state.atom.selectedShell);
    const atomSelectedSubshell = useAppSelector(state => state.atom.selectedSubshell);
    const atomSelectedOrbital = useAppSelector(state => state.atom.selectedOrbital);
    const atomProfile = useAppSelector(state => state.atom.profile);
    const atomIsSolving = useAppSelector(state => state.atom.isSolving);
    const atomError = useAppSelector(state => state.atom.error);
    const atomHoverRadius = useAppSelector(state => state.atom.hoverRadius);
    const isAtomMode = atomMode === 'atom';

    // Keep individual control values as local state
    const [n, setN] = useState<number>(defaultN);
    const [l, setL] = useState<number>(defaultL);
    const [ml, setMl] = useState<number>(0);
    const [enclosedFraction, setEnclosedFraction] = useState<number>(DEFAULT_ENCLOSED_FRACTION);

    // Basic Orbitals' combination (hybrids, a field). Local like n/l/mₗ, but
    // reactive: each choice is complete, so it renders without an Update step.
    const [combination, setCombination] = useState<CombinationSelection>(NO_COMBINATION);
    const renderedField = useAppSelector(state => state.orbital.currentField);
    const renderFailed = useAppSelector(state => state.orbital.renderFailed);

    const isInitializedRef = useRef(false);

    // Ruling R28: the only thing that starts a solve is a Z change (or an
    // enclosedFraction change, which re-slices an already-memoised solution
    // cheaply). Every navigation dispatch below reads the profile this
    // produces; none of them can retrigger it.
    useAtomSolver(enclosedFraction);

    const handleOrbitalParamsChange = useCallback((newParams: OrbitalParams) => {
        console.log('App.tsx: Orbital params changing:', newParams);
        dispatch(startOrbitalCalculation(newParams));
    }, [dispatch]);

    const handleOrbitalRendered = useCallback((isoLevel: number) => {
        console.log('App.tsx: Orbital rendered callback');
        dispatch(finishOrbitalCalculation({ isoLevel }));
    }, [dispatch]);

    const handleOrbitalFailed = useCallback((message: string) => {
        console.warn('App.tsx: Orbital render failed:', message);
        dispatch(failOrbitalCalculation(message));
    }, [dispatch]);

    const handleResetView = useCallback(() => {
        dispatch(resetView());
    }, [dispatch]);

    const handleSurfaceStyleChange = useCallback((change: Partial<SurfaceStyle>) => {
        dispatch(setSurfaceStyle(change));
    }, [dispatch]);

    const handleModeChange = useCallback((newMode: 'atom' | 'hydrogenic') => {
        dispatch(setMode(newMode));
    }, [dispatch]);

    // Picking an element gives you that element's best default view, derived
    // from its own solved profile rather than hand-tuned per element: the
    // camera back at the canonical angle and framed on this atom's own
    // displayRadius, and the cut-away on, centred, which is what makes the
    // shell rings visible at all (levels 1-2 draw nothing but their cut
    // face). Everything else the user has set -- opacity, enclosed fraction
    // -- is theirs and is left alone.
    const handleAtomElementChange = useCallback((newZ: number) => {
        // setElement and solveStarted are dispatched together so React
        // batches them into one render -- setElement alone clears `profile`
        // without setting `isSolving`, which otherwise leaves a one-frame
        // "idle, no profile" gap before useAtomSolver's own effect gets to
        // run (see its doc comment).
        dispatch(setElement(newZ));
        dispatch(solveStarted());
        dispatch(setSurfaceStyle({ clipAxis: SHELL_VIEW_CUT_AXIS, clipPosition: 0 }));
        dispatch(resetView());
    }, [dispatch]);

    const handleLevelNavigate = useCallback((target: NavigationTarget) => {
        switch (target.level) {
            case 'atom': dispatch(goToLevel('atom')); break;
            case 'shell': dispatch(drillToShell(target.n)); break;
            case 'subshell': dispatch(drillToSubshell(target.n, target.l)); break;
            case 'orbital': dispatch(drillToOrbital(target.n, target.l, target.ml)); break;
        }
    }, [dispatch]);

    // Addendum 2's readability follow-up: a subshell chip is a toggle.
    // Selecting one isolates its orbitals in the composition view (iron's
    // five 3d cloverleaves are unreadable as an overlapping blob);
    // clicking the selected one again clears the isolation and returns to
    // the overlapping view, which stays the default because the overlap is
    // the teaching point (spec §2). This is also the subshell-level half of
    // the "is there a way to unselect one?" affordance.
    const handleSelectSubshell = useCallback((selN: number, selL: number) => {
        if (atomSelectedSubshell && atomSelectedSubshell.n === selN && atomSelectedSubshell.l === selL) {
            dispatch(clearSubshell());
            return;
        }
        dispatch(drillToSubshell(selN, selL));
    }, [dispatch, atomSelectedSubshell]);

    const handleSelectOrbital = useCallback((selN: number, selL: number, selMl: number) => {
        dispatch(drillToOrbital(selN, selL, selMl));
    }, [dispatch]);

    const handleAtomHoverRadius = useCallback((r: number | null) => {
        dispatch(setAtomHoverRadius(r));
    }, [dispatch]);

    // On a phone the panel would cover most of the screen, so it starts out of
    // the way and is opened deliberately. On a desktop it is just always there.
    const isNarrow = useMediaQuery(NARROW_VIEWPORT);
    // The phone sheet's open tab, or null with the atom given the screen.
    const [phoneTab, setPhoneTab] = useState<string | null>(null);
    // Between a phone and a wide desktop the right-hand panel starts folded
    // to a bar, so the atom keeps the width; it opens over the view on a tap.
    const isMedium = useMediaQuery(MEDIUM_VIEWPORT) && !isNarrow;
    // Folded by default at medium width, open otherwise; a tap overrides it
    // until the window crosses the breakpoint again. Derived rather than
    // synced in an effect, so the first render is already right.
    const [viewPanelChoice, setViewPanelChoice] = useState<{ medium: boolean; open: boolean } | null>(null);
    const viewPanelOpen = viewPanelChoice && viewPanelChoice.medium === isMedium ? viewPanelChoice.open : !isMedium;
    const setViewPanelOpen = (update: (open: boolean) => boolean) =>
        setViewPanelChoice({ medium: isMedium, open: update(viewPanelOpen) });
    // Desktop element choice: the periodic table, as a pop-over opened from
    // the element name. Open on arrival, so the first thing a visitor sees is
    // what to pick; it closes once they do.
    const [tableOpen, setTableOpen] = useState(true);
    const closeTable = useCallback(() => setTableOpen(false), []);

    // Only say anything if the calculation is actually taking a while; see
    // useDelayedFlag for why.
    const showBusy = useDelayedFlag(isLoading, BUSY_INDICATOR_DELAY_MS);
    const showAtomBusy = useDelayedFlag(atomIsSolving, BUSY_INDICATOR_DELAY_MS);

    // Initial render - only run once. Only seeds hydrogen-like mode's own
    // default orbital when that is the mode actually on screen (spec
    // bugfix): this used to fire unconditionally, which on a cold load into
    // atom mode (the app's default) raced atom mode's own SCF solve and
    // shell view -- both land in the same scene via orbital_visualizer.ts,
    // and whichever finished second silently overwrote the other's mesh.
    // Atom mode seeds its own initial view through useAtomSolver above; if
    // the app ever starts in hydrogen-like mode instead, that case is
    // covered here.
    useEffect(() => {
        if (!isInitializedRef.current) {
            isInitializedRef.current = true;
            if (isAtomMode) return;
            console.log("App.tsx: Triggering initial orbital render.");
            const initialParams = {
                n: defaultN,
                l: defaultL,
                ml: 0,
                Z: BASIC_ORBITALS_Z,
                resolution: ORBITAL_RESOLUTION,
                rMax: computeSamplingRadius(defaultN, defaultL, BASIC_ORBITALS_Z),
                enclosedFraction: DEFAULT_ENCLOSED_FRACTION,
            };
            handleOrbitalParamsChange(initialParams);
        }
        // Only the initial mount should ever run this -- isInitializedRef
        // guards that -- so isAtomMode is deliberately read without being a
        // dependency, exactly like the mode-switch effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleOrbitalParamsChange]);

    // Levels 1-2's shell view only draws anything on its cut face (see
    // shell_view.ts / updateAtomViewInScene) -- with the shared surface
    // style's out-of-the-box default of no cut, the very first thing atom
    // mode (the app's default mode) shows would be nothing at all. A cut is
    // one of the controls that already works at every level, so this just
    // picks a sensible starting point for it rather than special-casing atom
    // mode's rendering. Runs once, and only nudges the *default* -- a user
    // who deliberately turns the cut back off keeps their choice.
    useEffect(() => {
        if (isAtomMode && surfaceStyle.clipAxis === 'none') {
            dispatch(setSurfaceStyle({ clipAxis: SHELL_VIEW_CUT_AXIS }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switching *out* of atom mode must show hydrogen-like mode's own
    // current controls, never whatever atom mode's level 3 last dispatched
    // into the shared orbital slice (spec bugfix). Both modes' marching-cubes
    // renders read the same `orbital.currentParams`, and Controls.tsx's
    // "Update Orbital" button is deliberately not auto-fired on every
    // n/l/ml/Z edit -- but a mode switch has no such button to remind the
    // user of, so without this, switching to hydrogen-like mode kept
    // whatever tiny rMax an atom-mode orbital (e.g. argon's 2p, ~1.7 a0) had
    // last set, instead of resetting to computeSamplingRadius(n, l, Z) for
    // the panel's own current selection -- at that scale a hydrogen 3d's
    // sampling box holds only its innermost, near-featureless tail, which is
    // exactly why it rendered as a blob instead of a lobed shape.
    useEffect(() => {
        if (isAtomMode || combination.kind !== 'none') return;
        dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
        // Only the mode transition itself should trigger this -- n/l/ml/Z/
        // enclosedFraction changes while already in Basic Orbitals
        // mode still go through Controls.tsx's "Update Orbital" button,
        // exactly as before. combination is read, not watched, like the
        // rest; the effect below redraws a combination on the same mode
        // change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAtomMode]);

    // A combination draws as soon as it is chosen, and again when the
    // enclosed fraction changes. Going back to None redraws the n/l/mₗ still in
    // the panel: the canvas was showing the combination, not that orbital.
    // A selection that cannot be drawn clears the canvas rather than leave the
    // last picture under its title (spec §3.5); the picker says why. A request
    // for the picture already drawn or in flight -- a new F at n = 2, where
    // only the energies change -- is not sent again, unless it failed.
    const previousCombinationRef = useRef(combination);
    useEffect(() => {
        const previous = previousCombinationRef.current;
        previousCombinationRef.current = combination;
        if (isAtomMode) return;
        if (combination.kind === 'none') {
            if (previous.kind !== 'none') dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
            return;
        }
        const request = fieldRequestFor(combination, enclosedFraction);
        if (!request) {
            dispatch(clearPicture());
            return;
        }
        if (renderedField && !renderFailed && samePicture(renderedField, request)) return;
        dispatch(startFieldCalculation(request));
        // n/l/mₗ are read for the None case only; changing them while a
        // combination is drawn must not replace it. renderedField is read,
        // not watched: only a new selection asks for a picture.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAtomMode, combination, enclosedFraction, dispatch]);

    // The cut belongs to the shell views. Levels 1-2 draw nothing but their
    // cut face, so they need one; an orbital -- atom mode's level 3, or any
    // Basic Orbitals render -- is a closed surface, and the inherited
    // half-cut hid half of it: 4f_z³ arrived as a single lobe, with the Off
    // button at the bottom of a scrolled panel. Moving into an orbital view
    // clears the cut, and moving back to a shell view restores whatever it
    // had. A cut chosen while looking at an orbital is left alone.
    const isOrbitalView = !isAtomMode || atomLevel === 'orbital';
    const shellViewCutRef = useRef<Pick<SurfaceStyle, 'clipAxis' | 'clipPosition'> | null>(null);
    const wasOrbitalViewRef = useRef(isOrbitalView);
    useEffect(() => {
        const wasOrbitalView = wasOrbitalViewRef.current;
        wasOrbitalViewRef.current = isOrbitalView;
        if (isOrbitalView && !wasOrbitalView) {
            shellViewCutRef.current = { clipAxis: surfaceStyle.clipAxis, clipPosition: surfaceStyle.clipPosition };
            // Centred too, so picking an axis here starts at the nucleus
            // rather than at whatever depth the shell view was left at.
            dispatch(setSurfaceStyle({ clipAxis: 'none', clipPosition: 0 }));
        } else if (!isOrbitalView && wasOrbitalView) {
            const saved = shellViewCutRef.current;
            dispatch(setSurfaceStyle(saved && saved.clipAxis !== 'none'
                ? saved
                : { clipAxis: SHELL_VIEW_CUT_AXIS, clipPosition: 0 }));
        }
        // surfaceStyle is read, not watched: only the change of view matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrbitalView, dispatch]);

    // Level 3 in atom mode: render the selected orbital through the same
    // marching-cubes pipeline as hydrogen-like mode, but with the SCF's own
    // numerical R(r) (OrbitalParams.radialSamples) in place of the analytic
    // hydrogenic form -- this is exactly what SerialisedSubshell.R exists
    // for (see atomWorker.ts). Reactive rather than button-triggered: the
    // n/l/ml selects collapsed into the drill-down, so there is no separate
    // "Update Orbital" step in atom mode (see Controls.tsx).
    useEffect(() => {
        if (!isAtomMode || atomLevel !== 'orbital' || !atomSelectedOrbital || !atomProfile) return;

        const { n: selN, l: selL, ml: selMl } = atomSelectedOrbital;
        const subshell = atomProfile.subshells.find(s => s.n === selN && s.l === selL);
        // Occupancy was already validated by drillToOrbital; this should
        // always be found, but there is nothing sane to render if it is not.
        if (!subshell) return;

        // This subshell's own sampling-box extent (spec bugfix): the whole
        // atom's shared grid rMax is sized to hold the *outermost* occupied
        // subshell's tail, which for a tightly bound inner one -- argon's
        // 2p, say, at 35x smaller than the grid -- left the orbital spanning
        // a couple of voxels out of a much wider box, too few for marching
        // cubes to resolve anything. `samplingRadius` is computed per
        // subshell for exactly this reason (see atomWorker.ts /
        // subshellSamplingRadius). Still not computeSamplingRadius(n, l, Z):
        // that assumes Z_eff = Z, wrong in the opposite direction for a
        // screened valence electron.
        const rMax = subshell.samplingRadius;

        dispatch(startOrbitalCalculation({
            n: selN, l: selL, ml: selMl,
            Z: atomProfile.Z,
            resolution: ORBITAL_RESOLUTION,
            rMax,
            enclosedFraction,
            radialSamples: { R: subshell.R, rMin: atomProfile.rMin, dx: atomProfile.dx, size: atomProfile.size },
        }));
    }, [isAtomMode, atomLevel, atomSelectedOrbital, atomProfile, enclosedFraction, dispatch]);

    const atomRGrid = useMemo(
        () => atomProfile ? gridRadii(atomProfile.rMin, atomProfile.dx, atomProfile.size) : [],
        [atomProfile]
    );
    // The radial plot's horizontal range: sized to what is actually being
    // shown, not the sampling grid's rMax (spec bugfix). The grid extent is
    // chosen to comfortably hold the outermost orbital's tail -- for argon
    // that is 44 a0 against shell peaks at 0.06/0.29/1.22, so a linear axis
    // against the grid crushes every peak into the first few percent of the
    // plot. 1.2x the contour radius keeps every peak visible with some tail
    // included. Tracks the drill-down level, same as `atomCurves` below, so
    // drilling into a shell zooms the plot in exactly as it zooms the 3D
    // view in (see updateAtomViewInScene's camera-framing fix).
    const atomPlotRange = useMemo(() => {
        if (!atomProfile) return 1;
        const radius = atomLevel === 'atom'
            // displayRadius, matching the sphere actually drawn (see
            // AtomProfile.displayRadius): the plot and the 3D view show the
            // same object, so an axis that stopped short of the valence
            // shell while the sphere reached past it would put a ring on
            // screen with no curve under it.
            ? atomProfile.displayRadius
            : (atomProfile.shells.find(s => s.n === atomSelectedShell)?.contourRadius ?? atomProfile.contourRadius);
        // Exactly the drawn radius, with no headroom (bug fix, reported from
        // the running app): the plot's curve used to run 20% past the edge
        // of the sphere beside it, which reads as the sphere being larger
        // and darker than it is -- "the line continues beyond the dark blue
        // shell". The two views show the same object over the same range now.
        return radius;
    }, [atomProfile, atomLevel, atomSelectedShell]);

    // The plot answers "what am I looking at", so it narrows as the drill-down
    // does: every shell at the atom level, then the chosen shell's subshells
    // side by side so 2s and 2p can be compared, then just the chosen subshell.
    // Choosing an individual ml narrows it no further, because the radial
    // distribution does not depend on ml.
    const atomCurves: RadialCurve[] = useMemo(() => {
        if (!atomProfile) return [];
        if (atomLevel === 'atom') {
            // The outermost shell is named as such here too (Addendum 2's
            // core/valence distinction), so the plot and the lit ring in the
            // 3D view are saying the same thing. `shells` is ascending n from
            // the configuration, so the last entry is the valence shell.
            const valenceIndex = atomProfile.shells.length - 1;
            return atomProfile.shells.map((shell, i) => ({
                label: i === valenceIndex ? `n=${shell.n} valence` : `n=${shell.n}`,
                color: CURVE_COLORS[i % CURVE_COLORS.length],
                points: atomRGrid.map((r, j) => ({ r, value: shell.curve[j] })),
            }));
        }
        // Colour by the subshell's position within its *shell*, computed
        // before any filtering (bug fix, found live): isolating 3d used to
        // recolour its curve to index 0's blue while the 3D lobes stayed
        // gold, because the index came from the filtered array. The colour
        // is an identity -- 3d is the shell's third subshell whether or not
        // the other two are on screen -- so it must not depend on what else
        // is being shown. shell_composition.ts's colorIndex is this same
        // position, which is what keeps a lobe and its curve in agreement.
        const shellSubshells = atomProfile.subshells.filter(s => s.n === atomSelectedShell);
        const subshells = atomSelectedSubshell
            ? shellSubshells.filter(s => s.l === atomSelectedSubshell.l)
            : shellSubshells;
        return subshells.map(subshell => ({
            label: subshellLabel(subshell.n, subshell.l),
            color: CURVE_COLORS[shellSubshells.indexOf(subshell) % CURVE_COLORS.length],
            points: atomRGrid.map((r, j) => ({ r, value: subshell.curve[j] })),
        }));
    }, [atomProfile, atomLevel, atomSelectedShell, atomSelectedSubshell, atomRGrid]);

    // Phone: the element is chosen from a full-screen list opened from the
    // element name, since the periodic table does not fit.
    const [elementPickerOpen, setElementPickerOpen] = useState(false);

    // What the canvas is waiting for, if anything. The panels switch to the
    // new element or orbital at once while the old picture stays up until
    // the new one is ready, and the only sign of that used to be a 4 px bar
    // at the bottom of the controls -- often scrolled out of view. The
    // canvas now dims and says what it is working on.
    const atomOrbitalBusy = isAtomMode && atomLevel === 'orbital' && showBusy;
    const canvasBusyLabel = isAtomMode
        ? (showAtomBusy
            ? `Solving ${elementFor(atomZ)?.name ?? `Z = ${atomZ}`}…`
            : atomOrbitalBusy && atomSelectedOrbital
                ? `Computing ${orbitalName(atomSelectedOrbital.n, atomSelectedOrbital.l, atomSelectedOrbital.ml)}…`
                : null)
        : (showBusy
            ? (renderedField
                ? `Computing ${renderedField.label}…`
                : renderedParams ? `Computing ${orbitalName(renderedParams.n, renderedParams.l, renderedParams.ml)}…` : null)
            : null);

    // A marching-cubes surface is coloured by the sign of ψ, unlike the shell
    // views, which colour by shell or subshell. Say so where it applies.
    // Both build the combination's sources (and the plot samples three radial
    // curves), so they follow the selection rather than every render.
    const selectionLegend = useMemo(() => overlayLegend(combination), [combination]);
    const selectionPlot = useMemo(() => combinationCurves(combination), [combination]);
    const combinationLegend = !isAtomMode && renderedField ? selectionLegend : null;
    // Not over an empty canvas: a refused combination draws nothing.
    const showPhaseLegend = (isAtomMode ? atomLevel === 'orbital' : Boolean(renderedParams || renderedField)) && !combinationLegend;

    // The drill-down's next step. On a desktop it lives in the navigation
    // card it continues, where the orbital buttons are in view; on a phone
    // it stays in the controls strip, which is laid out for it.
    const subshellPanel = (atomLevel === 'shell' || atomLevel === 'orbital') && atomProfile && atomSelectedShell !== null
        ? (
            <SubshellPanel
                subshells={atomProfile.subshells}
                shellN={atomSelectedShell}
                selectedSubshell={atomSelectedSubshell}
                selectedOrbital={atomSelectedOrbital}
                onSelectSubshell={handleSelectSubshell}
                onSelectOrbital={handleSelectOrbital}
            />
        )
        : null;

    const levelNavProps = {
        Z: atomZ,
        selectedShell: atomSelectedShell,
        selectedSubshell: atomSelectedSubshell,
        selectedOrbital: atomSelectedOrbital,
        onNavigate: handleLevelNavigate,
        onChangeElement: isNarrow ? () => setElementPickerOpen(true) : () => setTableOpen(true),
    };

    const controls = (
        <Controls
            mode={atomMode}
            onModeChange={handleModeChange}
            atomLevel={atomLevel}
            atomZ={atomZ}
            onAtomElementChange={handleAtomElementChange}
            showElementPicker={false}
            initialN={n}
            onNChange={setN}
            initialL={l}
            onLChange={setL}
            initialMl={ml}
            onMlChange={setMl}
            initialEnclosedFraction={enclosedFraction}
            onEnclosedFractionChange={setEnclosedFraction}
            combination={combination}
            onCombinationChange={setCombination}
            isoLevel={isoLevel}
            onUpdateOrbital={handleOrbitalParamsChange}
            onResetView={handleResetView}
            surfaceStyle={surfaceStyle}
            onSurfaceStyleChange={handleSurfaceStyleChange}
            isBusy={isAtomMode ? showAtomBusy : showBusy}
        />
    );

    const renderRadialPlot = (width: number, collapsible: boolean) => {
        if (!isAtomMode) {
            // A combination's plot is its ingredients and the result (see
            // combinationCurves): the weighted sum is its exact radial distribution.
            const combinationPlot = renderedField ? selectionPlot : null;
            if (combinationPlot) {
                return (
                    <RadialPlot
                        n={2}
                        l={0}
                        Z={BASIC_ORBITALS_Z}
                        rMax={combinationPlot.rMax}
                        width={width}
                        collapsible={collapsible}
                        curves={combinationPlot.curves}
                    />
                );
            }
            return renderedParams && (
                <RadialPlot
                    n={renderedParams.n}
                    l={renderedParams.l}
                    Z={renderedParams.Z}
                    rMax={renderedParams.rMax}
                    width={width}
                    collapsible={collapsible}
                />
            );
        }
        return atomProfile && (
            <RadialPlot
                // n/l are unused in multi-curve mode (see RadialPlot); Z is
                // real, since the hover readout's shell label logic has no
                // other use for it here.
                n={1}
                l={0}
                Z={atomProfile.Z}
                rMax={atomPlotRange}
                scale={atomLevel === 'atom' ? 'sqrt' : 'linear'}
                width={width}
                collapsible={collapsible}
                curves={atomCurves}
                peaks={Array.from(atomProfile.shellPeaks)}
                cutFaceNote={atomLevel !== 'orbital'}
                hoverRadius={atomHoverRadius}
                onHoverRadius={handleAtomHoverRadius}
            />
        );
    };

    // The phone sheet's tabs, one job each. Basic Orbitals has no drill-down,
    // so its orbital choice and view settings share one tab.
    const phoneTabs = isAtomMode
        ? [
            {
                key: 'explore',
                label: 'Explore',
                content: <LevelNav {...levelNavProps} variant="body">{subshellPanel}</LevelNav>,
            },
            { key: 'view', label: 'View', content: controls },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ]
        : [
            { key: 'view', label: 'Orbital & view', content: controls },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ];

    return (
        <ThemeProvider theme={appTheme}>
            <CssBaseline />
            <Box
                id="canvas-container"
                className={canvasBusyLabel ? 'busy' : undefined}
                data-busy={isLoading ? 'true' : 'false'}
                sx={{
                    width: '100%',
                    height: '100vh',
                    position: 'relative',
                    backgroundColor: '#111'
                }}
            >
                <OrbitalViewer
                    onOrbitalRendered={handleOrbitalRendered}
                    onOrbitalFailed={handleOrbitalFailed}
                    enclosedFraction={enclosedFraction}
                />
                {canvasBusyLabel && (
                    <div className="canvas-busy" role="status" aria-live="polite">
                        <CircularProgress size={22} thickness={5} color="inherit" />
                        <span>{canvasBusyLabel}</span>
                    </div>
                )}
                {showPhaseLegend && (
                    <div className="phase-legend" aria-label="surface colour key">
                        <span className="phase-legend-item">
                            <span className="phase-legend-swatch positive" />ψ &gt; 0
                        </span>
                        <span className="phase-legend-item">
                            <span className="phase-legend-swatch negative" />ψ &lt; 0
                        </span>
                    </div>
                )}
                {combinationLegend && (
                    <div className="phase-legend" aria-label="combination colour key">
                        {combinationLegend.map(item => (
                            <span key={item.label} className="phase-legend-item">
                                <span className="phase-legend-swatch" style={{ background: item.color }} />{item.label}
                            </span>
                        ))}
                        <span className="phase-legend-item">darker: ψ &lt; 0</span>
                    </div>
                )}
                {/* Addendum 3: the element selector is a real periodic
                    table on anything wider than a phone, as a pop-over over
                    the view. A table does not survive a phone width, so
                    below that a searchable list stands in for it -- the two
                    are alternatives, never both at once. */}
                {isAtomMode && !isNarrow && tableOpen && (
                    <PeriodicTable Z={atomZ} onSelect={handleAtomElementChange} onClose={closeTable} />
                )}
                {/* Desktop: navigation down the left (.side-panel), view
                    settings and the plot down the right (.view-panel). A
                    phone gets a one-line header and a tabbed bottom sheet
                    instead (PhoneSheet): the two columns do not fit, and the
                    single sideways-scrolling strip that stood in for them
                    split navigation across two places and hid most of
                    itself off screen. */}
                {isNarrow ? (
                    <>
                        {isAtomMode && (
                            <div className="phone-header">
                                <LevelNav {...levelNavProps} variant="header" />
                            </div>
                        )}
                        <PhoneSheet tabs={phoneTabs} active={phoneTab} onChange={setPhoneTab} />
                    </>
                ) : (
                    <>
                        <Box className="side-panel">
                            {isAtomMode && (
                                <LevelNav {...levelNavProps}>
                                    {subshellPanel}
                                </LevelNav>
                            )}
                        </Box>
                        <Box className={`view-panel${viewPanelOpen ? '' : ' folded'}`}>
                            {isMedium && (
                                <button
                                    type="button"
                                    className="view-panel-toggle"
                                    aria-expanded={viewPanelOpen}
                                    onClick={() => setViewPanelOpen(open => !open)}
                                >
                                    View settings {viewPanelOpen ? '▾' : '▸'}
                                </button>
                            )}
                            {viewPanelOpen && controls}
                            {renderRadialPlot(PLOT_WIDTH, isMedium)}
                        </Box>
                    </>
                )}
                {isAtomMode && isNarrow && (
                    <ElementPickerDialog
                        open={elementPickerOpen}
                        Z={atomZ}
                        onSelect={handleAtomElementChange}
                        onClose={() => setElementPickerOpen(false)}
                    />
                )}
                {/* Ruling R17: a solver that did not converge must show up as
                    an explicit error, never as a silently-wrong picture. This
                    should never fire -- every element in range converges. */}
                {isAtomMode && atomError && (
                    <Alert severity="error" className="atom-error">
                        {atomError}
                    </Alert>
                )}
                <Snackbar
                    open={Boolean(error)}
                    onClose={() => dispatch(dismissOrbitalError())}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert
                        severity="warning"
                        variant="filled"
                        onClose={() => dispatch(dismissOrbitalError())}
                    >
                        {error}
                    </Alert>
                </Snackbar>
            </Box>
        </ThemeProvider>
    );
}

export default App;
