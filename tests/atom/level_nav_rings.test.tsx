import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import LevelNav from '../../src/components/LevelNav';
import { shellAtRadius, shellBandRadius, pickableRingProfile, type ShellPickProfile } from '../../src/atom/shell_pick';

// Panel fixes P3: a shell chip and its ring on the 3D cut face point at each other, at the whole-atom level only.
// Argon's three shells (K, L, M) on a short log grid, three grid points each.
const profileA = (): ShellPickProfile => ({
    rMin: 0.01, dx: Math.log(10) / 4, size: 9,
    shellIndexAtR: Float32Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]),
    shells: [{ n: 1 }, { n: 2 }, { n: 3 }],
    // Final review I1: the band radius scans only the drawn extent; the whole grid (out to r = 1) is drawn here.
    displayRadius: 2,
});
// The same atom after a re-solve onto another grid: the M shell now owns the middle, so the band moves.
const profileB = (): ShellPickProfile => ({
    rMin: 0.02, dx: 0.3, size: 9,
    shellIndexAtR: Float32Array.from([0, 0, 1, 1, 2, 2, 2, 2, 2]),
    shells: [{ n: 1 }, { n: 2 }, { n: 3 }],
    // Final review I1: drawn past its last grid point (r = 0.22), as profileA is.
    displayRadius: 0.5,
});

const noop = () => {};
const chip = (name: RegExp) => screen.getByRole('button', { name });
const props = { Z: 18, selectedShell: null, selectedSubshell: null, selectedOrbital: null, onNavigate: noop } as const;

