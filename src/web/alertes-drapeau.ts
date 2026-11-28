/**
 * Whether the alerts on the phone answer (web/alertes.ts). Open in production since the words of the page, of the
 * notifications and of the privacy page were agreed (25/11/2026, the notifications' lines reworded 27/11), the sends
 * tried end to end on a phone (27/11, the trial Worker), and the D1 tables (scripts/alertes.sql) and the secret
 * VAPID_PRIVE set. Without that secret, GET /alertes/cle answers 503 and the button says the alerts are unavailable.
 * Set back to false, nothing of it shows and its addresses answer 404; the KV key alertes:pause (push/envoi.ts) stops
 * the sends alone, without a deploy.
 *
 * The trial Worker (wrangler.essai.jsonc: its own address on workers.dev, its own D1 and VAPID key, no
 * scheduled event) opens them with its variable ALERTES_ESSAI too.
 */
export const ALERTES_EN_LIGNE = true;
let ouvert = ALERTES_EN_LIGNE;
export const enLigne = () => ouvert;
/** The Worker's variable ALERTES_ESSAI (« 1 » on the trial Worker only), read at each setup. */
export function configurer(essai: string | undefined) {
  ouvert = ALERTES_EN_LIGNE || essai === "1";
}
/** For the tests: the addresses opened or closed whatever the flag. */
export function ouvrir(v: boolean) {
  ouvert = v;
}
