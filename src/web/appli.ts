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
export const VERSION = "0.2.0";
/** The pre-release that carries the file. Releases are immutable: a tag published without its file can never take one (0.1.2 lives at android-v0.1.2-1). */
export const TAG = "android-v0.2.0";
/** SHA-256 of the file published with the pre-release TAG. */
export const EMPREINTE = "bbd9faf038d08e0c803f58a5221211cc6b12773afd0476ea70e62ba9f095f071";
export const APK_URL = `${GITHUB}/releases/download/${TAG}/rundata-re-${VERSION}.apk`;

const TITLE = "L'appli rundata.re pour Android · version d'essai";
const NAME = "L'appli rundata.re pour Android";
const LEAD = "La journée de votre commune, en direct sur votre téléphone, et des widgets pour l'écran d'accueil.";

export function appliPage(origin: string): string {
  const band = `${crumbBar(NAME)}
<div class="wrap intro solo"><div class="pitch">
  <h1>${NAME}</h1>
  <p class="lead">${LEAD}</p>
</div></div>`;
  const body = `<section class="app-page appli">
  <div class="card">
    <p>Quatre widgets pour l'écran d'accueil, chacun pour la commune choisie en le posant :</p>
    <ul>
      <li>« Température » : la température mesurée et son heure ;</li>
      <li>« Météo, mer et vigilance », sur une ligne : la température mesurée, celle de la mer et la vigilance de la zone ;</li>
      <li>« La journée » : la température mesurée avec sa station, la vigilance de la zone et l'avis du distributeur d'eau, s'il y en a un ;</li>
      <li>« Aujourd'hui », le plus grand : les sorties et les marchés du jour, les routes et les bus, les avis du distributeur d'eau.</li>
    </ul>
    <p>Ils se mettent à jour toutes les 30 minutes. Sans réseau, ils gardent la dernière lecture, avec son heure.</p>
  </div>
  <p>C'est une version d'essai, partagée avec quelques personnes avant son arrivée sur le Play Store. Elle est gratuite, sans compte et sans publicité.</p>
  <p class="appli-dl"><a class="app-go" href="${APK_PATH}">Télécharger l'appli</a> <span class="note">(Android 8 ou plus récent, 2 Mo)</span></p>
  <p class="note">Vous avez installé la version 0.1.2 ? Désinstallez-la une fois avant d'installer celle-ci : elle est signée avec la clé définitive de l'appli, et Android refuse sinon de la mettre à jour. Les versions suivantes s'installeront par-dessus. Votre commune sera à choisir de nouveau.</p>
  <div class="card">
    <h2>Installer en 4 étapes</h2>
    <ol>
      <li>Sur votre téléphone, touchez « Télécharger l'appli », puis ouvrez le fichier téléchargé.</li>
      <li>Android demande d'autoriser l'installation depuis votre navigateur : autorisez-la. Si Play Protect propose d'analyser l'appli, acceptez : elle n'est pas encore sur le Play Store.</li>
      <li>Ouvrez l'appli rundata.re et choisissez votre commune.</li>
      <li>Pour un widget : appui long sur l'écran d'accueil, puis « Widgets », puis « rundata.re ». Posez celui que vous voulez, puis choisissez sa commune.</li>
    </ol>
  </div>
  <p><strong>Sur iPhone :</strong> pas encore.</p>
  <p><strong>Une remarque, un souci ?</strong> Écrivez à ${adresseTexte("contact@rundata.re")}.</p>
  <p class="note">Version ${VERSION} · empreinte SHA-256 du fichier : <code>${EMPREINTE}</code> · code source libre (licence MIT) : ${lienNom(GITHUB, "github.com/rundata-re/rundata")}</p>
</section>`;
  return layout(origin, { title: TITLE, description: LEAD, path: PATH, jsonld: [], noindex: true, sansInstallation: true, sansPartage: true }, band, body);
}
