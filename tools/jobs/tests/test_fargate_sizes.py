"""Every worker size is one Fargate can run (AWS Batch API reference,
ResourceRequirement, retrieved 2026-10-05), and the Spot ruling of Phase
6B-3 Task 1 is recorded in sizing."""
from jobs import sizing

# vCPU → the Fargate memory values (MiB) Batch accepts with it.
FARGATE_MEMORY_MIB = {
    2: set(range(4096, 16384 + 1, 1024)),
    4: set(range(8192, 30720 + 1, 1024)),
    8: set(range(16384, 61440 + 1, 4096)),
    16: set(range(32768, 122880 + 1, 8192)),
    32: {61440, 122880, 249856},
}


def test_every_size_is_a_fargate_size():
    for size in sizing.SIZES:
        assert size.memory_gb * 1024 in FARGATE_MEMORY_MIB[size.vcpu], size


def test_spot_ruling_is_recorded():
    assert sizing.SPOT_AVAILABLE is True
