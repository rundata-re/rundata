#!/usr/bin/env python3
"""Build src/vie/couverture.json: where no mobile coverage is declared on La Réunion, by operator, for the map of /antennes.

Source: the Arcep, « Mon Réseau Mobile », couvertures théoriques (https://www.data.gouv.fr/datasets/mon-reseau-mobile,
Licence Ouverte 2.0), files at https://data.arcep.fr/mobile/couvertures_theoriques/<quarter>/Outremer/974_LaReunion/.
A coverage map is DECLARED by each operator from its own simulations and checked by sampling by the Arcep: never a
measure, and the page says so in those words. One GeoPackage per operator (OF Orange, SRR, TELC Telco OI, ZEOP) and per
technology, in RGR92 / UTM 40S (EPSG:2975), one multipolygon per level (« très bonne », « bonne », « limitée »).
Kept: voice (2G3G_voix) and 4G data (4G_data), the networks a phone uses everywhere; 3G data goes away and 5G covers a few
towns only, so they are left out.

What it computes, in the units of the maps (src/places/island.json: its bbox, w and h; 1 unit is about 67 m):
- for each operator and technology, the island minus the union of its levels: where that operator declares nothing;
- « aucun »: where none of the four declares anything (the intersection of the four);
- the island is the union of the communes' outlines, less a strip of 1.5 units (about 100 m) along the coast: the two
  coastlines differ a little, and the gap made a false strip all round. A morphological opening was tried instead and
  dropped: it also erased real narrow gaps inland (Orange 4G, 13.7 % of the land down to 10.2 %, 25/11/2026);
- paths simplified to 0.7 unit, pieces and holes under 2 square units (about 1 ha) dropped, integer relative moves,
  drawn with fill-rule evenodd (the holes are covered places inside an uncovered one). About 400 Ko, 110 Ko gzipped.
- the share of the land with no declared coverage, by layer, on the same island, before simplification.

Run again once a quarter, when the Arcep publishes a new one (about three months after its date: 2026 T2, dated
30/06/2026, came on 24/09/2026); --verifier says when (the Monday check, .github/workflows/listes.yml, through
scripts/verifier.py).
Needs shapely and numpy, and the 7z command: python3 -m venv /tmp/cv && /tmp/cv/bin/pip install shapely numpy, then
/tmp/cv/bin/python -I scripts/build-couverture.py. About 15 minutes on one core (the unions of the levels).
Downloads 8 files, about 19 Mo, at one request a minute; --dossier reads them from a folder instead.
Usage: build-couverture.py [--trimestre 2026_T2] [--dossier <folder of .gpkg.7z or .gpkg>] | --verifier
--verifier: write nothing, read the Arcep's list of quarters (one request, and one a minute for each newer quarter) and
say through scripts/verifier.py whether the map has aged: a newer quarter that has La Réunion is an aged list (the Monday
job stays green and says it), a list of quarters or a quarter's index that cannot be read is a broken check (red).
Needs neither shapely nor 7z.
"""
import argparse
import importlib.util
import json
import math
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/couverture.json"
BASE = "https://data.arcep.fr/mobile/couvertures_theoriques/"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
OPERATEURS = ["OF", "SRR", "TELC", "ZEOP"]
TECHNOS = {"voix": "2G3G_voix", "4g": "4G_data"}
COTE, SIMPLIFIER, MINI = 1.5, 0.7, 2.0


def lire(url: str) -> bytes:
    # data.arcep.fr answers 302 to its storage: urllib follows it.
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def trimestres() -> list[str]:
    """The quarters the Arcep lists, oldest first (« 2026_T2 »)."""
    return sorted(set(re.findall(r'href="(\d{4}_T[1-4])/index\.html"', lire(BASE + "index.html").decode())))


def reunion(t: str, sur: bool = False) -> bool:
    """Whether quarter t has La Réunion. A quarter whose index cannot be read: without it (`sur`: the error, for the
    check, where an unreadable index is not an answer)."""
    try:
        return "974_LaReunion" in lire(f"{BASE}{t}/Outremer/index.html").decode()
    except OSError:
        if sur:
            raise
        return False


