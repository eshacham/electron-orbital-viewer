import React from 'react';
import { render } from '@testing-library/react';
import LevelNav, { aboutRelativitySentence, aboutPictureSentence } from '../../src/components/LevelNav';
import { methodStatement, type RelativityMode } from '../../src/atom/relativity';

/**
 * Ruling P18: "About this model" names the mode the Relativity switch is
 * solving for (`selectedRelativity`), not the mode of whatever picture
 * happens to be drawn (`relativity`) -- the two differ while a re-solve is
 * in flight, and the paragraph says so explicitly rather than quietly
 * describing a method that is not yet on screen.
 */
describe('LevelNav "About this model" follows the Relativity switch (ruling P18)', () => {
    const renderAbout = (selectedRelativity: RelativityMode, relativity: RelativityMode) => {
        const { container } = render(
            <LevelNav
                Z={6}
                selectedShell={null}
                selectedSubshell={null}
                selectedOrbital={null}
                onNavigate={() => {}}
                variant="about"
                selectedRelativity={selectedRelativity}
                relativity={relativity}
                pictureShown
            />
        );
        return container.textContent!;
    };

    it('states the method and relativity clause of the selected mode, and that the picture on screen is still the old one', () => {
        const text = renderAbout('spinOrbit', 'scalar');
        expect(text).toContain(methodStatement('spinOrbit'));
        expect(text).toContain(aboutRelativitySentence('spinOrbit'));
        expect(text).toContain('The picture on screen is still scalar-relativistic; the one with spin–orbit is being solved.');
    });

    it('says nothing about a stale picture when the switch and the drawn picture agree, and states "no spin-orbit coupling" exactly once', () => {
        const text = renderAbout('off', 'off');
        expect(text).not.toContain('is being solved.');
        expect(text.split('no spin-orbit coupling')).toHaveLength(2); // exactly one occurrence
    });

    it('never says "no spin-orbit" once spin–orbit actually is the selected and drawn mode', () => {
        const text = renderAbout('spinOrbit', 'spinOrbit');
        expect(text).not.toContain('no spin-orbit');
    });
});

describe('aboutPictureSentence (ruling P18)', () => {
    it('is null whenever the selected mode and the drawn picture agree', () => {
        expect(aboutPictureSentence('off', 'off')).toBeNull();
        expect(aboutPictureSentence('scalar', 'scalar')).toBeNull();
        expect(aboutPictureSentence('spinOrbit', 'spinOrbit')).toBeNull();
    });

    it('names both the drawn picture and what is being solved for when they differ', () => {
        expect(aboutPictureSentence('spinOrbit', 'scalar')).toBe(
            'The picture on screen is still scalar-relativistic; the one with spin–orbit is being solved.'
        );
        expect(aboutPictureSentence('off', 'scalar')).toBe(
            'The picture on screen is still scalar-relativistic; the non-relativistic one is being solved.'
        );
        expect(aboutPictureSentence('scalar', 'off')).toBe(
            'The picture on screen is still non-relativistic; the scalar-relativistic one is being solved.'
        );
    });
});
