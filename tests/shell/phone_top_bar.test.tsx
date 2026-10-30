import React from 'react';
import { render, screen } from '@testing-library/react';
import PhoneTopBar from '../../src/shell/PhoneTopBar';
import { BRAND } from '../../src/design/brands';

// Final polish F2: the mode menu's "▾" is a hidden MUI icon, and the button's name is unchanged.
describe('PhoneTopBar mode button', () => {
    it('names the mode, draws its chevron as a hidden icon, and has no glyph in its text', () => {
        render(<PhoneTopBar brand={BRAND} themeMode="dark" mode="atom" onModeChange={jest.fn()} onOpenSearch={jest.fn()} avatar={null} />);
        const button = screen.getByRole('button', { name: /^Mode: / });
        expect(button.querySelector('svg[data-testid="ExpandMoreIcon"]')).toHaveAttribute('aria-hidden', 'true');
        expect(button.textContent).not.toMatch(/[▾▴‹›]/);
        expect(button.textContent).toBe('Atoms');
    });
});
