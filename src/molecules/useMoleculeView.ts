import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { renderCancelled, renderFailed, renderFinished, renderStarted, setPick, MoleculePick } from '../store/moleculeSlice';
import {
    cancelPendingRender, clearFieldMesh, frameStructure, pointerRaycaster, presentFieldMesh, setMoleculeOverlay, updateFieldInScene,
    VisualizerContext,
} from '../orbital_visualizer';
import { createGridMeshWorker } from '../workers/createGridMeshWorker';
import { isSuperseded, runMeshWorker } from './mesh_worker_client';
import { getDensityGrid, getEspGrid } from './grid_cache';
import { loadBasis } from './loader';
import { ESP_LIMIT_HARTREE, espVertexColors } from './esp_color';
import { buildBallAndStick, buildSpaceFilling, detectBonds, overlayExtent, pickMoleculePart } from './ball_and_stick';
import { dipoleArrow } from './dipole';
import { gridHalfWidth, moleculeGridRequest, planMoleculeRender } from './render_plan';

const TAP_TOLERANCE_PX = 6;
const samePick = (a: MoleculePick | null, b: MoleculePick | null) => a?.kind === b?.kind && a?.index === b?.index;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Molecules mode's scene: the surface (density, ESP-coloured density, an
 * MO, or none), the structure overlay (ball and stick, space filling or
 * none), and picking. Each surface request is numbered;
 * a result that is no longer the newest is dropped, so a slow load for one
 * molecule can never land under another's structure.
 *
 * Busy state is never keyed off a worker's promise alone: a terminated worker
 * replies to nobody, so the MO path's updateFieldInScene and a cancelled mesh
 * job may never settle. The effect's own cleanup is what ends a render that
 * did not land (ruling D38).
 */