LISTE = "Couverture mobile déclarée (Arcep)"


def date_de(t: str) -> str:
    """The date a quarter's maps describe: « 2026_T2 » is the 30th of June 2026."""
    an, q = t.split("_T")
    return f"{an}-{['03-31', '06-30', '09-30', '12-31'][int(q) - 1]}"


def verifier(v=None) -> int:
    """0: no newer quarter has La Réunion; 1 (aged): one has; 2 (broken): no quarter could be read. An unreadable answer
    raises, and scripts/verifier.py says the check broken."""
    if v is None:
        spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
        v = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(v)
    actuel = json.loads(OUT.read_text())["trimestre"]
    tous = trimestres()
    if not tous:
        return v.cassee(LISTE, "la liste des trimestres de l'Arcep n'en donne aucun (page changée ?)")
    plus = [t for t in tous if t > actuel]
    for t in reversed(plus):
        time.sleep(62)
        if reunion(t, sur=True):
            return v.vieillie(LISTE, "build-couverture.py", f"les cartes de l'Arcep, {t}", date=date_de(t),
                              consigne=f"Embarquée : {actuel}. Lancer scripts/build-couverture.py (shapely, numpy et 7z, environ 15 minutes) et proposer la PR.")
    print(f"Arcep : pas de trimestre plus récent que {actuel} pour La Réunion")
    return 0


# RGR92 / UTM 40S to longitude and latitude: the inverse transverse Mercator (GRS80), no pyproj needed (a few cm off at most).
A, F, K0, LON0 = 6378137.0, 1 / 298.257222101, 0.9996, math.radians(57)
E2 = F * (2 - F)
EP2 = E2 / (1 - E2)
E1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))


def vers_carte(island):
    import numpy as np

    lon0, lat0, lon1, lat1 = island["bbox"]
    w, h = island["w"], island["h"]

    def f(xy):
        x, y = xy[:, 0] - 500000.0, xy[:, 1] - 10000000.0
        mu = y / K0 / (A * (1 - E2 / 4 - 3 * E2**2 / 64 - 5 * E2**3 / 256))
        p1 = (mu + (3 * E1 / 2 - 27 * E1**3 / 32) * np.sin(2 * mu) + (21 * E1**2 / 16 - 55 * E1**4 / 32) * np.sin(4 * mu)
              + (151 * E1**3 / 96) * np.sin(6 * mu) + (1097 * E1**4 / 512) * np.sin(8 * mu))
        c1, t1 = EP2 * np.cos(p1) ** 2, np.tan(p1) ** 2
        n1 = A / np.sqrt(1 - E2 * np.sin(p1) ** 2)
        r1 = A * (1 - E2) / (1 - E2 * np.sin(p1) ** 2) ** 1.5
        d = x / (n1 * K0)
        lat = p1 - (n1 * np.tan(p1) / r1) * (d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * EP2) * d**4 / 24
                                             + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * EP2 - 3 * c1**2) * d**6 / 720)
        lon = LON0 + (d - (1 + 2 * t1 + c1) * d**3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * EP2 + 24 * t1**2) * d**5 / 120) / np.cos(p1)
        lon, lat = np.degrees(lon), np.degrees(lat)
        return np.column_stack([(lon - lon0) / (lon1 - lon0) * w, (lat1 - lat) / (lat1 - lat0) * h])

    return f


def ile(island):
    from shapely import ops
    from shapely.geometry import Polygon

    def contour(d):
        x = y = 0.0
        pts = []
        for c, a, b in re.findall(r"([Ml])(-?[\d.]+)[, ]?(-?[\d.]+)", d):
            x, y = (float(a), float(b)) if c == "M" else (x + float(a), y + float(b))
            pts.append((x, y))
        return Polygon(pts).buffer(0)

    return ops.unary_union([contour(p["d"]) for p in island["paths"]])


