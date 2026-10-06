"""Once a day, AWS's own figure for the month (spec §11): Cost Explorer,
filtered to this app's compute by its cost-allocation tags. It lags the
meter by about a day and is the check that prices.py still matches the bill.
Each call costs $0.01, so one per day."""
from datetime import date, timedelta

from jobs.model import iso, utc_now

TAG_FILTER = {'And': [{'Tags': {'Key': 'app', 'Values': ['electron-orbital-viewer'], 'MatchOptions': ['EQUALS']}},
                      {'Tags': {'Key': 'component', 'Values': ['compute'], 'MatchOptions': ['EQUALS']}}]}


def period(today: date) -> tuple[str, date, date]:
    """(month, start, end-exclusive). On the 1st the current month has no
    complete day yet, so the run closes the previous month instead."""
    if today.day == 1:
        start = (today - timedelta(days=1)).replace(day=1)
        return start.strftime('%Y-%m'), start, today
    start = today.replace(day=1)
    return start.strftime('%Y-%m'), start, today


def run_billing(store, ce, today: date | None = None, now=utc_now) -> dict:
    today = today or now().date()
    month, start, end = period(today)
    result = ce.get_cost_and_usage(TimePeriod={'Start': start.isoformat(), 'End': end.isoformat()},
                                   Granularity='MONTHLY', Metrics=['UnblendedCost'], Filter=TAG_FILTER)
    usd = sum(float(r['Total']['UnblendedCost']['Amount']) for r in result['ResultsByTime'])
    value = {'usd': round(usd, 6), 'through': (end - timedelta(days=1)).isoformat(), 'retrievedAt': iso(now())}
    store.put_billing(month, value)
    return {'month': month, **value}
