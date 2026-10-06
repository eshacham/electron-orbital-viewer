# Phase 6B-2 — The Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can ask the app for any H–Kr molecule, watch it compute, and open it as a `computed`-tier molecule beside the validated library. Anyone with its link can open it. Every molecule says how it was computed. The owner's `/admin.html` lists every job and what it cost.

**Architecture:** A `src/jobs/` layer mirrors 6B-1's API: types copied from its real responses, a fetch client that targets This Mac or AWS and attaches the Cognito token, a ref-counted poller, and an `oidc-client-ts` sign-in wrapper. A `jobs` Redux slice holds the session, the followed job and the month's computed list. Molecules mode learns the computed tier through the id itself: a 64-hex job key resolves to `/molecules/jobs/<key>/`, gated on `done.json`. Phase 6's loaders, grid cache and MO worker therefore need no new plumbing, and a `job` URL key links the molecule. The new panels (provenance, request, status) go into Phase 6's side panel and Explore tab. `/admin.html` is a second Vite entry under `src/admin/`, kept out of the main bundle by an import-graph test and a build check.

**Tech Stack:** TypeScript, React 19, MUI 7 (plain `Table`), Redux Toolkit, Vite 6 (two pages), Jest + ts-jest + Testing Library, `oidc-client-ts` 3.5.0 (the one new dependency); 6B-1's Python job package for recorded fixtures and the live checks.

**Spec:** `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` (binding: §9 in full, §4 API shapes, §5.3 result layout, §12 local, §14, §15 item 3). Parent: `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` §3.1 (every number states its method), §3.5 (failures shown), §3.8 (layout).

**Prerequisites:** Phase 6 (`docs/superpowers/plans/2026-09-25-phase-6-molecule-library.md`) and Phase 6B-1 (`docs/superpowers/plans/2026-10-05-phase-6b-1-jobs-core-worker-local.md`) are complete and merged. Task 1 checks every Phase 6 name and every 6B-1 response field this plan uses.

## Global Constraints

- **No new npm dependencies except `oidc-client-ts`, pinned exactly at `3.5.0`** (`npm install --save-exact`). Its licence must read `Apache-2.0` in `node_modules/oidc-client-ts/package.json`, and its one transitive dependency, `jwt-decode`, must read `MIT`. No MUI X (the jobs table is a plain MUI `Table`), and no charting library (the daily-spend chart is hand-drawn SVG, like `src/components/PotentialCurvePlot.tsx`).
- **6B-1's names verbatim.** Response fields are exactly those in 6B-1 Task 6 "Interfaces" and Task 5's `public_view`. The paths are `POST /api/v1/jobs/preview`, `POST /api/v1/jobs`, `GET /api/v1/jobs/{key}`, `GET /api/v1/jobs?month=YYYY-MM[&status=S]` and `GET /api/v1/costs?month=YYYY-MM`. The statuses are `QUEUED`, `STARTING`, `RUNNING`, `DONE` and `FAILED`. Errors are `{"error": {"code", "message"}}`. Money arrives in USD, except `sizing.predictedCostMicros`.
- **API base.** Production calls `${import.meta.env.VITE_JOBS_API_URL}/api/v1/…`. On the dev server, "This Mac" calls `/api/v1/…`, which is proxied to `127.0.0.1:8787` with no auth, at $0, with timings tagged `local`. "AWS" calls `/api/aws/v1/…`, which is proxied to `JOBS_AWS_API_URL`, with the Cognito token attached. Every API call sends `Authorization: Bearer <access token>` when signed in.
- **Owner rule (verbatim):** `isOwner = signedIn || (import.meta.env.DEV && target === 'local')`. Non-owners never see a request panel, a status panel, the Computed category or a cost. Anyone can open a computed molecule's link.
- **Sign-in:** Cognito managed login with TOTP MFA via `oidc-client-ts`, using authorization code + PKCE. The access token is kept in memory only (an `InMemoryWebStorage` user store). The refresh token, with the profile but never an access or ID token, is kept in `sessionStorage` under `eov.owner.session`, so closing the tab signs out. Config comes from `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID` and `VITE_COGNITO_DOMAIN`; if any is unset, sign-in says "not configured". The redirect URIs are `<origin>/` and `<origin>/admin.html`.
- **Computed results** are read at `/molecules/jobs/<key>/…` (spec §5.3), and only once `done.json` exists and lists `meta.json`. A folder without it is not a result, and the app says so.
- **Money:** USD at the precision the meter has. From $0.01 up, show 2 decimals. Below that, show 4 significant figures (e.g. "$0.002980"). Always label the figure: spent, reserved or projected (and remaining or billed where those apply).
- **Every number states its method** (parent spec §3.1). Energies say "B3LYP/def2-TZVPD", or "B3LYP/def2-SVP" during an optimisation step. Predictions say "sizing v<version> prediction".
- **Polling:** `GET /api/v1/jobs/{key}` every **5 s** while the job is `QUEUED`, `STARTING` or `RUNNING`. Never send two requests at once for one key. Stop on `DONE` or `FAILED`, on the last unmount, and while the tab is hidden; resume when it is visible again.
- **Layout contract (Phase 6, spec §9.7).** The request panel, the status and the provenance panel go in the desktop `.side-panel` and in the phone sheet's Explore tab. The tier badge goes in the existing `.molecule-legend-stack`. The sign-in link sits with Share/Export in the view settings. No new floating panel over the canvas. `/admin.html` is desktop-first, and its table scrolls horizontally on a phone.
- **Dashboard code lives in `src/admin/` only, and nothing reachable from `src/main.tsx` imports it.**
- British spelling in UI copy and comments. Comments explain why, in the register of `src/radial_distribution.ts`.
- TDD every task. The TS commands are `npx jest <path>` and `npx tsc --noEmit -p .`. Never run the full Jest suite until the last task. Python is used only for recording fixtures: `tools/molecules/.venv/bin/python …` from the repo root.
- Foreground only. No command may run over ~9 minutes (Bash tool timeout 600000 ms).
- **Live verification** happens at the dev server, http://localhost:5391. Start it with `npx vite --port 5391 --strictPort` if it is not up, and never start a second one. Check desktop at 1440×900 and phone at 390×844 with touch emulation, via Playwright, with zero console errors. Never pin or resize the owner's own Playwright window permanently: resize only inside a verification step, say so, and restore the previous size at the end of that step. When a verification step needs the local job server, start and stop it inside the same single command (`tools/molecules/.venv/bin/python -m jobs.local_server & PID=$!; …; kill $PID`, run from `tools/`).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A shared link to a job whose `done.json` is missing.** The job may still be running, may have failed, or may be half-written. Expect an explicit "no finished result yet" message, never a blank or stale picture, and `meta.json` must never be read. S3 behind CloudFront answers 403, not 404, for a missing object, so both must count as missing. Test: Task 3, `says the result is not finished when done.json is missing (HTTP %i), and never reads meta.json`.
2. **A preview answer that arrives after the input has changed.** Expect it to be discarded, and Submit never to send anything other than what was previewed. Test: Task 10, `a preview that answers after the input changed is never shown`.
3. **The owner's session ending mid-session (401).** Expect one silent refresh, then a visible "sign in again" prompt that keeps the typed form. It must never fail silently or retry for ever. Tests: Task 6, `a 401 the refresh cannot cure ends the session and says so`; Task 10, `an ended session keeps the form, disables it and offers sign-in`.
4. **Many watchers, remounts and hidden tabs on one job.** Expect at most one request per 5 s, never two in flight, and none while hidden. Tests: Task 8, `one request per interval however many watch the same job`, `remounting does not refetch`, `sends nothing while the tab is hidden, and catches up once when shown`.
5. **Dashboard code leaking into the main bundle.** Tests: Task 15, `nothing reachable from src/main.tsx imports src/admin`, and the build check `npm run check:admin-split`.

---

## Design decisions (read before Task 1)

**The id carries the tier.** A computed molecule's id is its 64-character lowercase-hex job key. Library ids are at most 40 characters of `[a-z0-9-]` (Phase 6's URL rule), so the two can never collide. `moleculePath(id)` (Phase 5's loader) chooses the base from the id: `/molecules/<DATA_VERSION>/<id>` for the library, `/molecules/jobs/<key>` for a job. As a result, Phase 6's meta, basis, density and ESP loads keep working untouched, and so does the MO worker, which is handed only `recipe.moleculeId`. This is how this plan meets spec §9.1's "base URL per entry". Threading a separate base through Phase 6's grid cache and worker requests would touch every one of them for no gain.

**The preview is drawn in SVG.** It reuses Phase 6's bonding rule (`detectBonds`), radii and CPK colours, but not its `THREE.Group`. `buildBallAndStick(atoms, bonds)` can build a group without a loaded meta, but drawing that group needs a second WebGL renderer in the side panel or phone sheet. On a phone, a second context competes with the main canvas for the few the browser allows, and risks losing it. SVG also renders under jsdom, so the preview is tested like the rest of the UI. It only has to answer "is this the molecule I meant?", and it can be turned by dragging.

**Ball-and-stick for H–Kr.** Phase 6's radii and colour tables cover only the library's nine elements, and `detectBonds` refuses any other element. Computed molecules may hold any element from H to Kr (spec §5.1). Task 4 therefore extends both tables, using Cordero et al. 2008 radii and the Jmol colours. This is a library-only code path, not one of HANDOFF's diatomic-only paths.

**Where the sign-in link goes.** The app has no general menu. Its only menu row is the view settings' actions (Share / Export), which sit in the right column on a desktop and in the View tab on a phone. The discreet "Owner sign-in" link goes under them in Molecules mode. On the dev server, the "where jobs run" choice sits beside it.

**The URL mode name.** Phase 6 names the mode `molecule` in links (`#mode=molecule`), so the share link is `#mode=molecule&job=<key>`. Spec §9.1 writes `mode=molecules`.

**Restoring the session from the refresh token.** oidc-client-ts keeps the whole `User` in its user store, so with an in-memory store the session would end at every reload. After every sign-in or renewal, `OwnerAuth` copies `{refresh_token, scope, profile}` to `sessionStorage`. On load, it seeds the in-memory store with a `User` holding only that (an empty access token) and calls `signinSilent()`. In 3.5.0, `signinSilent()` takes the refresh-token grant whenever the stored user has a refresh token (`UserManager.signinSilent`, "using refresh token"), and the new `User` keeps the old refresh token when Cognito returns none. Cognito's discovery document has no `end_session_endpoint`, so sign-out goes to `<VITE_COGNITO_DOMAIN>/logout?client_id=…&logout_uri=…`.

**A computed molecule's cost.** `meta.provenance.costUsd` is always null (6B-1's ruling). The owner's provenance panel reads `actualUsd` from `GET /api/v1/jobs/{key}`, or `reservedUsd` before settlement. Nobody else sees a cost.

**Retry without the original form.** `retryBody(view)` rebuilds the request as XYZ from the canonical atoms, with explicit charge and multiplicity. The atoms are already rounded to 10⁻⁵ Å, so writing them with 5 decimals gives back the same key. The status panel and the request panel both use it.

**Live checks and the job server.** The foreground-only rule means the local job server cannot stay up across separate Playwright tool calls. Each live step therefore does three things:
- it computes a real job end to end through the dev proxy in one command, with the server started and killed inside it;
- the browser checks the result by reading the real files, which the dev server serves without the job server;
- the browser checks preview, submit and status by answering `/api/**` with Playwright's `page.route`, built from 6B-1's own recorded responses (Task 1) and the real job record. Each such step says so.

**The where-jobs-run choice** is persisted in `localStorage` under `eov.jobs.target`, so `/` and `/admin.html` agree. Production ignores it and always uses the deployed API.

---

## File structure

**Create (client):**

| File | Responsibility |
| --- | --- |
| `src/jobs/build_env.ts` | `BUILD_ENV`: `dev`, `jobsApiUrl`, `cognito` from `import.meta.env` (the only reader of it) |
| `src/jobs/api_types.ts` | 6B-1's response shapes: `JobView`, `PreviewResponse`, `Sizing`, `Meter`, `CostsResponse`, `JobRequest`, `isActive` |
| `src/jobs/format.ts` | `formatUsd`, `money`, `formatDuration`, `formatEnergy`, `methodOf`, `predictionNote`, `capacityLabel`, `elapsedSeconds`, `currentMonth`, `shortKey`, `formatGB`, `microsToUsd` |
| `src/jobs/api.ts` | `createJobsApi`, `apiBase`, `JobsApiError`, 401 refresh-once, error wording |
| `src/jobs/auth.ts` | `OwnerAuth` (oidc-client-ts wrapper), `makeUserManager`, `safeReturnTo`, `logoutUrl` |
| `src/jobs/owner_session.ts` | `startOwnerSession`, `ownerAuth()` |
| `src/jobs/client.ts` | `bindJobsClient`, `jobsApi()`, `chooseTarget`, `jobsPoller()` |
| `src/jobs/poller.ts` | `JobPoller` (per-key ref counts, one in flight, visibility) |
| `src/jobs/useJobPolling.ts`, `src/jobs/useNow.ts`, `src/jobs/useComputedList.ts`, `src/jobs/usePreview.ts` | hooks |
| `src/jobs/computed.ts` | `COMPUTED_CATEGORY`, `computedEntries`, `withComputed` |
| `src/jobs/url_keys.ts` | `registerComputedUrlKeys`, `encodeJobUrl`, `decodeJobUrl` |
| `src/jobs/request_form.ts` | `RequestForm`, `formProblems`, `requestBody`, `formSignature`, `xyzFromCanonical`, `retryBody` |
| `src/jobs/structure_projection.ts` | `symmetricEigen`, `projectStructure`, `canonicalToBohr` |
| `src/molecules/job_paths.ts` | `JOBS_BASE_URL`, `isJobKey`, `jobBaseUrl`, `jobFileUrl`, `computedResultFiles` |
| `src/store/jobsSlice.ts` | session, target, records, followed key, computed list; `selectIsOwner` |
| `src/components/StructurePreview.tsx`, `TierBadge.tsx`, `ProvenancePanel.tsx`, `PreviewDetails.tsx`, `RequestPanel.tsx`, `JobStatusPanel.tsx`, `OwnerBar.tsx`, `MoleculeJobsSection.tsx` | UI |
| `src/admin/main.tsx`, `AdminApp.tsx`, `JobsTable.tsx`, `jobs_table.ts`, `CostPanel.tsx`, `DailySpendChart.tsx`, `admin.css` | the dashboard |
| `public/admin.html` | the second Vite entry |
| `tools/check_admin_split.mjs` | build check: no dashboard code reachable from `index.html` |

