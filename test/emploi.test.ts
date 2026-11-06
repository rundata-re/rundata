import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as emploiSource from "../src/providers/emploi.js";
import { REGISTRY } from "../src/registre.js";
import { emploi, lignes, NON_REPRIS, pourOutil, type OffreRow } from "../src/tools/emploi.js";
import { buildEmploi, emploiPage } from "../src/web/emploi.js";
import { esc } from "../src/web/map.js";

// The feed of La Réunion read on 29/10/2026 at 12:20, two offers' pages and the first search page read at 12:26-12:28,
// cut to what is read of them (and without the recruiters' names).
const fixture = (f: string) => readFileSync(new URL(`./fixtures/emploi/${f}`, import.meta.url), "utf8");
const FEED = fixture("flux.xml");
const CHU = fixture("offre-chu.html");
const DGAC = fixture("offre-dgac.html");
/** What the site answers for an offer it took down, after its redirect to /offre-depubliee/ (30/10/2026). */
const DEPUBLIEE = fixture("offre-depubliee.html");
/** An offer's page as the site serves it, whole: menus, forms and scripts (CHU, 29/10/2026). */
const CHU_COMPLETE = fixture("offre-chu-complete.html");
/** The site's search for La Réunion on 05/11/2026 at 04:23, cut: its head, its first filters, then its count. */
const RECHERCHE = fixture("recherche-compte.html");
// 12:45 in La Réunion.
const NOW = new Date("2026-10-29T08:45:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());

afterEach(() => {
  emploiSource.configure(undefined);
  vi.unstubAllGlobals();
});

/** The site as the Worker reads it: the feed, and each offer's page (the CHU's for the two without a place, the DGAC's for the others). */
function site(fiche: (ref: string) => string | undefined = (ref) => (ref.startsWith("2026-") ? CHU : DGAC), recherche: string | null = RECHERCHE) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const u = new URL(url);
    asked.push(u.hostname === "place-ep-recrute.talent-soft.com" ? "flux" : u.pathname.startsWith("/nos-offres/") ? "recherche" : decodeURIComponent(u.pathname.split("/")[2]));
    if (u.hostname === "place-ep-recrute.talent-soft.com") return new Response(FEED);
    if (u.pathname.startsWith("/nos-offres/")) return recherche === null ? new Response("", { status: 503 }) : new Response(recherche);
    const html = fiche(decodeURIComponent(u.pathname.split("/")[2]));
    return html === undefined ? new Response("", { status: 503 }) : new Response(html);
  });
  return asked;
}

/** The feed read at `at`, then one event every 5 minutes until no page is left to read: the copy written last. */
async function rempli(at = NOW, before: emploiSource.Copie | null = null) {
  let c = before;
  const write = async (x: emploiSource.Copie) => void (c = x);
  await emploiSource.collect(c, write, at, true);
  for (let k = 1; c!.offres.some((o) => emploiSource.enAttente(o)); k++) await emploiSource.collect(c, write, new Date(at.getTime() + k * 300_000), false);
  return c!;
}

