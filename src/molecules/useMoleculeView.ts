import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { renderCancelled, renderFailed, renderFinished, renderStarted, setPick, MoleculePick } from '../store/moleculeSlice';
import {
    cancelPendingRender, clearFieldMesh, pointerRaycaster, presentFieldMesh, setMoleculeOverlay, updateFieldInScene, VisualizerContext,
} from '../orbital_visualizer';
import { createGridMeshWorker } from '../workers/createGridMeshWorker';
import { isSuperseded, runMeshWorker } from './mesh_worker_client';
import type { GridMeshRequest } from './grid_mesh_request';
import { getDensityGrid, getEspGrid } from './grid_cache';
import { loadBasis } from './loader';
import { ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY, espVertexColors } from './esp_color';
import { buildBallAndStick, detectBonds, pickMoleculePart } from './ball_and_stick';
import { dipoleArrow } from './dipole';
import { gridHalfWidth, planMoleculeRender } from './render_plan';

const TAP_TOLERANCE_PX = 6;
const samePick = (a: MoleculePick | null, b: MoleculePick | null) => a?.kind === b?.kind && a?.index === b?.index;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Molecules mode's scene: the surface (density, ESP-coloured density, or an
 * MO), the structure overlay, and picking. Each surface request is numbered;
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
    const showStructure = useAppSelector(state => state.molecule.showStructure);
    const showDipole = useAppSelector(state => state.molecule.showDipole);
    const requestRef = useRef(0);

    // Structure and dipole: rebuilt only when they change, never by a surface switch.
    useEffect(() => {
        const context = contextRef.current;
        if (!context) return;
        if (!active || !meta) { setMoleculeOverlay(context, null); return; }
        const group = new THREE.Group();
        if (showStructure) group.add(buildBallAndStick(meta.atoms, detectBonds(meta.atoms)));
        const arrow = showDipole ? dipoleArrow(meta) : null;
        if (arrow) group.add(arrow);
        setMoleculeOverlay(context, group);
    }, [contextRef, active, meta, showStructure, showDipole]);

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
        const current = () => requestRef.current === requestId && !context.isDisposed;
        let landed = false;
        let cancelMesh: (() => void) | null = null;
        dispatch(renderStarted(plan.label));
        // An orbital still computing for an earlier request must not land over this surface.
        if (plan.kind === 'grid') cancelPendingRender(context);
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
                    dispatch(renderFinished({ isoLevel: outcome.isoLevel }));
                    return;
                }
                const grid = await getDensityGrid(meta);
                if (!current()) return;
                const request: GridMeshRequest = plan.fraction === 'espSurface'
                    ? { type: 'calculate', source: grid, isoValue: ESP_SURFACE_DENSITY, requestId }
                    : { type: 'calculate', source: grid, enclosedFraction: plan.fraction, requestId };
                const job = runMeshWorker(createGridMeshWorker(), request);
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
                dispatch(renderFinished({ isoLevel: meshData.isoLevel, espRange: esp ? [esp.min, esp.max] : undefined }));
            } catch (error) {
                if (isSuperseded(error) || !current()) return;
                landed = true;
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
