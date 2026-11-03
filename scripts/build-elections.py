#!/usr/bin/env python3
"""Build src/vie/elections.json: the results of the elections in each commune of La Réunion.

From data.gouv.fr's « Données des élections agrégées » (Licence Ouverte 2.0), built from the ministry of the Interior's
files, one row a bureau de vote: its two CSV files for all of France (2.8 GB), downloaded once each, a minute apart, of
which the island's rows are kept. The file starts in 1999: nothing before. Kept, for each commune:
- every scrutin of the file, each of its rounds: inscrits, abstentions, votants, blancs, nuls, exprimés, and the voix of
  each candidate, binôme or list, under its panel number. Never the régionales 2004 (three communes only in the file).
  A commune split between circonscriptions (législatives) or cantons (cantonales, départementales) has one block for
  each: its bureaux grouped by their ballot, since the file does not always say the circonscription nor the canton. A
  candidate is known by its whole ballot line, never its name alone (homonyms);
- the inscrits and votants of the first round of every scrutin where the whole commune votes: never the cantonales
  (half the cantons each time).
Never the political nuances (the user's decision), nor the bureaux (their perimeter changes from one election to the
next). The island's code is « ZD » or « 974 », even for one round in the two files. Up to 2015, the file has no blancs:
its nuls are the blancs and the nuls, its votants its exprimés and its nuls. Nor the panels of the européennes 2004
and 2009 and of the municipales 2008: their lines in the order of the alphabet. Each block's voix must add up to its
exprimés.
Usage: python3 -I scripts/build-elections.py [--cache DIR]   (DIR keeps the island's rows, for a run started again)
"""
import csv
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://www.data.gouv.fr/api/1/datasets/donnees-des-elections-agregees/"
PAGE = "https://www.data.gouv.fr/datasets/donnees-des-elections-agregees"
FICHIERS = {
    "general": "https://www.data.gouv.fr/datasets/r/b8703c69-a18f-46ab-9e7f-3a8368dcb891",
    "candidats": "https://www.data.gouv.fr/datasets/r/52a11762-45b4-414f-b6a2-eaa290217dc6",
}
UA = {"User-Agent": os.environ.get("RUNDATA_UA", "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)")}
ILE = {"ZD", "974"}
# Three communes only in the file.
EXCLUS = {"2004_regi"}
TYPES = ["muni", "legi", "euro", "pres", "regi", "dpmt", "cant"]
# Where a commune can hold several races: its bureaux grouped by their ballot.
PAR_BUREAU = {"legi", "dpmt", "cant"}
# Where the ballot lines are lists.
LISTES = {"muni", "euro", "regi"}
# Half the cantons vote each time: never in the participation of the whole commune.
PARTIELS = {"cant"}
# The file gives no circonscription in 2024: each bureau's is taken from 2022's, under the same boundaries (since 2010)
# and the same bureaux, which a block whose bureaux fall in two circonscriptions would refute.
REPERE = {"2024_legi": "2022_legi_t1"}
CHIFFRES = ["inscrits", "abstentions", "votants", "blancs", "nuls", "exprimes"]
NOMBRES = set(CHIFFRES) | {"voix", "no_panneau"}
cache = None
last = [0.0]


def island(name):
    """The island's rows of one of the two files, as read once: the whole file streamed, one download a minute at
    most, three tries when the server fails."""
    key = cache and cache / f"ile-{name}.csv"
    if not (key and key.exists()):
        for attempt in range(3):
            wait = last[0] + 62 - time.time()
            if wait > 0:
                time.sleep(wait)
            last[0] = time.time()
            try:
                with urllib.request.urlopen(urllib.request.Request(FICHIERS[name], headers=UA), timeout=300) as r:
                    lines = csv.DictReader(io.TextIOWrapper(r, encoding="utf-8", newline=""), delimiter=";")
                    out = io.StringIO()
                    w = csv.DictWriter(out, lines.fieldnames, delimiter=";")
                    w.writeheader()
                    w.writerows(x for x in lines if x["code_departement"] in ILE)
                break
            except urllib.error.HTTPError as e:
                if e.code < 500 or attempt == 2:
                    raise
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if attempt == 2:
                    raise
            time.sleep(120)
        text = out.getvalue()
        if key:
            key.write_text(text, encoding="utf-8")
    else:
        text = key.read_text(encoding="utf-8")
    rows = {}
    for x in csv.DictReader(io.StringIO(text, newline=""), delimiter=";"):
        x = {k: (int(v) if k in NOMBRES and v else v or None) for k, v in x.items()}
        rows.setdefault(x["id_election"], []).append(x)
    for election, xs in rows.items():
        assert len({x["code_departement"] for x in xs}) == 1, (name, election)
    return rows


