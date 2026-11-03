#!/usr/bin/env python3
"""Build src/routes/accidents.json: the road accidents with casualties of La Réunion over a year, counted, bundled.

From the ministry of the Interior's « Bases de données annuelles des accidents corporels de la circulation routière »
on data.gouv.fr (ONISR, the national file BAAC, Licence Ouverte 2.0, one year a year): every accident with at least one
casualty recorded by the police or the gendarmerie. Kept: counts only, for the island, by kind of road and by commune.
Never an accident by itself (its day, hour, address or point), nor a person or a vehicle: the files of the vehicles are
not even read. The kind of road only, never its number: the file writes it as free text, readable for fewer than half
of the national roads' accidents. The communes' casualties as one count: the split between « hospitalisé » and
« léger » differs too much from one to another, and the ONISR says the first is no longer certified since 2019.
Usage: python3 -I scripts/build-accidents.py [--dossier DIR --du 2026-10-30]
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
FILES = ("caract", "lieux", "usagers")
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


def latest():
    """The newest year with its three files, their URLs, the day they were put online and the dataset's page."""
    meta = json.load(opened(DATASET))
    by = {}
    for r in meta["resources"]:
        m = re.fullmatch(r"(Caract|Lieux|Usagers)_(\d{4})\.csv", r["title"])
        if m:
            by.setdefault(int(m[2]), {})[m[1].lower()] = r
    year = max(y for y, f in by.items() if set(f) == set(FILES))
    return year, {k: r["url"] for k, r in by[year].items()}, max(r["last_modified"][:10] for r in by[year].values()), meta["page"]


def rows(raw):
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dossier", help="a local copy of the three files: caract-2025.csv, lieux-2025.csv, usagers-2025.csv")
    p.add_argument("--du", help="the day of that copy, 2026-10-30")
    p.add_argument("--annee", type=int, help="its year")
    a = p.parse_args()
    if a.dossier:
        year, day, page = a.annee, a.du, DATASET.replace("/api/1/", "/")
        raw = {k: (Path(a.dossier) / f"{k}-{year}.csv").read_bytes() for k in FILES}
    else:
        year, urls, day, page = latest()
        raw = {k: opened(urls[k]).read() for k in FILES}
    car = {r["Num_Acc"]: r for r in rows(raw["caract"]) if r["dep"] == "974"}
    lieux = {r["Num_Acc"]: r for r in rows(raw["lieux"]) if r["Num_Acc"] in car}
    usagers = [r for r in rows(raw["usagers"]) if r["Num_Acc"] in car]
    assert car and set(lieux) == set(car), (len(car), len(lieux))
    assert {r["com"] for r in car.values()} <= set(COMMUNES), sorted({r["com"] for r in car.values()} - set(COMMUNES))
    assert all(int(r["an"]) == year for r in car.values())
    # gravité: 1 unhurt, 2 killed (within 30 days), 3 in hospital more than 24 h, 4 lightly hurt.
    assert {u["grav"].strip() for u in usagers} <= {"1", "2", "3", "4"}, sorted({u["grav"] for u in usagers})
    grav = {k: Counter(u["grav"].strip() for u in usagers if u["Num_Acc"] == k) for k in car}

    def count(keys):
        g = Counter()
        for k in keys:
            g.update(grav[k])
        return {"accidents": len(keys), "tues": g["2"], "blesses": g["3"] + g["4"]}

    ile = count(list(car)) | {
        "mortels": sum(1 for k in car if grav[k]["2"]),
        "hospitalises": sum(g["3"] for g in grav.values()),
        "legers": sum(g["4"] for g in grav.values()),
    }
    routes = {name: count([k for k, l in lieux.items() if l["catr"].strip() == c]) for c, name in ROUTES.items()}
    routes["autres"] = count([k for k, l in lieux.items() if l["catr"].strip() not in ROUTES])
    communes = {c: count([k for k, r in car.items() if r["com"] == c]) for c in COMMUNES}
    assert sum(r["accidents"] for r in routes.values()) == sum(c["accidents"] for c in communes.values()) == ile["accidents"]
    assert sum(c["tues"] for c in communes.values()) == ile["tues"]
    dest = ROOT / "src/routes/accidents.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "annee": year,
        "publie_le": day,
        "source": "Ministère de l'Intérieur (ONISR), bases de données annuelles des accidents corporels de la circulation routière (fichier BAAC), Licence Ouverte 2.0",
        "page": page,
        "ile": ile,
        "routes": routes,
        "communes": communes,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{year}: {ile} -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
