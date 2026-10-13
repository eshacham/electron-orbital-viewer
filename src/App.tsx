import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    IconButton,
    Snackbar,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import HelpOutline from '@mui/icons-material/HelpOutline';
import { useAppDispatch, useAppSelector, useAppStore } from './store/hooks';
import {
    startOrbitalCalculation,
    startFieldCalculation,
    finishOrbitalCalculation,
    failOrbitalCalculation,
    dismissOrbitalError,
    resetView,
    setSurfaceStyle,
    clearPicture,
    setBasicSelection,
    setEnclosedFraction,
    setCombination,
    clearPendingCut,
    cameraMoved
} from './store/orbitalSlice';
import {
    setMode,
    setElement,
    solveStarted,
    goToLevel,
    drillToShell,
    drillToSubshell,
    drillToOrbital,
    clearSubshell,
    setHoverRadius as setAtomHoverRadius,
    setCharge,
    setExcitation,
    setRelativity,
    speciesOf,
    effectiveRelativity,
    profileRelativity,
    ViewMode,
} from './store/atomSlice';
import { RelativityMode, defaultRelativityFor, shortMethodLabel } from './atom/relativity';
import { subshellLabel, subshellSpokenLabel, configurationLabelOf, valenceConfigurationLabelOf } from './atom/configurations';
import { useAtomSolver } from './atom/useAtomSolver';
import { useDeltaScfEnergies } from './atom/useDeltaScfEnergies';
import { Excitation, speciesConfiguration, speciesSymbol, speciesTitle, isValidExcitation, isNeutralGround } from './atom/species';
import { allowedCharges } from './atom/ion_configurations';
import SpeciesControls from './components/SpeciesControls';
import Controls, { RelativityReadout, BASIC_ORBITALS_ABOUT, RelativityControl } from './components/Controls';
import { AxesSwitch, SurfaceAndScheme } from './atom_ui/DisplayControls';
import ShareExportBar, { ShareOutcome } from './components/ShareExportBar';
import { shareUrlFor, copyText } from './share';
import OrbitalViewer from './components/OrbitalViewer';
import RadialPlot, { RadialCurve } from './components/RadialPlot';
import LevelNav, { NavigationTarget } from './components/LevelNav';
import PhoneSheet from './components/PhoneSheet';
import SubshellPanel from './components/SubshellPanel';
import PeriodicTable from './components/PeriodicTable';
import ElementPickerDialog from './components/ElementPickerDialog';
import { orbitalName } from './orbital_names';
import { CombinationSelection, fieldRequestFor, combinationCurves, overlayLegend, samePicture } from './combinations';
import { basicOrbitalParams, BASIC_ORBITALS_Z, ORBITAL_RESOLUTION, SHELL_VIEW_CUT_AXIS } from './orbital_presets';
import { OrbitalParams, SurfaceStyle } from './types/orbital';
import { useDelayedFlag } from './useDelayedFlag';
import { useMediaQuery, NARROW_VIEWPORT, MEDIUM_VIEWPORT, PHONE_LANDSCAPE, WIDE_VIEWPORT } from './useMediaQuery';
import { CURVE_COLORS } from './curve_colors';
import { buildComparisonCurves, radialPlotRange } from './atom/comparison_curves';
import { useUrlStateSync } from './useUrlStateSync';
import { hasSharedView, encodeStateOf } from './url_state';
import { radialProfile, PLOT_SAMPLE_COUNT } from './radial_distribution';
import { exportAvailability, exportItemsFor, runExport, ExportKind, ExportOptions } from './export/run_export';
import { CsvCurve } from './export/csv';
import { downloadBlob } from './export/download';
import { ViewerExportHandle } from './export/handle';
import { CubeWorkerHandle } from './export/cube_request';
import { createExportWorker } from './workers/createExportWorker';
import BondsPanel from './components/BondsPanel';
import BondsCurvePlot from './components/BondsCurvePlot';
import { useBondsData } from './bonds/useBondsData';
import { useH2PlusCurve } from './bonds/useH2PlusCurve';
import { bondsFieldRequest } from './bonds/bonds_request';
import { BondsSystemId, systemFormula } from './bonds/systems';
import { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, BondsView } from './store/bondsSlice';
import { selectMolecule, setSurface, setShowStructure, setShowDipole, MoleculeSurface } from './store/moleculeSlice';
import { useMoleculeLoader } from './molecules/useMoleculeLoader';
import { formatDipole } from './molecules/dipole';
import MoleculeNav from './components/MoleculeNav';
import MoleculePickerDialog from './components/MoleculePickerDialog';
import MoleculeReadout from './components/MoleculeReadout';
import MoleculeViewOptions from './components/MoleculeViewOptions';
import MoleculeOrbitalList from './components/MoleculeOrbitalList';
import EspLegend from './components/EspLegend';
import MoleculeJobsSection from './components/MoleculeJobsSection';
import TierBadge from './components/TierBadge';
import { ConnectedOwnerBar, signInHere } from './components/OwnerBar';
import { useComputedList } from './jobs/useComputedList';
import { useFollowedJob } from './jobs/useFollowedJob';
import { withComputed } from './jobs/computed';
import { selectIsOwner, sessionErrorDismissed, sessionFailed } from './store/jobsSlice';
import AppShell from './shell/AppShell';
import TopBar, { TopBarTab } from './shell/TopBar';
import Rail from './shell/Rail';
import GlobalSearch from './shell/GlobalSearch';
import HelpDialog from './shell/HelpDialog';
import AvatarMenu from './shell/AvatarMenu';
import PhoneTopBar from './shell/PhoneTopBar';
import ExplorePanel from './shell/ExplorePanel';
import AtomExplore from './atom_ui/AtomExplore';
import ElementTile from './atom_ui/ElementTile';
import OrbitalEnergyList from './atom_ui/OrbitalEnergyList';
import AtomInspector from './atom_ui/AtomInspector';
import { plotAriaLabel, plotTabsFor, resolvePlotTab, tabCurves } from './atom/plot_tabs';
import { atomFacts, orbitalFacts, shellFacts, subshellFacts } from './orbital_facts';
import Inspector from './shell/Inspector';
import TitleBlock from './shell/TitleBlock';
import ViewportToolbar from './shell/ViewportToolbar';
import ThumbnailStrip from './shell/ThumbnailStrip';
import { atomStripItems } from './thumbs/strip_items';
import { thumbnailService } from './thumbs/ThumbnailService';
import KeyColumn, { AtomKeys, PhaseKey } from './shell/KeyColumn';
import { viewTitle } from './shell/view_title';
import { useDocumentTitle } from './shell/useDocumentTitle';
import { useFullscreen } from './shell/useFullscreen';
import ThemeSwitch from './design/ThemeSwitch';
import { useQuantumTheme } from './design/useQuantumTheme';
import { useBrand } from './design/useBrand';
import { brandPref } from './design/brands';
import { LAYOUT } from './design/tokens';
import { usePref } from './design/usePref';
import { displayPref, renderPref, type PlotTabId } from './design/presentation';
import { curvePalette, densitySurfaceHex, phaseColours, themeCurveColour } from './design/science';
import { BUILD_ENV } from './jobs/build_env';
import { SESSION_ENDED } from './jobs/api';
import { NO_COMBINATION } from './combinations';
import type { SearchAction } from './search/search_index';

/** §8.6: the inspector's 290 px less its 16 px padding each side. */
const PLOT_WIDTH = LAYOUT.plotWidth;
/** The plot's width in the phone sheet, which is at most 400 px across. */
const PHONE_PLOT_WIDTH = 300;

/** The canvas busy label's mode, after the species: "Solving Gold (scalar-relativistic)…". 'off' adds nothing. */
const SOLVING_SUFFIX: Record<RelativityMode, string> = {
    off: '',
    scalar: ' (scalar-relativistic)',
    spinOrbit: ' (with spin–orbit)',
};

/**
 * The Electron-enclosed select's note while a molecule's density is drawn
 * (ruling T7-a). Says where ρ is chosen in words that hold in both layouts:
 * the Bonds panel is the left column on a desktop and the Explore tab on a phone.
 */
const FIXED_RHO_NOTE = 'The density is drawn at a fixed ρ, chosen with the ρ buttons beside the orbitals — not at an enclosed fraction.';

/**
 * The Electron-enclosed select's note while a molecule's ESP map is drawn
 * (ruling D22): the map is always drawn on the ρ = 0.001 surface (ruling
 * D4), so the fraction does not apply and the select is disabled.
 */
const ESP_SURFACE_NOTE = 'Fixed at ρ = 0.001 e/a₀³ — the surface ESP maps are conventionally drawn on, not an enclosed fraction';

/** What a failed Molecules render was trying to draw, for its alert. */
const SURFACE_NAME: Record<MoleculeSurface['kind'], string> = {
    density: 'the density', esp: 'the electrostatic potential', mo: 'the orbital',
};

/** How long a render has to take before the viewer is told it is working. */
const BUSY_INDICATOR_DELAY_MS = 400;

/** r_j = rMin * e^(j*dx), j = 0..size-1 -- the shared log grid every atom-profile curve is sampled on (see atomWorker.ts). */
function gridRadii(rMin: number, dx: number, size: number): number[] {
    return Array.from({ length: size }, (_, j) => rMin * Math.exp(j * dx));
}

