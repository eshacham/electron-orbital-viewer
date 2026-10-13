import React, { useId } from 'react';

/** The redrawn atom mark (spec §4.8): three orbit rings and a glowing core, accent → selected-edge. */
const BrandMark: React.FC<{ size?: number }> = ({ size = 28 }) => {
    const id = `qlm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg className="ql-brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`${id}-orbit`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" style={{ stopColor: 'var(--ql-color-accent)' }} />
                    <stop offset="1" style={{ stopColor: 'var(--ql-color-selected-edge)' }} />
                </linearGradient>
                <radialGradient id={`${id}-core`}>
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="0.45" style={{ stopColor: 'var(--ql-color-selected-edge)' }} />
                    <stop offset="1" style={{ stopColor: 'var(--ql-color-accent)', stopOpacity: 0 }} />
                </radialGradient>
            </defs>
            {[0, 60, 120].map(angle => (
                <ellipse key={angle} cx="16" cy="16" rx="13" ry="5" fill="none" stroke={`url(#${id}-orbit)`} strokeWidth="1.6"
                    transform={`rotate(${angle} 16 16)`} />
            ))}
            <circle cx="16" cy="16" r="5" fill={`url(#${id}-core)`} />
        </svg>
    );
};

export default BrandMark;
