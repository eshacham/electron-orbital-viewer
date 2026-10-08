"""tools/molecules/in_image.sh (Phase 6D): the docker command it would run. docker, aws, cdk, npm and node
are stubbed first on PATH -- no container ever starts here."""
import os
import stat
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / 'tools' / 'molecules' / 'in_image.sh'


def run(tmp_path, *args, **env):
    stubs = tmp_path / 'bin'
    stubs.mkdir()
    for name in ('docker', 'aws', 'cdk', 'npm', 'node'):
        stub = stubs / name
        stub.write_text('#!/bin/bash\nprintf "%s\\n" "$(basename "$0")" "$@" > "$STUB_LOG"\n')
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / 'argv'
    environ = {**os.environ, 'PATH': f'{stubs}:{os.environ["PATH"]}', 'STUB_LOG': str(log),
               'AWS_REGION': 'us-east-1', **env}
    done = subprocess.run(['bash', str(SCRIPT), *args], cwd=REPO, env=environ, capture_output=True, text=True)
    return done, (log.read_text().splitlines() if log.exists() else [])


def test_runs_python_in_the_worker_image_with_the_checkout_mounted(tmp_path):
    done, argv = run(tmp_path, 'tools/molecules/build_library.py', '--only', 'h2o')
    assert done.returncode == 0, done.stderr
    assert argv[:3] == ['docker', 'run', '--rm']
    assert argv[argv.index('--platform') + 1] == 'linux/arm64'
    assert f'{REPO}:/repo' in argv and argv[argv.index('-w') + 1] == '/repo'
    assert argv[argv.index('--entrypoint') + 1] == 'python'
    assert argv[-4:] == ['orbital-viewer-worker:local', 'tools/molecules/build_library.py', '--only', 'h2o']
    assert 'PYTHONPATH=/repo/tools:/repo/tools/molecules' in argv and 'HOME=/tmp' in argv
    assert 'OMP_NUM_THREADS=8' in argv and 'PYSCF_MAX_MEMORY=12000' in argv


def test_passes_the_hosts_commit_because_the_image_has_no_git(tmp_path):
    _, argv = run(tmp_path, '-c', 'pass')
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO, capture_output=True, text=True).stdout.strip()
    commit = next(a for a in argv if a.startswith('MOLECULES_GENERATOR_COMMIT=')).split('=', 1)[1]
    dirty = subprocess.run(['git', 'status', '--porcelain', 'tools/molecules'], cwd=REPO,
                           capture_output=True, text=True).stdout.strip()
    assert commit == head + ('-dirty' if dirty else '')


def test_threads_memory_and_image_can_be_overridden(tmp_path):
    _, argv = run(tmp_path, '-c', 'pass', OMP_NUM_THREADS='4', PYSCF_MAX_MEMORY='6000', MOLECULES_IMAGE='other:tag')
    assert 'OMP_NUM_THREADS=4' in argv and 'PYSCF_MAX_MEMORY=6000' in argv and 'other:tag' in argv


def test_refuses_to_run_with_nothing_to_run(tmp_path):
    done, argv = run(tmp_path)
    assert done.returncode == 2 and argv == [] and 'usage' in done.stderr
