import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { AGENDAS, LISIBLES, PLANIFIES, SOURCES } from "../src/providers/agenda.js";
import { AUTORISATIONS, type Autorisation, LISIBLE } from "../src/providers/autorisations.js";
import { coupures, LISIBLES as MAIRIES_LISIBLES, MAIRIES, parsePosts, SOURCE as COURANT } from "../src/providers/coupures-courant.js";
import { agenda, COUVERTURE, MAIRIES_LUES, mentionCommune, mentionIle, mentionCourte, refreshPlanned, repris, sourcesServies } from "../src/tools/agenda.js";
import { type CourantAnswer, courantBlock, courantCopy, honesty } from "../src/tools/courant.js";
import { electricite } from "../src/tools/electricite.js";
import { mention, mentionIle as ileMention, mentionLa1ere, mentionReunionFr, mentionSalles, mentionSports } from "../src/tools/non-repris.js";
import { resume } from "../src/tools/resume.js";
import { mentionProgrammes, sportTool } from "../src/tools/sport.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import type { AgendaAnswer } from "../src/web/data.js";
import { agendaPage, electricitePage, sportPage } from "../src/web/domains.js";
import { communeEvents } from "../src/web/liens.js";
import { PAGES } from "../src/web/places.js";

// Saturday 24/10/2026, 08:00 in La Réunion.
const NOW = new Date("2026-10-24T04:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// The same rule for every commune. Bras-Panon agreed on 28/10, L'Étang-Salé on 06/11, Saint-André on 16/11: read. Le
// Tampon, Saint-Denis and Saint-Pierre, then La Possession, Petite-Île, Saint-Benoît and Sainte-Rose, read as public
// information since 20/11: three left, their news.
const ACTUS = ["Cilaos", "Saint-Joseph", "Saint-Philippe"];
const SITES = ["ville-cilaos.fr", "saintjoseph.re", "saintphilippe.re"];
const TROIS = ["Cilaos", "Saint-Philippe", "Sainte-Suzanne"];
const PUBLIQUES = [["la_possession", "La Possession"], ["petite_ile", "Petite-Île"], ["saint_benoit", "Saint-Benoît"]];
const SAINT_JOSEPH = "Les mentions légales du site de la commune de Saint-Joseph interdisent d'en reprendre le contenu sans son accord : rundata.re n'affiche donc pas les actualités qu'elle y publie.";

const event = (titre: string, commune: string) => ({ id: titre, titre, seances: [{ debut: "2026-10-25" }], commune, categories: [], lien: `https://example.re/${titre}`, publie_par: commune });
const kept = (v: unknown) => ({ value: v, fetchedAt: NOW.getTime() - 60_000 });
/** A cache where Saint-Paul's agenda has a fresh copy (the others do not answer), and `more` in the questions' bundle. */
async function cacheWith(more: Record<string, unknown> = {}, planned: Record<string, unknown> = {}) {
  const store = new MemoryStore();
  await store.put("agendas", kept({ "agenda:saint_paul": kept([event("Kabar à Saint-Paul", "Saint-Paul")]), ...more }));
  await store.put(PLANIFIES, kept(planned));
  return new Cache(store, () => NOW.getTime());
}

const saved = structuredClone(AUTORISATIONS);
/** A commune's source of that kind, as if its answer were `a`. */
const set = (commune: string, a: Partial<Autorisation>, famille = "agenda") =>
  Object.assign(Object.entries(AUTORISATIONS).find(([k, x]) => k.startsWith(`${famille}:`) && x.commune === commune)![1], a);
const restore = () => {
  for (const k of Object.keys(saved)) AUTORISATIONS[k] = structuredClone(saved[k]);
};
/** Every source not agreed as before any request went, for the tests of the words of each step. */
const unasked = () => {
  for (const a of Object.values(AUTORISATIONS)) if (!LISIBLE.includes(a.etat)) Object.assign(a, { etat: "a_demander", demandee_le: undefined });
};
// Asked on 26/10, no answer: the news of the three communes, the notices of power cuts of the three.
const DEMANDEES = ["agenda:cilaos", "agenda:saint_joseph", "agenda:saint_philippe", "courant:Cilaos", "courant:Saint-Philippe", "courant:Sainte-Suzanne"];

describe("the setting, by source", () => {
  it("lists the news of three communes, and the notices of power cuts of three, not agreed yet, all asked on 26/10; Bras-Panon agreed on 28/10, L'Étang-Salé on 06/11, Saint-André on 16/11; seven communes read as public information since 20/11", () => {
    // Le Tampon: read as the commune's public information, nothing said instead.
    expect(AUTORISATIONS["agenda:le_tampon"]).toEqual({ commune: "Le Tampon", publie: "événements", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" });
    expect(AGENDAS.find((a) => a.id === "le_tampon")).toMatchObject({ faits: true, site_commune: "site de la commune du Tampon" });
    expect(AGENDAS.find((a) => a.id === "le_tampon")!.accueil).toBeUndefined();
    expect([mentionCommune("Le Tampon"), mentionCourte("Le Tampon")]).toEqual([undefined, undefined]);
    // Saint-Denis and Saint-Pierre: their news, the same way (no agenda on their sites).
    for (const [id, commune] of [["saint_denis", "Saint-Denis"], ["saint_pierre", "Saint-Pierre"]]) {
      expect(AUTORISATIONS[`agenda:${id}`]).toMatchObject({ commune, etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" });
      expect(AGENDAS.find((a) => a.id === id)).toMatchObject({ faits: true, site_commune: `site de la commune de ${commune}`, planifie: true });
      expect([mentionCommune(commune), mentionCourte(commune)]).toEqual([undefined, undefined]);
    }
    // La Possession, Petite-Île and Saint-Benoît: their agendas, read by the questions, each event with its own page.
    for (const [id, commune] of PUBLIQUES) {
      expect(AUTORISATIONS[`agenda:${id}`]).toMatchObject({ commune, etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" });
      expect(AGENDAS.find((a) => a.id === id)).toMatchObject({ faits: true, site_commune: `site de la commune de ${commune}` });
      expect(AGENDAS.find((a) => a.id === id)!.accueil).toBeUndefined();
      expect([mentionCommune(commune), mentionCourte(commune)]).toEqual([undefined, undefined]);
    }
    // Sainte-Rose: no agenda on its site (its menu's leads to a 404 page), nothing said instead.
    expect(AUTORISATIONS["agenda:sainte_rose"]).toMatchObject({ etat: "publique", publique_le: "2026-11-20" });
    expect([mentionCommune("Sainte-Rose"), mentionCourte("Sainte-Rose")]).toEqual([undefined, undefined]);
    // Those whose terms allow it on conditions (« permise ») apart, and those that agreed: they are read.
    expect(AUTORISATIONS["agenda:bras_panon"]).toEqual({ commune: "Bras-Panon", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-10-28" });
    expect(AGENDAS.find((a) => a.id === "bras_panon")!.source.licence).toBe("Information publique (agenda municipal)\u00a0; repris avec son accord écrit du 28/10/2026");
    // Its page no longer says its terms forbid it.
    expect(mentionCommune("Bras-Panon")).toBeUndefined();
    expect(mentionCourte("Bras-Panon")).toBeUndefined();
    expect(AUTORISATIONS["agenda:etang_sale"]).toEqual({ commune: "L'Étang-Salé", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-06" });
    expect(AGENDAS.find((a) => a.id === "etang_sale")!.source.licence).toBe("Information publique (agenda municipal)\u00a0; repris avec son accord écrit du 06/11/2026");
    expect(mentionCommune("L'Étang-Salé")).toBeUndefined();
    expect(mentionCourte("L'Étang-Salé")).toBeUndefined();
    // Saint-André: its agenda and its notices of power cuts, on 16/11.
    expect(AUTORISATIONS["agenda:saint_andre"]).toEqual({ commune: "Saint-André", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-16" });
    expect(AUTORISATIONS["courant:Saint-André"]).toEqual({ commune: "Saint-André", publie: "avis de coupure d'électricité", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-16" });
    expect(AGENDAS.find((a) => a.id === "saint_andre")!.source.licence).toBe("Information publique (agenda municipal)\u00a0; repris avec son accord écrit du 16/11/2026");
    // Its whole agenda as its own source, each date with « site de la commune de Saint-André, lu le … » in the tool too,
    // without its text.
    const saintAndre = AGENDAS.find((a) => a.id === "saint_andre")!;
    expect([saintAndre.source.id, saintAndre.source.url, saintAndre.site_commune, saintAndre.mention, saintAndre.faits]).toEqual(["agenda_saint_andre", "https://www.saint-andre.re/category/agenda/", "site de la commune de Saint-André", true, true]);
    expect(COURANT.licence).toBe("Information publique : seuls les faits (jours, heures, secteurs) sont repris, avec le lien de l'avis\u00a0; Saint-André : repris avec son accord écrit du 16/11/2026");
    expect([mentionCommune("Saint-André"), mentionCourte("Saint-André"), mention("courant", "Saint-André")]).toEqual([undefined, undefined, undefined]);
    const asked = Object.entries(AUTORISATIONS).filter(([, a]) => !LISIBLE.includes(a.etat));
    const of = (famille: string) => asked.filter(([k]) => k.startsWith(`${famille}:`)).map(([, a]) => a.commune);
    expect(of("agenda")).toEqual(ACTUS);
    expect(of("courant").sort()).toEqual(TROIS);
    expect(Object.keys(AUTORISATIONS).filter((k) => !/^(agenda|courant):/.test(k))).toEqual([]);
    expect(asked.filter(([, a]) => a.etat === "demandee").map(([k]) => k).sort()).toEqual(DEMANDEES);
    expect(asked.every(([k, a]) => (DEMANDEES.includes(k) ? a.etat === "demandee" && a.demandee_le === "2026-10-26" : a.etat === "a_demander" && !a.demandee_le))).toBe(true);
    // Each agenda's key is the id of an agenda read when it agrees.
    const ids = asked.map(([k]) => k).filter((k) => k.startsWith("agenda:")).map((k) => k.slice(7));
    expect(ids.filter((id) => !LISIBLES.some((a) => a.id === id && a.site_commune))).toEqual([]);
    expect(TROIS.filter((c) => !MAIRIES_LISIBLES.some((m) => m.commune === c))).toEqual([]);
  });

  it("says the communes asked, and the day, in one sentence after the block: each commune named once", () => {
    const agendas = mentionIle();
    expect(agendas).toHaveLength(1);
    expect(agendas[0]).toMatch(/^Les mentions légales des sites de 3 communes [^]*qu'elles y publient\. Nous leur avons demandé cet accord le 26\/10 et attendons leur réponse\.$/);
    // All asked the same day: each named in the block only.
    for (const c of ACTUS) expect([c, agendas[0].split(c).length - 1]).toEqual([c, 1]);
    expect(mentionCourte("Saint-Joseph")?.detail).toBe("ses mentions légales l'interdisent sans son accord, demandé le 26/10");
    expect(mentionCourte("Cilaos")?.detail).toBe("ses mentions légales l'interdisent sans son accord, demandé le 26/10");
    expect(ileMention("courant")).toEqual([expect.stringMatching(/^Les mentions légales des sites de 3 communes [^]*Ils restent consultables sur leurs sites\. Nous leur avons demandé cet accord le 26\/10 et attendons leur réponse\.$/)]);
  });
});

describe("the communes whose site's terms ask for their authorisation, until they give it", () => {
  let urls: string[];
  beforeEach(() => {
    unasked();
    urls = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (url: string) => (urls.push(url), new Response("", { status: 503 })));
  });
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("are not those whose terms allow it on conditions: read, and nothing said instead", () => {
    const PERMISES = ["La Plaine-des-Palmistes", "Saint-Leu", "Saint-Louis"];
    expect(Object.values(AUTORISATIONS).filter((a) => a.etat === "permise").map((a) => a.commune).sort()).toEqual(PERMISES);
    for (const c of PERMISES) {
      expect(AGENDAS.some((a) => a.commune === c && a.site_commune)).toBe(true);
      expect(mentionCommune(c)).toBeUndefined();
      expect(mentionCourte(c)).toBeUndefined();
    }
    expect(mentionIle().join(" ")).not.toMatch(/Saint-Leu|Saint-Louis|Plaine-des-Palmistes/);
  });

  it("are not read: no agenda nor news of their site, no fetch to it", async () => {
    const theirs = LISIBLES.filter((a) => a.site_commune && ACTUS.includes(a.commune!));
    expect(theirs.map((a) => a.id).sort()).toEqual(["cilaos", "saint_joseph", "saint_philippe"]);
    expect(AGENDAS.filter((a) => theirs.includes(a))).toEqual([]);
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    await refreshPlanned(c, NOW);
    await agenda(c, undefined, undefined, undefined, NOW);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => SITES.some((s) => new URL(u).hostname.endsWith(s)))).toEqual([]);
  });

  it("are no longer served from the copies kept before", async () => {
    const c = await cacheWith({}, { "agenda:saint_joseph": kept([event("Fête de Saint-Joseph", "Saint-Joseph")]), "agenda:cilaos": kept([event("Journée de Cilaos", "Cilaos")]) });
    const b = body(await agenda(c, undefined, undefined, undefined, NOW));
    expect(b.evenements.map((e: { titre: string }) => e.titre)).toContain("Kabar à Saint-Paul");
    expect(JSON.stringify(b)).not.toContain("Fête de Saint-Joseph");
    expect(JSON.stringify(b)).not.toContain("Journée de Cilaos");
  });

  it("are said instead, in marketing's words: before the request, once asked, once refused", () => {
    expect(mentionCommune("Saint-Joseph")).toBe(SAINT_JOSEPH);
    expect(mentionCommune("Saint-Paul")).toBeUndefined();
    set("Saint-Joseph", { etat: "demandee" });
    expect(mentionCommune("Saint-Joseph")).toBe(`${SAINT_JOSEPH} Nous lui avons demandé cet accord et attendons sa réponse.`);
    set("Saint-Joseph", { demandee_le: "2026-10-26" });
    expect(mentionCommune("Saint-Joseph")).toBe(`${SAINT_JOSEPH} Nous lui avons demandé cet accord le 26/10 et attendons sa réponse.`);
    expect(mentionCourte("Saint-Joseph")).toEqual({ valeur: "Actualités non reprises", detail: "ses mentions légales l'interdisent sans son accord, demandé le 26/10", tete: "Actualités communales non reprises", resume: "actualités du site de la commune non reprises, ses mentions légales l'interdisent sans son accord, demandé le 26/10 (voir non_repris)", ligne: "Actualités du site de la commune non reprises : ses mentions légales l'interdisent sans son accord, demandé le 26/10." });
    set("Saint-Joseph", { etat: "refusee", refusee_le: "2026-11-03" });
    expect(mentionCommune("Saint-Joseph")).toBe("La commune de Saint-Joseph a refusé, le 03/11, que rundata.re reprenne le contenu de son site : les actualités qu'elle y publie ne s'affichent donc pas ici.");
    expect(mentionCourte("Saint-Joseph")?.detail).toBe("elle a refusé le 03/11");
    expect(mentionCourte("Cilaos")).toEqual({ valeur: "Actualités non reprises", detail: "ses mentions légales l'interdisent sans son accord", tete: "Actualités communales non reprises", resume: "actualités du site de la commune non reprises, ses mentions légales l'interdisent sans son accord (voir non_repris)", ligne: "Actualités du site de la commune non reprises : ses mentions légales l'interdisent sans son accord." });
    set("Cilaos", { etat: "demandee" });
    expect(mentionCourte("Cilaos")?.detail).toBe("ses mentions légales l'interdisent sans son accord, que nous lui avons demandé");
    set("Saint-Joseph", { etat: "accordee" });
    expect(mentionCommune("Saint-Joseph")).toBeUndefined();
    expect(mentionCourte("Saint-Joseph")).toBeUndefined();
    // Read as public information: nothing said instead either.
    set("Saint-Joseph", { etat: "publique", publique_le: "2026-11-20" });
    expect(mentionCommune("Saint-Joseph")).toBeUndefined();
  });

  it("are said in one block for the whole island, the day of the request when it is the same for all", () => {
    const block = "Les mentions légales des sites de 3 communes interdisent d'en reprendre le contenu sans leur accord : Cilaos, Saint-Joseph et Saint-Philippe. rundata.re n'affiche donc pas les actualités qu'elles y publient.";
    expect(mentionIle()).toEqual([block]);
    for (const c of ACTUS) set(c, { etat: "demandee", demandee_le: "2026-10-26" });
    expect(mentionIle()).toEqual([`${block} Nous leur avons demandé cet accord le 26/10 et attendons leur réponse.`]);
    // Not all asked: those asked in one sentence after the block, each commune said once (marketing, 26/10).
    restore();
    set("Saint-Philippe", { etat: "a_demander", demandee_le: undefined });
    expect(mentionIle()).toEqual([`${block} Nous avons demandé cet accord le 26/10 à Cilaos et à Saint-Joseph, et attendons leur réponse.`]);
    restore();
    expect(COUVERTURE).not.toMatch(/(?:à|de) Le Tampon/);
    unasked();
    set("Saint-Joseph", { etat: "demandee", demandee_le: "2026-10-26" });
    expect(mentionIle()).toEqual([`${block} Nous avons demandé cet accord le 26/10 à Saint-Joseph et attendons sa réponse.`]);
    // On several days: each day after its communes, from the oldest.
    set("Cilaos", { etat: "demandee", demandee_le: "2026-10-22" });
    expect(mentionIle()).toEqual([`${block} Nous avons demandé cet accord à Cilaos le 22/10 et à Saint-Joseph le 26/10, et attendons leur réponse.`]);
    set("Saint-Philippe", { etat: "demandee", demandee_le: "2026-10-20" });
    expect(mentionIle()[0]).toMatch(/ Nous avons demandé cet accord à Saint-Philippe le 20\/10, à Cilaos le 22\/10 et à Saint-Joseph le 26\/10, et attendons leur réponse\.$/);
  });

  it("are left out of the agendas read and of those without one, and said in the coverage and the answer", async () => {
    expect(MAIRIES_LUES).toBe("Saint-Paul, Le Port, Les Trois-Bassins, Sainte-Marie, Salazie, Le Tampon, Saint-Louis, Saint-André, L'Étang-Salé, La Possession, Petite-Île, Bras-Panon, Saint-Benoît");
    expect(COUVERTURE).toMatch(/Ville du Tampon/);
    // The mairies' news read are only those of the communes whose terms allow it, or whose site writes no condition.
    expect(COUVERTURE).toContain("(pas un agenda complet) : Saint-Denis, Saint-Pierre, Saint-Louis, Saint-Leu, La Plaine-des-Palmistes, Sainte-Marie, Salazie.");
    const without = /Sans agenda lu[^:]*: ([^.]*)\./.exec(COUVERTURE)![1];
    expect(ACTUS.filter((c) => without.includes(c))).toEqual([]);
    // Sainte-Rose, read as public information, has no agenda on its site: said without one.
    expect(without).toBe("Les Avirons, Entre-Deux, Sainte-Rose");
    expect(COUVERTURE).toContain(mentionIle()[0]);
    const c = await cacheWith();
    const joseph = body(await agenda(c, "Saint-Joseph", undefined, undefined, NOW));
    expect(joseph.non_repris).toBe(SAINT_JOSEPH);
    expect(joseph.resume).toContain("; actualités du site de la commune non reprises, ses mentions légales l'interdisent sans son accord (voir non_repris)");
    // Le Tampon, read as public information, and its theatre, which agreed on 27/10 (test/non-reprises.test.ts): nothing said.
    expect(mentionSalles("Le Tampon")).toEqual([]);
    const tampon = body(await agenda(c, "Le Tampon", undefined, undefined, NOW));
    expect(tampon.non_repris).toBeUndefined();
    expect(tampon.resume).not.toContain("non repris");
    const ile = body(await agenda(c, undefined, undefined, undefined, NOW));
    // The communes, the halls, then reunion.fr (not a commune: a line apart).
    expect(ile.non_repris).toBe(`${mentionIle().join(" ")} ${mentionSalles().join(" ")} ${mentionReunionFr()}`);
    // Saint-Joseph: no other source there.
    expect(body(await agenda(c, "Saint-Joseph", undefined, undefined, NOW)).resume).not.toContain("reunion.fr");
  });

  it("are said on the page of the events and in the outings of the commune's page, never « rien d'annoncé »", () => {
    const value = { resume: "", nombre: 0, evenements: [], non_repris: mentionIle().join(" "), couverture: COUVERTURE, a_savoir: "", sources: [], ce_week_end: [] } as AgendaAnswer;
    const html = agendaPage("https://rundata.re", { value, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain("Les mentions légales des sites de 3 communes interdisent");
    const page = (slug: string) => PAGES.find((p) => p.slug === slug)!;
    // Each keeps its page, its tile of outings and all that comes from elsewhere: only its site is not read.
    expect(ACTUS.filter((c) => !PAGES.some((p) => p.commune && p.nom === c))).toEqual([]);
    const copy = { value, fetchedAt: NOW, stale: false };
    expect(communeEvents(page("saint-joseph"), copy)).toEqual({ valeur: "Actualités non reprises", detail: "ses mentions légales l&#39;interdisent sans son accord", title: SAINT_JOSEPH });
    // With events from other sources: their number, and the whole mention after the next one.
    const luc = { titre: "Spectacle", date: "2026-10-25T20:00", quand: "dimanche 25/10 à 20:00", genres: [], commune: "Saint-Joseph", lien: "https://example.re" } as unknown as NonNullable<AgendaAnswer["evenements"]>[number];
    expect(communeEvents(page("saint-joseph"), { ...copy, value: { ...value, evenements: [luc] } })).toEqual({ valeur: "1 événement", detail: "Actualités communales non reprises · le prochain : Spectacle, dimanche 25/10 à 20:00", title: SAINT_JOSEPH });
    expect(communeEvents(page("saint-leu"), copy)).toMatchObject({ valeur: "Rien d'annoncé" });
  });

  it("are not served from a copy built before, whatever its age: the day's summary, the outings tile, the credits", () => {
    // A copy of the events page built by the revision before, as some data centers still hold it.
    const joseph = { titre: "Marché de Saint-Joseph", commune: "Saint-Joseph", date: "2026-10-24T09:00", quand: "samedi 24/10 à 09:00", lien: "https://saintjoseph.re/marche", publie_par: "Ville de Saint-Joseph", source: "site de la commune de Saint-Joseph, lu le samedi 24/10 à 08:00" };
    const luc = { titre: "Spectacle", commune: "Saint-Joseph", date: "2026-10-24T20:00", quand: "samedi 24/10 à 20:00", lien: "https://example.re", publie_par: "Une compagnie de Saint-Joseph" };
    // Le Tampon's, read as public information since 20/11: served.
    const tampon = { titre: "Ateliers des Conseillers numériques", commune: "Le Tampon", date: "2026-10-24T09:00", quand: "samedi 24/10 à 09:00", lien: "https://letampon.fr/agenda/ateliers-des-conseillers-numeriques-1026/", publie_par: "Ville du Tampon", source: "site de la commune du Tampon, lu le samedi 24/10 à 08:00" };
    const old = { resume: "", nombre: 2, couverture: "", a_savoir: "", ce_week_end: [], evenements: [joseph, luc], sources: [{ source: "Agendas des mairies de Saint-Paul, du Port, des Trois-Bassins, du Tampon, de Saint-Louis et de Saint-André", licence: "Information publique (agendas municipaux)", attribution: "Villes de Saint-Paul, Le Port, Les Trois-Bassins, Le Tampon, Saint-Louis et Saint-André" }] };
    expect([repris(joseph), repris(luc), repris({ publie_par: "Mairie de Saint-Philippe" }), repris({ source: "site de la commune de Saint-Paul, lu le samedi 24/10 à 08:00" }), repris(tampon)]).toEqual([false, true, false, true, true]);
    const page = PAGES.find((p) => p.slug === "saint-joseph")!;
    const r = resume(page, { agenda: { value: old, fetchedAt: NOW, stale: false } } as never, NOW);
    expect(r.evenements_du_jour!.liste.map((e) => e.titre)).toEqual(["Spectacle"]);
    expect(JSON.stringify(r)).not.toMatch(/saintjoseph\.re\/marche|du Tampon, de Saint-Louis/);
    expect(communeEvents(page, { value: old as unknown as AgendaAnswer, fetchedAt: NOW, stale: false })).toMatchObject({ valeur: "1 événement" });
    // Named after the mairies read: not Saint-Louis nor Le Port, credited apart with their terms' clause.
    expect([SOURCES.mairies.nom, SOURCES.mairies.attribution]).toEqual(["Agendas des mairies de Saint-Paul, des Trois-Bassins et du Tampon", "Villes de Saint-Paul, des Trois-Bassins et du Tampon"]);
    expect(sourcesServies(old.sources)!.map((c) => c.source)).toEqual([SOURCES.mairies.nom]);
  });

  it("are said under the outings of the day's page", () => {
    const page = PAGES.find((p) => p.slug === "saint-joseph")!;
    const empty = { resume: "", nombre: 0, couverture: "", a_savoir: "", ce_week_end: [], evenements: [], sources: [] };
    const html = aujourdhuiPage("https://rundata.re", page, resume(page, { agenda: { value: empty, fetchedAt: NOW, stale: false } } as never, NOW), null);
    expect(html).toContain("Rien d'annoncé aujourd'hui à Saint-Joseph dans les agendas lus.</p><p class=\"note np\">Actualités du site de la commune non reprises : ses mentions légales l&#39;interdisent sans son accord. <a href=\"/ouvrir-ses-donnees#licence\">Comment permettre la reprise</a></p>");
    const paul = PAGES.find((p) => p.slug === "saint-paul")!;
    expect(aujourdhuiPage("https://rundata.re", paul, resume(paul, { agenda: { value: empty, fetchedAt: NOW, stale: false } } as never, NOW), null)).not.toContain("non repris");
  });

  it("say no sports programme of a commune any more: La Possession and Saint-Benoît read as public information since 20/11, theirs on /sport and in the tool", async () => {
    expect(LISIBLES.filter((a) => a.programmes).map((a) => a.commune)).toEqual(["L'Étang-Salé", "La Possession", "Saint-Benoît"]);
    expect(LISIBLES.filter((a) => a.programmes).every((a) => AGENDAS.includes(a))).toBe(true);
    expect(mentionProgrammes()).toBeUndefined();
    expect(mentionProgrammes(["Saint-Benoît", "Saint-André"])).toBeUndefined();
    // The motor sport league answers; La Possession's programme in the questions' copy: served, nothing said instead.
    vi.stubGlobal("fetch", async (url: string) => (url.includes("lsar") ? new Response(readFileSync(new URL("./fixtures/sport/lsar.json", import.meta.url))) : new Response("", { status: 503 })));
    const c = await cacheWith({ "agenda:la_possession": kept([{ ...event("Agenda sportif du 22 au 24 octobre", "La Possession"), seances: [{ debut: "2026-10-22", fin: "2026-10-26" }] }]) });
    const b = body(await sportTool(c, undefined, undefined, "a_venir", NOW));
    // For the whole island, Réunion La 1ère's sport news not read is said first (test/la1ere.test.ts).
    // Then the sports sites not read until they agree (test/non-reprises.test.ts).
    expect(b.non_repris).toBe(`${mentionLa1ere("sport")} ${mentionSports(undefined, true).join(" ")}`);
    expect(JSON.stringify(b.programmes_communes)).toContain("Agenda sportif du 22 au 24 octobre");
    const html = sportPage("https://rundata.re", { value: { ...b, classements: [] }, fetchedAt: NOW, stale: false }, NOW);
    expect(html).not.toContain("ne sont pas repris : les mentions légales des sites de ces communes");
  });

  it("say nothing instead for Sainte-Rose, read as public information since 20/11 but without an agenda on its site, its events from elsewhere kept; nor for Saint-Denis and Saint-Pierre", () => {
    expect([mentionCommune("Sainte-Rose"), mentionCourte("Sainte-Rose")]).toEqual([undefined, undefined]);
    // Nothing of its site to read: the intercommunalities' and the halls' events kept.
    expect(LISIBLES.filter((a) => a.site_commune && a.commune === "Sainte-Rose")).toEqual([]);
    const value = { resume: "", nombre: 1, evenements: [{ titre: "Concert", date: "2026-10-25T20:00", quand: "dimanche 25/10 à 20:00", genres: [], commune: "Sainte-Rose", lien: "https://example.re", publie_par: "Office de tourisme" }], non_repris: "", couverture: "", a_savoir: "", sources: [], ce_week_end: [] } as unknown as AgendaAnswer;
    const page = (slug: string) => PAGES.find((p) => p.slug === slug)!;
    expect(communeEvents(page("sainte-rose"), { value, fetchedAt: NOW, stale: false })).toMatchObject({ valeur: "1 événement" });
    expect(JSON.stringify(communeEvents(page("sainte-rose"), { value, fetchedAt: NOW, stale: false }))).not.toContain("non repris");
    // Saint-Denis and Saint-Pierre: their news read as public information, nothing said instead.
    for (const c of ["Saint-Denis", "Saint-Pierre"]) {
      expect([mentionCommune(c), mentionCourte(c)]).toEqual([undefined, undefined]);
      expect(LISIBLES.filter((a) => a.site_commune && a.commune === c)).toHaveLength(1);
    }
    expect(communeEvents(page("saint-pierre"), { value: { ...value, evenements: [] }, fetchedAt: NOW, stale: false })).toMatchObject({ valeur: "Rien d'annoncé" });
    // Saint-Pierre: no reason of an empty agenda page any more.
    expect(COUVERTURE).not.toContain("la page agenda de la mairie de Saint-Pierre est vide");
  });
});

describe("the notices of power cuts of the mairies whose site's terms ask for their authorisation, until they give it", () => {
  const CILAOS = "Les mentions légales du site de la commune de Cilaos interdisent d'en reprendre le contenu sans son accord : rundata.re n'affiche donc pas les avis de coupure d'électricité qu'elle y publie. Ils restent consultables sur son site.";
  const BLOC = "Les mentions légales des sites de 3 communes interdisent d'en reprendre le contenu sans leur accord : Cilaos, Saint-Philippe et Sainte-Suzanne. rundata.re n'affiche donc pas les avis de coupure d'électricité qu'elles y publient. Ils restent consultables sur leurs sites.";
  // Sainte-Monday 26/10's notice of Sainte-Marie, and one of Cilaos kept in the copy from before.
  const post = (date: string, title: string, html: string) => ({ date, title: { rendered: title }, link: `https://example.org/${encodeURIComponent(title)}`, content: { rendered: html } });
  const sm = parsePosts([post("2026-10-21T10:00:00", "Avis de coupure d&rsquo;électricité", "<p>Travaux d'EDF Réunion sur le réseau.</p><p><strong>Le lundi 26 octobre de 9h00 à 15h00 :</strong></p><ul><li>Rue des Jésuites</li></ul>")], "Sainte-Marie");
  const ci = parsePosts([post("2026-10-21T14:33:00", "Travaux sur le réseau électrique à Cilaos", "<p>Du <strong>26 au 30 octobre 2026</strong>, travaux sur le réseau électrique à Mare Sèche.</p><p>Des coupures d'électricité ponctuelles sont possibles.</p>")], "Cilaos");
  const before: CourantAnswer = { avis: [...sm, ...ci], lues: ["Sainte-Marie", "Cilaos"], indisponibles: ["Sainte-Suzanne"], sources: [] };
  const kept = { value: before, fetchedAt: NOW, stale: false };
  beforeEach(unasked);
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it("are not read: Sainte-Marie, and Saint-André since its agreement, no fetch to the three other sites, the source naming the two", async () => {
    expect(MAIRIES.map((m) => m.commune)).toEqual(["Sainte-Marie", "Saint-André"]);
    expect([COURANT.nom, COURANT.attribution, COURANT.url]).toEqual(["Avis de coupure d'électricité d'EDF Réunion relayés par les mairies (Sainte-Marie, Saint-André)", "Mairies de Sainte-Marie et Saint-André", "https://www.ville-saintemarie.re/"]);
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (asked.push(String(url)), Response.json([])));
    expect((await coupures()).lues).toEqual(["Sainte-Marie", "Saint-André"]);
    // Saint-André's posts, and the EDF letters it puts online as PDF files.
    expect(asked.map((u) => new URL(u).hostname)).toEqual(["www.ville-saintemarie.re", "www.saint-andre.re", "www.saint-andre.re"]);
    // Neither answers: Sainte-Marie's notices kept from the copy before, not a failed copy; Saint-André had none in it.
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const copy = await courantCopy(kept, NOW);
    expect([copy.indisponibles, copy.gardes?.map((g) => g.commune), copy.avis.map((a) => a.commune)]).toEqual([["Sainte-Marie", "Saint-André"], ["Sainte-Marie"], ["Sainte-Marie"]]);
    expect((await courantCopy()).indisponibles).toEqual(["Sainte-Marie", "Saint-André"]);
    vi.restoreAllMocks();
  });

  it("are said instead, in marketing's words: before the request, once asked, once refused", () => {
    expect(mention("courant", "Cilaos")).toBe(CILAOS);
    expect(mention("courant", "Sainte-Marie")).toBeUndefined();
    // Saint-Joseph's news are not read, but it relays no notice: nothing said of power cuts there.
    expect(mention("courant", "Saint-Joseph")).toBeUndefined();
    set("Cilaos", { etat: "demandee" }, "courant");
    expect(mention("courant", "Cilaos")).toBe(`${CILAOS} Nous lui avons demandé cet accord et attendons sa réponse.`);
    set("Cilaos", { demandee_le: "2026-10-26" }, "courant");
    expect(mention("courant", "Cilaos")).toBe(`${CILAOS} Nous lui avons demandé cet accord le 26/10 et attendons sa réponse.`);
    set("Cilaos", { etat: "refusee", refusee_le: "2026-11-03" }, "courant");
    expect(mention("courant", "Cilaos")).toBe("La commune de Cilaos a refusé, le 03/11, que rundata.re reprenne le contenu de son site : les avis de coupure d'électricité qu'elle y publie ne s'affichent donc pas ici. Ils restent consultables sur son site.");
    // Its agenda's mention is its own: the events, not the notices.
    expect(mentionCommune("Cilaos")).toMatch(/les actualités qu'elle y publie\.$/);
    set("Cilaos", { etat: "accordee" }, "courant");
    expect(mention("courant", "Cilaos")).toBeUndefined();
  });

  it("are said in one block for the whole island, the day of the request when it is the same for all", () => {
    expect(ileMention("courant")).toEqual([BLOC]);
    for (const c of TROIS) set(c, { etat: "demandee", demandee_le: "2026-10-26" }, "courant");
    expect(ileMention("courant")).toEqual([`${BLOC} Nous leur avons demandé cet accord le 26/10 et attendons leur réponse.`]);
    set("Sainte-Suzanne", { demandee_le: "2026-10-27" }, "courant");
    expect(ileMention("courant")).toEqual([`${BLOC} Nous avons demandé cet accord à Cilaos et à Saint-Philippe le 26/10 et à Sainte-Suzanne le 27/10, et attendons leur réponse.`]);
    // As they are: the three asked on 26/10.
    restore();
    expect(ileMention("courant")).toEqual([`${BLOC} Nous leur avons demandé cet accord le 26/10 et attendons leur réponse.`]);
  });

  it("are no longer said from the copy kept before: the commune's mention instead, not « publishes nothing »", () => {
    const cilaos = courantBlock(kept, "Cilaos", NOW);
    expect(cilaos).toMatchObject({ avis: [], note: CILAOS, non_repris: CILAOS });
    const ile = courantBlock(kept, undefined, NOW);
    expect(ile.avis!.map((a) => a.commune)).toEqual(["Sainte-Marie"]);
    expect([ile.non_repris, ile.indisponibles]).toEqual([BLOC, undefined]);
    expect(honesty()).toBe("EDF publie ses coupures pour travaux sur son site, mais ses mentions légales interdisent d'en reprendre le contenu sans son accord (lues le 03/11/2026). Nous reprenons celles que relaient les mairies dont le site ne l'interdit pas ou qui ont donné leur accord écrit à rundata.re\u00a0: aujourd'hui Sainte-Marie et Saint-André, quand leurs avis sont lisibles.");
    expect(courantBlock(kept, "Sainte-Marie", NOW).non_repris).toBeUndefined();
    expect(courantBlock(undefined, "Cilaos", NOW).non_repris).toBe(CILAOS);
  });

  it("are said by the tool electricite, for the commune and for the island", async () => {
    const store = new MemoryStore();
    await store.put("web:courant", { value: before, fetchedAt: NOW.getTime() });
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new Cache(store, () => NOW.getTime());
    const cilaos = body(await electricite(c, NOW, "Cilaos"));
    expect(cilaos.resume.startsWith(CILAOS)).toBe(true);
    expect(cilaos.coupures_annoncees.non_repris).toBe(CILAOS);
    const ile = body(await electricite(c, NOW));
    expect(ile.resume).toContain("Avis de coupure d'électricité de Cilaos, de Saint-Philippe et de Sainte-Suzanne non repris, leurs mentions légales l'interdisent sans leur accord (voir non_repris).");
    expect(ile.coupures_annoncees.non_repris).toBe(BLOC);
    vi.restoreAllMocks();
  });

  it("are said on /electricite, under the notices read", () => {
    const html = electricitePage("https://rundata.re", { value: { resume: "", avertissements: [], sources: [], coupures_annoncees: courantBlock(kept, undefined, NOW) }, fetchedAt: NOW, stale: false } as never, NOW);
    const section = html.slice(html.indexOf('id="coupures"'));
    expect(section).toContain("Les mentions légales des sites de 3 communes interdisent d&#39;en reprendre le contenu sans leur accord");
    expect(section).not.toContain("Mare Sèche");
  });
});
