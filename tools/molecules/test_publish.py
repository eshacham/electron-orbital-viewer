import base64
import hashlib
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
    as generate.py actually writes it (needed by resolve_generator and
    validate_against_manifest)."""
    make_tree(root)
    meta = json.loads((root / "n2" / "meta.json").read_text())
    meta["generator"] = {"commit": commit, "pyscf": pyscf}
    (root / "n2" / "meta.json").write_text(json.dumps(meta))


def make_tree_and_manifest(tmp_path: Path, *, commit="deadbeef", pyscf="2.8.0") -> tuple[Path, Path, dict]:
    """A generated out/v1 tree plus its committed manifest, written under a
    fresh tmp_path laid out like the real repo (out/<v> and manifest/<v>.json
    both under `tmp_path`, so `monkeypatch.setattr(publish, "HERE", tmp_path)`
    makes every HERE-relative path resolve into it)."""
    out = tmp_path / "out" / "v1"
    make_generated_tree(out, commit=commit, pyscf=pyscf)
    manifest = publish.build_manifest(out, "v1", pyscf=pyscf, commit=commit)
    manifest_dir = tmp_path / "manifest"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "v1.json"
    manifest_path.write_text(json.dumps(manifest))
    return out, manifest_path, manifest


def upload_for(root: Path, rel: str, content_type: str = "application/json") -> publish.Upload:
    return publish.Upload(root / rel, f"molecules/v1/{rel}", content_type)


# --- plan_uploads / build_manifest / over_budget / ensure_unpublished -- unchanged by fix round 1 -------


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


# --- resolve_generator -------------------------------------------------------------------------------


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


# --- validate_against_manifest (fix round 1, I1) ----------------------------------------------------


def test_validate_against_manifest_passes_for_a_matching_tree(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    publish.validate_against_manifest(out, manifest)  # must not raise


def test_validate_against_manifest_catches_a_file_missing_from_disk(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    (out / "n2" / "density.bin.gz").unlink()
    with pytest.raises(ValueError, match="not on disk"):
        publish.validate_against_manifest(out, manifest)


def test_validate_against_manifest_catches_a_file_missing_from_the_manifest(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    (out / "n2" / "extra.json").write_text("{}")
    with pytest.raises(ValueError, match="not in the manifest"):
        publish.validate_against_manifest(out, manifest)


def test_validate_against_manifest_catches_a_changed_file(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    (out / "n2" / "density.bin.gz").write_bytes(b"\x1f\x8b changed")
    with pytest.raises(ValueError, match="does not match the manifest"):
        publish.validate_against_manifest(out, manifest)


def test_validate_against_manifest_catches_drifted_provenance(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path, commit="deadbeef")
    manifest = {**manifest, "generatedBy": {"commit": "somethingelse", "pyscf": "2.8.0"}}
    with pytest.raises(ValueError, match="generator provenance"):
        publish.validate_against_manifest(out, manifest)


# --- checksum plumbing -------------------------------------------------------------------------------


def test_expected_checksum_b64_is_base64_of_the_raw_digest():
    digest_hex = hashlib.sha256(b"abc").hexdigest()
    assert publish.expected_checksum_b64(digest_hex) == base64.b64encode(hashlib.sha256(b"abc").digest()).decode()


def test_head_object_returns_none_for_a_missing_key():
    def runner(args):
        raise subprocess.CalledProcessError(254, args, "", "Not Found")

    assert publish.head_object("bucket", "molecules/v1/x.json", runner) is None


def test_head_object_parses_the_queried_fields():
    def runner(args):
        assert "--checksum-mode" in args and args[args.index("--checksum-mode") + 1] == "ENABLED"
        return json.dumps({"checksum": "abc=", "contentType": "application/json",
                           "cacheControl": "public", "contentEncoding": None})

    assert publish.head_object("bucket", "k", runner) == {
        "checksum": "abc=", "contentType": "application/json", "cacheControl": "public", "contentEncoding": None,
    }


# --- upload_missing / verify_via_s3 (fix round 1, I1/I2) --------------------------------------------


def test_upload_missing_skips_an_exactly_matching_key(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    by_path = {f["path"]: f for f in manifest["files"]}
    u = upload_for(out, "n2/meta.json")
    expected = publish.expected_checksum_b64(by_path["n2/meta.json"]["sha256"])

    def runner(args):
        if args[0] == "s3api":
            return json.dumps({"checksum": expected, "contentType": u.content_type,
                               "cacheControl": u.cache_control, "contentEncoding": None})
        raise AssertionError("should not upload a key that already matches")

    publish.upload_missing("bucket", [u], manifest, runner)


def test_upload_missing_refuses_a_checksum_mismatch(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    u = upload_for(out, "n2/meta.json")

    def runner(args):
        if args[0] == "s3api":
            return json.dumps({"checksum": "wrong==", "contentType": u.content_type,
                               "cacheControl": u.cache_control, "contentEncoding": None})
        raise AssertionError("should refuse before uploading anything")

    with pytest.raises(RuntimeError, match="does not match the manifest"):
        publish.upload_missing("bucket", [u], manifest, runner)


def test_upload_missing_refuses_when_s3_would_decompress_transparently(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    by_path = {f["path"]: f for f in manifest["files"]}
    u = upload_for(out, "n2/meta.json")
    expected = publish.expected_checksum_b64(by_path["n2/meta.json"]["sha256"])

    def runner(args):
        if args[0] == "s3api":
            return json.dumps({"checksum": expected, "contentType": u.content_type,
                               "cacheControl": u.cache_control, "contentEncoding": "gzip"})
        raise AssertionError("should refuse before uploading anything")

    with pytest.raises(RuntimeError):
        publish.upload_missing("bucket", [u], manifest, runner)


def test_upload_missing_sends_the_checksum_algorithm_flag_for_a_new_key(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    u = upload_for(out, "n2/meta.json")
    sent = []

    def runner(args):
        if args[0] == "s3api":
            raise subprocess.CalledProcessError(254, args, "", "Not Found")
        sent.append(args)
        return ""

    publish.upload_missing("bucket", [u], manifest, runner)
    (cp_args,) = sent
    assert cp_args[cp_args.index("--checksum-algorithm") + 1] == "SHA256"
    assert cp_args[cp_args.index("--content-type") + 1] == u.content_type
    assert cp_args[cp_args.index("--cache-control") + 1] == u.cache_control


def test_verify_via_s3_reports_a_missing_object(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    u = upload_for(out, "n2/meta.json")

    def runner(args):
        raise subprocess.CalledProcessError(254, args, "", "Not Found")

    problems = publish.verify_via_s3("bucket", [u], manifest, runner)
    assert len(problems) == 1 and "missing" in problems[0]


def test_verify_via_s3_passes_for_a_matching_object(tmp_path):
    out, _, manifest = make_tree_and_manifest(tmp_path)
    by_path = {f["path"]: f for f in manifest["files"]}
    u = upload_for(out, "n2/meta.json")
    expected = publish.expected_checksum_b64(by_path["n2/meta.json"]["sha256"])

    def runner(args):
        return json.dumps({"checksum": expected, "contentType": u.content_type,
                           "cacheControl": u.cache_control, "contentEncoding": None})

    assert publish.verify_via_s3("bucket", [u], manifest, runner) == []


# --- ordering helpers: _partition / _manifest_upload / _with_manifest_entry / _planned_order --------


def test_partition_puts_index_json_aside(tmp_path):
    make_tree(tmp_path)
    uploads = publish.plan_uploads(tmp_path, "v1")
    data, index_upload = publish._partition(uploads)
    assert index_upload.key == "molecules/v1/index.json"
    assert all(u.key != "molecules/v1/index.json" for u in data)
    assert len(data) == len(uploads) - 1


def test_partition_requires_exactly_one_index_json(tmp_path):
    make_tree(tmp_path)
    (tmp_path / "index.json").unlink()
    uploads = publish.plan_uploads(tmp_path, "v1")
    with pytest.raises(ValueError, match="exactly one index.json"):
        publish._partition(uploads)


def test_manifest_upload_targets_manifest_json_alongside_the_version(tmp_path):
    u = publish._manifest_upload(tmp_path / "manifest" / "v1.json", "v1")
    assert u.key == "molecules/v1/manifest.json"
    assert u.content_type == "application/json"


def test_with_manifest_entry_adds_the_manifests_own_hash(tmp_path):
    out, manifest_path, manifest = make_tree_and_manifest(tmp_path)
    augmented = publish._with_manifest_entry(manifest, manifest_path)
    entry = next(f for f in augmented["files"] if f["path"] == "manifest.json")
    assert entry["sha256"] == hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    assert entry["bytes"] == manifest_path.stat().st_size
    assert len(augmented["files"]) == len(manifest["files"]) + 1


def test_planned_order_ends_with_manifest_json_then_index_json(tmp_path):
    out, manifest_path, _ = make_tree_and_manifest(tmp_path)
    order = publish._planned_order(out, manifest_path, "v1")
    assert order[-1].key == "molecules/v1/index.json"
    assert order[-2].key == "molecules/v1/manifest.json"


# --- CloudFront-level verify() -- unchanged by fix round 1 ------------------------------------------


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


# --- main(): --dry-run / --manifest-only never touch aws (ruling C2) --------------------------------


def test_dry_run_and_manifest_only_never_touch_aws(tmp_path, monkeypatch, capsys):
    def forbidden_aws(args):
        raise AssertionError(f"must not call aws: {args}")

    def forbidden(*args, **kwargs):
        raise AssertionError("must not resolve the bucket or CloudFront domain for dry-run or manifest-only")

    monkeypatch.setattr(publish, "aws", forbidden_aws)
    monkeypatch.setattr(publish, "bucket_name", forbidden)
    monkeypatch.setattr(publish, "distribution_url", forbidden)
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef")

    assert publish.main(["v1", "--manifest-only"]) == 0
    manifest = json.loads((tmp_path / "manifest" / "v1.json").read_text())
    assert manifest["generatedBy"] == {"commit": "deadbeef", "pyscf": "2.8.0"}

    assert publish.main(["v1", "--dry-run"]) == 0  # now requires and validates against the manifest (I1)
    capsys.readouterr()


def test_manifest_only_refuses_a_dirty_tree(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef-dirty")
    assert publish.main(["v1", "--manifest-only"]) == 1
    assert not (tmp_path / "manifest" / "v1.json").exists()


def test_dry_run_requires_a_manifest(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef")
    assert publish.main(["v1", "--dry-run"]) == 1
    assert "manifest-only" in capsys.readouterr().err


def test_dry_run_refuses_when_the_tree_has_drifted_from_the_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    out, manifest_path, _ = make_tree_and_manifest(tmp_path, commit="deadbeef")
    (out / "n2" / "density.bin.gz").write_bytes(b"\x1f\x8b changed-after-the-manifest-was-cut")
    assert publish.main(["v1", "--dry-run"]) == 1


def test_dry_run_prints_the_plan_in_publish_order(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_tree_and_manifest(tmp_path, commit="deadbeef")
    assert publish.main(["v1", "--dry-run"]) == 0
    lines = capsys.readouterr().out.strip().splitlines()
    assert lines[-1].split()[0] == "molecules/v1/index.json"
    assert lines[-2].split()[0] == "molecules/v1/manifest.json"


# --- main(): the real-publish path's order and guards (fix round 1, I2) -----------------------------


def test_real_publish_resolves_bucket_and_url_before_checking_the_manifest_exists(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    resolved = []
    monkeypatch.setattr(publish, "bucket_name", lambda: resolved.append("bucket") or "bucket")
    monkeypatch.setattr(publish, "distribution_url", lambda: resolved.append("url") or "https://cdn.example")

    def forbidden(*args, **kwargs):
        raise AssertionError("must not touch the bucket before a manifest exists to publish")

    monkeypatch.setattr(publish, "ensure_unpublished", forbidden)
    monkeypatch.setattr(publish, "upload_missing", forbidden)
    make_generated_tree(tmp_path / "out" / "v1", commit="deadbeef")  # no manifest written

    assert publish.main(["v1"]) == 1
    assert resolved == ["bucket", "url"]  # both were resolved even though publishing then stopped


def test_real_publish_order_guard_data_verify_manifest_index_cloudfront(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_tree_and_manifest(tmp_path, commit="deadbeef")
    calls = []

    monkeypatch.setattr(publish, "bucket_name", lambda: calls.append(("bucket_name",)) or "bucket")
    monkeypatch.setattr(publish, "distribution_url", lambda: calls.append(("distribution_url",)) or "https://cdn.example")
    monkeypatch.setattr(publish, "ensure_unpublished",
                        lambda bucket, version: calls.append(("ensure_unpublished", bucket, version)))

    def fake_upload_missing(bucket, uploads, manifest):
        calls.append(("upload_missing", bucket, sorted(u.key for u in uploads)))

    def fake_verify_via_s3(bucket, uploads, manifest):
        calls.append(("verify_via_s3", bucket, sorted(u.key for u in uploads)))
        return []

    def fake_cp(bucket, u, runner):
        calls.append(("cp", bucket, u.key))

    def fake_verify(base_url, version, manifest):
        calls.append(("cloudfront_verify", base_url, version))
        return []

    monkeypatch.setattr(publish, "upload_missing", fake_upload_missing)
    monkeypatch.setattr(publish, "verify_via_s3", fake_verify_via_s3)
    monkeypatch.setattr(publish, "_cp", fake_cp)
    monkeypatch.setattr(publish, "verify", fake_verify)

    assert publish.main(["v1"]) == 0

    names = [c[0] for c in calls]
    assert names == ["bucket_name", "distribution_url", "ensure_unpublished",
                     "upload_missing", "verify_via_s3", "cp", "cloudfront_verify"]

    upload_keys = calls[names.index("upload_missing")][2]
    assert all(not key.endswith("/index.json") for key in upload_keys)
    assert "molecules/v1/manifest.json" in upload_keys  # ruling M5: uploaded before index.json
    assert calls[names.index("cp")][2] == "molecules/v1/index.json"  # the only direct _cp call: the marker


def test_real_publish_does_not_publish_index_json_when_the_s3_verify_pass_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "HERE", tmp_path)
    make_tree_and_manifest(tmp_path, commit="deadbeef")

    monkeypatch.setattr(publish, "bucket_name", lambda: "bucket")
    monkeypatch.setattr(publish, "distribution_url", lambda: "https://cdn.example")
    monkeypatch.setattr(publish, "ensure_unpublished", lambda bucket, version: None)
    monkeypatch.setattr(publish, "upload_missing", lambda bucket, uploads, manifest: None)
    monkeypatch.setattr(publish, "verify_via_s3", lambda bucket, uploads, manifest: ["molecules/v1/n2/meta.json: mismatch"])

    def forbidden(*args, **kwargs):
        raise AssertionError("must not publish index.json over data that failed to verify")

    monkeypatch.setattr(publish, "_cp", forbidden)
    monkeypatch.setattr(publish, "verify", forbidden)

    assert publish.main(["v1"]) == 1


# --- fix round 1, M4: surface the AWS CLI's own error -----------------------------------------------


def test_aws_raises_with_stderr_attached(monkeypatch):
    def fake_run(cmd, check=False, capture_output=False, text=False):
        if check:
            raise subprocess.CalledProcessError(1, cmd, "", "AccessDenied: no\n")
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="AccessDenied: no\n")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(subprocess.CalledProcessError) as excinfo:
        publish.aws(["s3", "ls"])
    assert excinfo.value.stderr == "AccessDenied: no\n"


def test_main_prints_the_aws_cli_error_on_an_unexpected_failure(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(publish, "HERE", tmp_path)

    def boom():
        raise subprocess.CalledProcessError(254, ["aws", "cloudformation", "describe-stacks"], "",
                                            "An error occurred (AccessDenied)\n")

    monkeypatch.setattr(publish, "bucket_name", boom)
    assert publish.main(["v1"]) == 1
    assert "AccessDenied" in capsys.readouterr().err
