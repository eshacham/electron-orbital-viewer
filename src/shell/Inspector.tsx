import React, { useId } from 'react';
import ExpandMore from '@mui/icons-material/ExpandMore';
import TabRow, { type TabItem } from './TabRow';
import { displayPref, INSPECTOR_ALL_FOLDED } from '../design/presentation';
import { usePref } from '../design/usePref';
import './inspector.css';

export interface InspectorTab extends TabItem { content: React.ReactNode }

/**
 * One titled inspector section (ruling R24-3): Display, Plot and data,
 * Properties... It holds either `content` or a row of `tabs` (Plot | Data),
 * whose `activeTab` and `onTab` the mode owns.
 */
export interface InspectorSection {
    key: string;
    title: string;
    content?: React.ReactNode;
    tabs?: InspectorTab[];
    activeTab?: string;
    onTab?(key: string): void;
}

interface InspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    /** Top to bottom. One is open at a time (docked and drawer); stacked shows them all, titled. */
    sections: InspectorSection[];
    /**
     * The section open while the viewer has never chosen: the mode's content
     * section (Plot and data, Properties). Defaults to the last section --
     * Display only where it is the only one (Molecules before a molecule has
     * loaded: its Properties section exists only once there are some).
     */
    defaultOpen?: string;
    /** Drawer only. */
    open?: boolean;
    onOpenChange?(open: boolean): void;
}

/** A tabbed section's inside: its tab row and the active tab's panel. */
const SectionTabs: React.FC<{ section: InspectorSection }> = ({ section }) => {
    const id = useId();
    const tabs = section.tabs ?? [];
    const active = tabs.find(tab => tab.key === section.activeTab) ?? tabs[0];
    if (!active) return null;
    return (
        <>
            <TabRow idPrefix={id} label="Inspector" tabs={tabs} active={active.key} onChange={key => section.onTab?.(key)} />
            <div className="inspector-body" role="tabpanel" id={`${id}-panel-${active.key}`} aria-labelledby={`${id}-tab-${active.key}`}>
                {active.content}
            </div>
        </>
    );
};

const sectionInside = (section: InspectorSection) => (section.tabs ? <SectionTabs section={section} /> : <div className="inspector-body">{section.content}</div>);

/**
 * Ruling R24-3 (owner): the inspector's sections are titled accordion
 * headers, one open at a time. The open one fills the inspector's remaining
 * height and scrolls inside itself; the folded headers stay above and below
 * it, so the viewer always sees that the other sections exist and what they
 * hold. Which one is open is a presentation preference (eov.display), never
 * part of a link.
 */
const Accordion: React.FC<{ sections: InspectorSection[]; openKey: string | null; onToggle(key: string): void }> = ({ sections, openKey, onToggle }) => {
    const id = useId();
    return (
        <div className="inspector-sections">
            {sections.map(section => {
                const isOpen = section.key === openKey;
                const headerId = `${id}-${section.key}-header`;
                const regionId = `${id}-${section.key}-region`;
                return (
                    <section key={section.key} className={`inspector-panel-section${isOpen ? ' open' : ''}`}>
                        <h2 className="ql-section inspector-section-heading">
                            <button type="button" id={headerId} className="inspector-section-toggle" aria-expanded={isOpen}
                                aria-controls={isOpen ? regionId : undefined} onClick={() => onToggle(section.key)}>
                                {section.title}
                                <ExpandMore className="inspector-section-chevron" fontSize="small" aria-hidden="true" />
                            </button>
                        </h2>
                        {isOpen && (
                            <div id={regionId} role="region" aria-labelledby={headerId} className="inspector-section-body">
                                {sectionInside(section)}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
};

/**
 * The inspector (spec §8.6): docked at 290 px on a desktop; at medium width a
 * 44 px edge bar whose buttons slide a 290 px drawer over the viewport's
 * right edge, non-modal and measured as a camera inset (§7); stacked inside
 * the phone sheet (ruling R7). `.view-panel` stays its class for the tests.
 */
const Inspector: React.FC<InspectorProps> = ({ variant, sections, defaultOpen, open = false, onOpenChange }) => {
    const id = useId();
    const display = usePref(displayPref);
    const keys = sections.map(section => section.key);
    const fallback = defaultOpen && keys.includes(defaultOpen) ? defaultOpen : keys[keys.length - 1] ?? null;
    const stored = display.inspectorOpen;
    // A stored section this inspector lacks (Plot and data, in Molecules) is not a choice about it.
    const openKey = stored === INSPECTOR_ALL_FOLDED ? null : stored !== null && keys.includes(stored) ? stored : fallback;
    const choose = (key: string | null) => displayPref.set({ ...displayPref.get(), inspectorOpen: key ?? INSPECTOR_ALL_FOLDED });

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
        // The phone sheet has its own Explore | View | Plot tabs; here every section is shown, titled, all open,
        // and a tabbed section's tabs are stacked as sections of their own (ruling R7).
        return (
            <div className="inspector-stacked">
                {sections.map(section => (
                    <React.Fragment key={section.key}>
                        <h2 className="ql-section">{section.title}</h2>
                        {section.tabs
                            ? section.tabs.map(tab => <section key={tab.key} aria-label={tab.label} className="inspector-section">{tab.content}</section>)
                            : section.content}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    const content = <Accordion sections={sections} openKey={openKey} onToggle={key => choose(key === openKey ? null : key)} />;

    if (variant === 'drawer') {
        // The bar keeps its buttons: one per tab of a tabbed section (each opens the drawer at that section
        // and tab), or a single View button that opens the drawer as the viewer left it.
        const tabbed = sections.find(section => section.tabs?.length);
        const activeTab = tabbed?.tabs?.find(tab => tab.key === tabbed.activeTab) ?? tabbed?.tabs?.[0];
        const bar = tabbed?.tabs ?? [{ key: 'view', label: 'View' }];
        // Final review B, M6: an id for the panel a bar button opens, so aria-controls
        // can point assistive tech straight at it (the panel only exists while open).
        const drawerPanelId = `${id}-drawer-panel`;
        return (
            <aside className={`inspector inspector-drawer view-panel ${open ? 'open' : 'folded'}`} aria-label="Inspector"
                onKeyDown={open ? onDrawerKey : undefined}>
                <div className="inspector-bar">
                    {bar.map(item => {
                        // Ruling R24-I1: the current tab's button reflects the open drawer whatever section is
                        // open inside it (Display, or none), so it closes it in one click and Esc returns to it.
                        const expanded = open && (!tabbed || activeTab?.key === item.key);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                className="inspector-bar-button"
                                aria-label={tabbed ? `${item.label} panel` : 'View settings'}
                                aria-expanded={expanded}
                                aria-controls={expanded ? drawerPanelId : undefined}
                                onClick={() => {
                                    if (expanded) { onOpenChange?.(false); return; }
                                    if (tabbed) {
                                        tabbed.onTab?.(item.key);
                                        if (openKey !== tabbed.key) choose(tabbed.key);
                                    }
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

export default Inspector;
