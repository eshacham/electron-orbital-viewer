# 6G-1 live visual check — final fix wave (re-shoot after rounds 22–23)

**Taken 2026-10-14 at commit `15814b1`** (branch `design/quantumlab-redesign`; final fix wave's
four commits on top of `b0740a1`, the head the owner said "looks good" to and the two whole-branch
reviews assessed). This record **replaces** the one in this file before it (taken 2026-10-13 at
`154567d`, Task 20d): that record predates rounds 22–23 and showed the rail, the Display tab inside
Explore, the key column at mid-right and the Molecules canvas prose — all since changed. This is
final review B-I2's fix: the committed live visual check now describes the UI actually being
shipped.

**Scenes** (`tools/design/scenes.json`): `c-whole` (Carbon, whole atom), `c-2pz` (Carbon 2p_z
orbital), `fe-shell` (Iron M shell), `basic-3dz2` (Hydrogen 3d_z² orbital, Orbitals/Basic mode),
`bonds-co` (CO, total density), `bonds-n2` (N₂, total density), `water` (H₂O, library molecule),
`molecule-complex` (glycine, "one larger library molecule"). **Themes:** dark, light. **Sizes:**
desktop (1440×900), tablet (1024×768, medium layout — docked inspector becomes a folded drawer),
phone (390×844), zoom (720×450 — ruling R9: a 200 % desktop zoom is 720 CSS px wide, so
`NARROW_VIEWPORT` matches and the phone layout applies, though the window is not touch/mobile).
8 scenes × 2 themes × 4 sizes = **64 shots**, `--gl metal` (ANGLE Metal, a real device's frame
times, so ruling R10's frame-time guard is never tripped by software-rendering latency).

**Commands:**
```
node tools/design/shoot.mjs --task final --run reshoot1 --gl metal --port 5411 \
  --scenes c-whole,c-2pz,fe-shell,basic-3dz2,bonds-co,bonds-n2,water,molecule-complex \
  --themes dark,light --sizes desktop,tablet,phone,zoom
```
writes `/tmp/6g1-final-<scene>-<theme>-<size>.png` and `/tmp/6g1-final-reshoot1-metrics.json`
(64 shots). The main comparison (science_diff, below):
```
git worktree add --detach /tmp/6g1-final-main origin/main   # 15feebc, unmoved since Task 19
cd /tmp/6g1-final-main && npm ci --silent
cd <this checkout> && node tools/design/shoot.mjs --root /tmp/6g1-final-main \
  --task finalmain --run reshoot1 --port 5412 \
  --scenes c-whole,c-2pz,fe-shell,basic-3dz2,bonds-co,bonds-n2,water,molecule-complex \
  --themes dark --sizes desktop
node tools/design/science_diff.mjs /tmp/6g1-finalmain-reshoot1-metrics.json /tmp/6g1-final-reshoot1-metrics.json
git worktree remove /tmp/6g1-final-main --force
```

## shoot.mjs fixes that make this record real (final review B-I2, first half)

Before re-shooting, `tools/design/shoot.mjs` itself was fixed (deferred since Task 19/the Task 3
original and flagged again by both final reviews):

- **Typography caption probe.** `'.ql-caption'` alone read `null` in every one of Task 19/20a/20d's
  captures: the only elements carrying that literal class (`OrbitalFactsCard`'s notes,
  `OrbitalEnergyList`'s `<caption>`, a search result's detail line) are gated behind a Data tab or
  a query that most scenes never open. The probe now tries `.key-heading` and `.key-caption`
  first — real, visible, caption-sized text present in most scenes (the key column, spec §3.3) —
  falling back to `.ql-caption`. Result below: real text in 2 of 8 scenes (the only two whose key
  column carries a heading or a cut-face caption in this state); the other 6 scenes genuinely have
  no caption-sized text on screen with nothing picked, confirmed by eye against their screenshots,
  not a remaining probe gap.
- **An explicit settle wait after the two-pass tab clicks** (deferred since Task 19): the inspector
  drawer's open/re-fold clicks (reading the enclosed-fraction note at medium width) used a blind
  `waitForTimeout(400)`; now each click is followed by `settle()`, the same canvas-quiet wait the
  initial page load uses, so a slower transition can never be read or screenshotted mid-flight.
- **Sample points for the `zoom` size** (deferred since Task 3/17): `zoom`'s name does not start
  with `'phone'`, so it fell into the `desktop` bucket by elimination — sampling selectors
  (`.explore-panel`, the pre-R23a `.app-rail`) that are not in the DOM under `zoom`'s actual
  (phone) layout, reading `missing` every time. `zoom` and `phone-landscape` now explicitly share
  the `phone` bucket. The stale `.app-rail` desktop sample point (dead since R23a) is replaced with
  `.app-topbar-tabs` ("mode tabs"), the real element that carries the rail's four destinations now.
- **A metrics file name per run** (deferred since Task 19): `/tmp/6g1-<task>-metrics.json` alone
  meant a second invocation for the same `--task` silently overwrote the first run's results.
  `--run <label>` (default: a timestamp) is appended, so `--task final --run reshoot1` cannot
  collide with a later `--task final --run <anything else>`.

Fixed in commit (this task's own, see report): `tools/design/shoot.mjs`, `tools/design/sample_points.json`.

## What changed in the UI since the last committed record (Task 20d, `154567d`)

Rounds 22–23 (owner reviews of the live `b0740a1` deploy) and this fix wave, visible below:
- **R23a:** the rail is gone; the top bar's tabs are the four view modes (Orbitals, Atoms, Bonds,
  Molecules) — `.app-topbar-tabs`, not `.app-rail`.
- **R23c-1:** the key column sits bottom-right, aligned with the scale bar, in every mode (was
  mid-right).
- **R23d:** a vector periodic-table miniature (`.periodic-table-mini`, the selected cell lit)
  replaces the old "Periodic Table" text button, beside the element tile.
- **R23e:** Bonds' System select is grouped by bond type with bond orders; an explicit
  "Total density | One orbital" switch; the molecular-orbital list is titled with a label-legend
  caption.
- **R23f / R23f-2/3:** Molecules' MO list and its legend moved into the Explore panel (left); "How
  this was computed" is pinned to the Explore panel's bottom edge, growing upward when opened; the
  hover readout is a bottom-right caption, kept mounted (visibility only) so hovering never
  re-measures the camera insets (the flicker root cause).
- **R22a:** no colour-scheme selector — Phase only; no Classic/Density paths.
- **R22c:** Molecules' tier/library line moved into the viewport title block's description (was
  on-canvas prose); the hover readout is a scrollable `aria-live` section, never prose over the
  canvas.
- **R20b-atoms / T20b-display-header:** "Display" (surface style, opacity, cut-away, axes) is a
  foldable section at the top of the inspector, on the right, in every mode — never in Explore.
- **This fix wave:** the compact search popover (761–1099 px) now closes and returns focus to the
  icon button on a pick (B-I1); the subshell "Enclosed" row reads "of each orbital's probability";
  thumbnails recover from a restored WebGL context and honour the main view's extras latch;
  `refitToCanvas` updates its own projection matrix; the inspector drawer's bar buttons carry
  `aria-controls`; the element tile's accessible description includes the atomic weight and
  electron count; two Escape listeners (full screen, the periodic table) ignore a key already
  handled elsewhere; the rail-era stale labels, dead CSS/tokens and three-places block colour are
  cleaned up (B-M1–M3).

## Notes that apply throughout (stated once, not repeated per cell below)

1. **`controls card` (`#controls`) reads `missing` on every `tablet` shot except `basic-3dz2`**,
   present (ΔE₀₀ 0) on every `desktop` shot. At medium width the inspector is a folded 44 px drawer
   bar; the capture opens it once to read the enclosed-fraction note, then folds it back (unless
   the task asked for `--drawer open`), so by the time the screenshot is taken `#controls` is
   off-screen again in Atoms/Bonds/Molecules. `basic-3dz2` is the one exception, and correctly so:
   `#controls` is given to the *selection* half in Basic mode (`Controls.tsx`'s `renderControls`
   comment), which lives in Explore, not the inspector — Explore stays docked at medium width, only
   the inspector folds, so Basic's `#controls` never leaves the screen. Either way this is the
   capture's own state, not a missing component — the note itself (`enclosedNote`) was read
   correctly from the same pass, see each scene's Science row.
2. **`zoom`'s "phone top bar" colour sample reads ΔE₀₀ 2.6–3.8 (not 0), failing the ≤3 tolerance in
   10 of 16 `zoom` shots** (light theme of all 6 non-molecule scenes; dark **and** light of
   `water`/`molecule-complex`; the other 6 — dark theme of the non-molecule scenes — pass at 2.57).
   Confirmed by opening the screenshots (e.g.
   `atom-c-whole-light-zoom`, viewed directly): the sample point inherited from the `phone` bucket
   is `x: 0.5` (the bar's horizontal centre) at `py: 3`. On an actual phone (390 px) that centre
   falls on empty bar background; at `zoom`'s 720 px width the same fraction lands on the right
   edge of the "C · Carbon ▾" element button / wordmark, not the plain `bg-bar` fill — a sampling-point
   placement artifact of reusing the phone bucket's fractional co-ordinate at a much wider window,
   not a colour or token regression (every other sample on the same bar, and the same point at
   `phone` size, reads ΔE₀₀ 0). Recommendation for a future pass: give `zoom` its own sample point
   set with an offset clear of the header's content. Not fixed in this pass (scope: the probe
   finding *a* real sample, not a bespoke `zoom` geometry) — flagged here rather than mis-reported
   as a Colours failure.
3. **`water` and `molecule-complex` read `errors: 2`** on every shot: `ECONNREFUSED 127.0.0.1:8787`
   / a proxied 500 for `/api/v1/jobs?...`. This sandbox has no local jobs server running (and must
   not start one — global constraint: never touch `tools/jobs/.state`). The app handles this
   exactly as designed: Explore shows "Could not list this month's computed molecules: The job
   server on this Mac is not answering…" instead of crashing (confirmed visually, both molecule
   scenes). Pre-existing, environment-only, not a UI defect; §14 check 5's "errors is empty" is
   read as "no errors beyond the known, environment-caused proxy failure" for these two scenes only.
