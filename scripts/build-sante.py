#!/usr/bin/env python3
"""Build src/sante/etablissements.json: the pharmacies, hospitals and clinics of La Réunion, bundled with the server.

From FINESS, the national register of health and social establishments (ministry of health, published on
data.gouv.fr, Licence Ouverte): the establishments of La Réunion (département 9D) that are a pharmacy (category 620),
a hospital (CHU sites, centres hospitaliers: 101, 355) or a clinic (365, 128), without the psychiatric sites, the
rehabilitation sites and the hospital pharmacies. FINESS says neither the opening hours nor which have an emergency
department: the tool says so, and sends to the 15. Coordinates are given in RGR92 / UTM 40S (EPSG:2975).
A point more than MAX_KM from its address, geocoded by the Géoplateforme (IGN, etalab-2.0), is put at the address: FINESS
placed a pharmacy of Mont-Vert-les-Hauts in the centre of Saint-Pierre, 7.8 km away (04/11/2026).
Usage: python3 -I scripts/build-sante.py [--csv etalab-cs1100507-stock.csv | --recaler]
  --recaler: only the check of the points against their addresses, on the list as it is, without reading FINESS again.
"""
import argparse
import csv
import io
import json
import math
import re
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://www.data.gouv.fr/api/1/datasets/53699569a3a729239d2046eb/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
PHARMACY, HOSPITALS, CLINICS = {"620"}, {"101", "355"}, {"365", "128"}
NOT_ACUTE = re.compile(r"\b(PSY|PUI|SSR|USLD|EHPAD)\b")
GEOCODE = "https://data.geopf.fr/geocodage/search/csv"
# As scripts/build-decheteries-ademe.py: past this, the point is not at its address; below that score, another street.
MAX_KM = 1
MIN_SCORE = 0.7

STREETS = {"R": "rue", "AV": "avenue", "BD": "boulevard", "CHE": "chemin", "CHEM": "chemin", "RTE": "route", "PL": "place",
           "ALL": "allée", "IMP": "impasse", "LOT": "lotissement", "RES": "résidence", "QUA": "quartier", "QU": "quai", "CRS": "cours",
           "SQ": "square", "PASS": "passage", "LD": "lieu-dit", "ZA": "ZA", "ZI": "ZI", "ZAC": "ZAC", "CC": "centre commercial",
           "RLE": "ruelle", "SEN": "sentier", "PRV": "parvis", "ESP": "esplanade", "PRO": "promenade", "CTRE": "centre", "VOIE": "voie", "CHS": "chaussée"}
SMALL = {"de", "du", "des", "la", "le", "les", "et", "d", "l", "à", "au", "aux", "en", "sur"}
KEEP = {"CHU", "CHOR", "GHER", "CH", "ZA", "ZI", "ZAC", "RN", "RD", "CD", "II", "III", "IV"}
# The company's form before or after a pharmacy's name: « SELARL PHARMACIE DU CENTRE ».
FORMS = re.compile(r"\b(SELARL|SELEURL|SELAS|SELAFA|SELCA|SARL|EURL|SNC|SAS|SA|SPFPL)\b\.?", re.I)


