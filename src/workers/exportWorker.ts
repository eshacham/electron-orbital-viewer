import { buildCubeBlob, CubeRequest } from '../export/cube_request';

// See orbitalWorker.ts for why the scope is described rather than typed as WebWorker.
interface WorkerScope {
    onmessage: ((event: MessageEvent<CubeRequest>) => void) | null;
    postMessage(message: unknown): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
    const { requestId } = event.data;
    try {
        scope.postMessage({ type: 'success', blob: buildCubeBlob(event.data), requestId });
    } catch (error) {
        scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The cube file could not be built.', requestId });
    }
};
