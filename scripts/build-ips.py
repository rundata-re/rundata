#!/usr/bin/env python3
"""Build src/vie/ips.json: the indice de position sociale and the results of the collèges and lycées of La Réunion.

From the ministry of Education's DEPP (data.education.gouv.fr, Licence Ouverte 2.0, one session a year): the indices de
position sociale of the collèges and of the lycées at the last rentrée, the collèges' indicateurs de valeur ajoutée
(IVAC) and the lycées' (IVAL, general and technological, and professional) at the last session. Kept: each
establishment's IPS; for a collège, its candidates, taux de réussite and valeur ajoutée in the brevet's série générale;
for a lycée, by voie, its candidates present, taux d'accès from seconde to the bac and taux de réussite, each with its
valeur ajoutée. The expected rate is the rate less its valeur ajoutée (the guides: « Valeur ajoutée = Taux constaté –
Taux attendu »), which the page computes. Never the mentions, the written marks, nor anything to rank them by. The
establishments are known by their UAI, which must all be in src/vie/ecoles.json: their names and communes are that
file's (the IVAC writes « SAINTE CLOTILDE » for collèges of Saint-Denis).
Usage: python3 -I scripts/build-ips.py
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets"
PAGE = "https://data.education.gouv.fr/explore/dataset/{}/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
# dataset id, its department field, its year field.
IPS_COLLEGES = ("fr-en-ips-colleges-ap2023", "code_du_departement", "rentree_scolaire")
IPS_LYCEES = ("fr-en-ips-lycees-ap2023", "code_du_departement", "rentree_scolaire")
IVAC = ("fr-en-indicateurs-valeur-ajoutee-colleges", "code_departement", "session")
IVAL_GT = ("fr-en-indicateurs-de-resultat-des-lycees-gt_v2", "code_departement", "annee")
IVAL_PRO = ("fr-en-indicateurs-de-resultat-des-lycees-pro_v2", "code_departement", "annee")
JEUX = [IPS_COLLEGES, IPS_LYCEES, IVAC, IVAL_GT, IVAL_PRO]
last = [0.0]


def read(url):
    """One request a minute at most."""
    wait = last[0] + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300))


def rows(jeu):
    """The island's rows of every year, all of them: as many as the API counts."""
    ident, dep, _ = jeu
    where = urllib.parse.urlencode({"where": f'{dep}="974"'})
    total = read(f"{API}/{ident}/records?{where}&limit=0")["total_count"]
    got = read(f"{API}/{ident}/exports/json?{where}")
    assert len(got) == total and total > 0, (ident, len(got), total)
    return got


def latest(jeu, got):
    """The last year's rows, one an establishment."""
    year = max(r[jeu[2]] for r in got)
    of = [r for r in got if r[jeu[2]] == year]
    assert len({r["uai"] for r in of}) == len(of), (jeu[0], "an establishment twice")
    return year, {r["uai"]: r for r in of}


def whole(v):
    """A rate or a valeur ajoutée: the ministry gives whole points (a number, or its text in a few fields)."""
    if v is None or v == "":
        return None
    f = float(v)
    assert f == int(f), v
    return int(f)


def ips(v):
    f = float(v)
    assert 40 < f < 200, v
    return f


def voie(r):
    """[presents, taux d'accès 2de-bac, its VA, taux de réussite, its VA] of a lycée's voie."""
    presents = whole(r["presents_total"])
    reussite = whole(r["taux_reu_total"])
    assert presents and presents > 0 and reussite is not None and 0 <= reussite <= 100, r
    acces = whole(r["taux_acces_2nde"])
    assert acces is None or 0 <= acces <= 100, r
    return [presents, acces, whole(r["va_acces_2nde"]), reussite, whole(r["va_reu_total"])]


def main():
    ids = " or ".join(f'dataset_id="{j[0]}"' for j in JEUX)
    meta = {r["dataset_id"]: r["metas"]["default"] for r in read(f"{API}?" + urllib.parse.urlencode({"where": ids, "limit": 10}))["results"]}
    assert set(meta) == {j[0] for j in JEUX}, set(meta)
    for j in JEUX:
        assert "Licence Ouverte" in meta[j[0]]["license"], (j[0], meta[j[0]]["license"])

    rentree, ips_c = latest(IPS_COLLEGES, rows(IPS_COLLEGES))
    rentree_l, ips_l = latest(IPS_LYCEES, rows(IPS_LYCEES))
    session, ivac = latest(IVAC, rows(IVAC))
    session_gt, gt = latest(IVAL_GT, rows(IVAL_GT))
    session_pro, pro = latest(IVAL_PRO, rows(IVAL_PRO))
    # « 2025-2026 »: the rentrée 2025, whose IPS go with the session 2025's results.
    assert rentree == rentree_l and session == session_gt == session_pro == rentree[:4], (rentree, rentree_l, session, session_gt, session_pro)

    known = {e["uai"]: e for e in json.loads((ROOT / "src/vie/ecoles.json").read_text())["etablissements"]}
    for uai in ips_c:
        assert known.get(uai, {}).get("type") == "college", uai
    for uai in ips_l:
        assert known.get(uai, {}).get("type") == "lycee", uai
    # The same collèges in both, and every lycée of the IVAL has its IPS.
    assert set(ivac) == set(ips_c), set(ivac) ^ set(ips_c)
    assert set(gt) | set(pro) <= set(ips_l), (set(gt) | set(pro)) - set(ips_l)

    colleges = []
    for uai in sorted(ips_c):
        r = ivac[uai]
        candidats, reussite = whole(r["nb_candidats_g"]), whole(r["taux_de_reussite_g"])
        assert candidats and candidats > 0 and reussite is not None and 0 <= reussite <= 100, r
        colleges.append([uai, ips(ips_c[uai]["ips"]), candidats, reussite, whole(r["va_du_taux_de_reussite_g"])])
    lycees = [[uai, ips(ips_l[uai]["ips_etab"]), voie(gt[uai]) if uai in gt else None, voie(pro[uai]) if uai in pro else None] for uai in sorted(ips_l)]
    assert len(colleges) > 80 and len(lycees) > 40, (len(colleges), len(lycees))

    out = ROOT / "src/vie/ips.json"
    head = {
        "construit": date.today().isoformat(),
        "rentree": int(rentree[:4]),
        "session": int(session),
        "jeux": {j[0]: {"titre": meta[j[0]]["title"], "page": PAGE.format(j[0]), "mis_a_jour": meta[j[0]]["modified"][:10]} for j in JEUX},
    }
    out.write_text(json.dumps(head | {"colleges": colleges, "lycees": lycees}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"rentrée {rentree}, session {session}: {len(colleges)} collèges, {len(lycees)} lycées ({len(gt)} voies GT, {len(pro)} voies pro) -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
