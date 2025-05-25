import React, { useRef, useEffect, useCallback } from 'react';
import {
    initVisualizer,
    cleanupVisualizer,
    updateOrbitalInScene,
    handleResize as visualizerHandleResize,
     // VisualizerContext is implicitly used by the functions
} from '../orbital_visualizer';

export interface OrbitalParams { // Renamed from OrbitalParameters in visualizer for consistency
    n: number;
    l: number;
    ml: number;
    Z: number;
    resolution: number;
    rMax: number;
    isoLevel: number;
}

interface OrbitalViewerProps {
    orbitalParams: OrbitalParams | null; // Can be null initially
    isLoading: boolean; // To potentially show a message on the canvas itself (not implemented yet)
    onOrbitalRendered?: () => void; // Callback for when rendering is complete
}

const OrbitalViewer: React.FC<OrbitalViewerProps> = ({ orbitalParams, isLoading, onOrbitalRendered }) => {
    const canvasHostRef = useRef<HTMLDivElement>(null);
    // Store the visualizer context in a ref
    const visualizerContextRef = useRef<any | null>(null); // Using 'any' for simplicity, ideally import VisualizerContext type


    // Initialize and cleanup
    useEffect(() => {
       if (canvasHostRef.current && !visualizerContextRef.current) {
            console.log('OrbitalViewer: Initializing visualizer.');
            visualizerContextRef.current = initVisualizer(canvasHostRef.current);

            // Initial resize handling
            const hostElement = canvasHostRef.current;
            if (visualizerContextRef.current) {
                visualizerHandleResize(visualizerContextRef.current, hostElement.clientWidth, hostElement.clientHeight);
            }
        }

        return () => {
            if (visualizerContextRef.current) {
                console.log('OrbitalViewer: Cleaning up visualizer.');
                cleanupVisualizer(visualizerContextRef.current);
                visualizerContextRef.current = null;
            }
        };
    }, []); // Empty dependency array: runs once on mount and cleanup on unmount

    // Handle orbital updates
    useEffect(() => {
        if (visualizerContextRef.current && orbitalParams) {
            console.log('OrbitalViewer: Updating orbital with params:', orbitalParams);
            // isLoading prop is managed by App.tsx, which should set it before calling this.
            updateOrbitalInScene(visualizerContextRef.current, orbitalParams, true /* showAxes */)
                .then(() => {
                    console.log('OrbitalViewer: Orbital update complete.');
                    onOrbitalRendered?.();
                })
                .catch(error => {
                    console.error('OrbitalViewer: Error updating orbital', error);
                    onOrbitalRendered?.(); // Still call to potentially turn off loader_
                });
        }
    }, [orbitalParams, onOrbitalRendered]); // Rerun when orbitalParams change

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (canvasHostRef.current && visualizerContextRef.current) {
                visualizerHandleResize(visualizerContextRef.current, canvasHostRef.current.clientWidth, canvasHostRef.current.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []); // Runs once on mount

    return <div ref={canvasHostRef} id="orbital-canvas-host" />;
};

export default OrbitalViewer;
