import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MoleculeNav from '../../src/components/MoleculeNav';
import MoleculeOrbitalList from '../../src/components/MoleculeOrbitalList';
import MoleculeReadout from '../../src/components/MoleculeReadout';
import MoleculeViewOptions from '../../src/components/MoleculeViewOptions';
import { formatOrbitalEnergy, degeneracyCounts, formatPointGroup } from '../../src/molecules/orbital_display';
import { LIBRARY_INDEX, waterMeta, waterAtoms } from './fixtures';

const navProps = {
    entries: LIBRARY_INDEX, indexError: null, meta: waterMeta(), selectedId: 'h2o', isLoading: false,
    surface: { kind: 'density' } as const, onSelectMolecule: jest.fn(), onSurfaceChange: jest.fn(),
};

describe('orbital display', () => {
    it('formats energies in Ha with eV beside', () => {
        expect(formatOrbitalEnergy(-0.4913)).toBe('−0.491 Ha (−13.37 eV)');
    });
    it('counts degenerate sets', () => {
        const counts = degeneracyCounts([{ index: 2, energyHartree: -0.5 }, { index: 3, energyHartree: -0.50001 }, { index: 4, energyHartree: -0.5 + 1e-5 }, { index: 5, energyHartree: 0.1 }]);
        expect([counts.get(2), counts.get(5)]).toEqual([3, 1]);
    });
    // D34: PySCF writes Dooh/Coov (ASCII for infinity); the UI shows the
    // conventional D∞h/C∞v wherever a point group is displayed.
    it('maps PySCF\'s ASCII linear point groups to D∞h/C∞v', () => {
        expect(formatPointGroup('Dooh')).toBe('D∞h');
        expect(formatPointGroup('Coov')).toBe('C∞v');
        expect(formatPointGroup('C2v')).toBe('C2v');
    });
});

