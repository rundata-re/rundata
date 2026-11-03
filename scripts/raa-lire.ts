/**
 * The prefecture's « recueil des actes administratifs » as scripts/raa.ts reads it: the list of the year's recueils,
 * the titles of the acts of one recueil, and the filters every title goes through before it is kept. A title that may
 * name a person, or aim at one, is never kept, nor written in the Worker's store: the acts that name, appoint, delegate
 * to, reward or sanction someone, the declarations of a person's services, the bodies' members by name, and a title
 * where a first name stands beside another capitalised word. Only the title, as published, is kept: never the PDF's
 * content. Node only (the first names are read from scripts/raa-prenoms.txt).
 */
import { readFileSync } from "node:fs";
import gazetteer from "../src/places/gazetteer.json" with { type: "json" };
import { placesIn, plain } from "../src/providers/actualites.js";
import type { Acte, Recueil } from "../src/providers/raa.js";

const ORIGIN = "https://www.reunion.gouv.fr";
export const LISTE = `${ORIGIN}/Publications/Publications-administratives-et-legales/Recueil-des-actes-administratifs-RAA`;
/** The page of a year's recueils, newest first: a page a year (« Recueil-des-actes-administratifs-2026 »). */
export const listeDe = (annee: number) => `${LISTE}/Recueil-des-actes-administratifs-${annee}`;

const MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
const pad = (n: number) => String(n).padStart(2, "0");

/** « 03 novembre 2026 » or « 1er octobre », as a day (YYYY-MM-DD), the year `annee` when the text has none. */
function jour(text: string, annee?: number): string | undefined {
  const m = /^(\d{1,2})(?:er)? (\p{L}+)(?: (\d{4}))?$/u.exec(fold(text).trim());
  const mois = m ? MOIS.indexOf(m[2]) : -1;
  const an = m?.[3] ? Number(m[3]) : annee;
  return mois < 0 || !an ? undefined : `${an}-${pad(mois + 1)}-${pad(Number(m![1]))}`;
}

/**
 * The recueils of a year's page, newest first: their title (« Spécial n° 222 du 03 novembre 2026 », « OCTOBRE »), its
 * number when it has one, their day (the title's, else « Publié le ») and their page.
 */
export function parseListe(html: string): Recueil[] {
  const out: Recueil[] = [];
  for (const m of html.matchAll(/class="fr-card__link" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?Publié le (\d{2})\/(\d{2})\/(\d{4})/g)) {
    const titre = plain(m[2]);
    const n = /n°\s*(\d+)\s+du\s+(.+)$/iu.exec(titre);
    out.push({
      titre,
      numero: n ? Number(n[1]) : undefined,
      date: (n && jour(n[2])) ?? `${m[5]}-${m[4]}-${m[3]}`,
      lien: new URL(plain(m[1]), ORIGIN).href,
    });
  }
  return out;
}

/** The link of the next page of the year's list (older recueils), undefined on its last page. */
export function suite(html: string): string | undefined {
  const m = /<a\b[^>]*class="[^"]*fr-pagination__link--next[^"]*"[^>]*href="([^"]+)"/.exec(html);
  return m ? new URL(plain(m[1]), ORIGIN).href : undefined;
}

/**
 * The recueils of the list the collector has seen since `since`, newest first, and how far down the list it has seen
 * them without a page missing: `vu_jusqua`, the day of the last recueil of the last page read (« » once the list's last
 * page is read). Kept on the machine with what it read (scripts/raa.ts).
 */
export interface Vus {
  connus: Recueil[];
  vu_jusqua: string;
}

const byDay = (x: Recueil, y: Recueil) => y.date.localeCompare(x.date);
const union = (a: Recueil[], b: Recueil[], since: string) =>
  [...new Map([...a, ...b].map((r) => [r.lien, r])).values()].filter((r) => r.date >= since).sort(byDay);

