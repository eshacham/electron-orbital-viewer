"""Where a job's files go (spec §5.3). LocalSink writes under
tools/molecules/out/jobs/, which the dev server already serves at
/molecules/jobs/; S3Sink (Phase 6B-3) writes the same names to S3."""
from pathlib import Path
from typing import Protocol

# D7 (preflight): the fixed set of root result names a finished job writes --
# worker.RESULT_FILES ('meta.json', 'basis.json', 'density.bin.gz',
# 'esp.bin.gz') plus the provenance and attempt-copy files worker.run_job
# also puts at the root ('job.json', 'input.py', 'output.log',
# 'geometry.xyz', 'timings.json', 'trajectory.xyz'). Duplicated here rather
# than imported from jobs.worker, which imports jobs.sink, not the reverse.
ROOT_RESULT_NAMES = ('meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz',
                     'job.json', 'input.py', 'output.log', 'geometry.xyz', 'timings.json', 'trajectory.xyz')


class Sink(Protocol):
    def put_attempt(self, key: str, attempt: int, name: str, data: bytes) -> None: ...
    def get_attempt(self, key: str, attempt: int, name: str) -> bytes | None: ...
    def put_result(self, key: str, name: str, data: bytes) -> None: ...
    def get_result(self, key: str, name: str) -> bytes | None: ...
    def put_done(self, key: str, data: bytes) -> None: ...
    def clear_partial(self, key: str) -> None: ...


class LocalSink:
    def __init__(self, out_root):
        # Resolved now: the worker runs input.py from its scratch folder, so a
        # relative root would otherwise mean somewhere else mid-run.
        self.root = Path(out_root).resolve() / 'jobs'

    def put_attempt(self, key, attempt, name, data):
        path = self.root / key / 'attempts' / str(attempt) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get_attempt(self, key, attempt, name):
        path = self.root / key / 'attempts' / str(attempt) / name
        return path.read_bytes() if path.exists() else None

    def put_result(self, key, name, data):
        path = self.root / key / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'xb') as handle:      # 'x': a result, once written, is never replaced
            handle.write(data)

    def get_result(self, key, name):
        path = self.root / key / name
        return path.read_bytes() if path.exists() else None

    def put_done(self, key, data):
        self.put_result(key, 'done.json', data)

    def clear_partial(self, key):
        # D7: a reclaimed or killed attempt can leave the root half-written
        # (no done.json), which makes every retry fail "already in the
        # result folder". done.json's presence is what says the set is
        # complete, so its absence is the only signal needed to clear.
        if (self.root / key / 'done.json').exists():
            return
        for name in ROOT_RESULT_NAMES:
            (self.root / key / name).unlink(missing_ok=True)
