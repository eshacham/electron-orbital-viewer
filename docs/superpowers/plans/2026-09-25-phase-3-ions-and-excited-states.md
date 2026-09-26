# Phase 3 — Ions and Excited States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atom mode gains a *Charge* stepper (−2 to +3, limited per element) and an *Excite* action ("promote one electron to…"); the atom redraws at its true size against a dashed ring at the neutral atom's edge, and shows ΔSCF ionisation and excitation energies labelled "ΔSCF, LDA", with anions that LDA cannot bind reported, never drawn.

**Architecture:** A species `{ Z, charge, excitation }` replaces "Z alone" as the thing that is solved. Its configuration comes from a NIST-ASD-derived cation table, an anion rule and a one-electron promotion (`species.ts`, `ion_configurations.ts`). `solveAtomOnGrid` takes an options object carrying the configuration; `solveSpecies` caches by species key and `solveAtom(Z)` stays the neutral wrapper. Pictures use the existing, NIST-validated restricted LDA. Energies use a new spin-polarised SCF (LSDA, Hund's-rule occupations, VWN5 spin interpolation) in a separate, cancellable worker. The store, both caches, the worker protocol and the URL all key by species; a dashed reference ring on the cut face marks the neutral atom's drawn radius.

**Tech Stack:** TypeScript, React 19, MUI 7, three.js 0.176, Redux Toolkit, Vite, Jest + ts-jest (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` (§3 principles and §4 shared architecture are binding; §5 "Phase 3 — Ions and excited states" is the requirement). Background: `docs/superpowers/specs/2026-08-29-multi-electron-atoms.md` (SCF design), `docs/HANDOFF.md` ("Decisions that are not obvious from the code").

## Global Constraints

- **Every number states its method** (§3.1). Every ionisation or excitation energy shows the visible label `ΔSCF, LDA` and carries `DELTA_SCF_METHOD` (Task 6) as its `title` tooltip. Radii in the compare line say "drawn radius".
- **Eigenvalues are not ionisation energies** (§3.4, ruling R19). Energies on screen are only ever ΔSCF differences of total energies. No orbital eigenvalue is labelled an IE anywhere.
- **Validated before shipped** (§3.2). Verbatim: "ΔSCF first ionisation energies for H–Ar within 10 % of NIST experimental values (e.g. Na 5.139 eV, Cl 12.968 eV); Na 3s→3p excitation within 10 % of 2.104 eV (the D line); contour radius strictly ordered Na⁺ < Na and Cl < Cl⁻ where Cl⁻ is bound." Rows go into Phase 1's `src/validation/references.ts` with `app` values written by a test (Task 7), never typed by hand.
- **Failures are shown, not hidden** (§3.5). An anion whose extra electron has no bound state shows exactly "LDA does not bind this anion" plus which subshell, and the canvas is cleared. Unconverged SCF keeps using the existing `solveFailed` path.
- **One-electron systems bypass SCF** (HANDOFF). H, He⁺, Li²⁺ … are exact, in pictures and in ΔSCF totals. An excited one-electron atom's total is exactly −Z²/(2n²).
- **Navigation comes from the configuration, never from detected peaks** (HANDOFF). Shell chips, configuration line and valence line come from the species configuration.
- **Solve once per species, never per level change** (HANDOFF / R28). Only `setElement`, `setCharge`, `setExcitation` and the enclosed fraction start a solve.
- **Neutral atoms are unchanged byte for byte.** `solveAtom(Z)` returns the same memoised object as before, the neutral restricted SCF path has no new branch that runs for it, and every cache key for a neutral ground state keeps its current string (`speciesKey` of a neutral ground state is `String(Z)`).
- **Expensive SCF sweeps stay behind `ATOM_SLOW_TESTS=1`.** The default suite must stay near its current ~57–70 s; each task states what it adds.
- **Layout contract** (§3.8). Desktop: the Charge/Excite card sits inside LevelNav in the left `.side-panel`, directly under the element button. Phone: it is the first block of the `Explore` tab; the `.phone-header` element button shows the species symbol (`Na⁺ · Sodium ▾`). No new floating panel.
- **Performance** (§3.7). The picture's solve is unchanged in cost for a neutral atom; an ion's solve adds one neutral solve for the reference ring (cached in the worker). ΔSCF energies run in a second worker that is terminated whenever the species changes, so they never queue in front of a picture.
- **Phase ordering.** Phases 1 and 2 have shipped before this plan runs: `src/validation/references.ts` (Phase 1 Task 1: `ValidationRow`, `VALIDATION`, `relativeErrorPercent`) and `src/url_state.ts` (spec §4.3: `registerUrlKeys(mode, encoder, decoder)`) exist. **Phase 4 runs after this plan** and layers on it: it adds `relativity` and `startingPotential` as fields of this plan's `ScfOptions` object (Task 3), appends `:${relativity}` to this plan's species-based cache keys (Task 8), and adds `relativity` to this plan's `'solve'` worker message. Do not add relativity here.
- **Naming** (HANDOFF): `D(r) = 4πr²ρ(r)` is the radial distribution; `density` is ρ. British spelling in comments and UI copy ("ionisation", "colour"). Comments explain *why*, in the register of `src/atom/*.ts`.
- **TDD for every task**: failing test with real assertions, run it, minimal code, run it, commit. Tests: `npx jest <path>`; types: `npx tsc --noEmit -p .`.
- **Run every command in the foreground.** Never background a command. Slow runs below take minutes; that is normal.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The dev server runs at http://localhost:5391 (`npx vite --port 5391 --strictPort`); start it only if it is not already running.

## Measured facts this plan is built on

Measured while writing the plan with a prototype of exactly the solvers below, against NIST data retrieved 2026-09-25:

1. **Restricted LDA fails the spec's 10 %** for O (+21.9 %), F (+12.3 %) and S (+14.6 %): spin-unpolarised ΔSCF misses the exchange energy of unpaired electrons, which differs between O (2 unpaired) and O⁺ (3). **Spin-polarised LDA (LSD) passes for all of H–Ar**; worst He −7.6 % (He⁺ is exact by the bypass), next C +4.5 %. The prototype's LSD totals match NIST SRD 141's LSD column to ≤ 2·10⁻⁶ relative (O −74.527288 vs −74.527410). Hence: pictures stay restricted LDA (validated, unchanged); ΔSCF energies use LSD, labelled "ΔSCF, LDA" with the full method in the tooltip.
2. **Na 3s→3p**: LSD ΔSCF 2.185 eV (+3.8 % vs 2.104); restricted 2.110 eV.
3. **Anions in restricted LDA**: H⁻, Li⁻, C⁻, O⁻, F⁻, S⁻, Cl⁻, O²⁻ lose their bound HOMO within 3–14 SCF iterations (also when started from the converged neutral potential); without detection the loop returns nonsense (H⁻ at −379 Ha). **Br⁻ and I⁻ are bound** (HOMO −0.0021 and −0.0099 Ha). So **Cl⁻ is not bound in this LDA**; the spec's "Cl < Cl⁻ where Cl⁻ is bound" is vacuous for Cl and is asserted instead as: Cl⁻ reports unbound, and Br < Br⁻ (1.874 < 2.088 a₀ at 90 %), I < I⁻ (1.820 < 2.014).
4. **A removal rule is wrong for 52 of 449 offered ions** (V⁺ is 3d⁴ not 3d³4s¹; Y⁺ 5s²; La⁺ 5d²; Ce⁺ 4f5d²; every Ln³⁺ is 4fⁿ; Th²⁺ 5f6d; …). A table is required. The neutral table in `configurations.ts` agrees with NIST ASD for all Z ≤ 108. NIST ASD has no ground configurations for Z ≥ 109.
5. Radii at 90 %: Na 1.944 a₀, Na⁺ 1.284, Na(3p) 2.043. Fe²⁺, Fe³⁺, Cu⁺ converge in ~40 iterations.

## Review Focus

1. **Changing element with an ion or excitation selected.** A person expects the new element's neutral ground state, not "Fe²⁺" carried onto sodium (which does not exist). Owning test: Task 9, "setElement returns to the neutral ground state".
2. **Going back from an unbound anion to a bound species** (Cl⁻ → Cl). The alert must clear, the canvas must draw Cl again, no stale "unbound" and no hang. Owning tests: Task 9, "setCharge clears an unbound report and bumps the nonce"; Task 12 live check.
3. **Stale energies.** Stepping Na → Na⁺ → Na quickly must never show Na⁺'s ionisation energy under Na. Owning test: Task 9, "drops an energies reply for a species no longer selected".
4. **A URL naming a charge or excitation the element does not offer** (`Z=11&charge=3`, `excite=3s-9z`, `charge=abc`). Expected: ignored, neutral ground state, no throw. Owning test: Task 2, "decodeSpeciesParams ignores anything the element does not offer".
5. **Drill-down on an ion or excited atom.** Na⁺ has no M shell and Na(3s→4s) has no n=3 shell; the chips, configuration and valence lines must say so. Owning tests: Task 11, "LevelNav builds its shells from the species configuration"; Task 9 "drillToShell refuses a shell the ion does not occupy".

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/atom/ion_configurations.ts` | Create | NIST-ASD cation table, anion rule, `allowedCharges`, `ionConfigurationFor` |
| `tests/atom/fixtures/nist_ion_ground_configurations.json` | Create (generated) | NIST ASD ground shells, Z ≤ 108, charge 0–3 |
| `src/atom/configurations.ts` | Modify | `parseConfiguration`, and configuration-based `shellsOf`, `configurationLabelOf`, `valenceShellOf`, `valenceConfigurationLabelOf` (Z versions delegate) |
| `src/atom/species.ts` | Create | `AtomSpecies`, `Excitation`, keys, configuration, excitation sources/targets, labels, URL codec |
| `src/atom/scf_shared.ts` | Create | Helpers moved out of `scf.ts` unchanged, plus `UnboundAnionError`, `assertStatesBound` |
| `src/atom/radial_solver.ts` | Modify | `hasBoundState` |
| `src/atom/scf.ts` | Modify | `ScfOptions`, `solveAtomOnGrid(Z, grid, options)`, `solveSpecies`, anion guard, exact excited one-electron energy |
| `src/atom/correlation.ts` | Modify | `spinCorrelation` (VWN5 spin interpolation) |
| `src/atom/hartree.ts` | Modify | `spinExchangePotential`, `spinExchangeEnergyDensity` |
| `src/atom/spin_scf.ts` | Create | `spinOccupations`, `solvePolarisedOnGrid` (LSD, energies only) |
| `src/atom/delta_scf.ts` | Create | ΔSCF ionisation/excitation energies, method strings |
| `src/atom/ionisation_references.ts` | Create | NIST ASD first ionisation energies H–Ar, Na D line |
| `src/validation/ion_results.json` | Create (generated) | App values written by the slow test |
| `src/validation/ion_rows.ts` | Create | Maps results to `ValidationRow[]` |
| `src/validation/references.ts` | Modify (Phase 1) | Append `ION_VALIDATION_ROWS` |
| `src/workers/atomWorker.ts` | Modify | Species in `'solve'`, `'unbound'` reply, `'energies'` request, reference radii, `handleAtomWorkerRequest` |
| `src/atom/profile_cache.ts`, `src/atom/shell_mesh_cache.ts` | Modify | Keys by species key |
| `src/store/atomSlice.ts` | Modify | `charge`, `excitation`, `unbound`, `energies`, actions |
| `src/atom/useAtomSolver.ts` | Modify | Posts species, handles `'unbound'`, caches by species |
| `src/atom/useDeltaScfEnergies.ts` | Create | Cancellable energies worker |
| `src/atom/reference_ring.ts` | Create | Dashed ring on the cut plane at the neutral's drawn radius |
| `src/orbital_visualizer.ts` | Modify | `setReferenceRing`, `clearAtomView`, `framingFloor` |
| `src/components/SpeciesControls.tsx` | Create | Charge stepper, Excite menu, energies, compare line |
| `src/components/LevelNav.tsx` | Modify | `configuration`, `speciesSymbol`, `speciesTitle`, `speciesControls` props; about text |
| `src/components/OrbitalViewer.tsx`, `src/App.tsx`, `src/style.css` | Modify | Wiring, unbound alert, ring, busy label |
| `src/url_state.ts` (Phase 2) | Modify | `charge`, `excite` keys |
| `README.md`, `docs/HANDOFF.md` | Modify | Feature, limits, decisions |

---

### Task 1: NIST-derived ion configuration table

**Decision: table, not rule.** Measured fact 4: "remove the highest-n, then highest-l electron" gets 52 of 449 offered ions wrong, across the d, f and 6d/5f blocks. A rule plus 52 exceptions is the same data spread over two places, which is exactly the argument `configurations.ts` makes for neutrals. The table below is NIST ASD's "Ground Shells" column, normalised to this repo's `[core] subshells` notation. **It is validated** by a committed fixture produced from the NIST ASD CSV by the command in Step 1, and a test that expands both and compares every offered (Z, charge), plus every neutral configuration for Z ≤ 108.

**Which charges are offered ("physically sensible"):**
- Cations up to `min(3, Z − 1, Z − Z_core)`, where `Z_core` is the previous noble gas: never break into a noble-gas core, never strip the atom bare. Only for Z ≤ 108 (NIST has no data beyond). Na: +1. Mg: +2. Fe, Cu, Cl: up to +3. He: +1.
- Anions: hydrogen and the groups 14–17 elements with a positive measured electron affinity (N is excluded: its EA is negative), −1; group 16 also −2 (the oxide/sulfide ions chemistry teaches; LDA's verdict on them is shown, not hidden). Extra electrons go into the valence p subshell (1s for H).

**Files:**
- Create: `src/atom/ion_configurations.ts`
- Create: `tests/atom/fixtures/nist_ion_ground_configurations.json` (generated in Step 1)
- Modify: `src/atom/configurations.ts` (export `parseConfiguration`)
- Test: `tests/atom/ion_configurations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // configurations.ts
  export function parseConfiguration(spec: string): SubshellOccupancy[];   // '[Ar] 3d6' -> sorted by (n, l)
  // ion_configurations.ts
  export const MIN_CHARGE = -2;
  export const MAX_CHARGE = 3;
  export function maxCationCharge(Z: number): number;
  export function minAnionCharge(Z: number): number;          // 0, -1 or -2
  export function allowedCharges(Z: number): number[];        // ascending, always includes 0
  export function ionConfigurationFor(Z: number, charge: number): SubshellOccupancy[];  // throws if not offered
  ```

- [ ] **Step 1: Generate the NIST fixture (foreground, ~30 s)**

```bash
curl -s "https://physics.nist.gov/cgi-bin/ASD/ie.pl?spectra=H-Og&submit=Retrieve+Data&units=1&format=2&order=0&at_num_out=on&sp_name_out=on&ion_charge_out=on&el_name_out=on&seq_out=on&shells_out=on&level_out=on&ion_conf_out=on&e_out=0&unc_out=on&biblio=on" -o /tmp/nist_ie.csv
node --input-type=commonjs - <<'EOF'
const fs = require('fs');
const lines = fs.readFileSync('/tmp/nist_ie.csv', 'utf8').trim().split('\n').slice(1);
// Every cell is written as ="value" inside quotes; strip that wrapping.
const cellsOf = line => line.split('","').map(c => c.replace(/^"?=?"*/, '').replace(/"*,?$/, ''));
const entries = [];
for (const line of lines) {
    const c = cellsOf(line);
    const Z = Number(c[0]);
    const charge = Number(c[2]);
    if (Z <= 108 && charge >= 0 && charge <= 3) entries.push({ Z, charge, groundShells: c[5] });
}
fs.writeFileSync('tests/atom/fixtures/nist_ion_ground_configurations.json', JSON.stringify({
    source: 'NIST Atomic Spectra Database, Ionization Energies Data, "Ground Shells" column (Kramida, Ralchenko, Reader and NIST ASD Team)',
    url: 'https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html',
    retrieved: new Date().toISOString().slice(0, 10),
    entries,
}, null, 1) + '\n');
console.log(entries.length);
EOF
```
Expected: prints `426`. Spot-check the file: the `Z: 26` entries read `[Ar].3d6.4s2`, `[Ar].3d6.4s`, `[Ar].3d6`, `[Ar].3d5`. If the count differs or the network fails, stop and report — do not hand-write the fixture.

- [ ] **Step 2: Write the failing test**

```ts
// tests/atom/ion_configurations.test.ts
import fixture from './fixtures/nist_ion_ground_configurations.json';
import { configurationFor, parseConfiguration, SubshellOccupancy } from '../../src/atom/configurations';
import {
    allowedCharges, ionConfigurationFor, maxCationCharge, minAnionCharge, MIN_CHARGE, MAX_CHARGE,
} from '../../src/atom/ion_configurations';

const LETTERS = 'spdf';
const token = (t: string) => {
    const m = /^(\d+)([spdf])(\d*)$/.exec(t);
    if (!m) throw new Error(`bad NIST token ${t}`);
    return `${m[1]}${m[2]}${m[3] === '' ? 1 : Number(m[3])}`;
};
// NIST writes cores as [He]..[Rn] and also [Cd] and [Hg]; expand all of them.
const CORES: Record<string, string[]> = {};
CORES.He = ['1s2'];
CORES.Ne = [...CORES.He, '2s2', '2p6'];
CORES.Ar = [...CORES.Ne, '3s2', '3p6'];
CORES.Kr = [...CORES.Ar, '3d10', '4s2', '4p6'];
CORES.Cd = [...CORES.Kr, '4d10', '5s2'];
CORES.Xe = [...CORES.Cd, '5p6'];
CORES.Hg = [...CORES.Xe, '4f14', '5d10', '6s2'];
CORES.Rn = [...CORES.Hg, '6p6'];

const order = (t: string) => { const m = /^(\d+)([spdf])/.exec(t)!; return Number(m[1]) * 10 + LETTERS.indexOf(m[2]); };
function expandNist(shells: string): string {
    const tokens: string[] = [];
    for (const part of shells.split('.')) {
        const core = /^\[(\w+)\]$/.exec(part);
        if (core) tokens.push(...CORES[core[1]]);
        else tokens.push(token(part));
    }
    return tokens.sort((a, b) => order(a) - order(b)).join(' ');
}
const format = (c: SubshellOccupancy[]) => c.map(s => `${s.n}${LETTERS[s.l]}${s.electrons}`).join(' ');
const nist = (Z: number, charge: number) => {
    const entry = fixture.entries.find(e => e.Z === Z && e.charge === charge);
    if (!entry) throw new Error(`fixture has no Z=${Z} charge=${charge}`);
    return expandNist(entry.groundShells);
};

describe('ion configurations', () => {
    it('parses the repository notation, cores included', () => {
        expect(format(parseConfiguration('[Ar] 3d6'))).toBe('1s2 2s2 2p6 3s2 3p6 3d6');
        expect(format(parseConfiguration('[Xe]'))).toBe(format(configurationFor(54)));
        expect(format(parseConfiguration('1s1'))).toBe('1s1');
    });

    it('agrees with NIST ASD for every neutral atom Z <= 108', () => {
        for (let Z = 1; Z <= 108; Z++) expect([Z, format(configurationFor(Z))]).toEqual([Z, nist(Z, 0)]);
    });

    it('agrees with NIST ASD for every cation it offers', () => {
        let checked = 0;
        for (let Z = 1; Z <= 108; Z++) {
            for (let charge = 1; charge <= maxCationCharge(Z); charge++) {
                expect([Z, charge, format(ionConfigurationFor(Z, charge))]).toEqual([Z, charge, nist(Z, charge)]);
                checked++;
            }
        }
        expect(checked).toBe(301);
    });

    it('lets transition metals lose ns before (n-1)d', () => {
        expect(format(ionConfigurationFor(26, 2))).toBe('1s2 2s2 2p6 3s2 3p6 3d6');    // Fe2+ = [Ar] 3d6
        expect(format(ionConfigurationFor(29, 1))).toBe('1s2 2s2 2p6 3s2 3p6 3d10');   // Cu+ = [Ar] 3d10
    });

    it('fills the valence p subshell for anions, and 1s for hydride', () => {
        expect(format(ionConfigurationFor(17, -1))).toBe(format(configurationFor(18)));   // Cl- is argon-like
        expect(format(ionConfigurationFor(8, -2))).toBe(format(configurationFor(10)));    // O2- is neon-like
        expect(format(ionConfigurationFor(1, -1))).toBe('1s2');
        expect(format(ionConfigurationFor(82, -1))).toBe(format(configurationFor(82)).replace('6p2', '6p3'));
    });

    it('offers only physically sensible charges', () => {
        expect(allowedCharges(1)).toEqual([-1, 0]);
        expect(allowedCharges(2)).toEqual([0, 1]);
        expect(allowedCharges(7)).toEqual([0, 1, 2, 3]);          // N: negative electron affinity
        expect(allowedCharges(8)).toEqual([-2, -1, 0, 1, 2, 3]);
        expect(allowedCharges(11)).toEqual([0, 1]);
        expect(allowedCharges(12)).toEqual([0, 1, 2]);
        expect(allowedCharges(17)).toEqual([-1, 0, 1, 2, 3]);
        expect(allowedCharges(108)).toEqual([0, 1, 2, 3]);
        expect(allowedCharges(109)).toEqual([0]);
        expect(allowedCharges(118)).toEqual([0]);
        for (let Z = 1; Z <= 118; Z++) {
            for (const q of allowedCharges(Z)) { expect(q).toBeGreaterThanOrEqual(MIN_CHARGE); expect(q).toBeLessThanOrEqual(MAX_CHARGE); }
            expect(minAnionCharge(Z)).toBeLessThanOrEqual(0);
        }
    });

    it('keeps Z - charge electrons in every offered species', () => {
        for (let Z = 1; Z <= 118; Z++) {
            for (const q of allowedCharges(Z)) {
                expect(ionConfigurationFor(Z, q).reduce((sum, s) => sum + s.electrons, 0)).toBe(Z - q);
            }
        }
    });

    it('refuses a charge it does not offer', () => {
        expect(() => ionConfigurationFor(11, 2)).toThrow(/not offered/);
        expect(() => ionConfigurationFor(7, -1)).toThrow(/not offered/);
    });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest tests/atom/ion_configurations.test.ts`
Expected: FAIL, "Cannot find module '../../src/atom/ion_configurations'".

- [ ] **Step 4: Implement**

In `src/atom/configurations.ts`, add below `buildConfigurations` (reusing its private helpers, so a typo in a core fails loudly the same way):

```ts
/**
 * Parses one configuration in this file's own notation -- '[Ar] 3d6',
 * '1s2 2s1', '[Xe]' -- into occupancies sorted by (n, l). The ion table
 * (ion_configurations.ts) is written in the same notation as
 * RAW_CONFIGURATIONS, so it resolves cores against the same neutral table.
 */
export function parseConfiguration(spec: string): SubshellOccupancy[] {
    const coreMatch = /^\[(\w+)\]\s*(.*)$/.exec(spec.trim());
    const core = coreMatch ? resolveCore(coreMatch[1], CONFIGURATIONS).map(s => ({ ...s })) : [];
    const own = parseOwnSubshells(coreMatch ? coreMatch[2] : spec);
    return [...core, ...own].sort((a, b) => (a.n - b.n) || (a.l - b.l));
}
```

Create `src/atom/ion_configurations.ts`:

```ts
/**
 * Ground-state configurations of ions, charge -2..+3 (spec §5 Phase 3).
 *
 * A table, not a rule. "Remove the outermost electron" gets 52 of the 301
 * cations offered here wrong: V+ is 3d4 (not 3d3 4s1), Y+ is 5s2, La+ is
 * 5d2, every lanthanide 3+ ion is pure 4f^n, Th2+ is 5f 6d. These are
 * measured ground states, and the rule-plus-exceptions alternative would
 * carry the same 52 facts in two places instead of one -- the argument
 * configurations.ts makes for the neutral atoms, and it holds here too.
 *
 * Transcribed from the NIST Atomic Spectra Database "Ground Shells" column
 * and checked entry by entry against a committed extract of it
 * (tests/atom/fixtures/nist_ion_ground_configurations.json). NIST has no
 * ground configurations beyond Z = 108, so no ion is offered past hassium.
 *
 * Which charges are offered is a physical judgment, stated once here:
 * cations never break into a noble-gas core and never strip the atom bare;
 * anions only for hydrogen and the group 14-17 elements whose electron
 * affinity is positive (nitrogen's is not), with -2 for group 16 because
 * the oxide and sulfide ions are what chemistry teaches. Whether LDA binds
 * them is a separate question, answered by the solver and shown, not hidden.
 */
import { configurationFor, parseConfiguration, SubshellOccupancy } from './configurations';

export const MIN_CHARGE = -2;
export const MAX_CHARGE = 3;

/** Index 0 is charge +1. One entry per element that has cations to offer; NIST ASD Ground Shells. */
// prettier-ignore
const CATION_CONFIGURATIONS: Readonly<Record<number, readonly string[]>> = {
    2: ['1s1'],  // He
    3: ['[He]'],  // Li
    4: ['[He] 2s1', '[He]'],  // Be
    5: ['[He] 2s2', '[He] 2s1', '[He]'],  // B
    6: ['[He] 2s2 2p1', '[He] 2s2', '[He] 2s1'],  // C
    7: ['[He] 2s2 2p2', '[He] 2s2 2p1', '[He] 2s2'],  // N
    8: ['[He] 2s2 2p3', '[He] 2s2 2p2', '[He] 2s2 2p1'],  // O
    9: ['[He] 2s2 2p4', '[He] 2s2 2p3', '[He] 2s2 2p2'],  // F
    10: ['[He] 2s2 2p5', '[He] 2s2 2p4', '[He] 2s2 2p3'],  // Ne
    11: ['[Ne]'],  // Na
    12: ['[Ne] 3s1', '[Ne]'],  // Mg
    13: ['[Ne] 3s2', '[Ne] 3s1', '[Ne]'],  // Al
    14: ['[Ne] 3s2 3p1', '[Ne] 3s2', '[Ne] 3s1'],  // Si
    15: ['[Ne] 3s2 3p2', '[Ne] 3s2 3p1', '[Ne] 3s2'],  // P
    16: ['[Ne] 3s2 3p3', '[Ne] 3s2 3p2', '[Ne] 3s2 3p1'],  // S
    17: ['[Ne] 3s2 3p4', '[Ne] 3s2 3p3', '[Ne] 3s2 3p2'],  // Cl
    18: ['[Ne] 3s2 3p5', '[Ne] 3s2 3p4', '[Ne] 3s2 3p3'],  // Ar
    19: ['[Ar]'],  // K
    20: ['[Ar] 4s1', '[Ar]'],  // Ca
    21: ['[Ar] 3d1 4s1', '[Ar] 3d1', '[Ar]'],  // Sc
    22: ['[Ar] 3d2 4s1', '[Ar] 3d2', '[Ar] 3d1'],  // Ti
    23: ['[Ar] 3d4', '[Ar] 3d3', '[Ar] 3d2'],  // V
    24: ['[Ar] 3d5', '[Ar] 3d4', '[Ar] 3d3'],  // Cr
    25: ['[Ar] 3d5 4s1', '[Ar] 3d5', '[Ar] 3d4'],  // Mn
    26: ['[Ar] 3d6 4s1', '[Ar] 3d6', '[Ar] 3d5'],  // Fe
    27: ['[Ar] 3d8', '[Ar] 3d7', '[Ar] 3d6'],  // Co
    28: ['[Ar] 3d9', '[Ar] 3d8', '[Ar] 3d7'],  // Ni
    29: ['[Ar] 3d10', '[Ar] 3d9', '[Ar] 3d8'],  // Cu
    30: ['[Ar] 3d10 4s1', '[Ar] 3d10', '[Ar] 3d9'],  // Zn
    31: ['[Ar] 3d10 4s2', '[Ar] 3d10 4s1', '[Ar] 3d10'],  // Ga
    32: ['[Ar] 3d10 4s2 4p1', '[Ar] 3d10 4s2', '[Ar] 3d10 4s1'],  // Ge
    33: ['[Ar] 3d10 4s2 4p2', '[Ar] 3d10 4s2 4p1', '[Ar] 3d10 4s2'],  // As
    34: ['[Ar] 3d10 4s2 4p3', '[Ar] 3d10 4s2 4p2', '[Ar] 3d10 4s2 4p1'],  // Se
    35: ['[Ar] 3d10 4s2 4p4', '[Ar] 3d10 4s2 4p3', '[Ar] 3d10 4s2 4p2'],  // Br
    36: ['[Ar] 3d10 4s2 4p5', '[Ar] 3d10 4s2 4p4', '[Ar] 3d10 4s2 4p3'],  // Kr
    37: ['[Kr]'],  // Rb
    38: ['[Kr] 5s1', '[Kr]'],  // Sr
    39: ['[Kr] 5s2', '[Kr] 4d1', '[Kr]'],  // Y
    40: ['[Kr] 4d2 5s1', '[Kr] 4d2', '[Kr] 4d1'],  // Zr
    41: ['[Kr] 4d4', '[Kr] 4d3', '[Kr] 4d2'],  // Nb
    42: ['[Kr] 4d5', '[Kr] 4d4', '[Kr] 4d3'],  // Mo
    43: ['[Kr] 4d5 5s1', '[Kr] 4d5', '[Kr] 4d4'],  // Tc
    44: ['[Kr] 4d7', '[Kr] 4d6', '[Kr] 4d5'],  // Ru
    45: ['[Kr] 4d8', '[Kr] 4d7', '[Kr] 4d6'],  // Rh
    46: ['[Kr] 4d9', '[Kr] 4d8', '[Kr] 4d7'],  // Pd
    47: ['[Kr] 4d10', '[Kr] 4d9', '[Kr] 4d8'],  // Ag
    48: ['[Kr] 4d10 5s1', '[Kr] 4d10', '[Kr] 4d9'],  // Cd
    49: ['[Kr] 4d10 5s2', '[Kr] 4d10 5s1', '[Kr] 4d10'],  // In
    50: ['[Kr] 4d10 5s2 5p1', '[Kr] 4d10 5s2', '[Kr] 4d10 5s1'],  // Sn
    51: ['[Kr] 4d10 5s2 5p2', '[Kr] 4d10 5s2 5p1', '[Kr] 4d10 5s2'],  // Sb
    52: ['[Kr] 4d10 5s2 5p3', '[Kr] 4d10 5s2 5p2', '[Kr] 4d10 5s2 5p1'],  // Te
    53: ['[Kr] 4d10 5s2 5p4', '[Kr] 4d10 5s2 5p3', '[Kr] 4d10 5s2 5p2'],  // I
    54: ['[Kr] 4d10 5s2 5p5', '[Kr] 4d10 5s2 5p4', '[Kr] 4d10 5s2 5p3'],  // Xe
    55: ['[Xe]'],  // Cs
    56: ['[Xe] 6s1', '[Xe]'],  // Ba
    57: ['[Xe] 5d2', '[Xe] 5d1', '[Xe]'],  // La
    58: ['[Xe] 4f1 5d2', '[Xe] 4f2', '[Xe] 4f1'],  // Ce
    59: ['[Xe] 4f3 6s1', '[Xe] 4f3', '[Xe] 4f2'],  // Pr
    60: ['[Xe] 4f4 6s1', '[Xe] 4f4', '[Xe] 4f3'],  // Nd
    61: ['[Xe] 4f5 6s1', '[Xe] 4f5', '[Xe] 4f4'],  // Pm
    62: ['[Xe] 4f6 6s1', '[Xe] 4f6', '[Xe] 4f5'],  // Sm
    63: ['[Xe] 4f7 6s1', '[Xe] 4f7', '[Xe] 4f6'],  // Eu
    64: ['[Xe] 4f7 5d1 6s1', '[Xe] 4f7 5d1', '[Xe] 4f7'],  // Gd
    65: ['[Xe] 4f9 6s1', '[Xe] 4f9', '[Xe] 4f8'],  // Tb
    66: ['[Xe] 4f10 6s1', '[Xe] 4f10', '[Xe] 4f9'],  // Dy
    67: ['[Xe] 4f11 6s1', '[Xe] 4f11', '[Xe] 4f10'],  // Ho
    68: ['[Xe] 4f12 6s1', '[Xe] 4f12', '[Xe] 4f11'],  // Er
    69: ['[Xe] 4f13 6s1', '[Xe] 4f13', '[Xe] 4f12'],  // Tm
    70: ['[Xe] 4f14 6s1', '[Xe] 4f14', '[Xe] 4f13'],  // Yb
    71: ['[Xe] 4f14 6s2', '[Xe] 4f14 6s1', '[Xe] 4f14'],  // Lu
    72: ['[Xe] 4f14 5d1 6s2', '[Xe] 4f14 5d2', '[Xe] 4f14 5d1'],  // Hf
    73: ['[Xe] 4f14 5d3 6s1', '[Xe] 4f14 5d3', '[Xe] 4f14 5d2'],  // Ta
    74: ['[Xe] 4f14 5d4 6s1', '[Xe] 4f14 5d4', '[Xe] 4f14 5d3'],  // W
    75: ['[Xe] 4f14 5d5 6s1', '[Xe] 4f14 5d5', '[Xe] 4f14 5d4'],  // Re
    76: ['[Xe] 4f14 5d6 6s1', '[Xe] 4f14 5d6', '[Xe] 4f14 5d5'],  // Os
    77: ['[Xe] 4f14 5d7 6s1', '[Xe] 4f14 5d7', '[Xe] 4f14 5d6'],  // Ir
    78: ['[Xe] 4f14 5d9', '[Xe] 4f14 5d8', '[Xe] 4f14 5d7'],  // Pt
    79: ['[Xe] 4f14 5d10', '[Xe] 4f14 5d9', '[Xe] 4f14 5d8'],  // Au
    80: ['[Xe] 4f14 5d10 6s1', '[Xe] 4f14 5d10', '[Xe] 4f14 5d9'],  // Hg
    81: ['[Xe] 4f14 5d10 6s2', '[Xe] 4f14 5d10 6s1', '[Xe] 4f14 5d10'],  // Tl
    82: ['[Xe] 4f14 5d10 6s2 6p1', '[Xe] 4f14 5d10 6s2', '[Xe] 4f14 5d10 6s1'],  // Pb
    83: ['[Xe] 4f14 5d10 6s2 6p2', '[Xe] 4f14 5d10 6s2 6p1', '[Xe] 4f14 5d10 6s2'],  // Bi
    84: ['[Xe] 4f14 5d10 6s2 6p3', '[Xe] 4f14 5d10 6s2 6p2', '[Xe] 4f14 5d10 6s2 6p1'],  // Po
    85: ['[Xe] 4f14 5d10 6s2 6p4', '[Xe] 4f14 5d10 6s2 6p3', '[Xe] 4f14 5d10 6s2 6p2'],  // At
    86: ['[Xe] 4f14 5d10 6s2 6p5', '[Xe] 4f14 5d10 6s2 6p4', '[Xe] 4f14 5d10 6s2 6p3'],  // Rn
    87: ['[Rn]'],  // Fr
    88: ['[Rn] 7s1', '[Rn]'],  // Ra
    89: ['[Rn] 7s2', '[Rn] 7s1', '[Rn]'],  // Ac
    90: ['[Rn] 6d1 7s2', '[Rn] 5f1 6d1', '[Rn] 5f1'],  // Th
    91: ['[Rn] 5f2 7s2', '[Rn] 5f2 6d1', '[Rn] 5f2'],  // Pa
    92: ['[Rn] 5f3 7s2', '[Rn] 5f4', '[Rn] 5f3'],  // U
    93: ['[Rn] 5f4 6d1 7s1', '[Rn] 5f5', '[Rn] 5f4'],  // Np
    94: ['[Rn] 5f6 7s1', '[Rn] 5f6', '[Rn] 5f5'],  // Pu
    95: ['[Rn] 5f7 7s1', '[Rn] 5f7', '[Rn] 5f6'],  // Am
    96: ['[Rn] 5f7 7s2', '[Rn] 5f8', '[Rn] 5f7'],  // Cm
    97: ['[Rn] 5f9 7s1', '[Rn] 5f9', '[Rn] 5f8'],  // Bk
    98: ['[Rn] 5f10 7s1', '[Rn] 5f10', '[Rn] 5f9'],  // Cf
    99: ['[Rn] 5f11 7s1', '[Rn] 5f11', '[Rn] 5f10'],  // Es
    100: ['[Rn] 5f12 7s1', '[Rn] 5f12', '[Rn] 5f11'],  // Fm
    101: ['[Rn] 5f13 7s1', '[Rn] 5f13', '[Rn] 5f12'],  // Md
    102: ['[Rn] 5f14 7s1', '[Rn] 5f14', '[Rn] 5f13'],  // No
    103: ['[Rn] 5f14 7s2', '[Rn] 5f14 7s1', '[Rn] 5f14'],  // Lr
    104: ['[Rn] 5f14 6d1 7s2', '[Rn] 5f14 7s2', '[Rn] 5f14 7s1'],  // Rf
    105: ['[Rn] 5f14 6d2 7s2', '[Rn] 5f14 6d2 7s1', '[Rn] 5f14 6d2'],  // Db
    106: ['[Rn] 5f14 6d3 7s2', '[Rn] 5f14 6d3 7s1', '[Rn] 5f14 6d3'],  // Sg
    107: ['[Rn] 5f14 6d4 7s2', '[Rn] 5f14 6d4 7s1', '[Rn] 5f14 6d4'],  // Bh
    108: ['[Rn] 5f14 6d5 7s2', '[Rn] 5f14 6d5 7s1', '[Rn] 5f14 6d4 7s1'],  // Hs
};

/** Most negative charge offered: hydrogen and group 14-17 elements with a positive electron affinity; -2 for group 16. */
const ANION_FLOOR: Readonly<Record<number, -1 | -2>> = {
    1: -1, 6: -1, 8: -2, 9: -1, 14: -1, 15: -1, 16: -2, 17: -1,
    32: -1, 33: -1, 34: -2, 35: -1, 50: -1, 51: -1, 52: -2, 53: -1,
    82: -1, 83: -1, 84: -2, 85: -1,
};

const NOBLE_GAS_Z = [2, 10, 18, 36, 54, 86];

export function maxCationCharge(Z: number): number {
    const coreZ = NOBLE_GAS_Z.filter(core => core < Z).pop() ?? 0;
    return Math.min(CATION_CONFIGURATIONS[Z]?.length ?? 0, Z - 1, Z - coreZ, MAX_CHARGE);
}

export function minAnionCharge(Z: number): number {
    return ANION_FLOOR[Z] ?? 0;
}

export function allowedCharges(Z: number): number[] {
    const charges: number[] = [];
    for (let q = minAnionCharge(Z); q <= maxCationCharge(Z); q++) charges.push(q);
    return charges;
}

/** Ground-state configuration of Z with the given charge, sorted by (n, l). Throws for a charge not offered. */
export function ionConfigurationFor(Z: number, charge: number): SubshellOccupancy[] {
    if (!allowedCharges(Z).includes(charge)) {
        throw new Error(`Charge ${charge} is not offered for Z=${Z}.`);
    }
    if (charge === 0) return configurationFor(Z);
    if (charge > 0) return parseConfiguration(CATION_CONFIGURATIONS[Z][charge - 1]);

    // Anion: the extra electrons complete the valence p subshell (1s for H).
    const configuration = configurationFor(Z).map(s => ({ ...s }));
    const valenceN = configuration.reduce((max, s) => Math.max(max, s.n), 0);
    const l = Z === 1 ? 0 : 1;
    const target = configuration.find(s => s.n === valenceN && s.l === l);
    if (target) target.electrons -= charge;
    else configuration.push({ n: valenceN, l, electrons: -charge });
    return configuration.sort((a, b) => (a.n - b.n) || (a.l - b.l));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest tests/atom/ion_configurations.test.ts tests/atom/configurations.test.ts`
Expected: PASS. If a NIST mismatch appears, the fixture is the authority: correct the table entry, never the test.

- [ ] **Step 6: Commit**

```bash
git add src/atom/ion_configurations.ts src/atom/configurations.ts tests/atom/ion_configurations.test.ts tests/atom/fixtures/nist_ion_ground_configurations.json
git commit -m "feat(atom): NIST-derived ion configurations, charge -2..+3 where sensible

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The species model

**Files:**
- Create: `src/atom/species.ts`
- Modify: `src/atom/configurations.ts` (configuration-based label helpers)
- Test: `tests/atom/species.test.ts`

**Interfaces:**
- Consumes: `ionConfigurationFor`, `allowedCharges` (Task 1); `SubshellOccupancy`, `subshellLabel` (configurations.ts); `elementFor` (`src/elements.ts`).
- Produces:
  ```ts
  // configurations.ts (the Z-based versions now delegate to these)
  export function shellsOf(configuration: SubshellOccupancy[]): ShellOccupancy[];
  export function configurationLabelOf(configuration: SubshellOccupancy[]): string;
  export function valenceShellOf(configuration: SubshellOccupancy[]): number;
  export function valenceConfigurationLabelOf(configuration: SubshellOccupancy[]): string;
  // species.ts
  export interface SubshellRef { n: number; l: number }
  export interface Excitation { from: SubshellRef; to: SubshellRef }
  export interface AtomSpecies { Z: number; charge: number; excitation: Excitation | null }
  export const MAX_EXCITATION_TARGETS = 4;
  export function neutralGround(Z: number): AtomSpecies;
  export function isNeutralGround(species: AtomSpecies): boolean;
  export function speciesKey(species: AtomSpecies): string;           // '11', '11+1', '17-1', '11:3s>3p'
  export function speciesConfiguration(species: AtomSpecies): SubshellOccupancy[];
  export function excitationSources(Z: number, charge: number): SubshellRef[];
  export function excitationTargets(Z: number, charge: number, from: SubshellRef): SubshellRef[];
  export function isValidExcitation(Z: number, charge: number, excitation: Excitation): boolean;
  export function chargeSuffix(charge: number): string;               // '', '⁺', '²⁺', '⁻', '²⁻'
  export function speciesSymbol(species: AtomSpecies): string;        // 'Na⁺', 'Na*'
  export function speciesTitle(species: AtomSpecies): string;         // 'Sodium', 'Sodium ion Na⁺', 'Sodium, excited 3s → 3p'
  export function excitationLabel(excitation: Excitation): string;    // '3s → 3p'
  export function encodeSpeciesParams(species: AtomSpecies): Record<string, string>;
  export function decodeSpeciesParams(Z: number, params: URLSearchParams): { charge: number; excitation: Excitation | null };
  ```

**Excite targets, decided:** sources are the occupied subshells of the outermost shell (C: 2s, 2p; Na: 3s; Fe: 4s); none for anions. Targets are subshells with n from (valence n − 1) to (valence n + 1), capped at 7, l ≤ 2, not full, not the source, strictly after the source in Madelung order ((n + l), then n); the first four. Na 3s → 3p, 4s, 3d, 4p (the D line first). Fe 4s → 3d, 4p, 5s, 4d. C 2s → 2p (the textbook promotion), 3s, 3p, 3d.

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/species.test.ts
import { configurationFor, configurationLabel, configurationLabelOf, shellsFor, shellsOf, valenceShellOf, valenceConfigurationLabelOf } from '../../src/atom/configurations';
import {
    neutralGround, isNeutralGround, speciesKey, speciesConfiguration, excitationSources, excitationTargets,
    isValidExcitation, chargeSuffix, speciesSymbol, speciesTitle, excitationLabel, encodeSpeciesParams, decodeSpeciesParams,
    AtomSpecies,
} from '../../src/atom/species';

const ref = (label: string) => ({ n: Number(label[0]), l: 'spdf'.indexOf(label[1]) });
const labels = (refs: Array<{ n: number; l: number }>) => refs.map(r => `${r.n}${'spdf'[r.l]}`);
const na3p: AtomSpecies = { Z: 11, charge: 0, excitation: { from: ref('3s'), to: ref('3p') } };

describe('configuration-based labels', () => {
    it('agree with the Z-based ones for neutral atoms', () => {
        for (const Z of [1, 6, 26, 79]) {
            expect(configurationLabelOf(configurationFor(Z))).toBe(configurationLabel(Z));
            expect(shellsOf(configurationFor(Z))).toEqual(shellsFor(Z));
        }
    });
    it('describe an excited atom by its own configuration', () => {
        const c = speciesConfiguration({ Z: 11, charge: 0, excitation: { from: ref('3s'), to: ref('4s') } });
        expect(shellsOf(c).map(s => s.n)).toEqual([1, 2, 4]);
        expect(valenceShellOf(c)).toBe(4);
        expect(valenceConfigurationLabelOf(c)).toBe('4s¹');
    });
});

describe('species', () => {
    it('keys a neutral ground state by Z alone, so existing cache keys do not change', () => {
        expect(speciesKey(neutralGround(26))).toBe('26');
        expect(speciesKey({ Z: 11, charge: 1, excitation: null })).toBe('11+1');
        expect(speciesKey({ Z: 17, charge: -1, excitation: null })).toBe('17-1');
        expect(speciesKey(na3p)).toBe('11:3s>3p');
        expect(speciesKey({ Z: 20, charge: 1, excitation: { from: ref('4s'), to: ref('4p') } })).toBe('20+1:4s>4p');
        expect(isNeutralGround(neutralGround(3))).toBe(true);
        expect(isNeutralGround(na3p)).toBe(false);
    });

    it('moves exactly one electron for an excitation', () => {
        expect(configurationLabelOf(speciesConfiguration(na3p))).toBe('1s² 2s² 2p⁶ 3p¹');
        expect(configurationLabelOf(speciesConfiguration({ Z: 6, charge: 0, excitation: { from: ref('2s'), to: ref('2p') } })))
            .toBe('1s² 2s¹ 2p³');
    });

    it('offers the outermost shell as the source, and the four next subshells as targets', () => {
        expect(labels(excitationSources(11, 0))).toEqual(['3s']);
        expect(labels(excitationTargets(11, 0, ref('3s')))).toEqual(['3p', '4s', '3d', '4p']);
        expect(labels(excitationSources(6, 0))).toEqual(['2s', '2p']);
        expect(labels(excitationTargets(6, 0, ref('2s')))).toEqual(['2p', '3s', '3p', '3d']);
        expect(labels(excitationTargets(26, 0, ref('4s')))).toEqual(['3d', '4p', '5s', '4d']);
        expect(labels(excitationTargets(10, 0, ref('2p')))).toEqual(['3s', '3p', '3d']);
        expect(excitationSources(17, -1)).toEqual([]);          // no excitation of an anion
    });

    it('validates an excitation against the species it would apply to', () => {
        expect(isValidExcitation(11, 0, { from: ref('3s'), to: ref('3p') })).toBe(true);
        expect(isValidExcitation(11, 0, { from: ref('2p'), to: ref('3p') })).toBe(false);  // not a source
        expect(isValidExcitation(11, 1, { from: ref('3s'), to: ref('3p') })).toBe(false);  // Na+ has no 3s
        expect(() => speciesConfiguration({ Z: 11, charge: 0, excitation: { from: ref('3s'), to: ref('9d') } })).toThrow();
    });

    it('labels charges and species the way chemistry writes them', () => {
        expect([0, 1, 2, 3, -1, -2].map(chargeSuffix)).toEqual(['', '⁺', '²⁺', '³⁺', '⁻', '²⁻']);
        expect(speciesSymbol({ Z: 26, charge: 2, excitation: null })).toBe('Fe²⁺');
        expect(speciesSymbol(na3p)).toBe('Na*');
        expect(speciesTitle(neutralGround(11))).toBe('Sodium');
        expect(speciesTitle({ Z: 17, charge: -1, excitation: null })).toBe('Chlorine ion Cl⁻');
        expect(speciesTitle(na3p)).toBe('Sodium, excited 3s → 3p');
        expect(excitationLabel(na3p.excitation!)).toBe('3s → 3p');
    });

    it('round-trips through URL parameters, writing nothing for the neutral ground state', () => {
        expect(encodeSpeciesParams(neutralGround(11))).toEqual({});
        const params = encodeSpeciesParams({ Z: 20, charge: 1, excitation: { from: ref('4s'), to: ref('4p') } });
        expect(params).toEqual({ charge: '1', excite: '4s-4p' });
        expect(decodeSpeciesParams(20, new URLSearchParams(params))).toEqual({ charge: 1, excitation: { from: ref('4s'), to: ref('4p') } });
    });

    it('decodeSpeciesParams ignores anything the element does not offer', () => {
        const neutral = { charge: 0, excitation: null };
        expect(decodeSpeciesParams(11, new URLSearchParams('charge=3'))).toEqual(neutral);
        expect(decodeSpeciesParams(11, new URLSearchParams('charge=abc'))).toEqual(neutral);
        expect(decodeSpeciesParams(11, new URLSearchParams('excite=3s-9z'))).toEqual(neutral);
        expect(decodeSpeciesParams(11, new URLSearchParams('charge=1&excite=3s-3p'))).toEqual({ charge: 1, excitation: null });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/atom/species.test.ts`
Expected: FAIL, "Cannot find module '../../src/atom/species'" (and missing `configurationLabelOf` export).

- [ ] **Step 3: Implement**

In `src/atom/configurations.ts`, add the configuration-based helpers and make the Z versions delegate (same output, so every existing test stays green):

```ts
/** shellsFor, for any configuration (an ion's, an excited atom's). */
export function shellsOf(configuration: SubshellOccupancy[]): ShellOccupancy[] {
    const shells: ShellOccupancy[] = [];
    for (const subshell of configuration) {
        let shell = shells[shells.length - 1];
        if (!shell || shell.n !== subshell.n) {
            shell = { n: subshell.n, electrons: 0, subshells: [] };
            shells.push(shell);
        }
        shell.subshells.push({ ...subshell });
        shell.electrons += subshell.electrons;
    }
    return shells;
}
export function shellsFor(Z: number): ShellOccupancy[] { return shellsOf(configurationFor(Z)); }

export function configurationLabelOf(configuration: SubshellOccupancy[]): string {
    return configuration.map(s => `${subshellLabel(s.n, s.l)}${superscript(s.electrons)}`).join(' ');
}
export function configurationLabel(Z: number): string { return configurationLabelOf(configurationFor(Z)); }

export function valenceShellOf(configuration: SubshellOccupancy[]): number {
    return configuration.reduce((highest, s) => Math.max(highest, s.n), 0);
}
export function valenceShellFor(Z: number): number { return valenceShellOf(configurationFor(Z)); }

export function valenceConfigurationLabelOf(configuration: SubshellOccupancy[]): string {
    const valenceN = valenceShellOf(configuration);
    return configurationLabelOf(configuration.filter(s => s.n === valenceN));
}
export function valenceConfigurationLabel(Z: number): string { return valenceConfigurationLabelOf(configurationFor(Z)); }
```
Replace the bodies of the existing `shellsFor`, `configurationLabel`, `valenceShellFor`, `valenceConfigurationLabel` with the one-line delegations above, keeping their doc comments. `valenceElectronsFor` is unchanged.

Create `src/atom/species.ts`:

```ts
/**
 * What atom mode solves: an element, a charge and at most one promoted
 * electron (spec §5 Phase 3). Everything downstream -- the SCF, both caches,
 * the worker protocol, the store, the URL -- is keyed by `speciesKey`, and a
 * neutral ground state's key is plain String(Z) so every cache key that
 * existed before ions did is unchanged.
 */
import { SubshellOccupancy, subshellLabel, valenceShellOf } from './configurations';
import { allowedCharges, ionConfigurationFor } from './ion_configurations';
import { elementFor } from '../elements';

export interface SubshellRef { n: number; l: number }
export interface Excitation { from: SubshellRef; to: SubshellRef }
export interface AtomSpecies { Z: number; charge: number; excitation: Excitation | null }

export const MAX_EXCITATION_TARGETS = 4;
const LETTERS = 'spdf';
const capacity = (l: number) => 2 * (2 * l + 1);
const madelung = ({ n, l }: SubshellRef) => (n + l) * 10 + n;
const same = (a: SubshellRef, b: SubshellRef) => a.n === b.n && a.l === b.l;
const refLabel = (r: SubshellRef) => subshellLabel(r.n, r.l);

export function neutralGround(Z: number): AtomSpecies { return { Z, charge: 0, excitation: null }; }
export function isNeutralGround(s: AtomSpecies): boolean { return s.charge === 0 && s.excitation === null; }

export function speciesKey(s: AtomSpecies): string {
    const charge = s.charge > 0 ? `+${s.charge}` : s.charge < 0 ? `${s.charge}` : '';
    const excitation = s.excitation ? `:${refLabel(s.excitation.from)}>${refLabel(s.excitation.to)}` : '';
    return `${s.Z}${charge}${excitation}`;
}

/** Occupied subshells of the outermost shell. None for an anion: its extra electron is barely held as it is. */
export function excitationSources(Z: number, charge: number): SubshellRef[] {
    if (charge < 0 || !allowedCharges(Z).includes(charge)) return [];
    const configuration = ionConfigurationFor(Z, charge);
    const valenceN = valenceShellOf(configuration);
    return configuration.filter(s => s.n === valenceN && s.electrons > 0).map(({ n, l }) => ({ n, l }));
}

export function excitationTargets(Z: number, charge: number, from: SubshellRef): SubshellRef[] {
    if (!excitationSources(Z, charge).some(s => same(s, from))) return [];
    const configuration = ionConfigurationFor(Z, charge);
    const valenceN = valenceShellOf(configuration);
    const candidates: SubshellRef[] = [];
    for (let n = Math.max(1, valenceN - 1); n <= Math.min(7, valenceN + 1); n++) {
        for (let l = 0; l <= Math.min(2, n - 1); l++) {
            const target = { n, l };
            if (same(target, from) || madelung(target) <= madelung(from)) continue;
            const occupied = configuration.find(s => same(s, target))?.electrons ?? 0;
            if (occupied < capacity(l)) candidates.push(target);
        }
    }
    return candidates.sort((a, b) => madelung(a) - madelung(b)).slice(0, MAX_EXCITATION_TARGETS);
}

export function isValidExcitation(Z: number, charge: number, excitation: Excitation): boolean {
    return excitationTargets(Z, charge, excitation.from).some(t => same(t, excitation.to));
}

/** The occupancies to solve, sorted by (n, l), zero-occupancy subshells dropped. */
export function speciesConfiguration(s: AtomSpecies): SubshellOccupancy[] {
    const configuration = ionConfigurationFor(s.Z, s.charge).map(sub => ({ ...sub }));
    if (!s.excitation) return configuration;
    if (!isValidExcitation(s.Z, s.charge, s.excitation)) {
        throw new Error(`${excitationLabel(s.excitation)} is not an excitation offered for ${speciesKey({ ...s, excitation: null })}.`);
    }
    const { from, to } = s.excitation;
    configuration.find(sub => same(sub, from))!.electrons -= 1;
    const target = configuration.find(sub => same(sub, to));
    if (target) target.electrons += 1;
    else configuration.push({ n: to.n, l: to.l, electrons: 1 });
    return configuration.filter(sub => sub.electrons > 0).sort((a, b) => (a.n - b.n) || (a.l - b.l));
}

const SUPERSCRIPT: Record<string, string> = { '1': '', '2': '²', '3': '³' };
export function chargeSuffix(charge: number): string {
    if (charge === 0) return '';
    return `${SUPERSCRIPT[String(Math.abs(charge))]}${charge > 0 ? '⁺' : '⁻'}`;
}

export function excitationLabel(e: Excitation): string { return `${refLabel(e.from)} → ${refLabel(e.to)}`; }

export function speciesSymbol(s: AtomSpecies): string {
    const symbol = elementFor(s.Z)?.symbol ?? `Z${s.Z}`;
    return `${symbol}${chargeSuffix(s.charge)}${s.excitation ? '*' : ''}`;
}

export function speciesTitle(s: AtomSpecies): string {
    const name = elementFor(s.Z)?.name ?? `Z = ${s.Z}`;
    if (s.excitation) return `${name}${s.charge !== 0 ? ` ion ${speciesSymbol({ ...s, excitation: null })}` : ''}, excited ${excitationLabel(s.excitation)}`;
    return s.charge === 0 ? name : `${name} ion ${speciesSymbol(s)}`;
}

/** For Phase 2's URL state: nothing is written for a neutral ground state. */
export function encodeSpeciesParams(s: AtomSpecies): Record<string, string> {
    const params: Record<string, string> = {};
    if (s.charge !== 0) params.charge = String(s.charge);
    if (s.excitation) params.excite = `${refLabel(s.excitation.from)}-${refLabel(s.excitation.to)}`;
    return params;
}

const parseRef = (text: string): SubshellRef | null => {
    const m = /^([1-7])([spdf])$/.exec(text);
    return m ? { n: Number(m[1]), l: LETTERS.indexOf(m[2]) } : null;
};

/** Anything the element does not offer is ignored, never thrown on (spec §4.3). */
export function decodeSpeciesParams(Z: number, params: URLSearchParams): { charge: number; excitation: Excitation | null } {
    const raw = params.get('charge');
    const parsed = raw !== null && /^-?\d$/.test(raw) ? Number(raw) : 0;
    const charge = allowedCharges(Z).includes(parsed) ? parsed : 0;
    const excite = params.get('excite')?.split('-');
    const from = excite && excite.length === 2 ? parseRef(excite[0]) : null;
    const to = excite && excite.length === 2 ? parseRef(excite[1]) : null;
    const excitation = from && to && isValidExcitation(Z, charge, { from, to }) ? { from, to } : null;
    return { charge, excitation };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/atom/species.test.ts tests/atom/configurations.test.ts tests/atom/valence.test.ts tests/atom/level_nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atom/species.ts src/atom/configurations.ts tests/atom/species.test.ts
git commit -m "feat(atom): species model -- charge, one promoted electron, keys and labels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: SCF on a configuration, `solveSpecies`, and the unbound-anion guard

**Files:**
- Create: `src/atom/scf_shared.ts` (helpers moved out of `scf.ts` verbatim, plus the guard)
- Modify: `src/atom/radial_solver.ts` (export `hasBoundState`)
- Modify: `src/atom/scf.ts`
- Test: `tests/atom/scf_species.test.ts`, `tests/atom/radial_solver.test.ts` (append)

**Interfaces:**
- Consumes: `speciesConfiguration`, `speciesKey`, `neutralGround`, `AtomSpecies` (Task 2).
- Produces:
  ```ts
  // radial_solver.ts
  export function hasBoundState(grid: RadialGrid, n: number, l: number, potential: Float64Array, below?: number): boolean;
  // scf_shared.ts
  export const ANION_BINDING_THRESHOLD = 1e-4;   // Ha
  export class UnboundAnionError extends Error { readonly n: number; readonly l: number }
  export function assertStatesBound(grid: RadialGrid, subshells: Array<{ n: number; l: number }>, potential: Float64Array): void;
  export { highestPrincipalQuantumNumber, totalElectronsOf, bareCoulombPotential, screenedStartingPotential, buildD, maxWeightedDelta,
           MAX_ITERATIONS, CONVERGENCE_TOLERANCE, INITIAL_BETA, MIN_BETA }
  // scf.ts
  export type SpinTreatment = 'restricted' | 'polarised';
  export interface ScfOptions { configuration?: SubshellOccupancy[] }   // Phase 4 adds relativity, startingPotential
  export interface AtomSolution { /* existing fields */ charge: number; configuration: SubshellOccupancy[] }
  export function solveAtomOnGrid(Z: number, grid: RadialGrid, options?: ScfOptions): AtomSolution;
  export function solveSpecies(species: AtomSpecies): AtomSolution;   // memoised by speciesKey
  export function solveAtom(Z: number): AtomSolution;                 // === solveSpecies(neutralGround(Z))
  ```

**The guard, decided.** For an anion only (electrons > Z; the neutral and cation paths are untouched), every iteration first checks, for each occupied subshell, that the current potential has a bound state with that (n, l) below −10⁻⁴ Ha, by the oscillation theorem: the outward solution at that energy must have more than n − l − 1 nodes. A state bound by less than 10⁻⁴ Ha has a decay length √(1/2ε) ≈ 70 a₀, beyond what `gridForAtom` holds for n ≤ 4, so "within 3 meV of the continuum" and "unbound" are the same verdict on this grid. After convergence the highest eigenvalue is checked against the same threshold. Either failure throws `UnboundAnionError`, whose message begins "LDA does not bind this anion".

- [ ] **Step 1: Write the failing tests**

Append to `tests/atom/radial_solver.test.ts` (it already has `coulomb(grid, Z)`):

```ts
import { hasBoundState } from '../../src/atom/radial_solver';

describe('hasBoundState', () => {
    it('finds hydrogen 1s, 2p and 4f in -1/r, and nothing in a repulsive +1/r', () => {
        const grid = gridForAtom(1, 4);
        const attractive = coulomb(grid, 1);
        expect(hasBoundState(grid, 1, 0, attractive)).toBe(true);
        expect(hasBoundState(grid, 2, 1, attractive)).toBe(true);
        expect(hasBoundState(grid, 4, 3, attractive)).toBe(true);
        const repulsive = attractive.map(v => -v);
        expect(hasBoundState(grid, 1, 0, repulsive)).toBe(false);
    });
});
```

```ts
// tests/atom/scf_species.test.ts
import { solveAtom, solveAtomOnGrid, solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { gridForAtom } from '../../src/atom/radial_grid';
import { buildAtomProfile } from '../../src/atom/atom_profile';
import { neutralGround, AtomSpecies } from '../../src/atom/species';
import { configurationLabelOf } from '../../src/atom/configurations';

jest.setTimeout(120000);
// Fe2+, Br/Br- and I/I- add ~45 s; gated like scf.test.ts.
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const itSlow = SLOW ? it : it.skip;

const ion = (Z: number, charge: number): AtomSpecies => ({ Z, charge, excitation: null });
const radii = (s: AtomSpecies) => {
    const profile = buildAtomProfile(solveSpecies(s), 0.9);
    return { contour: profile.contourRadius, display: profile.displayRadius };
};

describe('solveSpecies', () => {
    it('solveAtom(Z) is the neutral ground state, one cached object', () => {
        expect(solveSpecies(neutralGround(10))).toBe(solveAtom(10));
        expect(solveAtom(10).charge).toBe(0);
    });

    it('solves Na+ with ten electrons, and draws it smaller than Na (spec: Na+ < Na)', () => {
        const sodiumIon = solveSpecies(ion(11, 1));
        expect(sodiumIon.converged).toBe(true);
        expect(sodiumIon.charge).toBe(1);
        expect(sodiumIon.states.reduce((sum, s) => sum + s.electrons, 0)).toBe(10);
        const neutral = radii(neutralGround(11));
        const cation = radii(ion(11, 1));
        expect(cation.contour).toBeLessThan(neutral.contour);     // measured 1.284 < 1.944
        expect(cation.display).toBeLessThan(neutral.display);
    });

    it('solves one-electron species exactly, excited ones included', () => {
        expect(solveSpecies(ion(2, 1)).totalEnergy).toBeCloseTo(-2, 9);
        const li2 = solveAtomOnGrid(3, gridForAtom(3, 1), { configuration: [{ n: 1, l: 0, electrons: 1 }] });
        expect(li2.totalEnergy).toBeCloseTo(-4.5, 9);
        const h2p = solveSpecies({ Z: 1, charge: 0, excitation: { from: { n: 1, l: 0 }, to: { n: 2, l: 1 } } });
        expect(h2p.totalEnergy).toBeCloseTo(-0.125, 9);
        expect(h2p.states[0].energy).toBeCloseTo(-0.125, 6);
    });

    it('moves the electron for an excited state: Na 3s -> 3p converges with 3p occupied', () => {
        const excited = solveSpecies({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } });
        expect(excited.converged).toBe(true);
        expect(configurationLabelOf(excited.configuration)).toBe('1s² 2s² 2p⁶ 3p¹');
        expect(excited.totalEnergy).toBeGreaterThan(solveAtom(11).totalEnergy);
    });

    it('reports H- and Cl- as unbound in LDA instead of returning a picture', () => {
        for (const [Z, n, l] of [[1, 1, 0], [17, 3, 1]] as const) {
            let caught: unknown;
            try { solveSpecies(ion(Z, -1)); } catch (error) { caught = error; }
            expect(caught).toBeInstanceOf(UnboundAnionError);
            expect((caught as UnboundAnionError).message).toMatch(/^LDA does not bind this anion/);
            expect([(caught as UnboundAnionError).n, (caught as UnboundAnionError).l]).toEqual([n, l]);
        }
    });

    it('refuses a configuration with no electrons', () => {
        expect(() => solveAtomOnGrid(1, gridForAtom(1), { configuration: [] })).toThrow(/no electrons/);
    });

    itSlow('solves Fe2+ as [Ar] 3d6', () => {
        const fe2 = solveSpecies(ion(26, 2));
        expect(fe2.converged).toBe(true);
        expect(configurationLabelOf(fe2.configuration)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶');
    });

    itSlow('orders radii Br < Br- and I < I- where LDA binds them (spec: X < X- where bound)', () => {
        for (const Z of [35, 53]) {
            const neutral = radii(neutralGround(Z));
            const anion = radii(ion(Z, -1));
            expect(anion.contour).toBeGreaterThan(neutral.contour);   // measured Br 2.088 > 1.874, I 2.014 > 1.820
            expect(anion.display).toBeGreaterThan(neutral.display);
        }
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/atom/scf_species.test.ts tests/atom/radial_solver.test.ts`
Expected: FAIL, "hasBoundState is not a function" / "Cannot find module '../../src/atom/scf_shared'".

- [ ] **Step 3: Add `hasBoundState` to `radial_solver.ts`** (after `solveRadialState`; it reuses the file's private `buildG`, `matchIndex`, `countNodesForBracketing`):

```ts
/**
 * Whether `potential` holds a bound (n, l) state below `below` Hartree --
 * the oscillation theorem again: the outward regular solution at that
 * energy has exactly as many nodes as there are eigenvalues beneath it, so
 * more than n - l - 1 nodes means the (n, l) state lies below. Used by the
 * SCF's anion guard, where the extra electron's state can leave the bound
 * spectrum mid-iteration and solveRadialState (which only searches E < 0)
 * would otherwise return a nonsense state rather than fail.
 */
export function hasBoundState(
    grid: RadialGrid, n: number, l: number, potential: Float64Array, below: number = -1e-4
): boolean {
    const g = buildG(grid, l, potential, below);
    return countNodesForBracketing(grid, g, l, matchIndex(g)) > n - l - 1;
}
```

- [ ] **Step 4: Create `src/atom/scf_shared.ts`** by moving, **unchanged, with their doc comments**, from `scf.ts`: `MAX_ITERATIONS`, `CONVERGENCE_TOLERANCE`, `INITIAL_BETA`, `MIN_BETA` (and their comments), `highestPrincipalQuantumNumber`, `totalElectronsOf`, `bareCoulombPotential`, `screenedStartingPotential`, `buildD`, `maxWeightedDelta`, each now `export`ed. Then append:

```ts
import { hasBoundState } from './radial_solver';
import { subshellLabel } from './configurations';

/** An anion's electron bound by less than this (Ha) counts as unbound: its ~70 a0 decay length does not fit the grid. */
export const ANION_BINDING_THRESHOLD = 1e-4;

/**
 * LDA's self-interaction leaves an anion's outermost electron facing a
 * +1/r tail (the Hartree term counts all N = Z + 1 electrons, itself
 * included), and for most anions no bound state survives it. Spec §3.5:
 * that verdict is shown, never drawn around.
 */
export class UnboundAnionError extends Error {
    readonly n: number;
    readonly l: number;
    constructor(n: number, l: number) {
        super(`LDA does not bind this anion: its ${subshellLabel(n, l)} electron has no bound state (eigenvalue ≥ 0).`);
        this.name = 'UnboundAnionError';
        this.n = n;
        this.l = l;
        Object.setPrototypeOf(this, UnboundAnionError.prototype);
    }
}

export function assertStatesBound(grid: RadialGrid, subshells: Array<{ n: number; l: number }>, potential: Float64Array): void {
    for (const { n, l } of subshells) {
        if (!hasBoundState(grid, n, l, potential, -ANION_BINDING_THRESHOLD)) throw new UnboundAnionError(n, l);
    }
}
```
(Add `import { RadialGrid } from './radial_grid'; import { RadialState } from './radial_solver';` as the moved `buildD` and `maxWeightedDelta` need them.) In `scf.ts`, delete the moved definitions and import them from `./scf_shared`.

- [ ] **Step 5: Generalise `scf.ts`**

Change the imports to add `import { AtomSpecies, neutralGround, speciesConfiguration, speciesKey } from './species';` and the `scf_shared` names above. Extend `AtomSolution` and add the options type:

```ts
export interface AtomSolution {
    Z: number;
    /** Z minus the electron count: 0 for a neutral atom, +1 for Na+, -1 for Br-. */
    charge: number;
    /** The occupancies actually solved, sorted by (n, l) -- an ion's or an excited atom's own. */
    configuration: SubshellOccupancy[];
    grid: RadialGrid;
    /** One entry per occupied subshell, ordered by (n, l). */
    states: Array<RadialState & { electrons: number }>;
    /** Converged total radial distribution, D(r) = sum over occupied of occ*u^2. */
    D: Float64Array;
    density: Float64Array;
    potential: Float64Array;
    totalEnergy: number;
    iterations: number;
    converged: boolean;
}

/**
 * Options for one SCF solve. An object rather than more positional
 * parameters so later physics layers on without another signature change:
 * Phase 4 adds `relativity` and `startingPotential` here.
 */
export interface ScfOptions {
    /** Defaults to the neutral ground state, configurationFor(Z). */
    configuration?: SubshellOccupancy[];
}
```

In `solveOneElectronAtom`, find the one occupied subshell and use its own n (the old `-(Z*Z)/2` was only right for 1s, and an excited hydrogen is now reachable):

```ts
function solveOneElectronAtom(Z: number, grid: RadialGrid, configuration: SubshellOccupancy[]): AtomSolution {
    const subshell = configuration.find(s => s.electrons > 0)!;
    const potential = bareCoulombPotential(grid, Z);
    const state = solveRadialState(grid, subshell.n, subshell.l, potential);
    const states = [{ ...state, electrons: subshell.electrons }];
    const D = buildD(grid, states);
    const density = densityFromD(grid, D);
    return {
        Z, charge: Z - 1, configuration, grid, states, D, density, potential,
        // Exact: E = -Z^2 / (2 n^2) for any l.
        totalEnergy: -(Z * Z) / (2 * subshell.n * subshell.n),
        iterations: 1,
        converged: true,
    };
}
```

Replace the cache, `solveAtom` and the head of `solveAtomOnGrid`:

```ts
// Ruling R28, generalised from Z to species: a species' LDA solution is a
// pure function of its key (same configuration, same grid, same loop), so
// this cache can never go stale. A neutral ground state's key is String(Z),
// and solveAtom goes through here, so solveAtom(Z) keeps returning one
// memoised object exactly as before.
const solveSpeciesCache = new Map<string, AtomSolution>();

export function solveSpecies(species: AtomSpecies): AtomSolution {
    const key = speciesKey(species);
    const cached = solveSpeciesCache.get(key);
    if (cached) return cached;
    const configuration = speciesConfiguration(species);
    const grid = gridForAtom(species.Z, highestPrincipalQuantumNumber(configuration));
    const solution = solveAtomOnGrid(species.Z, grid, { configuration });
    solveSpeciesCache.set(key, solution);
    return solution;
}

/** Neutral ground state of Z (unchanged behaviour; see solveSpecies). */
export function solveAtom(Z: number): AtomSolution {
    return solveSpecies(neutralGround(Z));
}

export function solveAtomOnGrid(Z: number, grid: RadialGrid, options: ScfOptions = {}): AtomSolution {
    const configuration = (options.configuration ?? configurationFor(Z)).filter(s => s.electrons > 0);
    const electrons = totalElectronsOf(configuration);
    if (electrons === 0) throw new Error(`Z=${Z} with no electrons has nothing to solve.`);
    if (electrons === 1) return solveOneElectronAtom(Z, grid, configuration);
    // Only an anion can lose its outermost bound state (see UnboundAnionError);
    // neutral atoms and cations run exactly the loop they always have.
    const isAnion = electrons > Z;
```
Keep the rest of the loop, with two insertions and the return:
- first statement inside the `for` loop: `if (isAnion) assertStatesBound(grid, configuration, potential);`
- after the loop, before computing `density`:
  ```ts
  if (isAnion && converged) {
      const highest = states.reduce((top, s) => (s.energy > top.energy ? s : top), states[0]);
      if (highest.energy >= -ANION_BINDING_THRESHOLD) throw new UnboundAnionError(highest.n, highest.l);
  }
  ```
- `return { Z, charge: Z - electrons, configuration, grid, states, D, density, potential, totalEnergy, iterations, converged };`

The loop's `configuration.map(subshell => ...)` now maps over the filtered options configuration. `solveAtomOnGrid(Z, grid)` with two arguments behaves exactly as before, so `scf.test.ts`'s grid-convergence test is unchanged.

- [ ] **Step 6: Run to verify they pass**

Run: `npx jest tests/atom/scf_species.test.ts tests/atom/radial_solver.test.ts tests/atom/scf.test.ts tests/atom/atom_worker_contract.test.ts`
Expected: PASS (~35 s; the NIST LDA benchmark in `scf.test.ts` proves the neutral path unchanged).
Run: `ATOM_SLOW_TESTS=1 npx jest tests/atom/scf_species.test.ts`
Expected: PASS (~75 s).
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/atom/scf.ts src/atom/scf_shared.ts src/atom/radial_solver.ts tests/atom/scf_species.test.ts tests/atom/radial_solver.test.ts
git commit -m "feat(atom): solve any configuration; detect anions LDA cannot bind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Spin-polarised exchange and VWN5 correlation

**Files:**
- Modify: `src/atom/correlation.ts`, `src/atom/hartree.ts`
- Test: `tests/atom/spin_xc.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // correlation.ts
  export interface SpinCorrelation { epsilon: number; vUp: number; vDown: number }   // eps per electron, Ha
  export function spinCorrelation(rhoUp: number, rhoDown: number): SpinCorrelation;
  // hartree.ts
  export function spinExchangePotential(densitySigma: Float64Array): Float64Array;       // -(6 rho_s / pi)^(1/3)
  export function spinExchangeEnergyDensity(densitySigma: Float64Array): Float64Array;   // per electron of that spin
  ```

**Physics.** Exchange scales exactly with spin: E_x[ρ↑, ρ↓] = ½(E_x[2ρ↑] + E_x[2ρ↓]), so v_x,σ = −(6ρ_σ/π)^{1/3}. Correlation is VWN5's spin interpolation:
ε_c(r_s, ζ) = ε_P + α_c f(ζ)/f″(0) (1 − ζ⁴) + (ε_F − ε_P) f(ζ) ζ⁴, with f(ζ) = [(1+ζ)^{4/3} + (1−ζ)^{4/3} − 2]/(2^{4/3} − 2), f″(0) = 8/[9(2^{4/3} − 2)].
Each of ε_P, ε_F, α_c is the same VWN form G(x; A, x₀, b, c), x = √r_s:
P: A = 0.0310907, x₀ = −0.10498, b = 3.72744, c = 12.9352 (the existing constants);
F: A = 0.01554535, x₀ = −0.32500, b = 7.06042, c = 18.0578;
α: A = −1/(6π²), x₀ = −0.0047584, b = 1.13107, c = 13.0045.
Potentials: v_σ = ε_c − (x/6) ∂ε_c/∂x + (s_σ − ζ) ∂ε_c/∂ζ, s↑ = +1, s↓ = −1.
These F and α constants are verified end to end in Task 5 by reproducing NIST's LSD total energies to 10⁻⁵; the unit tests below pin the functional's internal consistency.

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/spin_xc.test.ts
import { spinCorrelation, correlationEnergyDensity, correlationPotential } from '../../src/atom/correlation';
import { spinExchangePotential, spinExchangeEnergyDensity, exchangePotential } from '../../src/atom/hartree';

describe('spin-polarised exchange-correlation', () => {
    it.each([1e-4, 0.03, 1, 40])('reduces to the unpolarised VWN5 at zeta = 0 (rho = %p)', rho => {
        const c = spinCorrelation(rho / 2, rho / 2);
        expect(c.epsilon).toBeCloseTo(correlationEnergyDensity(rho), 12);
        expect(c.vUp).toBeCloseTo(correlationPotential(rho), 10);
        expect(c.vDown).toBeCloseTo(correlationPotential(rho), 10);
    });

    it.each([[0.3, 0.1], [0.02, 0.005], [5, 1], [0.4, 0]])('its potentials are the derivatives of its energy (%p, %p)', (up, down) => {
        const energy = (u: number, d: number) => (u + d) * spinCorrelation(u, d).epsilon;
        const h = 1e-6 * (up + down);
        const c = spinCorrelation(up, down);
        expect(c.vUp).toBeCloseTo((energy(up + h, down) - energy(up - h, down)) / (2 * h), 6);
        if (down > h) expect(c.vDown).toBeCloseTo((energy(up, down + h) - energy(up, down - h)) / (2 * h), 6);
    });

    it('treats the two spins symmetrically and polarisation as costing correlation energy', () => {
        const a = spinCorrelation(0.2, 0.05);
        const b = spinCorrelation(0.05, 0.2);
        expect(a.epsilon).toBeCloseTo(b.epsilon, 14);
        expect(a.vUp).toBeCloseTo(b.vDown, 14);
        expect(spinCorrelation(0.25, 0).epsilon).toBeGreaterThan(spinCorrelation(0.125, 0.125).epsilon);
    });

    it('returns zeros, never NaN, at zero or underflowing density', () => {
        for (const [u, d] of [[0, 0], [1e-320, 0], [0, 1e-320]]) {
            const c = spinCorrelation(u, d);
            expect([c.epsilon, c.vUp, c.vDown].every(Number.isFinite)).toBe(true);
        }
    });

    it('spin exchange of half the density equals unpolarised exchange of the whole', () => {
        const rho = Float64Array.from([1e-6, 0.01, 1, 100]);
        const half = rho.map(v => v / 2);
        const vs = spinExchangePotential(half);
        const v = exchangePotential(rho);
        for (let j = 0; j < rho.length; j++) expect(vs[j]).toBeCloseTo(v[j], 12);
        const eps = spinExchangeEnergyDensity(half);
        for (let j = 0; j < rho.length; j++) expect(eps[j]).toBeCloseTo(0.75 * v[j], 12);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/atom/spin_xc.test.ts`
Expected: FAIL, "spinCorrelation is not a function".

- [ ] **Step 3: Implement**

Append to `src/atom/correlation.ts` (the existing functions stay byte-identical):

```ts
/**
 * VWN5 with spin polarisation, for the ΔSCF energies only (Phase 3).
 * Restricted LDA misses the exchange-correlation energy of unpaired spins,
 * which differs between an atom and its ion (O has two, O+ three) and put
 * oxygen's ΔSCF ionisation energy 22 % high. Pictures keep the restricted,
 * NIST-validated functional above.
 */
interface VwnParameters { A: number; x0: number; b: number; c: number }
const PARAMAGNETIC: VwnParameters = { A: 0.0310907, x0: -0.10498, b: 3.72744, c: 12.9352 };
const FERROMAGNETIC: VwnParameters = { A: 0.01554535, x0: -0.325, b: 7.06042, c: 18.0578 };
const SPIN_STIFFNESS: VwnParameters = { A: -1 / (6 * Math.PI * Math.PI), x0: -0.0047584, b: 1.13107, c: 13.0045 };

function vwnG(x: number, p: VwnParameters): number {
    const X = x * x + p.b * x + p.c;
    const X0 = p.x0 * p.x0 + p.b * p.x0 + p.c;
    const Q = Math.sqrt(4 * p.c - p.b * p.b);
    const atanTerm = Math.atan(Q / (2 * x + p.b));
    return p.A * (
        Math.log((x * x) / X) + ((2 * p.b) / Q) * atanTerm
        - ((p.b * p.x0) / X0) * (Math.log(((x - p.x0) * (x - p.x0)) / X) + ((2 * (p.b + 2 * p.x0)) / Q) * atanTerm)
    );
}

function vwnGDerivative(x: number, p: VwnParameters): number {
    const X = x * x + p.b * x + p.c;
    const X0 = p.x0 * p.x0 + p.b * p.x0 + p.c;
    return p.A * (
        2 / x - (2 * x + p.b) / X - p.b / X
        - ((p.b * p.x0) / X0) * (2 / (x - p.x0) - (2 * x + p.b) / X - (p.b + 2 * p.x0) / X)
    );
}

const F_DENOMINATOR = Math.pow(2, 4 / 3) - 2;
const F_SECOND_DERIVATIVE_AT_0 = 8 / (9 * F_DENOMINATOR);
const spinF = (z: number) => (Math.pow(1 + z, 4 / 3) + Math.pow(1 - z, 4 / 3) - 2) / F_DENOMINATOR;
const spinFDerivative = (z: number) => (4 / 3) * (Math.cbrt(1 + z) - Math.cbrt(1 - z)) / F_DENOMINATOR;

export interface SpinCorrelation { epsilon: number; vUp: number; vDown: number }

export function spinCorrelation(rhoUp: number, rhoDown: number): SpinCorrelation {
    const up = Math.max(rhoUp, 0);
    const down = Math.max(rhoDown, 0);
    const rho = up + down;
    if (!(rho > 0)) return { epsilon: 0, vUp: 0, vDown: 0 };
    const x = xFromDensity(rho);
    if (!Number.isFinite(x)) return { epsilon: 0, vUp: 0, vDown: 0 };
    const zeta = Math.max(-1, Math.min(1, (up - down) / rho));

    const eP = vwnG(x, PARAMAGNETIC), dP = vwnGDerivative(x, PARAMAGNETIC);
    const eF = vwnG(x, FERROMAGNETIC), dF = vwnGDerivative(x, FERROMAGNETIC);
    const a = vwnG(x, SPIN_STIFFNESS), dA = vwnGDerivative(x, SPIN_STIFFNESS);
    const f = spinF(zeta), fPrime = spinFDerivative(zeta);
    const z3 = zeta * zeta * zeta, z4 = z3 * zeta;

    const epsilon = eP + a * (f / F_SECOND_DERIVATIVE_AT_0) * (1 - z4) + (eF - eP) * f * z4;
    const dEpsDx = dP + dA * (f / F_SECOND_DERIVATIVE_AT_0) * (1 - z4) + (dF - dP) * f * z4;
    const dEpsDz = (a / F_SECOND_DERIVATIVE_AT_0) * (fPrime * (1 - z4) - 4 * z3 * f) + (eF - eP) * (fPrime * z4 + 4 * z3 * f);
    const common = epsilon - (x / 6) * dEpsDx;
    return { epsilon, vUp: common + (1 - zeta) * dEpsDz, vDown: common - (1 + zeta) * dEpsDz };
}
```

Append to `src/atom/hartree.ts`:

```ts
const SPIN_EXCHANGE_COEFFICIENT = Math.pow(6 / Math.PI, 1 / 3);

/** Exchange for one spin channel: E_x[up, down] = (E_x[2 up] + E_x[2 down]) / 2 gives V_x,s = -(6 rho_s / pi)^(1/3). */
export function spinExchangePotential(densitySigma: Float64Array): Float64Array {
    const v = new Float64Array(densitySigma.length);
    for (let j = 0; j < densitySigma.length; j++) v[j] = -SPIN_EXCHANGE_COEFFICIENT * Math.cbrt(Math.max(densitySigma[j], 0));
    return v;
}

/** Exchange energy per electron of that spin channel, -(3/4)(6 rho_s / pi)^(1/3). */
export function spinExchangeEnergyDensity(densitySigma: Float64Array): Float64Array {
    const eps = new Float64Array(densitySigma.length);
    for (let j = 0; j < densitySigma.length; j++) eps[j] = -0.75 * SPIN_EXCHANGE_COEFFICIENT * Math.cbrt(Math.max(densitySigma[j], 0));
    return eps;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/atom/spin_xc.test.ts tests/atom/correlation.test.ts tests/atom/hartree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atom/correlation.ts src/atom/hartree.ts tests/atom/spin_xc.test.ts
git commit -m "feat(atom): spin-polarised Slater exchange and VWN5 correlation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Spin-polarised SCF for total energies

**Files:**
- Create: `src/atom/spin_scf.ts`
- Test: `tests/atom/spin_scf.test.ts`

**Interfaces:**
- Consumes: Task 3's `scf_shared.ts` helpers, `assertStatesBound`, `UnboundAnionError`, `ANION_BINDING_THRESHOLD`; Task 4's `spinCorrelation`, `spinExchangePotential`, `spinExchangeEnergyDensity`; `hartreePotential`, `hartreeEnergy`, `densityFromD` (hartree.ts); `integrateOnGrid`, `gridForAtom`.
- Produces:
  ```ts
  export interface SpinOccupancy { n: number; l: number; up: number; down: number }
  export interface PolarisedSolution { Z: number; charge: number; totalEnergy: number; converged: boolean; iterations: number; highestEigenvalue: number | null }
  export function spinOccupations(configuration: SubshellOccupancy[]): SpinOccupancy[];   // Hund: up = min(k, 2l+1)
  export function solvePolarisedOnGrid(Z: number, grid: RadialGrid, configuration: SubshellOccupancy[]): PolarisedSolution;
  export function solvePolarised(Z: number, configuration: SubshellOccupancy[]): PolarisedSolution;   // grid from gridForAtom
  ```

**Scope, decided.** This loop produces total energies for ΔSCF and nothing else: no profile, no picture. That keeps every drawn density on the NIST-LDA-validated restricted path and keeps `AtomSolution`'s "one state per subshell" contract intact. Open subshells take Hund's-rule maximum spin, spherically averaged per spin channel — the occupation NIST SRD 141's LSD column uses.

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/spin_scf.test.ts
import { spinOccupations, solvePolarised } from '../../src/atom/spin_scf';
import { solveAtom } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { configurationFor, parseConfiguration } from '../../src/atom/configurations';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';

jest.setTimeout(120000);

// NIST SRD 141 (Kotochigova et al., Phys. Rev. A 55, 191 (1997)), LSD column, retrieved 2026-09-25.
const NIST_LSD = { O: -74.527410, 'O+': -74.016721 };
const TOTAL_ENERGY_TOLERANCE = 1e-5;   // the same 0.001 % the restricted NIST benchmark uses

describe('spin-polarised SCF', () => {
    it('occupies open subshells by Hund\'s rule', () => {
        const byLabel = (c: ReturnType<typeof spinOccupations>) => c.map(s => `${s.n}${'spdf'[s.l]}:${s.up}/${s.down}`);
        expect(byLabel(spinOccupations(configurationFor(8)))).toEqual(['1s:1/1', '2s:1/1', '2p:3/1']);
        expect(byLabel(spinOccupations(configurationFor(7)))).toContain('2p:3/0');
        expect(byLabel(spinOccupations(parseConfiguration('[Ar] 3d6')))).toContain('3d:5/1');
    });

    it('equals the restricted energy for a closed shell (He)', () => {
        expect(solvePolarised(2, configurationFor(2)).totalEnergy).toBeCloseTo(solveAtom(2).totalEnergy, 7);
    });

    it('reproduces NIST LSD for O and O+ (the case restricted LDA gets 22 % wrong)', () => {
        const o = solvePolarised(8, configurationFor(8));
        const oPlus = solvePolarised(8, ionConfigurationFor(8, 1));
        expect(o.converged && oPlus.converged).toBe(true);
        expect(Math.abs((o.totalEnergy - NIST_LSD.O) / NIST_LSD.O)).toBeLessThan(TOTAL_ENERGY_TOLERANCE);
        expect(Math.abs((oPlus.totalEnergy - NIST_LSD['O+']) / NIST_LSD['O+'])).toBeLessThan(TOTAL_ENERGY_TOLERANCE);
    });

    it('is exact for one electron and zero for none', () => {
        expect(solvePolarised(1, configurationFor(1)).totalEnergy).toBeCloseTo(-0.5, 12);
        expect(solvePolarised(3, [{ n: 2, l: 1, electrons: 1 }]).totalEnergy).toBeCloseTo(-9 / 8, 12);
        expect(solvePolarised(1, []).totalEnergy).toBe(0);
    });

    it('reports an unbound anion the same way the restricted solver does', () => {
        expect(() => solvePolarised(17, ionConfigurationFor(17, -1))).toThrow(UnboundAnionError);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/atom/spin_scf.test.ts`
Expected: FAIL, "Cannot find module '../../src/atom/spin_scf'".

- [ ] **Step 3: Implement**

```ts
// src/atom/spin_scf.ts
/**
 * The spin-polarised (LSD) central-field SCF, used only for ΔSCF total
 * energies (delta_scf.ts). Same grid, same radial solver, same adaptive
 * mixing as scf.ts; two potentials instead of one, because a spin-up
 * electron's exchange hole is made of spin-up electrons only.
 */
import { RadialGrid, gridForAtom, integrateOnGrid } from './radial_grid';
import { RadialState, solveRadialState } from './radial_solver';
import { SubshellOccupancy } from './configurations';
import { hartreePotential, hartreeEnergy, densityFromD, spinExchangePotential, spinExchangeEnergyDensity } from './hartree';
import { spinCorrelation } from './correlation';
import {
    ANION_BINDING_THRESHOLD, UnboundAnionError, assertStatesBound, buildD, highestPrincipalQuantumNumber, maxWeightedDelta,
    screenedStartingPotential, totalElectronsOf, CONVERGENCE_TOLERANCE, INITIAL_BETA, MAX_ITERATIONS, MIN_BETA,
} from './scf_shared';

export interface SpinOccupancy { n: number; l: number; up: number; down: number }
export interface PolarisedSolution {
    Z: number;
    charge: number;
    totalEnergy: number;
    converged: boolean;
    iterations: number;
    highestEigenvalue: number | null;
}

/** Hund's rule, spherically averaged: fill one spin before the other. */
export function spinOccupations(configuration: SubshellOccupancy[]): SpinOccupancy[] {
    return configuration.filter(s => s.electrons > 0).map(({ n, l, electrons }) => {
        const up = Math.min(electrons, 2 * l + 1);
        return { n, l, up, down: electrons - up };
    });
}

type Channel = Array<RadialState & { electrons: number }>;

function polarisedPotentials(grid: RadialGrid, Z: number, DUp: Float64Array, DDown: Float64Array) {
    const D = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) D[j] = DUp[j] + DDown[j];
    const nUp = densityFromD(grid, DUp);
    const nDown = densityFromD(grid, DDown);
    const vHartree = hartreePotential(grid, D);
    const vxUp = spinExchangePotential(nUp);
    const vxDown = spinExchangePotential(nDown);
    const up = new Float64Array(grid.size);
    const down = new Float64Array(grid.size);
    const vcUp = new Float64Array(grid.size);
    const vcDown = new Float64Array(grid.size);
    const epsC = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const c = spinCorrelation(nUp[j], nDown[j]);
        vcUp[j] = c.vUp; vcDown[j] = c.vDown; epsC[j] = c.epsilon;
        const common = -Z / grid.r[j] + vHartree[j];
        up[j] = common + vxUp[j] + c.vUp;
        down[j] = common + vxDown[j] + c.vDown;
    }
    return { up, down, D, nUp, nDown, vHartree, vxUp, vxDown, vcUp, vcDown, epsC };
}

export function solvePolarisedOnGrid(Z: number, grid: RadialGrid, configuration: SubshellOccupancy[]): PolarisedSolution {
    const occupied = configuration.filter(s => s.electrons > 0);
    const electrons = totalElectronsOf(occupied);
    const charge = Z - electrons;
    if (electrons === 0) return { Z, charge, totalEnergy: 0, converged: true, iterations: 0, highestEigenvalue: null };
    if (electrons === 1) {
        // The one-electron bypass (HANDOFF): exact, no self-interaction.
        const n = occupied[0].n;
        return { Z, charge, totalEnergy: -(Z * Z) / (2 * n * n), converged: true, iterations: 1, highestEigenvalue: -(Z * Z) / (2 * n * n) };
    }
    const isAnion = charge < 0;
    const channels = spinOccupations(occupied);
    const upSpecs = channels.filter(c => c.up > 0);
    const downSpecs = channels.filter(c => c.down > 0);

    let vUp = screenedStartingPotential(grid, Z);
    let vDown = vUp.slice();
    let beta = INITIAL_BETA;
    let previousDelta = Infinity;
    let upStates: Channel = [];
    let downStates: Channel = [];
    let converged = false;
    let iterations = 0;

    for (iterations = 1; iterations <= MAX_ITERATIONS; iterations++) {
        if (isAnion) { assertStatesBound(grid, upSpecs, vUp); assertStatesBound(grid, downSpecs, vDown); }
        upStates = upSpecs.map(c => ({ ...solveRadialState(grid, c.n, c.l, vUp), electrons: c.up }));
        downStates = downSpecs.map(c => ({ ...solveRadialState(grid, c.n, c.l, vDown), electrons: c.down }));
        const next = polarisedPotentials(grid, Z, buildD(grid, upStates), buildD(grid, downStates));
        const delta = Math.max(maxWeightedDelta(grid, vUp, next.up), maxWeightedDelta(grid, vDown, next.down));
        if (delta < CONVERGENCE_TOLERANCE) { converged = true; vUp = next.up; vDown = next.down; break; }
        if (delta > previousDelta) beta = Math.max(beta * 0.5, MIN_BETA);
        previousDelta = delta;
        const mixedUp = new Float64Array(grid.size);
        const mixedDown = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) {
            mixedUp[j] = (1 - beta) * vUp[j] + beta * next.up[j];
            mixedDown[j] = (1 - beta) * vDown[j] + beta * next.down[j];
        }
        vUp = mixedUp;
        vDown = mixedDown;
    }

    const all = [...upStates, ...downStates];
    const highest = all.reduce((top, s) => (s.energy > top.energy ? s : top), all[0]);
    if (isAnion && converged && highest.energy >= -ANION_BINDING_THRESHOLD) throw new UnboundAnionError(highest.n, highest.l);

    // E = sum(occ eps) - E_H - integral(sum_s D_s V_xc,s) + E_x + E_c, the restricted bookkeeping per spin.
    const DUp = buildD(grid, upStates);
    const DDown = buildD(grid, downStates);
    const f = polarisedPotentials(grid, Z, DUp, DDown);
    const epsXUp = spinExchangeEnergyDensity(f.nUp);
    const epsXDown = spinExchangeEnergyDensity(f.nDown);
    const doubleCounted = new Float64Array(grid.size);
    const exchangeCorrelation = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        doubleCounted[j] = DUp[j] * (f.vxUp[j] + f.vcUp[j]) + DDown[j] * (f.vxDown[j] + f.vcDown[j]);
        exchangeCorrelation[j] = DUp[j] * epsXUp[j] + DDown[j] * epsXDown[j] + f.D[j] * f.epsC[j];
    }
    const sumEigenvalues = all.reduce((sum, s) => sum + s.electrons * s.energy, 0);
    const totalEnergy = sumEigenvalues - hartreeEnergy(grid, f.D, f.vHartree)
        - integrateOnGrid(grid, doubleCounted) + integrateOnGrid(grid, exchangeCorrelation);

    return { Z, charge, totalEnergy, converged, iterations, highestEigenvalue: highest.energy };
}

export function solvePolarised(Z: number, configuration: SubshellOccupancy[]): PolarisedSolution {
    const occupied = configuration.filter(s => s.electrons > 0);
    const highestN = occupied.length > 0 ? highestPrincipalQuantumNumber(occupied) : 1;
    return solvePolarisedOnGrid(Z, gridForAtom(Z, highestN), occupied);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/atom/spin_scf.test.ts`
Expected: PASS (~15 s). If O misses 10⁻⁵, check the F/α constants and the ζ-derivative against Task 4's formulas before anything else — the prototype this plan was written from hit 1.6·10⁻⁶.

- [ ] **Step 5: Commit**

```bash
git add src/atom/spin_scf.ts tests/atom/spin_scf.test.ts
git commit -m "feat(atom): spin-polarised SCF total energies, matching NIST LSD

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ΔSCF ionisation and excitation energies

**Files:**
- Create: `src/atom/delta_scf.ts`, `src/atom/ionisation_references.ts`
- Test: `tests/atom/delta_scf.test.ts`

**Interfaces:**
- Consumes: `solvePolarised` (Task 5); `AtomSpecies`, `speciesConfiguration`, `speciesKey`, `speciesSymbol`, `allowedCharges` (Tasks 1–2).
- Produces:
  ```ts
  // delta_scf.ts
  export const HARTREE_IN_EV = 27.211386245988;   // CODATA 2018
  export const DELTA_SCF_LABEL = 'ΔSCF, LDA';
  export const DELTA_SCF_METHOD: string;          // full statement, the tooltip
  export interface EnergyReading { valueEv: number; fromLabel: string; toLabel: string }
  export function ionisedSpeciesOf(species: AtomSpecies): AtomSpecies | 'bare nucleus' | null;
  export function polarisedTotalEnergy(species: AtomSpecies): number;           // memoised by speciesKey
  export function ionisationEnergy(species: AtomSpecies): EnergyReading | null; // null: excited, or next ion not offered
  export function excitationEnergy(species: AtomSpecies): EnergyReading | null; // null: not excited
  export function clearDeltaScfCacheForTests(): void;
  // ionisation_references.ts
  export const NIST_FIRST_IONISATION_EV: Readonly<Record<number, number>>;      // Z = 1..18
  export const NA_D_LINE_EV = 2.104;
  export const NIST_ASD_IONISATION_SOURCE: string;
  ```

**Decided:** ionisation energy is shown for ground-state species only (for an excited species the excitation energy is the number that means something), from charge q to q + 1 when q + 1 is offered, or to the bare nucleus when q + 1 = Z (H → H⁺: exact 13.606 eV). For an anion it is labelled as the neutral's electron affinity in the UI (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/delta_scf.test.ts
import {
    ionisationEnergy, excitationEnergy, ionisedSpeciesOf, HARTREE_IN_EV, DELTA_SCF_LABEL, DELTA_SCF_METHOD, clearDeltaScfCacheForTests,
} from '../../src/atom/delta_scf';
import { NIST_FIRST_IONISATION_EV, NA_D_LINE_EV } from '../../src/atom/ionisation_references';
import { neutralGround } from '../../src/atom/species';

jest.setTimeout(120000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const itSlow = SLOW ? it : it.skip;
const within = (value: number, reference: number, percent: number) =>
    expect(Math.abs(value - reference) / reference * 100).toBeLessThanOrEqual(percent);

beforeAll(clearDeltaScfCacheForTests);

describe('ΔSCF energies', () => {
    it('states its method', () => {
        expect(DELTA_SCF_LABEL).toBe('ΔSCF, LDA');
        expect(DELTA_SCF_METHOD).toMatch(/difference of two self-consistent total energies/);
        expect(DELTA_SCF_METHOD).toMatch(/spin-polarised/);
    });

    it('is exact for hydrogen and He+ (one-electron bypass)', () => {
        expect(ionisationEnergy(neutralGround(1))!.valueEv).toBeCloseTo(0.5 * HARTREE_IN_EV, 9);
        expect(ionisationEnergy({ Z: 2, charge: 1, excitation: null })!.valueEv).toBeCloseTo(2 * HARTREE_IN_EV, 9);
    });

    it('meets the spec for He and Li (fast cases of the H-Ar sweep)', () => {
        const he = ionisationEnergy(neutralGround(2))!;
        within(he.valueEv, NIST_FIRST_IONISATION_EV[2], 10);          // measured 22.72 eV, -7.6 %
        const li = ionisationEnergy(neutralGround(3))!;
        within(li.valueEv, NIST_FIRST_IONISATION_EV[3], 10);          // measured 5.473 eV, +1.5 %
        // And equal to NIST's own LSD ΔSCF, -7.142818 - (-7.343957) Ha, to 1e-3 eV.
        expect(li.valueEv).toBeCloseTo((-7.142818 + 7.343957) * HARTREE_IN_EV, 3);
        expect([li.fromLabel, li.toLabel]).toEqual(['Li', 'Li⁺']);
    });

    it('knows which species ionisation leads to', () => {
        expect(ionisedSpeciesOf(neutralGround(1))).toBe('bare nucleus');
        expect(ionisedSpeciesOf(neutralGround(11))).toEqual({ Z: 11, charge: 1, excitation: null });
        expect(ionisedSpeciesOf({ Z: 11, charge: 1, excitation: null })).toBeNull();   // Na2+ breaks the neon core
        expect(ionisedSpeciesOf({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } })).toBeNull();
        expect(excitationEnergy(neutralGround(11))).toBeNull();
    });

    it('gives the exact excitation of an excited hydrogen: 1s -> 2p = 3/8 Ha', () => {
        const h = excitationEnergy({ Z: 1, charge: 0, excitation: { from: { n: 1, l: 0 }, to: { n: 2, l: 1 } } })!;
        expect(h.valueEv).toBeCloseTo(0.375 * HARTREE_IN_EV, 9);
    });

    itSlow('meets the spec for Na 3s -> 3p: within 10 % of the D line', () => {
        const na = excitationEnergy({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } })!;
        within(na.valueEv, NA_D_LINE_EV, 10);                          // measured 2.185 eV, +3.8 %
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/atom/delta_scf.test.ts`
Expected: FAIL, "Cannot find module '../../src/atom/delta_scf'".

- [ ] **Step 3: Implement**

```ts
// src/atom/ionisation_references.ts
/** NIST Atomic Spectra Database, Ionization Energies Data (retrieved 2026-09-25), eV. */
export const NIST_ASD_IONISATION_SOURCE = 'NIST Atomic Spectra Database, Ionization Energies (Kramida, Ralchenko, Reader and NIST ASD Team)';
export const NIST_FIRST_IONISATION_EV: Readonly<Record<number, number>> = {
    1: 13.598434599702, 2: 24.587389011, 3: 5.391714996, 4: 9.322699, 5: 8.298019, 6: 11.2602880,
    7: 14.53413, 8: 13.618055, 9: 17.42282, 10: 21.564541, 11: 5.13907696, 12: 7.646236,
    13: 5.985769, 14: 8.15168, 15: 10.486686, 16: 10.3600167, 17: 12.967633, 18: 15.7596119,
};
/** Sodium's 3s -> 3p excitation, the D line, as the spec states it. */
export const NA_D_LINE_EV = 2.104;
export const NA_D_LINE_SOURCE = 'NIST Atomic Spectra Database, Na I 3p levels (D lines), as stated in spec §5 Phase 3';
```

```ts
// src/atom/delta_scf.ts
/**
 * Ionisation and excitation energies as ΔSCF total-energy differences
 * (spec §3.4; ruling R19 -- an eigenvalue is never an ionisation energy).
 *
 * Spin-polarised LDA, not the restricted LDA the pictures use: restricted
 * ΔSCF put O, F and S 12-22 % off experiment, because an atom and its ion
 * have different numbers of unpaired electrons and restricted LDA ignores
 * the exchange energy that difference carries. Spin-polarised LDA puts all
 * of H-Ar within 7.6 % (He; He+ is exact, He is not).
 */
import { AtomSpecies, speciesConfiguration, speciesKey, speciesSymbol, excitationLabel } from './species';
import { allowedCharges } from './ion_configurations';
import { solvePolarised } from './spin_scf';

export const HARTREE_IN_EV = 27.211386245988;
export const DELTA_SCF_LABEL = 'ΔSCF, LDA';
export const DELTA_SCF_METHOD =
    'ΔSCF: the difference of two self-consistent total energies, each from a central-field, spin-polarised ' +
    'LDA calculation (Slater exchange + VWN5 correlation, Hund\'s-rule spin occupation, spherically averaged, ' +
    'non-relativistic). One-electron species are exact. Not an orbital eigenvalue.';

export interface EnergyReading { valueEv: number; fromLabel: string; toLabel: string }

const cache = new Map<string, number>();

export function polarisedTotalEnergy(species: AtomSpecies): number {
    const key = speciesKey(species);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const energy = solvePolarised(species.Z, speciesConfiguration(species)).totalEnergy;
    cache.set(key, energy);
    return energy;
}

export function ionisedSpeciesOf(species: AtomSpecies): AtomSpecies | 'bare nucleus' | null {
    if (species.excitation) return null;
    const next = species.charge + 1;
    if (next === species.Z) return 'bare nucleus';
    return allowedCharges(species.Z).includes(next) ? { Z: species.Z, charge: next, excitation: null } : null;
}

export function ionisationEnergy(species: AtomSpecies): EnergyReading | null {
    const ionised = ionisedSpeciesOf(species);
    if (ionised === null) return null;
    const after = ionised === 'bare nucleus' ? 0 : polarisedTotalEnergy(ionised);
    return {
        valueEv: (after - polarisedTotalEnergy(species)) * HARTREE_IN_EV,
        fromLabel: speciesSymbol(species),
        toLabel: ionised === 'bare nucleus' ? `${speciesSymbol({ ...species, charge: species.Z })} (bare nucleus)` : speciesSymbol(ionised),
    };
}

export function excitationEnergy(species: AtomSpecies): EnergyReading | null {
    if (!species.excitation) return null;
    const ground = { ...species, excitation: null };
    return {
        valueEv: (polarisedTotalEnergy(species) - polarisedTotalEnergy(ground)) * HARTREE_IN_EV,
        fromLabel: speciesSymbol(ground),
        toLabel: `${speciesSymbol(ground)} ${excitationLabel(species.excitation)}`,
    };
}

export function clearDeltaScfCacheForTests(): void { cache.clear(); }
```
(`speciesSymbol({ ...species, charge: species.Z })` for H gives "H⁺" — `chargeSuffix(1)`; for He⁺ → He²⁺ it gives "He²⁺".)

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/atom/delta_scf.test.ts`
Expected: PASS (~6 s).
Run: `ATOM_SLOW_TESTS=1 npx jest tests/atom/delta_scf.test.ts`
Expected: PASS (~20 s).

- [ ] **Step 5: Commit**

```bash
git add src/atom/delta_scf.ts src/atom/ionisation_references.ts tests/atom/delta_scf.test.ts
git commit -m "feat(atom): ΔSCF ionisation and excitation energies (spin-polarised LDA)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Validation sweep and the shared validation rows

**How `app` values stay honest** (same mechanism as Phase 4 Task 7). The slow test computes every value, asserts it against its reference, and — only with `WRITE_VALIDATION=1` — writes them to `src/validation/ion_results.json`, which is committed. `ion_rows.ts` maps that file into Phase 1's `ValidationRow`s; nothing is typed by hand. A default-suite check re-solves the cheapest entries (He, Li) and a slow check re-solves all of them, requiring agreement to 10⁻⁶ relative, so the file cannot go stale unnoticed.

**Files:**
- Create: `src/validation/ion_results.json`, `src/validation/ion_rows.ts`
- Create: `tests/atom/delta_scf_nist.test.ts` (slow; writes the results)
- Modify: `src/validation/references.ts` (Phase 1: append rows)
- Test: `tests/validation/ion_rows.test.ts`

**Interfaces:**
- Consumes: Phase 1's `ValidationRow`, `VALIDATION`; `ionisationEnergy`, `excitationEnergy`, `polarisedTotalEnergy`, `DELTA_SCF_METHOD` (Task 6); `NIST_FIRST_IONISATION_EV`, `NIST_ASD_IONISATION_SOURCE`, `NA_D_LINE_EV`, `NA_D_LINE_SOURCE`.
- Produces:
  ```ts
  export interface IonResultEntry { kind: 'ionisation' | 'excitation' | 'lsdTotal'; Z: number; charge: number; system: string; app: number; reference: number }
  export const NIST_LSD_SOURCE: string;
  export const LSD_METHOD: string;
  export const ION_VALIDATION_ROWS: ValidationRow[];
  ```

- [ ] **Step 1: Bootstrap the results file and write the failing rows test**

```json
{ "generator": "tests/atom/delta_scf_nist.test.ts with ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1", "generatedOn": null, "entries": [] }
```
(saved as `src/validation/ion_results.json`)

```ts
// tests/validation/ion_rows.test.ts
import { ION_VALIDATION_ROWS } from '../../src/validation/ion_rows';
import { VALIDATION } from '../../src/validation/references';
import { NIST_FIRST_IONISATION_EV } from '../../src/atom/ionisation_references';

describe('Phase 3 validation rows', () => {
    const ionisation = ION_VALIDATION_ROWS.filter(r => r.quantity === 'first ionisation energy (ΔSCF)');

    it('has one ΔSCF ionisation row per element H-Ar, against NIST ASD, within 10 %', () => {
        expect(ionisation.map(r => r.system)).toEqual(
            ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar']);
        ionisation.forEach((row, i) => {
            expect(row.reference).toBe(NIST_FIRST_IONISATION_EV[i + 1]);
            expect(row.unit).toBe('eV');
            expect(row.tolerancePercent).toBe(10);
        });
    });

    it('has the Na 3s -> 3p row against 2.104 eV within 10 %', () => {
        const row = ION_VALIDATION_ROWS.find(r => r.quantity === '3s → 3p excitation energy (ΔSCF)')!;
        expect([row.system, row.reference, row.tolerancePercent]).toEqual(['Na', 2.104, 10]);
    });

    it('has the LSD total-energy rows that validate the spin-polarised solver itself', () => {
        const lsd = ION_VALIDATION_ROWS.filter(r => r.quantity === 'total energy (LSD)');
        expect(lsd).toHaveLength(33);    // He..Ar neutral (17) and Li+..Ar+ (16)
        for (const row of lsd) expect([row.unit, row.tolerancePercent]).toEqual(['Ha', 0.001]);
    });

    it('is phase 3, within tolerance, and part of the shared table', () => {
        for (const row of ION_VALIDATION_ROWS) {
            expect(row.phase).toBe(3);
            expect(Math.abs(row.app - row.reference) / Math.abs(row.reference) * 100).toBeLessThanOrEqual(row.tolerancePercent);
            expect(VALIDATION).toContain(row);
        }
    });
});
```

- [ ] **Step 2: Write the slow validation test**

```ts
// tests/atom/delta_scf_nist.test.ts
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { ionisationEnergy, excitationEnergy, polarisedTotalEnergy } from '../../src/atom/delta_scf';
import { NIST_FIRST_IONISATION_EV, NA_D_LINE_EV } from '../../src/atom/ionisation_references';
import { neutralGround, speciesSymbol } from '../../src/atom/species';
import recorded from '../../src/validation/ion_results.json';
import type { IonResultEntry } from '../../src/validation/ion_rows';

// 36 spin-polarised solves of light atoms plus sodium's excited state: about three minutes.
jest.setTimeout(1800000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const WRITE = process.env.WRITE_VALIDATION === '1';
if (WRITE && !SLOW) throw new Error('WRITE_VALIDATION=1 needs ATOM_SLOW_TESTS=1: the results file must cover every entry.');
const describeSlow = SLOW ? describe : describe.skip;

// NIST SRD 141 LSD column (Kotochigova et al. 1997), Etot in Ha, retrieved 2026-09-25: [neutral, +1 ion].
const NIST_LSD: Record<number, [number, number | null]> = {
    2: [-2.834836, null], 3: [-7.343957, -7.142818], 4: [-14.447209, -14.115512], 5: [-24.353614, -24.038275],
    6: [-37.470031, -37.037413], 7: [-54.136799, -53.585407], 8: [-74.527410, -74.016721], 9: [-99.114192, -98.450427],
    10: [-128.233481, -127.418114], 11: [-161.447625, -161.250340], 12: [-199.139406, -198.855669],
    13: [-241.321156, -241.100595], 14: [-288.222945, -287.918773], 15: [-340.005794, -339.618451],
    16: [-396.743948, -396.356540], 17: [-458.671463, -458.184562], 18: [-525.946195, -525.360439],
};
const NA_3P = { Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } };
const entries: IonResultEntry[] = [];
const percentOff = (app: number, reference: number) => Math.abs(app - reference) / Math.abs(reference) * 100;

function recompute(entry: IonResultEntry): number {
    if (entry.kind === 'ionisation') return ionisationEnergy(neutralGround(entry.Z))!.valueEv;
    if (entry.kind === 'excitation') return excitationEnergy(NA_3P)!.valueEv;
    return polarisedTotalEnergy({ Z: entry.Z, charge: entry.charge, excitation: null });
}

describe('committed results stay current (fast subset)', () => {
    it('He and Li match a fresh computation to 1e-6', () => {
        const cheap = (recorded.entries as IonResultEntry[]).filter(e => e.Z <= 3);
        for (const entry of cheap) expect(Math.abs((recompute(entry) - entry.app) / entry.app)).toBeLessThan(1e-6);
    });
});

describeSlow('Phase 3 validation (spec §5: H-Ar ΔSCF IE within 10 %, Na 3s→3p within 10 %)', () => {
    for (let Z = 1; Z <= 18; Z++) {
        it(`Z=${Z}: first ionisation energy and LSD totals`, () => {
            const app = ionisationEnergy(neutralGround(Z))!.valueEv;
            const reference = NIST_FIRST_IONISATION_EV[Z];
            entries.push({ kind: 'ionisation', Z, charge: 0, system: speciesSymbol(neutralGround(Z)), app, reference });
            expect(percentOff(app, reference)).toBeLessThanOrEqual(10);
            const lsd = NIST_LSD[Z];
            if (!lsd) return;   // hydrogen: one electron, exact by the bypass
            for (const [charge, value] of [[0, lsd[0]], [1, lsd[1]]] as const) {
                if (value === null) continue;   // He+: one electron
                const species = { Z, charge, excitation: null };
                const total = polarisedTotalEnergy(species);
                entries.push({ kind: 'lsdTotal', Z, charge, system: speciesSymbol(species), app: total, reference: value });
                expect(percentOff(total, value)).toBeLessThanOrEqual(0.001);
            }
        });
    }

    it('Na 3s -> 3p against the D line', () => {
        const app = excitationEnergy(NA_3P)!.valueEv;
        entries.push({ kind: 'excitation', Z: 11, charge: 0, system: 'Na', app, reference: NA_D_LINE_EV });
        expect(percentOff(app, NA_D_LINE_EV)).toBeLessThanOrEqual(10);
    });

    (WRITE ? it.skip : it)('every committed result matches a fresh computation to 1e-6', () => {
        const committed = recorded.entries as IonResultEntry[];
        expect(committed.length).toBe(18 + 33 + 1);
        for (const entry of committed) expect(Math.abs((recompute(entry) - entry.app) / entry.app)).toBeLessThan(1e-6);
    });

    afterAll(() => {
        if (!WRITE) return;
        writeFileSync(resolve(__dirname, '../../src/validation/ion_results.json'), `${JSON.stringify({
            generator: 'tests/atom/delta_scf_nist.test.ts with ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1',
            generatedOn: new Date().toISOString().slice(0, 10),
            entries,
        }, null, 2)}\n`);
    });
});
```

- [ ] **Step 3: Run the rows test to verify it fails**

Run: `npx jest tests/validation/ion_rows.test.ts`
Expected: FAIL, "Cannot find module '../../src/validation/ion_rows'".

- [ ] **Step 4: Implement the rows module and append to the shared table**

```ts
// src/validation/ion_rows.ts
/**
 * Phase 3's rows of the shared validation table (spec §3.2, §4.4). Every
 * `app` number is read from ion_results.json, which only
 * tests/atom/delta_scf_nist.test.ts writes, after asserting each value.
 */
import results from './ion_results.json';
import type { ValidationRow } from './references';
import { DELTA_SCF_METHOD } from '../atom/delta_scf';
import { NIST_ASD_IONISATION_SOURCE, NA_D_LINE_SOURCE } from '../atom/ionisation_references';

export interface IonResultEntry {
    kind: 'ionisation' | 'excitation' | 'lsdTotal';
    Z: number;
    charge: number;
    /** 'Na', 'Na⁺' -- speciesSymbol of the species the value belongs to. */
    system: string;
    app: number;
    reference: number;
}

export const NIST_LSD_SOURCE = 'NIST SRD 141, Atomic Reference Data for Electronic Structure Calculations, LSD column '
    + '(Kotochigova, Levine, Shirley, Stiles, Clark, Phys. Rev. A 55, 191 (1997))';
export const LSD_METHOD = 'central-field SCF, spin-polarised LDA (Slater exchange + VWN5), Hund\'s-rule occupation, spherically averaged';

function rowFor(entry: IonResultEntry): ValidationRow {
    const common = { phase: 3, system: entry.system, app: entry.app, reference: entry.reference };
    if (entry.kind === 'ionisation') {
        return { ...common, quantity: 'first ionisation energy (ΔSCF)', unit: 'eV', tolerancePercent: 10, referenceSource: NIST_ASD_IONISATION_SOURCE, method: DELTA_SCF_METHOD };
    }
    if (entry.kind === 'excitation') {
        return { ...common, quantity: '3s → 3p excitation energy (ΔSCF)', unit: 'eV', tolerancePercent: 10, referenceSource: NA_D_LINE_SOURCE, method: DELTA_SCF_METHOD };
    }
    return { ...common, quantity: 'total energy (LSD)', unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LSD_SOURCE, method: LSD_METHOD };
}

export const ION_VALIDATION_ROWS: ValidationRow[] = (results.entries as IonResultEntry[]).map(rowFor);
```

In Phase 1's `src/validation/references.ts`, add `import { ION_VALIDATION_ROWS } from './ion_rows';` and append `...ION_VALIDATION_ROWS,` as the last element of the `VALIDATION` array literal (after `...PHASE_1_ROWS`). `ion_rows.ts` imports only the `ValidationRow` *type* back, so there is no runtime cycle.

- [ ] **Step 5: Generate the results (foreground; about three minutes)**

Run: `ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1 npx jest tests/atom/delta_scf_nist.test.ts`
Expected: PASS; `src/validation/ion_results.json` holds 52 entries. If any element misses 10 %, stop and report the measured table (element, app, NIST, %) — do not loosen a tolerance.

- [ ] **Step 6: Run the fast and staleness checks**

Run: `npx jest tests/validation/ion_rows.test.ts tests/validation/references.test.ts tests/atom/delta_scf_nist.test.ts`
Expected: PASS (the fast subset re-solves He and Li, ~4 s).
Run: `ATOM_SLOW_TESTS=1 npx jest tests/atom/delta_scf_nist.test.ts -t "committed result"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/validation/ion_results.json src/validation/ion_rows.ts src/validation/references.ts tests/atom/delta_scf_nist.test.ts tests/validation/ion_rows.test.ts
git commit -m "test(atom): validate ΔSCF energies against NIST ASD and LSD; publish the rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Worker protocol, payload and caches keyed by species

**Files:**
- Modify: `src/workers/atomWorker.ts`
- Modify: `src/atom/profile_cache.ts`, `src/atom/shell_mesh_cache.ts`
- Test: `tests/atom/atom_worker_species.test.ts` (new), `tests/atom/profile_cache.test.ts` (new), `tests/atom/shell_mesh_cache.test.ts` (append)

**Interfaces:**
- Consumes: `solveSpecies`, `solveAtom` (Task 3); `UnboundAnionError` (Task 3); `ionisationEnergy`, `excitationEnergy`, `EnergyReading` (Task 6); `AtomSpecies`, `Excitation`, `speciesKey`, `isNeutralGround`, `neutralGround` (Task 2).
- Produces:
  ```ts
  // atomWorker.ts
  export interface ReferenceRadii { displayRadius: number; contourRadius: number }
  // SerialisedAtomProfile gains (optional, so existing hand-built fixtures still type-check):
  //   charge?: number; speciesKey?: string; reference?: ReferenceRadii | null
  export type AtomWorkerRequest =
      | { type: 'solve'; Z: number; charge?: number; excitation?: Excitation | null; enclosedFraction: number; requestId: number }
      | { type: 'energies'; Z: number; charge: number; excitation: Excitation | null; requestId: number };
  export type AtomWorkerResponse =
      | { type: 'success'; profile: SerialisedAtomProfile; requestId: number }
      | { type: 'unbound'; message: string; requestId: number }
      | { type: 'error'; message: string; requestId: number }
      | { type: 'energies'; speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null; requestId: number };
  export function buildSerialisedAtomProfile(atom: AtomSolution, enclosedFraction: number,
      extras?: { speciesKey?: string; reference?: ReferenceRadii | null }): SerialisedAtomProfile;
  export function handleAtomWorkerRequest(data: AtomWorkerRequest): { response: AtomWorkerResponse; transfer: Transferable[] };
  // profile_cache.ts -- first parameter is now the species key (String(Z) for a neutral atom)
  export function getCachedProfile(species: string, enclosedFraction: number): SerialisedAtomProfile | undefined;
  export function setCachedProfile(species: string, enclosedFraction: number, profile: SerialisedAtomProfile): void;
  // shell_mesh_cache.ts -- first parameter widened
  export function shellMeshCacheKey(species: string | number, n: number, resolution: number, enclosedFraction: number, isolatedL?: number | null): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/atom/atom_worker_species.test.ts
import { handleAtomWorkerRequest } from '../../src/workers/atomWorker';
import { NIST_FIRST_IONISATION_EV } from '../../src/atom/ionisation_references';

jest.setTimeout(120000);

describe('atom worker, species protocol', () => {
    it('solves Na+ and carries its key, charge and the neutral atom\'s radii for the reference ring', () => {
        const { response, transfer } = handleAtomWorkerRequest({ type: 'solve', Z: 11, charge: 1, excitation: null, enclosedFraction: 0.9, requestId: 7 });
        expect(response.type).toBe('success');
        if (response.type !== 'success') return;
        expect(response.requestId).toBe(7);
        expect(response.profile.speciesKey).toBe('11+1');
        expect(response.profile.charge).toBe(1);
        expect(response.profile.subshells.reduce((sum, s) => sum + s.electrons, 0)).toBe(10);
        expect(response.profile.reference!.displayRadius).toBeGreaterThan(response.profile.displayRadius);
        expect(transfer).toContain(response.profile.total.buffer);
    });

    it('carries no reference for a neutral ground state, and keeps its key as String(Z)', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 3, enclosedFraction: 0.9, requestId: 1 });
        if (response.type !== 'success') throw new Error(response.type);
        expect(response.profile.speciesKey).toBe('3');
        expect(response.profile.reference).toBeNull();
    });

    it('answers an unbound anion with an explicit unbound reply, not a profile', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 17, charge: -1, excitation: null, enclosedFraction: 0.9, requestId: 3 });
        expect(response).toEqual({ type: 'unbound', message: expect.stringMatching(/^LDA does not bind this anion/), requestId: 3 });
    });

    it('computes ΔSCF energies on request', () => {
        const { response } = handleAtomWorkerRequest({ type: 'energies', Z: 3, charge: 0, excitation: null, requestId: 4 });
        if (response.type !== 'energies') throw new Error(response.type);
        expect(response.speciesKey).toBe('3');
        expect(Math.abs(response.ionisation!.valueEv - NIST_FIRST_IONISATION_EV[3]) / NIST_FIRST_IONISATION_EV[3]).toBeLessThan(0.1);
        expect(response.excitation).toBeNull();
    });

    it('reports a disallowed species as an error rather than throwing out of the worker', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 11, charge: 2, excitation: null, enclosedFraction: 0.9, requestId: 5 });
        expect(response).toEqual({ type: 'error', message: expect.stringMatching(/not offered/), requestId: 5 });
    });
});
```

```ts
// tests/atom/profile_cache.test.ts
import { getCachedProfile, setCachedProfile, clearProfileCacheForTests } from '../../src/atom/profile_cache';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';

const profile = (Z: number) => ({ Z } as unknown as SerialisedAtomProfile);

describe('profile cache keyed by species', () => {
    beforeEach(clearProfileCacheForTests);
    it('keeps Na and Na+ apart at the same fraction', () => {
        setCachedProfile('11', 0.9, profile(11));
        expect(getCachedProfile('11+1', 0.9)).toBeUndefined();
        setCachedProfile('11+1', 0.9, profile(111));
        expect(getCachedProfile('11', 0.9)!.Z).toBe(11);
        expect(getCachedProfile('11+1', 0.9)!.Z).toBe(111);
    });
});
```

Append to `tests/atom/shell_mesh_cache.test.ts` inside its `describe`:

```ts
    it('keys by species, and a neutral atom\'s key is unchanged', () => {
        expect(shellMeshCacheKey('26', 3, 32, 0.9)).toBe(shellMeshCacheKey(26, 3, 32, 0.9));
        expect(shellMeshCacheKey('11+1', 2, 32, 0.9)).not.toBe(shellMeshCacheKey(11, 2, 32, 0.9));
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/atom/atom_worker_species.test.ts tests/atom/profile_cache.test.ts tests/atom/shell_mesh_cache.test.ts`
Expected: FAIL ("handleAtomWorkerRequest is not a function"; type errors on string keys).

- [ ] **Step 3: Implement the caches**

`profile_cache.ts`: rename the first parameter of `keyFor`, `getCachedProfile` and `setCachedProfile` from `Z: number` to `species: string` and build the key as `` `${species}:${enclosedFraction}` `` (for a neutral atom `species` is `String(Z)`, so the key string is the same as before). Update the module comment's "pure function of (Z, enclosedFraction)" to "(species, enclosedFraction)".

`shell_mesh_cache.ts`: change the first parameter to `species: string | number` and the key to `` `${species}:${n}:${resolution}:${enclosedFraction}:${isolatedL ?? 'all'}` ``.

- [ ] **Step 4: Implement the worker**

In `src/workers/atomWorker.ts`:

1. Imports: replace the first line with
   ```ts
   import { AtomSolution, solveAtom, solveSpecies } from '../atom/scf';
   import { UnboundAnionError } from '../atom/scf_shared';
   import { AtomSpecies, Excitation, isNeutralGround, speciesKey } from '../atom/species';
   import { EnergyReading, excitationEnergy, ionisationEnergy } from '../atom/delta_scf';
   ```
2. Add to `SerialisedAtomProfile`, after `converged`:
   ```ts
   /** Z minus the electron count. Optional only so older hand-built test fixtures still type-check. */
   charge?: number;
   /** speciesKey of what was solved ('11', '11+1', '11:3s>3p'); what the caches and the animation guard key on. */
   speciesKey?: string;
   /**
    * The neutral ground state's radii, for the reference ring (spec: "a
    * compare strip shows the neutral atom's contour ring"). Null for a
    * neutral ground state, which is its own reference.
    */
   reference?: ReferenceRadii | null;
   ```
   and above it `export interface ReferenceRadii { displayRadius: number; contourRadius: number }`.
3. `buildSerialisedAtomProfile(atom, enclosedFraction, extras = {})` adds to the returned object: `charge: atom.charge, speciesKey: extras.speciesKey ?? String(atom.Z), reference: extras.reference ?? null,`.
4. Replace `WorkerMessageData`, `WorkerSuccessResponse`, `WorkerErrorResponse` with the exported `AtomWorkerRequest` / `AtomWorkerResponse` unions from the Interfaces block, and replace the `worker.onmessage` body with a call to this exported function:

```ts
/**
 * One request in, one response out -- exported so the protocol is tested
 * without a Worker (see the module note on WorkerScope). The same module
 * serves two worker instances: useAtomSolver's (pictures) and
 * useDeltaScfEnergies' (energies), so a slow ΔSCF never queues in front of
 * a picture.
 */
export function handleAtomWorkerRequest(data: AtomWorkerRequest): { response: AtomWorkerResponse; transfer: Transferable[] } {
    const { requestId } = data;
    const species: AtomSpecies = { Z: data.Z, charge: data.charge ?? 0, excitation: data.excitation ?? null };
    try {
        if (data.type === 'energies') {
            return {
                response: { type: 'energies', speciesKey: speciesKey(species), ionisation: ionisationEnergy(species), excitation: excitationEnergy(species), requestId },
                transfer: [],
            };
        }
        const atom = solveSpecies(species);
        const reference = isNeutralGround(species) ? null : (() => {
            const neutral = buildAtomProfile(solveAtom(species.Z), data.enclosedFraction);
            return { displayRadius: neutral.displayRadius, contourRadius: neutral.contourRadius };
        })();
        const profile = buildSerialisedAtomProfile(atom, data.enclosedFraction, { speciesKey: speciesKey(species), reference });
        return { response: { type: 'success', profile, requestId }, transfer: transferListFor(profile) };
    } catch (error) {
        if (error instanceof UnboundAnionError) return { response: { type: 'unbound', message: error.message, requestId }, transfer: [] };
        return { response: { type: 'error', message: error instanceof Error ? error.message : 'Unknown error', requestId }, transfer: [] };
    }
}

worker.onmessage = (e: MessageEvent<AtomWorkerRequest>) => {
    if (e.data.type !== 'solve' && e.data.type !== 'energies') return;
    const { response, transfer } = handleAtomWorkerRequest(e.data);
    worker.postMessage(response, transfer);
};
```
Update `WorkerScope.onmessage`'s event type to `MessageEvent<AtomWorkerRequest>`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/atom/atom_worker_species.test.ts tests/atom/profile_cache.test.ts tests/atom/shell_mesh_cache.test.ts tests/atom/atom_worker_contract.test.ts`
Expected: PASS (~15 s). `npx tsc --noEmit -p .` will still report `useAtomSolver.ts` call sites of `getCachedProfile(Z, …)`; Task 9 fixes them — note them and move on.

- [ ] **Step 6: Commit**

```bash
git add src/workers/atomWorker.ts src/atom/profile_cache.ts src/atom/shell_mesh_cache.ts tests/atom/atom_worker_species.test.ts tests/atom/profile_cache.test.ts tests/atom/shell_mesh_cache.test.ts
git commit -m "feat(atom): worker solves species, reports unbound anions, computes ΔSCF energies

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Store, solver hook and energies hook

**Files:**
- Modify: `src/store/atomSlice.ts`, `src/atom/useAtomSolver.ts`
- Create: `src/atom/useDeltaScfEnergies.ts`
- Test: `tests/atom/atom_slice.test.ts` (append), `tests/atom/use_atom_solver.test.tsx` (append; update three payload expectations), `tests/atom/use_delta_scf_energies.test.tsx` (new)

**Interfaces:**
- Consumes: Task 2 species helpers; Task 8 protocol and cache signatures; `EnergyReading` (Task 6).
- Produces:
  ```ts
  // atomSlice.ts
  export interface EnergiesState {
      speciesKey: string | null;
      status: 'idle' | 'computing' | 'done' | 'failed';
      ionisation: EnergyReading | null;
      excitation: EnergyReading | null;
      message: string | null;
  }
  AtomState.charge: number;                 // 0
  AtomState.excitation: Excitation | null;  // null
  AtomState.unbound: string | null;         // the worker's "LDA does not bind this anion…" message
  AtomState.energies: EnergiesState;
  export function speciesOf(state: Pick<AtomState, 'Z' | 'charge' | 'excitation'>): AtomSpecies;
  export const setCharge: (charge: number) => PayloadAction<number>;
  export const setExcitation: (excitation: Excitation | null) => PayloadAction<Excitation | null>;
  export const solveUnbound: (message: string) => PayloadAction<string>;
  export const energiesStarted: (speciesKey: string) => PayloadAction<string>;
  export const energiesSucceeded: (p: { speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null }) => PayloadAction;
  export const energiesFailed: (p: { speciesKey: string; message: string }) => PayloadAction;
  // useDeltaScfEnergies.ts
  export function useDeltaScfEnergies(createWorker?: () => AtomWorkerHandle): void;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/atom/atom_slice.test.ts` (it has `buildStore()` and `neonLikeProfile()`; extend the import from `atomSlice` with `setCharge, setExcitation, solveUnbound, energiesStarted, energiesSucceeded, speciesOf`):

```ts
describe('species in the store', () => {
    const na3p = { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } };

    it('starts neutral and in the ground state', () => {
        const atom = buildStore().getState().atom;
        expect([atom.charge, atom.excitation, atom.unbound]).toEqual([0, null, null]);
    });

    it('setCharge accepts only an offered charge, resets the view and starts a solve', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(solveSucceeded(neonLikeProfile()));
        store.dispatch(drillToShell(2));
        const nonce = store.getState().atom.solveNonce;
        store.dispatch(setCharge(2));                        // Na2+ is not offered
        expect(store.getState().atom.charge).toBe(0);
        expect(store.getState().atom.solveNonce).toBe(nonce);
        store.dispatch(setCharge(1));
        const atom = store.getState().atom;
        expect([atom.charge, atom.level, atom.selectedShell, atom.profile]).toEqual([1, 'atom', null, null]);
        expect(atom.solveNonce).toBe(nonce + 1);
    });

    it('setCharge clears an unbound report and bumps the nonce, even to the same charge', () => {
        const store = buildStore();
        store.dispatch(setElement(17));
        store.dispatch(setCharge(-1));
        store.dispatch(solveUnbound('LDA does not bind this anion: its 3p electron has no bound state (eigenvalue ≥ 0).'));
        expect(store.getState().atom.unbound).toMatch(/does not bind/);
        const nonce = store.getState().atom.solveNonce;
        store.dispatch(setCharge(0));
        expect(store.getState().atom.unbound).toBeNull();
        store.dispatch(setCharge(0));
        expect(store.getState().atom.solveNonce).toBe(nonce + 2);
    });

    it('setExcitation accepts only an offered promotion and is cleared by a charge change', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(setExcitation({ from: { n: 2, l: 1 }, to: { n: 3, l: 1 } }));
        expect(store.getState().atom.excitation).toBeNull();
        store.dispatch(setExcitation(na3p));
        expect(store.getState().atom.excitation).toEqual(na3p);
        store.dispatch(setCharge(1));
        expect(store.getState().atom.excitation).toBeNull();
    });

    it('setElement returns to the neutral ground state', () => {
        const store = buildStore();
        store.dispatch(setElement(26));
        store.dispatch(setCharge(2));
        store.dispatch(setElement(11));
        expect(speciesOf(store.getState().atom)).toEqual({ Z: 11, charge: 0, excitation: null });
    });

    it('drops an energies reply for a species no longer selected', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(energiesStarted('11'));
        store.dispatch(energiesSucceeded({ speciesKey: '11+1', ionisation: { valueEv: 47, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null }));
        expect(store.getState().atom.energies.status).toBe('computing');
        store.dispatch(energiesSucceeded({ speciesKey: '11', ionisation: { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null }));
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', ionisation: { valueEv: 5.37 } });
    });

    it('drillToShell refuses a shell the ion does not occupy', () => {
        const store = buildStore();
        store.dispatch(setElement(10));
        store.dispatch(solveSucceeded(neonLikeProfile()));
        store.dispatch(drillToShell(3));
        expect(store.getState().atom.level).toBe('atom');
    });
});
```

In `tests/atom/use_atom_solver.test.tsx`, update the three exact-payload expectations (lines ~93, ~186, ~265) to include `charge: 0, excitation: null,` after `Z`, and append:

```ts
import { setCharge, solveUnbound } from '../../src/store/atomSlice';
import { setCachedProfile } from '../../src/atom/profile_cache';

describe('useAtomSolver with species', () => {
    it('posts the charge, and keys the cache by species', () => {
        const store = buildStore();
        const worker = fakeWorker();
        store.dispatch(setElement(11));
        setCachedProfile('11', 0.9, minimalProfile({ Z: 11 }));
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });
        expect(worker.postMessage).not.toHaveBeenCalled();         // neutral Na was cached
        act(() => { store.dispatch(setCharge(1)); });
        expect(worker.postMessage).toHaveBeenLastCalledWith({
            type: 'solve', Z: 11, charge: 1, excitation: null, enclosedFraction: 0.9, requestId: expect.any(Number),
        });
    });

    it('turns an unbound reply into the unbound state, not a profile or an error', () => {
        const store = buildStore();
        const worker = fakeWorker();
        store.dispatch(setElement(17));
        store.dispatch(setCharge(-1));
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });
        act(() => {
            worker.onmessage!({ data: { type: 'unbound', message: 'LDA does not bind this anion: …', requestId: lastRequestId(worker) } } as MessageEvent);
        });
        const atom = store.getState().atom;
        expect([atom.unbound, atom.profile, atom.error, atom.isSolving]).toEqual(['LDA does not bind this anion: …', null, null, false]);
    });
});
```

```tsx
// tests/atom/use_delta_scf_energies.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import atomReducer, { setElement, setCharge } from '../../src/store/atomSlice';

jest.mock('../../src/workers/createAtomWorker', () => ({ createAtomWorker: jest.fn() }));
import { useDeltaScfEnergies } from '../../src/atom/useDeltaScfEnergies';
import { AtomWorkerHandle } from '../../src/atom/useAtomSolver';

const fake = () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as AtomWorkerHandle & { postMessage: jest.Mock; terminate: jest.Mock };

describe('useDeltaScfEnergies', () => {
    it('asks a fresh worker for the current species, and terminates it when the species changes', () => {
        const store = configureStore({ reducer: { atom: atomReducer } });
        store.dispatch(setElement(11));
        const workers: Array<ReturnType<typeof fake>> = [];
        renderHook(() => useDeltaScfEnergies(() => { const w = fake(); workers.push(w); return w; }), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });
        expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'energies', Z: 11, charge: 0, excitation: null, requestId: expect.any(Number) });
        expect(store.getState().atom.energies).toMatchObject({ status: 'computing', speciesKey: '11' });

        act(() => { store.dispatch(setCharge(1)); });
        expect(workers[0].terminate).toHaveBeenCalled();
        expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ Z: 11, charge: 1 }));

        const { requestId } = workers[1].postMessage.mock.calls[0][0];
        act(() => {
            workers[1].onmessage!({ data: { type: 'energies', speciesKey: '11+1', ionisation: null, excitation: null, requestId } } as MessageEvent);
        });
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', speciesKey: '11+1', ionisation: null });
    });

    it('does nothing in Basic Orbitals mode', () => {
        const store = configureStore({ reducer: { atom: atomReducer } });
        store.dispatch({ type: 'atom/setMode', payload: 'hydrogenic' });
        const create = jest.fn(fake);
        renderHook(() => useDeltaScfEnergies(create), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
        expect(create).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/atom/atom_slice.test.ts tests/atom/use_atom_solver.test.tsx tests/atom/use_delta_scf_energies.test.tsx`
Expected: FAIL (missing exports, missing module).

- [ ] **Step 3: Implement the slice**

In `src/store/atomSlice.ts` add imports `import { AtomSpecies, Excitation, isValidExcitation, speciesKey } from '../atom/species'; import { allowedCharges } from '../atom/ion_configurations'; import type { EnergyReading } from '../atom/delta_scf';`. Add the four fields to `AtomState` (with doc comments: charge and excitation are "what to solve alongside Z"; `unbound` is "spec §3.5: shown, not drawn"; `energies` is "ΔSCF results for `speciesKey` only") and to `initialState`:

```ts
    charge: 0,
    excitation: null,
    unbound: null,
    energies: { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null },
```

Add, above `createSlice`:

```ts
export function speciesOf(state: Pick<AtomState, 'Z' | 'charge' | 'excitation'>): AtomSpecies {
    return { Z: state.Z, charge: state.charge, excitation: state.excitation };
}

/** What every species change does: the same reset setElement always did, plus the unbound report. */
function resetForNewSpecies(state: AtomState): void {
    state.solveNonce += 1;
    state.level = 'atom';
    state.selectedShell = null;
    state.selectedSubshell = null;
    state.selectedOrbital = null;
    state.profile = null;
    state.error = null;
    state.unbound = null;
}
```

In `setElement`, replace the body with `state.Z = action.payload; state.charge = 0; state.excitation = null; resetForNewSpecies(state);`. In `solveStarted` and `solveSucceeded` add `state.unbound = null;`. Add reducers:

```ts
        setCharge: (state, action: PayloadAction<number>) => {
            if (!allowedCharges(state.Z).includes(action.payload)) return;
            state.charge = action.payload;
            state.excitation = null;
            resetForNewSpecies(state);
        },

        setExcitation: (state, action: PayloadAction<Excitation | null>) => {
            const excitation = action.payload;
            if (excitation && !isValidExcitation(state.Z, state.charge, excitation)) return;
            state.excitation = excitation;
            resetForNewSpecies(state);
        },

        solveUnbound: (state, action: PayloadAction<string>) => {
            state.isSolving = false;
            state.profile = null;
            state.error = null;
            state.unbound = action.payload;
        },

        energiesStarted: (state, action: PayloadAction<string>) => {
            state.energies = { speciesKey: action.payload, status: 'computing', ionisation: null, excitation: null, message: null };
        },

        energiesSucceeded: (state, action: PayloadAction<{ speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null }>) => {
            if (action.payload.speciesKey !== speciesKey(speciesOf(state))) return;
            state.energies = { speciesKey: action.payload.speciesKey, status: 'done', ionisation: action.payload.ionisation, excitation: action.payload.excitation, message: null };
        },

        energiesFailed: (state, action: PayloadAction<{ speciesKey: string; message: string }>) => {
            if (action.payload.speciesKey !== speciesKey(speciesOf(state))) return;
            state.energies = { speciesKey: action.payload.speciesKey, status: 'failed', ionisation: null, excitation: null, message: action.payload.message };
        },
```
Export them: `export const { setCharge, setExcitation, solveUnbound, energiesStarted, energiesSucceeded, energiesFailed } = atomSlice.actions;`.

- [ ] **Step 4: Implement the solver hook changes**

In `src/atom/useAtomSolver.ts`: extend `AtomWorkerMessage` with `| { type: 'unbound'; message: string; requestId: number }`; import `solveUnbound` and `speciesKey`; select `charge` and `excitation`:

```ts
    const charge = useAppSelector(state => state.atom.charge);
    const excitation = useAppSelector(state => state.atom.excitation);
```
Inside the request effect, compute `const key = speciesKey({ Z, charge, excitation });`, use `getCachedProfile(key, enclosedFraction)` / `setCachedProfile(key, enclosedFraction, profile)`, handle the new reply before the error branch:

```ts
            if (event.data.type === 'unbound') {
                dispatch(solveUnbound(event.data.message));
                return;
            }
```
post `worker.postMessage({ type: 'solve', Z, charge, excitation, enclosedFraction, requestId });`, and set the dependency list to `[mode, Z, charge, excitation, enclosedFraction, solveNonce, dispatch]`. Update the doc comment's keying paragraph: "keyed on the species (Z, charge, excitation), the fraction and solveNonce".

- [ ] **Step 5: Create the energies hook**

```ts
// src/atom/useDeltaScfEnergies.ts
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { energiesStarted, energiesSucceeded, energiesFailed } from '../store/atomSlice';
import { createAtomWorker } from '../workers/createAtomWorker';
import { AtomWorkerHandle } from './useAtomSolver';
import { speciesKey } from './species';

/**
 * ΔSCF energies for the species on screen, in their own worker.
 *
 * Two extra spin-polarised solves per species -- a second or two for light
 * atoms, tens of seconds for the heaviest -- must never queue in front of the
 * picture (HANDOFF: "a busy SCF worker queues behind an abandoned slow
 * solve"). So this worker is disposable: a species change terminates it and
 * starts a fresh one, and the store drops any reply for a species that is
 * no longer selected (energiesSucceeded checks the key).
 */
export function useDeltaScfEnergies(createWorker: () => AtomWorkerHandle = createAtomWorker): void {
    const dispatch = useAppDispatch();
    const mode = useAppSelector(state => state.atom.mode);
    const Z = useAppSelector(state => state.atom.Z);
    const charge = useAppSelector(state => state.atom.charge);
    const excitation = useAppSelector(state => state.atom.excitation);
    const nextRequestId = useRef(0);

    useEffect(() => {
        if (mode !== 'atom') return;
        const key = speciesKey({ Z, charge, excitation });
        const requestId = ++nextRequestId.current;
        dispatch(energiesStarted(key));
        const worker = createWorker();
        worker.onmessage = (event: MessageEvent) => {
            const data = event.data as { type: string; requestId: number; speciesKey?: string; ionisation?: unknown; excitation?: unknown; message?: string };
            if (data.requestId !== requestId) return;
            if (data.type === 'energies') {
                dispatch(energiesSucceeded(data as Parameters<typeof energiesSucceeded>[0]));
            } else {
                dispatch(energiesFailed({ speciesKey: key, message: data.message ?? 'The ΔSCF calculation failed.' }));
            }
            worker.terminate();
        };
        worker.onerror = (event: ErrorEvent) => {
            dispatch(energiesFailed({ speciesKey: key, message: event.message || 'The ΔSCF calculation failed.' }));
            worker.terminate();
        };
        worker.postMessage({ type: 'energies', Z, charge, excitation, requestId });
        return () => { worker.terminate(); };
        // createWorker excluded for the same reason as in useAtomSolver.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, Z, charge, excitation, dispatch]);
}
```
The `worker.onmessage` assignment needs `AtomWorkerHandle.onmessage`'s event type to accept this reply; widen `AtomWorkerMessage` in `useAtomSolver.ts` with `| { type: 'energies'; speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null; requestId: number }` (import the type from `./delta_scf`) and type the handler parameter as `MessageEvent<AtomWorkerMessage>`, narrowing on `data.type`.

- [ ] **Step 6: Run to verify they pass**

Run: `npx jest tests/atom/atom_slice.test.ts tests/atom/use_atom_solver.test.tsx tests/atom/use_delta_scf_energies.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/store/atomSlice.ts src/atom/useAtomSolver.ts src/atom/useDeltaScfEnergies.ts tests/atom/atom_slice.test.ts tests/atom/use_atom_solver.test.tsx tests/atom/use_delta_scf_energies.test.tsx
git commit -m "feat(atom): charge, excitation, unbound and ΔSCF energies in the store

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The neutral-atom reference ring

**Decided, and why this way.** The spec's "compare strip shows the neutral atom's contour ring". The ring is drawn at the neutral atom's **`displayRadius`** — the radius its sphere is drawn at, i.e. exactly where the neutral atom's rim was on screen — so switching Na → Na⁺ leaves a dashed circle where the old edge was. It cannot be a uniform on the existing cut-face shader: that face is stencilled to the current sphere, so for a cation (smaller than its neutral) the ring would fall outside the stencil and never draw. It is its own mesh: a plane quad positioned on the cut plane like a cap, not stencilled, whose fragment shader keeps only |r − R| < half-width (the same "|worldPosition| against a radius" test `shell_view.ts`'s highlight ring uses, which traces the sphere–plane intersection exactly), dashed every 7.5°, pale grey. It is hidden when the cut plane misses the sphere of radius R, and shown only at the whole-atom level. The camera frames on at least R (`framingFloor`), so the ring is on screen and the ion's size change reads against a fixed scale.

**Files:**
- Create: `src/atom/reference_ring.ts`
- Modify: `src/orbital_visualizer.ts`
- Test: `tests/atom/reference_ring.test.ts`, `tests/atom/visualizer_dispatch.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  // reference_ring.ts
  export function createReferenceRing(radius: number): THREE.Mesh;
  export function positionReferenceRing(ring: THREE.Object3D | null, plane: THREE.Plane): void;
  export function setReferenceRingWidth(ring: THREE.Object3D | null, worldHalfWidth: number): void;
  export function disposeReferenceRing(ring: THREE.Object3D | null): void;
  // orbital_visualizer.ts
  VisualizerContext.referenceRing?: THREE.Mesh | null;
  AtomShellViewParams.framingFloor?: number;
  export function setReferenceRing(context: VisualizerContext | null, radius: number | null): void;
  export function clearAtomView(context: VisualizerContext | null): void;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/atom/reference_ring.test.ts
import * as THREE from 'three';
import { createReferenceRing, positionReferenceRing, setReferenceRingWidth, disposeReferenceRing } from '../../src/atom/reference_ring';

describe('reference ring', () => {
    it('is an unstencilled overlay carrying its radius', () => {
        const ring = createReferenceRing(1.94);
        const material = ring.material as THREE.ShaderMaterial;
        expect(material.uniforms.radius.value).toBe(1.94);
        expect(material.stencilWrite).toBe(false);
        expect(material.depthTest).toBe(false);
        expect(ring.userData.isReferenceRing).toBe(true);
        expect(ring.renderOrder).toBeGreaterThan(2);    // above the cut face (renderOrder 2)
    });

    it('lies on the cut plane, facing along its normal', () => {
        const ring = createReferenceRing(2);
        const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.5);   // x = 0.5
        positionReferenceRing(ring, plane);
        expect(plane.distanceToPoint(ring.position)).toBeCloseTo(0, 12);
        ring.updateMatrixWorld(true);
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(ring.quaternion);
        expect(Math.abs(facing.dot(plane.normal))).toBeCloseTo(1, 9);
        expect(ring.visible).toBe(true);
    });

    it('hides when the cut plane misses the sphere it marks', () => {
        const ring = createReferenceRing(2);
        positionReferenceRing(ring, new THREE.Plane(new THREE.Vector3(1, 0, 0), -2.5));
        expect(ring.visible).toBe(false);
        positionReferenceRing(ring, new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9));   // "no cut"
        expect(ring.visible).toBe(false);
    });

    it('takes a world-space half-width, and disposes without throwing', () => {
        const ring = createReferenceRing(2);
        setReferenceRingWidth(ring, 0.03);
        expect((ring.material as THREE.ShaderMaterial).uniforms.halfWidth.value).toBe(0.03);
        expect(() => disposeReferenceRing(ring)).not.toThrow();
    });
});
```

Append to `tests/atom/visualizer_dispatch.test.ts` (extend its import with `setReferenceRing, clearAtomView`; it already has `buildContext()` and `atomShellParams()`):

```ts
describe('reference ring and framing floor', () => {
    it('adds one ring to the scene, replaces it, and removes it with null', () => {
        const context = buildContext();
        setReferenceRing(context, 2);
        setReferenceRing(context, 3);
        const rings = context.scene.children.filter(child => child.userData.isReferenceRing);
        expect(rings).toHaveLength(1);
        expect(((rings[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.radius.value).toBe(3);
        setReferenceRing(context, null);
        expect(context.scene.children.some(child => child.userData.isReferenceRing)).toBe(false);
    });

    it('frames on at least the framing floor, so the ring is on screen', () => {
        const context = buildContext();
        updateAtomViewInScene(context, { ...atomShellParams(), contourRadius: 1.3, framingFloor: 1.94 });
        expect(context.framedRMax).toBeCloseTo(1.94, 12);
    });

    it('clearAtomView leaves nothing drawn', () => {
        const context = buildContext();
        updateAtomViewInScene(context, atomShellParams());
        setReferenceRing(context, 2);
        clearAtomView(context);
        expect(sceneContent(context)).toHaveLength(0);
        expect(context.currentOrbitalGroup).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/atom/reference_ring.test.ts tests/atom/visualizer_dispatch.test.ts`
Expected: FAIL, "Cannot find module '../../src/atom/reference_ring'".

- [ ] **Step 3: Implement the ring**

```ts
// src/atom/reference_ring.ts
import * as THREE from 'three';

/**
 * The neutral atom's edge, drawn on the cut face of an ion or excited atom
 * (spec §5 Phase 3). A separate, unstencilled mesh: the cut face is
 * stencilled to the current sphere, and a cation's neutral edge lies
 * outside it. See the plan's Task 10 for the full reasoning.
 */
const DASHES = 48;
const RING_COLOUR = new THREE.Vector3(0.85, 0.87, 0.92);

const VERTEX = /* glsl */`
    varying vec3 vWorldPosition;
    varying vec2 vLocal;
    void main() {
        vLocal = position.xy;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
    }
`;

// |worldPosition| against the radius traces the sphere-plane intersection
// exactly, at any cut depth -- the same test shell_view.ts's highlight ring
// uses. Dashed by angle in the plane, so it never reads as the solid rim.
const FRAGMENT = /* glsl */`
    precision highp float;
    uniform float radius;
    uniform float halfWidth;
    uniform vec3 colour;
    varying vec3 vWorldPosition;
    varying vec2 vLocal;
    layout(location = 0) out vec4 fragColor;
    void main() {
        if (abs(length(vWorldPosition) - radius) > halfWidth) discard;
        float turn = atan(vLocal.y, vLocal.x) / 6.28318530718;
        if (fract(turn * ${DASHES}.0) > 0.6) discard;
        fragColor = vec4(colour, 0.9);
    }
`;

export function createReferenceRing(radius: number): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            radius: { value: radius },
            // Placeholder until the render loop's first setReferenceRingWidth.
            halfWidth: { value: radius * 0.01 },
            colour: { value: RING_COLOUR },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        stencilWrite: false,
    });
    const size = radius * 2.2;
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    ring.renderOrder = 3;
    ring.userData.isReferenceRing = true;
    return ring;
}

/** On the plane, facing along it, centred where the nucleus projects; hidden when the plane misses the sphere. */
export function positionReferenceRing(ring: THREE.Object3D | null, plane: THREE.Plane): void {
    if (!(ring instanceof THREE.Mesh)) return;
    const radius = (ring.material as THREE.ShaderMaterial).uniforms.radius.value as number;
    ring.visible = Math.abs(plane.constant) < radius;
    plane.coplanarPoint(ring.position);
    ring.lookAt(ring.position.x - plane.normal.x, ring.position.y - plane.normal.y, ring.position.z - plane.normal.z);
}

export function setReferenceRingWidth(ring: THREE.Object3D | null, worldHalfWidth: number): void {
    if (!(ring instanceof THREE.Mesh)) return;
    (ring.material as THREE.ShaderMaterial).uniforms.halfWidth.value = worldHalfWidth;
}

export function disposeReferenceRing(ring: THREE.Object3D | null): void {
    if (!(ring instanceof THREE.Mesh)) return;
    ring.geometry.dispose();
    (ring.material as THREE.Material).dispose();
}
```

- [ ] **Step 4: Wire it into the visualizer**

In `src/orbital_visualizer.ts`:
1. Import `createReferenceRing, positionReferenceRing, setReferenceRingWidth, disposeReferenceRing` from `./atom/reference_ring`.
2. Add to `VisualizerContext` (after `isCompositionView`): `/** The neutral atom's edge while an ion or excited atom is shown (reference_ring.ts). */ referenceRing?: THREE.Mesh | null;`
3. Add to `AtomShellViewParams`: `/** Frame on at least this radius -- the reference ring's, so the neutral's edge is on screen. */ framingFloor?: number;`
4. In `updateAtomViewInScene`, replace `const framingRadius = framingRadiusFor(params.contourRadius, params.outermostFeatureR);` with
   `const framingRadius = Math.max(framingRadiusFor(params.contourRadius, params.outermostFeatureR), params.framingFloor ?? 0);`
5. At the end of `refreshCaps`: `positionReferenceRing(context.referenceRing ?? null, context.clipPlane);`
6. In `startAnimationLoop`'s `isShellView` block, after `setShellViewRingWidth(...)`: `setReferenceRingWidth(context.referenceRing ?? null, pxToWorld * HIGHLIGHT_RING_HALF_WIDTH_PX);`
7. Add the two exported functions after `clearShellCompositionLobes`:

```ts
/** Shows the neutral atom's edge at `radius`, or removes it with null. One ring at most. */
export function setReferenceRing(context: VisualizerContext | null, radius: number | null): void {
    if (!context || context.isDisposed) return;
    if (context.referenceRing) {
        context.scene.remove(context.referenceRing);
        disposeReferenceRing(context.referenceRing);
        context.referenceRing = null;
    }
    if (radius === null || !(radius > 0)) return;
    const ring = createReferenceRing(radius);
    positionReferenceRing(ring, context.clipPlane);
    context.scene.add(ring);
    context.referenceRing = ring;
}

/**
 * Empties the atom view -- for an anion LDA does not bind (spec §3.5): the
 * previous species' picture must not stay up under a message saying there
 * is nothing to draw.
 */
export function clearAtomView(context: VisualizerContext | null): void {
    if (!context || context.isDisposed) return;
    context.activeWorker?.terminate();
    context.activeWorker = null;
    context.requestCounter++;
    cancelTransition(context);
    clearCurrentOrbital(context, context.scene);
    context.isShellView = false;
    setReferenceRing(context, null);
    // The file's own private helper, the one addAxesHelper calls first.
    removeAxesHelper(context);
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/atom/reference_ring.test.ts tests/atom/visualizer_dispatch.test.ts tests/atom/shell_view.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/atom/reference_ring.ts src/orbital_visualizer.ts tests/atom/reference_ring.test.ts tests/atom/visualizer_dispatch.test.ts
git commit -m "feat(atom): dashed reference ring at the neutral atom's drawn edge

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: SpeciesControls and a species-aware LevelNav

**Files:**
- Create: `src/components/SpeciesControls.tsx`
- Modify: `src/components/LevelNav.tsx`, `src/style.css`
- Test: `tests/atom/species_controls.test.tsx` (new), `tests/atom/level_nav.test.tsx` (append)

**Interfaces:**
- Consumes: Task 1 `allowedCharges`; Task 2 `AtomSpecies`, `Excitation`, `excitationSources`, `excitationTargets`, `excitationLabel`, `speciesSymbol`, `chargeSuffix`, `configurationLabelOf`, `shellsOf`, `valenceShellOf`, `valenceConfigurationLabelOf`; Task 6 `DELTA_SCF_LABEL`, `DELTA_SCF_METHOD`; `NIST_FIRST_IONISATION_EV`; Task 9 `EnergiesState`; Task 8 `ReferenceRadii`.
- Produces:
  ```ts
  interface SpeciesControlsProps {
      species: AtomSpecies;
      onChargeChange: (charge: number) => void;
      onExcitationChange: (excitation: Excitation | null) => void;
      energies: EnergiesState;
      /** The drawn radius of what is on screen and of the neutral reference, when both are known. */
      radii: { displayRadius: number; reference: ReferenceRadii | null } | null;
      unbound: string | null;
  }
  export default SpeciesControls;
  // LevelNav gains optional props:
  //   configuration?: SubshellOccupancy[]  (defaults to configurationFor(Z))
  //   speciesSymbol?: string                (element button text, e.g. 'Na⁺')
  //   speciesTitle?: string                 (breadcrumb root, e.g. 'Sodium ion Na⁺')
  //   speciesControls?: React.ReactNode     (rendered under the element button; first in the phone body)
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/atom/species_controls.test.tsx
import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import SpeciesControls from '../../src/components/SpeciesControls';
import { EnergiesState } from '../../src/store/atomSlice';

const idle: EnergiesState = { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null };
const renderControls = (overrides: Partial<React.ComponentProps<typeof SpeciesControls>> = {}) => {
    const props = {
        species: { Z: 11, charge: 0, excitation: null },
        onChargeChange: jest.fn(),
        onExcitationChange: jest.fn(),
        energies: idle,
        radii: null,
        unbound: null,
        ...overrides,
    };
    render(<SpeciesControls {...props} />);
    return props;
};

describe('SpeciesControls', () => {
    it('steps the charge within what the element offers', () => {
        const props = renderControls();
        expect(screen.getByRole('button', { name: 'decrease charge' })).toBeDisabled();    // Na has no anion
        fireEvent.click(screen.getByRole('button', { name: 'increase charge' }));
        expect(props.onChargeChange).toHaveBeenCalledWith(1);
    });

    it('shows the species and disables + at the highest charge', () => {
        renderControls({ species: { Z: 11, charge: 1, excitation: null } });
        expect(screen.getByLabelText('charge')).toHaveTextContent('Na⁺');
        expect(screen.getByRole('button', { name: 'increase charge' })).toBeDisabled();
    });

    it('offers "promote one electron to…" from the valence subshell, and back to the ground state', () => {
        const props = renderControls();
        fireEvent.click(screen.getByRole('button', { name: /excite one electron/i }));
        const menu = screen.getByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(
            ['3s → 3p', '3s → 4s', '3s → 3d', '3s → 4p']);
        fireEvent.click(within(menu).getByText('3s → 3p'));
        expect(props.onExcitationChange).toHaveBeenCalledWith({ from: { n: 3, l: 0 }, to: { n: 3, l: 1 } });
    });

    it('labels every energy with its method, and never shows an eigenvalue', () => {
        renderControls({
            energies: { speciesKey: '11', status: 'done', ionisation: { valueEv: 5.368, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('5.37 eV');
        expect(line).toHaveTextContent('ΔSCF, LDA');
        expect(line).toHaveTextContent('measured 5.139 eV');
        expect(line.querySelector('[title]')!.getAttribute('title')).toMatch(/difference of two self-consistent total energies/);
    });

    it('names an anion\'s ionisation energy as the electron affinity of the neutral', () => {
        renderControls({
            species: { Z: 35, charge: -1, excitation: null },
            energies: { speciesKey: '35-1', status: 'done', ionisation: { valueEv: 3.1, fromLabel: 'Br⁻', toLabel: 'Br' }, excitation: null, message: null },
        });
        expect(screen.getByText(/electron affinity of Br/)).toBeInTheDocument();
    });

    it('says it is computing while the ΔSCF runs', () => {
        renderControls({ energies: { ...idle, speciesKey: '11', status: 'computing' } });
        expect(screen.getByText(/computing/i)).toBeInTheDocument();
    });

    it('compares the drawn radius with the neutral atom\'s, naming the dashed ring', () => {
        renderControls({ species: { Z: 11, charge: 1, excitation: null }, radii: { displayRadius: 1.6, reference: { displayRadius: 3.2, contourRadius: 1.94 } } });
        const compare = screen.getByLabelText('size compared with the neutral atom');
        expect(compare).toHaveTextContent('dashed ring: neutral Na, drawn radius 3.20 a₀');
        expect(compare).toHaveTextContent('Na⁺ 1.60 a₀ (−50 %)');
    });

    it('states an unbound anion plainly', () => {
        renderControls({ species: { Z: 17, charge: -1, excitation: null }, unbound: 'LDA does not bind this anion: its 3p electron has no bound state (eigenvalue ≥ 0).' });
        expect(screen.getByRole('alert')).toHaveTextContent('LDA does not bind this anion');
    });
});
```

Append to `tests/atom/level_nav.test.tsx`:

```tsx
import { speciesConfiguration } from '../../src/atom/species';

describe('LevelNav for a species', () => {
    it('LevelNav builds its shells from the species configuration', () => {
        const configuration = speciesConfiguration({ Z: 11, charge: 1, excitation: null });
        const { getByText, getByRole } = render(
            <LevelNav Z={11} configuration={configuration} speciesTitle="Sodium ion Na⁺" speciesSymbol="Na⁺"
                selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} onChangeElement={() => {}} />
        );
        expect(getByText('1s² 2s² 2p⁶')).toBeInTheDocument();
        const shells = within(getByRole('group', { name: 'shells' })).getAllByRole('button').map(b => b.textContent);
        expect(shells.some(label => /M shell/.test(label ?? ''))).toBe(false);
        expect(getByRole('button', { name: /change element/i })).toHaveTextContent('Na⁺ · Sodium');
    });

    it('renders species controls directly under the element button', () => {
        const { container } = render(
            <LevelNav Z={11} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}}
                onChangeElement={() => {}} speciesControls={<div className="probe">controls</div>} />
        );
        const probe = container.querySelector('.probe')!;
        const button = container.querySelector('.level-nav-change-element')!;
        expect(button.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(container.querySelector('.level-nav-configuration')!.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });

    it('no longer claims to describe neutral atoms only', () => {
        const { container } = render(
            <LevelNav Z={6} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(container.textContent).not.toMatch(/no ions/);
        expect(container.textContent).toMatch(/isolated atoms and their ions/);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/atom/species_controls.test.tsx tests/atom/level_nav.test.tsx`
Expected: FAIL, "Cannot find module '../../src/components/SpeciesControls'".

- [ ] **Step 3: Implement SpeciesControls**

```tsx
// src/components/SpeciesControls.tsx
import React, { useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography, Alert } from '@mui/material';
import { AtomSpecies, Excitation, excitationSources, excitationTargets, excitationLabel, speciesSymbol } from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import { DELTA_SCF_LABEL, DELTA_SCF_METHOD, EnergyReading } from '../atom/delta_scf';
import { NIST_FIRST_IONISATION_EV } from '../atom/ionisation_references';
import type { EnergiesState } from '../store/atomSlice';
import type { ReferenceRadii } from '../workers/atomWorker';
import { elementFor } from '../elements';

interface SpeciesControlsProps {
    species: AtomSpecies;
    onChargeChange: (charge: number) => void;
    onExcitationChange: (excitation: Excitation | null) => void;
    energies: EnergiesState;
    radii: { displayRadius: number; reference: ReferenceRadii | null } | null;
    unbound: string | null;
}

/** "5.37 eV  ΔSCF, LDA", the method one hover away (spec §3.1). */
const EnergyLine: React.FC<{ label: string; reading: EnergyReading | null; status: EnergiesState['status']; measuredEv?: number }> =
    ({ label, reading, status, measuredEv }) => (
        <Typography variant="body2" className="species-energy">
            {label}:{' '}
            {status === 'computing' ? 'computing…' : reading ? `${reading.valueEv.toFixed(2)} eV` : '—'}
            {' '}<span className="species-method" title={DELTA_SCF_METHOD}>{DELTA_SCF_LABEL}</span>
            {measuredEv !== undefined && reading && <span className="species-measured"> · measured {measuredEv.toFixed(3)} eV (NIST)</span>}
        </Typography>
    );

/**
 * Charge and excitation for atom mode (spec §5 Phase 3), with the energies
 * that describe them and the size comparison against the neutral atom.
 * Presentational: every change goes out through a callback.
 */
const SpeciesControls: React.FC<SpeciesControlsProps> = ({ species, onChargeChange, onExcitationChange, energies, radii, unbound }) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const charges = allowedCharges(species.Z);
    const symbol = elementFor(species.Z)?.symbol ?? `Z${species.Z}`;
    const sources = excitationSources(species.Z, species.charge);
    const options = sources.flatMap(from => excitationTargets(species.Z, species.charge, from).map(to => ({ from, to })));
    const isAnion = species.charge < 0;
    const reading = species.excitation ? energies.excitation : energies.ionisation;
    const reference = radii?.reference ?? null;

    return (
        <Box className="species-controls" aria-label="ion and excitation">
            <Box className="species-charge-row">
                <Typography variant="body2" component="span">Charge</Typography>
                <Button size="small" aria-label="decrease charge" disabled={species.charge <= charges[0]}
                    onClick={() => onChargeChange(species.charge - 1)}>−</Button>
                <span className="species-charge-value" aria-label="charge">
                    {species.charge === 0 ? `${symbol} (neutral)` : speciesSymbol({ ...species, excitation: null })}
                </span>
                <Button size="small" aria-label="increase charge" disabled={species.charge >= charges[charges.length - 1]}
                    onClick={() => onChargeChange(species.charge + 1)}>+</Button>
            </Box>

            <Box className="species-excite-row">
                <Button size="small" variant="outlined" aria-label="excite one electron" disabled={options.length === 0}
                    onClick={event => setMenuAnchor(event.currentTarget)}>
                    {species.excitation ? `Excited ${excitationLabel(species.excitation)} ▾` : 'Excite: promote one electron to… ▾'}
                </Button>
                <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
                    {options.map(option => (
                        <MenuItem key={excitationLabel(option)} onClick={() => { setMenuAnchor(null); onExcitationChange(option); }}>
                            {excitationLabel(option)}
                        </MenuItem>
                    ))}
                    {species.excitation && (
                        <MenuItem onClick={() => { setMenuAnchor(null); onExcitationChange(null); }}>Back to the ground state</MenuItem>
                    )}
                </Menu>
            </Box>

            {unbound ? (
                <Alert severity="warning" role="alert" className="species-unbound">{unbound}</Alert>
            ) : (
                <>
                    {species.excitation ? (
                        <EnergyLine label={`Excitation energy ${excitationLabel(species.excitation)}`} reading={reading} status={energies.status} />
                    ) : (
                        <EnergyLine
                            label={isAnion ? `Ionisation energy (= electron affinity of ${symbol})` : 'Ionisation energy'}
                            reading={reading}
                            status={energies.status}
                            measuredEv={species.charge === 0 ? NIST_FIRST_IONISATION_EV[species.Z] : undefined}
                        />
                    )}
                    {energies.status === 'failed' && energies.message && (
                        <Typography variant="caption" display="block" className="species-energy-failed">{energies.message}</Typography>
                    )}
                    {radii && reference && (
                        <Typography variant="caption" display="block" className="species-compare" aria-label="size compared with the neutral atom">
                            <span className="species-compare-swatch" aria-hidden="true" />
                            dashed ring: neutral {symbol}, drawn radius {reference.displayRadius.toFixed(2)} a₀ ·{' '}
                            {speciesSymbol(species)} {radii.displayRadius.toFixed(2)} a₀
                            {' '}({radii.displayRadius < reference.displayRadius ? '−' : '+'}
                            {Math.round(Math.abs(radii.displayRadius / reference.displayRadius - 1) * 100)} %)
                        </Typography>
                    )}
                </>
            )}
        </Box>
    );
};

export default SpeciesControls;
```

- [ ] **Step 4: Make LevelNav species-aware**

In `src/components/LevelNav.tsx`:
1. Imports: replace the configurations import with `import { SubshellOccupancy, configurationFor, shellsOf, configurationLabelOf, subshellLabel, valenceShellOf, valenceConfigurationLabelOf } from '../atom/configurations';`.
2. Add the four optional props to `LevelNavProps` (doc comments as in the Interfaces block) and destructure them.
3. Replace the derived values:
   ```ts
   const speciesConfiguration = configuration ?? configurationFor(Z);
   const element = elementFor(Z);
   const elementName = element ? element.name : `Z=${Z}`;
   const rootLabel = speciesTitle ?? elementName;
   const shells = shellsOf(speciesConfiguration);
   const valenceN = valenceShellOf(speciesConfiguration);
   ```
   use `rootLabel` for the `'atom'` crumb and for `parent.label` where it is `elementName` today; replace `configurationLabel(Z)` with `configurationLabelOf(speciesConfiguration)` and `valenceConfigurationLabel(Z)` with `valenceConfigurationLabelOf(speciesConfiguration)`.
4. Both element buttons (header and full) render `` `${speciesSymbol ?? element?.symbol} · ${elementName} ▾` `` when `element` exists (the `aria-label` stays `change element, currently ${elementName}`, which the existing test pins).
5. In the full/body variant, render `{speciesControls}` immediately after the element button (full) — and, for `variant === 'body'`, as the first child of the box — before the breadcrumbs and configuration line.
6. In the about paragraph replace "It is non-relativistic and describes neutral, isolated atoms only — no ions, no molecules, no spin-orbit coupling." with "It is non-relativistic and describes isolated atoms and their ions — no molecules, no spin-orbit coupling. An ion or an excited atom uses the same model with its own electron count or one electron moved; ionisation and excitation energies are ΔSCF differences of total energies from the spin-polarised form of the same LDA, never orbital eigenvalues."

Add to `src/style.css` (next to the `.level-nav-*` rules):

```css
.species-controls { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 8px; }
.species-charge-row, .species-excite-row { display: flex; align-items: center; gap: 4px; }
.species-charge-row .MuiButton-root { min-width: 32px; }
.species-charge-value { min-width: 84px; text-align: center; font-weight: 600; }
.species-method { font-size: 0.75rem; color: #9fb3d9; border-bottom: 1px dotted #9fb3d9; cursor: help; }
.species-measured { color: #b0b0b0; }
.species-compare { color: #c8ccd6; }
.species-compare-swatch { display: inline-block; width: 18px; height: 0; border-top: 2px dashed #d9dde8; vertical-align: middle; margin-right: 6px; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/atom/species_controls.test.tsx tests/atom/level_nav.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SpeciesControls.tsx src/components/LevelNav.tsx src/style.css tests/atom/species_controls.test.tsx tests/atom/level_nav.test.tsx
git commit -m "feat(ui): charge stepper, excite menu, ΔSCF energies and size compare

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Wire it through the app, and verify it live

**Files:**
- Modify: `src/App.tsx`, `src/components/OrbitalViewer.tsx`
- Test: `src/App.test.tsx` (append)

**Interfaces:**
- Consumes: everything above: `setCharge`, `setExcitation`, `speciesOf`, `solveStarted` (store); `useDeltaScfEnergies`; `SpeciesControls`; `speciesConfiguration`, `speciesSymbol`, `speciesTitle`, `isValidExcitation`, `allowedCharges`; `setReferenceRing`, `clearAtomView`.

- [ ] **Step 1: Write the failing App tests**

Add as a nested `describe` **inside** the top-level `describe('App', …)` block of `src/App.test.tsx`, whose `beforeEach` clears the `createAtomWorker` mock and the profile cache and whose `afterEach` restores `matchMedia` (so `mock.results[0]` is this test's own solver worker). The file already has `renderWithProvider(ui, atomState?: Partial<AtomState>)`, `installMatchMedia(isNarrow)` and imports `screen`, `fireEvent`, `act`:

```tsx
describe('ions and excited states', () => {
    it('puts the charge controls in the navigation card on a desktop', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />, { Z: 11 });
        expect(container.querySelector('.side-panel .species-controls')).not.toBeNull();
        expect(container.querySelector('.view-panel .species-controls')).toBeNull();
    });

    it('stepping the charge starts a solve for the ion', () => {
        installMatchMedia(false);
        renderWithProvider(<App />, { Z: 11 });
        const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
        fireEvent.click(screen.getByRole('button', { name: 'increase charge' }));
        expect(solver.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'solve', Z: 11, charge: 1 }));
    });

    it('shows "LDA does not bind this anion" instead of a picture', () => {
        installMatchMedia(false);
        renderWithProvider(<App />, { Z: 17, charge: -1 });
        const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
        const { requestId } = solver.postMessage.mock.calls[0][0];
        act(() => {
            solver.onmessage({ data: { type: 'unbound', message: 'LDA does not bind this anion: its 3p electron has no bound state (eigenvalue ≥ 0).', requestId } });
        });
        expect(screen.getAllByText(/LDA does not bind this anion/).length).toBeGreaterThan(0);
        expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
    });

    it('names the ion in the phone header and puts the controls in the Explore tab', () => {
        installMatchMedia(true);
        renderWithProvider(<App />, { Z: 11, charge: 1 });
        expect(screen.getByRole('button', { name: /change element/i })).toHaveTextContent('Na⁺ · Sodium');
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        expect(screen.getByLabelText('ion and excitation')).toBeInTheDocument();
    });
});
```
(`renderWithProvider`'s second argument is merged into the atom slice's initial state; `charge` is now a field of it.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/App.test.tsx -t "ions and excited states"`
Expected: FAIL (no `.species-controls`).

- [ ] **Step 3: Wire App.tsx**

1. Imports: add `setCharge, setExcitation, speciesOf` to the `atomSlice` import; `import { useDeltaScfEnergies } from './atom/useDeltaScfEnergies';`, `import SpeciesControls from './components/SpeciesControls';`, `import { Excitation, speciesConfiguration, speciesSymbol, speciesTitle, isValidExcitation } from './atom/species';`, `import { allowedCharges } from './atom/ion_configurations';`.
2. Selectors: `const atomCharge = useAppSelector(state => state.atom.charge); const atomExcitation = useAppSelector(state => state.atom.excitation); const atomUnbound = useAppSelector(state => state.atom.unbound); const atomEnergies = useAppSelector(state => state.atom.energies);` and `const species = useMemo(() => speciesOf({ Z: atomZ, charge: atomCharge, excitation: atomExcitation }), [atomZ, atomCharge, atomExcitation]);`
3. Call `useDeltaScfEnergies();` on the line after `useAtomSolver(enclosedFraction);` — after it, so the picture's worker is always the first one created (App.test relies on `mock.results[0]`).
4. Handlers (no `resetView`: the camera staying put is what makes Na⁺ visibly shrink against the scale bar):
   ```ts
   const handleChargeChange = useCallback((charge: number) => {
       if (!allowedCharges(atomZ).includes(charge)) return;
       dispatch(setCharge(charge));
       dispatch(solveStarted());
   }, [dispatch, atomZ]);
   const handleExcitationChange = useCallback((excitation: Excitation | null) => {
       if (excitation && !isValidExcitation(atomZ, atomCharge, excitation)) return;
       dispatch(setExcitation(excitation));
       dispatch(solveStarted());
   }, [dispatch, atomZ, atomCharge]);
   ```
5. The controls element and LevelNav props:
   ```tsx
   const speciesControls = (
       <SpeciesControls
           species={species}
           onChargeChange={handleChargeChange}
           onExcitationChange={handleExcitationChange}
           energies={atomEnergies}
           radii={atomProfile ? { displayRadius: atomProfile.displayRadius, reference: atomProfile.reference ?? null } : null}
           unbound={atomUnbound}
       />
   );
   const levelNavProps = {
       Z: atomZ,
       configuration: speciesConfiguration(species),
       speciesSymbol: speciesSymbol(species),
       speciesTitle: speciesTitle(species),
       speciesControls,
       selectedShell: atomSelectedShell,
       selectedSubshell: atomSelectedSubshell,
       selectedOrbital: atomSelectedOrbital,
       onNavigate: handleLevelNavigate,
       onChangeElement: isNarrow ? () => setElementPickerOpen(true) : () => setTableOpen(true),
   };
   ```
   The `variant="header"` LevelNav ignores `speciesControls` (Task 11 renders it only in full/body), so the phone gets it in Explore and the desktop in the side panel, from this one props object.
6. Busy label: replace `` `Solving ${elementFor(atomZ)?.name ?? `Z = ${atomZ}`}…` `` with `` `Solving ${speciesTitle(species)}…` ``.
7. Unbound alert, next to the existing `atomError` alert: `{isAtomMode && atomUnbound && (<Alert severity="warning" className="atom-error">{atomUnbound}</Alert>)}`.

- [ ] **Step 4: Wire OrbitalViewer.tsx**

1. Import `setReferenceRing, clearAtomView` from `../orbital_visualizer`; select `const atomUnbound = useAppSelector(state => state.atom.unbound);`.
2. Rename `lastAnimatedProfileZRef` to `lastAnimatedSpeciesRef` (`useRef<string | null>(null)`) and key it on `const profileSpecies = atomProfile.speciesKey ?? String(atomProfile.Z);` — Na and Na⁺ have different grids, so the fade must not run between them. Update its doc comment: "Tracked by species, not object identity…".
3. In the level-`'atom'` `updateAtomViewInScene` call add `framingFloor: atomProfile.reference?.displayRadius,`.
4. In the composition effect use `shellMeshCacheKey(atomProfile.speciesKey ?? atomProfile.Z, atomSelectedShell, COMPOSITE_ORBITAL_RESOLUTION, enclosedFraction, isolatedL)`.
5. After the shell-view effect, add:
   ```ts
   // The neutral atom's edge, at the whole-atom level only (Task 10).
   const referenceRadius = atomMode === 'atom' && atomLevel === 'atom' && atomProfile?.reference
       ? atomProfile.reference.displayRadius : null;
   useEffect(() => {
       setReferenceRing(visualizerContextRef.current, referenceRadius);
   }, [referenceRadius, atomProfile]);

   // Spec §3.5: an anion LDA cannot bind is reported, and nothing is drawn --
   // not even the previous species' picture.
   useEffect(() => {
       if (atomMode === 'atom' && atomUnbound) clearAtomView(visualizerContextRef.current);
   }, [atomMode, atomUnbound]);
   ```
   (`atomProfile` is in the first dependency list so a new ion's view re-adds its ring after `updateAtomViewInScene` rebuilt the scene contents.)

- [ ] **Step 5: Run the tests and type-check**

Run: `npx jest src/App.test.tsx tests/atom/visualizer_dispatch.test.ts tests/atom/use_atom_solver.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Verify live — desktop (1440×900)**

Dev server at http://localhost:5391, window 1440×900, atom mode.
1. The periodic table is open on arrival; click **Na**. The left card shows "Na · Sodium ▾", directly under it the Charge row "− Na (neutral) +" with − disabled, the Excite button, and "Ionisation energy: computing…" turning into "5.37 eV ΔSCF, LDA · measured 5.139 eV (NIST)" within a few seconds. Hovering "ΔSCF, LDA" shows the full method tooltip.
2. Click **+**. The configuration line reads "1s² 2s² 2p⁶", the shell chips are K and L only, the sphere redraws visibly smaller **without the camera moving**, a pale dashed ring sits where sodium's rim was, and the compare line reads "dashed ring: neutral Na, drawn radius … a₀ · Na⁺ … a₀ (−… %)". The scale bar is unchanged in length while the atom shrank. The ionisation line shows "—" (Na²⁺ would break the neon core).
3. Drag the cut Depth slider in the right `.view-panel`: the ring stays on the cut face and shrinks with the slice, and disappears once the slice passes outside it.
4. Click **−** (back to Na), then **Excite ▾ → 3s → 3p**. The configuration line reads "1s² 2s² 2p⁶ 3p¹", the valence line "3p¹", the sphere grows slightly, the dashed ring is inside it, and "Excitation energy 3s → 3p: 2.18 eV ΔSCF, LDA" appears. **Excite ▾ → Back to the ground state** restores sodium.
5. Pick **Cl** from the table, click **−**. An alert "LDA does not bind this anion: its 3p electron has no bound state (eigenvalue ≥ 0)." appears in the card and over the view; the canvas is empty (no stale chlorine). Click **+**: chlorine redraws, the alert is gone.
6. Pick **Br**, click **−**: Br⁻ draws larger than the dashed ring of neutral Br.
7. Pick **Fe**, click **+** twice: the configuration line ends "3d⁶" (no 4s). Click the M shell chip, then 3d: the composition view shows Fe²⁺'s 3d lobes (not neutral iron's cached ones).
8. Console: no errors or warnings from the app.

- [ ] **Step 7: Verify live — phone (390×844, touch emulation)**

1. The header reads "Na · Sodium ▾" after choosing sodium through the element list dialog. Open **Explore**: the Charge row, Excite button and energies are the first block, above the configuration line.
2. Tap **+**: the header button reads "Na⁺ · Sodium ▾"; fold the sheet (tap Explore again): the smaller sphere and the dashed ring are both on screen, not under the sheet or the header.
3. Tap **Excite** and choose "3s → 3p": the menu opens fully on screen and is tappable; the excitation energy appears in Explore.
4. Rotate to 844×390: the controls are still reachable in the sheet and nothing overlaps the header.
5. Console: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/OrbitalViewer.tsx src/App.test.tsx
git commit -m "feat(atom): ions and excited states in the app, with the neutral reference ring

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: URL keys, documentation, final verification

**Files:**
- Modify: `src/url_state.ts` (Phase 2), Phase 2's `tests/url_state.test.ts`
- Modify: `README.md`, `docs/HANDOFF.md`

**Interfaces:**
- Consumes: `registerUrlKeys(mode, encoder, decoder)` (spec §4.3, Phase 2); `encodeSpeciesParams`, `decodeSpeciesParams` (Task 2); `setCharge`, `setExcitation`, `speciesOf` (Task 9).

- [ ] **Step 1: Write the failing URL test**

Add to Phase 2's `tests/url_state.test.ts`, in the form its existing atom-mode round-trip cases use (a store, `applyState(hash)`, then reading state and `encodeState()`):

```ts
it('round-trips an ion and an excited atom', () => {
    applyState('mode=atom&Z=11&charge=1');
    expect(store.getState().atom).toMatchObject({ Z: 11, charge: 1, excitation: null });
    expect(encodeState()).toMatch(/(^|&)charge=1(&|$)/);
    applyState('mode=atom&Z=11&excite=3s-3p');
    expect(store.getState().atom.excitation).toEqual({ from: { n: 3, l: 0 }, to: { n: 3, l: 1 } });
    expect(encodeState()).toMatch(/(^|&)excite=3s-3p(&|$)/);
});

it('ignores a charge or excitation the element does not offer', () => {
    applyState('mode=atom&Z=11&charge=3&excite=3s-9z');
    expect(store.getState().atom).toMatchObject({ Z: 11, charge: 0, excitation: null });
    expect(encodeState()).not.toMatch(/charge=|excite=/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/url_state.test.ts`
Expected: FAIL (charge stays 0 for `charge=1`).

- [ ] **Step 3: Register the keys**

Open `src/url_state.ts` and find the atom-mode registration, `registerUrlKeys('atom', encodeAtomKeys, decodeAtomKeys)` (Phase 2 plan, Task 4). Extend `encodeAtomKeys` and `decodeAtomKeys` themselves, placing `charge` and `excite` after `Z` (Phase 4 later adds `rel` in the same two functions), in the same form:
- **Encoder:** spread `...encodeSpeciesParams(speciesOf(state.atom))` into the returned record.
- **Decoder:** *after* the existing `setElement` dispatch (which resets charge and excitation, so order matters), add
  ```ts
  const { charge, excitation } = decodeSpeciesParams(Z, params);
  if (charge !== 0) dispatch(setCharge(charge));
  if (excitation) dispatch(setExcitation(excitation));
  ```
  where `Z` is the element the decoder just applied.
If Phase 2 registers each atom key separately rather than in one atom registration, add one registration for `charge`/`excite` right after the one that dispatches `setElement`, with the same encoder and decoder bodies.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/url_state.test.ts`
Expected: PASS.

- [ ] **Step 5: Documentation**

`README.md`, atom-mode section — add a paragraph: the Charge stepper (−2 to +3 where sensible; cations from NIST ASD ground configurations, so Fe²⁺ is [Ar] 3d⁶), the Excite menu, the dashed ring at the neutral atom's drawn radius, and the energies: "ΔSCF, LDA — differences of spin-polarised LDA total energies; H–Ar first ionisation energies within 7.6 % of NIST (worst: He), Na 3s→3p 2.18 eV vs 2.104". State the limit: most anions are not bound in LDA (H⁻, C⁻, O⁻, F⁻, S⁻, Cl⁻, O²⁻), and the app says so; Br⁻ and I⁻ are.

`docs/HANDOFF.md`, "Decisions that are not obvious from the code" — add:
- **Ion configurations are a NIST table, not a rule**: a removal rule gets 52 of 301 offered cations wrong; `tests/atom/ion_configurations.test.ts` checks every entry against a committed NIST ASD extract.
- **Pictures are restricted LDA; ΔSCF energies are spin-polarised LDA.** Restricted ΔSCF misses O, F, S by 12–22 %; LSD passes all of H–Ar and reproduces NIST's LSD totals to 10⁻⁵.
- **Anions are checked for a bound HOMO every iteration** (`hasBoundState`, threshold 10⁻⁴ Ha): without it the loop returns nonsense (H⁻ at −379 Ha), not an error. Cl⁻ is unbound in this LDA; the spec's radius ordering is asserted on Br⁻ and I⁻.
- **Species keys**: a neutral ground state's key is `String(Z)`, so every pre-Phase-3 cache key is unchanged; Phase 4 appends relativity to these keys.
- **The reference ring is its own unstencilled mesh**, because the cut face is stencilled to the current sphere and a cation's neutral edge lies outside it.
Replace "describes neutral, isolated atoms only" wherever HANDOFF or README still says it.

- [ ] **Step 6: Final verification (foreground; the full suite takes ~70 s, the slow runs several minutes)**

Run: `npx jest`
Expected: PASS; note the wall time in the report. This phase adds roughly 60 s of CPU to the default suite (spread over parallel workers: O/O⁺ LSD, Na/Na⁺/Na* solves, the worker protocol cases). If wall time grows by more than ~20 s over the pre-phase ~57–70 s, move the slowest new default cases (`spin_scf.test.ts`'s O/O⁺, `atom_worker_species.test.ts`'s Na⁺) behind `ATOM_SLOW_TESTS=1` and say so in the report — keep Task 4's finite-difference tests and Task 3's Cl⁻/H⁻ cases in the default suite as the fast regression guards.
Run: `ATOM_SLOW_TESTS=1 npx jest tests/atom/scf_species.test.ts tests/atom/delta_scf.test.ts tests/atom/delta_scf_nist.test.ts tests/atom/scf.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run build`
Expected: both clean.
Repeat Task 12 Steps 6–7 once more against the built app with `npx vite preview --port 5392 --strictPort` (http://localhost:5392), plus: open `http://localhost:5392/#mode=atom&Z=26&charge=2` in a fresh tab — Fe²⁺ loads directly, with the dashed ring and a solve for the neutral reference.

- [ ] **Step 7: Commit**

```bash
git add src/url_state.ts tests/url_state.test.ts README.md docs/HANDOFF.md
git commit -m "feat(url): share ions and excited states; document Phase 3

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage.**
- Charge stepper −2..+3, limited per element → Task 1 (`allowedCharges`), Task 11 (stepper), Task 12 (placement).
- Excite action "promote one electron to…" on the valence subshell → Task 2 (sources/targets), Task 11 (menu).
- Atom redraws; scale bar shows Na⁺ shrinking / anion swelling → Task 3 (solve), Task 12 (no camera reset; `framingFloor`), live Steps 6.2 and 6.6.
- Compare strip with the neutral's ring → Task 8 (reference radii), Task 10 (ring), Task 11 (compare line).
- ΔSCF ionisation and excitation energies labelled "ΔSCF, LDA" → Tasks 5, 6, 11.
- `solveAtom` accepts a configuration; NIST-derived ion table; Fe²⁺ = [Ar] 3d⁶ → Tasks 1, 3.
- Anion HOMO ≥ 0 → "LDA does not bind this anion", not drawn → Task 3 (guard), Task 8 (reply), Task 9 (state), Task 10 (`clearAtomView`), Task 12.
- Validation: H–Ar within 10 % → Task 7; Na 3s→3p within 10 % → Tasks 6, 7; radius ordering Na⁺ < Na (Task 3, fast), Br/Br⁻ and I/I⁻ (Task 3, slow), Cl⁻ reported unbound (Task 3). Rows in the shared table → Task 7.
- §4.3 URL state → Tasks 2, 13. §3.8 layout → Tasks 11, 12. §3.7 → Task 9 (separate, disposable worker).

**2. Placeholder scan.** Every code step carries code. The two edits into files this plan cannot see (Phase 1's `references.ts`, Phase 2's `url_state.ts`) name the exact expression to add and where; the NIST fixture is generated by a given command, not described.

**3. Type consistency.** `AtomSpecies`/`Excitation`/`SubshellRef` (Task 2) are used unchanged in Tasks 3, 6, 8, 9, 11, 12, 13. `speciesKey` strings match between `solveSpecies` (Task 3), the worker (Task 8), the caches (Task 8), `energiesSucceeded` (Task 9) and the tests. `EnergyReading` (Task 6) flows through `AtomWorkerResponse` (Task 8), `EnergiesState` (Task 9) and `SpeciesControls` (Task 11). `ReferenceRadii` (Task 8) is what `SpeciesControls.radii.reference` and `framingFloor` read. `ScfOptions` holds only `configuration`, leaving `relativity`/`startingPotential` for Phase 4.

**4. Review Focus.** Each of the five lines has its owning test named in the task that owns the code (Tasks 2, 9, 11), plus live checks in Task 12 Steps 6.5 and 6.7.
