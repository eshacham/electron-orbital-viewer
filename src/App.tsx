import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import Controls from './components/Controls';
import CircularProgress from '@mui/material/CircularProgress';
import OrbitalViewer, { OrbitalParams } from './components/OrbitalViewer'; // Import OrbitalParams
import { getOptimizedParameters } from './orbital_visualizer'; // To get rMax and isoLevel suggestions

// Define initial default parameters
const defaultN = 3;
const defaultL = 2;
const defaultOptimized = getOptimizedParameters(defaultN, defaultL) || { rMax: 15, isoLevel: 0.005 };

// Create a basic MUI theme
const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' }, // Example primary color
    secondary: { main: '#dc004e' }, // Example secondary color
  },
});

function App() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
    const [currentOrbitalParams, setCurrentOrbitalParams] = useState<OrbitalParams | null>(null);

  // State for individual control values, to be passed to Controls.tsx
  // These will be used to construct currentOrbitalParams when "Update Orbital" is clicked.
  const [n, setN] = useState<number>(defaultN);
  const [l, setL] = useState<number>(defaultL);
  const [ml, setMl] = useState<number>(0);
  const [Z, setZ] = useState<number>(1);
  const [resolution, setResolution] = useState<number>(64);
  // rMax and isoLevel will now also be part of the state managed by App
  const [rMax, setRMax] = useState<number>(defaultOptimized.rMax);
  const [isoLevel, setIsoLevel] = useState<number>(defaultOptimized.isoLevel);

    const handleOrbitalParamsChange = useCallback((newParams: {
    n: number;
    l: number;
    ml: number;
    Z: number;
    resolution: number;
    rMax: number;
    isoLevel: number;
  }) => {
    setIsLoading(true);
    // This will trigger the useEffect in OrbitalViewer
    setCurrentOrbitalParams(newParams); 
  }, []); // Dependencies: if this function used any state/props from App, list them here


  const handleOrbitalRendered = useCallback(() => {
    setIsLoading(false);
   }, []);

    // Effect to trigger initial orbital render on mount
  useEffect(() => {
    console.log("App.tsx: Triggering initial orbital render.");
    handleOrbitalParamsChange({
      n: defaultN,
      l: defaultL,
      ml: 0, // Default ml
      Z: 1,  // Default Z
      resolution: 32, // Default resolution
      rMax: defaultOptimized.rMax,
      isoLevel: defaultOptimized.isoLevel,
    });
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline /> {/* Applies baseline Material Design styles */}
      <>      
        <Box id="canvas-container">
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
        </Box>
        <Controls
          initialN={n} onNChange={setN}
          initialL={l} onLChange={setL}
          initialMl={ml} onMlChange={setMl}
          initialZ={Z} onZChange={setZ}
          initialResolution={resolution} onResolutionChange={setResolution}
          initialRMax={rMax} onRMaxChange={setRMax}
          initialIsoLevel={isoLevel} onIsoLevelChange={setIsoLevel}
          onUpdateOrbital={handleOrbitalParamsChange} // This will pass all current states
          getOptimizedParams={getOptimizedParameters} // Pass this down
        />
      </>
    </ThemeProvider>
  );
}

export default App;