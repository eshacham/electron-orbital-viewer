"""Lengths and angles off Cartesian coordinates, the one place the pipeline and its tests measure geometry."""
import numpy as np

BOHR_TO_ANGSTROM = 0.529177210903


def distance(p, q):
    return float(np.linalg.norm(np.subtract(p, q)))


def angle(p, vertex, q):
    u, v = np.subtract(p, vertex), np.subtract(q, vertex)
    c = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v))
    return float(np.degrees(np.arccos(np.clip(c, -1.0, 1.0))))


def dihedral(a, b, c, d):
    b0, b1, b2 = np.subtract(a, b), np.subtract(c, b), np.subtract(d, c)
    b1 = b1 / np.linalg.norm(b1)
    v = b0 - np.dot(b0, b1) * b1
    w = b2 - np.dot(b2, b1) * b1
    return float(np.degrees(np.arctan2(np.dot(np.cross(b1, v), w), np.dot(v, w))))


def angular_difference(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def measure(ref, coords):
    """The value of a bond, angle or dihedral Reference on these coordinates (Å)."""
    points = [coords[i] for i in ref.atoms]
    if ref.quantity == 'bond':
        return distance(*points)
    if ref.quantity == 'angle':
        return angle(*points)
    if ref.quantity == 'dihedral':
        return dihedral(*points)
    raise ValueError(f'{ref.quantity} is not a geometric quantity')
