# QuantumLab systematic interaction review

Status: all 16 learning-level/view combinations have been sampled in the requested order, with additional interaction retests. This is a hands-on UX observation record, not an exhaustive all-controls audit, scientific validation, or approved redesign. Remaining verification gaps are explicit below.

## Review order and scope

Basics → Explore → Advanced → Research; within each level: Orbitals → Atoms → Bonds → Molecules. Exercise construction, model manipulation, contextual information, data and display controls. Sample representative values and systems; do not claim all elements, molecules or numerical combinations were tested.

The initial Basics pass occurred before the October 30 resume. The resumed live app has a collapsible left panel, a right View/Plot/Data rail and altered orbital construction controls. Earlier screenshots were 1492×905; resumed screenshots are 1280×720. Differences must not automatically be attributed to a defect or a release.

## Camera coverage and limitations

Rotation and scroll zoom were visually verified in all four views during Basics. Reset was used to restore the camera. Cut axes, depth and opacity were exercised on orbital surfaces. Atom whole-shell cut faces can be clicked to drill into the shell. Molecular structure alone correctly disables opacity and cuts, with explanatory text.

Initial browser input could not exercise pan or pure hover. Later supported pointer input verified right-drag pan separately in Orbitals, Atoms, Bonds and Molecules. Pure hover in Benzene updated the left Selection area for an atom (identity/angles) and bond (length). Magnesium shell hover outlined the ring in cyan; a matching left-shell highlight was not observed. These late checks occurred in Research, not in every learning level. Touch/two-finger gestures remain untested.

## Basics — observed

- **Orbitals:** n=2, s/p selection, px/pz changes, contextual Shell/Subshell/Orbital/Phase/Nodes information and return path. Opacity, x/y/z cuts, depth and Off. Rotation, zoom and reset. Full screen opened; Escape did not change the exposed state in that one attempt (not yet reproduced); session later recovered in a fresh tab.
- **Atoms:** selected Carbon through periodic table. Rotated and zoomed whole-atom cut face. Clicked its outer ring → L shell; selected 2p → 2pz. Left selection, breadcrumbs, thumbnail strip and right information coordinated. Orbitals tab at Basics displayed the message that energies appear at Explore. Tested z cut at 70%, opacity 85%, reset. Shell x/y/z available in whole-atom view; Off appears for individual orbital.
- **Bonds:** H₂⁺ distance 2→3 a₀, bonding→antibonding, energy-diagram selection, bond-order and MO-diagram help. Rotated and zoomed; cut x and depth 70→50%, Off. Selected O₂; density 0.002→0.05 e/a₀³; selected singly occupied 1πg* α orbital. Information distinguished ground-state bond order and selected antibonding state.
- **Molecules:** category First examples plus text filter water. Density→ESP→No surface→Orbitals; HOMO→LUMO. Opacity 45%, y cut and depth 35%. Rotation and zoom. Click oxygen gives O atom 1 / H–O–H 104.5° on left; click O–H gives 0.958 Å. No-surface state disables opacity and cuts with explanations. Diffuse/constructed orbital warnings remain visible. A previously enabled dipole persisted into Basics with text directing users to Explore to change it.

## Explore — observed

- **Orbitals:** changed n=3 and selected 3dz² thumbnail. Information adds energy. Opened plot: radial distribution, wavefunction R(r), density |R|²; switched to Data, which exposes quantum numbers, node counts, enclosed fraction and isovalue, plus Export CSV. Display still has opacity/cut; fraction, surface style and advanced appearance are explicitly deferred to Advanced. Drawer occupies the right side of the model and has nested scroll regions at 1280×720.
- **Orbitals, further interaction:** selected x cut, changed depth to 65%, rotated and zoomed. Plot controls changed their selected state and descriptions correctly. CSV export was exposed but not downloaded.
- **Atoms:** filtered element list for Sodium; selected it. Opened orbital energies table and contextual Orbital energies / Kohn–Sham explanations. Ionisation energy reported separately from orbital eigenvalues. Toggled axes off, y cut at 30%, rotated and zoomed. Opened radial distribution, selected density plot, then Data (configuration, valence, shell count, drawn radius).
- **Bonds:** H₂⁺ distance 2→4 a₀; contextual potential-energy explanation. Clicked curve directly, changing R to 2.30 a₀ and updating model/energies. Switched antibonding; inspected Data, Display; z cut, rotation, zoom. Energy relative to dissociation and orbital energy remained distinct.
- **Molecules:** Ammonia. Tested space filling, no structure, ball-and-stick; measurements and dipole toggles; opacity and cut. No structure disables measurement control with explanation. Space filling explains hidden surfaces and angle-only labels. ESP saturation warning and fixed scale visible. Properties exposes multiplicity, geometry source, data tier and expandable bond-length table. Selected HOMO then LUMO; energy and diffuse/unbound warnings update. Rotated, zoomed, x cut. Left selection identified nitrogen and three H–N–H angles during manipulation.

