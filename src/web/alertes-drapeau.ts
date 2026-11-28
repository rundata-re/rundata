import { contexte } from "../contexte.js";

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
let force: boolean | undefined;
/** Open by the flag, or on the trial Worker (contexte.ts `essai`, its variable ALERTES_ESSAI « 1 »). */
export const enLigne = () => force ?? (ALERTES_EN_LIGNE || contexte().essai === true);
/** For the tests: the addresses opened or closed whatever the flag; undefined gives the flag back. */
export function ouvrir(v: boolean | undefined) {
  force = v;
}

/** The page of the alerts (web/alertes-page.ts) and its button's words, here so that any page can link to it. */
export const ALERTES_PAGE = "/alertes";
export const BOUTON_ALERTES = "Recevoir les alertes sur ce téléphone";
/**
 * The link to the alerts' page from the pages of what sets one off (/vigilance, /alerte-cyclone, /volcan), with the
 * button's words, agreed with it; nothing while the alerts are closed, so that no page links to a 404.
 */
export const lienAlertes = () => (enLigne() ? `<p class="lead"><a href="${ALERTES_PAGE}">${BOUTON_ALERTES} →</a></p>` : "");
