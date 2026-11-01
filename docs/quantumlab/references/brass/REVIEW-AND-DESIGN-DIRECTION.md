# QuantumLab — review and proposed design direction

November 1, 2026. Based on direct interaction with the live app. Proposed direction for discussion and implementation handoff; no production interface changes have been made.

## What the review establishes

The app's existing interaction model is worth preserving: construct a scientific view on the left, manipulate it in the centre, and explain or adjust its display on the right. The four learning levels progressively reveal depth without changing that basic arrangement.

All sixteen level/view combinations have been sampled in the requested order. Research was completed with representative orbital, Magnesium, O₂ and Benzene cases. Rotation, zoom and cuts were exercised across the views. Later right-drag checks verified pan in all four views. Pure molecule hover updated the left selection readout for atoms and bonds. These are representative workflow checks, not an exhaustive test of every control at every level.

The detailed evidence and remaining gaps are in `SYSTEMATIC-REVIEW.md`. Shared-link restoration, downloaded file contents, touch interaction and comprehensive accessibility testing remain unverified. Automated Escape did not exit full screen; its visible exit button worked. The earlier thumbnail/workspace shift was not reproduced at the current wider viewport and remains unconfirmed at smaller widths.

## Preserve these strengths

- Contextual information opens from the exact control or scientific quantity and offers a return to the selected object. Keep this connection and focus behavior.
- Model selection, shell navigation, orbital thumbnails, energy diagrams and explanation work together. They must remain coordinated after restyling.
- Scientific distinctions are unusually explicit: orbital eigenvalues versus ionisation energies; an orbital gap versus an optical gap; exact versus approximate models; constructed or diffuse orbitals versus bound calculated orbitals.
- Research exposes methods, references, provenance and validity limits. Benzene's experimental geometry is explicitly distinguished from an independent test of the calculation. Water identifies the property that was checked.
- Disabled controls explain why they do not apply. ESP uses a fixed density contour; structure-only views have nothing to cut or make transparent.

## Where the experience can improve

### Give information room to be read

In Research, a narrow Info region contains an introduction, numerical values, caveats and a substantial methods explanation. Display and Properties/Plot sections compete for the remaining height. The issue is presentation capacity, not excessive scientific content.

Keep a concise object summary visible. Give explanation and methods a readable expandable area with clear subsections: interpretation, quantities, assumptions, method and references. Let users widen the inspector. Keep the object's key limitation beside its result even when the full methods section is closed.

### Make the active construction unmistakable

During hybrid selection, the earlier n=4 shell remains highlighted while the actual hybrid uses 2s and 2p. Selecting a shell correctly returns to a single orbital, but the visual state can suggest that n=4 is part of the hybrid construction.

Show a clear construction selector—Single orbital, Hybrids, Electric field—and place each construction's active inputs directly beneath it. Preserve the remembered orbital state when switching back. Name the hybrid basis beside its controls.

### Expose model gestures where they are used

Pan works, but its gesture is mainly explained in Help. Add a quiet, dismissible canvas hint: “Drag to rotate · Right-drag to pan · Scroll to zoom.” Make Reset view and full-screen exit easy to recognise. Preserve keyboard equivalents and provide an accessible way to inspect the same selections as pointer users.

### Give thumbnails a bounded role

Thumbnails are useful scientific navigation. Keep them in a dedicated strip whose scrolling cannot move the canvas title or inspector. Maintain a visible selected item and offer compact labels when the orbital family is large. Do not turn every thumbnail into a heavily decorated card.

### Treat readable models as part of theme design

Light Clean changes both controls and canvas. At the tested 45% opacity, the atomic model appeared substantially fainter on its light background. A new light theme needs deliberate model/background and label treatment, not a palette inversion. Preserve the chosen scientific values when changing theme; do not silently change opacity or the meaning of colours.

## Recommended identity: a precise brass scientific instrument

