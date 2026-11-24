#!/usr/bin/env python3
"""Build src/vie/collecte-cirest.json: the days the bins are collected, street by street, in the East (CIREST).

The CIREST publishes no open data for it: its page « Collecte des déchets » (https://www.cirest.fr/collecte-des-dechets/)
answers a street typed in its form with the street's zone, and each zone has a PDF calendar of the year. The site of an
intercommunality is read like a commune's (public data, read slowly, its source said with its link; withdrawn on
request): one request a minute, under the reader's name (user-agent.txt).

1. The streets and their zone: the form's free text (POST road=<vowel>) lists every street holding it, with its zone,
   for all the communes: five vowels give them all (24/11/2026: 1,515 streets, 45 zones). Sainte-Rose's streets are
   known to the form but given no zone nor calendar: none is kept for them.
2. Each zone's PDF (two templates, six months a page, a row per day): a coloured square right of the weekday's letter
   for each collection, grey for the household waste (OM), yellow for the sorted waste (CS), green for the garden
   waste (DV), red for the bulky waste (EN). No text says it: the page is drawn (pdftoppm) and the colour read under
   each day's row (pdftotext -bbox gives the rows). A square is a block of one colour 10 pixels wide at least (the grey
   letters of a holiday's name are thinner). A day's letter that is not its weekday, or a month without all its days,
   stops the script rather than write a calendar it could not read. The dark blue of the electric appliances (picked up
   at a point, not collected at the door) is also the bar of a holiday in one template: left out.
3. The holidays (F) are the year's public holidays at La Réunion, as the calendars mark them.

Usage: python3 -I scripts/build-collecte-cirest.py [--cache DIR]
  DIR: answers already read (rep-<vowel>.html, pdf/<commune>-<ZONE>.pdf), kept there when read; poppler-utils needed.
"""
import argparse
import html
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/collecte-cirest.json"
PAGE = "https://www.cirest.fr/collecte-des-dechets/"
PDF = "https://www.cirest.fr/wp-content/themes/econature-child/calendriers_collecte/{folder}/{zone}.pdf"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
CADENCE = 62
# The site's folder of each commune, and its prefix of zones (« SA » is Saint-André's, « SAL » Salazie's: longest first).
COMMUNES = {"saintandre": "Saint-André", "saintbenoit": "Saint-Benoît", "braspanon": "Bras-Panon", "palmistes": "La Plaine-des-Palmistes", "salazie": "Salazie"}
PREFIXES = [("SAL", "salazie"), ("SA", "saintandre"), ("SB", "saintbenoit"), ("BP", "braspanon"), ("PP", "palmistes")]
MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
WEEKDAYS = "LMMJVSD"
DPI = 150
RUN = 10
# Latin-9's « Œ » and « œ » where Latin-1 has « ¼ » and « ½ » (see street_name).
LATIN9 = str.maketrans({"\u00bc": "\u0152", "\u00bd": "\u0153"})
SMALL = {"de", "des", "du", "la", "le", "les", "et", "au", "aux", "sur", "en"}
_last = [0.0]


def get(url, data=None):
    """One request, CADENCE seconds after the one before."""
    time.sleep(max(0.0, _last[0] + CADENCE - time.time()))
    _last[0] = time.time()
    req = urllib.request.Request(url, data=data, headers={**UA, **({"Content-Type": "application/x-www-form-urlencoded"} if data else {})})
    return urllib.request.urlopen(req, timeout=180).read()


def kind(r, g, b):
    """The collection of a colour of the legend, or None (background, text, the bars of Sundays and holidays)."""
    if abs(r - g) < 14 and abs(g - b) < 14 and 95 <= r <= 150:
        return "OM"
    if r > 220 and g > 200 and b < 90:
        return "CS"
    if g > 120 and r < 120 and b < 110 and g - r > 50:
        return "DV"
    if r > 170 and g < 80 and b < 80:
        return "EN"
    return None


