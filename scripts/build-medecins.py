#!/usr/bin/env python3
"""Build src/vie/medecins-comptes.json: how many doctors in private practice in each commune of La Réunion, from the
Assurance Maladie's directory. Numbers only: never a name nor an address in the file (the user's decision of 01/11/2026);
those are on the directory itself, annuairesante.ameli.fr.

From data.gouv.fr, « Annuaire santé Ameli » (Caisse nationale de l'Assurance Maladie, Licence Ouverte 2.0), the file of
the health professionals, its rows of type 1 (« Médecins généralistes et spécialistes ») whose postcode is 974xx, read
through data.gouv.fr's tabular API. The directory has a row per practice: a doctor with two practices in a commune is
counted once there (by name and speciality, read in memory and never written), the sector and the OPTAM option of their
first practice; one with practices in two communes is counted in both, and once in the island's total.
Counted in each commune: the general practitioners by sector and with the OPTAM option, the specialists by speciality and
those of them in sector 1, and the postcodes where its general practitioners work (the directory's links, web/commune.ts).
The directory publishes a new file every week; this is run by hand now and then, and the file comes in a pull request.
Usage: python3 -I scripts/build-medecins.py [--json FILE] [--out FILE]
  (--json: the tabular API's rows, already downloaded; --out: src/vie/medecins-comptes.json by default)
"""
import argparse
import json
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/medecins-comptes.json"
DATASET = "https://www.data.gouv.fr/api/1/datasets/annuaire-sante-ameli/"
RESOURCE = "432983b9-2e6f-473a-b35a-20403c300a5f"
ROWS = (f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE}/data/"
        "?coordonnees_code_postal__greater=97399&coordonnees_code_postal__less=97500&type_ps_code__exact=1&page_size=200")
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
# La Poste's postcodes (src/places/codes-postaux.ts); a CEDEX is read from its town.
POSTCODES = {
    "97400": "Saint-Denis", "97410": "Saint-Pierre", "97411": "Saint-Paul", "97412": "Bras-Panon", "97413": "Cilaos",
    "97414": "Entre-Deux", "97416": "Saint-Leu", "97417": "Saint-Denis", "97418": "Le Tampon", "97419": "La Possession",
    "97420": "Le Port", "97421": "Saint-Louis", "97422": "Saint-Paul", "97423": "Saint-Paul", "97424": "Saint-Leu",
    "97425": "Les Avirons", "97426": "Les Trois-Bassins", "97427": "L'Étang-Salé", "97429": "Petite-Île", "97430": "Le Tampon",
    "97431": "La Plaine-des-Palmistes", "97432": "Saint-Pierre", "97433": "Salazie", "97434": "Saint-Paul", "97435": "Saint-Paul",
    "97436": "Saint-Leu", "97437": "Saint-Benoît", "97438": "Sainte-Marie", "97439": "Sainte-Rose", "97440": "Saint-André",
    "97441": "Sainte-Suzanne", "97442": "Saint-Philippe", "97450": "Saint-Louis", "97460": "Saint-Paul", "97470": "Saint-Benoît",
    "97480": "Saint-Joseph", "97490": "Saint-Denis",
}
CEDEX = {"ST DENIS": "Saint-Denis", "SAINT DENIS": "Saint-Denis", "STE CLOTILDE": "Saint-Denis", "SAINTE CLOTILDE": "Saint-Denis",
         "STE CLOTLDE": "Saint-Denis", "ST PIERRE": "Saint-Pierre", "SAINT PIERRE": "Saint-Pierre"}
GP = "Médecin généraliste"
# The directory's codes, as src/vie/medecins.ts names them.
SECTORS = {1: "secteur_1", 2: "depassement_permanent", 3: "secteur_2", 0: "non_conventionnes"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return json.load(r)


def commune(cp, ville):
    if cp in POSTCODES:
        return POSTCODES[cp]
    return CEDEX.get(" ".join(ville.replace("CEDEX", "").split()))


def gps():
    return {"total": 0, "secteur_1": 0, "secteur_2": 0, "depassement_permanent": 0, "non_conventionnes": 0, "optam": 0}


def count(doctors):
    """The general practitioners by sector, the specialists by speciality, of (speciality, sector, optam) rows."""
    out = {"generalistes": gps(), "specialistes": {}}
    for specialite, sector, optam in doctors:
        if specialite == GP:
            g = out["generalistes"]
            g["total"] += 1
            g[SECTORS[sector]] += 1
            g["optam"] += optam
        else:
            s = out["specialistes"].setdefault(specialite, {"total": 0, "secteur_1": 0})
            s["total"] += 1
            s["secteur_1"] += sector == 1
    out["specialistes"] = dict(sorted(out["specialistes"].items()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    meta = get(DATASET)
    updated = next(r["last_modified"] for r in meta["resources"] if r["id"] == RESOURCE)[:10]
    if a.json:
        rows = json.load(open(a.json, encoding="utf-8"))
    else:
        rows, url = [], ROWS
        while url:
            page = get(url)
            rows += page["data"]
            url = page["links"].get("next")
            time.sleep(1)
    rows = [x for x in rows if x["type_ps_code"] == 1]
    if len(rows) < 2000:
        raise SystemExit(f"only {len(rows)} doctors: the export looks cut, nothing written")
    # The practices in a stable order, so that a doctor's first practice is always the same one.
    rows.sort(key=lambda x: (x["coordonnees_code_postal"], " ".join(x["coordonnees_voie"].split()), x["__id"]))
    here, island, postcodes = {}, {}, {}
    for x in rows:
        cp = x["coordonnees_code_postal"]
        c = commune(cp, x["coordonnees_ville"])
        if not c:
            raise SystemExit(f"no commune for postcode {cp}")
        # The name, in memory only: to count a doctor once.
        who = (" ".join((x["ps_activite_nom"] or "").split()), " ".join((x["ps_activite_prenom"] or "").split()), x["specialite_libelle"])
        row = (x["specialite_libelle"], x["secteur_conventionnel_code"], bool(x["option_tarifaire_libelle"]))
        here.setdefault(c, {}).setdefault(who, row)
        island.setdefault(who, row)
        if x["specialite_libelle"] == GP and cp in POSTCODES:
            postcodes.setdefault(c, set()).add(cp)
    data = {
        "construit": date.today().isoformat(),
        "mis_a_jour": updated,
        "ile": count(island.values()),
        "communes": {c: {"codes_postaux": sorted(postcodes.get(c, ())), **count(here[c].values())} for c in sorted(here)},
    }
    Path(a.out).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(rows)} practices, {len(island)} doctors, {sum(len(v) for v in here.values())} counted by commune, written to {a.out}")


if __name__ == "__main__":
    main()
