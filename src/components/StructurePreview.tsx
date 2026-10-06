import React, { useMemo, useState } from 'react';
import { IconButton, Typography } from '@mui/material';
import { projectStructure } from '../jobs/structure_projection';
import { elementFor } from '../elements';
import type { CanonicalAtom } from '../jobs/api_types';

interface StructurePreviewProps {
    atoms: CanonicalAtom[];
    size?: number;
}

const TURN = Math.PI / 6;
const RADIANS_PER_PIXEL = 0.012;

/**
 * The structure a preview resolved to, as a small ball-and-stick drawing:
 * Phase 6's bonding rule, radii and CPK colours, projected into SVG. Not the
 * viewer's three.js overlay: a second WebGL context in the side panel or the
 * phone sheet would compete with the main canvas for the few a phone allows,
 * and this only has to answer "is that the molecule I meant?".
 */
const StructurePreview: React.FC<StructurePreviewProps> = ({ atoms, size = 220 }) => {
    const [yaw, setYaw] = useState(0);
    const [dragX, setDragX] = useState<number | null>(null);
    const projection = useMemo(() => projectStructure(atoms, yaw), [atoms, yaw]);
    const byIndex = useMemo(() => new Map(projection.atoms.map(atom => [atom.index, atom])), [projection]);
    const h = projection.halfExtent;
    return (
        <figure className="structure-preview">
            <svg
                width={size} height={size} viewBox={`${-h} ${-h} ${2 * h} ${2 * h}`} role="img"
                aria-label={`preview of the resolved structure, ${atoms.length} atoms`}
                style={{ touchAction: 'none', cursor: dragX === null ? 'grab' : 'grabbing' }}
                onPointerDown={event => setDragX(event.clientX)}
                onPointerMove={event => {
                    if (dragX === null) return;
                    setYaw(value => value + (event.clientX - dragX) * RADIANS_PER_PIXEL);
                    setDragX(event.clientX);
                }}
                onPointerUp={() => setDragX(null)}
                onPointerLeave={() => setDragX(null)}
                onPointerCancel={() => setDragX(null)}
            >
                {/* y up, as in the viewer */}
                <g transform="scale(1,-1)">
                    {projection.bonds.map(bond => {
                        const [p, q] = [byIndex.get(bond.a)!, byIndex.get(bond.b)!];
                        const [mx, my] = [(p.x + q.x) / 2, (p.y + q.y) / 2];
                        return (
                            <g key={`${bond.a}-${bond.b}`} className="structure-preview-bond">
                                <line x1={p.x} y1={p.y} x2={mx} y2={my} stroke={p.color} />
                                <line x1={mx} y1={my} x2={q.x} y2={q.y} stroke={q.color} />
                            </g>
                        );
                    })}
                    {projection.atoms.map(atom => (
                        <circle key={atom.index} className="structure-preview-atom" cx={atom.x} cy={atom.y} r={atom.radius} fill={atom.color}>
                            <title>{`${elementFor(atom.Z)?.symbol ?? atom.Z}, atom ${atom.index + 1}`}</title>
                        </circle>
                    ))}
                </g>
            </svg>
            <figcaption className="structure-preview-caption">
                <Typography variant="caption" className="molecule-caption">
                    The structure as resolved, {atoms.length} atoms; drag to turn it. Sticks show connectivity, not bond order.
                </Typography>
                <IconButton size="small" aria-label="turn the preview" onClick={() => setYaw(value => value + TURN)}>↻</IconButton>
            </figcaption>
        </figure>
    );
};

export default StructurePreview;
