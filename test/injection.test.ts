import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as transit from "../src/providers/transit.js";
import { findStops, stopPageDepartures } from "../src/tools/transports.js";
import { searchPage, stopPage } from "../src/web/arret.js";
import { Cache, type Cached, MemoryStore } from "../src/cache.js";
import { type ActualitesAnswer, type AgendaAnswer, buildSecheresse, type ElectriciteAnswer } from "../src/web/data.js";
import { agendaPage } from "../src/web/agenda.js";
import { actualitesPage, coupuresPage, courantItem, electriciteCommune, noticeCard, secheressePage } from "../src/web/domains.js";
import { concertsPage, weekendPage } from "../src/web/evenements.js";
import { pointsSvg } from "../src/web/evenements-carte.js";
import { type Fiche, fichePage, fichePassee } from "../src/web/fiche-evenement.js";
import { layout } from "../src/web/pages.js";
import { vigilancePage } from "../src/web/vigilance-page.js";
import * as mf from "../src/providers/vigilance.js";
import { coupuresCommunePage } from "../src/web/coupures.js";
import { pageOf, PAGES } from "../src/web/places.js";
import type { Evenement } from "../src/providers/agenda.js";
import type { Communique } from "../src/providers/tco-communiques.js";
import { resume, type Resume } from "../src/tools/resume.js";
import { annuaireSection, associationsPage } from "../src/web/associations.js";
import { gererPage } from "../src/web/propositions.js";
import type { Ligne } from "../src/propositions.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import { collectePage } from "../src/web/collecte.js";
import { decheteriesPage } from "../src/web/decheteries.js";
import { lienNom } from "../src/web/domains.js";
import { sportPage } from "../src/web/sport.js";
import type { SportAnswer } from "../src/web/data.js";
import { bases } from "./contexte.js";
const donnerTransit = (d?: transit.TransitDb) => bases({ transit: d });

/**
 * The pages that show a text read elsewhere (an event's title, a headline, a stop's name), rendered with that text set
 * to a trap: none of it may come out as a tag or leave its attribute. They escape it by hand today (map.ts `esc`); the
 * pages moved to `html\`…\`` (web/html.ts) keep this test, and each page moved adds its case here.
 */
const PIEGE = `Fête <script>alert(1)</script><img src=x onerror=alert(2)> "du" l'île & co`;
/** The trap as it shows once escaped, between tags or in an attribute. */
const ECHAPPE = "Fête &lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt; &quot;du&quot; l&#39;île &amp; co";

/** `v` with the texts under the keys `cles` replaced by the trap, at every depth. */
function piege<T>(v: T, cles: Set<string>, valeur = PIEGE): T {
  if (Array.isArray(v)) return v.map((x) => piege(x, cles, valeur)) as T;
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cles.has(k) && typeof x === "string" ? valeur : piege(x, cles, valeur)])) as T;
  return v;
}

/**
 * The page's structured data (`<script type="application/ld+json">`) carries the text as JSON: there, a `<` is written
 * `\u003c`, so the text can never close the block, and it must read back as the very text. The rest of the page is HTML.
 */
function horsJsonLd(page: string): string {
  return page.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, json: string) => {
    expect(json).not.toMatch(/<|<!--/);
    expect(JSON.stringify(JSON.parse(json))).not.toBe("");
    return "";
  });
}

function sansInjection(complete: string): void {
  const page = horsJsonLd(complete);
  expect(page).not.toContain("<script>alert(1)");
  expect(page).not.toContain("<img src=x");
  expect(page).not.toMatch(/onerror=alert\(2\)>/);
  expect(page).not.toContain(`"du"`);
  // The text is shown, escaped: the page did read it.
  expect(page).toContain(ECHAPPE);
}

const copie = <T>(nom: string): T => JSON.parse(readFileSync(new URL(`./fixtures/pages/copie-${nom}.json`, import.meta.url), "utf8")) as T;
const O = "https://rundata.re";

