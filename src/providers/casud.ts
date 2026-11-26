/**
 * « Météo des déchèteries » of the CASUD (tri-casud.re/meteo-des-dechets, the intercommunality's own site, rule of the
 * communes' public data): for each of its sites and each kind of waste, « Disponible », « Moitié plein », « Plein » or,
 * for the compost given away, « Non disponible », filled in by its staff, each site with its own time (« Informations
 * actualisées le 26/11/2026 à 07:49 »). Read on 26/11/2026: four déchèteries (Terrain Fleury, Trois-Mares and the 23e
 * km at Le Tampon, Les Grègues at Saint-Joseph) and the drop-off point of Bois Court (Le Tampon), updated in the morning;
 * none at L'Entre-Deux nor Saint-Philippe. The sites themselves are bundled (vie/decheteries.ts, CASUD_SITES), tied by
 * the id of their block on the page.
 *
 * The page weighs about 1 MB, nine tenths of it icons drawn in SVG: read at most twice an hour (FRESH_SECONDS), only
 * when asked, its SVG cut before the rest is read.
 */
import type { Cache, Cached } from "../cache.js";
import { getText, UA_RUNDATA } from "../http.js";
import type { SourceInfo } from "../types.js";
import type { Etat } from "./tco.js";

export const SOURCE: SourceInfo = {
  id: "casud_decheteries",
  nom: "Météo des déchèteries de la CASUD",
  organisme: "CASUD (Communauté d'agglomération du Sud)",
  licence: "Information publique de l'intercommunalité, reprise avec sa source et son lien",
  attribution: "CASUD",
  url: "https://tri-casud.re/meteo-des-dechets",
};

/**
 * The kinds of waste as the page names them, in the words of the TCO's where they are the same (« Déchet vert »:
 * déchets verts), else in their own: the CASUD sorts cardboard apart from newspapers, and has a skip for frying oil.
 */
export const KINDS: Record<string, string> = {
  "ampoule / néon": "ampoules et néons",
  batterie: "batteries",
  carton: "cartons",
  "déchet vert": "déchets verts",
  ecomaison: "mobilier (Ecomaison)",
  électroménager: "électroménager",
  electroménager: "électroménager",
  encombrant: "encombrants",
  gravat: "gravats",
  "huile de friture": "huiles de friture",
  "huile vidange": "huiles de vidange",
  "magazine / journaux": "journaux et revues",
  métaux: "métaux",
  pile: "piles",
  verre: "verre",
  textile: "textiles",
  compost: "compost",
};

const decode = (s: string) => s.replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * Each site's block: its id (« decheterie-des-gregues »), the time its staff last filled it in, and each kind's state.
 * A kind « Plein » or « Non disponible » does not take (false), « Disponible » and « Moitié plein » do. A kind the
 * page names anew is kept in its own words, lower case.
 */
/** The page with its icons cut out (9/10 of its weight, and between a kind's name and its state): « <svg … </svg> ». */
function withoutIcons(page: string): string {
  let out = "";
  let from = 0;
  for (let at = page.indexOf("<svg", from); at !== -1; at = page.indexOf("<svg", from)) {
    const end = page.indexOf("</svg>", at);
    if (end === -1) break;
    out += page.slice(from, at);
    from = end + "</svg>".length;
  }
  return out + page.slice(from);
}

export function parse(page: string): Etat[] {
  const html = withoutIcons(page);
  return html.split(/(?=<div class="card-header)/).flatMap((block) => {
    const id = /aria-controls="([a-z0-9-]+)"/.exec(block)?.[1];
    if (!id) return [];
    const at = /Informations actualisées le (\d\d)\/(\d\d)\/(\d{4}) à (\d\d):(\d\d)/.exec(block);
    const maj = at ? new Date(`${at[3]}-${at[2]}-${at[1]}T${at[4]}:${at[5]}:00+04:00`).toISOString() : undefined;
    const accepte: Record<string, boolean> = {};
    // « <div class="text-uppercase mb-2"><strong>Carton</strong></div> <div>(icon) Disponible</div> », the icon cut.
    for (const m of block.matchAll(/<div class="text-uppercase mb-2">\s*(?:<strong>)?([^<]+)(?:<\/strong>)?\s*<\/div>\s*<div>\s*([^<]+)</g)) {
      const name = decode(m[1]).toLowerCase();
      const state = decode(m[2]).toLowerCase();
      if (!/^(disponible|moitié plein|plein|non disponible)$/.test(state)) continue;
      accepte[KINDS[name] ?? name] = state === "disponible" || state === "moitié plein";
    }
    return [{ lien: `${SOURCE.url}#${id}`, maj, accepte }];
  });
}

/** The staff fill it in about once a morning (26/11/2026: 07:49 to 08:46, Bois Court the day before): half an hour. */
export const FRESH_SECONDS = 30 * 60;

export function meteo(cache: Cache): Promise<Cached<Etat[]>> {
  return cache.get("casud:meteo", FRESH_SECONDS, async () => parse(await getText(SOURCE.id, SOURCE.url, 15_000, { "User-Agent": UA_RUNDATA })));
}
