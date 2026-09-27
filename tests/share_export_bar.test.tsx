import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShareExportBar from '../src/components/ShareExportBar';

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
