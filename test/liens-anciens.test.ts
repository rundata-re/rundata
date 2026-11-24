import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The outside addresses that moved (read on 24/11/2026: each answered a redirection, its new address 200). The code, the
// scripts that build the embedded lists, and the README say each one's new address: a link sent through a redirection
// may lose its page the day the redirection goes, and an old address put back by a rebuild is caught here.
const ROOT = new URL("../", import.meta.url);
const files = [
  ...["src", "scripts"].flatMap((dir) =>
    (readdirSync(new URL(dir, ROOT), { recursive: true }) as string[]).filter((f) => /\.(ts|json|py)$/.test(f)).map((f) => `${dir}/${f}`),
  ),
  "README.md",
];
const text = (f: string) => readFileSync(new URL(f, ROOT), "utf8");

// An old address, ended where a URL ends in the code (a quote, a bracket, a space): never the start of a longer one.
const END = String.raw`(?=["'\`)\s<>,\]]|$)`;
// An address written as a pattern, its dots already escaped: the exact address, ended where a URL ends.
const exact = (pattern: string, now: string) => ({ old: new RegExp(pattern + END), now });
const ANCIENNES: { old: RegExp; now: string }[] = [
  // The Opendatasoft portals show a dataset at /explore/assets/<id>/ (the API, /api/explore/…, is not concerned).
  { old: /https:\/\/(data\.education\.gouv\.fr|data\.tco\.re|data\.regionreunion\.com|data\.enseignementsup-recherche\.gouv\.fr)\/explore\/dataset\//, now: "https://<portail>/explore/assets/<id>/" },
  exact(String.raw`https://data\.regionreunion\.com`, "https://data.regionreunion.com/pages/accueil/"),
  exact(String.raw`https://www\.boamp\.fr/`, "https://www.boamp.fr/pages/entreprise-accueil/"),
  exact(String.raw`https://equipements\.sports\.gouv\.fr/`, "https://equipements.sports.gouv.fr/pages/accueil/"),
  // The IGN's pages are on cartes.gouv.fr.
  { old: /https:\/\/geoservices\.ign\.fr\//, now: "https://cartes.gouv.fr/…" },
  { old: /(?<![\w-])https:\/\/lannuaire\.service-public\.fr/, now: "https://lannuaire.service-public.gouv.fr/" },
  exact(String.raw`https://www\.sante\.fr/ocean-indien-numeros-utiles-en-cas-durgence`, "https://www.sante.fr/urgences-les-numeros-utiles-la-reunion"),
  exact(String.raw`https://www\.lareunion\.ars\.sante\.fr/trouver-la-pharmacie-de-garde-la-plus-proche-0`, "https://www.lareunion.ars.sante.fr/trouver-la-pharmacie-de-garde-la-plus-proche"),
  { old: /https:\/\/transport\.data\.gouv\.fr\/datasets\/beta-bases-nationales-des-points-de-recharge/, now: "https://transport.data.gouv.fr/datasets/base-nationale-des-points-de-recharge-…" },
  exact(String.raw`https://openagenda\.com/cinor-territoire-du-nord-de-la-reunion`, "https://openagenda.com/fr/cinor-territoire-du-nord-de-la-reunion"),
  exact(String.raw`https://portail-api\.meteofrance\.fr/`, "https://portail-api.meteofrance.fr/web/"),
  { old: /https:\/\/www\.data\.gouv\.fr\/pages\/legal\/licences\/etalab-2\.0/, now: "https://www.data.gouv.fr/pages/legal/licences/etalab-2-0" },
  { old: /https:\/\/www\.cnil\.fr\/fr\/cookies-et-autres-traceurs\/regles\//, now: "https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience" },
  { old: /https:\/\/developers\.facebook\.com\/docs\/graph-api\/changelog\//, now: "https://developers.facebook.com/documentation/development/graph-api/changelog/…" },
  exact(String.raw`https://saintjoseph\.re/Bibliotheque-municipale`, "https://saintjoseph.re/Mediatheque-du-Sud-Sauvage"),
  exact(String.raw`https://meteofrance\.re/`, "https://meteofrance.re/fr"),
  // The same sites, at their own address: the www they add or drop, the slash data.gouv.fr drops.
  exact(String.raw`https://goplayarena\.re`, "https://www.goplayarena.re/"),
  exact(String.raw`https://lejardindestortues\.re/`, "https://www.lejardindestortues.re/"),
  exact(String.raw`https://randoaquareunion\.fr/`, "https://www.randoaquareunion.fr/"),
  exact(String.raw`https://www\.freedom\.fr/`, "https://freedom.fr/"),
  { old: /https:\/\/www\.data\.gouv\.fr\/datasets\/(finess-extraction-du-fichier-des-etablissements|annuaire-sante-ameli)\//, now: "https://www.data.gouv.fr/datasets/<id>" },
];

describe("the outside addresses that moved", () => {
  it("are written nowhere in the code, the build scripts or the README: each link says its new address", () => {
    expect(files.length).toBeGreaterThan(100);
    const found = files.flatMap((f) => {
      const t = text(f);
      return ANCIENNES.filter((a) => a.old.test(t)).map((a) => `${f} : ${a.old.source} → ${a.now}`);
    });
    expect(found).toEqual([]);
  });

  it("are refused as they were written before, and leave alone what only looks like them", () => {
    const refused = (s: string) => ANCIENNES.some((a) => a.old.test(s));
    for (const s of [
      `"https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/"`,
      `"https://meteofrance.re/"`,
      `href="https://www.freedom.fr/">`,
      `url: "https://lannuaire.service-public.fr",`,
      `"https://data.regionreunion.com"`,
      `f"https://data.tco.re/explore/dataset/{DATASET}/"`,
    ]) expect(refused(s), s).toBe(true);
    for (const s of [
      `"https://meteofrance.re/fr"`,
      `"https://meteofrance.re/fr/cyclone"`,
      `"https://www.freedom.fr/rallye"`,
      `"https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/x/records"`,
      `"https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets"`,
      `"https://data.regionreunion.com/explore/assets/lieux-remarquables-lareunion-tourinsoft/"`,
      `"https://data.caf.fr/explore/dataset/txcouv_pe_com/"`,
    ]) expect(refused(s), s).toBe(false);
  });
});
