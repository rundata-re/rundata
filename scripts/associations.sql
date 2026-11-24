-- The declared associations of La Réunion, from the Répertoire national des associations (RNA, ministère de
-- l'Intérieur, Licence Ouverte 2.0), for /associations and the tool annuaire_services_publics (src/vie/associations.ts).
-- In the D1 database rundata-transports, bound as AVIS in wrangler.jsonc, next to the clubs and the proposals, which these
-- tables never touch. Safe to run again: it creates what is missing and changes nothing else.
-- npx wrangler d1 execute rundata-transports --remote --file scripts/associations.sql
--
-- associations: the active ones (position A) whose seat is in one of the 24 communes, one row each, filled by
-- scripts/build-associations.py (.github/workflows/associations.yml). Only what the RNA publishes about the association
-- itself: its number (id, « W974… »), its title, its object, its commune's INSEE code, its date of creation, its site
-- (an http(s) address of a valid form, never read). NEVER the address of its seat (often a home), nor its
-- management address (adrg_*), nor the civility of its director (dir_civilite), nor the free « observation ».
CREATE TABLE IF NOT EXISTS associations (
  id TEXT PRIMARY KEY,
  titre TEXT NOT NULL,
  objet TEXT NOT NULL DEFAULT '',
  insee TEXT NOT NULL,
  creee TEXT,
  site TEXT
);
-- A commune's list, in the order of its titles: the rows shown are about the rows read.
CREATE INDEX IF NOT EXISTS associations_commune ON associations (insee, titre);
-- The search by word, in the title and the object, accents left aside (« eglise » finds « Église »). Its content is the
-- table above, kept in step by the three triggers below: an import writes only what changed (scripts/build-associations.py),
-- never the whole table again, nor a rebuild of the index.
CREATE VIRTUAL TABLE IF NOT EXISTS associations_mots USING fts5 (
  titre, objet, content = 'associations', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS associations_mots_ajout AFTER INSERT ON associations BEGIN
  INSERT INTO associations_mots (rowid, titre, objet) VALUES (new.rowid, new.titre, new.objet);
END;
CREATE TRIGGER IF NOT EXISTS associations_mots_retrait AFTER DELETE ON associations BEGIN
  INSERT INTO associations_mots (associations_mots, rowid, titre, objet) VALUES ('delete', old.rowid, old.titre, old.objet);
END;
-- Only when the words change: a new site or commune leaves the index as it is.
CREATE TRIGGER IF NOT EXISTS associations_mots_modif AFTER UPDATE OF titre, objet ON associations BEGIN
  INSERT INTO associations_mots (associations_mots, rowid, titre, objet) VALUES ('delete', old.rowid, old.titre, old.objet);
  INSERT INTO associations_mots (rowid, titre, objet) VALUES (new.rowid, new.titre, new.objet);
END;
-- The file imported: « fichier », the date in its name (« 2026-10-01 » for rna_waldec_20261001.zip), which the import
-- compares; « maj », its newest row's day (« 2026-09-30 »), which the page says; « importe_le »,
-- when. Written last by an import: an import cut short leaves the older date, and the next run starts again.
CREATE TABLE IF NOT EXISTS associations_import (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
