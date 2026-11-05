import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, type Cached, MemoryStore } from "../src/cache.js";
import { BIKES_STALE_MS, COLUMNS, COMMUNES, communePage, spans } from "../src/web/commune.js";
import { type CommuneData, pointJustice } from "../src/web/data.js";
import { H, W } from "../src/web/map.js";
import { CSS } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";

const ORIGIN = "https://rundata.re";
// Saturday 31/10/2026, 01:13 at La Réunion.
const NOW = new Date("2026-10-30T21:13:00Z");
const p = pageOf("saint-pierre")!;

// Invented stations, from 5 bikes down to none, at an invented place.
const velos = ["Station A", "Station B", "Station C", "Station D", "Station E", "Station F"].map((nom, i) => ({
  nom,
  commune: "Saint-Pierre",
  velos_electriques: Math.max(0, 5 - 2 * i),
  places_libres: 6,
  maj: "15:35",
  lat: -21.3 - i / 1000,
  lon: 55.5,
}));
const departs: NonNullable<CommuneData["bus"]>["departs"] = [
  { heure: "04:10", dans_min: 177, ligne: "A1", direction: "Ville A", reseau: "Réseau A", arret: "Gare A" },
  { heure: "04:30", dans_min: 197, ligne: "A2", direction: "Ville B", reseau: "Réseau A", arret: "Gare A" },
];
const commune = (fetchedAt: Date, data: Partial<CommuneData> = { bus: { gare: true, arrets: [], departs }, velos }) =>
  ({ place: null, commune: { value: { sources: [], ...data }, fetchedAt, stale: false } as Cached<CommuneData> });
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/** The tiles of « en ce moment », in order: their name and their span at each of COLUMNS (absent: one column). */
function grid(page: string) {
  // The grid's own end, a line before its note: a tile may hold a list and a note of its own (« À découvrir »).
  const ul = page.match(/<ul class="tiles fit" aria-label="Catégories">(.*?)<\/ul>\n\s*<p class="note">/s)![1];
  return [...ul.matchAll(/<li class="tile[^"]*"(?: style="([^"]*)")?>.*?<h3>(?:<a[^>]*>)?([^<]*)/gs)].map((m) => ({
    nom: m[2],
    span: COLUMNS.map((c) => Number(new RegExp(`--s${c}:(\\d)`).exec(m[1] ?? "")?.[1] ?? 1)),
  }));
}

/** The rows of a grid of `c` columns packed as CSS packs it densely: each tile in the first place it fits. */
function pack(span: number[], c: number): number[][] {
  const rows: number[][] = [];
  span.forEach((s, i) => {
    for (let r = 0; ; r++) {
      const row = (rows[r] ??= Array(c).fill(-1));
      const at = row.findIndex((_, x) => x + s <= c && row.slice(x, x + s).every((v) => v < 0));
      if (at >= 0) return void row.fill(i, at, at + s);
    }
  });
  return rows;
}

const tile = (page: string, nom: string) => page.match(new RegExp(`<li class="tile[^>]*>(?:(?!<li class="tile).)*?>${nom}(?:</a>)?</h3>.*?(?=<li class="tile)`, "s"))![0];

describe("a commune's tiles", () => {
  // A page built for each commune in three states: about 3 s alone, over vitest's 5 s by default when the whole suite
  // loads the machine. Its own time, so a busy machine is not taken for a hole in the grid.
  it("leave no hole in the grid, on a phone, a tablet or a computer, in every commune", () => {
    for (const c of COMMUNES)
      for (const data of [commune(ago(60_000)), commune(ago(60_000), {}), commune(ago(BIKES_STALE_MS + 60_000))]) {
        const g = grid(communePage(ORIGIN, c, data, NOW));
        COLUMNS.forEach((n, k) => {
          for (const row of pack(g.map((t) => t.span[k]), n)) expect(row.filter((x) => x < 0), `${c.nom}, ${n} colonnes`).toEqual([]);
        });
      }
  }, 30_000);

  it("give the buses and the bikes a whole row, beside no other tile", () => {
    const g = grid(communePage(ORIGIN, p, commune(ago(60_000)), NOW));
    for (const nom of ["Bus", "Vélos"]) expect(g.find((t) => t.nom === nom)!.span).toEqual([...COLUMNS]);
    // The small tiles go up to fill the row before them rather than leave it to the lists: one column each, but the last
    // ones, widened to end their row.
    expect(g.slice(0, 9).every((t) => ["Bus", "Vélos"].includes(t.nom) || t.span.every((s) => s === 1))).toBe(true);
  });

  it("widen the tile left of a gap that no later tile fills", () => {
    // Three tiles, then a list: on a phone the third is alone on its row, on a computer it ends one with a column left.
    expect(spans([{}, {}, {}, { full: true }])).toEqual([[1, 1, 1], [1, 1, 1], [2, 1, 2], [2, 3, 4]]);
    // On a phone the third tile goes up beside the first, the wide one under them; on a tablet it is alone under them.
    expect(spans([{}, { wide: true }, {}])).toEqual([[1, 1, 1], [2, 2, 2], [1, 3, 1]]);
  });
});

