import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ShareExportBar from '../src/components/ShareExportBar';
import { EXPORT_ITEMS, ExportAvailability } from '../src/export/run_export';

describe('ShareExportBar: Share', () => {
    it('says the link was copied', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'copied' })} />);
        // Task 2: Share is a menu now (Copy link, Opens at); the copy is its first item.
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
    });

    // Review Focus 5.
    it('shows the link to copy by hand when the clipboard is refused', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'manual', url: 'http://x/#mode=atom&Z=26' })} />);
        // Task 2: Share is a menu now (Copy link, Opens at); the copy is its first item.
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        expect(await screen.findByRole('textbox', { name: /link to this view/i })).toHaveValue('http://x/#mode=atom&Z=26');
    });
});

describe('ShareExportBar: Opens at (Task 2)', () => {
    it('opens a menu with Copy link and the Opens at choices, the recipient\'s own level chosen', () => {
        render(<ShareExportBar onShare={jest.fn()} />);
        const button = screen.getByRole('button', { name: 'Share' });
        expect(button).toHaveAttribute('aria-haspopup', 'menu');
        fireEvent.click(button);
        expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument();
        expect(screen.getByText('Opens at')).toBeInTheDocument();
        const radios = screen.getAllByRole('menuitemradio').map(item => item.textContent);
        expect(radios).toEqual(['Recipient’s level', 'Basics', 'Explore', 'Advanced', 'Research']);
        expect(screen.getByRole('menuitemradio', { name: 'Opens at Recipient’s level' })).toHaveAttribute('aria-checked', 'true');
    });

    it('Copy link shares at the recipient\'s own level', async () => {
        const onShare = jest.fn().mockResolvedValue({ kind: 'copied' });
        render(<ShareExportBar onShare={onShare} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(onShare).toHaveBeenCalledWith(undefined));
        expect(await screen.findByText('Link copied — it opens this exact view.')).toBeInTheDocument();
    });

    it('a chosen Opens at level is kept, and the next copy opens at it', async () => {
        const onShare = jest.fn().mockResolvedValue({ kind: 'copied' });
        render(<ShareExportBar onShare={onShare} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Opens at Basics' }));
        // A radio chooses; it does not copy, and the menu stays open for Copy link.
        expect(onShare).not.toHaveBeenCalled();
        expect(screen.getByRole('menuitemradio', { name: 'Opens at Basics' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(onShare).toHaveBeenCalledWith('basics'));
        expect(await screen.findByText('Link copied — it opens this exact view, at Basics.')).toBeInTheDocument();
    });

    it('the copy-by-hand dialog names the level the link opens at', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'manual', url: 'http://x/#mode=atom&Z=26&lvl=advanced' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Opens at Advanced' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await screen.findByRole('textbox', { name: /link to this view/i });
        expect(screen.getByText('Opens at Advanced')).toBeInTheDocument();
    });

    it('below Advanced it hides Snapshot and Export, and the Share menu says where they appear', () => {
        render(<ShareExportBar variant="toolbar" level="explore" onShare={jest.fn()} onExport={jest.fn()} availability={allAvailable()} />);
        expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Snapshot' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(screen.getByText('Exports appear at Advanced')).toBeInTheDocument();
    });

    it('at Advanced it shows Snapshot and Export', () => {
        render(<ShareExportBar variant="toolbar" level="advanced" onShare={jest.fn()} onExport={jest.fn()} availability={allAvailable()} />);
        expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Snapshot' })).toBeInTheDocument();
    });
});

const allAvailable = (): ExportAvailability =>
    Object.fromEntries(EXPORT_ITEMS.map(item => [item.kind, null])) as ExportAvailability;
const share = async () => ({ kind: 'copied' as const });

describe('ShareExportBar: Export', () => {
    it('lists every export, with the reason when one is unavailable', () => {
        const availability = { ...allAvailable(), csv: 'Waiting for the atom to finish solving.' };
        render(<ShareExportBar onShare={share} onExport={jest.fn()} availability={availability} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        const item = screen.getByRole('menuitem', { name: /radial curves/i });
        expect(item).toHaveAttribute('aria-disabled', 'true');
        expect(item).toHaveTextContent('Waiting for the atom to finish solving.');
    });

    // Final review M5: an unavailable item's reason is only heard if the item
    // can be reached -- MUI skips disabled items in keyboard navigation unless
    // the list says otherwise.
    it('lets the keyboard reach an unavailable item, so its reason is read out, without running it', () => {
        const onExport = jest.fn();
        const availability = { ...allAvailable(), png: 'Wait for the picture to finish computing.', 'png-plain': 'Wait for the picture to finish computing.' };
        render(<ShareExportBar onShare={share} onExport={onExport} availability={availability} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        const csv = screen.getByRole('menuitem', { name: /radial curves/i });
        expect(csv).toHaveFocus();
        fireEvent.keyDown(csv, { key: 'ArrowUp' });
        const plain = screen.getByRole('menuitem', { name: /view only/i });
        expect(plain).toHaveFocus();
        expect(plain).toHaveAttribute('aria-disabled', 'true');
        expect(plain).toHaveAccessibleName(expect.stringContaining('Wait for the picture to finish computing.'));
        fireEvent.keyDown(plain, { key: 'Enter' });
        fireEvent.click(plain);
        expect(onExport).not.toHaveBeenCalled();
    });

    it('runs the chosen export and shows why one failed', async () => {
        const onExport = jest.fn().mockRejectedValue(new Error('Nothing is drawn yet.'));
        render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /radial curves/i }));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('csv', {}));
        expect(await screen.findByText('Nothing is drawn yet.')).toBeInTheDocument();
    });

    // Fix round 1, M7: the button follows the WAI-ARIA menu-button pattern.
    it('marks the Export button as a menu button, open or closed', () => {
        render(<ShareExportBar onShare={share} onExport={jest.fn()} availability={allAvailable()} />);
        const button = screen.getByRole('button', { name: 'Export' });
        expect(button).toHaveAttribute('aria-haspopup', 'menu');
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(button).not.toHaveAttribute('aria-controls');
        fireEvent.click(button);
        expect(button).toHaveAttribute('aria-expanded', 'true');
        expect(button).toHaveAttribute('aria-controls', 'export-menu');
    });

    // Fix round 1, M6: MUI's Snackbar only starts its auto-hide timer once,
    // when it first opens -- a later message swapped in while it is still
    // open (Preparing export… -> a failure) used to inherit whatever was
    // left of the first message's own window, which could hide an error the
    // user had not had time to read. Keying the Snackbar on each new notice
    // forces a fresh mount, and so a fresh timer, per message.
    it('gives a message that arrives late its own full 4s, not what was left of the previous one\'s', async () => {
        jest.useFakeTimers();
        try {
            let rejectExport: (error: Error) => void = () => {};
            const onExport = jest.fn(() => new Promise<void>((_resolve, reject) => { rejectExport = reject; }));
            render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
            fireEvent.click(screen.getByRole('button', { name: 'Export' }));
            fireEvent.click(screen.getByRole('menuitem', { name: /radial curves/i }));
            expect(screen.getByText('Preparing export…')).toBeInTheDocument();

            // Almost through "Preparing export…"'s own 4s window.
            act(() => { jest.advanceTimersByTime(3900); });
            await act(async () => { rejectExport(new Error('Nothing is drawn yet.')); });
            expect(screen.getByText('Nothing is drawn yet.')).toBeInTheDocument();

            // Only 100ms would have been left on the old window -- if the
            // timer had not restarted, this would already have closed it.
            act(() => { jest.advanceTimersByTime(200); });
            expect(screen.getByText('Nothing is drawn yet.')).toBeInTheDocument();

            // Its own fresh window does eventually close it.
            act(() => { jest.advanceTimersByTime(4000); });
            expect(screen.queryByText('Nothing is drawn yet.')).not.toBeInTheDocument();
        } finally {
            jest.useRealTimers();
        }
    });

    // Fix round 1, M6: a cube can take longer to build than the notice's
    // usual 4s window, and a second click on Export while one build is
    // already running would start a second, overlapping one.
    it('keeps "Preparing export…" open past 4s while a build is in flight, and disables Export meanwhile', async () => {
        jest.useFakeTimers();
        try {
            let resolveExport: () => void = () => {};
            const onExport = jest.fn(() => new Promise<void>(resolve => { resolveExport = resolve; }));
            render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
            fireEvent.click(screen.getByRole('button', { name: 'Export' }));
            fireEvent.click(screen.getByRole('menuitem', { name: /field grid/i }));
            expect(screen.getByText('Preparing export…')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();

            // Long past the usual 4s auto-hide window -- still building, still shown.
            act(() => { jest.advanceTimersByTime(10000); });
            expect(screen.getByText('Preparing export…')).toBeInTheDocument();

            await act(async () => { resolveExport(); });
            expect(screen.queryByText('Preparing export…')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not let a second click start a second build while one is already running', async () => {
        let resolveExport: () => void = () => {};
        const onExport = jest.fn(() => new Promise<void>(resolve => { resolveExport = resolve; }));
        render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /field grid/i }));

        // The Export button is disabled now, so this click reaches nothing.
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        await act(async () => { resolveExport(); });
        expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('asks for a print size before exporting STL', async () => {
        const onExport = jest.fn().mockResolvedValue(undefined);
        render(<ShareExportBar onShare={share} onExport={onExport} availability={allAvailable()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /3D print/i }));
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /longest side/i }));
        fireEvent.click(screen.getByRole('option', { name: '80 mm' }));
        fireEvent.click(screen.getByRole('button', { name: /export stl/i }));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('stl', { longestSideMm: 80 }));
    });

    // Ruling T10-I1: several solids are each watertight, the file as a whole is not.
    it('says when the print holds several overlapping solids, and not when it holds one', () => {
        const { unmount } = render(<ShareExportBar onShare={share} onExport={jest.fn()} availability={allAvailable()} stlSolids={() => 4} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        expect(screen.getByRole('menuitem', { name: /3D print/i })).toHaveTextContent('each solid watertight, in millimetres');
        fireEvent.click(screen.getByRole('menuitem', { name: /3D print/i }));
        expect(screen.getByText('4 overlapping solids, each watertight; your slicer merges them into one.')).toBeInTheDocument();
        unmount();

        render(<ShareExportBar onShare={share} onExport={jest.fn()} availability={allAvailable()} stlSolids={() => 1} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /3D print/i }));
        expect(screen.getByRole('dialog')).not.toHaveTextContent(/overlapping solids/);
    });
});

describe('ShareExportBar as the viewport toolbar (spec §8.5)', () => {
    it('names its icon buttons as the bar did, and Snapshot exports the captioned PNG directly', async () => {
        const onExport = jest.fn().mockResolvedValue(undefined);
        render(<ShareExportBar variant="toolbar" onShare={jest.fn()} onExport={onExport} availability={allAvailable()} />);
        expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('id', 'share-view');
        expect(screen.getByRole('button', { name: 'Export' })).toHaveAttribute('id', 'export-view');
        fireEvent.click(screen.getByRole('button', { name: 'Snapshot' }));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('png', {}));
    });
});
