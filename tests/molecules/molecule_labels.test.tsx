// tests/molecules/molecule_labels.test.tsx -- the on-model bond lengths and angles (Task 14, ruling P9, spec §9.4.1).
import React, { useRef } from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';

// orbital_visualizer's worker factories read import.meta.url, which ts-jest cannot load (attach_thumbnails.test.ts).
jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createAppStore } from '../../src/store';
import { useAppSelector } from '../../src/store/hooks';
import { metaLoaded, selectMolecule, setPick, setRepresentation } from '../../src/store/moleculeSlice';
import type { VisualizerContext } from '../../src/orbital_visualizer';
import { DEFAULT_DISPLAY, displayPref } from '../../src/design/presentation';
import MoleculeLabels from '../../src/components/MoleculeLabels';
import MoleculeReadout from '../../src/components/MoleculeReadout';
import { LABEL_ATOM_LIMIT } from '../../src/molecules/bond_labels';
import { carbonChainAtoms, methaneMeta, waterMeta } from './fixtures';

/** A visualizer context with a real camera and a 600 × 400 canvas, and no WebGL (jsdom has none). */
function fakeContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(50, 600 / 400, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return {
        camera,
        renderer: { getSize: (target: THREE.Vector2) => target.set(600, 400), domElement: document.createElement('canvas') },
        afterFrameListeners: new Set(),
    } as unknown as VisualizerContext;
}
/** What the render loop does after a frame: each listener, once. */
const frame = (context: VisualizerContext) => act(() => { context.afterFrameListeners!.forEach(listener => listener()); });

function Harness({ context, readout = false }: { context: VisualizerContext; readout?: boolean }) {
    const ref = useRef<VisualizerContext | null>(context);
    const { meta, pick } = useAppSelector(state => state.molecule);
    return (
        <>
            <MoleculeLabels contextRef={ref} />
            {readout && meta && <MoleculeReadout atoms={meta.atoms} pick={pick} geometrySource="test" touch={false} />}
        </>
    );
}

function setup(meta = waterMeta(), { labels = true, readout = false } = {}) {
    const store = createAppStore();
    act(() => { displayPref.set({ ...DEFAULT_DISPLAY, moleculeLabels: labels }); });
    act(() => { store.dispatch(selectMolecule({ id: meta.id })); store.dispatch(metaLoaded({ id: meta.id, meta })); });
    const context = fakeContext();
    const utils = render(<Provider store={store}><Harness context={context} readout={readout} /></Provider>);
    return { context, store, ...utils };
}
const pills = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.model-label'));
const chainMeta = () => waterMeta({ id: 'chain', name: 'Chain', formula: 'C13', atoms: carbonChainAtoms(LABEL_ATOM_LIMIT + 1) });

afterEach(() => { act(() => { displayPref.set(DEFAULT_DISPLAY); }); window.localStorage.clear(); });

