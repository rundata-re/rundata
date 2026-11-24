import type { Cache } from "../cache.js";
import { localTime } from "../geo.js";
import * as gdacs from "../providers/cyclones.js";
import * as cmrs from "../providers/cmrs-carte.js";
import * as cmrsTrace from "../providers/cmrs-trace.js";
import { SITE_URL } from "./citer.js";
import * as mf from "../providers/vigilance.js";
import { why } from "../types.js";
import { later } from "../budget.js";
import { noteLecture } from "../lectures.js";
import { credits, text } from "./format.js";
import * as prefecture from "../providers/prefecture.js";
import { ecolesBlock, ORSEC, quotidienLine } from "./ecoles.js";
import { cyclone as cycloneAlert } from "./vigilance.js";
import { jourFr, kmh, mesures, PASSES, passeOf, rafale, RAIN_NOTE, records, total, type Passe } from "../historique/cyclones-passes.js";
import { SOURCE as CLIMAT } from "../providers/climat.js";

/** « 03/02 à 10:00 », heure de La Réunion. */
const at = (iso: string) => localTime(new Date(iso)).replace(" ", " à ");
/** « 03/02/2026 ». */
const date = (iso: string) => {
  const l = localTime(new Date(iso)).split(" ")[0];
  return `${l}/${new Date(new Date(iso).getTime() + 4 * 3600_000).getUTCFullYear()}`;
};
export const OFFICIAL = {
  meteo_france: mf.OFFICIEL_CYCLONE,
  vigilance: mf.SOURCE.url,
  prefecture: "https://www.reunion.gouv.fr",
};

/**
 * Before the orange alert (or with no alert), what the /cyclones page shows: the link to /kit-cyclone, here with the
 * plan's own line on the kit (the same words as that page, p. 17; test/cyclones.test.ts checks they stay the same).
 */
export const SE_PREPARER = {
  conseil: "Vérifiez vos réserves (conserves, eau, piles pour radio et lampes, médicaments,…) au sein de votre kit d'urgence",
  d_apres: `${ORSEC.nom}, p. 17`,
  page: `${SITE_URL}/kit-cyclone`,
};
/** What /cyclones says under the alert scale, at all times, and the tool with it: the radio when the mobile network falls. */
export const RADIO = "Écoutez la radio en cas de cyclone\u00a0: le réseau mobile peut tomber.";
/** Whether to lead to the kit, on the page and in the tool alike: up to the pré-alerte (niveau ≤ 2), and with no alert. */
export const kitAvantOrange = (ecoles?: { niveau: number }) => (ecoles?.niveau ?? -1) <= 2;

const COMMON = {
  a_savoir:
    "Nom, stade et heure du dernier avis de chaque système, d'après le CMRS de La Réunion (Météo-France), le centre chargé des cyclones du sud-ouest de l'océan Indien, repris par GDACS toutes les 6 heures : " +
    "ils peuvent avoir quelques heures de retard. Trajectoire et bulletins officiels : consulter le site officiel de Météo-France. " +
    "Pour savoir quoi faire, seules comptent l'alerte cyclonique de la préfecture et les bulletins de Météo-France.",
  phases_alerte:
    "À La Réunion, la préfecture déclenche : la pré-alerte cyclonique (menace dans les jours à venir, s'informer), l'alerte orange (danger dans les 24 heures, se préparer), " +
    "l'alerte rouge (danger imminent, se confiner), l'alerte violette (confinement strict, même les secours ne circulent plus), puis la phase de sauvegarde (après le passage, rester prudent).",
  saison: "La saison cyclonique va de novembre à avril\u00a0; des systèmes se forment parfois hors saison.",
};

/**
 * An active system as the RSMC's last advisory names it: no position, distance, wind or forecast, which Météo-France's
 * official site gives. No stage when that advisory could not be read.
 */
export function activeRow(s: gdacs.Systeme, avis: gdacs.Avis | undefined) {
  return {
    nom: s.nom,
    stade: avis?.stade,
    dernier_avis: `${at(avis?.heure ?? s.fin)} (heure de La Réunion)`,
    centre: s.centre,
    rapport: s.rapport,
  };
}

/**
 * A system the RSMC follows while GDACS has none (providers/cmrs-trace.ts): « zone perturbée n° 2 », or its stage and
 * name once named, and its bulletin's time and number. Never its position nor its forecast (agreement of 02/11/2026).
 */
export function suiviRow(s: cmrsTrace.Suivi) {
  return {
    systeme: s.nom ? `${s.stade} ${s.nom}` : `${s.stade} n° ${s.systeme}`,
    stade: s.stade,
    dernier_avis: `${at(s.emis)} (heure de La Réunion)`,
    source: `Météo-France, CMRS de La Réunion, bulletin WTIO31 FMEE n° ${s.numero}`,
  };
}

