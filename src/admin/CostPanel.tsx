import React from 'react';
import { LinearProgress, Typography } from '@mui/material';
import DailySpendChart from './DailySpendChart';
import { formatUsd, money } from '../jobs/format';
import type { CostsResponse } from '../jobs/api_types';

/**
 * The month's money (spec §9.4): our meter's spent, reserved and remaining
 * of the cap; the projection with its formula; the daily chart; and AWS's
 * own billed figure beside the meter once the billing job has run -- the
 * check that the prices the meter uses are right.
 */
const CostPanel: React.FC<{ costs: CostsResponse; width?: number }> = ({ costs, width = 420 }) => {
    const committed = costs.spentUsd + costs.reservedUsd;
    const share = costs.capUsd > 0 ? Math.min(100, (committed / costs.capUsd) * 100) : 100;
    return (
        <section className="cost-panel" aria-label="costs">
            <Typography variant="h6" component="h2">Compute, {costs.month}</Typography>
            <LinearProgress variant="determinate" value={share} aria-label="share of the monthly cap committed" />
            <ul className="cost-figures">
                <li>{money('spent', costs.spentUsd)}</li>
                <li>{money('reserved', costs.reservedUsd)} (the worst case of everything queued or running)</li>
                <li>{money('remaining', costs.remainingUsd)} of the {formatUsd(costs.capUsd)} cap</li>
                <li>{money('projected', costs.projectionUsd)} by month end: spent × days in the month ÷ days elapsed, plus the predicted cost of everything queued or running</li>
            </ul>
            <DailySpendChart month={costs.month} daily={costs.daily} width={width} />
            <Typography variant="body2" className="cost-billed">
                {costs.billing
                    ? `AWS billed (Cost Explorer, a day behind${costs.billing.through ? `, as of ${costs.billing.through}` : ''}): ${money('billed', costs.billing.usd)}; our meter: ${money('spent', costs.spentUsd)}.`
                    : 'AWS’s billed figure appears here once the AWS stack’s billing job has run (Phase 6B-3); until then only our meter is shown.'}
            </Typography>
            {/* Phase 6C: a quoted job books its storage (12 months) and delivery (10 downloads) when it settles. */}
            <Typography variant="body2" className="cost-billed">
                Since quotes (Phase 6C), the meter also books each settled AWS job’s result storage and delivery, which Cost
                Explorer’s compute figure leaves out; a job’s charge never passes the maximum its owner approved.
            </Typography>
            <Typography variant="caption">Prices retrieved {costs.pricesRetrieved} (Fargate, us-east-1, Linux/ARM).</Typography>
        </section>
    );
};

export default CostPanel;
