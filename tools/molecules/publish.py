"""Publish a generated data version to the stack's data bucket (spec §4.5).

    tools/molecules/.venv/bin/python tools/molecules/publish.py v1 --dry-run
    tools/molecules/.venv/bin/python tools/molecules/publish.py v1 --manifest-only
    tools/molecules/.venv/bin/python tools/molecules/publish.py v1 --verify-only
    tools/molecules/.venv/bin/python tools/molecules/publish.py v1

Uploads tools/molecules/out/<version>/ to s3://<bucket>/molecules/<version>/
with correct content types, immutable caching and a SHA-256 checksum on every
object, refuses to overwrite a version that is already published, verifies
every file through S3 and then through CloudFront, and writes the committed
manifest tools/molecules/manifest/<version>.json. Uses the AWS CLI (already
required by infra/deploy.sh), not boto3.

The real run's order: resolve the bucket and the CloudFront domain (no write
yet); check the local tree against the committed manifest byte for byte,
including its provenance (fix round 1, I1); refuse if already published;
upload every data file and the manifest.json copy, each checked afterwards
through S3's own checksum (fix round 1, I1/I2); only once every one of those
verifies does index.json -- the published marker -- go up; then a final
CloudFront read-through pass. `--dry-run` runs the same checks and prints the
same plan, in the same order, with no AWS calls at all.

--dry-run and --manifest-only never call `aws` (ruling C2): the first only
prints the planned keys after checking the local tree against the committed
manifest, the second only writes the manifest from the local tree. Only the
plain, flag-less invocation uploads -- the controller's to run, with the
owner's go-ahead, after the data has been reviewed (ruling C2: a published
version is immutable; a mistake needs v2)."""
from __future__ import annotations

import argparse
import base64
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
BUDGET_BYTES = 3_000_000
CONTENT_TYPES = {".json": "application/json", ".gz": "application/octet-stream"}

Runner = Callable[[list[str]], str]
Fetch = Callable[[str], int]


def aws(args: list[str]) -> str:
    """Raises subprocess.CalledProcessError (with .stdout/.stderr attached)
    on a non-zero exit. head_object treats that as "key not found" and never
    lets it propagate -- the CLI's own explanation is printed centrally, in
    main()'s dispatcher, for every other caller, where a failure here is not
    expected and a bare CalledProcessError's str() would omit it entirely
    (fix round 1, M4)."""
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


