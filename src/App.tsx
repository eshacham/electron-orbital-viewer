import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    ThemeProvider,
    createTheme,
    CssBaseline,
    Box,
    Alert,
    Snackbar,
    IconButton
} from '@mui/material';
import { useAppDispatch, useAppSelector } from './store/hooks';
import {
    startOrbitalCalculation,
    finishOrbitalCalculation,
    failOrbitalCalculation,
    dismissOrbitalError,
    resetView,
    setSurfaceStyle
} from './store/orbitalSlice';
import {
    setMode,
    setElement,
    solveStarted,
    goToLevel,
    drillToShell,
    drillToSubshell,
    drillToOrbital,
    setHoverRadius as setAtomHoverRadius,
} from './store/atomSlice';
import { subshellLabel } from './atom/configurations';
import { useAtomSolver } from './atom/useAtomSolver';
import Controls from './components/Controls';
import OrbitalViewer from './components/OrbitalViewer';
import RadialPlot, { RadialCurve } from './components/RadialPlot';
import LevelNav, { NavigationTarget } from './components/LevelNav';
import SubshellPanel from './components/SubshellPanel';
import { DEFAULT_ENCLOSED_FRACTION, computeSamplingRadius } from './orbital_presets';
import { OrbitalParams, SurfaceStyle } from './types/orbital';
import { useDelayedFlag } from './useDelayedFlag';
import { useMediaQuery, NARROW_VIEWPORT } from './useMediaQuery';

/** How long a render has to take before the viewer is told it is working. */
const BUSY_INDICATOR_DELAY_MS = 400;

const defaultN = 3;
const defaultL = 2;

// One colour per curve in the atom-mode radial plot (shells at level 1,
// subshells at level 2). Cycles rather than growing without bound -- no
// element needs more than a handful of shells/subshells shown at once.
const CURVE_COLORS = ['#4da3ff', '#ff6b6b', '#ffd166', '#06d6a0', '#c77dff', '#f4a261', '#94d2bd', '#e76f51'];

