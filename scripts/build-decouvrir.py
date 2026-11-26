#!/usr/bin/env python3
"""Build src/vie/decouvrir.json: the remarkable places of each commune, bundled.

The « Lieux remarquables de la Réunion » of the island's tourist information system (SIT, TourInSoft), on the Région's
portal data.regionreunion.com, Licence Ouverte, rebuilt by the SIT every week: museums, gardens, estates, temples,
distilleries. Not the places of the « Terroir » alone (shops, workshops, markets, chains): professionals, which the
site does not list. Kept for each: its name, its commune by INSEE code, its categories and the SIT's summary, of which
the page shows the first sentence (vie/decouvrir.ts, resume). Not kept: its address nor its point, which the commune's page does not show, and every place named after a
person (an artisan, a producer, a guide), whose name the repository never holds: only the names read and kept
(scripts/decouvrir-lus.txt) go in.
A place of « Patrimoine culturel » that is also a historic monument (src/vie/monuments.json, run build-monuments.py
first) carries its reference: the same name, or a word of its own name shared with a monument less than 150 m away
(« Maison Folio », « Villa Folio »). The distance alone is not enough: the old centres have a monument every 100 m.
Run again now and then (the SIT rebuilds the list every Sunday). Two requests, a minute apart.
Usage: python3 -I scripts/build-decouvrir.py [--json lieux.json --du 2026-11-01] [--verifier ECART]
  (--verifier: write nothing, compare with src/vie/decouvrir.json and fail past ECART places added, gone or changed,
  the Monday check of .github/workflows/listes.yml; the names not read are counted there, never printed)
"""
import argparse
import importlib.util
import json
import math
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "https://data.regionreunion.com/api/explore/v2.1/catalog/datasets/lieux-remarquables-lareunion-tourinsoft"
PAGE = "https://data.regionreunion.com/explore/assets/lieux-remarquables-lareunion-tourinsoft/"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
last = {}

# The names read one by one on 03/11/2026 and kept, of the heritage: none named after a person (an artisan, a guide) nor
# whose text names one, which the repository never holds. A name outside it is not kept, and printed by the run only,
# to be read before it is added.
LUS = ROOT / "scripts/decouvrir-lus.txt"

STOP = {"de", "du", "des", "la", "le", "les", "et", "au", "aux", "en", "sur", "dite", "dit", "ou"}
# Words too common to tie a place to a monument by themselves.
GENERIC = {"maison", "villa", "domaine", "ancien", "ancienne", "musee", "jardin", "case", "eglise", "chapelle", "usine",
           "situee", "situe", "actuellement", "circuit", "creole", "reunion", "saint", "sainte"}


def opened(url):
    """One request a minute per host at most."""
    host = url.split("/")[2]
    wait = last.get(host, 0) + 62 - time.time()
    if wait > 0:
        time.sleep(wait)
    last[host] = time.time()
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120)


def words(s):
    """Its words, without accents, small ones nor a plural's s: « Lazarets » and « Lazaret » meet."""
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return {w.rstrip("s") for w in re.findall(r"[a-z0-9]+", s) if w not in STOP and len(w) > 2}


def km(a, b):
    return math.hypot((a["lon"] - b["lon"]) * 103.8, (a["lat"] - b["lat"]) * 111.2)


def named(n):
    """« Bambusaie (La) » as said: « La Bambusaie »; « Esprit Bleu (L’) »: « L’Esprit Bleu »."""
    m = re.fullmatch(r"(.*?)\s*\((Le|La|Les|L['’])\)\s*", n)
    if not m:
        return n.strip()
    art = m[2]
    return f"{art}{m[1]}" if art.startswith("L") and art[1:] in ("'", "’") else f"{art} {m[1]}"


def typo(s):
    """One line, a no-break space before « : ; ? ! » as on every page. A text of a dot alone is no text."""
    s = re.sub(r" ([:;?!])", " \\1", " ".join((s or "").split()))
    return "" if s in ("", ".") else s


def monument(r, monuments):
    """The reference of the historic monument this place is, or None."""
    if "Patrimoine culturel" not in (r["categories"] or []):
        return None
    w, g, best = words(re.sub(r"\s*\((?:Le|La|Les|L['’])\)\s*$", "", r["nom_du_lieu_remarquable"])), r["coordonnees_geographiques"], None
    for m in monuments:
        if str(r["code_insee_de_la_commune"]) not in m["insee"]:
            continue
        mw, d = words(m["nom"]), km(g, m) if g and "lon" in m else math.inf
        if (w and w <= mw) or (d < 0.15 and (w & mw) - {x.rstrip("s") for x in GENERIC}):
            if not best or d < best[1]:
                best = (m["ref"], d)
    return best and best[0]


