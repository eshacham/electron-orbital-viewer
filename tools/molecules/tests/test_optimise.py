import os

import pytest

import optimise
from library import OPTIMISED, LibraryMolecule, bent, by_id
from measure import angle, distance


def test_xyz_round_trip(tmp_path):
    atoms = [('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.757, 0.587))]
    optimise.write_xyz(tmp_path / 'w.xyz', atoms, 'converged=true maxGradient=1.000e-05 method=B3LYP/def2-TZVP')
    back, comment = optimise.read_xyz(tmp_path / 'w.xyz')
    assert back == atoms and comment.startswith('converged=true')


def test_experimental_geometry_is_the_catalogue_one():
    atoms, info = optimise.geometry_for(by_id('h2o'))
    assert atoms == list(by_id('h2o').atoms) and info == {}


def test_refuses_missing_unconverged_or_wrong_basis(tmp_path, monkeypatch):
    monkeypatch.setattr(optimise, 'GEOMETRY_DIR', tmp_path)
    entry = by_id('glycine')
    with pytest.raises(FileNotFoundError, match='optimise.py glycine'):
        optimise.geometry_for(entry)
    atoms = [('N', (0.0, 0.0, 0.0))]
    optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, 'converged=false maxGradient=3.000e-03 method=B3LYP/def2-TZVP')
    with pytest.raises(RuntimeError, match='not converged'):
        optimise.geometry_for(entry)
    optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, 'converged=true maxGradient=1.000e-05 method=B3LYP/def2-SVP')
    with pytest.raises(RuntimeError, match='def2-TZVP'):
        optimise.geometry_for(entry)


@pytest.mark.skipif(not os.environ.get('MOLECULES_SLOW'), reason='runs a real optimisation (~1 min)')
def test_optimises_a_distorted_water(tmp_path, monkeypatch):
    monkeypatch.setattr(optimise, 'GEOMETRY_DIR', tmp_path)
    entry = LibraryMolecule('w', 'w', 'H2O', 'polarity', (), OPTIMISED, bent('O', 'H', 1.02, 112.0))
    result = optimise.optimise_steps(entry, maxsteps=40, basis='def2-SVP')
    assert result['converged'] and result['maxGradient'] < optimise.GRADIENT_TOLERANCE
    coords = [xyz for _, xyz in optimise.read_xyz(tmp_path / 'w.xyz')[0]]
    assert 0.955 < distance(coords[0], coords[1]) < 0.975
    assert 100.0 < angle(coords[1], coords[0], coords[2]) < 106.0
