import React from 'react';
import { render, screen } from '@testing-library/react';
import CostPanel from '../../src/admin/CostPanel';
import { daysIn } from '../../src/admin/DailySpendChart';
import type { CostsResponse } from '../../src/jobs/api_types';
import { costsFixture } from '../jobs/api_fixtures';

const withSpend = (): CostsResponse => ({
    ...costsFixture(), spentUsd: 0.10298,
    daily: [{ date: '2026-10-09', usd: 0.1 }, { date: '2026-10-10', usd: 0.00298 }],
});

describe('CostPanel', () => {
    it('labels every figure: spent, reserved, remaining of the cap, projected', () => {
        render(<CostPanel costs={costsFixture()} />);
        const panel = screen.getByRole('region', { name: 'costs' });
        for (const text of ['spent $0.00', 'reserved $0.00', 'remaining $8.80 of the $8.80 cap', 'projected $0.00 by month end']) {
            expect(panel).toHaveTextContent(text);
        }
        expect(panel).toHaveTextContent('No spend settled yet this month.');
        expect(panel).toHaveTextContent(/AWS’s billed figure appears here once/);
    });
    it('draws a bar for each day with spend, each saying what it is', () => {
        const { container } = render(<CostPanel costs={withSpend()} />);
        expect(container.querySelectorAll('.daily-spend-bar')).toHaveLength(2);
        expect(Array.from(container.querySelectorAll('.daily-spend-bar title')).map(t => t.textContent))
            .toEqual(['2026-10-09: spent $0.10', '2026-10-10: spent $0.002980']);
        expect(screen.getByRole('img', { name: 'daily spend in 2026-10' })).toBeInTheDocument();
        expect(screen.getByText('Daily spend, 2026-10 (settled jobs; spent)')).toBeInTheDocument();
    });
    it("puts AWS's billed figure beside the meter, a day behind", () => {
        render(<CostPanel costs={{ ...withSpend(), billing: { usd: 0.12, through: '2026-10-09' } }} />);
        expect(screen.getByText('AWS billed (Cost Explorer, a day behind, as of 2026-10-09): billed $0.12; our meter: spent $0.10.')).toBeInTheDocument();
    });
    it('leaves the date out when the billing job did not say how far it reached (M8)', () => {
        render(<CostPanel costs={{ ...withSpend(), billing: { usd: 0.12 } as CostsResponse['billing'] }} />);
        expect(screen.getByText('AWS billed (Cost Explorer, a day behind): billed $0.12; our meter: spent $0.10.')).toBeInTheDocument();
    });
    it('knows the length of each month', () => {
        expect([daysIn('2026-10'), daysIn('2026-02'), daysIn('2028-02')]).toEqual([31, 28, 29]);
    });
    it('says the meter books storage and delivery, which Cost Explorer’s compute figure leaves out (Phase 6C)', () => {
        render(<CostPanel costs={costsFixture()} />);
        expect(screen.getByRole('region', { name: 'costs' })).toHaveTextContent(/books each settled AWS job’s result storage and delivery/);
    });
});
