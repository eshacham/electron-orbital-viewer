"""What a Fargate second costs (spec §7.5), us-east-1, Linux/ARM64.

The meter charges these; the daily Cost Explorer figure (Phase 6B-3) is the
check that they still match the bill. Spot prices move: if AWS's figure
drifts from the meter's, update this table and RETRIEVED together.
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


def billed_seconds(seconds: float) -> int:
    return max(BILLING_MINIMUM_SECONDS, math.ceil(seconds))


def cost_micros(capacity: str, vcpu: int, memory_gb: float, seconds: float) -> int:
    p = PRICES[capacity]
    dollars = seconds / 3600 * (vcpu * p['vcpuHour'] + memory_gb * p['gbHour'])
    return math.ceil(round(dollars * 1_000_000, 6))     # round first so 93240.0000001 is not 93241
