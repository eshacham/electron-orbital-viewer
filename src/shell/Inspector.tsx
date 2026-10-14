import React, { useId } from 'react';
import ExpandMore from '@mui/icons-material/ExpandMore';
import TabRow, { type TabItem } from './TabRow';
import { displayPref } from '../design/presentation';
import { usePref } from '../design/usePref';
import './inspector.css';

export interface InspectorTab extends TabItem { content: React.ReactNode }

interface InspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    tabs?: InspectorTab[];
    activeTab?: string;
    onTab?(key: string): void;
    /** Without tabs: today's right-column content (6G-1 for Basic, Bonds and Molecules). */
    body?: React.ReactNode;
    /**
     * A section above the tabs (or the body) -- the Atom screen's Display
     * settings (ruling R20b-atoms). It scrolls together with what is below
     * it, so a tall section never squeezes the plot out of a short window.
     */
    top?: React.ReactNode;
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
const Inspector: React.FC<InspectorProps> = ({ variant, tabs, activeTab, onTab, body, top, open = false, onOpenChange }) => {
    const id = useId();
    const active = tabs?.find(tab => tab.key === activeTab) ?? tabs?.[0];

    // §13: Esc closes the open drawer and puts focus back on the bar button
    // that opened it. It is the drawer's own key -- heard on the drawer, not on
    // document, and only when nothing inside it handled the Esc first -- so an
    // Esc meant for the periodic table or the search does not close it too
    // (ruling T18-a11y-carry).
    const onDrawerKey = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        const bar = event.currentTarget.querySelector<HTMLButtonElement>('.inspector-bar-button[aria-expanded="true"]')
            ?? event.currentTarget.querySelector<HTMLButtonElement>('.inspector-bar-button');
        onOpenChange?.(false);
        bar?.focus();
    };

    if (variant === 'stacked') {
        return (
            <div className="inspector-stacked">
                {top}
                {tabs ? tabs.map(tab => <section key={tab.key} aria-label={tab.label} className="inspector-section">{tab.content}</section>) : body}
            </div>
        );
    }

    const inner = tabs && active ? (
        <>
            <TabRow idPrefix={id} label="Inspector" tabs={tabs} active={active.key} onChange={key => onTab?.(key)} />
            <div className="inspector-body" role="tabpanel" id={`${id}-panel-${active.key}`} aria-labelledby={`${id}-tab-${active.key}`}>
                {active.content}
            </div>
        </>
    ) : (
        <div className="inspector-body">{body}</div>
    );
    const content = top ? <div className="inspector-scroll">{top}{inner}</div> : inner;

    if (variant === 'drawer') {
        const bar: TabItem[] = tabs ?? [{ key: 'view', label: 'View' }];
        // Final review B, M6: an id for the panel a bar button opens, so aria-controls
        // can point assistive tech straight at it (the panel only exists while open).
        const drawerPanelId = `${id}-drawer-panel`;
        return (
            <aside className={`inspector inspector-drawer view-panel ${open ? 'open' : 'folded'}`} aria-label="Inspector"
                onKeyDown={open ? onDrawerKey : undefined}>
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
                                aria-controls={expanded ? drawerPanelId : undefined}
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
                {open && <div id={drawerPanelId} className="inspector-drawer-panel">{content}</div>}
            </aside>
        );
    }

    return <aside className="inspector view-panel" aria-label="Inspector">{content}</aside>;
};

/**
 * The view settings at the top of the inspector, in every mode (rulings
 * R20b-atoms, T20b-display-header): a "Display" heading whose button folds
 * them away, so the plot can come up on a short window. Whether it is open
 * is a presentation preference (eov.display), never part of a link.
 */
export const InspectorDisplay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const display = usePref(displayPref);
    const bodyId = useId();
    const open = display.displayOpen;
    return (
        <section className="inspector-display" aria-label="Display">
            <h2 className="ql-section inspector-display-heading">
                <button type="button" className="inspector-display-toggle" aria-expanded={open} aria-controls={open ? bodyId : undefined}
                    onClick={() => displayPref.set({ ...displayPref.get(), displayOpen: !open })}>
                    Display
                    <ExpandMore className="inspector-display-chevron" fontSize="small" aria-hidden="true" />
                </button>
            </h2>
            {open && <div id={bodyId}>{children}</div>}
        </section>
    );
};

export default Inspector;
