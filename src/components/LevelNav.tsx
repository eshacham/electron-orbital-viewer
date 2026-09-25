import React, { useState } from 'react';
import { Box, Breadcrumbs, Link, Chip, Typography, Collapse, Button } from '@mui/material';
import { elementFor } from '../elements';
import { shellsFor, configurationLabel, subshellLabel, valenceShellFor, valenceConfigurationLabel } from '../atom/configurations';
import { orbitalName } from '../orbital_names';

/**
 * Where a breadcrumb segment or shell chip should take the app.
 *
 * A plain discriminated union rather than four separate callback props: it
 * keeps this component purely presentational (ruling — level navigation is
 * driven by props, never by a store reference of its own) while leaving the
 * actual dispatching (drillToShell/drillToSubshell/drillToOrbital, or
 * however "back to the whole atom" is implemented) entirely to the caller.
 */
export type NavigationTarget =
    | { level: 'atom' }
    | { level: 'shell'; n: number }
    | { level: 'subshell'; n: number; l: number }
    | { level: 'orbital'; n: number; l: number; ml: number };

interface LevelNavProps {
    Z: number;
    selectedShell: number | null;
    selectedSubshell: { n: number; l: number } | null;
    selectedOrbital: { n: number; l: number; ml: number } | null;
    onNavigate: (target: NavigationTarget) => void;
    /**
     * Opens an element picker. Given on a phone, where the periodic table
     * does not fit and the element is otherwise only reachable by opening
     * the controls sheet and scrolling it sideways; the element name then
     * becomes the button.
     */
    onChangeElement?: () => void;
    /**
     * The drill-down's next step (SubshellPanel) on a desktop. It belongs
     * with the navigation it continues; below the view controls it sat under
     * the fold, so the orbital buttons needed a scroll to find.
     */
    children?: React.ReactNode;
    /**
     * 'full' is the desktop card. A phone splits it: 'header' is the one line
     * that stays on screen -- Back, the element, and where you are -- and
     * 'body' is the rest, in the bottom sheet's Explore tab.
     */
    variant?: 'full' | 'header' | 'body';
}

// Old X-ray shell letters, matching atom_profile.ts's private shellName
// (not exported from there — this is a UI label, not a physics quantity, so
// it is simpler to keep its own tiny copy than to export an internal of the
// solver module just for this).
const PRINCIPAL_SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

function shellName(n: number): string {
    return `${PRINCIPAL_SHELL_LETTERS[n - 1] ?? `n=${n}`} shell (n=${n})`;
}

const METHOD_STATEMENT = 'central-field SCF, LDA exchange with VWN correlation, spherically averaged';

interface Crumb {
    key: string;
    label: string;
    target: NavigationTarget;
}

/**
 * Breadcrumb + shell picker + honest-framing note for the multi-electron
 * drill-down (whole atom -> shell -> subshell -> orbital).
 *
 * The shell picker below is built from `shellsFor(Z)` — the ground-state
 * configuration — and never from `shellPeaks`. Ruling R26: neighbouring
 * shells' D(r) genuinely merge into one resolved maximum well before the
 * shells themselves stop being distinct occupied levels (iron has 4 occupied
 * shells but only 3 resolved peaks), so a picker built from peaks would
 * quietly lose a real, selectable shell for every transition metal onward.
 */