def validate_against_manifest(root: Path, manifest: dict) -> None:
    """The local tree is exactly, byte for byte, what the manifest says it is
    (fix round 1, I1): the same file set, the same SHA-256 per file, and the
    same generator provenance. Run before any write, and by `--dry-run` too,
    so the preview is a true preview of the real run -- a published version
    is immutable and world-readable the moment index.json lands, so this is
    the last chance to catch a manifest that has drifted from the data it is
    meant to describe."""
    by_path = {f["path"]: f for f in manifest["files"]}
    disk_paths = {p.relative_to(root).as_posix() for p in files_of(root)}
    manifest_paths = set(by_path)
    if disk_paths != manifest_paths:
        missing = sorted(manifest_paths - disk_paths) or "none"
        extra = sorted(disk_paths - manifest_paths) or "none"
        raise ValueError(f"{root} does not match the manifest's file list "
                         f"(in the manifest but not on disk: {missing}; on disk but not in the manifest: {extra})")
    for p in files_of(root):
        rel = p.relative_to(root).as_posix()
        actual = hashlib.sha256(p.read_bytes()).hexdigest()
        if actual != by_path[rel]["sha256"]:
            raise ValueError(f"{rel}: sha256 {actual} does not match the manifest's {by_path[rel]['sha256']}")
    generator = resolve_generator(root)
    if generator != manifest["generatedBy"]:
        raise ValueError(f"{root}'s generator provenance {generator} does not match "
                         f"the manifest's {manifest['generatedBy']}")


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
    uploaded last (see `_cp`/`upload_missing`), so a half-finished upload
    never satisfies this check and a later rerun can resume and finish it,
    rather than being permanently locked out by the very guard meant to
    protect a *finished* version."""
    listing = runner(["s3api", "list-objects-v2", "--bucket", bucket,
                       "--prefix", f"molecules/{version}/index.json", "--max-keys", "1", "--output", "json"])
    if json.loads(listing or "{}").get("KeyCount", 0) > 0:
        raise AlreadyPublished(f"molecules/{version}/ is already published (index.json exists); "
                               "bump tools/molecules/version.py for a new release")


def expected_checksum_b64(sha256_hex: str) -> str:
    """S3's ChecksumSHA256 is base64 of the raw digest; the manifest stores
    the usual hex, so comparing the two needs this conversion."""
    return base64.b64encode(bytes.fromhex(sha256_hex)).decode()


def head_object(bucket: str, key: str, runner: Runner = aws) -> Optional[dict]:
    """The object's checksum, content type, cache-control and content-encoding
    if it is already in the bucket, else None. A missing key is the ordinary
    case for everything but a resumed upload, so it is not logged as an error
    here; a *different* failure (say, a permissions problem) is also reported
    as "missing" by this function, but then surfaces loudly a moment later,
    when the upload it triggers fails too -- precisely distinguishing "404"
    from other AWS CLI errors is not worth the brittleness of parsing its
    text."""
    try:
        output = runner(["s3api", "head-object", "--bucket", bucket, "--key", key, "--checksum-mode", "ENABLED",
                         "--query", "{checksum:ChecksumSHA256,contentType:ContentType,"
                                    "cacheControl:CacheControl,contentEncoding:ContentEncoding}",
                         "--output", "json"])
    except subprocess.CalledProcessError:
        return None
    return json.loads(output)


def _matches(u: Upload, sha256_hex: str, head: dict) -> bool:
    """Checksum, content type and cache-control all agree, and S3 is not
    transparently decompressing the object for us (it would if some earlier
    upload had set Content-Encoding, which we never do) -- anything less and
    a byte-identical ContentLength is not enough to call it the same file
    (fix round 1, I1)."""
    return (head.get("checksum") == expected_checksum_b64(sha256_hex)
            and head.get("contentType") == u.content_type
            and head.get("cacheControl") == u.cache_control
            and not head.get("contentEncoding"))


def _cp(bucket: str, u: Upload, runner: Runner) -> None:
    runner(["s3", "cp", str(u.path), f"s3://{bucket}/{u.key}",
            "--content-type", u.content_type, "--cache-control", u.cache_control,
            "--checksum-algorithm", "SHA256", "--only-show-errors"])


def upload_missing(bucket: str, uploads: list[Upload], manifest: dict, runner: Runner = aws) -> None:
    """Upload every file not already correctly in the bucket (ruling D7): a
    key whose checksum, content type and cache-control already match the
    manifest is left alone, so a resumed run only repeats the work an
    earlier attempt did not finish. A key that exists but does not match is
    refused outright -- a half-published version must finish with the exact
    bytes it started with, never quietly different ones. `uploads` must not
    include index.json: see `upload_and_verify`.

    A per-object `aws s3 cp` (rather than one recursive `sync`) is what makes
    the resume/refuse decision per key possible, and content type is not
    uniform across the tree (.json vs .gz) -- the loop costs roughly the
    object count in CLI invocations, a few hundred for the largest molecule
    sets, and that has not been a problem in practice (fix round 1, M4)."""
    by_path = {f["path"]: f for f in manifest["files"]}
    for u in uploads:
        rel = u.key.split("/", 2)[-1]  # strip "molecules/<version>/"
        sha256_hex = by_path[rel]["sha256"]
        head = head_object(bucket, u.key, runner)
        if head is not None:
            if _matches(u, sha256_hex, head):
                continue
            raise RuntimeError(f"{u.key}: already in the bucket but does not match the manifest "
                               f"({head}); refusing to resume over a mismatched partial upload")
        _cp(bucket, u, runner)


def verify_via_s3(bucket: str, uploads: list[Upload], manifest: dict, runner: Runner = aws) -> list[str]:
    """Every uploaded object re-checked against the manifest through S3
    itself (fix round 1, I1/I2) -- not just trusted because `aws s3 cp`
    exited zero -- before index.json makes the version visible to the world.
    `uploads` must not include index.json: it is not uploaded, let alone
    verified, until this passes clean."""
    by_path = {f["path"]: f for f in manifest["files"]}
    problems = []
    for u in uploads:
        rel = u.key.split("/", 2)[-1]
        sha256_hex = by_path[rel]["sha256"]
        head = head_object(bucket, u.key, runner)
        if head is None:
            problems.append(f"{u.key}: missing from the bucket after upload")
        elif not _matches(u, sha256_hex, head):
            problems.append(f"{u.key}: {head} does not match the manifest "
                            f"(expected checksum {expected_checksum_b64(sha256_hex)}, content-type "
                            f"{u.content_type}, cache-control {u.cache_control}, no content-encoding)")
    return problems


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


def _manifest_upload(manifest_path: Path, version: str) -> Upload:
    """molecules/<version>/manifest.json, a copy of the committed manifest
    uploaded alongside the data it describes, ahead of index.json (ruling M5:
    a self-describing bucket, not just a self-describing git repo)."""
    return Upload(manifest_path, f"molecules/{version}/manifest.json", CONTENT_TYPES[".json"])


def _partition(uploads: list[Upload]) -> tuple[list[Upload], Upload]:
    """Every planned upload except index.json, and index.json alone -- the
    published marker, always last (ruling D7/I2)."""
    data = [u for u in uploads if not u.key.endswith("/index.json")]
    matches_index = [u for u in uploads if u.key.endswith("/index.json")]
    if len(matches_index) != 1:
        raise ValueError(f"expected exactly one index.json upload, found {len(matches_index)}")
    return data, matches_index[0]


def _with_manifest_entry(manifest: dict, manifest_path: Path) -> dict:
    """`manifest`, plus an entry for its own copy at manifest.json, so
    `upload_missing`/`verify_via_s3` treat it exactly like any other file
    instead of needing a special case."""
    manifest_bytes = manifest_path.read_bytes()
    entry = {"path": "manifest.json", "bytes": len(manifest_bytes), "sha256": hashlib.sha256(manifest_bytes).hexdigest()}
    return {**manifest, "files": [*manifest["files"], entry]}


def _planned_order(root: Path, manifest_path: Path, version: str) -> list[Upload]:
    """Every object this version will ever have, in the order it is written
    in a real publish: data files and the manifest copy (order among
    themselves does not matter -- `upload_missing` checks each
    independently), then index.json last."""
    data_uploads, index_upload = _partition(plan_uploads(root, version))
    return [*data_uploads, _manifest_upload(manifest_path, version), index_upload]


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("version", help='e.g. "v1", matching tools/molecules/version.py\'s DATA_VERSION')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true",
                       help="print the planned S3 keys in publish order, after checking the local tree "
                            "against the committed manifest; makes no AWS calls")
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
        # A domain refusal (dirty/mixed provenance, a manifest that does not
        # match the tree, over budget, already published, a mismatched
        # partial upload) is a clear message, not a traceback -- this is a
        # CLI run by a person, not library code.
        print(error, file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        # An AWS CLI call failed somewhere it was not expected to (head_object
        # treats its own failures as "missing" and never lets them reach
        # here): print the CLI's own explanation, which a bare
        # CalledProcessError's str() omits (fix round 1, M4).
        sys.stderr.write(error.stderr or str(error))
        if error.stderr and not error.stderr.endswith("\n"):
            sys.stderr.write("\n")
        return 1


def _dispatch(args: argparse.Namespace, root: Path, manifest_path: Path) -> int:
    if args.dry_run:
        if not root.exists():
            print(f"{root} does not exist; run generate.py first", file=sys.stderr)
            return 1
        if not manifest_path.exists():
            print(f"{manifest_path} does not exist; run --manifest-only first", file=sys.stderr)
            return 1
        manifest = json.loads(manifest_path.read_text())
        validate_against_manifest(root, manifest)
        for u in _planned_order(root, manifest_path, args.version):
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
    #
    # Resolve where to publish, and how to check it, before any write
    # (fix round 1, I2).
    bucket = bucket_name()
    base_url = distribution_url()

    if not manifest_path.exists():
        print(f"{manifest_path} does not exist; run --manifest-only first and review it", file=sys.stderr)
        return 1
    if not root.exists():
        print(f"{root} does not exist; run generate.py first", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text())
    if over := over_budget(root):
        print(f"over the 3 MB budget: {', '.join(over)}", file=sys.stderr)
        return 1
    validate_against_manifest(root, manifest)

    data_uploads, index_upload = _partition(plan_uploads(root, args.version))
    manifest_upload = _manifest_upload(manifest_path, args.version)
    pre_index = [*data_uploads, manifest_upload]
    full_manifest = _with_manifest_entry(manifest, manifest_path)

    ensure_unpublished(bucket, args.version)
    upload_missing(bucket, pre_index, full_manifest)
    problems = verify_via_s3(bucket, pre_index, full_manifest)
    if problems:
        print("\n".join(problems), file=sys.stderr)
        print("not publishing index.json: the bucket does not yet verify against the manifest; "
              "rerun to resume", file=sys.stderr)
        return 1

    _cp(bucket, index_upload, aws)
    cloudfront_problems = verify(base_url, args.version, manifest)
    print("\n".join(cloudfront_problems) or f"published {len(pre_index) + 1} files as {args.version}")
    return 1 if cloudfront_problems else 0


if __name__ == "__main__":
    sys.exit(main())
