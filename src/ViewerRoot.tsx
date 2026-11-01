import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { useQuantumTheme } from './design/useQuantumTheme';
import { useLevel } from './levels/useLevel';

/**
 * The theme lives here, above App, so a theme change never remounts the viewer (spec §3.2). The MUI theme is
 * tempered to the effective learning level (Brass Instrument): the visit level when a link set one, else the
 * stored preference -- `useLevel` also keeps `data-level` on the document for tokens.css. /admin.html has no level.
 */
export default function ViewerRoot({ children }: { children: React.ReactNode }) {
  const { level } = useLevel();
  const { theme } = useQuantumTheme(level);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
