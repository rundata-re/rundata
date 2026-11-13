import type { Cache } from "../cache.js";
import { localTime } from "../geo.js";
import { INSEE } from "../places/insee.js";
import * as arrete from "../providers/arrete-secheresse.js";
import { resolvePlace } from "../places/resolve.js";
import * as vigieau from "../providers/vigieau.js";
import { why } from "../types.js";
import { a, credits, notFound, placeBlock, text } from "./format.js";

export type Profil = "particulier" | "entreprise" | "collectivite" | "exploitation";

const COMMUNE_OF = Object.fromEntries(Object.entries(INSEE).map(([nom, code]) => [code, nom]));
const rank = (n: vigieau.Niveau) => vigieau.LEVELS.indexOf(n);
const name = (n: vigieau.Niveau) => vigieau.LEVEL_NAMES[n];
const day = (iso?: string) => iso?.split("-").reverse().join("/");
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} et ${xs.at(-1)}` : xs[0]);
const NONE = /^pas de (restriction|limitation)/i;

export function communeRow(zones: vigieau.Zone[], insee: string) {
  const of = (r: vigieau.Ressource) => zones.find((z) => z.insee === insee && z.ressource === r);
  const [aep, sup, sou] = [of("AEP"), of("SUP"), of("SOU")];
  return {
    commune: COMMUNE_OF[insee] ?? insee,
    eau_du_robinet: aep ? name(aep.niveau) : undefined,
    rivieres_et_sources: sup ? name(sup.niveau) : undefined,
    nappes: sou ? name(sou.niveau) : undefined,
    niveau_max: [aep, sup, sou].filter((z) => z).reduce((m, z) => Math.max(m, rank(z!.niveau)), -1),
  };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
const fileName = (url?: string) => {
  try {
    return url ? decodeURIComponent(url.split("/").pop() ?? "") : "";
  } catch {
    return url?.split("/").pop() ?? "";
  }
};

/** A level the order and VigiEau do not give the same, for one commune and one resource. */
export interface Ecart {
  commune: string;
  ressource: string;
  arrete: string;
  vigieau?: string;
}

/** The levels in force, and whose they are. */
export interface EnVigueur {
  zones: vigieau.Zone[];
  /** The order of `table` when its levels are the ones given, else undefined (VigiEau's are). */
  table?: arrete.Arrete;
  /** VigiEau still serves an older order than `table`: the day it took effect, YYYY-MM-DD. */
  vigieau_anterieur?: string;
  /** Where VigiEau gives another level than `table`. */
  ecarts: Ecart[];
}

/**
 * The levels of the order in force: VigiEau's, unless it still serves an older order than the one written by hand
 * (providers/arrete-secheresse.ts), whose levels then win, VigiEau's said beside them where they differ. VigiEau serves
 * that order once its file is named with its number, or once its order took effect on its signature day or the day after
 * (VigiEau dated the order of 09/10/2026 from 10/10): then the table is no longer needed, the differences still said.
 * An order of VigiEau's later than that is a newer order: VigiEau alone.
 */
export function enVigueur(vz: vigieau.Zone[], t: arrete.Arrete = arrete.ARRETE): EnVigueur {
  const since = vz.map((z) => z.depuis).filter((x): x is string => !!x).sort().pop();
  const named = vz.some((z) => fileName(z.arrete).includes(t.court));
  const same = named || (!!since && since >= t.signe_le && since <= addDays(t.signe_le, 1));
  if (!same && since && since > addDays(t.signe_le, 1)) return { zones: vz, ecarts: [] };
  const zones: vigieau.Zone[] = [];
  const ecarts: Ecart[] = [];
  for (const [insee, [sou, sup]] of Object.entries(t.niveaux)) {
    const aep = rank(sou) >= rank(sup) ? sou : sup;
    for (const [ressource, niveau] of [["AEP", aep], ["SOU", sou], ["SUP", sup]] as const) {
      const v = vz.find((z) => z.insee === insee && z.ressource === ressource);
      zones.push({ insee, ressource, nom: v?.nom ?? COMMUNE_OF[insee] ?? insee, niveau, depuis: t.depuis, arrete: t.url, usages: arrete.usages(niveau, ressource === "AEP") });
      if (v?.niveau !== niveau) ecarts.push({ commune: COMMUNE_OF[insee] ?? insee, ressource: ressource === "AEP" ? "eau du robinet" : vigieau.RESSOURCES[ressource], arrete: name(niveau), vigieau: v && name(v.niveau) });
    }
  }
  return { zones, table: t, vigieau_anterieur: same ? undefined : since, ecarts };
}

/** The levels from the least to the most severe, with what two of them mean: the tool's `echelle`, and the scale of /secheresse. */
export const SCALE: readonly (readonly [string, string?])[] = [
  ["vigilance", "économiser l'eau"],
  ["alerte"],
  ["alerte renforcée"],
  ["crise", "seuls les usages prioritaires : santé, salubrité, sécurité"],
];

const COMMON = {
  echelle: `Du moins au plus sévère : ${SCALE.map(([n, what]) => (what ? `${n} (${what})` : n)).join(", ")}.`,
  a_savoir: "Restrictions fixées par arrêté préfectoral, commune par commune. Une mairie ou le distributeur peut ajouter des coupures ou des tours d'eau : voir leurs avis.",
};

export async function restrictionsEau(cache: Cache, lieu: string | undefined, profil: Profil = "particulier") {
  let read: Awaited<ReturnType<typeof vigieau.zones>>;
  try {
    read = await vigieau.zones(cache);
  } catch (err) {
    console.error(`source ${vigieau.SOURCE.id} indisponible:`, why(err));
    return { ...text({ erreur: "Les restrictions d'eau (VigiEau) ne répondent pas pour le moment.", consulter: vigieau.SOURCE.url }), isError: true };
  }
  const v = enVigueur(read.value);
  const zones = v.zones;
  const since = zones.map((z) => z.depuis).filter(Boolean).sort().pop();
  const t = v.table;
  const ecartsOf = (commune?: string) => v.ecarts.filter((e) => !commune || e.commune === commune);
  // Said first, before the levels: the order the levels are from, and VigiEau's when it still serves an older one.
  const lead = {
    ...(t && {
      arrete: {
        numero: t.numero,
        signe_le: day(t.signe_le),
        en_vigueur_depuis: day(t.depuis),
        publie: t.recueil,
        lien: t.url,
        remplace: t.remplace,
      },
    }),
    ...(t && v.vigieau_anterieur && {
      vigieau: `VigiEau affiche encore l'arrêté précédent, en vigueur depuis le ${day(v.vigieau_anterieur)} (VigiEau lu le ${localTime(read.fetchedAt)}). Les niveaux donnés ici sont ceux de l'arrêté ${t.numero} du ${day(t.signe_le)}, en vigueur depuis le ${day(t.depuis)}, qui le remplace.`,
    }),
  };
  const common = {
    arrete_du: day(since),
    ...COMMON,
    consulter: t ? t.url : vigieau.SOURCE.url,
    sources: credits(t ? [arrete.SOURCE, vigieau.SOURCE] : [vigieau.SOURCE]),
  };
  const differe = (commune?: string) => {
    const e = ecartsOf(commune);
    return e.length ? e.map((x) => ({ commune: x.commune, ressource: x.ressource, arrete: x.arrete, vigieau: x.vigieau ?? "pas de restriction" })) : undefined;
  };

  if (!lieu?.trim()) {
    if (!zones.length) return text({ resume: "Aucune restriction d'eau en vigueur à La Réunion.", ...common });
    const rows = Object.values(INSEE).map((code) => communeRow(zones, code)).sort((x, y) => y.niveau_max - x.niveau_max || x.commune.localeCompare(y.commune, "fr"));
    const tap = [...vigieau.LEVELS].reverse()
      .map((lvl) => ({ lvl, list: rows.filter((r) => r.eau_du_robinet === name(lvl)).map((r) => r.commune) }))
      .filter((x) => x.list.length)
      .map((x) => `${name(x.lvl)} ${x.list.length > 4 ? `dans ${x.list.length} communes` : list(x.list.map(a))}`);
    return text({
      ...lead,
      resume: `Sécheresse à La Réunion${t ? ` (arrêté ${t.numero} du ${day(t.signe_le)}, en vigueur depuis le ${day(t.depuis)})` : since ? ` (arrêté en vigueur depuis le ${day(since)})` : ""}. Eau du robinet : ${tap.join("\u00a0; ")}.`,
      communes: rows.map(({ niveau_max: _, ...r }) => ({ ...r, ...(ecartsOf(r.commune).length && { vigieau_differe: differe(r.commune) }) })),
      ...common,
    });
  }

  const res = resolvePlace(lieu);
  if (!res) return notFound(lieu);
  const insee = INSEE[res.lieu.commune];
  const mine = zones.filter((z) => z.insee === insee);
  const aep = mine.find((z) => z.ressource === "AEP");
  if (!mine.length) {
    return text({ lieu: placeBlock(lieu, res), ...lead, resume: `Aucune restriction d'eau en vigueur ${a(res.lieu.commune)}.`, ...common });
  }
  const pick = (z?: vigieau.Zone) => (z?.usages ?? []).filter((u) => u[profil] && !NONE.test(u.restriction)).map((u) => ({ usage: u.nom, restriction: u.restriction }));
  const others = mine.filter((z) => z.ressource !== "AEP");
  const row = communeRow(zones, insee);
  return text({
    lieu: placeBlock(lieu, res),
    ...lead,
    resume: `Restrictions d'eau ${a(res.lieu.commune)} : ${aep ? `${name(aep.niveau)} pour l'eau du robinet` : "pas de restriction sur l'eau du robinet"}` +
      (others.length ? `\u00a0; ${others.map((z) => `${name(z.niveau)} pour les ${vigieau.RESSOURCES[z.ressource]}`).join(", ")}` : "") +
      (t ? `, d'après l'arrêté ${t.numero} du ${day(t.signe_le)}, en vigueur depuis le ${day(t.depuis)}` : "") + ".",
    niveaux: { eau_du_robinet: row.eau_du_robinet, rivieres_et_sources: row.rivieres_et_sources, nappes: row.nappes },
    ...(differe(res.lieu.commune) && { vigieau_differe: differe(res.lieu.commune) }),
    profil,
    restrictions_eau_du_robinet: aep ? pick(aep) : undefined,
    // For whoever draws from a river, a spring, a well or a borehole.
    restrictions_puits_forages_rivieres: others.length ? Object.fromEntries(others.map((z) => [vigieau.RESSOURCES[z.ressource], pick(z)])) : undefined,
    ...(!t && { arrete: aep?.arrete ?? mine[0].arrete }),
    ...common,
  });
}
