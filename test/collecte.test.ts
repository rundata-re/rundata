import { describe, expect, it } from "vitest";
import { annuaireTool } from "../src/tools/annuaire.js";
import { collecteAnswer, parseLieu } from "../src/tools/collecte.js";
import { resume } from "../src/tools/resume.js";
import * as col from "../src/vie/collecte.js";
import est from "../src/vie/collecte-cirest.json" with { type: "json" };
import { insecables } from "../src/typographie.js";
import { collectePage, communeOf, ELSEWHERE, horsTco } from "../src/web/collecte.js";
import { pageOf } from "../src/web/places.js";
import { Cache, MemoryStore } from "../src/cache.js";

// Saturday 24 October 2026, 14:00 at La Réunion.
const NOW = new Date("2026-10-24T10:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const day = (iso: string) => col.todayOf(new Date(`${iso}T08:00:00Z`));
const days = (...isos: string[]) => isos.map(day);
const weekdays = (from: string, step: number, n: number) => Array.from({ length: n }, (_, i) => day(from) + i * step);

describe("the bins' calendars of the West", () => {
  it("holds every calendar of the TCO with its days, and every street with its calendar", () => {
    expect(col.CALENDARS.length).toBeGreaterThan(100);
    expect(col.STREETS.length).toBeGreaterThan(3000);
    expect(col.CALENDARS.every((c) => c.OM && c.OM.length > 40 && c.pdf.startsWith({ tco: "https://www.tco.re/", cirest: "https://www.cirest.fr/", cinor: "https://www.cinor.re/" }[c.epci]))).toBe(true);
    expect(col.COMMUNES).toEqual(["Saint-Paul", "La Possession", "Saint-Leu", "Le Port", "Les Trois-Bassins", "Saint-André", "Bras-Panon", "Saint-Benoît", "Salazie", "La Plaine-des-Palmistes", "Saint-Denis", "Sainte-Marie", "Sainte-Suzanne"]);
    // The CINOR's: 66 calendars; at Saint-Denis the brown bin of the biowaste, always on the grey one's days.
    const nord = col.CALENDARS.filter((c) => c.epci === "cinor");
    expect(nord.length).toBe(66);
    expect(nord.filter((c) => c.BIO).every((c) => c.BIO!.join() === c.OM!.join())).toBe(true);
    expect(nord.filter((c) => c.BIO).length).toBeGreaterThan(30);
    expect(new Set(col.STREETS.filter((s) => s.epci === "cinor").map((s) => s.commune))).toEqual(new Set(["Saint-Denis", "Sainte-Marie", "Sainte-Suzanne"]));
    // A street of several zones is said with its quarter, in French as written (the API writes them in capitals, without
    // accents): never « Camelias », « Ste Clotilde » nor « Bois Nefles ».
    const parts = col.STREETS.filter((s) => s.epci === "cinor" && s.nom.includes(", quartier ")).map((s) => s.nom);
    expect(parts).toContain("Boulevard Doret, quartier Camélias");
    expect(parts).toContain("Rue Tessan, quartier Bois de Nèfles");
    expect(parts).toContain("Rue Manes, quartier Les Cafés / Ravine des Chèvres");
    const quartier = (n: string) => n.split(", quartier ")[1];
    for (const n of parts) expect(quartier(n), n).not.toMatch(/\b(Camelias|Nefles|Riviere|Reserve|Cafes|Chevres|Francois|Ste|St|Cv)\b|^[A-Z ]+$/);
    expect(col.STREETS.every((s) => s.calendrier === -1 || col.CALENDARS[s.calendrier])).toBe(true);
  });

  it("says a rhythm only when the coming days keep it, else the days themselves", () => {
    const today = day("2026-10-26");
    // Every Monday and Thursday, the Thursday of a holiday moved to the Friday.
    const om = [...weekdays("2026-10-26", 7, 10), ...weekdays("2026-10-29", 7, 10).map((n) => (n === day("2026-11-12") ? day("2026-11-13") : n))].sort((x, y) => x - y);
    expect(col.rhythm(om, today)).toBe("le lundi et le jeudi");
    // Every other Wednesday, one moved to the Thursday by the holiday.
    expect(col.rhythm(days("2026-10-28", "2026-11-12", "2026-11-25", "2026-12-09"), today)).toBe("le mercredi, une semaine sur deux (prochain : 28/10)");
    expect(col.rhythm(days("2026-11-12", "2026-11-25", "2026-12-09"), today)).toBe("le mercredi, une semaine sur deux (prochain : jeudi 12/11)");
    // The third Thursday of the month.
    expect(col.rhythm(days("2026-11-19", "2026-12-17", "2027-01-21"), today)).toBe("le 3e jeudi du mois (prochain : 19/11)");
    expect(col.rhythm(days("2026-11-06", "2026-12-04"), today)).toBe("les vendredis 6/11, 4/12");
    expect(col.rhythm(days("2026-11-13", "2026-11-26", "2026-12-10", "2026-12-24"), today)).toBe("le jeudi, une semaine sur deux (prochain : vendredi 13/11)");
    expect(col.rhythm(days("2026-11-13", "2026-12-03", "2026-12-19", "2026-12-28"), today)).toBe("le vendredi 13/11, le jeudi 3/12 et le samedi 19/12…");
    // The day itself: « aujourd'hui », not its date.
    expect(col.rhythm(days("2026-10-26", "2026-11-09", "2026-11-23"), today)).toBe("le lundi, une semaine sur deux (prochain : aujourd'hui)");
    expect(col.rhythm(days("2026-01-05"), today)).toBeUndefined();
    // One day only: « le lundi 7/12 », never « les lundis 7/12 ».
    expect(col.rhythm(days("2026-12-07"), today)).toBe("le lundi 7/12");
  });

  it("says apart a first day off the rhythm that no holiday of its week moved: the last of another rhythm", () => {
    const today = day("2026-11-06");
    // The TCO's calendar: a Tuesday, the 24/11, then every other Monday from December.
    const dv = days("2026-11-24", "2026-12-07", "2026-12-21");
    const feries = days("2026-11-11", "2026-12-25");
    expect(col.rhythm(dv, today, feries)).toBe("le mardi 24/11, puis le lundi, une semaine sur deux");
    // A holiday earlier in its week moves the day: the rhythm, its next day with its weekday, as before.
    expect(col.rhythm(days("2026-11-13", "2026-11-26", "2026-12-10", "2026-12-24"), today, feries)).toBe("le jeudi, une semaine sur deux (prochain : vendredi 13/11)");
    // Without the calendar's holidays, as before.
    expect(col.rhythm(dv, today)).toBe("le lundi, une semaine sur deux (prochain : mardi 24/11)");
  });

  it("puts the calendar's holiday before the rule: the day it makes it up, or where to check", () => {
    const today = day("2026-11-02");
    const cs = days("2026-10-28", "2026-11-12", "2026-11-25", "2026-12-09");
    const base = { code: "TEST", pdf: "https://www.tco.re/test.pdf", OM: weekdays("2026-10-26", 7, 12), F: days("2026-11-11") };
    expect(col.holidays({ ...base, CS: cs }, today)).toEqual([{ jour: day("2026-11-11"), reportee: day("2026-11-12") }]);
    expect(col.holidayLine({ jour: day("2026-11-11"), reportee: day("2026-11-12") })).toBe("Jour férié le 11/11 : collecte reportée au jeudi 12/11, selon le calendrier du TCO.");
    // The holiday falls on its usual day and nothing makes it up: no day is guessed.
    const wednesdays = weekdays("2026-10-07", 7, 12).filter((n) => n !== day("2026-11-11"));
    expect(col.holidays({ ...base, CS: wednesdays }, today)).toEqual([{ jour: day("2026-11-11"), reportee: undefined }]);
    expect(col.holidayLine({ jour: day("2026-11-11") })).toBe("Jour férié : vérifiez le calendrier du TCO (PDF) →");
    // Not a day of collection: nothing to say.
    expect(col.holidays(base, today)).toEqual([]);
  });

  it("never says a year's days of the next one", () => {
    const victoria = col.findStreets("rue victoria", "La Possession")[0];
    expect(col.streetLine(victoria, day("2027-01-04"))).toBe("Les calendriers 2027 du TCO ne sont pas encore publiés : rundata.re ne peut pas encore donner les jours de collecte.");
    // Before the 1st of January the days are given: they hold until the 31st of December (24/11/2026).
    expect(col.streetLine(victoria, day("2026-12-20"))).toMatch(/\. Jours de collecte valables jusqu'au 31 décembre 2026 : les calendriers 2027 du TCO ne sont pas encore publiés\.$/);
    expect(col.streetLine(victoria, day("2026-12-20"))).not.toContain("ne peut pas encore donner");
    expect(body(collecteAnswer("rue Victoria, La Possession", new Date("2027-01-04T08:00:00Z"))).resume).toBe(col.notYet());
  });

  it("says a street without a calendar as such, inferring nothing", () => {
    const nc = col.STREETS.find((s) => s.calendrier === -1)!;
    expect(col.streetLine(nc, day("2026-10-24"))).toBe(`${col.streetName(nc)}, ${nc.commune} : les calendriers 2026 du TCO ne donnent pas de jour de collecte pour cette voie, et rundata.re ne sait pas si elle est collectée au porte-à-porte. Renseignez-vous auprès du TCO →`);
    const page = collectePage("https://rundata.re", NOW, nc.commune);
    expect(page).toContain('<h3>Voies sans calendrier du TCO</h3><p>Les calendriers 2026 du TCO ne donnent pas de jour de collecte pour ces voies, et rundata.re ne sait pas si elles sont collectées au porte-à-porte. <a href="https://www.tco.re/contact" rel="noopener">Renseignez-vous auprès du TCO →</a></p>');
    // After the streets that have a calendar.
    expect(page.indexOf("Voies sans calendrier du TCO")).toBeGreaterThan(page.lastIndexOf("du TCO (PDF)</a></p></div>"));
  });

  it("finds a street as people type it", () => {
    expect(col.findStreets("r. victoria", "La Possession")[0]?.nom).toBe("Rue Victoria");
    expect(col.findStreets("ru")).toEqual([]);
    expect(parseLieu("12 rue Victoria, La Possession")).toEqual({ commune: "La Possession", rue: "rue victoria" });
    expect(parseLieu("chemin Tauran 97436 Saint-Leu")).toEqual({ commune: "Saint-Leu", rue: "chemin tauran" });
  });
});

describe("the tool and the pages", () => {
  it("answers for a street, in the validated words, with the calendar's PDF", () => {
    const r = body(collecteAnswer("12 rue Victoria, La Possession", NOW));
    expect(r.resume).toMatch(/^Rue Victoria, La Possession : ordures ménagères le lundi et le jeudi\u00a0; tri le mercredi, une semaine sur deux \(prochain : 28\/10\)/);
    expect(r.rues[0].calendrier_pdf).toMatch(/2026_POSS_01\.pdf$/);
    expect(r.a_savoir).toBe(`Seulement les communes de l'Ouest (TCO), de l'Est (CIREST, sauf Sainte-Rose) et du Nord (CINOR) pour l'instant. Calendriers 2026 publiés par le TCO (data.tco.re), mis à jour le 06/08/2026, par la CIREST (cirest.fr), lus le ${col.UPDATED_CIREST.split("-").reverse().join("/")}, et par la CINOR (cinor.re), lus le ${col.UPDATED_CINOR.split("-").reverse().join("/")}. En cas d'alerte cyclonique, la collecte peut être suspendue : suivez les annonces du TCO, de la CIREST et de la CINOR.`);
    expect(r.mis_a_jour).toBe("06/08/2026");
    expect(body(collecteAnswer("rue Inexistante du Test, Saint-Paul", NOW)).resume).toBe("Rue non trouvée dans les calendriers du TCO, de la CIREST et de la CINOR. Vérifiez l'orthographe, ou essayez le nom du quartier.");
    expect(body(collecteAnswer("Saint-Paul", NOW)).resume).toBe("Collecte des déchets : le jour de votre rue sur rundata.re/collecte/saint-paul.");
  });

  it("says who collects in a commune whose calendars are not read, never a street to spell again", () => {
    const lt = body(collecteAnswer("chemin Bœuf Mort, Le Tampon 97430", NOW));
    expect(lt.resume).toBe("Le Tampon : la collecte des déchets y est assurée par la CASUD, dont les calendriers ne sont pas repris ici. rundata.re reprend ceux du TCO (Le Port, La Possession, Saint-Paul, Trois-Bassins, Saint-Leu), de la CIREST (Saint-André, Bras-Panon, Saint-Benoît, Salazie, La Plaine-des-Palmistes) et de la CINOR (Saint-Denis, Sainte-Marie, Sainte-Suzanne). Voir le site de la CASUD.");
    expect(lt.intercommunalite).toEqual({ nom: "CASUD", site: "https://www.casud.re/" });
    // The North's streets are read since the CINOR's calendars (26/11/2026): Saint-Denis is one of them.
    const sd = body(collecteAnswer("12 rue de Paris, Saint-Denis", NOW));
    expect(sd.intercommunalite).toBeUndefined();
    expect(sd.resume).toMatch(/^Rue de Paris, Saint-Denis : ordures ménagères /);
    expect(sd.resume).toContain("biodéchets (bac marron)");
    expect(sd.rues[0].calendrier_pdf).toBe("https://www.cinor.re/wp-content/uploads/calendriers/2026/HYPERCENTRE1.pdf");
    expect(body(collecteAnswer("L'Étang-Salé", NOW)).intercommunalite.nom).toBe("CIVIS");
    // Sainte-Rose: the CIREST's, without a calendar online; said so, with the CIREST's site, never a street to spell again.
    const sr = body(collecteAnswer("rue des Bambous, Sainte-Rose", NOW));
    expect(sr.resume).toBe("Sainte-Rose : le calendrier de collecte de ses rues n'est pas publié en ligne. rundata.re reprend ceux des autres communes de l'Est, ceux du TCO et ceux de la CINOR. Voir le site de la CIREST.");
    expect(sr.intercommunalite.nom).toBe("CIREST");
    // Every commune of the island once: the TCO's, the CIREST's and the CINOR's read, the others in one intercommunality each.
    const others = col.AILLEURS.flatMap((e) => e.communes);
    expect(new Set([...others, ...col.COMMUNES]).size).toBe(24);
    expect(others.length + col.COMMUNES.length).toBe(24);
    // A street of the West named after a town of the East is still a street of the West.
    expect(body(collecteAnswer("rue Victoria, La Possession", NOW)).intercommunalite).toBeUndefined();
  });

  it("says on the page, for a commune whose calendars are not read typed in the search box, the tool's sentence and its link", () => {
    const page = collectePage("https://rundata.re", NOW);
    const sp = horsTco("12 rue de la Paix, Saint-Pierre", ELSEWHERE)!;
    // The tool's sentence, the site of who collects there a link on its last words.
    expect(sp.avant + sp.lien + sp.apres).toBe(insecables(body(collecteAnswer("Saint-Pierre", NOW)).resume));
    expect([sp.lien, sp.url, sp.apres]).toEqual(["le site de la CIVIS", "https://www.civis.re/", "."]);
    expect(sp.avant).toMatch(/^Saint-Pierre\u00a0: la collecte/);
    // As people type it: alone, accents or capitals left out, a postcode after it; the East's towns never in a street of the West.
    expect(horsTco("saint pierre", ELSEWHERE)?.c).toBe("Saint-Pierre");
    // Saint-Denis is read now: its streets, never the sentence of who collects elsewhere.
    expect(horsTco("12 rue de Paris, Saint-Denis", ELSEWHERE)).toBeUndefined();
    expect(horsTco("chemin Bœuf Mort, LE TAMPON 97430", ELSEWHERE)?.c).toBe("Le Tampon");
    expect(horsTco("L'Etang-Salé", ELSEWHERE)?.c).toBe("L'Étang-Salé");
    expect(horsTco("Saint-Paul", ELSEWHERE)).toBeUndefined();
    expect(horsTco("rue de Saint-Denis, Le Port", ELSEWHERE)).toBeUndefined();
    expect(ELSEWHERE.map((x) => x.c).sort()).toEqual(col.AILLEURS.flatMap((e) => e.communes).sort());
    // In the page's script, with the data it reads; a street not found still says to spell it again, and that only the
    // West is read, in the tool's words (its a_savoir).
    expect(page).toContain(`hors=${horsTco}`);
    expect(page).toContain(JSON.stringify(ELSEWHERE[0]).slice(0, 40));
    expect(page).toContain("Rue non trouvée dans les calendriers du TCO, de la CIREST et de la CINOR. Vérifiez l'orthographe, essayez le nom du quartier, ou cherchez dans la liste ci-dessous. Seulement les communes de l'Ouest (TCO), de l'Est (CIREST, sauf Sainte-Rose) et du Nord (CINOR) pour l'instant.".replace(/'/g, "&#39;"));
    // Said under the field too, before anything is typed.
    expect(page).toContain(`aria-describedby="ouest"></label>\n  <p class="note" id="ouest">Seulement les communes de l&#39;Ouest (TCO), de l&#39;Est (CIREST, sauf Sainte-Rose) et du Nord (CINOR) pour l&#39;instant.</p>`);
    expect(body(collecteAnswer("rue Inexistante du Test, Saint-Paul", NOW)).a_savoir).toMatch(/^Seulement les communes de l'Ouest \(TCO\), de l'Est \(CIREST, sauf Sainte-Rose\) et du Nord \(CINOR\) pour l'instant\. /);
  });

  it("is what annuaire_services_publics answers about the bins, not the déchèteries", async () => {
    const cache = new Cache(new MemoryStore(), () => NOW.getTime());
    const r = body(await annuaireTool(cache, "collecte des déchets verts", "rue Victoria, La Possession", NOW));
    expect(r.rues[0].rue).toBe("Rue Victoria");
  });

  it("gives /collecte and a page per commune, every street of it, grouped by calendar", () => {
    const all = collectePage("https://rundata.re", NOW);
    expect(all).toContain(`<title>Collecte TCO, CIREST, CINOR ${col.YEAR} : jours par rue · 974</title>`);
    expect(all).toContain("<h1>Quel jour passent les poubelles ?</h1>");
    expect(communeOf("trois-bassins")).toBe("Les Trois-Bassins");
    const sp = collectePage("https://rundata.re", NOW, "Saint-Paul");
    expect(sp).toContain(`<title>Collecte des déchets Saint-Paul ${col.YEAR} : jours par rue · 974</title>`);
    expect(sp).toContain("<h1>Quel jour passent les poubelles à Saint-Paul ?</h1>");
    expect(sp).toContain(`content="Calendrier ${col.YEAR} de collecte des déchets à Saint-Paul (974)`);
    expect(sp).toContain("<li>Rue Leconte Delisle</li>");
    expect(sp).not.toContain("Rue Victoria");
    expect(sp).toContain('<a href="/decheteries">');
    expect(collectePage("https://rundata.re", NOW, "Le Port")).toContain("Les rues du Port");
    // A commune of the East: the CIREST named, its calendars' PDFs; the TCO's never.
    const sa = collectePage("https://rundata.re", NOW, "Saint-André");
    expect(sa).toContain(`<p class="pill">Calendriers de la CIREST · ${col.YEAR}</p>`);
    expect(sa).toContain(`d'après les calendriers ${col.YEAR} publiés par la CIREST.`.replaceAll("'", "&#39;"));
    expect(sa).toContain('rel="noopener">calendrier SA03 de la CIREST (PDF)</a>');
    expect(sa).toContain("<li>Allée Alamandas</li>");
    expect(sa).not.toContain("du TCO (PDF)");
    // Each of the East's five pages names the CIREST as its source; the West's old sentence is said nowhere.
    for (const c of ["Saint-André", "Bras-Panon", "Saint-Benoît", "Salazie", "La Plaine-des-Palmistes"]) {
      const p = collectePage("https://rundata.re", NOW, c);
      expect(p, c).toContain(`<p class="pill">Calendriers de la CIREST · ${col.YEAR}</p>`);
      expect(p, c).toContain(`publiés par la CIREST.`);
      expect(p, c).not.toContain("Seulement les 5 communes");
    }
    expect(collectePage("https://rundata.re", NOW)).not.toContain("Seulement les 5 communes");
    expect(sp).toMatch(/<p class="pill">Calendriers du (<abbr [^>]+>)?TCO(<\/abbr>)? · 2026<\/p>/);
  });

  it("reads the CIREST's calendars: a street of the East, its days, its PDF and the CIREST's date", () => {
    // Both publish the same year: one YEAR for the page and the tool.
    expect(est.annee).toBe(col.YEAR);
    const r = body(collecteAnswer("allée Alamandas, Saint-André", NOW));
    expect(r.resume).toBe("Allée Alamandas, Saint-André : ordures ménagères le mercredi\u00a0; tri le lundi, une semaine sur deux (prochain : 2/11)\u00a0; déchets verts les mercredis 4/11, 2/12\u00a0; encombrants le vendredi 30/10 et le mercredi 30/12.");
    expect(r.rues[0].calendrier_pdf).toBe("https://www.cirest.fr/wp-content/themes/econature-child/calendriers_collecte/saintandre/SA03.pdf");
    expect(r.mis_a_jour).toBe(col.UPDATED_CIREST.split("-").reverse().join("/"));
    expect(r.sources.map((s: { attribution: string }) => s.attribution)).toEqual(["CIREST"]);
    // Every calendar of the East holds its whole year: each week's household waste, the bulky waste some days.
    const east = col.CALENDARS.filter((c) => c.epci === "cirest");
    expect(east).toHaveLength(45);
    for (const c of east) {
      expect(c.OM!.length).toBeGreaterThanOrEqual(52);
      expect(c.EN!.length).toBeGreaterThan(0);
    }
    expect(col.STREETS.filter((s) => s.epci === "cirest").length).toBeGreaterThan(1500);
    expect(col.STREETS.some((s) => s.commune === "Sainte-Rose")).toBe(false);
    // The « Œ » the CIREST's page gives in Latin-9 (« ¼ » read as UTF-8) put back: « œillets » finds its street.
    expect(col.STREETS.filter((s) => /[¼½]/.test(s.nom)).map((s) => s.nom)).toEqual([]);
    // The article the CIREST writes last, between brackets (« CHEMIN ¼ILLETS (DES) »), put back after the street's kind:
    // the name as one says it finds the street.
    for (const q of ["oeillets", "œillets", "chemin des oeillets", "Chemin des Œillets"]) expect(col.findStreets(q, "Salazie").map((s) => s.nom), q).toContain("Chemin des Œillets");
    expect(col.STREETS.filter((s) => /\((?:de la|de l'|des|du|de|la|le|les|l')\)$/i.test(s.nom)).map((s) => s.nom)).toEqual([]);
    expect(col.findStreets("chemin de l'aloès", "Salazie").map((s) => s.nom)).toContain("Chemin de l'Aloès");
    expect(col.findStreets("allée soeurs", "Saint-André").map((s) => s.nom)).toContain("Allée Sœurs");
  });

  it("tells apart, under their heading, the groups of a commune that share it: the collection that parts them", () => {
    const page = collectePage("https://rundata.re", new Date("2026-11-08T08:00:00Z"));
    // Saint-Paul: two calendars of 39 streets, their household waste on the same days, their sorting not.
    const head = "Ordures ménagères le samedi 14/11, le vendredi 20/11 et le vendredi 27/11…\u00a0<span class=\"note\">· Saint-Paul, 39\u00a0rues</span>";
    expect(page).toContain(`${head}<br><span class="note">tri le lundi, une semaine sur deux (prochain : 16/11)</span></h4>`);
    expect(page).toContain(`${head}<br><span class="note">tri le mardi, une semaine sur deux (prochain : 17/11)</span></h4>`);
    // A heading no other group shares stays as it was.
    // « Possession » in a <span>: glued to « La », Chrome would cut it with no hyphen, « Posse|ssion ».
    expect(page).toContain("Ordures ménagères le jeudi\u00a0<span class=\"note\">· La\u00a0<span>Possession,</span> 26\u00a0rues</span></h4>");
    expect(page).toContain("· Le\u00a0<span>Port,</span> ");
    expect(page).toContain("· Les\u00a0<span>Trois-Bassins,</span> ");
    expect(page).not.toMatch(/(La|Le|Les)\u00a0(?!<span>)\p{Lu}/u);
    const heads = page.split('class="card groupe"').slice(1).map((g) => g.split("</summary>")[0]);
    expect(heads.length).toBeGreaterThan(100);
    expect(new Set(heads).size).toBe(heads.length);
  });

  it("makes one group of two calendars of a commune with the same days to the end of the year, both PDFs kept", () => {
    const page = collectePage("https://rundata.re", new Date("2026-11-08T08:00:00Z"));
    const groups = page.split('class="card groupe"').slice(1);
    const both = groups.filter((g) => g.includes("calendrier 2026_POSS_11 du TCO") || g.includes("calendrier 2026_POSS_56 du TCO"));
    expect(both).toHaveLength(1);
    for (const s of ["Impasse des Becs Roses", "Rue Hippolyte Piot", 'aria-label="calendrier 2026_POSS_11 du TCO (PDF)"', "du TCO (PDF)</a> · <a", 'aria-label="calendrier 2026_POSS_56 du TCO (PDF)"']) expect(both[0]).toContain(s);
  });

  it("renders /collecte and a commune's page every day of December, a calendar's days run out or not, then says on 1 January that the year's calendars are not out", () => {
    for (let d = 1; d <= 31; d++) {
      const now = new Date(Date.UTC(2026, 11, d, 8));
      for (const commune of [undefined, "Saint-Paul"]) expect(collectePage("https://rundata.re", now, commune)).toContain("</html>");
    }
    for (const commune of [undefined, "Saint-Paul"]) {
      const page = collectePage("https://rundata.re", new Date("2027-01-01T08:00:00Z"), commune);
      expect(page).toContain(`<p class="card">${col.notYet(col.epciDe(commune))}</p>`);
      expect(page).not.toContain('class="card groupe"');
    }
  });

  it("says in late November that the days shown hold until the 31st of December, never that it cannot give them", () => {
    const now = new Date("2026-11-24T08:00:00Z");
    for (const commune of [undefined, "Saint-Paul"]) {
      const page = collectePage("https://rundata.re", now, commune);
      expect(page).toContain(`<p class="card">${col.untilYearEnd(col.epciDe(commune)).replaceAll("'", "&#39;")}</p>`);
      expect(page).not.toContain(col.notYet(col.epciDe(commune)));
      expect(page).toContain('class="card groupe"');
    }
    expect(col.untilYearEnd()).toBe("Jours de collecte valables jusqu'au 31 décembre 2026 : les calendriers 2027 du TCO ne sont pas encore publiés.");
    // On /collecte, which lists the East's and the North's streets too, all three named; on a commune's page, who collects there.
    expect(collectePage("https://rundata.re", now)).toContain("les calendriers 2027 du TCO, de la CIREST et de la CINOR ne sont pas encore publiés.");
    expect(collectePage("https://rundata.re", now, "Sainte-Marie")).toContain("les calendriers 2027 de la CINOR ne sont pas encore publiés.");
    expect(collectePage("https://rundata.re", now, "Salazie")).toContain("les calendriers 2027 de la CIREST ne sont pas encore publiés.");
    const jan = new Date("2027-01-01T08:00:00Z");
    expect(collectePage("https://rundata.re", jan)).toContain("Les calendriers 2027 du TCO, de la CIREST et de la CINOR ne sont pas encore publiés");
    expect(collectePage("https://rundata.re", jan, "Saint-Benoît")).toContain("Les calendriers 2027 de la CIREST ne sont pas encore publiés");
    expect(body(collecteAnswer("rue Victoria", jan)).resume).toMatch(/^Les calendriers 2027 du TCO, de la CIREST et de la CINOR /);
    expect(body(collecteAnswer("rue Victoria, La Possession", jan)).resume).toMatch(/^Les calendriers 2027 du TCO ne /);
    const r = body(collecteAnswer("rue Victoria, La Possession", now));
    expect(JSON.stringify(r)).toContain(col.untilYearEnd());
    expect(JSON.stringify(r)).not.toContain("ne peut pas encore donner");
  });

  it("gives a group's PDFs in a row up to three calendars, folded under their number past that", () => {
    const group = (iso: string, code: string) => collectePage("https://rundata.re", new Date(`${iso}T08:00:00Z`)).split('class="card groupe"').slice(1).filter((g) => g.includes(`calendrier ${code} du TCO`));
    // La Possession on 18/12: three calendars, three links in a row.
    const [three] = group("2026-12-18", "2026_POSS_29");
    for (const c of ["2026_POSS_40", "2026_POSS_29", "2026_POSS_32"]) expect(three).toContain(`aria-label="calendrier ${c} du TCO (PDF)">`);
    expect(three).toContain('<p class="note">La Possession · <a');
    expect(three).not.toContain("calendriers du TCO (PDF)</summary>");
    // Saint-Paul on 05/12: four calendars, folded under « 4 calendriers du TCO (PDF) ».
    const [four] = group("2026-12-05", "2026_SP1_34");
    expect(four).toContain('<details class="note"><summary>Saint-Paul · 4\u00a0calendriers du TCO (PDF)</summary><p><a');
    for (const c of ["2026_SP1_34", "2026_SP1_18", "2026_SP1_22", "2026_SP1_20"]) expect(four).toContain(`aria-label="calendrier ${c} du TCO (PDF)">`);
  });

  it("parts two calendars said alike by the first day that tells them apart, later in the year", () => {
    // From Monday 2 November: the household waste every Monday, the green waste every other Thursday, then the last on
    // Wednesday 30 December for one, Thursday 31 for the other, past the eight weeks the rhythm reads.
    const today = day("2026-11-02");
    const cal = (last: string) => ({ code: last, pdf: "", OM: weekdays("2026-11-02", 7, 9), DV: [...days("2026-11-05", "2026-11-19", "2026-12-03", "2026-12-17"), day(last)] });
    const [a, b] = [cal("2026-12-31"), cal("2026-12-30")];
    expect(col.rhythmOf(a, today)).toBe(col.rhythmOf(b, today));
    expect(col.sameDays(a, b, today)).toBe(false);
    expect(col.sameDays(a, cal("2026-12-31"), today)).toBe(true);
    expect(col.firstApart(a, [b], today)).toBe("déchets verts le jeudi 31/12");
    expect(col.firstApart(b, [a], today)).toBe("déchets verts le mercredi 30/12");
  });

  it("sends the day's summary of a commune of the West to its page, never a day without a street", () => {
    const sp = resume(pageOf("saint-paul")!, {} as never, NOW);
    expect(sp.collecte_dechets?.texte).toBe("Collecte des déchets : le jour de votre rue sur rundata.re/collecte/saint-paul.");
    expect(sp.resume).toContain("collecte des déchets : le jour de votre rue sur rundata.re/collecte/saint-paul");
    expect(resume(pageOf("saint-denis")!, {} as never, NOW).collecte_dechets?.texte).toBe("Collecte des déchets : le jour de votre rue sur rundata.re/collecte/saint-denis.");
    expect(resume(pageOf("le-tampon")!, {} as never, NOW).collecte_dechets).toBeUndefined();
  });
});
