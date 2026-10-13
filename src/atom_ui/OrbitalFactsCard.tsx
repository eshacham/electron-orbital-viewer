import React from 'react';
import type { OrbitalFacts } from '../orbital_facts';
import './inspector_atom.css';

/** The inspector's Data card (spec §9.1). */
const OrbitalFactsCard: React.FC<{ facts: OrbitalFacts }> = ({ facts }) => (
    <section className="facts-card" aria-label="orbital facts">
        <h2 className="ql-section">{facts.title}</h2>
        <dl className="facts-list ql-tabular">
            {facts.rows.map(row => (
                <React.Fragment key={row.term}>
                    <dt>{row.term}</dt>
                    {row.spokenValue ? (
                        // The visible mark is hidden from readers, which hear the words instead.
                        <dd><span aria-hidden="true">{row.value}</span><span className="visually-hidden">{row.spokenValue}</span></dd>
                    ) : <dd>{row.value}</dd>}
                </React.Fragment>
            ))}
        </dl>
        {facts.notes.length > 0 && (
            <ul className="facts-notes ql-caption">{facts.notes.map(note => <li key={note}>{note}</li>)}</ul>
        )}
    </section>
);

export default OrbitalFactsCard;
