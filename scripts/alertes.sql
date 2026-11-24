-- The alerts on the phone (src/push/abonnements.ts), in the D1 database bound as AVIS in wrangler.jsonc. Safe to run again.
-- Production: npx wrangler d1 execute rundata-transports --remote --file scripts/alertes.sql
-- Trial Worker: npx wrangler d1 execute rundata-essai -c wrangler.essai.jsonc --remote --file scripts/alertes.sql
--
-- abonnements: one row a browser that asked for the alerts: the address its push service made (opaque, proper to that
-- browser), and the two keys that encrypt the messages for it. Nothing else: no date, commune, IP address nor device.
-- « Ne plus recevoir », or a 404 or 410 of the push service, deletes the row.
CREATE TABLE IF NOT EXISTS abonnements (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
-- alertes_envoyees: one row a change sent (« vigilance:2026-11-24T12:00Z:pluie:3 », « volcan:Alerte 1:2026-11-24 »),
-- written by INSERT OR IGNORE before a send, so that two scheduled events never send the same change twice. No personal
-- data. Rows older than a year are deleted by the scheduled event.
CREATE TABLE IF NOT EXISTS alertes_envoyees (
  cle TEXT PRIMARY KEY,
  envoyee TEXT NOT NULL
);
