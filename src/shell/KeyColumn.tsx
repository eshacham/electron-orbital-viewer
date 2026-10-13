import React from 'react';
import './viewport.css';

/** The right-hand key column (spec §8.5, §11.5): every colour on the view, with text. */
const KeyColumn: React.FC<{ compact?: boolean; children: React.ReactNode }> = ({ compact = false, children }) => (
    <div className={`key-column${compact ? ' compact' : ''}`} role="group" aria-label="colour keys">{children}</div>
);

/**
 * The ψ key. Without colours it uses style.css's swatch classes (today's
 * #e02020 / #2040ff); Task 12 passes the active scheme's colours from
 * science.ts, the one source the PNG legend and the vertex colours share.
 */
export const PhaseKey: React.FC<{ positive?: string; negative?: string }> = ({ positive, negative }) => (
    <div className="phase-legend" aria-label="surface colour key">
        <span className="phase-legend-item">
            <span className="phase-legend-swatch positive" style={positive ? { background: positive } : undefined} />ψ &gt; 0
        </span>
        <span className="phase-legend-item">
            <span className="phase-legend-swatch negative" style={negative ? { background: negative } : undefined} />ψ &lt; 0
        </span>
    </div>
);

export default KeyColumn;
