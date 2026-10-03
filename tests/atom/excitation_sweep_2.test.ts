import { runShard, SWEEP_SHARDS } from './excitation_sweep';

// Final review I2's sweep, shard 2 (see excitation_sweep.ts): tens of minutes, so gated.
jest.setTimeout(4 * 60 * 60 * 1000);
const itSlow = process.env.ATOM_SLOW_TESTS === '1' ? it : it.skip;

itSlow(`every offered species in shard 2 of ${SWEEP_SHARDS} converges or reports a verdict`, () => runShard(1));
