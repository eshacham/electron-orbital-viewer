import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAppSelector } from '../store/hooks';
import { usePref } from '../design/usePref';
import { displayPref } from '../design/presentation';
import { detectBonds } from '../molecules/ball_and_stick';
import { besideBond, declutter, LABEL_ATOM_LIMIT, modelLabels, projectToCanvas, type ScreenBox } from '../molecules/bond_labels';
import { addAfterFrameListener, type VisualizerContext } from '../orbital_visualizer';
import './molecule_labels.css';

interface MoleculeLabelsProps {
    contextRef: React.RefObject<VisualizerContext | null>;
}

const px = (value: number) => value.toFixed(1);

/**
 * Bond lengths and angles drawn on the model (spec §9.4.1, ruling P9): a DOM overlay over the one canvas,
 * placed from projected points after every main frame. React renders the pills and arcs once per label
 * set, and their sizes are read once then; the frame listener only writes each pill's transform and
 * visibility and each arc's path, and only when they change -- a still camera costs no DOM write, and no
 * frame reads layout. Lengths sit beside their bond; a pill that would overlap a nearer one is hidden
 * until there is room (bond_labels.ts besideBond, declutter). The overlay is aria-hidden: the Selection
 * readout is the accessible form of the same numbers. It never takes the pointer.
 */
const MoleculeLabels: React.FC<MoleculeLabelsProps> = ({ contextRef }) => {
    const meta = useAppSelector(state => state.molecule.meta);
    const pick = useAppSelector(state => state.molecule.pick);
    const representation = useAppSelector(state => state.molecule.representation);
    const on = usePref(displayPref).moleculeLabels;
    const shown = on && meta !== null && representation !== 'none';
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

    useEffect(() => {
        const context = contextRef.current;
        if (!context || labels.length === 0) return undefined;
        const size = new THREE.Vector2();
        // Each pill's size, read once for this label set (one layout, not one per frame).
        const boxes = labels.map((_, i) => ({ w: pillRefs.current[i]?.offsetWidth ?? 0, h: pillRefs.current[i]?.offsetHeight ?? 0 }));
        // What each element was last given, so an unchanged frame writes nothing.
        const placed: Array<string | null> = labels.map(() => null);
        const paths: Array<string | null> = labels.map(() => null);
        const place = () => {
            // three.js keeps the canvas's CSS size itself: no layout read.
            context.renderer.getSize(size);
            const project = (world: [number, number, number]) => projectToCanvas(context.camera, size.x, size.y, world);
            const centre = project(centroid);
            const screen = labels.map((label, i): ScreenBox | null => {
                const at = project(label.world);
                if (!at) return null;
                const { w, h } = boxes[i];
                if (label.kind === 'length' && centre) {
                    const [a, b] = [project(label.ends[0]), project(label.ends[1])];
                    if (a && b) return { ...besideBond(at, a, b, centre, w, h), w, h, depth: at.depth };
                }
                return { x: at.x, y: at.y, w, h, depth: at.depth };
            });
            const visible = declutter(screen);
            labels.forEach((label, i) => {
                const pill = pillRefs.current[i];
                const at = screen[i];
                if (pill) {
                    const transform = at && visible[i] ? `translate(${px(at.x)}px, ${px(at.y)}px) translate(-50%, -50%)` : '';
                    if (transform !== placed[i]) {
                        placed[i] = transform;
                        if (transform) pill.style.transform = transform;
                        pill.style.visibility = transform ? 'visible' : 'hidden';
                    }
                }
                const arc = label.kind === 'angle' ? arcRefs.current[i] : null;
                if (arc && label.kind === 'angle') {
                    // An arc goes with its degree label: none for a label hidden behind the camera or by a nearer one.
                    const points = visible[i] ? label.arc.map(project) : [null];
                    const d = points.every(Boolean)
                        ? points.map((p, k) => `${k ? 'L' : 'M'} ${px(p!.x)} ${px(p!.y)}`).join(' ')
                        : '';
                    if (d !== paths[i]) {
                        paths[i] = d;
                        arc.setAttribute('d', d);
                    }
                }
            });
        };
        return addAfterFrameListener(context, place);
    }, [contextRef, labels, centroid]);

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
        </div>
    );
};

export default MoleculeLabels;
