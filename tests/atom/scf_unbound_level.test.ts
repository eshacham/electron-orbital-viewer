import { solveSpecies } from '../../src/atom/scf';
import { solvePolarised } from '../../src/atom/spin_scf';
import { UnboundElectronError } from '../../src/atom/scf_shared';
import { AtomSpecies, speciesConfiguration } from '../../src/atom/species';

const sixSToFourF = (Z: number): AtomSpecies => ({ Z, charge: 0, excitation: { from: { n: 6, l: 0 }, to: { n: 4, l: 3 } } });

function thrownBy(solve: () => unknown): unknown {
    try { solve(); } catch (error) { return error; }
    return null;
}

// Ruling T7-b. Pr-Eu 6s -> 4f: around the tenth iteration the promoted 4f
// leaves the bound spectrum and never comes back (measured, every iteration
// to the end, restricted and spin-polarised alike; halving the mixing down
// to 1e-4 does not keep it). The eigenvalue search then bracketed nothing,
// and the Schrödinger solver handed back its widest bracket's midpoint --
// a 4f at -192.2 Ha -- which the loop "converged" around and the app drew.
describe('an occupied level the field does not bind is a verdict, not a picture', () => {
    it('Sm 6s → 4f: the restricted solve reports its 4f unbound', () => {
        const error = thrownBy(() => solveSpecies(sixSToFourF(62)));
        expect(error).toBeInstanceOf(UnboundElectronError);
        const unbound = error as UnboundElectronError;
        expect([unbound.n, unbound.l, unbound.j]).toEqual([4, 3, undefined]);
        expect(unbound.message).toBe('LDA does not bind the 4f electron in this configuration: it is not bound by 10⁻⁴ Ha or more.');
    });

    it('Pr 6s → 4f: so does the spin-polarised solve behind its ΔSCF energy', () => {
        const species = sixSToFourF(59);
        expect(() => solvePolarised(59, speciesConfiguration(species))).toThrow(UnboundElectronError);
    });
});
