import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TopBar, { TopBarTab } from '../../src/shell/TopBar';
import { BRAND } from '../../src/design/brands';

const tab = (key: string, label: string, current: boolean, onSelect = jest.fn()): TopBarTab => ({ key, label, href: `/#mode=${key}`, current, onSelect });

describe('TopBar (spec §8.1)', () => {
    it('is the banner: brand home link, area tabs, search slot, theme, help and avatar', () => {
        const onHelp = jest.fn();
        const explore = tab('atom', 'Explore', true);
        const molecules = tab('molecule', 'Molecules', false);
        render(<TopBar brand={BRAND} mode="dark" tabs={[explore, molecules]} search={<input aria-label="search slot" />}
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
        render(<TopBar brand={BRAND} mode="light" tabs={[]} search={null} avatar={null} onHelp={jest.fn()}
            sessionNote="Your owner session has ended. Sign in again to continue." />);
        expect(screen.getByRole('status')).toHaveTextContent('Your owner session has ended. Sign in again to continue.');
    });

    it('shrinks the search to an icon that opens it in a popover below 1100 px (spec §7)', () => {
        render(<TopBar brand={BRAND} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null} onHelp={jest.fn()} compactSearch />);
        expect(screen.queryByLabelText('search slot')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
    });

    // Ruling DX4: the shortcut used to live inside GlobalSearch's 'bar' variant,
    // which is not mounted while the compact popover is closed -- so ⌘K/Ctrl+K
    // went dead between 761 and 1099 px. The top bar owns it instead at this width.
    it('opens the compact search popover with Ctrl+K, since the shortcut cannot live inside an unmounted popover (ruling DX4)', () => {
        render(<TopBar brand={BRAND} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null} onHelp={jest.fn()} compactSearch />);
        expect(screen.queryByLabelText('search slot')).toBeNull();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
    });

    // Final review I1: below 1100 px the search lives in a popover; picking a result used
    // to leave the popover open with focus trapped inside it (GlobalSearch.pick() blurs its
    // input, and MUI's FocusTrap pulls focus back into the paper). The parent bumps
    // searchPickSignal when a pick happens; TopBar closes the popover and returns focus
    // to the icon button that opened it.
    it('closes the compact search popover and returns focus to the icon button when a result is picked (final review I1)', async () => {
        const { rerender } = render(
            <TopBar brand={BRAND} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null}
                onHelp={jest.fn()} compactSearch searchPickSignal={0} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(screen.getByLabelText('search slot')).toBeInTheDocument();
        rerender(
            <TopBar brand={BRAND} mode="dark" tabs={[]} search={<input aria-label="search slot" />} avatar={null}
                onHelp={jest.fn()} compactSearch searchPickSignal={1} />,
        );
        await waitFor(() => expect(screen.queryByLabelText('search slot')).toBeNull());
        expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
    });

    // Ruling T18-a11y-carry (a), spec §13 "arrow keys inside tab rows": the area tabs are one
    // Tab stop (the current area) and the arrow keys, Home and End move between them.
    it('makes the area tabs one Tab stop with the arrow keys inside', () => {
        render(<TopBar brand={BRAND} mode="dark" tabs={[tab('atom', 'Explore', false), tab('molecule', 'Molecules', true)]}
            search={null} avatar={null} onHelp={jest.fn()} />);
        const explore = screen.getByRole('link', { name: 'Explore' });
        const molecules = screen.getByRole('link', { name: 'Molecules' });
        expect([explore.tabIndex, molecules.tabIndex]).toEqual([-1, 0]);
        molecules.focus();
        fireEvent.keyDown(molecules, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(explore);
        fireEvent.keyDown(explore, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(molecules);
        fireEvent.keyDown(molecules, { key: 'Home' });
        expect(document.activeElement).toBe(explore);
    });
});
