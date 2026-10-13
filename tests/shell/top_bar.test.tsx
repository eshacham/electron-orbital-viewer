import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopBar, { TopBarTab } from '../../src/shell/TopBar';
import { BRANDS } from '../../src/design/brands';

const tab = (key: string, label: string, current: boolean, onSelect = jest.fn()): TopBarTab => ({ key, label, href: `/#mode=${key}`, current, onSelect });

describe('TopBar (spec §8.1)', () => {
    it('is the banner: brand home link, area tabs, search slot, theme, help and avatar', () => {
        const onHelp = jest.fn();
        const explore = tab('atom', 'Explore', true);
        const molecules = tab('molecule', 'Molecules', false);
        render(<TopBar brand={BRANDS[0]} mode="dark" tabs={[explore, molecules]} search={<input aria-label="search slot" />}
            avatar={<button>avatar slot</button>} onHelp={onHelp} />);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'QuantumLab, home' })).toHaveAttribute('href', '/');
        expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'Molecules' })).not.toHaveAttribute('aria-current');
        fireEvent.click(screen.getByRole('link', { name: 'Molecules' }));
        expect(molecules.onSelect).toHaveBeenCalled();
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Theme: / })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Help' }));
        expect(onHelp).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'avatar slot' })).toBeInTheDocument();
    });

    it('says a session ended beside the avatar, in today\'s words', () => {
        render(<TopBar brand={BRANDS[0]} mode="light" tabs={[]} search={null} avatar={null} onHelp={jest.fn()}
            sessionNote="Your owner session has ended. Sign in again to continue." />);
        expect(screen.getByRole('status')).toHaveTextContent('Your owner session has ended. Sign in again to continue.');
    });
});
