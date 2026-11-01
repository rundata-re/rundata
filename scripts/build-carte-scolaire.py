#!/usr/bin/env python3
"""Build the public collèges' map of sectors of La Réunion, for the « Quel collège ? » search of /ecoles.

From data.education.gouv.fr, « Carte scolaire des collèges publics » (fr-en-carte-scolaire-colleges-publics, Licence
Ouverte 2.0), the rows of code_departement 974: each a stretch of a street (its numbers, odd, even or both) and the
collège it depends on, or a whole commune with a single sector. Written to a compact file per commune that the page loads
in the browser (public/carte-scolaire/, each name changing with its content, src/vie/carte-scolaire.json): the address typed is
matched there and never leaves the phone. The collèges' names come from src/vie/ecoles.json (scripts/build-ecoles.py).
The map changes once a year, before the school year: run this by hand.
Usage: python3 -I scripts/build-carte-scolaire.py [--json FILE]   (FILE: the API's JSON export, already downloaded)
"""
import argparse
import gzip
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "fr-en-carte-scolaire-colleges-publics"
API = f"https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/{DATASET}"
EXPORT = f"{API}/exports/json?where=code_departement%3D%22974%22"
UA = {"User-Agent": "reunion-temps-reel (open source MCP server, real-time data for Reunion Island)"}
PARITE = {"PI": 0, "I": 1, "P": 2}


def get(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        body = r.read()
    # The portal compresses its answers even unasked.
    return json.loads(gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    a = ap.parse_args()
    rows = json.load(open(a.json)) if a.json else get(EXPORT)
    maj = get(API)["metas"]["default"]["modified"][:10]
    ecoles = {e["uai"]: e for e in json.load(open(ROOT / "src/vie/ecoles.json"))["etablissements"]}
    rnes = sorted({r["code_rne"] for r in rows})
    missing = [x for x in rnes if x not in ecoles]
    if missing:
        raise SystemExit(f"collèges absents de src/vie/ecoles.json : {missing}")
    college = [{k: ecoles[x][k] for k in ("uai", "nom", "adresse", "tel", "web", "onisep") if ecoles[x].get(k)} for x in rnes]
    at = {x: i for i, x in enumerate(rnes)}
    communes: dict[str, dict] = {}
    for r in sorted(rows, key=lambda r: (r["code_insee"], r["type_et_libelle"] or "", r["lieu_dit"] or "", r["n_de_voie_debut"] or 0)):
        c = communes.setdefault(r["code_insee"], {"v": []})
        if r["secteur_unique"] == "O":
            # The whole commune in one sector: no street.
            c["u"] = at[r["code_rne"]]
            continue
        # A street: its name, its place, its first and last numbers (9999: to its end), odd (1), even (2) or both (0).
        c["v"].append([r["type_et_libelle"], r["lieu_dit"] or "", int(r["n_de_voie_debut"] or 0), int(r["n_de_voie_fin"] or 9999),
                       PARITE[r["parite"] or "PI"], at[r["code_rne"]]])
    folder = ROOT / "public/carte-scolaire"
    folder.mkdir(exist_ok=True)
    for old in folder.glob("*.json"):
        old.unlink()
    # A file per commune, with the collèges of its sectors: only the commune chosen is loaded.
    paths, size = {}, 0
    for insee, c in communes.items():
        used = sorted({v[5] for v in c["v"]} | ({c["u"]} if "u" in c else set()))
        local = {i: n for n, i in enumerate(used)}
        out = {"maj": maj, "colleges": [college[i] for i in used], "v": [v[:5] + [local[v[5]]] for v in c["v"]]}
        if "u" in c:
            out["u"] = local[c["u"]]
        body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
        name = f"{insee}.{hashlib.sha256(body).hexdigest()[:10]}.json"
        (folder / name).write_bytes(body)
        paths[insee] = f"/carte-scolaire/{name}"
        size += len(body)
    uniques = sorted(i for i, c in communes.items() if "u" in c and not c["v"])
    meta = {"maj": maj, "troncons": len(rows), "colleges": len(rnes), "communes": paths, "uniques": uniques}
    (ROOT / "src/vie/carte-scolaire.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(f"public/carte-scolaire/ : {len(paths)} communes, {size // 1024} Ko, {len(rows)} tronçons, {len(rnes)} collèges, mise à jour {maj}")

if __name__ == "__main__":
    main()
