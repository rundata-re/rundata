/**
 * /sources/transport: every dataset of transport.data.gouv.fr, the National Access Point of the MMTIS regulation
 * (Commission Delegated Regulation (EU) 2017/1926), that rundata.re reads, as its access point asked on 13/11/2026: its
 * name, producer, format, licence, the link of its page and what the site does with it. Built from the code: the
 * networks of src/transit/network.json (their GTFS-RT feeds are resources of the same datasets), Altervélo
 * (providers/velos.ts) and the IRVE base (providers/irve.ts). Linked from /chiffres and the foot of /bus, /velos and
 * /bornes.
 */
import { SOURCE as IRVE } from "../providers/irve.js";
import { NETWORKS } from "../providers/transit.js";
import { SOURCE as VELOS } from "../providers/velos.js";
import { PATH as CHIFFRES } from "../chiffres.js";
import type { Alerte } from "./data.js";
import { crumbBar, crumbs, lienNom, webPage } from "./domains.js";
import { esc } from "./map.js";
import { layout } from "./pages.js";

export const PATH = "/sources/transport";
const H1 = "Les données de transport utilisées";
const TITLE = "Données de transport utilisées · rundata.re";
const DESCRIPTION = "Les jeux de données de transport.data.gouv.fr que lit rundata.re : bus, vélos en libre-service, bornes de recharge. Producteur, format, licence et lien de chaque fiche.";

/**
 * The licence each dataset's page states, by the address of that page (read on transport.data.gouv.fr on 13/11/2026).
 * A dataset without one here fails the test: its page is to be read before it is listed.
 */
export const LICENCES: Record<string, string> = {
  "https://transport.data.gouv.fr/datasets/horaires-theoriques-au-format-gtfs-et-horaires-temps-reel-au-format-gtfs-rt-du-reseau-car-jaune-a-la-reunion": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/horaire-du-reseau-citalis": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/citalis-telepherique-papang": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/reseau-karouest": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/donnees-du-reseau-alterneo": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/referentiel-topologique-reseau-carsud": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/jeu-de-donnee-spl-estival-2025": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/velos-a-assistance-electrique-en-libre-service-saint-pierre-la-reunion-civis-altervelo": "Licence Ouverte version\u00a02.0",
  "https://transport.data.gouv.fr/datasets/beta-bases-nationales-des-points-de-recharge-pour-vehicules-electriques-en-france-irve": "Licence Ouverte version\u00a02.0",
};

export interface Jeu {
  nom: string;
  producteur: string;
  format: string;
  licence: string | undefined;
  fiche: string;
  usage: string;
}

/** The datasets, networks first in their numbering order. */
export function jeux(): Jeu[] {
  const reseaux = Object.values(NETWORKS).sort((a, b) => a.first_stop - b.first_stop).map((n): Jeu => ({
    nom: n.nom,
    producteur: n.exploitant,
    format: n.temps_reel ? "GTFS et GTFS-RT" : "GTFS",
    licence: LICENCES[n.donnees],
    fiche: n.donnees,
    usage: n.temps_reel
      ? "Horaires, arrêts et lignes de la page Bus et du calcul de trajet ; départs en direct et info trafic du réseau."
      : "Horaires, arrêts et lignes de la page Bus et du calcul de trajet.",
  }));
  return [
    ...reseaux,
    { nom: "Altervélo", producteur: VELOS.organisme, format: "GBFS", licence: LICENCES[VELOS.url], fiche: VELOS.url, usage: "Vélos et places libres, station par station, sur la page Vélos." },
    { nom: "Base nationale des IRVE", producteur: IRVE.organisme, format: "IRVE statique et dynamique", licence: LICENCES[IRVE.url], fiche: IRVE.url, usage: "Bornes publiques de l'île et état de chaque point de recharge en direct, sur la page Bornes de recharge." },
  ];
}

/** The line at the foot of /bus, /velos and /bornes. */
export const lienJeux = () => `<p class="sources">${lienNom(PATH, "Les jeux de données de transport.data.gouv.fr utilisés")}, avec leur licence.</p>`;

const jeu = (j: Jeu) => `<li class="card" style="display:grid;gap:.25rem">
    <h3>${esc(j.nom)}</h3>
    <p><b>Producteur</b> : ${esc(j.producteur)}</p>
    <p><b>Format</b> : ${esc(j.format)}</p>
    <p><b>Licence</b> : ${esc(j.licence ?? "")}</p>
    <p><b>Usage sur rundata.re</b> : ${esc(j.usage)}</p>
    <p>${lienNom(j.fiche, "Fiche sur transport.data.gouv.fr")}</p>
  </li>`;

export function transportDonneesPage(origin: string, alerte?: Alerte): string {
  const band = `${crumbBar(H1, { name: "rundata.re en chiffres", path: CHIFFRES })}
<div class="wrap intro solo"><div class="pitch">
  <h1>${H1}</h1>
  <p class="lead">rundata.re réutilise les jeux de données suivants, publiés sur ${lienNom("https://transport.data.gouv.fr", "transport.data.gouv.fr")}, le Point d'accès national aux données de transport prévu par le règlement délégué (UE) 2017/1926 (MMTIS).</p>
</div></div>`;
  const list = jeux();
  const body = `<section aria-labelledby="h-jeux" style="max-width:44rem;display:grid;gap:1rem">
  <h2 id="h-jeux">${list.length} jeux de données</h2>
  <ul style="list-style:none;padding:0;margin:0;display:grid;gap:1rem">${list.map(jeu).join("")}</ul>
  <p>Ces données servent aussi aux outils de rundata.re pour les assistants IA (<a href="/mcp">le connecteur</a>). Toutes les sources du site, tous domaines confondus : <a href="${CHIFFRES}#sources">rundata.re en chiffres</a>.</p>
</section>`;
  return layout(origin, { title: TITLE, description: DESCRIPTION, path: PATH, jsonld: [crumbs(origin, H1, PATH, { name: "rundata.re en chiffres", path: CHIFFRES }), webPage(origin, PATH, TITLE, DESCRIPTION, null)], alerte }, band, body);
}
