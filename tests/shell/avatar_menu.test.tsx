import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AvatarMenu, { initialsOf } from '../../src/shell/AvatarMenu';
import type { OwnerSession } from '../../src/store/jobsSlice';

const session = (over: Partial<OwnerSession> = {}): OwnerSession =>
    ({ configured: true, signedIn: false, email: null, expired: false, error: null, ...over });
const base = { ownerBar: <div>owner bar</div>, onSignIn: jest.fn(), brandId: 'quantumlab' as const, onBrand: jest.fn() };

describe('AvatarMenu (spec §8.1 item 6, §5)', () => {
    it('is absent for a visitor of a build without sign-in (ruling R14)', () => {
        const { container } = render(<AvatarMenu {...base} session={session({ configured: false })} isOwner={false} dev={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('signs a visitor in from one "Owner sign-in" button', () => {
        const onSignIn = jest.fn();
        render(<AvatarMenu {...base} onSignIn={onSignIn} session={session()} isOwner={false} dev={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(onSignIn).toHaveBeenCalled();
    });

    it('shows the owner\'s initials and a menu with the owner bar and the brand preview', () => {
        const onBrand = jest.fn();
        render(<AvatarMenu {...base} onBrand={onBrand} session={session({ signedIn: true, email: 'EyalShacham@pcssoft.com' })} isOwner dev={false} />);
        const button = screen.getByRole('button', { name: 'Owner menu, signed in as EyalShacham@pcssoft.com' });
        expect(button).toHaveTextContent('ES');
        fireEvent.click(button);
        expect(screen.getByText('owner bar')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'NovaLab' }));
        expect(onBrand).toHaveBeenCalledWith('novalab');
    });

    it('hides the brand preview from anyone but the owner, and opens a menu on the dev server', () => {
        render(<AvatarMenu {...base} session={session({ configured: false })} isOwner={false} dev />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(screen.getByText('owner bar')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Brand preview' })).toBeNull();
    });

    it('holds the phone\'s Theme and Help even in a build without sign-in, named "Menu"', () => {
        render(<AvatarMenu {...base} session={session({ configured: false })} isOwner={false} dev={false} extra={<button>theme and help</button>} />);
        fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
        expect(screen.getByRole('button', { name: 'theme and help' })).toBeInTheDocument();
        expect(screen.queryByText('owner bar')).toBeNull();
    });

    it('makes initials from the address', () => {
        expect(initialsOf('eyal.shacham@x.com')).toBe('ES');
        expect(initialsOf('EyalShacham@x.com')).toBe('ES');
        expect(initialsOf('owner@x.com')).toBe('OW');
        expect(initialsOf(null)).toBe('O');
    });
});
