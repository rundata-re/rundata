import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as climat from "../src/providers/climat.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import type { MeteoAnswer, PlaceData } from "../src/web/data.js";
import {
  archiveOf, type Chiffres, chiffresDe, chiffresScript, CSS_CHIFFRES, chiffresScriptPath, DEFAUT, dessine, dit, enChiffres, FIGURES, KEY, LARGEUR, leadOf, type Reglages,
} from "../src/web/en-chiffres.js";
import { CSS, placePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import { site } from "../src/web/site.js";

// The hourly package of 25/10/2026, read at 12:57 Réunion time (its newest hour ends at 12:00), and the archive's days
// up to 23/10 (scripts/build-climat.py), as in test/station.test.ts.
const NOW = new Date("2026-10-25T08:57:00Z");
const HOURLY = meteofrance.parseHourly(readFileSync(new URL("./fixtures/meteofrance_horaire.csv", import.meta.url), "utf8"), NOW.getTime());
const PIERREFONDS = "97416463";
let db: DatabaseSync;
beforeAll(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./fixtures/historique/climat.sql", import.meta.url), "utf8"));
});
afterEach(() => climat.configure(undefined));
const plug = () => climat.configure({ all: async <T>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as (string | number)[])) as T[] });

// Entre-Deux (382 m): no station of its own, Pierrefonds the nearest with a temperature each hour (the review's case).
const entreDeux = pageOf("entre-deux")!;
const LIEU = { nom: entreDeux.nom, lon: entreDeux.place.lon, lat: entreDeux.place.lat, altitude_m: entreDeux.place.altitude_m, commune: "Entre-Deux" };
const MESURE = { station: "Saint-Pierre Pierrefonds (aéroport)", source: "meteofrance", altitude_m: 21, heure_mesure: "25/10/2026 12:54", age_min: 3, mesures: { temperature: "27,1 °C" }, avertissements: [], distance_km: 9.2, pertinence: "moyenne" };
const AMATEUR = { station: "Bras de Pontho", source: "meteor_oi", altitude_m: 520, heure_mesure: "25/10/2026 12:50", age_min: 7, mesures: { temperature: "22,4 °C" }, avertissements: [], distance_km: 3.1, amateur: true };
const meteo = (stations = [MESURE, AMATEUR]): MeteoAnswer => ({ resume: "", stations, sources: [] });
const VEILLE = { jour: "2026-10-24", complet: true, stations: { [PIERREFONDS]: { rr: 0.4, tn: 21, tx: 29.4 } } };

