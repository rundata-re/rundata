#!/usr/bin/env python3
"""Build src/traces/aires.json: the ONF's reception areas in La Réunion's forests, bundled.

From the layer « Aires d'accueil » (1) of the ONF's map of the trails, the ArcGIS service sentiers_randonnee reads live
(src/providers/sentiers.ts): each place by its name and position, nothing else. The layer gives no type: nothing is
said of what a place has or allows, only its name as the ONF writes it. Edited seldom (May 2026).
Usage: python3 -I scripts/build-aires.py [--json query.json --meta layer.json] [--verifier SEUIL]
"""
import argparse
import importlib.util
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAYER = "https://services1.arcgis.com/Y4HgaQpzkE7kenlE/arcgis/rest/services/Sentiers_La_Reunion_public/FeatureServer/1"
QUERY = LAYER + "/query?" + urllib.parse.urlencode({"where": "1=1", "outFields": "WA_Lieu", "returnGeometry": "true", "outSR": "4326", "geometryPrecision": "5", "f": "json"})
UA = {"User-Agent": (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()}


def verifier():
    """scripts/verifier.py, the checks shared by the build scripts (`python3 -I` does not put scripts/ on the path)."""
    spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("verifier.py"))
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    return v


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json", help="a local copy of the query")
    p.add_argument("--meta", help="a local copy of the layer's description")
    # By content (one small query): the layer's edit date moves with any edit, a place renamed or moved is what
    # matters. The ONF edits it seldom (May 2026): 0, any place added, gone or moved is to be seen.
    p.add_argument("--verifier", type=int, metavar="SEUIL", help="write nothing: compare with src/traces/aires.json by name and place, fail past SEUIL")
    a = p.parse_args()
    rows = json.load(open(a.json)) if a.json else get(QUERY)
    meta = json.load(open(a.meta)) if a.meta else get(LAYER + "?f=json")
    if rows.get("exceededTransferLimit"):
        raise SystemExit("couche tronquée : lire par pages")
    out = []
    for f in rows["features"]:
        nom = re.sub(r"\s+", " ", (f["attributes"].get("WA_Lieu") or "")).strip()
        g = f.get("geometry") or {}
        if not nom or "x" not in g:
            continue
        out.append({"nom": nom, "lon": round(g["x"], 5), "lat": round(g["y"], 5)})
    out.sort(key=lambda r: (r["nom"], r["lon"], r["lat"]))
    edited = meta.get("editingInfo", {}).get("dataLastEditDate")
    dest = ROOT / "src/traces/aires.json"
    if a.verifier is not None:
        bundled = json.loads(dest.read_text())
        print(f"couche modifiée le {datetime.fromtimestamp(edited / 1000, timezone.utc).date() if edited else '?'}, liste embarquée : {bundled['mise_a_jour']}")
        sys.exit(verifier().ecarts("Aires d'accueil (ONF)", bundled["aires"], out, lambda r: (r["nom"], r["lon"], r["lat"]), a.verifier,
                                   "build-aires.py", lambda r: f'{r["nom"]} ({r["lon"]}, {r["lat"]})'))
    dest.write_text(json.dumps({
        "mise_a_jour": datetime.fromtimestamp(edited / 1000, timezone.utc).date().isoformat() if edited else None,
        "source": "ONF La Réunion, couche « Aires d'accueil » de la carte des sentiers",
        "aires": out,
    }, ensure_ascii=False, indent=0) + "\n")
    print(dest, len(out), "aires d'accueil")


if __name__ == "__main__":
    main()
