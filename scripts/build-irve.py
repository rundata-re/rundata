#!/usr/bin/env python3
"""Build src/irve/stations.json: the public charging stations for electric cars on La Réunion, bundled with the server.

From the national base of charging points (IRVE, static data) as consolidated each day by transport.data.gouv.fr:
the points on the island, grouped by station, with where it is, who set it up, its hours and each point's power and
plugs. Whether each point is free, taken or out of order now comes from the live file of the same national access
point (src/providers/irve.ts), joined on the point's id (`id_pdc_itinerance`).

The file is large (about 130 Mo, all of France); only the rows of La Réunion are kept. A station's commune is its
official name from geo.api.gouv.fr, by its position: the addresses often lack the INSEE code.
Licence Ouverte 2.0. Usage: python3 -I scripts/build-irve.py [--csv consolidation.csv]
"""
import argparse
import csv
from datetime import date
import importlib.util
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# A roaming id: « FR » and the operator's code (FRFR1E…, FREZD…, FRAEH…).
ITINERANCE = re.compile(r"^FR[A-Z0-9]{3}")
ROOT = Path(__file__).resolve().parent.parent
STATIC = "https://transport.data.gouv.fr/resources/84013/download"
COMMUNE_AT = "https://geo.api.gouv.fr/communes?fields=nom&format=json&"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
LON0, LAT0, LON1, LAT1 = 55.1, -21.5, 55.9, -20.8

PLUGS = [("prise_type_2", "Type 2"), ("prise_type_combo_ccs", "Combo CCS"), ("prise_type_chademo", "CHAdeMO"),
         ("prise_type_ef", "prise domestique"), ("prise_type_autre", "autre prise")]
DAYS = {"Mo": 0, "Tu": 1, "We": 2, "Th": 3, "Fr": 4, "Sa": 5, "Su": 6}
DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
# The brand a driver knows, from the operator's (the app or card that starts the charge).
NETWORKS = [("Freshmile", "Freshmile"), ("Road", "EZDrive"), ("EZDRIVE", "EZDrive"), ("Ezdrive", "EZDrive"),
            ("E.Leclerc", "E.Leclerc"), ("WattzHub", "WattzHub")]


def opened(r):
    return urllib.request.urlopen(urllib.request.Request(r, headers=UA), timeout=300)


def hhmm(t, minutes):
    """The kit's hours (the brand kit, « Heures »): « 18\u00a0h » for a round hour, « 09:15 » when one of the
    station's hours has minutes, so that a station has one way of writing them."""
    h, m = t.split(":")
    return t if minutes else f"{int(h)}\u00a0h"


def hours(text):
    """« 24/7 », « Mo,Tu… 08:00-18:00 » (the schema's OpenStreetMap-like syntax) in words."""
    text = text.strip()
    if text in ("", "24/7"):
        return "24\u00a0h/24, 7\u00a0j/7" if text else ""
    groups = re.findall(r"((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(\d\d:\d\d)-(\d\d:\d\d)", text)
    if not groups:
        return text
    minutes = any(t[3:] != "00" for _, a, b in groups for t in (a, b))
    by_time = {}
    for days, a, b in groups:
        for d in days.split(","):
            # A span with an en dash and no space around it: « 8\u00a0h–18\u00a0h », « 09:15–18:45 ».
            by_time.setdefault(f"{hhmm(a, minutes)}–{hhmm(b, minutes)}", set()).add(DAYS[d])
    parts = []
    for span, days in sorted(by_time.items(), key=lambda kv: min(kv[1])):
        days = sorted(days)
        if len(days) == 7:
            label = "tous les jours"
        elif days == list(range(days[0], days[-1] + 1)) and len(days) > 2:
            label = f"du {DAY_NAMES[days[0]]} au {DAY_NAMES[days[-1]]}"
        else:
            label = ", ".join(DAY_NAMES[d] for d in days)
        parts.append(f"{label} {span}")
    return "\u00a0; ".join(parts)


def address(text):
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r",?\s*France$", "", text)
    return re.sub(r"\s*974\d\d\b", "", text).strip(" ,")


def network(r):
    for key, name in NETWORKS:
        if key in r["nom_operateur"] or key in r["nom_enseigne"]:
            return name
    return r["nom_enseigne"].strip() or r["nom_operateur"].strip()


