import React from 'react';
import { render, screen } from '@testing-library/react';
import HelpDialog from '../../src/shell/HelpDialog';
import { BRAND } from '../../src/design/brands';
import { EXPORT_ITEMS } from '../../src/export/run_export';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';

describe('HelpDialog (spec §8.1 item 5)', () => {
    it('explains gestures, keys, every export and the app, with no external links', () => {
        render(<HelpDialog open onClose={jest.fn()} brand={BRAND} aboutModel={<p>central-field model text</p>} />);
        const dialog = screen.getByRole('dialog', { name: 'Help' });
        expect(dialog).toHaveTextContent(/drag to rotate/i);
        expect(dialog).toHaveTextContent(/pinch|scroll/i);
        expect(dialog).toHaveTextContent('Ctrl+K');
        for (const item of EXPORT_ITEMS) expect(dialog).toHaveTextContent(item.label);
        expect(dialog).toHaveTextContent('QuantumLab');
        expect(dialog).toHaveTextContent(`molecule data ${MOLECULE_DATA_VERSION}`);
        expect(dialog).toHaveTextContent('Methods are stated beside every number.');
        expect(dialog).toHaveTextContent('central-field model text');
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    // Final review I1 (ruled): a link opens at its sender's level, above or below the reader's, floored at its view's.
    it('says a shared link opens at the level its sender chose, never below what its view needs', () => {
        render(<HelpDialog open onClose={jest.fn()} brand={BRAND} />);
        const dialog = screen.getByRole('dialog', { name: 'Help' });
        expect(dialog).toHaveTextContent('A shared link opens at the level its sender chose, or at your own, and never below what its view needs; '
            + 'that is for the visit only, and your own level stays as you set it.');
    });
});
