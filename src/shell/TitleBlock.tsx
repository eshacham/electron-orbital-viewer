import React from 'react';
import './viewport.css';

/**
 * The viewport's title block (spec §8.5): the page's h1 and what is drawn, on a canvas scrim. Task 8: both are typeset
 * nodes (App builds them once from viewTitle, with withSubscripts), so an orbital reads 3d<sub>z²</sub>, never "3d_z²".
 */
const TitleBlock: React.FC<{ title: React.ReactNode; subtitle: React.ReactNode; children?: React.ReactNode }> = ({ title, subtitle, children }) => (
    <div className="viewport-title">
        <h1>{title}</h1>
        <p className="viewport-subtitle">{subtitle}</p>
        {children}
    </div>
);

export default TitleBlock;
