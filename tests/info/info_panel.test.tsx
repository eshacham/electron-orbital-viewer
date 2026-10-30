// tests/info/info_panel.test.tsx -- Task 4: Info explains the selection at the reader's level (plain at Basics and
// Explore, + technical at Advanced, everything at Research); facts appear from their own level; "How this was computed"
// is folded below Research and open at Research; an (i) shows a glossary term and a new selection returns to the
// selection (Review Focus 3); the heading is in a polite live region.
import React from 'react';
import { readFileSync } from 'fs';
import { SHADOWS } from '../../src/design/tokens';
import { resolve } from 'path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import InfoPanel from '../../src/info/InfoPanel';
import InfoButton from '../../src/info/InfoButton';
import { InfoTopicProvider, useInfoTopic } from '../../src/info/useInfoTopic';
import { glossary } from '../../src/info/glossary';
import type { InfoContent } from '../../src/info/info_types';
import type { LearningLevel } from '../../src/levels/levels';
import { absoluteEnergyText, energyDifferenceText, orbitalEnergyText } from '../../src/format/energy';
import { nb } from '../../src/format/text';
import { orbitalEnergyHeldWithEstimate, orbitalEnergyWithEstimate } from '../../src/molecules/orbital_display';

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

    // Owner R26-3: a topic's marks (the MO diagram's notation) follow its plain text as a compact list at every level,
    // each mark typeset (σ<sub>g</sub>) and spoken as the reader hears it.
    it("lists a topic's marks after its plain text, typeset, at every level (owner R26-3)", () => {
        const { container, rerender } = render(<InfoPanel content={content} topic="moDiagram" onClearTopic={() => {}} level="basics" />);
        const list = container.querySelector('dl.info-marks')!;
        expect(list).not.toBeNull();
        const plain = screen.getByText(glossary.moDiagram.plain);
        expect(plain.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(list.querySelectorAll('.info-mark')).toHaveLength(glossary.moDiagram.marks!.length);
        const numbers = [...list.querySelectorAll('.info-mark')].find(dt => dt.textContent === '1, 2, 3')!;
        expect(numbers.nextElementSibling).toHaveSeenText('Counts the orbitals of one kind from the lowest: 1σg, 2σg, 3σg.');
        expect(numbers.nextElementSibling!.querySelector('sub')).toHaveTextContent('g');
        const pair = [...list.querySelectorAll('.info-mark')].find(dt => dt.textContent?.includes('↑↓'))!;
        expect(pair.querySelector('[aria-hidden="true"]')).toHaveTextContent('↑↓');
        expect(pair.querySelector('.visually-hidden')).toHaveTextContent('Up and down arrows');
        rerender(<InfoPanel content={content} topic="moDiagram" onClearTopic={() => {}} level="research" />);
        expect(container.querySelector('dl.info-marks')).not.toBeNull();
        rerender(<InfoPanel content={content} topic="node" onClearTopic={() => {}} level="research" />);
        expect(container.querySelector('dl.info-marks')).toBeNull();
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
            // Review M3, final polish F2: the chevron is a hidden MUI icon, not a glyph in the button's text.
            const back = within(region).getByRole('button', { name: 'Back to Carbon — 2p' });
            expect(back.querySelector('svg[data-testid="ChevronLeftIcon"]')).toHaveAttribute('aria-hidden', 'true');
            expect(back.textContent).not.toContain('‹');
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
    // "E − E(atoms)", "Orbital energy"), because label and value both shrank. Final polish F3: the (i) is held with the
    // label's last word, so a label that wraps never strands it, and no rule sends the value below its label: it shares
    // that row and wraps in its own column. jsdom has no layout: the rules are pinned here, the layout is measured live
    // (tools/design/shoot.mjs metrics.info.factButtons and factLabelAlone).
    it('keeps a fact\'s (i) beside its label, and the value shares their row', () => {
        render(
            <InfoPanel
                content={{ ...content, facts: [{ label: <>Ionisation energy (C → C⁺)<InfoButton topic="ionisation" label="Ionisation energy" place="info" /></>, value: '11.77 eV' }] }}
                topic={null} onClearTopic={() => {}} level="explore"
            />,
        );
        const button = screen.getByRole('button', { name: 'About Ionisation energy' });
        expect(button.closest('dt')?.parentElement).toHaveClass('info-fact');
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        // Final polish F3: the label of an (i) row is the same one-line, no-shrink label as any other, and no longer has a
        // rule of its own that sends the value below it (there is none for the row or its value).
        expect(css).toMatch(/\.info-fact dt\s*\{[^}]*flex:\s*0 1 auto;/);
        expect(css).not.toMatch(/\.info-fact:has\(> dt \.info-button\)\s*\{/);
        expect(css).not.toMatch(/\.info-fact:has\(> dt \.info-button\) > dd/);
    });

    // Review M4: on a phone the way back is a 44 px touch target, like the (i) beside it.
    it('gives "Back to …" a 44 px touch target under the phone query', () => {
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
        expect(phone).toMatch(/\.info-back\s*\{[^}]*min-height:\s*var\(--ql-size-touch\)/);
        expect(css).not.toMatch(/\.info-back::before/);
    });

    // Task 9b (finish review, fix 8): the facts read as a table -- a label never breaks ("Total / energy", "Measured /
    // (NIST)", "HOMO–LUMO / gap"); the value takes the rest of the row and wraps there. Final polish F3 replaced Task 9's
    // "the value goes below when it no longer fits" (it left the label alone on its line): the row is one line of flex,
    // and the label gives way (it may shrink and wrap, its (i) held with its last word) before the value drops below.
    // Task 9b review I2/M3: a label takes its one-line width but never more than the row -- "Ionisation energy (=
    // electron affinity of Br)" overflowed it under nowrap -- so it wraps only when it alone cannot fit; no minimum
    // width, which only took room from the value (right-aligned, it drew no column) and orphaned its last word.
    // jsdom has no layout, so this pins the rule; the layout is measured live (shoot.mjs metrics.info.overflow and
    // factLabelLines -- Task 9 review M10).
    it('keeps a fact label on one line while it fits beside the value, and lets the value wrap', () => {
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = (selector: RegExp) => css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        const dt = rule(/\n\.info-fact dt/);
        expect(dt).toMatch(/width:\s*max-content/);
        expect(dt).toMatch(/max-width:\s*100%/);
        expect(dt).not.toMatch(/white-space:\s*nowrap|min-width/);
        expect(dt).toMatch(/flex:\s*0 1 auto/);
        // The value takes the rest of the row (basis 0, growing) and wraps between its no-break parts; its minimum stays its
        // longest part (no min-width: 0, no break-anywhere), so a number is never split. The label shrinks to make room.
        const dd = rule(/\n\.info-fact dd/);
        expect(dd).toMatch(/flex:\s*1 1 0/);
        expect(dd).not.toMatch(/min-width|overflow-wrap|word-break/);
        expect(rule(/\n\.info-fact/)).toMatch(/flex-wrap:\s*nowrap/);
    });

    // Final polish F3: a long value ("−2976.40 eV (−109.38074 Ha)") used to drop below its label as a whole and leave the label
    // alone on its line. The energy texts are held on one line, so the panel splits a string value at its two break
    // opportunities -- between "… eV" and "(… Ha)", and after a "·" -- into no-break parts, as the Molecules list's
    // EnergyParts does; the value then wraps inside its own column, between the parts, never inside a number.
    describe('a long fact value (final polish F3)', () => {
        const valueOf = (value: string) => {
            cleanup();
            render(<InfoPanel content={{ ...content, facts: [{ label: 'Total energy', value }] }} topic={null} onClearTopic={() => {}} level="research" />);
            return screen.getByText('Total energy').closest('.info-fact')!.querySelector('dd')!;
        };

        it('renders an absolute energy as two no-break parts: "… eV" and "(… Ha)"', () => {
            const dd = valueOf(absoluteEnergyText(-109.38074));
            const parts = [...dd.querySelectorAll('.info-fact-part')].map(part => part.textContent);
            expect(parts).toEqual(['−2976.40\u00A0eV', '(−109.38074\u00A0Ha)']);
            // A real space between the parts is the one place the value may wrap.
            expect(dd.textContent).toBe('−2976.40\u00A0eV (−109.38074\u00A0Ha)');
        });

        it('splits an energy difference and an orbital energy the same way, and never inside a number', () => {
            for (const text of [energyDifferenceText(-0.347), nb(orbitalEnergyText(-0.199))]) {
                const parts = [...valueOf(text).querySelectorAll('.info-fact-part')].map(part => part.textContent ?? '');
                expect(parts).toHaveLength(2);
                expect(parts[0]).toMatch(/\u00A0eV$/);
                expect(parts[1]).toMatch(/^\(.*\u00A0Ha\)$/);
                for (const part of parts) expect(part).not.toMatch(/ /);
            }
        });

        it('breaks after a "·" and nowhere else in a held value', () => {
            const dd = valueOf(nb('1.85 D · 1.85 D experiment'));
            expect([...dd.querySelectorAll('.info-fact-part')].map(part => part.textContent))
                .toEqual(['1.85\u00A0D\u00A0·', '1.85\u00A0D\u00A0experiment']);
        });

        it('leaves a short value, or one with no break opportunity, as plain text', () => {
            expect(valueOf('2').querySelector('.info-fact-part')).toBeNull();
            expect(valueOf(nb('11.77 eV')).querySelector('.info-fact-part')).toBeNull();
        });

        it('holds a label\'s (i) with the label\'s last word, so a label that wraps never leaves the (i) alone', () => {
            cleanup();
            render(<InfoPanel
                content={{ ...content, facts: [{ label: <>Ionisation energy (Fe → Fe⁺)<InfoButton topic="ionisation" label="Ionisation energy" place="info" /></>, value: '8.04 eV' }] }}
                topic={null} onClearTopic={() => {}} level="explore" />);
            const dt = screen.getByRole('button', { name: 'About Ionisation energy' }).closest('dt')!;
            const glue = dt.querySelector('.info-fact-glue')!;
            expect(glue.textContent).toBe('Fe⁺)');
            expect(glue.querySelector('button')).not.toBeNull();
            expect(dt.textContent).toBe('Ionisation energy (Fe → Fe⁺)');
            const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
            expect(css).toMatch(/\.info-fact-glue\s*\{[^}]*white-space:\s*nowrap/);
        });

        it('holds an (i) after an element (the italic R) with that element', () => {
            cleanup();
            render(<InfoPanel
                content={{ ...content, facts: [{ label: <>Bond length <i>R</i><InfoButton topic="ionisation" label="Bond length" place="info" /></>, value: '2.07 a₀' }] }}
                topic={null} onClearTopic={() => {}} level="explore" />);
            const glue = screen.getByRole('button', { name: 'About Bond length' }).closest('.info-fact-glue')!;
            expect(glue.querySelector('i')?.textContent).toBe('R');
        });

        it('lets a label wrap rather than leave itself alone: the label may shrink, the value keeps its parts', () => {
            const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
            expect(css).toMatch(/\.info-fact\s*\{[^}]*flex-wrap:\s*nowrap/);
            expect(css).toMatch(/\.info-fact dt\s*\{[^}]*flex:\s*0 1 auto/);
        });

        it('lets a constructed orbital\'s "upper estimate" wrap onto its own line, in two parts before it', () => {
            const text = orbitalEnergyHeldWithEstimate({ energyHartree: -0.501, constructed: true });
            expect(text).toBe('−13.63\u00A0eV\u00A0(−0.501\u00A0Ha), upper estimate');
            const dd = valueOf(text);
            expect([...dd.querySelectorAll('.info-fact-part')].map(part => part.textContent))
                .toEqual(['−13.63\u00A0eV', '(−0.501\u00A0Ha),', 'upper estimate']);
            // The plain text (the export caption's) is unchanged and unsplit.
            expect(orbitalEnergyWithEstimate({ energyHartree: -0.501, constructed: true })).toBe('−13.63 eV (−0.501 Ha), upper estimate');
        });

        it('lets the value share its label\'s row and wrap in its own column, in CSS', () => {
            const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
            expect(css).toMatch(/\.info-fact-part\s*\{[^}]*white-space:\s*nowrap/);
            // No rule sends a value below its label whole while its parts fit: every row, (i) or not, gives the value the
            // rest of the row (basis 0, growing), and its minimum is its longest part.
            expect(css).toMatch(/\.info-fact dd\s*\{[^}]*flex:\s*1 1 0/);
            expect(css).not.toMatch(/\.info-fact:has\(/);
        });
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

    // Task 9c, final polish F2: a long "Back to …" wrapped centred. The chevron is an icon beside one wrapping label, and
    // the label is left-aligned.
    it('draws the way back\'s chevron as an icon beside one wrapping label, left-aligned', () => {
        render(<InfoPanel content={{ ...content, title: 'Water (H₂O) — electrostatic potential' }} topic="esp" onClearTopic={() => {}} level="explore" />);
        const back = screen.getByRole('button', { name: /^Back to / });
        expect(back.querySelectorAll('.info-back-label')).toHaveLength(1);
        expect(back.textContent).toBe('Back to Water (H₂O) — electrostatic potential');
        expect(back.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        const css = readFileSync(resolve(__dirname, '../../src/info/info.css'), 'utf8');
        expect(css).toMatch(/\.info-back\s*\{[^}]*text-align:\s*left/);
    });
});

