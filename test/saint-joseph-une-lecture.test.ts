import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { AGENDAS, echecPlanifie, type AgendaStore } from "../src/providers/agenda.js";
import { AVIS_SAINT_JOSEPH, planifiees } from "../src/providers/agendas-planifies.js";
import { lecture, parseSaintJoseph, saintJoseph } from "../src/providers/avis-eau.js";
import { coupuresEau } from "../src/tools/coupures.js";
import { buildCoupures, lusLe } from "../src/web/data.js";
import { coupuresCommunePage } from "../src/web/coupures.js";
import { pageOf } from "../src/web/places.js";

// 27/11/2026: Saint-Joseph's feed, read for its news (agenda.ts) once an hour and for the water's notices (avis-eau.ts)
// every quarter of an hour, now read once an hour for both: the notices it holds are kept with the agendas read by the
// scheduled event, with the time of that read.
const FEED = readFileSync(new URL("./fixtures/avis-eau/saint-joseph.xml", import.meta.url), "utf8");
const NOW = new Date("2026-11-27T06:00:00Z"); // 10:00 at La Réunion
const SJ = AGENDAS.find((a) => a.id === "saint_joseph")!;
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

/** A cache whose bundle of the planned agendas holds `entries`, written at `at`, then read at NOW. */
async function keptAt(at: Date, entries: Record<string, unknown>) {
  let t = at.getTime();
  const c = new Cache(new MemoryStore(), () => t);
  const b = await planifiees(c);
  for (const [k, v] of Object.entries(entries)) b.set(k, v);
  t = NOW.getTime();
  return c;
}

/** The fetches asked, each answered by Saint-Joseph's feed, or an empty feed for the other sites. */
function sites() {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(new URL(url).hostname);
    if (url.includes("saintjoseph.re")) return new Response(FEED);
    return /json|wp-json/.test(url) ? new Response("[]") : new Response("<rss><channel></channel></rss>");
  });
  return asked;
}
afterEach(() => vi.unstubAllGlobals());

