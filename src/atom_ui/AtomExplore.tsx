import React, { useState } from 'react';
import ExplorePanel from '../shell/ExplorePanel';

interface AtomExploreProps {
    header: React.ReactNode;
    configuration: React.ReactNode;
    orbitals: React.ReactNode;
    /** Medium width: a chevron that hides the panel (a reveal button brings it back, spec §7). */
    onCollapse?(): void;
}

/**
 * The Atom screen's Explore panel (spec §9.1): the subject header, then
 * Configuration and Orbitals. Display is the top of the inspector now
 * (ruling R20b-atoms); the tab id is local state, never stored, so nothing
 * can ask for the old "display" tab (ExplorePanel would fall back to the
 * first tab, Configuration, if anything did).
 */
const AtomExplore: React.FC<AtomExploreProps> = ({ header, configuration, orbitals, onCollapse }) => {
    const [tab, setTab] = useState('configuration');
    return (
        <ExplorePanel
            header={header}
            active={tab}
            onTab={setTab}
            onCollapse={onCollapse}
            tabs={[
                { key: 'configuration', label: 'Configuration', content: configuration },
                { key: 'orbitals', label: 'Orbitals', content: orbitals },
            ]}
        />
    );
};

export default AtomExplore;
