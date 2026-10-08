import { elementFor } from '../elements';
import type { AvailableQuoteOption, CanonicalJob, JobRequest, JobView, Recipe } from './api_types';

export type InputKind = 'name' | 'smiles' | 'xyz';
export interface RequestForm { kind: InputKind; text: string; recipe: Recipe; charge: string; multiplicity: string }
export const EMPTY_FORM: RequestForm = { kind: 'name', text: '', recipe: 'single', charge: '', multiplicity: '' };
export interface FormProblem { field: 'text' | 'charge' | 'multiplicity'; message: string }

const MAX_NAME = 200;          // tools/jobs/handlers.MAX_NAME
const MAX_XYZ_BYTES = 65536;   // tools/jobs/canonical.MAX_XYZ_BYTES
const INTEGER = /^[+-]?\d{1,3}$/;
// An element symbol or, as canonical.parse_xyz also takes, an atomic number (R7); then x, y, z.
const ATOM_LINE = /^(?:[A-Za-z]{1,2}|\d{1,3})(\s+[-+]?[\d.]+(?:[eE][-+]?\d+)?){3}$/;

/** The checks the server makes anyway, made here so a typo costs no round trip; the server stays the authority. */
export function formProblems(form: RequestForm): FormProblem[] {
    const problems: FormProblem[] = [];
    const text = form.text.trim();
    if (!text) {
        problems.push({ field: 'text', message: form.kind === 'xyz' ? 'Paste the XYZ coordinates.' : form.kind === 'name' ? 'Type a name.' : 'Type a SMILES string.' });
    } else if (form.kind !== 'xyz' && text.length > MAX_NAME) {
        problems.push({ field: 'text', message: `At most ${MAX_NAME} characters.` });
    } else if (form.kind === 'xyz' && new TextEncoder().encode(form.text).length > MAX_XYZ_BYTES) {
        problems.push({ field: 'text', message: 'The XYZ text is over 64 KB.' });
    } else if (form.kind === 'xyz') {
        // D9: tools/jobs/canonical.parse_xyz always skips two lines (count, comment) before the
        // atoms. A count line straight followed by atoms is misread -- the first atom becomes the
        // comment and the server reports a count mismatch instead of the real problem.
        const lines = form.text.trim().split(/\r?\n/).map(line => line.trim());
        if (/^\d+$/.test(lines[0] ?? '') && ATOM_LINE.test(lines[1] ?? '') && lines.slice(1).filter(l => ATOM_LINE.test(l)).length === Number(lines[0])) {
            problems.push({ field: 'text', message: 'Line 2 must be a comment line (it may be empty): the atoms start on line 3.' });
        }
    }
    const charge = form.charge.trim();
    if (charge && !INTEGER.test(charge)) problems.push({ field: 'charge', message: 'A whole number, e.g. 0, 1 or -1.' });
    const multiplicity = form.multiplicity.trim();
    if (multiplicity && (!INTEGER.test(multiplicity) || Number(multiplicity) < 1)) {
        problems.push({ field: 'multiplicity', message: 'A whole number from 1: 1 singlet, 2 doublet, 3 triplet.' });
    }
    return problems;
}

export function requestBody(form: RequestForm): JobRequest {
    const text = form.kind === 'xyz' ? form.text : form.text.trim();
    const body: JobRequest = {
        recipe: form.recipe,
        molecule: form.kind === 'name' ? { name: text } : form.kind === 'smiles' ? { smiles: text } : { xyz: text },
    };
    if (form.charge.trim()) body.charge = Number(form.charge.trim());
    if (form.multiplicity.trim()) body.multiplicity = Number(form.multiplicity.trim());
    return body;
}

/** What a preview was asked for: Submit is offered only while the form still says exactly this. */
export const formSignature = (form: RequestForm): string => JSON.stringify(requestBody(form));

/** The canonical atoms are already rounded to 10⁻⁵ Å (spec §5.2); written back with five decimals they hash to the same key. */
export function xyzFromCanonical(job: CanonicalJob): string {
    const lines = job.molecule.atoms.map(([Z, x, y, z]) => `${elementFor(Z)?.symbol ?? Z} ${x.toFixed(5)} ${y.toFixed(5)} ${z.toFixed(5)}`);
    return `${lines.length}\nretry\n${lines.join('\n')}\n`;
}

/** Re-queues a FAILED job from its own record (spec §6.3): no need for the form that first asked for it. */
export function retryBody(view: JobView): JobRequest {
    return {
        recipe: view.recipe,
        molecule: { xyz: xyzFromCanonical(view.job) },
        charge: view.job.molecule.charge,
        multiplicity: view.job.molecule.multiplicity,
        retry: true,
    };
}

/** Phase 6C: a submit names the option the owner approved and the quote id it was shown with. */
export function approvedBody(body: JobRequest, option: AvailableQuoteOption): JobRequest {
    return { ...body, option: option.option, quoteId: option.quoteId };
}
