import React from 'react';
import type { SerialisedSubshell } from '../workers/atomWorker';
import { subshellLabel, subshellSpokenLabel } from '../atom/configurations';
import { shortMethodLabel, type RelativityMode } from '../atom/relativity';
import { formatElectrons } from '../atom/atom_text';
import { hartreeText } from '../orbital_facts';
import './element_tile.css';

/**
 * Every occupied subshell's orbital energy, deepest first (spec §9.1
 * Orbitals tab). Ruling R19: an eigenvalue, never called an ionisation
 * energy; the drawn profile's method is stated (ruling C9).
 */
const OrbitalEnergyList: React.FC<{ subshells: SerialisedSubshell[]; relativity: RelativityMode }> = ({ subshells, relativity }) => (
    <table className="orbital-energy-list ql-tabular" aria-label="orbital energies, whole atom">
        <caption className="ql-caption">Orbital energies (eigenvalues, Ha), {shortMethodLabel(relativity)}</caption>
        <thead>
            <tr><th scope="col">Subshell</th><th scope="col">Electrons</th><th scope="col">Energy</th></tr>
        </thead>
        <tbody>
            {[...subshells].sort((a, b) => a.energy - b.energy).map(subshell => (
                <tr key={`${subshell.n}-${subshell.l}-${subshell.j ?? ''}`}>
                    <th scope="row">
                        <span aria-hidden={subshell.j === undefined ? undefined : true}>{subshellLabel(subshell.n, subshell.l, subshell.j)}</span>
                        {subshell.j !== undefined && <span className="visually-hidden">{subshellSpokenLabel(subshell.n, subshell.l, subshell.j)}</span>}
                    </th>
                    <td>{formatElectrons(subshell.electrons)} of {subshell.j === undefined ? 2 * (2 * subshell.l + 1) : 2 * subshell.j + 1}</td>
                    {/* Task 6: the chips' and Info's own Ha text -- a true minus (U+2212). */}
                    <td>{hartreeText(subshell.energy)}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

export default OrbitalEnergyList;
