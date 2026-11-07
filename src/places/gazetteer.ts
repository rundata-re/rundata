/**
 * The gazetteer (gazetteer.json, scripts/build-gazetteer.py), its names as French writes them (noms.ts: « Pont d'Yves »,
 * « Cascade de Centrale »), the aliases' targets with them: the one way in for every module that reads it. Only what is
 * shown changes: the resolver compares names folded to small letters (resolve.ts tokens()), and finds the same places.
 */
import raw from "./gazetteer.json" with { type: "json" };
import { particules } from "../noms.js";

const named = <T extends { nom: string }>(list: T[]): T[] => list.map((p) => ({ ...p, nom: particules(p.nom) }));

const gazetteer = {
  ...raw,
  places: named(raw.places),
  places_ign: named(raw.places_ign),
  aliases: Object.fromEntries(Object.entries(raw.aliases as Record<string, string>).map(([alias, to]) => [alias, particules(to)])) as Record<string, string>,
};
export default gazetteer;
