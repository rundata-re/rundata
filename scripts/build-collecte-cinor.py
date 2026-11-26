#!/usr/bin/env python3
"""Build src/vie/collecte-cinor.json: the days the bins are collected, street by street, in the North (CINOR: Saint-Denis,
Sainte-Marie, Sainte-Suzanne).

The CINOR publishes no open data for it: its page « Calendrier de collecte » (https://www.cinor.re/calendrier-de-collecte/)
asks its API for the streets holding a word, each with its zone, and each zone has a PDF calendar of the year. The site
of an intercommunality is read like a commune's (public data, read slowly, its source said with its link; withdrawn on
request): one request a minute, under the reader's name (user-agent.txt).

1. The streets and their zone: the API (/wp-json/cinor_crom/v1/street/<word>) answers the first five streets holding a
   word, « % » for any letters. The words are those of the three communes' streets in the Base adresse nationale
   (adresse.data.gouv.fr, Licence Ouverte, one file): for each street its longest distinctive word, then, for a word that
   gave five answers (the list may be cut), each street holding it, its words joined by « % ». 26/11/2026: 2,135
   streets, 67 zones; one street has no zone (« ref_calendrier » empty): kept out.
2. Each zone's PDF (two templates, a page of twelve months, a cell a day): the colour of the cell, grey for the
   household waste (OM), brown for the biowaste (BIO, Saint-Denis: always with the grey, a cell of two colours), yellow
   for the sorted waste (CS), green for the garden waste (DV), blue for the bulky waste (EN); a cell of several
   collections is cut in bands. The day numbers are drawn, not text: each day's cell is placed from its month's weekday
   headers (« Lun » … « Dim », text, pdftotext -bbox) and the year's calendar, and a line of pixels read across its top,
   above the number. A colour counts on RUN pixels in a row at least (a number's red edge, an arrow, are thinner).
   A month without its seven headers, or a calendar with too few collections, stops the script rather than write one it
   could not read. Sundays are left out (never a collection: their red numbers read as pink), and the pink of a holiday.
3. The street names: the BAN's, when a street of the CINOR is one of its streets but for case, accents and small words
   (the API writes the same street « Résidences Camelias » in a zone and « Camélias » in another); else the API's, all in
   the same case. Either way a word written with no accent gets the one the island's street names give it (the BAN of all
   La Réunion, a street counted once: its accented spelling of two streets at least and two thirds of the accented ones),
   but a surname written both ways at La Réunion (KEEP).
4. The holidays (F) are the year's public holidays at La Réunion, as the calendars mark them.

Usage: python3 -I scripts/build-collecte-cinor.py [--cache DIR]
  DIR: what was already read (adresses-974.csv.gz, api.json, pdf/<ZONE>.pdf), kept there as it is read: the first run
  makes about 2,300 requests, a day and a half at one a minute; poppler-utils needed.
"""
import argparse
import csv
import gzip
import html
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/collecte-cinor.json"
PAGE = "https://www.cinor.re/calendrier-de-collecte/"
API = "https://www.cinor.re/wp-json/cinor_crom/v1/street/"
PDF = "https://www.cinor.re/wp-content/uploads/calendriers/{year}/{zone}.pdf"
BAN = "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-974.csv.gz"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
CADENCE = 62
INSEE = {"97411": "Saint-Denis", "97418": "Sainte-Marie", "97420": "Sainte-Suzanne"}
COMMUNES = {"SAINT-DENIS": "Saint-Denis", "SAINTE-MARIE": "Sainte-Marie", "SAINTE-SUZANNE": "Sainte-Suzanne"}
TYPES = {"RUE", "CHEMIN", "ALLEE", "IMPASSE", "AVENUE", "BOULEVARD", "ROUTE", "RUELLE", "SENTIER", "LOTISSEMENT", "RESIDENCE",
         "PLACE", "SQUARE", "CITE", "VOIE", "PASSAGE", "QUAI", "COURS", "RAMPE", "VENELLE", "LOT", "DOMAINE", "HAMEAU"}
