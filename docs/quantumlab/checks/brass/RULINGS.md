# Brass Instrument — rulings

Every decision made while building the Brass Instrument world (spec docs/superpowers/specs/2026-11-01-brass-instrument.md, plan docs/superpowers/plans/2026-11-01-brass-instrument.md), copied from the build ledger. Format: what was decided — why — what it costs if wrong.

- Ruling P1: T1 does not touch the wordmark; T2 owns it (gradient removal included) — one owner per file region — if wrong, T1 leaves a violet literal one task longer.
- Ruling P2: the specimen title at 26 px and the serif break DESIGN.md's No Shouting / no-display-face rules on purpose; the documenter rewrites DESIGN.md at finish — cost if wrong: a reviewer flags it against the old DESIGN.md; point them here.
- Ruling P3: plot curves in the light inspector keep the light twins while the dark field uses CURVE_COLORS — today's cross-theme agreement level — cost if wrong: one palette switch in App's plot props.
- Task 1: complete? pending review — impl cb03f0f (agent a55a9ea9fd62e0f29), base d3087e1
- Ruling T1-a: the implementer's text-3 moves in all 8 tempers (escape rule, extended to bg-bar and surface-3) are accepted — every text role must read on every surface it can sit on — cost if wrong: text-3 a few L points off the plan table.
- Parked → T3: (1) png.test.ts light-ink `it.failing` turns back into `it` once export ink follows VIEWPORT_MODE; (2) a resolved-cascade regression test (nested data-theme in a data-level root) once the overlay layer exists; (3) title-block text-2 over a lit lobe is 3.70/3.12:1 — T3 raises `scrim` density (token) until text-2 ≥ 4.5 over the lobe, else sets the subtitle in text-1.
- Parked → T4: emit each temper once with a 2-selector list instead of two identical blocks (tokens.css size); tie index.html's inline level list to TEMPER_LEVELS by test; useLevel's DOM effect → ViewerRoot only.
- Task 1: complete (cb03f0f)
- Ruling T2-a: phone Info title stays 17 px serif (not bumped to 14) — a title, not body — cost: a one-line CSS revert.
- Parked → T4: admin wordmark test name/assertion; pin "no .info-title 14 px rule"; dead .ql-wordmark-first/second classes (keep if a test needs structure); kebab() in the basics type block.
- Parked → T5 shots: top bar 761–1100 px and phone bar 320–360 px with the wider wordmark; long 26 px title incl. request-open.
- Task 2: complete (2e6b59d)
- Parked → T5 live: Bonds and Basic phone headers in light landscape (any other bare page chrome on the canvas); a drilled-down Atoms strip on phone light (back tile arrow).
- Task 3: complete (917dd69)
- Ruling T4-b: those chips take selected-fill + on-fill + selected-edge (spec's selection language) — cost if wrong: owner prefers solid brass chips; one CSS revert.
- Ruling T4-a: favicon recoloured to brass (same drawing); sweep extended to public/*.svg|html — cost: none.
- Ruling T4-c: search's keyboard-active option gets a 2 px inset selected-edge marker — cost: none.
- Ruling T4-d: PNG export's scale bar mirrors the on-screen graticule — cost: export look change only.
- Parked → T5 live: toggle-group middle selected ToggleButton shows a brass border-left in a real browser.
- Ruling T4-e: PNG export's brass is the Explore temper (an export is a document, not the reader's level) — cost: a Basics/Research export's bar is a shade off the screen's.
- Task 4: complete (c92ac15)
- Ruling T5-a: fix D1/D2 in a fix round — the wordmark steps down by width band and the phone wordmark is 18 px in ink (spec B3 "ink on the phone"); acceptance = no clip/overlap at 761–1440 px (5 px steps) at all four levels in both themes, and phone 320–430 px — cost: the brand is a little smaller on narrow screens.
- Fix D1/D2: d7e522d (agent a127d7e57110ba412) — measured clean 761–1440 all levels/themes, phone 320–430. Accepted: wordmark 24/20/18 by band, bar gaps 16 below 1160, search min-width 150 at 1100–1290, phone atom mark hidden <370 px. Ruling T5-b: phone wordmark stays brass; spec B3 wording corrected.
- Finish review (impeccable-finish-reviewer a7ceb3b25fa5e2400) on d7e522d: disposition fix. Material: Research temper drifted blue (hue change); field cards change temper with level; phone white page chips on the field + sans caption; serif subscripts flat; FORM seed note; browser selection/caret/scrollbar; empty Selection track; Info scroll edge cut.
- Ruling F1–F8: see finish-fix-brief.md (warmth-only tempers with new values; field = Explore temper at every level; phone on-field items → field scope, serif caption name; sub drop; browser surfaces; no empty track (no new copy — one-home rule); Info fade; brass tab underline; unboxed scale bar). Declined: title scrim, provenance pill restyle, molecule axis marks (a feature, not a look). FORM seed note: controller edits the brief.
- Finish fix batch: e48cbc1 (agent ab795e858d44145e4; read-only git stash list slip). Sub digits via real <sub> (Source Serif has no subscript glyphs). Field also resets Basics sizes. FORM seed note: committed by controller.
- Finish verdict (a7ceb3b25fa5e2400): fixes 1–8 resolved; regression = orphan Selection heading → controller fix 8f29263 ('Nothing selected', unspoken) + FORM 'pinned'. Gates green (one jest load flake, clean rerun).
- Final whole-branch review (opus aecc6b920911e7ec6) on fcb73de: With fixes — 0 Critical, 2 Important, 8 Minor (final-review.md).
- Ruling FR-1 (I1): the two worlds are named "Obsidian" (dark) and "Ivory" (light) everywhere a name is shown or spoken (ThemeSwitch menu, tooltip, aria-label, admin); the glTF line names what it exports: "colours as shown on the dark field" — naming is the controller's call (owner memory: renaming is mine) — cost: a string swap.
- Ruling FR-2 (I2): dark `danger` lifts (hue kept) to ≥ 4.5 on every dark surface-3; status colours + accent-text-on-bg-bar pinned per temper on bg-app/bg-bar/surface-1/2/3; light pairs under 4.5 on surface-3 (pre-existing on main) lift too if the pin catches them.
- Rulings on Minors: M1, M2, M3, M4, M6 fix; M5 preload the latin woff2 of Source Serif in both entries; M7 pin "text-3 / accent-text never on selected-fill" by documenting in DESIGN.md + a contrast test that selected rows use on-fill; M8 noted for productisation, no action.
- Final fix wave: 4467fb2 + 37088ac (fresh agent a0ddab569a4c07941 finishing an interrupted implementer's diff). Controller verified science files comment-only since fcb73de; only the approved axes move changes hex since main.
- Final fix wave re-review (sonnet aaa8d2da14620f517): all addressed (I1, I2, M1–M7), nothing broken, science comment-only. Branch ready for the owner's live test.

## Finish-review fix rulings (F1–F8)
## F1. Level tempers vary in warmth and brass brightness only — never hue (Research drifted blue)
Replace the basics, advanced and research columns of the temper table in src/design/tokens.ts (and the verbatim copy of the table in tests) with these values. Explore stays exactly as it is in the code today (incl. the earlier text-3 escape-rule values). on-accent/on-fill/rail-active/avatar/accent-text/accent-fill/selected-edge follow the same derivation as now (accent-text = accent-fill = selected-edge = accent; rail-active = selected-fill; avatar = accent; on-fill = text-1).

| role | dark/basics | dark/advanced | dark/research | light/basics | light/advanced | light/research |
|---|---|---|---|---|---|---|
| bg-app | #18140E | #151512 | #151513 | #F8EFE0 | #F2F0E9 | #F1F0EB |
| bg-bar | #18140E | #151512 | #151513 | #FFF9EA | #FCFAF3 | #FBFAF5 |
| surface-1 | #26221C | #232320 | #232321 | #FFFBEC | #FEFCF5 | #FDFCF7 |
| surface-2 | #2E2923 | #2B2A28 | #2A2A28 | #FDF3E4 | #F6F4ED | #F5F5EF |
| surface-3 | #37322C | #333330 | #333331 | #F2E8DA | #EBEAE2 | #EAEAE4 |
| border-subtle | #3B342A | #363532 | #363533 | #EADCC6 | #E1DED3 | #DFDED6 |
| border-strong | #635337 | #5F543E | #5C5543 | #D5C1A7 | #CFC2AC | #CDC3AF |
| text-1 | #EEE7D7 | #ECE7DC | #EBE7DF | #2A261E | #292721 | #292722 |
| text-2 | #BBAF95 | #B7AF9E | #B5AFA2 | #675C43 | #645C4D | #625C50 |
| text-3 | #A59A84 | #A29B8B | #A09B8F | #726851 | #6F6859 | #6E685D |
| accent | #DAAA54 | #BD9D5C | #B7A16E | #8E6011 | #7A5C20 | #705826 |
| selected-fill | #443212 | #3F341C | #3D3422 | #F8E1C3 | #F2E3C8 | #EFE3CC |
| focus-ring | #EEBD67 | #D1B06F | #CAB381 | #8E6011 | #7A5C20 | #705826 |
Controller-computed minima on bg-app/bg-bar/surface-1/2/3: text-1 ≥ 10.27, text-2 ≥ 5.44, text-3 ≥ 4.54, accent ≥ 4.81 (s1/s2), focus ≥ 4.52, text-1/selected-fill ≥ 9.91, accent/selected-fill ≥ 4.32. If a pinned pair still fails, the text-3 escape rule applies (OKLCH L steps of 0.01, that cell only), recorded in the report. Basics' type/radius overrides are unchanged.

## F2. The viewing field does not change with the level
Every card drawn on the field (title block, keys/legend, orbital-tile key, hover hint, scale bar, notices, the strip's tiles, the toolbar buttons) uses ONE field-scoped set of tokens that is the same at every level: the field scope always resolves to the Explore temper of its mode (dark), whatever the root's data-level. Page chrome nested back inside the field (PageScope: drawer, phone sheet, etc.) keeps the page mode AND the root's level temper, as now. Implement in the generated CSS (tokens.ts → tokensCss): e.g. mark the field cell (data-field on #canvas-container or ViewportScope's element) and emit a field block with higher specificity than the `[data-level] [data-theme]` descendant temper, then make PageScope's descendant temper win again inside it. Prove it with tests/design/field_cascade.test.ts: field at root level research/basics resolves to the dark Explore values; a PageScope inside it resolves to (page mode, root level). The nested MUI ThemeProvider for the field uses quantumTheme(viewportMode, 'explore').

## F3. Phone: what sits on the field takes the field scope; the caption's name is serif
On the phone, anything drawn over the field without its own full-width band — the molecule picker chip, the Library/tier chip, the caption, the landscape compact top bar — takes the field scope (dark field tokens) instead of light page chips; the data-field-mismatch light-chip rules for these go away. Banded page chrome (the phone top bar when it has its own band, the bottom sheet, the sheet's tab bar) keeps the page mode. The caption's name (what is drawn) is set in the serif (var(--ql-font-serif)), at its current size; the rest of the caption stays Inter. Re-measure phone portrait and landscape in both themes: nothing overlaps, everything ≥ 4.5:1 on its own ground.

## F4. Serif formula subscripts drop
In the serif specimen title (.viewport-title h1) and Info's title (.info-title), the <sub> digits in names like H₂O / C₆H₆ / 2p_z must drop below the baseline and shrink (today the digits in "Water (H2O)" sit on the baseline at nearly x-height). Find why (font-variant-position, a sub rule that resets, line-height clamp, or the serif face's sub feature) and fix with CSS for those two titles (e.g. `sub { font-size: 0.68em; vertical-align: -0.28em; line-height: 0; font-variant-position: normal; }`). Live-check "Water (H₂O)", "Benzene (C₆H₆)" and "Hydrogen — 2p_z orbital".

## F5. Browser surfaces take the world
Port the admin's ::selection, caret-color and scrollbar-color theming (src/admin/admin.css) to the viewer (src/style.css), using the temper variables (selection = selected-fill background + text-1; caret = accent; scrollbar = border-strong on transparent). Pin with a CSS test.

## F6. No empty track under "Selection"
In the Molecules left panel, the "Selection" slot draws an empty rounded track when nothing is hovered/selected (reads as an empty progress bar). Do not draw the track's fill/border while it is empty; keep the slot's height so nothing jumps when it fills. (Do NOT add placeholder copy — "Hover or tap an atom or bond" already shows on the field; DESIGN's one-home rule.)

## F7. Info's scroll edge fades
Info's inner scroller cuts lines in half at its bottom edge ("Potential range" in desktop.png at y≈431). DESIGN.md's Tonal Scroll Cue Rule requires a ~24 px mask fade while scrollTop + clientHeight < scrollHeight. Find whether the fade is missing, too weak, or not toggled in this state, and fix it (keep the hairline pixel opaque). Pin with a test of the class/attribute that drives it.

## F8. Ceiling items the controller takes
- The active top-bar mode tab's underline is the brass selected-edge (2 px), not ink.
- The scale bar sits straight on the field: no card (no background, border or shadow); the brass rule, ticks and its text-1 label stay; keep its camera-inset zone and position. Check its label's contrast over the field gradient at both ends (≥ 4.5:1).

Not taken (record in report as declined, no action): the title box → soft scrim; the provenance pill restyle; axis marks around molecules.

## Final-review fix rulings
- FR-1 (I1): rename the two worlds to "Obsidian" (dark) and "Ivory" (light) everywhere a theme name is shown or spoken: src/design/ThemeSwitch.tsx THEME_LABEL (menu items, tooltip, the button's aria-label "Theme: Obsidian"), the admin page that shares it, any other occurrence of the old names in UI copy (grep "Deep Space" / "Light Clean" across src and public; comments too — see M1). The glTF export line in src/export/run_export.ts reads "colours as shown on the dark field" (the export always uses the field's colours). Update tests that pin the old strings. DESIGN.md / .impeccable/design.json: name the worlds Obsidian and Ivory where they describe the theme choice.
- FR-2 (I2): lift dark `danger` (keep its hue, OKLCH L up in 0.01 steps) until ≥ 4.5:1 on every dark temper's surface-3 (Basics #37322C is the lightest). Add per-temper pins (all 8 mode×level) for success/warning/danger on bg-app, bg-bar, surface-1, surface-2, surface-3 and accent-text on bg-bar. Any light status pair that then fails on surface-3: darken that status in L steps of 0.01 (hue kept) until it passes. Record every changed value in the report and in DESIGN.md/design.json.
- M1: rewrite the stale Deep Space / Light Clean / Deep Selection / glow comments listed in the review to describe the current brass behaviour.
- M2: fix the four contradicted comments (F6 slot comment now says the slot shows its state "Nothing selected", not the hint; delete the orphaned F3 tier-badge comment; drop the dead var() on html/body or fix its comment; LevelNav's palette comment says page palette).
- M3: fix specificityOf in tests/design/field_cascade.test.ts so :not(X) counts as X only, and its comment.
- M4: one source for the field's mode — ViewportScope hands the cell its data-theme / data-field (render prop, like FieldScope), App stops computing them separately. Keep #canvas-container's id, classes and the existing behaviour; tests must still prove one renderer never remounts.
- M5: preload Source Serif 4's latin woff2 (the variable file fontsource ships) in public/index.html and public/admin.html via the built asset path (use Vite's mechanism — e.g. an import with ?url in the entry and a <link rel=preload> injected, or Vite's own preload handling; do not hard-code a hashed filename). If no clean Vite-native way exists, skip and say why.
- M6: revert the no-op hunk in src/levels/useLevel.ts:35-36.
- M7: add a contrast test that every selected row/option style uses on-fill (or text-2) ink, never text-3 or accent-text, and a one-line DESIGN.md note "text-3 and accent-text never sit on selected-fill".
- M8: no action.
