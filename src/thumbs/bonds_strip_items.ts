import type { BondsState, BondsView } from '../store/bondsSlice';
import type { BondsData } from '../bonds/useBondsData';
import { bondsFieldRequest, SPIN_SUFFIX } from '../bonds/bonds_request';
import { H2PLUS_LABELS, H2PLUS_STATES } from '../bonds/h2plus';
import type { FieldRenderRequest } from '../field_source';
import type { ThumbColouring } from './ThumbnailService';
import type { StripItem } from './strip_items';
import type { MoleculeBasis } from '../molecules/types';
import { basisCentredOn, orbitalBox } from '../molecules/orbital_box';

/**
 * Spec §12's figure for a molecular orbital's tile: 40³. Gaussian MOs are
 * smooth on the tile's scale, and a molecule's strip is up to 21 tiles (O₂'s
 * α and β sets), each a fresh basis evaluation in the worker.
 */
export const BONDS_THUMB_RESOLUTION = 40;

export type BondsStripItem = StripItem<BondsView>;

interface BondsStripArgs {
    bonds: BondsState;
    /** Only the point's files: useBondsData's object is new on every render, these two are not. */
    data: Pick<BondsData, 'meta' | 'basis'>;
    /** H₂⁺'s R on its slider (snapped), or null for a molecule. */
    h2plusR: number | null;
    enclosedFraction: number;
}

const viewKey = (view: BondsView): string =>
    view.kind === 'h2plus' ? `h2plus:${view.state}` : view.kind === 'mo' ? `mo:${view.label}:${view.spin}:${view.component}` : 'density';

const sameView = (a: BondsView, b: BondsView): boolean => viewKey(a) === viewKey(b);

interface TileSpec {
    key: string;
    label: string;
    spoken: string;
    target: BondsView;
    selected: boolean;
    /** The main view's own request for this view (bondsFieldRequest), meshed here at BONDS_THUMB_RESOLUTION. */
    field: FieldRenderRequest;
    colouring: Exclude<ThumbColouring, object>;
    /**
     * Everything else the picture depends on, for the cache key: the system, the
     * scan point's id (or H₂⁺'s R), the view and its level -- `density@ρ` for
     * the density, drawn at ρ (ruling T10-M4: no enclosed fraction), or
     * `<view>|<fraction>` for an orbital -- so no two pictures share a key.
     */
    content: string;
}

function tile({ key, label, spoken, target, selected, field, colouring, content }: TileSpec): BondsStripItem {
    return {
        key, label, spoken, group: null, groupSpoken: null, target, selected,
        thumb: {
            kind: 'orbital',
            request: {
                kind: 'field',
                contentKey: `bonds|${content}|${colouring}`,
                field: { ...field, resolution: BONDS_THUMB_RESOLUTION },
                colouring,
            },
        },
    };
}

/**
 * Ruling T10-core: an orbital tile is meshed in a box fitted to its own
 * orbital (orbital_box.ts), not the whole molecule's -- at 40³ a 1s core
 * orbital in the molecule's box is a voxel speck. The sampling box is always
 * centred on the origin, so the tile is given a copy of the basis moved by
 * −centre (and named for it): the same orbital, sitting at the centre of its
 * box. The tile frames its own mesh (render_thumbnail.ts), so where the
 * orbital sits does not show. The main view's request is not touched.
 */
function fittedToOrbital(field: FieldRenderRequest, basis: MoleculeBasis, moved: Map<string, MoleculeBasis>): FieldRenderRequest {
    const [source] = field.sources;
    if (source.recipe.type !== 'gaussianMO') return field;
    const { index } = source.recipe;
    const { centre, halfWidth } = orbitalBox(basis, index, source.rMax);
    if (halfWidth >= source.rMax) return field;
    let fitted = basis;
    if (centre.some(c => c !== 0)) {
        const key = centre.join(',');
        if (!moved.has(key)) moved.set(key, basisCentredOn(basis, centre));
        fitted = moved.get(key)!;
    }
    return {
        ...field,
        sources: [{ ...source, rMax: halfWidth, recipe: { type: 'gaussianMO', moleculeId: fitted.id, index } }],
        bases: [fitted],
    };
}

