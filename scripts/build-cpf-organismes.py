#!/usr/bin/env python3
"""Build src/vie/cpf-organismes.json: the SIREN of the training bodies of La Réunion whose name may be shown.

The formations eligible to the CPF at La Réunion (src/providers/cpf.ts) come with the name of their training body, and
the name of a sole trader (entrepreneur individuel) is the name of a person: never shown, on the site as in the
repository. A body's name is shown only when its SIREN is in this list, of legal persons (personnes morales) alone, as
the INSEE's Sirene gives their legal form (catégorie juridique) in its stock file of legal units (« Base Sirene des
entreprises et de leurs établissements », data.gouv.fr, Licence Ouverte 2.0): its code's first digit 3 to 9. 1 (a
person) and 2 (a grouping without legal personality) are left out, and so is a SIREN the file does not hold or gives no
form for: in doubt, left out. The list holds numbers only.
The SIREN asked are those of the formations of La Réunion with an open session in the Caisse des Dépôts' catalogue
(opendata.caissedesdepots.fr, Licence Ouverte 2.0), read once, each run reading the whole list again: a body new to
the catalogue keeps its name hidden until the next run, one that left it leaves the list.
The stock file is about 1 GB (a zipped CSV, monthly): the run downloads it to a temporary file, deleted afterwards,
unless it is given one downloaded already. Only the SIREN and the legal form of each line are read.
Usage: python3 -I scripts/build-cpf-organismes.py [StockUniteLegale_utf8.zip]
"""
import csv
import io
import json
import shutil
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/cpf-organismes.json"
CATALOGUE = "https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation/exports/json"
WHERE = 'code_departement="974" and nb_session_active>0'
# « Sirene : Fichier StockUniteLegale », the latest month: data.gouv.fr's lasting link to the resource.
STOCK = "https://www.data.gouv.fr/api/1/datasets/r/825f4199-cadd-486c-ac46-a65a8ea1a047"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def natures(stock, wanted):
    """The legal form's code of each SIREN of `wanted` that the stock file `stock` holds."""
    found = {}
    with zipfile.ZipFile(stock) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        with io.TextIOWrapper(z.open(name), encoding="utf-8", newline="") as f:
            head = next(csv.reader([f.readline()]))
            at = head.index("categorieJuridiqueUniteLegale")
            for line in f:
                # The SIREN is the first field: the line is parsed only for a SIREN asked.
                if line[:9] in wanted:
                    found[line[:9]] = next(csv.reader([line]))[at]
    return found


def main():
    rows = get(f"{CATALOGUE}?{urllib.parse.urlencode({'select': 'siret', 'where': WHERE, 'group_by': 'siret'})}")
    sirens = sorted({r["siret"][:9] for r in rows if r.get("siret") and r["siret"][:9].isdigit()})
    if len(sys.argv) > 1:
        found = natures(sys.argv[1], set(sirens))
    else:
        with tempfile.TemporaryFile() as t:
            with urllib.request.urlopen(urllib.request.Request(STOCK, headers=UA), timeout=600) as r:
                shutil.copyfileobj(r, t)
            found = natures(t, set(sirens))
    first = {s: found.get(s, "")[:1] for s in sirens}
    kept = [s for s in sirens if first[s] in set("3456789")]
    persons = sum(1 for s in sirens if first[s] == "1")
    groupings = sum(1 for s in sirens if first[s] == "2")
    OUT.write_text(json.dumps(kept) + "\n")
    print(f"{len(sirens)} SIREN au catalogue, {len(kept)} personnes morales dans la liste ; écartés : {persons} personnes physiques, "
          f"{groupings} groupements, {len(sirens) - len(kept) - persons - groupings} absents du fichier ou sans forme juridique")


main()
