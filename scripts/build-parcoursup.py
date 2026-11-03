#!/usr/bin/env python3
"""Build src/vie/parcoursup.json and src/vie/parcoursup-formations.json: the formations of La Réunion in Parcoursup.

From the ministry of Higher education's « Parcoursup <session> - vœux de poursuite d'études et de réorientation dans
l'enseignement supérieur et réponses des établissements » (SIES, data.enseignementsup-recherche.gouv.fr, Licence
Ouverte 2.0, one session a year, apprenticeship apart): every formation of an establishment of the island at the end of
the session. Kept: the formation, its establishment and commune, its places, its taux d'accès and its sheet on
parcoursup.fr. Never the admitted's profile (mentions, boursiers, girls, same lycée), the candidates per place nor the
rank of the last called: they do not compare from one formation to another. The communes' counts go to their own small
file, which the communes' pages read; the list, to the other, which /ecoles reads.
Usage: python3 -I scripts/build-parcoursup.py
"""
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-parcoursup"
PAGE = "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
WHERE = 'dep="974"'
FIELDS = "session,dep,cod_uai,g_ea_lib_vx,ville_etab,lib_for_voe_ins,capa_fin,taux_acces_ens,lien_form_psup"
# The sheet of a formation on parcoursup.fr: only its number changes, kept alone.
SHEET = re.compile(r"https://dossierappel\.parcoursup\.fr/Candidats/public/fiches/afficherFicheFormation\?g_ta_cod=(\d+)&typeBac=0&originePc=0")
# The communes as the server spells them (src/places/insee.ts).
NAMES = {nom: code for nom, code in re.findall(r'"([^"]+)": "(974\d\d)"', (ROOT / "src/places/insee.ts").read_text())}
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
last = [0.0]


def read(url):
    """One request a minute at most."""
    wait = last[0] + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300))


def main():
    meta = read(BASE)
    total = read(f"{BASE}/records?" + urllib.parse.urlencode({"where": WHERE, "limit": 0}))["total_count"]
    rows = read(f"{BASE}/exports/json?" + urllib.parse.urlencode({"where": WHERE, "select": FIELDS}))
    assert len(rows) == total and total > 200, (len(rows), total)
    m = meta["metas"]["default"]
    # « …prennent en compte l'ensemble de la campagne jusqu'à la date du 10 septembre 2025 »: the day the figures stop.
    desc = re.sub(r"<[^>]+>|\s+", " ", m["description"])
    d = re.search(r"jusqu.{1,2}à la date du (\d{1,2}) (\w+) (\d{4})", desc)
    arrete = date(int(d[3]), MONTHS.index(d[2]) + 1, int(d[1])).isoformat()
    session = {r["session"] for r in rows}
    assert len(session) == 1, session
    session = int(session.pop())
    assert str(session) in m["title"] and arrete.startswith(str(session)), (m["title"], arrete)

    formations = []
    for r in rows:
        assert r["dep"] == "974" and r["ville_etab"] in NAMES, (r["dep"], r["ville_etab"])
        assert r["capa_fin"] and r["capa_fin"] > 0 and r["taux_acces_ens"] is not None and 0 <= r["taux_acces_ens"] <= 100, r
        sheet = SHEET.fullmatch(r["lien_form_psup"])
        assert sheet, r["lien_form_psup"]
        formations.append({
            "commune": r["ville_etab"],
            "uai": r["cod_uai"],
            "etablissement": r["g_ea_lib_vx"].strip(),
            "formation": r["lib_for_voe_ins"].strip(),
            "places": r["capa_fin"],
            "taux_acces": r["taux_acces_ens"],
            "fiche": int(sheet[1]),
        })
    assert len({f["fiche"] for f in formations}) == len(formations), "a sheet twice"
    # One name a code: the list is grouped by establishment.
    assert len({(f["uai"], f["etablissement"]) for f in formations}) == len({f["uai"] for f in formations})
    formations.sort(key=lambda f: (f["commune"], f["etablissement"], f["formation"]))

    communes = {}
    for nom, code in NAMES.items():
        of = [f for f in formations if f["commune"] == nom]
        communes[code] = {"formations": len(of), "places": sum(f["places"] for f in of), "etablissements": len({f["uai"] for f in of})}
    assert sum(c["formations"] for c in communes.values()) == len(formations)

    head = {
        "construit": date.today().isoformat(),
        "session": session,
        "arrete_le": arrete,
        "mis_a_jour": m["modified"][:10],
        "titre": m["title"],
        "page": PAGE,
    }
    small = ROOT / "src/vie/parcoursup.json"
    small.write_text(json.dumps(head | {"communes": communes}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    # By establishment, its formations as [name, places, taux d'accès, sheet]: the names said once.
    etablissements = []
    for f in formations:
        if not etablissements or etablissements[-1]["uai"] != f["uai"]:
            etablissements.append({"commune": f["commune"], "uai": f["uai"], "nom": f["etablissement"], "formations": []})
        etablissements[-1]["formations"].append([f["formation"], f["places"], f["taux_acces"], f["fiche"]])
    assert len(etablissements) == len({f["uai"] for f in formations})
    big = ROOT / "src/vie/parcoursup-formations.json"
    big.write_text(json.dumps({"session": session, "etablissements": etablissements}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"session {session}, arrêtée le {arrete}: {len(formations)} formations, {sum(f['places'] for f in formations)} places,",
          f"{sum(1 for c in communes.values() if c['formations'])} communes -> {small.relative_to(ROOT)}, {big.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
