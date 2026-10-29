# Rulings made while building "the picture is the control" (2026-10-28/29)

Copied verbatim from the execution ledger before it was deleted. Plan: docs/superpowers/plans/2026-10-28-picture-is-the-control.md. The owner flags for the local test are in CHECKLIST.md.

- Ruling: removing handleBasicPick's level gate is accepted. A strip pick always leaves a combination and draws the picked orbital. Before, a strip pick at Advanced did nothing visible, and Review Focus 3 asks for this. If wrong: restore the gate.
- Ruling (T1 M2): the Shell n chips are enabled while a combination is held, and an n pick leaves the combination, the same as the strip. Two pickers with different rules would confuse readers. If wrong: re-disable.
- Ruling: the subshell and orbital (i) buttons live on Info's fact labels, which satisfies spec §7 ("follow the controls"); the strip's group labels stay clean. Flag at owner test. If wrong: an (i) per strip group label.
- Ruling (T1 M3): at Advanced, while a combination is drawn, the strip marks no tile as selected; the combination is what is drawn. If wrong: one condition.
- Ruling: the 'data' ControlId is accepted. "Levels untouched" means the system's behaviour; a new id keeps the pointer line true ("The plot appears at Explore" would be false with the curve on screen). If wrong: drop the id.
- Ruling: the slider's R readout plus Info's R fact stays, as already ruled — the readout belongs to the control.
- Ruling: Help's "adds the plot and data" wording and the He₂ y-label overlap go into Task 4, which owns the curve's labels.
- Ruling: when the scan fails, the block's line reads "No curve to show." — the alert already names the failure, and a failure is said once (ruling C9). Cost if wrong: a string. Goes in the T4 fix round if the review finds other items; otherwise the controller makes it.
- Ruling (fix 2): the drawer's open-state bar becomes a quiet horizontal label on surface tokens, replacing the full-width selected-fill vertical-text bar. It is a shell fix and applies to every mode — it breaks One Blue Voice and the brief puts the drawer in scope. Cost if wrong: restore the old CSS.
- Ruling (fix 5): at Basics, R reads in Å ("Distance between nuclei 1.10 Å") in the block and in the phone caption; from Explore it keeps a₀ (Å), as the levels plan's caption example "CO 5σ · R = 2.13 a₀". Cost if wrong: a format switch.
- Ruling: the open drawer bar puts no chevron between labels. The open tab is marked by a text-1 underline and weight 600 (no accent). A separate "Close panel" control sits at the bar's far right. The one-press close and accessible names are kept. This merges the verdict pass and the task review. Cost if wrong: CSS.
- Parked for polish: the Rₑ line's success green sits awkwardly with the Meaning-Only Status rule (predates 6G-1).
- Ruling (M1): at Basics, the block's screen-reader status and failure alert also give R in Å. Info's 1.098 Å against the block's 1.10 Å stays as is, since Info is untouched by spec and shows full precision. Owner note.
- Ruling: from Explore up, the phone caption keeps "R = 2.13 a₀" (a₀ only), the levels plan's own example; DESIGN.md records what the code does. If wrong: add Å.
- Parked:
