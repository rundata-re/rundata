#!/usr/bin/env python3
"""The places we give against a second source, every Monday (.github/workflows/listes.yml):

  - each office of the annuaire of service-public.fr at La Réunion, at its position, against its address geocoded by the
    Base adresse nationale (the Géoplateforme's geocoder, one request for all the addresses);
  - each commune's point in src/places/gazetteer.json (its main settlement, OSM's) against its town hall in OpenStreetMap
    (one Overpass request);
  - each bus stop of the island's GTFS (the networks of scripts/build-transit.py, one download each) against OSM's bus
    stops (the same Overpass request): only the few a producer may have misplaced are watched, see cas_reseau().

The gaps found today are in scripts/positions-reference.json. The job fails only on a gap that is new, or that grew by
more than MARGE metres since: the failure is the alert, someone looks at the place and says it to its producer, or
rebuilds the list. A bus stop is a case or not: only a new case fails. A gap of the reference that closed is printed, without failing. Each source that does not answer is
said, and fails the step: no gap is read from a missing source.

Usage: python3 -I scripts/verifier-positions.py --verifier      # compare with the reference, exit 1 on a new gap
       python3 -I scripts/verifier-positions.py --ecrire        # rewrite the reference with today's gaps, and the town
                                                                # halls of src/places/mairies-osm.json
"""
import argparse
import csv
import importlib.util
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "scripts" / "positions-reference.json"
# Each commune's town hall in OpenStreetMap (ODbL), which the site gives instead of the annuaire's point when the two lie
# more than 300 m apart and the Base adresse nationale agrees with OSM (src/providers/annuaire.ts); rewritten by --ecrire.
MAIRIES_OSM = ROOT / "src" / "places" / "mairies-osm.json"
UA = (Path(__file__).parent / "user-agent.txt").read_text(encoding="ascii").strip()
TIMEOUT = 90

ANNUAIRE = (
    "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json"
    "?where=" + urllib.parse.quote('startswith(code_insee_commune,"974")') + "&select=id,nom,adresse,code_insee_commune"
)
GEOCODAGE_CSV = "https://data.geopf.fr/geocodage/search/csv"
OVERPASS = "https://overpass-api.de/api/interpreter"
# One Overpass request for both: the town halls, and the bus stops (a stop drawn as a node, or a platform for buses).
OSM_LIEUX = (
    '[out:json][timeout:90][bbox:-21.40,55.20,-20.86,55.84];'
    '(nwr["amenity"="townhall"];nwr["highway"="bus_stop"];nwr["public_transport"="platform"]["bus"="yes"];);out center tags;'
)

# An office further than this from its address, a commune's point further than this from its town hall: a gap.
ECART_ANNUAIRE_M = 300
ECART_CENTRE_M = 1000
# What a gap of the reference may grow by before it fails: the Base adresse nationale's answer moves a little from one
# week to the next (another number found, a score), and a new gap must clear the threshold by as much.
MARGE = 100


def km(lon1, lat1, lon2, lat2):
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


# The waits before asking again a server that says it is busy, each twice the one before, as Overpass asks (« Retry your
# request using exponential backoff », its 502 of 24/11/2026, « All query workers are busy and the request queue is
# full »): five tries over 7.5 minutes at most, within the job's 30.
ATTENTES = (30, 60, 120, 240)


def get(url, data=None, headers=None):
    """One request; asked again after each of ATTENTES while the server says it is busy (Overpass often does)."""
    for attente in (*ATTENTES, None):
        req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if attente is None or e.code not in (429, 502, 503, 504):
                raise
            print(f"{urllib.parse.urlsplit(url).netloc} occupé (HTTP {e.code}), nouvel essai dans {attente} s", flush=True)
            time.sleep(attente)


def nombre(s):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def lignes_csv(text):
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    if not rows:
        return []
    head = [h.strip().lower() for h in rows[0]]
    return [dict(zip(head, r)) for r in rows[1:]]


