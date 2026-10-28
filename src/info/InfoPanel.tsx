import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { atLeast, type LearningLevel } from '../levels/levels';
import { spokenText } from '../format/sci';
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
    /**
     * Whether the live region says a new selection's title (true by default). Task 8: on a phone the caption under the
     * header names each new selection in its own live region, so Info leaves it to that one and a reader hears the
     * change once; a topic's change (an (i) pressed again, which moves no focus) is still Info's to say.
     */
    announceSelection?: boolean;
}

/**
 * Info (plan Task 4): always open at the top of the right panel, it explains the current selection at the reader's
 * level -- `plain` at Basics and Explore, `technical` added at Advanced, everything at Research -- with the key facts
 * each level asks for, and "How this was computed" folded below Research, open at Research. An (i) switches it to a
 * glossary term (shown in the same bands), named by a chip in the heading in the (i)'s own selected style; "Back to
 * <selection>", the active (i) again, or a new selection returns it. A screen reader hears each change once: by
 * focus on the heading after an (i) or Back, otherwise by a polite live region (review M5).
 */
const InfoPanel: React.FC<InfoPanelProps> = ({ content, topic, onClearTopic, level, announceSelection = true }) => {
    const context = useInfoTopicContext();
    const ownId = useId();
    const regionId = context?.regionId ?? `${ownId}-info`;
    const headingId = context?.headingId ?? `${ownId}-info-heading`;
    const heading = useRef<HTMLHeadingElement>(null);
    const title = useRef<HTMLParagraphElement>(null);
    // "Back to …" asks for focus on the heading the same way an (i) does (the Back button itself unmounts).
    const backPressed = useRef(false);
    // The text Info last showed, and what the live region says now (review M5, below).
    const lastShown = useRef<string | null>(null);
    // The selection's title as last rendered (in the title, or in "Back to …" while a topic is open): a change of it is
    // a new selection, whether or not a topic was open (fix round 1, M5).
    const lastSelection = useRef<string | null>(null);
    const backTitle = useRef<HTMLSpanElement>(null);
    const backButton = useRef<HTMLButtonElement>(null);
    // Task 9 fix round 1: a provisional title (the selection still loading) was shown, and the real one has not yet been.
    const waitedFor = useRef(false);
    const provisional = Boolean(content.provisional) && !topic;
    const [announcement, setAnnouncement] = useState('');
    // Review M1: an active (i) names Info's region in aria-controls only while Info is in the DOM.
    const registerInfo = context?.registerInfo;
    useLayoutEffect(() => registerInfo?.(), [registerInfo]);
    // After every render: an (i) or Back asked for focus (Info may only now be on screen -- the phone's tab, the
    // drawer), and the live region hears a change that focus did not already announce. Review M5: the focus target
    // is outside the live region, so a reader never hears the same change twice; a change with no focus move (a new
    // selection, the active (i) pressed again) is announced once, by the live region. Info's first appearance is not
    // a change.
    useLayoutEffect(() => {
        const focusMoved = Boolean(context?.takeFocusRequest()) || backPressed.current;
        backPressed.current = false;
        if (focusMoved) heading.current?.focus();
        // Task 9 fix round 1: the way back is named after the selection it returns to, with plain digits ("Back to Water
        // (H2O) — electron density"); its visible text keeps the typeset title.
        if (backButton.current) backButton.current.setAttribute('aria-label', `Back to ${spokenText(backTitle.current?.textContent ?? '')}`);
        // Task 9 fix round 1: a stand-in title while the selection loads is never said, and the real one after it is said
        // once -- the screen-reader pass heard a molecule's first load as "Info: Water", then "Info: Water (H₂O) — …".
        if (provisional) {
            waitedFor.current = true;
            return;
        }
        const waited = waitedFor.current;
        waitedFor.current = false;
        const chip = heading.current?.querySelector('.info-topic-chip')?.textContent;
        const shown = `Info: ${spokenText(chip ?? title.current?.textContent ?? '')}`;
        const selection = (chip === undefined ? title.current : backTitle.current)?.textContent ?? null;
        const selectionChanged = waited || (lastSelection.current !== null && selection !== lastSelection.current);
        lastSelection.current = selection;
        if (shown === lastShown.current || (lastShown.current === null && !waited)) {
            lastShown.current = shown;
            return;
        }
        lastShown.current = shown;
        // A new selection is the phone caption's to say when announceSelection is off; Info still says a topic's change.
        setAnnouncement(focusMoved || (selectionChanged && !announceSelection) ? '' : shown);
    });

    const entry = topic ? glossary[topic] : null;
    const technical = atLeast(level, 'advanced');
    const research = atLeast(level, 'research');
    const facts = (content.facts ?? []).filter(fact => !fact.min || atLeast(level, fact.min));
    const back = () => {
        backPressed.current = true;
        onClearTopic();
    };

    return (
        <section id={regionId} className="info-section" aria-labelledby={headingId}>
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
            <div className="info-head">
                <h2 id={headingId} ref={heading} className="ql-section info-heading" tabIndex={-1}>
                    Info
                    {entry && <>{' '}<span className="info-topic-chip">{entry.title}</span></>}
                </h2>
                {!entry && <p ref={title} className="info-title">{content.title}</p>}
            </div>
            {entry ? (
                <div className="info-body">
                    <button ref={backButton} type="button" className="info-back" onClick={back}>
                        <span aria-hidden="true">‹</span><span>Back to <span ref={backTitle}>{content.title}</span></span>
                    </button>
                    <p className="info-text">{entry.plain}</p>
                    {technical && <p className="info-text">{entry.technical}</p>}
                    {research && entry.full && <p className="info-text">{entry.full}</p>}
                </div>
            ) : (
                <div className="info-body">
                    {content.plain && <p className="info-text">{content.plain}</p>}
                    {/* Task 7a fix round 1 (ruling, every mode): the key facts follow the plain text and come before the
                        technical text -- the spec's order (name, plain explanation, key facts at the level), so the
                        numbers never fall below Info's fold at Advanced and Research. */}
                    {facts.length > 0 && (
                        <dl className="info-facts ql-tabular">
                            {/* Keyed by place: a label may be markup, and a builder lists each fact once. */}
                            {facts.map((fact, index) => (
                                <div key={index} className="info-fact">
                                    <dt>{fact.label}</dt>
                                    <dd>{fact.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {/* Task 7b: notes on the numbers and the picture, at every level, after the facts they qualify. */}
                    {content.notes?.map((note, index) => <p key={index} className="info-text info-notes">{note}</p>)}
                    {technical && content.technical && (Array.isArray(content.technical)
                        // Task 6 fix round 1 (M7): short paragraphs, one idea each, never one wall.
                        ? content.technical.map((paragraph, index) => <p key={index} className="info-text">{paragraph}</p>)
                        : <p className="info-text">{content.technical}</p>)}
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
