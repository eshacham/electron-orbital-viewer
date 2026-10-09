import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Link, Typography } from '@mui/material';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { DISPERSION_COMPUTE_VERSION, tierOf, MoleculeProvenance } from '../molecules/types';
import { computedResultFiles, jobFileUrl } from '../molecules/job_paths';
import { capacityLabel, formatDuration, formatGB, money, predictionNote, quotedCost } from '../jobs/format';
import type { JobView } from '../jobs/api_types';
import { NOT_A_TEST, isExperimentalGeometry } from '../validation/geometry_honesty';

export const PUBCHEM_COMPOUND_URL = 'https://pubchem.ncbi.nlm.nih.gov/compound/';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

interface ProvenancePanelProps {
    meta: LibraryMoleculeMeta;
    /** The owner's view of this molecule's job (GET /api/v1/jobs/{key}); null for anyone else, or until it arrives. */
    ownerJob: JobView | null;
    ownerJobError?: string | null;
}

const hartree = (value: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(6)}`;

/** Recipe B's level: recorded from compute version 2; before it, recipe B always optimised at B3LYP/def2-SVP. */
const geometryMethod = (provenance: MoleculeProvenance) => provenance.geometryMethod ?? 'B3LYP/def2-SVP';

function Geometry({ provenance, steps, resumedFrom }: { provenance: MoleculeProvenance; steps: number | null; resumedFrom: number | null }) {
    const source = provenance.geometrySource;
    const origin = source.kind === 'pubchem'
        ? <>PubChem CID <Link href={`${PUBCHEM_COMPOUND_URL}${source.cid}`} {...EXTERNAL}>{source.cid}</Link> ({source.title}), its computed 3D conformer, retrieved {source.retrievedAt}</>
        : <>pasted XYZ coordinates</>;
    if (provenance.recipe === 'single') return <Typography variant="body2">Geometry: {origin}, not optimised.</Typography>;
    // M5: a resumed attempt's step count is this attempt's, said once, beside the resumption.
    if (resumedFrom !== null) {
        return (
            <Typography variant="body2">
                Geometry: optimised at {geometryMethod(provenance)} with geomeTRIC, starting from {origin}, resumed from attempt {resumedFrom}’s last frame
                {steps !== null ? ` (${steps} steps in this attempt)` : ''}.
            </Typography>
        );
    }
    return (
        <Typography variant="body2">
            Geometry: optimised at {geometryMethod(provenance)} with geomeTRIC{steps !== null ? ` in ${steps} steps` : ''}, starting from {origin}.
        </Typography>
    );
}

/** Spec §6: D3(BJ) moves energies and forces, and the total energy shown includes it -- said where it is shown. */
function Dispersion({ meta }: { meta: LibraryMoleculeMeta }) {
    const d = meta.dispersion;
    if (!d) return null;
    return (
        <Typography variant="body2">
            Dispersion: Grimme {d.model} (Becke–Johnson damping), computed with {d.backend}. It changes energies and forces only, not the orbitals, density or potential.
            {' '}Total energy {hartree(meta.totalEnergyHartree)} Ha, including {hartree(d.energyHartree)} Ha of {d.model}.
        </Typography>
    );
}

/**
 * Spec §7, §9: a time-limited optimisation and the frequency check say what they found, in the panel as in
 * the viewer; a saddle point's zero-point energy keeps its caveat. Then what else compute version 2 records
 * of how the structure was reached: an open shell's UKS/ROKS split, the final geometry's symmetrisation and
 * a final SCF that converged only without symmetry.
 */
function StructureChecks({ meta, provenance }: { meta: LibraryMoleculeMeta; provenance: MoleculeProvenance }) {
    const optimisation = meta.geometryOptimisation;
    const check = meta.frequencyCheck;
    const zpe = check?.zeroPointEnergyHartree;
    const zpeText = zpe === undefined ? '' : `; zero-point energy ${zpe.toFixed(6)} Ha${check?.zeroPointEnergyNote ? ` (${check.zeroPointEnergyNote})` : ''}`;
    const shell = provenance.openShell;
    const spins = shell ? [[shell.geometryS2, 'the last geometry step'], [shell.frequenciesS2, 'the frequency check']]
        .filter((pair): pair is [number, string] => typeof pair[0] === 'number')
        .map(([value, where]) => `${value.toFixed(3)} at ${where}`) : [];
    return (
        <>
            {optimisation?.stoppedBy === 'time-limit' && (
                <Typography variant="body2">
                    The optimisation stopped at its time limit, not converged (max force {optimisation.maxGradient?.toExponential(1)} Ha/bohr).
                </Typography>
            )}
            {check && (
                <Typography variant="body2">
                    Frequency check{check.method ? ` (${check.method})` : ''}: {check.summary}{zpeText}.
                </Typography>
            )}
            {shell && (
                <Typography variant="body2">
                    Open shell: {shell.methods}.
                    {' '}{shell.note ? `${shell.note}.` : spins.length ? `UKS ⟨S²⟩ ${spins.join(' and ')}, against S(S+1) = ${shell.expectedS2.toFixed(3)}.` : ''}
                </Typography>
            )}
            {provenance.finalGeometry?.summary && <Typography variant="body2">Final geometry: {provenance.finalGeometry.summary}.</Typography>}
            {provenance.finalScf && <Typography variant="body2">Final SCF: {provenance.finalScf.summary}.</Typography>}
        </>
    );
}

/** Spec §11: a job computed before dispersion was added keeps its method, and says so. */
function Legacy({ meta, provenance }: { meta: LibraryMoleculeMeta; provenance: MoleculeProvenance }) {
    if (provenance.computeVersion >= DISPERSION_COMPUTE_VERSION) return null;
    return (
        <Typography variant="body2" className="provenance-legacy">
            Computed before dispersion was added (compute version {provenance.computeVersion}): {meta.method.density} without D3(BJ)
            {provenance.recipe === 'optimise' ? ', and its optimised structure was not checked for imaginary frequencies' : ''}.
        </Typography>
    );
}

/** Time against its prediction, and the money -- the owner's numbers, read from the job record (meta's costUsd is always null). */
function OwnerFacts({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    // Phase 6C: an AWS job approved from a quote says its maximum and what it was charged; This Mac's
    // runs are free, and a record from before quotes keeps its reservation and actual cost.
    const quoted = job.backend === 'local' ? null : quotedCost(job);
    const cost = quoted ?? (job.actualUsd === null ? `${money('reserved', job.reservedUsd)}, not settled yet` : money('spent', job.actualUsd));
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
 * anyone can run it again. Since compute version 2 it also states the D3(BJ)
 * term, the frequency check and a time-limit stop, says when a job predates
 * them, and marks an experimental geometry's own bond and angle as no test
 * of the method.
 */
const ProvenancePanel: React.FC<ProvenancePanelProps> = ({ meta, ownerJob, ownerJobError = null }) => {
    const provenance = tierOf(meta) === 'computed' ? meta.provenance ?? null : null;
    // 6B-1's worker records {steps, converged, resumedFrom?} for recipe B (D10: LibraryExtras.geometryOptimisation widened to match it).
    const steps = meta.geometryOptimisation?.steps ?? null;
    const resumedFrom = meta.geometryOptimisation?.resumedFrom ?? null;
    // input.py writes frequencies.json whenever the check ran: never for 'not-run'.
    const frequencies = Boolean(meta.frequencyCheck && meta.frequencyCheck.result !== 'not-run');
    const experimental = isExperimentalGeometry(meta.geometrySource);
    const timeLimit = provenance?.timeLimitSeconds;
    return (
        <Accordion disableGutters className="provenance-panel" slotProps={{ transition: { unmountOnExit: true } }}>
            <AccordionSummary aria-controls="provenance-body" id="provenance-head">How this was computed</AccordionSummary>
            {/* m5: MUI gives the details' region the summary's aria-controls id itself. */}
            <AccordionDetails className="provenance-body">
                <Typography variant="body2">Method: {meta.method.density}, PySCF {provenance?.pyscfVersion ?? meta.generator.pyscf}.</Typography>
                <Dispersion meta={meta} />
                {provenance ? (
                    <>
                        <Legacy meta={meta} provenance={provenance} />
                        <Geometry provenance={provenance} steps={steps} resumedFrom={resumedFrom} />
                        <StructureChecks meta={meta} provenance={provenance} />
                        <Typography variant="subtitle2">Caveats</Typography>
                        <ul className="provenance-list">{provenance.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>
                        <Typography variant="subtitle2">Files</Typography>
                        <ul className="provenance-list">
                            {computedResultFiles(provenance.recipe, { frequencies }).map(name => (
                                <li key={name}><Link href={jobFileUrl(provenance.jobKey, name)} {...EXTERNAL}>{name}</Link></li>
                            ))}
                        </ul>
                        <Typography variant="body2">
                            Ran on {capacityLabel(provenance.capacity)}{provenance.capacity === 'local' ? '' : `, worker size ${provenance.size}`}:
                            {' '}{formatDuration(provenance.wallSeconds)} of wall time. Generator commit {provenance.generatorCommit.slice(0, 7)}; sized by sizing rule v{provenance.sizingVersion}{typeof timeLimit === 'number' ? `; time limit ${formatDuration(timeLimit)}` : ''}.
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
                                <li key={index}>
                                    {reference.quantity}: {reference.value} {reference.unit} — {reference.source}
                                    {experimental && (reference.quantity === 'bond' || reference.quantity === 'angle') ? `; ${NOT_A_TEST}` : ''}
                                </li>
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
