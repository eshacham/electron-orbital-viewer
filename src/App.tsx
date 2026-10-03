import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import {
    ThemeProvider,
    CssBaseline,
    Box,
    Alert,
    Snackbar,
    CircularProgress
} from '@mui/material';
import { useAppDispatch, useAppSelector, useAppStore } from './store/hooks';
import {
    startOrbitalCalculation,
    startFieldCalculation,
    finishOrbitalCalculation,
    failOrbitalCalculation,
    dismissOrbitalError,
    resetView,
    setSurfaceStyle,
    clearPicture,
    setBasicSelection,
    setEnclosedFraction,
    setCombination,
    clearPendingCut,
    cameraMoved
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
    setCharge,
    setExcitation,
    speciesOf,
} from './store/atomSlice';
import { subshellLabel } from './atom/configurations';
import { useAtomSolver } from './atom/useAtomSolver';
import { useDeltaScfEnergies } from './atom/useDeltaScfEnergies';
import { Excitation, speciesConfiguration, speciesSymbol, speciesTitle, isValidExcitation, isNeutralGround } from './atom/species';
import { allowedCharges } from './atom/ion_configurations';
import SpeciesControls from './components/SpeciesControls';
import Controls from './components/Controls';
import ShareExportBar, { ShareOutcome } from './components/ShareExportBar';
import { shareUrlFor, copyText } from './share';
import { appTheme } from './theme';
import OrbitalViewer from './components/OrbitalViewer';
import RadialPlot, { RadialCurve } from './components/RadialPlot';
import LevelNav, { NavigationTarget } from './components/LevelNav';
import PhoneSheet from './components/PhoneSheet';
import SubshellPanel from './components/SubshellPanel';
import PeriodicTable from './components/PeriodicTable';
import ElementPickerDialog from './components/ElementPickerDialog';
import { orbitalName } from './orbital_names';
import { CombinationSelection, fieldRequestFor, combinationCurves, overlayLegend, samePicture } from './combinations';
import { basicOrbitalParams, BASIC_ORBITALS_Z, ORBITAL_RESOLUTION, SHELL_VIEW_CUT_AXIS } from './orbital_presets';
import { OrbitalParams, SurfaceStyle } from './types/orbital';
import { useDelayedFlag } from './useDelayedFlag';
import { useMediaQuery, NARROW_VIEWPORT, MEDIUM_VIEWPORT } from './useMediaQuery';
import { CURVE_COLORS } from './curve_colors';
import { useUrlStateSync } from './useUrlStateSync';
import { hasSharedView, encodeStateOf } from './url_state';
import { radialProfile, PLOT_SAMPLE_COUNT } from './radial_distribution';
import { exportAvailability, runExport, ExportKind, ExportOptions } from './export/run_export';
import { CsvCurve } from './export/csv';
import { downloadBlob } from './export/download';
import { ViewerExportHandle } from './export/handle';
import { CubeWorkerHandle } from './export/cube_request';
import { createExportWorker } from './workers/createExportWorker';

/**
 * The radial plot's drawing width on a desktop: the right-hand panel's 300 px,
 * less the plot card's own padding and border, so the two cards line up.
 */
const PLOT_WIDTH = 278;
/** The plot's width in the phone sheet, which is at most 400 px across. */
const PHONE_PLOT_WIDTH = 300;

