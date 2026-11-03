#!/usr/bin/env python3
"""Build src/vie/canyons.json: the canyons of the Parc national de La Réunion's inventory, bundled.

« Inventaire des canyons » (BDCanyons) of the Parc national de La Réunion, on the open data portal of the Région,
data.regionreunion.com, Licence Ouverte: 214 canyons, each its line (BD TOPO IGN), its name, its length,
in the cœur of the Parc or not, and those the inventory marks forbidden with the text it gives. Added here, from the line
itself: the line simplified to about 5 m, and the ONF trails it runs along, whose state the server reads live
(src/providers/sentiers.ts). The inventory has no date and its texts are of 1994 and 1997: a ban may have been lifted,
or decided since. Never its observations: free text, with people's names and the authors' own notes. Never its times
either: no unit is given. Read through the portal's API, one request a minute per host at most.
Usage: python3 -I scripts/build-canyons.py [--geojson canyons.geojson] [--cache DIR]
"""
import argparse
import importlib.util
import json
import re
import time
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("traces", ROOT / "scripts" / "build-traces.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

DATASET = "https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/bdcanyons-lareunion"
PAGE = "https://data.regionreunion.com/explore/assets/bdcanyons-lareunion/"
# An ONF trail is along a canyon when this much of it lies along the canyon's line, or most of a short one.
ALONG_MIN_M = 100

# The inventory's reasons for a ban, as said (data-run, 03/11): every one the source gives, so that a new one stops the build.
APB = "arrêté de protection de biotope"
AP97 = "arrêté préfectoral de 1997"
DAF94 = "Direction de l'agriculture et de la forêt, 1994"
MOTIFS = {
    "APB": APB,
    "? APB": f"{APB}, à confirmer d'après l'inventaire",
    "Arrêté prefectoral 1997": AP97,
    "Arrêté préfectoral 1997 (présence captage)": f"{AP97} (captage d'eau)",
    "Arrêté préfectoral 1997 (présence de captage à 1385m)": f"{AP97} (captage d'eau)",
    "arrêté préfectoral 1997 (captage au dessus 1140m)": f"{AP97} (captage d'eau)",
    "Arrêté préfectoral 1997 (présence captage à 1900m) APB": f"{AP97} (captage d'eau) et {APB}",
    "Arrêté préfectoral 1997 (chutes de pierre sous la route Ilet a corde)": f"{AP97} (chutes de pierres sous la route d'Îlet à Cordes)",
    "Arrêté préfectoral 1997 (chûtes de pierre)": f"{AP97} (chutes de pierres)",
    "arrêté préfectoral 1997(chute de pierre)": f"{AP97} (chutes de pierres)",
    "Arrêté préfectoral 1997 (zone naturelle, accès impossible)": f"{AP97} (zone naturelle, accès impossible)",
    "Arrêté préfectoral 1997 (zone naturelle, accès mpossible)": f"{AP97} (zone naturelle, accès impossible)",
    "arrêté préfectoral 1997 (zone naturelle, accès impossible)": f"{AP97} (zone naturelle, accès impossible)",
    "Arrêté préfectoral 1997 (lâchers d'eau possibles)": f"{AP97} (lâchers d'eau possibles)",
    "Arrêté préfectoral 1997 (risques inhérents au barrage EDF)": f"{AP97} (risques liés au barrage EDF)",
    "arrêté préfectoral 1994": "arrêté préfectoral de 1994",
    "DAF 1994 (captage)": f"{DAF94} (captage d'eau)",
    "DAF 1994 (pollution de captage)": f"{DAF94} (pollution du captage d'eau)",
    "DAF 1994 (pollution captage d'eau)": f"{DAF94} (pollution du captage d'eau)",
    "DAF 1994 (Interdiction à titre conservatoire, pas de captage pour le moment)": f"{DAF94} (à titre conservatoire)",
    "chute pierre": "chutes de pierres",
}
# Reasons given without the mark « interdit »: one is said, the others not at all (« RE » is not explained anywhere).
AUTORISATION = "soumis à autorisation"
TUS = {"RE", "? à vérifier"}
# Marked forbidden in the observations only, which are never published: the ban, said as the others (data-run, 03/11).
INTERDITS_EN_OBSERVATION = {"BRAS DES ETANGS LES HAUTS": APB}

# « sup » and « inf » said « amont » and « aval », which agree with a ravine as with a bras.
# Names after people (no person is named here): the ravine's name instead, with the part as the inventory gives it.
# Found by the point the portal gives as their middle, rounded to 4 decimals, never by those names.
SURNOMS = {
    (55.5117, -21.0716): "Bras Sec (Salazie)",
    (55.6279, -21.0713): "Grande Ravine amont",
    (55.6372, -21.0708): "Grande Ravine aval",
    (55.4581, -20.9496): "Ravine Blanche amont (Saint-Denis)",
    (55.4598, -20.9415): "Ravine Blanche aval (Saint-Denis)",
    (55.5244, -20.98): "Grand Bras Sec (Sainte-Marie)",
    (55.4249, -20.9304): "Grand Bras 1 (Saint-Denis)",
    (55.4236, -20.9203): "Grand Bras 2 (Saint-Denis)",
}
RENOMMES = {
    "Grand Coude ??": "Grand Coude",
    # Its name says it forbidden, as a fact: said as the others.
    "Trois Roches (partie interdite)": "Trois Roches (partie signalée interdite)",
}
SMALL = {"de", "des", "du", "la", "le", "les", "et", "à", "a", "par", "au", "aux", "en"}
WORDS = {
    "st": "Saint", "ste": "Sainte", "riv": "Rivière", "sup": "amont", "inf": "aval", "superieur": "amont", "inferieur": "aval",
    "median": "médian",
    "riviere": "Rivière", "etangs": "Étangs", "mariee": "Mariée", "meteo": "Météo", "seche": "Sèche", "mere": "Mère",
    "ferriere": "Ferrière", "colimacons": "Colimaçons", "ilet": "Îlet", "echo": "Écho", "mysteres": "Mystères",
    "integral": "intégral", "integrale": "intégrale", "cote": "côté", "detour": "Détour", "variante": "variante",
    "affluent": "affluent", "classique": "classique", "ile": "Île", "tete": "Tête", "cafe": "Café", "taibit": "Taïbit",
    "be": "Bé", "remy": "Rémy",
}


def plain(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def nom(raw):
    """« BRAS D'ANETTE 1 » → « Bras d'Anette 1 », « bras de benjoin sup » → « Bras de Benjoin amont »."""
    s = " ".join(raw.split())
    if s in RENOMMES:
        return RENOMMES[s]
    s = re.sub(r"([a-zA-Z])(\d)$", r"\1 \2", s)
    out = []
    for i, w in enumerate(re.split(r"(\s+|-|\(|\))", s)):
        if not w or not w.strip() or w in "-()":
            out.append(w)
            continue
        pre, _, rest = w.rpartition("'")
        key = plain(rest)
        if key in WORDS:
            word = WORDS[key]
        elif i and key in SMALL:
            word = "à" if key == "a" else key
        elif rest.isupper() or rest.islower():
            word = rest[:1].upper() + rest[1:].lower()
        else:
            word = rest
        if pre:
            word = (pre.upper() if i == 0 else pre.lower()) + "'" + word
        out.append(word)
    s = re.sub(r"\b(Saint|Sainte) (?=[A-ZÉ])", r"\1-", "".join(out))
    return s[:1].upper() + s[1:]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", plain(s)).strip("-")


last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=bt.UA), timeout=300))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--geojson", help="a local copy of the portal's GeoJSON export")
    p.add_argument("--cache", help="keep the ONF's answer in this folder")
    a = p.parse_args()
    if a.cache:
        bt.CACHE = Path(a.cache)
        bt.CACHE.mkdir(parents=True, exist_ok=True)
    if a.geojson:
        feats = json.loads(Path(a.geojson).read_text(encoding="utf-8"))["features"]
    else:
        feats = opened(DATASET + "/exports/geojson")["features"]
        total = opened(DATASET + "/records?limit=0")["total_count"]
        assert len(feats) == total, f"{len(feats)} canyons reçus, {total} annoncés"
    print(f"{len(feats)} canyons ; ONF…")
    onf = bt.onf_trails()
    canyons, ids = [], set()
    for f in feats:
        pr, g = f["properties"], f["geometry"]
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        pieces = sorted(bt.chain([[tuple(x[:2]) for x in l] for l in lines]), key=lambda piece: -len(piece))
        line = bt.Lines(pieces)
        box = bt.bbox([x for piece in pieces for x in piece], 0.001)
        along = []
        for n, t in onf.items():
            pts = [x for seg in t["paths"] for x in seg]
            if not pts or not bt.overlaps(bt.bbox(pts, 0), box):
                continue
            on, total = bt.along(t["paths"], line)
            if total and (on / total >= bt.ON_ROUTE_SHARE or on >= ALONG_MIN_M):
                along.append(n)
        raw = " ".join(pr["nom"].split())
        raison = " ".join((pr.get("raisoninte") or "").split())
        interdit = None
        if (pr.get("interdit") or "").lower() == "o":
            interdit = MOTIFS[raison]
        elif raw in INTERDITS_EN_OBSERVATION:
            interdit = INTERDITS_EN_OBSERVATION[raw]
        elif raison and raison != AUTORISATION:
            assert raison in TUS, f"motif sans le champ interdit : {raison}"
        mid = (round(pr["geo_point_2d"]["lon"], 4), round(pr["geo_point_2d"]["lat"], 4))
        name = SURNOMS.get(mid) or nom(raw)
        cid = slug(name)
        while cid in ids:
            cid += "-bis"
        ids.add(cid)
        canyons.append({
            "id": cid,
            "nom": name,
            "km": round(pr["long_sig"] / 1000, 1),
            "coeur": plain(pr.get("localisati") or "").replace(" ", "") == "coeur",
            **({"interdit": interdit} if interdit else {}),
            **({"autorisation": True} if raison == AUTORISATION and not interdit else {}),
            "sentiers_onf": sorted(along),
            "lignes": [bt.encode(bt.simplify(piece, bt.SIMPLIFY_M)) for piece in pieces],
        })
        c = canyons[-1]
        print(f"  {c['nom']} [{raw}] {c['km']} km{' INTERDIT ' + c['interdit'] if 'interdit' in c else ''} ONF {c['sentiers_onf']}")
    for raw in INTERDITS_EN_OBSERVATION:
        assert any(c["nom"] == nom(raw) for c in canyons), raw
    for name in SURNOMS.values():
        assert any(c["nom"] == name for c in canyons), name
    canyons.sort(key=lambda c: c["id"])
    dest = ROOT / "src/vie/canyons.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "source": "Parc national de La Réunion, Inventaire des canyons (data.regionreunion.com), Licence Ouverte",
        "page": PAGE,
        "canyons": canyons,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(canyons)} canyons, {sum('interdit' in c for c in canyons)} signalés interdits -> {dest.relative_to(ROOT)}, {dest.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
