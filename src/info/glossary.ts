/**
 * What each (i) explains (plan Task 4), written once per band: `plain` for Basics and Explore, `technical` added at
 * Advanced, `full` added at Research (method and caveats). Each band reads on from the one before it, so a reader at
 * Research gets all three in order. The words follow the app's own captions -- its methods, conventions and limits
 * (relativity.ts, captions.ts, esp_color.ts, orbital_display.ts, delta_scf.ts) -- and its typography: Unicode
 * subscripts, a true minus (U+2212), units on every value.
 */
import type { InfoTopicId } from './info_types';

/**
 * Owner R26-3: one mark a figure shows and what it means, read with the plain band at every level -- the MO diagram's
 * notation. `mark` and `text` are typeset as names are (σg → σ<sub>g</sub>, withSubscripts); `spoken` is what a reader
 * hears for a mark that is a symbol, not a word (an arrow, a line).
 */
export interface GlossaryMark {
    mark: string;
    spoken?: string;
    text: string;
}

export interface GlossaryEntry {
    title: string;
    plain: string;
    /** Owner R26-3: a compact list after the plain text, one line per mark, at every level. */
    marks?: GlossaryMark[];
    technical: string;
    full?: string;
}

export const glossary: Record<InfoTopicId, GlossaryEntry> = {
    shell: {
        title: 'Shell',
        plain: 'A shell is a set of orbitals at about the same distance from the nucleus. Shells are numbered n = 1, 2, 3 … from the nucleus outwards, and also lettered K, L, M and so on.',
        technical: 'All orbitals with the same principal quantum number n form a shell, which holds at most 2n² electrons. '
            + 'In hydrogen every orbital of a shell has the same energy; in a many-electron atom its subshells separate. '
            + 'In the atom\'s radial distribution D(r) the shells show as peaks, clearest for the inner ones.',
    },
    subshell: {
        title: 'Subshell',
        plain: 'A subshell groups the orbitals of a shell of one kind, named s, p, d or f. It holds up to 2, 6, 10 or 14 electrons.',
        technical: 'The orbitals of a shell with the same angular momentum quantum number l (0, 1, 2, 3 for s, p, d, f) form a subshell '
            + 'of 2l + 1 orbitals and up to 2(2l + 1) electrons, named by n and the letter, as in 2p or 3d. '
            + 'With spin–orbit coupling a subshell with l > 0 splits into two levels, j = l − ½ and j = l + ½.',
        full: 'In Atoms the model is a central field: a partly filled subshell\'s electrons are spread evenly over all its orbitals, '
            + 'so the subshell is the physical object, and its separate p, d or f orbitals are a choice of basis.',
    },
    orbital: {
        title: 'Orbital',
        plain: 'An orbital is one allowed wave pattern for an electron, drawn as the cloud where that electron is likely to be found. Each orbital holds at most two electrons, of opposite spin.',
        technical: 'An orbital is a one-electron wave function ψ, labelled in an atom by n, l and mₗ; |ψ|² is the probability density. '
            + 'The app draws real orbitals, named by their axes (as in 2pₓ), which are combinations of the complex functions with +mₗ and −mₗ.',
        full: 'In Orbitals each is an exact solution for hydrogen (Z = 1), or a mixture of them (the hybrids); the field view is first-order perturbation theory, an approximation (1s polarised by the field, or the n = 2 Stark states). In Atoms it is a central-field (LDA) solution, with one radial '
            + 'function for every mₗ of a subshell. In Bonds and Molecules the orbitals are Kohn–Sham orbitals, except H₂⁺\'s, which are exact.',
    },
    enclosed: {
        title: 'Enclosed fraction',
        plain: 'A cloud has no edge, so the app draws a surface that holds a chosen share of the electron, 90 % unless you change it. A larger share draws a larger surface.',
        technical: 'The surface is a contour of constant |ψ|² (or of the density ρ), its value found for each orbital so that the region inside '
            + 'holds the chosen fraction: 50, 75, 90, 95 or 99 %. For orbitals a fixed |ψ|² value would not compare them fairly; an enclosed fraction does.',
        full: 'Two surfaces are drawn at a fixed density instead: the Bonds total density, at the ρ you choose (0.002 e/a₀³, the conventional molecular outline, by default), '
            + 'and the electrostatic potential map, on ρ = 0.001 e/a₀³.',
    },
    node: {
        title: 'Node',
        plain: 'A node is a surface where the wave function is zero, so the chance of finding the electron there is zero. Across a node the wave function changes sign, and the colours swap.',
        technical: 'An orbital with quantum numbers n and l has n − l − 1 radial nodes (spheres) and l angular nodes (planes or cones), n − 1 in all. '
            + 'For the same l, more nodes mean a higher energy.',
        full: 'Molecular orbitals have nodal surfaces too: an antibonding orbital, marked * in Bonds\' homonuclear molecules, has one between the nuclei, '
            + 'which is why its electrons weaken the bond.',
    },
    phase: {
        title: 'Phase',
        plain: 'The two colours show the sign of the wave function: orange where it is positive, blue where it is negative. The sign itself cannot be measured; what matters is where it changes.',
        technical: 'The orbitals drawn here are real, so every lobe has ψ > 0 or ψ < 0, with a node between lobes of opposite sign. '
            + 'Multiplying ψ by −1 changes nothing observable, so only relative signs matter. '
            + 'Where two orbitals overlap with the same sign they add (bonding); with opposite signs they cancel (antibonding).',
        full: 'The overall sign of a computed orbital is arbitrary, set by the program that produced it: another run can return the same orbital with its colours exchanged.',
    },
    density: {
        title: 'Electron density',
        plain: 'Electron density says how much electron there is at each point: high where electrons are likely to be, low where they are not. It shows the whole atom or molecule, without the signs of single orbitals.',
        technical: 'ρ(r) is the number of electrons per unit volume, in e/a₀³: the sum of |ψ|² over the occupied orbitals, each weighted by how many electrons it holds. '
            + 'It is positive everywhere and integrates to the number of electrons. '
            + 'Unlike ψ, it can be measured, for example by X-ray diffraction.',
        full: 'In Atoms it is the spherically averaged density of the central-field calculation; in Bonds and Molecules it is the Kohn–Sham density '
            + 'of the calculation named under "How this was computed" (H₂⁺\'s is exact).',
    },
    esp: {
        title: 'Electrostatic potential',
        plain: 'The map colours the surface by how a small positive charge would be pulled or pushed there: red where it is pulled (electron-rich), blue where it is pushed (electron-poor). It shows where other molecules and ions are likely to approach.',
        technical: 'V(r) is the electrostatic potential of all the nuclei and electrons, in Ha/e. '
            + 'The app maps it onto the surface ρ = 0.001 e/a₀³ on a fixed scale of ±0.05 Ha/e (about ±31 kcal/mol), so molecules can be compared; '
            + 'values beyond the scale saturate.',
        full: 'V is computed from the same Kohn–Sham density as the other surfaces. The colours depend on the surface they are drawn on, '
            + 'so compare maps on the same ρ = 0.001 e/a₀³ surface, a common convention that roughly follows a molecule\'s van der Waals size.',
    },
    homoLumo: {
        title: 'HOMO and LUMO',
        plain: 'The HOMO is the highest orbital that holds electrons; the LUMO is the lowest empty one. Chemists use them to reason about which electrons a molecule gives up or accepts most easily.',
        technical: 'Highest occupied and lowest unoccupied molecular orbital; in an open-shell molecule the singly occupied ones are SOMOs. '
            + 'The HOMO–LUMO gap here is the difference of their Kohn–Sham orbital energies: neither the optical gap (absorption) nor the fundamental gap (IP − EA).',
        full: 'Read the gap as a comparison between molecules computed the same way, not as a prediction of either measured gap.',
    },
    // Owner R26-2: this entry also opens beside an atom's orbital energies (Atoms' Orbitals tab), so it speaks of atoms
    // too: Atoms solves the same Kohn–Sham equations with LDA, spin-restricted and spherically averaged (scf.ts).
    kohnSham: {
        title: 'Kohn–Sham orbitals',
        plain: 'Atoms, Bonds and Molecules compute their orbitals with density functional theory, a standard way to compute atoms and molecules (H₂⁺\'s alone are exact). Their shapes are the familiar orbital picture; their energies are not the energy needed to remove an electron.',
        technical: 'Kohn–Sham DFT replaces the interacting electrons by non-interacting ones in an effective potential chosen to give the same density ρ. '
            + 'The orbitals and their energies ε belong to that model system; the density and the total energy are the physical results. '
            + 'With the exact functional −ε of the highest occupied orbital would equal the first ionisation energy; approximate functionals such as LDA (Atoms) and B3LYP do not achieve this, so the app never reports ε as an ionisation energy.',
        full: 'For an open-shell molecule the calculation is unrestricted: α and β electrons have their own orbitals and energies, and Bonds draws its levels at the α energies. '
            + 'An atom\'s is spin-restricted and spherically averaged, so each subshell has one energy.',
    },
    // Owner R26-2: the Atoms Orbitals tab's diagram and table (SubshellPanel's energy diagram, OrbitalEnergyList), true
    // to what they draw: one rule per occupied subshell of the drawn profile (per j-level with spin–orbit), placed by
    // log₁₀ |E| between the least bound (top) and the most bound (bottom); the open shell's rules thick, coloured, named.
    energyLevels: {
        title: 'Orbital energies',
        plain: 'Each line is one subshell\'s orbital energy; a lower line means its electrons are held more tightly. '
            + 'The inner (core) subshells lie far below the outer (valence) ones, so the diagram uses a log scale to fit both.',
        technical: 'These are the Kohn–Sham eigenvalues ε of the atom\'s LDA calculation, not ionisation energies: Info\'s ionisation energy is computed separately, by ΔSCF. '
            + 'A line\'s height follows log |E|, so each factor of ten in |E| takes the same height; the subshells of the shell you pick are drawn in their colours and named. '
            + 'LDA\'s outermost eigenvalue falls short of the ionisation energy by tens of percent, even for light atoms.',
        full: 'With Relativity set to With spin–orbit, each subshell with l > 0 is drawn as two lines, its j = l − ½ and j = l + ½ levels (as 6p½ and 6p³⁄₂); '
            + 'Scalar shifts the lines without splitting them. The lines are those of the picture on screen, computed with its relativity.',
    },
    relativity: {
        title: 'Relativity',
        plain: 'In heavy atoms the inner electrons move fast enough that relativity matters: some shells pull in, others spread out. The app can include it or leave it out.',
        technical: 'Off solves the Schrödinger equation; Scalar adds the mass-velocity and Darwin terms (Koelling–Harmon, no spin–orbit); '
            + 'With spin–orbit solves the radial Dirac equation, splitting each subshell with l > 0 into j = l ± ½ levels. '
            + 'Scalar is the default from caesium (Z = 55) on, where leaving relativity out changes the results by more than a few percent. '
            + 'Relativity contracts the s and p₁/₂ shells (p₃/₂ much less); the d and f shells, screened more strongly by them, expand.',
        full: 'The relativistic settings also apply the MacDonald–Vosko correction to LDA exchange, as NIST\'s relativistic reference tables do. '
            + 'The ΔSCF ionisation and excitation energies stay non-relativistic, so for a heavy atom they leave out the shifts the picture shows.',
    },
    ionisation: {
        title: 'Ionisation energy',
        plain: 'The ionisation energy is the energy needed to pull one electron off an atom. It is small for metals such as sodium and large for noble gases such as neon.',
        technical: 'The app computes it by ΔSCF: the total energy with one electron removed minus the total energy before, both from spin-polarised LDA, never from an orbital energy. '
            + 'It is given in eV and, for a neutral atom, beside NIST\'s measured value, with the signed difference.',
        full: 'Open shells are spherically averaged; expect larger errors for d- and f-block elements, above all where ionisation changes the d or f occupancy.',
    },
    bondOrder: {
        title: 'Bond order',
        plain: 'Bond order counts how many bonds hold two atoms together: 1 for a single bond, 2 for a double, 3 for a triple. Zero means no bond.',
        technical: 'Bond order = (bonding electrons − antibonding electrons) / 2, counted over the occupied molecular orbitals; antibonding ones are marked *. '
            + 'Half values occur, as in H₂⁺ (½). '
            + 'In a heteronuclear molecule such as CO or HF the g/u labels do not apply, so it is counted from the valence orbitals\' bonding or antibonding character.',
        full: 'It is a counting rule of the molecular-orbital picture, not a measured quantity.',
    },
    potentialCurve: {
        title: 'Potential energy curve',
        plain: 'The curve shows the molecule\'s energy as its two atoms are moved closer together or further apart. Its lowest point is the bond length the molecule settles at, and its depth is how strongly the atoms are bound.',
        technical: 'E(R) is the energy with the nuclei held fixed (Born–Oppenheimer) as a function of the internuclear distance R, plotted in eV relative to the separated atoms. '
            + 'Its minimum is at the equilibrium length Rₑ; the well depth Dₑ is the energy needed to separate the atoms from there, without zero-point energy.',
        full: 'Energies are coupled cluster, CCSD(T) with the aug-cc-pVTZ basis (full CI for H₂ and He₂), at precomputed bond lengths; H₂⁺ is solved exactly here. '
            + 'A curve stops where single-reference CCSD(T) is no longer valid, as the bond breaks into open-shell atoms.',
    },
    // Owner R26-3: every mark MoDiagram draws, checked against N₂, CO, H₂⁺, He₂ and O₂ -- one box (line) per orbital,
    // a degenerate pair side by side under one label; ↑ from occupation ≥ 1 (an unrestricted α orbital), ↓ from 2 (its β
    // partner); g/u and * only in homonuclear labels (CO: 1σ … 6σ, 1π, 2π); the core band only where a gap over 1 Ha
    // under the occupied levels splits it off (N₂, O₂, CO; not H₂⁺, whose one electron makes nothing core, H₂ or He₂);
    // science corrections (rulings M2, N1): the band of higher empty levels only where empty levels lie above the lowest
    // wholly empty one (N₂, CO, B₂, C₂ at Rₑ; not O₂, F₂, HF, H₂, He₂ or H₂⁺). A level is drawn with both spins, so a
    // half-filled one (O₂'s 1πg*, B₂'s 1πu) is drawn filled: O₂'s lowest wholly empty level is 3σu*.
    moDiagram: {
        title: 'MO diagram',
        plain: 'The diagram shows the molecule\'s orbitals by energy, the lowest at the bottom, and its marks read as follows.',
        marks: [
            { mark: '―', spoken: 'A line', text: 'One orbital; with no arrows it is empty.' },
            { mark: '↑↓', spoken: 'Up and down arrows', text: 'Two electrons, with opposite spins.' },
            { mark: '↑', spoken: 'An up arrow', text: 'One electron on its own (H₂⁺, O₂).' },
            { mark: 'σ, π', text: 'Shape round the bond axis: σ is the same all round; π has a nodal plane along it and comes in pairs.' },
            { mark: 'g, u', text: 'Sign kept (g, gerade) or flipped (u, ungerade) through the centre; none in CO and HF, whose atoms differ.' },
            { mark: '*', text: 'Antibonding: its electrons weaken the bond. Marked only where g and u are.' },
            { mark: '1, 2, 3', text: 'Counts the orbitals of one kind from the lowest: 1σg, 2σg, 3σg.' },
            { mark: '≈ core', text: 'The inner orbitals, far lower in energy, drawn below a break, not to scale.' },
            { mark: '≈ higher empty levels', text: 'Empty levels above the lowest wholly empty one, above a break by energy, not to scale. A half-filled level (O₂) counts as filled.' },
        ],
        technical: 'Each level is a molecular orbital labelled by its symmetry (σ or π, g or u), placed at its orbital energy ε, in eV with Ha beside it; '
            + 'the levels holding electrons and the lowest wholly empty one share one scale for every system, read off the eV axis (a system too tall for the panel is drawn smaller, and its axis says so), '
            + 'and two levels closer than a box sit side by side at their true heights. The core levels, far lower, sit in a band under a break, and the higher empty levels in a band over a second break, each marked on the axis and not to scale; '
            + 'for every system but H₂⁺ the energies are Kohn–Sham eigenvalues, and for H₂⁺ they are the exact electronic energies.',
        full: 'In an open-shell molecule the α and β orbitals differ, and the levels are drawn at the α energies.',
    },
    pointGroup: {
        title: 'Point group',
        plain: 'The point group names a molecule\'s symmetry: the rotations and reflections that leave it looking the same. Water\'s is C₂ᵥ, ammonia\'s is C₃ᵥ.',
        technical: 'It is written in Schoenflies notation; a linear molecule is C∞v or D∞h. '
            + 'Its irreducible representations label the molecular orbitals, as in a₁ or b₁ for water, and only orbitals of the same symmetry can mix.',
    },
    dipole: {
        title: 'Dipole moment',
        plain: 'A dipole moment measures how unevenly a molecule\'s charge is shared, one end slightly negative and the other slightly positive. Molecules whose symmetry cancels it, such as CO₂ or methane, have none; water\'s bent shape leaves it one.',
        technical: 'μ is the sum of every charge times its position, nuclei and electrons, in debye (D). '
            + 'The arrow points from − to + (the physics and IUPAC convention), 1 a₀ per debye; many chemistry texts draw it the other way. '
            + 'It is not drawn below 0.05 D, where its direction is noise.',
        full: 'It is computed from the Kohn–Sham density and the nuclear charges, and compared with experiment where a measured value is listed.',
    },
    tier: {
        title: 'Data tier',
        plain: 'Library molecules are curated: chosen, prepared and checked against published values where those exist. Computed molecules were calculated on request by the same method and are not checked against experiment.',
        technical: 'A Library molecule\'s line says which of its properties were checked against published values and whether its geometry is from experiment or optimised. '
            + 'A Computed molecule is not benchmarked against experiment.',
    },
};