async function figures(o: Partial<Parameters<typeof chiffresDe>[0]> = {}): Promise<Chiffres> {
  plug();
  const ids = ["97416463", "97422440", "97424410", "97412356", "97412384"];
  return chiffresDe({ place: LIEU, meteo: meteo(), hourly: HOURLY, observations: [], lu: NOW, veille: VEILLE, archive: await archiveOf(new Cache(), ids, NOW), now: NOW, ...o })!;
}
const D = (c: Chiffres) => ({ ...c, mois: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"], vent: ["du nord", "du nord-est", "d'est", "du sud-est", "du sud", "du sud-ouest", "d'ouest", "du nord-ouest"], figures: FIGURES });
const draw = (c: Chiffres, r: Partial<Reglages> = {}, w = LARGEUR) => dessine(D(c), { ...DEFAUT, ...r }, w);
/** The text of some HTML, as a reader sees it (the markup is ours: tags only, no comment nor script). */
const text = (html: string) => html.split("<").map((p, i) => (i ? p.slice(p.indexOf(">") + 1) : p)).join(" ").replace(/[ \t\n]+/g, " ").trim();

describe("« <Lieu> en chiffres » (the user, 10/11/2026: « oui, supprime les variantes 6h et ajoute 30j »)", () => {
  it("offers the nearest stations with a temperature each hour, the one the page names first by default", async () => {
    const c = await figures();
    expect(c.defaut).toBe(PIERREFONDS);
    expect(c.stations[0].nom).toBe("Saint-Pierre Pierrefonds, aéroport");
    expect(c.stations.filter((s) => !s.am).every((s) => s.h!.t.some((t) => t != null))).toBe(true);
    // Its hours oldest first, the newest ending at 12:00 (08:00Z); its last 30 days up to the archive's last, 23/10.
    const p = c.stations[0];
    expect(p.h!.t).toHaveLength(24);
    expect(p.h!.t.at(-1)).toBe(HOURLY.mesures![PIERREFONDS].t[0]);
    expect(p.j!.au).toBe("2026-10-23");
    expect(p.j!.tx).toHaveLength(31);
    // Yesterday is not in the archive yet: from the hours kept that night, said provisional.
    expect(p.hier).toEqual({ j: "2026-10-24", tn: 21, tx: 29.4, rr: 0.4, prov: true });
    // The amateur station of the page's answer: its last temperature only.
    expect(c.stations.find((s) => s.am)).toMatchObject({ nom: "Bras de Pontho", now: { t: 22.4 }, alt: 520 });
  });

  it("says when the station is far or at another altitude, never « plus frais » nor « plus chaud »", async () => {
    const c = await figures();
    expect(c.stations[0].lead).toMatch(/^Pas de mesure de température à Entre-Deux\. Mesuré à 12:00 à Saint-Pierre Pierrefonds, aéroport \(21\u00a0m\), à [\d,]+\u00a0km et 3\d\d\u00a0m plus bas\u00a0: la température peut être différente à Entre-Deux\.$/);
    // Salazie: its own station measures only the rain (the review: « Pas de station à Salazie » would be false).
    expect(leadOf({ nom: "Bellevue Bras-Panon", alt: 480, d: 8.5, at: "2026-11-09T20:24:00Z" }, { nom: "Salazie", alt: 417, pluieSeule: "Salazie-Village" }))
      .toBe("La station de Salazie-Village ne mesure que la pluie. Température mesurée à 00:24 à Bellevue Bras-Panon (480\u00a0m), à 8,5\u00a0km\u00a0: elle peut être différente à Salazie.");
    // Near and at about its altitude: where and when, nothing more.
    expect(leadOf({ nom: "Saint-Leu", alt: 79, d: 2.5, at: "2026-11-09T13:00:00Z" }, { nom: "Saint-Leu", alt: 3 }))
      .toBe("Mesuré à 17:00 par la station Météo-France de Saint-Leu (79\u00a0m), à 2,5\u00a0km.");
    expect(leadOf({ nom: "Gillot", alt: 8, d: 7, at: "2026-11-09T13:00:00Z" }, { nom: "Le Tampon", alt: 10 })).toContain("différente au Tampon.");
    // The commune has its own station and the visitor chose another: nothing missing, the station's article right.
    expect(leadOf({ nom: "Le Tévelave", alt: 908, d: 9, at: "2026-11-10T06:54:00Z" }, { nom: "Saint-Leu", alt: 3, tempIci: true }))
      .toBe("Mesuré à 10:54 au Tévelave (908\u00a0m), à 9\u00a0km et 905\u00a0m plus haut\u00a0: la température peut être différente à Saint-Leu.");
    expect(leadOf({ nom: "Le Port", alt: 9, d: 2, at: "2026-11-10T06:54:00Z" }, { nom: "Le Port", alt: 5 })).toBe("Mesuré à 10:54 par la station Météo-France du Port (9\u00a0m), à 2\u00a0km.");
    for (const s of c.stations) expect(s.lead).not.toMatch(/plus (frais|chaud)/);
  });

  it("gives six figures, each with its value, its time and its station, never the place's name again nor « Voir la page »", async () => {
    const d = draw(await figures());
    const keys = [...d.chips.matchAll(/data-k="(\w+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(["h24", "hier", "pluie", "mois", "vent", "vois"]);
    const tips = [...d.chips.matchAll(/<span class="mk-tip" role="tooltip">(.*?)<\/span><\/button>/g)].map((m) => m[1]);
    expect(tips).toHaveLength(6);
    for (const t of tips) {
      expect(t).not.toContain("Entre-Deux");
      expect(t).not.toContain("Voir la page");
      expect(t, t).toMatch(/station (Météo-France|amateur)/);
      expect(t, t).toMatch(/\d/);
    }
    // The last 24 hours: their lowest and highest, at their hour.
    expect(tips[0]).toMatch(/^<b>[\d,]+\u00a0°C à \d\d:\d\d le 2[45]\/10<\/b><br>station Météo-France de Saint-Pierre Pierrefonds, aéroport, 21\u00a0m<br>le plus bas\u00a0: /);
    expect(text(d.chips)).toContain("Hier, 24/10 21 → 29,4\u00a0°C provisoire, d'après les relevés horaires");
    // The rain of 7 days, its dates, and its normal said as rundata.re's computation.
    expect(tips[2]).toMatch(/^<b>[\d,]+\u00a0mm du 17\/10 au 23\/10<\/b>/);
    expect(tips[2]).toContain("calculé par rundata.re sur la normale 1991-2020 de la station");
    expect(text(d.chips)).toContain("Octobre");
    // The station near: the amateur one hidden by default.
    expect(d.chips).not.toContain("Bras de Pontho");
    expect(draw(await figures(), { am: true }).chips).toContain('Bras de Pontho\u00a0: 22,4\u00a0°C<span class="mk-am">amateur</span>');
  });

  it("draws 24 hours, 7 days or 30 days, never 6 hours, each point with its value, time and station", async () => {
    const c = await figures();
    const h = draw(c);
    expect(h.pts).toHaveLength(HOURLY.mesures![PIERREFONDS].t.filter((t) => t != null).length);
    expect(h.pts.at(-1)!.html).toMatch(/^<b>[\d,]+\u00a0°C à 12:00 le 25\/10<\/b><br>station Météo-France de Saint-Pierre Pierrefonds, aéroport, 21\u00a0m<br>pluie de l'heure [\d,]+\u00a0mm · mesure horaire$/);
    expect(h.note).toBe("Relevé de chaque heure ; en bleu, la pluie de l'heure.");
    const w = draw(c, { p: "7" });
    expect(w.pts).toHaveLength(7);
    expect(w.pts[6].html).toMatch(/^<b>23\/10\u00a0: [\d,]+\u00a0°C → [\d,]+\u00a0°C<\/b>/);
    expect(draw(c, { p: "30" }).pts).toHaveLength(30);
    const block = enChiffres(c, "Entre-Deux", "entre-deux");
    expect(block).toContain('<button type="button" data-p="30" aria-pressed="false">30 jours</button>');
    expect(block).not.toMatch(/6\u00a0h|"6"/);
    for (const p of [...h.pts, ...w.pts]) expect(p.html).not.toContain("Entre-Deux");
  });

  it("counts the month's rain from the 1st when the archive's last day is a 31, and keeps a whole month for it", async () => {
    const c = await figures();
    const s = c.stations.find((x) => x.id === c.defaut)!;
    expect(s.j!.rr).toHaveLength(31);
    // The archive up to 31/10: 10 mm the 1st, 1 mm each other day, so 40 mm from the 1st, 39 had the 1st been left out.
    const rr = [10, ...Array.from({ length: 30 }, () => 1)];
    const j = { au: "2026-10-31", tn: rr.map(() => 20), tx: rr.map(() => 28), rr };
    const d = draw({ ...c, stations: c.stations.map((x) => (x === s ? { ...x, j } : x)) });
    const mois = d.chips.slice(d.chips.indexOf('data-k="mois"') + 36);
    expect(text(mois.slice(0, mois.indexOf("</button>")))).toMatch(/^Octobre 40\u00a0mm du 1er au 31\/10/);
    expect(draw({ ...c, stations: c.stations.map((x) => (x === s ? { ...x, j } : x)) }, { p: "30" }).pts).toHaveLength(30);
  });

  it("follows the settings: °F, knots, the figures hidden, another station", async () => {
    const c = await figures();
    const f = draw(c, { ut: "f", uv: "kt", hide: ["mois"] });
    expect(f.chips).toMatch(/°F/);
    expect(f.chips).not.toMatch(/°C/);
    expect(f.chips).not.toContain('data-k="mois"');
    expect(f.chips).toMatch(/nœuds/);
    const other = c.stations.find((s) => !s.am && s.id !== PIERREFONDS)!;
    const o = draw(c, { st: other.id });
    expect(o.titre).toBe(`Température mesurée à ${other.nom}`);
    expect(o.href).toBe(`/meteo/station/${other.id}`);
    expect(o.lead).toBe(other.lead.replace(/&/g, "&amp;"));
    // An unknown station (another place's, or gone) falls back on the default.
    expect(draw(c, { st: "00000000" }).href).toBe(`/meteo/station/${PIERREFONDS}`);
  });

  it("says the dates of its 7 days while the archive ends before yesterday, « en 7 jours » once yesterday is loaded", async () => {
    // Read at 12:57 on 25/10, the archive up to 23/10: yesterday, 24/10, is loaded at 11:45 each day (marketing, 12/11/2026).
    const c = await figures();
    const pluie = (d: ReturnType<typeof draw>) => { const x = d.chips.slice(d.chips.indexOf('data-k="pluie"')); return x.slice(0, x.indexOf("</button>")); };
    const early = draw(c);
    expect(pluie(early)).toMatch(/<span class="mk-s">[\d,]+\u00a0mm <span class="nw">du 17\/10 au 23\/10<\/span>/);
    expect(text(pluie(early))).not.toContain("en 7 jours");
    expect(draw(c, { p: "7" }).note).toBe("Jusqu'au 23/10\u00a0: la journée d'hier est ajoutée vers midi. Barres\u00a0: le plus bas et le plus haut de chaque jour ; en bleu, la pluie (de 10\u00a0h à 10\u00a0h le lendemain).");
    expect(draw(c, { p: "30" }).note).toMatch(/^Jusqu'au 23\/10\u00a0: la journée d'hier est ajoutée vers midi\. Barres/);
    expect(early.note).not.toContain("Jusqu'au");
    // Yesterday loaded: the archive's days up to 24/10, its window said as before, no note.
    const s = c.stations.find((x) => x.id === c.defaut)!;
    const add = (xs: (number | null)[], v: number) => [...xs.slice(1), v];
    const j = { au: "2026-10-24", tn: add(s.j!.tn, 21), tx: add(s.j!.tx, 29.4), rr: add(s.j!.rr, 0) };
    const loaded = { ...c, stations: c.stations.map((x) => (x === s ? { ...x, j } : x)) };
    expect(text(pluie(draw(loaded)))).toMatch(/[\d,]+\u00a0mm en 7 jours/);
    expect(pluie(draw(loaded))).not.toContain('class="nw"');
    for (const p of ["7", "30"] as const) expect(draw(loaded, { p }).note).toMatch(/^Barres/);
    // No rain at all: « 0 mm du … au … », never « pas de pluie ».
    const dry = { ...c, stations: c.stations.map((x) => (x === s ? { ...x, h: { ...x.h!, rr: x.h!.rr.map(() => null) }, j: { ...x.j!, rr: x.j!.rr.map(() => 0) } } : x)) };
    expect(text(pluie(draw(dry)))).toContain("0\u00a0mm du 17/10 au 23/10");
  });

  it("reads a point of the curve on a touch, not only on a move, the page still scrolling", () => {
    const script = chiffresScript();
    expect(script).toContain('plot.addEventListener("pointermove",near);plot.addEventListener("pointerdown",near);');
    expect(CSS_CHIFFRES).toMatch(/\.mx-plot\{[^}]*touch-action:pan-y/);
  });

  it("closes a figure's bubble on a touch anywhere else and on Échap", () => {
    const script = chiffresScript();
    // A touch outside the figures closes the one open; a touch on a figure is its own click.
    expect(script).toContain('document.addEventListener("pointerdown",(ev)=>{if(!(ev.target instanceof Element&&ev.target.closest("#mx .mk")))mx.querySelectorAll(".mk[aria-expanded=true]").forEach((x)=>x.setAttribute("aria-expanded","false"))});');
    // Échap closes it, and hides the one under the pointer or the focus until the pointer leaves or the focus goes.
    expect(script).toMatch(/document\.addEventListener\("keydown",\(ev\)=>\{if\(ev\.key==="Escape"\).*setAttribute\("data-x",""\);x\.setAttribute\("aria-expanded","false"\)/);
    expect(script).toContain('b.addEventListener("pointerleave",()=>b.removeAttribute("data-x"));b.addEventListener("blur",()=>b.removeAttribute("data-x"))');
    const show = CSS_CHIFFRES.indexOf(".mk:hover .mk-tip,.mk:focus-visible .mk-tip,.mk[aria-expanded=true] .mk-tip{display:block}");
    expect(show).toBeGreaterThan(0);
    expect(CSS_CHIFFRES.indexOf(".mk[data-x] .mk-tip{display:none}")).toBeGreaterThan(show);
  });

  it("serves its script at its address, kept a year, valid JavaScript", async () => {
    const res = await site(new Request(`https://rundata.re${chiffresScriptPath()}`), new Cache(new MemoryStore()), () => {});
    expect(res!.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res!.text()).toBe(chiffresScript());
    expect(() => new Function(chiffresScript())).not.toThrow();
  });

  it("keeps the settings in the browser only, a failure of its storage keeping the defaults", async () => {
    const block = enChiffres(await figures(), "Entre-Deux", "entre-deux");
    const script = chiffresScript();
    // One file for every place, kept a year by the browser: the page carries its data and its slug only.
    expect(block).toContain(`<script src="${chiffresScriptPath()}" defer></script>`);
    expect(chiffresScriptPath()).toMatch(/^\/meteo\/chiffres-\w+\.js$/);
    expect(block).toContain(' data-s="entre-deux" data-avant-ia>');
    expect(script).toContain(`K=${JSON.stringify(KEY)}`);
    expect(script).toContain('let S={};try{S=JSON.parse(localStorage.getItem(K)||"{}")||{}}catch(x){}');
    expect(script).toMatch(/try\{const o=.*localStorage\.setItem\(K,JSON\.stringify\(o\)\)\}catch\(x\)\{\}/);
    expect(script).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
    expect(block).toContain("Vos réglages restent dans ce navigateur. Rien n'est envoyé, sans compte.");
    expect(block).toContain('<input type="checkbox" id="mx-am"> <span>Montrer aussi les stations amateur (MétéoR-OI), à la fiabilité non vérifiée</span>');
    // The drawing in the page is this module's, with nothing named inside that the build would wrap (keepNames).
    expect(script).toContain(`draw=${dessine}`);
    const built = buildSync({ entryPoints: ["src/web/en-chiffres.ts"], write: false, keepNames: true, format: "esm" }).outputFiles[0].text;
    const fn = built.slice(built.indexOf("const dessine"), built.indexOf("const LARGEUR"));
    expect(fn.match(/__name/g)).toHaveLength(1); // its own name, outside the text put in the page
  });

  it("draws the same in the page's script as on the server", async () => {
    const c = await figures();
    const out = runInNewContext(`(${dessine})(D, R, 640)`, { D: D(c), R: DEFAUT }) as ReturnType<typeof dessine>;
    expect(JSON.parse(JSON.stringify(out))).toEqual(JSON.parse(JSON.stringify(draw(c))));
  });

  it("comes after the page's band and before the question to an assistant, the measures after", async () => {
    const c = await figures({ meteo: meteo([MESURE]) });
    const data: PlaceData = { meteo: { resume: "", stations: [{ ...MESURE, avertissements: [] }], sources: [] }, chiffres: c };
    const html = placePage("https://rundata.re", entreDeux, { value: data, fetchedAt: NOW, stale: false }, NOW);
    const main = html.slice(html.indexOf("<main"));
    const at = (s: string) => main.indexOf(s);
    expect(at('<section class="mx" id="mx"')).toBeGreaterThan(0);
    expect(at('<section class="mx" id="mx"')).toBeLessThan(at('<div class="askbox">'));
    expect(at('<div class="askbox">')).toBeLessThan(at('id="h-now"'));
    expect(main).toContain("<h2 id=\"mx-t\">Entre-Deux en chiffres</h2>");
    expect(main).toContain(`<a class="mx-link" id="mx-link" href="/meteo/station/${PIERREFONDS}">Les relevés de la station de Saint-Pierre Pierrefonds, aéroport depuis `);
    // A copy built before the block: the page as before.
    const old = placePage("https://rundata.re", entreDeux, { value: { meteo: data.meteo }, fetchedAt: NOW, stale: false }, NOW);
    expect(old).not.toContain('id="mx"');
    expect(CSS).toContain(".mx-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))");
  });

  it("names a station of an airport once, without two brackets", () => {
    expect(dit("Saint-Pierre Pierrefonds (aéroport)")).toBe("Saint-Pierre Pierrefonds, aéroport");
    expect(dit("Saint-Leu")).toBe("Saint-Leu");
  });
});