def total(xs):
    """A sum of the bureaux; null when the file has none: the blancs up to 2015, counted with the nuls."""
    assert len({x is None for x in xs}) == 1, xs
    return None if xs[0] is None else sum(xs)


def ligne(r, listes):
    """A ballot line as published, its spaces trimmed: [panel, the list's or the candidate's name, the head of the list
    or null]; a list the file names only by its head (the municipales 2008 to 2020's first round, the européennes up to
    2014, the régionales) has no name. The municipales 2020's second round name theirs in « liste »."""
    personne = " ".join(" ".join(x for x in (r["nom"], r["prenom"]) if x).split()) or None
    liste = " ".join((r["libelle_etendu_liste"] or r["libelle_abrege_liste"] or r["liste"] or "").split()) or None
    if r["binome"]:
        return [r["no_panneau"], r["binome"], None]
    if liste:
        return [r["no_panneau"], liste, r["nom_tete_liste"] or personne]
    assert personne, r
    return [r["no_panneau"], None, personne] if listes else [r["no_panneau"], personne, None]


def alphabet(ligne):
    """A line's place in the alphabet: its name, or its head's, without accents nor case."""
    return "".join(c for c in unicodedata.normalize("NFD", ligne[1] or ligne[2]) if not unicodedata.combining(c)).casefold()


def circonscription(n):
    """« 1re circonscription », « 6e circonscription »: its number, from the file's code or its name (« 1ère », « 6ème »),
    written the way the site writes ordinals."""
    n = int(n)
    return f"{n}{'re' if n == 1 else 'e'} circonscription"


def lieux(election, general, repere):
    """{bureau: the name of its circonscription or its canton}, when the file gives it or its code."""
    kind = election[5:9]
    out = {}
    for bv, g in general.items():
        if kind == "dpmt":
            out[bv] = g["libelle_canton"]
        elif kind == "legi":
            out[bv] = g["libelle_circonscription"] or g["code_circonscription"]
    if election[:9] in REPERE:
        assert not any(out.values()), election
        out = {bv: repere[bv] for bv in general}
    if kind == "legi":
        for bv, name in out.items():
            m = name and re.fullmatch(r"0*(\d+)(?:(?:ère|ème) circonscription)?", name)
            assert not name or m, (election, name)
            out[bv] = m and circonscription(m[1])
    return out


def tour(election, general, candidats, communes, repere):
    """One round: its ballot lines, and for each commune its blocks, each block its figures and its lines' voix."""
    kind = election[5:9]
    lignes, index = [], {}

    def at(r):
        k = tuple(ligne(r, kind in LISTES))
        if k not in index:
            index[k] = len(lignes)
            lignes.append(list(k))
        return index[k]

    general = {r["id_brut_miom"]: r for r in general}
    assert len(general) == len({(g["code_commune"], g["code_bv"]) for g in general.values()}), election
    lieu = lieux(election, general, repere)
    bulletins = {}
    for r in candidats:
        b = bulletins.setdefault(r["id_brut_miom"], {})
        i = at(r)
        assert i not in b, (election, r["id_brut_miom"], lignes[i])
        b[i] = r["voix"]
    assert set(bulletins) <= set(general), (election, set(bulletins) - set(general))
    groups = {}
    for bv, g in general.items():
        if bv not in bulletins:
            # A bureau whose race ended at the first round: no ballot, no vote.
            assert not g["exprimes"], (election, bv)
            continue
        ballot = frozenset(bulletins[bv]) if kind in PAR_BUREAU else None
        groups.setdefault((g["code_commune"], ballot), []).append(bv)
    blocs = {}
    for (code, _), bvs in sorted(groups.items(), key=lambda kv: (kv[0][0], min(kv[1]))):
        figures = [total([general[bv][c] for bv in bvs]) for c in CHIFFRES]
        voix = {}
        for bv in bvs:
            for i, v in bulletins[bv].items():
                voix[i] = voix.get(i, 0) + v
        # The circonscription's or the canton's name, when the file gives one for all the block's bureaux.
        names = {lieu.get(bv) for bv in bvs}
        assert len(names) == 1, (election, code, names)
        name = names.pop()
        blocs.setdefault(code, []).append({"g": figures, "v": [[i, v] for i, v in voix.items()]} | ({"lieu": name} if name else {}))
    out = {}
    for code, bs in blocs.items():
        # A commune split between races: each block named, each name once; or none named.
        named = [b["lieu"] for b in bs if "lieu" in b]
        assert len(bs) == 1 or len(set(named)) == len(named) in (0, len(bs)), (election, code, named)
        if len(named) == len(bs):
            bs.sort(key=lambda b: b["lieu"])
        for b in bs:
            assert sum(v for _, v in b["v"]) == b["g"][5], (election, code, b["g"])
            # One line a panel: a list or a candidate written two ways in the file would count twice. Without the
            # panels, the lines in the order of the alphabet, which ranks no one.
            panels = [lignes[i][0] for i, _ in b["v"]]
            assert len(set(panels)) == len(panels) or set(panels) == {None}, (election, code, [lignes[i] for i, _ in b["v"]])
            b["v"].sort(key=lambda iv: (lignes[iv[0]][0] or 0, alphabet(lignes[iv[0]])))
        out[communes[code]] = bs
    return {"lignes": lignes, "communes": dict(sorted(out.items()))}


