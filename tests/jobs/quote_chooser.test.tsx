import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import QuoteChooser from '../../src/components/QuoteChooser';
import type { Quote, QuoteLine } from '../../src/jobs/api_types';
import { formatUsd } from '../../src/jobs/format';
import { previewFixture } from './api_fixtures';

/** Phase 6C: the owner's two priced options, side by side, and an approval that names its own maximum. */
const quoteOf = (name: Parameters<typeof previewFixture>[0]): Quote => {
    const decision = previewFixture(name).decision;
    if (!decision.ok) throw new Error(`${name} has no quote`);
    return decision.quote;
};

/** The chosen (first) option's priced lines, for a preview fixture whose first option is available. */
const linesOf = (name: Parameters<typeof previewFixture>[0]): QuoteLine[] => {
    const option = quoteOf(name).options[0];
    if (!option.available) throw new Error(`${name}'s first option has no lines`);
    return option.lines;
};

describe('QuoteChooser', () => {
    it('shows Spot and on-demand side by side as a named radio group, each with its estimate, maximum and times', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const group = screen.getByRole('radiogroup', { name: 'price options' });
        const spot = within(group).getByRole('radio', { name: /^Spot: estimated \$0\.002475, up to \$0\.02$/ });
        const onDemand = within(group).getByRole('radio', { name: /^On-demand: estimated \$0\.003832, up to \$0\.02$/ });
        expect(spot).toBeChecked();
        expect(onDemand).not.toBeChecked();
        const card = screen.getByTestId('quote-option-spot');
        for (const text of ['estimated $0.002475', 'up to $0.02', 'predicted 16 s', 'time limit 10 min 00 s', 'up to 3 attempts',
            'A Spot interruption restarts the job from scratch']) {
            expect(card).toHaveTextContent(text);
        }
        expect(screen.getByTestId('quote-option-on-demand')).not.toHaveTextContent('interruption');
    });
    it('approves the chosen option, and the button names its maximum', () => {
        const onApprove = jest.fn();
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={onApprove} />);
        fireEvent.click(screen.getByRole('button', { name: 'Approve up to $0.02 and run' }));
        expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ option: 'spot', quoteId: expect.stringMatching(/^[0-9a-f]{64}$/) }));
        fireEvent.click(screen.getByRole('radio', { name: /^On-demand/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Approve up to $0.02 and run' }));
        expect(onApprove).toHaveBeenLastCalledWith(expect.objectContaining({ option: 'on-demand' }));
    });
    it('says a retry is approved too', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="retry" disabled={false} onApprove={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'Approve up to $0.02 and retry' })).toBeEnabled();
    });
    // Ruling P13: the four-column table clipped its notes in a 300 px panel; the lines are stacked now.
    it('itemises the chosen option in its details: compute, storage, delivery and the platform fee', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const details = screen.getByText('What makes up the price').closest('details') as HTMLElement;
        expect(details).not.toHaveAttribute('open');
        const list = within(details).getByRole('list', { name: 'Spot price, line by line' });
        const expected = linesOf('preview_aws').map(line =>
            `${line.label}estimated ${formatUsd(line.estimateUsd)} · up to ${formatUsd(line.maximumUsd)}${line.note}`);
        expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual(expected);
    });
    it("lists recipe B's frequency check in the compute line, and its frequencies.json in the storage line", () => {
        // Phase 6D spec §10: the quote's compute line includes the check, and the details say so.
        render(<QuoteChooser quote={quoteOf('preview_aws_optimise')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const details = screen.getByText('What makes up the price').closest('details') as HTMLElement;
        const items = within(within(details).getByRole('list', { name: 'Spot price, line by line' })).getAllByRole('listitem');
        expect(items[0]).toHaveTextContent(/The prediction includes the frequency check \(confirms a minimum\): [\d.]+ s\.$/);
        expect(items[1]).toHaveTextContent("The results include the frequency check's frequencies.json.");
        expect(quoteOf('preview_aws_optimise').options[0].sizing?.parts?.frequencySeconds).toBeGreaterThan(0);
    });
    it("each line's note is its own block, never clipped", () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const details = screen.getByText('What makes up the price').closest('details') as HTMLElement;
        const items = within(within(details).getByRole('list', { name: 'Spot price, line by line' })).getAllByRole('listitem');
        expect(items).toHaveLength(linesOf('preview_aws').length);
        for (const item of items) expect(item.querySelector('.quote-line-note')).not.toBeNull();
        expect(document.querySelector('table')).toBeNull();
    });
    // D4: jsdom never loads style.css (tests/style_stub.ts stubs it to {}), so the width check reads the
    // source directly -- the same pattern as tests/a11y/panel_contrast.test.ts -- instead of getComputedStyle.
    describe('the price breakdown fits any panel width (Ruling P13 / D4)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        function rule(selector: string): string {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = new RegExp(`^\\s*${escaped} \\{`, 'm').exec(css);
            if (!match) throw new Error(`No rule for ${selector}`);
            return css.slice(match.index, css.indexOf('}', match.index));
        }
        it('no .quote-lines rule forces a line onto one row with white-space: nowrap', () => {
            expect(rule('.quote-lines')).not.toContain('white-space: nowrap');
        });
        it('.quote-line-note wraps anywhere, so a long note never overflows the panel', () => {
            expect(rule('.quote-line-note')).toContain('overflow-wrap: anywhere');
        });
    });
    it('shows Spot as unavailable, with its reason, when the run is predicted past the Spot limit', () => {
        render(<QuoteChooser quote={quoteOf('preview_spot_unavailable')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const spot = screen.getByRole('radio', { name: 'Spot (unavailable)' });
        expect(spot).toBeDisabled();
        expect(screen.getByTestId('quote-option-spot')).toHaveTextContent(/Unavailable: Spot is offered only for runs predicted at 60 min or less; this one is predicted at 62 min/);
        expect(screen.getByRole('radio', { name: /^On-demand/ })).toBeChecked();
        // Review minor 9: the reason is tied to its radio, so a screen reader hears it with the name.
        expect(spot).toHaveAccessibleDescription(/^Unavailable: Spot is offered only/);
    });
    it('shows a quote past the monthly cap, but will not approve it, and says the cap would need raising', () => {
        render(<QuoteChooser quote={quoteOf('preview_capped')} verb="run" disabled={false} onApprove={jest.fn()} />);
        expect(screen.getByTestId('quote-option-spot')).toHaveTextContent('up to $0.02');
        expect(screen.getByRole('button', { name: 'Approve up to $0.02 and run' })).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent(/the monthly cap would need raising to approve it/);
        // Review minor 9: "over this month's cap" is part of each radio's description, not only a visual line.
        expect(screen.getByRole('radio', { name: /^Spot/ })).toHaveAccessibleDescription(/Over this month’s cap/);
    });
    // Review minor 4: Spot's maximum is near on-demand's because it allows for 3 attempts; say so plainly.
    it('says why Spot’s maximum is near on-demand’s', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={jest.fn()} />);
        expect(screen.getByTestId('quote-option-spot')).toHaveTextContent(
            'Spot’s maximum assumes all 3 attempts run to the time limit; most Spot runs finish in one, near the estimate.');
        expect(screen.getByRole('radio', { name: /^Spot/ })).toHaveAccessibleDescription(/most Spot runs finish in one/);
    });
    it('cannot approve while disabled (paused, busy or signed out)', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled onApprove={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'Approve up to $0.02 and run' })).toBeDisabled();
    });
    it('on This Mac, offers one free run and says what AWS would cost, for reference only', () => {
        const onApprove = jest.fn();
        render(<QuoteChooser quote={quoteOf('preview_ok')} verb="run" disabled={false} onApprove={onApprove} />);
        expect(screen.getByRole('radio', { name: 'This Mac: free' })).toBeChecked();
        expect(screen.getByTestId('quote-option-local')).toHaveTextContent('Fargate estimate 16 s; no time limit on This Mac');
        expect(screen.getByText(/^On AWS this would cost/)).toHaveTextContent(
            'On AWS this would cost: Spot estimated $0.002475, up to $0.02; On-demand estimated $0.003832, up to $0.02.');
        fireEvent.click(screen.getByRole('button', { name: 'Run on This Mac (free)' }));
        expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ option: 'local' }));
    });
});