def utm40s(x, y):
    """RGR92 / UTM zone 40S (GRS80, as good as WGS84 here) to longitude and latitude."""
    a, f, k0 = 6378137.0, 1 / 298.257222101, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x -= 500000.0
    y -= 10000000.0
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    p = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
         + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    c1 = ep2 * math.cos(p) ** 2
    t1 = math.tan(p) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = p - (n1 * math.tan(p) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
                                         + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(p)
    return round(57 + math.degrees(lon), 5), round(math.degrees(lat), 5)


def titled(s, lead=False):
    """« PHARMACIE DU CENTRE » → « Pharmacie du Centre »; acronyms kept. `lead`: a small word may start it (« de Paris »)."""
    words = re.split(r"(\s+|-|'|\(|\))", re.sub(r"\s+", " ", s or "").strip())
    out = []
    for i, w in enumerate(words):
        if not w.strip() or w in "-'()":
            out.append(w)
        elif w.upper() in KEEP:
            out.append(w.upper())
        elif w.lower() in SMALL and (i or lead):
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return "".join(out).replace("St ", "Saint-").replace("Ste ", "Sainte-")


def phone(s):
    d = re.sub(r"\D", "", s or "")
    return " ".join(d[i:i + 2] for i in range(0, 10, 2)) if len(d) == 10 else None


def km(a, b):
    x = math.radians(b["lon"] - a["lon"]) * math.cos(math.radians((a["lat"] + b["lat"]) / 2))
    return 6371 * math.hypot(x, math.radians(b["lat"] - a["lat"]))


def geocoded(sites, codes):
    """Each address placed by the Géoplateforme, in one request for them all: only one found to its number or its street,
    surely enough (as scripts/build-decheteries-ademe.py)."""
    body = io.StringIO()
    w = csv.writer(body)
    w.writerow(["adresse", "citycode"])
    for s in sites:
        w.writerow([s["adresse"], codes.get(s["commune"], "")])
    boundary = "etablissements"
    data = (f'--{boundary}\r\nContent-Disposition: form-data; name="data"; filename="sites.csv"\r\nContent-Type: text/csv\r\n\r\n'
            f'{body.getvalue()}\r\n--{boundary}\r\nContent-Disposition: form-data; name="columns"\r\n\r\nadresse\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="citycode"\r\n\r\ncitycode\r\n--{boundary}--\r\n').encode()
    req = urllib.request.Request(GEOCODE, data=data, headers={**UA, "Content-Type": f"multipart/form-data; boundary={boundary}"})
    rows = list(csv.DictReader(io.StringIO(urllib.request.urlopen(req, timeout=120).read().decode("utf-8-sig"))))
    return [{"lon": float(r["longitude"]), "lat": float(r["latitude"]), "label": r["result_label"]}
            if r["result_type"] in ("housenumber", "street") and float(r["result_score"] or 0) >= MIN_SCORE else None for r in rows]


def placed(out, names):
    """The points more than MAX_KM from their address put at it; what was moved, said."""
    codes = {nom: code for code, nom in names.items()}
    moved = []
    for e, at in zip(out, geocoded(out, codes)):
        if at and km(e, at) > MAX_KM:
            moved.append(f"{e['nom']} ({e['commune']}) : {km(e, at):.1f} km de « {at['label']} »")
            e["lon"], e["lat"] = round(at["lon"], 5), round(at["lat"], 5)
    print("placés à leur adresse :", moved)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="the file etalab-cs1100507-stock-*.csv, else downloaded")
    ap.add_argument("--recaler", action="store_true", help="only check the current list's points against their addresses")
    args = ap.parse_args()
    # The communes by INSEE code, as the server spells them (src/places/insee.ts).
    names = {code: nom for nom, code in re.findall(r'"([^"]+)": "(974\d\d)"', (ROOT / "src/places/insee.ts").read_text())}
    dest = ROOT / "src/sante/etablissements.json"
    if args.recaler:
        doc = json.loads(dest.read_text())
        placed(doc["etablissements"], names)
        dest.write_text(json.dumps(doc, ensure_ascii=False, indent=0) + "\n")
        return
    if args.csv:
        text = Path(args.csv).read_text(encoding="utf-8")
    else:
        meta = json.load(urllib.request.urlopen(urllib.request.Request(DATASET, headers=UA), timeout=120))
        url = next(r["url"] for r in meta["resources"] if "cs1100507" in r["url"])
        text = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900).read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(text), delimiter=";"))
    made = rows[0][3] if rows and rows[0][0] == "finess" else None
    where = {r[1]: (float(r[2]), float(r[3])) for r in rows if r and r[0] == "geolocalisation" and r[1].startswith("970") and r[2] and r[3]}
    out = []
    for r in rows:
        if not r or r[0] != "structureet" or r[13] != "9D":
            continue
        cat = r[18]
        kind = "pharmacie" if cat in PHARMACY else "hopital" if cat in HOSPITALS else "clinique" if cat in CLINICS else None
        if not kind or (kind != "pharmacie" and NOT_ACUTE.search(r[3] + " " + r[4])):
            continue
        xy = where.get(r[1])
        if not xy:
            continue
        lon, lat = utm40s(*xy)
        # The number and its complement (« 4B »), the kind of way, its name; the locality, not a postal box.
        street = " ".join(x for x in [f"{r[7]}{r[10]}", STREETS.get(r[8], r[8].lower() if r[8] else ""), titled(r[9], lead=True)] if x).strip()
        place = titled(r[11]) if r[11] and not re.match(r"^(BP|CS|TSA)\b", r[11]) else ""
        commune = names.get(f"974{r[12][-2:]}")
        out.append({
            "finess": r[1],
            "type": kind,
            "nom": titled(re.sub(r"\s+", " ", FORMS.sub("", r[4] or r[3])).strip(" -")).replace("( ", "("),
            "adresse": ", ".join(x for x in [street, place] if x),
            "commune": commune or titled(r[15][6:]),
            "telephone": phone(r[16]),
            "lon": lon,
            "lat": lat,
        })
    out.sort(key=lambda e: (e["type"], e["commune"], e["nom"]))
    placed(out, names)
    dest.write_text(json.dumps({"construit": date.today().isoformat(), "extraction": made, "source": "FINESS (ministère de la Santé), Licence Ouverte 2.0", "etablissements": out}, ensure_ascii=False, indent=0) + "\n")
    print(dest, {k: sum(e["type"] == k for e in out) for k in ("pharmacie", "hopital", "clinique")})


if __name__ == "__main__":
    main()