describe("the public sector's offers of Choisir le service public", () => {
  it("reads the feed's offers: reference, title, field, job, nature, place, a commune only when named exactly", () => {
    const f = emploiSource.parseFeed(FEED);
    expect(f).toHaveLength(20);
    expect(f[0]).toEqual({
      ref: "2026-2416372",
      intitule: "Assistant(e) de direction",
      lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/2026-2416372/",
      domaine: "Direction et pilotage des politiques publiques",
      metier: "Assistante / Assistant de direction",
      nature: "Emploi ouvert aux titulaires et aux contractuels",
      publiee: "2026-10-29T08:20:31.000Z",
    });
    // The tracking of the feed's links taken out.
    expect(f.every((o) => !o.lien.includes("tracking"))).toBe(true);
    // A CEDEX of Saint-Denis, 97408, which is La Possession's INSEE code: the commune from the name, never the code.
    expect(f[1]).toMatchObject({ ref: "DGAC-AVE-128697-CAT-B", lieu: "97408-ST DENIS CEDEX 9", commune: "Saint-Denis" });
    expect(f.filter((o) => o.commune === "Sainte-Marie")).toHaveLength(12);
    expect(f.filter((o) => !o.lieu).map((o) => o.ref)).toEqual(["2026-2416372", "2026-2454752"]);
    expect(["97460-ST PAUL", "97434-ST GILLES LES BAINS", "CHU SITES SUD", "", undefined].map(emploiSource.communeDe)).toEqual(["Saint-Paul", "Saint-Paul", undefined, undefined, undefined]);
  });

  it("finds an address's commune from La Poste's postcode, the name after it the same, never from a CEDEX", () => {
    // Places read on the offers' pages on 29/10/2026.
    expect(["24 avenue Georges Brassens 97400 Saint-Denis", "27 rue Félix Guyon 97400 St-Denis", "Rue LA BOURDONNAIS 97400 ILE DE LA REUNION", "Rue X, 97430 Le Tampon, La Réunion"].map(emploiSource.communeDe)).toEqual(["Saint-Denis", "Saint-Denis", "Saint-Denis", "Le Tampon"]);
    // 97411: Saint-Paul's postcode, Saint-Denis's INSEE code.
    expect(emploiSource.communeDe("Rue X 97411")).toBe("Saint-Paul");
    // A name that is not the postcode's commune, a CEDEX, a code out of La Poste's: none.
    expect(["Rue X 97400 Saint-Paul", "Rue X 97400 Paris", "BP 123 97408 SAINT DENIS", "Rue X 97400 SAINT DENIS CEDEX", "Réunion (974), France"].map(emploiSource.communeDe)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    // « SAINT CLOTILDE »: Sainte-Clotilde, in Saint-Denis.
    expect(emploiSource.communeDe("SAINT CLOTILDE")).toBe("Saint-Denis");
  });

  it("reads an offer's page for its employer, closing date, place and nature", () => {
    expect(emploiSource.parseFiche(CHU)).toEqual({ employeur: "Centre Hospitalier Universitaire de la Réunion", limite: "2026-11-10", lieu: "CHU SITES SUD", nature: "Emploi ouvert aux titulaires et aux contractuels" });
    // The service under its employer, after a <br />, as the page writes them.
    expect(emploiSource.parseFiche(DGAC).employeur).toBe("Direction Générale de l'Aviation Civile (DGAC), Service navigation aérienne Océan Indien (SNA/OI)");
    expect(emploiSource.parseFiche("<html></html>")).toEqual({});
  });

  it("reads a search page's offers: reference, title, field, employer and day, with the page's own link", () => {
    const r = emploiSource.parseRecherche(fixture("recherche.html"));
    expect(r).toHaveLength(20);
    expect(r[0]).toEqual({
      ref: "2026-2454752",
      intitule: "ASSISTANT DE SERVICE SOCIAL INSTITUT MEDICAL LEGAL 50%",
      lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/assistant-de-service-social-institut-medical-legal-50-reference-2026-2454752/",
      domaine: "Social, enfance et famille",
      employeur: "Centre Hospitalier Universitaire de la Réunion",
      // « En ligne depuis le 29 octobre 2026 »: midnight at La Réunion.
      publiee: "2026-10-28T20:00:00.000Z",
    });
    expect(r.filter((o) => o.ref.startsWith("O974"))).toHaveLength(16);
  });

  it("keeps an offer until its closing date, else 31 days after it was published, and while its page is not read", () => {
    const o = { ref: "x", intitule: "x", lien: "x", publiee: "2026-10-01T06:00:00Z", fiche: "lue" as const };
    // Listed by the site's search, its page not read yet: open, whatever its age; read once more at the next pass, too.
    for (const fiche of [undefined, "relire" as const]) expect(emploiSource.ouverte({ ...o, fiche }, new Date("2026-12-01T00:00:00Z"))).toBe(true);
    expect(emploiSource.ouverte({ ...o, fiche: "abandon" }, new Date("2026-11-01T06:00:01Z"))).toBe(false);
    expect(emploiSource.ouverte(o, new Date("2026-11-01T05:00:00Z"))).toBe(true);
    expect(emploiSource.ouverte(o, new Date("2026-11-01T06:00:01Z"))).toBe(false);
    // The closing day included, at La Réunion: 10/11 until 23:59 there (19:59 UTC).
    expect(emploiSource.ouverte({ ...o, limite: "2026-11-10" }, new Date("2026-11-10T19:59:00Z"))).toBe(true);
    expect(emploiSource.ouverte({ ...o, limite: "2026-11-10" }, new Date("2026-11-10T20:00:00Z"))).toBe(false);
  });

  it("reads the feed and the site's count at 25 past, one offer's page at the other events, the newest not read yet, then each in turn, and writes what changed and each read of the feed", async () => {
    const asked = site();
    const writes: emploiSource.Copie[] = [];
    const write = async (c: emploiSource.Copie) => void writes.push(c);
    const { value, used } = await counted(100, () => emploiSource.collect(null, write, NOW, true));
    expect(value).toBe("20 offres, 20 nouvelles, 628 offres dans la recherche du site : écrites");
    // The feed and the site's search in place of an offer's page: never two pages at once on the site; the registry's,
    // besides the copy read and written.
    expect(asked).toEqual(["flux", "recherche"]);
    expect(used).toBe(2);
    const run = (id: string) => REGISTRY.find((e) => e.id === id)!.run.subrequests;
    expect(run("emploi:flux") + run("emploi:offres") + run("emploi:total") - 2).toBe(used);
    expect(writes[0].total).toEqual({ nombre: 628, lu: NOW.toISOString() });
    expect(writes[0].offres.filter((o) => o.fiche === "lue")).toHaveLength(0);

    // The next events, without the feed: one page each, the newest not read yet, until all are.
    for (let k = 1; k <= 20; k++) {
      asked.length = 0;
      await emploiSource.collect(writes.at(-1)!, write, new Date(NOW.getTime() + k * 300_000), false);
      expect(asked).toHaveLength(1);
      // Newest first.
      if (k === 1) expect(writes.at(-1)!.offres[0]).toMatchObject({ ref: "2026-2416372", fiche: "lue" });
    }
    const c = writes.at(-1)!;
    expect(writes).toHaveLength(21);
    expect(c.total).toEqual({ nombre: 628, lu: NOW.toISOString() });
    expect(c.lu).toBe(NOW.toISOString());
    expect(c.offres.every((o) => o.fiche === "lue")).toBe(true);
    expect(c.offres.find((o) => o.ref === "2026-2454752")).toMatchObject({ employeur: "Centre Hospitalier Universitaire de la Réunion", limite: "2026-11-10", lieu: "CHU SITES SUD" });
    expect(c.offres.find((o) => o.ref === "2026-2454752")).not.toHaveProperty("commune");

    // Then each open offer in turn, by the event's slot, nothing written while the page says the same.
    const turn = (k: number) => emploiSource.prochaineFiche(c.offres, new Date(NOW.getTime() + k * 300_000))!.ref;
    expect(new Set(Array.from({ length: 20 }, (_, k) => turn(20 + k))).size).toBe(20);
    asked.length = 0;
    const later = new Date(NOW.getTime() + 3600_000);
    // The feed read again, the same offers: written again, with the time of this read (31/10/2026: « dernière lecture
    // le 30/10 à 16:25 » for a feed read every hour).
    expect(await emploiSource.collect(c, write, later, true)).toBe("20 offres, 0 nouvelles, 628 offres dans la recherche du site : écrites");
    expect(asked).toEqual(["flux", "recherche"]);
    expect(writes).toHaveLength(22);
    expect(writes.at(-1)).toEqual({ lu: later.toISOString(), offres: c.offres, total: { nombre: 628, lu: later.toISOString() } });
    // The same offers without a read of the feed: not written.
    const after = new Date(later.getTime() + 300_000);
    expect(await emploiSource.collect(writes.at(-1)!, write, after, false)).toMatch(/: inchangées, non réécrites$/);
    expect(writes).toHaveLength(22);
    // A store still empty between two feeds: nothing read.
    expect(await emploiSource.collect(null, write, later, false)).toBe("aucune copie, flux lu à la prochaine heure");

    const at = (min: number) => emploiSource.refreshDue(new Date(Date.UTC(2026, 9, 29, 8, min)));
    expect([0, 24, 25, 29, 30].map(at)).toEqual([false, false, true, true, false]);
  });

  it("fills in a commune when an offer read again has a place it did not know", async () => {
    site();
    const o: emploiSource.Offre = { ref: "DGAC-AVE-128697-CAT-A", intitule: "x", lien: emploiSource.lienDe("DGAC-AVE-128697-CAT-A"), publiee: "2026-10-29T06:00:00Z", lieu: "27 rue Félix Guyon 97400 St-Denis", limite: "2026-11-20", fiche: "lue" };
    let c: emploiSource.Copie | undefined;
    await emploiSource.collect({ lu: NOW.toISOString(), offres: [o] }, async (x) => void (c = x), NOW, false);
    expect(c!.offres[0]).toMatchObject({ lieu: "27 rue Félix Guyon 97400 St-Denis", commune: "Saint-Denis" });
  });

  it("drops at once an offer the site took down, open as it was, and says so", async () => {
    expect([DEPUBLIEE, CHU, DGAC].map(emploiSource.depubliee)).toEqual([true, false, false]);
    site(() => DEPUBLIEE);
    const o: emploiSource.Offre = { ref: "DGAC-AVE-128697-CAT-A", intitule: "x", lien: emploiSource.lienDe("DGAC-AVE-128697-CAT-A"), publiee: "2026-10-29T06:00:00Z", employeur: "DGAC", limite: "2026-11-20", fiche: "lue" };
    let c: emploiSource.Copie | undefined;
    expect(await emploiSource.collect({ lu: NOW.toISOString(), offres: [o] }, async (x) => void (c = x), NOW, false)).toBe("0 offres, flux non lu, offre DGAC-AVE-128697-CAT-A dépubliée, retirée : écrites");
    expect(c!.offres).toEqual([]);
    expect(c!.depubliees).toEqual([NOW.toISOString()]);
  });

  it("takes an offer's page for a page taken down by its canonical link or its sentence only, never by a link elsewhere", () => {
    expect(emploiSource.depubliee(CHU_COMPLETE)).toBe(false);
    // The same whole page with a link to /offre-depubliee/ in its menu: still an open offer.
    const menu = CHU_COMPLETE.replace("<main", '<nav><a href="https://choisirleservicepublic.gouv.fr/offre-depubliee/">Offre dépubliée</a></nav><main');
    expect(menu).not.toBe(CHU_COMPLETE);
    expect(emploiSource.depubliee(menu)).toBe(false);
    const canonical = DEPUBLIEE.slice(0, DEPUBLIEE.indexOf("\n"));
    expect(canonical).toContain('rel="canonical"');
    expect(emploiSource.depubliee(canonical)).toBe(true);
    expect(emploiSource.depubliee(DEPUBLIEE.slice(DEPUBLIEE.indexOf("\n")))).toBe(true);
  });

  it("says in the event's line more than 3 offers taken down within an hour, and forgets those older", async () => {
    site(() => DEPUBLIEE);
    const o = (ref: string): emploiSource.Offre => ({ ref, intitule: "x", lien: emploiSource.lienDe(ref), publiee: "2026-10-29T06:00:00Z", limite: "2026-11-20", fiche: "lue" });
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
    let c: emploiSource.Copie | undefined;
    const write = async (x: emploiSource.Copie) => void (c = x);
    // Two within the hour, one older: the third said without a warning.
    expect(await emploiSource.collect({ lu: NOW.toISOString(), offres: [o("DGAC-1")], depubliees: [at(61), at(40), at(20)] }, write, NOW, false)).toBe("0 offres, flux non lu, offre DGAC-1 dépubliée, retirée : écrites");
    expect(c!.depubliees).toEqual([at(40), at(20), NOW.toISOString()]);
    const later = new Date(NOW.getTime() + 300_000);
    expect(await emploiSource.collect({ ...c!, offres: [o("DGAC-2")] }, write, later, false)).toBe("0 offres, flux non lu, offre DGAC-2 dépubliée, retirée (4 dépubliées en une heure, à vérifier) : écrites");
    // Kept by the feed's hourly write.
    site((ref) => (ref.startsWith("2026-") ? CHU : DGAC));
    await emploiSource.collect(c!, write, new Date(NOW.getTime() + 600_000), true);
    expect(c!.depubliees).toHaveLength(4);
  });

  it("logs a feed all new, and tries a silent offer's page once more, then keeps its 31 days", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const before: emploiSource.Copie = { lu: "2026-10-29T07:25:00Z", offres: [{ ref: "2026-1", intitule: "Ancienne", lien: emploiSource.lienDe("2026-1"), publiee: "2026-10-20T06:00:00Z", fiche: "lue" }] };
    site((ref) => (ref === "2026-2454752" ? undefined : ref.startsWith("2026-") ? CHU : DGAC));
    const c = await rempli(NOW, before);
    expect(log).toHaveBeenCalledWith("offres d'emploi : 20 nouvelles références sur 20 dans le flux, des offres ont pu passer entre deux lectures");
    expect(c.offres).toHaveLength(21);
    // Silent twice, at two events in a row: given up, and not read again until its turn among the read ones.
    expect(c.offres.find((o) => o.ref === "2026-2454752")!.fiche).toBe("abandon");
    expect(c.offres.filter((o) => o.fiche === "lue")).toHaveLength(20);
    log.mockRestore();
  });

  it("keeps the copy when the feed does not answer, with when it first failed, written once", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    const before: emploiSource.Copie = { lu: "2026-10-29T07:25:00Z", offres: [] };
    const writes: emploiSource.Copie[] = [];
    const write = async (c: emploiSource.Copie) => void writes.push(c);
    await expect(emploiSource.collect(before, write, NOW, true)).rejects.toThrow("HTTP 503");
    expect(writes).toEqual([{ ...before, echec: NOW.toISOString() }]);
    await expect(emploiSource.collect(writes[0], write, NOW, true)).rejects.toThrow("HTTP 503");
    expect(writes).toHaveLength(1);
  });
});

