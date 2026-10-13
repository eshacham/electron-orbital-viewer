# 6G-1 live visual check (Task 19)

Taken 2026-10-13 at commit `3f8b331`. Scenes: `c-whole` (Carbon, whole atom), `c-2pz` (Carbon
2p_z orbital), `fe-shell` (Iron M shell). Themes: dark, light. Sizes: desktop (1440×900), phone
(390×844). Source data: `/tmp/6g1-T19-metrics.json` (new build, 12 shots) and
`/tmp/6g1-T19main-metrics.json` (`origin/main` @ 15feebc, 3 shots, dark/desktop only, check 5).
Composites: `docs/quantumlab/checks/6G-1/atom-<scene>-<theme>-<size>.png`, plus
`atom-c-2pz-dark-desktop-option1.png` / `atom-c-2pz-light-desktop-option2.png` against
`original-concepts.png`.

Every shot: `settled=true`, `webglCanvases=1`, `webglContextsCreated=2` (React StrictMode
double-invoke in dev, expected), `errors=0`. Every UI colour sample ΔE₀₀ = 0 (exact token match,
not just within tolerance) in every one of the 12 shots; canvas-on/off samples also ΔE₀₀ = 0.
Every desktop box (top bar 56, rail 76, Explore 315, inspector 290, all three 12 px gutters) is
exact across all three scenes and both themes — 0 px deviation, not just within ±2. The phone top
bar is 52 px and the phone header line is 44 px, both exact.

