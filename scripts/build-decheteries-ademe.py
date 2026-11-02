#!/usr/bin/env python3
"""Build src/vie/decheteries-ademe.json: the déchèteries outside the Territoire de l'Ouest, bundled.

From the ADEME's directory of déchèteries (SINOE, data.ademe.fr, Licence Ouverte): each site of La Réunion at the
latest survey, with its address, commune and position. A site whose point is more than a kilometre from its address,
as the Géoplateforme places it (one request for all), is put at its address. A site last seen at an older survey is
left out: the directory no longer lists it. The TCO's sites are not taken: src/vie/decheteries.json has them, with
what their skips take. The directory gives no opening hours, and none are taken from anywhere else: the answer links
to the intercommunalité's site.
Usage: python3 -I scripts/build-decheteries-ademe.py
"""
import csv
import io
import json
import math
import re
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://data.ademe.fr/data-fair/api/v1/datasets/sinoe-(r)-annuaire-des-decheteries-dma"
URL = DATASET + '/lines?qs=C_DEPT:"974"&size=1000'
GEOCODE = "https://data.geopf.fr/geocodage/search/csv"
# Past this, the directory's point is not at its address: the address's, geocoded, is taken (« ZAC Roland Hoareau »,
# 66 rue Saint-Louis, placed 6.7 km away in the directory).
MAX_KM = 1
MIN_SCORE = 0.7
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
NAMES = {code: nom for nom, code in re.findall(r'"([^"]+)": "(974\d\d)"', (ROOT / "src/places/insee.ts").read_text())}
GAZETTEER = json.loads((ROOT / "src/places/gazetteer.json").read_text())["places"]
TCO = {s["commune"] for s in json.loads((ROOT / "src/vie/decheteries.json").read_text())["sites"]}

ARTICLES = {"le", "la", "les", "l"}
# The words a street's name keeps in lowercase (« Rue des Lilas »), and the directory's abbreviations of its kinds.
SMALL = {"de", "des", "du", "d", "la", "le", "les", "l", "et", "rues", "sur"}
KINDS = {"che": "Chemin", "all": "Allée", "angl": "Angle", "bd": "Boulevard", "rte": "Route", "ld": "Lieu-dit", "av": "Avenue", "pl": "Place"}
UPPER = re.compile(r"^(?:za|zac|zi|rn\d*|rd\d*|cd\d*)$", re.I)


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def tokens(s):
    return [(m.start(), m.end()) for m in re.finditer(r"[^\W_]+", s)]


# Each place's name as folded words, with its spelling (« Sainte-Clotilde », « La Plaine-des-Palmistes »), and without its
# article when more than one word is left: the directory writes « de la Plaine des Palmistes », « Saint-pierre ».
PLACES = []
for p in GAZETTEER:
    words = [fold(p["nom"][a:b]) for a, b in tokens(p["nom"])]
    PLACES.append((words, p["nom"]))
    if words[0] in ARTICLES and len(words) > 2:
        PLACES.append((words[1:], p["nom"][tokens(p["nom"])[1][0]:]))
PLACES.sort(key=lambda x: -len(x[0]))


def spelled(text):
    """The text with the names of places the gazetteer knows spelled as it spells them, its accents and capitals."""
    spans = tokens(text)
    words = [fold(text[a:b]) for a, b in spans]
    out, at, i = [], 0, 0
    while i < len(spans):
        hit = next(((w, nom) for w, nom in PLACES if words[i:i + len(w)] == w and len(w) > 1
                    and all(re.fullmatch(r"[\s'’-]+", text[spans[i + j][1]:spans[i + j + 1][0]]) for j in range(len(w) - 1))), None)
        if hit is None:
            i += 1
            continue
        w, nom = hit
        a, b = spans[i][0], spans[i + len(w) - 1][1]
        # « de la Montagne »: the sentence's article stays as written.
        if w[0] in ARTICLES and text[a].islower():
            nom = nom[0].lower() + nom[1:]
        out.append(text[at:a] + nom)
        at, i = b, i + len(w)
    return "".join(out) + text[at:]


def name(s):
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^D[ée]ch[ée]terie", "Déchèterie", s)
    s = re.sub(r"\bCite\b", "Cité", s)
    s = re.sub(r"\bAllee\b", "Allée", s)
    s = re.sub(r"\bZac\b", "ZAC", s)
    s = re.sub(r"\bMobile\b", "mobile", s)
    return spelled(s)


