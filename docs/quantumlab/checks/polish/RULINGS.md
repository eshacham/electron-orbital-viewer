# Rulings made while building the final polish (2026-10-30/31)

Copied verbatim from the execution ledger before it was deleted. Spec: docs/superpowers/specs/2026-10-30-final-polish.md. The owner flags for the local test are in CHECKLIST.md.

- Ruling: accept concerns 1–3 — honest clamping, and "the orbital already drawn draws nothing extra" needs the debounce.
- Ruling (c4): data-dependent clamps stay unreported for now — the parser can't know them; the picture and Info show the value used. Parked.
- Ruling (c5): the two Dismiss buttons need distinct accessible names, "Dismiss level notice" and "Dismiss link correction". Goes in the T1 fix round if the review finds anything; otherwise the controller makes it.
- Ruling (M2): when a link's combination takes the view, its Basic n/l/mₗ corrections are not reported, because they don't describe what is drawn. Cost if wrong: one condition.
- Ruling (M3): atom l and mₗ have fixed bounds, so they are reported like atom n. Only "does this element have that shell" stays unreported. Cost if wrong: one report.
- Ruling (M5): a ⌘K re-pick of the drawn orbital redraws if its last render failed. A re-pick is the natural retry. Cost if wrong: one condition.
- T1 re-review: all addressed. Parked: atom n correction fires without a level key (pre-existing).
- Ruling: accept the MO hover edge and the Molecules icon swap — same look, a real icon, consistent across the app.
- Ruling: the Atoms table's Ha column shows 1 decimal at |E| ≥ 100 Ha and 3 decimals below (≥5 s.f. either way), so heavy atoms fit the 300 px panel without a scroll. Cost if wrong: a format branch. Goes into the T2 fix round.
- Ruling: the table's eV column shows a whole number at |E| ≥ 1000 eV (the same rule as the chips' evText), 2 decimals below. Cells use 4 px padding. Both number columns are right-aligned, as numbers should be. Together this saves ~36 px. Cost if wrong: a scroll wrapper.
- Ruling: a long label may wrap when label and value can't share a row — 'never alone' outranks 'labels on one line' (Fe's 'Ionisation energy (Fe → Fe⁺)'). Cost if wrong: shorten that label.
- T3 re-review: all addressed. Parked: 168 px is an unsupported width; an over-long JSDoc line.
- Ruling: in the drawer the panel is role=region labelled by the bar button, not a tabpanel — a tabpanel without a tab is an ARIA mismatch, and the bar's buttons stay buttons. Cost if wrong: one role. Goes to the T4 fix round.
- T4 re-review: all addressed. Parked: a drawer with two tabbed sections would hide both rows (none exists).
- Ruling: the T6 task review folds into the final whole-branch review — T6 is mostly docs plus a pinned refactor. Cost if wrong: none.
- Ruling (M5): the correction notice gets a spoken plain copy, like other live text (spoken plain digits). Cost if wrong: one string.
- Parked:
- Ruling: this residual is load-bearing (a wrong notice state), so one bounded follow-up goes to the fix-wave implementer: take the baseline identity after pendingView applies; add excitation and relativity to the identity; add tests. The other minors are parked (the hydrogen '(bare nucleus)' wrap, the eager accordion element).
