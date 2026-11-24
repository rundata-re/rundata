-- The sea's history in the D1 database rundata-climat, beside postes/jours/records (scripts/build-mer.py writes the rows).
-- mer_points: one row per buoy or beach, its first and last year, its fields and whom to credit.
-- mer_jour: one row per source, point and year, as `jours`: data = JSON {field: [value of each day of the year, or null]},
-- the index being the day of the year minus one (La Réunion), trailing nulls dropped.
-- Sources: candhis (waves measured at the Candhis buoys, Cerema, Licence Ouverte 2.0: hs_moy, hs_max, hmax, per_moy, n),
-- crw (NOAA Coral Reef Watch CoralTemp, public domain, from 01/01/2003: sst, ecart = gap to NOAA's reference).
-- WITHOUT ROWID: a row written is one row counted by D1.
CREATE TABLE IF NOT EXISTS mer_points (source TEXT NOT NULL, point TEXT NOT NULL, nom TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, debut INTEGER NOT NULL, fin INTEGER NOT NULL, params TEXT NOT NULL, credit TEXT NOT NULL, PRIMARY KEY (source, point)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS mer_jour (source TEXT NOT NULL, point TEXT NOT NULL, annee INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (source, point, annee)) WITHOUT ROWID;
