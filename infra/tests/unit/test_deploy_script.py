"""infra/deploy.sh's worker-image rules (final review I2), in /bin/bash 3.2.

The script is sourced, which only defines its functions (its phases run
when it is executed), and AWS, Docker, CDK and npm are replaced: every test
puts failing stand-ins for them first on PATH, and stubs the functions it
exercises, so no AWS call is made even if the sourcing guard ever broke.
infra/owner.env is never read (a fixture one is)."""
import os
import platform
import stat
import subprocess
from pathlib import Path

import pytest

INFRA = Path(__file__).resolve().parents[2]
DEPLOY = INFRA / 'deploy.sh'
REPO = INFRA.parent


def _native():
    # An x86_64 Python under Rosetta starts its children as x86_64, and
    # /usr/bin/git's xcrun shim then fails on Apple silicon: run them native.
    if platform.system() == 'Darwin' and platform.machine() == 'x86_64':
        arm = subprocess.run(['sysctl', '-n', 'hw.optional.arm64'], capture_output=True, text=True).stdout.strip()
        if arm == '1':
            return ['arch', '-arm64']
    return []


NATIVE = _native()


@pytest.fixture
def no_outside_world(tmp_path):
    bin_dir = tmp_path / 'stub-bin'
    bin_dir.mkdir()
    for name in ('aws', 'docker', 'cdk', 'npm', 'node'):
        path = bin_dir / name
        path.write_text(f'#!/bin/sh\necho "stub {name} called: $*" >&2\nexit 97\n')
        path.chmod(path.stat().st_mode | stat.S_IEXEC)
    return {**os.environ, 'PATH': f'{bin_dir}:{os.environ["PATH"]}'}


def bash(env, script, cwd=None):
    return subprocess.run([*NATIVE, '/bin/bash', '-c', f'source "{DEPLOY}"\n{script}'], capture_output=True,
                          text=True, cwd=cwd, env=env)


def git(root, *args):
    subprocess.run([*NATIVE, 'git', '-C', str(root), '-c', 'user.name=t', '-c', 'user.email=t@example.com', *args],
                   check=True, capture_output=True)


def test_sourcing_runs_no_phase(no_outside_world):
    result = bash(no_outside_world, 'echo sourced')
    assert result.returncode == 0 and result.stdout == 'sourced\n' and 'stub' not in result.stderr


@pytest.fixture
def repo(tmp_path):
    """A repository holding the worker image's inputs and its docs."""
    root = tmp_path / 'repo'
    for name, text in (('tools/jobs/worker.py', 'print(1)\n'), ('tools/jobs/README.md', '# jobs\n'),
                       ('tools/jobs/notes/more.md', 'more\n'), ('tools/molecules/build_library.py', 'x = 1\n'),
                       ('tools/molecules/requirements.lock', 'pyscf==2.8.0\n'), ('.dockerignore', '*\n')):
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(text)
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'one')
    return root


def tag_of(env, root):
    result = bash(env, f'PROJECT_ROOT="{root}"; image_tag')
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def commit(root, name, text):
    (root / name).write_text(text)
    git(root, 'commit', '-qam', name)


def test_documentation_is_not_part_of_the_worker_image_tag(no_outside_world, repo):
    env = no_outside_world
    before = tag_of(env, repo)
    assert len(before) == 16 and before != 'e3b0c44298fc1c14'       # not the hash of an empty listing
    commit(repo, 'tools/jobs/README.md', '# jobs, edited\n')
    commit(repo, 'tools/jobs/notes/more.md', 'edited\n')
    assert tag_of(env, repo) == before
    (repo / 'tools/jobs/README.md').write_text('uncommitted\n')     # a docs edit in progress blocks nothing
    assert tag_of(env, repo) == before
    commit(repo, 'tools/jobs/worker.py', 'print(2)\n')
    assert tag_of(env, repo) != before


def test_no_tag_when_git_cannot_list_the_inputs(no_outside_world, tmp_path):
    # A git that fails, or a tree with none of the inputs, used to hash an
    # empty listing into a real-looking tag (e3b0c44298fc1c14).
    (tmp_path / 'not-a-repo').mkdir()
    result = bash(no_outside_world, f'PROJECT_ROOT="{tmp_path / "not-a-repo"}"; image_tag')
    assert result.returncode != 0 and result.stdout.strip() == '' and 'refusing' in result.stderr


def test_the_image_leaves_out_what_its_tag_leaves_out():
    lines = (REPO / '.dockerignore').read_text().splitlines()
    assert 'tools/jobs/**/*.md' in lines
    assert lines.index('tools/jobs/**/*.md') > lines.index('!tools/jobs/')       # later lines win
    assert "':(exclude,glob)tools/jobs/**/*.md'" in DEPLOY.read_text()


STUBS = '''
SCRIPT_DIR="{env_dir}"
output() {{ case "$2" in
  MoleculeDataBucketName) echo data-bucket ;;
  CloudFrontURL) echo https://example.cloudfront.net ;;
  WorkerRepositoryUri) echo "{repository}" ;;
esac; }}
image_tag() {{ echo 0123456789abcdef; }}
image_in_ecr() {{ return {in_ecr}; }}
anomaly_monitor() {{ echo on; }}
build_site() {{ :; }}
setup_cdk() {{ :; }}
cdk() {{ echo "cdk $*"; }}
deploy_compute
'''


def deploy_compute(env, tmp_path, repository, in_ecr):
    (tmp_path / 'owner.env').write_text('ALERT_EMAIL=owner@example.com\n')
    return bash(env, STUBS.format(env_dir=tmp_path, repository=repository, in_ecr=0 if in_ecr else 1),
                cwd=tmp_path)


REPOSITORY = '123456789012.dkr.ecr.us-east-1.amazonaws.com/electron-orbital-viewer-worker'


def test_compute_refuses_to_name_an_image_ecr_does_not_have(no_outside_world, tmp_path):
    result = deploy_compute(no_outside_world, tmp_path, REPOSITORY, in_ecr=False)
    assert result.returncode != 0
    assert 'cdk deploy' not in result.stdout
    assert '0123456789abcdef is not in ECR' in result.stderr and "image' first" in result.stderr


def test_compute_deploys_when_ecr_has_the_image(no_outside_world, tmp_path):
    result = deploy_compute(no_outside_world, tmp_path, REPOSITORY, in_ecr=True)
    assert result.returncode == 0, result.stderr
    assert 'cdk deploy ElectronOrbitalViewerComputeStack' in result.stdout
    assert 'imageTag=0123456789abcdef' in result.stdout and 'anomalyMonitor=on' in result.stdout


def test_a_first_compute_deploy_has_no_repository_to_check(no_outside_world, tmp_path):
    # `all` pushes the image right after the deploy that creates the repository.
    result = deploy_compute(no_outside_world, tmp_path, '', in_ecr=False)
    assert result.returncode == 0, result.stderr
    assert 'cdk deploy ElectronOrbitalViewerComputeStack' in result.stdout
