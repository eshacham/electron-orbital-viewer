import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    ThemeProvider, 
    createTheme, 
    CssBaseline, 
    Box, 
    CircularProgress 
} from '@mui/material';
import Controls from './components/Controls';
import OrbitalViewer, { OrbitalParams } from './components/OrbitalViewer';
import { getOptimizedParameters } from './orbital_visualizer';

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
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [currentOrbitalParams, setCurrentOrbitalParams] = useState<OrbitalParams | null>(null);

    // State for individual control values
    const [n, setN] = useState<number>(defaultN);
    const [l, setL] = useState<number>(defaultL);
    const [ml, setMl] = useState<number>(0);
    const [Z, setZ] = useState<number>(1);
    const [resolution, setResolution] = useState<number>(64);
    const [rMax, setRMax] = useState<number>(defaultOptimized.rMax);
    const [isoLevel, setIsoLevel] = useState<number>(defaultOptimized.isoLevel);

    // Track initialization
    const isInitializedRef = useRef(false);

    const handleOrbitalParamsChange = useCallback((newParams: OrbitalParams) => {
        console.log('App.tsx: Orbital params changing:', newParams);
        setIsLoading(true);
        setCurrentOrbitalParams(newParams);
    }, []);

    const handleOrbitalRendered = useCallback(() => {
        console.log('App.tsx: Orbital rendered callback');
        setIsLoading(false);
    }, []);

    // Single initialization effect
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
    }, []); // Empty dependency array to run only once

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
                    orbitalParams={currentOrbitalParams}
                    isLoading={isLoading}
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