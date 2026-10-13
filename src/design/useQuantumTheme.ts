import { useEffect, useMemo, useState } from 'react';
import { quantumTheme, type QuantumThemeMode } from './theme';
const KEY = 'eov.quantumlab.theme';
function initial(): QuantumThemeMode {
 try { const saved = localStorage.getItem(KEY); if (saved === 'dark' || saved === 'light') return saved; } catch {}
 return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
export function useQuantumTheme() {
 const [mode, setMode] = useState<QuantumThemeMode>(initial);
 useEffect(() => {
  document.documentElement.dataset.quantumTheme = mode;
  document.documentElement.style.colorScheme = mode;
  try { localStorage.setItem(KEY, mode); } catch {}
 }, [mode]);
 return { mode, setMode, theme: useMemo(() => quantumTheme(mode), [mode]) };
}
