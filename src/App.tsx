import React, { useState, useEffect } from 'react';
import Controls from './components/Controls';
import LoadingSpinner from './components/LoadingSpinner';
import OrbitalViewer, { OrbitalParams } from './components/OrbitalViewer'; // Import OrbitalParams
import { getOptimizedParameters } from './orbital_visualizer'; // To get rMax and isoLevel suggestions

// Define initial default parameters
const defaultN = 2;
const defaultL = 0;
const defaultOptimized = getOptimizedParameters(defaultN, defaultL) || { rMax: 15, isoLevel: 0.005 };


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

  const handleOrbitalParamsChange = (newParams: {
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
  };

  const handleOrbitalRendered = () => {
    setIsLoading(false);
  };

    // Effect to trigger initial orbital render on mount
  useEffect(() => {
    console.log("App.tsx: Triggering initial orbital render.");
    handleOrbitalParamsChange({
      n: defaultN,
      l: defaultL,
      ml: 0, // Default ml
      Z: 1,  // Default Z
      resolution: 64, // Default resolution
      rMax: defaultOptimized.rMax,
      isoLevel: defaultOptimized.isoLevel,
    });
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <>      
      <div id="canvas-container">
        <OrbitalViewer
          orbitalParams={currentOrbitalParams}
          isLoading={isLoading}
          onOrbitalRendered={handleOrbitalRendered}
        />
      </div>
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
      <LoadingSpinner isVisible={isLoading} />
    </>
  );
}

export default App;