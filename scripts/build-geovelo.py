#!/usr/bin/env python3
"""Build src/vie/velo-geovelo.json: the bike lanes of the whole island, as Geovelo gives them, for their own layer of /carte.

Geovelo's « Aménagements cyclables Île de la Réunion » on data.gouv.fr: the lanes mapped in OpenStreetMap, put by
Geovelo in the national schema of bike lanes (each side its type: « BANDE CYCLABLE », « PISTE CYCLABLE », « VOIE
VERTE »…), each piece its commune. Under the ODbL: « © les contributeurs d'OpenStreetMap », Geovelo's treatment. A file
of its own, never mixed with the Région's or the CIVIS's lists under the Licence Ouverte (web/couches.ts): this one is
a derived database of it, under the same licence. One file a month (a parquet, the only format given), the newest read.
Its pieces of the same type, in the same commune, end to end, are one lane, simplified to 5 m. The state of a lane on
the day is not in it: what it gives is said as Geovelo's, never a lane said usable.

Usage: python3 -I scripts/build-geovelo.py [--fichier F.parquet]   (pyarrow, in a venv: python3 -m venv /tmp/v &&
       /tmp/v/bin/pip install pyarrow && /tmp/v/bin/python -I scripts/build-geovelo.py)
       python3 -I scripts/build-geovelo.py --verifier N   (standard library only: the newest file of the fiche against
       the one bundled; 1, the job's failure, when more than N newer ones were published)
"""
import argparse
import importlib.util
import io
import json
import struct
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("traces", ROOT / "scripts" / "build-traces.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

SLUG = "amenagements-cyclables-ile-de-la-reunion"
FICHE = f"https://www.data.gouv.fr/api/1/datasets/{SLUG}/"
PAGE = f"https://www.data.gouv.fr/datasets/{SLUG}"
DEST = ROOT / "src/vie/velo-geovelo.json"
# Geovelo's types, as French writes them; « AUCUN » is a side without one.
TYPES = {
    "PISTE CYCLABLE": "Piste cyclable",
    "BANDE CYCLABLE": "Bande cyclable",
    "VOIE VERTE": "Voie verte",
    "VELO RUE": "Vélorue",
    "COULOIR BUS+VELO": "Couloir bus et vélo",
    "AMENAGEMENT MIXTE PIETON VELO HORS VOIE VERTE": "Aménagement mixte piétons et vélos",
    "DOUBLE SENS CYCLABLE PISTE": "Double sens cyclable en piste",
    "DOUBLE SENS CYCLABLE BANDE": "Double sens cyclable en bande",
    "DOUBLE SENS CYCLABLE NON MATERIALISE": "Double sens cyclable non matérialisé",
    "ACCOTEMENT REVETU HORS CVCB": "Accotement revêtu",
    "CHAUSSEE A VOIE CENTRALE BANALISEE": "Chaussée à voie centrale banalisée",
    "GOULOTTE": "Goulotte",
    "RAMPE": "Rampe",
    "AUTRE": "Autre aménagement",
}


def fiche():
    req = urllib.request.Request(FICHE, headers=bt.UA)
    return json.load(urllib.request.urlopen(req, timeout=120))


def newest(f):
    """The fiche's newest parquet: its url and its day."""
    files = sorted((r for r in f["resources"] if r["format"] == "parquet"), key=lambda r: r["last_modified"])
    assert files, "aucun parquet sur la fiche"
    return files[-1]["url"], files[-1]["last_modified"][:10]


def lines_of(wkb):
    """A LineString or MultiLineString in WKB, as lists of (lon, lat)."""
    e = "<" if wkb[0] == 1 else ">"
    kind = struct.unpack_from(e + "I", wkb, 1)[0] & 0xFF

    def line(o):
        n = struct.unpack_from(e + "I", wkb, o)[0]
        return [struct.unpack_from(e + "dd", wkb, o + 4 + 16 * i) for i in range(n)], o + 4 + 16 * n

    if kind == 2:
        return [line(5)[0]]
    assert kind == 5, kind
    out, o = [], 9
    for _ in range(struct.unpack_from(e + "I", wkb, 5)[0]):
        l, o = line(o + 5)
        out.append(l)
    return out


def type_of(r):
    """Its sides' types, each once, in the order of the alphabet (« Bande cyclable », « Bande cyclable, couloir bus et
    vélo »): the same pair of types read the same whichever side each is on."""
    sides = sorted({TYPES[s] for s in (r["ame_d"], r["ame_g"]) if s and s != "AUCUN"})
    return ", ".join(sides[:1] + [s[0].lower() + s[1:] for s in sides[1:]])


def lanes(rows):
    """The pieces of the same type in the same commune that touch, one lane, its pieces end to end."""
    groups = {}
    for r in rows:
        t = type_of(r)
        if not t:
            continue
        groups.setdefault((t, r["code_com_d"] or r["code_com_g"]), []).extend(l for l in lines_of(r["geometry"]) if len(l) > 1)
    out = []
    for (t, com), ways in sorted(groups.items()):
        for piece in bt.chain(ways):
            out.append((t, com, piece))
    # The pieces of a group that do not touch are lanes of their own: one object each, drawn and found on its own.
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--fichier", type=Path, help="a local copy of the newest parquet")
    p.add_argument("--verifier", type=int, metavar="ECART")
    a = p.parse_args()
    f = fiche()
    url, du = newest(f)
    if a.verifier is not None:
        sys.exit(verifier(f, a.verifier))
    assert f["license"] == "odc-odbl", f["license"]
    try:
        import pyarrow.parquet as pq
    except ImportError:
        sys.exit("pyarrow est nécessaire pour lire le parquet : voir l'usage en tête du script.")
    if a.fichier:
        rows = pq.read_table(a.fichier).to_pylist()
    else:
        req = urllib.request.Request(url, headers=bt.UA)
        rows = pq.read_table(io.BytesIO(urllib.request.urlopen(req, timeout=300).read())).to_pylist()
    assert {r["source"] for r in rows} == {"Les contributeurs OpenStreetmap"}, {r["source"] for r in rows}
    unknown = {s for r in rows for s in (r["ame_d"], r["ame_g"]) if s and s != "AUCUN" and s not in TYPES}
    assert not unknown, f"types inconnus : {unknown}"
    off = {(r["statut_d"], r["statut_g"]) for r in rows} - {("EN SERVICE", "EN SERVICE")}
    assert not off, f"statuts à lire : {off}"
    voies = [{"type": t, "commune": com, "ligne": bt.encode(bt.simplify(piece, bt.SIMPLIFY_M))} for t, com, piece in lanes(rows)]
    DEST.write_text(json.dumps({
        "construit": date.today().isoformat(),
        "source": {"page": PAGE, "fichier": url, "liste_du": du},
        "voies": voies,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    km = sum(bt.dist_m(x, y) for _, _, piece in lanes(rows) for x, y in zip(piece, piece[1:])) / 1000
    print(f"Geovelo ({du}) : {len(rows)} tronçons, {len(voies)} voies, {km:.0f} km -> {DEST.relative_to(ROOT)}, {DEST.stat().st_size // 1024} Ko")


def verifier(f, ecart):
    """The bundled list's file against the fiche's of today, without writing: Geovelo publishes one a month."""
    bundled = json.loads(DEST.read_text(encoding="utf-8"))["source"]
    newer = sorted({r["last_modified"][:10] for r in f["resources"] if r["format"] == "parquet" and r["last_modified"][:10] > bundled["liste_du"]})
    print(f"liste du {bundled['liste_du']} ; la fiche aujourd'hui : {len(newer)} fichier(s) plus récent(s){' : ' + ', '.join(newer) if newer else ''}")
    if f["license"] != "odc-odbl":
        print(f"::error::La licence de la fiche des aménagements cyclables de Geovelo a changé ({f['license']}) : à relire avant de la reprendre.")
        return 1
    if len(newer) > ecart:
        print(f"::error::Geovelo a publié {len(newer)} liste(s) des aménagements cyclables plus récente(s) que celle du {bundled['liste_du']} (seuil {ecart}) : lancer scripts/build-geovelo.py et proposer la PR.")
        return 1
    return 0


if __name__ == "__main__":
    main()
