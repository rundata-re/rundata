import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as cmrs from "../src/providers/cmrs-carte.js";
import * as trace from "../src/providers/cmrs-trace.js";
import * as mf from "../src/providers/vigilance.js";
import type { Store } from "../src/providers/vigilance-carte.js";
import { cyclones } from "../src/tools/cyclones.js";
import { buildCyclones } from "../src/web/data.js";
import { cyclonesPage } from "../src/web/domains.js";

// The RSMC follows its system n° 2 of 2026-2027 (a disturbed zone, bulletin of 06/11/2026 at 06:54 UTC) while GDACS
// lists none: its forecast track map is read and shown all the same. The list holds the RSMC's bulletins of 06/11 at
// 08:11 and 13:28 UTC, its map written at 12:36:47 UTC, as read on Météo-France's site that day; the image itself is
// the one of test/cmrs-carte.test.ts (web.archive.org, 02/01/2026), to test the reading and the page, never to publish.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const ZP2 = fixture("cmrs/wtio31_zp2_2026110606.txt").toString("utf8");
const IMAGE = () => {
  const b = fixture("cmrs/trajectoire_2026-01-02.png");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const LISTE = ["202611051447", "202611060811", "202611061328"].map((n) => `<a onclick="window.open('./CMRSF_${n}.pdf','CMRS')">x</a>`).join("\n");
const GDACS_FILE = (url: string) => {
  if (url.includes("geteventlist")) return url.includes("pagenumber=2") ? "cyclones/liste_page2.json" : "cyclones/liste_page1.json";
};
// The bulletin read at 07:25 UTC (a quiet minute of cmrs-trace.ts), the list at 13:45, the map at 13:50, the page at 14:00.
const TRACE_AT = new Date("2026-11-06T07:25:00Z");
const LIST_AT = new Date("2026-11-06T13:45:00Z");
const IMAGE_AT = new Date("2026-11-06T13:50:00Z");
const NOW = new Date("2026-11-06T14:00:00Z");

class FakeKv implements Store {
  data = new Map<string, string | ArrayBuffer>();
  async json(key: string) {
    const v = this.data.get(key);
    return typeof v === "string" ? JSON.parse(v) : null;
  }
  async bytes(key: string) {
    const v = this.data.get(key);
    return v instanceof ArrayBuffer ? v : null;
  }
  async put(key: string, value: string | ArrayBuffer) {
    this.data.set(key, value);
  }
}

function stubFetch() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string | Request) => {
    const u = typeof url === "string" ? url : url.url;
    calls.push(u);
    if (u === trace.URL) return new Response(ZP2);
    if (u === cmrs.LISTE_URL) return new Response(LISTE);
    if (u === cmrs.IMAGE_URL) return new Response(IMAGE(), { headers: { "last-modified": "Fri, 06 Nov 2026 12:36:47 GMT" } });
    const f = GDACS_FILE(u);
    return f ? new Response(fixture(f)) : new Response("", { status: 503 });
  });
  return calls;
}
const cache = (now: Date) => new Cache(new MemoryStore(), () => now.getTime());

let kv: FakeKv;
beforeEach(() => {
  kv = new FakeKv();
  trace.ouvrir(true);
  trace.configure(kv);
  cmrs.configure(kv);
});
afterEach(() => {
  trace.configure();
  cmrs.configure();
  trace.ouvrir(trace.ACCORD !== null);
  vi.unstubAllGlobals();
});

describe("the RSMC's map of a system it follows before GDACS lists it", () => {
  it("is not read without a system followed, GDACS having none", async () => {
    const calls = stubFetch();
    expect(await cmrs.passage(cache(LIST_AT), LIST_AT)).toBe("aucun système actif");
    expect(calls.some((u) => u.includes("meteo.fr"))).toBe(false);
  });

  it("is read, then shown by the tool and on /cyclones under « Systèmes suivis », the basin's map saying it is followed", async () => {
    const calls = stubFetch();
    await trace.passage(cache(TRACE_AT), TRACE_AT);
    expect(await cmrs.passage(cache(LIST_AT), LIST_AT)).toBe("dernier bulletin 2026-11-06T13:28:00.000Z");
    expect(await cmrs.passage(cache(IMAGE_AT), IMAGE_AT)).toMatch(/^image [0-9a-f]{16} \(nouvelle\)$/);
    expect(calls.filter((u) => u.includes("meteo.fr"))).toEqual([cmrs.LISTE_URL, cmrs.IMAGE_URL]);

    const b = JSON.parse((await cyclones(cache(NOW), undefined, NOW)).content[0].text);
    expect(b.systemes_actifs).toBeUndefined();
    expect(b.suivi_cmrs).toHaveLength(1);
    expect(b.carte_officielle.image).toMatch(/^https:\/\/rundata\.re\/cyclones\/carte\/[0-9a-f]{16}\.png$/);

    const page = cyclonesPage("https://rundata.re", { value: await buildCyclones(cache(NOW), NOW), fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain('<h2 id="h-actifs">Systèmes suivis</h2>');
    expect(page).toContain('id="carte-cmrs"');
    expect(page).toContain("Source : Météo-France. Carte de prévision de trajectoire du CMRS de La Réunion");
    expect(page).toContain('<p><b>Un système est suivi par le CMRS : <a href="#carte-cmrs">sa carte officielle est au-dessus</a>.</b></p>');
    // The map comes before the basin's, which no longer says the basin is empty nor draws the past cyclones.
    expect(page.indexOf('id="carte-cmrs"')).toBeLessThan(page.indexOf('class="card bassin'));
    expect(page).not.toContain("Aucun système dans le bassin en ce moment");
    expect(page).not.toContain('class="trcs"');
    expect(page).not.toContain('<h2 id="h-actifs">Systèmes actifs</h2>');
    // The summary's last words link to Météo-France's site, whose address the connector writes out.
    expect(b.resume.endsWith(`${mf.OFFICIEL} : ${mf.OFFICIEL_CYCLONE}`)).toBe(true);
    expect(page).toContain(`<a href="${mf.OFFICIEL_CYCLONE}" rel="noopener">${mf.OFFICIEL}</a></p></div>`);
    expect(page).not.toContain(`: ${mf.OFFICIEL_CYCLONE}`);
  });

  it("without a map that follows the bulletin, says it is followed and sends to Météo-France's site", async () => {
    stubFetch();
    await trace.passage(cache(TRACE_AT), TRACE_AT);
    const page = cyclonesPage("https://rundata.re", { value: await buildCyclones(cache(NOW), NOW), fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain('<h2 id="h-actifs">Systèmes suivis</h2>');
    expect(page).not.toContain('id="carte-cmrs"');
    expect(page).toContain("<p><b>Un système est suivi par le CMRS :</b> ");
    expect(page).not.toContain("Aucun système dans le bassin en ce moment");
  });
});