function App() {
    const dispatch = useAppDispatch();
    const { isLoading, error, surfaceStyle, isoLevel } = useAppSelector(state => state.orbital);
    // The plot describes what is on screen, so it follows the rendered orbital
    // rather than the pending selection in the panel.
    const renderedParams = useAppSelector(state => state.orbital.currentParams);

    const atomMode = useAppSelector(state => state.atom.mode);
    const atomZ = useAppSelector(state => state.atom.Z);
    const atomLevel = useAppSelector(state => state.atom.level);
    const atomSelectedShell = useAppSelector(state => state.atom.selectedShell);
    const atomSelectedSubshell = useAppSelector(state => state.atom.selectedSubshell);
    const atomSelectedOrbital = useAppSelector(state => state.atom.selectedOrbital);
    const atomProfile = useAppSelector(state => state.atom.profile);
    const atomIsSolving = useAppSelector(state => state.atom.isSolving);
    const atomError = useAppSelector(state => state.atom.error);
    const atomHoverRadius = useAppSelector(state => state.atom.hoverRadius);
    const atomCharge = useAppSelector(state => state.atom.charge);
    const atomExcitation = useAppSelector(state => state.atom.excitation);
    const atomUnbound = useAppSelector(state => state.atom.unbound);
    const atomEnergies = useAppSelector(state => state.atom.energies);
    const species = useMemo(
        () => speciesOf({ Z: atomZ, charge: atomCharge, excitation: atomExcitation }),
        [atomZ, atomCharge, atomExcitation]
    );
    const isAtomMode = atomMode === 'atom';
    // Three modes now (spec §5 Phase 5), so "not atom mode" no longer means
    // Basic Orbitals: everything that belongs to Basic Orbitals alone -- its
    // render effects, the combination key, its plot and CSV curves -- asks
    // for it by name, or a hybrid persisted from Basic Orbitals would be
    // drawn (and keyed, and exported) over a molecule.
    const isBasicMode = atomMode === 'hydrogenic';
    const isBondsMode = atomMode === 'bonds';
    const isMoleculeMode = atomMode === 'molecule';

    // The Relativity switch shows the effective mode -- the user's choice, or
    // the element's default -- since that is what is being solved for.
    // Everything that describes the picture on screen reads the drawn
    // profile's own mode instead (ruling C9): during a re-solve the two
    // differ, and the old picture must not be labelled as the new method.
    const relativity = useAppSelector(state => effectiveRelativity(state.atom));
    // Whether the mode shown is this element's default, whoever chose it
    // (final review I3): Scalar chosen on carbon persists onto gold, where it
    // is the default, and the helper says so.
    const relativityIsDefault = useAppSelector(state => effectiveRelativity(state.atom) === defaultRelativityFor(state.atom.Z));
    const pictureRelativity: RelativityMode = atomProfile ? profileRelativity(atomProfile) : relativity;
    // Memoised: Controls is React.memo, and a fresh object every render would defeat it.
    const relativityReadout = useMemo<RelativityReadout | null>(() => atomProfile && {
        pictureMode: profileRelativity(atomProfile),
        change: atomProfile.valenceS ?? null,
        comparisonUnavailable: atomProfile.comparisonUnavailable ?? null,
    }, [atomProfile]);

    // Basic Orbitals' view state -- n/l/mₗ, the enclosed fraction, and Phase
    // 1's combination -- lives in the store, not in App: a shared link's URL
    // decoder can only dispatch, and cannot reach into a component's local
    // state to restore it.
    const { n, l, ml } = useAppSelector(state => state.orbital.basicSelection);
    const enclosedFraction = useAppSelector(state => state.orbital.enclosedFraction);
    const combination = useAppSelector(state => state.orbital.combination);
    const basicRenderNonce = useAppSelector(state => state.orbital.basicRenderNonce);
    // Stable, because Controls' n/l effects list these callbacks as dependencies.
    const setN = useCallback((value: number) => dispatch(setBasicSelection({ n: value })), [dispatch]);
    const setL = useCallback((value: number) => dispatch(setBasicSelection({ l: value })), [dispatch]);
    const setMl = useCallback((value: number) => dispatch(setBasicSelection({ ml: value })), [dispatch]);
    const handleEnclosedFractionChange = useCallback((value: number) => dispatch(setEnclosedFraction(value)), [dispatch]);
    const handleCombinationChange = useCallback((value: CombinationSelection) => dispatch(setCombination(value)), [dispatch]);
    const renderedField = useAppSelector(state => state.orbital.currentField);
    const renderFailed = useAppSelector(state => state.orbital.renderFailed);

    // Ruling R28: the only thing that starts a solve is a species change --
    // the element, its charge or its excitation (or an enclosedFraction
    // change, which re-slices an already-memoised solution cheaply). Every
    // navigation dispatch below reads the profile this produces; none of
    // them can retrigger it.
    useAtomSolver(enclosedFraction);
    // After the solver, so the picture's worker is always the first one
    // created. The energies wait for that picture anyway (ruling C15).
    useDeltaScfEnergies();

    // Desktop element choice: the periodic table, as a pop-over opened from
    // the element name. Open on arrival, so the first thing a visitor sees is
    // what to pick; it closes once they do. Declared here, ahead of
    // useUrlStateSync below, so a pasted link's hashchange can close it too
    // (fix round 1, M2) -- a pop-over left open would otherwise hide the
    // very link that was just followed.
    const [tableOpen, setTableOpen] = useState(() => !hasSharedView(window.location.hash));
    const closeTable = useCallback(() => setTableOpen(false), []);

    useUrlStateSync(window, undefined, closeTable);

    const handleOrbitalParamsChange = useCallback((newParams: OrbitalParams) => {
        console.log('App.tsx: Orbital params changing:', newParams);
        dispatch(startOrbitalCalculation(newParams));
    }, [dispatch]);

    const handleOrbitalRendered = useCallback((isoLevel: number) => {
        console.log('App.tsx: Orbital rendered callback');
        dispatch(finishOrbitalCalculation({ isoLevel }));
    }, [dispatch]);

    const handleOrbitalFailed = useCallback((message: string) => {
        console.warn('App.tsx: Orbital render failed:', message);
        dispatch(failOrbitalCalculation(message));
    }, [dispatch]);

    const handleResetView = useCallback(() => {
        dispatch(resetView());
    }, [dispatch]);

    // Task 9: the 3D view's own PNG capture, reached through a ref rather
    // than lifted state -- OrbitalViewer owns the renderer, and re-rendering
    // App on every camera settle just to keep a handle in sync would be
    // pointless churn.
    const exportHandleRef = useRef<ViewerExportHandle | null>(null);

    // Share copies a link built from the state at the moment of the click
    // (store.getState(), not a selector) -- mid-solve, encodeStateOf reads
    // atom.pendingView rather than the transient whole-atom view still on
    // screen, so the link carries the view that was actually asked for
    // (Review Focus 3). The camera is read off the view itself first (final
    // review M4): the store hears of a move only once the camera has settled,
    // so a click straight after a drag would otherwise copy the old angle.
    const store = useAppStore();
    const stateNow = useCallback(() => {
        const angles = exportHandleRef.current?.cameraAngles();
        if (angles) store.dispatch(cameraMoved(angles));
        return store.getState();
    }, [store]);
    const handleShare = useCallback(async (): Promise<ShareOutcome> => {
        const url = shareUrlFor(encodeStateOf(stateNow()));
        return (await copyText(url)) ? { kind: 'copied' } : { kind: 'manual', url };
    }, [stateNow]);

    const handleSurfaceStyleChange = useCallback((change: Partial<SurfaceStyle>) => {
        dispatch(setSurfaceStyle(change));
        // A user-driven cut change while a link's cut is still waiting on the
        // solve (pendingCut) must win: without this, the link's stale cut
        // would land back on top of it once the profile arrives (progress.md,
        // "carry to Task 6").
        if ('clipAxis' in change || 'clipPosition' in change) dispatch(clearPendingCut());
    }, [dispatch]);

    const handleModeChange = useCallback((newMode: ViewMode) => {
        dispatch(setMode(newMode));
        // A link's cut, still waiting on an atom-mode solve that has not
        // finished yet, must not land on the other mode's view once that
        // solve does finish (fix round 1, I1): the pendingCut re-apply
        // effect below does not know which mode it is re-applying into.
        dispatch(clearPendingCut());
    }, [dispatch]);

    // Every mode control in the shell -- rail, phone mode menu, top-bar tabs --
    // dispatches exactly as the old exclusive Mode toggle did (spec §8.2): a
    // click on the mode already shown does nothing. Re-running setMode would
    // clear the drawn picture (Bonds' request effect would not redraw it),
    // re-bump basicRenderNonce and drop a shared link's pending cut.
    const selectMode = useCallback((newMode: ViewMode) => {
        if (newMode !== atomMode) handleModeChange(newMode);
    }, [atomMode, handleModeChange]);

    // Picking an element gives you that element's best default view, derived
    // from its own solved profile rather than hand-tuned per element: the
    // camera back at the canonical angle and framed on this atom's own
    // displayRadius, and the cut-away on, centred, which is what makes the
    // shell rings visible at all (levels 1-2 draw nothing but their cut
    // face). Everything else the user has set -- opacity, enclosed fraction
    // -- is theirs and is left alone.
    const handleAtomElementChange = useCallback((newZ: number) => {
        // setElement and solveStarted are dispatched together so React
        // batches them into one render -- setElement alone clears `profile`
        // without setting `isSolving`, which otherwise leaves a one-frame
        // "idle, no profile" gap before useAtomSolver's own effect gets to
        // run (see its doc comment).
        dispatch(setElement(newZ));
        dispatch(solveStarted());
        dispatch(setSurfaceStyle({ clipAxis: SHELL_VIEW_CUT_AXIS, clipPosition: 0 }));
        dispatch(clearPendingCut());
        dispatch(resetView());
    }, [dispatch]);

    // A charge or an excitation is the same element seen differently, so --
    // unlike picking an element -- the camera stays where it is: Na⁺ visibly
    // shrinking against an unchanged scale bar is the point (the framing
    // floor at the neutral's radius keeps the view from re-zooming onto it).
    // Otherwise the same pairing as handleAtomElementChange: solveStarted in
    // the same batch, so there is no idle, no-profile frame, and a link's
    // cut still waiting on the old species does not land on the new one.
    const handleChargeChange = useCallback((charge: number) => {
        if (!allowedCharges(atomZ).includes(charge)) return;
        dispatch(setCharge(charge));
        dispatch(solveStarted());
        dispatch(clearPendingCut());
    }, [dispatch, atomZ]);

    const handleExcitationChange = useCallback((excitation: Excitation | null) => {
        if (excitation && !isValidExcitation(atomZ, atomCharge, excitation)) return;
        dispatch(setExcitation(excitation));
        dispatch(solveStarted());
        dispatch(clearPendingCut());
    }, [dispatch, atomZ, atomCharge]);

    // A relativity switch is the same species seen through a different
    // equation, so -- like a charge step -- the camera stays where it is:
    // gold's 6s pulling in against an unchanged scale bar is the point
    // (the viewer frames a relativistic picture on at least its
    // non-relativistic framing, ruling C14). setRelativity keeps the old
    // picture up until the new one lands and starts the solve itself.
    const handleRelativityChange = useCallback((mode: RelativityMode) => {
        dispatch(setRelativity(mode));
    }, [dispatch]);

    const handleLevelNavigate = useCallback((target: NavigationTarget) => {
        switch (target.level) {
            case 'atom': dispatch(goToLevel('atom')); break;
            case 'shell': dispatch(drillToShell(target.n)); break;
            case 'subshell': dispatch(drillToSubshell(target.n, target.l, target.j)); break;
            case 'orbital': dispatch(drillToOrbital(target.n, target.l, target.ml, target.j)); break;
        }
    }, [dispatch]);

    // Addendum 2's readability follow-up: a subshell chip is a toggle.
    // Selecting one isolates its orbitals in the composition view (iron's
    // five 3d cloverleaves are unreadable as an overlapping blob);
    // clicking the selected one again clears the isolation and returns to
    // the overlapping view, which stays the default because the overlap is
    // the teaching point (spec §2). This is also the subshell-level half of
    // the "is there a way to unselect one?" affordance. With spin–orbit a
    // chip is one j-level: only that j-level's own chip clears it, and its
    // sibling's switches to the sibling.
    const handleSelectSubshell = useCallback((selN: number, selL: number, selJ?: number) => {
        if (atomSelectedSubshell && atomSelectedSubshell.n === selN && atomSelectedSubshell.l === selL
            && atomSelectedSubshell.j === selJ) {
            dispatch(clearSubshell());
            return;
        }
        dispatch(drillToSubshell(selN, selL, selJ));
    }, [dispatch, atomSelectedSubshell]);

    const handleSelectOrbital = useCallback((selN: number, selL: number, selMl: number, selJ?: number) => {
        dispatch(drillToOrbital(selN, selL, selMl, selJ));
    }, [dispatch]);

    const handleAtomHoverRadius = useCallback((r: number | null) => {
        dispatch(setAtomHoverRadius(r));
    }, [dispatch]);

    // On a phone the panel would cover most of the screen, so it starts out of
    // the way and is opened deliberately. On a desktop it is just always there.
    const isNarrow = useMediaQuery(NARROW_VIEWPORT);
    // A phone turned sideways: under 500 px of height (ruling T16-c).
    const isPhoneLandscape = useMediaQuery(PHONE_LANDSCAPE) && isNarrow;
    // The phone sheet's open tab, or null with the atom given the screen.
    const [phoneTab, setPhoneTab] = useState<string | null>(null);
    // Between a phone and a wide desktop the right-hand panel starts folded
    // to a bar, so the atom keeps the width; it opens over the view on a tap.
    const isMedium = useMediaQuery(MEDIUM_VIEWPORT) && !isNarrow;
    // Folded by default at medium width, open otherwise; a tap overrides it
    // until the window crosses the breakpoint again. Derived rather than
    // synced in an effect, so the first render is already right.
    const [viewPanelChoice, setViewPanelChoice] = useState<{ medium: boolean; open: boolean } | null>(null);
    const viewPanelOpen = viewPanelChoice && viewPanelChoice.medium === isMedium ? viewPanelChoice.open : !isMedium;
    const setViewPanelOpen = (update: (open: boolean) => boolean) =>
        setViewPanelChoice({ medium: isMedium, open: update(viewPanelOpen) });
    const isWide = useMediaQuery(WIDE_VIEWPORT) && !isNarrow && !isMedium;
    const layout: 'desktop' | 'medium' | 'phone' = isNarrow ? 'phone' : isMedium ? 'medium' : 'desktop';
    const { mode: themeMode } = useQuantumTheme();
    const render = usePref(renderPref);
    const phase = useMemo(() => phaseColours(themeMode, render.scheme), [themeMode, render.scheme]);
    const palette = useMemo(() => curvePalette(themeMode, render.scheme), [themeMode, render.scheme]);
    /** A curve, key or swatch in this theme's palette (index identity, §4.2). */
    const themed = useCallback(<T extends { color: string }>(items: T[]): T[] =>
        items.map(item => ({ ...item, color: themeCurveColour(item.color, palette) })), [palette]);
    const brand = useBrand();
    const { title: viewTitleText, subtitle: viewSubtitle } = useAppSelector(viewTitle, shallowEqual);
    useDocumentTitle(`${viewTitleText} · ${brand.name}`);
    const shellRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(shellRef);
    const [helpOpen, setHelpOpen] = useState(false);
    const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
    // The molecule index loads when Molecules opens -- or when someone starts a search (spec §8.3).
    const [searchWantsIndex, setSearchWantsIndex] = useState(false);
    const wantIndex = useCallback(() => setSearchWantsIndex(true), []);
    // §8.1: "Explore" returns to the last of Atoms, Basic Orbitals and Bonds used.
    const lastExploreModeRef = useRef<ViewMode>(atomMode === 'molecule' ? 'atom' : atomMode);
    useEffect(() => { if (atomMode !== 'molecule') lastExploreModeRef.current = atomMode; }, [atomMode]);

    // Only say anything if the calculation is actually taking a while; see
    // useDelayedFlag for why.
    const showBusy = useDelayedFlag(isLoading, BUSY_INDICATOR_DELAY_MS);
    const showAtomBusy = useDelayedFlag(atomIsSolving, BUSY_INDICATOR_DELAY_MS);

    // Levels 1-2's shell view only draws anything on its cut face (see
    // shell_view.ts / updateAtomViewInScene) -- with the shared surface
    // style's out-of-the-box default of no cut, the very first thing atom
    // mode (the app's default mode) shows would be nothing at all. A cut is
    // one of the controls that already works at every level, so this just
    // picks a sensible starting point for it rather than special-casing atom
    // mode's rendering. Runs once, and only nudges the *default* -- a user
    // who deliberately turns the cut back off keeps their choice.
    useEffect(() => {
        if (isAtomMode && surfaceStyle.clipAxis === 'none') {
            dispatch(setSurfaceStyle({ clipAxis: SHELL_VIEW_CUT_AXIS }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Basic Orbitals draws its plain orbital here and nowhere else: on the
    // switch into the mode (setMode bumps the nonce) and when a restored link
    // asks (requestBasicRender). One effect, run after every dispatch of the
    // batch has landed, so a link's selection and combination are both in
    // place before anything is drawn. A combination draws through Phase 1's
    // own effect below instead.
    useEffect(() => {
        if (basicRenderNonce === 0 || !isBasicMode || combination.kind !== 'none') return;
        dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basicRenderNonce]);

    // A combination draws as soon as it is chosen, and again when the
    // enclosed fraction changes. Going back to None redraws the n/l/mₗ still in
    // the panel: the canvas was showing the combination, not that orbital.
    // A selection that cannot be drawn clears the canvas rather than leave the
    // last picture under its title (spec §3.5); the picker says why. A request
    // for the picture already drawn or in flight -- a new F at n = 2, where
    // only the energies change -- is not sent again, unless it failed.
    const previousCombinationRef = useRef(combination);
    useEffect(() => {
        const previous = previousCombinationRef.current;
        previousCombinationRef.current = combination;
        // Basic Orbitals only. Keyed on the mode itself rather than "is it
        // atom mode", so the switch back from either other mode redraws a
        // persisted combination, and an enclosed-fraction change made in
        // Bonds draws nothing here.
        if (!isBasicMode) return;
        if (combination.kind === 'none') {
            if (previous.kind !== 'none') dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
            return;
        }
        const request = fieldRequestFor(combination, enclosedFraction);
        if (!request) {
            dispatch(clearPicture());
            return;
        }
        if (renderedField && !renderFailed && samePicture(renderedField, request)) return;
        dispatch(startFieldCalculation(request));
        // n/l/mₗ are read for the None case only; changing them while a
        // combination is drawn must not replace it. renderedField is read,
        // not watched: only a new selection asks for a picture.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [atomMode, combination, enclosedFraction, dispatch]);

    // Bonds mode (spec §5 Phase 5). The selection is in bondsSlice; the data
    // for it loads lazily (useBondsData), and each complete selection becomes
    // one field request -- the same path Basic Orbitals' combinations take.
    // A molecule that fails to load is reported by the panel alone (ruling
    // C9): the canvas keeps the picture it had, which is not a failed render.
    const bonds = useAppSelector(state => state.bonds);
    const bondsData = useBondsData();
    // Ruling C7: the exact curves' worker runs only while H₂⁺ is on screen.
    const h2plusCurve = useH2PlusCurve(isBondsMode && bonds.system === 'h2plus');
    const bondsRender = useMemo(
        () => (isBondsMode ? bondsFieldRequest(bonds, bondsData.basis, enclosedFraction) : null),
        [isBondsMode, bonds, bondsData.basis, enclosedFraction],
    );
    // Any change to the selection rebuilds the request, but only a different
    // picture is drawn again: the ρ chosen while an orbital is shown, or the
    // scan point already drawn, asks for nothing -- unless that picture failed.
    // Why the drawn picture differs from the selection, for the panel. It
    // belongs to the picture, so it changes when a new request goes out and
    // not before: while the next scan point loads, the old picture -- and its
    // note -- stay up (fix round 1, M2).
    const [bondsNote, setBondsNote] = useState<string | null>(null);
    useEffect(() => {
        if (!bondsRender) return;
        setBondsNote(bondsRender.note);
        if (renderedField && !renderFailed && samePicture(renderedField, bondsRender.request)) return;
        dispatch(startFieldCalculation(bondsRender.request));
        // renderedField is read, not watched, as in the combination effect above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bondsRender, dispatch]);
    // A density is drawn at a fixed ρ, in one colour: no ψ key, and the
    // enclosed fraction does not apply. Read off the picture asked for last,
    // not the selection (fix round 1, I1): while a scan point's files load,
    // or after a molecule fails to, the selection has no request and the
    // density drawn before it is still what is on screen.
    const drawnDensityIso = isBondsMode ? renderedField?.densityIsoValue : undefined;
    const isBondsDensity = drawnDensityIso !== undefined;
    // The canvas says what it is waiting for, as it does for a solve (M2).
    const showBondsLoading = useDelayedFlag(isBondsMode && bondsData.loading, BUSY_INDICATOR_DELAY_MS);
    // A scan point is the molecule's own: `system` lets the slice refuse it
    // if the user has picked another molecule since (Task 8's carry).
    const bondsScan = bondsData.scan;
    const handleScanIndex = useCallback((index: number) => {
        const point = bondsScan?.points[index];
        if (point && bonds.system !== 'h2plus') dispatch(setScanPoint({ system: bonds.system, index, RBohr: point.RBohr }));
    }, [bondsScan, bonds.system, dispatch]);

    // Molecules mode (Phase 6). The selection and what is drawn live in
    // moleculeSlice; the index loads when the mode opens and a molecule's
    // files when it is picked (spec §4.2), and OrbitalViewer's
    // useMoleculeView draws them. Nothing here starts a hydrogen render:
    // the Basic Orbitals effects above ask for that mode by name.
    const molecule = useAppSelector(state => state.molecule);
    // Outside Molecules a search wants the index alone, not a molecule's files (ruling DB4).
    useMoleculeLoader(isMoleculeMode, { indexOnly: searchWantsIndex });
    // The owner's computed molecules join the picker as a Computed category; nobody else's picker changes.
    const isOwner = useAppSelector(selectIsOwner);
    const signInError = useAppSelector(state => state.jobs.session.error);
    const computedJobs = useAppSelector(state => state.jobs.computed.jobs);
    useComputedList(isMoleculeMode);
    // Always mounted, whatever the mode or the phone sheet shows: a job that finishes still opens (final review I2).
    useFollowedJob();
    const moleculeEntries = useMemo(
        () => withComputed(molecule.index, isOwner ? computedJobs : null),
        [molecule.index, isOwner, computedJobs],
    );
    // The same entries as the picker: computed molecules for the owner only (ruling R4).
    const searchSources = useMemo(() => ({ molecules: moleculeEntries }), [moleculeEntries]);
    // Opening a result does what the existing pickers do (spec §8.3).
    const handleSearchPick = useCallback((action: SearchAction) => {
        switch (action.kind) {
            case 'element':
                if (atomMode !== 'atom') handleModeChange('atom');
                handleAtomElementChange(action.Z);
                setTableOpen(false);
                break;
            case 'molecule':
                if (atomMode !== 'molecule') handleModeChange('molecule');
                dispatch(selectMolecule({ id: action.id }));
                break;
            case 'bonds':
                if (atomMode !== 'bonds') handleModeChange('bonds');
                dispatch(selectBondsSystem(action.system));
                break;
            case 'basic':
                dispatch(setCombination(NO_COMBINATION));
                dispatch(setBasicSelection({ n: action.n, l: action.l, ml: action.ml }));
                // Entering the mode draws the selection (setMode bumps basicRenderNonce); already in it, draw it now.
                if (atomMode !== 'hydrogenic') handleModeChange('hydrogenic');
                else dispatch(startOrbitalCalculation(basicOrbitalParams(action.n, action.l, action.ml, enclosedFraction)));
                break;
        }
    }, [atomMode, handleModeChange, handleAtomElementChange, dispatch, enclosedFraction]);
    // Phone: the molecule is chosen from a full-screen list opened from the
    // name in the header, as an element is.
    const [moleculePickerOpen, setMoleculePickerOpen] = useState(false);
    const showMoleculeBusy = useDelayedFlag(
        isMoleculeMode && (molecule.renderLabel !== null || molecule.isLoadingMeta), BUSY_INDICATOR_DELAY_MS);
    // The structure has to show through the density, so switching into the
    // mode lowers an untouched full opacity. Only a real switch: a shared
    // link is applied before the first render, so opening one already in
    // Molecules mode is not "entering" it, and its op=1 is the link's
    // choice (fix round 1, review Important). Any other value is the
    // user's and stays. Leaving hands back what entering took (final
    // review I1): the other modes would otherwise draw at 60 % and their
    // links carry op=0.6 -- unless the user has moved the slider since.
    const wasMoleculeModeRef = useRef(isMoleculeMode);
    const loweredOpacityRef = useRef(false);
    useEffect(() => {
        const entered = isMoleculeMode && !wasMoleculeModeRef.current;
        const left = !isMoleculeMode && wasMoleculeModeRef.current;
        wasMoleculeModeRef.current = isMoleculeMode;
        if (entered && surfaceStyle.opacity === 1) {
            loweredOpacityRef.current = true;
            dispatch(setSurfaceStyle({ opacity: 0.6 }));
        } else if (left) {
            if (loweredOpacityRef.current && surfaceStyle.opacity === 0.6) dispatch(setSurfaceStyle({ opacity: 1 }));
            loweredOpacityRef.current = false;
        }
        // surfaceStyle is read, not watched: only the change of mode matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMoleculeMode]);

    // The cut belongs to the shell views. Levels 1-2 draw nothing but their
    // cut face, so they need one; an orbital -- atom mode's level 3, or any
    // Basic Orbitals or Bonds render -- is a closed surface, and the inherited
    // half-cut hid half of it: 4f_z³ arrived as a single lobe, with the Off
    // button at the bottom of a scrolled panel. Moving into an orbital view
    // clears the cut, and moving back to a shell view restores whatever it
    // had. A cut chosen while looking at an orbital is left alone.
    const isOrbitalView = !isAtomMode || atomLevel === 'orbital';
    const shellViewCutRef = useRef<Pick<SurfaceStyle, 'clipAxis' | 'clipPosition'> | null>(null);
    const wasOrbitalViewRef = useRef(isOrbitalView);
    useEffect(() => {
        const wasOrbitalView = wasOrbitalViewRef.current;
        wasOrbitalViewRef.current = isOrbitalView;
        if (isOrbitalView && !wasOrbitalView) {
            shellViewCutRef.current = { clipAxis: surfaceStyle.clipAxis, clipPosition: surfaceStyle.clipPosition };
            // Centred too, so picking an axis here starts at the nucleus
            // rather than at whatever depth the shell view was left at.
            dispatch(setSurfaceStyle({ clipAxis: 'none', clipPosition: 0 }));
        } else if (!isOrbitalView && wasOrbitalView) {
            const saved = shellViewCutRef.current;
            dispatch(setSurfaceStyle(saved && saved.clipAxis !== 'none'
                ? saved
                : { clipAxis: SHELL_VIEW_CUT_AXIS, clipPosition: 0 }));
        }
        // surfaceStyle is read, not watched: only the change of view matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrbitalView, dispatch]);

    // A shared link's cut, re-applied once the linked view is on screen. It
    // has to come after the effect above: entering the linked orbital clears
    // the cut, and in the same commit this puts the link's back.
    const pendingCut = useAppSelector(state => state.orbital.pendingCut);
    const atomPendingView = useAppSelector(state => state.atom.pendingView);
    useEffect(() => {
        if (!pendingCut || atomPendingView) return;
        dispatch(setSurfaceStyle(pendingCut));
        dispatch(clearPendingCut());
    }, [pendingCut, atomPendingView, isOrbitalView, dispatch]);

    // Level 3 in atom mode: render the selected orbital through the same
    // marching-cubes pipeline as hydrogen-like mode, but with the SCF's own
    // numerical R(r) (OrbitalParams.radialSamples) in place of the analytic
    // hydrogenic form -- this is exactly what SerialisedSubshell.R exists
    // for (see atomWorker.ts). Reactive rather than button-triggered: the
    // n/l/ml selects collapsed into the drill-down, so there is no separate
    // "Update Orbital" step in atom mode (see Controls.tsx).
    useEffect(() => {
        if (!isAtomMode || atomLevel !== 'orbital' || !atomSelectedOrbital || !atomProfile) return;

        const { n: selN, l: selL, ml: selMl, j: selJ } = atomSelectedOrbital;
        // j too: with spin–orbit (n, l) is two j-levels, each with its own
        // R(r) and sampling box. drillToOrbital only accepts a j the
        // profile has, so this matches exactly one.
        const subshell = atomProfile.subshells.find(s => s.n === selN && s.l === selL && s.j === selJ);
        // Occupancy was already validated by drillToOrbital; this should
        // always be found, but there is nothing sane to render if it is not.
        if (!subshell) return;

        // This subshell's own sampling-box extent (spec bugfix): the whole
        // atom's shared grid rMax is sized to hold the *outermost* occupied
        // subshell's tail, which for a tightly bound inner one -- argon's
        // 2p, say, at 35x smaller than the grid -- left the orbital spanning
        // a couple of voxels out of a much wider box, too few for marching
        // cubes to resolve anything. `samplingRadius` is computed per
        // subshell for exactly this reason (see atomWorker.ts /
        // subshellSamplingRadius). Still not computeSamplingRadius(n, l, Z):
        // that assumes Z_eff = Z, wrong in the opposite direction for a
        // screened valence electron.
        const rMax = subshell.samplingRadius;

        dispatch(startOrbitalCalculation({
            n: selN, l: selL, ml: selMl,
            Z: atomProfile.Z,
            resolution: ORBITAL_RESOLUTION,
            rMax,
            enclosedFraction,
            radialSamples: { R: subshell.R, rMin: atomProfile.rMin, dx: atomProfile.dx, size: atomProfile.size },
        }));
    }, [isAtomMode, atomLevel, atomSelectedOrbital, atomProfile, enclosedFraction, dispatch]);

    const atomRGrid = useMemo(
        () => atomProfile ? gridRadii(atomProfile.rMin, atomProfile.dx, atomProfile.size) : [],
        [atomProfile]
    );

    // The atom strip (spec §8.5 bottom zone, §9.1 "Strip", §12).
    const [stripCollapsed, setStripCollapsed] = useState(false);
    const stripItems = useMemo(
        () => (atomProfile && !atomUnbound
            ? atomStripItems({ profile: atomProfile, level: atomLevel, selectedShell: atomSelectedShell, selectedOrbital: atomSelectedOrbital, enclosedFraction, palette })
            : []),
        [atomProfile, atomUnbound, atomLevel, atomSelectedShell, atomSelectedOrbital, enclosedFraction, palette],
    );
    // A new species or relativity: nothing in flight belongs to the picture any more (§12).
    useEffect(() => () => thumbnailService.cancelAll(), [atomProfile?.speciesKey, atomProfile?.Z, pictureRelativity]);
    const stripThemeKey = `${themeMode}|${render.scheme}|${render.finish}`;
    // The radial plot's horizontal range: sized to what is actually being
    // shown, not the sampling grid's rMax (spec bugfix). The grid extent is
    // chosen to comfortably hold the outermost orbital's tail -- for argon
    // that is 44 a0 against shell peaks at 0.06/0.29/1.22, so a linear axis
    // against the grid crushes every peak into the first few percent of the
    // plot. Tracks the drill-down level, same as `atomCurves` below, so
    // drilling into a shell zooms the plot in exactly as it zooms the 3D
    // view in (see updateAtomViewInScene's camera-framing fix). Exactly the
    // drawn radius, with no headroom (bug fix, reported from the running
    // app): the curve used to run 20% past the edge of the sphere beside
    // it -- and, with a non-relativistic comparison, at least that
    // picture's own radius, so the dashed tail is not clipped (final review
    // M3; see radialPlotRange).
    const atomPlotRange = useMemo(() => {
        if (!atomProfile) return 1;
        return radialPlotRange(atomProfile, atomLevel, atomSelectedShell);
    }, [atomProfile, atomLevel, atomSelectedShell]);

    // The plot answers "what am I looking at", so it narrows as the drill-down
    // does: every shell at the atom level, then the chosen shell's subshells
    // side by side so 2s and 2p can be compared, then just the chosen subshell.
    // Choosing an individual ml narrows it no further, because the radial
    // distribution does not depend on ml.
    const atomCurves: RadialCurve[] = useMemo(() => {
        if (!atomProfile) return [];
        if (atomLevel === 'atom') {
            // The outermost shell is named as such here too (Addendum 2's
            // core/valence distinction), so the plot and the lit ring in the
            // 3D view are saying the same thing. `shells` is ascending n from
            // the configuration, so the last entry is the valence shell.
            const valenceIndex = atomProfile.shells.length - 1;
            return atomProfile.shells.map((shell, i) => ({
                label: i === valenceIndex ? `n=${shell.n} valence` : `n=${shell.n}`,
                color: CURVE_COLORS[i % CURVE_COLORS.length],
                points: atomRGrid.map((r, j) => ({ r, value: shell.curve[j] })),
            }));
        }
        // Colour by the subshell's position within its *shell*, computed
        // before any filtering (bug fix, found live): isolating 3d used to
        // recolour its curve to index 0's blue while the 3D lobes stayed
        // gold, because the index came from the filtered array. The colour
        // is an identity -- 3d is the shell's third subshell whether or not
        // the other two are on screen -- so it must not depend on what else
        // is being shown. shell_composition.ts's colorIndex is this same
        // position, which is what keeps a lobe and its curve in agreement.
        const shellSubshells = atomProfile.subshells.filter(s => s.n === atomSelectedShell);
        const subshells = atomSelectedSubshell
            ? shellSubshells.filter(s => s.l === atomSelectedSubshell.l && s.j === atomSelectedSubshell.j)
            : shellSubshells;
        return subshells.map(subshell => ({
            label: subshellLabel(subshell.n, subshell.l, subshell.j),
            ...(subshell.j === undefined ? {} : { spokenLabel: subshellSpokenLabel(subshell.n, subshell.l, subshell.j) }),
            color: CURVE_COLORS[shellSubshells.indexOf(subshell) % CURVE_COLORS.length],
            points: atomRGrid.map((r, j) => ({ r, value: subshell.curve[j] })),
        }));
    }, [atomProfile, atomLevel, atomSelectedShell, atomSelectedSubshell, atomRGrid]);

    // The same curves the plot is showing, from the non-relativistic solve,
    // dashed (spec §5 Phase 4) -- extracted to a pure helper (fix round 1,
    // I2) so the matching, scaling and colour rules are unit-testable on
    // their own rather than only through a rendered component tree.
    const { curves: comparisonCurves, note: comparisonNote } = useMemo(
        () => buildComparisonCurves({
            profile: atomProfile,
            level: atomLevel,
            selectedShell: atomSelectedShell,
            selectedSubshell: atomSelectedSubshell,
            rGrid: atomRGrid,
        }),
        [atomProfile, atomLevel, atomSelectedShell, atomSelectedSubshell, atomRGrid]
    );

    // The inspector's plot tabs (spec §9.1, ruling R2): which functions this
    // level can plot, the one on screen (stored in eov.display, never in a
    // link), and its curves -- the same ones the CSV exports (ruling C6).
    const display = usePref(displayPref);
    const atomPlotTabs = useMemo(
        () => (atomProfile ? plotTabsFor(atomLevel, atomSelectedSubshell !== null, pictureRelativity !== 'off') : []),
        [atomProfile, atomLevel, atomSelectedSubshell, pictureRelativity],
    );
    const activePlotTab = atomPlotTabs.length > 0 ? resolvePlotTab(atomPlotTabs, display.plotTab) : null;
    const handlePlotTab = useCallback((id: PlotTabId) => displayPref.set({ ...displayPref.get(), plotTab: id }), []);
    const atomTabCurves = useMemo(
        () => (atomProfile && activePlotTab
            ? tabCurves(activePlotTab.id, { profile: atomProfile, selectedSubshell: atomSelectedSubshell, rGrid: atomRGrid, distribution: atomCurves })
            : []),
        [atomProfile, activePlotTab, atomSelectedSubshell, atomRGrid, atomCurves],
    );
    // The Data card (spec §9.1): what is selected, computed from the drawn profile.
    const atomFactsNow = useMemo(() => {
        if (!atomProfile) return null;
        const method = shortMethodLabel(pictureRelativity);
        const find = (s: { n: number; l: number; j?: number }) => atomProfile.subshells.find(x => x.n === s.n && x.l === s.l && x.j === s.j);
        if (atomLevel === 'orbital' && atomSelectedOrbital) {
            // While the orbital computes, the iso value is still the previous orbital's (ruling T13-isostale).
            return orbitalFacts(atomSelectedOrbital, {
                enclosedFraction, isoLevel: renderFailed ? null : isoLevel, isoPending: isLoading,
                energy: find(atomSelectedOrbital)?.energy ?? null, method,
            });
        }
        if (atomSelectedSubshell) {
            const sub = find(atomSelectedSubshell);
            return sub ? subshellFacts(sub, { enclosedFraction, energy: sub.energy, method }) : null;
        }
        const configuration = speciesConfiguration(species);
        const shell = atomSelectedShell !== null ? atomProfile.shells.find(s => s.n === atomSelectedShell) : undefined;
        if (shell) {
            // The shell's own facts, not the whole atom's (ruling T13-shellcard).
            const own = configuration.filter(s => s.n === shell.n);
            return shellFacts({
                n: shell.n, occupancy: configurationLabelOf(own), electrons: own.reduce((sum, s) => sum + s.electrons, 0),
                drawnRadius: shell.contourRadius, method,
            });
        }
        return atomFacts({
            title: 'Whole atom',
            configuration: configurationLabelOf(configuration), valence: valenceConfigurationLabelOf(configuration),
            shellCount: atomProfile.shells.length, drawnRadius: atomProfile.displayRadius, method,
        });
    }, [atomProfile, pictureRelativity, atomLevel, atomSelectedOrbital, atomSelectedSubshell, atomSelectedShell, enclosedFraction,
        isoLevel, isLoading, renderFailed, species]);

    // Phone: the element is chosen from a full-screen list opened from the
    // element name, since the periodic table does not fit.
    const [elementPickerOpen, setElementPickerOpen] = useState(false);
    // Desktop: the element tile's ▾ opens the same list as a popover under it (spec §9.1).
    const [elementListAnchor, setElementListAnchor] = useState<HTMLElement | null>(null);

    // What the canvas is waiting for, if anything. The panels switch to the
    // new element or orbital at once while the old picture stays up until
    // the new one is ready, and the only sign of that used to be a 4 px bar
    // at the bottom of the controls -- often scrolled out of view. The
    // canvas now dims and says what it is working on.
    const atomOrbitalBusy = isAtomMode && atomLevel === 'orbital' && showBusy;
    const canvasBusyLabel = isMoleculeMode
        ? (showMoleculeBusy
            ? (molecule.renderLabel ?? `Loading ${molecule.index?.find(e => e.id === molecule.selectedId)?.name ?? molecule.selectedId}…`)
            : null)
        : isAtomMode
        ? (showAtomBusy
            // Names the mode being solved for: a relativistic solve is two
            // SCFs (the comparison too), so a wait needs its reason.
            ? `Solving ${speciesTitle(species)}${SOLVING_SUFFIX[relativity]}…`
            : atomOrbitalBusy && atomSelectedOrbital
                // A j-level's orbital is named as its crumb is: 6p_z · 6p³⁄₂.
                ? `Computing ${orbitalName(atomSelectedOrbital.n, atomSelectedOrbital.l, atomSelectedOrbital.ml)}${
                    atomSelectedOrbital.j === undefined ? '' : ` · ${subshellLabel(atomSelectedOrbital.n, atomSelectedOrbital.l, atomSelectedOrbital.j)}`}…`
                : null)
        // Bonds' files first: while they load, any render still running is
        // of the selection being left, not the one waited for.
        : showBondsLoading
            ? `Loading ${systemFormula(bonds.system)}${bonds.R !== null ? ` at R = ${bonds.R.toFixed(2)} a₀` : ''}…`
            : (showBusy
                ? (renderedField
                    ? `Computing ${renderedField.label}…`
                    : renderedParams ? `Computing ${orbitalName(renderedParams.n, renderedParams.l, renderedParams.ml)}…` : null)
                : null);

    // A marching-cubes surface is coloured by the sign of ψ, unlike the shell
    // views, which colour by shell or subshell. Say so where it applies.
    // Both build the combination's sources (and the plot samples three radial
    // curves), so they follow the selection rather than every render.
    const selectionLegend = useMemo(() => overlayLegend(combination), [combination]);
    const selectionPlot = useMemo(() => combinationCurves(combination), [combination]);
    const combinationLegend = isBasicMode && renderedField && selectionLegend ? themed(selectionLegend) : null;
    // Not over an empty canvas: a refused combination draws nothing. A
    // molecule's density has no phase; it has its own key below.
    // In Molecules mode only an orbital has a sign: the density is one
    // colour and the ESP map has its own key (EspLegend).
    // Neither key stands over a surface that failed (and was cleared).
    const moleculeKeysShown = isMoleculeMode && molecule.meta !== null && molecule.renderError === null;
    const showPhaseLegend = isMoleculeMode
        ? moleculeKeysShown && molecule.surface.kind === 'mo'
        : (isAtomMode ? atomLevel === 'orbital' : Boolean(renderedParams || renderedField))
            && !combinationLegend && !isBondsDensity;

    // The drill-down's next step. On a desktop its chips continue the
    // configuration in Explore › Configuration and its energy diagram is in
    // Explore › Orbitals (spec §9.1); on a phone the whole panel is in the
    // Explore tab's navigation card.
    const subshellPanelProps = atomProfile && atomSelectedShell !== null ? {
        subshells: atomProfile.subshells, shellN: atomSelectedShell, selectedSubshell: atomSelectedSubshell,
        selectedOrbital: atomSelectedOrbital, onSelectSubshell: handleSelectSubshell, onSelectOrbital: handleSelectOrbital,
        // Ruling C9: the drawn profile's mode, not the switch's.
        relativity: atomProfile.relativity ?? 'off',
    } : null;
    const showSubshells = atomLevel === 'shell' || atomLevel === 'orbital';
    const subshellPanel = showSubshells && subshellPanelProps ? <SubshellPanel {...subshellPanelProps} palette={palette} /> : null;

    // One element for both layouts: LevelNav places it under the element
    // button on a desktop and at the top of the phone's Explore tab, and the
    // phone header's LevelNav leaves it out (layout contract, §3.8). The
    // energies go in unfiltered: SpeciesControls makes the species-key check
    // itself (ruling C5).
    const speciesControls = (
        <SpeciesControls
            species={species}
            onChargeChange={handleChargeChange}
            onExcitationChange={handleExcitationChange}
            energies={atomEnergies}
            radii={atomProfile ? {
                displayRadius: atomProfile.displayRadius,
                reference: atomProfile.reference ?? null,
                referenceUnavailable: atomProfile.referenceUnavailable ?? null,
            } : null}
            unbound={atomUnbound}
            pictureFailed={atomError !== null}
            pictureRelativity={pictureRelativity}
        />
    );

    const levelNavProps = {
        Z: atomZ,
        configuration: speciesConfiguration(species),
        // Named only when it is not the plain element: a neutral atom's
        // button keeps exactly the name it always had ("currently Sodium").
        speciesSymbol: isNeutralGround(species) ? undefined : speciesSymbol(species),
        speciesTitle: speciesTitle(species),
        speciesControls,
        shellsUnavailable: atomUnbound !== null,
        selectedShell: atomSelectedShell,
        selectedSubshell: atomSelectedSubshell,
        selectedOrbital: atomSelectedOrbital,
        onNavigate: handleLevelNavigate,
        onChangeElement: isNarrow ? () => setElementPickerOpen(true) : () => setTableOpen(true),
        relativity: pictureRelativity,
        pictureShown: atomProfile !== null,
    };
    // The Relativity switch chooses the model, so it sits with the
    // configuration: Explore › Configuration on a desktop, the phone's
    // Explore tab (spec §9.1, §9.8).
    const relativityControl = isAtomMode && (
        <RelativityControl relativity={relativity} relativityIsDefault={relativityIsDefault}
            onRelativityChange={handleRelativityChange} relativityReadout={relativityReadout} />
    );

    // Fix round 1 (I1): in Bonds mode, exportAvailability also needs
    // useBondsData's own loading/error (not in Redux) to refuse a picture
    // that is stale against the panel's current selection -- so this can no
    // longer be the bare selector `useAppSelector(exportAvailability, ...)`.
    const availability = useAppSelector(
        state => exportAvailability(state, isBondsMode ? { loading: bondsData.loading, error: bondsData.error } : undefined),
        shallowEqual,
    );
    // What the plot shows, at the moment of export -- the same curves
    // already computed for the radial plot (atomCurves, selectionPlot), not
    // a fresh sample: ruling C6, an exported number equals the plotted one.
    const csvCurvesNow = useCallback((): CsvCurve[] => {
        // The plot tab on screen (spec §9.1): its curves, exactly as plotted.
        if (isAtomMode) return activePlotTab && activePlotTab.id !== 'distribution' ? atomTabCurves : atomCurves;
        // Bonds' CSV is the potential curve, built from bondsScan/h2plus's
        // own data (run_export.ts's bondsCsvFor, ruling C5), not a radial curve.
        if (!isBasicMode) return [];
        if (renderedField) return selectionPlot?.curves ?? [];
        if (!renderedParams) return [];
        const { n: pn, l: pl, Z: pZ, rMax } = renderedParams;
        return [{ label: 'P(r)', points: radialProfile(pn, pl, pZ, rMax, PLOT_SAMPLE_COUNT).map(p => ({ r: p.r, value: p.probability })) }];
    }, [isAtomMode, isBasicMode, atomCurves, activePlotTab, atomTabCurves, renderedField, selectionPlot, renderedParams]);
    const handleExport = useCallback(async (kind: ExportKind, options: ExportOptions) => {
        // The file's "view:" link names the angle on screen, as Share's does.
        const state = stateNow();
        const result = await runExport(kind, {
            state, shareUrl: shareUrlFor(encodeStateOf(state)), csvCurves: csvCurvesNow(),
            handle: exportHandleRef.current, phaseLegend: showPhaseLegend, combinationLegend,
            phaseColours: [phase.legendPositive, phase.legendNegative],
            // A DOM Worker's onmessage is typed with `this`; this states that
            // it satisfies CubeWorkerHandle's structural shape, which does not care.
            createCubeWorker: createExportWorker as unknown as () => CubeWorkerHandle,
            // Ruling C5 (Task 13b): Bonds' own loaded data, fetched outside
            // Redux (useBondsData's cache) -- the scan for captions/CSV, the
            // meta for a molecule cube's atoms, loading/error for the
            // mismatch gate above (fix round 1, I1). h2plusCurve is the live
            // plot's own cached curve (fix round 1, I2): the CSV must not
            // re-solve it on the main thread.
            bondsScan: bondsData.scan, bondsMeta: bondsData.meta, bondsLoading: bondsData.loading, bondsError: bondsData.error,
            h2plusCurve: h2plusCurve.curve,
            // The plot tab's own quantity line; the radial distribution's is null, keeping today's (ruling R2).
            csvQuantity: isAtomMode ? activePlotTab?.csvQuantity ?? undefined : undefined,
            ...options,
        });
        downloadBlob(result.blob, result.filename);
    }, [
        stateNow, csvCurvesNow, showPhaseLegend, combinationLegend, phase,
        bondsData.scan, bondsData.meta, bondsData.loading, bondsData.error, h2plusCurve.curve, isAtomMode, activePlotTab,
    ]);
    const stlSolids = useCallback(() => exportHandleRef.current?.surfaceCount() ?? 0, []);
    // Ruling DC6: the glTF item names the scheme and theme whose colours it keeps.
    const exportLook = useMemo(() => ({ theme: themeMode, scheme: render.scheme }), [themeMode, render.scheme]);
    // Memoised: Controls is React.memo, and a fresh element every render would defeat it.
    const shareExportBar = useMemo(
        () => (
            <ShareExportBar
                onShare={handleShare} onExport={handleExport} availability={availability} stlSolids={stlSolids}
                items={exportItemsFor(atomMode, exportLook)}
            />
        ),
        [handleShare, handleExport, availability, stlSolids, atomMode, exportLook]
    );
    const shareExportToolbar = useMemo(
        () => (
            <ShareExportBar variant="toolbar" onShare={handleShare} onExport={handleExport} availability={availability}
                stlSolids={stlSolids} items={exportItemsFor(atomMode, exportLook)} />
        ),
        [handleShare, handleExport, availability, stlSolids, atomMode, exportLook]
    );

    // Molecules mode's navigation (layout contract §3.8): the whole card in
    // the desktop's left column; on a phone, the name in the header and the
    // rest in the Explore tab -- LevelNav's split.
    const moleculeNavProps = {
        entries: moleculeEntries, indexError: molecule.indexError, meta: molecule.meta, selectedId: molecule.selectedId,
        isLoading: molecule.isLoadingMeta, surface: molecule.surface,
        onSelectMolecule: (id: string) => dispatch(selectMolecule({ id })),
        onSurfaceChange: (surface: MoleculeSurface) => dispatch(setSurface(surface)),
        onOpenPicker: () => setMoleculePickerOpen(true),
    };
    // The structure and dipole switches belong with the view settings
    // (Controls' children slot), with the dipole's value and -- for ozone --
    // the caveat that must never be separated from it (ruling T7-O3).
    const moleculeOptions = isMoleculeMode && molecule.meta && (
        <MoleculeViewOptions showStructure={molecule.showStructure} showDipole={molecule.showDipole}
            onShowStructure={on => dispatch(setShowStructure(on))} onShowDipole={on => dispatch(setShowDipole(on))}
            dipoleText={formatDipole(molecule.meta)} caveat={molecule.meta.caveat ?? null} />
    );
    // What the enclosed fraction produced, under its select (ruling D22).
    // Only once the surface asked for has landed: while the next one
    // computes, the last contour belongs to the surface being left, and a
    // density's ρ must not be read as an orbital's |ψ|².
    const moleculeSurfaceLanded = molecule.renderLabel === null && molecule.renderError === null && molecule.isoLevel !== null;
    const moleculeIsoNote = !isMoleculeMode || molecule.surface.kind === 'esp' ? undefined
        : !moleculeSurfaceLanded ? (molecule.surface.kind === 'density' ? 'contour of constant ρ' : undefined)
        : molecule.surface.kind === 'mo' ? `|ψ|² = ${molecule.isoLevel!.toExponential(2)}`
        : `ρ = ${molecule.isoLevel!.toExponential(2)} e/a₀³`;

    const controls = (
        <Controls
            mode={atomMode}
            atomLevel={atomLevel}
            atomZ={atomZ}
            onAtomElementChange={handleAtomElementChange}
            showElementPicker={false}
            initialN={n}
            onNChange={setN}
            initialL={l}
            onLChange={setL}
            initialMl={ml}
            onMlChange={setMl}
            initialEnclosedFraction={enclosedFraction}
            onEnclosedFractionChange={handleEnclosedFractionChange}
            combination={combination}
            onCombinationChange={handleCombinationChange}
            isoLevel={isoLevel}
            onUpdateOrbital={handleOrbitalParamsChange}
            surfaceStyle={surfaceStyle}
            onSurfaceStyleChange={handleSurfaceStyleChange}
            hideSurfaceStyle={isAtomMode}
            isBusy={isAtomMode ? showAtomBusy : showBusy}
            fractionNote={isBondsDensity ? FIXED_RHO_NOTE
                : isMoleculeMode && molecule.surface.kind === 'esp' ? ESP_SURFACE_NOTE : undefined}
            isoNote={moleculeIsoNote}
        >
            {isAtomMode ? (
                <SurfaceAndScheme surfaceMode={surfaceStyle.mode} meshLevel={atomLevel === 'orbital'}
                    onSurfaceMode={mode => handleSurfaceStyleChange({ mode })} />
            ) : (moleculeOptions || null)}
        </Controls>
    );

    // Bonds mode's navigation (layout contract §3.8): the desktop's left
    // column, the phone's Explore tab. The curve is not in it -- it goes
    // where every mode's plot goes (renderRadialPlot).
    const bondsPanel = (
        <BondsPanel
            bonds={bonds}
            data={bondsData}
            note={bondsNote}
            onSelectSystem={(id: BondsSystemId) => dispatch(selectBondsSystem(id))}
            onCommitH2PlusR={(R: number) => dispatch(setH2PlusR(R))}
            onScanIndex={handleScanIndex}
            onView={(view: BondsView) => dispatch(setBondsView(view))}
            onDensityIso={(value: number) => dispatch(setDensityIso(value))}
        />
    );

    const renderRadialPlot = (width: number, collapsible: boolean) => {
        // Ruling D23: where the other modes plot, Molecules lists its
        // orbitals by energy (degenerate sets grouped by energy, which
        // MoDiagram's label grouping cannot do for these point groups).
        if (isMoleculeMode) {
            return molecule.meta && (
                <div className="molecule-orbital-card">
                    <MoleculeOrbitalList orbitals={molecule.meta.orbitals}
                        selectedIndex={molecule.surface.kind === 'mo' ? molecule.surface.index : null}
                        onSelect={index => dispatch(setSurface({ kind: 'mo', index }))}
                        method={molecule.meta.method.density} symmetry={molecule.meta.symmetry} />
                </div>
            );
        }
        if (isBondsMode) {
            return (
                <BondsCurvePlot bonds={bonds} data={bondsData} h2plus={h2plusCurve} width={width}
                    onCommitH2PlusR={R => dispatch(setH2PlusR(R))} onScanIndex={handleScanIndex} />
            );
        }
        if (isBasicMode) {
            // A combination's plot is its ingredients and the result (see
            // combinationCurves): the weighted sum is its exact radial distribution.
            const combinationPlot = renderedField ? selectionPlot : null;
            if (combinationPlot) {
                return (
                    <RadialPlot
                        n={2}
                        l={0}
                        Z={BASIC_ORBITALS_Z}
                        rMax={combinationPlot.rMax}
                        width={width}
                        collapsible={collapsible}
                        curves={themed(combinationPlot.curves)}
                    />
                );
            }
            return renderedParams && (
                <RadialPlot
                    n={renderedParams.n}
                    l={renderedParams.l}
                    Z={renderedParams.Z}
                    rMax={renderedParams.rMax}
                    width={width}
                    collapsible={collapsible}
                    lineColour={palette[0]}
                />
            );
        }
        // The plot tab on screen (spec §9.1). Ruling R2: the radial
        // distribution keeps today's curves, comparisons, peaks and names.
        const distributionTab = activePlotTab?.id === 'distribution';
        return atomProfile && activePlotTab && (
            <RadialPlot
                // n/l are unused in multi-curve mode (see RadialPlot); Z is
                // real, since the hover readout's shell label logic has no
                // other use for it here.
                n={1}
                l={0}
                Z={atomProfile.Z}
                rMax={atomPlotRange}
                scale={atomLevel === 'atom' ? 'sqrt' : 'linear'}
                width={width}
                collapsible={collapsible}
                curves={themed(distributionTab ? [...atomCurves, ...comparisonCurves] : atomTabCurves)}
                title={activePlotTab.title}
                caption={activePlotTab.caption}
                signed={activePlotTab.signed}
                ariaLabel={plotAriaLabel(activePlotTab)}
                comparisonNote={distributionTab ? comparisonNote : null}
                peaks={distributionTab ? Array.from(atomProfile.shellPeaks) : undefined}
                cutFaceNote={atomLevel !== 'orbital'}
                hoverRadius={atomHoverRadius}
                onHoverRadius={handleAtomHoverRadius}
            />
        );
    };

    // The Atom screen's inspector (spec §9.1): docked on a desktop, a drawer
    // at medium width, stacked in the phone's Plot tab (ruling R7). Ruling
    // DX1: before a profile it is the plain inspector, so its column and the
    // drawer's bar hold their place while the atom solves (§8.6).
    const atomInspector = (variant: 'docked' | 'drawer' | 'stacked') => (activePlotTab ? (
        <AtomInspector variant={variant} open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)}
            plotTabs={atomPlotTabs} plotTab={activePlotTab} onPlotTab={handlePlotTab}
            plot={renderRadialPlot(variant === 'stacked' ? PHONE_PLOT_WIDTH : PLOT_WIDTH, false)}
            facts={atomFactsNow} csvReason={availability.csv} onExportCsv={() => { void handleExport('csv', {}); }} />
    ) : (
        <Inspector variant={variant} body={null} open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)} />
    ));

    // A phone has no viewport toolbar (ruling R6): Reset view, Share and Export end the View tab, as before.
    const phoneViewActions = (
        <div className="view-actions">
            <Button id="reset-view" variant="outlined" onClick={handleResetView}>Reset view</Button>
            {shareExportBar}
        </div>
    );

    // The phone sheet's tabs, one job each. Basic Orbitals has no drill-down,
    // so its orbital choice and view settings share one tab; Bonds has its
    // panel, as atom mode has its drill-down.
    const phoneTabs = isMoleculeMode
        ? [
            {
                key: 'explore', label: 'Explore',
                content: (
                    <>
                        <MoleculeNav {...moleculeNavProps} variant="body" />
                        <MoleculeJobsSection />
                    </>
                ),
            },
            { key: 'view', label: 'View', content: <>{controls}{phoneViewActions}</> },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ]
        : isBondsMode
        ? [
            { key: 'explore', label: 'Explore', content: bondsPanel },
            { key: 'view', label: 'View', content: <>{controls}{phoneViewActions}</> },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ]
        : isAtomMode
        ? [
            {
                key: 'explore',
                label: 'Explore',
                // Spec §9.8: Explore holds the left panel's tabs as sections, the Relativity switch included.
                content: <><LevelNav {...levelNavProps} variant="body">{subshellPanel}</LevelNav>{relativityControl}</>,
            },
            { key: 'view', label: 'View', content: <>{controls}<AxesSwitch />{phoneViewActions}</> },
            // Ruling R7: the inspector stacked, Plot then Data, with no inner Plot/Data tabs.
            { key: 'plot', label: 'Plot', content: atomInspector('stacked') },
        ]
        : [
            { key: 'view', label: 'Orbital & view', content: <>{controls}{phoneViewActions}</> },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ];

    // A molecule that did not load, or a surface that did not draw (spec
    // §3.5). Said once -- not as a Snackbar too (Bonds' ruling C9) -- and a
    // failed surface is cleared rather than left standing beside its own
    // error. On a phone it heads the key stack: at .atom-error's top: 80px
    // it sat over the readout chip (fix round 1, review Minor 3).
    const moleculeAlert = isMoleculeMode && (molecule.error || molecule.renderError) ? (
        <Alert severity="error" className={isNarrow && molecule.meta ? 'molecule-error' : 'atom-error'}>
            {molecule.error ?? `Could not draw ${SURFACE_NAME[molecule.surface.kind]}: ${molecule.renderError}`}
        </Alert>
    ) : null;

    // The Atom screen's Explore panel (spec §9.1): the element tile and the
    // breadcrumb, then Configuration (the drill-down, Charge/Excite and the
    // Relativity switch), Orbitals (the whole atom's energies and About) and
    // Display (the view controls).
    const atomExplore = (
        <AtomExplore
            header={(
                <>
                    <ElementTile species={species} tableOpen={tableOpen} onOpenTable={() => setTableOpen(true)}
                        onToggleTable={() => setTableOpen(open => !open)} onOpenList={setElementListAnchor} />
                    <LevelNav {...levelNavProps} variant="crumbs" />
                </>
            )}
            configuration={(
                <>
                    <LevelNav {...levelNavProps} variant="configuration">
                        {subshellPanelProps && showSubshells && <SubshellPanel {...subshellPanelProps} part="chips" palette={palette} />}
                    </LevelNav>
                    {speciesControls}
                    {relativityControl}
                </>
            )}
            orbitals={(
                <>
                    {atomProfile && (
                        // At the whole atom no shell is open, so none is picked out (ruling T10-wholeatom).
                        <SubshellPanel subshells={atomProfile.subshells} shellN={atomSelectedShell}
                            selectedSubshell={atomSelectedSubshell} selectedOrbital={atomSelectedOrbital}
                            onSelectSubshell={handleSelectSubshell} onSelectOrbital={handleSelectOrbital}
                            relativity={atomProfile.relativity ?? 'off'} part="diagram" palette={palette} />
                    )}
                    {atomProfile && <OrbitalEnergyList subshells={atomProfile.subshells} relativity={pictureRelativity} />}
                    <LevelNav {...levelNavProps} variant="about" />
                </>
            )}
            display={<>{controls}<AxesSwitch /></>}
        />
    );

    const exploreContent = isBondsMode ? bondsPanel
        : isMoleculeMode ? <><MoleculeNav {...moleculeNavProps} /><MoleculeJobsSection /></>
        // Basic Orbitals had no left column: its n/l/mₗ, combination and view settings go here until 6G-2.
        : controls;
    // Basic Orbitals, Bonds and Molecules (the atom has its own: atomInspector above).
    const inspectorBody = (
        <>
            {!isBasicMode && controls}
            {renderRadialPlot(PLOT_WIDTH, false)}
        </>
    );

    const session = useAppSelector(state => state.jobs.session);
    const avatar = (
        <AvatarMenu
            session={session}
            isOwner={isOwner}
            dev={BUILD_ENV.dev}
            ownerBar={<ConnectedOwnerBar page="/" showError={false} />}
            onSignIn={() => signInHere('/', text => dispatch(sessionFailed(text)))}
            brandId={brand.id}
            onBrand={id => brandPref.set(id)}
            extra={isNarrow ? (
                <div className="avatar-extra">
                    <div className="avatar-extra-row"><ThemeSwitch /><span>Theme</span></div>
                    <Button size="small" startIcon={<HelpOutline fontSize="small" />} onClick={() => setHelpOpen(true)}>Help</Button>
                </div>
            ) : undefined}
        />
    );
    const urlMode = (viewMode: ViewMode) => ({ atom: 'atom', hydrogenic: 'basic', bonds: 'bonds', molecule: 'molecule' })[viewMode];
    const topBarTabs: TopBarTab[] = [
        { key: 'explore', label: 'Explore', href: `/#mode=${urlMode(lastExploreModeRef.current)}`, current: !isMoleculeMode,
            onSelect: () => selectMode(lastExploreModeRef.current) },
        { key: 'molecules', label: 'Molecules', href: '/#mode=molecule', current: isMoleculeMode, onSelect: () => selectMode('molecule') },
    ];
    const topBar = (
        <TopBar
            brand={brand}
            mode={themeMode}
            tabs={topBarTabs}
            search={<GlobalSearch sources={searchSources} onPick={handleSearchPick} onWantIndex={wantIndex} />}
            avatar={avatar}
            onHelp={() => setHelpOpen(true)}
            sessionNote={session.expired && !session.signedIn ? SESSION_ENDED : null}
        />
    );
    const phoneTopBar = (compact: boolean) => (
        <PhoneTopBar brand={brand} themeMode={themeMode} mode={atomMode} onModeChange={selectMode}
            onOpenSearch={() => setPhoneSearchOpen(true)} avatar={avatar} compact={compact} />
    );
    // A phone held upright: top bar, then the header line under it. Sideways: one merged 44 px line (spec §7).
    const phoneChrome = isNarrow && (
        <>
            {!isPhoneLandscape && phoneTopBar(false)}
            {isAtomMode && (
                <div className="phone-header">
                    {isPhoneLandscape && phoneTopBar(true)}
                    <LevelNav {...levelNavProps} variant="header" />
                </div>
            )}
            {isMoleculeMode && (
                <div className="phone-header">
                    {isPhoneLandscape && phoneTopBar(true)}
                    <MoleculeNav {...moleculeNavProps} variant="header" />
                </div>
            )}
            {isBondsMode && (
                <div className="phone-header">
                    {isPhoneLandscape && phoneTopBar(true)}
                    <span className="bonds-header">
                        {systemFormula(bonds.system)} · {bonds.R !== null ? `R = ${bonds.R.toFixed(2)} a₀`
                            : bondsData.error ? 'not loaded' : 'loading…'}
                    </span>
                </div>
            )}
            {isBasicMode && isPhoneLandscape && <div className="phone-header">{phoneTopBar(true)}</div>}
            <PhoneSheet tabs={phoneTabs} active={phoneTab} onChange={setPhoneTab} />
        </>
    );

    const viewport = (
        <main
            id="canvas-container"
            className={`viewport-cell${canvasBusyLabel ? ' busy' : ''}`}
            data-busy={isLoading ? 'true' : 'false'}
            aria-label="3D view"
            tabIndex={-1}
        >
            <OrbitalViewer
                onOrbitalRendered={handleOrbitalRendered}
                onOrbitalFailed={handleOrbitalFailed}
                enclosedFraction={enclosedFraction}
                exportHandleRef={exportHandleRef}
            />
            {canvasBusyLabel && (
                <div className="canvas-busy" role="status" aria-live="polite">
                    <CircularProgress size={22} thickness={5} color="inherit" />
                    <span>{canvasBusyLabel}</span>
                </div>
            )}
            {/* Spec §3.5: an anion LDA cannot bind draws nothing, and
                the empty canvas says why. The card's alert
                (SpeciesControls) is the one announced; while it is on
                screen this note is for the eye only, so the reason is
                never heard twice. A folded phone sheet has no card, so
                there the note goes into a status region that is always
                mounted in atom mode -- a live region inserted together
                with its text is not reliably announced. */}
            {isAtomMode && isNarrow && (
                <div className="canvas-unbound-live" role="status">
                    {atomUnbound && phoneTab !== 'explore' && <div className="canvas-unbound">{atomUnbound}</div>}
                </div>
            )}
            {isAtomMode && atomUnbound && !(isNarrow && phoneTab !== 'explore') && (
                <div className="canvas-unbound" aria-hidden="true">{atomUnbound}</div>
            )}
            {!isNarrow && <TitleBlock title={viewTitleText} subtitle={viewSubtitle} />}
            {!isNarrow && (
                <ViewportToolbar onResetView={handleResetView} shareExport={shareExportToolbar}
                    fullscreen={fullscreen.active} onToggleFullscreen={fullscreen.toggle} />
            )}
            {isAtomMode && atomProfile && !atomUnbound && (
                <KeyColumn compact={isNarrow}>
                    <AtomKeys level={atomLevel} scheme={render.scheme} cutOn={surfaceStyle.clipAxis !== 'none'} phase={phase}
                        shellItems={themed(atomCurves).map(curve => ({ label: curve.label, colour: curve.color, spoken: curve.spokenLabel }))} />
                </KeyColumn>
            )}
            {isAtomMode && !isNarrow && stripItems.length > 0 && (
                <ThumbnailStrip items={stripItems} label="orbitals in view" rGrid={atomRGrid} themeKey={stripThemeKey}
                    onSelect={handleLevelNavigate} variant="overlay" collapsed={stripCollapsed} onCollapsedChange={setStripCollapsed} />
            )}
            {!isMoleculeMode && !isAtomMode && (showPhaseLegend || isBondsDensity || combinationLegend) && (
                <KeyColumn compact={isNarrow}>
                    {showPhaseLegend && <PhaseKey positive={phase.legendPositive} negative={phase.legendNegative} />}
                    {isBondsDensity && (
                        <div className="phase-legend density-key" aria-label="surface colour key">
                            <span className="phase-legend-item">
                                <span className="phase-legend-swatch" style={{ background: densitySurfaceHex(themeMode, render.scheme) }} />
                                ρ = {drawnDensityIso} e/a₀³, total electron density
                            </span>
                        </div>
                    )}
                    {combinationLegend && (
                        <div className="phase-legend" aria-label="combination colour key">
                            {combinationLegend.map(item => (
                                <span key={item.label} className="phase-legend-item">
                                    <span className="phase-legend-swatch" style={{ background: item.color }} />{item.label}
                                </span>
                            ))}
                            <span className="phase-legend-item">darker: ψ &lt; 0</span>
                        </div>
                    )}
                </KeyColumn>
            )}
            {/* Molecules: the tier badge, the pick readout, the ESP key and
                an orbital's ψ key share the bottom-centre slot, stacked
                (spec §3.8: no new floating panel). The tier heads it and
                is always there (spec §9.1, preflight D12), so the stack
                shows whenever a molecule is loaded -- the others keep
                their own conditions. A molecule that failed to load has
                no meta: the error, no badge. */}
            {isMoleculeMode && molecule.meta && (
                <div className="molecule-legend-stack">
                    <TierBadge meta={molecule.meta} compact={isNarrow} />
                    {isNarrow && moleculeAlert}
                    {molecule.showStructure && (
                        <MoleculeReadout atoms={molecule.meta.atoms} pick={molecule.pick}
                            geometrySource={molecule.meta.geometrySource} touch={isNarrow} />
                    )}
                    {moleculeKeysShown && molecule.surface.kind === 'esp' && (
                        <EspLegend range={molecule.espRange} method={molecule.meta.method.density} compact={isPhoneLandscape} />
                    )}
                    {showPhaseLegend && <PhaseKey positive={phase.legendPositive} negative={phase.legendNegative} />}
                </div>
            )}
            {/* Over the canvas on a desktop; on a phone it heads the key
                stack instead (with no molecule loaded there is no stack,
                and nothing for it to cover). */}
            {moleculeAlert && !(isNarrow && molecule.meta) && moleculeAlert}
            {/* Addendum 3: the element selector is a real periodic
                table on anything wider than a phone, as a pop-over over
                the view. A table does not survive a phone width, so
                below that a searchable list stands in for it -- the two
                are alternatives, never both at once. */}
            {isAtomMode && !isNarrow && tableOpen && (
                <PeriodicTable Z={atomZ} onSelect={handleAtomElementChange} onClose={closeTable} />
            )}
            {phoneChrome}
            {isMedium && (isAtomMode ? atomInspector('drawer') : (
                <Inspector variant="drawer" body={inspectorBody} open={viewPanelOpen}
                    onOpenChange={open => setViewPanelOpen(() => open)} />
            ))}
                {isMoleculeMode && isNarrow && (
                <MoleculePickerDialog
                    open={moleculePickerOpen}
                    entries={moleculeEntries}
                    error={molecule.indexError}
                    selectedId={molecule.selectedId}
                    onSelect={id => dispatch(selectMolecule({ id }))}
                    onClose={() => setMoleculePickerOpen(false)}
                />
            )}
            {isAtomMode && isNarrow && (
                <ElementPickerDialog
                    open={elementPickerOpen}
                    Z={atomZ}
                    onSelect={handleAtomElementChange}
                    onClose={() => setElementPickerOpen(false)}
                />
            )}
            {isAtomMode && !isNarrow && (
                <ElementPickerDialog variant="popover" anchorEl={elementListAnchor} open={elementListAnchor !== null}
                    Z={atomZ} onSelect={handleAtomElementChange} onClose={() => setElementListAnchor(null)} />
            )}
            {/* Ruling R17: a solver that did not converge must show up as
                an explicit error, never as a silently-wrong picture. This
                should never fire -- every element in range converges. */}
            {isAtomMode && atomError && (
                <Alert severity="error" className="atom-error">
                    {atomError}
                </Alert>
            )}
            {/* Final review I3: Cognito comes back to / with no hash, so a
                failed sign-in can land on any mode -- by default atom
                mode, which has no owner corner -- and is said here,
                whatever is on screen, until dismissed. */}
            {signInError && (
                <Alert severity="error" className="sign-in-error" onClose={() => dispatch(sessionErrorDismissed())}>
                    {signInError}
                </Alert>
            )}
            <Snackbar
                open={Boolean(error)}
                onClose={() => dispatch(dismissOrbitalError())}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    severity="warning"
                    variant="filled"
                    onClose={() => dispatch(dismissOrbitalError())}
                >
                    {error}
                </Alert>
            </Snackbar>
        </main>
    );

    return (
        <>
            <AppShell
                layout={layout}
                wide={isWide}
                topBar={topBar}
                rail={<Rail mode={atomMode} onModeChange={selectMode} isOwner={isOwner} wide={isWide} />}
                explore={isAtomMode ? atomExplore : <ExplorePanel body={exploreContent} />}
                inspector={isAtomMode ? atomInspector('docked') : <Inspector variant="docked" body={inspectorBody} />}
                viewport={viewport}
                shellRef={shellRef}
                fullscreen={fullscreen.active}
            />
            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} brand={brand}
                aboutModel={isAtomMode ? <LevelNav {...levelNavProps} variant="about" />
                    : isBasicMode ? <p>{BASIC_ORBITALS_ABOUT}</p> : undefined} />
            {isNarrow && (
                <Dialog fullScreen open={phoneSearchOpen} onClose={() => setPhoneSearchOpen(false)} aria-label="Search">
                    <div className="phone-search-sheet">
                        <IconButton aria-label="close search" onClick={() => setPhoneSearchOpen(false)}><Close fontSize="small" /></IconButton>
                        <GlobalSearch variant="sheet" autoFocus sources={searchSources} onWantIndex={wantIndex}
                            onPick={action => { setPhoneSearchOpen(false); handleSearchPick(action); }} />
                    </div>
                </Dialog>
            )}
        </>
    );
}

export default App;
