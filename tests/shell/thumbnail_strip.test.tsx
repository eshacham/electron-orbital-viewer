import React, { useState } from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ThumbnailStrip, { tileBacking } from '../../src/shell/ThumbnailStrip';
import { atomStripItems, basicStripItems } from '../../src/thumbs/strip_items';
import { subshellLabel } from '../../src/atom/configurations';
import { thumbnailService, type ThumbHost } from '../../src/thumbs/ThumbnailService';
import { goldProfile, neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';
import { Provider } from 'react-redux';
import { createAppStore } from '../../src/store';
import { useAppSelector } from '../../src/store/hooks';
import { previewOpacity, setSurfaceStyle } from '../../src/store/orbitalSlice';
import { THUMB_TILE_PX, thumbLookKey, thumbTileDevicePx } from '../../src/thumbs/thumb_key';
import { CANVAS_BACKDROPS, SHADOWS, TOKENS, TYPE } from '../../src/design/tokens';
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { useDevicePixelRatio } from '../../src/thumbs/useDevicePixelRatio';

const profile = neonProfile();
const rGrid = Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
const items = atomStripItems({ profile, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

describe('ThumbnailStrip (spec §9.1, §13)', () => {
    it('is a listbox of labelled options, grouped by subshell, the shown orbital selected', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
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
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={onSelect} onCollapsedChange={onCollapsedChange} />);
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        fireEvent.click(screen.getByRole('option', { name: '2p_x orbital' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        const selected = screen.getByRole('option', { name: '2p_z orbital' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x orbital' }));
        fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
        expect(onSelect).toHaveBeenLastCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        // Ruling R23b-3: the handle's name is now "Hide orbitals" / "Show orbitals" (was "Hide/Show the orbital strip").
        fireEvent.click(screen.getByRole('button', { name: 'Hide orbitals' }));
        expect(onCollapsedChange).toHaveBeenCalledWith(true);
    });

    // Ruling R23b-3 (owner): the collapse/expand control names what it opens, visibly,
    // and its accessible name is exactly that visible text -- no aria-label divergence.
    it('shows the handle\'s action as visible text matching its accessible name', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} onCollapsedChange={jest.fn()} />);
        const handle = screen.getByRole('button', { name: 'Hide orbitals' });
        expect(handle).toHaveTextContent('Hide orbitals');
    });

    // Controller ruling DX2: the listbox mounts only while expanded, so the
    // roving focus must re-attach to the new list after collapse -> expand.
    it('is one tab stop with working arrows again after a collapse and an expand', () => {
        function Controlled() {
            const [collapsed, setCollapsed] = useState(false);
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()}
                collapsed={collapsed} onCollapsedChange={setCollapsed} />;
        }
        render(<Controlled />);
        // Ruling R23b-3: the handle's name is now "Hide orbitals" / "Show orbitals" (was "Hide/Show the orbital strip").
        fireEvent.click(screen.getByRole('button', { name: 'Hide orbitals' }));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show orbitals' }));
        const options = screen.getAllByRole('option');
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(options.filter(option => option.tabIndex === 0)).toEqual([screen.getByRole('option', { name: '2p_z orbital' })]);
        const selected = screen.getByRole('option', { name: '2p_z orbital' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2p_x orbital' }));
    });

    // Task 18's keyboard walk: Chrome moves its sequential focus starting point to
    // whatever scrollIntoView scrolls to, so the first Tab on a fresh page (and after
    // every pick) skipped the top bar, rail and Explore and landed after the strip.
    // The strip now scrolls its own list to centre the shown orbital (spec §13 order).
    it('centres the shown orbital by scrolling its own list, never through scrollIntoView', () => {
        const scrollIntoView = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
        const scrollTo = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('role') === 'listbox' ? 300 : 0;
        });
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 72, height: 72, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
            if (this.getAttribute('role') === 'listbox') return at(100, 300);
            if (this.getAttribute('aria-selected') === 'true') return at(600, 72);
            return at(0, 0);
        });
        try {
            render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
            expect(scrollIntoView).not.toHaveBeenCalled();
            // The tile starts 500 px into the list; centring 72 px in 300 px leaves 114 px before it.
            expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 386 }));
        } finally {
            rects.mockRestore();
            width.mockRestore();
            Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
            Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
        }
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
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: () => new Promise(() => {}),
        };
        thumbnailService.attach(host);
        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
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
            // Ruling T10-M7: a complete ThumbHost since Task 10 (this strip queues no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            createWorker: () => {
                const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
                workers.push(worker);
                return worker as unknown as Worker;
            },
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: () => new Promise(() => {}),
        });
        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        act(() => { thumbnailService.tick(); });
        expect(container.querySelectorAll('.strip-tile-glyph')).toHaveLength(0);
        act(() => { workers[0].onmessage!({ data: { type: 'error', message: 'no mesh' } }); });
        // The first job is 2s's; only its tile falls back, the others still wait.
        expect([...container.querySelectorAll('.strip-tile-glyph')].map(glyph => glyph.textContent)).toEqual(['2s']);
        expect(thumbnailService.status()).toBe('ready');
    });
});

