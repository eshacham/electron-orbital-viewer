import json
import subprocess
from pathlib import Path

import pytest

import publish


def make_tree(root: Path) -> None:
    (root / "n2").mkdir(parents=True)
    (root / "index.json").write_text('[{"id":"n2"}]')
    (root / "n2" / "meta.json").write_text('{"id":"n2"}')
    (root / "n2" / "density.bin.gz").write_bytes(b"\x1f\x8b fake")


def make_generated_tree(root: Path, *, commit="abc1234", pyscf="2.8.0") -> None:
    """Like make_tree, but with real generator provenance in every meta.json,
    as generate.py actually writes it (needed by resolve_generator)."""
    make_tree(root)
    meta = json.loads((root / "n2" / "meta.json").read_text())
    meta["generator"] = {"commit": commit, "pyscf": pyscf}
    (root / "n2" / "meta.json").write_text(json.dumps(meta))


def test_content_types_and_immutable_cache(tmp_path):
    make_tree(tmp_path)
    uploads = publish.plan_uploads(tmp_path, "v1")
    by_key = {u.key: u for u in uploads}
    assert by_key["molecules/v1/index.json"].content_type == "application/json"
    assert by_key["molecules/v1/n2/density.bin.gz"].content_type == "application/octet-stream"
    assert all(u.cache_control == "public, max-age=31536000, immutable" for u in uploads)


def test_manifest_lists_every_file_with_size_and_hash(tmp_path):
    make_tree(tmp_path)
    manifest = publish.build_manifest(tmp_path, "v1", pyscf="2.8.0", commit="abc1234")
    paths = [f["path"] for f in manifest["files"]]
    assert paths == sorted(["index.json", "n2/meta.json", "n2/density.bin.gz"])
    meta = next(f for f in manifest["files"] if f["path"] == "n2/meta.json")
    assert meta["bytes"] == len('{"id":"n2"}')
    assert len(meta["sha256"]) == 64
    assert manifest["generatedBy"] == {"pyscf": "2.8.0", "commit": "abc1234"}


def test_refuses_to_overwrite_a_published_version():
    calls = []

    def runner(args):
        calls.append(args)
        return '{"KeyCount": 3}'

    try:
        publish.ensure_unpublished("bucket", "v1", runner)
    except publish.AlreadyPublished as error:
        assert "molecules/v1/" in str(error)
    else:
        raise AssertionError("a published version must not be overwritten")


def test_ensure_unpublished_checks_index_json_specifically(tmp_path):
    # D7: "published" means index.json exists at the prefix, not that the
    # prefix merely has objects under it -- a partial upload (every file but
    # index.json) must stay resumable, not get treated as already published.
    queried = {}

    def runner(args):
        queried["prefix"] = args[args.index("--prefix") + 1]
        return '{"KeyCount": 0}'

    publish.ensure_unpublished("bucket", "v1", runner)  # must not raise
    assert queried["prefix"] == "molecules/v1/index.json"


def test_size_budget_per_molecule(tmp_path):
    make_tree(tmp_path)
    (tmp_path / "big").mkdir()
    (tmp_path / "big" / "density.bin.gz").write_bytes(b"x" * (3_145_728 + 1))
    assert publish.over_budget(tmp_path) == ["big"]


def test_files_of_skips_dotfiles(tmp_path):
    make_tree(tmp_path)
    (tmp_path / ".DS_Store").write_bytes(b"junk")
    (tmp_path / "n2" / ".DS_Store").write_bytes(b"junk")
    names = {p.name for p in publish.files_of(tmp_path)}
    assert ".DS_Store" not in names


def test_resolve_generator_returns_the_one_consistent_commit_and_pyscf(tmp_path):
    make_generated_tree(tmp_path, commit="deadbeef", pyscf="2.8.0")
    assert publish.resolve_generator(tmp_path) == {"commit": "deadbeef", "pyscf": "2.8.0"}


def test_resolve_generator_refuses_a_dirty_tree(tmp_path):
    make_generated_tree(tmp_path, commit="deadbeef-dirty")
    with pytest.raises(ValueError, match="dirty"):
        publish.resolve_generator(tmp_path)


def test_resolve_generator_refuses_mixed_commits(tmp_path):
    make_generated_tree(tmp_path, commit="deadbeef")
    (tmp_path / "o2").mkdir()
    other = json.loads((tmp_path / "n2" / "meta.json").read_text())
    other["generator"]["commit"] = "cafef00d"
    (tmp_path / "o2" / "meta.json").write_text(json.dumps(other))
    with pytest.raises(ValueError, match="mixes generator commits"):
        publish.resolve_generator(tmp_path)


