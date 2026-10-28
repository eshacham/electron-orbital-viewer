# Finish review — learning levels and Info (2026-10-27, HEAD 874143d)

disposition: fix

Inputs and limits: no QUALITY BAR card was supplied, so ceiling is judged against DESIGN.md. `.impeccable/review/*.png` dates from Oct 26 17:01, before this build, so I set it aside and used the CHECKLIST shots plus the `/tmp/6g1-lv-*` sweep. No capture anywhere shows a pressed (i) or the topic chip, in either theme. I read the comp as HTML source and did not render it. The `impeccable` CLI is not installed here, so `--check-seed` could not run. I did not read the rest of DESIGN.md, `basic_info.ts`, `atom_info.ts`, `bonds_info.ts` or task-9-report.md. I edit nothing, so the parent should save this return to `.impeccable/critique/2026-10-27-levels-finish.md`. Mapped to your three words, `fix` means **not yet**: it becomes ship after fixes 1–4 land and a verdict pass on new captures clears them.

## persistence
**Pass, with notes.**
- PRODUCT.md is present. This is a code-led build, so it needs no state.json, spec or comp-diff. The only comps are under `mocks/decision-levels/`, so no approval record is needed.
- DESIGN.md predates the build. Its tokens still match what was built, because `src/design/tokens.css` is unchanged against main. The levels, Info and (i) entries are still waiting for the documenter (CHECKLIST.md:24).
- FORM carries `seed:4e476c80448e1899`, which is 16 hex and not a raw key. I could not confirm it on this machine, so the parent should check it against the roll output.
- Science colours, Glow and Atoms colours are **untouched**. The only change in a colour-related file is `src/molecules/esp_color.ts`, which adds sentences only and leaves ESP_STOPS alone. `orbital_glow.ts` and tokens.css are not in the diff. Phase orange and blue match main in every shot.

## fidelity
The comp is a critique reference, so this is not an element-by-element matrix.
- **TYPE: match.** Inter with tabular figures, plus typeset subscripts (3d_z², 2p_z, σ_g, C₂ᵥ) in chips, the strip, titles and facts.
- **MATERIAL: match.** Standard controls and tokens only. No imitation materials.
- **GROUND: match.** Deep Space `#020F1D` and Light Clean `#F4F7FB` are unchanged, and the shots agree.
- **What the comp dared and the build did not:**
  - The comp's Info lead is 3 plain lines and explains the phase colours in words.
  - The build's Explore Orbitals lead is 7 lines (item2) and ends with a navigation sentence ("Pick an element in Atom mode…").
- **The critique's shared failures:**
  - **Code-style names:** fixed, except one e-notation value in the Molecules canvas subtitle ("ρ = 2.66e-2 e/a₀³"). Info itself prints it as "2.66 × 10⁻²".
  - **Missing units:** fixed in scope (scale a₀, plot axis "35 a₀", Iso value). Values still shown in Ha first are out of scope.
  - **Unnamed phone canvas:** fixed. The caption appears under the header in research-water-light-phone and the Bonds phone shot.
  - **Captions as walls:** partly fixed. Panels now hold controls and short labels, which keeps the THESIS. But the walls moved into Info at Explore (Orbitals lead; the two-sentence Kohn–Sham caveat in item4).
  - **Repetition:** not fixed.
    - Bonds Research: R = 2.07 a₀ (1.098 Å) shows three times (slider label, subtitle, Info fact). ρ = 0.002 e/a₀³ shows three times (subtitle, canvas key, Info lead).
    - Molecules: the subtitle repeats the title.
    - Atoms: the ionisation energy and the configuration each show in both the left panel and Info.
- **Level bands:** contradicted at Basics in Molecules.
  - Info shows "Point group (i) C₂ᵥ" and "Dipole μ (i) … (CRC Handbook, via CCCBDB)". Scientific terms with (i) belong to Advanced and references to Research.
  - Info explains the dipole arrow, while the panel line says "the dipole arrow … appear at Explore". One of the two is false.
- **Subtitle:** contradicted at Basics. Atoms Basics reads "|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic". The contract asks for one plain subtitle.
- **(a) Info cut-off cue: missing, and a cue is needed.** At Explore, water and glycine put "How this was computed" entirely below the fold. Basics Molecules cuts Info mid-sentence ("many chemistry texts draw it the other"). The Research summary sits below the fold everywhere. The cue that fits the world is a bottom fade mask on the Info scroller, shown only while more is below:
  - It is tonal, which follows "Depth is tonal first".
  - It works the same in both themes.
  - It avoids a drop shadow (which DESIGN.md bans on Deep Space panels), a glow (banned in Light Clean), and an arrow glyph or "More" label.