describe('MoleculeOrbitalList', () => {
    it('lists highest first, marks HOMO and LUMO, states the method and that energies are not ionisation energies', () => {
        const onSelect = jest.fn();
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={4} onSelect={onSelect}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        const rows = screen.getAllByRole('button');
        expect(rows[0]).toHaveTextContent('4a1');
        expect(rows[1]).toHaveTextContent('1b1');
        expect(rows[1]).toHaveTextContent('HOMO');
        expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
        expect(rows[0]).toHaveTextContent('LUMO');
        fireEvent.click(rows[2]);
        expect(onSelect).toHaveBeenCalledWith(3);
        expect(container.textContent).toMatch(/Kohn–Sham orbital energies, B3LYP\/def2-TZVP\. Not ionisation energies\./);
    });
    // Ruling T16-b: descending order stays (it reads like an MO diagram), so
    // the gap between the last virtual and the HOMO is marked, and labelled.
    it('marks the HOMO–LUMO gap with a labelled divider between the virtuals and the occupied orbitals', () => {
        render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        const divider = screen.getByRole('separator', { name: 'HOMO–LUMO gap 0.320 Ha (8.71 eV)' });
        expect(divider).toHaveTextContent('HOMO–LUMO gap 0.320 Ha (8.71 eV)');
        const [lumo, homo] = screen.getAllByRole('button');
        expect(lumo.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(divider.compareDocumentPosition(homo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    // Ruling T16-b: the list opens scrolled so the HOMO is in view -- by
    // scrolling the list itself, so a desktop's right-hand column does not
    // jump to it as scrollIntoView would.
    it('opens scrolled so the HOMO is centred in the list', () => {
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
            if (this.classList.contains('molecule-orbital-list')) return at(100, 200);
            if (this.textContent?.includes('HOMO') && this.tagName === 'BUTTON') return at(520, 30);
            return at(0, 0);
        });
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        // The row's top sits 420 px below the list's; centring a 30 px row in 200 px leaves 85 px above it.
        expect((container.querySelector('.molecule-orbital-list') as HTMLElement).scrollTop).toBe(335);
        rects.mockRestore();
    });
    // D34: the linear-molecule caption names D∞h/C∞v, never PySCF's raw Dooh/Coov.
    it('shows the conventional symbol for a linear molecule\'s point group (D34)', () => {
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVPD" symmetry={{ pointGroup: 'Dooh', labelGroup: 'Coov' }} />);
        expect(container.textContent).toMatch(/D∞h/);
        expect(container.textContent).toMatch(/C∞v/);
        expect(container.textContent).not.toMatch(/Dooh/);
        expect(container.textContent).not.toMatch(/Coov/);
    });
});

describe('MoleculeNav', () => {
    it('opens the picker from the phone header', () => {
        const onOpenPicker = jest.fn();
        render(<MoleculeNav {...navProps} variant="header" onOpenPicker={onOpenPicker} />);
        fireEvent.click(screen.getByRole('button', { name: 'Change molecule, currently Water' }));
        expect(onOpenPicker).toHaveBeenCalled();
    });
    it('shows the picker until a molecule is chosen, then folds it (desktop)', () => {
        const onSelectMolecule = jest.fn();
        const { rerender } = render(<MoleculeNav {...navProps} meta={null} selectedId={null} onSelectMolecule={onSelectMolecule} />);
        fireEvent.click(within(screen.getByRole('list', { name: 'molecules' })).getByRole('button', { name: /Ammonia/ }));
        expect(onSelectMolecule).toHaveBeenCalledWith('nh3');
        rerender(<MoleculeNav {...navProps} onSelectMolecule={onSelectMolecule} />);
        expect(screen.queryByRole('list', { name: 'molecules' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Change molecule' }));
        expect(screen.getByRole('list', { name: 'molecules' })).toBeInTheDocument();
    });
    it('switches surfaces; Orbitals opens at the HOMO', () => {
        const onSurfaceChange = jest.fn();
        render(<MoleculeNav {...navProps} onSurfaceChange={onSurfaceChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Electrostatic potential' }));
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'esp' });
        fireEvent.click(screen.getByRole('button', { name: 'Orbitals' }));
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'mo', index: 4 });
    });
    // Ruling T16-a: on a desktop the orbital list is the right-hand
    // column's (the plot slot); the card names the orbital drawn and says
    // where the list is. A phone's Explore tab keeps it, the Plot tab being
    // out of sight there.
    it('names the orbital drawn rather than repeating the list (desktop), and keeps the list on a phone', () => {
        const { container, rerender } = render(<MoleculeNav {...navProps} surface={{ kind: 'mo', index: 4 }} />);
        expect(container.querySelector('.molecule-orbital-list')).toBeNull();
        expect(container.querySelector('.molecule-nav-orbital')).toHaveTextContent('Showing 1b1 (HOMO), −0.310 Ha (−8.44 eV)');
        rerender(<MoleculeNav {...navProps} variant="body" surface={{ kind: 'mo', index: 4 }} />);
        expect(container.querySelector('.molecule-orbital-list')).not.toBeNull();
    });
    it('states where the geometry and the density come from', () => {
        const { container } = render(<MoleculeNav {...navProps} />);
        expect(container.textContent).toMatch(/Geometry: experiment \(CCCBDB\)/);
        expect(container.textContent).toMatch(/Density, potential and orbitals: B3LYP\/def2-TZVP \(PySCF\)/);
    });
});

describe('readout and view options', () => {
    it('reads out a pick, or says how to get one', () => {
        const { rerender, container } = render(<MoleculeReadout atoms={waterAtoms()} pick={{ kind: 'atom', index: 0 }} geometrySource="experiment (CCCBDB)" touch={false} />);
        expect(container.textContent).toMatch(/∠H–O–H 104\.5°/);
        expect(container.textContent).toMatch(/geometry: experiment \(CCCBDB\)/);
        rerender(<MoleculeReadout atoms={waterAtoms()} pick={null} geometrySource="experiment (CCCBDB)" touch />);
        expect(container.textContent).toMatch(/Tap an atom or bond/);
    });
    it('toggles structure and dipole and states the arrow convention', () => {
        const onShowDipole = jest.fn();
        const { container } = render(<MoleculeViewOptions showStructure showDipole onShowStructure={() => {}} onShowDipole={onShowDipole} dipoleText="μ = 1.86 D" />);
        fireEvent.click(screen.getByLabelText('Dipole arrow'));   // role is checkbox or switch depending on the MUI minor
        expect(onShowDipole).toHaveBeenCalledWith(false);
        expect(container.textContent).toMatch(/points from − to \+/);
    });
    // Ruling T7-O3: ozone's dipole carries meta.caveat beside it, never shown alone.
    it('shows the caveat beside the dipole when the molecule carries one (T7-O3, ozone)', () => {
        const { container } = render(<MoleculeViewOptions showStructure showDipole onShowStructure={() => {}} onShowDipole={() => {}}
            dipoleText="μ = 0.65 D" caveat="Ozone has strong multireference character: single-reference B3LYP overestimates its dipole moment." />);
        expect(container.textContent).toMatch(/μ = 0\.65 D/);
        expect(container.textContent).toMatch(/Ozone has strong multireference character: single-reference B3LYP overestimates its dipole moment\./);
    });
});
