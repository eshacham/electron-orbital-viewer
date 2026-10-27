import React, { useRef } from 'react';
import { Box, Breadcrumbs, Link, Chip, Typography, Button } from '@mui/material';
import { elementFor } from '../elements';
import {
    SubshellOccupancy, configurationFor, shellsOf, configurationLabelOf, subshellLabel, subshellSpokenLabel,
    valenceShellsOf, valenceConfigurationLabelOf,
} from '../atom/configurations';
import { methodStatement, type RelativityMode } from '../atom/relativity';
import { useRovingFocus } from '../shell/useRovingFocus';
import { OrbitalLabel } from '../format/OrbitalLabel';
import { orbitalPlainName } from '../format/sci';
import InfoButton from '../info/InfoButton';

/**
 * Where a breadcrumb segment or shell chip should take the app.
 *
 * A plain discriminated union rather than four separate callback props: it
 * keeps this component purely presentational (ruling — level navigation is
 * driven by props, never by a store reference of its own) while leaving the
 * actual dispatching (drillToShell/drillToSubshell/drillToOrbital, or
 * however "back to the whole atom" is implemented) entirely to the caller.
 *
 * With spin–orbit a subshell is one of its j-levels, and `j` says which; it
 * is absent otherwise, so a non-relativistic target is exactly what it was.
 */
export type NavigationTarget =
    | { level: 'atom' }
    | { level: 'shell'; n: number }
    | { level: 'subshell'; n: number; l: number; j?: number }
    | { level: 'orbital'; n: number; l: number; ml: number; j?: number };

interface LevelNavProps {
    Z: number;
    selectedShell: number | null;
    selectedSubshell: { n: number; l: number; j?: number } | null;
    selectedOrbital: { n: number; l: number; ml: number; j?: number } | null;
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
     *
     * The other three are the Explore panel's pieces (spec §9.1): `crumbs` is
     * the back step and the breadcrumb under the element tile;
     * `configuration` is the configuration, valence and shell chips, with
     * `children` (the subshell chips) after them; `about` is the method and
     * the About text, expanded -- Help quotes it; Task 6 moved it out of the
     * panels into Info (atomInfo), as it did the valence note and the hints.
     */
    variant?: 'full' | 'header' | 'body' | 'crumbs' | 'configuration' | 'about';
    /**
     * The species' own occupancies -- an ion's or an excited atom's --
     * rather than the neutral ground state's (Global Constraints: "shell
     * chips, configuration line and valence line come from the species
     * configuration, never from detected peaks"). Defaults to
     * `configurationFor(Z)` so every existing neutral-atom caller is
     * unaffected.
     */
    configuration?: SubshellOccupancy[];
    /** The element button's text when the species is not the neutral atom, e.g. 'Na⁺'. */
    speciesSymbol?: string;
    /** The breadcrumb root label for the species, e.g. 'Sodium ion Na⁺'. Defaults to the element's name. */
    speciesTitle?: string;
    /**
     * The Charge/Excite card (layout contract §3.8: directly under the
     * element button, left `.side-panel` on desktop, first block of the
     * phone Explore tab -- no floating panel of its own).
     */
    speciesControls?: React.ReactNode;
    /**
     * Nothing is drawn for this species -- an anion LDA does not bind (spec
     * §3.5), or an excited species whose promoted electron it does not
     * (ruling T7-b) -- so there is no shell to open. The configuration and valence
     * lines still name the species; the chips are shown disabled rather
     * than inviting a click that can do nothing.
     */
    shellsUnavailable?: boolean;
    /**
     * The mode the picture on screen was solved in (ruling C9: the drawn
     * profile's, not the switch's). Defaults to 'off', whose About text is
     * exactly what it always was.
     */
    relativity?: RelativityMode;
    /**
     * Ruling P18: the Relativity switch's own effective mode -- what is
     * being solved for, which during a re-solve (or with Help open while
     * one is in flight) can be ahead of `relativity`, the mode actually
     * drawn. Defaults to `relativity`, so every existing caller that only
     * ever had one mode to report keeps describing that one mode exactly
     * as before.
     */
    selectedRelativity?: RelativityMode;
    /**
     * Whether a picture is on screen at all (final review M6): with none --
     * an unbound verdict, a failed solve -- About says nothing about "this
     * picture", whichever mode the switch is in. Defaults to true.
     */
    pictureShown?: boolean;
}

// Old X-ray shell letters, matching atom_profile.ts's private shellName
// (not exported from there — this is a UI label, not a physics quantity, so
// it is simpler to keep its own tiny copy than to export an internal of the
// solver module just for this).
const PRINCIPAL_SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