- **(b) (i) and topic-chip pairing:** light is clear, dark is weak, and neither is captured.
  - **Light:** solid `#1662E0` with a white glyph or text. Clearly visible, and a true pair.
  - **Dark at rest:** a `#4C9BFF` ring with a transparent fill.
  - **Dark when pressed:**
    - a `#0E3A99` fill, about 1.8:1 against surface-1 `#071828`;
    - a `#1FB6F5` ring;
    - a white glyph.

    At 20 px, the change reads mostly as blue turning cyan. It has none of the halo that every other dark-theme selected state (Deep Selection in DESIGN.md) carries (DESIGN.md:357), so a pressed (i) among 5–7 resting ones is hard to find. The chip itself reads well because it is larger.
  - **Quiet at rest:** yes at Basics (two (i)s). It gets loud at Atoms Research, where 7 or more show and two float at the panel's right edge, not next to any term (item3-after-c-2pz, x≈300 on the K-shell and subshell rows).
- **Added without approval:** none.

## ceiling
- The pressed (i) has no Deep Space halo.
- The Info scroller has no edge treatment. `scrollbar-gutter: stable` reserves 15 px of empty space but draws nothing on macOS.
- Fact labels break mid-term ("Total / energy", "Measured / (NIST)", "HOMO–LUMO / gap"), so the fact list reads ragged, not as a table.

## material_fixes
1. **Basics band leak (level table).**
   - Give Point group `min: 'advanced'` (`src/info/molecule_info.ts:226`).
   - At Basics, show the dipole value without the reference; the reference goes to Research (`:229`).
   - Show `DIPOLE_CONVENTION` only when the arrow is actually drawn at this level (`:215`, default `showDipole: true` at `src/store/moleculeSlice.ts:61`), so it stops contradicting "dipole arrow … appear at Explore".
