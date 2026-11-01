import React, { useLayoutEffect } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { applyLevelToDocument } from './design/level_temper';
import { useQuantumTheme } from './design/useQuantumTheme';
import { useLevel } from './levels/useLevel';

/**
 * The theme lives here, above App, so a theme change never remounts the viewer (spec §3.2). The MUI theme is
 * tempered to the effective learning level (Brass Instrument): the visit level when a link set one, else the
 * stored preference -- and this is the one place that keeps `data-level` on the document for tokens.css (every other
 * `useLevel` caller only reads). /admin.html has no level.
 */
export default function ViewerRoot({ children }: { children: React.ReactNode }) {
  const { level } = useLevel();
  const { theme } = useQuantumTheme(level);
  // Brass Instrument: the chrome is tempered to the level in use, a link's visit level included -- before paint, so a
  // link that opens at another level never shows one frame at the stored one.
  useLayoutEffect(() => applyLevelToDocument(level), [level]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
