#!/usr/bin/env python3
"""Build src/places/gazetteer.json: every named place a person might ask about in La Réunion.

Sources:
  - communes: geo.api.gouv.fr (contours, Licence Ouverte) — also used to tag each place with its commune
  - places, beaches, peaks, viewpoints, pools: OpenStreetMap via Overpass (ODbL)
  - a few places OSM does not name: IGN BD TOPO via the Géoplateforme WFS (Licence Ouverte)
  - altitude of every point: IGN RGE ALTI via the Géoplateforme altimetry API (Licence Ouverte)

Usage: python3 -I scripts/build-gazetteer.py [--cache DIR]
"""
import argparse
import hashlib
import json
import math
import tempfile
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "reunion-temps-reel/0.1", "Accept": "application/json"}
COMMUNES = "https://geo.api.gouv.fr/departements/974/communes?format=geojson&geometry=contour&fields=nom,code,population"
OVERPASS = "https://overpass-api.de/api/interpreter"
ALTI = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json"
WFS = "https://data.geopf.fr/wfs/ows"
QUERY = """[out:json][timeout:120][bbox:-21.40,55.20,-20.86,55.84];
(
  node["place"~"^(city|town|village|hamlet|suburb|quarter|neighbourhood|locality)$"]["name"];
  nwr["natural"~"^(beach|peak|volcano|cape|bay)$"]["name"];
  nwr["waterway"="waterfall"]["name"];
  nwr["natural"="water"]["name"~"^[Bb]assin"];
  nwr["tourism"="viewpoint"]["name"];
  nwr["leisure"="marina"]["name"];
  nwr["aeroway"="aerodrome"]["iata"]["name"];
);
out center tags;"""

# Places people and the news name that OSM has only as an area under another name (a business zone): (our name, kind,
# OSM element), read by id with the query above.
EXTRA = [
    ("Cambaie", "lieu_dit", "way", 477835389),  # Z.A.C. de Cambaie, Saint-Paul
]
QUERY = QUERY.replace("\n);", "".join(f"\n  {t}(id:{i});" for _, _, t, i in EXTRA) + "\n);")

# Places people name that OSM does not, read in IGN's BD TOPO by their id in its layer of named areas: (our kind,
# cleabs). Located at the centre of their largest outline, named as the BD TOPO names them.
BDTOPO = [
    ("lieu_dit", "SURFACTI0000001402419989"),  # Parc des Palmiers du Monde (jardin botanique), Le Tampon
]

# OSM tag → our kind, and how much a match on that kind is worth when several places share a name.
KINDS = [
    ("place", {"city": "localite", "town": "localite", "village": "localite", "suburb": "quartier",
               "quarter": "quartier", "neighbourhood": "quartier", "hamlet": "quartier", "locality": "lieu_dit"}),
    ("natural", {"beach": "plage", "peak": "sommet", "volcano": "sommet", "cape": "cap", "bay": "baie",
                 "water": "bassin"}),
    ("waterway", {"waterfall": "bassin"}),
    ("tourism", {"viewpoint": "point_de_vue"}),
    ("leisure", {"marina": "port"}),
    ("aeroway", {"aerodrome": "aeroport"}),
]
GENERIC = {"plage", "bassin", "cascade", "point de vue", "piton", "pointe"}
RANK = {"commune": 0, "plage": 1, "localite": 2, "sommet": 3, "quartier": 4, "point_de_vue": 5, "bassin": 6,
        "port": 7, "baie": 8, "cap": 9, "lieu_dit": 10, "aeroport": 11}