def test_resolve_generator_refuses_mixed_pyscf_versions(tmp_path):
    make_generated_tree(tmp_path, commit="deadbeef", pyscf="2.8.0")
    (tmp_path / "o2").mkdir()
    other = json.loads((tmp_path / "n2" / "meta.json").read_text())
    other["generator"]["pyscf"] = "2.7.0"
    (tmp_path / "o2" / "meta.json").write_text(json.dumps(other))
    with pytest.raises(ValueError, match="mixes PySCF versions"):
        publish.resolve_generator(tmp_path)


def test_resolve_generator_refuses_an_empty_tree(tmp_path):
    with pytest.raises(ValueError, match="no meta.json"):
        publish.resolve_generator(tmp_path)


def test_upload_sends_index_json_last_and_skips_a_matching_key(tmp_path):
    make_tree(tmp_path)
    manifest = publish.build_manifest(tmp_path, "v1", pyscf="2.8.0", commit="abc1234")
    uploads = publish.plan_uploads(tmp_path, "v1")
    sent = []

    def runner(args):
        if args[0] == "s3api":  # head-object: nothing is in the bucket yet
            raise subprocess.CalledProcessError(254, args)
        sent.append(args[args.index("cp") + 2])  # the s3://.../key argument
        return ""

    publish.upload("bucket", uploads, manifest, runner)
    assert sent[-1].endswith("/index.json")
    assert set(sent) == {f"s3://bucket/{u.key}" for u in uploads}


def test_upload_skips_a_key_already_in_the_bucket_with_a_matching_size(tmp_path):
    make_tree(tmp_path)
    manifest = publish.build_manifest(tmp_path, "v1", pyscf="2.8.0", commit="abc1234")
    uploads = publish.plan_uploads(tmp_path, "v1")
    expected = {f["path"]: f["bytes"] for f in manifest["files"]}
    sent = []

    def runner(args):
        if args[0] == "s3api":
            key = args[args.index("--key") + 1]
            rel = key.split("/", 2)[-1]
            return str(expected[rel])  # already uploaded, same size
        sent.append(args)
        return ""

    publish.upload("bucket", uploads, manifest, runner)
    assert sent == []  # every key matched; nothing re-uploaded


def test_upload_refuses_a_mismatched_partial_upload(tmp_path):
    make_tree(tmp_path)
    manifest = publish.build_manifest(tmp_path, "v1", pyscf="2.8.0", commit="abc1234")
    uploads = publish.plan_uploads(tmp_path, "v1")

    def runner(args):
        if args[0] == "s3api":
            return "1"  # wrong size for every key
        raise AssertionError("should refuse before uploading anything")

    with pytest.raises(RuntimeError, match="refusing to resume"):
        publish.upload("bucket", uploads, manifest, runner)


def test_verify_reports_every_mismatch_not_just_the_first():
    manifest = {"files": [{"path": "a.json", "bytes": 1}, {"path": "b.json", "bytes": 2}]}

    def fetch(url):
        if url.endswith("a.json"):
            return 99
        raise OSError("404")

    problems = publish.verify("https://cdn.example", "v1", manifest, fetch)
    assert len(problems) == 2
    assert "99 bytes, expected 1" in problems[0]
    assert "404" in problems[1]


def test_verify_passes_when_every_size_matches():
    manifest = {"files": [{"path": "a.json", "bytes": 1}]}
    assert publish.verify("https://cdn.example", "v1", manifest, lambda url: 1) == []


def test_dry_run_and_manifest_only_never_call_aws(tmp_path, monkeypatch, capsys):
    # Ruling C2: these two modes must be usable with no AWS credentials at
    # all. Patch `aws` to blow up if either mode so much as calls it.
    def forbidden(args):
        raise AssertionError(f"must not call aws: {args}")

    monkeypatch.setattr(publish, "aws", forbidden)
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef")

    assert publish.main(["v1", "--dry-run"]) == 0
    assert publish.main(["v1", "--manifest-only"]) == 0
    manifest = json.loads((tmp_path / "manifest" / "v1.json").read_text())
    assert manifest["generatedBy"] == {"commit": "deadbeef", "pyscf": "2.8.0"}
    capsys.readouterr()


def test_manifest_only_refuses_a_dirty_tree(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef-dirty")
    assert publish.main(["v1", "--manifest-only"]) == 1
    assert not (tmp_path / "manifest" / "v1.json").exists()


def test_real_publish_refuses_without_a_reviewed_manifest(tmp_path, monkeypatch):
    def forbidden(args):
        raise AssertionError(f"must not call aws before a manifest exists: {args}")

    monkeypatch.setattr(publish, "aws", forbidden)
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef")
    assert publish.main(["v1"]) == 1
