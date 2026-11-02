import React from 'react';
import { render, screen } from '@testing-library/react';
import { FieldScope, ViewportScope } from '../../src/shell/ViewportScope';

// Final review M4: the field's mode has one source. ViewportScope hands the cell its attributes (as FieldScope hands them
// to a window of the field), so the attribute and the MUI theme for the same scope cannot be set from two files.
describe('ViewportScope', () => {
    it('hands its child the field\'s data-theme and data-field, dark on both page modes', () => {
        const { rerender } = render(
            <ViewportScope pageMode="light">{attrs => <main data-testid="cell" {...attrs} />}</ViewportScope>,
        );
        expect(screen.getByTestId('cell')).toHaveAttribute('data-theme', 'dark');
        expect(screen.getByTestId('cell')).toHaveAttribute('data-field', '');
        rerender(<ViewportScope pageMode="dark">{attrs => <main data-testid="cell" {...attrs} />}</ViewportScope>);
        expect(screen.getByTestId('cell')).toHaveAttribute('data-theme', 'dark');
    });

    it('keeps the same element across a page-mode switch (a theme switch never remounts the cell)', () => {
        const { rerender } = render(<ViewportScope pageMode="dark">{attrs => <main data-testid="cell" {...attrs} />}</ViewportScope>);
        const before = screen.getByTestId('cell');
        rerender(<ViewportScope pageMode="light">{attrs => <main data-testid="cell" {...attrs} />}</ViewportScope>);
        expect(screen.getByTestId('cell')).toBe(before);
    });

    it('gives a FieldScope inside it the same attributes', () => {
        render(
            <ViewportScope pageMode="light">
                {() => <FieldScope>{attrs => <header data-testid="window" {...attrs} />}</FieldScope>}
            </ViewportScope>,
        );
        expect(screen.getByTestId('window')).toHaveAttribute('data-theme', 'dark');
        expect(screen.getByTestId('window')).toHaveAttribute('data-field', '');
    });
});
