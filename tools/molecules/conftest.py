import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def pytest_configure(config):
    # PySCF 2.3+ always uses the VWN-RPA B3LYP variant (noted in the Design
    # decisions and recorded per-run in meta.generator.xc); narrowly silence
    # only this one notice so a real warning elsewhere still fails the run.
    config.addinivalue_line(
        'filterwarnings',
        r'ignore:Since PySCF-2\.3, B3LYP \(and B3P86\) are changed to the VWN-RPA variant:UserWarning',
    )
