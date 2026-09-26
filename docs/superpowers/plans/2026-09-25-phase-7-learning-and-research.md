# Phase 7 — Learning and Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guided lessons that drive the app through URL state, a compare view that puts two atoms or molecules side by side at one scale, a Methods & validation page built from the tested reference rows, citation metadata, an embed mode, an accessibility pass and an installable offline PWA. Together these make Phases 1–6 something a student can follow and a researcher can cite.

**Architecture:** Lessons are data (`src/lessons/*.ts`). Each step is a URL-state hash that Phase 2's `applyState` applies, plus two or three sentences. Compare is a new `ViewMode`. It renders two `VisualizerContext`s (two canvases) inside the uncovered area, with linked cameras framed on one common radius, so a single scale bar is true for both. The Methods page is a second Vite HTML entry (`/methods.html`) that renders `VALIDATION` rows and method text. The service worker is a third entry built to a fixed `/sw.js`, and a small in-repo Vite plugin injects its precache list.

**Tech Stack:** TypeScript 5.8, React 19, MUI 7, Redux Toolkit 2, three.js 0.176, Vite 6, Jest 29 + ts-jest + Testing Library, AWS CDK v2 (Python). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md`. §3 (principles), §4.3 (URL state), §4.4 (validation table) and §6 (owner decisions) are binding. The "Phase 7" section is the requirements.

## Global Constraints

- **Phase 2 URL API, used by name:** `encodeState(): string` (hash without `#`), `applyState(hash: string): void`, and `registerUrlKeys(mode: string, encoder: (state: RootState) => Record<string, string>, decoder: (params: URLSearchParams, dispatch: AppDispatch) => void): void`, all in `src/url_state.ts`. This plan assumes three things about it. (a) `url_state` writes the `mode` key itself and picks the encoder registered under `state.atom.mode`. (b) A decoder dispatches everything needed to restore its view, including `setMode` for its own mode. (c) Atom-mode navigation from a hash (`level=shell&n=3`) survives the solve: it is applied once `solveSucceeded` lands. Task 8's round-trip test is the arbiter. If it fails on one of these, adapt this plan's code, never Phase 2's.
- **Phase 1 validation table, consumed and not created:** `src/validation/references.ts` exports `interface ValidationRow { phase: number; quantity: string; system: string; app: number; reference: number; unit: string; tolerancePercent: number; referenceSource: string; method: string }`, `VALIDATION: ValidationRow[]` (phase-0 atom rows plus each phase's rows) and `relativeErrorPercent(row)`. `tests/validation/references.test.ts` already fails on any row outside tolerance. The module computes phase-1 rows at import (about 1 s), so **never import it from the app entry**. Only the Methods page imports it, and only lazily (Task 11).
- **Other phases' names used here:** Phase 1 `src/field_source.ts` (`GridFieldSource`) and `updateFieldInScene` in `src/orbital_visualizer.ts`, plus `HybridKind = 'sp' | 'sp2' | 'sp3'`. Phase 4 `rel` URL key with values `off|scalar|so`, the `.relativity-controls` fieldset and the `.relativity-what-changed` readout. Phase 5/6 loaders in `src/molecules/`: `loadMoleculeIndex()`, `loadMoleculeMeta(id)`, `loadDensityGrid(meta): Promise<GridFieldSource>`, `loadBasis(id)`. Molecule URL keys are `mode=molecule&id=<id>&show=density|esp|mo:<index>&iso=<fraction>`.
- **URL keys, as registered by the owning plans:** Basic Orbitals is `mode=basic`; hybrids `combo=sp|sp2|sp3&member=all|<index>`; the field view `combo=field&level=1|2&F=<a.u.>&stark=lower|upper|both`; no combination `combo=none` (Phase 2 plan, Task 5). Bonds `mode=bonds&system=h2plus|h2|he2|o2&R=<bohr>&state=1sg|1su` (Phase 5 plan); relativity `rel=off|scalar|so` (Phase 4 plan). Task 8's round-trip test still runs every lesson step through the real URL state; if a key differs, edit the **lesson hash** to the registered key, never the other phase's registration.
- **`ViewMode` gains `'compare'`** (in `src/store/atomSlice.ts`), keeping every member other phases added.
- **No new dependencies, runtime or dev.** `vite-plugin-pwa` is rejected: it pulls in `workbox-build` and its dependency tree to generate about 80 lines of service worker we can write and test ourselves. `axe-core`/`jest-axe` is rejected: under jsdom it cannot evaluate colour contrast (there is no layout or computed backdrop), and contrast is the check this app most needs. Contrast is computed in Jest from the declared CSS (Task 16), and the rest is covered by Lighthouse run in the live browser.
- **§3 principles hold on every new surface.** Every number states its method (§3.1): the compare size readout and the Methods table do. Qualitative content is labelled (§3.3). Eigenvalues are never called ionisation or excitation energies (§3.4, R19): the gold lesson cites the measured absorption edge, not an eigenvalue gap. Failures are shown (§3.5): each compare pane shows its own error. Heavy work stays in workers (§3.7). **Layout contract (§3.8):** desktop navigation lives in `.side-panel` (left) and view settings plus plot in `.view-panel` (right); on a phone, `.phone-header` plus `PhoneSheet` tabs Explore / View / Plot. No new floating panel over the canvas.
- **Atomic units and British spelling** in code, comments and UI copy ("colour", "normalise"). Comments explain *why*, in the register of `src/atom/*.ts`.
- **Tests:** `npx jest <path>` per task; `npx tsc --noEmit -p .` before every commit. Expensive SCF sweeps stay behind `ATOM_SLOW_TESTS=1`. Run the full `npx jest` once, in Task 22.
- **Run every command in the foreground.** A subagent that backgrounds a command and waits is never woken. The one exception is the dev server, which is started detached and never waited on: `curl -sf http://localhost:5391/ >/dev/null || (nohup npx vite --port 5391 --strictPort > /tmp/vite-5391.log 2>&1 &) ; sleep 3; curl -sf http://localhost:5391/ >/dev/null && echo up`.
- **Live verification** (every UI task) uses the chrome-devtools MCP (`resize_page`, `emulate`, `take_screenshot`, `list_console_messages`) at http://localhost:5391. Check **desktop 1440×900** and **phone 390×844 with touch emulation**. Reduced motion uses Playwright's `browser_emulate_media`. The console must stay free of errors.
- **Commits** end with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A lesson link opened cold** (`#mode=atom&Z=26&level=shell&n=3&lesson=periodic-table-shape&step=6`) while iron is still solving: the lesson panel must not say "you have moved away from this step" during the solve. Pinned in Task 8 (`lessonDiverged(..., busy = true)` is false).
2. **A bad lesson link** (`lesson=nope`, `step=0`, `step=99`, `step=abc`, or a lesson whose feature is not shipped) is ignored or clamped and never thrown (§4.3). Pinned in Task 8 (`readLessonParams`) and Task 9 (`startLesson` reducer).
3. **First visit with the service worker:** `clients.claim()` fires `controllerchange` on the first install, and the page must not reload itself unless the user accepted an update. Pinned in Task 18 (`registerServiceWorker`).
4. **An embedded iframe in a scrolling course page:** the mouse wheel must scroll the page until the reader clicks into the view, not zoom the atom. Pinned in Task 14 (`gateWheelZoom`).
5. **Copy embed code without clipboard access** (plain http, an iframe without the `clipboard-write` permission, a browser that rejects): the snippet appears selected in a text field instead of failing silently. Pinned in Task 14 (`LearnCard` fallback).

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `tests/helpers/fake_profile.ts` | Create | Structurally faithful `SerialisedAtomProfile` for any Z, no SCF |
| `tests/validation/phase0_provenance.test.ts` | Create | Phase-0 rows equal what the solver computes, to their stated precision |
| `src/atom/atom_view_params.ts` | Create | Whole-atom `AtomShellViewParams` from a profile (shared by viewer and compare) |
| `src/store/compareSlice.ts` | Create | The two compared subjects |
| `src/compare/compare_url.ts` | Create | `compare` mode URL keys (`a`, `b`) |
| `src/compare/useCompareProfiles.ts` | Create | Solves the compared atoms on a worker of their own |
| `src/compare/link_cameras.ts` | Create | Keeps two cameras in lockstep |
| `src/compare/useCompareMolecules.ts` | Create (gated) | Loads compared molecules' density grids |
| `src/components/CompareView.tsx` | Create | Two canvases, one framing radius, one scale bar |
| `src/components/ComparePanel.tsx` | Create | Subject pickers, swap, leave, size readout |
| `src/lessons/types.ts`, `features.ts`, `highlight_targets.ts`, `index.ts` | Create | Lesson model, feature gating, highlight selectors, registry |
| `src/lessons/periodic_table_shape.ts`, `what_is_a_bond.ts`, `water_bent.ts`, `gold_yellow.ts` | Create | The four lessons' text and hashes |
| `src/lessons/lesson_url.ts` | Create | `hashContains`, `lessonLink`, `readLessonParams`, `lessonDiverged` |
| `src/store/lessonSlice.ts` | Create | Active lesson and step |
| `src/lessons/useLessonDriver.ts`, `useLessonHighlight.ts`, `useEncodedState.ts` | Create | Apply steps, highlight targets, read the encoded view |
| `src/components/LessonPanel.tsx`, `LearnCard.tsx`, `phone_tabs.tsx` | Create | Lesson UI, the Learn/Cite/Embed card, phone tab composition |
| `public/methods.html`, `src/methods_main.tsx`, `src/methods/*` | Create | Methods & validation page |
| `CITATION.cff`, `src/cite/citation.ts` | Create | Citation metadata and formatted citations |
| `src/embed.ts` | Create | Embed detection, snippet, full-app URL, wheel gate, clipboard fallback |
| `src/a11y/describe_view.ts`, `keyboard_orbit.ts`, `contrast.ts`, `motion.ts` | Create | Screen-reader description, keyboard camera, WCAG maths, damping preference |
| `src/theme.ts` | Create | The MUI theme, exported so its contrast is testable |
| `src/pwa/*` | Create | SW logic, SW entry, manifest, icons, registration, update prompt, Vite plugin |
| `infra/infra_stack.py`, `infra/tests/unit/test_infra_stack.py` | Modify | Cache-Control split, `/sw.js` uncached, owner-gated logging/domain |
| `src/App.tsx`, `src/components/OrbitalViewer.tsx`, `Controls.tsx`, `LevelNav.tsx`, `PeriodicTable.tsx`, `PhoneSheet.tsx`, `src/useViewInsets.ts`, `src/store/index.ts`, `src/store/atomSlice.ts`, `src/style.css`, `src/main.tsx`, `public/index.html`, `vite.config.ts`, `tsconfig.node.json`, `src/App.test.tsx` | Modify | Wiring |

---

### Task 1: Owner decisions (spec §6) — gate

**Files:** Modify: `docs/HANDOFF.md` (append a section)

**Interfaces:** Produces a `## Owner decisions (spec §6)` section with `Licence:`, `Analytics:` and `Domain:` lines, which Tasks 13, 20 and 21 read.

- [ ] **Step 1: STOP and ask the owner.** Use one AskUserQuestion call with the three questions below, or ask in chat if that tool is unavailable. Do not choose for the owner. Tasks 13, 20 and 21 wait for the answers; every other task may proceed.

  1. **Licence** (`package.json` says ISC and there is no LICENSE file):
     - *MIT for the code + CC-BY-4.0 for generated molecule data* — **Recommended.** This is the common pairing, it is the easiest for courses and other projects to adopt, and Zenodo and GitHub recognise both.
     - *Apache-2.0 + CC-BY-4.0* — adds an explicit patent grant; longer text.
     - *GPL-3.0-or-later + CC-BY-4.0* — copyleft: anyone who redistributes modified code must publish its source.
     - *Keep ISC and add a LICENSE file* — ISC is OSI-approved and equivalent to MIT in effect; the molecule data still needs CC-BY-4.0.
  2. **Analytics:**
     - *CloudFront access logs only* — **Recommended.** No client code, no cookies, no consent banner. They show page loads and which molecules are opened, because molecule files load lazily one per molecule. They cannot show lessons, because the URL hash never reaches the server.
     - *None.*
     - *Cookieless event counter (GoatCounter)* — a small beacon counts lesson starts and molecule views. GoatCounter receives the event path and referrer, and the site needs a privacy note.
  3. **Domain and name:**
     - *Custom domain* — **Recommended.** The owner registers a domain and requests an ACM certificate in us-east-1, and the stack gains the alias (Task 21). Decide before the first Zenodo release, so `CITATION.cff` and the archived record carry the lasting URL.
     - *Keep the CloudFront URL* — costs nothing, but the URL is unmemorable and changes if the distribution is ever recreated.

- [ ] **Step 2: Record the answers verbatim** at the end of `docs/HANDOFF.md`:

```markdown
## Owner decisions (spec §6)

Asked and answered on <date>.

- **Licence:** <owner's answer>
- **Analytics:** <owner's answer>
- **Domain:** <owner's answer, with the domain name if one was chosen>
```

- [ ] **Step 3: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: record the owner's licence, analytics and domain decisions (spec §6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Phase-0 validation rows are what the solver computes

Phase 1 seeded the five atom-mode rows from `docs/HANDOFF.md`. Spec §4.4 requires `app` values to come from the real computation. This test pins the stored numbers to the live solver at the precision they are written to, so the Methods page cannot show a number the engine no longer produces.

**Files:**
- Create: `tests/helpers/fake_profile.ts` (used from Task 3 on)
- Test: `tests/validation/phase0_provenance.test.ts`

**Interfaces:**
- Consumes: `VALIDATION` (Phase 1); `solveAtom(Z)` from `src/atom/scf.ts` (Phase 4 made it `solveAtom(Z, relativity)`; pass `'off'` if so); `configurationFor`, `shellsFor` from `src/atom/configurations.ts`.
- Produces: `fakeProfileFor(Z: number): SerialisedAtomProfile`.

- [ ] **Step 1: Write the test**

```ts
// tests/validation/phase0_provenance.test.ts
import { VALIDATION } from '../../src/validation/references';
import { solveAtom } from '../../src/atom/scf';

const Z_OF: Record<string, number> = { He: 2, Ne: 10, Ar: 18 };

/** Half a unit in the last written decimal: -10.794 is a claim to +-0.0005. */
function statedPrecision(value: number): number {
    const decimals = (String(value).split('.')[1] ?? '').length;
    return 0.5 * 10 ** -decimals;
}

function computed(system: string, quantity: string): number {
    const atom = solveAtom(Z_OF[system]);
    if (quantity === 'total energy') return atom.totalEnergy;
    const match = /^(\d)([spdf]) eigenvalue$/.exec(quantity);
    if (!match) throw new Error(`No recipe for phase-0 quantity "${quantity}"`);
    const state = atom.states.find(s => s.n === Number(match[1]) && s.l === 'spdf'.indexOf(match[2]));
    return state!.energy;
}

describe('phase-0 validation rows', () => {
    const rows = VALIDATION.filter(row => row.phase === 0);

    it('are present, once each', () => {
        const keys = rows.map(row => `${row.system}|${row.quantity}`);
        expect(rows.length).toBeGreaterThanOrEqual(5);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it.each(rows.map(row => [`${row.system} ${row.quantity}`, row] as const))(
        '%s: the stored app value is what the solver computes',
        (_label, row) => {
            expect(Math.abs(row.app - computed(row.system, row.quantity)))
                .toBeLessThanOrEqual(statedPrecision(row.app) + 1e-12);
        },
    );
});
```

- [ ] **Step 2: Run it**

Run: `npx jest tests/validation/phase0_provenance.test.ts`
Expected: PASS, with about 6 tests in about 10 s (three SCF solves). If a row fails, the stored value is stale. Replace its `app` in Phase 1's `PHASE_0_ROWS` with the printed computed value, rounded to the same number of decimals, then rerun.

- [ ] **Step 3: Write the shared fake-profile helper** (it has no test of its own; Task 3's tests exercise it)

```ts
// tests/helpers/fake_profile.ts
import { configurationFor, shellsFor } from '../../src/atom/configurations';
import type { SerialisedAtomProfile } from '../../src/workers/atomWorker';

const SIZE = 9;

/**
 * A profile with the right shells and subshells for Z and zero curves: enough
 * for navigation, URL state and framing logic, with no SCF. If later phases
 * added required fields to SerialisedAtomProfile, give them neutral values
 * here (relativity: 'off', charge: 0).
 */
export function fakeProfileFor(Z: number): SerialisedAtomProfile {
    const f32 = () => new Float32Array(SIZE);
    const f64 = () => new Float64Array(SIZE);
    return {
        Z, converged: true, rMin: 1e-3, dx: 0.05, size: SIZE,
        total: f32(), totalEmphasis: f32(),
        contourRadius: 2, valencePeakRadius: 1.2, displayRadius: 2,
        shellPeaks: new Float64Array([1.2]), shellIndexAtR: f32(),
        shells: shellsFor(Z).map(shell => ({
            n: shell.n, electrons: shell.electrons, contourRadius: 2, curve: f64(), emphasis: f32(),
        })),
        subshells: configurationFor(Z).map(s => ({
            n: s.n, l: s.l, electrons: s.electrons, energy: -1,
            curve: f64(), R: f64(), samplingRadius: 2, compositeSamplingRadius: 2,
        })),
    } as SerialisedAtomProfile;
}
```

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit -p .
git add tests/validation/phase0_provenance.test.ts tests/helpers/fake_profile.ts
git commit -m "test(validation): pin phase-0 rows to the live solver at their stated precision

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Compare state — shared view params, slice, URL keys

**Files:**
- Create: `src/atom/atom_view_params.ts`, `src/store/compareSlice.ts`, `src/compare/compare_url.ts`
- Modify: `src/components/OrbitalViewer.tsx` (the `atomLevel === 'atom'` branch of the shell-view effect), `src/store/atomSlice.ts` (`ViewMode`), `src/store/index.ts`
- Test: `tests/compare/atom_view_params.test.ts`, `tests/compare/compare_state.test.ts`

**Interfaces:**
- Consumes: `AtomShellViewParams` (type) from `src/orbital_visualizer.ts`; `registerUrlKeys` (Phase 2); `setMode` from `atomSlice`; `MIN_ATOMIC_NUMBER`, `MAX_ATOMIC_NUMBER` from `src/elements.ts`.
- Produces: `atomLevelViewParams(profile: SerialisedAtomProfile): AtomShellViewParams`; `type CompareSubject = { kind: 'atom'; Z: number } | { kind: 'molecule'; id: string }`; `interface CompareState { a: CompareSubject; b: CompareSubject }`; actions `setCompareSubjects({ a?, b? })` and `swapCompareSubjects()`; `subjectToParam(s): string`; `parseSubject(value: string | null): CompareSubject | null`; `RootState['compare']`; `ViewMode` includes `'compare'`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compare/atom_view_params.test.ts
import { atomLevelViewParams } from '../../src/atom/atom_view_params';
import { fakeProfileFor } from '../helpers/fake_profile';

describe('atomLevelViewParams', () => {
    it('draws the whole atom at displayRadius and frames on the valence peak when it is further out', () => {
        const profile = { ...fakeProfileFor(11), displayRadius: 4.2, valencePeakRadius: 3.3, shellPeaks: new Float64Array([0.1, 0.6]) };
        const params = atomLevelViewParams(profile);
        expect(params.contourRadius).toBe(4.2);
        expect(params.outermostFeatureR).toBe(3.3);
        expect(params.valenceIndex).toBe(profile.shells.length - 1);
        expect(params.valenceEmphasis).toBe(profile.shells[profile.shells.length - 1].emphasis);
        expect(params.ringColorIndex).toBe(profile.shellIndexAtR);
        expect(params.rMax).toBeCloseTo(profile.rMin * Math.exp(profile.dx * (profile.size - 1)), 12);
    });

    it('frames on the last resolved peak when that lies beyond the valence peak', () => {
        const profile = { ...fakeProfileFor(26), valencePeakRadius: 0.5, shellPeaks: new Float64Array([0.05, 0.9]) };
        expect(atomLevelViewParams(profile).outermostFeatureR).toBe(0.9);
    });
});
```

```ts
// tests/compare/compare_state.test.ts
jest.mock('../../src/url_state', () => ({ registerUrlKeys: jest.fn(), encodeState: jest.fn(() => ''), applyState: jest.fn() }));

import { configureStore } from '@reduxjs/toolkit';
import { registerUrlKeys } from '../../src/url_state';
import atomReducer from '../../src/store/atomSlice';
import compareReducer, { setCompareSubjects, swapCompareSubjects } from '../../src/store/compareSlice';
import { parseSubject, subjectToParam } from '../../src/compare/compare_url';
import type { RootState } from '../../src/store';

const makeStore = () => configureStore({ reducer: { atom: atomReducer, compare: compareReducer } });

describe('compare subjects', () => {
    it('round-trip through their URL form', () => {
        expect(parseSubject(subjectToParam({ kind: 'atom', Z: 26 }))).toEqual({ kind: 'atom', Z: 26 });
        expect(parseSubject('molecule:h2o')).toEqual({ kind: 'molecule', id: 'h2o' });
    });

    it.each(['atom:0', 'atom:119', 'atom:x', 'molecule:', 'molecule:<b>', 'ion:11', '', null])('ignore %p', value => {
        expect(parseSubject(value)).toBeNull();
    });

    it('set one side without touching the other, and swap', () => {
        const store = makeStore();
        store.dispatch(setCompareSubjects({ b: { kind: 'atom', Z: 55 } }));
        expect(store.getState().compare).toEqual({ a: { kind: 'atom', Z: 11 }, b: { kind: 'atom', Z: 55 } });
        store.dispatch(swapCompareSubjects());
        expect(store.getState().compare.a).toEqual({ kind: 'atom', Z: 55 });
    });
});

describe('compare URL keys', () => {
    const [[mode, encoder, decoder]] = (registerUrlKeys as jest.Mock).mock.calls;

    it('register under the compare mode and encode both sides', () => {
        expect(mode).toBe('compare');
        expect(encoder(makeStore().getState() as unknown as RootState)).toEqual({ a: 'atom:11', b: 'atom:17' });
    });

    it('decode into compare mode, ignoring an invalid side', () => {
        const store = makeStore();
        decoder(new URLSearchParams('a=atom:79&b=bogus'), store.dispatch);
        expect(store.getState().compare).toEqual({ a: { kind: 'atom', Z: 79 }, b: { kind: 'atom', Z: 17 } });
        expect(store.getState().atom.mode).toBe('compare');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/compare`
Expected: FAIL — `Cannot find module '../../src/atom/atom_view_params'` (and `compareSlice`).

- [ ] **Step 3: Implement**

```ts
// src/atom/atom_view_params.ts
import type { AtomShellViewParams } from '../orbital_visualizer';
import type { SerialisedAtomProfile } from '../workers/atomWorker';

/**
 * Level 1's whole-atom view of one solved profile. Shared by the main viewer
 * and the compare view, so the same atom is drawn the same way in both.
 *
 * Drawn at displayRadius, not the enclosed-fraction contour: the cut face is
 * stencilled to this sphere, so anything outside it would be absent, not dim.
 * Framed on whichever is further out, the last resolved peak of the total or
 * the valence shell's own peak (sodium's 3s is a shoulder, never a peak of
 * the total). The valence ring is shaded from its own D_n(r).
 */
export function atomLevelViewParams(profile: SerialisedAtomProfile): AtomShellViewParams {
    const lastPeak = profile.shellPeaks.length > 0 ? profile.shellPeaks[profile.shellPeaks.length - 1] : 0;
    return {
        contourRadius: profile.displayRadius,
        shellEmphasis: profile.totalEmphasis,
        rMin: profile.rMin,
        dx: profile.dx,
        size: profile.size,
        rMax: profile.rMin * Math.exp(profile.dx * (profile.size - 1)),
        outermostFeatureR: Math.max(lastPeak, profile.valencePeakRadius),
        ringColorIndex: profile.shellIndexAtR,
        valenceIndex: profile.shells.length - 1,
        valenceEmphasis: profile.shells[profile.shells.length - 1]?.emphasis,
    };
}
```

In `src/components/OrbitalViewer.tsx`, replace the body of `if (atomLevel === 'atom') { … }` in the shell-view effect with:

```tsx
            updateAtomViewInScene(context, atomLevelViewParams(atomProfile), { animate });
```

Import `atomLevelViewParams` there. If the branch now carries fields another phase added (for example Phase 4's relativity), move those fields into `atomLevelViewParams` so both callers keep them. Delete the now-unused `outermostFeatureR` local, and keep the `gridRMax` local only if the shell branch still uses it.

```ts
// src/store/compareSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type CompareSubject = { kind: 'atom'; Z: number } | { kind: 'molecule'; id: string };
export interface CompareState { a: CompareSubject; b: CompareSubject }

/** Sodium and chlorine: one row, opposite ends -- the contraction across a period is the first thing a size comparison should show. */
const initialState: CompareState = { a: { kind: 'atom', Z: 11 }, b: { kind: 'atom', Z: 17 } };

const compareSlice = createSlice({
    name: 'compare',
    initialState,
    reducers: {
        setCompareSubjects: (state, action: PayloadAction<{ a?: CompareSubject; b?: CompareSubject }>) => {
            if (action.payload.a) state.a = action.payload.a;
            if (action.payload.b) state.b = action.payload.b;
        },
        swapCompareSubjects: state => ({ a: state.b, b: state.a }),
    },
});

export const { setCompareSubjects, swapCompareSubjects } = compareSlice.actions;
export default compareSlice.reducer;
```

```ts
// src/compare/compare_url.ts
import { registerUrlKeys } from '../url_state';
import { setMode } from '../store/atomSlice';
import { setCompareSubjects, CompareSubject } from '../store/compareSlice';
import { MIN_ATOMIC_NUMBER, MAX_ATOMIC_NUMBER } from '../elements';

export function subjectToParam(subject: CompareSubject): string {
    return subject.kind === 'atom' ? `atom:${subject.Z}` : `molecule:${subject.id}`;
}

/** Unknown or invalid values are ignored, never thrown on (spec §4.3). */
export function parseSubject(value: string | null): CompareSubject | null {
    if (!value) return null;
    const atom = /^atom:(\d{1,3})$/.exec(value);
    if (atom) {
        const Z = Number(atom[1]);
        return Z >= MIN_ATOMIC_NUMBER && Z <= MAX_ATOMIC_NUMBER ? { kind: 'atom', Z } : null;
    }
    const molecule = /^molecule:([a-z0-9_-]{1,40})$/.exec(value);
    return molecule ? { kind: 'molecule', id: molecule[1] } : null;
}

registerUrlKeys(
    'compare',
    state => ({ a: subjectToParam(state.compare.a), b: subjectToParam(state.compare.b) }),
    (params, dispatch) => {
        dispatch(setCompareSubjects({
            a: parseSubject(params.get('a')) ?? undefined,
            b: parseSubject(params.get('b')) ?? undefined,
        }));
        dispatch(setMode('compare'));
    },
);
```

In `src/store/atomSlice.ts`, add `'compare'` to `export type ViewMode = …`. In `src/store/index.ts`, add `compare: compareReducer` to `reducer` (`import compareReducer from './compareSlice';`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/compare tests/atom/visualizer_dispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit -p .
git add src/atom/atom_view_params.ts src/store/compareSlice.ts src/compare/compare_url.ts src/components/OrbitalViewer.tsx src/store/atomSlice.ts src/store/index.ts tests/compare
git commit -m "feat(compare): compare state, URL keys and shared whole-atom view params

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Compare view — two canvases at one scale

**Decision: two canvases, not one renderer with two scissored viewports.** Every piece of `orbital_visualizer.ts` state is per `VisualizerContext` and per renderer: the clip plane, the stencil-capped cut faces, the transitions, the view offset, the framing and the animation loop. Scissoring one renderer would mean splitting the context and clearing the stencil per viewport. At the whole-atom level each pane is one sphere plus a cap quad, so two WebGL contexts are cheap. Browsers allow at least 8, and this uses 2, only while compare is open (the main viewer is unmounted then). Same world scale means both cameras sit at one distance with the same fov and equal pane heights, so one scale bar is true for both.

**Files:**
- Create: `src/compare/useCompareProfiles.ts`, `src/compare/link_cameras.ts`, `src/components/CompareView.tsx`
- Modify: `src/useViewInsets.ts` (publish `--free-top/right/bottom`), `src/style.css`
- Test: `tests/compare/use_compare_profiles.test.tsx`, `tests/compare/link_cameras.test.ts`, `tests/compare/compare_view.test.tsx`

**Interfaces:**
- Consumes: `AtomWorkerHandle` from `src/atom/useAtomSolver.ts`; `createAtomWorker`; `getCachedProfile`/`setCachedProfile`; `initVisualizer`, `cleanupVisualizer`, `updateAtomViewInScene(ctx, params, { animate })`, `frameOrbital(ctx, r, restoreDefaultDirection)`, `setSurfaceStyle`, `getScaleBar`, `handleResize`; `atomLevelViewParams` (Task 3).
- Produces: `useCompareProfiles(zs: [number | null, number | null], enclosedFraction: number, createWorker?): { profiles: [P | null, P | null]; errors: [string | null, string | null] }`; `linkCameras(a, b): () => void`; `commonFramingRadius(own: Array<number | undefined>): number | null`; `interface ComparePaneContent { label: string; profile: SerialisedAtomProfile | null; status: string | null }`; default export `CompareView({ panes })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/compare/use_compare_profiles.test.tsx
jest.mock('../../src/workers/createAtomWorker', () => ({ createAtomWorker: jest.fn() }));
import { renderHook, act } from '@testing-library/react';
import { useCompareProfiles } from '../../src/compare/useCompareProfiles';
import { setCachedProfile, clearProfileCacheForTests } from '../../src/atom/profile_cache';
import { fakeProfileFor } from '../helpers/fake_profile';

function fakeWorker() {
    return { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: MessageEvent) => void) | null, onerror: null };
}

describe('useCompareProfiles', () => {
    beforeEach(() => clearProfileCacheForTests());

    it('uses cached profiles without touching a worker', () => {
        setCachedProfile(11, 0.9, fakeProfileFor(11));
        setCachedProfile(17, 0.9, fakeProfileFor(17));
        const create = jest.fn(fakeWorker);
        const { result } = renderHook(() => useCompareProfiles([11, 17], 0.9, create));
        expect(create).not.toHaveBeenCalled();
        expect(result.current.profiles.map(p => p?.Z)).toEqual([11, 17]);
    });

    it('solves misses and routes each reply to its own pane; a failure stays in its pane', () => {
        const worker = fakeWorker();
        const { result } = renderHook(() => useCompareProfiles([11, 17], 0.9, () => worker));
        const [first, second] = worker.postMessage.mock.calls.map(([m]) => m);
        expect([first.Z, second.Z]).toEqual([11, 17]);
        act(() => worker.onmessage!({ data: { type: 'success', profile: fakeProfileFor(17), requestId: second.requestId } } as MessageEvent));
        act(() => worker.onmessage!({ data: { type: 'error', message: 'boom', requestId: first.requestId } } as MessageEvent));
        expect(result.current.profiles[1]?.Z).toBe(17);
        expect(result.current.errors).toEqual(['boom', null]);
    });

    it('reports an unconverged solve as an error, never as a picture', () => {
        const worker = fakeWorker();
        const { result } = renderHook(() => useCompareProfiles([26, null], 0.9, () => worker));
        const [[message]] = worker.postMessage.mock.calls;
        act(() => worker.onmessage!({ data: { type: 'success', profile: { ...fakeProfileFor(26), converged: false }, requestId: message.requestId } } as MessageEvent));
        expect(result.current.profiles[0]).toBeNull();
        expect(result.current.errors[0]).toMatch(/did not converge/);
    });
});
```

```ts
// tests/compare/link_cameras.test.ts
import * as THREE from 'three';
import { linkCameras } from '../../src/compare/link_cameras';

function fakeSide() {
    const controls = Object.assign(new THREE.EventDispatcher<{ change: object }>(), {
        target: new THREE.Vector3(),
        update: jest.fn(function (this: THREE.EventDispatcher<{ change: object }>) { this.dispatchEvent({ type: 'change' }); }),
    });
    return { camera: new THREE.PerspectiveCamera(75, 1, 0.1, 100), controls } as never;
}

describe('linkCameras', () => {
    it('makes the other camera follow, without echoing back forever', () => {
        const a = fakeSide() as { camera: THREE.PerspectiveCamera; controls: THREE.EventDispatcher<{ change: object }> & { target: THREE.Vector3; update: jest.Mock } };
        const b = fakeSide() as typeof a;
        const unlink = linkCameras(a as never, b as never);
        a.camera.position.set(1, 2, 3);
        a.controls.dispatchEvent({ type: 'change' });
        expect(b.camera.position.toArray()).toEqual([1, 2, 3]);
        expect(b.controls.update).toHaveBeenCalledTimes(1);
        expect(a.controls.update).not.toHaveBeenCalled();
        unlink();
        a.camera.position.set(9, 9, 9);
        a.controls.dispatchEvent({ type: 'change' });
        expect(b.camera.position.x).toBe(1);
    });
});
```

```tsx
// tests/compare/compare_view.test.tsx
jest.mock('../../src/orbital_visualizer', () => {
    const THREE = jest.requireActual('three');
    const makeContext = () => ({
        camera: new THREE.PerspectiveCamera(75, 1, 0.1, 1000),
        controls: Object.assign(new THREE.EventDispatcher(), { target: new THREE.Vector3(), update: jest.fn() }),
        renderer: { domElement: document.createElement('canvas') },
        framedRMax: undefined as number | undefined,
    });
    return {
        initVisualizer: jest.fn(() => makeContext()),
        cleanupVisualizer: jest.fn(),
        updateAtomViewInScene: jest.fn((context: { framedRMax?: number }, params: { contourRadius: number }) => { context.framedRMax = params.contourRadius; }),
        frameOrbital: jest.fn((context: { framedRMax?: number }, r: number) => { context.framedRMax = r; }),
        setSurfaceStyle: jest.fn(),
        getScaleBar: jest.fn(() => ({ lengthBohr: 1, pixels: 100 })),
        handleResize: jest.fn(),
    };
});
jest.mock('../../src/useViewInsets', () => ({ useViewInsets: jest.fn() }));

import React from 'react';
import { render, screen } from '@testing-library/react';
import CompareView from '../../src/components/CompareView';
import { initVisualizer, frameOrbital } from '../../src/orbital_visualizer';
import { fakeProfileFor } from '../helpers/fake_profile';

it('frames both panes on the larger atom so one scale bar is true for both, and shows each pane\'s status', () => {
    const { rerender } = render(<CompareView panes={[
        { label: 'Sodium', profile: null, status: 'Solving Sodium…' },
        { label: 'Chlorine', profile: null, status: 'LDA did not converge' },
    ]} />);
    expect(screen.getByText('LDA did not converge')).toBeInTheDocument();
    rerender(<CompareView panes={[
        { label: 'Sodium', profile: { ...fakeProfileFor(11), displayRadius: 5 }, status: null },
        { label: 'Chlorine', profile: { ...fakeProfileFor(17), displayRadius: 2.5 }, status: null },
    ]} />);
    const [a, b] = (initVisualizer as jest.Mock).mock.results.map(result => result.value);
    expect(frameOrbital).toHaveBeenCalledWith(a, 5, true);
    expect(frameOrbital).toHaveBeenCalledWith(b, 5, true);
    expect(screen.getAllByLabelText(/scale/)).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/compare`
Expected: FAIL — missing modules `useCompareProfiles`, `link_cameras`, `CompareView`.

- [ ] **Step 3: Implement**

```ts
// src/compare/useCompareProfiles.ts
import { useEffect, useRef, useState } from 'react';
import { createAtomWorker } from '../workers/createAtomWorker';
import { getCachedProfile, setCachedProfile } from '../atom/profile_cache';
import type { AtomWorkerHandle } from '../atom/useAtomSolver';
import type { SerialisedAtomProfile } from '../workers/atomWorker';

type Slot = 0 | 1;
export interface CompareProfiles {
    profiles: [SerialisedAtomProfile | null, SerialisedAtomProfile | null];
    errors: [string | null, string | null];
}

/**
 * Solves the two compared atoms on a worker of its own, so the main view's
 * solver and its request ids are untouched. The main-thread profile cache is
 * shared, which makes comparing against the element you were just looking
 * at immediate. Each pane reports its own failure (spec §3.5).
 */
export function useCompareProfiles(
    zs: [number | null, number | null],
    enclosedFraction: number,
    createWorker: () => AtomWorkerHandle = createAtomWorker,
): CompareProfiles {
    const [result, setResult] = useState<CompareProfiles>({ profiles: [null, null], errors: [null, null] });
    const workerRef = useRef<AtomWorkerHandle | null>(null);
    const nextId = useRef(0);
    const latest = useRef<[number, number]>([0, 0]);

    useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

    useEffect(() => {
        const set = (slot: Slot, profile: SerialisedAtomProfile | null, error: string | null) =>
            setResult(previous => {
                const next: CompareProfiles = { profiles: [...previous.profiles], errors: [...previous.errors] } as CompareProfiles;
                next.profiles[slot] = profile;
                next.errors[slot] = error;
                return next;
            });
        const pending = new Map<number, { slot: Slot; Z: number }>();
        ([0, 1] as const).forEach(slot => {
            const Z = zs[slot];
            latest.current[slot] = 0;
            if (Z === null) { set(slot, null, null); return; }
            const cached = getCachedProfile(Z, enclosedFraction);
            if (cached) { set(slot, cached, null); return; }
            const requestId = ++nextId.current;
            latest.current[slot] = requestId;
            pending.set(requestId, { slot, Z });
            set(slot, null, null);
            if (!workerRef.current) workerRef.current = createWorker();
            workerRef.current.postMessage({ type: 'solve', Z, enclosedFraction, requestId });
        });
        const worker = workerRef.current;
        if (!worker || pending.size === 0) return;
        worker.onmessage = event => {
            const request = pending.get(event.data.requestId);
            if (!request || latest.current[request.slot] !== event.data.requestId) return;
            if (event.data.type === 'error') { set(request.slot, null, event.data.message); return; }
            const { profile } = event.data;
            if (!profile.converged) {
                set(request.slot, null, `The SCF calculation for Z=${request.Z} did not converge.`);
                return;
            }
            setCachedProfile(request.Z, enclosedFraction, profile);
            set(request.slot, profile, null);
        };
        worker.onerror = event => pending.forEach(request => set(request.slot, null, event.message || `Could not solve Z=${request.Z}.`));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zs[0], zs[1], enclosedFraction]);

    return result;
}
```

If Phase 3 or 4 extended the worker's `solve` message (with `charge` or `relativity`), send their neutral defaults here (`charge: 0`, `relativity: defaultRelativityFor(Z)`). Key the cache the same way `useAtomSolver` now does.

```ts
// src/compare/link_cameras.ts
import type { VisualizerContext } from '../orbital_visualizer';

type Linkable = Pick<VisualizerContext, 'camera' | 'controls'>;

/**
 * Turning one compared atom turns the other: two objects seen from two
 * directions are not a comparison. `syncing` stops the follower's own
 * 'change' from echoing back.
 */
export function linkCameras(a: Linkable, b: Linkable): () => void {
    let syncing = false;
    const follow = (from: Linkable, to: Linkable) => () => {
        if (syncing) return;
        syncing = true;
        to.controls.target.copy(from.controls.target);
        to.camera.position.copy(from.camera.position);
        to.controls.update();
        syncing = false;
    };
    const aToB = follow(a, b);
    const bToA = follow(b, a);
    a.controls.addEventListener('change', aToB);
    b.controls.addEventListener('change', bToA);
    return () => {
        a.controls.removeEventListener('change', aToB);
        b.controls.removeEventListener('change', bToA);
    };
}
```

```tsx
// src/components/CompareView.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    initVisualizer, cleanupVisualizer, updateAtomViewInScene, frameOrbital,
    setSurfaceStyle, getScaleBar, handleResize, VisualizerContext,
} from '../orbital_visualizer';
import { atomLevelViewParams } from '../atom/atom_view_params';
import { linkCameras } from '../compare/link_cameras';
import { ScaleBar, formatScaleLabel } from '../scale_bar';
import { defaultSurfaceStyle } from '../types/orbital';
import { SHELL_VIEW_CUT_AXIS } from '../orbital_presets';
import { useMediaQuery, NARROW_VIEWPORT } from '../useMediaQuery';
import { useViewInsets } from '../useViewInsets';
import type { SerialisedAtomProfile } from '../workers/atomWorker';

export interface ComparePaneContent { label: string; profile: SerialisedAtomProfile | null; status: string | null }

const COMPARE_STYLE = { ...defaultSurfaceStyle, clipAxis: SHELL_VIEW_CUT_AXIS, clipPosition: 0 };

/** The larger of the panes' own framing radii: both cameras sit there, so one bohr is the same number of pixels in each. */
export function commonFramingRadius(own: Array<number | undefined>): number | null {
    const known = own.filter((r): r is number => typeof r === 'number' && r > 0);
    return known.length > 0 ? Math.max(...known) : null;
}

const CompareView: React.FC<{ panes: [ComparePaneContent, ComparePaneContent] }> = ({ panes }) => {
    const stageRef = useRef<HTMLDivElement>(null);
    const hostA = useRef<HTMLDivElement>(null);
    const hostB = useRef<HTMLDivElement>(null);
    const contexts = useRef<[VisualizerContext | null, VisualizerContext | null]>([null, null]);
    const ownFraming = useRef<[number | undefined, number | undefined]>([undefined, undefined]);
    const [scaleBar, setScaleBar] = useState<ScaleBar | null>(null);

    // The stage is positioned in the area no panel covers (CSS vars from useViewInsets), so the panes need no insets of their own.
    const isNarrow = useMediaQuery(NARROW_VIEWPORT);
    const ignoreInsets = useCallback(() => {}, []);
    useViewInsets(stageRef, isNarrow, ignoreInsets);

    useEffect(() => {
        if (!hostA.current || !hostB.current) return;
        const hosts = [hostA.current, hostB.current];
        const created = hosts.map(host => initVisualizer(host)) as [VisualizerContext, VisualizerContext];
        created.forEach(context => setSurfaceStyle(context, COMPARE_STYLE));
        contexts.current = created;
        const unlink = linkCameras(created[0], created[1]);
        const updateScale = () => setScaleBar(getScaleBar(created[0], hosts[0].clientHeight, Math.max(80, Math.min(240, hosts[0].clientWidth * 0.3))));
        const resize = () => {
            created.forEach((context, i) => handleResize(context, hosts[i].clientWidth, hosts[i].clientHeight));
            updateScale();
        };
        created[0].controls.addEventListener('change', updateScale);
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
        hosts.forEach(host => observer?.observe(host));
        updateScale();
        return () => {
            observer?.disconnect();
            created[0].controls.removeEventListener('change', updateScale);
            unlink();
            created.forEach(context => cleanupVisualizer(context));
            contexts.current = [null, null];
        };
    }, []);

    const [profileA, profileB] = [panes[0].profile, panes[1].profile];
    useEffect(() => {
        [profileA, profileB].forEach((profile, i) => {
            const context = contexts.current[i];
            if (!context) return;
            if (!profile) { ownFraming.current[i] = undefined; return; }
            updateAtomViewInScene(context, atomLevelViewParams(profile), { animate: false });
            ownFraming.current[i] = context.framedRMax;
        });
        const common = commonFramingRadius(ownFraming.current);
        if (common === null) return;
        contexts.current.forEach(context => context && frameOrbital(context, common, true));
    }, [profileA, profileB]);

    return (
        <div ref={stageRef} className="compare-stage">
            {panes.map((pane, i) => (
                <div key={i} className="compare-pane">
                    <div ref={i === 0 ? hostA : hostB} className="compare-canvas-host" />
                    <div className="compare-pane-label">{pane.label}</div>
                    {pane.status && <div className="compare-pane-status" role="status">{pane.status}</div>}
                </div>
            ))}
            {scaleBar && (
                <div className="scale-readout compare-scale" aria-label="scale, shared by both views">
                    <div className="scale-readout-bar" style={{ width: `${scaleBar.pixels}px` }} />
                    <span className="scale-readout-label">{formatScaleLabel(scaleBar.lengthBohr)}</span>
                </div>
            )}
        </div>
    );
};

export default CompareView;
```

In `src/useViewInsets.ts`, inside the `requestAnimationFrame` callback, next to `--free-left`, add:

```ts
                container.style.setProperty('--free-top', `${insets.top}px`);
                container.style.setProperty('--free-right', `${insets.right}px`);
                container.style.setProperty('--free-bottom', `${insets.bottom}px`);
```

Append to `src/style.css`:

```css
/* Compare: two equal panes inside the area no panel covers. Equal heights
   are what let one scale bar serve both (same camera distance, same fov). */
.compare-stage {
  position: absolute;
  left: var(--free-left, 0px);
  right: var(--free-right, 0px);
  top: var(--free-top, 0px);
  bottom: var(--free-bottom, 0px);
  display: flex;
  gap: 2px;
}
@media (orientation: portrait) {
  .compare-stage { flex-direction: column; }
}
.compare-pane { position: relative; flex: 1 1 0; min-width: 0; min-height: 0; }
.compare-canvas-host { width: 100%; height: 100%; }
.compare-pane-label {
  position: absolute; top: 10px; left: 12px; padding: 4px 10px; border-radius: 6px;
  background: rgba(8, 8, 10, 0.85); color: #fff; font-size: 14px; pointer-events: none;
}
.compare-pane-status {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); max-width: 80%;
  padding: 8px 14px; border-radius: 8px; background: rgba(8, 8, 10, 0.85); color: #fff; font-size: 14px;
}
.compare-scale { left: 50%; transform: translateX(-50%); bottom: 12px; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/compare tests/view_insets.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit -p .
git add src/compare src/components/CompareView.tsx src/useViewInsets.ts src/style.css tests/compare
git commit -m "feat(compare): two linked canvases framed on one radius, one scale bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Compare panel and wiring

**Placement.** The compare pickers are navigation, so they go in `.side-panel` on desktop and in the Explore tab on a phone. The overlaid D(r) curves go where the radial plot always lives: `.view-panel` on desktop and the Plot tab on a phone. Compare is entered from the existing mode toggle in `Controls` and left from the panel. There is no new floating panel.

**Files:**
- Create: `src/components/ComparePanel.tsx`
- Modify: `src/App.tsx`, `src/components/Controls.tsx` (mode toggle), `src/App.test.tsx` (`createTestStore` reducers), `src/style.css`
- Test: `tests/compare/compare_panel.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–4; `elementFor`, `ELEMENTS`; `RadialPlot`; `CURVE_COLORS`.
- Produces: default export `ComparePanel({ a, b, sizes, moleculeOptions?, onChange(slot: 'a' | 'b', subject), onSwap, onLeave })`, where `sizes: [number | null, number | null]` are valence-peak radii in a₀.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/compare/compare_panel.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ComparePanel from '../../src/components/ComparePanel';

it('changes, swaps and leaves; states the size readout\'s method', () => {
    const onChange = jest.fn(), onSwap = jest.fn(), onLeave = jest.fn();
    render(<ComparePanel a={{ kind: 'atom', Z: 11 }} b={{ kind: 'atom', Z: 17 }} sizes={[3.4, 1.5]}
        onChange={onChange} onSwap={onSwap} onLeave={onLeave} />);
    fireEvent.change(screen.getByLabelText('First'), { target: { value: 'atom:26' } });
    expect(onChange).toHaveBeenCalledWith('a', { kind: 'atom', Z: 26 });
    fireEvent.click(screen.getByRole('button', { name: /swap/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to one view/i }));
    expect(onSwap).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
    expect(screen.getByText(/Na 3\.40 a₀ · Cl 1\.50 a₀ — Na is 2\.3× larger/)).toBeInTheDocument();
    expect(screen.getByText(/valence shell's radial-distribution peak, central-field LDA/)).toBeInTheDocument();
});
```

Add to `src/App.test.tsx`: add `compare: compareReducer` to `createTestStore`'s `reducer` map (`import compareReducer from './store/compareSlice';`). Then add:

```tsx
    it('switches the viewer for two compare panes and the navigation for the compare panel', () => {
        const { store } = renderWithProvider(<App />);
        act(() => { store.dispatch(setMode('compare')); });
        expect(screen.queryByTestId('orbital-viewer')).not.toBeInTheDocument();
        expect(screen.getByLabelText('First')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /back to one view/i }));
        expect(store.getState().atom.mode).toBe('atom');
    });
```

In this test file, mock `CompareView` the way `OrbitalViewer` is mocked (`jest.mock('./components/CompareView', () => ({ __esModule: true, default: () => <div data-testid="compare-view" /> }))`), and import `setMode`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/compare/compare_panel.test.tsx src/App.test.tsx`
Expected: FAIL — `ComparePanel` missing; the App test finds no "First" select.

- [ ] **Step 3: Implement**

```tsx
// src/components/ComparePanel.tsx
import React from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { ELEMENTS, elementFor } from '../elements';
import { CompareSubject } from '../store/compareSlice';
import { parseSubject, subjectToParam } from '../compare/compare_url';

interface ComparePanelProps {
    a: CompareSubject;
    b: CompareSubject;
    /** Valence-shell peak radius per side, a0; null for a molecule or an unsolved atom. */
    sizes: [number | null, number | null];
    moleculeOptions?: Array<{ id: string; name: string }>;
    onChange: (slot: 'a' | 'b', subject: CompareSubject) => void;
    onSwap: () => void;
    onLeave: () => void;
}

const symbolOf = (s: CompareSubject) => s.kind === 'atom' ? (elementFor(s.Z)?.symbol ?? `Z${s.Z}`) : s.id;

const ComparePanel: React.FC<ComparePanelProps> = ({ a, b, sizes, moleculeOptions = [], onChange, onSwap, onLeave }) => {
    const picker = (slot: 'a' | 'b', label: string, value: CompareSubject) => (
        <TextField
            select size="small" fullWidth margin="dense" label={label} value={subjectToParam(value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            onChange={event => { const subject = parseSubject(event.target.value); if (subject) onChange(slot, subject); }}
        >
            <optgroup label="Atoms">
                {ELEMENTS.map(element => (
                    <option key={element.atomicNumber} value={`atom:${element.atomicNumber}`}>
                        {element.atomicNumber} {element.symbol} — {element.name}
                    </option>
                ))}
            </optgroup>
            {moleculeOptions.length > 0 && (
                <optgroup label="Molecules">
                    {moleculeOptions.map(m => <option key={m.id} value={`molecule:${m.id}`}>{m.name}</option>)}
                </optgroup>
            )}
        </TextField>
    );
    const [sizeA, sizeB] = sizes;
    const readout = sizeA !== null && sizeB !== null
        ? `${symbolOf(a)} ${sizeA.toFixed(2)} a₀ · ${symbolOf(b)} ${sizeB.toFixed(2)} a₀ — `
          + `${sizeA >= sizeB ? symbolOf(a) : symbolOf(b)} is ${(Math.max(sizeA, sizeB) / Math.min(sizeA, sizeB)).toFixed(1)}× larger`
        : null;
    return (
        <Box className="compare-panel" role="group" aria-label="compare">
            <Typography variant="subtitle2" component="h2">Compare at the same scale</Typography>
            {picker('a', 'First', a)}
            {picker('b', 'Second', b)}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button size="small" onClick={onSwap}>⇄ Swap</Button>
                <Button size="small" onClick={onLeave}>← Back to one view</Button>
            </Box>
            {readout && <Typography variant="body2" className="compare-size">{readout}</Typography>}
            {readout && (
                <Typography variant="caption" display="block" className="compare-size-method">
                    Radius of each valence shell's radial-distribution peak, central-field LDA. Both views and the scale bar share one scale.
                </Typography>
            )}
        </Box>
    );
};

export default ComparePanel;
```

In `src/components/Controls.tsx`, add `<ToggleButton value="compare" aria-label="compare two">Compare</ToggleButton>` as the last child of the `mode-toggle` group.

In `src/App.tsx`:

1. Add the imports: `import './compare/compare_url';`, `CompareView` and `ComparePaneContent` from `./components/CompareView`, `ComparePanel`, `useCompareProfiles`, `setCompareSubjects`, `swapCompareSubjects` and `CompareSubject` from `./store/compareSlice`, and `SerialisedAtomProfile` (type) from `./workers/atomWorker`.
2. After `const isAtomMode = …`:

```tsx
    const isCompareMode = atomMode === 'compare';
    const compareSubjects = useAppSelector(state => state.compare);
    const zOf = (s: CompareSubject) => (s.kind === 'atom' ? s.Z : null);
```

3. After the `enclosedFraction` state:

```tsx
    // Only solves while compare is open: [null, null] asks for nothing.
    const compareResult = useCompareProfiles(
        isCompareMode ? [zOf(compareSubjects.a), zOf(compareSubjects.b)] : [null, null],
        enclosedFraction,
    );
    const subjectLabel = (s: CompareSubject) => s.kind === 'atom' ? (elementFor(s.Z)?.name ?? `Z = ${s.Z}`) : s.id;
    const comparePanes = ([compareSubjects.a, compareSubjects.b] as const).map((subject, i): ComparePaneContent => ({
        label: subjectLabel(subject),
        profile: compareResult.profiles[i],
        status: compareResult.errors[i]
            ?? (subject.kind === 'molecule'
                ? 'Molecules join the compare view with the molecule library.'
                : compareResult.profiles[i] ? null : `Solving ${subjectLabel(subject)}…`),
    })) as [ComparePaneContent, ComparePaneContent];
    const comparePanel = (
        <ComparePanel
            a={compareSubjects.a} b={compareSubjects.b}
            sizes={[compareResult.profiles[0]?.valencePeakRadius ?? null, compareResult.profiles[1]?.valencePeakRadius ?? null]}
            onChange={(slot, subject) => dispatch(setCompareSubjects({ [slot]: subject }))}
            onSwap={() => dispatch(swapCompareSubjects())}
            onLeave={() => dispatch(setMode('atom'))}
        />
    );
    const renderCompareRadialPlot = (width: number) => {
        const solved = compareResult.profiles
            .map((profile, slot) => ({ profile, slot }))
            .filter((entry): entry is { profile: SerialisedAtomProfile; slot: number } => entry.profile !== null);
        if (solved.length === 0) return null;
        return (
            <RadialPlot
                n={1} l={0} Z={solved[0].profile.Z}
                rMax={Math.max(...solved.map(({ profile }) => profile.displayRadius))}
                scale="linear" width={width} collapsible={isMedium} peaks={[]} cutFaceNote={false}
                curves={solved.map(({ profile, slot }) => ({
                    label: elementFor(profile.Z)?.symbol ?? `Z=${profile.Z}`,
                    color: CURVE_COLORS[slot],
                    points: gridRadii(profile.rMin, profile.dx, profile.size).map((r, j) => ({ r, value: profile.total[j] })),
                }))}
            />
        );
    };
```

4. Make the Basic Orbitals seeding effect (the one on `[isAtomMode]` that dispatches `startOrbitalCalculation`) return unless `atomMode === 'hydrogenic'`. Phases 5–6 may already have made this change; if so, leave it.
5. Replace `<OrbitalViewer … />` with `{isCompareMode ? <CompareView panes={comparePanes} /> : <OrbitalViewer … />}`.
6. In `<Box className="side-panel">`, add `{isCompareMode && comparePanel}`. In `.view-panel`, render `{isCompareMode ? renderCompareRadialPlot(PLOT_WIDTH) : <>{existing toggle, controls and plot}</>}`.
7. Make `phoneTabs`, when `isCompareMode`, equal `[{ key: 'explore', label: 'Explore', content: comparePanel }, { key: 'plot', label: 'Plot', content: renderCompareRadialPlot(PHONE_PLOT_WIDTH) }]`.

Append to `src/style.css`, beside `.side-panel .level-nav`:

```css
.side-panel .compare-panel {
  background-color: rgba(240, 240, 240, 0.96);
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
.compare-size { margin-top: 8px; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/compare src/App.test.tsx src/components/Controls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify live.** Start the dev server (Global Constraints). At 1440×900, open http://localhost:5391/#mode=compare&a=atom:11&b=atom:17. Check that the two panes sit between the side panels with sodium visibly larger, that there is one scale bar, and that dragging either pane turns both. Pick First → 87 Fr: its pane says "Solving Francium…" and then draws, with the other pane rescaled to the common radius. Check that the plot on the right overlays both D(r) curves on one axis, and that "Back to one view" returns to the atom. At 390×844 with touch, the panes stack, the Explore tab holds the panel and the Plot tab holds the curves. The console is clean. Record the time from pick to both panes drawn for two cached elements; it must be under 1.5 s (§3.7).

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add src/components/ComparePanel.tsx src/App.tsx src/App.test.tsx src/components/Controls.tsx src/style.css tests/compare
git commit -m "feat(compare): compare mode in the existing columns and phone tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Compare molecules (gated on Phase 6)

**Files:**
- Create: `src/compare/useCompareMolecules.ts`
- Modify: `src/components/CompareView.tsx`, `src/App.tsx`
- Test: `tests/compare/use_compare_molecules.test.tsx`, `tests/compare/compare_view.test.tsx`

**Interfaces:**
- Consumes: `loadMoleculeIndex()`, `loadMoleculeMeta(id)` (whose meta has `name`), `loadDensityGrid(meta): Promise<GridFieldSource>` from `src/molecules/`; Phase 1's `updateFieldInScene(context, request)`.
- Produces: `useCompareMolecules(ids: [string | null, string | null]): { fields: [GridFieldSource | null, GridFieldSource | null]; names: [string | null, string | null]; errors: [string | null, string | null] }`; `ComparePaneContent.field?: GridFieldSource`.

- [ ] **Step 1: Gate.** Run `grep -rn "export .*function loadDensityGrid" src/molecules`. If nothing matches, Phase 6 has not shipped. Add "Compare molecules (Phase 7 Task 6)" to the HANDOFF backlog, keep Task 5's status message, and skip to Task 7. Next run `grep -n "export async function updateFieldInScene" -A6 src/orbital_visualizer.ts` and read how a molecule view passes a `GridFieldSource` to it (`grep -rn "updateFieldInScene(" src/components`). The call below must copy that call shape exactly.

- [ ] **Step 2: Write the failing test**

```tsx
// tests/compare/use_compare_molecules.test.tsx
jest.mock('../../src/molecules', () => ({
    loadMoleculeMeta: jest.fn(async (id: string) => ({ id, name: id === 'h2o' ? 'Water' : 'Carbon dioxide' })),
    loadDensityGrid: jest.fn(async (meta: { id: string }) => ({ kind: 'grid', id: meta.id, shape: [2, 2, 2], origin: [0, 0, 0], spacing: 1, quantity: 'density', values: new Float32Array(8) })),
}));
import { renderHook, waitFor } from '@testing-library/react';
import { useCompareMolecules } from '../../src/compare/useCompareMolecules';
import { loadDensityGrid } from '../../src/molecules';

it('loads each compared molecule once, with its name', async () => {
    const { result } = renderHook(() => useCompareMolecules(['h2o', 'co2']));
    await waitFor(() => expect(result.current.fields.every(Boolean)).toBe(true));
    expect(result.current.names).toEqual(['Water', 'Carbon dioxide']);
    expect(loadDensityGrid).toHaveBeenCalledTimes(2);
});
```

If `src/molecules/index.ts` does not re-export the loaders, point the mock path and the import at the file Step 1's grep found.

- [ ] **Step 3: Run to verify failure**

Run: `npx jest tests/compare/use_compare_molecules.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

```ts
// src/compare/useCompareMolecules.ts
import { useEffect, useState } from 'react';
import { loadMoleculeMeta, loadDensityGrid } from '../molecules';
import type { GridFieldSource } from '../field_source';

type Pair<T> = [T, T];
export interface CompareMolecules { fields: Pair<GridFieldSource | null>; names: Pair<string | null>; errors: Pair<string | null> }

/** Molecules are lazy-loaded (spec §4.2): nothing is fetched until one is compared. */
export function useCompareMolecules(ids: Pair<string | null>): CompareMolecules {
    const [state, setState] = useState<CompareMolecules>({ fields: [null, null], names: [null, null], errors: [null, null] });
    useEffect(() => {
        let cancelled = false;
        ids.forEach((id, slot) => {
            const update = (patch: Partial<{ field: GridFieldSource | null; name: string | null; error: string | null }>) => {
                if (cancelled) return;
                setState(previous => {
                    const next: CompareMolecules = { fields: [...previous.fields], names: [...previous.names], errors: [...previous.errors] } as CompareMolecules;
                    if ('field' in patch) next.fields[slot] = patch.field ?? null;
                    if ('name' in patch) next.names[slot] = patch.name ?? null;
                    if ('error' in patch) next.errors[slot] = patch.error ?? null;
                    return next;
                });
            };
            update({ field: null, name: null, error: null });
            if (!id) return;
            loadMoleculeMeta(id)
                .then(meta => { update({ name: meta.name }); return loadDensityGrid(meta); })
                .then(field => update({ field }))
                .catch(error => update({ error: `Could not load ${id}: ${error instanceof Error ? error.message : String(error)}` }));
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ids[0], ids[1]]);
    return state;
}
```

In `CompareView.tsx`, add `field?: GridFieldSource` to `ComparePaneContent` and import `updateFieldInScene`. In the profiles effect, add a pane whose `field` is set as a second branch: call `updateFieldInScene` with the same request shape Step 1 found, then `.then(() => { ownFraming.current[i] = context.framedRMax; reframeBoth(); })`. Extract the existing "common radius, frame both" lines into `reframeBoth()` so both branches share it, and add `panes[0].field, panes[1].field` to the dependency list. Add a test to `tests/compare/compare_view.test.tsx`: mock `updateFieldInScene` as `jest.fn(async (context) => { context.framedRMax = 7; })`, give pane B a field, and assert `frameOrbital` is called with `(a, 7, true)`.

In `App.tsx`, call `useCompareMolecules` with each subject's id (or null). Use its `names`, `errors` and `fields` in `comparePanes`, and pass `moleculeOptions` from `loadMoleculeIndex()`, loaded once in an effect when compare mode opens.

- [ ] **Step 5: Run, verify live, commit.** Run `npx jest tests/compare`. Expected: PASS. Live-check `#mode=compare&a=molecule:h2o&b=molecule:co2` at both sizes: both densities are drawn at one scale with one scale bar.

```bash
npx tsc --noEmit -p .
git add src/compare/useCompareMolecules.ts src/components/CompareView.tsx src/App.tsx tests/compare
git commit -m "feat(compare): molecules side by side at the same scale

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Lesson model and the four lessons

**Files:**
- Create: `src/lessons/types.ts`, `src/lessons/features.ts`, `src/lessons/highlight_targets.ts`, `src/lessons/periodic_table_shape.ts`, `src/lessons/what_is_a_bond.ts`, `src/lessons/water_bent.ts`, `src/lessons/gold_yellow.ts`, `src/lessons/index.ts`
- Test: `tests/lessons/lessons.test.ts`

**Interfaces:**
- Produces: `type Feature = 'hybrids' | 'relativity' | 'bonds' | 'molecules'`; `type HighlightTarget = 'shell-chips' | 'valence-chip' | 'scale-bar' | 'radial-plot' | 'energy-diagram' | 'combination-caption' | 'relativity-control' | 'what-changed'`; `interface LessonStep { title: string; body: string; hash: string; highlight?: HighlightTarget }`; `interface Lesson { id: string; title: string; summary: string; requires: Feature[]; steps: LessonStep[] }`; `LESSONS: Lesson[]`; `lessonById(id: string): Lesson | null`; `FEATURE_AVAILABLE: Record<Feature, boolean>`; `FEATURE_LABELS: Record<Feature, string>`; `featuresUsedBy(hash: string): Feature[]`; `missingFeatures(lesson, available): Feature[]`; `lessonAvailable(lesson, available): boolean`; `sentenceCount(text: string): number`; `LESSON_TARGET_SELECTORS: Record<HighlightTarget, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lessons/lessons.test.ts
import { LESSONS, lessonById } from '../../src/lessons';
import { featuresUsedBy, lessonAvailable, missingFeatures, sentenceCount } from '../../src/lessons/features';
import { LESSON_TARGET_SELECTORS } from '../../src/lessons/highlight_targets';

describe('lessons', () => {
    it('are the four the spec names, with unique ids', () => {
        expect(LESSONS.map(l => l.title)).toEqual([
            'Why the periodic table has its shape', 'What is a bond?', 'Why water is bent', 'Why gold is yellow',
        ]);
        expect(new Set(LESSONS.map(l => l.id)).size).toBe(4);
        expect(lessonById('nope')).toBeNull();
    });

    const steps = LESSONS.flatMap(lesson => lesson.steps.map((step, i) => [`${lesson.id} #${i + 1}`, step] as const));
    it.each(steps)('%s: a title, two or three sentences, a valid hash', (_label, step) => {
        expect(step.title.length).toBeGreaterThan(0);
        expect(sentenceCount(step.body)).toBeGreaterThanOrEqual(2);
        expect(sentenceCount(step.body)).toBeLessThanOrEqual(3);
        expect(step.body.length).toBeLessThanOrEqual(420);
        expect(step.hash.startsWith('#')).toBe(false);
        expect(new URLSearchParams(step.hash).get('mode')).toBeTruthy();
        if (step.highlight) expect(LESSON_TARGET_SELECTORS[step.highlight]).toBeTruthy();
    });

    it.each(LESSONS.map(l => [l.id, l] as const))('%s declares every feature its steps use', (_id, lesson) => {
        const used = new Set(lesson.steps.flatMap(step => featuresUsedBy(step.hash)));
        for (const feature of used) expect(lesson.requires).toContain(feature);
    });

    it('gates on what is shipped', () => {
        const gold = lessonById('gold-yellow')!;
        const none = { hybrids: false, relativity: false, bonds: false, molecules: false };
        expect(lessonAvailable(lessonById('periodic-table-shape')!, none)).toBe(true);
        expect(missingFeatures(gold, none)).toEqual(['relativity']);
        expect(lessonAvailable(gold, { ...none, relativity: true })).toBe(true);
    });

    it('counts sentences the way the copy is written', () => {
        expect(sentenceCount('At R = 2 a₀ the density piles up. That lowering is the bond.')).toBe(2);
        expect(sentenceCount('It sits at −0.6026 Ha (2.79 eV). Z/137 ≈ 0.58 here. 1s is inside.')).toBe(3);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/lessons/lessons.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the model**

```ts
// src/lessons/types.ts
export type Feature = 'hybrids' | 'relativity' | 'bonds' | 'molecules';
export type HighlightTarget =
    | 'shell-chips' | 'valence-chip' | 'scale-bar' | 'radial-plot'
    | 'energy-diagram' | 'combination-caption' | 'relativity-control' | 'what-changed';

export interface LessonStep {
    title: string;
    /** Two or three sentences, each about what is on screen at this step. */
    body: string;
    /** A URL-state hash without '#' (spec §4.3); applyState drives the app to it. */
    hash: string;
    highlight?: HighlightTarget;
}

export interface Lesson {
    id: string;
    title: string;
    summary: string;
    /** Features from later phases every step needs; the lesson is offered only when all are shipped. */
    requires: Feature[];
    steps: LessonStep[];
}
```

```ts
// src/lessons/highlight_targets.ts
import type { HighlightTarget } from './types';

/** Selectors for what a step points at. A target that is not on screen is simply not highlighted: emphasis, never content. */
export const LESSON_TARGET_SELECTORS: Record<HighlightTarget, string> = {
    'shell-chips': '.level-nav-shells',
    'valence-chip': '.level-nav-shell-chip.valence',
    'scale-bar': '.scale-readout',
    'radial-plot': '.radial-plot',
    'energy-diagram': '.subshell-energy-diagram',
    'combination-caption': '.combination-caption',
    'relativity-control': '.relativity-controls',
    'what-changed': '.relativity-what-changed',
};
```

```ts
// src/lessons/features.ts
import type { Feature, Lesson } from './types';

/**
 * Which later-phase features this build has. Flip a flag only together with
 * tests/lessons/lesson_hashes.test.ts: it probes each feature through the
 * real URL state and fails if a flag and the build disagree, in either direction.
 */
export const FEATURE_AVAILABLE: Record<Feature, boolean> = {
    hybrids: true,
    relativity: true,
    bonds: true,
    molecules: true,
};

export const FEATURE_LABELS: Record<Feature, string> = {
    hybrids: 'hybrid orbitals',
    relativity: 'the Relativity switch',
    bonds: 'Bonds mode',
    molecules: 'the molecule library',
};

export function featuresUsedBy(hash: string): Feature[] {
    const params = new URLSearchParams(hash);
    const used = new Set<Feature>();
    const mode = params.get('mode');
    if (mode === 'bonds') used.add('bonds');
    if (mode === 'molecule') used.add('molecules');
    if (mode === 'compare' && [params.get('a'), params.get('b')].some(v => v?.startsWith('molecule:'))) used.add('molecules');
    if (params.has('combo')) used.add('hybrids');
    if (params.has('rel')) used.add('relativity');
    return [...used];
}

export function missingFeatures(lesson: Lesson, available: Record<Feature, boolean>): Feature[] {
    return lesson.requires.filter(feature => !available[feature]);
}

export function lessonAvailable(lesson: Lesson, available: Record<Feature, boolean>): boolean {
    return missingFeatures(lesson, available).length === 0;
}

/** A sentence ends at . ! or ? followed by whitespace and a capital, digit or opening symbol. Lesson copy avoids abbreviations so this is exact. */
export function sentenceCount(text: string): number {
    return text.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9ΔÅ"“(])/u).filter(Boolean).length;
}
```

```ts
// src/lessons/index.ts
import type { Lesson } from './types';
import { PERIODIC_TABLE_SHAPE } from './periodic_table_shape';
import { WHAT_IS_A_BOND } from './what_is_a_bond';
import { WATER_BENT } from './water_bent';
import { GOLD_YELLOW } from './gold_yellow';

export const LESSONS: Lesson[] = [PERIODIC_TABLE_SHAPE, WHAT_IS_A_BOND, WATER_BENT, GOLD_YELLOW];

export function lessonById(id: string): Lesson | null {
    return LESSONS.find(lesson => lesson.id === id) ?? null;
}
```

- [ ] **Step 4: Write the lessons.** Each body describes what the step's hash puts on screen. Numbers are measured values or the app's own validated results, and none of them is an eigenvalue presented as an excitation energy (R19).

```ts
// src/lessons/periodic_table_shape.ts
import type { Lesson } from './types';

export const PERIODIC_TABLE_SHAPE: Lesson = {
    id: 'periodic-table-shape',
    title: 'Why the periodic table has its shape',
    summary: 'Row lengths 2, 8, 8, 18, 18, 32, 32 are subshell capacities added up in filling order.',
    requires: [],
    steps: [
        {
            title: 'One electron, one shell',
            body: 'Hydrogen has one electron in 1s, the only subshell of the K shell (n = 1). An s subshell holds two electrons, so the K shell is full at two. That is why the first row of the table has just two elements.',
            hash: 'mode=atom&Z=1&level=atom',
            highlight: 'shell-chips',
        },
        {
            title: 'Helium closes the first row',
            body: 'Helium\'s second electron fills 1s: still one ring on the cut face, now complete. The next electron cannot join it and has to start the L shell, further out. A full shell is why helium does not react.',
            hash: 'mode=atom&Z=2&level=atom',
        },
        {
            title: 'Lithium starts a new row',
            body: 'Lithium\'s third electron goes into 2s, and a second, outer ring appears around the 1s core. The navigation card names it the valence shell: one s electron outside a closed core. Sodium and potassium below lithium share that valence configuration, which is what a column means.',
            hash: 'mode=atom&Z=3&level=atom',
            highlight: 'valence-chip',
        },
        {
            title: 'Eight across: 2s and 2p',
            body: 'Neon\'s L shell is open here: one 2s sphere inside three 2p dumbbells. The s subshell holds 2 electrons and the p subshell 6, so rows 2 and 3 are eight elements wide. The plot shows 2s and 2p at a similar distance from the nucleus, which is what makes them one shell.',
            hash: 'mode=atom&Z=10&level=shell&n=2',
            highlight: 'radial-plot',
        },
        {
            title: 'A new row starts bigger',
            body: 'Sodium adds a third shell: one 3s electron outside neon\'s closed core. Watch the scale bar, because this atom is much larger than neon. Atoms shrink across a row as the nuclear charge grows, then jump in size where the next row begins.',
            hash: 'mode=atom&Z=11&level=atom',
            highlight: 'scale-bar',
        },
        {
            title: 'Ten middle columns: the d-block',
            body: 'In the fourth row 4s fills first, and then the 3d subshell, ten places in the M shell underneath, fills across the next ten elements. Iron\'s M shell shows five 3d cloverleaves beside 3s and 3p. Those ten places are the ten middle columns.',
            hash: 'mode=atom&Z=26&level=shell&n=3',
            highlight: 'energy-diagram',
        },
        {
            title: 'Fourteen more: the f-block',
            body: 'In rows 6 and 7 an f subshell fills as well, fourteen places each: the two detached rows at the bottom of the table. Uranium\'s O shell holds three 5f electrons beside full 5s, 5p and 5d. Rows run 2, 8, 8, 18, 18, 32, 32 because the capacities 2, 6, 10 and 14 add up that way in filling order.',
            hash: 'mode=atom&Z=92&level=shell&n=5',
            highlight: 'energy-diagram',
        },
    ],
};
```

```ts
// src/lessons/what_is_a_bond.ts
import type { Lesson } from './types';

export const WHAT_IS_A_BOND: Lesson = {
    id: 'what-is-a-bond',
    title: 'What is a bond?',
    summary: 'From one proton to H₂⁺ solved exactly, then H₂, He₂ and O₂ from their orbital diagrams.',
    requires: ['bonds'],
    steps: [
        {
            title: 'One proton, one electron',
            body: 'This is hydrogen\'s 1s orbital, exact, with the surface enclosing 90 % of the electron. Its energy, −0.5 Ha, is the reference every bond below is measured from. Now bring up a second proton.',
            hash: 'mode=basic&n=1&l=0&ml=0&frac=0.9',
        },
        {
            title: 'Two protons, far apart',
            body: 'H₂⁺ is one electron shared by two protons, solved exactly at any separation R. At R = 8 a₀ the 1σg state is just two halves of a 1s orbital, one on each proton, and the energy curve beside it is nearly flat. Nothing holds the protons together yet.',
            hash: 'mode=bonds&system=h2plus&R=8&state=1sg',
        },
        {
            title: 'The bond',
            body: 'At R = 2 a₀ the density piles up between the nuclei, where the electron is attracted by both at once. This is the minimum of the energy curve: −0.6026 Ha, which is 0.1026 Ha (2.79 eV) below a hydrogen atom and a bare proton. That lowering is the bond.',
            hash: 'mode=bonds&system=h2plus&R=2&state=1sg',
        },
        {
            title: 'The antibonding state',
            body: 'The 1σu* state at the same distance has a node on the plane midway between the nuclei, so density is pushed out of the region that binds. Its energy curve runs downhill as R grows, which pushes the protons apart. One node is the whole difference between bonding and antibonding.',
            hash: 'mode=bonds&system=h2plus&R=2&state=1su',
        },
        {
            title: 'Too close',
            body: 'Push the protons in to R = 0.8 a₀ and the energy climbs steeply, because their repulsion now outweighs the extra attraction. The bond length is the balance point between the two.',
            hash: 'mode=bonds&system=h2plus&R=0.8&state=1sg',
        },
        {
            title: 'Two electrons: H₂',
            body: 'H₂ puts a second electron into the same bonding orbital, with opposite spin. The diagram shows two electrons bonding and none antibonding: bond order 1. The bond is shorter and stronger than in H₂⁺, at 1.401 a₀ and 4.75 eV.',
            hash: 'mode=bonds&system=h2',
        },
        {
            title: 'Helium does not bond',
            body: 'He₂ would have four electrons, two bonding and two in the antibonding orbital. The bond order is (2 − 2)/2 = 0, and the energy curve has no well of any chemical depth. This is why helium gas is made of single atoms.',
            hash: 'mode=bonds&system=he2',
        },
        {
            title: 'Oxygen is magnetic',
            body: 'In O₂ the last two electrons go one each into the two π* orbitals with parallel spins, as the diagram shows. Two unpaired electrons make O₂ a triplet, which is why liquid oxygen sticks to a magnet.',
            hash: 'mode=bonds&system=o2',
        },
    ],
};
```

```ts
// src/lessons/water_bent.ts
import type { Lesson } from './types';

export const WATER_BENT: Lesson = {
    id: 'water-bent',
    title: 'Why water is bent',
    summary: 'Four electron pairs around oxygen, seen as hybrids, as density, as charge and as orbitals.',
    requires: ['hybrids', 'molecules'],
    steps: [
        {
            title: 'Oxygen\'s valence shell',
            body: 'Oxygen has six valence electrons in its L shell: 2s² 2p⁴. The model here spherically averages them, so the shell has no preferred direction. Bonding is what picks directions out.',
            hash: 'mode=atom&Z=8&level=shell&n=2',
            highlight: 'shell-chips',
        },
        {
            title: 'Four directions: sp³',
            body: 'Mixing one 2s and three 2p orbitals gives four equivalent sp³ hybrids, pointing to the corners of a tetrahedron 109.47° apart. They are a basis choice for one atom, not a new state, but they name the directions four electron pairs spread into. Oxygen in water has four pairs: two bonds and two lone pairs.',
            hash: 'mode=basic&n=2&l=1&ml=0&combo=sp3&member=all',
            highlight: 'combination-caption',
        },
        {
            title: 'Water\'s density',
            body: 'This is water\'s total electron density from a B3LYP calculation at the experimental geometry, and the O–H bonds meet at 104.5°, not 180°. Four pairs arranged roughly tetrahedrally around oxygen cannot make a straight molecule. The angle is under 109.47° because lone pairs spread wider than bonds and squeeze them together.',
            hash: 'mode=molecule&id=h2o&show=density&iso=0.9',
        },
        {
            title: 'Where the charge sits',
            body: 'Mapped onto the density, the electrostatic potential is red (negative) on oxygen\'s lone-pair side and blue (positive) at the hydrogens. Because the molecule is bent, its two bond dipoles add instead of cancelling, and the dipole arrow shows the result, about 1.85 D.',
            hash: 'mode=molecule&id=h2o&show=esp&iso=0.9',
        },
        {
            title: 'The lone pairs as orbitals',
            body: 'The highest occupied orbital, 1b₁, is an oxygen p orbital standing perpendicular to the molecular plane: a lone pair with no hydrogen character. The other lone-pair orbital, 3a₁, mixes with the bonds, so these orbitals are not two identical rabbit ears. Both pictures add up to the same total density.',
            hash: 'mode=molecule&id=h2o&show=mo:4&iso=0.9',
        },
        {
            title: 'Linear by contrast',
            body: 'Carbon dioxide has no lone pairs on its central atom, only two double bonds, so it is linear. Its two bond dipoles point in opposite directions and cancel, leaving zero net dipole against water\'s 1.85 D. Both are drawn here at the same scale.',
            hash: 'mode=compare&a=molecule:h2o&b=molecule:co2',
        },
    ],
};
```

```ts
// src/lessons/gold_yellow.ts
import type { Lesson } from './types';

/**
 * Relativity keys are Phase 4's: rel=off|scalar|so. Gold defaults to scalar
 * from Cs onward, so "without relativity" has to say rel=off explicitly.
 */
export const GOLD_YELLOW: Lesson = {
    id: 'gold-yellow',
    title: 'Why gold is yellow',
    summary: 'Relativity pulls gold\'s 6s in and pushes its 5d out, and the gap between them moves into visible light.',
    requires: ['relativity'],
    steps: [
        {
            title: 'Silver, for reference',
            body: 'Silver\'s valence is one 5s electron above a filled 4d subshell. Lifting a 4d electron into the 5s level takes about 3.7 eV, which is ultraviolet light, so silver reflects every visible colour alike and looks white. Gold sits directly below it in the table.',
            hash: 'mode=atom&Z=47&level=atom&rel=off',
        },
        {
            title: 'Gold without relativity',
            body: 'Gold repeats silver\'s pattern one row down: 5d¹⁰ 6s¹. Solved without relativity, as this app originally did, gold\'s 6s orbital energy is 27 % away from the relativistic reference. That error is the whole story of gold\'s colour.',
            hash: 'mode=atom&Z=79&level=shell&n=6&rel=off',
            highlight: 'relativity-control',
        },
        {
            title: 'Switch relativity on',
            body: 'Gold\'s 1s electrons move at about 58 % of the speed of light (Z/137 ≈ 0.58), and relativity pulls s orbitals inward and lowers their energy, all the way out to the valence 6s. The radial plot overlays the non-relativistic 6s curve for comparison, and the readout gives the contraction in percent.',
            hash: 'mode=atom&Z=79&level=shell&n=6&rel=scalar',
            highlight: 'what-changed',
        },
        {
            title: 'The 5d moves the other way',
            body: 'The contracted s and p shells screen the nucleus better, so the 5d orbitals expand and rise in energy. With 6s lowered and 5d raised, the gap between them shrinks.',
            hash: 'mode=atom&Z=79&level=shell&n=5&rel=scalar',
            highlight: 'energy-diagram',
        },
        {
            title: 'Blue absorbed, yellow reflected',
            body: 'In gold metal the 5d-to-6s absorption starts near 2.4 eV instead of silver\'s 3.7 eV, inside the visible range: gold absorbs blue light and reflects red and yellow. The energies on screen belong to the free atom, not the metal\'s bands, but the same shift closes the gap in both. Without relativity, gold would look like silver.',
            hash: 'mode=atom&Z=79&level=atom&rel=scalar',
        },
        {
            title: 'Spin–orbit splitting',
            body: 'With spin–orbit coupling on, every subshell with l > 0 splits into two levels by total angular momentum, so 5d becomes 5d³⁄₂ and 5d⁵⁄₂. The level diagram shows how far apart the heavy nucleus drives them.',
            hash: 'mode=atom&Z=79&level=shell&n=5&rel=so',
            highlight: 'energy-diagram',
        },
        {
            title: 'Mercury, one element on',
            body: 'Mercury\'s filled 6s² is contracted and held just as tightly. Its atoms share those electrons so reluctantly that the bonds between them are weak: relativity is also why mercury is liquid at room temperature.',
            hash: 'mode=atom&Z=80&level=atom&rel=scalar',
        },
    ],
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest tests/lessons/lessons.test.ts`
Expected: PASS. If `sentenceCount` rejects a body, rewrite the sentence; do not loosen the rule.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add src/lessons tests/lessons
git commit -m "feat(lessons): lesson model and the four guided lessons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Lessons and URL state — links, divergence, round trip

**Files:**
- Create: `src/lessons/lesson_url.ts`
- Test: `tests/lessons/lesson_url.test.ts`, `tests/lessons/lesson_hashes.test.ts`

**Interfaces:**
- Consumes: `applyState`, `encodeState` (Phase 2); `store` from `src/store`; `solveSucceeded`; `fakeProfileFor`; `FEATURE_AVAILABLE`; `LESSONS`.
- Produces: `hashContains(expected: string, actual: string): boolean`; `lessonLink(base: string, lessonId: string, stepIndex: number, stepHash: string): string`; `readLessonParams(hash: string): { lessonId: string; stepIndex: number } | null`; `lessonDiverged(stepHash: string, encoded: string, busy: boolean): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lessons/lesson_url.test.ts
import { hashContains, lessonLink, readLessonParams, lessonDiverged } from '../../src/lessons/lesson_url';

describe('lesson URL helpers', () => {
    it('match a step inside a larger view state, numbers numerically', () => {
        expect(hashContains('mode=atom&Z=26&level=shell&n=3', 'mode=atom&Z=26&level=shell&n=3&frac=0.9&cut=x:0')).toBe(true);
        expect(hashContains('mode=bonds&R=2', 'mode=bonds&R=2.000')).toBe(true);
        expect(hashContains('mode=atom&Z=26', 'mode=atom&Z=27')).toBe(false);
        expect(hashContains('mode=atom&rel=off', 'mode=atom')).toBe(false);
    });

    it('build a link that restores the step and the lesson', () => {
        const link = lessonLink('https://x.test/', 'gold-yellow', 2, 'mode=atom&Z=79');
        expect(link).toBe('https://x.test/#mode=atom&Z=79&lesson=gold-yellow&step=3');
        expect(readLessonParams(link.split('#')[1])).toEqual({ lessonId: 'gold-yellow', stepIndex: 2 });
    });

    it.each([
        ['mode=atom', null],
        ['lesson=x&step=abc', { lessonId: 'x', stepIndex: 0 }],
        ['lesson=x&step=0', { lessonId: 'x', stepIndex: 0 }],
        ['#lesson=x&step=99', { lessonId: 'x', stepIndex: 98 }],
    ])('read %p without throwing', (hash, expected) => {
        expect(readLessonParams(hash)).toEqual(expected);
    });

    it('never report divergence while the view is still computing', () => {
        expect(lessonDiverged('mode=atom&Z=26&level=shell&n=3', 'mode=atom&Z=26&level=atom', true)).toBe(false);
        expect(lessonDiverged('mode=atom&Z=26&level=shell&n=3', 'mode=atom&Z=26&level=atom', false)).toBe(true);
    });
});
```

```ts
// tests/lessons/lesson_hashes.test.ts
/**
 * The contract between the lessons and every other phase's URL keys. Each
 * available lesson's steps must survive applyState -> encodeState on the
 * real store. Each feature flag must agree with the build, in both directions.
 */
import '../../src/compare/compare_url';
import { applyState, encodeState } from '../../src/url_state';
import { store } from '../../src/store';
import { solveSucceeded } from '../../src/store/atomSlice';
import { LESSONS } from '../../src/lessons';
import { FEATURE_AVAILABLE, lessonAvailable } from '../../src/lessons/features';
import { hashContains } from '../../src/lessons/lesson_url';
import type { Feature } from '../../src/lessons/types';
import { fakeProfileFor } from '../helpers/fake_profile';

/** Apply, stand in for the solve the app's worker would do, and read the state back. */
function roundTrip(hash: string): string {
    applyState(hash);
    const { atom } = store.getState();
    if (atom.mode === 'atom' && atom.profile === null) store.dispatch(solveSucceeded(fakeProfileFor(atom.Z)));
    return encodeState();
}

const PROBES: Record<Feature, string> = {
    hybrids: 'mode=basic&n=2&l=1&ml=0&combo=sp3&member=all',
    relativity: 'mode=atom&Z=79&rel=so',
    bonds: 'mode=bonds&system=h2plus&R=2&state=1sg',
    molecules: 'mode=molecule&id=h2o&show=density',
};

describe('lesson hashes against the real URL state', () => {
    it.each(Object.keys(PROBES) as Feature[])('the %s flag matches the build', feature => {
        expect(hashContains(PROBES[feature], roundTrip(PROBES[feature]))).toBe(FEATURE_AVAILABLE[feature]);
    });

    const steps = LESSONS.filter(lesson => lessonAvailable(lesson, FEATURE_AVAILABLE))
        .flatMap(lesson => lesson.steps.map((step, i) => [`${lesson.id} #${i + 1}`, step.hash] as const));
    it.each(steps)('%s round-trips', (_label, hash) => {
        expect(roundTrip(hash)).toEqual(expect.any(String));
        expect(hashContains(hash, encodeState())).toBe(true);
    });
});
```

If Phase 2 registers modes in modules that `src/url_state.ts` does not itself import, add those modules as side-effect imports at the top of this test. List them with `grep -rln "registerUrlKeys(" src`. Phase 5's `bonds` mode may need its own stand-in for a slow computation; it does not if H₂⁺ state is kept in its slice, which is what the round trip reads.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/lessons/lesson_url.test.ts tests/lessons/lesson_hashes.test.ts`
Expected: FAIL — `Cannot find module '../../src/lessons/lesson_url'`.

- [ ] **Step 3: Implement**

```ts
// src/lessons/lesson_url.ts
export const LESSON_KEY = 'lesson';
export const STEP_KEY = 'step';

const strip = (hash: string) => hash.replace(/^#/, '');

function valuesMatch(expected: string, actual: string | null): boolean {
    if (actual === null) return false;
    if (expected === actual) return true;
    const e = Number(expected);
    const a = Number(actual);
    return expected.trim() !== '' && Number.isFinite(e) && Number.isFinite(a)
        && Math.abs(e - a) <= 1e-9 * Math.max(1, Math.abs(e));
}

/** Whether every key of `expected` is in `actual` with the same value; numbers compare as numbers ("2" = "2.000"). */
export function hashContains(expected: string, actual: string): boolean {
    const have = new URLSearchParams(strip(actual));
    for (const [key, value] of new URLSearchParams(strip(expected))) {
        if (!valuesMatch(value, have.get(key))) return false;
    }
    return true;
}

/** The step's own state plus which lesson and step (1-based, as a reader would count). */
export function lessonLink(base: string, lessonId: string, stepIndex: number, stepHash: string): string {
    return `${base}#${stepHash}&${LESSON_KEY}=${encodeURIComponent(lessonId)}&${STEP_KEY}=${stepIndex + 1}`;
}

/** Tolerant by design (spec §4.3); the lesson id and step range are checked by the reducer, which knows the lessons. */
export function readLessonParams(hash: string): { lessonId: string; stepIndex: number } | null {
    const params = new URLSearchParams(strip(hash));
    const lessonId = params.get(LESSON_KEY);
    if (!lessonId) return null;
    const step = Number(params.get(STEP_KEY) ?? '1');
    return { lessonId, stepIndex: Number.isInteger(step) && step >= 1 ? step - 1 : 0 };
}

/**
 * Whether the reader has explored away from the step. Never while the view
 * is still computing: during a solve the encoded state lags the step (the
 * level waits for the profile), and "you moved away" would be false.
 */
export function lessonDiverged(stepHash: string, encoded: string, busy: boolean): boolean {
    return !busy && !hashContains(stepHash, encoded);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/lessons`
Expected: PASS. **If `lesson_hashes` fails,** read the failing hash against the mode's `registerUrlKeys` call. Where another phase used a different key or value (for example `hybrid=` instead of `combo=`), fix the lesson hash and the matching `PROBES` entry, and update `featuresUsedBy` if the key it tests changed. Where a feature's phase has not shipped, set its `FEATURE_AVAILABLE` flag to `false`. Record every such correction in the commit message.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit -p .
git add src/lessons/lesson_url.ts src/lessons tests/lessons
git commit -m "feat(lessons): lesson links, divergence check, round trip against every mode's URL keys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Lesson state, lesson panel, Learn card

**Files:**
- Create: `src/store/lessonSlice.ts`, `src/lessons/useLessonDriver.ts`, `src/lessons/useLessonHighlight.ts`, `src/lessons/useEncodedState.ts`, `src/components/LessonPanel.tsx`, `src/components/LearnCard.tsx`
- Modify: `src/store/index.ts`, `src/style.css`
- Test: `tests/lessons/lesson_slice.test.ts`, `tests/lessons/lesson_panel.test.tsx`, `tests/lessons/learn_card.test.tsx`, `tests/lessons/lesson_hooks.test.tsx`

**Interfaces:**
- Consumes: Tasks 7–8.
- Produces:
  - `LessonState { lessonId: string | null; stepIndex: number; applyNonce: number }`, with actions `startLesson({ lessonId, stepIndex? })`, `goToStep(index)`, `returnToStep()` and `exitLesson()`.
  - `useLessonDriver(apply?: (hash: string) => void): void`.
  - `useLessonHighlight(target: HighlightTarget | null): void`.
  - `useEncodedState(encode?: () => string): string`.
  - `LessonPanel({ lesson, stepIndex, onStep, onGoTo, onReturn, onExit, onCopyLink?, variant?: 'full' | 'header' })`.
  - `LearnCard({ lessons, available, onStartLesson, children? })`, where `children` holds the links added in Tasks 11–14.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lessons/lesson_slice.test.ts
jest.mock('../../src/lessons/features', () => ({
    ...jest.requireActual('../../src/lessons/features'),
    FEATURE_AVAILABLE: { hybrids: true, relativity: false, bonds: true, molecules: true },
}));
import reducer, { startLesson, goToStep, returnToStep, exitLesson } from '../../src/store/lessonSlice';

const initial = reducer(undefined, { type: 'init' });

describe('lesson state', () => {
    it('starts at a clamped step and bumps the apply nonce each time', () => {
        let state = reducer(initial, startLesson({ lessonId: 'periodic-table-shape', stepIndex: 98 }));
        expect(state).toMatchObject({ lessonId: 'periodic-table-shape', stepIndex: 6, applyNonce: 1 });
        state = reducer(state, goToStep(-3));
        expect(state.stepIndex).toBe(0);
        state = reducer(state, returnToStep());
        expect(state.applyNonce).toBe(3);
        expect(reducer(state, exitLesson()).lessonId).toBeNull();
    });

    it.each(['nope', 'gold-yellow'])('ignores %s (unknown, or needing an unshipped feature)', id => {
        expect(reducer(initial, startLesson({ lessonId: id }))).toEqual(initial);
    });
});
```

```tsx
// tests/lessons/lesson_panel.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LessonPanel from '../../src/components/LessonPanel';
import { lessonById } from '../../src/lessons';

const lesson = lessonById('periodic-table-shape')!;
const handlers = () => ({ onGoTo: jest.fn(), onReturn: jest.fn(), onExit: jest.fn(), onCopyLink: jest.fn() });

describe('LessonPanel', () => {
    it('shows the step and moves forward; Previous is off at the start', () => {
        const h = handlers();
        render(<LessonPanel lesson={lesson} stepIndex={0} onStep {...h} />);
        expect(screen.getByText(`Step 1 of ${lesson.steps.length}`)).toBeInTheDocument();
        expect(screen.getByText(lesson.steps[0].body)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        expect(h.onGoTo).toHaveBeenCalledWith(1);
        expect(screen.queryByText(/moved away/)).not.toBeInTheDocument();
    });

    it('finishes on the last step, and offers a way back after exploring', () => {
        const h = handlers();
        render(<LessonPanel lesson={lesson} stepIndex={lesson.steps.length - 1} onStep={false} {...h} />);
        fireEvent.click(screen.getByRole('button', { name: /return to this step/i }));
        fireEvent.click(screen.getByRole('button', { name: /finish/i }));
        expect(h.onReturn).toHaveBeenCalled();
        expect(h.onExit).toHaveBeenCalled();
    });

    it('fits a phone header in one line with labelled arrows', () => {
        const h = handlers();
        render(<LessonPanel lesson={lesson} stepIndex={2} onStep variant="header" {...h} />);
        fireEvent.click(screen.getByRole('button', { name: 'next step' }));
        expect(h.onGoTo).toHaveBeenCalledWith(3);
        expect(screen.getByText(`3/${lesson.steps.length} · ${lesson.steps[2].title}`)).toBeInTheDocument();
    });
});
```

```tsx
// tests/lessons/learn_card.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LearnCard from '../../src/components/LearnCard';
import { LESSONS } from '../../src/lessons';

it('starts available lessons and says what the others need', () => {
    const onStartLesson = jest.fn();
    render(<LearnCard lessons={LESSONS} available={{ hybrids: true, relativity: false, bonds: true, molecules: true }} onStartLesson={onStartLesson} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why the periodic table has its shape' }));
    expect(onStartLesson).toHaveBeenCalledWith('periodic-table-shape');
    expect(screen.getByRole('button', { name: 'Why gold is yellow' })).toBeDisabled();
    expect(screen.getByText('Needs the Relativity switch')).toBeInTheDocument();
});
```

```tsx
// tests/lessons/lesson_hooks.test.tsx
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, renderHook, act, waitFor } from '@testing-library/react';
import lessonReducer, { startLesson, goToStep } from '../../src/store/lessonSlice';
import { useLessonDriver } from '../../src/lessons/useLessonDriver';
import { useLessonHighlight } from '../../src/lessons/useLessonHighlight';
import { lessonById } from '../../src/lessons';

jest.mock('../../src/url_state', () => ({ applyState: jest.fn(), encodeState: jest.fn(() => ''), registerUrlKeys: jest.fn() }));

it('applies each step it is moved to', () => {
    const store = configureStore({ reducer: { lesson: lessonReducer } });
    const apply = jest.fn();
    renderHook(() => useLessonDriver(apply), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
    act(() => { store.dispatch(startLesson({ lessonId: 'periodic-table-shape' })); });
    act(() => { store.dispatch(goToStep(3)); });
    const lesson = lessonById('periodic-table-shape')!;
    expect(apply.mock.calls.map(([hash]) => hash)).toEqual([lesson.steps[0].hash, lesson.steps[3].hash]);
});

it('highlights a target that appears later, and clears it afterwards', async () => {
    const { unmount } = renderHook(() => useLessonHighlight('scale-bar'));
    const { container } = render(<div className="scale-readout" />);
    await waitFor(() => expect(container.firstElementChild).toHaveClass('lesson-highlight'));
    unmount();
    expect(container.firstElementChild).not.toHaveClass('lesson-highlight');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/lessons`
Expected: FAIL — `lessonSlice`, `LessonPanel`, `LearnCard` and the hooks are missing.

- [ ] **Step 3: Implement**

```ts
// src/store/lessonSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { lessonById } from '../lessons';
import { FEATURE_AVAILABLE, lessonAvailable } from '../lessons/features';

export interface LessonState {
    lessonId: string | null;
    stepIndex: number;
    /** Bumped by every action that should (re)apply the current step's hash; the driver keys on it. */
    applyNonce: number;
}

const initialState: LessonState = { lessonId: null, stepIndex: 0, applyNonce: 0 };

const clampStep = (index: number, count: number) => Math.min(count - 1, Math.max(0, Math.trunc(index) || 0));

const lessonSlice = createSlice({
    name: 'lesson',
    initialState,
    reducers: {
        // Unknown ids and lessons whose features are not shipped are ignored: a shared link must never throw (spec §4.3).
        startLesson: (state, action: PayloadAction<{ lessonId: string; stepIndex?: number }>) => {
            const lesson = lessonById(action.payload.lessonId);
            if (!lesson || !lessonAvailable(lesson, FEATURE_AVAILABLE)) return;
            state.lessonId = lesson.id;
            state.stepIndex = clampStep(action.payload.stepIndex ?? 0, lesson.steps.length);
            state.applyNonce += 1;
        },
        goToStep: (state, action: PayloadAction<number>) => {
            const lesson = state.lessonId ? lessonById(state.lessonId) : null;
            if (!lesson) return;
            state.stepIndex = clampStep(action.payload, lesson.steps.length);
            state.applyNonce += 1;
        },
        returnToStep: state => {
            if (state.lessonId) state.applyNonce += 1;
        },
        exitLesson: state => {
            state.lessonId = null;
            state.stepIndex = 0;
        },
    },
});

export const { startLesson, goToStep, returnToStep, exitLesson } = lessonSlice.actions;
export default lessonSlice.reducer;
```

Add `lesson: lessonReducer` to `src/store/index.ts`.

```ts
// src/lessons/useLessonDriver.ts
import { useEffect } from 'react';
import { useAppSelector } from '../store/hooks';
import { applyState } from '../url_state';
import { lessonById } from './index';

/** Drives the app to the current step: the lesson owns no view state of its own, only a hash. */
export function useLessonDriver(apply: (hash: string) => void = applyState): void {
    const { lessonId, stepIndex, applyNonce } = useAppSelector(state => state.lesson);
    useEffect(() => {
        const step = lessonId ? lessonById(lessonId)?.steps[stepIndex] : undefined;
        if (step) apply(step.hash);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lessonId, applyNonce]);
}
```

```ts
// src/lessons/useLessonHighlight.ts
import { useEffect } from 'react';
import type { HighlightTarget } from './types';
import { LESSON_TARGET_SELECTORS } from './highlight_targets';

const CLASS = 'lesson-highlight';

/** Marks what the step talks about. Targets often mount after the step applies (a solve lands, a panel opens), so newly added matches are marked too. */
export function useLessonHighlight(target: HighlightTarget | null): void {
    useEffect(() => {
        if (!target) return;
        const selector = LESSON_TARGET_SELECTORS[target];
        const mark = () => document.querySelectorAll(selector).forEach(element => element.classList.add(CLASS));
        mark();
        const observer = new MutationObserver(mark);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            document.querySelectorAll(`.${CLASS}`).forEach(element => element.classList.remove(CLASS));
        };
    }, [target]);
}
```

```ts
// src/lessons/useEncodedState.ts
import { useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';
import { encodeState } from '../url_state';

/** The current view as a hash. encodeState reads the app's store singleton, which is the store the Provider holds; tests inject `encode`. */
export function useEncodedState(encode: () => string = encodeState): string {
    const store = useStore();
    return useSyncExternalStore(store.subscribe, encode, encode);
}
```

```tsx
// src/components/LessonPanel.tsx
import React from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import type { Lesson } from '../lessons/types';

interface LessonPanelProps {
    lesson: Lesson;
    stepIndex: number;
    /** False once the reader has explored away from the step's view. */
    onStep: boolean;
    onGoTo: (index: number) => void;
    onReturn: () => void;
    onExit: () => void;
    onCopyLink?: () => void;
    variant?: 'full' | 'header';
}

const LessonPanel: React.FC<LessonPanelProps> = ({ lesson, stepIndex, onStep, onGoTo, onReturn, onExit, onCopyLink, variant = 'full' }) => {
    const step = lesson.steps[stepIndex];
    const count = lesson.steps.length;
    const isLast = stepIndex === count - 1;
    if (variant === 'header') {
        return (
            <Box className="lesson-header" role="group" aria-label={`lesson: ${lesson.title}`}>
                <IconButton size="small" aria-label="previous step" disabled={stepIndex === 0} onClick={() => onGoTo(stepIndex - 1)}>‹</IconButton>
                <span className="lesson-header-title">{`${stepIndex + 1}/${count} · ${step.title}`}</span>
                <IconButton size="small" aria-label="next step" disabled={isLast} onClick={() => onGoTo(stepIndex + 1)}>›</IconButton>
            </Box>
        );
    }
    return (
        <Box className="lesson-panel" role="region" aria-label={`Lesson: ${lesson.title}`}>
            <Typography variant="overline" display="block">{`Step ${stepIndex + 1} of ${count}`}</Typography>
            <Typography variant="subtitle1" component="h2">{lesson.title}</Typography>
            <Typography variant="subtitle2" component="h3">{step.title}</Typography>
            <Typography variant="body2" className="lesson-body" aria-live="polite">{step.body}</Typography>
            {!onStep && (
                <Box className="lesson-away">
                    <Typography variant="caption" display="block">You have moved away from this step. Explore as much as you like.</Typography>
                    <Button size="small" onClick={onReturn}>Return to this step</Button>
                </Box>
            )}
            <Box className="lesson-nav">
                <Button size="small" disabled={stepIndex === 0} onClick={() => onGoTo(stepIndex - 1)}>← Previous</Button>
                <Button size="small" variant="contained" onClick={() => (isLast ? onExit() : onGoTo(stepIndex + 1))}>
                    {isLast ? 'Finish' : 'Next →'}
                </Button>
            </Box>
            <Box className="lesson-footer">
                {onCopyLink && <Button size="small" onClick={onCopyLink}>Copy link to this step</Button>}
                <Button size="small" onClick={onExit}>Exit lesson</Button>
            </Box>
        </Box>
    );
};

export default LessonPanel;
```

```tsx
// src/components/LearnCard.tsx
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import type { Feature, Lesson } from '../lessons/types';
import { FEATURE_LABELS, missingFeatures } from '../lessons/features';

interface LearnCardProps {
    lessons: Lesson[];
    available: Record<Feature, boolean>;
    onStartLesson: (lessonId: string) => void;
    /** Methods, citation and embed links (Tasks 11-14). */
    children?: React.ReactNode;
}

const LearnCard: React.FC<LearnCardProps> = ({ lessons, available, onStartLesson, children }) => (
    <Box className="learn-card" component="nav" aria-label="learn">
        <Typography variant="subtitle2" component="h2">Guided lessons</Typography>
        <Box component="ul" className="learn-card-lessons">
            {lessons.map(lesson => {
                const missing = missingFeatures(lesson, available);
                return (
                    <li key={lesson.id}>
                        <Button size="small" disabled={missing.length > 0} onClick={() => onStartLesson(lesson.id)}>{lesson.title}</Button>
                        {missing.length > 0 && (
                            <Typography variant="caption" display="block" className="learn-card-needs">
                                {`Needs ${missing.map(feature => FEATURE_LABELS[feature]).join(' and ')}`}
                            </Typography>
                        )}
                    </li>
                );
            })}
        </Box>
        {children}
    </Box>
);

export default LearnCard;
```

Append to `src/style.css`:

```css
/* Lessons and the Learn card: same card as the navigation they sit with. */
.side-panel .lesson-panel,
.side-panel .learn-card {
  background-color: rgba(240, 240, 240, 0.96);
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
.lesson-body { margin: 6px 0; line-height: 1.45; }
.lesson-nav, .lesson-footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; }
.learn-card-lessons { list-style: none; margin: 4px 0; padding: 0; }
.lesson-header { display: flex; align-items: center; gap: 4px; margin-top: 6px; min-height: 40px; padding: 0 6px;
  border-radius: 10px; background: rgba(240, 240, 240, 0.96); }
.lesson-header-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.lesson-highlight { outline: 2px solid #f4b400; outline-offset: 2px; animation: lesson-pulse 1.2s ease-in-out 2; }
@keyframes lesson-pulse { 50% { outline-color: transparent; } }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/lessons`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit -p .
git add src/store/lessonSlice.ts src/store/index.ts src/lessons src/components/LessonPanel.tsx src/components/LearnCard.tsx src/style.css tests/lessons
git commit -m "feat(lessons): lesson state, step driver, highlight, panel and Learn card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Lessons in the app

**Placement.** A lesson is navigation, so it goes at the top of `.side-panel` on desktop and the Learn card at the bottom of that column. On a phone the full lesson goes at the top of the Explore tab and the Learn card at its end. A one-line step bar in `.phone-header` keeps Previous and Next reachable with the sheet folded. That bar sits inside the existing header, not over the canvas.

**Files:**
- Create: `src/components/phone_tabs.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/style.css`
- Test: `tests/lessons/phone_tabs.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 9's slice, hooks and components; `readLessonParams`, `lessonLink`, `lessonDiverged`.
- Produces: `withExploreContent(tabs: PhoneSheetTab[], before: React.ReactNode, after: React.ReactNode): PhoneSheetTab[]`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/lessons/phone_tabs.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { withExploreContent } from '../../src/components/phone_tabs';

describe('withExploreContent', () => {
    it('wraps an existing Explore tab', () => {
        const tabs = withExploreContent([{ key: 'explore', label: 'Explore', content: <p>nav</p> }, { key: 'plot', label: 'Plot', content: null }], <p>lesson</p>, <p>learn</p>);
        render(<>{tabs[0].content}</>);
        expect(screen.getAllByText(/lesson|nav|learn/).map(e => e.textContent)).toEqual(['lesson', 'nav', 'learn']);
        expect(tabs).toHaveLength(2);
    });

    it('adds an Explore tab first for a mode that has none', () => {
        const tabs = withExploreContent([{ key: 'view', label: 'Orbital & view', content: null }], null, <p>learn</p>);
        expect(tabs.map(t => t.key)).toEqual(['explore', 'view']);
    });
});
```

Add to `src/App.test.tsx`: add `lesson: lessonReducer` to `createTestStore`, then add:

```tsx
    it('shows the lesson at the top of the navigation column, and the Learn card starts one', () => {
        const { store } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Why the periodic table has its shape' }));
        expect(store.getState().lesson.lessonId).toBe('periodic-table-shape');
        expect(screen.getByRole('region', { name: /Lesson: Why the periodic table/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /exit lesson/i }));
        expect(store.getState().lesson.lessonId).toBeNull();
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/lessons/phone_tabs.test.tsx src/App.test.tsx`
Expected: FAIL — `phone_tabs` missing, and no lesson button in App.

- [ ] **Step 3: Implement**

```tsx
// src/components/phone_tabs.tsx
import React from 'react';
import type { PhoneSheetTab } from './PhoneSheet';

/** Navigation belongs in Explore (spec §3.8); a mode without that tab gets one, first. */
export function withExploreContent(tabs: PhoneSheetTab[], before: React.ReactNode, after: React.ReactNode): PhoneSheetTab[] {
    const index = tabs.findIndex(tab => tab.key === 'explore');
    if (index === -1) return [{ key: 'explore', label: 'Explore', content: <>{before}{after}</> }, ...tabs];
    return tabs.map((tab, i) => (i === index ? { ...tab, content: <>{before}{tab.content}{after}</> } : tab));
}
```

Export `PhoneSheetTab` from `PhoneSheet.tsx` if it is not exported already.

In `src/App.tsx`:

```tsx
    const lessonState = useAppSelector(state => state.lesson);
    const activeLesson = lessonState.lessonId ? lessonById(lessonState.lessonId) : null;
    const activeStep = activeLesson?.steps[lessonState.stepIndex] ?? null;
    useLessonDriver();
    useLessonHighlight(activeStep?.highlight ?? null);
    const encodedView = useEncodedState();
    // Busy covers the solve and any mesh in flight: the encoded view lags the step until they land.
    const lessonOnStep = !activeStep || !lessonDiverged(activeStep.hash, encodedView, atomIsSolving || isLoading);
    // A shared lesson link (Task 8's lessonLink) opens its lesson; the rest of the hash is Phase 2's.
    useEffect(() => {
        const fromLink = readLessonParams(window.location.hash);
        if (fromLink) dispatch(startLesson(fromLink));
    }, [dispatch]);
    const copyLessonLink = () => {
        if (!activeLesson || !activeStep) return;
        const base = `${window.location.origin}${window.location.pathname}`;
        void navigator.clipboard?.writeText(lessonLink(base, activeLesson.id, lessonState.stepIndex, activeStep.hash));
    };
    const lessonPanel = (variant: 'full' | 'header') => activeLesson && (
        <LessonPanel
            lesson={activeLesson} stepIndex={lessonState.stepIndex} onStep={lessonOnStep} variant={variant}
            onGoTo={index => dispatch(goToStep(index))} onReturn={() => dispatch(returnToStep())}
            onExit={() => dispatch(exitLesson())} onCopyLink={copyLessonLink}
        />
    );
    const learnCard = (
        <LearnCard lessons={LESSONS} available={FEATURE_AVAILABLE} onStartLesson={id => dispatch(startLesson({ lessonId: id }))} />
    );
```

The wiring:

- **Desktop `.side-panel`:** `{lessonPanel('full')}` becomes the first child and `{learnCard}` the last.
- **Phone tabs:** wrap the final `phoneTabs` as `withExploreContent(phoneTabs, lessonPanel('full'), learnCard)`.
- **Phone header:** render `.phone-header` when `isAtomMode || activeLesson`. Inside it, place `{lessonPanel('header')}` after the `LevelNav` header (which stays conditional on `isAtomMode`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/lessons src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify live** at 1440×900 and at 390×844 with touch:
  - Run all four lessons end to end. Each step lands on the view its text describes; read the text against the screenshot.
  - The highlight appears on the named control.
  - Drill somewhere else mid-lesson: the "moved away" note appears, and "Return to this step" restores the view.
  - Copy a step link, open it in a new tab: the lesson opens at that step. While iron solves, the panel does not claim you moved away.
  - On the phone, the header step bar pages the lesson with the sheet folded.
  - Gated lessons show "Needs …" if a feature is off.
  - With Playwright `browser_emulate_media({ reducedMotion: 'reduce' })`, the highlight does not pulse (Task 17 adds that rule; recheck it there).
  - The console is clean.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add src/components/phone_tabs.tsx src/components/PhoneSheet.tsx src/App.tsx src/App.test.tsx src/style.css tests/lessons
git commit -m "feat(lessons): lessons in the navigation column, the Explore tab and the phone header

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Methods & validation page

**Decision: a separate static page, `/methods.html`, not a hash route or a dialog.** The hash belongs to URL state (§4.3), and a `#/methods` route would fight Phase 2's hash sync. A citable page needs a stable, linkable, printable URL that works without WebGL. And `references.ts` computes phase-1 rows at import (about 1 s), which must never land in the app's entry chunk. The page is a second Vite entry that imports the table lazily behind a "computing" state.

**Files:**
- Create: `public/methods.html`, `src/methods_main.tsx`, `src/methods/MethodsPage.tsx`, `src/methods/methods_text.ts`, `src/methods/methods.css`
- Modify: `vite.config.ts` (alias and multi-page input), `src/components/LevelNav.tsx` (link in "About this model"), `src/App.tsx` (link in the Learn card)
- Test: `tests/methods/methods_page.test.tsx`

**Interfaces:**
- Consumes: `ValidationRow`, `relativeErrorPercent` (Phase 1); `VALIDATION` (lazy, in `methods_main.tsx` only).
- Produces: `METHODS: MethodEntry[]` with `MethodEntry { id; phase; title; paragraphs: string[]; approximations: string[] }`; `PHASE_TITLES: Record<number, string>`; `formatValue(x: number): string`; default export `MethodsPage({ rows: ValidationRow[] | null, methods?: MethodEntry[], children? })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/methods/methods_page.test.tsx
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import MethodsPage, { formatValue } from '../../src/methods/MethodsPage';
import type { ValidationRow } from '../../src/validation/references';

const row = (over: Partial<ValidationRow>): ValidationRow => ({
    phase: 0, quantity: 'total energy', system: 'He', app: -2.834829, reference: -2.834836, unit: 'Ha',
    tolerancePercent: 0.001, referenceSource: 'NIST Atomic Reference Data (LDA)', method: 'central-field SCF, LDA exchange + VWN5', ...over,
});

describe('MethodsPage', () => {
    it('renders one table row per validation row, app beside reference, with deviation and verdict', () => {
        render(<MethodsPage rows={[row({}), row({ phase: 4, system: 'Au', quantity: '6s eigenvalue', app: -0.30, reference: -0.2, tolerancePercent: 1 })]} />);
        const tables = screen.getAllByRole('table');
        expect(tables).toHaveLength(2);
        const he = within(tables[0]).getByRole('row', { name: /He/ });
        expect(he).toHaveTextContent('-2.834829');
        expect(he).toHaveTextContent('-2.834836');
        expect(he).toHaveTextContent('0.00025 %');
        expect(he).toHaveTextContent('within');
        expect(within(tables[1]).getByRole('row', { name: /Au/ })).toHaveTextContent('outside');
    });

    it('describes only methods whose phase has shipped rows, plus the base models', () => {
        render(<MethodsPage rows={[row({})]} />);
        expect(screen.getByRole('heading', { name: 'Neutral atoms (Atom mode)' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /Relativity/ })).not.toBeInTheDocument();
    });

    it('says it is computing until the rows arrive', () => {
        render(<MethodsPage rows={null} />);
        expect(screen.getByRole('status')).toHaveTextContent(/computing/i);
    });

    it('trims values without losing stated precision', () => {
        expect(formatValue(-128.23325)).toBe('-128.23325');
        expect(formatValue(1.0000000000002)).toBe('1');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/methods/methods_page.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/methods/methods_text.ts
export interface MethodEntry { id: string; phase: number; title: string; paragraphs: string[]; approximations: string[] }

export const PHASE_TITLES: Record<number, string> = {
    0: 'Atoms and Basic Orbitals', 1: 'Hybrids and the Stark effect', 3: 'Ions and excited states',
    4: 'Relativity', 5: 'Bonds', 6: 'Molecules',
};

export const METHODS: MethodEntry[] = [
    {
        id: 'hydrogenic', phase: 0, title: 'One-electron orbitals (Basic Orbitals)',
        paragraphs: [
            'ψ = R_nl(r) Y_lm(θ, φ) with the exact analytic radial function for one electron bound to a point nucleus (Z = 1), and real spherical harmonics without the Condon–Shortley phase.',
            'The surface is the density contour enclosing the chosen fraction of the electron, found by binning |ψ|² on a 129³ grid inside a box that holds all but 10⁻⁴ of it; the mesh is marching cubes over that grid.',
        ],
        approximations: ['Non-relativistic and spinless', 'The enclosed fraction is of the sampled box, quantised by the grid'],
    },
    {
        id: 'atom-scf', phase: 0, title: 'Neutral atoms (Atom mode)',
        paragraphs: [
            'A central-field self-consistent field on a logarithmic radial grid: Numerov integration with a shooting eigenvalue search for every occupied subshell, the Hartree potential from the radial Poisson equation, Dirac–Slater exchange and VWN5 correlation (LDA), and adaptive mixing until max|ΔV·r| < 10⁻⁶.',
            'Ground-state configurations come from the NIST ground levels table for Z = 1–118. Hydrogen bypasses the loop and uses the exact Coulomb solution.',
        ],
        approximations: [
            'Open subshells are spherically averaged',
            'LDA has no exact exchange and a self-interaction error: orbital energies are not ionisation energies',
            'Non-relativistic unless Relativity is on; the error grows as about Z² (gold 6s: 27 %)',
        ],
    },
    {
        id: 'hybrids-stark', phase: 1, title: 'Hybrids and an atom in a field',
        paragraphs: [
            'Hybrids are fixed, orthonormal combinations of hydrogenic 2s and 2p orbitals (sp, sp², sp³).',
            'The n = 1 atom in a field F uses first-order perturbation theory, ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ (Dalgarno–Lewis), giving the induced dipole μ = αF with α = 9/2 a₀³. For n = 2 the field selects the parabolic states (2s ± 2p_z)/√2 with first-order shifts ±3F.',
        ],
        approximations: ['Qualitative: hybrids are a basis choice for one atom, not its ground state', 'Valid for F ≪ 1 a.u.; tunnelling ionisation is ignored and fields above 0.05 a.u. are refused'],
    },
    {
        id: 'ions', phase: 3, title: 'Ions and excited configurations',
        paragraphs: [
            'Ions and excited configurations use the same SCF with configurations from a NIST-derived table (transition metals lose 4s first). Ionisation and excitation energies are ΔSCF: differences of two total energies, never orbital eigenvalues.',
            'An anion whose highest occupied eigenvalue is ≥ 0 is unbound in LDA and is reported as such, not drawn.',
        ],
        approximations: ['LDA, spherically averaged, as for neutral atoms'],
    },
    {
        id: 'relativity', phase: 4, title: 'Relativity',
        paragraphs: [
            'Scalar-relativistic: the Koelling–Harmon radial equation (mass-velocity and Darwin terms) inside the same SCF. With spin–orbit: the radial Dirac equation, splitting each l > 0 subshell into j = l ± ½.',
        ],
        approximations: ['Central field and LDA, as for the non-relativistic model', 'No Breit interaction or QED corrections'],
    },
    {
        id: 'bonds', phase: 5, title: 'Bonds',
        paragraphs: [
            'H₂⁺ is solved exactly in prolate spheroidal coordinates, where the Schrödinger equation separates into two ordinary differential equations, at any internuclear distance with the nuclei held fixed.',
            'Other diatomics come from an offline PySCF pipeline (tools/molecules/): energies at CCSD(T)/aug-cc-pVTZ (full CI for H₂) over 20 geometries, densities and orbitals at B3LYP/def2-TZVP.',
        ],
        approximations: ['Born–Oppenheimer: fixed nuclei', 'Kohn–Sham orbitals are a model; only the density is an observable'],
    },
    {
        id: 'molecules', phase: 6, title: 'Molecule library',
        paragraphs: [
            'Geometries come from the stated experimental source. Total density, electrostatic potential and molecular orbitals are computed at B3LYP/def2-TZVP with PySCF and ship as grids (density, potential) or basis-set coefficients (orbitals, evaluated in the browser).',
        ],
        approximations: ['Fixed nuclei at the stated geometry', 'Kohn–Sham orbitals are a model; only the density is an observable'],
    },
];
```

```tsx
// src/methods/MethodsPage.tsx
import React from 'react';
import type { ValidationRow } from '../validation/references';
import { METHODS, MethodEntry, PHASE_TITLES } from './methods_text';

/** Ten significant figures, trailing noise trimmed: the table shows what was stored, not float artefacts. */
export function formatValue(x: number): string {
    return String(Number(x.toPrecision(10)));
}

const deviationPercent = (row: ValidationRow) => (Math.abs(row.app - row.reference) / Math.abs(row.reference)) * 100;

interface MethodsPageProps { rows: ValidationRow[] | null; methods?: MethodEntry[]; children?: React.ReactNode }

const MethodsPage: React.FC<MethodsPageProps> = ({ rows, methods = METHODS, children }) => {
    const phases = [...new Set([0, ...(rows ?? []).map(r => r.phase)])].sort((a, b) => a - b);
    return (
        <main className="methods">
            <p><a href="/">← Back to the viewer</a></p>
            <h1>Methods and validation</h1>
            <p>
                Every number the viewer shows comes from one of the methods below. Each table is generated from the rows the
                test suite asserts, so a row outside its tolerance fails the build before it can be shown here.
            </p>
            {rows === null && <p role="status">Computing the validation rows…</p>}
            {phases.map(phase => {
                const phaseRows = (rows ?? []).filter(r => r.phase === phase);
                return (
                    <section key={phase} aria-labelledby={`phase-${phase}`}>
                        <h2 id={`phase-${phase}`}>{PHASE_TITLES[phase] ?? `Phase ${phase}`}</h2>
                        {methods.filter(m => m.phase === phase).map(method => (
                            <article key={method.id}>
                                <h3>{method.title}</h3>
                                {method.paragraphs.map((text, i) => <p key={i}>{text}</p>)}
                                <ul className="methods-approximations">{method.approximations.map(a => <li key={a}>{a}</li>)}</ul>
                            </article>
                        ))}
                        {phaseRows.length > 0 && (
                            <table>
                                <caption>Validation, {PHASE_TITLES[phase] ?? `phase ${phase}`}</caption>
                                <thead><tr><th>System</th><th>Quantity</th><th>App</th><th>Reference</th><th>Unit</th><th>Deviation</th><th>Tolerance</th><th></th><th>Source</th><th>Method</th></tr></thead>
                                <tbody>
                                    {phaseRows.map(r => {
                                        const deviation = deviationPercent(r);
                                        return (
                                            <tr key={`${r.system}|${r.quantity}`}>
                                                <th scope="row">{r.system}</th><td>{r.quantity}</td>
                                                <td>{formatValue(r.app)}</td><td>{formatValue(r.reference)}</td><td>{r.unit}</td>
                                                <td>{`${deviation.toPrecision(2)} %`}</td><td>{`${r.tolerancePercent} %`}</td>
                                                <td>{deviation <= r.tolerancePercent ? 'within' : 'outside'}</td>
                                                <td>{r.referenceSource}</td><td>{r.method}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </section>
                );
            })}
            {children}
        </main>
    );
};

export default MethodsPage;
```

```tsx
// src/methods_main.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import MethodsPage from './methods/MethodsPage';
import type { ValidationRow } from './validation/references';
import './methods/methods.css';

/** The table is computed at import (about a second of quadrature), so it loads after the page has painted. */
function MethodsRoot() {
    const [rows, setRows] = useState<ValidationRow[] | null>(null);
    useEffect(() => { void import('./validation/references').then(module => setRows(module.VALIDATION)); }, []);
    return <MethodsPage rows={rows} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><MethodsRoot /></React.StrictMode>);
```

```html
<!-- public/methods.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/electron-icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Methods and validation — Electron Orbital Viewer</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/methods_main.tsx"></script>
</body>
</html>
```

```css
/* src/methods/methods.css -- a document, not the app: light, scrolling, printable. */
body { margin: 0; background: #fff; color: #111; font: 16px/1.55 Roboto, system-ui, sans-serif; }
.methods { max-width: 980px; margin: 0 auto; padding: 24px 20px 64px; }
.methods table { width: 100%; border-collapse: collapse; margin: 12px 0 28px; font-size: 14px; font-variant-numeric: tabular-nums; }
.methods caption { text-align: left; font-weight: 600; padding-bottom: 6px; }
.methods th, .methods td { border-bottom: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
.methods a { color: #0d47a1; }
.methods pre { background: #f4f4f4; padding: 12px; overflow-x: auto; }
@media (max-width: 700px) { .methods table { display: block; overflow-x: auto; } }
```

In `vite.config.ts`, add the alias `{ find: /^\/methods_main.tsx$/, replacement: resolve(__dirname, 'src/methods_main.tsx') }` next to the `/main.tsx` alias. Add to `build`:

```ts
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        methods: resolve(__dirname, 'public/methods.html'),
      },
    },
```

In `LevelNav.tsx`, inside the "About this model" `Collapse`, after the paragraph, add `<Link href="/methods.html" target="_blank" rel="noopener" variant="body2">Methods and validation ↗</Link>`. In `App.tsx`, give the `LearnCard` the child `<Button size="small" href="/methods.html" target="_blank" rel="noopener">Methods & validation ↗</Button>`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/methods tests/atom/level_nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify build and live.** Run `npm run build`. Expected: `dist/methods.html` exists, and `grep -L "PHASE_1_ROWS\|relativeErrorPercent" dist/assets/main-*.js` lists the main chunk, which proves the table stayed out of the app bundle. Open http://localhost:5391/methods.html at both sizes. It shows "Computing…", then every phase's tables with app, reference, deviation, "within" and the source. Check that it prints to PDF legibly and that the console is clean.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add public/methods.html src/methods_main.tsx src/methods vite.config.ts src/components/LevelNav.tsx src/App.tsx tests/methods
git commit -m "feat(methods): Methods & validation page generated from the tested rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Cite this — CITATION.cff, "How to cite", Zenodo

**Files:**
- Create: `CITATION.cff`, `src/cite/citation.ts`, `src/methods/HowToCite.tsx`
- Modify: `src/methods_main.tsx` (render `<HowToCite/>` as the page's child), `src/App.tsx` (Learn card link), `README.md` (a "Citing" section)
- Test: `tests/cite/citation.test.ts`, `tests/methods/methods_page.test.tsx`

**Interfaces:**
- Produces: `CITATION: Citation` where `Citation { title; authors: Array<{ given: string; family: string }>; version: string; year: number; url: string; repository: string; doi: string | null; license: string | null }`; `citationText(c?): string`; `citationBibtex(c?): string`; `HowToCite` (a section with `id="cite"`).

- [ ] **Step 1: Gate on the licence answer.** Read `Licence:` in `docs/HANDOFF.md` (Task 1). If it is missing, stop and ask. Use the SPDX id: `MIT`, `Apache-2.0`, `GPL-3.0-or-later` or `ISC`.

- [ ] **Step 2: Write the failing test**

```ts
// tests/cite/citation.test.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CITATION, citationText, citationBibtex } from '../../src/cite/citation';

const cff = readFileSync(resolve(__dirname, '../../CITATION.cff'), 'utf8');
const field = (name: string) => new RegExp(`^${name}:\\s*"?([^"\\n]+)"?`, 'm').exec(cff)?.[1];

describe('citation', () => {
    it('matches CITATION.cff and package.json, so the panel and the archive say the same thing', () => {
        const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
        expect(field('title')).toBe(CITATION.title);
        expect(field('version')).toBe(CITATION.version);
        expect(CITATION.version).toBe(pkg.version);
        expect(field('repository-code')).toBe(CITATION.repository);
        expect(field('url')).toBe(CITATION.url);
        expect(field('license')).toBe(CITATION.license);
        expect(field('doi') ?? null).toBe(CITATION.doi);
        expect(cff).toMatch(new RegExp(`family-names:\\s*"${CITATION.authors[0].family}"`));
    });

    it('formats a reader-facing citation and BibTeX, preferring the DOI', () => {
        const withDoi = { ...CITATION, doi: '10.5281/zenodo.1234567' };
        expect(citationText(withDoi)).toBe(`Shacham, E. (${CITATION.year}). Electron Orbital Viewer (Version ${CITATION.version}) [Computer software]. https://doi.org/10.5281/zenodo.1234567`);
        expect(citationText({ ...CITATION, doi: null })).toMatch(/\[Computer software\]\. https:\/\//);
        expect(citationBibtex(withDoi)).toMatch(/^@software\{shacham\d{4}electron,[\s\S]*doi = \{10\.5281\/zenodo\.1234567\}/);
    });
});
```

Add to `tests/methods/methods_page.test.tsx`: `render(<HowToCite />)`, then assert `screen.getByRole('heading', { name: 'How to cite' })` and that the text of `citationText()` is present.

- [ ] **Step 3: Run to verify failure**

Run: `npx jest tests/cite tests/methods`
Expected: FAIL — `CITATION.cff` and `citation.ts` are missing.

- [ ] **Step 4: Implement.** `CITATION.cff` at the repository root, with the licence from Step 1:

```yaml
cff-version: 1.2.0
message: "If you use this software, please cite it using the metadata below."
type: software
title: "Electron Orbital Viewer"
abstract: "An interactive 3D viewer of electronic structure in the browser: exact one-electron orbitals, self-consistent-field atoms from hydrogen to oganesson, bonds and molecules, with stated methods and published validation."
authors:
  - family-names: "Shacham"
    given-names: "Eyal"
version: "1.0.0"
date-released: "2026-09-25"
license: "MIT"
repository-code: "https://github.com/eshacham/electron-orbital-viewer"
url: "https://d3rhfcclqjt4tf.cloudfront.net"
keywords: ["atomic orbitals", "electronic structure", "density functional theory", "chemistry education", "visualisation"]
```

```ts
// src/cite/citation.ts
/** Mirrors CITATION.cff (tests/cite/citation.test.ts keeps the two identical). */
export interface Citation {
    title: string;
    authors: Array<{ given: string; family: string }>;
    version: string;
    year: number;
    url: string;
    repository: string;
    doi: string | null;
    license: string | null;
}

export const CITATION: Citation = {
    title: 'Electron Orbital Viewer',
    authors: [{ given: 'Eyal', family: 'Shacham' }],
    version: '1.0.0',
    year: 2026,
    url: 'https://d3rhfcclqjt4tf.cloudfront.net',
    repository: 'https://github.com/eshacham/electron-orbital-viewer',
    doi: null,
    license: 'MIT',
};

const locator = (c: Citation) => (c.doi ? `https://doi.org/${c.doi}` : c.url);

export function citationText(c: Citation = CITATION): string {
    const authors = c.authors.map(a => `${a.family}, ${a.given[0]}.`).join(', ');
    return `${authors} (${c.year}). ${c.title} (Version ${c.version}) [Computer software]. ${locator(c)}`;
}

export function citationBibtex(c: Citation = CITATION): string {
    const key = `${c.authors[0].family.toLowerCase()}${c.year}${c.title.split(' ')[0].toLowerCase()}`;
    const fields = [
        `title = {${c.title}}`,
        `author = {${c.authors.map(a => `${a.family}, ${a.given}`).join(' and ')}}`,
        `year = {${c.year}}`,
        `version = {${c.version}}`,
        `url = {${locator(c)}}`,
        ...(c.doi ? [`doi = {${c.doi}}`] : []),
    ];
    return `@software{${key},\n  ${fields.join(',\n  ')}\n}`;
}
```

```tsx
// src/methods/HowToCite.tsx
import React from 'react';
import { CITATION, citationText, citationBibtex } from '../cite/citation';

const HowToCite: React.FC = () => (
    <section id="cite" aria-labelledby="cite-heading">
        <h2 id="cite-heading">How to cite</h2>
        <p>{citationText()}</p>
        <pre aria-label="BibTeX">{citationBibtex()}</pre>
        <p>
            Please cite the version you used: the number is in <a href={CITATION.repository}>the repository</a>&apos;s releases
            {CITATION.doi ? ', and each release has its own DOI under the one above' : ''}. Cite this page for the methods and
            their validation.
        </p>
    </section>
);

export default HowToCite;
```

In `methods_main.tsx`, render `<MethodsPage rows={rows}><HowToCite /></MethodsPage>`. In `App.tsx`, give the Learn card a second child, `<Button size="small" href="/methods.html#cite" target="_blank" rel="noopener">How to cite ↗</Button>`. In `README.md`, add a "Citing" section after "Continuing this work" that points to `CITATION.cff` and `/methods.html#cite`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest tests/cite tests/methods`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add CITATION.cff src/cite src/methods src/methods_main.tsx src/App.tsx README.md tests/cite tests/methods
git commit -m "feat(cite): CITATION.cff and a How to cite section generated from it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: OWNER ACTIONS — Zenodo DOI per release.** These are hand this list to the owner; the implementer does not do them. Report them verbatim in the hand-off.
  1. **(Owner)** Confirm `github.com/eshacham/electron-orbital-viewer` is public. Zenodo archives only public repositories.
  2. **(Owner)** Sign in at https://zenodo.org with GitHub, open *Account → GitHub*, and switch the repository **On**.
  3. **(Owner)** Publish a GitHub release whose tag matches `CITATION.cff`'s version (`v1.0.0`) with *Releases → Draft a new release*. Zenodo archives it and mints a **version DOI** and a **concept DOI**, which always resolves to the latest version.
  4. **(Owner)** Send the concept DOI to the implementer. **(Implementer)** Set `doi:` in `CITATION.cff` and `doi` in `citation.ts`, add the Zenodo badge to `README.md`, run `npx jest tests/cite`, and commit. From then on, every release bumps `version` in `package.json`, `CITATION.cff` and `citation.ts` together (the test enforces it), and Zenodo mints the new version DOI automatically.
  5. **(Owner)** If Zenodo's record shows wrong metadata, tell the implementer; a `.zenodo.json` overrides `CITATION.cff` for Zenodo only.

---

### Task 13: Licence per the owner's decision

**Files:**
- Create: `LICENSE`, `LICENSE-data.md`
- Modify: `package.json` (`license`)
- Test: `tests/cite/citation.test.ts`

- [ ] **Step 1: Add a failing assertion** to `tests/cite/citation.test.ts`:

```ts
    it('states one licence everywhere', () => {
        const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
        const license = readFileSync(resolve(__dirname, '../../LICENSE'), 'utf8');
        expect(pkg.license).toBe(CITATION.license);
        expect(license.length).toBeGreaterThan(500);
        expect(readFileSync(resolve(__dirname, '../../LICENSE-data.md'), 'utf8')).toMatch(/CC BY 4\.0/);
    });
```

Run: `npx jest tests/cite`. Expected: FAIL — `LICENSE` is missing.

- [ ] **Step 2: Implement** for the recorded choice. For **MIT**, `LICENSE` is:

```text
MIT License

Copyright (c) 2026 Eyal Shacham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

For Apache-2.0, GPL-3.0-or-later or ISC, copy the canonical text verbatim from https://spdx.org/licenses/<id>.html (the "Text" section) with the same copyright line. `LICENSE-data.md`:

```markdown
# Licence for generated data

The molecular data under `public/molecules/` (densities, electrostatic potentials, basis sets and
orbital coefficients, and their metadata) were computed for this project with PySCF by
`tools/molecules/`. They are licensed under the Creative Commons Attribution 4.0 International
licence (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/ — attribute them by citing the
software as described in `CITATION.cff`.

The code is licensed separately; see `LICENSE`.
```

Set `package.json` `"license"` to the SPDX id, which must equal `CITATION.license`.

- [ ] **Step 3: Run, then commit**

Run: `npx jest tests/cite`. Expected: PASS.

```bash
git add LICENSE LICENSE-data.md package.json tests/cite
git commit -m "chore: licence the code and the generated data (owner decision, spec §6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Embed mode and copy-embed-code

**Placement.** With `?embed=1` there are no panels at all: no side or view column, no phone header or sheet, no periodic table, no lesson. The canvas keeps its scale bar and ψ key, plus one small "Open in the full app ↗" link, the size of the scale readout. That link is the only way out of the frame, so it is not a new panel in the §3.8 sense. The flag lives in the **query**, because the hash belongs to URL state.

**Files:**
- Create: `src/embed.ts`
- Modify: `src/App.tsx`, `src/components/OrbitalViewer.tsx` (wheel gate), `src/components/LearnCard.tsx` (copy action), `src/style.css`
- Test: `tests/embed.test.ts`, `tests/lessons/learn_card.test.tsx`

**Interfaces:**
- Produces:
  - `isEmbedMode(search: string): boolean`
  - `fullAppUrl(location: { origin: string; pathname: string; search: string }, hash: string): string`
  - `embedSnippet(options: { src: string; title: string; width?: number; height?: number }): string`
  - `embedSrc(location, hash): string`
  - `gateWheelZoom(canvas: HTMLElement, controls: { enableZoom: boolean }): () => void`
  - `copyText(text: string, clipboard?: { writeText(t: string): Promise<void> }): Promise<'copied' | 'manual'>`
  - `LearnCard` prop `embedCode?: () => string`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/embed.test.ts
import { isEmbedMode, fullAppUrl, embedSnippet, embedSrc, gateWheelZoom, copyText } from '../src/embed';

const location = { origin: 'https://x.test', pathname: '/', search: '?embed=1&lang=en' };

describe('embed mode', () => {
    it('is on only for embed=1', () => {
        expect(isEmbedMode('?embed=1')).toBe(true);
        expect(isEmbedMode('?embed=0')).toBe(false);
        expect(isEmbedMode('')).toBe(false);
    });

    it('opens the full app at the same view, without the embed flag', () => {
        expect(fullAppUrl(location, 'mode=atom&Z=26')).toBe('https://x.test/?lang=en#mode=atom&Z=26');
        expect(embedSrc({ ...location, search: '' }, 'mode=atom&Z=26')).toBe('https://x.test/?embed=1#mode=atom&Z=26');
    });

    it('writes an iframe with an escaped title', () => {
        const html = embedSnippet({ src: 'https://x.test/?embed=1#mode=atom&Z=26', title: 'Iron "M" <shell>' });
        expect(html).toBe('<iframe src="https://x.test/?embed=1#mode=atom&amp;Z=26" title="Iron &quot;M&quot; &lt;shell&gt;" width="800" height="600" style="border:0" loading="lazy" allow="fullscreen"></iframe>');
    });

    it('lets the page scroll until the reader clicks into the view', () => {
        const canvas = document.createElement('div');
        const controls = { enableZoom: true };
        const release = gateWheelZoom(canvas, controls);
        expect(controls.enableZoom).toBe(false);
        canvas.dispatchEvent(new Event('pointerdown'));
        expect(controls.enableZoom).toBe(true);
        canvas.dispatchEvent(new Event('pointerleave'));
        expect(controls.enableZoom).toBe(false);
        release();
        expect(controls.enableZoom).toBe(true);
    });

    it('falls back to manual copy without a working clipboard', async () => {
        await expect(copyText('x', undefined)).resolves.toBe('manual');
        await expect(copyText('x', { writeText: () => Promise.reject(new Error('denied')) })).resolves.toBe('manual');
        await expect(copyText('x', { writeText: () => Promise.resolve() })).resolves.toBe('copied');
    });
});
```

Add to `tests/lessons/learn_card.test.tsx`:

```tsx
it('shows the embed code selected when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<LearnCard lessons={LESSONS} available={{ hybrids: true, relativity: true, bonds: true, molecules: true }}
        onStartLesson={() => {}} embedCode={() => '<iframe src="x"></iframe>'} />);
    fireEvent.click(screen.getByRole('button', { name: /copy embed code/i }));
    expect(await screen.findByLabelText('Embed code')).toHaveValue('<iframe src="x"></iframe>');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/embed.test.ts tests/lessons/learn_card.test.tsx`
Expected: FAIL — `src/embed.ts` is missing.

- [ ] **Step 3: Implement**

```ts
// src/embed.ts
type Where = { origin: string; pathname: string; search: string };

/** In the query, not the hash: the hash is the view's state (spec §4.3) and is rewritten as the view changes. */
export function isEmbedMode(search: string): boolean {
    return new URLSearchParams(search).get('embed') === '1';
}

function withQuery(where: Where, edit: (params: URLSearchParams) => void, hash: string): string {
    const params = new URLSearchParams(where.search);
    edit(params);
    const query = params.toString();
    return `${where.origin}${where.pathname}${query ? `?${query}` : ''}#${hash}`;
}

export const fullAppUrl = (where: Where, hash: string) => withQuery(where, p => p.delete('embed'), hash);
export const embedSrc = (where: Where, hash: string) => withQuery(where, p => p.set('embed', '1'), hash);

const escapeAttribute = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function embedSnippet({ src, title, width = 800, height = 600 }: { src: string; title: string; width?: number; height?: number }): string {
    return `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" width="${width}" height="${height}" style="border:0" loading="lazy" allow="fullscreen"></iframe>`;
}

/**
 * In a course page the iframe sits in a scrolling document. OrbitControls
 * turns every wheel event over the canvas into zoom, which traps the reader's
 * scroll. Zoom is enabled only once the reader has pressed on the view.
 */
export function gateWheelZoom(canvas: HTMLElement, controls: { enableZoom: boolean }): () => void {
    const arm = () => { controls.enableZoom = true; };
    const disarm = () => { controls.enableZoom = false; };
    disarm();
    canvas.addEventListener('pointerdown', arm);
    canvas.addEventListener('pointerleave', disarm);
    return () => {
        canvas.removeEventListener('pointerdown', arm);
        canvas.removeEventListener('pointerleave', disarm);
        arm();
    };
}

/** navigator.clipboard is missing on http and can be refused inside iframes; the caller then shows the text to copy by hand. */
export async function copyText(text: string, clipboard?: { writeText(t: string): Promise<void> }): Promise<'copied' | 'manual'> {
    if (!clipboard) return 'manual';
    try {
        await clipboard.writeText(text);
        return 'copied';
    } catch {
        return 'manual';
    }
}
```

In `LearnCard.tsx`, add the optional prop `embedCode?: () => string` and local state `const [embed, setEmbed] = useState<{ status: 'copied' | 'manual'; code: string } | null>(null);`. Render this after `children`:

```tsx
        {embedCode && (
            <Box className="learn-card-embed">
                <Button size="small" onClick={async () => {
                    const code = embedCode();
                    setEmbed({ status: await copyText(code, navigator.clipboard), code });
                }}>Copy embed code</Button>
                <span role="status">{embed?.status === 'copied' ? 'Copied — paste it into your course page.' : ''}</span>
                {embed?.status === 'manual' && (
                    <TextField label="Embed code" value={embed.code} multiline fullWidth size="small" margin="dense"
                        slotProps={{ htmlInput: { readOnly: true } }} onFocus={event => event.target.select()} autoFocus />
                )}
            </Box>
        )}
```

In `App.tsx`:

```tsx
    const embed = useMemo(() => isEmbedMode(window.location.search), []);
```

- When `embed` is true, render none of: `PeriodicTable`, `.side-panel`, `.view-panel`, `.phone-header`, `PhoneSheet`, `ElementPickerDialog`. Instead add:

```tsx
                {embed && (
                    <a className="embed-open-full" target="_blank" rel="noopener" href={fullAppUrl(window.location, encodedView)}>
                        Open in the full app ↗
                    </a>
                )}
```

- Pass `embed={embed}` to `OrbitalViewer`.
- Give `LearnCard` the prop `embedCode={() => embedSnippet({ src: embedSrc(window.location, encodeState()), title: `Electron Orbital Viewer — ${viewDescription}` })}`. Until Task 15 adds `viewDescription`, use `'Electron Orbital Viewer'` as the title.

In `OrbitalViewer.tsx`, add the prop `embed?: boolean` and this effect:

```tsx
    useEffect(() => {
        const context = visualizerContextRef.current;
        if (!embed || !context) return;
        return gateWheelZoom(context.renderer.domElement, context.controls);
    }, [embed]);
```

Append to `src/style.css`:

```css
/* Embed mode's only chrome: the way out of the frame. */
.embed-open-full {
  position: absolute; right: 12px; bottom: 12px; z-index: 12; padding: 6px 10px; border-radius: 6px;
  background: rgba(8, 8, 10, 0.85); border: 1px solid rgba(255, 255, 255, 0.18); color: #fff;
  font: 500 13px 'Roboto', sans-serif; text-decoration: none;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/embed.test.ts tests/lessons src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify live.** Write `/tmp/embed-test.html` containing 3000px of text, then an iframe (from the app's "Copy embed code" at `#mode=atom&Z=26&level=shell&n=3`), then more text. Serve it with `npx vite --port 5392 --strictPort /tmp` started detached, the same way as the dev server. Scroll over the iframe: the page scrolls. Click into it and scroll: the atom zooms. Check that "Open in the full app" opens iron's M shell with all panels. Repeat at 390×844. Over plain http, the copy action shows the text field. The console is clean.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add src/embed.ts src/App.tsx src/components/OrbitalViewer.tsx src/components/LearnCard.tsx src/style.css tests/embed.test.ts tests/lessons
git commit -m "feat(embed): ?embed=1 hides the chrome, gates wheel zoom; copy embed code with a manual fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Accessibility — the 3D view described, and driven by keyboard

**Files:**
- Create: `src/a11y/describe_view.ts`, `src/a11y/keyboard_orbit.ts`
- Modify: `src/App.tsx`, `src/components/OrbitalViewer.tsx`, `src/style.css`
- Test: `tests/a11y/describe_view.test.ts`, `tests/a11y/keyboard_orbit.test.ts`

**Interfaces:**
- Produces: `describeView(state: RootState, encoded?: () => string): string`; `orbitByKey(key: string, position: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 | null`; `ORBIT_STEP_RADIANS = Math.PI / 12`; `OrbitalViewer` props `ariaLabel?: string`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/a11y/describe_view.test.ts
jest.mock('../../src/url_state', () => ({ encodeState: jest.fn(() => ''), applyState: jest.fn(), registerUrlKeys: jest.fn() }));
import { configureStore } from '@reduxjs/toolkit';
import atomReducer, { setElement, solveSucceeded, drillToShell, drillToOrbital, setMode } from '../../src/store/atomSlice';
import orbitalReducer, { setSurfaceStyle, startOrbitalCalculation } from '../../src/store/orbitalSlice';
import compareReducer from '../../src/store/compareSlice';
import { describeView } from '../../src/a11y/describe_view';
import { orbitalName } from '../../src/orbital_names';
import { fakeProfileFor } from '../helpers/fake_profile';
import type { RootState } from '../../src/store';

const make = () => configureStore({ reducer: { atom: atomReducer, orbital: orbitalReducer, compare: compareReducer } });
const text = (store: ReturnType<typeof make>, encoded = '') => describeView(store.getState() as unknown as RootState, () => encoded);

describe('describeView', () => {
    it('reads like the spec example', () => {
        const store = make();
        store.dispatch(setElement(26));
        store.dispatch(solveSucceeded(fakeProfileFor(26)));
        store.dispatch(drillToShell(3));
        store.dispatch(setSurfaceStyle({ clipAxis: 'x', clipPosition: 0 }));
        expect(text(store)).toBe('Iron, M shell, cut along x at 50 %');
        store.dispatch(drillToOrbital(3, 2, 0));
        store.dispatch(setSurfaceStyle({ clipAxis: 'none' }));
        expect(text(store)).toBe(`Iron, ${orbitalName(3, 2, 0)} orbital`);
    });

    it('says when the atom is still being solved', () => {
        const store = make();
        store.dispatch(setElement(79));
        expect(text(store)).toBe('Gold, whole atom, solving');
    });

    it('covers Basic Orbitals, compare, and modes it only knows from the URL', () => {
        const store = make();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(startOrbitalCalculation({ n: 2, l: 1, ml: 0, Z: 1, resolution: 129, rMax: 20, enclosedFraction: 0.9 }));
        expect(text(store)).toBe(`Basic Orbitals: hydrogen ${orbitalName(2, 1, 0)} orbital`);
        store.dispatch(setMode('compare'));
        expect(text(store)).toBe('Comparing Sodium and Chlorine side by side at the same scale');
        store.dispatch(setMode('molecule' as never));
        expect(text(store, 'mode=molecule&id=h2o&show=esp')).toBe('Molecule h2o, electrostatic potential');
    });
});
```

```ts
// tests/a11y/keyboard_orbit.test.ts
import * as THREE from 'three';
import { orbitByKey, ORBIT_STEP_RADIANS } from '../../src/a11y/keyboard_orbit';

describe('orbitByKey', () => {
    const target = new THREE.Vector3(0, 0, 0);
    const start = new THREE.Vector3(10, 0, 3);

    it('turns about z (up) and keeps the distance', () => {
        let p = start.clone();
        for (let i = 0; i < (2 * Math.PI) / ORBIT_STEP_RADIANS; i++) p = orbitByKey('ArrowLeft', p, target)!;
        expect(p.distanceTo(start)).toBeLessThan(1e-9);
        expect(orbitByKey('ArrowRight', start, target)!.length()).toBeCloseTo(start.length(), 12);
    });

    it('tilts without flipping over the pole', () => {
        let p = start.clone();
        for (let i = 0; i < 40; i++) p = orbitByKey('ArrowUp', p, target)!;
        expect(p.z / p.length()).toBeLessThan(1);
        expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0);
    });

    it('zooms, and ignores other keys', () => {
        expect(orbitByKey('+', start, target)!.length()).toBeCloseTo(start.length() * 0.8, 12);
        expect(orbitByKey('-', start, target)!.length()).toBeCloseTo(start.length() * 1.25, 12);
        expect(orbitByKey('a', start, target)).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/a11y`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/a11y/describe_view.ts
import type { RootState } from '../store';
import { encodeState } from '../url_state';
import { elementFor } from '../elements';
import { orbitalName } from '../orbital_names';
import { subshellLabel } from '../atom/configurations';
import { SHELL_VIEW_CUT_AXIS } from '../orbital_presets';

const SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];
const SHOW_NAMES: Record<string, string> = { density: 'total density', esp: 'electrostatic potential' };

function cutPhrase(axis: string, position: number, shellView: boolean): string | null {
    const shown = axis === 'none' ? (shellView ? SHELL_VIEW_CUT_AXIS : null) : axis;
    return shown ? `cut along ${shown} at ${Math.round((1 - position) * 50)} %` : null;
}

const nameOf = (Z: number) => elementFor(Z)?.name ?? `Z = ${Z}`;

/**
 * One sentence saying what the 3D view shows, for screen readers: the canvas
 * itself says nothing. Modes this module has no state shape for (Bonds,
 * molecules) are read from their URL keys, which every mode registers (spec §4.3).
 */
export function describeView(state: RootState, encoded: () => string = encodeState): string {
    const { atom, orbital } = state;
    const style = orbital.surfaceStyle;
    const parts: string[] = [];
    if (atom.mode === 'atom') {
        parts.push(nameOf(atom.Z));
        if (atom.level === 'orbital' && atom.selectedOrbital) {
            const { n, l, ml } = atom.selectedOrbital;
            parts.push(`${orbitalName(n, l, ml)} orbital`);
        } else if (atom.level === 'shell' && atom.selectedShell !== null) {
            parts.push(`${SHELL_LETTERS[atom.selectedShell - 1] ?? `n=${atom.selectedShell}`} shell`);
            if (atom.selectedSubshell) parts.push(`${subshellLabel(atom.selectedSubshell.n, atom.selectedSubshell.l)} isolated`);
        } else {
            parts.push('whole atom');
        }
        const cut = cutPhrase(style.clipAxis, style.clipPosition, atom.level !== 'orbital');
        if (atom.isSolving || (!atom.profile && !atom.error)) parts.push('solving');
        else if (cut) parts.push(cut);
        if (atom.error) parts.push('the calculation failed');
        return parts.join(', ');
    }
    if (atom.mode === 'hydrogenic') {
        const p = orbital.currentParams;
        const base = p ? `Basic Orbitals: hydrogen ${orbitalName(p.n, p.l, p.ml)} orbital` : 'Basic Orbitals';
        const cut = cutPhrase(style.clipAxis, style.clipPosition, false);
        return cut ? `${base}, ${cut}` : base;
    }
    if (atom.mode === 'compare') {
        const label = (s: RootState['compare']['a']) => (s.kind === 'atom' ? nameOf(s.Z) : `molecule ${s.id}`);
        return `Comparing ${label(state.compare.a)} and ${label(state.compare.b)} side by side at the same scale`;
    }
    const params = new URLSearchParams(encoded());
    const mode = String(atom.mode);
    const head = `${mode.charAt(0).toUpperCase()}${mode.slice(1)}${params.get('id') ? ` ${params.get('id')}` : ''}${params.get('system') ? ` ${params.get('system')}` : ''}`;
    const show = params.get('show');
    const showText = show ? (SHOW_NAMES[show] ?? (show.startsWith('mo:') ? `molecular orbital ${show.slice(3)}` : show)) : null;
    return showText ? `${head}, ${showText}` : `${head} view`;
}
```

```ts
// src/a11y/keyboard_orbit.ts
import * as THREE from 'three';

export const ORBIT_STEP_RADIANS = Math.PI / 12;
const POLE_MARGIN = 0.05;
const up = new THREE.Vector3(0, 0, 1);

/**
 * The camera by keyboard, for anyone who cannot drag: arrows orbit about the
 * target with z up (the app's convention), +/- zoom. Returns the new camera
 * position, or null for a key it does not handle.
 */
export function orbitByKey(key: string, position: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 | null {
    const offset = position.clone().sub(target);
    const r = offset.length();
    let polar = Math.acos(THREE.MathUtils.clamp(offset.dot(up) / r, -1, 1));
    let azimuth = Math.atan2(offset.y, offset.x);
    let distance = r;
    switch (key) {
        case 'ArrowLeft': azimuth -= ORBIT_STEP_RADIANS; break;
        case 'ArrowRight': azimuth += ORBIT_STEP_RADIANS; break;
        case 'ArrowUp': polar = Math.max(POLE_MARGIN, polar - ORBIT_STEP_RADIANS); break;
        case 'ArrowDown': polar = Math.min(Math.PI - POLE_MARGIN, polar + ORBIT_STEP_RADIANS); break;
        case '+': case '=': distance *= 0.8; break;
        case '-': case '_': distance *= 1.25; break;
        default: return null;
    }
    return new THREE.Vector3(
        distance * Math.sin(polar) * Math.cos(azimuth),
        distance * Math.sin(polar) * Math.sin(azimuth),
        distance * Math.cos(polar),
    ).add(target);
}
```

In `App.tsx`, add `const viewDescription = useMemo(() => describeView(store.getState()), [encodedView, atomIsSolving, atomError]);` with `const store = useStore<RootState>();`. Render `<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{viewDescription}</div>` inside `#canvas-container`, and pass `ariaLabel={viewDescription}` to `OrbitalViewer`. Use `viewDescription` in the embed title (Task 14).

In `OrbitalViewer.tsx`, give the canvas host `role="img"`, `aria-label={ariaLabel ?? '3D view'}`, `tabIndex={0}`, and:

```tsx
            onKeyDown={event => {
                const context = visualizerContextRef.current;
                if (!context) return;
                if (event.key === 'Home' || event.key === '0') { event.preventDefault(); dispatch(resetView()); return; }
                const next = orbitByKey(event.key, context.camera.position, context.controls.target);
                if (!next) return;
                event.preventDefault();
                context.camera.position.copy(next);
                context.controls.update();
            }}
```

Import `resetView` from `../store/orbitalSlice`.

Append to `src/style.css`:

```css
.visually-hidden {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/a11y src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify live.** Take an a11y snapshot with `take_snapshot`. The view is an `img` named like "Iron, M shell, cut along x at 50 %" and the status region updates on navigation. Tab to the view: a focus ring appears (Task 16 styles it). The arrows orbit, +/- zoom and Home resets. Check both sizes. The console is clean.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add src/a11y src/App.tsx src/components/OrbitalViewer.tsx src/style.css tests/a11y
git commit -m "feat(a11y): describe the 3D view to screen readers; orbit and zoom by keyboard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Accessibility — keyboard navigation audit, contrast, reduced motion

**Keyboard audit findings** (from reading the components). The periodic table puts 118 tiles in the tab order, with no arrow keys and no focus moved into it when it opens. The phone tab bar has no arrow keys. Custom buttons (`.periodic-tile`, `.phone-sheet-tab`, `.view-panel-toggle`, the canvas host) have no visible focus style. MUI controls already handle their own keyboard and focus.

**Contrast findings** (WCAG AA 4.5:1, computed while writing this plan over the worst backdrops a translucent panel can sit on, near-black #050505 and a white-hot lobe #ffffff):

| Pair | Before | Fix | After |
| --- | --- | --- | --- |
| scale readout, plot, ψ key: white on rgba(8,8,10,0.55) | 4.46 | background 0.85 | 13.7 |
| `.radial-plot-note` 0.55 white on the same | 2.50 | background 0.85 | 5.29 |
| `.level-nav-breadcrumbs` white on the light card | 1.59 | `rgba(0,0,0,0.87)` | 10.9+ |
| `.level-nav-valence-note` (opacity 0.6) | 3.83 | opacity 0.75 | 6.48 |
| MUI primary #1976d2 on light cards (0.85) | 2.89 | primary #1565c0, cards 0.96 | 4.63 |
| selected phone tab #1976d2 on 0.97 | 3.79 | #1565c0 | 4.73 |

**Reduced motion.** Level transitions already honour `prefers-reduced-motion`. Not covered yet: OrbitControls damping (the camera keeps gliding after a drag), CSS transitions (the busy dim, the periodic tiles), and the lesson highlight pulse.

**Files:**
- Create: `src/a11y/contrast.ts`, `src/a11y/motion.ts`, `src/theme.ts`
- Modify: `src/periodic_table.ts` (`nextTileByKey`), `src/components/PeriodicTable.tsx`, `src/components/PhoneSheet.tsx`, `src/components/OrbitalViewer.tsx`, `src/components/CompareView.tsx`, `src/App.tsx` (import `appTheme`), `src/style.css`
- Test: `tests/a11y/contrast.test.ts`, `tests/a11y/panel_contrast.test.ts`, `tests/periodic_table.test.ts`, `tests/periodic_table_component.test.tsx`, `tests/phone_sheet.test.tsx`, `tests/a11y/motion.test.ts`

**Interfaces:**
- Produces:
  - `parseCssColor(css: string): [number, number, number, number]`
  - `compositeOver(fg, bg): [number, number, number]`
  - `contrastRatio(a: [number, number, number], b: [number, number, number]): number`
  - `worstCaseContrast(fg: string, panel: string, backdrops?: string[]): number`
  - `nextTileByKey(Z: number, key: string): number | null`
  - `nextTabIndex(current: number, count: number, key: string): number | null`
  - `applyMotionPreference(controls: { enableDamping: boolean }, reduce: boolean): void`
  - `appTheme`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/a11y/contrast.test.ts
import { contrastRatio, parseCssColor, worstCaseContrast } from '../../src/a11y/contrast';

it('implements the WCAG 2 formula', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(parseCssColor('rgba(8, 8, 10, 0.55)')).toEqual([8, 8, 10, 0.55]);
    expect(parseCssColor('#1565c0')).toEqual([0x15, 0x65, 0xc0, 1]);
    expect(worstCaseContrast('#ffffff', 'rgba(8, 8, 10, 0.55)')).toBeCloseTo(4.46, 2);
});
```

```ts
// tests/a11y/panel_contrast.test.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { worstCaseContrast } from '../../src/a11y/contrast';
import { appTheme } from '../../src/theme';

const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
function rule(selector: string): string {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`No rule for ${selector}`);
    return css.slice(start, css.indexOf('}', start));
}

const DARK_85 = 'rgba(8, 8, 10, 0.85)';
const LIGHT_96 = 'rgba(240, 240, 240, 0.96)';
const PAIRS: Array<{ selector: string; declared: string; fg: string; bg: string }> = [
    { selector: '.scale-readout', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
    { selector: '.radial-plot', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
    { selector: '.radial-plot-note', declared: 'color: rgba(255, 255, 255, 0.55)', fg: 'rgba(255, 255, 255, 0.55)', bg: DARK_85 },
    { selector: '.radial-plot-scale', declared: 'color: rgba(255, 255, 255, 0.7)', fg: 'rgba(255, 255, 255, 0.7)', bg: DARK_85 },
    { selector: '.phase-legend', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
    { selector: '#controls', declared: `background-color: ${LIGHT_96}`, fg: 'rgba(0, 0, 0, 0.6)', bg: LIGHT_96 },
    { selector: '.side-panel .level-nav', declared: `background-color: ${LIGHT_96}`, fg: 'rgba(0, 0, 0, 0.87)', bg: LIGHT_96 },
    { selector: '.level-nav-header', declared: `background: ${LIGHT_96}`, fg: 'rgba(0, 0, 0, 0.72)', bg: LIGHT_96 },
    { selector: '.level-nav-breadcrumbs', declared: 'color: rgba(0, 0, 0, 0.87)', fg: 'rgba(0, 0, 0, 0.87)', bg: LIGHT_96 },
    { selector: '.level-nav-valence-note', declared: 'opacity: 0.75', fg: 'rgba(0, 0, 0, 0.6525)', bg: LIGHT_96 },
    { selector: '.level-nav-shell-hint', declared: 'opacity: 0.7', fg: 'rgba(0, 0, 0, 0.609)', bg: LIGHT_96 },
    { selector: '.phone-sheet-tab[aria-selected="true"]', declared: 'color: #1565c0', fg: '#1565c0', bg: 'rgba(240, 240, 240, 0.97)' },
    { selector: '.embed-open-full', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
];

describe('panel text meets WCAG AA over any backdrop', () => {
    it.each(PAIRS.map(p => [p.selector, p] as const))('%s', (selector, pair) => {
        expect(rule(selector)).toContain(pair.declared);
        expect(worstCaseContrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('the theme primary reads on the light cards, and white reads on it', () => {
        const primary = appTheme.palette.primary.main;
        expect(worstCaseContrast(primary, LIGHT_96)).toBeGreaterThanOrEqual(4.5);
        expect(worstCaseContrast('#ffffff', primary)).toBeGreaterThanOrEqual(4.5);
    });
});
```

```ts
// append to tests/periodic_table.test.ts
import { nextTileByKey } from '../src/periodic_table';
describe('nextTileByKey', () => {
    it.each([
        [1, 'ArrowRight', 2], [2, 'ArrowDown', 10], [11, 'ArrowUp', 3], [26, 'ArrowRight', 27],
        [26, 'ArrowDown', 44], [21, 'ArrowLeft', 20], [5, 'Home', 3], [3, 'End', 10], [118, 'ArrowRight', null], [26, 'x', null],
    ])('%i + %s -> %p', (Z, key, expected) => expect(nextTileByKey(Z as number, key as string)).toBe(expected));
});
```

```tsx
// append to tests/periodic_table_component.test.tsx
it('is one tab stop, with arrow keys between tiles', () => {
    render(<PeriodicTable Z={26} onSelect={() => {}} onClose={() => {}} />);
    const iron = screen.getByRole('button', { name: /^Iron/ });
    expect(iron).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: /^Cobalt/ })).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(iron, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /^Cobalt/ })).toHaveFocus();
});
```

```tsx
// tests/phone_sheet.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PhoneSheet, { nextTabIndex } from '../src/components/PhoneSheet';

it('moves between tabs with the arrow keys and keeps one tab stop', () => {
    expect(nextTabIndex(0, 3, 'ArrowLeft')).toBe(2);
    expect(nextTabIndex(2, 3, 'ArrowRight')).toBe(0);
    render(<PhoneSheet tabs={[{ key: 'a', label: 'A', content: 'a' }, { key: 'b', label: 'B', content: 'b' }]} active={null} onChange={() => {}} />);
    const [a, b] = screen.getAllByRole('tab');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(b).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(b).toHaveFocus();
});
```

```ts
// tests/a11y/motion.test.ts
import { applyMotionPreference } from '../../src/a11y/motion';
it('turns camera inertia off for reduced motion', () => {
    const controls = { enableDamping: true };
    applyMotionPreference(controls, true);
    expect(controls.enableDamping).toBe(false);
    applyMotionPreference(controls, false);
    expect(controls.enableDamping).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/a11y tests/periodic_table.test.ts tests/periodic_table_component.test.tsx tests/phone_sheet.test.tsx`
Expected: FAIL. The modules are missing, and `panel_contrast` fails on the current CSS, which is the audit's evidence.

- [ ] **Step 3: Implement**

```ts
// src/a11y/contrast.ts
export type Rgba = [number, number, number, number];
export type Rgb = [number, number, number];

export function parseCssColor(css: string): Rgba {
    const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim());
    if (!rgba) throw new Error(`Unparsed colour ${css}`);
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
}

export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrastRatio(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text on a translucent panel over the 3D view: the backdrop can be the black
 * scene or a lit lobe, so the ratio is the worst over both extremes.
 */
export function worstCaseContrast(fg: string, panel: string, backdrops: string[] = ['#050505', '#ffffff']): number {
    return Math.min(...backdrops.map(backdrop => {
        const surface = compositeOver(parseCssColor(panel), compositeOver(parseCssColor(backdrop), [0, 0, 0]));
        return contrastRatio(compositeOver(parseCssColor(fg), surface), surface);
    }));
}
```

```ts
// src/a11y/motion.ts
/** Damping keeps the camera gliding after a drag: motion the user did not ask for, so it goes with prefers-reduced-motion. */
export function applyMotionPreference(controls: { enableDamping: boolean }, reduce: boolean): void {
    controls.enableDamping = !reduce;
}
```

```ts
// src/theme.ts -- moved out of App.tsx so its contrast is testable.
import { createTheme } from '@mui/material';

export const appTheme = createTheme({
    palette: {
        // #1976d2 (MUI's default) is 2.9:1 on the translucent light cards; #1565c0 is 4.6:1 at 0.96 opacity.
        primary: { main: '#1565c0' },
        secondary: { main: '#dc004e' },
        background: { default: '#050505' },
    },
});
```

In `App.tsx`, delete the local `createTheme` block (keeping its background comment in `theme.ts`) and use `<ThemeProvider theme={appTheme}>`.

Append to `src/periodic_table.ts`:

```ts
/** Grid position as drawn: main table by period and group; the detached rows below, indented to start under group 3. */
function positionOf(tile: Tile): { row: number; col: number } {
    return tile.group !== null
        ? { row: tile.period, col: tile.group }
        : { row: tile.period + 2, col: (tile.fIndex ?? 0) + 3 };
}

/** Arrow-key movement across the table as it looks, so keyboard users move the way sighted users read. */
export function nextTileByKey(Z: number, key: string): number | null {
    const current = tileOf(Z);
    if (!current) return null;
    const here = positionOf(current);
    const placed = PERIODIC_TABLE.map(tile => ({ Z: tile.atomicNumber, ...positionOf(tile) }));
    const sameRow = placed.filter(p => p.row === here.row).sort((a, b) => a.col - b.col);
    const nearestInRow = (row: number) => {
        const candidates = placed.filter(p => p.row === row);
        if (candidates.length === 0) return null;
        return candidates.reduce((best, p) => (Math.abs(p.col - here.col) < Math.abs(best.col - here.col) ? p : best)).Z;
    };
    const rows = [...new Set(placed.map(p => p.row))].sort((a, b) => a - b);
    const rowIndex = rows.indexOf(here.row);
    switch (key) {
        case 'ArrowRight': return sameRow.find(p => p.col > here.col)?.Z ?? null;
        case 'ArrowLeft': return [...sameRow].reverse().find(p => p.col < here.col)?.Z ?? null;
        case 'ArrowDown': return rowIndex < rows.length - 1 ? nearestInRow(rows[rowIndex + 1]) : null;
        case 'ArrowUp': return rowIndex > 0 ? nearestInRow(rows[rowIndex - 1]) : null;
        case 'Home': return sameRow[0].Z;
        case 'End': return sameRow[sameRow.length - 1].Z;
        default: return null;
    }
}
```

In `PeriodicTable.tsx`, add `const [focusZ, setFocusZ] = useState(Z);` and `const panelRef = useRef<HTMLDivElement>(null);`. Give `<Box className="periodic-table-panel" ref={panelRef} …>`. Add `useEffect(() => { panelRef.current?.querySelector<HTMLButtonElement>('.periodic-tile[tabindex="0"]')?.focus(); }, []);` so focus moves into the pop-over when it opens. On each tile, set `tabIndex={tile.atomicNumber === focusZ ? 0 : -1}` and:

```tsx
                onKeyDown={event => {
                    const next = nextTileByKey(tile.atomicNumber, event.key);
                    if (next === null) return;
                    event.preventDefault();
                    setFocusZ(next);
                    panelRef.current?.querySelector<HTMLButtonElement>(`.periodic-tile[data-z="${next}"]`)?.focus();
                }}
```

In `PhoneSheet.tsx`:

```tsx
export function nextTabIndex(current: number, count: number, key: string): number | null {
    if (key === 'ArrowRight') return (current + 1) % count;
    if (key === 'ArrowLeft') return (current - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
}
```

Keep a `focusIndex` state, initialised to the active tab's index or 0. Give each tab `tabIndex={i === focusIndex ? 0 : -1}` and an `onKeyDown` that computes `nextTabIndex`, prevents default, sets `focusIndex`, and focuses `document.getElementById(`phone-tab-${tabs[next].key}`)`. Activation stays on click, Enter or Space (the manual-activation tabs pattern), because opening the sheet is a deliberate act.

In `OrbitalViewer.tsx`, add `useEffect(() => { const c = visualizerContextRef.current; if (c) applyMotionPreference(c.controls, prefersReducedMotion); }, [prefersReducedMotion]);`. In `CompareView.tsx`, apply it to both contexts with `useMediaQuery(PREFERS_REDUCED_MOTION)`.

In `src/style.css`:

- Change `background: rgba(8, 8, 10, 0.55);` to `0.85` in `.scale-readout`, `.radial-plot` and `.phase-legend`.
- In `#controls` and `.side-panel .level-nav`, change `background-color: rgba(240, 240, 240, 0.85)` to `0.96`, and delete `#controls`'s stale "85% opacity" comment.
- In `.level-nav-header`, change `background: rgba(240, 240, 240, 0.94)` to `0.96`.
- Change `.level-nav-breadcrumbs` to `color: rgba(0, 0, 0, 0.87);`.
- Change `.level-nav-valence-note` to `opacity: 0.75;`.
- Change `.phone-sheet-tab[aria-selected="true"]` to `color: #1565c0; border-top-color: #1565c0;`.

Then append:

```css
/* Visible keyboard focus: amber on the dark surfaces, blue on the light ones (both >= 3:1 against their surface). */
.periodic-tile:focus-visible, .view-panel-toggle:focus-visible, #orbital-canvas-host:focus-visible,
.embed-open-full:focus-visible, .compare-canvas-host:focus-visible {
  outline: 2px solid #f4b400;
  outline-offset: 2px;
}
.phone-sheet-tab:focus-visible { outline: 2px solid #1565c0; outline-offset: -4px; }

/* Reduced motion: nothing animates that the user did not directly move. Level transitions already cut instantly (OrbitalViewer). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .lesson-highlight { animation: none; }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/a11y tests/periodic_table.test.ts tests/periodic_table_component.test.tsx tests/phone_sheet.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual audit, live (documented).**
  1. **Keyboard only, 1440×900:** from page load, Tab reaches the periodic table (focus is inside it), arrows move and Enter selects. Then Tab through the navigation card, the Learn card, the view settings and the canvas (arrows orbit), and into a lesson (Next and Previous). Every stop shows a focus ring, and nothing traps focus except the open table, which Escape closes. Repeat at 390×844 with the tab bar (arrows between tabs, Enter opens).
  2. **Lighthouse:** run chrome-devtools `lighthouse_audit` with the accessibility category, desktop and mobile, on `/`, `/#mode=compare&a=atom:11&b=atom:17` and `/methods.html`. Target a score ≥ 95 with no colour-contrast failures. Fix anything flagged in the task that owns the code.
  3. **Reduced motion:** Playwright `browser_emulate_media({ reducedMotion: 'reduce' })`. Drill atom → shell: the view cuts instantly. A drag stops dead on release. The lesson highlight does not pulse.
  4. Record the Lighthouse scores and anything left open under "Accessibility audit (Phase 7)" in `docs/HANDOFF.md`.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p .
git add src/a11y src/theme.ts src/periodic_table.ts src/components/PeriodicTable.tsx src/components/PhoneSheet.tsx src/components/OrbitalViewer.tsx src/components/CompareView.tsx src/App.tsx src/style.css tests docs/HANDOFF.md
git commit -m "feat(a11y): arrow-key table and tabs, focus rings, AA contrast pinned by test, reduced motion throughout

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: PWA — manifest and icons

**Files:**
- Create: `src/pwa/manifest.ts`, `src/pwa/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon-180.png`
- Modify: `public/index.html`
- Test: `tests/pwa/manifest.test.ts`

**Interfaces:** Produces `WEB_MANIFEST` (a plain object) and `PWA_ICON_FILES: Array<{ url: string; file: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pwa/manifest.test.ts
import { existsSync } from 'fs';
import { resolve } from 'path';
import { WEB_MANIFEST, PWA_ICON_FILES } from '../../src/pwa/manifest';

it('has what installability needs, and every icon it names exists', () => {
    expect(WEB_MANIFEST).toMatchObject({ start_url: '/', scope: '/', display: 'standalone' });
    const sizes = WEB_MANIFEST.icons.map(icon => `${icon.sizes}:${icon.purpose ?? 'any'}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of PWA_ICON_FILES) expect(existsSync(resolve(__dirname, '../..', icon.file))).toBe(true);
    expect(PWA_ICON_FILES.map(i => i.url)).toEqual(expect.arrayContaining(WEB_MANIFEST.icons.map(i => i.src)));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/pwa/manifest.test.ts`. Expected: FAIL — module missing.

- [ ] **Step 3: Generate the icons** (rsvg-convert is installed at `/usr/local/bin`). The maskable icon widens the viewBox so the round logo sits inside the 80 % safe zone on the app's background:

```bash
mkdir -p src/pwa/icons
rsvg-convert -w 192 -h 192 public/electron-icon.svg -o src/pwa/icons/icon-192.png
rsvg-convert -w 512 -h 512 public/electron-icon.svg -o src/pwa/icons/icon-512.png
sed 's/<svg [^>]*>/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-30 -30 182.88 182.88"><rect x="-30" y="-30" width="182.88" height="182.88" fill="#050505"\/>/' public/electron-icon.svg > /tmp/maskable.svg
rsvg-convert -w 512 -h 512 /tmp/maskable.svg -o src/pwa/icons/maskable-512.png
rsvg-convert -w 180 -h 180 /tmp/maskable.svg -o src/pwa/icons/apple-touch-icon-180.png
file src/pwa/icons/*.png
```

Expected: four PNGs of the stated sizes.

- [ ] **Step 4: Implement**

```ts
// src/pwa/manifest.ts
export const PWA_ICON_FILES: Array<{ url: string; file: string }> = [
    { url: '/icons/icon-192.png', file: 'src/pwa/icons/icon-192.png' },
    { url: '/icons/icon-512.png', file: 'src/pwa/icons/icon-512.png' },
    { url: '/icons/maskable-512.png', file: 'src/pwa/icons/maskable-512.png' },
    { url: '/icons/apple-touch-icon-180.png', file: 'src/pwa/icons/apple-touch-icon-180.png' },
];

export const WEB_MANIFEST = {
    name: 'Electron Orbital Viewer',
    short_name: 'Orbitals',
    description: 'Atoms, bonds and molecules in 3D, computed and validated.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ] as Array<{ src: string; sizes: string; type: string; purpose?: string }>,
};
```

In `public/index.html`'s `<head>`, add:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#050505" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
```

The build emits these files, and the dev server serves them (Task 18's plugin).

- [ ] **Step 5: Run and commit**

Run: `npx jest tests/pwa/manifest.test.ts`. Expected: PASS.

```bash
git add src/pwa/manifest.ts src/pwa/icons public/index.html tests/pwa
git commit -m "feat(pwa): web manifest and icons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: PWA — service worker, build plugin, update prompt

**Decision: a hand-written service worker plus a small in-repo Vite plugin, not `vite-plugin-pwa`.** The routing below is about 60 lines and is unit-tested as pure functions. The plugin only has to (1) build `src/pwa/sw.ts` to a fixed `/sw.js`, (2) inject the list of emitted files and a content hash (the hash changes `sw.js`'s bytes on every deploy, which is how browsers detect an update), and (3) emit the manifest and icons. **Offline scope:** every built file is precached, including the atom solver worker, so **atoms work fully offline**. `/molecules/*` is cached on first view, so **molecules work offline once viewed**. A new version waits until the user accepts the update prompt; it never takes over a running tab.

**Files:**
- Create: `src/pwa/sw_logic.ts`, `src/pwa/sw.ts`, `src/pwa/precache_manifest.ts`, `src/pwa/vite_plugin_sw.ts`, `src/pwa/register.ts`, `src/pwa/update_store.ts`, `src/components/UpdatePrompt.tsx`
- Modify: `vite.config.ts`, `tsconfig.node.json` (include the plugin files), `src/main.tsx`, `src/App.tsx`
- Test: `tests/pwa/sw_logic.test.ts`, `tests/pwa/precache_manifest.test.ts`, `tests/pwa/register.test.ts`

**Interfaces:**
- Produces:
  - `strategyFor(url: string, mode: string, method: string, origin: string): 'navigation' | 'precache' | 'molecule' | 'molecule-index' | 'font' | 'passthrough'`
  - `cacheNames(version): { precache; molecules; fonts }`
  - `isStaleCache(name, names): boolean`
  - `isCacheableMoleculeResponse(status: number, contentType: string | null): boolean`
  - `precacheList(fileNames: string[]): string[]`
  - `precacheVersion(entries: Array<{ fileName: string; content: string | Uint8Array }>): string`
  - `injectPrecache(code: string, list: string[], version: string): string`
  - `swPlugin(): Plugin`
  - `registerServiceWorker(container, onUpdateReady, reload?): Promise<void>`
  - `setPendingUpdate`, `subscribePendingUpdate`, `getPendingUpdate`
  - `UpdatePrompt`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pwa/sw_logic.test.ts
import { strategyFor, cacheNames, isStaleCache, isCacheableMoleculeResponse } from '../../src/pwa/sw_logic';

const O = 'https://x.test';
describe('service worker routing', () => {
    it.each([
        [`${O}/#mode=atom`, 'navigate', 'GET', 'navigation'],
        [`${O}/assets/main-abc.js`, 'cors', 'GET', 'precache'],
        [`${O}/molecules/index.json`, 'cors', 'GET', 'molecule-index'],
        [`${O}/molecules/h2o/density.bin.gz`, 'cors', 'GET', 'molecule'],
        ['https://fonts.gstatic.com/s/roboto/x.woff2', 'cors', 'GET', 'font'],
        ['https://elsewhere.test/a.js', 'cors', 'GET', 'passthrough'],
        [`${O}/assets/main-abc.js`, 'cors', 'POST', 'passthrough'],
    ])('%s (%s %s) -> %s', (url, mode, method, expected) => expect(strategyFor(url, mode, method, O)).toBe(expected));

    it('names caches by version and retires only old precaches', () => {
        const names = cacheNames('v2');
        expect(isStaleCache('eov-precache-v1', names)).toBe(true);
        expect(isStaleCache(names.precache, names)).toBe(false);
        expect(isStaleCache(names.molecules, names)).toBe(false);
    });

    it('never caches an error page as a molecule', () => {
        expect(isCacheableMoleculeResponse(200, 'application/octet-stream')).toBe(true);
        expect(isCacheableMoleculeResponse(200, 'text/html; charset=utf-8')).toBe(false);
        expect(isCacheableMoleculeResponse(403, 'application/xml')).toBe(false);
    });
});
```

```ts
// tests/pwa/precache_manifest.test.ts
import { precacheList, precacheVersion, injectPrecache } from '../../src/pwa/precache_manifest';

describe('precache manifest', () => {
    it('lists what the app needs offline and nothing else', () => {
        expect(precacheList(['index.html', 'methods.html', 'assets/main-a.js', 'assets/atomWorker-b.js', 'assets/main-a.js.map', 'sw.js', 'molecules/h2o/meta.json']))
            .toEqual(['/assets/atomWorker-b.js', '/assets/main-a.js', '/index.html', '/methods.html']);
    });

    it('versions by content', () => {
        const a = precacheVersion([{ fileName: 'index.html', content: 'x' }]);
        expect(a).toMatch(/^[0-9a-f]{12}$/);
        expect(precacheVersion([{ fileName: 'index.html', content: 'y' }])).not.toBe(a);
    });

    it('injects into the built worker and refuses code that lost its tokens', () => {
        const code = injectPrecache('const P=__PRECACHE_MANIFEST__,V=__BUILD_VERSION__;', ['/index.html'], 'abc');
        expect(code).toBe('const P=["/index.html"],V="abc";');
        expect(() => injectPrecache('minified away', [], 'abc')).toThrow(/__PRECACHE_MANIFEST__/);
    });
});
```

```ts
// tests/pwa/register.test.ts
import { registerServiceWorker } from '../../src/pwa/register';

function fakes() {
    const listeners: Record<string, Array<() => void>> = {};
    const on = (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn); };
    const waiting = { postMessage: jest.fn() };
    const registration = { waiting: null as typeof waiting | null, installing: null, addEventListener: jest.fn() };
    const container = {
        controller: {} as object | null,
        register: jest.fn(async () => registration),
        addEventListener: on,
    };
    return { container, registration, waiting, fire: (type: string) => listeners[type]?.forEach(fn => fn()) };
}

describe('registerServiceWorker', () => {
    it('does not reload on the first install\'s controllerchange', async () => {
        const { container, fire } = fakes();
        container.controller = null;
        const reload = jest.fn();
        await registerServiceWorker(container as never, jest.fn(), reload);
        fire('controllerchange');
        expect(reload).not.toHaveBeenCalled();
    });

    it('offers a waiting update, and reloads once only after it is accepted', async () => {
        const { container, registration, waiting, fire } = fakes();
        registration.waiting = waiting;
        const reload = jest.fn();
        const onUpdateReady = jest.fn();
        await registerServiceWorker(container as never, onUpdateReady, reload);
        const activate = onUpdateReady.mock.calls[0][0];
        activate();
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        fire('controllerchange');
        fire('controllerchange');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does nothing where service workers are unsupported', async () => {
        await expect(registerServiceWorker(undefined, jest.fn())).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/pwa`. Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/pwa/sw_logic.ts -- pure, imported only by sw.ts and the tests.
export type Strategy = 'navigation' | 'precache' | 'molecule' | 'molecule-index' | 'font' | 'passthrough';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

export function strategyFor(url: string, mode: string, method: string, origin: string): Strategy {
    if (method !== 'GET') return 'passthrough';
    if (mode === 'navigate') return 'navigation';
    const parsed = new URL(url);
    if (parsed.origin === origin) {
        if (parsed.pathname === '/molecules/index.json') return 'molecule-index';
        if (parsed.pathname.startsWith('/molecules/')) return 'molecule';
        return 'precache';
    }
    return FONT_HOSTS.includes(parsed.hostname) ? 'font' : 'passthrough';
}

export function cacheNames(version: string) {
    return { precache: `eov-precache-${version}`, molecules: 'eov-molecules-v1', fonts: 'eov-fonts-v1' };
}

export function isStaleCache(name: string, names: ReturnType<typeof cacheNames>): boolean {
    return name.startsWith('eov-precache-') && name !== names.precache;
}

/** The distribution answers a missing file with index.html (404) or an S3 error (403); neither may be kept as a molecule. */
export function isCacheableMoleculeResponse(status: number, contentType: string | null): boolean {
    return status === 200 && !(contentType ?? '').startsWith('text/html');
}
```

```ts
// src/pwa/sw.ts -- built to /sw.js by swPlugin; the two tokens are replaced at build time.
import { strategyFor, cacheNames, isStaleCache, isCacheableMoleculeResponse } from './sw_logic';

declare const __PRECACHE_MANIFEST__: string[];
declare const __BUILD_VERSION__: string;

interface ExtendableEventLike extends Event { waitUntil(promise: Promise<unknown>): void }
interface FetchEventLike extends ExtendableEventLike { request: Request; respondWith(response: Promise<Response>): void }
interface WorkerScope {
    addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
    addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    skipWaiting(): Promise<void>;
    clients: { claim(): Promise<void> };
    location: Location;
}

const scope = self as unknown as WorkerScope;
const names = cacheNames(__BUILD_VERSION__);

scope.addEventListener('install', event => {
    event.waitUntil(caches.open(names.precache).then(cache => cache.addAll(__PRECACHE_MANIFEST__)));
});

scope.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => isStaleCache(key, names)).map(key => caches.delete(key))))
            .then(() => scope.clients.claim()),
    );
});

scope.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') void scope.skipWaiting();
});

async function networkFirst(request: Request, fallback: () => Promise<Response | undefined>): Promise<Response> {
    try {
        return await fetch(request);
    } catch {
        return (await fallback()) ?? Response.error();
    }
}

async function cacheFirst(request: Request, cacheName: string, keep: (response: Response) => boolean): Promise<Response> {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (keep(response)) await (await caches.open(cacheName)).put(request, response.clone());
    return response;
}

scope.addEventListener('fetch', event => {
    const { request } = event;
    switch (strategyFor(request.url, request.mode, request.method, scope.location.origin)) {
        case 'navigation':
            event.respondWith(networkFirst(request, async () =>
                (await caches.match(request, { ignoreSearch: true })) ?? caches.match('/index.html')));
            break;
        case 'precache':
            event.respondWith(caches.match(request).then(hit => hit ?? fetch(request)));
            break;
        case 'molecule':
            event.respondWith(cacheFirst(request, names.molecules,
                response => isCacheableMoleculeResponse(response.status, response.headers.get('content-type'))));
            break;
        case 'molecule-index':
            event.respondWith(networkFirst(request, () => caches.match(request)).then(async response => {
                if (isCacheableMoleculeResponse(response.status, response.headers.get('content-type'))) {
                    await (await caches.open(names.molecules)).put(request, response.clone());
                }
                return response;
            }));
            break;
        case 'font':
            event.respondWith(cacheFirst(request, names.fonts, response => response.ok || response.type === 'opaque'));
            break;
        default:
            break;
    }
});
```

```ts
// src/pwa/precache_manifest.ts -- also imported by vite_plugin_sw.ts (node side).
import { createHash } from 'crypto';

const EXCLUDED = [/^sw\.js$/, /\.map$/, /^molecules\//, /(^|\/)\.DS_Store$/];

export function precacheList(fileNames: string[]): string[] {
    return fileNames.filter(name => !EXCLUDED.some(pattern => pattern.test(name))).map(name => `/${name}`).sort();
}

/** Hash of every precached file's bytes: sw.js changes whenever anything it caches does, which is how browsers notice a deploy. */
export function precacheVersion(entries: Array<{ fileName: string; content: string | Uint8Array }>): string {
    const hash = createHash('sha256');
    for (const entry of [...entries].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
        hash.update(entry.fileName);
        hash.update(entry.content);
    }
    return hash.digest('hex').slice(0, 12);
}

export function injectPrecache(code: string, list: string[], version: string): string {
    for (const token of ['__PRECACHE_MANIFEST__', '__BUILD_VERSION__']) {
        if (!code.includes(token)) throw new Error(`sw.js lost its ${token} token; check the minifier kept free globals.`);
    }
    return code.replace('__PRECACHE_MANIFEST__', JSON.stringify(list)).replace('__BUILD_VERSION__', JSON.stringify(version));
}
```

```ts
// src/pwa/vite_plugin_sw.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Plugin } from 'vite';
import { WEB_MANIFEST, PWA_ICON_FILES } from './manifest';
import { precacheList, precacheVersion, injectPrecache } from './precache_manifest';

const ROOT = resolve(__dirname, '../..');

/** Emits the manifest and icons, then gives the built sw.js its precache list and version. */
export function swPlugin(): Plugin {
    return {
        name: 'eov-service-worker',
        enforce: 'post',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/manifest.webmanifest') {
                    res.setHeader('Content-Type', 'application/manifest+json');
                    res.end(JSON.stringify(WEB_MANIFEST));
                    return;
                }
                const icon = PWA_ICON_FILES.find(i => i.url === req.url);
                if (!icon) return next();
                res.setHeader('Content-Type', 'image/png');
                res.end(readFileSync(resolve(ROOT, icon.file)));
            });
        },
        generateBundle(_options, bundle) {
            this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(WEB_MANIFEST) });
            for (const icon of PWA_ICON_FILES) {
                this.emitFile({ type: 'asset', fileName: icon.url.slice(1), source: readFileSync(resolve(ROOT, icon.file)) });
            }
            const worker = bundle['sw.js'];
            if (!worker || worker.type !== 'chunk') throw new Error('sw.js was not built; check rollupOptions.input.sw');
            const names = [...Object.keys(bundle), 'manifest.webmanifest', ...PWA_ICON_FILES.map(i => i.url.slice(1))];
            const list = precacheList([...new Set(names)]);
            const entries = Object.values(bundle)
                .filter(output => output.fileName !== 'sw.js')
                .map(output => ({ fileName: output.fileName, content: output.type === 'chunk' ? output.code : output.source }));
            worker.code = injectPrecache(worker.code, list, precacheVersion(entries));
        },
    };
}
```

```ts
// src/pwa/register.ts
interface WorkerLike { postMessage(message: unknown): void; state?: string; addEventListener?(type: 'statechange', fn: () => void): void }
interface RegistrationLike { waiting: WorkerLike | null; installing: WorkerLike | null; addEventListener(type: 'updatefound', fn: () => void): void }
interface ContainerLike {
    controller: object | null;
    register(url: string, options?: { scope: string }): Promise<RegistrationLike>;
    addEventListener(type: 'controllerchange', fn: () => void): void;
}

/**
 * Registers /sw.js and offers updates rather than forcing them. A reload
 * happens only after the user accepted one: clients.claim() also fires
 * controllerchange on the very first install, and reloading then would
 * restart a first visit for nothing.
 */
export async function registerServiceWorker(
    container: ContainerLike | undefined,
    onUpdateReady: (activate: () => void) => void,
    reload: () => void = () => window.location.reload(),
): Promise<void> {
    if (!container) return;
    const hadController = container.controller !== null;
    const registration = await container.register('/sw.js', { scope: '/' });
    let accepted = false;
    let reloaded = false;
    const offer = (worker: WorkerLike) => onUpdateReady(() => { accepted = true; worker.postMessage({ type: 'SKIP_WAITING' }); });
    if (registration.waiting && hadController) offer(registration.waiting);
    registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener?.('statechange', () => {
            if (worker.state === 'installed' && container.controller) offer(worker);
        });
    });
    container.addEventListener('controllerchange', () => {
        if (!accepted || reloaded) return;
        reloaded = true;
        reload();
    });
}
```

```ts
// src/pwa/update_store.ts
let pending: (() => void) | null = null;
const listeners = new Set<() => void>();
export const getPendingUpdate = () => pending;
export function setPendingUpdate(activate: () => void): void { pending = activate; listeners.forEach(l => l()); }
export function subscribePendingUpdate(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
```

```tsx
// src/components/UpdatePrompt.tsx
import React, { useSyncExternalStore } from 'react';
import { Snackbar, Button } from '@mui/material';
import { getPendingUpdate, subscribePendingUpdate } from '../pwa/update_store';

/** The existing snackbar position, like the render-error notice: transient, not a panel. */
const UpdatePrompt: React.FC = () => {
    const activate = useSyncExternalStore(subscribePendingUpdate, getPendingUpdate, getPendingUpdate);
    return (
        <Snackbar open={activate !== null} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            message="A new version is available." action={<Button size="small" onClick={() => activate?.()}>Reload</Button>} />
    );
};

export default UpdatePrompt;
```

In `src/main.tsx`, after `render`:

```tsx
import { registerServiceWorker } from './pwa/register';
import { setPendingUpdate } from './pwa/update_store';
// Production only: in dev a service worker would cache Vite's modules and hide edits.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void registerServiceWorker(navigator.serviceWorker as never, setPendingUpdate);
}
```

In `App.tsx`, render `<UpdatePrompt />` beside the existing `Snackbar`.

In `vite.config.ts`, add `import { swPlugin } from './src/pwa/vite_plugin_sw';` and `plugins: [react(), swPlugin()]`. Extend `build.rollupOptions` like this:

```ts
      input: {
        main: resolve(__dirname, 'public/index.html'),
        methods: resolve(__dirname, 'public/methods.html'),
        sw: resolve(__dirname, 'src/pwa/sw.ts'),
      },
      output: {
        // The worker must live at a fixed /sw.js, at the root, to control the whole site.
        entryFileNames: chunk => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
```

In `tsconfig.node.json`, set `"include"` to `["vite.config.ts", "src/pwa/vite_plugin_sw.ts", "src/pwa/precache_manifest.ts", "src/pwa/manifest.ts"]` and add `"types": ["node"]`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/pwa`. Expected: PASS.

- [ ] **Step 5: Verify the build.** Run `npm run build`, then check:
  - `head -c 300 dist/sw.js` shows no `import` or `export` and no `__PRECACHE_MANIFEST__` token.
  - `grep -o 'atomWorker[^"]*' dist/sw.js` finds the worker file, which proves atoms are cached for offline.
  - `ls dist/manifest.webmanifest dist/icons` lists the four icons.
  - `grep -c molecules/ dist/sw.js` is 0 or only the routing string.

- [ ] **Step 6: Verify live, offline.** Run `npx vite preview --port 5391 --strictPort` detached, after stopping the dev server on 5391. Load http://localhost:5391/ at 1440×900 and wait for the worker to activate (`evaluate_script`: `navigator.serviceWorker.ready.then(() => 'ready')`). Pick Fe, then a molecule if Phase 6 shipped. Switch the network to offline with chrome-devtools `emulate`, then reload:
  - The app loads.
  - A never-seen element (U) solves and draws.
  - The molecule viewed before loads, and an unviewed one shows the molecule mode's own error, not a blank view.
  - `/methods.html` loads.

  Back online, rebuild with any one-character change and reload: "A new version is available. Reload" appears, and Reload brings in the new version without a reload loop. Lighthouse's installability check passes. Repeat the offline load at 390×844. Note: `vite preview` serves over http on localhost, which browsers treat as secure for service workers.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit -p .
git add src/pwa src/components/UpdatePrompt.tsx src/main.tsx src/App.tsx vite.config.ts tsconfig.node.json tests/pwa
git commit -m "feat(pwa): installable, atoms fully offline, molecules cached once viewed, updates on consent

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Infrastructure — caching that suits a service worker

Currently one `BucketDeployment` uploads with no `Cache-Control`, the whole distribution uses `CACHING_OPTIMIZED` (edge TTL up to a day), and `prune` deletes the previous build's hashed chunks. With a service worker that causes three problems. `index.html` and `sw.js` can be served stale by browser heuristics. A tab still running the old build 404s on an old lazily loaded chunk, and the 404 comes back as `index.html` with status 200, so a worker script receives HTML. And `sw.js` must never be edge-cached across a deploy.

**Files:**
- Modify: `infra/infra_stack.py`
- Test: `infra/tests/unit/test_infra_stack.py`

- [ ] **Step 1: Write the failing tests** (append):

```python
from aws_cdk.assertions import Match

CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"


def _template():
    app = core.App()
    return assertions.Template.from_stack(InfraStack(app, "electron-orbital-viewer"))


def test_service_worker_is_never_cached_at_the_edge():
    _template().has_resource_properties("AWS::CloudFront::Distribution", {
        "DistributionConfig": {"CacheBehaviors": Match.array_with([
            Match.object_like({"PathPattern": "/sw.js", "CachePolicyId": CACHING_DISABLED}),
        ])},
    })


def test_hashed_assets_are_immutable_and_outlive_a_deploy():
    _template().has_resource_properties("Custom::CDKBucketDeployment", {
        "Include": ["assets/*"],
        "Prune": False,
        "SystemMetadata": {"cache-control": "public, max-age=31536000, immutable"},
    })


def test_everything_else_revalidates():
    _template().has_resource_properties("Custom::CDKBucketDeployment", {
        "Exclude": ["assets/*"],
        "SystemMetadata": {"cache-control": "no-cache"},
    })
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run build
cd infra && python3 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt -r requirements-dev.txt && python -m pytest tests -q; deactivate; cd ..
```

Expected: the 3 new tests FAIL and the 2 existing ones pass. (`dist/` must exist because the stack packages it.)

- [ ] **Step 3: Implement.** In `infra/infra_stack.py`, build the origin once with `site_origin = origins.S3BucketOrigin(website_bucket)` and use it in `default_behavior`. Add to the `Distribution`:

```python
            additional_behaviors={
                # Browsers check sw.js on every navigation; an edge copy from before a deploy would pin users to the old build.
                "/sw.js": cloudfront.BehaviorOptions(
                    origin=site_origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                ),
            },
```

Replace the single `BucketDeployment` with:

```python
        dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")

        # Content-hashed files never change under their name: cache for a year, and keep old ones so a
        # tab still running the previous build can lazy-load its chunks after a deploy.
        assets_deployment = s3deploy.BucketDeployment(
            self, "DeployHashedAssets",
            sources=[s3deploy.Source.asset(dist)],
            destination_bucket=website_bucket,
            exclude=["*"],
            include=["assets/*"],
            cache_control=[s3deploy.CacheControl.from_string("public, max-age=31536000, immutable")],
            prune=False,
        )

        # Everything with a fixed name (index.html, methods.html, sw.js, the manifest, icons, molecule data)
        # revalidates on every use, so a deploy is seen at once.
        site_deployment = s3deploy.BucketDeployment(
            self, "DeployElectronOrbitalViewer",
            sources=[s3deploy.Source.asset(dist)],
            destination_bucket=website_bucket,
            exclude=["assets/*"],
            cache_control=[s3deploy.CacheControl.no_cache()],
            distribution=distribution,
            distribution_paths=["/*"],
        )
        # Pages must never reference assets that are not uploaded yet.
        site_deployment.node.add_dependency(assets_deployment)
```

- [ ] **Step 4: Run to verify they pass.** Run the same pytest command. Expected: 5 passed. If a property name differs in this CDK version, run `cd infra && . .venv/bin/activate && cdk synth > /tmp/synth.yaml` and `grep -n "Prune\|SystemMetadata\|Include" /tmp/synth.yaml`, then adjust the assertion keys (not the intent).

- [ ] **Step 5: Deploy and verify.** Run `./infra/deploy.sh` in the foreground; it takes several minutes. Then check:
  - `curl -sI https://<distribution>/sw.js | grep -i "cache-control\|x-cache"` shows `no-cache` and a CloudFront miss.
  - `curl -sI https://<distribution>/assets/<a main chunk> | grep -i cache-control` shows `immutable`.
  - The live site installs and works offline, as in Task 18 Step 6.

- [ ] **Step 6: Commit**

```bash
git add infra/infra_stack.py infra/tests/unit/test_infra_stack.py
git commit -m "feat(infra): immutable hashed assets kept across deploys, revalidated pages, uncached sw.js

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Analytics per the owner's decision (gated)

- [ ] **Step 1: Gate.** Read `Analytics:` in `docs/HANDOFF.md`. If it says **None**, add one line to the README's "Running it" section, "No analytics, no cookies.", commit, and skip the rest of this task. Otherwise follow the matching branch.

- [ ] **Step 2 (CloudFront logs): test first.** Append to `infra/tests/unit/test_infra_stack.py`:

```python
def test_access_logs_expire_after_30_days():
    template = _template()
    template.has_resource_properties("AWS::CloudFront::Distribution", {
        "DistributionConfig": {"Logging": Match.object_like({"Prefix": "cloudfront/"})},
    })
    template.has_resource_properties("AWS::S3::Bucket", {
        "LifecycleConfiguration": {"Rules": Match.array_with([Match.object_like({"ExpirationInDays": 30, "Status": "Enabled"})])},
    })
```

Run the infra pytest: the new test FAILS. Implement in `InfraStack.__init__` before the distribution (add `Duration` to the `aws_cdk` import):

```python
        # Standard logs need ACLs on the bucket (CloudFront writes with the awslogsdelivery account).
        log_bucket = s3.Bucket(
            self, "AccessLogs",
            object_ownership=s3.ObjectOwnership.OBJECT_WRITER,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            lifecycle_rules=[s3.LifecycleRule(expiration=Duration.days(30))],
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
```

Pass `enable_logging=True, log_bucket=log_bucket, log_file_prefix="cloudfront/"` to the `Distribution`. Rerun: PASS. Add a README paragraph: "Usage is counted only from CloudFront access logs (no cookies, no client code), kept 30 days. Molecule views appear as requests for `/molecules/<id>/meta.json`."

- [ ] **Step 2 (GoatCounter): test first.** Create `tests/analytics.test.ts`:

```ts
import { countEvent } from '../src/analytics';
it('sends a cookieless beacon only when a counter is configured', () => {
    const send = jest.fn(() => true);
    countEvent('lesson/gold-yellow', { endpoint: null, send });
    expect(send).not.toHaveBeenCalled();
    countEvent('lesson/gold-yellow', { endpoint: 'https://eov.goatcounter.com/count', send });
    expect(send).toHaveBeenCalledWith('https://eov.goatcounter.com/count?p=%2Fevent%2Flesson%2Fgold-yellow&e=true');
});
```

Implement `src/analytics.ts`:

```ts
/** Privacy-respecting counts (owner decision, spec §6): no cookies, no identifiers, just "this event happened". */
export const ANALYTICS_ENDPOINT: string | null = 'https://<code>.goatcounter.com/count';

export function countEvent(
    name: string,
    { endpoint = ANALYTICS_ENDPOINT, send = (url: string) => navigator.sendBeacon(url) }: { endpoint?: string | null; send?: (url: string) => boolean } = {},
): void {
    if (!endpoint) return;
    send(`${endpoint}?p=${encodeURIComponent(`/event/${name}`)}&e=true`);
}
```

Replace `<code>` with the site code the owner gives you; ask for it. Call `countEvent(`lesson/${id}`)` in the `LearnCard` start handler in `App.tsx`, and `countEvent(`molecule/${id}`)` where Phase 6 loads a molecule's meta. Add a "Privacy" paragraph to the README naming GoatCounter and what it receives.

- [ ] **Step 3: Run the affected tests, then commit.**

```bash
git add -A infra src tests README.md
git commit -m "feat: usage counts per the owner's analytics decision (spec §6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Custom domain per the owner's decision (gated)

- [ ] **Step 1: Gate.** Read `Domain:` in `docs/HANDOFF.md`. If it says **keep the CloudFront URL**, skip this task.

- [ ] **Step 2: OWNER ACTIONS** (report verbatim; the implementer cannot do these):
  1. **(Owner)** Register the domain. Route 53 is simplest; any registrar works.
  2. **(Owner)** Request a public ACM certificate for it **in us-east-1** (CloudFront only uses certificates there), validate it by DNS, and send the certificate ARN.

- [ ] **Step 3: Test first.** Append to `infra/tests/unit/test_infra_stack.py`:

```python
def test_custom_domain_from_context():
    app = core.App(context={"domainName": "orbitals.example.org",
                            "certificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/abc"})
    template = assertions.Template.from_stack(InfraStack(app, "electron-orbital-viewer"))
    template.has_resource_properties("AWS::CloudFront::Distribution", {
        "DistributionConfig": Match.object_like({"Aliases": ["orbitals.example.org"]}),
    })


def test_no_domain_without_context():
    template = _template()
    distribution = next(iter(template.find_resources("AWS::CloudFront::Distribution").values()))
    assert "Aliases" not in distribution["Properties"]["DistributionConfig"]
```

Run pytest: FAIL. Implement (add `aws_certificatemanager as acm` to the imports):

```python
        domain_name = self.node.try_get_context("domainName")
        certificate_arn = self.node.try_get_context("certificateArn")
        custom_domain = (
            {"domain_names": [domain_name],
             "certificate": acm.Certificate.from_certificate_arn(self, "SiteCertificate", certificate_arn)}
            if domain_name and certificate_arn else {}
        )
```

Pass `**custom_domain` to `cloudfront.Distribution(...)`. Put the two values in `infra/cdk.json`'s `"context"`. Add `CfnOutput(self, "SiteURL", value=f"https://{domain_name}")` when set. Rerun: PASS.

- [ ] **Step 4: Deploy, then OWNER ACTION.** **(Implementer)** Run `./infra/deploy.sh` and report the distribution domain. **(Owner)** Create the DNS record: a Route 53 alias A/AAAA to the distribution, or a CNAME at another registrar. **(Implementer)** Once `curl -sI https://<domain>/` returns 200, set `url` in `CITATION.cff` and `citation.ts` and the README's "Live:" line to the new domain. Run `npx jest tests/cite` and commit.

```bash
git add infra CITATION.cff src/cite/citation.ts README.md
git commit -m "feat(infra): custom domain (owner decision, spec §6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Documentation, full verification, deploy

**Files:** Modify: `README.md`, `docs/HANDOFF.md`

- [ ] **Step 1: README.** Add "Learning and research" under "What it shows", covering:
  - the four lessons and how a step link works;
  - compare mode;
  - `/methods.html` and "How to cite";
  - embed mode (`?embed=1`, wheel gating);
  - keyboard controls for the view (arrows, +/-, Home) and the table (arrows);
  - offline behaviour.

  Also update the Layout table for `src/lessons/`, `src/compare/`, `src/methods/`, `src/pwa/`, `src/a11y/` and `src/embed.ts`, and remove "No export … no shareable links" if Phase 2 has not already.

- [ ] **Step 2: HANDOFF.** Add a "Phase 7" section: what shipped, with the decisions above (two canvases; a separate Methods page; a hand-written service worker; no axe-core; Cache-Control split). List any lesson hashes corrected in Task 8, any feature flag left `false`, the Lighthouse scores, and every OWNER ACTION still open (Zenodo, DNS).

- [ ] **Step 3: Full verification, foreground.**
  1. `npx jest`. This takes several minutes; that is normal. Expected: all pass.
  2. `npx tsc --noEmit -p .` and `npx tsc -p tsconfig.node.json --noEmit`. Expected: clean.
  3. `npm run build`. Expected: clean.
  4. The infra pytest. Expected: all pass.

- [ ] **Step 4: End-to-end drive** at http://localhost:5391 (dev) at 1440×900 and 390×844 with touch:
  - one step of each lesson;
  - compare Na/Cl and one molecule pair;
  - Methods page;
  - embed round trip;
  - keyboard-only pass;
  - reduced motion.

  Then on the preview build, the offline pass. The console must stay clean throughout.

- [ ] **Step 5: Commit and deploy.**

```bash
git add README.md docs/HANDOFF.md
git commit -m "docs: Phase 7 — lessons, compare, methods, citation, embed, accessibility, offline

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
./infra/deploy.sh
```

Then confirm the deployed site: `/`, `/methods.html`, `/sw.js` headers, and an offline reload on a phone-sized window.

---

## Self-review

**Spec coverage (Phase 7):**

| Requirement | Tasks |
| --- | --- |
| Guided lessons (four named, driven by URL state, 2–3 sentences, leave and explore) | 7, 8, 9, 10 |
| Compare, atoms and molecules, same scale | 3, 4, 5, 6 |
| Methods & validation page generated from the tested rows | 2 (provenance), 11 |
| `CITATION.cff`, Zenodo DOI per release, "How to cite" | 12 (owner steps marked), 13 (licence) |
| Embed mode and copy-embed-code | 14 |
| Accessibility (keyboard, screen-reader state, reduced motion, WCAG AA) | 15, 16 |
| Offline PWA (atoms fully, molecules once viewed) | 17, 18, 19 |
| §6 owner decisions (asked in Task 1, applied in Tasks 13, 20 and 21, with options and a recommendation each) | 1, 13, 20, 21 |
| §3.8 layout contract | Justified placement in Tasks 5, 10 and 14; nothing floats over the canvas except the embed-mode exit link (Task 14), the existing snackbar slot (Task 18) and per-pane labels inside the compare canvases |

**Placeholder scan.** The fill-ins that remain are owner data: the Task 1 answers, the GoatCounter site code, the domain and ARN, and the Zenodo DOI. Each has an explicit step that obtains it.

**Type consistency.** These names are used identically everywhere they appear:
- `CompareSubject`, `ComparePaneContent`, `atomLevelViewParams`, `commonFramingRadius`;
- `Lesson`, `LessonStep`, `HighlightTarget`, `FEATURE_AVAILABLE`, `lessonAvailable(lesson, available)`;
- `hashContains`, `lessonDiverged`, `readLessonParams`, `lessonLink`;
- `startLesson({ lessonId, stepIndex? })`, `goToStep`, `returnToStep`, `exitLesson`;
- `withExploreContent`, `describeView(state, encoded)`, `orbitByKey`, `worstCaseContrast`, `nextTileByKey`, `nextTabIndex`;
- `strategyFor`, `cacheNames`, `precacheList`, `precacheVersion`, `injectPrecache`, `registerServiceWorker`.

**Dependency risk, stated.** Hybrid and bond URL keys are assumed, not read from a written plan. Task 8's round-trip test catches any mismatch, and the fix goes in the lesson hash. Task 6 binds `updateFieldInScene` through a grep of its real call shape. Molecule loader paths may need one import-path edit.
