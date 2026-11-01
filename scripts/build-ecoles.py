#!/usr/bin/env python3
"""Build src/vie/ecoles.json: the schools, collèges and lycées of La Réunion, from the Éducation nationale's directory.

From data.education.gouv.fr, « Annuaire de l'éducation » (fr-en-annuaire-education, Licence Ouverte 2.0), the rows of
code_departement 974 whose type is an école, a collège or a lycée. Left out: the sections attached to another
establishment (a collège's SEGPA, a lycée's vocational section: the mother establishment carries them) and the
schools « sans effectifs permanents ». The directory is updated daily; schools seldom change: run this by hand.
Usage: python3 -I scripts/build-ecoles.py [--json FILE]   (FILE: the API's JSON export, already downloaded)
"""
import argparse
import json
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/ecoles.json"
EXPORT = ("https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/json"
          "?where=code_departement%3D%22974%22")
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
TYPES = {"Ecole": "ecole", "Collège": "college", "Lycée": "lycee"}
# The communes as the server spells them (src/places/insee.ts), by INSEE code.
COMMUNES = {
    "97401": "Les Avirons", "97402": "Bras-Panon", "97403": "Entre-Deux", "97404": "L'Étang-Salé", "97405": "Petite-Île",
    "97406": "La Plaine-des-Palmistes", "97407": "Le Port", "97408": "La Possession", "97409": "Saint-André",
    "97410": "Saint-Benoît", "97411": "Saint-Denis", "97412": "Saint-Joseph", "97413": "Saint-Leu", "97414": "Saint-Louis",
    "97415": "Saint-Paul", "97416": "Saint-Pierre", "97417": "Saint-Philippe", "97418": "Sainte-Marie", "97419": "Sainte-Rose",
    "97420": "Sainte-Suzanne", "97421": "Salazie", "97422": "Le Tampon", "97423": "Les Trois-Bassins", "97424": "Cilaos",
}


def phone(t):
    """« 0262463516 » → « 02 62 46 35 16 »; anything else as written."""
    d = "".join(c for c in t or "" if c.isdigit())
    return " ".join(d[i:i + 2] for i in range(0, 10, 2)) if len(d) == 10 else (t or None)


def row(x):
    kind = TYPES[x["type_etablissement"]]
    nom = " ".join(x["nom_etablissement"].split())
    if nom.startswith("Ecole"):
        nom = "École" + nom[5:]
    e = {"uai": x["identifiant_de_l_etablissement"], "nom": nom, "type": kind, "commune": COMMUNES[x["code_commune"]]}
    if kind == "ecole":
        m, el = x["ecole_maternelle"] == 1, x["ecole_elementaire"] == 1
        e["niveau"] = "maternelle et élémentaire" if m and el else "maternelle" if m else "élémentaire"
    # A lycée's pathways are in its name (« Lycée polyvalent », « Lycée professionnel »): the directory's flags are 0 for
    # some that have them, carried by their attached sections.
    if x["statut_public_prive"] == "Privé":
        e["prive"] = True
    street = " ".join((x["adresse_1"] or x["adresse_2"] or "").split())
    e["adresse"] = f"{street}, {x['code_postal']} {e['commune']}" if street else f"{x['code_postal']} {e['commune']}"
    e["lon"], e["lat"] = round(x["longitude"], 5), round(x["latitude"], 5)
    for key, src in (("tel", phone(x["telephone"])), ("web", x["web"]), ("onisep", x["fiche_onisep"])):
        if src:
            e[key] = src
    # 1 or 0 in the directory; a missing one (null) is left out, never read as « non ».
    for key, src in (("cantine", "restauration"), ("internat", "hebergement"), ("ulis", "ulis"), ("segpa", "segpa"), ("section_sport", "section_sport")):
        if x[src] in (0, 1):
            e[key] = x[src] == 1
    if x["appartenance_education_prioritaire"]:
        e["rep"] = x["appartenance_education_prioritaire"]
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    a = ap.parse_args()
    if a.json:
        rows = json.load(open(a.json, encoding="utf-8"))
    else:
        with urllib.request.urlopen(urllib.request.Request(EXPORT, headers=UA), timeout=120) as r:
            rows = json.load(r)
    keep = [x for x in rows if x["type_etablissement"] in TYPES and x["etat"] == "OUVERT"
            and not x["libelle_nature"].startswith("SECTION") and x["libelle_nature"] != "ECOLE SANS EFFECTIFS PERMANENTS"]
    if len(keep) < 600:
        raise SystemExit(f"only {len(keep)} establishments: the export looks cut, nothing written")
    order = {"ecole": 0, "college": 1, "lycee": 2}
    out = sorted((row(x) for x in keep), key=lambda e: (e["commune"], order[e["type"]], e["nom"]))
    data = {"construit": date.today().isoformat(), "mis_a_jour": max(x["date_maj_ligne"] for x in keep), "etablissements": out}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(out)} establishments written to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
