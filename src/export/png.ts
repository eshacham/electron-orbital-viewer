import type { ViewInsets } from '../orbital_visualizer';
import { ScaleBar, formatScaleLabel } from '../scale_bar';

/** Long-side cap: 2× a Retina desktop would be ~83 MB of colour alone, times MSAA. */
export const MAX_EXPORT_SIDE_PX = 4096;

/** Spec: "PNG at 2× screen resolution" — twice the drawing buffer, within the cap. */
export function exportPixelRatio(currentRatio: number, cssWidth: number, cssHeight: number, maxSide = MAX_EXPORT_SIDE_PX): number {
    const wanted = 2 * (currentRatio > 0 ? currentRatio : 1);
    return Math.min(wanted, maxSide / Math.max(cssWidth, cssHeight, 1));
}

export interface CropRect { x: number; y: number; width: number; height: number; }

/**
 * The part of the canvas no panel covers. The view offset centres the atom
 * there, so the image is the atom, not the black under the panels. Mirrors
 * fitFactorFor's rule: below a quarter of the canvas the fit used all of it.
 */
export function freeAreaCrop(width: number, height: number, insets?: ViewInsets): CropRect {
    if (!insets) return { x: 0, y: 0, width, height };
    const freeWidth = width - insets.left - insets.right;
    const freeHeight = height - insets.top - insets.bottom;
    const useX = freeWidth >= width * 0.25;
    const useY = freeHeight >= height * 0.25;
    return {
        x: useX ? insets.left : 0, y: useY ? insets.top : 0,
        width: useX ? freeWidth : width, height: useY ? freeHeight : height,
    };
}

/**
 * Ruling C5: when a Phase 1 combination is on screen with more than one
 * source, App shows its colour key instead of the plain ψ-sign key
 * (combinationLegend, App.tsx) — one swatch per overlaid member, plus the
 * shared "darker: ψ < 0" note (overlayLegend, combinations.ts). The PNG
 * must describe what it shows, so it draws whichever key is on screen.
 */
export interface CombinationLegendItem { label: string; color: string; }

export interface OverlaySpec {
    caption: string[];
    scaleBar: ScaleBar | null;
    phaseLegend: boolean;
    combinationLegend?: CombinationLegendItem[] | null;
}

export interface OverlayPainter {
    fillStyle: string | CanvasGradient | CanvasPattern;
    font: string;
    textBaseline: CanvasTextBaseline;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number): void;
    measureText(text: string): { width: number };
}

export interface ExportPainter extends OverlayPainter {
    drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

export interface ExportCanvas {
    width: number;
    height: number;
    getContext(type: '2d'): ExportPainter | null;
    toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/**
 * A row of legend entries, right-aligned to the frame, drawn left to right
 * in array order. `color: null` draws the label alone (the combination
 * key's trailing "darker: ψ < 0" note, which has no swatch of its own).
 * Placed by walking the array backwards from the right edge, so the last
 * entry lands rightmost and earlier ones step left of it.
 */
function drawLegendRow(
    painter: OverlayPainter, width: number, height: number, scale: number,
    pad: number, items: Array<[string, string | null]>,
): void {
    let right = width - pad;
    for (const [label, color] of [...items].reverse()) {
        const textWidth = painter.measureText(label).width;
        painter.fillStyle = '#ffffff';
        painter.fillText(label, right - textWidth, height - pad);
        if (color) {
            painter.fillStyle = color;
            painter.fillRect(right - textWidth - 16 * scale, height - pad - 12 * scale, 11 * scale, 11 * scale);
            right -= textWidth + 28 * scale;
        } else {
            right -= textWidth + 14 * scale;
        }
    }
}

/** The on-screen overlays, redrawn at export scale (they are DOM, not canvas). */
export function drawOverlays(painter: OverlayPainter, width: number, height: number, scale: number, spec: OverlaySpec): void {
    const pad = 14 * scale;
    const line = 18 * scale;
    painter.font = `${13 * scale}px Roboto, sans-serif`;
    painter.textBaseline = 'top';
    painter.fillStyle = 'rgba(0, 0, 0, 0.55)';
    painter.fillRect(0, 0, width, spec.caption.length * line + 2 * pad - (line - 13 * scale));
    painter.fillStyle = '#ffffff';
    spec.caption.forEach((text, i) => painter.fillText(text, pad, pad + i * line));

    painter.textBaseline = 'bottom';
    if (spec.scaleBar) {
        const barY = height - pad - 3 * scale;
        painter.fillStyle = '#ffffff';
        painter.fillRect(pad, barY, spec.scaleBar.pixels * scale, 3 * scale);
        painter.fillText(formatScaleLabel(spec.scaleBar.lengthBohr), pad, barY - 4 * scale);
    }
    // Ruling C5: the combination key, when App is showing one, takes the
    // place of the plain ψ-sign key -- the two are mutually exclusive on
    // screen (App.tsx's combinationLegend / showPhaseLegend).
    if (spec.combinationLegend && spec.combinationLegend.length > 0) {
        const items: Array<[string, string | null]> = [
            ...spec.combinationLegend.map(item => [item.label, item.color] as [string, string | null]),
            ['darker: ψ < 0', null],
        ];
        drawLegendRow(painter, width, height, scale, pad, items);
    } else if (spec.phaseLegend) {
        // Left to right, matching the on-screen order (App.tsx's phase-legend div: positive then negative).
        drawLegendRow(painter, width, height, scale, pad, [['ψ > 0', '#e02020'], ['ψ < 0', '#2040ff']]);
    }
}

export interface CaptureRenderer {
    getPixelRatio(): number;
    setPixelRatio(ratio: number): void;
    readonly domElement: HTMLCanvasElement;
}
export interface CaptureTarget { renderer: CaptureRenderer; render(): void; }

const defaultCanvas = (width: number, height: number): ExportCanvas => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as ExportCanvas;
};

function canvasToBlob(canvas: ExportCanvas): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'))), 'image/png'));
}

/**
 * Renders one frame at the export ratio and copies it out in the same task,
 * before the browser composites and clears the drawing buffer; so there is
 * no preserveDrawingBuffer and no per-frame cost. The ratio is restored and
 * the frame re-rendered at once, so the screen never shows a cleared canvas.
 */
export async function captureViewPng(
    target: CaptureTarget, crop: CropRect, overlays: OverlaySpec | null,
    createCanvas: (width: number, height: number) => ExportCanvas = defaultCanvas, maxSide = MAX_EXPORT_SIDE_PX,
): Promise<Blob> {
    const { renderer } = target;
    const previous = renderer.getPixelRatio();
    const element = renderer.domElement;
    const ratio = exportPixelRatio(previous, element.clientWidth || crop.width, element.clientHeight || crop.height, maxSide);
    const out = createCanvas(Math.round(crop.width * ratio), Math.round(crop.height * ratio));
    const painter = out.getContext('2d');
    if (!painter) throw new Error('This browser cannot compose an image.');
    try {
        renderer.setPixelRatio(ratio);
        target.render();
        painter.drawImage(element, crop.x * ratio, crop.y * ratio, crop.width * ratio, crop.height * ratio, 0, 0, out.width, out.height);
    } finally {
        renderer.setPixelRatio(previous);
        target.render();
    }
    if (overlays) drawOverlays(painter, out.width, out.height, ratio, overlays);
    return canvasToBlob(out);
}
