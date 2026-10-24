import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { planMoleculeRender } from '../../src/molecules/render_plan';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { generateFieldMeshes } from '../../src/orbital_mesh';
import { insideBallNote, insideBallNoteFor, surfaceReachByAtom } from '../../src/molecules/inside_ball';
import reducer, { metaLoaded, selectMolecule, renderFinished, renderStarted, setRepresentation, setSurface } from '../../src/store/moleculeSlice';
import MoleculeNav from '../../src/components/MoleculeNav';
import type { MoleculeBasis } from '../../src/molecules/types';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';
import type { Representation } from '../../src/molecules/ball_and_stick';

const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));
const h2s: LibraryMoleculeMeta = fixture('h2s', 'meta.json');
const h2sBasis: MoleculeBasis = { ...fixture('h2s', 'basis.json'), id: h2s.id };
const ethane: LibraryMoleculeMeta = fixture('c2h6', 'meta.json');
const ethaneBasis: MoleculeBasis = { ...fixture('c2h6', 'basis.json'), id: ethane.id };

/** The surface the app draws for `label` at `fraction` (the orbital worker's own path), as each atom's reach. */
function drawnReach(meta: LibraryMoleculeMeta, basis: MoleculeBasis, label: string, fraction: number) {
    const index = meta.orbitals.find(o => o.label === label)!.index;
    const plan = planMoleculeRender(meta, { kind: 'mo', index }, fraction, basis);
    if (plan.kind !== 'mo') throw new Error('expected an orbital plan');
    registerMoleculeBasis(basis);
    const [mesh] = generateFieldMeshes(plan.request);
    return { index, reach: surfaceReachByAtom(mesh.positions, meta.atoms) };
}

/**
 * Ruling R25-C-present (b). A core drawn whole can still be hidden: S's 1s at 99 % reaches 0.28 a₀ from the
 * nucleus, and ball and stick draws S's ball 0.79 a₀ across. A note under the orbital list says so -- computed
 * from the surface drawn and the ball the representation draws, never keyed on "a core" -- with a button that
 * sets Structure to None.
 */
describe('the inside-the-ball note (ruling R25-C-present)', () => {
    const h2sCore = drawnReach(h2s, h2sBasis, '1a1', 0.99);
    const ethaneCore = drawnReach(ethane, ethaneBasis, '1a1g', 0.99);

    it("says S's 1s at 99 % lies inside the S ball in ball and stick", () => {
        expect(insideBallNote('1a1', h2s.atoms, h2sCore.reach, 'ball-and-stick')).toBe('1a1 lies inside the S ball');
    });

    it("says nothing for C₂H₆'s C 1s at 99 %, which pokes out of its C balls", () => {
        expect(insideBallNote('1a1g', ethane.atoms, ethaneCore.reach, 'ball-and-stick')).toBeNull();
        // Space filling's van der Waals balls do swallow it: computed per representation, not per orbital.
        expect(insideBallNote('1a1g', ethane.atoms, ethaneCore.reach, 'space-filling')).toBe('1a1g lies inside the C balls');
    });

    it('says nothing with Structure set to None, or for a valence orbital', () => {
        expect(insideBallNote('1a1', h2s.atoms, h2sCore.reach, 'none')).toBeNull();
        const homo = drawnReach(h2s, h2sBasis, '2b1', 0.9);
        expect(insideBallNote('2b1', h2s.atoms, homo.reach, 'space-filling')).toBeNull();
    });

    it('reads the note off the slice only for the orbital drawn, and the button sets Structure to None', () => {
        const drawn = (representation: Representation) => {
            let state = reducer(reducer(undefined, selectMolecule({ id: h2s.id })), metaLoaded({ id: h2s.id, meta: h2s }));
            state = reducer(state, setSurface({ kind: 'mo', index: h2sCore.index }));
            state = reducer(state, setRepresentation(representation));
            state = reducer(state, renderStarted('Computing 1a1…'));
            return reducer(state, renderFinished({
                isoLevel: 0.2, surfaceReach: h2sCore.reach,
                drawn: { id: h2s.id, surface: { kind: 'mo', index: h2sCore.index }, enclosedFraction: 0.99 },
            }));
        };
        expect(insideBallNoteFor(drawn('ball-and-stick'))).toBe('1a1 lies inside the S ball');
        expect(insideBallNoteFor(drawn('none'))).toBeNull();
        // A new render under way: the surface it measured is no longer the one drawn.
        expect(insideBallNoteFor(reducer(drawn('ball-and-stick'), renderStarted('Computing 1a1…')))).toBeNull();

        const onHideStructure = jest.fn();
        const { container } = render(<MoleculeNav entries={[]} indexError={null} meta={h2s} selectedId="h2s" isLoading={false}
            surface={{ kind: 'mo', index: h2sCore.index }} onSelectMolecule={() => {}} onSurfaceChange={() => {}}
            insideBallNote={insideBallNoteFor(drawn('ball-and-stick'))} onHideStructure={onHideStructure} />);
        expect(screen.getByRole('note', { name: /1a1 lies inside the S ball/ })).toHaveTextContent(
            '1a1 lies inside the S ball — set Structure to None to see it.');
        // Below the list, the first of its notes (it is about the orbital drawn); the rows' scroller holds no note.
        expect(container.querySelector('.molecule-orbital-notes')!.firstElementChild).toHaveClass('molecule-inside-ball-note');
        expect(container.querySelector('.molecule-orbital-list .molecule-inside-ball-note')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'set Structure to None' }));
        expect(onHideStructure).toHaveBeenCalledTimes(1);
    });
});