# Names people use that OSM does not carry, pointing at a place that is in the gazetteer.
ALIASES = {
    "Plage de l'Hermitage": "Plage de l'Ermitage-les-Bains",
    "Lagon de l'Hermitage": "Plage de l'Ermitage-les-Bains",
    "L'Hermitage": "Plage de l'Ermitage-les-Bains",
    "Plage des Roches Noires": "Les Roches Noires",
    "Trou d'Eau": "Plage de la Saline les Bains",
    "Cirque de Cilaos": "Cilaos",
    "Cirque de Salazie": "Salazie",
    "Cirque de Mafate": "La Nouvelle",
    "Mafate": "La Nouvelle",
    "Volcan": "Pas de Bellecombe - Jacob",
    "Piton de la Fournaise": "Pas de Bellecombe - Jacob",
    "Le Maïdo": "Maïdo",
    "Plaine des Cafres": "La Plaine des Cafres",
    "Saint-Gilles": "Saint-Gilles-les-Bains",
    "Boucan": "Plage de Boucan-Canot",
    "Étang-Salé-les-Bains": "L'Étang-Salé les Bains",
    "Gillot": "Aéroport de la Réunion Roland-Garros",
    "Aéroport de Gillot": "Aéroport de la Réunion Roland-Garros",
    "Aéroport Roland Garros": "Aéroport de la Réunion Roland-Garros",
    "Roland Garros": "Aéroport de la Réunion Roland-Garros",
    "Aéroport de Pierrefonds": "Aéroport de Saint-Pierre - Pierrefonds",
    "Parc des Palmiers": "Parc des Palmiers du Monde",
}


def fetch(url, cache, name, data=None):
    path = cache / name
    if not path.exists():
        req = urllib.request.Request(url, data=data, headers=UA)
        with urllib.request.urlopen(req, timeout=180) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text())


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return " ".join("".join(c if c.isalnum() else " " for c in s if not unicodedata.combining(c)).split())


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def commune_of(lon, lat, communes):
    for c in communes:
        g = c["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        if any(point_in_ring(lon, lat, p[0]) for p in polys):
            return c["properties"]["nom"]
    # Beaches, capes and harbours often sit just outside the land polygon: take the nearest commune.
    def dist(c):
        g = c["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        return min((x - lon) ** 2 + (y - lat) ** 2 for poly in polys for x, y in poly[0])
    return min(communes, key=dist)["properties"]["nom"]


def bdtopo_places(cache):
    ids = ",".join(f"'{i}'" for _, i in BDTOPO)
    q = urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature", "outputFormat": "application/json",
                                "typeNames": "BDTOPO_V3:zone_d_activite_ou_d_interet", "cql_filter": f"cleabs IN ({ids})"})
    kinds = dict((i, k) for k, i in BDTOPO)
    out = []
    for f in fetch(f"{WFS}?{q}", cache, "bdtopo-zones.json")["features"]:
        g = f["geometry"]
        ring = max((p[0] for p in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]])), key=len)
        # The centroid of the outline (shoelace), not the mean of its corners, which follows wherever they are dense.
        a = cx = cy = 0
        for (x0, y0, *_), (x1, y1, *_) in zip(ring, ring[1:] + ring[:1]):
            w = x0 * y1 - x1 * y0
            a, cx, cy = a + w, cx + (x0 + x1) * w, cy + (y0 + y1) * w
        out.append({"nom": f["properties"]["toponyme"], "type": kinds[f["properties"]["cleabs"]], "lon": cx / (3 * a), "lat": cy / (3 * a)})
    if len(out) != len(BDTOPO):
        raise SystemExit(f"BD TOPO returned {len(out)} places for {len(BDTOPO)}")
    return out


