import { useEffect } from 'react';

const NEXT = { horizontal: ['ArrowRight'], vertical: ['ArrowDown'], both: ['ArrowRight', 'ArrowDown'] };
const PREVIOUS = { horizontal: ['ArrowLeft'], vertical: ['ArrowUp'], both: ['ArrowLeft', 'ArrowUp'] };
const CURRENT = '[aria-pressed="true"], [aria-selected="true"], [aria-current="page"], [aria-current="true"]';

/**
 * Roving tabindex (spec §13): a group is one Tab stop -- its pressed,
 * selected or current item, else its first -- and the arrow keys, Home and
 * End move inside it. Re-syncs when items change state or come and go.
 *
 * Controller ruling DX2: the effect reads `ref.current` once, so a container
 * that mounts after the first render (e.g. the strip after collapse ->
 * expand, or the mₗ row after a subshell is picked) never got attached. The
 * optional `resetKey` is included in the effect's dependency list so a
 * caller can pass the state that gates the container's mount (or any other
 * value that should force re-attachment) and get roving focus once the
 * container actually exists.
 */
export function useRovingFocus(
    ref: React.RefObject<HTMLElement | null>,
    options: { selector: string; orientation: 'horizontal' | 'vertical' | 'both' },
    resetKey?: unknown,
): void {
    const { selector, orientation } = options;
    useEffect(() => {
        const container = ref.current;
        if (!container) return undefined;
        const items = () => [...container.querySelectorAll<HTMLElement>(selector)]
            .filter(item => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true');
        const sync = () => {
            const list = items();
            const current = list.find(item => item.matches(CURRENT)) ?? list[0];
            list.forEach(item => { item.tabIndex = item === current ? 0 : -1; });
        };
        const onKey = (event: KeyboardEvent) => {
            const list = items();
            const index = list.indexOf(document.activeElement as HTMLElement);
            if (index < 0) return;
            let next: number;
            if (NEXT[orientation].includes(event.key)) next = (index + 1) % list.length;
            else if (PREVIOUS[orientation].includes(event.key)) next = (index - 1 + list.length) % list.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = list.length - 1;
            else return;
            event.preventDefault();
            list.forEach(item => { item.tabIndex = -1; });
            list[next].tabIndex = 0;
            list[next].focus();
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-current', 'disabled'] });
        container.addEventListener('keydown', onKey);
        return () => {
            observer.disconnect();
            container.removeEventListener('keydown', onKey);
        };
    }, [ref, selector, orientation, resetKey]);
}
