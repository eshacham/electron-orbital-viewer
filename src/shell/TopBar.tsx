import React, { useEffect, useRef, useState } from 'react';
import { IconButton, Popover, Tooltip } from '@mui/material';
import HelpOutline from '@mui/icons-material/HelpOutline';
import SearchIcon from '@mui/icons-material/Search';
import BrandMark from '../design/BrandMark';
import ThemeSwitch from '../design/ThemeSwitch';
import Wordmark from '../design/Wordmark';
import type { Brand } from '../design/brands';
import type { ThemeMode } from '../design/tokens';
import { useRovingFocus } from './useRovingFocus';
import './top_bar.css';

export interface TopBarTab {
    key: string;
    label: string;
    /** Where the tab goes when opened in a new tab (middle-click); a plain click calls onSelect. */
    href: string;
    current: boolean;
    onSelect(): void;
    /** Label-in-name (WCAG 2.5.3): "<label> (<old name>)". Defaults to the visible label alone. */
    ariaLabel?: string;
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
    /** Below 1100 px: the search is an icon opening a 360 px popover (spec §7). */
    compactSearch?: boolean;
}

/** The 56 px top bar (spec §8.1): brand, area tabs, search, theme, help, avatar. */
const TopBar: React.FC<TopBarProps> = ({ brand, mode, tabs, search, avatar, onHelp, sessionNote, compactSearch }) => {
    const [searchAnchor, setSearchAnchor] = useState<HTMLElement | null>(null);
    const searchButtonRef = useRef<HTMLButtonElement | null>(null);
    // §13 "arrow keys inside tab rows": the area tabs are one Tab stop, the
    // current area, with the arrow keys, Home and End inside (ruling T18-a11y-carry).
    const tabsRef = useRef<HTMLElement | null>(null);
    useRovingFocus(tabsRef, { selector: '.app-topbar-tab', orientation: 'horizontal' }, tabs.length > 0);

    // Ruling DX4: the search's own ⌘K/Ctrl+K listener lives inside
    // GlobalSearch's 'bar' variant, which this popover does not mount until
    // it is open -- so below 1100 px the shortcut went dead. The top bar
    // owns it here instead: it opens the popover (and, once mounted, focuses
    // whatever input the slot holds) without touching the full-width case,
    // where GlobalSearch keeps handling it itself.
    useEffect(() => {
        if (!compactSearch) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setSearchAnchor(current => current ?? searchButtonRef.current);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [compactSearch]);

    useEffect(() => {
        if (!searchAnchor) return undefined;
        const frame = window.requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>('.search-popover input')?.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [searchAnchor]);

    return (
        <header className="app-topbar">
            <a className="app-topbar-brand" href="/" aria-label={`${brand.name}, home`}>
                <BrandMark size={28} />
                <Wordmark brand={brand} mode={mode} />
            </a>
            {tabs.length > 0 && (
                <nav ref={tabsRef} className="app-topbar-tabs" aria-label="areas">
                    {tabs.map(tab => (
                        <a
                            key={tab.key}
                            className="app-topbar-tab"
                            href={tab.href}
                            aria-label={tab.ariaLabel}
                            aria-current={tab.current ? 'page' : undefined}
                            onClick={event => { event.preventDefault(); tab.onSelect(); }}
                        >
                            {tab.label}
                        </a>
                    ))}
                </nav>
            )}
            {compactSearch ? (
                <div className="app-topbar-search compact">
                    <IconButton ref={searchButtonRef} className="ql-icon-button" aria-label="Search" onClick={event => setSearchAnchor(event.currentTarget)}>
                        <SearchIcon fontSize="small" />
                    </IconButton>
                    <Popover open={searchAnchor !== null} anchorEl={searchAnchor} onClose={() => setSearchAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        slotProps={{ paper: { className: 'search-popover' } }}>
                        {search}
                    </Popover>
                </div>
            ) : (
                <div className="app-topbar-search">{search}</div>
            )}
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
};

export default TopBar;
