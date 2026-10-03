import { spinOrbitShardOf, runSweep, SPIN_ORBIT_SHARDS } from './relativistic_heavy_sweep';

// Ruling C11's sweep, spin-orbit shard 2 (neutrals only; see relativistic_heavy_sweep.ts).
jest.setTimeout(10 * 60 * 1000);
const itSlow = process.env.ATOM_SLOW_TESTS === '1' ? it : it.skip;

itSlow(`every offered heavy neutral in spin-orbit shard 2 of ${SPIN_ORBIT_SHARDS} converges or reports a verdict`, () =>
    runSweep(spinOrbitShardOf(1), 'spinOrbit', `spin-orbit shard 2 of ${SPIN_ORBIT_SHARDS}`));