Of the three earlier directions, develop the cleaner brass instrument interface. Retain the Victorian reference's care, proportion and material restraint. Express them through typography, fine rules, aligned numerical readouts and selective brass accents. The richly decorated laboratory can inform promotional illustration; the working application needs space for models and evidence.

The minimalist dark/gold variation remains a useful restraint reference, but the identity should be recognisable beyond an accent colour. Use a consistent specimen title treatment, carefully typeset scientific notation, a distinctive scale/legend system, and the same panel rhythm in dark and light themes.

### Proposed palette, pending rendered contrast checks

| Role | Dark | Light |
|---|---|---|
| Workspace | Obsidian `#141513` | Warm ivory `#F4F0E6` |
| Panels | `#22231F` | `#FFFCF5` |
| Primary text | `#EEE7D8` | `#292720` |
| Secondary text | `#B9AF99` | `#655C49` |
| Active accent | Brass `#C4A15A` | Bronze `#806020` |
| Dividers | `#625238` | `#D4C6A8` |

Use brass for active controls, fine emphasis and brand details. Keep normal body text neutral. Scientific phase colours, shell colours and the ESP scale retain their own meanings and legends; they must not be recoloured to fit the brand. Selection needs an outline or marker in addition to colour.

The light version should feel like a contemporary scientific notebook: warm paper-toned controls, dark ink, restrained bronze and crisp data tables. Prototype both a neutral light canvas and a dark viewing area within the light controls, then compare surface visibility, translucent lobes, cuts and export legibility. Avoid parchment texture behind working text or data.

### Typography and layout

Use a restrained serif for the product signature and specimen headings, a highly readable sans serif for controls and explanations, and tabular numerals for measured quantities. Mathematical symbols and subscripts must remain actual scientific text. Test long orbital names, negative energies, Greek characters and units before selecting the final font pair.

Keep the four views and four learning levels visibly distinct in the header. Preserve the left construction/centre model/right information arrangement. Use resizable, collapsible side panels, a stable viewport toolbar and an independently scrolling thumbnail strip. On narrower screens, show one side panel at a time with explicit access to both; validate this with real interactions before fixing breakpoints.

| Learning level | Proposed emphasis, preserving current capabilities |
|---|---|
| Basics | Plain-language explanation, essential construction, opacity and cutaway |
| Explore | Add plots, data, energies, structure controls and measurements |
| Advanced | Add charge, excitation, relativity, combinations, fields and detailed appearance/export controls |
| Research | Make method, provenance, total energies and limits easy to inspect and compare |

These are depths of the same instrument, not separate student/teacher/researcher applications.

## External AI collaboration

Keep the conversation in the user's chosen AI app. QuantumLab should remain fully useful on its own. Its contribution to collaboration is an inspectable, reproducible scientific state: current object, construction, selected feature, display parameters, method and limitations.

Preserve meaningful control names and visible selected states for both people and agents. Any future agent interface should act through the same validated operations and show changes in the same workspace. A connection indicator or compact action history may become useful if an explicit integration is built; a chat panel is not part of this proposal. Provider compatibility and the integration protocol have not been evaluated in this review.

## Implementation handoff

Start by prototyping the new visual system on three real, demanding states: Basics orbital exploration; Advanced atom excitation; Research O₂ or Benzene with methods and warnings visible. Include a contextual-info detour and its return, hovered selection, a cut model, and a loading state. Show matching dark/light versions using the same scientific state.

Acceptance should include all sixteen level/view combinations, camera and selection behavior, keyboard navigation, lower-level hidden controls, scientific colour legends, warning visibility, responsive panel behavior, exported content and shared-link restoration. Carry the current review's unresolved items into that validation. Implement the presentation without changing the calculations or silently removing advanced capabilities.

## Visual references

See `VISUAL-HANDOFF.md` and the matching `concepts/quantumlab-instrument-dark.png` and `concepts/quantumlab-instrument-light.png`. These are the primary proposed visual direction. The earlier three-direction and ornate light images are background references. Generated scientific imagery is illustrative; the implementation must retain the actual renderer, source data and validated behavior.