/** How long a render has to take before the viewer is told it is working. */
const BUSY_INDICATOR_DELAY_MS = 400;

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
    const atomCharge = useAppSelector(state => state.atom.charge);
    const atomExcitation = useAppSelector(state => state.atom.excitation);
    const atomUnbound = useAppSelector(state => state.atom.unbound);
    const atomEnergies = useAppSelector(state => state.atom.energies);
    const species = useMemo(
        () => speciesOf({ Z: atomZ, charge: atomCharge, excitation: atomExcitation }),
        [atomZ, atomCharge, atomExcitation]
    );
    const isAtomMode = atomMode === 'atom';

    // Basic Orbitals' view state -- n/l/mₗ, the enclosed fraction, and Phase
    // 1's combination -- lives in the store, not in App: a shared link's URL
    // decoder can only dispatch, and cannot reach into a component's local
    // state to restore it.
    const { n, l, ml } = useAppSelector(state => state.orbital.basicSelection);
    const enclosedFraction = useAppSelector(state => state.orbital.enclosedFraction);
    const combination = useAppSelector(state => state.orbital.combination);
    const basicRenderNonce = useAppSelector(state => state.orbital.basicRenderNonce);
    // Stable, because Controls' n/l effects list these callbacks as dependencies.
    const setN = useCallback((value: number) => dispatch(setBasicSelection({ n: value })), [dispatch]);
    const setL = useCallback((value: number) => dispatch(setBasicSelection({ l: value })), [dispatch]);
    const setMl = useCallback((value: number) => dispatch(setBasicSelection({ ml: value })), [dispatch]);
    const handleEnclosedFractionChange = useCallback((value: number) => dispatch(setEnclosedFraction(value)), [dispatch]);
    const handleCombinationChange = useCallback((value: CombinationSelection) => dispatch(setCombination(value)), [dispatch]);
    const renderedField = useAppSelector(state => state.orbital.currentField);
    const renderFailed = useAppSelector(state => state.orbital.renderFailed);

    // Ruling R28: the only thing that starts a solve is a species change --
    // the element, its charge or its excitation (or an enclosedFraction
    // change, which re-slices an already-memoised solution cheaply). Every
    // navigation dispatch below reads the profile this produces; none of
    // them can retrigger it.
    useAtomSolver(enclosedFraction);
    // After the solver, so the picture's worker is always the first one
    // created. The energies wait for that picture anyway (ruling C15).
    useDeltaScfEnergies();

    // Desktop element choice: the periodic table, as a pop-over opened from
    // the element name. Open on arrival, so the first thing a visitor sees is
    // what to pick; it closes once they do. Declared here, ahead of
    // useUrlStateSync below, so a pasted link's hashchange can close it too
    // (fix round 1, M2) -- a pop-over left open would otherwise hide the
    // very link that was just followed.
    const [tableOpen, setTableOpen] = useState(() => !hasSharedView(window.location.hash));
    const closeTable = useCallback(() => setTableOpen(false), []);

    useUrlStateSync(window, undefined, closeTable);

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

    // Task 9: the 3D view's own PNG capture, reached through a ref rather
    // than lifted state -- OrbitalViewer owns the renderer, and re-rendering
    // App on every camera settle just to keep a handle in sync would be
    // pointless churn.
    const exportHandleRef = useRef<ViewerExportHandle | null>(null);

    // Share copies a link built from the state at the moment of the click
    // (store.getState(), not a selector) -- mid-solve, encodeStateOf reads
    // atom.pendingView rather than the transient whole-atom view still on
    // screen, so the link carries the view that was actually asked for
    // (Review Focus 3). The camera is read off the view itself first (final
    // review M4): the store hears of a move only once the camera has settled,
    // so a click straight after a drag would otherwise copy the old angle.
    const store = useAppStore();
    const stateNow = useCallback(() => {
        const angles = exportHandleRef.current?.cameraAngles();
        if (angles) store.dispatch(cameraMoved(angles));
        return store.getState();
    }, [store]);
    const handleShare = useCallback(async (): Promise<ShareOutcome> => {
        const url = shareUrlFor(encodeStateOf(stateNow()));
        return (await copyText(url)) ? { kind: 'copied' } : { kind: 'manual', url };
    }, [stateNow]);

    const handleSurfaceStyleChange = useCallback((change: Partial<SurfaceStyle>) => {
        dispatch(setSurfaceStyle(change));
        // A user-driven cut change while a link's cut is still waiting on the
        // solve (pendingCut) must win: without this, the link's stale cut
        // would land back on top of it once the profile arrives (progress.md,
        // "carry to Task 6").
        if ('clipAxis' in change || 'clipPosition' in change) dispatch(clearPendingCut());
    }, [dispatch]);

    const handleModeChange = useCallback((newMode: 'atom' | 'hydrogenic') => {
        dispatch(setMode(newMode));
        // A link's cut, still waiting on an atom-mode solve that has not
        // finished yet, must not land on the other mode's view once that
        // solve does finish (fix round 1, I1): the pendingCut re-apply
        // effect below does not know which mode it is re-applying into.
        dispatch(clearPendingCut());
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
        dispatch(clearPendingCut());
        dispatch(resetView());
    }, [dispatch]);

    // A charge or an excitation is the same element seen differently, so --
    // unlike picking an element -- the camera stays where it is: Na⁺ visibly
    // shrinking against an unchanged scale bar is the point (the framing
    // floor at the neutral's radius keeps the view from re-zooming onto it).
    // Otherwise the same pairing as handleAtomElementChange: solveStarted in
    // the same batch, so there is no idle, no-profile frame, and a link's
    // cut still waiting on the old species does not land on the new one.
    const handleChargeChange = useCallback((charge: number) => {
        if (!allowedCharges(atomZ).includes(charge)) return;
        dispatch(setCharge(charge));
        dispatch(solveStarted());
        dispatch(clearPendingCut());
    }, [dispatch, atomZ]);

    const handleExcitationChange = useCallback((excitation: Excitation | null) => {
        if (excitation && !isValidExcitation(atomZ, atomCharge, excitation)) return;
        dispatch(setExcitation(excitation));
        dispatch(solveStarted());
        dispatch(clearPendingCut());
    }, [dispatch, atomZ, atomCharge]);

    const handleLevelNavigate = useCallback((target: NavigationTarget) => {
        switch (target.level) {
            case 'atom': dispatch(goToLevel('atom')); break;
            case 'shell': dispatch(drillToShell(target.n)); break;
            case 'subshell': dispatch(drillToSubshell(target.n, target.l, target.j)); break;
            case 'orbital': dispatch(drillToOrbital(target.n, target.l, target.ml, target.j)); break;
        }
    }, [dispatch]);

    // Addendum 2's readability follow-up: a subshell chip is a toggle.
    // Selecting one isolates its orbitals in the composition view (iron's
    // five 3d cloverleaves are unreadable as an overlapping blob);
    // clicking the selected one again clears the isolation and returns to
    // the overlapping view, which stays the default because the overlap is
    // the teaching point (spec §2). This is also the subshell-level half of
    // the "is there a way to unselect one?" affordance. With spin–orbit a
    // chip is one j-level: only that j-level's own chip clears it, and its
    // sibling's switches to the sibling.
    const handleSelectSubshell = useCallback((selN: number, selL: number, selJ?: number) => {
        if (atomSelectedSubshell && atomSelectedSubshell.n === selN && atomSelectedSubshell.l === selL
            && atomSelectedSubshell.j === selJ) {
            dispatch(clearSubshell());
            return;
        }
        dispatch(drillToSubshell(selN, selL, selJ));
    }, [dispatch, atomSelectedSubshell]);

    const handleSelectOrbital = useCallback((selN: number, selL: number, selMl: number, selJ?: number) => {
        dispatch(drillToOrbital(selN, selL, selMl, selJ));
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

    // Only say anything if the calculation is actually taking a while; see
    // useDelayedFlag for why.
    const showBusy = useDelayedFlag(isLoading, BUSY_INDICATOR_DELAY_MS);
    const showAtomBusy = useDelayedFlag(atomIsSolving, BUSY_INDICATOR_DELAY_MS);

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

    // Basic Orbitals draws its plain orbital here and nowhere else: on the
    // switch into the mode (setMode bumps the nonce) and when a restored link
    // asks (requestBasicRender). One effect, run after every dispatch of the
    // batch has landed, so a link's selection and combination are both in
    // place before anything is drawn. A combination draws through Phase 1's
    // own effect below instead.
    useEffect(() => {
        if (basicRenderNonce === 0 || isAtomMode || combination.kind !== 'none') return;
        dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basicRenderNonce]);

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

    // A shared link's cut, re-applied once the linked view is on screen. It
    // has to come after the effect above: entering the linked orbital clears
    // the cut, and in the same commit this puts the link's back.
    const pendingCut = useAppSelector(state => state.orbital.pendingCut);
    const atomPendingView = useAppSelector(state => state.atom.pendingView);
    useEffect(() => {
        if (!pendingCut || atomPendingView) return;
        dispatch(setSurfaceStyle(pendingCut));
        dispatch(clearPendingCut());
    }, [pendingCut, atomPendingView, isOrbitalView, dispatch]);

    // Level 3 in atom mode: render the selected orbital through the same
    // marching-cubes pipeline as hydrogen-like mode, but with the SCF's own
    // numerical R(r) (OrbitalParams.radialSamples) in place of the analytic
    // hydrogenic form -- this is exactly what SerialisedSubshell.R exists
    // for (see atomWorker.ts). Reactive rather than button-triggered: the
    // n/l/ml selects collapsed into the drill-down, so there is no separate
    // "Update Orbital" step in atom mode (see Controls.tsx).
    useEffect(() => {
        if (!isAtomMode || atomLevel !== 'orbital' || !atomSelectedOrbital || !atomProfile) return;

        const { n: selN, l: selL, ml: selMl, j: selJ } = atomSelectedOrbital;
        // j too: with spin–orbit (n, l) is two j-levels, each with its own
        // R(r) and sampling box. drillToOrbital only accepts a j the
        // profile has, so this matches exactly one.
        const subshell = atomProfile.subshells.find(s => s.n === selN && s.l === selL && s.j === selJ);
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
            ? shellSubshells.filter(s => s.l === atomSelectedSubshell.l && s.j === atomSelectedSubshell.j)
            : shellSubshells;
        return subshells.map(subshell => ({
            label: subshellLabel(subshell.n, subshell.l, subshell.j),
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
            ? `Solving ${speciesTitle(species)}…`
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
                // Ruling C9: the drawn profile's mode, not the switch's.
                relativity={atomProfile.relativity ?? 'off'}
            />
        )
        : null;

    // One element for both layouts: LevelNav places it under the element
    // button on a desktop and at the top of the phone's Explore tab, and the
    // phone header's LevelNav leaves it out (layout contract, §3.8). The
    // energies go in unfiltered: SpeciesControls makes the species-key check
    // itself (ruling C5).
    const speciesControls = (
        <SpeciesControls
            species={species}
            onChargeChange={handleChargeChange}
            onExcitationChange={handleExcitationChange}
            energies={atomEnergies}
            radii={atomProfile ? { displayRadius: atomProfile.displayRadius, reference: atomProfile.reference ?? null } : null}
            unbound={atomUnbound}
            pictureFailed={atomError !== null}
        />
    );

    const levelNavProps = {
        Z: atomZ,
        configuration: speciesConfiguration(species),
        // Named only when it is not the plain element: a neutral atom's
        // button keeps exactly the name it always had ("currently Sodium").
        speciesSymbol: isNeutralGround(species) ? undefined : speciesSymbol(species),
        speciesTitle: speciesTitle(species),
        speciesControls,
        shellsUnavailable: atomUnbound !== null,
        selectedShell: atomSelectedShell,
        selectedSubshell: atomSelectedSubshell,
        selectedOrbital: atomSelectedOrbital,
        onNavigate: handleLevelNavigate,
        onChangeElement: isNarrow ? () => setElementPickerOpen(true) : () => setTableOpen(true),
    };

    const availability = useAppSelector(exportAvailability, shallowEqual);
    // What the plot shows, at the moment of export -- the same curves
    // already computed for the radial plot (atomCurves, selectionPlot), not
    // a fresh sample: ruling C6, an exported number equals the plotted one.
    const csvCurvesNow = useCallback((): CsvCurve[] => {
        if (isAtomMode) return atomCurves;
        if (renderedField) return selectionPlot?.curves ?? [];
        if (!renderedParams) return [];
        const { n: pn, l: pl, Z: pZ, rMax } = renderedParams;
        return [{ label: 'P(r)', points: radialProfile(pn, pl, pZ, rMax, PLOT_SAMPLE_COUNT).map(p => ({ r: p.r, value: p.probability })) }];
    }, [isAtomMode, atomCurves, renderedField, selectionPlot, renderedParams]);
    const handleExport = useCallback(async (kind: ExportKind, options: ExportOptions) => {
        // The file's "view:" link names the angle on screen, as Share's does.
        const state = stateNow();
        const result = await runExport(kind, {
            state, shareUrl: shareUrlFor(encodeStateOf(state)), csvCurves: csvCurvesNow(),
            handle: exportHandleRef.current, phaseLegend: showPhaseLegend, combinationLegend,
            // A DOM Worker's onmessage is typed with `this`; this states that
            // it satisfies CubeWorkerHandle's structural shape, which does not care.
            createCubeWorker: createExportWorker as unknown as () => CubeWorkerHandle,
            ...options,
        });
        downloadBlob(result.blob, result.filename);
    }, [stateNow, csvCurvesNow, showPhaseLegend, combinationLegend]);
    const stlSolids = useCallback(() => exportHandleRef.current?.surfaceCount() ?? 0, []);
    // Memoised: Controls is React.memo, and a fresh element every render would defeat it.
    const shareExportBar = useMemo(
        () => <ShareExportBar onShare={handleShare} onExport={handleExport} availability={availability} stlSolids={stlSolids} />,
        [handleShare, handleExport, availability, stlSolids]
    );

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
            onEnclosedFractionChange={handleEnclosedFractionChange}
            combination={combination}
            onCombinationChange={handleCombinationChange}
            isoLevel={isoLevel}
            onUpdateOrbital={handleOrbitalParamsChange}
            onResetView={handleResetView}
            surfaceStyle={surfaceStyle}
            onSurfaceStyleChange={handleSurfaceStyleChange}
            isBusy={isAtomMode ? showAtomBusy : showBusy}
            actions={shareExportBar}
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
                    exportHandleRef={exportHandleRef}
                />
                {canvasBusyLabel && (
                    <div className="canvas-busy" role="status" aria-live="polite">
                        <CircularProgress size={22} thickness={5} color="inherit" />
                        <span>{canvasBusyLabel}</span>
                    </div>
                )}
                {/* Spec §3.5: an anion LDA cannot bind draws nothing, and
                    the empty canvas says why. The card's alert
                    (SpeciesControls) is the one announced; while it is on
                    screen this note is for the eye only, so the reason is
                    never heard twice. A folded phone sheet has no card, so
                    there the note goes into a status region that is always
                    mounted in atom mode -- a live region inserted together
                    with its text is not reliably announced. */}
                {isAtomMode && isNarrow && (
                    <div className="canvas-unbound-live" role="status">
                        {atomUnbound && phoneTab !== 'explore' && <div className="canvas-unbound">{atomUnbound}</div>}
                    </div>
                )}
                {isAtomMode && atomUnbound && !(isNarrow && phoneTab !== 'explore') && (
                    <div className="canvas-unbound" aria-hidden="true">{atomUnbound}</div>
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