/** "L shell (n=2)": the chips', breadcrumb's and hint's name for a shell (Info's hint says it too, Task 6). */
export function shellName(n: number): string {
    return `${PRINCIPAL_SHELL_LETTERS[n - 1] ?? `n=${n}`} shell (n=${n})`;
}

/**
 * The relativity clause of "About this model" -- the rest of the paragraph
 * (central-field averaging, LDA/VWN, ions and excitations, the
 * spin-restricted picture and its unbound anions, the basis-choice caveat)
 * does not depend on the mode, so only this one sentence changes with it.
 * Phase 3 widened the non-relativistic wording from "neutral … no ions" to
 * "isolated atoms and their ions"; all three variants keep that ions
 * wording and vary only the relativity statement.
 */
export function aboutRelativitySentence(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return 'It is non-relativistic and describes isolated atoms and their ions — no molecules, no spin-orbit coupling.';
        case 'scalar':
            return 'Relativity is included at the scalar-relativistic level (Koelling–Harmon: the mass-velocity and Darwin terms), '
                + 'which captures how heavy atoms’ s and p shells contract, but not spin–orbit splitting. '
                + 'It describes isolated atoms and their ions — no molecules.';
        case 'spinOrbit':
            return 'Relativity is included in full through the radial Dirac equation, so each subshell with l > 0 splits into '
                + 'j = l ± ½ levels, occupied in proportion to 2j + 1 so the atom stays spherical. '
                + 'It describes isolated atoms and their ions — no molecules.';
    }
}

/**
 * Ruling C6: the ionisation and excitation energies are ΔSCF differences
 * from a non-relativistic spin-polarised LDA in every mode (spin-polarised
 * MacDonald–Vosko exchange is out of scope, and ΔSCF is validated only
 * through argon). With a relativistic picture that has to be said, or a
 * heavy atom's energies read as carrying the relativistic shifts its picture
 * shows. Empty for 'off', which leaves the paragraph as it always was.
 */
export function relativisticEnergiesSentence(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return '';
        case 'scalar':
            return ' This picture is scalar-relativistic; the ΔSCF energies are not — they stay non-relativistic, '
                + 'so for a heavy atom they leave out the relativistic shifts the picture shows.';
        case 'spinOrbit':
            return ' This picture includes spin–orbit coupling (Dirac equation); the ΔSCF energies do not — they stay '
                + 'non-relativistic, so for a heavy atom they leave out the relativistic shifts the picture shows.';
    }
}

const PICTURE_WORDS: Record<RelativityMode, string> = {
    off: 'non-relativistic',
    scalar: 'scalar-relativistic',
    spinOrbit: 'the Dirac (spin–orbit) one',
};
const SELECTED_WORDS: Record<RelativityMode, string> = {
    off: 'the non-relativistic one',
    scalar: 'the scalar-relativistic one',
    spinOrbit: 'the one with spin–orbit',
};

/**
 * Ruling P18: when the Relativity switch (`selected`) has moved ahead of
 * what is actually drawn (`picture`) -- a re-solve in flight, most often --
 * About says so explicitly, rather than quietly describing the switch's
 * method as if it were already on screen. Null when the two agree, which
 * is the ordinary case and leaves the paragraph exactly as it was.
 */
export function aboutPictureSentence(selected: RelativityMode, picture: RelativityMode): string | null {
    if (selected === picture) return null;
    return `The picture on screen is still ${PICTURE_WORDS[picture]}; ${SELECTED_WORDS[selected]} is being solved.`;
}

/**
 * "About this model" as one paragraph of text (Task 6): Info's "How this was computed" (atomInfo) and Help's About
 * (variant 'about') both say it from here, word for word. The relativity clause follows the switch (`selected`, ruling
 * P18), the ΔSCF sentence the drawn picture (`picture`, ruling T2-picturesentence); with no picture, neither speaks of
 * "this picture" (final review M6).
 */
