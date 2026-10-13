import React, { useState } from 'react';
import ExplorePanel from '../shell/ExplorePanel';

interface AtomExploreProps {
    header: React.ReactNode;
    configuration: React.ReactNode;
    orbitals: React.ReactNode;
    display: React.ReactNode;
    /** Medium width: a chevron that folds the panel to the rail (spec §7). */
    onCollapse?(): void;
}

/** The Atom screen's Explore panel (spec §9.1): the subject header, then Configuration, Orbitals and Display. */
const AtomExplore: React.FC<AtomExploreProps> = ({ header, configuration, orbitals, display, onCollapse }) => {
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
                { key: 'display', label: 'Display', content: display },
            ]}
        />
    );
};

export default AtomExplore;
