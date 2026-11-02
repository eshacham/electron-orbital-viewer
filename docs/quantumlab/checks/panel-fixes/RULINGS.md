# Panel fixes — rulings

Every decision made while building the panel fixes (spec docs/superpowers/specs/2026-11-02-panel-fixes-design.md, plan docs/superpowers/plans/2026-11-02-panel-fixes.md). The owner delegated every design call ("your reasoning"). Copied from the build ledger.

- Task 1 impl 7af8f07 (agent ab0e612c1b1737d6d). Slip: implementer ran read-only 'git stash list' twice despite the explicit ban. Ruling T1-a: below Advanced the Shell n chips stay (none lit) as the way back from a link's held combination (existing T2-I1) — cost: none. Ruling T1-b: 'Single orbital' wrapping to two lines in a 3-way group is accepted (as Relativity's 'With spin–orbit') — cost: a taller row.
- Task 1: complete (4df5e20)
- Ruling T2-plot: the radial plot follows the inspector's content width (min 258) — a wider panel must widen the graph a researcher reads — cost: one recompute per width step.
- Task 2: complete (bf931bf)
- Task 3 impl 5d59614 (opus ac332bada2f558914). Slip: a shoot.mjs --help probe ran one default shoot on port 5411 (started/stopped in-command; no owner port).
- Ruling T3-a: the doubled "Method" (heading + "Method: B3LYP…" line) stays — the line is shipped copy; owner sees it live — cost: a slightly redundant label.
- Ruling T3-b: the multireference caveat now heads Limits rather than the whole block (T4-d's placement inside the disclosure is superseded by the grouping) — cost: read after Method.
- Task 3: complete (bae7361)
- Ruling T4-casing: a dark casing (canvas-solid uniform, ≈0.85 mix within 1.8× ringWidth) under the brass line — reads on every ring colour — cost: a slightly heavier highlight.
- Task 4: complete (f8aacd2)
- Ruling T5-P4: pass — the light field is a deliberately lighter charcoal (brass spec B4, #20201D vs #10110F); surfaces identical at 100 %, within 3–4 levels at 45 %; the panel spec's "identical" wording was too strict and is corrected — cost: none.
- Ruling T2-max: the separator's max also keeps the canvas ≥ 520 px (1300 px + 560 panel left a 377 px canvas, Library badge collapsed) — cost: a smaller max on narrow desktops.
- Final whole-branch review (opus a7d65585a26480c78) on 52fcac9: with fixes — 0 Critical, 3 Important (I1 shellBandRadius over the whole solver grid → valence chip lights nothing, K a nucleus dot; I2 roving focus lost when the Shell n row changes parent across Advanced; I3 DESIGN.md missing six items), 5 Minor.
- Rulings: I1 per the review's fix (scan r ≤ displayRadius, longest run by extent in r, arithmetic middle, solved-atom test + live re-shoot of K and the valence chip); I2 resetKey tracks the mount position + test; I3 the six DESIGN.md items; M1 separator before the inspector in DOM; M2 aria-valuetext "N px"; M3 comment; M4 keep curveNote as the export-shaped twin, say so; M5 accepted as is (polish later).
- Final fix wave: f5f31d1 db5e556 ea958e5 6adcaeb (opus a2d3101d02cd6b815); live: N chip 181 px brass circle + hover line, K 0.04 a₀ (true-scale ~5 px — accepted: true scale is the owner's rule).
- Final fix re-review (sonnet aa851c98bd3e64d0b): all addressed; Minor aria-pressed wording fixed by controller; K ring ~5 px true scale accepted.

## Final-review fix rulings
- I1: fix `shellBandRadius` (src/atom/shell_pick.ts) as the review proposes: it takes the drawn extent (displayRadius from the profile pickableRingProfile returns — extend ShellPickProfile or add a parameter), scans only grid points with r ≤ displayRadius, picks the longest contiguous run by its extent in r (not point count), and returns the run's arithmetic middle in r. Keep: null when the shell has no run inside the drawn extent; shellAtRadius(result) === n. Tests: keep the synthetic ones (update expectations), and add a solved-atom test (solveAtom + buildAtomProfile for Na and Fe, as the review did): for every shell, 0 < band radius < displayRadius and shellAtRadius maps it back; K's radius is not a nucleus dot (≥ a small fraction of the K ring's drawn width — choose a sensible bound from the real numbers and say why). Live re-shoot: Fe whole atom, hover the K chip and the N (valence) chip — brass circle visible in each band and the plot's hover line shown; save /tmp/pf-fix-k.png and /tmp/pf-fix-n.png and read them.
- I2: BasicExplore's Shell n row: the useRovingFocus resetKey tracks the mount position (e.g. `${atLeast(level, CONTROL_LEVEL.combinations)}:${chipsShown}`) or use a callback ref; test: switch level Explore → Advanced → Explore with the chips shown and assert exactly one chip has tabIndex 0 each time and arrow keys move focus.
- M1: render the separator before `{inspector}` in AppShell (DOM/Tab order matches its place on the panel's left edge); keep its absolute positioning; test the order.
- M2: add aria-valuetext `${width} px` on the separator; test.
- M3: reword the presentation.ts comment (decode is unclamped; set clamps).
- M4: keep `curveNote` as the export-shaped twin of bondsCaptions and say so in a one-line comment.
- I3: DESIGN.md (Brass Instrument system doc) — add/repair the six items listed in the review's I3 (layout line for the resizable docked panel incl. the ≥ 520 px field rule and eov.inspectorWidth never in a link, frontmatter "default" width; a Panel Separator component entry; the Construction control and the Thumbnail Strip line; Info › How this was computed with Method · Limits · Sources and the filing rule; the shell chip's linked state and why it is not a selection; the field ring highlight — brass from TOKENS.dark.accent with a canvas-solid casing, chrome not science). Match DESIGN.md's existing voice and structure; update .impeccable/design.json's matching component/rule entries if they exist (keep it valid JSON).