2. **Repetition (THESIS "one home", the critique's #1 failure).**
   - The canvas subtitle should be one plain line that does not restate the title or Info's numbers.
   - Remove the e-notation "ρ = 2.66e-2 e/a₀³" from the Molecules subtitle (I could not find its source).
   - Drop Bonds' duplicated ρ/R strings from either the subtitle or the canvas key.
   - Drop the ionisation-energy line from the Atoms panel (Info's fact keeps it).
3. **Subtitle not plain at Basics or Explore** (`src/shell/view_title.ts:46`, `:63`). Band "|ψ|² isosurface · … · method" by level, and move the method to Info's "How this was computed" below Advanced.
4. **(a) Scroll cue.** On `.inspector-info` (`src/shell/inspector.css:11`), add a bottom `mask-image` fade of about 24 px, toggled by a class while `scrollTop + clientHeight < scrollHeight`. Apply the same rule to the phone sheet body.
5. **Walls inside Info** (contract: "short plain explanation", "compact").
   - Cut the Basics and Explore leads to 3 lines or fewer, as the comp does (`src/info/basic_info.ts`, the 3dz² lead).
   - Remove the navigation sentence from the lead.
   - Merge the Kohn–Sham caveat into one sentence (`molecule_info.ts:205`).
6. **(b) Pressed (i) in dark** (`src/info/info.css:66-69`). Add the Deep Space selection halo, `0 0 0 2px rgba(31,182,245,.35)` as on the strip tile, in dark only. Then capture the pressed (i) with its topic chip in dark and light, desktop and phone, because no evidence of the owner's amendment exists yet.
7. **(i) only beside terms.** Move the two edge-floating (i)s in the Atoms panel (K-shell row and subshell row) next to the word they gloss, or drop them.
8. **Fact grid** (`src/info/info.css:36-38`). Keep `dt` labels on one line (`white-space: nowrap`, with a minimum label width) and let `dd` wrap, so "Total energy", "Measured (NIST)" and "Dipole μ (i)" no longer break.

## keep
Keep these as they are while fixing:
- Info as the single quiet section at the top of the right panel, capped at 45 % so Plot and data stays visible.
- The level control's hide-not-grey rule with its one-line "appears at …" pointer.
- The typeset names.
- The phone caption.
- The science colours, exactly as they are.


---

# Verdict pass (HEAD 927667d)

Format note: you asked for the first review's five sections. For a verdict pass my contract is two sections, `verdict` and `remaining`, ending with the disposition, so that is what follows. Mapped to your three words, the result is **ship**.

What this pass did not cover:
- I did not start Vite. The reviewer is barred from rendering, so I judged only from the committed shots.
- Some shots are older than round 2 (`e2637ae`/`e8189de`, 21:27–21:36):
  - The dark phone pressed-(i) shots still show the 9b hard ring, not the ruled soft glow.
  - The dark desktop ESP shot still shows the old centred "‹ Back".
  - Both were superseded by the `fix9c-*` shots.
- No capture after round 2 shows Atoms Info's default facts at Research. So the "Info drops Configuration" ruling is checked in code and the 9c report only, not on screen.
- I read the 9b report and the CHECKLIST in part. I did not re-read the contract, PRODUCT.md, DESIGN.md or the comp; I relied on my first review's reading of them.

## verdict
1. **Basics band leak: resolved.**
   - `finish-after-basics-water-dark-desktop.png`: Basics Info has no Point group and no CRC/CCCBDB reference. The dipole shows as the computed "1.86 D".
   - In code, Point group is `min: 'advanced'`, and the experimental value and citation come from Advanced and Research (`src/info/molecule_info.ts:240-242`).
   - `fix9c-dipole-held-basics-water-dark-desktop.png`: the convention sentence now sits beside "Showing the dipole arrow — Display controls appear at Explore". That matches the arrow actually drawn, so the contradiction is gone.
2. **Repetition: resolved.**
   - The Molecules subtitle is "electron density · 90 % enclosed": no title repeat and no e-notation.
   - The Bonds subtitle is "electron density", with ρ and R gone from it. R remains only as the slider's readout and the Info fact; ρ as the canvas key and Info's technical sentence.
   - The Atoms panel no longer has an ionisation-energy line.
3. **Plain subtitle at Basics and Explore: resolved.** Explore 3dz² reads "electron cloud · 90 % enclosed", and the phone captions read "Carbon · electron density". The method appears only at Research ("|ψ|² isosurface · LDA, non-relativistic").
4. **Scroll cue: resolved.**
   - Both `fix9c-cue-hairline-bonds-n2-{dark,light}-desktop-crop.png` shots show a tonal fade with the hairline above "Display" still drawn.
   - The phone sheet fades the same way.
   - The cue is off where Info fits (`finish-cue-off-*`).
   - There is no shadow, glow, arrow or "More".
5. **Walls inside Info: resolved.**
   - The 3dz² Explore lead is 3 lines with no navigation sentence, and "How this was computed" is now above the fold.
   - The Kohn–Sham caveat is one fact-row (i) plus one band sentence.
6. **Dark pressed (i): resolved.**
   - In `fix9c-pressed-among-resting-c-2pz-dark-desktop.png`, the pressed Subshells (i) has the fill, a cyan edge and the soft strip-tile glow. It can be found at a glance next to the resting Shells (i) and Relativity (i).
   - The "Subshell" topic chip in Info uses the same fill, which makes the owner's link visible.
   - Light uses a solid accent with no glow in both modes, on desktop and phone.
7. **(i) beside terms: resolved.** "Shells (i)" and "Subshells (i)" now sit right beside their words, and the two (i)s at the panel's edge are gone.
8. **Fact grid: resolved.**
   - "Total energy", "Measured (NIST)", "Ionisation energy (C → C⁺)" and "Bond length R" each stay on one line.
   - A long value drops below its label as a whole, at the right, and the 9c Br⁻ shots report zero overflow.

Regressions from the fix batch, at most three:
- **Label-only rows (from fix 8), not material.** At Research a long value now gets its own line, so "E − E(atoms) (i)" and "Total energy" stand alone above their values. The grid still reads as a table, but the hanging rows are the cost. It is worth one look in polish, for example shortening the Ha part of the energies, which is already queued for the science-corrections step.

Not a regression, but the same pattern as fix 7: the Relativity (i) sits at the right end of its segmented control, not beside the word "Relativity". This is the same arrangement as the ESP key's (i) beside the key it explains, so I accept it as a gloss on the control.

Science colours, Glow and the Atoms colours are unchanged. The only token change is the new `--ql-shadow-selected-halo` (dark: `0 0 12px 1px rgba(31,182,245,.5)`; light: `none`). `esp_color.ts` changed sentences only, `delta_scf.ts` changed method text only, and the phase orange and blue match in every shot.

## remaining
Clear of material findings.

These are non-blocking and need no new verdict:
- Re-shoot the dark phone pressed-(i) shots so the record shows the ruled soft glow rather than the 9b ring.
- Capture Atoms Research Info's default facts once, to show the Configuration fact is gone.
- The label-only fact rows are a polish item.

This ship covers the eight scored fixes and the controller's rulings as applied. It is not a fresh full review of the surface.

Files:
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/.impeccable/critique/2026-10-27-levels-finish.md
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/levels/CHECKLIST.md
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/levels/fix9c-pressed-among-resting-c-2pz-dark-desktop.png
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/levels/fix9c-dipole-held-basics-water-dark-desktop.png
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/levels/fix9c-cue-hairline-bonds-n2-dark-desktop-crop.png
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/src/info/molecule_info.ts

disposition: ship
