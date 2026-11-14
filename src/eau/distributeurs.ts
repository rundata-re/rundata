/**
 * Who distributes the water of each commune (src/eau/distributeurs.json, scripts/build-distributeurs.py: the ARS's
 * sanitary control), and where its notices of cuts are read (src/providers/avis-eau.ts).
 */
import { a } from "../articles.js";
import data from "./distributeurs.json" with { type: "json" };

export interface Distributeur {
  /** As people know it: « runéo », « La Créole ». */
  nom: string;
  /** Its site, when its notices are read here. */
  site?: string;
  /** Whether its notices of cuts for this commune are read (its feed, or the CIREST's for the east). */
  avis: boolean;
  /** Who publishes the notices read, when not the distributor: « la CIREST », « la ville de Sainte-Marie ». */
  par?: string;
  /** The commune's water shared between several distributors (partage): this one is the one whose notices are read. */
  partage?: Partage;
}

/** A commune whose samples name more than one distributor: each with its networks, as the ARS gives them; none chosen. */
export interface Partage {
  /** The commune's networks in the samples, each counted once. */
  reseaux: number;
  /** Each distributor, most networks first: its networks, and its feed when its notices are read. */
  par: { nom: string; reseaux: string[]; site?: string }[];
}

// The ARS's names, as people write them.
const NAMES: Record<string, string> = {
  "CISE REUNION": "CISE Réunion", RUNEO: "runéo", SUDEAU: "Sudéau", "STÉ PUBLIQUE LOCALE SOURCES ET EAUX": "SPL Sources et Eaux",
  O2LEST: "O2LEST", "EAUX DE LA POSSESSION": "Eaux de La Possession", DIONEO: "Dionéo", "DERICHEBOURG AQUA OI": "Derichebourg Aqua OI",
  "LA CREOLE": "La Créole", RECIL: "RECIL", "MAIRIE DE L'ÉTANG-SALÉ": "la mairie de L'Étang-Salé",
};
// The distributors with a feed of notices, read for every commune they serve.
const FEEDS: Record<string, string> = {
  DIONEO: "https://dioneo.re/", RUNEO: "https://www.runeo.re/", "EAUX DE LA POSSESSION": "https://www.eauxdelapossession.re/", "LA CREOLE": "https://lacreole.re/flash-infos",
};
// The CIREST publishes the notices of its six communes, whoever distributes their water.
export const CIREST = { communes: ["Bras-Panon", "Saint-André", "La Plaine-des-Palmistes", "Saint-Benoît", "Sainte-Rose", "Salazie"], site: "https://www.cirest.fr/categorie/communique/communique-eau/" };
// A mairie that posts its distributor's notices, read for that commune only (src/providers/avis-eau.ts).
export const MAIRIE_SAINTE_MARIE = "https://www.ville-saintemarie.re/?s=CISE";
export const MAIRIE_SAINT_LEU = "https://www.saintleu.re/?s=eau";
const MAIRIES: Record<string, { par: string; site: string }> = {
  "Sainte-Marie": { par: "la ville de Sainte-Marie", site: MAIRIE_SAINTE_MARIE },
  "Saint-Leu": { par: "la commune de Saint-Leu", site: MAIRIE_SAINT_LEU },
};
/**
 * A mairie whose notices are not read, only linked to: where to look, for the commune's page. Nothing is taken from them.
 * - Petite-Île (petite-ile.re/mentions-legales): « Les reproductions, les transmissions, les modifications, les
 *   réutilisations dudit site et de ses œuvres ne sont autorisées que dans le respect des dispositions de l'article L122-5
 *   du code de la propriété intellectuelle. » and « La mise en place de liens hypertexte pour tous les sites Internet
 *   devra faire l'objet d'une autorisation préalable de la Mairie. » Linked by its home page only, as its agenda's events
 *   are (src/providers/agenda.ts, ACCUEILS), until it answers our letter; never a page of its site.
 * - Cilaos (ville-cilaos.fr/mentions-legales): viewing only, copying needs express authorisation.
 * - L'Étang-Salé (letangsale.fr): no notice of cuts found on its site, whose legal notice excludes use « d'information »;
 *   the ARS names two distributors there, runéo for most of its networks and the mairie for one (partage).
 */
export const LIENS: Record<string, { par: string; site: string; libelle: string }> = {
  "Petite-Île": { par: "la ville de Petite-Île", site: "https://www.petite-ile.re/", libelle: "Les avis « Coupure d'eau » sur le site de la ville de Petite-Île" },
  Cilaos: { par: "la ville de Cilaos", site: "https://ville-cilaos.fr/?s=coupure+d%27eau", libelle: "Les avis de coupure d'eau sur le site de la ville de Cilaos" },
  "L'Étang-Salé": { par: "la mairie de L'Étang-Salé", site: "https://www.letangsale.fr/", libelle: "Le site de la mairie de L'Étang-Salé" },
};
/**
 * A distributor's own site, linked only, by the name the page says: its notices are not read here. Both are edited by
 * Saur, whose « L'eau dans ma commune » gives each commune's water quality and works after a form, with no address per
 * commune, so their home pages; their legal notices and terms forbid copying the sites' contents, say nothing of links,
 * and their robots.txt allow the home page.
 * - CISE Réunion (read on 05/11/2026).
 * - Sudéau (read on 14/11/2026: www.sudeau.re, its « mentions légales » and « conditions générales d'utilisation »).
 * Not linked (14/11/2026): the SPL Sources et Eaux (sourceo.re), whose pages « Communiqués » and « Travaux en cours et
 * incidents » are empty, so no page of notices to link; RECIL, no site of its own found.
 */
