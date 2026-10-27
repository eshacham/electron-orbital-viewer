import {
    BondsSystemId, DIATOMIC_IDS, TEXTBOOK_BOND_ORDER, TEXTBOOK_PARAMAGNETIC,
    bondOrderSelectText, isParamagneticSpin,
} from '../../src/bonds/systems';
import { bondOrderFromOrbitals } from '../../src/bonds/mo_diagram';

/** meta.json's own `spin` (2S) for every diatomic, as the real v3 data ships it; H₂⁺ carries none (see isParamagneticSpin). */
const SHIPPED_SPIN: Record<Exclude<BondsSystemId, 'h2plus'>, number> = {
    h2: 0, he2: 0, li2: 0, b2: 2, c2: 0, n2: 0, o2: 2, f2: 0, co: 0, hf: 0,
};

describe('isParamagneticSpin', () => {
    it.each(DIATOMIC_IDS)('reads %s from the shipped spin the same way TEXTBOOK_PARAMAGNETIC states it', id => {
        expect(isParamagneticSpin(SHIPPED_SPIN[id])).toBe(TEXTBOOK_PARAMAGNETIC[id]);
    });

    it('is null with nothing to read: not yet loaded, or no spin field at all (H₂⁺)', () => {
        expect(isParamagneticSpin(null)).toBeNull();
        expect(isParamagneticSpin(undefined)).toBeNull();
    });
});

describe("bondOrderSelectText's paramagnetic marker (ruling T23e-B2)", () => {
    it('marks O₂ and B₂ (two unpaired π electrons each, spin: 2 in the shipped data)', () => {
        expect(bondOrderSelectText('o2')).toMatch(/, paramagnetic$/);
        expect(bondOrderSelectText('b2')).toMatch(/, paramagnetic$/);
    });

    it('does not mark N₂, C₂ or F₂ (closed-shell, spin: 0)', () => {
        expect(bondOrderSelectText('n2')).not.toMatch(/paramagnetic/);
        expect(bondOrderSelectText('c2')).not.toMatch(/paramagnetic/);
        expect(bondOrderSelectText('f2')).not.toMatch(/paramagnetic/);
    });
});

/**
 * Ruling T23e-COHF: the System select and Info's bond order (bonds_info.ts,
 * mo_diagram.ts' bondOrderText/bondOrderNote) now read the same
 * TEXTBOOK_BOND_ORDER, so they cannot state two different numbers for the
 * same molecule. For the eight homonuclear systems this is also a real,
 * independent check: `bondOrderFromOrbitals` over the shipped data's own
 * occupations (same label/occupation pairs as mo_diagram.test.tsx's
 * `bondOrderFromOrbitals` suite) against the number the select shows.
 */
describe('the select and the footer cannot disagree', () => {
    const occ = (label: string, occupation: number) => ({ label, occupation });
    const SHIPPED_OCCUPATIONS: Partial<Record<BondsSystemId, Array<{ label: string; occupation: number }>>> = {
        h2: [occ('1σg', 2), occ('1σu*', 0)],
        he2: [occ('1σg', 2), occ('1σu*', 2)],
        li2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 0)],
        c2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 2), occ('1πu', 2), occ('1πu', 2), occ('3σg', 0),
            occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0)],
        n2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 2), occ('1πu', 2), occ('1πu', 2), occ('3σg', 2),
            occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0)],
        f2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 2), occ('3σg', 2), occ('1πu', 2), occ('1πu', 2),
            occ('1πg*', 2), occ('1πg*', 2), occ('3σu*', 0)],
    };

    it.each(Object.keys(SHIPPED_OCCUPATIONS) as BondsSystemId[])(
        "the select's %s order equals the shipped occupations' own (bonding − antibonding)/2", id => {
            const real = bondOrderFromOrbitals(SHIPPED_OCCUPATIONS[id]!);
            expect(real).toBe(TEXTBOOK_BOND_ORDER[id]);
            const orderText = Number.isInteger(real) ? String(real) : '½';
            expect(bondOrderSelectText(id)).toContain(`order ${orderText}`);
        },
    );

    // CO and HF: bondOrderFromOrbitals returns null for both (no antibonding star in their
    // labels), so there is no independent source beyond TEXTBOOK_BOND_ORDER; this just pins
    // the select to it, the same constant Info's bond order reads (bonds_info.ts, bondOrderNote).
    it.each(['co', 'hf'] as const)('%s has no independent occupations to check, so both read TEXTBOOK_BOND_ORDER directly', id => {
        expect(bondOrderSelectText(id)).toContain(`order ${TEXTBOOK_BOND_ORDER[id]}`);
    });
});
