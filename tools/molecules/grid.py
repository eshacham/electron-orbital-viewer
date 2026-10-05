"""The sampling box: a cube centred on PySCF's origin, which is what Phase 1's grid sources require."""
from dataclasses import dataclass

import numpy as np

# The ρ = 0.001 surface lies 2.5-3.5 a0 beyond the nuclei; 5 a0 would keep it
# clear of the walls with room for the tail the integral needs, but the
# library's properties basis (B3LYP/def2-TZVPD -- ruling T7-TZVPD) adds
# diffuse functions whose longer tail pushes the face density above
# check_box's limit at 5 a0 (measured: up to 4.7e-5 at the face, HCN worst).
# A3 probe (task-7-report.md) found 6.5 a0 is the smallest margin, in
# 0.5 a0 steps from 5.0, that keeps every library molecule's face density
# below half of FACE_DENSITY_LIMIT (headroom), so bumped here.
SURFACE_MARGIN_BOHR = 6.5


@dataclass(frozen=True)
class GridSpec:
    points: int
    half_width: float

    @property
    def shape(self):
        return (self.points,) * 3

    @property
    def origin(self):
        return (-self.half_width,) * 3

    @property
    def spacing(self):
        return 2 * self.half_width / (self.points - 1)

    def axis(self):
        return np.linspace(-self.half_width, self.half_width, self.points)

    def coords(self):
        ax = self.axis()
        return np.stack(np.meshgrid(ax, ax, ax, indexing='ij'), -1).reshape(-1, 3)

    def as_meta(self):
        return {'shape': list(self.shape), 'origin': list(self.origin), 'spacing': self.spacing}


def grid_for(coords_bohr, points, margin=SURFACE_MARGIN_BOHR):
    return GridSpec(points, float(np.abs(np.asarray(coords_bohr)).max()) + margin)
