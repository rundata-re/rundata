#!/usr/bin/env python3
"""Build src/routes/accidents.json: the road accidents with casualties of La Réunion, counted, bundled.

From the ministry of the Interior's « Bases de données annuelles des accidents corporels de la circulation routière »
on data.gouv.fr (ONISR, the national file BAAC, Licence Ouverte 2.0, one year a year): every accident with at least one
casualty recorded by the police or the gendarmerie. Kept: counts only. The latest year for the island, by kind of road
and by commune; the last five years for the island and the killed of each commune. Never an accident by itself (its
day, hour, address or point), nor a person or a vehicle: the files of the vehicles are not even read. The kind of road
only, never its number: the file writes it as free text, readable for fewer than half of the national roads'
accidents. The communes' casualties as one count: the split between « hospitalisé » and « léger » differs too much from
one to another, and the ONISR says the first is no longer certified since 2019. A user whose injury is not given
(grav -1, some of those who fled since 2021) is counted neither killed nor hurt.
The ONISR corrects its files after putting them online: the day they were read is kept with them.
Usage: python3 -I scripts/build-accidents.py [--dossier DIR]
"""
import argparse
import csv
import io
import json
import re
import time
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://www.data.gouv.fr/api/1/datasets/53698f4ca3a729239d2036df/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
YEARS = 5
# The files' titles change from a year to another (« carcteristiques-2022.csv », « caract-2023.csv », « Caract_2024.csv »):
# found by their kind and year.
TITLE = re.compile(r"(car|usagers|lieux)[a-z]*[-_](\d{4})\.csv", re.I)
# The communes by INSEE code, as in src/places/insee.ts.
COMMUNES = [f"974{n:02d}" for n in range(1, 25)]
# The file's kinds of road (catr), as the island has them: no motorway, no « route de métropole urbaine ».
ROUTES = {"2": "nationales", "3": "departementales", "4": "communales"}
last = [0.0]


def opened(url):
    """One request a minute at most."""
    wait = last[0] + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300)


def resources():
    """The dataset's page, and its files by year and kind: {2025: {"car": resource, "usagers": …, "lieux": …}}."""
    meta = json.load(opened(DATASET))
    by = {}
    for r in meta["resources"]:
        m = TITLE.fullmatch(r["title"].strip())
        if m:
            kind = m[1].lower()
            assert kind not in by.get(int(m[2]), {}), r["title"]
            by.setdefault(int(m[2]), {})[kind] = r
    return meta["page"], by


def rows(raw):
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))


def year_of(y, car, usagers):
    """A year's accidents of the island by number, with their commune, and the injury of their users."""
    key = "Num_Acc" if "Num_Acc" in car[0] else "Accident_Id"  # « Accident_Id » in 2022 only
    acc = {r[key]: r for r in car if r["dep"].strip() == "974"}
    assert acc and {r["com"] for r in acc.values()} <= set(COMMUNES), (y, sorted({r["com"] for r in acc.values()} - set(COMMUNES)))
    assert {int(r["an"]) for r in acc.values()} == {y}
    grav = {k: Counter() for k in acc}
    for u in usagers:
        if u["Num_Acc"] in grav:
            grav[u["Num_Acc"]][u["grav"].strip()] += 1
    # gravité: 1 unhurt, 2 killed (within 30 days), 3 in hospital more than 24 h, 4 lightly hurt, -1 not given.
    assert set().union(*grav.values()) <= {"1", "2", "3", "4", "-1"}, y
    assert all(grav.values()), (y, "an accident without any user")
    return acc, grav


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dossier", help="a local copy of the files, caract-2025.csv, usagers-2025.csv, lieux-2025.csv…")
    a = p.parse_args()
    page, by = resources()
    year = max(y for y, f in by.items() if {"car", "usagers", "lieux"} <= set(f))
    years = list(range(year - YEARS + 1, year + 1))
    assert all({"car", "usagers"} <= set(by[y]) for y in years), years

    def read(y, kind):
        if a.dossier:
            return (Path(a.dossier) / f"{'caract' if kind == 'car' else kind}-{y}.csv").read_bytes()
        return opened(by[y][kind]["url"]).read()

    serie, tues = {}, {c: [] for c in COMMUNES}
    for y in years:
        acc, grav = year_of(y, rows(read(y, "car")), rows(read(y, "usagers")))
        g = sum(grav.values(), Counter())
        serie[str(y)] = {"accidents": len(acc), "tues": g["2"], "hospitalises": g["3"], "legers": g["4"], "gravite_inconnue": g["-1"]}
        for c in COMMUNES:
            tues[c].append(sum(grav[k]["2"] for k, r in acc.items() if r["com"] == c))
    lieux = {r["Num_Acc"]: r for r in rows(read(year, "lieux")) if r["Num_Acc"] in acc}
    assert set(lieux) == set(acc), (len(acc), len(lieux))

    def count(keys):
        g = sum((grav[k] for k in keys), Counter())
        return {"accidents": len(keys), "tues": g["2"], "blesses": g["3"] + g["4"]}

    ile = count(list(acc)) | {
        "mortels": sum(1 for k in acc if grav[k]["2"]),
        "hospitalises": serie[str(year)]["hospitalises"],
        "legers": serie[str(year)]["legers"],
    }
    routes = {name: count([k for k, l in lieux.items() if l["catr"].strip() == c]) for c, name in ROUTES.items()}
    routes["autres"] = count([k for k, l in lieux.items() if l["catr"].strip() not in ROUTES])
    communes = {c: count([k for k, r in acc.items() if r["com"] == c]) for c in COMMUNES}
    assert sum(r["accidents"] for r in routes.values()) == sum(c["accidents"] for c in communes.values()) == ile["accidents"]
    assert sum(c["tues"] for c in communes.values()) == ile["tues"]
    assert [sum(t[i] for t in tues.values()) for i in range(YEARS)] == [serie[str(y)]["tues"] for y in years]
    online = sorted(by[y][k]["created_at"][:10] for y in years for k in ("car", "usagers"))
    dest = ROOT / "src/routes/accidents.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "annee": year,
        "publie_le": max(by[year][k]["created_at"][:10] for k in ("car", "usagers", "lieux")),
        "source": "Ministère de l'Intérieur (ONISR), bases de données annuelles des accidents corporels de la circulation routière (fichier BAAC), Licence Ouverte 2.0",
        "page": page,
        "ile": ile,
        "routes": routes,
        "communes": communes,
        # The last five years, each from its file as read on « construit ».
        "serie": {"annees": years, "mis_en_ligne": [online[0], online[-1]], "ile": serie, "tues": tues},
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{years[0]}-{year}: {[serie[str(y)]['tues'] for y in years]} tués, {ile} -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
