import React from 'react';
import './app_shell.css';

interface AppShellProps {
    layout: 'desktop' | 'medium' | 'phone';
    /** ≥ 1680 px (spec §7). */
    wide?: boolean;
    topBar?: React.ReactNode;
    rail?: React.ReactNode;
    explore?: React.ReactNode;
    /** Docked on a desktop; at medium width App renders it inside the viewport as a drawer instead. */
    inspector?: React.ReactNode;
    /** The viewport cell itself: <main id="canvas-container">, the one canvas and its overlay zones. */
    viewport: React.ReactNode;
    exploreCollapsed?: boolean;
    fullscreen?: boolean;
    shellRef?: React.Ref<HTMLDivElement>;
}

/** Focuses a landmark without touching location.hash, which is the app's view state (url_state.ts). */
function skipTo(event: React.MouseEvent<HTMLAnchorElement>, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.focus();
}

/**
 * The app frame (spec §7, §10): top bar, rail, Explore, the viewport cell
 * and the inspector on a grid. App keeps all its state and effects and
 * passes these slots; the viewport cell never remounts when the layout
 * changes (spec §3.2), because it is always this element's child.
 */
const AppShell: React.FC<AppShellProps> = ({ layout, wide = false, topBar, rail, explore, inspector, viewport, exploreCollapsed = false, fullscreen = false, shellRef }) => {
    const classes = ['app-shell', layout, wide && 'wide', exploreCollapsed && 'explore-collapsed', fullscreen && 'is-fullscreen'].filter(Boolean).join(' ');
    return (
        <div ref={shellRef} className={classes}>
            {layout !== 'phone' && (
                <>
                    <a className="skip-link" href="#canvas-container" onClick={event => skipTo(event, 'canvas-container')}>Skip to 3D view</a>
                    <a className="skip-link" href="#explore-panel" onClick={event => skipTo(event, 'explore-panel')}>Skip to controls</a>
                    {topBar}
                    {rail}
                </>
            )}
            <div className="app-workspace">
                {layout !== 'phone' && (
                    <aside id="explore-panel" className="explore-panel side-panel" aria-label="Explore" tabIndex={-1}>{explore}</aside>
                )}
                {viewport}
                {layout === 'desktop' && inspector}
            </div>
        </div>
    );
};

export default AppShell;
