import type { BondsState, BondsView } from '../store/bondsSlice';
import type { BondsData } from '../bonds/useBondsData';
import { bondsFieldRequest, SPIN_SUFFIX } from '../bonds/bonds_request';
import { H2PLUS_LABELS, H2PLUS_STATES } from '../bonds/h2plus';
import type { FieldRenderRequest } from '../field_source';
import type { ThumbColouring } from './ThumbnailService';
import type { StripItem } from './strip_items';

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

/**
 * One tile: the main view's own request for that view (bondsFieldRequest),
 * meshed at BONDS_THUMB_RESOLUTION. `where` is the scan point's id (or H₂⁺'s
 * R) and `drawnAt` what the surface's level depends on, so no two pictures
 * -- another point, ρ, fraction or colouring -- share a cache key.
 */
function tile(
    key: string, label: string, spoken: string, target: BondsView, selected: boolean,
    field: FieldRenderRequest, colouring: Exclude<ThumbColouring, object>, system: string, where: string, drawnAt: string, fraction: number,
): BondsStripItem {
    return {
        key, label, spoken, group: null, groupSpoken: null, target, selected,
        thumb: {
            kind: 'orbital',
            request: {
                kind: 'field',
                contentKey: `bonds|${system}|${where}|${drawnAt}|${fraction}|${colouring}`,
                field: { ...field, resolution: BONDS_THUMB_RESOLUTION },
                colouring,
            },
        },
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
            return [tile(`h2plus-${state}`, label, `${label} orbital`, view, sameView(view, bonds.view),
                built.request, 'phase', 'h2plus', String(h2plusR), viewKey(view), enclosedFraction)];
        });
    }
    const densityView: BondsView = { kind: 'density' };
    const density = bondsFieldRequest({ ...bonds, view: densityView }, data.basis, enclosedFraction);
    if (!density || !data.basis || !data.meta) return [];
    const where = data.basis.id;
    const items = [tile('density', 'Total density', 'total electron density', densityView, bonds.view.kind === 'density',
        density.request, 'density', bonds.system, where, `density@${bonds.densityIso}`, enclosedFraction)];
    const orbitals = data.meta.orbitals;
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
        items.push(tile(`mo-${orbital.index}`, label, spoken, view, sameView(view, bonds.view),
            built.request, 'phase', bonds.system, where, viewKey(view), enclosedFraction));
    }
    return items;
}
