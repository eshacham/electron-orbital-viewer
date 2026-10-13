import React from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import type { QuantumThemeMode } from './theme';
export default function ThemeSwitch({mode,onChange}:{mode:QuantumThemeMode;onChange:(value:QuantumThemeMode)=>void}) {
 return <Tooltip title="Appearance"><ToggleButtonGroup exclusive size="small" aria-label="Appearance" value={mode} onChange={(_,next:QuantumThemeMode|null)=>{if(next)onChange(next);}}>
  <ToggleButton value="dark" aria-label="Deep Space dark theme">Deep Space</ToggleButton>
  <ToggleButton value="light" aria-label="Light Clean light theme">Light Clean</ToggleButton>
 </ToggleButtonGroup></Tooltip>;
}
