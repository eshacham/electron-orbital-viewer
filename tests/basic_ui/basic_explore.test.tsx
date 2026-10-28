import React, { useState } from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import BasicExplore from '../../src/basic_ui/BasicExplore';
import { BASIC_ORBITALS_ABOUT } from '../../src/info/basic_info';
import type { BasicSelection } from '../../src/store/orbitalSlice';
import { NO_COMBINATION, CombinationSelection } from '../../src/combinations';

/**
 * A stateful wrapper, the way App drives BasicExplore through setBasicSelection/setCombination. `withPick` wires
 * `onPick` the way App's `handleBasicPick` does (ruling T1 M2, T2-I1): it leaves whatever combination is held,
 * then selects -- for tests that need to see a chip press do both, not just the default `onChange` (which only
 * selects, like the row's own n/l corrections).
 */
function Harness({
    initial = { n: 3, l: 2, ml: 0 } as BasicSelection, combination: initialCombination = NO_COMBINATION, withPick = false,
}: {
    initial?: BasicSelection; combination?: CombinationSelection; withPick?: boolean;
}) {
    const [selection, setSelection] = useState(initial);
    const [combination, setCombination] = useState(initialCombination);
    const onChange = (change: Partial<BasicSelection>) => setSelection(s => ({ ...s, ...change }));
    const onPick = withPick ? (change: Partial<BasicSelection>) => { onChange(change); setCombination(NO_COMBINATION); } : undefined;
    return (
        <BasicExplore
            selection={selection}
            onChange={onChange}
            onPick={onPick}
            combination={combination}
            onCombinationChange={setCombination}
        />
    );
}

