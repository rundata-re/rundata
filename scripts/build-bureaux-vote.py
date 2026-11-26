#!/usr/bin/env python3
"""Build src/vie/bureaux-vote.json: the polling stations of each commune of La Réunion, from the Insee's « Bureaux de
vote et adresses de leurs électeurs » (data.gouv.fr, Licence Ouverte 2.0), its table of the bureaux only.

For each bureau, only its number, the name of its place and its address, grouped by place. Never the file of the
electors' addresses, which this script does not read: nothing here tells anyone which bureau is theirs
(24/11/2026). The Insee's file is an extraction of the Répertoire électoral unique of September 2022, renewed every five
years: older than the municipal elections of 2026, said wherever the list is.
Read through data.gouv.fr's tabular API, filtered on the codes 97401 to 97424: five pages, a minute apart.
Usage: python3 -I scripts/build-bureaux-vote.py [--verifier ECART]
  (--verifier: write nothing, compare with src/vie/bureaux-vote.json and fail past ECART bureaux changed, added or
  gone, the Monday check of .github/workflows/listes.yml)
"""
import argparse
import importlib.util
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/bureaux-vote.json"
DATASET = "https://www.data.gouv.fr/api/1/datasets/649998d50f6f27459dc6cf5b/"
PAGE = "https://www.data.gouv.fr/datasets/bureaux-de-vote-et-adresses-de-leurs-electeurs/"
BUREAUX = "3a321a06-9e05-4de9-8dd3-421da6abd4c5"
TABULAR = "https://tabular-api.data.gouv.fr/api/resources/{}/data/?{}"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
# The extraction the Insee's page names; checked on each run, never guessed.
EXTRACTION, EXTRACTION_DITE = "2022-09", "réalisée en septembre 2022"
# A name that only repeats the bureau's number: « bureau 1 » (Saint-Pierre), « 1er bureau », « 10eme bureau » (Le Port, Cilaos).
GENERIQUE = re.compile(r"^(?:\d+\s*(?:er|ère|ere|e|ème|eme|nd|nde)\s+)?(?:bureau|bv)(?:\s+de\s+vote)?\s*(?:n°\s*)?\d*$", re.I)
last = [0.0]


def get(url):
    """One page a minute at most."""
    wait = last[0] + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return json.load(r)


def rows():
    url = TABULAR.format(BUREAUX, urllib.parse.urlencode({"code_commune__greater": "97400", "code_commune__less": "97425", "page_size": "200"}))
    out = []
    while url:
        page = get(url)
        out += page["data"]
        # The API's next page may come with characters unencoded.
        url = page["links"].get("next") and urllib.parse.quote(page["links"]["next"], safe=":/?&=%")
    return out


def clean(s):
    return " ".join(str(s or "").split())


def build():
    meta = get(DATASET)
    if EXTRACTION_DITE not in meta["description"]:
        raise SystemExit("the Insee's page no longer says « réalisée en septembre 2022 »: a new extraction, set EXTRACTION")
    modified = next(r for r in meta["resources"] if r["id"] == BUREAUX)["last_modified"][:10]
    communes = {}
    for r in rows():
        insee = str(r["code_commune"])
        adresse = clean(f"{clean(r['num_voie_reu'])} {clean(r['voie_reu'])}, {clean(r['cp_reu'])} {clean(r['commune_reu'])}").strip(", ")
        # By address: a place's bureaux share it. A name that only repeats the bureau's number (Saint-Pierre's
        # « bureau 1 », Le Port's and Cilaos's « 10eme bureau », its place in the address) is not a name.
        nom = clean(r["libelle_reu"])
        lieu = communes.setdefault(insee, {}).setdefault(adresse, {"lieu": None, "bureaux": []})
        if not lieu["lieu"] and not GENERIQUE.match(nom):
            lieu["lieu"] = nom[:1].upper() + nom[1:]
        lieu["bureaux"].append(clean(r["code"]))
    if len(communes) != 24:
        raise SystemExit(f"{len(communes)} communes: the export looks cut, nothing written")
    num = lambda c: (int(c) if c.isdigit() else 10**6, c)
    out = {}
    for insee, lieux in sorted(communes.items()):
        rows_ = [{**({"lieu": l["lieu"]} if l["lieu"] else {}), "adresse": a, "bureaux": sorted(l["bureaux"], key=num)} for a, l in lieux.items()]
        out[insee] = sorted(rows_, key=lambda x: num(x["bureaux"][0]))
    return {
        "construit": date.today().isoformat(),
        "extraction": EXTRACTION,
        "mis_a_jour": modified,
        "source": "Bureaux de vote et adresses de leurs électeurs, Insee, Licence Ouverte 2.0",
        "page": PAGE,
        "communes": out,
    }


def bureaux(data):
    """Each bureau: (commune, number) → its place and address."""
    return {(insee, b): (l.get("lieu"), l["adresse"]) for insee, lieux in data["communes"].items() for l in lieux for b in l["bureaux"]}


def controles():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def verifier(data, bundled, ecart):
    """The bundled list against today's, without writing: 1, the list has aged (scripts/verifier.py), past `ecart`
    bureaux changed, added or gone."""
    now, before = bureaux(data), bureaux(bundled)
    n = sum(1 for k in set(now) | set(before) if now.get(k) != before.get(k))
    print(f"liste du {bundled['mis_a_jour']} : {len(before)} bureaux ; Insee du {data['mis_a_jour']} : {len(now)}, {n} écarts")
    if n > ecart:
        return controles().vieillie("Bureaux de vote", "build-bureaux-vote.py", "le fichier de l'Insee", date=data["mis_a_jour"], ecart=n,
                                    consigne=f"Seuil {ecart}. Lancer scripts/build-bureaux-vote.py et proposer la PR.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verifier", type=int, metavar="ECART", help="write nothing: compare with src/vie/bureaux-vote.json, fail past ECART bureaux changed")
    a = ap.parse_args()
    data = build()
    if a.verifier is not None:
        sys.exit(verifier(data, json.loads(OUT.read_text(encoding="utf-8")), a.verifier))
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(len(l["bureaux"]) for c in data["communes"].values() for l in c)
    print(f"{len(data['communes'])} communes, {n} bureaux, {sum(len(c) for c in data['communes'].values())} lieux -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
