"""The generated-data release this checkout produces and the app reads.

Bump it (v2, v3 ...) whenever regenerated files would differ: published
versions are immutable (spec §4.5), so a changed file needs a new version,
and src/molecules/data_version.ts must move with it (a test checks)."""
from pathlib import Path

DATA_VERSION = "v1"
OUT_ROOT = Path(__file__).resolve().parent / "out" / DATA_VERSION
