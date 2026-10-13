#!/usr/bin/env python3
"""Run from the root of a clean electron-orbital-viewer checkout after copying src/design/."""
from pathlib import Path

def edit(path, changes):
    p=Path(path); s=p.read_text()
    for old,new in changes:
        count=s.count(old)
        if count!=1: raise RuntimeError(f'{path}: expected one occurrence, found {count}: {old[:70]}')
        s=s.replace(old,new,1)
    p.write_text(s)

edit('src/App.tsx', [
 ("import { appTheme } from './theme';", "import { useQuantumTheme } from './design/useQuantumTheme';\nimport ThemeSwitch from './design/ThemeSwitch';"),
 ('function App() {', 'function App() {\n    const { mode: colorTheme, setMode: setColorTheme, theme: quantumTheme } = useQuantumTheme();'),
 ('<ThemeProvider theme={appTheme}>', '<ThemeProvider theme={quantumTheme}>'),
 ('<CssBaseline />', '<CssBaseline />\n            <div className="ql-theme-switch"><ThemeSwitch mode={colorTheme} onChange={setColorTheme} /></div>'),
])
edit('src/admin/AdminApp.tsx', [
 ("import { Alert, Button, CssBaseline, TextField, ThemeProvider, Typography, createTheme } from '@mui/material';", "import { Alert, Button, CssBaseline, TextField, ThemeProvider, Typography } from '@mui/material';\nimport { useQuantumTheme } from '../design/useQuantumTheme';\nimport ThemeSwitch from '../design/ThemeSwitch';"),
 ("// A light page for reading tables, unlike the viewer's dark canvas theme.\nconst adminTheme = createTheme({ palette: { primary: { main: '#1565c0' } } });\n", ''),
 ('const AdminApp: React.FC = () => {', 'const AdminApp: React.FC = () => {\n    const { mode: colorTheme, setMode: setColorTheme, theme: adminTheme } = useQuantumTheme();'),
 ('<Typography variant="h5" component="h1">Owner dashboard</Typography>', '<Typography variant="h5" component="h1">Owner dashboard</Typography>\n                    <ThemeSwitch mode={colorTheme} onChange={setColorTheme} />'),
])
edit('src/main.tsx', [("import './style.css';", "import './style.css';\nimport './design/quantumlab.css';")])
edit('src/admin/main.tsx', [("import './admin.css';", "import './admin.css';\nimport '../design/quantumlab.css';")])
print('Applied QuantumLab theme integration. Run npm install && npm run build && npm test.')
