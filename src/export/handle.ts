import type { CombinationLegendItem } from './png';
import type { ExportSurface } from './surfaces';
import type { CameraAngles } from '../camera_angles';

/** What the export code may ask of the 3D view. OrbitalViewer fills it. */
export interface PngOverlayInput {
    caption: string[];
    phaseLegend: boolean;
    /** Ruling C5: App's combination colour key, when one is on screen instead of the plain ψ-sign key. */
    combinationLegend?: CombinationLegendItem[] | null;
}

export interface ViewerExportHandle {
    capturePng(overlays: PngOverlayInput | null): Promise<Blob>;
    /** The surfaces drawn now, whole (the cut is a view setting), in world-space bohr. */
    collectSurfaces(): ExportSurface[];
    /** How many surfaces collectSurfaces would return, without copying them: the STL dialog says when a file holds several solids. */
    surfaceCount(): number;
    /**
     * The camera's direction now. The store's cameraAngles trails it by the
     * settle delay (OrbitalViewer reports a move once the camera has sat
     * still), so a link made at the click asks here instead (final review M4).
     */
    cameraAngles(): CameraAngles;
}