def bureaux():
    """The annuaire's offices of La Réunion with a position and an address: id, name, position, address, commune."""
    out = []
    for r in json.loads(get(ANNUAIRE)):
        try:
            adresses = json.loads(r.get("adresse") or "[]")
        except ValueError:
            continue
        a = next((x for x in adresses if x.get("type_adresse") == "Adresse"), adresses[0] if adresses else {})
        lon, lat = nombre(a.get("longitude")), nombre(a.get("latitude"))
        voie = " ".join(x for x in (a.get("numero_voie", "").strip(), a.get("code_postal", "").strip(), a.get("nom_commune", "").strip()) if x)
        if lon is None or lat is None or not a.get("numero_voie", "").strip():
            continue
        out.append({"id": r["id"], "nom": r.get("nom", "").strip(), "lon": lon, "lat": lat, "q": voie, "citycode": r.get("code_insee_commune", "")})
    return out


def geocoder(rows):
    """Each address as the Base adresse nationale places it: (type, score, lon, lat) by row, None when not found."""
    body = io.StringIO()
    w = csv.writer(body, lineterminator="\n")
    w.writerow(["q", "citycode"])
    for r in rows:
        w.writerow([r["q"], r["citycode"]])
    limite = "----" + uuid.uuid4().hex
    parts = []
    for name, value in (("columns", "q"), ("citycode", "citycode"), ("result_columns", "result_type"), ("result_columns", "result_score"),
                        ("result_columns", "longitude"), ("result_columns", "latitude")):
        parts.append(f'--{limite}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n')
    parts.append(f'--{limite}\r\nContent-Disposition: form-data; name="data"; filename="adresses.csv"\r\nContent-Type: text/csv\r\n\r\n{body.getvalue()}\r\n--{limite}--\r\n')
    text = get(GEOCODAGE_CSV, "".join(parts).encode("utf-8"), {"Content-Type": f"multipart/form-data; boundary={limite}"}).decode("utf-8")
    out = []
    for g in lignes_csv(text):
        lon, lat = nombre(g.get("longitude")), nombre(g.get("latitude"))
        out.append(None if lon is None or lat is None else (g.get("result_type", ""), nombre(g.get("result_score")) or 0, lon, lat))
    if len(out) != len(rows):
        raise RuntimeError(f"géocodage : {len(out)} lignes pour {len(rows)} adresses")
    return out


def ecarts_annuaire():
    rows = bureaux()
    ecarts = {}
    for r, g in zip(rows, geocoder(rows)):
        if g is None:
            continue
        m = round(km(r["lon"], r["lat"], g[2], g[3]) * 1000)
        if m > ECART_ANNUAIRE_M:
            ecarts[r["id"]] = {"nom": r["nom"], "ecart_m": m, "adresse": r["q"], "ban": f"{g[0]} {g[1]:.2f}"}
    return len(rows), ecarts


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^(le|la|les|l) ", "", s)


def commune_de(nom):
    """The commune a town hall's name says: « Mairie de Saint-Paul », « Hôtel de ville de Saint-Denis »; None for an annex."""
    n = re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", nom or "").encode("ascii", "ignore").decode().lower()).strip()
    m = re.match(r"^(mairie|hotel de ville) (de |du |des |d )?(.+)$", n)
    if not m or "annexe" in n:
        return None
    return norm(("le " if m.group(2) == "du " else "") + m.group(3))


HOTELS = {}  # by commune: its town hall in OSM nearest its point, as ecarts_centres() found it (lon, lat, osm id)


def ecarts_centres():
    communes = [p for p in json.loads((ROOT / "src" / "places" / "gazetteer.json").read_text())["places"] if p["type"] == "commune"]
    mairies = {}
    for e in lieux_osm():
        t = e.get("tags", {})
        if t.get("amenity") != "townhall" or t.get("townhall:type") == "annex":
            continue
        c = commune_de(t.get("name"))
        p = e.get("center") or e
        if c and "lon" in p:
            mairies.setdefault(c, []).append((p["lon"], p["lat"], f'{e["type"]}/{e["id"]}'))
    ecarts = {}
    for c in communes:
        found = mairies.get(norm(c["nom"]), [])
        if not found:
            ecarts[c["nom"]] = {"ecart_m": None, "mairie": "aucune mairie de ce nom dans OSM"}
            continue
        lon, lat, osm = min(found, key=lambda m: km(c["lon"], c["lat"], m[0], m[1]))
        HOTELS[c["nom"]] = (lon, lat, osm)
        m = round(km(c["lon"], c["lat"], lon, lat) * 1000)
        if m > ECART_CENTRE_M:
            ecarts[c["nom"]] = {"ecart_m": m, "mairie": osm}
    return len(communes), ecarts