/** What a stage is, said after it where it could be read as a storm. */
const STADE_DIT: Record<string, string> = {
  "zone perturbée": "Une zone perturbée est le stade le plus faible\u00a0: ce n'est pas une tempête.",
};

/**
 * « 1 système suivi par le CMRS de La Réunion : zone perturbée n° 2, d'après son avis du 06/11 à 10:54 (heure de La
 * Réunion). Une zone perturbée est… »; without its count, for the page, whose figure says it.
 */
export function suiviPhrase(rows: ReturnType<typeof suiviRow>[], compte = true): string {
  const n = rows.length;
  const head = `${compte ? `${n} ` : ""}système${n > 1 ? "s" : ""} suivi${n > 1 ? "s" : ""} par le CMRS de La Réunion\u00a0: `;
  const items = rows.map((r) => `${r.systeme}, d'après son avis du ${r.dernier_avis}`).join("\u00a0; ");
  return [`${head}${items}.`, ...new Set(rows.map((r) => STADE_DIT[r.stade]).filter(Boolean))].join(" ");
}

export function seasonRow(s: gdacs.Systeme) {
  return {
    nom: s.nom,
    du: date(s.debut),
    au: date(s.fin),
    centre: s.centre,
    rapport: s.rapport,
  };
}

// reunion.gouv.fr can hang for seconds (24/10/2026): the answer does not wait for it longer than this.
const PREFECTURE_WAIT_MS = 3000;
/** The vigilance not read: said first, never an answer that reads as « no alert » (23/11/2026). */
export const ALERTE_NON_LUE = "L'alerte cyclonique de Météo-France n'a pas pu être lue à l'instant : voir vigilance.meteofrance.fr et la préfecture (reunion.gouv.fr).";

/** The cyclone alert of the prefecture through Météo-France's vigilance, and what it means for the schools; `non_lue` when it cannot be read, undefined without the key. */
async function alert(cache: Cache, now: Date) {
  if (!mf.enabled()) return undefined;
  try {
    // The prefecture's last decision beside the bulletin: never more than the bulletin's wait, and none when it fails.
    const decision = prefecture.cyclone(cache).then((x) => x.value).catch(() => null);
    const [v, c] = await Promise.all([mf.vigilance(cache).then((x) => x.value), Promise.race([decision, new Promise<null>((r) => setTimeout(() => r(null), PREFECTURE_WAIT_MS))])]);
    // The cyclone's section of the prefecture not read: a decision may be missing, said beside the alert.
    const silent = await prefecture.rubriqueNonLue(cache, now).catch(() => undefined);
    return { texte: cycloneAlert(v, now), ecoles: ecolesBlock(v, now, c), vie_quotidienne: quotidienLine(v, now), injoignable: silent };
  } catch (err) {
    console.error(`source ${mf.SOURCE.id} indisponible:`, why(err));
    return { non_lue: ALERTE_NON_LUE };
  }
}

/** The past cyclones with a page, for the tool's description. */
export const PASSES_LIST = PASSES.map((p) => `${p.nom} ${p.annee}`).join(", ");

/** A past cyclone: its passage as the named document writes it, and what Météo-France's stations measured. */
export function passe(c: Passe) {
  const { jours, stations } = mesures(c);
  const gusts = stations
    .map((s) => ({ s, g: rafale(s, jours) }))
    .filter((x): x is { s: (typeof stations)[number]; g: { ms: number; jour: string } } => !!x.g)
    .sort((a, b) => b.g.ms - a.g.ms);
  const page = `https://rundata.re/cyclones/${c.slug}`;
  return text({
    cyclone: `${c.nom} (${c.annee})`,
    passage: c.passage,
    passage_d_apres: { document: c.document.titre, auteur: c.document.auteur, lien: c.document.url },
    alerte_cyclonique: c.alerte ? `${c.alerte}, d'après le même document` : undefined,
    jours: jours.map(jourFr),
    pluie_du_jour: RAIN_NOTE,
    stations_les_plus_arrosees: stations.slice(0, 15).map((s) => ({
      station: s.station,
      altitude_m: s.alt,
      pluie_mm: Object.fromEntries(jours.map((d, i) => [jourFr(d), s.rr?.[i] ?? null])),
      total_mm: total(s.rr),
    })),
    rafales_les_plus_fortes: gusts.slice(0, 10).map(({ s, g }) => ({ station: s.station, jour: jourFr(g.jour), rafale_kmh: kmh(g.ms), rafale_ms: g.ms })),
    stations: { avec_pluie: stations.filter((s) => s.rr).length, avec_rafale: gusts.length },
    records_battus: records(c).map((r) => ({
      station: r.station,
      jour: jourFr(r.jour),
      ...(r.quoi === "pluie" ? { pluie_mm: r.mm } : { rafale_kmh: kmh(r.ms!), rafale_ms: r.ms }),
      record_de_la_station: `mesures depuis ${r.depuis}`,
    })),
    selon_meteo_france: c.extraits
      ? {
          attribution: `Citations de Météo-France, mot pour mot (${c.document.titre}, ${c.extraits.reference}) : à attribuer à Météo-France, jamais à rundata.re.`,
          // Fixed keys, for a model to read: the sentence that introduces the quotes, then the quotes.
          intro: c.extraits.intro,
          citations: c.extraits.citations,
          a_savoir: c.extraits.note,
        }
      : undefined,
    page,
    a_savoir: `Seulement ce que les stations ont mesuré et le passage tel que le document cité l'écrit : ni victimes, ni dégâts. Toutes les stations sur ${page}.`,
    sources: credits([CLIMAT]),
  });
}

