import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import Controls from './components/Controls';
import OrbitalViewer from './components/OrbitalViewer';
import RadialPlot from './components/RadialPlot';
import { DEFAULT_ENCLOSED_FRACTION, computeSamplingRadius } from './orbital_presets';
import { OrbitalParams, SurfaceStyle } from './types/orbital';
import { useDelayedFlag } from './useDelayedFlag';
import { useMediaQuery, NARROW_VIEWPORT } from './useMediaQuery';

/** How long a render has to take before the viewer is told it is working. */
const BUSY_INDICATOR_DELAY_MS = 400;

const defaultN = 3;
const defaultL = 2;


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

    // Keep individual control values as local state
    const [n, setN] = useState<number>(defaultN);
    const [l, setL] = useState<number>(defaultL);
    const [ml, setMl] = useState<number>(0);
    const [Z, setZ] = useState<number>(1);
    const [resolution, setResolution] = useState<number>(64);
    const [enclosedFraction, setEnclosedFraction] = useState<number>(DEFAULT_ENCLOSED_FRACTION);

    const isInitializedRef = useRef(false);

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

    // On a phone the panel would cover most of the screen, so it starts out of
    // the way and is opened deliberately. On a desktop it is just always there.
    const isNarrow = useMediaQuery(NARROW_VIEWPORT);
    const [panelOpen, setPanelOpen] = useState(true);
    useEffect(() => { setPanelOpen(!isNarrow); }, [isNarrow]);

    // Only say anything if the calculation is actually taking a while; see
    // useDelayedFlag for why.
    const showBusy = useDelayedFlag(isLoading, BUSY_INDICATOR_DELAY_MS);

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
                <Controls
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
                    isBusy={showBusy}
                    open={panelOpen}
                    compact={isNarrow}
                />
                {renderedParams && (
                    <RadialPlot
                        n={renderedParams.n}
                        l={renderedParams.l}
                        Z={renderedParams.Z}
                        rMax={renderedParams.rMax}
                        compact={isNarrow}
                    />
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