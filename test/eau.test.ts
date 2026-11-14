import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { parsePage, quality, season } from "../src/providers/baignades.js";
import { networkName } from "../src/providers/eaupotable.js";
import { SOURCE } from "../src/eau/requin.js";
import { bathSentences, COMMON, noteBaignade, qualiteEau, sansPrelevement, siteNamed, sujetOf, tapNote } from "../src/tools/eau.js";
import { distributeur } from "../src/eau/distributeurs.js";
import { gather } from "../src/eau/ile.js";
import { eauPage } from "../src/web/domains.js";
import { coupuresCommunePage, reseauxCommune } from "../src/web/coupures.js";
import { PAGES } from "../src/web/places.js";
import { esc } from "../src/web/map.js";
import { a } from "../src/articles.js";
import { mapPoints, tabStops } from "./cartes.js";

// Hub'Eau for Saint-Pierre and the ministry's page of the plage de l'Hermitage centre, read on 24/10/2026: the latest
// analyses date from late August (tap) and mid-September (bathing).
const fixture = (f: string, enc: BufferEncoding = "utf8") => readFileSync(new URL(`./fixtures/eau/${f}`, import.meta.url), enc);
const NOW = new Date("2026-10-24T04:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());

describe("qualité de l'eau", () => {
  const asked: string[] = [];
  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const u = new URL(url);
      const p = u.searchParams;
      if (u.hostname === "baignades.sante.gouv.fr") {
        if (p.get("site") !== "974000709") return new Response("", { status: 404 });
        return new Response(fixture(`baignade_974000709_${p.get("annee")}.html`, "latin1"), { headers: { "content-type": "text/html; charset=ISO-8859-1" } });
      }
      if (p.get("code_commune") !== "97416") return new Response(JSON.stringify({ count: 0, data: [] }));
      const file = u.pathname.endsWith("communes_udi") ? "udi_97416.json"
        : p.get("code_parametre") === "1449" ? "ecoli_97416.json"
        : p.has("conformite_limites_bact_prelevement") ? "nc_bact_97416.json" : "nc_pc_97416.json";
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads a season of bathing samples, five to a table", () => {
    const p = parsePage(fixture("baignade_974000709_2026.html", "latin1"));
    expect(p.classement).toEqual({ saison: 2026, texte: "site non classé" });
    expect(p.samples).toHaveLength(34);
    expect(p.samples.find((s) => s.date === "2026-01-20")).toEqual({ date: "2026-01-20", enterocoques: "4000", e_coli: "2500", qualite: "mauvaise" });
    expect(p.samples.at(-1)).toMatchObject({ date: "2026-09-15", enterocoques: "15", e_coli: "<15", qualite: "bonne" });
  });

  it("grades a sample by the ministry's thresholds, and names the season by the year it ends", () => {
    expect(quality("<15", "30")).toBe("bonne");
    expect(quality("290", "130")).toBe("moyenne");
    expect(quality("15", "1200")).toBe("mauvaise");
    expect(season(NOW)).toBe(2027);
    expect(season(new Date("2026-09-30T12:00:00Z"))).toBe(2026);
  });

  it("answers for a beach with its latest samples, both seasons read", async () => {
    const b = body(await qualiteEau(cache(), "plage de l'Hermitage", undefined, NOW));
    expect(b.eau_du_robinet).toBeUndefined();
    expect(b.baignade.sites[0]).toMatchObject({ site: "Plage de l'Hermitage centre", dernier_prelevement: "15/09/2026", qualite_dernier_prelevement: "bonne" });
    expect(b.baignade.sites[0].derniers_prelevements[1]).toEqual({ date: "08/09/2026", qualite: "moyenne", enterocoques_100ml: "290", e_coli_100ml: "130" });
    expect(b.risque_requin.regle).toMatch(/^À La Réunion, la baignade et les activités de vague .* Arrêté préfectoral n° 180 du 13\/02\/2026/);
    expect(b.risque_requin.zones).toContain("Lagon de l'Hermitage : lagon, baignade permise dans les conditions fixées par la commune (arrêté préfectoral n° 180, art. 2).");
    expect(b.sources.map((s: { source: string }) => s.source)).toContain(SOURCE.nom);
    expect(asked.filter((u) => u.includes("baignades")).map((u) => new URL(u).searchParams.get("annee"))).toEqual(["2027", "2026"]);
  });

  it("finds the network of the quartier asked, and what went off the limits", async () => {
    const b = body(await qualiteEau(cache(), "Ravine des Cabris", undefined, NOW));
    expect(b.resume).toBe("Eau du robinet, réseau Usine Dassy Conde à La Ravine des Cabris : dernière analyse le 24/08/2026 : NON CONFORME\u00a0; 6 analyses non conformes sur 16 en 6 mois.");
    expect(b.eau_du_robinet.reseau.non_conformites[0]).toEqual({
      date: "24/08/2026",
      prelevements: 3,
      depassements: ["Entérocoques : 4 pour 100 mL (limite ≤ 0 pour 100 mL)", "Entérocoques : 9 pour 100 mL (limite ≤ 0 pour 100 mL)", "Entérocoques : 2 pour 100 mL (limite ≤ 0 pour 100 mL)"],
    });
    // Asked about neither, and no bathing site within 5 km: no bathing part.
    expect(b.baignade).toBeUndefined();
  });

  it("lists a commune's networks, those with a problem first", async () => {
    const b = body(await qualiteEau(cache(), "eau du robinet à Saint-Pierre", undefined, NOW));
    expect(b.eau_du_robinet.reseaux).toHaveLength(13);
    expect(b.eau_du_robinet.reseaux[0]).toMatchObject({ reseau: "Usine Dassy Conde", non_conformes_6_mois: 6 });
    expect(b.resume).toMatch(/^Eau du robinet à Saint-Pierre : 13 réseaux, 75 analyses en 6 mois\u00a0; non-conformités sur Usine Dassy Conde \(6\)\./);
  });

  it("names, under the tap water, every commune whose notices are read, from the table of distributors", () => {
    for (const c of ["Saint-Denis", "Saint-Pierre", "Saint-Paul", "Sainte-Marie", "Salazie"]) expect(COMMON.eau_du_robinet).toContain(c);
    expect(distributeur("Le Tampon")?.avis).toBe(false);
    expect(COMMON.eau_du_robinet).not.toContain("Le Tampon");
    expect(COMMON.eau_du_robinet).not.toContain("les communes de l'Est");
    expect(COMMON.eau_du_robinet).toContain("Sainte-Suzanne et Salazie)\u00a0: dans cette réponse quand une commune est demandée, et par l'outil coupures_eau.");
    expect(tapNote("page")).toContain("Il est repris sur la page des coupures d'eau pour les communes dont nous lisons les avis (Bras-Panon,");
    expect(tapNote("page")).not.toContain("coupures_eau");
  });

  it("says, beside a beach's last sample, that none was published for weeks, and drops « toutes les deux semaines »", async () => {
    const b = body(await qualiteEau(cache(), "plage de l'Hermitage", undefined, NOW));
    const gap = "Aucun prélèvement publié par l'ARS depuis le 15/09/2026 (5 semaines), ni aucun pour la saison commencée le 01/10/2026.";
    expect(b.baignade.sites[0].prelevements_en_retard).toBe(gap);
    expect(b.resume).toMatch(/^Plage de l'Hermitage centre : eau de bonne qualité au dernier prélèvement \(15\/09\/2026\)/);
    expect(b.resume.endsWith(`. ${gap}`)).toBe(true);
    // Two beaches without a sample for the same weeks: said once, after both (06/11/2026, L'Hermitage).
    const [row] = b.baignade.sites;
    const two = bathSentences([row, { ...row, site: "Plage de l'Hermitage nord" }]);
    expect(two.split("Aucun prélèvement").length + two.split("aucun prélèvement").length).toBe(3);
    expect(two.endsWith(` Pour les deux sites\u00a0: aucun prélèvement publié par l'ARS depuis le 15/09/2026 (5 semaines), ni aucun pour la saison commencée le 01/10/2026.`)).toBe(true);
    expect(two).toMatch(/^Plage de l'Hermitage centre : [^:]+\. Plage de l'Hermitage nord : /);
    // Gaps of their own: each beside its beach.
    const other = bathSentences([row, { ...row, site: "Plage de l'Hermitage nord", prelevements_en_retard: undefined }]);
    expect(other).toBe(`${bathSentences([row])} ${bathSentences([{ ...row, site: "Plage de l'Hermitage nord", prelevements_en_retard: undefined }])}`);
    expect(b.a_savoir.eau_de_baignade).toBe(noteBaignade(true));
    expect(noteBaignade(true)).toMatch(/^Seuils par prélèvement \(germes pour 100 mL\)/);
    expect(noteBaignade(true)).not.toContain("deux semaines");
    expect(noteBaignade(false)).toBe(COMMON.eau_de_baignade);
    expect(COMMON.eau_de_baignade).toMatch(/^Prélèvement toutes les deux semaines environ\u00a0; seuils par prélèvement/);
    // Under four weeks, nothing is said; a gap within the season does not speak of the season.
    expect(sansPrelevement("2026-09-30", NOW)).toBeUndefined();
    expect(sansPrelevement("2026-10-02", new Date("2026-11-05T04:00:00Z"))).toBe("Aucun prélèvement publié par l'ARS depuis le 02/10/2026 (4 semaines).");
    expect(sansPrelevement(undefined, NOW)).toBeUndefined();
  });

  it("keeps each network of a commune with its districts and its last sample, the ARS's conclusion quoted on its page", async () => {
    const ile = await gather(cache(), NOW);
    const c = ile.communes.find((x) => x.reseaux_detail?.some((r) => r.quartiers.length && r.conclusion))!;
    expect(c).toBeDefined();
    expect(c.reseaux_detail).toHaveLength(c.reseaux);
    const r = c.reseaux_detail!.find((x) => x.quartiers.length && x.conclusion)!;
    expect(r.derniere_analyse).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const html = reseauxCommune(c.commune, c);
    const at = a(c.commune);
    expect(html).toContain(`<p>${esc(at.charAt(0).toUpperCase() + at.slice(1))}, l'eau du robinet passe par ${c.reseaux} réseau`);
    expect(html).toContain(`Réseau ${esc(r.reseau)}<small>${esc(r.quartiers.join("\u00a0; "))}</small>`);
    expect(html).toContain(`Dernier prélèvement le ${r.derniere_analyse!.split("-").reverse().join("/")}. Conclusion de l'ARS\u00a0: «\u00a0${esc(r.conclusion!.trim())}\u00a0»`);
    // A name with its article: « au Tampon », never « Le Tampon est desservie »; « géré » agrees with one network.
    const one = { ...c, reseaux_detail: c.reseaux_detail!.slice(0, 1) };
    expect(reseauxCommune("Le Tampon", one)).toContain("<p>Au Tampon, l'eau du robinet passe par 1 réseau de distribution");
    expect(reseauxCommune("Les Avirons", one)).toContain("<p>Aux Avirons, l'eau du robinet passe par 1 réseau");
    expect(reseauxCommune("Saint-Paul", one)).toContain("<p>À Saint-Paul, l'eau du robinet passe par 1 réseau");
    expect(reseauxCommune("Le Tampon", one)).not.toMatch(/gérés par|est desservie/);
    // Never said by us: only the ARS's conclusion, in quotes.
    expect(html.replace(/«[^»]*»/g, "")).not.toMatch(/potable|conforme/i);
    // On the commune's page, above « who distributes the water »; a copy gathered before has no list, the page as before.
    const p = PAGES.find((x) => x.commune && x.nom === c.commune)!;
    const eau = { value: { ...ile, a_savoir: COMMON, sources: [] }, fetchedAt: NOW, stale: false };
    const page = coupuresCommunePage("https://rundata.re", p, { coupures: null, eau }, NOW);
    expect(page.indexOf(`Réseau ${esc(r.reseau)}<small>`)).toBeGreaterThan(0);
    expect(page.indexOf(`Réseau ${esc(r.reseau)}<small>`)).toBeLessThan(page.indexOf('id="h-qui"'));
    const old = { ...eau, value: { ...eau.value, communes: eau.value.communes.map(({ reseaux_detail: _, ...x }) => x) } };
    expect(coupuresCommunePage("https://rundata.re", p, { coupures: null, eau: old }, NOW)).not.toMatch(/l'eau du robinet passe par \d+ réseau/);
  });

  it("says on /eau, under the count, that no sample was published for weeks, and gives the note without « toutes les deux semaines »", async () => {
    const ile = await gather(cache(), NOW);
    const data = { value: { ...ile, a_savoir: COMMON, sources: [] }, fetchedAt: NOW, stale: false };
    const late = eauPage("https://rundata.re", data, NOW);
    // Each beach and pool is a row below: its point on the map out of the Tab order.
    expect(mapPoints(late)).toBeGreaterThan(0);
    expect(tabStops(late)).toBe(0);
    const gap = sansPrelevement("2026-09-15", NOW)!;
    expect(late).toContain(`<p class="note">${esc(gap)}</p>`);
    expect(late.indexOf(esc(gap))).toBeGreaterThan(late.indexOf('<div class="now">'));
    expect(late).toContain(`<p class="note">${esc(noteBaignade(true))}</p>`);
    expect(late).not.toContain("toutes les deux semaines");
    // The connector asked a question, without the tool's name (marketing, 06/11/2026).
    expect(late).toContain(`<p>Demandez aussi à votre IA, avec le <a href="/mcp">connecteur rundata.re</a>\u00a0: «\u00a0L'eau du robinet est-elle bonne à Saint-Denis\u00a0?\u00a0»</p>`);
    expect(late).not.toContain("<code>qualite_eau</code>");
    // Two weeks after the last sample: neither the sentence nor another note.
    const soon = eauPage("https://rundata.re", data, new Date("2026-09-29T04:00:00Z"));
    expect(soon).not.toContain("Aucun prélèvement publié");
    expect(soon).toContain(`<p class="note">${esc(COMMON.eau_de_baignade)}</p>`);
  });

  it("dates a commune's tap water by its newest analysis, of any network", async () => {
    const b = body(await qualiteEau(cache(), "eau du robinet à Saint-Pierre", undefined, NOW));
    const dates = b.eau_du_robinet.reseaux.map((r: { derniere_analyse?: string }) => r.derniere_analyse).filter(Boolean)
      .map((d: string) => d.split("/").reverse().join("-")).sort();
    expect(b.eau_du_robinet.derniere_analyse).toBe(dates.at(-1).split("-").reverse().join("/"));
    expect(b.eau_du_robinet.derniere_analyse).not.toBe(b.eau_du_robinet.reseaux[0].derniere_analyse);
  });

  it("gives a distributor's « ne pas boire » notice when the ARS analyses do not answer", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    const c = cache();
    const avis = {
      distributeur: "CIREST", titre: "Qualité de l'eau : ne pas consommer l'eau du robinet", communes: ["Saint-Benoît"], publie: "2026-10-23T06:47:00.000Z",
      secteurs: [], secteurs_complets: false, ne_pas_boire: true, texte: "Qualité de l'eau dégradée : ne pas boire l'eau du robinet dans les secteurs de l'avis.",
    };
    await c.island("avis-eau:flux", 3600, async () => [{ de: "de la CIREST", site: "https://www.cirest.fr", avis: [avis] }]);
    const b = body(await qualiteEau(c, "eau du robinet à Saint-Benoît", "robinet", NOW));
    expect(b.resume).toMatch(/^EAU À NE PAS BOIRE à Saint-Benoît d'après l'avis du distributeur du .* : « Qualité de l'eau : ne pas consommer l'eau du robinet ». Les analyses du contrôle sanitaire de l'ARS \(Hub'Eau\) ne répondent pas pour le moment\.$/);
    expect(b.eau_du_robinet.avis_ne_pas_boire.titre).toBe(avis.titre);
    expect(b.indisponible).toEqual(["eau du robinet"]);
    expect(b.erreur).toBeUndefined();
    // Without a notice, the error stays the answer.
    const none = await qualiteEau(cache(), "eau du robinet à Saint-Benoît", "robinet", NOW);
    expect(body(none).erreur).toBe("Les données de qualité de l'eau ne répondent pas pour le moment.");
  });

  it("tells which water a question is about", () => {
    expect(sujetOf("l'eau est potable à Cilaos ?", null)).toEqual(["robinet"]);
    expect(sujetOf("on peut se baigner à Boucan ?", null)).toEqual(["baignade"]);
    expect(sujetOf("Saint-Leu", null)).toEqual(["robinet", "baignade"]);
    expect(siteNamed("bassin Bleu")?.commune).toBe("Saint-Benoît");
    // A name of common words only: found by them, not left for two other beaches of the commune.
    expect(siteNamed("plage du centre-ville de Saint-Pierre")?.nom).toBe("Plage du centre-ville de Saint-Pierre");
    expect(siteNamed("Saint-Pierre")).toBeNull();
    expect(networkName("RESEAU ILET A CORDES")).toBe("Ilet à Cordes");
    expect(networkName("RESEAU MARE A POULE D'EAU")).toBe("Mare à Poule D'Eau");
  });
});