describe("the tool emploi and the page /emploi", () => {
  async function copie(): Promise<emploiSource.Copie> {
    site();
    const c = await rempli();
    vi.unstubAllGlobals();
    return c;
  }

  it("keeps the site's count when its search does not answer or no longer holds it, says it a day, and the island's only", async () => {
    const c = await copie();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const later = new Date(NOW.getTime() + 3600_000);
    let after: emploiSource.Copie | undefined;
    site(undefined, null);
    expect(await emploiSource.collect(c, async (x) => void (after = x), later, true)).toBe("20 offres, 0 nouvelles, recherche du site sans réponse : écrites");
    expect(after!.total).toEqual({ nombre: 628, lu: NOW.toISOString() });
    site(undefined, "<p>la recherche, sans son compte</p>");
    expect(await emploiSource.collect(c, async (x) => void (after = x), later, true)).toBe("20 offres, 0 nouvelles, compte du site introuvable : écrites");
    expect(after!.total).toEqual({ nombre: 628, lu: NOW.toISOString() });
    expect(log).toHaveBeenCalledWith("offres d'emploi : le compte de la recherche du site est introuvable dans sa page");
    vi.unstubAllGlobals();

    // The count of the hour before, said with its time, on the page too.
    emploiSource.configure(async () => after!);
    const r = body(await emploi(cache(), undefined, undefined, later));
    expect(r.resume).toContain(", qui en affiche 628 pour La Réunion (compte lu le 29/10 à 12:45), la plus récente");
    const page = emploiPage("https://rundata.re", await buildEmploi(cache(), later).then((value) => ({ value, fetchedAt: later, stale: false })), later);
    expect(page).toContain("dernière lecture le 29/10 à 13:45. Le site en affiche 628 pour La Réunion (compte lu le 29/10 à 12:45).</p>");
    // Not a commune's nor a search's.
    expect(body(await emploi(cache(), "Saint-Pierre", undefined, later))).not.toHaveProperty("total_site");
    expect(body(await emploi(cache(), undefined, "infirmier", later)).resume).not.toContain("en affiche");
    // A day after its read: no more said.
    const lendemain = new Date(NOW.getTime() + 24 * 3600_000 + 60_000);
    emploiSource.configure(async () => ({ ...after!, lu: lendemain.toISOString() }));
    const old = body(await emploi(cache(), undefined, undefined, lendemain));
    expect(old).not.toHaveProperty("total_site");
    expect(old.couverture).toContain("le site peut en compter davantage, sa recherche fait foi pour le total.");
    // No more than the offers followed here: not « davantage ».
    emploiSource.configure(async () => ({ ...after!, total: { nombre: 20, lu: later.toISOString() } }));
    expect(body(await emploi(cache(), undefined, undefined, later)).couverture).toContain("le site en affiche 20, compte lu le 29/10 à 13:45\u00a0; sa recherche fait foi pour le total.");
    log.mockRestore();
  });

  it("gives the island's offers newest first, each with its link, one line for a post published under several references, and says what is not taken", async () => {
    const c = await copie();
    emploiSource.configure(async () => c);
    const r = body(await emploi(cache(), undefined, undefined, NOW));
    expect(r.resume).toBe("20 offres ouvertes à la candidature à La Réunion, suivies par rundata.re sur Choisir le service public, qui en affiche 628 pour La Réunion (compte lu le 29/10 à 12:45), la plus récente publiée le 29/10 : Assistant(e) de direction.");
    expect(r.total_site).toEqual({ nombre: 628, lu_a: "29/10 12:45", lien: emploiSource.SOURCE.url });
    expect(r.couverture).toContain("le site en affiche davantage (628, compte lu le 29/10 à 12:45)\u00a0: sa recherche fait foi pour le total.");
    expect(r.offres[1]).toEqual({
      intitule: "Adjoint au chef de division*K-OI/EXPL",
      employeur: "Direction Générale de l'Aviation Civile (DGAC), Service navigation aérienne Océan Indien (SNA/OI)",
      commune: "Saint-Denis",
      metier: "Responsable sectorielle / sectoriel",
      publiee_le: "29/10",
      date_limite: "20/11",
      nombre_offres: 2,
      // Each reference by its link, which holds its number, on the line's day.
      references: [{ lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/DGAC-AVE-128697-CAT-A/" }, { lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/DGAC-AVE-128697-CAT-B/" }],
    });
    // The nature every line shares, said once.
    expect(r.nature).toBe("ouvert aux titulaires et contractuels, sauf mention à l'offre");
    expect(r.offres.some((o: object) => "nature" in o)).toBe(false);
    // Every offer once: in a line of its own or among a line's references.
    const refs = r.offres.flatMap((o: { lien?: string; references?: { lien: string }[] }) => o.references?.map((x) => x.lien) ?? [o.lien]);
    expect(refs).toHaveLength(20);
    expect(r.offres.length).toBeLessThan(20);
    expect(r.non_repris).toBe(NON_REPRIS);
    expect(r.entreprises).toContain("https://www.francetravail.fr/accueil/");
    expect(JSON.stringify(r)).not.toMatch(/refuse|hellowork\.com|apec\.fr/i);
    expect(r.sources[0].licence).toBe("Licence Ouverte Etalab 2.0");
  });

  it("filters by commune and by words, and counts the offers that name no commune", async () => {
    const c = await copie();
    emploiSource.configure(async () => c);
    const marie = body(await emploi(cache(), "Sainte-Marie", undefined, NOW));
    expect(marie.nombre).toBe(12);
    expect(marie.resume).toContain("12 offres ouvertes à la candidature à Sainte-Marie");
    expect(marie.resume).toContain("2 autres offres de La Réunion ne précisent pas leur commune.");
    const words = body(await emploi(cache(), undefined, "gestionnaire finances", NOW));
    // Four offers, one line: the site's references, one per category and per post.
    expect(words.nombre).toBe(4);
    expect(words.offres).toHaveLength(1);
    expect(words.offres[0]).toMatchObject({ intitule: "Gestionnaire finances*SG/SIR/OI/FIN", nombre_offres: 4 });
    expect(words.offres[0].references.map((x: { lien: string }) => x.lien.split("/").at(-2))).toEqual(["DGAC-AVE-128051-CAT-B", "DGAC-AVE-128051-CAT-C", "DGAC-AVE-128096-CAT-B", "DGAC-AVE-128096-CAT-C"]);
    // One line: its nature on it, none said once.
    expect(words).not.toHaveProperty("nature");
    expect(words.offres[0].nature).toBe("ouvert aux titulaires et contractuels");
    expect(words.offres[0]).not.toHaveProperty("lien");
    expect(body(await emploi(cache(), "Nulle-Part-Ici", undefined, NOW)).erreur).toBeDefined();
  });

  it("says the site's silence with the time of the offers shown", async () => {
    const c = await copie();
    emploiSource.configure(async () => ({ ...c, echec: "2026-10-29T08:25:00Z" }));
    expect(body(await emploi(cache(), undefined, undefined, NOW)).injoignable).toBe("Lu le 29/10 à 12:45 : le site de Choisir le service public n'a pas répondu depuis. Ce qui suit peut avoir changé : voir son site.");
  });

  it("shows on /emploi the first offer under the title, its employer first and its closing date, without a link to the sites not taken", async () => {
    const c = await copie();
    emploiSource.configure(async () => c);
    const d = await buildEmploi(cache(), NOW);
    // The page's copy built 4 minutes after the feed's read: the feed's time is said.
    const page = emploiPage("https://rundata.re", { value: d, fetchedAt: new Date(Date.parse(c.lu) + 4 * 60_000), stale: false }, NOW);
    expect(page).toContain("<h1>Offres d'emploi public à La Réunion <span class=\"n974\">974</span></h1>");
    expect(page).toContain("20 offres ouvertes à la candidature suivies par rundata.re sur Choisir le service public, dernière lecture le 29/10 à 12:45. Le site en affiche 628 pour La Réunion.</p>");
    const first = page.indexOf('<div id="offres" class="plis">');
    expect(first).toBeGreaterThan(page.indexOf("</h1>"));
    expect(page).toContain('<small>Direction Générale de l&#39;Aviation Civile (DGAC), Service navigation aérienne Océan Indien (SNA/OI) · Responsable sectorielle / sectoriel</small></span><span class="q-none">jusqu&#39;au 20/11</span>');
    expect(page).toContain("· Assistante / Assistant de direction</small>");
    expect(page).toContain("<p>Sauf mention, les offres sont ouvertes aux titulaires et aux contractuels.</p>");
    expect(page).toContain("<option>Sainte-Marie</option>");
    expect(page).not.toMatch(/href="https?:\/\/[^"]*(hellowork|meteojob|domtomjob|apec|indeed|linkedin|leboncoin|jooble)/i);
    expect(page).toContain('<a href="https://monemploi-lareunion.francetravail.fr/" rel="noopener">Mon emploi la Réunion</a>');
    // Empty: marketing's sentence, with the hour.
    const none = emploiPage("https://rundata.re", { value: { ...d, nombre: 0, offres: [] }, fetchedAt: NOW, stale: false }, NOW);
    expect(none).toContain("Aucune offre publiée sur Choisir le service public pour La Réunion le 29/10 à 12:45.");
  });

  it("says once in the tool the nature most lines share, and only the others on their line, the page keeping each", async () => {
    const line = (intitule: string, nature?: string): OffreRow => ({ intitule, ...(nature ? { nature } : {}), publiee_le: "29/10", lien: `https://choisirleservicepublic.gouv.fr/offre-emploi/${intitule}/` });
    const ouvert = "Emploi ouvert aux titulaires et aux contractuels";
    const reserve = "Emploi réservé aux fonctionnaires et lauréats d’un concours territorial";
    // One line apart: it says its own, in short; the others none.
    const one = pourOutil([line("A", ouvert), line("B", reserve), line("C", ouvert)]);
    expect(one.nature).toBe("ouvert aux titulaires et contractuels, sauf mention à l'offre");
    expect(one.offres.map((o) => (o as { nature?: string }).nature)).toEqual([undefined, "réservé aux fonctionnaires et lauréats de concours", undefined]);
    // Any other nature as the site writes it, said once too.
    expect(pourOutil([line("A", "Emploi ouvert aux contractuels"), line("B", "Emploi ouvert aux contractuels")]).nature).toBe("Emploi ouvert aux contractuels, sauf mention à l'offre");
    // Nothing said once: a single line, no nature shared by more than half, or a line without one.
    for (const rows of [[line("A", ouvert)], [line("A", ouvert), line("B", reserve)], [line("A", ouvert), line("B", ouvert), line("C", reserve), line("D", "Autre")], [line("A", ouvert), line("B", ouvert), line("C")]]) {
      const r = pourOutil(rows);
      expect(r).not.toHaveProperty("nature");
      expect(r.offres.map((o) => (o as { nature?: string }).nature)).toEqual(rows.map((x) => (x.nature ? (x.nature === ouvert ? "ouvert aux titulaires et contractuels" : x.nature === reserve ? "réservé aux fonctionnaires et lauréats de concours" : x.nature) : undefined)));
    }
    // A reference whose link does not hold its number keeps it, and its day when the line has none.
    const refs = pourOutil([{ intitule: "X", nature: ouvert, nombre_offres: 2, references: [{ reference: "R-1", publiee_le: "28/10", lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/R-1/" }, { reference: "R-2", publiee_le: "29/10", lien: "https://choisirleservicepublic.gouv.fr/autre/" }] }]);
    expect((refs.offres[0] as { references: unknown }).references).toEqual([{ publiee_le: "28/10", lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/R-1/" }, { reference: "R-2", publiee_le: "29/10", lien: "https://choisirleservicepublic.gouv.fr/autre/" }]);
    // The page lists every line whole: nature and references as the site writes them.
    const c = await copie();
    emploiSource.configure(async () => c);
    const page = body(await emploi(cache(), undefined, undefined, NOW, Infinity));
    expect(page).not.toHaveProperty("nature");
    expect(page.offres.every((o: { nature?: string }) => o.nature === ouvert)).toBe(true);
    expect(page.offres.find((o: { references?: { reference: string }[] }) => o.references)!.references[0]).toHaveProperty("reference");
  });

  it("folds the offers by commune on /emploi, the most first, and keeps on its line any nature but the one said once", () => {
    const ouvert = "Emploi ouvert aux titulaires et aux contractuels";
    const natures = ["Emploi ouvert uniquement aux contractuels", "Emploi réservé aux fonctionnaires et lauréats d’un concours territorial"];
    const line = (intitule: string, commune?: string, nature?: string): OffreRow => ({ intitule, employeur: "Communes", ...(commune ? { commune } : {}), ...(nature ? { nature } : {}), publiee_le: "29/10", lien: `https://choisirleservicepublic.gouv.fr/offre-emploi/${intitule}/` });
    const rows = [line("A", "Saint-Denis", ouvert), line("B", "Le Port", natures[1]), line("C", undefined, ouvert), line("D", "Saint-Denis", natures[0]), line("E", "Bras-Panon", ouvert)];
    const page = (offres: OffreRow[]) => emploiPage("https://rundata.re", { value: { nombre: offres.length, offres, lu: NOW.toISOString(), couverture: "", sources: [] } as never, fetchedAt: NOW, stale: false }, NOW);
    const html = page(rows);
    expect(html).toContain("<p>Sauf mention, les offres sont ouvertes aux titulaires et aux contractuels.</p>");
    // Each other nature as the site writes it, on its line; the one said once on none.
    for (const n of natures) expect(html).toContain(`<small>Communes · ${esc(n)}</small>`);
    expect(html.match(/<small>Communes<\/small>/g)).toHaveLength(3);
    expect(html).not.toContain(`· ${ouvert}`);
    // By commune, the most offers first, then the alphabet, those without a commune last; folded, the commune not on the line.
    const heads = [...html.matchAll(/<summary><h3>([^<]+)\u00a0<span class="note">·\u00a0([^<]+)<\/span><\/h3><\/summary>/g)].map((m) => `${m[1]} · ${m[2]}`);
    expect(heads).toEqual(["Saint-Denis · 2\u00a0offres", "Bras-Panon · 1\u00a0offre", "Le Port · 1\u00a0offre", "Commune non précisée · 1\u00a0offre"]);
    expect(html).not.toMatch(/<details open/);
    expect(html).not.toContain("commune non précisée");
    // A line without a nature: nothing said once, every nature on its line.
    const without = page([...rows, line("F", "Saint-Paul")]);
    expect(without).not.toContain("Sauf mention");
    expect(without.match(new RegExp(`<small>Communes · ${ouvert}</small>`, "g"))).toHaveLength(3);
    // The filter opens the groups it finds and hides the others.
    expect(html).toContain('g.hidden=on&&!k;g.firstElementChild.open=on&&k');
  });

  it("shows a post published under several references as one line, a link to each, the days of each when the line has no closing date", async () => {
    const c = await copie();
    emploiSource.configure(async () => c);
    const d = await buildEmploi(cache(), NOW);
    const page = emploiPage("https://rundata.re", { value: d, fetchedAt: new Date(c.lu), stale: false }, NOW);
    // In marketing's words: the title alone, « 4 offres : », a link per line with the whole reference.
    // Across the whole line, under the date, each reference never cut.
    expect(page).toContain('<li data-c="Sainte-Marie" data-n="4"><span><b>Gestionnaire finances*SG/SIR/OI/FIN</b><small>');
    expect(page).toContain('<span class="q-none">jusqu&#39;au 20/11</span><span class="refs"><small>4 offres\u00a0:</small><a href="https://choisirleservicepublic.gouv.fr/offre-emploi/DGAC-AVE-128051-CAT-B/" rel="noopener">Réf. <span class="nw">DGAC-AVE-128051-CAT-B</span></a><a href=');
    expect(page.match(/<li /g)!.length).toBeLessThan(20);
    // The filter counts the offers, not the lines.
    expect(page).toContain("+e.dataset.n||1");
    // Without a closing date, three offers published on three days: each says its own, the line the first and the last.
    const o = (ref: string, publiee: string): emploiSource.Offre => ({ ref, intitule: "AGENT D'ENTRETIEN", lien: emploiSource.lienDe(ref), publiee, employeur: "Département", domaine: "Intervention technique et logistique" });
    const offres = [o("O974261020000001", "2026-10-20T06:00:00Z"), o("O974261008000002", "2026-10-08T06:00:00Z"), o("O974261002000003", "2026-10-02T06:00:00Z")];
    const [line] = lignes(offres);
    expect(line).not.toHaveProperty("publiee_le");
    const html = emploiPage("https://rundata.re", { value: { ...d, nombre: 3, offres: [line] }, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain('rel="noopener">Réf. <span class="nw">O974261008000002</span>, publiée\u00a0le\u00a008/10</a>');
    expect(html).toContain('<span class="q-none du">publiées du 02/10 au 20/10</span>');
    // The same day for all: said once, at the right, as for one offer.
    const same = lignes(offres.map((x) => ({ ...x, publiee: "2026-10-08T06:00:00Z" })))[0];
    const html2 = emploiPage("https://rundata.re", { value: { ...d, nombre: 3, offres: [same] }, fetchedAt: NOW, stale: false }, NOW);
    expect(html2).toContain('rel="noopener">Réf. <span class="nw">O974261008000002</span></a>');
    expect(html2).toContain('<span class="q-none">publiée le 08/10</span>');
    // A closing date apart, or another place: two lines.
    expect(lignes([offres[0], { ...offres[1], limite: "2026-11-20" }])).toHaveLength(2);
    expect(lignes([offres[0], { ...offres[1], commune: "Saint-Paul" }])).toHaveLength(2);
  });

  it("lists the tool's lines up to its maximum, and counts the offers left", async () => {
    const c = await copie();
    emploiSource.configure(async () => c);
    const r = body(await emploi(cache(), undefined, "gestionnaire finances", NOW, 1));
    expect(r.autres).toBeUndefined();
    const all = body(await emploi(cache(), undefined, undefined, NOW, 1));
    const first = all.offres[0].nombre_offres ?? 1;
    expect(all.autres).toBe(`${20 - first} autres offres, sur ${emploiSource.SOURCE.url}`);
  });

  it("asks the store again for a copy read before the last event's write, every 5 minutes", async () => {
    // Two minutes after each event of 5 minutes: 12:47, 12:52…
    expect(emploiSource.fraicheur(new Date("2026-10-29T08:48:00Z"))).toBe(60);
    expect(emploiSource.fraicheur(new Date("2026-10-29T08:46:59Z"))).toBe(299);
    expect(emploiSource.fraicheur(new Date("2026-10-29T08:47:00Z"))).toBe(1);
    const c = await copie();
    let stored = c;
    emploiSource.configure(async () => stored);
    let t = new Date("2026-10-29T08:45:30Z");
    const store = new Cache(new MemoryStore(), () => t.getTime());
    expect((await emploiSource.offres(store, t))!.value.offres).toHaveLength(c.offres.length);
    // An offer's page read at 12:50 changed the copy: shown at 12:53, not an hour later.
    stored = { ...c, offres: c.offres.slice(1) };
    t = new Date("2026-10-29T08:53:00Z");
    expect((await emploiSource.offres(store, t))!.value.offres).toHaveLength(c.offres.length - 1);
  });

  it("says when the offers are read next while the store has none, without a reading time", async () => {
    emploiSource.configure(async () => null);
    const d = await buildEmploi(cache(), NOW);
    expect(d).toMatchObject({ nombre: 0, offres: [], prochaine: "2026-10-29T09:25:00.000Z" });
    const page = emploiPage("https://rundata.re", { value: d, fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain('<p class="card">Les offres ne sont pas encore lues : prochaine lecture prévue à 13:25.</p>');
    expect(page).not.toContain("dernière lecture");
    // At 25 past, the read under way is not said: the next one is.
    expect(emploiSource.prochaineLecture(new Date("2026-10-29T09:25:00Z")).toISOString()).toBe("2026-10-29T10:25:00.000Z");
    expect(emploiSource.prochaineLecture(new Date("2026-10-29T09:24:59Z")).toISOString()).toBe("2026-10-29T09:25:00.000Z");
  });
});
