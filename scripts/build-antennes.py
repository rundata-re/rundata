#!/usr/bin/env python3
"""Build src/vie/antennes.json: the antennas of La Réunion, bundled.

Two datasets of the ANFR on data.gouv.fr, Licence Ouverte 2.0:
- « Données sur les réseaux mobiles », once a week: each mobile antenna support of the island, with each operator on it,
  the systems it runs (GSM 900, LTE 1800, 5G NR 3500…) and their state as declared to the ANFR (en service, techniquement
  opérationnel, projet approuvé). A state, not a measure: it never says whether an antenna is down right now.
- « Données sur les installations radioélectriques de plus de 5 watts », once a month: the stations, of which only the
  broadcast ones are kept (FM radio, TNT, DAB+), by support. Without civil aviation, Defence and the Interior. A private
  site's operator is never kept, nor any address: a place and a height only.
Run again once a week (mobile) or once a month (broadcast). Downloads at a low pace, one request a minute per host.
Usage: python3 -I scripts/build-antennes.py [--mobile observatoire.zip --mobile-du 2026-10-22 --radio data.zip --ref ref.zip --radio-du 2026-09-30] [--verifier ECART] [--fiches-seules]
Also writes src/vie/antennes-fiches.json: each mobile support's systems, states, days in service and azimuths (its sheet on /antennes).
--verifier: write nothing, compare with the bundled list, fail past ECART supports added, gone or changed (the Monday
check, .github/workflows/listes.yml).
"""
import argparse
import csv
import io
import json
import sys
import tempfile
import time
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOBILE = "https://www.data.gouv.fr/api/1/datasets/6ab291cf426d615c84196260/"
RADIO = "https://www.data.gouv.fr/api/1/datasets/551d4ff3c751df55da0cd89f/"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
# The ANFR's names, as the site writes the operators: their trade names (Telco OI sells as Free, SRR as SFR Réunion).
OPERATORS = {"ORANGE": "Orange", "SRR": "SFR Réunion", "TELCO OI": "Free", "ZEOP": "Zeop"}
STATES = {"En service": "service", "Techniquement opérationnel": "operationnel", "Projet approuvé": "projet"}
# The broadcast systems kept, as the site names them.
BROADCAST = {"FM": "fm", "RDF DVB-T": "tnt", "RDF T-DAB": "dab"}
# The broadcast stations' operator (table SUP_EXPLOITANT) kept only when it is TDF: the Arcom, written as the operator of
# the DAB+ stations, assigns the frequencies and runs no transmitter (wording validated on 29/10); « Site privé » and « Réseau privé » never.
NAMED = {"TDF"}
last = {}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600)


def newest(dataset, title=None):
    """The newest zip of the dataset (whose title has this word), and the day in its name."""
    meta = json.load(opened(dataset))
    zips = [r for r in meta["resources"] if r["format"] == "zip" and (title is None or title in r["title"])]
    return max(zips, key=lambda r: r["last_modified"])["url"]


def fetch(url, dest):
    with opened(url) as r:
        dest.write_bytes(r.read())
    return dest


def table(z, name):
    member = next(n for n in z.namelist() if n.endswith(name))
    return csv.DictReader(io.TextIOWrapper(z.open(member), encoding="utf-8-sig"), delimiter=";")


def dms(r, kind):
    v = int(r[f"COR_NB_DG_{kind}"]) + int(r[f"COR_NB_MN_{kind}"]) / 60 + int(r[f"COR_NB_SC_{kind}"]) / 3600
    return -v if r[f"COR_CD_{'NS' if kind == 'LAT' else 'EW'}_{kind}"] in ("S", "W") else v


def metres(x):
    """« 38,2 » in metres, one decimal; 0 when not said."""
    return round(float((x or "0").replace(",", ".")), 1)


def natures(ref):
    return {r["NAT_ID"]: r["NAT_LB_NOM"].strip() for r in table(ref, "SUP_NATURE.txt")}