export function aboutModelText(selected: RelativityMode, picture: RelativityMode, pictureShown: boolean): string {
    const pictureSentence = pictureShown ? aboutPictureSentence(selected, picture) : null;
    return 'This is a central-field model: each electron moves in the spherically averaged potential of the nucleus and '
        + 'every other electron, and open shells are averaged over their sublevels rather than resolved into individual '
        + 'determinants. Exchange and correlation come from the local density approximation (LDA) with the VWN '
        + `correlation functional. ${aboutRelativitySentence(selected)}`
        + (pictureSentence ? ` ${pictureSentence}` : '')
        + ' An ion or an excited atom uses the same model with its own electron count or one electron moved; ionisation '
        + 'and excitation energies are ΔSCF differences of total energies from the spin-polarised form of the same LDA, '
        + 'never orbital eigenvalues. The picture on screen is drawn from a simpler, spin-restricted form of that LDA, '
        // Task 6: "for their" -- the JSX this replaces dropped the space ("fortheir") at a comment between the lines.
        + 'and in it most anions — Cl⁻ included — have no bound state for their extra electron at all.'
        + (pictureShown ? relativisticEnergiesSentence(picture) : '')
        + ' The individual s/p/d/f lobes you can select below are a basis choice, not separate physical objects: a '
        + 'partially filled subshell\'s electrons are smeared uniformly over all of it, not sitting in one lobe rather '
        + 'than another.';
}

interface Crumb {
    key: string;
    /** The visible name as flat text (the phone header joins these). */
    label: string;
    /** Task 6: what is drawn for it when that is more than text -- an orbital's name with a real subscript. */
    node?: React.ReactNode;
    /**
     * What a screen reader should say instead, when that differs: "6p³⁄₂"
     * is read as superscripts and a fraction slash, so a j-level crumb says
     * "6p j = 3/2". Absent everywhere else, which leaves the visible text as
     * the name, as it always was.
     */
    spoken?: string;
    target: NavigationTarget;
}

/** "6p j = 3/2" for a j-level; undefined when the visible label already reads aloud correctly. */
function spokenSubshell(n: number, l: number, j: number | undefined): string | undefined {
    return j === undefined ? undefined : subshellSpokenLabel(n, l, j);
}

/** A subshell target with j only when there is one, so a non-relativistic target keeps its old shape. */
function subshellTarget(n: number, l: number, j: number | undefined): NavigationTarget {
    return j === undefined ? { level: 'subshell', n, l } : { level: 'subshell', n, l, j };
}

/**
 * Breadcrumb + shell picker + honest-framing note for the multi-electron
 * drill-down (whole atom -> shell -> subshell -> orbital).
 *
 * The shell picker below is built from the species configuration --
 * `shellsOf(configuration ?? configurationFor(Z))`, an ion's or an excited
 * atom's own occupancies when one is given, the neutral ground state's
 * otherwise -- and never from `shellPeaks`. Ruling R26: neighbouring
 * shells' D(r) genuinely merge into one resolved maximum well before the
 * shells themselves stop being distinct occupied levels (iron has 4 occupied
 * shells but only 3 resolved peaks), so a picker built from peaks would
 * quietly lose a real, selectable shell for every transition metal onward.
 */
