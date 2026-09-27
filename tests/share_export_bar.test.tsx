import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ShareExportBar from '../src/components/ShareExportBar';
import { EXPORT_ITEMS, ExportAvailability } from '../src/export/run_export';

describe('ShareExportBar: Share', () => {
    it('says the link was copied', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'copied' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
    });

    // Review Focus 5.
    it('shows the link to copy by hand when the clipboard is refused', async () => {
        render(<ShareExportBar onShare={async () => ({ kind: 'manual', url: 'http://x/#mode=atom&Z=26' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(await screen.findByRole('textbox', { name: /link to this view/i })).toHaveValue('http://x/#mode=atom&Z=26');
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
});
