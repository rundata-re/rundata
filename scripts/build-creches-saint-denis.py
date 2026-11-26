#!/usr/bin/env python3
"""Build src/vie/creches-saint-denis.json: the crèches and the other places for the children under 3 of Saint-Denis, from
the CCAS of the commune's « Établissements d'accueil des jeunes enfants (EAJE) » on data.regionreunion.com, Licence
Ouverte (Etalab): each one's name, kind, management, places, address and position.

The list is an extraction of July 2023 (`date_d_exp`, the same on every row); the portal's « modified » date moves when it
processes the data again, its content stays that of 2023. So it is said with its date everywhere (« liste du CCAS de
Saint-Denis, juillet 2023 »), and those whose state is not « Ouvert » (works, « ouverture prochaine ») are left out: in
2023 they were not open, nothing says whether they are now. « Ouvert - 20 Janvier 2023 » is said « ouvert en 2023 ». The
manager's name is left out: cut at 20 letters in the source, sometimes empty, and the crèche's own name says enough.

Read by the portal's open API (Opendatasoft, explore v2.1), two requests, with rundata.re's honest User-Agent: an API the
producer publishes under an open licence, read at a low rate (the project's rule on robots.txt, 29/10/2026).

Usage: python3 -I scripts/build-creches-saint-denis.py [--dir DIR | --verifier SEUIL]
  --dir DIR reads DIR/fiche.json and DIR/records.json, saved answers of the two requests, instead of asking.
  --verifier SEUIL writes nothing: the day's rows against src/vie/creches-saint-denis.json, by name, kind and position,
  and the extraction's date; fails past SEUIL rows added or gone, or on a newer extraction (a new list of the CCAS).
"""
import importlib.util
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/creches-saint-denis.json"
DATASET = "etablissements-accueil-jeunes-enfants-villesaintdenis"
API = f"https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/{DATASET}"
PAGE = f"https://data.regionreunion.com/explore/assets/{DATASET}/"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}

# The source's kinds, as a parent says them.
CATEGORIES = {
    "Micro crèche": "micro-crèche",
    "Crèche collective": "crèche collective",
    "Centre multi accueil": "multi-accueil",
    "Jardin d'enfants": "jardin d'enfants",
    "Halte garderie": "halte-garderie",
    "Lieu d'accueil Enfant Parent": "lieu d'accueil enfants-parents",
    "Lieu d'Accueil": "lieu d'accueil",
}
GESTION = {"Etablissement Associatif": "associative", "Etablissement Privé": "privée", "Etablissement Municipal": "municipale"}


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))


def read(folder=None):
    """The dataset's metadata and its rows, from the API or from saved answers."""
    if folder:
        d = Path(folder)
        return json.loads((d / "fiche.json").read_text()), json.loads((d / "records.json").read_text())["results"]
    fiche = get(API)
    rows = get(f"{API}/records?limit=100")
    if rows["total_count"] > len(rows["results"]):
        raise SystemExit(f"{rows['total_count']} lignes, plus que les 100 d'une page : lire par pages")
    return fiche, rows["results"]


def day(ddmmyyyy):
    """« 11/07/2023 » as « 2023-07-11 »."""
    d, m, y = ddmmyyyy.split("/")
    return f"{y}-{m}-{d}"


def tidy(s):
    """Spaces collapsed, « Lagavant- 97490 » and « Lagavant -97490 » as « Lagavant - 97490 »."""
    return re.sub(r"\s*-\s*(97\d{3})", r" - \1", re.sub(r"\s+", " ", (s or "").strip()))


def build(fiche, rows):
    extraction = {day(r["date_d_exp"]) for r in rows}
    if len(extraction) != 1:
        raise SystemExit(f"plusieurs dates d'extraction : {sorted(extraction)}")
    lieux = []
    for r in rows:
        etat = r["etat"] or ""
        # « Ouvert », or « Ouvert - 20 Janvier 2023 »; never « Ouverture prochaine ».
        if not re.fullmatch(r"Ouvert(?: - .*)?", etat):
            continue
        p = r["geo_point_2d"]
        lieu = {
            "nom": tidy(r["nom"]),
            "categorie": CATEGORIES[r["categorie"]],
            "gestion": GESTION[r["type"]],
            "places": r["capacite"] or None,
            "adresse": tidy(r["adresse"]),
            "lon": round(p["lon"], 5),
            "lat": round(p["lat"], 5),
        }
        # « Ouvert - 20 Janvier 2023 »: opened in the year of the list.
        m = re.search(r"(\d{4})$", etat)
        if m:
            lieu["ouvert_en"] = int(m.group(1))
        lieux.append(lieu)
    lieux.sort(key=lambda x: (x["nom"].casefold(), x["categorie"]))
    meta = fiche["metas"]["default"]
    return {
        "extraction": extraction.pop(),
        "page": PAGE,
        "licence": meta["license"],
        "producteur": meta["publisher"],
        "lieux": lieux,
    }, len(rows) - len(lieux)


def verifier(seuil):
    """The day's rows against the bundled ones (see --verifier); 1 when the list is to be redone."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    bundled = json.loads(OUT.read_text())
    now, _ = build(*read())
    cle = lambda x: (x["nom"], x["categorie"], x["lon"], x["lat"])
    rc = v.ecarts("Crèches de Saint-Denis (CCAS)", bundled["lieux"], now["lieux"], cle, seuil, "build-creches-saint-denis.py",
                  lambda x: f'{x["nom"]} ({x["categorie"]}, {x["adresse"]})')
    return max(rc, v.plus_recent("Crèches de Saint-Denis (CCAS)", bundled["extraction"], now["extraction"], "build-creches-saint-denis.py", "l'extraction du CCAS"))


def main():
    if "--verifier" in sys.argv:
        sys.exit(verifier(int(sys.argv[sys.argv.index("--verifier") + 1])))
    folder = sys.argv[sys.argv.index("--dir") + 1] if "--dir" in sys.argv else None
    out, left = build(*read(folder))
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)} : {len(out['lieux'])} lieux, extraction du {out['extraction']}, {left} laissés de côté (pas « Ouvert »)")


if __name__ == "__main__":
    main()
