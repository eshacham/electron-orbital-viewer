"""Starts a queued job somewhere. LocalRunner (Task 10) runs the worker as a
subprocess; BatchRunner (Phase 6B-3) submits to AWS Batch."""
from typing import Protocol


class Runner(Protocol):
    def submit(self, record: dict) -> str: ...


class NullRunner:
    """Accepts jobs and runs nothing: tests, and `cli enqueue` for the container smoke test."""

    def __init__(self):
        self.submitted = []

    def submit(self, record):
        self.submitted.append(record['key'])
        return 'null'
