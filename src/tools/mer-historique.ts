/**
 * The sea's deep history (providers/mer-historique.ts) as the page /mer/historique and the tool temperature_mer say it,
 * from one computation: for each buoy and each beach, its years, its records with their day, the mean of each day of
 * the year over the years measured, the same day in every year (« ce jour-là »), and the mean of each year.
 *
 * The means are named for what they are: « moyenne 2003-2025 » (the satellite's full years) or « moyenne des années
 * mesurées » (a buoy's years, often few and not following). Never « normale »: a climate normal is 30 years, 1991-2020.
 */
import type { Cache, Cached } from "../cache.js";
import { distanceKm } from "../geo.js";
import * as mh from "../providers/mer-historique.js";
import { fr } from "./format.js";

const DAY = 86_400_000;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
export const metres = (v: number) => `${fr(r1(v))}\u00a0m`;
export const degres = (v: number) => `${fr(r1(v))}\u00a0°C`;

/** A satellite year counts in the mean when it has at least this many days (a year cut short would tilt the mean). */
const ANNEE_PLEINE = 330;
/** A buoy's year is shown in the yearly means with at least this many days, and its month with this many. */
const ANNEE_MIN_JOURS = 200;
const MOIS_MIN_JOURS = 15;

/** The days of a leap year as « MM-JJ », the index of the means by day. */
export const JOURS_ANNEE = Array.from({ length: 366 }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * DAY).toISOString().slice(5, 10));
const indexJour = new Map(JOURS_ANNEE.map((j, i) => [j, i]));

/** « 2010-03-15 » for day `i` (0-based) of year `y`. */
const jourDe = (y: number, i: number) => new Date(Date.UTC(y, 0, 1) + i * DAY).toISOString().slice(0, 10);
/** « 15/03/2010 ». */
export const dateDite = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;

export interface Releve {
  valeur: number;
  /** « YYYY-MM-DD ». */
  le: string;
}

/** What each source's history is about: its main field, and the records kept. */
export const SUJETS = {
  candhis: { champ: "hs_moy", nom: "hauteur significative des vagues, moyenne du jour", mot: metres, records: [
    { champ: "hs_max", nom: "houle la plus forte (hauteur significative)", haut: true },
    { champ: "hmax", nom: "vague la plus haute", haut: true },
  ] },
  crw: { champ: "sst", nom: "température de surface de la mer", mot: degres, records: [
    { champ: "sst", nom: "mer la plus chaude", haut: true },
    { champ: "sst", nom: "mer la plus fraîche", haut: false },
  ] },
} as const;

export interface ResumePoint {
  source: mh.Source;
  point: string;
  nom: string;
  lat: number;
  lon: number;
  credit: string;
  /** The first and last year with a measurement, and how many years and days have one. */
  du: number;
  au: number;
  annees: number;
  jours: number;
  dernier: string;
  records: { nom: string; valeur: number; le: string; dit: string }[];
  /** The mean's name, and its value for each day of the year (JOURS_ANNEE), null without a measurement that day. */
  moyenne: { nom: string; par_jour: (number | null)[] };
  /** The main field in every year, the day asked (« ce jour-là »). */
  ce_jour_la: { jour: string; valeurs: { annee: number; valeur: number }[]; moyenne?: number };
  /** The mean of each year with enough days, and of each month of the year over the years. */
  par_an: { annee: number; moyenne: number; jours: number }[];
  par_mois: (number | null)[];
  /** The current year, day by day (the satellite: against the mean). */
  annee_en_cours?: { annee: number; valeurs: (number | null)[] };
}

export interface Resume {
  /** False until the tables are imported: « historique en cours d'import ». */
  importe: boolean;
  jour: string;
  points: ResumePoint[];
}

export const EN_COURS =
  "Historique en cours d'import\u00a0: les années passées des bouées et du satellite arrivent dans les prochains jours. En attendant, les 30 derniers jours sont sur la page mer.";

const moyenne = (vs: number[]) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : undefined);

