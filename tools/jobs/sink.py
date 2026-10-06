"""Where a job's files go (spec §5.3). LocalSink writes under
tools/molecules/out/jobs/, which the dev server already serves at
/molecules/jobs/; S3Sink (Phase 6B-3) writes the same names to S3."""
from pathlib import Path
from typing import Protocol


class Sink(Protocol):
    def put_attempt(self, key: str, attempt: int, name: str, data: bytes) -> None: ...
    def get_attempt(self, key: str, attempt: int, name: str) -> bytes | None: ...
    def put_result(self, key: str, name: str, data: bytes) -> None: ...
    def put_done(self, key: str, data: bytes) -> None: ...


class LocalSink:
    def __init__(self, out_root):
        self.root = Path(out_root) / 'jobs'

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

    def put_done(self, key, data):
        self.put_result(key, 'done.json', data)
