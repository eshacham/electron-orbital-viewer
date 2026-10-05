import { GridMeshRequest, handleGridMeshRequest } from '../molecules/grid_mesh_request';

interface WorkerScope {
    onmessage: ((event: MessageEvent<GridMeshRequest>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
}
const worker = self as unknown as WorkerScope;

worker.onmessage = event => {
    if (event.data.type !== 'calculate') return;
    const response = handleGridMeshRequest(event.data);
    worker.postMessage(response, response.type === 'success' ? [response.meshData.densityMap.data.buffer] : []);
};
