import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import QuoteChooser from '../../src/components/QuoteChooser';
import type { Quote } from '../../src/jobs/api_types';
import { previewFixture } from './api_fixtures';

/** Phase 6C: the owner's two priced options, side by side, and an approval that names its own maximum. */
const quoteOf = (name: Parameters<typeof previewFixture>[0]): Quote => {
    const decision = previewFixture(name).decision;
    if (!decision.ok) throw new Error(`${name} has no quote`);
    return decision.quote;
};

describe('QuoteChooser', () => {
    it('shows Spot and on-demand side by side as a named radio group, each with its estimate, maximum and times', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const group = screen.getByRole('radiogroup', { name: 'price options' });
        const spot = within(group).getByRole('radio', { name: /^Spot: estimated \$0\.002452, up to \$0\.02$/ });
        const onDemand = within(group).getByRole('radio', { name: /^On-demand: estimated \$0\.003791, up to \$0\.02$/ });
        expect(spot).toBeChecked();
        expect(onDemand).not.toBeChecked();
        const card = screen.getByTestId('quote-option-spot');
        for (const text of ['estimated $0.002452', 'up to $0.02', 'predicted 16 s', 'time limit 10 min 00 s', 'up to 3 attempts',
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
    it('itemises the chosen option in its details: compute, storage, delivery and the platform fee', () => {
        render(<QuoteChooser quote={quoteOf('preview_aws')} verb="run" disabled={false} onApprove={jest.fn()} />);
        const details = screen.getByText('What makes up the price').closest('details') as HTMLElement;
        expect(details).not.toHaveAttribute('open');
        const table = within(details).getByRole('table', { name: 'Spot price, line by line' });
        expect(within(table).getAllByRole('row').map(row => row.textContent)).toEqual([
            'ItemEstimatedUp toHow',
            expect.stringMatching(/^Compute \(AWS Fargate\)\$0\.0006300\$0\.02Estimate: one run/),
            expect.stringMatching(/^Result storage \(S3, 12 months\)\$0\.0004680\$0\.0008560About 1\.5 MB/),
            expect.stringMatching(/^Delivery \(CloudFront, 10 full downloads\)\$0\.001354\$0\.002548/),
            'Platform fee$0.00$0.00No platform fee yet.',
        ]);
    });
    it('shows Spot as unavailable, with its reason, when the run is predicted past the Spot limit', () => {
        render(<QuoteChooser quote={quoteOf('preview_spot_unavailable')} verb="run" disabled={false} onApprove={jest.fn()} />);
        expect(screen.getByRole('radio', { name: 'Spot (unavailable)' })).toBeDisabled();
        expect(screen.getByTestId('quote-option-spot')).toHaveTextContent(/Unavailable: Spot is offered only for runs predicted at 60 min or less; this one is predicted at 18\.5 h/);
        expect(screen.getByRole('radio', { name: /^On-demand/ })).toBeChecked();
    });
    it('shows a quote past the monthly cap, but will not approve it, and says the cap would need raising', () => {
        render(<QuoteChooser quote={quoteOf('preview_spot_unavailable')} verb="run" disabled={false} onApprove={jest.fn()} />);
        expect(screen.getByTestId('quote-option-on-demand')).toHaveTextContent('up to $41.40');
        expect(screen.getByRole('button', { name: 'Approve up to $41.40 and run' })).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent(/the monthly cap would need raising to approve it/);
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
            'On AWS this would cost: Spot estimated $0.002452, up to $0.02; On-demand estimated $0.003791, up to $0.02.');
        fireEvent.click(screen.getByRole('button', { name: 'Run on This Mac (free)' }));
        expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ option: 'local' }));
    });
});
