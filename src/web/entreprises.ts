/**
 * /entreprises, « Espace entreprises et organismes »: for the companies and bodies with their own computing (an airport,
 * carriers, water or energy distributors, network operators), on putting information they already show the public in
 * open data without opening their systems. Each part is written for whom it answers (the DPO, the IT department), with an
 * anchor that a mail can aim at. The guide for those without a technical team stays /ouvrir-ses-donnees. Text written by
 * marketing, validated by the user on 17/11/2026.
 *
 * Out quietly at first: in noindex, out of the sitemap and linked from no page while `DISCRETE` is true, so that Google's
 * judgement of the site is measured without anything new (until 22/11/2026). The address works for whoever receives it.
 */
import type { Alerte } from "./data.js";
import { crumbBar, crumbs, webPage } from "./domains.js";
import { PATH as GUIDE } from "./ouvrir-donnees.js";
import { layout, lienAdresse } from "./pages.js";

export const PATH = "/entreprises";
/** Its other addresses, each sent to it with a 301. */
export const ALIASES = ["/organismes", "/open-data"];
/** In noindex, out of the sitemap and linked from nowhere, until it is announced. */
export const DISCRETE = true;

const TITLE = "Entreprises et organismes : ouvrir vos données sans exposer vos systèmes · rundata.re";
const CRUMB = "Entreprises et organismes";
const DESCRIPTION = "Aéroport, transport, eau, énergie : publier en open data des informations déjà publiques, sans ouvrir votre système d'information. Conseil gratuit.";

/** The parts, in their order: the summary under the lead links each. */
const SOMMAIRE: [string, string][] = [
  ["accord", "Donner son accord"],
  ["export", "Un export à heure fixe"],
  ["lecture-seule", "Un point de lecture séparé"],
  ["formats", "Les formats standards"],
  ["dpo", "Pour votre DPO"],
  ["dsi", "Pour votre DSI"],
  ["licences", "Les licences"],
  ["rundata", "Ce que fait rundata.re"],
  ["conseil", "Un conseil gratuit"],
];

/** A level's card: its title, what it says, then what to do, what leaves the system and the effort. */
const niveau = (id: string, titre: string, corps: string, faire: string, sort: string, effort: string, apres = "") => `<div class="card" style="align-content:start">
    <h2 id="${id}">${titre}</h2>
    ${corps}
    <ul>
      <li><b>Ce qu'il faut faire</b> : ${faire}</li>
      <li><b>Ce qui sort du SI</b> : ${sort}</li>
      <li><b>Effort</b> : ${effort}</li>
    </ul>${apres ? `\n    ${apres}` : ""}
  </div>`;

