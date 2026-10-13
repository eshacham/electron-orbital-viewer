import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRovingFocus } from '../../src/shell/useRovingFocus';

function Group() {
    const ref = useRef<HTMLDivElement>(null);
    useRovingFocus(ref, { selector: 'button', orientation: 'vertical' });
    return (
        <div ref={ref}>
            <button aria-pressed="false">one</button>
            <button aria-pressed="true">two</button>
            <button aria-pressed="false">three</button>
        </div>
    );
}

describe('useRovingFocus (spec §13: arrow keys inside, Tab exits)', () => {
    it('makes the pressed item the one tab stop and moves with the arrows, Home and End', () => {
        render(<Group />);
        const [one, two, three] = screen.getAllByRole('button');
        expect([one.tabIndex, two.tabIndex, three.tabIndex]).toEqual([-1, 0, -1]);
        two.focus();
        fireEvent.keyDown(two, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(three);
        fireEvent.keyDown(three, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(one);
        fireEvent.keyDown(one, { key: 'End' });
        expect(document.activeElement).toBe(three);
        fireEvent.keyDown(three, { key: 'Home' });
        expect(document.activeElement).toBe(one);
        expect(one.tabIndex).toBe(0);
    });
});

// Controller ruling DX2: the hook's effect read ref.current once, so a
// container that mounts after the first render (the strip after
// collapse -> expand; the mₗ row after a subshell is picked, both later
// tasks) never got roving focus. A 3rd, optional `resetKey` param is
// included in the effect's dependency list so passing the state that
// gates the container's mount re-attaches the hook once it exists.
function LateGroup() {
    const [shown, setShown] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useRovingFocus(ref, { selector: 'button', orientation: 'horizontal' }, shown);
    return (
        <div>
            <button onClick={() => setShown(true)}>reveal</button>
            {shown && (
                <div ref={ref}>
                    <button aria-pressed="false">a</button>
                    <button aria-pressed="false">b</button>
                </div>
            )}
        </div>
    );
}

describe('useRovingFocus with resetKey (ruling DX2: late-mounted container)', () => {
    it('attaches once the container exists: exactly one tabIndex 0 item, and the arrows move', () => {
        render(<LateGroup />);
        fireEvent.click(screen.getByRole('button', { name: 'reveal' }));
        const a = screen.getByRole('button', { name: 'a' });
        const b = screen.getByRole('button', { name: 'b' });
        expect([a.tabIndex, b.tabIndex]).toEqual([0, -1]);
        a.focus();
        fireEvent.keyDown(a, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(b);
    });
});
