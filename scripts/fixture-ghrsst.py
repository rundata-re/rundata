#!/usr/bin/env python3
"""Reduces a NetCDF-4 file of NOAA's GHRSST products (ACSPO VIIRS L3U, ACSPO L3S-LEO) to La Réunion, for the tests.

  python3 scripts/fixture-ghrsst.py <file.nc> <out.nc> <variable>...

The variables named keep their type, their global grid (9000 x 18000 at 0.02 deg), their chunks and their filters
(shuffle, then deflate twice, as NOAA writes them), but only the island's box is written: the chunk that holds it, the
rest at the fill value, compresses to a few kB. The file is written as NOAA's are read by src/hdf5.ts: superblock v0,
chunk index in version 1 B-trees, version 2 object headers (attribute creation order tracked), and the root group's
links in a fractal heap (creation order tracked, more than 8 links: small datasets named as NOAA's others fill it up).
Needs h5py and numpy.
"""
import sys

import h5py
import numpy as np

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
# The island with 0.1 deg around it (src/providers/viirs.ts, src/providers/acspo.ts).
r0, r1 = int(round((89.99 + 20.75) / 0.02)), int(round((89.99 + 21.5) / 0.02)) + 2
c0, c1 = int(round((55.1 + 179.99) / 0.02)), int(round((56.0 + 179.99) / 0.02)) + 2
OTHERS = ["time", "lat", "lon", "crs", "l2p_flags", "dt_analysis", "sses_bias", "sses_standard_deviation", "wind_speed"]

fin = h5py.File(src, "r")
fcpl = h5py.h5p.create(h5py.h5p.FILE_CREATE)
fcpl.set_link_creation_order(h5py.h5p.CRT_ORDER_TRACKED | h5py.h5p.CRT_ORDER_INDEXED)
fcpl.set_attr_creation_order(h5py.h5p.CRT_ORDER_TRACKED | h5py.h5p.CRT_ORDER_INDEXED)
fapl = h5py.h5p.create(h5py.h5p.FILE_ACCESS)
fapl.set_libver_bounds(h5py.h5f.LIBVER_EARLIEST, h5py.h5f.LIBVER_LATEST)
fid = h5py.h5f.create(out.encode(), h5py.h5f.ACC_TRUNC, fcpl=fcpl, fapl=fapl)
for name in names:
    d = fin[name]
    fill = d.attrs["_FillValue"]
    dcpl = h5py.h5p.create(h5py.h5p.DATASET_CREATE)
    dcpl.set_attr_creation_order(h5py.h5p.CRT_ORDER_TRACKED | h5py.h5p.CRT_ORDER_INDEXED)
    dcpl.set_chunk(d.chunks)
    dcpl.set_shuffle()
    dcpl.set_deflate(1)
    dcpl.set_deflate(1)
    dcpl.set_fill_value(np.array(fill, dtype=d.dtype))
    space = h5py.h5s.create_simple(d.shape)
    ds = h5py.h5d.create(fid, name.encode(), h5py.h5t.py_create(d.dtype), space, dcpl=dcpl)
    box = np.ascontiguousarray(d[0:1, r0:r1, c0:c1])
    sel = h5py.h5s.create_simple(d.shape)
    sel.select_hyperslab((0, r0, c0), box.shape)
    ds.write(h5py.h5s.create_simple(box.shape), sel, box)
for name in OTHERS:
    if name not in names:
        h5py.h5d.create(fid, name.encode(), h5py.h5t.NATIVE_INT32, h5py.h5s.create_simple((1,)))
fid.close()
