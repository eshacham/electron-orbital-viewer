import React from 'react';
import { render, screen } from '@testing-library/react';
import HelpDialog from '../../src/shell/HelpDialog';
import { BRAND } from '../../src/design/brands';
import { EXPORT_ITEMS } from '../../src/export/run_export';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';
import { CONTROL_LEVEL, LEVEL_LABEL, type ControlId, type LearningLevel } from '../../src/levels/levels';

/** How Help names each gated control (final review M5); the owner's molecule requests are not a reader's. */
const HELP_NAME: Record<Exclude<ControlId, 'requestWorkspace'>, string> = {
    plot: 'the plot and data', structure: 'structure options', bondLabels: 'bond labels', dipole: 'the dipole arrow',
    orbitalEnergies: 'orbital energies', properties: 'properties', axes: 'axes', charge: 'charge', excite: 'excitation',
    relativity: 'relativity', combinations: 'combinations and fields', enclosed: 'the enclosed fraction',
    allOrbitals: 'every orbital', exports: 'exports', advancedAppearance: 'advanced appearance', surfaceStyle: 'surface style',
};

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

    // Final review M5: each level's line says what it adds, true to CONTROL_LEVEL -- every gated control on the line of
    // the level it appears at -- and never claims "full precision" (only Bonds' total energy changes at Research).
    it('names each control on the line of the level it appears at, and nothing Research does not add', () => {
        render(<HelpDialog open onClose={jest.fn()} brand={BRAND} />);
        const lines = Object.fromEntries(screen.getAllByRole('listitem')
            .map(item => item.textContent ?? '')
            .filter(text => /^(Basics|Explore|Advanced|Research):/.test(text))
            .map(text => [text.slice(0, text.indexOf(':')), text]));
        expect(Object.keys(lines)).toEqual(['Basics', 'Explore', 'Advanced', 'Research']);
        for (const [id, name] of Object.entries(HELP_NAME) as [Exclude<ControlId, 'requestWorkspace'>, string][]) {
            const at: LearningLevel = CONTROL_LEVEL[id];
            expect([id, lines[LEVEL_LABEL[at]].includes(name)]).toEqual([id, true]);
        }
        expect(screen.getByRole('dialog', { name: 'Help' })).not.toHaveTextContent('full precision');
        expect(lines.Research).toContain('How this was computed');
    });
});
