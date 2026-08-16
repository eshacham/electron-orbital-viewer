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
  FormHelperText,
  LinearProgress,
  Slider,
} from '@mui/material';
import { OrbitalParams, RenderMode, ClipAxis, SurfaceStyle } from '@/types/orbital';
import { computeSamplingRadius } from '../orbital_presets';
import { ELEMENTS, elementLabel } from '../elements';

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
  initialIsoLevel: number;
  onIsoLevelChange: (value: number) => void;
  onUpdateOrbital: (params: OrbitalParams) => void;
  onResetView: () => void;
  surfaceStyle: SurfaceStyle;
  onSurfaceStyleChange: (change: Partial<SurfaceStyle>) => void;
  getIsoLevelFor: (n: number, l: number) => number | null;
  isBusy: boolean;
}

const ISO_MIN = 0.000000001;
const ISO_MAX = 0.001;

const Controls: React.FC<ControlsProps> = ({
  initialN, onNChange,
  initialL, onLChange,
  initialMl, onMlChange,
  initialZ, onZChange,
  initialResolution, onResolutionChange,
  initialIsoLevel, onIsoLevelChange,
  onUpdateOrbital,
  onResetView,
  surfaceStyle,
  onSurfaceStyleChange,
  getIsoLevelFor,
  isBusy,
}) => {
  // Local state for dropdown options, derived from props
  const [lOptions, setLOptions] = useState<number[]>([0,1,2]);
  const [mlOptions, setMlOptions] = useState<number[]>([-2, -1, 0, 1, 2]);

  // What the iso-level box is showing while it is being edited. Clamping on
  // every keystroke made the field impossible to type into: the leading "0" of
  // "0.0002" is below the minimum, so it was rewritten to 1e-9 mid-entry.
  const [isoText, setIsoText] = useState<string>(String(initialIsoLevel));
  const [isoFocused, setIsoFocused] = useState(false);

  useEffect(() => {
    if (!isoFocused) setIsoText(String(initialIsoLevel));
  }, [initialIsoLevel, isoFocused]);

  const commitIsoLevel = () => {
    setIsoFocused(false);
    const parsed = parseFloat(isoText);
    if (!Number.isFinite(parsed)) {
      setIsoText(String(initialIsoLevel));   // reject junk, keep the last good value
      return;
    }
    const clamped = Math.max(ISO_MIN, Math.min(ISO_MAX, parsed));
    setIsoText(String(clamped));
    onIsoLevelChange(clamped);
  };

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
      const isoLevel = getIsoLevelFor(initialN, newL);
      if (isoLevel !== null) onIsoLevelChange(isoLevel);
    } else {
      // N changed, but L is still valid. Update the iso level for current N, L.
      const isoLevel = getIsoLevelFor(initialN, initialL);
      if (isoLevel !== null) onIsoLevelChange(isoLevel);
    }
  }, [initialN, getIsoLevelFor, onLChange, onIsoLevelChange]); // initialL is intentionally not here to avoid loops if L is reset


  // Effect to update ml options when l changes
  useEffect(() => {
    const newMlOptions = Array.from({ length: 2 * initialL + 1 }, (_, i) => i - initialL);
    setMlOptions(newMlOptions);
    // Reset ml if the current ml is no longer valid
    if (!newMlOptions.includes(initialMl)) {
      onMlChange(newMlOptions[0] !== undefined ? newMlOptions[0] : 0);
    }
    // When L changes, also update the iso level
    const isoLevel = getIsoLevelFor(initialN, initialL);
    if (isoLevel !== null) onIsoLevelChange(isoLevel);
  }, [initialL, initialN, getIsoLevelFor, onMlChange, onIsoLevelChange]); // initialMl is intentionally not here


  const handleUpdateOrbital = () => {
    const params: OrbitalParams = {
      n: initialN,
      l: initialL,
      ml: initialMl,
      Z: initialZ,
      resolution: initialResolution,
      // Derived, not chosen: the box that holds this orbital at this iso level.
      // It depends on ml and Z as well as n and l, so it cannot be a preset.
      rMax: computeSamplingRadius(initialN, initialL, initialMl, initialZ, initialIsoLevel),
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
      <FormControl fullWidth margin="normal" size="small" >
        <InputLabel id="n-select-label">Principal (n)</InputLabel>
        <Select
          labelId="n-select-label"
          id="n-select"
          value={initialN.toString()} // Select value must be a string if items are strings
          label="Principal (n)"
          onChange={(e: SelectChangeEvent<string>) => onNChange(parseInt(e.target.value, 10))}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(val => <MenuItem key={val} value={val.toString()}>{val}</MenuItem>)}
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
          disabled={lOptions.length === 0}
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
          disabled={mlOptions.length === 0}
        >
          {mlOptions.map(val => <MenuItem key={val} value={val.toString()}>{val}</MenuItem>)}
        </Select>
      </FormControl>

      <TextField
        fullWidth
        margin="normal"
        size="small"
        id="iso-level-input"
        label="Iso-Level"
        type="number"
        value={isoText}
        helperText={`${ISO_MIN} to ${ISO_MAX}`}
        onFocus={() => setIsoFocused(true)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsoText(e.target.value)}
        onBlur={commitIsoLevel}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        slotProps={{
          input: {
            inputProps: { min: String(ISO_MIN), max: String(ISO_MAX), step: "any" }
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
      />

      {/* The model is hydrogen-like: one electron bound to a charge-Z nucleus.
          The element names the nucleus; it is not a neutral atom's orbitals. */}
      <FormControl fullWidth margin="normal" size="small">
        <InputLabel id="z-select-label">Nucleus (Z)</InputLabel>
        <Select
          labelId="z-select-label"
          id="z-select"
          value={initialZ.toString()}
          label="Nucleus (Z)"
          onChange={(e: SelectChangeEvent<string>) => onZChange(parseInt(e.target.value, 10))}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
        >
          {ELEMENTS.map(element => (
            <MenuItem key={element.atomicNumber} value={element.atomicNumber.toString()}>
              {elementLabel(element.atomicNumber)}
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>one electron, charge-Z nucleus</FormHelperText>
      </FormControl>

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
          <ToggleButton value={32} aria-label="low resolution">Low</ToggleButton>
          <ToggleButton value={64} aria-label="Medium resolution">Medium</ToggleButton>
          <ToggleButton value={128} aria-label="High resolution">High</ToggleButton>
        </ToggleButtonGroup>
      </FormControl>

      {/* Surface, opacity and cut-away are view-only: they restyle the existing
          mesh, so none of them re-runs the calculation. */}
      <FormControl component="fieldset" margin="normal" fullWidth>
        <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Surface</FormLabel>
        <ToggleButtonGroup
          value={surfaceStyle.mode}
          exclusive
          onChange={(event: React.MouseEvent<HTMLElement>, newValue: RenderMode | null) => {
            if (newValue !== null) {
              onSurfaceStyleChange({ mode: newValue });
            }
          }}
          aria-label="surface style"
          size="small"
          fullWidth
        >
          <ToggleButton value="solid" aria-label="solid surface">Solid</ToggleButton>
          <ToggleButton value="wireframe" aria-label="wireframe surface">Wireframe</ToggleButton>
        </ToggleButtonGroup>
      </FormControl>

      <FormControl component="fieldset" margin="normal" fullWidth>
        <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>
          Opacity: {Math.round(surfaceStyle.opacity * 100)}%
        </FormLabel>
        <Slider
          id="opacity-slider"
          aria-label="surface opacity"
          value={surfaceStyle.opacity}
          min={0.05}
          max={1}
          step={0.05}
          size="small"
          onChange={(event: Event, value: number | number[]) =>
            onSurfaceStyleChange({ opacity: Array.isArray(value) ? value[0] : value })}
        />
      </FormControl>

      <FormControl component="fieldset" margin="normal" fullWidth>
        <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Cut away</FormLabel>
        <ToggleButtonGroup
          value={surfaceStyle.clipAxis}
          exclusive
          onChange={(event: React.MouseEvent<HTMLElement>, newValue: ClipAxis | null) => {
            if (newValue !== null) {
              onSurfaceStyleChange({ clipAxis: newValue });
            }
          }}
          aria-label="cut-away axis"
          size="small"
          fullWidth
        >
          <ToggleButton value="none" aria-label="no cut">Off</ToggleButton>
          <ToggleButton value="x" aria-label="cut along x">X</ToggleButton>
          <ToggleButton value="y" aria-label="cut along y">Y</ToggleButton>
          <ToggleButton value="z" aria-label="cut along z">Z</ToggleButton>
        </ToggleButtonGroup>
        {surfaceStyle.clipAxis !== 'none' && (
          <Slider
            id="clip-slider"
            aria-label="cut position"
            value={surfaceStyle.clipPosition}
            min={-1}
            max={1}
            step={0.02}
            size="small"
            sx={{ mt: 1 }}
            onChange={(event: Event, value: number | number[]) =>
              onSurfaceStyleChange({ clipPosition: Array.isArray(value) ? value[0] : value })}
          />
        )}
      </FormControl>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Button
          id="reset-view"
          variant="outlined"
          color="primary"
          onClick={onResetView}
        >
          Reset View
        </Button>
        <Button
          id="update-orbital"
          variant="contained"
          color="primary"
          onClick={handleUpdateOrbital}
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
          {isBusy && (
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