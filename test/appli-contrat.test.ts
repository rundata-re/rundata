import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { appliDe } from "../src/appli.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { configure } from "../src/providers/mf-auth.js";
import * as mf from "../src/providers/vigilance.js";
import { activeRow, cyclones, suiviRow } from "../src/tools/cyclones.js";
import { vigilanceMeteo } from "../src/tools/vigilance.js";
import { unzip } from "../src/zip.js";

// Le contrat entre l'appli (mobile/) et les deux outils qui nourrissent ses alertes et ses notifications :
// `vigilance_meteo` (avec la commune) et `cyclones`. Les clés sont lues dans le code Kotlin lui-même : une clé que
// l'appli se met à lire, ou que le serveur renomme, fait échouer ce test au lieu de taire une alerte sur les téléphones.

const APP = new URL("../mobile/shared/src/commonMain/kotlin/re/rundata/app/", import.meta.url);
const kotlin = (f: string) => readFileSync(new URL(f, APP), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

const communes = [...kotlin("Communes.kt").slice(kotlin("Communes.kt").indexOf("val COMMUNES")).matchAll(/"[a-z-]+" to "([^"]+)"/g)].map((m) => m[1]);

/** Ce que l'appli lit, objet par objet (Alertes.kt). */
const LU = {
  vigilance: ["emise", "alerte_cyclonique", "niveaux", "vagues_submersion", "zone_vigilance", "officiel"],
  niveau: ["phenomene", "maintenant", "a_venir"],
  cote: ["zone", "couleur_max", "periodes"],
  cyclones: ["alerte_cyclonique", "systemes_actifs", "suivi_cmrs"],
  systeme: ["systeme", "stade", "nom", "dernier_avis"],
};

// Couleur.de (Journee.kt) : le mot, masculin ou féminin ; tout autre mot ne donne aucune couleur, donc aucune alerte.
const COULEURS_APPLI = new Set(["jaune", "orange", "rouge", "violet", "violette"]);
// Quand.JOUR_HEURE (Quand.kt) : « 22/11 16:21 », le jour avant l'heure.
const JOUR_HEURE = /\b(\d{1,2}\/\d{1,2})\D{1,3}(\d{1,2}:\d{2})\b/;
// alerteCycloniqueDe (Alertes.kt) : les deux formes qu'elle sait colorer.
const EN_COURS = /^ALERTE CYCLONIQUE\s+(pré-alerte|orange|rouge|violette|phase de sauvegarde)/;
const PREVUE = /^Alerte cyclonique prévue[\s ]*:[\s ]*(pré-alerte|orange|rouge|violette|phase de sauvegarde)/;

// Le flux réel du 22/10/2026 (test/vigilance.test.ts), mis en tempête : chaque zone en jaune vents forts maintenant et
// en orange fortes pluies à venir, la côte en orange vagues-submersion, l'île en alerte cyclonique orange.
const NOW = new Date("2026-10-22T14:00:00Z");
const ZIP = readFileSync(new URL("./fixtures/vigilance_om.zip", import.meta.url));

async function tempete(): Promise<mf.Vigilance> {
  const f = await unzip(ZIP.buffer.slice(ZIP.byteOffset, ZIP.byteOffset + ZIP.byteLength) as ArrayBuffer, (n) => n.endsWith("_FMEE_.txt") && n !== "CDPV87_FMEE_.txt");
  const v = mf.parse(JSON.parse(f.get("CDPV95_FMEE_.txt")!), JSON.parse(f.get("CDPV96_FMEE_.txt")!));
  for (const zone of ["VIGI974-11", "VIGI974-12", "VIGI974-13", "VIGI974-14", "VIGI974-15"]) {
    v.zones[zone] = {
      1: [{ couleur: 2, debut: "2026-10-22T12:02:24Z", fin: "2026-10-23T00:00:00Z" }, { couleur: 1, debut: "2026-10-23T00:00:00Z" }],
      12: [{ couleur: 1, debut: "2026-10-22T12:02:24Z", fin: "2026-10-22T18:00:00Z" }, { couleur: 3, debut: "2026-10-22T18:00:00Z" }],
    };
  }
  v.zones["VIGI974-51"] = { 9: [{ couleur: 3, debut: "2026-10-22T12:02:24Z", fin: "2026-10-23T06:00:00Z" }] };
  v.zones[mf.ISLAND][mf.CYCLONE] = [{ couleur: 3, debut: "2026-10-22T12:02:24Z" }];
  return v;
}

function cacheAvec(v: mf.Vigilance) {
  const store = new MemoryStore();
  void store.put("vigilance", { value: v, fetchedAt: NOW.getTime() });
  return new Cache(store, () => NOW.getTime());
}

beforeAll(() => configure({ token: "test" }));
afterAll(() => configure({}));

describe("ce que l'appli lit", () => {
  it("est déclaré ici, clé par clé", () => {
    const lues = new Set([...kotlin("Alertes.kt").matchAll(/(?:texte|get)\("([a-z_]+)"\)|\["([a-z_]+)"\]/g)].map((m) => m[1] ?? m[2]));
    expect([...lues].sort()).toEqual([...new Set(Object.values(LU).flat())].sort());
  });

  it("s'annonce par un User-Agent que le serveur reconnaît", () => {
    const ua = /USER_AGENT = "rundata\.re-android\/\$\{BuildConfig\.VERSION_NAME\}"/;
    const android = readFileSync(new URL("../mobile/androidApp/src/main/kotlin/re/rundata/app/android/RundataApp.kt", import.meta.url), "utf8");
    expect(android).toMatch(ua);
    expect(appliDe("rundata.re-android/0.3.2")).toEqual({ type: "appli", version: "0.3.2" });
    expect(kotlin("../../../../../iosMain/kotlin/re/rundata/app/EcranIos.kt")).toContain('"rundata.re-ios/$version"');
    expect(appliDe("rundata.re-ios/0.3.2")).toEqual({ type: "appli", version: "0.3.2" });
  });
});

describe("vigilance_meteo, pour chacune des 24 communes, un jour de tempête", () => {
  let reponses: Record<string, Record<string, unknown>>;
  beforeAll(async () => {
    const cache = cacheAvec(await tempete());
    reponses = Object.fromEntries(await Promise.all(communes.map(async (c) => [c, body(await vigilanceMeteo(cache, c, NOW))] as const)));
  });

  it("couvre les 24", () => expect(Object.keys(reponses)).toHaveLength(24));

  it.each(communes)("%s : chaque clé lue, à sa forme", (c) => {
    const r = reponses[c];
    for (const k of LU.vigilance) expect(r, k).toHaveProperty(k);
    expect(String(r.zone_vigilance).split(" :")[0]).toMatch(/^(Nord|Est|Sud-Est|Sud|Ouest)$/);
    expect(r.emise).toMatch(JOUR_HEURE);
    expect(r.officiel).toMatch(/^Consulter .*https:\/\//);
    expect(r.alerte_cyclonique).toMatch(EN_COURS);

    // Les niveaux : la couleur de maintenant, puis les périodes à venir, chacune commençant par sa couleur.
    const niveaux = r.niveaux as Record<string, unknown>[];
    expect(Array.isArray(niveaux)).toBe(true);
    for (const n of niveaux) expect(Object.keys(n).filter((k) => n[k] !== undefined).sort()).toEqual(expect.arrayContaining(["maintenant", "phenomene"]));
    const vent = niveaux.find((n) => n.phenomene === "Vents forts")!;
    expect(COULEURS_APPLI.has(String(vent.maintenant))).toBe(true);
    const pluie = niveaux.find((n) => n.phenomene === "Fortes pluies / orages")!;
    expect(pluie.maintenant).toBe("vert");
    const aVenir = pluie.a_venir as string[];
    expect(aVenir.length).toBeGreaterThan(0);
    for (const p of aVenir) {
      expect(COULEURS_APPLI.has(p.split(" ")[0])).toBe(true);
      expect(p).toMatch(JOUR_HEURE);
    }

    // La côte : un tableau, avec la plus haute couleur, la zone et ses périodes.
    const cotes = r.vagues_submersion as Record<string, unknown>[];
    expect(Array.isArray(cotes)).toBe(true);
    for (const cote of cotes) {
      for (const k of LU.cote) expect(cote, k).toHaveProperty(k);
      expect(COULEURS_APPLI.has(String(cote.couleur_max))).toBe(true);
      expect(Array.isArray(cote.periodes)).toBe(true);
    }
  });

  it("annoncée, l'alerte cyclonique a la forme que l'appli colore", async () => {
    const v = await tempete();
    v.zones[mf.ISLAND][mf.CYCLONE] = [{ couleur: 1, debut: "2026-10-22T12:02:24Z", fin: "2026-10-23T06:00:00Z" }, { couleur: 3, debut: "2026-10-23T06:00:00Z" }];
    expect(body(await vigilanceMeteo(cacheAvec(v), communes[0], NOW)).alerte_cyclonique).toMatch(PREVUE);
  });

  it("un jour calme : pas de côte, mais toujours des niveaux (vigilance lue, rien à dire)", async () => {
    const v = await tempete();
    v.zones["VIGI974-51"] = {};
    delete v.zones[mf.ISLAND][mf.CYCLONE];
    const r = body(await vigilanceMeteo(cacheAvec(v), communes[0], NOW));
    expect(Array.isArray(r.niveaux)).toBe(true);
    expect(Array.isArray(r.vagues_submersion)).toBe(false);
    expect(r.alerte_cyclonique).toMatch(/^Pas d'alerte/);
  });
});

describe("cyclones", () => {
  const FYTIA = new Date("2026-02-03T08:00:00Z");
  const fixture = (f: string) => readFileSync(new URL(`./fixtures/cyclones/${f}`, import.meta.url));
  afterEach(() => vi.unstubAllGlobals());

  it("un système actif : les clés lues, la forme du dernier avis", async () => {
    vi.stubGlobal("fetch", async (url: string | Request) => {
      const u = typeof url === "string" ? url : url.url;
      const f = u.includes("geteventlist")
        ? u.includes("pagenumber=2") ? "liste_page2.json" : "liste_page1.json"
        : u.includes("getepisodedata") && u.includes("eventid=1001254") ? "episode_fytia.json"
          : u.includes("gettimeline?id=732239") ? "timeline_fytia.json" : undefined;
      return f ? new Response(fixture(f)) : new Response("", { status: 503 });
    });
    const r = body(await cyclones(new Cache(new MemoryStore(), () => FYTIA.getTime()), undefined, FYTIA));
    expect(r).toHaveProperty("alerte_cyclonique");
    const actifs = r.systemes_actifs as Record<string, unknown>[];
    expect(actifs).toHaveLength(1);
    // systemeDe : « systeme », sinon « stade » et « nom » ; l'heure avant « ( ».
    expect(actifs[0].systeme ?? `${actifs[0].stade} ${actifs[0].nom}`).toMatch(/Fytia/);
    expect(String(actifs[0].dernier_avis).split(" (")[0]).toMatch(JOUR_HEURE);
  });

  it("les deux lignes qu'elle lit : un système de GDACS, un suivi du CMRS", () => {
    const actif = activeRow({ nom: "Fytia", fin: "2026-02-03T06:00:00Z" } as Parameters<typeof activeRow>[0], { heure: "2026-02-03T06:00:00Z", stade: "tempête tropicale modérée" });
    expect(actif).toMatchObject({ nom: "Fytia", stade: "tempête tropicale modérée" });
    expect(actif.dernier_avis.split(" (")[0]).toMatch(JOUR_HEURE);
    const suivi = suiviRow({ systeme: 2, saison: "20262027", stade: "zone perturbée", numero: 3, emis: "2026-11-22T12:00:00Z" });
    expect(suivi.systeme).toBe("zone perturbée n° 2");
    expect(suivi.dernier_avis.split(" (")[0]).toMatch(JOUR_HEURE);
  });
});