EMPTY = {"DES", "DE", "DU", "LA", "LE", "LES", "D", "L", "ET", "AU", "AUX", "SAINT", "SAINTE"}
# Surnames written both ways at La Réunion, never given an accent the BAN does not write for that street: the list, and
# how many streets write each way, in collecte-noms-deux-graphies.json beside this script.
KEEP = set(json.loads((Path(__file__).parent / "collecte-noms-deux-graphies.json").read_text())["sans_accent"])
# A word kept in capitals: a Roman number (« Jean XXIII », « Henri II ») or a road's number (« N3 », « D37 »).
CAPS = re.compile(r"^(?=[IVXLC]{2})M{0,3}(CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$|^[A-Z]{1,3}[0-9]+[A-Z]?$")
MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
DPI = 150
K = DPI / 72
# The cells, in points from the weekday header's centre: the first row's centre, the rows' step, the line read above it.
FIRST, STEP, ABOVE, HALF = 15.2, 13.3, 5.2, 9.6
RUN = 6
# The colours of the legends, read in the PDFs (26/11/2026); two greys for the household waste, one per template.
COLOURS = [("OM", (188, 187, 187)), ("OM", (158, 156, 157)), ("BIO", (194, 158, 116)), ("CS", (251, 200, 10)),
           ("EN", (35, 178, 235)), ("DV", (39, 167, 55)), (None, (250, 205, 205)), (None, (254, 254, 253))]
# The quarters, as they are said after a street of several zones (« Boulevard Doret, quartier Camélias »): the CINOR's API
# writes them in capitals without accents. Their French spelling, from src/places/gazetteer.json (OpenStreetMap, IGN)
# where it has the place (Sainte-Clotilde, Bois de Nèfles, La Réserve, Les Cafés, Ravine des Chèvres, Saint-François,
# Bel-Air, La Bretagne, La Montagne, Moufia), else the town's usual one. « CV - » (Sainte-Marie) is its centre's part:
# only the part is said. A quarter needed and missing here stops the script: add it, spelled.
QUARTIERS = {
    "BAGATELLE": "Bagatelle", "BELLEPIERRE": "Bellepierre", "BRAS DE FER": "Bras de Fer", "ESPERANCE": "Espérance",
    "BAS RIVIERE": "Bas de la Rivière", "BEL AIR": "Bel-Air", "BOIS NEFLES": "Bois de Nèfles",
    "BRETAGNE": "La Bretagne", "CAMELIAS": "Camélias", "CENTRE VILLE": "Centre-ville", "CHAMP FLEURI": "Champ Fleuri",
    "CV - LE BOURG": "Le Bourg", "FRANCHE TERRE": "Franche Terre", "LA CONVENANCE": "La Convenance",
    "LES CAFES": "Les Cafés", "LES JACQUES / LA RESERVE": "Les Jacques / La Réserve", "MONTAGNE": "La Montagne",
    "MONTGAILLARD": "Montgaillard", "MOUFIA": "Moufia", "PROVIDENCE": "La Providence", "RAVINE DES CHEVRES": "Ravine des Chèvres",
    "SOURCE": "La Source", "ST FRANCOIS": "Saint-François", "STE CLOTILDE": "Sainte-Clotilde", "TOURETTE": "Tourette",
    "VAUBAN": "Vauban",
}
SMALL = {"à", "de", "des", "du", "la", "le", "les", "et", "au", "aux", "sur", "en", "d'", "l'"}
_last = [0.0]


def get(url):
    """One request, CADENCE seconds after the one before."""
    time.sleep(max(0.0, _last[0] + CADENCE - time.time()))
    _last[0] = time.time()
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()