describe('LevelNav: shell chips linked to the rings (panel fixes P3)', () => {
    it('marks the chip of the shell under the hovered radius, and no other', () => {
        const profile = profileA();
        const r = shellBandRadius(profile, 2) as number;
        const { container } = render(<LevelNav {...props} ringProfile={profile} hoverRadius={r} onHoverRadius={noop} />);
        const linked = [...container.querySelectorAll('.level-nav-shell-chip.linked')];
        expect(linked).toHaveLength(1);
        expect(linked[0]).toHaveTextContent(/^L/);
    });

    it('never styles a selected chip as linked', () => {
        const profile = profileA();
        const r = shellBandRadius(profile, 2) as number;
        const { container } = render(
            <LevelNav {...props} selectedShell={2} ringProfile={profile} hoverRadius={r} onHoverRadius={noop} />
        );
        expect(container.querySelector('.level-nav-shell-chip.selected')).toHaveTextContent(/^L/);
        expect(container.querySelector('.level-nav-shell-chip.linked')).toBeNull();
    });

    it('links nothing without a pickable ring profile (a shell, subshell or orbital level), nor with nothing hovered', () => {
        const profile = profileA();
        const r = shellBandRadius(profile, 2) as number;
        const { container, rerender } = render(<LevelNav {...props} hoverRadius={r} onHoverRadius={noop} />);
        expect(container.querySelector('.linked')).toBeNull();
        rerender(<LevelNav {...props} ringProfile={profile} hoverRadius={null} onHoverRadius={noop} />);
        expect(container.querySelector('.linked')).toBeNull();
    });

    it.each([
        ['hovering', 'mouseEnter', 'mouseLeave'],
        ['focusing', 'focus', 'blur'],
    ] as const)('%s the M chip points at the M band; leaving it sends nothing while the store does not hold that radius', (_how, enter, leave) => {
        const profile = profileA();
        const onHoverRadius = jest.fn();
        render(<LevelNav {...props} ringProfile={profile} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent[enter](chip(/^M/));
        expect(onHoverRadius).toHaveBeenCalledTimes(1);
        const r = onHoverRadius.mock.calls[0][0] as number;
        expect(shellAtRadius(profile, r)).toBe(3);
        expect(r).toBe(shellBandRadius(profile, 3));
        fireEvent[leave](chip(/^M/));
        // The store would now hold r: the chip's own hover is the one it clears.
        expect(onHoverRadius).toHaveBeenCalledTimes(1);
    });

    it('clears the hover it set, once the store holds it', () => {
        const profile = profileA();
        const onHoverRadius = jest.fn();
        const { rerender } = render(<LevelNav {...props} ringProfile={profile} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseEnter(chip(/^M/));
        const r = onHoverRadius.mock.calls[0][0] as number;
        rerender(<LevelNav {...props} ringProfile={profile} hoverRadius={r} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseLeave(chip(/^M/));
        expect(onHoverRadius).toHaveBeenLastCalledWith(null);
    });

    it('does not clobber a canvas hover that took over while the pointer was on the chip', () => {
        const profile = profileA();
        const onHoverRadius = jest.fn();
        const { rerender } = render(<LevelNav {...props} ringProfile={profile} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseEnter(chip(/^M/));
        // The canvas (or the plot) now holds another radius.
        rerender(<LevelNav {...props} ringProfile={profile} hoverRadius={shellBandRadius(profile, 1)} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseLeave(chip(/^M/));
        expect(onHoverRadius).toHaveBeenCalledTimes(1);
        expect(onHoverRadius).not.toHaveBeenCalledWith(null);
    });

    it('does not clear a canvas hover it never set', () => {
        const profile = profileA();
        const onHoverRadius = jest.fn();
        render(<LevelNav {...props} ringProfile={profile} hoverRadius={shellBandRadius(profile, 1)} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseLeave(chip(/^M/));
        fireEvent.blur(chip(/^M/));
        expect(onHoverRadius).not.toHaveBeenCalled();
    });

    it('recomputes the band from the new profile when the atom changes', () => {
        const onHoverRadius = jest.fn();
        const { rerender } = render(<LevelNav {...props} ringProfile={profileA()} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseEnter(chip(/^M/));
        fireEvent.mouseLeave(chip(/^M/));
        const b = profileB();
        rerender(<LevelNav {...props} ringProfile={b} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseEnter(chip(/^M/));
        const r = onHoverRadius.mock.calls.at(-1)![0] as number;
        expect(r).toBe(shellBandRadius(b, 3));
        expect(shellAtRadius(b, r)).toBe(3);
    });

    it('lets go of a chip hover when the rings stop being pickable under it (the chip opened a shell)', () => {
        const profile = profileA();
        const onHoverRadius = jest.fn();
        const { rerender } = render(<LevelNav {...props} ringProfile={profile} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseEnter(chip(/^M/));
        const r = onHoverRadius.mock.calls[0][0] as number;
        rerender(<LevelNav {...props} ringProfile={profile} hoverRadius={r} onHoverRadius={onHoverRadius} />);
        rerender(<LevelNav {...props} selectedShell={3} ringProfile={null} hoverRadius={r} onHoverRadius={onHoverRadius} />);
        expect(onHoverRadius).toHaveBeenLastCalledWith(null);
    });

    it('sends nothing at a level where the rings are not pickable', () => {
        const onHoverRadius = jest.fn();
        render(<LevelNav {...props} hoverRadius={null} onHoverRadius={onHoverRadius} />);
        fireEvent.mouseEnter(chip(/^M/));
        fireEvent.focus(chip(/^M/));
        fireEvent.mouseLeave(chip(/^M/));
        expect(onHoverRadius).not.toHaveBeenCalled();
    });
});

// Review of the first commit: the rings are pickable, and so the chips link, in one place only.
describe('pickableRingProfile', () => {
    const profile = profileA();
    const at = { mode: 'atom', level: 'atom', unbound: null, profile };
    it('is the profile at the whole-atom level of a bound species in Atoms', () => {
        expect(pickableRingProfile(at)).toBe(profile);
    });
    it.each([
        ['a shell', { level: 'shell' }],
        ['a subshell', { level: 'subshell' }],
        ['an orbital', { level: 'orbital' }],
        ['an unbound species', { unbound: { reason: 'anion' } }],
        ['Basics (hydrogenic)', { mode: 'hydrogenic' }],
        ['Molecules', { mode: 'molecule' }],
        ['no solved profile', { profile: null }],
    ])('is null for %s, so no chip links and no chip hover is sent', (_what, change) => {
        expect(pickableRingProfile({ ...at, ...change })).toBeNull();
    });
});