def place_name(r):
    """Who set the station up, when it names the place (« Decathlon Saint-Denis », « E.Leclerc, Le Tampon »)."""
    name = re.sub(r"\s+", " ", r["nom_amenageur"]).strip()
    return "" if name.upper() in ("", "MISSING") else name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="the consolidated file, already downloaded")
    ap.add_argument("--verifier", type=int, metavar="ECART", help="write nothing: compare with src/irve/stations.json, fail past ECART points added or gone")
    args = ap.parse_args()
    src = open(args.csv, encoding="utf-8") if args.csv else io.TextIOWrapper(opened(STATIC), encoding="utf-8")
    rows = []
    for r in csv.DictReader(src):
        try:
            lon, lat = float(r["consolidated_longitude"]), float(r["consolidated_latitude"])
        except ValueError:
            continue
        # An operator's longitude and latitude given the other way round (EZDrive, Le Tampon, 24/11/2026): put back.
        if LAT0 < lon < LAT1 and LON0 < lat < LON1:
            lon, lat = lat, lon
        if r["code_insee_commune"].startswith("974") and not (LON0 < lon < LON1 and LAT0 < lat < LAT1):
            print(f"hors de l'île, laissé de côté : {r['id_pdc_itinerance']} ({lon}, {lat})", file=sys.stderr)
            continue
        if r["code_insee_commune"].startswith("974") or (LON0 < lon < LON1 and LAT0 < lat < LAT1):
            rows.append((r, lon, lat))
    stations = {}
    for r, lon, lat in rows:
        sid = r["id_station_itinerance"]
        # « Non concerné » for a station outside the roaming network (EZDrive, Saint-Louis): its address and point instead,
        # never one station for all of them, and its first point's id later, for its anchor on /bornes.
        key = sid if ITINERANCE.match(sid) else ("", r["adresse_station"], lon, lat)
        s = stations.setdefault(key, {
            "id": sid,
            "nom": place_name(r),
            "reseau": network(r),
            "adresse": address(r["adresse_station"]),
            "lon": round(lon, 5),
            "lat": round(lat, 5),
            "implantation": r["implantation_station"],
            "horaires": hours(r["horaires"]),
            **({"tarif": r["tarification"].strip()} if r["tarification"].strip() else {}),
            **({"gratuit": True} if r["gratuit"] == "true" else {}),
            **({"acces_reserve": True} if r["condition_acces"] == "Accès réservé" else {}),
            "points": [],
        })
        if any(p["id"] == r["id_pdc_itinerance"] for p in s["points"]):
            continue
        kw = float(r["puissance_nominale"] or 0)
        s["points"].append({
            "id": r["id_pdc_itinerance"],
            "kw": round(kw, 1) if kw % 1 else int(kw),
            "prises": [name for col, name in PLUGS if r[col] == "true"],
        })
    for s in stations.values():
        s["points"].sort(key=lambda p: p["id"])
        if not ITINERANCE.match(s["id"]):
            s["id"] = s["points"][0]["id"]
    out = sorted(stations.values(), key=lambda s: s["id"])
    if args.verifier is not None:
        sys.exit(verifier(out, args.verifier))
    for s in out:
        found = json.load(opened(COMMUNE_AT + urllib.parse.urlencode({"lon": s["lon"], "lat": s["lat"]})))
        s["commune"] = found[0]["nom"] if found else ""
    target = ROOT / "src/irve/stations.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "attribution": "Base nationale des IRVE, consolidée par transport.data.gouv.fr (Licence Ouverte 2.0)",
        "stations": out,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{target.relative_to(ROOT)} : {len(out)} stations, {sum(len(s['points']) for s in out)} points de charge")


def _commun():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def verifier(out, ecart):
    """The bundled list against the national base of today, without writing (nor asking geo.api.gouv.fr anything): its
    points by their id. 1 (an aged list: a warning, the job stays green) when more than `ecart` were added or are gone: a point gone is
    said « sans information » by the tool and /bornes, a point added is not shown at all."""
    bundled = json.loads((ROOT / "src/irve/stations.json").read_text())
    before = {p["id"]: s["nom"] for s in bundled["stations"] for p in s["points"]}
    now = {p["id"]: f'{s["nom"]}, {s["adresse"]}' for s in out for p in s["points"]}
    added, gone = sorted(set(now) - set(before)), sorted(set(before) - set(now))
    print(f"liste du {bundled['construit']} : {len(before)} points ; base nationale aujourd'hui : {len(now)}, {len(added)} nouveaux, {len(gone)} disparus")
    for i in added[:20]:
        print(f"  nouveau : {i} ({now[i]})")
    for i in gone[:20]:
        print(f"  disparu : {i} ({before[i]})")
    if len(added) + len(gone) > ecart:
        return _commun().vieillie("Bornes de recharge", "build-irve.py", "la base nationale des IRVE", ecart=len(added) + len(gone),
                                   consigne=f"{len(added) + len(gone)} écarts, seuil {ecart}. Lancer scripts/build-irve.py et proposer la PR.")
    return 0


if __name__ == "__main__":
    main()
