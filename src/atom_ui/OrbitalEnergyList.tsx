import React from 'react';
import type { SerialisedSubshell } from '../workers/atomWorker';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import { formatElectrons } from '../atom/atom_text';
import { orbitalEnergyTableParts } from '../format/energy';
import InfoButton from '../info/InfoButton';
import './element_tile.css';

/**
 * Every occupied subshell's orbital energy, deepest first (spec §9.1
 * Orbitals tab). Ruling R19: an eigenvalue, never called an ionisation
 * energy. Owner R26-2: the caption is a short label with its unit and a
 * Kohn–Sham (i); its method words ("eigenvalues", the relativity) are Info's --
 * the energyLevels entry and "How this was computed", which states the drawn
 * profile's method (ruling C9). Energies read eV first, then Ha, each in its own
 * column with its unit in the header (science corrections S2). Final polish F4: the headers are the bare units, "eV"
 * and "Ha", named "Energy (eV)" and "Energy (Ha)" -- a held-on-one-line "Energy (eV)" is wider than a heavy atom's
 * column in the 300 px Explore panel, and the table must not scroll sideways.
 */
const OrbitalEnergyList: React.FC<{ subshells: SerialisedSubshell[] }> = ({ subshells }) => (
    <table className="orbital-energy-list ql-tabular" aria-label="orbital energies, whole atom">
        <caption className="ql-caption">
            <span className="info-term orbital-energy-caption">
                <span className="info-term-label">Orbital energies</span>
                {/* Its own place: Bonds and Molecules have Kohn–Sham (i)s of their own ('data', 'info'). */}
                <InfoButton topic="kohnSham" label="Kohn–Sham orbitals" place="energy-table" />
            </span>
        </caption>
        <thead>
            <tr><th scope="col">Subshell</th><th scope="col">Electrons</th><th scope="col" aria-label="Energy (eV)">eV</th><th scope="col" aria-label="Energy (Ha)">Ha</th></tr>
        </thead>
        <tbody>
            {[...subshells].sort((a, b) => a.energy - b.energy).map(subshell => (
                <tr key={`${subshell.n}-${subshell.l}-${subshell.j ?? ''}`}>
                    <th scope="row">
                        <span aria-hidden={subshell.j === undefined ? undefined : true}>{subshellLabel(subshell.n, subshell.l, subshell.j)}</span>
                        {subshell.j !== undefined && <span className="visually-hidden">{subshellSpokenLabel(subshell.n, subshell.l, subshell.j)}</span>}
                    </th>
                    <td>{formatElectrons(subshell.electrons)} of {subshell.j === undefined ? 2 * (2 * subshell.l + 1) : 2 * subshell.j + 1}</td>
                    {/* Science corrections S2: eV first, then Ha -- the shared formatter's two numbers, a true minus (U+2212). */}
                    <td>{orbitalEnergyTableParts(subshell.energy).ev}</td>
                    <td>{orbitalEnergyTableParts(subshell.energy).ha}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

export default OrbitalEnergyList;
