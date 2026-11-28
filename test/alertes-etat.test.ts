import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import { detecter, ETAT_KEY, FIN_EPISODE_MS, suivre, type EtatAlertes } from "../src/alertes-etat.js";
import * as mf from "../src/providers/vigilance.js";
import { unzip } from "../src/zip.js";
import type { VolcanAnswer } from "../src/web/data.js";

// The alerts a push would follow, read from the copies the site already keeps (vigilance, /volcan): nothing sent yet,
// one log line a run when one would go, so that how often it would send, and how many would be false, is read before
// anyone is notified.

const H = 3_600_000;
const T0 = Date.parse("2026-11-24T05:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const copie = <T>(value: T, at: number, extra: Partial<Cached<T>> = {}): Cached<T> => ({ value, fetchedAt: new Date(at), stale: false, ...extra });

/** A bulletin issued `h` hours after T0, with `zones`; the cyclone alert at `cyclone` from T0 when given. */
function bulletin(h: number, zones: mf.Vigilance["zones"] = {}, cyclone?: number): Cached<mf.Vigilance> {
  const z = { ...zones, ...(cyclone !== undefined && { [mf.ISLAND]: { [mf.CYCLONE]: [{ couleur: cyclone, debut: iso(T0) }] } }) };
  return copie({ emise: iso(T0 + h * H), zones: z, suivi: [] }, T0 + h * H);
}
const pluie = (couleur: number) => ({ "VIGI974-13": { 12: [{ couleur, debut: iso(T0) }] } });
/** /volcan's copy built `h` hours after T0. */
const volcan = (h: number, niveau_orsec: string, eruption = false, inconnu = false) =>
  copie({ resume: "", etat: { eruption_en_cours: eruption, niveau_orsec, ...(inconnu && { niveau_inconnu: true }) } } as unknown as VolcanAnswer, T0 + h * H);

/** The runs one after another, from no state: what each said. */
function rejouer(runs: [Cached<mf.Vigilance> | undefined, Cached<VolcanAnswer> | undefined][]): string[][] {
  let etat: EtatAlertes | undefined;
  return runs.map(([v, vo], i) => {
    const r = suivre(etat, v, vo, new Date(T0 + i * H));
    etat = r.etat;
    return r.dits;
  });
}

describe("the vigilance a push would follow", () => {
  it("says a zone and phenomenon reaching orange, then red; never yellow, never a fall; nothing on the first run", () => {
    expect(rejouer([[bulletin(0, pluie(2)), undefined], [bulletin(1, pluie(3)), undefined], [bulletin(2, pluie(4)), undefined], [bulletin(3, pluie(3)), undefined], [bulletin(4, pluie(1)), undefined]])).toEqual([
      [],
      ["vigilance orange fortes pluies / orages, Sud-Est"],
      ["vigilance rouge fortes pluies / orages, Sud-Est"],
      [],
      [],
    ]);
    expect(rejouer([[bulletin(0, pluie(3)), undefined]])).toEqual([[]]);
  });

  it("does not say an orange that comes back within the episode, and says it again once the episode is over", () => {
    const fin = FIN_EPISODE_MS / H;
    expect(rejouer([[bulletin(0), undefined], [bulletin(1, pluie(3)), undefined], [bulletin(2, pluie(2)), undefined], [bulletin(3, pluie(3)), undefined], [bulletin(3 + fin, pluie(2)), undefined], [bulletin(4 + fin, pluie(3)), undefined]])).toEqual([
      [],
      ["vigilance orange fortes pluies / orages, Sud-Est"],
      [],
      [],
      [],
      ["vigilance orange fortes pluies / orages, Sud-Est"],
    ]);
  });

  it("reads neither the same bulletin again, nor an older one, nor a stale or late copy, and they change nothing", () => {
    const orange = bulletin(1, pluie(3));
    expect(rejouer([[bulletin(0), undefined], [{ ...orange, stale: true }, undefined], [{ ...orange, tardive: true }, undefined], [orange, undefined], [orange, undefined], [bulletin(0, pluie(4)), undefined]])).toEqual([[], [], [], ["vigilance orange fortes pluies / orages, Sud-Est"], [], []]);
  });

  it("puts every change of a run in one line, as one message", async () => {
    const m = new Map<string, string>();
    const kv = { get: async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null), put: async (k: string, v: string) => void m.set(k, v) };
    const lignes: string[] = [];
    await detecter(kv, bulletin(0), undefined, new Date(T0), (l) => lignes.push(l));
    await detecter(kv, bulletin(1, { ...pluie(3), "VIGI974-15": { 1: [{ couleur: 3, debut: iso(T0) }] } }), undefined, new Date(T0 + H), (l) => lignes.push(l));
    expect(lignes).toEqual(["alertes push (à blanc, rien n'est envoyé) : vigilance orange fortes pluies / orages, Sud-Est\u00a0; vigilance orange vents forts, Ouest"]);
  });
});

describe("the cyclone alert a push would follow", () => {
  it("says each step in force, both ways, and its lifting", () => {
    expect(rejouer([[bulletin(0, {}, 1), undefined], [bulletin(1, {}, 2), undefined], [bulletin(2, {}, 3), undefined], [bulletin(3, {}, 3), undefined], [bulletin(4, {}, 6), undefined], [bulletin(5, {}, 2), undefined], [bulletin(6, {}, 1), undefined]])).toEqual([
      [],
      ["pré-alerte cyclonique"],
      ["alerte cyclonique orange"],
      [],
      ["alerte cyclonique : phase de sauvegarde"],
      ["pré-alerte cyclonique"],
      ["alerte cyclonique levée"],
    ]);
  });
});

