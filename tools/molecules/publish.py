"""Publish a generated data version to the stack's data bucket (spec §4.5).

    tools/molecules/.venv/bin/python tools/molecules/publish.py v1 --dry-run
    tools/molecules/.venv/bin/python tools/molecules/publish.py v1 --manifest-only
    tools/molecules/.venv/bin/python tools/molecules/publish.py v1 --verify-only
    tools/molecules/.venv/bin/python tools/molecules/publish.py v1

Uploads tools/molecules/out/<version>/ to s3://<bucket>/molecules/<version>/
with correct content types and immutable caching, refuses to overwrite a
version that is already published, verifies every file through CloudFront,
and writes the committed manifest tools/molecules/manifest/<version>.json.
Uses the AWS CLI (already required by infra/deploy.sh), not boto3.

--dry-run and --manifest-only never call `aws` (ruling C2): the first only
prints the planned keys from the local tree, the second only writes the
manifest from the local tree. Only the plain, flag-less invocation uploads --
the controller's to run, with the owner's go-ahead, after the data has been
reviewed (ruling C2: a published version is immutable; a mistake needs v2)."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

HERE = Path(__file__).resolve().parent
STACK = "ElectronOrbitalViewerStack"
CACHE_CONTROL = "public, max-age=31536000, immutable"
BUDGET_BYTES = 3_145_728
CONTENT_TYPES = {".json": "application/json", ".gz": "application/octet-stream"}

Runner = Callable[[list[str]], str]
Fetch = Callable[[str], int]


def aws(args: list[str]) -> str:
    return subprocess.run(["aws", *args], check=True, capture_output=True, text=True).stdout


@dataclass(frozen=True)
class Upload:
    path: Path
    key: str
    content_type: str
    cache_control: str = CACHE_CONTROL


class AlreadyPublished(RuntimeError):
    pass


def files_of(root: Path) -> list[Path]:
    """Every file under `root`, dotfiles excluded (a stray .DS_Store is not
    data to publish -- D8)."""
    return sorted(p for p in root.rglob("*")
                  if p.is_file() and not any(part.startswith(".") for part in p.relative_to(root).parts))


def plan_uploads(root: Path, version: str) -> list[Upload]:
    uploads = []
    for path in files_of(root):
        suffix = path.suffix
        if suffix not in CONTENT_TYPES:
            raise ValueError(f"unexpected file type {path}")
        key = f"molecules/{version}/{path.relative_to(root).as_posix()}"
        uploads.append(Upload(path, key, CONTENT_TYPES[suffix]))
    return uploads


def build_manifest(root: Path, version: str, *, pyscf: str, commit: str) -> dict:
    files = [
        {
            "path": p.relative_to(root).as_posix(),
            "bytes": p.stat().st_size,
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        }
        for p in files_of(root)
    ]
    files.sort(key=lambda f: f["path"])
    return {"version": version, "generatedBy": {"pyscf": pyscf, "commit": commit}, "files": files}


def over_budget(root: Path) -> list[str]:
    sizes: dict[str, int] = {}
    for p in files_of(root):
        rel = p.relative_to(root)
        if len(rel.parts) > 1:
            sizes[rel.parts[0]] = sizes.get(rel.parts[0], 0) + p.stat().st_size
    return sorted(mol for mol, size in sizes.items() if size > BUDGET_BYTES)


def resolve_generator(root: Path) -> dict:
    """The provenance every meta.json under `root` actually recorded (ruling
    D8), not whatever commit HEAD is at publish time (which may be later than
    the data) or whatever PySCF happens to be installed on this machine.
    Refuses a tree that cannot give one true answer: a dirty working tree at
    generation time (generate.py's git_commit() appends "-dirty"), or meta
    files that disagree -- a published, immutable version needs a single,
    trustworthy provenance record."""
    metas = sorted(root.rglob("meta.json"))
    if not metas:
        raise ValueError(f"no meta.json found under {root}; nothing to publish")
    commits = {json.loads(p.read_text())["generator"]["commit"] for p in metas}
    versions = {json.loads(p.read_text())["generator"]["pyscf"] for p in metas}
    if any(c.endswith("-dirty") for c in commits):
        raise ValueError(f"{root} includes data generated from a dirty working tree ({sorted(commits)}); "
                         "commit tools/molecules and rerun generate.py before publishing")
    if len(commits) > 1:
        raise ValueError(f"{root} mixes generator commits {sorted(commits)}; "
                         "regenerate every molecule at one commit before publishing")
    if len(versions) > 1:
        raise ValueError(f"{root} mixes PySCF versions {sorted(versions)}; "
                         "regenerate every molecule with one PySCF version before publishing")
    return {"commit": commits.pop(), "pyscf": versions.pop()}


def bucket_name(runner: Runner = aws) -> str:
    return runner([
        "cloudformation", "describe-stacks", "--stack-name", STACK,
        "--query", "Stacks[0].Outputs[?OutputKey=='MoleculeDataBucketName'].OutputValue", "--output", "text",
    ]).strip()


def distribution_url(runner: Runner = aws) -> str:
    return runner([
        "cloudformation", "describe-stacks", "--stack-name", STACK,
        "--query", "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue", "--output", "text",
    ]).strip()


def ensure_unpublished(bucket: str, version: str, runner: Runner = aws) -> None:
    """"Published" means index.json exists at this prefix (D7): it is
    uploaded last (see `upload`), so a half-finished upload never satisfies
    this check and a later rerun can resume and finish it, rather than being
    permanently locked out by the very guard meant to protect a *finished*
    version."""
    listing = runner(["s3api", "list-objects-v2", "--bucket", bucket,
                       "--prefix", f"molecules/{version}/index.json", "--max-keys", "1", "--output", "json"])
    if json.loads(listing or "{}").get("KeyCount", 0) > 0:
        raise AlreadyPublished(f"molecules/{version}/ is already published (index.json exists); "
                               "bump tools/molecules/version.py for a new release")


def head_size(bucket: str, key: str, runner: Runner = aws) -> Optional[int]:
    """The object's size if it is already in the bucket, else None. A missing
    key is not an error here -- it is the normal case for everything but a
    resumed, partially-uploaded version."""
    try:
        output = runner(["s3api", "head-object", "--bucket", bucket, "--key", key,
                         "--query", "ContentLength", "--output", "text"])
    except subprocess.CalledProcessError:
        return None
    return int(output.strip())


def upload(bucket: str, uploads: list[Upload], manifest: dict, runner: Runner = aws) -> None:
    """Every file except index.json, uploaded last (D7): until it lands, the
    prefix holds at most a partial upload, which `ensure_unpublished` does
    not treat as published. Resuming a partial run skips a key already in
    the bucket whose size matches the manifest, and refuses outright if it
    does not -- a half-published version must finish with the exact bytes it
    started with, never quietly different ones."""
    by_path = {f["path"]: f for f in manifest["files"]}
    ordered = sorted(uploads, key=lambda u: u.key.endswith("/index.json"))
    for u in ordered:
        rel = u.key.split("/", 2)[-1]  # strip "molecules/<version>/"
        expected = by_path[rel]["bytes"]
        existing = head_size(bucket, u.key, runner)
        if existing is not None:
            if existing != expected:
                raise RuntimeError(f"{u.key}: {existing} bytes already in the bucket, manifest says {expected}; "
                                   "refusing to resume over a mismatched partial upload")
            continue
        runner(["s3", "cp", str(u.path), f"s3://{bucket}/{u.key}", "--content-type", u.content_type,
                "--cache-control", u.cache_control, "--only-show-errors"])


def head_content_length(url: str) -> int:
    request = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(request) as response:  # noqa: S310 -- fixed https CloudFront URL, HEAD only
        return int(response.headers.get("Content-Length", "-1"))


def verify(base_url: str, version: str, manifest: dict, fetch: Fetch = head_content_length) -> list[str]:
    problems = []
    for f in manifest["files"]:
        url = f"{base_url}/molecules/{version}/{f['path']}"
        try:
            length = fetch(url)
            if length != f["bytes"]:
                problems.append(f"{url}: {length} bytes, expected {f['bytes']}")
        except Exception as error:  # noqa: BLE001 -- report every failure, not just the first
            problems.append(f"{url}: {error}")
    return problems


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("version", help='e.g. "v1", matching tools/molecules/version.py\'s DATA_VERSION')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true",
                       help="print the planned S3 keys and content types; makes no AWS calls")
    modes.add_argument("--manifest-only", action="store_true",
                       help="write the committed manifest from the local output; makes no AWS calls")
    modes.add_argument("--verify-only", action="store_true",
                       help="HEAD every published file through CloudFront against the committed manifest")
    args = parser.parse_args(argv)

    root = HERE / "out" / args.version
    manifest_path = HERE / "manifest" / f"{args.version}.json"

    try:
        return _dispatch(args, root, manifest_path)
    except (ValueError, AlreadyPublished, RuntimeError) as error:
        # A domain refusal (dirty/mixed provenance, over budget, already
        # published, a mismatched partial upload) is a clear message, not a
        # traceback -- this is a CLI run by a person, not library code.
        print(error, file=sys.stderr)
        return 1


def _dispatch(args: argparse.Namespace, root: Path, manifest_path: Path) -> int:
    if args.dry_run:
        if not root.exists():
            print(f"{root} does not exist; run generate.py first", file=sys.stderr)
            return 1
        for u in plan_uploads(root, args.version):
            print(u.key, u.content_type)
        return 0

    if args.manifest_only:
        if not root.exists():
            print(f"{root} does not exist; run generate.py first", file=sys.stderr)
            return 1
        if over := over_budget(root):
            print(f"over the 3 MB budget: {', '.join(over)}", file=sys.stderr)
            return 1
        generator = resolve_generator(root)
        manifest = build_manifest(root, args.version, **generator)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
        print(f"wrote {manifest_path} ({len(manifest['files'])} files, generated by "
              f"pyscf {generator['pyscf']} at {generator['commit']})")
        return 0

    if args.verify_only:
        if not manifest_path.exists():
            print(f"{manifest_path} does not exist; run --manifest-only first", file=sys.stderr)
            return 1
        base_url = distribution_url()
        problems = verify(base_url, args.version, json.loads(manifest_path.read_text()))
        print("\n".join(problems) or f"{args.version}: every file verified through CloudFront")
        return 1 if problems else 0

    # The real publish: outward, and permanent once index.json lands (ruling
    # C2). Not run by the Task 5A implementer -- the controller runs this,
    # with the owner's go-ahead, after the data has been reviewed.
    if not manifest_path.exists():
        print(f"{manifest_path} does not exist; run --manifest-only first and review it", file=sys.stderr)
        return 1
    if not root.exists():
        print(f"{root} does not exist; run generate.py first", file=sys.stderr)
        return 1
    if over := over_budget(root):
        print(f"over the 3 MB budget: {', '.join(over)}", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text())
    uploads = plan_uploads(root, args.version)
    bucket = bucket_name()
    ensure_unpublished(bucket, args.version)
    upload(bucket, uploads, manifest)
    base_url = distribution_url()
    problems = verify(base_url, args.version, manifest)
    print("\n".join(problems) or f"published {len(uploads)} files as {args.version}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