_OSM = []
_OSM_ECHEC = []


def lieux_osm():
    """OpenStreetMap's town halls and bus stops of the island, read once for both steps; a failure too, said by both."""
    if _OSM_ECHEC:
        raise _OSM_ECHEC[0]
    if not _OSM:
        try:
            _OSM.extend(json.loads(get(OVERPASS, urllib.parse.urlencode({"data": OSM_LIEUX}).encode()))["elements"])
        except Exception as e:
            _OSM_ECHEC.append(e)
            raise
    return _OSM


# The bus stops. The producers' positions hold (24/11/2026: 99.6 % of the 9,942 stops within 30 m of the shape of the
# trips that serve them) and OSM knows fewer than half of them: a stop absent from OSM is no alert. What is watched is
# the few stops a producer may have misplaced, by three signs:
#   - suspect: no OSM stop within ECART_ARRET_M, and the order gives it away: along the shape of a trip, its position goes
#     back by more than RECUL_M between the stop before and the one after, or the detour it makes is more than DETOUR
#     times the direct way between them. A sign, not a proof: it also catches loops and terminuses, hence the reference;
#   - homonyme: no OSM stop within ECART_ARRET_M, but one of the same name within HOMONYME_M: one of the two is off;
#   - doublon: two stops of one network, of different names, at exactly the same point.
# The reference holds those of 24/11/2026; only a new one fails. The Papang cable car is no bus.
ECART_ARRET_M = 300
HOMONYME_M = 1000
RECUL_M = 200
DETOUR = 3


