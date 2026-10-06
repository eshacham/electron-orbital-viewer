import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Link, Typography } from '@mui/material';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { tierOf, MoleculeProvenance } from '../molecules/types';
import { computedResultFiles, jobFileUrl } from '../molecules/job_paths';
import { capacityLabel, formatDuration, formatGB, money, predictionNote } from '../jobs/format';
import type { JobView } from '../jobs/api_types';

export const PUBCHEM_COMPOUND_URL = 'https://pubchem.ncbi.nlm.nih.gov/compound/';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

interface ProvenancePanelProps {
    meta: LibraryMoleculeMeta;
    /** The owner's view of this molecule's job (GET /api/v1/jobs/{key}); null for anyone else, or until it arrives. */
    ownerJob: JobView | null;
    ownerJobError?: string | null;
}

function Geometry({ provenance, steps, resumedFrom }: { provenance: MoleculeProvenance; steps: number | null; resumedFrom: number | null }) {
    const source = provenance.geometrySource;
    const origin = source.kind === 'pubchem'
        ? <>PubChem CID <Link href={`${PUBCHEM_COMPOUND_URL}${source.cid}`} {...EXTERNAL}>{source.cid}</Link> ({source.title}), its computed 3D conformer, retrieved {source.retrievedAt}</>
        : <>pasted XYZ coordinates</>;
    if (provenance.recipe === 'single') return <Typography variant="body2">Geometry: {origin}, not optimised.</Typography>;
    return (
        <Typography variant="body2">
            Geometry: optimised at B3LYP/def2-SVP with geomeTRIC{steps !== null ? ` in ${steps} steps` : ''}, starting from {origin}
            {resumedFrom !== null ? `, resumed from attempt ${resumedFrom}'s last frame (${steps} steps in this attempt)` : ''}.
        </Typography>
    );
}

/** Time against its prediction, and the money -- the owner's numbers, read from the job record (meta's costUsd is always null). */
function OwnerFacts({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    const cost = job.actualUsd === null ? `${money('reserved', job.reservedUsd)}, not settled yet` : money('spent', job.actualUsd);
    return (
        <Typography variant="body2" className="provenance-owner">
            Owner only: {actual ? `${formatDuration(actual.wallSeconds)} of wall time, peak memory ${formatGB(actual.peakMemoryGB)}` : 'no timings recorded'}
            {' '}(predicted {formatDuration(sizing.predictedSeconds)} and {formatGB(sizing.predictedMemoryGB)}, {predictionNote(sizing.version)}).
            {' '}Cost: {cost}{job.backend === 'local' ? ' (This Mac)' : ''}.
        </Typography>
    );
}

/**
 * Spec §9.3: on every molecule, whichever tier, how it was computed -- the
 * method, where the geometry came from, what to be wary of, and for a
 * computed molecule the very files that produced it, input.py first, so
 * anyone can run it again.
 */
const ProvenancePanel: React.FC<ProvenancePanelProps> = ({ meta, ownerJob, ownerJobError = null }) => {
    const provenance = tierOf(meta) === 'computed' ? meta.provenance ?? null : null;
    // 6B-1's worker records {steps, converged, resumedFrom?} for recipe B (D10: LibraryExtras.geometryOptimisation widened to match it).
    const steps = meta.geometryOptimisation?.steps ?? null;
    const resumedFrom = meta.geometryOptimisation?.resumedFrom ?? null;
    return (
        <Accordion disableGutters className="provenance-panel" slotProps={{ transition: { unmountOnExit: true } }}>
            <AccordionSummary aria-controls="provenance-body" id="provenance-head">How this was computed</AccordionSummary>
            <AccordionDetails id="provenance-body" className="provenance-body">
                <Typography variant="body2">Method: {meta.method.density}, PySCF {provenance?.pyscfVersion ?? meta.generator.pyscf}.</Typography>
                {provenance ? (
                    <>
                        <Geometry provenance={provenance} steps={steps} resumedFrom={resumedFrom} />
                        <Typography variant="subtitle2">Caveats</Typography>
                        <ul className="provenance-list">{provenance.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>
                        <Typography variant="subtitle2">Files</Typography>
                        <ul className="provenance-list">
                            {computedResultFiles(provenance.recipe).map(name => (
                                <li key={name}><Link href={jobFileUrl(provenance.jobKey, name)} {...EXTERNAL}>{name}</Link></li>
                            ))}
                        </ul>
                        <Typography variant="body2">
                            Ran on {capacityLabel(provenance.capacity)}{provenance.capacity === 'local' ? '' : `, worker size ${provenance.size}`}:
                            {' '}{formatDuration(provenance.wallSeconds)} of wall time. Generator commit {provenance.generatorCommit.slice(0, 7)}; sized by sizing rule v{provenance.sizingVersion}.
                        </Typography>
                        {ownerJob && <OwnerFacts job={ownerJob} />}
                        {ownerJobError && <Typography variant="caption" role="alert">The job record could not be read: {ownerJobError}</Typography>}
                    </>
                ) : (
                    <>
                        <Typography variant="body2">Geometry: {meta.geometrySource}.</Typography>
                        <Typography variant="subtitle2">Checked against</Typography>
                        <ul className="provenance-list">
                            {meta.references.map((reference, index) => (
                                <li key={index}>{reference.quantity}: {reference.value} {reference.unit} — {reference.source}</li>
                            ))}
                        </ul>
                        <Typography variant="body2">Generated by {meta.generator.script} at commit {meta.generator.commit.slice(0, 7)}.</Typography>
                    </>
                )}
            </AccordionDetails>
        </Accordion>
    );
};

export default ProvenancePanel;
