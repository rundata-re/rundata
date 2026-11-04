#!/usr/bin/env python3
"""Build scripts/og/courbes-<zone>.svg: the contour lines drawn on the share pictures (scripts/build-og.py), the island's
and the Piton de la Fournaise's every 100 m, with the coast drawn thicker (marketing, track A, 04/11/2026).

Source: IGN, RGE ALTI (Licence Ouverte 2.0), from the Géoplateforme WMS as raw 32-bit floats, on a grid of a few hundred
cells a side: the lines of a picture 1 200 px wide, not of a map. The grid is smoothed twice (mean of the 3×3 cells),
the lines are found by marching squares, joined end to end and simplified to a tenth of a cell. Run by hand when the
framing changes; the SVGs are committed, so that building the pictures downloads nothing.
Usage: python3 -I scripts/build-courbes.py [--dem DIR]   (DIR: <zone>.json grids already downloaded, {"w","h","z"})
"""
import argparse
import array
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WMS = ("https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES"
       "&STYLES=&CRS=EPSG:4326&FORMAT=image/x-bil;bits=32")
ISLAND = json.loads((ROOT / "src/places/island.json").read_text())["bbox"]
# Zone, box (lon0, lat0, lon1, lat1), grid, step between two lines (m).
ZONES = [
    ("ile", ISLAND, 640, 573, 100),
    # The summit (55.7139, -21.2444) a little left of and below the middle; every 100 m too: at 50 m the picture passed 250 KB.
    ("fournaise", (55.60, -21.33, 55.84, -21.15), 560, 450, 100),
]
SEA = -60  # the sea, below the coast, so that the 0 m line follows it
TOLERANCE = 0.1  # cells


def grid(box, w, h):
    lon0, lat0, lon1, lat1 = box
    raw = urllib.request.urlopen(f"{WMS}&BBOX={lat0},{lon0},{lat1},{lon1}&WIDTH={w}&HEIGHT={h}", timeout=180).read()
    z = array.array("f", raw)
    assert len(z) == w * h, (len(z), w * h)
    return [(-1 if v < -1000 else round(v)) for v in z]


def smooth(z, w, h, passes=2):
    z = [SEA if v < 0 else float(v) for v in z]
    for _ in range(passes):
        out = [0.0] * len(z)
        for y in range(h):
            for x in range(w):
                s = c = 0
                for yy in range(max(0, y - 1), min(h, y + 2)):
                    row = yy * w
                    for xx in range(max(0, x - 1), min(w, x + 2)):
                        s += z[row + xx]
                        c += 1
                out[y * w + x] = s / c
        z = out
    return z


# Marching squares: the corners above the level (top left 8, top right 4, bottom right 2, bottom left 1) → the edges joined.
CASES = {1: ["LB"], 2: ["BR"], 3: ["LR"], 4: ["TR"], 5: ["LT", "BR"], 6: ["TB"], 7: ["LT"], 8: ["LT"], 9: ["TB"], 10: ["TR", "LB"],
         11: ["TR"], 12: ["LR"], 13: ["BR"], 14: ["LB"]}


def segments(z, w, h, level):
    """The level's crossing segments, each end named by the cell edge it lies on, with its point."""
    up = [v > level for v in z]
    out = []
    for y in range(h - 1):
        r0, r1 = y * w, (y + 1) * w
        for x in range(w - 1):
            i = up[r0 + x] << 3 | up[r0 + x + 1] << 2 | up[r1 + x + 1] << 1 | up[r1 + x]
            if i == 0 or i == 15:
                continue
            a, b, c, d = z[r0 + x], z[r0 + x + 1], z[r1 + x + 1], z[r1 + x]
            # Only the edges the level crosses: on them the two corners differ, one above and one not.
            edge = {
                "T": lambda: (("h", x, y), (x + (level - a) / (b - a), y)),
                "R": lambda: (("v", x + 1, y), (x + 1, y + (level - b) / (c - b))),
                "B": lambda: (("h", x, y + 1), (x + (level - d) / (c - d), y + 1)),
                "L": lambda: (("v", x, y), (x, y + (level - a) / (d - a))),
            }
            pairs = [(edge[u](), edge[v]()) for u, v in CASES[i]]
            out.extend(pairs)
    return out


def chains(segs):
    """The segments joined end to end into lines: an edge is crossed by at most two segments, one per cell."""
    by_edge = {}
    for n, (p, q) in enumerate(segs):
        by_edge.setdefault(p[0], []).append(n)
        by_edge.setdefault(q[0], []).append(n)
    used = [False] * len(segs)
    lines = []
    for start in range(len(segs)):
        if used[start]:
            continue
        used[start] = True
        p, q = segs[start]
        line = [p, q]
        # Forward from q, then backward from p.
        for forward in (True, False):
            while True:
                end = line[-1] if forward else line[0]
                nxt = next((n for n in by_edge[end[0]] if not used[n]), None)
                if nxt is None:
                    break
                used[nxt] = True
                a, b = segs[nxt]
                other = b if a[0] == end[0] else a
                if forward:
                    line.append(other)
                else:
                    line.insert(0, other)
        lines.append([pt for _, pt in line])
    return lines


def simplify(pts, tol):
    """Douglas-Peucker, iterative."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x0, y0), (x1, y1) = pts[i], pts[j]
        dx, dy = x1 - x0, y1 - y0
        norm = (dx * dx + dy * dy) ** 0.5
        far, at = 0.0, -1
        for k in range(i + 1, j):
            x, y = pts[k]
            dist = abs(dy * (x - x0) - dx * (y - y0)) / norm if norm else ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
            if dist > far:
                far, at = dist, k
        if far > tol:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(pts, keep) if k]


def path(lines):
    out = []
    for line in lines:
        pts = simplify(line, TOLERANCE)
        out.append("M" + "L".join(f"{round(x, 1):g} {round(y, 1):g}" for x, y in pts))
    return "".join(out)


def svg(z, w, h, step):
    """The lines, the higher the brighter, every fifth thicker, and the coast; in currentColor, the picture's."""
    top = max(z)
    out = []
    level = step
    while level < top:
        major = level % (step * 5) == 0
        out.append(f'<path d="{path(chains(segments(z, w, h, level)))}" stroke-opacity="{0.28 + 0.6 * level / top:.2f}" stroke-width="{1.3 if major else 0.6}" vector-effect="non-scaling-stroke"/>')
        level += step
    out.append(f'<path d="{path(chains(segments(z, w, h, 0)))}" stroke-width="3" vector-effect="non-scaling-stroke"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w - 1} {h - 1}">'
            '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'
            + "".join(out) + "</g></svg>\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem", type=Path, help="directory of <zone>.json grids already downloaded")
    a = ap.parse_args()
    for zone, box, w, h, step in ZONES:
        if a.dem:
            d = json.loads((a.dem / f"{zone}.json").read_text())
            assert (d["w"], d["h"]) == (w, h), zone
            z = d["z"]
        else:
            z = grid(box, w, h)
        out = ROOT / f"scripts/og/courbes-{zone}.svg"
        out.write_text(svg(smooth(z, w, h), w, h, step))
        print(out, f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
