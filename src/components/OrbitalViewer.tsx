import React, { useRef, useEffect } from 'react';
import {
    initVisualizer,
    cleanupVisualizer,
    updateOrbitalInScene,
    handleResize as visualizerHandleResize,
    VisualizerContext
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
    const visualizerContextRef = useRef<VisualizerContext | null>(null);

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

    // Handle orbital updates
    useEffect(() => {
        if (!visualizerContextRef.current || !orbitalParams) return;

        console.log('OrbitalViewer: Updating orbital with params:', orbitalParams);
        updateOrbitalInScene(visualizerContextRef.current, orbitalParams, true)
            .then(() => {
                console.log('OrbitalViewer: Orbital update complete');
                onOrbitalRendered?.();
            })
            .catch(error => {
                console.error('OrbitalViewer: Error updating orbital', error);
                onOrbitalRendered?.();
            });
    }, [orbitalParams, onOrbitalRendered]);

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

    return <div ref={canvasHostRef} id="orbital-canvas-host" />;
};

export default OrbitalViewer;
