import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAppSelector } from '../store/hooks';
import { usePref } from '../design/usePref';
import { displayPref } from '../design/presentation';
import { detectBonds } from '../molecules/ball_and_stick';
import { besideBond, declutter, LABEL_ATOM_LIMIT, modelLabels, overlapText, projectToCanvas, type ScreenBox } from '../molecules/bond_labels';
import { addAfterFrameListener, type VisualizerContext } from '../orbital_visualizer';
import './molecule_labels.css';

type CanvasXY = { x: number; y: number };
/** What the labels show right now, in canvas CSS pixels: the visible pills' centres and their arcs (ruling T14-M1, the PNG export). */
export interface LabelsSnapshot { pills: Array<CanvasXY & { text: string }>; arcs: CanvasXY[][] }

interface MoleculeLabelsProps {
    contextRef: React.RefObject<VisualizerContext | null>;
    /** Set to a reader of what is shown now, for the PNG export; null while nothing is. */
    snapshotRef?: React.MutableRefObject<(() => LabelsSnapshot) | null>;
}

const px = (value: number) => value.toFixed(1);
/** Angles are kept before lengths when pills overlap (ruling T14-I1). */
const RANK = { angle: 0, length: 1 } as const;

/**
 * Bond lengths and angles drawn on the model (spec §9.4.1, ruling P9): a DOM overlay over the one canvas,
 * placed from projected points after every main frame. React renders the pills and arcs once per label
 * set, and their sizes are read then (and again once the fonts are ready); the frame listener only writes
 * each pill's transform and visibility, each arc's path and the overlap line, and only when they change --
 * a still camera costs no DOM write, and no frame reads layout. Lengths sit beside their bond; a pill that
 * would overlap one kept before it (angles first, then the nearer) is hidden, its arc with it, and the
 * hint slot says how many are (bond_labels.ts besideBond, declutter; ruling T14-I1). The overlay is
 * aria-hidden: Properties' Structure tables are the accessible form of the same numbers (ruling T14-I2).
 * It never takes the pointer.
 */