/** The RSMC's forecast track map as an answer gives it: its address on rundata.re and its caption (marketing, 27/10). */
export function carteOfficielle(c: cmrs.Carte | undefined) {
  if (!c?.image) return undefined;
  return {
    image: `${SITE_URL}${cmrs.imagePath(c.image.empreinte)}`,
    legende: `Source : Météo-France. Carte de prévision de trajectoire du CMRS de La Réunion\u00a0; son heure d'émission est écrite sur la carte. Lue sur le site de Météo-France le ${at(c.image.lue)} (heure de La Réunion).`,
    source: "Météo-France",
    // A condition of the agreement, beside the map wherever it is shown.
    officiel: mf.officiel(mf.OFFICIEL_CYCLONE),
  };
}

/**
 * How long a call waits for GDACS's list when its copy says no system is active and no cyclone alert is up, ms: past it,
 * that copy, its time said, and the read goes on after the answer. The wait of /aujourdhui/<commune> for an assistant
 * (web/site.ts HOME_READER_WAIT_MS). Its keys are always waited for by the cache (cache.ts ALWAYS_WAITED): from 21 to
 * 24/11/2026 (Analytics Engine), 36 of the tool's 134 calls took more than 2 s, 2,568 ms in the middle when the list was
 * read again, with no system active in the basin.
 */
export const CALME_WAIT_MS = 800;
/** A copy of the list older than this, ms, is no answer in its place: the read is waited for, as before. */
export const CALME_COPIE_MAX_MS = 3600_000;

/**
 * GDACS's list as the call can tell it. While a system is active in the newest copy, or a cyclone alert is up or could
 * not be read (or the vigilance is not plugged in), or the copy is older than CALME_COPIE_MAX_MS or missing, the read is waited for as long as it takes: a cyclone is never told
 * from an old copy. Otherwise past CALME_WAIT_MS the copy is the answer, noted as a late read (tools/fraicheur.ts).
 */
async function systemesDuMoment(cache: Cache, now: Date, alerted: ReturnType<typeof alert>): Promise<{ value: gdacs.Systeme[] }> {
  const read = gdacs.systemes(cache, now);
  // Its failure handled where it is awaited, below or by the caller: none left unhandled while the copy is read.
  read.catch(() => undefined);
  const copie = await cache.peek<gdacs.Systeme[]>("cyclones:liste").catch(() => undefined);
  if (!copie || now.getTime() - copie.fetchedAt.getTime() >= CALME_COPIE_MAX_MS || copie.value.some((s) => gdacs.isActive(s, now))) return read;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), CALME_WAIT_MS)));
  const got = await Promise.race([read, late]);
  clearTimeout(timer);
  if (got) return got;
  // A cyclone alert up, or not read (a doubt): GDACS waited for, whatever its copy says.
  const a = await alerted;
  if (!a || a.texte || a.non_lue) return read;
  later(read.catch(() => undefined));
  console.log(`lecture trop lente pour la réponse : cyclones:liste, copie du ${copie.fetchedAt.toISOString()} servie, aucun système actif`);
  noteLecture({ key: "cyclones:liste", fetchedAt: copie.fetchedAt.getTime(), stale: true, tardive: true, freshSeconds: gdacs.LIST_FRESH_SECONDS, source: gdacs.SOURCE.id });
  return copie;
}