## Advanced — observed

- **Orbitals:** sp² all→individual hybrid; enclosed fraction 90→75%; solid/glow; changed all six initially exposed appearance sliders and restored defaults. Electric field: ground-state strength, first excited level, strength 0.002 a.u., both Stark states. State energies and contextual explanations update. Cut, rotate, zoom exercised. Additional edge-whiteness slider appeared for combined states but was not changed. sp and sp³ were listed but not individually exercised.
- **Atoms:** Sodium→Na⁺→neutral; excitation 3s→3p; scalar relativity then spin–orbit. Electron configuration/count, shell count and energies update. Spin–orbit table resolves j levels and fractional occupations. Computation pending message explicitly identifies the still-displayed older model. Excitation showed a dashed neutral reference radius. Cut, rotate, zoom; reset recovered a visible cut face after it had been rotated out of view.
- **Bonds:** HF density contours, then empty 4σ orbital and Data. Fixed-density selection disables enclosed fraction with explanation; individual orbital enables it. Native value-setting did not change R in two attempts; keyboard Right successfully stepped R from 1.7325 to 1.7672 a₀ and updated energies. This difference is not classified as an app defect. Solid surface, y cut, rotation and zoom exercised.
- **Molecules:** Ammonia constructed LVMO, contextual point-group help, computed/experimental dipoles, and expanded technical warnings. ESP correctly disables enclosed fraction, stating fixed density 0.001 e/a₀³. Tested glow, opacity 70%, y cut depth 65%, rotation and zoom. Earlier Explore pass covered structure and measurement controls; not every inherited control was repeated here.

## Research — observed

- **Orbitals:** Research automatically expands calculation provenance. Selected n=4 then 4fz³; nodes, energy, isovalue and method update. Method states exact non-relativistic one-electron solution with fixed point nucleus, sampled grid and marching cubes. Research x-cut at 50→65%, rotation, zoom, pan and reset were subsequently exercised.
- **Sharing:** menu offers recipient's level or an explicit level; lower levels disabled when the view requires Advanced. Selected Research and Copy link. UI confirms copying at Research, but clipboard reader returned empty, so link content and round-trip behavior are unverified.
- **Exports:** menu exposes captioned PNG, view-only PNG, CSV, glTF, STL and Gaussian cube. Attempted captioned PNG with a download wait. Tool stalled and user interrupted; neither successful download nor app failure is established. Do not repeat the same blocking wait strategy.
- **Atoms, Bonds, Molecules:** representative Research passes subsequently performed; details in the dated observations below.

## Findings requiring controlled retest

1. **Thumbnail/workspace movement — unconfirmed.** During n=4 f-orbital selection, title/model were clipped and the right drawer appeared shifted. A read-only DOM inspection found canvas-container scrollLeft=230, clientWidth=944, scrollWidth=1300. However, the user reported they may have moved the model while the assistant selected the thumbnail. The earlier assertion that thumbnail selection caused a layout bug is withdrawn. Retested at 1904×905: selecting 4s then the last 4f thumbnail kept canvas scrollLeft=0 and title left=365px (canvas clientWidth=1221px, scrollWidth=1300px); only the thumbnail contents moved. The earlier smaller-width behavior remains unconfirmed.
2. **Combination context clarity.** n=3 remained selected while sp² described its 2s/2p basis, and while a field experiment used an independent n=1/n=2 level. A later sp³/sp check confirmed that selecting a shell exits the combination and selects a single orbital. The remembered shell is therefore navigation context, not the hybrid basis. Its visual presentation can still mislead a learner about the active construction.
3. **Drawer hierarchy.** Info, Display and plots/data can compete inside nested scroll regions at 1280×720. This is a usability observation, not proof of broken behavior. Preserve contextual info and scientific detail when evaluating alternatives.
4. **Full screen/export gaps.** Full screen enters and exits via its visible button. Automated Escape did not exit in the repeat Molecules test, although Help says it should; browser key delivery must be separated from an app defect. Export content/format validation and copied-link round-trip remain unverified. Pan is verified in each view; molecule atom/bond hover is verified.

## Resume point and access status

Browser access is restored. A stale connection can report `browser.user is unavailable`; resetting the computer-use session restored access on two resumes. Review findings were saved incrementally. The app is left at Research → Molecules → Water → electrostatic potential, original Match system theme restored. Export files and copied-link round-trip still need independent verification. No production source was edited.

## Preservation requirements for the eventual design