def altitudes(points, cache):
    """IGN altimetry, 100 points per call. Sea and out-of-coverage points come back as -99999."""
    out = []
    for i in range(0, len(points), 100):
        chunk = points[i:i + 100]
        q = urllib.parse.urlencode({"lon": "|".join(f"{p[0]:.5f}" for p in chunk),
                                    "lat": "|".join(f"{p[1]:.5f}" for p in chunk),
                                    "resource": "ign_rge_alti_wld", "zonly": "true"})
        # Named after the query itself: a cache file named after the chunk index outlived a change of the
        # point list and gave every place after the communes the altitude of another place.
        name = f"alti-{hashlib.sha256(q.encode()).hexdigest()[:16]}.json"
        zs = fetch(f"{ALTI}?{q}", cache, name)["elevations"]
        if len(zs) != len(chunk):
            raise SystemExit(f"altimetry returned {len(zs)} values for {len(chunk)} points")
        out += zs
    return [None if z < -1000 else max(0, round(z)) for z in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, help="directory for downloaded files (default: fresh temp dir)")
    args = ap.parse_args()
    cache = args.cache or Path(tempfile.mkdtemp(prefix="gazetteer-"))
    cache.mkdir(parents=True, exist_ok=True)

    communes = fetch(COMMUNES, cache, "communes974.geojson")["features"]
    osm = fetch(OVERPASS, cache, "osm-places.json", data=urllib.parse.urlencode({"data": QUERY}).encode())["elements"]

    places = []
    extra = {(t, i): (nom, kind) for nom, kind, t, i in EXTRA}
    for e in osm:
        t = e["tags"]
        if (e["type"], e["id"]) in extra:
            nom, kind = extra[(e["type"], e["id"])]
            c = e.get("center") or e
            places.append({"nom": nom, "type": kind, "lon": c["lon"], "lat": c["lat"]})
            continue
        kind = next((m[t[k]] for k, m in KINDS if t.get(k) in m), None)
        c = e.get("center") or e
        if kind and norm(t["name"]) not in GENERIC:
            places.append({"nom": t["name"].strip(), "type": kind, "lon": c["lon"], "lat": c["lat"]})
    places += bdtopo_places(cache)

    # A commune is located at its main settlement (the OSM node with the same name), not at the
    # polygon centroid, which for Saint-Paul or Saint-Pierre lies far up in the hills.
    by_name = {norm(p["nom"]): p for p in places if p["type"] == "localite"}
    for c in communes:
        nom = c["properties"]["nom"]
        p = by_name.get(norm(nom))
        if p is None:
            raise SystemExit(f"no settlement node for commune {nom}")
        places.append({"nom": nom, "type": "commune", "lon": p["lon"], "lat": p["lat"],
                       "population": c["properties"].get("population")})

    # Same name within 1.5 km = same place: keep the best-ranked kind.
    places.sort(key=lambda p: RANK[p["type"]])
    kept = []
    for p in places:
        if not any(norm(q["nom"]) == norm(p["nom"]) and
                   math.hypot((q["lon"] - p["lon"]) * 104, (q["lat"] - p["lat"]) * 111) < 1.5 for q in kept):
            kept.append(p)

    for p, z in zip(kept, altitudes([(p["lon"], p["lat"]) for p in kept], cache)):
        p["altitude_m"] = 0 if z is None and p["type"] in ("plage", "cap", "baie", "port") else z
        p["commune"] = p["nom"] if p["type"] == "commune" else commune_of(p["lon"], p["lat"], communes)
        p["lon"], p["lat"] = round(p["lon"], 5), round(p["lat"], 5)

    names = {norm(p["nom"]) for p in kept}
    aliases = {}
    for alias, target in ALIASES.items():
        if norm(target) not in names:
            raise SystemExit(f"alias target missing: {target}")
        aliases[alias] = target

    out = ROOT / "src" / "places" / "gazetteer.json"
    out.write_text(json.dumps({
        "attribution": "© contributeurs OpenStreetMap (ODbL)\u00a0; IGN BD TOPO, RGE ALTI et geo.api.gouv.fr (Licence Ouverte 2.0)",
        "places": kept, "aliases": aliases}, ensure_ascii=False, separators=(",", ":")))
    counts = {}
    for p in kept:
        counts[p["type"]] = counts.get(p["type"], 0) + 1
    print(out, len(kept), counts, f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
