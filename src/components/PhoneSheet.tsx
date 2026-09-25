import React from 'react';

export interface PhoneSheetTab {
    key: string;
    label: string;
    content: React.ReactNode;
}

interface PhoneSheetProps {
    tabs: PhoneSheetTab[];
    /** The open tab, or null with the sheet folded to its tab bar. */
    active: string | null;
    onChange: (key: string | null) => void;
}

/**
 * The phone's controls: a tab bar that is always on screen, over a sheet
 * that opens to one tab at a time.
 *
 * It replaced a single strip, several screens wide, that scrolled sideways
 * and held everything -- navigation, view settings and the mode switch in
 * one row -- while the shells lived in a separate card at the top. Here each
 * tab is one job, and its content scrolls vertically like any phone page.
 * Tapping the open tab again folds the sheet, giving the atom the screen.
 * The sheet sits along the bottom of a phone held upright and down the right
 * of one turned sideways (see style.css).
 */
const PhoneSheet: React.FC<PhoneSheetProps> = ({ tabs, active, onChange }) => {
    const current = tabs.find(tab => tab.key === active) ?? null;
    return (
        <div className={`phone-sheet${current ? ' open' : ''}`}>
            <div className="phone-sheet-tabs" role="tablist" aria-label="panels">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={`phone-tab-${tab.key}`}
                        aria-selected={current?.key === tab.key}
                        aria-controls="phone-sheet-body"
                        className="phone-sheet-tab"
                        onClick={() => onChange(current?.key === tab.key ? null : tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            {current && (
                <div
                    // Keyed by tab, so each opens at its own top rather than
                    // at the scroll position the previous tab was left at.
                    key={current.key}
                    className="phone-sheet-body"
                    id="phone-sheet-body"
                    role="tabpanel"
                    aria-labelledby={`phone-tab-${current.key}`}
                >
                    {current.content}
                </div>
            )}
        </div>
    );
};

export default PhoneSheet;