describe("a text read elsewhere, trapped, never comes out as a tag", () => {
  it("in the events' titles, venues, prices and publishers (/evenements, the weekend)", () => {
    // The agenda's copy of 24/10/2026, as test/agenda.test.ts builds it from its agendas.
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["titre", "lieu", "prix", "publie_par", "description"]));
    sansInjection(agendaPage(O, { value, fetchedAt: now, stale: false }, now));
    sansInjection(weekendPage(O, { value, fetchedAt: now, stale: false }, now));
  });

  it("on the concerts' page, tonight's and day by day, and on the map's points of the venues", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["titre", "lieu", "prix", "publie_par", "description", "couverture"]));
    sansInjection(concertsPage(O, { value, fetchedAt: now, stale: false }, now));
    const point = { lon: 55.45, lat: -20.9, lieu: PIEGE, titre: PIEGE, nombre: 1, lien: "https://exemple.re/a", source: PIEGE };
    const svg = pointsSvg([point as never], "#jours");
    expect(svg).not.toContain("<script>alert(1)");
    expect(svg).not.toContain("<img src=x");
    expect(svg).toContain(ECHAPPE);
  });

  it("in the events' links, never one that runs a script (/evenements)", () => {
    // An agenda's link is put in an href: escaped, « javascript:… » would still run on a tap. The page writes « # » instead.
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["lien", "billetterie"]), " JavaScript:alert(3)");
    // Nor in the structured data, whose `url` search engines follow: the event is given there without it.
    const page = agendaPage(O, { value, fetchedAt: now, stale: false }, now);
    expect(page).not.toMatch(/javascript:/i);
    expect(horsJsonLd(page)).toContain('href="#"');
    expect(page).toContain('"@type":"Event"');
  });

  it("on an event's page, to come and over: its title, day, place, price, text, source and who publishes it", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const cles = new Set(["titre", "quand", "lieu", "prix", "publie_par", "description", "source", "annonce", "reporte_au", "media"]);
    const value = piege(copie<AgendaAnswer>("agenda"), cles);
    const r = { ...value.evenements[0], statut: "REPORTÉ", reporte_au: PIEGE, statut_d_apres: { media: PIEGE, lien: "https://exemple.re/a" }, autres_dates: [PIEGE] } as typeof value.evenements[number];
    sansInjection(fichePage(O, r, { value, fetchedAt: now, stale: false }, undefined));
    const passe = { titre: PIEGE, date: "2026-10-01T10:00", lieu: PIEGE, commune: "Saint-Paul", publie_par: PIEGE, lien: "https://exemple.re/b", fiche: "abcdabcd" } as unknown as Fiche;
    sansInjection(fichePassee(O, passe));
  });

  it("in the water cuts' notices (/coupures-eau) and the power cuts' (a commune's tile)", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const avis = { titre: PIEGE, communes: ["Saint-Paul"], distributeur: PIEGE, publie_le: PIEGE, lien: "https://exemple.re/a", texte: PIEGE, precision: PIEGE, coupure: { de: "24/10 08:00", a: "24/10 12:00", etat: PIEGE }, secteurs: [PIEGE], secteurs_complets: true };
    const value = { resume: "", avis: [avis, { ...avis, forme: "image" }, { ...avis, secteurs_complets: false, lieu: PIEGE }], couverture: "", a_savoir: "", sources: [], communes_suivies: ["Saint-Paul"], avis_lus_le: "2026-10-24T03:50:00Z" };
    sansInjection(coupuresPage(O, { value: value as never, fetchedAt: now, stale: false }, now));
    for (const pdf of [undefined, true]) {
      const li = courantItem({ texte: `${PIEGE} dans l'avis`, lien: "https://exemple.re/b", nature: "programmée", pdf } as never);
      expect(li).not.toContain("<script>alert(1)");
      expect(li).toContain(ECHAPPE);
    }
  });

  it("on a commune's water page: its last notices, the networks of its tap water, its drought and the works' orders", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const at = <T>(value: T) => ({ value, fetchedAt: now, stale: false }) as Cached<T>;
    const p = PAGES.find((x) => x.commune && x.nom === "Sainte-Suzanne")!;
    const coupures = {
      resume: "", avis: [], couverture: PIEGE, a_savoir: "", sources: [], communes_suivies: [],
      derniers_avis: { "Sainte-Suzanne": [{ publie: "2026-10-20T05:00:00Z", titre: PIEGE, distributeur: PIEGE, lien: "https://exemple.re/a" }] },
      arretes_sainte_suzanne: { note: "", arretes: [{ arrete: PIEGE, lieu: PIEGE, du: PIEGE, au: PIEGE, etat: "en cours", lien: "https://exemple.re/b" }], lu_le: PIEGE, lien: "https://exemple.re/c" },
    };
    const secheresse = { resume: "", communes: [{ commune: "Sainte-Suzanne", eau_du_robinet: PIEGE }], arrete: { numero: PIEGE, signe_le: PIEGE, publie: "", lien: "https://exemple.re/d", remplace: "" }, echelle: "", a_savoir: "", sources: [], interdits: [] };
    const eau = { communes: [{ commune: "Sainte-Suzanne", reseaux_detail: [{ reseau: PIEGE, quartiers: [PIEGE], derniere_analyse: "2026-10-01", conclusion: PIEGE }], non_conformes_6_mois: 0, analyses_6_mois: 1, a_surveiller: [], prelevements: [] }], a_savoir: "", sources: [] };
    const page = coupuresCommunePage(O, p, { coupures: at(coupures as never), secheresse: at(secheresse as never), eau: at(eau as never) }, now);
    sansInjection(page);
    // Each place where a text read elsewhere is shown.
    expect(page).toContain(`<a href="https://exemple.re/a" rel="noopener">${ECHAPPE}</a>`);
    expect(page).toContain(`Réseau ${ECHAPPE}`);
    expect(page).toContain(`Arrêté ${ECHAPPE}`);
  });

  it("in the drought's levels, order and uses (/secheresse)", async () => {
    // VigiEau's zones of 24/10/2026, as test/secheresse.test.ts reads them, then every text read elsewhere set to the trap.
    const vigieau = readFileSync(new URL("./fixtures/vigieau/zones_974.json", import.meta.url), "utf8");
    vi.stubGlobal("fetch", async () => new Response(vigieau, { headers: { "content-type": "application/json" } }));
    const d = await buildSecheresse(new Cache(new MemoryStore()));
    vi.unstubAllGlobals();
    const value = {
      ...d, resume: PIEGE, vigieau: PIEGE, a_savoir: PIEGE,
      arrete_plus_recent: { texte: PIEGE, lien: "https://exemple.re/p.pdf" },
      arrete: { numero: PIEGE, signe_le: PIEGE, en_vigueur_depuis: PIEGE, publie: "", lien: "https://exemple.re/a.pdf", remplace: "" },
      communes: d.communes.map((c, i) => ({ ...c, commune: i ? c.commune : PIEGE, nappes: i === 1 ? PIEGE : c.nappes, vigieau_differe: [{ ressource: "eau du robinet", arrete: "crise", vigieau: PIEGE }] })),
      interdits: d.interdits.map((x) => ({ ...x, communes: [...x.communes, PIEGE], restrictions: [...x.restrictions, { usage: PIEGE, restriction: PIEGE }] })),
    };
    const page = secheressePage(O, { value, fetchedAt: new Date(), stale: false });
    sansInjection(page);
    // Each place where a text read elsewhere is shown.
    expect(page).toContain(`<b>${ECHAPPE}</b> <a href="https://exemple.re/p.pdf">`);
    expect(page).toContain(`arrêté préfectoral ${ECHAPPE} du ${ECHAPPE}</a>, en vigueur depuis le ${ECHAPPE}.`);
    expect(page).toContain(`<p class="note" style="color:var(--on-night-muted)">${ECHAPPE}</p>`);
    expect(page).toMatch(new RegExp(`<th scope="row" class="tgt" id="[^"]*">${ECHAPPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</th>`));
    expect(page).toContain(`<span class="lvl" style="--c:#868e96">${ECHAPPE}</span>`);
    expect(page).toContain(`VigiEau\u00a0: ${ECHAPPE}</small>`);
    expect(page).toContain(`<th scope="row">${ECHAPPE}</th>`);
    expect(page).toContain(`>${ECHAPPE}</td>`);
    expect(page).toContain(`, ${ECHAPPE}</small></th>`);
    expect(page).toContain(`<p class="note">${ECHAPPE}</p>`);
    expect(secheressePage(O, { value: { ...value, communes: [], interdits: [] }, fetchedAt: new Date(), stale: false })).toContain(`<p class="lead">${ECHAPPE}</p>`);
  });

  it("in the headlines (/actualites)", () => {
    // The news' copy of 24/10/2026, as test/actualites.test.ts builds it from the media's feeds.
    const now = new Date("2026-10-24T08:05:00Z");
    const value = piege(copie<ActualitesAnswer>("actualites"), new Set(["titre"]));
    sansInjection(actualitesPage(O, { value, fetchedAt: now, stale: false }, now));
  });

  it("in the news' summaries, media, live blog and coverage (/actualites)", () => {
    const now = new Date("2026-10-24T08:05:00Z");
    const value = piege(copie<ActualitesAnswer>("actualites"), new Set(["resume", "media", "couverture", "a_savoir"]));
    const page = actualitesPage(O, { value, fetchedAt: now, stale: false }, now);
    sansInjection(page);
    // The live blog's medium in its heading, and the one that says it follows the day.
    expect(page).toContain(`Le direct de ${ECHAPPE}</h2>`);
    expect(page).toContain(`<b>${ECHAPPE} suit la journée en direct</b>`);
  });

  describe("in Météo-France's texts (/vigilance) and the vigilance's banner on every page", () => {
    const now = new Date("2026-02-10T06:00:00Z");
    const periode = (couleur: number) => ({ couleur, debut: "2026-02-10T04:00:00Z", fin: "2026-02-10T16:00:00Z" });
    // An orange heavy rain in the north and a yellow on its coast, as a bulletin of Météo-France gives them.
    const zones = Object.fromEntries(Object.keys(mf.ZONES).filter((z) => z !== mf.ISLAND).map((z) => [z, { 12: [periode(1)], 1: [periode(1)] }]));
    zones["VIGI974-11"] = { 12: [periode(3)], 1: [periode(2)] };
    const bulletin = (suivi: { titre: string; texte: string; zone?: string }[]) =>
      ({ value: { emise: "2026-02-10T05:00:00Z", zones, suivi }, fetchedAt: new Date("2026-02-10T05:55:00Z"), stale: false }) as unknown as Parameters<typeof vigilancePage>[1];

    it("in the follow-up's texts and zones", () => {
      sansInjection(vigilancePage(O, bulletin([{ titre: "Fortes pluies/Orages", texte: PIEGE, zone: PIEGE }]), now));
    });

    it("in the follow-up's titles, which may break after their « / »", () => {
      const page = vigilancePage(O, bulletin([{ titre: PIEGE, texte: "Pluies soutenues." }]), now);
      expect(page).not.toContain("<script>alert(1)");
      expect(page).not.toContain("<img src=x");
      expect(page).toContain("Fête &lt;script&gt;alert(1)&lt;/<wbr>script&gt;&lt;img src=x onerror=alert(2)&gt; &quot;du&quot;");
    });

    it("in the banner's sentence, its short line for a phone and when it was read, on the home page and on /vigilance", () => {
      // A phenomenon the banner has no short name for goes in the short line as Météo-France names it.
      const alerte = { couleur: 3, texte: PIEGE, lue: PIEGE, court: { couleur: "orange", phenomenes: ["Fortes pluies / orages", PIEGE], zones: ["VIGI974-11"] } };
      for (const path of ["/", "/vigilance"]) {
        const page = layout(O, { title: "t", description: "d", path, jsonld: [], alerte } as unknown as Parameters<typeof layout>[1], "", "");
        sansInjection(page);
        expect(page).toContain(`⚠ ${ECHAPPE} · ${ECHAPPE}</span>`);
      }
    });
  });

  describe("in the names of the stops and the directions of the buses (/bus/arret)", () => {
    const rows = JSON.parse(readFileSync(new URL("./fixtures/transit/rows.json", import.meta.url), "utf8")) as Record<
      string,
      { passes?: { id: number }[]; patterns?: { id: number }[]; pattern_stops?: { id: number }[] }
    >;
    const fake: transit.TransitDb = {
      all: async <T>(sql: string, keys: unknown) =>
        (JSON.parse(String(keys)) as [string, number][]).flatMap(([feed, id]) =>
          (/FROM passes/.test(sql) ? rows[feed]?.passes : /FROM pattern_stops/.test(sql) ? rows[feed]?.pattern_stops : rows[feed]?.patterns)
            ?.filter((r) => r.id === id).map((r) => ({ feed, ...r })) ?? [],
        ) as T[],
    };
    beforeEach(() => donnerTransit(fake));
    afterEach(() => donnerTransit(undefined));
    // Friday 23/10/2026, 7h30, at Saint-Pierre's bus station, as test/arret.test.ts.
    const now = new Date("2026-10-23T03:30:00Z");

    it("on a stop's page", async () => {
      const p = transit.pageOfStop(findStops("gare routière Saint-Pierre").groups.find((g) => g.reseau === "carjaune")!.ids[0])!;
      const d = await stopPageDepartures(p.groups, now);
      expect(d.departs.length).toBeGreaterThan(0);
      sansInjection(stopPage(O, piege(p, new Set(["nom"])), piege(d, new Set(["headsign", "arret", "nom"])), now));
    });

    it("on the search for a stop, whose words are the visitor's", () => {
      const found = findStops("gare routière Saint-Pierre").groups.map((g) => transit.pageOfStop(g.ids[0])!).filter(Boolean);
      sansInjection(searchPage(O, PIEGE, found.map((p) => piege(p, new Set(["nom"])))));
    });
  });
});

