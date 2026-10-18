import { MOLECULE_DATA_VERSION } from './data_version';

/**
 * A library molecule's build-time ball-and-stick picture (spec §12 item 2,
 * ruling P11): rendered by tools/thumbs/render_thumbs.mjs from the published
 * data of this version, and shipped with the site under the same version, so
 * a data bump that moves an atom also moves the picture's folder.
 */
export const structureThumbUrl = (id: string) => `/molecule-thumbs/${MOLECULE_DATA_VERSION}/${id}.webp`;

/** The picture's accessible name (spec §12 item 2). */
export const structureThumbAlt = (name: string) => `Ball-and-stick model of ${name}`;
