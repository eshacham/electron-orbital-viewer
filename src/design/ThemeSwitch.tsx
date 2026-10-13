import React, { useState } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import Check from '@mui/icons-material/Check';
import { useQuantumTheme } from './useQuantumTheme';
import type { ThemeChoice } from './theme_storage';
import type { ThemeMode } from './tokens';

export const THEME_LABEL: Record<ThemeMode, string> = { dark: 'Deep Space', light: 'Light Clean' };

const CHOICES: Array<{ choice: ThemeChoice; label: string }> = [
    { choice: 'dark', label: THEME_LABEL.dark },
    { choice: 'light', label: THEME_LABEL.light },
    { choice: 'system', label: 'Match system' },
];

/** The top-bar theme switch (spec §6.4); the same component in /admin.html. */
const ThemeSwitch: React.FC = () => {
    const { mode, choice, setChoice } = useQuantumTheme();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const label = `Theme: ${THEME_LABEL[mode]}`;
    return (
        <>
            <Tooltip title={label}>
                <IconButton
                    className="ql-icon-button"
                    aria-label={label}
                    aria-haspopup="menu"
                    aria-expanded={anchor !== null}
                    onClick={event => setAnchor(event.currentTarget)}
                >
                    {mode === 'dark' ? <DarkModeOutlined fontSize="small" /> : <LightModeOutlined fontSize="small" />}
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {CHOICES.map(item => (
                    <MenuItem
                        key={item.choice}
                        role="menuitemradio"
                        aria-checked={choice === item.choice}
                        selected={choice === item.choice}
                        onClick={() => { setChoice(item.choice); setAnchor(null); }}
                    >
                        <ListItemIcon>{choice === item.choice ? <Check fontSize="small" /> : null}</ListItemIcon>
                        <ListItemText>{item.label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

export default ThemeSwitch;
