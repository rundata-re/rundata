/**
 * The menu in five groups, and the field « Aller à une rubrique, une commune ou un lieu » of the home page (ux's
 * mock-up and marketing's words of 04/11/2026, which the user approved). The field leads to a page, it does not search
 * the pages' content: it matches the start of the names of the pages and of a short list of other words (marketing's),
 * in the browser, with nothing asked of the server. A word typed is never shown as the name of a page.
 */
import { CATEGORIES } from "./categories.js";
import { inScript } from "./map.js";
import { PAGES } from "./places.js";

export interface Entree {
  key: string;
  nom: string;
  path: string;
  icon: string;
}

const cat = (key: string): Entree => {
  const c = CATEGORIES.find((x) => x.key === key);
  if (!c?.path) throw new Error(`catégorie sans page : ${key}`);
  return { key: c.key, nom: c.nom, path: c.path, icon: c.icon };
};

/** The pages that are no category of their own (no tile), with the colour of the category they are close to. */
const PAGE: Record<string, Entree> = {
  carte: { key: "carte", nom: "Carte", path: "/carte", icon: "map" },
  baignade: { key: "mer", nom: "Baignade", path: "/baignade", icon: "drop" },
  carburants: { key: "trafic", nom: "Carburants", path: "/carburants", icon: "fuel" },
  collecte: { key: "services", nom: "Collecte", path: "/collecte", icon: "calendar" },
  decheteries: { key: "services", nom: "Déchèteries", path: "/decheteries", icon: "landmark" },
  ecoles: { key: "enfants", nom: "Écoles", path: "/ecoles", icon: "book" },
  fermes: { key: "sentiers", nom: "Sentiers fermés", path: "/sentiers", icon: "alert" },
  associations: { key: "associations", nom: "Associations", path: "/associations?ref=menu", icon: "people" },
};

export const COMMUNES: Entree = { key: "communes", nom: "Communes", path: "/communes", icon: "pin" };

/** The five groups, in marketing's order; « Communes » leads them, out of any group. */
export const GROUPES: { nom: string; entrees: Entree[] }[] = [
  { nom: "Sécurité", entrees: [cat("vigilance"), cat("cyclones"), cat("crues"), cat("volcan"), cat("feux"), cat("dae")] },
  { nom: "Météo et mer", entrees: [cat("meteo"), PAGE.carte, cat("historique"), cat("mer"), PAGE.baignade, cat("air")] },
  { nom: "Se déplacer", entrees: [cat("trafic"), cat("bus"), cat("velos"), cat("bornes"), PAGE.carburants] },
  {
    nom: "Vie pratique",
    entrees: [cat("actualites"), cat("eau"), cat("coupures"), cat("secheresse"), cat("electricite"), PAGE.collecte, PAGE.decheteries, PAGE.ecoles,
      cat("enfants"), cat("emploi"), cat("marches"), cat("antennes"), cat("calendrier")],
  },
  { nom: "Sortir", entrees: [cat("agenda"), cat("sentiers"), PAGE.fermes, cat("sport"), PAGE.associations, cat("peche")] },
];

/** Under the group « Sécurité »: the three cyclone pages (marketing). */
export const CYCLONE = [
  { nom: "kit", path: "/kit-cyclone" },
  { nom: "alerte", path: "/alerte-cyclone" },
  { nom: "école fermée ?", path: "/ecoles-cyclone" },
];

/** The field's words, marketing's (04/11/2026). */
export const CHAMP = {
  libelle: "Aller à une rubrique, une commune ou un lieu",
  exemple: "Ex. : Cilaos, carburants, plage",
  // « Aucune page pour « {saisie} ». Essayez … avec le connecteur rundata.re. », the last words a link to /mcp.
  rienAvant: "Aucune page pour « ",
  rienApres: " ». Essayez le nom d'une commune ou d'un lieu, ou posez la question à votre IA avec ",
  rienLien: "le connecteur rundata.re",
  rienFin: ".",
};

/**
 * Other words that lead to a page (marketing's list, static and short): what is typed, matched at the start of a word,
 * without accents or capitals, and the pages it leads to.
 */
