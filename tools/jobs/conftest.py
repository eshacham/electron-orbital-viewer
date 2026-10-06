import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))                  # `import jobs`
sys.path.insert(0, str(TOOLS / 'molecules'))    # Phase 5/6's flat generator modules


def pytest_configure(config):
    # Same notice Phase 5's conftest silences: PySCF 2.3+ B3LYP is the VWN-RPA variant.
    config.addinivalue_line(
        'filterwarnings',
        r'ignore:Since PySCF-2\.3, B3LYP \(and B3P86\) are changed to the VWN-RPA variant:UserWarning',
    )