def mobile(path, nature):
    """One entry per support: where, how high, on what, and each operator's generations by state."""
    z = zipfile.ZipFile(path)
    supports, newest_service = {}, ""
    for r in table(z, ".csv"):
        if r["sta_nm_dpt"] != "974":
            continue
        s = supports.get(r["sup_id"])
        if s is None:
            lat, lon = (float(x) for x in r["coordonnees"].split(","))
            s = supports[r["sup_id"]] = {"lon": round(lon, 5), "lat": round(lat, 5), "h": metres(r["sup_nm_haut"]), "insee": r["com_cd_insee"],
                                          "nature": nature.get(r["nat_id"], ""), "ops": defaultdict(dict)}
        g, state = r["generation"], STATES[r["statut"]]
        gens = s["ops"][OPERATORS[r["adm_lb_nom"]]]
        # A generation's state is its most advanced system's: one band in service is the generation in service.
        if g not in gens or list(STATES.values()).index(state) < list(STATES.values()).index(gens[g]):
            gens[g] = state
        if state == "service" and r["emr_dt"] > newest_service:
            newest_service = r["emr_dt"]
    out = []
    for sid, s in sorted(supports.items(), key=lambda x: int(x[0])):
        ops = {op: {st: "".join(sorted(g[0] for g, v in gens.items() if v == st)) for st in STATES.values() if st in gens.values()} for op, gens in sorted(s["ops"].items())}
        out.append({"id": int(sid), "lon": s["lon"], "lat": s["lat"], "h": s["h"], "insee": s["insee"], **({"nature": s["nature"]} if s["nature"] else {}), "ops": ops})
    return out, newest_service


def fiches(path):
    """Each mobile support's sheet (src/vie/antennes-fiches.json, loaded on a click on /antennes): each system of each
    operator, as the ANFR file says it, its state, its day in service (none for a project) and its antennas' azimuths
    in degrees. The power is not in the file. One row per system: [operator's letter, system, state, day, azimuths]."""
    z = zipfile.ZipFile(path)
    out = defaultdict(list)
    letter = {v: v[0].lower() for v in OPERATORS.values()}
    for r in table(z, ".csv"):
        if r["sta_nm_dpt"] != "974":
            continue
        az = "|".join(x for x in (r["list_azimut"] or "").split("|") if x.strip())
        out[int(r["sup_id"])].append([letter[OPERATORS[r["adm_lb_nom"]]], r["emr_lb_systeme"], STATES[r["statut"]][0], r["emr_dt"] or "", az])
    order = list(letter.values())
    return {str(k): sorted(v, key=lambda x: (order.index(x[0]), x[1])) for k, v in sorted(out.items())}


