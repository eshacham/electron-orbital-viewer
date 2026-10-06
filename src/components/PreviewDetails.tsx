import React from 'react';
import { Alert, Link, Typography } from '@mui/material';
import StructurePreview from './StructurePreview';
import { PUBCHEM_COMPOUND_URL } from './ProvenancePanel';
import { formatFormula } from '../molecules/catalogue';
import { formatDuration, formatGB, formatUsd, microsToUsd, money, predictionNote } from '../jobs/format';
import type { GeometrySource, PreviewResponse, Sizing } from '../jobs/api_types';

const SPIN = ['', 'singlet', 'doublet', 'triplet', 'quartet', 'quintet', 'sextet'];
const signed = (charge: number) => (charge > 0 ? `+${charge}` : charge < 0 ? `−${-charge}` : '0');

/** D8: what it takes to tell one geometry source from another, for the "on record" comparison. */
const describeSource = (s: GeometrySource): string =>
    s.kind === 'pubchem' ? `PubChem CID ${s.cid} (${s.title}), asked as "${s.query}", retrieved ${s.retrievedAt}` : 'pasted XYZ';

function SizingFacts({ sizing, reservedUsd }: { sizing: Sizing; reservedUsd: number }) {
    const note = predictionNote(sizing.version);
    const capacity = sizing.capacity === 'local' ? 'This Mac (the size is the AWS worker it would need)'
        : sizing.capacity === 'spot' ? `Spot, up to ${sizing.attempts} attempts` : 'on-demand';
    // D7: the sizing rule always predicts the Fargate worker, even for a local run, which runs
    // single-threaded and has no timeout of its own -- so the labels say what the figure really is.
    const predictedLabel = sizing.estimateFor === 'fargate' ? 'Fargate estimate' : 'Predicted';
    const predictedNote = sizing.capacity === 'local' ? '; This Mac runs it single-threaded, usually slower' : '';
    return (
        <dl className="preview-facts" aria-label="sizing decision">
            <dt>Worker</dt><dd>{sizing.size} · {sizing.vcpu} vCPU · {sizing.memoryGB} GB · {capacity}</dd>
            <dt>{predictedLabel}</dt><dd>{formatDuration(sizing.predictedSeconds)}, {formatGB(sizing.predictedMemoryGB)} ({note}){predictedNote}</dd>
            <dt>Time limit</dt><dd>{sizing.capacity === 'local' ? 'none on This Mac' : formatDuration(sizing.timeoutSeconds)}</dd>
            <dt>Cost</dt><dd>{money('reserved', reservedUsd)} if submitted; {money('projected', microsToUsd(sizing.predictedCostMicros))} ({note})</dd>
        </dl>
    );
}

/**
 * What a preview resolved -- drawn even when the sizing refuses the job,
 * because "is this the molecule I meant?" comes before "can I afford it?"
 * -- and then the sizing decision or the refusal's own reason (spec §9.2).
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
                        <dd>
                            {describeSource(existing.geometrySource)}
                            {JSON.stringify(existing.geometrySource) === JSON.stringify(source) ? ' (same source)' : ' — a different source for the same atoms'}
                        </dd>
                    </>
                )}
            </dl>
            {decision.ok
                ? <SizingFacts sizing={decision.sizing} reservedUsd={decision.reservedUsd} />
                : <Alert severity="warning" role="alert">{decision.error.message}</Alert>}
            <Typography variant="body2" className="preview-meter">
                This month: {money('remaining', meter.remainingUsd)} of the {formatUsd(meter.capUsd)} compute cap
                {' '}({money('spent', meter.spentUsd)}, {money('reserved', meter.reservedUsd)}).
            </Typography>
        </div>
    );
};

export default PreviewDetails;
