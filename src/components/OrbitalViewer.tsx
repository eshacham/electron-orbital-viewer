import React, { useRef, useEffect, useCallback } from 'react';
import {
    initVisualizer,
    cleanupVisualizer,
    updateOrbitalInScene,
    handleResize as visualizerHandleResize,
    // VisualizerContext // Not directly used here, but good to know it exists
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
    const isInitialized = useRef(false);

    // Initialize and cleanup
    useEffect(() => {
        if (canvasHostRef.current && !isInitialized.current) {
            console.log('OrbitalViewer: Initializing visualizer.');
            initVisualizer(canvasHostRef.current);
            isInitialized.current = true;

            // Initial resize handling
            const hostElement = canvasHostRef.current;
            visualizerHandleResize(hostElement.clientWidth, hostElement.clientHeight);
        }

        return () => {
            if (isInitialized.current) {
                console.log('OrbitalViewer: Cleaning up visualizer.');
                cleanupVisualizer();
                isInitialized.current = false;
            }
        };
    }, []); // Empty dependency array: runs once on mount and cleanup on unmount

    // Handle orbital updates
    useEffect(() => {
        if (isInitialized.current && orbitalParams) {
            console.log('OrbitalViewer: Updating orbital with params:', orbitalParams);
            // isLoading prop is managed by App.tsx, which should set it before calling this.
            updateOrbitalInScene(orbitalParams, true /* showAxes */)
                .then(() => {
                    console.log('OrbitalViewer: Orbital update complete.');
                    onOrbitalRendered?.();
                })
                .catch(error => {
                    console.error('OrbitalViewer: Error updating orbital', error);
                    onOrbitalRendered?.(); // Still call to potentially turn off loader
                });
        }
    }, [orbitalParams, onOrbitalRendered]); // Rerun when orbitalParams change

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (canvasHostRef.current && isInitialized.current) {
                visualizerHandleResize(canvasHostRef.current.clientWidth, canvasHostRef.current.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []); // Runs once on mount

    return <div ref={canvasHostRef} id="orbital-canvas-host" style={{ width: '100%', height: '100%', position: 'relative' }} />;
};

export default OrbitalViewer;
