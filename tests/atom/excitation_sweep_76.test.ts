import { runShard, SWEEP_SHARDS } from './excitation_sweep';

// Final review I2's sweep, shard 76 (see excitation_sweep.ts): minutes of work, so gated.
jest.setTimeout(10 * 60 * 1000);
const itSlow = process.env.ATOM_SLOW_TESTS === '1' ? it : it.skip;

itSlow(`every offered species in shard 76 of ${SWEEP_SHARDS} converges or reports a verdict`, () => runShard(75));
