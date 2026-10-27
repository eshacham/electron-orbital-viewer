import React, { useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import BasicExplore from '../../src/basic_ui/BasicExplore';
import { BASIC_ORBITALS_ABOUT } from '../../src/info/basic_info';
import type { BasicSelection } from '../../src/store/orbitalSlice';
import { NO_COMBINATION, CombinationSelection } from '../../src/combinations';

/** A stateful wrapper, the way App drives BasicExplore through setBasicSelection/setCombination. */
function Harness({ initial = { n: 3, l: 2, ml: 0 } as BasicSelection, combination: initialCombination = NO_COMBINATION }: {
    initial?: BasicSelection; combination?: CombinationSelection;
}) {
    const [selection, setSelection] = useState(initial);
    const [combination, setCombination] = useState(initialCombination);
    return (
        <BasicExplore
            selection={selection}
            onChange={change => setSelection(s => ({ ...s, ...change }))}
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

    // Task 5 (critique P2: unlabeled n/l/mₗ rows): each row has a visible label, which names its group, and an (i)
    // beside it; there is no paragraph text left in the panel.
    it('labels the rows "Shell n", "Subshell l" and "Orbital mₗ", each with an (i), and holds no paragraph text', () => {
        const { container } = render(<Harness />);
        expect(screen.getByRole('group', { name: 'Shell n' })).toHaveClass('basic-chip-row');
        expect(screen.getByRole('group', { name: 'Subshell l' })).toHaveClass('basic-chip-row');
        expect(screen.getByRole('group', { name: 'Orbital mₗ' })).toHaveClass('basic-chip-row');
        for (const term of ['Shell', 'Subshell', 'Orbital']) {
            expect(screen.getByRole('button', { name: `About ${term}` })).toHaveClass('info-button');
        }
        expect(container.querySelectorAll('p, .MuiFormHelperText-root, .MuiTypography-caption')).toHaveLength(0);
    });

    it('renders 9 n-chips, 3 subshell chips and 5 orbital chips for {n:3,l:2,ml:0}, the current ones pressed', () => {
        render(<Harness />);
        // Task 5: the rows are named by their visible labels (Shell n, Subshell l, Orbital mₗ).
        const nRow = screen.getByRole('group', { name: /^shell n/i });
        expect(within(nRow).getAllByRole('button')).toHaveLength(9);
        expect(within(nRow).getByRole('button', { name: 'n = 3' })).toHaveAttribute('aria-pressed', 'true');

        const subshellRow = screen.getByRole('group', { name: /^subshell/i });
        expect(within(subshellRow).getAllByRole('button')).toHaveLength(3); // s, p, d (l < 3)
        expect(within(subshellRow).getByRole('button', { name: '3d subshell' })).toHaveAttribute('aria-pressed', 'true');

        const orbitalRow = screen.getByRole('group', { name: /^orbital/i });
        expect(within(orbitalRow).getAllByRole('button')).toHaveLength(5); // ml -2..2
        // Task 5: orbital names carry a real subscript, read as "3dz²" (OrbitalLabel), not "3d_z²".
        expect(within(orbitalRow).getByRole('button', { name: '3dz² orbital' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(orbitalRow).getByRole('button', { name: '3dz² orbital' }).querySelector('sub')).toHaveTextContent('z²');
    });

    it('names chips with the label inside the accessible name (WCAG 2.5.3)', () => {
        render(<Harness initial={{ n: 4, l: 1, ml: 1 }} />);
        expect(screen.getByRole('button', { name: 'n = 4' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '4p subshell' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '4px orbital' })).toBeInTheDocument(); // Task 5: a real subscript
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

    // The existing Controls-style correction (lines 395-402 pre-T6), now in BasicExplore:
    // an l no longer valid for n resets both l and ml together; an out-of-range ml alone resets just ml.
    it('clicking a subshell chip reports l, and the orbital row re-derives (ml resets to 0)', () => {
        render(<Harness initial={{ n: 3, l: 2, ml: 0 }} />);
        fireEvent.click(screen.getByRole('button', { name: '3p subshell' }));
        const orbitalRow = screen.getByRole('group', { name: /^orbital/i });
        expect(within(orbitalRow).getAllByRole('button')).toHaveLength(3); // p: ml -1..1
        expect(within(orbitalRow).getByRole('button', { name: '3pz orbital' })).toHaveAttribute('aria-pressed', 'true'); // Task 5: a real subscript
    });

    it('resets l and ml together when a new n leaves l out of range', () => {
        render(<Harness initial={{ n: 4, l: 3, ml: 0 }} />);
        fireEvent.click(screen.getByRole('button', { name: 'n = 2' }));
        const subshellRow = screen.getByRole('group', { name: /^subshell/i });
        expect(within(subshellRow).getByRole('button', { name: '2s subshell' })).toHaveAttribute('aria-pressed', 'true');
        const orbitalRow = screen.getByRole('group', { name: /^orbital/i });
        expect(within(orbitalRow).getAllByRole('button')).toHaveLength(1);
        expect(within(orbitalRow).getByRole('button', { name: '2s orbital' })).toHaveAttribute('aria-pressed', 'true');
    });

    // Task 5: the heading names the orbital with a real subscript (OrbitalLabel), never "3d_z²".
    it('reads the orbital name when no combination is active', () => {
        render(<Harness initial={{ n: 3, l: 2, ml: 0 }} />);
        const heading = document.getElementById('orbital-name')!;
        expect(heading).toHaveTextContent(/^3dz²$/);
        expect(heading.querySelector('sub')).toHaveTextContent('z²');
    });

    it('while a combination is active, disables the chip rows and the heading reads the combination instead', () => {
        render(<Harness combination={{ kind: 'hybrid', hybrid: 'sp3', member: 'all' }} />);
        expect(screen.getByText('sp³ hybrids — all 4')).toBeInTheDocument();
        expect(document.getElementById('orbital-name')).not.toHaveTextContent('3dz²'); // Task 5: OrbitalLabel's text
        for (const button of screen.getAllByRole('button').filter(b => b.className.includes('basic-chip'))) {
            expect(button).toHaveAttribute('aria-disabled', 'true');
        }
    });

    // Review I1: an n = 2 Stark state's name is typeset in the heading as in Info, never "2p_z".
    it('typesets an n = 2 Stark state in the heading, with no "_"', () => {
        render(<Harness combination={{ kind: 'field', level: 2, field: 0.002, stark: 'lower' }} />);
        const heading = document.getElementById('orbital-name')!;
        expect(heading).toHaveTextContent('n = 2 Stark state (2s + 2pz)/√2');
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
