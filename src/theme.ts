import { createTheme } from '@mui/material';

/**
 * The app's MUI theme, in its own module so its contrast is testable
 * (tests/a11y/panel_contrast.test.ts).
 */
export const appTheme = createTheme({
    palette: {
        // MUI's default #1976d2 is 2.9:1 on the translucent light cards;
        // #1565c0 is AA there, and white text on it is AA too.
        primary: { main: '#1565c0' },
        secondary: { main: '#dc004e' },
        // CssBaseline paints <body> in this. MUI's default is white, which
        // showed as a white frame round the dark view wherever the app's own
        // container did not reach -- a window resized larger, or a phone's
        // overscroll. The scene's own colour, so there is no seam either.
        background: { default: '#050505' },
    },
});
