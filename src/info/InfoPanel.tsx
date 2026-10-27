import React, { useId, useLayoutEffect, useRef } from 'react';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { atLeast, type LearningLevel } from '../levels/levels';
import { glossary } from './glossary';
import type { InfoContent, InfoTopicId } from './info_types';
import { useInfoTopicContext } from './useInfoTopic';
import './info.css';

interface InfoPanelProps {
    /** What Info says about the current selection (a mode's builder, Tasks 5-7). */
    content: InfoContent;
    /** The term an (i) opened, or null: Info explains the selection. */
    topic: InfoTopicId | null;
    /** "Back to <selection>": Info returns to the selection. */
    onClearTopic(): void;
    level: LearningLevel;
}

/**
 * Info (plan Task 4): always open at the top of the right panel, it explains the current selection at the reader's
 * level -- `plain` at Basics and Explore, `technical` added at Advanced, everything at Research -- with the key facts
 * each level asks for, and "How this was computed" folded below Research, open at Research. An (i) switches it to a
 * glossary term (shown in the same bands), named by a chip in the heading in the (i)'s own selected style; "Back to
 * <selection>", the active (i) again, or a new selection returns it. The heading and the title under it sit in a
 * polite live region, so a screen reader hears what Info now explains.
 */
const InfoPanel: React.FC<InfoPanelProps> = ({ content, topic, onClearTopic, level }) => {
    const context = useInfoTopicContext();
    const ownId = useId();
    const regionId = context?.regionId ?? `${ownId}-info`;
    const headingId = context?.headingId ?? `${ownId}-info-heading`;
    const heading = useRef<HTMLHeadingElement>(null);
    // An (i) asked for focus; Info may only now be on screen (the phone's tab, the drawer), hence after every render.
    useLayoutEffect(() => {
        if (context?.takeFocusRequest()) heading.current?.focus();
    });

    const entry = topic ? glossary[topic] : null;
    const technical = atLeast(level, 'advanced');
    const research = atLeast(level, 'research');
    const facts = (content.facts ?? []).filter(fact => !fact.min || atLeast(level, fact.min));
    const back = () => {
        onClearTopic();
        heading.current?.focus();
    };

    return (
        <section id={regionId} className="info-section" aria-labelledby={headingId}>
            <div className="info-head" aria-live="polite">
                <h2 id={headingId} ref={heading} className="ql-section info-heading" tabIndex={-1}>
                    Info
                    {entry && <>{' '}<span className="info-topic-chip">{entry.title}</span></>}
                </h2>
                {!entry && <p className="info-title">{content.title}</p>}
            </div>
            {entry ? (
                <div className="info-body">
                    <button type="button" className="info-back" onClick={back}>Back to {content.title}</button>
                    <p className="info-text">{entry.plain}</p>
                    {technical && <p className="info-text">{entry.technical}</p>}
                    {research && entry.full && <p className="info-text">{entry.full}</p>}
                </div>
            ) : (
                <div className="info-body">
                    {content.plain && <p className="info-text">{content.plain}</p>}
                    {technical && content.technical && <p className="info-text">{content.technical}</p>}
                    {facts.length > 0 && (
                        <dl className="info-facts ql-tabular">
                            {facts.map(fact => (
                                <div key={fact.label} className="info-fact">
                                    <dt>{fact.label}</dt>
                                    <dd>{fact.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {content.computed && (
                        // Keyed by whether it starts open, so crossing Research folds or opens it again; in between
                        // the reader's own toggle stands.
                        <details key={research ? 'open' : 'folded'} className="info-computed" open={research}>
                            <summary>
                                How this was computed
                                <ExpandMore className="info-computed-chevron" fontSize="small" aria-hidden="true" />
                            </summary>
                            <div className="info-computed-body">{content.computed}</div>
                        </details>
                    )}
                </div>
            )}
        </section>
    );
};

export default InfoPanel;