**Modify:** `src/molecules/loader.ts` (job keys, the `done.json` gate), `src/molecules/types.ts` (`tier`, `provenance`, `tierOf`), `src/molecules/esp.ts` (`loadEspGrid` reads the molecule's own folder), `src/molecules/ball_and_stick.ts` (H–Kr tables), `src/molecules/url_keys.ts` (export `parseSurface`; no `id` for a job key), `src/components/MoleculePicker.tsx` (Computed chip), `src/store/index.ts`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/App.molecules.test.tsx`, `src/style.css`, `src/vite-env.d.ts`, `vite.config.ts` (two pages; text files as text), `jest.config.ts` (`build_env` mapper), `package.json` (`oidc-client-ts`, `check:admin-split`), `tests/molecules/ball_and_stick.test.ts` (Fe is now known), `README.md`, `docs/HANDOFF.md`.

**Tests:** `tests/jobs/*.test.ts(x)`, `tests/jobs/build_env_stub.ts`, `tests/jobs/api_fixtures.ts`, `tests/jobs/make_api_fixtures.py`, `tests/jobs/fixtures/api/*.json`, `tests/admin/*.test.ts(x)`, `src/App.jobs.test.tsx`.

---

### Task 1: Contracts with Phases 2, 5, 6 and 6B-1

**Files:**
- Create: `tests/jobs/phase6_contracts.test.ts`, `tests/jobs/make_api_fixtures.py`, `tests/jobs/fixtures/api/*.json` (13 files, generated), `tests/jobs/api_fixtures.test.ts`

**Interfaces:**
- Consumes (Phase 6, checked here): `moleculeSlice` default reducer, `selectMolecule({ id, surface? })`, `metaLoaded({ id, meta })`, `metaFailed({ id, message })`, `MoleculeState` (`selectedId`, `meta`, `isLoadingMeta`, `error`, `surface`), `MoleculeSurface`; `encodeMoleculeUrl`, `decodeMoleculeUrl`, `registerMoleculeUrlKeys` (`src/molecules/url_keys.ts`); `LIBRARY_CATEGORIES`, `asLibraryMeta`, `LibraryMoleculeMeta`, `MoleculeAtom` (`src/molecules/library_types.ts`); `detectBonds`, `CPK_COLORS`, `COVALENT_RADII_ANGSTROM`, `BOHR_TO_ANGSTROM`, `ATOM_RADIUS_FACTOR` (`src/molecules/ball_and_stick.ts`); `filterMolecules`, `formatFormula`, `libraryEntries` (`src/molecules/catalogue.ts`); `MoleculePicker` props `{ entries, error, selectedId, onSelect, autoFocus? }`; `MoleculeNav` props `{ variant?, entries, indexError, meta, selectedId, isLoading, surface, onSelectMolecule, onSurfaceChange, onOpenPicker? }`; `loadEspGrid(meta, baseUrl?)` (`src/molecules/esp.ts`); `getDensityGrid(meta)` (`src/molecules/grid_cache.ts`); the test fixtures `waterMeta(overrides?)`, `waterAtoms()`, `LIBRARY_INDEX` (`tests/molecules/fixtures.ts`). Phase 5: `moleculePath`, `MOLECULES_BASE_URL`, `MoleculeLoadError`, `loadMoleculeMeta`, `clearMoleculeCacheForTests` (`src/molecules/loader.ts`); `MoleculeIndexEntry`, `MoleculeMeta` (`src/molecules/types.ts`). Phase 2: `registerUrlKeys`, `urlModeOf`, `applyStateTo`, `encodeStateOf`, `resetUrlKeysForTests` (`src/url_state.ts`); `setMode`, `ViewMode` including `'molecule'` (`src/store/atomSlice.ts`); `createAppStore` (`src/store/index.ts`). 6B-1: `jobs.handlers.Api`, `jobs.store.FileStore(root, cap_micros=…)`, `jobs.runner.NullRunner`, `jobs.errors.JobRefused`.
- Produces: `tests/jobs/fixtures/api/<name>.json`, each `{ "status": number, "body": <response> }`, for `preview_ok`, `preview_aws`, `preview_known`, `preview_refused`, `error_unknown_compound`, `submit_created`, `submit_known`, `get_running`, `get_done`, `get_failed`, `list_done`, `list_all` and `costs`. Every later task's client tests read these through Task 2's `tests/jobs/api_fixtures.ts`.
- **Rule:** a failure here means Phase 6 (or 6B-1) shipped a different name. Fix the uses in this plan's later tasks (search and replace the name), never Phase 6 or 6B-1, and record the mapping in this task's commit message.

- [ ] **Step 1: Write the Phase 6 contract test**

```ts
// tests/jobs/phase6_contracts.test.ts
/**
 * Every Phase 2/5/6 name Phase 6B-2 builds on. A failure means Phase 6
 * shipped a different name: fix the uses in this plan's later tasks, never
 * Phase 6.
 */
import type React from 'react';
import moleculeReducer, { selectMolecule, metaLoaded, metaFailed } from '../../src/store/moleculeSlice';
import type { MoleculeState, MoleculeSurface } from '../../src/store/moleculeSlice';
import { encodeMoleculeUrl, decodeMoleculeUrl, registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { LIBRARY_CATEGORIES, asLibraryMeta } from '../../src/molecules/library_types';
import type { LibraryMoleculeMeta, MoleculeAtom } from '../../src/molecules/library_types';
import { detectBonds, CPK_COLORS, COVALENT_RADII_ANGSTROM, BOHR_TO_ANGSTROM, ATOM_RADIUS_FACTOR } from '../../src/molecules/ball_and_stick';
import { filterMolecules, formatFormula, libraryEntries } from '../../src/molecules/catalogue';
import type MoleculePicker from '../../src/components/MoleculePicker';
import type MoleculeNav from '../../src/components/MoleculeNav';
import type { loadEspGrid } from '../../src/molecules/esp';
import type { getDensityGrid } from '../../src/molecules/grid_cache';
import { moleculePath, MOLECULES_BASE_URL, MoleculeLoadError, clearMoleculeCacheForTests } from '../../src/molecules/loader';
import type { loadMoleculeMeta } from '../../src/molecules/loader';
import type { MoleculeIndexEntry, MoleculeMeta } from '../../src/molecules/types';
import { registerUrlKeys, urlModeOf, applyStateTo, encodeStateOf, resetUrlKeysForTests } from '../../src/url_state';
import { setMode } from '../../src/store/atomSlice';
import type { ViewMode } from '../../src/store/atomSlice';
import { createAppStore } from '../../src/store';
import { waterMeta, waterAtoms, LIBRARY_INDEX } from '../molecules/fixtures';

/** Never called: its body is the contract, and tsc is the checker. */
function contracts(): void {
    const selected: MoleculeState['selectedId'] = null;
    const meta: MoleculeState['meta'] = null as LibraryMoleculeMeta | null;
    const surface: MoleculeSurface = { kind: 'esp' };
    const select = selectMolecule({ id: 'h2o', surface });
    const loaded = metaLoaded({ id: 'h2o', meta: waterMeta() });
    const failed = metaFailed({ id: 'h2o', message: 'HTTP 404' });
    const esp: (meta: LibraryMoleculeMeta, baseUrl?: string) => Promise<unknown> = null as unknown as typeof loadEspGrid;
    const density: (meta: LibraryMoleculeMeta) => Promise<unknown> = null as unknown as typeof getDensityGrid;
    const loadMeta: (id: string) => Promise<MoleculeMeta> = null as unknown as typeof loadMoleculeMeta;
    const picker: React.ComponentProps<typeof MoleculePicker> = {
        entries: LIBRARY_INDEX, error: null, selectedId: null, onSelect: (_id: string) => undefined,
    };
    const nav: React.ComponentProps<typeof MoleculeNav> = {
        variant: 'body', entries: LIBRARY_INDEX, indexError: null, meta: waterMeta(), selectedId: 'h2o', isLoading: false,
        surface, onSelectMolecule: (_id: string) => undefined, onSurfaceChange: (_surface: MoleculeSurface) => undefined,
    };
    const atoms: MoleculeAtom[] = waterAtoms();
    const entry: MoleculeIndexEntry = { id: 'h2o', name: 'Water', formula: 'H2O', category: 'first-examples', tags: [] };
    const mode: ViewMode = 'molecule';
    const register: typeof registerUrlKeys = registerUrlKeys;
    void [selected, meta, select, loaded, failed, esp, density, loadMeta, picker, nav, atoms, entry, mode, register, ATOM_RADIUS_FACTOR];
}

afterEach(() => { resetUrlKeysForTests(); clearMoleculeCacheForTests(); });

describe('Phase 6 contracts', () => {
    it('is type-checked by tsc; this only proves the file loads', () => {
        expect(typeof contracts).toBe('function');
    });

    it('names Molecules mode "molecule" in a link, and its keys round-trip', () => {
        resetUrlKeysForTests();
        registerMoleculeUrlKeys();
        const store = createAppStore();
        store.dispatch(setMode('molecule'));
        expect(urlModeOf(store.getState())).toBe('molecule');
        applyStateTo('#mode=molecule&id=h2o&show=esp', store.dispatch);
        expect(store.getState().molecule.selectedId).toBe('h2o');
        expect(store.getState().molecule.surface).toEqual({ kind: 'esp' });
        expect(new URLSearchParams(encodeStateOf(store.getState())).get('id')).toBe('h2o');
        expect(encodeMoleculeUrl(store.getState().molecule)).toEqual(expect.objectContaining({ id: 'h2o', show: 'esp' }));
        expect(decodeMoleculeUrl({ id: 'h2o' })).toEqual({ id: 'h2o' });
    });

    it('keeps the shapes of selection and loading', () => {
        let state = moleculeReducer(undefined, selectMolecule({ id: 'h2o' }));
        expect([state.selectedId, state.isLoadingMeta, state.meta]).toEqual(['h2o', true, null]);
        state = moleculeReducer(state, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(state.meta?.id).toBe('h2o');
        state = moleculeReducer(moleculeReducer(undefined, selectMolecule({ id: 'x' })), metaFailed({ id: 'x', message: 'HTTP 404' }));
        expect(state.error).toContain('HTTP 404');
        expect(asLibraryMeta(waterMeta() as unknown as MoleculeMeta).id).toBe('h2o');
    });

    it('filters the picker by category, and the library filter drops categories it does not know', () => {
        expect(LIBRARY_CATEGORIES.map(c => c.key)).toContain('polarity');
        expect(filterMolecules(LIBRARY_INDEX, 'water', null).map(e => e.id)).toEqual(['h2o']);
        expect(formatFormula('H2O')).toBe('H₂O');
        expect(libraryEntries([{ id: 'k', name: 'K', formula: 'H2O', category: 'computed', tags: [] }])).toEqual([]);
    });

    it('takes bonds, radii and colours from ball_and_stick', () => {
        expect(detectBonds(waterAtoms())).toHaveLength(2);
        expect(COVALENT_RADII_ANGSTROM[8]).toBeCloseTo(0.66, 9);
        expect(CPK_COLORS[8]).toBe('#ff0d0d');
        expect(BOHR_TO_ANGSTROM).toBeCloseTo(0.529177210903, 12);
    });

    it('names the versioned library path and the load error type', () => {
        expect(MOLECULES_BASE_URL).toMatch(/^\/molecules\/v\d+$/);
        expect(moleculePath('h2o')).toBe(`${MOLECULES_BASE_URL}/h2o`);
        expect(() => moleculePath('../x')).toThrow(MoleculeLoadError);
    });
});
```

- [ ] **Step 2: Run it**

Run: `npx tsc --noEmit -p . && npx jest tests/jobs/phase6_contracts.test.ts`
Expected: tsc clean; 6 tests pass. On a tsc error or a failing name, apply the rule in **Interfaces**, then rerun until clean.

- [ ] **Step 3: Check the App anchors Task 12 edits, and probe the diatomic-only paths**

Run: `grep -c "molecule-legend-stack\|moleculeNavProps\|useMoleculeLoader(isMoleculeMode)\|variant=\"body\"" src/App.tsx`
Expected: a count of at least 4. If any anchor is missing, Phase 6 laid out the App differently: read `src/App.tsx` and rewrite Task 12 Step 4's edit locations to match before going on.

Run: `grep -n "function parseSurface\|function encodeMoleculeUrl" src/molecules/url_keys.ts; grep -n "const matches = useMemo\|LIBRARY_CATEGORIES.map" src/components/MoleculePicker.tsx; grep -n "export async function loadEspGrid" src/molecules/esp.ts`
Expected: one hit for each pattern. These are the private Phase 6 lines that Tasks 3 and 5 edit in place. If one is named differently, rewrite those tasks' edit instructions to match before going on.

Run: `grep -n "const \[a, b\] = basis.atoms\|isBondsField\|MO_LABEL\|widest" src/export/caption.ts src/store/orbitalSlice.ts src/bonds/bonds_url.ts src/components/MoDiagram.tsx src/bonds/*.ts | head -20`
Expected: each hit either belongs to Bonds-only code, or was generalised by Phase 6 (HANDOFF "For Phase 6", spec §14 item 7). If one is still diatomic-only and Molecules mode reaches it (an export caption of a molecule, SF₆'s MO diagram, switching mode with a molecule's MO drawn), the same defect hits computed molecules. **Do not add a task.** Record it as a finding for the controller in this task's report.

- [ ] **Step 4: Write the fixture recorder for 6B-1's responses**

```python
# tests/jobs/make_api_fixtures.py
"""Records the 6B-1 job API's real responses as JSON for the 6B-2 client tests.

    tools/molecules/.venv/bin/python tests/jobs/make_api_fixtures.py      (from the repo root)

The responses come from tools/jobs/handlers.Api itself, over a throwaway
FileStore and a stand-in PubChem, so the client is tested against the shapes
the server really writes, not a hand copy of them. Rerun whenever
handlers.py or model.py changes shape, and commit the JSON.
"""
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO / 'tools'), str(REPO / 'tools' / 'molecules')]

from jobs.errors import JobRefused  # noqa: E402
from jobs.handlers import Api  # noqa: E402
from jobs.runner import NullRunner  # noqa: E402
from jobs.store import FileStore  # noqa: E402

OUT = REPO / 'tests' / 'jobs' / 'fixtures' / 'api'
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
WATER = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'


def resolve(kind, text, *args, **kwargs):
    if text.strip().lower() == 'water':
        return {'cid': 962, 'title': 'Water', 'charge': 0, 'retrievedAt': '2026-10-10', 'atoms': WATER}
    raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')


def call(api, method, path, body=None, query=None):
    raw = json.dumps(body).encode() if body is not None else None
    return api.handle(method, path, query or {}, raw)


def record_all(root: Path) -> dict:
    out = {}
    api = Api(FileStore(root / 'local'), NullRunner(), resolve=resolve, now=lambda: NOW, backend='local')
    water = {'recipe': 'single', 'molecule': {'name': 'water'}}
    out['preview_ok'] = call(api, 'POST', '/api/v1/jobs/preview', water)
    out['error_unknown_compound'] = call(api, 'POST', '/api/v1/jobs/preview',
                                         {'recipe': 'single', 'molecule': {'name': 'unobtainium'}})
    out['submit_created'] = call(api, 'POST', '/api/v1/jobs', water)
    key = out['submit_created'][1]['key']
    api.store.update_job(key, {'status': 'RUNNING', 'startedAt': '2026-10-10T12:00:05Z',
                               'heartbeatAt': '2026-10-10T12:00:35Z', 'stage': 'SCF (DIIS)',
                               'latestEnergyHartree': -76.4612, 'peakMemoryGB': 0.41,
                               'logTail': ['cycle= 7 E= -76.4611982', 'cycle= 8 E= -76.4612007']})
    out['get_running'] = call(api, 'GET', f'/api/v1/jobs/{key}')
    out['submit_known'] = call(api, 'POST', '/api/v1/jobs', water)
    out['preview_known'] = call(api, 'POST', '/api/v1/jobs/preview', water)
    api.store.update_job(key, {'status': 'DONE', 'endedAt': '2026-10-10T12:01:15Z', 'stage': None,
                               'actual': {'wallSeconds': 70.2, 'peakMemoryGB': 0.52, 'threads': 8}})
    api.store.settle(key, 0)
    out['get_done'] = call(api, 'GET', f'/api/v1/jobs/{key}')
    out['list_done'] = call(api, 'GET', '/api/v1/jobs', query={'month': '2026-10', 'status': 'DONE'})

    optimise = {'recipe': 'optimise', 'molecule': {'xyz': WATER_XYZ}}
    failed_key = call(api, 'POST', '/api/v1/jobs', optimise)[1]['key']
    api.store.update_job(failed_key, {'status': 'FAILED', 'endedAt': '2026-10-10T12:03:00Z', 'stage': None,
                                      'error': {'code': 'scf-not-converged',
                                                'message': 'SCF did not converge (DIIS, level shift 0.3 Ha, second-order)'}})
    api.store.settle(failed_key, 0)
    out['get_failed'] = call(api, 'GET', f'/api/v1/jobs/{failed_key}')
    out['list_all'] = call(api, 'GET', '/api/v1/jobs', query={'month': '2026-10'})
    out['costs'] = call(api, 'GET', '/api/v1/costs', query={'month': '2026-10'})

    # AWS prices: Spot, a real reservation. With a cap of one micro-dollar the
    # reservation cannot fit, so the preview answers 200 with everything it
    # resolved and decision.ok false -- the refusal the UI must still draw.
    out['preview_aws'] = call(Api(FileStore(root / 'aws'), NullRunner(), resolve=resolve, now=lambda: NOW, backend='aws'),
                              'POST', '/api/v1/jobs/preview', water)
    out['preview_refused'] = call(Api(FileStore(root / 'capped', cap_micros=1), NullRunner(), resolve=resolve,
                                      now=lambda: NOW, backend='aws'), 'POST', '/api/v1/jobs/preview', water)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        recorded = record_all(Path(tmp))
    for name, (status, body) in sorted(recorded.items()):
        (OUT / f'{name}.json').write_text(json.dumps({'status': status, 'body': body}, indent=1, ensure_ascii=False) + '\n')
        print(f'{name:24} {status}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 5: Record the fixtures**

Run: `tools/molecules/.venv/bin/python tests/jobs/make_api_fixtures.py`
Expected: 13 lines. `error_unknown_compound` reports 422, `submit_created` 201, and every other fixture 200. If the import fails, a 6B-1 name differs: apply the rule in **Interfaces**.

- [ ] **Step 6: Write the fixture shape test**

```ts
// tests/jobs/api_fixtures.test.ts
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/** The fields 6B-2 reads, as 6B-1 Task 5/6 define them. The JSON is the server's own output (make_api_fixtures.py). */
const DIR = path.resolve(__dirname, 'fixtures/api');
const read = (name: string) => JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as { status: number; body: Record<string, unknown> };

const JOB_VIEW_FIELDS = ['key', 'status', 'attempt', 'recipe', 'job', 'name', 'formula', 'electronCount', 'basisFunctions',
    'geometrySource', 'sizing', 'month', 'submittedAt', 'startedAt', 'endedAt', 'heartbeatAt', 'stage', 'latestEnergyHartree',
    'logTail', 'actual', 'error', 'backend', 'reservedUsd', 'actualUsd', 'resultUrl'];
const SIZING_FIELDS = ['version', 'size', 'vcpu', 'memoryGB', 'capacity', 'attempts', 'basisFunctions', 'predictedSeconds',
    'predictedMemoryGB', 'timeoutSeconds', 'predictedCostMicros'];
const METER_FIELDS = ['month', 'capUsd', 'spentUsd', 'reservedUsd', 'remainingUsd'];

describe('6B-1 responses, as its handlers write them', () => {
    it('records all thirteen', () => {
        expect(readdirSync(DIR).filter(f => f.endsWith('.json'))).toHaveLength(13);
    });

    it('a preview carries what was resolved, the decision, the meter and any existing job', () => {
        const { status, body } = read('preview_ok');
        expect(status).toBe(200);
        expect(Object.keys(body).sort()).toEqual(['atoms', 'basisFunctions', 'charge', 'decision', 'electronCount', 'existing',
            'formula', 'generationEnabled', 'geometrySource', 'job', 'key', 'meter', 'multiplicity', 'name'].sort());
        const decision = body.decision as { ok: boolean; sizing: Record<string, unknown>; reservedUsd: number };
        expect(decision.ok).toBe(true);
        expect(Object.keys(decision.sizing).sort()).toEqual([...SIZING_FIELDS].sort());
        expect(Object.keys(body.meter as object).sort()).toEqual([...METER_FIELDS].sort());
        expect(body.geometrySource).toEqual({ kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' });
        expect(read('preview_known').body.existing).toEqual(expect.objectContaining({ status: 'RUNNING' }));
        expect((read('preview_aws').body.decision as { sizing: { capacity: string } }).sizing.capacity).toBe('spot');
    });

    it('a refused decision still carries the resolved structure', () => {
        const { status, body } = read('preview_refused');
        expect(status).toBe(200);
        expect(body.decision).toEqual({ ok: false, error: { code: 'budget', message: expect.stringMatching(/^Monthly budget reached/) } });
        expect(body.atoms as unknown[]).toHaveLength(3);
    });

    it('every job view has the public fields and none of the internal ones', () => {
        for (const name of ['submit_created', 'get_running', 'get_done', 'get_failed']) {
            const view = read(name).body;
            expect(Object.keys(view)).toEqual(expect.arrayContaining(JOB_VIEW_FIELDS));
            for (const hidden of ['settled', 'runnerJobId', 'reservedMicros', 'actualMicros']) expect(view).not.toHaveProperty(hidden);
        }
        expect(read('get_running').body.peakMemoryGB).toBe(0.41);
        expect(read('get_running').body.actualUsd).toBeNull();
        expect(read('get_done').body.actual).toEqual({ wallSeconds: 70.2, peakMemoryGB: 0.52, threads: 8 });
        expect(read('get_done').body.actualUsd).toBe(0);
        expect(read('get_failed').body.error).toEqual({ code: 'scf-not-converged', message: expect.any(String) });
    });

    it('lists, costs and errors', () => {
        expect(Object.keys(read('list_done').body).sort()).toEqual(['jobs', 'month']);
        expect(read('list_all').body.jobs as unknown[]).toHaveLength(2);
        expect(Object.keys(read('costs').body)).toEqual(expect.arrayContaining([...METER_FIELDS, 'projectionUsd', 'daily', 'billing', 'pricesRetrieved']));
        expect(read('error_unknown_compound')).toEqual({ status: 422, body: { error: { code: 'unknown-compound', message: 'PubChem does not know "unobtainium"' } } });
        expect([read('submit_created').status, read('submit_known').status]).toEqual([201, 200]);
    });
});
```

- [ ] **Step 7: Run it**

Run: `npx jest tests/jobs/api_fixtures.test.ts`
Expected: PASS (5 tests). A missing or extra field means 6B-1 shipped a different shape. Apply the rule in **Interfaces** to Task 2's `api_types.ts` and the later uses, and note it in the commit.

- [ ] **Step 8: Commit**

```bash
git add tests/jobs/phase6_contracts.test.ts tests/jobs/make_api_fixtures.py tests/jobs/fixtures/api tests/jobs/api_fixtures.test.ts
git commit -m "test(jobs): pin the Phase 6 names and 6B-1's recorded responses the interface builds on (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: API types, build-time settings and the number formats

**Files:**
- Create: `src/jobs/build_env.ts`, `tests/jobs/build_env_stub.ts`, `src/jobs/api_types.ts`, `src/jobs/format.ts`, `tests/jobs/api_fixtures.ts`, `tests/jobs/format.test.ts`
- Modify: `jest.config.ts`, `src/vite-env.d.ts`, `src/molecules/types.ts`

**Interfaces:**
- Consumes: the Task 1 fixtures.
- Produces:
  - `build_env.ts`: `interface CognitoSettings { authority: string; clientId: string; domain: string }`; `interface BuildEnv { dev: boolean; jobsApiUrl: string | null; cognito: CognitoSettings | null }`; `const BUILD_ENV: BuildEnv`. The stub (`tests/jobs/build_env_stub.ts`) exports the same `BUILD_ENV` (mutable; default `{ dev: false, jobsApiUrl: null, cognito: null }`) and `resetBuildEnv(): void`.
  - `api_types.ts`: `Recipe = 'single' | 'optimise'`; `JobStatus`; `ACTIVE_STATUSES`; `isActive(status): boolean`; `Capacity = 'spot' | 'on-demand' | 'local'`; `WorkerSize = 'S' | 'M' | 'L' | 'XL'`; `CanonicalAtom = [number, number, number, number]`; `CanonicalJob`; `Sizing`; `GeometrySource`; `ApiError { code; message }`; `JobActual`; `JobView`; `Meter`; `Decision`; `PreviewResponse`; `JobListResponse`; `BillingFigure { usd: number; through?: string }`; `CostsResponse`; `MoleculeInput`; `JobRequest { recipe; molecule; charge?; multiplicity?; retry? }`.
  - `format.ts`: `MoneyLabel = 'spent' | 'reserved' | 'projected' | 'remaining' | 'billed'`; `formatUsd(usd): string`; `money(label, usd): string`; `microsToUsd(micros): number`; `formatDuration(seconds): string`; `formatGB(gb): string`; `formatEnergy(hartree, method): string`; `methodOf(job: CanonicalJob, stage?: string | null): string`; `predictionNote(version): string`; `capacityLabel(capacity): string`; `currentMonth(now?: Date): string`; `elapsedSeconds(view: JobView, nowMs: number): number`; `shortKey(key): string`.
  - `types.ts` (Phase 5's): `MoleculeTier = 'validated' | 'computed'`; `MoleculeProvenance`; `MoleculeIndexEntry.tier?`; `MoleculeMeta.tier?`, `MoleculeMeta.provenance?`; `tierOf(x: { tier?: MoleculeTier }): MoleculeTier`.
  - `tests/jobs/api_fixtures.ts`: `FixtureName`; `fixture(name)`; `previewFixture(name)`; `jobFixture(name)`; `listFixture(name)`; `costsFixture()`; `jsonResponse(status, body)`; `textResponse(status, text)`.

- [ ] **Step 1: Map `build_env` to a stub under Jest**

`import.meta` does not parse under this project's ts-jest (see the comments in `src/App.test.tsx`), so the one module that reads it is swapped out for tests. In `jest.config.ts`, add this to `config`, after `setupFilesAfterEnv`:

```ts
  // import.meta does not parse under ts-jest: the one module that reads
  // import.meta.env (src/jobs/build_env.ts) is replaced by a mutable
  // stand-in, which a test sets and resetBuildEnv() restores.
  moduleNameMapper: {
    '^.+/build_env$': '<rootDir>/tests/jobs/build_env_stub.ts',
  },
```

Append to `src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  /** The deployed jobs API's execute-api URL (Phase 6B-3 sets it at build). */
  readonly VITE_JOBS_API_URL?: string;
  readonly VITE_COGNITO_AUTHORITY?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** The managed-login domain, e.g. https://<prefix>.auth.us-east-1.amazoncognito.com (used for sign-out). */
  readonly VITE_COGNITO_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Write the failing tests and the fixture helpers**

```ts
// tests/jobs/build_env_stub.ts
import type { BuildEnv } from '../../src/jobs/build_env';

/**
 * Jest's stand-in for src/jobs/build_env.ts (jest.config.ts maps it here).
 * Mutable: a test sets what it needs; resetBuildEnv() restores a production
 * build with no API and no sign-in, the safest default for every other test.
 */
export const BUILD_ENV: BuildEnv = { dev: false, jobsApiUrl: null, cognito: null };

export function resetBuildEnv(): void {
    Object.assign(BUILD_ENV, { dev: false, jobsApiUrl: null, cognito: null });
}
```

```ts
// tests/jobs/api_fixtures.ts
import { readFileSync } from 'fs';
import path from 'path';
import type { CostsResponse, JobListResponse, JobView, PreviewResponse } from '../../src/jobs/api_types';

export type FixtureName =
    | 'preview_ok' | 'preview_aws' | 'preview_known' | 'preview_refused' | 'error_unknown_compound'
    | 'submit_created' | 'submit_known' | 'get_running' | 'get_done' | 'get_failed' | 'list_done' | 'list_all' | 'costs';

/** 6B-1's own responses, recorded by tests/jobs/make_api_fixtures.py. */
export function fixture(name: FixtureName): { status: number; body: unknown } {
    return JSON.parse(readFileSync(path.resolve(__dirname, 'fixtures/api', `${name}.json`), 'utf8'));
}
export const previewFixture = (name: 'preview_ok' | 'preview_aws' | 'preview_known' | 'preview_refused') => fixture(name).body as PreviewResponse;
export const jobFixture = (name: 'submit_created' | 'submit_known' | 'get_running' | 'get_done' | 'get_failed') => fixture(name).body as JobView;
export const listFixture = (name: 'list_done' | 'list_all') => fixture(name).body as JobListResponse;
export const costsFixture = () => fixture('costs').body as CostsResponse;

/** A Response as the client reads it: status, ok, and the body as text. */
export function textResponse(status: number, text: string): Response {
    return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}
export const jsonResponse = (status: number, body: unknown): Response => textResponse(status, JSON.stringify(body));
```

```ts
// tests/jobs/format.test.ts
import {
    formatUsd, money, microsToUsd, formatDuration, formatGB, formatEnergy, methodOf, predictionNote, capacityLabel,
    currentMonth, elapsedSeconds, shortKey,
} from '../../src/jobs/format';
import { isActive } from '../../src/jobs/api_types';
import { tierOf } from '../../src/molecules/types';
import { jobFixture } from './api_fixtures';

describe('money', () => {
    it('shows cents from a cent up, and four significant figures below', () => {
        expect(formatUsd(8.8)).toBe('$8.80');
        expect(formatUsd(0.01)).toBe('$0.01');
        expect(formatUsd(0.0298)).toBe('$0.03');
        expect(formatUsd(0.00298)).toBe('$0.002980');
        expect(formatUsd(0.000001)).toBe('$0.000001000');
        expect(formatUsd(0)).toBe('$0.00');
    });
    it('always says what the figure is', () => {
        expect(money('spent', 0.1)).toBe('spent $0.10');
        expect(money('reserved', 0.00298)).toBe('reserved $0.002980');
        expect(money('projected', 1.5)).toBe('projected $1.50');
        expect(microsToUsd(29_800)).toBeCloseTo(0.0298, 12);
    });
});

describe('times and sizes', () => {
    it('reads like a clock, not like a float', () => {
        expect(formatDuration(0)).toBe('0 s');
        expect(formatDuration(42)).toBe('42 s');
        expect(formatDuration(70.2)).toBe('1 min 10 s');
        expect(formatDuration(3725)).toBe('1 h 02 min');
        expect(formatGB(0.5)).toBe('0.50 GB');
        expect(formatGB(64)).toBe('64.0 GB');
    });
    it('measures elapsed time from the start, from submission while waiting, and stops at the end', () => {
        const running = jobFixture('get_running');                       // started 12:00:05
        expect(elapsedSeconds(running, Date.parse('2026-10-10T12:01:05Z'))).toBe(60);
        expect(elapsedSeconds({ ...running, startedAt: null }, Date.parse('2026-10-10T12:00:30Z'))).toBe(30);
        expect(elapsedSeconds(jobFixture('get_done'), Date.parse('2026-10-11T00:00:00Z'))).toBe(70);
    });
    it('months are UTC', () => {
        expect(currentMonth(new Date('2026-10-31T23:30:00-05:00'))).toBe('2026-11');
    });
});

describe('every number states its method', () => {
    it('labels an energy with the method that produced it', () => {
        const single = jobFixture('get_running').job;
        expect(formatEnergy(-76.4612, methodOf(single, 'SCF (DIIS)'))).toBe('−76.461200 Ha (B3LYP/def2-TZVPD)');
        const optimise = jobFixture('get_failed').job;
        expect(methodOf(optimise, 'optimisation step 4')).toBe('B3LYP/def2-SVP');
        expect(methodOf(optimise, 'SCF (DIIS)')).toBe('B3LYP/def2-TZVPD');
        expect(methodOf(optimise)).toBe('B3LYP/def2-TZVPD');
        expect(predictionNote(1)).toBe('sizing v1 prediction');
    });
});

describe('jobs and tiers', () => {
    it('names capacities as the owner thinks of them', () => {
        expect((['spot', 'on-demand', 'local'] as const).map(capacityLabel)).toEqual(['Spot', 'on-demand', 'This Mac']);
    });
    it('knows which statuses are still live', () => {
        expect(['QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED'].map(s => isActive(s as never))).toEqual([true, true, true, false, false]);
    });
    it('shortens a key for display', () => {
        expect(shortKey('e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa')).toBe('e2698ba0c2…');
    });
    it('treats a file without a tier as validated (v1/v2 predate it)', () => {
        expect(tierOf({})).toBe('validated');
        expect(tierOf({ tier: 'computed' })).toBe('computed');
    });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx jest tests/jobs/format.test.ts`
Expected: FAIL, "Cannot find module '../../src/jobs/format'".

- [ ] **Step 4: Implement**

```ts
// src/jobs/build_env.ts
/**
 * Every build-time setting the jobs interface reads, in one module. Vite
 * replaces import.meta.env at build; Jest cannot parse import.meta at all,
 * so jest.config.ts maps this module to tests/jobs/build_env_stub.ts.
 */
export interface CognitoSettings { authority: string; clientId: string; domain: string }

export interface BuildEnv {
    /** The Vite dev server (npm run dev), where the owner may run jobs on this Mac. */
    dev: boolean;
    /** The deployed API's execute-api URL (Phase 6B-3 sets it at build); null when unset. */
    jobsApiUrl: string | null;
    /** null until all three VITE_COGNITO_* values are set: sign-in then says "not configured". */
    cognito: CognitoSettings | null;
}

const env = import.meta.env;
const authority = env.VITE_COGNITO_AUTHORITY;
const clientId = env.VITE_COGNITO_CLIENT_ID;
const domain = env.VITE_COGNITO_DOMAIN;

export const BUILD_ENV: BuildEnv = {
    dev: env.DEV,
    jobsApiUrl: env.VITE_JOBS_API_URL ? env.VITE_JOBS_API_URL.replace(/\/+$/, '') : null,
    cognito: authority && clientId && domain ? { authority, clientId, domain: domain.replace(/\/+$/, '') } : null,
};
```

```ts
// src/jobs/api_types.ts
/**
 * The job API's JSON, exactly as tools/jobs/handlers.py and
 * model.public_view write it (Phase 6B-1, Tasks 5 and 6), pinned by the
 * recorded fixtures in tests/jobs/fixtures/api. Money is USD everywhere
 * except inside `sizing`, which carries the rule's own micro-dollar
 * prediction unconverted.
 */
export type Recipe = 'single' | 'optimise';
export type JobStatus = 'QUEUED' | 'STARTING' | 'RUNNING' | 'DONE' | 'FAILED';
export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>(['QUEUED', 'STARTING', 'RUNNING']);
export const isActive = (status: JobStatus): boolean => ACTIVE_STATUSES.has(status);

export type Capacity = 'spot' | 'on-demand' | 'local';
export type WorkerSize = 'S' | 'M' | 'L' | 'XL';
/** [Z, x, y, z], Å, each coordinate rounded to 10⁻⁵ (spec §5.2). */
export type CanonicalAtom = [number, number, number, number];

export interface CanonicalJob {
    computeVersion: number;
    recipe: Recipe;
    method: { xc: string; basis: string; optimiseBasis: string | null };
    molecule: { atoms: CanonicalAtom[]; charge: number; multiplicity: number };
}

export interface Sizing {
    version: number;
    size: WorkerSize;
    vcpu: number;
    memoryGB: number;
    capacity: Capacity;
    attempts: number;
    basisFunctions: number;
    predictedSeconds: number;
    predictedMemoryGB: number;
    timeoutSeconds: number;
    predictedCostMicros: number;
}

export type GeometrySource =
    | { kind: 'pubchem'; cid: number; title: string; query: string; retrievedAt: string }
    | { kind: 'xyz' };

export interface ApiError { code: string; message: string }
export interface JobActual { wallSeconds: number; peakMemoryGB: number; threads: number }

export interface JobView {
    key: string;
    status: JobStatus;
    attempt: number;
    recipe: Recipe;
    job: CanonicalJob;
    name: string;
    formula: string;
    electronCount: number;
    basisFunctions: number;
    geometrySource: GeometrySource;
    sizing: Sizing;
    month: string;
    submittedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    heartbeatAt: string | null;
    stage: string | null;
    latestEnergyHartree: number | null;
    logTail: string[];
    actual: JobActual | null;
    error: ApiError | null;
    backend: 'local' | 'aws';
    /** Written by the worker's heartbeat; absent until the first one. */
    peakMemoryGB?: number;
    reservedUsd: number;
    /** null until the job is settled. */
    actualUsd: number | null;
    resultUrl: string;
}

export interface Meter { month: string; capUsd: number; spentUsd: number; reservedUsd: number; remainingUsd: number }

export type Decision = { ok: true; sizing: Sizing; reservedUsd: number } | { ok: false; error: ApiError };

export interface PreviewResponse {
    key: string;
    job: CanonicalJob;
    name: string;
    formula: string;
    electronCount: number;
    basisFunctions: number;
    atoms: CanonicalAtom[];
    charge: number;
    multiplicity: number;
    geometrySource: GeometrySource;
    decision: Decision;
    existing: JobView | null;
    meter: Meter;
    generationEnabled: boolean;
}

export interface JobListResponse { month: string; jobs: JobView[] }

/** Cost Explorer's figure (Phase 6B-3's billing Lambda); `usd` is what this UI reads. */
export interface BillingFigure { usd: number; through?: string }

export interface CostsResponse extends Meter {
    projectionUsd: number;
    daily: Array<{ date: string; usd: number }>;
    billing: BillingFigure | null;
    pricesRetrieved: string;
}

export type MoleculeInput = { name: string } | { smiles: string } | { xyz: string };

export interface JobRequest {
    recipe: Recipe;
    molecule: MoleculeInput;
    charge?: number;
    multiplicity?: number;
    retry?: boolean;
}
```

```ts
// src/jobs/format.ts
import type { Capacity, CanonicalJob, JobView } from './api_types';

export type MoneyLabel = 'spent' | 'reserved' | 'projected' | 'remaining' | 'billed';

/**
 * USD at the precision the meter has (whole micro-dollars): cents from a
 * cent up, and below that four significant figures, so a 0.3-cent Spot
 * minute reads "$0.002980" rather than a misleading "$0.00".
 */
export function formatUsd(usd: number): string {
    const sign = usd < 0 ? '−' : '';
    const value = Math.abs(usd);
    if (value === 0 || value >= 0.01) return `${sign}$${value.toFixed(2)}`;
    return `${sign}$${value.toPrecision(4)}`;
}

/** A figure is never bare: spent, reserved and projected mean different things for the cap. */
export function money(label: MoneyLabel, usd: number): string {
    return `${label} ${formatUsd(usd)}`;
}

export const microsToUsd = (micros: number): number => micros / 1_000_000;

export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
    return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
}

export const formatGB = (gb: number): string => `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;

/** Total energies to the µHa the SCF converges to, with the method beside them (parent spec §3.1). */
export function formatEnergy(hartree: number, method: string): string {
    return `${hartree < 0 ? '−' : ''}${Math.abs(hartree).toFixed(6)} Ha (${method})`;
}

/** Recipe B's optimisation steps run in the smaller basis; everything else is the job's own. */
export function methodOf(job: CanonicalJob, stage: string | null = null): string {
    const { xc, basis, optimiseBasis } = job.method;
    if (optimiseBasis && stage !== null && /^optimisation/i.test(stage)) return `${xc}/${optimiseBasis}`;
    return `${xc}/${basis}`;
}

export const predictionNote = (version: number): string => `sizing v${version} prediction`;

const CAPACITY: Record<Capacity, string> = { spot: 'Spot', 'on-demand': 'on-demand', local: 'This Mac' };
export const capacityLabel = (capacity: Capacity): string => CAPACITY[capacity];

/** Jobs are charged to the UTC month they were submitted in (spec §6.4). */
export function currentMonth(now: Date = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Seconds since the job started (or, while it waits for a worker, since it was submitted), until it ended. */
export function elapsedSeconds(view: JobView, nowMs: number): number {
    const start = Date.parse(view.startedAt ?? view.submittedAt);
    const end = view.endedAt ? Date.parse(view.endedAt) : nowMs;
    return Math.max(0, Math.round((end - start) / 1000));
}

export const shortKey = (key: string): string => `${key.slice(0, 10)}…`;
```

In `src/molecules/types.ts` (Phase 5's), add at the end of the file:

```ts
/** Spec §9.1: the curated library is validated; a molecule computed on request is not benchmarked. Absent means validated. */
export type MoleculeTier = 'validated' | 'computed';

/** meta.provenance, written by the 6B-1 worker for computed molecules (spec §9.3). */
export interface MoleculeProvenance {
    jobKey: string;
    computeVersion: number;
    recipe: 'single' | 'optimise';
    geometrySource: { kind: 'pubchem'; cid: number; title: string; query: string; retrievedAt: string } | { kind: 'xyz' };
    caveats: string[];
    generatorCommit: string;
    imageDigest: string;
    pyscfVersion: string;
    sizingVersion: number;
    size: string;
    capacity: 'spot' | 'on-demand' | 'local';
    wallSeconds: number;
    /** Always null (6B-1): settlement comes after the immutable files; the owner reads the cost from the job record. */
    costUsd: number | null;
}

export function tierOf(item: { tier?: MoleculeTier }): MoleculeTier {
    return item.tier ?? 'validated';
}
```

Then add `tier?: MoleculeTier;` as the last field of `MoleculeIndexEntry`, and add `tier?: MoleculeTier;` and `provenance?: MoleculeProvenance;` as the last fields of `MoleculeMeta`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/jobs/format.test.ts tests/jobs/api_fixtures.test.ts && npx tsc --noEmit -p .`
Expected: PASS (10 + 5 tests); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add jest.config.ts src/vite-env.d.ts src/jobs/build_env.ts src/jobs/api_types.ts src/jobs/format.ts src/molecules/types.ts tests/jobs/build_env_stub.ts tests/jobs/api_fixtures.ts tests/jobs/format.test.ts
git commit -m "feat(jobs): API types from 6B-1's responses, build-time settings, and labelled money, time and energy formats (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The computed tier in the loader

**Files:**
- Create: `src/molecules/job_paths.ts`, `tests/jobs/computed_loader.test.ts`
- Modify: `src/molecules/loader.ts`, `src/molecules/esp.ts`

**Interfaces:**
- Consumes: `moleculePath`, `loadMoleculeMeta`, `MoleculeLoadError`, `clearMoleculeCacheForTests`, `MOLECULES_BASE_URL` (Phase 5); `loadEspGrid(meta, baseUrl?)`, `asLibraryMeta` (Phase 6); `waterMeta` (Phase 6 fixtures).
- Produces:
  - `job_paths.ts`: `JOBS_BASE_URL = '/molecules/jobs'`; `isJobKey(id: string | null | undefined): id is string`; `jobBaseUrl(key): string`; `jobFileUrl(key, name): string`; `computedResultFiles(recipe: 'single' | 'optimise'): string[]`.
  - `loader.ts`: `moleculePath(jobKey)` returns `/molecules/jobs/<key>`; `RESULT_NOT_FINISHED: string`; `loadMoleculeMeta(jobKey)` reads `done.json` first (`cache: 'no-store'`). It rejects with `MoleculeLoadError(RESULT_NOT_FINISHED)` on 404 or 403, and never reads `meta.json` then.
  - `esp.ts`: `loadEspGrid(meta)` (no `baseUrl`) reads `${moleculePath(meta.id)}/esp.bin.gz`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/jobs/computed_loader.test.ts
import {
    clearMoleculeCacheForTests, loadMoleculeMeta, moleculePath, MOLECULES_BASE_URL, RESULT_NOT_FINISHED,
} from '../../src/molecules/loader';
import { computedResultFiles, isJobKey, jobFileUrl, JOBS_BASE_URL } from '../../src/molecules/job_paths';
import { loadEspGrid } from '../../src/molecules/esp';
import { asLibraryMeta } from '../../src/molecules/library_types';
import type { MoleculeMeta } from '../../src/molecules/types';
import { waterMeta } from '../molecules/fixtures';

const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';
const DONE = `/molecules/jobs/${KEY}/done.json`;
const META = `/molecules/jobs/${KEY}/meta.json`;

type Route = { status: number; body?: unknown; bytes?: Uint8Array };
function routeFetch(routes: Record<string, Route>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const route = routes[url] ?? { status: 404 };
        return {
            ok: route.status >= 200 && route.status < 300, status: route.status,
            json: async () => route.body,
            arrayBuffer: async () => (route.bytes ?? new Uint8Array(0)).slice().buffer,
        } as unknown as Response;
    }) as unknown as typeof fetch;
    return calls;
}
const finished = (): Record<string, Route> => ({
    [DONE]: { status: 200, body: { key: KEY, files: { 'meta.json': 'ab12' }, writtenAt: '2026-10-10T12:01:15Z' } },
    [META]: { status: 200, body: waterMeta({ id: KEY, tier: 'computed' }) },
});

beforeEach(() => clearMoleculeCacheForTests());

describe('job keys and paths', () => {
    it('tells a job key from a library id', () => {
        expect(isJobKey(KEY)).toBe(true);
        expect(isJobKey('h2o')).toBe(false);
        expect(isJobKey(KEY.toUpperCase())).toBe(false);
        expect(isJobKey(KEY.slice(1))).toBe(false);
        expect(isJobKey(null)).toBe(false);
    });
    it('a job key resolves to the jobs folder, a library id to the versioned library', () => {
        expect(moleculePath(KEY)).toBe(`/molecules/jobs/${KEY}`);
        expect(moleculePath('h2o')).toBe(`${MOLECULES_BASE_URL}/h2o`);
        expect(jobFileUrl(KEY, 'input.py')).toBe(`${JOBS_BASE_URL}/${KEY}/input.py`);
        expect(computedResultFiles('single')).toEqual(['input.py', 'output.log', 'geometry.xyz', 'job.json']);
        expect(computedResultFiles('optimise')).toContain('trajectory.xyz');
    });
});

describe('opening a computed molecule', () => {
    it('reads meta.json only after done.json lists it', async () => {
        const calls = routeFetch(finished());
        expect((await loadMoleculeMeta(KEY)).id).toBe(KEY);
        expect(calls.map(c => c.url)).toEqual([DONE, META]);
    });

    it.each([404, 403])('says the result is not finished when done.json is missing (HTTP %i), and never reads meta.json', async status => {
        const calls = routeFetch({ [DONE]: { status }, [META]: finished()[META] });
        await expect(loadMoleculeMeta(KEY)).rejects.toThrow(RESULT_NOT_FINISHED);
        expect(calls.map(c => c.url)).toEqual([DONE]);
    });

    it('refuses a done.json that does not list meta.json', async () => {
        routeFetch({ [DONE]: { status: 200, body: { key: KEY, files: {} } }, [META]: finished()[META] });
        await expect(loadMoleculeMeta(KEY)).rejects.toThrow(/does not list meta\.json/);
    });

    it('forgets the failure, so the same link works once the job has finished', async () => {
        routeFetch({});
        await expect(loadMoleculeMeta(KEY)).rejects.toThrow(RESULT_NOT_FINISHED);
        routeFetch(finished());
        await expect(loadMoleculeMeta(KEY)).resolves.toEqual(expect.objectContaining({ id: KEY }));
    });

    it('asks for done.json past the HTTP cache: a 404 cached while the job ran must not outlive it', async () => {
        const calls = routeFetch(finished());
        await loadMoleculeMeta(KEY);
        expect(calls[0].init).toEqual({ cache: 'no-store' });
    });

    it('reads library molecules as before, with no done.json', async () => {
        const calls = routeFetch({ [`${MOLECULES_BASE_URL}/h2o/meta.json`]: { status: 200, body: waterMeta() } });
        await loadMoleculeMeta('h2o');
        expect(calls.map(c => c.url)).toEqual([`${MOLECULES_BASE_URL}/h2o/meta.json`]);
    });

    it("reads a computed molecule's ESP grid from its job folder", async () => {
        const meta = asLibraryMeta(waterMeta({ id: KEY, espGrid: { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2 } }) as unknown as MoleculeMeta);
        const calls = routeFetch({ [`/molecules/jobs/${KEY}/esp.bin.gz`]: { status: 200, bytes: new Uint8Array(new Float32Array(8).fill(0.5).buffer) } });
        const grid = await loadEspGrid(meta);
        expect(calls.map(c => c.url)).toEqual([`/molecules/jobs/${KEY}/esp.bin.gz`]);
        expect(grid.values[7]).toBe(0.5);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/computed_loader.test.ts`
Expected: FAIL, "Cannot find module '../../src/molecules/job_paths'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/job_paths.ts
/**
 * Where computed molecules live (spec §5.3): /molecules/jobs/<key>/, beside
 * the versioned library rather than inside it, since a job's result is not
 * part of any published data version. The key is the lowercase hex SHA-256
 * of the canonical job (spec §5.2) -- 64 characters, which no library id
 * (at most 40 of [a-z0-9-]) can be, so the id alone says which it is.
 */
export const JOBS_BASE_URL = '/molecules/jobs';
const JOB_KEY = /^[0-9a-f]{64}$/;

export function isJobKey(id: string | null | undefined): id is string {
    return typeof id === 'string' && JOB_KEY.test(id);
}

export const jobBaseUrl = (key: string): string => `${JOBS_BASE_URL}/${key}`;
export const jobFileUrl = (key: string, name: string): string => `${jobBaseUrl(key)}/${name}`;

/** The files a finished job leaves beside Phase 6's (spec §5.3), in the order the provenance panel lists them. */
export function computedResultFiles(recipe: 'single' | 'optimise'): string[] {
    return ['input.py', 'output.log', 'geometry.xyz', 'job.json', ...(recipe === 'optimise' ? ['trajectory.xyz'] : [])];
}
```

In `src/molecules/loader.ts`:

1. Add `import { isJobKey, jobBaseUrl } from './job_paths';` after the existing imports.
2. Make job keys the first case of `moleculePath`. Replace the doc comment and the function's first line so that it begins:

```ts
/**
 * 'n2' → /molecules/<version>/n2; 'n2@07' (scan point 7) → /molecules/<version>/n2/scan/07;
 * a 64-hex job key → /molecules/jobs/<key> (spec §5.3).
 */
export function moleculePath(id: string): string {
    // A computed molecule's id is its job key, so the id alone says where it
    // lives: meta, basis, density and ESP loads -- and the MO worker, which
    // is handed nothing but the id -- need no second argument (spec §9.1).
    if (isJobKey(id)) return jobBaseUrl(id);
```

   The rest of the function body stays as it is.
3. Replace `loadMoleculeMeta` with the following, and add the constant and the helper above it:

```ts
export const RESULT_NOT_FINISHED =
    'This computed molecule has no finished result yet: its job may still be running, or it failed. Open the link again once it has finished.';

/**
 * done.json is written last (spec §5.3), so a folder without it is a job
 * still running, one that failed, or one interrupted half-way through its
 * files: none of them is a result, and drawing any of it would be a stale or
 * partial picture. S3 behind CloudFront answers a missing object with 403
 * (no list permission), not 404, so both mean "not there". no-store: a 404
 * the browser cached while the job ran must not hide the result once it
 * exists.
 */
async function requireFinishedResult(key: string): Promise<void> {
    const url = `${jobBaseUrl(key)}/done.json`;
    let response: Response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
        throw new MoleculeLoadError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 404 || response.status === 403) throw new MoleculeLoadError(RESULT_NOT_FINISHED);
    if (!response.ok) throw new MoleculeLoadError(`Could not load ${url} (HTTP ${response.status})`);
    let done: { files?: Record<string, unknown> };
    try {
        done = (await response.json()) as { files?: Record<string, unknown> };
    } catch {
        throw new MoleculeLoadError(`${url} is not valid JSON`);
    }
    if (!done || !done.files || typeof done.files['meta.json'] !== 'string') {
        throw new MoleculeLoadError(`${url} does not list meta.json: this result is incomplete`);
    }
}

export function loadMoleculeMeta(id: string): Promise<MoleculeMeta> {
    return cached(`meta:${id}`, async () => {
        if (isJobKey(id)) await requireFinishedResult(id);
        return fetchJson<MoleculeMeta>(`${moleculePath(id)}/meta.json`);
    });
}
```

In `src/molecules/esp.ts`, make `loadEspGrid` read the molecule's own folder when no base is given. Import `moleculePath` from `./loader`, drop the `MOLECULES_BASE_URL` import if nothing else in the file uses it, and replace the function with:

```ts
export async function loadEspGrid(meta: LibraryMoleculeMeta, baseUrl?: string): Promise<ScalarGrid> {
    const { shape, origin, spacing } = meta.espGrid;
    // The molecule's own folder: the versioned library, or /molecules/jobs/<key> for a computed one.
    const folder = baseUrl === undefined ? moleculePath(meta.id) : `${baseUrl}/${meta.id}`;
    const values = await fetchFloat32Grid(`${folder}/esp.bin.gz`, shape[0] * shape[1] * shape[2]);
    return { shape, origin, spacing, values };
}
```

If Phase 6's `esp.ts` differs from its plan's text, keep its behaviour and apply only this change: with no `baseUrl`, the folder is `moleculePath(meta.id)`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/jobs/computed_loader.test.ts tests/molecules/loader.test.ts tests/molecules/binary.test.ts tests/molecules/grid_cache.test.ts && npx tsc --noEmit -p .`
Expected: PASS (10 new tests, and Phase 5's and Phase 6's loader tests unchanged); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/job_paths.ts src/molecules/loader.ts src/molecules/esp.ts tests/jobs/computed_loader.test.ts
git commit -m "feat(molecules): a job key resolves to /molecules/jobs/<key>, opened only once done.json lists it (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Ball-and-stick for H–Kr, and the structure preview

**Files:**
- Modify: `src/molecules/ball_and_stick.ts` (the two tables), `tests/molecules/ball_and_stick.test.ts` (its "refuses an element" case)
- Create: `src/jobs/structure_projection.ts`, `src/components/StructurePreview.tsx`, `tests/jobs/structure_preview.test.tsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `detectBonds`, `COVALENT_RADII_ANGSTROM`, `CPK_COLORS`, `ATOM_RADIUS_FACTOR`, `BOHR_TO_ANGSTROM` (Phase 6); `MoleculeAtom` (Phase 6); `CanonicalAtom` (Task 2); `elementFor` (`src/elements.ts`).
- Produces:
  - `COVALENT_RADII_ANGSTROM` and `CPK_COLORS` now hold Z 1–36.
  - `structure_projection.ts`: `type Vec = [number, number, number]`; `canonicalToBohr(atoms: CanonicalAtom[]): MoleculeAtom[]`; `symmetricEigen(matrix: number[][]): { values: number[]; vectors: Vec[] }` (largest first); `interface ProjectedAtom { index; Z; x; y; depth; radius; color }`; `interface ProjectedBond { a; b }`; `interface Projection { atoms: ProjectedAtom[] (farthest first); bonds: ProjectedBond[]; halfExtent: number }`; `projectStructure(atoms: CanonicalAtom[], yaw?: number): Projection` (Å).
  - `<StructurePreview atoms={CanonicalAtom[]} size?={number} />`: an SVG with role `img` and name `preview of the resolved structure, <n> atoms`, plus a button named `turn the preview`.

- [ ] **Step 1: Write the failing tests**

In `tests/molecules/ball_and_stick.test.ts`, Phase 6's "refuses an element it has no radius for" case uses iron, which this task makes known. Change that one assertion to the first element past krypton:

```ts
        expect(() => detectBonds([{ Z: 37, position: [0, 0, 0] }])).toThrow('no covalent radius for Rb');
```

```tsx
// tests/jobs/structure_preview.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { canonicalToBohr, projectStructure, symmetricEigen, Vec } from '../../src/jobs/structure_projection';
import StructurePreview from '../../src/components/StructurePreview';
import { BOHR_TO_ANGSTROM, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../../src/molecules/ball_and_stick';
import type { CanonicalAtom } from '../../src/jobs/api_types';

const WATER: CanonicalAtom[] = [[1, 0, -0.75545, -0.47116], [1, 0, 0.75545, -0.47116], [8, 0, 0, 0.11779]];

/** Benzene in the xy plane, then tilted by two arbitrary rotations: PubChem never hands it over face-on. */
function tiltedBenzene(): CanonicalAtom[] {
    const atoms: CanonicalAtom[] = [];
    for (let i = 0; i < 6; i++) {
        const t = (i * Math.PI) / 3;
        atoms.push([6, 1.397 * Math.cos(t), 1.397 * Math.sin(t), 0], [1, 2.481 * Math.cos(t), 2.481 * Math.sin(t), 0]);
    }
    const [a, b] = [0.7, 0.45];
    return atoms.map(([Z, x, y, z]) => {
        const [y1, z1] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
        const [x2, z2] = [x * Math.cos(b) + z1 * Math.sin(b), -x * Math.sin(b) + z1 * Math.cos(b)];
        return [Z, x2 + 0.3, y1 - 1.2, z2 + 2.0];
    });
}

const det = (u: Vec, v: Vec, w: Vec) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);

describe('H–Kr in the structure overlay', () => {
    it('knows every element a computed molecule may hold, and nothing past krypton', () => {
        for (let Z = 1; Z <= 36; Z++) {
            expect(COVALENT_RADII_ANGSTROM[Z]).toBeGreaterThan(0);
            expect(CPK_COLORS[Z]).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(COVALENT_RADII_ANGSTROM[37]).toBeUndefined();
    });
    it('bonds hydrogen chloride and ferrocene-like Fe–C distances', () => {
        const hcl = [{ Z: 1, position: [0, 0, 0] as Vec }, { Z: 17, position: [0, 0, 1.275 / BOHR_TO_ANGSTROM] as Vec }];
        expect(detectBonds(hcl)).toHaveLength(1);
        const feC = [{ Z: 26, position: [0, 0, 0] as Vec }, { Z: 6, position: [0, 0, 2.05 / BOHR_TO_ANGSTROM] as Vec }];
        expect(detectBonds(feC)).toHaveLength(1);
    });
});

describe('symmetricEigen', () => {
    it('recovers the axes of a rotated diagonal matrix, largest first', () => {
        const c = Math.cos(Math.PI / 6);
        const s = Math.sin(Math.PI / 6);
        const R = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
        const D = [5, 2, 1];
        const M = [0, 1, 2].map(i => [0, 1, 2].map(j => [0, 1, 2].reduce((sum, k) => sum + R[i][k] * D[k] * R[j][k], 0)));
        const { values, vectors } = symmetricEigen(M);
        values.forEach((value, i) => expect(value).toBeCloseTo(D[i], 10));
        expect(Math.abs(vectors[0][0] * c + vectors[0][1] * s)).toBeCloseTo(1, 10);
        expect(Math.abs(vectors[2][2])).toBeCloseTo(1, 10);
    });
});

describe('projectStructure', () => {
    it('shows a planar molecule face-on whatever orientation it came in', () => {
        const projection = projectStructure(tiltedBenzene());
        projection.atoms.forEach(atom => expect(Math.abs(atom.depth)).toBeLessThan(1e-9));
        expect(projection.bonds).toHaveLength(12);
    });
    it('is a rotation, never a mirror: a chiral centre keeps its handedness', () => {
        // Bromochlorofluoromethane: C at the origin, four substituents on a tetrahedron.
        const atoms: CanonicalAtom[] = [[6, 0, 0, 0], [1, 0.63, 0.63, 0.63], [9, -0.8, -0.8, 0.8], [17, -1.0, 1.0, -1.0], [35, 1.1, -1.1, -1.1]];
        const original = (Z: number): Vec => { const a = atoms.find(x => x[0] === Z)!; return [a[1], a[2], a[3]]; };
        const projection = projectStructure(atoms, 0.4);
        const p = (Z: number): Vec => { const a = projection.atoms.find(x => x.Z === Z)!; return [a.x, a.y, a.depth]; };
        const sub = (u: Vec, v: Vec): Vec => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
        const before = det(sub(original(9), original(6)), sub(original(17), original(6)), sub(original(35), original(6)));
        const after = det(sub(p(9), p(6)), sub(p(17), p(6)), sub(p(35), p(6)));
        expect(Math.sign(after)).toBe(Math.sign(before));
        expect(after).toBeCloseTo(before, 9);
    });
    it('turns about the vertical: y stays, x and depth rotate', () => {
        const flat = projectStructure(WATER, 0);
        const turned = projectStructure(WATER, Math.PI / 2);
        const byIndex = (projection: ReturnType<typeof projectStructure>, i: number) => projection.atoms.find(a => a.index === i)!;
        for (const i of [0, 1, 2]) {
            expect(byIndex(turned, i).y).toBeCloseTo(byIndex(flat, i).y, 9);
            expect(Math.abs(byIndex(turned, i).depth)).toBeCloseTo(Math.abs(byIndex(flat, i).x), 9);
        }
    });
    it('lists atoms farthest first, so nearer ones are drawn over them', () => {
        const depths = projectStructure(tiltedBenzene(), 1.0).atoms.map(a => a.depth);
        expect(depths).toEqual([...depths].sort((p, q) => p - q));
    });
    it('converts Å to bohr for the bonding rule', () => {
        expect(canonicalToBohr([[8, 0.529177210903, 0, 0]])[0].position[0]).toBeCloseTo(1, 12);
    });
});

describe('<StructurePreview>', () => {
    it('draws a circle per atom and two half-sticks per bond', () => {
        const { container } = render(<StructurePreview atoms={WATER} />);
        expect(screen.getByRole('img', { name: 'preview of the resolved structure, 3 atoms' })).toBeInTheDocument();
        expect(container.querySelectorAll('circle')).toHaveLength(3);
        expect(container.querySelectorAll('.structure-preview-bond line')).toHaveLength(4);
    });
    it('turns when asked', () => {
        const { container } = render(<StructurePreview atoms={WATER} />);
        const xs = () => Array.from(container.querySelectorAll('circle')).map(c => Number(c.getAttribute('cx')).toFixed(6));
        const before = xs();
        fireEvent.click(screen.getByRole('button', { name: 'turn the preview' }));
        expect(xs()).not.toEqual(before);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/structure_preview.test.tsx tests/molecules/ball_and_stick.test.ts`
Expected: FAIL, "Cannot find module '../../src/jobs/structure_projection'". Phase 6's edited Rb assertion already passes: rubidium stays unknown.

- [ ] **Step 3: Extend Phase 6's tables to H–Kr**

In `src/molecules/ball_and_stick.ts`, replace the two table constants and their doc comments. The nine library elements keep their existing values.

```ts
/**
 * Cordero et al., Dalton Trans. 2008, 2832, Table 2 (C sp³; Mn, Fe and Co
 * low-spin): every element a computed molecule may hold (H–Kr, spec §5.1),
 * and no guessing beyond them.
 */
export const COVALENT_RADII_ANGSTROM: Record<number, number> = {
    1: 0.31, 2: 0.28, 3: 1.28, 4: 0.96, 5: 0.84, 6: 0.76, 7: 0.71, 8: 0.66, 9: 0.57, 10: 0.58,
    11: 1.66, 12: 1.41, 13: 1.21, 14: 1.11, 15: 1.07, 16: 1.05, 17: 1.02, 18: 1.06,
    19: 2.03, 20: 1.76, 21: 1.70, 22: 1.60, 23: 1.53, 24: 1.39, 25: 1.39, 26: 1.32, 27: 1.26, 28: 1.24,
    29: 1.32, 30: 1.22, 31: 1.22, 32: 1.20, 33: 1.19, 34: 1.20, 35: 1.20, 36: 1.16,
};
/** Jmol's CPK palette, H–Kr. */
export const CPK_COLORS: Record<number, string> = {
    1: '#ffffff', 2: '#d9ffff', 3: '#cc80ff', 4: '#c2ff00', 5: '#ffb5b5', 6: '#909090', 7: '#3050f8', 8: '#ff0d0d',
    9: '#90e050', 10: '#b3e3f5', 11: '#ab5cf2', 12: '#8aff00', 13: '#bfa6a6', 14: '#f0c8a0', 15: '#ff8000', 16: '#ffff30',
    17: '#1ff01f', 18: '#80d1e3', 19: '#8f40d4', 20: '#3dff00', 21: '#e6e6e6', 22: '#bfc2c7', 23: '#a6a6ab', 24: '#8a99c7',
    25: '#9c7ac7', 26: '#e06633', 27: '#f090a0', 28: '#50d050', 29: '#c88033', 30: '#7d80b0', 31: '#c28f8f', 32: '#668f8f',
    33: '#bd80e3', 34: '#ffa100', 35: '#a62929', 36: '#5cb8d1',
};
```

Before committing, check each new radius against Cordero et al. Table 2 and each colour against Jmol's element colour table. A mistyped value would draw a wrong stick, not raise an error.

- [ ] **Step 4: Implement the projection and the preview**

```ts
// src/jobs/structure_projection.ts
import { ATOM_RADIUS_FACTOR, BOHR_TO_ANGSTROM, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../molecules/ball_and_stick';
import type { MoleculeAtom } from '../molecules/library_types';
import type { CanonicalAtom } from './api_types';

export type Vec = [number, number, number];
export interface ProjectedAtom { index: number; Z: number; x: number; y: number; depth: number; radius: number; color: string }
export interface ProjectedBond { a: number; b: number }
/** Å throughout. `atoms` are in painter's order (farthest first); `halfExtent` does not change as the drawing turns. */
export interface Projection { atoms: ProjectedAtom[]; bonds: ProjectedBond[]; halfExtent: number }

const dot = (u: Vec, v: Vec) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u: Vec, v: Vec): Vec => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/** The API's atoms are [Z, x, y, z] in Å; Phase 6's bonding rule takes bohr. */
export function canonicalToBohr(atoms: CanonicalAtom[]): MoleculeAtom[] {
    return atoms.map(([Z, x, y, z]) => ({ Z, position: [x / BOHR_TO_ANGSTROM, y / BOHR_TO_ANGSTROM, z / BOHR_TO_ANGSTROM] }));
}

/** Eigenpairs of a symmetric 3×3 matrix by cyclic Jacobi rotations, largest eigenvalue first. */
export function symmetricEigen(matrix: number[][]): { values: number[]; vectors: Vec[] } {
    const a = matrix.map(row => [...row]);
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
        const diagonal = a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2;
        if (off <= 1e-24 * Math.max(diagonal, 1e-300)) break;
        for (let p = 0; p < 2; p++) {
            for (let q = p + 1; q < 3; q++) {
                if (a[p][q] === 0) continue;
                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;
                for (let k = 0; k < 3; k++) {
                    const [akp, akq] = [a[k][p], a[k][q]];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for (let k = 0; k < 3; k++) {
                    const [apk, aqk] = [a[p][k], a[q][k]];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for (let k = 0; k < 3; k++) {
                    const [vkp, vkq] = [v[k][p], v[k][q]];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
    return { values: order.map(i => a[i][i]), vectors: order.map(i => [v[0][i], v[1][i], v[2][i]] as Vec) };
}

/**
 * Looks down the axis along which the structure is thinnest, so a planar
 * molecule (benzene, caffeine) is seen face-on whatever orientation PubChem
 * or a pasted file gave it; `yaw` then turns it about the vertical. The
 * viewing axis is the cross product of the other two, so the view is always
 * a rotation, never a mirror: a chiral molecule is shown as itself, not as
 * its enantiomer.
 */
export function projectStructure(atoms: CanonicalAtom[], yaw = 0): Projection {
    const n = atoms.length;
    const centre: Vec = [0, 0, 0];
    for (const [, x, y, z] of atoms) {
        centre[0] += x / n;
        centre[1] += y / n;
        centre[2] += z / n;
    }
    const relative: Vec[] = atoms.map(([, x, y, z]) => [x - centre[0], y - centre[1], z - centre[2]]);
    const scatter = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of relative) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) scatter[i][j] += p[i] * p[j];
    const [e1, e2] = symmetricEigen(scatter).vectors;
    const e3 = cross(e1, e2);
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    const projected: ProjectedAtom[] = relative.map((p, index) => {
        const Z = atoms[index][0];
        const [u, w] = [dot(p, e1), dot(p, e3)];
        return {
            index, Z, x: c * u + s * w, y: dot(p, e2), depth: -s * u + c * w,
            radius: ATOM_RADIUS_FACTOR * COVALENT_RADII_ANGSTROM[Z], color: CPK_COLORS[Z],
        };
    });
    const largestRadius = Math.max(...projected.map(a => a.radius));
    const halfExtent = Math.max(1, ...relative.map(p => Math.hypot(...p))) + largestRadius + 0.2;
    const bonds = detectBonds(canonicalToBohr(atoms)).map(bond => ({ a: bond.a, b: bond.b }));
    return { atoms: [...projected].sort((p, q) => p.depth - q.depth), bonds, halfExtent };
}
```

```tsx
// src/components/StructurePreview.tsx
import React, { useMemo, useState } from 'react';
import { IconButton, Typography } from '@mui/material';
import { projectStructure } from '../jobs/structure_projection';
import { elementFor } from '../elements';
import type { CanonicalAtom } from '../jobs/api_types';

interface StructurePreviewProps {
    atoms: CanonicalAtom[];
    size?: number;
}

const TURN = Math.PI / 6;
const RADIANS_PER_PIXEL = 0.012;

/**
 * The structure a preview resolved to, as a small ball-and-stick drawing:
 * Phase 6's bonding rule, radii and CPK colours, projected into SVG. Not the
 * viewer's three.js overlay: a second WebGL context in the side panel or the
 * phone sheet would compete with the main canvas for the few a phone allows,
 * and this only has to answer "is that the molecule I meant?".
 */
const StructurePreview: React.FC<StructurePreviewProps> = ({ atoms, size = 220 }) => {
    const [yaw, setYaw] = useState(0);
    const [dragX, setDragX] = useState<number | null>(null);
    const projection = useMemo(() => projectStructure(atoms, yaw), [atoms, yaw]);
    const byIndex = useMemo(() => new Map(projection.atoms.map(atom => [atom.index, atom])), [projection]);
    const h = projection.halfExtent;
    return (
        <figure className="structure-preview">
            <svg
                width={size} height={size} viewBox={`${-h} ${-h} ${2 * h} ${2 * h}`} role="img"
                aria-label={`preview of the resolved structure, ${atoms.length} atoms`}
                style={{ touchAction: 'none', cursor: dragX === null ? 'grab' : 'grabbing' }}
                onPointerDown={event => setDragX(event.clientX)}
                onPointerMove={event => {
                    if (dragX === null) return;
                    setYaw(value => value + (event.clientX - dragX) * RADIANS_PER_PIXEL);
                    setDragX(event.clientX);
                }}
                onPointerUp={() => setDragX(null)}
                onPointerLeave={() => setDragX(null)}
                onPointerCancel={() => setDragX(null)}
            >
                {/* y up, as in the viewer */}
                <g transform="scale(1,-1)">
                    {projection.bonds.map(bond => {
                        const [p, q] = [byIndex.get(bond.a)!, byIndex.get(bond.b)!];
                        const [mx, my] = [(p.x + q.x) / 2, (p.y + q.y) / 2];
                        return (
                            <g key={`${bond.a}-${bond.b}`} className="structure-preview-bond">
                                <line x1={p.x} y1={p.y} x2={mx} y2={my} stroke={p.color} />
                                <line x1={mx} y1={my} x2={q.x} y2={q.y} stroke={q.color} />
                            </g>
                        );
                    })}
                    {projection.atoms.map(atom => (
                        <circle key={atom.index} className="structure-preview-atom" cx={atom.x} cy={atom.y} r={atom.radius} fill={atom.color}>
                            <title>{`${elementFor(atom.Z)?.symbol ?? atom.Z}, atom ${atom.index + 1}`}</title>
                        </circle>
                    ))}
                </g>
            </svg>
            <figcaption className="structure-preview-caption">
                <Typography variant="caption" className="molecule-caption">
                    The structure as resolved, {atoms.length} atoms; drag to turn it. Sticks show connectivity, not bond order.
                </Typography>
                <IconButton size="small" aria-label="turn the preview" onClick={() => setYaw(value => value + TURN)}>↻</IconButton>
            </figcaption>
        </figure>
    );
};

export default StructurePreview;
```

Append to `src/style.css`:

```css
/* Phase 6B-2: the request panel's structure preview (Å units in its viewBox). */
.structure-preview { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.structure-preview svg { background: #111; border-radius: 8px; }
.structure-preview-bond line { stroke-width: 0.14; stroke-linecap: round; }
.structure-preview-atom { stroke: rgba(0, 0, 0, 0.6); stroke-width: 0.02; }
.structure-preview-caption { display: flex; align-items: center; gap: 4px; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/jobs/structure_preview.test.tsx tests/molecules/ball_and_stick.test.ts && npx tsc --noEmit -p .`
Expected: PASS (10 new tests, and Phase 6's ball-and-stick suite); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/molecules/ball_and_stick.ts tests/molecules/ball_and_stick.test.ts src/jobs/structure_projection.ts src/components/StructurePreview.tsx tests/jobs/structure_preview.test.tsx src/style.css
git commit -m "feat(jobs): ball-and-stick radii and colours for H-Kr, and an SVG preview of a resolved structure (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Jobs state, the `job` URL key, and the Computed category

**Files:**
- Create: `src/store/jobsSlice.ts`, `src/jobs/computed.ts`, `src/jobs/url_keys.ts`, `tests/jobs/jobs_slice.test.ts`, `tests/jobs/job_url.test.ts`, `tests/jobs/picker_computed.test.tsx`
- Modify: `src/store/index.ts`, `src/molecules/url_keys.ts` (Phase 6), `src/components/MoleculePicker.tsx` (Phase 6), `src/main.tsx`

**Interfaces:**
- Consumes: `BUILD_ENV` (Task 2); `JobView` (Task 2); `isJobKey` (Task 3); `MoleculeIndexEntry` (Phase 5); `registerUrlKeys`, `applyStateTo`, `encodeStateOf`, `resetUrlKeysForTests` (Phase 2); `selectMolecule`, `registerMoleculeUrlKeys`, `MoleculePicker`, `LIBRARY_CATEGORIES` (Phase 6).
- Produces:
  - `jobsSlice.ts`: `JobsTarget = 'local' | 'aws'`; `TARGET_STORAGE_KEY = 'eov.jobs.target'`; `interface OwnerSession { configured: boolean; signedIn: boolean; email: string | null; expired: boolean; error: string | null }`; `interface ComputedList { month: string | null; jobs: JobView[] | null; error: string | null; nonce: number }`; `interface JobsState { target; session; records: Record<string, JobView>; recordErrors: Record<string, string>; followedKey: string | null; computed: ComputedList }`; `initialJobsState(): JobsState`. Actions: `setTarget(JobsTarget)`, `sessionChanged({ signedIn, email })`, `sessionExpired()`, `sessionFailed(message)`, `jobUpdated(JobView)`, `jobFetchFailed({ key, message })`, `followJob(key | null)`, `computedLoaded({ month, jobs })`, `computedFailed(message)`, `refreshComputed()`. Selector: `selectIsOwner(state: { jobs: JobsState }): boolean`. The default export is the reducer, mounted at `state.jobs`.
  - `computed.ts`: `COMPUTED_CATEGORY = { key: 'computed', label: 'Computed' }`; `computedEntries(jobs: JobView[]): MoleculeIndexEntry[]`; `withComputed(index: MoleculeIndexEntry[] | null, jobs: JobView[] | null): MoleculeIndexEntry[] | null`.
  - `jobs/url_keys.ts`: `encodeJobUrl(selectedId: string | null): Record<string, string>`; `decodeJobUrl(params: URLSearchParams): string | null`; `registerComputedUrlKeys(): void`.
  - Phase 6's `src/molecules/url_keys.ts` now exports `parseSurface(value: string | undefined): MoleculeSurface | undefined`, and `encodeMoleculeUrl` writes no `id` for a job key.
  - `MoleculePicker` shows a "Computed" chip exactly when its entries include `category: 'computed'`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/jobs/jobs_slice.test.ts
import reducer, {
    setTarget, sessionChanged, sessionExpired, sessionFailed, jobUpdated, jobFetchFailed, followJob, computedLoaded,
    refreshComputed, selectIsOwner, initialJobsState, JobsState,
} from '../../src/store/jobsSlice';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from './build_env_stub';
import { computedEntries, withComputed } from '../../src/jobs/computed';
import { jobFixture, listFixture } from './api_fixtures';
import type { MoleculeIndexEntry } from '../../src/molecules/types';

const owner = (jobs: JobsState) => selectIsOwner({ jobs });
afterEach(() => { resetBuildEnv(); window.localStorage.clear(); });

describe('who is the owner', () => {
    it('on the dev server, running jobs on this Mac makes one the owner without signing in', () => {
        BUILD_ENV.dev = true;
        const s = initialJobsState();
        expect(s.target).toBe('local');
        expect(owner(s)).toBe(true);
        expect(owner(reducer(s, setTarget('aws')))).toBe(false);
        expect(owner(reducer(reducer(s, setTarget('aws')), sessionChanged({ signedIn: true, email: 'owner@example.com' })))).toBe(true);
    });
    it('in production only a signed-in session is the owner, and the target cannot move', () => {
        const s = initialJobsState();
        expect(s.target).toBe('aws');
        expect(owner(s)).toBe(false);
        expect(reducer(s, setTarget('local')).target).toBe('aws');
        const signedIn = reducer(s, sessionChanged({ signedIn: true, email: 'owner@example.com' }));
        expect(owner(signedIn)).toBe(true);
        const expired = reducer(signedIn, sessionExpired());
        expect(owner(expired)).toBe(false);
        expect(expired.session).toEqual(expect.objectContaining({ expired: true, signedIn: false, email: null }));
        expect(reducer(expired, sessionChanged({ signedIn: true, email: 'o' })).session.expired).toBe(false);
    });
    it('remembers the dev target the owner chose', () => {
        BUILD_ENV.dev = true;
        window.localStorage.setItem('eov.jobs.target', 'aws');
        expect(initialJobsState().target).toBe('aws');
    });
    it('says sign-in is not configured until all three Cognito settings exist', () => {
        expect(initialJobsState().session.configured).toBe(false);
        BUILD_ENV.cognito = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };
        expect(initialJobsState().session.configured).toBe(true);
        expect(reducer(initialJobsState(), sessionFailed('Sign-in did not complete: x')).session.error).toBe('Sign-in did not complete: x');
    });
});

describe('jobs state', () => {
    it('keeps the latest view of each job, and its last fetch error until the next view', () => {
        const running = jobFixture('get_running');
        let s = reducer(initialJobsState(), jobFetchFailed({ key: running.key, message: 'offline' }));
        expect(s.recordErrors[running.key]).toBe('offline');
        s = reducer(s, jobUpdated(running));
        expect(s.records[running.key].status).toBe('RUNNING');
        expect(s.recordErrors[running.key]).toBeUndefined();
        expect(reducer(s, followJob(running.key)).followedKey).toBe(running.key);
    });
    it("switching where jobs run forgets the other backend's jobs and asks for the list again", () => {
        BUILD_ENV.dev = true;
        let s = reducer(initialJobsState(), jobUpdated(jobFixture('get_running')));
        s = reducer(s, followJob(jobFixture('get_running').key));
        const nonce = s.computed.nonce;
        s = reducer(s, setTarget('aws'));
        expect([s.records, s.followedKey, s.computed.jobs]).toEqual([{}, null, null]);
        expect(s.computed.nonce).toBe(nonce + 1);
        expect(reducer(s, refreshComputed()).computed.nonce).toBe(nonce + 2);
    });
    it('keeps the listed jobs as records too, so opening one needs no second read', () => {
        const list = listFixture('list_done');
        const s = reducer(initialJobsState(), computedLoaded({ month: list.month, jobs: list.jobs }));
        expect(s.computed.jobs).toHaveLength(1);
        expect(s.records[list.jobs[0].key].status).toBe('DONE');
    });
});

describe('computed entries', () => {
    it("turns the month's finished jobs into picker entries, naming an optimised geometry", () => {
        const done = jobFixture('get_done');
        expect(computedEntries(listFixture('list_all').jobs)).toEqual([
            { id: done.key, name: 'Water', formula: 'H2O', category: 'computed', tags: ['computed', 'single'], tier: 'computed' },
        ]);
        expect(computedEntries([{ ...done, recipe: 'optimise' }])[0].name).toBe('Water (optimised)');
    });
    it('adds them after the library, and leaves the library untouched when there are none', () => {
        const index: MoleculeIndexEntry[] = [{ id: 'h2o', name: 'Water', formula: 'H2O', category: 'first-examples', tags: [] }];
        expect(withComputed(null, [jobFixture('get_done')])).toBeNull();
        expect(withComputed(index, null)).toBe(index);
        expect(withComputed(index, [])).toBe(index);
        expect(withComputed(index, [jobFixture('get_done')])!.map(e => e.id)).toEqual(['h2o', jobFixture('get_done').key]);
    });
});
```

```ts
// tests/jobs/job_url.test.ts
import { resetUrlKeysForTests, applyStateTo, encodeStateOf } from '../../src/url_state';
import { registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { registerComputedUrlKeys, encodeJobUrl, decodeJobUrl } from '../../src/jobs/url_keys';
import { createAppStore } from '../../src/store';

const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';

beforeEach(() => {
    resetUrlKeysForTests();
    registerMoleculeUrlKeys();
    registerComputedUrlKeys();
});
afterAll(() => resetUrlKeysForTests());

describe('the job URL key', () => {
    it("links a computed molecule by its job, not as an id, and keeps the surface", () => {
        const store = createAppStore();
        applyStateTo(`#mode=molecule&job=${KEY}&show=esp`, store.dispatch);
        expect(store.getState().molecule.selectedId).toBe(KEY);
        expect(store.getState().molecule.surface).toEqual({ kind: 'esp' });
        const params = new URLSearchParams(encodeStateOf(store.getState()));
        expect(params.get('mode')).toBe('molecule');
        expect(params.get('job')).toBe(KEY);
        expect(params.get('id')).toBeNull();
    });
    it('ignores anything that is not a job key', () => {
        expect(decodeJobUrl(new URLSearchParams('job=../etc'))).toBeNull();
        expect(decodeJobUrl(new URLSearchParams(`job=${KEY.toUpperCase()}`))).toBeNull();
        expect(decodeJobUrl(new URLSearchParams(`job=${KEY}`))).toBe(KEY);
        expect(encodeJobUrl('h2o')).toEqual({});
        expect(encodeJobUrl(null)).toEqual({});
    });
    it('leaves library links as they were', () => {
        const store = createAppStore();
        applyStateTo('#mode=molecule&id=h2o', store.dispatch);
        const params = new URLSearchParams(encodeStateOf(store.getState()));
        expect([params.get('id'), params.get('job')]).toEqual(['h2o', null]);
    });
});
```

```tsx
// tests/jobs/picker_computed.test.tsx
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MoleculePicker from '../../src/components/MoleculePicker';
import { computedEntries } from '../../src/jobs/computed';
import { LIBRARY_INDEX } from '../molecules/fixtures';
import { jobFixture } from './api_fixtures';

describe('the Computed category', () => {
    it('appears only when there are computed molecules to list', () => {
        const { unmount } = render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={() => {}} />);
        expect(screen.queryByRole('button', { name: 'Computed' })).toBeNull();
        unmount();
        const onSelect = jest.fn();
        render(<MoleculePicker entries={[...LIBRARY_INDEX, ...computedEntries([jobFixture('get_done')])]} error={null} selectedId={null} onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button', { name: 'Computed' }));
        const list = screen.getByRole('list', { name: 'molecules' });
        expect(within(list).getAllByRole('button')).toHaveLength(1);
        fireEvent.click(within(list).getByRole('button', { name: /Water/ }));
        expect(onSelect).toHaveBeenCalledWith(jobFixture('get_done').key);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/jobs_slice.test.ts tests/jobs/job_url.test.ts tests/jobs/picker_computed.test.tsx`
Expected: FAIL, "Cannot find module '../../src/store/jobsSlice'".

- [ ] **Step 3: Implement the slice and the computed entries**

```ts
// src/store/jobsSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { JobView } from '../jobs/api_types';
import { BUILD_ENV } from '../jobs/build_env';

export type JobsTarget = 'local' | 'aws';
export const TARGET_STORAGE_KEY = 'eov.jobs.target';

export interface OwnerSession {
    /** All three VITE_COGNITO_* settings exist in this build. */
    configured: boolean;
    signedIn: boolean;
    email: string | null;
    /** The session ended under the owner (a refresh was refused): said on screen, never a silent failure. */
    expired: boolean;
    /** A sign-in that came back with an error (cancelled, MFA failed). */
    error: string | null;
}

export interface ComputedList { month: string | null; jobs: JobView[] | null; error: string | null; nonce: number }

/**
 * The jobs interface's state: who is signed in, where jobs run, the latest
 * view of every job the page has seen, the one being followed, and the
 * owner's computed list. Shared by the viewer and /admin.html, which mount
 * it at the same key.
 */
export interface JobsState {
    target: JobsTarget;
    session: OwnerSession;
    records: Record<string, JobView>;
    recordErrors: Record<string, string>;
    followedKey: string | null;
    computed: ComputedList;
}

/** Production has one API, the deployed one; only the dev server offers This Mac, remembered across its two pages. */
function savedTarget(): JobsTarget {
    if (!BUILD_ENV.dev) return 'aws';
    try {
        return window.localStorage.getItem(TARGET_STORAGE_KEY) === 'aws' ? 'aws' : 'local';
    } catch {
        return 'local';
    }
}

export function initialJobsState(): JobsState {
    return {
        target: savedTarget(),
        session: { configured: BUILD_ENV.cognito !== null, signedIn: false, email: null, expired: false, error: null },
        records: {},
        recordErrors: {},
        followedKey: null,
        computed: { month: null, jobs: null, error: null, nonce: 0 },
    };
}

const jobsSlice = createSlice({
    name: 'jobs',
    initialState: initialJobsState,
    reducers: {
        setTarget: (state, action: PayloadAction<JobsTarget>) => {
            if (!BUILD_ENV.dev || state.target === action.payload) return;
            state.target = action.payload;
            // A key names the same molecule on both backends, but a job on this Mac is not a job on AWS.
            state.records = {};
            state.recordErrors = {};
            state.followedKey = null;
            state.computed = { month: null, jobs: null, error: null, nonce: state.computed.nonce + 1 };
        },
        sessionChanged: (state, action: PayloadAction<{ signedIn: boolean; email: string | null }>) => {
            state.session.signedIn = action.payload.signedIn;
            state.session.email = action.payload.email;
            if (action.payload.signedIn) {
                state.session.expired = false;
                state.session.error = null;
            }
            state.computed.nonce += 1;
        },
        sessionExpired: state => {
            state.session.signedIn = false;
            state.session.email = null;
            state.session.expired = true;
        },
        sessionFailed: (state, action: PayloadAction<string>) => {
            state.session.error = action.payload;
        },
        jobUpdated: (state, action: PayloadAction<JobView>) => {
            state.records[action.payload.key] = action.payload;
            delete state.recordErrors[action.payload.key];
        },
        jobFetchFailed: (state, action: PayloadAction<{ key: string; message: string }>) => {
            state.recordErrors[action.payload.key] = action.payload.message;
        },
        followJob: (state, action: PayloadAction<string | null>) => {
            state.followedKey = action.payload;
        },
        computedLoaded: (state, action: PayloadAction<{ month: string; jobs: JobView[] }>) => {
            state.computed.month = action.payload.month;
            state.computed.jobs = action.payload.jobs;
            state.computed.error = null;
            for (const job of action.payload.jobs) state.records[job.key] = job;
        },
        computedFailed: (state, action: PayloadAction<string>) => {
            state.computed.error = action.payload;
        },
        refreshComputed: state => {
            state.computed.nonce += 1;
        },
    },
});

/** Spec §9's owner rule, verbatim: a signed-in session, or the dev server running jobs on this Mac (no auth there, $0). */
export const selectIsOwner = (state: { jobs: JobsState }): boolean =>
    state.jobs.session.signedIn || (BUILD_ENV.dev && state.jobs.target === 'local');

export const {
    setTarget, sessionChanged, sessionExpired, sessionFailed, jobUpdated, jobFetchFailed, followJob, computedLoaded,
    computedFailed, refreshComputed,
} = jobsSlice.actions;
export default jobsSlice.reducer;
```

```ts
// src/jobs/computed.ts
import type { MoleculeIndexEntry } from '../molecules/types';
import type { JobView } from './api_types';

export const COMPUTED_CATEGORY = { key: 'computed', label: 'Computed' } as const;

/**
 * The month's finished jobs as picker entries (spec §9.1: the owner's
 * "Computed" category). The same name can be computed both ways, so an
 * optimised geometry says so.
 */
export function computedEntries(jobs: JobView[]): MoleculeIndexEntry[] {
    return jobs.filter(job => job.status === 'DONE').map(job => ({
        id: job.key,
        name: job.recipe === 'optimise' ? `${job.name} (optimised)` : job.name,
        formula: job.formula,
        category: COMPUTED_CATEGORY.key,
        tags: ['computed', job.recipe],
        tier: 'computed' as const,
    }));
}

/** The library, then the owner's computed molecules; the same array when there are none, so nothing re-renders for nothing. */
export function withComputed(index: MoleculeIndexEntry[] | null, jobs: JobView[] | null): MoleculeIndexEntry[] | null {
    if (index === null || jobs === null) return index;
    const entries = computedEntries(jobs);
    return entries.length ? [...index, ...entries] : index;
}
```

In `src/store/index.ts`, add `import jobsReducer from './jobsSlice';` and add `jobs: jobsReducer,` to `reducer` after Phase 6's `molecule` entry.

- [ ] **Step 4: The URL key**

In Phase 6's `src/molecules/url_keys.ts`:
1. Change `function parseSurface(` to `export function parseSurface(`.
2. Add `import { isJobKey } from './job_paths';`.
3. In `encodeMoleculeUrl`, replace `const out: Record<string, string> = { id: state.selectedId, show: surfaceKey(state.surface) };` with:

```ts
    // A computed molecule is linked by its job key under `job` (src/jobs/url_keys.ts), never as an id.
    const out: Record<string, string> = isJobKey(state.selectedId) ? {} : { id: state.selectedId };
    out.show = surfaceKey(state.surface);
```

```ts
// src/jobs/url_keys.ts
import { registerUrlKeys } from '../url_state';
import type { RootState, AppDispatch } from '../store';
import { selectMolecule } from '../store/moleculeSlice';
import { parseSurface } from '../molecules/url_keys';
import { isJobKey } from '../molecules/job_paths';

/**
 * A computed molecule's link: #mode=molecule&job=<key> (spec §9.1). Anyone
 * can open it -- it reads only the public result files -- so this key is
 * registered for everyone, not just the owner.
 */
export function encodeJobUrl(selectedId: string | null): Record<string, string> {
    return isJobKey(selectedId) ? { job: selectedId } : {};
}

export function decodeJobUrl(params: URLSearchParams): string | null {
    const value = params.get('job');
    return isJobKey(value) ? value : null;
}

export function registerComputedUrlKeys(): void {
    registerUrlKeys(
        'molecule',
        (state: RootState) => encodeJobUrl(state.molecule.selectedId),
        (params: URLSearchParams, dispatch: AppDispatch) => {
            // Phase 6's own decoder, registered first, has already switched to Molecules mode.
            const key = decodeJobUrl(params);
            if (key) dispatch(selectMolecule({ id: key, surface: parseSurface(params.get('show') ?? undefined) }));
        },
    );
}
```

In `src/main.tsx`, import `registerComputedUrlKeys` from `./jobs/url_keys`. Call it directly after Phase 6's `registerMoleculeUrlKeys();`, so both groups exist before the first `applyState`.

- [ ] **Step 5: The Computed chip**

In Phase 6's `src/components/MoleculePicker.tsx`, import `COMPUTED_CATEGORY` from `../jobs/computed`. Directly after the existing `useMemo` that computes `matches` (before any early `return`, since hooks must not be conditional), add:

```tsx
    // The owner's computed molecules join as one more category, present only
    // when there are some: nobody else is ever given computed entries.
    const categories = useMemo(
        () => (entries?.some(entry => entry.category === COMPUTED_CATEGORY.key) ? [...LIBRARY_CATEGORIES, COMPUTED_CATEGORY] : LIBRARY_CATEGORIES),
        [entries],
    );
```

Then, in the chips, change `{LIBRARY_CATEGORIES.map(c => (` to `{categories.map(c => (`.

- [ ] **Step 6: Run to verify they pass**

Run: `npx jest tests/jobs/jobs_slice.test.ts tests/jobs/job_url.test.ts tests/jobs/picker_computed.test.tsx tests/molecules/molecule_slice.test.ts tests/molecules/molecule_picker.test.tsx tests/url_state.test.ts && npx tsc --noEmit -p .`
Expected: PASS (13 new tests, and the Phase 2 and Phase 6 suites unchanged); tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/store/jobsSlice.ts src/store/index.ts src/jobs/computed.ts src/jobs/url_keys.ts src/molecules/url_keys.ts src/components/MoleculePicker.tsx src/main.tsx tests/jobs/jobs_slice.test.ts tests/jobs/job_url.test.ts tests/jobs/picker_computed.test.tsx
git commit -m "feat(jobs): jobs state with the owner rule, #mode=molecule&job=<key> links, and the owner's Computed category (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The jobs API client

**Files:**
- Create: `src/jobs/api.ts`, `tests/jobs/api.test.ts`

**Interfaces:**
- Consumes: `BuildEnv` (Task 2); the API types (Task 2); `JobsTarget` (Task 5); the fixture helpers `fixture`, `jsonResponse`, `textResponse` (Task 2).
- Produces:
  - `class JobsApiError extends Error { readonly status: number; readonly code: string }`. The codes the client adds itself are `not-configured`, `unreachable`, `sign-in-required`, `session-expired`, `aws-not-configured` and `bad-response`; every other code is the server's own.
  - The message constants `LOCAL_SERVER_HINT`, `SESSION_ENDED`, `SIGN_IN_REQUIRED`, `AWS_NOT_CONFIGURED` and `API_NOT_CONFIGURED`.
  - `apiBase(target: JobsTarget, env: BuildEnv): string | null`.
  - `interface JobsApiDeps { fetch(input: string, init?: RequestInit): Promise<Response>; token(): Promise<string | null>; refresh(): Promise<boolean>; onSessionExpired(): void }`.
  - `interface JobsApi { preview(body, signal?): Promise<PreviewResponse>; submit(body): Promise<{ status: number; job: JobView }>; get(key, signal?): Promise<JobView>; list(month, status?): Promise<JobListResponse>; costs(month): Promise<CostsResponse> }`.
  - `createJobsApi(target: JobsTarget, env: BuildEnv, deps: JobsApiDeps): JobsApi`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/jobs/api.test.ts
import {
    createJobsApi, apiBase, JobsApiError, LOCAL_SERVER_HINT, SESSION_ENDED, SIGN_IN_REQUIRED, AWS_NOT_CONFIGURED, API_NOT_CONFIGURED,
} from '../../src/jobs/api';
import type { BuildEnv } from '../../src/jobs/build_env';
import { fixture, jsonResponse, textResponse } from './api_fixtures';

const DEV: BuildEnv = { dev: true, jobsApiUrl: null, cognito: null };
const PROD: BuildEnv = { dev: false, jobsApiUrl: 'https://abc.execute-api.us-east-1.amazonaws.com', cognito: null };
const WATER = { recipe: 'single' as const, molecule: { name: 'water' } };
const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';

function deps(responses: Response[], token: string | null = null, refreshes = false) {
    const fetch = jest.fn(async (_input: string, _init?: RequestInit) => {
        const next = responses.shift();
        if (!next) throw new Error('no more responses');
        return next;
    });
    return { fetch, token: jest.fn(async () => token), refresh: jest.fn(async () => refreshes), onSessionExpired: jest.fn() };
}

describe('where the API is', () => {
    it('dev: This Mac at /api, AWS through the proxy at /api/aws; production: the deployed URL', () => {
        expect(apiBase('local', DEV)).toBe('/api');
        expect(apiBase('aws', DEV)).toBe('/api/aws');
        expect(apiBase('aws', PROD)).toBe('https://abc.execute-api.us-east-1.amazonaws.com/api');
        expect(apiBase('aws', { ...PROD, jobsApiUrl: null })).toBeNull();
    });
});

describe('requests', () => {
    it('previews with the JSON body 6B-1 expects, past the HTTP cache', async () => {
        const d = deps([jsonResponse(200, fixture('preview_ok').body)]);
        const preview = await createJobsApi('local', DEV, d).preview(WATER);
        expect(preview.decision.ok).toBe(true);
        expect(d.fetch).toHaveBeenCalledWith('/api/v1/jobs/preview', expect.objectContaining({ method: 'POST', body: JSON.stringify(WATER), cache: 'no-store' }));
        expect(d.fetch.mock.calls[0][1]!.headers).toEqual({ 'Content-Type': 'application/json' });
    });
    it('sends the access token whenever there is one', async () => {
        const d = deps([jsonResponse(200, fixture('get_running').body)], 'token-1');
        await createJobsApi('aws', PROD, d).get(KEY);
        expect(d.fetch).toHaveBeenCalledWith(`https://abc.execute-api.us-east-1.amazonaws.com/api/v1/jobs/${KEY}`,
            expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer token-1' } }));
    });
    it('reports a new job (201) and a known one (200) alike', async () => {
        const d = deps([jsonResponse(201, fixture('submit_created').body), jsonResponse(200, fixture('submit_known').body)]);
        const api = createJobsApi('local', DEV, d);
        expect((await api.submit(WATER)).status).toBe(201);
        const known = await api.submit(WATER);
        expect([known.status, known.job.status]).toEqual([200, 'RUNNING']);
    });
    it("lists a month by status, and reads the month's costs", async () => {
        const d = deps([jsonResponse(200, fixture('list_done').body), jsonResponse(200, fixture('costs').body)]);
        const api = createJobsApi('local', DEV, d);
        expect((await api.list('2026-10', 'DONE')).jobs).toHaveLength(1);
        expect((await api.costs('2026-10')).capUsd).toBe(8.8);
        expect(d.fetch.mock.calls.map(call => call[0])).toEqual(['/api/v1/jobs?month=2026-10&status=DONE', '/api/v1/costs?month=2026-10']);
    });
});

describe('failures say what happened', () => {
    it("passes the server's own refusal through", async () => {
        const d = deps([jsonResponse(422, fixture('error_unknown_compound').body)]);
        const refusal = createJobsApi('local', DEV, d).preview(WATER);
        await expect(refusal).rejects.toBeInstanceOf(JobsApiError);
        await expect(refusal).rejects.toMatchObject({ status: 422, code: 'unknown-compound', message: 'PubChem does not know "unobtainium"' });
    });
    it('tells the owner how to start the local server when nothing answers', async () => {
        const d = deps([]);
        d.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(createJobsApi('local', DEV, d).preview(WATER)).rejects.toMatchObject({ code: 'unreachable', message: LOCAL_SERVER_HINT });
        const proxy = deps([textResponse(500, '')]);              // Vite's proxy, with the local server down
        await expect(createJobsApi('local', DEV, proxy).preview(WATER)).rejects.toMatchObject({ code: 'unreachable', message: LOCAL_SERVER_HINT });
    });
    it('says AWS is not configured when the proxy falls through to the local server', async () => {
        const d = deps([jsonResponse(404, { error: { code: 'not-found', message: 'no route POST /api/aws/v1/jobs/preview' } })]);
        await expect(createJobsApi('aws', DEV, d).preview(WATER)).rejects.toMatchObject({ code: 'aws-not-configured', message: AWS_NOT_CONFIGURED });
    });
    it('says the build has no API rather than calling nowhere', async () => {
        const d = deps([]);
        await expect(createJobsApi('aws', { ...PROD, jobsApiUrl: null }, d).list('2026-10')).rejects.toMatchObject({ code: 'not-configured', message: API_NOT_CONFIGURED });
        expect(d.fetch).not.toHaveBeenCalled();
    });
    it('cures a 401 with one silent refresh when it can', async () => {
        const d = deps([textResponse(401, '{"message":"Unauthorized"}'), jsonResponse(200, fixture('get_running').body)], 'old-token', true);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).resolves.toEqual(expect.objectContaining({ status: 'RUNNING' }));
        expect(d.refresh).toHaveBeenCalledTimes(1);
        expect(d.onSessionExpired).not.toHaveBeenCalled();
    });
    it('a 401 the refresh cannot cure ends the session and says so', async () => {
        const d = deps([textResponse(401, '{"message":"Unauthorized"}')], 'old-token', false);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).rejects.toMatchObject({ status: 401, code: 'session-expired', message: SESSION_ENDED });
        expect(d.onSessionExpired).toHaveBeenCalledTimes(1);
        expect(d.fetch).toHaveBeenCalledTimes(1);
    });
    it('does not refresh twice for one request', async () => {
        const d = deps([textResponse(401, ''), textResponse(401, '')], 'old-token', true);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).rejects.toMatchObject({ code: 'session-expired' });
        expect([d.fetch.mock.calls.length, d.refresh.mock.calls.length, d.onSessionExpired.mock.calls.length]).toEqual([2, 1, 1]);
    });
    it('a 401 with no token asks for sign-in, and does not end a session that never began', async () => {
        const d = deps([textResponse(401, '{"message":"Unauthorized"}')], null);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).rejects.toMatchObject({ code: 'sign-in-required', message: SIGN_IN_REQUIRED });
        expect(d.onSessionExpired).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/api.test.ts`
Expected: FAIL, "Cannot find module '../../src/jobs/api'".

- [ ] **Step 3: Implement**

```ts
// src/jobs/api.ts
import type { BuildEnv } from './build_env';
import type { CostsResponse, JobListResponse, JobRequest, JobStatus, JobView, PreviewResponse } from './api_types';
import type { JobsTarget } from '../store/jobsSlice';

export class JobsApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
        super(message);
        this.name = 'JobsApiError';
    }
}

export const LOCAL_SERVER_HINT =
    'The job server on this Mac is not answering. Start it from tools/: ../tools/molecules/.venv/bin/python -m jobs.local_server';
export const SESSION_ENDED = 'Your owner session has ended. Sign in again to continue.';
export const SIGN_IN_REQUIRED = 'Sign in as the owner to use the jobs API.';
export const AWS_NOT_CONFIGURED =
    'AWS jobs are not configured on this dev server: set JOBS_AWS_API_URL (Phase 6B-3 prints it) and restart Vite.';
export const API_NOT_CONFIGURED = 'The jobs API is not configured in this build (VITE_JOBS_API_URL is unset).';

/** Where /v1/... is served: the dev proxy (This Mac or AWS, 6B-1 Task 10), or the deployed execute-api URL. null: nowhere. */
export function apiBase(target: JobsTarget, env: BuildEnv): string | null {
    if (env.dev) return target === 'local' ? '/api' : '/api/aws';
    return env.jobsApiUrl ? `${env.jobsApiUrl}/api` : null;
}

export interface JobsApiDeps {
    fetch(input: string, init?: RequestInit): Promise<Response>;
    /** The current access token, or null when signed out. */
    token(): Promise<string | null>;
    /** One silent refresh; true when a new access token exists. */
    refresh(): Promise<boolean>;
    onSessionExpired(): void;
}

export interface JobsApi {
    preview(body: JobRequest, signal?: AbortSignal): Promise<PreviewResponse>;
    submit(body: JobRequest): Promise<{ status: number; job: JobView }>;
    get(key: string, signal?: AbortSignal): Promise<JobView>;
    list(month: string, status?: JobStatus): Promise<JobListResponse>;
    costs(month: string): Promise<CostsResponse>;
}

/**
 * The job API (spec §4) over fetch. Every failure becomes a JobsApiError
 * whose message the panels show as it stands, so each one says what
 * happened and, where the owner can act, what to do -- a server that is
 * not running, AWS not configured, a session that has ended -- rather than
 * "Failed to fetch".
 */
export function createJobsApi(target: JobsTarget, env: BuildEnv, deps: JobsApiDeps): JobsApi {
    const base = apiBase(target, env);
    const isLocal = env.dev && target === 'local';

    async function send(method: 'GET' | 'POST', path: string, body: unknown, signal: AbortSignal | undefined, retried: boolean): Promise<{ status: number; data: unknown }> {
        if (base === null) throw new JobsApiError(0, 'not-configured', API_NOT_CONFIGURED);
        const token = await deps.token();
        const headers: Record<string, string> = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        let response: Response;
        try {
            response = await deps.fetch(`${base}${path}`, {
                method, headers, signal, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (error) {
            if (signal?.aborted) throw error;            // the caller cancelled: nothing to report
            throw new JobsApiError(0, 'unreachable', isLocal ? LOCAL_SERVER_HINT
                : `The jobs API could not be reached: ${error instanceof Error ? error.message : String(error)}`);
        }
        const text = await response.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }
        if (response.status === 401) {
            // API Gateway's JWT authoriser: a missing, expired or revoked token.
            // One silent refresh, then say so -- never a loop, never silence.
            if (!token) throw new JobsApiError(401, 'sign-in-required', SIGN_IN_REQUIRED);
            if (!retried && (await deps.refresh())) return send(method, path, body, signal, true);
            deps.onSessionExpired();
            throw new JobsApiError(401, 'session-expired', SESSION_ENDED);
        }
        if (response.ok) return { status: response.status, data };
        const error = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
        if (error && typeof error.code === 'string' && typeof error.message === 'string') {
            // With JOBS_AWS_API_URL unset, 6B-1's proxy sends /api/aws on to the local server, which has no such route.
            if (env.dev && target === 'aws' && response.status === 404 && error.message.startsWith('no route')) {
                throw new JobsApiError(404, 'aws-not-configured', AWS_NOT_CONFIGURED);
            }
            throw new JobsApiError(response.status, error.code, error.message);
        }
        if (isLocal && response.status >= 500) throw new JobsApiError(response.status, 'unreachable', LOCAL_SERVER_HINT);
        if (env.dev && target === 'aws' && response.status >= 500) {
            throw new JobsApiError(response.status, 'aws-not-configured', `The dev proxy answered HTTP ${response.status}. ${AWS_NOT_CONFIGURED}`);
        }
        throw new JobsApiError(response.status, 'bad-response', `The jobs API answered HTTP ${response.status} without a readable error.`);
    }

    const month = (value: string) => `month=${encodeURIComponent(value)}`;
    return {
        preview: async (body, signal) => (await send('POST', '/v1/jobs/preview', body, signal, false)).data as PreviewResponse,
        submit: async body => {
            const { status, data } = await send('POST', '/v1/jobs', body, undefined, false);
            return { status, job: data as JobView };
        },
        get: async (key, signal) => (await send('GET', `/v1/jobs/${encodeURIComponent(key)}`, undefined, signal, false)).data as JobView,
        list: async (value, status) =>
            (await send('GET', `/v1/jobs?${month(value)}${status ? `&status=${status}` : ''}`, undefined, undefined, false)).data as JobListResponse,
        costs: async value => (await send('GET', `/v1/costs?${month(value)}`, undefined, undefined, false)).data as CostsResponse,
    };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/jobs/api.test.ts && npx tsc --noEmit -p .`
Expected: PASS (13 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/api.ts tests/jobs/api.test.ts
git commit -m "feat(jobs): API client for This Mac, AWS and production, with one silent refresh on 401 and plain-spoken failures (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Owner sign-in

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`), `src/main.tsx`
- Create: `src/jobs/auth.ts`, `src/jobs/owner_session.ts`, `src/jobs/client.ts`, `tests/jobs/auth.test.ts`, `tests/jobs/client.test.ts`

**Interfaces:**
- Consumes: `CognitoSettings`, `BUILD_ENV` (Task 2); `createJobsApi`, `JobsApi`, `JobsApiError` (Task 6); `sessionChanged`, `sessionExpired`, `sessionFailed`, `setTarget`, `JobsState`, `JobsTarget`, `TARGET_STORAGE_KEY` (Task 5).
- Produces:
  - `auth.ts`: `SESSION_KEY = 'eov.owner.session'`; `OwnerPage = '/' | '/admin.html'`; `OwnerIdentity { email: string | null }`; `SessionEvent { identity: OwnerIdentity | null; reason: 'signed-in' | 'signed-out' | 'expired' }`; `interface UserManagerLike`; `interface OwnerAuthDeps { userManager; session: Storage; location: { href; origin; assign(url) }; replaceUrl(url) }`; `makeUserManager(settings, origin, page): UserManagerLike`; `safeReturnTo(state: unknown, fallback: string): string`; `logoutUrl(settings, origin, page): string`; `class OwnerAuth` with `onChange(listener): () => void`, `start(): Promise<string | null>`, `signIn(returnTo: string): Promise<void>`, `signOut(): Promise<void>`, `accessToken(): Promise<string | null>`, `refresh(): Promise<boolean>`.
  - `owner_session.ts`: `ownerAuth(): OwnerAuth | null`; `setOwnerAuthForTests(auth)`; `startOwnerSession(dispatch, page): Promise<string | null>`.
  - `client.ts`: `interface JobsStoreLike { getState(): { jobs: JobsState }; dispatch(action: UnknownAction): unknown }`; `bindJobsClient(store | null)`; `jobsApi(): JobsApi`; `chooseTarget(target)`. Task 8 adds `jobsPoller()`.

- [ ] **Step 1: Install the one new dependency and check its licence**

Run: `npm install --save-exact oidc-client-ts@3.5.0 && node -e "const l=p=>require('./node_modules/'+p+'/package.json').license; console.log(l('oidc-client-ts'), l('jwt-decode'))" && grep '"oidc-client-ts"' package.json`
Expected: `Apache-2.0 MIT`, then `"oidc-client-ts": "3.5.0",` (no caret). If either licence differs, stop and report: it is the owner's decision.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/jobs/auth.test.ts
import { User } from 'oidc-client-ts';
import { OwnerAuth, SESSION_KEY, safeReturnTo, logoutUrl, UserManagerLike, SessionEvent } from '../../src/jobs/auth';

const SETTINGS = {
    authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc',
    clientId: 'client123',
    domain: 'https://eov.auth.us-east-1.amazoncognito.com',
};
const PROFILE = { sub: 'owner-sub', iss: 'issuer', aud: 'client123', exp: 0, iat: 0, email: 'owner@example.com' };
const user = (over: Partial<ConstructorParameters<typeof User>[0]> = {}) => new User({
    access_token: 'access-1', id_token: 'id-1', refresh_token: 'refresh-1', token_type: 'Bearer', scope: 'openid email',
    profile: PROFILE as never, expires_at: Math.floor(Date.now() / 1000) + 3600, userState: { returnTo: '/#mode=molecule&id=h2o' },
    ...over,
});

function setup(href: string, overrides: Partial<UserManagerLike> = {}) {
    let stored: User | null = null;
    const userManager: UserManagerLike = {
        getUser: jest.fn(async () => stored),
        storeUser: jest.fn(async (next: User | null) => { stored = next; }),
        removeUser: jest.fn(async () => { stored = null; }),
        signinRedirect: jest.fn(async () => undefined),
        signinRedirectCallback: jest.fn(async () => { stored = user(); return stored; }),
        signinSilent: jest.fn(async () => { stored = user({ access_token: 'access-2' }); return stored; }),
        events: { addUserLoaded: jest.fn(), addSilentRenewError: jest.fn() },
        ...overrides,
    };
    const location = { href, origin: 'http://localhost:5391', assign: jest.fn() };
    const replaceUrl = jest.fn();
    const auth = new OwnerAuth(SETTINGS, '/', { userManager, session: window.sessionStorage, location, replaceUrl });
    const events: SessionEvent[] = [];
    auth.onChange(event => events.push(event));
    return { auth, userManager, location, replaceUrl, events, put: (next: User) => { stored = next; } };
}

beforeEach(() => window.sessionStorage.clear());

describe('signing in', () => {
    it('completes the redirect from Cognito and goes back to the view the owner left', async () => {
        const { auth, replaceUrl, events, userManager } = setup('http://localhost:5391/?code=abc&state=xyz');
        await expect(auth.start()).resolves.toBe('/#mode=molecule&id=h2o');
        expect(userManager.signinRedirectCallback).toHaveBeenCalledWith('http://localhost:5391/?code=abc&state=xyz');
        expect(replaceUrl).toHaveBeenCalledWith('/#mode=molecule&id=h2o');
        expect(events.at(-1)).toEqual({ identity: { email: 'owner@example.com' }, reason: 'signed-in' });
    });
    it('keeps the refresh token for the tab, never the access or ID token', async () => {
        const { auth } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        const raw = window.sessionStorage.getItem(SESSION_KEY)!;
        expect(JSON.parse(raw)).toEqual({ refresh_token: 'refresh-1', scope: 'openid email', profile: PROFILE });
        expect(raw).not.toContain('access-1');
        expect(raw).not.toContain('id-1');
    });
    it('asks Cognito to come back to the same view', async () => {
        const { auth, userManager } = setup('http://localhost:5391/#mode=molecule&id=h2o');
        await auth.signIn('/#mode=molecule&id=h2o');
        expect(userManager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/#mode=molecule&id=h2o' } });
    });
    it('reports a cancelled or failed sign-in, and cleans the URL', async () => {
        const { auth, replaceUrl } = setup('http://localhost:5391/?error=access_denied&error_description=User+cancelled');
        await expect(auth.start()).rejects.toThrow('Sign-in did not complete: User cancelled');
        expect(replaceUrl).toHaveBeenCalledWith('/');
    });
    it('goes back only to a path on this site', () => {
        expect(safeReturnTo({ returnTo: '//evil.example' }, '/')).toBe('/');
        expect(safeReturnTo({ returnTo: 'https://evil.example/' }, '/')).toBe('/');
        expect(safeReturnTo(null, '/admin.html')).toBe('/admin.html');
        expect(safeReturnTo({ returnTo: '/admin.html' }, '/')).toBe('/admin.html');
    });
});

describe('a reload, a renewal, and the end of a session', () => {
    it('restores the session after a reload from the refresh token alone', async () => {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token: 'refresh-1', scope: 'openid email', profile: PROFILE }));
        const { auth, userManager } = setup('http://localhost:5391/#mode=molecule');
        await expect(auth.start()).resolves.toBeNull();
        const seeded = (userManager.storeUser as jest.Mock).mock.calls[0][0] as User;
        expect([seeded.access_token, seeded.refresh_token]).toEqual(['', 'refresh-1']);
        expect(userManager.signinSilent).toHaveBeenCalled();
        await expect(auth.accessToken()).resolves.toBe('access-2');
    });
    it('signs out quietly when the saved refresh token no longer works', async () => {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token: 'stale', profile: PROFILE }));
        const { auth, events } = setup('http://localhost:5391/', { signinSilent: jest.fn(async () => { throw new Error('invalid_grant'); }) });
        await expect(auth.start()).resolves.toBeNull();
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(events.at(-1)).toEqual({ identity: null, reason: 'signed-out' });
    });
    it('refreshes an expired access token before handing it out', async () => {
        const { auth, put } = setup('http://localhost:5391/');
        put(user({ expires_at: Math.floor(Date.now() / 1000) - 10 }));
        await expect(auth.accessToken()).resolves.toBe('access-2');
    });
    it('calls a refresh refused mid-session an expiry, and forgets the token', async () => {
        const { auth, events } = setup('http://localhost:5391/?code=abc&state=xyz', { signinSilent: jest.fn(async () => { throw new Error('invalid_grant'); }) });
        await auth.start();
        await expect(auth.refresh()).resolves.toBe(false);
        expect(events.at(-1)).toEqual({ identity: null, reason: 'expired' });
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
    it("signs out through Cognito's logout endpoint", async () => {
        const { auth, location } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await auth.signOut();
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(location.assign).toHaveBeenCalledWith(logoutUrl(SETTINGS, 'http://localhost:5391', '/'));
        expect(logoutUrl(SETTINGS, 'http://localhost:5391', '/'))
            .toBe('https://eov.auth.us-east-1.amazoncognito.com/logout?client_id=client123&logout_uri=http%3A%2F%2Flocalhost%3A5391%2F');
    });
});
```

```ts
// tests/jobs/client.test.ts
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import { bindJobsClient, jobsApi, chooseTarget } from '../../src/jobs/client';
import { setOwnerAuthForTests } from '../../src/jobs/owner_session';
import type { OwnerAuth } from '../../src/jobs/auth';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from './build_env_stub';
import { fixture, jsonResponse, textResponse } from './api_fixtures';

const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';
const makeStore = () => configureStore({ reducer: { jobs: jobsReducer } });

afterEach(() => { resetBuildEnv(); bindJobsClient(null); setOwnerAuthForTests(null); window.localStorage.clear(); });

describe('the bound jobs client', () => {
    it("sends the signed-in owner's token, and an uncurable 401 marks the session expired in the store", async () => {
        BUILD_ENV.dev = true;
        const store = makeStore();
        bindJobsClient(store);
        chooseTarget('aws');
        setOwnerAuthForTests({ accessToken: async () => 'token-1', refresh: async () => false } as unknown as OwnerAuth);
        const fetchMock = jest.fn(async (_input: string, _init?: RequestInit) => textResponse(401, '{"message":"Unauthorized"}'));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await expect(jobsApi().get(KEY)).rejects.toMatchObject({ code: 'session-expired' });
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/aws/v1/jobs/${KEY}`);
        expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
        expect(store.getState().jobs.session.expired).toBe(true);
        expect(window.localStorage.getItem('eov.jobs.target')).toBe('aws');
    });
    it('needs no token for This Mac when sign-in is not configured', async () => {
        BUILD_ENV.dev = true;
        bindJobsClient(makeStore());
        const fetchMock = jest.fn(async (_input: string, _init?: RequestInit) => jsonResponse(200, fixture('get_running').body));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await jobsApi().get(KEY);
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/jobs/${KEY}`);
        expect(fetchMock.mock.calls[0][1]!.headers).toEqual({});
    });
    it('refuses to run unbound', () => {
        expect(() => jobsApi()).toThrow('bindJobsClient');
    });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx jest tests/jobs/auth.test.ts tests/jobs/client.test.ts`
Expected: FAIL, "Cannot find module '../../src/jobs/auth'".

- [ ] **Step 4: Implement**

```ts
// src/jobs/auth.ts
import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { CognitoSettings } from './build_env';

export const SESSION_KEY = 'eov.owner.session';
export type OwnerPage = '/' | '/admin.html';
export interface OwnerIdentity { email: string | null }
export interface SessionEvent { identity: OwnerIdentity | null; reason: 'signed-in' | 'signed-out' | 'expired' }

/** The parts of oidc-client-ts's UserManager this module uses; tests pass a fake. */
export interface UserManagerLike {
    getUser(): Promise<User | null>;
    storeUser(user: User | null): Promise<void>;
    removeUser(): Promise<void>;
    signinRedirect(args?: { state?: unknown }): Promise<void>;
    signinRedirectCallback(url?: string): Promise<User>;
    signinSilent(): Promise<User | null>;
    events: {
        addUserLoaded(callback: (user: User) => void): unknown;
        addSilentRenewError(callback: (error: Error) => void): unknown;
    };
}

export interface OwnerAuthDeps {
    userManager: UserManagerLike;
    /** sessionStorage in the browser: it survives a reload and ends with the tab (spec §9.5). */
    session: Storage;
    location: { href: string; origin: string; assign(url: string): void };
    replaceUrl(url: string): void;
}

/** oidc-client-ts for Cognito's managed login: authorization code + PKCE; the user pool enforces TOTP. */
export function makeUserManager(settings: CognitoSettings, origin: string, page: OwnerPage): UserManagerLike {
    return new UserManager({
        authority: settings.authority,
        client_id: settings.clientId,
        redirect_uri: `${origin}${page}`,
        response_type: 'code',
        scope: 'openid email',
        // The access token lives in memory only; OwnerAuth copies the refresh token out.
        userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
        // The PKCE verifier and state must survive the round trip to Cognito -- in this tab only.
        stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
        automaticSilentRenew: true,
        loadUserInfo: false,
    });
}

interface SavedSession { refresh_token: string; scope?: string; profile: User['profile'] }

const identityOf = (user: User): OwnerIdentity => ({ email: typeof user.profile.email === 'string' ? user.profile.email : null });

/** The return path travels through Cognito in the sign-in state, so only a path on this site is trusted. */
export function safeReturnTo(state: unknown, fallback: string): string {
    const value = (state as { returnTo?: unknown } | null)?.returnTo;
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

/** Cognito publishes no end_session_endpoint, so sign-out is its own /logout, back to the same page. */
export function logoutUrl(settings: CognitoSettings, origin: string, page: OwnerPage): string {
    return `${settings.domain}/logout?client_id=${encodeURIComponent(settings.clientId)}&logout_uri=${encodeURIComponent(`${origin}${page}`)}`;
}

/**
 * The owner's Cognito session on one page. oidc-client-ts holds the tokens
 * in memory; after every sign-in or renewal the refresh token (with the
 * profile) is copied to sessionStorage, and on load an in-memory user
 * holding only that is seeded and renewed -- signinSilent takes the
 * refresh-token grant whenever the stored user has a refresh token -- so a
 * reload keeps the session while the access token never touches storage.
 */
export class OwnerAuth {
    private readonly listeners = new Set<(event: SessionEvent) => void>();

    constructor(private readonly settings: CognitoSettings, private readonly page: OwnerPage, private readonly deps: OwnerAuthDeps) {
        // oidc-client-ts's own renewal timer lands here as well as explicit renewals.
        deps.userManager.events.addUserLoaded(user => this.adopt(user));
        deps.userManager.events.addSilentRenewError(() => { void this.end('expired'); });
    }

    onChange(listener: (event: SessionEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /** Completes a redirect back from Cognito, or restores this tab's session. Resolves to the path to return to after a redirect, else null. */
    async start(): Promise<string | null> {
        const url = new URL(this.deps.location.href);
        if (url.searchParams.has('code') && url.searchParams.has('state')) {
            try {
                const user = await this.deps.userManager.signinRedirectCallback(url.href);
                this.adopt(user);
                const back = safeReturnTo(user.state, this.page);
                this.deps.replaceUrl(back);
                return back;
            } catch (error) {
                this.deps.replaceUrl(this.page);
                throw new Error(`Sign-in did not complete: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (url.searchParams.has('error')) {
            this.deps.replaceUrl(this.page);
            throw new Error(`Sign-in did not complete: ${url.searchParams.get('error_description') ?? url.searchParams.get('error')}`);
        }
        const saved = this.saved();
        if (!saved) {
            this.emit({ identity: null, reason: 'signed-out' });
            return null;
        }
        try {
            await this.deps.userManager.storeUser(new User({
                access_token: '', token_type: 'Bearer', refresh_token: saved.refresh_token, scope: saved.scope, profile: saved.profile, expires_at: 0,
            }));
            const user = await this.deps.userManager.signinSilent();
            if (!user) throw new Error('no session');
            this.adopt(user);
        } catch {
            await this.end('signed-out');
        }
        return null;
    }

    signIn(returnTo: string): Promise<void> {
        return this.deps.userManager.signinRedirect({ state: { returnTo } });
    }

    async signOut(): Promise<void> {
        await this.end('signed-out');
        this.deps.location.assign(logoutUrl(this.settings, this.deps.location.origin, this.page));
    }

    async accessToken(): Promise<string | null> {
        const user = await this.deps.userManager.getUser();
        if (!user || !user.access_token) return null;
        if (user.expired && !(await this.refresh())) return null;
        return (await this.deps.userManager.getUser())?.access_token || null;
    }

    /** One silent renewal; a refusal ends the session as an expiry, which the page then says. */
    async refresh(): Promise<boolean> {
        try {
            const user = await this.deps.userManager.signinSilent();
            if (!user) throw new Error('no session');
            this.adopt(user);
            return true;
        } catch {
            await this.end('expired');
            return false;
        }
    }

    private adopt(user: User): void {
        if (user.refresh_token) {
            const saved: SavedSession = { refresh_token: user.refresh_token, scope: user.scope, profile: user.profile };
            this.deps.session.setItem(SESSION_KEY, JSON.stringify(saved));
        }
        this.emit({ identity: identityOf(user), reason: 'signed-in' });
    }

    private async end(reason: 'signed-out' | 'expired'): Promise<void> {
        this.deps.session.removeItem(SESSION_KEY);
        await this.deps.userManager.removeUser();
        this.emit({ identity: null, reason });
    }

    private saved(): SavedSession | null {
        try {
            const raw = this.deps.session.getItem(SESSION_KEY);
            const value = raw ? (JSON.parse(raw) as SavedSession) : null;
            return value && typeof value.refresh_token === 'string' ? value : null;
        } catch {
            return null;
        }
    }

    private emit(event: SessionEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}
```

```ts
// src/jobs/owner_session.ts
import type { UnknownAction } from '@reduxjs/toolkit';
import { BUILD_ENV } from './build_env';
import { makeUserManager, OwnerAuth, OwnerPage } from './auth';
import { sessionChanged, sessionExpired, sessionFailed } from '../store/jobsSlice';

let current: OwnerAuth | null = null;

/** The page's sign-in, or null when this build has no Cognito settings. */
export function ownerAuth(): OwnerAuth | null {
    return current;
}

export function setOwnerAuthForTests(auth: OwnerAuth | null): void {
    current = auth;
}

/**
 * Once per page, before anything asks for a token: completes a redirect back
 * from Cognito or restores this tab's session, and mirrors the session into
 * the store. Resolves to the path to go back to after a redirect -- its hash
 * is the view the owner left -- or null.
 */
export async function startOwnerSession(dispatch: (action: UnknownAction) => unknown, page: OwnerPage): Promise<string | null> {
    const settings = BUILD_ENV.cognito;
    if (!settings) return null;
    const auth = new OwnerAuth(settings, page, {
        userManager: makeUserManager(settings, window.location.origin, page),
        session: window.sessionStorage,
        location: window.location,
        replaceUrl: url => window.history.replaceState(null, '', url),
    });
    current = auth;
    auth.onChange(({ identity, reason }) => {
        dispatch(reason === 'expired' ? sessionExpired() : sessionChanged({ signedIn: identity !== null, email: identity?.email ?? null }));
    });
    try {
        return await auth.start();
    } catch (error) {
        dispatch(sessionFailed(error instanceof Error ? error.message : String(error)));
        return null;
    }
}
```

```ts
// src/jobs/client.ts
import type { UnknownAction } from '@reduxjs/toolkit';
import { createJobsApi, JobsApi } from './api';
import { BUILD_ENV } from './build_env';
import { ownerAuth } from './owner_session';
import { sessionExpired, setTarget, JobsState, JobsTarget, TARGET_STORAGE_KEY } from '../store/jobsSlice';

export interface JobsStoreLike {
    getState(): { jobs: JobsState };
    dispatch(action: UnknownAction): unknown;
}

let bound: JobsStoreLike | null = null;

/** main.tsx and admin/main.tsx bind their store once; from then on the API follows its target and session. */
export function bindJobsClient(store: JobsStoreLike | null): void {
    bound = store;
}

function requireStore(): JobsStoreLike {
    if (!bound) throw new Error('jobs client: call bindJobsClient(store) first');
    return bound;
}

export function jobsApi(): JobsApi {
    const store = requireStore();
    return createJobsApi(store.getState().jobs.target, BUILD_ENV, {
        fetch: (input, init) => fetch(input, init),
        token: async () => (await ownerAuth()?.accessToken()) ?? null,
        refresh: async () => (await ownerAuth()?.refresh()) ?? false,
        onSessionExpired: () => { store.dispatch(sessionExpired()); },
    });
}

/** The dev server's "where jobs run" choice, remembered so / and /admin.html agree. */
export function chooseTarget(target: JobsTarget): void {
    try {
        window.localStorage.setItem(TARGET_STORAGE_KEY, target);
    } catch {
        // Storage refused (a private window): the choice lasts this page.
    }
    requireStore().dispatch(setTarget(target));
}
```

In `src/main.tsx`:
1. Import `bindJobsClient` from `./jobs/client` and `startOwnerSession` from `./jobs/owner_session`.
2. Directly after `bindUrlStateStore(store);`, add `bindJobsClient(store);`.
3. Directly after `applyState(window.location.hash);`, add:

```ts
// Back from Cognito: the view the owner left travelled in the sign-in state (its hash); restore it.
void startOwnerSession(store.dispatch, '/').then(back => {
  if (back) applyState(new URL(back, window.location.origin).hash);
});
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/jobs/auth.test.ts tests/jobs/client.test.ts && npx tsc --noEmit -p .`
Expected: PASS (13 tests); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/jobs/auth.ts src/jobs/owner_session.ts src/jobs/client.ts src/main.tsx tests/jobs/auth.test.ts tests/jobs/client.test.ts
git commit -m "feat(jobs): owner sign-in via oidc-client-ts 3.5.0 (code + PKCE), access token in memory, refresh token per tab (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Polling a job

**Files:**
- Create: `src/jobs/poller.ts`, `src/jobs/useJobPolling.ts`, `src/jobs/useNow.ts`, `tests/jobs/poller.test.ts`
- Modify: `src/jobs/client.ts` (add `jobsPoller`, `setJobsPollerForTests`)

**Interfaces:**
- Consumes: `isActive`, `JobView` (Task 2); `JobsApiError` (Task 6); `jobsApi` (Task 7); `jobUpdated`, `jobFetchFailed`, `JobsState` (Task 5).
- Produces:
  - `poller.ts`: `POLL_INTERVAL_MS = 5000`; `interface PollerDeps { fetchJob(key): Promise<JobView>; onUpdate(view): void; onError(key, error): void; isFatal(error): boolean; now(): number; setTimer(callback, ms): unknown; clearTimer(handle): void; hidden(): boolean; onVisibilityChange(listener): () => void }`; `class JobPoller { watch(key: string): () => void; restart(key: string): void }`.
  - `client.ts`: `jobsPoller(): JobPoller` (one per page, created on first use); `setJobsPollerForTests(poller: Pick<JobPoller, 'watch' | 'restart'> | null)`.
  - `useJobPolling(key: string | null): { view: JobView | null; error: string | null }`.
  - `useNow(ticking: boolean, intervalMs?: number): number` (milliseconds since the epoch).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/jobs/poller.test.ts
import { JobPoller, PollerDeps, POLL_INTERVAL_MS } from '../../src/jobs/poller';
import type { JobStatus, JobView } from '../../src/jobs/api_types';
import { jobFixture } from './api_fixtures';

const KEY = jobFixture('get_running').key;
const view = (status: JobStatus): JobView => ({ ...jobFixture('get_running'), status });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

/** A clock, timers and a visibility flag the test drives by hand. */
function harness(hiddenAtStart = false) {
    let now = 0;
    let hidden = hiddenAtStart;
    let timers: Array<{ id: number; at: number; fn: () => void }> = [];
    let nextId = 1;
    const listeners = new Set<() => void>();
    const answers: Array<() => Promise<JobView>> = [];
    const fetchJob = jest.fn((_key: string) => (answers.shift() ?? (async () => view('RUNNING')))());
    const deps: PollerDeps = {
        fetchJob,
        onUpdate: jest.fn(),
        onError: jest.fn(),
        isFatal: error => (error as { code?: string }).code === 'session-expired',
        now: () => now,
        setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
        clearTimer: id => { timers = timers.filter(t => t.id !== id); },
        hidden: () => hidden,
        onVisibilityChange: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    async function advance(ms: number) {
        const end = now + ms;
        for (;;) {
            await flush();
            const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            timers = timers.filter(t => t !== due);
            now = due.at;
            due.fn();
        }
        now = end;
        await flush();
    }
    const setHidden = (value: boolean) => { hidden = value; listeners.forEach(listener => listener()); };
    return { poller: new JobPoller(deps), deps, fetchJob, answers, advance, setHidden, listeners };
}

describe('JobPoller', () => {
    it('one request per interval however many watch the same job', async () => {
        const h = harness();
        h.poller.watch(KEY); h.poller.watch(KEY); h.poller.watch(KEY);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        await h.advance(POLL_INTERVAL_MS - 1);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        await h.advance(1);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('remounting does not refetch: ten unmount-and-remount cycles cost no extra request', async () => {
        const h = harness();
        const first = h.poller.watch(KEY);
        await h.advance(0);
        first();
        for (let i = 0; i < 10; i++) h.poller.watch(KEY)();
        h.poller.watch(KEY);
        await h.advance(1000);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        await h.advance(POLL_INTERVAL_MS - 1000);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('never has two requests in flight for one job', async () => {
        const h = harness();
        h.answers.push(() => new Promise(() => {}));               // a request that never answers
        h.poller.watch(KEY);
        await h.advance(20 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
    });

    it('stops when the job ends, and reports the final view', async () => {
        const h = harness();
        h.answers.push(async () => view('RUNNING'), async () => view('DONE'));
        h.poller.watch(KEY);
        await h.advance(0);
        await h.advance(POLL_INTERVAL_MS);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
        expect((h.deps.onUpdate as jest.Mock).mock.calls.at(-1)[0].status).toBe('DONE');
    });

    it('stops on the last unmount, and stops listening for visibility', async () => {
        const h = harness();
        const release = h.poller.watch(KEY);
        await h.advance(0);
        release();
        release();                                                   // a second call is harmless
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        expect(h.listeners.size).toBe(0);
    });

    it('sends nothing while the tab is hidden, and catches up once when shown', async () => {
        const h = harness(true);
        h.poller.watch(KEY);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(0);
        h.setHidden(false);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        h.setHidden(true);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        h.setHidden(false);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('keeps polling through a passing failure, and stops on one retrying cannot cure', async () => {
        const h = harness();
        h.answers.push(async () => { throw { code: 'unreachable' }; }, async () => { throw { code: 'session-expired' }; });
        h.poller.watch(KEY);
        await h.advance(0);
        await h.advance(POLL_INTERVAL_MS);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
        expect(h.deps.onError).toHaveBeenCalledTimes(2);
    });

    it('a retried job is followed again at once', async () => {
        const h = harness();
        h.answers.push(async () => view('FAILED'));
        h.poller.watch(KEY);
        await h.advance(0);
        h.poller.restart(KEY);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/poller.test.ts`
Expected: FAIL, "Cannot find module '../../src/jobs/poller'".

- [ ] **Step 3: Implement**

```ts
// src/jobs/poller.ts
import { isActive, JobView } from './api_types';

/** Spec §6.7: the status is polled every 5 s while a job is not terminal. */
export const POLL_INTERVAL_MS = 5000;

export interface PollerDeps {
    fetchJob(key: string): Promise<JobView>;
    onUpdate(view: JobView): void;
    onError(key: string, error: unknown): void;
    /** A failure retrying cannot cure (an ended session, an unknown key): stop asking. */
    isFatal(error: unknown): boolean;
    now(): number;
    setTimer(callback: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
    hidden(): boolean;
    onVisibilityChange(listener: () => void): () => void;
}

interface Watch { watchers: number; timer: unknown; inFlight: boolean }

/**
 * Follows jobs at one request per job per interval, however many panels
 * watch it and however often they remount -- React's StrictMode alone
 * mounts every effect twice. Watchers are counted per key; a request is
 * never sent while one is in flight; and the next waits a full interval
 * from the last one sent, remembered across an unmount and remount. A
 * hidden tab sends nothing, and showing it again catches up with one
 * request. A job that has ended is not asked about again until restart()
 * says it was resubmitted.
 */
export class JobPoller {
    private readonly watches = new Map<string, Watch>();
    private readonly lastSent = new Map<string, number>();
    private readonly finished = new Set<string>();
    private stopListening: (() => void) | null = null;

    constructor(private readonly deps: PollerDeps) {}

    watch(key: string): () => void {
        const watch = this.watches.get(key) ?? { watchers: 0, timer: null, inFlight: false };
        this.watches.set(key, watch);
        watch.watchers += 1;
        if (!this.stopListening) this.stopListening = this.deps.onVisibilityChange(() => this.visibilityChanged());
        this.schedule(key, watch);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.release(key, watch);
        };
    }

    /** A retried job is live again: ask about it at once. */
    restart(key: string): void {
        this.finished.delete(key);
        this.lastSent.delete(key);
        const watch = this.watches.get(key);
        if (watch) this.schedule(key, watch);
    }

    private schedule(key: string, watch: Watch): void {
        if (watch.watchers === 0 || watch.inFlight || watch.timer !== null || this.finished.has(key) || this.deps.hidden()) return;
        const wait = Math.max(0, (this.lastSent.get(key) ?? -Infinity) + POLL_INTERVAL_MS - this.deps.now());
        watch.timer = this.deps.setTimer(() => {
            watch.timer = null;
            void this.poll(key, watch);
        }, wait);
    }

    private async poll(key: string, watch: Watch): Promise<void> {
        if (watch.watchers === 0 || this.deps.hidden() || this.finished.has(key)) return;
        watch.inFlight = true;
        this.lastSent.set(key, this.deps.now());
        try {
            const view = await this.deps.fetchJob(key);
            this.deps.onUpdate(view);
            if (!isActive(view.status)) this.finished.add(key);
        } catch (error) {
            this.deps.onError(key, error);
            if (this.deps.isFatal(error)) this.finished.add(key);
        } finally {
            watch.inFlight = false;
            this.schedule(key, watch);
        }
    }

    private release(key: string, watch: Watch): void {
        watch.watchers -= 1;
        if (watch.watchers > 0) return;
        if (watch.timer !== null) {
            this.deps.clearTimer(watch.timer);
            watch.timer = null;
        }
        if (this.watches.get(key) === watch) this.watches.delete(key);
        if (this.watches.size === 0 && this.stopListening) {
            this.stopListening();
            this.stopListening = null;
        }
    }

    private visibilityChanged(): void {
        for (const [key, watch] of this.watches) {
            if (this.deps.hidden()) {
                if (watch.timer !== null) {
                    this.deps.clearTimer(watch.timer);
                    watch.timer = null;
                }
            } else {
                this.schedule(key, watch);
            }
        }
    }
}
```

Append to `src/jobs/client.ts`. Also add `JobsApiError` to its `./api` import, add `import { JobPoller } from './poller';`, and add `jobFetchFailed, jobUpdated` to its `jobsSlice` import:

```ts
let poller: Pick<JobPoller, 'watch' | 'restart'> | null = null;

/** The page's one poller, so every panel following a job shares its requests. */
export function jobsPoller(): Pick<JobPoller, 'watch' | 'restart'> {
    if (poller) return poller;
    const store = requireStore();
    poller = new JobPoller({
        fetchJob: key => jobsApi().get(key),
        onUpdate: view => { store.dispatch(jobUpdated(view)); },
        onError: (key, error) => { store.dispatch(jobFetchFailed({ key, message: error instanceof Error ? error.message : String(error) })); },
        isFatal: error => error instanceof JobsApiError
            && (error.status === 401 || error.status === 404 || error.code === 'not-configured' || error.code === 'aws-not-configured'),
        now: () => Date.now(),
        setTimer: (callback, ms) => window.setTimeout(callback, ms),
        clearTimer: handle => window.clearTimeout(handle as number),
        hidden: () => document.visibilityState === 'hidden',
        onVisibilityChange: listener => {
            document.addEventListener('visibilitychange', listener);
            return () => document.removeEventListener('visibilitychange', listener);
        },
    });
    return poller;
}

export function setJobsPollerForTests(next: Pick<JobPoller, 'watch' | 'restart'> | null): void {
    poller = next;
}
```

Also add `poller = null;` as the second line of `bindJobsClient`: a poller belongs to the store it was bound with.

```ts
// src/jobs/useJobPolling.ts
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { JobsState } from '../store/jobsSlice';
import type { JobView } from './api_types';
import { jobsPoller } from './client';

/** A job's latest view and last error, kept fresh by the page's one poller while this is mounted. */
export function useJobPolling(key: string | null): { view: JobView | null; error: string | null } {
    useEffect(() => (key ? jobsPoller().watch(key) : undefined), [key]);
    const view = useSelector((state: { jobs: JobsState }) => (key ? state.jobs.records[key] ?? null : null));
    const error = useSelector((state: { jobs: JobsState }) => (key ? state.jobs.recordErrors[key] ?? null : null));
    return { view, error };
}
```

```ts
// src/jobs/useNow.ts
import { useEffect, useState } from 'react';

/** The time, re-read every second while `ticking`: an elapsed-time readout that moves between 5 s polls. */
export function useNow(ticking: boolean, intervalMs = 1000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!ticking) return undefined;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(id);
    }, [ticking, intervalMs]);
    return now;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/jobs/poller.test.ts tests/jobs/client.test.ts && npx tsc --noEmit -p .`
Expected: PASS (8 + 3 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/poller.ts src/jobs/useJobPolling.ts src/jobs/useNow.ts src/jobs/client.ts tests/jobs/poller.test.ts
git commit -m "feat(jobs): one shared poller: 5 s while live, never two in flight, nothing while hidden (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: The tier badge and "How this was computed"

**Files:**
- Create: `src/components/TierBadge.tsx`, `src/components/ProvenancePanel.tsx`, `tests/jobs/provenance_panel.test.tsx`
- Modify: `vite.config.ts` (dev server: serve `.py`, `.log` and `.xyz` as text), `src/style.css`

**Interfaces:**
- Consumes: `MoleculeTier`, `MoleculeProvenance`, `tierOf` (Task 2); `computedResultFiles`, `jobFileUrl` (Task 3); `capacityLabel`, `formatDuration`, `formatGB`, `money`, `predictionNote` (Task 2); `JobView` (Task 2); `LibraryMoleculeMeta` (Phase 6).
- Produces:
  - `TIER_TEXT: Record<MoleculeTier, { label: string; line: string }>`; `<TierBadge tier={MoleculeTier} />`, which renders role `note` named `data tier`.
  - `PUBCHEM_COMPOUND_URL = 'https://pubchem.ncbi.nlm.nih.gov/compound/'`.
  - `<ProvenancePanel meta={LibraryMoleculeMeta} ownerJob={JobView | null} ownerJobError?={string | null} />`: an accordion whose summary button reads `How this was computed`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/jobs/provenance_panel.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProvenancePanel from '../../src/components/ProvenancePanel';
import TierBadge from '../../src/components/TierBadge';
import type { MoleculeProvenance } from '../../src/molecules/types';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';
import { waterMeta } from '../molecules/fixtures';
import { jobFixture } from './api_fixtures';

const KEY = jobFixture('get_done').key;
const PROVENANCE: MoleculeProvenance = {
    jobKey: KEY, computeVersion: 1, recipe: 'single',
    geometrySource: { kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' },
    caveats: ["The geometry is not optimised: it is PubChem's computed 3D conformer or as pasted."],
    generatorCommit: 'abc1234def567', imageDigest: 'local', pyscfVersion: '2.8.0', sizingVersion: 1, size: 'S',
    capacity: 'local', wallSeconds: 70.2, costUsd: null,
};
const computed = (over: Partial<MoleculeProvenance> = {}, extra: Record<string, unknown> = {}): LibraryMoleculeMeta =>
    waterMeta({ id: KEY, tier: 'computed', provenance: { ...PROVENANCE, ...over }, references: [], ...extra });
const open = () => fireEvent.click(screen.getByRole('button', { name: 'How this was computed' }));

describe('TierBadge', () => {
    it('names the tier and says what it means', () => {
        const { rerender } = render(<TierBadge tier="validated" />);
        expect(screen.getByRole('note', { name: 'data tier' })).toHaveTextContent('ValidatedCurated, and checked against published values.');
        rerender(<TierBadge tier="computed" />);
        expect(screen.getByRole('note', { name: 'data tier' }))
            .toHaveTextContent('ComputedComputed on request by the same method; not benchmarked against experiment.');
    });
});

describe('ProvenancePanel', () => {
    it('states a validated molecule’s method, its geometry and what it was checked against', () => {
        render(<ProvenancePanel meta={waterMeta()} ownerJob={null} />);
        open();
        expect(screen.getByText('Method: B3LYP/def2-TZVPD, PySCF 2.6.0.')).toBeInTheDocument();
        expect(screen.getByText('Geometry: experiment (CCCBDB).')).toBeInTheDocument();
        expect(screen.getByText('dipole: 1.855 D — CRC Handbook, via CCCBDB')).toBeInTheDocument();
        expect(screen.getByText(/Generated by tools\/molecules\/build_library\.py at commit abc1234\./)).toBeInTheDocument();
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('links a computed molecule’s PubChem record, states its caveats, and links its four files', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={null} />);
        open();
        expect(screen.getByText('Method: B3LYP/def2-TZVPD, PySCF 2.8.0.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '962' })).toHaveAttribute('href', 'https://pubchem.ncbi.nlm.nih.gov/compound/962');
        expect(screen.getByText(/its computed 3D conformer, retrieved 2026-10-10, not optimised\./)).toBeInTheDocument();
        expect(screen.getByText(PROVENANCE.caveats[0])).toBeInTheDocument();
        for (const name of ['input.py', 'output.log', 'geometry.xyz', 'job.json']) {
            expect(screen.getByRole('link', { name })).toHaveAttribute('href', `/molecules/jobs/${KEY}/${name}`);
        }
        expect(screen.getByText(/Ran on This Mac: 1 min 10 s of wall time\. Generator commit abc1234; sized by sizing rule v1\./)).toBeInTheDocument();
        expect(screen.queryByText(/Cost:/)).toBeNull();
    });
    it('says an optimised geometry was optimised, from what, and adds the trajectory', () => {
        render(<ProvenancePanel meta={computed({ recipe: 'optimise', geometrySource: { kind: 'xyz' } }, { geometryOptimisation: { steps: 7, converged: true } })} ownerJob={null} />);
        open();
        expect(screen.getByText(/optimised at B3LYP\/def2-SVP with geomeTRIC in 7 steps, starting from pasted XYZ coordinates\./)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'trajectory.xyz' })).toHaveAttribute('href', `/molecules/jobs/${KEY}/trajectory.xyz`);
    });
    it('shows the owner the time against its prediction, and the cost', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={jobFixture('get_done')} />);
        open();
        expect(screen.getByText(/Owner only: 1 min 10 s of wall time, peak memory 0\.52 GB \(predicted .+ sizing v\d+ prediction\)\./)).toBeInTheDocument();
        expect(screen.getByText(/Cost: spent \$0\.00 \(This Mac\)\./)).toBeInTheDocument();
    });
    it('shows a cost not settled yet as reserved', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={{ ...jobFixture('get_done'), backend: 'aws', actualUsd: null, reservedUsd: 0.0894 }} />);
        open();
        expect(screen.getByText(/Cost: reserved \$0\.09, not settled yet\./)).toBeInTheDocument();
    });
    it('says when the owner’s job record could not be read', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={null} ownerJobError="offline" />);
        open();
        expect(screen.getByRole('alert')).toHaveTextContent('The job record could not be read: offline');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/provenance_panel.test.tsx`
Expected: FAIL, "Cannot find module '../../src/components/ProvenancePanel'".

- [ ] **Step 3: Implement**

```tsx
// src/components/TierBadge.tsx
import React from 'react';
import { Chip } from '@mui/material';
import type { MoleculeTier } from '../molecules/types';

export const TIER_TEXT: Record<MoleculeTier, { label: string; line: string }> = {
    validated: { label: 'Validated', line: 'Curated, and checked against published values.' },
    computed: { label: 'Computed', line: 'Computed on request by the same method; not benchmarked against experiment.' },
};

/** Spec §9.1: which tier a molecule belongs to is always on screen with it, never only inside a panel one has to open. */
const TierBadge: React.FC<{ tier: MoleculeTier }> = ({ tier }) => (
    <div className={`tier-badge tier-${tier}`} role="note" aria-label="data tier">
        <Chip size="small" label={TIER_TEXT[tier].label} color={tier === 'validated' ? 'success' : 'warning'} />
        <span className="tier-badge-line">{TIER_TEXT[tier].line}</span>
    </div>
);

export default TierBadge;
```

```tsx
// src/components/ProvenancePanel.tsx
import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Link, Typography } from '@mui/material';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { tierOf, MoleculeProvenance } from '../molecules/types';
import { computedResultFiles, jobFileUrl } from '../molecules/job_paths';
import { capacityLabel, formatDuration, formatGB, money, predictionNote } from '../jobs/format';
import type { JobView } from '../jobs/api_types';

export const PUBCHEM_COMPOUND_URL = 'https://pubchem.ncbi.nlm.nih.gov/compound/';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

interface ProvenancePanelProps {
    meta: LibraryMoleculeMeta;
    /** The owner's view of this molecule's job (GET /api/v1/jobs/{key}); null for anyone else, or until it arrives. */
    ownerJob: JobView | null;
    ownerJobError?: string | null;
}

function Geometry({ provenance, steps }: { provenance: MoleculeProvenance; steps: number | null }) {
    const source = provenance.geometrySource;
    const origin = source.kind === 'pubchem'
        ? <>PubChem CID <Link href={`${PUBCHEM_COMPOUND_URL}${source.cid}`} {...EXTERNAL}>{source.cid}</Link> ({source.title}), its computed 3D conformer, retrieved {source.retrievedAt}</>
        : <>pasted XYZ coordinates</>;
    if (provenance.recipe === 'single') return <Typography variant="body2">Geometry: {origin}, not optimised.</Typography>;
    return (
        <Typography variant="body2">
            Geometry: optimised at B3LYP/def2-SVP with geomeTRIC{steps !== null ? ` in ${steps} steps` : ''}, starting from {origin}.
        </Typography>
    );
}

/** Time against its prediction, and the money -- the owner's numbers, read from the job record (meta's costUsd is always null). */
function OwnerFacts({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    const cost = job.actualUsd === null ? `${money('reserved', job.reservedUsd)}, not settled yet` : money('spent', job.actualUsd);
    return (
        <Typography variant="body2" className="provenance-owner">
            Owner only: {actual ? `${formatDuration(actual.wallSeconds)} of wall time, peak memory ${formatGB(actual.peakMemoryGB)}` : 'no timings recorded'}
            {' '}(predicted {formatDuration(sizing.predictedSeconds)} and {formatGB(sizing.predictedMemoryGB)}, {predictionNote(sizing.version)}).
            {' '}Cost: {cost}{job.backend === 'local' ? ' (This Mac)' : ''}.
        </Typography>
    );
}

/**
 * Spec §9.3: on every molecule, whichever tier, how it was computed -- the
 * method, where the geometry came from, what to be wary of, and for a
 * computed molecule the very files that produced it, input.py first, so
 * anyone can run it again.
 */
const ProvenancePanel: React.FC<ProvenancePanelProps> = ({ meta, ownerJob, ownerJobError = null }) => {
    const provenance = tierOf(meta) === 'computed' ? meta.provenance ?? null : null;
    // 6B-1's worker records {steps, converged} for recipe B (Phase 6's own type names other fields; only steps is read).
    const steps = (meta as { geometryOptimisation?: { steps?: unknown } }).geometryOptimisation?.steps;
    return (
        <Accordion disableGutters className="provenance-panel" slotProps={{ transition: { unmountOnExit: true } }}>
            <AccordionSummary aria-controls="provenance-body" id="provenance-head">How this was computed</AccordionSummary>
            <AccordionDetails id="provenance-body" className="provenance-body">
                <Typography variant="body2">Method: {meta.method.density}, PySCF {provenance?.pyscfVersion ?? meta.generator.pyscf}.</Typography>
                {provenance ? (
                    <>
                        <Geometry provenance={provenance} steps={typeof steps === 'number' ? steps : null} />
                        <Typography variant="subtitle2">Caveats</Typography>
                        <ul className="provenance-list">{provenance.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>
                        <Typography variant="subtitle2">Files</Typography>
                        <ul className="provenance-list">
                            {computedResultFiles(provenance.recipe).map(name => (
                                <li key={name}><Link href={jobFileUrl(provenance.jobKey, name)} {...EXTERNAL}>{name}</Link></li>
                            ))}
                        </ul>
                        <Typography variant="body2">
                            Ran on {capacityLabel(provenance.capacity)}{provenance.capacity === 'local' ? '' : `, worker size ${provenance.size}`}:
                            {' '}{formatDuration(provenance.wallSeconds)} of wall time. Generator commit {provenance.generatorCommit.slice(0, 7)}; sized by sizing rule v{provenance.sizingVersion}.
                        </Typography>
                        {ownerJob && <OwnerFacts job={ownerJob} />}
                        {ownerJobError && <Typography variant="caption" role="alert">The job record could not be read: {ownerJobError}</Typography>}
                    </>
                ) : (
                    <>
                        <Typography variant="body2">Geometry: {meta.geometrySource}.</Typography>
                        <Typography variant="subtitle2">Checked against</Typography>
                        <ul className="provenance-list">
                            {meta.references.map((reference, index) => (
                                <li key={index}>{reference.quantity}: {reference.value} {reference.unit} — {reference.source}</li>
                            ))}
                        </ul>
                        <Typography variant="body2">Generated by {meta.generator.script} at commit {meta.generator.commit.slice(0, 7)}.</Typography>
                    </>
                )}
            </AccordionDetails>
        </Accordion>
    );
};

export default ProvenancePanel;
```

In `vite.config.ts`, `serveLocalMolecules` serves everything that is not JSON as `application/octet-stream`, so the browser would download `input.py` and `output.log` rather than show them. Add a constant above the plugin function:

```ts
// The provenance panel links a computed job's input.py, output.log and
// geometry.xyz: shown as text, not downloaded (spec §9.3).
const TEXT_FILES = /\.(py|log|xyz)$/;
```

and change its `Content-Type` line to:

```ts
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json'
          : TEXT_FILES.test(file) ? 'text/plain; charset=utf-8' : 'application/octet-stream');
```

Append to `src/style.css`:

```css
/* Phase 6B-2: tier badge (in .molecule-legend-stack) and the jobs panels in the side panel / Explore tab. */
.tier-badge { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 8px; background: rgba(240, 240, 240, 0.94); font-size: 0.8125rem; max-width: 520px; }
.molecule-jobs { display: flex; flex-direction: column; gap: 8px; }
.molecule-jobs .MuiAccordion-root { border-radius: 10px; background: rgba(240, 240, 240, 0.94); }
.provenance-body { display: flex; flex-direction: column; gap: 6px; }
.provenance-list { margin: 0; padding-left: 18px; font-size: 0.875rem; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/jobs/provenance_panel.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (7 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/TierBadge.tsx src/components/ProvenancePanel.tsx tests/jobs/provenance_panel.test.tsx vite.config.ts src/style.css
git commit -m "feat(jobs): a tier badge on every molecule and \"How this was computed\": method, geometry source, caveats, files, owner cost (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The request panel and its preview

**Files:**
- Create: `src/jobs/request_form.ts`, `src/jobs/usePreview.ts`, `src/components/PreviewDetails.tsx`, `src/components/RequestPanel.tsx`, `tests/jobs/request_form.test.ts`, `tests/jobs/request_panel.test.tsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `JobRequest`, `JobView`, `CanonicalJob`, `PreviewResponse`, `Recipe`, `Sizing`, `isActive` (Task 2); the formats (Task 2); `JobsApiError`, `SESSION_ENDED` (Task 6); `JobsTarget` (Task 5); `StructurePreview` (Task 4); `PUBCHEM_COMPOUND_URL` (Task 9); `formatFormula` (Phase 6); `elementFor` (`src/elements.ts`).
- Produces:
  - `request_form.ts`: `InputKind = 'name' | 'smiles' | 'xyz'`; `interface RequestForm { kind: InputKind; text: string; recipe: Recipe; charge: string; multiplicity: string }`; `EMPTY_FORM`; `interface FormProblem { field: 'text' | 'charge' | 'multiplicity'; message: string }`; `formProblems(form): FormProblem[]`; `requestBody(form): JobRequest`; `formSignature(form): string`; `xyzFromCanonical(job: CanonicalJob): string`; `retryBody(view: JobView): JobRequest`.
  - `usePreview.ts`: `PreviewState` (`idle` | `loading` | `ready` | `failed`, each with `signature` except `idle`); `PreviewFn = (body: JobRequest, signal: AbortSignal) => Promise<PreviewResponse>`; `usePreview(previewFn): { state: PreviewState; run(form: RequestForm): void; clear(): void }`.
  - `<PreviewDetails preview={PreviewResponse} />`: a region named `preview`.
  - `<RequestPanel target preview submit onOpen onFollow sessionExpired onSignIn />` with `RequestPanelProps { target: JobsTarget; preview: PreviewFn; submit(body: JobRequest): Promise<{ status: number; job: JobView }>; onOpen(key: string): void; onFollow(job: JobView): void; sessionExpired: boolean; onSignIn(): void }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/jobs/request_form.test.ts
import { EMPTY_FORM, formProblems, formSignature, requestBody, retryBody, xyzFromCanonical } from '../../src/jobs/request_form';
import { jobFixture } from './api_fixtures';

describe('request bodies', () => {
    it('sends a name or SMILES trimmed, XYZ as typed, and charge and multiplicity only when given', () => {
        expect(requestBody({ ...EMPTY_FORM, text: '  water ' })).toEqual({ recipe: 'single', molecule: { name: 'water' } });
        expect(requestBody({ ...EMPTY_FORM, kind: 'smiles', text: 'CCO', recipe: 'optimise', charge: '+1', multiplicity: '2' }))
            .toEqual({ recipe: 'optimise', molecule: { smiles: 'CCO' }, charge: 1, multiplicity: 2 });
        expect(requestBody({ ...EMPTY_FORM, kind: 'xyz', text: '1\n\nHe 0 0 0\n' }).molecule).toEqual({ xyz: '1\n\nHe 0 0 0\n' });
    });
    it('ties a preview to one exact request', () => {
        expect(formSignature({ ...EMPTY_FORM, text: 'water' })).toBe(formSignature({ ...EMPTY_FORM, text: ' water ' }));
        expect(formSignature({ ...EMPTY_FORM, text: 'water' })).not.toBe(formSignature({ ...EMPTY_FORM, text: 'water', recipe: 'optimise' }));
    });
    it('says what is wrong before asking the server', () => {
        expect(formProblems(EMPTY_FORM)).toEqual([{ field: 'text', message: 'Type a name.' }]);
        expect(formProblems({ ...EMPTY_FORM, text: 'x'.repeat(201) })[0].message).toBe('At most 200 characters.');
        expect(formProblems({ ...EMPTY_FORM, text: 'water', charge: '1.5', multiplicity: '0' }).map(p => p.field)).toEqual(['charge', 'multiplicity']);
        expect(formProblems({ ...EMPTY_FORM, text: 'water', charge: '-1', multiplicity: '2' })).toEqual([]);
    });
});

describe('retrying a failed job', () => {
    it('rebuilds the request from the canonical atoms, so it hashes to the same key', () => {
        const failed = jobFixture('get_failed');
        expect(xyzFromCanonical(failed.job)).toBe('3\nretry\nH 0.00000 -0.75545 -0.47116\nH 0.00000 0.75545 -0.47116\nO 0.00000 0.00000 0.11779\n');
        expect(retryBody(failed)).toEqual({ recipe: 'optimise', molecule: { xyz: xyzFromCanonical(failed.job) }, charge: 0, multiplicity: 1, retry: true });
    });
});
```

```tsx
// tests/jobs/request_panel.test.tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RequestPanel, { RequestPanelProps } from '../../src/components/RequestPanel';
import { JobsApiError, SESSION_ENDED } from '../../src/jobs/api';
import type { PreviewResponse } from '../../src/jobs/api_types';
import { jobFixture, previewFixture } from './api_fixtures';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function setup(over: Partial<RequestPanelProps> = {}) {
    const props: RequestPanelProps = {
        target: 'local',
        preview: jest.fn(async () => previewFixture('preview_ok')),
        submit: jest.fn(async () => ({ status: 201, job: jobFixture('submit_created') })),
        onOpen: jest.fn(), onFollow: jest.fn(), sessionExpired: false, onSignIn: jest.fn(),
        ...over,
    };
    const utils = render(<RequestPanel {...props} />);
    return { props, ...utils };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('previewing', () => {
    it('previews a name: the structure PubChem resolved, its facts and the sizing decision', async () => {
        const { props } = setup();
        type('molecule', 'water');
        press('Preview');
        await flush();
        expect(props.preview).toHaveBeenCalledWith({ recipe: 'single', molecule: { name: 'water' } }, expect.any(AbortSignal));
        expect(screen.getByRole('img', { name: 'preview of the resolved structure, 3 atoms' })).toBeInTheDocument();
        const preview = screen.getByLabelText('preview');
        for (const text of ['H₂O', 'Electrons10', 'Basis functions58 (def2-TZVPD)', 'This Mac', 'remaining $8.80']) expect(preview).toHaveTextContent(text);
        expect(preview).toHaveTextContent(/sizing v\d+ prediction/);
        expect(screen.getByRole('link', { name: '962' })).toHaveAttribute('href', 'https://pubchem.ncbi.nlm.nih.gov/compound/962');
        expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });
    it('still shows what a refused molecule resolved to, with the reason, and cannot submit it', async () => {
        setup({ preview: jest.fn(async () => previewFixture('preview_refused')) });
        type('molecule', 'water');
        press('Preview');
        await flush();
        expect(screen.getByRole('img', { name: /3 atoms/ })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/^Monthly budget reached/);
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });
    it("shows the server's own message when nothing could be resolved", async () => {
        setup({ preview: jest.fn(async () => { throw new JobsApiError(422, 'unknown-compound', 'PubChem does not know "unobtainium"'); }) });
        type('molecule', 'unobtainium');
        press('Preview');
        await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('PubChem does not know "unobtainium"');
        expect(screen.queryByLabelText('preview')).toBeNull();
    });
    it('a preview that answers after the input changed is never shown', async () => {
        const first = deferred<PreviewResponse>();
        const second = deferred<PreviewResponse>();
        const preview = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        setup({ preview });
        type('molecule', 'water');
        press('Preview');
        type('molecule', 'ethanol');
        press('Preview');
        await act(async () => { second.resolve({ ...previewFixture('preview_ok'), name: 'Ethanol', formula: 'C2H6O' }); });
        await act(async () => { first.resolve(previewFixture('preview_ok')); });
        expect(screen.getByLabelText('preview')).toHaveTextContent('C₂H₆O');
        expect(screen.getByLabelText('preview')).not.toHaveTextContent('H₂O');
        expect((preview.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    });
    it('drops a preview as soon as the form changes, so Submit needs a new one', async () => {
        const pending = deferred<PreviewResponse>();
        setup({ preview: jest.fn().mockResolvedValueOnce(previewFixture('preview_ok')).mockReturnValueOnce(pending.promise) });
        type('molecule', 'water');
        press('Preview');
        await flush();
        fireEvent.click(screen.getByRole('radio', { name: /B · optimise first/ }));
        expect(screen.queryByLabelText('preview')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
        press('Preview');
        type('molecule', 'ethanol');
        await act(async () => { pending.resolve(previewFixture('preview_ok')); });
        expect(screen.queryByLabelText('preview')).toBeNull();
    });
    it('checks charge and multiplicity before asking the server', () => {
        setup();
        type('molecule', 'water');
        type('charge', '1.5');
        expect(screen.getByText('A whole number, e.g. 0, 1 or -1.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    });
});

describe('submitting', () => {
    it('sends exactly what was previewed, and follows the new job', async () => {
        const { props } = setup();
        type('molecule', 'water');
        press('Preview');
        await flush();
        press('Submit');
        await flush();
        expect(props.submit).toHaveBeenCalledWith({ recipe: 'single', molecule: { name: 'water' } });
        expect(props.onFollow).toHaveBeenCalledWith(jobFixture('submit_created'));
    });
    it('a known molecule: computed opens it, running follows it', async () => {
        const done = jobFixture('get_done');
        const { props, unmount } = setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), existing: done })) });
        type('molecule', 'water');
        press('Preview');
        await flush();
        press('Already computed — open it');
        expect(props.onOpen).toHaveBeenCalledWith(done.key);
        unmount();
        const running = setup({ preview: jest.fn(async () => previewFixture('preview_known')) });
        type('molecule', 'water');
        press('Preview');
        await flush();
        press('Already running — follow it');
        expect(running.props.onFollow).toHaveBeenCalledWith(expect.objectContaining({ status: 'RUNNING' }));
    });
    it('a failed molecule shows its error, and Retry posts retry: true for the same molecule', async () => {
        const failed = jobFixture('get_failed');
        const { props } = setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), existing: failed })) });
        type('molecule', 'water');
        press('Preview');
        await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('SCF did not converge');
        press('Retry');
        await flush();
        expect(props.submit).toHaveBeenCalledWith(expect.objectContaining({
            retry: true, recipe: 'optimise', charge: 0, multiplicity: 1,
            molecule: { xyz: expect.stringMatching(/^3\nretry\nH 0\.00000 -0\.75545 -0\.47116\n/) },
        }));
    });
    it('an ended session keeps the form, disables it and offers sign-in', () => {
        const { props, rerender } = setup();
        type('molecule', 'water');
        rerender(<RequestPanel {...props} sessionExpired />);
        expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(screen.getByLabelText('molecule')).toHaveValue('water');
        expect(screen.getByLabelText('molecule')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
        press('Sign in');
        expect(props.onSignIn).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/request_form.test.ts tests/jobs/request_panel.test.tsx`
Expected: FAIL, "Cannot find module '../../src/jobs/request_form'".

- [ ] **Step 3: Implement the form model and the preview hook**

```ts
// src/jobs/request_form.ts
import { elementFor } from '../elements';
import type { CanonicalJob, JobRequest, JobView, Recipe } from './api_types';

export type InputKind = 'name' | 'smiles' | 'xyz';
export interface RequestForm { kind: InputKind; text: string; recipe: Recipe; charge: string; multiplicity: string }
export const EMPTY_FORM: RequestForm = { kind: 'name', text: '', recipe: 'single', charge: '', multiplicity: '' };
export interface FormProblem { field: 'text' | 'charge' | 'multiplicity'; message: string }

const MAX_NAME = 200;          // tools/jobs/handlers.MAX_NAME
const MAX_XYZ_BYTES = 65536;   // tools/jobs/canonical.MAX_XYZ_BYTES
const INTEGER = /^[+-]?\d{1,3}$/;

/** The checks the server makes anyway, made here so a typo costs no round trip; the server stays the authority. */
export function formProblems(form: RequestForm): FormProblem[] {
    const problems: FormProblem[] = [];
    const text = form.text.trim();
    if (!text) {
        problems.push({ field: 'text', message: form.kind === 'xyz' ? 'Paste the XYZ coordinates.' : form.kind === 'name' ? 'Type a name.' : 'Type a SMILES string.' });
    } else if (form.kind !== 'xyz' && text.length > MAX_NAME) {
        problems.push({ field: 'text', message: `At most ${MAX_NAME} characters.` });
    } else if (form.kind === 'xyz' && new TextEncoder().encode(form.text).length > MAX_XYZ_BYTES) {
        problems.push({ field: 'text', message: 'The XYZ text is over 64 KB.' });
    }
    const charge = form.charge.trim();
    if (charge && !INTEGER.test(charge)) problems.push({ field: 'charge', message: 'A whole number, e.g. 0, 1 or -1.' });
    const multiplicity = form.multiplicity.trim();
    if (multiplicity && (!INTEGER.test(multiplicity) || Number(multiplicity) < 1)) {
        problems.push({ field: 'multiplicity', message: 'A whole number from 1: 1 singlet, 2 doublet, 3 triplet.' });
    }
    return problems;
}

export function requestBody(form: RequestForm): JobRequest {
    const text = form.kind === 'xyz' ? form.text : form.text.trim();
    const body: JobRequest = {
        recipe: form.recipe,
        molecule: form.kind === 'name' ? { name: text } : form.kind === 'smiles' ? { smiles: text } : { xyz: text },
    };
    if (form.charge.trim()) body.charge = Number(form.charge.trim());
    if (form.multiplicity.trim()) body.multiplicity = Number(form.multiplicity.trim());
    return body;
}

/** What a preview was asked for: Submit is offered only while the form still says exactly this. */
export const formSignature = (form: RequestForm): string => JSON.stringify(requestBody(form));

/** The canonical atoms are already rounded to 10⁻⁵ Å (spec §5.2); written back with five decimals they hash to the same key. */
export function xyzFromCanonical(job: CanonicalJob): string {
    const lines = job.molecule.atoms.map(([Z, x, y, z]) => `${elementFor(Z)?.symbol ?? Z} ${x.toFixed(5)} ${y.toFixed(5)} ${z.toFixed(5)}`);
    return `${lines.length}\nretry\n${lines.join('\n')}\n`;
}

/** Re-queues a FAILED job from its own record (spec §6.3): no need for the form that first asked for it. */
export function retryBody(view: JobView): JobRequest {
    return {
        recipe: view.recipe,
        molecule: { xyz: xyzFromCanonical(view.job) },
        charge: view.job.molecule.charge,
        multiplicity: view.job.molecule.multiplicity,
        retry: true,
    };
}
```

```ts
// src/jobs/usePreview.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobRequest, PreviewResponse } from './api_types';
import { formSignature, requestBody, RequestForm } from './request_form';

export type PreviewState =
    | { phase: 'idle' }
    | { phase: 'loading'; signature: string }
    | { phase: 'ready'; signature: string; preview: PreviewResponse }
    | { phase: 'failed'; signature: string; error: Error };

export type PreviewFn = (body: JobRequest, signal: AbortSignal) => Promise<PreviewResponse>;

/**
 * One preview at a time, for one exact request. Each run aborts the one
 * before; an answer is kept only if it belongs to the latest run, and the
 * panel shows it only while the form still reads exactly what was asked.
 * So a slow answer for "water" can never sit under "ethanol" typed since,
 * and Submit never sends anything but what was previewed.
 */
export function usePreview(previewFn: PreviewFn) {
    const [state, setState] = useState<PreviewState>({ phase: 'idle' });
    const latest = useRef(0);
    const controller = useRef<AbortController | null>(null);

    const run = useCallback((form: RequestForm) => {
        const id = ++latest.current;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const signature = formSignature(form);
        setState({ phase: 'loading', signature });
        previewFn(requestBody(form), abort.signal).then(
            preview => { if (latest.current === id) setState({ phase: 'ready', signature, preview }); },
            error => {
                if (latest.current === id && !abort.signal.aborted) {
                    setState({ phase: 'failed', signature, error: error instanceof Error ? error : new Error(String(error)) });
                }
            },
        );
    }, [previewFn]);

    const clear = useCallback(() => {
        latest.current += 1;
        controller.current?.abort();
        controller.current = null;
        setState({ phase: 'idle' });
    }, []);

    useEffect(() => () => {
        latest.current += 1;
        controller.current?.abort();
    }, []);

    return { state, run, clear };
}
```

- [ ] **Step 4: Implement the preview details and the panel**

```tsx
// src/components/PreviewDetails.tsx
import React from 'react';
import { Alert, Link, Typography } from '@mui/material';
import StructurePreview from './StructurePreview';
import { PUBCHEM_COMPOUND_URL } from './ProvenancePanel';
import { formatFormula } from '../molecules/catalogue';
import { formatDuration, formatGB, formatUsd, microsToUsd, money, predictionNote } from '../jobs/format';
import type { PreviewResponse, Sizing } from '../jobs/api_types';

const SPIN = ['', 'singlet', 'doublet', 'triplet', 'quartet', 'quintet', 'sextet'];
const signed = (charge: number) => (charge > 0 ? `+${charge}` : charge < 0 ? `−${-charge}` : '0');

function SizingFacts({ sizing, reservedUsd }: { sizing: Sizing; reservedUsd: number }) {
    const note = predictionNote(sizing.version);
    const capacity = sizing.capacity === 'local' ? 'This Mac (the size is the AWS worker it would need)'
        : sizing.capacity === 'spot' ? `Spot, up to ${sizing.attempts} attempts` : 'on-demand';
    return (
        <dl className="preview-facts" aria-label="sizing decision">
            <dt>Worker</dt><dd>{sizing.size} · {sizing.vcpu} vCPU · {sizing.memoryGB} GB · {capacity}</dd>
            <dt>Predicted</dt><dd>{formatDuration(sizing.predictedSeconds)}, {formatGB(sizing.predictedMemoryGB)} ({note})</dd>
            <dt>Time limit</dt><dd>{formatDuration(sizing.timeoutSeconds)}</dd>
            <dt>Cost</dt><dd>{money('reserved', reservedUsd)} if submitted; {money('projected', microsToUsd(sizing.predictedCostMicros))} ({note})</dd>
        </dl>
    );
}

/**
 * What a preview resolved -- drawn even when the sizing refuses the job,
 * because "is this the molecule I meant?" comes before "can I afford it?"
 * -- and then the sizing decision or the refusal's own reason (spec §9.2).
 */
const PreviewDetails: React.FC<{ preview: PreviewResponse }> = ({ preview }) => {
    const { geometrySource: source, decision, meter } = preview;
    return (
        <div className="preview-details" role="region" aria-label="preview">
            <StructurePreview atoms={preview.atoms} />
            <dl className="preview-facts">
                <dt>Resolved</dt>
                <dd>
                    {source.kind === 'pubchem'
                        ? <>{source.title}: PubChem CID <Link href={`${PUBCHEM_COMPOUND_URL}${source.cid}`} target="_blank" rel="noopener noreferrer">{source.cid}</Link>, 3D conformer retrieved {source.retrievedAt}</>
                        : 'pasted XYZ'}
                </dd>
                <dt>Formula</dt><dd>{formatFormula(preview.formula)}</dd>
                <dt>Charge</dt><dd>{signed(preview.charge)}</dd>
                <dt>Multiplicity</dt><dd>{preview.multiplicity}{SPIN[preview.multiplicity] ? ` (${SPIN[preview.multiplicity]})` : ''}</dd>
                <dt>Electrons</dt><dd>{preview.electronCount}</dd>
                <dt>Basis functions</dt><dd>{preview.basisFunctions} ({preview.job.method.basis})</dd>
            </dl>
            {decision.ok
                ? <SizingFacts sizing={decision.sizing} reservedUsd={decision.reservedUsd} />
                : <Alert severity="warning" role="alert">{decision.error.message}</Alert>}
            <Typography variant="body2" className="preview-meter">
                This month: {money('remaining', meter.remainingUsd)} of the {formatUsd(meter.capUsd)} compute cap
                {' '}({money('spent', meter.spentUsd)}, {money('reserved', meter.reservedUsd)}).
            </Typography>
        </div>
    );
};

export default PreviewDetails;
```

```tsx
// src/components/RequestPanel.tsx
import React, { useState } from 'react';
import {
    Alert, Button, FormControlLabel, Radio, RadioGroup, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import PreviewDetails from './PreviewDetails';
import { EMPTY_FORM, FormProblem, formProblems, formSignature, InputKind, requestBody, RequestForm, retryBody } from '../jobs/request_form';
import { PreviewFn, usePreview } from '../jobs/usePreview';
import { SESSION_ENDED } from '../jobs/api';
import { isActive, JobRequest, JobView, PreviewResponse, Recipe } from '../jobs/api_types';
import type { JobsTarget } from '../store/jobsSlice';

export interface RequestPanelProps {
    target: JobsTarget;
    preview: PreviewFn;
    submit(body: JobRequest): Promise<{ status: number; job: JobView }>;
    onOpen(key: string): void;
    onFollow(job: JobView): void;
    /** The session ended mid-session: keep the form, disable it, and offer sign-in (spec §9.5). */
    sessionExpired: boolean;
    onSignIn(): void;
}

/** Spec §8.2's recipes and their caveats, as the owner chooses between them. */
const RECIPES: Array<{ value: Recipe; label: string; detail: string }> = [
    { value: 'single', label: 'A · single point', detail: 'B3LYP/def2-TZVPD at the geometry given. Geometry is PubChem’s force-field conformer (or as pasted), not optimised.' },
    { value: 'optimise', label: 'B · optimise first', detail: 'B3LYP/def2-SVP optimisation (geomeTRIC), then B3LYP/def2-TZVPD. No dispersion correction and no frequency check: not confirmed to be a minimum.' },
];

interface SubmitAreaProps {
    preview: PreviewResponse;
    busy: boolean;
    onOpen(key: string): void;
    onFollow(job: JobView): void;
    onSubmit(): void;
    onRetry(job: JobView): void;
}

/** Spec §6.3 / §9.2: a known key is never resubmitted -- the button says what will happen instead. */
function SubmitArea({ preview, busy, onOpen, onFollow, onSubmit, onRetry }: SubmitAreaProps) {
    const existing = preview.existing;
    const allowed = preview.decision.ok && preview.generationEnabled;
    if (existing?.status === 'DONE') return <Button variant="contained" onClick={() => onOpen(existing.key)}>Already computed — open it</Button>;
    if (existing && isActive(existing.status)) return <Button variant="contained" onClick={() => onFollow(existing)}>Already running — follow it</Button>;
    return (
        <>
            {existing?.status === 'FAILED' && (
                <Alert severity="error" role="alert">This molecule failed before: {existing.error?.message ?? 'no reason was recorded'}</Alert>
            )}
            {!preview.generationEnabled && (
                <Alert severity="info">Generation is paused: nothing new can be submitted until it is resumed.</Alert>
            )}
            {existing?.status === 'FAILED'
                ? <Button variant="contained" disabled={busy || !allowed} onClick={() => onRetry(existing)}>Retry</Button>
                : <Button variant="contained" disabled={busy || !allowed} onClick={onSubmit}>Submit</Button>}
        </>
    );
}

/**
 * The owner's request (spec §9.2): name, SMILES or XYZ; recipe A or B;
 * optional charge and multiplicity; then Preview, which shows what was
 * resolved and how it would run, before anything is submitted or reserved.
 */
const RequestPanel: React.FC<RequestPanelProps> = ({ target, preview, submit, onOpen, onFollow, sessionExpired, onSignIn }) => {
    const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const { state, run, clear } = usePreview(preview);
    const problems = formProblems(form);
    const problem = (field: FormProblem['field']) => problems.find(p => p.field === field)?.message;
    // A preview belongs to the exact request it was asked for; anything typed since makes it stale.
    const current = state.phase !== 'idle' && state.signature === formSignature(form) ? state : null;

    const edit = (change: Partial<RequestForm>) => {
        setForm(previous => ({ ...previous, ...change }));
        clear();
        setSubmitError(null);
    };

    const send = async (body: JobRequest) => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            const { job } = await submit(body);
            if (job.status === 'DONE') onOpen(job.key);
            else onFollow(job);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : String(error));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="request-panel" aria-label="request a molecule">
            {sessionExpired && (
                <Alert severity="warning" role="alert" action={<Button size="small" color="inherit" onClick={onSignIn}>Sign in</Button>}>
                    {SESSION_ENDED}
                </Alert>
            )}
            <ToggleButtonGroup exclusive size="small" value={form.kind} aria-label="molecule given as" disabled={sessionExpired}
                onChange={(_event, kind: InputKind | null) => { if (kind) edit({ kind }); }}>
                <ToggleButton value="name">Name</ToggleButton>
                <ToggleButton value="smiles">SMILES</ToggleButton>
                <ToggleButton value="xyz">XYZ</ToggleButton>
            </ToggleButtonGroup>
            <TextField
                size="small" fullWidth multiline={form.kind === 'xyz'} minRows={form.kind === 'xyz' ? 4 : undefined}
                label={form.kind === 'name' ? 'Name' : form.kind === 'smiles' ? 'SMILES' : 'XYZ (Å)'}
                value={form.text} disabled={sessionExpired}
                onChange={event => edit({ text: event.target.value })}
                error={Boolean(form.text) && Boolean(problem('text'))}
                helperText={form.text ? problem('text') : undefined}
                slotProps={{ htmlInput: { 'aria-label': 'molecule', spellCheck: false, className: form.kind === 'xyz' ? 'mono' : undefined } }}
            />
            <RadioGroup value={form.recipe} aria-label="recipe" onChange={event => edit({ recipe: event.target.value as Recipe })}>
                {RECIPES.map(recipe => (
                    <FormControlLabel key={recipe.value} value={recipe.value} disabled={sessionExpired} control={<Radio size="small" />}
                        label={<><strong>{recipe.label}</strong><span className="recipe-detail">{recipe.detail}</span></>} />
                ))}
            </RadioGroup>
            <div className="request-optional">
                <TextField size="small" label="Charge" placeholder="0" value={form.charge} disabled={sessionExpired}
                    onChange={event => edit({ charge: event.target.value })}
                    error={Boolean(problem('charge'))} helperText={problem('charge') ?? 'optional'}
                    slotProps={{ htmlInput: { 'aria-label': 'charge', inputMode: 'numeric' } }} />
                <TextField size="small" label="Multiplicity" placeholder="lowest" value={form.multiplicity} disabled={sessionExpired}
                    onChange={event => edit({ multiplicity: event.target.value })}
                    error={Boolean(problem('multiplicity'))} helperText={problem('multiplicity') ?? 'optional'}
                    slotProps={{ htmlInput: { 'aria-label': 'multiplicity', inputMode: 'numeric' } }} />
            </div>
            <Typography variant="caption" className="molecule-caption">
                {target === 'local' ? 'Runs on This Mac: $0, timings tagged local.' : 'Runs on AWS, against this month’s compute cap.'}
            </Typography>
            <Button variant="outlined" disabled={sessionExpired || problems.length > 0 || state.phase === 'loading'} onClick={() => run(form)}>
                {state.phase === 'loading' ? 'Previewing…' : 'Preview'}
            </Button>
            {current?.phase === 'failed' && <Alert severity="error" role="alert">{current.error.message}</Alert>}
            {current?.phase === 'ready' && (
                <>
                    <PreviewDetails preview={current.preview} />
                    <SubmitArea preview={current.preview} busy={submitting || sessionExpired} onOpen={onOpen} onFollow={onFollow}
                        onSubmit={() => { void send(requestBody(form)); }} onRetry={job => { void send(retryBody(job)); }} />
                </>
            )}
            {submitError && <Alert severity="error" role="alert">{submitError}</Alert>}
        </section>
    );
};

export default RequestPanel;
```

The `Preview` button's accessible name comes from its text, `Preview`, while `StructurePreview`'s button is named `turn the preview`. The tests' exact-name queries rely on the two staying distinct.

Append to `src/style.css`:

```css
.request-panel, .job-status { display: flex; flex-direction: column; gap: 8px; font-size: 0.875rem; }
.recipe-detail { display: block; font-size: 0.75rem; opacity: 0.8; }
.request-optional { display: flex; gap: 8px; }
.preview-details { display: flex; flex-direction: column; gap: 6px; }
.preview-facts { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
.preview-facts dt { font-weight: 600; }
.preview-facts dd { margin: 0; font-variant-numeric: tabular-nums; }
.mono, .job-log-tail { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/jobs/request_form.test.ts tests/jobs/request_panel.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (4 + 10 tests); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/request_form.ts src/jobs/usePreview.ts src/components/PreviewDetails.tsx src/components/RequestPanel.tsx tests/jobs/request_form.test.ts tests/jobs/request_panel.test.tsx src/style.css
git commit -m "feat(jobs): request panel: name/SMILES/XYZ, recipe, preview of what resolved and how it would run, submit, open, follow, retry (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Live status

**Files:**
- Create: `src/components/JobStatusPanel.tsx`, `tests/jobs/job_status.test.tsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `JobView`, `JobStatus`, `isActive` (Task 2); the formats (Task 2); `useJobPolling`, `useNow`, `setJobsPollerForTests` (Task 8); `jobsReducer`, `jobUpdated` (Task 5); `formatFormula` (Phase 6).
- Produces:
  - `STATUS_TEXT: Record<JobStatus, string>`.
  - `<JobStatusView view error nowMs onOpen onRetry onClose busy? />`, a region named `job status`.
  - `<JobStatusPanel jobKey onOpen onRetry onClose />` (`onRetry(view): Promise<void>`). It polls through `useJobPolling`, and when it sees an active job become `DONE`, it calls `onOpen(jobKey)` once.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/jobs/job_status.test.tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import JobStatusPanel, { JobStatusView } from '../../src/components/JobStatusPanel';
import jobsReducer, { jobUpdated } from '../../src/store/jobsSlice';
import { setJobsPollerForTests } from '../../src/jobs/client';
import { jobFixture } from './api_fixtures';

const NOW = Date.parse('2026-10-10T12:01:05Z');
const KEY = jobFixture('get_running').key;
const noop = () => undefined;

afterEach(() => setJobsPollerForTests(null));

describe('JobStatusView', () => {
    it('shows the stage, the latest energy with its method, the time, the cost and the log tail', () => {
        render(<JobStatusView view={jobFixture('get_running')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        const panel = screen.getByRole('region', { name: 'job status' });
        expect(panel).toHaveTextContent('Running');
        expect(panel).toHaveTextContent('StageSCF (DIIS)');
        expect(panel).toHaveTextContent('Latest energy−76.461200 Ha (B3LYP/def2-TZVPD)');
        expect(panel).toHaveTextContent(/Elapsed1 min 00 s \(predicted .+, sizing v\d+ prediction\)/);
        expect(panel).toHaveTextContent('CostThis Mac — spent $0.00');
        expect(screen.getByRole('log', { name: 'log tail' })).toHaveTextContent('cycle= 8 E= -76.4612007');
    });
    it('on AWS, shows what is reserved until the job settles', () => {
        render(<JobStatusView view={{ ...jobFixture('get_running'), backend: 'aws', reservedUsd: 0.0894 }} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Costreserved $0.09');
    });
    it('counts from submission while the job waits for a worker', () => {
        const queued = { ...jobFixture('get_running'), status: 'QUEUED' as const, startedAt: null, stage: null, latestEnergyHartree: null, logTail: [] };
        render(<JobStatusView view={queued} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Waiting1 min 05 s');
        expect(screen.queryByRole('log')).toBeNull();
    });
    it('says why a job failed, and offers a retry', () => {
        const onRetry = jest.fn();
        render(<JobStatusView view={jobFixture('get_failed')} error={null} nowMs={NOW} onOpen={noop} onRetry={onRetry} onClose={noop} />);
        expect(screen.getByRole('alert')).toHaveTextContent('SCF did not converge');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledWith(jobFixture('get_failed'));
    });
    it('opens a finished job, and keeps the last view when a refresh fails', () => {
        const onOpen = jest.fn();
        render(<JobStatusView view={jobFixture('get_done')} error="offline" nowMs={NOW} onOpen={onOpen} onRetry={noop} onClose={noop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open in the viewer' }));
        expect(onOpen).toHaveBeenCalledWith(KEY);
        expect(screen.getByText('The status could not be refreshed: offline')).toBeInTheDocument();
    });
});

describe('JobStatusPanel', () => {
    function renderPanel() {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        const release = jest.fn();
        const watch = jest.fn(() => release);
        setJobsPollerForTests({ watch, restart: jest.fn() });
        const onOpen = jest.fn();
        const utils = render(
            <Provider store={store}>
                <JobStatusPanel jobKey={KEY} onOpen={onOpen} onRetry={jest.fn(async () => undefined)} onClose={jest.fn()} />
            </Provider>,
        );
        return { store, watch, release, onOpen, ...utils };
    }
    it('follows the job while mounted, and opens it in the viewer when it finishes', () => {
        const { store, watch, release, onOpen, unmount } = renderPanel();
        expect(watch).toHaveBeenCalledWith(KEY);
        act(() => { store.dispatch(jobUpdated(jobFixture('get_running'))); });
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen).toHaveBeenCalledWith(KEY);
        unmount();
        expect(release).toHaveBeenCalled();
    });
    it('does not jump to a job that had already finished when it was first seen', () => {
        const { store, onOpen } = renderPanel();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        expect(onOpen).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/job_status.test.tsx`
Expected: FAIL, "Cannot find module '../../src/components/JobStatusPanel'".

- [ ] **Step 3: Implement**

```tsx
// src/components/JobStatusPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Typography } from '@mui/material';
import { formatFormula } from '../molecules/catalogue';
import { elapsedSeconds, formatDuration, formatEnergy, methodOf, money, predictionNote } from '../jobs/format';
import { isActive, JobStatus, JobView } from '../jobs/api_types';
import { useJobPolling } from '../jobs/useJobPolling';
import { useNow } from '../jobs/useNow';

export const STATUS_TEXT: Record<JobStatus, string> = {
    QUEUED: 'Queued', STARTING: 'Starting a worker', RUNNING: 'Running', DONE: 'Done', FAILED: 'Failed',
};
const STATUS_COLOUR: Record<JobStatus, 'default' | 'info' | 'success' | 'error'> = {
    QUEUED: 'default', STARTING: 'info', RUNNING: 'info', DONE: 'success', FAILED: 'error',
};

export interface JobStatusViewProps {
    view: JobView | null;
    error: string | null;
    nowMs: number;
    onOpen(key: string): void;
    onRetry(view: JobView): void;
    onClose(): void;
    busy?: boolean;
}

function costText(view: JobView): string {
    if (view.backend === 'local') return `This Mac — ${money('spent', view.actualUsd ?? 0)}`;
    if (view.actualUsd === null) return money('reserved', view.reservedUsd);
    return `${money('spent', view.actualUsd)} (${money('reserved', view.reservedUsd)} released)`;
}

/** Spec §9.3: state, stage, latest energy, log tail, elapsed time and cost, for one job. */
export const JobStatusView: React.FC<JobStatusViewProps> = ({ view, error, nowMs, onOpen, onRetry, onClose, busy = false }) => {
    const logRef = useRef<HTMLPreElement>(null);
    const tail = view?.logTail.join('\n') ?? '';
    // The newest line is the one that matters: keep the tail scrolled to the bottom as it grows.
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [tail]);
    if (!view) {
        return (
            <section className="job-status" aria-label="job status">
                {error ? <Alert severity="error" role="alert">{error}</Alert> : <Typography variant="body2">Reading the job’s status…</Typography>}
                <Button size="small" onClick={onClose}>Stop following</Button>
            </section>
        );
    }
    const waiting = view.startedAt === null && isActive(view.status);
    return (
        <section className="job-status" aria-label="job status">
            <div className="job-status-head">
                <Typography variant="subtitle1">{view.name} · {formatFormula(view.formula)}</Typography>
                <Chip size="small" label={STATUS_TEXT[view.status]} color={STATUS_COLOUR[view.status]} />
            </div>
            <dl className="preview-facts">
                {view.stage && <><dt>Stage</dt><dd>{view.stage}</dd></>}
                {view.latestEnergyHartree !== null && (
                    <><dt>Latest energy</dt><dd>{formatEnergy(view.latestEnergyHartree, methodOf(view.job, view.stage))}</dd></>
                )}
                <dt>{waiting ? 'Waiting' : 'Elapsed'}</dt>
                <dd>{formatDuration(elapsedSeconds(view, nowMs))} (predicted {formatDuration(view.sizing.predictedSeconds)}, {predictionNote(view.sizing.version)})</dd>
                <dt>Cost</dt><dd>{costText(view)}</dd>
            </dl>
            {view.logTail.length > 0 && <pre ref={logRef} className="job-log-tail" role="log" aria-label="log tail">{tail}</pre>}
            {view.status === 'FAILED' && (
                <>
                    <Alert severity="error" role="alert">{view.error?.message ?? 'The job failed without a recorded reason.'}</Alert>
                    <Button variant="contained" disabled={busy} onClick={() => onRetry(view)}>Retry</Button>
                </>
            )}
            {view.status === 'DONE' && <Button variant="contained" onClick={() => onOpen(view.key)}>Open in the viewer</Button>}
            {error && <Alert severity="warning">The status could not be refreshed: {error}</Alert>}
            <Button size="small" onClick={onClose}>Stop following</Button>
        </section>
    );
};

interface JobStatusPanelProps {
    jobKey: string;
    onOpen(key: string): void;
    onRetry(view: JobView): Promise<void>;
    onClose(): void;
}

/** Follows one job; when it finishes while being watched, it opens in the viewer (spec §9.3). */
const JobStatusPanel: React.FC<JobStatusPanelProps> = ({ jobKey, onOpen, onRetry, onClose }) => {
    const { view, error } = useJobPolling(jobKey);
    const nowMs = useNow(view !== null && isActive(view.status));
    const [busy, setBusy] = useState(false);
    const previous = useRef<JobStatus | null>(null);
    useEffect(() => {
        const status = view?.status ?? null;
        if (status === 'DONE' && previous.current !== null && isActive(previous.current)) onOpen(jobKey);
        previous.current = status;
    }, [view?.status, jobKey, onOpen]);
    const retry = async (target: JobView) => {
        setBusy(true);
        try {
            await onRetry(target);
        } finally {
            setBusy(false);
        }
    };
    return <JobStatusView view={view} error={error} nowMs={nowMs} onOpen={onOpen} onRetry={target => { void retry(target); }} onClose={onClose} busy={busy} />;
};

export default JobStatusPanel;
```

Append to `src/style.css`:

```css
.job-status-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.job-log-tail { margin: 0; max-height: 160px; overflow: auto; padding: 6px 8px; background: #111; color: #e6e6e6; border-radius: 6px; font-size: 0.75rem; white-space: pre; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/jobs/job_status.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (7 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobStatusPanel.tsx tests/jobs/job_status.test.tsx src/style.css
git commit -m "feat(jobs): live job status: stage, energy with its method, log tail, elapsed time, cost; DONE opens the molecule (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Into the app — side panel, Explore tab, tier badge, sign-in

**Files:**
- Create: `src/components/OwnerBar.tsx`, `src/components/MoleculeJobsSection.tsx`, `src/jobs/useComputedList.ts`, `tests/jobs/owner_bar.test.tsx`, `src/App.jobs.test.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/App.molecules.test.tsx`, `src/style.css`

**Interfaces:**
- Consumes: everything from Tasks 2–11; `useAppDispatch`, `useAppSelector` (`src/store/hooks.ts`); Phase 6's App pieces (`moleculeNavProps`, the `.side-panel` `MoleculeNav`, the Explore tab's `MoleculeNav variant="body"`, `.molecule-legend-stack`, `MoleculePickerDialog`, `shareExportBar`).
- Produces:
  - `<OwnerBar dev target session isOwner onTarget onSignIn onSignOut showDashboardLink? />`. When `dev`, it shows a group named `where jobs run`. Otherwise it shows a link-button `Owner sign-in`, or the text `Owner sign-in: not configured in this build`, or `Signed in as … · Sign out`.
  - `<ConnectedOwnerBar showDashboardLink? />`, which reads `state.jobs` and is usable by both pages.
  - `<MoleculeJobsSection />`.
  - `useComputedList(active: boolean): void`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/jobs/owner_bar.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OwnerBar from '../../src/components/OwnerBar';
import type { OwnerSession } from '../../src/store/jobsSlice';

const SIGNED_OUT: OwnerSession = { configured: true, signedIn: false, email: null, expired: false, error: null };
const handlers = () => ({ onTarget: jest.fn(), onSignIn: jest.fn(), onSignOut: jest.fn() });

describe('OwnerBar', () => {
    it('is a discreet link when sign-in is configured, and says so when it is not', () => {
        const h = handlers();
        const { rerender } = render(<OwnerBar dev={false} target="aws" session={SIGNED_OUT} isOwner={false} {...h} />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(h.onSignIn).toHaveBeenCalled();
        rerender(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, configured: false }} isOwner={false} {...h} />);
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Owner sign-in' })).toBeNull();
    });
    it('names the signed-in owner, offers sign-out and the dashboard', () => {
        const h = handlers();
        render(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, signedIn: true, email: 'owner@example.com' }} isOwner {...h} showDashboardLink />);
        expect(screen.getByText(/Signed in as owner@example.com/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(h.onSignOut).toHaveBeenCalled();
        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin.html');
    });
    it('on the dev server, offers where jobs run', () => {
        const h = handlers();
        render(<OwnerBar dev target="local" session={SIGNED_OUT} isOwner {...h} />);
        fireEvent.click(screen.getByRole('button', { name: 'AWS' }));
        expect(h.onTarget).toHaveBeenCalledWith('aws');
        expect(screen.getByRole('group', { name: 'where jobs run' })).toBeInTheDocument();
    });
    it('says an ended session and a failed sign-in out loud', () => {
        render(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, expired: true, error: 'Sign-in did not complete: User cancelled' }} isOwner={false} {...handlers()} />);
        expect(screen.getByRole('status')).toHaveTextContent('Your owner session has ended. Sign in again to continue.');
        expect(screen.getByRole('alert')).toHaveTextContent('Sign-in did not complete: User cancelled');
    });
});
```

```tsx
// src/App.jobs.test.tsx
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from './store';
import { selectMolecule } from './store/moleculeSlice';
import { sessionChanged, sessionExpired } from './store/jobsSlice';
import { BUILD_ENV } from './jobs/build_env';
import { SESSION_ENDED } from './jobs/api';
import { currentMonth } from './jobs/format';
import { loadMoleculeIndex, loadMoleculeMeta, MoleculeLoadError, RESULT_NOT_FINISHED } from './molecules/loader';
import type { MoleculeProvenance } from './molecules/types';
import { resetBuildEnv } from '../tests/jobs/build_env_stub';
import { jobFixture, listFixture } from '../tests/jobs/api_fixtures';
import { LIBRARY_INDEX, waterMeta } from '../tests/molecules/fixtures';
import App from './App';

// The same module mocks as src/App.molecules.test.tsx (Phase 6): every
// import.meta.url worker module App reaches is replaced, the 3D view is a
// stub, and the molecule files come from fixtures. If Phase 6 shipped more
// mocks there, copy them here too.
jest.mock('./components/OrbitalViewer', () => ({ __esModule: true, default: () => <div data-testid="orbital-viewer" /> }));
jest.mock('./orbital_visualizer', () => ({ getOptimizedParameters: () => ({ rMax: 15, isoLevel: 0.005 }) }));
jest.mock('./workers/createAtomWorker', () => ({
    createAtomWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null })),
}));
jest.mock('./workers/createExportWorker', () => ({ createExportWorker: jest.fn() }));
jest.mock('./workers/createH2PlusCurveWorker', () => ({
    createH2PlusCurveWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null })),
}));
jest.mock('./molecules/loader', () => ({
    ...jest.requireActual('./molecules/loader'),
    loadMoleculeIndex: jest.fn(), loadMoleculeMeta: jest.fn(), loadDensityGrid: jest.fn(), loadBasis: jest.fn(),
}));
const mockApi = { preview: jest.fn(), submit: jest.fn(), get: jest.fn(), list: jest.fn(), costs: jest.fn() };
jest.mock('./jobs/client', () => ({
    jobsApi: () => mockApi,
    jobsPoller: () => ({ watch: () => () => undefined, restart: () => undefined }),
    chooseTarget: jest.fn(),
    bindJobsClient: jest.fn(),
}));

function installMatchMedia(matches: boolean) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({ media, matches, addEventListener: () => {}, removeEventListener: () => {} });
}
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const KEY = jobFixture('get_done').key;
const PROVENANCE: MoleculeProvenance = {
    jobKey: KEY, computeVersion: 1, recipe: 'single',
    geometrySource: { kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' },
    caveats: ['The geometry is not optimised.'], generatorCommit: 'abc1234', imageDigest: 'local', pyscfVersion: '2.8.0',
    sizingVersion: 1, size: 'S', capacity: 'local', wallSeconds: 70.2, costUsd: null,
};

async function enterMolecules(narrow: boolean) {
    installMatchMedia(narrow);
    const store = createAppStore();
    const utils = render(<Provider store={store}><App /></Provider>);
    if (narrow) fireEvent.click(screen.getByRole('tab', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
    await flush();
    return { store, ...utils };
}
async function show(store: ReturnType<typeof createAppStore>, id: string) {
    act(() => { store.dispatch(selectMolecule({ id })); });
    await flush();
}

beforeEach(() => {
    (loadMoleculeIndex as jest.Mock).mockResolvedValue(LIBRARY_INDEX);
    (loadMoleculeMeta as jest.Mock).mockImplementation(async (id: string) =>
        (id === KEY ? waterMeta({ id, tier: 'computed', provenance: PROVENANCE, references: [] }) : waterMeta({ id })));
    mockApi.list.mockResolvedValue(listFixture('list_done'));
    mockApi.get.mockResolvedValue(jobFixture('get_done'));
});
afterEach(() => { resetBuildEnv(); jest.clearAllMocks(); window.localStorage.clear(); });

describe('Molecules mode with on-demand molecules', () => {
    it('a visitor sees how a molecule was computed and its tier, but no request panel, no Computed category and no cost', async () => {
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('button', { name: 'How this was computed' })).toBeInTheDocument();
        expect(within(side).queryByRole('button', { name: 'Request a molecule' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Computed' })).toBeNull();
        expect(container.querySelector('.molecule-legend-stack')).toHaveTextContent('Validated');
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
        expect(mockApi.list).not.toHaveBeenCalled();
    });

    it("gives the owner on the dev server, running on this Mac, the request panel and this month's Computed category", async () => {
        BUILD_ENV.dev = true;
        const { container } = await enterMolecules(false);
        await flush();
        expect(mockApi.list).toHaveBeenCalledWith(currentMonth(), 'DONE');
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('button', { name: 'Request a molecule' })).toBeInTheDocument();
        fireEvent.click(within(side).getByRole('button', { name: 'Computed' }));
        expect(within(within(side).getByRole('list', { name: 'molecules' })).getAllByRole('button')).toHaveLength(1);
        expect(screen.getByRole('group', { name: 'where jobs run' })).toBeInTheDocument();
    });

    it("says a computed molecule is computed, on the canvas, and gives the owner its time and cost", async () => {
        BUILD_ENV.dev = true;
        const { store, container } = await enterMolecules(false);
        await show(store, KEY);
        expect(container.querySelector('.molecule-legend-stack')).toHaveTextContent('Computed');
        fireEvent.click(screen.getByRole('button', { name: 'How this was computed' }));
        await flush();
        expect(screen.getByText(/Cost: spent \$0\.00 \(This Mac\)\./)).toBeInTheDocument();
    });

    it('a link to a job that has not finished says so, and draws nothing', async () => {
        (loadMoleculeMeta as jest.Mock).mockRejectedValue(new MoleculeLoadError(RESULT_NOT_FINISHED));
        const { store, container } = await enterMolecules(false);
        await show(store, '0'.repeat(64));
        expect(screen.getByText(/This computed molecule has no finished result yet/)).toBeInTheDocument();
        expect(container.querySelector('.molecule-legend-stack')).toBeNull();
    });

    it("puts the owner's panels in the phone's Explore tab", async () => {
        BUILD_ENV.dev = true;
        const { store } = await enterMolecules(true);
        await show(store, 'h2o');
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const sheet = screen.getByRole('tabpanel');
        expect(within(sheet).getByRole('button', { name: 'How this was computed' })).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'Request a molecule' })).toBeInTheDocument();
    });

    it('says an ended session, with the way back, rather than hiding the request panel silently', async () => {
        BUILD_ENV.cognito = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };
        const { store, container } = await enterMolecules(false);
        act(() => { store.dispatch(sessionChanged({ signedIn: true, email: 'owner@example.com' })); });
        await flush();
        act(() => { store.dispatch(sessionExpired()); });
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(within(side).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });
});
```


- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/jobs/owner_bar.test.tsx src/App.jobs.test.tsx`
Expected: FAIL, "Cannot find module '../../src/components/OwnerBar'" (and App has no jobs pieces yet).

- [ ] **Step 3: Implement the owner bar, the section and the list hook**

```tsx
// src/components/OwnerBar.tsx
import React from 'react';
import { Link, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useSelector } from 'react-redux';
import { selectIsOwner, JobsState, JobsTarget, OwnerSession } from '../store/jobsSlice';
import { BUILD_ENV } from '../jobs/build_env';
import { SESSION_ENDED } from '../jobs/api';
import { chooseTarget } from '../jobs/client';
import { ownerAuth } from '../jobs/owner_session';

interface OwnerBarProps {
    dev: boolean;
    target: JobsTarget;
    session: OwnerSession;
    isOwner: boolean;
    onTarget(target: JobsTarget): void;
    onSignIn(): void;
    onSignOut(): void;
    /** The viewer links the dashboard; the dashboard itself does not. */
    showDashboardLink?: boolean;
}

/**
 * The owner's corner, under Share and Export (spec §9.5, §9.6): a discreet
 * sign-in link, and on the dev server the choice of where jobs run. Anyone
 * may see the link; it grants nothing without the owner's Cognito login.
 */
const OwnerBar: React.FC<OwnerBarProps> = ({ dev, target, session, isOwner, onTarget, onSignIn, onSignOut, showDashboardLink = false }) => (
    <div className="owner-bar">
        {dev && (
            <div className="owner-bar-target">
                <Typography variant="caption">Jobs run on</Typography>
                <ToggleButtonGroup exclusive size="small" value={target} aria-label="where jobs run"
                    onChange={(_event, next: JobsTarget | null) => { if (next) onTarget(next); }}>
                    <ToggleButton value="local">This Mac</ToggleButton>
                    <ToggleButton value="aws">AWS</ToggleButton>
                </ToggleButtonGroup>
            </div>
        )}
        {session.signedIn ? (
            <Typography variant="caption">
                Signed in as {session.email ?? 'the owner'} · <Link component="button" variant="caption" onClick={onSignOut}>Sign out</Link>
            </Typography>
        ) : session.configured ? (
            <Link component="button" variant="caption" className="owner-sign-in" onClick={onSignIn}>Owner sign-in</Link>
        ) : (
            <Typography variant="caption" className="owner-sign-in">Owner sign-in: not configured in this build</Typography>
        )}
        {isOwner && showDashboardLink && <Link href="/admin.html" variant="caption">Dashboard</Link>}
        {session.expired && !session.signedIn && <Typography variant="caption" role="status">{SESSION_ENDED}</Typography>}
        {session.error && <Typography variant="caption" role="alert">{session.error}</Typography>}
    </div>
);

/** The bar wired to whichever page's store holds `jobs` (the viewer's, or /admin.html's). */
export function ConnectedOwnerBar({ showDashboardLink = true }: { showDashboardLink?: boolean }) {
    const jobs = useSelector((state: { jobs: JobsState }) => state.jobs);
    const isOwner = useSelector(selectIsOwner);
    return (
        <OwnerBar
            dev={BUILD_ENV.dev} target={jobs.target} session={jobs.session} isOwner={isOwner} showDashboardLink={showDashboardLink}
            onTarget={chooseTarget}
            onSignIn={() => { void ownerAuth()?.signIn(`${window.location.pathname}${window.location.hash}`); }}
            onSignOut={() => { void ownerAuth()?.signOut(); }}
        />
    );
}

export default OwnerBar;
```

```ts
// src/jobs/useComputedList.ts
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { computedFailed, computedLoaded, selectIsOwner } from '../store/jobsSlice';
import { jobsApi } from './client';
import { currentMonth } from './format';

/**
 * The owner's Computed category (spec §9.1): this month's finished jobs,
 * read when Molecules mode opens and again whenever the list may have
 * changed (a job finished, the session or the backend changed). Nobody else
 * asks.
 */
export function useComputedList(active: boolean): void {
    const dispatch = useAppDispatch();
    const isOwner = useAppSelector(selectIsOwner);
    const nonce = useAppSelector(state => state.jobs.computed.nonce);
    const target = useAppSelector(state => state.jobs.target);
    useEffect(() => {
        if (!active || !isOwner) return undefined;
        let cancelled = false;
        const month = currentMonth();
        jobsApi().list(month, 'DONE').then(
            listing => { if (!cancelled) dispatch(computedLoaded({ month, jobs: listing.jobs })); },
            error => { if (!cancelled) dispatch(computedFailed(error instanceof Error ? error.message : String(error))); },
        );
        return () => { cancelled = true; };
    }, [active, isOwner, nonce, target, dispatch]);
}
```

```tsx
// src/components/MoleculeJobsSection.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectMolecule } from '../store/moleculeSlice';
import { followJob, jobFetchFailed, jobUpdated, refreshComputed, selectIsOwner } from '../store/jobsSlice';
import { tierOf } from '../molecules/types';
import { isJobKey } from '../molecules/job_paths';
import { jobsApi, jobsPoller } from '../jobs/client';
import { ownerAuth } from '../jobs/owner_session';
import { retryBody } from '../jobs/request_form';
import type { JobRequest, JobView } from '../jobs/api_types';
import ProvenancePanel from './ProvenancePanel';
import RequestPanel from './RequestPanel';
import JobStatusPanel from './JobStatusPanel';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const signIn = () => { void ownerAuth()?.signIn(`${window.location.pathname}${window.location.hash}`); };

/**
 * Molecules mode's job pieces, under the navigation card (the desktop side
 * panel and the phone's Explore tab, spec §9.7): how the molecule on screen
 * was computed, for everyone; for the owner, the request panel and the
 * followed job's status.
 */
const MoleculeJobsSection: React.FC = () => {
    const dispatch = useAppDispatch();
    const meta = useAppSelector(state => state.molecule.meta);
    const isOwner = useAppSelector(selectIsOwner);
    const jobs = useAppSelector(state => state.jobs);
    const [requestOpen, setRequestOpen] = useState(false);
    const computedKey = meta && tierOf(meta) === 'computed' && isJobKey(meta.id) ? meta.id : null;
    const ownerJob = computedKey && isOwner ? jobs.records[computedKey] ?? null : null;
    const ownerJobError = computedKey && isOwner ? jobs.recordErrors[computedKey] ?? null : null;

    // The owner's time and cost for the computed molecule on screen: one read, no polling -- it has finished.
    useEffect(() => {
        if (!computedKey || !isOwner || ownerJob || ownerJobError) return undefined;
        let cancelled = false;
        jobsApi().get(computedKey).then(
            view => { if (!cancelled) dispatch(jobUpdated(view)); },
            error => { if (!cancelled) dispatch(jobFetchFailed({ key: computedKey, message: message(error) })); },
        );
        return () => { cancelled = true; };
    }, [computedKey, isOwner, ownerJob, ownerJobError, dispatch]);

    const open = useCallback((key: string) => {
        dispatch(selectMolecule({ id: key }));
        dispatch(refreshComputed());
    }, [dispatch]);
    const follow = useCallback((job: JobView) => {
        dispatch(jobUpdated(job));
        dispatch(followJob(job.key));
        jobsPoller().restart(job.key);
    }, [dispatch]);
    const retry = useCallback(async (view: JobView) => {
        try {
            follow((await jobsApi().submit(retryBody(view))).job);
        } catch (error) {
            dispatch(jobFetchFailed({ key: view.key, message: message(error) }));
        }
    }, [dispatch, follow]);
    // jobsApi() reads the current target and session at call time, so these never go stale.
    const preview = useCallback((body: JobRequest, signal: AbortSignal) => jobsApi().preview(body, signal), []);
    const submit = useCallback((body: JobRequest) => jobsApi().submit(body), []);

    const expired = !isOwner && jobs.session.expired;
    return (
        <div className="molecule-jobs">
            {meta && <ProvenancePanel meta={meta} ownerJob={ownerJob} ownerJobError={ownerJobError} />}
            {isOwner && jobs.computed.error && (
                <Alert severity="warning">Could not list this month’s computed molecules: {jobs.computed.error}</Alert>
            )}
            {(isOwner || expired) && (
                <Accordion disableGutters className="request-accordion" expanded={requestOpen || expired}
                    onChange={(_event, value: boolean) => setRequestOpen(value)}>
                    <AccordionSummary aria-controls="request-body" id="request-head">Request a molecule</AccordionSummary>
                    <AccordionDetails id="request-body">
                        <RequestPanel target={jobs.target} preview={preview} submit={submit} onOpen={open} onFollow={follow}
                            sessionExpired={expired} onSignIn={signIn} />
                    </AccordionDetails>
                </Accordion>
            )}
            {isOwner && jobs.followedKey && (
                <JobStatusPanel jobKey={jobs.followedKey} onOpen={open} onRetry={retry} onClose={() => dispatch(followJob(null))} />
            )}
        </div>
    );
};

export default MoleculeJobsSection;
```

Append to `src/style.css`:

```css
.owner-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 8px; }
.owner-bar-target { display: flex; align-items: center; gap: 6px; }
.owner-sign-in { opacity: 0.8; }
```

- [ ] **Step 4: Wire them into the App**

Task 1 Step 3 confirmed these anchors exist. In `src/App.tsx`:

1. Imports:

```ts
import MoleculeJobsSection from './components/MoleculeJobsSection';
import TierBadge from './components/TierBadge';
import { ConnectedOwnerBar } from './components/OwnerBar';
import { useComputedList } from './jobs/useComputedList';
import { withComputed } from './jobs/computed';
import { selectIsOwner } from './store/jobsSlice';
import { tierOf } from './molecules/types';
```

2. Directly after Phase 6's `useMoleculeLoader(isMoleculeMode);`:

```ts
    // The owner's computed molecules join the picker as a Computed category; nobody else's picker changes.
    const isOwner = useAppSelector(selectIsOwner);
    const computedJobs = useAppSelector(state => state.jobs.computed.jobs);
    useComputedList(isMoleculeMode);
    const moleculeEntries = useMemo(
        () => withComputed(molecule.index, isOwner ? computedJobs : null),
        [molecule.index, isOwner, computedJobs],
    );
```

3. In `moleculeNavProps`, change `entries: molecule.index` to `entries: moleculeEntries`. In the phone's `<MoleculePickerDialog …>`, change `entries={molecule.index}` to `entries={moleculeEntries}`.
4. Directly after the `shareExportBar` `useMemo`:

```ts
    // The discreet owner sign-in sits with Share and Export in Molecules mode: the app's one menu row (spec §9.5).
    const controlsActions = useMemo(
        () => (isMoleculeMode ? <>{shareExportBar}<ConnectedOwnerBar /></> : shareExportBar),
        [isMoleculeMode, shareExportBar],
    );
```

   Then, in `<Controls …>`, change `actions={shareExportBar}` to `actions={controlsActions}`.
5. In the desktop `.side-panel`, change Phase 6's `{isMoleculeMode && <MoleculeNav {...moleculeNavProps} />}` to:

```tsx
                            {isMoleculeMode && (
                                <>
                                    <MoleculeNav {...moleculeNavProps} />
                                    <MoleculeJobsSection />
                                </>
                            )}
```

6. In the Molecules phone tabs, change the Explore tab's `content: <MoleculeNav {...moleculeNavProps} variant="body" />` to:

```tsx
            content: (
                <>
                    <MoleculeNav {...moleculeNavProps} variant="body" />
                    <MoleculeJobsSection />
                </>
            ),
```

7. In the canvas overlays, make the tier badge the first child of Phase 6's `<div className="molecule-legend-stack">`:

```tsx
                        <TierBadge tier={tierOf(molecule.meta)} />
```

The stack renders only when `molecule.meta` is loaded. That is right: a molecule that failed to load shows the error and no badge.

Phase 6's two App test files build their own stores, and App now reads `state.jobs`. Find each store with `grep -n "reducer: {" src/App.test.tsx src/App.molecules.test.tsx`. In each `reducer: { … }`, add `jobs: jobsReducer,`, with `import jobsReducer from './store/jobsSlice';` at the top of each file. Tests that use `createAppStore()` (for example `tests/app_combination_selection.test.tsx`) already have it.

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/jobs/owner_bar.test.tsx src/App.jobs.test.tsx src/App.molecules.test.tsx src/App.test.tsx tests/app_combination_selection.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (4 + 6 new tests, and the existing App suites unchanged); tsc clean.

- [ ] **Step 6: A real job end to end, through the dev proxy** (one foreground command, about 1–3 minutes)

The dev server must be up at :5391. This computes a real H₂O through the same `/api` path the UI uses. It saves the job record for the browser steps and checks that the result files are served, and served as text. If 6B-1's own verification already computed water, the submission answers `DONE` at once, which is just as good.

```bash
(cd tools && { ../tools/molecules/.venv/bin/python -m jobs.local_server > /tmp/jobs-server.log 2>&1 & PID=$!; sleep 2; \
  KEY=$(curl -s -X POST http://localhost:5391/api/v1/jobs -H 'Content-Type: application/json' -d '{"recipe":"single","molecule":{"name":"water"}}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["key"])'); echo "key $KEY"; \
  for i in $(seq 1 60); do S=$(curl -s http://localhost:5391/api/v1/jobs/$KEY | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"],d.get("stage"))'); echo "$S"; case "$S" in DONE*|FAILED*) break;; esac; sleep 5; done; \
  curl -s http://localhost:5391/api/v1/jobs/$KEY > /tmp/eov-6b2-job.json; \
  curl -s -o /dev/null -w 'done.json %{http_code}\n' http://localhost:5391/molecules/jobs/$KEY/done.json; \
  curl -s -o /dev/null -D - http://localhost:5391/molecules/jobs/$KEY/input.py | grep -i '^content-type'; \
  kill $PID; })
```

Expected: `key <64 hex>`; the statuses end in `DONE None`; `done.json 200`; `Content-Type: text/plain; charset=utf-8`. If the loop ends without `DONE`, read `/tmp/jobs-server.log` and the job's `attempts/1/output.log`.

- [ ] **Step 7: Live verification, desktop 1440×900**

Resize the Playwright window to 1440×900 for this step, and note its previous size to restore at the end. The job server is down now (Step 6 stopped it), so `/api` is answered in the browser. With `browser_run_code_unsafe`, install the stub below. Paste the JSON object from `/tmp/eov-6b2-job.json` as `JOB`. The stub answers from that real record and from 6B-1's response shapes.

```js
async (page) => {
  const JOB = /* the JSON object from /tmp/eov-6b2-job.json */;
  const meter = { month: JOB.month, capUsd: 8.8, spentUsd: 0, reservedUsd: 0, remainingUsd: 8.8 };
  const preview = { key: JOB.key, job: JOB.job, name: JOB.name, formula: JOB.formula, electronCount: JOB.electronCount,
    basisFunctions: JOB.basisFunctions, atoms: JOB.job.molecule.atoms, charge: JOB.job.molecule.charge,
    multiplicity: JOB.job.molecule.multiplicity, geometrySource: JOB.geometrySource,
    decision: { ok: true, sizing: JOB.sizing, reservedUsd: 0 }, existing: null, meter, generationEnabled: true };
  const queued = { ...JOB, status: 'QUEUED', startedAt: null, endedAt: null, stage: null, latestEnergyHartree: null,
    logTail: [], actual: null, actualUsd: null };
  const running = { ...queued, status: 'RUNNING', startedAt: JOB.submittedAt, stage: 'SCF (DIIS)', latestEnergyHartree: -76.4612,
    logTail: ['cycle= 7 E= -76.4611982', 'cycle= 8 E= -76.4612007'] };
  let submitted = false;
  let reads = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/jobs/preview') return json(200, preview);
    if (url.pathname === '/api/v1/jobs' && request.method() === 'POST') { submitted = true; return json(201, queued); }
    if (url.pathname === '/api/v1/jobs') return json(200, { month: JOB.month, jobs: [JOB] });
    if (url.pathname === `/api/v1/jobs/${JOB.key}`) {
      if (!submitted) return json(200, JOB);
      reads += 1;
      return json(200, reads === 1 ? queued : reads === 2 ? running : JOB);
    }
    return json(404, { error: { code: 'not-found', message: `stubbed: no route ${request.method()} ${url.pathname}` } });
  });
  return `stubbed /api from the real job ${JOB.key}`;
}
```

Then, with `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, `browser_network_requests` and `browser_console_messages`:

1. Open `http://localhost:5391/#mode=molecule&job=<KEY>`. Water is drawn from the real files. The canvas's bottom-centre stack starts with the **Computed** badge and its line. The side panel's "How this was computed" lists: method B3LYP/def2-TZVPD; geometry "PubChem CID 962 (Water) …, not optimised" with 962 linking to PubChem; the caveat; four file links; and "Owner only: … Cost: spent $0.00 (This Mac)."
2. Click `input.py`. A new tab shows the Python script as text. Close that tab.
3. The picker shows a **Computed** chip, and it lists Water.
4. Open "Request a molecule" and type `water`. Preview shows the dark SVG with three atoms, plus Formula H₂O, Electrons 10, the basis functions, "This Mac", "sizing vN prediction" and "remaining $8.80". Click Submit. The status panel goes Queued → Running (Stage SCF (DIIS), Latest energy −76.461200 Ha (B3LYP/def2-TZVPD), a monospace log tail) → Done, and the viewer opens Water by itself.
5. `browser_network_requests`: every `GET /api/v1/jobs/<key>` after Submit is about 5 s after the one before, never two at once.
6. Choose **AWS** under "Jobs run on". The request panel goes away, and the bar reads "Owner sign-in: not configured in this build". Choose **This Mac** again.
7. `browser_console_messages`: no errors.

Fix any defect found, add a test for it where one can be written, and rerun Step 5.

- [ ] **Step 8: Live verification, phone 390×844 (touch)**

Resize to 390×844 with touch emulation, and say so. Keep the stub.
1. Reload the share link. The Computed badge sits in the legend stack above the sheet's tab bar and clear of `.phone-header`.
2. The Explore tab shows the navigation card, then "How this was computed", then "Request a molecule". The preview SVG (220 px) fits the sheet without sideways scrolling, and a drag on it turns the structure.
3. View holds Share / Export and the owner bar.
4. No console errors.

Remove the stub (`browser_run_code_unsafe`: `async (page) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); }`), and restore the window to the size noted in Step 7.

- [ ] **Step 9: Commit**

```bash
git add src/components/OwnerBar.tsx src/components/MoleculeJobsSection.tsx src/jobs/useComputedList.ts src/App.tsx src/App.test.tsx src/App.molecules.test.tsx src/App.jobs.test.tsx tests/jobs/owner_bar.test.tsx src/style.css
git commit -m "feat(jobs): on-demand molecules in Molecules mode: provenance, request and status in the side panel and Explore tab, tier badge, owner sign-in (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 13: The dashboard's jobs table

**Files:**
- Create: `src/admin/jobs_table.ts`, `src/admin/JobsTable.tsx`, `tests/admin/jobs_table.test.tsx`

**Interfaces:**
- Consumes: `JobView`, `JobStatus`, `Recipe`, `WorkerSize` (Task 2); the formats (Task 2); `computedResultFiles`, `jobFileUrl` (Task 3); `STATUS_TEXT` (Task 11); `formatFormula` (Phase 6).
- Produces:
  - `jobs_table.ts`: `SortColumn = 'molecule' | 'recipe' | 'size' | 'capacity' | 'status' | 'submittedAt' | 'time' | 'memory' | 'cost'`; `SortDirection = 'asc' | 'desc'`; `interface JobFilters { status: JobStatus | 'all'; recipe: Recipe | 'all'; size: WorkerSize | 'all' }`; `NO_FILTERS`; `filterJobs(jobs, filters): JobView[]`; `sortValue(job, column): string | number | null`; `sortJobs(jobs, column, direction): JobView[]`; `interface FileLink { label: string; href: string }`; `jobLinks(job): FileLink[]`; `methodSummary(job): string`; `recentMonths(now: Date, count?: number): string[]`.
  - `<JobsTable jobs={JobView[]} />`: a plain MUI `Table` named `jobs`, inside `.admin-table-scroll`, with native selects labelled `Status`, `Recipe` and `Size`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/admin/jobs_table.test.tsx
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import JobsTable from '../../src/admin/JobsTable';
import { filterJobs, sortJobs, jobLinks, recentMonths, methodSummary, NO_FILTERS } from '../../src/admin/jobs_table';
import type { JobView } from '../../src/jobs/api_types';
import { jobFixture } from '../jobs/api_fixtures';

const done = jobFixture('get_done');
const failed = jobFixture('get_failed');
const running: JobView = { ...jobFixture('get_running'), key: 'b'.repeat(64), name: 'Ethanol', formula: 'C2H6O', submittedAt: '2026-10-10T12:05:00Z' };
const JOBS = [done, failed, running];

describe('jobs table logic', () => {
    it('filters by status, recipe and size', () => {
        expect(filterJobs(JOBS, { ...NO_FILTERS, status: 'FAILED' })).toEqual([failed]);
        expect(filterJobs(JOBS, { ...NO_FILTERS, recipe: 'optimise' })).toEqual([failed]);
        expect(filterJobs(JOBS, { ...NO_FILTERS, size: 'XL' })).toEqual([]);
        expect(filterJobs(JOBS, NO_FILTERS)).toHaveLength(3);
    });
    it('sorts either way, with missing actuals last in both', () => {
        expect(sortJobs(JOBS, 'time', 'asc')[0]).toBe(done);
        expect(sortJobs(JOBS, 'time', 'desc')[0]).toBe(done);
        expect(sortJobs(JOBS, 'molecule', 'asc').map(j => j.name)).toEqual(['Ethanol', 'H2O', 'Water']);
        expect(sortJobs(JOBS, 'submittedAt', 'desc')[0]).toBe(running);
    });
    it('links a finished job to its result and its files, and a failed one to its attempt', () => {
        expect(jobLinks(done)[0]).toEqual({ label: 'open', href: `/#mode=molecule&job=${done.key}` });
        expect(jobLinks(done).map(link => link.label)).toEqual(['open', 'input.py', 'output.log', 'geometry.xyz', 'job.json', 'timings.json']);
        expect(jobLinks(failed)).toEqual([
            { label: 'attempt 1 input.py', href: `/molecules/jobs/${failed.key}/attempts/1/input.py` },
            { label: 'attempt 1 output.log', href: `/molecules/jobs/${failed.key}/attempts/1/output.log` },
        ]);
        expect(jobLinks(running)).toEqual([]);
    });
    it('names the method, and lists the last months', () => {
        expect(methodSummary(failed)).toBe('B3LYP/def2-SVP → B3LYP/def2-TZVPD');
        expect(methodSummary(done)).toBe('B3LYP/def2-TZVPD');
        expect(recentMonths(new Date('2026-01-15T00:00:00Z'), 3)).toEqual(['2026-01', '2025-12', '2025-11']);
    });
});

describe('<JobsTable>', () => {
    const dataRows = () => within(screen.getByRole('table', { name: 'jobs' })).getAllByRole('row').slice(1);
    it('shows every job, newest first, in a table that scrolls sideways on its own', () => {
        const { container } = render(<JobsTable jobs={JOBS} />);
        expect(dataRows()).toHaveLength(3);
        expect(dataRows()[0]).toHaveTextContent('Ethanol');
        expect(container.querySelector('.admin-table-scroll table')).not.toBeNull();
    });
    it('sorts by a column when its header is clicked', () => {
        render(<JobsTable jobs={JOBS} />);
        fireEvent.click(screen.getByRole('button', { name: 'Time: predicted / actual' }));
        expect(dataRows()[0]).toHaveTextContent('Water');
        expect(dataRows()[0]).toHaveTextContent('1 min 10 s');
    });
    it('filters by status, and says why a job failed', () => {
        render(<JobsTable jobs={JOBS} />);
        fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'FAILED' } });
        expect(dataRows()).toHaveLength(1);
        expect(dataRows()[0]).toHaveTextContent('SCF did not converge');
        expect(screen.getByText('1 of 3 jobs')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/admin/jobs_table.test.tsx`
Expected: FAIL, "Cannot find module '../../src/admin/JobsTable'".

- [ ] **Step 3: Implement**

```ts
// src/admin/jobs_table.ts
import type { JobStatus, JobView, Recipe, WorkerSize } from '../jobs/api_types';
import { computedResultFiles, jobFileUrl } from '../molecules/job_paths';

export type SortColumn = 'molecule' | 'recipe' | 'size' | 'capacity' | 'status' | 'submittedAt' | 'time' | 'memory' | 'cost';
export type SortDirection = 'asc' | 'desc';
export interface JobFilters { status: JobStatus | 'all'; recipe: Recipe | 'all'; size: WorkerSize | 'all' }
export const NO_FILTERS: JobFilters = { status: 'all', recipe: 'all', size: 'all' };

const SIZE_ORDER: Record<WorkerSize, number> = { S: 0, M: 1, L: 2, XL: 3 };
const STATUS_ORDER: Record<JobStatus, number> = { QUEUED: 0, STARTING: 1, RUNNING: 2, DONE: 3, FAILED: 4 };

export function filterJobs(jobs: JobView[], filters: JobFilters): JobView[] {
    return jobs.filter(job => (filters.status === 'all' || job.status === filters.status)
        && (filters.recipe === 'all' || job.recipe === filters.recipe)
        && (filters.size === 'all' || job.sizing.size === filters.size));
}

/** Time, memory and cost sort by the actual figure: what the dashboard is for is setting it against the prediction beside it. */
export function sortValue(job: JobView, column: SortColumn): string | number | null {
    switch (column) {
        case 'molecule': return job.name.toLowerCase();
        case 'recipe': return job.recipe;
        case 'size': return SIZE_ORDER[job.sizing.size];
        case 'capacity': return job.sizing.capacity;
        case 'status': return STATUS_ORDER[job.status];
        case 'submittedAt': return job.submittedAt;
        case 'time': return job.actual?.wallSeconds ?? null;
        case 'memory': return job.actual?.peakMemoryGB ?? null;
        case 'cost': return job.actualUsd;
    }
}

/** A job still running has no actual time yet: missing values sort last in either direction, never first. */
export function sortJobs(jobs: JobView[], column: SortColumn, direction: SortDirection): JobView[] {
    const sign = direction === 'asc' ? 1 : -1;
    return [...jobs].sort((a, b) => {
        const [p, q] = [sortValue(a, column), sortValue(b, column)];
        if (p === null || q === null) return p === q ? 0 : p === null ? 1 : -1;
        return (p < q ? -1 : p > q ? 1 : 0) * sign;
    });
}

export interface FileLink { label: string; href: string }

/** A finished job's result and files (spec §5.3); a failed one leaves only its attempt's input and log. */
export function jobLinks(job: JobView): FileLink[] {
    if (job.status === 'DONE') {
        return [
            { label: 'open', href: `/#mode=molecule&job=${job.key}` },
            ...[...computedResultFiles(job.recipe), 'timings.json'].map(name => ({ label: name, href: jobFileUrl(job.key, name) })),
        ];
    }
    if (job.status === 'FAILED') {
        return ['input.py', 'output.log'].map(name => ({ label: `attempt ${job.attempt} ${name}`, href: jobFileUrl(job.key, `attempts/${job.attempt}/${name}`) }));
    }
    return [];
}

export function methodSummary(job: JobView): string {
    const { xc, basis, optimiseBasis } = job.job.method;
    return optimiseBasis ? `${xc}/${optimiseBasis} → ${xc}/${basis}` : `${xc}/${basis}`;
}

/** The month filter's choices, newest first, in UTC like the meter. */
export function recentMonths(now: Date, count = 12): string[] {
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
}
```

```tsx
// src/admin/JobsTable.tsx
import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography } from '@mui/material';
import { filterJobs, jobLinks, JobFilters, methodSummary, NO_FILTERS, SortColumn, SortDirection, sortJobs } from './jobs_table';
import { STATUS_TEXT } from '../components/JobStatusPanel';
import { formatFormula } from '../molecules/catalogue';
import { capacityLabel, formatDuration, formatGB, money, predictionNote, shortKey } from '../jobs/format';
import type { JobView } from '../jobs/api_types';

/** Spec §9.4's columns, in its order. */
const COLUMNS: Array<{ id: string; label: string; sort?: SortColumn }> = [
    { id: 'molecule', label: 'Molecule', sort: 'molecule' },
    { id: 'recipe', label: 'Recipe', sort: 'recipe' },
    { id: 'method', label: 'Method' },
    { id: 'size', label: 'Size', sort: 'size' },
    { id: 'capacity', label: 'Capacity', sort: 'capacity' },
    { id: 'status', label: 'Status · stage', sort: 'status' },
    { id: 'times', label: 'Queued / started / ended (UTC)', sort: 'submittedAt' },
    { id: 'time', label: 'Time: predicted / actual', sort: 'time' },
    { id: 'memory', label: 'Memory: predicted / actual', sort: 'memory' },
    { id: 'cost', label: 'Cost: reserved / actual', sort: 'cost' },
    { id: 'files', label: 'Result and files' },
];

const when = (iso: string | null) => (iso ? iso.replace('T', ' ').replace('Z', '') : '—');

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange(value: string): void }) {
    return (
        <TextField select size="small" label={label} value={value} onChange={event => onChange(event.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
            {options.map(option => <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>)}
        </TextField>
    );
}

function JobRow({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    const links = jobLinks(job);
    return (
        <TableRow hover>
            <TableCell>{job.name} · {formatFormula(job.formula)}<br /><code>{shortKey(job.key)}</code></TableCell>
            <TableCell>{job.recipe}</TableCell>
            <TableCell>{methodSummary(job)}</TableCell>
            <TableCell>{sizing.size} · {sizing.vcpu} vCPU · {sizing.memoryGB} GB</TableCell>
            <TableCell>{capacityLabel(sizing.capacity)}{job.attempt > 1 ? ` · attempt ${job.attempt}` : ''}</TableCell>
            <TableCell>
                {STATUS_TEXT[job.status]}{job.stage ? ` · ${job.stage}` : ''}
                {job.error && <><br /><span className="admin-error">{job.error.message}</span></>}
            </TableCell>
            <TableCell>{when(job.submittedAt)}<br />{when(job.startedAt)}<br />{when(job.endedAt)}</TableCell>
            <TableCell>
                {formatDuration(sizing.predictedSeconds)} / {actual ? formatDuration(actual.wallSeconds) : '—'}
                <br /><span className="admin-note">{predictionNote(sizing.version)}</span>
            </TableCell>
            <TableCell>{formatGB(sizing.predictedMemoryGB)} / {actual ? formatGB(actual.peakMemoryGB) : '—'}</TableCell>
            <TableCell>{money('reserved', job.reservedUsd)}<br />{job.actualUsd === null ? 'not settled' : money('spent', job.actualUsd)}</TableCell>
            <TableCell>
                {links.length === 0 ? '—' : links.map(link => (
                    <div key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></div>
                ))}
            </TableCell>
        </TableRow>
    );
}

/**
 * Every job of the month (spec §9.4), sortable and filterable, as a plain
 * MUI Table: a few dozen rows a month need no data grid. Desktop-first; on a
 * phone the table scrolls sideways inside its own box, not the page.
 */
const JobsTable: React.FC<{ jobs: JobView[] }> = ({ jobs }) => {
    const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
    const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({ column: 'submittedAt', direction: 'desc' });
    const rows = useMemo(() => sortJobs(filterJobs(jobs, filters), sort.column, sort.direction), [jobs, filters, sort]);
    const choose = (column: SortColumn) => setSort(s => ({ column, direction: s.column === column && s.direction === 'asc' ? 'desc' : 'asc' }));
    return (
        <section className="admin-jobs" aria-label="job list">
            <div className="admin-filters">
                <FilterSelect label="Status" value={filters.status} options={['all', 'QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED']}
                    onChange={status => setFilters(f => ({ ...f, status: status as JobFilters['status'] }))} />
                <FilterSelect label="Recipe" value={filters.recipe} options={['all', 'single', 'optimise']}
                    onChange={recipe => setFilters(f => ({ ...f, recipe: recipe as JobFilters['recipe'] }))} />
                <FilterSelect label="Size" value={filters.size} options={['all', 'S', 'M', 'L', 'XL']}
                    onChange={size => setFilters(f => ({ ...f, size: size as JobFilters['size'] }))} />
                <Typography variant="body2">{rows.length} of {jobs.length} jobs</Typography>
            </div>
            <TableContainer className="admin-table-scroll">
                <Table size="small" stickyHeader aria-label="jobs">
                    <TableHead>
                        <TableRow>
                            {COLUMNS.map(column => (
                                <TableCell key={column.id} sortDirection={column.sort && sort.column === column.sort ? sort.direction : false}>
                                    {column.sort ? (
                                        <TableSortLabel active={sort.column === column.sort} direction={sort.column === column.sort ? sort.direction : 'asc'}
                                            onClick={() => choose(column.sort!)}>
                                            {column.label}
                                        </TableSortLabel>
                                    ) : column.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map(job => <JobRow key={job.key} job={job} />)}
                        {rows.length === 0 && <TableRow><TableCell colSpan={COLUMNS.length}>No jobs match.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </TableContainer>
        </section>
    );
};

export default JobsTable;
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/admin/jobs_table.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (7 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/admin/jobs_table.ts src/admin/JobsTable.tsx tests/admin/jobs_table.test.tsx
git commit -m "feat(admin): the month's jobs as a plain sortable, filterable MUI table with predicted against actual (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The dashboard's cost panel

**Files:**
- Create: `src/admin/DailySpendChart.tsx`, `src/admin/CostPanel.tsx`, `tests/admin/cost_panel.test.tsx`

**Interfaces:**
- Consumes: `CostsResponse` (Task 2); `formatUsd`, `money` (Task 2); `costsFixture` (Task 2).
- Produces: `daysIn(month: string): number`; `<DailySpendChart month daily width />`, an SVG with role `img` named `daily spend in <month>`, with a `<rect class="daily-spend-bar">` and a `<title>` for each day that has spend; `<CostPanel costs={CostsResponse} width?={number} />`, a region named `costs`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/admin/cost_panel.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import CostPanel from '../../src/admin/CostPanel';
import { daysIn } from '../../src/admin/DailySpendChart';
import type { CostsResponse } from '../../src/jobs/api_types';
import { costsFixture } from '../jobs/api_fixtures';

const withSpend = (): CostsResponse => ({
    ...costsFixture(), spentUsd: 0.10298,
    daily: [{ date: '2026-10-09', usd: 0.1 }, { date: '2026-10-10', usd: 0.00298 }],
});

describe('CostPanel', () => {
    it('labels every figure: spent, reserved, remaining of the cap, projected', () => {
        render(<CostPanel costs={costsFixture()} />);
        const panel = screen.getByRole('region', { name: 'costs' });
        for (const text of ['spent $0.00', 'reserved $0.00', 'remaining $8.80 of the $8.80 cap', 'projected $0.00 by month end']) {
            expect(panel).toHaveTextContent(text);
        }
        expect(panel).toHaveTextContent('No spend settled yet this month.');
        expect(panel).toHaveTextContent(/AWS’s billed figure appears here once/);
    });
    it('draws a bar for each day with spend, each saying what it is', () => {
        const { container } = render(<CostPanel costs={withSpend()} />);
        expect(container.querySelectorAll('.daily-spend-bar')).toHaveLength(2);
        expect(Array.from(container.querySelectorAll('.daily-spend-bar title')).map(t => t.textContent))
            .toEqual(['2026-10-09: spent $0.10', '2026-10-10: spent $0.002980']);
        expect(screen.getByRole('img', { name: 'daily spend in 2026-10' })).toBeInTheDocument();
        expect(screen.getByText('Daily spend, 2026-10 (settled jobs; spent)')).toBeInTheDocument();
    });
    it("puts AWS's billed figure beside the meter, a day behind", () => {
        render(<CostPanel costs={{ ...withSpend(), billing: { usd: 0.12, through: '2026-10-09' } }} />);
        expect(screen.getByText('AWS billed (Cost Explorer, a day behind, as of 2026-10-09): billed $0.12; our meter: spent $0.10.')).toBeInTheDocument();
    });
    it('knows the length of each month', () => {
        expect([daysIn('2026-10'), daysIn('2026-02'), daysIn('2028-02')]).toEqual([31, 28, 29]);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/admin/cost_panel.test.tsx`
Expected: FAIL, "Cannot find module '../../src/admin/CostPanel'".

- [ ] **Step 3: Implement**

```tsx
// src/admin/DailySpendChart.tsx
import React from 'react';
import { Typography } from '@mui/material';
import { formatUsd, money } from '../jobs/format';

const HEIGHT = 120;
const PAD = { left: 56, right: 8, top: 10, bottom: 20 };

export function daysIn(month: string): number {
    const [year, mon] = month.split('-').map(Number);
    return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

interface DailySpendChartProps { month: string; daily: Array<{ date: string; usd: number }>; width: number }

/**
 * Spent per day of the month -- settled jobs only, the meter's own figures --
 * as a hand-drawn bar chart like the app's other plots (spec §9.4). Each bar
 * names its day and amount on hover.
 */
const DailySpendChart: React.FC<DailySpendChartProps> = ({ month, daily, width }) => {
    const days = daysIn(month);
    const byDay = new Map(daily.map(entry => [Number(entry.date.slice(8, 10)), entry.usd]));
    const max = Math.max(0, ...daily.map(entry => entry.usd));
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const slot = plotWidth / days;
    const base = PAD.top + plotHeight;
    const y = (usd: number) => PAD.top + plotHeight * (1 - (max > 0 ? usd / max : 0));
    return (
        <figure className="daily-spend">
            <figcaption className="daily-spend-title">Daily spend, {month} (settled jobs; spent)</figcaption>
            <svg width={width} height={HEIGHT} role="img" aria-label={`daily spend in ${month}`}>
                <line className="daily-spend-axis" x1={PAD.left} y1={base} x2={width - PAD.right} y2={base} />
                <text className="daily-spend-label" x={PAD.left - 4} y={PAD.top + 8} textAnchor="end">{formatUsd(max)}</text>
                <text className="daily-spend-label" x={PAD.left - 4} y={base} textAnchor="end">$0</text>
                {Array.from({ length: days }, (_, i) => i + 1).map(day => {
                    const usd = byDay.get(day) ?? 0;
                    if (usd <= 0) return null;
                    return (
                        <rect key={day} className="daily-spend-bar" x={PAD.left + (day - 1) * slot + slot * 0.15} width={slot * 0.7} y={y(usd)} height={base - y(usd)}>
                            <title>{`${month}-${String(day).padStart(2, '0')}: ${money('spent', usd)}`}</title>
                        </rect>
                    );
                })}
                <text className="daily-spend-label" x={PAD.left} y={HEIGHT - 4}>1</text>
                <text className="daily-spend-label" x={width - PAD.right} y={HEIGHT - 4} textAnchor="end">{days}</text>
            </svg>
            {max === 0 && <Typography variant="caption">No spend settled yet this month.</Typography>}
        </figure>
    );
};

export default DailySpendChart;
```

```tsx
// src/admin/CostPanel.tsx
import React from 'react';
import { LinearProgress, Typography } from '@mui/material';
import DailySpendChart from './DailySpendChart';
import { formatUsd, money } from '../jobs/format';
import type { CostsResponse } from '../jobs/api_types';

/**
 * The month's money (spec §9.4): our meter's spent, reserved and remaining
 * of the cap; the projection with its formula; the daily chart; and AWS's
 * own billed figure beside the meter once the billing job has run -- the
 * check that the prices the meter uses are right.
 */
const CostPanel: React.FC<{ costs: CostsResponse; width?: number }> = ({ costs, width = 420 }) => {
    const committed = costs.spentUsd + costs.reservedUsd;
    const share = costs.capUsd > 0 ? Math.min(100, (committed / costs.capUsd) * 100) : 100;
    return (
        <section className="cost-panel" aria-label="costs">
            <Typography variant="h6" component="h2">Compute, {costs.month}</Typography>
            <LinearProgress variant="determinate" value={share} aria-label="share of the monthly cap committed" />
            <ul className="cost-figures">
                <li>{money('spent', costs.spentUsd)}</li>
                <li>{money('reserved', costs.reservedUsd)} (the worst case of everything queued or running)</li>
                <li>{money('remaining', costs.remainingUsd)} of the {formatUsd(costs.capUsd)} cap</li>
                <li>{money('projected', costs.projectionUsd)} by month end: spent × days in the month ÷ days elapsed, plus the predicted cost of everything queued or running</li>
            </ul>
            <DailySpendChart month={costs.month} daily={costs.daily} width={width} />
            <Typography variant="body2" className="cost-billed">
                {costs.billing
                    ? `AWS billed (Cost Explorer, a day behind${costs.billing.through ? `, as of ${costs.billing.through}` : ''}): ${money('billed', costs.billing.usd)}; our meter: ${money('spent', costs.spentUsd)}.`
                    : 'AWS’s billed figure appears here once the AWS stack’s billing job has run (Phase 6B-3); until then only our meter is shown.'}
            </Typography>
            <Typography variant="caption">Prices retrieved {costs.pricesRetrieved} (Fargate, us-east-1, Linux/ARM).</Typography>
        </section>
    );
};

export default CostPanel;
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/admin/cost_panel.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (4 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/admin/DailySpendChart.tsx src/admin/CostPanel.tsx tests/admin/cost_panel.test.tsx
git commit -m "feat(admin): cost panel: spent, reserved, remaining, projection, a hand-drawn daily-spend chart, AWS's billed figure (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `/admin.html`, kept out of the main bundle

**Files:**
- Create: `public/admin.html`, `src/admin/main.tsx`, `src/admin/AdminApp.tsx`, `src/admin/admin.css`, `tools/check_admin_split.mjs`, `tests/admin/admin_app.test.tsx`, `tests/admin/bundle_boundary.test.ts`
- Modify: `vite.config.ts` (second entry and its alias), `package.json` (`check:admin-split` script)

**Interfaces:**
- Consumes: `jobsReducer`, `selectIsOwner`, `JobsState` (Task 5); `bindJobsClient`, `jobsApi` (Task 7); `startOwnerSession` (Task 7); `ConnectedOwnerBar` (Task 12); `JobsTable`, `recentMonths` (Task 13); `CostPanel` (Task 14); `currentMonth` (Task 2).
- Produces: `ADMIN_ROOT_CLASS = 'eov-admin-dashboard'` (also the build check's marker); `<AdminApp />`; the page `/admin.html`; `npm run check:admin-split`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/admin/bundle_boundary.test.ts
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const ADMIN = path.join(SRC, 'admin') + path.sep;
/** Relative specifiers in static imports and re-exports, dynamic import(), and worker `new URL('./x', import.meta.url)`. */
const SPECIFIER = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveModule(from: string, specifier: string): string | null {
    const base = path.resolve(path.dirname(from), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
        if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
    }
    return null;          // CSS, JSON and other assets cannot carry the dashboard's code
}

/** Every source file reachable from an entry through relative imports of any kind. */
function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
            const next = resolveModule(file, match[1] ?? match[2] ?? match[3]);
            if (next) queue.push(next);
        }
    }
    return seen;
}

describe('the dashboard stays out of the main bundle', () => {
    it('nothing reachable from src/main.tsx imports src/admin', () => {
        const files = [...reachable(path.join(SRC, 'main.tsx'))];
        expect(files.length).toBeGreaterThan(50);              // the walk really walked the app
        expect(files.filter(file => file.startsWith(ADMIN))).toEqual([]);
    });
    it('the dashboard entry reaches its own code, so the check above is not vacuous', () => {
        const files = reachable(path.join(SRC, 'admin', 'main.tsx'));
        for (const name of ['AdminApp.tsx', 'JobsTable.tsx', 'CostPanel.tsx']) expect(files.has(path.join(SRC, 'admin', name))).toBe(true);
    });
});
```

```tsx
// tests/admin/admin_app.test.tsx
import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { currentMonth } from '../../src/jobs/format';
import { recentMonths } from '../../src/admin/jobs_table';
import { resetBuildEnv } from '../jobs/build_env_stub';
import { costsFixture, listFixture } from '../jobs/api_fixtures';
import AdminApp from '../../src/admin/AdminApp';

const mockApi = { list: jest.fn(), costs: jest.fn(), get: jest.fn(), preview: jest.fn(), submit: jest.fn() };
jest.mock('../../src/jobs/client', () => ({ jobsApi: () => mockApi, chooseTarget: jest.fn(), bindJobsClient: jest.fn() }));

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
function renderAdmin() {
    const store = configureStore({ reducer: { jobs: jobsReducer } });
    render(<Provider store={store}><AdminApp /></Provider>);
}

beforeEach(() => {
    mockApi.list.mockResolvedValue(listFixture('list_all'));
    mockApi.costs.mockResolvedValue(costsFixture());
});
afterEach(() => { resetBuildEnv(); jest.clearAllMocks(); window.localStorage.clear(); });

describe('/admin.html', () => {
    it('asks a visitor to sign in, and reads nothing', async () => {
        renderAdmin();
        await flush();
        expect(screen.getByText('Sign in as the owner to see jobs and costs.')).toBeInTheDocument();
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
        expect(mockApi.list).not.toHaveBeenCalled();
    });
    it("shows the owner this month's jobs and costs", async () => {
        BUILD_ENV.dev = true;
        renderAdmin();
        await flush();
        expect(mockApi.list).toHaveBeenCalledWith(currentMonth());
        expect(mockApi.costs).toHaveBeenCalledWith(currentMonth());
        expect(screen.getByRole('heading', { name: 'Owner dashboard' })).toBeInTheDocument();
        expect(within(screen.getByRole('table', { name: 'jobs' })).getAllByRole('row')).toHaveLength(3);
        expect(screen.getByRole('region', { name: 'costs' })).toBeInTheDocument();
    });
    it('reads another month when asked, and says when the API fails', async () => {
        BUILD_ENV.dev = true;
        renderAdmin();
        await flush();
        const previous = recentMonths(new Date())[1];
        mockApi.list.mockRejectedValueOnce(new Error('The job server on this Mac is not answering.'));
        fireEvent.change(screen.getByLabelText('Month'), { target: { value: previous } });
        await flush();
        expect(mockApi.list).toHaveBeenLastCalledWith(previous);
        expect(screen.getByRole('alert')).toHaveTextContent('The job server on this Mac is not answering.');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/admin/bundle_boundary.test.ts tests/admin/admin_app.test.tsx`
Expected: FAIL. The boundary walk cannot read `src/admin/main.tsx` (ENOENT), and `AdminApp` is not found.

- [ ] **Step 3: Implement the page and its entry**

```html
<!-- public/admin.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/electron-icon.svg" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>Orbital Viewer — owner dashboard</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/admin.tsx"></script>
</body>
</html>
```

```tsx
// src/admin/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../store/jobsSlice';
import { bindJobsClient } from '../jobs/client';
import { startOwnerSession } from '../jobs/owner_session';
import AdminApp from './AdminApp';
import './admin.css';

// Its own small store: the dashboard needs the jobs state and nothing of the viewer's.
const store = configureStore({ reducer: { jobs: jobsReducer } });
bindJobsClient(store);
void startOwnerSession(store.dispatch, '/admin.html');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <AdminApp />
    </Provider>
  </React.StrictMode>,
);
```

```tsx
// src/admin/AdminApp.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, CssBaseline, TextField, ThemeProvider, Typography, createTheme } from '@mui/material';
import { useSelector } from 'react-redux';
import JobsTable from './JobsTable';
import CostPanel from './CostPanel';
import { recentMonths } from './jobs_table';
import { ConnectedOwnerBar } from '../components/OwnerBar';
import { jobsApi } from '../jobs/client';
import { currentMonth } from '../jobs/format';
import { selectIsOwner, JobsState } from '../store/jobsSlice';
import type { CostsResponse, JobView } from '../jobs/api_types';

/** The root's class, and the string tools/check_admin_split.mjs looks for in the main bundle. */
export const ADMIN_ROOT_CLASS = 'eov-admin-dashboard';

// A light page for reading tables, unlike the viewer's dark canvas theme.
const adminTheme = createTheme({ palette: { primary: { main: '#1565c0' } } });

/**
 * The owner's dashboard (spec §9.4): every job of a month with predicted
 * against actual, and what the month has cost. Behind the same sign-in as
 * the viewer; a visitor gets a sign-in prompt and nothing is fetched.
 */
const AdminApp: React.FC = () => {
    const isOwner = useSelector(selectIsOwner);
    const target = useSelector((state: { jobs: JobsState }) => state.jobs.target);
    const months = useMemo(() => recentMonths(new Date()), []);
    const [month, setMonth] = useState(() => currentMonth());
    const [reload, setReload] = useState(0);
    const [data, setData] = useState<{ jobs: JobView[]; costs: CostsResponse } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOwner) {
            setData(null);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        const api = jobsApi();
        Promise.all([api.list(month), api.costs(month)]).then(
            ([listing, costs]) => { if (!cancelled) { setData({ jobs: listing.jobs, costs }); setLoading(false); } },
            failure => { if (!cancelled) { setError(failure instanceof Error ? failure.message : String(failure)); setData(null); setLoading(false); } },
        );
        return () => { cancelled = true; };
    }, [isOwner, month, target, reload]);

    return (
        <ThemeProvider theme={adminTheme}>
            <CssBaseline />
            <main className={ADMIN_ROOT_CLASS}>
                <header className="admin-header">
                    <Typography variant="h5" component="h1">Owner dashboard</Typography>
                    <a href="/">Back to the viewer</a>
                    <ConnectedOwnerBar showDashboardLink={false} />
                </header>
                {!isOwner ? (
                    <Alert severity="info">Sign in as the owner to see jobs and costs.</Alert>
                ) : (
                    <>
                        <div className="admin-controls">
                            <TextField select size="small" label="Month" value={month} onChange={event => setMonth(event.target.value)}
                                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </TextField>
                            <Button size="small" disabled={loading} onClick={() => setReload(n => n + 1)}>{loading ? 'Loading…' : 'Reload'}</Button>
                        </div>
                        {error && <Alert severity="error" role="alert">{error}</Alert>}
                        {data && (
                            <div className="admin-grid">
                                <JobsTable jobs={data.jobs} />
                                <CostPanel costs={data.costs} />
                            </div>
                        )}
                    </>
                )}
            </main>
        </ThemeProvider>
    );
};

export default AdminApp;
```

```css
/* src/admin/admin.css — the owner's dashboard: a scrolling document, unlike the viewer's fixed full-window canvas. */
html, body, #root { margin: 0; min-height: 100%; font-family: 'Roboto', sans-serif; }
.eov-admin-dashboard { max-width: 1440px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
.admin-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px; margin-bottom: 12px; }
.admin-controls, .admin-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 8px 0; }
.admin-grid { display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: 16px; align-items: start; }
@media (max-width: 1100px) { .admin-grid { grid-template-columns: minmax(0, 1fr); } }
/* A phone scrolls the table inside its own box, never the page (spec §9.7). */
.admin-table-scroll { overflow-x: auto; max-width: 100%; }
.admin-table-scroll table { min-width: 1200px; }
.admin-table-scroll td, .admin-table-scroll th { white-space: nowrap; vertical-align: top; }
.admin-note { font-size: 0.75rem; opacity: 0.7; }
.admin-error { color: #b71c1c; white-space: normal; }
.cost-figures { margin: 8px 0; padding-left: 18px; }
.daily-spend { margin: 8px 0; }
.daily-spend-title { font-size: 0.875rem; font-weight: 500; }
.daily-spend svg { display: block; max-width: 100%; }
.daily-spend-bar { fill: #1565c0; }
.daily-spend-axis { stroke: #888; }
.daily-spend-label { font-size: 10px; fill: #555; }
.owner-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
```

```js
// tools/check_admin_split.mjs
// Proves on a real build that the owner dashboard's code ships only with
// /admin.html: walks every JS chunk each page can load (its <script> and
// modulepreload tags, then every chunk those import, statically or lazily,
// and worker URLs) and looks for strings only the dashboard contains.
//   npm run build && npm run check:admin-split
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const MARKERS = ['eov-admin-dashboard', 'Daily spend'];
const CHUNK = /["'`(](?:\.\/|\/?assets\/)([\w.-]+\.js)["'`)]/g;

function chunksOf(page) {
  const html = readFileSync(join(dist, page), 'utf8');
  const queue = [...html.matchAll(/(?:src|href)="\/assets\/([\w.-]+\.js)"/g)].map(m => m[1]);
  const seen = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    const file = join(dist, 'assets', name);
    if (!existsSync(file)) continue;
    seen.add(name);
    for (const m of readFileSync(file, 'utf8').matchAll(CHUNK)) queue.push(m[1]);
  }
  return seen;
}

function markersIn(chunks) {
  const found = new Set();
  for (const name of chunks) {
    const text = readFileSync(join(dist, 'assets', name), 'utf8');
    for (const marker of MARKERS) if (text.includes(marker)) found.add(marker);
  }
  return found;
}

const main = chunksOf('index.html');
const admin = chunksOf('admin.html');
console.log(`main page: ${main.size} chunks; dashboard: ${admin.size} chunks`);
const present = markersIn(admin);
if (present.size !== MARKERS.length) {
  console.error(`check is blind: the dashboard's own chunks lack ${MARKERS.filter(m => !present.has(m)).join(', ')}`);
  process.exit(1);
}
const leaked = markersIn(main);
if (leaked.size) {
  console.error(`dashboard code in the main bundle: ${[...leaked].join(', ')}`);
  process.exit(1);
}
console.log('admin split ok: no dashboard code reachable from index.html');
```

In `vite.config.ts`:
1. Add a second alias beside the `/main.tsx` one: `{ find: /^\/admin.tsx$/, replacement: resolve(__dirname, 'src/admin/main.tsx') },`.
2. Replace `build: { … }` with:

```ts
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      // Two pages: the viewer, and the owner's dashboard (spec §9.4), each
      // with its own entry chunk, so the dashboard's code never ships to a
      // visitor (tools/check_admin_split.mjs proves it on every build).
      input: {
        main: resolve(__dirname, 'public/index.html'),
        admin: resolve(__dirname, 'public/admin.html'),
      },
    },
  },
```

In `package.json` `scripts`, add `"check:admin-split": "node tools/check_admin_split.mjs dist"`.

- [ ] **Step 4: Run to verify they pass, and check a real build**

Run: `npx jest tests/admin && npx tsc --noEmit -p .`
Expected: PASS (2 + 3 new tests, and Tasks 13–14's); tsc clean.

Run: `npm run build && ls dist/index.html dist/admin.html && npm run check:admin-split`
Expected: the build succeeds, both pages are listed, and the check prints `main page: N chunks; dashboard: M chunks` then `admin split ok: no dashboard code reachable from index.html`. If it says "check is blind", Vite renamed or inlined something the check cannot follow. Fix the check, not the markers.

- [ ] **Step 5: Live verification, desktop 1440×900, then phone 390×844**

Resize to 1440×900 for this step, and say so. Stub `/api` with `browser_run_code_unsafe`, pasting `/tmp/eov-6b2-job.json` (Task 12 Step 6) as `JOB`:

```js
async (page) => {
  const JOB = /* the JSON object from /tmp/eov-6b2-job.json */;
  const costs = { month: JOB.month, capUsd: 8.8, spentUsd: 0.10298, reservedUsd: 0.0894, remainingUsd: 8.60762, projectionUsd: 0.41,
    daily: [{ date: `${JOB.month}-03`, usd: 0.1 }, { date: `${JOB.month}-05`, usd: 0.00298 }],
    billing: { usd: 0.09, through: `${JOB.month}-04` }, pricesRetrieved: '2026-10-04' };
  const failed = { ...JOB, key: 'f'.repeat(64), status: 'FAILED', recipe: 'optimise', actual: null, actualUsd: 0,
    error: { code: 'scf-not-converged', message: 'SCF did not converge (DIIS, level shift 0.3 Ha, second-order)' },
    job: { ...JOB.job, recipe: 'optimise', method: { ...JOB.job.method, optimiseBasis: 'def2-SVP' } } };
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const body = url.pathname === '/api/v1/costs' ? costs
      : url.pathname === '/api/v1/jobs' ? { month: JOB.month, jobs: [JOB, failed] }
      : { error: { code: 'not-found', message: `stubbed: no route ${url.pathname}` } };
    return route.fulfill({ status: 'error' in body ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return 'stubbed';
}
```

1. Open `http://localhost:5391/admin.html`. The page shows "Owner dashboard", "Back to the viewer", the owner bar with "Jobs run on" (This Mac) and no Dashboard link, and the month select at the current month. The table has two rows. Water's row shows Size S, This Mac, Done, three UTC times, "predicted / 1 min 10 s", and links open, input.py … timings.json. The failed row shows "B3LYP/def2-SVP → B3LYP/def2-TZVPD", Failed, the SCF message, and attempt 1 links. The cost panel shows spent $0.10, reserved $0.09, remaining $8.61 of the $8.80 cap, projected $0.41 with its formula, two bars (hover shows "…-03: spent $0.10"), and "AWS billed (Cost Explorer, a day behind, as of …-04): billed $0.09; our meter: spent $0.10."
2. Click the "Time: predicted / actual" header: Water stays first, and the failed row (no actual) goes last both ways. Set Status to FAILED: one row, "1 of 2 jobs".
3. Click "open" on Water's row: a viewer tab opens the computed molecule. Close it.
4. Resize to 390×844 with touch emulation, and say so. `browser_evaluate` with `() => ({ page: document.documentElement.scrollWidth <= window.innerWidth, table: (el => el.scrollWidth > el.clientWidth)(document.querySelector('.admin-table-scroll')) })` must give `{ page: true, table: true }`. Swipe the table sideways: it scrolls inside its box.
5. `browser_console_messages`: no errors. Remove the stub (`page.unrouteAll({ behavior: 'ignoreErrors' })`), and restore the window size noted at the start.

- [ ] **Step 6: Commit**

```bash
git add public/admin.html src/admin/main.tsx src/admin/AdminApp.tsx src/admin/admin.css tools/check_admin_split.mjs tests/admin/admin_app.test.tsx tests/admin/bundle_boundary.test.ts vite.config.ts package.json
git commit -m "feat(admin): /admin.html as a second Vite entry behind the owner sign-in, proven out of the main bundle (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Final checks, a visitor's sweep, and the docs

**Files:**
- Modify: `README.md`, `docs/HANDOFF.md`

**Interfaces:**
- Consumes: the whole phase.
- Produces: a verified, documented interface, and the list of what 6B-3 must supply.

- [ ] **Step 1: Full checks** (each in the foreground)

Run: `npx jest`
Expected: all suites pass (a few minutes; this is the first full run of this phase).

Run: `npx tsc --noEmit -p . && npm run build && npm run check:admin-split`
Expected: tsc clean; the build succeeds; `admin split ok: no dashboard code reachable from index.html`.

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`
Expected: PASS. This phase changed nothing there; this confirms the fixtures' source is still green.

Run: `tools/molecules/.venv/bin/python tests/jobs/make_api_fixtures.py > /dev/null && git diff --exit-code tests/jobs/fixtures`
Expected: no diff, so the client's fixtures still match what 6B-1's handlers write. A diff means 6B-1 changed shape since Task 1. Update `src/jobs/api_types.ts` and the affected tests in a separate commit, and report it.

- [ ] **Step 2: A visitor's sweep at 1440×900**

Resize for this step, and say so. In a fresh tab, make the page a visitor's: `browser_evaluate` `() => localStorage.setItem('eov.jobs.target', 'aws')`. On the dev server, AWS while signed out is not the owner, and no `/api` call is made.
1. Open `http://localhost:5391/#mode=molecule&job=<KEY>` (the key from Task 12 Step 6). Water renders with the **Computed** badge. "How this was computed" shows method, geometry, caveats and file links, and no "Owner only" line. There is no "Request a molecule", no Computed chip, and the owner bar reads "Owner sign-in: not configured in this build".
2. Open `http://localhost:5391/#mode=molecule&job=0000000000000000000000000000000000000000000000000000000000000000`. The page shows "Could not load “…”: This computed molecule has no finished result yet: …", and no structure, surface or badge from the previous molecule.
3. `browser_console_messages`: the only error-level entry allowed is the failed `done.json` request in item 2, which the browser logs on its own (404 from the dev server, or 403 through the CloudFront proxy). Anything else is a defect.
4. `browser_evaluate` `() => localStorage.removeItem('eov.jobs.target')`, and restore the window size.

- [ ] **Step 3: Docs**

`README.md` gets a section "Computed molecules (on request, owner only)". It must cover:
- the two tiers, the badge on every molecule, and what "computed" promises (same method, not benchmarked);
- that a computed molecule's link (`#mode=molecule&job=<key>`) opens for anyone, and what it shows before the job has finished;
- "How this was computed", and the files it links;
- for the owner on the dev server: start the local job server (`cd tools && ../tools/molecules/.venv/bin/python -m jobs.local_server`), choose This Mac, then request, preview, submit and follow;
- `/admin.html`;
- the build-time settings `VITE_JOBS_API_URL`, `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID` and `VITE_COGNITO_DOMAIN`, and `JOBS_AWS_API_URL` for the dev proxy.

`docs/HANDOFF.md` gets a section "Phase 6B-2 — the interface". It must cover:
- **What shipped:** one line each for the computed tier and `job` URL key, provenance panel, request panel and preview, live status, owner sign-in, the where-jobs-run choice, and `/admin.html` with its split check.
- **Rulings made in this plan:** the six from "Design decisions" (the id carries the tier; SVG preview; H–Kr radii and colours; the sign-in link with Share/Export; `mode=molecule` links; the refresh-token restore). Add: the owner's cost comes from the job record; retry rebuilds XYZ from the canonical atoms; browser checks stub `/api` from real records because the job server cannot outlive one command.
- **What 6B-3 must supply:**
  - the four `VITE_*` values at build;
  - Cognito callback **and** sign-out URLs for `<CloudFront>/`, `<CloudFront>/admin.html`, `http://localhost:5173/`, `http://localhost:5173/admin.html`, `http://localhost:5391/` and `http://localhost:5391/admin.html`, with scopes `openid email`;
  - HTTP API CORS allowing `Authorization` and `Content-Type` and the methods GET and POST from those origins;
  - S3 result objects under `molecules/jobs/` with `.py`, `.log` and `.xyz` as `text/plain; charset=utf-8`;
  - nothing for `done.json` 403 caching: CloudFront's default error-caching TTL is 10 s, shorter than the 5 s poll's tolerance for a just-finished job (no site-stack change);
  - the `billing` record shaped `{ usd, through }`;
  - `JOBS_AWS_API_URL` for the dev proxy.
- **Findings:**
  - spec §9.1 writes `mode=molecules`, but Phase 6's links say `molecule`;
  - spec §9.3 names `geometrySource.name`, but 6B-1 writes `title` and `query`;
  - Phase 6's `LibraryExtras.geometryOptimisation` is `{converged, maxGradient}`, but 6B-1's worker writes `{steps, converged}`;
  - any diatomic-only path Task 1 Step 3 reported.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/HANDOFF.md
git commit -m "docs: computed molecules, owner sign-in and /admin.html; what Phase 6B-3 must supply (Phase 6B-2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- §9.1, two tiers. Badge and line on every molecule: Task 9, placed in the legend stack in Task 12. Absent `tier` is validated: Task 2 `tierOf`. Owner-only Computed category from `GET /jobs?status=DONE`: Tasks 5 and 12. Share link `#mode=molecule&job=<key>` opens for anyone from `/molecules/jobs/<key>/`: Tasks 3, 5 and 16. The loader resolves a base per entry: Task 3, via the id, as argued under Design decisions.
- §9.2, request panel. Inputs and recipes: Task 10. Preview with ball-and-stick, formula, charge, multiplicity, electrons, N and the sizing decision: Tasks 4 and 10. Refusals: Task 10. Already computed / running / failed with Retry: Task 10, and Task 11 for Retry from status.
- §9.3. Status polled every 5 s, with stage, energy, log tail, elapsed time and cost, and DONE opening the molecule: Tasks 8 and 11. Provenance on both tiers, with the PubChem link, caveats, files, and the owner's time and cost: Task 9. `meta.provenance` typed: Task 2.
- §9.4, `/admin.html`. A second entry kept out of the main bundle: Task 15. Plain MUI Table with sorting, filters and §9.4's columns: Task 13. Cost panel with projection, hand-drawn SVG chart and AWS billed figure: Task 14.
- §9.5, sign-in. `oidc-client-ts` with code + PKCE, access token in memory, refresh token in `sessionStorage`, both redirect URIs, and "not configured": Tasks 2, 7 and 12. Bearer token on every call when signed in: Task 6.
- §9.6, This Mac vs AWS, `/api` vs `/api/aws`, with the owner rule: Tasks 5, 6 and 12.
- §9.7, layout: Task 12 (side panel, Explore tab, legend stack, view settings) and Task 15 (dashboard scroll); live checks in Tasks 12 and 15.
- §4 API shapes: pinned by 6B-1's recorded responses (Task 1), typed in Task 2.
- §5.3 result layout and `done.json` last: Task 3. Files linked: Tasks 9 and 13.
- §12, local: Task 12 Step 6 runs a real job through the dev proxy.
- §14: item 1 (CORS on execute-api) is how the production base works (Task 6); item 5 (no `result.json`) holds, since only `meta.json` is read; item 6 (log tail in the record) is Task 11; item 7 (diatomic paths) is probed in Task 1 Step 3, not re-planned.
- §15 item 3: verified against the local backend.

**Placeholder scan:** there are no TBD or TODO markers. The two paste-in points (`JOB` in the Playwright stubs) name the exact file their value comes from, written by Task 12 Step 6. The conditional instructions (Task 1's rule; Task 3's "if Phase 6's `esp.ts` differs"; Task 15's "check is blind") each state the check and the action.

**Type consistency:** the following are used with the same names and shapes in every task that consumes them:
- `JobView`, `PreviewResponse`, `Sizing`, `JobRequest`, `CostsResponse`, `Meter`, `GeometrySource` (Task 2);
- `JobsState`, `OwnerSession`, `JobsTarget`, `selectIsOwner`, `jobUpdated`, `jobFetchFailed`, `followJob`, `computedLoaded`, `refreshComputed`, `sessionChanged`, `sessionExpired`, `sessionFailed`, `setTarget` (Task 5);
- `JobsApiError`, `SESSION_ENDED`, `createJobsApi` (Task 6);
- `OwnerAuth`, `ownerAuth()`, `startOwnerSession`, `bindJobsClient`, `jobsApi()`, `chooseTarget` (Task 7);
- `jobsPoller()`, `setJobsPollerForTests`, `useJobPolling`, `useNow` (Task 8);
- `PUBCHEM_COMPOUND_URL` (Task 9), `retryBody`, `requestBody`, `formSignature`, `PreviewFn` (Task 10), `STATUS_TEXT` (Task 11), `ConnectedOwnerBar` (Task 12);
- `isJobKey`, `jobFileUrl`, `computedResultFiles`, `RESULT_NOT_FINISHED` (Task 3).

`MoleculeProvenance.geometrySource` and `GeometrySource` deliberately share 6B-1's shape.

**Review Focus → owning tests:**
1. Unfinished share link: Task 3 (`done.json` 404/403), and Task 12's App test.
2. Stale preview: Task 10.
3. 401 mid-session: Task 6 (client), Task 7 (`client.test.ts`: expiry reaches the store), Task 10 (form kept, sign-in offered) and Task 12 (App-level notice).
4. Poll storm: Task 8.
5. Dashboard leak: Task 15 (import graph), plus `npm run check:admin-split` in Tasks 15 and 16.
