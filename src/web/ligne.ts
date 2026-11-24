/**
 * The bus lines that have their page (/bus/ligne/<network>/<line>, web/ligne-page.ts), 24/11/2026: those of Car Jaune,
 * Alternéo and Estival, from their GTFS (Licence Ouverte). The list only, bundled with the timetables' network
 * (src/transit/network.json), read by the page, by /bus that links them and by the transports tool that gives their
 * address: no timetable is read here.
 */
import * as transit from "../providers/transit.js";
import { slugify } from "./places.js";

export const LINE_PATH = "/bus/ligne";

/** The networks whose lines have their page, in the order of /bus. */
export const LINE_NETWORKS = ["carjaune", "alterneo", "estival"] as const;

export interface LinePage {
  /** « carjaune/s1 », after LINE_PATH. */
  slug: string;
  reseau: string;
  /** Its name as the network writes it, « S1 ». */
  ligne: string;
  /** Its long name as people read it, « St-Benoît / St-Pierre par le Grand Brûlé ». */
  nom?: string;
  /** Its routes: two of one name in a network are one line, as the tool reads them (tools/transports.ts `linesNamed`). */
  routes: number[];
}

let pages: Map<string, LinePage> | undefined;
/** The line pages by their slug, in the networks' order, then their lines'. */
export function linePages(): Map<string, LinePage> {
  if (pages) return pages;
  pages = new Map();
  for (const net of LINE_NETWORKS) {
    transit.ROUTES.forEach(([n, short, long], i) => {
      if (n !== net) return;
      const ligne = short || long;
      const slug = `${net}/${slugify(ligne)}`;
      const p = pages!.get(slug);
      if (p) p.routes.push(i);
      else pages!.set(slug, { slug, reseau: net, ligne, ...(short && long ? { nom: transit.stopName(long) } : {}), routes: [i] });
    });
  }
  return pages;
}

/** The page of the line of these routes, when they are one line that has its page. */
export function lineOfRoutes(routes: number[]): LinePage | undefined {
  const [first] = routes;
  if (first === undefined) return undefined;
  const p = [...linePages().values()].find((x) => x.routes.includes(first));
  return p && routes.every((r) => p.routes.includes(r)) ? p : undefined;
}
