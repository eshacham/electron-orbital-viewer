// Unlike atomWorker.ts/orbitalWorker.ts (see atom_worker_contract.test.ts's
// doc comment), which move real typed-array buffers through a transfer list
// jsdom cannot meaningfully detach, exportWorker.ts's handler is a plain
// try/catch around one function call with no transfer semantics at all --
// safe to drive directly: mock buildCubeBlob, stub self.postMessage, call
// self.onmessage by hand, and read what postMessage was given back.
jest.mock('../../src/export/cube_request', () => ({ buildCubeBlob: jest.fn() }));

import { buildCubeBlob } from '../../src/export/cube_request';
import '../../src/workers/exportWorker';

type WorkerScope = { onmessage: (event: MessageEvent) => void; postMessage: jest.Mock };

describe('exportWorker', () => {
    let postMessage: jest.Mock;

    beforeEach(() => {
        postMessage = jest.fn();
        (self as unknown as WorkerScope).postMessage = postMessage;
        (buildCubeBlob as jest.Mock).mockReset();
    });

    const deliver = (data: unknown) => (self as unknown as WorkerScope).onmessage({ data } as MessageEvent);

    it('replies with success when buildCubeBlob succeeds', () => {
        const blob = new Blob(['x']);
        (buildCubeBlob as jest.Mock).mockReturnValue(blob);
        deliver({ requestId: 3 });
        expect(postMessage).toHaveBeenCalledWith({ type: 'success', blob, requestId: 3 });
    });

    // M4: the worker's catch is what stands between a thrown exception and a
    // build that just hangs forever waiting for a reply that never comes.
    it('turns a thrown exception into an error reply', () => {
        (buildCubeBlob as jest.Mock).mockImplementation(() => { throw new Error('out of memory'); });
        deliver({ requestId: 7 });
        expect(postMessage).toHaveBeenCalledWith({ type: 'error', message: 'out of memory', requestId: 7 });
    });

    it('falls back to a stated reason when the thrown value is not an Error', () => {
        (buildCubeBlob as jest.Mock).mockImplementation(() => { throw 'boom'; });
        deliver({ requestId: 9 });
        expect(postMessage).toHaveBeenCalledWith({ type: 'error', message: 'The cube file could not be built.', requestId: 9 });
    });
});