def write_fiches(mob, mob_day):
    dest = ROOT / "src/vie/antennes-fiches.json"
    dest.write_text(json.dumps({"fichier_du": mob_day, "supports": fiches(mob)}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(dest)


def broadcast(path, ref, nature):
    """One entry per support carrying FM, TNT or DAB+ stations: where, how high, on what, how many of each."""
    z, exploitants = zipfile.ZipFile(path), {r["ADM_ID"]: r["ADM_LB_NOM"].strip() for r in table(ref, "SUP_EXPLOITANT.txt")}
    supports = defaultdict(list)
    for r in table(z, "SUP_SUPPORT.txt"):
        if r["COM_CD_INSEE"].startswith("974"):
            supports[r["STA_NM_ANFR"]].append(r)
    owner = {r["STA_NM_ANFR"]: exploitants.get(r["ADM_ID"], "") for r in table(z, "SUP_STATION.txt") if r["STA_NM_ANFR"] in supports}
    kinds = defaultdict(set)
    for r in table(z, "SUP_EMETTEUR.txt"):
        if r["STA_NM_ANFR"] in supports and r["EMR_LB_SYSTEME"] in BROADCAST:
            kinds[r["STA_NM_ANFR"]].add(BROADCAST[r["EMR_LB_SYSTEME"]])
    out = {}
    for sta, ks in kinds.items():
        for s in supports[sta]:
            e = out.setdefault(s["SUP_ID"], {"id": int(s["SUP_ID"]), "lon": round(dms(s, "LON"), 5), "lat": round(dms(s, "LAT"), 5), "h": metres(s["SUP_NM_HAUT"]),
                                             "insee": s["COM_CD_INSEE"], **({"nature": nature[s["NAT_ID"]]} if nature.get(s["NAT_ID"]) else {}), "fm": 0, "tnt": 0, "dab": 0, "exploitants": set()})
            # Stations, not frequencies: one FM station may carry one radio.
            for k in ks:
                e[k] += 1
            if owner.get(sta) in NAMED:
                e["exploitants"].add(owner[sta])
    # Counts of 0 and no named operator are left out.
    return [{k: sorted(v) if k == "exploitants" else v for k, v in e.items() if v or k == "h"} for e in sorted(out.values(), key=lambda e: e["id"])]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mobile", help="a local copy of the weekly zip of the mobile networks")
    p.add_argument("--mobile-du", help="its day, 2026-10-22")
    p.add_argument("--radio", help="a local copy of the monthly zip of the stations over 5 W (…-export-etalab-data.zip)")
    p.add_argument("--ref", help="and of its reference tables (…-export-etalab-ref.zip)")
    p.add_argument("--radio-du", help="the day of that export, 2026-09-30")
    p.add_argument("--fiches-seules", action="store_true", help="write only src/vie/antennes-fiches.json, from --mobile")
    p.add_argument("--verifier", type=int, metavar="ECART", help="write nothing: compare with src/vie/antennes.json, fail past ECART supports added, gone or changed")
    a = p.parse_args()
    work = Path(tempfile.mkdtemp())
    if a.mobile:
        mob, mob_day = Path(a.mobile), a.mobile_du
    else:
        url = newest(MOBILE)
        # « observatoireod-20261022-observatoire-2g-3g-4g-5g.zip »
        mob_day = next(f"{x[:4]}-{x[4:6]}-{x[6:8]}" for x in url.split("/")[-1].split("-") if x.isdigit() and len(x) == 8)
        mob = fetch(url, work / "mobile.zip")
    if a.fiches_seules:
        write_fiches(mob, mob_day)
        return
    if a.radio:
        data, ref, radio_day = Path(a.radio), Path(a.ref), a.radio_du
    else:
        url = newest(RADIO, "Tables supports")
        # « 20260930-export-etalab-data.zip »
        x = url.split("/")[-1][:8]
        radio_day = f"{x[:4]}-{x[4:6]}-{x[6:8]}"
        data = fetch(url, work / "radio.zip")
        ref = fetch(newest(RADIO, "Tables de référence"), work / "ref.zip")
    nature = natures(zipfile.ZipFile(ref))
    supports, newest_service = mobile(mob, nature)
    radio = broadcast(data, zipfile.ZipFile(ref), nature)
    dest = ROOT / "src/vie/antennes.json"
    if a.verifier is not None:
        sys.exit(verifier(dest, supports, radio, mob_day, radio_day, a.verifier))
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "mobile": {"fichier_du": mob_day, "derniere_mise_en_service": newest_service, "source": "ANFR, Données sur les réseaux mobiles, Licence Ouverte 2.0",
                   "page": "https://www.data.gouv.fr/datasets/donnees-sur-les-reseaux-mobiles"},
        "radio_tv": {"fichier_du": radio_day, "source": "ANFR, Données sur les installations radioélectriques de plus de 5 watts, Licence Ouverte 2.0",
                     "page": "https://www.data.gouv.fr/datasets/donnees-sur-les-installations-radioelectriques-de-plus-de-5-watts-1"},
        "supports": supports,
        "emetteurs": radio,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    write_fiches(mob, mob_day)
    print(dest, len(supports), "supports mobiles au", mob_day, ";", len(radio), "supports radio et TV au", radio_day)


def verifier(dest, supports, radio, mob_day, radio_day, ecart):
    """The bundled list against the ANFR's newest files, without writing: each support by its id, mobile and broadcast,
    added, gone, or changed (an operator, a generation's state, a height). 1 (the job's failure, its alert) past `ecart`."""
    bundled = json.loads(dest.read_text(encoding="utf-8"))
    total = 0
    for name, before, now, day, was in (("mobiles", bundled["supports"], supports, mob_day, bundled["mobile"]["fichier_du"]),
                                         ("radio et TV", bundled["emetteurs"], radio, radio_day, bundled["radio_tv"]["fichier_du"])):
        b, n = {x["id"]: x for x in before}, {x["id"]: x for x in now}
        added, gone = [n[i] for i in n.keys() - b.keys()], [b[i] for i in b.keys() - n.keys()]
        changed = [(b[i], n[i]) for i in b.keys() & n.keys() if b[i] != n[i]]
        print(f"supports {name} : liste au {was}, {len(b)} ; fichier de l'ANFR au {day}, {len(n)} : "
              f"{len(added)} nouveaux, {len(gone)} disparus, {len(changed)} changés")
        for x in added[:20]:
            print(f"  nouveau : {x['id']} ({x['insee']}, {x.get('nature', '')})")
        for x in gone[:20]:
            print(f"  disparu : {x['id']} ({x['insee']}, {x.get('nature', '')})")
        for x, y in changed[:20]:
            print(f"  changé : {y['id']} ({y['insee']}) : {', '.join(sorted(k for k in x.keys() | y.keys() if x.get(k) != y.get(k)))}")
        total += len(added) + len(gone) + len(changed)
    if total > ecart:
        print(f"::error::La liste des antennes a {total} écarts avec les fichiers de l'ANFR (seuil {ecart}) : lancer scripts/build-antennes.py et proposer la PR.")
        return 1
    return 0


if __name__ == "__main__":
    main()
