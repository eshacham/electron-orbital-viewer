import React, { useEffect, useId } from 'react';
import TabRow, { type TabItem } from './TabRow';
import './inspector.css';

export interface InspectorTab extends TabItem { content: React.ReactNode }

interface InspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    tabs?: InspectorTab[];
    activeTab?: string;
    onTab?(key: string): void;
    /** Without tabs: today's right-column content (6G-1 for Basic, Bonds and Molecules). */
    body?: React.ReactNode;
    /** Drawer only. */
    open?: boolean;
    onOpenChange?(open: boolean): void;
}

/**
 * The inspector (spec §8.6): docked at 290 px on a desktop; at medium width a
 * 44 px edge bar whose buttons slide a 290 px drawer over the viewport's
 * right edge, non-modal and measured as a camera inset (§7); stacked inside
 * the phone sheet (ruling R7). `.view-panel` stays its class for the tests.
 */
const Inspector: React.FC<InspectorProps> = ({ variant, tabs, activeTab, onTab, body, open = false, onOpenChange }) => {
    const id = useId();
    const active = tabs?.find(tab => tab.key === activeTab) ?? tabs?.[0];

    useEffect(() => {
        if (variant !== 'drawer' || !open) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpenChange?.(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [variant, open, onOpenChange]);

    if (variant === 'stacked') {
        return (
            <div className="inspector-stacked">
                {tabs ? tabs.map(tab => <section key={tab.key} aria-label={tab.label} className="inspector-section">{tab.content}</section>) : body}
            </div>
        );
    }

    const content = tabs && active ? (
        <>
            <TabRow idPrefix={id} label="Inspector" tabs={tabs} active={active.key} onChange={key => onTab?.(key)} />
            <div className="inspector-body" role="tabpanel" id={`${id}-panel-${active.key}`} aria-labelledby={`${id}-tab-${active.key}`}>
                {active.content}
            </div>
        </>
    ) : (
        <div className="inspector-body">{body}</div>
    );

    if (variant === 'drawer') {
        const bar: TabItem[] = tabs ?? [{ key: 'view', label: 'View' }];
        return (
            <aside className={`inspector inspector-drawer view-panel ${open ? 'open' : 'folded'}`} aria-label="Inspector">
                <div className="inspector-bar">
                    {bar.map(item => {
                        const expanded = open && (!tabs || active?.key === item.key);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                className="inspector-bar-button"
                                aria-label={tabs ? `${item.label} panel` : 'View settings'}
                                aria-expanded={expanded}
                                onClick={() => {
                                    if (expanded) { onOpenChange?.(false); return; }
                                    if (tabs) onTab?.(item.key);
                                    onOpenChange?.(true);
                                }}
                            >
                                <span className="inspector-bar-label">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
                {open && <div className="inspector-drawer-panel">{content}</div>}
            </aside>
        );
    }

    return <aside className="inspector view-panel" aria-label="Inspector">{content}</aside>;
};

export default Inspector;