describe('BasicExplore (spec §9.2: header tile, chips, draw on selection)', () => {
    // Task 5: the one-electron caption moved to Info (basicInfo); the panel keeps the tile and short labels only.
    it('shows the tile fixed at Z = 1, Hydrogen-like, with no caption under it', () => {
        const { container } = render(<Harness />);
        const tile = document.querySelector('.basic-tile')!;
        expect(tile).not.toBeNull();
        expect(within(tile as HTMLElement).getByText('Z = 1')).toBeInTheDocument();
        expect(within(tile as HTMLElement).getByText('H')).toBeInTheDocument();
        expect(within(tile as HTMLElement).getByText('Hydrogen-like')).toBeInTheDocument();
        expect(container.querySelector('.basic-tile-caption')).toBeNull();
        expect(container.textContent).not.toContain(BASIC_ORBITALS_ABOUT);
    });

    // Owner R26-1: every line of the tile is centred, and "Hydrogen-like" sits on one line (it wrapped "Hydrogen-" /
    // "like", left-aligned) -- in the Atoms tile's 88 × 96 box, as that tile centres its symbol, name and mass.
    it('centres every line of the tile and keeps "Hydrogen-like" on one line, in the element tile\'s size (owner R26-1)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/basic_ui/basic_explore.css'), 'utf8');
        const rule = (selector: string) => {
            const match = new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
            if (!match) throw new Error(`no rule for ${selector}`);
            return match[1];
        };
        expect(rule('.basic-tile')).toMatch(/text-align:\s*center/);
        expect(rule('.basic-tile')).toMatch(/width:\s*var\(--ql-size-element-tile-width\)/);
        expect(rule('.basic-tile')).toMatch(/height:\s*var\(--ql-size-element-tile-height\)/);
        expect(rule('.basic-tile-name')).toMatch(/white-space:\s*nowrap/);
    });

    // Task 1 (picture control): the Subshell l and Orbital mₗ rows are gone -- the thumbnail strip under the picture
    // is the picker for them now (their own tests moved to src/App.test.tsx, "in Basic Orbitals mode the strip...").
    // Only Shell n keeps a row here, with its own (i); there is no paragraph text left in the panel.
    it('labels the n row "Shell n" with an (i), and renders no Subshell or Orbital row', () => {
        const { container } = render(<Harness />);
        expect(screen.getByRole('group', { name: 'Shell n' })).toHaveClass('basic-chip-row');
        expect(screen.getByRole('button', { name: 'About Shell' })).toHaveClass('info-button');
        expect(screen.queryByRole('group', { name: 'Subshell l' })).not.toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Orbital mₗ' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'About Subshell' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'About Orbital' })).not.toBeInTheDocument();
        expect(container.querySelectorAll('p, .MuiFormHelperText-root, .MuiTypography-caption')).toHaveLength(0);
    });

    it('renders 9 n-chips for {n:3,l:2,ml:0}, the current one pressed', () => {
        render(<Harness />);
        // Task 5: the row is named by its visible label (Shell n).
        const nRow = screen.getByRole('group', { name: /^shell n/i });
        expect(within(nRow).getAllByRole('button')).toHaveLength(9);
        expect(within(nRow).getByRole('button', { name: 'n = 3' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('names chips with the label inside the accessible name (WCAG 2.5.3)', () => {
        render(<Harness initial={{ n: 4, l: 1, ml: 1 }} />);
        expect(screen.getByRole('button', { name: 'n = 4' })).toBeInTheDocument();
    });

    it('clicking a chip reports the change', () => {
        const onChange = jest.fn();
        render(
            <BasicExplore selection={{ n: 3, l: 2, ml: 0 }} onChange={onChange}
                combination={NO_COMBINATION} onCombinationChange={() => {}} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'n = 4' }));
        expect(onChange).toHaveBeenCalledWith({ n: 4 });
    });

    // The existing Controls-style correction (lines 395-402 pre-T6), still in BasicExplore: an l no longer valid for n
    // resets both l and ml together. The Subshell/Orbital rows that used to show this are gone (Task 1), so this is
    // observed through the heading, which renders the corrected orbital (OrbitalLabel n, l, ml).
    it('resets l and ml together when a new n leaves l out of range, shown in the heading', () => {
        render(<Harness initial={{ n: 4, l: 3, ml: 0 }} />);
        fireEvent.click(screen.getByRole('button', { name: 'n = 2' }));
        const heading = document.getElementById('orbital-name')!;
        // M7 (Task 1 review): anchored, as the sibling test below is -- an unanchored match would also pass for "2sp" etc.
        expect(heading).toHaveSeenText(/^2s$/);
    });

    // Task 5: the heading names the orbital with a real subscript (OrbitalLabel), never "3d_z²".
    it('reads the orbital name when no combination is active', () => {
        render(<Harness initial={{ n: 3, l: 2, ml: 0 }} />);
        const heading = document.getElementById('orbital-name')!;
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(heading).toHaveSeenText(/^3dz²$/);
        expect(heading.querySelector('sub')).toHaveTextContent('z²');
    });

    it('while a combination is active, the heading reads the combination instead, but the n chips stay live', () => {
        render(<Harness combination={{ kind: 'hybrid', hybrid: 'sp3', member: 'all' }} />);
        expect(screen.getByText('sp³ hybrids — all 4')).toBeInTheDocument();
        expect(document.getElementById('orbital-name')).not.toHaveTextContent('3dz²'); // Task 5: OrbitalLabel's text
        // Ruling T1 M2: the n chips are never frozen now -- a press is always a way back to one orbital, the same
        // as a strip pick (was disabled at Advanced+ under ruling T2-I1).
        for (const button of screen.getAllByRole('button').filter(b => b.className.includes('basic-chip'))) {
            expect(button).not.toHaveAttribute('aria-disabled', 'true');
            expect(button).not.toBeDisabled();
        }
    });

    // Ruling T1 M2: a chip press leaves a held combination, exactly as a strip pick does (Review Focus 3).
    it('ruling T1 M2: pressing n while a combination is active leaves it and selects', () => {
        render(<Harness initial={{ n: 3, l: 2, ml: 0 }} combination={{ kind: 'hybrid', hybrid: 'sp3', member: 'all' }} withPick />);
        fireEvent.click(screen.getByRole('button', { name: 'n = 4' }));
        expect(screen.queryByText('sp³ hybrids — all 4')).not.toBeInTheDocument();
        // n: 3 -> 4 keeps l = 2, ml = 0 in range (unchanged by the row's own correction effects): "4dz²".
        const heading = document.getElementById('orbital-name')!;
        expect(heading).toHaveSeenText(/^4dz²$/);
    });

    // Review I1: an n = 2 Stark state's name is typeset in the heading as in Info, never "2p_z".
    it('typesets an n = 2 Stark state in the heading, with no "_"', () => {
        render(<Harness combination={{ kind: 'field', level: 2, field: 0.002, stark: 'lower' }} />);
        const heading = document.getElementById('orbital-name')!;
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(heading).toHaveSeenText('n = 2 Stark state (2s + 2pz)/√2');
        expect(heading.textContent).not.toContain('_');
        expect(heading.querySelector('sub')).toHaveTextContent('z');
    });

    it('says "not drawn" when the combination has a problem', () => {
        render(<Harness combination={{ kind: 'hybrid', hybrid: 'sp3', member: 9 }} />);
        expect(screen.getByText(/sp³ hybrid.*— not drawn/)).toBeInTheDocument();
    });

    it('reports a combination choice through onCombinationChange', () => {
        const onCombinationChange = jest.fn();
        render(
            <BasicExplore selection={{ n: 3, l: 2, ml: 0 }} onChange={() => {}}
                combination={NO_COMBINATION} onCombinationChange={onCombinationChange} />
        );
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
        fireEvent.click(within(screen.getByRole('listbox')).getByText('sp'));
        expect(onCombinationChange).toHaveBeenCalledWith({ kind: 'hybrid', hybrid: 'sp', member: 'all' });
    });

    // Reuse of tests/shell/roving_focus.test.tsx's pattern: arrow keys move focus within one row.
    it('moves focus within a row with the arrow keys (spec §13)', () => {
        render(<Harness />);
        const nRow = screen.getByRole('group', { name: /^shell n/i }); // Task 5: named by its visible label
        const chips = within(nRow).getAllByRole('button');
        const current = within(nRow).getByRole('button', { name: 'n = 3' });
        act(() => { current.focus(); });
        fireEvent.keyDown(current, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(chips[chips.indexOf(current) + 1]);
    });
});
