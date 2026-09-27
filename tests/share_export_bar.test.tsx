import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
