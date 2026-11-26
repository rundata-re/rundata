"""The `--verifier` checks of the bundled lists, shared by their build scripts (.github/workflows/listes.yml runs them
every Monday). Nothing is written: a check only says whether the list in src/ is still the source's, and fails (exit 1,
the job's alert) when it is not. Someone then runs the script without --verifier and proposes the rebuilt list.

Two kinds, as each list moves:
- `ecarts`: the list rebuilt in memory from the day's source, record by record against the bundled one, by a key that
  stays the same from one build to the next (a number, or a name and a place). Past `seuil` records added or gone, it
  fails. For the lists of things (cameras, places, stations) that come and go one by one.
- `plus_recent`: the source's own date, read in its metadata (one small request), against the date the bundled list
  keeps. A newer source fails. For the statistics by commune or by year, whose values all change at each release and
  that a key cannot see change, and for the sources too heavy to download every week.

The scripts load it by its path (`python3 -I` does not put scripts/ on the path):
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
"""
import json
import urllib.request
from collections import Counter
from pathlib import Path

# The honest reader of rundata.re, as src/http.ts UA_RUNDATA (scripts/user-agent.txt): the site, the page that says what
# it reads, an address.
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}


def lu(url, timeout=120):
    """A source's metadata, as JSON."""
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout))


def ecarts(liste, avant, maintenant, cle, seuil, script, montrer=None, n=20):
    """The bundled records `avant` against those of the day's source `maintenant`, by `cle(record)`. Prints the counts
    and up to `n` records added and gone (`montrer(record)`, the key itself by default). 1 past `seuil` added or gone,
    else 0. A Counter, not a set: two records with the same key (two cameras on one pole) count twice."""
    montrer = montrer or (lambda r: cle(r))
    a = Counter(map(cle, avant))
    m = Counter(map(cle, maintenant))
    nouveaux, disparus = m - a, a - m
    par_cle = {cle(r): r for r in list(avant) + list(maintenant)}
    nn, nd = sum(nouveaux.values()), sum(disparus.values())
    print(f"{liste} : {sum(a.values())} dans la liste embarquée, {sum(m.values())} dans la source aujourd'hui ; {nn} nouveaux, {nd} disparus")
    for k in list(nouveaux)[:n]:
        print(f"  nouveau : {montrer(par_cle[k])}")
    for k in list(disparus)[:n]:
        print(f"  disparu : {montrer(par_cle[k])}")
    if nn + nd > seuil:
        print(f"::error::{liste} : {nn + nd} écarts avec la source (seuil {seuil}). Lancer scripts/{script} et proposer la PR.")
        return 1
    return 0


def plus_recent(liste, embarquee, source, script, quoi="la source"):
    """The date the bundled list keeps (`embarquee`) against the source's (`source`), both as ISO text, compared on
    their first ten characters (the day). 1 when the source is newer, else 0."""
    print(f"{liste} : liste embarquée du {(embarquee or '?')[:10]}, {quoi} du {(source or '?')[:10]}")
    if not source:
        print(f"::error::{liste} : la date de {quoi} n'a pas pu être lue. Regarder la source à la main.")
        return 1
    if source[:10] > (embarquee or "")[:10]:
        print(f"::error::{liste} : {quoi} est plus récente que la liste embarquée. Lancer scripts/{script} et proposer la PR.")
        return 1
    return 0
