// tests/info/info_button.test.tsx -- Task 4 and the owner's amendment (2026-10-27): one (i) is active at a time, drawn in
// the selected style with aria-pressed and aria-controls pointing at Info, and Info's heading names the term in a
// matching chip. A new selection returns Info to the selection and so clears the active (i).
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import InfoButton from '../../src/info/InfoButton';
import InfoPanel from '../../src/info/InfoPanel';
import { InfoTopicProvider, useInfoTopic } from '../../src/info/useInfoTopic';

const Harness: React.FC<{ selectionKey?: string; onReveal?(): void }> = ({ selectionKey = '6|0|0|1|2|1|0|', onReveal }) => {
    const { topic, setTopic } = useInfoTopic(selectionKey);
    return (
        <InfoTopicProvider topic={topic} setTopic={setTopic} onReveal={onReveal}>
            <InfoButton topic="shell" label="Shell" />
            <InfoButton topic="orbital" label="Orbital" />
            <InfoPanel content={{ title: 'Carbon — 2p', plain: 'A dumbbell with a node at the nucleus.' }}
                topic={topic} onClearTopic={() => setTopic(null)} level="explore" />
        </InfoTopicProvider>
    );
};

const shell = () => screen.getByRole('button', { name: 'About Shell' });
const orbital = () => screen.getByRole('button', { name: 'About Orbital' });
const infoHeading = () => screen.getByRole('heading', { level: 2, name: /^Info/ });
const chip = () => infoHeading().querySelector('.info-topic-chip');

describe('InfoButton (Task 4)', () => {
    it('is a native button named "About <label>", so Enter and Space press it like any button (Review Focus 3)', () => {
        render(<Harness />);
        expect(shell().tagName).toBe('BUTTON');
        expect(shell()).toHaveAttribute('type', 'button');
        expect(shell()).not.toHaveAttribute('tabindex', '-1');
        expect(shell()).toHaveAttribute('aria-pressed', 'false');
        expect(chip()).toBeNull();
    });

    it('marks the one active (i) pressed, in the selected style, controlling Info, with a matching chip in its heading', () => {
        render(<Harness />);
        fireEvent.click(shell());
        expect(shell()).toHaveAttribute('aria-pressed', 'true');
        expect(shell()).toHaveClass('is-active');
        expect(orbital()).toHaveAttribute('aria-pressed', 'false');
        expect(orbital()).not.toHaveClass('is-active');
        const controlled = document.getElementById(shell().getAttribute('aria-controls') ?? '');
        expect(controlled).not.toBeNull();
        expect(controlled).toContainElement(infoHeading());
        expect(chip()).toHaveTextContent('Shell');
    });

    it('moves the active state to the next (i), and pressing the active one returns Info to the selection', () => {
        render(<Harness />);
        fireEvent.click(shell());
        fireEvent.click(orbital());
        expect(orbital()).toHaveAttribute('aria-pressed', 'true');
        expect(shell()).toHaveAttribute('aria-pressed', 'false');
        expect(chip()).toHaveTextContent('Orbital');
        fireEvent.click(orbital());
        expect(orbital()).toHaveAttribute('aria-pressed', 'false');
        expect(shell()).toHaveAttribute('aria-pressed', 'false');
        expect(chip()).toBeNull();
        expect(screen.getByText('Carbon — 2p')).toBeInTheDocument();
    });

    // Review I4 (WAI-ARIA toggle button): opening a topic moves focus to Info's heading; pressing the active (i) to
    // return Info to the selection keeps focus on the (i).
    it('moves focus to Info\'s heading when it opens a topic, and keeps focus on itself when it clears one', () => {
        render(<Harness />);
        shell().focus();
        fireEvent.click(shell());
        expect(infoHeading()).toHaveFocus();
        shell().focus();
        fireEvent.click(shell());
        expect(shell()).toHaveFocus();
        expect(chip()).toBeNull();
    });

    // Review I4: un-pressing the active (i) must not pull the phone sheet over to Info (or open the drawer).
    it('asks the layout to reveal Info (the phone tab, the drawer) when it opens a topic, never when it clears one', () => {
        const onReveal = jest.fn();
        render(<Harness onReveal={onReveal} />);
        fireEvent.click(shell());
        expect(onReveal).toHaveBeenCalledTimes(1);
        fireEvent.click(shell());
        expect(onReveal).toHaveBeenCalledTimes(1);
    });

    // Review M1: on a phone the (i) is in the Explore tab while Info's tab is not mounted -- aria-controls names
    // Info's region only while that region is in the DOM.
    it('names Info in aria-controls only while Info is in the DOM', () => {
        const Buttons: React.FC<{ withInfo: boolean }> = ({ withInfo }) => {
            const { topic, setTopic } = useInfoTopic('a');
            return (
                <InfoTopicProvider topic={topic} setTopic={setTopic}>
                    <InfoButton topic="shell" label="Shell" />
                    {withInfo && <InfoPanel content={{ title: 'Carbon — 2p', plain: null }} topic={topic}
                        onClearTopic={() => setTopic(null)} level="explore" />}
                </InfoTopicProvider>
            );
        };
        const { rerender } = render(<Buttons withInfo={false} />);
        fireEvent.click(shell());
        expect(shell()).toHaveAttribute('aria-pressed', 'true');
        expect(shell()).not.toHaveAttribute('aria-controls');
        rerender(<Buttons withInfo />);
        const id = shell().getAttribute('aria-controls');
        expect(id).not.toBeNull();
        expect(document.getElementById(id!)).toContainElement(infoHeading());
        rerender(<Buttons withInfo={false} />);
        expect(shell()).not.toHaveAttribute('aria-controls');
    });

    it('clears the active (i) when the selection changes', () => {
        const { rerender } = render(<Harness selectionKey="6|0|0|1|2|1|0|" />);
        fireEvent.click(shell());
        expect(shell()).toHaveAttribute('aria-pressed', 'true');
        rerender(<Harness selectionKey="6|0|0|1|2|1|1|" />);
        expect(shell()).toHaveAttribute('aria-pressed', 'false');
        expect(orbital()).toHaveAttribute('aria-pressed', 'false');
        expect(chip()).toBeNull();
        expect(within(screen.getByRole('region', { name: 'Info' })).getByText('Carbon — 2p')).toBeInTheDocument();
    });
});

