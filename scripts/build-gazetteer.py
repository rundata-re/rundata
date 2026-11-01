#!/usr/bin/env python3
"""Build src/places/gazetteer.json: every named place a person might ask about in La Réunion.

Sources:
  - communes: geo.api.gouv.fr (contours, Licence Ouverte) — also used to tag each place with its commune
  - places, beaches, peaks, viewpoints, pools: OpenStreetMap via Overpass (ODbL)
  - every named place of IGN's BD TOPO a person may ask about (BDTOPO, by rule), via the Géoplateforme WFS (Licence
    Ouverte), merged with OSM's of the same name within 1.5 km
  - altitude of every point: IGN RGE ALTI via the Géoplateforme altimetry API (Licence Ouverte)

Usage: python3 -I scripts/build-gazetteer.py [--cache DIR] [--overpass URL]
"""
import argparse
import hashlib
import json
import math
import re
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

# IGN's BD TOPO, every named object of its layers that a person may ask about, by rule: in each layer, the kind of a
# nature (or of a nature and its detailed nature, which wins), the others left out. Left out on purpose: schools,
# churches, offices, homes, residences and housing estates, many and asked about by nobody for the weather or the sea.
BDTOPO = {
    "zone_d_activite_ou_d_interet": {
        ("Espace public", "Parc"): "parc", ("Espace public", "Jardin botanique"): "parc",
        ("Espace public", "Jardin public"): "parc", ("Espace public", "Square"): "parc",
        ("Espace public", "Arboretum"): "parc", ("Espace public", "Esplanade"): "site", ("Espace public", "Place"): "site",
        "Aire de détente": "parc", "Parc de loisirs": "parc", "Parc zoologique": "site", "Parc des expositions": "site",
        "Point de vue": "point_de_vue", "Musée": "site", "Ecomusée": "site", "Monument": "site", "Camping": "site",
        "Refuge": "site", "Maison du parc": "site", "Sentier de découverte": "site",
        ("Hébergement de loisirs", "Gîte d'étape"): "site",
        ("Salle de spectacle ou conférence", "Théâtre"): "site", ("Salle de spectacle ou conférence", "Salle de spectacle"): "site",
        ("Salle de spectacle ou conférence", "Centre culturel"): "site", ("Salle de spectacle ou conférence", "Cinéma"): "site",
        "Site de vol libre": "site", "Site d'escalade": "site", ("Usine", "Sucrerie"): "site",
        "Stade": "equipement", "Piscine": "equipement", "Golf": "equipement", "Baignade surveillée": "equipement",
        "Hôpital": "equipement", ("Etablissement hospitalier", ""): "equipement", "Etablissement thermal": "equipement",
        "Marché": "equipement", ("Divers commercial", "Centre commercial"): "equipement",
        "Zone industrielle": "lieu_dit", ("Divers commercial", "Zone commerciale"): "lieu_dit",
    },
    "zone_d_habitation": {"Lieu-dit habité": "quartier", ("Quartier", "Quartier urbain"): "quartier",
                          ("Quartier", ""): "quartier", "Ruines": "site", "Château": "site", "Moulin": "site"},
    # Not its woods (« Grand Bois », a wood of Saint-Denis, is not the quartier of Saint-Pierre).
    "lieu_dit_non_habite": {"Lieu-dit non habité": "lieu_dit"},
    "detail_orographique": {
        "Pic": "sommet", "Sommet": "sommet", "Volcan": "sommet", "Cap": "cap", "Plage": "plage",
        **{n: "lieu_dit" for n in ("Plaine", "Versant", "Crête", "Col", "Cirque", "Vallée", "Gorge", "Escarpement",
                                   "Dépression", "Grotte", "Rochers", "Récif", "Ile")},
    },
    "detail_hydrographique": {"Cascade": "bassin", "Baie": "baie"},
    "plan_d_eau": {n: "bassin" for n in ("Ravine", "Mare", "Retenue", "Lac", "Ecoulement naturel")},
    # Rivers and ravines have no nature: all of them, about the middle of their course.
    "cours_d_eau": {None: "ravine"},
    "equipement_de_transport": {"Gare routière": "equipement", "Port": "port", "Gare téléphérique": "equipement"},
    # The named roads, not the streets, lanes and paths of the layer.
    "route_numerotee_ou_nommee": {"Route nommée": "route"},
}
ROAD = re.compile(r"^(?:(?:nouvelle|ancienne) )?route\b", re.I)
# How the BD TOPO ranks a name, 1 the best known: among places of a kind that share a name, the best known comes first,
# which the resolver keeps when nothing else tells them apart. OSM's places, that have none, are put in the middle.
IMPORTANCE = 5
# The national roads (RN1, RN2…), from the segments of the road layer that carry their number, about the middle of
# them all; the numbers of the 900000s are the slip roads and junctions.
NATIONAL = re.compile(r"^N(\d{1,4}[A-Z]?)$")

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
        "port": 7, "baie": 8, "cap": 9, "lieu_dit": 10, "aeroport": 11, "parc": 12, "site": 13, "equipement": 14,
        "ravine": 15, "route": 16}

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
    # The mountain, not the quartier of Saint-Joseph below it.
    "Dimitile": "Le Dimitile",
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


