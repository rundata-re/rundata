#!/usr/bin/env python3
"""Build src/vie/velo.json: the bike lanes and the bike racks of La Réunion, bundled, for the layer « Vélo » of /carte.

Three lists of the open data portal of the Région, data.regionreunion.com, all under the Licence Ouverte:
- the Voie vélo régionale of the Région Réunion: its pieces built, as the Région gives their state (« Réalisé »,
  « Existant », « Requalification »), never those studied, planned, under works or removed; each its type as given, and
  its year when the list has one. The list's date is its fiche's (its description has none).
- the bike lanes of the Ville de Saint-Denis (« pistes et bandes cyclables »), exported in February 2023: those that do
  not lie under the Voie vélo régionale, so that a lane is never drawn twice (UNDER_SHARE of it within UNDER_M of it).
- the bike racks of the CIVIS: their number, and the name of their place when the list gives it whole (it cuts them
  at 30 characters). The list has no date: the portal's is the day it read it again.
Never the names of the people who made the lists, nor the Région's « exploitant » (often « A définir »). The state of a
lane on the day is in none of them. Read through the portal's API, one request a minute per host at most.
Usage: python3 -I scripts/build-velo.py [--dir DIR]  (DIR: local copies, <dataset>.fiche.json and <dataset>.geojson)
"""
import argparse
import importlib.util
import json
import math
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("traces", ROOT / "scripts" / "build-traces.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

API = "https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/"
PAGE = "https://data.regionreunion.com/explore/assets/"
REGION, SAINT_DENIS, CIVIS = "voie-velo-regionale", "pistes-bandes-cyclables-villesaintdenis", "accroches-velo-civis"
# The Région's states of a piece that is there; « Requalification » is said as given, since it does not say if done.
BUILT = {"Réalisé", "Existant", "Existant sens 2", "Requalification"}
# A lane of Saint-Denis lies under the Voie vélo régionale when this much of it is this close to one of its pieces built.
UNDER_M = 25
UNDER_SHARE = 0.6
# Points this far apart at most when measuring how much of a lane lies under another: its own points may be far apart.
STEP_M = 10
# The CIVIS's names of places are cut at this length: one this long may be cut, and is not said.
CUT_AT = 30
last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=bt.UA), timeout=300))


def read(dataset, local):
    """Its fiche and its features, from the portal, or from the local copies; the count checked against the portal's."""
    if local:
        fiche = json.loads((local / f"{dataset}.fiche.json").read_text(encoding="utf-8"))
        feats = json.loads((local / f"{dataset}.geojson").read_text(encoding="utf-8"))["features"]
        total = json.loads((local / f"{dataset}.compte.json").read_text(encoding="utf-8"))["total_count"]
    else:
        fiche = opened(API + dataset)
        feats = opened(API + dataset + "/exports/geojson")["features"]
        total = opened(API + dataset + "/records?limit=0")["total_count"]
    assert len(feats) == total, f"{dataset} : {len(feats)} reçus, {total} annoncés"
    return fiche["metas"]["default"], feats


def lines_of(g):
    if not g:
        return []
    ls = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    return [[tuple(x[:2]) for x in l] for l in ls if len(l) > 1]


def dense(line):
    """Its points, with points added so that none is more than STEP_M from the next."""
    out = [line[0]]
    for a, b in zip(line, line[1:]):
        n = max(1, math.ceil(bt.dist_m(a, b) / STEP_M))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return out


def share_under(pieces, lines):
    """How much of the pieces' length lies within UNDER_M of the lines."""
    on = total = 0.0
    for piece in pieces:
        p = dense(piece)
        close = [lines.near(x, UNDER_M) for x in p]
        for i in range(1, len(p)):
            d = bt.dist_m(p[i - 1], p[i])
            total += d
            if close[i - 1] and close[i]:
                on += d
    return on / total if total else 0.0


def encoded(pieces):
    return [bt.encode(bt.simplify(piece, bt.SIMPLIFY_M)) for piece in sorted(pieces, key=lambda p: -len(p))]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, help="local copies of the portal's answers")
    a = p.parse_args()
    voies, accroches = [], []

    meta, feats = read(REGION, a.dir)
    region_du = meta["modified"][:10]
    kept = [f for f in feats if f["properties"].get("etat_amen") in BUILT and lines_of(f["geometry"])]
    print(f"Voie vélo régionale ({region_du}) : {len(feats)} tronçons, {len(kept)} gardés")
    for f in kept:
        pr = f["properties"]
        voies.append({
            "s": "region",
            "type": " ".join(pr["type_amen"].split()),
            **({"annee": pr["annee_mis"]} if pr.get("annee_mis") else {}),
            **({"requalification": True} if pr["etat_amen"] == "Requalification" else {}),
            "lignes": encoded(bt.chain(lines_of(f["geometry"]))),
        })
    region = bt.Lines([l for f in kept for l in lines_of(f["geometry"])])

    meta, feats = read(SAINT_DENIS, a.dir)
    exports = {f["properties"]["date_d_exp"] for f in feats}
    assert exports == {"06/02/2023"}, exports
    under = 0
    for f in feats:
        pr, pieces = f["properties"], bt.chain(lines_of(f["geometry"]))
        s = share_under(pieces, region)
        if s >= UNDER_SHARE:
            under += 1
            continue
        voies.append({
            "s": "saint-denis",
            "nom": " ".join(pr["nom"].split()),
            "type": pr["type_de_tr"],
            **({"sens": pr["sens_de_ci"].lower()} if pr.get("sens_de_ci") else {}),
            **({"provisoire": True} if pr["statut"] == "Existant provisoire" else {}),
            "lignes": encoded(pieces),
        })
    print(f"Saint-Denis : {len(feats)} tronçons, {under} sous la Voie vélo régionale, {len(feats) - under} gardés")

    meta, feats = read(CIVIS, a.dir)
    for f in feats:
        pr = f["properties"]
        lon, lat = f["geometry"]["coordinates"][:2]
        site = " ".join((pr.get("nom_du_sit") or "").split())
        accroches.append({
            **({"nom": site} if site and len(site) < CUT_AT else {}),
            "n": pr["nbre_accro"],
            "lon": round(lon, 5),
            "lat": round(lat, 5),
        })
    print(f"CIVIS : {len(accroches)} accroches, {sum('nom' not in x for x in accroches)} sans nom entier")

    dest = ROOT / "src/vie/velo.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "sources": {
            "region": {"page": f"{PAGE}{REGION}/", "liste_du": region_du},
            "saint-denis": {"page": f"{PAGE}{SAINT_DENIS}/", "export_du": "2023-02-06"},
            "civis": {"page": f"{PAGE}{CIVIS}/"},
        },
        "voies": voies,
        "accroches": accroches,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(voies)} voies, {len(accroches)} accroches -> {dest.relative_to(ROOT)}, {dest.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