/** `lieu` is still accepted, for the clients that send it, and has no effect: no distance is computed any more. */
export async function cyclones(cache: Cache, _lieu: string | undefined, now = new Date(), nom?: string) {
  if (nom?.trim()) {
    const c = passeOf(nom);
    if (c) return passe(c);
  }
  const officiel = mf.officiel(mf.OFFICIEL_CYCLONE);

  // The alert is read beside GDACS's list, not after it: a slow list no longer leaves the prefecture's copy no time
  // within the answer's wait (server.ts TOOL_WAIT_MS; 06/11/2026, its copy served 48 minutes old). It never throws.
  const alerted = alert(cache, now);
  let list: gdacs.Systeme[];
  try {
    list = (await systemesDuMoment(cache, now, alerted)).value.filter((s) => s.debut <= now.toISOString());
  } catch (err) {
    console.error(`source ${gdacs.SOURCE.id} indisponible:`, why(err));
    const a = await alerted;
    return {
      ...text({ erreur: "Le suivi des systèmes tropicaux (GDACS) ne répond pas pour le moment.", alerte_cyclonique: a?.texte ?? a?.non_lue, injoignable: a?.injoignable, ecoles: a?.ecoles, officiel, consulter: OFFICIAL, sources: credits([gdacs.SOURCE]) }),
      isError: true,
    };
  }

  const [active, a] = await Promise.all([gdacs.actifs(cache, list, now), alerted]);
  const alerte = a?.texte;
  const rows = active.map((x) => activeRow(x.systeme, x.avis));
  // GDACS lists a system hours or days after the RSMC follows it: meanwhile, the RSMC's own bulletins say it.
  const suivis = rows.length ? [] : (await cmrsTrace.suivisKept(now)).map(suiviRow);
  // The RSMC's map, kept by the scheduled event while a system is active or followed by the RSMC: only when it follows
  // the newest bulletin.
  const carte = rows.length || suivis.length ? carteOfficielle(await cmrs.kept()) : undefined;
  const season = gdacs.seasonOf(now);
  const previous = `${Number(season.nom.slice(0, 4)) - 1}-${season.nom.slice(0, 4)}`;
  const thisSeason = list.filter((s) => s.debut >= season.debut);
  const lastSeason = list.filter((s) => s.debut < season.debut);
  const lastOne = list[0];

  const parts: string[] = [];
  if (alerte) parts.push(alerte);
  if (a?.non_lue) parts.push(a.non_lue);
  if (a?.injoignable) parts.push(a.injoignable);
  if (rows.length) {
    parts.push(`${rows.length} système${rows.length > 1 ? "s" : ""} tropical${rows.length > 1 ? "aux" : ""} actif${rows.length > 1 ? "s" : ""} dans le sud-ouest de l'océan Indien.`);
    for (const r of rows) {
      const name = r.nom.charAt(0).toUpperCase() + r.nom.slice(1);
      const when = r.dernier_avis.replace(" (heure de La Réunion)", "");
      parts.push(r.stade ? `${name} : ${r.stade}, d'après l'avis du CMRS du ${when}.` : `${name} : dernier avis du CMRS le ${when}.`);
    }
  } else if (suivis.length) {
    parts.push(suiviPhrase(suivis));
  } else {
    parts.push("Aucun système tropical actif dans le sud-ouest de l'océan Indien.");
    parts.push(
      thisSeason.length
        ? `Saison ${season.nom} : ${thisSeason.length} système${thisSeason.length > 1 ? "s" : ""} jusqu'ici.`
        : `Saison ${season.nom} : aucun système pour le moment.`,
    );
    if (lastOne) parts.push(`Dernier système : ${lastOne.nom}, du ${date(lastOne.debut)} au ${date(lastOne.fin)}.`);
  }
  // Météo-France's link last, with no full stop after its address.
  parts.push(officiel);

  return text({
    resume: parts.join(" "),
    alerte_cyclonique: alerte ?? a?.non_lue,
    injoignable: a?.injoignable,
    vie_quotidienne: a?.vie_quotidienne,
    ecoles: a?.ecoles,
    se_preparer: kitAvantOrange(a?.ecoles) ? SE_PREPARER : undefined,
    radio: RADIO,
    systemes_actifs: rows.length ? rows : undefined,
    suivi_cmrs: suivis.length ? suivis : undefined,
    carte_officielle: carte,
    saison_en_cours: { nom: season.nom, systemes: thisSeason.map(seasonRow) },
    saison_precedente: rows.length ? undefined : { nom: previous, systemes: lastSeason.map(seasonRow) },
    cyclone_passe: nom?.trim()
      ? `Pas de mesures sur rundata.re pour « ${nom.trim()} »\u00a0; cyclones passés disponibles : ${PASSES_LIST}.`
      : undefined,
    ...COMMON,
    officiel,
    consulter: OFFICIAL,
    sources: credits([gdacs.SOURCE, ...(suivis.length ? [cmrsTrace.SOURCE] : []), ...(alerte ? [mf.SOURCE] : [])]),
  });
}
