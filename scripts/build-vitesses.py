#!/usr/bin/env python3
"""Build src/vie/vitesses.json: the speed limits on the routes nationales of La Réunion, bundled, for /carte.

« Les limitations de vitesse sur les routes nationales de La Réunion », from the Système d'Information Routier of the
Région Réunion (DEER), on the open data portal of the Région, data.regionreunion.com, Licence Ouverte; its fiche says
it was last updated in August 2024, each piece has the day it was last changed (most of them 2017). Each piece its
route, its speed and that year. A road of two carriageways has a piece for each side: the left one is kept only where
its speed is not the right one's, and a side's where it is not the centre's (SAME_SHARE of it within SAME_M of a piece
kept at the same speed). The pieces that follow each other on the same route and side, at the same speed and of the
same year, are joined into one. Never a speed of today: the signs on the spot and the works' limits come first. Read
through the portal's API, one request a minute per host at most.
Usage: python3 -I scripts/build-vitesses.py [--dir DIR]  (DIR: local copies, <dataset>.fiche.json and <dataset>.geojson)
"""
import argparse
import importlib.util
import json
import re
import time
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("traces", ROOT / "scripts" / "build-traces.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

DATASET = "limitations-vitesse-rn-lareunion"
API = f"https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/{DATASET}"
PAGE = f"https://data.regionreunion.com/explore/assets/{DATASET}/"
# The two sides of a road of two carriageways are 10 to 40 m apart.
SAME_M = 40
SAME_SHARE = 0.8
# Simplified to this: at 5 m, the layer's file weighs 31,9 Ko compressed, over the 30 Ko of /carte (web/couches.ts, MAX_GZIP).
SIMPLIFY_M = 10
last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=bt.UA), timeout=300))


def lines_of(g):
    ls = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    return [[tuple(x[:2]) for x in l] for l in ls if len(l) > 1]


def route(numero):
    """« N2 » → « RN2 », « N1A » → « RN1A »."""
    m = re.fullmatch(r"N(\d+[A-Z]?)", numero)
    assert m, numero
    return f"RN{m[1]}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, help="local copies of the portal's answers")
    a = p.parse_args()
    if a.dir:
        fiche = json.loads((a.dir / f"{DATASET}.fiche.json").read_text(encoding="utf-8"))
        feats = json.loads((a.dir / f"{DATASET}.geojson").read_text(encoding="utf-8"))["features"]
        total = json.loads((a.dir / f"{DATASET}.compte.json").read_text(encoding="utf-8"))["total_count"]
    else:
        fiche = opened(API)
        feats = opened(API + "/exports/geojson")["features"]
        total = opened(API + "/records?limit=0")["total_count"]
    assert len(feats) == total, f"{len(feats)} tronçons reçus, {total} annoncés"
    m = re.search(r"Dernière mise à jour\s*:\s*([^.<]+)", fiche["metas"]["default"]["description"])
    assert m and m[1].strip() == "août 2024", m and m[1]
    print(f"{len(feats)} tronçons, mise à jour : {m[1].strip()}")

    # The pieces of each side, the centre's first: one is dropped when it lies along the pieces kept, at the same speed.
    kept, groups, dropped, other = defaultdict(list), defaultdict(list), 0, 0
    for side in ("Centre", "Droite", "Gauche"):
        along = {v: bt.Lines(ls) for v, ls in kept.items()}
        for f in feats:
            pr = f["properties"]
            if pr["cote"] != side:
                continue
            # A few pieces of a departmental or communal road where it meets a national one: not a route nationale's.
            if not pr["numero"]:
                other += 1
                continue
            ls = lines_of(f["geometry"])
            if pr["vitesse_m"] in along:
                on, length = near(ls, along[pr["vitesse_m"]])
                if length and on / length >= SAME_SHARE:
                    dropped += 1
                    continue
            kept[pr["vitesse_m"]] += ls
            year = int((pr.get("date_modif") or pr.get("date_creat") or "0")[:4]) or None
            groups[(route(pr["numero"]), side, pr["vitesse_m"], year)] += ls
    troncons = []
    for (rn, _, v, year), ls in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2], kv[0][3] or 0)):
        for piece in bt.chain(ls):
            troncons.append({"route": rn, "v": v, **({"annee": year} if year else {}), "ligne": bt.encode(bt.simplify(piece, SIMPLIFY_M))})
    print(f"{other} tronçons hors routes nationales, {dropped} tronçons le long d'un autre à la même vitesse, {len(troncons)} tronçons joints")
    dest = ROOT / "src/vie/vitesses.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "mise_a_jour": "2024-08",
        "page": PAGE,
        "troncons": troncons,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"-> {dest.relative_to(ROOT)}, {dest.stat().st_size // 1024} Ko")


def near(paths, lines):
    """How many metres of the paths lie within SAME_M of the lines, and their whole length."""
    on = total = 0.0
    for seg in paths:
        close = [lines.near(x, SAME_M) for x in seg]
        for i in range(1, len(seg)):
            d = bt.dist_m(seg[i - 1], seg[i])
            total += d
            if close[i - 1] and close[i]:
                on += d
    return on, total


if __name__ == "__main__":
    main()
