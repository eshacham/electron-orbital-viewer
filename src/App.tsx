import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    ThemeProvider, 
    createTheme, 
    CssBaseline, 
    Box, 
    CircularProgress 
} from '@mui/material';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { startOrbitalCalculation, finishOrbitalCalculation } from './store/orbitalSlice';
import Controls from './components/Controls';
import OrbitalViewer from './components/OrbitalViewer';
import { getOptimizedParameters } from './orbital_visualizer';
import { OrbitalParams } from './types/orbital';

const defaultN = 3;
const defaultL = 2;
const defaultOptimized = getOptimizedParameters(defaultN, defaultL) || { rMax: 15, isoLevel: 0.005 };

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

function App() {
    const dispatch = useAppDispatch();
    const { isLoading } = useAppSelector(state => state.orbital);

    // Keep individual control values as local state
    const [n, setN] = useState<number>(defaultN);
    const [l, setL] = useState<number>(defaultL);
    const [ml, setMl] = useState<number>(0);
    const [Z, setZ] = useState<number>(1);
    const [resolution, setResolution] = useState<number>(64);
    const [rMax, setRMax] = useState<number>(defaultOptimized.rMax);
    const [isoLevel, setIsoLevel] = useState<number>(defaultOptimized.isoLevel);

    const isInitializedRef = useRef(false);

    const handleOrbitalParamsChange = useCallback((newParams: OrbitalParams) => {
        console.log('App.tsx: Orbital params changing:', newParams);
        dispatch(startOrbitalCalculation(newParams));
    }, [dispatch]);

    const handleOrbitalRendered = useCallback(() => {
        console.log('App.tsx: Orbital rendered callback');
        dispatch(finishOrbitalCalculation());
    }, [dispatch]);

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
                rMax: defaultOptimized.rMax,
                isoLevel: defaultOptimized.isoLevel,
            };
            handleOrbitalParamsChange(initialParams);
        }
    }, [handleOrbitalParamsChange]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box 
                id="canvas-container"
                sx={{ 
                    width: '100%', 
                    height: '100vh',
                    position: 'relative',
                    backgroundColor: '#111'
                }}
            >
                <OrbitalViewer
                    onOrbitalRendered={handleOrbitalRendered}
                />
                {isLoading && (
                    <div className="spinner-overlay">
                        <div className="spinner-container">
                            <CircularProgress />
                        </div>
                    </div>
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
                    initialRMax={rMax}
                    onRMaxChange={setRMax}
                    initialIsoLevel={isoLevel}
                    onIsoLevelChange={setIsoLevel}
                    onUpdateOrbital={handleOrbitalParamsChange}
                    getOptimizedParams={getOptimizedParameters}
                    isLoading={isLoading}
                />
            </Box>
        </ThemeProvider>
    );
}

export default App;