// Preflight D15 (fixed in Task 10): shoot.mjs counts `data-drawn="true"` as
// "this tile's picture is showing". A tile still waiting for its image shows
// neither glyph nor picture, so it must not count -- it did, which made
// thumbsDrawn read "all drawn" the moment a strip appeared.
describe('ThumbnailStrip data-drawn (D15)', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('marks an orbital tile drawn only once its image has arrived; a ring glyph at once', async () => {
        const workers: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = [];
        thumbnailService.attach({
            createWorker: () => {
                const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
                workers.push(worker);
                return worker as unknown as Worker;
            },
            createGridWorker: () => { throw new Error('no grid tile here'); },
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: async () => ({ width: 72, height: 72 }),
        });
        const whole = atomStripItems({ profile, level: 'atom', selectedShell: null, selectedOrbital: null, enclosedFraction: 0.9, palette: CURVE_COLORS });
        const rings = render(<ThumbnailStrip items={whole} label="shells" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const ringCanvases = [...rings.container.querySelectorAll('canvas.thumb-canvas')];
        expect(ringCanvases.length).toBeGreaterThan(0);
        expect(ringCanvases.every(canvas => canvas.getAttribute('data-drawn') === 'true')).toBe(true);
        rings.unmount();

        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const drawnFlags = () => [...container.querySelectorAll('canvas.thumb-canvas')].map(canvas => canvas.getAttribute('data-drawn'));
        act(() => { thumbnailService.tick(); });
        expect(drawnFlags()).toEqual(['false', 'false', 'false', 'false']);
        act(() => { workers[0].onmessage!({ data: { type: 'success', meshData: { positions: [], cells: [], psiSigns: [] } } }); });
        await act(async () => { thumbnailService.tick(); await Promise.resolve(); await Promise.resolve(); });
        // The first job is 2s's: only its tile is drawn; the others still wait.
        expect(drawnFlags()).toEqual(['true', 'false', 'false', 'false']);
    });
});

