#!/usr/bin/env python3
"""Build src/vie/marmailles.json: the « sentiers marmailles » of La Réunion, bundled.

The walks for all, children included, of the Conseil Général and the AGORAH (« Les sentiers marmailles à La Réunion », on
the open data portal of the Région, data.regionreunion.com, Licence Ouverte): 45 traces, each with its name, its length
and its time as the source gives them, « aller-retour » when the length is twice the trace, « boucle » when it is the
trace's. Added here, from the trace itself: its line simplified to about 5 m, and the ONF trails it follows, whose state
the server reads live (src/providers/sentiers.ts). Never a state of its own, nor a climb: the source has neither, and a
climb measured on a trace walked there and back would say half of it. The source has no date: its traces may be old.
Read through the portal's API, one request a minute per host at most.
Usage: python3 -I scripts/build-marmailles.py [--geojson sentiers.geojson --du 2026-11-02] [--cache DIR]
"""
import argparse
import importlib.util
import json
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("traces", ROOT / "scripts" / "build-traces.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

DATASET = "https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/sentiers-marmailles-lareunion"
PAGE = "https://data.regionreunion.com/explore/assets/sentiers-marmailles-lareunion/"
# An ONF trail is followed when this much of it lies along the walk, or most of a short one (as a hike's, build-traces).
FOLLOWED_MIN_M = 100
# The source's length rounded to 100 m, the trace's measured: this close, they are the same length.
SAME_KM = 0.25
last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=bt.UA), timeout=300))


def duree(s):
    """« 1h30 » → « 1 h 30 », « 50 min » → « 50 min », with no-break spaces as on every page."""
    s = " ".join((s or "").split())
    m = re.fullmatch(r"(\d+)\s*h\s*(\d+)?(?:\s*min)?", s)
    if m:
        return f"{m[1]} h" + (f" {m[2]}" if m[2] else "")
    m = re.fullmatch(r"(\d+)\s*min", s)
    return f"{m[1]} min" if m else s


def minutes(s):
    m = re.fullmatch(r"(\d+) h(?: (\d+))?", s)
    if m:
        return int(m[1]) * 60 + int(m[2] or 0)
    m = re.fullmatch(r"(\d+) min", s)
    return int(m[1]) if m else None


def parcours(km, traced):
    """« aller-retour » when the source's length is twice the trace, « boucle » when it is the trace's; else nothing."""
    if abs(km - 2 * traced) <= SAME_KM:
        return "aller-retour"
    if abs(km - traced) <= SAME_KM:
        return "boucle"
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--geojson", help="a local copy of the portal's GeoJSON export")
    p.add_argument("--du", help="the day the portal gives the data, 2026-11-02")
    p.add_argument("--cache", help="keep the ONF's answer in this folder")
    a = p.parse_args()
    if a.cache:
        bt.CACHE = Path(a.cache)
        bt.CACHE.mkdir(parents=True, exist_ok=True)
    if a.geojson:
        feats, du = json.loads(Path(a.geojson).read_text(encoding="utf-8"))["features"], a.du
    else:
        meta = opened(DATASET)["metas"]["default"]
        du = meta["modified"][:10]
        feats = opened(DATASET + "/exports/geojson")["features"]
    print(f"{len(feats)} sentiers marmailles ; ONF…")
    onf = bt.onf_trails()
    walks = []
    for f in feats:
        pr, g = f["properties"], f["geometry"]
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        pieces = bt.chain([[tuple(x[:2]) for x in l] for l in lines])
        simple = [bt.simplify(piece, bt.SIMPLIFY_M) for piece in pieces]
        walk = bt.Lines(pieces)
        box = bt.bbox([x for piece in pieces for x in piece], 0.001)
        followed = []
        for n, t in onf.items():
            pts = [x for seg in t["paths"] for x in seg]
            if not pts or not bt.overlaps(bt.bbox(pts, 0), box):
                continue
            on, total = bt.along(t["paths"], walk)
            if total and (on / total >= bt.ON_ROUTE_SHARE or on >= FOLLOWED_MIN_M):
                followed.append(n)
        # How much of the walk lies along the ONF trails it follows: the rest has no state anywhere.
        share = 0.0
        if followed:
            on, total = bt.along(pieces, bt.Lines([seg for n in followed for seg in onf[n]["paths"]]))
            share = on / total if total else 0.0
        d = duree(pr.get("duree_h_mi"))
        walks.append({
            "id": int(pr["id_sentier"]),
            "nom": " ".join(pr["nom_itiner"].split()),
            "km": pr["longueur_k"],
            "duree": d,
            **({"minutes": m} if (m := minutes(d)) is not None else {}),
            "sentiers_onf": sorted(followed),
            "part_onf": round(share, 2),
            **({"parcours": k} if (k := parcours(pr["longueur_k"], bt.length_km(pieces))) else {}),
            "lignes": [bt.encode(piece) for piece in simple],
        })
        w = walks[-1]
        print(f"  {w['id']:>3} {w['nom']}: {w['km']} km ({bt.length_km(pieces):.1f} tracés, {w.get('parcours', '?')}), {w['duree']}, ONF {w['part_onf']:.0%} {w['sentiers_onf']}")
    walks.sort(key=lambda w: w["id"])
    dest = ROOT / "src/vie/marmailles.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "donnees_du": du,
        "source": "Conseil Général de La Réunion / AGORAH, Les sentiers marmailles à La Réunion (data.regionreunion.com), Licence Ouverte",
        "page": PAGE,
        "sentiers": walks,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(walks)} sentiers -> {dest.relative_to(ROOT)}, {dest.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
