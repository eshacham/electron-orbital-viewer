/**
 * MUI upper-cases toggle labels, which symbols and names do not survive ("n = 2" → "N = 2", "h₁" → "H₁", "With spin–orbit").
 * Every segmented control keeps its labels' own case with this (preflight D16: one definition, not a copy per file).
 */
export const KEEP_CASE = { '& .MuiToggleButton-root': { textTransform: 'none' } } as const;
