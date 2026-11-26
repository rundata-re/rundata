#!/usr/bin/env python3
"""Build src/vie/elus.json: the mayor and the deputy mayors of each commune of La Réunion, from the ministry of the
Interior's Répertoire national des élus (RNE), on data.gouv.fr (Licence Ouverte 2.0).

Public persons in their office: for each, only the first name, the surname and the office, by commune
(24/11/2026). Never the date of birth, the sex, the nationality nor the profession the file also gives: they are not
read into the output. No political nuance either (the user's decision, vie/elections.ts).
From the files « elus-maires-mai.csv » and « elus-conseillers-municipaux-cm.csv », read through data.gouv.fr's tabular
API, filtered on the département 974: one page for the mayors, two for the deputy mayors, a minute apart.
The ministry updates the RNE now and then; this is run by hand, and the file comes in a pull request.
Usage: python3 -I scripts/build-elus.py [--verifier ECART]
  (--verifier: write nothing, compare with src/vie/elus.json and fail past ECART offices held by someone else, the
  Monday check of .github/workflows/listes.yml)
"""
import argparse
import importlib.util
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/elus.json"
DATASET = "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/"
PAGE = "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1/"
MAIRES = "2876a346-d50c-4911-934e-19ee07b0e503"
CONSEILLERS = "d5f400de-ae3f-4966-8cb6-a85c70c6c24a"
TABULAR = "https://tabular-api.data.gouv.fr/api/resources/{}/data/?{}"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
# The only fields read from a row.
NOM, PRENOM, COMMUNE, FONCTION = "Nom de l'élu", "Prénom de l'élu", "Code de la commune", "Libellé de la fonction"
last = [0.0]


def get(url):
    """One page a minute at most."""
    wait = last[0] + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return json.load(r)


def rows(resource, **filters):
    url = TABULAR.format(resource, urllib.parse.urlencode({"Code du département__exact": "974", **filters, "page_size": "200"}))
    out = []
    while url:
        page = get(url)
        out += page["data"]
        # The API's next page comes with its spaces unencoded (« Code du département__exact »).
        url = page["links"].get("next") and urllib.parse.quote(page["links"]["next"], safe=":/?&=%")
    return out


def personne(r):
    return {"prenom": " ".join(r[PRENOM].split()), "nom": " ".join(r[NOM].split())}


def rang(fonction):
    """« 1er adjoint au Maire » → 1, « 12ème adjoint au Maire » → 12."""
    n = "".join(c for c in fonction.split()[0] if c.isdigit())
    return int(n) if n else None


def build():
    meta = get(DATASET)
    dates = {r["id"]: (r.get("last_modified") or "")[:10] for r in meta["resources"]}
    communes = {}
    for r in rows(MAIRES):
        communes.setdefault(r[COMMUNE], {"maire": None, "adjoints": []})["maire"] = personne(r)
    for r in rows(CONSEILLERS, **{f"{FONCTION}__contains": "adjoint"}):
        n = rang(r[FONCTION])
        if n is None:
            raise SystemExit(f"office without a rank: {r[FONCTION]!r}")
        communes.setdefault(r[COMMUNE], {"maire": None, "adjoints": []})["adjoints"].append({"rang": n, **personne(r)})
    if len(communes) != 24 or any(not c["maire"] for c in communes.values()):
        raise SystemExit(f"{len(communes)} communes, or one without its mayor: the export looks cut, nothing written")
    for c in communes.values():
        c["adjoints"].sort(key=lambda a: a["rang"])
    return {
        "construit": date.today().isoformat(),
        "mis_a_jour": min(dates[MAIRES], dates[CONSEILLERS]),
        "source": "Répertoire national des élus (RNE), ministère de l'Intérieur, Licence Ouverte 2.0",
        "page": PAGE,
        "communes": dict(sorted(communes.items())),
    }


def offices(data):
    """Each office of each commune, and who holds it: (commune, office) → name."""
    out = {}
    for insee, c in data["communes"].items():
        out[(insee, "maire")] = f"{c['maire']['prenom']} {c['maire']['nom']}"
        # By place in the list, not by rank: the ministry's file may give one rank twice (Saint-Paul, two « 14ème »).
        for i, a in enumerate(c["adjoints"]):
            out[(insee, f"adjoint {i + 1}")] = f"{a['rang']} {a['prenom']} {a['nom']}"
    return out


def controles():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def verifier(data, bundled, ecart):
    """The bundled offices against today's RNE, without writing. 1, the list has aged (scripts/verifier.py), when more than `ecart`
    offices are held by someone else, added or gone. The names are not printed: the job's log is public, the count is
    enough to say a rebuild is due."""
    now, before = offices(data), offices(bundled)
    n = sum(1 for k in set(now) | set(before) if now.get(k) != before.get(k))
    print(f"liste du {bundled['mis_a_jour']} : {len(before)} fonctions ; RNE du {data['mis_a_jour']} : {len(now)}, {n} écarts")
    if n > ecart:
        return controles().vieillie("Maires et adjoints", "build-elus.py", "le RNE", date=data["mis_a_jour"], ecart=n,
                                    consigne=f"Seuil {ecart}. Lancer scripts/build-elus.py et proposer la PR.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verifier", type=int, metavar="ECART", help="write nothing: compare with src/vie/elus.json, fail past ECART offices changed")
    a = ap.parse_args()
    data = build()
    if a.verifier is not None:
        sys.exit(verifier(data, json.loads(OUT.read_text(encoding="utf-8")), a.verifier))
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(data['communes'])} communes, {sum(len(c['adjoints']) for c in data['communes'].values())} adjoints -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
