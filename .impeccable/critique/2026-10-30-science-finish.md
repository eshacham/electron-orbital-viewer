# Finish review — science corrections (HEAD 8198852)

disposition: fix

Not provided or not read: no direction contract (THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM), so the seed check doesn't apply. No QUALITY BAR card, no hook or detector findings, and no comp: this is a code-led correction step, so the brief's S1–S5 is the authority. I did not read the 2026-10-27 critique snapshots or the plan file, and read DESIGN.md only through targeted searches. Shots I did not open are the light and phone twins of the MO crops I did open, plus tier-computed, the Ga³⁺ and Fe atom panels, the Fe/Fe²⁺ desktop chips, silane, the library-water provenance pair, the CO/N₂ light desktop fulls and the O₂/N₂ phone first screens. I did not see the shrunk-scale state ("scale reduced to fit") in any capture.

## persistence
**Fail, on one point.**
- **Pass:**
  - PRODUCT.md exists.
  - The build is code-led, so there is no `state.json` and no comp round. `.impeccable/mocks/decision*` is exempt.
  - The four `.impeccable/review/*.png` files are valid: Bonds N₂ at Research, desktop and desktop-light at 1440×900, mobile and mobile-first-screen at 390×844, no blank regions.
  - Everything after `f9ca2d2` (`bcea6e3`, `4fb36cc`, `8198852`) is docs or chore, so the source at HEAD is what was shot.
  - Leaving out the phone energy table is correct: `.orbital-energy-list` exists only in desktop `AtomExplore`.
  - The tooltip text is accepted from the Playwright `title` read.
- **Fail: DESIGN.md does not match the built world.**
  - S5 is recorded: the neutral chips (l.478), the valence dot (l.479) and the Rₑ line (l.560).
  - S1, the step's largest visual change, is not recorded. Nothing describes the single 5 px/eV scale, the height following the span with its cap and "scale reduced to fit" note, the eV axis and its tick rules, the "≈ core" and "≈ higher empty levels" breaks, or the sideways-only collision offset.
  - "MO Level Buttons" (l.565) still describes only the button.
  - CHECKLIST Step 3 itself lists DESIGN.md as "pending (controller)".
  - `.impeccable/design.json` was last changed in `aed8e8d` (10-29), before this step, and mentions none of these elements.

## fidelity
Judged against the S1–S5 spec, not a comp.

**S1, the MO diagram**
- **One scale: match.**
  - The ticks are 50 px per 10 eV on the N₂, O₂ and HF crops.
  - H₂⁺'s gap is drawn at about 59 px. He₂'s 0.09 eV pair sits side by side at about −17.9 eV.
  - The 3σg line lands at about −11.9 eV, matching its title.
- **eV axis with labelled ticks: match.**
  - Ticks: −15/−20 on He₂, −20/−25/−30 on H₂⁺, −10/−20/−30 on N₂ and CO, 0 to −30 on O₂ and HF.
  - On N₂ and CO the unit "eV" sits at the head of the to-scale part, under the upper break. That is deliberate (`MoDiagram.tsx:89`), and I accept it.
- **Sideways offsets, never pushed up: match.** Seen on He₂ 1σu*, N₂ 1πu/3σg against 2σu*, CO 1π against 5σ/4σ, and O₂ 3σg.
- **Core band under a marked break: match.**
  - N₂ and O₂ show 1σg and 1σu*, CO shows 1σ and 2σ, HF shows 1σ.
  - H₂⁺ and He₂ have none, per the T2 c5 ruling.
- **"≈ higher empty levels" band: match.** N₂ folds 3σu* and CO folds 6σ. O₂ draws 3σu* to scale at +4.3 eV. This follows rulings M2 and N1.
- **Shrink exception, "its axis says so": unverified.**
  - The code has it: `axis.shrunk` renders "scale reduced to fit" (`MoDiagram.tsx:113`).
  - No capture shows it.
- **Tooltip eV first: match**, on the `title` read "3σg: ε = −11.92 eV (−0.438 Ha)". The pixels can't show it (headless).
- **Phone: acceptable adaptation.** The whole diagram is readable when the sheet is scrolled (N₂ and O₂ `-full-scrolled`).

