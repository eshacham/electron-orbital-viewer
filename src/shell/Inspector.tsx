import React, { useId } from 'react';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ExpandMore from '@mui/icons-material/ExpandMore';
import TabRow, { type TabItem } from './TabRow';
import { displayPref, INSPECTOR_ALL_FOLDED } from '../design/presentation';
import { usePref } from '../design/usePref';
import './inspector.css';
import { useMoreBelow } from './useMoreBelow';

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
    /**
     * Drawer only. Task 3 (picture control): where no section is tabbed, the section the bar's one button opens the
     * drawer on, named by its title ("Data panel") -- Bonds' Data, so the drawer stays one press from the numbers. Not
     * among `sections` (Bonds below Explore), the bar keeps its View button.
     */
    barSection?: string;
    /**
     * Task 4: Info, always open above the accordion (docked, in the open drawer) or above the stacked sections --
     * never one of the accordion's sections. It keeps to part of the column and scrolls inside itself
     * (`.inspector-info`), so a long explanation never pushes the sections' headers away.
     */
    info?: React.ReactNode;
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
const Inspector: React.FC<InspectorProps> = ({ variant, sections, info, defaultOpen, barSection, open = false, onOpenChange }) => {
    const id = useId();
    const moreBelow = useMoreBelow();
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

    // Task 9b (finish review, fix 4): the slot fades its bottom edge while more of Info is below (useMoreBelow).
    const infoSlot = info ? <div ref={moreBelow} className="inspector-info">{info}</div> : null;

    if (variant === 'stacked') {
        // The phone sheet has its own Explore | Info | View | Plot tabs; here every section is shown, titled, all open,
        // and a tabbed section's tabs are stacked as sections of their own (ruling R7). Info, when given, comes first.
        return (
            <div className="inspector-stacked">
                {infoSlot}
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
        // and tab), or one for the mode's named section (`barSection`, opening the drawer on it), or a single
        // View button that opens the drawer as the viewer left it.
        const tabbed = sections.find(section => section.tabs?.length);
        const activeTab = tabbed?.tabs?.find(tab => tab.key === tabbed.activeTab) ?? tabbed?.tabs?.[0];
        const named = tabbed ? undefined : sections.find(section => section.key === barSection);
        const bar = tabbed?.tabs ?? (named ? [{ key: named.key, label: named.title }] : [{ key: 'view', label: 'View' }]);
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
                                aria-label={tabbed || named ? `${item.label} panel` : 'View settings'}
                                aria-expanded={expanded}
                                aria-controls={expanded ? drawerPanelId : undefined}
                                onClick={() => {
                                    if (expanded) { onOpenChange?.(false); return; }
                                    if (tabbed) {
                                        tabbed.onTab?.(item.key);
                                        if (openKey !== tabbed.key) choose(tabbed.key);
                                    } else if (named && openKey !== named.key) {
                                        choose(named.key);
                                    }
                                    onOpenChange?.(true);
                                }}
                            >
                                <span className="inspector-bar-label">{item.label}</span>
                            </button>
                        );
                    })}
                    {/* Task 5b fix round 1 (ruling M1): open, a separate control at the bar's far right folds the drawer away --
                        not a chevron after the open label, which read as a breadcrumb ("Plot › Data"). The open tab
                        still closes it in one press, under its own name. */}
                    {open && (
                        <button type="button" className="inspector-bar-close" aria-label="Close panel" onClick={() => onOpenChange?.(false)}>
                            <ChevronRight fontSize="small" aria-hidden="true" />
                        </button>
                    )}
                </div>
                {open && <div id={drawerPanelId} className="inspector-drawer-panel">{infoSlot}{content}</div>}
            </aside>
        );
    }

    return <aside className="inspector view-panel" aria-label="Inspector">{infoSlot}{content}</aside>;
};

export default Inspector;
