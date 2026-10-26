import React, { useId, useState } from 'react';
import { Button } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatUsd } from '../jobs/format';
import type { CostsResponse } from '../jobs/api_types';
import { billingGap, daysIn, monthLabel } from './jobs_month';
import { utcDay } from './job_text';

const share = (usd: number, cap: number) => (cap > 0 ? Math.min(100, Math.max(0, (usd / cap) * 100)) : 0);

/**
 * The month's money on one line, each figure named: what is still
 * available of the cap (with a thin bar of what is charged and what is held
 * for running and queued jobs), charged, held, the projection, and AWS's own
 * billed figure against the meter with the gap between them. Why the two
 * differ is said only as far as the app knows, behind one disclosure.
 */
const BudgetStrip: React.FC<{ costs: CostsResponse }> = ({ costs }) => {
    const [open, setOpen] = useState(false);
    // A phone shows the available figure and its bar; the other figures fold behind this (CSS shows them always above it).
    const [more, setMore] = useState(false);
    const noteId = useId();
    const moreId = useId();
    const name = monthLabel(costs.month);
    const gap = billingGap(costs);
    const charged = share(costs.spentUsd, costs.capUsd);
    const held = Math.min(100 - charged, share(costs.reservedUsd, costs.capUsd));
    const monthEnd = `${daysIn(costs.month)} ${name.slice(0, 3)}`;
    const noteLabel = gap ? 'Why AWS billed and the meter differ' : 'About these figures';
    return (
        <>
            <section className={`admin-strip ql-tabular${more ? '' : ' is-folded'}`} aria-label={`Budget, ${name}`} id={moreId}>
                <div className="admin-strip-cell admin-strip-available">
                    <span className="admin-strip-line">
                        <span className="admin-strip-label">Available</span>{' '}
                        <strong className="admin-strip-value">{formatUsd(costs.remainingUsd)}</strong>{' '}
                        <span className="admin-strip-label">of {formatUsd(costs.capUsd)}</span>
                    </span>
                    <span className="admin-cap-bar" role="img"
                        aria-label={`Charged ${formatUsd(costs.spentUsd)} and held ${formatUsd(costs.reservedUsd)} of the ${formatUsd(costs.capUsd)} cap`}>
                        <span className="admin-cap-charged" style={{ width: `${charged}%` }} />
                        <span className="admin-cap-held" style={{ left: `${charged}%`, width: `${held}%` }} />
                    </span>
                    <Button size="small" variant="outlined" className="admin-strip-more" aria-expanded={more} aria-controls={moreId}
                        endIcon={<ExpandMoreIcon className={more ? 'is-open' : undefined} fontSize="small" />} onClick={() => setMore(m => !m)}>
                        Charged, held, projected, AWS billed
                    </Button>
                </div>
                <div className="admin-strip-cell">
                    <span className="admin-swatch admin-swatch-charged" aria-hidden="true" />
                    <span className="admin-strip-label">Charged</span>{' '}
                    <strong className="admin-strip-value">{formatUsd(costs.spentUsd)}</strong>
                </div>
                <div className="admin-strip-cell">
                    <span className="admin-swatch admin-swatch-held" aria-hidden="true" />
                    <span className="admin-strip-label">Held</span>{' '}
                    <strong className="admin-strip-value">{formatUsd(costs.reservedUsd)}</strong>{' '}
                    <span className="admin-strip-label">for running jobs</span>
                </div>
                <div className="admin-strip-cell">
                    <span className="admin-strip-label">Projected</span>{' '}
                    <strong className="admin-strip-value">{formatUsd(costs.projectionUsd)}</strong>{' '}
                    <span className="admin-strip-label">by {monthEnd}</span>
                </div>
                <div className="admin-strip-cell admin-strip-billing">
                    {gap ? (
                        <span className="admin-strip-line">
                            <span className="admin-strip-label">AWS billed</span>{' '}
                            <strong className="admin-strip-value">{formatUsd(gap.billedUsd)}</strong>{' '}
                            {gap.through && <span className="admin-strip-label">to {utcDay(gap.through)}</span>}
                            <span className="admin-strip-label"> · meter {formatUsd(gap.meterUsd)} · </span>
                            <span className={gap.gapUsd === 0 ? 'admin-strip-label' : 'admin-strip-gap'}>
                                {gap.gapUsd === 0 ? 'matches the meter'
                                    : `${formatUsd(Math.abs(gap.gapUsd))} ${gap.gapUsd > 0 ? 'more' : 'less'} than the meter`}
                            </span>
                        </span>
                    ) : (
                        <span className="admin-strip-line"><span className="admin-strip-label">AWS billed: not yet reported</span></span>
                    )}
                    <Button size="small" className="admin-strip-why" aria-expanded={open} aria-controls={noteId}
                        endIcon={<ExpandMoreIcon className={open ? 'is-open' : undefined} fontSize="small" />} onClick={() => setOpen(o => !o)}>
                        {gap ? 'Why they differ' : 'About these figures'}
                    </Button>
                </div>
            </section>
            {open && (
                <div className="admin-strip-note" id={noteId} role="region" aria-label={noteLabel}>
                    {gap ? (
                        <ul>
                            <li>Cost Explorer reports a day behind, so AWS’s figure runs only {gap.through ? `to ${utcDay(gap.through)}` : 'to its last update'}; the meter counts every job settled this month.</li>
                            <li>The meter books each settled AWS job’s result storage and delivery (12 months, 10 downloads) when it settles; Cost Explorer’s compute figure leaves those out.</li>
                            <li>AWS also bills the service’s fixed costs, which sit outside the meter.</li>
                            <li>The app does not split the gap further: it knows these causes, not how much of the gap each makes.</li>
                        </ul>
                    ) : (
                        <p>AWS’s own billed figure appears here once the AWS stack’s billing job has run; until then only the meter is shown.</p>
                    )}
                    <p>
                        Charged is what settled jobs were charged; held is the worst case of everything queued or running.
                        A job’s charge never passes the maximum its owner approved: anything AWS billed past it is absorbed by the app
                        and shown in that job’s details. Projected is charged × days in the month ÷ days elapsed, plus the predicted
                        cost of everything queued or running.
                    </p>
                    <p className="admin-strip-prices">Prices retrieved {costs.pricesRetrieved} (Fargate, us-east-1, Linux/ARM).</p>
                </div>
            )}
        </>
    );
};

export default BudgetStrip;