/**
 * The Bonds strip (spec §9.3 "Strip", §12, Task 10). H₂⁺: its two exact
 * states at the slider's R. A molecule: the total density first -- drawn at
 * the chosen ρ, in the density's colour, as the main view draws it -- then
 * every orbital meta.json lists, in the diagram's order, each in the phase
 * colours. A tile's target is the BondsView the diagram itself would set.
 *
 * Review Focus 5: nothing at all until the basis of the very scan point
 * selected has loaded (bondsFieldRequest's own guard), so no tile is ever
 * meshed from another R's, or another molecule's, basis.
 */
export function bondsStripItems({ bonds, data, h2plusR, enclosedFraction }: BondsStripArgs): BondsStripItem[] {
    if (bonds.system === 'h2plus') {
        if (h2plusR === null) return [];
        return H2PLUS_STATES.flatMap(state => {
            const view: BondsView = { kind: 'h2plus', state };
            const built = bondsFieldRequest({ ...bonds, R: h2plusR, view }, null, enclosedFraction);
            if (!built) return [];
            const label = H2PLUS_LABELS[state];
            return [tile({
                key: `h2plus-${state}`, label, spoken: `${label} orbital`, target: view, selected: sameView(view, bonds.view),
                field: built.request, colouring: 'phase', content: `h2plus|${h2plusR}|${viewKey(view)}|${enclosedFraction}`,
            })];
        });
    }
    const densityView: BondsView = { kind: 'density' };
    const density = bondsFieldRequest({ ...bonds, view: densityView }, data.basis, enclosedFraction);
    if (!density || !data.basis || !data.meta) return [];
    const where = data.basis.id;
    const items = [tile({
        // Ruling T10-I2 (WCAG 2.5.3): the name starts with the visible label.
        key: 'density', label: 'Total density', spoken: 'Total density, total electron density', target: densityView,
        selected: bonds.view.kind === 'density', field: density.request, colouring: 'density',
        content: `${bonds.system}|${where}|density@${bonds.densityIso}`,
    })];
    const orbitals = data.meta.orbitals;
    const moved = new Map<string, MoleculeBasis>();
    for (const orbital of orbitals) {
        const spin = orbital.spin ?? 'restricted';
        const siblings = orbitals.filter(o => o.label === orbital.label && (o.spin ?? 'restricted') === spin);
        const view: BondsView = { kind: 'mo', label: orbital.label, spin, component: siblings.indexOf(orbital) };
        const built = bondsFieldRequest({ ...bonds, view }, data.basis, enclosedFraction);
        // Real or absent (§3.5): an orbital this basis does not keep would be drawn as the density, under its label.
        if (!built || built.note !== null) continue;
        const label = `${orbital.label}${SPIN_SUFFIX[spin]}`;
        // Ruling T16-optname: "<label> orbital"; a degenerate partner also says which of its set it is, as the diagram's box does.
        const spoken = siblings.length > 1 ? `${label} orbital (${view.component + 1} of ${siblings.length})` : `${label} orbital`;
        items.push(tile({
            key: `mo-${orbital.index}`, label, spoken, target: view, selected: sameView(view, bonds.view),
            field: fittedToOrbital(built.request, data.basis, moved), colouring: 'phase',
            content: `${bonds.system}|${where}|${viewKey(view)}|${enclosedFraction}`,
        }));
    }
    return items;
}

/**
 * Ruling T10-I1: the strip while the same molecule's next scan point loads --
 * the tiles last shown, each on its glyph and label and asking for nothing,
 * so the strip (a bottom inset zone, and the phone sheet's first row) never
 * leaves and comes back, and no tile is meshed from another R's basis. The
 * selection follows `view`, which may have changed meanwhile.
 */
export function pendingBondsStripItems(items: readonly BondsStripItem[], view: BondsView): BondsStripItem[] {
    return items.map(item => ({ ...item, selected: sameView(item.target, view), thumb: { kind: 'pending' } }));
}
