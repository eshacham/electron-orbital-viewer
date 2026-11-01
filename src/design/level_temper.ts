import type { TemperLevel } from './tokens';

/**
 * Tempers the chrome to a learning level (Brass Instrument): sets `data-level` on the document, where tokens.css's
 * `[data-level]` blocks pick it up. The level is the effective one -- the visit level when a link set one, else the
 * stored preference -- and it changes the chrome's colours (and Basics' type and radius) only: the renderer, the
 * strip's look key and every layout size are untouched.
 *
 * Lives in design with the type from tokens.ts and no import of src/levels (/admin.html imports only src/design/*);
 * /admin.html never calls it, so it keeps the Explore temper. The first paint is set by index.html's level script.
 */
export function applyLevelToDocument(level: TemperLevel, root: HTMLElement = document.documentElement): void {
    root.dataset.level = level;
}
