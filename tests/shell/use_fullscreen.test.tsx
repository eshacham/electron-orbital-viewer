import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFullscreen } from '../../src/shell/useFullscreen';

function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const { active, toggle } = useFullscreen(ref);
    return <div ref={ref}><button onClick={toggle}>toggle</button><span>{active ? 'on' : 'off'}</span></div>;
}

describe('useFullscreen (spec §8.5)', () => {
    it('falls back to focus mode where element full screen does not exist (iPhone Safari), and Esc leaves it', () => {
        render(<Probe />);
        act(() => screen.getByText('toggle').click());
        expect(screen.getByText('on')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText('off')).toBeInTheDocument();
    });
});