def reseaux():
    """The GTFS networks of scripts/build-transit.py, the one list of their links."""
    spec = importlib.util.spec_from_file_location("build_transit", Path(__file__).parent / "build-transit.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return [(n[0], n[1], n[3]) for n in mod.NETWORKS if n[0] != "papang"]


def nom_arret(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(arret|station|gare routiere|quai [a-z0-9]+|\(.*?\))\b", " ", s)
    s = re.sub(r"\bst\b", "saint", s)
    s = re.sub(r"\bste\b", "sainte", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def gtfs_table(z, name):
    names = {Path(n).name: n for n in z.namelist()}
    return list(csv.DictReader(io.TextIOWrapper(z.open(names[name]), encoding="utf-8-sig"))) if name in names else []


def metres_xy(lat):
    """Metres per degree of longitude and of latitude, here: a local flat projection, right to a metre over a few km."""
    return math.cos(math.radians(lat)) * 111320, 110540


def le_long(pts, cum, lon, lat):
    """How far along a shape (its points, their running length) a point projects, where it is nearest the shape."""
    kx, ky = metres_xy(lat)
    best = None
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        ax, ay, bx, by = (a[0] - lon) * kx, (a[1] - lat) * ky, (b[0] - lon) * kx, (b[1] - lat) * ky
        dx, dy = bx - ax, by - ay
        t = 0 if dx == dy == 0 else max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        d = math.hypot(ax + t * dx, ay + t * dy)
        if best is None or d < best[0] - 1:
            best = (d, cum[i] + t * (cum[i + 1] - cum[i]))
    return best[1]


def cas_reseau(net, label, z, osm_pres, osm_noms):
    """The suspect, homonym and duplicate stops of one network's GTFS (a ZipFile)."""
    st = {s["stop_id"]: s for s in gtfs_table(z, "stops.txt") if (s.get("location_type") or "0") in ("0", "")}
    pos = {k: (float(s["stop_lon"]), float(s["stop_lat"])) for k, s in st.items()}
    cas = {}

    def autour(lon, lat):
        """The nearest OSM stop of any name, and the nearest of the stop's name, in metres (None when there is none)."""
        cx, cy = int(lon / 0.01), int(lat / 0.01)
        near = [o for dx in (-3, -2, -1, 0, 1, 2, 3) for dy in (-3, -2, -1, 0, 1, 2, 3) for o in osm_pres.get((cx + dx, cy + dy), ())]
        return min((km(lon, lat, o[0], o[1]) * 1000 for o in near), default=None)

    loin = {}
    for k, (lon, lat) in pos.items():
        m = autour(lon, lat)
        if m is None or m > ECART_ARRET_M:
            loin[k] = m
    for k, m in loin.items():
        lon, lat = pos[k]
        same = min((km(lon, lat, o[0], o[1]) * 1000 for o in osm_noms.get(nom_arret(st[k]["stop_name"]), ())), default=None)
        if same is not None and same <= HOMONYME_M:
            cas[f"{net}:{k}"] = {"cas": "homonyme", "reseau": label, "nom": st[k]["stop_name"].strip(), "lon": lon, "lat": lat, "osm_m": round(same)}

    # The order of the stops, only around the far ones: each trip pattern once.
    shapes = defaultdict(list)
    for p in gtfs_table(z, "shapes.txt"):
        shapes[p["shape_id"]].append((int(p["shape_pt_sequence"]), float(p["shape_pt_lon"]), float(p["shape_pt_lat"])))
    longueurs = {}
    for sh, l in shapes.items():
        pts = [(x, y) for _, x, y in sorted(l)]
        cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            kx, ky = metres_xy(a[1])
            cum.append(cum[-1] + math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky))
        longueurs[sh] = (pts, cum)
    trips = {t["trip_id"]: t.get("shape_id") for t in gtfs_table(z, "trips.txt")}
    seq = defaultdict(list)
    for r in gtfs_table(z, "stop_times.txt"):
        seq[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"]))
    motifs = {(tuple(s for _, s in sorted(l) if s in pos), trips.get(tid)) for tid, l in seq.items()}
    signes, le_long_de = defaultdict(set), {}

    def position(sh, k):
        if (sh, k) not in le_long_de:
            le_long_de[(sh, k)] = le_long(*longueurs[sh], *pos[k])
        return le_long_de[(sh, k)]

    for ids, sh in motifs:
        for i in range(1, len(ids) - 1):
            a, s, b = ids[i - 1], ids[i], ids[i + 1]
            if s not in loin:
                continue
            direct = km(*pos[a], *pos[b])
            if direct > 0.05 and (km(*pos[a], *pos[s]) + km(*pos[s], *pos[b])) / direct > DETOUR:
                signes[s].add("détour")
            if sh in longueurs:
                pa, ps, pb = (position(sh, x) for x in (a, s, b))
                if ps < pa - RECUL_M and pb > pa:
                    signes[s].add("hors d'ordre sur le tracé")
    for k, sg in signes.items():
        cas.setdefault(f"{net}:{k}", {"cas": "soupçon", "reseau": label, "nom": st[k]["stop_name"].strip(), "lon": pos[k][0], "lat": pos[k][1],
                                       "osm_m": None if loin[k] is None else round(loin[k]), "signe": ", ".join(sorted(sg))})

    # Two names at one point: one of the two stops is misplaced.
    par_point = defaultdict(list)
    for k, s in st.items():
        par_point[pos[k]].append(k)
    for (lon, lat), ks in par_point.items():
        noms = {nom_arret(st[k]["stop_name"]) for k in ks}
        if len(noms) > 1:
            cas[f"{net}:{'+'.join(sorted(ks))}"] = {"cas": "doublon", "reseau": label, "nom": " / ".join(sorted({st[k]["stop_name"].strip() for k in ks})), "lon": lon, "lat": lat}
    return len(st), cas


def cas_arrets():
    osm_pres, osm_noms = defaultdict(list), defaultdict(list)
    for e in lieux_osm():
        t = e.get("tags", {})
        if not (t.get("highway") == "bus_stop" or (t.get("public_transport") == "platform" and t.get("bus") == "yes")):
            continue
        p = e.get("center") or e
        if "lon" not in p:
            continue
        o = (p["lon"], p["lat"])
        osm_pres[(int(o[0] / 0.01), int(o[1] / 0.01))].append(o)
        if t.get("name"):
            osm_noms[nom_arret(t["name"])].append(o)
    n, cas = 0, {}
    for net, label, url in reseaux():
        k, c = cas_reseau(net, label, zipfile.ZipFile(io.BytesIO(get(url))), osm_pres, osm_noms)
        n += k
        cas.update(c)
    return n, cas


def comparer_arrets(avant, maintenant):
    """A stop's case is new or not: the position of a stop does not « grow ». A case that went is said."""
    echecs = [f"arrêts : nouveau cas, {k} {json.dumps(v, ensure_ascii=False)}" for k, v in sorted(maintenant.items()) if k not in avant]
    for k in sorted(set(avant) - set(maintenant)):
        print(f"arrêts : cas fermé, {k} ({avant[k].get('reseau')}, {avant[k].get('nom')}, {avant[k].get('cas')})")
    return echecs


def comparer(titre, avant, maintenant, seuil):
    """The new or grown gaps (failures), the closed ones (said), against the reference."""
    echecs = []
    for k, v in sorted(maintenant.items(), key=lambda kv: -(kv[1]["ecart_m"] or 10**9)):
        ref = avant.get(k)
        m = v["ecart_m"]
        if ref is None:
            if m is None or m > seuil + MARGE:
                echecs.append(f"{titre} : nouvel écart, {k} {json.dumps(v, ensure_ascii=False)}")
        elif m is not None and ref.get("ecart_m") is not None and m > ref["ecart_m"] + MARGE:
            echecs.append(f"{titre} : écart qui grandit, {k} de {ref['ecart_m']} à {m} m {json.dumps(v, ensure_ascii=False)}")
        elif m is None and ref.get("ecart_m") is not None:
            echecs.append(f"{titre} : {k} {v['mairie']}")
    for k in sorted(set(avant) - set(maintenant)):
        print(f"{titre} : écart fermé, {k} ({avant[k].get('nom', k)}, {avant[k].get('ecart_m')} m dans la référence)")
    return echecs


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--verifier", action="store_true")
    g.add_argument("--ecrire", action="store_true")
    args = ap.parse_args()

    out, erreurs = {}, []
    for cle, lire in (("annuaire", ecarts_annuaire), ("centres", ecarts_centres), ("arrets", cas_arrets)):
        try:
            n, out[cle] = lire()
            print(f"{cle} : {n} lus, {len(out[cle])} écarts")
        except Exception as e:  # noqa: BLE001 — a source that does not answer is said, never read as « no gap »
            erreurs.append(f"{cle} : la source n'a pas répondu ({type(e).__name__}: {e})")

    if args.ecrire:
        if erreurs:
            sys.exit("\n".join(erreurs))
        REFERENCE.write_text(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
        print(f"référence écrite : {REFERENCE.relative_to(ROOT)}")
        jour = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 4 * 3600))  # the day at La Réunion (UTC+4, no DST)
        MAIRIES_OSM.write_text(json.dumps({
            "construit": jour,
            "source": "OpenStreetMap, amenity=townhall (Overpass), annexes exclues",
            "licence": "ODbL 1.0",
            "mairies": {c: {"lon": round(lon, 6), "lat": round(lat, 6), "osm": osm} for c, (lon, lat, osm) in sorted(HOTELS.items())},
        }, ensure_ascii=False, indent=1) + "\n")
        print(f"hôtels de ville écrits : {MAIRIES_OSM.relative_to(ROOT)} ({len(HOTELS)})")
        return

    ref = json.loads(REFERENCE.read_text())
    echecs = list(erreurs)
    if "annuaire" in out:
        echecs += comparer("annuaire", ref.get("annuaire", {}), out["annuaire"], ECART_ANNUAIRE_M)
    if "centres" in out:
        echecs += comparer("centres", ref.get("centres", {}), out["centres"], ECART_CENTRE_M)
    if "arrets" in out:
        echecs += comparer_arrets(ref.get("arrets", {}), out["arrets"])
    for e in echecs:
        print(e)
    if echecs:
        sys.exit(1)
    print("aucun écart nouveau")


if __name__ == "__main__":
    main()
