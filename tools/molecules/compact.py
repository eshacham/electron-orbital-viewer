"""Float32 grids as the client reads them: little-endian, C order, gzip with a zero mtime so builds reproduce byte for byte."""
import gzip
from pathlib import Path

import numpy as np


def compact_float32(values, mantissa_bits=10, floor=0.0):
    """
    Rounds each value to `mantissa_bits` of mantissa (relative error at most
    2^-(bits+1)) and flushes |v| < floor to zero. The dropped low bits are
    what gzip cannot compress; keeping them roughly doubles every file for
    precision far below what marching cubes or a colour map can show.
    """
    out = np.array(values, dtype=np.float32, copy=True).ravel()
    if floor > 0:
        out[np.abs(out) < floor] = 0.0
    drop = 23 - mantissa_bits
    bits = out.view(np.uint32)
    bits += np.uint32(1 << (drop - 1))
    bits &= np.uint32((0xFFFFFFFF << drop) & 0xFFFFFFFF)
    return out.reshape(np.shape(values))


def write_float32_gz(path, values):
    data = np.ascontiguousarray(values, dtype='<f4').tobytes()
    with open(path, 'wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, compresslevel=9, mtime=0) as gz:
        gz.write(data)


def read_float32_gz(path):
    return np.frombuffer(gzip.decompress(Path(path).read_bytes()), dtype='<f4')
