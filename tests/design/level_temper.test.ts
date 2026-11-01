import { applyLevelToDocument } from '../../src/design/level_temper';

afterEach(() => { document.documentElement.removeAttribute('data-level'); });

describe('applyLevelToDocument (Brass Instrument: the chrome temper per learning level)', () => {
    it('sets data-level on the document element, and follows the level', () => {
        applyLevelToDocument('basics');
        expect(document.documentElement.dataset.level).toBe('basics');
        applyLevelToDocument('research');
        expect(document.documentElement.dataset.level).toBe('research');
    });

    it('writes to the root it is given', () => {
        const root = document.createElement('div');
        applyLevelToDocument('advanced', root);
        expect(root.dataset.level).toBe('advanced');
        expect(document.documentElement.hasAttribute('data-level')).toBe(false);
    });
});
