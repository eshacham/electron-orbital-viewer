import React from 'react';
import { Alert, Link, Typography } from '@mui/material';
import StructurePreview from './StructurePreview';
import { PUBCHEM_COMPOUND_URL } from './ProvenancePanel';
import { formatFormula } from '../molecules/catalogue';
import { formatDuration, formatGB, formatUsd, money, predictionNote } from '../jobs/format';
import type { AvailableQuoteOption, GeometrySource, PreviewResponse, Quote, Sizing } from '../jobs/api_types';

const SPIN = ['', 'singlet', 'doublet', 'triplet', 'quartet', 'quintet', 'sextet'];
const signed = (charge: number) => (charge > 0 ? `+${charge}` : charge < 0 ? `−${-charge}` : '0');

/**
 * D8: the geometry already on record beside the one just resolved. The same
 * PubChem record is the same source however it was asked for and whenever
 * it was fetched (R1); how it was asked for is said as an aside.
 */
function describeOnRecord(record: GeometrySource, asked: GeometrySource): string {
    if (record.kind !== 'pubchem') return asked.kind === 'pubchem' ? 'pasted XYZ — a different source for the same atoms' : 'pasted XYZ (same source)';
    const name = `PubChem CID ${record.cid} (${record.title})`;
    const how = `asked as "${record.query}", retrieved ${record.retrievedAt}`;
    if (asked.kind !== 'pubchem' || asked.cid !== record.cid) return `${name}, ${how} — a different source for the same atoms`;
    return asked.query === record.query && asked.retrievedAt === record.retrievedAt ? `${name} (same source)` : `${name} (same source; ${how})`;
}

/**
 * The worker the sizing rule chose, which every option shares (Phase 6C:
 * each option's price, time limit and attempts are in the quote below).
 */
function SizingFacts({ sizing }: { sizing: Sizing }) {
    const note = predictionNote(sizing.version);
    const local = sizing.capacity === 'local';
    // D7: the sizing rule always predicts the Fargate worker, even for a local run, which runs
    // single-threaded and has no timeout of its own -- so the labels say what the figure really is.
    const predictedLabel = sizing.estimateFor === 'fargate' ? 'Fargate estimate' : 'Predicted';
    return (
        <dl className="preview-facts" aria-label="sizing decision">
            <dt>Worker</dt>
            <dd>{sizing.size} · {sizing.vcpu} vCPU · {sizing.memoryGB} GB{local ? ' (This Mac runs it; the size is the AWS worker it would need)' : ''}</dd>
            <dt>{predictedLabel}</dt>
            <dd>{formatDuration(sizing.predictedSeconds)}, {formatGB(sizing.predictedMemoryGB)} ({note}){local ? '; This Mac runs it single-threaded, usually slower' : ''}</dd>
        </dl>
    );
}

/** Every option is sized alike; the first one offered (or, on This Mac, the free one) says how. */
export function sizingOf(quote: Quote): Sizing | null {
    const offered = quote.options.find((o): o is AvailableQuoteOption => o.available);
    return offered?.sizing ?? null;
}

/**
 * What a preview resolved -- drawn even when the sizing refuses the job,
 * because "is this the molecule I meant?" comes before "can I afford it?"
 * -- and then the worker chosen or the refusal's own reason (spec §9.2).
 * The price options themselves are the request panel's QuoteChooser.
 */
const PreviewDetails: React.FC<{ preview: PreviewResponse }> = ({ preview }) => {
    const { geometrySource: source, decision, meter, existing } = preview;
    return (
        <div className="preview-details" role="region" aria-label="preview">
            <StructurePreview atoms={preview.atoms} />
            <dl className="preview-facts">
                <dt>Resolved</dt>
                <dd>
                    {source.kind === 'pubchem'
                        ? <>{source.title}: PubChem CID <Link href={`${PUBCHEM_COMPOUND_URL}${source.cid}`} target="_blank" rel="noopener noreferrer">{source.cid}</Link>, 3D conformer retrieved {source.retrievedAt}</>
                        : 'pasted XYZ'}
                </dd>
                <dt>Formula</dt><dd>{formatFormula(preview.formula)}</dd>
                <dt>Charge</dt><dd>{signed(preview.charge)}</dd>
                <dt>Multiplicity</dt><dd>{preview.multiplicity}{SPIN[preview.multiplicity] ? ` (${SPIN[preview.multiplicity]})` : ''}</dd>
                <dt>Electrons</dt><dd>{preview.electronCount}</dd>
                <dt>Basis functions</dt><dd>{preview.basisFunctions} ({preview.job.method.basis})</dd>
                {existing && (
                    <>
                        <dt>On record</dt>
                        <dd>{describeOnRecord(existing.geometrySource, source)}</dd>
                    </>
                )}
            </dl>
            {decision.ok
                ? (() => { const sizing = sizingOf(decision.quote); return sizing && <SizingFacts sizing={sizing} />; })()
                : <Alert severity="warning" role="alert">{decision.error.message}</Alert>}
            <Typography variant="body2" className="preview-meter">
                This month: {money('remaining', meter.remainingUsd)} of the {formatUsd(meter.capUsd)} monthly cap
                {' '}({money('spent', meter.spentUsd)}, {money('reserved', meter.reservedUsd)}).
            </Typography>
        </div>
    );
};

export default PreviewDetails;