describe("a text typed or read for the clubs' space, trapped, never comes out as a tag", () => {
  const ligne = (over: Partial<Ligne> = {}) => ({
    id: 3, t: Date.parse("2026-10-25T08:00:00Z") / 1000, etat: "publie", titre: PIEGE, date: "2026-11-27", debut: "20:00", fin: null, repete: "semaine",
    jusqu_au: "2026-12-20", commune: "Saint-Paul", lieu: PIEGE, organisateur: PIEGE, description: PIEGE, prix: PIEGE, lien: null, email: "x@example.org",
    contact_public: PIEGE, derniere_date: "2026-12-20", motif: PIEGE, reporte_au: null, correction: null, ...over,
  }) as Ligne;

  it("on a proposed event's own page: its title, place, organiser, public contact and the reason given", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    sansInjection(gererPage(O, ligne(), "/associations/proposition/x", { kind: "page" }, now));
    sansInjection(gererPage(O, ligne({ etat: "refuse" }), "/associations/proposition/x", { kind: "page" }, now));
    sansInjection(gererPage(O, ligne(), "/associations/proposition/x", { kind: "page", faux: { f: new URLSearchParams({ titre: PIEGE, lieu: PIEGE }), erreurs: ["date"] } }, now));
  });

  it("in the directory of the declared associations: their title and object, and the words searched", () => {
    const liste = [{ id: "W1", titre: PIEGE, objet: PIEGE, insee: "97415", creee: "1999-01-01", site: null }];
    sansInjection(annuaireSection({ maj: "2026-11-01", mot: PIEGE, page: 1, trouve: { liste, total: 1 } }));
  });
});

