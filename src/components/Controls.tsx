import React, { useState, useEffect } from 'react';

// We'll define types for props later if needed, for now, it's self-contained
// interface ControlsProps {
//   onUpdateOrbital: (params: OrbitalParams) => void;
//   initialParams: OrbitalParams;
// }

// Placeholder for orbital parameters type, we'll define this more robustly later
interface OrbitalParams {
  n: number;
  l: number;
  ml: number;
  Z: number;
  resolution: number;
  rMax: number;
}

const Controls: React.FC = () => {
  const [n, setN] = useState<number>(2);
  const [l, setL] = useState<number>(0); // Will be populated based on n
  const [ml, setMl] = useState<number>(0); // Will be populated based on l
  const [Z, setZ] = useState<number>(1);
  const [resolution, setResolution] = useState<number>(64);
  const [rMax, setRMax] = useState<number>(15);

  const [lOptions, setLOptions] = useState<number[]>([]);
  const [mlOptions, setMlOptions] = useState<number[]>([]);

  // Effect to update l options when n changes
  useEffect(() => {
    const newLOptions = Array.from({ length: n }, (_, i) => i);
    setLOptions(newLOptions);
    // Reset l and ml if the current l is no longer valid
    if (!newLOptions.includes(l)) {
      setL(newLOptions[0] !== undefined ? newLOptions[0] : 0);
    }
  }, [n]);

  // Effect to update ml options when l changes
  useEffect(() => {
    const newMlOptions = Array.from({ length: 2 * l + 1 }, (_, i) => i - l);
    setMlOptions(newMlOptions);
    // Reset ml if the current ml is no longer valid
    if (!newMlOptions.includes(ml)) {
      setMl(newMlOptions[0] !== undefined ? newMlOptions[0] : 0);
    }
  }, [l]);

  const handleUpdateOrbital = () => {
    const params: OrbitalParams = { n, l, ml, Z, resolution, rMax };
    console.log("Update Orbital Clicked with params:", params);
    // In a later step, this will call a function passed via props
    // or interact with a global state/context to trigger the orbital calculation.
  };

  return (
    <div id="controls">
      <div className="control-group">
        <label htmlFor="n-select">n (Principal):</label>
        <select id="n-select" value={n} onChange={(e) => setN(parseInt(e.target.value, 10))}>
          {[1, 2, 3, 4, 5, 6].map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="l-select">l (Angular):</label>
        <select id="l-select" value={l} onChange={(e) => setL(parseInt(e.target.value, 10))} disabled={lOptions.length === 0}>
          {lOptions.map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="ml-select">m_l (Magnetic):</label>
        <select id="ml-select" value={ml} onChange={(e) => setMl(parseInt(e.target.value, 10))} disabled={mlOptions.length === 0}>
          {mlOptions.map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="z-input">Z (Atomic Number):</label>
        <input type="number" id="z-input" value={Z} onChange={(e) => setZ(parseInt(e.target.value, 10))} min="1" step="1" />
      </div>
      <div className="control-group">
        <label htmlFor="resolution-input">Resolution:</label>
        <select id="resolution-input" value={resolution} onChange={(e) => setResolution(parseInt(e.target.value, 10))}>
          {[32, 64, 128].map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="rMax-input">rMax (Max Radius):</label>
        <input type="number" id="rMax-input" value={rMax} onChange={(e) => setRMax(parseFloat(e.target.value))} min="5" step="1" />
      </div>
      <div className="control-group">
        <button id="update-orbital" type="button" onClick={handleUpdateOrbital}>
          Update Orbital
        </button>
      </div>
    </div>
  );
};

export default Controls;