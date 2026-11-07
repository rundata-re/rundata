import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { costOf, count, counted, measured } from "../src/budget.js";
import { Cache, MemoryStore, TieredStore, type CacheEntry } from "../src/cache.js";
import { SHARED, SHARED_AFTER, type Shared } from "../src/web/partagees.js";

// What each shared copy's build takes from a cold cache, against the cold cost it declares (web/partagees.ts `cold`),
// which the scheduled event expects of it after a deploy and the budget's registry counts (src/registre.ts). Each copy
// is built alone, from an empty cache, its sources answered by the fixtures, then by none. In a file of its own: what
// the builds took is remembered per process (budget.ts).
//
// Node sees less than the Worker: no D1 (the silent sites, the bus timetables), no reader of KV (the stations of Atmo
// Réunion, the sensors). A cold cost may be above what this counts, never under it.

const NOW = new Date("2026-11-05T01:00:00Z");
const fixture = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url));

// The data center's cache and KV, counted as the Worker counts them (worker.ts, EdgeStore and KvStore): one
// subrequest per read and per write. The isolate's memory before them, free.
class Counted extends MemoryStore {
  async get(key: string) {
    count(1, "read");
    return super.get(key);
  }
  async put(key: string, entry: CacheEntry) {
    count(1, true);
    return super.put(key, entry);
  }
}
const workerCache = () => new Cache(new TieredStore(new MemoryStore(), new Counted()), () => NOW.getTime(), false, new Counted());

