"""Assembles the three Lambdas' code: tools/jobs without its tests, plus
rfc8785 (pure Python). No PySCF or NumPy: tools/jobs keeps its api modules
free of them (tools/jobs/tests/test_no_chemistry_imports.py), and boto3 is
in the Lambda runtime already."""
import importlib.util
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
JOBS = REPO / 'tools' / 'jobs'
BUNDLE = Path(__file__).resolve().parent / 'build' / 'lambda'
LEFT_OUT = {'tests', 'Dockerfile', 'README.md', '.state', '__pycache__', 'conftest.py'}


def build_lambda_bundle(out: Path = BUNDLE) -> Path:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(JOBS, out / 'jobs', ignore=lambda d, names: [n for n in names if n in LEFT_OUT])
    rfc8785 = Path(importlib.util.find_spec('rfc8785').origin).parent
    shutil.copytree(rfc8785, out / 'rfc8785', ignore=shutil.ignore_patterns('__pycache__'))
    return out