const LevelNav: React.FC<LevelNavProps> = ({
    Z, selectedShell, selectedSubshell, selectedOrbital, onNavigate, onChangeElement, children,
    variant = 'full',
}) => {
    const [aboutOpen, setAboutOpen] = useState(false);

    const element = elementFor(Z);
    const elementName = element ? element.name : `Z=${Z}`;
    const shells = shellsFor(Z);
    // Addendum 2, "core versus valence". The outermost shell is where an
    // element's chemistry almost entirely lives; everything inside is inert
    // core. Showing the valence configuration on its own is what makes a
    // group visible as a group -- Li/Na/K all read ns¹, F/Cl both ns²np⁵,
    // Ne/Ar both ns²np⁶ -- without asserting any bonding model the app does
    // not compute (see valenceShellFor).
    const valenceN = valenceShellFor(Z);

    const crumbs: Crumb[] = [
        { key: 'atom', label: elementName, target: { level: 'atom' } },
    ];

    /**
     * One step out, and what it is called — the inverse of whichever
     * drill-down step got you here, so Back always undoes exactly the last
     * thing you did:
     *
     *   an orbital  → its subshell, still isolated
     *   an isolated subshell → the whole shell
     *   a shell     → the whole atom
     *
     * Every step is expressible with the existing navigation targets, so
     * this needs no reducer of its own: `drillToSubshell` clears the
     * orbital, `drillToShell` clears the subshell.
     *
     * Reported from the running app: on a phone the breadcrumb below is the
     * only way back, and its segments are small text links partly under the
     * sheet toggle. Worse, the panel that carries the mL buttons unmounts at
     * the orbital level, so the control you just used to get here disappears
     * behind you. This is the affordance that fixes that; the breadcrumb
     * stays for jumping more than one level at a time.
     */
    const parent: { label: string; target: NavigationTarget } | null =
        selectedOrbital
            ? {
                label: subshellLabel(selectedOrbital.n, selectedOrbital.l),
                target: { level: 'subshell', n: selectedOrbital.n, l: selectedOrbital.l },
            }
            : selectedSubshell
                ? { label: shellName(selectedSubshell.n), target: { level: 'shell', n: selectedSubshell.n } }
                : selectedShell !== null
                    ? { label: elementName, target: { level: 'atom' } }
                    : null;
    if (selectedShell !== null) {
        crumbs.push({ key: 'shell', label: shellName(selectedShell), target: { level: 'shell', n: selectedShell } });
    }
    if (selectedSubshell) {
        crumbs.push({
            key: 'subshell',
            label: subshellLabel(selectedSubshell.n, selectedSubshell.l),
            target: { level: 'subshell', n: selectedSubshell.n, l: selectedSubshell.l },
        });
    }
    if (selectedOrbital) {
        crumbs.push({
            key: 'orbital',
            label: orbitalName(selectedOrbital.n, selectedOrbital.l, selectedOrbital.ml),
            target: { level: 'orbital', ...selectedOrbital },
        });
    }

    if (variant === 'header') {
        // Where you are, past the element the button already names.
        const location = crumbs.slice(1).map(crumb => crumb.label).join(' · ');
        return (
            <Box className="level-nav level-nav-header" aria-label="level navigation">
                {parent && (
                    <Button
                        size="small"
                        className="level-nav-back"
                        onClick={() => onNavigate(parent.target)}
                        aria-label={`back to ${parent.label}`}
                    >
                        ←
                    </Button>
                )}
                {onChangeElement && (
                    <Button
                        size="small"
                        variant="outlined"
                        className="level-nav-change-element"
                        onClick={onChangeElement}
                        aria-label={`change element, currently ${elementName}`}
                    >
                        {element ? `${element.symbol} · ${element.name}` : elementName} ▾
                    </Button>
                )}
                {location && <span className="level-nav-location">{location}</span>}
            </Box>
        );
    }
    const isBody = variant === 'body';

    return (
        <Box className={`level-nav${isBody ? ' level-nav-body' : ''}`} aria-label="level navigation">
            {!isBody && parent && (
                <Button
                    size="small"
                    className="level-nav-back"
                    onClick={() => onNavigate(parent.target)}
                >
                    ← Back to {parent.label}
                </Button>
            )}
            {!isBody && onChangeElement && (
                <Button
                    size="small"
                    variant="outlined"
                    className="level-nav-change-element"
                    onClick={onChangeElement}
                    aria-label={`change element, currently ${elementName}`}
                >
                    {element ? `${element.symbol} · ${element.name}` : elementName} ▾
                </Button>
            )}
            {/* At the whole-atom level the breadcrumb is only the element's
                name, which the element button already shows. */}
            {(crumbs.length > 1 || (!onChangeElement && !isBody)) && (
            <Breadcrumbs aria-label="breadcrumb" className="level-nav-breadcrumbs">
                {crumbs.map(crumb => (
                    <Link
                        key={crumb.key}
                        component="button"
                        type="button"
                        underline="hover"
                        color="inherit"
                        onClick={() => onNavigate(crumb.target)}
                    >
                        {crumb.label}
                    </Link>
                ))}
            </Breadcrumbs>
            )}

            <Typography variant="body2" className="level-nav-configuration">
                {configurationLabel(Z)}
            </Typography>
            <Typography variant="body2" className="level-nav-valence">
                Valence: {valenceConfigurationLabel(Z)}
                {/* Hydrogen and helium have one shell and so no core at all. */}
                {shells.length > 1 && (
                    <span className="level-nav-valence-note"> · everything inside is core</span>
                )}
            </Typography>

            <Box className="level-nav-shells" role="group" aria-label="shells">
                {shells.map(shell => {
                    const isSelected = selectedShell === shell.n;
                    const isValence = shell.n === valenceN;
                    return (
                        <Chip
                            key={shell.n}
                            className={`level-nav-shell-chip${isSelected ? ' selected' : ''}${isValence ? ' valence' : ' core'}`}
                            label={`${shellName(shell.n)}${isValence ? ' · valence' : ''}`}
                            color={isSelected ? 'primary' : 'default'}
                            // Addendum 2's "is there a way to unselect one?".
                            // Three ways now, because testing showed one
                            // buried in a breadcrumb was not enough: the ✕ on
                            // the selected chip, clicking that chip again,
                            // and the breadcrumb that was already there.
                            aria-pressed={isSelected}
                            onDelete={isSelected ? () => onNavigate({ level: 'atom' }) : undefined}
                            onClick={() => onNavigate(isSelected ? { level: 'atom' } : { level: 'shell', n: shell.n })}
                        />
                    );
                })}
            </Box>

            {/* Discoverability, not decoration: the rings are the obvious
                thing to click and were inert until now, so the view has to
                say that they are not. Phrased for the state you are in --
                once a shell is open, the useful next move is getting back
                out of it. */}
            <Typography variant="caption" className="level-nav-shell-hint" display="block">
                {selectedOrbital
                    // At the orbital level the shell chips are context, not
                    // the current subject -- saying "M shell only" here would
                    // describe a view you are no longer looking at.
                    ? `One orbital of ${subshellLabel(selectedOrbital.n, selectedOrbital.l)} — Back steps out one level at a time`
                    : selectedShell === null
                        ? 'Click a ring in the 3D view, or a shell above, to open it'
                        : `${shellName(selectedShell)} only — click it again, or the ✕, for the whole atom`}
            </Typography>

            {children}

            <Button
                size="small"
                className="level-nav-about-toggle"
                onClick={() => setAboutOpen(open => !open)}
                aria-expanded={aboutOpen}
            >
                About this model
            </Button>
            <Collapse in={aboutOpen}>
                {/* The one-line method statement lives here with the rest of
                    the model's framing rather than on the card face, which
                    it made tall enough to push the controls below it under
                    the fold. */}
                <Typography variant="caption" className="level-nav-method" display="block">
                    {METHOD_STATEMENT}
                </Typography>
                <Typography variant="body2" className="level-nav-about">
                    This is a central-field model: each electron moves in the
                    spherically averaged potential of the nucleus and every
                    other electron, and open shells are averaged over their
                    sublevels rather than resolved into individual
                    determinants. Exchange and correlation come from the
                    local density approximation (LDA) with the VWN
                    correlation functional. It is non-relativistic and
                    describes neutral, isolated atoms only — no ions, no
                    molecules, no spin-orbit coupling. The individual s/p/d/f
                    lobes you can select below are a basis choice, not
                    separate physical objects: a partially filled subshell's
                    electrons are smeared uniformly over all of it, not
                    sitting in one lobe rather than another.
                </Typography>
            </Collapse>
        </Box>
    );
};

export default LevelNav;