export const SITES_DISTRIBUTEURS: Readonly<Record<string, string>> = { "CISE Réunion": "https://www.cise-reunion.re/", "Sudéau": "https://www.sudeau.re/" };

export const BUILT = data.construit;
export const SOURCE = data.source;

/**
 * A distributor named in a sentence of a page: RECIL, as the ARS names it, without a spelled-out form anywhere, says what
 * it is instead (marketing, 04/11/2026).
 */
export const nomDit = (d: Distributeur) => (d.nom === "RECIL" ? "RECIL, le distributeur d'eau de Cilaos (d'après l'ARS)," : d.nom);

// The words of the ARS's networks' names written short or without accents (« RESEAU SCES NOUVELLES LES HAUTS »).
const MOTS: Record<string, string> = { SCES: "Sources", ETANG: "Étang", SALE: "Salé" };
/** A network as people read it: « RESEAU SCES NOUVELLES LES HAUTS » → « Sources Nouvelles les Hauts ». */
export const reseauNom = (ars: string) =>
  ars.replace(/^RESEAU /, "").split(" ").map((w, i) =>
    MOTS[w] ?? (i && /^(LES|LA|LE|DE|DU|DES|ET)$/.test(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");

/** The distributors the ARS names for a commune whose samples name more than one, each with its networks: none is chosen. */
export function partage(commune: string): Partage | undefined {
  const p = (data.plusieurs as Record<string, { reseaux: number; par: Record<string, string[]> }>)[commune];
  if (!p) return undefined;
  const par = Object.entries(p.par)
    .map(([raw, reseaux]) => ({ nom: NAMES[raw] ?? raw, reseaux: reseaux.map(reseauNom), ...(FEEDS[raw] ? { site: FEEDS[raw] } : {}) }))
    .sort((x, y) => y.reseaux.length - x.reseaux.length || x.nom.localeCompare(y.nom, "fr"));
  return { reseaux: p.reseaux, par };
}

/**
 * Who distributes the water of a shared commune, in a sentence, from the ARS's samples: « D'après l'ARS, runéo distribue
 * l'eau de 7 réseaux sur 8 à L'Étang-Salé, et la mairie celle du réseau Sources Nouvelles Les Hauts. »
 */
export function phrasePartage(commune: string, p: Partage): string {
  const of = (rs: string[]) =>
    rs.length === p.reseaux ? "de tous ses réseaux" : rs.length === 1 ? `du réseau ${rs[0]}` : rs.length === 2 ? `des réseaux ${rs[0]} et ${rs[1]}` : `de ${rs.length} réseaux sur ${p.reseaux}`;
  // The commune is said once: its mairie is « la mairie ».
  const said = (nom: string) => (nom.startsWith("la mairie de ") ? "la mairie" : nom);
  const [first, ...rest] = p.par;
  return `D'après l'ARS, ${said(first.nom)} distribue l'eau ${of(first.reseaux)} ${a(commune)}` +
    rest.map((d, i) => `${i === rest.length - 1 ? ", et" : ","} ${said(d.nom)} celle ${of(d.reseaux)}`).join("") + ".";
}

export function distributeur(commune: string): Distributeur | undefined {
  const raw = (data.communes as Record<string, string | null>)[commune];
  if (!raw) {
    // Shared: the one whose notices are read, the CIREST's communes all read; none read, none named.
    const p = partage(commune);
    const fed = p?.par.find((d) => d.site);
    if (p && CIREST.communes.includes(commune)) return { nom: (fed ?? p.par[0]).nom, site: fed?.site ?? CIREST.site, avis: true, ...(fed ? {} : { par: "la CIREST" }), partage: p };
    return p && fed ? { nom: fed.nom, site: fed.site, avis: true, partage: p } : undefined;
  }
  const feed = FEEDS[raw];
  const east = CIREST.communes.includes(commune);
  const mairie = MAIRIES[commune];
  if (!feed && !east && mairie) return { nom: NAMES[raw] ?? raw, site: mairie.site, avis: true, par: mairie.par };
  return { nom: NAMES[raw] ?? raw, site: feed ?? (east ? CIREST.site : undefined), avis: !!feed || east, ...(east && !feed ? { par: "la CIREST" } : {}) };
}

/** The communes whose notices of cuts are read, in alphabetical order: what « avis lus » says on every page. */
export function lues(): string[] {
  return Object.keys(data.communes).filter((c) => distributeur(c)?.avis).sort((x, y) => x.localeCompare(y, "fr"));
}