def address(s):
    words = s.split()
    if words and words[0].isdigit():
        number, words = [words[0]], words[1:]
    else:
        number = []
    if words and fold(words[0]) in KINDS:
        words[0] = KINDS[fold(words[0])]
    out = []
    for i, w in enumerate(words):
        if UPPER.match(w):
            out.append(w.upper())
        elif i > 0 and fold(w) in SMALL:
            out.append(w.lower())
        else:
            out.append(w[0].upper() + w[1:])
    return spelled(" ".join(number + out))


def commune(r):
    """The commune of a site. The directory's code is wrong once (Bois de Nèfles, Sainte-Clotilde, under Saint-Pierre's
    code): the place its town line names, when the gazetteer knows it, prevails."""
    town = fold(re.sub(r"\s+cedex$", "", r.get("L_VILLE_SITE") or "", flags=re.I)).replace("-", " ")
    known = next((p["commune"] for p in GAZETTEER if fold(p["nom"]).replace("-", " ") == town and p.get("commune")), None)
    return known or NAMES[r["C_COMM"]]


def km(a, b):
    x = math.radians(b["lon"] - a["lon"]) * math.cos(math.radians((a["lat"] + b["lat"]) / 2))
    return 6371 * math.hypot(x, math.radians(b["lat"] - a["lat"]))


def geocoded(sites):
    """Each site's address placed by the Géoplateforme (IGN, etalab-2.0), in one request for them all. Only an address
    found to its number or its street, surely enough: a lower score is another street (« Chemin Neuf » of Sainte-Marie
    found as « Chemin de Ligne »), one street of a corner, or a commune's centre (the mobile site of Salazie)."""
    codes = {nom: code for code, nom in NAMES.items()}
    body = io.StringIO()
    w = csv.writer(body)
    w.writerow(["adresse", "citycode"])
    for s in sites:
        w.writerow([s["adresse"], codes[s["commune"]]])
    boundary = "decheteries"
    data = (f'--{boundary}\r\nContent-Disposition: form-data; name="data"; filename="sites.csv"\r\nContent-Type: text/csv\r\n\r\n'
            f'{body.getvalue()}\r\n--{boundary}\r\nContent-Disposition: form-data; name="columns"\r\n\r\nadresse\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="citycode"\r\n\r\ncitycode\r\n--{boundary}--\r\n').encode()
    req = urllib.request.Request(GEOCODE, data=data, headers={**UA, "Content-Type": f"multipart/form-data; boundary={boundary}"})
    rows = list(csv.DictReader(io.StringIO(urllib.request.urlopen(req, timeout=60).read().decode("utf-8-sig"))))
    return [{"lon": float(r["longitude"]), "lat": float(r["latitude"]), "label": r["result_label"]}
            if r["result_type"] in ("housenumber", "street") and float(r["result_score"] or 0) >= MIN_SCORE else None for r in rows]


def main():
    meta = json.load(urllib.request.urlopen(urllib.request.Request(DATASET, headers=UA), timeout=60))
    rows = json.load(urllib.request.urlopen(urllib.request.Request(URL, headers=UA), timeout=60))["results"]
    survey = max(r["ANNEE"] for r in rows)
    last = {}
    for r in rows:
        if r["C_SERVICE"] not in last or r["ANNEE"] > last[r["C_SERVICE"]]["ANNEE"]:
            last[r["C_SERVICE"]] = r
    out, gone = [], []
    for r in last.values():
        site = {
            "nom": name(r["N_SERVICE"]),
            "adresse": address(r.get("AD1_SITE") or ""),
            "commune": commune(r),
            "lon": round(float(r["GPS_LONG"]), 5),
            "lat": round(float(r["GPS_LAT"]), 5),
        }
        if site["commune"] in TCO:
            continue
        (out if r["ANNEE"] == survey else gone).append(site)
    out.sort(key=lambda d: (d["commune"], d["nom"]))
    moved, unchecked = [], []
    for site, at in zip(out, geocoded(out)):
        if not at:
            unchecked.append(site["nom"])
        elif km(site, at) > MAX_KM:
            moved.append(f"{site['nom']} : {km(site, at):.1f} km de « {at['label']} »")
            site["lon"], site["lat"] = round(at["lon"], 5), round(at["lat"], 5)
    dest = ROOT / "src/vie/decheteries-ademe.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "enquete": survey,
        "mis_a_jour": meta["dataUpdatedAt"][:10],
        "source": f"ADEME, annuaire des déchèteries SINOE, {meta['license']['title']}",
        "sites": out,
    }, ensure_ascii=False, indent=0) + "\n")
    print(dest, len(out), "déchèteries de l'enquête", survey, "; écartées, vues la dernière fois avant :", [g["nom"] for g in gone])
    print("placées à leur adresse :", moved)
    print("adresse non trouvée sûrement, point de l'ADEME gardé :", unchecked)


if __name__ == "__main__":
    main()
