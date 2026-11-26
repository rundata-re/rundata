#!/usr/bin/env python3
"""Build src/vie/velo.json: the Voie vélo régionale and the bike racks of the CIVIS, bundled, for the layer « Vélo » of /carte.
The lanes of the whole island, Geovelo's (ODbL), are another file and another layer: scripts/build-geovelo.py. The
Ville de Saint-Denis's list of February 2023 is no longer read: Geovelo's has its lanes, of the month.

Two lists of the open data portal of the Région, data.regionreunion.com, both under the Licence Ouverte:
- the Voie vélo régionale of the Région Réunion: its pieces built, as the Région gives their state (« Réalisé »,
  « Existant », « Requalification »), never those studied, planned, under works or removed; each its type as given, and
  its year when the list has one. The list's date is its fiche's (its description has none).
- the bike racks of the CIVIS: their number, and the name of their place when the list gives it whole (it cuts them
  at 30 characters). The list has no date: the portal's is the day it read it again.
Never the names of the people who made the lists, nor the Région's « exploitant » (often « A définir »). The state of a
lane on the day is in none of them. Read through the portal's API, one request a minute per host at most.
Usage: python3 -I scripts/build-velo.py [--dir DIR] [--verifier SEUIL]  (DIR: local copies, <dataset>.fiche.json and <dataset>.geojson)
"""
import argparse
import importlib.util
import json
import sys
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
REGION, CIVIS = "voie-velo-regionale", "accroches-velo-civis"
# The Région's states of a piece that is there; « Requalification » is said as given, since it does not say if done.
BUILT = {"Réalisé", "Existant", "Existant sens 2", "Requalification"}
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


def encoded(pieces):
    return [bt.encode(bt.simplify(piece, bt.SIMPLIFY_M)) for piece in sorted(pieces, key=lambda p: -len(p))]


def verifier(seuil):
    """The two datasets against src/vie/velo.json (see --verifier); 1 when one of them is to be redone."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    bundled = json.loads((ROOT / "src/vie/velo.json").read_text())
    rc = v.plus_recent("Voie vélo régionale", bundled["sources"]["region"]["liste_du"], opened(API + REGION)["metas"]["default"]["modified"],
                       "build-velo.py", "la liste de la Région")
    _, feats = read(CIVIS, None)
    now = [{"n": f["properties"]["nbre_accro"], "lon": round(f["geometry"]["coordinates"][0], 5), "lat": round(f["geometry"]["coordinates"][1], 5)} for f in feats]
    key = lambda r: (r["n"], r["lon"], r["lat"])
    return max(rc, v.ecarts("Accroches vélo (CIVIS)", bundled["accroches"], now, key, seuil, "build-velo.py", lambda r: f'{r.get("nom", "sans nom")}, {r["n"]} places ({r["lon"]}, {r["lat"]})'))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, help="local copies of the portal's answers")
    # Each dataset as it moves, four requests a minute apart: the Région's by its date (its pieces change in place, with
    # no id to follow); the CIVIS's racks by content (104 points, one export), past SEUIL racks added, gone or changed in
    # number: 2, a rack or two a year.
    p.add_argument("--verifier", type=int, metavar="SEUIL", help="write nothing: compare with src/vie/velo.json, fail on a newer source or past SEUIL racks")
    a = p.parse_args()
    if a.verifier is not None:
        sys.exit(verifier(a.verifier))
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
            "civis": {"page": f"{PAGE}{CIVIS}/"},
        },
        "voies": voies,
        "accroches": accroches,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(voies)} voies, {len(accroches)} accroches -> {dest.relative_to(ROOT)}, {dest.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
