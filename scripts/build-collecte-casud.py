#!/usr/bin/env python3
"""Build src/vie/collecte-casud.json: the days the bins are collected, street by street, in the South-East (CASUD: Le Tampon,
Saint-Joseph, Saint-Philippe, Entre-Deux).

The CASUD publishes no open data for it: its page « Collecte et traitement des déchets » (PAGE)
searches its streets by a word, each street with its sector and the PDF calendar of that sector. The site of an
intercommunality is read like a commune's (public data, read slowly, its source said with its link; withdrawn on
request): one request a minute, under the reader's name (user-agent.txt).

1. The streets and their sector: the search (Drupal, /views/ajax, what the page's form asks) answers 15 streets at most
   holding a word, with no next page. The words are those of the four communes' streets in the Base adresse nationale
   (adresse.data.gouv.fr, Licence Ouverte, one file): for each street its longest distinctive word, then, for a word that
   gave 15 answers (the list may be cut), each street holding it, its words. 26/11/2026: about 2,050 streets, 34 sectors.
2. A street's name is the BAN's when they differ only by accents, capitals, small words or word order (« CHEMIN
   BAMBOUS » → « Chemin des Bambous », « RUE DOUYERE (RAPHAEL) » → « Rue Raphaël Douyère »); else the CASUD's, in the
   same case as the others. A street of several sectors is given once per sector, its part after its name (PARTIES).
3. Each sector's PDF: two pages of six months, a line a day, the collections drawn at the right of the line, a symbol
   each in the legend's colour: a green star for the household waste (OM), a yellow triangle for the sorted waste (CS),
   a grey disc ringed in green for the garden waste (DV), a brown square for the bulky waste (EN); two collections the
   same day, two symbols side by side. Nothing is text: the lines are placed from the grey band of the Sundays (their
   dates known), the symbols found by colour and each put on its line, the symbols' own step fitted on them (it drifts
   from the lines' by up to 10 pixels in a month). A symbol off its line, a month whose Sundays are not all found, a
   collection on a Sunday or a holiday, or a calendar with too few collections stop the script rather than write a
   calendar it could not read.
4. The holidays (F) are the year's public holidays at La Réunion, as the calendars mark them (« Férié »).

Usage: python3 -I scripts/build-collecte-casud.py [--cache DIR]
  DIR: what was already read (adresses-974.csv.gz, voies.json: the streets read, fait.json: the words asked and how many
  streets each gave, pdf/<name>.pdf), kept there as it is read: the first run makes about 1,900 requests, a day and a
  half at one a minute. poppler-utils (pdftoppm) and numpy needed.
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
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/vie/collecte-casud.json"
PAGE = "https://www.casud.re/au-quotidien/preserver-lenvironnement/collecte-et-traitement-des-dechets"
SEARCH = ("https://www.casud.re/views/ajax?_wrapper_format=drupal_ajax&view_name=calendrier_de_collectes"
          "&view_display_id=block_search_cal&view_path=%2Fnode%2F99&search_api_fulltext=")
BAN = "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-974.csv.gz"
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}
CADENCE = 62
MAX = 15
INSEE = {"97422": "Le Tampon", "97412": "Saint-Joseph", "97417": "Saint-Philippe", "97403": "Entre-Deux"}
# The CASUD's names of its communes (after the street, « RUE X, Tampon »).
COMMUNES = {"Tampon": "Le Tampon", "Saint-Joseph": "Saint-Joseph", "Saint-Philippe": "Saint-Philippe", "Entre-Deux": "Entre-Deux"}
TYPES = {"RUE", "CHEMIN", "ALLEE", "IMPASSE", "AVENUE", "BOULEVARD", "ROUTE", "RUELLE", "SENTIER", "LOTISSEMENT", "RESIDENCE",
         "PLACE", "SQUARE", "CITE", "VOIE", "PASSAGE", "QUAI", "COURS", "RAMPE", "VENELLE", "LOT", "DOMAINE", "HAMEAU"}
EMPTY = {"DES", "DE", "DU", "LA", "LE", "LES", "D", "L", "ET", "AU", "AUX", "SAINT", "SAINTE"}
ROW = re.compile(r'views-field-field-adresse-nom"><span class="field-content">(.*?)<br\s*/?>\s*<small>(.*?)</small>.*?'
                 r'views-field-field-adresse-secteur-1"><span class="field-content">(.*?)</span></div>', re.S)
DPI = 150
# The legend's colours, read in the PDFs (26/11/2026), and how far a pixel may be from them. The garden waste's grey is
# near the Sundays' band (208, 218, 212): a tighter distance.
COLOURS = {"OM": (75, 186, 60), "CS": (250, 186, 35), "DV": (203, 196, 196), "EN": (100, 52, 28)}
DIST = {"OM": 45, "CS": 45, "DV": 16, "EN": 45}
BAND = (208, 218, 212)
# A street of several sectors is said with its part, written here from the CASUD's own words, its places spelled as
# src/places/gazetteer.json spells them. At Saint-Joseph a sector is a list of quarters, written once for the sector
# (« Les jacques (Debut La croix du jubile jusqu'a R Leon Dierx) - Ligne 420 - Bois noirs … »); at Le Tampon and
# L'Entre-Deux each street has its part (« Du N°121 (inclus) jusqu'à Emile Zola »), written for the street. A part
# needed and missing stops the script, and so does one no street needs.
PARTIES = {
    ("Saint-Joseph", "A"): "secteur Carosse jusqu'au chemin Dardanelle et bas des Lianes",
    ("Saint-Joseph", "B"): "secteur Les Grègues",
    ("Saint-Joseph", "C"): "secteur Les Lianes, Bel-Air et Plaine des Grègues",
    ("Saint-Joseph", "D"): "secteur Carosse après le chemin Dardanelle, Les Grègues et bas des Lianes",
    ("Saint-Joseph", "E"): "secteur Manapany, Le Goyave et Compagnie des Indes",
    ("Saint-Joseph", "F"): "secteur bas de la rue Juliette Dodu",
    ("Saint-Joseph", "G"): "secteur La Cayenne et Le Butor",
    ("Saint-Joseph", "H"): "secteur centre-ville bas et Rivière des Remparts",
    ("Saint-Joseph", "I"): "secteur centre-ville haut et Piton Babet",
    ("Saint-Joseph", "J"): "secteur Jean-Petit les Bas",
    ("Saint-Joseph", "K"): "secteur Jean-Petit et Grand Coude",
    ("Saint-Joseph", "L"): "secteur Les Jacques jusqu'à la rue Léon Dierx, Bois Noirs et Terrain Constance",
    ("Saint-Joseph", "M"): "secteur Les Jacques après la rue Léon Dierx, Langevin et Grand Galet",
    ("Saint-Joseph", "O"): "secteur Vincendo, Le Plateau, Parc Mouton et La Crête",
    ("Saint-Joseph", "P"): "secteur Ligne Matouta et Jacques Payet",
    ("Saint-Joseph", "T"): "secteur Girofle, Matouta et Basse Vallée",
    ("Entre-Deux", "Chemin Jean Lauret", "A"): "de la rue du Commerce à la rue Maurice Berrichon",
    ("Entre-Deux", "Chemin Jean Lauret", "B"): "de l'impasse Bayard à la piste du Dimitile",
    ("Le Tampon", "Chemin Henri Cabeu", "B"): "du chemin Neuf (pont d'Yves) au n° 310",
    ("Le Tampon", "Chemin Henri Cabeu", "F"): "après le n° 310, jusqu'à la rue Raphaël Douyère",
    ("Le Tampon", "Chemin Neuf", "A"): "du n° 121 à la rue Émile Zola",
    ("Le Tampon", "Chemin Neuf", "B"): "du rond-point du 14e km au chemin Epidor Hoareau (n° 9 à 117 bis)",
    ("Le Tampon", "Chemin Rosemont", "C"): "rue des Eucalyptus et chemin Notre-Dame-de-la-Paix (n° 1 à 71 A)",
    ("Le Tampon", "Chemin Rosemont", "F"): "du chemin Notre-Dame-de-la-Paix au n° 71 A",
    ("Le Tampon", "Impasse des Camélias", "B"): "sur le chemin Henri Cabeu (secteur B)",
    ("Le Tampon", "Impasse des Camélias", "E"): "sur le chemin Henri Cabeu (secteur E)",
    ("Le Tampon", "Impasse des Camélias", "H"): "sur la rue Saint-Vincent-de-Paul",
    ("Le Tampon", "Impasse des Goyaviers", "F"): "sur la rue des Lauriers Roses",
    ("Le Tampon", "Impasse des Goyaviers", "G"): "sur le chemin Jean-Baptiste Huet, au Petit Tampon",
    ("Le Tampon", "Impasse des Lauriers Roses", "E"): "sur le bas de la rue Saint-Vincent-de-Paul",
    ("Le Tampon", "Impasse des Lauriers Roses", "H"): "sur le haut de la rue Saint-Vincent-de-Paul",
    ("Le Tampon", "Route des Géraniums", "B"): "du rond-point du 17e km au n° 85",
    ("Le Tampon", "Route des Géraniums", "C"): "après le n° 85, vers le chemin des Maraîchers",
    ("Le Tampon", "Rue Bigey", "C"): "sur la rue Coin Tranquille",
    ("Le Tampon", "Rue Bigey", "E"): "sur la rue Marius et Ary Leblond, au 11e km",
    ("Le Tampon", "Rue Dachery", "E"): "de la nationale au rond-point de la rue Saint-Vincent-de-Paul",
    ("Le Tampon", "Rue Dachery", "H"): "du rond-point de la rue Saint-Vincent-de-Paul au chemin Chalet",
    ("Le Tampon", "Rue Hubert Delisle", "A"): "du n° 455 au rond-point du Baobab, vers la mairie annexe de Trois-Mares",
    ("Le Tampon", "Rue Hubert Delisle", "Centre"): "du rond-point de l'Université au rond-point Edgard Avril",
    ("Le Tampon", "Rue Hubert Delisle", "D"): "du rond-point de l'Université au rond-point Docteur Charrière (n° 383 à 453)",
    ("Le Tampon", "Rue Jules Bertaut", "D"): "de la rue des Flamboyants à la rue Hubert Delisle",
    ("Le Tampon", "Rue Jules Bertaut", "E"): "de la rue Hubert Delisle à la rue Saint-Vincent-de-Paul (n° 215 à 455)",
    ("Le Tampon", "Rue Raphaël Douyère", "C"): "de la mairie annexe de la Plaine des Cafres à Bassin Plat",
    ("Le Tampon", "Rue Raphaël Douyère", "F"): "de Bassin Plat à l'Horloge",
    ("Le Tampon", "Rue des Eucalyptus", "C"): "sur les rues Jean Defos du Rau et Marie Poitevin",
    ("Le Tampon", "Rue des Eucalyptus", "E"): "sur la rue Évariste de Parny",
    ("Le Tampon", "Rue des Flamboyants", "A"): "de la rue Louis Blériot à la rue Montaigne",
    ("Le Tampon", "Rue des Flamboyants", "D"): "du n° 246 (ravine Antoine) au rond-point Kervéguen",
    ("Le Tampon", "Rue des Maraîchers", "C"): "après le n° 31, jusqu'à la route des Géraniums",
    ("Le Tampon", "Rue des Maraîchers", "H"): "du croisement des chemins Chalet et Dachery au n° 31",
    ("Le Tampon", "Rue du Paille en Queue", "G"): "de la rue des Mainates à la fin de Bérive",
    ("Le Tampon", "Rue du Paille en Queue", "I"): "du rond-point Edgard Avril vers Bérive (n° 5 A à 56 bis)",
}
# The CASUD's abbreviations and slips, written out before a name is compared or written (26/11/2026).
ABBR = {"RLE": "RUELLE", "CHE": "CHEMIN", "RTE": "ROUTE", "IMP": "IMPASSE", "AV": "AVENUE", "BD": "BOULEVARD", "MAL": "MARECHAL",
        "LOTISEMENT": "LOTISSEMENT", "LOT": "LOTISSEMENT", "DEGAULLE": "DE GAULLE", "ALEE": "ALLEE", "ALLE": "ALLEE",
        "BRTL": "BRETELLE", "CH": "CHEMIN"}
# « Leconte Delisle » is the poet Leconte de Lisle; « Hubert Delisle », the governor, keeps his name.
PHRASES = {"LECONTE DELISLE": "LECONTE DE LISLE"}
# Surnames written both ways at La Réunion, never given an accent the BAN does not write for that street: the list, and
# how many streets write each way, in collecte-noms-deux-graphies.json beside this script.
KEEP = set(json.loads((Path(__file__).parent / "collecte-noms-deux-graphies.json").read_text())["sans_accent"])
# Words whose accented spelling is in fewer than two of the island's streets (or none, « Oeillets »), seen without accent
# in the CASUD's names on 26/11/2026: the French spelling, a first name or a plant's.
MORE_ACCENTS = {"HELENE": "hélène", "THERESE": "thérèse", "EPINARDS": "épinards", "TROENES": "troènes", "BENOIT": "benoît",
                "FENELON": "fénelon", "OEILLETS": "œillets", "CASSEE": "cassée", "THESEE": "thésée", "PELEE": "pelée",
                "VENDEE": "vendée"}
# A word kept in capitals: a Roman number (« Jean XXIII », « Henri II ») or a road's number (« N3 », « D37 »).
CAPS = re.compile(r"^(?=[IVXLC]{2})M{0,3}(CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$|^[A-Z]{1,3}[0-9]+[A-Z]?$")
SMALL = {"à", "de", "des", "du", "la", "le", "les", "et", "au", "aux", "sur", "en", "d'", "l'"}
_last = [0.0]


def get(url):
    """One request, CADENCE seconds after the one before."""
    time.sleep(max(0.0, _last[0] + CADENCE - time.time()))
    _last[0] = time.time()
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()


def ascii_upper(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def expand(s):
    """The name with its abbreviations written out (ABBR), in capitals with no accent."""
    s = re.sub(r"[A-Z0-9]+", lambda m: ABBR.get(m.group(0), m.group(0)), ascii_upper(s))
    for a, b in PHRASES.items():
        s = re.sub(rf"\b{a}\b", b, s)
    return s


def name_key(s):
    """What two spellings of a street share: its words without accents, capitals, small words or order."""
    return tuple(sorted(w for w in re.findall(r"[A-Z0-9]+", expand(s)) if w not in EMPTY))


def street_name(s, accents):
    """« IMPASSE CORBEILLE D'OR » → « Impasse Corbeille d'Or »: the site writes some names in capitals, some not; all
    alike, the small words in lower case but the first. A word written with no accent gets the BAN's (`accents`: {ORCHIDEES:
    orchidées}); one the CASUD wrote with accents keeps them; an abbreviation is written out. The curly apostrophe is
    straightened and joined to its word (« Rue D’ Anchain » → « Rue d'Anchain »)."""
    s = re.sub(r"\b([DdLl])' *", r"\1'", s.replace("’", "'"))

    def word(m):
        w = m.group(0)
        if ascii_upper(w) in ABBR:
            return " ".join(accents.get(x, x) for x in ABBR[ascii_upper(w)].split())
        return w if w != w.encode("ascii", "ignore").decode() else accents.get(w.upper(), w)
    s = re.sub(r"[^\W\d_]+", word, s)
    for a, b in PHRASES.items():
        s = re.sub(rf"\b{a}\b", b, s, flags=re.I)
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
    """A name's words spelled as in the island's street names (`accents`), written with no accent or a rarer one
    (« Espèrance »), their case kept: the BAN writes « Résidence les Camélias » and « Residence les Camelias »."""
    def word(m):
        w = m.group(0)
        a = accents.get(ascii_upper(w)) if len(w) > 2 else None
        if not a or w.lower() == a:
            return w
        return a.upper() if w.isupper() else a[:1].upper() + a[1:] if w[:1].isupper() else a
    return re.sub(r"[^\W\d_]+", word, name)


def holidays(year):
    """The public holidays at La Réunion (Easter by the Anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = divmod(b, 4)
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, kk = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - kk) % 7
    m = (a + 11 * h + 22 * l) // 451
    easter = date(year, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)
    return sorted([date(year, 1, 1), easter + timedelta(1), date(year, 5, 1), date(year, 5, 8), easter + timedelta(39),
                   easter + timedelta(50), date(year, 7, 14), date(year, 8, 15), date(year, 11, 1), date(year, 11, 11),
                   date(year, 12, 20), date(year, 12, 25)])


def runs(v, gap=2):
    """The runs of True in v, as (first, last), joined over gaps of `gap` at most."""
    out, s, p = [], None, None
    for i in np.flatnonzero(v):
        if s is None or i > p + gap:
            if s is not None:
                out.append((s, p))
            s = i
        p = i
    if s is not None:
        out.append((s, p))
    return out


def near(a, c, d):
    return np.abs(a - np.array(c)).sum(2) < d


def read_page(a, year, months, fer, name):
    """{kind: [dates]} of one page of six months (an RGB array)."""
    w = a.shape[1]
    coloured = near(a, COLOURS["OM"], DIST["OM"]) | near(a, COLOURS["CS"], DIST["CS"]) | near(a, COLOURS["EN"], DIST["EN"])
    coloured[:, :w // 4] = coloured[:, 3 * w // 4:] = False
    # The months' columns of symbols: two symbols side by side make one column (groups less than 40 px apart joined),
    # the usual place being the right one, half a symbol from the right edge.
    cols = [int(e) - 11 for s, e in runs(coloured.any(0), 40) if e - s > 8]
    if len(cols) != len(months):
        raise ValueError(f"{name} : {len(cols)} colonnes de symboles au lieu de {len(months)}")
    out = {}
    for m, cx in zip(months, cols):
        days = (date(year + m // 12, m % 12 + 1, 1) - timedelta(1)).day
        sundays = [d for d in range(1, days + 1) if date(year, m, d).weekday() == 6]
        # The Sundays' grey band, read between the number and the symbol; a holiday's « Férié », red, covers it there.
        # Tampon D's second page has a lighter grey (220, 232, 224), 40 away (26/11/2026); white is 127 away, the nearest
        # other light grey 70: under 50.
        ys = [(s + e) / 2 for s, e in runs(near(a[:, cx - 34:cx - 14], BAND, 50).sum(1) > 12) if e - s > 10]
        seen = [d for d in sundays if date(year, m, d) not in fer]
        found = seen if len(ys) == len(seen) else sundays if len(ys) == len(sundays) else None
        if not found:
            raise ValueError(f"{name} : mois {m}, {len(ys)} dimanches lus sur {len(sundays)}")
        step, y1 = np.polyfit(np.array(found) - 1, ys, 1)
        if not 26 < step < 29.5 or max(abs(y1 + (d - 1) * step - y) for d, y in zip(found, ys)) > 3:
            raise ValueError(f"{name} : mois {m}, lignes irrégulières")
        win = a[:, cx - 42:cx + 18]
        masks = {k: near(win, COLOURS[k], DIST[k]) for k in COLOURS}
        # The garden waste's disc has a green ring, the household waste's colour: the green within 5 px of its grey goes.
        ring = masks["DV"].copy()
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                ring |= np.roll(np.roll(masks["DV"], dy, 0), dx, 1)
        masks["OM"] &= ~ring
        marks = []
        for k, mk in masks.items():
            for s, e in runs(mk.sum(1) >= 3):
                if e - s < 8:
                    continue
                if e - s > 26:
                    raise ValueError(f"{name} : mois {m}, symbole {k} trop haut")
                marks.append((k, (s + e) / 2))
        if not marks:
            raise ValueError(f"{name} : mois {m}, aucun symbole")
        first = [int(round((y - y1) / step)) + 1 for _, y in marks]
        step2, y2 = np.polyfit(np.array(first) - 1, [y for _, y in marks], 1) if len(set(first)) > 1 else (step, y1)
        for (k, y), d0 in zip(marks, first):
            d = int(round((y - y2) / step2)) + 1
            # 6.2 px off its row seen (26/11/2026, Saint-Joseph H, Tampon Centre and H), the next row 27.5 px away: 8 at most.
            if d != d0 or abs(y2 + (d - 1) * step2 - y) > 8 or not 1 <= d <= days:
                raise ValueError(f"{name} : mois {m}, symbole {k} hors de sa ligne")
            if d in sundays or date(year, m, d) in fer:
                raise ValueError(f"{name} : {k} le {d}/{m}, un dimanche ou un jour férié")
            out.setdefault(k, set()).add(date(year, m, d))
    return out


def calendar(pdf, year, name):
    """{kind: [day numbers]} of one sector's calendar."""
    fer = set(holidays(year))
    res = {}
    for page in (1, 2):
        ppm = subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(DPI), str(pdf)], check=True, capture_output=True).stdout
        magic, size, depth, body = ppm.split(b"\n", 3)
        w, h = map(int, size.split())
        a = np.frombuffer(body, np.uint8)[:w * h * 3].reshape(h, w, 3).astype(int)
        for k, v in read_page(a, year, list(range(6 * page - 5, 6 * page + 1)), fer, name).items():
            res.setdefault(k, set()).update(v)
    out = {k: sorted(d.timetuple().tm_yday for d in v) for k, v in sorted(res.items())}
    # A year has 52 weeks of household waste, 26 fortnights of sorted waste (26/11/2026: 52 to 104 and 26 or 27).
    if len(out.get("OM", [])) < 50 or not 20 <= len(out.get("CS", [])) <= 60:
        raise ValueError(f"{name} : {len(out.get('OM', []))} jours d'ordures ménagères, {len(out.get('CS', []))} de tri : lecture à revoir")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path)
    cache = ap.parse_args().cache
    if cache:
        (cache / "pdf").mkdir(parents=True, exist_ok=True)

    ban = cache / "adresses-974.csv.gz" if cache else None
    if not (ban and ban.exists()):
        body = get(BAN)
        ban = ban or Path("/tmp/casud-adresses-974.csv.gz")
        ban.write_bytes(body)
    ban_names, asked, island = {}, {}, {}
    for r in csv.DictReader(gzip.open(ban, "rt", encoding="utf-8"), delimiter=";"):
        island.setdefault(r["nom_voie"], r["code_insee"])
        if r["code_insee"] in INSEE:
            by = ban_names.setdefault((INSEE[r["code_insee"]], name_key(r["nom_voie"])), {})
            by[r["nom_voie"]] = by.get(r["nom_voie"], 0) + 1
            v = ascii_upper(r["nom_voie"])
            ws = [x for x in re.findall(r"[A-Z0-9]+", v) if x not in TYPES | EMPTY and len(x) >= 3]
            if ws:
                asked[v] = max(ws, key=len)

    # A word's accents: its accented spelling in the island's street names (all the BAN of La Réunion, a street counted
    # once), the BAN writing many with none (« Rue des Orchidees » 7 times, « des Orchidées » 6): the accented spelling of
    # two streets at least and two thirds of the accented ones (« frères » 8, « fréres » 2: frères).
    forms = {}
    for street in island:
        for w in re.findall(r"[^\W\d_]+", street):
            f = forms.setdefault(ascii_upper(w), {})
            f[w.lower()] = f.get(w.lower(), 0) + 1
    accents = {}
    for w, f in forms.items():
        acc = {x: n for x, n in f.items() if x != x.encode("ascii", "ignore").decode()}
        if acc and w not in KEEP:
            best = max(acc, key=acc.get)
            if acc[best] >= 2 and acc[best] * 3 >= 2 * sum(acc.values()):
                accents[w] = best
    accents.update(MORE_ACCENTS)
    rows_file, done_file = (cache / "voies.json", cache / "fait.json") if cache else (None, None)
    rows = json.loads(rows_file.read_text()) if rows_file and rows_file.exists() else {}
    done = json.loads(done_file.read_text()) if done_file and done_file.exists() else {}

    def ask(q):
        if q in done:
            return done[q]
        n = 0
        for c in json.loads(get(SEARCH + urllib.parse.quote(q))):
            d = c.get("data")
            if not (isinstance(d, str) and "views-field-field-adresse-nom" in d):
                continue
            for name_commune, detail, cal in ROW.findall(d):
                name_commune, detail = text(name_commune), text(detail)
                nom, _, commune = name_commune.rpartition(", ")
                pdf = (re.findall(r'href="([^"]+)"', cal) or [None])[0]
                sector = (re.findall(r"[Ss]ecteur[- ]([A-Za-z0-9]+)", pdf or "") or [None])[0]
                rows[f"{name_commune}|{detail}"] = {"nom": nom, "commune": commune, "detail": detail, "pdf": pdf, "secteur": sector}
                n += 1
        done[q] = n
        if cache:
            rows_file.write_text(json.dumps(rows, ensure_ascii=False))
            done_file.write_text(json.dumps(done, ensure_ascii=False))
        return n

    for word in sorted(set(asked.values())):
        ask(word)
    for street, word in sorted(asked.items()):
        if done[word] == MAX:
            ws = [x for x in re.findall(r"[A-Z0-9]+", street) if x not in TYPES]
            if ws:
                ask(" ".join(ws))

    # Each sector's PDF, kept in DIR/pdf. A sector the search still gives but whose PDF is gone (404: 26/11/2026, the
    # sectors R and S « of Saint-Joseph », streets of Le Baril and Le Tremblet that Saint-Philippe's sectors R and S give
    # again) is left out with its streets, listed in DIR/pdf/absents.json so that the build runs offline.
    year = date.today().year
    gone_file = cache / "pdf" / "absents.json" if cache else None
    gone = set(json.loads(gone_file.read_text())) if gone_file and gone_file.exists() else set()
    local = {}
    for url in sorted({r["pdf"] for r in rows.values() if r["pdf"] and r["commune"] in COMMUNES} - gone):
        file = url.rsplit("/", 1)[1]
        local[url] = cache / "pdf" / file if cache else Path("/tmp") / f"casud-{file}"
        if not local[url].exists():
            try:
                body = get(url)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                gone.add(url)
                continue
            if not body.startswith(b"%PDF"):
                raise ValueError(f"{file} : pas un PDF")
            local[url].write_bytes(body)
    if gone_file:
        gone_file.write_text(json.dumps(sorted(gone), indent=1))
    days = {url: calendar(f, year, url.rsplit("/", 1)[1]) for url, f in local.items() if url not in gone}
    # The search gives some streets of a commune again under its neighbour (26/11/2026: « Route du Brûlé », « Rue de
    # Basse-Vallée » of Saint-Philippe's sector T under Saint-Joseph's T, a PDF of the same days): a row is left out when
    # its commune has no such street in the BAN and another has, on a calendar of the same days.
    keyed = {}
    for r in rows.values():
        if r["pdf"] in days and r["commune"] in COMMUNES:
            keyed.setdefault(name_key(r["nom"]), []).append((COMMUNES[r["commune"]], r["pdf"]))

    def twice(r):
        commune, key = COMMUNES[r["commune"]], name_key(r["nom"])
        return (commune, key) not in ban_names and any(
            c != commune and (c, key) in ban_names and days[u] == days[r["pdf"]] for c, u in keyed[key])
    kept = [r for r in rows.values() if r["pdf"] in days and r["commune"] in COMMUNES and not twice(r)]
    left = sum(1 for r in rows.values() if r["pdf"] and r["commune"] in COMMUNES) - len(kept)
    streets = {}
    for r in kept:
        commune = COMMUNES[r["commune"]]
        # The BAN's spelling; of two, the one with accents, then the one of more addresses.
        found = ban_names.get((commune, name_key(r["nom"])))
        source = max(found, key=lambda n: (sum(not ch.isascii() for ch in n), found[n])) if found else r["nom"]
        name = parts(accentuate(street_name(source, accents), accents))
        streets.setdefault((name, commune), {})[r["pdf"]] = r["secteur"]
    named, used, missing = {}, set(), set()
    for (name, commune), by_pdf in streets.items():
        for pdf, sector in by_pdf.items():
            label = name
            if len(by_pdf) > 1:
                key = next((k for k in ((commune, name, sector), (commune, sector)) if k in PARTIES), None)
                if not key:
                    missing.add(f"{name} ({commune}, {sector})")
                    continue
                used.add(key)
                label = f"{name}, {PARTIES[key]}"
            if (label, commune) in named:
                raise ValueError(f"{label} ({commune}) : deux secteurs sous le même nom")
            named[(label, commune)] = pdf
    if missing or PARTIES.keys() - used:
        raise ValueError(f"PARTIES : à écrire {sorted(missing)}, inutiles {sorted(PARTIES.keys() - used)}")
    pdfs = sorted(set(named.values()))
    calendars = []
    for url in pdfs:
        code = re.sub(r"^A4-Calendrier-de-collecte-|-\d{4}-Secteur|\.pdf$", "", url.rsplit("/", 1)[1])
        calendars.append({"code": code, "pdf": url, **days[url], "F": [d.timetuple().tm_yday for d in holidays(year)]})
    index = {u: i for i, u in enumerate(pdfs)}
    voies = sorted([name, commune, index[u]] for (name, commune), u in named.items())
    out = {"source": PAGE, "mis_a_jour": date.today().isoformat(), "annee": year, "calendriers": calendars, "voies": voies}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)} : {len(voies)} voies, {len(calendars)} calendriers ; {len(gone)} PDF absents, "
          f"{left} réponses de la recherche laissées", file=sys.stderr)


if __name__ == "__main__":
    main()
