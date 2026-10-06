import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobRequest, PreviewResponse } from './api_types';
import { formSignature, requestBody, RequestForm } from './request_form';

export type PreviewState =
    | { phase: 'idle' }
    | { phase: 'loading'; signature: string }
    | { phase: 'ready'; signature: string; preview: PreviewResponse }
    | { phase: 'failed'; signature: string; error: Error };

export type PreviewFn = (body: JobRequest, signal: AbortSignal) => Promise<PreviewResponse>;

/**
 * One preview at a time, for one exact request. Each run aborts the one
 * before; an answer is kept only if it belongs to the latest run, and the
 * panel shows it only while the form still reads exactly what was asked.
 * So a slow answer for "water" can never sit under "ethanol" typed since,
 * and Submit never sends anything but what was previewed.
 */
export function usePreview(previewFn: PreviewFn) {
    const [state, setState] = useState<PreviewState>({ phase: 'idle' });
    const latest = useRef(0);
    const controller = useRef<AbortController | null>(null);

    const run = useCallback((form: RequestForm) => {
        const id = ++latest.current;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const signature = formSignature(form);
        setState({ phase: 'loading', signature });
        previewFn(requestBody(form), abort.signal).then(
            preview => { if (latest.current === id) setState({ phase: 'ready', signature, preview }); },
            error => {
                if (latest.current === id && !abort.signal.aborted) {
                    setState({ phase: 'failed', signature, error: error instanceof Error ? error : new Error(String(error)) });
                }
            },
        );
    }, [previewFn]);

    const clear = useCallback(() => {
        latest.current += 1;
        controller.current?.abort();
        controller.current = null;
        setState({ phase: 'idle' });
    }, []);

    useEffect(() => () => {
        latest.current += 1;
        controller.current?.abort();
    }, []);

    return { state, run, clear };
}