// Each source's fixture, by the URL its build asks for.
const ROUTES: [RegExp, string | ((body: string) => string)][] = [
  [/vigilanceom\/flux\/dernier/, "vigilance_om.zip"],
  [/clicanoo\.re\/rss/, "actualites/clicanoo.xml"],
  [/imazpress\.com\/sitemap-news/, "actualites/imaz_news.xml"],
  [/freedom\.fr\/feed/, "actualites/freedom.xml"],
  [/parallelesud\.com\/feed/, "actualites/parallelesud.xml"],
  [/lequotidien\.re\/$/, "actualites/quotidien.html"],
  [/temoignages\.re\/spip\.php\?page=sitemap-news/, "actualites/temoignages.xml"],
  [/reunion\.gouv\.fr\/Actualites\/Communiques-de-presse/, "actualites/prefecture.html"],
  [/reunion\.gouv\.fr\/Actualites\//, "actualites/prefecture-alerte1-enclos.html"],
  [/vigicrues\/vigilance\.php/, "vigicrues_vigilance.json"],
  [/vigicrues\/valeurs\.php/, (body) => (/debit/i.test(body) ? "vigicrues_debit.json" : "vigicrues_hauteur.json")],
  [/FeatureServer\/5\/query/, "onf/sentiers.json"],
  [/FeatureServer\/4\/query/, "onf/routes.json"],
  [/FeatureServer\/5\?f=json/, "onf/couche.json"],
  [/njq-knwu0diqrdup6tya8qxi/, "edf_mix.json"],
  [/7tgfic35sejxtbi0ose84dbx/, "edf_signal.json"],
  [/dioneo\.re\/rss/, "avis-eau/dioneo.xml"],
  [/runeo\.re\/rss/, "avis-eau/runeo.xml"],
  [/eauxdelapossession\.re/, "avis-eau/possession.xml"],
  [/cirest\.fr\/wp-json/, "avis-eau/cirest.json"],
  [/lacreole\.re/, "avis-eau/lacreole.html"],
  [/ville-saintemarie\.re\/wp-json\/wp\/v2\/posts/, "avis-eau/saintemarie.json"],
  [/saintleu\.re\/wp-json/, "avis-eau/saintleu.json"],
  [/atmo-france\.org/, "atmo_974.json"],
  [/coastwatch\.noaa\.gov\/thredds/, "acspo.ascii"],
  [/erddap\/griddap\/erdMH1sst/, "modis.csv"],
  [/maregraphie\/observation\/json\/110/, "shom_110.json"],
  [/maregraphie\/observation\/json\/832/, "shom_832.json"],
  [/marine-api\.open-meteo\.com.*meteofrance_wave/, "openmeteo_houle_mf.json"],
  [/marine-api\.open-meteo\.com/, "openmeteo_houle.json"],
  [/fr-en-calendrier-scolaire/, "calendrier_scolaire.json"],
  [/calendrier\.api\.gouv\.fr\/jours-feries/, "jours_feries.json"],
  [/ws\.ipgp\.fr\/fdsnws/, "ipgp_seismes.txt"],
  [/ipgp\.fr\/volcanoweb\/.*\.pdf/, "ovpf/OVPF_20260421_08h30_communique.pdf"],
  [/pitonlive\.com/, "pitonlive_state.json"],
  [/public\.api\.bsky\.app/, "ovpf_bluesky.json"],
  [/aviationweather\.gov/, "metar.json"],
  [/api\.pioupiou\.fr/, "pioupiou_all.json"],
  [/datasets\/r\/047b2ab9/, "ffvl_releves.json"],
  [/altervelo\/station_information/, "altervelo_station_information.json"],
  [/altervelo\/station_status/, "altervelo_station_status.json"],
  [/ensemble\/static\/meta\.json/, "openmeteo_ens_meta.json"],
  [/ensemble-api\.open-meteo\.com\/v1\/ensemble/, "openmeteo_ens_ile.json"],
  [/mairie-saintpaul\.re\/evenements\/\?ical=1/, "agenda/ics_saint-paul.ics"],
  [/ville-port\.re\/wp-json\/tribe/, "agenda/tribe_le-port.json"],
  [/trois-bassins\.re\/wp-json\/tribe/, "agenda/tribe_trois-bassins.json"],
  [/ville-saintemarie\.re\/wp-json\/tribe/, "agenda/tribe_sainte-marie.json"],
  [/saintlouis\.re\/agenda/, "agenda/rss_saint-louis-agenda.xml"],
  [/lesechoir\.com/, "agenda/sechoir.json"],
  [/braspanon\.re\/fr\/ev\//, "agenda/bras-panon_2026-11.html"],
  [/openagenda\.com\/agendas\/50316469/, "agenda/openagenda_cinor.json"],
  [/openagenda\.com\/agendas\/32570974/, "agenda/openagenda_otnord.json"],
  [/theatrelucdonat\.re\/tld_agenda/, "agenda/luc-donat.html"],
  [/theatrelucdonat\.re\/prog/, "agenda/luc-donat-saison.html"],
  [/kabardock\.com/, "agenda/kabardock.html"],
  [/letangsale\.fr/, "agenda/etang-sale.html"],
];

let unrouted: string[] = [];
const urlOf = (input: string | URL | Request) => (input instanceof Request ? input.url : String(input));
const answering = async (input: string | URL | Request, init?: RequestInit) => {
  const url = urlOf(input);
  const route = ROUTES.find(([re]) => re.test(url));
  if (!route) {
    unrouted.push(url);
    return new Response("", { status: 503 });
  }
  const path = typeof route[1] === "string" ? route[1] : route[1](String(init?.body ?? ""));
  return new Response(fixture(path), { status: 200 });
};
const silent = async () => new Response("", { status: 503 });

/** What the build of `s` takes alone from a cold cache, as the Worker counts it for its copy (`costOf`). */
async function coldCost(s: Shared, scenario: string): Promise<number> {
  const key = `${s.key}#${scenario}`;
  const cache = workerCache();
  const run = await counted(1000, () => measured(key, () => s.build(cache, NOW)).catch(() => undefined));
  await run.settled();
  return costOf(key) ?? 0;
}

const ALL = [...SHARED, ...SHARED_AFTER];

describe("each shared copy's build from a cold cache (web/partagees.ts `cold`)", () => {
  beforeEach(() => {
    unrouted = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("takes no more than its cold cost when its sources answer, every source given its fixture", async () => {
    vi.stubGlobal("fetch", answering);
    const over: string[] = [];
    for (const s of ALL) {
      const cost = await coldCost(s, "answering");
      expect(cost, s.key).toBeGreaterThan(0);
      if (cost > (s.cold ?? 0)) over.push(`${s.key} : ${cost} pour ${s.cold}`);
    }
    expect(over).toEqual([]);
    // A source read by a build and given no fixture here: add it to ROUTES, or the build is counted as if it failed.
    expect([...new Set(unrouted)]).toEqual([]);
  }, 60_000);

  it("takes no more than its cold cost when no source answers, its retries included", async () => {
    vi.stubGlobal("fetch", silent);
    const over: string[] = [];
    for (const s of ALL) {
      const cost = await coldCost(s, "silent");
      if (cost > (s.cold ?? 0)) over.push(`${s.key} : ${cost} pour ${s.cold}`);
    }
    expect(over).toEqual([]);
  }, 60_000);
});
