/**
 * Whether the alerts on the phone answer (web/alertes.ts): in production only once the sends are written and tried,
 * the privacy page and the button's words agreed, the D1 tables made (scripts/alertes.sql) and the secret VAPID_PRIVE
 * set. Until then nothing of it shows and its addresses answer 404.
 *
 * The trial Worker (wrangler.essai.jsonc: its own address on workers.dev, its own D1 and VAPID key, no
 * scheduled event) opens them with its variable ALERTES_ESSAI, which production does not have.
 */
export const ALERTES_EN_LIGNE = false;
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