Keep the four learning levels, four scientific views, left construction/right explanation-and-display distinction, contextual information and return path, coordinated model selection, scientific color legends, limitations and provenance. No embedded AI chat; the user brings an external AI collaborator. Design identity should communicate precision and historical instrument craftsmanship while supporting a serious commercial scientific product.

## November 1 resumed live review

- Browser access restored after desktop restart. A subsequent connection error (`browser.user is unavailable`) was resolved by resetting the computer-use session. Current viewport is 1904×905; do not compare its spacing directly with the earlier 1280×720 layout.
- **Research Orbitals:** 4fz³ phase context opened and returned; x cut 50→65%, rotation and scroll zoom visually checked; cut Off and camera reset.
- **Research Atoms:** Magnesium neutral→3s→3p excited state. Configuration updates to 1s² 2s² 2p⁶ 3s¹ 3p¹; separate excitation calculation completes at displayed 2.80 eV. Neutral reference radius 3.14 a₀ versus excited 3.37 a₀ (+7%). z cut at 40%, axes on, rotation and zoom exercised. Density plot, Data, orbital-energy table and Kohn–Sham context inspected. Research provenance distinguishes spin-restricted displayed density from spin-polarised ΔSCF energies, with explicit model limitations.
- **Hover, partial:** supported pointer movement over Magnesium outer cut ring produced cyan outline on model. No matching left-panel highlight verified in this state. One pointer call unexpectedly took about 13 minutes; not evidence of an app failure.
- **Research Bonds:** exact H₂⁺ method inspected, then O₂. Selected beta 1πg* LUMO via thumbnail and stepped R from 2.2818 to 2.3275 a₀; model/energy/context updated. Method distinguishes UCCSD(T) total energies from B3LYP orbital shapes/eigenvalues, explains alpha/beta diagram convention and restricted trustworthy bond-length range. y cut, rotation, zoom exercised. Right-button drag visibly translated model and axes together; pan now verified in Bonds. Reset used before Molecules.
- **Research Molecules:** Benzene density→ESP→HOMO→diffuse 4e1u→structure only. Inspected fixed ESP scale and surface, properties, 12-bond length table, data-tier context, method/dispersion contribution and provenance. Selected diffuse orbital shows positive energy and basis-dependence warning. z-cut 65%, opacity 45%, rotation, zoom, pan and reset tested. Structure-only mode explains disabled surface controls. Hovering carbon 3 shows angles; hovering C–C shows 1.397 Å on the left, without clicking. Library label explicitly says Benzene has no property checked against experiment yet; experimental geometry itself is not portrayed as validation.
- **Additional combinations:** sp³ all→h4 and sp all→h2 tested. Selected shell n=4 remains remembered while the explanation identifies the 2s/2p basis. Clicking n=3 exits the combination and selects 3s.
- **Controlled thumbnail retest:** 4s→last 4f at current wide viewport did not move title or main container. Prior issue remains unconfirmed at narrower widths.
- **Full screen:** Molecules enters full screen; automated Escape leaves it active; visible exit button restores full workspace. Help explicitly documents Escape. No claim that browser-generated Escape is identical to a physical keyboard test.
- **Sharing:** Research selected in share menu; Copy link confirms Research, but clipboard tool again returns empty. No fabricated link or successful restoration claim.
- **Exports:** Benzene structure-only enables PNG and orbital CSV; glTF/STL/cube are disabled with an explanation that a surface is needed. CSV action exercised without waiting for a download. No matching Benzene/QuantumLab file found in the normal Downloads folder; download success, failure and file contents remain unverified. Earlier stalled PNG attempt remains unresolved.
- **Theme:** temporarily switched Match system (effective Deep Space) → Light Clean → Match system. Saved matched Magnesium screenshots. At opacity 45% the light model is visually fainter; this is a design observation, not a measured contrast failure. Theme preference restored.
- **Help/search:** read gesture, keyboard, learning-level and export guidance. Command-K → water → Enter successfully navigated from Atoms to Water in Molecules. Water provenance distinguishes computed dipole (1.86 D) from experimental (1.855 D) and geometry inputs from validation. Selected ESP as final view.

## Remaining coverage limits

- Not every inherited control was repeated at all four learning levels; numerical ranges, every element and every molecule were not exhaustively enumerated. The extra edge-whiteness appearance control was not exercised.
- Pan was checked in each view at Research, not separately at Basics/Explore/Advanced. Pure hover was verified for molecule atoms/bonds and atomic ring outline, not every selectable object.
- No full keyboard-only, screen-reader, touch/mobile, performance or scientific-correctness audit was performed.
- Copied-link restoration and downloaded file contents/format integrity remain unverified because of browser-tool limitations. These are verification gaps, not confirmed product defects.
- Full-screen Escape requires a physical-keyboard or independent-browser reproduction; narrow-width thumbnail scrolling requires a controlled responsive test.