**S2, eV first**
- **Atoms chips: match**, on desktop and phone ("−8.03 eV orbital energy").
- **Atoms table: match.** It has "Energy (eV)" and "(Ha)" columns.
- **Provenance: match.**
  - Library and computed water both read "−2080.78 eV (−76.467311 Ha) … −0.0156 eV (−0.000574 Ha) of D3(BJ)".
  - The ZPE line reads "0.575 eV (0.021134 Ha)", using the disclosed stand-in value.
- **Bonds Info and Data: match.**

**S3, one valence rule**
- Fe²⁺ reads "Valence: 3d⁶ (outside 3s² 3p⁶)", and Info says "6 electrons in the open 3d, outside a full 3s and 3p": they agree. Match.
- Gd³⁺ (light) reads "Valence: 5s² 5p⁶ · open 4f⁷", and Info says "8 … outer shell and 7 in the open 4f": they agree. Match.
- Neutral Fe reads "3d⁶ 4s²", unchanged. Match.

**S4, degeneracy follows symmetry**
- NO₂: 6a1, 4b2 and 1a2 each have no ×N. Match.
- SF₆: 6t1u and 1t1g keep ×3. Match.

**S5, status colours mean status only**
- **Rₑ line: match.** It is dotted text-2 in both themes and distinct from the dashed marker on the far-R shots. At the default R it sits 3.8 px from the marker, which was accepted by ruling.
- **Tier chips: match.** Library, Computed and exact are neutral outlined chips, and the `#a84300` hex is removed.
- **Valence dot: match.**
  - Gd³⁺ N is green and O is purple. Fe and Fe²⁺ M are the n=3 yellow, which is identical to the 3D legend.

**Unchanged colours: match.**
- The `src` diff touches no palette, science or Glow file.
- LevelNav only reads `CURVE_COLORS`.
- The strip's phase tiles look the same in both themes.
- Nothing to flag.

**Type, material and ground**
- **TYPE: match.** The product UI face is unchanged.
- **MATERIAL: match.** The diagram is a flat SVG chart, which is correct for a data plot, with no faked physicality.
- **GROUND: no OWN-WORLD authority.** No ground token appears in the diff, and the Deep Space and Light Clean grounds read as before.

**Added without approval:** none.

## ceiling
Noted only. All of these are polish, which is out of scope for this step.
- At 1440×900 the MO section's lower part, including the core band, is below the fold for N₂, O₂ and CO. This is accepted under ruling M2 and the T2 concern.
- In the not-to-scale core band, the second level is placed far right (N₂ 1σu*, CO 2σ). In the to-scale part a sideways offset means "near-collision"; here it means nothing.
- The pointer-rest shot shows no visible hover change on the 3σg box.
- The "Energy (eV)" header wraps to two lines next to a one-line "(Ha)".
- In the Bonds Data panel, the "·" separator between HOMO and LUMO wraps onto a line of its own (desktop.png). This predates the step.

## material_fixes
1. **Persistence:** record S1 in DESIGN.md's Bonds section, and in design.json if it carries component entries. Cover:
   - the 5 px/eV single scale, with height following the span;
   - the height cap and the "scale reduced to fit" note;
   - the tick steps (5 or 10 eV, coarser and at least 16 px apart when shrunk) and where the unit sits;
   - the "≈ core" break under the highest gap over 1 Ha at or below the HOMO, and that H₂⁺ never has one;
   - the "≈ higher empty levels" fold above the lowest wholly empty level, with a half-filled level counting as filled;
   - offsets go sideways, never up.
2. **Evidence for S1's one exception:** capture O₂ at a shrinking scan point (00–02) as an MO crop on desktop and phone, showing "scale reduced to fit" under the axis and the adapted ticks. This is the only S1 promise with no pixel evidence.

## keep
Keep levels at their true heights on the single 5 px/eV scale with sideways-only offsets, keep every status colour off the science (neutral chips, text-2 Rₑ line, shell-coloured valence dot), and leave the science, Glow and Atoms colours exactly as they are.

Paths:
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/DESIGN.md
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/.impeccable/design.json
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/src/components/MoDiagram.tsx
- /Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/quantumlab/docs/quantumlab/checks/science/CHECKLIST.md

disposition: fix
