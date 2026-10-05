jest.mock('../../src/molecules/loader', () => ({ loadDensityGrid: jest.fn() }));
import { loadDensityGrid } from '../../src/molecules/loader';
import { getDensityGrid, clearGridCache } from '../../src/molecules/grid_cache';
import { waterMeta } from './fixtures';

const load = loadDensityGrid as jest.Mock;

describe('grid cache', () => {
    beforeEach(() => { clearGridCache(); load.mockReset(); });

    it('loads a molecule once however often it is asked for', async () => {
        load.mockResolvedValue({ id: 'h2o' });
        const [a, b] = [getDensityGrid(waterMeta()), getDensityGrid(waterMeta())];
        expect(a).toBe(b);
        await a;
        expect(load).toHaveBeenCalledTimes(1);
    });
    it('forgets a failure, so choosing the molecule again retries', async () => {
        load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'h2o' });
        await expect(getDensityGrid(waterMeta())).rejects.toThrow('offline');
        await expect(getDensityGrid(waterMeta())).resolves.toEqual({ id: 'h2o' });
    });
    it('keeps only the three most recent molecules', async () => {
        load.mockImplementation(async (meta: { id: string }) => ({ id: meta.id }));
        for (const id of ['a', 'b', 'c', 'd']) await getDensityGrid(waterMeta({ id }));
        await getDensityGrid(waterMeta({ id: 'a' }));
        expect(load).toHaveBeenCalledTimes(5);
    });
});
