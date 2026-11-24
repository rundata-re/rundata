import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { parsePage, quality, season, SITES } from "../src/providers/baignades.js";
import { networkName } from "../src/providers/eaupotable.js";
import { SOURCE } from "../src/eau/requin.js";
import { CONSIGNE } from "../src/eau/cyclone.js";
import { bathSentences, COMMON, noteBaignade, qualiteEau, sansPrelevement, siteNamed, sujetOf, tapNote, tapSentence } from "../src/tools/eau.js";
import { distributeur } from "../src/eau/distributeurs.js";
import { configure, gather } from "../src/eau/ile.js";
import { withLectures } from "../src/lectures.js";
import { fraicheur } from "../src/tools/fraicheur.js";
import { eauPage } from "../src/web/domains.js";
import { coupuresCommunePage, eauFaq, reseauxCommune, secheresseLigne } from "../src/web/coupures.js";
import { PAGES } from "../src/web/places.js";
import { esc } from "../src/web/map.js";
import { a } from "../src/articles.js";
import { citerOf } from "../src/tools/citer.js";
import { buildEau } from "../src/web/data.js";
import { SOURCE as NOTICES } from "../src/providers/avis-eau.js";
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
    const b = body(await qualiteEau(cache(), "Condé", undefined, NOW));
    expect(b.resume).toBe("Eau du robinet, réseau Usine Dassy Conde à Condé : dernière analyse le 24/08/2026 : NON CONFORME, conclusion de l'ARS : « Eau d'alimentation non-conforme aux exigences de qualité »\u00a0; 6 analyses non conformes sur 16 en 6 mois.");
    expect(b.eau_du_robinet.reseau.non_conformites[0]).toEqual({
      date: "24/08/2026",
      prelevements: 3,
      depassements: ["Entérocoques : 4 pour 100 mL (limite ≤ 0 pour 100 mL)", "Entérocoques : 9 pour 100 mL (limite ≤ 0 pour 100 mL)", "Entérocoques : 2 pour 100 mL (limite ≤ 0 pour 100 mL)"],
    });
    // Asked about neither, and no bathing site within 5 km: no bathing part.
    expect(b.baignade).toBeUndefined();
  });

  it("quotes the ARS's conclusion, never « conforme » alone where the references of quality are not met", async () => {
    const b = body(await qualiteEau(cache(), "eau du robinet à Saint-Pierre", undefined, NOW));
    type Row = { reseau: string; quartiers?: string; derniere_analyse_dans_les_limites?: boolean; conclusion_ars?: string };
    const r = (b.eau_du_robinet.reseaux as Row[]).find((x) => x.derniere_analyse_dans_les_limites && /non conforme aux r/i.test(x.conclusion_ars ?? "") && x.quartiers)!;
    expect(r.conclusion_ars).toMatch(/conforme aux limites de qualité et non conforme aux références de qualité/);
    expect(b.eau_du_robinet.reseaux[0]).not.toHaveProperty("derniere_analyse_conforme");
    // The sentence for that network, asked by its quartier.
    const said = tapSentence(r as Parameters<typeof tapSentence>[0], "à Saint-Pierre");
    expect(said).toContain(`, conclusion de l'ARS : « ${r.conclusion_ars!.replace(/\.$/, "")} »`);
    expect(said.replace(/«[^»]*»/g, "")).not.toMatch(/: conforme/);
    // No conclusion published: the values said within the limits, never « conforme », and the missing conclusion said.
    const bare = tapSentence({ ...(r as Parameters<typeof tapSentence>[0]), conclusion_ars: undefined }, "à Saint-Pierre");
    expect(bare).toContain("\u00a0: valeurs dans les limites de qualité\u00a0; l'ARS n'a pas publié de conclusion pour ce prélèvement");
    expect(bare).not.toMatch(/conforme/);
  });

  it("gives the prefecture's instruction on tap water after a cyclone, in the season only, as the page quotes it", async () => {
    expect(body(await qualiteEau(cache(), "Condé", "robinet", NOW)).a_savoir).not.toHaveProperty("apres_un_cyclone");
    const november = body(await qualiteEau(cache(), "Condé", "robinet", new Date("2026-11-02T04:00:00Z")));
    expect(november.a_savoir.apres_un_cyclone).toEqual({
      consigne: `« ${CONSIGNE} »`,
      d_apres: "Dispositif ORSEC Cyclones de la préfecture (arrêté 2026-182), consignes de la phase de sauvegarde, p. 18",
      lien: expect.stringMatching(/^https:\/\/www\.reunion\.gouv\.fr\/.*\.pdf#page=18$/),
    });
    expect(november.a_savoir.apres_un_cyclone.consigne).toContain("faire bouillir pendant 3 minutes");
    // Bathing alone: nothing on tap water.
    expect(body(await qualiteEau(cache(), "plage de l'Hermitage", "baignade", new Date("2026-11-02T04:00:00Z"))).a_savoir).not.toHaveProperty("apres_un_cyclone");
  });

  it("gives all the bathing sites of a commune asked, as /eau does; the two nearest for a place", async () => {
    // Every site answers with the recorded season of the Hermitage: what is counted here is the sites.
    vi.stubGlobal("fetch", async (url: string) =>
      new Response(fixture(`baignade_974000709_${new URL(url).searchParams.get("annee")}.html`, "latin1"), { headers: { "content-type": "text/html; charset=ISO-8859-1" } }));
    const commune = body(await qualiteEau(cache(), "Saint-Pierre", "baignade", NOW));
    const onPage = SITES.filter((s) => s.commune === "Saint-Pierre").map((s) => s.nom);
    expect(onPage).toHaveLength(5);
    expect(commune.baignade.sites.map((r: { site: string }) => r.site).sort()).toEqual([...onPage].sort());
    // Saint-Paul's nine, the latest samples of the two nearest only: about 10 KB with the shark rule (2,5 KB).
    const paul = await qualiteEau(cache(), "Saint-Paul", "baignade", NOW);
    expect(body(paul).baignade.sites).toHaveLength(9);
    expect(paul.content[0].text.length).toBeLessThan(11_000);
    expect(body(paul).baignade.sites.filter((r: object) => "derniers_prelevements" in r)).toHaveLength(2);
    expect(body(await qualiteEau(cache(), "Terre-Sainte", "baignade", NOW)).baignade.sites.length).toBeLessThanOrEqual(2);
    // A place with more than one site within 5 km gets two: Grand Fond, between Boucan Canot and Les Roches Noires.
    expect(body(await qualiteEau(cache(), "Grand Fond", "baignade", NOW)).baignade.sites.map((r: { site: string }) => r.site)).toEqual(["Plage de Boucan Canot", "Plage des Roches Noires"]);
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
    expect(tapNote("page")).toContain("Il est repris sur la page des coupures d'eau pour les communes dont rundata.re lit les avis (Bras-Panon,");
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

  it("puts the portrait of the commune's water at the top: its networks, its drought level from the order, two questions", async () => {
    const ile = await gather(cache(), NOW);
    const c = ile.communes.find((x) => x.reseaux_detail?.some((r) => r.conclusion) && distributeur(x.commune) && !distributeur(x.commune)!.partage)!;
    const p = PAGES.find((x) => x.commune && x.nom === c.commune)!;
    const eau = { value: { ...ile, a_savoir: COMMON, sources: [] }, fetchedAt: NOW, stale: false };
    const arrete = { numero: "n°2026-2094/SG/SCOPP/BCPE", signe_le: "12/11/2026", en_vigueur_depuis: "12/11/2026", publie: "recueil", lien: "https://www.reunion.gouv.fr/", remplace: "l'arrêté précédent" };
    const restrictions = [{ usage: "Arrosage des jardins", restriction: "Interdit de 9 h à 19 h" }];
    const sec = (withOrder: boolean) => ({
      value: {
        resume: "", echelle: "", a_savoir: "", sources: [], communes: [{ commune: c.commune, eau_du_robinet: "alerte" }],
        ...(withOrder ? { arrete } : {}), interdits: [{ niveau: "alerte", communes: [c.commune], restrictions }],
      },
      fetchedAt: NOW, stale: false,
    });
    const page = coupuresCommunePage("https://rundata.re", p, { coupures: null, eau, secheresse: sec(true) }, NOW);
    // At the top of <main>, before the notices.
    const main = page.indexOf("<main");
    expect(page.indexOf('id="h-robinet"')).toBeGreaterThan(main);
    expect(page.indexOf('id="h-robinet"')).toBeLessThan(page.indexOf('id="h-coupures-eau"'));
    // With a notice in progress or to come, the notices first, as the page says (« ils s'affichent en haut de cette page »;
    // revue ux du 24/11 at 390 px: two notices of Saint-Paul 3 664 px down, under 13 networks). A notice La Créole dates
    // by the day of the cut says that day as the cut's, never « avis daté du » (item 1831).
    const notice = {
      titre: "INTERRUPTION DE LA DISTRIBUTION", communes: [c.commune], distributeur: "La Créole", date_de_l_avis: "25/11/2026",
      coupure: { de: "mercredi 25/11 à 08:00", a: "mercredi 25/11 à 15:00", etat: "à venir" }, secteurs: [], secteurs_complets: false,
      texte: "La distribution de l'eau potable sera interrompue le mercredi 25 novembre 2026, de 8h à 15h, sur la rue des Salins.", lien: "https://lacreole.re/flash-infos",
    };
    const coupures = { value: { avis: [notice], sources: [] }, fetchedAt: NOW } as never;
    const cut = coupuresCommunePage("https://rundata.re", p, { coupures, eau, secheresse: sec(true) }, NOW);
    expect(cut.indexOf('id="h-coupures-eau"')).toBeGreaterThan(cut.indexOf("<main"));
    expect(cut.indexOf('id="h-coupures-eau"')).toBeLessThan(cut.indexOf('id="h-robinet"'));
    expect(cut).not.toContain("avis daté du");
    expect(cut).toMatch(/La.Créole, coupure du 25\/11\/2026<\/span>/);
    expect(page).toContain(`<h2 id="h-robinet">L'eau du robinet ${esc(a(c.commune))}</h2>`);
    // The drought level from the order, with its number and its day; what is forbidden on /secheresse only.
    expect(page).toContain(`<p>Sécheresse\u00a0: alerte depuis l'arrêté n°2026-2094/SG/SCOPP/BCPE du 12/11/2026. Ce qui est interdit\u00a0: <a href="/secheresse">page Sécheresse</a>.</p>`);
    expect(page).not.toContain("Arrosage des jardins");
    expect(page).not.toContain("Pas d'interdiction");
    // Without the order (VigiEau alone), no drought line; the level stays in the card.
    expect(secheresseLigne({ commune: c.commune, eau_du_robinet: "alerte" }, undefined)).toBe("");
    expect(secheresseLigne({ commune: c.commune }, arrete)).toBe("");
    expect(coupuresCommunePage("https://rundata.re", p, { coupures: null, eau, secheresse: sec(false) }, NOW)).not.toContain("depuis l'arrêté");
    // The two questions, said in the FAQPage too; no number nor address of the distributor.
    const faq = eauFaq(c.commune, c);
    expect(faq.map((f) => f.q)).toEqual([`Qui distribue l'eau ${a(c.commune)}\u00a0?`, expect.stringMatching(/^Quand l'eau .+ a-t-elle été analysée pour la dernière fois\u00a0\?$/)]);
    expect(faq[0].a).toMatch(/, d'après l'ARS\.$/);
    const last = [...c.reseaux_detail!].filter((r) => r.derniere_analyse).sort((x, y) => y.derniere_analyse!.localeCompare(x.derniere_analyse!))[0];
    expect(faq[1].a).toMatch(new RegExp(`^Le ${last.derniere_analyse!.split("-").reverse().join("/")}, sur le réseau `));
    expect(faq[1].a).toMatch(/ Les résultats complets sont sur le site du ministère de la Santé\.$/);
    expect(faq.map((f) => f.a).join(" ").replace(/«[^»]*»/g, "")).not.toMatch(/potable|conforme|\d{2} ?\d{2} ?\d{2} ?\d{2} ?\d{2}|@/i);
    expect(page).toContain('<h2 id="h-faq">Questions fréquentes</h2>');
    expect(page).toContain('"@type":"FAQPage"');
    // Hub'Eau down, no copy: the drought line alone, no question on the samples; nothing at all, a link only.
    const sans = coupuresCommunePage("https://rundata.re", p, { coupures: null, eau: null, secheresse: sec(true) }, NOW);
    expect(sans).toContain("depuis l'arrêté n°2026-2094");
    expect(sans).not.toMatch(/l'eau du robinet passe par|a-t-elle été analysée/);
    const rien = coupuresCommunePage("https://rundata.re", p, { coupures: null, eau: null, secheresse: null }, NOW);
    expect(rien).not.toContain('id="h-robinet"');
    expect(rien).toContain('<a href="/eau">La qualité de l\'eau du robinet, commune par commune →</a>');
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

  it("gives the time the copy's bathing sites were read, when they were kept from an earlier copy (23/11/2026)", async () => {
    const live = body(await qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW));
    const [row] = live.baignade.sites;
    const site = SITES.find((s) => s.nom === row.site)!;
    const { prelevements_en_retard: _gap, ...kept } = row;
    // Written at 08:20, the tap water read then, the bathing sites kept from the copy of 07:12 (the ARS silent at 08:20).
    configure(async () => ({ lu: "2026-10-24T04:20:00.000Z", baignades_lu: "2026-10-24T03:12:00.000Z", baignades: [{ ...kept, lon: site.lon, lat: site.lat }], communes: [] }));
    try {
      vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
      const { value, lectures } = await withLectures(() => qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW));
      const b = body(value);
      expect(b.baignade.copie).toBe("Le site de l'ARS ne répond pas\u00a0: résultats de la dernière lecture de rundata.re, le 24/10/2026 à 07:12 (heure de La Réunion).");
      expect(fraicheur(b, lectures, NOW).lue_a).toBe("24/10 07:12");
    } finally {
      configure(undefined);
    }
  });

  it("says each source silent since its last read, past 7 days, as /eau, instead of the copy's old results (23/11/2026)", async () => {
    const live = body(await qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW));
    const [row] = live.baignade.sites;
    const site = SITES.find((s) => s.nom === row.site)!;
    // Both halves last read on 16/10 at 07:12, heure de La Réunion: 8 days before NOW.
    configure(async () => ({ lu: "2026-10-24T03:12:00.000Z", baignades_lu: "2026-10-16T03:12:00.000Z", communes_lu: "2026-10-16T03:12:00.000Z", baignades: [{ ...row, lon: site.lon, lat: site.lat }], communes: [] }));
    try {
      vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
      const bath = body(await qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW));
      expect(bath.baignade).toEqual({ resume: "Le site de l'ARS ne répond plus depuis le 16/10\u00a0: voir les résultats des plages et bassins sur le site de l'ARS, ou l'affichage sur place.", ne_repond_plus: true });
      expect(bath.resume).toBe(bath.baignade.resume);
      expect(bath.indisponible).toEqual(["eau de baignade"]);
      const tap = body(await qualiteEau(cache(), "Saint-Pierre", "robinet", NOW));
      expect(tap.eau_du_robinet).toEqual({ resume: "Hub'Eau ne répond plus depuis le 16/10\u00a0: voir le site de l'ARS.", ne_repond_plus: true });
      expect(tap.erreur).toBeUndefined();
    } finally {
      configure(undefined);
    }
  });

  it("gives the island's copy of a bathing site, with its time, when the ARS's site does not answer", async () => {
    const live = body(await qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW));
    const [row] = live.baignade.sites;
    const site = SITES.find((s) => s.nom === row.site)!;
    const { prelevements_en_retard: _gap, ...kept } = row;
    configure(async () => ({ lu: "2026-10-24T03:12:00.000Z", baignades: [{ ...kept, lon: site.lon, lat: site.lat }], communes: [] }));
    try {
      vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
      const { value, lectures } = await withLectures(() => qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW));
      const b = body(value);
      const note = "Le site de l'ARS ne répond pas\u00a0: résultats de la dernière lecture de rundata.re, le 24/10/2026 à 07:12 (heure de La Réunion).";
      expect(b.baignade.sites).toEqual([row]);
      expect(b.baignade.copie).toBe(note);
      expect(b.resume).toBe(`${live.resume} ${note}`);
      expect(b.erreur).toBeUndefined();
      // The answer is as fresh as the copy: its time, not the time of the call.
      expect(fraicheur(b, lectures, NOW).lue_a).toBe("24/10 07:12");
      // A commune asked: its sites in the copy, the others' failure is the answer's.
      expect(body(await qualiteEau(cache(), "Saint-Pierre", "baignade", NOW)).erreur).toBe("Les données de qualité de l'eau ne répondent pas pour le moment.");
      // Without a copy stored, the error stays the answer.
      configure(undefined);
      expect(body(await qualiteEau(cache(), "plage de l'Hermitage", "baignade", NOW)).erreur).toBe("Les données de qualité de l'eau ne répondent pas pour le moment.");
    } finally {
      configure(undefined);
    }
  });

  it("names the sites taken from the island's copy when the others were read live", async () => {
    // Every site of Saint-Pierre read from the one page of the fixtures.
    const served = globalThis.fetch;
    const same = (url: string) => url.replace(/site=\d+/, "site=974000709");
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => served(same(url), init));
    const live = body(await qualiteEau(cache(), "Saint-Pierre", "baignade", NOW));
    const [first, ...others] = live.baignade.sites;
    expect(others.length).toBeGreaterThan(0);
    const site = SITES.find((s) => s.nom === first.site && s.commune === "Saint-Pierre")!;
    const { prelevements_en_retard: _gap, ...kept } = first;
    configure(async () => ({ lu: "2026-10-24T03:12:00.000Z", baignades: [{ ...kept, lon: site.lon, lat: site.lat }], communes: [] }));
    try {
      // The ARS's site answers for every site but this one.
      vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        if (url.includes(`site=${site.id}&`)) throw new TypeError("fetch failed");
        return served(same(url), init);
      });
      const { value, lectures } = await withLectures(() => qualiteEau(cache(), "Saint-Pierre", "baignade", NOW));
      const b = body(value);
      expect(b.baignade.sites.slice(1)).toEqual(others);
      expect(b.baignade.copie).toBe(`Le site de l'ARS ne répond pas pour ${first.site}\u00a0: résultats de la dernière lecture de rundata.re, le 24/10/2026 à 07:12 (heure de La Réunion).`);
      expect(b.resume.endsWith(` ${b.baignade.copie}`)).toBe(true);
      // The oldest of what is served dates the answer: the copy's time.
      expect(fraicheur(b, lectures, NOW).lue_a).toBe("24/10 07:12");
    } finally {
      configure(undefined);
    }
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
    // In coupures_eau's words: the distributor and the sectors, never the whole commune's nor the ARS's (23/11/2026).
    expect(b.resume).toBe("Eau à ne pas boire à Saint-Benoît d'après CIREST (avis du 23/10 à 10:47)\u00a0: « Qualité de l'eau : ne pas consommer l'eau du robinet », secteurs dans l'avis. Les analyses du contrôle sanitaire de l'ARS (Hub'Eau) ne répondent pas pour le moment.");
    expect(b.sources.map((x: { source: string }) => x.source)).toContain(NOTICES.nom);
    expect(citerOf("qualite_eau", b)).toBe("rundata.re, d'après l'avis de CIREST et l'ARS La Réunion");
    expect(b.eau_du_robinet.avis_ne_pas_boire.titre).toBe(avis.titre);
    expect(b.indisponible).toEqual(["eau du robinet"]);
    expect(b.erreur).toBeUndefined();
    // Without a notice, the error stays the answer.
    const none = await qualiteEau(cache(), "eau du robinet à Saint-Benoît", "robinet", NOW);
    expect(body(none).erreur).toBe("Les données de qualité de l'eau ne répondent pas pour le moment.");
  });

  it("says a notice's sectors and its distributor, and credits its source, with the analyses read (23/11/2026, Saint-Denis)", async () => {
    const c = cache();
    const avis = {
      distributeur: "Dionéo", titre: "Qualité de l'eau", communes: ["Saint-Denis"], publie: "2026-10-23T06:53:00.000Z",
      secteurs: ["TRAITEMENT ST FRANCOIS"], secteurs_complets: true, ne_pas_boire: true, texte: "Ne pas consommer l'eau du robinet dans le secteur de l'avis.",
    };
    await c.island("avis-eau:flux", 3600, async () => [{ de: "de Dionéo", site: "https://www.dioneo.re", avis: [avis] }]);
    const b = body(await qualiteEau(c, "eau du robinet à Saint-Denis", "robinet", NOW));
    expect(b.resume.startsWith("Eau à ne pas boire à Saint-Denis d'après Dionéo (avis du 23/10 à 10:53)\u00a0: « Qualité de l'eau », secteurs\u00a0: TRAITEMENT ST FRANCOIS. Eau du robinet à Saint-Denis : ")).toBe(true);
    expect(b.resume).not.toMatch(/EAU À NE PAS BOIRE|distributeur du/);
    expect(b.eau_du_robinet.avis_ne_pas_boire.secteurs_dits).toBe("TRAITEMENT ST FRANCOIS");
    expect(b.sources.map((x: { source: string }) => x.source)).toEqual(expect.arrayContaining([NOTICES.nom]));
    expect(citerOf("qualite_eau", b)).toBe("rundata.re, d'après l'avis de Dionéo et l'ARS La Réunion");
    // No notice: the ARS alone, as before.
    const plain = body(await qualiteEau(cache(), "eau du robinet à Saint-Denis", "robinet", NOW));
    expect(plain.sources.map((x: { source: string }) => x.source)).not.toContain(NOTICES.nom);
    expect(citerOf("qualite_eau", plain)).toBe("rundata.re, d'après l'ARS La Réunion");
  });

  it("gives the island's copy of a commune's tap water, with its time and the words of /eau, when Hub'Eau does not answer (23/11/2026)", async () => {
    const watched = {
      reseau: "TERRE SAINTE", quartiers: "Terre Sainte", derniere_analyse: "20/10/2026", derniere_analyse_dans_les_limites: false,
      conclusion_ars: "Eau non conforme aux limites de qualité", analyses_6_mois: 6, non_conformes_6_mois: 1,
    };
    const commune = {
      commune: "Saint-Pierre", reseaux: 2, analyses_6_mois: 14, non_conformes_6_mois: 1, derniere_analyse: "2026-10-21", a_surveiller: [watched],
      reseaux_detail: [
        { reseau: "TERRE SAINTE", quartiers: ["Terre Sainte"], derniere_analyse: "2026-10-20", conclusion: "Eau non conforme aux limites de qualité" },
        { reseau: "BOIS D'OLIVES", quartiers: ["Bois d'Olives"], derniere_analyse: "2026-10-21", conclusion: "Eau d'alimentation conforme aux exigences de qualité." },
      ],
    };
    // The tap water last read on 22/10 at 04:20 (heure de La Réunion), 2 days before NOW.
    const copy = { lu: "2026-10-24T00:20:00.000Z", communes_lu: "2026-10-22T00:20:00.000Z", baignades: [], communes: [commune] };
    const note = "Hub'Eau, le service national qui publie les analyses de l'ARS, n'a pas répondu à la dernière lecture\u00a0: analyses de l'eau du robinet lues le 22/10 à 04:20. Un avis publié depuis peut ne pas y figurer\u00a0: voir le site de l'ARS ou de la mairie.";
    configure(async () => copy as never);
    try {
      vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
      const town = body(await qualiteEau(cache(), "Saint-Pierre", "robinet", NOW));
      expect(town.resume).toBe(`Eau du robinet à Saint-Pierre : 2 réseaux, 14 analyses en 6 mois\u00a0; non-conformités sur TERRE SAINTE (1). La qualité dépend du réseau qui dessert le quartier : préciser le quartier. ${note}`);
      expect(town.eau_du_robinet).toMatchObject({ copie: note, derniere_analyse: "21/10/2026", reseaux_a_surveiller: [watched] });
      expect(town.erreur).toBeUndefined();
      expect(town.indisponible).toBeUndefined();
      // A district: its network, by the districts the copy keeps for it.
      const watchedOne = body(await qualiteEau(cache(), "Terre Sainte", "robinet", NOW));
      expect(watchedOne.eau_du_robinet.reseau).toEqual(watched);
      expect(watchedOne.resume.endsWith(note)).toBe(true);
      const quiet = body(await qualiteEau(cache(), "Bois d'Olives", "robinet", NOW));
      expect(quiet.resume).toBe(`Eau du robinet, réseau BOIS D'OLIVES à Bois d'Olives : dernière analyse le 21/10/2026, conclusion de l'ARS : « Eau d'alimentation conforme aux exigences de qualité »\u00a0; aucune analyse non conforme en 6 mois. ${note}`);
      // Read more than 7 days ago: no longer given, Hub'Eau said silent since then.
      configure(async () => ({ ...copy, communes_lu: "2026-10-16T00:20:00.000Z" }) as never);
      const old = body(await qualiteEau(cache(), "Saint-Pierre", "robinet", NOW));
      expect(old.eau_du_robinet).toEqual({ resume: "Hub'Eau ne répond plus depuis le 16/10\u00a0: voir le site de l'ARS.", ne_repond_plus: true });
    } finally {
      configure(undefined);
    }
  });

  it("shows on /eau a distributor's « ne pas boire » notice on its commune's line, in coupures_eau's words (23/11/2026)", async () => {
    const c = cache();
    const avis = {
      distributeur: "Dionéo", titre: "Qualité de l'eau", communes: ["Saint-Denis"], publie: "2026-10-23T06:53:00.000Z", lien: "https://www.dioneo.re/avis/qualite",
      secteurs: ["TRAITEMENT ST FRANCOIS"], secteurs_complets: true, ne_pas_boire: true, texte: "Ne pas consommer l'eau du robinet dans le secteur de l'avis.",
    };
    await c.island("avis-eau:flux", 3600, async () => [{ de: "de Dionéo", site: "https://www.dioneo.re", avis: [avis] }]);
    const town = (commune: string) => ({ commune, reseaux: 1, analyses_6_mois: 3, non_conformes_6_mois: 0, derniere_analyse: "2026-10-20", a_surveiller: [] });
    configure(async () => ({ lu: "2026-10-24T00:20:00.000Z", baignades: [], communes: [town("Saint-Denis"), town("Saint-Paul")] }) as never);
    try {
      const data = await buildEau(c, NOW);
      const said = "Eau à ne pas boire à Saint-Denis d'après Dionéo (avis du 23/10 à 10:53)\u00a0: « Qualité de l'eau », secteurs\u00a0: TRAITEMENT ST FRANCOIS.";
      expect(data.ne_pas_boire).toEqual({ "Saint-Denis": { dit: said, lien: avis.lien } });
      expect(data.sources.map((x) => x.source)).toContain(NOTICES.nom);
      const page = eauPage("https://rundata.re", { value: data, fetchedAt: NOW, stale: false } as never, NOW).replace(/&#39;/g, "'");
      const card = page.slice(page.indexOf("<h3>Saint-Denis "), page.indexOf("<h3>Saint-Paul "));
      expect(card).toContain(`<b>${said}</b>`);
      expect(card).toContain(`<a href="${avis.lien}" rel="noopener">L'avis complet`);
      expect(page).toContain('<li class="card warn"><h3>Saint-Denis ');
      expect(page).not.toContain('<li class="card warn"><h3>Saint-Paul ');
      // The notices not read: nothing said either way, no « ne pas boire » on /eau.
      const mute = cache();
      await mute.island("avis-eau:flux", 3600, async () => { throw new Error("flux muet"); }).catch(() => undefined);
      vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
      const none = await buildEau(mute, NOW);
      expect(none.ne_pas_boire).toBeUndefined();
    } finally {
      configure(undefined);
    }
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
