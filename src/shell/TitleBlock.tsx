import React from 'react';
import './viewport.css';

/** The viewport's title block (spec §8.5): the page's h1 and what is drawn, on a canvas scrim. */
const TitleBlock: React.FC<{ title: string; subtitle: string; children?: React.ReactNode }> = ({ title, subtitle, children }) => (
    <div className="viewport-title">
        <h1>{title}</h1>
        <p className="viewport-subtitle">{subtitle}</p>
        {children}
    </div>
);

export default TitleBlock;