/** Every point of the archive summed up, « ce jour-là » being `jour` (« YYYY-MM-DD », La Réunion). */
export function resumer(a: mh.Archive, jour: string): Resume {
  const points: ResumePoint[] = [];
  const mmjj = jour.slice(5, 10);
  const anneeEnCours = +jour.slice(0, 4);
  for (const p of a.points) {
    const ans = a.jours[mh.cle(p)] ?? {};
    const sujet = SUJETS[p.source];
    const years = Object.keys(ans).map(Number).sort((x, y) => x - y);
    const champ = (y: number, c: string) => (ans[y] as Record<string, (number | null)[] | undefined>)[c] ?? [];
    let jours = 0;
    let dernier = "";
    const parAn: ResumePoint["par_an"] = [];
    for (const y of years) {
      const vs = champ(y, sujet.champ);
      const known = vs.filter((v): v is number => typeof v === "number");
      jours += known.length;
      let last = vs.length - 1;
      while (last >= 0 && typeof vs[last] !== "number") last--;
      if (last >= 0) dernier = jourDe(y, last);
      const m = moyenne(known);
      if (m != null && known.length >= (p.source === "crw" ? ANNEE_PLEINE : ANNEE_MIN_JOURS)) parAn.push({ annee: y, moyenne: r2(m), jours: known.length });
    }
    if (!jours) continue;
    // The satellite's mean over its full years only, named by them; a buoy's over every year it measured.
    const pleines = p.source === "crw" ? parAn.filter((x) => x.annee < anneeEnCours).map((x) => x.annee) : years;
    const nomMoyenne = p.source === "crw" && pleines.length ? `moyenne ${pleines[0]}-${pleines[pleines.length - 1]}` : "moyenne des années mesurées";
    const parJour: number[][] = JOURS_ANNEE.map(() => []);
    const parMois: number[][] = Array.from({ length: 12 }, () => []);
    const ceJour: { annee: number; valeur: number }[] = [];
    const records = sujet.records.map((r) => ({ ...r, best: undefined as Releve | undefined }));
    for (const y of years) {
      const vs = champ(y, sujet.champ);
      const dansMoyenne = pleines.includes(y);
      const mois: number[][] = Array.from({ length: 12 }, () => []);
      vs.forEach((v, i) => {
        if (typeof v !== "number") return;
        const d = jourDe(y, i);
        if (dansMoyenne) parJour[indexJour.get(d.slice(5, 10))!].push(v);
        mois[+d.slice(5, 7) - 1].push(v);
        if (d.slice(5, 10) === mmjj) ceJour.push({ annee: y, valeur: v });
      });
      mois.forEach((m, i) => {
        if (m.length >= MOIS_MIN_JOURS) parMois[i].push(moyenne(m)!);
      });
      for (const r of records) {
        champ(y, r.champ).forEach((v, i) => {
          if (typeof v === "number" && (!r.best || (r.haut ? v > r.best.valeur : v < r.best.valeur))) r.best = { valeur: v, le: jourDe(y, i) };
        });
      }
    }
    const mCe = moyenne(ceJour.filter((x) => pleines.includes(x.annee)).map((x) => x.valeur));
    const courante = p.source === "crw" && ans[anneeEnCours] ? champ(anneeEnCours, sujet.champ) : undefined;
    points.push({
      source: p.source, point: p.point, nom: p.nom, lat: p.lat, lon: p.lon, credit: p.credit,
      du: years[0], au: years[years.length - 1], annees: years.length, jours, dernier,
      records: records.flatMap((r) => (r.best ? [{ nom: r.nom, valeur: r.best.valeur, le: r.best.le, dit: `${sujet.mot(r.best.valeur)} le ${dateDite(r.best.le)}` }] : [])),
      moyenne: { nom: nomMoyenne, par_jour: parJour.map((v) => (v.length ? r2(moyenne(v)!) : null)) },
      ce_jour_la: { jour: mmjj, valeurs: ceJour.sort((x, y) => y.annee - x.annee).map((x) => ({ annee: x.annee, valeur: r2(x.valeur) })), ...(mCe != null ? { moyenne: r2(mCe) } : {}) },
      par_an: parAn,
      par_mois: parMois.map((v) => (v.length ? r2(moyenne(v)!) : null)),
      ...(courante ? { annee_en_cours: { annee: anneeEnCours, valeurs: courante.map((v) => (typeof v === "number" ? v : null)) } } : {}),
    });
  }
  return { importe: points.length > 0, jour, points };
}

/** Today in La Réunion, « YYYY-MM-DD ». */
export const aujourdhui = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

/**
 * The summary of today, kept 6 hours in the data center (a few Ko a point), the archive read whole to make it (about
 * 180 D1 rows). Empty, never an error, while the tables are not imported.
 */
export async function resume(cache: Cache, now: Date): Promise<Cached<Resume>> {
  const jour = aujourdhui(now);
  return cache.get(`mer:resume:${jour}`, mh.FRESH_SECONDS, async () => resumer(await mh.lire(), jour));
}

