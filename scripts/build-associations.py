#!/usr/bin/env python3
"""Build the SQL that fills the table `associations` (scripts/associations.sql) from the Répertoire national des associations.

Source: data.gouv.fr, « Répertoire National des Associations » (ministère de l'Intérieur, Licence Ouverte 2.0), the file
rna_waldec_<AAAAMMJJ>.zip, about monthly. Its link on data.gouv.fr leads to media.interieur.gouv.fr: a download link the
producer publishes under an open licence, used at a low rate (rule 3 bis of the project, the user's decision of 29/10).
Only the member rna_waldec_<date>_dpt_974.csv is read, by HTTP ranges, not the 410 MB of the zip: its directory at the
end (1 MB), then the member (about 5.7 MB), 10 seconds apart (the host's Crawl-delay), with an honest User-Agent.

Kept: the active associations (position A) whose seat is in one of the 24 communes, and of each only its number, title,
object, commune (INSEE code), date of creation, and site when it is an http(s) address of a valid form (never read).
NEVER the seat's address (often a home), the management address (adrg_*), the director's civility (dir_civilite), nor
the free « observation ».

Only what changed is written, never the whole table again: the rows in D1 are read (--d1, about 25 000 rows read, five
pages), and the SQL inserts the new associations, updates the changed ones (the columns that changed only) and deletes
those gone; the search index follows by the triggers of scripts/associations.sql. Rows written, measured on a local D1
with the real file of 1 October 2026 (24 877 associations) and the triggers: 99 514 for the first import (4 a row: the
row, its key, the index by commune, the search), then 4 an association added, 3 one whose title or object changed, 1 one
whose commune, date or site changed, 2 one deleted. Emptying and filling the table each month cost 99 512.

Two guards, as for the bus timetables (scripts/build-transit.py), read before anything is written:
- the rows written today (UTC) by the whole account, from Cloudflare's analytics: an import writes no more than what
  keeps the day under 80 % of D1_DAILY_WRITES. What does not fit waits for the next run: the first import goes in two,
  as the file's date (associations_import) is written only once every change is in;
- after a complete import (--deja a date), more than MAX_DIFF changes says a file that is not what it should be: nothing
  is written, and the run fails so that it is seen.

Usage:
  python3 -I scripts/build-associations.py --deja DATE --d1 rundata-transports --out dist/associations.sql
      the newest file on data.gouv.fr; nothing read nor written when its date is DATE, the one already imported
  python3 -I scripts/build-associations.py --csv FILE --fichier AAAA-MM-JJ [--actuel ROWS.json] --out FILE.sql
      a member already on disk, against the rows given (a JSON list), none by default
With GITHUB_OUTPUT set, says `nouveau=true` or `nouveau=false` and `fichier=<date>` there.
"""
import argparse
import csv
import io
import json
import os
import re
import struct
import subprocess
import sys
import time
import urllib.request
import zlib
from pathlib import Path
from datetime import datetime, timezone

DATASET = "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-associations/"
# The name that says who reads, the one of every script (scripts/user-agent.txt, as src/http.ts UA_RUNDATA).
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
# media.interieur.gouv.fr's robots.txt: « Crawl-delay: 10 ».
DELAY_S = 10
TAIL = 1_048_576
FILE = re.compile(r"^rna_waldec_(\d{4})(\d{2})(\d{2})\.zip$")
COMMUNES = {f"974{n:02d}" for n in range(1, 25)}
# An http(s) address of a valid form: a host with a dot, a port maybe, a path without spaces or quotes.
SITE = re.compile(r"^https?://[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}(?::\d{1,5})?(?:[/?#][^\s\"'<>]*)?$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Under this, the file looks cut: nothing written (25 020 active on 30/09/2026, 24 884 of them in the 24 communes).
MIN_ROWS = 20_000
# One INSERT stays well under D1's 100 KB a statement.
CHUNK_BYTES = 50_000
ROOT = Path(__file__).resolve().parent.parent
# Rows D1 lets the account write per day (UTC), and the part of it an import may take with what is already written
# (scripts/build-transit.py counts the same quota).
D1_DAILY_WRITES = 100_000
MARGE = 0.8
# Rows written by each change, measured with the triggers (above); a change of title or object costs its search too.
COUT = {"ajout": 4, "mots": 3, "autre": 1, "retrait": 2}
# The three dates of associations_import, written once every change is in.
COUT_DATES = 6
# After a complete import, more changes than this in one file: not a month of the répertoire (about a hundred
# associations created a month in 2026, from their dates of creation).
MAX_DIFF = 5_000
# The rows of D1 read by pages of this many, in the order of their number.
PAGE = 5_000
ID = re.compile(r"^W[0-9A-Z]{9}$")
CHAMPS = ("titre", "objet", "insee", "creee", "site")


def get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=120) as r:
        return r.read(), r.headers


