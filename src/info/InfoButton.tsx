import React from 'react';
import type { InfoTopicId } from './info_types';
import { useInfoTopicContext } from './useInfoTopic';
import './info.css';

interface InfoButtonProps {
    topic: InfoTopicId;
    /** The term as the row beside it names it: the button is "About <label>". */
    label: string;
    /**
     * Task 6 fix round 2: where this (i) sits, when a term has another (i) elsewhere -- Atoms' ionisation energy has one
     * on the panel's line ('panel', the default) and one on Info's fact ('info'). With the topic it names this (i), so
     * only the pressed one lights. A place, not a React useId: an (i) unmounts and remounts with its tab or drawer (a
     * phone's Explore tab after the press switched to Info), and must still be the pressed one when it comes back.
     */
    place?: string;
}

/**
 * An (i) beside a term (plan Task 4): a 20 px mark in the accent text colour, with a 44 px hit area. Pressing it
 * switches Info to the term, brings Info on screen and moves focus to its heading; pressing the active one returns
 * Info to the selection and keeps focus on the (i).
 * Owner, 2026-10-27: one (i) is active at a time, drawn in the app's selected style (Deep Selection: selected-fill,
 * selected-edge) with aria-pressed, and aria-controls pointing at Info while Info is in the DOM; Info's heading names
 * the term in a matching chip.
 * A native button, so Enter and Space press it.
 * Task 6 fix round 2: active means this very (i) set the topic -- a second (i) for the same term (Atoms' ionisation
 * energy in the panel and in Info) stays unpressed, so only one (i) is ever shown pressed (owner).
 */
const InfoButton: React.FC<InfoButtonProps> = ({ topic, label, place = 'panel' }) => {
    const context = useInfoTopicContext();
    const buttonId = `${place}:${topic}`;
    const active = context !== null && context.topic === topic && context.activeButtonId === buttonId;
    return (
        <button
            type="button"
            className={`info-button${active ? ' is-active' : ''}`}
            aria-label={`About ${label}`}
            aria-pressed={active}
            aria-controls={active && context.infoMounted ? context.regionId : undefined}
            onClick={() => {
                if (!context) return;
                // Review I4 (WAI-ARIA toggle button): pressing the active (i) returns Info to the selection and keeps
                // focus here -- no focus move, no reveal (on a phone that would pull the sheet over to Info).
                if (active) {
                    context.setTopic(null);
                    return;
                }
                context.press(topic, buttonId);
                context.requestFocus();
                context.reveal();
            }}
        >
            <svg className="info-button-glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <circle cx="6" cy="2.6" r="1.1" />
                <rect x="5" y="4.6" width="2" height="5.6" rx="0.6" />
            </svg>
        </button>
    );
};

export default InfoButton;