/** « 1996 à 2015 », « 2024 ». */
export const anneesDites = (p: Pick<ResumePoint, "du" | "au">) => (p.du === p.au ? `${p.du}` : `${p.du} à ${p.au}`);

const NATURE = {
  candhis: "mesure d'un houlographe du réseau Candhis (Cerema), moyenne du jour de ses mesures (toutes les 30\u00a0minutes, toutes les 3\u00a0heures les premières années)",
  crw: "température de surface vue par le satellite : analyse quotidienne de NOAA Coral Reef Watch (CoralTemp), une estimation au large, pas une mesure à la plage",
};

/**
 * The history as temperature_mer gives it: near a place, the beach and the buoys within `km`; else every point. With
 * `date` (« YYYY-MM-DD »), that day's value at each point beside the same day of the other years; else today's date in
 * the other years.
 */
export function historiqueBlock(
  r: Resume,
  near: { lon: number; lat: number } | undefined,
  km: number,
  date?: { jour: string; valeurs: Awaited<ReturnType<typeof mh.memeJour>>["value"] },
  origin = "https://rundata.re",
) {
  const page = `${origin}/mer/historique`;
  if (!r.importe) return { etat: EN_COURS, page };
  const d = (p: ResumePoint) => (near ? distanceKm(near.lon, near.lat, p.lon, p.lat) : 0);
  const crw = r.points.filter((p) => p.source === "crw").sort((a, b) => d(a) - d(b));
  const bouees = r.points.filter((p) => p.source === "candhis" && (!near || d(p) <= km)).sort((a, b) => d(a) - d(b));
  const champ = (p: ResumePoint) => SUJETS[p.source].champ;
  const mot = (p: ResumePoint) => SUJETS[p.source].mot;
  const jourVoulu = date?.jour;
  const out = (p: ResumePoint) => {
    // The day asked: from the query of that day; the same day in the other years from it too.
    const autres = date
      ? date.valeurs.filter((x) => x.source === p.source && x.point === p.point && typeof x.valeurs[champ(p) as mh.Champ] === "number")
        .map((x) => ({ annee: x.annee, valeur: x.valeurs[champ(p) as mh.Champ] as number })).sort((a, b) => b.annee - a.annee)
      : p.ce_jour_la.valeurs;
    const ceJour = jourVoulu ? autres.find((x) => x.annee === +jourVoulu.slice(0, 4)) : undefined;
    const m = p.moyenne.par_jour[JOURS_ANNEE.indexOf((jourVoulu ?? r.jour).slice(5, 10))];
    return {
      [p.source === "crw" ? "au_large_de" : "bouee"]: p.nom,
      nature: NATURE[p.source],
      ...(near ? { distance_km: Math.round(d(p) * 10) / 10 } : {}),
      annees: anneesDites(p),
      ...(jourVoulu
        ? { jour_demande: { date: dateDite(jourVoulu), valeur: ceJour ? mot(p)(ceJour.valeur) : `pas de mesure ce jour-là${+jourVoulu.slice(0, 4) < p.du || +jourVoulu.slice(0, 4) > p.au ? ` (mesures de ${anneesDites(p)})` : ""}` } }
        : {}),
      meme_jour_les_autres_annees: autres.filter((x) => x.annee !== ceJour?.annee).slice(0, 30).map((x) => `${x.annee} : ${mot(p)(x.valeur)}`),
      ...(m != null ? { moyenne_de_ce_jour: `${mot(p)(m)} (${p.moyenne.nom})` } : {}),
      records: Object.fromEntries(p.records.map((x) => [x.nom, x.dit])),
    };
  };
  return {
    sujet: `${SUJETS.candhis.nom} aux bouées Candhis, ${SUJETS.crw.nom} par satellite, ${jourVoulu ? `le ${dateDite(jourVoulu)}` : `le ${r.jour.slice(8, 10)}/${r.jour.slice(5, 7)}`} et les autres années`,
    bouees: bouees.map(out),
    ...(near && !bouees.length ? { bouees_absentes: `Aucune bouée Candhis n'a mesuré à moins de ${km} km de ce lieu.` } : {}),
    satellite: (near ? crw.slice(0, 1) : crw).map(out),
    satellite_depuis: mh.CRW_POURQUOI,
    moyennes: "Les moyennes portent sur les années mesurées, pas sur une normale climatique (1991-2020), que ces séries ne couvrent pas.",
    page,
  };
}