const LevelNav: React.FC<LevelNavProps> = ({
    Z, selectedShell, selectedSubshell, selectedOrbital, onNavigate, onChangeElement, children,
    variant = 'full', configuration, speciesSymbol, speciesTitle, speciesControls, shellsUnavailable = false,
    relativity = 'off',
    selectedRelativity,
    pictureShown = true,
}) => {
    // P18: what the switch is solving for. Ordinarily the same mode as
    // `relativity` (the picture actually drawn) -- it only differs mid re-solve.
    const effectiveSelectedRelativity = selectedRelativity ?? relativity;
    // §13: the shells are one Tab stop with the arrow keys inside. Here, before
    // any early return, so the hook order never changes.
    const shellsRef = useRef<HTMLDivElement>(null);
    useRovingFocus(shellsRef, { selector: '.level-nav-shell-chip', orientation: 'horizontal' });

    const element = elementFor(Z);
    const elementName = element ? element.name : `Z=${Z}`;
    // M10: the element button's accessible name names the species, not just
    // the element -- "change element, currently Na⁺ · Sodium" rather than
    // a plain "currently Sodium" that drops the very thing distinguishing
    // this view from the neutral atom's.
    const changeElementLabel = `change element, currently ${speciesSymbol ? `${speciesSymbol} · ${elementName}` : elementName}`;
    // Everything below is built from the species' own occupancies, not the
    // neutral ground state's (Global Constraints, Review Focus 5): Na⁺ has
    // no M shell, Na(3s→4s) has no n=3 shell, and both must say so.
    const speciesConfiguration = configuration ?? configurationFor(Z);
    const rootLabel = speciesTitle ?? elementName;
    const shells = shellsOf(speciesConfiguration);
    // Addendum 2, "core versus valence". The outermost shell is where an
    // element's chemistry almost entirely lives; everything inside is inert
    // core. Showing the valence configuration on its own is what makes a
    // group visible as a group -- Li/Na/K all read ns¹, F/Cl both ns²np⁵,
    // Ne/Ar both ns²np⁶ -- without asserting any bonding model the app does
    // not compute. Ruling P14 extends this: a transition metal's or
    // lanthanide/actinide's partly filled (n-1)d or (n-2)f is just as live
    // chemically, so it counts as valence too (see valenceShellsOf).
    const valenceShells = valenceShellsOf(speciesConfiguration);

    const crumbs: Crumb[] = [
        { key: 'atom', label: rootLabel, target: { level: 'atom' } },
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
    const parent: { label: string; spoken?: string; target: NavigationTarget } | null =
        selectedOrbital
            ? {
                label: subshellLabel(selectedOrbital.n, selectedOrbital.l, selectedOrbital.j),
                spoken: spokenSubshell(selectedOrbital.n, selectedOrbital.l, selectedOrbital.j),
                target: subshellTarget(selectedOrbital.n, selectedOrbital.l, selectedOrbital.j),
            }
            : selectedSubshell
                ? { label: shellName(selectedSubshell.n), target: { level: 'shell', n: selectedSubshell.n } }
                : selectedShell !== null
                    ? { label: rootLabel, target: { level: 'atom' } }
                    : null;
    if (selectedShell !== null) {
        crumbs.push({ key: 'shell', label: shellName(selectedShell), target: { level: 'shell', n: selectedShell } });
    }
    if (selectedSubshell) {
        crumbs.push({
            key: 'subshell',
            label: subshellLabel(selectedSubshell.n, selectedSubshell.l, selectedSubshell.j),
            spoken: spokenSubshell(selectedSubshell.n, selectedSubshell.l, selectedSubshell.j),
            target: subshellTarget(selectedSubshell.n, selectedSubshell.l, selectedSubshell.j),
        });
    }
    if (selectedOrbital) {
        const { n, l, ml, j } = selectedOrbital;
        // A j-level's orbital is the real l orbital drawn with that j-level's
        // R(r) (spec §3.6), so both halves of its name matter: 6px · 6p½.
        // Task 6: drawn with a real subscript, spoken flat ("6px"), never "6p_x".
        const name = orbitalPlainName(n, l, ml);
        crumbs.push({
            key: 'orbital',
            label: j === undefined ? name : `${name} · ${subshellLabel(n, l, j)}`,
            node: <><OrbitalLabel n={n} l={l} ml={ml} />{j === undefined ? '' : ` · ${subshellLabel(n, l, j)}`}</>,
            spoken: j === undefined ? undefined : `${name} of ${subshellSpokenLabel(n, l, j)}`,
            target: { level: 'orbital', ...selectedOrbital },
        });
    }

    if (variant === 'header') {
        // Where you are, past the element the button already names.
        const located = crumbs.slice(1);
        const spokenLocation = located.map(crumb => crumb.spoken ?? crumb.label).join(' · ');
        const location = located.map((crumb, i) => (
            <React.Fragment key={crumb.key}>{i > 0 && ' · '}{crumb.node ?? crumb.label}</React.Fragment>
        ));
        return (
            <Box className="level-nav level-nav-header" aria-label="level navigation">
                {parent && (
                    <Button
                        size="small"
                        className="level-nav-back"
                        onClick={() => onNavigate(parent.target)}
                        aria-label={`back to ${parent.spoken ?? parent.label}`}
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
                        aria-label={changeElementLabel}
                    >
                        {element ? `${speciesSymbol ?? element.symbol} · ${element.name}` : elementName} ▾
                    </Button>
                )}
                {located.length > 0 && (
                    <span className="level-nav-location">
                        {located.every(crumb => crumb.spoken === undefined) ? location : (
                            // Plain text has no accessible name to set, so a
                            // j-level's spoken form rides along, hidden from
                            // sight, with the visible one hidden from readers.
                            <>
                                <span aria-hidden="true">{location}</span>
                                <span className="visually-hidden">{spokenLocation}</span>
                            </>
                        )}
                    </span>
                )}
            </Box>
        );
    }
    // The pieces the variants share, built once: spec §9.1 splits the card
    // across the Explore panel, and every variant renders the same markup.
    const backButton = parent && (
        <Button
            size="small"
            className="level-nav-back"
            onClick={() => onNavigate(parent.target)}
            aria-label={parent.spoken === undefined ? undefined : `Back to ${parent.spoken}`}
        >
            ← Back to {parent.label}
        </Button>
    );
    const breadcrumbs = (
        <Breadcrumbs aria-label="breadcrumb" className="level-nav-breadcrumbs">
            {crumbs.map(crumb => (
                <Link
                    key={crumb.key}
                    component="button"
                    type="button"
                    underline="hover"
                    color="inherit"
                    aria-label={crumb.spoken}
                    onClick={() => onNavigate(crumb.target)}
                >
                    {crumb.node ?? crumb.label}
                </Link>
            ))}
        </Breadcrumbs>
    );
    const configurationLines = (
        <>
            <Typography variant="body2" className="level-nav-configuration">
                {configurationLabelOf(speciesConfiguration)}
            </Typography>
            {/* Task 6: the valence line keeps its short labelled value; what counts as valence and that everything
                inside is core (ruling P14's note) are said in Info (atomInfo), with the hint on what to click. */}
            <Typography variant="body2" className="level-nav-valence">
                Valence: {valenceConfigurationLabelOf(speciesConfiguration)}
            </Typography>

            <div className="info-beside-row">
                <Box ref={shellsRef} className="level-nav-shells" role="group" aria-label="shells">
                    {shells.map(shell => {
                        const isSelected = selectedShell === shell.n;
                        const isValence = valenceShells.has(shell.n);
                        return (
                            <Chip
                                key={shell.n}
                                className={`level-nav-shell-chip${isSelected ? ' selected' : ''}${isValence ? ' valence' : ' core'}`}
                                label={`${shellName(shell.n)}${isValence ? ' · valence' : ''}`}
                                color={isSelected ? 'primary' : 'default'}
                                disabled={shellsUnavailable}
                                // Addendum 2's "is there a way to unselect one?".
                                // Three ways now, because testing showed one
                                // buried in a breadcrumb was not enough: the ✕ on
                                // the selected chip, clicking that chip again,
                                // and the breadcrumb that was already there.
                                aria-pressed={isSelected}
                                onDelete={isSelected ? () => onNavigate({ level: 'atom' }) : undefined}
                                // Still a (disabled) button while unavailable, so it is
                                // announced as one; the guard is what actually refuses
                                // the click, since a disabled Chip only stops pointers.
                                onClick={() => {
                                    if (shellsUnavailable) return;
                                    onNavigate(isSelected ? { level: 'atom' } : { level: 'shell', n: shell.n });
                                }}
                            />
                        );
                    })}
                </Box>
                {/* Task 6: an (i) beside the shells explains the term in Info. */}
                <InfoButton topic="shell" label="Shell" />
            </div>
        </>
    );
    // Help's About (variant 'about'): the method line and the paragraph, both as Info says them (aboutModelText).
    const aboutText = (
        <>
            <Typography variant="caption" className="level-nav-method" display="block">
                {methodStatement(effectiveSelectedRelativity)}
            </Typography>
            <Typography variant="body2" className="level-nav-about">
                {aboutModelText(effectiveSelectedRelativity, relativity, pictureShown)}
            </Typography>
        </>
    );

    if (variant === 'crumbs') {
        // At the whole atom the breadcrumb would be only the root, which the
        // element tile above already names (controller ruling T10-crumb).
        if (crumbs.length <= 1 && !backButton) return null;
        return (
            <Box className="level-nav level-nav-crumbs" aria-label="level navigation">
                {backButton}{crumbs.length > 1 && breadcrumbs}
            </Box>
        );
    }
    if (variant === 'configuration') {
        return <Box className="level-nav level-nav-configuration-part">{configurationLines}{children}</Box>;
    }
    if (variant === 'about') {
        return <Box className="level-nav level-nav-about-part">{aboutText}</Box>;
    }

    const isBody = variant === 'body';

    return (
        <Box className={`level-nav${isBody ? ' level-nav-body' : ''}`} aria-label="level navigation">
            {/* Ruling C13: the Charge/Excite card sits directly under the
                element button on a desktop, and as the first thing in a
                phone's Explore tab -- never a floating panel of its own. */}
            {isBody && speciesControls}
            {!isBody && backButton}
            {!isBody && onChangeElement && (
                <Button
                    size="small"
                    variant="outlined"
                    className="level-nav-change-element"
                    onClick={onChangeElement}
                    aria-label={changeElementLabel}
                >
                    {element ? `${speciesSymbol ?? element.symbol} · ${element.name}` : elementName} ▾
                </Button>
            )}
            {!isBody && speciesControls}
            {/* At the whole-atom level the breadcrumb is only the element's
                name, which the element button already shows. */}
            {(crumbs.length > 1 || (!onChangeElement && !isBody)) && breadcrumbs}

            {configurationLines}

            {children}
            {/* Task 6: "About this model" is Info's now ("How this was computed", atomInfo). */}
        </Box>
    );
};

export default LevelNav;
