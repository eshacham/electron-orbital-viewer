import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    IconButton,
    Snackbar,
    Typography,
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
    cameraMoved,
    previewOpacity,
    type BasicSelection,
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
import { subshellLabel, subshellSpokenLabel, configurationLabelOf, valenceConfigurationLabelOf, valenceShellsOf } from './atom/configurations';
import { useAtomSolver } from './atom/useAtomSolver';
import { useDeltaScfEnergies } from './atom/useDeltaScfEnergies';
import { Excitation, speciesConfiguration, speciesSymbol, speciesTitle, isValidExcitation, isNeutralGround } from './atom/species';
import { allowedCharges } from './atom/ion_configurations';
import SpeciesControls from './components/SpeciesControls';
import Controls, { RelativityControl } from './components/Controls';
import BasicExplore from './basic_ui/BasicExplore';
import { basicInfo, BASIC_ORBITALS_ABOUT } from './info/basic_info';
import { atomInfo } from './info/atom_info';
import { bondsInfo, FIXED_RHO_NOTE } from './info/bonds_info';
import { moleculeInfo } from './info/molecule_info';
import { ownerJobRecordOf, useOwnerJobRecord } from './jobs/owner_job_record';
import { useDrawOnSelection } from './basic_ui/useDrawOnSelection';
import { AxesSwitch } from './atom_ui/DisplayControls';
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
import { basicOrbitalParams, BASIC_ORBITALS_Z, DEFAULT_ENCLOSED_FRACTION, ORBITAL_RESOLUTION, SHELL_VIEW_CUT_AXIS } from './orbital_presets';
import { DEFAULT_OPACITY, OrbitalParams, SurfaceStyle } from './types/orbital';
import { useDelayedFlag } from './useDelayedFlag';
import { useMediaQuery, NARROW_VIEWPORT, MEDIUM_VIEWPORT, PHONE_LANDSCAPE, WIDE_VIEWPORT, TOPBAR_COMPACT, TOPBAR_LEVEL_COMPACT } from './useMediaQuery';
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
import BondsExplore from './bonds_ui/BondsExplore';
import BondsInspector from './bonds_ui/BondsInspector';
import BondsCurvePlot from './components/BondsCurvePlot';
import { useBondsData } from './bonds/useBondsData';
import { useH2PlusCurve } from './bonds/useH2PlusCurve';
import { bondsFieldRequest } from './bonds/bonds_request';
import { BondsSystemId, systemFormula } from './bonds/systems';
import { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, BondsView } from './store/bondsSlice';
import { selectMolecule, setSurface, setRepresentation, setShowDipole, MoleculeSurface } from './store/moleculeSlice';
import { insideBallNoteFor } from './molecules/inside_ball';
import { useMoleculeLoader } from './molecules/useMoleculeLoader';
import { spaceFillingUnavailableReason } from './molecules/vdw_radii';
import MoleculeNav, { type MoleculeNavHandle } from './components/MoleculeNav';
import MoleculePickerDialog from './components/MoleculePickerDialog';
import MoleculeReadout from './components/MoleculeReadout';
import MoleculeViewOptions from './components/MoleculeViewOptions';
import EspLegend from './components/EspLegend';
import MoleculeJobsSection from './components/MoleculeJobsSection';
import RequestWorkspace, { useRequestWorkspaceOpen } from './components/RequestWorkspace';
import MoleculeHeader from './molecule_ui/MoleculeHeader';
import MoleculePropertiesCard from './molecule_ui/MoleculePropertiesCard';
import TierBadge from './components/TierBadge';
import { ConnectedOwnerBar, signInHere } from './components/OwnerBar';
import { useComputedList } from './jobs/useComputedList';
import { useFollowedJob } from './jobs/useFollowedJob';
import { withComputed } from './jobs/computed';
import { requestOpened, selectIsOwner, sessionErrorDismissed, sessionFailed } from './store/jobsSlice';
import AppShell from './shell/AppShell';
import TopBar, { TopBarTab } from './shell/TopBar';
import { MODE_ITEMS, MODE_LABEL } from './shell/Rail';
import GlobalSearch from './shell/GlobalSearch';
import HelpDialog from './shell/HelpDialog';
import AvatarMenu from './shell/AvatarMenu';
import PhoneTopBar from './shell/PhoneTopBar';
import ExplorePanel from './shell/ExplorePanel';
import AtomExplore from './atom_ui/AtomExplore';
import ElementTile from './atom_ui/ElementTile';
import OrbitalEnergyList from './atom_ui/OrbitalEnergyList';
import AtomInspector from './atom_ui/AtomInspector';
import BasicInspector from './basic_ui/BasicInspector';
import { plotAriaLabel, plotTabsFor, resolvePlotTab, tabCurves, hydrogenicTabCurves, BASIC_PLOT_TABS } from './atom/plot_tabs';
import { atomFacts, orbitalFacts, shellFacts, subshellFacts } from './orbital_facts';
import Inspector, { type InspectorSection } from './shell/Inspector';
import InfoPanel from './info/InfoPanel';
import { InfoTopicProvider, useInfoTopic } from './info/useInfoTopic';
import { infoSelectionKey } from './info/selection_key';
import TitleBlock from './shell/TitleBlock';
import ViewportToolbar from './shell/ViewportToolbar';
import ThumbnailStrip from './shell/ThumbnailStrip';
import { atomStripItems, basicStripItems } from './thumbs/strip_items';
import { bondsStripItems, pendingBondsStripItems, type BondsStripItem } from './thumbs/bonds_strip_items';
import { moleculeStripItems, pendingMoleculeStripItems, type MoleculeStripItem, type MoleculeStripTarget } from './thumbs/molecule_strip_items';
import { useMoleculeStripData } from './thumbs/useMoleculeStripData';
import { ESP_LIMIT_HARTREE } from './molecules/esp_color';
import { frontierOccupied } from './molecules/orbital_display';
import { thumbnailService } from './thumbs/ThumbnailService';
import { thumbLookKey, thumbTileDevicePx } from './thumbs/thumb_key';
import { useDevicePixelRatio } from './thumbs/useDevicePixelRatio';
import KeyColumn, { AtomKeys, PhaseKey } from './shell/KeyColumn';
import FirstViewHint from './shell/FirstViewHint';
import { viewCaption, viewTitle } from './shell/view_title';
import { withSubscripts } from './format/subscripts';
import { flatSubscripts } from './format/sci';
import { useDocumentTitle } from './shell/useDocumentTitle';
import { useFullscreen } from './shell/useFullscreen';
import ThemeSwitch from './design/ThemeSwitch';
import { useQuantumTheme } from './design/useQuantumTheme';
import { BRAND } from './design/brands';
import { LAYOUT } from './design/tokens';
import { usePref } from './design/usePref';
import { displayPref, renderPref, hintPref, DEFAULT_RENDER, type PlotTabId } from './design/presentation';
import { glowOverridesOf, settledGlowPref } from './design/glow_pref';
import AdvancedAppearance from './components/AdvancedAppearance';
import { curvePalette, densitySurfaceHex, phaseColours, themeCurveColour } from './design/science';
import { BUILD_ENV } from './jobs/build_env';
import { SESSION_ENDED } from './jobs/api';
import { NO_COMBINATION } from './combinations';
import type { SearchAction } from './search/search_index';
import { atLeast, CONTROL_LEVEL, LEVEL_LABEL, type ControlId, type LearningLevel } from './levels/levels';
import { useLevel } from './levels/useLevel';
import LevelControl from './levels/LevelControl';
import LevelLine, { type HeldValue } from './levels/LevelLine';
import PhoneNoticeSlot from './shell/PhoneNoticeSlot';
import PhoneHeader from './shell/PhoneHeader';

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
 * The Electron-enclosed select's note while a molecule's ESP map is drawn
 * (ruling D22): the map is always drawn on the ρ = 0.001 surface (ruling
 * D4), so the fraction does not apply and the select is disabled.
 */
const ESP_SURFACE_NOTE = 'Fixed at ρ = 0.001 e/a₀³ — the surface ESP maps are conventionally drawn on, not an enclosed fraction';
/** Ruling P8: structure only (show=none) draws no contour, so the enclosed fraction applies to nothing. */
const NO_SURFACE_NOTE = 'No surface is drawn, so no contour applies';
/** R25-A-I1: how long after the "Orbital list" tile left full screen its reveal may still follow. */
const REVEAL_AFTER_FULLSCREEN_MS = 2000;

/** What a failed Molecules render was trying to draw, for its alert. */
const SURFACE_NAME: Record<MoleculeSurface['kind'], string> = {
    // `none` draws nothing, so it never fails (the slice clears a failure when it is chosen).
    density: 'the density', esp: 'the electrostatic potential', mo: 'the orbital', none: 'no surface',
};

/** Task 2: a hidden Relativity switch's non-default choice, as its line names it ("Showing the … picture"). */
const RELATIVITY_SHOWN: Record<RelativityMode, string> = {
    off: 'the non-relativistic picture',
    scalar: 'the scalar-relativistic picture',
    spinOrbit: 'the picture with spin–orbit',
};

/** How long a render has to take before the viewer is told it is working. */
const BUSY_INDICATOR_DELAY_MS = 400;

/** r_j = rMin * e^(j*dx), j = 0..size-1 -- the shared log grid every atom-profile curve is sampled on (see atomWorker.ts). */
function gridRadii(rMin: number, dx: number, size: number): number[] {
    return Array.from({ length: size }, (_, j) => rMin * Math.exp(j * dx));
}