def ascii_upper(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()


def name_key(s):
    """What two spellings of a street share: its words without accents, capitals, small words or order."""
    return tuple(sorted(w for w in re.findall(r"[A-Z0-9]+", ascii_upper(s)) if w not in EMPTY))


def accent_words(ban_rows):
    """{word in capitals, no accent: its accented spelling in the island's street names} (point 3 above)."""
    forms = {}
    for street in {r["nom_voie"] for r in ban_rows}:
        for w in re.findall(r"[^\W\d_]+", street):
            f = forms.setdefault(ascii_upper(w), {})
            f[w.lower()] = f.get(w.lower(), 0) + 1
    accents = {}
    for w, f in forms.items():
        acc = {x: n for x, n in f.items() if not x.isascii()}
        if acc and w not in KEEP:
            best = max(acc, key=acc.get)
            if acc[best] >= 2 and acc[best] * 3 >= 2 * sum(acc.values()):
                accents[w] = best
    return accents


# A bracket's words that say which stretch, written small in a part (« Allée Hématites(partie Basse) » → « Allée
# Hématites, partie basse »); a bracket that starts with another word is a name, kept in its bracket with a capital
# (« Chemin Safer (grand Coude) » → « Chemin Safer (Grand Coude) »).
STRETCH = {"à", "au", "aux", "du", "de", "des", "la", "le", "les", "l'", "d'", "et", "en", "entre", "sur", "vers", "dans",
           "un", "une", "côté", "coté", "cote", "droit", "gauche", "partie", "bas", "haut", "basse", "haute", "petit",
           "impasse", "imp", "chemin", "ch", "rue", "rte", "route", "allée", "résidence", "ex", "ancien", "face",
           "jusqu'au", "jusqu'à", "partir", "finition", "sœurs", "soeurs", "terre", "près", "lotissement", "cité",
           "quartier"}
WRITTEN = {"imp": "impasse", "ch": "chemin", "rte": "route"}


def parts(name):
    """A source's brackets: one at the end that says a stretch becomes a part after « , », its common words small,
    « N°37 » as « n° 37 », « 244,chemin » as « 244, chemin »; any other is kept, spaced, with its first capital
    (« ( Jean ) » → « (Jean) »). Only the source's name: the parts this script writes are never changed."""
    def stretch_of(t):
        first = t.split(" ")[0].lower()
        return first in STRETCH or bool(re.match(r"^(n°|\d)", first))

    def bracket(m):
        inner = re.sub(r"\s+", " ", m.group(1)).strip()
        if not inner:
            return ""
        if not stretch_of(inner):
            return f" ({inner[:1].upper()}{inner[1:]})"
        words = [WRITTEN.get(w.lower(), w.lower()) if w.lower() in STRETCH else w for w in inner.split(" ")]
        t = re.sub(r"\b[Nn]°\s*(?=\d)", "n° ", " ".join(words))
        return f" ({re.sub(r',(?=[^\s\d])', ', ', t)})"
    name = re.sub(r"\s*\(([^()]*)\)", bracket, name).strip()
    m = re.match(r"^(.+?) \(([^()]*)\)$", name)
    return f"{m.group(1)}, {m.group(2)}" if m and stretch_of(m.group(2)) else name

def accentuate(name, accents):
    """A name's words spelled as in the island's street names (`accents`), written there with no accent or a rarer one
    (« Espèrance »), their case kept."""
    def word(m):
        w = m.group(0)
        a = accents.get(ascii_upper(w)) if len(w) > 2 else None
        if not a or w.lower() == a:
            return w
        return a.upper() if w.isupper() else a[:1].upper() + a[1:] if w[:1].isupper() else a
    return re.sub(r"[^\W\d_]+", word, name)


def words_to_ask(ban_rows):
    """{street of the BAN (upper case, no accent): its longest distinctive word}."""
    out = {}
    for v in {ascii_upper(r["nom_voie"]) for r in ban_rows if r["code_insee"] in INSEE}:
        ws = [w for w in re.findall(r"[A-Z0-9]+", v) if w not in TYPES | EMPTY and len(w) >= 3]
        if ws:
            out[v] = max(ws, key=len)
    return out


def kind(c):
    """The collection of a pixel's colour, or None (background, a number, a holiday, a colour of no legend)."""
    if max(c) < 140:
        return None
    k, ref = min(COLOURS, key=lambda kc: sum((a - b) ** 2 for a, b in zip(c, kc[1])))
    return k if sum((a - b) ** 2 for a, b in zip(c, ref)) < 45 ** 2 else None


def calendar(pdf, year, name):
    """{kind: [day numbers]} of one zone's calendar (its first page, the twelve months)."""
    xml = subprocess.run(["pdftotext", "-f", "1", "-l", "1", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    w = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
         re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', xml)]
    ppm = subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-r", str(DPI), str(pdf)], check=True, capture_output=True).stdout
    head = ppm.split(b"\n", 3)
    width = int(head[1].split()[0])
    px = head[3]
    pix = lambda x, y: tuple(px[(int(y * K) * width + int(x)) * 3:(int(y * K) * width + int(x)) * 3 + 3])
    titles = [(t, MOIS.index(t[4]) + 1) for t in w if t[4] in MOIS]
    if sorted(m for _, m in titles) != list(range(1, 13)):
        raise ValueError(f"{name} : {len(titles)} mois lus")
    res = {}
    for t, m in titles:
        tx = (t[0] + t[2]) / 2
        # Its weekday headers: the « Lun » under the title (within 40 points) nearest left of its centre, then the six words
        # right of it on the same line, which must be « Mar » … « Dim ».
        lun = [u for u in w if u[4] == "Lun" and 0 < u[1] - t[1] < 40 and u[0] < tx]
        if not lun:
            raise ValueError(f"{name} : {MOIS[m - 1]}, pas d'en-tête « Lun »")
        lun = max(lun, key=lambda u: u[0])
        line = sorted((u for u in w if abs(u[1] - lun[1]) < 3 and u[0] >= lun[0]), key=lambda u: u[0])[:7]
        if [u[4] for u in line] != JOURS:
            raise ValueError(f"{name} : {MOIS[m - 1]}, en-têtes lus {[u[4] for u in line]}")
        heads = {u[4]: ((u[0] + u[2]) / 2, (u[1] + u[3]) / 2) for u in line}
        d, row = date(year, m, 1), 0
        while d.month == m:
            cx, cy = heads[JOURS[d.weekday()]]
            y = cy + FIRST + STEP * row - ABOVE
            if d.weekday() < 6:
                line = [kind(pix(cx * K + dx, y)) for dx in range(-round(HALF * K), round(HALF * K) + 1)]
                n = 1
                for i in range(1, len(line) + 1):
                    if i < len(line) and line[i] == line[i - 1]:
                        n += 1
                        continue
                    if n >= RUN and line[i - 1]:
                        res.setdefault(line[i - 1], set()).add(d.timetuple().tm_yday)
                    n = 1
            else:
                row += 1
            d += timedelta(1)
    out = {k: sorted(v) for k, v in sorted(res.items())}
    # A calendar read wrong is short of household waste or of sorted waste: a year has 52 weeks of each.
    if len(out.get("OM", [])) < 90 or not 20 <= len(out.get("CS", [])) <= 60:
        raise ValueError(f"{name} : {len(out.get('OM', []))} jours d'ordures ménagères, {len(out.get('CS', []))} de tri : lecture à revoir")
    if "BIO" in out and out["BIO"] != out["OM"]:
        raise ValueError(f"{name} : bac marron sans le gris, ou l'inverse")
    return out


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
    """« IMPASSE CORBEILLE D'OR », « lOT DE LA CASCADE » → « Impasse Corbeille d'Or », « Lot de la Cascade »: the site
    writes some names in capitals, some not; all alike, the small words in lower case but the first. The curly apostrophe
    is straightened and joined to its word (« Rue Renoyal de L’escouble » → « Rue Renoyal de l'Escouble »)."""
    s = re.sub(r"\b([DdLl])' *", r"\1'", s.replace("’", "'"))
    given = re.sub(r"\s+", " ", s).strip().split(" ")
    words = [w.lower() for w in given]
    out = []
    for i, w in enumerate(words):
        if CAPS.match(given[i]):
            out.append(given[i])
            continue
        if i and w in SMALL:
            out.append(w)
            continue
        m = re.match(r"^([dl]')(.+)$", w)
        if i and m:
            out.append(m.group(1) + m.group(2)[:1].upper() + m.group(2)[1:])
            continue
        out.append("-".join(p[:1].upper() + p[1:] for p in w.split("-")))
    return " ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path)
    cache = ap.parse_args().cache
    if cache:
        (cache / "pdf").mkdir(parents=True, exist_ok=True)

    ban = cache / "adresses-974.csv.gz" if cache else None
    if not (ban and ban.exists()):
        body = get(BAN)
        ban = ban or Path("/tmp/cinor-adresses-974.csv.gz")
        ban.write_bytes(body)
    ban_rows = list(csv.DictReader(gzip.open(ban, "rt", encoding="utf-8"), delimiter=";"))
    asked = words_to_ask(ban_rows)
    accents = accent_words(ban_rows)
    ban_names = {}
    for r in ban_rows:
        if r["code_insee"] in INSEE:
            by = ban_names.setdefault((INSEE[r["code_insee"]], name_key(r["nom_voie"])), Counter())
            by[r["nom_voie"]] += 1

    api_file = cache / "api.json" if cache else None
    answers = json.loads(api_file.read_text()) if api_file and api_file.exists() else {}

    def ask(q):
        if q not in answers:
            answers[q] = json.loads(get(API + urllib.parse.quote(q, safe="")))
            if api_file:
                api_file.write_text(json.dumps(answers, ensure_ascii=False))
        return answers[q]

    for word in sorted(set(asked.values())):
        ask(word)
    for street, word in sorted(asked.items()):
        if len(answers[word]) == 5:
            ws = [x for x in re.findall(r"[A-Z0-9]+", street) if x not in TYPES]
            if ws:
                ask("%".join(ws))
    rows = {str(r["id"]): r for a in answers.values() for r in a}

    year = date.today().year
    streets = {}
    for r in rows.values():
        if not r["ref_calendrier"]:
            continue
        commune = COMMUNES[ascii_upper(r["ville"]).strip()]
        # The BAN's spelling; of two, the one with more accents, then the one of more addresses.
        found = ban_names.get((commune, name_key(r["intitule_voie"])))
        source = max(found, key=lambda n: (sum(not ch.isascii() for ch in n), found[n])) if found else r["intitule_voie"]
        zone = streets.setdefault((parts(accentuate(street_name(source), accents)), commune), {}).setdefault(r["ref_calendrier"], [set(), set()])
        zone[0].add(ascii_upper(r["quartier"]).strip())
        zone[1].add(parts(accentuate(street_name(r["intitule_voie"]), accents)))
    # A street of several zones (one end and the other: 17 on 26/11/2026, « Boulevard Doret » at the Camélias and at
    # Vauban) is given once per zone, its quarters after its name, so that the answer and the page tell them apart; two
    # zones of the same quarters, by the CINOR's own names (« Allée des Topazes », zone BELL1, « Allée Topazes », BELL3).
    missing = {f"{q} ({name})" for (name, _), by_zone in streets.items() if len(by_zone) > 1
               for quarters, _ in by_zone.values() for q in quarters - QUARTIERS.keys()}
    if missing:
        raise ValueError(f"quartiers à écrire dans QUARTIERS : {', '.join(sorted(missing))}")
    named = {}
    for (name, commune), by_zone in streets.items():
        labels = {z: f"{name}, quartier {' / '.join(sorted(QUARTIERS[q] for q in quarters))}" if len(by_zone) > 1 else name
                  for z, (quarters, _) in by_zone.items()}
        if len(set(labels.values())) < len(labels):
            labels = {z: " / ".join(sorted(own)) for z, (_, own) in by_zone.items()}
        for z, label in labels.items():
            if (label, commune) in named or len(set(labels.values())) < len(labels):
                raise ValueError(f"{label} ({commune}) : deux zones sous le même nom")
            named[(label, commune)] = z
    zones = sorted(set(named.values()))
    calendars = []
    for zone in zones:
        local = cache / "pdf" / f"{zone}.pdf" if cache else Path("/tmp") / f"cinor-{zone}.pdf"
        url = PDF.format(year=year, zone=zone)
        if not local.exists():
            body = get(url)
            if not body.startswith(b"%PDF"):
                raise ValueError(f"{zone} : pas un PDF")
            local.write_bytes(body)
        calendars.append({"code": zone, "pdf": url, **calendar(local, year, zone), "F": holidays(year)})
    index = {z: i for i, z in enumerate(zones)}
    voies = sorted([name, commune, index[z]] for (name, commune), z in named.items())
    out = {"source": PAGE, "mis_a_jour": date.today().isoformat(), "annee": year, "calendriers": calendars, "voies": voies}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)} : {len(voies)} voies, {len(calendars)} calendriers", file=sys.stderr)


if __name__ == "__main__":
    main()
