"""What the app pays AWS (spec §7.5), us-east-1.

Fargate (Linux/ARM64): the meter charges these per second; the daily Cost
Explorer figure (Phase 6B-3) is the check that they still match the bill.
Spot prices move: if AWS's figure drifts from the meter's, update this table
and RETRIEVED together, and bump PRICES_VERSION (every quote names it, so a
quote approved under the old prices is refused as changed, Phase 6C).

Storage and delivery (Phase 6C quotes): a job's result files are kept in
S3 Standard and served through CloudFront. Both are AWS list prices, read
from the AWS Price List API (`aws pricing get-products --region us-east-1`)
on STORAGE_RETRIEVED, and the same as https://aws.amazon.com/s3/pricing/
and https://aws.amazon.com/cloudfront/pricing/ show:
- S3 Standard, US East (N. Virginia), first 50 TB / month: $0.023 per
  GB-month (usage type TimedStorage-ByteHrs, effective 2026-09-01);
- S3 PUT, COPY, POST or LIST requests: $0.005 per 1 000 (Requests-Tier1);
- CloudFront data transfer out to the internet, United States, first 10 TB
  / month: $0.085 per GB (US-DataTransfer-Out-Bytes, effective 2026-10-01);
- CloudFront HTTPS requests, United States: $0.0100 per 10 000
  (US-Requests-Tier2-HTTPS).
AWS bills a "GB" as 2^30 bytes for both. CloudFront's always-free tier
(1 TB out and 10 M requests a month) is NOT subtracted: a quote prices the
job as if the tier were used up, so it never depends on what else ran.
Transfer from S3 to CloudFront is free, so a download is priced at the edge only.
"""
import math

RETRIEVED = '2026-10-04'
PRICES = {
    'on-demand': {'vcpuHour': 0.03238, 'gbHour': 0.00356},
    'spot': {'vcpuHour': 0.01034, 'gbHour': 0.00114},
    'local': {'vcpuHour': 0.0, 'gbHour': 0.0},
}
CAP_MICROS = 8_800_000              # $8.80 of compute; $1.20 of the $10 is kept for fixed costs (spec §6.4)
BILLING_MINIMUM_SECONDS = 60        # Fargate bills per second with a one-minute minimum

# Version 1: the Fargate table above (2026-10-04). Version 2 (Phase 6C quotes): plus storage and delivery.
PRICES_VERSION = 2
STORAGE_RETRIEVED = '2026-10-08'
BYTES_PER_GB = 1024 ** 3
S3_STANDARD_GB_MONTH = 0.023
S3_PUT_REQUEST = 0.005 / 1000
CLOUDFRONT_OUT_GB = 0.085
CLOUDFRONT_HTTPS_REQUEST = 0.0100 / 10000


def billed_seconds(seconds: float) -> int:
    return max(BILLING_MINIMUM_SECONDS, math.ceil(seconds))


def _micros(dollars: float) -> int:
    return math.ceil(round(dollars * 1_000_000, 6))     # round first so 93240.0000001 is not 93241


def cost_micros(capacity: str, vcpu: int, memory_gb: float, seconds: float) -> int:
    p = PRICES[capacity]
    return _micros(seconds / 3600 * (vcpu * p['vcpuHour'] + memory_gb * p['gbHour']))


def storage_micros(stored_bytes: int, months: int, puts: int) -> int:
    """Keeping `stored_bytes` in S3 Standard for `months`, written by `puts` PUT requests."""
    return _micros(stored_bytes / BYTES_PER_GB * S3_STANDARD_GB_MONTH * months + puts * S3_PUT_REQUEST)


def delivery_micros(downloaded_bytes: int, requests: int) -> int:
    """Serving `downloaded_bytes` through CloudFront in `requests` HTTPS requests."""
    return _micros(downloaded_bytes / BYTES_PER_GB * CLOUDFRONT_OUT_GB + requests * CLOUDFRONT_HTTPS_REQUEST)