Two general notes that apply to every section below, stated once here:
- **`controls card` reads `missing` on every desktop atom shot.** `#controls` (Controls.tsx) is
  part of the Explore panel's *Display* tab, and the composite's screenshot is taken with
  *Configuration* showing (per this task's controller ruling, so `subshellChips` and
  `configuration` are populated instead of reading empty — see the preamble to Step 1's table).
  This is a capture-time tab choice, not a missing component; `enclosedNote` is still captured
  correctly from a separate pass on the Display tab (see check 5 below).
- **The shell-level facts card (`OrbitalFactsCard`, ruling T13-shellcard) and the plot tab
  symbols (ruling T13-tablabels) live in the inspector's Data/Plot tabs**, which these composites
  show with Plot active (the default). They are not part of this task's FIELDS comparison and are
  not pictured zoomed-in here; T13's own report is the record for those. Nothing in this check
  contradicts them.

---

## atom-c-whole-dark-desktop

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | top bar #010b17 vs bg-bar #010B17 (ΔE 0); rail ΔE 0; page gutter #020f1d vs bg-app #020F1D (ΔE 0); explore panel / inspector #071828 vs surface-1 (ΔE 0); canvas edges ΔE 0 on/off | `controls card` missing — see preamble note |
| 2. Spacing | pass | top bar 56; rail 76; Explore 315; inspector 290; gutters 12/12/12 | all exact, 0 px off target |
| 3. Typography | pass | family `"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif`; title 20/600; nav 14/600 (active-tab override; base nav token is 500 per `.app-topbar-tab[aria-current="page"]`); body 13/400 | caption font read null — `.ql-caption` lives in GlobalSearch/OrbitalEnergyList/OrbitalFactsCard, none open in this shot |
| 4. Components | pass | element tile, breadcrumb, Configuration tab (1s²2s²2p² + valence + K/L shell buttons), viewport title/toolbar/key column, thumbnail strip (1s…3d tiles, 2p_z selected+glow), Plot/Data tabs, D(r) curve with legend | matches concept A's layout; no "Show nucleus"/"Show nodes"/"Model type" (§2 Out); inspector present where concept A has none (§8.6); no Learning/Gallery/Projects nav items (ruling R3) |
| 5. Science unchanged | pass | science_diff: identical to main for this scene (phaseKey, plotLegend, enclosedNote, subshellChips, configuration); insets keep the lobes clear of title/toolbar/key column/strip in the composite | see full science_diff output below |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `webglContextsCreated=2` (StrictMode, expected), `errors=0` | |

## atom-c-whole-light-desktop

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | top bar/rail/Explore/inspector #ffffff vs bg-bar/surface-1 #FFFFFF (ΔE 0); page gutter #f4f7fb vs bg-app #F4F7FB (ΔE 0); canvas edges ΔE 0 on/off | `controls card` missing — preamble note |
| 2. Spacing | pass | identical boxes to the dark shot (theme does not move layout) | |
| 3. Typography | pass | same family/sizes/weights as the dark shot | |
| 4. Components | pass | same components, light-theme tokens; thumbnail tiles and key column legible on white | matches concept B |
| 5. Science unchanged | pass | light/desktop isn't part of science_diff's FIELDS run (check 5 compares dark/desktop only, per the tool); the same DOM text is theme-independent, confirmed by eye against the dark shot | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-c-whole-dark-phone

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | phone top bar/sheet tabs #010b17 vs bg-bar (ΔE 0); canvas edge ΔE 0 on/off | |
| 2. Spacing | pass | phone top bar 52; phone header 44 | exact |
| 3. Typography | n/a | font probes (`.viewport-title h1`, `.app-topbar-tab`, `.explore-panel .ql-body`, `.ql-caption`) target desktop-only selectors, all null on phone | not a failure — the phone layout uses `.phone-header`/`.phone-sheet`, outside this probe's selector list (Task 3 scope) |
| 4. Components | pass | phone top bar, key column strip, bottom sheet tab bar (Explore/View/Plot) collapsed by default | matches the phone baseline (§16 "Phone and tablet baseline"); sheet is collapsed, showing only its tab row, which is the designed default state |
| 5. Science unchanged | pass | key column text identical in content to desktop (3 phase entries truncated for width only) | phone isn't part of science_diff's desktop/dark FIELDS run; visually consistent |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-c-whole-light-phone

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | phone top bar/sheet tabs #ffffff vs bg-bar (ΔE 0); canvas edge ΔE 0 on/off | |
| 2. Spacing | pass | same as dark phone shot | |
| 3. Typography | n/a | same probe gap as dark phone shot | |
| 4. Components | pass | same as dark phone shot, light tokens | |
| 5. Science unchanged | pass | same as dark phone shot | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-c-2pz-dark-desktop

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | all 7 present samples ΔE 0 (top bar, rail, page gutter, explore panel, inspector, canvas×2) | `controls card` missing — preamble note |
| 2. Spacing | pass | top bar 56; rail 76; Explore 315; inspector 290; gutters 12/12/12 | exact, same as c-whole |
| 3. Typography | pass | title 20/600 "Carbon — 2p_z orbital"; nav 14/600 (active); body 13/400 | |
| 4. Components | pass | breadcrumb "Carbon / L shell (n=2) / 2p / 2p_z", Back-to-2p control, subshell chips (2s, 2p energies), per-m_l picker (2p_y/2p_z/2p_x), charge/excite/relativity controls, orange/blue phase lobes with ψ>0/ψ<0 key, Plot tab's R(r)/\|R\|²/D(r) tabs (ruling T13-tablabels) showing D(r) selected | matches concept A and both `original-concepts.png` options (see the two option composites below) |
| 5. Science unchanged | pass | science_diff: identical to main (phaseKey, plotLegend, enclosedNote, subshellChips, configuration); lobes framed clear of title/toolbar/key/strip | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-c-2pz-light-desktop

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | all 7 present samples ΔE 0 | `controls card` missing — preamble note |
| 2. Spacing | pass | identical boxes to the dark shot | |
| 3. Typography | pass | same family/sizes/weights | |
| 4. Components | pass | same components as the dark shot, light tokens, orange/blue lobes still clearly legible | matches concept B and `original-concepts.png` Option 2 (see option2 composite) |
| 5. Science unchanged | pass | same DOM text as the dark shot (theme-independent); not itself in science_diff's dark/desktop run | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-c-2pz-dark-phone

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | phone top bar/sheet tabs ΔE 0; canvas edge ΔE 0 | |
| 2. Spacing | pass | phone top bar 52; header 44 | |
| 3. Typography | n/a | desktop-only font probes, null on phone (see c-whole-dark-phone note) | |
| 4. Components | pass | breadcrumb header, key column (ψ>0/ψ<0), collapsed bottom sheet | |
| 5. Science unchanged | pass | not in science_diff's desktop/dark run; visually consistent with desktop | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-c-2pz-light-phone

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | phone top bar/sheet tabs ΔE 0; canvas edge ΔE 0 | |
| 2. Spacing | pass | same as dark phone shot | |
| 3. Typography | n/a | same probe gap | |
| 4. Components | pass | same as dark phone shot, light tokens | |
| 5. Science unchanged | pass | same as dark phone shot | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-fe-shell-dark-desktop

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | all 7 present samples ΔE 0 | `controls card` missing — preamble note |
| 2. Spacing | pass | top bar 56; rail 76; Explore 315; inspector 290; gutters 12/12/12 | exact |
| 3. Typography | pass | title 20/600 "Iron — M shell"; nav 14/600 (active); body 13/400 | |
| 4. Components | pass | breadcrumb "Iron / M shell (n=3)", K/L/M shell buttons, 3s/3p/3d subshell chips with electron counts and orbital energies, D(r) curve with 3s/3p/3d legend, orbital-tile strip (3s, 3p×3, 3d×5) filled in (not placeholders — thumbnails render through the one shared renderer, §12) | thumbnails confirmed filled before the Glow guard's ~10 s window (waited 6 s + settle); the shell-level facts card itself (T13-shellcard's subject) is on the inspector's Data tab, not pictured here |
| 5. Science unchanged | pass | science_diff: identical to main (phaseKey, plotLegend, enclosedNote, subshellChips `"3s · 2 of 2 e⁻ · ‑3.361 Ha"` etc., configuration); overlapping shell lobes framed clear of title/toolbar/key/strip | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0`, `canvases=10` (9 strip thumbnails + 1 main view, only the main view has a live context) | |

## atom-fe-shell-light-desktop

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | all 7 present samples ΔE 0 | `controls card` missing — preamble note |
| 2. Spacing | pass | identical boxes to the dark shot | |
| 3. Typography | pass | same family/sizes/weights | |
| 4. Components | pass | same components as the dark shot; thumbnail strip filled, legible on white | |
| 5. Science unchanged | pass | same DOM text as the dark shot; not itself in science_diff's dark/desktop run | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-fe-shell-dark-phone

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | phone top bar/sheet tabs ΔE 0; canvas edge ΔE 0 | |
| 2. Spacing | pass | phone top bar 52; header 44 | |
| 3. Typography | n/a | desktop-only font probes, null on phone | |
| 4. Components | pass | breadcrumb "Fe · Iron / M shell (n=3)", key column (3s/3p/3d), collapsed bottom sheet | |
| 5. Science unchanged | pass | not in science_diff's desktop/dark run; visually consistent with desktop | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

## atom-fe-shell-light-phone

| check | result | measured | note |
|---|---|---|---|
| 1. Colours | pass | phone top bar/sheet tabs ΔE 0; canvas edge ΔE 0 | |
| 2. Spacing | pass | same as dark phone shot | |
| 3. Typography | n/a | same probe gap | |
| 4. Components | pass | same as dark phone shot, light tokens | |
| 5. Science unchanged | pass | same as dark phone shot | |
| 6. One WebGL canvas, no errors | pass | `webglCanvases=1`, `errors=0` | |

---

## Options 1 and 2 (2p_z beside `original-concepts.png`)

`atom-c-2pz-dark-desktop-option1.png` (beside "Dark / Modern") and
`atom-c-2pz-light-desktop-option2.png` (beside "Light / Clean") are the same two 2p_z desktop
shots above, recomposited beside the two original concept options rather than the
theme-comparison sheet. Same scene, same pass results as `atom-c-2pz-dark-desktop` and
`atom-c-2pz-light-desktop` above; included because the brief calls for the 2p_z scene beside both
concept sheets.

---

## science_diff result

```
$ node tools/design/science_diff.mjs /tmp/6g1-T19main-metrics.json /tmp/6g1-T19-metrics.json
science text identical to main
```

Exit code 0. Compared fields (`phaseKey`, `plotLegend`, `enclosedNote`, `subshellChips`,
`configuration`) for `c-whole`, `c-2pz` and `fe-shell`, dark/desktop, branch vs `origin/main`
@ `15feebc`: zero differences. No ruled difference needed documenting here because none of the
compared fields intersect the two rulings that did change text on this branch:
- **T13-tablabels** (plot tab symbols "R(r)"/"\|R\|²"/"D(r)" or "ρ(r)") lives in the tab row's
  visible labels, not in `plotLegend` (the curve legend, `.radial-plot-legend-item`) or any other
  compared field.
- **T13-shellcard** (shell-level facts card showing the shell's own occupancy instead of the
  whole-atom configuration) lives in `OrbitalFactsCard`, not in `.level-nav-configuration`
  (always the whole-atom breadcrumb line, by design, on both main and this branch) or
  `subshellChips` (`.subshell-chip`, which already showed per-subshell occupancy/energy on main
  too).

---

**Summary: all pass.** 12/12 shots settled with exactly one live WebGL canvas and zero console
errors; every colour sample matched its token exactly (ΔE₀₀ 0); every measured box matched spec
exactly (0 px off, well inside ±2); typography matches §4.3 wherever the probed selectors are on
screen (phone's desktop-only font probes read null by selector scope, not a defect — see notes
above); components present and shaped as the concepts, with ruled differences from spec named
inline; science text identical to `main` on every compared field. No failing item; no task to
route anything to.

Taken 2026-10-13 at commit `3f8b331`.

---

## Re-taken after the owner's tuning (Task 20a)

**The composites in this folder were re-taken on 2026-10-13 at commit `f774559`**, after the
owner's review of the Task 19 set (rulings R20a-1..4): one phase palette in both themes
(Light Clean's lobes are now `#FF7A2F` / `#2F6BFF`, as in Deep Space; the key swatch carries a
`swatch-ring` outline for 3:1), a fresh session opens at opacity 0.7, Glow tuned towards the
concept (dimmer translucent body, whitened mesh-line network, wider same-phase rim, soft band
halo; values in `GLOW_TUNING`), and crisp strip thumbnails in the main view's look
(tile × dpr × 2, 4× MSAA, same opacity and Glow). The section tables above describe the Task 19
captures; the layout, token, box and typography results are unchanged in the re-take.

Same tool, scenes, file names and composite commands as Task 19, with one addition:
`node tools/design/shoot.mjs --task 20a --scenes c-whole,c-2pz,fe-shell --themes dark,light
--sizes desktop,phone --gl metal --wait 6000`. `--gl metal` renders headless Chromium on the
Mac's GPU (ANGLE Metal) instead of SwiftShader, so Glow's mesh lines and halo are shot as a user
sees them, never latched off by ruling R10's guard on ~80 ms software frames (ruling T15-softgl).
Phone shots show no lines or halo by design (`lowPower`, spec §15).

Re-take results (`/tmp/6g1-20a-metrics.json`): 12/12 shots `settled=true`, `webglCanvases=1`,
`errors=0`; every colour sample ΔE₀₀ = 0 against its token (canvas on/off within 5); boxes
top bar 56, rail 76, Explore 315, inspector 290, phone top bar 52, phone header 44 — exact;
Inter Variable, title 20/600, nav 14/600, body 13/400. `controls card` reads `missing` on desktop
shots for the capture-time reason in the preamble. `science_diff.mjs` against `origin/main`
@ 15feebc (`/tmp/6g1-T19main-metrics.json`; main has not moved): **science text identical to main**.
