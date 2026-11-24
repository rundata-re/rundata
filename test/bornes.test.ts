import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { configure, IDS, parseLive, refresh, refreshDue, STATIONS, timeOf, type Live } from "../src/providers/irve.js";
import { bornesRecharge, etatDe, lastChange, pointState, since } from "../src/tools/bornes.js";
import { dataDate } from "../src/tools/fraicheur.js";
import { localTime } from "../src/geo.js";
import { bornesLive, bornesPage } from "../src/web/domains.js";
import { buildBornes } from "../src/web/data.js";
import { DESCRIPTION_MAX } from "../src/web/pages.js";
import { deadAnchors, doubleIds, mapLinks } from "./cartes.js";

// The 407 rows of La Réunion in the national live file of 24/10/2026 at 00:37 UTC, and four rows of mainland France.
const CSV = readFileSync(new URL("./fixtures/irve_dynamique.csv", import.meta.url), "utf8");
const NOW = new Date("2026-10-24T00:40:00Z");
const LIVE = parseLive(CSV, IDS, new Date("2026-10-24T00:37:00Z"));
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

// The counts come from the bundled list and the fixture, never written out: the list is rebuilt from the national base
// (scripts/build-irve.py), and points come and go from one rebuild to the next.
const POINTS = STATIONS.flatMap((s) => s.points.map((p) => ({ ...p, commune: s.commune })));
const LUS = Object.keys(LIVE.points).length;
const libre = (id: string) => LIVE.points[id]?.[0] === "en_service" && LIVE.points[id]?.[1] === "libre";
const LIBRES = POINTS.filter((p) => libre(p.id)).length;
const ETAT = localTime(new Date(lastChange(LIVE)!)).slice(6);

function cache(live: Live | null) {
  configure(async () => live);
  return new Cache(new MemoryStore(), () => NOW.getTime());
}

afterEach(() => (configure(undefined), vi.unstubAllGlobals()));

