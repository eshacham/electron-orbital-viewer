import React, { useRef, useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setHoverRadius as setAtomHoverRadius } from '../store/atomSlice';
import { ScaleBar, formatScaleLabel } from '../scale_bar';
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
    VisualizerContext
} from '../orbital_visualizer';


interface OrbitalViewerProps {
    onOrbitalRendered?: (isoLevel: number) => void;
    onOrbitalFailed?: (message: string) => void;
}

const OrbitalViewer: React.FC<OrbitalViewerProps> = ({ onOrbitalRendered, onOrbitalFailed }) => {
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

    // Levels 1-2 (whole atom / one shell) render a spherical shell view
    // straight from the solved profile instead of the marching-cubes path
    // below -- see orbital_visualizer.ts's updateAtomViewInScene.
    const showShellView = atomMode === 'atom' && (atomLevel === 'atom' || atomLevel === 'shell') && atomProfile !== null;

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

        // The shared log grid's outer radius: sizes the cut face, the
        // discard radius, and the camera framing alike (see
        // AtomShellViewParams). Available directly off the profile, so it
        // needs no separate box-sizing pass the way the marching-cubes path
        // needs computeSamplingRadius.
        const gridRMax = atomProfile.rMin * Math.exp(atomProfile.dx * (atomProfile.size - 1));

        if (atomLevel === 'atom') {
            updateAtomViewInScene(context, {
                contourRadius: atomProfile.contourRadius,
                radialCurve: atomProfile.total,
                rMin: atomProfile.rMin,
                dx: atomProfile.dx,
                size: atomProfile.size,
                rMax: gridRMax,
            });
        } else {
            const shell = atomProfile.shells.find(s => s.n === atomSelectedShell);
            if (!shell) return;
            updateAtomViewInScene(context, {
                contourRadius: shell.contourRadius,
                radialCurve: shell.curve,
                rMin: atomProfile.rMin,
                dx: atomProfile.dx,
                size: atomProfile.size,
                rMax: gridRMax,
            });
        }
    }, [showShellView, atomLevel, atomProfile, atomSelectedShell]);

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

        updateOrbitalInScene(visualizerContextRef.current, stateParams, true)
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
    }, [stateParams, showShellView, onOrbitalRendered, onOrbitalFailed]);

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
