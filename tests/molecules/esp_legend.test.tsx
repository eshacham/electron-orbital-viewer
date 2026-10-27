import React from 'react';
import { render, screen } from '@testing-library/react';
import EspLegend from '../../src/components/EspLegend';
import { ESP_STOPS, espRangeNote, espSurfaceNote, ESP_SIGN_NOTE } from '../../src/molecules/esp_color';

describe('EspLegend', () => {
    // Task 7b: the key keeps its bar, its fixed scale and units, and names its two ends; the notes it printed (or kept
    // behind its ⓘ) -- the colours, the fixed ρ = 0.001 surface, the method, this molecule's range -- are Info's
    // sentences now (tests/info/molecule_info.test.ts).
    it('states the scale and its units, and names its ends electron-rich and electron-poor', () => {
        const { container } = render(<EspLegend />);
        expect(screen.getByText('−0.05')).toBeInTheDocument();
        expect(screen.getByText('+0.05 Ha/e')).toBeInTheDocument();
        const ends = container.querySelector('.esp-legend-ends') as HTMLElement;
        expect([...ends.children].map(end => end.textContent)).toEqual(['electron-rich', 'electron-poor']);
        expect(container.querySelector('[data-gradient]')?.getAttribute('data-gradient')).toMatch(/^linear-gradient/);
        expect(container.textContent).not.toMatch(/kcal|fixed at|this molecule/);
    });

    // The ends' words follow the colours: the negative (left) end is red, ESP_STOPS' first stop.
    it('puts electron-rich at the negative, red end of the bar', () => {
        expect(ESP_STOPS[0]).toEqual({ t: -1, hex: '#b2182b' });
        render(<EspLegend />);
        expect(screen.getByText('−0.05').compareDocumentPosition(screen.getByText('+0.05 Ha/e')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByText('electron-rich').compareDocumentPosition(screen.getByText('electron-poor')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // Task 7b: the ⓘ toggle that showed the notes is an (i) on the map's term, which opens Info on it.
    it('has an (i) on the electrostatic potential, and no notes toggle', () => {
        render(<EspLegend compact />);
        expect(screen.getByRole('button', { name: 'About Electrostatic potential' })).toHaveClass('info-button');
        expect(screen.queryByRole('button', { name: 'about this colour key' })).toBeNull();
    });

    it('is compact on request', () => {
        const { container, rerender } = render(<EspLegend />);
        expect(container.querySelector('.esp-legend.compact')).toBeNull();
        rerender(<EspLegend compact />);
        expect(container.querySelector('.esp-legend.compact')).not.toBeNull();
    });

    // The PNG export's key still prints the notes, word for word (export/run_export.ts reads these).
    it('leaves the export key\'s notes as they were', () => {
        expect(ESP_SIGN_NOTE).toBe('red: negative, electron-rich · blue: positive, electron-poor · ±31 kcal/mol');
        expect(espSurfaceNote('B3LYP/def2-TZVP')).toBe('fixed at ρ = 0.001 e/a₀³ (not an enclosed fraction) · B3LYP/def2-TZVP');
        expect(espRangeNote([-0.061, 0.071])).toBe('this molecule: −0.061 to +0.071 Ha/e, saturated beyond the scale');
        expect(espRangeNote([-0.02, 0.019])).toBe('this molecule: −0.020 to +0.019 Ha/e');
    });
});
