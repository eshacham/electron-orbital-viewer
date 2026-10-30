# Rulings made while building the science corrections (2026-10-30)

Copied verbatim from the execution ledger before it was deleted. Spec: docs/superpowers/specs/2026-10-30-science-corrections.md. The owner flags for the local test are in CHECKLIST.md.

- Ruling: the "(Ha)" column header keeps its visible text, and its accessible name is "Energy (Ha)" — a name must say what it is. Cost if wrong: one attribute. It goes into the T1 fix round if the review finds anything; otherwise the controller makes it.
- Ruling: evText shows |E| ≥ 1000 eV as a whole number ("−1339 eV"), not ×10³ — core energies read next to the table's digits, and ×10ⁿ is for small or huge magnitudes. Cost if wrong: a format branch.
- Ruling (T2 c5): H₂⁺ never uses the core band — it has one electron and two levels, so nothing is core; the glossary says so. Cost if wrong: one condition.
- Ruling (I1): the core split moves to the highest gap over 1 Ha, so everything far below the valence is core. The C 1s and O 1s of CO are core; the old widest-gap split was wrong for CO. Tick step adapts so ticks are ≥16 px apart. Cost if wrong: one rule.
- Ruling (M2): the diagram draws occupied levels, partly occupied levels and the LUMO to scale. Higher empty levels fold into a band above a second marked break, ordered by energy and selectable like the core band. Kohn–Sham virtuals above the LUMO are basis-dependent and say little, and this keeps 5 px/eV mostly unshrunk and the section near the fold. Cost if wrong: unfold.
- Ruling: accept the core-split search limited to gaps at or below the HOMO — empty levels must not decide what is core (N₂@00 would make everything core). Cost if wrong: none.
- Ruling (N1): the fold stays above the lowest wholly empty drawn level. The glossary says "lowest wholly empty level" and adds that, in an open shell, a half-filled level counts as filled. The diagram draws α levels with both spins, so a partly filled level is drawn, not empty. The O₂ 00–02 shrink is accepted with its axis note. Cost if wrong: a fold condition.
- Ruling (I1): the d/f frame needs a full s AND p in the outermost shell (an s–p octet). Otherwise the label falls back to configuration order, and the excited-state words change with it (noted in the commit). Cost if wrong: one condition.
- T2 re-review 2: all addressed (fuzzed 6000 layouts: no overflow or collision). Parked nits: core-band wrap untested (same function as the folded band); two 'one row' comments; terse glossary wording.
- Ruling (M4): in a subgroup labelling regime, degenerate orbitals group by energy (1e-4 Ha) within one spin as well as by label, because subgroup labels cannot express the degeneracy. Detect the regime from what the generator records (check the meta), and check every shipped library molecule. Cost if wrong: one condition.
- Ruling: the neutral chip outline (border-strong, ~1.6–2.0:1) is accepted. The chips are non-interactive and the passing label carries the meaning (WCAG 1.4.11 does not require 3:1 for decoration). Cost if wrong: one token.
- T4 re-review: all addressed; library ×N changes verified independently (the SF₆ split a1g+eg+t1u is right). Nit fixed: the chain-test comment. Parked: legacy symmetry data without a labels field (none shipped).
- Ruling (I1): labels 'none' behave like '?' — group by energy within one spin, since a placeholder label carries no symmetry. Cost if wrong: one condition.
- Ruling (M2): He₂'s well depth reads eV first, with mHa beside it, the same as every other energy. Cost if wrong: a string.
- Final re-review: all addressed; ready to merge. Parked: CSV # comment captions are now eV-first (data columns untouched); remaining local energy formatters are correct but undocumented.
