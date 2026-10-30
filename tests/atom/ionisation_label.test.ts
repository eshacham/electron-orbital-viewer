// Final fix wave, finish fix 3: "(X → X⁺)" in an ionisation-energy label is one unit, so the label wraps as
// "Ionisation energy" / "(Fe → Fe⁺) (i)" and never at the arrow.
import { ionisationLabelOf } from '../../src/atom/atom_text';
import { neutralGround } from '../../src/atom/species';

const NB = ' ';

describe('ionisationLabelOf keeps the reaction together', () => {
    it('holds the arrow with no-break spaces, for a neutral atom', () => {
        expect(ionisationLabelOf(neutralGround(26), null)).toBe(`Ionisation energy (Fe${NB}→${NB}Fe⁺)`);
    });

    it('holds it for a cation, and from the energy reading\'s own labels when one has arrived', () => {
        expect(ionisationLabelOf({ Z: 26, charge: 1, excitation: null }, null)).toBe(`Ionisation energy (Fe⁺${NB}→${NB}Fe²⁺)`);
        expect(ionisationLabelOf(neutralGround(26), { valueEv: 8.04, fromLabel: 'Fe', toLabel: 'Fe⁺' })).toBe(`Ionisation energy (Fe${NB}→${NB}Fe⁺)`);
    });

    it('has only the one plain break opportunity inside the parentheses to the left of the reaction', () => {
        const label = ionisationLabelOf(neutralGround(26), null);
        // Every plain space of the label is before the "(" of the reaction.
        expect(label.slice(label.indexOf('(')).includes(' ')).toBe(false);
    });

    // Final polish verdict pass: a one-electron species' "(H → H⁺ (bare nucleus))" is held whole too, so it never breaks
    // inside the reaction as "(H → H⁺" / "(bare nucleus))".
    it('holds the whole bare-nucleus qualifier, both before and after the energy arrives', () => {
        for (const label of [
            ionisationLabelOf(neutralGround(1), null),
            ionisationLabelOf(neutralGround(1), { valueEv: 13.6, fromLabel: 'H', toLabel: 'H⁺ (bare nucleus)' }),
            ionisationLabelOf({ Z: 2, charge: 1, excitation: null }, null),
        ]) {
            expect(label.slice(label.indexOf('(')).includes(' ')).toBe(false);
        }
    });
});
