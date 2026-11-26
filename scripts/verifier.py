"""The `--verifier` checks of the bundled lists, shared by their build scripts (.github/workflows/listes.yml runs them
every Monday). Nothing is written: a check only says whether the list in src/ is still the source's. Its exit code
tells two things apart:
- 1, the list has aged: the source moved on (a new file, a new vintage, records added or gone past the threshold).
  Nothing is broken; someone runs the script without --verifier and proposes the rebuilt list. Said by `vieillie`.
- 2, the check is broken: the source did not answer, answered something unreadable, or the script raised.

Two kinds, as each list moves:
- `ecarts`: the list rebuilt in memory from the day's source, record by record against the bundled one, by a key that
  stays the same from one build to the next (a number, or a name and a place). Past `seuil` records added or gone, it
  has aged. For the lists of things (cameras, places, stations) that come and go one by one.
- `plus_recent`: the source's own date, read in its metadata (one small request), against the date the bundled list
  keeps. A newer source means it has aged. For the statistics by commune or by year, whose values all change at each
  release and that a key cannot see change, and for the sources too heavy to download every week.

The scripts load it by its path (`python3 -I` does not put scripts/ on the path):
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))

Run itself, it is what the workflow calls:
    python3 -I scripts/verifier.py build-x.py --verifier 2   runs one script's check: any exception, an exit with a
        message, or a 1 that did not say which list aged, becomes 2; in the workflow, an aged list exits 0;
    python3 -I scripts/verifier.py --bilan                    the job's last word: writes listes-vieillies.json and
        the job's summary, and fails only when a check is broken.
Both read and write the files named by LISTES_VIEILLIES (one aged list a line) and LISTES_CODES (one check a line).
"""
import json
import os
import runpy
import sys
import traceback
import urllib.request
from collections import Counter
from pathlib import Path

# The honest reader of rundata.re, as src/http.ts UA_RUNDATA (scripts/user-agent.txt): the site, the page that says what
# it reads, an address.
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
VIEILLIE, CASSEE = 1, 2


def lu(url, timeout=120):
    """A source's metadata, as JSON."""
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout))


def _ajoute(variable, ligne):
    if os.environ.get(variable):
        with open(os.environ[variable], "a", encoding="utf-8") as f:
            f.write(json.dumps(ligne, ensure_ascii=False) + "\n")


def vieillie(liste, script, source, date=None, ecart=None, consigne=None):
    """Says that `liste` has aged against `source` (its `date`, or `ecart` records added or gone), as a warning, not an
    error, and keeps it for the job's summary and listes-vieillies.json. 1."""
    consigne = consigne or f"Lancer scripts/{script} et proposer la PR."
    print(f"::warning::{liste} : la liste embarquée a vieilli ({source}{f' du {date}' if date else ''}"
          f"{f', {ecart} écarts' if ecart is not None else ''}). {consigne}")
    _ajoute("LISTES_VIEILLIES", {"liste": liste, "script": script, "source": source, "date": date, "ecart": ecart, "consigne": consigne})
    return VIEILLIE


def cassee(liste, raison):
    """Says that the check of `liste` could not be made. 2."""
    print(f"::error::{liste} : vérification impossible, {raison}. Regarder la source à la main.")
    return CASSEE


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
        return vieillie(liste, script, "la source", ecart=nn + nd, consigne=f"{nn + nd} écarts, seuil {seuil}. Lancer scripts/{script} et proposer la PR.")
    return 0


def plus_recent(liste, embarquee, source, script, quoi="la source"):
    """The date the bundled list keeps (`embarquee`) against the source's (`source`), both as ISO text, compared on
    their first ten characters (the day). 1 when the source is newer, 2 when its date could not be read, else 0."""
    print(f"{liste} : liste embarquée du {(embarquee or '?')[:10]}, {quoi} du {(source or '?')[:10]}")
    if not source:
        return cassee(liste, f"la date de {quoi} n'a pas pu être lue")
    if source[:10] > (embarquee or "")[:10]:
        return vieillie(liste, script, quoi, date=source[:10])
    return 0


def _lignes(variable):
    p = os.environ.get(variable)
    if not p or not Path(p).exists():
        return []
    return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]


def lancer(script, args):
    """Runs scripts/`script` (or the script at that path) with `args` as its own command line; its exit code, kept in
    LISTES_CODES."""
    avant = len(_lignes("LISTES_VIEILLIES"))
    chemin = Path(script) if "/" in script else Path(__file__).with_name(script)
    script = chemin.name
    sys.argv = [str(chemin), *args]
    try:
        runpy.run_path(str(chemin), run_name="__main__")
        code = 0
    except SystemExit as e:
        if e.code is None or isinstance(e.code, int):
            code = e.code or 0
        else:
            code = cassee(script, str(e.code))
    except Exception as e:  # a source that did not answer, an answer unreadable: the check, not the list
        traceback.print_exc()
        code = cassee(script, f"{type(e).__name__} : {e}")
    if code == VIEILLIE and len(_lignes("LISTES_VIEILLIES")) == avant and os.environ.get("LISTES_VIEILLIES"):
        code = cassee(script, "sortie 1 sans dire quelle liste a vieilli")
    elif code not in (0, VIEILLIE, CASSEE):
        code = cassee(script, f"sortie {code}")
    _ajoute("LISTES_CODES", {"script": script, "code": code})
    return code


def bilan(sortie="listes-vieillies.json"):
    """The aged lists into `sortie` and the job's summary; 1 when one check is broken, else 0 (aged lists included)."""
    vieillies, codes = _lignes("LISTES_VIEILLIES"), _lignes("LISTES_CODES")
    cassees = [c["script"] for c in codes if c["code"] >= CASSEE]
    Path(sortie).write_text(json.dumps(vieillies, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    lignes = ["## Listes embarquées", ""]
    if vieillies:
        lignes += ["Listes vieillies, à refaire (rien de cassé) :", "", "| liste | source | date | écarts | à faire |", "|---|---|---|---|---|"]
        lignes += [f"| {v['liste']} | {v['source']} | {v['date'] or ''} | {'' if v['ecart'] is None else v['ecart']} | {v['consigne']} |" for v in vieillies]
    else:
        lignes.append("Aucune liste vieillie.")
    lignes += ["", f"Vérifications cassées : {', '.join(cassees)}." if cassees else f"Vérifications faites : {len(codes)}, aucune cassée."]
    texte = "\n".join(lignes) + "\n"
    print(texte)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(texte)
    if cassees:
        print(f"::error::Vérifications cassées : {', '.join(cassees)}. Le détail est dans leur étape.")
        return 1
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--bilan"]:
        sys.exit(bilan())
    if len(sys.argv) < 2 or not sys.argv[1].endswith(".py"):
        sys.exit("usage : python3 -I scripts/verifier.py build-x.py [arguments] | --bilan")
    code = lancer(sys.argv[1], sys.argv[2:])
    # In the workflow (LISTES_CODES kept), an aged list leaves its step green: its warning and the summary say it.
    sys.exit(0 if code == VIEILLIE and os.environ.get("LISTES_CODES") else code)
