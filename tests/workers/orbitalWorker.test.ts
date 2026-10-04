// Driven like exportWorker.test.ts: stub self.postMessage, call
// self.onmessage by hand, read what came back. The transfer list is only an
// argument to the stub here (jsdom detaches nothing), so this checks what the
// worker computes and replies, not the transfer itself.
import '../../src/workers/orbitalWorker';
import { FieldRenderRequest } from '../../src/field_source';
import { MoleculeBasis } from '../../src/molecules/types';
import { MeshData } from '../../src/types/orbital';

type WorkerScope = { onmessage: (event: MessageEvent) => void; postMessage: jest.Mock };

// One normalised s Gaussian, occupation 2: ρ(0) = 2 (2α/π)^(3/2) = 0.7277 for α = 0.8.
const alpha = 0.8;
const basis: MoleculeBasis = {
    id: 'worker-toy@00', spherical: true, convention: 'test', atoms: [[0, 0, 0]], nao: 1,
    shells: [{ atom: 0, l: 0, exponents: [alpha], coefficients: [(2 * alpha / Math.PI) ** 0.75 / 0.28209479177387814] }],
    orbitals: [{ index: 0, label: '1σg', energyHartree: -0.5, occupation: 2, spin: 'restricted', coefficients: [1] }],
};
const request = (overrides: Partial<FieldRenderRequest>): FieldRenderRequest => ({
    sources: [{ kind: 'analytic', id: 'gaussianDensity:worker-toy@00', rMax: 4, recipe: { type: 'gaussianDensity', moleculeId: basis.id } }],
    colors: ['#cfd8dc'], memberLabels: ['density'], resolution: 16, enclosedFraction: 0.9, label: 'toy density',
    ...overrides,
});

describe('orbitalWorker calculateFields', () => {
    let postMessage: jest.Mock;

    beforeEach(() => {
        postMessage = jest.fn();
        (self as unknown as WorkerScope).postMessage = postMessage;
    });

    // structuredClone stands in for postMessage's copy: the request (basis
    // included) must be plain data to cross the boundary at all.
    const deliver = (data: unknown) => (self as unknown as WorkerScope).onmessage({ data: structuredClone(data) } as MessageEvent);
    const reply = () => postMessage.mock.calls[0][0] as { type: string; meshes?: MeshData[]; message?: string };

    it('registers the bases the request carries and draws the density at the value asked for', () => {
        deliver({ type: 'calculateFields', request: request({ bases: [basis], densityIsoValue: 0.05 }) });
        expect(reply().type).toBe('fieldsSuccess');
        const [mesh] = reply().meshes!;
        expect(mesh.isoLevel).toBe(0.05);
        expect(postMessage.mock.calls[0][1]).toEqual([mesh.densityMap.data.buffer]);
    });

    it('draws an orbital from a carried basis at an enclosed fraction when no iso-value is given', () => {
        deliver({
            type: 'calculateFields',
            request: request({
                bases: [basis],
                sources: [{ kind: 'analytic', id: 'gaussianMO:worker-toy@00:0', rMax: 4, recipe: { type: 'gaussianMO', moleculeId: basis.id, index: 0 } }],
            }),
        });
        expect(reply().type).toBe('fieldsSuccess');
        expect(reply().meshes![0].isoLevel).toBeGreaterThan(0);
    });

    it('replies with the reason when a recipe names a basis nobody sent', () => {
        const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            deliver({
                type: 'calculateFields',
                request: request({ sources: [{ kind: 'analytic', id: 'x', rMax: 4, recipe: { type: 'gaussianDensity', moleculeId: 'unsent@03' } }], densityIsoValue: 0.002 }),
            });
            expect(reply()).toEqual({ type: 'error', message: 'No basis registered for unsent@03; the render request must carry it' });
        } finally {
            quiet.mockRestore();
        }
    });
});
