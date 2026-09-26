import { contrastRatio, parseCssColor, worstCaseContrast } from '../../src/a11y/contrast';

it('implements the WCAG 2 formula', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(parseCssColor('rgba(8, 8, 10, 0.55)')).toEqual([8, 8, 10, 0.55]);
    expect(parseCssColor('#1565c0')).toEqual([0x15, 0x65, 0xc0, 1]);
    // The overlays as they were: white text on a 55 % dark panel over a lit lobe.
    expect(worstCaseContrast('#ffffff', 'rgba(8, 8, 10, 0.55)')).toBeCloseTo(4.46, 2);
});