/**
 * The recueils seen once page 1 of the list is read again: those seen before and its own, the list seen as far down
 * as before. When page 1 holds none of those seen before and does not go back past `since` (more were published since
 * the last run than a page holds), the pages between are missing: the list is seen down to page 1's last one only, and
 * the next pages are read again (the recueils already read are not).
 */
export function vusPage1(avant: Vus | undefined, page: Recueil[], suiteExiste: boolean, since: string): Vus {
  // « » : the list's last page.
  const bout = suiteExiste ? page.at(-1)?.date ?? "" : "";
  const known = new Set(avant?.connus.map((r) => r.lien));
  if (!avant || !(page.some((r) => known.has(r.lien)) || !bout || bout < since)) return { connus: union([], page, since), vu_jusqua: bout };
  return { connus: union(avant.connus, page, since), vu_jusqua: !bout ? "" : bout < since ? bout : avant.vu_jusqua };
}

/** The recueils seen once a next page of the list is read (`page`, the one after the last read). */
export const vusSuivante = (avant: Vus, page: Recueil[], suiteExiste: boolean, since: string): Vus =>
  ({ connus: union(avant.connus, page, since), vu_jusqua: suiteExiste ? page.at(-1)?.date ?? "" : "" });

/** Whether the list is seen far enough: down to `since` (a next page is then not read), or to its last page. */
export const vusAssez = (v: Vus, since: string) => !v.vu_jusqua || v.vu_jusqua < since;

/**
 * What the recueils read cover, since `since` (YYYY-MM-DD): the recueils seen since then and not read yet, and
 * `lus_depuis`, the day of the oldest recueil read with none unread after it, when the recueils read do not cover all
 * the days since `since` (some left to read, or the list not seen down to `since`). `publiable`: whether something can
 * be said of the days since `lus_depuis`, that is when the newest recueil is read; `complet`, of all the days since
 * `since`.
 */
export function couverture(v: Vus, lus: Set<string>, since: string): { a_lire: Recueil[]; lus_depuis?: string; publiable: boolean; complet: boolean } {
  const recents = v.connus.filter((r) => r.date >= since);
  const a_lire = recents.filter((r) => !lus.has(r.lien));
  const first = recents.findIndex((r) => !lus.has(r.lien));
  const covered = first < 0 ? recents : recents.slice(0, first);
  const complet = first < 0 && vusAssez(v, since);
  return { a_lire, lus_depuis: complet ? undefined : covered.at(-1)?.date, publiable: first !== 0 || !recents.length, complet };
}

/**
 * Whether a copy may be written to the store: the first once the recueils since `since` are all read (before,
 * « no act names this place » would not be true); after it, whenever the newest recueil is read.
 */
export const ecrire = (dejaEcrite: boolean, c: ReturnType<typeof couverture>) => (dejaEcrite ? c.publiable : c.complet);

/** An act as a recueil's page lists it, before the filters. */
export interface Lu {
  titre: string;
  /** The service whose heading it is under (« CABINET »). */
  service?: string;
  /** The day of its group in the recueil (YYYY-MM-DD). */
  date?: string;
  /** Its PDF. */
  pdf: string;
}

/**
 * The acts of a recueil's page, in its order: under a service's heading and a day's (« CABINET », « 03 novembre »), a
 * link to each PDF, its text the act's title (« Télécharger » before it, the glossary's tooltips and the file's size
 * left out). A day without its year is of the recueil's, or of the year before when its month is after the recueil's.
 */
