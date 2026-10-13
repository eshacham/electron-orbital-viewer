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

    it('shrinks the search to an icon that opens it in a popover below 1100 px (spec §7)', () => {
        render(<TopBar brand={BRANDS[0]} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null} onHelp={jest.fn()} compactSearch />);
        expect(screen.queryByLabelText('search slot')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
    });

    // Ruling DX4: the shortcut used to live inside GlobalSearch's 'bar' variant,
    // which is not mounted while the compact popover is closed -- so ⌘K/Ctrl+K
    // went dead between 761 and 1099 px. The top bar owns it instead at this width.
    it('opens the compact search popover with Ctrl+K, since the shortcut cannot live inside an unmounted popover (ruling DX4)', () => {
        render(<TopBar brand={BRANDS[0]} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null} onHelp={jest.fn()} compactSearch />);
        expect(screen.queryByLabelText('search slot')).toBeNull();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
    });
});
