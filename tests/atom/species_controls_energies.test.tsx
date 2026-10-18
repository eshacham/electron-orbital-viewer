/**
 * Ruling P15 (R-accuracy): every calculated ionisation energy shows its
 * NIST value, the signed percent difference, and -- for a d/f-block element
 * or a large error -- the one-line limitation note. Pa is the owner's own
 * observation (tests/atom/delta_scf_heavy.test.ts, ATOM_SLOW_TESTS=1):
 * 7.38 eV calculated vs 5.89 eV measured, +25 %.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SpeciesControls from '../../src/components/SpeciesControls';
import { EnergiesState } from '../../src/store/atomSlice';

const idle: EnergiesState = { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null };
const renderControls = (overrides: Partial<React.ComponentProps<typeof SpeciesControls>> = {}) => {
    const props = {
        species: { Z: 11, charge: 0, excitation: null },
        onChargeChange: jest.fn(),
        onExcitationChange: jest.fn(),
        energies: idle,
        radii: null,
        unbound: null,
        ...overrides,
    };
    render(<SpeciesControls {...props} />);
    return props;
};

describe('SpeciesControls energy accuracy (ruling P15)', () => {
    it('shows protactinium\'s measured value, its +25.3 % and the limitation note', () => {
        renderControls({
            species: { Z: 91, charge: 0, excitation: null },
            energies: { speciesKey: '91', status: 'done', ionisation: { valueEv: 7.38, fromLabel: 'Pa', toLabel: 'Pa⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('measured 5.890 eV (NIST)');
        expect(line).toHaveTextContent('+25.3 %');
        expect(screen.getByText(/open shells; expect larger errors/)).toBeInTheDocument();
    });

    it('shows sodium\'s measured value and +3.1 %, with no limitation note', () => {
        renderControls({
            species: { Z: 11, charge: 0, excitation: null },
            energies: { speciesKey: '11', status: 'done', ionisation: { valueEv: 5.3, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('measured 5.139 eV (NIST)');
        expect(line).toHaveTextContent('+3.1 %');
        expect(screen.queryByText(/open shells; expect larger errors/)).toBeNull();
    });

    it('shows no measured value and no percentage for a +1 ion', () => {
        renderControls({
            species: { Z: 11, charge: 1, excitation: null },
            energies: { speciesKey: '11+1', status: 'done', ionisation: { valueEv: 47.3, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).not.toHaveTextContent('measured');
        expect(line).not.toHaveTextContent('%');
        expect(screen.queryByText(/open shells; expect larger errors/)).toBeNull();
    });
});
