from datetime import date, datetime, timezone

from jobs.billing import TAG_FILTER, period, run_billing
from jobs.store import FileStore


class FakeCe:
    def __init__(self, amount='0.1234567'):
        self.amount, self.calls = amount, []

    def get_cost_and_usage(self, **kwargs):
        self.calls.append(kwargs)
        return {'ResultsByTime': [{'Total': {'UnblendedCost': {'Amount': self.amount, 'Unit': 'USD'}}}]}


def test_period():
    assert period(date(2026, 10, 5)) == ('2026-10', date(2026, 10, 1), date(2026, 10, 5))
    assert period(date(2026, 10, 1)) == ('2026-09', date(2026, 9, 1), date(2026, 10, 1))


def test_run_billing_filters_by_both_tags_and_stores_the_figure(tmp_path):
    store, ce = FileStore(tmp_path), FakeCe()
    now = datetime(2026, 10, 5, 6, 0, tzinfo=timezone.utc)
    result = run_billing(store, ce, now=lambda: now)
    call = ce.calls[0]
    assert call['TimePeriod'] == {'Start': '2026-10-01', 'End': '2026-10-05'} and call['Filter'] == TAG_FILTER
    assert {t['Tags']['Key'] for t in TAG_FILTER['And']} == {'app', 'component'}
    assert store.get_billing('2026-10') == {'usd': 0.123457, 'through': '2026-10-04', 'retrievedAt': '2026-10-05T06:00:00Z'}
    assert result['month'] == '2026-10'
