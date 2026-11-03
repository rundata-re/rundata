#!/usr/bin/env python3
"""Build scripts/raa-prenoms.txt: the first names that scripts/raa.ts looks for in the titles of the prefecture's acts.

From the « Fichier des prénoms » of the Insee (édition 2023, births in France from 1900 to 2022, Licence Ouverte), its
national file (nat2022.csv): each first name given to at least SEUIL children over all those years, folded (lower case,
no accents), one a line. A title of an act that holds one of them beside another capitalised word is never kept: it may
name a person (scripts/raa.ts, `personne`). Only the list is in the repository, not the Insee's file. Run by hand when
the Insee publishes a new edition.
Usage: python3 -I scripts/build-raa-prenoms.py <nat2022.csv>
  (https://www.insee.fr/fr/statistiques/fichier/7633685/nat2022_csv.zip, unzipped)
"""
import csv
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEUIL = 2000
# Shorter, a first name is a word of a title too often (« Eva », « Léo » are kept, « Al » is not).
MIN_LETTERS = 3


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def main():
    births = Counter()
    with open(sys.argv[1], encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter=";"):
            # « _PRENOMS_RARES »: the Insee's sum of the rare ones, not a first name.
            if not row["preusuel"].startswith("_"):
                births[fold(row["preusuel"])] += int(row["nombre"])
    names = sorted(n for n, k in births.items() if k >= SEUIL and len(n) >= MIN_LETTERS)
    dest = ROOT / "scripts/raa-prenoms.txt"
    dest.write_text(
        "# Prénoms donnés à au moins 2 000 enfants nés en France de 1900 à 2022, en minuscules et sans accents.\n"
        "# Source : Insee, Fichier des prénoms (édition 2023, fichier national nat2022.csv), Licence Ouverte.\n"
        f"# Seuil : {SEUIL} naissances. Construit par scripts/build-raa-prenoms.py ; lu par scripts/raa.ts.\n"
        + "\n".join(names) + "\n", encoding="utf-8")
    print(f"{len(names)} prénoms -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
