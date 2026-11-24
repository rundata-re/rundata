import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { buildRandonnees, type RandonneesAnswer, type TrailItem } from "../src/web/data.js";
import { COMMUNES, communePage } from "../src/web/commune.js";
import { communeHikes, communeTrails, SENTIERS_TUILE } from "../src/web/liens.js";
import { pageOf } from "../src/web/places.js";
import { gardee } from "../src/web/sitemap-gardees.js";

// The trails of the sitemap had one page in one click from the home page that led to them, /randonnees and its whole
// list: the commune's hiking tile now names a few of its own, those people look for, the closed first. A second way in,
// useful to who lives there, and no block of links: three at most, with their state of the day.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/onf/${f}`, import.meta.url), "utf8");
const O = "https://rundata.re";
const NOW = new Date("2026-10-24T04:00:00Z");
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());
const rows = (html: string) => [...html.matchAll(/<li><span><a href="\/sentiers\/([^"]+)">([^<]*)<\/a><small>([^<]*)<\/small><\/span><span class="(q-[a-z]+)">([^<]*)<\/span><\/li>/g)];

describe("the commune's hiking tile", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("/5/query") ? "sentiers.json" : url.includes("/4/query") ? "routes.json" : "couche.json";
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("names up to three of the commune's trails of the sitemap, the closed first then alphabetically, with the state of the same copy", async () => {
    const hikes = { value: await buildRandonnees(cache(), NOW), fetchedAt: NOW, stale: false };
    const all = hikes.value.secteurs.flatMap((z) => z.sentiers);
    let named = 0;
    let withClosed = 0;
    for (const c of COMMUNES) {
      const tile = communeHikes(c, hikes, NOW);
      const mine = all.filter((t) => t.communes.includes(c.nom) && t.etat !== "inconnu");
      const kept = mine.filter((t) => t.slug && gardee(`/sentiers/${t.slug}`));
      if (!kept.length) {
        expect(tile?.more, c.nom).toBeUndefined();
        continue;
      }
      const list = rows(tile!.more!);
      expect(list.length, c.nom).toBe(Math.min(SENTIERS_TUILE, kept.length));
      named += list.length;
      const states = list.map((m) => m[5]);
      // The closed first: no open one before a closed one.
      expect(states.join(","), c.nom).toMatch(/^(fermé( en partie)?,)*(fermé( en partie)?|ouvert)?(,ouvert)*$/);
      if (kept.some((t) => t.etat === "fermé")) {
        withClosed++;
        expect(states[0], c.nom).toMatch(/^fermé/);
      }
      for (const [, slug, nom, small, cls, state] of list) {
        // Each of the sitemap, running through the commune, as the tile counts « sur N dans la commune ».
        expect(gardee(`/sentiers/${slug}`), slug).toBe(true);
        const t = mine.find((x) => x.slug === slug)!;
        expect(t, `${c.nom} ${slug}`).toBeDefined();
        expect(nom.replaceAll("&#39;", "'")).toBe(t.nom);
        // Its state the copy's, as /randonnees and the trail's page say it: never « ouvert » made up.
        expect(state).toBe(t.etat === "fermé" ? (t.partiel ? "fermé en partie" : "fermé") : "ouvert");
        expect(cls).toBe(t.etat === "fermé" ? "q-mauvaise" : "q-bonne");
        expect(small).toMatch(/^\d+(,\d)? km( · \+\d[\d ]* m)?$/);
      }
      // The state's date is the tile's: « d'après la carte de l'ONF du … ».
      expect(tile!.live!.detail, c.nom).toContain("d'après la carte de l'ONF");
    }
    // The fixture's map names trails of the list in most communes, closed ones in some.
    expect(named).toBeGreaterThan(30);
    expect(withClosed).toBeGreaterThan(3);
  });

  it("orders by the state then alphabetically, and leaves out a trail off the list, with no page or with no state", () => {
    const t = (slug: string | undefined, etat: string, partiel?: boolean) => ({ k: slug ?? "x", nom: slug ?? "Sans page", slug, commune: "Cilaos", communes: ["Cilaos"], km: 2, etat, ...(partiel ? { partiel } : {}), boucle: false, randonnees: [] }) as TrailItem;
    const picked = communeTrails([
      t("sentier-bassin-fouquet", "ouvert"),
      t("le-bloc-piton-des-neiges", "ouvert"),
      t("pas-un-sentier-de-la-liste", "fermé"),
      t(undefined, "fermé"),
      t("cilaos-bras-sec-par-bras-de-benjoin", "fermé", true),
      t("parcours-sportif-du-plateau-des-chenes", "ouvert"),
      // Of the list, but with no state (out of the ONF's hands): never named, never said open.
      t("chemin-charrette", "inconnu"),
    ]);
    expect(picked.map((x) => x.slug)).toEqual(["cilaos-bras-sec-par-bras-de-benjoin", "le-bloc-piton-des-neiges", "parcours-sportif-du-plateau-des-chenes"]);
  });

  it("keeps its text of today without a copy of the trails, or with none of the list in the commune: no empty list", () => {
    expect(communeHikes(pageOf("cilaos")!, null)).toEqual({ nom: "Randonnée à Cilaos", href: "/randonnees/cilaos" });
    const one = { k: "s1", nom: "Sentier A", slug: "pas-de-la-liste", commune: "Cilaos", communes: ["Cilaos"], km: 3, etat: "ouvert", boucle: false, randonnees: [] };
    const hikes = { value: { randonnees: [], secteurs: [{ secteur: "Cilaos", communes: ["Cilaos"], sentiers: [one] }], lignes: [], fermes: 0, suivis: 1, sources: [] } as unknown as RandonneesAnswer, fetchedAt: NOW, stale: false };
    const tile = communeHikes(pageOf("cilaos")!, hikes, NOW)!;
    expect(tile.more).toBeUndefined();
    expect(tile.live!.valeur).toBe("1 sentier ouvert");
  });

  it("shows the list in the tile on the commune's page, the tile on a whole row", async () => {
    const hikes = { value: await buildRandonnees(cache(), NOW), fetchedAt: NOW, stale: false };
    const p = pageOf("cilaos")!;
    const html = communePage(O, p, { place: null, randonnees: hikes } as never, NOW);
    // The tile, from its opening to the next one's: its list holds <li>s of its own.
    const at = html.lastIndexOf('<li class="tile', html.indexOf(">Randonnée à Cilaos<"));
    const end = html.indexOf('<li class="tile', at + 1);
    const whole = html.slice(at, end);
    const tile = [whole, whole.slice(0, whole.indexOf(">")), whole] as const;
    const mine = hikes.value.secteurs.flatMap((z) => z.sentiers).filter((t) => t.communes.includes("Cilaos") && t.etat !== "inconnu");
    expect(rows(tile[2]).map((m) => m[1])).toEqual(communeTrails(mine).map((t) => t.slug));
    expect(rows(tile[2]).length).toBeGreaterThan(0);
    expect(tile[1]).toMatch(/--s2:2/);
  });
});
