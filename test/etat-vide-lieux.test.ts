import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connecteurPage } from "../src/web/connecteur.js";
import type { HomeData, StationNow } from "../src/web/data.js";
import { meteoPage, placeLinks } from "../src/web/pages.js";
import { PAGES } from "../src/web/places.js";

const NOW = new Date("2026-11-06T17:00:00Z");
const COMMUNES = PAGES.filter((p) => p.commune);
const rien = (html: string) => html.slice(html.indexOf(`<div class="rien" id="rien" hidden>`));
const places = (html: string) => html.slice(html.indexOf(`<div class="places">`), html.indexOf(`<div class="rien"`));

describe("the field of the places, when no page has the name", () => {
  it("on the weather: the communes to choose, and every station on /meteo, not the assistant", () => {
    const html = placeLinks();
    const r = rien(html);
    expect(r).toContain("Pas de page météo pour « <span id=\"rien-q\"></span> ». Choisissez la commune du lieu : sa page donne la mesure de la station la plus pertinente et la prévision.");
    expect(COMMUNES).toHaveLength(24);
    for (const c of COMMUNES) expect(r).toContain(`<li><a href="/meteo/${c.slug}">`);
    expect(r).toContain(`<a href="/meteo#stations">Toutes les stations de mesure, commune par commune : sur la page Météo →</a>`);
    expect(r).not.toMatch(/IA|assistant|\/mcp/);
  });

  it("on a place's weather: the other communes", () => {
    const r = rien(placeLinks(COMMUNES[0].slug));
    expect(r).not.toContain(`href="/meteo/${COMMUNES[0].slug}"`);
    expect(r).toContain(`href="/meteo/${COMMUNES[1].slug}"`);
  });

  it("on the home page: the communes' pages, then the assistant for a lieu-dit", () => {
    const r = rien(placeLinks(undefined, true));
    expect(r).toContain("Pas de page pour « <span id=\"rien-q\"></span> ». Choisissez la commune du lieu :");
    for (const c of COMMUNES) expect(r).toContain(`<li><a href="/communes/${c.slug}">`);
    expect(r).toContain(`Pour un lieu-dit, votre assistant connaît plus de 2 000 lieux de l'île : <a href="/mcp">brancher mon IA →</a>`);
  });

  it("keeps the communes out of the chips the script filters, and the script's two ids", () => {
    // The filter hides every `.places li` that does not match: the communes of the empty state are after that block.
    for (const html of [placeLinks(), placeLinks(undefined, true)]) {
      expect(places(html)).not.toContain(`id="rien"`);
      expect(rien(html).match(/<li>/g)).toHaveLength(24);
      expect(html.match(/id="rien-q"/g)).toHaveLength(1);
    }
  });

  it("leads to an anchor /meteo has when it shows its stations", () => {
    const st = { nom: "Saint-Denis-Gillot", source: "meteofrance", lon: 55.52, lat: -20.89, altitude_m: 10, time: "2026-11-06T16:54:00Z", stale: false, temperature: 25 } as StationNow;
    const home: HomeData = { stations: [st], toutes: [st], sources: [], indisponibles: [], mer: [] };
    expect(meteoPage("https://rundata.re", { value: home, fetchedAt: NOW, stale: false }, NOW)).toContain(`<section id="stations" aria-labelledby="h-stations">`);
  });
});

describe("the links to the connector", () => {
  it("lead to /mcp, « Comment le brancher » to its step by step; /#assistant stays on the home page, no page leads there", () => {
    const dir = new URL("../src/web/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(new URL(f, dir), "utf8");
      expect(src, f).not.toContain(`href="/#assistant"`);
      for (const a of src.match(/<a href="[^"]*">Comment le brancher<\/a>/g) ?? []) expect(a, f).toBe(`<a href="/mcp#h-brancher">Comment le brancher</a>`);
    }
    expect(connecteurPage("https://rundata.re")).toContain(`<h2 id="h-brancher">`);
  });
});
