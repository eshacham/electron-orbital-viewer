import React from 'react';
import './viewport.css';

/**
 * The viewport's title block (spec §8.5): the page's h1 and what is drawn, on a canvas scrim. Task 8: both are typeset
 * nodes (App builds them once from viewTitle, with withSubscripts), so an orbital reads 3d<sub>z²</sub>, never "3d_z²".
 *
 * Owner, 2026-11-02 (Hallmark audit): the h1 names the specimen, and `view`, where the mode has one, is a second serif
 * line inside it -- the heading stays one unit -- after a visually hidden ", ", so it is heard "Magnesium, excited
 * 3s → 3p, whole atom".
 */
const TitleBlock: React.FC<{ title: React.ReactNode; view?: React.ReactNode; subtitle: React.ReactNode; children?: React.ReactNode }> = ({ title, view, subtitle, children }) => (
    <div className="viewport-title">
        <h1>
            {title}
            {view && <><span className="visually-hidden title-pause">, </span><span className="viewport-title-view">{view}</span></>}
        </h1>
        <p className="viewport-subtitle">{subtitle}</p>
        {children}
    </div>
);

export default TitleBlock;
