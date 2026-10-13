import React from 'react';
import { accentStops, type Brand } from './brands';
import type { ThemeMode } from './tokens';

/**
 * The brand's two-tone wordmark (spec §5): the first part in text-1, the
 * second in the accent -- gradient text via background-clip, with the
 * gradient's first stop as the solid fallback colour.
 */
const Wordmark: React.FC<{ brand: Brand; mode: ThemeMode }> = ({ brand, mode }) => {
    const accent = brand.accent[mode];
    const gradient = accent.startsWith('linear-gradient');
    const style = { '--ql-brand-solid': accentStops(accent)[0], '--ql-brand-accent': accent } as React.CSSProperties;
    return (
        <span className="ql-wordmark">
            <span className="ql-wordmark-first">{brand.parts[0]}</span>
            <span className={`ql-wordmark-second${gradient ? ' gradient' : ''}`} style={style}>{brand.parts[1]}</span>
        </span>
    );
};

export default Wordmark;
