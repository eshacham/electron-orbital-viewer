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
    # Review fix round 1: the checkout is read-only; only the generator's real write targets are bound
    # read-write individually, so a stray run can never overwrite the published out/v2 data or .state.
    assert f'{REPO}:/repo:ro' in argv and argv[argv.index('-w') + 1] == '/repo'
    assert f'{REPO}/tools/molecules/.cache:/repo/tools/molecules/.cache' in argv
    assert f'{REPO}/tools/molecules/geometries:/repo/tools/molecules/geometries' in argv
    assert f'{REPO}/src/validation/generated:/repo/src/validation/generated' in argv
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


def test_gives_a_clear_message_when_docker_is_missing(tmp_path):
    # No docker stub this time, and the real PATH's entries that do carry a docker binary are filtered
    # out, so the script's own `command -v docker` genuinely fails rather than finding this machine's
    # OrbStack docker -- no container must ever be reachable from this test.
    stubs = tmp_path / 'bin'
    stubs.mkdir()
    for name in ('aws', 'cdk', 'npm', 'node'):
        stub = stubs / name
        stub.write_text('#!/bin/bash\nexit 0\n')
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    docker_free = [d for d in os.environ['PATH'].split(os.pathsep) if not Path(d, 'docker').exists()]
    environ = {**os.environ, 'PATH': os.pathsep.join([str(stubs), *docker_free]), 'AWS_REGION': 'us-east-1'}
    done = subprocess.run(['bash', str(SCRIPT), '-c', 'pass'], cwd=REPO, env=environ, capture_output=True, text=True)
    assert done.returncode == 3
    assert 'docker' in done.stderr.lower() and 'PATH' in done.stderr


def test_gives_a_clear_message_when_the_image_is_missing(tmp_path):
    stubs = tmp_path / 'bin'
    stubs.mkdir()
    for name in ('docker', 'aws', 'cdk', 'npm', 'node'):
        stub = stubs / name
        # Every invocation fails, as `docker image inspect` does for an image that was never built.
        stub.write_text('#!/bin/bash\nexit 1\n')
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    environ = {**os.environ, 'PATH': f'{stubs}:{os.environ["PATH"]}', 'AWS_REGION': 'us-east-1'}
    done = subprocess.run(['bash', str(SCRIPT), '-c', 'pass'], cwd=REPO, env=environ, capture_output=True, text=True)
    assert done.returncode == 4
    assert 'orbital-viewer-worker:local' in done.stderr and 'not found' in done.stderr


def test_a_published_version_stays_read_only_unless_named(tmp_path):
    # Final review M3: v3 is published (manifest/v3.json), so its local copy is immutable like v2's: by default
    # the runner binds no out/ directory read-write, and says why.
    done, argv = run(tmp_path, '-c', 'pass')
    assert done.returncode == 0, done.stderr
    assert not any(a.endswith(':/repo/tools/molecules/out/v3') for a in argv)
    assert 'out/v3 is published' in done.stderr and 'MOLECULES_WRITE_VERSION=v3' in done.stderr


def test_naming_the_version_being_generated_binds_it(tmp_path):
    done, argv = run(tmp_path, '-c', 'pass', MOLECULES_WRITE_VERSION='v3')
    assert done.returncode == 0, done.stderr
    assert f'{REPO}/tools/molecules/out/v3:/repo/tools/molecules/out/v3' in argv


def test_naming_another_version_is_refused_and_runs_nothing(tmp_path):
    done, argv = run(tmp_path, '-c', 'pass', MOLECULES_WRITE_VERSION='v2')
    assert done.returncode == 5 and argv == []
    assert "version.py's DATA_VERSION is v3" in done.stderr


def fake_checkout(tmp_path, version, published):
    """A checkout holding only what in_image.sh reads: itself, version.py and the manifest folder."""
    repo = tmp_path / 'repo'
    (repo / 'tools' / 'molecules' / 'manifest').mkdir(parents=True)
    script = repo / 'tools' / 'molecules' / 'in_image.sh'
    script.write_text(SCRIPT.read_text())
    (repo / 'tools' / 'molecules' / 'version.py').write_text(f'DATA_VERSION = "{version}"\n')
    if published:
        (repo / 'tools' / 'molecules' / 'manifest' / f'{version}.json').write_text('{}')
    for args in (['init', '-q'], ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x']):
        subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True)
    return repo


def test_an_unpublished_version_is_bound_read_write(tmp_path):
    # A new version in the making (as v3 was in Task 14) has no manifest yet: the generator writes into it.
    repo = fake_checkout(tmp_path, 'v4', published=False)
    stubs = tmp_path / 'bin'
    stubs.mkdir()
    for name in ('docker', 'aws', 'cdk', 'npm', 'node'):
        stub = stubs / name
        stub.write_text('#!/bin/bash\nprintf "%s\\n" "$(basename "$0")" "$@" > "$STUB_LOG"\n')
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / 'argv'
    environ = {**os.environ, 'PATH': f'{stubs}:{os.environ["PATH"]}', 'STUB_LOG': str(log), 'AWS_REGION': 'us-east-1'}
    done = subprocess.run(['bash', str(repo / 'tools' / 'molecules' / 'in_image.sh'), '-c', 'pass'], cwd=repo,
                          env=environ, capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    real = os.path.realpath(repo)
    assert f'{real}/tools/molecules/out/v4:/repo/tools/molecules/out/v4' in log.read_text().splitlines()
