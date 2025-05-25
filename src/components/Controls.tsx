import React, { useState, useEffect } from 'react';


// This interface should match the one in OrbitalViewer.tsx and App.tsx
interface OrbitalParamsForUpdate {
  n: number;
  l: number;
  ml: number;
  Z: number;
  resolution: number;
  rMax: number;
  isoLevel: number;
}

interface ControlsProps {
  initialN: number;
  onNChange: (value: number) => void;
  initialL: number;
  onLChange: (value: number) => void;
  initialMl: number;
  onMlChange: (value: number) => void;
  initialZ: number;
  onZChange: (value: number) => void;
  initialResolution: number;
  onResolutionChange: (value: number) => void;
  initialRMax: number;
  onRMaxChange: (value: number) => void;
  initialIsoLevel: number;
  onIsoLevelChange: (value: number) => void;
  onUpdateOrbital: (params: OrbitalParamsForUpdate) => void;
  getOptimizedParams: (n: number, l: number) => { rMax: number; isoLevel: number } | null;
}

const Controls: React.FC<ControlsProps> = ({
  initialN, onNChange,
  initialL, onLChange,
  initialMl, onMlChange,
  initialZ, onZChange,
  initialResolution, onResolutionChange,
  initialRMax, onRMaxChange,
  initialIsoLevel, onIsoLevelChange,
  onUpdateOrbital,
  getOptimizedParams,
}) => {
  // Local state for dropdown options, derived from props
  const [lOptions, setLOptions] = useState<number[]>([]);
  const [mlOptions, setMlOptions] = useState<number[]>([]);

  // Effect to update l options when n changes
  useEffect(() => {
    const newLOptions = Array.from({ length: initialN }, (_, i) => i);
    setLOptions(newLOptions);
// If current L is not valid for new N, reset L (and subsequently Ml)
    // Also, update rMax and isoLevel based on new N (and potentially new L)
    if (!newLOptions.includes(initialL)) {
      const newL = newLOptions[0] !== undefined ? newLOptions[0] : 0;
      onLChange(newL); // This will trigger the l effect
      // Ml will be reset by the effect hook for L
      const optimized = getOptimizedParams(initialN, newL);
      if (optimized) {
        onRMaxChange(optimized.rMax);
        onIsoLevelChange(optimized.isoLevel);
      }
    } else {
      // N changed, but L is still valid. Update optimized params for current N, L.
      const optimized = getOptimizedParams(initialN, initialL);
      if (optimized) {
        onRMaxChange(optimized.rMax);
        onIsoLevelChange(optimized.isoLevel);
      }
    }
  }, [initialN, getOptimizedParams, onLChange, onRMaxChange, onIsoLevelChange]); // initialL is intentionally not here to avoid loops if L is reset


  // Effect to update ml options when l changes
  useEffect(() => {
    const newMlOptions = Array.from({ length: 2 * initialL + 1 }, (_, i) => i - initialL);
    setMlOptions(newMlOptions);
    // Reset ml if the current ml is no longer valid
    if (!newMlOptions.includes(initialMl)) {
      onMlChange(newMlOptions[0] !== undefined ? newMlOptions[0] : 0);
    }
    // When L changes, also update rMax and isoLevel
    const optimized = getOptimizedParams(initialN, initialL);
    if (optimized) {
        onRMaxChange(optimized.rMax);
        onIsoLevelChange(optimized.isoLevel);
    }
  }, [initialL, initialN, getOptimizedParams, onMlChange, onRMaxChange, onIsoLevelChange]); // initialMl is intentionally not here


  const handleUpdateOrbital = () => {
    const params: OrbitalParamsForUpdate = {
      n: initialN,
      l: initialL,
      ml: initialMl,
      Z: initialZ,
      resolution: initialResolution,
      rMax: initialRMax,
      isoLevel: initialIsoLevel,
    };
    console.log("Update Orbital Clicked with params:", params);
      onUpdateOrbital(params);
  };

  return (
    <div id="controls">
      <div className="control-group">
        <label htmlFor="n-select">n (Principal):</label>
        <select id="n-select" value={initialN} onChange={(e) => onNChange(parseInt(e.target.value, 10))}>
          {[1, 2, 3, 4, 5, 6].map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="l-select">l (Angular):</label>
        <select id="l-select" value={initialL} onChange={(e) => onLChange(parseInt(e.target.value, 10))} disabled={lOptions.length === 0}>
          {lOptions.map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="ml-select">m_l (Magnetic):</label>
        <select id="ml-select" value={initialMl} onChange={(e) => onMlChange(parseInt(e.target.value, 10))} disabled={mlOptions.length === 0}>
          {mlOptions.map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="z-input">Z (Atomic Number):</label>
        <input type="number" id="z-input" value={initialZ} onChange={(e) => onZChange(parseInt(e.target.value, 10))} min="1" step="1" />
      </div>
      <div className="control-group">
        <label htmlFor="resolution-input">Resolution:</label>
        <select id="resolution-input" value={initialResolution} onChange={(e) => onResolutionChange(parseInt(e.target.value, 10))}>
          {[32, 64, 128].map(val => <option key={val} value={val}>{val}</option>)}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="rMax-input">rMax (Max Radius):</label>
        <input type="number" id="rMax-input" value={initialRMax} onChange={(e) => onRMaxChange(parseFloat(e.target.value))} min="1" step="0.1" />
      </div>
      <div className="control-group">
        <label htmlFor="iso-level-input">Iso-Level:</label>
        <input type="number" id="iso-level-input" value={initialIsoLevel} 
          onChange={(e) => onIsoLevelChange(parseFloat(e.target.value))} 
          min="0.0000001" max="0.1" step="0.00001" 
          />
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