export const SYNONYMES: [string[], string[]][] = [
  [["essence", "gazole", "sans plomb", "station-service", "prix carburant"], ["/carburants"]],
  [["poubelle", "ordures", "déchets", "encombrants", "tri", "collecte"], ["/collecte", "/decheteries"]],
  [["déchets verts", "gravats", "benne"], ["/decheteries"]],
  [["plage", "baignade", "nager", "lagon"], ["/baignade", "/mer"]],
  [["houle", "vagues", "surf", "température de l'eau"], ["/mer"]],
  [["bouchon", "route", "trafic", "embouteillage", "route du littoral"], ["/trafic"]],
  [["car jaune", "autobus", "arrêt"], ["/bus"]],
  [["pluie", "temps", "vent", "température"], ["/meteo"]],
  [["radar", "pluie en direct"], ["/carte"]],
  [["cyclone", "tempête", "dépression"], ["/cyclones"]],
  [["alerte rouge", "alerte orange", "confinement"], ["/vigilance", "/alerte-cyclone"]],
  [["éruption", "séisme", "piton de la fournaise", "enclos"], ["/volcan"]],
  [["rivière", "crue", "radier"], ["/crues"]],
  [["incendie", "feu de forêt"], ["/feux"]],
  [["défibrillateur", "arrêt cardiaque"], ["/defibrillateurs"]],
  [["eau coupée", "coupure d'eau"], ["/coupures-eau"]],
  [["eau potable", "eau du robinet"], ["/eau"]],
  [["arrosage", "piscine", "restriction d'eau"], ["/secheresse"]],
  [["courant", "panne de courant", "coupure de courant", "EDF"], ["/electricite"]],
  [["rando", "sentier", "GR", "trace GPS"], ["/randonnees", "/sentiers"]],
  [["concert", "spectacle", "fête", "sortie"], ["/evenements"]],
  [["match", "foot", "club"], ["/sport", "/associations?ref=menu"]],
  [["bichique", "langouste", "pêche"], ["/peche"]],
  [["école", "collège", "lycée"], ["/ecoles"]],
  [["vacances scolaires", "jour férié", "lever du soleil"], ["/calendrier"]],
  [["travail", "offre d'emploi", "concours"], ["/emploi"]],
  [["appel d'offres", "BOAMP"], ["/marches-publics"]],
  [["réseau mobile", "4G", "5G", "antenne"], ["/antennes"]],
  [["infos", "faits divers"], ["/actualites"]],
  [["pollution", "ozone", "poussières"], ["/air"]],
];

/** What the field compares: lower case, no accents, any other sign a space. Pure: written as is into the page's script. */
export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The pages a typed text leads to: those with a word (name or other word) that starts with it, or with a part of it
 * after a space; those whose name starts with it first (« car » gives Carburants and Carte before the buses' « car
 * jaune »), eight at most. Pure: written as is into the page's script.
 */
export const trouve = (d: [string, string, string[]][], t: string) =>
  t ? d.filter((x) => x[2].some((w) => w.startsWith(t) || w.includes(" " + t))).sort((a, b) => +!a[2][0].startsWith(t) - +!b[2][0].startsWith(t)).slice(0, 8) : [];

/**
 * Every page the field leads to: [name, path, the words that lead to it, normalized]. The menu's pages, the cyclone's
 * three, the pages left out of the menu, then the communes and the places with a page.
 */
export function cibles(avecAssociations: boolean): [string, string, string[]][] {
  const menu = [COMMUNES, ...GROUPES.flatMap((g) => g.entrees)].filter((e) => avecAssociations || e.key !== "associations");
  const pages: [string, string][] = [
    ...menu.map((e): [string, string] => [e.nom, e.path]),
    ["Cyclone : kit", "/kit-cyclone"],
    ["Cyclone : alerte", "/alerte-cyclone"],
    ["Cyclone : école fermée ?", "/ecoles-cyclone"],
    ["Sites sans réponse", "/sites-sans-reponse"],
    ...PAGES.map((p): [string, string] => [p.nom, `/${p.commune ? "communes" : "meteo"}/${p.slug}`]),
  ];
  return pages.map(([nom, path]) => [nom, path, [...new Set([nom, ...SYNONYMES.filter(([, to]) => to.includes(path)).flatMap(([w]) => w)].map(norm))]]);
}

/**
 * The field's script: on each key, the pages whose name or other words start with what is typed (at the start of any
 * of their words), eight at most, as links; none, marketing's sentence with the connector's link. The words typed are
 * set as text, never as markup.
 */
export function champScript(avecAssociations: boolean): string {
  return `(()=>{const D=${inScript(cibles(avecAssociations))},n=${norm},f=${trouve};` +
    `const q=document.getElementById("aller-q"),r=document.getElementById("aller-r"),v=document.getElementById("aller-rien"),s=document.getElementById("aller-s");if(!q)return;` +
    `q.addEventListener("input",()=>{const t=n(q.value);const m=f(D,t);` +
    `r.replaceChildren(...m.map((x)=>{const li=document.createElement("li"),l=document.createElement("a");l.href=x[1];l.textContent=x[0];li.append(l);return li}));` +
    `r.hidden=!m.length;v.hidden=!t||!!m.length;if(t&&!m.length)s.textContent=q.value.trim()})})();`;
}