// Task 6 fix round 2 (owner: only one (i) is ever shown pressed): two (i) for one term -- Atoms' ionisation energy has
// one on the panel's line and one on Info's fact -- light only the one pressed.
describe('InfoButton: two (i) for one term (Task 6 fix round 2)', () => {
    const TwoForOneTerm: React.FC<{ selectionKey?: string }> = ({ selectionKey = 'a' }) => {
        const { topic, setTopic } = useInfoTopic(selectionKey);
        return (
            <InfoTopicProvider topic={topic} setTopic={setTopic}>
                <div data-testid="panel"><InfoButton topic="ionisation" label="Ionisation energy" /></div>
                <div data-testid="facts"><InfoButton topic="ionisation" label="Ionisation energy" place="info" /></div>
                <InfoPanel content={{ title: 'Carbon — whole atom', plain: 'Carbon has 6 electrons in 2 shells.' }}
                    topic={topic} onClearTopic={() => setTopic(null)} level="explore" />
            </InfoTopicProvider>
        );
    };
    const inPanel = () => within(screen.getByTestId('panel')).getByRole('button', { name: 'About Ionisation energy' });
    const inFacts = () => within(screen.getByTestId('facts')).getByRole('button', { name: 'About Ionisation energy' });

    it('lights only the pressed one, aria-pressed and aria-controls included', () => {
        render(<TwoForOneTerm />);
        fireEvent.click(inPanel());
        expect(inPanel()).toHaveAttribute('aria-pressed', 'true');
        expect(inPanel()).toHaveClass('is-active');
        expect(inPanel()).toHaveAttribute('aria-controls');
        expect(inFacts()).toHaveAttribute('aria-pressed', 'false');
        expect(inFacts()).not.toHaveClass('is-active');
        expect(inFacts()).not.toHaveAttribute('aria-controls');
        expect(chip()).toHaveTextContent('Ionisation energy');
    });

    it('moves the active state to the other one with the topic unchanged, and pressing the active one clears it', () => {
        render(<TwoForOneTerm />);
        fireEvent.click(inPanel());
        fireEvent.click(inFacts());
        expect(inFacts()).toHaveAttribute('aria-pressed', 'true');
        expect(inPanel()).toHaveAttribute('aria-pressed', 'false');
        expect(chip()).toHaveTextContent('Ionisation energy');
        fireEvent.click(inFacts());
        expect(inFacts()).toHaveAttribute('aria-pressed', 'false');
        expect(inPanel()).toHaveAttribute('aria-pressed', 'false');
        expect(chip()).toBeNull();
    });

    // The pressed (i) is known by its place, so it is still the pressed one after its tab unmounts and remounts it.
    it('keeps the pressed (i) pressed across an unmount and remount', () => {
        const Toggle: React.FC = () => {
            const { topic, setTopic } = useInfoTopic('a');
            const [shown, setShown] = React.useState(true);
            return (
                <InfoTopicProvider topic={topic} setTopic={setTopic}>
                    <button type="button" onClick={() => setShown(value => !value)}>toggle</button>
                    {shown && <InfoButton topic="ionisation" label="Ionisation energy" />}
                    <InfoButton topic="ionisation" label="Ionisation energy" place="info" />
                </InfoTopicProvider>
            );
        };
        render(<Toggle />);
        const panelButton = () => screen.getAllByRole('button', { name: 'About Ionisation energy' })[0];
        fireEvent.click(panelButton());
        fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
        fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
        const [panel, info] = screen.getAllByRole('button', { name: 'About Ionisation energy' });
        expect(panel).toHaveAttribute('aria-pressed', 'true');
        expect(info).toHaveAttribute('aria-pressed', 'false');
    });

    it('leaves no (i) pressed once Back or a new selection clears the topic, nor when the term comes back', () => {
        const { rerender } = render(<TwoForOneTerm />);
        fireEvent.click(inPanel());
        fireEvent.click(screen.getByRole('button', { name: /^Back to/ }));
        expect(inPanel()).toHaveAttribute('aria-pressed', 'false');
        expect(inFacts()).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(inFacts());
        rerender(<TwoForOneTerm selectionKey="b" />);
        expect(chip()).toBeNull();
        expect(inPanel()).toHaveAttribute('aria-pressed', 'false');
        expect(inFacts()).toHaveAttribute('aria-pressed', 'false');
    });
});
