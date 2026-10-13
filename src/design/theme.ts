import { createTheme, type Theme } from '@mui/material/styles';
export type QuantumThemeMode = 'dark' | 'light';
export const quantumTheme = (mode: QuantumThemeMode): Theme => {
 const dark = mode === 'dark';
 return createTheme({
  palette: { mode, primary: { main: dark ? '#66B8FF' : '#1565C0' }, secondary: { main: dark ? '#E9A66C' : '#9A4C25' },
   background: { default: dark ? '#071426' : '#F6F9FE', paper: dark ? '#12253B' : '#FFFFFF' },
   text: { primary: dark ? '#EDF5FF' : '#17283E', secondary: dark ? '#B8CDE4' : '#50627B' },
   divider: dark ? 'rgba(150,195,245,.18)' : 'rgba(35,75,125,.14)' },
  shape: { borderRadius: 12 },
  typography: { fontFamily: '"Roboto", system-ui, sans-serif' },
  components: {
   MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', border: dark ? '1px solid rgba(150,195,245,.18)' : '1px solid rgba(35,75,125,.12)' } } },
   MuiButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: 9, fontWeight: 600 } } },
   MuiToggleButton: { styleOverrides: { root: { textTransform: 'none' } } }
  }
 });
};