describe("the Vélos tile", () => {
  it("lists four stations on a line each, « Y aller » beside them", () => {
    const t = tile(communePage(ORIGIN, p, commune(ago(60_000)), NOW), "Vélos");
    expect(t).toContain('<p class="tv">9 vélos</p>');
    expect(t).toContain("électriques en libre-service dans 6 stations Altervélo, relevé le 31/10 à 01:12");
    expect(t.match(/<li>/g)).toHaveLength(4);
    expect(t).toContain('<li><span>Station A<small><b>5</b> vélos · 6 places</small></span><span class="ya"><a class="aller"');
    expect(t).not.toContain("Station E");
  });

  it("says « hier » for a count of the day before", () => {
    // Read at 23:50, seen at 00:05.
    const t = tile(communePage(ORIGIN, p, commune(new Date("2026-10-30T19:50:00Z")), new Date("2026-10-30T20:05:00Z")), "Vélos");
    expect(t).toContain("relevé le 30/10 à 23:50");
  });

  it("no longer gives the bikes counted as those of the moment once the count is old", () => {
    const t = tile(communePage(ORIGIN, p, commune(new Date("2026-10-30T11:35:00Z")), NOW), "Vélos");
    expect(t).toContain('<p class="tv">6 stations</p>');
    // The instruction first, never cut.
    expect(t).toContain('<p class="td all">Rechargez la page dans quelques secondes\u00a0: vélos libres comptés le 30/10 à 15:35.</p>');
    expect(tile(communePage(ORIGIN, p, commune(new Date("2026-10-29T11:35:00Z")), NOW), "Vélos")).toContain("vélos libres comptés le 29/10 à 15:35.");
    expect(t).not.toMatch(/\d vélos?<|<li>/);
    // Just under the limit, the count is still given.
    expect(tile(communePage(ORIGIN, p, commune(ago(BIKES_STALE_MS - 60_000)), NOW), "Vélos")).toContain('<p class="tv">9 vélos</p>');
  });
});

describe("the town hall's tile", () => {
  // An invented town hall whose entry of the directory gives no hours.
  const hall = { nom: "Mairie - Ville A", insee: "97416", adresse: "Rue A", lon: null, lat: null, horaires: [], fiche: "https://lannuaire.service-public.fr/x" };

  it("says the hours are absent from the directory, and leaves them out of the description", () => {
    const page = communePage(ORIGIN, p, commune(ago(60_000), { mairie: hall }), NOW);
    expect(page).toContain(`<p class="tv">Horaires absents de l'annuaire</p>`);
    expect(page.match(/<meta name="description" content="([^"]*)"/)![1]).not.toMatch(/mairie/i);
  });

  it("says the town hall probably closed on a holiday, never open by its weekday hours", () => {
    // Wednesday 11/11/2026, 10:00: a holiday, the hours of an invented town hall open on weekdays.
    const at = new Date("2026-11-11T06:00:00Z");
    const open = { ...hall, horaires: [{ de: "lundi", a: "vendredi", plages: [["08:00", "16:00"]] as [string, string][] }] };
    const cal = (aujourd_hui: string | null, fetchedAt = at) => ({ value: { jours_feries: { aujourd_hui, prochains: [], note: "" } }, fetchedAt, stale: false }) as never;
    const page = (c?: never) => communePage(ORIGIN, p, { ...commune(at, { mairie: open }), calendrier: c }, at);
    expect(tile(page(cal("Armistice 1918")), "Mairie")).toContain(`<p class="tv">Sans doute fermée</p>`);
    expect(tile(page(cal("Armistice 1918")), "Mairie")).toContain("jour férié (Armistice 1918)");
    expect(tile(page(cal(null)), "Mairie")).toContain(`<p class="tv">Ouverte</p>`);
    // A calendar of another day says nothing of today.
    expect(tile(page(cal("Armistice 1918", new Date("2026-11-10T06:00:00Z"))), "Mairie")).toContain(`<p class="tv">Ouverte</p>`);
  });
});

