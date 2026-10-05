import gzip
from pathlib import Path

import numpy as np
import pytest
from pyscf import dft, gto

from compact import compact_float32, read_float32_gz, write_float32_gz
from density import check_density, eval_density, total_dm, voxel_averaged_density
from grid import GridSpec, grid_for

FIXTURE = Path(__file__).resolve().parents[3] / 'tests' / 'fixtures' / 'molecules' / 'axis_order.bin.gz'


def test_grid_is_a_centred_cube_z_fastest():
    grid = GridSpec(5, 2.0)
    assert grid.shape == (5, 5, 5) and grid.origin == (-2.0, -2.0, -2.0) and grid.spacing == pytest.approx(1.0)
    coords = grid.coords()
    assert np.allclose(coords[0], [-2, -2, -2]) and np.allclose(coords[1], [-2, -2, -1]) and np.allclose(coords[5], [-2, -1, -2])


def test_grid_for_adds_the_margin_to_the_furthest_coordinate():
    grid = grid_for(np.array([[0.0, 0.0, 0.0], [0.0, -3.0, 1.0]]), 96)
    assert grid.half_width == pytest.approx(8.0) and grid.as_meta()['shape'] == [96, 96, 96]


def test_axis_order_fixture_matches_c_order():
    """The fixture tests/molecules/binary.test.ts reads: value at (i, j, k) is 100 i + 10 j + k."""
    i, j, k = np.meshgrid(range(2), range(3), range(4), indexing='ij')
    assert np.array_equal(read_float32_gz(FIXTURE), (100 * i + 10 * j + k).astype(np.float32).ravel())


def test_compaction_error_floor_and_size(tmp_path):
    rng = np.random.default_rng(1)
    values = np.exp(-rng.uniform(0, 20, 50_000)).astype(np.float32)
    compact = compact_float32(values, mantissa_bits=10, floor=1e-7)
    kept = values >= 1e-7
    assert np.all(compact[~kept] == 0)
    assert np.max(np.abs(compact[kept] / values[kept] - 1)) <= 2 ** -11
    write_float32_gz(tmp_path / 'raw.gz', values)
    write_float32_gz(tmp_path / 'c.gz', compact)
    assert (tmp_path / 'c.gz').stat().st_size < 0.7 * (tmp_path / 'raw.gz').stat().st_size


def test_gz_is_reproducible(tmp_path):
    write_float32_gz(tmp_path / 'a.gz', np.arange(10))
    write_float32_gz(tmp_path / 'b.gz', np.arange(10))
    assert (tmp_path / 'a.gz').read_bytes() == (tmp_path / 'b.gz').read_bytes()
    assert gzip.decompress((tmp_path / 'a.gz').read_bytes())[:4] == np.float32(0).tobytes()


def test_voxel_averaging_integrates_a_cusp_that_point_sampling_cannot():
    # D12: Ne at the origin, grid with a node at the nucleus, is the case
    # where point sampling actually fails (off-node placement under-samples
    # the cusp by only ~1%, which doesn't clear the 5% assertion below).
    mol = gto.M(atom=[('Ne', (0.0, 0.0, 0.0))], unit='Bohr', basis='def2-SVP', verbose=0)
    mf = dft.RKS(mol)
    mf.xc = 'B3LYP'
    mf.kernel()
    dm = total_dm(mf)
    grid = GridSpec(41, 4.0)
    averaged = voxel_averaged_density(mol, dm, grid).sum() * grid.spacing ** 3
    pointwise = eval_density(mol, dm, grid.coords()).sum() * grid.spacing ** 3
    assert abs(averaged - 10) / 10 < 0.005
    assert abs(pointwise - 10) / 10 > 0.05


def test_check_density_raises_on_density_well_below_the_floor():
    rho = np.array([0.0, 1.0, 2.0, -0.5])
    with pytest.raises(ValueError):
        check_density(rho)


def test_check_density_allows_numerical_noise_at_the_floor():
    rho = np.array([0.0, 1.0, 2.0, -1e-7])
    check_density(rho)
