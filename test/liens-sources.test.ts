import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evenement } from "../src/connecteurs/helloasso.js";
import { httpUrl } from "../src/http.js";
import { releases } from "../src/providers/carburants.js";
import { parseMedia, parsePosts } from "../src/providers/coupures-courant.js";
import { parseList } from "../src/providers/cyclones.js";
import { parseRecherche } from "../src/providers/emploi.js";
import { fromLigne } from "../src/providers/marches-publics.js";
import { parsePetiteIle } from "../src/providers/agenda.js";
import { parseGolf, parseLsar } from "../src/providers/sport.js";
import { parse as parseTco } from "../src/providers/tco.js";

// The links read from the sources: only http(s) addresses reach a page's href, a tool's answer, the RSS or the ICS (23/11/2026).
const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const BAD = ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "mailto:a@b.re", "file:///etc/passwd"];

describe("httpUrl, the one way a source's link comes in", () => {
  it("keeps an absolute http(s) address and nothing else", () => {
    expect(httpUrl("https://www.boamp.fr/avis/1")).toBe("https://www.boamp.fr/avis/1");
    expect(httpUrl(" http://x.re/a ")).toBe("http://x.re/a");
    for (const b of [...BAD, "/relatif", "//hote.re/x", "", undefined, null]) expect(httpUrl(b), String(b)).toBeUndefined();
  });

  it("resolves a relative link against its page, and keeps it only if it is http(s)", () => {
    expect(httpUrl("/actualites/agenda/x", "https://www.petite-ile.re/")).toBe("https://www.petite-ile.re/actualites/agenda/x");
    expect(httpUrl("fiche.html", "https://www.teat.re/agenda/")).toBe("https://www.teat.re/agenda/fiche.html");
    for (const b of BAD) expect(httpUrl(b, "https://www.teat.re/"), b).toBeUndefined();
  });
});

describe("each source's links", () => {
  it("power cuts: a mairie's letter or post without an http(s) link is left out", () => {
    const media = (source_url: string) => ({ date: "2026-11-02T08:00:00", mime_type: "application/pdf", source_url });
    expect(parseMedia([media("https://ville.re/edf.pdf"), ...BAD.map(media)], "Saint-André").map((a) => a.lien)).toEqual(["https://ville.re/edf.pdf"]);
    const post = (link: string) => ({ date: "2026-11-02T08:00:00", link, title: { rendered: "Coupure d'électricité" }, content: { rendered: "Coupure de courant EDF lundi." } });
    expect(parsePosts([post("https://ville.re/coupure"), ...BAD.map(post)], "Cilaos").map((a) => a.lien)).toEqual(["https://ville.re/coupure"]);
  });

  it("BOAMP: a notice without an http(s) link is no notice", () => {
    const l = (url_avis: string) => ({ idweb: "26-1", objet: "Travaux", nomacheteur: "Commune", datelimitereponse: "2026-12-01T12:00:00", url_avis }) as Parameters<typeof fromLigne>[0];
    expect(fromLigne(l("https://www.boamp.fr/pages/avis/?q=idweb:26-1"))?.lien).toBe("https://www.boamp.fr/pages/avis/?q=idweb:26-1");
    for (const b of BAD) expect(fromLigne(l(b)), b).toBeUndefined();
  });

  it("TCO: a déchèterie whose link is not http(s) is left out", () => {
    const json = JSON.parse(read("tco_meteo.json"));
    const n = parseTco(json).length;
    json.results[0].lien = "javascript:alert(1)";
    const out = parseTco(json);
    expect(out).toHaveLength(n - 1);
    expect(out.every((e) => /^https?:\/\//.test(e.lien))).toBe(true);
  });

  it("golf and the LSAR: no link rather than another scheme", () => {
    const raw = JSON.parse(read("sport/ffgolf.json"));
    for (const d of raw.documents) Object.assign(d, { lienResultatsFleole: "javascript:alert(1)", lienDeparts: "data:text/html,x" });
    expect(parseGolf(raw).every((e) => e.lien === undefined)).toBe(true);
    const l = JSON.parse(read("sport/lsar.json"));
    expect(parseLsar(l.content.rendered, l.link).every((e) => /^https:\/\//.test(e.lien ?? "https://"))).toBe(true);
  });

  it("GDACS: a report link that is not http(s) gives GDACS's own", () => {
    const raw = JSON.parse(read("cyclones/liste_page1.json"));
    for (const f of raw.features) f.properties.url = { ...f.properties.url, report: "javascript:alert(1)" };
    const list = parseList(raw);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.rapport.startsWith("https://www.gdacs.org/report.aspx?"))).toBe(true);
  });

  it("Petite-Île's agenda, the job offers and the fuel prices: a link of the page in another scheme is not followed", () => {
    const html = read("agenda/petite-ile.html");
    const n = parsePetiteIle(html, new Date("2026-11-20T01:00:00Z")).length;
    const bad = parsePetiteIle(html.replaceAll('href="/actualites/agenda/', 'href="javascript:/actualites/agenda/'), new Date("2026-11-20T01:00:00Z"));
    expect(n).toBeGreaterThan(0);
    expect(bad).toEqual([]);
    const jobs = read("emploi/recherche.html");
    expect(parseRecherche(jobs).length).toBeGreaterThan(0);
    expect(parseRecherche(jobs.replaceAll('href="https://choisirleservicepublic.gouv.fr/offre-emploi/', 'href="javascript:/offre-emploi/'))).toEqual([]);
    const list = `<a href="/Actualites/Communiques-de-presse/Prix-des-carburants-en-octobre">x</a><a href="javascript:/Actualites/Communiques-de-presse/Prix-des-carburants-en-novembre">y</a>`;
    expect(releases(list)).toEqual(["https://www.reunion.gouv.fr/Actualites/Communiques-de-presse/Prix-des-carburants-en-octobre"]);
  });

  it("HelloAsso: an event without an http(s) page is no event", () => {
    const f = (url: string) => ({ formSlug: "f", title: "Kermesse", startDate: "2026-12-05T10:00:00+04:00", url }) as Parameters<typeof evenement>[0];
    expect(evenement(f("https://www.helloasso.com/associations/a/evenements/f"))?.lien).toBe("https://www.helloasso.com/associations/a/evenements/f");
    for (const b of BAD) expect(evenement(f(b)), b).toBeUndefined();
  });

  it("no reader resolves a link of a page but through httpUrl", () => {
    const dirs = ["src/providers", "src/connecteurs"];
    const found = dirs.flatMap((d) =>
      readdirSync(d)
        .filter((f) => f.endsWith(".ts"))
        .flatMap((f) => [...readFileSync(`${d}/${f}`, "utf8").matchAll(/new URL\(\s*([^`"'\s)][^,)]*),\s*[^)]+\)/g)].map((m) => `${d}/${f}: ${m[0]}`)),
    );
    expect(found).toEqual([]);
  });
});

describe("the list of stations of /meteo/en-chiffres (web/en-chiffres.ts)", () => {
  it("is built element by element in the browser, its values never read as HTML (23/11/2026)", () => {
    const src = readFileSync("src/web/en-chiffres.ts", "utf8");
    expect(src).not.toMatch(/mx-st"\)\.innerHTML/);
    expect(src).toContain("i.value=s.id");
    expect(src).toContain("sp.append(s.nom)");
  });
});
