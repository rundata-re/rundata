#!/usr/bin/env python3
"""Build src/places/communes-contours.json: the outlines of the 24 communes of La Réunion, simplified, for the commune
of a point (src/places/contours.ts, and the build scripts through contours() below).

The outlines of geo.api.gouv.fr (Licence Ouverte 2.0), read once: 24 communes, about 36 000 points, 820 Ko. Each border
between two communes is simplified once, for both (Douglas-Peucker at TOLERANCE_M), so that their two sides stay
together: no gap nor overlap between neighbours on land. Then 5 decimals (about 1 m) and Google's polyline encoding, as
the traces: about 7 000 points and 19 Ko gzipped at 20 m. Measured on 24/11/2026 against the full outlines, on a grid of
0.01° over the island and on one point in five of the hikes: 0.18 % and 0.47 % of points given another commune or none,
against 6.0 % and 9.3 % for the nearest place of the gazetteer; at 50 m, 0.64 % and 0.94 % for 9 Ko.
Run again when a commune's outline changes (rarely: a merger, a border moved).
Usage: python3 -I scripts/build-contours.py [--geojson FILE]   (FILE: a local copy of the API's answer)

The build scripts read the file with contours() and test a point with inside(), loading this file by its path:
    spec = importlib.util.spec_from_file_location("contours", Path(__file__).with_name("build-contours.py"))
"""
import argparse
import importlib.util
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "src/places/communes-contours.json"
COMMUNES = "https://geo.api.gouv.fr/departements/974/communes?format=geojson&geometry=contour&fields=code,nom"
TOLERANCE_M = 20


_BT = []


def _bt():
    """build-traces.py, loaded once: its fetch, simplify (Douglas-Peucker in metres), encode, rings_of and inside."""
    if not _BT:
        spec = importlib.util.spec_from_file_location("bt", Path(__file__).with_name("build-traces.py"))
        bt = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bt)
        _BT.append(bt)
    return _BT[0]


def decode(s):
    """A polyline of Google's encoding (5 decimals, latitude first) as its points (lon, lat)."""
    out, i, lat, lon = [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in range(2):
            shift = v = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                v |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(~(v >> 1) if v & 1 else v >> 1)
        lat += vals[0]
        lon += vals[1]
        out.append((lon / 1e5, lat / 1e5))
    return out


def contours(path=DEST):
    """The communes of the file, each (code, name, bbox, polygons), a polygon its rings of (lon, lat), holes after."""
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return [(c["code"], c["nom"], tuple(c["bbox"]), [[decode(r) for r in poly] for poly in c["polygones"]]) for c in d["communes"]]


def inside(p, polys):
    """Whether p (lon, lat) is in one of the polygons: even-odd over each one's rings, its holes too (as contours.ts)."""
    return _bt().inside(p, polys)


def commune_at(p, communes):
    """The code of the commune whose outline holds p, its box first; None off every outline (at sea, on the shore)."""
    x, y = p
    bt = _bt()
    return next((code for code, _, (w, s, e, n), polys in communes if w <= x <= e and s <= y <= n and bt.inside(p, polys)), None)


def shared_simplify(rings, tol_m, simplify):
    """
    `rings` ({key: ring}, each ring closed or not, its points (lon, lat)) simplified with each stretch of border once: a
    ring is cut at the points where the set of rings that pass through them changes, so that a border between two
    communes is the same stretch, read one way or the other, for both. Its two ends are kept.
    """
    users = defaultdict(set)
    open_rings = {}
    for k, ring in rings.items():
        r = ring[:-1] if ring[0] == ring[-1] else ring
        open_rings[k] = r
        for p in r:
            users[p].add(k)
    done = {}
    out = {}
    for k, r in open_rings.items():
        n = len(r)
        cuts = [i for i in range(n) if users[r[i]] != users[r[i - 1]] or users[r[i]] != users[r[(i + 1) % n]]] or [0]
        res = []
        for j, c in enumerate(cuts):
            e = cuts[(j + 1) % len(cuts)]
            seg = [r[(c + m) % n] for m in range(((e - c) % n or n) + 1)]
            key = (seg[0], seg[-1], len(seg), seg[len(seg) // 2])
            back = (seg[-1], seg[0], len(seg), seg[::-1][len(seg) // 2])
            if key in done:
                s = done[key]
            elif back in done:
                s = done[back][::-1]
            else:
                s = simplify(seg, tol_m)
                done[key] = s
            res += s[:-1]
        out[k] = res
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--geojson", help="a local copy of the API's answer")
    a = p.parse_args()
    bt = _bt()
    geo = json.loads(Path(a.geojson).read_text(encoding="utf-8")) if a.geojson else bt.fetch(COMMUNES)
    feats = sorted(geo["features"], key=lambda f: f["properties"]["code"])
    # The island has 24 communes: any other count is an answer to look at before it replaces the file.
    assert len(feats) == 24 and len({f["properties"]["code"] for f in feats}) == 24, f"{len(feats)} contours"
    rings = {}
    for f in feats:
        for pi, poly in enumerate(bt.rings_of(f["geometry"])):
            for ri, ring in enumerate(poly):
                rings[(f["properties"]["code"], pi, ri)] = ring
    simple = shared_simplify(rings, TOLERANCE_M, bt.simplify)
    communes = []
    for f in feats:
        code = f["properties"]["code"]
        polys = []
        for pi, poly in enumerate(bt.rings_of(f["geometry"])):
            rs = [[(round(x, 5), round(y, 5)) for x, y in simple[(code, pi, ri)]] for ri in range(len(poly))]
            rs = [r for r in rs if len(r) >= 3]
            if rs:
                polys.append(rs)
        pts = [q for poly in polys for q in poly[0]]
        communes.append({
            "code": code,
            "nom": f["properties"]["nom"],
            "bbox": [min(x for x, _ in pts), min(y for _, y in pts), max(x for x, _ in pts), max(y for _, y in pts)],
            "polygones": [[bt.encode(r) for r in poly] for poly in polys],
        })
    DEST.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "source": "Contours des communes : geo.api.gouv.fr (Licence Ouverte 2.0)",
        "page": "https://geo.api.gouv.fr/decoupage-administratif/communes",
        "tolerance_m": TOLERANCE_M,
        "communes": communes,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    n = sum(len(decode(r)) for c in communes for poly in c["polygones"] for r in poly)
    print(f"{len(communes)} communes, {n} points à {TOLERANCE_M} m -> {DEST.relative_to(ROOT)}, {DEST.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
