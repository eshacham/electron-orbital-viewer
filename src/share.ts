export function shareUrlFor(
    hash: string,
    location: Pick<Location, 'origin' | 'pathname' | 'search'> = window.location,
): string {
    return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

export interface ClipboardEnv {
    clipboard?: { writeText(text: string): Promise<void> };
    execCopy?: (text: string) => boolean;
}

/** The pre-Clipboard-API copy, which still works on plain http where navigator.clipboard is absent. */
export function execCommandCopy(text: string): boolean {
    if (typeof document.execCommand !== 'function') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        area.remove();
    }
}

/** True if the text reached the clipboard. False means: show it for copying by hand. */
export async function copyText(
    text: string,
    env: ClipboardEnv = { clipboard: navigator.clipboard, execCopy: execCommandCopy },
): Promise<boolean> {
    if (env.clipboard) {
        try {
            await env.clipboard.writeText(text);
            return true;
        } catch {
            // Refused (permissions, an iframe, no user gesture): try the old way.
        }
    }
    return env.execCopy ? env.execCopy(text) : false;
}
