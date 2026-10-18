import { structureThumbAlt, structureThumbUrl } from '../../src/molecules/thumb_paths';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';

describe('structure thumbnails (spec §12 item 2, ruling P11)', () => {
    it('lives beside the data version it was rendered from', () => {
        expect(structureThumbUrl('h2o')).toBe(`/molecule-thumbs/${MOLECULE_DATA_VERSION}/h2o.webp`);
        expect(structureThumbUrl('glycine')).toBe('/molecule-thumbs/v3/glycine.webp');
    });

    it('says what the picture is', () => {
        expect(structureThumbAlt('Water')).toBe('Ball-and-stick model of Water');
        expect(structureThumbAlt('Boron trifluoride')).toBe('Ball-and-stick model of Boron trifluoride');
    });
});
