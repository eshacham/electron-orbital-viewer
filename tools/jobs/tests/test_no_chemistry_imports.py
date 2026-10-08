"""The api Lambda ships tools/jobs without PySCF or NumPy (spec §7.1)."""
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2]


def test_api_modules_import_without_pyscf_or_numpy():
    code = ("import sys; sys.modules['pyscf'] = None; sys.modules['numpy'] = None; "
            "import jobs.handlers, jobs.store, jobs.runner, jobs.sizing, jobs.pubchem, jobs.canonical, jobs.model, "
            "jobs.dynamo_store, jobs.batch_runner, jobs.s3_sink, jobs.reconcile, jobs.billing, jobs.lambdas, jobs.quotes")
    result = subprocess.run([sys.executable, '-c', code], cwd=TOOLS, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
