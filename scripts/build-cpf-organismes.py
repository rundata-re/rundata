#!/usr/bin/env python3
"""Build src/vie/cpf-organismes.json: the SIREN of the training bodies of La Réunion whose name may be shown.

The formations eligible to the CPF at La Réunion (src/providers/cpf.ts) come with the name of their training body, and
the name of a sole trader (entrepreneur individuel) is the name of a person: never shown, on the site as in the
repository. A body's name is shown only when its SIREN is in this list, of legal persons (personnes morales) alone, as
the API Recherche d'entreprises (recherche-entreprises.api.gouv.fr, DINUM, from the INSEE's Sirene) gives their legal
form: its code's first digit 3 to 9. 1 (a person) and 2 (a grouping without legal personality) are left out, and so is
a SIREN the API does not answer for: in doubt, left out. The list holds numbers only.
The SIREN asked are those of the formations of La Réunion with an open session in the Caisse des Dépôts' catalogue
(opendata.caissedesdepots.fr, Licence Ouverte 2.0), read once. Those in the list already are not asked again; the others
are, at each run (a sole trader stays out). One request every 3 s at most; on a 429, the run stops at once, writes what
it read, and is run again later: never again right away. A body new to the catalogue keeps its name hidden until then.
Usage: python3 -I scripts/build-cpf-organismes.py
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/cpf-organismes.json"
CATALOGUE = "https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation/exports/json"
WHERE = 'code_departement="974" and nb_session_active>0'
SEARCH = "https://recherche-entreprises.api.gouv.fr/search"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
EVERY = 3.0


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def nature(siren):
    """The legal form's code of `siren`, or None when the API gives no unit of that number."""
    r = get(f"{SEARCH}?{urllib.parse.urlencode({'q': siren, 'page': 1, 'per_page': 1})}")
    hit = next((x for x in r.get("results", []) if x.get("siren") == siren), None)
    return hit and hit.get("nature_juridique")


def main():
    rows = get(f"{CATALOGUE}?{urllib.parse.urlencode({'select': 'siret', 'where': WHERE, 'group_by': 'siret'})}")
    sirens = sorted({r["siret"][:9] for r in rows if r.get("siret") and r["siret"][:9].isdigit()})
    known = set(json.loads(OUT.read_text())) if OUT.exists() else set()
    # Only the bodies of the catalogue: one that left it is asked again if it comes back.
    kept = known & set(sirens)
    todo = [s for s in sirens if s not in kept]
    asked = refused = unknown = 0
    stopped = False
    for s in todo:
        if asked:
            time.sleep(EVERY)
        asked += 1
        try:
            code = nature(s)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                stopped = True
                break
            unknown += 1
            continue
        except (urllib.error.URLError, TimeoutError):
            unknown += 1
            continue
        if code and code[0] in "3456789":
            kept.add(s)
        elif code:
            refused += 1
        else:
            unknown += 1
    OUT.write_text(json.dumps(sorted(kept)) + "\n")
    left = len(sirens) - len(kept) - refused - unknown
    print(f"{len(sirens)} SIREN au catalogue, {len(kept)} personnes morales dans la liste, {refused} écartés (personne ou groupement), "
          f"{unknown} sans réponse lisible, {left if stopped else 0} non demandés")
    if stopped:
        print("429 : arrêt, à relancer plus tard")


main()