// Ruling T10-I1: a 'pending' tile -- Bonds' strip while the next scan point's
// files load -- shows its glyph and label, asks the service for nothing, and
// does not count as drawn.
describe('ThumbnailStrip pending tiles (T10-I1)', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('shows a pending tile\'s glyph and label and requests nothing for it', () => {
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        try {
            const pending = items.slice(1).map(item => ({ ...item, thumb: { kind: 'pending' as const } }));
            const { container } = render(<ThumbnailStrip items={pending} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
            expect(request).not.toHaveBeenCalled();
            expect([...container.querySelectorAll('.strip-tile-glyph')].map(glyph => glyph.textContent)).toEqual(['2s', '2p_y', '2p_z', '2p_x']);
            expect([...container.querySelectorAll('canvas.thumb-canvas')].map(canvas => canvas.getAttribute('data-drawn'))).toEqual(['false', 'false', 'false', 'false']);
            expect(screen.getByRole('option', { name: '2p_z orbital' })).toHaveAttribute('aria-selected', 'true');
        } finally {
            request.mockRestore();
        }
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
        render(<ThumbnailStrip items={biItems} label="orbitals in view" rGrid={biGrid} themeKey="dark|glow" onSelect={onSelect} />);
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

// Ruling R20a-4: a tile's canvas holds its CSS size in device pixels. Ruling R20d: exactly that, on a
// 1× screen too (was at least 2×, which the browser then shrank), so the tile's bitmap -- made at the
// same device size -- is drawn 1:1 and shown unscaled.
describe('tileBacking', () => {
    it('is the tile in device pixels, the size of the bitmap it is given', () => {
        expect(tileBacking(72, 1)).toBe(72);
        expect(tileBacking(72, 2)).toBe(144);
        expect(tileBacking(72, 3)).toBe(216);
        expect(tileBacking(56, 3)).toBe(168);
        expect(tileBacking(56, Number.NaN)).toBe(56);
        for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) expect(tileBacking(THUMB_TILE_PX, dpr)).toBe(thumbTileDevicePx(dpr));
    });
});

// Fix round 1 of Task 20a (R20a-4): the tiles follow the main view's opacity, but only as committed --
// a slider drag (previewOpacity) re-requests nothing; its release (setSurfaceStyle) re-requests every tile.
describe('ThumbnailStrip and the committed opacity', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); jest.restoreAllMocks(); });

    it('re-requests the tiles once a new opacity is committed, and not on drag ticks', () => {
        const store = createAppStore();
        const look = { theme: 'dark' as const, finish: 'glow' as const, lowPower: false };
        const keyNow = () => thumbLookKey({ appearance: look, opacity: store.getState().orbital.thumbOpacity, size: 288 });
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: keyNow, render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        function Strip() {
            const opacity = useAppSelector(state => state.orbital.thumbOpacity);
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} onSelect={jest.fn()}
                themeKey={thumbLookKey({ appearance: look, opacity, size: 288 })} />;
        }
        render(<Provider store={store}><Strip /></Provider>);
        const orbitalTiles = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(request).toHaveBeenCalledTimes(orbitalTiles);
        // Ruling R22a: the look key has no scheme field (was dark|phase|glow|...).
        expect(keyNow()).toBe('dark|glow|full|288|0.7');

        act(() => { [0.65, 0.5, 0.4].forEach(value => store.dispatch(previewOpacity(value))); });
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.4);
        expect(request).toHaveBeenCalledTimes(orbitalTiles);

        act(() => { store.dispatch(setSurfaceStyle({ opacity: 0.4 })); });
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
        expect(keyNow()).toBe('dark|glow|full|288|0.4');
    });
});

// Fix round 1 of Task 20d: a tile's bitmap is made at the screen's device size, so moving the window to a
// screen with another ratio (or zooming the page) must re-request every tile in the new size.
describe('ThumbnailStrip and the device pixel ratio', () => {
    const listeners = new Set<() => void>();
    let ratio = 1;
    beforeEach(() => {
        ratio = 1;
        listeners.clear();
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => ratio });
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: (query: string) => ({
                matches: query === `(resolution: ${ratio}dppx)`, media: query,
                addEventListener: (_: string, listener: () => void) => listeners.add(listener),
                removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
            }),
        });
    });
    afterEach(() => { act(() => { thumbnailService.detach(); }); jest.restoreAllMocks(); });
    const changeRatio = (next: number) => act(() => { ratio = next; [...listeners].forEach(listener => listener()); });

    it('re-requests every tile, at the new bitmap size, when the ratio changes', () => {
        const look = { theme: 'dark' as const, finish: 'glow' as const, lowPower: false };
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: () => thumbLookKey({ appearance: look, opacity: 0.7, size: thumbTileDevicePx(ratio) }),
            render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        function Strip() {
            const dpr = useDevicePixelRatio();
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} onSelect={jest.fn()}
                themeKey={thumbLookKey({ appearance: look, opacity: 0.7, size: thumbTileDevicePx(dpr) })} />;
        }
        const { container } = render(<Strip />);
        const orbitalTiles = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(request).toHaveBeenCalledTimes(orbitalTiles);
        expect((container.querySelector('canvas.thumb-canvas') as HTMLCanvasElement).width).toBe(72);

        changeRatio(1.5);
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
        expect((container.querySelector('canvas.thumb-canvas') as HTMLCanvasElement).width).toBe(108);
        changeRatio(1.5);
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
    });
});