export function entreprisesPage(origin: string, alerte?: Alerte): string {
  const band = `${crumbBar(CRUMB)}
<div class="wrap intro solo"><div class="pitch">
  <h1>Espace entreprises et organismes</h1>
  <p class="lead">Aéroport, transporteur, distributeur d'eau ou d'énergie, gestionnaire de réseau : vous publiez déjà des informations utiles au public, comme des horaires, des retards, des coupures ou des niveaux. Cette page montre comment les mettre en open data, pour que chacun puisse les lire et les reprendre, sans ouvrir l'accès à vos systèmes internes. Le plus souvent, il n'y a rien de sensible à exposer : il suffit de faire sortir un petit fichier.</p>
</div></div>`;
  const body = `<section style="max-width:44rem;display:grid;gap:1rem">
  <p class="sommaire">Sommaire : ${SOMMAIRE.map(([id, nom]) => `<a href="#${id}">${nom}</a>`).join(" · ")}</p>
  <h2 id="principe">Le principe : la donnée sort, personne n'entre</h2>
  <p>Une information affichée sur votre site, sur un écran en aérogare ou dans une application est déjà publique. L'open data ne demande pas d'ouvrir vos bases ni vos API internes. Il suffit qu'une copie de ces informations publiques sorte, à intervalle fixe, vers un endroit séparé où d'autres viennent la lire. C'est votre système qui envoie : rien, à l'extérieur, ne peut l'interroger.</p>
  <p>Il y a plusieurs manières de le faire, de la plus simple à la plus complète. Toutes se mettent en place sans toucher à ce qui est sensible.</p>
  <div style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(13rem,100%),1fr))">
  ${niveau("accord", "0. Donner son accord : rien à développer",
    "<p>C'est le niveau zéro. Vos informations sont déjà sur votre site public. Un accord écrit, par exemple un mail, permet à rundata.re de lire cette page publique à faible cadence, d'en reprendre les faits en vous citant, et de renvoyer vers votre site.</p>",
    "un mail qui dit quelle page, et sous quelle condition (citer votre nom, renvoyer vers votre site).",
    "rien. La lecture se fait sur la page que tout le monde voit déjà.",
    "quelques minutes.",
    "<p>C'est un bon début, mais pas une vraie ouverture : une page web change de forme sans prévenir, et seul rundata.re en profite. Les niveaux suivants servent tout le monde.</p>")}
  ${niveau("export", "1. Un export à heure fixe, poussé vers l'extérieur",
    "<p>Votre système dépose, toutes les minutes ou toutes les 5 minutes, un petit fichier JSON ou CSV avec les seules informations publiques : un numéro, une heure prévue, une heure estimée, un statut. Le fichier va sur un stockage public (un « bucket » ou un CDN), ou sur votre propre site, et les lecteurs le lisent là.</p>",
    "une tâche planifiée qui écrit le fichier puis l'envoie. C'est souvent une centaine de lignes de script, à partir d'une requête que votre système fait déjà pour son propre affichage.",
    "un fichier, dans un seul sens, vers l'extérieur. <b>Aucun accès entrant</b> : aucune connexion de l'extérieur n'atteint votre système.",
    "de quelques jours à quelques semaines, selon votre système.",
    "<p>Le fichier peut ensuite être référencé sur data.gouv.fr par son adresse. Il reste hébergé chez vous, et la plateforme pointe vers lui.</p>")}
  ${niveau("lecture-seule", "2. Un point de lecture séparé, en lecture seule",
    `<p>Si vous préférez une adresse qui répond comme une API, elle peut vivre complètement en dehors de votre système. Deux formes courantes :</p>
    <ul>
      <li><b>une copie hors du SI :</b> l'export du niveau 1 alimente une petite base ou un cache hébergé à part, qui seul répond au public ;</li>
      <li><b>une passerelle à une seule route :</b> un service de bordure (API gateway, CDN) qui n'expose qu'une adresse, en lecture seule, avec une limite de débit et un cache de quelques secondes. Tout le reste est fermé.</li>
    </ul>`,
    "un hébergement séparé, souvent chez un fournisseur de cloud ou de CDN.",
    "la même copie qu'au niveau 1. Le public lit la copie, jamais votre système.",
    "quelques semaines, et un petit coût d'hébergement mensuel.",
    "<p>Pour le transport en GTFS-RT, il existe une solution toute faite : le point d'accès national, transport.data.gouv.fr, peut servir de serveur relais. Il lit votre flux à intervalle fixe (toutes les 5 à 10 secondes) et sert lui-même tous les réutilisateurs. Votre serveur ne voit alors qu'un seul lecteur, quel que soit le nombre de réutilisations. Il suffit de lui écrire.</p>")}
  </div>
  <h2 id="formats">3. Les formats et les plateformes standards</h2>
  <p>Un format standard évite d'écrire une documentation, et rend vos données lisibles par les outils qui existent déjà.</p>
  <ul>
    <li><b>data.gouv.fr</b>, la plateforme publique des données ouvertes : l'inscription est gratuite, on y publie au nom de son organisation, en déposant un fichier ou en donnant le lien d'un fichier qui reste chez vous.</li>
    <li><b>transport.data.gouv.fr</b>, le point d'accès national aux données de transport, avec deux formats : <b>GTFS</b> pour les horaires prévus, et <b>GTFS-RT</b> pour le direct (retards, positions, perturbations). rundata.re lit déjà ainsi les bus de l'île : le direct de Car Jaune, d'Alternéo et de CarSud, et les horaires de Kar'Ouest, de Citalis et d'autres, tous sous Licence Ouverte 2.0.</li>
    <li><b>ICS</b> pour un agenda : un lien que les calendriers savent suivre (travaux, fermetures, événements).</li>
    <li><b>JSON ou CSV</b> pour le reste, avec une ligne par élément, une colonne par champ, et la date de mise à jour dans le fichier.</li>
  </ul>
  <p>Des exemples à La Réunion :</p>
  <ul>
    <li>la production d'électricité par filière, publiée en open data sur le portail d'EDF Réunion, au pas de 5 minutes ;</li>
    <li>les vélos en libre-service Altervélo (CIVIS), au format GBFS sur transport.data.gouv.fr ;</li>
    <li>les balises météo de la Fédération française de vol libre : un fichier de relevés sur data.gouv.fr, renouvelé toutes les 5 minutes.</li>
  </ul>
  <h2 id="dpo">Pour votre DPO</h2>
  <p>Les informations visées sont des <b>faits d'exploitation, pas des données personnelles</b> : un numéro de vol ou de ligne, une provenance, une heure prévue, une heure estimée, un statut (à l'heure, retardé, annulé), une zone de coupure, un niveau.</p>
  <p>Comment le vérifier :</p>
  <ul>
    <li><b>Liste fermée des champs.</b> L'export ne contient que des champs choisis un par un, écrits dans un document d'une page. Aucun champ libre (commentaire d'agent, note interne), qui pourrait un jour contenir un nom.</li>
    <li><b>Rien sur une personne.</b> Pas de nom de passager ni d'agent, pas d'immatriculation de véhicule privé, pas d'adresse de client, pas d'identifiant de réservation.</li>
    <li><b>Même contenu que l'affichage public.</b> Chaque champ du fichier figure déjà sur votre site ou sur vos écrans. Si une information n'est pas affichée au public aujourd'hui, elle ne sort pas.</li>
    <li><b>Un contrôle simple.</b> Le DPO relit un fichier d'exemple avant la mise en ligne, puis un fichier au hasard de temps en temps.</li>
  </ul>
  <p>Pour une administration, la loi demande de rendre impossible l'identification des personnes avant de publier des documents qui les concernent (article L312-1-2 du code des relations entre le public et l'administration). Et pour tous, le RGPD s'applique : avec la liste fermée ci-dessus, il ne concerne pas ces fichiers.</p>
  <h2 id="dsi">Pour votre DSI</h2>
  <ul>
    <li><b>Sens unique.</b> Le système interne écrit vers l'extérieur. Aucune règle de pare-feu entrante, aucun compte externe sur vos serveurs, aucune API interne exposée.</li>
    <li><b>Hébergement séparé.</b> La copie publique vit sur un stockage ou un service à part, sans lien de confiance avec le SI : une fuite de cette copie ne révèle que ce qui est déjà public.</li>
    <li><b>Charge.</b> Un seul export, à intervalle fixe, quel que soit le nombre de lecteurs : la charge sur le SI ne dépend pas du succès des données. Les lectures du public tombent sur un cache ou un CDN, et un relais comme celui de transport.data.gouv.fr absorbe le direct.</li>
    <li><b>Coût.</b> Un fichier de quelques kilo-octets, servi depuis un CDN ou un stockage public, coûte peu chaque mois, souvent dans la part gratuite des fournisseurs. Le relais de transport.data.gouv.fr ne coûte rien.</li>
    <li><b>Surveillance.</b> Une date de mise à jour dans chaque fichier, et une alerte si elle a plus de quelques minutes. Les lecteurs voient aussi l'heure : un fichier figé se remarque tout de suite.</li>
    <li><b>Réversible.</b> On arrête la tâche planifiée, et plus rien ne sort.</li>
  </ul>
  <h2 id="licences">Les licences</h2>
  <ul>
    <li><b>Licence Ouverte 2.0</b>, celle des données publiques de l'État : chacun peut réutiliser vos données, même pour un usage commercial, à condition de citer la source (au moins votre nom) et la date de dernière mise à jour. La citation ne doit pas laisser croire à une caution de votre part.</li>
    <li><b>ODbL</b> : même liberté, avec une condition de plus, le partage à l'identique. Qui améliore vos données doit les republier sous les mêmes conditions.</li>
  </ul>
  <p>Dans les deux cas, la citation vous garantit que votre nom accompagne vos données partout où elles sont reprises, et que votre version reste la référence.</p>
  <h2 id="rundata">Ce que rundata.re fait de vos données</h2>
  <p>rundata.re est un service bénévole fait à La Réunion. Il rassemble en un seul endroit les données publiques de l'île : météo mesurée, routes, bus, eau, électricité, volcan. Il est sans compte, sans publicité, et son code est libre.</p>
  <ul>
    <li><b>Une lecture à faible cadence, mise en cache.</b> Un flux en direct est lu au plus une fois par minute, quel que soit le nombre de visiteurs. Chaque lecture s'annonce sous le nom <code>rundata.re (contact@rundata.re)</code>.</li>
    <li><b>Votre nom et votre lien, à chaque réponse.</b> Chaque donnée est affichée avec sa source, sa licence et l'heure de la lecture, et renvoie vers votre site pour le détail ou la réservation.</li>
    <li><b>Dans les assistants IA.</b> Les mêmes réponses, citées de la même façon, arrivent dans ChatGPT, Claude ou Le Chat, quand quelqu'un pose une question sur l'île.</li>
    <li><b>Rien d'inventé.</b> Si votre flux ne répond pas, rundata.re le dit, avec l'heure de la dernière lecture réussie. Il ne devine jamais un statut.</li>
  </ul>
  <h2 id="conseil">Un conseil gratuit pour vous lancer</h2>
  <p>rundata.re aide gratuitement les entreprises et les organismes de l'île à mettre leurs données publiques en open data : choisir les champs, le format et la plateforme, et préparer les réponses à votre DPO et à votre DSI. Pas de contrat ni de prestation : simplement un échange, au rythme qui vous convient.</p>
  <p>Écrivez à ${lienAdresse("mailto:contact@rundata.re", "contact@rundata.re")}. Pour une structure sans équipe technique, le guide <a href="${GUIDE}">Rendre ses données accessibles</a> est plus simple.</p>
</section>`;
  return layout(origin, { title: TITLE, description: DESCRIPTION, path: PATH, jsonld: [crumbs(origin, CRUMB, PATH), webPage(origin, PATH, TITLE, DESCRIPTION, null)], alerte, noindex: DISCRETE }, band, body);
}
