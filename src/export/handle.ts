import type { CombinationLegendItem } from './png';

/** What the export code may ask of the 3D view. OrbitalViewer fills it. */
export interface PngOverlayInput {
    caption: string[];
    phaseLegend: boolean;
    /** Ruling C5: App's combination colour key, when one is on screen instead of the plain ψ-sign key. */
    combinationLegend?: CombinationLegendItem[] | null;
}

export interface ViewerExportHandle {
    capturePng(overlays: PngOverlayInput | null): Promise<Blob>;
}