// Ruling R20d: labels one step larger, and the selected tile clearly marked -- the concept's selected 2p_z tile.
describe('strip tile styles (ruling R20d)', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/strip.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (selector: string) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
        if (!match) throw new Error(`No rule for ${selector}`);
        return match[2];
    };
    const rgb = (hex: string) => parseCssColor(hex).slice(0, 3) as [number, number, number];

    it('sets tile labels at the body size from tokens (13 px, was the 12 px caption)', () => {
        expect(rule('.strip-tile-label')).toMatch(/font:\s*500 var\(--ql-type-body-size\) \/ var\(--ql-size-thumb-label\)/);
        expect(TYPE.body.size).toBe(13);
        expect(TYPE.body.size).toBeGreaterThan(TYPE.caption.size);
    });

    // Fix round 1 of Task 20d (§4.3 "On a phone, body is 14"): the sheet's labels are 14 px, and a long one
    // ("Whole atom") wraps to two centred lines rather than running past its 56 px tile; every sheet label
    // keeps two lines' height, so the tile images stay in one row.
    it('sets the phone sheet\'s labels at 14 px, wrapping to two centred lines', () => {
        const sheet = rule('.thumbnail-strip.sheet .strip-tile-label');
        expect(sheet).toMatch(/font-size:\s*14px/);
        expect(sheet).toMatch(/white-space:\s*normal/);
        expect(sheet).toMatch(/text-align:\s*center/);
        expect(sheet).toMatch(/max-width:\s*var\(--ql-size-thumb\)/);
        const line = Number(/line-height:\s*(\d+)px/.exec(sheet)![1]);
        expect(line).toBeGreaterThanOrEqual(14);
        expect(sheet).toMatch(new RegExp(`height:\\s*${2 * line}px`));
        expect(sheet).not.toMatch(/text-overflow|overflow:\s*hidden/);
    });

    // Ruling R23b-3 (owner): the handle names what it opens; its accessible name
    // is exactly the visible label (the chevron stays aria-hidden), set in caption size from tokens.
    it('sets the strip handle\'s text label at caption size from tokens', () => {
        expect(rule('.strip-handle-label')).toMatch(/font:\s*var\(--ql-type-caption-weight\) var\(--ql-type-caption-size\) \/ var\(--ql-type-caption-line\) var\(--ql-font-sans\)/);
    });

    it('rings the selected tile in a 2 px selected-edge, with a soft glow of that hue in Deep Space only (§4.6)', () => {
        expect(rule('.strip-tile.selected .strip-tile-image::after')).toMatch(/border:\s*2px solid var\(--ql-color-selected-edge\)/);
        expect(rule('.strip-tile.selected .strip-tile-image')).toMatch(/box-shadow:\s*var\(--ql-shadow-selected-tile\)/);
        const [r, g, b] = rgb(TOKENS.dark['selected-edge']);
        expect(SHADOWS.dark['selected-tile']).toContain(`rgba(${r},${g},${b},`);
        expect(SHADOWS.light['selected-tile']).toBe('none');
    });

    // §13: the selected edge is a control edge in its selected state, >= 3:1 against the tile and the canvas behind it.
    it('keeps the selected ring at 3:1 or better against the tile and the canvas, in both themes', () => {
        for (const mode of ['dark', 'light'] as const) {
            const edge = rgb(TOKENS[mode]['selected-edge']);
            for (const behind of [TOKENS[mode]['surface-2'], ...CANVAS_BACKDROPS[mode].slice(0, 2)]) {
                expect(contrastRatio(edge, rgb(behind))).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it('draws the tile edge over a picture that spans the whole tile, so the canvas is never scaled', () => {
        expect(rule('.strip-tile-image canvas')).toMatch(/position:\s*absolute;\s*inset:\s*0;\s*width:\s*100%;\s*height:\s*100%/);
        expect(rule('.strip-tile-image')).not.toMatch(/(^|;)\s*border:/);
        expect(rule('.strip-tile-image::after')).toMatch(/border:\s*1px solid var\(--ql-color-border-subtle\)/);
    });
});

// Task 8: StripItem<T>/ThumbnailStrip<T> are generic over what a tile
// dispatches -- NavigationTarget by default (every test above), or (Basic
// Orbitals' own strip) a plain BasicSelection with no `level` field at all.
// This is as much a compile-time check (onSelect below is typed
// `(target: BasicSelection) => void`, inferred from `items`) as a runtime
// one: the strip's own behaviour -- listbox, groups, option names, clicks --
// does not change for a T other than NavigationTarget.
describe('ThumbnailStrip<T> (Task 8): generic over the dispatched target', () => {
    it('renders and dispatches a non-NavigationTarget T (BasicSelection) exactly as it does NavigationTarget', () => {
        const basicItems = basicStripItems({ selection: { n: 3, l: 2, ml: 0 }, enclosedFraction: 0.9 });
        const onSelect = jest.fn();
        render(<ThumbnailStrip items={basicItems} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={onSelect} />);
        expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: '3d' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '3d_z² orbital' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('option', { name: '3p_x orbital' }));
        expect(onSelect).toHaveBeenCalledWith({ n: 3, l: 1, ml: 1 });
    });
});

// Controller preflight D15/Step 1: §12 "only tiles in view are requested" --
// the IntersectionObserver gating itself. jsdom has no IntersectionObserver
// at all (the other tests above rely on that absence, which falls back to
// requesting at once -- see ThumbnailStrip.tsx's `typeof IntersectionObserver
// === 'undefined'` branch), so proving the gating needs a real stand-in that
// never reports an intersection.
describe('ThumbnailStrip visibility gating (spec §12, D15 Step 1)', () => {
    const originalIntersectionObserver = (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    afterEach(() => {
        (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = originalIntersectionObserver;
        act(() => { thumbnailService.detach(); });
    });

    it('does not request an off-screen tile\'s picture, and requests it once it is reported on screen', () => {
        const observed: Element[] = [];
        // One real observer per tile (ThumbnailStrip.tsx constructs its own): capture every
        // callback, keyed by the canvas it watches, so each tile can be reported separately.
        const callbacks = new Map<Element, IntersectionObserverCallback>();
        class NeverIntersectingObserver {
            private cb: IntersectionObserverCallback;
            constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
            observe(el: Element) { observed.push(el); callbacks.set(el, this.cb); }
            unobserve() {}
            disconnect() {}
            takeRecords() { return []; }
        }
        (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NeverIntersectingObserver;

        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: () => 'dark|glow', render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);

        // Every orbital tile's canvas was handed to its own observer; none has been asked for yet.
        const orbitalTileCount = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(observed.length).toBe(orbitalTileCount);
        expect(request).not.toHaveBeenCalled();

        // Report just the first tile's canvas on screen: only that one tile is requested.
        const [firstCanvas] = observed;
        act(() => { callbacks.get(firstCanvas)!([{ isIntersecting: true, target: firstCanvas } as IntersectionObserverEntry], {} as IntersectionObserver); });
        expect(request).toHaveBeenCalledTimes(1);

        // The rest stay off-screen, and unrequested.
        for (const canvas of observed.slice(1)) {
            act(() => { callbacks.get(canvas)!([{ isIntersecting: false, target: canvas } as IntersectionObserverEntry], {} as IntersectionObserver); });
        }
        expect(request).toHaveBeenCalledTimes(1);
    });
});
