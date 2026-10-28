// tests/info/info_panel.test.tsx -- Task 4: Info explains the selection at the reader's level (plain at Basics and
// Explore, + technical at Advanced, everything at Research); facts appear from their own level; "How this was computed"
// is folded below Research and open at Research; an (i) shows a glossary term and a new selection returns to the
// selection (Review Focus 3); the heading is in a polite live region.
import React from 'react';
import { readFileSync } from 'fs';
import { SHADOWS } from '../../src/design/tokens';
import { resolve } from 'path';
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
        // Task 9 review I3: the heading's hidden description repeats the title, so the visible title is the one asked for.
        expect(screen.getByText('Carbon — 2p', { selector: '.info-title' })).toBeInTheDocument();
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

    // Task 7a fix round 1 (ruling, every mode): the spec orders Info as name, plain explanation, key facts at the level --
    // so the facts sit straight after the plain text and before the technical text, and never fall below the fold.
    it('puts the facts after the plain text and before the technical text', () => {
        renderAt('research');
        const plain = screen.getByText(content.plain as string);
        const facts = screen.getByText('Electrons').closest('dl')!;
        const technical = screen.getByText(content.technical as string);
        expect(plain.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(facts.compareDocumentPosition(technical) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(technical.compareDocumentPosition(computed()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // Task 7b: notes (what qualifies the numbers) follow the facts at every level, before the technical text; fix round 1
    // (I6): one paragraph per note, never one wall.
    it('puts the notes after the facts and before the technical text, one paragraph each, at every level', () => {
        const withNotes = { ...content, notes: ['A note on the numbers.', 'A note on the picture.'] };
        const { rerender } = render(<InfoPanel content={withNotes} topic={null} onClearTopic={() => {}} level="research" />);
        const [first, second] = [screen.getByText('A note on the numbers.'), screen.getByText('A note on the picture.')];
        expect(first.tagName).toBe('P');
        expect(first).not.toBe(second);
        expect(screen.getByText('Electrons').closest('dl')!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(second.compareDocumentPosition(screen.getByText(content.technical as string)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        rerender(<InfoPanel content={withNotes} topic={null} onClearTopic={() => {}} level="basics" />);
        expect(screen.getByText('A note on the picture.')).toBeInTheDocument();
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

    // Review M5: the heading takes focus after an (i) or Back, so it sits outside the live region -- a reader hears
    // each change once, by focus or by the live region, never both.
    it('is a region named by its "Info" heading, which is not inside the polite live region', () => {
        renderAt('explore');
        const heading = screen.getByRole('heading', { level: 2, name: 'Info' });
        expect(screen.getByRole('region', { name: 'Info' })).toContainElement(heading);
        expect(heading.closest('[aria-live]')).toBeNull();
        const live = document.querySelector('[aria-live="polite"]');
        expect(live).not.toBeNull();
        expect(live).toHaveTextContent(/^$/);
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
            // Review M3: the "‹" is decoration, hidden from the button's accessible name.
            const back = within(region).getByRole('button', { name: 'Back to Carbon — 2p' });
            expect(back.querySelector('[aria-hidden="true"]')).toHaveTextContent('‹');
            fireEvent.click(back);
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

        // Review M5: one announcement per change -- the live region for a change focus does not carry.
        it('announces a new selection and a cleared (i) in the live region, and stays quiet when focus moves', () => {
            const live = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
            const DynamicTitle: React.FC<{ selectionKey: string; title: string }> = ({ selectionKey, title }) => {
                const { topic, setTopic } = useInfoTopic(selectionKey);
                return (
                    <InfoTopicProvider topic={topic} setTopic={setTopic}>
                        <InfoButton topic="subshell" label="Subshell" />
                        <InfoPanel content={{ ...content, title }} topic={topic} onClearTopic={() => setTopic(null)} level="explore" />
                    </InfoTopicProvider>
                );
            };
            const { rerender } = render(<DynamicTitle selectionKey="a" title="Carbon — 2p" />);
            expect(live()).toHaveTextContent(/^$/);
            // The (i) moves focus to the heading, which reads the change: the live region stays quiet.
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
            expect(live()).toHaveTextContent(/^$/);
            // Pressing the active (i) again keeps focus there, so the live region says what Info explains now.
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            expect(live()).toHaveTextContent('Info: Carbon — 2p');
            // A new selection: no focus move, announced.
            rerender(<DynamicTitle selectionKey="b" title="Carbon — 2s" />);
            expect(live()).toHaveTextContent('Info: Carbon — 2s');
            // Back moves focus to the heading: quiet again.
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            fireEvent.click(screen.getByRole('button', { name: 'Back to Carbon — 2s' }));
            expect(screen.getByRole('heading', { level: 2, name: 'Info' })).toHaveFocus();
            expect(live()).toHaveTextContent(/^$/);
        });

        // Task 8: on a phone the caption under the header (aria-live) names each new selection; Info leaves that to it,
        // so a reader hears a change once -- but still says what it explains when its topic changes.
        it('leaves a new selection to the phone caption when told to, and still announces a topic change', () => {
            const live = () => document.querySelector('.info-section [aria-live="polite"]') as HTMLElement;
            const PhoneInfo: React.FC<{ selectionKey: string; title: string }> = ({ selectionKey, title }) => {
                const { topic, setTopic } = useInfoTopic(selectionKey);
                return (
                    <InfoTopicProvider topic={topic} setTopic={setTopic}>
                        <InfoButton topic="subshell" label="Subshell" />
                        <InfoPanel content={{ ...content, title }} topic={topic} onClearTopic={() => setTopic(null)} level="explore"
                            announceSelection={false} />
                    </InfoTopicProvider>
                );
            };
            const { rerender } = render(<PhoneInfo selectionKey="a" title="Carbon — 2p" />);
            rerender(<PhoneInfo selectionKey="b" title="Carbon — 2s" />);
            expect(live()).toHaveTextContent(/^$/);
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            expect(live()).toHaveTextContent('Info: Carbon — 2s');
            // Fix round 1 (M5): a topic open, then a new selection (from the header nav) -- Info goes back to the selection
            // without a word; the caption says it.
            fireEvent.click(screen.getByRole('button', { name: 'About Subshell' }));
            rerender(<PhoneInfo selectionKey="c" title="Carbon — 3s" />);
            // Task 9 review I3: the heading's hidden description repeats the title, so the visible title is the one asked for.
            expect(screen.getByText('Carbon — 3s', { selector: '.info-title' })).toBeInTheDocument();
            expect(live()).toHaveTextContent(/^$/);
        });

        // Task 9 fix round 1 (SR pass): a molecule's first load said Info's title twice -- the index name while its meta
        // loaded, then the real title. A provisional title (content still loading) is never announced; the real one that
        // follows it is, once -- on a first load and when one molecule replaces another.
        it('announces a waited-for selection once: never its provisional title, then its real one', () => {
            const live = () => document.querySelector('.info-section [aria-live="polite"]') as HTMLElement;
            const Loading: React.FC<{ title: string; provisional?: boolean }> = ({ title, provisional }) => (
                <InfoPanel content={{ ...content, title, provisional }} topic={null} onClearTopic={() => {}} level="explore" />
            );
            const { rerender } = render(<Loading title="Molecules" provisional />);
            rerender(<Loading title="Water" provisional />);
            expect(live()).toHaveTextContent(/^$/);
            rerender(<Loading title="Water (H₂O) — electron density" />);
            // Said with plain digits, as spoken names are (Task 8 ruling M6).
            expect(live()).toHaveTextContent(/^Info: Water \(H2O\) — electron density$/);
            rerender(<Loading title="Ammonia" provisional />);
            expect(live()).toHaveTextContent(/^Info: Water \(H2O\) — electron density$/);
            rerender(<Loading title="Ammonia (NH₃) — electron density" />);
            expect(live()).toHaveTextContent(/^Info: Ammonia \(NH3\) — electron density$/);
        });

        // Task 9 fix round 1: "Back to …" names the selection it returns to, with plain digits (ruling: spoken names keep
        // ASCII digits -- screen readers say Unicode subscripts inconsistently).
        it('names the way back after the selection, with plain digits', () => {
            const Water: React.FC = () => {
                const { topic, setTopic } = useInfoTopic('water');
                return (
                    <InfoTopicProvider topic={topic} setTopic={setTopic}>
                        <InfoButton topic="pointGroup" label="Point group" />
                        <InfoPanel content={{ ...content, title: 'Water (H₂O) — electron density' }} topic={topic}
                            onClearTopic={() => setTopic(null)} level="explore" />
                    </InfoTopicProvider>
                );
            };
            render(<Water />);
            fireEvent.click(screen.getByRole('button', { name: 'About Point group' }));
            expect(screen.getByRole('button', { name: 'Back to Water (H2O) — electron density' })).toBeInTheDocument();
        });

        // Task 9 review I3 (ruling 193): Back moves focus to Info's heading, so the heading must say what it is back to --
        // its accessible description is the selection's title, with plain digits, while no topic is open.
        it('lands Back on a heading that names the selection', () => {
            const Water: React.FC = () => {
                const { topic, setTopic } = useInfoTopic('water');
                return (
                    <InfoTopicProvider topic={topic} setTopic={setTopic}>
                        <InfoButton topic="pointGroup" label="Point group" />
                        <InfoPanel content={{ ...content, title: 'Water (H₂O) — 1b₁ orbital' }} topic={topic}
                            onClearTopic={() => setTopic(null)} level="explore" />
                    </InfoTopicProvider>
                );
            };
            render(<Water />);
            fireEvent.click(screen.getByRole('button', { name: 'About Point group' }));
            fireEvent.click(screen.getByRole('button', { name: 'Back to Water (H2O) — 1b1 orbital' }));
            const heading = screen.getByRole('heading', { level: 2, name: 'Info' });
            expect(heading).toHaveFocus();
            expect(heading).toHaveAccessibleDescription('Water (H2O) — 1b1 orbital');
            // While a topic is open the heading's chip names it, and the description is not the selection's.
            fireEvent.click(screen.getByRole('button', { name: 'About Point group' }));
            expect(screen.getByRole('heading', { level: 2 })).not.toHaveAttribute('aria-describedby');
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

    // Task 9 (addendum item 3): live, a long label's (i) dropped under the label on desktop ("Ionisation energy (C → C⁺)",
    // "E − E(atoms)", "Orbital energy"), because label and value both shrank. A label carrying an (i) must not shrink,
    // so the (i) stays beside it; the value wraps below instead. jsdom has no layout: the rule is pinned here, the
    // layout is measured live (tools/design/shoot.mjs metrics.info.factButtons).
    it('keeps a fact\'s (i) beside its label: that label never shrinks, the value wraps below it', () => {
        render(
            <InfoPanel
                content={{ ...content, facts: [{ label: <>Ionisation energy (C → C⁺)<InfoButton topic="ionisation" label="Ionisation energy" place="info" /></>, value: '11.77 eV' }] }}
                topic={null} onClearTopic={() => {}} level="explore"
            />,
        );
        const button = screen.getByRole('button', { name: 'About Ionisation energy' });
        expect(button.closest('dt')?.parentElement).toHaveClass('info-fact');
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        expect(css).toMatch(/\.info-fact:has\(> dt \.info-button\)\s*\{[^}]*flex-wrap:\s*wrap;/);
        expect(css).toMatch(/\.info-fact:has\(> dt \.info-button\) > dt\s*\{[^}]*flex:\s*none;/);
    });

    // Review M4: on a phone the way back is a 44 px touch target, like the (i) beside it.
    it('gives "Back to …" a 44 px touch target under the phone query', () => {
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
        expect(phone).toMatch(/\.info-back\s*\{[^}]*min-height:\s*var\(--ql-size-touch\)/);
        expect(css).not.toMatch(/\.info-back::before/);
    });

    // Task 9b (finish review, fix 8): the facts read as a table -- a label never breaks ("Total / energy", "Measured /
    // (NIST)", "HOMO–LUMO / gap"); the value takes the rest of the row and wraps there. Task 9's rule for a label with
    // its (i) still holds: that label keeps its width and its (i), and the value goes below when it no longer fits.
    // Task 9b review I2/M3: a label takes its one-line width but never more than the row -- "Ionisation energy (=
    // electron affinity of Br)" overflowed it under nowrap -- so it wraps only when it alone cannot fit; no minimum
    // width, which only took room from the value (right-aligned, it drew no column) and orphaned its last word.
    it('keeps every fact label on one line while it fits the row, and lets the value wrap', () => {
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = (selector: RegExp) => css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        const dt = rule(/\n\.info-fact dt/);
        expect(dt).toMatch(/width:\s*max-content/);
        expect(dt).toMatch(/max-width:\s*100%/);
        expect(dt).not.toMatch(/white-space:\s*nowrap|min-width/);
        expect(dt).toMatch(/flex:\s*none/);
        // The value takes the rest of the row (basis 0, growing) and wraps at its own breaks; its minimum stays its longest
        // unbreakable run (no min-width: 0, no break-anywhere), so a value held on one line ("−2976.40 eV (−109.38074 Ha)")
        // that cannot fit beside its label goes below it whole rather than splitting a number.
        const dd = rule(/\n\.info-fact dd/);
        expect(dd).toMatch(/flex:\s*1 1 0/);
        expect(dd).not.toMatch(/min-width|overflow-wrap|word-break/);
        expect(rule(/\n\.info-fact/)).toMatch(/flex-wrap:\s*wrap/);
        expect(css).toMatch(/\.info-fact:has\(> dt \.info-button\) > dd\s*\{[^}]*flex:\s*0 1 auto;/);
    });

    // Task 9b (finish review, fix 6): the pressed (i) wears Deep Space's selection halo, as the strip's selected tile
    // does -- in dark only; Light Clean has no glow (DESIGN.md), its solid accent already reads.
    it('gives the pressed (i) the Deep Space selection halo, in dark only', () => {
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        expect(css).toMatch(/\.info-button\.is-active,\s*\.info-button\.is-active:hover\s*\{[^}]*box-shadow:\s*var\(--ql-shadow-selected-halo\)/);
        // Task 9b review M7 (ruling): the strip tile's own soft, blurred glow -- DESIGN.md's Deep Selection halo -- not
        // the hard 2 px ring 9b gave it.
        expect(SHADOWS.dark['selected-halo']).toBe(SHADOWS.dark['selected-tile']);
        expect(SHADOWS.dark['selected-halo']).toBe('0 0 12px 1px rgba(31,182,245,.5)');
        expect(SHADOWS.light['selected-halo']).toBe('none');
    });

    // Task 9c: a long "‹ Back to …" wrapped centred, with the chevron alone on its line. The chevron is held to "Back" by a
    // no-break space inside the one wrapping label, and the label is left-aligned.
    it('keeps the way back\'s chevron with its first word, and a wrapped label left-aligned', () => {
        render(<InfoPanel content={{ ...content, title: 'Water (H₂O) — electrostatic potential' }} topic="esp" onClearTopic={() => {}} level="explore" />);
        const back = screen.getByRole('button', { name: /^Back to / });
        expect(back.children).toHaveLength(1);
        expect(back.textContent).toBe('‹\u00A0Back to Water (H₂O) — electrostatic potential');
        expect(back.querySelector('[aria-hidden="true"]')).toHaveTextContent('‹');
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        expect(css).toMatch(/\.info-back\s*\{[^}]*text-align:\s*left/);
    });
});

