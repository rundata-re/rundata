#!/usr/bin/env python3
"""Build src/vie/creches.json: the places offered to the children under 3 of each commune, bundled.

The open data of the Cnaf (data.caf.fr, Licence Ouverte v2.0): the « taux de couverture d'accueil du jeune enfant » and
the « nombre de places offertes pour les enfants de moins de 3 ans », by commune, intercommunalité (EPCI) and
département. A theoretical offer in December of the year, not the children taken in: a place may be empty, or shared
by several children. The communes only above 10 000 inhabitants: 17 of the 24, the others in their intercommunalité's
figure alone. Kept: the latest year, the crèches' (EAJE) rate and places, and those of every formal care together
(crèches, assistantes maternelles, at home, school before 3). Never a crèche's name nor a person: the list of the
crèches is on monenfant.fr, which does not allow its reuse.
One year a year (the Cnaf put 2023 online on 22/01/2026): run again when the next one comes. Seven requests, a minute apart.
Usage: python3 -I scripts/build-creches.py
"""
import gzip
import json
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://data.caf.fr/api/explore/v2.1/catalog/datasets"
PAGE = "https://data.caf.fr/explore/dataset/txcouv_pe_com/"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
last = [0.0]

# The five intercommunalités by SIREN, as said on the page, and their communes by INSEE code: north, east, west, south.
EPCI = {
    "249740119": ("la CINOR", ["97411", "97418", "97420"]),
    "249740093": ("la CIREST", ["97409", "97402", "97410", "97406", "97419", "97421"]),
    "249740101": ("le TCO", ["97407", "97408", "97415", "97423", "97413"]),
    "249740077": ("la CIVIS", ["97416", "97414", "97405", "97404", "97401", "97424"]),
    "249740085": ("la CASUD", ["97422", "97403", "97412", "97417"]),
}


def get(url):
    """One request a minute at most."""
    wait = last[0] + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    body = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
    # data.caf.fr sends its answers gzipped, asked or not.
    return json.loads(gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body)


def records(dataset, where):
    """Every row of a dataset matching `where`: all of them or none."""
    j = get(f"{API}/{dataset}/records?{urllib.parse.urlencode({'where': where, 'limit': 100})}")
    if len(j["results"]) != j["total_count"]:
        raise SystemExit(f"{dataset}: {len(j['results'])} rows of {j['total_count']}")
    return j["results"]


def latest(taux, places, key, scale):
    """The latest year of each place (commune, EPCI, département): its rates and places, by its code."""
    year = max(r["annee"] for r in taux)
    pl = {r[key]: r for r in places if r["annee"] == year}
    out = {}
    for r in taux:
        if r["annee"] != year:
            continue
        p = pl[r[key]]
        out[r[key]] = {
            "creche": r[f"txcouv_eaje_{scale}"],
            "global": r[f"txcouv_{scale}"],
            "places_creche": int(p[f"pl_eaje_{scale}"]),
            "places": int(p[f"tot_offre_{scale}"]),
        }
    return year, out


def main():
    # The day the Cnaf put the year online.
    meta = get(f"{API}/txcouv_pe_com")["metas"]["default"]
    year, communes = latest(records("txcouv_pe_com", 'numcom like "974*"'), records("nbpla_pe_com", 'numcom like "974*"'), "numcom", "com")
    y2, epci = latest(records("txcouv_pe_epci", 'numepci like "24974*"'), records("nbpla_pe_epci", 'numepci like "24974*"'), "numepci", "epci")
    y3, dep = latest(records("txcouv_pe_dep", 'numdep = "974"'), records("nbpla_pe_dep", 'numdep = "974"'), "numdep", "dep")
    assert year == y2 == y3, (year, y2, y3)
    assert set(epci) == set(EPCI), sorted(epci)
    for code, (nom, members) in EPCI.items():
        # A commune counted in the wrong intercommunalité would give it more crèche places than it has.
        known = sum(communes[c]["places_creche"] for c in members if c in communes)
        assert known <= epci[code]["places_creche"], (nom, known, epci[code]["places_creche"])
        epci[code] |= {"nom": nom, "communes": members}
    dest = ROOT / "src/vie/creches.json"
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "annee": year,
        "publie_le": meta["modified"][:10],
        "source": "Cnaf, data.caf.fr, taux de couverture d'accueil du jeune enfant et places offertes aux enfants de moins de 3 ans, Licence Ouverte",
        "page": PAGE,
        "ile": dep["974"],
        "communes": dict(sorted(communes.items())),
        # A list, in the order of the island's tour (north, east, west, south): JavaScript orders numeric keys.
        "epci": [{"siren": c} | epci[c] for c in EPCI],
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{year}: {len(communes)} communes, {len(epci)} intercommunalités, île {dep['974']} -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
