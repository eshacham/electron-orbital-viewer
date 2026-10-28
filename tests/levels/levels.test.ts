import { LEVELS, LEVEL_LABEL, levelRank, atLeast, CONTROL_LEVEL, levelPointer, hiddenValueNote } from '../../src/levels/levels';

describe('levels (spec plan: learning levels)', () => {
    it('orders the four levels Basics, Explore, Advanced, Research', () => {
        expect(LEVELS).toEqual(['basics', 'explore', 'advanced', 'research']);
        expect(LEVEL_LABEL).toEqual({ basics: 'Basics', explore: 'Explore', advanced: 'Advanced', research: 'Research' });
    });

    it('ranks levels by their position, 0 through 3', () => {
        expect(levelRank('basics')).toBe(0);
        expect(levelRank('explore')).toBe(1);
        expect(levelRank('advanced')).toBe(2);
        expect(levelRank('research')).toBe(3);
    });

    it('atLeast compares rank, inclusive', () => {
        expect(atLeast('advanced', 'explore')).toBe(true);
        expect(atLeast('explore', 'explore')).toBe(true);
        expect(atLeast('basics', 'explore')).toBe(false);
    });

    it('CONTROL_LEVEL places charge at Advanced', () => {
        expect(CONTROL_LEVEL.charge).toBe('advanced');
    });

    it('levelPointer names the controls still hidden, and the level where they appear', () => {
        expect(levelPointer(['charge', 'relativity'], 'explore')).toBe('Charge and relativity appear at Advanced');
    });

    it('levelPointer is null when nothing in the list is hidden', () => {
        expect(levelPointer(['plot'], 'research')).toBeNull();
    });

    // Task 2: a section can hide controls of two levels at once; its one line names the nearer step only.
    it('levelPointer names only the controls of the nearest deeper level', () => {
        const display = ['plot', 'axes', 'enclosed', 'surfaceStyle', 'advancedAppearance'] as const;
        expect(levelPointer([...display], 'basics')).toBe('The plot and axes appear at Explore');
        expect(levelPointer([...display], 'explore')).toBe('The enclosed fraction, surface style and advanced appearance appear at Advanced');
        expect(levelPointer([...display], 'advanced')).toBeNull();
    });

    // Task 1's deferred minor: every pointer line the panels show, read as a sentence.
    it('levelPointer reads well for every line the panels show', () => {
        expect(levelPointer(['orbitalEnergies'], 'basics')).toBe('Orbital energies appear at Explore');
        expect(levelPointer(['combinations'], 'explore')).toBe('Combinations appear at Advanced');
        expect(levelPointer(['exports'], 'explore')).toBe('Exports appear at Advanced');
        expect(levelPointer(['structure', 'bondLabels', 'dipole', 'properties'], 'basics'))
            .toBe('Structure, bond labels, the dipole arrow and properties appear at Explore');
        expect(levelPointer(['requestWorkspace'], 'advanced')).toBe('Molecule requests appear at Research');
        // Task 3 (picture control): Bonds' curve shows at every level, so its Display line names only Data.
        expect(levelPointer(['data', 'enclosed'], 'basics')).toBe('Data appears at Explore');
        expect(CONTROL_LEVEL.data).toBe(CONTROL_LEVEL.plot);
    });

    // Ruling PF1 (Review Focus 2): a hidden control still holding a value says what is shown and where it is set.
    it('hiddenValueNote says what is shown and where its controls appear', () => {
        expect(hiddenValueNote('Fe²⁺', 'charge', 'advanced')).toBe('Showing Fe²⁺ — charge controls appear at Advanced');
    });
});
