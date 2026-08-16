import React, { useRef, useEffect, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { ScaleBar, formatScaleLabel } from '../scale_bar';
import {
    initVisualizer,
    cleanupVisualizer,
    updateOrbitalInScene,
    frameOrbital,
    setSurfaceStyle,
    getScaleBar,
    handleResize as visualizerHandleResize,
    VisualizerContext
} from '../orbital_visualizer';


interface OrbitalViewerProps {
    onOrbitalRendered?: (isoLevel: number) => void;
    onOrbitalFailed?: (message: string) => void;
}

const OrbitalViewer: React.FC<OrbitalViewerProps> = ({ onOrbitalRendered, onOrbitalFailed }) => {
    const canvasHostRef = useRef<HTMLDivElement>(null);
    const visualizerContextRef = useRef<VisualizerContext | null>(null);
    const stateParams = useAppSelector(state => state.orbital.currentParams);
    const viewResetNonce = useAppSelector(state => state.orbital.viewResetNonce);
    const surfaceStyle = useAppSelector(state => state.orbital.surfaceStyle);
    const [scaleBar, setScaleBar] = useState<ScaleBar | null>(null);

    // Initialize visualizer - only once
    useEffect(() => {
        if (canvasHostRef.current) {
            console.log('OrbitalViewer: Initializing visualizer');
            visualizerContextRef.current = initVisualizer(canvasHostRef.current);
        }

        return () => {
            if (visualizerContextRef.current) {
                console.log('OrbitalViewer: Cleaning up visualizer');
                cleanupVisualizer(visualizerContextRef.current);
                visualizerContextRef.current = null;
            }
        };
    }, []);

    // Handle orbital updates - now using stateParams
    useEffect(() => {
        if (!visualizerContextRef.current || !stateParams) return;

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
    }, [stateParams, onOrbitalRendered, onOrbitalFailed]);

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
