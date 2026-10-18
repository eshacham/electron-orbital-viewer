/**
 * Ruling P15 (R-accuracy) investigation: ΔSCF first ionisation energies of
 * d- and f-block elements against NIST ASD, printed with the neutral and
 * cation configurations the solve used and which subshells are open, so the
 * size and sign of each error can be read against which electron left.
 * Slow (a spin-polarised solve of an actinide takes minutes), so it runs
 * only with ATOM_SLOW_TESTS=1, like delta_scf_nist.test.ts. Na and Cs are
 * main-group controls (closed d/f shells, no valenceNote); Fe and Zn are
 * 3d-block controls validated through Ar's neighbourhood.
 */
import { ionisationEnergy, polarisedTotalEnergy } from '../../src/atom/delta_scf';
import { neutralGround, speciesConfiguration } from '../../src/atom/species';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';
import { configurationLabelOf } from '../../src/atom/configurations';
import { spinOccupations } from '../../src/atom/spin_scf';

jest.setTimeout(1800000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';

const LETTERS = 'spdf';
const openSubshells = (Z: number, charge: number) =>
    spinOccupations(speciesConfiguration({ Z, charge, excitation: null }))
        .filter(s => s.up !== s.down)
        .map(s => `${s.n}${LETTERS[s.l]}(${s.up}↑${s.down}↓)`)
        .join(' ') || 'none';

(SLOW ? describe : describe.skip)('ΔSCF first ionisation energies of d/f-block elements (ruling P15 check)', () => {
    // NIST ASD, eV (retrieved 2026-10-16): Th 6.307, Pa 5.89, U 6.194, Ce 5.539, Gd 6.150, Yb 6.254, Lu 5.426,
    // Fe 7.902, Zn 9.394; main-group controls Na 5.13907696, Cs 3.894.
    it.each([
        [90, 6.307], [91, 5.89], [92, 6.194], [58, 5.539], [64, 6.150], [70, 6.254], [71, 5.426],
        [26, 7.902], [30, 9.394], [11, 5.139], [55, 3.894],
    ])('Z=%i', (Z, nist) => {
        const reading = ionisationEnergy(neutralGround(Z))!;
        const neutral = configurationLabelOf(ionConfigurationFor(Z, 0));
        const cation = configurationLabelOf(ionConfigurationFor(Z, 1));
        const percent = (100 * (reading.valueEv - nist) / nist).toFixed(1);
        // eslint-disable-next-line no-console
        console.log(
            `Z=${Z}: ${reading.valueEv.toFixed(3)} eV vs NIST ${nist} (${percent} %); `
            + `neutral ${neutral} [open: ${openSubshells(Z, 0)}]; cation ${cation} [open: ${openSubshells(Z, 1)}]; `
            + `E(neutral) ${polarisedTotalEnergy(neutralGround(Z)).toFixed(6)} Ha`,
        );
        expect(Number.isFinite(reading.valueEv)).toBe(true);
    });
});
