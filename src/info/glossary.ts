/**
 * What each (i) explains (plan Task 4), written once per band: `plain` for Basics and Explore, `technical` added at
 * Advanced, `full` added at Research (method and caveats). Each band reads on from the one before it, so a reader at
 * Research gets all three in order. The words follow the app's own captions -- its methods, conventions and limits
 * (relativity.ts, captions.ts, esp_color.ts, orbital_display.ts, delta_scf.ts) -- and its typography: Unicode
 * subscripts, a true minus (U+2212), units on every value.
 */
import type { InfoTopicId } from './info_types';

export interface GlossaryEntry {
    title: string;
    plain: string;
    technical: string;
    full?: string;
}

export const glossary: Record<InfoTopicId, GlossaryEntry> = {
    shell: {
        title: 'Shell',
        plain: 'A shell is a group of electrons at about the same distance from the nucleus. Shells are numbered n = 1, 2, 3 … from the nucleus outwards, and also lettered K, L, M and so on.',
        technical: 'All orbitals with the same principal quantum number n form a shell, which holds at most 2n² electrons. '
            + 'In hydrogen every orbital of a shell has the same energy; in a many-electron atom its subshells separate. '
            + 'In the atom\'s radial distribution D(r) the shells show as peaks, clearest for the inner ones.',
    },
    subshell: {
        title: 'Subshell',
        plain: 'A subshell is the part of a shell whose orbitals share one shape, named s, p, d or f. It holds up to 2, 6, 10 or 14 electrons.',
        technical: 'The orbitals of a shell with the same angular momentum quantum number l (0, 1, 2, 3 for s, p, d, f) form a subshell '
            + 'of 2l + 1 orbitals and up to 2(2l + 1) electrons, named by n and the letter, as in 2p or 3d. '
            + 'With spin–orbit coupling a subshell with l > 0 splits into two levels, j = l − ½ and j = l + ½.',
        full: 'In Atoms the model is a central field: a partly filled subshell\'s electrons are spread evenly over all its orbitals, '
            + 'so the subshell is the physical object, and its separate s, p, d or f lobes are a choice of basis.',
    },
    orbital: {
        title: 'Orbital',
        plain: 'An orbital is one allowed state of an electron, drawn as the cloud where that electron is likely to be found. Each orbital holds at most two electrons.',
        technical: 'An orbital is a one-electron wave function ψ, labelled in an atom by n, l and mₗ; |ψ|² is the probability density. '
            + 'The app draws real orbitals, named by their axes (as in 2pₓ), which are combinations of the complex functions with +mₗ and −mₗ.',
        full: 'In Orbitals each one is an exact solution for hydrogen (Z = 1). In Atoms it is a central-field (LDA) solution, with one radial '
            + 'function for every mₗ of a subshell. In Bonds and Molecules the orbitals are Kohn–Sham orbitals, except H₂⁺\'s, which are exact.',
    },
    enclosed: {
        title: 'Enclosed fraction',
        plain: 'A cloud has no edge, so the app draws a surface that holds a chosen share of the electron, 90 % unless you change it. A larger share draws a larger surface.',
        technical: 'The surface is a contour of constant |ψ|² (or of the density ρ), its value found for each orbital so that the region inside '
            + 'holds the chosen fraction: 50, 75, 90, 95 or 99 %. A fixed density value would not compare orbitals fairly; an enclosed fraction does.',
        full: 'The electrostatic potential map is the exception: its surface is fixed at ρ = 0.001 e/a₀³, a common convention, not an enclosed fraction.',
    },
    node: {
        title: 'Node',
        plain: 'A node is a surface where the wave function is zero, so the chance of finding the electron there is zero. Across a node the wave function changes sign, and the colours swap.',
        technical: 'An orbital with quantum numbers n and l has n − l − 1 radial nodes (spheres) and l angular nodes (planes or cones), n − 1 in all. '
            + 'For the same l, more nodes mean a higher energy.',
        full: 'Molecular orbitals have nodal surfaces too: an antibonding orbital, marked * in Bonds, has one between the nuclei, '
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
            + 'of the calculation named under "How this was computed".',
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
    kohnSham: {
        title: 'Kohn–Sham orbitals',
        plain: 'The molecular orbitals here come from density functional theory, a standard way to compute molecules. Their shapes are the familiar orbital picture; their energies are not the energy needed to remove an electron.',
        technical: 'Kohn–Sham DFT replaces the interacting electrons by non-interacting ones in an effective potential chosen to give the same density ρ. '
            + 'The orbitals and their energies ε belong to that model system; the density and the total energy are the physical results. '
            + 'With the exact functional −ε of the HOMO would equal the first ionisation energy; approximate functionals such as B3LYP do not achieve this, so the app never reports ε as an ionisation energy.',
        full: 'For an open shell the calculation is unrestricted: α and β electrons have their own orbitals and energies, and Bonds draws its levels at the α energies.',
    },
    relativity: {
        title: 'Relativity',
        plain: 'In heavy atoms the inner electrons move fast enough that relativity matters: some shells pull in, others spread out. The app can include it or leave it out.',
        technical: 'Off solves the Schrödinger equation; Scalar adds the mass-velocity and Darwin terms (Koelling–Harmon, no spin–orbit); '
            + 'With spin–orbit solves the radial Dirac equation, splitting each subshell with l > 0 into j = l ± ½ levels. '
            + 'Scalar is the default from caesium (Z = 55) on, where the relativistic error passes a few percent. '
            + 'Relativistic s and p shells contract, and d and f shells expand, more strongly screened by them.',
        full: 'The relativistic settings also apply the MacDonald–Vosko correction to LDA exchange, as NIST\'s relativistic reference tables do. '
            + 'The ΔSCF ionisation and excitation energies stay non-relativistic, so for a heavy atom they leave out the shifts the picture shows.',
    },
    ionisation: {
        title: 'Ionisation energy',
        plain: 'The ionisation energy is the energy needed to pull one electron off an atom. It is small for metals such as sodium and large for noble gases such as neon.',
        technical: 'The app computes it by ΔSCF: the total energy with one electron removed minus the total energy before, both from spin-polarised LDA, never from an orbital energy. '
            + 'It is given in eV beside the NIST measurement, with the signed difference.',
        full: 'Open shells are spherically averaged, so expect larger errors for d- and f-block elements.',
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
        technical: 'E(R) is the energy with the nuclei held fixed (Born–Oppenheimer) as a function of the bond length R, plotted in eV relative to the separated atoms. '
            + 'Its minimum is at the equilibrium length Rₑ; the well depth Dₑ is the energy needed to separate the atoms from there, without zero-point energy.',
        full: 'Energies are coupled cluster, CCSD(T) with the aug-cc-pVTZ basis (full CI for H₂ and He₂), at precomputed bond lengths; H₂⁺ is solved exactly here. '
            + 'A curve stops where single-reference CCSD(T) is no longer valid, as the bond breaks into open-shell atoms.',
    },
    moDiagram: {
        title: 'MO diagram',
        plain: 'The diagram shows the molecule\'s orbitals as levels, lowest energy at the bottom, with an arrow for each electron. Levels marked * are antibonding: electrons there weaken the bond.',
        technical: 'Each level is a molecular orbital labelled by its symmetry (σ or π, g or u), placed at its orbital energy ε in Ha; '
            + 'the valence levels are to scale, and the core levels, far lower, sit in a band under a break. '
            + 'For molecules the energies are Kohn–Sham eigenvalues; for H₂⁺ they are the exact electronic energies.',
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
        plain: 'A dipole moment measures how unevenly a molecule\'s charge is shared, one end slightly negative and the other slightly positive. Symmetric molecules such as CO₂ have none.',
        technical: 'μ is the sum of every charge times its position, nuclei and electrons, in debye (D). '
            + 'The arrow points from − to + (the physics and IUPAC convention), 1 a₀ per debye; many chemistry texts draw it the other way. '
            + 'It is not drawn below 0.05 D, where its direction is noise.',
        full: 'It is computed from the Kohn–Sham density and the nuclear charges, and compared with experiment where a measured value is listed.',
    },
    tier: {
        title: 'Data tier',
        plain: 'Library molecules are curated: chosen, prepared and checked against published values where those exist. Computed molecules were calculated on request by the same method and are not checked against experiment.',
        technical: 'Both tiers are computed by the same method. '
            + 'A Library molecule\'s line says which of its properties were checked against published values and whether its geometry is from experiment or optimised. '
            + 'A Computed molecule is not benchmarked against experiment.',
    },
};