def page_days(pdf, n, year):
    """{date: {kind}} of one page of a calendar."""
    xml = subprocess.run(["pdftotext", "-f", str(n), "-l", str(n), "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    w = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
         re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', xml)]
    ppm = subprocess.run(["pdftoppm", "-f", str(n), "-l", str(n), "-r", str(DPI), str(pdf)], check=True, capture_output=True).stdout
    head = ppm.split(b"\n", 3)
    width = int(head[1].split()[0])
    px = head[3]
    k = DPI / 72
    months = [m for _, m in sorted(((t[0] + t[2]) / 2, MOIS.index(t[4].capitalize()) + 1) for t in w if t[4].capitalize() in MOIS)]
    letter = lambda a: next((b for b in w if len(b[4]) == 1 and b[4] in WEEKDAYS and abs(b[1] - a[1]) < 2 and 0 < b[0] - a[2] < 25), None)
    rows = [(a, letter(a)) for a in w if re.fullmatch(r"\d{1,2}", a[4])]
    rows = [(a, b) for a, b in rows if b]
    # The columns from the day numbers themselves (a title is not centred on its column).
    lefts = []
    for x0 in sorted(a[0] for a, _ in rows):
        if not lefts or x0 - lefts[-1] > 30:
            lefts.append(x0)
    if len(lefts) != 6 or len(months) != 6:
        raise ValueError(f"{pdf.name} page {n} : {len(lefts)} colonnes de jours, {len(months)} mois")
    step = (lefts[-1] - lefts[0]) / 5
    edges = lefts + [lefts[-1] + step]
    out = {}
    for a, b in rows:
        col = max(i for i, x0 in enumerate(lefts) if x0 - 3 <= a[0])
        when = date(year, months[col], int(a[4]))
        if b[4] != WEEKDAYS[when.weekday()]:
            raise ValueError(f"{pdf.name} : {when} lu « {b[4]} »")
        seen = Counter()
        # Right of the letter, short of the week's number at the column's right.
        for dy in (-1.5, 0, 1.5):
            y = int(((a[1] + a[3]) / 2 + dy) * k)
            run, prev = 0, None
            for x in range(int((b[2] + 3) * k), int((edges[col + 1] - 0.14 * step) * k)):
                i = (y * width + x) * 3
                c = kind(px[i], px[i + 1], px[i + 2])
                run = run + 1 if c and c == prev else (1 if c else 0)
                prev = c
                if c:
                    seen[c] = max(seen[c], run)
        out[when] = {c for c, r in seen.items() if r >= RUN}
    for m in months:
        n_days = (date(year + (m == 12), m % 12 + 1, 1) - date(year, m, 1)).days
        if sorted(d.day for d in out if d.month == m) != list(range(1, n_days + 1)):
            raise ValueError(f"{pdf.name} : mois {m} incomplet")
    return out


def calendar(pdf, year):
    days = {**page_days(pdf, 1, year), **page_days(pdf, 2, year)}
    if len(days) != (date(year + 1, 1, 1) - date(year, 1, 1)).days:
        raise ValueError(f"{pdf.name} : {len(days)} jours lus")
    res = {}
    for d, kinds in days.items():
        for c in kinds:
            res.setdefault(c, []).append(d.timetuple().tm_yday)
    return {c: sorted(v) for c, v in sorted(res.items())}


def holidays(year):
    """The public holidays at La Réunion, as day numbers of the year (Easter by the Anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = divmod(b, 4)
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, kk = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - kk) % 7
    m = (a + 11 * h + 22 * l) // 451
    easter = date(year, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)
    days = [date(year, 1, 1), easter + timedelta(1), date(year, 5, 1), date(year, 5, 8), easter + timedelta(39), easter + timedelta(50),
            date(year, 7, 14), date(year, 8, 15), date(year, 11, 1), date(year, 11, 11), date(year, 12, 20), date(year, 12, 25)]
    return sorted(x.timetuple().tm_yday for x in days)


def street_name(s):
    """« ALLÉE BOIS NOIRS » → « Allée Bois Noirs », the small words in lower case but the first.

    A few names hold their « Œ » in Latin-9 (ISO-8859-15), which the page's UTF-8 shows as « ¼ » (24/11/2026:
    « CHEMIN ¼ILLETS », « C¼UR DE VILLE »): put back, so that the name is right and « œillets » finds it."""
    words = re.sub(r"\s+", " ", s.translate(LATIN9)).strip().lower().split(" ")
    return " ".join(w if i and w in SMALL else "-".join(p[:1].upper() + p[1:] for p in w.split("-")) for i, w in enumerate(words)).replace("D'", "d'").replace("L'", "l'")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path)
    args = ap.parse_args()
    cache = args.cache
    if cache:
        (cache / "pdf").mkdir(parents=True, exist_ok=True)
    streets = {}
    for v in "eaiouy":
        local = cache / f"rep-{v}.html" if cache else None
        if local and local.exists():
            body = local.read_bytes()
        else:
            body = get(PAGE, urllib.parse.urlencode({"commune": "saintandre", "rue": "", "road": v, "searchZone": "Rechercher"}).encode())
            if local:
                local.write_bytes(body)
        for folder, zone, name in re.findall(r'commune=([a-z]+)&#038;zone=([A-Z0-9]+)"><b>([^<]+)</b>', body.decode("utf-8", "replace")):
            # The zone's own commune, by its prefix: one street of Saint-André's zone SA11 is listed under Salazie (24/11/2026).
            folder = next(f for p, f in PREFIXES if zone.startswith(p))
            streets[(street_name(html.unescape(name)), COMMUNES[folder])] = (folder, zone)
    zones = sorted(set(streets.values()))
    files = {}
    for folder, zone in zones:
        local = cache / "pdf" / f"{folder}-{zone}.pdf" if cache else None
        url = PDF.format(folder=folder, zone=zone)
        if not (local and local.exists()):
            body = get(url)
            local = local or Path("/tmp") / f"cirest-{folder}-{zone}.pdf"
            local.write_bytes(body)
        files[(folder, zone)] = (url, local)
    # The year in the text of the calendars that have it (one template draws its title): the most common, or none.
    years = Counter(int(y) for _, f in files.values() for y in re.findall(r"\b(20\d\d)\b", subprocess.run(["pdftotext", "-l", "1", str(f), "-"], check=True, capture_output=True, text=True).stdout)[:1])
    if not years:
        raise ValueError("aucune année lue dans les calendriers")
    year = years.most_common(1)[0][0]
    calendars = [{"code": zone, "pdf": files[(folder, zone)][0], **calendar(files[(folder, zone)][1], year), "F": holidays(year)} for folder, zone in zones]
    index = {(f, z): i for i, (f, z) in enumerate(zones)}
    voies = sorted([name, commune, index[fz]] for (name, commune), fz in streets.items())
    out = {
        "source": PAGE,
        "mis_a_jour": date.today().isoformat(),
        "annee": year,
        "calendriers": calendars,
        "voies": voies,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)} : {len(calendars)} calendriers, {len(voies)} voies, {year}", file=sys.stderr)


if __name__ == "__main__":
    main()
