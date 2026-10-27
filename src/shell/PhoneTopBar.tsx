import React, { useState } from 'react';
import { Button, IconButton, Popover } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BrandMark from '../design/BrandMark';
import Wordmark from '../design/Wordmark';
import type { Brand } from '../design/brands';
import type { ThemeMode } from '../design/tokens';
import type { ViewMode } from '../store/atomSlice';
import Rail, { MODE_LABEL } from './Rail';
import './phone_top_bar.css';

interface PhoneTopBarProps {
    brand: Brand;
    themeMode: ThemeMode;
    mode: ViewMode;
    onModeChange(mode: ViewMode): void;
    onOpenSearch(): void;
    avatar: React.ReactNode;
    /** A phone turned sideways: merged into the 44 px header line, without the wordmark (spec §7). */
    compact?: boolean;
}

/**
 * The phone's 52 px top bar (spec §9.8): brand, the mode menu ("Atoms ▾"
 * opens the rail's destinations), search, and the avatar, whose menu also
 * holds Theme, Help and the Learning level (Task 2).
 */
const PhoneTopBar: React.FC<PhoneTopBarProps> = ({ brand, themeMode, mode, onModeChange, onOpenSearch, avatar, compact = false }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    return (
        <div className={`phone-topbar${compact ? ' compact' : ''}`}>
            {!compact && (
                <a className="app-topbar-brand" href="/" aria-label={`${brand.name}, home`}>
                    <BrandMark size={24} />
                    <Wordmark brand={brand} mode={themeMode} />
                </a>
            )}
            <Button
                size="small"
                className="phone-mode-button"
                aria-label={`Mode: ${MODE_LABEL[mode]}`}
                aria-haspopup="true"
                aria-expanded={anchor !== null}
                onClick={event => setAnchor(event.currentTarget)}
            >
                {MODE_LABEL[mode]} ▾
            </Button>
            <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
                <Rail mode={mode} onModeChange={next => { setAnchor(null); onModeChange(next); }} />
            </Popover>
            <IconButton className="ql-icon-button" aria-label="Search" onClick={onOpenSearch}>
                <SearchIcon fontSize="small" />
            </IconButton>
            {avatar}
        </div>
    );
};

export default PhoneTopBar;
