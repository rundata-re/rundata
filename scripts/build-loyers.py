#!/usr/bin/env python3
"""Build src/vie/loyers.json: the rents asked in the ads of each of the 24 communes, bundled with the server.

From the « Carte des loyers » of the ministry in charge of housing (DHUP), made by the ANIL from the ads of SeLoger and
leboncoin, on data.gouv.fr under the Licence Ouverte 2.0: for each commune and each kind of home (flat, flat of 1 or 2
rooms, of 3 rooms or more, house), the predicted rent per m² of an ad, charges included, its prediction interval, and
the number of ads in the commune and the model's adjusted R². They are predictions of a hedonic model for a reference
home let unfurnished, put online in the third quarter of the vintage, neither medians nor means. Below 100 ads in the
commune, the estimate is that of its mesh, neighbouring communes grouped with it (TYPPRED « maille », or « epci »).
The ANIL asks for caution below 30 ads in the commune or an R² under 0.5. These are rents asked in ads, not rents
signed; vintages cannot be compared (the meshes change). One vintage a year (published in December): run again then,
with the new dataset's id and VINTAGE.
Usage: python3 -I scripts/build-loyers.py [--dir folder with the 4 CSV] [--verifier]
"""
import argparse
import csv
import importlib.util
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://www.data.gouv.fr/api/1/datasets/693aa2feed1bf4da603faa49/"
VINTAGE = 2025
# Each vintage is a new dataset of the ministry (« … par commune en 2025 »): the check looks for a later one by its title.
SEARCH = "https://www.data.gouv.fr/api/1/datasets/?" + urllib.parse.urlencode({"q": "carte des loyers", "organization": "534fff8da3a7292c64a77eee", "page_size": 50})
TITLE = re.compile(r"Indicateurs de loyers d.annonce par commune en (\d{4})")
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
# Each file of the dataset, by the end of its name.
KINDS = {"appartement": "pred-app-", "appartement_1_2_pieces": "pred-app12-", "appartement_3_pieces_et_plus": "pred-app3-", "maison": "pred-mai-"}


def verifier():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def number(s):
    return float(s.replace(",", "."))


def vintages():
    """The vintages the ministry has put online, by their datasets' titles."""
    found = json.load(urllib.request.urlopen(urllib.request.Request(SEARCH, headers=UA), timeout=120))["data"]
    return sorted({int(m[1]) for d in found if (m := TITLE.search(d["title"]))})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", help="a folder holding the 4 CSV files (pred-app-…, pred-app12-…, pred-app3-…, pred-mai-…), else downloaded")
    # By the vintage, not the figures: a vintage is never updated, the next one comes as a new dataset in December.
    ap.add_argument("--verifier", action="store_true", help="write nothing: fail when the ministry put a later vintage online than the list's")
    args = ap.parse_args()
    if args.verifier:
        seen = vintages()
        bundled = json.loads((ROOT / "src/vie/loyers.json").read_text())["millesime"]
        print(f"Loyers d'annonce : liste embarquée du millésime {bundled}, millésimes en ligne : {', '.join(map(str, seen)) or 'aucun trouvé'}")
        if not seen or bundled not in seen:
            sys.exit(verifier().cassee("Loyers d'annonce", "la recherche sur data.gouv.fr ne retrouve plus le millésime embarqué"))
        if max(seen) > bundled:
            sys.exit(verifier().vieillie("Loyers d'annonce", "build-loyers.py", f"le millésime {max(seen)} en ligne",
                                         consigne="Mettre son jeu dans DATASET et VINTAGE, lancer scripts/build-loyers.py et proposer la PR."))
        sys.exit(0)
    meta = None if args.dir else json.load(urllib.request.urlopen(urllib.request.Request(DATASET, headers=UA), timeout=120))
    communes = {}
    for kind, prefix in KINDS.items():
        if args.dir:
            raw = next(p for p in Path(args.dir).iterdir() if p.name.startswith(prefix)).read_bytes()
        else:
            url = next(r["url"] for r in meta["resources"] if r["url"].rsplit("/", 1)[-1].startswith(prefix))
            raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600).read()
        # The files are in Windows-1252, with decimal commas.
        for r in csv.DictReader(io.StringIO(raw.decode("cp1252")), delimiter=";"):
            if r["DEP"] != "974":
                continue
            communes.setdefault(r["INSEE_C"], {})[kind] = {
                "loyer_m2": round(number(r["loypredm2"]), 2),
                "bas": round(number(r["lwr.IPm2"]), 2),
                "haut": round(number(r["upr.IPm2"]), 2),
                "annonces": int(r["nbobs_com"]),
                "r2": round(number(r["R2_adj"]), 2),
                # Estimated with the communes grouped with it: their ads together.
                **({"zone": r["TYPPRED"].lower(), "annonces_zone": int(r["nbobs_mail"])} if r["TYPPRED"] != "commune" else {}),
            }
    dest = ROOT / "src/vie/loyers.json"
    out = {"construit": date.today().isoformat(), "millesime": VINTAGE, "source": "Carte des loyers, ANIL pour le ministère chargé du logement, Licence Ouverte 2.0",
           "communes": dict(sorted(communes.items()))}
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n")
    print(dest, len(communes), "communes", {k: sum(k in c for c in communes.values()) for k in KINDS})


if __name__ == "__main__":
    main()
