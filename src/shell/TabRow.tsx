import React, { useRef } from 'react';
import { useRovingFocus } from './useRovingFocus';
import './tabs.css';

export interface TabItem { key: string; label: string }

interface TabRowProps {
    idPrefix: string;
    label: string;
    tabs: TabItem[];
    active: string;
    onChange(key: string): void;
}

/** A row of tabs (spec §8.4: nav style, underline indicator; §13: arrows inside, Tab exits). */
const TabRow: React.FC<TabRowProps> = ({ idPrefix, label, tabs, active, onChange }) => {
    const ref = useRef<HTMLDivElement>(null);
    useRovingFocus(ref, { selector: '[role="tab"]', orientation: 'horizontal' });
    return (
        <div ref={ref} className="ql-tabs" role="tablist" aria-label={label}>
            {tabs.map(tab => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`${idPrefix}-tab-${tab.key}`}
                    aria-selected={tab.key === active}
                    aria-controls={`${idPrefix}-panel-${tab.key}`}
                    className="ql-tab"
                    onClick={() => onChange(tab.key)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

export default TabRow;
