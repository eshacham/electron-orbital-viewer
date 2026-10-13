import { useEffect } from 'react';

/** "<view title> · <brand>" in the viewer (spec §5). */
export function useDocumentTitle(title: string): void {
    useEffect(() => { document.title = title; }, [title]);
}