describe("the point-justice's tile", () => {
  afterEach(() => vi.unstubAllGlobals());
  // The places of justice of the 974, as service-public.fr's directory gave them on 03/11/2026.
  const rows = JSON.parse(readFileSync(new URL("./fixtures/annuaire_justice.json", import.meta.url), "utf8")).results;
  const of = async (slug: string) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total_count: rows.length, results: rows }), { headers: { "content-type": "application/json" } })));
    return pointJustice(new Cache(new MemoryStore(), () => NOW.getTime()), pageOf(slug)!);
  };

  it("gives the commune's own point-justice, its hours unpublished, and its phone", async () => {
    const justice = await of("cilaos");
    expect(justice).toMatchObject({ dans_la_commune: 1, lieu: { nom: "Point-justice de Cilaos" } });
    expect(justice!.km).toBeUndefined();
    const t = tile(communePage(ORIGIN, pageOf("cilaos")!, commune(ago(60_000), { justice }), NOW), "Point-justice");
    expect(t).toContain('<p class="tv">1 dans la commune</p>');
    expect(t).toContain('<p class="td">Point-justice de Cilaos, 4 rue des Ecoles, 97413 CILAOS</p>');
    // Below the detail, which a phone cuts at three lines.
    expect(t).toContain('<p class="note">horaires non publiés · tél. <a href="tel:0262289282">02\u00a062\u00a028\u00a092\u00a082</a></p><p class="ya"><a class="aller"');
    expect(t).toContain("Fiche service-public.fr");
  });

  it("gives the nearest one elsewhere, with how far, where the commune has none", async () => {
    const justice = await of("sainte-rose");
    expect(justice!.dans_la_commune).toBe(0);
    expect(justice!.km).toBeGreaterThan(5);
    const t = tile(communePage(ORIGIN, pageOf("sainte-rose")!, commune(ago(60_000), { justice }), NOW), "Point-justice");
    expect(t).toContain('<p class="tv">Aucun dans la commune</p>');
    expect(t).toContain(`le plus proche\u00a0: ${justice!.lieu.nom}, ${justice!.lieu.adresse}</p>`);
    expect(t).toContain(`<p class="note">à ${justice!.km} km à vol d&#39;oiseau · horaires non publiés · tél. <a href="tel:`);
  });

  it("never gives a point-justice held in a prison or at the EPSMR", async () => {
    for (const slug of ["le-port", "saint-paul", "saint-pierre", "saint-benoit", "saint-denis"]) {
      const justice = await of(slug);
      expect(justice!.lieu.nom, slug).not.toMatch(/EPSMR|détention|Pénitentiaire|arrêt/);
      expect(justice!.dans_la_commune, slug).toBeGreaterThan(0);
    }
    // Saint-Paul: four, of which the EPSMR's.
    expect((await of("saint-paul"))!.dans_la_commune).toBe(3);
  });

  it("is left out when the directory gave nothing", () => {
    expect(grid(communePage(ORIGIN, p, commune(ago(60_000)), NOW)).map((t) => t.nom)).not.toContain("Point-justice");
  });
});

describe("a commune's map", () => {
  it("waits in a template until it nears the screen, its room kept", () => {
    const page = communePage(ORIGIN, p, commune(ago(60_000)), NOW);
    const fig = page.match(/<figure class="card mapcard nophone">(.*?)<\/figure>/s)![1];
    expect(fig).toMatch(/^<div class="sit"><template class="carte"><svg class="map[^"]*"[^>]*aria-label="Carte de La Réunion \(974\) situant Saint-Pierre"/);
    // The commune drawn apart, inside the template with the rest of the map.
    expect(fig.indexOf('<path class="hl"')).toBeGreaterThan(0);
    expect(fig.indexOf('<path class="hl"')).toBeLessThan(fig.indexOf("</template>"));
    expect(fig).toMatch(/<\/template><script>.*IntersectionObserver.*<\/script><\/div>$/s);
    expect(CSS).toContain(`.mapcard .sit{aspect-ratio:${W}/${H}}`);
  });
});
