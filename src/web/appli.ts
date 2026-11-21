/**
 * /appli, « L'appli rundata.re pour Android »: the trial version of the Android app, shared with a few people before it
 * reaches the Play Store. Marketing's words of 21/11/2026, word for word. Never indexed and never linked: noindex in
 * the page and in its header, out of the sitemap, in no menu nor list of the site. The file itself is a pre-release
 * of the GitHub repository; /appli/rundata-re.apk leads to the current one, so that a new version changes only
 * VERSION, EMPREINTE and the asset's name here.
 */
import { adresseTexte } from "./adresse.js";
import { crumbBar, lienNom } from "./domains.js";
import { GITHUB, layout } from "./pages.js";

export const PATH = "/appli";
/** The short address of the file, the button's link: a redirect to the asset of the current pre-release. */
export const APK_PATH = "/appli/rundata-re.apk";
export const VERSION = "0.1.2";
/** SHA-256 of the file published with the pre-release android-v<VERSION>. */
export const EMPREINTE = "a26c8943f728e37b4bbd73622ba4d260a8c8be09a02f107af48994c3fc776a0f";
export const APK_URL = `${GITHUB}/releases/download/android-v${VERSION}/rundata-re-${VERSION}.apk`;

const TITLE = "L'appli rundata.re pour Android · version d'essai";
const NAME = "L'appli rundata.re pour Android";
const LEAD = "La journée de votre commune, en direct sur votre téléphone, et un widget pour l'écran d'accueil.";

export function appliPage(origin: string): string {
  const band = `${crumbBar(NAME)}
<div class="wrap intro solo"><div class="pitch">
  <h1>${NAME}</h1>
  <p class="lead">${LEAD}</p>
</div></div>`;
  const body = `<section class="app-page appli">
  <div class="card">
    <p>Le widget affiche, pour la commune choisie :</p>
    <ul>
      <li>la température mesurée, avec le nom de la station et l'heure de la mesure ;</li>
      <li>la vigilance météo de sa zone ;</li>
      <li>l'avis d'eau du moment, s'il y en a un (coupure ou eau à ne pas boire).</li>
    </ul>
    <p>Il se met à jour toutes les 30 minutes.</p>
  </div>
  <p>C'est une version d'essai, partagée avec quelques personnes avant son arrivée sur le Play Store. Elle est gratuite, sans compte et sans publicité.</p>
  <p class="appli-dl"><a class="app-go" href="${APK_PATH}">Télécharger l'appli</a> <span class="note">(Android 8 ou plus récent, 2 Mo)</span></p>
  <div class="card">
    <h2>Installer en 4 étapes</h2>
    <ol>
      <li>Sur votre téléphone, touchez « Télécharger l'appli », puis ouvrez le fichier téléchargé.</li>
      <li>Android demande d'autoriser l'installation depuis votre navigateur : autorisez-la. Si Play Protect propose d'analyser l'appli, acceptez : elle n'est pas encore sur le Play Store.</li>
      <li>Ouvrez l'appli rundata.re et choisissez votre commune.</li>
      <li>Pour le widget : appui long sur l'écran d'accueil, puis « Widgets », puis « rundata.re ». Posez-le où vous voulez.</li>
    </ol>
  </div>
  <p><strong>Sur iPhone :</strong> pas encore.</p>
  <p><strong>Une remarque, un souci ?</strong> Écrivez à ${adresseTexte("contact@rundata.re")}.</p>
  <p class="note">Version ${VERSION} · empreinte SHA-256 du fichier : <code>${EMPREINTE}</code> · code source libre (licence MIT) : ${lienNom(GITHUB, "github.com/rundata-re/rundata")}</p>
</section>`;
  return layout(origin, { title: TITLE, description: LEAD, path: PATH, jsonld: [], noindex: true, sansInstallation: true, sansPartage: true }, band, body);
}