export function parseRecueil(html: string, recueil: Pick<Recueil, "date">): Lu[] {
  const start = html.indexOf("fr-text--lead");
  const end = html.indexOf("fr-col-12 fr-col-md-4", start);
  const body = html.slice(start < 0 ? 0 : start, end < 0 ? undefined : end);
  const [an, mois] = recueil.date.split("-").map(Number);
  const out: Lu[] = [];
  let service: string | undefined;
  let date: string | undefined;
  for (const m of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>|<a\b[^>]*fr-link--download[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<span class="fr-link__detail">/g)) {
    if (m[1] !== undefined) {
      const t = plain(m[1]);
      if (!t) continue;
      const d = jour(t, an);
      if (d) date = Number(d.slice(5, 7)) > mois ? `${an - 1}${d.slice(4)}` : d;
      else service = t;
      continue;
    }
    const titre = plain(m[3].replace(/<span class="fr-tooltip[\s\S]*?<\/span>/g, "")).replace(/^Télécharger\s+/, "").replace(/[\s_]+$/, "");
    if (titre) out.push({ titre, service, date, pdf: new URL(encodeURI(plain(m[2])), ORIGIN).href });
  }
  return out;
}

// ---------------------------------------------------------------- the filters

// A word alone, by Unicode letters (\b is ASCII only).
const alone = (re: string, flags = "iu") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re})(?![\\p{L}\\p{N}])`, flags);

// 1. A civility before a capital: « M. », « Mme », « Docteur ».
const CIVILITE = /(?<![\p{L}\p{N}])(?:M\.|MM\.|Mme|Mmes|Mlle|Monsieur|Madame|Mademoiselle|Messieurs|Mesdames|Dr|Docteur|Me|Maître|Pr)\s+[A-ZÀ-Ý]/u;
// 2. What aims at a person: a delegation, an appointment, a reward, an approval given to someone.
const MOTS = alone([
  "d[ée]l[ée]gations?", "subd[ée]l[ée]gations?", String.raw`nomm\p{L}*`, String.raw`nomination\p{L}*`, String.raw`d[ée]signation\p{L}*`, "d[ée]signant",
  String.raw`r[ée]compense\p{L}*`, String.raw`actes? de courage`, "d[ée]vouement", "m[ée]dailles?", "distinctions?", String.raw`d[ée]cor\p{L}+`, "honorariat",
  "honoraires?", String.raw`int[ée]rim\p{L}*`, "suppl[ée]ance", String.raw`habilitation\p{L}*`, String.raw`habilit\p{L}+`, String.raw`agr[ée]ment\p{L}*`, String.raw`agr[ée][ée]\p{L}*`, "promotion",
].join("|"));
// 3. A declaration of services à la personne: a person's (récépissé, n° SAP, organisme OSP).
const SAP = /r[ée]c[ée]piss[ée]|(?<![\p{L}\p{N}])SAP\s*\d|(?<![\p{L}\p{N}])OSP(?![\p{L}\p{N}])/iu;
// 4. A sanction or a demand addressed to a named business.
const SANCTION = /fermeture (?:temporaire |provisoire |administrative )*(?:d[’']activit|de l[’']?[ée]tablissement|pour)|travail dissimul|mise en demeure|mettant en demeure|astreinte|redevable|sanction/iu;
// 5. A body's members by name.
const NOMINATIVE = /nominative/iu;
// 6a. An establishment's yearly prices named after someone, maybe: « tarification 2026 du CER de » and a word in capitals.
const TARIFICATION = /tarifications?(?![\p{L}])[\s\S]*?(?<![\p{L}])de\s+[A-ZÀ-Ý]{3,}(?![\p{L}])/u;

// 6b. The words a title writes that are first names too, and never a person's there.
const PAS_PRENOMS = new Set("France Réunion Marine Océane Soleil Rose Prima Sud Nord Est Ouest Grand Petite Belle Bonne Fleur Liberté Victoire Ange Capucine Garance Abeille Olive Salim".split(" ").map(fold));
// Places and things named after a person, as the titles write them: not a person.
const CHOSES = ["Roland Garros", "Rolland Garros", "Marion Dufresne", "Ravine Blanche", "Caserne Lambert"].map(fold);
// The gazetteer's names, longest first: a first name inside one (« Sainte-Marie ») is the place's.
const LIEUX = [...new Set(gazetteer.places.map((p) => fold(p.nom)))].filter((p) => p.length > 3).sort((x, y) => y.length - x.length);
// The words around a first name that do not make it a person's.
const VOISINS = new Set(["arrete", "decision", "portant", "la", "le", "les", "de", "du", "des"]);
const SAINTS = new Set(["saint", "sainte", "st", "ste"]);
const MOT = /[A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)*/g;
const upper = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase();
const capital = (w: string) => /^\p{Lu}/u.test(w);

/** The first names of scripts/raa-prenoms.txt (scripts/build-raa-prenoms.py), folded. */
export function prenoms(file = new URL("./raa-prenoms.txt", import.meta.url)): Set<string> {
  return new Set(readFileSync(file, "utf8").split("\n").filter((l) => l && !l.startsWith("#")));
}

/** A first name beside another capitalised word, out of the names of places and of things, and of saints. */
function personne(titre: string, noms: Set<string>): boolean {
  const t = titre.replace(/_/g, " ");
  let f = fold(t);
  for (const x of [...CHOSES, ...LIEUX]) f = f.split(x).join(" ".repeat(x.length));
  const mots = [...t.matchAll(MOT)].map((m) => ({ at: m.index, w: m[0] }));
  return mots.some(({ at, w }, i) => {
    if (!f.slice(at, at + w.length).trim() || (upper(w) && w.length <= 4) || !noms.has(fold(w)) || PAS_PRENOMS.has(fold(w))) return false;
    if (i && SAINTS.has(fold(mots[i - 1].w))) return false;
    return [mots[i - 1], mots[i + 1]].some((x) => x && capital(x.w) && !VOISINS.has(fold(x.w)));
  });
}

/** The filters, in the order the measure gives them (the PR's table). */
export const FILTRES: { nom: string; ecarte: (titre: string, noms: Set<string>) => boolean }[] = [
  { nom: "civilité", ecarte: (t) => CIVILITE.test(t) },
  { nom: "mots qui visent une personne", ecarte: (t) => MOTS.test(t) },
  { nom: "services à la personne", ecarte: (t) => SAP.test(t) },
  { nom: "sanction d'un établissement", ecarte: (t) => SANCTION.test(t) },
  { nom: "composition nominative", ecarte: (t) => NOMINATIVE.test(t) },
  { nom: "prénom", ecarte: (t, noms) => personne(t, noms) },
  { nom: "tarification d'un établissement", ecarte: (t) => TARIFICATION.test(t) },
  { nom: "moins de 3 mots", ecarte: (t) => t.split(/[\s_]+/).filter(Boolean).length < 3 },
];

/** The filter that leaves a title out, undefined when it is kept. */
export function ecarte(titre: string, noms: Set<string>): string | undefined {
  return FILTRES.find((x) => x.ecarte(titre, noms))?.nom;
}

/**
 * The acts of a recueil to add to those kept (`actes`): its titles that no filter leaves out, and that name a place;
 * an act already kept, by its PDF or its title, once (a monthly recueil may list again the acts of the month's
 * « Spécial » ones). `gardes`: how many titles the filters kept.
 */
export function garder(lus: Lu[], r: Recueil, noms: Set<string>, actes: Acte[]): { ajoutes: Acte[]; gardes: number } {
  const had = new Set(actes.flatMap((a) => [a.pdf, a.titre]));
  const kept = lus.filter((a) => !ecarte(a.titre, noms));
  const ajoutes: Acte[] = [];
  for (const a of kept) {
    const { communes, lieux } = placesIn(a.titre.replace(/_/g, " "));
    if (!(communes.length || lieux.length) || had.has(a.pdf) || had.has(a.titre)) continue;
    had.add(a.pdf).add(a.titre);
    ajoutes.push({ ...a, recueil: { numero: r.numero, date: r.date, lien: r.lien }, communes, lieux });
  }
  return { ajoutes, gardes: kept.length };
}
