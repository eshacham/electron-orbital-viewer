// tests/info/info_panel.test.tsx -- Task 4: Info explains the selection at the reader's level (plain at Basics and
// Explore, + technical at Advanced, everything at Research); facts appear from their own level; "How this was computed"
// is folded below Research and open at Research; an (i) shows a glossary term and a new selection returns to the
// selection (Review Focus 3); the heading is in a polite live region.
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import InfoPanel from '../../src/info/InfoPanel';
import InfoButton from '../../src/info/InfoButton';
import { InfoTopicProvider, useInfoTopic } from '../../src/info/useInfoTopic';
import { glossary } from '../../src/info/glossary';
import type { InfoContent } from '../../src/info/info_types';
import type { LearningLevel } from '../../src/levels/levels';

const content: InfoContent = {
    title: 'Carbon — 2p',
    plain: 'Plain words about the 2p subshell.',
    technical: 'Technical words about the 2p subshell.',
    facts: [
        { label: 'Electrons', value: '2' },
        { label: 'Orbital energy', value: '−5.41 eV', min: 'explore' },
        { label: 'Radial nodes', value: '0', min: 'advanced' },
    ],
    computed: 'Central-field SCF, LDA exchange with VWN correlation.',
};

const renderAt = (level: LearningLevel) =>
    render(<InfoPanel content={content} topic={null} onClearTopic={() => {}} level={level} />);
const computed = () => screen.getByText('How this was computed').closest('details') as HTMLDetailsElement;

describe('InfoPanel (Task 4)', () => {
    it('at Basics shows the title and the plain band only; facts from Explore hidden; computed folded', () => {
        renderAt('basics');
        expect(screen.getByText('Carbon — 2p')).toBeInTheDocument();
        expect(screen.getByText(content.plain as string)).toBeInTheDocument();
        expect(screen.queryByText(content.technical as string)).toBeNull();
        expect(screen.getByText('Electrons')).toBeInTheDocument();
        expect(screen.queryByText('Orbital energy')).toBeNull();
        expect(computed().open).toBe(false);
    });

    it('at Explore hides facts that need Advanced, and keeps the technical band out', () => {
        renderAt('explore');
        expect(screen.getByText('Orbital energy')).toBeInTheDocument();
        expect(screen.getByText('−5.41 eV')).toBeInTheDocument();
        expect(screen.queryByText('Radial nodes')).toBeNull();
        expect(screen.queryByText(content.technical as string)).toBeNull();
    });

    it('at Advanced adds the technical band and the Advanced facts; computed still folded', () => {
        renderAt('advanced');
        expect(screen.getByText(content.plain as string)).toBeInTheDocument();
        expect(screen.getByText(content.technical as string)).toBeInTheDocument();
        expect(screen.getByText('Radial nodes')).toBeInTheDocument();
        expect(computed().open).toBe(false);
    });

    it('at Research opens "How this was computed"', () => {
        renderAt('research');
        expect(computed().open).toBe(true);
        expect(within(computed()).getByText(content.computed as string)).toBeInTheDocument();
    });

    it('folds or opens "How this was computed" again when the level crosses Research', () => {
        const { rerender } = renderAt('advanced');
        expect(computed().open).toBe(false);
        rerender(<InfoPanel content={content} topic={null} onClearTopic={() => {}} level="research" />);
        expect(computed().open).toBe(true);
        rerender(<InfoPanel content={content} topic={null} onClearTopic={() => {}} level="explore" />);
        expect(computed().open).toBe(false);
    });

    it('has no disclosure when there is nothing computed to state', () => {
        render(<InfoPanel content={{ title: 'Hydrogen', plain: null }} topic={null} onClearTopic={() => {}} level="research" />);
        expect(screen.queryByText('How this was computed')).toBeNull();
    });

    it('puts its "Info" heading in a polite live region, and is a region named by it', () => {
        renderAt('explore');
        const heading = screen.getByRole('heading', { level: 2, name: 'Info' });
        expect(heading.closest('[aria-live="polite"]')).not.toBeNull();
        expect(screen.getByRole('region', { name: 'Info' })).toContainElement(heading);
    });

    it('shows a topic\'s glossary bands at the reader\'s level', () => {
        const { rerender } = render(<InfoPanel content={content} topic="node" onClearTopic={() => {}} level="explore" />);
        expect(screen.getByText(glossary.node.plain)).toBeInTheDocument();
        expect(screen.queryByText(glossary.node.technical)).toBeNull();
        rerender(<InfoPanel content={content} topic="node" onClearTopic={() => {}} level="advanced" />);
        expect(screen.getByText(glossary.node.technical)).toBeInTheDocument();
        expect(screen.queryByText(glossary.node.full as string)).toBeNull();
        rerender(<InfoPanel content={content} topic="node" onClearTopic={() => {}} level="research" />);
        expect(screen.getByText(glossary.node.full as string)).toBeInTheDocument();
        // The selection's own text and facts give way to the term.
        expect(screen.queryByText(content.plain as string)).toBeNull();
        expect(screen.queryByText('Electrons')).toBeNull();
    });

    describe('with an (i) (Review Focus 3)', () => {
        const Harness: React.FC<{ selectionKey: string }> = ({ selectionKey }) => {
            const { topic, setTopic } = useInfoTopic(selectionKey);
            return (
                <InfoTopicProvider topic={topic} setTopic={setTopic}>
                    <InfoButton topic="subshell" label="Subshell" />
                    <InfoPanel content={content} topic={topic} onClearTopic={() => setTopic(null)} level="explore" />
                </InfoTopicProvider>
            );
        };

        it('an (i) shows the glossary term, and "Back to Carbon — 2p" restores the selection', () => {
            render(<Harness selectionKey="6|0|0|1|2|1|" />);
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            const region = screen.getByRole('region', { name: /^Info/ });
            expect(within(region).getByText(glossary.subshell.title)).toBeInTheDocument();
            expect(within(region).getByText(glossary.subshell.plain)).toBeInTheDocument();
            expect(within(region).queryByText(content.plain as string)).toBeNull();
            fireEvent.click(within(region).getByRole('button', { name: 'Back to Carbon — 2p' }));
            expect(within(region).getByText(content.plain as string)).toBeInTheDocument();
            expect(within(region).queryByText(glossary.subshell.plain)).toBeNull();
            // The way back puts focus on the heading, not on the page.
            expect(screen.getByRole('heading', { level: 2, name: 'Info' })).toHaveFocus();
        });

        it('a new selection returns Info to the selection', () => {
            const { rerender } = render(<Harness selectionKey="6|0|0|1|2|1|" />);
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            expect(screen.getByText(glossary.subshell.plain)).toBeInTheDocument();
            rerender(<Harness selectionKey="6|0|0|1|2|0|" />);
            expect(screen.queryByText(glossary.subshell.plain)).toBeNull();
            expect(screen.getByText(content.plain as string)).toBeInTheDocument();
        });

        it('going back to an earlier selection does not bring the old topic back', () => {
            const { rerender } = render(<Harness selectionKey="a" />);
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            rerender(<Harness selectionKey="b" />);
            rerender(<Harness selectionKey="a" />);
            expect(screen.queryByText(glossary.subshell.plain)).toBeNull();
            expect(screen.getByRole('button', { name: 'About Subshell' })).toHaveAttribute('aria-pressed', 'false');
        });
    });
});