def couvert(gpkg: Path, proj):
    """The union of a file's levels, in map units."""
    from shapely import ops, transform, wkb

    c = sqlite3.connect(f"file:{gpkg}?mode=ro", uri=True)
    (table,) = c.execute("select table_name from gpkg_contents").fetchone()
    parts = []
    for (g,) in c.execute(f'select geom from "{table}"'):
        # A GeoPackage geometry: « GP », version, flags (bits 1-3: the envelope's kind), the SRS id, the envelope, then WKB.
        env = (g[3] >> 1) & 7
        parts.append(transform(wkb.loads(bytes(g[8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[env]:])), proj))
    c.close()
    return ops.unary_union(parts).buffer(0)


def chemin(g) -> str:
    """An SVG path in integer relative moves; pieces and holes under MINI dropped."""
    from shapely.geometry import Polygon

    out = []
    for pg in getattr(g.simplify(SIMPLIFIER), "geoms", [g.simplify(SIMPLIFIER)]):
        if pg.geom_type != "Polygon" or pg.area < MINI:
            continue
        for r in [pg.exterior] + [i for i in pg.interiors if Polygon(i).area >= MINI]:
            pts = [(round(x), round(y)) for x, y in r.coords[:-1]]
            q = [pts[0]] + [p for a, p in zip(pts, pts[1:]) if p != a]
            if len(q) >= 3:
                out.append(f"M{q[0][0]} {q[0][1]}l" + " ".join(f"{b[0] - a[0]} {b[1] - a[1]}" for a, b in zip(q, q[1:])) + "z")
    return "".join(out)


def fichiers(t: str, dossier: Path | None, tmp: Path) -> dict[str, Path]:
    """Each wanted GeoPackage, from the folder or downloaded (one request a minute), unpacked into tmp."""
    out = {}
    premier = True
    for op in OPERATEURS:
        for techno in TECHNOS.values():
            nom = f"{t}_couv_974_{op}_{techno}.gpkg"
            if dossier and (dossier / nom).exists():
                out[f"{op}_{techno}"] = dossier / nom
                continue
            arch = dossier / f"{nom}.7z" if dossier else tmp / f"{nom}.7z"
            if not arch.exists():
                if not premier:
                    time.sleep(62)
                premier = False
                arch.write_bytes(lire(f"{BASE}{t}/Outremer/974_LaReunion/{nom}.7z"))
            subprocess.run(["7z", "x", "-y", f"-o{tmp}", str(arch)], check=True, stdout=subprocess.DEVNULL)
            out[f"{op}_{techno}"] = tmp / nom
    return out


def construire(t: str, dossier: Path | None) -> dict:
    island = json.loads((ROOT / "src/places/island.json").read_text())
    proj = vers_carte(island)
    terre = ile(island).buffer(-COTE)
    with tempfile.TemporaryDirectory() as d:
        gp = fichiers(t, dossier, Path(d))
        trous, parts, couches = {}, {}, {}
        for op in OPERATEURS:
            for k, techno in TECHNOS.items():
                trou = terre.difference(couvert(gp[f"{op}_{techno}"], proj))
                trous[(op, k)] = trou
                parts.setdefault(op, {})[k] = round(100 * trou.area / terre.area, 1)
                couches[f"{op}-{k}"] = chemin(trou)
                print(f"{op} {k}: {parts[op][k]} %", file=sys.stderr)
        for k in TECHNOS:
            aucun = trous[(OPERATEURS[0], k)]
            for op in OPERATEURS[1:]:
                aucun = aucun.intersection(trous[(op, k)])
            parts.setdefault("aucun", {})[k] = round(100 * aucun.area / terre.area, 1)
            couches[f"aucun-{k}"] = chemin(aucun)
            print(f"aucun {k}: {parts['aucun'][k]} %", file=sys.stderr)
    return {"trimestre": t, "date": date_de(t), "parts": parts, "couches": couches}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trimestre")
    ap.add_argument("--dossier", type=Path)
    ap.add_argument("--verifier", action="store_true")
    a = ap.parse_args()
    if a.verifier:
        sys.exit(verifier())
    t = a.trimestre or next(x for x in reversed(trimestres()) if reunion(x))
    data = construire(t, a.dossier)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)} : {t}, {OUT.stat().st_size} octets", file=sys.stderr)


if __name__ == "__main__":
    main()