def main():
    global cache
    if "--cache" in sys.argv:
        cache = Path(sys.argv[sys.argv.index("--cache") + 1])
        cache.mkdir(parents=True, exist_ok=True)
    meta = json.load(urllib.request.urlopen(urllib.request.Request(DATASET, headers=UA), timeout=60))
    last[0] = time.time()
    assert meta["license"] == "lov2", meta["license"]
    insee = {code: nom for nom, code in re.findall(r'"([^"]+)": "(974\d\d)"', (ROOT / "src/places/insee.ts").read_text())}
    assert len(insee) == 24, insee
    general, candidats = island("general"), island("candidats")
    assert set(general) == set(candidats), set(general) ^ set(candidats)

    # Every scrutin, newest first, its rounds in order.
    rounds = {}
    for election in general:
        ident, t = election.rsplit("_t", 1)
        if ident not in EXCLUS:
            rounds.setdefault(ident, []).append(int(t))
    assert min(int(i[:4]) for i in rounds) == 1999, sorted(rounds)
    scrutins, repere = [], {}
    for ident in sorted(rounds, key=lambda i: (-int(i[:4]), TYPES.index(i[5:]))):
        assert sorted(rounds[ident]) == list(range(1, len(rounds[ident]) + 1)), (ident, rounds[ident])
        tours = []
        for t in sorted(rounds[ident]):
            election = f"{ident}_t{t}"
            if ident in REPERE:
                ref = {r["id_brut_miom"]: r for r in general[REPERE[ident]]}
                repere = {r["id_brut_miom"]: ref[r["id_brut_miom"]]["libelle_circonscription"] for r in general[election]}
            tours.append(tour(election, general[election], candidats[election], insee, repere))
        if ident[5:] not in PARTIELS:
            assert len(tours[0]["communes"]) == 24, (ident, len(tours[0]["communes"]))
        scrutins.append({"id": ident, "tours": tours})
        print(ident, [len(t["communes"]) for t in tours], [len(t["lignes"]) for t in tours], flush=True)

    participation = {}
    for kind in TYPES:
        if kind in PARTIELS:
            continue
        years = sorted(int(i[:4]) for i in rounds if i[5:] == kind)
        got = {}
        for y in years:
            got[y] = {}
            for g in general[f"{y}_{kind}_t1"]:
                c = got[y].setdefault(g["code_commune"], [0, 0])
                c[0] += g["inscrits"]
                c[1] += g["votants"]
            assert set(got[y]) == set(insee), (kind, y, set(insee) - set(got[y]))
        participation[kind] = {"annees": years, "communes": {insee[code]: [got[y][code] for y in years] for code in sorted(insee)}}

    out = ROOT / "src/vie/elections.json"
    head = {"construit": date.today().isoformat(), "mis_a_jour": meta["last_modified"][:10], "titre": meta["title"], "page": PAGE}
    out.write_text(json.dumps(head | {"scrutins": scrutins, "participation": participation}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(scrutins)} scrutins, {sum(len(s['tours']) for s in scrutins)} tours, {out.stat().st_size} octets -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