def wfs(layer, cache, cql, props=None):
    """Every object of a BD TOPO layer in La Réunion matching `cql`, 5000 at a time."""
    out = []
    while True:
        q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "outputFormat": "application/json",
             "typeNames": f"BDTOPO_V3:{layer}", "sortBy": "cleabs", "count": 5000, "startIndex": len(out),
             "cql_filter": f"{cql} AND BBOX(geometrie,55.20,-21.40,55.84,-20.86,'CRS:84')"}
        if props:
            q["propertyName"] = props
        page = fetch(f"{WFS}?{urllib.parse.urlencode(q)}", cache, f"bdtopo-{layer}-{hashlib.sha256(cql.encode()).hexdigest()[:8]}-{len(out)}.json")
        out += page["features"]
        if len(out) >= page["numberMatched"]:
            return out


def middle(g):
    """A point for an outline (the centroid of its largest ring), a line (on it, about its middle) or a point."""
    if g["type"] == "Point":
        return g["coordinates"][:2]
    if g["type"] in ("Polygon", "MultiPolygon"):
        ring = max((p[0] for p in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]])), key=len)
        # The centroid of the outline (shoelace), not the mean of its corners, which follows wherever they are dense.
        a = cx = cy = 0
        for (x0, y0, *_), (x1, y1, *_) in zip(ring, ring[1:] + ring[:1]):
            w = x0 * y1 - x1 * y0
            a, cx, cy = a + w, cx + (x0 + x1) * w, cy + (y0 + y1) * w
        return [cx / (3 * a), cy / (3 * a)]
    lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    return on_line([seg for line in lines for seg in zip(line, line[1:])])


def on_line(segs):
    """A point of segments ((x0, y0), (x1, y1)) in no order (a road's, a river's parts): the end of a segment nearest
    their centre, weighted by length, so that it is on the road or the river, about the middle of it."""
    km = lambda s: math.hypot((s[1][0] - s[0][0]) * 104, (s[1][1] - s[0][1]) * 111)
    w = sum(map(km, segs)) or 1
    cx = sum(km(s) * (s[0][0] + s[1][0]) / 2 for s in segs) / w
    cy = sum(km(s) * (s[0][1] + s[1][1]) / 2 for s in segs) / w
    return list(min((q[:2] for s in segs for q in s), key=lambda q: (q[0] - cx) ** 2 + (q[1] - cy) ** 2))