/** r_j = rMin * e^(j*dx), j = 0..size-1 -- the shared log grid every atom-profile curve is sampled on (see atomWorker.ts). */
function gridRadii(rMin: number, dx: number, size: number): number[] {
    return Array.from({ length: size }, (_, j) => rMin * Math.exp(j * dx));
}

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

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
    const [Z, setZ] = useState<number>(1);
    const [resolution, setResolution] = useState<number>(64);
    const [enclosedFraction, setEnclosedFraction] = useState<number>(DEFAULT_ENCLOSED_FRACTION);

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

    const handleAtomElementChange = useCallback((newZ: number) => {
        // Both dispatched together so React batches them into one render --
        // setElement alone clears `profile` without setting `isSolving`,
        // which otherwise leaves a one-frame "idle, no profile" gap before
        // useAtomSolver's own effect gets to run (see its doc comment).
        dispatch(setElement(newZ));
        dispatch(solveStarted());
    }, [dispatch]);

    const handleLevelNavigate = useCallback((target: NavigationTarget) => {
        switch (target.level) {
            case 'atom': dispatch(goToLevel('atom')); break;
            case 'shell': dispatch(drillToShell(target.n)); break;
            case 'subshell': dispatch(drillToSubshell(target.n, target.l)); break;
            case 'orbital': dispatch(drillToOrbital(target.n, target.l, target.ml)); break;
        }
    }, [dispatch]);

    const handleSelectSubshell = useCallback((selN: number, selL: number) => {
        dispatch(drillToSubshell(selN, selL));
    }, [dispatch]);

    const handleSelectOrbital = useCallback((selN: number, selL: number, selMl: number) => {
        dispatch(drillToOrbital(selN, selL, selMl));
    }, [dispatch]);

    const handleAtomHoverRadius = useCallback((r: number | null) => {
        dispatch(setAtomHoverRadius(r));
    }, [dispatch]);

    // On a phone the panel would cover most of the screen, so it starts out of
    // the way and is opened deliberately. On a desktop it is just always there.
    const isNarrow = useMediaQuery(NARROW_VIEWPORT);
    const [panelOpen, setPanelOpen] = useState(true);
    useEffect(() => { setPanelOpen(!isNarrow); }, [isNarrow]);

    // Only say anything if the calculation is actually taking a while; see
    // useDelayedFlag for why.
    const showBusy = useDelayedFlag(isLoading, BUSY_INDICATOR_DELAY_MS);
    const showAtomBusy = useDelayedFlag(atomIsSolving, BUSY_INDICATOR_DELAY_MS);

    // Initial render - only run once
    useEffect(() => {
        if (!isInitializedRef.current) {
            isInitializedRef.current = true;
            console.log("App.tsx: Triggering initial orbital render.");
            const initialParams = {
                n: defaultN,
                l: defaultL,
                ml: 0,
                Z: 1,
                resolution: 32,
                rMax: computeSamplingRadius(defaultN, defaultL, 1),
                enclosedFraction: DEFAULT_ENCLOSED_FRACTION,
            };
            handleOrbitalParamsChange(initialParams);
        }
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
            dispatch(setSurfaceStyle({ clipAxis: 'z' }));
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
        if (isAtomMode) return;
        dispatch(startOrbitalCalculation({
            n, l, ml, Z,
            resolution,
            rMax: computeSamplingRadius(n, l, Z),
            enclosedFraction,
        }));
        // Only the mode transition itself should trigger this -- n/l/ml/Z/
        // resolution/enclosedFraction changes while already in hydrogen-like
        // mode still go through Controls.tsx's "Update Orbital" button,
        // exactly as before.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAtomMode]);

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
            resolution,
            rMax,
            enclosedFraction,
            radialSamples: { R: subshell.R, rMin: atomProfile.rMin, dx: atomProfile.dx, size: atomProfile.size },
        }));
    }, [isAtomMode, atomLevel, atomSelectedOrbital, atomProfile, resolution, enclosedFraction, dispatch]);

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
            ? atomProfile.contourRadius
            : (atomProfile.shells.find(s => s.n === atomSelectedShell)?.contourRadius ?? atomProfile.contourRadius);
        return radius * 1.2;
    }, [atomProfile, atomLevel, atomSelectedShell]);

    // The plot answers "what am I looking at", so it narrows as the drill-down
    // does: every shell at the atom level, then the chosen shell's subshells
    // side by side so 2s and 2p can be compared, then just the chosen subshell.
    // Choosing an individual ml narrows it no further, because the radial
    // distribution does not depend on ml.
    const atomCurves: RadialCurve[] = useMemo(() => {
        if (!atomProfile) return [];
        if (atomLevel === 'atom') {
            return atomProfile.shells.map((shell, i) => ({
                label: `n=${shell.n}`,
                color: CURVE_COLORS[i % CURVE_COLORS.length],
                points: atomRGrid.map((r, j) => ({ r, value: shell.curve[j] })),
            }));
        }
        const subshells = atomSelectedSubshell
            ? atomProfile.subshells.filter(s => s.n === atomSelectedSubshell.n && s.l === atomSelectedSubshell.l)
            : atomProfile.subshells.filter(s => s.n === atomSelectedShell);
        return subshells.map((subshell, i) => ({
            label: subshellLabel(subshell.n, subshell.l),
            color: CURVE_COLORS[i % CURVE_COLORS.length],
            points: atomRGrid.map((r, j) => ({ r, value: subshell.curve[j] })),
        }));
    }, [atomProfile, atomLevel, atomSelectedShell, atomSelectedSubshell, atomRGrid]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                id="canvas-container"
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
                />
                {isNarrow && (
                    <IconButton
                        id="panel-toggle"
                        className="panel-toggle"
                        aria-label={panelOpen ? 'hide controls' : 'show controls'}
                        onClick={() => setPanelOpen(open => !open)}
                    >
                        {panelOpen ? '✕' : '☰'}
                    </IconButton>
                )}
                {/* .side-panel stacks LevelNav above Controls on desktop; on a
                    phone it unwraps (display:contents in style.css) so
                    LevelNav gets its own fixed position, independent of the
                    controls sheet -- a phone user who drills in and closes
                    the sheet still has a way back out. */}
                <Box className="side-panel">
                    {isAtomMode && (
                        <LevelNav
                            Z={atomZ}
                            selectedShell={atomSelectedShell}
                            selectedSubshell={atomSelectedSubshell}
                            selectedOrbital={atomSelectedOrbital}
                            onNavigate={handleLevelNavigate}
                        />
                    )}
                    <Controls
                        mode={atomMode}
                        onModeChange={handleModeChange}
                        atomLevel={atomLevel}
                        atomZ={atomZ}
                        onAtomElementChange={handleAtomElementChange}
                        initialN={n}
                        onNChange={setN}
                        initialL={l}
                        onLChange={setL}
                        initialMl={ml}
                        onMlChange={setMl}
                        initialZ={Z}
                        onZChange={setZ}
                        initialResolution={resolution}
                        onResolutionChange={setResolution}
                        initialEnclosedFraction={enclosedFraction}
                        onEnclosedFractionChange={setEnclosedFraction}
                        isoLevel={isoLevel}
                        onUpdateOrbital={handleOrbitalParamsChange}
                        onResetView={handleResetView}
                        surfaceStyle={surfaceStyle}
                        onSurfaceStyleChange={handleSurfaceStyleChange}
                        isBusy={isAtomMode ? showAtomBusy : showBusy}
                        open={panelOpen}
                        compact={isNarrow}
                    >
                        {atomLevel === 'shell' && atomProfile && atomSelectedShell !== null && (
                            <SubshellPanel
                                subshells={atomProfile.subshells}
                                shellN={atomSelectedShell}
                                selectedSubshell={atomSelectedSubshell}
                                onSelectSubshell={handleSelectSubshell}
                                onSelectOrbital={handleSelectOrbital}
                            />
                        )}
                    </Controls>
                </Box>
                {!isAtomMode && renderedParams && (
                    <RadialPlot
                        n={renderedParams.n}
                        l={renderedParams.l}
                        Z={renderedParams.Z}
                        rMax={renderedParams.rMax}
                        compact={isNarrow}
                    />
                )}
                {isAtomMode && atomProfile && (
                    <RadialPlot
                        // n/l are unused in multi-curve mode (see RadialPlot);
                        // Z is real, since the hover readout's shell label
                        // logic has no other use for it here.
                        n={1}
                        l={0}
                        Z={atomProfile.Z}
                        rMax={atomPlotRange}
                        scale={atomLevel === 'atom' ? 'sqrt' : 'linear'}
                        compact={isNarrow}
                        curves={atomCurves}
                        peaks={Array.from(atomProfile.shellPeaks)}
                        hoverRadius={atomHoverRadius}
                        onHoverRadius={handleAtomHoverRadius}
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