function App() {
    const dispatch = useAppDispatch();
    const { isLoading, error, surfaceStyle, isoLevel, thumbOpacity } = useAppSelector(state => state.orbital);
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

    // Task 2: the learning level in use (stored, or raised for this visit by a link) decides which controls render:
    // a control above it is hidden, not greyed, and one line says where it appears (LevelLine).
    const { level, stored: storedLevel, raised: levelRaised, visitId, setLevel } = useLevel();
    const shows = useCallback((id: ControlId) => atLeast(level, CONTROL_LEVEL[id]), [level]);

    // The Relativity switch shows the effective mode -- the user's choice, or
    // the element's default -- since that is what is being solved for.
    // Everything that describes the picture on screen reads the drawn
    // profile's own mode instead (ruling C9): during a re-solve the two
    // differ, and the old picture must not be labelled as the new method.
    const relativity = useAppSelector(state => effectiveRelativity(state.atom));
    // Whether the mode shown is this element's default, whoever chose it
    // (final review I3): Scalar chosen on carbon persists onto gold, where it
    // is the default. Task 2's level line reads it.
    const relativityIsDefault = useAppSelector(state => effectiveRelativity(state.atom) === defaultRelativityFor(state.atom.Z));
    const pictureRelativity: RelativityMode = atomProfile ? profileRelativity(atomProfile) : relativity;
    // Task 6: the Relativity readout (what changed in the drawn picture) is Info's now (atomInfo).

    // Basic Orbitals' view state -- n/l/mₗ, the enclosed fraction, and Phase
    // 1's combination -- lives in the store, not in App: a shared link's URL
    // decoder can only dispatch, and cannot reach into a component's local
    // state to restore it.
    const { n, l, ml } = useAppSelector(state => state.orbital.basicSelection);
    const enclosedFraction = useAppSelector(state => state.orbital.enclosedFraction);
    const combination = useAppSelector(state => state.orbital.combination);
    const basicRenderNonce = useAppSelector(state => state.orbital.basicRenderNonce);
    // BasicExplore's chips report a change this way (ruling P3) -- one
    // handler for n, l and mₗ alike, replacing the old setN/setL/setMl
    // Controls' three selects each called their own. Stable, since
    // BasicExplore's own correction effects list it as a dependency.
    const handleBasicSelectionChange = useCallback(
        (change: Partial<BasicSelection>) => dispatch(setBasicSelection(change)),
        [dispatch]
    );
    // Ruling T2-I1: a chip pressed or a strip tile chosen while a combination is held below Advanced (its picker
    // hidden) leaves the combination first, as the ⌘K search's pick does, so the reader always has a way back to
    // one orbital. The selection is completed and corrected here (l < n, |mₗ| ≤ l), so the redraw that leaving the
    // combination triggers is already of a valid orbital. (No row correction calls this: they use the one above.)
    const handleBasicPick = useCallback((change: Partial<BasicSelection>) => {
        if (combination.kind === 'none' || atLeast(level, CONTROL_LEVEL.combinations)) {
            dispatch(setBasicSelection(change));
            return;
        }
        const next = { n, l, ml, ...change };
        if (next.l >= next.n) { next.l = 0; next.ml = 0; }
        if (Math.abs(next.ml) > next.l) next.ml = 0;
        dispatch(setBasicSelection(next));
        dispatch(setCombination(NO_COMBINATION));
    }, [combination.kind, level, n, l, ml, dispatch]);
    const handleEnclosedFractionChange = useCallback((value: number) => dispatch(setEnclosedFraction(value)), [dispatch]);
    const handleCombinationChange = useCallback((value: CombinationSelection) => dispatch(setCombination(value)), [dispatch]);
    const renderedField = useAppSelector(state => state.orbital.currentField);
    const renderFailed = useAppSelector(state => state.orbital.renderFailed);
    // Task 16d item 10: ruling R10's frame-time guard has Glow's halo and mesh lines off (Advanced appearance says so).
    const glowExtrasSuppressed = useAppSelector(state => state.orbital.glowExtrasSuppressed);

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
    // standardAxis() goes along with it (fix round 1): read this way, the
    // angle could just as easily be the app's own standard-view placement as
    // a real drag, and cameraMoved needs the axis to tell those apart.
    const store = useAppStore();
    const stateNow = useCallback(() => {
        const angles = exportHandleRef.current?.cameraAngles();
        if (angles) store.dispatch(cameraMoved(angles, exportHandleRef.current?.standardAxis() ?? 'none'));
        return store.getState();
    }, [store]);
    // Task 2: only Share's "Opens at" writes `lvl` -- encodeStateOf never does -- so a plain link keeps the
    // recipient's own level, and one copied "Opens at Basics" ends `&lvl=basics`.
    const handleShare = useCallback(async (opensAt?: LearningLevel): Promise<ShareOutcome> => {
        const url = shareUrlFor(encodeStateOf(stateNow())) + (opensAt ? `&lvl=${opensAt}` : '');
        return (await copyText(url)) ? { kind: 'copied' } : { kind: 'manual', url };
    }, [stateNow]);

    // Task 5 (ruling P17): the one-time hint goes away once the viewer does
    // either of the two things it suggests, not only via its own button --
    // picking a shell (handleLevelNavigate below), or rotating the camera
    // (OrbitalViewer's own controls 'start' listener, which only fires on a
    // real pointer drag). That second path is *not* wired through Redux's
    // cameraAngles here: P17's own fix makes the standard view non-canonical
    // whenever a cut is active, so a plain "cameraAngles changed since mount"
    // watch cannot tell a real drag apart from the viewer's own first paint
    // settling onto that standard view -- caught live, where every cut-away
    // Atoms scene dismissed the hint on load before anyone had touched it.
    const dismissHint = useCallback(() => {
        if (!hintPref.get().rotateDismissed) hintPref.set({ rotateDismissed: true });
    }, []);

    const handleSurfaceStyleChange = useCallback((change: Partial<SurfaceStyle>) => {
        dispatch(setSurfaceStyle(change));
        // A user-driven cut change while a link's cut is still waiting on the
        // solve (pendingCut) must win: without this, the link's stale cut
        // would land back on top of it once the profile arrives (progress.md,
        // "carry to Task 6").
        if ('clipAxis' in change || 'clipPosition' in change) dispatch(clearPendingCut());
    }, [dispatch]);
    // Ruling R20a-4 (fix round 1): a drag of the opacity slider moves the view only; its release commits (above).
    const handleOpacityPreview = useCallback((opacity: number) => { dispatch(previewOpacity(opacity)); }, [dispatch]);

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
            // Task 5 (ruling P17): picking a shell is the hint's other suggestion.
            case 'shell': dispatch(drillToShell(target.n)); dismissHint(); break;
            case 'subshell': dispatch(drillToSubshell(target.n, target.l, target.j)); break;
            case 'orbital': dispatch(drillToOrbital(target.n, target.l, target.ml, target.j)); break;
        }
    }, [dispatch, dismissHint]);

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
    // Task 4: Info's topic -- an (i)'s term until the selection changes (ruling PF4: each mode's selection key).
    const infoTopic = useInfoTopic(useAppSelector(infoSelectionKey));
    // An (i) brings Info on screen where the layout hides it: the phone's Info tab, the folded drawer.
    const revealInfo = () => {
        if (isNarrow) setPhoneTab('info');
        else if (isMedium && !viewPanelOpen) setViewPanelOpen(() => true);
    };
    const layout: 'desktop' | 'medium' | 'phone' = isNarrow ? 'phone' : isMedium ? 'medium' : 'desktop';
    // Below 1100 px the top bar's search shrinks to an icon (spec §7); a phone has its own search sheet instead.
    const compactTopBar = useMediaQuery(TOPBAR_COMPACT) && !isNarrow;
    // Task 2: and below 1024 px the Learning level folds to one button.
    const compactLevel = useMediaQuery(TOPBAR_LEVEL_COMPACT) && !isNarrow;
    // Medium width only: Explore starts open and can be folded to the rail, and back, on request.
    const [exploreCollapsed, setExploreCollapsed] = useState(false);
    const { mode: themeMode } = useQuantumTheme();
    const render = usePref(renderPref);
    // Task 16b: the viewer's own Glow values as the sliders last left them -- the strip's look (below).
    const settledGlow = glowOverridesOf(usePref(settledGlowPref), themeMode);
    // Task 5 (ruling P17): the one-time hint's own dismissed flag.
    const hintDismissed = usePref(hintPref).rotateDismissed;
    const phase = phaseColours(themeMode);
    const palette = curvePalette(themeMode);
    /** A curve, key or swatch in this theme's palette (index identity, §4.2). */
    const themed = useCallback(<T extends { color: string }>(items: T[]): T[] =>
        items.map(item => ({ ...item, color: themeCurveColour(item.color, palette) })), [palette]);
    const { title: viewTitleText, subtitle: viewSubtitle } = useAppSelector(viewTitle, shallowEqual);
    // Task 8 (addendum 1): a tab's title is plain text, so the view's name is written flat ("3dz²", "1b₁"); the canvas
    // title, its subtitle and Info's stand-in title are the same markup typeset, built once here.
    useDocumentTitle(`${flatSubscripts(viewTitleText)} · ${BRAND.name}`);
    const viewTitleNode = useMemo(() => withSubscripts(viewTitleText), [viewTitleText]);
    const viewSubtitleNode = useMemo(() => withSubscripts(viewSubtitle), [viewSubtitle]);
    // Task 5: Orbitals' Info is basicInfo, built from the orbital slice it reads -- rebuilt when that slice changes,
    // not on every store change.
    const orbitalSliceNow = useAppSelector(state => state.orbital);
    const basicInfoContent = useMemo(
        () => (isBasicMode ? basicInfo({ orbital: orbitalSliceNow }, level) : null),
        [isBasicMode, orbitalSliceNow, level],
    );
    // Task 6: Atoms' Info is atomInfo, built from the two slices it reads (the atom, and the orbital slice's enclosed
    // fraction, iso value and cut) -- rebuilt when either changes.
    const atomSliceNow = useAppSelector(state => state.atom);
    const atomInfoContent = useMemo(
        () => (isAtomMode ? atomInfo({ atom: atomSliceNow, orbital: orbitalSliceNow }, level) : null),
        [isAtomMode, atomSliceNow, orbitalSliceNow, level],
    );
    const shellRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(shellRef);
    const fullscreenActive = fullscreen.active;
    const toggleFullscreen = fullscreen.toggle;
    const [helpOpen, setHelpOpen] = useState(false);
    // Task 2: the visit notice, dismissed for the link it was about (fix round 1, M5: every later link says so again).
    const [visitNoticeDismissed, setVisitNoticeDismissed] = useState<number | null>(null);
    const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
    // The molecule index loads when Molecules opens -- or when someone starts a search (spec §8.3).
    const [searchWantsIndex, setSearchWantsIndex] = useState(false);
    const wantIndex = useCallback(() => setSearchWantsIndex(true), []);

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

    // Ruling P3: a chip change in BasicExplore draws itself, 150 ms after the
    // last one -- the debounce never fires on mount (useDrawOnSelection), so
    // this never double-draws with the nonce effect just above (entering the
    // mode, or a restored link, still draws exactly once). Disabled whenever
    // a combination is drawn instead: changing n/l/mₗ while one is showing
    // must not replace it (the selects used to stay frozen for the same
    // reason).
    useDrawOnSelection(
        { n, l, ml },
        isBasicMode && combination.kind === 'none',
        s => handleOrbitalParamsChange(basicOrbitalParams(s.n, s.l, s.ml, enclosedFraction))
    );

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
    // Task 7a: Bonds' Info is bondsInfo, built from the two slices it reads (the selection, and the orbital slice's
    // drawn picture, fraction and cut) and the molecule's loaded data -- its parts, as bondsData is a new object on
    // every render.
    const { scan: bondsScanNow, meta: bondsMetaNow, basis: bondsBasisNow, loading: bondsLoadingNow, error: bondsErrorNow } = bondsData;
    const bondsInfoContent = useMemo(
        () => (isBondsMode ? bondsInfo({ bonds, orbital: orbitalSliceNow }, {
            scan: bondsScanNow, meta: bondsMetaNow, basis: bondsBasisNow, loading: bondsLoadingNow, error: bondsErrorNow,
        }, level) : null),
        [isBondsMode, bonds, orbitalSliceNow, bondsScanNow, bondsMetaNow, bondsBasisNow, bondsLoadingNow, bondsErrorNow, level],
    );
    // Task 7b: Molecules' Info is moleculeInfo, built from the two slices it reads (the selection and drawn surface, the
    // orbital slice's fraction and cut), the owner's record of a computed molecule and the bond-label preference.
    // Fix round 1 (M11): the one Molecules selector, read here first and by the mode's wiring below.
    const molecule = useAppSelector(state => state.molecule);
    // The owner's record of a computed molecule, not the whole jobs slice: App re-renders for nothing else in it.
    const ownerRecordNow = useAppSelector(ownerJobRecordOf, shallowEqual);
    const moleculeLabelsNow = usePref(displayPref).moleculeLabels;
    const moleculeInfoContent = useMemo(
        () => (isMoleculeMode ? moleculeInfo({
            molecule, orbital: orbitalSliceNow, ...ownerRecordNow, moleculeLabels: moleculeLabelsNow,
            // Ruling (concern 5): a phone's tier chip is compact (its line a tooltip touch never shows), so Info says it.
            tierLineShown: isNarrow,
        }, molecule.meta, level) : null),
        [isMoleculeMode, molecule, orbitalSliceNow, ownerRecordNow, moleculeLabelsNow, isNarrow, level],
    );
    // Ruling PF5: the owner's time and cost for a computed molecule ("How this was computed") are fetched here now that
    // the pinned footer that fetched them is gone -- once, whether or not Info is on screen.
    useOwnerJobRecord();
    // Task 4: Info, always open at the top of the right panel (docked, the drawer) and the phone's Info tab.
    const infoPanel = (
        <InfoPanel content={basicInfoContent ?? atomInfoContent ?? bondsInfoContent ?? moleculeInfoContent ?? { title: viewTitleNode, plain: null }}
            topic={infoTopic.topic} onClearTopic={() => infoTopic.setTopic(null)} level={level}
            // Task 8: on a phone the caption under the header says each new selection; Info leaves that to it.
            announceSelection={!isNarrow} />
    );
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
    // the Basic Orbitals effects above ask for that mode by name. (The molecule slice is read above, for Info.)
    // Outside Molecules a search wants the index alone, not a molecule's files (ruling DB4).
    useMoleculeLoader(isMoleculeMode, { indexOnly: searchWantsIndex });
    // The owner's computed molecules join the picker as a Computed category; nobody else's picker changes.
    const isOwner = useAppSelector(selectIsOwner);
    // Ruling P12: the owner's request workspace in the viewport cell, and the preview it puts on the canvas
    // (useMoleculeView draws it). While it is open the strip and the hover caption, which describe the
    // molecule, step aside; while its preview is drawn so do the surface keys and the library line.
    // Task 2: the request workspace is the owner's at Research; below it, it is not open (the effect below closes it).
    const requestWorkspaceOpen = useRequestWorkspaceOpen() && shows('requestWorkspace');
    const requestPreviewShown = useAppSelector(state => state.jobs.request.previewAtoms !== null) && isMoleculeMode;
    const requestEntryRef = useRef<HTMLButtonElement>(null);
    // Task 2: lowering the level below Research closes an open request, and so takes its preview off the canvas --
    // a preview with no workspace beside it would be a picture nothing on screen explains.
    const requestIsOpen = useAppSelector(state => state.jobs.request.open);
    const requestsShown = shows('requestWorkspace');
    useEffect(() => {
        if (requestIsOpen && !requestsShown) dispatch(requestOpened(false));
    }, [requestIsOpen, requestsShown, dispatch]);
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
    // Final review I1: bumped on every pick so TopBar's compact (761-1099 px)
    // search popover closes and returns focus to the icon button instead of
    // staying open with focus trapped inside it.
    const [searchPickSignal, setSearchPickSignal] = useState(0);
    // Opening a result does what the existing pickers do (spec §8.3).
    const handleSearchPick = useCallback((action: SearchAction) => {
        setSearchPickSignal(count => count + 1);
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
    // mode lowers an untouched opacity (the default, DEFAULT_OPACITY --
    // ruling R20a-2 moved it from 1 to 0.7, R24-1 to 0.9) to 0.6. Only a real switch: a shared
    // link is applied before the first render, so opening one already in
    // Molecules mode is not "entering" it, and its op is the link's
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
        if (entered && surfaceStyle.opacity === DEFAULT_OPACITY) {
            loweredOpacityRef.current = true;
            dispatch(setSurfaceStyle({ opacity: 0.6 }));
        } else if (left) {
            if (loweredOpacityRef.current && surfaceStyle.opacity === 0.6) dispatch(setSurfaceStyle({ opacity: DEFAULT_OPACITY }));
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

    // The strip under the canvas (spec §8.5 bottom zone, §9.1/§9.2 "Strip",
    // §12): the Atom strip's own drill-down tiles, or -- Basic Orbitals has
    // no drill-down -- every orbital of the current n (Task 8). The two
    // never show at once (one mode is active at a time), so one collapsed
    // state serves both.
    const [stripCollapsed, setStripCollapsed] = useState(false);
    const stripItems = useMemo(
        () => (atomProfile && !atomUnbound
            ? atomStripItems({ profile: atomProfile, level: atomLevel, selectedShell: atomSelectedShell, selectedOrbital: atomSelectedOrbital, enclosedFraction, palette })
            : []),
        [atomProfile, atomUnbound, atomLevel, atomSelectedShell, atomSelectedOrbital, enclosedFraction, palette],
    );
    const basicStrip = useMemo(
        () => (isBasicMode ? basicStripItems({ selection: { n, l, ml }, enclosedFraction }) : []),
        [isBasicMode, n, l, ml, enclosedFraction],
    );
    // Task 10 (spec §9.3 "Strip"): Bonds' total density and every orbital the
    // diagram lists, or H₂⁺'s two states -- nothing until this point's basis has
    // loaded (Review Focus 5). A tile sets the view, exactly as the diagram does.
    // Keyed on meta and basis, not bondsData itself (a new object every render): new items re-centre the strip.
    const bondsMeta = bondsData.meta;
    const bondsBasis = bondsData.basis;
    const builtBondsStrip = useMemo(
        () => (isBondsMode
            ? bondsStripItems({ bonds, data: { meta: bondsMeta, basis: bondsBasis }, h2plusR: bonds.system === 'h2plus' ? bonds.R : null, enclosedFraction })
            : []),
        [isBondsMode, bonds, bondsMeta, bondsBasis, enclosedFraction],
    );
    // Ruling T10-I1: while the same molecule's next scan point loads, the strip stays up -- its last
    // tiles on their glyphs, asking for nothing -- rather than leaving and coming back: it is a bottom
    // inset zone (the camera re-fits on every change) and the phone sheet's first row. The tiles last
    // built are remembered across renders (React's "state from the previous render" pattern, so the
    // strip is never absent for even one commit); a new system starts afresh.
    const [lastBondsStrip, setLastBondsStrip] = useState<{ system: BondsSystemId; items: BondsStripItem[] } | null>(null);
    if (builtBondsStrip.length > 0 && lastBondsStrip?.items !== builtBondsStrip) setLastBondsStrip({ system: bonds.system, items: builtBondsStrip });
    const bondsPointLoading = bondsData.loading;
    const bondsStrip = useMemo(() => {
        if (builtBondsStrip.length > 0) return builtBondsStrip;
        if (isBondsMode && bondsPointLoading && lastBondsStrip?.system === bonds.system) return pendingBondsStripItems(lastBondsStrip.items, bonds.view);
        return [];
    }, [builtBondsStrip, isBondsMode, bondsPointLoading, lastBondsStrip, bonds.system, bonds.view]);
    const handleBondsStripSelect = useCallback((view: BondsView) => dispatch(setBondsView(view)), [dispatch]);
    // A new species or relativity: nothing in flight belongs to the picture any more (§12).
    useEffect(() => () => thumbnailService.cancelAll(), [atomProfile?.speciesKey, atomProfile?.Z, pictureRelativity]);
    // Likewise a new Bonds system (§12; Review Focus 5, preflight D19): its old jobs are cancelled.
    // Ruling T10-M6: only in Bonds mode -- elsewhere (a restored link) the system changing is not Bonds'
    // strip changing, and another mode's waiting tiles are left alone. Leaving Bonds also cancels, as its
    // tiles go; harmless, since React runs every cleanup before the next mode's tiles ask for anything.
    useEffect(() => (isBondsMode ? () => thumbnailService.cancelAll() : undefined), [isBondsMode, bonds.system]);
    // Ruling T16-tilekey with preflight D9: the strip's orbital tiles are phase-coloured; they get a key
    // of their own only where the column holds no phase key already -- Bonds with the density drawn.
    const bondsOrbitalTiles = !isNarrow && !stripCollapsed && bondsStrip.some(item => item.target.kind !== 'density');

    // Task 15 (spec §9.4 "Strip", §12; rulings P5, P6, P7): the molecule's views -- its structure two ways, the
    // density, the ESP map, each frontier orbital the data name, and "Orbital list" (R25-A2; "All orbitals" before).
    // The pictures are made from the molecule's own density grid, ESP grid and basis, each tile waiting on its
    // glyph until its file lands.
    const moleculeStripData = useMoleculeStripData(isMoleculeMode ? molecule.meta : null);
    const builtMoleculeStrip = useMemo(
        () => (isMoleculeMode && molecule.meta
            ? moleculeStripItems({
                meta: molecule.meta, surface: molecule.surface, representation: molecule.representation, enclosedFraction,
                densityGrid: moleculeStripData.density, espGrid: moleculeStripData.esp, espLimit: ESP_LIMIT_HARTREE, basis: moleculeStripData.basis,
            })
            : []),
        [isMoleculeMode, molecule.meta, molecule.surface, molecule.representation, enclosedFraction, moleculeStripData],
    );
    // Ruling T10-I1, for a molecule change: while the next molecule's meta loads, the strip keeps the last one's
    // tiles on their glyphs rather than leaving and coming back (a bottom inset zone: the camera would re-fit
    // twice; the phone sheet's first row would jump). Remembered across renders as Bonds' strip is.
    const [lastMoleculeStrip, setLastMoleculeStrip] = useState<MoleculeStripItem[] | null>(null);
    if (builtMoleculeStrip.length > 0 && lastMoleculeStrip !== builtMoleculeStrip) setLastMoleculeStrip(builtMoleculeStrip);
    const moleculeMetaLoading = molecule.isLoadingMeta;
    // Ruling T2-M7: structure options are Explore's, so at Basics the strip has no Space filling tile (Ball and stick,
    // the default, stays: it is the bare structure's view).
    const structureShown = shows('structure');
    const moleculeStrip = useMemo(() => {
        const items = builtMoleculeStrip.length > 0 ? builtMoleculeStrip
            : isMoleculeMode && moleculeMetaLoading && lastMoleculeStrip
                ? pendingMoleculeStripItems(lastMoleculeStrip, molecule.surface, molecule.representation)
                : [];
        return structureShown ? items
            : items.filter(item => !('representation' in item.target && item.target.representation === 'space-filling'));
    }, [builtMoleculeStrip, isMoleculeMode, moleculeMetaLoading, lastMoleculeStrip, molecule.surface, molecule.representation, structureShown]);
    const moleculeNavRef = useRef<MoleculeNavHandle>(null);
    // R25-A-I1: when the "Orbital list" tile was pressed in full screen (where Explore is not shown), the time it
    // asked; the list is revealed once full screen has gone -- the native exit lands a little later, on its own event.
    const revealAfterFullscreen = useRef<number | null>(null);
    // Spec §9.4: "Each tile sets surface / representation exactly as the View tab does" -- the same actions.
    const moleculeMeta = molecule.meta;
    const moleculeSurfaceKind = molecule.surface.kind;
    const handleMoleculeStripSelect = useCallback((target: MoleculeStripTarget) => {
        if ('openOrbitals' in target) {
            // Goes to the orbital list: on the orbital drawn, or switched to the frontier occupied orbital -- an open
            // shell's SOMO, else the HOMO (preflight D8, Task 16d) -- as the surface switch's Orbitals does. Owner
            // R25-A2: then the list is scrolled into view in Explore (on a phone, the Explore sheet the tile sits in),
            // focus goes to that orbital's row and the list is highlighted for a moment -- visible even when Orbitals
            // was already drawn.
            // R25-A-I1: the list must be on screen to be seen -- a tablet's folded Explore unfolds (the reveal waits
            // the one render that takes), and full screen, which shows no Explore at all, is left first (the user
            // asked to see the list); the reveal follows once it has gone.
            const first = moleculeMeta && (frontierOccupied(moleculeMeta.orbitals) ?? moleculeMeta.orbitals[0]);
            if (moleculeSurfaceKind !== 'mo' && first) dispatch(setSurface({ kind: 'mo', index: first.index }));
            if (isMedium && exploreCollapsed) setExploreCollapsed(false);
            if (fullscreenActive) {
                revealAfterFullscreen.current = Date.now();
                toggleFullscreen();
                return;
            }
            moleculeNavRef.current?.revealOrbitalList();
            return;
        }
        if (target.representation) dispatch(setRepresentation(target.representation));
        dispatch(setSurface(target.surface));
    }, [dispatch, moleculeMeta, moleculeSurfaceKind, isMedium, exploreCollapsed, fullscreenActive, toggleFullscreen]);
    useEffect(() => {
        const asked = revealAfterFullscreen.current;
        if (fullscreenActive || asked === null) return;
        revealAfterFullscreen.current = null;
        // A full screen that did not end at once (a refused exit) and ended later for another reason reveals nothing.
        if (Date.now() - asked < REVEAL_AFTER_FULLSCREEN_MS) moleculeNavRef.current?.revealOrbitalList();
    }, [fullscreenActive]);
    // Spec §12 and preflight D19: a new molecule cancels the old one's thumbnail jobs -- in Molecules mode only,
    // as ruling T10-M6 has it for Bonds (leaving the mode cancels too, as its tiles go).
    useEffect(() => (isMoleculeMode ? () => thumbnailService.cancelAll() : undefined), [isMoleculeMode, molecule.selectedId]);
    // Ruling T16-tilekey with preflight D9: the frontier tiles' ψ hues are keyed in the column unless an orbital's
    // own phase key is there already (the density, the ESP map or no surface drawn).
    const moleculeOrbitalTiles = !isNarrow && !stripCollapsed && !requestWorkspaceOpen
        && moleculeStrip.some(item => 'surface' in item.target && item.target.surface.kind === 'mo');
    const screenRatio = useDevicePixelRatio();
    // Everything a tile's picture depends on besides its content (ruling R20a-4): a change re-requests every
    // tile. The same key the thumbnail service files pictures under (thumb_key.ts): isNarrow is the
    // appearance's lowPower (a phone's tiles, like its main view, have no lines or halo), the size follows
    // the screen, and the opacity is the main view's as last committed (a slider drag re-renders nothing
    // until it is released). Task 16b: the same for the viewer's own Glow values -- the ones last settled
    // (settledGlowPref, which OrbitalViewer's thumbnail host draws with), so a slider drag asks for nothing
    // until it rests.
    const stripThemeKey = thumbLookKey({
        appearance: { theme: themeMode, finish: render.finish, lowPower: isNarrow, glow: settledGlow },
        opacity: thumbOpacity,
        // The bitmap's side, kept current as the window moves between screens (fix round 1 of Task 20d).
        size: thumbTileDevicePx(screenRatio),
    });
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
            // The valence shells are named as such here too (Addendum 2's
            // core/valence distinction, extended by ruling P14 to a partly
            // filled d/f below the outermost shell), so the plot and the lit
            // ring in the 3D view are saying the same thing.
            const valenceShells = valenceShellsOf(speciesConfiguration(species));
            return atomProfile.shells.map((shell, i) => ({
                label: valenceShells.has(shell.n) ? `n=${shell.n} valence` : `n=${shell.n}`,
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
    }, [atomProfile, atomLevel, atomSelectedShell, atomSelectedSubshell, atomRGrid, species]);

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

    // Basic Orbitals' inspector (spec §9.2: "Plot tabs as §9.1"): the same
    // displayPref.plotTab persists across modes (ruling P2), and the curves
    // come straight from the analytic R(r) -- there is no solved profile to
    // draw from, unlike atomTabCurves above.
    //
    // Ruling T7-dist (fix round 1): the D(r) tab is *not* one of the new
    // curve-array tabs -- it stays exactly today's single-curve plot (its
    // own title, its fill, no legend) and CSV ('P(r)', today's default
    // quantity text), unlike the shared PlotTab's "Radial distribution
    // D(r) = 4πr²ρ(r)" title/label the Atom screen's distribution tab uses.
    // So this only builds curves for R(r)/|R|²; the distribution case below
    // is the same manual 'P(r)' curve csvCurvesNow built before this task.
    const basicActivePlotTab = resolvePlotTab(BASIC_PLOT_TABS, display.plotTab);
    const basicTabCurves = useMemo(() => {
        if (!renderedParams) return [];
        const { n, l, Z, rMax } = renderedParams;
        if (basicActivePlotTab.id === 'distribution') {
            // CSV only (ruling T7-dist): the plot itself renders through RadialPlot's single-curve
            // path below, not from this curve, so `color` is unused -- kept only to satisfy RadialCurve.
            return [{ label: 'P(r)', color: CURVE_COLORS[0], points: radialProfile(n, l, Z, rMax, PLOT_SAMPLE_COUNT).map(p => ({ r: p.r, value: p.probability })) }];
        }
        return hydrogenicTabCurves(basicActivePlotTab.id, { n, l, Z: 1, rMax, colour: CURVE_COLORS[0] });
    }, [renderedParams, basicActivePlotTab]);
    // The Data card (spec §9.2, same component as §9.1): null while a
    // combination is drawn instead of one orbital (renderedParams is then
    // null too -- the two are mutually exclusive, orbitalSlice's own rule).
    // No ΔSCF energy for the analytic hydrogenic orbital, unlike the atom's
    // (ruling P2 only asks for the iso value and the enclosed fraction), so
    // `method` is never read (orbitalFacts only reads it when energy is given).
    const basicFactsNow = useMemo(() => {
        if (!renderedParams) return null;
        return orbitalFacts({ n: renderedParams.n, l: renderedParams.l, ml: renderedParams.ml }, {
            enclosedFraction, isoLevel: renderFailed ? null : isoLevel, isoPending: isLoading, energy: null, method: '',
        });
    }, [renderedParams, enclosedFraction, isoLevel, isLoading, renderFailed]);

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

    // Task 8: the phone's caption under the header names what is drawn -- or, while the canvas waits (its busy label is
    // up), the view asked for, "loading…". Typeset by the same helper as the canvas title.
    const viewCaptionText = useAppSelector(
        state => viewCaption(state, { loading: canvasBusyLabel !== null, failed: isBondsMode && Boolean(bondsData.error) }), shallowEqual);
    const phoneCaption = isNarrow && (
        <p className="phone-caption" aria-live="polite" aria-atomic="true">
            <span className="phone-caption-name">{withSubscripts(viewCaptionText.name)}</span>
            {/* A no-break space: a flex item's leading space would collapse. */}
            <span className="phone-caption-qualifier">{'\u00a0· '}{viewCaptionText.qualifier}</span>
        </p>
    );

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
    const moleculeKeysShown = isMoleculeMode && molecule.meta !== null && molecule.renderError === null && !requestPreviewShown;
    const showPhaseLegend = isMoleculeMode
        ? moleculeKeysShown && molecule.surface.kind === 'mo'
        : (isAtomMode ? atomLevel === 'orbital' : Boolean(renderedParams || renderedField))
            && !combinationLegend && !isBondsDensity;
    // Task 15 (D9): the strip's own ψ key, only where the surface's phase key is not already in the column.
    const moleculeTileKey = isMoleculeMode && moleculeOrbitalTiles && !showPhaseLegend;
    // Ruling R23c-3 (owner): the "hover or tap" hint, while nothing is picked,
    // moves into the viewport's key/caption corner -- desktop/tablet only (a
    // phone's Explore tab keeps MoleculeReadout's own in-panel wording).
    //
    // Ruling R23f-3 (root cause of the hover flicker): `.key-column` is a
    // measured camera inset (useViewInsets' RIGHT_ZONES), and this caption
    // lives inside it. Gating the caption's own *mount* on `!molecule.pick`
    // made every pick/unpick -- which happens on nearly every pointermove
    // while hovering -- add or remove a DOM node inside that zone (for a
    // density surface, with no other key shown, the whole `<KeyColumn>`
    // below used to mount/unmount with it). Each such change fires
    // useViewInsets' MutationObserver, which re-measures `.key-column`'s
    // width and calls setViewInsets -- which re-fits and re-centres the
    // camera (orbital_visualizer.ts). The model then moves under a
    // *stationary* mouse, so the very next pointermove often lands on a
    // different atom/bond (or none), toggling the pick again: a visible
    // jump on every hover transition, which reads as heavy flicker while
    // moving the mouse across the molecule.
    //
    // The fix is to stop the pick from ever changing what is mounted in that
    // zone: `moleculeCaptionZone` says whether the corner *could* show the
    // caption (exactly the old `showHoverCaption` condition, minus the pick),
    // and gates both the caption's mount and the whole `<KeyColumn>`'s, below
    // -- neither now depends on `molecule.pick`. `showHoverCaption` is kept
    // only to say whether the caption's *text* should read, toggled with a
    // CSS class (`.hidden`, visibility, not display) that does not change
    // the DOM's shape or the element's reserved size, so `.key-column`'s
    // measured rect -- and the insets derived from it -- stay exactly the
    // same whatever is picked.
    const moleculeCaptionZone = isMoleculeMode && Boolean(molecule.meta) && molecule.representation !== 'none' && !isNarrow
        && !requestWorkspaceOpen;
    const showHoverCaption = moleculeCaptionZone && !molecule.pick;

    // The drill-down's next step. On a desktop its chips continue the
    // configuration in Explore › Configuration and its energy diagram is in
    // Explore › Orbitals (spec §9.1); on a phone the whole panel is in the
    // Explore tab's navigation card.
    const subshellPanelProps = atomProfile && atomSelectedShell !== null ? {
        subshells: atomProfile.subshells, shellN: atomSelectedShell, selectedSubshell: atomSelectedSubshell,
        selectedOrbital: atomSelectedOrbital, onSelectSubshell: handleSelectSubshell, onSelectOrbital: handleSelectOrbital,
        // Ruling C9: the drawn profile's mode, not the switch's.
        relativity: atomProfile.relativity ?? 'off',
        // Task 2: a chip's orbital energy is Explore's, as the diagram is.
        showEnergies: shows('orbitalEnergies'),
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
            unbound={atomUnbound}
            pictureFailed={atomError !== null}
            level={level}
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
        // Ruling P18: the switch's own effective mode, which can be ahead of
        // the drawn picture's (pictureRelativity) while a re-solve is in flight.
        selectedRelativity: relativity,
        pictureShown: atomProfile !== null,
    };
    // The Relativity switch chooses the model, so it sits with the
    // configuration: Explore › Configuration on a desktop, the phone's
    // Explore tab (spec §9.1, §9.8).
    const relativityControl = isAtomMode && shows('relativity') && (
        <RelativityControl relativity={relativity} onRelativityChange={handleRelativityChange} />
    );
    // Task 2: under Configuration, where Charge, Excite and Relativity appear (Advanced) -- or, while one of them
    // still holds a value off its default (a link's Fe²⁺), what the picture keeps showing (ruling PF1).
    const configurationLine = isAtomMode && (
        <LevelLine level={level} ids={['charge', 'excite', 'relativity']} held={[
            !isNeutralGround(species) && {
                id: species.charge !== 0 ? 'charge' : 'excite', control: species.charge !== 0 ? 'charge' : 'excitation',
                what: speciesSymbol(species),
            },
            !relativityIsDefault && { id: 'relativity', control: 'relativity', what: RELATIVITY_SHOWN[relativity] },
        ]} />
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
        // A combination keeps today's single plot (spec §9.2 last line), not the function tabs.
        if (renderedField) return selectionPlot?.curves ?? [];
        return basicTabCurves;
    }, [isAtomMode, isBasicMode, atomCurves, activePlotTab, atomTabCurves, renderedField, selectionPlot, basicTabCurves]);
    const handleExport = useCallback(async (kind: ExportKind, options: ExportOptions) => {
        // The file's "view:" link names the angle on screen, as Share's does.
        const state = stateNow();
        const result = await runExport(kind, {
            state, shareUrl: shareUrlFor(encodeStateOf(state)), csvCurves: csvCurvesNow(),
            handle: exportHandleRef.current, phaseLegend: showPhaseLegend, combinationLegend,
            phaseColours: [phase.positive, phase.negative],
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
            // A combination keeps today's default quantity text (spec §9.2 last line): there is no single tab on screen for it.
            csvQuantity: isAtomMode
                ? activePlotTab?.csvQuantity ?? undefined
                : (isBasicMode && !renderedField ? basicActivePlotTab.csvQuantity ?? undefined : undefined),
            ...options,
        });
        downloadBlob(result.blob, result.filename);
    }, [
        stateNow, csvCurvesNow, showPhaseLegend, combinationLegend, phase,
        bondsData.scan, bondsData.meta, bondsData.loading, bondsData.error, h2plusCurve.curve,
        isAtomMode, activePlotTab, isBasicMode, renderedField, basicActivePlotTab,
    ]);
    const stlSolids = useCallback(() => exportHandleRef.current?.surfaceCount() ?? 0, []);
    // Ruling DC6 / R22a: the glTF item names the theme whose colours it keeps.
    const exportLook = useMemo(() => ({ theme: themeMode }), [themeMode]);
    // Memoised: Controls is React.memo, and a fresh element every render would defeat it.
    const shareExportBar = useMemo(
        () => (
            <ShareExportBar
                onShare={handleShare} onExport={handleExport} availability={availability} stlSolids={stlSolids}
                items={exportItemsFor(atomMode, exportLook)} level={level}
            />
        ),
        [handleShare, handleExport, availability, stlSolids, atomMode, exportLook, level]
    );
    const shareExportToolbar = useMemo(
        () => (
            <ShareExportBar variant="toolbar" onShare={handleShare} onExport={handleExport} availability={availability}
                stlSolids={stlSolids} items={exportItemsFor(atomMode, exportLook)} level={level} />
        ),
        [handleShare, handleExport, availability, stlSolids, atomMode, exportLook, level]
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
        // Owner R25-C (ruling R25-C-present): a drawn surface hidden inside the structure's balls is said so.
        insideBallNote: insideBallNoteFor(molecule),
        onHideStructure: () => dispatch(setRepresentation('none')),
        // Task 2: below Advanced the list keeps HOMO−3…LUMO+3 and says where the rest are.
        allOrbitals: shows('allOrbitals'),
        // Ruling T2-energies: and below Explore it lists them without their energies.
        showEnergies: shows('orbitalEnergies'),
    };
    // Task 12 (ruling P1): Molecules' Explore opens with the header tile (name, formula, "Change ▾" -- a
    // popover on a desktop or tablet, the full-screen picker on a phone). Owner R25-A3: the quick pick that sat
    // under it is gone; its thumbnails are in the picker's rows (MoleculePicker), superseding T12-fit and D7.
    const moleculeHeader = (compact: boolean) => (
        <MoleculeHeader entries={moleculeEntries} indexError={molecule.indexError} meta={molecule.meta}
            selectedId={molecule.selectedId} isLoading={molecule.isLoadingMeta} onSelectMolecule={moleculeNavProps.onSelectMolecule}
            compact={compact} onOpenPicker={moleculeNavProps.onOpenPicker} />
    );
    // Ruling P10: the molecule's Properties, from the facts its meta carries. Ruling T12-I1: present while a
    // molecule is chosen -- "Loading…" until its meta lands -- so a molecule change never folds the open section to
    // Display and back; one that failed to load says so (its alert over the view gives the reason).
    const moleculeProperties = molecule.selectedId !== null && (molecule.meta || molecule.isLoadingMeta
        ? (
            <>
                {/* Ruling P12: the canvas shows the request's preview meanwhile; these facts are still the molecule's. */}
                {requestPreviewShown && molecule.meta && (
                    <p className="molecule-properties-status">The view shows the request’s preview; these are {molecule.meta.name}’s properties.</p>
                )}
                <MoleculePropertiesCard meta={molecule.meta} />
            </>
        )
        : <p className="molecule-properties-status">This molecule did not load.</p>);
    // The structure segments and the dipole switch belong with the view settings
    // (Controls' children slot). Task 7b: the dipole's value, with ozone's caveat
    // beside it (ruling T7-O3), is Info's fact (moleculeInfo) and the Properties row's.
    const moleculeOptions = isMoleculeMode && molecule.meta && (
        <MoleculeViewOptions representation={molecule.representation} onRepresentationChange={r => dispatch(setRepresentation(r))}
            spaceFillingUnavailable={spaceFillingUnavailableReason(molecule.meta.atoms)}
            showDipole={molecule.showDipole} onShowDipole={on => dispatch(setShowDipole(on))} level={level} />
    );
    // Task 7b: what the enclosed fraction produced (ruling D22's helper under the select) is Info's iso value now
    // (moleculeInfo), with the same rule: only once the surface asked for has landed.

    // One Controls, drawn whole or in halves (ruling R20b): Basic Orbitals'
    // selection goes to Explore and its view half to the inspector; every
    // other place takes it whole. The halves share every prop and handler.
    const renderControls = (part: 'all' | 'selection' | 'view') => (
        <Controls
            part={part}
            mode={atomMode}
            atomLevel={atomLevel}
            atomZ={atomZ}
            onAtomElementChange={handleAtomElementChange}
            showElementPicker={false}
            initialN={n}
            initialL={l}
            initialMl={ml}
            initialEnclosedFraction={enclosedFraction}
            onEnclosedFractionChange={handleEnclosedFractionChange}
            combination={combination}
            onUpdateOrbital={handleOrbitalParamsChange}
            surfaceStyle={surfaceStyle}
            onSurfaceStyleChange={handleSurfaceStyleChange}
            onOpacityPreview={handleOpacityPreview}
            isBusy={isAtomMode ? showAtomBusy : showBusy}
            fractionNote={isBondsDensity ? FIXED_RHO_NOTE
                : isMoleculeMode && molecule.surface.kind === 'esp' ? ESP_SURFACE_NOTE
                : isMoleculeMode && molecule.surface.kind === 'none' ? NO_SURFACE_NOTE : undefined}
            noSurface={isMoleculeMode && molecule.surface.kind === 'none'}
            level={level}
        >
            {/* Molecules' structure and dipole options. Ruling R25-finish: the Glow | Solid finish Atoms passed here
                is Controls' own now, in every mode. */}
            {moleculeOptions || null}
        </Controls>
    );
    const controls = renderControls('all');
    // Task 16b (owner R24-adv): Glow's own tuning, folded, at the bottom of every Display section and the
    // phone's view tab; it shows itself only under the Glow finish, while something drawn can glow -- not
    // Atoms' whole-atom view (a shell picture with ring-glyph tiles). Owner R25-B1: nor a wireframe went with it.
    // Task 16d item 12: nor while Molecules draws no surface (surface None, or a request preview) -- sliders
    // whose only effect is a tile 300 ms later would read as broken.
    const moleculeNoSurface = isMoleculeMode && (molecule.surface.kind === 'none' || requestPreviewShown);
    const drawsGlow = !(isAtomMode && atomLevel === 'atom') && !moleculeNoSurface;
    // Task 16d item 13: the edge whiteness acts only on a phase-less surface (vQlPhase 0): a molecule's density
    // (never its ESP map, ruling T15-b), the Bonds total density, a shell's composition lobes, a combination overlay.
    const phaselessDrawn = (moleculeKeysShown && molecule.surface.kind === 'density') || isBondsDensity
        || (isAtomMode && atomLevel === 'shell') || combinationLegend !== null;
    // Task 2: Advanced's, as the enclosed fraction and the finish inside Controls are.
    const advancedAppearance = shows('advancedAppearance') && (
        <AdvancedAppearance drawsGlow={drawsGlow} lowPower={isNarrow} phaselessDrawn={phaselessDrawn}
            extrasSuppressed={glowExtrasSuppressed} />
    );
    // Task 2: the one line at the foot of every Display section -- what this mode's view settings and its other
    // sections (Plot and data, Properties) still hide, or a hidden one's value the picture keeps (ruling PF1).
    // Only what this view would show: the finish is a mesh's (isOrbitalView, not a shell view's), its tuning Glow's.
    const displayIds: ControlId[] = isMoleculeMode ? ['structure', 'bondLabels', 'dipole', 'properties'] : ['plot'];
    if (isAtomMode) displayIds.push('axes');
    displayIds.push('enclosed');
    if (isOrbitalView) displayIds.push('surfaceStyle');
    if (render.finish === 'glow' && drawsGlow) displayIds.push('advancedAppearance');
    const displayHeld: (HeldValue | false)[] = [
        isMoleculeMode && molecule.representation !== 'ball-and-stick' && {
            id: 'structure', control: 'structure',
            what: molecule.representation === 'none' ? 'the surface without its structure' : 'the space-filling structure',
        },
        isMoleculeMode && display.moleculeLabels && { id: 'bondLabels', control: 'bond-label', what: 'bond lengths and angles' },
        // The arrow is on by default (moleculeSlice), so the value held is its absence.
        isMoleculeMode && !molecule.showDipole && { id: 'dipole', control: 'dipole', what: 'the molecule without its dipole arrow' },
        isAtomMode && !display.showAxes && { id: 'axes', control: 'axes', what: 'the view without axes' },
        enclosedFraction !== DEFAULT_ENCLOSED_FRACTION && {
            id: 'enclosed', control: 'enclosed-fraction', what: `a ${Math.round(enclosedFraction * 100)} % contour`,
        },
        isOrbitalView && render.finish !== DEFAULT_RENDER.finish && { id: 'surfaceStyle', control: 'surface-style', what: 'the solid surface' },
    ];
    const displayLine = <LevelLine level={level} ids={displayIds} held={displayHeld} />;
    const displayControls = <>{controls}{advancedAppearance}{displayLine}</>;

    // Bonds mode's navigation (layout contract §3.8): the desktop's left
    // column, the phone's Explore tab. The curve is not in it -- it goes
    // where every mode's plot goes (renderRadialPlot); the frontier line,
    // caveats and methods list are the inspector's (Task 9, bondsInspector below).
    const bondsExplore = (
        <BondsExplore
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

    // Basic Orbitals' Explore content (spec §9.2, ruling P3): the header
    // tile, the n / subshell / orbital chips that draw on selection, and the
    // Combination picker -- replaces the old n/l/mₗ selects and Update
    // Orbital button. One element, reused on the desktop (inside the shared
    // ExplorePanel below) and on the phone (the sheet's Explore tab; the view
    // half is its View tab, Task 4), exactly as `bondsExplore` and `controls` are.
    const basicExplore = (
        <BasicExplore
            selection={{ n, l, ml }}
            onChange={handleBasicSelectionChange}
            onPick={handleBasicPick}
            combination={combination}
            onCombinationChange={handleCombinationChange}
            level={level}
        />
    );

    const renderRadialPlot = (width: number, collapsible: boolean) => {
        // Ruling R23f: the orbital list that used to stand here (ruling D23,
        // "where the other modes plot") moved into the Explore panel, beside
        // the Density | Electrostatic potential | Orbitals switch
        // (MoleculeNav) -- the left panel chooses WHAT you look at, this
        // "plot slot" is part of the right panel's HOW/data, and the list is
        // a choice, not a plot. Molecules has nothing left for this slot, on
        // a desktop (moleculeSections has no plot) or a phone (there is no Plot tab for it
        // any more, below).
        if (isMoleculeMode) return null;
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
            if (!renderedParams) return null;
            // Ruling T7-dist: the D(r) tab is unchanged from before this task -- RadialPlot's own
            // single-curve path (its title, its fill, no legend), not the shared tabs' curve-array one.
            if (basicActivePlotTab.id === 'distribution') {
                return (
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
            // The R(r) / |R|² tabs (spec §9.2: "Plot tabs as §9.1") -- the same curve-array
            // rendering the Atom screen's own orbital-level wave/density tabs already use.
            return (
                <RadialPlot
                    n={renderedParams.n}
                    l={renderedParams.l}
                    Z={renderedParams.Z}
                    rMax={renderedParams.rMax}
                    width={width}
                    collapsible={collapsible}
                    curves={themed(basicTabCurves)}
                    title={basicActivePlotTab.title}
                    signed={basicActivePlotTab.signed}
                    ariaLabel={plotAriaLabel(basicActivePlotTab)}
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
                signed={activePlotTab.signed}
                ariaLabel={plotAriaLabel(activePlotTab)}
                comparisonNote={distributionTab ? comparisonNote : null}
                peaks={distributionTab ? Array.from(atomProfile.shellPeaks) : undefined}
                hoverRadius={atomHoverRadius}
                onHoverRadius={handleAtomHoverRadius}
            />
        );
    };

    // The Atom screen's Display settings head its inspector, docked and in
    // the drawer (ruling R20b-atoms); on a phone the sheet's View tab holds
    // them, so the stacked inspector has none.
    const atomDisplay = <>{controls}{shows('axes') && <AxesSwitch />}{advancedAppearance}{displayLine}</>;
    // Basic Orbitals' Display: Controls' view half (ruling R20b), headed the same way.
    const basicDisplay = <>{renderControls('view')}{advancedAppearance}{displayLine}</>;
    // Ruling R24-3: before there is anything to plot, the inspector keeps its
    // titled sections -- Display, and an empty "Plot and data" -- so its
    // headers do not move (nor the open one change) when the plot arrives.
    // Task 2: no Plot and data below Explore, waiting or not.
    const waitingSections = (variant: 'docked' | 'drawer' | 'stacked', display: React.ReactNode): InspectorSection[] => [
        ...(variant === 'stacked' ? [] : [{ key: 'display', title: 'Display', content: display }]),
        ...(shows('plot') ? [{ key: 'plot', title: 'Plot and data', content: null }] : []),
    ];

    // The Atom screen's inspector (spec §9.1): docked on a desktop, a drawer
    // at medium width, stacked in the phone's Plot tab (ruling R7). Ruling
    // DX1: before a profile it is the plain inspector, so its column and the
    // drawer's bar hold their place while the atom solves (§8.6) -- with the
    // Display settings in it, which work before a profile as they did in Explore.
    const atomInspector = (variant: 'docked' | 'drawer' | 'stacked') => (activePlotTab ? (
        <AtomInspector variant={variant} display={variant === 'stacked' ? undefined : atomDisplay}
            info={variant === 'stacked' ? undefined : infoPanel}
            open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)}
            plotTabs={atomPlotTabs} plotTab={activePlotTab} onPlotTab={handlePlotTab}
            plot={renderRadialPlot(variant === 'stacked' ? PHONE_PLOT_WIDTH : PLOT_WIDTH, false)}
            facts={atomFactsNow} csvReason={availability.csv} onExportCsv={() => { void handleExport('csv', {}); }} showPlot={shows('plot')} />
    ) : (
        <Inspector variant={variant} sections={waitingSections(variant, atomDisplay)} info={variant === 'stacked' ? undefined : infoPanel}
            open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)} />
    ));

    // Basic Orbitals' inspector (spec §9.2: "Plot tabs as §9.1"). Mirrors
    // atomInspector's own DX1 fallback: before the first debounced render
    // lands (both renderedParams and renderedField null, just after
    // entering the mode) it is the plain inspector, holding the column and
    // drawer bar in place, with the view controls still in it.
    const basicInspector = (variant: 'docked' | 'drawer' | 'stacked') => ((renderedParams || renderedField) ? (
        <BasicInspector variant={variant} display={variant === 'stacked' ? undefined : basicDisplay}
            info={variant === 'stacked' ? undefined : infoPanel}
            open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)}
            plotTabs={BASIC_PLOT_TABS} plotTab={basicActivePlotTab} onPlotTab={handlePlotTab}
            combination={Boolean(renderedField)}
            plot={renderRadialPlot(variant === 'stacked' ? PHONE_PLOT_WIDTH : PLOT_WIDTH, false)}
            facts={basicFactsNow} csvReason={availability.csv} onExportCsv={() => { void handleExport('csv', {}); }} showPlot={shows('plot')} />
    ) : (
        <Inspector variant={variant} sections={waitingSections(variant, basicDisplay)} info={variant === 'stacked' ? undefined : infoPanel}
            open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)} />
    ));

    // Bonds mode's inspector (spec §9.3, Phase 6G-2 Task 9): the same
    // Display-above-Plot-and-Data composition as Atom's and Basic Orbitals',
    // with `controls` (the view settings Bonds and Molecules share,
    // `moleculeSections` below) heading it, exactly as it headed the plain
    // Inspector this replaces. Plot is `renderRadialPlot` (BondsCurvePlot),
    // unchanged; Data is the frontier line, caveats and methods list that
    // used to sit under the MO diagram in BondsPanel (ruling P19).
    const bondsInspector = (variant: 'docked' | 'drawer' | 'stacked') => (
        <BondsInspector variant={variant} display={variant === 'stacked' ? undefined : displayControls}
            info={variant === 'stacked' ? undefined : infoPanel}
            open={viewPanelOpen} onOpenChange={open => setViewPanelOpen(() => open)}
            bonds={bonds} data={bondsData}
            plot={renderRadialPlot(variant === 'stacked' ? PHONE_PLOT_WIDTH : PLOT_WIDTH, false)} showPlot={shows('plot')} />
    );

    // Ruling R22c (owner review 2026-10-14): the hover/pick readout moves off
    // the canvas into a stable Explore-panel section -- desktop's panel and
    // the phone's Explore tab both scroll on their own (never the canvas),
    // so a long pick no longer traps the pointer under an unscrollable
    // overlay. Gated exactly as `.molecule-legend-stack` gated
    // `MoleculeReadout` before: a molecule loaded, with its structure shown
    // (nothing to pick with no structure drawn; space filling's spheres pick, ruling P8).
    const moleculeSelectionSection = molecule.meta && molecule.representation !== 'none' && (
        <div className="molecule-selection">
            <Typography variant="subtitle2" className="molecule-selection-heading">Selection</Typography>
            <MoleculeReadout atoms={molecule.meta.atoms} pick={molecule.pick}
                touch={isNarrow} spaceFilling={molecule.representation === 'space-filling'} />
        </div>
    );

    // A phone has no viewport toolbar (ruling R6): Reset view, Share and Export end the View tab, as before.
    const phoneViewActions = (
        <div className="view-actions">
            <Button id="reset-view" variant="outlined" onClick={handleResetView}>Reset view</Button>
            {shareExportBar}
        </div>
    );

    // Molecules' inspector (the other modes have their own: atomInspector, basicInspector, bondsInspector):
    // the view settings under the titled Display section (rulings T20b-display-header, R24-3), then the
    // molecule's Properties (Task 12, ruling P10) while one is chosen -- the content section, open by default.
    // The phone's View tab stacks the Properties section (below).
    const moleculeSections: InspectorSection[] = [
        { key: 'display', title: 'Display', content: displayControls },
        // Task 2: Properties from Explore.
        ...(moleculeProperties && shows('properties') ? [{ key: 'properties', title: 'Properties', content: moleculeProperties }] : []),
    ];

    // The phone sheet's tabs, one job each, in every mode Explore · Info · View · Plot (Molecules: Explore · Info ·
    // View) -- Task 4. Info is the desktop's Info, the same content for the same state and level (Review Focus 5).
    const phoneInfoTab = { key: 'info', label: 'Info', content: infoPanel };
    const phoneTabs = isMoleculeMode
        ? [
            {
                key: 'explore', label: 'Explore',
                // Ruling R22c: the readout heads the tab, ahead of the
                // navigator. Ruling R23f: the navigator's own switch now
                // carries the orbital list (MoleculeNav). There is no Plot
                // tab any more (below): it had nothing left once the list
                // moved here, its one-time reason for existing (ruling D23).
                // Task 12: the compact header tile leads it.
                content: (
                    <>
                        {/* Task 15 (spec §9.8): the strip is the Explore tab's first row, as in every other mode. */}
                        {moleculeStrip.length > 0 && (
                            <ThumbnailStrip items={moleculeStrip} label="views of this molecule" rGrid={[]} themeKey={stripThemeKey}
                                onSelect={handleMoleculeStripSelect} variant="sheet" />
                        )}
                        {moleculeHeader(true)}
                        {moleculeSelectionSection}
                        <MoleculeNav {...moleculeNavProps} variant="body" ref={moleculeNavRef} />
                        {requestsShown ? <MoleculeJobsSection /> : isOwner && <LevelLine level={level} ids={['requestWorkspace']} />}
                    </>
                ),
            },
            phoneInfoTab,
            // Task 12: the view settings, then the inspector's Properties section stacked (as ruling R7 stacks the other modes').
            {
                key: 'view', label: 'View', content: (
                    <>
                        {displayControls}
                        {/* Review M3: the inspector's own stacked section, as the other modes' sheets use. Display
                            is this tab's controls already, so only Properties is stacked here. */}
                        <Inspector variant="stacked" sections={moleculeSections.filter(section => section.key === 'properties')} />
                        {phoneViewActions}
                    </>
                ),
            },
        ]
        : isBondsMode
        ? [
            // Task 10 (spec §9.8): the strip is the Explore tab's first row, as in Atoms and Orbitals.
            {
                key: 'explore', label: 'Explore', content: (
                    <>
                        {bondsStrip.length > 0 && (
                            <ThumbnailStrip items={bondsStrip} label="orbitals in view" rGrid={[]} themeKey={stripThemeKey}
                                onSelect={handleBondsStripSelect} variant="sheet" />
                        )}
                        {bondsExplore}
                    </>
                ),
            },
            phoneInfoTab,
            { key: 'view', label: 'View', content: <>{displayControls}{phoneViewActions}</> },
            // Ruling R7: the inspector stacked, Plot then Data, with no inner Plot/Data tabs. Task 2: from Explore.
            ...(shows('plot') ? [{ key: 'plot', label: 'Plot', content: bondsInspector('stacked') }] : []),
        ]
        : isAtomMode
        ? [
            {
                key: 'explore',
                label: 'Explore',
                // Spec §9.8: Explore holds the left panel's tabs as sections, the
                // Relativity switch included, with the orbital strip as its first row.
                content: (
                    <>
                        {stripItems.length > 0 && (
                            <ThumbnailStrip items={stripItems} label="orbitals in view" rGrid={atomRGrid} themeKey={stripThemeKey}
                                onSelect={handleLevelNavigate} variant="sheet" />
                        )}
                        <LevelNav {...levelNavProps} variant="body">{subshellPanel}</LevelNav>
                        {relativityControl}
                        {configurationLine}
                    </>
                ),
            },
            phoneInfoTab,
            { key: 'view', label: 'View', content: <>{atomDisplay}{phoneViewActions}</> },
            // Ruling R7: the inspector stacked, Plot then Data, with no inner Plot/Data tabs. Task 2: from Explore.
            ...(shows('plot') ? [{ key: 'plot', label: 'Plot', content: atomInspector('stacked') }] : []),
        ]
        : [
            // Ruling P3: BasicExplore (the tile, the chips, the Combination picker) in Explore and Controls' view half
            // in View -- the same split as the desktop's Explore panel and inspector. Task 4 split the one "Orbital &
            // view" tab so every mode's sheet reads Explore · Info · View · Plot. Task 8: the strip is Explore's first
            // row, as the Atom strip is (spec §9.8).
            {
                key: 'explore', label: 'Explore', content: (
                    <>
                        {basicStrip.length > 0 && (
                            <ThumbnailStrip items={basicStrip} label="orbitals in view" rGrid={[]} themeKey={stripThemeKey}
                                onSelect={handleBasicPick} variant="sheet" />
                        )}
                        {basicExplore}
                    </>
                ),
            },
            phoneInfoTab,
            { key: 'view', label: 'View', content: <>{basicDisplay}{phoneViewActions}</> },
            // Ruling R7: the inspector stacked, Plot then Data, with no inner Plot/Data tabs. Task 2: from Explore.
            ...(shows('plot') ? [{ key: 'plot', label: 'Plot', content: basicInspector('stacked') }] : []),
        ];

    // A molecule that did not load, or a surface that did not draw (spec
    // §3.5). Said once -- not as a Snackbar too (Bonds' ruling C9) -- and a
    // failed surface is cleared rather than left standing beside its own
    // error. On a phone `.molecule-error` sits under the header rather than
    // at `.atom-error`'s top: 80px, which the phone's own header covers
    // (fix round 1, review Minor 3; ruling R22c: now self-positioned, the
    // legend stack it used to ride in having been retired).
    const moleculeAlert = isMoleculeMode && (molecule.error || molecule.renderError) ? (
        <Alert severity="error" className={isNarrow && molecule.meta ? 'molecule-error' : 'atom-error'}>
            {molecule.error ?? `Could not draw ${SURFACE_NAME[molecule.surface.kind]}: ${molecule.renderError}`}
        </Alert>
    ) : null;

    // The Atom screen's Explore panel (spec §9.1): the element tile and the
    // breadcrumb, then Configuration (the drill-down, Charge/Excite and the
    // Relativity switch) and Orbitals (the whole atom's energies; About is Info's, Task 6).
    // The view controls are the inspector's Display section (ruling R20b-atoms).
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
                    {configurationLine}
                </>
            )}
            orbitals={(
                <>
                    {/* Task 2: the energy diagram and table are Explore's; at Basics one line says so. */}
                    {atomProfile && shows('orbitalEnergies') && (
                        // At the whole atom no shell is open, so none is picked out (ruling T10-wholeatom).
                        <SubshellPanel subshells={atomProfile.subshells} shellN={atomSelectedShell}
                            selectedSubshell={atomSelectedSubshell} selectedOrbital={atomSelectedOrbital}
                            onSelectSubshell={handleSelectSubshell} onSelectOrbital={handleSelectOrbital}
                            relativity={atomProfile.relativity ?? 'off'} part="diagram" palette={palette} />
                    )}
                    {atomProfile && shows('orbitalEnergies') && <OrbitalEnergyList subshells={atomProfile.subshells} relativity={pictureRelativity} />}
                    <LevelLine level={level} ids={['orbitalEnergies']} />
                    {/* Task 6: the method and "About this model" are Info's ("How this was computed", atomInfo). */}
                </>
            )}
            onCollapse={isMedium ? () => setExploreCollapsed(true) : undefined}
        />
    );

    const exploreContent = isBondsMode ? bondsExplore
        // Ruling R22c: the readout's section sits under the navigator (the
        // brief's own placement). Ruling PF5 (Task 7b) supersedes R23f-2:
        // "How this was computed" is Info's, at the top of the right panel
        // (folded below Research, open at Research), no longer a footer
        // pinned under this column.
        : isMoleculeMode ? (
            <div className="molecule-explore">
                <div className="molecule-explore-scroll">
                    {/* Task 12 (ruling P1): the header tile heads the column. */}
                    {moleculeHeader(false)}
                    <MoleculeNav {...moleculeNavProps} ref={moleculeNavRef} />
                    {moleculeSelectionSection}
                    {/* Ruling P12: on a desktop or tablet the request opens as a workspace in the viewport cell. */}
                    {/* Task 2: the owner's request is Research's; below it, one line says so (to the owner only). */}
                    {requestsShown ? <MoleculeJobsSection variant="entry" entryRef={requestEntryRef} />
                        : isOwner && <LevelLine level={level} ids={['requestWorkspace']} />}
                </div>
            </div>
        )
        // Basic Orbitals: its header tile and chips (ruling P3) -- BasicExplore.
        : basicExplore;

    const session = useAppSelector(state => state.jobs.session);
    const avatar = (
        <AvatarMenu
            session={session}
            isOwner={isOwner}
            dev={BUILD_ENV.dev}
            ownerBar={<ConnectedOwnerBar page="/" showError={false} />}
            onSignIn={() => signInHere('/', text => dispatch(sessionFailed(text)))}
            extra={isNarrow ? (
                <div className="avatar-extra">
                    {/* Task 2: a phone's top bar has no room for the switch; it heads this menu. */}
                    <LevelControl variant="menu" />
                    <div className="avatar-extra-row"><ThemeSwitch /><span>Theme</span></div>
                    <Button size="small" startIcon={<HelpOutline fontSize="small" />} onClick={() => setHelpOpen(true)}>Help</Button>
                </div>
            ) : undefined}
        />
    );
    const urlMode = (viewMode: ViewMode) => ({ atom: 'atom', hydrogenic: 'basic', bonds: 'bonds', molecule: 'molecule' })[viewMode];
    // Ruling R23a (round 23): the rail is gone and the Explore/Molecules
    // "area tab" concept with it -- the top bar's tabs are the four modes
    // themselves, in MODE_ITEMS' order (Orbitals | Atoms | Bonds |
    // Molecules), each routing through the same guarded selectMode the old
    // rail did. mode=basic, the rest of the URL and every share link are
    // untouched -- only "Basic Orbitals"' visible name changes.
    const topBarTabs: TopBarTab[] = MODE_ITEMS.map(({ mode: itemMode, oldName }) => ({
        key: itemMode,
        label: MODE_LABEL[itemMode],
        href: `/#mode=${urlMode(itemMode)}`,
        current: atomMode === itemMode,
        ariaLabel: `${MODE_LABEL[itemMode]} (${oldName})`,
        onSelect: () => selectMode(itemMode),
    }));
    const topBar = (
        <TopBar
            brand={BRAND}
            mode={themeMode}
            tabs={topBarTabs}
            search={<GlobalSearch sources={searchSources} onPick={handleSearchPick} onWantIndex={wantIndex} />}
            levelControl={<LevelControl variant={compactLevel ? 'compact' : 'segmented'} />}
            avatar={avatar}
            onHelp={() => setHelpOpen(true)}
            sessionNote={session.expired && !session.signedIn ? SESSION_ENDED : null}
            compactSearch={compactTopBar}
            searchPickSignal={searchPickSignal}
        />
    );
    const phoneTopBar = (compact: boolean) => (
        <PhoneTopBar brand={BRAND} themeMode={themeMode} mode={atomMode} onModeChange={selectMode}
            onOpenSearch={() => setPhoneSearchOpen(true)} avatar={avatar} compact={compact} />
    );
    // A phone held upright: top bar, then the header line under it. Sideways: one merged 44 px line (spec §7).
    // Task 8: every mode's header ends with the caption naming what is drawn -- under the element or molecule nav, or
    // on its own where the header had nothing else (Orbitals; Bonds, whose "N₂ · R" line it replaces).
    // Fix round 1 (I2): PhoneHeader measures itself, so the overlays under it move down by its real height.
    const phoneChrome = isNarrow && (
        <>
            {!isPhoneLandscape && phoneTopBar(false)}
            {isAtomMode && (
                <PhoneHeader>
                    {isPhoneLandscape && phoneTopBar(true)}
                    <LevelNav {...levelNavProps} variant="header" />
                    {phoneCaption}
                </PhoneHeader>
            )}
            {isMoleculeMode && (
                <PhoneHeader>
                    {isPhoneLandscape && phoneTopBar(true)}
                    {/* Ruling R22c: a phone has no `TitleBlock` to carry the tier
                        line, so it rides in the phone's own header row instead. */}
                    <div className="molecule-phone-header-row">
                        <MoleculeNav {...moleculeNavProps} variant="header" />
                        {molecule.meta && <TierBadge meta={molecule.meta} compact />}
                    </div>
                    {phoneCaption}
                </PhoneHeader>
            )}
            {(isBondsMode || isBasicMode) && (
                <PhoneHeader>
                    {isPhoneLandscape && phoneTopBar(true)}
                    {phoneCaption}
                </PhoneHeader>
            )}
            <PhoneSheet tabs={phoneTabs} active={phoneTab} onChange={setPhoneTab} />
        </>
    );

    // Task 2 (Review Focus 1): a link that needed a higher level raised it for this visit only, and says so -- with
    // the way to keep it. Its own row under the top bar (AppShell), so it covers neither panels nor title.
    // Fix round 1 (M5): role="status" -- it informs, it does not interrupt (MUI's Alert defaults to an assertive alert).
    const visitNotice = levelRaised && visitNoticeDismissed !== visitId && (
        <Alert severity="info" role="status" className="level-visit-notice"
            action={(
                <>
                    <Button color="inherit" size="small" onClick={() => setLevel(level)}>Keep {LEVEL_LABEL[level]}</Button>
                    <IconButton color="inherit" size="small" aria-label="Dismiss" onClick={() => setVisitNoticeDismissed(visitId)}>
                        <Close fontSize="small" />
                    </IconButton>
                </>
            )}>
            Opened at {LEVEL_LABEL[level]} for this link — your level stays {LEVEL_LABEL[storedLevel]}.
        </Alert>
    );

    const viewport = (
        <main
            id="canvas-container"
            className={`viewport-cell${canvasBusyLabel ? ' busy' : ''}${requestWorkspaceOpen ? ' request-open' : ''}`}
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
            {/* Ruling P12: ahead of the title block and toolbar, so the Tab order runs entry → workspace → toolbar. */}
            {isMoleculeMode && requestsShown && <RequestWorkspace returnFocusRef={requestEntryRef} />}
            {canvasBusyLabel && (
                // Task 8: on a phone the caption under the header announces the wait ("… · loading…"), so this label is
                // for the eye only there -- a reader hears the change once.
                <div className="canvas-busy" {...(isNarrow ? {} : { role: 'status', 'aria-live': 'polite' })}>
                    <CircularProgress size={22} thickness={5} color="inherit" />
                    <span>{withSubscripts(canvasBusyLabel)}</span>
                </div>
            )}
            {/* Ruling T17-hint: not while an anion is unbound -- nothing is drawn and no shell can be opened, so the
                hint would be untrue (§3.5) and would sit on the unbound note. Hidden, not dismissed. */}
            {isAtomMode && !hintDismissed && !atomUnbound && (
                <FirstViewHint onDismiss={dismissHint} />
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
            {!isNarrow && (
                <TitleBlock title={viewTitleNode} subtitle={viewSubtitleNode}>
                    {/* Ruling R22c: the library/tier line moves here from the canvas
                        (was `.molecule-legend-stack`'s `TierBadge`) -- same component,
                        same wording, just under the molecule's own description now. */}
                    {isMoleculeMode && molecule.meta && !requestPreviewShown && <TierBadge meta={molecule.meta} />}
                </TitleBlock>
            )}
            {!isNarrow && (
                <ViewportToolbar onResetView={handleResetView} shareExport={shareExportToolbar}
                    fullscreen={fullscreen.active} onToggleFullscreen={fullscreen.toggle} />
            )}
            {isAtomMode && atomProfile && !atomUnbound && (
                <KeyColumn compact={isNarrow}>
                    <AtomKeys level={atomLevel} phase={phase}
                        orbitalTiles={!isNarrow && !stripCollapsed && stripItems.some(item => item.thumb.kind === 'orbital')}
                        shellItems={themed(atomCurves).map(curve => ({ label: curve.label, colour: curve.color, spoken: curve.spokenLabel }))} />
                </KeyColumn>
            )}
            {isAtomMode && !isNarrow && stripItems.length > 0 && (
                <ThumbnailStrip items={stripItems} label="orbitals in view" rGrid={atomRGrid} themeKey={stripThemeKey}
                    onSelect={handleLevelNavigate} variant="overlay" collapsed={stripCollapsed} onCollapsedChange={setStripCollapsed} />
            )}
            {/* Task 8: Basic Orbitals' strip -- every orbital of the current n, grouped by
                subshell. No back tile and no rings (there is no drill-down here), so there
                is no r grid to pass. Ruling D9: the strip's tiles are phase-coloured, but the
                surface itself always is too, so the key column's plain PhaseKey below already
                covers them -- unlike Atoms, no second "Orbital tiles" heading here. */}
            {isBasicMode && !isNarrow && basicStrip.length > 0 && (
                <ThumbnailStrip items={basicStrip} label="orbitals in view" rGrid={[]} themeKey={stripThemeKey}
                    onSelect={handleBasicPick} variant="overlay" collapsed={stripCollapsed} onCollapsedChange={setStripCollapsed} />
            )}
            {/* Task 10: Bonds' strip -- the total density and every orbital, or H₂⁺'s two states. */}
            {isBondsMode && !isNarrow && bondsStrip.length > 0 && (
                <ThumbnailStrip items={bondsStrip} label="orbitals in view" rGrid={[]} themeKey={stripThemeKey}
                    onSelect={handleBondsStripSelect} variant="overlay" collapsed={stripCollapsed} onCollapsedChange={setStripCollapsed} />
            )}
            {/* Task 15: Molecules' strip -- the molecule's views; its handle says so (ruling R23b-3). */}
            {/* Ruling P12: hidden while the request workspace is open -- it would describe the molecule, not the preview. */}
            {isMoleculeMode && !isNarrow && moleculeStrip.length > 0 && !requestWorkspaceOpen && (
                <ThumbnailStrip items={moleculeStrip} label="views of this molecule" rGrid={[]} themeKey={stripThemeKey}
                    onSelect={handleMoleculeStripSelect} variant="overlay" collapsed={stripCollapsed} onCollapsedChange={setStripCollapsed}
                    handleNoun="views" wrapLabels />
            )}
            {!isMoleculeMode && !isAtomMode && (showPhaseLegend || isBondsDensity || combinationLegend) && (
                <KeyColumn compact={isNarrow}>
                    {showPhaseLegend && <PhaseKey positive={phase.positive} negative={phase.negative} />}
                    {isBondsDensity && (
                        <div className="phase-legend density-key" aria-label="surface colour key">
                            <span className="phase-legend-item">
                                <span className="phase-legend-swatch" style={{ background: densitySurfaceHex(themeMode) }} />
                                ρ = {drawnDensityIso} e/a₀³, total electron density
                            </span>
                        </div>
                    )}
                    {isBondsDensity && bondsOrbitalTiles && (
                        <PhaseKey positive={phase.positive} negative={phase.negative} heading="Orbital tiles" label="orbital tile colour key" />
                    )}
                    {combinationLegend && (
                        <div className="phase-legend" aria-label="combination colour key">
                            {combinationLegend.map(item => (
                                <span key={item.label} className="phase-legend-item">
                                    <span className="phase-legend-swatch" style={{ background: item.color }} />
                                    {/* One flex item: the item's gap would otherwise open around the <sub>. */}
                                    <span>{withSubscripts(item.label)}</span>
                                </span>
                            ))}
                            <span className="phase-legend-item">darker: ψ &lt; 0</span>
                        </div>
                    )}
                </KeyColumn>
            )}
            {/* Ruling R22c (owner review 2026-10-14): Molecules' canvas keeps
                only the colour keys §3.3 requires -- the ESP/phase key, in
                the same right-hand key column every other mode uses, compact
                and without their prose notes (Task 7b: the notes are Info's,
                and the key's (i) opens its term there). The tier line and the
                pick readout, which used to share this bottom-centre stack,
                are prose and moved off the canvas entirely: the tier into the
                title block, the readout into the Explore panel. */}
            {isMoleculeMode && molecule.meta && ((moleculeKeysShown && molecule.surface.kind === 'esp') || showPhaseLegend || moleculeTileKey || moleculeCaptionZone) && (
                <KeyColumn compact={isNarrow}>
                    {moleculeKeysShown && molecule.surface.kind === 'esp' && (
                        <EspLegend compact />
                    )}
                    {showPhaseLegend && <PhaseKey positive={phase.positive} negative={phase.negative} />}
                    {moleculeTileKey && (
                        <PhaseKey positive={phase.positive} negative={phase.negative} heading="Orbital tiles" label="orbital tile colour key" />
                    )}
                    {/* Ruling R23c-3: the placeholder instruction, relocated here from the
                        Explore panel's Selection section -- its text reads only while
                        nothing is picked. Ruling R23f-3: mounted whenever the corner
                        *could* show it (moleculeCaptionZone), not only while unpicked --
                        see showHoverCaption's own comment above for why: picking must
                        never add or remove this node, only repaint it, so `.key-column`'s
                        measured size (and the camera inset derived from it) never moves
                        because of a hover. */}
                    {moleculeCaptionZone && (
                        <p className={`molecule-hover-caption${showHoverCaption ? '' : ' hidden'}`}>
                            {/* Ruling T13-I4: space filling has no bonds to pick. */}
                            {molecule.representation === 'space-filling' ? 'Hover or tap an atom' : 'Hover or tap an atom or bond'}
                        </p>
                    )}
                </KeyColumn>
            )}
            {/* A molecule that failed to load, or a surface that failed to
                draw (spec §3.5): over the canvas on a desktop
                (`.atom-error`); on a phone, under the header, in its own
                position now that the legend stack it used to ride in is
                gone (`.molecule-error`, ruling R22c). */}
            {moleculeAlert}
            {/* Addendum 3: the element selector is a real periodic
                table on anything wider than a phone, as a pop-over over
                the view. A table does not survive a phone width, so
                below that a searchable list stands in for it -- the two
                are alternatives, never both at once. */}
            {isAtomMode && !isNarrow && tableOpen && (
                <PeriodicTable Z={atomZ} onSelect={handleAtomElementChange} onClose={closeTable} />
            )}
            {phoneChrome}
            {isMedium && (isAtomMode ? atomInspector('drawer') : isBasicMode ? basicInspector('drawer') : isBondsMode ? bondsInspector('drawer') : (
                <Inspector variant="drawer" sections={moleculeSections} info={infoPanel} defaultOpen="properties" open={viewPanelOpen}
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
            {/* Task 2: a phone has no notice row under its top bar; the notice takes its own room under the header,
                moving the overlays there down (fix round 1, M2). */}
            {isNarrow && visitNotice && <PhoneNoticeSlot>{visitNotice}</PhoneNoticeSlot>}
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
        <InfoTopicProvider topic={infoTopic.topic} setTopic={infoTopic.setTopic} onReveal={revealInfo}>
            <AppShell
                layout={layout}
                wide={isWide}
                topBar={topBar}
                notice={visitNotice || undefined}
                explore={isAtomMode ? atomExplore : (
                    <ExplorePanel body={exploreContent} onCollapse={isMedium ? () => setExploreCollapsed(true) : undefined} />
                )}
                inspector={isAtomMode ? atomInspector('docked') : isBasicMode ? basicInspector('docked') : isBondsMode ? bondsInspector('docked')
                    : <Inspector variant="docked" sections={moleculeSections} info={infoPanel} defaultOpen="properties" />}
                viewport={viewport}
                shellRef={shellRef}
                exploreCollapsed={isMedium && exploreCollapsed}
                onExpandExplore={() => setExploreCollapsed(false)}
                fullscreen={fullscreen.active}
            />
            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} brand={BRAND}
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
        </InfoTopicProvider>
    );
}

export default App;
