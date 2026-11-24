#!/usr/bin/env python3
"""Build the SQL of the sea's history in the D1 database `rundata-climat` (tables of scripts/mer.sql).

Two sources, day by day:
- Candhis (Cerema, Licence Ouverte 2.0), the wave buoys of La Réunion: for each day, the mean and the highest
  significant height (H1/3, else Hm0), the highest wave (Hmax) and the mean period (TH1/3, else T02) of the day's
  measurements (every 30 minutes now, every 3 hours in the first years), and their number. A day is that of
  La Réunion (UTC+4). Values out of range (the buoy's « no value » codes, 999.9999) are left out.
- NOAA Coral Reef Watch CoralTemp (dhw_5km on PacIOOS's ERDDAP, public domain): the sea's surface temperature
  (CRW_SST) and its gap to NOAA's reference (CRW_SSTANOMALY) in the cell nearest each of the four beaches of /mer
  (src/providers/crw-serie.ts POINTS). From 1 January 2003 only: the license ERDDAP serves with dhw_5km keeps the
  OSTIA years, 1985 to 2002, for pure academic research (« no commercial or other application »), giving the years,
  not the day; the whole of 2002 is left out.

Table mer_jour: one row per source, point and year, `data` = JSON {field: [value of each day of the year, or null]},
the index being the day of the year minus one, trailing nulls dropped (as `jours`). Table mer_points: one row per
buoy or beach, with its first and last year and whom to credit.

Usage:
  python3 -I scripts/build-mer.py --brut <folder> --out dist/mer.sql
      every year, from the raw answers of a slow fill (candhis-<campaign>-<year>.json from getCampTD, one calendar
      year of a campaign each; crw-<beach>-<year>.csv from ERDDAP), once;
  python3 -I scripts/build-mer.py --recent --avant avant.json --out mer-jour.sql
      the current year (and the year before in the first week of January), what .github/workflows/mer.yml imports
      every morning: the four beaches from ERDDAP (four requests), and the buoy that publishes now (getCampTR, its
      key in CANDHIS_API_KEY, skipped without it). `--avant`: the rows of those years as D1 has them (wrangler d1
      execute --json), merged day by day, a day the new reading lacks kept as it was. A row that has not changed is
      not written: D1 counts every row written.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
RE = dt.timezone(dt.timedelta(hours=4))
SCHEMA = (Path(__file__).parent / "mer.sql").read_text(encoding="utf-8")

CANDHIS = "https://candhis.cerema.fr/API/v1/"
# The campaigns, their place (src/providers/candhis.ts BOUEES) and whom to credit: Candhis's terms of use
# (https://candhis.cerema.fr/doc/01_Utilisation.fr.pdf, V1 of 27/05/2025) ask for « Candhis », the date of the last
# update of the data taken, and ideally each campaign's partners, as « Ville de Saint-Pierre et Cerema - Données
# originales téléchargées sur https://candhis.cerema.fr/, mise à jour du … ».
BOUEES = {
    "97401": ("Baie de la Possession", -20.91018, 55.34598, "Ville de Saint-Denis et Cerema"),
    "97402": ("Pointe du Phare", -20.921, 55.28683, "DEAL 974 et Cerema"),
    "97403": ("Rivière des Galets", -20.94572, 55.27732, "Grand Port Maritime de la Réunion"),
    "97404": ("Pointe du Gouffre", -20.87615, 55.3903, "Ville de Saint-Denis et Cerema"),
    "97405": ("Saint-Pierre", -21.35283, 55.47767, "Ville de Saint-Pierre et Cerema"),
    "97406": ("Sainte-Rose", -21.12133, 55.78417, "DEAL 974 et Cerema"),
    "97407": ("Vincendo", -21.381, 55.681, "Ville de Saint-Joseph et Cerema"),
    "97408": ("Port Réunion Est", -20.92452, 55.3242, "Grand Port Maritime de la Réunion"),
    "97410": ("Saint-Pierre (large)", -21.365, 55.46525, "Météo-France et Cerema"),
}
# The buoy that publishes now, read every morning for the current year.
EN_SERVICE = ["97410"]

ERDDAP = "https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.csv"
CRW_DEBUT = dt.date(2003, 1, 1)
PLAGES = {
    "saint-gilles": ("Saint-Gilles", -21.075, 55.225),
    "saint-pierre": ("Saint-Pierre", -21.325, 55.475),
    "saint-denis": ("Saint-Denis", -20.875, 55.425),
    "sainte-rose": ("Sainte-Rose", -21.125, 55.775),
}
CHAMPS = {"candhis": ["hs_moy", "hs_max", "hmax", "per_moy", "n"], "crw": ["sst", "ecart"]}
CREDIT_CRW = "NOAA Coral Reef Watch, CoralTemp (domaine public)"


def num(s):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return None if v != v or abs(v - 999.9999) < 1e-6 else v


def jours_candhis(r):
    """{local day: {field: value}} from a getCampTD or getCampTR answer (their headers differ)."""
    head = [str(h).strip() for h in r.get("entete") or []]

    def col(*names):
        return next((head.index(n) for n in names if n in head), -1)

    it = col("DateHeure", "Date")
    ih, ihx, iper = col("H13D", "H1/3 (m)", "HM0", "Hm0 (m)"), col("HMAXD", "Hmax (m)"), col("TH13D", "TH1/3 (s)", "T02", "T02 (s)")
    per = {}
    for row in r.get("results") or []:
        try:
            t = dt.datetime.strptime(str(row[it]).strip()[:16].replace("T", " "), "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc)
        except (ValueError, IndexError):
            continue
        x = per.setdefault(t.astimezone(RE).date(), {"h": [], "hx": [], "p": []})
        for k, i in (("h", ih), ("hx", ihx), ("p", iper)):
            v = num(row[i]) if 0 <= i < len(row) else None
            if v is not None and 0 < v < (30 if k == "p" else 40):
                x[k].append(v)
    return {
        d: {
            "hs_moy": round(sum(x["h"]) / len(x["h"]), 2), "hs_max": max(x["h"]),
            "hmax": max(x["hx"]) if x["hx"] else None,
            "per_moy": round(sum(x["p"]) / len(x["p"]), 1) if x["p"] else None, "n": len(x["h"]),
        }
        for d, x in per.items() if x["h"]
    }


def jours_crw(text):
    lines = text.strip().split("\n")
    head = lines[0].split(",")
    it, isst, iano = head.index("time"), head.index("CRW_SST"), head.index("CRW_SSTANOMALY")
    out = {}
    for line in lines[2:]:
        f = line.split(",")
        d = dt.date.fromisoformat(f[it][:10])
        sst, ano = num(f[isst]), num(f[iano])
        if d >= CRW_DEBUT and sst is not None:
            out[d] = {"sst": round(sst, 2), "ecart": None if ano is None else round(ano, 2)}
    return out


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def annee(days, champs, an, avant=None):
    """The JSON of one year: `days` over `avant` (that year's data as D1 has it), day by day."""
    n = (dt.date(an, 12, 31) - dt.date(an, 1, 1)).days + 1
    data = {}
    for c in champs:
        old = (avant or {}).get(c) or []
        vs = []
        for i in range(n):
            v = days.get(dt.date(an, 1, 1) + dt.timedelta(days=i), {}).get(c)
            vs.append(v if v is not None else (old[i] if i < len(old) else None))
        while vs and vs[-1] is None:
            vs.pop()
        if any(v is not None for v in vs):
            data[c] = vs
    return data


def statements(groups, avant=None, credit_lu=None):
    """INSERTs of mer_points and mer_jour for {(source, point): {day: {field: value}}}."""
    points, rows = [], []
    for (src, point), days in sorted(groups.items()):
        if not days:
            continue
        ans = sorted({d.year for d in days})
        if src == "candhis":
            nom, lat, lon, partenaire = BOUEES[point]
            credit = f"Candhis, campagne {point} : {partenaire}, données originales téléchargées sur https://candhis.cerema.fr/, mise à jour du {credit_lu}"
        else:
            nom, lat, lon = PLAGES[point]
            credit = CREDIT_CRW
        points.append(
            f"INSERT INTO mer_points VALUES ({q(src)}, {q(point)}, {q(nom)}, {lat}, {lon}, {ans[0]}, {ans[-1]}, {q(','.join(CHAMPS[src]))}, {q(credit)}) "
            "ON CONFLICT (source, point) DO UPDATE SET nom = excluded.nom, lat = excluded.lat, lon = excluded.lon, debut = min(debut, excluded.debut), "
            "fin = max(fin, excluded.fin), params = excluded.params, credit = excluded.credit "
            "WHERE (nom, lat, lon, params, credit) IS NOT (excluded.nom, excluded.lat, excluded.lon, excluded.params, excluded.credit) OR excluded.debut < debut OR excluded.fin > fin;")
        for an in ans:
            data = annee(days, CHAMPS[src], an, (avant or {}).get((src, point, an)))
            if data:
                rows.append(f"INSERT INTO mer_jour VALUES ({q(src)}, {q(point)}, {an}, {q(json.dumps(data, separators=(',', ':')))}) "
                            "ON CONFLICT (source, point, annee) DO UPDATE SET data = excluded.data WHERE data IS NOT excluded.data;")
    return points, rows


def depuis_brut(folder):
    groups = {}
    for f in sorted(Path(folder).glob("*")):
        src, *rest = f.stem.split("-")
        point = "-".join(rest[:-1])
        if src == "candhis":
            days = jours_candhis(json.loads(f.read_text(encoding="utf-8")))
        elif src == "crw":
            days = jours_crw(f.read_text(encoding="utf-8"))
        else:
            continue
        groups.setdefault((src, point), {}).update(days)
    return groups


def lire(url, headers=None, timeout=300):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def recentes(today):
    """The current year (and the year before in the first week of January), from the sources."""
    debut = dt.date(today.year - 1, 1, 1) if today.timetuple().tm_yday <= 7 else dt.date(today.year, 1, 1)
    groups = {}
    for p, (_, lat, lon) in PLAGES.items():
        # ERDDAP has the day before yesterday at the latest by the morning.
        fin = today - dt.timedelta(days=1)
        sel = f"%5B({debut}T12:00:00Z):({fin}T12:00:00Z)%5D%5B({lat}):({lat})%5D%5B({lon}):({lon})%5D"
        try:
            groups[("crw", p)] = jours_crw(lire(f"{ERDDAP}?CRW_SST{sel},CRW_SSTANOMALY{sel}").decode("utf-8"))
        except urllib.error.HTTPError as err:
            # ERDDAP answers 404 when the last day asked is not there yet: one day earlier.
            fin -= dt.timedelta(days=1)
            sel = f"%5B({debut}T12:00:00Z):({fin}T12:00:00Z)%5D%5B({lat}):({lat})%5D%5B({lon}):({lon})%5D"
            print(f"crw {p} : HTTP {err.code}, jusqu'au {fin}", file=sys.stderr)
            groups[("crw", p)] = jours_crw(lire(f"{ERDDAP}?CRW_SST{sel},CRW_SSTANOMALY{sel}").decode("utf-8"))
    key = os.environ.get("CANDHIS_API_KEY", "").strip()
    if not key:
        print("candhis : pas de clé CANDHIS_API_KEY, bouées non lues", file=sys.stderr)
    for code in EN_SERVICE if key else []:
        try:
            r = json.loads(lire(f"{CANDHIS}getCampTR.php?camp={code}&dateDeb={debut}&dateFin={today + dt.timedelta(days=1)}", {"Authorization": key}))
            days = {d: v for d, v in jours_candhis(r).items() if d < today}
            groups[("candhis", code)] = days
        except (urllib.error.URLError, ValueError) as err:
            # A refusal (429, 423) or a failure: the buoy's rows stay as they are, the satellite goes on.
            print(f"candhis {code} : {type(err).__name__} {str(err)[:200]}", file=sys.stderr)
    return groups


def lire_avant(path):
    """The rows of `wrangler d1 execute --json` (a list of results, each with its `results` rows)."""
    if not path or not Path(path).exists():
        return {}
    out = {}
    for res in json.loads(Path(path).read_text(encoding="utf-8")):
        for r in res.get("results") or []:
            out[(r["source"], r["point"], int(r["annee"]))] = json.loads(r["data"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brut", help="folder of the raw answers (every year, once)")
    ap.add_argument("--recent", action="store_true", help="the current year, from the sources")
    ap.add_argument("--avant", help="with --recent: those years' rows as D1 has them (wrangler d1 execute --json)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    today = dt.datetime.now(RE).date()
    if a.brut:
        points, rows = statements(depuis_brut(a.brut), credit_lu=today.strftime("%d/%m/%Y"))
        sql = SCHEMA + "\n".join(points + rows) + "\n"
    elif a.recent:
        avant = lire_avant(a.avant)
        points, rows = statements(recentes(today), avant, credit_lu=today.strftime("%d/%m/%Y"))
        # The schema too: the job's first run may come before the import.
        sql = SCHEMA + "\n".join(points + rows) + "\n"
    else:
        raise SystemExit("--brut ou --recent")
    Path(a.out).write_text(sql, encoding="utf-8")
    print(f"{len(points)} points, {len(rows)} années, {len(sql) // 1024} Ko dans {a.out}")


if __name__ == "__main__":
    main()
