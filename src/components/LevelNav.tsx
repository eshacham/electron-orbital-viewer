import React, { useState } from 'react';
import { Box, Breadcrumbs, Link, Chip, Typography, Collapse, Button } from '@mui/material';
import { elementFor } from '../elements';
import { shellsFor, configurationLabel, subshellLabel } from '../atom/configurations';
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
const LevelNav: React.FC<LevelNavProps> = ({ Z, selectedShell, selectedSubshell, selectedOrbital, onNavigate }) => {
    const [aboutOpen, setAboutOpen] = useState(false);

    const element = elementFor(Z);
    const elementName = element ? element.name : `Z=${Z}`;
    const shells = shellsFor(Z);

    const crumbs: Crumb[] = [
        { key: 'atom', label: elementName, target: { level: 'atom' } },
    ];
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

    return (
        <Box className="level-nav" aria-label="level navigation">
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

            <Typography variant="body2" className="level-nav-configuration">
                {configurationLabel(Z)}
            </Typography>
            <Typography variant="caption" className="level-nav-method" display="block">
                {METHOD_STATEMENT}
            </Typography>

            <Box className="level-nav-shells" role="group" aria-label="shells">
                {shells.map(shell => (
                    <Chip
                        key={shell.n}
                        className="level-nav-shell-chip"
                        label={shellName(shell.n)}
                        color={selectedShell === shell.n ? 'primary' : 'default'}
                        onClick={() => onNavigate({ level: 'shell', n: shell.n })}
                    />
                ))}
            </Box>

            <Button
                size="small"
                className="level-nav-about-toggle"
                onClick={() => setAboutOpen(open => !open)}
                aria-expanded={aboutOpen}
            >
                About this model
            </Button>
            <Collapse in={aboutOpen}>
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
