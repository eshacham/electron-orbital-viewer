import React, { useRef, useEffect } from 'react';
import { useAppSelector } from '../store/hooks';
import {
    initVisualizer,
    cleanupVisualizer,
    updateOrbitalInScene,
    handleResize as visualizerHandleResize,
    VisualizerContext
} from '../orbital_visualizer';


interface OrbitalViewerProps {
    onOrbitalRendered?: () => void;
}

const OrbitalViewer: React.FC<OrbitalViewerProps> = ({ onOrbitalRendered }) => {
    const canvasHostRef = useRef<HTMLDivElement>(null);
    const visualizerContextRef = useRef<VisualizerContext | null>(null);
    const stateParams = useAppSelector(state => state.orbital.currentParams);

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
            .then(() => {
                console.log('OrbitalViewer: Orbital update complete');
                onOrbitalRendered?.();
            })
            .catch(error => {
                console.error('OrbitalViewer: Error updating orbital', error);
                onOrbitalRendered?.();
            });
    }, [stateParams, onOrbitalRendered]); // Changed dependency to stateParams

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
