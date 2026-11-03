#!/usr/bin/env python3
"""Build src/vie/mairies-annexes.json: the mairies annexes and centres municipaux of Saint-Denis, bundled.

« Les mairies annexes de la Ville de Saint-Denis », from the Ville (Direction Patrimoine Foncier / Plan & SIG), on the
open data portal of the Région, data.regionreunion.com, Licence Ouverte: each place its kind, its name, its quarter, its
address and its point, the export's day in every row. The Hôtel de Ville is the Annuaire de l'administration's, with its
hours and phone; the former Hôtel de Ville is no counter: both are left out. The list gives no hours and no phone.
Only the fields of KEPT are taken: the script stops on a field it does not know, so that the names of the elected
people the list also holds (elu, maire) never come in under another name. In an address, only the names of its
commune or quarter after the postcode are spelled again (LOCALITIES), and a comma given its space: never a number nor
the name of a street (« rue impasse Florville » stays as written). Read through the portal's API, one request a minute
per host at most.
Usage: python3 -I scripts/build-mairies-annexes.py [--dir DIR]  (DIR: local copies, <dataset>.fiche.json, .geojson, .compte.json)
"""
import argparse
import json
import re
import time
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "mairies-annexes-villesaintdenis"
API = f"https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/{DATASET}"
PAGE = f"https://data.regionreunion.com/explore/assets/{DATASET}/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
# The fields taken, under the names given here; LEFT are those known and never taken. Any other stops the build.
KEPT = {"nature": "nature", "nom": "nom", "nom_de_qua": "quartier", "adresse": "adresse"}
LEFT = {"elu", "maire", "source", "date_d_exp", "geo_shape", "geo_point_2d"}
# The kinds of place that are a counter of the Ville in a quarter, in their order; the others the list holds, left out.
KINDS = ["Mairie annexe", "Centre municipal"]
OTHERS = {"Hôtel de Ville", "Ancien Hôtel de Ville"}
# What follows the postcode, as the list writes it, and its spelling.
LOCALITIES = {
    "St Denis": "Saint-Denis",
    "St DenisSt Denis": "Saint-Denis",
    "Ste Clotilde": "Sainte-Clotilde",
    "Ste Coltilde": "Sainte-Clotilde",
    "La Montagne": "La Montagne",
}
POSTCODE = re.compile(r"^(?P<rue>.*?)[\s,]*\b(?P<cp>974\d\d)\b\s*,?\s*(?P<lieu>.*)$")
last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300))


def address(text, corrections):
    """The street as written, a comma given its space; after the postcode, the locality spelled as LOCALITIES."""
    text = " ".join(text.split())
    m = POSTCODE.match(text)
    street = re.sub(r",(?=\S)", ", ", m["rue"] if m else text)
    if not m:
        out = street
    else:
        assert m["lieu"] in LOCALITIES, f"localité inconnue : {m['lieu']!r} ({text})"
        out = f"{street}, {m['cp']} {LOCALITIES[m['lieu']]}"
    if out != text:
        corrections.append((text, out))
    return out


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
    assert len(feats) == total, f"{len(feats)} lieux reçus, {total} annoncés"
    fields = {f["name"] for f in fiche["fields"]} | {k for f in feats for k in f["properties"]}
    unknown = fields - set(KEPT) - LEFT
    assert not unknown, f"champs inconnus, peut-être des noms de personnes : {sorted(unknown)}"
    exports = {f["properties"]["date_d_exp"] for f in feats}
    assert len(exports) == 1, exports
    export_du = datetime.strptime(exports.pop(), "%d/%m/%Y").date().isoformat()
    kinds = {f["properties"]["nature"] for f in feats}
    assert kinds <= set(KINDS) | OTHERS, kinds - set(KINDS) - OTHERS

    corrections, lieux = [], []
    for f in feats:
        pr = {KEPT[k]: v for k, v in f["properties"].items() if k in KEPT}
        if pr["nature"] not in KINDS:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        lieux.append({
            "nature": pr["nature"],
            "nom": " ".join(pr["nom"].split()),
            "quartier": " ".join(pr["quartier"].split()),
            "adresse": address(pr["adresse"], corrections),
            "lon": round(lon, 5),
            "lat": round(lat, 5),
        })
    lieux.sort(key=lambda x: (KINDS.index(x["nature"]), x["nom"]))
    print(f"{len(feats)} lieux (export du {export_du}), {len(lieux)} gardés : " +
          ", ".join(f"{sum(x['nature'] == k for x in lieux)} {k.lower()}" for k in KINDS))
    for before, after in corrections:
        print(f"  {before!r} -> {after!r}")
    dest = ROOT / "src/vie/mairies-annexes.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "export_du": export_du,
        "page": PAGE,
        "lieux": lieux,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"-> {dest.relative_to(ROOT)}, {dest.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
