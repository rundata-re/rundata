import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as transit from "../src/providers/transit.js";
import { searchPage } from "../src/web/arret.js";
import { estDeclare } from "../src/web/scripts-declares.js";
import { ARRETS_AUTOUR, ARRETS_LISTE, arretsAutour, arretsListe, SCRIPT } from "../src/web/arrets-autour.js";
import { busPage } from "../src/web/domains.js";
import { site } from "../src/web/site.js";

const O = "https://rundata.re";
const NOW = new Date("2026-11-24T04:00:00Z");
// The forecourt of the bus station of Saint-Pierre.
const GARE_SP = { lat: -21.3341, lon: 55.4716 };

// 24/11/2026: « mon prochain bus » on a phone needed the exact name of one's stop; /bus had no « autour de moi ».
describe("« Arrêts autour de moi » on /bus", () => {
  it("is on /bus and on the search for a stop, hidden until its script runs", () => {
    for (const html of [busPage(O, null, NOW), searchPage(O, "mairie", [])]) {
      expect(html).toContain(`<div class="autour" id="arrets-autour" hidden><button type="button" class="btn sun" id="arrets-autour-btn">Arrêts autour de moi</button>`);
      expect(html).toContain("Votre position ne quitte pas votre appareil.");
    }
  });

  it("lists every stop page, with where it stands", () => {
    const l = arretsListe();
    expect(l.a.length).toBe(transit.stopPages().size);
    for (const [slug, nom, c, lat, lon] of l.a) {
      expect(transit.stopPages().get(slug)?.nom).toBe(nom);
      expect(l.communes[c]).toBe(transit.stopPages().get(slug)!.commune);
      expect(lat > -21.45 && lat < -20.85 && lon > 55.2 && lon < 55.85, slug).toBe(true);
    }
  });

  it("serves the list at an address that changes with the stops, kept a year", async () => {
    expect(ARRETS_LISTE).toBe(`/bus/arrets.${transit.BUILD}.json`);
    const r = (await site(new Request(`${O}${ARRETS_LISTE}`), new Cache(new MemoryStore(), () => NOW.getTime()), () => {}, NOW))!;
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await r.json()).toEqual(JSON.parse(JSON.stringify(arretsListe())));
  });

  /** The page's script run on a phone at `at`: the requests it makes and the list it shows. */
  async function clicked(at: { lat: number; lon: number } | { code: number }) {
    const el = () => ({ hidden: true, disabled: false, textContent: "", innerHTML: "", on: undefined as undefined | (() => void), addEventListener(_: string, f: () => void) { this.on = f; } });
    const els: Record<string, ReturnType<typeof el>> = Object.fromEntries(["arrets-autour", "arrets-autour-btn", "arrets-autour-msg", "arrets-autour-res", "arrets-autour-list"].map((id) => [id, el()]));
    const asked: string[] = [];
    expect(arretsAutour()).toContain(`<script>${SCRIPT}</script>`);
    // Declared to the page's policy (scripts-declares.ts): else the browser blocks it.
    expect(estDeclare(SCRIPT)).toBe(true);
    const script = SCRIPT;
    let settle!: () => void;
    const done = new Promise<void>((r) => (settle = r));
    runInNewContext(script, {
      document: { getElementById: (id: string) => els[id] },
      fetch: (u: string) => {
        asked.push(u);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(arretsListe()))) });
      },
      navigator: {
        geolocation: {
          getCurrentPosition: (ok: (p: unknown) => void, ko: (e: unknown) => void) =>
            "code" in at ? (ko(at), settle()) : (ok({ coords: { latitude: at.lat, longitude: at.lon } }), setTimeout(settle, 20)),
        },
      },
      setTimeout,
      Promise,
      Math,
      String,
      JSON,
      Error,
    });
    expect(els["arrets-autour"].hidden).toBe(false);
    els["arrets-autour-btn"].on!();
    await done;
    return { asked, list: els["arrets-autour-list"].innerHTML, res: els["arrets-autour-res"], msg: els["arrets-autour-msg"] };
  }

  it("asks the position at the click, loads the list alone, and shows the nearest stops leading to their departures", async () => {
    const { asked, list, res } = await clicked(GARE_SP);
    // The only request: the list, the same for everyone; never the position.
    expect(asked).toEqual([ARRETS_LISTE]);
    const links = [...list.matchAll(/<a href="\/bus\/arret\/([^"]+)"><span>[^<]+<\/span><small>[^<]+<\/small><\/a>/g)].map((m) => m[1]);
    expect(links).toHaveLength(ARRETS_AUTOUR);
    expect(links[0]).toBe("saint-pierre/gare-de-saint-pierre");
    expect(list).toMatch(/<small>\d+ m · Saint-Pierre<\/small>/);
    expect(res.hidden).toBe(false);
  });

  it("says what to do when the position is refused", async () => {
    const { asked, msg } = await clicked({ code: 1 });
    expect(asked).toEqual([]);
    expect(msg.textContent).toBe("Position non autorisée. Cherchez votre arrêt par son nom.");
  });
});