describe("bornes de recharge", () => {
  it("says when a point last changed: its hour today, its day this year, its whole date before", () => {
    const now = new Date("2026-11-06T18:00:00Z"); // 22:00 in La Réunion
    expect(since("2026-11-06T15:10:00Z", now)).toBe("19:10");
    expect(since("2026-10-28T10:14:00Z", now)).toBe("28/10 14:14");
    expect(since("2024-03-12T06:00:00Z", now)).toBe("12/03/2024");
    // The year of La Réunion: 31/12/2025 at 22:00 UTC is already 1 January 2026 there.
    expect(since("2025-12-31T22:00:00Z", now)).toBe("01/01 02:00");
  });

  it("keeps La Réunion's points only, their times in UTC", () => {
    // Each bundled point the fixture lists, and only those: most of them.
    expect(LUS).toBeGreaterThan(POINTS.length * 0.9);
    expect(Object.keys(LIVE.points).every((id) => IDS.has(id))).toBe(true);
    // Freshmile writes Paris time without its offset: UTC+2 until the last Sunday of October, then UTC+1.
    expect(timeOf("2026-10-24 02:12:04")).toBe("2026-10-24T00:12:04.000Z");
    expect(timeOf("2026-12-24 02:12:04")).toBe("2026-12-24T01:12:04.000Z");
    expect(timeOf("2026-10-23 06:18:11.896000+00:00")).toBe("2026-10-23T06:18:11.896Z");
    expect(Object.values(LIVE.points).every(([, , at]) => at < NOW.toISOString())).toBe(true);
  });

  it("writes La Réunion's part every 15 minutes, at 5, 20, 35 and 50 past the hour, never a part that lost its points", async () => {
    const due = Array.from({ length: 12 }, (_, i) => i * 5).filter((m) => refreshDue(new Date(Date.UTC(2026, 9, 26, 8, m, 2))));
    expect(due).toEqual([5, 20, 35, 50]);
    let written: Live | undefined;
    const write = async (live: Live) => void (written = live);
    vi.stubGlobal("fetch", async () => new Response(CSV));
    expect(await refresh(write, NOW)).toBe(LUS);
    expect(written).toEqual({ lu: NOW.toISOString(), points: LIVE.points });
    written = undefined;
    vi.stubGlobal("fetch", async () => new Response(CSV.split("\n").slice(0, 100).join("\n")));
    await expect(refresh(write, NOW)).rejects.toThrow(new RegExp(`seulement \\d+ points de La Réunion sur ${IDS.size}`));
    expect(written).toBeUndefined();
  });

  it("knows every station's commune and each point's power", () => {
    expect(STATIONS.length).toBeGreaterThan(100);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    expect(STATIONS.every((s) => s.commune && s.points.length && s.points.every((p) => p.kw > 0))).toBe(true);
  });

  it("sums up the island, fast charging apart", async () => {
    const r = body(await bornesRecharge(cache(LIVE), undefined, false, NOW));
    expect(r.resume).toMatch(new RegExp(`^Bornes de recharge publiques à La Réunion : ${STATIONS.length} stations, ${POINTS.length} points de charge\u00a0; d'après l'état des opérateurs de ${ETAT}, ${LIBRES} libres sur ${POINTS.length}`));
    // Never « en ce moment »: the count is the operators' state at its latest change, behind the reading (04:37).
    expect(r.resume).not.toContain("en ce moment");
    const c0 = r.communes[0].commune;
    expect(r.communes[0]).toEqual({ commune: c0, stations: STATIONS.filter((s) => s.commune === c0).length, points: POINTS.filter((p) => p.commune === c0).length, libres: POINTS.filter((p) => p.commune === c0 && libre(p.id)).length });
    // The 15 stations of 50 kW and more in the fixture, the best state first: an empty list would pass « every ».
    expect(r.recharge_rapide).toHaveLength(15);
    expect(r.recharge_rapide[0]).toMatchObject({ station: "Total Réunion, N1, Le Port", puissance_max_kw: 160 });
    expect(r.recharge_rapide.every((s: { puissance_max_kw: number }) => s.puissance_max_kw >= 50)).toBe(true);
  });

  it("names the RechargePei app in every answer, after the data and their sources, never as a source", async () => {
    for (const [l, live] of [[undefined, LIVE], ["Saint-Gilles-les-Bains", LIVE], ["Cilaos", null]] as const) {
      const r = body(await bornesRecharge(cache(live), l, false, NOW));
      const keys = Object.keys(r);
      expect(keys.at(-1)).toBe("voir_aussi");
      expect(keys.indexOf("sources")).toBe(keys.length - 2);
      expect(r.voir_aussi).toContain("https://apps.apple.com/fr/app/rechargepei/id6821010434");
      expect(r.voir_aussi).toContain("Ce n'est pas une source de rundata.re.");
      expect(JSON.stringify(r.sources)).not.toContain("RechargePei");
    }
    const page = bornesPage("https://rundata.re", { value: await buildBornes(cache(LIVE), NOW), fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain('On aime\u00a0: <a href="https://apps.apple.com/fr/app/rechargepei/id6821010434" rel="noopener">RechargePei</a>, une appli utile pour trouver une borne de recharge à La Réunion.</p>');
  });

  it("gives the nearest stations to a place, and every point's state", async () => {
    const r = body(await bornesRecharge(cache(LIVE), "Saint-Gilles-les-Bains", false, NOW));
    expect(r.resume).toMatch(/^Borne de recharge la plus proche de Saint-Gilles-les-Bains : .+, à 1,6\u00a0km à vol d'oiseau, \d+ libres? sur \d+/);
    expect(r.stations[0].points[0]).toMatchObject({ puissance_kw: 80, prises: ["Combo CCS"], etat: "libre" });
    const town = body(await bornesRecharge(cache(LIVE), "Le Tampon", false, NOW));
    const tampon = POINTS.filter((p) => p.commune === "Le Tampon");
    expect(town.resume).toMatch(new RegExp(`^${STATIONS.filter((s) => s.commune === "Le Tampon").length} stations de recharge au Tampon : ${tampon.filter((p) => libre(p.id)).length} libres sur ${tampon.length}`));
  });

  it("counts a bundled point the national file no longer lists « sans information », and a point it does not bundle not at all", async () => {
    const gone = Object.keys(LIVE.points).find(libre)!;
    const without: Live = { ...LIVE, points: { ...LIVE.points, FRXXXE9999999999: ["en_service", "libre", LIVE.lu] } };
    delete without.points[gone];
    expect(pointState(without, gone).etat).toBe("état inconnu");
    const sans = (l: Live) => POINTS.filter((p) => pointState(l, p.id).etat === "état inconnu").length;
    expect(sans(without)).toBe(sans(LIVE) + 1);
    const r = body(await bornesRecharge(cache(without), undefined, false, NOW));
    expect(r.resume).toContain(`${POINTS.length} points de charge`);
    expect(r.resume).toContain(`${LIBRES - 1} libres sur ${POINTS.length}`);
  });

  it("knows the points the national base added since the fixture was recorded, and says them « sans information » until the file lists them", () => {
    const added = POINTS.filter((p) => !LIVE.points[p.id]);
    expect(added.every((p) => pointState(LIVE, p.id).etat === "état inconnu")).toBe(true);
  });

  it("still lists the stations when the live state is missing", async () => {
    const r = body(await bornesRecharge(cache(null), "Cilaos", false, NOW));
    expect(r.resume).toMatch(/^1 station de recharge à Cilaos\.$/);
    expect(r.donnees).toMatch(/indisponible/);
    expect(r.stations[0].points[0].etat).toBeUndefined();
    await expect(buildBornes(cache(null), NOW)).rejects.toThrow();
  });

  it("dates the count by the reading, said as such, when the file gives no time of change", async () => {
    const data = { ...(await buildBornes(cache(LIVE), NOW)), etat_jusqu_a: undefined };
    const page = bornesPage("https://rundata.re", { value: data, fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain(`<span class="big">${LIBRES}</span><p>points de charge libres lu le 24/10 à 04:40, sur <b>`);
    expect(bornesLive({ value: data, fetchedAt: NOW, stale: false }, NOW)?.detail).not.toContain("état");
  });

  it("dates the tool's count by the reading, said as such, when the file gives no time of change", async () => {
    // The same points without their time of change: the summary says the file's reading, never « en ce moment ».
    const bare: Live = { ...LIVE, points: Object.fromEntries(Object.entries(LIVE.points).map(([id, [st, etat]]) => [id, [st, etat, ""]])) as Live["points"] };
    expect(lastChange(bare)).toBeUndefined();
    const r = body(await bornesRecharge(cache(bare), undefined, false, NOW));
    expect(r.resume).toMatch(new RegExp(`^Bornes de recharge publiques à La Réunion : ${STATIONS.length} stations, ${POINTS.length} points de charge\u00a0; dans le fichier lu à 04:37, ${LIBRES} libres sur ${POINTS.length}`));
    expect(r.resume).not.toMatch(/en ce moment|d'après l'état/);
    expect(r.etat_jusqu_a).toBeUndefined();
  });

  it("gives the home page's tile the time of the operators' state", async () => {
    const data = await buildBornes(cache(LIVE), NOW);
    expect(bornesLive({ value: data, fetchedAt: NOW, stale: false }, NOW)?.detail).toMatch(new RegExp(`^sur ${POINTS.length}, dans ${STATIONS.length} stations, état du 24/10 à ${ETAT} ; recharge rapide libre dans \\d+ stations?$`));
  });

  it("says the state's time with its day when it is not the reading's", () => {
    const lu = new Date("2026-11-20T00:10:00Z");
    expect(etatDe("2026-11-19T21:55:00Z", lu)).toBe("de 01:55");
    expect(etatDe("2026-11-19T19:40:00Z", lu)).toBe("du 19/11 23:40");
  });

  it("serves a page with the free points of each commune", async () => {
    const data = await buildBornes(cache(LIVE), NOW);
    const page = bornesPage("https://rundata.re", { value: data, fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain(`<span class="big">${LIBRES}</span>`);
    // The count dated by the operators' state (its latest change in the file, 04:12), not by the reading (04:40), and
    // never « en ce moment »: a copy kept by a search engine says its day.
    expect(page).toContain(`<span class="big">${LIBRES}</span><p>points de charge libres d&#39;après l&#39;état des opérateurs du 24/10 à ${ETAT}, sur <b>`);
    expect(page).toMatch(new RegExp(`<meta name="description" content="Bornes de recharge à La Réunion \\(974\\), état du 24/10 à\u00a0${ETAT}\u00a0: ${LIBRES} points libres sur \\d+, la recharge rapide et chaque station, commune par commune\\.">`));
    expect(page).not.toContain("en ce moment");
    expect(page).toContain("Recharge rapide");
    // The legend drawn as on the map (charter of the maps): a free point, none free, then the state's nature and time.
    expect(page).toContain('<circle r="34" fill="#237534"/><text y="11">3</text></svg>points de charge libres dans la commune</span>');
    expect(page).toContain('<circle r="34" fill="#5f6b75"/><text y="11">0</text></svg>aucun libre</span>');
    expect(page).not.toMatch(/fill="#(?:2b8a3e|868e96)"/);
    // The state is that of the latest change in the national file, said beside its reading, each with its day.
    expect(page).toMatch(/<span class="mls">D&#39;après les opérateurs de recharge \(<span class="adrweb">transport\.<wbr class="adr">data\.<wbr class="adr">gouv\.<wbr class="adr">fr<\/span>\), état jusqu&#39;au \d\d\/\d\d à \d\d:\d\d, lu le 24\/10 à 04:40\.<\/span>/);
    const sm = { stations: STATIONS.filter((s) => s.commune === "Sainte-Marie").length, points: POINTS.filter((p) => p.commune === "Sainte-Marie").length, libres: POINTS.filter((p) => p.commune === "Sainte-Marie" && libre(p.id)).length };
    expect(page).toContain(`<details><summary><h3>Sainte-Marie\u00a0<span class="note">· ${sm.libres}\u00a0libres sur\u00a0${sm.points}, ${sm.stations}\u00a0stations</span></h3></summary>`);
    // Each commune's marker leads to its card.
    expect(mapLinks(page).find((l) => l.label.startsWith("Sainte-Marie :"))).toEqual({ kind: "mk", href: "#c-sainte-marie", label: `Sainte-Marie : ${sm.libres} points de charge libres sur ${sm.points}, voir le détail` });
    // The count in the point, the commune's name in its bubble: no label under the points, which covered one another at 1280.
    expect(page).not.toContain('class="mn"');
    expect(page).toContain(`Sainte-Marie : ${sm.libres} libres sur ${sm.points}`);
    expect(deadAnchors(page)).toEqual([]);
    expect(doubleIds(page)).toEqual([]);
    const description = page.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("says the time of the latest change in the national file, never one after its reading", async () => {
    const live: Live = { lu: "2026-11-04T09:50:00.000Z", points: { a: ["en_service", "libre", "2026-11-04T08:42:00.000Z"], b: ["en_service", "occupe", "2026-11-04T07:00:00.000Z"], c: ["en_service", "libre", "2026-11-05T00:00:00.000Z"] } };
    expect(lastChange(live)).toBe("2026-11-04T08:42:00.000Z");
    const r = body(await bornesRecharge(cache(LIVE), undefined, false, NOW));
    // Réunion time, as /bornes says it, and the data's date in fraicheur (an assistant read the ISO's 07:24 as the time).
    expect(r.etat_jusqu_a).toBe(localTime(new Date(lastChange(LIVE)!)));
    expect(r.etat_jusqu_a).toMatch(/^\d\d\/\d\d \d\d:\d\d$/);
    expect(dataDate(r, NOW)).toMatchObject({ du: r.etat_jusqu_a, cle: "etat_jusqu_a" });
    // The page keeps its own instant.
    expect((await buildBornes(cache(LIVE), NOW)).etat_jusqu_a).toBe(lastChange(LIVE));
    expect(r.donnees).toMatch(/^État de chaque point d'après son opérateur, dans le fichier national lu à 04:37 \(heure de La Réunion\), dont le changement d'état le plus récent est de \d\d:\d\d\u00a0: ce fichier se remplit par lots et peut être en retard\./);
  });

  it("keeps each station apart, with an id of its own, when the base has no roaming id for it", () => {
    // Its first point's id when it has no roaming one (« REEFLEV0176757 », Saint-André): an anchor on /bornes all the same.
    expect(STATIONS.every((s) => /^[A-Za-z0-9*]+$/.test(s.id) && s.points.some((p) => p.id === s.id || /^FR[A-Z0-9]{3}/.test(s.id)))).toBe(true);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
  });
});
