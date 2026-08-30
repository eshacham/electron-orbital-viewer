import React, { useRef, useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setHoverRadius as setAtomHoverRadius } from '../store/atomSlice';
import { ScaleBar, formatScaleLabel } from '../scale_bar';
import { useMediaQuery, PREFERS_REDUCED_MOTION } from '../useMediaQuery';
import {
    initVisualizer,
    cleanupVisualizer,
    updateOrbitalInScene,
    updateAtomViewInScene,
    frameOrbital,
    setSurfaceStyle,
    setHoverRadius as setSceneHoverRadius,
    getScaleBar,
    handleResize as visualizerHandleResize,
    clearShellCompositionLobes,
    attachShellCompositionLobes,
    VisualizerContext
} from '../orbital_visualizer';
import { shellComposition, COMPOSITE_ORBITAL_RESOLUTION } from '../atom/shell_composition';
import { shellMeshCacheKey, getCachedShellMeshes, setCachedShellMeshes } from '../atom/shell_mesh_cache';
import { createShellCompositionWorker } from '../workers/createShellCompositionWorker';
import { LobeMeshData } from '../workers/shellCompositionWorker';
import { OrbitalParams } from '../types/orbital';

interface ShellCompositionSuccessMessage {
    type: 'success';
    meshes: LobeMeshData[];
    requestId: number;
}
interface ShellCompositionErrorMessage {
    type: 'error';
    message: string;
    requestId: number;
}
type ShellCompositionWorkerMessage = ShellCompositionSuccessMessage | ShellCompositionErrorMessage;

interface OrbitalViewerProps {
    onOrbitalRendered?: (isoLevel: number) => void;
    onOrbitalFailed?: (message: string) => void;
    /**
     * Which contour to draw, shared with level 3's own orbitals (see
     * App.tsx) -- reused here as-is for each composite lobe's own
     * isosurface, so the same slider that controls a single drilled-into
     * orbital's surface controls a shell-composition lobe's surface too.
     */
    enclosedFraction: number;
}

