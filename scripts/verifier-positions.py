#!/usr/bin/env python3
"""The places we give against a second source, every Monday (.github/workflows/listes.yml):

  - each office of the annuaire of service-public.fr at La Réunion, at its position, against its address geocoded by the
    Base adresse nationale (the Géoplateforme's geocoder, one request for all the addresses);
  - each commune's point in src/places/gazetteer.json (its main settlement, OSM's) against its town hall in OpenStreetMap
    (one Overpass request).

The gaps found today are in scripts/positions-reference.json. The job fails only on a gap that is new, or that grew by
more than MARGE metres since: the failure is the alert, someone looks at the place and says it to its producer, or
rebuilds the list. A gap of the reference that closed is printed, without failing. Each source that does not answer is
said, and fails the step: no gap is read from a missing source.

Usage: python3 -I scripts/verifier-positions.py --verifier      # compare with the reference, exit 1 on a new gap
       python3 -I scripts/verifier-positions.py --ecrire        # rewrite the reference with today's gaps
"""
import argparse
import csv
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "scripts" / "positions-reference.json"
UA = (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()
TIMEOUT = 90

ANNUAIRE = (
    "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json"
    "?where=" + urllib.parse.quote('startswith(code_insee_commune,"974")') + "&select=id,nom,adresse,code_insee_commune"
)
GEOCODAGE_CSV = "https://data.geopf.fr/geocodage/search/csv"
OVERPASS = "https://overpass-api.de/api/interpreter"
MAIRIES = '[out:json][timeout:60][bbox:-21.40,55.20,-20.86,55.84];nwr["amenity"="townhall"];out center tags;'

# An office further than this from its address, a commune's point further than this from its town hall: a gap.
ECART_ANNUAIRE_M = 300
ECART_CENTRE_M = 1000
# What a gap of the reference may grow by before it fails: the Base adresse nationale's answer moves a little from one
# week to the next (another number found, a score), and a new gap must clear the threshold by as much.
MARGE = 100


def km(lon1, lat1, lon2, lat2):
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def get(url, data=None, headers=None):
    """One request; asked once more a minute later when the server says it is busy (Overpass often does)."""
    for essai in (1, 2):
        req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if essai == 2 or e.code not in (429, 502, 503, 504):
                raise
            time.sleep(60)


def nombre(s):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def lignes_csv(text):
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    if not rows:
        return []
    head = [h.strip().lower() for h in rows[0]]
    return [dict(zip(head, r)) for r in rows[1:]]


def bureaux():
    """The annuaire's offices of La Réunion with a position and an address: id, name, position, address, commune."""
    out = []
    for r in json.loads(get(ANNUAIRE)):
        try:
            adresses = json.loads(r.get("adresse") or "[]")
        except ValueError:
            continue
        a = next((x for x in adresses if x.get("type_adresse") == "Adresse"), adresses[0] if adresses else {})
        lon, lat = nombre(a.get("longitude")), nombre(a.get("latitude"))
        voie = " ".join(x for x in (a.get("numero_voie", "").strip(), a.get("code_postal", "").strip(), a.get("nom_commune", "").strip()) if x)
        if lon is None or lat is None or not a.get("numero_voie", "").strip():
            continue
        out.append({"id": r["id"], "nom": r.get("nom", "").strip(), "lon": lon, "lat": lat, "q": voie, "citycode": r.get("code_insee_commune", "")})
    return out


def geocoder(rows):
    """Each address as the Base adresse nationale places it: (type, score, lon, lat) by row, None when not found."""
    body = io.StringIO()
    w = csv.writer(body, lineterminator="\n")
    w.writerow(["q", "citycode"])
    for r in rows:
        w.writerow([r["q"], r["citycode"]])
    limite = "----" + uuid.uuid4().hex
    parts = []
    for name, value in (("columns", "q"), ("citycode", "citycode"), ("result_columns", "result_type"), ("result_columns", "result_score"),
                        ("result_columns", "longitude"), ("result_columns", "latitude")):
        parts.append(f'--{limite}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n')
    parts.append(f'--{limite}\r\nContent-Disposition: form-data; name="data"; filename="adresses.csv"\r\nContent-Type: text/csv\r\n\r\n{body.getvalue()}\r\n--{limite}--\r\n')
    text = get(GEOCODAGE_CSV, "".join(parts).encode("utf-8"), {"Content-Type": f"multipart/form-data; boundary={limite}"}).decode("utf-8")
    out = []
    for g in lignes_csv(text):
        lon, lat = nombre(g.get("longitude")), nombre(g.get("latitude"))
        out.append(None if lon is None or lat is None else (g.get("result_type", ""), nombre(g.get("result_score")) or 0, lon, lat))
    if len(out) != len(rows):
        raise RuntimeError(f"géocodage : {len(out)} lignes pour {len(rows)} adresses")
    return out


def ecarts_annuaire():
    rows = bureaux()
    ecarts = {}
    for r, g in zip(rows, geocoder(rows)):
        if g is None:
            continue
        m = round(km(r["lon"], r["lat"], g[2], g[3]) * 1000)
        if m > ECART_ANNUAIRE_M:
            ecarts[r["id"]] = {"nom": r["nom"], "ecart_m": m, "adresse": r["q"], "ban": f"{g[0]} {g[1]:.2f}"}
    return len(rows), ecarts


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^(le|la|les|l) ", "", s)


def commune_de(nom):
    """The commune a town hall's name says: « Mairie de Saint-Paul », « Hôtel de ville de Saint-Denis »; None for an annex."""
    n = re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", nom or "").encode("ascii", "ignore").decode().lower()).strip()
    m = re.match(r"^(mairie|hotel de ville) (de |du |des |d )?(.+)$", n)
    if not m or "annexe" in n:
        return None
    return norm(("le " if m.group(2) == "du " else "") + m.group(3))


def ecarts_centres():
    communes = [p for p in json.loads((ROOT / "src" / "places" / "gazetteer.json").read_text())["places"] if p["type"] == "commune"]
    mairies = {}
    for e in json.loads(get(OVERPASS, urllib.parse.urlencode({"data": MAIRIES}).encode()))["elements"]:
        t = e.get("tags", {})
        if t.get("townhall:type") == "annex":
            continue
        c = commune_de(t.get("name"))
        p = e.get("center") or e
        if c and "lon" in p:
            mairies.setdefault(c, []).append((p["lon"], p["lat"], f'{e["type"]}/{e["id"]}'))
    ecarts = {}
    for c in communes:
        found = mairies.get(norm(c["nom"]), [])
        if not found:
            ecarts[c["nom"]] = {"ecart_m": None, "mairie": "aucune mairie de ce nom dans OSM"}
            continue
        lon, lat, osm = min(found, key=lambda m: km(c["lon"], c["lat"], m[0], m[1]))
        m = round(km(c["lon"], c["lat"], lon, lat) * 1000)
        if m > ECART_CENTRE_M:
            ecarts[c["nom"]] = {"ecart_m": m, "mairie": osm}
    return len(communes), ecarts


def comparer(titre, avant, maintenant, seuil):
    """The new or grown gaps (failures), the closed ones (said), against the reference."""
    echecs = []
    for k, v in sorted(maintenant.items(), key=lambda kv: -(kv[1]["ecart_m"] or 10**9)):
        ref = avant.get(k)
        m = v["ecart_m"]
        if ref is None:
            if m is None or m > seuil + MARGE:
                echecs.append(f"{titre} : nouvel écart, {k} {json.dumps(v, ensure_ascii=False)}")
        elif m is not None and ref.get("ecart_m") is not None and m > ref["ecart_m"] + MARGE:
            echecs.append(f"{titre} : écart qui grandit, {k} de {ref['ecart_m']} à {m} m {json.dumps(v, ensure_ascii=False)}")
        elif m is None and ref.get("ecart_m") is not None:
            echecs.append(f"{titre} : {k} {v['mairie']}")
    for k in sorted(set(avant) - set(maintenant)):
        print(f"{titre} : écart fermé, {k} ({avant[k].get('nom', k)}, {avant[k].get('ecart_m')} m dans la référence)")
    return echecs


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--verifier", action="store_true")
    g.add_argument("--ecrire", action="store_true")
    args = ap.parse_args()

    out, erreurs = {}, []
    for cle, lire in (("annuaire", ecarts_annuaire), ("centres", ecarts_centres)):
        try:
            n, out[cle] = lire()
            print(f"{cle} : {n} lus, {len(out[cle])} écarts")
        except Exception as e:  # noqa: BLE001 — a source that does not answer is said, never read as « no gap »
            erreurs.append(f"{cle} : la source n'a pas répondu ({type(e).__name__}: {e})")

    if args.ecrire:
        if erreurs:
            sys.exit("\n".join(erreurs))
        REFERENCE.write_text(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
        print(f"référence écrite : {REFERENCE.relative_to(ROOT)}")
        return

    ref = json.loads(REFERENCE.read_text())
    echecs = list(erreurs)
    if "annuaire" in out:
        echecs += comparer("annuaire", ref.get("annuaire", {}), out["annuaire"], ECART_ANNUAIRE_M)
    if "centres" in out:
        echecs += comparer("centres", ref.get("centres", {}), out["centres"], ECART_CENTRE_M)
    for e in echecs:
        print(e)
    if echecs:
        sys.exit(1)
    print("aucun écart nouveau")


if __name__ == "__main__":
    main()
