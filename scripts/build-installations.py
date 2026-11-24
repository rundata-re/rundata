#!/usr/bin/env python3
"""Build src/electricite/installations.json: the power installed in each commune of La Réunion, filière by filière.

From the national register of the installations that produce or store electricity (RTE, with EDF SEI for La Réunion),
as EDF SEI publishes it for the island on opendata-reunion.edf.fr (data-fair, no key). The register gives each
installation's filière, power and commune, never its position, and hides most names (« Confidentiel »): the commune
and the filière are kept, summed. The small solar roofs come as one line per commune (« Agrégation des
installations de moins de 36KW »), counted with their number of installations, and summed apart (`moins_de_36_kw`).
The biggest installations of each filière (GRANDES) are kept one by one, for /electricite's section « Les filières »:
their commune, their MW and their name when the register gives one.
Some big installations are in the register twice, under two EIC codes (EDF SEI's register of November 2026): an old line,
its version of the day it was put in service, and a new one. The CRE gives one plant where the register gives two:
Port Est, « 12 moteurs de 17,56 MW, pour une puissance totale de 211 MWe… mise en service progressivement entre
décembre 2012 et octobre 2013 » (délibération 2022-274), and Le Gol A, « mise en service en 1996, 56,9 MW »
(délibération 2022-65), there in 1995 and 1996. Those are counted once (doublons(), kept in `doublons_fusionnes`).
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
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
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
# Two lines are one installation when they are of one commune, one filière and one power, put in service a year apart
# at most. Only from GRANDES_MW: below it, many roofs of one power are put in service the same year in one commune
# (32 of 240 kW at Saint-Pierre in 2015, 24/11/2026), and nothing tells them from twins.
DOUBLON_ANS = 1


def read(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))


def doublons(rows):
    """The register's lines, each big installation once (see DOUBLON_ANS), and the groups merged: the line kept is the
    newest version (`datedebutversion`). Lines of one commune, filière and power, put in service years apart, stay
    apart: La Possession's two turbines of 40 MW, of 2002 and of 2009, each in the register twice, stay two."""
    kept, merged, groups = [], [], defaultdict(list)
    for r in rows:
        mw = (r.get("puismaxinstallee") or 0) / 1000
        if r.get("nbinstallations") == 1 and mw >= GRANDES_MW and r.get("commune") and r.get("nominstallation") != AGREGATION:
            groups[(r["commune"], r.get("filiere"), r.get("puismaxinstallee"))].append(r)
        else:
            kept.append(r)
    for (commune, filiere, puissance), rs in sorted(groups.items(), key=lambda kv: tuple(map(str, kv[0]))):
        clusters = []
        for r in sorted(rs, key=lambda r: r.get("datemiseenservice") or ""):
            year = int((r.get("datemiseenservice") or "0")[:4])
            same = next((c for c in clusters if abs(c[0] - year) <= DOUBLON_ANS), None)
            if same:
                same[1].append(r)
            else:
                clusters.append([year, [r]])
        for _, c in clusters:
            kept.append(max(c, key=lambda r: r.get("datedebutversion") or ""))
            if len(c) > 1:
                merged.append({"commune": commune, "filiere": FILIERES.get(filiere, filiere), "mw": round(puissance / 1000, 2),
                               "mises_en_service": sorted((r.get("datemiseenservice") or "")[:10] for r in c)})
    return kept, merged


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
    rows, merged = doublons(rows)
    for m in merged:
        print(f"doublon du registre compté une fois : {m['commune']}, {m['filiere']}, {m['mw']} MW, en service {', '.join(m['mises_en_service'])}")
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
        "doublons_fusionnes": merged,
    }
    path = ROOT / "src/electricite/installations.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    total = sum(f["mw"] for c in communes for f in c["filieres"])
    print(f"{path.relative_to(ROOT)} : {len(communes)} communes, {total:.1f} MW, mis à jour le {maj}"
          f"{f', {len(left)} ligne(s) sans commune laissée(s) de côté ({sum((r.get("puismaxinstallee") or 0) for r in left) / 1000:.2f} MW)' if left else ''}")


if __name__ == "__main__":
    main()