describe("Saint-Joseph's feed, read once an hour for its news and its water notices", () => {
  it("keeps the notices of the news's read beside its events", async () => {
    const asked = sites();
    const kept: Record<string, unknown> = {};
    const store: AgendaStore = { get: async (_k, _s, load) => ({ value: await load(), fetchedAt: NOW, stale: false }), set: (k, v) => void (kept[k] = v) };
    await SJ.load(store, NOW);
    expect(asked).toEqual(["saintjoseph.re"]);
    expect(kept[AVIS_SAINT_JOSEPH]).toEqual(parseSaintJoseph(FEED));
    expect((kept[AVIS_SAINT_JOSEPH] as unknown[]).length).toBe(1);
  });

  it("gives the water's notices from that read, with its time, without asking the site again", async () => {
    const asked = sites();
    const read = new Date("2026-11-27T05:20:00Z"); // 09:20
    // Read 40 minutes later.
    const later = await keptAt(read, { [AVIS_SAINT_JOSEPH]: parseSaintJoseph(FEED) });
    const r = await saintJoseph(later);
    expect(asked).toEqual([]);
    expect(r.lu_le).toBe(read.toISOString());
    expect(r.avis.map((a) => a.titre)).toEqual(["Sudéau : Perturbations et coupures d’eau sur certains secteurs"]);
  });

  it("is said silent once the news's reads have failed past their keeping, and reads the site once before any", async () => {
    const asked = sites();
    const old = new Date(NOW.getTime() - 111 * 60_000);
    await expect(saintJoseph(await keptAt(old, { [AVIS_SAINT_JOSEPH]: [] }))).rejects.toThrow(/n'a pas répondu/);
    // None kept yet, its news's last try failed: silent, the site not asked.
    await expect(saintJoseph(await keptAt(NOW, { [echecPlanifie(SJ)]: true }))).rejects.toThrow(/n'a pas répondu/);
    expect(asked).toEqual([]);
    // None kept and no failure (just put online): its site read once, as before.
    const fresh = new Cache(new MemoryStore(), () => NOW.getTime());
    const r = await saintJoseph(fresh);
    expect(asked).toEqual(["saintjoseph.re"]);
    expect(r.lu_le).toBe(NOW.toISOString());
  });

  it("says the hour of that read for Saint-Joseph, the others' for the other communes", async () => {
    sites();
    const read = new Date("2026-11-27T05:20:00Z");
    const later = await keptAt(read, { [AVIS_SAINT_JOSEPH]: [] });
    const flux = (await lecture(later)).value;
    expect(flux.find((f) => f.site === "https://saintjoseph.re/")).toMatchObject({ avis: [], lu_le: read.toISOString() });
    expect(flux.filter((f) => f.lu_le).length).toBe(1);
    const sj = body(await coupuresEau(later, "Saint-Joseph", NOW));
    expect(sj.resume).toContain("sur le site de la ville de Saint-Joseph, lu le 27/11 à 09:20");
    const tampon = body(await coupuresEau(later, "Le Tampon", NOW));
    expect(tampon.resume).toContain("lu le 27/11 à 10:00");
    const ile = body(await coupuresEau(later, undefined, NOW, true));
    expect(ile.avis_lus_le_par_site).toEqual({ "https://saintjoseph.re/": read.toISOString() });
    const copie = { value: ile, fetchedAt: NOW };
    expect(lusLe(copie, "https://saintjoseph.re/")).toBe(read.toISOString());
    expect(lusLe(copie, "https://letampon.fr/")).toBe(NOW.toISOString());
  });

  it("says on Saint-Joseph's page, under « Pas d'avis » and at its read's hour, that Sudéau publishes its notices on its site", async () => {
    sites();
    const c = await keptAt(new Date("2026-11-27T05:20:00Z"), { [AVIS_SAINT_JOSEPH]: [] });
    const coupures = { value: await buildCoupures(c, NOW), fetchedAt: NOW };
    const page = coupuresCommunePage("https://rundata.re", pageOf("saint-joseph")!, { coupures }, NOW).replace(/[\u00a0\u202f]/g, " ");
    expect(page).toContain(`<p class="lead">Pas d'avis de coupure récent ou à venir publié par la ville de Saint-Joseph, lu le 27/11 à 09:20. Les avis de coupure de Saint-Joseph sont publiés par Sudéau sur <a href="https://www.sudeau.re/" rel="noopener">son site</a>, dans ses communiqués. La mairie peut aussi vous renseigner.</p>`);
    // Sudéau's site is not read: nothing said of it beyond the CASUD's word (its communiqués), no rubric of Les Avirons's.
    expect(page).not.toContain("L'eau dans ma commune");
    const sj = body(await coupuresEau(c, "Saint-Joseph", NOW));
    expect(sj.resume).toContain("publiés par Sudéau sur son site, dans ses communiqués : https://www.sudeau.re/.".replace(" :", "\u00a0:"));
    expect(sj.resume).not.toContain("L'eau dans ma commune");
    // Only Sudéau's home page is linked (Saur's terms), never a page of its site.
    expect(page.match(/https?:\/\/www\.sudeau\.re\/[^"]+/g)).toBeNull();
  });

  it("says where Sudéau publishes its notices when Saint-Joseph's site does not answer, on its page and in the tool (27/11/2026)", async () => {
    sites();
    // The news's reads failed past their keeping: the site said without answer, as seen live on 27/11 at 11:10.
    const c = await keptAt(new Date(NOW.getTime() - 111 * 60_000), { [AVIS_SAINT_JOSEPH]: [] });
    const coupures = { value: await buildCoupures(c, NOW), fetchedAt: NOW };
    const page = coupuresCommunePage("https://rundata.re", pageOf("saint-joseph")!, { coupures }, NOW).replace(/[\u00a0\u202f]/g, " ");
    const lead = page.match(/<p class="lead">[^]*?<\/p>/)![0];
    expect(lead).toContain("n&#39;a pas répondu");
    expect(lead).toContain(`Les avis de coupure de Saint-Joseph sont publiés par Sudéau sur <a href="https://www.sudeau.re/" rel="noopener">son site</a>, dans ses communiqués. La mairie peut aussi vous renseigner.</p>`);
    expect(page.match(/https?:\/\/www\.sudeau\.re\/[^"]+/g)).toBeNull();
    const sj = body(await coupuresEau(c, "Saint-Joseph", NOW));
    expect(sj.resume).toContain("n'a pas répondu");
    expect(sj.resume).toMatch(/n'a pas répondu[^]*Les avis de coupure de Saint-Joseph sont publiés par Sudéau sur son site, dans ses communiqués\u00a0: https:\/\/www\.sudeau\.re\/\. La mairie peut aussi vous renseigner\.$/);
    // Not for a silent commune with no such text: Le Tampon says only that its site did not answer.
    expect(body(await coupuresEau(c, "Le Tampon", NOW)).resume).not.toContain("Sudéau sur son site");
  });
});