def bdtopo_places(cache):
    out = []
    for layer, kinds in BDTOPO.items():
        for f in wfs(layer, cache, "toponyme IS NOT NULL"):
            p = f["properties"]
            nature = p.get("nature") or p.get("type_de_route")
            kind = kinds.get((nature, p.get("nature_detaillee") or ""), kinds.get(nature))
            nom = p["toponyme"].strip()
            imp = int(p.get("importance") or IMPORTANCE)
            if not kind or (kind == "route" and not ROAD.match(nom)) or norm(nom) in GENERIC or not f["geometry"]:
                continue
            # A name of one word is a common one as often as not (« École », « le Barrage », « la Pente »): taken only
            # when the BD TOPO ranks it well known; and not the small quartiers, named as their residences.
            if (len(re.sub(r"^(le|la|les|l) ", "", norm(nom)).split()) == 1 and imp > 3) or (layer == "zone_d_habitation" and imp > 5):
                continue
            lon, lat = middle(f["geometry"])
            # As the BD TOPO writes them, a capital first (« le Gol les Hauts »: « Le Gol les Hauts »).
            out.append({"nom": nom[0].upper() + nom[1:], "type": kind, "lon": lon, "lat": lat, "importance": imp})
    roads = {}
    for f in wfs("troncon_de_route", cache, "cpx_classement_administratif LIKE 'Nationale%'", "cpx_numero,geometrie"):
        m = NATIONAL.match(f["properties"].get("cpx_numero") or "")
        if m and f["geometry"]:
            g = f["geometry"]
            lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
            roads.setdefault(m[1], []).extend(seg for line in lines for seg in zip(line, line[1:]))
    for n, segs in sorted(roads.items()):
        lon, lat = on_line(segs)
        out.append({"nom": f"RN{n}", "type": "route", "lon": lon, "lat": lat, "importance": IMPORTANCE})
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
    ap.add_argument("--overpass", default=OVERPASS, help="an Overpass API, when the main one is full (another instance)")
    args = ap.parse_args()
    cache = args.cache or Path(tempfile.mkdtemp(prefix="gazetteer-"))
    cache.mkdir(parents=True, exist_ok=True)

    communes = fetch(COMMUNES, cache, "communes974.geojson")["features"]
    osm = fetch(args.overpass, cache, "osm-places.json", data=urllib.parse.urlencode({"data": QUERY}).encode())["elements"]

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

    # Same name within 1.5 km = same place: keep the best-ranked kind, and of a kind the best known (OSM's, when the
    # BD TOPO has it too, keeps its place among OSM's).
    places.sort(key=lambda p: (RANK[p["type"]], p.get("importance", IMPORTANCE)))
    kept = []
    for p in places:
        same = next((q for q in kept if norm(q["nom"]) == norm(p["nom"]) and
                     math.hypot((q["lon"] - p["lon"]) * 104, (q["lat"] - p["lat"]) * 111) < 1.5), None)
        if same is None:
            kept.append(p)
        elif "importance" not in p:
            same["osm"] = True

    ign = {}
    for p, z in zip(kept, altitudes([(p["lon"], p["lat"]) for p in kept], cache)):
        p["altitude_m"] = 0 if z is None and p["type"] in ("plage", "cap", "baie", "port") else z
        p["commune"] = p["nom"] if p["type"] == "commune" else commune_of(p["lon"], p["lat"], communes)
        p["lon"], p["lat"] = round(p["lon"], 5), round(p["lat"], 5)
        ign[id(p)] = p.pop("importance", None) is not None and not p.pop("osm", False)
        p.pop("osm", None)

    names = {norm(p["nom"]) for p in kept}
    aliases = {}
    for alias, target in ALIASES.items():
        if norm(target) not in names:
            raise SystemExit(f"alias target missing: {target}")
        aliases[alias] = target
    # A national road by its other spellings: « RN 1 », « N1 », « route nationale 1 ».
    for p in kept:
        if p["type"] == "route" and p["nom"].startswith("RN"):
            n = p["nom"][2:]
            for alias in (f"RN {n}", f"N{n}", f"Route nationale {n}"):
                aliases.setdefault(alias, p["nom"])

    out = ROOT / "src" / "places" / "gazetteer.json"
    out.write_text(json.dumps({
        "attribution": "© contributeurs OpenStreetMap (ODbL)\u00a0; IGN BD TOPO, RGE ALTI et geo.api.gouv.fr (Licence Ouverte 2.0)",
        # The places of the BD TOPO that OSM does not have apart: the news (providers/actualites.ts) look for OSM's
        # only in the articles, the BD TOPO's many lieux-dits would find a commune in common words.
        "places": [p for p in kept if not ign[id(p)]], "places_ign": [p for p in kept if ign[id(p)]],
        "aliases": aliases}, ensure_ascii=False, separators=(",", ":")))
    counts = {}
    for p in kept:
        counts[p["type"]] = counts.get(p["type"], 0) + 1
    print(out, len(kept), counts, f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
