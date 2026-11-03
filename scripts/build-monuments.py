#!/usr/bin/env python3
"""Build src/vie/monuments.json: the historic monuments of La Réunion, bundled.

The list of the buildings protected as historic monuments (base Mérimée), from the Ministère de la Culture on
data.gouv.fr, Licence Ouverte 2.0, one file for all of France updated once a week (about 100 Mo): its rows of the
department 974. Kept: those protected now, classé or inscrit, each with its name as the base writes it, its communes by
their INSEE code (a monument may lie on two), its address, its centuries and its point when the base has one. Dropped:
the notices that only send to another one (« notice de renvoi »), and a building whose protection was lifted (its
protection empty, the delisting in its observations).
Run again when the list changes (a few protections a year). Downloads at a low pace, one request a minute per host.
Usage: python3 -I scripts/build-monuments.py [--csv merimee.csv --du 2026-10-29]
"""
import argparse
import csv
import io
import json
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://www.data.gouv.fr/api/1/datasets/5af120e5b595087cfabcde81/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600)


def newest():
    """The CSV of the dataset, its day, and the dataset's page."""
    meta = json.load(opened(DATASET))
    r = next(r for r in meta["resources"] if r["format"] == "csv")
    return r["url"], r["last_modified"][:10], meta["page"]


def typo(s):
    """
    One line, a no-break space before « : ; ? ! » as on every page (« chemin Lagourgue ; chemin du Centre »), and the
    base's straight quotes as French ones: « Cheminée dite de « Mahavel » ». Quotes around a name that has its own
    (« "Cheminée dite de "Manapany"" ») are dropped, the inner ones kept.
    """
    s = re.sub(r'"([^"]*)"([^"]+)""', '\\1"\\2"', " ".join(s.split()))
    s = re.sub(r'"([^"]+)"', "«\u00a0\\1\u00a0»", s)
    return re.sub(r" ([:;?!])", "\u00a0\\1", s)


def monument(r):
    """One row as the site needs it, or None when it is not a monument protected now."""
    kinds = r["Typologie_de_la_protection"]
    if r["Typologie_du_dossier"].lower() != "dossier de protection" or "MH" not in kinds:
        return None
    # Classé when any of it is: the higher protection. In part when no protection of it is said whole.
    partial = "partiellement" in kinds and "protection totale" not in kinds
    centuries = sorted({c.strip().removesuffix(" s.") for c in r["Format_abrege_du_siecle_de_construction"].split(";") if c.strip()}, key=lambda c: int(re.match(r"\d+", c)[0]))
    point = r["coordonnees_au_format_WGS84"].strip()
    lat, lon = (round(float(x), 5) for x in point.split(",")) if point else (None, None)
    return {
        "ref": r["Reference"],
        # Its other commune is in `insee`: « (également sur commune de La Possession) » is not kept.
        "nom": typo(re.sub(r" \(également sur commune de [^)]*\)$", "", r["Titre_editorial_de_la_notice"].strip())),
        "insee": [c.strip() for c in r["COG_Insee_lors_de_la_protection"].split(";")],
        **({"adresse": a} if (a := typo(r["Adresse_forme_editoriale"])) else {}),
        "protection": "classé" if "classé MH" in kinds else "inscrit",
        **({"partiel": True} if partial else {}),
        **({"siecles": centuries} if centuries else {}),
        **({"lon": lon, "lat": lat} if point else {}),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", help="a local copy of merimee.csv")
    p.add_argument("--du", help="its day, 2026-10-29")
    a = p.parse_args()
    page = "https://www.data.gouv.fr/datasets/immeubles-proteges-au-titre-des-monuments-historiques-2"
    if a.csv:
        text, du = Path(a.csv).read_text(encoding="utf-8"), a.du
    else:
        url, du, page = newest()
        text = opened(url).read().decode("utf-8")
    csv.field_size_limit(1 << 30)
    rows = [r for r in csv.DictReader(io.StringIO(text), delimiter="|") if r["Departement_format_numerique"].strip() == "974"]
    out = sorted(filter(None, map(monument, rows)), key=lambda m: m["ref"])
    dest = ROOT / "src/vie/monuments.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "fichier_du": du,
        "lignes_974": len(rows),
        "source": "Ministère de la Culture, Immeubles protégés au titre des Monuments historiques (base Mérimée), Licence Ouverte 2.0",
        "page": page,
        "monuments": out,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(rows)} rows of 974, {len(out)} monuments, {sum('lon' in m for m in out)} with a point -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
