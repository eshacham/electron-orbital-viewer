import React, { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  SelectChangeEvent,
  ToggleButton,
  ToggleButtonGroup,
  FormLabel, // To label the ToggleButtonGroup
  LinearProgress,
} from '@mui/material';
import { OrbitalParams } from '@/types/orbital';

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
  onUpdateOrbital: (params: OrbitalParams) => void;
  getOptimizedParams: (n: number, l: number) => { rMax: number; isoLevel: number } | null;
  isLoading: boolean;
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
  isLoading,
}) => {
  // Local state for dropdown options, derived from props
  const [lOptions, setLOptions] = useState<number[]>([0,1,2]);
  const [mlOptions, setMlOptions] = useState<number[]>([-2, -1, 0, 1, 2]);

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
    const params: OrbitalParams = {
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
    <Box 
      id="controls" 
      sx={{ 
        p: 2,
        position: 'relative',
      }}
    >
      {/* Add overlay when loading */}
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            zIndex: 1,
            cursor: 'not-allowed',
          }}
        />
      )}

      <FormControl fullWidth margin="normal" size="small" >
        <InputLabel id="n-select-label">Principal (n)</InputLabel>
        <Select
          labelId="n-select-label"
          id="n-select"
          value={initialN.toString()} // Select value must be a string if items are strings
          label="Principal (n)"
          onChange={(e: SelectChangeEvent<string>) => onNChange(parseInt(e.target.value, 10))}
          disabled={isLoading}
        >
          {[1, 2, 3, 4, 5, 6].map(val => <MenuItem key={val} value={val.toString()}>{val}</MenuItem>)}
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal" size="small">
        <InputLabel id="l-select-label">Angular (l)</InputLabel>
        <Select
          labelId="l-select-label"
          id="l-select"
          value={initialL.toString()}
          label="Angular (l)"
          onChange={(e: SelectChangeEvent<string>) => onLChange(parseInt(e.target.value, 10))}
          disabled={lOptions.length === 0 || isLoading}
        >
          {lOptions.map(val => <MenuItem key={val} value={val.toString()}>{val}</MenuItem>)}
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal" size="small">
        <InputLabel id="ml-select-label">Magnetic (m_l)</InputLabel>
        <Select
          labelId="ml-select-label"
          id="ml-select"
          value={initialMl.toString()}
          label="Magnetic (m_l)"
          onChange={(e: SelectChangeEvent<string>) => onMlChange(parseInt(e.target.value, 10))}
          disabled={mlOptions.length === 0 || isLoading}
        >
          {mlOptions.map(val => <MenuItem key={val} value={val.toString()}>{val}</MenuItem>)}
        </Select>
      </FormControl>

      <TextField
        fullWidth
        margin="normal"
        size="small"
        id="rMax-input"
        label="Max Radius (rMax)"
        type="number"
        value={initialRMax}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const value = e.target.value === '' ? 1 : parseFloat(e.target.value);
          onRMaxChange(Math.max(1, Math.min(100, value))); // Min 1, Max 100 (example)
        }}
        slotProps={{ 
          input: { 
            inputProps: { min: "1", max: "100", step: "0.1" }   
          }      
        }}
        InputLabelProps={{ shrink: true }}
        sx={{
          '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
        }}
        disabled={isLoading}
      />

      <TextField
        fullWidth
        margin="normal"
        size="small"
        id="iso-level-input"
        label="Iso-Level"
        type="number"
        value={initialIsoLevel}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const valueStr = e.target.value;
          const minIso = 0.0000001;
          const maxIso = 0.1;

          if (valueStr === '') {
            onIsoLevelChange(NaN); // Allow clearing, TextField will show empty
          } else {
            let numValue = parseFloat(valueStr);
            if (!isNaN(numValue)) {
              // Clamp the value to the defined min/max
              numValue = Math.max(minIso, Math.min(maxIso, numValue));
              onIsoLevelChange(numValue);
            }
            // If numValue is NaN (e.g. "abc") and not empty, do nothing.
          }
        }}
        slotProps={{
          input: {
            inputProps: { min: "0.0000001", max: "0.1", step: "any" }
          }
        }}
        InputLabelProps={{ shrink: true }}
        sx={{
          '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
        }}
        disabled={isLoading}
      />

      <TextField
        fullWidth
        margin="normal"
        size="small"
        id="z-input"
        label="Atomic Number (Z)"
        type="number"
        value={initialZ}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const value = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
          onZChange(Math.max(1, Math.min(118, value))); // Min 1, Max 118
        }}
        slotProps={{ 
          input: { 
            inputProps: {
              min: "1", max: "118", step: "1" }
            }
        }}
        InputLabelProps={{ shrink: true }}
        sx={{
          // Attempt to hide spinners
          '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
        }}
        disabled={isLoading}
      />

      {/* Resolution ToggleButtonGroup */}
      <FormControl component="fieldset" margin="normal" fullWidth>
        <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Resolution</FormLabel> {/* Smaller label */}
        <ToggleButtonGroup
          value={initialResolution}
          exclusive // Ensures only one button can be active
          onChange={(event: React.MouseEvent<HTMLElement>, newValue: number | null) => {
            if (newValue !== null) {
              onResolutionChange(newValue);
            }
          }}
          aria-label="text alignment"
          size="small"
          fullWidth
        >
          <ToggleButton value={32} aria-label="low resolution" disabled={isLoading}>Low</ToggleButton>
          <ToggleButton value={64} aria-label="high resolution" disabled={isLoading}>High</ToggleButton>        
        </ToggleButtonGroup>
      </FormControl>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}> {/* Align button to the right */}
        <Button
          id="update-orbital"
          variant="contained"
          color="primary"
          onClick={handleUpdateOrbital}
          disabled={isLoading}
        >
          Update Orbital
        </Button>
      </Box>

      {/* Progress bar */}
      <Box sx={{ 
          width: '100%',
          mt: 2,
          height: 4
      }}>
          {isLoading && (
              <LinearProgress 
                  variant="indeterminate"
                  sx={{ 
                      borderRadius: 1
                  }} 
              />
          )}
      </Box>
    </Box>
  );
};

export default React.memo(Controls);