const MoleculeLabels: React.FC<MoleculeLabelsProps> = ({ contextRef, snapshotRef }) => {
    const meta = useAppSelector(state => state.molecule.meta);
    const pick = useAppSelector(state => state.molecule.pick);
    const representation = useAppSelector(state => state.molecule.representation);
    const on = usePref(displayPref).moleculeLabels;
    // Ruling P12: a request preview on the canvas is not the molecule these lengths and angles describe.
    const previewing = useAppSelector(state => state.jobs.request.previewAtoms !== null);
    const shown = on && meta !== null && representation !== 'none' && !previewing;
    const atoms = meta?.atoms ?? null;
    const bonds = useMemo(() => (atoms ? detectBonds(atoms) : []), [atoms]);
    const many = atoms !== null && atoms.length > LABEL_ATOM_LIMIT;
    // Up to the limit every label is drawn whatever is picked: a hover then changes nothing here.
    const labelPick = many ? pick : null;
    const labels = useMemo(
        () => (shown && atoms ? modelLabels(atoms, bonds, labelPick, representation) : []),
        [shown, atoms, bonds, labelPick, representation],
    );
    // The side a length label goes to is the one away from the molecule's middle (its atoms' centroid).
    const centroid = useMemo((): [number, number, number] => {
        if (!atoms?.length) return [0, 0, 0];
        const sum = atoms.reduce((acc, atom) => acc.map((c, k) => c + atom.position[k]), [0, 0, 0]);
        return sum.map(c => c / atoms.length) as [number, number, number];
    }, [atoms]);
    const pillRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const arcRefs = useRef<Array<SVGPathElement | null>>([]);
    const overlapRef = useRef<HTMLParagraphElement | null>(null);

    useEffect(() => {
        if (labels.length === 0) return undefined;
        const size = new THREE.Vector2();
        // Each pill's size, read once for this label set (one layout, not one per frame) -- and again once the
        // fonts are in, since a size read in the fallback font would misplace and misjudge every box.
        let boxes: Array<{ w: number; h: number }> = [];
        // What each element was last given, so an unchanged frame writes nothing.
        let placed: Array<string | null> = [];
        let paths: Array<string | null> = [];
        let overlapping: number | null = null;
        let snapshot: LabelsSnapshot = { pills: [], arcs: [] };
        const measure = () => {
            boxes = labels.map((_, i) => ({ w: pillRefs.current[i]?.offsetWidth ?? 0, h: pillRefs.current[i]?.offsetHeight ?? 0 }));
            placed = labels.map(() => null);
            paths = labels.map(() => null);
            overlapping = null;
        };
        measure();
        let cancelled = false;
        document.fonts?.ready.then(() => { if (!cancelled) measure(); });

        const place = (context: VisualizerContext) => {
            // three.js keeps the canvas's CSS size itself: no layout read.
            context.renderer.getSize(size);
            const project = (world: [number, number, number]) => projectToCanvas(context.camera, size.x, size.y, world);
            const centre = project(centroid);
            const screen = labels.map((label, i): ScreenBox | null => {
                const at = project(label.world);
                if (!at) return null;
                const { w, h } = boxes[i];
                const rank = RANK[label.kind];
                if (label.kind === 'length' && centre) {
                    const [a, b] = [project(label.ends[0]), project(label.ends[1])];
                    if (a && b) return { ...besideBond(at, a, b, centre, w, h), w, h, depth: at.depth, rank };
                }
                return { x: at.x, y: at.y, w, h, depth: at.depth, rank };
            });
            const visible = declutter(screen);
            const next: LabelsSnapshot = { pills: [], arcs: [] };
            labels.forEach((label, i) => {
                const pill = pillRefs.current[i];
                const at = screen[i];
                const show = at !== null && visible[i];
                if (pill) {
                    const transform = show ? `translate(${px(at.x)}px, ${px(at.y)}px) translate(-50%, -50%)` : '';
                    if (transform !== placed[i]) {
                        placed[i] = transform;
                        if (transform) pill.style.transform = transform;
                        pill.style.visibility = transform ? 'visible' : 'hidden';
                    }
                    if (show) next.pills.push({ text: label.text, x: at.x, y: at.y });
                }
                const arc = label.kind === 'angle' ? arcRefs.current[i] : null;
                if (arc && label.kind === 'angle') {
                    // An arc goes with its degree label: none for a label hidden behind the camera or by another.
                    const points = show ? label.arc.map(project) : [null];
                    const whole = points.every(Boolean) ? (points as CanvasXY[]) : null;
                    const d = whole ? whole.map((p, k) => `${k ? 'L' : 'M'} ${px(p.x)} ${px(p.y)}`).join(' ') : '';
                    if (d !== paths[i]) {
                        paths[i] = d;
                        arc.setAttribute('d', d);
                    }
                    if (whole) next.arcs.push(whole.map(p => ({ x: p.x, y: p.y })));
                }
            });
            snapshot = next;
            // Ruling T14-I1: hidden as overlapping, not as behind the camera.
            const count = screen.filter((box, i) => box !== null && !visible[i]).length;
            const line = overlapRef.current;
            if (line && count !== overlapping) {
                overlapping = count;
                line.textContent = count ? overlapText(count) : '';
                line.hidden = count === 0;
            }
        };

        // Review M4: the visualizer context is made by OrbitalViewer's first effect, which runs after this
        // child's -- on a first render with labels already wanted it is not there yet, so wait a frame for it.
        let remove: (() => void) | null = null;
        let wait = 0;
        const subscribe = () => {
            const context = contextRef.current;
            if (!context) { wait = requestAnimationFrame(subscribe); return; }
            remove = addAfterFrameListener(context, () => place(context));
        };
        subscribe();
        if (snapshotRef) snapshotRef.current = () => snapshot;
        return () => {
            cancelled = true;
            cancelAnimationFrame(wait);
            remove?.();
            if (snapshotRef) snapshotRef.current = null;
        };
    }, [contextRef, snapshotRef, labels, centroid]);

    if (!shown) return null;
    pillRefs.current.length = labels.length;
    arcRefs.current.length = labels.length;
    const hint = many && pick === null
        ? (representation === 'space-filling' ? 'Pick an atom to label it' : 'Pick an atom or bond to label it')
        : null;
    // Keyed by molecule: a new one's pills start hidden until a frame has placed them.
    return (
        <div className="model-labels" aria-hidden="true" key={meta.id}>
            <svg className="model-label-arcs">
                {labels.map((label, i) => label.kind === 'angle' && (
                    <path key={`arc-${label.atom}`} className="model-label-arc" ref={el => { arcRefs.current[i] = el; }} />
                ))}
            </svg>
            {labels.map((label, i) => (
                <span key={label.kind === 'length' ? `length-${label.bond}` : `angle-${label.atom}`} className="model-label"
                    ref={el => { pillRefs.current[i] = el; }}>
                    {label.text}
                </span>
            ))}
            {hint && <p className="model-label-hint">{hint}</p>}
            {/* Written by the frame listener alone (no React children): how many pills overlap and are hidden. */}
            {!hint && <p className="model-label-overlap" ref={overlapRef} hidden />}
        </div>
    );
};

export default MoleculeLabels;
