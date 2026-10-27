import { LEVELS, LEVEL_LABEL, levelRank, atLeast, CONTROL_LEVEL, levelPointer } from '../../src/levels/levels';

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
});
