import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { AGENDAS, LISIBLES, PLANIFIES, SOURCES } from "../src/providers/agenda.js";
import { AUTORISATIONS, LISIBLE } from "../src/providers/autorisations.js";
import { coupures, LISIBLES as MAIRIES_LISIBLES, MAIRIES, parsePosts, SOURCE as COURANT } from "../src/providers/coupures-courant.js";
import { agenda, COUVERTURE, MAIRIES_LUES, repris, sourcesServies } from "../src/tools/agenda.js";
import { type CourantAnswer, courantBlock, honesty } from "../src/tools/courant.js";
import { electricite } from "../src/tools/electricite.js";
import { mentionLa1ere, mentionReunionFr, mentionSalles, mentionSports } from "../src/tools/non-repris.js";
import { resume } from "../src/tools/resume.js";
import { sportTool } from "../src/tools/sport.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import type { AgendaAnswer } from "../src/web/data.js";
import { electricitePage } from "../src/web/domains.js";
import { sportPage } from "../src/web/sport.js";
import { agendaPage } from "../src/web/agenda.js";
import { communeEvents } from "../src/web/liens.js";
import { PAGES } from "../src/web/places.js";

// Saturday 24/10/2026, 08:00 in La Réunion.
const NOW = new Date("2026-10-24T04:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// Every commune's own site is read since 20/11/2026 as its public information, the last ones in three batches: Le
// Tampon, Saint-Denis and Saint-Pierre; La Possession, Petite-Île, Saint-Benoît and Sainte-Rose; Cilaos, Saint-Joseph
// and Saint-Philippe (their news), with the notices of power cuts of Cilaos, Saint-Philippe and Sainte-Suzanne.
const PUBLIQUES = [
  ["le_tampon", "Le Tampon"], ["saint_denis", "Saint-Denis"], ["saint_pierre", "Saint-Pierre"],
  ["la_possession", "La Possession"], ["petite_ile", "Petite-Île"], ["saint_benoit", "Saint-Benoît"],
  ["cilaos", "Cilaos"], ["saint_joseph", "Saint-Joseph"], ["saint_philippe", "Saint-Philippe"],
];
const ACTUS = ["Cilaos", "Saint-Joseph", "Saint-Philippe"];
const TROIS = ["Cilaos", "Saint-Philippe", "Sainte-Suzanne"];

const event = (titre: string, commune: string) => ({ id: titre, titre, seances: [{ debut: "2026-10-25" }], commune, categories: [], lien: `https://example.re/${titre}`, publie_par: commune });
const kept = (v: unknown) => ({ value: v, fetchedAt: NOW.getTime() - 60_000 });
/** A cache where Saint-Paul's agenda has a fresh copy (the others do not answer), and `more` in the questions' bundle. */
async function cacheWith(more: Record<string, unknown> = {}, planned: Record<string, unknown> = {}) {
  const store = new MemoryStore();
  await store.put("agendas", kept({ "agenda:saint_paul": kept([event("Kabar à Saint-Paul", "Saint-Paul")]), ...more }));
  await store.put(PLANIFIES, kept(planned));
  return new Cache(store, () => NOW.getTime());
}
const page = (slug: string) => PAGES.find((p) => p.slug === slug)!;

describe("the communes' sources", () => {
  it("are all read: none waits, the last ones as the commune's public information since 20/11/2026", () => {
    expect(Object.keys(AUTORISATIONS).filter((k) => !/^(agenda|courant):/.test(k))).toEqual([]);
    expect(Object.entries(AUTORISATIONS).filter(([, a]) => !LISIBLE.includes(a.etat)).map(([k]) => k)).toEqual([]);
    for (const [id, commune] of PUBLIQUES) {
      expect(AUTORISATIONS[`agenda:${id}`], id).toMatchObject({ commune, etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" });
      const a = AGENDAS.find((x) => x.id === id);
      expect(a, id).toMatchObject({ faits: true, site_commune: `site de la commune ${id === "le_tampon" ? "du Tampon" : `de ${commune}`}` });
      expect(a!.accueil, id).toBeUndefined();
    }
    // Sainte-Rose: no agenda on its site (its menu's leads to a 404 page).
    expect(AUTORISATIONS["agenda:sainte_rose"]).toMatchObject({ etat: "publique", publique_le: "2026-11-20" });
    expect(LISIBLES.filter((a) => a.site_commune && a.commune === "Sainte-Rose")).toEqual([]);
    for (const c of TROIS) expect(AUTORISATIONS[`courant:${c}`], c).toMatchObject({ commune: c, etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" });
    // Every agenda of a commune's site listed is read, and every mairie relaying notices of power cuts.
    expect(LISIBLES.filter((a) => a.site_commune && !AGENDAS.includes(a)).map((a) => a.id)).toEqual([]);
    expect(MAIRIES).toEqual(MAIRIES_LISIBLES);
    // Bras-Panon, L'Étang-Salé and Saint-André keep their day in their licence.
    expect(AUTORISATIONS["agenda:bras_panon"]).toEqual({ commune: "Bras-Panon", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-10-28" });
    expect(AGENDAS.find((a) => a.id === "bras_panon")!.source.licence).toBe("Information publique (agenda municipal) ; repris avec son accord écrit du 28/10/2026");
    expect(AUTORISATIONS["agenda:etang_sale"]).toEqual({ commune: "L'Étang-Salé", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-06" });
    expect(AUTORISATIONS["agenda:saint_andre"]).toEqual({ commune: "Saint-André", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-16" });
    expect(AUTORISATIONS["courant:Saint-André"]).toEqual({ commune: "Saint-André", publie: "avis de coupure d'électricité", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-16" });
    const saintAndre = AGENDAS.find((a) => a.id === "saint_andre")!;
    expect([saintAndre.source.id, saintAndre.source.url, saintAndre.site_commune, saintAndre.mention, saintAndre.faits]).toEqual(["agenda_saint_andre", "https://www.saint-andre.re/category/agenda/", "site de la commune de Saint-André", true, true]);
    // « permise »: Saint-Leu, Saint-Louis, La Plaine-des-Palmistes.
    const PERMISES = ["La Plaine-des-Palmistes", "Saint-Leu", "Saint-Louis"];
    expect(Object.values(AUTORISATIONS).filter((a) => a.etat === "permise").map((a) => a.commune).sort()).toEqual(PERMISES);
    for (const c of PERMISES) expect(AGENDAS.some((a) => a.commune === c && a.site_commune), c).toBe(true);
  });

  it("read the news of Cilaos, Saint-Joseph and Saint-Philippe by the scheduled event, and serve its copy", async () => {
    const theirs = AGENDAS.filter((a) => a.site_commune && ACTUS.includes(a.commune!));
    expect(theirs.map((a) => [a.id, a.planifie, a.partiel !== undefined])).toEqual([["saint_philippe", true, true], ["cilaos", true, true], ["saint_joseph", true, true]]);
    const c = await cacheWith({}, { "agenda:saint_joseph": kept([event("Fête de Saint-Joseph", "Saint-Joseph")]), "agenda:cilaos": kept([event("Journée de Cilaos", "Cilaos")]) });
    const b = body(await agenda(c, undefined, undefined, undefined, NOW));
    expect(b.evenements.map((e: { titre: string }) => e.titre)).toEqual(expect.arrayContaining(["Kabar à Saint-Paul", "Fête de Saint-Joseph", "Journée de Cilaos"]));
  });

  it("count in the coverage: the mairies' news read, none said instead", async () => {
    expect(MAIRIES_LUES).toBe("Saint-Paul, Le Port, Les Trois-Bassins, Sainte-Marie, Salazie, Le Tampon, Saint-Louis, Saint-André, L'Étang-Salé, La Possession, Petite-Île, Bras-Panon, Saint-Benoît");
    const actus = /\(pas un agenda complet\) : ([^.]*)\./.exec(COUVERTURE)![1].split(", ");
    expect(ACTUS.filter((c) => !actus.includes(c))).toEqual([]);
    expect(/Sans agenda lu[^:]*: ([^.]*)\./.exec(COUVERTURE)![1]).toBe("Les Avirons, Entre-Deux");
    expect(COUVERTURE).not.toMatch(/des sites de \d+ communes|du site de la commune/);
    const c = await cacheWith();
    for (const commune of [...ACTUS, "Le Tampon"]) {
      const one = body(await agenda(c, commune, undefined, undefined, NOW));
      expect(one.non_repris, commune).toBeUndefined();
      expect(one.resume, commune).not.toContain("non repris");
    }
    // The whole island: the halls not read, then reunion.fr; no commune.
    expect(body(await agenda(c, undefined, undefined, undefined, NOW)).non_repris).toBe(`${mentionSalles().join(" ")} ${mentionReunionFr()}`);
  });

  it("say nothing instead of a commune on the pages: the events, the commune's outings, the day's page", () => {
    const value = { resume: "", nombre: 0, evenements: [], non_repris: mentionSalles().join(" ") || undefined, couverture: COUVERTURE, a_savoir: "", sources: [], ce_week_end: [] } as AgendaAnswer;
    const copy = { value, fetchedAt: NOW, stale: false };
    expect(agendaPage("https://rundata.re", copy, NOW)).not.toMatch(/sites de \d+ communes|du site de la commune de/);
    for (const c of ACTUS) expect(communeEvents(page(c.toLowerCase().replaceAll(" ", "-")), copy), c).toEqual({ valeur: "Rien d'annoncé", detail: "d'ici quinze jours dans les agendas lus" });
    const luc = { titre: "Spectacle", date: "2026-10-25T20:00", quand: "dimanche 25/10 à 20:00", genres: [], commune: "Saint-Joseph", lien: "https://example.re" } as unknown as NonNullable<AgendaAnswer["evenements"]>[number];
    expect(communeEvents(page("saint-joseph"), { ...copy, value: { ...value, evenements: [luc] } })).toEqual({ valeur: "1 événement", detail: "d'ici quinze jours ; le prochain : Spectacle, dimanche 25/10 à 20:00", title: undefined });
    const empty = { resume: "", nombre: 0, couverture: "", a_savoir: "", ce_week_end: [], evenements: [], sources: [] };
    const r = resume(page("saint-joseph"), { agenda: { value: empty, fetchedAt: NOW, stale: false } } as never, NOW);
    expect(JSON.stringify(r)).not.toMatch(/non_repris|non repris|sans le site de la commune/);
    const html = aujourdhuiPage("https://rundata.re", page("saint-joseph"), r, null);
    expect(html).toContain("Rien d'annoncé aujourd'hui à Saint-Joseph dans les agendas lus.</p>");
    expect(html).not.toContain("non repris");
  });

  it("are served from a copy built before; only an agenda no longer read is not", () => {
    // A copy of the events page built by the revision before, as some data centers still hold it.
    const joseph = { titre: "Marché de Saint-Joseph", commune: "Saint-Joseph", date: "2026-10-24T09:00", quand: "samedi 24/10 à 09:00", lien: "https://saintjoseph.re/marche", publie_par: "Ville de Saint-Joseph", source: "site de la commune de Saint-Joseph, lu le samedi 24/10 à 08:00" };
    const luc = { titre: "Spectacle", commune: "Saint-Joseph", date: "2026-10-24T20:00", quand: "samedi 24/10 à 20:00", lien: "https://example.re", publie_par: "Une compagnie de Saint-Joseph" };
    const old = { resume: "", nombre: 2, couverture: "", a_savoir: "", ce_week_end: [], evenements: [joseph, luc], sources: [{ source: "Agendas des mairies de Saint-Paul, du Port, des Trois-Bassins, du Tampon, de Saint-Louis et de Saint-André", licence: "Information publique (agendas municipaux)", attribution: "Villes de Saint-Paul, Le Port, Les Trois-Bassins, Le Tampon, Saint-Louis et Saint-André" }] };
    expect([repris(joseph), repris(luc), repris({ publie_par: "Mairie de Saint-Philippe" }), repris({ source: "site de la commune de Saint-Paul, lu le samedi 24/10 à 08:00" })]).toEqual([true, true, true, true]);
    const r = resume(page("saint-joseph"), { agenda: { value: old, fetchedAt: NOW, stale: false } } as never, NOW);
    expect(r.evenements_du_jour!.liste.map((e) => e.titre)).toEqual(["Marché de Saint-Joseph", "Spectacle"]);
    // Named after the mairies read: not Saint-Louis nor Le Port, credited apart with their terms' clause.
    expect([SOURCES.mairies.nom, SOURCES.mairies.attribution]).toEqual(["Agendas des mairies de Saint-Paul, des Trois-Bassins et du Tampon", "Villes de Saint-Paul, des Trois-Bassins et du Tampon"]);
    expect(sourcesServies(old.sources)!.map((c) => c.source)).toEqual([SOURCES.mairies.nom]);
  });

  it("give the communes' sports programmes on /sport and in the tool, with nothing said for a commune", async () => {
    expect(LISIBLES.filter((a) => a.programmes).map((a) => a.commune)).toEqual(["L'Étang-Salé", "La Possession", "Saint-Benoît"]);
    expect(LISIBLES.filter((a) => a.programmes).every((a) => AGENDAS.includes(a))).toBe(true);
    // The motor sport league answers; La Possession's programme in the questions' copy: served.
    vi.stubGlobal("fetch", async (url: string) => (url.includes("lsar") ? new Response(readFileSync(new URL("./fixtures/sport/lsar.json", import.meta.url))) : new Response("", { status: 503 })));
    const c = await cacheWith({ "agenda:la_possession": kept([{ ...event("Agenda sportif du 22 au 24 octobre", "La Possession"), seances: [{ debut: "2026-10-22", fin: "2026-10-26" }] }]) });
    const b = body(await sportTool(c, undefined, undefined, "a_venir", NOW));
    // For the whole island, Réunion La 1ère's sport news not read (test/la1ere.test.ts), then the sports sites not
    // read (test/non-reprises.test.ts): no commune.
    expect(b.non_repris).toBe(`${mentionLa1ere("sport")} ${mentionSports(undefined, true).join(" ")}`);
    expect(JSON.stringify(b.programmes_communes)).toContain("Agenda sportif du 22 au 24 octobre");
    const html = sportPage("https://rundata.re", { value: { ...b, classements: [] }, fetchedAt: NOW, stale: false }, NOW);
    const prog = html.slice(html.indexOf('id="h-prog"'), html.indexOf("</section>", html.indexOf('id="h-prog"')));
    expect(prog).toContain("Agenda sportif du 22 au 24 octobre");
    expect(prog).not.toContain('class="card np"');
    vi.unstubAllGlobals();
  });

  it("keep Sainte-Rose's events from elsewhere, without an agenda on its site; and Saint-Denis's and Saint-Pierre's news", () => {
    const value = { resume: "", nombre: 1, evenements: [{ titre: "Concert", date: "2026-10-25T20:00", quand: "dimanche 25/10 à 20:00", genres: [], commune: "Sainte-Rose", lien: "https://example.re", publie_par: "Office de tourisme" }], couverture: "", a_savoir: "", sources: [], ce_week_end: [] } as unknown as AgendaAnswer;
    expect(communeEvents(page("sainte-rose"), { value, fetchedAt: NOW, stale: false })).toMatchObject({ valeur: "1 événement" });
    for (const c of ["Saint-Denis", "Saint-Pierre"]) expect(LISIBLES.filter((a) => a.site_commune && a.commune === c), c).toHaveLength(1);
    expect(communeEvents(page("saint-pierre"), { value: { ...value, evenements: [] }, fetchedAt: NOW, stale: false })).toMatchObject({ valeur: "Rien d'annoncé" });
    expect(COUVERTURE).not.toContain("la page agenda de la mairie de Saint-Pierre est vide");
  });
});

describe("the notices of power cuts the mairies relay", () => {
  // Monday 26/10's notice of Sainte-Marie, and one of Cilaos.
  const post = (date: string, title: string, html: string) => ({ date, title: { rendered: title }, link: `https://example.org/${encodeURIComponent(title)}`, content: { rendered: html } });
  const sm = parsePosts([post("2026-10-21T10:00:00", "Avis de coupure d&rsquo;électricité", "<p>Travaux d'EDF Réunion sur le réseau.</p><p><strong>Le lundi 26 octobre de 9h00 à 15h00 :</strong></p><ul><li>Rue des Jésuites</li></ul>")], "Sainte-Marie");
  const ci = parsePosts([post("2026-10-21T14:33:00", "Travaux sur le réseau électrique à Cilaos", "<p>Du <strong>26 au 30 octobre 2026</strong>, travaux sur le réseau électrique à Mare Sèche.</p><p>Des coupures d'électricité ponctuelles sont possibles.</p>")], "Cilaos");
  const before: CourantAnswer = { avis: [...sm, ...ci], lues: ["Sainte-Marie", "Cilaos"], indisponibles: [], sources: [] };
  const copy = { value: before, fetchedAt: NOW, stale: false };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("are read from every mairie that relays them, Cilaos, Saint-Philippe and Sainte-Suzanne included", async () => {
    expect(TROIS.filter((c) => !MAIRIES.some((m) => m.commune === c))).toEqual([]);
    const names = MAIRIES.map((m) => m.commune);
    expect(COURANT.nom).toBe(`Avis de coupure d'électricité d'EDF Réunion relayés par les mairies (${names.join(", ")})`);
    expect(COURANT.licence).toBe("Information publique : seuls les faits (jours, heures, secteurs) sont repris, avec le lien de l'avis ; Saint-André : repris avec son accord écrit du 16/11/2026");
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (asked.push(String(url)), Response.json([])));
    expect((await coupures()).lues).toEqual(names);
    const hosts = new Set(asked.map((u) => new URL(u).hostname));
    for (const m of MAIRIES) expect(hosts.has(new URL(m.site).hostname), m.commune).toBe(true);
  });

  it("are said for the commune and the island, with an honesty line that names the mairies read", async () => {
    const cilaos = courantBlock(copy, "Cilaos", NOW);
    expect(cilaos.avis!.map((a) => a.commune)).toEqual(["Cilaos"]);
    expect(cilaos).not.toHaveProperty("non_repris");
    expect(courantBlock(copy, undefined, NOW).avis!.map((a) => a.commune).sort()).toEqual(["Cilaos", "Sainte-Marie"]);
    expect(honesty()).toMatch(/^EDF publie ses coupures pour travaux sur son site, mais ses mentions légales interdisent d'en reprendre le contenu sans son accord \(lues le 03\/11\/2026\)\. rundata.re reprend celles que relaient les mairies sur leurs sites : aujourd'hui [^.]*Cilaos[^.]*, quand leurs avis sont lisibles\. Les coupures pour travaux qu'EDF annonce dans toute l'île sont sur son site\s: https:\/\/reunion\.edf\.fr\/edf-a-la-reunion\/actualites-a-la-reunion\/infos-coupures-pour-travaux\.$/);
    const store = new MemoryStore();
    await store.put("web:courant", { value: before, fetchedAt: NOW.getTime() });
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new Cache(store, () => NOW.getTime());
    const one = body(await electricite(c, NOW, "Cilaos"));
    expect(one.coupures_annoncees.non_repris).toBeUndefined();
    expect(one.resume).not.toContain("non repris");
    expect(body(await electricite(c, NOW)).resume).not.toContain("non repris");
    const html = electricitePage("https://rundata.re", { value: { resume: "", avertissements: [], sources: [], coupures_annoncees: courantBlock(copy, undefined, NOW) }, fetchedAt: NOW, stale: false } as never, NOW);
    const section = html.slice(html.indexOf('id="coupures"'));
    expect(section).toContain("publié par la mairie de Cilaos le 21/10 : coupure programmée du lundi 26/10 au vendredi 30/10.");
    expect(section).not.toContain('class="np"');
  });
});