describe("a link read elsewhere never runs a script", () => {
  // Escaped, « javascript:… » would still run on a tap: a link of another site goes through href() (web/html.ts), which
  // writes « # » for a scheme that is not the web's, a mail or a phone. Elsewhere (a filter's key in data-k) the link
  // is only a text, escaped.
  const J = " JavaScript:alert(3)";
  const sansScript = (page: string) => {
    expect(horsJsonLd(page)).not.toMatch(/(href|src)="\s*javascript:/i);
    expect(page).toContain('href="#"');
  };

  it("in the headlines, the live pages and the prefecture's releases (/actualites)", () => {
    const now = new Date("2026-10-24T08:05:00Z");
    const value = piege(copie<ActualitesAnswer>("actualites"), new Set(["lien"]), J);
    sansScript(actualitesPage(O, { value, fetchedAt: now, stale: false }, now));
  });

  it("on an event's page, its announcement, its tickets and the medium that says it is cancelled", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["lien", "billetterie"]), J);
    const r = { ...value.evenements[0], statut: "ANNULÉ", statut_d_apres: { media: "Un média", lien: J } } as typeof value.evenements[number];
    sansScript(fichePage(O, r, { value, fetchedAt: now, stale: false }, undefined));
  });

  it("in a water cut's notice, and a power cut's on /electricite and a commune's tile", () => {
    const avis = { titre: "Coupure d'eau", communes: ["Saint-Louis"], distributeur: "runéo", publie_le: "20/11/2026 à 09:40", lien: J, texte: "Coupure." };
    sansScript(noticeCard(avis as never));
    sansScript(courantItem({ texte: "Coupure de courant.", lien: J, nature: "programmée" } as never));
    const now = new Date("2026-11-20T06:30:00Z");
    const avisCourant = [{ texte: "…", commune: "Saint-André", nature: "programmée", lien: J, creneaux: [{ jour: "2026-11-23", de: "09:00", a: "12:30", secteurs: [] }] }];
    const copy = { value: { coupures_annoncees: { avis: avisCourant }, sources: [] }, fetchedAt: now, stale: false } as unknown as Cached<ElectriciteAnswer>;
    sansScript(electriciteCommune(copy, "Saint-André", now).foot ?? "");
  });

  it("in the clubs' next dates (/associations) and the sports' agendas, matches and towns' programmes (/sport)", () => {
    const e = { titre: "Tournoi", commune: "Saint-Paul", publie_par: "Un club", lien: J } as unknown as Evenement;
    sansScript(associationsPage(O, { clubs: 1, evenements: 1, prochains: [{ e, quand: "samedi 05/12" }] }));
    const now = new Date("2026-11-28T08:00:00Z");
    const value = {
      resume: "", non_couvert: "", sources: [], resultats: [], classements: [],
      a_venir: [{ epreuve: "Tournoi", quand: "samedi 05/12 à 09:00", sport: "volley-ball", etat: "à venir", lien: J }],
      programmes_communes: [{ titre: "Programme sportif", lien: J, commune: "La Possession", source: "la mairie", dates: "samedi 05/12" }],
    } as unknown as SportAnswer;
    const page = sportPage(O, { value, fetchedAt: now, stale: false }, now);
    expect(page).toContain(">Programme sportif<");
    expect(page).toContain(">Tournoi<");
    sansScript(page);
  });

  it("in the TCO's releases on the collection (/collecte) and the waste centres (/decheteries)", () => {
    const now = new Date("2026-11-28T08:00:00Z");
    const c = (sujet: Communique["sujet"]): Communique => ({ titre: "Collectes de rattrapage", lien: J, publie: "2026-11-27T06:00:00Z", jusqu_au: "2026-11-30T20:00:00Z", sujet, communes: ["Saint-Paul"] });
    sansScript(collectePage(O, now, undefined, undefined, [c("collecte")]));
    const dechets = { sites: [], avis: [c("decheterie")], sources: [] };
    sansScript(decheteriesPage(O, { value: dechets, fetchedAt: now, stale: false } as never, now));
  });

  it("in a town hall's site under the markets (a commune's day) and its page on service-public.fr (a commune's page)", () => {
    const now = new Date("2026-10-24T11:10:00Z");
    const p = pageOf("saint-pierre")!;
    const r = resume(p, {} as never, now) as Resume;
    const page = aujourdhuiPage(O, p, { ...r, marches_du_jour: { liste: [], mairie: { texte: "Jours et horaires des marchés : site de la mairie", site: J } } } as Resume, null);
    expect(page).toContain("site de la mairie →");
    sansScript(page);
    sansScript(lienNom(J, "Fiche service-public.fr", ' rel="noopener"'));
  });

  it("in a declared association's site (the directory under /associations)", () => {
    const liste = [{ id: "W1", titre: "Club", objet: "Sport.", insee: "97415", creee: "1999-01-01", site: J }];
    sansScript(annuaireSection({ maj: "2026-11-01", mot: "club", page: 1, trouve: { liste, total: 1 } }));
  });
});
