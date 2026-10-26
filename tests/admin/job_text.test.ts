import { rowCharge, shortReason, usdPair } from '../../src/admin/job_text';

describe('money on the jobs page', () => {
    it('shows a row’s charge under one cent as "under $0.01", never as a long figure', () => {
        expect(rowCharge(0.002473)).toBe('under $0.01');
        expect(rowCharge(0.0099)).toBe('under $0.01');
        expect(rowCharge(0)).toBe('$0.00');
        expect(rowCharge(0.04)).toBe('$0.04');
        expect(rowCharge(0.01)).toBe('$0.01');
    });
    it('gives a maximum and its charge one shared precision, set by the smaller non-zero figure', () => {
        expect(usdPair(0.51, 0.04)).toEqual(['$0.51', '$0.04']);
        expect(usdPair(0.021301, 0.001508)).toEqual(['$0.021301', '$0.001508']);
        expect(usdPair(0.01788, 0.000497)).toEqual(['$0.0178800', '$0.0004970']);
        expect(usdPair(0.0104, 0.0099)).toEqual(['$0.010400', '$0.009900']);
        expect(usdPair(0, 0)).toEqual(['$0.00', '$0.00']);
    });
    it('never shows a charge above the maximum it was held to', () => {
        const value = (text: string) => Number(text.replace('$', ''));
        const figures = [0, 0.0000123, 0.000497, 0.0049999, 0.005, 0.0099999, 0.01, 0.0104, 0.0149, 0.015, 0.02, 0.51, 1.2];
        for (const maximum of figures) {
            for (const charged of figures.filter(f => f <= maximum)) {
                const [m, c] = usdPair(maximum, charged);
                expect(value(c)).toBeLessThanOrEqual(value(m));
            }
        }
    });
});

describe('a failure’s short reason', () => {
    it('is read from the error code: words, with known initialisms upper-cased', () => {
        expect(shortReason({ code: 'scf-not-converged', message: 'SCF did not converge (DIIS, level shift 0.3 Ha, second-order)' }))
            .toBe('SCF not converged');
        expect(shortReason({ code: 'out-of-memory', message: 'm' })).toBe('Out of memory');
        expect(shortReason({ code: 'timed-out', message: 'm' })).toBe('Timed out');
    });
    it('falls back to the message’s first clause when there is no code', () => {
        expect(shortReason({ code: '', message: 'SCF did not converge in 200 cycles (open shell, d-block).' }))
            .toBe('SCF did not converge in 200 cycles');
        expect(shortReason({ code: '', message: 'The worker stopped; no log' })).toBe('The worker stopped');
    });
});
