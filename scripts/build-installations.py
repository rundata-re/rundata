#!/usr/bin/env python3
"""Build src/electricite/installations.json: the power installed in each commune of La Réunion, filière by filière.

From the national register of the installations that produce or store electricity (RTE, with EDF SEI for La Réunion),
as EDF SEI publishes it for the island on opendata-reunion.edf.fr (data-fair, no key). The register gives each
installation's filière, power and commune, never its position, and hides most names (« Confidentiel »): the commune
and the filière are kept, summed. The small solar roofs come as one line per commune (« Agrégation des
installations de moins de 36KW »), counted with their number of installations, and summed apart (`moins_de_36_kw`).
The biggest installations of each filière (GRANDES) are kept one by one, for /electricite's section « Les filières »:
their commune, their MW and their name when the register gives one.
The date kept is the dataset's own update by EDF SEI (`dataUpdatedAt`): the one date true for the whole file (the
lines' versions differ, its description says another).
Licence Ouverte. Two requests to the portal, a minute apart. Usage: python3 -I scripts/build-installations.py
[--lines lines.json --meta meta.json]
"""
import argparse
import json
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://opendata-reunion.edf.fr/data-fair/api/v1/datasets/2ne0caym1gcwtbpsdtb3u511"
UA = {"User-Agent": "rundata.re (contact@rundata.re)"}
# The register's filières, in its words, lower-cased: the names the page says.
FILIERES = {
    "Bioénergies": "bioénergies",
    "Solaire": "solaire",
    "Hydraulique": "hydraulique",
    "Eolien": "éolien",
    "Thermique non renouvelable": "thermique non renouvelable",
    "Stockage non hydraulique": "stockage non hydraulique",
}
# The installations kept one by one: of at least GRANDES_MW, at most GRANDES_N per filière, the biggest first.
GRANDES_MW = 4.5
GRANDES_N = 7
AGREGATION = "Agrégation des installations de moins de 36KW"


def read(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", help="the lines already read (lines?size=1000)")
    ap.add_argument("--meta", help="the dataset's description already read")
    a = ap.parse_args()
    meta = json.load(open(a.meta)) if a.meta else read(DATASET)
    if not a.lines:
        time.sleep(62)
    lines = json.load(open(a.lines)) if a.lines else read(f"{DATASET}/lines?size=1000")
    rows = lines["results"]
    if lines.get("total", len(rows)) > len(rows):
        raise SystemExit(f"registre : {lines['total']} lignes, {len(rows)} lues")
    out = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
    grandes = defaultdict(list)
    petites = [0.0, 0]
    left = []
    for r in rows:
        nom = FILIERES.get(r.get("filiere"))
        if not nom:
            raise SystemExit(f"registre : filière inconnue {r.get('filiere')!r}")
        if not r.get("commune"):
            left.append(r)
            continue
        f = out[r["commune"]][nom]
        f[0] += (r.get("puismaxinstallee") or 0) / 1000
        f[1] += r.get("nbinstallations") or 0
        mw = (r.get("puismaxinstallee") or 0) / 1000
        if r.get("nominstallation") == AGREGATION:
            petites[0] += mw
            petites[1] += r.get("nbinstallations") or 0
        elif r.get("nbinstallations") == 1 and mw >= GRANDES_MW:
            nom_i = r.get("nominstallation")
            grandes[nom].append({"commune": r["commune"], "mw": round(mw, 2), **({"nom": nom_i} if nom_i and nom_i != "Confidentiel" else {})})
    # The day in La Réunion of the dataset's update.
    maj = (datetime.fromisoformat(meta["dataUpdatedAt"].replace("Z", "+00:00")) + timedelta(hours=4)).date().isoformat()
    communes = [
        {"commune": c, "filieres": [{"nom": n, "mw": round(mw, 2), "installations": k} for n, (mw, k) in sorted(fs.items(), key=lambda x: -x[1][0])]}
        for c, fs in sorted(out.items())
    ]
    data = {
        "mis_a_jour": maj,
        "communes": communes,
        "grandes": {n: sorted(gs, key=lambda g: (-g["mw"], g["commune"]))[:GRANDES_N] for n, gs in sorted(grandes.items())},
        "moins_de_36_kw": {"mw": round(petites[0], 2), "installations": petites[1]},
    }
    path = ROOT / "src/electricite/installations.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    total = sum(f["mw"] for c in communes for f in c["filieres"])
    print(f"{path.relative_to(ROOT)} : {len(communes)} communes, {total:.1f} MW, mis à jour le {maj}"
          f"{f', {len(left)} ligne(s) sans commune laissée(s) de côté ({sum((r.get("puismaxinstallee") or 0) for r in left) / 1000:.2f} MW)' if left else ''}")


if __name__ == "__main__":
    main()
