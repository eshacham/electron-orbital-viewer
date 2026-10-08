import React, { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, Radio, RadioGroup } from '@mui/material';
import { formatDuration, formatUsd, money, optionLabel } from '../jobs/format';
import type { AvailableQuoteOption, Quote, QuoteOption, QuoteOptionName } from '../jobs/api_types';

export interface QuoteChooserProps {
    quote: Quote;
    /** What approving does: a new run, or a failed job's retry (which needs its own fresh quote). */
    verb: 'run' | 'retry';
    /** Paused, busy or signed out: the options still read, but nothing can be approved. */
    disabled: boolean;
    onApprove(option: AvailableQuoteOption): void;
}

const available = (option: QuoteOption): option is AvailableQuoteOption => option.available;

/** The recommended option if it can be approved, else the first that can, else the recommended one to read. */
function initial(quote: Quote): QuoteOptionName | null {
    const offered = quote.options.filter(available);
    const approvable = offered.filter(o => o.approvable !== false);
    const pick = approvable.find(o => o.option === quote.recommended) ?? approvable[0]
        ?? offered.find(o => o.option === quote.recommended) ?? offered[0];
    return pick?.option ?? null;
}

/** The radio's accessible name: the option and its two figures, or that it is unavailable. */
function radioName(option: QuoteOption): string {
    if (!available(option)) return `${optionLabel(option.option)} (unavailable)`;
    if (option.option === 'local') return 'This Mac: free';
    return `${optionLabel(option.option)}: ${money('estimated', option.estimateUsd)}, ${money('up to', option.maximumUsd)}`;
}

function OptionCard({ option, chosen }: { option: QuoteOption; chosen: boolean }) {
    const local = option.option === 'local';
    return (
        <div className={`quote-option${chosen ? ' chosen' : ''}`} data-testid={`quote-option-${option.option}`}>
            <FormControlLabel value={option.option} disabled={!option.available}
                control={<Radio size="small" slotProps={{ input: { 'aria-label': radioName(option) } }} />}
                label={<strong>{optionLabel(option.option)}</strong>} />
            {!available(option) ? (
                <span className="quote-option-unavailable">Unavailable: {option.unavailableReason}</span>
            ) : local ? (
                <>
                    <span>Free: nothing is billed</span>
                    <span className="quote-option-note">Fargate estimate {formatDuration(option.predictedSeconds)}; no time limit on This Mac</span>
                </>
            ) : (
                <>
                    <span>{money('estimated', option.estimateUsd)}</span>
                    <strong>{money('up to', option.maximumUsd)}</strong>
                    <span className="quote-option-note">
                        predicted {formatDuration(option.predictedSeconds)}; time limit {formatDuration(option.timeoutSeconds)}
                        {option.attempts > 1 ? `, up to ${option.attempts} attempts` : ''}
                    </span>
                    {option.interruption && <span className="quote-option-note">{option.interruption}</span>}
                    {option.approvable === false && <span className="quote-option-unavailable">Over this month’s cap</span>}
                </>
            )}
        </div>
    );
}

/** Each line's estimate and maximum, and how it is worked out, for the option chosen. */
function LineDetails({ option }: { option: AvailableQuoteOption }) {
    return (
        <details className="quote-details">
            <summary>What makes up the price</summary>
            <table className="quote-lines" aria-label={`${optionLabel(option.option)} price, line by line`}>
                <thead><tr><th scope="col">Item</th><th scope="col">Estimated</th><th scope="col">Up to</th><th scope="col">How</th></tr></thead>
                <tbody>
                    {option.lines.map(line => (
                        <tr key={line.item}>
                            <th scope="row">{line.label}</th>
                            <td>{formatUsd(line.estimateUsd)}</td>
                            <td>{formatUsd(line.maximumUsd)}</td>
                            <td className="quote-option-note">{line.note}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </details>
    );
}

/** This Mac's runs are free; what the same job would cost on AWS is said for reference, never approved. */
function Reference({ options }: { options: QuoteOption[] }) {
    const parts = options.map(o => (available(o)
        ? `${optionLabel(o.option)} ${money('estimated', o.estimateUsd)}, ${money('up to', o.maximumUsd)}`
        : `${optionLabel(o.option)} unavailable`));
    return <p className="quote-option-note quote-reference">On AWS this would cost: {parts.join('; ')}.</p>;
}

/**
 * Phase 6C (owner decision 2026-10-08): the job's options side by side --
 * Spot and on-demand on AWS, each with its estimate, its maximum ("up to"),
 * its predicted time and time limit -- and one approval, for the option
 * chosen, that names its maximum. The maximum is what the job may be
 * charged at most: its time limit is what that maximum buys.
 */
const QuoteChooser: React.FC<QuoteChooserProps> = ({ quote, verb, disabled, onApprove }) => {
    const [chosen, setChosen] = useState<QuoteOptionName | null>(() => initial(quote));
    useEffect(() => { setChosen(initial(quote)); }, [quote]);
    const option = quote.options.filter(available).find(o => o.option === chosen) ?? null;
    const label = option === null ? 'Approve and run'
        : option.option === 'local' ? (verb === 'run' ? 'Run on This Mac (free)' : 'Retry on This Mac (free)')
            : `Approve ${money('up to', option.maximumUsd)} and ${verb}`;
    return (
        <div className="quote-chooser">
            <RadioGroup className="quote-options" aria-label="price options" value={chosen ?? ''}
                onChange={event => setChosen(event.target.value as QuoteOptionName)}>
                {quote.options.map(o => <OptionCard key={o.option} option={o} chosen={o.option === chosen} />)}
            </RadioGroup>
            {option && <LineDetails option={option} />}
            {quote.reference && <Reference options={quote.reference} />}
            {option?.blockedReason && <Alert severity="warning" role="alert">{option.blockedReason}</Alert>}
            <Button variant="contained" disabled={disabled || option === null || option.approvable === false}
                onClick={() => { if (option) onApprove(option); }}>
                {label}
            </Button>
        </div>
    );
};

export default QuoteChooser;
