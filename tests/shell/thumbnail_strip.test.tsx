import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ThumbnailStrip from '../../src/shell/ThumbnailStrip';
import { atomStripItems } from '../../src/thumbs/strip_items';
import { subshellLabel } from '../../src/atom/configurations';
import { thumbnailService, type ThumbHost } from '../../src/thumbs/ThumbnailService';
import { goldProfile, neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';

const profile = neonProfile();
const rGrid = Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
const items = atomStripItems({ profile, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

describe('ThumbnailStrip (spec §9.1, §13)', () => {
    it('is a listbox of labelled options, grouped by subshell, the shown orbital selected', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={jest.fn()} />);
        const list = screen.getByRole('listbox', { name: 'orbitals in view' });
        expect(screen.getByRole('group', { name: '2p' })).toBeInTheDocument();
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(screen.getByRole('option', { name: '2p_z orbital' })).toHaveAttribute('aria-selected', 'true');
        // Every tile but the back tile (an arrow) draws into its own 2D canvas -- never a WebGL one.
        expect(list.querySelectorAll('canvas.thumb-canvas')).toHaveLength(items.length - 1);
    });

    it('selects with a click or Enter, moves with the arrows, and folds to its handle', () => {
        const onSelect = jest.fn();
        const onCollapsedChange = jest.fn();
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={onSelect} onCollapsedChange={onCollapsedChange} />);
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        fireEvent.click(screen.getByRole('option', { name: '2p_x orbital' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        const selected = screen.getByRole('option', { name: '2p_z orbital' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x orbital' }));
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
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(options.filter(option => option.tabIndex === 0)).toEqual([screen.getByRole('option', { name: '2p_z orbital' })]);
        const selected = screen.getByRole('option', { name: '2p_z orbital' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x orbital' }));
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
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(screen.getByRole('option', { name: '2p_y orbital' })).toHaveTextContent('2p_y');
    });
});

// Ruling T16-failtile: a job that fails -- here the worker's error reply --
// leaves its tile on the glyph and label, as a lost context does.
describe('ThumbnailStrip when a thumbnail cannot be made', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('shows the glyph and label of the tile whose job failed', () => {
        const workers: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = [];
        thumbnailService.attach({
            createWorker: () => {
                const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
                workers.push(worker);
                return worker as unknown as Worker;
            },
            isBusy: () => false,
            themeKey: () => 'dark|phase|glow',
            render: () => new Promise(() => {}),
        });
        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|phase|glow" onSelect={jest.fn()} />);
        act(() => { thumbnailService.tick(); });
        expect(container.querySelectorAll('.strip-tile-glyph')).toHaveLength(0);
        act(() => { workers[0].onmessage!({ data: { type: 'error', message: 'no mesh' } }); });
        // The first job is 2s's; only its tile falls back, the others still wait.
        expect([...container.querySelectorAll('.strip-tile-glyph')].map(glyph => glyph.textContent)).toEqual(['2s']);
        expect(thumbnailService.status()).toBe('ready');
    });
});

// Ruling T16-spoken: under spin–orbit a group is a j-level; it reads
// "6p j = 3/2" to a screen reader and shows "6p³⁄₂". Bismuth-shaped: gold's
// fixture with its 6p split into j = 1/2 and 3/2, as Bi's valence 6p is.
describe('ThumbnailStrip under spin–orbit (bismuth)', () => {
    const bismuth = { ...goldProfile('spinOrbit', { j: true }), Z: 83, speciesKey: '83' };
    const biGrid = Array.from({ length: bismuth.size }, (_, j) => bismuth.rMin * Math.exp(j * bismuth.dx));
    const biItems = atomStripItems({ profile: bismuth, level: 'orbital', selectedShell: 6, selectedOrbital: { n: 6, l: 1, ml: 0, j: 1.5 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

    it('names each j-level group in its spoken form, shows the j-label, and opens the j-level\'s own orbital', () => {
        const onSelect = jest.fn();
        render(<ThumbnailStrip items={biItems} label="orbitals in view" rGrid={biGrid} themeKey="dark|phase|glow" onSelect={onSelect} />);
        const half = screen.getByRole('group', { name: '6p j = 1/2' });
        const threeHalves = screen.getByRole('group', { name: '6p j = 3/2' });
        expect(half).toHaveTextContent(subshellLabel(6, 1, 0.5));
        expect(threeHalves).toHaveTextContent(subshellLabel(6, 1, 1.5));
        expect(screen.getByRole('option', { name: '6p_z orbital of 6p j = 3/2' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: '6p_z orbital of 6p j = 1/2' })).toHaveAttribute('aria-selected', 'false');
        fireEvent.click(screen.getByRole('option', { name: '6p_x orbital of 6p j = 1/2' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 6, l: 1, ml: 1, j: 0.5 });
        const tile = biItems.find(item => item.spoken === '6p_x orbital of 6p j = 1/2')!;
        expect(tile.thumb.kind === 'orbital' && tile.thumb.request.contentKey).toBe('83|spinOrbit|6|1|1|0.5|0.9');
    });
});
