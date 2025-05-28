import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
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
    const [isLoading, setIsLoading] = useState(false);
    const [currentOrbitalParams, setCurrentOrbitalParams] = useState<OrbitalParams | null>(null);
    const initialRenderRef = useRef(false);

    const handleOrbitalParamsChange = useCallback((newParams: OrbitalParams) => {
        console.log('App: Updating orbital params:', newParams);
        setIsLoading(true);
        setCurrentOrbitalParams(newParams);
    }, []);

    const handleOrbitalRendered = useCallback(() => {
        setIsLoading(false);
    }, []);

    // Initial render
    useEffect(() => {
        if (!initialRenderRef.current) {
            console.log('App: Setting initial orbital parameters');
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
            initialRenderRef.current = true;
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
                    backgroundColor: '#111',
                    overflow: 'hidden'
                }}
            >
                <OrbitalViewer
                    orbitalParams={currentOrbitalParams}
                    isLoading={isLoading}
                    onOrbitalRendered={handleOrbitalRendered}
                />
                <Controls
                    initialN={defaultN} onNChange={() => {}}
                    initialL={defaultL} onLChange={() => {}}
                    initialMl={0} onMlChange={() => {}}
                    initialZ={1} onZChange={() => {}}
                    initialResolution={64} onResolutionChange={() => {}}
                    initialRMax={defaultOptimized.rMax} onRMaxChange={() => {}}
                    initialIsoLevel={defaultOptimized.isoLevel} onIsoLevelChange={() => {}}
                    onUpdateOrbital={handleOrbitalParamsChange}
                    getOptimizedParams={getOptimizedParameters}
                    isLoading={isLoading}
                />
            </Box>
        </ThemeProvider>
    );
}

export default App;