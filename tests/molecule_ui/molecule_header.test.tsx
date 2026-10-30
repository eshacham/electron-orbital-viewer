// tests/molecule_ui/molecule_header.test.tsx -- Molecules' Explore header tile (Phase 6G-2 Task 12, rulings P1, R22c).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MoleculeHeader from '../../src/molecule_ui/MoleculeHeader';
import MoleculePickerDialog from '../../src/components/MoleculePickerDialog';
import { formatFormula } from '../../src/molecules/catalogue';
import { LIBRARY_INDEX, waterMeta } from '../molecules/fixtures';

const props = {
    entries: LIBRARY_INDEX, indexError: null, meta: waterMeta(), selectedId: 'h2o', isLoading: false, onSelectMolecule: jest.fn(),
};

describe('MoleculeHeader (spec §9.4 Build, ruling P1)', () => {
    it('names the molecule and gives its formula, without repeating the tier badge (R22c: it is in the title block)', () => {
        const { container } = render(<MoleculeHeader {...props} />);
        expect(container.querySelector('.molecule-tile-name')).toHaveTextContent(/^Water$/);
        expect(container.querySelector('.molecule-tile-formula')).toHaveTextContent(formatFormula('H2O'));
        expect(container.querySelector('.tier-badge')).toBeNull();
        expect(screen.queryByText('Library')).toBeNull();
    });

    it('names the molecule from the index while its meta is still loading, and says it is loading', () => {
        const { container } = render(<MoleculeHeader {...props} meta={null} selectedId="nh3" isLoading />);
        expect(container.querySelector('.molecule-tile-name')).toHaveTextContent(/^Ammonia$/);
        expect(container.querySelector('.molecule-tile-formula')).toHaveTextContent(formatFormula('NH3'));
        expect(container).toHaveTextContent(/loading/i);
    });

    it('asks for a molecule when none is chosen', () => {
        render(<MoleculeHeader {...props} meta={null} selectedId={null} />);
        expect(screen.getByRole('button', { name: 'Choose a molecule' })).toBeInTheDocument();
    });

    it('opens the picker as a popover from "Change" and its chevron, with the search box and the category chips; choosing selects and closes', async () => {
        const onSelectMolecule = jest.fn();
        render(<MoleculeHeader {...props} onSelectMolecule={onSelectMolecule} />);
        const change = screen.getByRole('button', { name: 'Change molecule' });
        // WCAG 2.5.3: the visible label is inside the accessible name.
        expect(change).toHaveTextContent(/^Change$/);
        expect(change.querySelector('svg[data-testid="ExpandMoreIcon"]')).toHaveAttribute('aria-hidden', 'true');
        expect(change).toHaveAttribute('aria-haspopup', 'dialog');
        expect(change).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(change);
        const popover = screen.getByRole('dialog', { name: 'Choose a molecule' });
        expect(change).toHaveAttribute('aria-expanded', 'true');
        // A popover under the button, not the phone's full-screen dialog.
        expect(popover).toHaveClass('molecule-list-popover');
        expect(within(popover).getByRole('textbox', { name: 'filter molecules' })).toBeInTheDocument();
        expect(within(popover).getByRole('group', { name: 'molecule categories' })).toBeInTheDocument();
        fireEvent.click(within(within(popover).getByRole('list', { name: 'molecules' })).getByRole('button', { name: /Ammonia/ }));
        expect(onSelectMolecule).toHaveBeenCalledWith('nh3');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    // Review M2: Esc closes the popover and gives focus back to the button that opened it.
    it('closes the popover on Esc and returns focus to "Change"', async () => {
        render(<MoleculeHeader {...props} />);
        const change = screen.getByRole('button', { name: 'Change molecule' });
        change.focus(); // a real click focuses the button; fireEvent.click does not
        fireEvent.click(change);
        const popover = screen.getByRole('dialog', { name: 'Choose a molecule' });
        await waitFor(() => expect(within(popover).getByRole('textbox', { name: 'filter molecules' })).toHaveFocus());
        fireEvent.keyDown(popover, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(change).toHaveFocus();
        expect(change).toHaveAttribute('aria-expanded', 'false');
    });

    // Ruling T12-I2: a library that failed to load is said under the tile, not only inside the popover.
    it('says, under the tile, that the library could not be loaded', () => {
        render(<MoleculeHeader {...props} entries={null} indexError="HTTP 503" meta={null} selectedId={null} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load the molecule library: HTTP 503');
    });

    it('leaves the load failure to the inline list in a phone\'s Explore tab (compact)', () => {
        render(<MoleculeHeader {...props} entries={null} indexError="HTTP 503" meta={null} selectedId={null} compact onOpenPicker={jest.fn()} />);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('compact (a phone\'s Explore tab): one row, and Change opens the phone\'s full-screen picker rather than a popover', () => {
        const onOpenPicker = jest.fn();
        const { container } = render(<MoleculeHeader {...props} compact onOpenPicker={onOpenPicker} />);
        expect(container.querySelector('.molecule-tile')).toHaveClass('compact');
        fireEvent.click(screen.getByRole('button', { name: 'Change molecule' }));
        expect(onOpenPicker).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('MoleculePickerDialog variant="popover" (as ElementPickerDialog has)', () => {
    it('hangs under its anchor with the filter focused; Enter picks the first match and closes', async () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const onSelect = jest.fn();
        const onClose = jest.fn();
        render(<MoleculePickerDialog variant="popover" anchorEl={anchor} open entries={LIBRARY_INDEX} error={null} selectedId="h2o"
            onSelect={onSelect} onClose={onClose} />);
        const popover = screen.getByRole('dialog', { name: 'Choose a molecule' });
        const filter = within(popover).getByRole('textbox', { name: 'filter molecules' });
        await waitFor(() => expect(filter).toHaveFocus());
        fireEvent.change(filter, { target: { value: 'ozone' } });
        fireEvent.keyDown(filter, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('o3');
        expect(onClose).toHaveBeenCalled();
        anchor.remove();
    });

    it('keeps the full-screen dialog as its default (the phone)', () => {
        render(<MoleculePickerDialog open entries={LIBRARY_INDEX} error={null} selectedId="h2o" onSelect={jest.fn()} onClose={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'close molecule picker' })).toBeInTheDocument();
    });
});