describe("the cyclone step within one bulletin", () => {
  /** The bulletin of T0 (05:00 UTC) with the island's cyclone periods, read again at each run, one an hour. */
  const meme = (periodes: mf.Period[]) => copie<mf.Vigilance>({ emise: iso(T0), zones: { [mf.ISLAND]: { [mf.CYCLONE]: periodes } }, suivi: [] }, T0);
  const runs = (b: Cached<mf.Vigilance>, n: number) => rejouer(Array.from({ length: n }, () => [b, undefined] as [Cached<mf.Vigilance>, undefined]));

  it("says an orange announced for later in the bulletin when its hour comes, without a new bulletin", () => {
    const b = meme([{ couleur: 2, debut: iso(T0), fin: iso(T0 + 6 * H) }, { couleur: 3, debut: iso(T0 + 6 * H) }]);
    expect(runs(b, 8)).toEqual([[], [], [], [], [], [], ["alerte cyclonique orange"], []]);
  });

  it("says a pré-alerte lifted when it ends, without a new bulletin", () => {
    const b = meme([{ couleur: 2, debut: iso(T0 - 5 * H), fin: iso(T0 + 2 * H) }]);
    expect(runs(b, 4)).toEqual([[], [], ["alerte cyclonique levée"], []]);
  });
});

describe("the volcano a push would follow", () => {
  it("says a level from Alerte 1 once seen in two copies in a row, the end of the alert, and an eruption", () => {
    expect(rejouer([
      [undefined, volcan(0, "Vigilance")],
      [undefined, volcan(1, "Vigilance renforcée")],
      [undefined, volcan(2, "Alerte 1")],
      [undefined, volcan(3, "Alerte 1")],
      [undefined, volcan(4, "Alerte 2-1", true)],
      [undefined, volcan(5, "Alerte 2-1", true)],
      [undefined, volcan(6, "Vigilance renforcée")],
      [undefined, volcan(7, "Vigilance renforcée")],
    ])).toEqual([[], [], [], ["volcan : Alerte 1, après Vigilance"], [], ["volcan : éruption en cours, Alerte 2-1"], [], ["volcan : fin de l'alerte, retour à la Vigilance"]]);
  });

  it("says nothing of a level seen once (an old release quoted, an image misread), of the same copy twice, nor of a level not read", () => {
    const a1 = volcan(2, "Alerte 1");
    expect(rejouer([[undefined, volcan(0, "Vigilance")], [undefined, volcan(1, "Alerte 1")], [undefined, volcan(2, "Vigilance")], [undefined, volcan(3, "Alerte 1")], [undefined, volcan(4, "Vérifier", false, true)], [undefined, a1], [undefined, a1], [undefined, { ...volcan(9, "Alerte 1"), stale: true }]])).toEqual([[], [], [], [], [], [], [], []]);
  });
});

describe("a real bulletin of Météo-France", () => {
  let sample: mf.Vigilance;
  beforeAll(async () => {
    const zip = readFileSync(new URL("./fixtures/vigilance_om.zip", import.meta.url));
    const files = await unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, (n) => n.endsWith("_FMEE_.txt"));
    sample = mf.parse(JSON.parse(files.get("CDPV95_FMEE_.txt")!), JSON.parse(files.get("CDPV96_FMEE_.txt")!));
  });

  it("after a calm one: what it would say is only orange and above, never twice for the same bulletin", () => {
    const at = Date.parse(sample.emise);
    const calme = copie<mf.Vigilance>({ emise: iso(at - H), zones: {}, suivi: [] }, at - H);
    const r1 = suivre(undefined, calme, undefined, new Date(at - H));
    const r2 = suivre(r1.etat, copie(sample, at), undefined, new Date(at));
    expect(r2.dits.every((d) => /^vigilance (orange|rouge|violet) /.test(d) || d.startsWith("alerte cyclonique"))).toBe(true);
    expect(suivre(r2.etat, copie(sample, at), undefined, new Date(at)).dits).toEqual([]);
  });
});

describe("one run of the scheduled event", () => {
  const kv = (initial?: unknown) => {
    const m = new Map<string, string>(initial ? [[ETAT_KEY, JSON.stringify(initial)]] : []);
    let puts = 0;
    return { m, puts: () => puts, get: async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null), put: async (k: string, v: string) => void (m.set(k, v), puts++) };
  };

  it("writes the state only when it changes, and keeps a part it could not read", async () => {
    const store = kv();
    await detecter(store, bulletin(0), volcan(0, "Alerte 1"), new Date(T0), () => {});
    expect(store.puts()).toBe(1);
    await detecter(store, bulletin(0), volcan(0, "Alerte 1"), new Date(T0), () => {});
    expect(store.puts()).toBe(1);
    await detecter(store, undefined, undefined, new Date(T0), () => {});
    expect(store.puts()).toBe(1);
    expect(JSON.parse(store.m.get(ETAT_KEY)!)).toMatchObject({ emise: iso(T0), cyclone: -1, volcan: { niveau: "Alerte 1", eruption: false } });
  });

  it("takes the state the code kept before as a first run: nothing said from it", async () => {
    const store = kv({ vigilance: { "VIGI974-13|12": 3 }, cyclone: -1, volcan: "Vigilance" });
    const lignes: string[] = [];
    expect(await detecter(store, bulletin(0, pluie(4)), volcan(0, "Alerte 1"), new Date(T0), (l) => lignes.push(l))).toEqual([]);
    expect(lignes).toEqual([]);
  });
});
