# The Brass Instrument world (replaces Deep Space / Light Clean)

**Origin.** On 2026-11-01 the owner brought another agent's review and design handoff, now stored in `docs/quantumlab/references/brass/`. The owner then decided:

- "prototype brass, replace both themes if I like it", and build the theme prototype first;
- "slight variation on the theme between the 4 levels";
- "think of the basic as more for basic learning experience, perhaps a younger audience, and the researcher for older more experienced scientists."

The comps are `quantumlab-instrument-dark.png` and `quantumlab-instrument-light.png`. The direction contract is in `.impeccable/surfaces/public-index-html.md`. Nothing ships before the owner tests it live.

## What stays
- Layout, panel purposes, the four modes and four levels, Info, every control, copy and computed value.
- **Science colours.** Phase, density, ESP, curve/shell colours and the Glow finish (owner R24) stay.
- No gesture hint, no new panels, and no "Construct" or "Inspect" panel titles. The concepts guide the look, not the inventory.

## B1. Palette (tokens)
- **Two modes, same token roles.** The handoff palette is the **Explore** temper, and the other levels are slight tempers of it (B2).
  - **Dark:** workspace `#141513`, panels `#22231F`, ink `#EEE7D8`, secondary `#B9AF99`, accent brass `#C4A15A`, divider `#625238`.
  - **Light:** workspace `#F4F0E6`, panels `#FFFCF5`, ink `#292720`, secondary `#655C49`, accent bronze `#806020`, divider `#D4C6A8`.
- **Selection** is a brass-tinted fill plus a brass edge (1 px on controls, 2 px on tabs and tiles), with ink on top. It is never colour alone.
- **No glows anywhere.** The Deep Space cyan halo goes.
- **Focus ring:** a 2 px brass ring, ≥ 3:1 on every ground.
- **Status colours** keep their meanings; they are re-checked for contrast on the new grounds.
- **The wordmark** loses its violet gradient.
- **Contrast floor** on every level and in both modes: text ≥ 4.5:1 on its ground; selection edges and the focus ring ≥ 3:1.

## B2. Level tempers
Each level is a slight temper of the same world, set by `data-level` on the root element. There is one temper per level per mode, and every value is computed in OKLCH from the Explore base.

- **Basics, polished brass (younger learners):**
  - the warmest grounds and the brightest brass;
  - body 14 px (caption 13), and corners 2 px softer.
- **Explore:** the handoff palette exactly.
- **Advanced:** grounds a touch cooler, brass a touch deeper.
- **Research, graphite and pewter brass (experienced scientists):**
  - cool graphite grounds and a desaturated pewter brass;
  - the current dense type (13/12).

Only the chrome changes. The viewing field, the science colours and the layout sizes stay the same at every level. Switching level never moves or redraws the picture.

## B3. Type
- **Source Serif 4 (variable, self-hosted via @fontsource-variable)** sets:
  - the QuantumLab wordmark (brass; ink on the phone);
  - the specimen title over the viewing field (26/32 desktop; the phone caption keeps its size);
  - Info's title.
- **Inter stays** for every control, label, number and running text, with tabular figures.
- No uppercase and no tracking. The admin and jobs pages share the wordmark and tokens.

## B4. The viewing field is dark in both modes
- **Rendering.** The 3D view, its thumbnails and everything drawn over the canvas render against a dark field in both modes. The renderer and those overlays take the dark science variants. The light mode's field is a charcoal `#262622`→`#1C1C19` gradient.
- **Overlays.** The title, toolbar, scale bar, keys, strip and notices take the dark tokens there.
- **One switch.** `VIEWPORT_MODE` in tokens.ts reverts this if the owner prefers a light field.
- **Page chrome keeps the page mode,** including where it sits over the canvas: the inspector drawer, the phone top bar and the sheet.
- **Plots** in the inspector keep the page mode.
- **PNG export** composites onto the field's own colour.

## B5. Signature move: the engraved graticule
- **Scale bar:** a fine instrument scale, a 1 px brass rule with end ticks and graduations, and its label in ivory.
- **Axes:** they take a warm neutral ink instead of the blue, with labels in ink.
- These are chrome, not science, so they may change.

## Acceptance
- **Gates:** jest, tsc, build and admin-split all green.
- **Contrast** is pinned by tests for all 8 mode × level tempers.
- **Shots** are captured in both modes and at four levels of the three prototype states:
  - Basics Orbitals;
  - Advanced Atoms Mg excitation;
  - Research Molecules water ESP / benzene.

  Also at 1280 and phone.
- A finish review and a DESIGN.md rewrite follow.
- The owner gets a live local link.
