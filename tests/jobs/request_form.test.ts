import { EMPTY_FORM, formProblems, formSignature, requestBody, retryBody, xyzFromCanonical } from '../../src/jobs/request_form';
import { jobFixture } from './api_fixtures';

describe('request bodies', () => {
    it('sends a name or SMILES trimmed, XYZ as typed, and charge and multiplicity only when given', () => {
        expect(requestBody({ ...EMPTY_FORM, text: '  water ' })).toEqual({ recipe: 'single', molecule: { name: 'water' } });
        expect(requestBody({ ...EMPTY_FORM, kind: 'smiles', text: 'CCO', recipe: 'optimise', charge: '+1', multiplicity: '2' }))
            .toEqual({ recipe: 'optimise', molecule: { smiles: 'CCO' }, charge: 1, multiplicity: 2 });
        expect(requestBody({ ...EMPTY_FORM, kind: 'xyz', text: '1\n\nHe 0 0 0\n' }).molecule).toEqual({ xyz: '1\n\nHe 0 0 0\n' });
    });
    it('ties a preview to one exact request', () => {
        expect(formSignature({ ...EMPTY_FORM, text: 'water' })).toBe(formSignature({ ...EMPTY_FORM, text: ' water ' }));
        expect(formSignature({ ...EMPTY_FORM, text: 'water' })).not.toBe(formSignature({ ...EMPTY_FORM, text: 'water', recipe: 'optimise' }));
    });
    it('says what is wrong before asking the server', () => {
        expect(formProblems(EMPTY_FORM)).toEqual([{ field: 'text', message: 'Type a name.' }]);
        expect(formProblems({ ...EMPTY_FORM, text: 'x'.repeat(201) })[0].message).toBe('At most 200 characters.');
        expect(formProblems({ ...EMPTY_FORM, text: 'water', charge: '1.5', multiplicity: '0' }).map(p => p.field)).toEqual(['charge', 'multiplicity']);
        expect(formProblems({ ...EMPTY_FORM, text: 'water', charge: '-1', multiplicity: '2' })).toEqual([]);
    });
    // D9: the server's parse_xyz skips two lines after the count, so a count line straight
    // followed by atoms is silently misread (the first atom becomes the comment). Caught client-side.
    it('flags an XYZ count line not followed by a comment line', () => {
        const noComment = formProblems({ ...EMPTY_FORM, kind: 'xyz', text: '3\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n' });
        expect(noComment[0].message).toMatch(/^Line 2 must be a comment line/);
        const withComment = formProblems({ ...EMPTY_FORM, kind: 'xyz', text: '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n' });
        expect(withComment).toEqual([]);
    });
});

describe('retrying a failed job', () => {
    it('rebuilds the request from the canonical atoms, so it hashes to the same key', () => {
        const failed = jobFixture('get_failed');
        expect(xyzFromCanonical(failed.job)).toBe('3\nretry\nH 0.00000 -0.75545 -0.47116\nH 0.00000 0.75545 -0.47116\nO 0.00000 0.00000 0.11779\n');
        expect(retryBody(failed)).toEqual({ recipe: 'optimise', molecule: { xyz: xyzFromCanonical(failed.job) }, charge: 0, multiplicity: 1, retry: true });
    });
});
