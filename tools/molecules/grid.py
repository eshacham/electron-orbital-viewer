"""The sampling box: a cube centred on PySCF's origin, which is what Phase 1's grid sources require."""
from dataclasses import dataclass

import numpy as np

# The ρ = 0.001 surface lies 2.5-3.5 a0 beyond the nuclei; 5 a0 keeps it clear
# of the walls with room for the tail the integral needs.
SURFACE_MARGIN_BOHR = 5.0


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
