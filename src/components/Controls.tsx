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
  Typography,
} from '@mui/material';
import { OrbitalParams, RenderMode, ClipAxis, SurfaceStyle } from '@/types/orbital';
import { computeSamplingRadius, ENCLOSED_FRACTIONS } from '../orbital_presets';
import { ELEMENTS, elementLabel } from '../elements';
import { orbitalName } from '../orbital_names';

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
  initialEnclosedFraction: number;
  onEnclosedFractionChange: (value: number) => void;
  /** The density contour the last render actually used, or null before one. */
  isoLevel: number | null;
  onUpdateOrbital: (params: OrbitalParams) => void;
  onResetView: () => void;
  surfaceStyle: SurfaceStyle;
  onSurfaceStyleChange: (change: Partial<SurfaceStyle>) => void;

  isBusy: boolean;
  /** Sheet is showing. Only meaningful on narrow screens. */
  open?: boolean;
  /** Phone-width layout. */
  compact?: boolean;
}

const ISO_MIN = 0.000000001;
const ISO_MAX = 0.001;

const Controls: React.FC<ControlsProps> = ({
  initialN, onNChange,
  initialL, onLChange,
  initialMl, onMlChange,
  initialZ, onZChange,
  initialResolution, onResolutionChange,
  initialEnclosedFraction, onEnclosedFractionChange,
  isoLevel,
  onUpdateOrbital,
  onResetView,
  surfaceStyle,
  onSurfaceStyleChange,
  isBusy,
  open = true,
  compact = false,
}) => {
  // Local state for dropdown options, derived from props
  const [lOptions, setLOptions] = useState<number[]>([0,1,2]);
  const [mlOptions, setMlOptions] = useState<number[]>([-2, -1, 0, 1, 2]);

  // Effect to update l options when n changes
  useEffect(() => {
    const newLOptions = Array.from({ length: initialN }, (_, i) => i);
    setLOptions(newLOptions);
    // If current L is not valid for new N, reset it; ml follows from the l effect.
    if (!newLOptions.includes(initialL)) {
      onLChange(newLOptions[0] !== undefined ? newLOptions[0] : 0);
    }
  }, [initialN, onLChange]); // initialL is intentionally not here to avoid loops if L is reset

  // Effect to update ml options when l changes
  useEffect(() => {
    const newMlOptions = Array.from({ length: 2 * initialL + 1 }, (_, i) => i - initialL);
    setMlOptions(newMlOptions);
    if (!newMlOptions.includes(initialMl)) {
      onMlChange(newMlOptions[0] !== undefined ? newMlOptions[0] : 0);
    }
  }, [initialL, onMlChange]); // initialMl is intentionally not here

  const handleUpdateOrbital = () => {
    const params: OrbitalParams = {
      n: initialN,
      l: initialL,
      ml: initialMl,
      Z: initialZ,
      resolution: initialResolution,
      // Derived, not chosen: the box that holds this orbital.
      rMax: computeSamplingRadius(initialN, initialL, initialZ),
      enclosedFraction: initialEnclosedFraction,
    };
    console.log("Update Orbital Clicked with params:", params);
      onUpdateOrbital(params);
  };

  return (
    <Box
      id="controls"
      className={[compact ? 'compact' : '', open ? 'open' : 'closed'].filter(Boolean).join(' ')}
      sx={{
        p: 2,
        position: 'relative',
      }}
    >
      <Typography id="orbital-name" variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
        {orbitalName(initialN, initialL, initialMl)}
      </Typography>

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

      {/* A raw density threshold is not comparable between orbitals; the share
          of the electron enclosed is. The density that achieves it is derived
          per orbital and reported back below. */}
      <FormControl fullWidth margin="normal" size="small">
        <InputLabel id="enclosed-select-label">Electron enclosed</InputLabel>
        <Select
          labelId="enclosed-select-label"
          id="enclosed-select"
          value={initialEnclosedFraction.toString()}
          label="Electron enclosed"
          onChange={(e: SelectChangeEvent<string>) => onEnclosedFractionChange(parseFloat(e.target.value))}
        >
          {ENCLOSED_FRACTIONS.map(fraction => (
            <MenuItem key={fraction} value={fraction.toString()}>
              {Math.round(fraction * 100)}%
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>
          {isoLevel === null
            ? 'contour of constant |ψ|²'
            : `|ψ|² = ${isoLevel.toExponential(2)}`}
        </FormHelperText>
      </FormControl>

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

      <Box className="controls-actions" sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
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