def controles():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def verifier(out, bundled, du, unread, ecart):
    """The bundled places against the SIT's list of today, without writing: each by its name and commune, and what is
    kept of it. 1, the list has aged (scripts/verifier.py), when more than `ecart` were added, are gone or changed. The names not
    read are only counted: one may be a person's, and the job's log is public."""
    before = {(x["nom"], x["insee"]): x for x in bundled["lieux"]}
    now = {(x["nom"], x["insee"]): x for x in out}
    added, gone = sorted(now.keys() - before.keys()), sorted(before.keys() - now.keys())
    changed = sorted(k for k in now.keys() & before.keys() if now[k] != before[k])
    n = len(added) + len(gone) + len(changed)
    print(f"liste du {bundled['liste_du']} : {len(before)} lieux ; SIT du {du} : {len(now)}, {len(added)} nouveaux, "
          f"{len(gone)} disparus, {len(changed)} changés ; {unread} noms pas encore lus (scripts/decouvrir-lus.txt)")
    for label, keys in (("nouveau", added), ("disparu", gone), ("changé", changed)):
        for nom, insee in keys[:20]:
            print(f"  {label} : {nom} ({insee})")
    if n > ecart:
        return controles().vieillie("Lieux remarquables", "build-decouvrir.py", "la liste du SIT", date=du, ecart=n,
                                    consigne=f"Seuil {ecart}. Lancer scripts/build-decouvrir.py et proposer la PR.")
    return 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json", help="a local copy of the dataset's export, in JSON")
    p.add_argument("--du", help="the day the SIT rebuilt it, 2026-11-01")
    p.add_argument("--verifier", type=int, metavar="ECART", help="write nothing: compare with src/vie/decouvrir.json, fail past ECART places added, gone or changed")
    a = p.parse_args()
    if a.json:
        rows, du = json.loads(Path(a.json).read_text(encoding="utf-8")), a.du
    else:
        meta = json.load(opened(DATASET))["metas"]["default"]
        # Its day at La Réunion (UTC+4): the SIT rebuilds it on Sunday night.
        du = (datetime.fromisoformat(meta["data_processed"]) + timedelta(hours=4)).date().isoformat()
        rows = json.load(opened(f"{DATASET}/exports/json"))
    monuments = json.loads((ROOT / "src/vie/monuments.json").read_text(encoding="utf-8"))["monuments"]
    lus = set(LUS.read_text(encoding="utf-8").splitlines())
    lignes = len(rows)
    # The heritage only: a place of the « Terroir » alone is a professional's, not listed.
    rows = [r for r in rows if set(r["categories"] or []) - {"Terroir"}]
    out = []
    for r in rows:
        if r["nom_du_lieu_remarquable"] not in lus:
            continue
        ref = monument(r, monuments)
        out.append({
            "nom": named(r["nom_du_lieu_remarquable"]),
            "insee": str(r["code_insee_de_la_commune"]),
            "categories": r["categories"] or [],
            **({"texte": t} if (t := typo(r["descriptif"])) else {}),
            **({"monument": ref} if ref else {}),
        })
    out.sort(key=lambda x: (x["insee"], x["nom"]))
    dest = ROOT / "src/vie/decouvrir.json"
    if a.verifier is not None:
        sys.exit(verifier(out, json.loads(dest.read_text(encoding="utf-8")), du, len({r["nom_du_lieu_remarquable"] for r in rows} - lus), a.verifier))
    dest.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "liste_du": du,
        "lignes": lignes,
        "source": "Système d'Information Touristique (SIT) de l'île de La Réunion, Lieux remarquables (TourInSoft), Licence Ouverte",
        "page": PAGE,
        "lieux": out,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{lignes} lieux, {len(rows)} of the heritage, {len(out)} kept, {sum('monument' in x for x in out)} historic monuments -> {dest.relative_to(ROOT)}")
    # Printed here only, never written: a new name may be a person's.
    if nouveaux := sorted({r["nom_du_lieu_remarquable"] for r in rows} - lus):
        print(f"{len(nouveaux)} names not kept: read each, add to {LUS.relative_to(ROOT)} those that are no person's:", *nouveaux, sep="\n  ")

if __name__ == "__main__":
    main()
