import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { solveAtom } from '../../src/atom/scf';
import srlda from './fixtures/nist_srlda.json';
import rlda from './fixtures/nist_rlda.json';
import recorded from '../../src/validation/relativity_results.json';
import type { RelativityResultEntry } from '../../src/validation/relativity_rows';

// Eight heavy atoms, two solves each (scalar and spin-orbit, each warm-started
// from its own non-relativistic solve): a few minutes. Gated like scf.test.ts.
jest.setTimeout(1800000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const WRITE = process.env.WRITE_VALIDATION === '1';
if (WRITE && !SLOW) throw new Error('WRITE_VALIDATION=1 needs ATOM_SLOW_TESTS=1: the results file must cover every atom.');
const describeSlow = SLOW ? describe : describe.skip;

type Fixture = { atoms: Array<{ Z: number; symbol: string; Etot: number; eigenvalues: Record<string, number> }> };
const LETTERS = 'spdf';
const entries: RelativityResultEntry[] = [];

function appValue(atom: ReturnType<typeof solveAtom>, key: string): number {
    if (key === 'Etot') return atom.totalEnergy;
    const n = Number(key[0]);
    const l = LETTERS.indexOf(key[1]);
    const suffix = key.slice(2);
    const j = suffix === '-' ? l - 0.5 : suffix === '+' ? l + 0.5 : atom.relativity === 'spinOrbit' ? 0.5 : undefined;
    const state = atom.states.find(s => s.n === n && s.l === l && s.j === j);
    if (!state) throw new Error(`No state ${key} in Z=${atom.Z} (${atom.relativity}).`);
    return state.energy;
}

// The full staleness check below needs every heavy atom solved again; neon
// is cheap enough for every default run (as delta_scf_nist.test.ts does with
// He and Li), so a solver change that moves the committed numbers at all is
// caught without ATOM_SLOW_TESTS -- the default run imports the same file.
describe('committed results stay current (fast subset)', () => {
    it('Ne matches a fresh computation to 1e-6 in both columns', () => {
        const neon = (recorded.entries as RelativityResultEntry[]).filter(entry => entry.Z === 10);
        expect(neon.map(entry => entry.column).sort()).toEqual([...Array(5).fill('RLDA'), ...Array(4).fill('ScRLDA')]);
        for (const entry of neon) {
            const atom = solveAtom(entry.Z, entry.column === 'ScRLDA' ? 'scalar' : 'spinOrbit');
            expect(Math.abs((appValue(atom, entry.quantity) - entry.app) / entry.app)).toBeLessThan(1e-6);
        }
    });
});

describeSlow('NIST relativistic validation (spec §5 Phase 4: within 1 %, 0.1 % for Z <= 18)', () => {
    const columns = [['ScRLDA', 'scalar', srlda], ['RLDA', 'spinOrbit', rlda]] as const;

    for (const [column, mode, fixture] of columns) {
        for (const reference of (fixture as Fixture).atoms) {
            it(`${reference.symbol} ${column}`, () => {
                const atom = solveAtom(reference.Z, mode);
                expect(atom.converged).toBe(true);
                const tolerance = reference.Z <= 18 ? 1e-3 : 1e-2;
                const quantities: Array<[string, number]> = [['Etot', reference.Etot], ...Object.entries(reference.eigenvalues)];
                for (const [quantity, value] of quantities) {
                    const app = appValue(atom, quantity);
                    entries.push({ Z: reference.Z, symbol: reference.symbol, column, quantity, app, reference: value });
                    expect(Math.abs((app - value) / value)).toBeLessThan(tolerance);
                }
            });
        }
    }

    it.each([55, 79, 80, 86, 92, 103, 118])('Z=%i converges in both relativistic modes', Z => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            const atom = solveAtom(Z, mode);
            expect(atom.converged).toBe(true);
            expect(Number.isFinite(atom.totalEnergy)).toBe(true);
        }
    });

    // Logged, not asserted: a ratio of two wall-clock times swings with
    // whatever else the machine runs, and the slow suites run in parallel
    // workers. The budget (a seeded relativistic solve at most ~3x the
    // non-relativistic one) is read off the log line and recorded in HANDOFF.
    it('reports cost: a seeded relativistic platinum solve against the non-relativistic one', () => {
        // Au was solved above; time a fresh element instead so both are cold.
        const Z = 78;
        const start = performance.now();
        solveAtom(Z, 'off');
        const nonRelativistic = performance.now() - start;
        const middle = performance.now();
        solveAtom(Z, 'scalar');
        const relativistic = performance.now() - middle;
        // eslint-disable-next-line no-console
        console.log(`Pt: off ${nonRelativistic.toFixed(0)} ms, scalar (seeded) ${relativistic.toFixed(0)} ms, `
            + `ratio ${(relativistic / nonRelativistic).toFixed(2)} (budget ~3)`);
    });

    (WRITE ? it.skip : it)('the committed results file matches a fresh computation', () => {
        const committed = recorded.entries as RelativityResultEntry[];
        expect(committed.length).toBeGreaterThan(0);
        for (const entry of committed) {
            const atom = solveAtom(entry.Z, entry.column === 'ScRLDA' ? 'scalar' : 'spinOrbit');
            expect(Math.abs((appValue(atom, entry.quantity) - entry.app) / entry.app)).toBeLessThan(1e-6);
        }
    });

    afterAll(() => {
        if (!WRITE) return;
        const path = resolve(__dirname, '../../src/validation/relativity_results.json');
        const body = {
            generator: 'tests/atom/relativistic_nist.test.ts with ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1',
            generatedOn: new Date().toISOString().slice(0, 10),
            entries,
        };
        writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
    });
});
