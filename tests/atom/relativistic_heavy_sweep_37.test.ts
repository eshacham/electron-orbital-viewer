import { shardOf, runSweep, SWEEP_SHARDS } from './relativistic_heavy_sweep';

// Ruling C11's sweep, shard 37 (see relativistic_heavy_sweep.ts): several minutes, so gated.
jest.setTimeout(10 * 60 * 1000);
const itSlow = process.env.ATOM_SLOW_TESTS === '1' ? it : it.skip;

itSlow(`every offered heavy species in shard 37 of ${SWEEP_SHARDS} converges in scalar or reports a verdict`, () =>
    runSweep(shardOf(36), 'scalar', `shard 37 of ${SWEEP_SHARDS}`));