export function useMoleculeView(contextRef: React.RefObject<VisualizerContext | null>, active: boolean, enclosedFraction: number): void {
    const dispatch = useAppDispatch();
    const meta = useAppSelector(state => state.molecule.meta);
    const surface = useAppSelector(state => state.molecule.surface);
    const representation = useAppSelector(state => state.molecule.representation);
    const showDipole = useAppSelector(state => state.molecule.showDipole);
    const requestRef = useRef(0);
    // Ruling T13-I2. The overlay last drawn, the surface chosen now (read by the overlay effect without
    // re-running on it), and the structure radius the camera frames while no surface is drawn -- null
    // whenever a surface is what frames the camera.
    const overlayRef = useRef<THREE.Group | null>(null);
    const surfaceRef = useRef(surface);
    surfaceRef.current = surface;
    const framedStructureRef = useRef<number | null>(null);

    // Structure and dipole: rebuilt only when they change, never by a surface switch.
    useEffect(() => {
        const context = contextRef.current;
        if (!context) return;
        if (!active || !meta) { setMoleculeOverlay(context, null); overlayRef.current = null; return; }
        const group = new THREE.Group();
        // Ruling P8. The slice never holds space filling for a molecule it cannot be drawn for (ruling P8b).
        if (representation === 'ball-and-stick') group.add(buildBallAndStick(meta.atoms, detectBonds(meta.atoms)));
        else if (representation === 'space-filling') group.add(buildSpaceFilling(meta.atoms));
        const arrow = showDipole ? dipoleArrow(meta) : null;
        if (arrow) group.add(arrow);
        setMoleculeOverlay(context, group);
        overlayRef.current = group;
        // With no surface the structure is the picture: a bigger one (ball and stick → space filling, the
        // arrow turned on) widens the frame to stay whole; a smaller one never zooms in (ruling T13-I2).
        const framed = framedStructureRef.current;
        if (surfaceRef.current.kind === 'none' && framed !== null) {
            const extent = overlayExtent(group);
            if (extent > framed) { frameStructure(context, extent); framedStructureRef.current = extent; }
        }
    }, [contextRef, active, meta, representation, showDipole]);

    // Nothing chosen yet (or the next molecule still loading): do not leave
    // the previous mode's, or the previous molecule's, picture up.
    useEffect(() => {
        if (active && !meta) clearFieldMesh(contextRef.current);
    }, [contextRef, active, meta]);

    useEffect(() => {
        const context = contextRef.current;
        if (!context || !active || !meta) return;
        const plan = planMoleculeRender(meta, surface, enclosedFraction);
        const requestId = ++requestRef.current;
        if (plan.kind === 'clear') {
            // Structure only (ruling P8): the request number above already
            // supersedes anything still landing; stop it, take the surface
            // down, and frame what is drawn -- the overlay effect, declared
            // above, has already built it (a link may open straight on it).
            cancelPendingRender(context);
            clearFieldMesh(context);
            const extent = overlayRef.current ? overlayExtent(overlayRef.current) : 0;
            frameStructure(context, extent);
            framedStructureRef.current = extent;
            return;
        }
        framedStructureRef.current = null;
        const current = () => requestRef.current === requestId && !context.isDisposed;
        let landed = false;
        // What this request draws, reported with its landing (exports read it, Task 16b).
        const drawn = { id: meta.id, surface, enclosedFraction };
        let cancelMesh: (() => void) | null = null;
        dispatch(renderStarted(plan.label));
        // An orbital still computing for an earlier request -- this mode's,
        // or another mode's left in flight -- must not land over this
        // surface. The MO path too: it awaits loadBasis before its own
        // render would supersede anything (final review).
        cancelPendingRender(context);
        (async () => {
            try {
                if (plan.kind === 'mo') {
                    const basis = await loadBasis(meta.id);
                    if (!current()) return;
                    const withBasis = planMoleculeRender(meta, surface, enclosedFraction, basis);
                    if (withBasis.kind !== 'mo') return;
                    const outcome = await updateFieldInScene(context, withBasis.request, false);
                    if (outcome.status !== 'rendered' || !current()) return;
                    landed = true;
                    dispatch(renderFinished({ isoLevel: outcome.isoLevel, drawn }));
                    return;
                }
                const grid = await getDensityGrid(meta);
                if (!current()) return;
                const job = runMeshWorker(createGridMeshWorker(), moleculeGridRequest(plan, grid, requestId));
                cancelMesh = job.cancel;
                const meshData = await job.promise;
                if (!current()) return;
                let esp: ReturnType<typeof espVertexColors> | null = null;
                if (plan.colourByEsp) {
                    const espGrid = await getEspGrid(meta);
                    if (!current()) return;
                    esp = espVertexColors(meshData.positions, espGrid, ESP_LIMIT_HARTREE);
                }
                presentFieldMesh(context, meshData, { vertexColors: esp?.colors, boxRMax: gridHalfWidth(meta) });
                landed = true;
                dispatch(renderFinished({ isoLevel: meshData.isoLevel, espRange: esp ? [esp.min, esp.max] : undefined, drawn }));
            } catch (error) {
                if (isSuperseded(error) || !current()) return;
                landed = true;
                // Spec §3.5, "never a stale picture": the surface still drawn
                // is the one being left (the density under a failed ESP map
                // would read as the map). The structure overlay is not the
                // thing that failed and stays; App shows the error.
                clearFieldMesh(context);
                dispatch(renderFailed(message(error)));
            }
        })();
        return () => {
            if (landed) return;
            cancelMesh?.();
            // Stops an orbital still in the orbital worker. Cleanups all run
            // before the next commit's effects, so this cannot stop the
            // render that replaces it.
            if (plan.kind === 'mo') cancelPendingRender(context);
            // The next request, if any, raises its own label straight after.
            dispatch(renderCancelled());
        };
    }, [contextRef, active, meta, surface, enclosedFraction, dispatch]);

    // Hover with a mouse; tap (press and release without dragging) on touch.
    useEffect(() => {
        const context = contextRef.current;
        if (!context || !active || !meta) return;
        const canvas = context.renderer.domElement;
        let last: MoleculePick | null = null;
        let pressedAt: { x: number; y: number } | null = null;
        const pickAt = (event: PointerEvent) =>
            context.moleculeOverlay ? pickMoleculePart(context.moleculeOverlay, pointerRaycaster(context, event)) : null;
        const report = (pick: MoleculePick | null) => {
            if (samePick(pick, last)) return;
            last = pick;
            dispatch(setPick(pick));
        };
        const onMove = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse') return;
            const pick = pickAt(event);
            canvas.style.cursor = pick ? 'pointer' : '';
            report(pick);
        };
        const onDown = (event: PointerEvent) => { pressedAt = { x: event.clientX, y: event.clientY }; };
        const onUp = (event: PointerEvent) => {
            const start = pressedAt;
            pressedAt = null;
            if (event.pointerType === 'mouse' || !start) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_TOLERANCE_PX) return;
            report(pickAt(event));
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerup', onUp);
        return () => {
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointerup', onUp);
            canvas.style.cursor = '';
            dispatch(setPick(null));
        };
    }, [contextRef, active, meta, dispatch]);
}
