#!/usr/bin/env python3
"""Build src/vie/cpf-organismes.json: the SIREN of the training bodies of La Réunion whose name may be shown.

The formations eligible to the CPF at La Réunion (src/providers/cpf.ts) come with the name of their training body, and
the name of a sole trader (entrepreneur individuel) is the name of a person: never shown, on the site as in the
repository. A body's name is shown only when its SIREN is in this list, of legal persons (personnes morales) alone, as
the API Recherche d'entreprises (recherche-entreprises.api.gouv.fr, DINUM, from the INSEE's Sirene) gives their legal
form: its code's first digit 3 to 9. 1 (a person) and 2 (a grouping without legal personality) are left out, and so is
a SIREN the API does not answer for: in doubt, left out. The list holds numbers only.
The SIREN asked are those of the formations of La Réunion with an open session in the Caisse des Dépôts' catalogue
(opendata.caissedesdepots.fr, Licence Ouverte 2.0), read once. Those in the list already are not asked again; the others
are, at each run (a sole trader stays out). One request every 3 s at most. On a 429, the run prints its status, its
limit headers and the start of its body (a quota, or the address refused?). On the first one, with a Retry-After of 60 s
or less, it waits that long and asks once again, once in the run. Another 429, a longer Retry-After or none: the run
stops, writes what it read, and is run again later, never right away. A body new to the catalogue keeps its name hidden
until then.
Usage: python3 -I scripts/build-cpf-organismes.py
"""
import email.utils
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/cpf-organismes.json"
CATALOGUE = "https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation/exports/json"
WHERE = 'code_departement="974" and nb_session_active>0'
SEARCH = "https://recherche-entreprises.api.gouv.fr/search"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
EVERY = 3.0
# The longest Retry-After waited, once in a run.
RETRY_MAX = 60


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def nature(siren):
    """The legal form's code of `siren`, or None when the API gives no unit of that number."""
    r = get(f"{SEARCH}?{urllib.parse.urlencode({'q': siren, 'page': 1, 'per_page': 1})}")
    hit = next((x for x in r.get("results", []) if x.get("siren") == siren), None)
    return hit and hit.get("nature_juridique")


def retry_after(e):
    """The seconds a 429 asks to wait, from its Retry-After (seconds or a date), or None."""
    v = e.headers.get("Retry-After")
    if not v:
        return None
    if v.strip().isdigit():
        return int(v)
    try:
        return max(0, int(email.utils.parsedate_to_datetime(v).timestamp() - time.time()))
    except (TypeError, ValueError):
        return None


def report(e):
    """A 429, for the log: its status, its limit headers and the start of its body."""
    limits = {k: v for k, v in e.headers.items() if k.lower() == "retry-after" or k.lower().startswith("x-ratelimit")}
    try:
        body = e.read(200).decode("utf-8", "replace")
    except OSError:
        body = ""
    print(f"429 : statut {e.code}, en-têtes {json.dumps(limits)}, corps {json.dumps(body[:200], ensure_ascii=False)}", file=sys.stderr)


def main():
    rows = get(f"{CATALOGUE}?{urllib.parse.urlencode({'select': 'siret', 'where': WHERE, 'group_by': 'siret'})}")
    sirens = sorted({r["siret"][:9] for r in rows if r.get("siret") and r["siret"][:9].isdigit()})
    known = set(json.loads(OUT.read_text())) if OUT.exists() else set()
    # Only the bodies of the catalogue: one that left it is asked again if it comes back.
    kept = known & set(sirens)
    todo = [s for s in sirens if s not in kept]
    asked = refused = unknown = 0
    stopped = retried = False
    first = None
    for s in todo:
        if asked:
            time.sleep(EVERY)
        asked += 1
        try:
            try:
                code = nature(s)
            except urllib.error.HTTPError as e:
                if e.code != 429 or retried:
                    raise
                retried, first = True, e
                report(e)
                wait = retry_after(e)
                if wait is None or wait > RETRY_MAX:
                    raise
                time.sleep(max(wait, EVERY))
                code = nature(s)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                if not first or e is not first:
                    report(e)
                stopped = True
                break
            unknown += 1
            continue
        except (urllib.error.URLError, TimeoutError):
            unknown += 1
            continue
        if code and code[0] in "3456789":
            kept.add(s)
        elif code:
            refused += 1
        else:
            unknown += 1
    OUT.write_text(json.dumps(sorted(kept)) + "\n")
    left = len(sirens) - len(kept) - refused - unknown
    print(f"{len(sirens)} SIREN au catalogue, {len(kept)} personnes morales dans la liste, {refused} écartés (personne ou groupement), "
          f"{unknown} sans réponse lisible, {left if stopped else 0} non demandés")
    if stopped:
        print("429 : arrêt, à relancer plus tard")


main()
