"""D7 (preflight): a reclaimed or killed attempt can leave a job's root
half-written (no done.json), which makes every retry fail "already in the
result folder". LocalSink.clear_partial removes exactly the fixed root
names, and only when done.json is absent."""
from jobs.sink import ROOT_RESULT_NAMES, LocalSink

KEY = 'k' * 64


def test_clear_partial_removes_a_half_written_root_so_the_retry_can_write(tmp_path):
    sink = LocalSink(tmp_path)
    sink.put_result(KEY, 'meta.json', b'stale')
    sink.put_result(KEY, 'job.json', b'stale')
    sink.clear_partial(KEY)
    sink.put_result(KEY, 'meta.json', b'fresh')          # would raise FileExistsError if not cleared
    assert (sink.root / KEY / 'meta.json').read_bytes() == b'fresh'
    for name in ROOT_RESULT_NAMES:
        if name != 'meta.json':
            assert not (sink.root / KEY / name).exists()


def test_clear_partial_leaves_a_completed_root_alone(tmp_path):
    sink = LocalSink(tmp_path)
    sink.put_result(KEY, 'meta.json', b'final')
    sink.put_done(KEY, b'{"files": {}}')
    sink.clear_partial(KEY)
    assert (sink.root / KEY / 'meta.json').read_bytes() == b'final'
    assert (sink.root / KEY / 'done.json').read_bytes() == b'{"files": {}}'


def test_clear_partial_is_a_no_op_when_nothing_was_ever_written(tmp_path):
    sink = LocalSink(tmp_path)
    sink.clear_partial(KEY)          # must not raise
    sink.put_result(KEY, 'meta.json', b'first')
    assert (sink.root / KEY / 'meta.json').read_bytes() == b'first'
