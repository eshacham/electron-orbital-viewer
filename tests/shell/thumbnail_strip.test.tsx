import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ThumbnailStrip from '../../src/shell/ThumbnailStrip';
import { atomStripItems } from '../../src/thumbs/strip_items';
import { thumbnailService, type ThumbHost } from '../../src/thumbs/ThumbnailService';
import { neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';

const profile = neonProfile();
const rGrid = Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
const items = atomStripItems({ profile, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

describe('ThumbnailStrip (spec §9.1, §13)', () => {
    it('is a listbox of labelled options, grouped by subshell, the shown orbital selected', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={jest.fn()} />);
        const list = screen.getByRole('listbox', { name: 'orbitals in view' });
        expect(screen.getByRole('group', { name: '2p' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '2p_z' })).toHaveAttribute('aria-selected', 'true');
        // Every tile but the back tile (an arrow) draws into its own 2D canvas -- never a WebGL one.
        expect(list.querySelectorAll('canvas.thumb-canvas')).toHaveLength(items.length - 1);
    });

    it('selects with a click or Enter, moves with the arrows, and folds to its handle', () => {
        const onSelect = jest.fn();
        const onCollapsedChange = jest.fn();
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={onSelect} onCollapsedChange={onCollapsedChange} />);
        fireEvent.click(screen.getByRole('option', { name: '2p_x' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        const selected = screen.getByRole('option', { name: '2p_z' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x' }));
        fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
        expect(onSelect).toHaveBeenLastCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        fireEvent.click(screen.getByRole('button', { name: 'Hide the orbital strip' }));
        expect(onCollapsedChange).toHaveBeenCalledWith(true);
    });

    // Controller ruling DX2: the listbox mounts only while expanded, so the
    // roving focus must re-attach to the new list after collapse -> expand.
    it('is one tab stop with working arrows again after a collapse and an expand', () => {
        function Controlled() {
            const [collapsed, setCollapsed] = useState(false);
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={jest.fn()}
                collapsed={collapsed} onCollapsedChange={setCollapsed} />;
        }
        render(<Controlled />);
        fireEvent.click(screen.getByRole('button', { name: 'Hide the orbital strip' }));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show the orbital strip' }));
        const options = screen.getAllByRole('option');
        expect(options.filter(option => option.tabIndex === 0)).toEqual([screen.getByRole('option', { name: '2p_z' })]);
        const selected = screen.getByRole('option', { name: '2p_z' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x' }));
    });
});

// Controller ruling DC12 (spec §12: "On WebGL context loss, tiles show a
// glyph and their text label"): tiles already waiting for an image when the
// context goes must switch to their glyph, not stay blank.
describe('ThumbnailStrip on a lost WebGL context', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('turns tiles still waiting for their image into their glyph and label', () => {
        const host: ThumbHost = {
            // A worker that never answers: every orbital tile stays pending.
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false,
            themeKey: () => 'dark|phase|glow',
            render: () => new Promise(() => {}),
        };
        thumbnailService.attach(host);
        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={jest.fn()} />);
        act(() => { thumbnailService.tick(); });
        expect(container.querySelectorAll('.strip-tile-glyph')).toHaveLength(0);

        act(() => { thumbnailService.markLost(); });
        const glyphs = [...container.querySelectorAll('.strip-tile-glyph')].map(glyph => glyph.textContent);
        expect(glyphs).toEqual(['2s', '2p_y', '2p_z', '2p_x']);
        // The text label under each tile stays, and so does each option's name.
        expect(screen.getByRole('option', { name: '2p_y' })).toHaveTextContent('2p_y');
    });
});
