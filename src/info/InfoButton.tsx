import React from 'react';
import type { InfoTopicId } from './info_types';
import { useInfoTopicContext } from './useInfoTopic';
import './info.css';

interface InfoButtonProps {
    topic: InfoTopicId;
    /** The term as the row beside it names it: the button is "About <label>". */
    label: string;
}

/**
 * An (i) beside a term (plan Task 4): a 20 px mark in the accent text colour, with a 44 px hit area. Pressing it
 * switches Info to the term and moves focus to Info's heading; pressing the active one returns Info to the selection.
 * Owner, 2026-10-27: one (i) is active at a time, drawn in the app's selected style (Deep Selection: selected-fill,
 * selected-edge) with aria-pressed and aria-controls pointing at Info, whose heading names the term in a matching chip.
 * A native button, so Enter and Space press it.
 */
const InfoButton: React.FC<InfoButtonProps> = ({ topic, label }) => {
    const context = useInfoTopicContext();
    const active = context !== null && context.topic === topic;
    return (
        <button
            type="button"
            className={`info-button${active ? ' is-active' : ''}`}
            aria-label={`About ${label}`}
            aria-pressed={active}
            aria-controls={active ? context.regionId : undefined}
            onClick={() => {
                if (!context) return;
                context.setTopic(active ? null : topic);
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
