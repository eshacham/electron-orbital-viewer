import React, { useId } from 'react';
import { IconButton } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import TabRow, { type TabItem } from './TabRow';
import './explore.css';

export interface ExploreTab extends TabItem { content: React.ReactNode }

interface ExplorePanelProps {
    /** The subject's header card (the Atom screen's element tile and breadcrumb, Task 10). */
    header?: React.ReactNode;
    tabs?: ExploreTab[];
    active?: string;
    onTab?(key: string): void;
    /** Without tabs: today's left-column content, as it is (6G-1 for Basic, Bonds and Molecules). */
    body?: React.ReactNode;
    /** Medium width: a chevron that hides the panel (a reveal button brings it back, spec §7). */
    onCollapse?(): void;
}

/** The Explore panel's contents (spec §8.4); AppShell supplies the <aside>. The body scrolls on its own. */
const ExplorePanel: React.FC<ExplorePanelProps> = ({ header, tabs, active, onTab, body, onCollapse }) => {
    const id = useId();
    const current = tabs?.find(tab => tab.key === active) ?? tabs?.[0];
    return (
        <>
            {onCollapse && (
                <div className="explore-collapse-row">
                    <IconButton className="ql-icon-button" size="small" aria-label="Hide the Explore panel" onClick={onCollapse}>
                        <ChevronLeft fontSize="small" />
                    </IconButton>
                </div>
            )}
            {header && <div className="explore-header">{header}</div>}
            {tabs && current ? (
                <>
                    <TabRow idPrefix={id} label="Explore" tabs={tabs} active={current.key} onChange={key => onTab?.(key)} />
                    <div className="explore-body" role="tabpanel" id={`${id}-panel-${current.key}`} aria-labelledby={`${id}-tab-${current.key}`}>
                        {current.content}
                    </div>
                </>
            ) : (
                <div className="explore-body">{body}</div>
            )}
        </>
    );
};

export default ExplorePanel;