describe('MoleculeLabels', () => {
    it('renders nothing and listens to no frame while the preference is off (the default)', () => {
        const { container, context } = setup(waterMeta(), { labels: false });
        expect(container.querySelector('.model-labels')).toBeNull();
        expect(context.afterFrameListeners!.size).toBe(0);
    });

    it('puts one aria-hidden pill per label -- water’s two lengths and its angle -- with the angle’s arc', () => {
        const { container } = setup();
        const overlay = container.querySelector('.model-labels')!;
        expect(overlay).toHaveAttribute('aria-hidden', 'true');
        expect(pills(container).map(p => p.textContent)).toEqual(['0.958 Å', '0.958 Å', '104.5°']);
        expect(overlay.querySelectorAll('path.model-label-arc')).toHaveLength(1);
    });

    it('places the pills from the camera after each frame, follows the camera, and hides what is behind it', () => {
        const { container, context } = setup();
        // Until a frame has projected them, they are not shown (nowhere to put them yet).
        pills(container).forEach(p => expect(p.style.visibility).not.toBe('visible'));
        frame(context);
        const before = pills(container).map(p => p.style.transform);
        pills(container).forEach(p => expect(p.style.visibility).toBe('visible'));
        before.forEach(t => expect(t).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\) translate\(-50%, -50%\)$/));
        const arc = container.querySelector('path.model-label-arc')!;
        expect(arc.getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+( L [\d.-]+ [\d.-]+){8}$/);
        const arcBefore = arc.getAttribute('d');

        context.camera.position.set(6, 2, 7);
        context.camera.lookAt(0, 0, 0);
        context.camera.updateMatrixWorld();
        frame(context);
        pills(container).forEach((p, i) => expect(p.style.transform).not.toBe(before[i]));
        expect(arc.getAttribute('d')).not.toBe(arcBefore);

        // The camera inside the molecule, looking away from it: every label is behind it.
        context.camera.position.set(0, 0, 3);
        context.camera.lookAt(0, 0, 10);
        context.camera.updateMatrixWorld();
        frame(context);
        pills(container).forEach(p => expect(p.style.visibility).toBe('hidden'));
        expect(arc.getAttribute('d')).toBe('');
    });

    // No layout thrash: a still camera (most frames) costs no DOM write at all. A value the page holds is
    // left alone when the projection has not changed -- seen here by marking it and running a frame.
    it('writes nothing to the page on a frame where the camera has not moved', () => {
        const { container, context } = setup();
        frame(context);
        const pill = pills(container)[0];
        const arc = container.querySelector('path.model-label-arc')!;
        pill.style.transform = 'none';
        arc.setAttribute('d', 'M 0 0');
        frame(context);
        expect(pill.style.transform).toBe('none');
        expect(arc.getAttribute('d')).toBe('M 0 0');
    });

    it('labels methane’s four lengths and no angle', () => {
        const { container } = setup(methaneMeta());
        expect(pills(container).map(p => p.textContent)).toEqual(['1.087 Å', '1.087 Å', '1.087 Å', '1.087 Å']);
        expect(container.querySelectorAll('path.model-label-arc')).toHaveLength(0);
    });

    // Review Focus 3 (preflight D14 (a): a synthetic 13-atom chain -- no library molecule has more than 12).
    it('large molecule shows only the picked part and says so (Review Focus 3)', () => {
        const meta = chainMeta();
        const off = setup(meta, { labels: false, readout: true });
        const readoutOff = off.container.querySelector('.molecule-readout')!.textContent;
        off.unmount();

        const { container, store } = setup(meta, { readout: true });
        expect(pills(container)).toHaveLength(0);
        const hints = container.querySelectorAll('.model-label-hint');
        expect(hints).toHaveLength(1);
        expect(hints[0]).toHaveTextContent(/^Pick an atom or bond to label it$/);
        // The readout section is the overlay's accessible twin and is not changed by it.
        expect(container.querySelector('.molecule-readout')!.textContent).toBe(readoutOff);

        act(() => { store.dispatch(setPick({ kind: 'bond', index: 3 })); });
        expect(pills(container).map(p => p.textContent)).toEqual(['1.540 Å']);
        expect(container.querySelector('.model-label-hint')).toBeNull();
        act(() => { store.dispatch(setPick({ kind: 'atom', index: 5 })); });
        expect(pills(container).map(p => p.textContent)).toEqual(['111.0°']);
        act(() => { store.dispatch(setPick(null)); });
        expect(pills(container)).toHaveLength(0);
        expect(container.querySelectorAll('.model-label-hint')).toHaveLength(1);
    });

    it('draws nothing for no structure, and only angles for space filling, whose hint names atoms only', () => {
        const { container, store, context } = setup();
        act(() => { store.dispatch(setRepresentation('none')); });
        expect(container.querySelector('.model-labels')).toBeNull();
        expect(context.afterFrameListeners!.size).toBe(0);
        act(() => { store.dispatch(setRepresentation('space-filling')); });
        expect(pills(container).map(p => p.textContent)).toEqual(['104.5°']);

        const large = setup(chainMeta());
        act(() => { large.store.dispatch(setRepresentation('space-filling')); });
        expect(large.container.querySelector('.model-label-hint')).toHaveTextContent(/^Pick an atom to label it$/);
    });

    it('hides the pills of a new molecule until the next frame places them, and stops listening when switched off', () => {
        const { container, store, context } = setup();
        frame(context);
        act(() => { store.dispatch(selectMolecule({ id: 'ch4' })); store.dispatch(metaLoaded({ id: 'ch4', meta: methaneMeta() })); });
        expect(pills(container).map(p => p.textContent)).toEqual(['1.087 Å', '1.087 Å', '1.087 Å', '1.087 Å']);
        pills(container).forEach(p => expect(p.style.visibility).not.toBe('visible'));
        frame(context);
        pills(container).forEach(p => expect(p.style.visibility).toBe('visible'));
        expect(context.afterFrameListeners!.size).toBe(1);
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, moleculeLabels: false }); });
        expect(container.querySelector('.model-labels')).toBeNull();
        expect(context.afterFrameListeners!.size).toBe(0);
    });

    it('leaves the pointer to the canvas', () => {
        const { container } = setup(chainMeta());
        // jsdom applies no stylesheet; the class contract is checked against the CSS file itself.
        const css = readFileSync(resolve(__dirname, '../../src/components/molecule_labels.css'), 'utf8');
        expect(css).toMatch(/\.model-labels\s*\{[^}]*pointer-events:\s*none/);
        expect(container.querySelector('.model-labels')).not.toBeNull();
    });
});