const OrbitalViewer: React.FC<OrbitalViewerProps> = ({ onOrbitalRendered, onOrbitalFailed, enclosedFraction }) => {
    const dispatch = useAppDispatch();
    const canvasHostRef = useRef<HTMLDivElement>(null);
    const visualizerContextRef = useRef<VisualizerContext | null>(null);
    const stateParams = useAppSelector(state => state.orbital.currentParams);
    const viewResetNonce = useAppSelector(state => state.orbital.viewResetNonce);
    const surfaceStyle = useAppSelector(state => state.orbital.surfaceStyle);
    const atomMode = useAppSelector(state => state.atom.mode);
    const atomLevel = useAppSelector(state => state.atom.level);
    const atomProfile = useAppSelector(state => state.atom.profile);
    const atomSelectedShell = useAppSelector(state => state.atom.selectedShell);
    const atomHoverRadius = useAppSelector(state => state.atom.hoverRadius);
    const [scaleBar, setScaleBar] = useState<ScaleBar | null>(null);

    // Level-transition spec addendum: a user who has asked their OS for
    // reduced motion gets the existing instant cut, never a shortened
    // version of the animation -- so this gates whether to animate at all,
    // rather than shrinking any duration.
    const prefersReducedMotion = useMediaQuery(PREFERS_REDUCED_MOTION);

    // Levels 1-2 (whole atom / one shell) render a spherical shell view
    // straight from the solved profile instead of the marching-cubes path
    // below -- see orbital_visualizer.ts's updateAtomViewInScene.
    const showShellView = atomMode === 'atom' && (atomLevel === 'atom' || atomLevel === 'shell') && atomProfile !== null;

    // The atom<->shell fade only makes sense between two views of the *same*
    // solved element -- a fresh element's own first shell view (or a mode
    // switch back into atom mode) has nothing of the right shape to animate
    // from, and the two elements' curves do not even share a grid (each
    // atom gets its own log grid, see atom_profile.ts). Tracked by Z rather
    // than by object identity: `atomProfile` is re-sliced (a new object)
    // whenever `enclosedFraction` changes without the element changing, and
    // that recomputed profile's curves/grid are perfectly valid to animate
    // between.
    const lastAnimatedProfileZRef = useRef<number | null>(null);

    // Initialize visualizer - only once
    useEffect(() => {
        if (canvasHostRef.current) {
            console.log('OrbitalViewer: Initializing visualizer');
            const context = initVisualizer(canvasHostRef.current);
            // Pointer -> radius (spec §6, the reverse of the plot's own
            // onHoverRadius): both directions land on the same atomSlice
            // action, so hovering the plot and hovering the cut face agree
            // on a single shared radius with no extra plumbing.
            context.onHoverRadius = (r) => dispatch(setAtomHoverRadius(r));
            visualizerContextRef.current = context;
        }

        return () => {
            if (visualizerContextRef.current) {
                console.log('OrbitalViewer: Cleaning up visualizer');
                cleanupVisualizer(visualizerContextRef.current);
                visualizerContextRef.current = null;
            }
        };
    }, [dispatch]);

    // Levels 1-2: build the shell view directly from the profile already in
    // the store. No worker round trip and no sampling grid -- the density is
    // spherically symmetric (see shell_view.ts), so there is nothing here
    // that solveAtom has not already produced.
    useEffect(() => {
        const context = visualizerContextRef.current;
        if (!context || !showShellView || !atomProfile) return;

        // Only animate between two views of the same solved element -- see
        // lastAnimatedProfileZRef's own doc comment above.
        const animate = lastAnimatedProfileZRef.current === atomProfile.Z && !prefersReducedMotion;
        lastAnimatedProfileZRef.current = atomProfile.Z;

        // The shared log grid's outer radius: sizes the cut face, the
        // discard radius, and the camera framing alike (see
        // AtomShellViewParams). Available directly off the profile, so it
        // needs no separate box-sizing pass the way the marching-cubes path
        // needs computeSamplingRadius.
        const gridRMax = atomProfile.rMin * Math.exp(atomProfile.dx * (atomProfile.size - 1));

        if (atomLevel === 'atom') {
            // The outermost resolved shell peak, when the profile resolved
            // any (ruling R26: display annotation only) -- lets the whole-
            // atom view start framed on the shell structure itself rather
            // than the much larger enclosed-fraction contour (spec bugfix;
            // see framingRadiusFor in orbital_visualizer.ts).
            const outermostFeatureR = atomProfile.shellPeaks.length > 0
                ? atomProfile.shellPeaks[atomProfile.shellPeaks.length - 1]
                : undefined;
            updateAtomViewInScene(context, {
                contourRadius: atomProfile.contourRadius,
                shellEmphasis: atomProfile.totalEmphasis,
                rMin: atomProfile.rMin,
                dx: atomProfile.dx,
                size: atomProfile.size,
                rMax: gridRMax,
                outermostFeatureR,
                // Addendum 2: colour each ring by the shell (n) that
                // dominates the total D(r) there, using the same palette the
                // radial plot colours its per-n curves with.
                ringColorIndex: atomProfile.shellIndexAtR,
            }, { animate });
        } else {
            const shell = atomProfile.shells.find(s => s.n === atomSelectedShell);
            if (!shell) return;
            updateAtomViewInScene(context, {
                contourRadius: shell.contourRadius,
                shellEmphasis: shell.emphasis,
                rMin: atomProfile.rMin,
                dx: atomProfile.dx,
                size: atomProfile.size,
                rMax: gridRMax,
                // This shell view will have its own occupied orbitals
                // attached inside it shortly (see the composition effect
                // below) -- see backdropOpacityFor's doc comment for why
                // this needs to be known here rather than left implicit.
                isComposition: true,
            }, { animate });
        }
    }, [showShellView, atomLevel, atomProfile, atomSelectedShell, prefersReducedMotion]);

    // Level 2's shell-composition view (Addendum 2): once the shell view
    // itself is showing, fetch that shell's own orbital lobes -- the actual
    // isosurfaces of its occupied subshells, at their real relative scale --
    // and attach them inside it. A second, independent effect rather than
    // folded into the one above: this has its own async lifecycle (a batch
    // marching-cubes worker call, or a cache hit), where the effect above is
    // a synchronous read of the profile already in the store.
    useEffect(() => {
        const context = visualizerContextRef.current;
        if (!context || atomMode !== 'atom' || atomLevel !== 'shell' || !atomProfile || atomSelectedShell === null) {
            return;
        }

        const shellSubshells = atomProfile.subshells.filter(s => s.n === atomSelectedShell);
        if (shellSubshells.length === 0) return;

        // Ascending l, matching the order the radial plot colours a shell's
        // subshells by (App.tsx's atomCurves) -- shellComposition's
        // colorIndex is this array's position, so the two must agree.
        const components = shellComposition(shellSubshells);
        const cacheKey = shellMeshCacheKey(atomProfile.Z, atomSelectedShell, COMPOSITE_ORBITAL_RESOLUTION, enclosedFraction);

        // A different shell's (or a stale fraction's) lobes must not linger
        // while the new ones are being computed -- cleared synchronously,
        // never left for whichever finishes first to sort out.
        clearShellCompositionLobes(context);

        // Captured now, checked when the result lands (cache hit or worker
        // reply): a newer request -- a different shell, a different
        // element, drilling further -- may already have taken over the
        // scene by then (see attachShellCompositionLobes's doc comment).
        const guard = context.requestCounter;

        const cached = getCachedShellMeshes(cacheKey);
        if (cached) {
            attachShellCompositionLobes(context, guard, components, cached);
            return;
        }

        // One OrbitalParams per mₗ orbital, in exactly shellComposition's
        // own emission order, each carrying its own subshell's numerical
        // R(r) and sampling box -- the same per-subshell sizing level 3
        // uses (subshellSamplingRadius), just at a lower resolution (see
        // COMPOSITE_ORBITAL_RESOLUTION).
        const orbitalParams: OrbitalParams[] = [];
        for (const subshell of shellSubshells) {
            for (let ml = -subshell.l; ml <= subshell.l; ml++) {
                orbitalParams.push({
                    n: subshell.n, l: subshell.l, ml,
                    Z: atomProfile.Z,
                    resolution: COMPOSITE_ORBITAL_RESOLUTION,
                    rMax: subshell.samplingRadius,
                    enclosedFraction,
                    radialSamples: { R: subshell.R, rMin: atomProfile.rMin, dx: atomProfile.dx, size: atomProfile.size },
                });
            }
        }

        const worker = createShellCompositionWorker();
        worker.onmessage = (e: MessageEvent<ShellCompositionWorkerMessage>) => {
            worker.terminate();
            if (e.data.type === 'error') {
                console.error('OrbitalViewer: shell composition worker error:', e.data.message);
                return;
            }
            setCachedShellMeshes(cacheKey, e.data.meshes);
            attachShellCompositionLobes(context, guard, components, e.data.meshes);
        };
        worker.onerror = (event) => {
            console.error('OrbitalViewer: shell composition worker error:', event);
            worker.terminate();
        };
        worker.postMessage({ type: 'calculate', orbitals: orbitalParams, requestId: 1 });

        return () => {
            worker.terminate();
        };
    }, [atomMode, atomLevel, atomProfile, atomSelectedShell, enclosedFraction]);

    // Radial-plot hover -> the shell view's highlight ring (the other half
    // of the pointer-to-radius link set up above).
    useEffect(() => {
        setSceneHoverRadius(visualizerContextRef.current, atomHoverRadius);
    }, [atomHoverRadius]);

    // Handle orbital updates - now using stateParams. Skipped while a shell
    // view is showing: that path owns the scene instead (both call
    // clearCurrentOrbital, so whichever runs leaves a clean handover either
    // way when the level changes).
    useEffect(() => {
        if (!visualizerContextRef.current || !stateParams || showShellView) return;

        console.log('OrbitalViewer: Using state params:', stateParams);

        // Cross-fade in from whatever shell view is currently showing, but
        // only for atom mode's own level 3 -- hydrogen-like mode's orbitals
        // have no drill-down levels to transition between (level-transition
        // spec addendum is scoped to the three-level atom-mode drill-down).
        // orbital_visualizer.ts still checks whether a shell view is
        // actually showing before it cross-fades anything, so this is safe
        // to pass whenever atom mode itself is active.
        updateOrbitalInScene(visualizerContextRef.current, stateParams, true, { animate: atomMode === 'atom' && !prefersReducedMotion })
            .then(outcome => {
                // A superseded request's result was thrown away; the newer one
                // still in flight is what will report completion.
                if (outcome.status === 'superseded') return;
                console.log('OrbitalViewer: Orbital update complete');
                onOrbitalRendered?.(outcome.isoLevel);
            })
            .catch(error => {
                console.error('OrbitalViewer: Error updating orbital', error);
                onOrbitalFailed?.(
                    error instanceof Error && error.message
                        ? error.message
                        : 'Could not render this orbital.'
                );
            });
    }, [stateParams, showShellView, atomMode, prefersReducedMotion, onOrbitalRendered, onOrbitalFailed]);

    // Mode, opacity and the cut plane restyle the existing mesh; no recalculation.
    useEffect(() => {
        setSurfaceStyle(visualizerContextRef.current, surfaceStyle);
    }, [surfaceStyle]);

    // Re-frame the camera when the user asks for it
    useEffect(() => {
        if (viewResetNonce === 0) return;
        const rMax = visualizerContextRef.current?.framedRMax;
        if (rMax) frameOrbital(visualizerContextRef.current, rMax);
    }, [viewResetNonce]);

    // Keep the scale readout in step with the camera. OrbitControls fires on
    // every damped frame, so only re-render when the drawn bar actually changes.
    useEffect(() => {
        const context = visualizerContextRef.current;
        const host = canvasHostRef.current;
        if (!context || !host) return;

        const update = () => {
            const next = getScaleBar(
                context,
                host.clientHeight,
                Math.max(80, Math.min(240, host.clientWidth * 0.22))
            );
            setScaleBar(current => {
                if (current === next) return current;
                if (current && next
                    && current.lengthBohr === next.lengthBohr
                    && Math.round(current.pixels) === Math.round(next.pixels)) {
                    return current;
                }
                return next;
            });
        };

        update();
        context.controls.addEventListener('change', update);
        window.addEventListener('resize', update);
        return () => {
            context.controls.removeEventListener('change', update);
            window.removeEventListener('resize', update);
        };
    }, [stateParams]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (canvasHostRef.current && visualizerContextRef.current) {
                visualizerHandleResize(visualizerContextRef.current,
                    canvasHostRef.current.clientWidth,
                    canvasHostRef.current.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            {/* The renderer's canvas is appended here directly, so this element
                is left without React children of its own. */}
            <div ref={canvasHostRef} id="orbital-canvas-host" />
            {scaleBar && (
                <div className="scale-readout" aria-label="scale">
                    <div className="scale-readout-bar" style={{ width: `${scaleBar.pixels}px` }} />
                    <span className="scale-readout-label">{formatScaleLabel(scaleBar.lengthBohr)}</span>
                </div>
            )}
        </>
    );
};

export default OrbitalViewer;
