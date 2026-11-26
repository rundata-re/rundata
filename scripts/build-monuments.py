#!/usr/bin/env python3
"""Build src/vie/monuments.json: the historic monuments of La Réunion, bundled.

The list of the buildings protected as historic monuments (base Mérimée), from the Ministère de la Culture on
data.gouv.fr, Licence Ouverte 2.0, one file for all of France updated once a week (about 100 Mo): its rows of the
department 974. Kept: those protected now, classé or inscrit, each with its name as the base writes it, its communes by
their INSEE code (a monument may lie on two), its address, its centuries and its point when the base has one. Dropped:
the notices that only send to another one (« notice de renvoi »), and a building whose protection was lifted (its
protection empty, the delisting in its observations).
Run again when the list changes (a few protections a year). Downloads at a low pace, one request a minute per host.
With --verifier, the list is rebuilt in memory and compared with the bundled one, monument by monument, writing nothing
(the Monday check of the bundled lists): the base's date of change moves with no change of content (19/11/2026, the
same 204 monuments as on 29/10).
Usage: python3 -I scripts/build-monuments.py [--csv merimee.csv --du 2026-10-29] [--verifier ECART]
"""
import argparse
import csv
import importlib.util
import io
import json
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://www.data.gouv.fr/api/1/datasets/5af120e5b595087cfabcde81/"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
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
    (« "Cheminée dite de "Manapany"" ») are dropped, the inner ones kept, and the spaces just inside a pair too
    (« " Mon Repos " »).
    """
    s = re.sub(r'"([^"]*)"([^"]+)""', '\\1"\\2"', " ".join(s.split()))
    s = re.sub(r'"\s*([^"]+?)\s*"', "«\u00a0\\1\u00a0»", s)
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
    p.add_argument("--verifier", type=int, metavar="ECART", help="write nothing: compare with src/vie/monuments.json, fail past ECART monuments added, gone or changed")
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
    if a.verifier is not None:
        sys.exit(verifier(out, a.verifier, json.loads(dest.read_text(encoding="utf-8")), du))
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "fichier_du": du,
        "lignes_974": len(rows),
        "source": "Ministère de la Culture, Immeubles protégés au titre des Monuments historiques (base Mérimée), Licence Ouverte 2.0",
        "page": page,
        "monuments": out,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(rows)} rows of 974, {len(out)} monuments, {sum('lon' in m for m in out)} with a point -> {dest.relative_to(ROOT)}")


def _commun():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def verifier(rows, ecart, bundled, du=None):
    """
    The bundled list `bundled` against `rows`, rebuilt from the day's file, without writing: each monument by its
    reference in the base Mérimée, all its fields (name, communes, address, protection, centuries, point), not the day
    it was built. 1 (an aged list: a warning, the job stays green) when more than `ecart` were added, are gone or changed, else 0.
    """
    before, now = {m["ref"]: m for m in bundled["monuments"]}, {m["ref"]: m for m in rows}
    added, gone = [r for r in now if r not in before], [r for r in before if r not in now]
    changed = {r: sorted(f for f in set(before[r]) | set(now[r]) if before[r].get(f) != now[r].get(f)) for r in now if r in before}
    changed = {r: f for r, f in changed.items() if f}
    print(f"liste du {bundled['construit']} (fichier du {bundled['fichier_du']}) : {len(before)} monuments ; "
          f"le fichier{f' du {du}' if du else ''} : {len(now)}, {len(added)} nouveaux, {len(gone)} disparus, {len(changed)} changés")
    for r in added[:20]:
        print(f"  nouveau : {now[r]['nom']} ({r})")
    for r in gone[:20]:
        print(f"  disparu : {before[r]['nom']} ({r})")
    for r, f in list(changed.items())[:20]:
        print(f"  changé : {now[r]['nom']} ({r} : {', '.join(f)})")
    n = len(added) + len(gone) + len(changed)
    if n > ecart:
        return _commun().vieillie("Monuments historiques", "build-monuments.py", "la base Mérimée", ecart=n,
                                   consigne=f"{n} écarts, seuil {ecart}. Lancer scripts/build-monuments.py et proposer la PR.")
    return 0


if __name__ == "__main__":
    main()