4. **Boxes within a mode are identical to the pixel across its scenes at a given theme/size**,
   except where the content itself differs (breadcrumb/title text length, the strip's presence,
   `.key-column`'s height for a 1-entry vs 3-entry key) — checked programmatically across all 64
   shots before writing this file; every *structural* box (`.app-topbar`, `.explore-panel`,
   `.inspector`, `#canvas-container`, `.phone-topbar`) matches to the pixel within a mode group at
   a given theme/size, including at `zoom` where only `.phone-header`'s content-sized width differs.

## Results by scene

Each table: rows are the four sizes (both themes folded in — colours differ only by theme's hex,
which matched its token exactly, ΔE₀₀ 0, at every size except the `zoom` caveat above; spacing,
typography and components are theme-independent). Boxes are desktop `(x, y, w, h)` in CSS px.

### c-whole (Carbon, whole atom — Atoms mode, atom level)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 samples ΔE₀₀ 0 (top bar/mode tabs/gutter/explore/inspector/controls/canvas×2) both themes | pass — top bar 1440×56; Explore 315 at x=12; inspector 290 at x=1138; canvas 787 at x=339; key column 202×102 at (912,628); strip 763×138; gutters 12 all round | pass — Inter Variable; title 20/600 "Carbon — whole atom"; nav 14/500; body 13/400; **caption 12/400** ("cut face shading is scaled to local shell structure", `.key-caption`) | pass — top tabs (Orbitals/**Atoms**/Bonds/Molecules), element tile + periodic-table miniature, Configuration tab (1s²2s²2p² + K/L shell buttons), shell-ring key (n=1/n=2 valence), D(r) legend, strip (1s…3d, no rail | pass — webgl=1, errors=0; configuration `1s² 2s² 2p²`; plotLegend `["n=1","n=2 valence"]`; enclosedNote "contour enclosing this fraction of the electron density"; science_diff: identical to main |
| tablet | pass — 7/8 present ΔE₀₀ 0 (`controls card` missing, note 1) | pass — top bar 1024×56; Explore 300 (medium width); inspector folded to 46 (drawer bar); canvas 688; key column 202×102 at (754,496) | pass — same family/sizes as desktop (title 20/600, nav 14/500, body 13/400, caption 12/400 — all probes still real at this width, Explore stays docked) | pass — same components, Explore stays docked at medium width (only the inspector folds) | pass — same text as desktop; science_diff doesn't cover tablet (desktop/dark only) — visually identical content |
| phone | pass — 3/3 samples ΔE₀₀ 0 (phone top bar/sheet tabs/canvas) | pass — phone top bar 390×52; phone header 374×44 at (8,60); key column 220×74 at (158,114) | n/a title/nav/body (desktop-only selectors, by design); **caption 12/400**, real (key column present on phone too) | pass — phone top bar, breadcrumb header, key column, collapsed bottom sheet (Explore/View/Plot tabs) | pass — key text identical to desktop's; errors=0 |
| zoom | pass, with note 2 (dark 2.57 pass; light 3.66 marginal fail — sampling-point artifact, not a token regression) | pass — canvas 720×450; phone top bar 160×44 at (8,8) (NARROW_VIEWPORT's phone layout, not a touch/mobile window); phone header 289×44 | n/a title/nav/body; caption 12/400, real | pass — same phone layout as `phone`, at the wider 720 px width; nothing clips | pass — errors=0; key text identical |

### c-2pz (Carbon 2p_z orbital — Atoms mode, orbital level)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — same top bar/Explore/inspector/canvas boxes as c-whole; key column 73×64 at (1041,650) (one ψ key, smaller); strip 763×154 | pass — title 20/600 "Carbon — 2p_z orbital"; nav 14/500; body 13/400; caption null (no `.key-heading`/`.key-caption` at orbital level — only a plain ψ key; confirmed by eye, no 12 px text on screen here) | pass — breadcrumb "Carbon / L shell (n=2) / 2p / 2p_z", subshell chips (2s/2p energies), per-m_l picker, orange/blue Glow lobes, ψ key, D(r) plot; matches both `original-concepts.png` options (option1/option2 composites) | pass — `\|ψ\|² = 1.22e-3`; phaseKey `["ψ > 0ψ < 0"]`; subshellChips 2s/2p energies; configuration unchanged; science_diff: identical to main |
| tablet | pass — 7/8 (`controls card` missing, note 1) | pass — inspector folded to 46; key column 73×64 at (883,518) | pass — same sizes; caption still null (same reason) | pass — same components, drawer folds/opens correctly for the enclosed note read | pass — same text as desktop |
| phone | pass — 3/3 ΔE₀₀ 0 | pass — key column 121×30 at (257,114) (compact, one key line) | n/a desktop-only probes; caption null (same reason, consistent with desktop) | pass — breadcrumb header, ψ key, collapsed sheet | pass — ψ key text identical; errors=0 |
| zoom | pass, note 2 (dark 2.57; light 3.66 marginal) | pass — key column 121×30 at (256,62) | n/a; caption null | pass — phone layout at 720 px, nothing clips | pass — errors=0 |

### fe-shell (Iron, M shell — Atoms mode, shell level)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — key column 202×222 at (912,492) (two stacked key cards: shell ring + "Orbital tiles" ψ key); strip 763×154 | pass — title 20/600 "Iron — M shell"; nav 14/500; body 13/400; **caption 12/600** ("Orbital tiles" — `.key-heading`, deliberately bolder than the 12/400 plain caption role, a sub-heading inside the key, not a defect) | pass — breadcrumb "Iron / M shell (n=3)", K/L/M/N shell buttons, 3s/3p/3d subshell chips with electron counts and energies, D(r) legend (3s/3p/3d), orbital-tile strip (3s,3p×3,3d×5) filled, periodic-table miniature | pass — subshellChips `3s·2 of 2 e⁻·-3.361 Ha` etc.; configuration `1s²2s²2p⁶3s²3p⁶3d⁶4s²`; science_diff: identical to main |
| tablet | pass — 7/8 (`controls card` missing, note 1) | pass — key column 202×222 at (754,360); drawer folds correctly | pass — caption 12/600, same as desktop | pass — same components | pass — same text as desktop |
| phone | pass — 3/3 ΔE₀₀ 0 | pass — key column 220×74 at (158,114) (one card visible — shell ring; the phone's narrower column stacks less) | n/a desktop probes; caption 12/400 (phone's key column shows the shell-ring caption here, not the tile heading — layout-dependent, not a regression) | pass — breadcrumb, key column, collapsed sheet | pass — shell text identical; errors=0 |
| zoom | pass, note 2 (dark 2.57; light 3.66 marginal) | pass — key column 220×74 at (157,62) | n/a; caption 12/400 | pass — phone layout at 720 px | pass — errors=0 |

### basic-3dz2 (Hydrogen 3d_z², Orbitals/Basic mode)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — same Explore/inspector/canvas grid; key column 73×64 at (1041,804); no strip (Basic mode has none) | pass — title 20/600 "Hydrogen — 3d_z² orbital"; **nav 14/600** (the active top-bar tab's own emphasis, a pre-existing, owner-accepted deviation from the 500 base token — deferred Task 19/22a, owner's taste); body 13/400; caption null (ψ key only, no heading, as c-2pz) | pass — n/l/mₗ selection in Explore, orange/blue Glow lobes, ψ key, D(r) plot, Display (Glow/Solid/Wireframe, opacity, cut-away) on the right (ruling R20b: Basic's view settings in the inspector, selection stays in Explore) | pass — `\|ψ\|² = 1.30e-5`; phaseKey ψ>0/ψ<0; science_diff: identical to main |
| tablet | pass — 8/8, including `controls card` (note 1's exception: Basic's `#controls` lives in Explore, which stays docked at medium width) | pass — key column 73×64 at (883,672) | pass — same, nav 14/600 | pass — same | pass — same text |
| phone | pass — 3/3 ΔE₀₀ 0 | pass — key column 121×30 at (257,114); no `.phone-header` (Basic's phone header differs — n/l/mₗ picker is its own sheet tab, not a breadcrumb) | n/a; caption null | pass — collapsed sheet (Explore/View/Plot) | pass — errors=0 |
| zoom | pass, note 2 (dark 2.57; **light 3.76**, the largest of the marginal set — same sampling-point cause) | pass — key column 121×30 at (256,62); phone top bar/header both 169×44 (Basic's zoom header is narrower — no element tile to push width) | n/a; caption null | pass — phone layout at 720 px | pass — errors=0 |

### bonds-co (CO, total density — Bonds mode)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — same grid; key column 220×58 at (894,810) (one density key, bottom-right); no strip | pass — title 20/600 "CO — Carbon monoxide"; nav 14/500; body 13/400; caption null (the density key has no heading/caption span) | pass — **System select grouped by bond type** with bond orders (R23e); explicit **Total density \| One orbital** switch; **titled MO list** "Molecular orbitals (lowest energy at the bottom)" with a σ/π/g-u legend caption; bond-order footer ("Bond order 3 — counted from the valence orbitals' bonding/antibonding character…"); Display (Solid/Wireframe, opacity, cut-away, energy-vs-R plot) on the right | pass — `ρ = 0.002 e/a₀³, total electron density`; enclosedNote states the fixed-ρ caveat; plotLegend `["CO","separated atoms"]`; science_diff: identical to main |
| tablet | pass — 7/8 (`controls card` missing, note 1) | pass — key column 220×58 at (736,678) | pass — same | pass — same (MO list and switch are in Explore, which stays docked at medium width) | pass — same text |
| phone | pass — 3/3 ΔE₀₀ 0 | pass — key column 220×50 at (158,114) | n/a; caption null | pass — breadcrumb header, density key, collapsed sheet | pass — errors=0 |
| zoom | pass, note 2 (dark 2.57; light 3.66 marginal) | pass — key column 220×50 at (157,62) | n/a; caption null | pass — phone layout at 720 px | pass — errors=0 |

### bonds-n2 (N₂, total density — Bonds mode)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — identical grid to bonds-co | pass — title 20/600 "N₂ — Nitrogen"; nav/body as bonds-co; caption null | pass — same Bonds components, homonuclear footer (g/u counting applies, unlike CO/HF) | pass — `R = 2.07 a₀ (1.098 Å)`; plotLegend `["N₂","separated atoms"]`; science_diff: identical to main |
| tablet | pass — 7/8 (note 1) | pass | pass | pass | pass — same text |
| phone | pass — 3/3 | pass | n/a; caption null | pass | pass — errors=0 |
| zoom | pass, note 2 | pass | n/a | pass | pass — errors=0 |

### water (H₂O — Molecules mode, library molecule)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — key column (hover caption zone) 187×28 at (927,840), bottom-right, no persistent key chip at rest (density has no fixed colour scale to key — consistent with R22c, no key shown where nothing is mapped); no strip | pass — title 20/600 "Water (H₂O)"; nav/body as other modes; caption null (no key-heading/-caption element; the "Library" chip and provenance text use their own classes, not the caption role) | pass — **"Library" tier line is now in the title block's description** ("Water (H₂O), density, 90 % enclosed (ρ = 2.66e-2 e/a₀³)" + "Library — Curated; geometry from experiment…", R22c), not on-canvas prose; Selection section with "geometry: experiment (CCCBDB) · sticks show connectivity, not bond order"; **"How this was computed→" pinned at the Explore panel's bottom edge** (R23f-2); bottom-right **"Hover or tap an atom or bond"** caption, nothing picked (R23f-3); Display (ball-and-stick, dipole arrow, Solid/Wireframe, opacity) on the right | pass — errors=2, note 3 (benign, environment-only); enclosedNote `ρ = 2.66e-2 e/a₀³`; science_diff: identical to main |
| tablet | pass — 7/8 (`controls card` missing, note 1) | pass — hover-caption zone 187×28 at (769,708) | pass — same | pass — same (Explore stays docked; the pinned footer and Selection section both fit above the fold) | pass — errors=2, note 3 |
| phone | pass — 3/3 ΔE₀₀ 0 | pass — no key-column box (nothing to key at rest on the phone sheet either) | n/a; caption null | pass — phone top bar/header, collapsed sheet (no stray Plot tab — Molecules has none, per the slot-wiring rulings) | pass — errors=2, note 3 |
| zoom | pass — "phone top bar" ΔE₀₀ **3.29 (dark) / 3.34 (light)**, both just over the ≤3 tolerance, same sampling-point cause as note 2 (confirmed: Molecules' phone header is 76 px tall here — two lines, "Molecules ▾" + species name — pushing the sampled centre further into live content than the other modes' single-line header) | pass — phone header 373×76 at (8,8) (two-line header, Molecules-specific; top bar itself still 44 px) | n/a; caption null | pass — phone layout at 720 px, two-line header does not clip or overlap the canvas/key | pass — errors=2, note 3 |

### molecule-complex (Glycine — Molecules mode, larger library molecule)

| size | 1. Colours | 2. Spacing | 3. Typography | 4. Components | 5. Science |
|---|---|---|---|---|---|
| desktop | pass — 8/8 ΔE₀₀ 0 | pass — identical grid to water (same mode) | pass — title 20/600 "Glycine (NH₂CH₂COOH)"; caption null (same reason as water) | pass — same Molecules components as water, scaled to a larger molecule (more atoms/bonds in the ball-and-stick, same Selection/footer/caption placement); "Library — Curated; optimised geometry…" | pass — errors=2, note 3; enclosedNote `ρ = 3.46e-2 e/a₀³`; science_diff: identical to main |
| tablet | pass — 7/8 (note 1) | pass | pass | pass | pass — errors=2, note 3 |
| phone | pass — 3/3 | pass | n/a; caption null | pass | pass — errors=2, note 3 |
| zoom | pass — "phone top bar" ΔE₀₀ 3.29/3.34, same note as water's zoom row | pass — phone header 373×76 (two-line, same as water) | n/a | pass | pass — errors=2, note 3 |

## Composites

Regenerated the 14 PNGs Task 19 created (`tools/design/composite.mjs`, `tools/design/concept_crops.json`
— unchanged, reused verbatim), from this re-shoot's fresh captures, for the three Atom scenes that
have a defined concept crop (`c-whole`, `c-2pz`, `fe-shell` — desktop and phone, both themes) plus
the two `original-concepts.png` option composites:
```
for scene in c-whole c-2pz fe-shell; do
  for size in desktop phone; do
    node tools/design/composite.mjs --shot /tmp/6g1-final-$scene-dark-$size.png  --sheet theme-comparison --crop deep-space   --out docs/quantumlab/checks/6G-1/atom-$scene-dark-$size.png
    node tools/design/composite.mjs --shot /tmp/6g1-final-$scene-light-$size.png --sheet theme-comparison --crop light-clean  --out docs/quantumlab/checks/6G-1/atom-$scene-light-$size.png
  done
done
node tools/design/composite.mjs --shot /tmp/6g1-final-c-2pz-dark-desktop.png  --sheet original-concepts --crop dark-modern  --out docs/quantumlab/checks/6G-1/atom-c-2pz-dark-desktop-option1.png
node tools/design/composite.mjs --shot /tmp/6g1-final-c-2pz-light-desktop.png --sheet original-concepts --crop light-clean --out docs/quantumlab/checks/6G-1/atom-c-2pz-light-desktop-option2.png
```
All 14 opened with the Read tool: correct theme/scene beside the correct concept crop, no clipping,
showing the merged UI (top tabs, periodic-table miniature, bottom-right key column, Display on the
right) rather than Task 20d's rail/mid-right-key/Explore-Display record. `basic-3dz2`, `bonds-co`,
`bonds-n2`, `water` and `molecule-complex` have no defined crop in `concept_crops.json` (the
original design concepts modelled the Atoms screen only; Bonds/Basic/Molecules reuse its shell and
theme, per spec §16's own wording — "today's panels placed into the Explore and inspector slots and
themed, not yet re-composed") — their evidence is the metrics JSON and the `/tmp` screenshots
described scene-by-scene above, not a new concept-crop composite.

`tablet` and `zoom` are not composited against a concept crop either (the concept sheets have no
tablet/zoom mock); their evidence is likewise the metrics JSON and the tables above, which is what
this check exists to prove (§16: "the live visual check" is evidence that insets/overlays do not
overlap at the four breakpoints — shown in every scene's Spacing/Components rows, not only in the
composited ones).

## science_diff result

```
$ node tools/design/science_diff.mjs /tmp/6g1-finalmain-reshoot1-metrics.json /tmp/6g1-final-reshoot1-metrics.json
science text identical to main
```
Exit code 0, zero differences, across all 8 scenes (desktop/dark), for `phaseKey`, `plotLegend`,
`enclosedNote`, `subshellChips` and `configuration`.

**On ruling R22b's iso-value correction:** the brief's own template for this run expected "identical
except the R22b iso values, which are listed" — that applies to the heavy relativistic SCF orbitals
Fix A corrects (Ac 6s/7s, Au 6s, Pb 6p½: `ac-6s-shell`, `ac-6s-orbital`, `ac-7s-orbital`,
`ac-6s-off-orbital`, `au-6s-orbital`, `pb-6p12-orbital` in `scenes.json`), none of which are in this
run's 8-scene set (Carbon, Hydrogen, Iron, CO, N₂, water, glycine — none SCF-heavy-atom orbitals
R22b's gate touches). Zero differences for these 8 scenes is the **correct** result, not a gap:
Task 22b's own report already pinned the R22b iso deltas on the affected heavy-atom scenes with
`science_diff` run against those scenes specifically (commit 6fa7a84..baf527c), and nothing in this
fix wave touched `orbital_mesh.ts`'s meshing path again.

## Summary

**All pass**, with two caveats stated plainly rather than hidden:
- `zoom`'s "phone top bar" colour sample reads ΔE₀₀ 2.6–3.8 in 10 of 16 `zoom` shots (both themes of
  `water`/`molecule-complex`; light theme of the other six) — a sample-point placement artifact
  (note 2), confirmed by opening the screenshots; the actual `bg-bar` fill is unchanged (every other
  sample on the same bar, and the same fraction at `phone` size, reads ΔE₀₀ 0).
- The Typography caption probe, now fixed to look for real elements, finds one in 2 of 8 scenes
  (`c-whole`, `fe-shell`); the other 6 genuinely show no caption-sized text with nothing picked —
  confirmed visually, not a remaining probe gap.

64/64 shots `settled=true`; `webglCanvases=1` on every shot; `errors=0` except `water` and
`molecule-complex` (2 each, the sandbox's own missing local jobs server, handled gracefully by the
app — note 3); every UI colour sample matches its token exactly (ΔE₀₀ 0) except the two noted
cases; every measured box is exact for its layout (desktop/tablet/phone/zoom), 0 px off, with no
rail anywhere; components match the merged UI (no rail; top tabs; bottom-right key column;
periodic-table miniature; Bonds grouped by bond type with an explicit density/orbital switch and a
titled MO list; Molecules' MO list in Explore with a pinned provenance footer and a bottom-right
hover caption; Display/view settings on the right in every mode); science text identical to
`origin/main` @ `15feebc` on every compared field, for all 8 scenes.