def newest():
    """The newest rna_waldec zip listed on data.gouv.fr: (its date « AAAA-MM-JJ », its URL)."""
    data, _ = get(DATASET)
    found = []
    for res in json.loads(data)["resources"]:
        m = FILE.match(res.get("title") or "")
        if m:
            found.append((f"{m[1]}-{m[2]}-{m[3]}", res["url"]))
    if not found:
        raise SystemExit("no rna_waldec file listed on data.gouv.fr: nothing done")
    return max(found)


def member(url, part):
    """The bytes of the zip member whose name holds `part`, by two ranges: the zip's end, then the member."""
    tail, h = get(url, {"Range": f"bytes=-{TAIL}"})
    size = int(h["Content-Range"].split("/")[1])
    base = size - len(tail)
    i = tail.rfind(b"PK\x05\x06")
    cd_size, cd_off = struct.unpack("<II", tail[i + 12:i + 20])
    j = tail.rfind(b"PK\x06\x06")
    if j >= 0:
        cd_size, cd_off = struct.unpack("<QQ", tail[j + 40:j + 56])
    if cd_off < base:
        raise SystemExit("the zip's directory is larger than its end read: nothing done")
    cd = tail[cd_off - base:cd_off - base + cd_size]
    p, hit = 0, None
    while cd[p:p + 4] == b"PK\x01\x02":
        meth, = struct.unpack("<H", cd[p + 10:p + 12])
        csz, usz = struct.unpack("<II", cd[p + 20:p + 28])
        nl, el, cl = struct.unpack("<HHH", cd[p + 28:p + 34])
        off, = struct.unpack("<I", cd[p + 42:p + 46])
        name = cd[p + 46:p + 46 + nl].decode("utf-8", "replace")
        extra = cd[p + 46 + nl:p + 46 + nl + el]
        q = 0
        while q + 4 <= len(extra):
            hid, hl = struct.unpack("<HH", extra[q:q + 4])
            if hid == 1:
                vals = list(struct.unpack("<" + "Q" * (hl // 8), extra[q + 4:q + 4 + hl - hl % 8]))
                if usz == 0xFFFFFFFF:
                    usz = vals.pop(0)
                if csz == 0xFFFFFFFF:
                    csz = vals.pop(0)
                if off == 0xFFFFFFFF:
                    off = vals.pop(0)
            q += 4 + hl
        if part in name:
            hit = (name, meth, csz, usz, off)
        p += 46 + nl + el + cl
    if not hit:
        raise SystemExit(f"no member {part} in the zip: nothing done")
    name, meth, csz, usz, off = hit
    time.sleep(DELAY_S)
    data, _ = get(url, {"Range": f"bytes={off}-{off + 30 + 4096 + csz}"})
    nl, el = struct.unpack("<HH", data[26:30])
    raw = data[30 + nl + el:30 + nl + el + csz]
    out = zlib.decompress(raw, -15) if meth == 8 else raw
    if len(out) != usz:
        raise SystemExit(f"{name}: {len(out)} bytes read, {usz} announced: nothing done")
    print(f"{name}: {csz} bytes read, {usz} in clear")
    return out


def clean(s):
    return " ".join((s or "").split())


def site(s):
    s = (s or "").strip()
    return s if SITE.match(s) else None


def rows(text):
    """The kept rows, from the member's text (« ; », a header line), and the newest row's day (maj_time)."""
    out, maj = [], ""
    for x in csv.DictReader(io.StringIO(text), delimiter=";"):
        maj = max(maj, (x.get("maj_time") or "")[:10])
        if x.get("position") != "A" or x.get("adrs_codeinsee") not in COMMUNES:
            continue
        titre = clean(x.get("titre"))
        if not x.get("id") or not titre:
            continue
        d = (x.get("date_creat") or "").strip()
        out.append({
            "id": x["id"].strip(),
            "titre": titre,
            "objet": clean(x.get("objet")),
            "insee": x["adrs_codeinsee"],
            "creee": d if DATE.match(d) and not d.startswith("0001") else None,
            "site": site(x.get("siteweb")),
        })
    return out, maj


def lit(v):
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def wrangler(*args):
    out = subprocess.run(["npx", "wrangler", *args, "--json"], cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"wrangler {' '.join(args[:3])} a échoué : rien écrit\n{out.stderr or out.stdout}")
    return json.loads(out.stdout)


def actuelles(base):
    """The rows in D1, by their number: by pages, in the order of the primary key (rows read, never written)."""
    rows, apres = {}, ""
    while True:
        page = wrangler("d1", "execute", base, "--remote", "--command",
                        f"SELECT id, titre, objet, insee, creee, site FROM associations WHERE id > '{apres}' ORDER BY id LIMIT {PAGE}")[0]["results"]
        for x in page:
            rows[x["id"]] = x
        if len(page) < PAGE:
            return rows
        apres = page[-1]["id"]
        if not ID.match(apres):
            raise SystemExit(f"numéro inattendu dans D1 ({apres!r}) : rien écrit")


def ecrits_du_jour():
    """The rows written in D1 since midnight UTC by the whole account (the quota is the account's), from Cloudflare's
    analytics, as scripts/build-transit.py reads them. Unreadable: None, and the import waits for the next run without
    writing anything (a warning, not a failed run)."""
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not account:
        print("CLOUDFLARE_ACCOUNT_ID manquant", file=sys.stderr)
        return None
    try:
        return _ecrits(account, os.environ.get("CLOUDFLARE_API_TOKEN") or wrangler("auth", "token")["token"])
    except Exception as e:  # noqa: BLE001: whatever the cause, nothing is written
        print(f"écritures du jour illisibles : {type(e).__name__}: {e}", file=sys.stderr)
        return None


def _ecrits(account, token):
    query = """query($a: String!, $d: Date!) { viewer { accounts(filter: {accountTag: $a}) {
      d1AnalyticsAdaptiveGroups(limit: 100, filter: {date: $d}) { sum { rowsWritten } } } } }"""
    req = urllib.request.Request("https://api.cloudflare.com/client/v4/graphql",
                                 data=json.dumps({"query": query, "variables": {"a": account, "d": time.strftime("%Y-%m-%d", time.gmtime())}}).encode(),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.load(r)
    if res.get("errors") or not res.get("data"):
        raise ValueError(res.get("errors"))
    return sum(g["sum"]["rowsWritten"] for a in res["data"]["viewer"]["accounts"] for g in a["d1AnalyticsAdaptiveGroups"])


def difference(kept, avant):
    """What changed from the rows in D1: those to add, to change (with their changed columns), to delete."""
    ajouts, modifs = [], []
    for r in kept:
        old = avant.get(r["id"])
        if old is None:
            ajouts.append(r)
        else:
            champs = [c for c in CHAMPS if (old.get(c) or None) != (r[c] or None)]
            if champs:
                modifs.append((r, champs))
    ids = {r["id"] for r in kept}
    retraits = sorted(i for i in avant if i not in ids)
    return ajouts, modifs, retraits


def cout(op):
    kind, x = op
    if kind == "modif":
        return COUT["mots"] if {"titre", "objet"} & set(x[1]) else COUT["autre"]
    return COUT[kind]


def sql(ops, dates):
    """The statements of the changes taken, then, when they are all in, the file's dates last."""
    out = []
    retraits = [x for k, x in ops if k == "retrait"]
    for i in range(0, len(retraits), 500):
        out.append(f"DELETE FROM associations WHERE id IN ({', '.join(lit(x) for x in retraits[i:i + 500])});")
    for k, (r, champs) in ((k, x) for k, x in ops if k == "modif"):
        out.append(f"UPDATE associations SET {', '.join(f'{c} = {lit(r[c])}' for c in champs)} WHERE id = {lit(r['id'])};")
    head = "INSERT INTO associations (id, titre, objet, insee, creee, site) VALUES\n"
    chunk, size = [], 0
    for r in (x for k, x in ops if k == "ajout"):
        v = f"({lit(r['id'])}, {lit(r['titre'])}, {lit(r['objet'])}, {lit(r['insee'])}, {lit(r['creee'])}, {lit(r['site'])})"
        if chunk and size + len(v.encode()) > CHUNK_BYTES:
            out.append(head + ",\n".join(chunk) + ";")
            chunk, size = [], 0
        chunk.append(v)
        size += len(v.encode()) + 2
    if chunk:
        out.append(head + ",\n".join(chunk) + ";")
    for k, v in dates or ():
        out.append(f"INSERT INTO associations_import (cle, valeur) VALUES ({lit(k)}, {lit(v)}) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur;")
    return "\n".join(out) + "\n"


def output(**kv):
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--deja", help="the date of the file already imported (associations_import), « » for none")
    ap.add_argument("--csv", help="the member rna_waldec_<date>_dpt_974.csv already on disk")
    ap.add_argument("--fichier", help="with --csv: the file's date, AAAA-MM-JJ")
    ap.add_argument("--d1", help="the D1 database whose rows are compared, and the account's writes of the day read")
    ap.add_argument("--actuel", help="without --d1: the rows already in, a JSON list (none by default)")
    ap.add_argument("--ecrits", type=int, help="without --d1: the rows already written today (no limit by default)")
    ap.add_argument("--min", type=int, default=MIN_ROWS, help=argparse.SUPPRESS)
    ap.add_argument("--max-diff", type=int, default=MAX_DIFF, help=argparse.SUPPRESS)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.csv:
        if not a.fichier or not DATE.match(a.fichier):
            raise SystemExit("--csv needs --fichier AAAA-MM-JJ")
        fichier, text = a.fichier, open(a.csv, encoding="utf-8-sig").read()
    else:
        fichier, url = newest()
        if a.deja is not None and a.deja.strip() == fichier:
            print(f"fichier du {fichier} déjà importé : rien lu, rien écrit")
            output(nouveau="false", fichier=fichier)
            return
        time.sleep(DELAY_S)
        text = member(url, "_dpt_974.csv").decode("utf-8-sig")
    kept, maj = rows(text)
    if not DATE.match(maj):
        maj = fichier
    if len(kept) < a.min:
        raise SystemExit(f"only {len(kept)} associations: the file looks cut, nothing written")
    if a.d1:
        avant = actuelles(a.d1)
    else:
        avant = {r["id"]: r for r in json.load(open(a.actuel, encoding="utf-8"))} if a.actuel else {}
    ajouts, modifs, retraits = difference(kept, avant)
    n = len(ajouts) + len(modifs) + len(retraits)
    print(f"{len(kept)} associations du fichier du {fichier} ({sum(1 for r in kept if r['site'])} avec un site), {len(avant)} en base : "
          f"{len(ajouts)} à ajouter, {len(modifs)} à modifier, {len(retraits)} à retirer")
    if a.deja and n > a.max_diff:
        raise SystemExit(f"{n} changements depuis le fichier du {a.deja}, plus de {a.max_diff} : fichier anormal, rien écrit")
    # Deletions first, then changes, then additions: a run cut by the quota leaves no association twice.
    ops = [("retrait", x) for x in retraits] + [("modif", x) for x in modifs] + [("ajout", x) for x in ajouts]
    total = sum(cout(o) for o in ops) + COUT_DATES
    if a.d1 or a.ecrits is not None:
        deja_ecrits = ecrits_du_jour() if a.d1 else a.ecrits
        if deja_ecrits is None:
            print("::warning::import des associations remis au prochain passage : les écritures D1 du jour ne se lisent pas, rien écrit")
            output(nouveau="false", fichier=fichier)
            return
        budget = int(D1_DAILY_WRITES * MARGE) - deja_ecrits
        print(f"D1 : {deja_ecrits} lignes écrites aujourd'hui (UTC) par tout le compte ; cet import en écrirait {total}, "
              f"{max(budget, 0)} permises (80 % de {D1_DAILY_WRITES})")
    else:
        budget = total
    pris, used = [], 0
    for o in ops:
        if used + cout(o) + COUT_DATES > budget:
            break
        pris.append(o)
        used += cout(o)
    complet = len(pris) == len(ops) and used + COUT_DATES <= budget
    if not pris and not complet:
        print(f"::warning::import des associations remis au prochain passage : la marge d'écritures D1 du jour est prise ({budget} permises)")
        output(nouveau="false", fichier=fichier)
        return
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dates = (("maj", maj), ("importe_le", now), ("fichier", fichier)) if complet else None
    open(a.out, "w", encoding="utf-8").write(sql(pris, dates))
    if complet:
        print(f"{len(pris)} changements, {used + COUT_DATES} lignes écrites environ, import complet : {a.out}")
    else:
        print(f"::warning::{len(pris)} changements sur {len(ops)}, {used} lignes écrites environ : la suite au prochain passage, "
              f"la date du fichier n'est pas écrite d'ici là : {a.out}")
    output(nouveau="true", fichier=fichier)


if __name__ == "__main__":
    sys.exit(main())
