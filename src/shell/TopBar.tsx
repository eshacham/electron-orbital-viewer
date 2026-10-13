import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import HelpOutline from '@mui/icons-material/HelpOutline';
import BrandMark from '../design/BrandMark';
import ThemeSwitch from '../design/ThemeSwitch';
import Wordmark from '../design/Wordmark';
import type { Brand } from '../design/brands';
import type { ThemeMode } from '../design/tokens';
import './top_bar.css';

export interface TopBarTab {
    key: string;
    label: string;
    /** Where the tab goes when opened in a new tab (middle-click); a plain click calls onSelect. */
    href: string;
    current: boolean;
    onSelect(): void;
}

interface TopBarProps {
    brand: Brand;
    mode: ThemeMode;
    tabs: TopBarTab[];
    search: React.ReactNode;
    avatar: React.ReactNode;
    onHelp(): void;
    /** Today's session-ended line (ruling R15), beside the avatar. */
    sessionNote?: string | null;
}

/** The 56 px top bar (spec §8.1): brand, area tabs, search, theme, help, avatar. */
const TopBar: React.FC<TopBarProps> = ({ brand, mode, tabs, search, avatar, onHelp, sessionNote }) => (
    <header className="app-topbar">
        <a className="app-topbar-brand" href="/" aria-label={`${brand.name}, home`}>
            <BrandMark size={28} />
            <Wordmark brand={brand} mode={mode} />
        </a>
        {tabs.length > 0 && (
            <nav className="app-topbar-tabs" aria-label="areas">
                {tabs.map(tab => (
                    <a
                        key={tab.key}
                        className="app-topbar-tab"
                        href={tab.href}
                        aria-current={tab.current ? 'page' : undefined}
                        onClick={event => { event.preventDefault(); tab.onSelect(); }}
                    >
                        {tab.label}
                    </a>
                ))}
            </nav>
        )}
        <div className="app-topbar-search">{search}</div>
        <div className="app-topbar-actions">
            <ThemeSwitch />
            <Tooltip title="Help">
                <IconButton className="ql-icon-button" aria-label="Help" onClick={onHelp}>
                    <HelpOutline fontSize="small" />
                </IconButton>
            </Tooltip>
            {sessionNote && <span role="status" className="ql-caption app-topbar-note">{sessionNote}</span>}
            {avatar}
        </div>
    </header>
);

export default TopBar;
